# The Daily Puzzle — position generation and the length contract

**Status:** Implemented.

**Revised 2026-08-16 (owner ruling):** *"Redo the puzzle engine, games are dragging out
way too long right now, make it so that the intended solution is like 3-5 rounds."*
The forge now filters on **tempo** (§3), certifies against a **deadline** (§4), and tests
against **obvious play** (§5).

**Amended same day (owner ruling):** *"people can take more rounds if they need to - I just
want the intended solution to be 3-5 rounds and that's working."* The round limit and its
HUD countdown chip are **removed** (§6). 3-5 rounds is a guarantee about the position the
forge publishes, not a clock the player runs against.

This document records the design of the puzzle *generator*. The attempt ledger, the
two-attempt rule and the publication lease are described in `docs/supabase-migration-04.sql`
and `docs/supabase-migration-07.sql`, and are unchanged by this revision.

---

## 1. What a Daily Puzzle is

A checkpoint from a real, unrestricted engine battle, paused on a player decision in
rounds 5–8, published to every player with the same board **and the same future RNG**.
No position is authored by hand. There is no position list.

The player's job is to find a winning line from a position the AI reached on its own.

---

## 2. What was wrong

The forge optimised for exactly one property: *does depth-4 AI, playing the player side,
eventually win?* "Eventually" meant `ROUND_CAP = 20`.

Nothing in the scoring function knew how **long** the win took. Worse, the checkpoint
ranker sorted by health parity toward 0.47, which systematically preferred the single
worst shape for a puzzle: a near-full-health 6v5 board. Those positions are "balanced"
in the only sense the ranker could see, and they are also grindy.

Measured over 130 candidate checkpoints (60 AI-vs-AI scouting battles):

| | |
|---|---|
| Winning continuations that finished within 5 rounds | **63 / 170** |
| Longest winning continuation | **17 rounds** |
| Mean full-battle length | ~10 rounds |

So the modal experience of the Daily was a ten-to-fourteen round grind, which is the
complaint.

---

## 3. Tempo — the prefilter

`tempo(B)` = enemy effective HP ÷ (player total ATK × 0.85).

Roughly, *"how many full-team attack rounds of punishment can the enemy still absorb."*
Shields count at **full** weight (unlike `checkpointStrength`, which discounts them to
0.65) because a live shield is health the player must actually remove before the clock
runs out.

Measured against real solve lengths, this crude estimate is a near-perfect classifier:

| tempo | checkpoints | ever solved in ≤5 rounds |
|---|---|---|
| 0–2 | 8 | yes, always |
| 2–3 | 16 | 89% |
| 3–4 | 26 | 25% |
| **4+** | **80** | **never — not once, at any trial count** |

`TEMPO_MIN = 1.15`, `TEMPO_MAX = 3.6`.

The ceiling sits at 3.6 rather than at the observed 4.0 cliff **on purpose**: the estimate
ignores enemy healing, shield regeneration and revives, all of which push the true figure
up and none of which push it down. The margin is the safety factor.

The gate runs at capture time, before the checkpoint is even cloned. This is also why
generation got roughly ten times faster — the old forge spent nearly all of its time
running twenty-round rollouts of positions that could never have qualified.

Tempo is *also* a ranking term (weight 0.10, centred on 2.4), so that within the band the
forge prefers the middle over the edges.

---

## 4. The deadline

`solveBy = round + SOLVE_MAX - 1`, with `SOLVE_MIN = 3` and `SOLVE_MAX = 5`.

Counted **inclusively** from the checkpoint round: a puzzle that opens in round 6 must be
won in round 6, 7, 8, 9 or 10.

Every continuation trial now stops at the deadline, and **a win after the deadline is
scored as a loss.** The calibrated win rate therefore means "the AI found the win *in
time*", not "the AI ground one out". `ROUND_CAP` is gone entirely; it had quietly become
the design rather than a safety valve.

`SOLVE_MIN` is not decoration. Without a floor, the tempo filter's own success case
becomes the new failure mode: the very lightest boards are won by mashing the obvious
attack once, which is not a puzzle either. A certified line shorter than three rounds is
rejected.

The floor is applied in `certifyRecord`, not inside `runContinuationReport`, because a
fast win is a perfectly good **calibration** datapoint — it tells the sampler the board is
winnable. It is just not publishable. Conflating the two would let a one-move board be
scored as *unwinnable* and drag its candidate's rate away from target for the wrong reason.

---

## 5. Tightness — the obvious-move test

### 5.1 What was replaced

The old gate counted how many different **first moves** still win, and demanded 1–2.

Under a deadline it stopped working, and measuring it showed why: it varies only move one
and then hands the position to a full-strength depth-4 player for the rest of the line.
That player repairs almost any opening, so the count collapsed to "nearly all of them" —
**9 of 9** certifiable candidates in a calibration run scored 3+ and were rejected. This
is why the first build of this rewrite could not publish anything at all despite a correct
prefilter, a correct deadline and a correct serializer.

It also measured the wrong property. A puzzle is not "only one legal first move"; it is
*"you have to keep playing well."*

### 5.2 What replaced it

`naiveSolves()` replays the identical position on the identical RNG stream, but the player
side plays the top heuristically-ordered candidate **every turn with no lookahead**, while
the enemy keeps full depth-4 search. That models a player who reads each board once and
clicks the move that looks strongest.

