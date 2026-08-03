# Report Requirements

Every simulation run must report the sections below and must also include a
tier list and lineup analysis.

---

## 0. Power Assessment  (required for `sim/full.js` runs)

**`sim/full.js` is the balance command.** A single random-draw run answers
"is this card fair beside five strangers" and quietly implies it has
answered "is this card fair when a human builds around it and bans what
scares them". It has not. A full run must therefore report FOUR
measurements per hero, of which **win rate is the weakest**:

| Metric | Question | Source |
| --- | --- | --- |
| **Ban rate** | How frightening is it? | drafted vs banned, draft pass |
| **Forced win rate** | How strong when *made* to play? | forced pass |
| **Pick rate** | Does the draft AI want it? | draft pass |
| **Free win rate** | The classic number | random pass |

Required sub-sections:

- **0a. Most-banned heroes** - ranked by ban rate. A 50% hero banned 90% of
  the time is not balanced; its win rate is average *because* the threat is
  high and opponents keep deleting it.
- **0b. Where the passes disagree** - heroes whose forced and free win rates
  are **statistically separated** (non-overlapping Wilson intervals). A gap
  the sample cannot support must NOT be listed.
- **0c. Cards the draft AI is misjudging** - strong when forced, rarely
  picked. This is a bug report about `data/draft-ai.js`, not about the hero.
- **0d. Confidence** - median sample per hero, the resulting margin, and an
  explicit list of heroes too thin to trust.

### Statistical honesty is mandatory

Every win rate in a full report carries a **95% Wilson interval**. At 40
appearances the margin is roughly ±15pp, so `47.3%` and `62.0%` are the same
measurement. Printing a bare decimal implies a precision the data does not
have, and half the "findings" in a thin run are noise.

Two heroes may only be described as different if their intervals do not
overlap.

### Forced inclusion must reach the BOARD

Pinning a hero into the twelve is not enough - fielding is also the draft
AI's judgement, so a card it dislikes gets drafted and benched. Measured on
a real run, **17 of 57 forced heroes never played a single game**, including
Merlin, the card that prompted this work. A forced hero must be exempt from
the opponent's bans and guaranteed a slot in the six, or the pass measures
nothing. Ban rate is still measured honestly by the unforced passes.


## 1. Global Match Statistics

These tell you whether the game itself is healthy.

- P1 Win Rate
- P2 Win Rate
- Draw Rate
- Average rounds per game
- Median rounds per game
- Shortest game
- Longest game
- Average actions per game
- Average actions per round
- Signature vs Basic usage %
- Average remaining heroes on winning team
- Average remaining HP on winning team
- First kill rate
- First kill conversion rate
- Average round of first kill
- Average round of second kill
- Average round signatures first appear

## 2. Role Balance

For each role (`Tank`, `Bruiser`, `Controller`, `Caster`, `Medic`, `Sniper`):

- Win Rate
- Pick Rate
- Average Damage
- Average Healing
- Average Shielding
- Average Damage Prevented
- Average Survival
- Average Kills
- Average Deaths
- Kill Participation
- Damage per Energy
- Signature casts/game
- Basic casts/game

## 3. Hero Statistics

For every hero (`id`, `name`, `faction`, `rarity`, `role`, `element`):

### General

- Win Rate
- Pick Rate
- MVP Score (`mvp`: `dmg + 0.8 * (heals + shields + absorbCredit + prevented) + 400 * kills`)
- Survival (`aliveAtEnd` / `apps`)
- Kills
- Deaths
- Kill Participation (`kp`: `kills / teamKills`)

### Damage

- Total Damage
- Damage per Round (`dmg / roundsSum`)
- Damage per Energy (`dmg / energy`)
- Damage Before Death (`dmgBeforeDeath`)
- Damage After First Kill (`dmgAfterFirstKill`)
- Crit % (`crits / hits`)
- Burn Damage (`burnDmg`)
- Exposed Bonus Damage (`exposedBonusDealt`)
- Damage against Tanks (`dmgVsTank`)
- Damage against Backline (`dmgVsBackline`)

### Utility

- Healing (`heals`)
- Shielding (`shields`)
- Damage Prevented (`prevented`)
- Taunt Turns (`tauntTurnsApplied`)
- Redirects (`redirects`)
- Buff Uptime (`buffUpN / upSamples`)
- Debuff Uptime (`debuffUpN / upSamples`)
- Ally Damage Enabled (`exposedBonusEnabled` - only for heroes whose effects enable Exposed or Mark consumption)

### Economy

- Energy Spent (`energy`)
- Basics Used (`basics`)
- Signatures Used (`sigs`)
- Average Energy When Signature Used (`sigEnergy / sigs` or `energy` at time of cast)

## 4. Ability Statistics

