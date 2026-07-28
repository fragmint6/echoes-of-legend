/* Faction: Camelot */
window.EOL.registerFaction({
  id: 'camelot',
  name: 'Camelot',
  glyph: '🏰',
  icon: 'ra-castle-flag',
  tagline: 'Oaths of steel, crowns of fate.',
  colors: { primary: '#4c7bd8', secondary: '#c9a227', glow: '#7ea8ff' },
  cards: [
    {
      id: 'camelot-king-arthur',
      name: 'King Arthur',
      rarity: 'legendary',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7600, atk: 700, def: 45 },
      ability: {
        type: 'Passive',
        name: 'King of Knights',
        cost: null,
        text: 'When an ally falls below 40% HP, gain a Shield equal to <b>25% Max HP</b> and Taunt Front Row enemies for 1 turn.',
        note: null,
        passive: {
          trigger: 'allyBelowHp',
          threshold: 0.4,
          oncePerRound: true,
          effects: [
            { k: 'shield', pctMaxHp: 25, to: 'self' },
            { k: 'taunt', turns: 1, to: 'self' }
          ]
        }
      },
      icon: 'ra-crown'
    },
    {
      id: 'camelot-merlin',
      name: 'Merlin',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Magic',
      stats: { hp: 6500, atk: 950, def: 30 },
      ability: {
        type: 'Active',
        name: 'Prophecy',
        cost: 75,
        text: "For 2 turns, allies' abilities cost <b>20 less Energy</b> and enemies' abilities cost <b>20 more Energy</b>.",
        note: null,
        spec: {
          target: { side: 'none' },
          effects: [
            { k: 'costMod', flat: -20, turns: 2, side: 'ally' },
            { k: 'costMod', flat: 20, turns: 2, side: 'enemy' }
          ]
        }
      },
      icon: 'ra-crystal-wand'
    },
    {
      id: 'camelot-lancelot',
      name: 'Lancelot',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6800, atk: 900, def: 35 },
      ability: {
        type: 'Passive',
        name: 'Finest Knight',
        cost: null,
        text: 'Whenever an ally takes damage, gain <b>8% ATK</b>.',
        note: 'Max: 5 stacks.',
        passive: {
          trigger: 'allyDamaged',
          effects: [
            { k: 'stat', stat: 'atk', amt: 8, turns: 99, to: 'self', stackTag: 'finest-knight', maxStacks: 5 }
          ]
        }
      },
      icon: 'ra-sword'
    },
    {
      id: 'camelot-morgan-le-fay',
      name: 'Morgan le Fay',
      rarity: 'epic',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 6200, atk: 750, def: 30 },
      ability: {
        type: 'Active',
        name: 'Dark Illusion',
        cost: 45,
        text: 'Swap two enemies and reduce their ATK by <b>20% for 2 turns</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            { k: 'swapTargets' },
            { k: 'stat', stat: 'atk', amt: -20, turns: 2, to: 'targets' }
          ]
        }
      },
      icon: 'ra-raven'
    },
    {
      id: 'camelot-guinevere',
      name: 'Guinevere',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 6500, atk: 560, def: 35 },
      ability: {
        type: 'Active',
        name: 'Royal Blessing',
        cost: 35,
        text: 'Heal an ally for <b>35% Max HP</b> and remove one debuff.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [
            { k: 'heal', pctMaxHp: 35 },
            { k: 'cleanse', count: 1 }
          ]
        }
      },
      icon: 'ra-heart-tower'
    },
    {
      id: 'camelot-mordred',
      name: 'Mordred',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Shadow',
      stats: { hp: 5600, atk: 900, def: 25 },
      ability: {
        type: 'Active',
        name: 'Treasonous Strike',
        cost: 30,
        text: 'Deal <b>230% ATK Shadow Damage</b> to the lowest HP enemy.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'auto', auto: 'lowestHp', row: 'any' },
          effects: [{ k: 'dmg', power: 2.3, element: 'Shadow' }]
        }
      },
      icon: 'ra-dripping-blade'
    }
  ]
});
