# Design Response - Campaign, Buffs/Debuffs, Comeback

> Written against the 5,000-game run. Every number below is measured, not
> estimated. Three questions, answered in the order you raised them.

---

## 1. Campaign - you're right, and my first pitch was wrong

Your objection is correct: **hand-authored fights in a card battler are
single-use.** Once you know the enemy board, mission 12 is solved forever.
40 scripted fights is 40 puzzles you throw away, and it competes for dev time
with PvP, which is where the actual game is.

So I'd drop "40 scripted missions" entirely. What survives is the *teaching*
goal, and that is better served three cheaper ways:

### 1a. Faction Trials - 8 short gauntlets, not 40 missions

One per faction. Three fights, escalating, **fixed player deck** built from
that faction. The value is not the fights; it is that you are *forced* to
play Camelot's shields for 15 minutes and discover how Lancelot works.

- 24 fights total, not 40. Roughly a week of authoring, not a month.
- Replayability is not the point - it is **onboarding**, done once, and it
  ends by granting that faction's 12-card deck.
- The reward hooks straight into the progression you already planned: the
  granted deck is the bridge from "I finished a trial" to "I can queue PvP."

### 1b. Daily Puzzle - this is the replayable one

A fixed board, a fixed hand, one solution: *"win this round"* or *"win
without losing a hero."* Procedurally seeded from the date, same for
everyone, one attempt.

This is the piece that actually earns daily returns, and it is **cheaper than
a campaign mission** - no chapter, no narrative, no progression tree. It is
also the single best combo teacher you can build, because the player has to
*find* the Mark→consume line rather than read about it.

Concretely: generate a board, run your existing AI at depth 4 to verify a
solution exists inside the constraint, discard boards where a Basic-only line
also wins. You have all of that already.

### 1c. Tutorial → straight into unranked

Two or three guided fights, then push the player at PvP. Do not build a
solo mode that competes with your own multiplayer for attention.

**Bottom line:** Faction Trials for teaching (one-time, 24 fights), Daily
Puzzle for retention (procedural, infinite). Skip the 40-mission campaign.

---

## 2. Buffs and debuffs - the AI is right, the *cards* are wrong

I checked whether the 73%-damage number was an AI valuation bug. It is not.
Here is the honest math at 1,500 ATK vs 20% DEF:

| Action | Value |
| --- | --- |
| One basic attack | **1,020 damage now** |
| +12% ATK, 1 ally, 2 rounds | 288 damage → **0.28× an attack** |
| +20% ATK, 1 ally, 2 rounds | 480 damage → 0.47× |
| +12% ATK, **6 allies**, 2 rounds | 1,728 → **1.69×** |
| +25% ATK, **6 allies**, 2 rounds | 3,600 → **3.53×** |

A single-target buff is *mathematically never* worth an action. The AI
skips them because skipping them is correct.

And the roster is built almost entirely out of the bad kind:

> **23 of 30 positive buffs in the game are single-target.**
> Only 7 are team-wide, and every one is a rider on a card doing something
> else. **No card in the game exists whose job is buffing.**

### The three fixes, in order of impact

**Fix 1 - Buffs must be team-wide or they should not exist.**
Any buff below ~15% on a single target is a trap. Either make it team-wide,
or make it big and permanent (`turns: 99`), or delete it. This is a numbers
pass over existing cards, not new content.

**Fix 2 - Give buffs an exit valve, exactly like Marks.**
Marks work because something *consumes* them for a burst. Buffs have no
payoff - they just tick away. Add consumption:

```
"Consume all buffs on target ally: deal 60% ATK per buff consumed."
"While this ally has 3+ buffs, they cannot be reduced below 1 HP."
```

That single mechanic turns 23 dead riders into combo pieces overnight, and
it reuses the `consumeMark` pattern the engine already has.

**Fix 3 - Debuff stacking needs a damage conversion.**
Same problem, mirrored. Give heroes payoffs that read *how many* debuffs a
target has, not merely whether it has one:

```
"Deal 50% ATK, +40% for EACH debuff on the target."
"If the target has 3+ debuffs, Execute below 25% HP."
```

Right now `targetHasDebuff` is binary, so the second debuff is worth nothing.
Adding a `debuffCountAtLeast` condition (~5 lines, same shape as
`killedCountAtLeast`) makes stacking control a real strategy - and it lifts
Controllers without adding a single card.

**Also:** Silence is nearly worthless. It blocks the signature, the AI casts a
Basic instead, and 40 EN buys almost nothing. Either make it block *all*
actions for one turn, or make it cheap utility. It cannot stay priced as a
nuke.

---

## 3. Comeback - target 60%, currently 68.9%

### Why it snowballs (this is the important part)

Turns **strictly alternate**, so the side with more living heroes gets more
actions per round. Losing a hero is not a 16.7% damage loss - it is a 16.7%
*action* loss, and the two compound:

| Heroes down | Your damage output | Damage taken per surviving hero |
| --- | --- | --- |
| 1 | 83% | **120%** |
| 2 | 67% | **150%** |
| 3 | 50% | **200%** |

The measured gap between first and second kill is only **1.5 rounds**. Once
the spiral starts it closes fast, and the +15% ATK ramp from round 6
accelerates it further.

That is why energy-based comeback tools underperform: **+15 Energy does not
give you back an action.** Spirit World is the right instinct aimed at the
wrong resource.

### Ranked options

| Fix | Impact | Notes |
| --- | --- | --- |
| **Extra action when 2+ heroes down** | ★★★★★ | Attacks the actual cause. The trailing side acts twice in a round; directly repairs the action economy. |
| Losing side +8% ATK per hero deficit | ★★★☆☆ | Restores damage, not tempo. Simple, but only half the problem. |
| Ramp 15% → 8% from round 6 | ★★★☆☆ | Stops the leader closing out so hard. Cheap one-line change. |
| Spirit World energy globally | ★★☆☆☆ | Weakest. Energy ≠ actions. |

**My recommendation:** ship the **extra action** as the primary lever, plus
the **ramp reduction** as a secondary. Concretely:

> When a side has **2+ fewer living heroes**, they take one additional
> action per round (one extra, not per hero).

It is a `nextActor()` change - that function already decides whose turn it
is, so the deficit check goes right there. Then measure: I would expect
conversion to land near 60 - 62%, and I'd tune the threshold (2 vs 3 heroes)
from the result rather than guessing.

**Important caveat:** this is the kind of change that must be simulated
before shipping. Comeback mechanics can invert the problem - make it too
strong and *losing early becomes an advantage*, which is worse than a
snowball. I'd run 2,000 games and check both conversion **and** that the
trailing side does not exceed 50%.

---

## 4. On PvP - one thing worth deciding early

Two ranked ladders (Classic and Draft, separate trophies) is the right call -
they are genuinely different skills.

The thing to decide **now**, while it is still cheap: **the bot is your
offline fallback forever.** Every balance number in this project comes from
AI-vs-AI self-play, and a real ladder will expose lines the AI never
explores. Budget for the meta shifting once humans arrive, and keep the sim
harness as the regression net rather than the source of truth.

Also worth planning before cloud: **deterministic replays.** The engine
already emits a full structured event stream and battles are seeded, so
storing `{seed, teams, actions[]}` reproduces a match exactly. That is your
anti-cheat, your spectate feature, and your bug reports - and it is nearly
free if you design for it now instead of retrofitting.
