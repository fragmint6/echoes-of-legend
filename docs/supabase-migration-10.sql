-- =============================================================
-- Echoes of Legend - migration 10
-- SOLVING THE DAILY PUZZLE CLOSES THE DAY
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires migration 07 (the two-attempt
-- Daily Puzzle ledger) to have been run first.
--
-- WHY THIS EXISTS
--
--   The Daily Puzzle grants two attempts at one shared position. The
--   second attempt exists for a player who LOST - another crack at the
--   same board before the 7:00 AM Eastern reset.
--
--   It was also being handed to players who had already WON. That is
--   wrong on its own terms (the puzzle is solved; there is nothing left
--   to attempt) and it quietly corrupts any ranking built on the
--   attempt rows: `final_round` is recorded per attempt, so a solver
--   who replays a position they have already beaten can shave rounds
--   off a board whose solution they now know, while a solver who
--   stopped at their first win cannot. Two players with identical
--   skill would be separated by whether they bothered to re-fight a
--   puzzle they had finished.
--
--   claim_daily_puzzle() below now refuses a claim once any attempt on
--   that puzzle has won, and daily_puzzle_status() reports
--   attempts_remaining = 0 for a solved day so the client and the
--   server agree without the client having to special-case it.
--
--   Losing still leaves the second attempt exactly as before.
-- =============================================================

begin;

-- Status: a solved day reports no remaining attempts.
-- Everything else about this function is unchanged from migration 07.
drop function if exists public.daily_puzzle_status();
create function public.daily_puzzle_status()
returns table (
  puzzle_id uuid,
  puzzle_day date,
  published_at timestamptz,
  metrics jsonb,
  attempted boolean,
  finished boolean,
  won boolean,
  attempts_used integer,
  attempts_remaining integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  local_now timestamp := timezone('America/New_York', now());
  service_day date;
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  service_day := local_now::date -
    case when extract(hour from local_now)::integer < 7 then 1 else 0 end;

  return query
    select p.id,
           p.puzzle_day,
           p.published_at,
           p.metrics,
           coalesce(a.used, 0) >= 2,
           coalesce(a.all_finished, false),
           coalesce(a.any_won, false),
           coalesce(a.used, 0),
           -- A win closes the day: no attempts remain regardless of count.
           case
             when coalesce(a.any_won, false) then 0
             else greatest(0, 2 - coalesce(a.used, 0))
           end
      from public.daily_puzzles p
      left join lateral (
        select count(*)::integer as used,
               coalesce(bool_and(x.finished_at is not null), false) as all_finished,
               coalesce(bool_or(x.won is true), false) as any_won
          from public.daily_puzzle_attempts x
         where x.puzzle_id = p.id and x.user_id = me
      ) a on true
     where p.slot = 'active' and p.puzzle_day = service_day
     limit 1;
end;
$$;

revoke all on function public.daily_puzzle_status() from public;
grant execute on function public.daily_puzzle_status() to anon, authenticated;


-- Claim: refuse a second board once this player has already solved the
-- position. The advisory lock and the >= 2 cap from migration 07 stay
-- exactly as they were; the win check is evaluated under the same lock,
-- so two tabs cannot race a post-win claim through together.
drop function if exists public.claim_daily_puzzle();
create function public.claim_daily_puzzle()
returns table (
  puzzle_id uuid,
  puzzle_day date,
  published_at timestamptz,
  payload jsonb,
  metrics jsonb,
  attempt_no smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  local_now timestamp := timezone('America/New_York', now());
  service_day date;
  p public.daily_puzzles%rowtype;
  used integer := 0;
  already_won boolean := false;
  next_attempt smallint;
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  service_day := local_now::date -
    case when extract(hour from local_now)::integer < 7 then 1 else 0 end;

  select p0.* into p
    from public.daily_puzzles p0
   where p0.slot = 'active' and p0.puzzle_day = service_day
   limit 1
   for share;

  if p.id is null then
    raise exception 'daily_puzzle_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtext(p.id::text), hashtext(me::text));

  select count(*)::integer,
         coalesce(bool_or(a.won is true), false)
    into used, already_won
    from public.daily_puzzle_attempts a
   where a.puzzle_id = p.id and a.user_id = me;

  -- Solved days are closed. Checked before the count so the client gets
  -- the accurate reason rather than a generic "out of attempts".
  if already_won then
    raise exception 'daily_puzzle_solved';
  end if;

  if used >= 2 then
    raise exception 'daily_attempts_used';
  end if;

  next_attempt := (used + 1)::smallint;
  insert into public.daily_puzzle_attempts(puzzle_id, user_id, attempt_no)
  values (p.id, me, next_attempt);

  return query
    select p.id, p.puzzle_day, p.published_at, p.payload, p.metrics, next_attempt;
end;
$$;

revoke all on function public.claim_daily_puzzle() from public, anon;
grant execute on function public.claim_daily_puzzle() to authenticated;

commit;

-- =============================================================
-- Done. Verify with:  node sim/verify_daily_ui.js
-- =============================================================
