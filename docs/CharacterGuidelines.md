# Character Guidelines

## Vocabulary - use these words, consistently

The game has one word for each thing. Mixed vocabulary in card text and UI
makes rules ambiguous.

| Use | Never |
| --- | --- |
| **Skill** | ability, power, move |
| **Signature Skill** | signature ability, ultimate, active |
| **Basic Skill** | basic, basic attack, role ability |
| **Skill cost** | ability cost, mana cost |
| **Provoke / Provoking** | taunt, taunting |
| **hero** | character, unit, card (when you mean the hero) |

`ability` survives only as a **code identifier** (`card.ability`,
`abilityRowHTML`). It must not appear in anything a player reads.

## The Design Goal: Cool Combos and Chains

The primary goal of Echoes of Legend is **cool card combos and chains**. Every hero, ability, and stat exists to make the roster produce satisfying, layered interactions. A card is only as good as the interactions it enables and the interactions it rewards.

- A **combo** is two or more cards that multiply each other's value when played together - one card sets up, another detonates (a Mark applier feeding a Mark consumer, a Shield granter feeding a Shield-dependent payoff, a debuff spreader feeding a debuff-conditional nuke).
- A **chain** is a sequence of triggers that keep paying forward - a kill refunds Energy, the Energy pays for a bigger skill, the bigger skill sets up the next kill.
- Never design a card to be "fine alone." Design it to want a partner, and make sure a partner exists somewhere in the roster.

## Factions Synergize With Each Other

Factions are not silos. Each faction has a strong internal identity and internal combo lines, but **every faction is tuned to synergize very well with the other factions**. Marks from Olympus and Huaxia feed damage multipliers across the roster; Exposed from Camelot and Grimmwood enables backline pressure everywhere; Yamato's Energy economy fuels expensive signatures in any faction; Grimmwood debuffs feed Caster basics and Sherwood outlaws. When adding a card, ask not only "what does it do inside its own faction?" but also "what does it let a card from another faction do?"

Requirements:
- At least one combo path between two or more cards **within** the faction.
- Each card should be a natural fit in at least one cross-faction combo - a keyword it hands off to, or a keyword it rewards.
- Passive triggers and active effects should reinforce each other (e.g., a Mark applier pairs with a Mark consumer; a Shield granter pairs with a Shield-dependent effect).
- No faction should be purely reactive; each faction needs at least one proactive win condition.

## Faction Identity

Every faction has its own identity - a mechanical keyword, a theme, a tagline, and a color scheme. Keep identity distinct and legible:

- **Yamato** - Energy economy. The rising sun knows no surrender.
- **Roma** - Triumph (kills). The eternal city demands victory.
- **Takamagahara** - The Divine Cycle (death and return). The plain of high heaven keeps its own counsel.
- **Duat** - The Scales (HP thresholds, judgement). The scales do not blink.
- **Camelot** - Shields & Exposed. Oaths of steel, crowns of fate.
- **Olympus** - Marks. Thunder sits the throne of heaven.
- **Huaxia** - Marks & Counterplay. Empires rise where the dragon sleeps.
- **Grimmwood** - Debuffs. Every tale in these woods has teeth.
- **Sherwood** - Outlaws (focus, guard, pursuit). Rob the rich, and outshoot the rest.

A card that belongs to a faction must be readable as that faction at a glance (`colors`, `tagline`, `icon`, and the mechanical keyword it plays with).

## Role Definitions - what each role IS

A role is a **job on the battlefield**, not a stat block. The stat bands below
exist to serve these jobs; if a card's behaviour and its role disagree, the
card is misclassed and must be moved, not excused. Some overlap is fine - a
Bruiser that also debuffs is still a Bruiser - but the *primary source of a
card's value* must match its role.

| Role | Job | Durability | Damage | Gets value from |
| --- | --- | --- | --- | --- |
| **Tank** | Soak damage so the rest of the team gets to act | Highest HP + DEF | Minimal | Absorbing, Taunting, Shielding, staying alive |
| **Bruiser** | Front-line breaker - tear down the enemy's Tanks | High, below Tank | High, and **scales** | Sustained damage into the front row |
| **Caster** | Area damage | Low - moderate | Highest, **AoE-leaning** | Hitting multiple enemies |
| **Sniper** | Single-target elimination | Lowest | Highest, **single-target** | Focusing one target down |
| **Controller** | Apply debuffs, deny the enemy | Low - moderate | **Low - never the point** | Debuffs, Silence, Energy denial, Marks/Exposed |
| **Medic** | Keep the team alive | Low - moderate | **Low - never the point** | Healing, Shielding, cleansing, buffs |

