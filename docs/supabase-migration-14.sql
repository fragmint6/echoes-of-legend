-- =============================================================
-- Echoes of Legend - migration 14
-- ONE USERNAME CHANGE PER WEEK, ENFORCED BY THE SERVER
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires supabase-setup.sql.
--
-- WHY THIS EXISTS
--
--   Renaming was unlimited, and the "Roll" button in Settings
--   turned a name into a slot machine: roll, roll, roll, save.
--   A callsign other players are meant to recognise cannot churn
--   like that. The rule is now one change every 7 days.
--
--   THE RULE HAS TO LIVE HERE, NOT IN THE BROWSER. "own profile
--   update" lets any signed-in client UPDATE its own profiles row
--   directly, so a limit implemented only in js/app.js is a
--   suggestion that anybody with the dev console open can ignore.
--   This migration moves handle writes behind set_handle() and
--   revokes the client's ability to write the column at all.
--
-- WHAT CHANGES
--
--   1. profiles.handle_changed_at - when the name last changed.
--      NULL means "never renamed since this migration", which is
--      treated as eligible, so nobody is locked out on day one.
--   2. set_handle(text) - the only way to rename. Validates the
--      format, enforces the 7-day cooldown, and reports the
--      cooldown as a real error the UI can show.
--   3. handle_status() - how long until the next rename is
--      allowed, so Settings can say so before the player types.
--   4. The update policy no longer lets a client change `handle`
--      or `handle_changed_at` by hand. Everything else on the row
--      (the avatar) still updates normally.
--   5. A unique index on lower(handle). setHandle() has always
--      claimed to report "that username is taken" on a 23505, but
--      no constraint existed to raise one, so two players could
--      hold the same callsign. Now the claim is true.
--
-- ON EXISTING NAMES
--
--   Nothing is renamed and nothing is reset. Accounts keep the
--   name they have; only the RATE of future changes is limited.
-- =============================================================


-- ============ 1. when the name last changed ============
alter table public.profiles
  add column if not exists handle_changed_at timestamptz;

-- Backfill is deliberately NOT done. Leaving it NULL means every
-- existing player is free to make one change immediately; stamping
-- now() would silently freeze everyone for a week for no reason.


-- ============ 2. one name per person ============
-- Case-insensitive: "Bob" and "bob" are the same callsign to a
-- human reading a lobby, so they must not both exist.
--
-- EXISTING DUPLICATES ARE RESOLVED AUTOMATICALLY.
-- Handles were never unique - nothing ever stopped two accounts
-- taking the same name - so a live database can very reasonably
-- already contain a clash, and creating the index on top of one
-- fails outright:
--
--   ERROR: 23505: could not create unique index
--   DETAIL: Key (lower(handle))=(fragmint) is duplicated.
--
-- An earlier draft of this file just told you to go and rename the
-- losers by hand. That is not a migration, it is homework - so the
-- de-duplication happens here, before the index is built.
--
-- WHO KEEPS THE NAME: the OLDEST row wins, by created_at, with the
-- id as a tie-break so the outcome is deterministic and re-running
-- changes nothing. Everyone else gets the smallest numeric suffix
-- that is actually free ("fragmint" -> "fragmint2"), checked
-- against both the real table and the names being assigned in this
-- same pass. The 24-character ceiling is respected by trimming the
-- stem, so a maximum-length handle cannot produce an invalid one.
--
-- Renamed accounts are NOT put on cooldown: handle_changed_at is
-- left alone, so anyone who loses their name here can immediately
-- pick a new one.
do $$
declare
  dup  record;
  cand text;
  n    int;
begin
  -- row_number() picks the keeper per duplicate group in one pass:
  -- rn = 1 is the oldest row and keeps its name, rn > 1 gets renamed.
  -- Ordering by created_at then id makes the choice deterministic, so
  -- re-running this file is a no-op rather than a reshuffle.
  for dup in
    select id, handle
      from (
        select p.id,
               p.handle,
               row_number() over (
                 partition by lower(p.handle)
                 order by p.created_at asc nulls last, p.id asc
               ) as rn
          from public.profiles p
      ) ranked
     where rn > 1
  loop
    n := 2;
    loop
      -- trim the stem so the suffix always fits inside 24 characters
      cand := left(dup.handle, 24 - length(n::text)) || n::text;
      exit when not exists (
        select 1 from public.profiles z where lower(z.handle) = lower(cand)
      );
      n := n + 1;
    end loop;

    raise notice 'duplicate handle %: renaming account % to %',
      dup.handle, dup.id, cand;
    update public.profiles set handle = cand where id = dup.id;
  end loop;
end;
$$;

create unique index if not exists profiles_handle_lower_idx
  on public.profiles (lower(handle));


-- ============ 3. the cooldown, as data ============
-- One definition, read by both the check and the countdown, so the
-- two can never drift apart.
create or replace function public.handle_cooldown()
returns interval
language sql
immutable
as $$
  select interval '7 days';
$$;