For every signature/passive (`heroId + '|' + abilityName`):

- Average casts (`casts / games` or `casts / apps`)
- Average value per cast (`value / casts`)
- Kill conversion (`kills / casts`)
- Average targets hit (`targetsHit / casts`)
- Average damage (`dmg / casts`)
- Average healing (`heal / casts`)
- Average shielding (`shield / casts`)
- Average buffs applied (`buffs / casts`)
- Average debuffs applied (`debuffs / casts`)

## 5. Status Effect Statistics

This is tracked in the engine via `statusOpen` tracking and emitted events (`t: 'statusApply'`, `t: 'cleanse'`, `t: 'burnTick'`, `t: 'exposed'`, `t: 'markConsumed'`).

For every status (`burn`, `exposed`, `marked`, `silence`, `taunt`, `healMod`, `untargetable`, `shield`):

- Applications/game (`applied`)
- Average duration (`roundsSum / applied` or `turns` at application)
- Cleanse rate (`cleansed / applied`)
- Average value created (`value` aggregated per status event)

### Burn (specific metrics)

- Total burn damage (`burn.tickDmg`)
- Average burn damage (`burn.tickDmg / burn.ticks`)
- Burn kills (`burn.kills`)

### Exposed (specific metrics)

- Number of applications (`A.statuses.exposed.applied`)
- Average damage dealt while Exposed (`A.exposed.dmgWhile` divided by applications with duration > 0)
- Average kills while Exposed (`A.exposed.killsWhile` / applications)

### Mark (specific metrics)

- Applications (`A.statuses.marked.applied`)
- Trigger rate (`A.mark.triggers / applications`)
- Damage dealt on trigger (`A.mark.triggerDmg` / `A.mark.triggers`)

## 6. Pair Synergies

Only show pairs with **65+ appearances** (`games >= 65` in `A.pairs`).

For each pair (`heroA|heroB`, sorted id):

- Games together (`games`)
- Win Rate (`wins / games`)
- Damage together (`dmg`)
- Kill Participation together (`kp`: average `kills / teamKills` for the pair)

## 7. Role Pair Synergies

Only pairs formed from the roles actually present in the 6-hero team (e.g., `Tank+Medic`, `Bruiser+Controller`, `Sniper+Controller`, `Double Sniper`, `Double Medic`, `Double Tank`, etc.).

For each role pair (`Tank+Medic`, `Bruiser+Controller`, etc.):

- Games (`games`)
- Win Rate (`wins / games`)
- Average team damage (`dmg` aggregated across games for pairs with that role pair)
- Average team kill participation (`kp`)

This tells you if an archetype is fundamentally broken.

## 8. Matchups

For every hero (`id`):

- Best 5 matchups (`A.matchups[a + '>' + b].wins / A.matchups[a + '>' + b].games` for every `b` where `b` is an opposing hero, sorted descending by win rate)
- Worst 5 matchups (same calculation, sorted ascending by win rate)

This helps balance without blindly nerfing.

## 9. Team Composition Statistics

Average win rate for team compositions, counted by how many of each role appear in the fielded six (from `prep.front` and `prep.back` or from `sim` team generation via `counts`):

- 2 Tanks (`cnt.Tank >= 2`)
- 1 Tank (`cnt.Tank === 1`)
- 0 Tanks (`cnt.Tank === 0`)

Likewise for:

- Bruisers (`2`, `1`, `0`)
- Controllers (`2`, `1`, `0`)
- Casters (`2`, `1`, `0`)
- Medics (`2`, `1`, `0`)
- Snipers (`2`, `1`, `0`)

This reveals if a role is mandatory or weak.

## 10. Position Statistics

From the engine's `slot` tracking (`slot < 3` = front, else = back) aggregated in `sim/sim.js` (`A.pos.front` / `A.pos.back`):

### Front Row
- Average deaths (`deaths / apps`)
- Average survival (`aliveEnd / apps`)
- Average damage (`dmg / apps`)
- Average healing (`heals / apps`)
- Average targeting frequency (`targeted / apps`)
- Average redirects (`redirects / apps`)

### Back Row
- Same 6 metrics as above.

This validates whether positioning matters enough.

## 11. AI Decision Statistics

From `A.ai.byKind` and `A.ai.tgt` aggregates in `sim/sim.js`: 

### Action Kind Choice
- Basic (`A.basicCasts` / `A.meta.actionsPerGame` or `A.ai.byKind` ratios)
- Signature (`A.sigCasts` / total actions)
- Heal (`A.ai.byKind.Heal`)
- Shield (`A.ai.byKind.Shield`)
- Buff (`A.ai.byKind.Buff`)
- Debuff (`A.ai.byKind.Debuff`)

