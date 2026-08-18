/* Faction: Genesis - the announced verdict
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT

   Judgement that arrives on a schedule. Genesis's damage is mostly
   DELAYED: it is declared now, the enemy can see it coming, and it
   lands in two rounds. That is the whole identity, and it is built
   entirely on `delayed`, the effect kind Zeus and Abe no Seimei
   already use - no new mechanic, no new status, and nothing called a
   "keyword" in the card text.

   The word "Judgement" appears nowhere in the rules text for exactly
   that reason. An earlier draft called it a keyword; it is not one.
   It is a themed use of delayed effects.

   THE INTERNAL SHAPE - the only faction with its own clock
   -------------------------------------------------------------
     Azrael    the payload: 240% in two rounds, the largest delayed
               hit in the game
     Lucifer   the same idea board-wide, at a self-inflicted cost
     Gabriel   the accelerator - pulls every pending effect one round
               closer, which is what turns Azrael from telegraphed
               into lethal
     Raphael   the COUNTERPLAY, and it works on both sides of the
               table: he cancels a pending effect on an ally
     Uriel     Burn, which stacks with waiting - a target that must
               survive two rounds is a target that must survive Burn
     Michael   the only immediate damage, so the faction is not
               helpless in the round it casts
     Metatron  Silence, to stop the answer arriving before the verdict

   Gabriel + Azrael is the intended two-card line, and Raphael is the
   reason it is fair: a Raphael on the other side of the table undoes
   the whole plan for 40 Energy.

   LUCIFER IS THE BRIDGE CARD
   -------------------------------------------------------------
   Mechanically Genesis (a delayed sweep), but his cost is a Pandemonium
   Sin: he pays HP to cast. He is the single best Pandemonium partner in
   the game, which is the hand-off pattern the guidelines ask for -
   the Morning Star is an archangel on the wrong side of a war, not a
   separate species.

   CROSS-FACTION
   -------------------------------------------------------------
     - Gabriel accelerates ANY pending effect, including Zeus's
       thunderbolt and Abe no Seimei's shikigami.
     - Raphael cancels enemy delayed damage, the only card that does.
     - Metatron's 2-round Silence is the longest in the game and
       protects a slow line the way Cicero protects a fast one.
   ============================================================= */