### Hard rules

1. **Controllers and Medics must never be damage dealers.** Their damage is
   incidental - a delivery mechanism for a debuff or a heal, never the reason
   to play the card. If a Controller's damage per cast approaches a Sniper's,
   it is misclassed or over-tuned.
2. **Casters lean AoE, Snipers lean single-target.** A "Caster" that only ever
   hits one target should be a Sniper, and vice versa.
3. **Bruisers fight in the front row and their damage scales.** A high-damage
   hero with low HP belongs in Caster or Sniper, not Bruiser.
4. **Tanks trade damage for presence.** A Tank out-damaging Bruisers is a
   design error.
5. When a card genuinely straddles two roles, classify it by **where the
   majority of its measured value comes from** (damage vs. healing vs. control),
   not by its theme.

## The Protection Model - Provoke vs Untargetable

Two protection keywords, deliberately unequal. This is roster law and it is
enforced by `sim/verify_all.js` section B9.

| Keyword | Kind | Strength |
| --- | --- | --- |
| **Provoke** | a **redirect + a tax** | Counterable. |
| **Untargetable** | a **negation** | **Absolute. Nothing may pierce it, ever.** |

### Why it is called Provoke and not Taunt

In most games "Taunt" means *you cannot hit anything else*. That is not what
this keyword does - area damage splashes past it, Sniper Skills shoot through
it, and pure utility ignores it entirely. The word promised an absolute and
delivered a tax, which is exactly the sort of mismatch players mis-predict and
then feel cheated by. **Provoke** says the true thing: I have drawn your
attention, and hitting anyone else is going to cost you.

### The one rule

> A Provoke redirects single-target **attacks** onto the provoker. Anything
> that gets around it deals **30% less damage to every target that is not the
> provoker**.

Three consequences:

1. **Sniper signatures pierce the redirect** and pay the tax. Sniper *basics*
   (Aim) do not pierce at all. A card may waive the tax with
   `target.noPierceTax` (Horus).
2. **Area damage never collapses** onto the provoker, but every non-provoker
   target takes the taxed amount. The provoker itself always takes **full**
   damage, so hitting the wall is never the worse option.
3. **Pure utility is never redirected or taxed.** An ability that deals no
   damage - a Mark, a Silence, a debuff, an Energy drain - ignores Provoke,
   because there is no blow to intercept. The engine decides by walking the
   effect list for `dmg`/`lifesteal`; override with `target.attack`.

Riders that pick their own victim (`to: 'enemies'` with a `take`) are utility
by this rule, but they **do** still respect Untargetable.

### Why AoE is taxed (the correction)

The first version exempted area damage completely, and the 5,000-game run
showed it overcorrected badly:

| | Before | After the exemption |
| --- | --- | --- |
| Caster | 50.0% | **57.2%** |
| Tank | 55.1% | **46.3%** |
| Caster x2 comp | 50.0% | **63.0%** (best) |
| Tank x2 comp | 56.6% (best) | **41.7%** (worst) |

The exemption was worth far more than the Sniper pierce because it did two
things at once: it restored the Caster's full output *and* removed the Tank's
main way of blunting them. Taxing the splash keeps the fix that mattered - one
Provoke no longer deletes 5/6 of a 55 EN spell - without making Provoke
meaningless against the role it exists to stop.

`PROVOKE_TAX` in `js/engine.js` is the single tuning dial. It is **0.7**, and
it applies to **both** the Sniper pierce and area damage.

### Rules for new cards

- **Never** write anything that pierces Untargetable, including `to:`
  redirects.
- A cheap, spammable pierce is a design error. Provoke must stay *a tax*, not
  *a formality*.

## Rarity - what the tiers MEAN

Rarity is **depth and prestige. It is never power.**

Rarity gates what a new account owns, so if rarity tracked strength the game
would be pay-to-win by construction. It must not.

| Tier | Means |
| --- | --- |
| **Legendary** | The face of its faction. One per faction (Huaxia and Grimmwood have two each). |
| **Epic** | Deep kits: multiple conditions, branches, or a rare effect kind. |
| **Rare** | A clear hook with one condition on it. |
| **Common** | **Simple to play - not weak.** One-line kits a new player can read instantly. |

### The measured basis

- Mechanical complexity correlates with win rate at only **r = 0.075** - depth
  and strength are already independent, so a depth-based rarity system *can* be
  power-neutral.
- The shipped assignment scores **r = −0.088** between rarity rank and win
  rate. Before the rework it was **r = +0.266**, a real pay-to-win gradient.
