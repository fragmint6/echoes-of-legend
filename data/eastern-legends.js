/* Faction: Eastern Legends */
window.EOL.registerFaction({
  id: 'eastern-legends',
  name: 'Eastern Legends',
  glyph: '🐉',
  icon: 'ra-dragon',
  tagline: 'Where myth walks the mountain road.',
  colors: { primary: '#e05a4a', secondary: '#f0c05a', glow: '#ff9b7a' },
  cards: [
    {
      id: 'eastern-sun-wukong',
      name: 'Sun Wukong',
      rarity: 'legendary',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 7200, atk: 1000, def: 35 },
      ability: {
        type: 'Passive',
        name: '72 Transformations',
        cost: null,
        text: 'The first time Sun Wukong would be defeated, revive with <b>25% HP</b>, become Untargetable until your next turn, and gain <b>25% ATK</b>.',
        note: null,
        passive: {
          trigger: 'wouldDie',
          oncePerBattle: true,
          effects: [
            { k: 'revive', pctMaxHp: 25 },
            { k: 'untargetable', turns: 1, to: 'self' },
            { k: 'stat', stat: 'atk', amt: 25, turns: 99, to: 'self' }
          ]
        }
      },
      icon: 'ra-aura'
    },
    {
      id: 'eastern-nezha',
      name: 'Nezha',
      rarity: 'epic',
      role: 'Sniper',
      element: 'Fire',
      stats: { hp: 5700, atk: 1000, def: 25 },
      ability: {
        type: 'Active',
        name: 'Wind Fire Wheels',
        cost: 40,
        text: 'Deal <b>220% ATK Fire Damage</b> to any enemy. If the target has already taken damage this turn, attack them <b>again</b> for <b>110% ATK</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 2.2, element: 'Fire' },
            { k: 'dmg', power: 1.1, element: 'Fire', if: { targetDamagedBefore: true } }
          ]
        }
      },
      icon: 'ra-fire-symbol'
    },
    {
      id: 'eastern-kaguya',
      name: 'Kaguya',
      rarity: 'epic',
      role: 'Caster',
      element: 'Magic',
      stats: { hp: 6200, atk: 900, def: 30 },
      ability: {
        type: 'Active',
        name: 'Moon Illusion',
        cost: 60,
        text: "Copy a random ally's Active Skill each round at <b>60% effectiveness</b>.",
        note: null,
        spec: {
          target: { side: 'auto' },
          effects: [{ k: 'copyAllyActive', scale: 0.6 }]
        }
      },
      icon: 'ra-moon-sun'
    },
    {
      id: 'eastern-momotaro',
      name: 'Momotaro',
      rarity: 'rare',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7600, atk: 650, def: 40 },
      ability: {
        type: 'Active',
        name: 'Legendary Companions',
        cost: 35,
        text: 'Give all allies <b>+20% DEF for 2 turns</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all' },
          effects: [{ k: 'stat', stat: 'def', amt: 20, turns: 2, to: 'targets' }]
        }
      },
      icon: 'ra-round-shield'
    },
    {
      id: 'eastern-mulan',
      name: 'Mulan',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Physical',
      stats: { hp: 5800, atk: 900, def: 25 },
      ability: {
        type: 'Passive',
        name: "Warrior's Resolve",
        cost: null,
        text: 'When an ally is defeated, gain <b>+20% ATK</b> and <b>+15% Crit Chance</b>.',
        note: null,
        passive: {
          trigger: 'allyDied',
          effects: [
            { k: 'stat', stat: 'atk', amt: 20, turns: 99, to: 'self' },
            { k: 'stat', stat: 'crit', amt: 15, turns: 99, to: 'self' }
          ]
        }
      },
      icon: 'ra-crossbow'
    },
    {
      id: 'eastern-anansi',
      name: 'Anansi',
      rarity: 'epic',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 6100, atk: 760, def: 30 },
      ability: {
        type: 'Active',
        name: 'Web of Lies',
        cost: 45,
        text: 'Prevent an enemy Active Skill and increase its cost by <b>20 Energy</b> next turn.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'silence', turns: 1, to: 'targets' },
            { k: 'costMod', flat: 20, turns: 2, to: 'targets' }
          ]
        }
      },
      icon: 'ra-spider-face'
    }
  ]
});
