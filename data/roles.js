/* =============================================================
 * Role Default Abilities
 * -------------------------------------------------------------
 * Every hero gets one of these for free (0 Energy) in addition to
 * their Signature Skill, chosen by their role.
 *
 * Also defines each role's default TARGETING RULE:
 *   row: 'front' -> must hit the enemy front row while any of it lives
 *   row: 'any'   -> may hit any enemy
 *   side:'ally'  -> may only target allies
 * ============================================================= */

window.EOL = window.EOL || {};

window.EOL.roleAbilities = {
  Tank: {
    type: 'Active',
    name: 'Guard',
    cost: 15,
    basic: true,
    text: 'Deal <b>85% ATK Physical Damage</b> and immediately gain <b>10% DEF</b> for 1 round, and Provoke for 1 round.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'front' },
      effects: [
        { k: 'dmg', power: 0.85, element: 'Physical' },
        { k: 'stat', stat: 'def', amt: 10, turns: 1, to: 'self' },
        /* Pass 8: Guard becomes interception - Provoke overrides even row
           restrictions, so a guarding tank soaks single-target shots aimed
           at the back line. */
        { k: 'taunt', turns: 1, to: 'self' },
      ],
    },
  },

  Bruiser: {
    type: 'Active',
    name: 'Strike',
    cost: 15,
    basic: true,
    text: 'Deal <b>85% ATK Physical Damage</b>. If this defeats an enemy, immediately gain <b>15% ATK</b> for 2 rounds.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'front' },
      effects: [
        { k: 'dmg', power: 0.85, element: 'Physical' },
        { k: 'stat', stat: 'atk', amt: 15, turns: 2, to: 'self', if: { killedTarget: true } },
      ],
    },
  },

  Caster: {
    type: 'Active',
    name: 'Spell',
    cost: 15,
    basic: true,
    text: 'Deal <b>75% ATK {ELEMENT} Damage</b>. Deal <b>20% increased damage</b> if the target has a debuff.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'any' },
      effects: [
        {
          k: 'dmg',
          power: 0.75,
          element: 'inherit',
          ifMult: [{ when: { targetHasDebuff: true }, mult: 1.2 }],
        },
      ],
    },
  },

  Controller: {
    type: 'Active',
    name: 'Disrupt',
    cost: 15,
    basic: true,
    text: 'Deal <b>70% ATK Magic Damage</b> and immediately apply a random debuff for 2 rounds: <b>15% reduced ATK</b>, <b>15% increased Skill cost</b>, or <b>15% reduced DEF</b>.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'any' },
      effects: [
        { k: 'dmg', power: 0.7, element: 'Magic' },
        {
          k: 'randomOf',
          when: 'now',
          options: [
            { k: 'stat', stat: 'atk', amt: -15, turns: 2, label: '-15% ATK' },
            { k: 'costMod', unit: true, pct: 15, turns: 2, label: '+15% Skill cost' },
            { k: 'stat', stat: 'def', amt: -15, turns: 2, label: '-15% DEF' },
          ],
        },
      ],
    },
  },

  Medic: {
    type: 'Active',
    name: 'Restore',
    cost: 15,
    basic: true,
    text: 'Immediately heal an ally for <b>60% ATK</b> and grant them <b>10% DEF</b> for 1 round. If the target is below 30% HP, heal another <b>15% ATK</b>. Your other allies recover <b>15% ATK</b>. Any healing beyond Max HP becomes a <b>Shield</b>.',
    spec: {
      target: { side: 'ally', pick: 'single', row: 'any' },
      effects: [
        { k: 'heal', power: 0.6, overflow: 'shield' },
        { k: 'heal', power: 0.15, overflow: 'shield', if: { targetHpBelow: 0.3 } },
        { k: 'stat', stat: 'def', amt: 10, turns: 1, to: 'targets' },
        /* Pass 8: battlefield triage - the rest of the team gets a light
           splash, same overflow rule, so Restore contributes to the whole
           squad rather than one health bar. */
        { k: 'heal', power: 0.15, overflow: 'shield', to: 'otherAllies' },
      ],
    },
  },

  Sniper: {
    type: 'Active',
    name: 'Aim',
    cost: 15,
    basic: true,
    text: 'Deal <b>85% ATK Physical Damage</b>. If the enemy is in the back row, deal an extra <b>5% ATK Physical Damage</b>.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'any' },
      effects: [
        { k: 'dmg', power: 0.85, element: 'Physical' },
        { k: 'dmg', power: 0.05, element: 'Physical', if: { targetBackRow: true } },
      ],
    },
  },
};
