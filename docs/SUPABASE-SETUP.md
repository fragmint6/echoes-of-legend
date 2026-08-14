# Supabase setup - accounts, multiplayer, and Daily Puzzles

The goal: **two people on different computers can play online, saves follow
an account, and every signed-in player receives the same Daily Puzzle with
two attempts.** Nothing here is ranked yet - the ladder is ROADMAP Phase 4;
the online modes remain unranked.

---

## Current status of project `ghchcvrojojrlbgqbvga`

Measured by `node sim/preflight.js`, not assumed:

|     | Item                                                       | State          |
| --- | ---------------------------------------------------------- | -------------- |
| OK  | Project URL and publishable key in `js/supabase-config.js` | done           |
| OK  | Key authenticates, RLS blocks anonymous writes             | done           |
| OK  | Email sign-in, signups open, **auto-confirm on**           | done           |
| OK  | Redirect URL for your host                                 | done           |
| OK  | **Realtime Broadcast** - tested with two live clients      | working        |
| OK  | `profiles`, `saves` tables                                 | present        |
| OK  | `mp_queue`, `mp_matches` tables                            | **created**    |
| OK  | `try_match()` function                                     | **created**    |
| OK  | Daily Puzzle migration 04                                  | installed      |
| OK  | Daily Puzzle RPC hotfix 05                                 | installed      |
| ADD | Measurement + feedback migration 06                        | run section 4f |
| ADD | Two-attempt Daily Puzzle migration 07                      | run section 4g |
| ADD | Atomic shop-code redemption migration 08                   | run section 4h |

**Accounts and multiplayer are ready.** Run migration 06 for the anonymous
playtest funnel, migration 07 before deploying the two-attempt Daily Puzzle
client, and migration 08 before issuing globally single-user shop codes.

---

## THE BACKEND MAP (cleanup 2026-08-10)

Eleven tables. If the dashboard shows unrelated leftovers, run the cleanup
in section 9b. Everything the backend holds, in one look:

| Table                   | Written by                           | What it holds                                                                                                              |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `profiles`              | `js/auth.js`                         | Identity: the callsign your opponent sees. One row per user.                                                               |
| `saves`                 | `js/cloud.js` (THE VAULT)            | The whole player save as ONE readable json: `wallet`, `owned`, `campaign`, `decks`, `settings`, `flags`. One row per user. |
| `shop_codes`            | Owner via Dashboard/SQL              | Coin amount, active state, and the `single_user_only` policy boolean for each code.                                        |
| `shop_code_redemptions` | `redeem_shop_code()` only            | Durable once-per-account claims; for single-user codes the first row closes the offer globally.                            |
| `mp_queue`              | `js/mp.js`                           | Who is waiting for a match. Rows die the instant a pair is made.                                                           |
| `mp_matches`            | `js/mp.js`                           | The paired match + its shared `seed`.                                                                                      |
| `daily_puzzles`         | Leased browser forge + database cron | At most two serialized positions: current `active` and tomorrow's `staged`.                                                |
| `daily_puzzle_attempts` | Daily Puzzle RPCs                    | Up to two numbered claims per account for the active puzzle; deleted with yesterday's position.                            |
| `daily_puzzle_jobs`     | `js/daily.js`                        | One short generation lease so many open browsers still run only one forge.                                                 |
| `telemetry_events`      | `js/telemetry.js`                    | Privacy-light anonymous views, queue/match milestones, battle starts/results, and coarse errors; raw rows retain 180 days. |
| `player_feedback`       | `js/telemetry.js`                    | Voluntary bug, balance, confusion, and suggestion reports sent from the game.                                              |

| Function                                                                    | Called by                 | Job                                                                                               |
| --------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `try_match()`                                                               | mp.js                     | Atomic pairing (`for update skip locked`).                                                        |
| `find_my_match()`                                                           | mp.js                     | Rejoin after a refresh.                                                                           |
| `touch_match()` / `save_match_state()` / `end_match()`                      | mp.js                     | Match lifecycle.                                                                                  |
| `claim_daily_generation()` / `submit_daily_candidate()`                     | `js/daily.js` Web Worker  | Elect one signed-in browser to forge and stage the shared position.                               |
| `publish_daily_puzzle()`                                                    | pg_cron / overdue browser | Atomically promote staged at 7 AM Eastern.                                                        |
| `daily_puzzle_status()` / `claim_daily_puzzle()` / `finish_daily_attempt()` | `js/daily.js`             | Count, atomically consume, and finish either of two official attempts.                            |
| `record_telemetry()`                                                        | `js/telemetry.js`         | Validate and rate-limit one anonymous funnel event without attaching account identity.            |
| `submit_player_feedback()`                                                  | `js/telemetry.js`         | Validate and rate-limit an anonymous voluntary feedback message with optional coarse diagnostics. |
| `redeem_shop_code()`                                                        | `js/economy.js`           | Lock and claim a code atomically, enforcing once per account or one account globally.             |

