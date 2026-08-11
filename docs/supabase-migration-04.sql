-- =============================================================
-- Echoes of Legend - migration 04
-- OFFICIAL DAILY PUZZLE: staged publication + one atomic attempt
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- TIMING
--   A GitHub Actions worker generates tomorrow's checkpoint at 6:55 AM
--   America/New_York and calls stage_daily_puzzle(). pg_cron checks at
--   both possible 7:00 AM UTC equivalents (11:00 during EDT, 12:00
--   during EST); publish_daily_puzzle() only acts when New York's wall
--   clock really says 7. A delayed worker auto-publishes as soon as its
--   due position finishes, rather than losing the entire day.
--
-- STORAGE LAW
--   `slot` can only be active or staged and is unique, so the database
--   can physically hold at most two positions. Publishing deletes the
--   old active row (and its attempts), promotes staged, and leaves only
--   the new active row.
-- =============================================================

create extension if not exists pg_cron;

create table if not exists public.daily_puzzles (
  id uuid primary key default gen_random_uuid(),
  slot text not null unique check (slot in ('active', 'staged')),
  puzzle_day date not null,
  payload jsonb not null,
  metrics jsonb not null default '{}'::jsonb,
  build_sha text,
  generated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.daily_puzzle_attempts (
  puzzle_id uuid not null references public.daily_puzzles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  won boolean,
  final_round integer,
  primary key (puzzle_id, user_id)
);

alter table public.daily_puzzles enable row level security;
alter table public.daily_puzzle_attempts enable row level security;

-- No direct table access. Authenticated players use the narrow RPCs below;
-- the scheduled worker uses service_role only for staging.
revoke all on table public.daily_puzzles from anon, authenticated;
revoke all on table public.daily_puzzle_attempts from anon, authenticated;


-- =============================================================
-- publish_daily_puzzle
-- Promotes only at 7:00 AM New York time unless service_role explicitly
-- forces it. The transaction and advisory lock make promotion atomic.
-- =============================================================
create or replace function public.publish_daily_puzzle(p_force boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := timezone('America/New_York', now());
  staged_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('eol.daily-puzzle.publish'));

  if not p_force and extract(hour from local_now)::integer <> 7 then
    return null;
  end if;

  select id
    into staged_id
    from public.daily_puzzles
   where slot = 'staged'
     and puzzle_day <= local_now::date
   order by generated_at desc
   limit 1
   for update;

  -- If generation was late or failed, keep the existing puzzle live. A
  -- delayed stage call below will publish immediately once it is ready.
  if staged_id is null then
    return null;
  end if;

  delete from public.daily_puzzles where slot = 'active';
  update public.daily_puzzles
     set slot = 'active', published_at = now()
   where id = staged_id;

  -- Defensive cleanup. The slot check + unique constraint already cap the
  -- table at two rows, but this preserves the stronger post-reset law: one.
  delete from public.daily_puzzles where id <> staged_id;
  return staged_id;
end;
$$;

revoke all on function public.publish_daily_puzzle(boolean) from public, anon, authenticated;
grant execute on function public.publish_daily_puzzle(boolean) to service_role;


-- =============================================================
-- stage_daily_puzzle
-- Called only by the scheduled worker with the service-role secret.
-- Replaces an older staged row, so retries cannot create a third position.
-- If GitHub's scheduler ran late and 7:00 has passed, publish immediately.
-- =============================================================
create or replace function public.stage_daily_puzzle(
  p_payload jsonb,
  p_metrics jsonb,
  p_build_sha text,
  p_puzzle_day date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  local_now timestamp := timezone('America/New_York', now());
begin
  if p_payload is null
     or p_payload->>'v' <> '1'
     or p_payload->'position' is null
     or p_puzzle_day is null then
    raise exception 'invalid daily puzzle payload';
  end if;

  perform pg_advisory_xact_lock(hashtext('eol.daily-puzzle.stage'));
  delete from public.daily_puzzles where slot = 'staged';

  insert into public.daily_puzzles(slot, puzzle_day, payload, metrics, build_sha)
  values ('staged', p_puzzle_day, p_payload, coalesce(p_metrics, '{}'::jsonb), p_build_sha)
  returning id into new_id;

  if local_now::date >= p_puzzle_day
     and extract(hour from local_now)::integer >= 7 then
    perform public.publish_daily_puzzle(true);
  end if;

  return new_id;
end;
$$;

revoke all on function public.stage_daily_puzzle(jsonb, jsonb, text, date)
  from public, anon, authenticated;
grant execute on function public.stage_daily_puzzle(jsonb, jsonb, text, date)
  to service_role;


-- =============================================================
-- daily_puzzle_status
-- Metadata only: checking the card never consumes an attempt and never
-- reveals the board. `attempted` is scoped to auth.uid().
-- =============================================================
create or replace function public.daily_puzzle_status()
returns table (
  puzzle_id uuid,
  puzzle_day date,
  published_at timestamptz,
  metrics jsonb,
  attempted boolean,
  finished boolean,
  won boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
    select p.id,
           p.puzzle_day,
           p.published_at,
           p.metrics,
           (a.user_id is not null),
           (a.finished_at is not null),
           a.won
      from public.daily_puzzles p
      left join public.daily_puzzle_attempts a
        on a.puzzle_id = p.id and a.user_id = me
     where p.slot = 'active'
     limit 1;
end;
$$;

revoke all on function public.daily_puzzle_status() from public;
-- anon may invoke only so preflight receives the explicit auth error; the
-- function returns no metadata unless auth.uid() is present.
grant execute on function public.daily_puzzle_status() to anon, authenticated;


-- =============================================================
-- claim_daily_puzzle
-- The one-attempt gate. The insert and payload return happen in one DB
-- transaction. A second tab/device hits the primary key and receives no
-- board. Per owner decision, opening the battle consumes the attempt.
-- =============================================================
create or replace function public.claim_daily_puzzle()
returns table (
  puzzle_id uuid,
  puzzle_day date,
  published_at timestamptz,
  payload jsonb,
  metrics jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  p public.daily_puzzles%rowtype;
  inserted integer := 0;
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into p
    from public.daily_puzzles
   where slot = 'active'
   limit 1
   for share;

  if p.id is null then
    raise exception 'daily_puzzle_unavailable';
  end if;

  insert into public.daily_puzzle_attempts(puzzle_id, user_id)
  values (p.id, me)
  on conflict (puzzle_id, user_id) do nothing;
  get diagnostics inserted = row_count;

  if inserted <> 1 then
    raise exception 'daily_attempt_used';
  end if;

  return query select p.id, p.puzzle_day, p.published_at, p.payload, p.metrics;
end;
$$;

revoke all on function public.claim_daily_puzzle() from public, anon;
grant execute on function public.claim_daily_puzzle() to authenticated;


-- =============================================================
-- finish_daily_attempt
-- Records the result once. It cannot grant another attempt and currently
-- carries no reward/leaderboard authority; result verification comes later.
-- =============================================================
create or replace function public.finish_daily_attempt(
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
     and finished_at is null;
end;
$$;

revoke all on function public.finish_daily_attempt(uuid, boolean, integer) from public, anon;
grant execute on function public.finish_daily_attempt(uuid, boolean, integer) to authenticated;


-- Run at both UTC forms of 7:00 America/New_York. The function's local
-- wall-clock guard makes one call publish and the other a no-op across DST.
do $$
declare
  old_job bigint;
begin
  for old_job in
    select jobid from cron.job where jobname = 'eol-daily-puzzle-publish'
  loop
    perform cron.unschedule(old_job);
  end loop;
end;
$$;

select cron.schedule(
  'eol-daily-puzzle-publish',
  '0 11,12 * * *',
  $cron$select public.publish_daily_puzzle(false);$cron$
);
