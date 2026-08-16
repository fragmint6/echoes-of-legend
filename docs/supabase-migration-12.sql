-- =============================================================
-- Echoes of Legend - migration 12
-- MATCH HISTORY: archive finished matches, then delete them
-- -------------------------------------------------------------
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once. Requires migration 02.
--
-- Migration 11 is NOT a prerequisite. It adds mp_matches.settings, and
-- this migration archives that column - but ordering the two would
-- make a history feature fail on any project that has not adopted
-- private rooms yet, with an error (42703: column m.settings does not
-- exist) that says nothing about the real cause. The column is
-- created here too if it is missing. Both definitions are identical
-- and both use `if not exists`, so 11 and 12 can be run in either
-- order, or only one of them.
--
-- WHY THIS EXISTS
--
--   Two requests that look contradictory and are not:
--
--     "finished matches still exist within the database and I want
--      them to be deleted"
--     "implement a match history system where you can see what
--      happened exactly"
--
--   You cannot show history for rows you deleted. The resolution is
--   that mp_matches and history want DIFFERENT SHAPES. mp_matches is
--   live plumbing: it is polled for "your active match", it is swept,
--   it carries seeds and settings that mean nothing once the game is
--   over, and every finished row left in it is dead weight on every
--   one of those queries. History is a read-only record.
--
--   So a finished match is ARCHIVED into mp_history and then DELETED
--   from mp_matches. The live table only ever holds live games -
--   which is what was actually asked for - and the history survives
--   in a table built for reading.
--
-- WHAT "EXACTLY WHAT HAPPENED" MEANS HERE
--
--   The engine is deterministic: same seed, same squads, same action
--   stream gives the same battle on any machine. That is the property
--   the whole netcode already relies on (js/netplay.js sends only
--   {unit, slot, targets, choose} per action and recomputes the rest
--   locally). So a full replay does not need a frame-by-frame dump -
--   it needs the seed, the two squads, and the ordered action list.
--   That is what `replay` stores, and it is small: a long match is a
--   few kilobytes of JSON, not megabytes.
--
--   One row per match, not one per player. Both players see the same
--   match from their own side; `p1`/`p2` say who was who and the
--   client flips perspective, exactly as it does live.
-- =============================================================


-- ============ the column this migration archives ============
-- Normally added by migration 11 (private rooms), where it carries the
-- party leader's chosen terms into the match. Declared here as well so
-- that archiving does not depend on rooms having been adopted first.
-- Identical definition, `if not exists`, so running 11 before or after
-- this is a no-op either way.
alter table public.mp_matches
  add column if not exists settings jsonb not null default '{}'::jsonb;


-- ============ the archive ============
create table if not exists public.mp_history (
  id          uuid primary key,          -- the original mp_matches.id
  mode        text not null,
  seed        bigint not null,
  p1          uuid references auth.users(id) on delete set null,
  p2          uuid references auth.users(id) on delete set null,
  p1_name     text,
  p2_name     text,
  -- 'p1' | 'p2' | 'draw' | null when nobody reported a result
  winner      text,
  -- how it ended: 'victory' | 'forfeit' | 'disconnect' | 'unknown'
  ending      text not null default 'unknown',
  rounds      int  not null default 0,
  settings    jsonb not null default '{}'::jsonb,
  -- the deterministic replay: {squads:{p1:[...],p2:[...]}, actions:[...], field, bans, ...}
  replay      jsonb,
  started_at  timestamptz,
  ended_at    timestamptz not null default now()
);

-- The history list is always "my matches, newest first". Two partial
-- indexes rather than one on (p1,p2) because a player is only ever
-- one of the two, and Postgres can union these cheaply.
create index if not exists mp_history_p1_idx on public.mp_history(p1, ended_at desc);
create index if not exists mp_history_p2_idx on public.mp_history(p2, ended_at desc);

alter table public.mp_history enable row level security;

-- You may read a match you played in. Nothing else, and no writes at
-- all from the client: the archive is written by the SECURITY DEFINER
-- function below, so a player cannot invent a match or edit a result.
drop policy if exists "read my history" on public.mp_history;
create policy "read my history" on public.mp_history
  for select using (auth.uid() = p1 or auth.uid() = p2);


