-- =============================================================
-- Echoes of Legend - migration 03
-- PERSISTED MATCH STATE: real rejoin + Ranked Classic
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Run migration 02 first (or at the
-- same time - they are independent and both idempotent).
--
-- WHY THIS EXISTS
--
--   Migration 02 could keep a match ROW alive when one player
--   dropped, but the client still could not rebuild the board: the
--   draft picks, the bans and the fielded six were only ever
--   broadcast, never stored. So "rejoin" had to concede.
--
--   This stores the handful of decisions that define a match. They
--   are small, they are already public to both players by the time
--   they are written, and with them a reconnecting client can
--   reconstruct the game exactly.
--
-- WHAT IS *NOT* STORED, AND WHY
--
--   Not the per-action battle log. That is a much larger write
--   volume and it is only worth doing when it also serves
--   server-side verification for trophies. Rejoining mid-BATTLE
--   therefore still forfeits; rejoining during draft, bans or
--   fielding restores perfectly. That is the honest boundary of
--   what this migration buys.
-- =============================================================

-- ---------- match state ----------
alter table public.mp_matches
  -- 'draft' | 'ban' | 'field' | 'battle' | 'done'
  add column if not exists phase text not null default 'draft',
  -- draft picks, in order, as {p1:[cardId...], p2:[cardId...]}
  add column if not exists picks jsonb not null default '{}'::jsonb,
  -- each side's two bans: {p1:[cardId,cardId], p2:[...]}
  add column if not exists bans jsonb not null default '{}'::jsonb,
  -- fielded six, FRONT-then-BACK (the array order IS the formation)
  add column if not exists six jsonb not null default '{}'::jsonb,
  -- Ranked Classic: each player's whole twelve, sent at match start
  add column if not exists decks jsonb not null default '{}'::jsonb,
  -- battlefield id, so both clients agree even across a reconnect
  add column if not exists field text;


-- =============================================================
-- save_match_state
-- -------------------------------------------------------------
-- One writer for every phase. The caller may only ever write into
-- its OWN slot ('p1' or 'p2'), which the function derives from
-- auth.uid() rather than trusting a parameter - so a player cannot
-- forge their opponent's picks, bans or formation.
--
-- `phase` is advanced monotonically: a late or duplicated message
-- can never drag a match backwards into an earlier phase.
-- =============================================================
create or replace function public.save_match_state(
  p_match uuid,
  p_phase text default null,
  p_picks jsonb default null,
  p_bans  jsonb default null,
  p_six   jsonb default null,
  p_deck  jsonb default null,
  p_field text  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  slot text;
  ord  constant text[] := array['draft','ban','field','battle','done'];
  cur  text;
begin
  if me is null then
    return;
  end if;

  select case when p1 = me then 'p1' when p2 = me then 'p2' end, phase
    into slot, cur
    from mp_matches
   where id = p_match
   for update;

  if slot is null then
    return; -- not a participant
  end if;

  update mp_matches
     set picks = case when p_picks is null then picks
                      else jsonb_set(picks, array[slot], p_picks, true) end,
         bans  = case when p_bans  is null then bans
                      else jsonb_set(bans,  array[slot], p_bans,  true) end,
         six   = case when p_six   is null then six
                      else jsonb_set(six,   array[slot], p_six,   true) end,
         decks = case when p_deck  is null then decks
                      else jsonb_set(decks, array[slot], p_deck,  true) end,
         field = coalesce(p_field, field),
         -- only ever move forward through the phase list
         phase = case
                   when p_phase is null then phase
                   when array_position(ord, p_phase) is null then phase
                   when array_position(ord, p_phase) > array_position(ord, coalesce(cur,'draft'))
                     then p_phase
                   else phase
                 end,
         p1_seen = case when slot = 'p1' then now() else p1_seen end,
         p2_seen = case when slot = 'p2' then now() else p2_seen end
   where id = p_match;
end;
$$;

grant execute on function public.save_match_state(uuid, text, jsonb, jsonb, jsonb, jsonb, text) to authenticated;


-- =============================================================
-- try_match, revised for mode
-- -------------------------------------------------------------
-- Unchanged except that it now records the requested mode on the
-- match, so Ranked Classic and Ranked Draft queue separately and a
-- Classic player can never be paired into a Draft.
-- (mp_queue already carried `mode`; the match row now honours it.)
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

  select coalesce(handle, 'Player') into my_name from profiles where id = me;

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
    values (me, coalesce(my_name, 'Player'), p_mode)
    on conflict (user_id) do update set joined_at = now(), mode = excluded.mode;
    return;
  end if;

  delete from mp_queue where user_id in (waiting.user_id, me);

  insert into mp_matches(mode, seed, p1, p2, p1_name, p2_name, phase)
  values (p_mode,
          (floor(random() * 2147483647))::bigint,
          waiting.user_id, me,
          waiting.handle, coalesce(my_name, 'Player'),
          case when p_mode = 'classic' then 'ban' else 'draft' end)
  returning id into new_id;

  return query select * from mp_matches where id = new_id;
end;
$$;

grant execute on function public.try_match(text) to authenticated;

-- =============================================================
-- Done. Verify with:  node sim/preflight.js
-- =============================================================
