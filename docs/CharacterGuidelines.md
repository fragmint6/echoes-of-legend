# Character Guidelines

## Faction Cohesion

Every faction must be cohesive in their abilities. Cards within a faction should work together to create combos or strategic synergies. A faction that is just six independent skills with no interaction is broken by design.

Requirements:
- At least one combo path between two or more faction cards.
- Passive triggers and active effects should reinforce each other (e.g., a Mark applier pairs with a Mark consumer; a Shield granter pairs with a Shield-dependent effect).
- No faction should be purely reactive; each faction needs at least one proactive win condition.

## Skill Uniqueness

Skills must be unique. You cannot have two healers with the same skill — that is redundant and reduces strategic choice.

Requirements:
- Every active ability (`spec` with `target` and `effects`) in the roster must have a unique effect combination.
- No two cards may share the exact same `ability.name`, the same `spec.target.side`, the same `spec.target.pick`, and the same ordered `spec.effects` array.
- Passives (`ability.type === 'Passive'`) must also be distinct: no duplicate trigger names (`trigger`), no duplicate `onHit` arrays, and no duplicate `stackTag` entries unless the cards are from different factions with different thematic justification.
- If a card is reskinned, its ability specification must change accordingly (different numbers, different `to` redirects, different `if` conditions, or different `element`).

## Design Checks Before Adding Any Card

Before a new card is added to any faction file (`data/*.js`):

1. Verify it does not duplicate any existing ability specification (compare `name`, `cost`, `spec.target`, `spec.effects` ordered list).
2. Verify it creates or strengthens at least one faction synergy.
3. Verify it fits the faction's theme (`colors`, `tagline`, `icon`).
4. Verify it respects the role cap (`MAX_PER_ROLE = 4` for deck legality, `3` for simulation teams).
5. Verify its ability text does not contain undefined keywords (all status words must map to `EOL.STATUS` in `js/text.js`).
