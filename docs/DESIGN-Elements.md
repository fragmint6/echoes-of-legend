# DESIGN — Elements: from paint to mechanics

*Written 2026-08-19 as a decision document, not an implementation.
Nothing in here ships until the owner picks a direction. Candidate
systems are labelled A-G; the data below is measured from the live
roster, not estimated.*

---

## 1. What elements are today

Seven elements: **Physical, Magic, Shadow, Light, Lightning, Fire,
Nature.** The engine carries `card.element` on every unit, and that is
where its influence ends:

- damage log lines and the report name the element;
- the cast ring, projectile style and default sigil are colored by it;
- Caster basic-attack text is templated by it (`{ELEMENT}`);
- one condition (`targetElement`) exists in `condMet` — and **no
  shipped card uses it**.

Nothing in the damage pipeline, defence, the AI's evaluation, or any
status reads the element. A Fire card and a Nature card with the same
numbers are mechanically identical cards with different paint.

**Measured distribution (115 cards):**

| Element | Cards | | Element | Cards |
|---|---|---|---|---|
| Physical | 30 | | Nature | 13 |
| Shadow | 22 | | Fire | 8 |
| Light | 21 | | Lightning | 5 |
| Magic | 16 | | | |

Two facts that shape every candidate below:

1. **No faction is mono-element.** Every faction fields three or four
   elements (Grimmwood is the most focused: 5 Nature). So there is no
   "Fire deck" today, and mono-element play does not exist to reward.
2. **Physical is 30 of 115 cards** and Lightning is 5. Any global
   element rule lands on a very lopsided board.

## 2. The laws a system must respect

These are the repo's own design laws, applied to the question:

