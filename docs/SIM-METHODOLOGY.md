# Measuring balance: what to run, and what it can and cannot tell you

## TL;DR - what to run

**One command:**

```bash
node sim/full.js
```

~40 minutes at depth 4. Writes `sim/full.json` and `sim/full.md`.
**Read section 0 first.**

That is the whole balance workflow. It runs three passes (random with
bans, full draft with bans, and forced inclusion for every legend in the
roster - all 63 of them as of 2026-08-05) and reports four metrics per
legend with confidence intervals.

Useful flags:

| Flag | Default | Why |
| --- | --- | --- |
| `--depth N` | 4 | Search depth |
| `--quick` | off | ~4 min pipeline test. **Not enough data to balance on.** |
| `--forced N` | 40 | Games per legend in the forced pass |
| `--random N` | 5000 | Random-draw pass |
| `--draft N` | 2000 | Drafted pass |

**Simming is not a correctness check** - it asserts nothing. Run the
verify suite first, or you will get confident numbers about a broken
build:

```bash
node sim/verify_all.js && node sim/verify_preview.js && node sim/verify_stacks.js
```

---

## The problem this solves

A live match exposed a gap the simulation could not see. One player
out-drafted the other decisively, and the sim's numbers gave no warning:
Merlin's discount is mediocre beside five random legends and enormous
beside expensive ones, but random draw almost never produces that
pairing. **The sim measured his floor while the player used his ceiling.**

The arithmetic is stark. At the time the roster held 57 legends -
**1,596 possible pairs** (the roster is now 63, i.e. 1,953 pairs, which
only makes the problem worse) - and each game shows only 30 of them.
Measured on a 1,200-game run:

| | |
| --- | --- |
| distinct pairs observed | 1,596 |
| median games per pair | 21 |
| **best-covered pair** | **39 games** |
| pairs with 40+ games | **0** |

No amount of random simulation fixes this. At 1,200 games the strongest
pair evidence in the entire run is 39 games, which is noise. Combo
questions cannot be settled by random draw - they have to be asked
deliberately.

Three separate failures were at work:

1. **Random draw destroys combos.** Above.
2. **Depth 2 cannot see setup plays.** A move whose payoff is two turns
   away scores as a wasted turn, so every enabler in the game is
   systematically undervalued.
3. **Nobody drafts.** The sim measured "how does this card perform in a
   random pile", not "how good is it when someone tries".

---

## What `full.js` measures, and why win rate is not enough

Four numbers per legend. **Win rate is the weakest of them.**

| Metric | Question |
| --- | --- |
| **Ban rate** | How frightening is it? |
| **Forced win rate** | How strong when *made* to play? |
| **Pick rate** | Does the draft AI want it? |
| **Free win rate** | The classic number, confounded by the three above |

**Ban rate is probably the best single signal.** A 50% legend banned 95%
of the time is not balanced - its win rate is average *because* the
threat is real and opponents keep deleting it. On a live test run
Maid Marian, Spartacus, Snow White and Susanoo were each banned in
92-98% of the drafts they appeared in.

**Forced inclusion breaks a circularity.** Drafting with
`draft-ai.js` means a card the heuristic undervalues is rarely
drafted, so it gets little data, so nobody learns it is strong - and
the heuristic's weights came from earlier sim results. Pinning each
legend in regardless of the AI's opinion escapes that loop.

One implementation detail that mattered: pinning a legend into the
*twelve* is not enough, because fielding is also the AI's judgement.
**17 of 57 forced legends never played a single game** on the first
attempt, Merlin among them. A forced legend is now exempt from the
opponent's bans and guaranteed a slot in the six. Ban rate is still
measured honestly by the unforced passes.

## The four tools

### 1. `--teams` - how the squads are chosen

```bash
node sim/run_parallel.js --games 5000 --teams random   # default
node sim/run_parallel.js --games 2000 --teams draft
node sim/run_parallel.js --games 2000 --teams pairs
```