Dropped as dead weight: `decks` (the pre-vault deck-sync experiment -
no code referenced it) and `ladders` (nothing wrote it; it returns
with ranked in ROADMAP Phase 4, server-side or not at all).

---

## 0. FIRST: rotate the key you posted in chat

You pasted `sb_secret_pXX3fpqxpkjY6RtEcKhUEA_Q8KN1Hgo` twice. That is a
**secret key**. It bypasses Row Level Security completely, so anyone who
has it can read, edit and delete every row in your database, including
other players' accounts.

**Do this before anything else:** Dashboard -> **Project Settings ->
API Keys** -> find that secret key -> **Revoke** (or delete and create a
new one).

It is not the key you need anyway. The browser uses the **publishable**
key, which is designed to be public.

The game refuses to start Supabase if it detects a secret key in the
config and logs a loud error explaining why, so this mistake cannot ship
quietly.

---

## 1. Where your config actually comes from

You asked where to get it. Two values, both from the same screen.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and
   open your project (or **New project** - pick a region near you and
   save the database password somewhere safe; you will not need it for
   this game, but you will if you ever connect directly).
2. In the left sidebar, the gear icon: **Project Settings**.
3. Click **Data API**. Copy **Project URL**. It looks like
   `https://abcdefghijklmnop.supabase.co`.
4. Click **API Keys**. Copy the **publishable** key - it starts with
   `sb_publishable_`.
   - Older projects show **Legacy API keys** with an `anon` key instead,
     a long string starting `eyJ...`. That works too.
   - If you see a **Create new API keys** button, click it first. New
     keys sit alongside the legacy ones and break nothing.

> Which key is which
>
> | Key                   | Looks like                       | Goes where                           |
> | --------------------- | -------------------------------- | ------------------------------------ |
> | Publishable / anon    | `sb_publishable_...` or `eyJ...` | **This game.** Safe in browser code. |
> | Secret / service_role | `sb_secret_...`                  | Servers only. **Never here.**        |

Then paste both into `js/supabase-config.js`. **This is already done
for your project.**

```js
window.EOL.supabaseConfig = {
  url: 'https://ghchcvrojojrlbgqbvga.supabase.co',
  anonKey: 'sb_publishable_...', // publishable ONLY, never sb_secret_
  redirectTo: '',
};
```

> **The URL is the BASE project URL, not the REST endpoint.** The
> dashboard shows `https://....supabase.co/rest/v1/`; do not use that.
> The client appends its own paths - `/rest/v1` for tables, `/auth/v1`
> for sign-in, `/realtime/v1` for the match socket - so a URL with
> `/rest/v1/` baked in would send sign-in and realtime to addresses
> that do not exist, and multiplayer would fail with no clear error.

---

## 2-4. Run the SQL (one paste)

Everything the game needs - tables, the matchmaking function and all
Row Level Security policies - is in one file:

**[`docs/supabase-setup.sql`](supabase-setup.sql)**

Dashboard -> **SQL Editor** -> **New query** -> paste the whole file ->
**Run**.

It is **idempotent**: every statement is `create if not exists`,
`create or replace`, or a policy that is dropped before being
recreated. Running it twice does nothing the second time, so if you are
not sure whether an earlier attempt finished, just run it again.

What it creates:

| Object        | Purpose                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `profiles`    | Display name shown to your opponent.                                                                              |
| `mp_queue`    | Who is waiting for a match. Rows are deleted the instant a pair is made.                                          |
| `mp_matches`  | The match, and its `seed` - the shared randomness both clients build the draft, battlefield and battle luck from. |
| `try_match()` | Atomic pairing. `for update skip locked` is what stops two clients claiming the same opponent.                    |
| RLS policies  | What makes the publishable key safe to ship in browser code.                                                      |

(`ladders` used to be created here too - it is gone until ranked is
real; see THE BACKEND MAP and section 9b.) There is no `decks` table:
decks travel inside the `saves` document.

## 4b. Migration 02 - match lifecycle

If you set the project up before this migration existed, run
**[`docs/supabase-migration-02.sql`](supabase-migration-02.sql)** now.