-- =============================================================
-- archive_match: the ONLY way a match becomes history
-- -------------------------------------------------------------
-- Called instead of end_match() when a game finishes properly. It
-- copies the row into mp_history, attaches the replay, and deletes
-- the original.
--
-- IDEMPOTENT BY CONSTRUCTION. Both clients call this at the end of
-- the same match - that is not a bug to be prevented but the normal
-- case, and it is also what makes the archive robust when one player
-- disconnects. The insert takes the first writer and the second is
-- absorbed by `on conflict do nothing`, EXCEPT that a later call
-- carrying a replay will fill one in if the first call had none (the
-- disconnecting client may know less than the one still playing).
--
-- The result is NOT trusted for anything competitive. It is a
-- client-reported record for the player's own history view; a ladder
-- would have to verify server-side, exactly as end_match's comment
-- has always said.
-- =============================================================
create or replace function public.archive_match(
  p_match  uuid,
  p_winner text default null,
  p_ending text default 'unknown',
  p_rounds int  default 0,
  p_replay jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m  public.mp_matches;
begin
  if me is null then
    return;
  end if;

  select * into m from mp_matches where id = p_match for update;
  if m.id is null then
    -- already archived by the other player: still allow a replay to be
    -- supplied if the first writer had none
    if p_replay is not null then
      update mp_history
         set replay = coalesce(replay, p_replay),
             rounds = greatest(rounds, coalesce(p_rounds, 0))
       where id = p_match
         and (p1 = me or p2 = me);
    end if;
    return;
  end if;

  -- only a participant may close their own match
  if m.p1 <> me and m.p2 <> me then
    return;
  end if;

  insert into mp_history(
    id, mode, seed, p1, p2, p1_name, p2_name,
    winner, ending, rounds, settings, replay, started_at, ended_at)
  values (
    m.id, m.mode, m.seed, m.p1, m.p2, m.p1_name, m.p2_name,
    case when p_winner in ('p1','p2','draw') then p_winner else null end,
    coalesce(nullif(p_ending, ''), 'unknown'),
    greatest(coalesce(p_rounds, 0), 0),
    m.settings, p_replay, m.created_at, now())
  on conflict (id) do nothing;

  delete from mp_matches where id = m.id;
end;
$$;

grant execute on function public.archive_match(uuid, text, text, int, jsonb) to authenticated;


-- =============================================================
-- my_history: the list behind the History screen
-- -------------------------------------------------------------
-- Returns the caller's matches newest first, already resolved to
-- "me vs them" so the client does not have to work out which side it
-- was on in every row. The replay is deliberately NOT selected here -
-- it is the big column and the list view never shows it. Fetch one
-- with match_replay() when the player opens a match.
-- =============================================================
create or replace function public.my_history(p_limit int default 40, p_offset int default 0)
returns table (
  id         uuid,
  mode       text,
  opponent   text,
  i_was      text,     -- 'p1' | 'p2'
  winner     text,
  outcome    text,     -- 'win' | 'loss' | 'draw' | 'unknown', from MY side
  ending     text,
  rounds     int,
  has_replay boolean,
  ended_at   timestamptz
)
language sql
security definer
set search_path = public
as $$
  select h.id,
         h.mode,
         case when h.p1 = auth.uid() then coalesce(h.p2_name, 'Player')
              else coalesce(h.p1_name, 'Player') end,
         case when h.p1 = auth.uid() then 'p1' else 'p2' end,
         h.winner,
         case
           when h.winner is null  then 'unknown'
           when h.winner = 'draw' then 'draw'
           when (h.winner = 'p1' and h.p1 = auth.uid())
             or (h.winner = 'p2' and h.p2 = auth.uid()) then 'win'
           else 'loss'
         end,
         h.ending,
         h.rounds,
         h.replay is not null,
         h.ended_at
    from mp_history h
   where h.p1 = auth.uid() or h.p2 = auth.uid()
   order by h.ended_at desc
   limit greatest(1, least(coalesce(p_limit, 40), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.my_history(int, int) to authenticated;


-- =============================================================
-- match_replay: the full record for one match
-- =============================================================
create or replace function public.match_replay(p_match uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', h.id,
           'mode', h.mode,
           'seed', h.seed,
           'p1_name', coalesce(h.p1_name, 'Player'),
           'p2_name', coalesce(h.p2_name, 'Player'),
           'i_was', case when h.p1 = auth.uid() then 'p1' else 'p2' end,
           'winner', h.winner,
           'ending', h.ending,
           'rounds', h.rounds,
           'settings', h.settings,
           'replay', h.replay,
           'ended_at', h.ended_at)
    from mp_history h
   where h.id = p_match
     and (h.p1 = auth.uid() or h.p2 = auth.uid());
$$;

grant execute on function public.match_replay(uuid) to authenticated;


-- =============================================================
-- sweep_matches, revisited
-- -------------------------------------------------------------
-- Migration 02's sweeper marked abandoned matches 'done' and left
-- them in place. Now that finished matches are supposed to LEAVE
-- mp_matches, the sweeper deletes them instead - including any
-- 'done' rows still sitting there from before this migration.
--
-- An abandoned match is archived with ending='disconnect' and no
-- replay: nobody was there to report one, but the players should
-- still see that the game happened rather than have it vanish.
-- =============================================================
create or replace function public.sweep_matches()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- abandoned: no heartbeat for 30 minutes
  insert into mp_history(
    id, mode, seed, p1, p2, p1_name, p2_name,
    winner, ending, rounds, settings, replay, started_at, ended_at)
  select m.id, m.mode, m.seed, m.p1, m.p2, m.p1_name, m.p2_name,
         null, 'disconnect', 0, m.settings, null, m.created_at, now()
    from mp_matches m
   where m.created_at < now() - interval '30 minutes'
  on conflict (id) do nothing;

  delete from mp_matches
   where created_at < now() - interval '30 minutes'
      or status = 'done';
end;
$$;

grant execute on function public.sweep_matches() to authenticated;


-- =============================================================
-- BACKFILL: clear out what is already finished
-- -------------------------------------------------------------
-- One-off, and safe to re-run. Everything currently sitting in
-- mp_matches with status='done' is exactly the clutter that prompted
-- this migration: archive it (so it appears in history) and remove
-- it from the live table.
-- =============================================================
insert into public.mp_history(
  id, mode, seed, p1, p2, p1_name, p2_name,
  winner, ending, rounds, settings, replay, started_at, ended_at)
select m.id, m.mode, m.seed, m.p1, m.p2, m.p1_name, m.p2_name,
       null, 'unknown', 0, m.settings, null, m.created_at, now()
  from public.mp_matches m
 where m.status = 'done'
on conflict (id) do nothing;

delete from public.mp_matches where status = 'done';
