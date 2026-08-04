/* Faction: Roma - Triumph (the kill-engine)
   -------------------------------------------------------------
   Roma's keyword is the TRIUMPH: the faction is paid for kills
   rather than for setup. Where Olympus/Huaxia bank Marks and
   Grimmwood banks debuffs, Roma banks CORPSES - nearly every card
   reads the death of a unit (either side's) and converts it into a
   permanent or multi-round advantage.

     Caesar        chains kill -> execute -> permanent ATK
     Constantine   converts a kill into a team-wide ATK + Shield swing
     Brutus        converts a kill into a team-wide ATK swing
     Augustus      converts every allied kill into triage healing
     Spartacus     converts allied DEATHS into team ATK (the failsafe)
     Cicero        the only non-kill card: he manufactures the opening

   Engine mechanics this file introduces:

     targetHasBuff        a condition - true when the target is carrying
                          a Shield or any positive stat buff. Brutus
                          punishes the enemy's setup turn, which makes
                          him the natural answer to Camelot/Olympus.
     killedCountAtLeast   a condition - how many units THIS cast has
                          killed so far. Lets Caesar tell a single kill
                          from a genuine double-kill.

   Cross-faction lines this faction is built to plug into:
     - Cicero's Silence + cost tax is a Yamato-style tempo denial that
       protects any expensive signature (Zeus, Caesar, Merlin).
     - Cicero's Exposed rider feeds Camelot (Lancelot) and Grimmwood
       (Red Riding Hood) ally-struck triggers.
     - Brutus punishes Camelot/Yamato/Olympus buff turns, the exact
       thing Marks and debuff stacking cannot punish.
     - Spartacus's ally-death payout stacks with Mulan's Warrior's
       Resolve for a genuine "losing board" comeback core.
   ============================================================= */
