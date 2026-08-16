# Quests — the Daily and Weekly board

**Status:** Implemented (Daily + Weekly). Seasonal quests are deliberately **not** built; see §7.

**Revised 2026-08-16:** the board no longer closes (§6.1), the weekly tier is eight
multi-day objectives instead of three long dailies (§2), and coin values are computed
from how much work an objective actually is instead of being a flat per-tier number
(§2.1).

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
ordinary result on the same pay path. So a naive "play N matches" quest is a forfeit-farm
button: quit instantly, collect, repeat.

**No quest counts wins or losses, ever.** Most objectives count something that only
accumulates *inside* a fight — damage dealt, healing done, shields raised, signatures
cast, role basics used, crits landed, legends defeated. Rushing them means playing the
game.

Some quests *do* count battles ("play 10 Draft battles", "fight on 6 different
battlefields"), because a board that never mentions the modes cannot encourage anyone to
leave their favourite one. Those count only a **qualifying battle**, defined once in
`js/battle.js#questQualifies()`:

- not forfeited (`B._forfeited`),
- at least **3 rounds** played,
- at least **3 of your own actions** taken.

So the fastest way to finish "play 10 Draft battles" is to play ten drafts. The Daily
Puzzle is exempt from the round/action floor and always counts a finished attempt: it
cannot be farmed at all (two server-granted attempts per reset, and a win closes the
day), and the good solution to a puzzle is the short one.

---

## 2. The two tiers

| Tier | Count | Reset | Shape |
|---|---|---|---|
| Daily | 3 | every day, 7:00 AM America/New_York | one session |
| Weekly | 8 | Monday, 7:00 AM America/New_York | several days |

A weekly tier of three was a *long daily*. Eight is a week: no single objective can be
finished in a sitting, and two of the slots are reserved (§2.2) so a week always has a
reason to leave your favourite mode.

### 2.1 Rewards are computed, not hand-written

Every objective declares `unit` — how much of its metric a single ordinary battle
produces (`EOL.quests.PER_BATTLE`). Those numbers are **measured, not guessed**: 60 full
six-on-six battles driven by `js/ai.js` on both sides over random rosters produced, per
battle, 48,053 damage / 7,302 healing / 6,444 shielding / 4.4 kills / 10.7 rounds / 13.3
signatures / 21.1 basics / 3.2 distinct elements / 0.5 crits. `PER_BATTLE` rounds those
conservatively downwards, because a human clears a board a little slower than a depth-4
search does. From that:

```
effort  = target / unit          # in battles
reward  = clamp(effort × RATE[tier])
```

| | rate / battle | floor | ceiling | typical length |
|---|---|---|---|---|
| Daily | 26 | 40 | 130 | 1.4 – 4.3 battles |
| Weekly | 14 | 70 | 340 | 4.3 – 18.8 battles |

A quest that takes four times as long pays roughly four times as much, automatically —
retuning a target retunes its payout with it, and no two quests of equal length can drift
to different prices.

The weekly rate is **lower per battle than the daily one on purpose**: the eight weeklies
run in parallel. One fight advances the damage quest, the crit quest and the rounds quest
at once, so paying each of them a daily rate would pay for the same four minutes eight
times.

The all-clear bonus is likewise derived: **half of what its own tier's quests paid**, so
it scales with the board instead of drifting away from it.

A player who clears everything earns roughly **3,900 coins/week** (≈2,100 daily +
≈1,800 weekly), which lands squarely in the band the Echo Shard economy in
`DESIGN-Card-Upgrades.md` was tuned against (3,450) — a little higher, because there is
meaningfully more to do.

The eight weeklies total roughly **84 battles** of nominal effort, but they run in
parallel: a single fight can advance five of them at once, so the real cost of a full
week is far below the sum. What the size buys is that no single sitting finishes the
tier.

### 2.2 The reserved weekly slots

An unconstrained draw of eight can legitimately roll a week with no reason to play
anything new, which is the one thing the weekly tier exists to prevent. So two of the
eight are reserved before the ordinary draw:

1. one **mode** quest (`play N Classic / Draft / online / campaign battles`),
2. one **variety** quest (a `kind: 'set'` objective — N different modes, battlefields,
   factions, roles or damage elements).

The rest is the normal deterministic pick. The whole thing is still a pure function of
the week key, so every player gets the identical eight. They are presented lightest
first, so the board reads as a ramp.

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

Each objective is a `{ id, tier, kind, family, text, icon, metric, target, unit }`. The
pool is around 60 objectives against 11 slots, so a week is genuinely different from the
last.

`kind` decides how progress is counted:

| kind | Progress is | Example |
|---|---|---|
| `sum` | accumulated across the period | deal 200,000 damage |
| `best` | the best **single battle** | reach round 14 in one battle |
| `set` | the number of **distinct tokens** collected | fight on 6 different battlefields |

The metrics:

| Metric | Counts |
|---|---|
| `damage` / `healing` / `shield` | dealt, restored, raised by your side |
| `abilities` | signature skills cast |
| `basics` | role basics used (Guard / Strike / Spell / Disrupt / Restore / Aim) |
| `crits` | critical hits landed |
| `kills` / `rounds` | legends defeated, rounds survived |
| `battleDamage` / `battleKills` / `battleRounds` | the same, best single battle (`best`) |
| `factions` | distinct factions in one battle (`best`) |
| `elem:<Element>` | damage of one element — Fire, Shadow, Lightning… |
| `sig:<cardId>` | one **specific legend's** signature, e.g. Cinderella's Glass Slipper |
| `basic:<Role>` | one **specific role's** basic, e.g. the Sniper's Aim |
| `mode:<mode>` | qualifying battles in Classic / Draft / online / campaign |
| `setModes` / `setFields` / `setFactions` / `setRoles` / `setElements` | variety (`set`) |
| `dailyPuzzle` | Daily Puzzle attempts completed |

Two rules keep the generated quests honest:

- **A quest you cannot start is not a quest.** `sig:` objectives are drawn only from the
  starter twelve (Grimmwood), which every player owns forever, and only from **Active**
  abilities — you cannot cast a passive.
- **One quest per `family` per board.** Eight flavours of "deal N of an element" would
  read as one quest with a bigger number, so `element`, `signature`, `basics`,
  `mode-<x>` etc. each get at most one slot. `abilities` shares the `signature` family
  with the per-legend quests, and `basics` shares with the per-role ones.

### 3.1 Selection is deterministic per period

The shown quests are chosen by seeding a small PRNG with a hash of the period key.
Every player on the same day sees the **same three dailies** and the same eight weeklies
— which makes them discussable, and means a reroll cannot be farmed by clearing storage.

---

## 4. Progress recording

`EOL.quests.recordBatch(map)` is the single entry point (`record(metric, amount)` is the
one-metric convenience form). It is called from:

- `js/battle.js#questBatch()`, at battle end — one receipt for the whole fight, built
  from the engine's own `B.tally` (damage, healing, shielding, kills), `B.round`, the
  battle log (per-element damage and crits), and per-action counters accumulated in
  `commit()` (`_questCasts`, `_questBasics`, `_questSig`, `_questRoleBasic`);
- `js/daily.js`, on a completed puzzle attempt, for `dailyPuzzle`.

Recording at battle end rather than per-hit means a disconnect mid-fight banks nothing,
which is the correct anti-abuse behaviour and also avoids a write per damage tick.

The battle-counting half of the receipt (`mode:*`, `setModes`, `setFields`) is only added
when `questQualifies()` passes (§1.1). Per-fight progress you actually earned still banks
even from a conceded game — you did the damage.

**Draft, Daily Puzzle and multiplayer all count.** The upgrade system is restricted by
mode; quests are not. Playing any mode is playing the game.

---

## 5. Claiming

A finished quest is **not** paid automatically — the player clicks **Claim**. This is
deliberate: an auto-paid quest is invisible, and the click is the moment the board
justifies its existence. Claims are idempotent and recorded per period key, so a
double-click, a reload mid-claim, or a cloud restore cannot pay twice.

The completion bonus unlocks only when **every** quest of its tier is individually
claimed, and pays half of what that tier's quests paid.

---

## 6. The board

A floating panel on the **right** of the home screen, opposite the Discord/tutorial
stack on the left.

### 6.1 It does not close

*(Owner ruling 2026-08-16.)* There is no close button, no collapse tab, and no persisted
collapsed state. A board you can dismiss is a board a returning player never sees again,
which is the entire reason it exists.

That makes narrow viewports a **layout** problem rather than a visibility one. The old
1404px collision maths is still the boundary — the panel is 330px at `right:22`, so it
owns the last 352px, and `.home-inner` is a centred 700px column whose right edge sits at
`(W + 700) / 2`; they collide at `W = 1404`, rounded to 1440 — but it now selects a
layout instead of hiding the board. `js/quest-board.js` writes `body[data-qb]`:

| mode | logical width | behaviour |
|---|---|---|
| `free` | ≥ 1440px | the panel floats in the right margin, menu stays centred |
| `reserve` | ≥ 980px | `.home-inner` reserves 352px and shifts left, so nothing overlaps |
| `stack` | < 980px | `.home` scrolls and the board sits in flow under the menu buttons |

The measurement uses the **logical** viewport (`innerWidth / EOL.scale.factor()`), not
the device one — GUI scale is real browser zoom, so a 1440px screen at 110% is a 1309px
layout and must reserve.

### 6.2 What the panel says

Each tier tab carries its own countdown (the weekly one is computed by walking forward to
the first 7 AM boundary in a new week key, not approximated) and a `claimed/total`
counter, so "2/8" is visible without opening the weekly tab. Unclaimed rewards pulse the
panel edge and show a count badge in the header. A cumulative weekly worth several
sessions is tagged *"4-day goal"*, so a big number reads as a week's target rather than
an impossible day.

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

One key, `eol.quests.v2`, holding the period keys, per-quest progress, the distinct-token
lists for `set` quests, and the claim ledger. The version bump is a deliberate hard reset:
a `v1` save describes objectives that no longer exist, so it is discarded rather than
half-restored. It is registered in the `cloud.js` `MAP` table, so it rides the existing account
sync with no new migration.

Quests are **client-authoritative**, matching the wallet they pay into. This is a
deliberate distinction from the Daily Puzzle, which is server-tracked because it is a
*shared competitive object* where one player's integrity affects another's comparison.
Quest progress is personal progression into an already client-side wallet; a server
deadbolt on that door would guard a house with no walls.

If quests ever gate a leaderboard, this decision must be revisited.
