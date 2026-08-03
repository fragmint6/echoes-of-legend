/* Faction: Huaxia - Marks & Counterplay
   -------------------------------------------------------------
   Re-tuned to match the standard stat/power templates of the other
   factions (Tank HP ~7,200, Bruiser ATK ~1,710, Caster/Sniper damage
   multipliers ~180-200%). Introduces two engine mechanics:

     take: {n, by}      an effect-level target limiter - of the resolved
                        targets only the top N by 'highestAtk'/'lowestHp'
                        receive the effect (Qin Shi Huang's 2 marks).
     Marks              have no duration (global rule). A marked enemy
                        keeps the mark until Skill damage - or an
                        explicit consume - pops it (engine dealDamage /
                        consumeMark). Huaxia's marks used to be timed.
     counterStrike      Guan Yu: while Shielded, attackers take a
                        counter hit (bigger if the attacker is Marked).
     drainEnergy        Zhuge Liang: remove enemy energy (not a steal).
   ============================================================= */
window.EOL.registerFaction({
  id: 'huaxia',
  name: 'Huaxia',
  icon: 'ra-two-dragons',
  tagline: 'Empires rise where the dragon sleeps.',
  colors: { primary: '#b03a2e', secondary: '#d9a521', glow: '#ff8b6a' },
  cards: [
    {
      id: 'huaxia-qin-shi-huang',
      name: 'Qin Shi Huang',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Magic',
      stats: { hp: 4970, atk: 1950, def: 15 },
      ability: {
        type: 'Active',
        name: 'Great Wall Mandate',
        /* BUFF 2026-07-31. At 49.3% he was the weakest of the three
           "real" Casters despite a legendary slot, and the telemetry named
           the reason: 23% survival, the lowest of any Caster, on a 45 EN AoE
           that he often did not live to cast twice. The Great Wall should
           protect the man who built it, so the buff is defensive plus a
           small damage bump rather than raw numbers:
             - 50% -> 60% ATK AoE
             - Marks 2 -> 3 highest-ATK enemies (more for Mark consumers)
             - NEW: he and his allies gain 10% DEF for 2 rounds
           The Marks are the faction's currency (81% of all Marks get
           consumed), so widening them helps Huaxia's whole combo line, not
           just him. */
        cost: 45,
        /* NERF 2026-08-02. Measured at 67.5% win rate, the highest in
           the game and outside the 35-65 healthy band. The problem was
           that 60% + Mark to ALL SIX enemies never got worse: the card
           paid the same whether he cast it on round 2 or round 12.

           It is now a ROW choice, which fixes that structurally:
             - caps at 3 targets instead of 6
             - decays on its own, because rows empty as the fight goes
               on (and the front row empties first)
             - becomes a real decision - break the wall in front of you,
               or reach past it for their casters
           Damage goes 60% -> 70% per target to part-compensate the
           halved target count, and the Mark now hits everyone in the
           chosen row rather than the 3 highest ATK. */
        text: 'Choose a row. Deal <b>70% ATK Magic Damage</b> to every enemy in that row and apply <b>Mark</b> to each of them, then raise the Great Wall - all allies gain <b>10% DEF</b> for 2 rounds.',
        note: 'Hits only the chosen row, so it weakens as that row empties.',
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          choose: [
            {
              label: 'Wall against the front',
              icon: 'ra-shield',
              art: 'assets/heroes/huaxia-qin-shi-huang.png',
              effects: [
                { k: 'dmg', power: 0.7, element: 'Magic', frontOnly: true },
                { k: 'mark', to: 'targets', frontOnly: true, when: 'now' },
                { k: 'stat', stat: 'def', amt: 10, turns: 2, to: 'allies' },
              ],
            },
            {
              label: 'Wall against the back',
              icon: 'ra-crossed-swords',
              effects: [
                { k: 'dmg', power: 0.7, element: 'Magic', backOnly: true },
                { k: 'mark', to: 'targets', backOnly: true, when: 'now' },
                { k: 'stat', stat: 'def', amt: 10, turns: 2, to: 'allies' },
              ],
            },
          ],
        },
      },
      icon: 'ra-scroll-unfurled',
    },
    {
      id: 'huaxia-lu-bu',
      name: 'Lu Bu',
      rarity: 'rare',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6480, atk: 1710, def: 22 },
      ability: {
        type: 'Passive',
        name: 'Halberd of the Conqueror',
        cost: null,
        text: "Lu Bu's attacks deal <b>15% increased damage</b> against <b>Marked</b> enemies. When Lu Bu defeats an enemy, refund <b>15 Energy</b> to your team's pool and apply <b>Mark</b> to the highest ATK surviving enemy.",
        note: null,
        passive: {
          triggers: ['static', 'selfKilled'],
          effects: [
            { k: 'outgoingMult', mult: 1.15, when: { targetMarked: true } },
            { k: 'gainEnergy', amt: 15 },
            { k: 'mark', to: 'enemies', take: { n: 1, by: 'highestAtk' }, when: 'now' },
          ],
        },
      },
      icon: 'ra-halberd',
      art: 'assets/heroes/huaxia-lu-bu.png',
    },
    {
      id: 'huaxia-zhuge-liang',
      name: 'Zhuge Liang',
      rarity: 'epic',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 5355, atk: 1290, def: 20 },
      ability: {
        type: 'Active',
        name: 'Eight Gates Array',
        cost: 40,
        text: "Deal <b>70% ATK Magic Damage</b> to 2 target enemies and apply <b>Mark</b>; also inflict <b>-20% DEF</b> for 2 rounds and drain <b>15 Energy</b> from the enemy team's pool.",
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.7, element: 'Magic' },
            { k: 'mark', to: 'targets', when: 'now' },
            { k: 'stat', stat: 'def', amt: -20, turns: 2, to: 'targets', when: 'now' },
            { k: 'drainEnergy', amt: 15 },
          ],
        },
      },
      icon: 'ra-crystal-ball',
      art: 'assets/heroes/huaxia-zhuge-liang.png',
    },
    {
      id: 'huaxia-guan-yu',
      name: 'Guan Yu',
      rarity: 'epic',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7210, atk: 1050, def: 30 },
      ability: {
        type: 'Active',
        name: 'Crescent Blade Guard',
        cost: 40,
        text: 'Gain Provoke and a <b>15% Max HP Shield</b> for 1 round. Whenever Guan Yu is attacked while Shielded, strike the attacker for <b>70% ATK Damage</b> (increased to <b>120% ATK</b> if the attacker is <b>Marked</b>).',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'shield', pctMaxHp: 15, to: 'self' },
            { k: 'taunt', turns: 1, to: 'self' },
            { k: 'counterStrike', power: 0.7, markedPower: 1.2, turns: 1, to: 'self' },
          ],
        },
      },
      icon: 'ra-broadsword',
      art: 'assets/heroes/huaxia-guan-yu.png',
    },
    {
      id: 'huaxia-hua-tuo',
      name: 'Hua Tuo',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4800, atk: 1020, def: 20 },
      ability: {
        type: 'Active',
        name: 'Five Animals Play',
        cost: 25,
        text: 'Heal an ally for <b>35% Max HP</b> and grant them <b>15% DEF</b> for 2 rounds. If that ally is debuffed, cleanse 1 debuff and grant them a <b>10% Max HP Shield</b>; otherwise, heal them again for <b>10% Max HP</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [
            {
              k: 'branch',
              cond: { targetHasDebuff: true },
              then: [
                { k: 'heal', pctMaxHp: 35 },
                { k: 'stat', stat: 'def', amt: 15, turns: 2, to: 'targets' },
                { k: 'cleanse', count: 1, to: 'targets' },
                { k: 'shield', pctMaxHp: 10, to: 'targets' },
              ],
              other: [
                { k: 'heal', pctMaxHp: 35 },
                { k: 'stat', stat: 'def', amt: 15, turns: 2, to: 'targets' },
                { k: 'heal', pctMaxHp: 10 },
              ],
            },
          ],
        },
      },
      icon: 'ra-pawprint',
      art: 'assets/heroes/huaxia-hua-tuo.png',
    },
    {
      id: 'huaxia-huang-zhong',
      name: 'Huang Zhong',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Physical',
      stats: { hp: 4310, atk: 1880, def: 10 },
      ability: {
        type: 'Active',
        name: 'Precision Volley',
        cost: 45,
        text: 'Deal <b>180% ATK Damage</b> to the lowest HP enemy. If that target is <b>Marked</b>, consume the Mark to deal <b>60% ATK bonus damage</b> and apply <b>Exposed</b> for 1 round.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'auto', auto: 'lowestHp', row: 'any' },
          effects: [
            {
              k: 'branch',
              cond: { anyTargetMarked: true },
              then: [
                { k: 'dmg', power: 1.8, element: 'Physical' },
                { k: 'dmg', power: 0.6, element: 'Physical' },
                { k: 'consumeMark' },
                { k: 'exposed', turns: 1, to: 'targets', when: 'now' },
              ],
              other: [{ k: 'dmg', power: 1.8, element: 'Physical' }],
            },
          ],
        },
      },
      icon: 'ra-arrow-cluster',
      art: 'assets/heroes/huaxia-huang-zhong.png',
    },
    {
      id: 'huaxia-sun-wukong',
      name: 'Sun Wukong',
      rarity: 'legendary',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6480, atk: 1730, def: 25 },
      ability: {
        type: 'Passive',
        name: '72 Transformations',
        cost: null,
        text: 'The first time Sun Wukong would be defeated, immediately revive with <b>30% HP</b>, cleansed of every effect, and a <b>20% Max HP Shield</b>, become Untargetable and Provoke for 1 round, and gain <b>25% ATK</b> for the rest of the battle.',
        note: 'Once per battle.',
        passive: {
          trigger: 'wouldDie',
          oncePerBattle: true,
          effects: [
            /* `wipe` clears everything he was carrying when he died, so he
               does not return still Burning or Exposed. The shield, ATK,
               Provoke and Untargetable below are applied after it. */
            { k: 'revive', pctMaxHp: 30, wipe: true },
            { k: 'shield', pctMaxHp: 20, to: 'self' },
            { k: 'untargetable', turns: 1, to: 'self' },
            { k: 'taunt', turns: 1, to: 'self' },
            { k: 'stat', stat: 'atk', amt: 25, turns: 99, to: 'self' },
          ],
        },
      },
      icon: 'ra-aura',
      art: 'assets/heroes/huaxia-sun-wukong.png',
    },
    {
      id: 'huaxia-nezha',
      name: 'Nezha',
      rarity: 'epic',
      role: 'Sniper',
      element: 'Fire',
      stats: { hp: 4530, atk: 1955, def: 10 },
      ability: {
        type: 'Active',
        name: 'Wind Fire Wheels',
        cost: 50,
        text: 'Deal <b>180% ATK Fire Damage</b>; if the target has already taken damage this round, immediately strike again for <b>60% ATK</b> and apply <b>Burn</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 1.8, element: 'Fire' },
            { k: 'dmg', power: 0.6, element: 'Fire', if: { targetDamagedBefore: true } },
            { k: 'burn', turns: 2, to: 'targets', if: { targetDamagedBefore: true }, when: 'now' },
          ],
        },
      },
      icon: 'ra-fire-symbol',
      art: 'assets/heroes/huaxia-nezha.png',
    },
    {
      id: 'huaxia-mulan',
      name: 'Mulan',
      rarity: 'common',
      role: 'Sniper',
      element: 'Physical',
      stats: { hp: 4310, atk: 1860, def: 10 },
      ability: {
        type: 'Passive',
        name: "Warrior's Resolve",
        cost: null,
        text: 'When an ally drops below <b>40% HP</b> or is defeated, immediately gain <b>12% ATK</b> and <b>10% Crit Chance</b> for the rest of the battle.',
        note: 'Max: 4 stacks.',
        passive: {
          triggers: ['allyDied', 'allyBelowHp'],
          threshold: 0.4,
          effects: [
            {
              k: 'stat',
              stat: 'atk',
              amt: 12,
              turns: 99,
              to: 'self',
              stackTag: 'warriors-resolve-atk',
              maxStacks: 4,
            },
            {
              k: 'stat',
              stat: 'crit',
              amt: 10,
              turns: 99,
              to: 'self',
              stackTag: 'warriors-resolve-crit',
              maxStacks: 4,
            },
          ],
        },
      },
      icon: 'ra-crossbow',
      art: 'assets/heroes/huaxia-mulan.png',
    },
  ],
});