- Mean win rate by tier is deliberately flat: legendary 52.4%, epic 48.2%,
  rare 48.4%, common 54.8%.

**Common is the tier most often got wrong.** Several of the strongest cards in
the game are also the simplest - Spartacus (62.2%), Snow White (61.8%), Benkei
(59.7%), Lancelot (58.1%), Maid Marian (55.9%). Those are *ideal* commons: a
new player should be able to win with a starter card. A card is common because
it reads in one line, never because it is bad.

### Shape

Every faction ships **1 Legendary / 2 Epic / 2 Rare / 1 Common**, with two
exceptions: Huaxia (9 cards) runs 2/3/3/1, and Grimmwood (12 cards after the
2026-08-05 expansion) runs 2/3/5/2. Roster total across 9 factions, 63
heroes: 11 legendary, 20 epic, 22 rare, 10 common.

## Raw Stat Ranges by Role

Every hero's raw `stats: { hp, atk, def }` must fall inside its role's budget band. The band reflects the role's job: Tanks and Medics live on durability, damage roles live on ATK, and everyone else trades between. Rarity places a card within the band (legendary/epic toward the top, rare/common toward the bottom) - it never leaves it.

| Role | HP | ATK | DEF |
| --- | --- | --- | --- |
| Tank | 6,800 - 7,600 | 950 - 1,100 | 28-32 |
| Bruiser | 5,500 - 6,500 | 1,450 - 1,750 | 20 - 25 |
| Caster | 4,700 - 5,000 | 1,850 - 2,050 | 14-18 |
| Controller | 4,800 - 5,800 | 1,150 - 1,400 | 16-20 |
| Medic | 4,600 - 5,000 | 950 - 1,100 | 18-22 |
| Sniper | 4,300 - 4,600 | 1,700 - 2,000 | 10 - 15 |

Notes:
- These are budget bands, not suggestions. A stat outside its band breaks the role's shape and must be re-tuned before the card ships.
- ATK powers damage *and* ATK-keyed healing, lifesteal, and shields, so "low ATK" support roles (Medic, Tank) still get value out of the same budget.
- HP is the survivability budget: high-HP tanks and low-HP high-ATK snipers only stay inside the game's math while they stay in band.
- The ATK bands encode the role definitions: Caster/Sniper sit at 1,850 - 2,050
  and 1,700 - 2,000 because they are the damage roles, while Controller (1,150 - 1,400)
  and Medic (950 - 1,100) sit far below them precisely because **they are not**.
  A Controller ability that scales its damage hard enough to close that gap is
  breaking the role even though its raw stats are legal.

### Ability-power guidance by role

The stat band is only half the budget; ability power is the other half.

| Role | Typical signature damage | Notes |
| --- | --- | --- |
| Sniper | 145 - 200% ATK single target | the highest per-target multipliers in the game |
| Caster | 50 - 130% ATK to **all/multiple** enemies | lower multiplier, far more targets |
| Bruiser | 150 - 200% ATK, front-row | often with a scaling or follow-up rider |
| Tank | 0 - 85% ATK | damage is a side effect of Taunting/Guarding |
| Controller | 60 - 110% ATK, **capped scaling** | the damage is a vehicle for the debuff |
| Medic | 0% ATK direct damage | healing/shield output instead |

