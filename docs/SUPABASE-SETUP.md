# Supabase setup - accounts, multiplayer, and Daily Puzzles

The goal: **two people on different computers can play online, saves follow
an account, and every signed-in player receives the same one-attempt Daily
Puzzle.** Nothing here is ranked yet - the ladder is ROADMAP Phase 4; the
online modes remain unranked.

---

## Current status of project `ghchcvrojojrlbgqbvga`

Measured by `node sim/preflight.js`, not assumed:

| | Item | State |
| --- | --- | --- |
| OK | Project URL and publishable key in `js/supabase-config.js` | done |
| OK | Key authenticates, RLS blocks anonymous writes | done |
| OK | Email sign-in, signups open, **auto-confirm on** | done |
| OK | Redirect URL for your host | done |
| OK | **Realtime Broadcast** - tested with two live clients | working |
| OK | `profiles`, `saves` tables | present |
| OK | `mp_queue`, `mp_matches` tables | **created** |
| OK | `try_match()` function | **created** |
| SETUP | Daily Puzzle migration 04 | run section 4d once |

**Accounts and multiplayer are ready.** `node sim/preflight.js` confirms two
signed-in players can queue and play. Daily Puzzle publication becomes live
after the single migration 04 SQL paste in section 4d.

---

## THE BACKEND MAP (cleanup 2026-08-10)

Seven tables. If the dashboard shows unrelated leftovers, run the cleanup
in section 9b. Everything the backend holds, in one look:

| Table | Written by | What it holds |
| --- | --- | --- |
| `profiles` | `js/auth.js` | Identity: the callsign your opponent sees. One row per user. |
| `saves` | `js/cloud.js` (THE VAULT) | The whole player save as ONE readable json: `wallet`, `owned`, `campaign`, `decks`, `settings`, `flags`. One row per user. |
| `mp_queue` | `js/mp.js` | Who is waiting for a match. Rows die the instant a pair is made. |
| `mp_matches` | `js/mp.js` | The paired match + its shared `seed`. |
| `daily_puzzles` | Leased browser forge + database cron | At most two serialized positions: current `active` and tomorrow's `staged`. |
| `daily_puzzle_attempts` | Daily Puzzle RPCs | One claim per account for the active puzzle; deleted with yesterday's position. |
| `daily_puzzle_jobs` | `js/daily.js` | One short generation lease so many open browsers still run only one forge. |

| Function | Called by | Job |
| --- | --- | --- |
| `try_match()` | mp.js | Atomic pairing (`for update skip locked`). |
| `find_my_match()` | mp.js | Rejoin after a refresh. |
| `touch_match()` / `save_match_state()` / `end_match()` | mp.js | Match lifecycle. |
| `claim_daily_generation()` / `submit_daily_candidate()` | `js/daily.js` Web Worker | Elect one signed-in browser to forge and stage the shared position. |
| `publish_daily_puzzle()` | pg_cron / overdue browser | Atomically promote staged at 7 AM Eastern. |
| `daily_puzzle_status()` / `claim_daily_puzzle()` / `finish_daily_attempt()` | `js/daily.js` | Check, atomically consume, and finish one official attempt. |

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
> | Key | Looks like | Goes where |
> | --- | --- | --- |
> | Publishable / anon | `sb_publishable_...` or `eyJ...` | **This game.** Safe in browser code. |
> | Secret / service_role | `sb_secret_...` | Servers only. **Never here.** |

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

| Object | Purpose |
| --- | --- |
| `profiles` | Display name shown to your opponent. |
| `mp_queue` | Who is waiting for a match. Rows are deleted the instant a pair is made. |
| `mp_matches` | The match, and its `seed` - the shared randomness both clients build the draft, battlefield and battle luck from. |
| `try_match()` | Atomic pairing. `for update skip locked` is what stops two clients claiming the same opponent. |
| RLS policies | What makes the publishable key safe to ship in browser code. |

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

| Object | Purpose |
| --- | --- |
| `p1_seen` / `p2_seen` | Heartbeat timestamps, written every 15s by each client. |
| `touch_match()` | "I am still here." Can only ever update the caller's own timestamp. |
| `end_match()` | Closes a match on a natural finish or a forfeit. |
| `sweep_matches()` | Closes matches where **both** sides have been quiet 90s, and clears stale queue rows. |
| `find_my_match()` | The rejoin lookup, called at page load. |

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

| Object | Purpose |
| --- | --- |
| `mp_match_state` | Stores a snapshot of the match at each phase boundary. |
| `save_match_state()` | Writes the current game state (called by the host after every phase change). |
| `find_my_match()` | Returns the persisted state so the rejoining client resumes where it left off. |

## 4d. Migration 04 - official Daily Puzzle

