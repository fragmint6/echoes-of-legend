# Quests — the Daily and Weekly board

**Status:** Implemented (Daily + Weekly). Seasonal quests are deliberately **not** built; see §7.

**Purpose:** Give a returning player a reason to come back today, and give the coin
economy somewhere to point now that duplicates and Echo Shards have created real sinks.

This document records the quest design. It does not silently reorder `ROADMAP.md`.

---

## 1. Product principles

- A quest is a **byproduct of playing normally**, never a target you rush.
- The board tells you *why to come back*; that is most of its value, above the rewards.
- Guests get quests. Nothing here is account-gated. (Consistent with the standing rule
  that CrazyGames guests are never hard-blocked from the Daily Puzzle.)
- Quests never ask the player to lose, forfeit, or play badly.

### 1.1 The anti-farm law

Match pay already rewards a loss (25 singleplayer / 50 PvP) and a forfeit produces an
ordinary result on the same pay path. So a "play N matches" quest is a forfeit-farm
button: quit instantly, collect, repeat.

**Therefore no quest counts matches, wins, or losses as its unit.** Every objective
counts something that only accumulates *inside* a fight — damage dealt, healing done,
shields raised, abilities cast, legends defeated. Rushing them means playing the game.

The one exception is `dailyPuzzle`, which cannot be farmed at all: the server grants two
attempts per reset and a win closes the day.

---

## 2. The two tiers

| Tier | Count | Reset | Reward each |
|---|---|---|---|
| Daily | 3 | every day, 7:00 AM America/New_York | 60 coins |
| Weekly | 3 | Monday, 7:00 AM America/New_York | 250 coins |

Plus completion bonuses: **120 coins** for all three dailies, **600 coins** for all
three weeklies.

Full daily clear = 300 coins/day. Full weekly clear = 1,350 coins/week. A player who
does everything earns roughly **3,450 coins/week**, which is the number the Echo Shard
economy in `DESIGN-Card-Upgrades.md` is tuned against.

### 2.1 Reset timing

Both tiers use the **Daily Puzzle's existing boundary** — 7:00 AM Eastern, computed with
the same DST-safe `Intl.DateTimeFormat` technique already in `js/daily.js`. Two
definitions of "day" in one game is a bug factory.

The shared helper now lives in `js/quests.js` as `EOL.quests.dayKey()` /
`weekKey()`. Weeks anchor to **Monday** on the same 7 AM line.

A reset is detected lazily: whenever the board is read or progress is recorded, a stored
period key is compared against the current one. If it differs, that tier is rerolled.
There is no timer, so a tab left open overnight rolls over the moment it is touched.

---

## 3. The objective catalogue

Each objective is a `{ id, tier, text, icon, metric, target }`. The pool is deliberately
larger than the three slots so a day feels different from the last.

| Metric | Counts | Notes |
|---|---|---|
| `damage` | ATK damage dealt by your side | the workhorse |
| `healing` | HP restored by your side | |
| `shield` | shield points raised by your side | |
| `abilities` | signature abilities cast | not basic attacks |
| `kills` | enemy legends defeated | |
| `rounds` | rounds survived | rewards long fights, not quick quits |
| `factions` | distinct factions fielded | encourages roster breadth |
| `dailyPuzzle` | Daily Puzzle attempts completed | unfarmable by construction |

Daily targets are sized so a normal session (2–4 fights) clears two or three of them.
Weekly targets are roughly 6× a daily.

### 3.1 Selection is deterministic per period

The three shown quests are chosen by seeding a small PRNG with a hash of the period key.
Every player on the same day sees the **same three dailies** — which makes them
discussable, and means a reroll cannot be farmed by clearing storage.

---

## 4. Progress recording

`EOL.quests.record(metric, amount)` is the single entry point. It is called from:

- `js/battle.js`, at battle end, from the accumulated `B.tally` (damage, healing,
  shielding, kills) plus `B.round` and the distinct factions fielded;
- `js/battle.js`, on each signature cast, for `abilities`;
- `js/daily.js`, on a completed puzzle attempt, for `dailyPuzzle`.

Recording at battle end rather than per-hit means a disconnect mid-fight banks nothing,
which is the correct anti-abuse behaviour and also avoids a write per damage tick.

**Draft, Daily Puzzle and multiplayer all count.** The upgrade system is restricted by
mode; quests are not. Playing any mode is playing the game.

---

## 5. Claiming

A finished quest is **not** paid automatically — the player clicks **Claim**. This is
deliberate: an auto-paid quest is invisible, and the click is the moment the board
justifies its existence. Claims are idempotent and recorded per period key, so a
double-click, a reload mid-claim, or a cloud restore cannot pay twice.

The completion bonus unlocks only when all three of its tier are individually claimed.

---

## 6. The board

A floating panel on the **right** of the home screen, opposite the Discord/tutorial
stack on the left. Collapsible to a tab; the collapsed state persists.

It auto-collapses under **1440px**, derived rather than guessed: the panel is 330px at
`right:22`, so it owns the last 352px, and `.home-inner` is a centred 700px column whose
right edge sits at `(W + 700) / 2`. They collide when `W - 352 = (W + 700) / 2`, i.e.
**W = 1404**, rounded up to 1440 for breathing room.

The measurement uses the **logical** viewport (`innerWidth / EOL.scale.factor()`), not
the device one — GUI scale is real browser zoom, so a 1440px screen at 110% is a 1309px
layout and must fold.

A deliberate collapse or expand is never overridden by a later resize.

Claimable quests pulse a badge on the collapsed tab, so a collapsed board still tells
you there is something to collect.

---

## 7. Why Seasonal is not built

A seasonal quest is a three-month commitment whose reward almost has to be exclusive — a
cosmetic, a title, or a card. None of those systems exist. There is also no season
boundary in the codebase, and per `ROADMAP.md` the ladder itself is not trustworthy yet
("matches need server-side verification before rating can be trusted").

Seasonal quests should arrive **with** verified trophies, when a season means something.
Until then two tiers give the board a cleaner shape.

---

## 8. Storage and trust

One key, `eol.quests.v1`, holding the period keys, per-metric progress, and the claim
ledger. It is registered in the `cloud.js` `MAP` table, so it rides the existing account
sync with no new migration.

Quests are **client-authoritative**, matching the wallet they pay into. This is a
deliberate distinction from the Daily Puzzle, which is server-tracked because it is a
*shared competitive object* where one player's integrity affects another's comparison.
Quest progress is personal progression into an already client-side wallet; a server
deadbolt on that door would guard a house with no walls.

If quests ever gate a leaderboard, this decision must be revisited.
