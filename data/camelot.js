/* Faction: Camelot - Shields & Exposed */
window.EOL.registerFaction({
  id: 'camelot',
  name: 'Camelot',
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
      stats: { hp: 7560, atk: 1080, def: 30 },
      ability: {
        type: 'Passive',
        name: 'King of Knights',
        cost: null,
        text: 'When an ally falls below <b>35% HP</b>, immediately grant a <b>15% Max HP Shield</b> to both Arthur and that ally, and Provoke for 1 round; if already Shielded, all allies gain <b>12% ATK</b> for 2 rounds instead.',
        note: 'Triggers at most once per ally.',
        passive: {
          trigger: 'allyBelowHp',
          threshold: 0.35,
          oncePerAlly: true,
          effects: [
            {
              k: 'branch',
              cond: { selfShielded: true },
              then: [{ k: 'stat', stat: 'atk', amt: 12, turns: 2, to: 'allies' }],
              other: [
                { k: 'shield', pctMaxHp: 15, to: 'self' },
                { k: 'shield', pctMaxHp: 15, to: 'triggerTarget' },
                { k: 'taunt', turns: 1, to: 'self' },
              ],
            },
          ],
        },
      },
      icon: 'ra-crown',
      art: 'assets/heroes/camelot-king-arthur.png',
    },
    {
      id: 'camelot-merlin',
      name: 'Merlin',
      rarity: 'epic',
      /* RECLASS 2026-07-31: Caster -> Controller. Merlin deals literally no
         damage (measured 0 from his signature; his 3,775 dmg/app is all
         role-Basic). A Caster is defined as a top-end AoE damage dealer, and
         he is the opposite: cost manipulation plus a team Shield. That is
         textbook Controller work, so the role and the statline now match the
         job. Restatted from 4970/2000/15 into the Controller band. */
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 5615, atk: 1350, def: 20 },
      ability: {
        type: 'Active',
        name: 'Prophecy',
        cost: 45,
        text: 'Immediately reduce allied Skill costs by <b>15 Energy</b> and increase enemy Skill costs by <b>15 Energy</b> for 1 round, and grant all allies a <b>10% Max HP Shield</b>.',
        note: null,
        spec: {
          target: { side: 'none' },
          effects: [
            { k: 'costMod', flat: -15, turns: 1, side: 'ally' },
            { k: 'costMod', flat: 15, turns: 1, side: 'enemy', when: 'now' },
            { k: 'shield', pctMaxHp: 10, to: 'allies' },
          ],
        },
      },
      icon: 'ra-crystal-wand',
      art: 'assets/heroes/camelot-merlin.png',
    },
    {
      id: 'camelot-lancelot',
      name: 'Lancelot',
      rarity: 'common',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6180, atk: 1650, def: 20 },
      ability: {
        type: 'Passive',
        name: 'Finest Knight',
        cost: null,
        text: 'Whenever an ally gains a Shield or Provokes, or attacks an <b>Exposed</b> enemy, immediately gain <b>10% ATK</b> and <b>6% Crit Chance</b> for the rest of the battle; at 3+ stacks, also gain <b>10% DEF</b> for 2 rounds.',
        note: 'Max: 5 stacks.',
        passive: {
          triggers: ['allyWarded', 'allyStruckExposed'],
          effects: [
            {
              k: 'stat',
              stat: 'atk',
              amt: 10,
              turns: 99,
              to: 'self',
              stackTag: 'finest-knight-atk',
              maxStacks: 5,
            },
            {
              k: 'stat',
              stat: 'crit',
              amt: 6,
              turns: 99,
              to: 'self',
              stackTag: 'finest-knight-crit',
              maxStacks: 5,
            },
            /* REFRESHES, it does not stack. The card promises "10% DEF
               for 2 rounds" - one buff, kept topped up while he is at
               3+ stacks. Untagged it re-applied on every trigger and
               reached +72% DEF (75% total) in testing, which is a
               different card from the one printed. `refresh` replaces
               the existing buff instead of adding another. */
            {
              k: 'stat',
              stat: 'def',
              amt: 10,
              turns: 2,
              to: 'self',
              stackTag: 'finest-knight-def',
              /* refresh => there is only ever ONE of these, so the cap
                 is 1. Stated explicitly because the schema check
                 rightly refuses a tag with no ceiling - that missing
                 ceiling is the whole bug class this pass closed. */
              refresh: true,
              maxStacks: 1,
              ifStacks: { tag: 'finest-knight-atk', min: 3 },
            },
          ],
        },
      },
      icon: 'ra-sword',
      art: 'assets/heroes/camelot-lancelot.png',
    },
    {
      id: 'camelot-morgan-le-fay',
      name: 'Morgan le Fay',
      rarity: 'epic',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 5355, atk: 1290, def: 20 },
      ability: {
        type: 'Active',
        name: 'Dark Illusion',
        cost: 40,
        text: 'Swap two enemies, reduce their ATK by <b>30% for 2 rounds</b>, and apply <b>Exposed for 2 rounds</b>, then deal <b>60% ATK Shadow Damage</b> to them.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            { k: 'swapTargets' },
            { k: 'stat', stat: 'atk', amt: -30, turns: 2, to: 'targets', when: 'now' },
            { k: 'exposed', turns: 2, to: 'targets', when: 'now' },
            { k: 'dmg', power: 0.6, element: 'Shadow' },
          ],
        },
      },
      icon: 'ra-raven',
      art: 'assets/heroes/camelot-morgan-le-fay.png',
    },
    {
      id: 'camelot-guinevere',
      name: 'Guinevere',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4750, atk: 1020, def: 22 },
      ability: {
        type: 'Active',
        name: 'Royal Blessing',
        cost: 30,
        /* BUFF PASS 2026-07-31. She was the roster's weakest card (38.7%)
           and her rider was the textbook trap: +10% ATK on ONE ally for 2
           rounds is worth 0.28x a basic attack, i.e. never worth the action.
           Rewritten as a TEAM buff so the numbers can actually pay for the
           turn. */
        text: 'Heal an ally for <b>22% Max HP</b> and grant a <b>12% Max HP Shield</b>. If they were already <b>Shielded</b>, all allies gain <b>10% ATK</b> for 2 rounds instead.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [
            { k: 'heal', pctMaxHp: 22 },
            /* `if` on a to:'allies' effect is tested PER ALLY, so gating the
               team buff that way only ever buffed the shielded one. A branch
               reads the condition once, off the chosen target, then applies
               the arm to everyone. */
            {
              k: 'branch',
              cond: { targetShielded: true },
              then: [{ k: 'stat', stat: 'atk', amt: 10, turns: 2, to: 'allies' }],
              other: [],
            },
            { k: 'shield', pctMaxHp: 12 },
          ],
        },
      },
      icon: 'ra-heart-tower',
      art: 'assets/heroes/camelot-guinevere.png',
    },
    {
      id: 'camelot-mordred',
      name: 'Mordred',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Shadow',
      stats: { hp: 4310, atk: 1860, def: 10 },
      ability: {
        type: 'Active',
        name: 'Treasonous Strike',
        cost: 40,
        text: "Deal <b>180% ATK Shadow Damage</b> to the lowest HP enemy, refunding <b>10 Energy</b> to your team's pool if that enemy is <b>Exposed</b>, and applying <b>Exposed</b> to adjacent enemies for 1 round.",
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'auto', auto: 'lowestHp', row: 'any' },
          effects: [
            { k: 'dmg', power: 1.8, element: 'Shadow' },
            { k: 'gainEnergy', amt: 10, if: { targetExposed: true } },
            {
              k: 'exposed',
              turns: 1,
              to: 'adjacentTargets',
              if: { targetExposed: true },
              when: 'now',
            },
          ],
        },
      },
      icon: 'ra-dripping-blade',
      art: 'assets/heroes/camelot-mordred.png',
    },
  ],
});
