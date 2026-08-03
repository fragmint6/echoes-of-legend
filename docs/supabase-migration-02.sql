-- =============================================================
-- Echoes of Legend - migration 02
-- MATCH LIFECYCLE: heartbeats, abandonment cleanup, rejoin
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
--
-- THE PROBLEM THIS SOLVES
--
--   A match row was created and then never touched again. Both
--   players closing the tab left an `active` row in the database
--   forever, and because try_match() returns your existing active
--   match before it looks at the queue, that ghost row would keep
--   pulling you back into a game nobody was playing.
--
-- THE APPROACH
--
--   Each client writes a heartbeat every few seconds. A match whose
--   BOTH heartbeats have gone quiet is abandoned and gets closed. A
--   match where one side is still beating stays open, so the player
--   who dropped can rejoin - which is the difference between a
--   crash costing you a match and costing you nothing.
--
--   Cleanup is lazy: it runs inside try_match(), which every player
--   calls before queueing. No cron job, no Edge Function, nothing
--   to keep running. The table cleans itself as it is used.
-- =============================================================

-- ---------- heartbeat columns ----------
alter table public.mp_matches
  add column if not exists p1_seen timestamptz not null default now(),
  add column if not exists p2_seen timestamptz not null default now();

-- `status` now carries meaning:
--   active    - being played
--   done      - finished normally, or conceded
--   abandoned - both sides went quiet
create index if not exists mp_matches_seen_idx
  on public.mp_matches (status, p1_seen, p2_seen);


-- =============================================================
-- touch_match: "I am still here"
-- -------------------------------------------------------------
-- Called every few seconds by whichever client is in the match. It
-- can only ever update the caller's OWN timestamp, which is why it
-- is safe to expose - you cannot use it to keep someone else's
-- match alive or to pretend an opponent is still present.
-- =============================================================
create or replace function public.touch_match(p_match uuid)
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
  update mp_matches
     set p1_seen = case when p1 = me then now() else p1_seen end,
         p2_seen = case when p2 = me then now() else p2_seen end
   where id = p_match
     and status = 'active'
     and (p1 = me or p2 = me);
end;
$$;

grant execute on function public.touch_match(uuid) to authenticated;


-- =============================================================
-- end_match: finish or concede
-- -------------------------------------------------------------
-- Marks a match done so it stops being returned as "your active
-- match". Either participant may call it: a forfeit is a legitimate
-- end, and if one player closes the tab the other should still be
-- able to close the books.
--
-- Deliberately records NO winner. Nothing reads a result yet, and a
-- client-reported winner would be worthless for a ladder anyway -
-- that has to be server-verified when trophies arrive.
-- =============================================================
create or replace function public.end_match(p_match uuid)
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
  update mp_matches
     set status = 'done'
   where id = p_match
     and (p1 = me or p2 = me);
end;
$$;

grant execute on function public.end_match(uuid) to authenticated;


-- =============================================================
-- sweep_matches: close what nobody is playing
-- -------------------------------------------------------------
-- Both heartbeats older than the grace window means both players
-- are gone: the match is abandoned. One fresh heartbeat means
-- somebody is still sitting there, so it is left alone and the
-- absent player can rejoin.
--
-- ALSO clears stale queue rows, which had the same leak: a player
-- who closed the tab while searching stayed in the queue forever
-- and the next player would be paired against a ghost.
-- =============================================================
create or replace function public.sweep_matches()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 90s: long enough to survive a reload or a phone locking, short
  -- enough that a truly dead match clears before you queue again.
  update mp_matches
     set status = 'abandoned'
   where status = 'active'
     and p1_seen < now() - interval '90 seconds'
     and p2_seen < now() - interval '90 seconds';

  -- a queue entry with no live client behind it
  delete from mp_queue
   where joined_at < now() - interval '90 seconds';
end;
$$;

grant execute on function public.sweep_matches() to authenticated;


-- =============================================================
-- try_match, revised
-- -------------------------------------------------------------
-- Two changes:
--   1. It sweeps first, so a ghost match or a ghost queue row can
--      never block a real pairing.
--   2. Returning your existing active match is now the REJOIN path,
--      and it only returns matches that are genuinely still live.
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

  -- clear abandoned matches and dead queue rows before doing anything
  perform sweep_matches();

  select coalesce(handle, 'Player') into my_name from profiles where id = me;

  -- Already in a live match? Return it. This is the rejoin path: a
  -- player who crashed or closed the tab lands straight back in the
  -- game they were already playing.
  return query
    select * from mp_matches
     where status = 'active' and (p1 = me or p2 = me)
     limit 1;
  if found then
    return;
  end if;

  select * into waiting
    from mp_queue
   where mode = p_mode and user_id <> me
   order by joined_at
   for update skip locked
   limit 1;

  if waiting.user_id is null then
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
-- find_my_match: the rejoin lookup
-- -------------------------------------------------------------
-- Called on page load. If you are in a live match, this returns it
-- and the client drops you back in. Sweeps first so a match both
-- players abandoned does not drag you back into a dead game.
-- =============================================================
create or replace function public.find_my_match()
returns setof public.mp_matches
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
  perform sweep_matches();
  return query
    select * from mp_matches
     where status = 'active' and (p1 = me or p2 = me)
     order by created_at desc
     limit 1;
end;
$$;

grant execute on function public.find_my_match() to authenticated;

-- =============================================================
-- Done. Verify with:  node sim/preflight.js
-- =============================================================