window.EOL.registerFaction({
  id: 'genesis',
  name: 'Genesis',
  icon: 'ra-aware',
  tagline: 'The sentence was passed before you arrived.',
  colors: { primary: '#f2e6c2', secondary: '#c9a227', glow: '#fff8dc' },
  cards: [
    {
      id: 'genesis-lucifer',
      name: 'Lucifer',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Fire',
      stats: { hp: 4900, atk: 2020, def: 16 },
      ability: {
        type: 'Active',
        name: 'The Morning Star',
        cost: 60,
        /* CUT HARD. The first draft was 200% to ALL enemies, delayed -
           budget 1.00, above Zeus, on a card that also took no real
           cost. At 70% it audits at 0.70: a genuine board-wide threat
           that is still smaller than Zeus's marked payoff, which is
           correct, because Zeus needs marks and Lucifer needs only
           patience.

           THE FALL IS THE COST, and it is a Pandemonium Sin wearing
           Genesis colours - he refuses aid for two rounds, exactly as
           Pride does. That is deliberate: Lucifer is the hand-off
           between the two factions, and sharing a cost is a cleaner
           bridge than sharing a keyword. */
        text: 'Pronounce the fall: in <b>2 rounds</b>, deal <b>70% ATK Fire Damage</b> to all enemies. Lucifer <b>cannot be healed</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'delayed',
              turns: 2,
              effects: [{ k: 'dmg', power: 0.7, element: 'Fire' }],
            },
            /* The fall, as a cost the engine actually models. A Max HP
               CUT is not an effect kind - `stat: 'hp'` is a percentage
               buff, not a ceiling change - and adding one for a single
               card would touch every HP-ratio read in the engine
               (thresholds, executes, Goldilocks' window). Refusing aid
               is the same idea in existing parts, and it is literally
               Pride's Sin, which is the point: Lucifer is the bridge
               card between the two factions. */
            { k: 'healMod', pct: -100, turns: 2, to: 'self' },
          ],
        },
      },
      icon: 'ra-falling',
      art: 'assets/legends/genesis-lucifer.png',
    },

    {
      id: 'genesis-michael',
      name: 'Michael',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Light',
      stats: { hp: 6200, atk: 1700, def: 24 },
      ability: {
        type: 'Active',
        name: 'The Flaming Sword',
        cost: 45,
        /* THE FACTION'S FLOOR. Six cards that pay off later need one
           that pays off now, or the whole draft loses to tempo. The
           execute threshold is low (25%) so he is a finisher rather
           than a second Anubis. Capped at 200% - the Bruiser ceiling -
           after the audit flagged 235%: execute bonuses are exactly
           where role guides get quietly broken, because the number only
           shows up in the branch. */
        text: 'Deal <b>170% ATK Light Damage</b>, increased to <b>200% ATK</b> against a target below <b>25% HP</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            {
              k: 'branch',
              cond: { targetHpBelow: 0.25 },
              then: [{ k: 'dmg', power: 2.0, element: 'Light' }],
              other: [{ k: 'dmg', power: 1.7, element: 'Light' }],
            },
          ],
        },
      },
      icon: 'ra-relic-blade',
      art: 'assets/legends/genesis-michael.png',
    },

    {
      id: 'genesis-azrael',
      name: 'Azrael',
      rarity: 'epic',
      role: 'Sniper',
      element: 'Shadow',
      stats: { hp: 4520, atk: 1950, def: 12 },
      ability: {
        type: 'Active',
        name: 'The Appointed Hour',
        cost: 50,
        /* The largest delayed single hit in the game, and it is fair
           precisely because it is announced: two full rounds for the
           opponent to kill him, cleanse it, Raphael it away, or simply
           kill the target first and waste it. 240% is under Anubis's
           260% execute even though it is unconditional, because
           unconditional-but-telegraphed and conditional-but-instant are
           different kinds of reliable. */
        text: 'Name the hour: in <b>2 rounds</b>, deal <b>240% ATK Shadow Damage</b> to one enemy.',
        note: 'The hour comes even if Azrael has fallen.',
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            {
              k: 'delayed',
              turns: 2,
              effects: [{ k: 'dmg', power: 2.4, element: 'Shadow' }],
            },
          ],
        },
      },
      icon: 'ra-scythe',
      art: 'assets/legends/genesis-azrael.png',
    },

    {
      id: 'genesis-gabriel',
      name: 'Gabriel',
      rarity: 'epic',
      role: 'Caster',
      element: 'Light',
      stats: { hp: 4820, atk: 1870, def: 17 },
      ability: {
        type: 'Active',
        name: 'The Annunciation',
        cost: 35,
        /* THE COMBO PIECE. Zero damage of his own; he makes everyone
           else's arrive sooner. `hastenDelayed` is a new effect kind but
           NOT a new mechanic - it reaches into the existing B.deferred
           queue and decrements armAt, the same structure Zeus already
           writes to. Works on any faction's pending effects, which is
           the cross-faction hand-off the guidelines want. */
        text: 'Announce what is coming: every <b>pending effect</b> on the battlefield resolves <b>1 round sooner</b>, and all allies gain <b>10% ATK</b> for 2 rounds.',
        note: 'Affects both sides.',
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'hastenDelayed', turns: 1 },
            /* The upgradeable magnitude. Also the right rider: the
               annunciation is encouragement, and it makes Gabriel a
               card you cast even with nothing pending. */
            { k: 'stat', stat: 'atk', amt: 10, turns: 2, to: 'allies' },
          ],
        },
      },
      icon: 'ra-ocarina',
      art: 'assets/legends/genesis-gabriel.png',
    },

    {
      id: 'genesis-adam',
      name: 'Adam',
      rarity: 'epic',
      role: 'Tank',
      element: 'Nature',
      stats: { hp: 7450, atk: 1000, def: 30 },
      ability: {
        type: 'Active',
        name: 'The Dust He Was Made From',
        cost: 50,
        /* WHY ADAM, AND WHY A TANK
           -------------------------------------------------------------
           Added 2026-08-18 with the Empyrean -> Genesis rebrand. The
           rename is what makes him obvious: "Empyrean" is the highest
           heaven and admits only angels, but GENESIS is the book, and
           the book's first man belongs in it more than any archangel
           does.

           He fills the faction's only structural hole. Genesis shipped
           with three Casters, one Bruiser, one Sniper, one Medic, one
           Controller and NO TANK - so a mono-Genesis draft had nothing
           to stand in front, which is a real problem for a faction whose
           whole plan is surviving two rounds while a delayed hit cooks.

           THE KIT IS THE FACTION'S CLOCK, POINTED AT HIMSELF.
           Every other Genesis card schedules damage for the ENEMY. Adam
           schedules it for himself and gets paid to survive it: he takes
           the sentence now, and if he is still standing when it lands,
           the whole team is healed. That is the Fall as a mechanic -
           the penalty is real, it arrives on a timer, and outliving it
           is the entire point of the species.

           WHY IT IS NOT JUST A SHIELD. A Tank that presses a button and
           gets tougher is the most crowded design in the roster (see
           Sloth, Heimdall, Frankenstein's Monster, Durga). Adam instead
           makes a BET with a visible clock on it, and the enemy can
           interact with the bet: kill him inside two rounds and the heal
           never happens, and they have spent the two rounds hitting a
           7450 HP wall to do it - which is exactly what a Tank wants.

           WHY THE COST IS "CANNOT BE HEALED" AND NOT A CHUNK OF HP:
           the engine has no self-damage-by-percentage effect, and adding
           one for a single card is how a vocabulary rots. healMod -100 is
           already the roster's way of saying "this power is borrowed" -
           Pride pays it, Lucifer pays it - and on a TANK it bites harder
           than on either of them, because the Tank is the card the Medic
           was going to spend the turn on.

           CROSS-FACTION, and this is the good part: Gabriel HASTENS
           pending effects, so he pulls Adam's payout a round closer.
           Raphael CANCELS a pending effect on an ally - so a Raphael on
           your own side can wipe Adam's debt before it resolves, which
           costs you the heal. The faction's two support pieces both
           already read this card and neither needed changing. */
        text: 'Provoke for 2 rounds and gain <b>20% DEF</b>. Adam <b>cannot be healed</b> for 2 rounds; when they end, if he is still standing, all allies are healed for <b>18% Max HP</b>.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'taunt', turns: 2, to: 'self' },
            { k: 'stat', stat: 'def', amt: 20, turns: 2, to: 'self' },
            /* THE COST. `healMod: -100` is how Pandemonium's Pride and
               Genesis's own Lucifer already pay for a big effect: for two
               rounds Adam cannot be healed at all. It is a real cost the
               OPPONENT can press (focus him while the Medic cannot answer)
               and it needs no new engine support.

               An earlier draft of this card spent a flat slice of Max HP
               instead. That effect does not exist - no card in the roster
               pays HP, and `dmg` has no self-percentage form - so it would
               have been a silent no-op printed on the card. Rejected in
               favour of the vocabulary that is actually implemented. */
            { k: 'healMod', pct: -100, turns: 2, to: 'self' },
            {
              k: 'delayed',
              turns: 2,
              tag: 'genesis-adam',
              to: 'self',
              effects: [{ k: 'heal', pctMaxHp: 18, to: 'allies' }],
            },
          ],
        },
      },
      icon: 'ra-acorn',
      art: 'assets/legends/genesis-adam.png',
    },
    {
      id: 'genesis-raphael',
      name: 'Raphael',
      rarity: 'rare',
      role: 'Medic',
      element: 'Nature',
      stats: { hp: 4750, atk: 1010, def: 20 },
      ability: {
        type: 'Active',
        name: 'The Healing of Tobit',
        cost: 40,
        /* THE COUNTERPLAY, and the card that keeps the faction honest.
           Every delayed effect in the game becomes answerable, including
           Azrael's and Lucifer's - so an Genesis mirror is a genuine
           duel rather than a race. 28% single-target heal sits between
           Guinevere's 22% and Izanagi's 30%. */
        text: 'Heal one ally for <b>28% Max HP</b>, cleanse <b>all</b> of their debuffs, and cancel any <b>pending effect</b> aimed at them.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [
            { k: 'heal', pctMaxHp: 28, to: 'targets' },
            { k: 'cleanse', n: 99, to: 'targets' },
            { k: 'cancelDelayed', to: 'targets' },
          ],
        },
      },
      icon: 'ra-medical-pack',
      art: 'assets/legends/genesis-raphael.png',
    },

    {
      id: 'genesis-uriel',
      name: 'Uriel',
      rarity: 'rare',
      role: 'Caster',
      element: 'Fire',
      stats: { hp: 4760, atk: 1880, def: 15 },
      ability: {
        type: 'Active',
        name: 'The Flame of Eden',
        cost: 40,
        /* Burn is the natural partner for a faction that asks the enemy
           to survive two more rounds: it punishes the waiting rather
           than the moment. Two targets keeps the budget honest (0.30)
           and leaves the wide sweeps to Pride and Lucifer. */
        text: 'Deal <b>60% ATK Fire Damage</b> to <b>2</b> enemies and <b>Burn</b> them for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.6, element: 'Fire' },
            { k: 'burn', turns: 2, to: 'targets' },
          ],
        },
      },
      icon: 'ra-fire-shield',
      art: 'assets/legends/genesis-uriel.png',
    },

    {
      id: 'genesis-metatron',
      name: 'Metatron',
      rarity: 'rare',
      role: 'Controller',
      element: 'Magic',
      stats: { hp: 5300, atk: 1280, def: 18 },
      ability: {
        type: 'Active',
        name: 'The Scribe of Heaven',
        cost: 40,
        /* The ONLY Silence in this release - the first pass had three
           across three factions, which is why Odysseus and Loki were
           rewritten. Distinct from the shipped two: Cicero silences for
           1 round with damage attached, Tsukuyomi silences two targets
           for 1 round. Metatron is the long one: 2 rounds, no damage,
           which is what protects a delayed line from being answered. */
        text: '<b>Silence</b> one enemy for <b>2 rounds</b> and reduce their <b>ATK by 12%</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            { k: 'silence', turns: 2, to: 'targets' },
            { k: 'stat', stat: 'atk', amt: -12, turns: 2, to: 'targets' },
          ],
        },
      },
      icon: 'ra-quill-ink',
      art: 'assets/legends/genesis-metatron.png',
    },
  ],
});
