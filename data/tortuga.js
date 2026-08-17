/* Faction: Tortuga - plunder, not destruction
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT

   Pirates take. Where Grimmwood strips a buff off an enemy and
   Transylvania moves it onto one legend, Tortuga converts the
   enemy's advantage into TEMPO for the whole crew: Energy, position,
   a corpse that cannot come back. Nothing here is subtle and nothing
   here is polite.

   PUBLIC DOMAIN, DELIBERATELY. Blackbeard, Anne Bonny, Calico Jack
   and Captain Kidd are real people, dead three centuries. The
   Kraken, the Flying Dutchman and Davy Jones's Locker are 18th-
   century sailors' folklore. What is avoided is Disney: their
   tentacle-faced Davy Jones is a copyrighted DESIGN, so this one is
   the folkloric drowned-sailor devil - no octopus. Tortuga is a real
   island off Haiti.

   THE STACKING WAS THE PROBLEM, AND IT IS FIXED
   -------------------------------------------------------------
   The first draft had Blackbeard gaining +12% ATK per Burning enemy
   (six enemies = +72% in one cast, uncapped), the Kraken draining
   10% ATK from every attacker with no ceiling, and the Dutchman
   scaling with no cap. The owner called it broken; it was. Every
   growth term here is now bounded and the note says so.

   THE INTERNAL SHAPE
   -------------------------------------------------------------
     Calico Jack   strips DEF board-wide - the setup
     Blackbeard    the AoE that cashes it in
     Captain Kidd  marks, and turns a kill into crew Energy
     Anne Bonny    steals a buff rather than removing it
     Davy Jones    denies the revive, which is the answer to Medea,
                   Isis, Sun Wukong and Osiris
     The Kraken    the wall that drags the whole line forward
     Dutchman      the closer: worth more the more of the crew is gone

   CROSS-FACTION
   -------------------------------------------------------------
     - Kidd's Marks feed Shiva, Indra, Zeus and Huaxia.
     - Davy Jones is the hard counter to every revive in the roster.
     - Calico Jack's DEF strip multiplies any Sniper in the game.
   ============================================================= */