It fixes a real leak: a match row was created and never touched again,
so two players closing their tabs left it `active` **forever** - and
because `try_match()` returns your existing active match before it
checks the queue, that ghost row kept pulling you back into a game
nobody was playing.

What it adds:

| Object                | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `p1_seen` / `p2_seen` | Heartbeat timestamps, written every 15s by each client.                               |
| `touch_match()`       | "I am still here." Can only ever update the caller's own timestamp.                   |
| `end_match()`         | Closes a match on a natural finish or a forfeit.                                      |
| `sweep_matches()`     | Closes matches where **both** sides have been quiet 90s, and clears stale queue rows. |
| `find_my_match()`     | The rejoin lookup, called at page load.                                               |

Cleanup is **lazy** - `sweep_matches()` runs inside `try_match()`, which
every player calls before queueing. No cron job, no Edge Function,
nothing to keep running. The table cleans itself as it is used.

One heartbeat still beating keeps a match open, which is what lets the
player who dropped come back to it.

## 4c. Migration 03 - persisted match state

If you set the project up before this migration existed, run
**[`docs/supabase-migration-03.sql`](supabase-migration-03.sql)** now.

It adds `save_match_state()` and `find_my_match()` — the two functions
that let `mp.js` persist and recover match state (draft progress, ban
phase, battle board) across page reloads and client reconnects. Without
them, refreshing mid-draft or mid-battle forfeits the match.

What it adds:

| Object               | Purpose                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `mp_match_state`     | Stores a snapshot of the match at each phase boundary.                         |
| `save_match_state()` | Writes the current game state (called by the host after every phase change).   |
| `find_my_match()`    | Returns the persisted state so the rejoining client resumes where it left off. |

## 4d. Migration 04 - official Daily Puzzle

Run **[`docs/supabase-migration-04.sql`](supabase-migration-04.sql)** in the
SQL Editor. That single paste is the whole setup—there is no GitHub Action,
server secret, Edge Function, or additional hosting. Fresh installs use the
corrected RPC definitions already included in migration 04.

It creates:

- `daily_puzzles`, hard-capped by its unique `active` / `staged` slots to
  **two positions at most**;
- `daily_puzzle_attempts`, initially one row per puzzle/account (migration 07
  adds the numbered second attempt);
- `daily_puzzle_jobs`, a tiny expiring lease—not a stored position;
- generation lease/submission, status, atomic attempt, result, and
  publication RPCs;
- a database cron that publishes at **7:00 AM America/New_York**, following
  EST/EDT automatically.

At 6:55 AM Eastern, signed-in browsers ask Supabase for the generation
lease. Exactly one gets it and runs the real depth-4 forge inside
`js/daily-worker.js`, away from the UI thread. It stages the validated board;
at 7:00 the database deletes yesterday's active position and attempts,
promotes staged, and leaves one active position. That deletion is everyone's
attempt reset—there is no mass user update.

If nobody has the game open at 6:55, the first signed-in browser after reset
receives the same lease. The Daily Puzzle modal shows the forge, then the
position publishes immediately when it finishes. This makes the system
self-healing without an always-on server; the only tradeoff is that the
first visitor after a completely idle reset may wait for generation.

Each of a player's two attempts is consumed inside `claim_daily_puzzle()`
immediately before the board is returned. Merely opening the Daily Puzzle
card does not consume one; once a battle opens, closing or refreshing cannot
restore that numbered attempt. Official Daily Puzzles therefore require a
signed-in account. The original interactive generator remains available to
developers at `?dailyLab=1`.

## 4e. Migration 05 - Daily Puzzle RPC hotfix

If migration 04 was installed before **2026-08-11**, run
**[`docs/supabase-migration-05.sql`](supabase-migration-05.sql)** once in the
SQL Editor. It fixes PostgreSQL treating the `puzzle_day` and `puzzle_id`
RETURNS TABLE variables as ambiguous inside `ON CONFLICT` targets.

The hotfix only replaces `claim_daily_generation()` and
`claim_daily_puzzle()`. It does not delete puzzle rows, attempts, jobs, or
cron configuration, and it is safe to run more than once. Fresh installations
that use the current migration 04 file already contain the fix.

## 4f. Migration 06 - playtest measurement and feedback

Run **[`docs/supabase-migration-06.sql`](supabase-migration-06.sql)** once in
the SQL Editor after deploying `js/telemetry.js`.

It adds two owner-readable, browser-private tables:

- `telemetry_events` for anonymous screens, mode choices, queue/match
  milestones, battle starts/results, acquisition tags, and coarse client
  errors. Raw rows retain 180 days.
