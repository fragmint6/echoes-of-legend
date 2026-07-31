/* Faction: Yamato — Momentum (formerly Eastern Legends) */
window.EOL.registerFaction({
  id: 'yamato',
  name: 'Yamato',
  icon: 'ra-dragon',
  tagline: 'The rising sun knows no surrender.',
  colors: { primary: '#e05a4a', secondary: '#f0c05a', glow: '#ff9b7a' },
  cards: [
    {
      id: 'yamato-kaguya',
      name: 'Kaguya',
      rarity: 'epic',
      role: 'Caster',
      element: 'Magic',
      stats: { hp: 4740, atk: 1905, def: 15 },
      ability: {
        type: 'Active',
        name: 'Moon Reflection',
        cost: 45,
        text: "Copy a random allied Active Skill at <b>70% effectiveness</b>; any buffs it grants last 1 extra round.",
        note: null,
        spec: {
          target: { side: 'auto' },
          effects: [{ k: 'copyAllyActive', scale: 0.7, bonusBuffTurns: 1 }]
        }
      },
      icon: 'ra-moon-sun'
    },
    {
      id: 'yamato-momotaro',
      name: 'Momotaro',
      rarity: 'rare',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 6860, atk: 980, def: 30 },
      ability: {
        type: 'Active',
        name: 'Legendary Companions',
        cost: 35,
        text: 'Immediately give all allies <b>10% DEF for 2 rounds</b> and your <b>front row</b> a <b>10% Max HP Shield</b>, and remove <b>Burn</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all' },
          effects: [
            { k: 'stat', stat: 'def', amt: 10, turns: 2, to: 'targets' },
            { k: 'shield', pctMaxHp: 10, to: 'frontAllies' },
            { k: 'cleanse', only: 'burn', to: 'targets' }
          ]
        }
      },
      icon: 'ra-round-shield'
    },
    /* Reskinned from Princess Bari (Joseon) — same kit, new identity:
       the legendary onmyoji steadies debuffs instead of guiding souls. */
    {
      id: 'yamato-abe-no-seimei',
      name: 'Abe no Seimei',
      rarity: 'epic',
      role: 'Controller',
      element: 'Light',
      stats: { hp: 5755, atk: 1290, def: 25 },
      ability: {
        type: 'Active',
        name: 'Guiding Spirit',
        cost: 30,
        text: "Immediately extend every enemy debuff by 1 round, or apply <b>Exposed</b> to all enemies for 1 round if none are debuffed.",
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'branch',
              cond: { anyTargetDebuffed: true },
              then: [
                { k: 'extendDebuffs', turns: 1, to: 'targets', when: 'now' }
              ],
              other: [
                { k: 'exposed', turns: 1, to: 'targets', when: 'now' }
              ]
            }
          ]
        }
      },
      icon: 'ra-crystal-ball'
    }
  ]
});
