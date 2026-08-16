# Which tests to run, and when

You almost never need to run everything. Pick the recipe that matches
what you just changed.

All timings measured on this machine (2 cores). "Needs browser" means
puppeteer must be installed:

```bash
cd /tmp && npm install puppeteer --no-audit --no-fund
```

---

## TL;DR

| I just changed...                              | Run                                               | Time   |
| ---------------------------------------------- | ------------------------------------------------- | ------ |
| A card's numbers or a new card                 | `verify_all` + `verify_preview` + `verify_stacks` | ~26s   |
| Multiplayer / netcode / match flow             | `browser_mp_lifecycle`                            | ~15s   |
| Battlefields or energy                         | `verify_all` + `verify_fields`                    | ~50s   |
| Buffs, debuffs, comeback                       | `verify_all` + `verify_buffs`                     | ~47s   |
| `js/engine.js` (anything)                      | `verify_all` + `fields` + `buffs` + `mirror`      | ~2m    |
| UI / CSS / `js/play.js`                        | `browser_solo` + `browser_panel`                  | ~60s   |
| Icon markup or icon choices                    | `node tools/audit_icons.js`                       | <1s    |
| Battlefield scenes / animation                 | `browser_loops`                                   | ~45s   |
| Multiplayer or netcode                         | `mirror` + `browser_mp_match` + `browser_desync`  | ~20m   |
| Supabase settings                              | `preflight`                                       | ~5s    |
| Shop codes / redemption SQL                    | `node sim/verify_code_redemption.js`              | <1s    |
| Measurement / feedback                         | `node sim/verify_telemetry.js`                    | <1s    |
| Daily attempts / mode carousel                 | `node sim/verify_daily_ui.js`                     | <1s    |
| Platform flags / the CrazyGames build          | `node sim/verify_platform.js`                     | <2s    |
| Cloud saves, sign-in/sign-out, save collisions | `node sim/verify_save_ownership.js`               | <2s    |
| CrazyGames SDK / gameplay timing               | `node sim/verify_crazygames_sdk.js`               | <2s    |
| CrazyGames accounts / portal multiplayer       | `node sim/verify_cg_accounts.js`                  | ~7s    |
| Daily Puzzle generation / serialization        | `generate_daily_puzzle --dry-run`                 | ~5-60s |
| About to deploy                                | see [Before you deploy](#before-you-deploy)       | ~3m    |

---

## The playtesting loop

**This is the common case.** You are tuning numbers, adding a legend, or
trying a new Skill.

```bash
node sim/verify_all.js && node sim/verify_preview.js
```

About 25 seconds, 1,492 assertions (as of 2026-08-06). That is the only
test that has to pass while you iterate. It automatically covers **every faction** - it walks
`EOL.factions`, so a new `data/yourfaction.js` is picked up the moment
you register it. Nothing to wire up.

It catches, per card:

- stat bands per role, and the damage-budget law
- **icon exists in RPG Awesome 0.2.0 and is unique** (this is what
  caught `ra-two-shadows`, which rendered as an invisible glyph)
- no duplicate Skill specs, ids or names
- printed text only uses defined status words
- the Skill's actual engine outcome matches its printed text
- soak games asserting no negative HP, no double actions, no effects
  from dead legends

Then, when the numbers feel right, measure them:

```bash
node sim/run_parallel.js --games 5000 --seed 20260802
node sim/report.js
```

Reads `sim/results.json`, writes `sim/results.md`.

> **Do not run a sim to "check for bugs".** It is slow and it does not
> assert anything. `verify_all` is the bug check; the sim is the balance
> measurement.

---

## What each file is for

### `verify_all.js` - 1,492 assertions, ~25s

**The one that matters.** Whole-roster audit in three layers: static
(schema, bands, icons, keyword legality), dynamic (cast each Skill and
check the real outcome), soak (AI-vs-AI invariants). Run it constantly.

### `verify_preview.js` - ~1s

Hovering a Skill highlights who it will hit; that highlight must not
lie. Zeus lights up all six enemies, but if any are Marked he strikes
only those - so the preview used to promise five victims it would
never touch.

For every card with an active Skill, in three board states (clean, two
enemies Marked, two enemies debuffed), it previews, then really casts,
and asserts the preview never claims more victims than the cast
produced. Generic, so a new card that narrows its targets is covered
without a new test. Effectively free to run; run it with `verify_all`.

### `verify_fields.js` - 111 assertions, ~25s

The nine battlefields and energy carryover. Only run it if you touched
`data/battlefields.js`, energy, or the round rollover. Card changes
cannot break it.

### `verify_buffs.js` - 43 assertions, ~21s

Buff/debuff economy and the comeback grant. Run it if you touched
buffs, debuffs, `COMEBACK_PER_LEGEND`, or stat modifiers.

### `verify_mirror.js` - ~24s per 60 games

Proves the engine is **perspective-symmetric**: mirrored inputs must
produce mirrored outputs. This is what makes two-machine multiplayer
safe, and it found both real desync bugs (unstable target sorting;
delayed effects resolving in array order).

Scales linearly: `--games 60` ~24s, `--games 200` ~74s.

Run it whenever you touch `js/engine.js`. **Any new sort, any new
board-wide sweep, any new random draw is exactly what it catches.**

```bash
node sim/verify_mirror.js --games 60      # quick, while iterating
node sim/verify_mirror.js --games 500     # before shipping engine work
```

### `tools/audit_icons.js` - <1s

Enforces the boundary in [the icon system](icon-system.md): Remix Icon for interface chrome and RPG Awesome only for explicitly marked game-domain concepts. It also rejects Remix class names outside the pinned 4.5.0 catalog.

```bash
node tools/audit_icons.js
```

### `browser_solo.js` - ~45s, needs browser

Full singleplayer run in a real browser with **no backend configured**:
draft, bans, formation, battle. Fails on any console error. This is
your UI regression test.

### `browser_mp_match.js` - ~18m, needs browser

Two headless browsers play a **complete match** against each other,
comparing a board checksum after every action. Thorough and slow. Run
it when you change netcode, or before a release - not in a loop.

### `browser_panel.js` - ~13s, needs browser + a local server

Guards the legend panel's _rendered geometry_, which no source-level
test can see. Two real bugs live here:

- **Clipped Skill names.** `fitAbilityNames` used to predict the width
  flex would give the name; the prediction ran ~6px optimistic, so
  long names lost their last letters ("Divine Judgme"). It now
  measures the rendered result and steps down until it truly fits.
- **Silently undimmed Skills.** `.flyout.show .dk-ab` out-specifies
  `.dk-ab.dis`, so unusable Skills were restored to full opacity - the
  greyscale survived, the dim did not.

Needs a server running from the project root:

```bash
python3 -m http.server 8777
node sim/browser_panel.js
```

Run it after any change to the panel, the ability rows, or their CSS.

### `browser_loops.js` - ~45s, needs browser + a local server

Every battlefield background loops forever, so it must arrive back
exactly where it started or the restart shows as a visible snap. Found
three real offenders: the Energy Void gradient ended at 0.9 opacity
and jumped back to 0.15, the Mana Spring ripple ended mid-fade, and
Open Plains scrolled a 34px-period stripe by an arbitrary 90px.

Checks all ten boards. One subtlety worth knowing if you ever edit it:
`currentTime` includes the animation's DELAY, so the end of the first
cycle is at `delay + duration`. Sampling at `duration` lands mid-cycle
for every staggered particle and reports hundreds of false positives.

```bash
python3 -m http.server 8777
node sim/browser_loops.js
```

### `browser_mp_lifecycle.js` - ~15s, needs browser + a local server

Forfeit and the 30s turn clock, driven through two real clients. Two
players can stall or rage-quit; the bot never could, so none of this
existed before multiplayer.

```bash
python3 -m http.server 8777
node sim/browser_mp_lifecycle.js
```

### `verify_stacks.js` - ~1s

"Max: 4 stacks" must mean four for the WHOLE BATTLE. It used to count
only buffs currently held, which with a 2-round buff is barely a cap -
Red Riding Hood reached a **13,000 shield** in a live match. Run it if
you touch `addBuff`, `stackTag`, or any passive that stacks.

### `browser_quit_guard.js` - ~20s, needs browser + a local server

Leaving a ranked match forfeits it, so the exit is guarded - and the
guard must stay silent everywhere else. A warning that fires on every
page close gets ignored and protects nothing, so "does not nag" is
tested as carefully as "does warn".

```bash
python3 -m http.server 8777
node sim/browser_quit_guard.js
```

### `browser_desync.js` - ~2s, needs browser

Proves the desync guard actually fires (a guard that never fires is
worse than none). Fast enough to run any time you touch
`js/netplay.js`.

### `preflight.js` - ~5s

Interrogates your **live** Supabase project: tables, `try_match()`, the
Daily Puzzle gate, RLS, sign-in settings, and a real Realtime Broadcast
round trip. Run after any dashboard change. Migration 04 must be installed
before the Daily Puzzle checks report ready. Preflight cannot exercise the
signed-in generation lease, so older installs must apply migration 05
separately. The two-attempt client also requires migration 07. Atomic
single-user shop codes require migration 08; `verify_code_redemption.js`
audits that SQL before it is applied.

### `verify_code_redemption.js` - <1s

Exercises signed-in RPC claims, same-account replay rejection, the global
single-user loser path, public-code fallback, private-table permissions, and
the locked migration-08 claim contract.

### `verify_daily_ui.js` - <1s

Exercises the fresh, one-used, and exhausted two-attempt states against a
small dependency-free DOM. It also audits migration 07's numbered primary
key, 1–2 check constraint, concurrent-claim lock, and third-claim rejection,
then verifies the solo/multiplayer carousel and Guild Battles placeholder.

### `generate_daily_puzzle.js --dry-run` - ~5-60s

Runs the same depth-4 worker used by the scheduled Daily Puzzle job,
serializes its rounds 5-8 checkpoint, deserializes it, and requires an
exact second serialization before succeeding. A dry run never contacts
Supabase and needs no secret:

```bash
node tools/generate_daily_puzzle.js --dry-run
```

Use `--out /tmp/puzzle.json` when you need to inspect the packet. The tool
never contacts Supabase; official staging is performed by the leased browser
Web Worker through migration 04's authenticated RPC.

### `full.js` - the balance command, ~40 min

Not a test - it asserts nothing. **This is the one command for a
balance check.** Three passes (random+bans, draft+bans, forced
inclusion per legend), four metrics per legend, Wilson confidence
intervals throughout.

```bash
node sim/full.js            # ~40 min at depth 4
node sim/full.js --quick    # ~4 min, pipeline test only
```

Read section 0 of `sim/full.md` first. See
**[SIM-METHODOLOGY.md](SIM-METHODOLOGY.md)**.

### `sim.js` / `run_parallel.js` / `report.js`

The individual pieces `full.js` drives. Use them directly only for a
specific comparison, such as depth 2 against depth 4 on a fixed seed.

They now take `--teams random|draft|pairs` and `--depth N`, which exist
because random draw cannot measure combos: the 63-legend roster has 1,953
possible pairs and a 1,200-game run gives the best-covered one just a
few dozen games. See **[SIM-METHODOLOGY.md](SIM-METHODOLOGY.md)** for what each
mode answers and how to read a disagreement between them.

---

## `verify_roma.js` - deleted, and why

You were right that it was archaic. It has been **removed**, but its
useful assertions were **ported into `verify_all.js` first**, not
thrown away.

It was frozen in time: it deliberately loaded only a **7-faction
subset** and asserted `7 factions total` / `45 legends total`. You have
**9 factions and (now) 63 legends**. It passed only because it never
loaded `takamagahara.js` or `duat.js` - so it would have kept showing a green
tick no matter what broke in the two newest factions. A test that
cannot fail is worse than no test.

Most of what it did (stat bands, icon uniqueness, text keyword
legality) `verify_all` already does across the _whole_ roster. Four of
the six Roma legends also already had behaviour probes there.

The genuine gap was **Spartacus and Augustus** - death-triggered
passives, which the `PROBES` table cannot reach because it only casts
a legend's own signature. Those are now a dedicated
`D. DEATH-TRIGGERED PASSIVES` section in `verify_all.js`, written
against the live roster:

- Spartacus: an ally dying gives every survivor the ATK stack, and
  shields him
- Augustus: a team kill heals exactly two allies, not the whole team

Assertion count went **1,326 -> 1,331**. Both new checks were
mutation-tested (deliberately broken to confirm they fail), so they
genuinely bite rather than passing vacuously.

---

## Recipes

### While playtesting cards

```bash
node sim/verify_all.js && node sim/verify_preview.js
```

### After engine changes

```bash
node sim/verify_all.js && \
node sim/verify_preview.js && \
node sim/verify_fields.js && \
node sim/verify_buffs.js && \
node sim/verify_mirror.js --games 60
```

~2 minutes.

### After UI changes

```bash
node sim/browser_solo.js
```

### After netcode changes

```bash
node sim/verify_mirror.js --games 200 && \
node sim/browser_desync.js && \
node sim/browser_mp_match.js
```

### Before you deploy

```bash
node sim/verify_all.js && \
node sim/verify_preview.js && \
node sim/verify_fields.js && \
node sim/verify_buffs.js && \
node sim/verify_mirror.js --games 200 && \
node sim/browser_solo.js && \
node sim/browser_desync.js && \
node sim/preflight.js
```

~3 minutes. Skips `browser_mp_match` (18m) - run that separately if you
touched multiplayer.

### Everything

Add `node sim/browser_mp_match.js` to the above. ~21 minutes.

---

## Housekeeping

- `sim/fixtures/rpg-awesome-icons.txt` is **required** by `verify_all`
  and `verify_fields`. Without it the icon assertions **silently skip**
  rather than fail - and a bad icon renders as an invisible glyph you
  will not notice in a screenshot. Do not delete it.
- `sim/results.json` and `results.md` are build artifacts. Safe to
  delete; regenerated by a sim run.
- The old baseline JSONs were pruned. `report.js` treats
  `--control` / `--baseline` as optional and degrades to current-only
  figures. To get before/after back, keep a copy of a `results.json`
  and pass `--baseline <file>`.
- Nothing in `sim/` is ever loaded by the browser. It does not need to
  be uploaded to your host.
