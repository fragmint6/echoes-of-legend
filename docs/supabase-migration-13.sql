-- =============================================================
-- Echoes of Legend - migration 13
-- REAL INVITES: the invitee is actually told
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires migrations 02 and 11.
--
-- WHY THIS EXISTS
--
--   "Invite by callsign" did not invite anybody. It called
--   player_exists(), and on `true` told the INVITER "Found Bob. Send
--   them the code ABC123." - leaving them to deliver it by some other
--   app. The invitee was never contacted, so the feature was a
--   spellchecker for names.
--
--   Now the invite is delivered in-game: a row here, which the
--   invitee's client is already positioned to see because it polls
--   for rooms and matches anyway.
--
-- ONLY WHEN THEY CAN ACTUALLY PLAY
--
--   An invite must not interrupt someone mid-battle. send_invite()
--   refuses if the target is in a live match and says so, so the
--   inviter is told "that player is in a game" rather than being left
--   to wonder why nothing happened. Being in a ROOM is not busy - you
--   can leave a lobby to accept a better offer.
--
--   "In a game" is decided by the same mp_matches row everything else
--   uses, so it cannot drift out of step with reality.
--
-- WHY NOT REALTIME BROADCAST
--
--   Broadcast is fire-and-forget and only reaches clients already
--   subscribed to the channel (see the pairing fix in js/mp.js). The
--   invitee is on the main menu and subscribed to nothing. A row is
--   the right primitive: it survives the gap between "sent" and "the
--   other client next looks", which is exactly the case an invite has
--   to cover.
-- =============================================================


-- ============ the invite ============
create table if not exists public.mp_invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                         -- the room to join
  from_user   uuid not null references auth.users(id) on delete cascade,
  from_name   text not null,
  to_user     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- 'sent' | 'seen' | 'declined'. Accepting just joins the room, so
  -- there is no 'accepted' state to keep in step with the room itself.
  status      text not null default 'sent'
);

-- The invitee's poll is "anything for me, newest first".
create index if not exists mp_invites_to_idx
  on public.mp_invites(to_user, created_at desc);

-- One live invite per pair. Re-inviting refreshes the existing row
-- rather than stacking duplicate toasts on the invitee's screen.
create unique index if not exists mp_invites_pair_idx
  on public.mp_invites(from_user, to_user);

alter table public.mp_invites enable row level security;

-- You may read invites addressed to you, or ones you sent (so the
-- inviter can see it was declined). No client writes at all: the
-- definer functions below are the only way in.
drop policy if exists "read my invites" on public.mp_invites;
create policy "read my invites" on public.mp_invites
  for select using (auth.uid() = to_user or auth.uid() = from_user);


-- =============================================================
-- sweep_invites: an invite is a moment, not a message
-- -------------------------------------------------------------
-- Two minutes. Long enough to cross a room and click, short enough
-- that nobody is dragged into a game they were asked about while they
-- were away. Nothing schedules this; it is called at the top of the
-- functions below, the same pattern try_match() uses for the queue.
-- =============================================================
create or replace function public.sweep_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from mp_invites where created_at < now() - interval '2 minutes';
end;
$$;

grant execute on function public.sweep_invites() to authenticated;


-- =============================================================
-- send_invite: by callsign, with a reason when it cannot be done
-- -------------------------------------------------------------
-- Returns a short status the UI can speak plainly:
--
--   'sent'      - delivered; their client will show it
--   'no_player' - no account by that callsign
--   'busy'      - they are in a live match
--   'self'      - you invited yourself
--   'no_room'   - you are not the leader of an open room
--
-- Deliberately NOT a boolean: "it didn't work" with no reason is the
-- thing that made the old flow so unhelpful.
-- =============================================================
create or replace function public.send_invite(p_handle text, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  my_name text;
  target  uuid;
  r       mp_rooms%rowtype;
begin
  if me is null then
    return 'no_player';
  end if;

  perform sweep_invites();

  select id into target
    from profiles
   where lower(handle) = lower(btrim(p_handle))
   limit 1;

  if target is null then
    return 'no_player';
  end if;
  if target = me then
    return 'self';
  end if;

  -- You must actually own an open room to invite anyone into it.
  -- Checked server-side: a crafted call cannot invite people into a
  -- room the caller does not lead.
  select * into r
    from mp_rooms
   where code = upper(btrim(p_code))
     and leader = me
     and status = 'open';
  if r.code is null then
    return 'no_room';
  end if;

  -- In a live match? Do not interrupt them.
  if exists (
    select 1 from mp_matches
     where status = 'active'
       and (p1 = target or p2 = target)
  ) then
    return 'busy';
  end if;

  select coalesce(handle, 'Player') into my_name from profiles where id = me;

  insert into mp_invites(code, from_user, from_name, to_user, status)
  values (upper(btrim(p_code)), me, coalesce(my_name, 'Player'), target, 'sent')
  on conflict (from_user, to_user) do update
    set code = excluded.code,
        from_name = excluded.from_name,
        created_at = now(),
        status = 'sent';

  return 'sent';
end;
$$;

grant execute on function public.send_invite(text, text) to authenticated;


-- =============================================================
-- my_invites: what the invitee's client polls
-- -------------------------------------------------------------
-- Returns only invites still worth showing: fresh, addressed to me,
-- not already dismissed, and pointing at a room that is still open
-- with a free seat. That last join is what stops a player being shown
-- a toast for a party that has already started or filled up.
-- =============================================================
create or replace function public.my_invites()
returns table (
  id        uuid,
  code      text,
  from_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sweep_invites();
  return query
    select i.id, i.code, i.from_name, i.created_at
      from mp_invites i
      join mp_rooms r on r.code = i.code
     where i.to_user = auth.uid()
       and i.status = 'sent'
       and r.status = 'open'
       and r.guest is null
     order by i.created_at desc
     limit 5;
end;
$$;

grant execute on function public.my_invites() to authenticated;


-- =============================================================
-- answer_invite: dismiss or decline
-- -------------------------------------------------------------
-- Accepting is just join_room(code) - the room is the authority on
-- whether there is still a seat, and duplicating that decision here
-- would create two answers to one question.
-- =============================================================
create or replace function public.answer_invite(p_invite uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_answer = 'declined' then
    update mp_invites set status = 'declined'
     where id = p_invite and to_user = auth.uid();
  else
    -- 'seen': stop re-showing it without telling the inviter anything
    update mp_invites set status = 'seen'
     where id = p_invite and to_user = auth.uid();
  end if;
end;
$$;

grant execute on function public.answer_invite(uuid, text) to authenticated;