- **Determinism.** Multiplayer mirrors two clients off one shared
  action stream. Element interactions must be pure functions of board
  state — no dice, no drift. (A type chart passes; "10% chance to
  sear" does not.)
- **Vocabulary.** Express the system with effect kinds and conditions
  the engine already has. A new global state needs UI, serialization,
  and AI teaching — the kind of feature this project has rejected
  before.
- **AI legibility.** The rival plays a depth-4 search that values
  moves through `scoreAction`/`previewDamage`. Whatever elements do
  must be reducible to a cheap multiplier in that path, or every
  rival stops being able to play around it.
- **Uniqueness.** Several cards' whole identity is already an
  element-flavored interaction (Red Riding Hood hunts the debuffed,
  Sekhmet punishes the burning, Ares burns the marked). A global
  element law must not flatten those signatures into "every Shadow
  card does that."
- **Teaching budget.** The game already teaches roles, rows, energy,
  sets, ban tells, field rules and statuses. A new axis must be
  readable from the existing card detail — one wheel or one line —
  not a new tutorial.

## 3. The candidates

### A. THE WHEEL — soft advantage cycle

Each element beats one and loses to one, in a 7-cycle, e.g.:

> Fire → Nature → Lightning → Shadow → Physical → Magic → Light → Fire

Attacks with advantage deal **+10%**, attacks at disadvantage deal
**−10%**. Symmetric, deterministic, one number in `previewDamage`.

- **Gives:** a draft/ban/focus axis that doesn't exist today; matchup
  texture; easy UI (the card detail shows a small wheel; the damage
  preview tints strong/weak).
- **Costs:** a metagame layer of "counters"; re-tuning 115 cards'
  win rates (Physical's 30 cards and Lightning's 5 make the cycle
  lopsided); the lore of any specific pairing is arbitrary ("why does
  a wolf beat a thunderbolt?") and has to be written carefully.
- **Risk:** it can read as the game's real identity question — the
  faction is already this game's "color". A second color wheel can
  dilute factions instead of deepening them.

### B. CROSSFIRE — mixed elements compound

The first time each round a target is struck by a **different
element** than the last hit it took, that hit deals **+8%**
("compounded wound"). Rewards spreading elements and ordering your
attacks; punishes nobody specifically.

- **Gives:** in-battle texture, zero new UI (combat text only), and it
  matches the game's stated philosophy — factions are praised for
  feeding each other, and this is that idea one level down.
- **Costs:** measured fact #1 bites: factions are already internally
  diverse, so most turns trigger this accidentally — near-flat power
  creep rather than a decision, unless it is gated (signature hits
  only, or a minimum of three distinct elements in the round).
- **Risk:** the lowest-lore, lowest-drama option. It may feel like a
  hidden rule players discover by reading the patch notes.

### C. FIELD WEATHER — battlefields favor an element

Each of the ten boards gets one extra symmetric line, exactly like
its current rules: "+8% damage for Fire here, −8% for Nature." The
field cards already print their rules, so the teaching is free.

- **Gives:** atmosphere ("the Mana Spring hums for casters") and the
  cheapest possible implementation — one line per field, the engine
  already multiplies field effects symmetrically.
- **Costs:** **fields are rolled after bans** ("rolled AFTER the ban
  phase and revealed at the start of Field Six"), so the player has
  no agency — the weather is a lottery, not a decision. In campaign
  the terrain is known ahead of the gate, which helps there only.
- **Risk:** elements matter only by luck, which is the opposite of
  what "make elements functional" usually wants.

### D. RESONANCE — mono-element auras

Fielding 2+ legends of one element grants a small team aura (2 Fire:
+4% ATK; 3+: +8%). The classic "type matters by stacking it" model.

- **Gives:** an element draft axis in the only place one could exist
  (deck construction, since factions are diverse).
- **Costs:** measured fact #1 again — no faction can field 3 of an
  element without heavy cross-faction drafting, and this game's
  design openly rewards cross-faction play rather than mono-stacking.
  It also collides with faction auras (Ajax's cut, Caesar's
  snowball).
- **Risk:** it fights the game's own draft philosophy to exist at all.

### E. REACTIONS — named pair triggers

Two elements landing on one target in a round triggers a small
deterministic effect per pair (Fire+Nature = sear +8% damage;
Shadow+Light = dissonance −10% ATK...). The deepest, most flavorful
option, with 21 pairs to design.

- **Costs:** 21 authored interactions, a teaching burden the game
  cannot afford, and the AI would need real work to plan around
  pairings. This is the six-month version of the feature.

### F. ELEMENTAL STATUS IDENTITY — each element leans on one status

Global laws like "Fire deals +10% to burning targets, Shadow +10% to
debuffed targets." Reads beautifully on paper.

- **Rejected** for this game specifically: those interactions ARE the
  shipped signatures of Red Riding Hood, Sekhmet, Ares and others.
  Making them element-wide would flatten the exact cards the
  uniqueness law protects.

### G. THE HONEST OPTION — elements stay paint

In most card games "color" IS the faction. This game already has
sixteen factions doing that job; elements are a second, idle color
axis. Keeping them cosmetic is defensible: they carry readability
(the cast color telegraphs who is swinging), and nothing is broken by
their absence. The cost is the word "Fire" promising a mechanic that
never arrives — which is exactly why this document exists.

## 4. Recommendation — the Wheel, because it is the only FAIR option

*(Rewritten 2026-08-19 after the owner's balance concern.)*

The fairness question is the decider, and it has a clean answer.
Systems split into two families:

- **Systems that ADD damage** — Crossfire (B), Resonance (D),
  advantage-only wheels. Their expected value is positive: the game
  as a whole hits harder, heal and defence math drift, and every one
  of the 115 tuned win rates moves in the same direction. They are
  power creep wearing a mechanic's clothes.
- **Systems that MOVE damage** — a symmetric wheel. Advantage +8% and
  disadvantage −8% cancel in expectation. Across random matchups the
  aggregate damage of the game is UNCHANGED; what changes is WHO is
  advantaged in a given duel. Nothing is globally better, nothing is
  globally worse.

That is the definition of a fair elemental system: every element has
exactly one predator and one prey, nobody is strictly better than
anybody, and the counterplay is the deck-and-ban game this game
already plays. The penalty half is not the cruel part — it is the
part that pays for the bonus. Removing it does not make the system
gentler; it makes it creep.

**Ship: the Wheel, symmetric, damage-only, ±8%.**

1. One function (`elementMult(attacker, defender)`) read in one
   place — the damage pipeline — so `previewDamage`, the AI's
   `scoreAction`, the mirror and the sim all inherit the identical
   number. Deterministic by construction.
2. Damage only: no effect on statuses, energy or healing. The
   interaction stays a single, measurable dial.
3. The UI already has the surfaces: a small wheel in the card
   detail, a Strong/Weak tint on the targeting preview the game
   already renders, and one combat-text word.
4. ±8% is texture, not identity. The soak measures matchup deltas;
   if they distort, the dial moves to ±5% or the whole thing comes
   out in one commit. Reversible is part of fair.

**What the Wheel does NOT fix, honestly stated:** the roster's
element spread (Physical 30, Lightning 5). The cycle gives each
element equal footing regardless of headcount, but players can only
draft what exists — so the long-tail job is growing Fire and
Lightning card counts, not changing the system.

**If the Wheel still feels like too much:** the correct fallback is
G — elements stay paint — not C. Weather is fair but it is a lottery,
and a fair system that creates no decisions is decoration with extra
steps. And B/D should not ship as-is: B creeps, D fights the
cross-faction design.

**First-step plan if we go:**

1. Author the cycle and its lore (the Concord's "seven syllables" —
   the archive setting of Chapter II already wants this).
2. Engine: `elementMult` + preview + AI value + sim hooks.
3. UI: card-detail wheel, Strong/Weak preview tint, combat text.
4. `sim/verify_elements.js`: prove symmetry (element-swapped mirror
   games stay identical), preview honesty, and that the AI prices
   the wheel.
5. Run the balance soak before and after; publish the delta.

## 5. Open questions for the owner

1. Which axis should elements touch — **draft/matchup** (Wheel),
   **in-battle play** (Crossfire), **atmosphere** (Weather), or
   **none** (keep paint)?
2. How loud should the numbers be? +8/−8 reads as texture; +15/−15
   reads as identity. The roster is tuned without either.
3. If the Wheel: damage only, or should advantage also touch the
   rider (Burn duration, stat debuffs)?
4. If the Wheel: which direction does the cycle run, and do we write
   its lore into the Concord (Chapter II already has the archive, the
   register, the century — a seven-syllable cycle fits the setting)?
5. Does the Daily Puzzle, the Draft mode, or the mirror battle need
   the element rule too, or should it be Classic-only?
