/* Faction: Duat - The Scales
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT
   -------------------------------------------------------------
   Judgement is TWO steps, and no Duat card does both.

     WEIGH      strip a defendant's protection and drag them down
                toward the line  (Ma'at, Sekhmet)
     SENTENCE   carry out the execution once they are under it
                (Anubis, Horus)

   That split IS the faction. Anubis is the best executioner in the
   game and one of the worst attackers - his signature is ordinary
   until somebody else has done the weighing, at which point it
   roughly doubles. Ma'at and Sekhmet deal deliberately mediocre
   damage; their output is the CONDITION they create, not the
   number they print. Play them apart and you have two weak Casters
   and an underwhelming Sniper. Play them together and the chain is
   the strongest closing sequence in the roster.

   The other pan of the scale is Duat's answer to being judged
   itself: Isis buys back a hero who has already been sentenced,
   Nephthys stops the sentence landing at all.

   INTERNAL CHAIN (the reason to draft two Duat cards, not one)
   -------------------------------------------------------------
     Ma'at      Exposed on the 3 healthiest enemies  ->  everyone
                on your team hits those targets harder
     Sekhmet    Burn on the 2 lowest + team-wide anti-heal  ->  the
                wounded cannot climb back above Anubis's line, and
                Burn ticks push them under it
     Anubis     executes anything under the line; the extended
                threshold only unlocks against a target carrying
                2+ debuffs, which is precisely what the two Casters
                above manufacture
     Horus      reaches the defendant hiding behind a Provoke so the
                sentence cannot be body-blocked

   BALANCE NOTE (2026-08-01)
   -------------------------------------------------------------
   The first version of this faction shipped individually strong
   cards with no need for each other. Measured against the roster's
   damage budget it was indefensible: Ma'at was 1.27 ATK% per 10
   Energy and Sekhmet 1.20, against 0.80 for Qin Shi Huang (the
   strongest Caster in the game at 61.8%) and 0.55 for Amaterasu.
   Ma'at's "85% against anyone above 60% HP" was the worst offender
   - early in a fight EVERY enemy is above 60%, so the conditional
   was simply a bigger base number that quietly switched off as the
   game went on. Every damage figure below is now inside the band
   set by existing cards, and the conditionals reward setup the
   opponent can play around instead of firing automatically.

   Cross-faction lines
   -------------------------------------------------------------
     - Anubis's execute is the guaranteed kill Roma's Triumph engine
       (Caesar, Constantine, Brutus, Augustus) could never manufacture.
     - Ma'at's Exposed feeds Camelot (Lancelot) and Grimmwood
       (Red Riding Hood) ally-struck triggers.
     - Sekhmet's anti-heal is the roster's only real answer to the
       healing meta; Rumpelstiltskin was previously the sole source.
     - Amaterasu's Burn turns Sekhmet's rider on for free.
     - Isis reviving after Spartacus/Mulan's ally-death payouts have
       already fired is a genuine two-for-one.
   ============================================================= */
