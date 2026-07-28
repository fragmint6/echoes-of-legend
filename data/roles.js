/* =============================================================
 * Role Default Abilities
 * -------------------------------------------------------------
 * Every hero gets one of these for free (0 Energy) in addition to
 * their signature ability, chosen by their role.
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
    text: 'Deal <b>90% ATK Physical Damage</b> and gain <b>10% DEF</b> for 1 turn.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'front' },
      effects: [
        { k: 'dmg', power: 0.9, element: 'Physical' },
        { k: 'stat', stat: 'def', amt: 10, turns: 1, to: 'self' }
      ]
    }
  },

  Bruiser: {
    type: 'Active',
    name: 'Strike',
    cost: 15,
    basic: true,
    text: 'Deal <b>120% ATK Physical Damage</b>. If this defeats an enemy, gain <b>15% ATK</b> for 1 turn.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'front' },
      effects: [
        { k: 'dmg', power: 1.2, element: 'Physical' },
        { k: 'stat', stat: 'atk', amt: 15, turns: 1, to: 'self', if: { killedTarget: true } }
      ]
    }
  },

  Caster: {
    type: 'Active',
    name: 'Spell',
    cost: 15,
    basic: true,
    text: 'Deal <b>100% ATK {ELEMENT} Damage</b>. Deal <b>20% increased damage</b> if the target has a debuff.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'any' },
      effects: [
        {
          k: 'dmg', power: 1.0, element: 'inherit',
          ifMult: [{ when: { targetHasDebuff: true }, mult: 1.2 }]
        }
      ]
    }
  },

  Controller: {
    type: 'Active',
    name: 'Disrupt',
    cost: 15,
    basic: true,
    text: 'Deal <b>80% ATK Magic Damage</b> and apply a random debuff: <b>10% reduced ATK</b> for 1 turn, <b>10% increased ability cost</b> next turn, or <b>10% reduced DEF</b> for 1 turn.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'any' },
      effects: [
        { k: 'dmg', power: 0.8, element: 'Magic' },
        {
          k: 'randomOf',
          options: [
            { k: 'stat', stat: 'atk', amt: -10, turns: 1, label: '-10% ATK' },
            { k: 'costMod', unit: true, pct: 10, turns: 1, label: '+10% ability cost' },
            { k: 'stat', stat: 'def', amt: -10, turns: 1, label: '-10% DEF' }
          ]
        }
      ]
    }
  },

  Medic: {
    type: 'Active',
    name: 'Restore',
    cost: 15,
    basic: true,
    text: 'Heal an ally for <b>100% ATK</b>. If the target is below 30% HP, heal another <b>25% ATK</b>.',
    spec: {
      target: { side: 'ally', pick: 'single', row: 'any' },
      effects: [
        { k: 'heal', power: 1.0 },
        { k: 'heal', power: 0.25, if: { targetHpBelow: 0.3 } }
      ]
    }
  },

  Sniper: {
    type: 'Active',
    name: 'Aim',
    cost: 15,
    basic: true,
    text: 'Deal <b>130% ATK Physical Damage</b>. If the enemy is in the back row, deal an extra <b>20% ATK Physical Damage</b>.',
    spec: {
      target: { side: 'enemy', pick: 'single', row: 'any' },
      effects: [
        { k: 'dmg', power: 1.3, element: 'Physical' },
        { k: 'dmg', power: 0.2, element: 'Physical', if: { targetBackRow: true } }
      ]
    }
  }
};
