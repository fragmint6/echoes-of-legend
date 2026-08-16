/* Faction: Yamato - Energy economy */
window.EOL.registerFaction({
  id: 'yamato',
  name: 'Yamato',
  icon: 'ra-dragon',
  tagline: 'The rising sun knows no surrender.',
  colors: { primary: '#e05a4a', secondary: '#f0c05a', glow: '#ff9b7a' },
  cards: [
    {
      id: 'yamato-minamoto-no-yoshitsune',
      name: 'Minamoto no Yoshitsune',
      rarity: 'rare',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6100, atk: 1740, def: 22 },
      ability: {
        type: 'Active',
        name: 'War Drums',
        cost: 55,
        text: 'Deal <b>150% ATK</b>, gaining <b>+6% per 10 Energy above 20</b> (max +30%). Kill: refund 20 Energy.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            {
              k: 'dmg',
              power: 1.5,
              element: 'Physical',
              ifMult: [{ when: { selfEnergyAbove: 20 }, mult: 1.3 }],
            },
            { k: 'gainEnergy', amt: 20, if: { killedTarget: true } },
          ],
        },
      },
      icon: 'ra-dervish-swords',
      art: 'assets/legends/yamato-minamoto-no-yoshitsune.png',
    },
    {
      id: 'yamato-tomoe-gozen',
      name: 'Tomoe Gozen',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Physical',
      stats: { hp: 4420, atk: 1740, def: 12 },
      ability: {
        type: 'Active',
        name: 'Beheading Volley',
        cost: 45,
        text: 'Deal <b>145% ATK</b> and steal 8 Energy. Kill: steal 4 more.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'dmg', power: 1.45, element: 'Physical' },
            { k: 'stealEnergy', amt: 8 },
            { k: 'stealEnergy', amt: 4, if: { killedTarget: true } },
          ],
        },
      },
      icon: 'ra-arrow-flights',
      art: 'assets/legends/yamato-tomoe-gozen.png',
    },
    {
      id: 'yamato-benkei',
      name: 'Benkei',
      rarity: 'common',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 6900, atk: 1000, def: 30 },
      ability: {
        type: 'Passive',
        name: 'Standing Death',
        cost: null,
        text: 'At <b>50+ Energy</b>, take 15% less damage. The first lethal blow leaves Benkei at 1% HP and sets Energy to 0.',
        note: null,
        passive: {
          trigger: 'static',
          deathCheat: true,
          deathEnergy: 0,
          effects: [{ k: 'damageResist', mult: 0.85, when: { selfEnergyAbove: 49 } }],
        },
      },
      icon: 'ra-helmet',
      art: 'assets/legends/yamato-benkei.png',
    },
    {
      id: 'yamato-abe-no-seimei',
      name: 'Abe no Seimei',
      rarity: 'legendary',
      role: 'Controller',
      element: 'Magic',
      /* DEF 25 -> 20: the old stat line sat outside the Controller band
         (16-20). Corrected during the 2026-07-31 rework. */
      stats: { hp: 5755, atk: 1290, def: 20 },
      ability: {
        type: 'Active',
        name: 'Shikigami Prophecy',
        /* REWORK 2026-07-31. The old 'Binding Seal' was an Energy
           drain/tax engine: mechanically it belonged to no faction in
           particular, it read as generic denial rather than as Yamato, and
           it was the roster's worst balance offender (75.7% WR, 6.49 casts
           per appearance, 24pp clear of the next Controller) precisely
           because draining the enemy pool while spending from your own is a
           self-funding loop.

           Abe no Seimei was an onmyoji - a court diviner who commanded
           shikigami, paper charms folded into servant spirits, and who read
           fate before it arrived. The rework builds the card around that:

             1. He SEALS a fate on the target now (a delayed strike that
                lands at the end of the round - the prophecy).
             2. Yamato's Energy economy decides how severe the reading is:
                at 50+ Energy the omen is dire and the seal also Silences.
             3. The paper servant does the striking, so the payoff is
                deliberately back-loaded and telegraphed - it can be played
                around, unlike an instant nuke.

           This is the only card in the roster that uses the engine's
           `delayed` effect kind, which was fully implemented but unused. */
        cost: 35,
        text: 'Deal <b>50% ATK Magic Damage</b> and seal a shikigami on the target: at the end of the round it strikes for <b>70% ATK Magic Damage</b> and applies <b>Exposed</b> for 2 rounds. At <b>50+ Energy</b> the omen is dire - also <b>Silence</b> the target for 1 round and reduce their ATK by <b>25%</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            /* ROLE PASS 2026-07-31: 0.6 + 1.1 = 1.7 total power put a
               Controller at Caster damage tier, which the role definitions
               forbid. Cut to 0.5 + 0.7 = 1.2 and the lost damage is paid
               back as control: Exposed 1 -> 2 rounds, ATK -20% -> -25%. */
            { k: 'dmg', power: 0.5, element: 'Magic' },
            /* the prophecy: resolves at the end of the round via u.pending */
            {
              k: 'delayed',
              turns: 1,
              tag: 'shikigami',
              effects: [
                { k: 'dmg', power: 0.7, element: 'Magic' },
                { k: 'exposed', turns: 2, to: 'targets', when: 'now' },
              ],
            },
            /* Yamato identity: the reading is only dire on a full pool */
            {
              k: 'silence',
              turns: 1,
              to: 'targets',
              if: { selfEnergyAbove: 49 },
              when: 'now',
            },
            {
              k: 'stat',
              stat: 'atk',
              amt: -25,
              turns: 2,
              to: 'targets',
              if: { selfEnergyAbove: 49 },
              when: 'now',
            },
          ],
        },
      },
      icon: 'ra-rune-stone',
      art: 'assets/legends/yamato-abe-no-seimei.png',
    },
    {
      id: 'yamato-momotaro',
      name: 'Momotaro',
      rarity: 'epic',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 6860, atk: 980, def: 30 },
      ability: {
        type: 'Active',
        name: 'Legendary Companions',
        cost: 35,
        text: 'If your team has <b>30+ Energy</b>: all allies gain <b>+12% DEF</b> for 2 rounds and front-row allies gain a <b>Shield equal to 12% Max HP</b>. Otherwise: heal all allies for <b>20% Max HP</b> and cleanse <b>Burn</b> from them.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all' },
          effects: [
            {
              k: 'stat',
              stat: 'def',
              amt: 12,
              turns: 2,
              to: 'targets',
              if: { selfEnergyAbove: 29 },
            },
            { k: 'shield', pctMaxHp: 12, to: 'frontAllies', if: { selfEnergyAbove: 29 } },
            { k: 'heal', pctMaxHp: 20, to: 'targets', if: { selfEnergyBelow: 30 } },
            { k: 'cleanse', only: 'burn', to: 'targets', if: { selfEnergyBelow: 30 } },
          ],
        },
      },
      icon: 'ra-round-shield',
      art: 'assets/legends/yamato-momotaro.png',
    },
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
        text: 'Copy a random allied Active Skill at <b>70% effectiveness</b>.',
        note: null,
        spec: { target: { side: 'auto' }, effects: [{ k: 'copyAllyActive', scale: 0.7 }] },
      },
      icon: 'ra-moon-sun',
      art: 'assets/legends/yamato-kaguya.png',
    },
  ],
});
