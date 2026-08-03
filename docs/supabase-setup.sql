-- =============================================================
-- Echoes of Legend - complete Supabase setup
-- -------------------------------------------------------------
-- Paste ALL of this into: Dashboard -> SQL Editor -> New query -> Run.
--
-- Safe to run more than once. Every statement is idempotent:
-- `create ... if not exists`, `create or replace`, and policies are
-- dropped before being recreated. Running it twice changes nothing,
-- so if you are unsure whether a previous attempt half-finished,
-- just run the whole file again.
--
-- Verify afterwards with:  node sim/preflight.js
-- =============================================================

-- ============ profiles ============
-- One row per player. Supplies the display name your opponent sees.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  handle      text not null default 'Player',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ============ matchmaking queue ============
-- A player waiting for an opponent. Rows are short-lived: try_match()
-- deletes both the moment a pair is made.
create table if not exists public.mp_queue (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  handle     text not null default 'Player',
  mode       text not null default 'draft',
  joined_at  timestamptz not null default now()
);

-- ============ matches ============
-- `seed` is the shared source of randomness: both clients build the
-- identical draft packs, battlefield and battle luck from it, which is
-- why almost nothing else has to cross the wire.
create table if not exists public.mp_matches (
  id         uuid primary key default gen_random_uuid(),
  mode       text not null default 'draft',
  seed       bigint not null,
  p1         uuid not null references auth.users(id) on delete cascade,
  p2         uuid not null references auth.users(id) on delete cascade,
  p1_name    text,
  p2_name    text,
  status     text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists mp_matches_players_idx on public.mp_matches(p1, p2, status);

-- ============ ladders ============
-- Table only. NOTHING writes it yet, deliberately: trophy updates have
-- to be server-side or players can award themselves rank.
create table if not exists public.ladders (
  user_id    uuid not null references auth.users(id) on delete cascade,
  mode       text not null,
  trophies   int  not null default 0,
  rank_tier  text not null default 'bronze',
  primary key (user_id, mode)
);
create index if not exists ladders_board_idx on public.ladders(mode, trophies desc);


-- =============================================================
-- MATCHMAKING
-- -------------------------------------------------------------
-- The whole reason this needs a database rather than broadcast
-- messages: `for update skip locked` makes pairing ATOMIC, so two
-- clients calling at the same instant can never claim the same
-- opponent. One of them takes the row, the other finds it locked,
-- skips it, and parks itself in the queue instead.
-- =============================================================
create or replace function public.try_match(p_mode text default 'draft')
returns setof public.mp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  my_name text;
  waiting mp_queue%rowtype;
  new_id  uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(handle, 'Player') into my_name from profiles where id = me;

  -- already in a live match? return it rather than queueing twice
  return query
    select * from mp_matches
     where status = 'active' and (p1 = me or p2 = me)
     limit 1;
  if found then
    return;
  end if;

  -- claim the oldest waiting opponent, locking the row so a second
  -- caller cannot take the same one
  select * into waiting
    from mp_queue
   where mode = p_mode and user_id <> me
   order by joined_at
   for update skip locked
   limit 1;

  if waiting.user_id is null then
    -- nobody waiting: park ourselves
    insert into mp_queue(user_id, handle, mode)
    values (me, coalesce(my_name, 'Player'), p_mode)
    on conflict (user_id) do update set joined_at = now(), mode = excluded.mode;
    return;
  end if;

  delete from mp_queue where user_id in (waiting.user_id, me);

  insert into mp_matches(mode, seed, p1, p2, p1_name, p2_name)
  values (p_mode,
          (floor(random() * 2147483647))::bigint,
          waiting.user_id, me,
          waiting.handle, coalesce(my_name, 'Player'))
  returning id into new_id;

  return query select * from mp_matches where id = new_id;
end;
$$;

grant execute on function public.try_match(text) to authenticated;


-- =============================================================
-- ROW LEVEL SECURITY
-- -------------------------------------------------------------
-- This is what makes the publishable key safe to ship in browser
-- code. Without it that key could read and edit every row.
-- =============================================================
alter table public.profiles   enable row level security;
alter table public.mp_queue   enable row level security;
alter table public.mp_matches enable row level security;
alter table public.ladders    enable row level security;

-- profiles: world-readable (an opponent's name must be visible),
-- writable only by their owner
drop policy if exists "profiles readable"  on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "profiles readable"  on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- queue: you may only see and cancel your OWN entry. There is
-- deliberately no insert policy - joining goes through try_match(),
-- which is security definer, so nobody can stuff the queue directly.
drop policy if exists "own queue row" on public.mp_queue;
drop policy if exists "leave queue"   on public.mp_queue;
create policy "own queue row" on public.mp_queue for select using (auth.uid() = user_id);
create policy "leave queue"   on public.mp_queue for delete using (auth.uid() = user_id);

-- matches: readable only by the two players in them, and created only
-- by the function above
drop policy if exists "own matches" on public.mp_matches;
create policy "own matches" on public.mp_matches
  for select using (auth.uid() = p1 or auth.uid() = p2);

-- ladders: readable by all, written by nobody from the client
drop policy if exists "ladders readable" on public.ladders;
create policy "ladders readable" on public.ladders for select using (true);


-- =============================================================
-- Done. Now:
--   1. Database -> Replication (or Realtime): make sure Realtime is on.
--   2. Authentication -> Sign In / Providers -> Email: while testing,
--      turn "Confirm email" OFF so accounts work without an inbox.
--   3. node sim/preflight.js   -> should print READY.
-- =============================================================
