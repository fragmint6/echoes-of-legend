/* Faction: Olympus */
window.EOL.registerFaction({
  id: 'olympus',
  name: 'Olympus',
  glyph: '🏛',
  icon: 'ra-player-king',
  tagline: 'Thunder sits the throne of heaven.',
  colors: { primary: '#d8b64c', secondary: '#6fd3e8', glow: '#ffe08a' },
  cards: [
    {
      id: 'olympus-zeus',
      name: 'Zeus',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Lightning',
      stats: { hp: 6400, atk: 1100, def: 25 },
      ability: {
        type: 'Active',
        name: 'Divine Judgment',
        cost: 80,
        text: 'Mark all enemies. At the start of next round, deal <b>170% ATK Lightning Damage</b> and reduce DEF by <b>15% for 2 turns</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'delayed', turns: 1, tag: 'divine-judgment',
              effects: [
                { k: 'dmg', power: 1.7, element: 'Lightning' },
                { k: 'stat', stat: 'def', amt: -15, turns: 2, to: 'targets' }
              ]
            }
          ]
        }
      },
      icon: 'ra-lightning-bolt'
    },
    {
      id: 'olympus-athena',
      name: 'Athena',
      rarity: 'epic',
      role: 'Controller',
      element: 'Light',
      stats: { hp: 6500, atk: 700, def: 40 },
      ability: {
        type: 'Passive',
        name: 'Divine Strategy',
        cost: null,
        text: 'The first enemy Active Skill each round deals <b>40% less damage</b>.',
        note: null,
        passive: {
          trigger: 'incomingAbilityDamage',
          firstPerRound: true,
          teamWide: true,
          effects: [{ k: 'damageMult', mult: 0.6 }]
        }
      },
      icon: 'ra-shield'
    },
    {
      id: 'olympus-hercules',
      name: 'Hercules',
      rarity: 'epic',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 8200, atk: 750, def: 45 },
      ability: {
        type: 'Active',
        name: 'Twelve Labors',
        cost: 50,
        text: 'Gain <b>25% DEF</b>, <b>20% ATK</b>, and Taunt for 2 turns.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'stat', stat: 'def', amt: 25, turns: 2, to: 'self' },
            { k: 'stat', stat: 'atk', amt: 20, turns: 2, to: 'self' },
            { k: 'taunt', turns: 2, to: 'self' }
          ]
        }
      },
      icon: 'ra-muscle-fat'
    },
    {
      id: 'olympus-apollo',
      name: 'Apollo',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 6400, atk: 600, def: 35 },
      ability: {
        type: 'Active',
        name: "Sun's Grace",
        cost: 35,
        text: 'Heal one ally for <b>50% Max HP</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [{ k: 'heal', pctMaxHp: 50 }]
        }
      },
      icon: 'ra-sun-symbol'
    },
    {
      id: 'olympus-medusa',
      name: 'Medusa',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Shadow',
      stats: { hp: 5700, atk: 920, def: 25 },
      ability: {
        type: 'Active',
        name: 'Petrifying Gaze',
        cost: 35,
        text: 'Deal <b>220% ATK Shadow Damage</b> and reduce target DEF by <b>20% for 2 turns</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 2.2, element: 'Shadow' },
            { k: 'stat', stat: 'def', amt: -20, turns: 2, to: 'targets' }
          ]
        }
      },
      icon: 'ra-snake'
    },
    {
      id: 'olympus-ares',
      name: 'Ares',
      rarity: 'common',
      role: 'Bruiser',
      element: 'Fire',
      stats: { hp: 6200, atk: 820, def: 30 },
      ability: {
        type: 'Passive',
        name: 'Bloodlust',
        cost: null,
        text: 'Gain <b>5% ATK</b> whenever attacking.',
        note: 'Max: 30%.',
        passive: {
          trigger: 'selfAttacked',
          effects: [
            { k: 'stat', stat: 'atk', amt: 5, turns: 99, to: 'self', stackTag: 'bloodlust', maxStacks: 6 }
          ]
        }
      },
      icon: 'ra-bleeding-hearts'
    }
  ]
});
