/* Faction: Grimmwood - Debuffs */
window.EOL.registerFaction({
  id: 'grimmwood',
  name: 'Grimmwood',
  icon: 'ra-pine-tree',
  tagline: 'Every tale in these woods has teeth.',
  colors: { primary: '#4fa86a', secondary: '#8a5ad8', glow: '#8ff0ae' },
  cards: [
    {
      id: 'grimmwood-hansel-and-gretel',
      name: 'Hansel & Gretel',
      rarity: 'epic',
      role: 'Tank',
      element: 'Nature',
      stats: { hp: 6860, atk: 980, def: 30 },
      ability: {
        type: 'Active',
        name: 'Lost in the Woods',
        cost: 45,
        text: 'Immediately gain a <b>15% Max HP Shield</b> and share one with your lowest HP ally, plus Provoke for 1 round, healing <b>4% Max HP</b> each time they are attacked while Provoking.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'shield', pctMaxHp: 15, to: 'self' },
            { k: 'shield', pctMaxHp: 15, to: 'allies', take: { n: 1, by: 'lowestHp' } },
            { k: 'taunt', turns: 1, to: 'self', healOnHit: 4 },
          ],
        },
      },
      icon: 'ra-candle',
    },
    {
      id: 'grimmwood-rumpelstiltskin',
      name: 'Rumpelstiltskin',
      rarity: 'legendary',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 5615, atk: 1350, def: 20 },
      ability: {
        type: 'Active',
        name: 'Cruel Bargain',
        cost: 40,
        text: 'Strike a bargain. <b>Heads:</b> apply <b>Burn</b> to all enemies for 2 rounds and reduce their ATK by <b>15%</b>. <b>Tails:</b> reduce all enemy healing by <b>60% for 2 rounds</b> and apply <b>Exposed</b> for 1 round.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'coinFlip',
              heads: {
                label: 'Heads - all enemies Burn',
                effects: [
                  { k: 'burn', turns: 2, to: 'targets', when: 'now' },
                  { k: 'stat', stat: 'atk', amt: -15, turns: 2, to: 'targets', when: 'now' },
                ],
              },
              tails: {
                label: 'Tails - enemy healing reduced 60%',
                effects: [
                  { k: 'healMod', pct: -60, turns: 2, to: 'targets', when: 'now' },
                  { k: 'exposed', turns: 1, to: 'targets', when: 'now' },
                ],
              },
            },
          ],
        },
      },
      icon: 'ra-gold-bar',
      art: 'assets/heroes/grimmwood-rumpelstiltskin.png',
    },
    {
      id: 'grimmwood-big-bad-wolf',
      name: 'Big Bad Wolf',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Nature',
      stats: { hp: 6180, atk: 1650, def: 20 },
      ability: {
        type: 'Active',
        name: 'Savage Hunger',
        cost: 40,
        text: 'Deal <b>200% ATK Nature Damage</b> and immediately heal for <b>25%</b> of the damage dealt, or <b>40%</b> if the target is debuffed.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            { k: 'dmg', power: 2.0, element: 'Nature' },
            { k: 'lifesteal', pct: 25, if: { targetHasDebuff: false } },
            { k: 'lifesteal', pct: 40, if: { targetHasDebuff: true } },
          ],
        },
      },
      icon: 'ra-wolf-head',
      art: 'assets/heroes/grimmwood-big-bad-wolf.png',
    },
    {
      id: 'grimmwood-snow-white',
      name: 'Snow White',
      rarity: 'common',
      role: 'Medic',
      element: 'Nature',
      /* DEF 24 -> 22: was outside the Medic band (18-22). Corrected
         2026-07-31 alongside the Abe no Seimei stat fix. */
      stats: { hp: 4680, atk: 990, def: 22 },
      ability: {
        type: 'Active',
        name: 'Forest Blessing',
        cost: 32,
        text: 'Immediately heal all allies for <b>22% Max HP</b>, remove one debuff from each, and grant <b>15% DEF for 2 rounds</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all' },
          effects: [
            { k: 'heal', pctMaxHp: 22 },
            { k: 'cleanse', count: 1, to: 'targets' },
            { k: 'stat', stat: 'def', amt: 15, turns: 2, to: 'targets' },
          ],
        },
      },
      icon: 'ra-apple',
    },
    {
      id: 'grimmwood-red-riding-hood',
      name: 'Red Riding Hood',
      rarity: 'rare',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 5880, atk: 1570, def: 20 },
      ability: {
        type: 'Passive',
        name: "Hunter's Courage",
        cost: null,
        text: 'Whenever an ally attacks a debuffed enemy, immediately gain <b>8% Crit Chance</b>, <b>5% ATK for 2 rounds</b> and a <b>10% Max HP Shield</b>. Red Riding Hood heals for <b>25%</b> of the damage she deals to debuffed enemies.',
        note: 'Max: 4 stacks.',
        passive: {
          trigger: 'allyStruckDebuffed',
          effects: [
            {
              k: 'stat',
              stat: 'crit',
              amt: 8,
              turns: 2,
              to: 'self',
              stackTag: 'hunters-courage-crit',
              maxStacks: 4,
            },
            {
              k: 'stat',
              stat: 'atk',
              amt: 5,
              turns: 2,
              to: 'self',
              stackTag: 'hunters-courage-atk',
              maxStacks: 4,
            },
            /* The shield shares the passive's stack budget. Without a
               tag it was uncapped: the ATK and Crit riders stopped at
               4, the shield did not, and it reached 13,000 in a live
               game. "Max: 4 stacks" now means all three riders. */
            {
              k: 'shield',
              pctMaxHp: 10,
              to: 'self',
              stackTag: 'hunters-courage-shield',
              maxStacks: 4,
            },
          ],
          onHit: [{ k: 'lifesteal', pct: 25, ifTargetDebuffed: true }],
        },
      },
      icon: 'ra-hood',
      art: 'assets/heroes/grimmwood-red-riding-hood.png',
    },
    {
      id: 'grimmwood-pied-piper',
      name: 'Pied Piper',
      rarity: 'rare',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 4835, atk: 1160, def: 20 },
      ability: {
        type: 'Active',
        name: 'Enchanted Melody',
        cost: 20,
        text: 'Deal <b>60% ATK Magic Damage</b> <b>+13% per debuff</b> on each target to <b>2 enemies</b>, reduce their ATK by <b>20% for 2 rounds</b>, and apply <b>Exposed</b> for 1 round to any already debuffed.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            /* scales with pressure already on the target */
            { k: 'dmg', power: 0.6, element: 'Magic', perDebuff: 0.13, perDebuffMax: 3 },
            { k: 'exposed', turns: 1, to: 'targets', if: { targetHasDebuff: true }, when: 'now' },
            { k: 'stat', stat: 'atk', amt: -20, turns: 2, to: 'targets', when: 'now' },
          ],
        },
      },
      icon: 'ra-horn-call',
      art: 'assets/heroes/grimmwood-pied-piper.png',
    },
  ],
});