- `player_feedback` for messages deliberately submitted through the new
  Feedback form.

Browser roles have no direct table access. Two narrow RPCs validate payloads,
cap their size, and rate-limit anonymous visitor ids. Neither funnel events
nor feedback messages attach account identity. The funnel never sends email,
callsign, card choices, actions, full URLs, full user-agent strings, or stack
traces. Players can turn measurement off under **Settings -> Privacy**.

See **[`docs/MEASUREMENT.md`](MEASUREMENT.md)** for the exact stored fields,
retention, UTM links, feedback workflow, and ready-to-run dashboard queries.
The game remains fully playable if this migration is missing or Supabase is
offline; measurement fails quietly and the feedback form offers a copy plus
Discord fallback.

## 4g. Migration 07 - two Daily Puzzle attempts

Run **[`docs/supabase-migration-07.sql`](supabase-migration-07.sql)** once in
the SQL Editor before deploying the current `js/daily.js`.

It preserves existing attempts as attempt 1, changes the attempt key to
`(puzzle_id, user_id, attempt_no)`, and replaces the three player-facing
Daily RPCs. Claims are serialized per puzzle/account, so simultaneous tabs
can receive attempts 1 and 2 but can never mint a third. Result reporting is
also tied to the numbered claim instead of updating both rows.

The puzzle position and seeded future remain identical on both attempts.
Opening the modal is still free; opening each battle consumes one allowance.
Publication still deletes the old puzzle and both attempt rows at the 7:00 AM
Eastern reset.

## 4h. Migration 08 - account and single-user shop codes

Run **[`docs/supabase-migration-08.sql`](supabase-migration-08.sql)** once in
the SQL Editor before issuing globally single-user codes. It creates the
private `shop_codes` catalog, the claim ledger, and `redeem_shop_code()`.
The RPC locks each code row while claiming it, so simultaneous requests
cannot both win a single-user code.

Every code is once per account. The boolean chooses its wider scope:

```sql
-- Every account may redeem this once.
insert into public.shop_codes(code, coins, single_user_only)
values ('PUBLIC500', 500, false);

-- Exactly one account globally may redeem this once.
insert into public.shop_codes(code, coins, single_user_only)
values ('ONE-WINNER', 5000, true);
```

`CREATOR5000` is seeded as a public, once-per-account code. Signed-out players
can still redeem public codes once in their local save; a globally single-user
code always requires a signed-in account and the RPC. Direct browser access to
both tables is revoked, and RLS has no client policies.

## 5. Realtime - nothing to do

**Skip this step.** Realtime Broadcast is on by default for every
Supabase project and needs no configuration.

An earlier version of this document told you to visit **Database ->
Replication**. That was wrong and sent people hunting for a switch that
does not apply. Here is the distinction:

|                      | What it is                                                                                               | Does this game need it?                             |
| -------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Broadcast**        | Clients send ephemeral messages to each other through a named channel. Never touches the database.       | **Yes** - this is all the game uses. On by default. |
| **Postgres Changes** | The database streams row inserts/updates to clients. Configured per table under Database -> Replication. | **No.**                                             |

Draft picks and battle actions are messages between two players, not
rows, so there is no table to add to a publication. The **Replication**
page is only for Postgres Changes, which this game never uses.

Verified against your project with two live clients:

```
receiver: SUBSCRIBED
sender:   SUBSCRIBED
payload:  {"hello":"world"}
```

`node sim/preflight.js` now runs this check for you.

## 6. Sign-in method

**Email + password is the fastest way to get two players testing**, and
it needs no external setup.

Dashboard -> **Authentication -> Sign In / Providers -> Email** ->
enabled. While testing, turn **Confirm email** OFF, or every test account
has to click a link in an inbox before it can queue.

<details>
<summary>Optional: Google sign-in</summary>

