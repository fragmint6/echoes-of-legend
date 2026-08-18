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
      art: 'assets/legends/olympus-zeus.png',
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
      art: 'assets/legends/olympus-athena.png',
    },
    {
      id: 'olympus-poseidon',
      name: 'Poseidon',
      rarity: 'epic',
      role: 'Tank',
      element: 'Magic',
      stats: { hp: 7300, atk: 1020, def: 31 },
      ability: {
        type: 'Active',
        name: 'Lord of the Shoreline',
        cost: 50,
        /* WHY POSEIDON EXISTS, AND WHY HE IS NOT HERCULES REPAINTED
           -------------------------------------------------------------
           Hercules moved to Hemithea (owner ruling 2026-08-18) because
           he is a mortal who earned his myth, which is that faction's
           entire thesis. Olympus lost its only Tank in the trade, so
           this card is not a like-for-like replacement - it is the wall
           Olympus should always have had.

           Hercules never touched a Mark. He was a generically good
           Tank who happened to live in the Mark faction: DEF up, ATK
           up, Provoke, shield on expiry. Drop him into Camelot and
           nothing about him reads wrong. That is a failure of faction
           legibility (guideline check 4), and it is why the swap is an
           improvement rather than a cost.

           Poseidon is a Tank whose PROTECTION IS A MARK. He provokes,
           and the enemies who are forced to come at him are marked for
           doing it. So the faction's payoff cards - Zeus at 130% on
           marked targets, Athena's 0.9 damage multiplier against marked
           attackers, Guan Yu's 120% counter into a marked attacker -
           all get fed by the act of tanking itself.

           THE COMBO IT CREATES (guideline check 1): Poseidon provokes
           on round one, which hands Zeus a board of pre-marked targets
           for round two. Before this card the Mark supply was Apollo
           (one target, highest ATK) and Zeus marking his own targets on
           cast. A Tank that marks the WHOLE enemy line while making
           them attack him is the missing setup half.

           WHY THE MARK IS ON PROVOKE AND NOT ON CAST: marking every
           enemy for free would be a Controller's job at a Tank's stat
           line. Tying it to Provoke means the enemy has agency - they
           are marked because they are being forced to attack, which is
           exactly the trade the guidelines ask for ("a cost the
           OPPONENT can press"). An enemy that kills Poseidon fast eats
           less of it.

           WHY `Magic` AND NOT `Physical`: Hercules was the roster's
           Physical Tank slot in Olympus, and Physical is the single
           most crowded element at 29 cards. The sea is not a fist.

           STATS: 7300/1020/31 sits inside the Tank band (HP 6860-7560,
           ATK 980-1080, DEF 28-31) and deliberately just above
           Hercules' 7210/1030/30 on the two defensive axes and just
           below on ATK - he is more wall and less brawler, which is
           what "Tanks trade damage for presence" asks for. */
        text: 'Provoke for 2 rounds and gain a <b>18% Max HP Shield</b>. While Poseidon is Provoking, every enemy that attacks him is <b>Marked</b>.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'taunt', turns: 2, to: 'self', markAttacker: true },
            { k: 'shield', pctMaxHp: 18, to: 'self' },
          ],
        },
      },
      icon: 'ra-harpoon-trident',
      art: 'assets/legends/olympus-poseidon.png',
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
      art: 'assets/legends/olympus-apollo.png',
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
        /* THE RETALIATION (2026-08-16). Medusa's kit was previously
           Exposed and nothing else - a single binary status with no
           magnitude anywhere in it, which made her the ONE legend an
           upgrade could not improve: her levels bought a stat and
           then stopped. Scaling the Exposed DURATION instead was
           rejected outright - a duration is a cliff, and 1 round
           becoming 2 would silently double the combo window that
           every Duat and Camelot payoff is tuned against.

           So the gaze now bites. 25% ATK Shadow is deliberately
           small: she is a Controller on a Controller statline, this
           fires at most once a round, and the debuff remains the
           reason to field her. It gives the card a number that a
           level can raise - 25% -> 31% at max - without touching
           what she is for. */
        text: 'When Medusa is attacked, the attacker is <b>Exposed</b> for 1 round and takes <b>25% ATK Shadow Damage</b> (first attack each round).',
        note: null,
        passive: {
          trigger: 'wasAttacked',
          firstPerRound: true,
          effects: [
            { k: 'exposed', turns: 1, to: 'targets' },
            { k: 'dmg', power: 0.25, element: 'Shadow' },
          ],
        },
      },
      icon: 'ra-snake',
      art: 'assets/legends/olympus-medusa.png',
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
      art: 'assets/legends/olympus-ares.png',
    },
  ],
});