**If the naive player also wins in time, the position is rejected** — the board wins
itself and the "winning line" was never something the player had to find.

The naive player uses `AI.candidates()` ordering rather than random legal moves on purpose:
random play loses to everything and would certify every position, whereas the heuristic
ordering approximates what an attentive human tries first, which is the standard the puzzle
actually has to beat.

Measured: 16 of 16 certified positions passed, and all 16 solved in 3–5 rounds. The old
opening-line counter is kept as a diagnostic and is exported, but no longer gates
publication.

### 5.3 The calibration band widened

`0.2–0.4` → `0.2–0.8`.

The old narrow band assumed the fast-budget win rate was a difficulty dial. Under a
deadline it is not: the same checkpoint scores near 0 or near 1 depending on whether the
deliberately-crippled scouting budget happens to find the tempo line in time, so measured
rates cluster at the ends rather than spreading around 0.3. Holding the old window
discarded most genuinely certifiable positions on sampling noise.

Difficulty is now enforced where it is actually measured — the `SOLVE_MIN` floor and the
obvious-move test, both run at full depth-4 strength. The cheap screen's only remaining job
is to skip candidates that never win.

---

## 6. The player is not on a clock

For one revision the certified deadline was also enforced during play: rolling past
`solveBy` ended the battle as a loss, and a HUD chip counted the rounds down.

**Both are removed.** The distinction that replaced them is the whole design:

> 3-5 rounds is a property of the **position**, guaranteed at generation time.
> It is **not** a property of the player's session.

Enforcing it turned a promise about puzzle quality into a punishment for thinking slowly,
and it punished precisely the players the difficulty is aimed at — a strong player finds
the line inside the window anyway and never sees the limit, while a learning player gets
the board taken away mid-thought. The chip went with it: the player opened the Daily Puzzle
deliberately from its own card and modal, so a badge restating that was noise once it had
no countdown to show.

What this changes, and what it does not:

| | |
|---|---|
| Tempo prefilter | **unchanged** — still runs at capture time |
| Deadline-capped calibration trials | **unchanged** — a win after the deadline is still scored a loss *when grading a candidate* |
| `SOLVE_MIN` floor / obvious-move test | **unchanged** |
| Round limit during play | **removed** |
| `puzzle-chip` (markup, CSS, paint) | **removed** |
| "Out of Rounds" result | **removed** — a puzzle ends like any other battle |
| Result line | now `Solved in N rounds`, never `N of M` |

`solveBy` is still generated, serialized and published. It is the certificate's own record
of what was proved and the audit trail for *"was this board actually short"*; it costs a
dozen bytes, whereas regenerating it later would cost a re-run of the whole forge. It
simply has no authority over a live battle.

The result screen reports rounds **spent** and nothing else. `"Solved in 4 of 5 rounds"` was
correct while the deadline was enforced and became a lie the moment it was not — an *"of 5"*
with no limit behind it invents a budget the player never had. A player who solves it in
eight rounds solved it.

---

## 7. Results

Ten consecutive forges on unrelated seeds, run through the real publication path
(`tools/generate_daily_puzzle.js`):

| | before | after |
|---|---|---|
| Positions published | fails / grindy | **10 / 10** |
| Certified solution length | up to 17 rounds | **3–5 rounds, every one** |
| Median forge time | >5 min (often failing) | **31 s** |
| Failed the obvious-move test | n/a | **0** |

---

## 8. Resetting the shared puzzle

A position forged before this revision carries no `solveBy`, so the client derives a
five-round deadline the old forge never proved — such a board may be **unsolvable** under
the new limit. Deploying the rewrite therefore requires clearing the board it replaces.

`docs/supabase-migration-15.sql` adds:

```sql
select * from public.reset_daily_puzzle();
```

It deletes the day's active and staged positions (attempts cascade, so nobody is left
locked out having spent both attempts on the stale board) and the day's generation lease.
It does **not** generate the replacement: the next signed-in client to open the Daily card
finds no current row, takes the recovery lease, and forges one with the new engine.

`service_role` only. Unlike the `claim_daily_*` RPCs, which touch only the caller's own
rows, this one deletes everyone's — so it is reachable from the SQL Editor and a trusted
backend, and from nothing that ships in the browser bundle.

For local iteration without touching the shared board, `EOL.dev.puzzle()` forges and plays
a private practice position with the current engine, and `EOL.dev.puzzleRules()` prints the
calibration.

---

## 9. Tests

`sim/verify_puzzle_tempo.js` — 35 assertions, mostly **behavioural** rather than
source-text, because a source-text assertion cannot tell a renamed constant from a removed
rule. It plays real depth-4 battles (~60s).

Sections: the declared contract · tempo actually predicts solve length · the deadline is
enforced in the trial runner · the obvious-move gate is wired in · the deadline survives
serialization *and* a legacy payload without it still opens · `battle.js` holds the player
to the same number · and finally the **real forge**, run end to end on two seeds, asserting
that what it produced is 3–5 rounds.

One assertion in an early draft of that file was simply wrong — it claimed nothing above
`TEMPO_MAX` is ever winnable, and failed 6 of 8. The filter was right and the assertion was
not: 3.6 is the safety margin, 4.0 is the cliff. The test now asserts the property at the
cliff and documents the margin.
