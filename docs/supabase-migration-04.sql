-- =============================================================
-- Echoes of Legend - migration 04
-- OFFICIAL DAILY PUZZLE: browser forge + one atomic attempt
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- No external worker is required. At 6:55 AM America/New_York, every
-- signed-in browser asks for a short generation lease. Exactly one wins,
-- runs the existing JavaScript AI forge in a Web Worker, and submits the
-- validated position. pg_cron publishes it at 7:00. If nobody is online,
-- the first player who opens Daily Puzzles later receives the lease and
-- the position publishes as soon as generation finishes.
--
-- `slot` can only be active or staged and is unique, so daily_puzzles can
-- physically hold at most two positions. Publishing deletes the old active
-- row and its attempts, promotes staged, and leaves one position.
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

-- Tiny coordination rows, not puzzle positions. A crashed browser's lease
-- expires and another signed-in browser may continue the job.
create table if not exists public.daily_puzzle_jobs (
  puzzle_day date primary key,
  token uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  leased_at timestamptz not null default now(),
  lease_until timestamptz not null
);

alter table public.daily_puzzles enable row level security;
alter table public.daily_puzzle_attempts enable row level security;
alter table public.daily_puzzle_jobs enable row level security;

-- No direct table access. Every operation goes through the narrow RPCs.
revoke all on table public.daily_puzzles from anon, authenticated;
revoke all on table public.daily_puzzle_attempts from anon, authenticated;
revoke all on table public.daily_puzzle_jobs from anon, authenticated;

-- Remove the short-lived external-worker prototype if migration 04 was
-- pasted before the browser-lease design replaced it.
drop function if exists public.stage_daily_puzzle(jsonb, jsonb, text, date);


-- =============================================================
-- publish_daily_puzzle
-- Promotes only at 7:00 AM New York time unless an overdue browser
-- submission explicitly forces it. Promotion and attempt reset are atomic.
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
  staged_day date;
begin
  perform pg_advisory_xact_lock(hashtext('eol.daily-puzzle.publish'));

  if not p_force and extract(hour from local_now)::integer <> 7 then
    return null;
  end if;

  select id, puzzle_day
    into staged_id, staged_day
    from public.daily_puzzles
   where slot = 'staged'
     and puzzle_day <= local_now::date
   order by generated_at desc
   limit 1
   for update;

  -- Generation can recover after reset. Until it does, keep the old row in
  -- storage but status/claim RPCs hide it because its puzzle_day is stale.
  if staged_id is null then
    return null;
  end if;

  delete from public.daily_puzzles where slot = 'active';
  update public.daily_puzzles
     set slot = 'active', published_at = now()
   where id = staged_id;
  delete from public.daily_puzzles where id <> staged_id;
  delete from public.daily_puzzle_jobs where puzzle_day <= staged_day;
  return staged_id;
end;
$$;

revoke all on function public.publish_daily_puzzle(boolean) from public, anon, authenticated;
grant execute on function public.publish_daily_puzzle(boolean) to service_role;


-- =============================================================
-- claim_daily_generation
-- At 6:55-6:59 Eastern, one idle signed-in browser receives tomorrow's
-- lease. `p_recover` is used when the Daily card finds no current puzzle;
-- it allows the first visitor after a missed reset to generate immediately.
-- =============================================================
create or replace function public.claim_daily_generation(p_recover boolean default false)
returns table (token uuid, puzzle_day date)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  local_now timestamp := timezone('America/New_York', now());
  service_day date;
  target_day date;
  in_window boolean;
  new_token uuid := gen_random_uuid();