window.EOL.registerFaction({
  id: 'tortuga',
  name: 'Tortuga',
  icon: 'ra-crossed-pistols',
  tagline: 'Take what you can. Give nothing back.',
  colors: { primary: '#2f6f6a', secondary: '#1a2a33', glow: '#7fe3d4' },
  cards: [
    {
      id: 'tortuga-blackbeard',
      name: 'Blackbeard',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Fire',
      stats: { hp: 4900, atk: 1970, def: 16 },
      ability: {
        type: 'Active',
        name: 'Lit Fuses',
        cost: 50,
        /* CAPPED. First draft: AoE Burn plus +12% ATK per Burning
           enemy, uncapped - which on a full board is +72% in a single
           cast, and it compounded every round because Burn persists.
           The ATK rider is gone entirely; the card is now a clean
           board-wide Burn opener whose value is the damage-over-time,
           not a self-buff spiral.

           Burn on all six is the widest Burn application in the game,
           which is exactly what a fuse-covered pirate should be, and it
           pairs with Empyrean's waiting game and Duat's execute line. */
        text: 'Deal <b>55% ATK Fire Damage</b> to all enemies and <b>Burn</b> the <b>2</b> lowest HP among them for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.55, element: 'Fire' },
            { k: 'burn', turns: 2, to: 'targets', take: { n: 2, by: 'lowestHp' } },
          ],
        },
      },
      icon: 'ra-lit-candelabra',
      art: null,
    },

    {
      id: 'tortuga-davy-jones',
      name: 'Davy Jones',
      rarity: 'epic',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 5400, atk: 1290, def: 19 },
      ability: {
        type: 'Active',
        name: 'The Locker',
        cost: 40,
        /* THE ANSWER TO EVERY REVIVE IN THE GAME - Isis, Medea, Osiris,
           Sun Wukong's death-cheat. Nothing else in the roster denies a
           return, which makes this a genuine sideboard card rather than
           a stat line, and it is a Controller doing Controller work:
           zero damage, pure denial.

           `noRevive` is a new flag but not a new mechanic - the revive
           case simply refuses a unit carrying it, the same way
           `spiritSpared` and `deathCheated` already gate returns. */
        text: 'Mark one enemy for the Locker: if they fall, they <b>cannot be revived</b>, they lose <b>15% DEF</b> for 2 rounds, and their team loses <b>12 Energy</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'noRevive', turns: 99, to: 'targets' },
            /* DEF strip so the card carries an upgradeable number, and
               so condemning someone also helps the crew finish them -
               a Locker mark that did nothing until they died was a
               dead turn against a healthy board. */
            { k: 'stat', stat: 'def', amt: -15, turns: 2, to: 'targets' },
            { k: 'drainEnergy', amt: 12 },
          ],
        },
      },
      icon: 'ra-anchor',
      art: null,
    },

    {
      id: 'tortuga-kraken',
      name: 'The Kraken',
      rarity: 'epic',
      role: 'Tank',
      element: 'Nature',
      stats: { hp: 7550, atk: 1080, def: 30 },
      ability: {
        type: 'Active',
        name: 'Drag Them Under',
        cost: 45,
        /* The only Provoke in the game that applies to the ENEMY side
           as a group: it drags their whole line forward, which means
           their back-row Casters and Snipers are suddenly reachable by
           every front-row attacker on your team. Distinct from the
           other three Provoke tanks in this release by pointing
           outward rather than inward.

           The per-attacker ATK drain from the first draft is gone -
           uncapped, on a body designed to be attacked, it was a
           board-wide debuff engine disguised as a Tank skill. */
        text: 'Drag the enemy line forward: all enemies are <b>Provoked</b> for 1 round, and the Kraken gains a <b>22% Max HP Shield</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'taunt', turns: 1, to: 'targets' },
            { k: 'shield', pctMaxHp: 22, to: 'self' },
          ],
        },
      },
      icon: 'ra-octopus',
      art: null,
    },

    {
      id: 'tortuga-anne-bonny',
      name: 'Anne Bonny',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6050, atk: 1710, def: 22 },
      ability: {
        type: 'Active',
        name: 'No Quarter',
        cost: 45,
        /* Plunder in its purest form: she takes the buffs rather than
           erasing them, and the payload scales with how many she
           found. `consumeBuffs` with a `payload` is the existing
           mechanism (see the shipped cards that cash stacks), and the
           scale rider means robbing a heavily-buffed Camelot legend
           pays far better than hitting a bare one. */
        text: 'Deal <b>150% ATK Physical Damage</b>, then strip every positive buff from the target and gain <b>8% ATK</b> for 2 rounds for each one taken.',
        note: 'Max: 4 stacks.',
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 1.5, element: 'Physical' },
            {
              k: 'consumeBuffs',
              to: 'targets',
              payload: [
                {
                  k: 'stat',
                  stat: 'atk',
                  amt: 8,
                  turns: 2,
                  to: 'self',
                  stackTag: 'no-quarter',
                  maxStacks: 4,
                },
              ],
            },
          ],
        },
      },
      icon: 'ra-crossed-sabres',
      art: null,
    },

    {
      id: 'tortuga-captain-kidd',
      name: 'Captain Kidd',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Physical',
      stats: { hp: 4520, atk: 1840, def: 13 },
      ability: {
        type: 'Active',
        name: 'Buried Treasure',
        cost: 40,
        /* The Mark supplier of the faction, and the Energy payoff is
           conditional on actually closing the kill - a different
           economy from Greed's passive tax and Odysseus's self-refund,
           because it pays the WHOLE TEAM. */
        text: 'Deal <b>160% ATK Physical Damage</b> and apply <b>Mark</b>. If this defeats the target, your team gains <b>15 Energy</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 1.6, element: 'Physical' },
            { k: 'mark', to: 'targets', when: 'now' },
            { k: 'gainEnergy', amt: 15, if: { killedTarget: true } },
          ],
        },
      },
      icon: 'ra-compass',
      art: null,
    },

    {
      id: 'tortuga-calico-jack',
      name: 'Calico Jack',
      rarity: 'rare',
      role: 'Controller',
      element: 'Physical',
      stats: { hp: 5150, atk: 1220, def: 17 },
      ability: {
        type: 'Active',
        name: 'Run Up the Colours',
        cost: 35,
        /* The setup card the whole faction is built around: a
           board-wide DEF strip makes Blackbeard's AoE, Kidd's shot and
           Bonny's charge all land harder, and it multiplies every
           Sniper in the game. Zero damage, correct for a Controller.
           Distinct from Carmilla (single target, plus self-heal). */
        text: 'Run up the black flag: all enemies lose <b>12% DEF</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [{ k: 'stat', stat: 'def', amt: -12, turns: 2, to: 'targets' }],
        },
      },
      icon: 'ra-crossed-bones',
      art: null,
    },

    {
      id: 'tortuga-flying-dutchman',
      name: 'The Flying Dutchman',
      rarity: 'rare',
      role: 'Caster',
      element: 'Shadow',
      stats: { hp: 4880, atk: 1900, def: 15 },
      ability: {
        type: 'Active',
        name: 'Cursed to Sail',
        cost: 45,
        /* CAPPED AT +60%. First draft scaled with no ceiling, which in
           a losing game is a Caster hitting for 300%+. `perFallenAlly`
           counts the caster's OWN dead - distinct from Jotunheim's
           `fallenAtLeast`, which reads both sides - so this is a
           comeback card rather than a snowball: it is worth nothing
           while you are winning. */
        text: 'Deal <b>70% ATK Shadow Damage</b> to <b>2</b> enemies, plus <b>20%</b> for each fallen ally.',
        note: 'Max: +60% from the crew lost.',
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            {
              k: 'dmg',
              power: 0.7,
              element: 'Shadow',
              perFallenAlly: 0.2,
              perFallenAllyMax: 3,
            },
          ],
        },
      },
      icon: 'ra-ship-emblem',
      art: null,
    },
  ],
});
