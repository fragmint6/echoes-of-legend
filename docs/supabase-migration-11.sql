-- =============================================================
-- Echoes of Legend - migration 11
-- PRIVATE ROOMS: invite links, invite by username, party leader
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires migrations 02, 03 and 09
-- (it creates matches through the same mp_matches shape they build).
--
-- WHY THIS EXISTS
--
--   Matchmaking so far has been a QUEUE: you ask for an opponent and
--   the server pairs you with a stranger. There has been no way to
--   play a specific person, and no way to choose the terms of the
--   game - mode, length, battlefield and draft pool were all either
--   fixed or rolled.
--
--   CrazyGames also REQUIRES rooms before the game may be listed on
--   their Multiplayer page: the client has to report a room id, a
--   joinable flag and invite parameters, and an "instant multiplayer"
--   launch has to drop the player straight into a private room they
--   own. A queue cannot express any of that, because a queue has no
--   identity until the moment it pairs.
--
--   So: a room is a real row that exists BEFORE an opponent does.
--   It has a code you can send someone, a leader who owns its
--   settings, and a lifecycle that ends by minting an ordinary
--   mp_matches row - which means everything downstream (the draft,
--   the heartbeat, resume, end_match) keeps working untouched.
--
-- THE CODE
--
--   Six characters from an unambiguous alphabet: no O/0, no I/1/L.
--   Short enough to read down a voice call, and the room is private
--   and short-lived, so guessing one is not a meaningful attack.
--   Uniqueness is enforced by the primary key, and the generator
--   retries on collision rather than trusting randomness.
-- =============================================================

-- ============ the room ============
create table if not exists public.mp_rooms (
  code        text primary key,
  leader      uuid not null references auth.users(id) on delete cascade,
  leader_name text,
  guest       uuid references auth.users(id) on delete set null,
  guest_name  text,
  -- The leader's choices. Held as one jsonb blob rather than a column
  -- per option because the option SET is still moving; the client
  -- validates, and nothing here is trusted for scoring.
  settings    jsonb not null default '{}'::jsonb,
  -- 'open'   - waiting for someone to join
  -- 'ready'  - both seats filled, leader may start
  -- 'closed' - started (match_id set) or abandoned
  status      text not null default 'open',
  match_id    uuid references public.mp_matches(id) on delete set null,
  created_at  timestamptz not null default now(),
  seen        timestamptz not null default now()
);

create index if not exists mp_rooms_leader_idx on public.mp_rooms(leader, status);
create index if not exists mp_rooms_guest_idx  on public.mp_rooms(guest, status);
create index if not exists mp_rooms_sweep_idx  on public.mp_rooms(status, seen);

alter table public.mp_rooms enable row level security;

-- A room is readable by the two people in it. Joining is done through
-- join_room() (security definer), so a stranger never needs to SELECT
-- a room by code - which also stops anyone enumerating open rooms.
drop policy if exists mp_rooms_read on public.mp_rooms;
create policy mp_rooms_read on public.mp_rooms
  for select using (auth.uid() = leader or auth.uid() = guest);

-- All writes go through the functions below.
drop policy if exists mp_rooms_no_write on public.mp_rooms;

grant select on public.mp_rooms to authenticated;


-- ============ housekeeping ============
-- Rooms are cheap but they must not accumulate. Anything untouched
-- for 30 minutes is dead: the tab was closed, the invite was never
-- accepted, or the leader wandered off.
create or replace function public.sweep_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from mp_rooms
   where seen < now() - interval '30 minutes';
end;
$$;


-- ============ code generation ============
create or replace function public.new_room_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- no O/0/I/1/L: these are the characters people mis-read and
  -- mis-type when a code is spoken aloud or written down
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
  tries int := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from mp_rooms where code = candidate);
    tries := tries + 1;
    if tries > 50 then
      raise exception 'could not allocate a room code';
    end if;
  end loop;
  return candidate;
end;
$$;


-- =============================================================
-- create_room
-- -------------------------------------------------------------
-- The party leader opens a room. One live room per leader: opening a
-- second closes the first, so a player who reloads or clicks twice
-- does not litter rooms that friends might still be trying to join.
-- =============================================================
create or replace function public.create_room(p_settings jsonb default '{}'::jsonb)
returns public.mp_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  my_name text;
  c       text;
  row_out public.mp_rooms;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  perform sweep_rooms();

  select coalesce(handle, 'Player') into my_name from profiles where id = me;

  -- retire any room this player already leads and has not started
  update mp_rooms set status = 'closed'
   where leader = me and status <> 'closed' and match_id is null;

  c := new_room_code();

  insert into mp_rooms(code, leader, leader_name, settings)
  values (c, me, coalesce(my_name, 'Player'), coalesce(p_settings, '{}'::jsonb))
  returning * into row_out;

  return row_out;
end;
$$;

grant execute on function public.create_room(jsonb) to authenticated;


-- =============================================================
-- join_room
-- -------------------------------------------------------------
-- Security definer because the joiner cannot SELECT the room yet:
-- they are not in it until this succeeds. The row is locked while we
-- look, so two people racing for the last seat cannot both win.
-- =============================================================
create or replace function public.join_room(p_code text)
returns public.mp_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  my_name text;
  r       public.mp_rooms;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  perform sweep_rooms();

  select coalesce(handle, 'Player') into my_name from profiles where id = me;

  select * into r
    from mp_rooms
   where code = upper(btrim(p_code))
   for update;

  if r.code is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if r.status = 'closed' then
    raise exception 'room closed' using errcode = 'P0003';
  end if;

  -- rejoining your own room is not an error: a reconnect lands here
  if r.leader = me or r.guest = me then
    update mp_rooms set seen = now() where code = r.code returning * into r;
    return r;
  end if;

  if r.guest is not null then
    raise exception 'room full' using errcode = 'P0004';
  end if;

  update mp_rooms
     set guest = me,
         guest_name = coalesce(my_name, 'Player'),
         status = 'ready',
         seen = now()
   where code = r.code
  returning * into r;

  return r;
