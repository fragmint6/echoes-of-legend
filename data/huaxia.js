/* Faction: Huaxia — Marks & Counterplay
   -------------------------------------------------------------
   Re-tuned to match the standard stat/power templates of the other
   factions (Tank HP ~7,200, Bruiser ATK ~1,710, Caster/Sniper damage
   multipliers ~180-200%). Introduces two engine mechanics:

     take: {n, by}      an effect-level target limiter — of the resolved
                        targets only the top N by 'highestAtk'/'lowestHp'
                        receive the effect (Qin Shi Huang's 2 marks).
     Marks              have no duration (global rule). A marked enemy
                        keeps the mark until ability damage — or an
                        explicit consume — pops it (engine dealDamage /
                        consumeMark). Huaxia's marks used to be timed.
     counterStrike      Guan Yu: while Shielded, attackers take a
                        counter hit (bigger if the attacker is Marked).
     drainEnergy        Zhuge Liang: remove enemy energy (not a steal).
   ============================================================= */
window.EOL.registerFaction({
  id: 'huaxia',
  name: 'Huaxia',
  icon: 'ra-broadsword',
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
        cost: 45,
        text: 'Deal <b>50% ATK Magic Damage</b> to all enemies and apply <b>Mark</b> to the 2 enemies with the highest ATK.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.5, element: 'Magic' },
            { k: 'mark', to: 'targets', take: { n: 2, by: 'highestAtk' }, when: 'now' }
          ]
        }
      },
      icon: 'ra-scroll-unfurled'
    },
    {
      id: 'huaxia-lu-bu',
      name: 'Lu Bu',
      rarity: 'legendary',
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
            { k: 'mark', to: 'enemies', take: { n: 1, by: 'highestAtk' }, when: 'now' }
          ]
        }
      },
      icon: 'ra-halberd'
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
            { k: 'drainEnergy', amt: 15 }
          ]
        }
      },
      icon: 'ra-crystal-ball'
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
        text: 'Gain Taunt and a <b>15% Max HP Shield</b> for 1 round. Whenever Guan Yu is attacked while Shielded, strike the attacker for <b>70% ATK Damage</b> (increased to <b>120% ATK</b> if the attacker is <b>Marked</b>).',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'shield', pctMaxHp: 15, to: 'self' },
            { k: 'taunt', turns: 1, to: 'self' },
            { k: 'counterStrike', power: 0.7, markedPower: 1.2, turns: 1, to: 'self' }
          ]
        }
      },
      icon: 'ra-broadsword'
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
                { k: 'shield', pctMaxHp: 10, to: 'targets' }
              ],
              other: [
                { k: 'heal', pctMaxHp: 35 },
                { k: 'stat', stat: 'def', amt: 15, turns: 2, to: 'targets' },
                { k: 'heal', pctMaxHp: 10 }
              ]
            }
          ]
        }
      },
      icon: 'ra-pawprint'
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
                { k: 'exposed', turns: 1, to: 'targets', when: 'now' }
              ],
              other: [
                { k: 'dmg', power: 1.8, element: 'Physical' }
              ]
            }
          ]
        }
      },
      icon: 'ra-arrow-cluster'
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
        text: 'The first time Sun Wukong would be defeated, immediately revive with <b>30% HP</b> and a <b>20% Max HP Shield</b>, become Untargetable and Taunt for 1 round, and gain <b>25% ATK</b> for the rest of the battle.',
        note: 'Once per battle.',
        passive: {
          trigger: 'wouldDie',
          oncePerBattle: true,
          effects: [
            { k: 'revive', pctMaxHp: 30 },
            { k: 'shield', pctMaxHp: 20, to: 'self' },
            { k: 'untargetable', turns: 1, to: 'self' },
            { k: 'taunt', turns: 1, to: 'self' },
            { k: 'stat', stat: 'atk', amt: 25, turns: 99, to: 'self' }
          ]
        }
      },
      icon: 'ra-aura'
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
            { k: 'burn', turns: 2, to: 'targets', if: { targetDamagedBefore: true }, when: 'now' }
          ]
        }
      },
      icon: 'ra-fire-symbol'
    },
    {
      id: 'huaxia-mulan',
      name: 'Mulan',
      rarity: 'rare',
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
            { k: 'stat', stat: 'atk', amt: 12, turns: 99, to: 'self', stackTag: 'warriors-resolve-atk', maxStacks: 4 },
            { k: 'stat', stat: 'crit', amt: 10, turns: 99, to: 'self', stackTag: 'warriors-resolve-crit', maxStacks: 4 }
          ]
        }
      },
      icon: 'ra-crossbow'
    }
  ]
});