window.EOL.registerFaction({
  id: 'roma',
  name: 'Roma',
  icon: 'ra-guarded-tower',
  tagline: 'The eternal city demands victory.',
  colors: { primary: '#7b4dc0', secondary: '#d4af37', glow: '#c9a0ff' },
  cards: [
    {
      id: 'roma-julius-caesar',
      name: 'Julius Caesar',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6480, atk: 1730, def: 25 },
      ability: {
        type: 'Active',
        name: 'Veni, Vidi, Vici',
        /* Balance pass 2026-07-31: 55 -> 45 EN. At 55 EN Caesar fired only
           2.91 times/appearance against Guy of Gisborne's 4.37 at 45 EN,
           for less damage per cast - he finished 11.1pp below the Bruiser
           average. The strict double-kill gate already caps his upside, so
           the cost was paying for a snowball that rarely happens. */
        cost: 45,
        text: 'Deal <b>150% ATK Physical Damage</b>. If this defeats the target, immediately strike the lowest HP surviving enemy for <b>60% ATK</b>; if that blow also defeats its target, Caesar gains <b>5% ATK</b> for the rest of the battle.',
        note: 'Max: 5 stacks.',
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            { k: 'dmg', power: 1.5, element: 'Physical' },
            /* the execute: retargets to the lowest-HP survivor, and only
               happens if the opening blow actually killed */
            {
              k: 'dmg',
              power: 0.6,
              element: 'Physical',
              to: 'enemies',
              take: { n: 1, by: 'lowestHp' },
              if: { killedTarget: true },
            },
            /* the triumph: only a genuine DOUBLE kill pays out */
            {
              k: 'stat',
              stat: 'atk',
              amt: 5,
              turns: 99,
              to: 'self',
              stackTag: 'veni-vidi-vici',
              maxStacks: 5,
              if: { killedCountAtLeast: 2 },
            },
          ],
        },
      },
      icon: 'ra-crossed-swords',
      art: 'assets/heroes/roma-julius-caesar.png',
    },
    {
      id: 'roma-spartacus',
      name: 'Spartacus',
      rarity: 'common',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7210, atk: 1030, def: 30 },
      ability: {
        type: 'Passive',
        name: 'I Am Spartacus',
        cost: null,
        text: 'Whenever an ally is defeated, every surviving ally immediately gains <b>8% ATK</b> for the rest of the battle and Spartacus gains a <b>12% Max HP Shield</b>.',
        note: 'Max: 4 stacks.',
        passive: {
          trigger: 'allyDied',
          effects: [
            {
              k: 'stat',
              stat: 'atk',
              amt: 8,
              turns: 99,
              to: 'allies',
              stackTag: 'i-am-spartacus',
              maxStacks: 4,
            },
            /* Naturally bounded (an ally can only die five times) but
               tagged for the same reason as Red Riding Hood: the note
               says "Max: 4 stacks" and every rider should honour it. */
            {
              k: 'shield',
              pctMaxHp: 12,
              to: 'self',
              stackTag: 'i-am-spartacus-shield',
              maxStacks: 4,
            },
          ],
        },
      },
      icon: 'ra-circular-shield',
      art: 'assets/heroes/roma-spartacus.png',
    },
    {
      id: 'roma-augustus',
      name: 'Augustus',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4900, atk: 1080, def: 20 },
      ability: {
        type: 'Passive',
        name: 'Pax Romana',
        cost: null,
        text: 'Every time your team defeats an enemy, immediately heal the <b>2</b> lowest HP allies for <b>12% Max HP</b> and grant them <b>10% DEF</b> for 1 round.',
        note: null,
        passive: {
          trigger: 'selfKilled',
          effects: [
            /* DEF is applied BEFORE the heal on purpose: `take` re-sorts by
               current HP for every effect, and healing first would push the
               two wounded allies up the order so the DEF landed on a
               different pair. A DEF buff doesn't move HP, so this ordering
               guarantees both halves hit the same two heroes. */
            {
              k: 'stat',
              stat: 'def',
              amt: 10,
              turns: 1,
              to: 'allies',
              take: { n: 2, by: 'lowestHp' },
            },
            { k: 'heal', pctMaxHp: 12, to: 'allies', take: { n: 2, by: 'lowestHp' } },
          ],
        },
      },
      icon: 'ra-crowned-heart',
      art: 'assets/heroes/roma-augustus.png',
    },
    {
      id: 'roma-cicero',
      name: 'Cicero',
      rarity: 'epic',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 4835, atk: 1160, def: 20 },
      ability: {
        type: 'Active',
        name: 'Philippics',
        /* Balance pass 2026-07-31: 40 -> 25 EN and 80% -> 110% ATK.
           At 40 EN Philippics returned 1,299 value/cast against 2,790
           (Zhuge Liang) and 3,676 (Morgan le Fay) at the same price, and
           Cicero finished at 27.8% - the roster's worst hero. Silence only
           blocks signature Actives, so the AI answers it with a Basic and
           the headline effect underdelivers; the card is re-priced as the
           cheap tempo tool it actually is. */
        cost: 25,
        text: 'Deal <b>110% ATK Magic Damage</b> <b>+15% for each debuff</b> already on the target, <b>Silence</b> them for 1 round and raise their Skill cost by <b>12 Energy</b> for 1 round, applying <b>Exposed</b> for 1 round if they were already debuffed.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            /* Exposed is tested FIRST, against the debuffs the target
               already had - otherwise this cast's own Silence would
               always satisfy its own condition (same rule as Friar Tuck). */
            { k: 'exposed', turns: 1, to: 'targets', if: { targetHasDebuff: true }, when: 'now' },
            /* STACKING PAYOFF 2026-07-31: the damage conversion that makes
               piling debuffs worth doing. Silence now denies a whole turn,
               so Cicero is the faction's control piece - this lets the rest
               of the team's debuffs pay him back. Capped at 4 stacks. */
            { k: 'dmg', power: 1.1, element: 'Magic', perDebuff: 0.15, perDebuffMax: 3 },
            { k: 'silence', turns: 1, to: 'targets', when: 'now' },
            { k: 'costMod', unit: true, flat: 12, turns: 1, to: 'targets', when: 'now' },
          ],
        },
      },
      icon: 'ra-book',
      art: 'assets/heroes/roma-cicero.png',
    },
    {
      id: 'roma-brutus',
      name: 'Brutus',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Shadow',
      stats: { hp: 4310, atk: 1860, def: 10 },
      ability: {
        type: 'Active',
        name: 'Et Tu, Brute',
        cost: 45,
        text: 'Deal <b>150% ATK Shadow Damage</b> to the highest ATK enemy, increased to <b>210% ATK</b> if that enemy is <b>Shielded</b> or carrying any positive buff. If this defeats them, all allies gain <b>10% ATK</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'auto', auto: 'highestAtk', row: 'any' },
          effects: [
            {
              k: 'dmg',
              power: 1.5,
              element: 'Shadow',
              ifMult: [{ when: { targetHasBuff: true }, mult: 1.4 }],
            },
            { k: 'stat', stat: 'atk', amt: 10, turns: 2, to: 'allies', if: { killedTarget: true } },
          ],
        },
      },
      icon: 'ra-cloak-and-dagger',
      art: 'assets/heroes/roma-brutus.png',
    },
    {
      id: 'roma-constantine-the-great',
      name: 'Constantine the Great',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Light',
      stats: { hp: 4970, atk: 1950, def: 15 },
      ability: {
        type: 'Active',
        name: 'In Hoc Signo Vinces',
        /* Balance pass 2026-07-31: 60 -> 55 EN. Lowest survival in the game
           (14.4%) at the faction's highest price; the kill-gated payoff was
           conditional on the thing he was least able to do. */
        cost: 55,
        text: 'Deal <b>70% ATK Light Damage</b> to the enemy front row, then grant all allies <b>10% ATK</b> for 2 rounds - raised to <b>20% ATK</b> and a <b>10% Max HP Shield</b> if the strike defeated an enemy.',
        note: null,
        spec: {
          /* row 'front' + pick 'all' = the whole front row while it lives,
             and the whole back row once the front has been cleared. */
          target: { side: 'enemy', pick: 'all', row: 'front' },
          effects: [
            { k: 'dmg', power: 0.7, element: 'Light' },
            /* base rally, then a second identical buff on a kill: the two
               stack additively to the advertised 20%. */
            { k: 'stat', stat: 'atk', amt: 10, turns: 2, to: 'allies' },
            { k: 'stat', stat: 'atk', amt: 10, turns: 2, to: 'allies', if: { killedTarget: true } },
            { k: 'shield', pctMaxHp: 10, to: 'allies', if: { killedTarget: true } },
          ],
        },
      },
      icon: 'ra-hospital-cross',
      art: 'assets/heroes/roma-constantine-the-great.png',
    },
  ],
});