A Controller may scale off stacked debuffs (that is the role's payoff), but the
scaling must be **capped** so the ceiling stays below a Sniper's floor.

## Skill Creativity - the Engine Is a Floor, Not a Ceiling

Skills should be **really creative**. Never limit an idea to what the engine currently supports. The engine is the baseline, and the engine can always have more stuff added - triggers, effect kinds, targeting rules, and conditions are all extensible.

Creativity comes from the **combination** of two things:

1. **Custom triggers** - the engine's passive trigger list is a vocabulary, not a cap. `allyWarded`, `allyStruckDebuffed`, `incomingAbilityDamage`, `sameTargetStreak`, `wouldDie`, `alliedCastSkill`, `enemyCastSkill`, and the rest define today's lines, and **many more can be added**. If the cool skill you want fires on "when an ally's Shield breaks" and that trigger doesn't exist yet, add it to `js/engine.js` - don't water the skill down.
2. **The pre-existing keywords** - Burn, Exposed, Mark, Shield, Taunt, Silence, Untargetable, cost-up/cost-down, Energy gain/steal/drain/tax, Crit, lifesteal, counter-strike, revive, cleanse, copy-ally-active, coin flip, random-of, and the stat/damage multipliers. These keywords compose with each other and with any new trigger.

The current effect vocabulary (`k:` keys in `spec.effects`): `dmg`, `heal`, `lifesteal`, `stat`, `shield`, `taunt`, `untargetable`, `silence`, `healMod`, `burn`, `exposed`, `extendDebuffs`, `cleanse`, `costMod`, `gainEnergy`, `stealEnergy`, `drainEnergy`, `loseEnergy`, `drainTax`, `counterStrike`, `swapTargets`, `revive`, `delayed`, `branch`, `mark`, `consumeBuffs`, `consumeMark`, `coinFlip`, `randomOf`, `copyAllyActive`, `damageResist`, `damageMult`, `outgoingMult`. (`costMod` also accepts `signaturesOnly: true` to price Signature Skills only - Merlin's Prophecy.)

Current passive triggers: `static`, `selfAttacked`, `wasAttacked`, `sameTargetStreak`, `allyWarded`, `allyDamaged`, `allyBelowHp`, `allyDied`, `allyStruckDebuffed`, `allyStruckExposed`, `incomingAbilityDamage`, `enemyCastSkill`, `alliedCastSkill`, `wouldDie`, `deathCheat`, `selfKilled`, `teamKilled`, `counterStrike`.

A skill should be judged by how good the combo it creates is, never by whether it fits in a checkbox.

## Skill Uniqueness

Skills must be unique. You cannot have two healers with the same skill - that is redundant and reduces strategic choice.

Requirements:
- Every active ability (`spec` with `target` and `effects`) in the roster must have a unique effect combination.
- No two cards may share the exact same `ability.name`, the same `spec.target.side`, the same `spec.target.pick`, and the same ordered `spec.effects` array.
- Passives (`ability.type === 'Passive'`) must also be distinct: no duplicate trigger names (`trigger`), no duplicate `onHit` arrays, and no duplicate `stackTag` entries unless the cards are from different factions with different thematic justification.
- If a card is reskinned, its ability specification must change accordingly (different numbers, different `to` redirects, different `if` conditions, or different `element`).

## Design Checks Before Adding Any Card

Before a new card is added to any faction file (`data/*.js`):

1. Verify it creates or strengthens **at least one combo or chain** - within its faction, across factions, or both. A card that cannot be part of a cool interaction is a card that should not exist.
2. Verify its raw `stats` fall inside the role's budget band (see table above).
3. Verify it does not duplicate any existing ability specification (compare `name`, `cost`, `spec.target`, `spec.effects` ordered list).
4. Verify it fits the faction's identity and remains legible as that faction (`colors`, `tagline`, `icon`, keyword).
5. Verify it respects the role cap (`MAX_PER_ROLE = 4` for deck legality, `3` for simulation teams).
6. Verify its ability text does not contain undefined keywords (all status words must map to `EOL.STATUS` in `js/text.js`).
7. If the skill needs a trigger, target rule, effect kind, or condition the engine does not have yet, add it to the engine. Do not weaken the skill to fit the current engine.

## Damage Budget - the number that decides if a card is broken

A card's damage is not judged by its multiplier. It is judged by
**total ATK% delivered per 10 Energy spent**:

```
budget = (multiplier x targets hit) / cost x 10
```

Measured across the roster, the working band is **0.30 - 0.80**. Reference
points:

| Card | Budget | Note |
| --- | --- | --- |
| Zeus | 1.30 | the ceiling - 60 EN, and needs Marks already on the board |
| Qin Shi Huang | 0.80 | strongest Caster in the game at 61.8% |
| Guy of Gisborne | 0.62 | strongest single-target payoff |
| Amaterasu | 0.55 | legendary AoE, post-nerf |
| Roster mean | **0.50** | |
| Abe no Seimei | 0.14 | a Controller - damage is a delivery mechanism |

**Anything at 1.0+ that is not Zeus is a bug.** Duat originally shipped Ma'at
at 1.27 and Sekhmet at 1.20; both were rebuilt.

### The conditional trap

A conditional that is **true by default at the start of a fight is not a
conditional** - it is a bigger base number wearing a costume, and it makes the
card feel strongest in the phase where it should be weakest.

> Ma'at's first draft read *"85% ATK against enemies above 60% HP."* On round
> one that is every enemy on the board. The card was a flat 85% AoE that
> quietly got worse as the game went on.

Write conditionals that the **opponent's play** turns on and off - a debuff
someone applied, a Shield they chose to cast, a row they chose to stand in -
never ones that the clock turns off on its own.

### Faction cards must need each other

Six individually strong cards is a bad faction. Before shipping, check the
honest version of this question: *if I draft exactly one of these, is it still
a great pick?* If yes for every card, the faction has no identity - it is just
six good cards wearing the same colour.

Duat's split is the working example: the two Casters deal mediocre damage and
manufacture debuffs; the Sniper is below the role's damage floor until those
debuffs exist. Each half is deliberately incomplete.

## Presentation Rules

These are enforced by code, not convention. Breaking them is a bug.

### Animations must finish before the game reacts

No overlay - round banner, Victory, Defeat - may be drawn while the board is
still animating. `flashRecent()` in `js/battle.js` returns the **full duration
of everything it scheduled** (strikes, floating numbers, deaths, revives) and
every caller waits for it.

This was a real bug: the function only ever reported a hold for resurrections,
so landing the killing blow drew *Victory* in the same frame as the attack.
Measured after the fix: **~3.5s** between the final hit and the result screen.

### Graphics quality

`body[data-gfx]` is `high` or `low`, set from the main-menu toggle and
persisted. It defaults to `low` for users whose OS requests reduced motion.

| Low mode keeps | Low mode cuts |
| --- | --- |
| hit flashes, floating numbers, HP fills | battlefield board motion, particles |
| death fades, selection rings | idle float, emblem spin, title shimmer |
| cinematic banners (at 55% duration) | ambient glows, sheens, parallax |
| panel open/close transitions | decorative hover flourishes |

Anything communicating **state** stays. Anything that is only **flair** goes.
JS-driven holds respect it too (`cineMs`, `popMs`, `deathMs`) - a stylesheet
cannot reach a `setTimeout`.

### Battlefields are boards, not places

This is a board game. A battlefield is a **playing surface**: a pattern, a
palette, a motion. Not a landscape, and not a photograph.

Each board's pattern must express its **rule**:

| Board | Reads as |
| --- | --- |
| Narrow Pass | chevron walls squeezing toward a lit central channel |
| Mana Spring | rings pulsing **outward** from the centre |
| Energy Void | the same rings collapsing **inward** |
| Blood Battlefield | a double-thump **heartbeat** |
| Hero's Trial | spokes converging on one spotlit centre |
| Colosseum | a formal duelling ground - the calmest board, because it has no rule |

Built from CSS gradients and masks on four layers (`sc-fx1` weave,
`sc-grade` field pattern, `sc-particles`, `sc-haze` glow/vignette). Motion runs
8 - 30s and stays low-contrast so it never competes with the cards.

### Status effects explain their real rule, briefly

`window.EOL.STATUS[key].desc` in `js/text.js` is the **single source** of status
rules text, surfaced on hover from both the board chips and the card flyout.

Two rules for writing one:

1. **State only what a player cannot infer.** "DEF Up" needs no description at
   all - everyone knows what defence is, and the live value ("+15% DEF") is
   printed above it. Leave `desc` empty.
2. **Where there IS a surprise, lead with it and stop.** No filler, no
   restating the label.

| Status | Description |
| --- | --- |
| Provoking | Enemy single-target attacks must hit this hero. Anything that gets around it (area damage, Sniper Skills) deals **30% less**. |
| Burning | 5% Max HP every turn this side takes. Ignores DEF and Shields. |
| Exposed | DEF counts as 0. |
| Silenced | Cannot act at all. Skills and Basics both. |
| Untargetable | Enemies cannot target this hero at all. No exceptions. |
| DEF Up / ATK Up | *(empty - the number says it)* |

Two stale copies of this text previously lived in `js/battle.js` and had drifted
out of sync with the engine; one still claimed Silence left Basics usable.
There is now exactly one home for it.

### No em dashes

The character `-` is used throughout. Em and en dashes are not to appear in any
source file, comment, card text or document.

### Battlefields need a centrepiece

A board is a pattern **plus one signature object** at its heart - the way the
original rune circle anchored the old arena. Each battlefield gets its own
(`.sc-emblem`): the Narrow Pass has a keystone arch, the Mana Spring a
wellhead, the Energy Void a singularity, the Colosseum a laurel, the Spirit
World a threshold gate, the Blood Battlefield a beating wound. Never repeat one
across two boards, and never leave the middle of a board empty.

### Redundant controls are a bug

If clicking a thing already performs an action, do not also put a button on
top of that thing for the same action. The deck builder carried a `+`/`x`
badge on every card and an `x` on every filled slot, both duplicating a click
target that already existed. Both were removed: click a card to add or remove
it, click a filled slot to clear it.

### Hovering should preview, not just describe

Hovering a Skill row highlights every hero it can currently hit, in the same
green a real selection uses (dashed rather than solid, so a preview never
reads as a commitment). Players should be able to scan their options without
committing to a selection first.
