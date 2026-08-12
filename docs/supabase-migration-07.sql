-- =============================================================
-- Echoes of Legend - migration 07
-- DAILY PUZZLE: TWO ATTEMPTS PER PLAYER
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Existing attempt rows become attempt 1.
--
-- The board remains fixed for the service day. Each account may atomically
-- claim it twice; opening each battle consumes that numbered attempt.
-- =============================================================

begin;

alter table public.daily_puzzle_attempts
  add column if not exists attempt_no smallint;

update public.daily_puzzle_attempts
   set attempt_no = 1
 where attempt_no is null;

alter table public.daily_puzzle_attempts
  alter column attempt_no set default 1,
  alter column attempt_no set not null;

alter table public.daily_puzzle_attempts
  drop constraint if exists daily_puzzle_attempt_no_check;
alter table public.daily_puzzle_attempts
  add constraint daily_puzzle_attempt_no_check
  check (attempt_no between 1 and 2);

alter table public.daily_puzzle_attempts
  drop constraint if exists daily_puzzle_attempts_pkey;
alter table public.daily_puzzle_attempts
  add constraint daily_puzzle_attempts_pkey
  primary key (puzzle_id, user_id, attempt_no);


-- Return both the legacy summary fields and the explicit allowance. Older
-- clients interpret `attempted` as "no claim remains"; current clients paint
-- the exact used/remaining count.
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
           greatest(0, 2 - coalesce(a.used, 0))
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


-- Serialize claims per puzzle/account so two tabs cannot both receive the
-- same attempt number. The active puzzle row stays share-locked until the
-- claim commits, preventing reset publication from racing the return.
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

  select count(*)::integer into used
    from public.daily_puzzle_attempts a
   where a.puzzle_id = p.id and a.user_id = me;

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


-- Results belong to the numbered claim, not every attempt by this player.
drop function if exists public.finish_daily_attempt(uuid, boolean, integer);
drop function if exists public.finish_daily_attempt(uuid, smallint, boolean, integer);
create function public.finish_daily_attempt(
  p_puzzle uuid,
  p_attempt smallint,
  p_won boolean,
  p_rounds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;
  update public.daily_puzzle_attempts
     set finished_at = now(),
         won = p_won,
         final_round = greatest(1, least(coalesce(p_rounds, 1), 999))
   where puzzle_id = p_puzzle
     and user_id = me
     and attempt_no = p_attempt
     and finished_at is null;
end;
$$;

revoke all on function public.finish_daily_attempt(uuid, smallint, boolean, integer)
  from public, anon;
grant execute on function public.finish_daily_attempt(uuid, smallint, boolean, integer)
  to authenticated;

-- Compatibility for a tab that loaded the one-attempt client before this
-- migration deployed. Its three-argument report finishes the newest open
-- claim; current clients always use the numbered overload above.
create function public.finish_daily_attempt(
  p_puzzle uuid,
  p_won boolean,
  p_rounds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  latest_attempt smallint;
begin
  if me is null then
    return;
  end if;
  select max(a.attempt_no) into latest_attempt
    from public.daily_puzzle_attempts a
   where a.puzzle_id = p_puzzle
     and a.user_id = me
     and a.finished_at is null;
  if latest_attempt is not null then
    perform public.finish_daily_attempt(
      p_puzzle,
      latest_attempt,
      p_won,
      p_rounds
    );
  end if;
end;
$$;

revoke all on function public.finish_daily_attempt(uuid, boolean, integer)
  from public, anon;
grant execute on function public.finish_daily_attempt(uuid, boolean, integer)
  to authenticated;

commit;