end;
$$;

grant execute on function public.join_room(text) to authenticated;


-- =============================================================
-- set_room_settings
-- -------------------------------------------------------------
-- ONLY THE LEADER. This is the whole point of a party leader: one
-- person owns the terms of the game, so the two clients can never
-- disagree about what they are playing.
-- =============================================================
create or replace function public.set_room_settings(p_code text, p_settings jsonb)
returns public.mp_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r  public.mp_rooms;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  update mp_rooms
     set settings = coalesce(p_settings, '{}'::jsonb),
         seen = now()
   where code = upper(btrim(p_code))
     and leader = me
     and status <> 'closed'
  returning * into r;

  if r.code is null then
    raise exception 'not the party leader' using errcode = 'P0005';
  end if;

  return r;
end;
$$;

grant execute on function public.set_room_settings(text, jsonb) to authenticated;


-- =============================================================
-- touch_room / leave_room
-- -------------------------------------------------------------
-- The heartbeat and the exit. Leaving frees the guest seat rather
-- than destroying the room, so a leader whose friend disconnects can
-- simply wait for them to come back. A LEADER leaving closes it -
-- there is no succession, and a room with no owner has no settings.
-- =============================================================
create or replace function public.touch_room(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  update mp_rooms set seen = now()
   where code = upper(btrim(p_code))
     and (leader = me or guest = me);
end;
$$;

grant execute on function public.touch_room(text) to authenticated;


create or replace function public.leave_room(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r  public.mp_rooms;
begin
  select * into r from mp_rooms where code = upper(btrim(p_code)) for update;
  if r.code is null then
    return;
  end if;

  if r.leader = me then
    update mp_rooms set status = 'closed' where code = r.code;
  elsif r.guest = me then
    update mp_rooms
       set guest = null, guest_name = null,
           status = case when status = 'closed' then 'closed' else 'open' end,
           seen = now()
     where code = r.code;
  end if;
end;
$$;

grant execute on function public.leave_room(text) to authenticated;


-- =============================================================
-- start_room
-- -------------------------------------------------------------
-- The leader starts the game. This mints an ordinary mp_matches row,
-- which is what makes the whole feature cheap: the draft, the
-- heartbeat, save_match_state, resume and end_match are all reused
-- exactly as they are for queue matches. The room keeps the match id
-- so a client that reconnects to the ROOM can be sent on to the game.
--
-- The leader is p1, and p1 is the host - so the person who chose the
-- settings is also the authority for host-decided rolls. That is the
-- correct pairing and it falls out for free.
-- =============================================================
create or replace function public.start_room(p_code text)
returns public.mp_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  r      public.mp_rooms;
  new_id uuid;
  m      public.mp_matches;
  v_mode text;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select * into r from mp_rooms where code = upper(btrim(p_code)) for update;

  if r.code is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if r.leader <> me then
    raise exception 'not the party leader' using errcode = 'P0005';
  end if;

  -- Already started? Hand back the same match. The leader double
  -- clicking must not create two games.
  if r.match_id is not null then
    select * into m from mp_matches where id = r.match_id;
    if m.id is not null then
      return m;
    end if;
  end if;

  if r.guest is null then
    raise exception 'nobody has joined yet' using errcode = 'P0006';
  end if;

  -- mode comes from the leader's settings; anything unrecognised is a
  -- draft, matching try_match()'s own defaulting
  v_mode := coalesce(r.settings->>'mode', 'draft');
  if v_mode <> 'classic' then
    v_mode := 'draft';
  end if;

  insert into mp_matches(mode, seed, p1, p2, p1_name, p2_name)
  values (v_mode,
          (floor(random() * 2147483647))::bigint,
          r.leader, r.guest,
          coalesce(r.leader_name, 'Player'), coalesce(r.guest_name, 'Player'))
  returning id into new_id;

  update mp_rooms
     set match_id = new_id, status = 'closed', seen = now()
   where code = r.code;

  select * into m from mp_matches where id = new_id;
  return m;
end;
$$;

grant execute on function public.start_room(text) to authenticated;


-- =============================================================
-- find_my_room
-- -------------------------------------------------------------
-- Reconnect path: "am I in a room?". Mirrors find_my_match.
-- =============================================================
create or replace function public.find_my_room()
returns public.mp_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r  public.mp_rooms;
begin
  if me is null then
    return null;
  end if;
  select * into r
    from mp_rooms
   where (leader = me or guest = me)
     and status <> 'closed'
   order by created_at desc
   limit 1;
  return r;
end;
$$;

grant execute on function public.find_my_room() to authenticated;


-- =============================================================
-- player_exists
-- -------------------------------------------------------------
-- "Invite by username" without exposing the user table: the caller
-- passes a handle, and gets back only whether such a player exists.
-- The actual delivery is the room code, which the inviter sends
-- however they like. Deliberately does NOT return the user id.
-- =============================================================
create or replace function public.player_exists(p_handle text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
     where lower(handle) = lower(btrim(p_handle))
  );
$$;

grant execute on function public.player_exists(text) to authenticated;