-- =============================================================
-- handle_status: may I rename, and if not, when?
-- -------------------------------------------------------------
-- Lets Settings show the real answer before the player types a
-- name and presses Save. The client must still not TRUST this -
-- set_handle() re-checks - but a disabled field with a date on it
-- is a much better experience than a rejection after the fact.
-- =============================================================
create or replace function public.handle_status()
returns table (
  handle          text,
  changed_at      timestamptz,
  next_allowed_at timestamptz,
  can_change      boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.handle,
    p.handle_changed_at,
    case
      when p.handle_changed_at is null then null
      else p.handle_changed_at + public.handle_cooldown()
    end,
    (p.handle_changed_at is null
       or now() >= p.handle_changed_at + public.handle_cooldown())
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.handle_status() to authenticated;


-- =============================================================
-- set_handle: the ONLY way a username changes
-- -------------------------------------------------------------
-- security definer, so it can write a column the caller's own RLS
-- policy forbids. Every rule lives in here:
--   - must be signed in
--   - 3-24 chars, letters/numbers/dot/underscore/hyphen (the same
--     shape js/auth.js validateHandle() enforces client-side)
--   - not already held by somebody else, case-insensitively
--   - not inside the 7-day cooldown
--
-- Re-saving the name you already have is a no-op, NOT a rename:
-- opening Settings and pressing Save without touching the field
-- must not burn the player's weekly change.
-- =============================================================
create or replace function public.set_handle(p_handle text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  want    text := btrim(coalesce(p_handle, ''));
  cur     public.profiles;
  ok_at   timestamptz;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;

  select * into cur from public.profiles where id = me;
  if not found then
    raise exception 'No profile to rename.' using errcode = 'P0002';
  end if;

  -- ---- format, matching the client's validateHandle() ----
  if length(want) < 3 then
    raise exception 'Too short - 3 characters minimum.' using errcode = '22023';
  end if;
  if length(want) > 24 then
    raise exception 'Too long - 24 characters maximum.' using errcode = '22023';
  end if;
  if want !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'Only letters, numbers, and . _ - are allowed.' using errcode = '22023';
  end if;

  -- ---- saving your own name back is not a change ----
  if want = cur.handle then
    return cur;
  end if;

  -- ---- the weekly limit ----
  -- Checked BEFORE the taken-check so a player on cooldown is told
  -- about the cooldown rather than about somebody else's name.
  if cur.handle_changed_at is not null then
    ok_at := cur.handle_changed_at + public.handle_cooldown();
    if now() < ok_at then
      raise exception
        'You can change your username again on %.',
        to_char(ok_at at time zone 'UTC', 'Mon DD, YYYY "at" HH24:MI UTC')
        using errcode = 'P0001';
    end if;
  end if;

  -- ---- uniqueness ----
  -- The index is the real guarantee (two simultaneous callers can
  -- both pass this check); this exists to produce a readable
  -- message in the common case instead of a raw 23505.
  if exists (
    select 1 from public.profiles
     where lower(handle) = lower(want) and id <> me
  ) then
    raise exception 'That username is taken.' using errcode = '23505';
  end if;

  -- Announce the write so profiles_pin_handle() lets it through.
  -- Transaction-local: it cannot survive into another request.
  perform set_config('app.handle_write', 'on', true);

  update public.profiles
     set handle = want,
         handle_changed_at = now()
   where id = me
   returning * into cur;

  perform set_config('app.handle_write', 'off', true);

  return cur;
exception
  when unique_violation then
    raise exception 'That username is taken.' using errcode = '23505';
end;
$$;

grant execute on function public.set_handle(text) to authenticated;


-- =============================================================
-- 4. the client may no longer write `handle` by hand
-- -------------------------------------------------------------
-- The old policy was `for update using (auth.uid() = id)` with no
-- with-check, i.e. "you may change anything on your own row" -
-- which includes the name and the cooldown stamp that is supposed
-- to police it.
--
-- WHY A TRIGGER AND NOT A POLICY WITH-CHECK.
--   The obvious shape is `with check (handle = (select handle from
--   profiles where id = auth.uid()))`. Do not write that. A policy
--   on profiles that sub-selects profiles re-enters the same policy
--   and Postgres aborts with 42P17, "infinite recursion detected in
--   policy for relation profiles" - which does not merely break the
--   rename, it makes the whole table unreadable for every user.
--   Wrapping the sub-select in a plain SQL function does not help
--   either: simple SQL functions are inlined during planning and
--   the recursion comes straight back.
--
--   A BEFORE UPDATE trigger sees OLD and NEW directly, so it needs
--   no query against the table at all, and it applies to every
--   writer including PostgREST.
--
-- HOW set_handle() GETS THROUGH.
--   It sets a transaction-local flag that the trigger honours. The
--   flag is local (third argument true), so it dies with the
--   transaction and cannot leak into a later request on the same
--   pooled connection.
-- =============================================================
create or replace function public.profiles_pin_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- set_handle() announces itself; anything else may not move these.
  if coalesce(current_setting('app.handle_write', true), '') = 'on' then
    return new;
  end if;
  new.handle := old.handle;
  new.handle_changed_at := old.handle_changed_at;
  return new;
end;
$$;

drop trigger if exists profiles_pin_handle_trg on public.profiles;
create trigger profiles_pin_handle_trg
  before update on public.profiles
  for each row
  execute function public.profiles_pin_handle();

-- The policy itself stays simple and non-recursive: you may update
-- your own row. WHICH COLUMNS may move is the trigger's business.
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);


-- =============================================================
-- DONE
--
-- Verify:
--   select * from public.handle_status();
--   select public.set_handle('NewName123');   -- works once
--   select public.set_handle('AgainTooSoon'); -- refused for 7 days
--
-- And confirm the direct route is closed:
--   update public.profiles set handle = 'Sneaky' where id = auth.uid();
--   select handle from public.profiles where id = auth.uid();
--   -- expected: the UPDATE reports success but the handle is UNCHANGED.
--   -- The trigger silently pins the column rather than raising, so a
--   -- client that still tries the old direct write is not broken - it
--   -- simply cannot rename. set_handle() is the only door.
--
-- And confirm the table is still readable (i.e. no 42P17):
--   select count(*) from public.profiles;
-- =============================================================