### Target Priorities
- Lowest HP (`A.ai.tgt.lowestHp` / `A.ai.tgt.n`)
- Highest Damage (`A.ai.tgt.highestAtk` / `A.ai.tgt.n`)
- Tank (`A.ai.tgt.tank` / `A.ai.tgt.n`)
- Backline (`A.ai.tgt.backline` / `A.ai.tgt.n`)
- Marked (`A.ai.tgt.marked` / `A.ai.tgt.n`)
- Exposed (`A.ai.tgt.exposed` / `A.ai.tgt.n`)

This tells you if the AI is using cards correctly.

## 12. Outlier Detection

Automatically flag anything outside the healthy band:

### Heroes
- Win Rate > 65% (flag)
- Win Rate < 35% (flag)

### Roles
- Win Rate > 55% (flag)
- Win Rate < 45% (flag)

### Abilities
- Never used (`casts === 0` over all games)
- Cast < 0.5 / game (`casts / meta.games < 0.5`)
- Damage per Energy top 10% or bottom 10% (`dmg / energy` ranking across all abilities)
- Value per cast < 0 for any significant number of casts

Flags must include the exact metric value, the role/hero/ability id, and whether the outlier is positive or negative.

## 13. New Metrics (Not Yet in Engine)

These do not exist in the current `sim/sim.js` or `js/engine.js` but would be incredibly useful. Any future report that claims full coverage must implement them or explicitly note their absence.

### Value Over Average (VOA)

How much does this hero improve a random team compared to replacing them with an average hero? Calculated as:

```
VOA = (team_win_rate_with_hero - team_win_rate_with_average_substitute) / baseline_win_rate
```

Requires a substitute-model simulation branch (not implemented).

### Threat Rating

How often enemies target this hero. Calculated as:

```
Threat = (times_targeted_by_enemy / rounds_alive) * 100
```

Requires tracking `focus` per enemy source (`focusN` / `focusD` per side, not just aggregated).

### Focus Fire Rate

Average attackers targeting this hero per round:

```
Focus Fire Rate = focusN / focusD / rounds_alive
```

### Overkill Damage

Damage wasted on already-lethal hits:

```
Overkill Rate = overkill / total_damage_dealt
```

Already partially tracked (`A.heroes[*].overkill` in `sim/sim.js`).

### Clutch Factor

Win rate when this hero is the last survivor (`lastSurvivorGames` / `lastSurvivorWins`).

Already tracked (`lastSurvivorWins / lastSurvivorGames`).

### Snowball Index

Win rate after this hero gets the first kill (`firstKillWins / firstKills`).

Already tracked (`A.heroes[*].firstKillWins` / `firstKills`).

### Comeback Rate

Win rate after this hero's team loses the first kill (`win_rate_when_first_kill_conceded` or derived from `fkConverted` / `fkDecisiveGames`).

Requires tracking which team lost the first kill per game (partially available via `fkWon` and `fkDecisiveGames`).

### Tempo Rating

Average round this hero secures their first kill (`firstKillRoundSum / killGames`).

Already tracked (`firstKillRoundSum / killGames` in `sim/sim.js`).

### Effective HP Created

Combined support metric:

```
Effective HP Created = total_heals + total_shield + total_damage_prevented + (damage_prevented_by_taunt_redirects)
```

Requires unifying `heals`, `shields`, `prevented`, and `redirects` into a single index per hero.

---

## Report Output Format

The report file (`sim/results.md`, or `sim/full.md` for a full run) must be
in a neat and orderly fashion with analysis and insights on each part of the
data. The data and analysis presented should NOT include games that ended in
a draw, aside from Global match statistics.

A report must never crash on a thin sample. A composition, pair or hero with
no data is a normal condition and must render as "insufficient data", not as
an exception or - worse - as a confident-looking zero.

---

## Design References Confirmed in Workspace

- Simulation depth: `--depth` in `sim/sim.js`; `sim/full.js` defaults to 4
- Team of six, max 3 per role: `EOL.rules.MAX_PER_ROLE`
- Deck of twelve, max 4 per role: `EOL.deckRules.MAX_PER_ROLE`
  (these are DIFFERENT caps - the fielded six carries no role cap of its own)
- Role-aware formation: `optimizeFormation` in `js/engine.js`
- Ranked pipeline (draft 12 -> ban 2 -> field 6): `rankedTeams` in `sim/sim.js`

## What the simulation cannot measure

State these limits rather than letting the numbers imply otherwise:

- **Depth 4 is better than depth 2, not good.** A hero that climbs with
  depth was being under-played, not under-powered.
- **The draft AI is a proxy for a drafting human, not a replacement.**
- **No bot adapts across games** the way two players do by their third match.
- Red Riding Hood's 13,000 shield and Lancelot's +72% DEF were both found by
  playing, not by simulating. Playtesting remains the final authority.
