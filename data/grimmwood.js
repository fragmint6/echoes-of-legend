/* Faction: Grimmwood */
window.EOL.registerFaction({
  id: 'grimmwood',
  name: 'Grimmwood',
  glyph: '🌲',
  icon: 'ra-pine-tree',
  tagline: 'Every tale in these woods has teeth.',
  colors: { primary: '#4fa86a', secondary: '#8a5ad8', glow: '#8ff0ae' },
  cards: [
    {
      id: 'grimmwood-robin-hood',
      name: 'Robin Hood',
      rarity: 'epic',
      role: 'Sniper',
      element: 'Nature',
      stats: { hp: 5800, atk: 1000, def: 25 },
      ability: {
        type: 'Passive',
        name: "Outlaw's Aim",
        cost: null,
        text: 'Always targets the enemy with the highest ATK. Deals <b>25% increased damage</b> against enemies above 70% HP.',
        note: null,
        passive: {
          trigger: 'static',
          forceTarget: 'highestAtk',
          effects: [
            { k: 'outgoingMult', mult: 1.25, when: { targetHpAbove: 0.7 } }
          ]
        }
      },
      icon: 'ra-archer'
    },
    {
      id: 'grimmwood-baba-yaga',
      name: 'Baba Yaga',
      rarity: 'legendary',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 6200, atk: 760, def: 30 },
      ability: {
        type: 'Active',
        name: "Witch's Bargain",
        cost: 60,
        text: 'Choose one: steal <b>35 Energy</b>, increase enemy skill costs by <b>25 Energy</b>, or reduce healing received by <b>50%</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          choose: [
            {
              label: 'Steal 35 Energy',
              icon: 'ra-lightning-bolt',
              effects: [{ k: 'stealEnergy', amt: 35 }]
            },
            {
              label: '+25 Energy skill costs',
              icon: 'ra-uncertainty',
              effects: [{ k: 'costMod', flat: 25, turns: 2, side: 'enemy' }]
            },
            {
              label: '-50% healing received',
              icon: 'ra-broken-heart',
              effects: [{ k: 'healMod', pct: -50, turns: 2, to: 'targets' }]
            }
          ]
        }
      },
      icon: 'ra-bubbling-potion'
    },
    {
      id: 'grimmwood-big-bad-wolf',
      name: 'Big Bad Wolf',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Nature',
      stats: { hp: 7000, atk: 850, def: 35 },
      ability: {
        type: 'Active',
        name: 'Savage Hunger',
        cost: 40,
        text: 'Deal <b>210% ATK Nature Damage</b>. Heal for 25% of damage dealt if target is below 50% HP.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            { k: 'dmg', power: 2.1, element: 'Nature' },
            { k: 'lifesteal', pct: 25, if: { targetHpBelow: 0.5 } }
          ]
        }
      },
      icon: 'ra-wolf-head'
    },
    {
      id: 'grimmwood-snow-white',
      name: 'Snow White',
      rarity: 'rare',
      role: 'Medic',
      element: 'Nature',
      stats: { hp: 6500, atk: 540, def: 40 },
      ability: {
        type: 'Active',
        name: 'Forest Blessing',
        cost: 35,
        text: 'Heal all allies for <b>15% Max HP</b> and grant 10% DEF.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all' },
          effects: [
            { k: 'heal', pctMaxHp: 15 },
            { k: 'stat', stat: 'def', amt: 10, turns: 2, to: 'targets' }
          ]
        }
      },
      icon: 'ra-apple'
    },
    {
      id: 'grimmwood-red-riding-hood',
      name: 'Red Riding Hood',
      rarity: 'rare',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6800, atk: 850, def: 35 },
      ability: {
        type: 'Passive',
        name: "Hunter's Instinct",
        cost: null,
        text: 'Deal <b>30% increased damage</b> against Shadow enemies.',
        note: null,
        passive: {
          trigger: 'static',
          effects: [
            { k: 'outgoingMult', mult: 1.3, when: { targetElement: 'Shadow' } }
          ]
        }
      },
      icon: 'ra-hood'
    },
    {
      id: 'grimmwood-pied-piper',
      name: 'Pied Piper',
      rarity: 'common',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 5600, atk: 650, def: 30 },
      ability: {
        type: 'Active',
        name: 'Enchanted Melody',
        cost: 25,
        text: "Reduce an enemy's ATK by <b>20% for 2 turns</b>.",
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [{ k: 'stat', stat: 'atk', amt: -20, turns: 2, to: 'targets' }]
        }
      },
      icon: 'ra-horn-call'
    }
  ]
});
