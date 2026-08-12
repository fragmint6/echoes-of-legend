-- =============================================================
-- Echoes of Legend - migration 05
-- DAILY PUZZLE RPC AMBIGUITY HOTFIX
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- Migration 04 originally used ON CONFLICT (puzzle_day) and
-- ON CONFLICT (puzzle_id, user_id) inside RETURNS TABLE PL/pgSQL
-- functions. Those names are also output variables, so PostgreSQL rejects
-- the RPC at runtime as ambiguous. Name the primary-key constraints instead.
-- =============================================================

begin;

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
  on conflict on constraint daily_puzzle_jobs_pkey do update
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
  on conflict on constraint daily_puzzle_attempts_pkey do nothing;
  get diagnostics inserted = row_count;
  if inserted <> 1 then
    raise exception 'daily_attempt_used';
  end if;

  return query select p.id, p.puzzle_day, p.published_at, p.payload, p.metrics;
end;
$$;

revoke all on function public.claim_daily_puzzle() from public, anon;
grant execute on function public.claim_daily_puzzle() to authenticated;

commit;