Run **[`docs/supabase-migration-04.sql`](supabase-migration-04.sql)** in the
SQL Editor. That single paste is the whole setup—there is no GitHub Action,
server secret, Edge Function, or additional hosting.

It creates:

- `daily_puzzles`, hard-capped by its unique `active` / `staged` slots to
  **two positions at most**;
- `daily_puzzle_attempts`, with `(puzzle_id, user_id)` as its primary key;
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

A player's attempt is consumed inside `claim_daily_puzzle()` immediately
before the board is returned. Merely opening the Daily Puzzle card does not
consume it; once the battle opens, closing or refreshing cannot restore it.
Official Daily Puzzles therefore require a signed-in account. The original
interactive generator remains available to developers at `?dailyLab=1`.

## 5. Realtime - nothing to do

**Skip this step.** Realtime Broadcast is on by default for every
Supabase project and needs no configuration.

An earlier version of this document told you to visit **Database ->
Replication**. That was wrong and sent people hunting for a switch that
does not apply. Here is the distinction:

| | What it is | Does this game need it? |
| --- | --- | --- |
| **Broadcast** | Clients send ephemeral messages to each other through a named channel. Never touches the database. | **Yes** - this is all the game uses. On by default. |
| **Postgres Changes** | The database streams row inserts/updates to clients. Configured per table under Database -> Replication. | **No.** |

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

| Piece | Approach |
| --- | --- |
| Matchmaking | `try_match()` in Postgres. `for update skip locked` makes a double-claim impossible. |
| Match channel | Supabase Realtime **Broadcast**, one channel per match id. |
| Draft sync | Only `{pack, idx}` crosses. Both clients build the identical pack order from the shared `seed`, so the card pool is never transmitted. |
| Bans | Both sides submit blind. Neither reveal happens until **both** have landed, so committing first cannot leak your picks. |
| Battlefield | Derived from the match seed on both clients, so the terrain always matches. |
| Battle | One message per action, naming heroes by `(side, index)` - never by `uid`, which differs per browser. Each client recomputes the result with its own engine. |
| Luck | Crits and coin flips come from one seeded PRNG per match, consumed in the same order on both sides. |
| Turn order | Each client calls itself `player`, so the engine takes `oddFirst`: the host opens odd rounds, the guest even ones. |
| Drift detection | Every action carries a checksum of the resulting board. A mismatch stops the match instead of letting two different games play on. |
| Disconnects | Realtime presence `leave` returns both players to the menu with a notice. |

### Two engine bugs this work uncovered

Both were real, both were latent in singleplayer, and both are fixed:

- **Unstable target sorting.** "Lowest HP" and "highest ATK" selectors
  broke ties by array order. Ties are common (shared statlines, full-HP
  openings), so two clients could heal or execute *different* heroes.
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
  the next step, and it has to come *before* trophies mean anything.
- **Server-authoritative ECONOMY.** The vault stores whatever the client
  says the wallet holds - RLS keeps players out of *each other's* rows,
  not out of their own. The day coins are sold for money, wallet writes
  must move behind an Edge Function that is the only thing allowed to
  add coins. Until then a cheater can only cheat themselves.

## Verifying it works

Start here. It interrogates your **live** project and tells you
whether two people can actually queue right now:

```bash
node sim/preflight.js
```

It checks the config shape, that the key authenticates, that all four
tables and `try_match()` exist, that RLS really is blocking anonymous
writes, and that sign-up is open. A failure names the fix.

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

| Symptom | Cause |
| --- | --- |
| "Accounts are not configured yet" | `js/supabase-config.js` is still blank. |
| Console: "REFUSING TO START SUPABASE" | You pasted a secret key. Use the publishable one. |
| "Multiplayer tables are missing" | The SQL in steps 2-3 has not been run. |
| Sign-in does nothing on `file://` | Serve over http (step 7). |
| Stuck at "Looking for an opponent" | Only one player is queued, or the two are signed in as the same account. |
| Paired but the draft never starts | Realtime is off for the project (step 5). |

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
owned cards, campaign progress, decks, settings, tutorial flags.
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
  "flags": { "tutorialIntro": "1", "tips": {} }
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
2. **The account is the save.** Sign-in pulls the vault; if the account
   already has one, it wins over the device (one clean reload applies
   it). A brand-new account adopts the device's current save as its
   first vault. Signing out changes nothing locally.
3. **The vault is never half-written.** The whole snapshot travels in
   one upsert; there is no per-key merge that could tear the wallet
   away from the collection it paid for.

Pushes: a 4-second dirty-check loop, an immediate nudge on economy
events, and a flush when the tab hides. Failures are silent and the
next tick retries.

**Monetization note:** RLS protects players from each other, not from
themselves. Before coins are ever sold for money, wallet writes must
move server-side (Edge Function) - see the list above.