| Mode | What it does | What it answers |
| --- | --- | --- |
| `random` | Unbiased draw, role-capped | Is this card fair in a vacuum? |
| `draft` | Both sides snake-draft with the **real** draft AI | Is it fair when someone builds a team? |
| `pairs` | Forces a top-60 synergy duo onto each side | How strong is this combo, specifically? |

`draft` and `pairs` are **deliberately biased**. That is the point: they
measure the ceiling. Run them *alongside* `random`, never instead of it.

### 2. `--depth` - how well the AI plays

```bash
node sim/run_parallel.js --games 1000 --seed 777 --depth 2 --out sim/d2.json
node sim/run_parallel.js --games 1000 --seed 777 --depth 4 --out sim/d4.json
```

Depth 2 is a **speed** choice for a 5,000-game run, not a claim that
depth 2 plays well. Same seed, different depth, then diff the rankings.
**A legend that climbs when depth rises was being under-played, not
under-powered** - the earlier number measured the AI's blind spot rather
than the card.

### 3. Ceiling vs floor - report section 6b

Generated automatically by `sim/report.js`. For every legend it shows
their overall win rate beside their win rate with their best partner.

**The gap is the signal.** A legend at 48% overall who hits 78% with one
partner is not a 48% card - they are a 48% card that a drafting opponent
will turn into a 78% card.

The threshold adapts to the sample and the report says so when the
evidence is thin. An empty table would read as "no combos found" when it
actually means "not enough data", and that is a worse failure than
saying nothing.

### 4. The match itself

Nothing beats a real game. Red Riding Hood's 13,000 shield and
Lancelot's +72% DEF were both found by playing, then reproduced and
fixed with `sim/verify_stacks.js`. When a card feels wrong in a match,
that is data - write the test.

---

## A working routine

```bash
# 1. correctness first - the sim assumes the build already works
node sim/verify_all.js && node sim/verify_preview.js && node sim/verify_stacks.js

# 2. the balance run
node sim/full.js
#    -> read section 0. 0a for threats, 0b for real disagreements,
#       0c for draft-AI blind spots, 0d for what the sample supports.

# 3. only if you want a specific comparison
node sim/run_parallel.js --games 1000 --seed 777 --depth 2 --out sim/d2.json
node sim/run_parallel.js --games 1000 --seed 777 --depth 4 --out sim/d4.json
```

**Interpreting a disagreement is the whole skill.** A card at 50%
random and 62% forced is not "50%" - it is a card whose power depends
on actually being played, and every ranked opponent will make sure it
is. Treat a separated gap as a finding in itself.

## What is measured, and what is not

**Measured:** win rate, damage, healing, shielding, kill participation,
role balance, comp performance, pair performance, first-blood
conversion, battlefield effects.

**Not measured:**

- **Human drafting.** `--teams draft` uses the bot's heuristic, which is
  decent and not a strong player. It is a better proxy than random, not
  a substitute for playtesting.
- **Bans.** The sim never bans. In a real match the best card is often
  simply removed, which changes everything downstream.
- **Learning.** Real players adapt across games; the bot does not.

---

## Reference

| Flag | Default | Meaning |
| --- | --- | --- |
| `--games N` | 1500 | Games to simulate |
| `--seed N` | 20260729 | RNG seed - same seed, same run |
| `--teams MODE` | `random` | `random` / `draft` / `pairs` |
| `--depth N` | 2 | AI search depth |
| `--field ID` | `colosseum` | Battlefield (neutral by default) |
| `--out PATH` | `sim/results.json` | Where to write |

`sim/run_parallel.js` takes the same flags and shards across cores.

> A note on `run_parallel.js`: it forwards flags to its shards
> explicitly. `--depth` and `--teams` were silently dropped at first, so
> two "different" runs were byte-identical in configuration and differed
> only in filename. If you add a flag to `sim.js`, add it to the forward
> list too, and check `meta` in the output actually reflects it.