window.EOL.registerFaction({
  id: 'duat',
  name: 'Duat',
  icon: 'ra-ankh',
  tagline: 'The scales do not blink.',
  colors: { primary: '#c9a227', secondary: '#1f4e79', glow: '#ffe08a' },
  cards: [
    {
      id: 'duat-anubis',
      name: 'Anubis',
      rarity: 'legendary',
      role: 'Sniper',
      element: 'Shadow',
      stats: { hp: 4530, atk: 1955, def: 10 },
      icon: 'ra-bird-mask',
      art: 'assets/heroes/duat-anubis.png',
      ability: {
        type: 'Active',
        name: 'Weighing of the Heart',
        cost: 45,
        /* 130% base is BELOW the Sniper band floor (145%) on purpose -
           Anubis is a bad attacker and a superb executioner. The execute
           at 260% sits under Guy of Gisborne's 280% at the same cost, so
           even the payoff is not the biggest number in the game; what it
           buys is CERTAINTY, and certainty is what Roma's kill-engine
           and Duat's own chain are paying for.
           The extended 35% threshold is the faction's internal combo
           gate: it needs 2+ debuffs, which is exactly what Ma'at and
           Sekhmet manufacture and what Anubis cannot produce himself. */
        text: 'Deal <b>130% ATK Shadow Damage</b>. If the target is below <b>25% HP</b>, instead deal <b>260% ATK</b> and refund <b>10 Energy</b>. Against a target carrying <b>2 or more debuffs</b> the threshold rises to <b>35% HP</b>.',
        note: 'The refund only triggers on the execute.',
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            {
              k: 'branch',
              cond: { targetHpBelow: 0.25 },
              then: [
                { k: 'dmg', power: 2.6, element: 'Shadow' },
                { k: 'gainEnergy', amt: 10 },
              ],
              other: [
                {
                  k: 'branch',
                  cond: { targetHpBelow: 0.35, debuffCountAtLeast: 2 },
                  then: [
                    { k: 'dmg', power: 2.6, element: 'Shadow' },
                    { k: 'gainEnergy', amt: 10 },
                  ],
                  other: [{ k: 'dmg', power: 1.3, element: 'Shadow' }],
                },
              ],
            },
          ],
        },
      },
    },

    {
      id: 'duat-horus',
      name: 'Horus',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Light',
      stats: { hp: 4420, atk: 1900, def: 12 },
      icon: 'ra-bird-claw',
      art: 'assets/heroes/duat-horus.png',
      ability: {
        type: 'Active',
        name: 'Eye That Does Not Close',
        cost: 40,
        /* 165% at 40 EN = 0.41 ATK%/10EN, mid-pack for a Sniper. Horus
           does NOT own the Provoke pierce - every Sniper signature has had
           it since the protection pass. What he owns is the tax waiver,
           and a rider that only pays when he actually shoots past a
           wall, so his value tracks how much protection the enemy is
           running rather than being flat. */
        text: 'Deal <b>165% ATK Light Damage</b> at full power even when striking past a <b>Provoke</b>. If the target is in the back row or is <b>Provoking</b>, apply <b>Exposed</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any', noPierceTax: true },
          effects: [
            { k: 'dmg', power: 1.65, element: 'Light' },
            { k: 'exposed', turns: 2, if: { targetBackRow: true } },
            { k: 'exposed', turns: 2, if: { targetTaunting: true } },
          ],
        },
      },
    },

    {
      id: 'duat-maat',
      name: "Ma'at",
      rarity: 'rare',
      role: 'Caster',
      element: 'Light',
      stats: { hp: 4740, atk: 1880, def: 15 },
      icon: 'ra-radial-balance',
      art: 'assets/heroes/duat-maat.png',
      ability: {
        type: 'Active',
        name: 'Feather Against the Heart',
        cost: 40,
        /* 50% x 6 = 300% total at 40 EN = 0.75 ATK%/10EN, just under Qin
           Shi Huang's 0.80. FLAT damage, deliberately: the previous
           "85% against anyone above 60% HP" was a bigger base in
           disguise, because early in a fight nothing is below 60%.
           Her real output is the Exposed, which is worth more to the
           team than to her - it is the weighing step, and it feeds
           every damage dealer on the board, not just Duat's. */
        text: 'Deal <b>50% ATK Light Damage</b> to all enemies, then weigh the <b>3 highest HP</b> enemies - they suffer <b>Exposed</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.5, element: 'Light' },
            { k: 'exposed', turns: 2, to: 'enemies', take: { n: 3, by: 'highestHp' } },
          ],
        },
      },
    },

    {
      id: 'duat-sekhmet',
      name: 'Sekhmet',
      rarity: 'epic',
      role: 'Caster',
      element: 'Fire',
      stats: { hp: 4740, atk: 1905, def: 15 },
      icon: 'ra-lion',
      art: 'assets/heroes/duat-sekhmet.png',
      ability: {
        type: 'Active',
        name: 'Breath of Pestilence',
        cost: 50,
        /* 50% base, 65% into a Burning target: 390% worst case at 50 EN
           = 0.78 ATK%/10EN, in line with Qin Shi Huang. Was 540% at
           45 EN (1.20) - indefensible.
           She applies her OWN Burn to the two lowest-HP enemies, which
           is the internal chain: Burn ticks push exactly those targets
           under Anubis's execute line while the anti-heal stops them
           climbing back out. Amaterasu's Burn switches the rider on for
           free, which is the cross-faction version of the same line. */
        text: 'Deal <b>50% ATK Fire Damage</b> to all enemies and reduce their <b>healing received by 30%</b> for 2 rounds. <b>Burning</b> enemies take an extra <b>15% ATK</b> instead. Then apply <b>Burn</b> for 1 round to the <b>2 lowest HP</b> enemies.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.5, element: 'Fire' },
            { k: 'dmg', power: 0.15, element: 'Fire', if: { targetBurning: true } },
            /* negative = reduced healing (healUnit does mod += pct/100);
               a positive 30 here used to BOOST enemy healing to 130%
               while the card promises a 30% reduction */
            { k: 'healMod', pct: -30, turns: 2 },
            { k: 'burn', turns: 1, to: 'enemies', take: { n: 2, by: 'lowestHp' } },
          ],
        },
      },
    },

    {
      id: 'duat-isis',
      name: 'Isis',
      rarity: 'epic',
      role: 'Medic',
      element: 'Magic',
      stats: { hp: 4900, atk: 1080, def: 20 },
      icon: 'ra-feathered-wing',
      art: 'assets/heroes/duat-isis.png',
      ability: {
        type: 'Active',
        name: 'Gathering of Osiris',
        cost: 55,
        /* Losing a hero costs ACTIONS, not just HP - turns alternate, so
           a 5v6 side outputs ~83% and takes ~120%. Buying an action back
           is worth far more than the HP restored, which is why this is
           55 EN and once per battle. Returned at 40% with a 12% shield
           (was 45%/15%): enough to act, not enough to be a second life.
           The no-deaths fallback keeps it from being a dead card in a
           game you are winning. */
        text: 'Restore your most recently fallen ally to <b>40% Max HP</b> behind a <b>12% Max HP Shield</b>. If no ally has fallen, instead heal all allies for <b>16% Max HP</b> and cleanse 1 debuff from each.',
        note: 'Once per battle.',
        oncePerBattle: true,
        spec: {
          target: { side: 'self' },
          effects: [
            {
              k: 'branch',
              cond: { anyAllyFallen: true },
              then: [
                /* the shield is a rider ON the revive: reviving flips the
                   hero back to alive, so a separate shield effect aimed at
                   `lastFallenAlly` would find nobody left to shield. */
                { k: 'revive', pctMaxHp: 40, shieldPctMaxHp: 12, to: 'lastFallenAlly' },
              ],
              other: [
                { k: 'heal', pctMaxHp: 16, to: 'allies' },
                { k: 'cleanse', n: 1, to: 'allies' },
              ],
            },
          ],
        },
      },
    },

    {
      id: 'duat-nephthys',
      name: 'Nephthys',
      rarity: 'common',
      role: 'Medic',
      element: 'Shadow',
      stats: { hp: 4800, atk: 1020, def: 21 },
      icon: 'ra-angel-wings',
      art: 'assets/heroes/duat-nephthys.png',
      ability: {
        type: 'Active',
        name: "Mourner's Veil",
        cost: 30,
        /* The PREVENTIVE medic - every other healer repairs damage after
           it lands, Nephthys stops it landing. 22% for 2 rounds (was
           30%): stacked with a Tank's own DEF that was closing on
           immunity for the focus target. Auto-targets the lowest-HP
           ally so she answers focus fire without the player reading the
           board, which is what makes her a legible common. */
        text: 'The lowest HP ally takes <b>22% reduced damage</b> for 2 rounds and heals <b>16% Max HP</b>. While they are below <b>50% HP</b> they also gain <b>12% DEF</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'auto', auto: 'lowestHp' },
          effects: [
            { k: 'damageResist', pct: 22, turns: 2 },
            { k: 'heal', pctMaxHp: 16, overflow: 'shield' },
            { k: 'stat', stat: 'def', amt: 12, turns: 2, if: { targetHpBelow: 0.5 } },
          ],
        },
      },
    },
  ],
});
