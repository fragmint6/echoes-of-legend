/* Faction: Olympus - Marks */
window.EOL.registerFaction({
  id: 'olympus',
  name: 'Olympus',
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
      stats: { hp: 4970, atk: 1900, def: 15 },
      ability: {
        type: 'Active',
        name: 'Divine Judgment',
        cost: 60,
        text: 'If any enemies are <b>Marked</b>, deal <b>130% ATK Lightning Damage</b> to them and reduce their DEF by <b>20% for 2 rounds</b>; otherwise <b>Mark</b> all enemies.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'branch',
              cond: { anyTargetMarked: true },
              then: [
                {
                  k: 'stat',
                  stat: 'def',
                  amt: -20,
                  turns: 2,
                  to: 'targets',
                  onlyMarked: true,
                  when: 'now',
                },
                { k: 'dmg', power: 1.3, element: 'Lightning', onlyMarked: true },
                { k: 'consumeMark' },
              ],
              other: [{ k: 'mark', to: 'targets', when: 'now' }],
            },
          ],
        },
      },
      icon: 'ra-lightning-bolt',
      art: 'assets/heroes-line/olympus-zeus.svg',
    },
    {
      id: 'olympus-athena',
      name: 'Athena',
      rarity: 'rare',
      role: 'Controller',
      element: 'Light',
      stats: { hp: 5355, atk: 1290, def: 20 },
      ability: {
        type: 'Passive',
        name: 'Divine Strategy',
        cost: null,
        text: 'Apply <b>Mark</b> to any enemy that casts a Skill. The first enemy Skill each round deals <b>15% less damage</b>, and <b>Marked</b> enemies deal <b>10% less damage</b>.',
        note: null,
        passive: {
          triggers: ['incomingAbilityDamage', 'enemyCastSkill'],
          teamWide: true,
          effects: [
            { k: 'damageMult', mult: 0.85, firstPerRound: true },
            { k: 'damageMult', mult: 0.9, ifAttackerMarked: true },
            { k: 'mark', to: 'targets' },
          ],
        },
      },
      icon: 'ra-shield',
      art: 'assets/heroes-line/olympus-athena.svg',
    },
    {
      id: 'olympus-hercules',
      name: 'Hercules',
      rarity: 'epic',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7210, atk: 1030, def: 30 },
      ability: {
        type: 'Active',
        name: 'Twelve Labors',
        cost: 50,
        text: 'Immediately gain <b>25% DEF</b>, <b>20% ATK</b> and Provoke for 2 rounds, then gain a <b>15% Max HP Shield</b> when the Provoke ends.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'stat', stat: 'def', amt: 25, turns: 2, to: 'self' },
            { k: 'stat', stat: 'atk', amt: 20, turns: 2, to: 'self' },
            { k: 'taunt', turns: 2, to: 'self', shieldOnEnd: 15 },
          ],
        },
      },
      icon: 'ra-muscle-fat',
      art: 'assets/heroes-line/olympus-hercules.svg',
    },
    {
      id: 'olympus-apollo',
      name: 'Apollo',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4900, atk: 1080, def: 20 },
      ability: {
        type: 'Active',
        name: "Sun's Grace",
        cost: 20,
        text: 'Immediately heal an ally for <b>35% Max HP</b> and grant <b>all allies 12% Crit Chance</b> for 2 rounds, then apply <b>Mark</b> to the highest ATK enemy.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [
            { k: 'heal', pctMaxHp: 35 },
            /* team-wide: a single-target crit buff never paid for the action */
            { k: 'stat', stat: 'crit', amt: 12, turns: 2, to: 'allies' },
            { k: 'mark', to: 'enemies', take: { n: 1, by: 'highestAtk' }, when: 'now' },
          ],
        },
      },
      icon: 'ra-sun-symbol',
      art: 'assets/heroes-line/olympus-apollo.svg',
    },
    {
      id: 'olympus-medusa',
      name: 'Medusa',
      rarity: 'epic',
      /* RECLASS 2026-07-31: Sniper -> Controller. A Sniper is defined by
         single-target elimination; Medusa has no damage Skill whatsoever.
         Her entire kit is applying Exposed to whoever strikes her - a debuff
         engine wearing a Sniper's glass-cannon statline, which is why she
         measured 5,616 dmg/app against a 9,350 Sniper average. Restatted into
         the Controller band. */
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 5355, atk: 1290, def: 20 },
      ability: {
        type: 'Passive',
        name: 'Petrifying Gaze',
        cost: null,
        text: 'When Medusa is attacked, the attacker is <b>Exposed</b> for 1 round (first attack each round).',
        note: null,
        passive: {
          trigger: 'wasAttacked',
          firstPerRound: true,
          effects: [{ k: 'exposed', turns: 1, to: 'targets' }],
        },
      },
      icon: 'ra-snake',
      art: 'assets/heroes-line/olympus-medusa.svg',
    },
    {
      id: 'olympus-ares',
      name: 'Ares',
      rarity: 'common',
      role: 'Bruiser',
      element: 'Fire',
      stats: { hp: 5580, atk: 1490, def: 20 },
      ability: {
        type: 'Passive',
        name: 'Bloodlust',
        cost: null,
        text: 'Whenever Ares attacks he gains <b>8% ATK</b> for the rest of the battle, and hitting a <b>Marked</b> target deals <b>40% bonus damage</b> and applies <b>Burn</b> for 2 rounds.',
        note: 'Max: 40% ATK.',
        passive: {
          trigger: 'selfAttacked',
          effects: [
            {
              k: 'stat',
              stat: 'atk',
              amt: 8,
              turns: 99,
              to: 'self',
              stackTag: 'bloodlust',
              maxStacks: 5,
            },
          ],
          onHit: [
            { k: 'dmg', power: 0.4, element: 'inherit', ifTargetMarked: true },
            { k: 'burn', turns: 2, ifTargetMarked: true },
          ],
        },
      },
      icon: 'ra-bleeding-hearts',
      art: 'assets/heroes-line/olympus-ares.svg',
    },
  ],
});
