# Character Guidelines

## The Design Goal: Cool Combos and Chains

The primary goal of Echoes of Legend is **cool card combos and chains**. Every hero, ability, and stat exists to make the roster produce satisfying, layered interactions. A card is only as good as the interactions it enables and the interactions it rewards.

- A **combo** is two or more cards that multiply each other's value when played together — one card sets up, another detonates (a Mark applier feeding a Mark consumer, a Shield granter feeding a Shield-dependent payoff, a debuff spreader feeding a debuff-conditional nuke).
- A **chain** is a sequence of triggers that keep paying forward — a kill refunds Energy, the Energy pays for a bigger skill, the bigger skill sets up the next kill.
- Never design a card to be "fine alone." Design it to want a partner, and make sure a partner exists somewhere in the roster.

## Factions Synergize With Each Other

Factions are not silos. Each faction has a strong internal identity and internal combo lines, but **every faction is tuned to synergize very well with the other factions**. Marks from Olympus and Huaxia feed damage multipliers across the roster; Exposed from Camelot and Grimmwood enables backline pressure everywhere; Yamato's Energy economy fuels expensive signatures in any faction; Grimmwood debuffs feed Caster basics and Sherwood outlaws. When adding a card, ask not only "what does it do inside its own faction?" but also "what does it let a card from another faction do?"

Requirements:
- At least one combo path between two or more cards **within** the faction.
- Each card should be a natural fit in at least one cross-faction combo — a keyword it hands off to, or a keyword it rewards.
- Passive triggers and active effects should reinforce each other (e.g., a Mark applier pairs with a Mark consumer; a Shield granter pairs with a Shield-dependent effect).
- No faction should be purely reactive; each faction needs at least one proactive win condition.

## Faction Identity

Every faction has its own identity — a mechanical keyword, a theme, a tagline, and a color scheme. Keep identity distinct and legible:

- **Yamato** — Energy economy. The rising sun knows no surrender.
- **Camelot** — Shields & Exposed. Oaths of steel, crowns of fate.
- **Olympus** — Marks. Thunder sits the throne of heaven.
- **Huaxia** — Marks & Counterplay. Empires rise where the dragon sleeps.
- **Grimmwood** — Debuffs. Every tale in these woods has teeth.
- **Sherwood** — Outlaws (focus, guard, pursuit). Rob the rich, and outshoot the rest.

A card that belongs to a faction must be readable as that faction at a glance (`colors`, `tagline`, `icon`, and the mechanical keyword it plays with).

## Raw Stat Ranges by Role

Every hero's raw `stats: { hp, atk, def }` must fall inside its role's budget band. The band reflects the role's job: Tanks and Medics live on durability, damage roles live on ATK, and everyone else trades between. Rarity places a card within the band (legendary/epic toward the top, rare/common toward the bottom) — it never leaves it.

| Role | HP | ATK | DEF |
| --- | --- | --- | --- |
| Tank | 6,800–7,600 | 950–1,100 | 28-32 |
| Bruiser | 5,500–6,500 | 1,450–1,750 | 20–25 |
| Caster | 4,700–5,000 | 1,850–2,050 | 14-18 |
| Controller | 4,800–5,800 | 1,150–1,400 | 16-20 |
| Medic | 4,600–5,000 | 950–1,100 | 18-22 |
| Sniper | 4,300–4,600 | 1,700–2,000 | 10–15 |

Notes:
- These are budget bands, not suggestions. A stat outside its band breaks the role's shape and must be re-tuned before the card ships.
- ATK powers damage *and* ATK-keyed healing, lifesteal, and shields, so "low ATK" support roles (Medic, Tank) still get value out of the same budget.
- HP is the survivability budget: high-HP tanks and low-HP high-ATK snipers only stay inside the game's math while they stay in band.

## Skill Creativity — the Engine Is a Floor, Not a Ceiling

Skills should be **really creative**. Never limit an idea to what the engine currently supports. The engine is the baseline, and the engine can always have more stuff added — triggers, effect kinds, targeting rules, and conditions are all extensible.

Creativity comes from the **combination** of two things:

1. **Custom triggers** — the engine's passive trigger list is a vocabulary, not a cap. `allyWarded`, `allyStruckDebuffed`, `incomingAbilityDamage`, `sameTargetStreak`, `wouldDie`, `alliedCastSkill`, `enemyCastSkill`, and the rest define today's lines, and **many more can be added**. If the cool skill you want fires on "when an ally's Shield breaks" and that trigger doesn't exist yet, add it to `js/engine.js` — don't water the skill down.
2. **The pre-existing keywords** — Burn, Exposed, Mark, Shield, Taunt, Silence, Untargetable, cost-up/cost-down, Energy gain/steal/drain/tax, Crit, lifesteal, counter-strike, revive, cleanse, copy-ally-active, coin flip, random-of, and the stat/damage multipliers. These keywords compose with each other and with any new trigger.

The current effect vocabulary (`k:` keys in `spec.effects`): `dmg`, `heal`, `lifesteal`, `stat`, `shield`, `taunt`, `untargetable`, `silence`, `healMod`, `burn`, `exposed`, `cleanse`, `costMod`, `gainEnergy`, `stealEnergy`, `drainEnergy`, `drainTax`, `counterStrike`, `swapTargets`, `revive`, `branch`, `mark`, `consumeMark`, `coinFlip`, `randomOf`, `copyAllyActive`, `damageResist`, `damageMult`, `outgoingMult`.

Current passive triggers: `static`, `selfAttacked`, `wasAttacked`, `sameTargetStreak`, `allyWarded`, `allyDamaged`, `allyBelowHp`, `allyDied`, `allyStruckDebuffed`, `allyStruckExposed`, `incomingAbilityDamage`, `enemyCastSkill`, `alliedCastSkill`, `wouldDie`, `deathCheat`, `selfKilled`, `counterStrike`.

A skill should be judged by how good the combo it creates is, never by whether it fits in a checkbox.

## Skill Uniqueness

Skills must be unique. You cannot have two healers with the same skill — that is redundant and reduces strategic choice.

Requirements:
- Every active ability (`spec` with `target` and `effects`) in the roster must have a unique effect combination.
- No two cards may share the exact same `ability.name`, the same `spec.target.side`, the same `spec.target.pick`, and the same ordered `spec.effects` array.
- Passives (`ability.type === 'Passive'`) must also be distinct: no duplicate trigger names (`trigger`), no duplicate `onHit` arrays, and no duplicate `stackTag` entries unless the cards are from different factions with different thematic justification.
- If a card is reskinned, its ability specification must change accordingly (different numbers, different `to` redirects, different `if` conditions, or different `element`).

## Design Checks Before Adding Any Card

Before a new card is added to any faction file (`data/*.js`):

1. Verify it creates or strengthens **at least one combo or chain** — within its faction, across factions, or both. A card that cannot be part of a cool interaction is a card that should not exist.
2. Verify its raw `stats` fall inside the role's budget band (see table above).
3. Verify it does not duplicate any existing ability specification (compare `name`, `cost`, `spec.target`, `spec.effects` ordered list).
4. Verify it fits the faction's identity and remains legible as that faction (`colors`, `tagline`, `icon`, keyword).
5. Verify it respects the role cap (`MAX_PER_ROLE = 4` for deck legality, `3` for simulation teams).
6. Verify its ability text does not contain undefined keywords (all status words must map to `EOL.STATUS` in `js/text.js`).
7. If the skill needs a trigger, target rule, effect kind, or condition the engine does not have yet, add it to the engine. Do not weaken the skill to fit the current engine.