begin
  if me is null then
    return;
  end if;

  service_day := local_now::date -
    case when extract(hour from local_now)::integer < 7 then 1 else 0 end;
  in_window := extract(hour from local_now)::integer = 6
    and extract(minute from local_now)::integer >= 55;

  if in_window then
    target_day := local_now::date;
  elsif p_recover then
    target_day := service_day;
  else
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('eol.daily-puzzle.generate'));

  if exists (
    select 1 from public.daily_puzzles p
     where p.puzzle_day = target_day and p.slot in ('active', 'staged')
  ) then
    return;
  end if;

  -- A completed/failed old lease never blocks another day or another try.
  delete from public.daily_puzzle_jobs j
   where j.lease_until <= now() or j.puzzle_day < target_day;

  if exists (
    select 1 from public.daily_puzzle_jobs j
     where j.puzzle_day = target_day and j.lease_until > now()
  ) then
    return;
  end if;

  insert into public.daily_puzzle_jobs(puzzle_day, token, user_id, lease_until)
  values (target_day, new_token, me, now() + interval '3 minutes')
  on conflict (puzzle_day) do update
    set token = excluded.token,
        user_id = excluded.user_id,
        leased_at = now(),
        lease_until = excluded.lease_until
    where public.daily_puzzle_jobs.lease_until <= now();

  if found then
    return query select new_token, target_day;
  end if;
end;
$$;

revoke all on function public.claim_daily_generation(boolean) from public, anon;
grant execute on function public.claim_daily_generation(boolean) to authenticated;


-- =============================================================
-- submit_daily_candidate
-- The lease owner may submit one structurally valid engine checkpoint.
-- The position is generated by trusted shipped code but still receives
-- server-side shape/range checks before it can become the shared board.
-- =============================================================
create or replace function public.submit_daily_candidate(
  p_token uuid,
  p_puzzle_day date,
  p_payload jsonb,
  p_metrics jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  local_now timestamp := timezone('America/New_York', now());
  service_day date;
  b jsonb := p_payload->'position'->'battle';
begin
  if me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('eol.daily-puzzle.generate'));

  perform 1 from public.daily_puzzle_jobs
   where puzzle_day = p_puzzle_day
     and token = p_token
     and user_id = me
     and lease_until > now()
   for update;
  if not found then
    raise exception 'daily_generation_lease_expired';
  end if;

  if p_payload is null
     or p_payload->>'v' <> '1'
     or p_payload->'position'->>'v' <> '1'
     or b is null
     or b->>'turn' <> 'player'
     or coalesce((b->>'round')::integer, 0) not between 5 and 8
     or jsonb_typeof(b->'units') <> 'array'
     or jsonb_array_length(b->'units') <> 12
     or b->>'field' is null then
    raise exception 'invalid daily puzzle payload';
  end if;

  delete from public.daily_puzzles where slot = 'staged';
  insert into public.daily_puzzles(slot, puzzle_day, payload, metrics, build_sha)
  values ('staged', p_puzzle_day, p_payload, coalesce(p_metrics, '{}'::jsonb), 'browser')
  returning id into new_id;
  delete from public.daily_puzzle_jobs where puzzle_day = p_puzzle_day;

  service_day := local_now::date -
    case when extract(hour from local_now)::integer < 7 then 1 else 0 end;
  if p_puzzle_day <= service_day then
    perform public.publish_daily_puzzle(true);
  end if;

  return new_id;
end;
$$;

revoke all on function public.submit_daily_candidate(uuid, date, jsonb, jsonb)
  from public, anon;
grant execute on function public.submit_daily_candidate(uuid, date, jsonb, jsonb)
  to authenticated;


-- =============================================================
-- daily_puzzle_status
-- Metadata only: viewing the card never consumes an attempt or reveals the
-- board. Before 7 AM the current service day is yesterday; at 7 it changes.
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
           (a.user_id is not null),
           (a.finished_at is not null),
           a.won
      from public.daily_puzzles p
      left join public.daily_puzzle_attempts a
        on a.puzzle_id = p.id and a.user_id = me
     where p.slot = 'active' and p.puzzle_day = service_day
     limit 1;
end;
$$;

revoke all on function public.daily_puzzle_status() from public;
grant execute on function public.daily_puzzle_status() to anon, authenticated;


-- =============================================================
-- claim_daily_puzzle
-- The insert and board return happen in one transaction. The primary key
-- rejects a second tab/device. Opening the battle consumes the attempt.
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
  local_now timestamp := timezone('America/New_York', now());
  service_day date;
  p public.daily_puzzles%rowtype;
  inserted integer := 0;
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


-- Both UTC forms of 7:00 America/New_York. The function's local wall-clock
-- guard makes one publish and the other a no-op across daylight saving.
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
