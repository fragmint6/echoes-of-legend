-- =============================================================
-- Echoes of Legend - migration 09
-- CRAZYGAMES ACCOUNTS: real identities for portal players
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Run migration 03 first (or at the same
-- time): this revises the try_match() that 03 defines.
--
-- WHY THIS EXISTS
--
--   The portal build signed in ANONYMOUSLY. That was enough for the
--   Daily Puzzle (which only needs some auth.uid() to key a ledger
--   on) but it is not an account:
--
--     - the uid is per-browser, so clearing cookies loses everything;
--     - ensureProfile() skips anonymous sessions, so there is no
--       `profiles` row and try_match() falls back to 'Player' -
--       EVERY portal opponent would be called "Player";
--     - nothing links it to the CrazyGames player it belongs to.
--
--   So multiplayer was hidden on the portal build. This migration is
--   what makes it honest: a CrazyGames player gets a REAL, STABLE
--   Supabase user keyed on their CrazyGames id, carrying their real
--   username, and multiplayer works with no other change.
--
-- THE SECURITY BOUNDARY - READ THIS BEFORE EDITING
--
--   The SDK exposes `__dangerousUserId`. It is named that because it
--   is FORGEABLE: anyone can type it in the console. It must never
--   authenticate anything, and it is not used here or anywhere in
--   the client.
--
--   The only trustworthy identifier is getUserToken(): a JWT signed
--   by CrazyGames with RS256. It is verified by the Edge Function
--   (supabase/functions/cg-auth) against the public key at
--   https://sdk.crazygames.com/publicKey.json - SERVER SIDE, never
--   in the browser, and never stored.
--
--   Nothing in this file trusts the client. `cg_link` is written
--   only by the Edge Function using the service-role key, and has
--   NO insert/update policy at all: the browser physically cannot
--   claim a CrazyGames id it does not own.
-- =============================================================

-- ============ the link table ============
-- One row per CrazyGames account: which auth.users row is theirs.
-- `cg_user_id` is CrazyGames' id for the player, taken from the
-- VERIFIED token payload (never from the client).
create table if not exists public.cg_link (
  cg_user_id  text        primary key,
  user_id     uuid        not null unique references auth.users(id) on delete cascade,
  username    text        not null default 'Player',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists cg_link_user_id_idx on public.cg_link(user_id);

-- RLS on, and DELIBERATELY no insert/update/delete policy.
-- The Edge Function uses the service-role key, which bypasses RLS.
-- A browser gets nothing but its own row, read-only.
alter table public.cg_link enable row level security;

drop policy if exists "own link readable" on public.cg_link;
create policy "own link readable" on public.cg_link
  for select using (auth.uid() = user_id);

-- ============ profiles: mark portal accounts ============
-- Lets the UI (and any future moderation) tell a CrazyGames-backed
-- account from an email one without joining cg_link every time.
alter table public.profiles
  add column if not exists is_portal boolean not null default false;

-- =============================================================
-- try_match(), revised: portal players must not all be "Player"
-- -------------------------------------------------------------
-- Unchanged except for the name lookup. Previously:
--
--   select coalesce(handle, 'Player') into my_name from profiles ...
--
-- If the profiles row was missing - which it ALWAYS was for a portal
-- player, because ensureProfile() skips anonymous sessions - the
-- select found nothing, my_name stayed null, and both the queue row
-- and the match row recorded the literal string 'Player'.
--
-- Now the CrazyGames username is used as the fallback before the
-- generic default, so an opponent sees a real name even if the
-- profile upsert has not landed yet (first match of a new account,
-- or a transient RLS/network failure on the upsert).
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

  perform sweep_matches();

  -- profiles first, then the verified CrazyGames username, then the
  -- generic default. nullif() keeps an empty handle from winning.
  select nullif(p.handle, '') into my_name from profiles p where p.id = me;
  if my_name is null then
    select nullif(l.username, '') into my_name from cg_link l where l.user_id = me;
  end if;
  my_name := coalesce(my_name, 'Player');

  -- rejoin path: an existing live match wins over queueing
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
    values (me, my_name, p_mode)
    on conflict (user_id) do update set joined_at = now(), mode = excluded.mode;
    return;
  end if;

  delete from mp_queue where user_id in (waiting.user_id, me);

  insert into mp_matches(mode, seed, p1, p2, p1_name, p2_name, phase)
  values (p_mode,
          (floor(random() * 2147483647))::bigint,
          waiting.user_id, me,
          waiting.handle, my_name,
          case when p_mode = 'classic' then 'ban' else 'draft' end)
  returning id into new_id;

  return query select * from mp_matches where id = new_id;
end;
$$;

grant execute on function public.try_match(text) to authenticated;

-- =============================================================
-- OPTIONAL CLEANUP - the anonymous rows the old portal build left
-- -------------------------------------------------------------
-- Every portal visitor used to create an anonymous auth.users row
-- that nothing can ever sign back into. They are harmless but they
-- accumulate. Count them first:
--
--   select count(*) from auth.users where is_anonymous;
--
-- Then, if you are happy to drop them (this also drops their saves
-- and Daily attempts via the cascades):
--
--   delete from auth.users u
--    where u.is_anonymous
--      and not exists (select 1 from public.cg_link l where l.user_id = u.id);
--
-- The `not exists` guard is what keeps a migrated portal player -
-- whose anonymous row was ADOPTED and is no longer really anonymous
-- to us - from being deleted along with the litter.
-- =============================================================

-- =============================================================
-- Done. Verify with:  node sim/preflight.js
-- =============================================================
