/* Faction: Grimmwood - Debuffs */
window.EOL.registerFaction({
  id: 'grimmwood',
  name: 'Grimmwood',
  icon: 'ra-pine-tree',
  tagline: 'Every tale in these woods has teeth.',
  colors: { primary: '#4fa86a', secondary: '#8a5ad8', glow: '#8ff0ae' },
  cards: [
    {
      id: 'grimmwood-hansel-gretel',
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
      art: 'assets/heroes/grimmwood-hansel-gretel.png',
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
        /* nerf 2026-08-05 (user): 32 -> 35 */
        cost: 35,
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
      art: 'assets/heroes/grimmwood-snow-white.png',
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
        text: 'Whenever an ally attacks a debuffed enemy, immediately gain <b>8% Crit Chance for 2 rounds</b>, <b>5% ATK for 2 rounds</b> and a <b>10% Max HP Shield</b>. Red Riding Hood heals for <b>25%</b> of the damage she deals to debuffed enemies.',
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
    /* ---- 2026-08-05 expansion: +6 completes a full single-faction deck
       (Tank/Bruiser/Controller/Medic/Caster/Sniper x2) for new accounts ---- */
    {
      id: 'grimmwood-gingerbread-man',
      name: 'Gingerbread Man',
      rarity: 'common',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 6900, atk: 1000, def: 30 },
      ability: {
        type: 'Active',
        name: 'Run, Run, Run',
        cost: 40,
        text: 'Immediately gain a <b>15% Max HP Shield</b> and <b>Provoke</b> for 1 round, healing <b>4% Max HP</b> each time you are attacked while Provoking. The <b>2 lowest-HP enemies</b> suffer <b>20% reduced ATK</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'shield', pctMaxHp: 15, to: 'self' },
            { k: 'taunt', turns: 1, to: 'self', healOnHit: 4 },
            /* he cannot catch them - so he slows THEM down instead */
            {
              k: 'stat',
              stat: 'atk',
              amt: -20,
              turns: 2,
              to: 'enemies',
              take: { n: 2, by: 'lowestHp' },
              when: 'now',
            },
          ],
        },
      },
      icon: 'ra-shoe-prints',
      art: 'assets/heroes/grimmwood-gingerbread-man.png',
    },
    {
      id: 'grimmwood-evil-queen',
      name: 'Evil Queen',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Shadow',
      stats: { hp: 4740, atk: 1900, def: 15 },
      ability: {
        type: 'Active',
        name: 'The Mirror Never Lies',
        cost: 45,
        text: 'Deal <b>50% ATK Shadow Damage</b> to all enemies, then the mirror turns on the <b>highest-HP enemy</b> - they suffer <b>Exposed</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.5, element: 'Shadow' },
            /* the mirror names the fairest of them all */
            { k: 'exposed', turns: 2, to: 'targets', take: { n: 1, by: 'highestHp' }, when: 'now' },
          ],
        },
      },
      icon: 'ra-queen-crown',
      art: 'assets/heroes/grimmwood-evil-queen.png',
    },
    {
      id: 'grimmwood-puss-in-boots',
      name: 'Puss in Boots',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Nature',
      stats: { hp: 4530, atk: 1955, def: 10 },
      ability: {
        type: 'Active',
        name: 'Clever Feint',
        cost: 40,
        text: 'Deal <b>150% ATK Nature Damage</b> at full power even past a <b>Provoke</b>. If the target has <b>2+ debuffs</b>, deal <b>45% more</b> and refund <b>10 Energy</b>.',
        note: null,
        spec: {
          /* noPierceTax: the feint was AIMED at the gap in the wall - a
             Sniper signature already pierces the redirect; this one is
             never priced down for it either. */
          target: { side: 'enemy', pick: 'single', row: 'any', noPierceTax: true },
          effects: [
            {
              k: 'dmg',
              power: 1.5,
              element: 'Nature',
              ifMult: [{ when: { debuffCountAtLeast: 2 }, mult: 1.45 }],
            },
            { k: 'gainEnergy', amt: 10, if: { debuffCountAtLeast: 2 } },
          ],
        },
      },
      icon: 'ra-cat',
      art: 'assets/heroes/grimmwood-puss-in-boots.png',
    },
    {
      id: 'grimmwood-rapunzel',
      name: 'Rapunzel',
      rarity: 'epic',
      role: 'Caster',
      element: 'Magic',
      stats: { hp: 4740, atk: 1880, def: 15 },
      ability: {
        type: 'Active',
        name: 'Let Down Your Hair',
        cost: 40,
        text: 'Deal <b>55% ATK Magic Damage</b> to back-row enemies and reduce their <b>ATK by 15% for 2 rounds</b>. Any enemy already debuffed is instead <b>Exposed</b> for 1 round.',
        note: null,
        spec: {
          /* back row only (2026-08-05): hitting everyone was the all -
               the hair now reaches past the front line into the row she
               can actually see over their heads */
          target: { side: 'enemy', pick: 'all', row: 'back' },
          effects: [
            { k: 'dmg', power: 0.55, element: 'Magic' },
            /* ORDER MATTERS (same rule Pied Piper follows): the Exposed
               check runs BEFORE her own ATK debuff lands, or every clean
               target would count as "already debuffed" off the very
               debuff this cast just applied. */
            { k: 'exposed', turns: 1, to: 'targets', if: { targetHasDebuff: true }, when: 'now' },
            {
              k: 'stat',
              stat: 'atk',
              amt: -15,
              turns: 2,
              to: 'targets',
              if: { targetHasDebuff: false },
              when: 'now',
            },
          ],
        },
      },
      icon: 'ra-tower',
      art: 'assets/heroes/grimmwood-rapunzel.png',
    },
    {
      id: 'grimmwood-goldilocks',
      name: 'Goldilocks',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Nature',
      stats: { hp: 4420, atk: 1900, def: 12 },
      ability: {
        type: 'Active',
        name: 'Just Right',
        cost: 40,
        text: 'Deal <b>120% ATK Nature Damage</b>. If the target is between <b>30% and 70% HP</b>, instead deal <b>250% ATK</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            /* exactly one arm fires - the window is inclusive, its
               complement covers everything else, so it always reads as
               ONE hit, priced by where the target stands */
            { k: 'dmg', power: 2.5, element: 'Nature', if: { targetHpBetween: [0.3, 0.7] } },
            { k: 'dmg', power: 1.2, element: 'Nature', if: { targetHpOutside: [0.3, 0.7] } },
          ],
        },
      },
      icon: 'ra-honeycomb',
      art: 'assets/heroes/grimmwood-goldilocks.png',
    },
    {
      id: 'grimmwood-cinderella',
      name: 'Cinderella',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4820, atk: 1060, def: 20 },
      ability: {
        type: 'Active',
        name: 'Glass Slipper',
        cost: 30,
        text: 'Immediately heal an ally for <b>30% Max HP</b> and cleanse <b>all</b> of their debuffs; for each debuff cleansed, heal an extra <b>5% Max HP</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [
            { k: 'heal', pctMaxHp: 30 },
            { k: 'cleanse', count: 'all', to: 'targets' },
            /* pctMaxHp 0 alone heals nothing (logs nothing); with a
               scrubbed target the per-debuff rider is the whole heal */
            { k: 'heal', pctMaxHp: 0, perCleansed: 5, to: 'targets' },
          ],
        },
      },
      icon: 'ra-glass-heart',
      art: 'assets/heroes/grimmwood-cinderella.png',
    },
  ],
});