1. Dashboard -> **Authentication -> Sign In / Providers -> Google** -> enable.
2. Copy the **callback URL** it shows you.
3. [Google Cloud Console](https://console.cloud.google.com) -> APIs & Services
   -> Credentials -> **Create OAuth client ID** -> Web application ->
   paste that URL into **Authorized redirect URIs**.
4. Paste the Client ID and Client Secret back into Supabase.
5. Dashboard -> **Authentication -> URL Configuration** -> add your game's
   address to **Redirect URLs**.

</details>

## 7. Serve the game over http, not file://

This matters and is easy to miss. Supabase auth stores its session and
runs its websocket against an **origin**, and `file://` does not have a
usable one. Opening `index.html` by double-clicking will not sign you in.

From the game folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Add `http://localhost:8000` under **Authentication -> URL Configuration
-> Redirect URLs**.

---

## 8. Two players, two computers

This is the part you asked for.

1. Both computers open the game. If the other person is on a different
   machine on your network, serve it on your LAN address
   (`http://192.168.x.x:8000`) or deploy the folder anywhere static -
   Netlify, Vercel, GitHub Pages, Cloudflare Pages all work, since the
   game is plain files.
   - Whatever address you use must be listed in **Redirect URLs**.
2. Each player clicks the account button (top right) and makes their own
   account. **Two different email addresses.**
3. Both go to **Play -> Multiplayer -> Online Draft -> Find a match**
   (Online Classic works the same way with saved decks).
4. The first one to click waits in the queue; the second is paired
   immediately and both drop into the same draft.

From there the whole match is synchronised: the snake draft, the blind
ban phase, the formation, and every action of the battle.

### Testing it alone on one computer

Use a normal window and a **private/incognito** window. They keep
separate sessions, so you can queue two accounts against yourself.

---

## How the multiplayer actually works

| Piece           | Approach                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Matchmaking     | `try_match()` in Postgres. `for update skip locked` makes a double-claim impossible.                                                                         |
| Match channel   | Supabase Realtime **Broadcast**, one channel per match id.                                                                                                   |
| Draft sync      | Only `{pack, idx}` crosses. Both clients build the identical pack order from the shared `seed`, so the card pool is never transmitted.                       |
| Bans            | Both sides submit blind. Neither reveal happens until **both** have landed, so committing first cannot leak your picks.                                      |
| Battlefield     | Derived from the match seed on both clients, so the terrain always matches.                                                                                  |
| Battle          | One message per action, naming heroes by `(side, index)` - never by `uid`, which differs per browser. Each client recomputes the result with its own engine. |
| Luck            | Crits and coin flips come from one seeded PRNG per match, consumed in the same order on both sides.                                                          |
| Turn order      | Each client calls itself `player`, so the engine takes `oddFirst`: the host opens odd rounds, the guest even ones.                                           |
| Drift detection | Every action carries a checksum of the resulting board. A mismatch stops the match instead of letting two different games play on.                           |
| Disconnects     | Realtime presence `leave` returns both players to the menu with a notice.                                                                                    |

### Two engine bugs this work uncovered

Both were real, both were latent in singleplayer, and both are fixed:

- **Unstable target sorting.** "Lowest HP" and "highest ATK" selectors
  broke ties by array order. Ties are common (shared statlines, full-HP
  openings), so two clients could heal or execute _different_ heroes.
  All such orderings now break ties on `(slot, index)`.
- **Delayed effects resolved in array order.** Two prophecies landing on
  the same round rollover could resolve in opposite orders on the two
  machines, and the first one killing a hero cancelled the second on
  only one screen. Board-wide sweeps now run in a canonical order.

---

## What is deliberately not built yet

- ~~**Deck sync is gone, on purpose.**~~ **Superseded 2026-08-10 by THE
  VAULT (section 10 below):** the whole local save - wallet, collection,
  campaign progress, decks, settings - now syncs to `public.saves` when
  signed in. `js/cloud.js` holds the three laws (works signed out; the
  account is the save; never half-written).
- **Ranked anything.** Online Classic and Online Draft both ship
  UNRANKED; the ladder (and Unabridged in ranked) is ROADMAP Phase 4.
- **Trophies and ladder.** The table exists; nothing writes it. Trophy
  updates must be server-side or players can award themselves rank.
- **Server-authoritative battle.** Both clients run the engine and trust
  each other's moves. The checksum catches accidental drift, not a
  determined cheater. Replaying the action log in an Edge Function is
  the next step, and it has to come _before_ trophies mean anything.
- **Server-authoritative ECONOMY.** The vault stores whatever the client
  says the wallet holds - RLS keeps players out of _each other's_ rows,
  not out of their own. The day coins are sold for money, wallet writes
  must move behind an Edge Function that is the only thing allowed to
  add coins. Until then a cheater can only cheat themselves.

## Verifying it works

Start here. It interrogates your **live** project and tells you
whether two people can actually queue right now:

```bash
node sim/preflight.js
```

It checks the config shape, that the key authenticates, that every required
table and RPC (including `redeem_shop_code()`) exists, that RLS blocks
anonymous writes, and that sign-up is open. A failure names the fix.

> For which of the other test files to run and when, see
> **[TESTING.md](TESTING.md)**. You rarely need all of them.

The rest need puppeteer:

```bash
cd /tmp && npm install puppeteer --no-audit --no-fund
cd /path/to/eol

node sim/verify_mirror.js --games 500   # engine is perspective-symmetric
node sim/browser_mp_match.js            # two real browsers play a full match
node sim/browser_solo.js                # singleplayer still works with no backend
node sim/browser_desync.js              # the drift guard actually fires
```

`sim/browser_mp_match.js` plays a complete match between two headless
browsers and checks the board checksum after every action.

## Troubleshooting

| Symptom                                         | Cause                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| "Accounts are not configured yet"               | `js/supabase-config.js` is still blank.                                  |
| Console: "REFUSING TO START SUPABASE"           | You pasted a secret key. Use the publishable one.                        |
| "Multiplayer tables are missing"                | The SQL in steps 2-3 has not been run.                                   |
| Single-user code says redemption is unavailable | Run migration 08; these claims deliberately have no offline fallback.    |
| Sign-in does nothing on `file://`               | Serve over http (step 7).                                                |
| Stuck at "Looking for an opponent"              | Only one player is queued, or the two are signed in as the same account. |
| Paired but the draft never starts               | Realtime is off for the project (step 5).                                |

## 9b. CLEANUP - drop the dead tables (2026-08-10)

These two pre-vault tables are still dead; the Daily Puzzle tables in the
backend map are intentional and must not be removed. Run this cleanup once
in **SQL Editor**:

```sql
-- the pre-vault deck-sync experiment: no code references it
drop table if exists public.decks;

-- nothing writes it; ranked (ROADMAP Phase 4) recreates it properly,
-- server-authoritative, or not at all
drop table if exists public.ladders;
```

`node sim/preflight.js` has a graveyard check: it warns if either
table still exists.

## 10. THE VAULT - cloud saves (added 2026-08-10)

Signed-in players carry their whole save with the account: wallet,
owned cards, redeemed shop codes, campaign progress, decks, settings,
and tutorial flags.
`js/cloud.js` stores it as ONE **readable** json document per user
(format v2 - the original v1 stored raw localStorage strings and was
impossible to hand-edit; v1 rows migrate themselves on next sign-in):

```json
{
  "v": 2,
  "wallet": 1230,
  "owned": ["camelot-lancelot", "olympus-medusa"],
  "campaign": { "cleared": [1, 2], "fought": [1, 2, 3], "coins": 450 },
  "decks": { "...": "..." },
  "settings": { "scale": 100, "gfx": "high", "warLength": "set" },
  "flags": { "tutorialIntro": "1", "tips": {}, "shopCodes": ["CREATOR5000"] }
}
```

### Giving yourself test coins (and other owner surgery)

Two ways, pick by mood:

1. **The console (fastest).** Open the game, press F12, and type
   `EOL.dev.coins(5000)`. Done - the wallet updates live and, if
   signed in, the vault syncs it within seconds. The whole workbench:
   `EOL.dev.coins(n)`, `EOL.dev.grantAll()`, `EOL.dev.openRoad()`,
   `EOL.dev.resetRoad()` (blank the campaign + tutorial, keep cards
   and coins), `EOL.dev.reset()`, `EOL.dev.save()` (js/dev.js
   documents each).
2. **The dashboard.** Table Editor -> `saves` -> your row -> edit
   `data` -> change the `wallet` number -> save -> reload the game.
   On boot the vault wins over the device, so the edit lands.

Run this in **SQL Editor**:

```sql
create table if not exists public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "read own save"
  on public.saves for select
  using (auth.uid() = user_id);

create policy "insert own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

create policy "update own save"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- no delete policy: saves are never deleted from the client
```

Verify with `node sim/preflight.js` - it now checks the `saves` table
alongside the multiplayer ones.

**The three laws** (also at the top of `js/cloud.js`):

1. **The game must work signed out.** No account, no SDK, no network:
   nothing syncs, localStorage remains the save, every singleplayer
   feature works.
2. **The account is the save.** Progress belongs to the account, not to
   the browser.
   - **Signing in, new account:** the device's current save becomes its
     first vault, so a guest who registers keeps everything.
   - **Signing in, returning account, nothing on this device:** the
     account save is applied and the page reloads once into it.
   - **Signing in, returning account, real progress on this device:**
     both cannot survive, so the player is **asked** which to keep.
     Cancelling changes nothing and signs back out. "Real progress"
     means coins, cards beyond the seeded starter, a cleared gate, a
     battle fought, or a deck they built - never settings, tutorial
     flags, or the starter deck alone.
   - **Signing out:** the final state is flushed to the vault, then
     **every local key is erased** and the page reloads to a true first
     run. A failed flush aborts the wipe and keeps the player signed in,
     so a dropped connection can never cost a save.
3. **The vault is never half-written.** The whole snapshot travels in
   one upsert; there is no per-key merge that could tear the wallet
   away from the collection it paid for.

Pushes: a 4-second dirty-check loop, an immediate nudge on economy
events, and a flush when the tab hides. Failures are silent and the
next tick retries.

**Monetization note:** RLS protects players from each other, not from
themselves. Before coins are ever sold for money, wallet writes must
move server-side (Edge Function) - see the list above.

## 11. CRAZYGAMES ACCOUNTS - real identities on the portal (2026-08-13)

This is what makes **multiplayer work on the CrazyGames build**. Without
it the portal only ever had an anonymous session: a per-browser uid, no
`profiles` row, and `try_match()` naming every portal opponent `'Player'`.

Three steps. The game keeps working after each one, so you can stop
partway without breaking anything.

### 11.1 Run the migration

Dashboard -> SQL Editor -> New query -> paste
**`docs/supabase-migration-09.sql`** -> Run. Idempotent, so re-running is
safe. It creates `cg_link`, adds `profiles.is_portal`, and revises
`try_match()` so a portal player queues under their CrazyGames username.

### 11.2 Deploy the Edge Function

**First, get the CLI.** It is a Go binary, not a JavaScript package -
`npm i -g supabase` is explicitly unsupported and the postinstall script
aborts with *"Installing Supabase CLI as a global module is not
supported"* on some package managers. Use one of:

```bash
npx supabase@latest --version          # no install at all - prefix every command with npx
brew install supabase/tap/supabase     # macOS / Linuxbrew
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase   # Windows
npm i -D supabase                      # per-project dev dependency, then `npx supabase ...`
```

`npx` is the least-effort route: no install, always current. Everything
below works the same, just prefixed - `npx supabase login`, and so on.
If you use npx or the dev dependency, you need **Node 20+**.

Then run these from the **repository root** - the CLI looks for
`supabase/functions/cg-auth/` relative to where you are, and there is no
`supabase/config.toml` in this repo, so `link` is what creates the local
project binding:

```bash
cd /path/to/echoes-of-legend     # the folder containing supabase/
npx supabase login               # opens a browser, once per machine
npx supabase link --project-ref ghchcvrojojrlbgqbvga
npx supabase functions deploy cg-auth --no-verify-jwt
```

`login` and `link` are one-time; only the `deploy` line is repeated when
the function changes.

**If `deploy` says the function/entrypoint was not found**, you are in
the wrong directory - `ls supabase/functions/cg-auth/index.ts` should
print the file.

**If `link` asks for a database password**, that is the Postgres password
from Project Settings -> Database, not your Supabase account password.
Deploying functions does not need the database, so a wrong guess here
only blocks `link`, not the endpoint.

**`--no-verify-jwt` is required and is not a weakening.** The caller has
no Supabase session yet - obtaining one is the entire point of the
endpoint. The request is authenticated by the CrazyGames token instead,
whose RS256 signature the function verifies against
`https://sdk.crazygames.com/publicKey.json` before it trusts a single
field.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the
platform - you do **not** need to set them, and the service-role key must
never appear in browser code. (`js/auth.js` refuses to boot if one is
pasted into `js/supabase-config.js`.)

**Set `CG_GAME_ID` before launch.** Every CrazyGames title's tokens are
signed with the same key, so a signature proves CrazyGames issued the
token but *not* that they issued it for **this** game. With the secret
set, a token minted for some other portal game is rejected.

`gameId` is a short **numeric string** - e.g. `20267`. Not a slug, not a
uuid. (See docs.crazygames.com/sdk/user, "Get user token", which shows
the token payload.)

*How to find yours - fastest route, no deploy needed.* Open your game on
CrazyGames (the preview link works), log in to CrazyGames, then paste
this into the browser devtools console:

```js
(async () => {
  const t = await window.CrazyGames.SDK.user.getUserToken();
  console.log(JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))));
})()
```

Read `gameId` off the object it prints. That is your number.

Note the game must be running **on crazygames.com** for this to work -
the SDK is not available on localhost, and `getUserToken()` throws
`userNotAuthenticated` if you are not logged in to CrazyGames.

*How to find yours - via the function logs.* Only works **after**
`cg-auth` has actually been deployed; until then there is no `cg-auth`
entry in the dashboard at all.

1. Deploy **without** the secret.
2. Open the game once on CrazyGames, logged in.
3. Dashboard -> Edge Functions -> `cg-auth` -> **Logs**. Look for:

   ```
   CG_GAME_ID is not set, so ANY CrazyGames game's token is accepted here.
   This token was issued for gameId=20267 - if that is Echoes of Legend,
   run: supabase secrets set CG_GAME_ID=20267
   ```

4. Run exactly that command.

```bash
npx supabase secrets set CG_GAME_ID=20267   # your number, not this one
```

The id is not a secret - it identifies the game, not a player - so it is
safe to print in logs and to paste around.

Two other places the same number shows up, if you would rather not wait:
the URL of your game's page in the developer dashboard, and the `gameId`
field of any token pasted into [jwt.io](https://jwt.io/) (fine for a
token you generated yourself while testing - never paste a real
player's).

Left unset the function still works, but the warning repeats on every
login and any game's token would be accepted. Do not ship that way.

### 11.3 Check the endpoint is live (no game needed)

Do this first - it isolates "the function is deployed" from "the SDK
handed us a token":

```bash
curl -i -X POST \
  https://ghchcvrojojrlbgqbvga.supabase.co/functions/v1/cg-auth \
  -H 'content-type: application/json' \
  -H 'apikey: sb_publishable_SFZP7hPVaqIe8jB0GAO1TA_OyCo-JYl' \
  -d '{"token":"not-a-real-token"}'
```

(The `apikey` is the publishable key from `js/supabase-config.js` - the
function does not check it, but the platform gateway may want it. The
game sends the same header.)

| Response | Meaning |
| --- | --- |
| **401** `{"error":"invalid token"}` | **Correct.** Deployed, and it rejected a forgery. |
| 404 | Not deployed, or deployed under a different name. |
| 401 from the *gateway* (HTML, or `Missing authorization header`) | Deployed **without** `--no-verify-jwt`. Redeploy with the flag. |
| 500 `function is not configured` | Env vars missing - unusual, they are injected automatically. |

A 401 here is success. It proves the whole path works: only a genuine
CrazyGames signature gets further.

### 11.4 Check it in the game

**This cannot be tested from `localhost`.** `?platform=crazygames` forces
the portal *build*, but the CrazyGames SDK only exists inside a real
portal frame, so `getUserToken()` never resolves and the game correctly
falls back to a guest. You need the QA/preview link from your CrazyGames
developer dashboard - upload the build, open it there, and be **logged in
to CrazyGames**.

Console should print:

```
[EOL] CrazyGames SDK: signed in as <your name>
[EOL] CrazyGames SDK: CrazyGames account linked - multiplayer available
```

and the account pill shows your CrazyGames name and avatar, and the
Multiplayer tab has no lock badge.

If instead you see `CrazyGames sign-in unavailable: cg-auth 404: ...`,
step 11.2 did not take effect.

Then confirm the database agrees:

```sql
select cg_user_id, username, created_at, last_seen from public.cg_link;
select id, handle, is_portal from public.profiles where is_portal;
```

`handle` must be your CrazyGames username - that is the string your
opponent sees in a match.

### 11.5 The first real match

Matchmaking needs **two** accounts, and `try_match()` refuses to pair a
player with themselves (`user_id <> me`), so one browser cannot test it.
Use two different CrazyGames accounts - a second device, or a private
window logged in as someone else - and queue for the same mode within
five minutes of each other (a lone player times out after ~5 min with
"No opponent found").

### If you skip or delay this

Everything degrades to exactly what shipped before: the token exchange
fails, the anonymous fallback takes over, the Daily Puzzle keeps working,
and multiplayer stays locked with the lock badge on it. Nothing breaks -
verified in `sim/verify_cg_accounts.js` section C.

### What is deliberately NOT here

- **Progress does not move to Supabase.** Saves stay in the SDK's Data
  module, which is what the submission form declares and what CrazyGames
  syncs across the player's devices. The Supabase account is for identity
  and matchmaking only. Two cloud saves writing the same localStorage keys
  would be a data-loss bug.
- **No account linking prompt.** CrazyGames' `showAccountLinkPrompt` is
  for joining a CG account to a pre-existing in-game account. There is no
  in-game account on the portal build to join it to.

### Sweeping the old anonymous rows

Every portal visitor used to leave an anonymous `auth.users` row behind.
They are harmless but they accumulate. Count, then delete - the
`not exists` guard protects migrated portal players:

```sql
select count(*) from auth.users where is_anonymous;

delete from auth.users u
 where u.is_anonymous
   and not exists (select 1 from public.cg_link l where l.user_id = u.id);
```
