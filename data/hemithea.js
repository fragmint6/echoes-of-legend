/* Faction: Hemithea - Ascension (the mortals who earn their myth)
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT

   Olympus is gods. Hemithea is the people the gods bet on. Every card
   here starts as an ordinary body and becomes something else exactly
   once, when a condition the FIGHT produces is met - not a timer, not
   a resource, not a choice.

   ASCENSION IS NOT A TRANSFORMATION SYSTEM. There is no second card,
   no alternate art, no swapped skill and nothing new to serialize. It
   is a one-shot Passive built from `stackTag` + `maxStacks: 1`, which
   the engine has had since Red Riding Hood. The owner's concern -
   "I don't wanna have two versions of one card" - is the reason it is
   built this way: an Ascended Achilles is the same card with a bigger
   ATK number, exactly like Caesar after a kill.

   THE INTERNAL SHAPE
   -------------------------------------------------------------
   Four Passives that fire once, three Actives that are useful while
   you wait. The Passives are deliberately spread across DIFFERENT
   triggers so no two read the same event:

     Achilles   first time HE drops below 50%      (selfDamaged)
     Ajax       a standing aura while ABOVE 50%    (static)
     Perseus    first time he defeats an enemy     (selfKilled)
     Medea      first time an ALLY is defeated     (allyDied)

   Achilles and Ajax deliberately sit on opposite sides of the same
   HP line: the fight that turns Achilles on turns Ajax off. Drafting
   both is a real tension rather than a stack.

   CROSS-FACTION - THE PARTNER-HUNGRY FACTION
   -------------------------------------------------------------
   Ascension conditions are satisfied by OTHER factions' normal play,
   which is the whole point:
     - Roma's kill engine turns Perseus on early.
     - Kami and Asgard produce the ally death Medea needs.
     - Any Grimmwood debuff or Camelot Exposed makes Atalanta's
       above-70% window easier to hit before the enemy heals.
   ============================================================= */
window.EOL.registerFaction({
  id: 'hemithea',
  name: 'Hemithea',
  icon: 'ra-podium',
  tagline: 'Mortals, and worth more for it.',
  colors: { primary: '#d8b26a', secondary: '#8c3b2e', glow: '#ffe6a8' },
  cards: [
    {
      id: 'hemithea-achilles',
      name: 'Achilles',
      rarity: 'legendary',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6300, atk: 1740, def: 23 },
      ability: {
        type: 'Passive',
        name: 'Rage of Peleus Son',
        cost: null,
        /* The legendary of the faction is a PASSIVE with no cast, which
           is unusual and deliberate: his whole design is that the enemy
           decides when he turns on. Hitting him is how you lose to him,
           and refusing to hit him leaves a 1,740 ATK Bruiser alone.

           +20%, not the +50% first drafted. A permanent, unconditional,
           free ATK buff on a Bruiser body compounds with every other
           damage source in the deck; at 50% it made every other Bruiser
           in the game pointless. */
        text: 'The first time Achilles drops below <b>50% HP</b>, he gains <b>20% ATK</b> for the rest of the battle.',
        note: 'Once per battle.',
        passive: {
          trigger: 'wasAttacked',
          effects: [
            {
              k: 'stat',
              stat: 'atk',
              amt: 20,
              turns: 99,
              to: 'self',
              /* `selfHpBelow` reads the OWNER, not the attacker - the
                 distinction that made this need a new condition. */
              if: { selfHpBelow: 0.5 },
              stackTag: 'peleus-rage',
              maxStacks: 1,
            },
          ],
        },
      },
      icon: 'ra-spear-head',
      art: 'assets/legends/hemithea-achilles.png',
    },

    {
      id: 'hemithea-odysseus',
      name: 'Odysseus',
      rarity: 'epic',
      role: 'Controller',
      element: 'Physical',
      stats: { hp: 5500, atk: 1380, def: 19 },
      ability: {
        type: 'Active',
        name: 'Man of Twists and Turns',
        cost: 35,
        /* REWRITTEN. The first draft was "Silence 1 for 1 round, drain
           Energy" - the exact effect signature of Asgard's Loki, and
           the collision the owner spotted. It was also the fourth
           energy-drain and the third Silence in a single release.

           Exposing THEN hitting is unoccupied space: no shipped card
           sets up its own strike that way. It reads as cunning (going
           around the wall rather than through it), and the Energy refund
           is conditional on the kill rather than stolen from the enemy -
           a different economy from Greed's.

           105%, not the 140% first written: the audit flagged it against
           the Controller guide (60-110%), and the rule exists for a
           reason - a Controller whose damage reaches Sniper range stops
           being a Controller. The Exposed rider is the payload; the
           damage is the delivery. */
        text: '<b>Expose</b> one enemy for 1 round, then deal <b>105% ATK Physical Damage</b>. If this defeats the target, gain <b>15 Energy</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            /* Exposed FIRST, so his own hit lands against 0% DEF - the
               engine applies effects in order. "Ignoring DEF" is not an
               engine concept; Exposed is exactly that, already exists,
               and leaves the opening for an ally to follow up into. */
            { k: 'exposed', turns: 1, to: 'targets' },
            { k: 'dmg', power: 1.05, element: 'Physical' },
            { k: 'gainEnergy', amt: 15, if: { killedTarget: true } },
          ],
        },
      },
      icon: 'ra-fast-ship',
      art: 'assets/legends/hemithea-odysseus.png',
    },

    {
      id: 'hemithea-perseus',
      name: 'Perseus',
      rarity: 'epic',
      role: 'Sniper',
      element: 'Light',
      stats: { hp: 4500, atk: 1900, def: 13 },
      ability: {
        type: 'Passive',
        name: 'The Gorgons Head',
        cost: null,
        /* Turns the whole TEAM's damage up by making the target easier
           for everyone, rather than by making Perseus hit harder. That
           is why it is worth drafting next to Duat (Anubis executes the
           Exposed) and Camelot rather than being a solo statline. */
        /* SIMPLIFIED. The first draft gated an `onHit` rider behind a
           stackTag set by a different trigger - two coupled mechanisms
           for one card, and `requires` is not an engine field. A single
           once-per-battle Crit gain on the kill says the same thing
           (killing makes him deadlier) with one moving part. */
        text: 'The first time Perseus defeats an enemy, he gains <b>15% Crit Chance</b> for the rest of the battle.',
        note: 'Once per battle.',
        passive: {
          trigger: 'selfKilled',
          effects: [
            {
              k: 'stat',
              stat: 'crit',
              amt: 15,
              turns: 99,
              to: 'self',
              stackTag: 'gorgon-head',
              maxStacks: 1,
            },
          ],
        },
      },
      icon: 'ra-monster-skull',
      art: 'assets/legends/hemithea-perseus.png',
    },

    {
      id: 'hemithea-medea',
      name: 'Medea',
      rarity: 'epic',
      role: 'Medic',
      element: 'Shadow',
      stats: { hp: 4800, atk: 1050, def: 20 },
      ability: {
        type: 'Passive',
        name: 'Cauldron of Youth',
        cost: null,
        /* Differentiated from Isis (Duat), the other revive in the
           game, on every axis that matters: Medea is a PASSIVE (fires
           without spending an action), AUTOMATIC (no choice of who),
           and once per battle. Isis is an active 35% + Shield the
           player aims. Same idea, different card.

           BUFFED 2026-08-19 (owner): 30% -> 65%. At 30% the legend she
           raised usually died to the next basic attack, which made the
           whole signature feel like a stall rather than a resurrection;
           65% is a second life that changes the fight, and it stays
           under Isis's aimed 35% + Shield total value because it is
           automatic and cannot choose its target. */
        text: 'The first time an ally is defeated, Medea immediately restores them to <b>65% Max HP</b>.',
        note: 'Once per battle.',
        passive: {
          trigger: 'allyDied',
          effects: [
            {
              k: 'revive',
              pctMaxHp: 65,
              /* `lastFallenAlly` is the same resolver Isis uses: the
                 allyDied trigger fires with the corpse already flagged
                 dead, so an ordinary 'allies' target would skip them. */
              to: 'lastFallenAlly',
              wipe: true,
              /* `maxStacks: 1` is the whole once-per-battle contract.
                 The engine's revive case reads it off the REVIVER's
                 stackTotals, so a second ally death finds the cauldron
                 spent - enforced at runtime by
                 sim/verify_chapter2_skills.js. */
              stackTag: 'cauldron-of-youth',
              maxStacks: 1,
            },
          ],
        },
      },
      icon: 'ra-bubbling-potion',
      art: 'assets/legends/hemithea-medea.png',
    },

    {
      id: 'hemithea-atalanta',
      name: 'Atalanta',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Nature',
      stats: { hp: 4400, atk: 1820, def: 12 },
      ability: {
        type: 'Active',
        name: 'First to the Boar',
        cost: 40,
        /* REBUILT. The first draft was a Nature Sniper with an HP-window
           damage branch, which the audit correctly identified as
           Goldilocks wearing a different name - same role, same element,
           same effect signature. Being "above 70%" instead of "between
           30 and 70" is not a different card.

           The huntress who draws first blood is now about ORDER, not
           thresholds: she hits the enemy who has not been touched yet,
           and is rewarded for opening on a fresh target. `targetDamagedBefore`
           already exists (it stops multi-hit skills triggering off their
           own first hit); inverted here it means "nobody has hurt this
           one yet", which no shipped card asks. */
        text: 'Deal <b>165% ATK Nature Damage</b>. If the target is at <b>full HP</b>, deal <b>195% ATK</b> instead and gain <b>10% Crit Chance</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            {
              k: 'branch',
              cond: { targetHpAbove: 0.99 },
              then: [
                { k: 'dmg', power: 1.95, element: 'Nature' },
                { k: 'stat', stat: 'crit', amt: 10, turns: 2, to: 'self' },
              ],
              other: [{ k: 'dmg', power: 1.65, element: 'Nature' }],
            },
          ],
        },
      },
      icon: 'ra-barbed-arrow',
      art: 'assets/legends/hemithea-atalanta.png',
    },

    {
      id: 'hemithea-ajax',
      name: 'Ajax',
      rarity: 'rare',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7400, atk: 1000, def: 31 },
      ability: {
        type: 'Passive',
        name: 'The Sevenfold Shield',
        cost: null,
        /* Deliberately the MIRROR of Achilles: an aura that is on while
           healthy and switches off under pressure, where Achilles is off
           while healthy and switches on. Drafting both means the team's
           damage reduction fades exactly as its damage climbs - a real
           trade rather than two buffs. */
        text: 'While Ajax is above <b>50% HP</b>, all allies take <b>10% less damage</b>.',
        note: null,
        passive: {
          trigger: 'static',
          teamWide: true,
          effects: [{ k: 'damageMult', mult: 0.9, when: { selfHpAbove: 0.5 } }],
        },
      },
      icon: 'ra-zebra-shield',
      art: 'assets/legends/hemithea-ajax.png',
    },

    {
      id: 'hemithea-hercules',
      name: 'Hercules',
      rarity: 'epic',
      role: 'Tank',
      element: 'Physical',
      stats: { hp: 7210, atk: 1030, def: 30 },
      ability: {
        type: 'Active',
        /* MOVED FROM OLYMPUS 2026-08-18 (owner ruling). Hercules is a
           mortal who earned his place among gods, which is the literal
           thesis of this faction - "the people the gods bet on". He sat
           in Olympus for the obvious reason (Greek) rather than the
           right one (divine), and his kit never touched a Mark, so
           Olympus lost nothing mechanical when he left; see Poseidon in
           data/olympus.js for the replacement and the reasoning.

           THE CARD IS UNCHANGED - same id suffix, same stats, same
           ability, same art file (renamed). Only the faction prefix
           moved. This is deliberate: re-tuning him in the same commit
           as the move would make any later balance regression
           impossible to attribute to one or the other.

           WHAT DOES CHANGE IS HIS COMPANY. In Olympus he was the only
           Tank. Here he is the SECOND Tank beside Ajax, and the two
           read as opposites rather than duplicates: Ajax is a passive
           aura that is on while he is healthy (above 50%), Hercules is
           an active that he spends a turn arming. A Hemithea draft can
           now run a real front line, which the faction wanted - every
           other card here is a mortal who needs time to ascend, and
           time is what a wall buys. */
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
      art: 'assets/legends/hemithea-hercules.png',
    },
    {
      id: 'hemithea-jason',
      name: 'Jason',
      rarity: 'rare',
      role: 'Medic',
      element: 'Nature',
      stats: { hp: 4700, atk: 990, def: 19 },
      ability: {
        type: 'Active',
        name: 'The Argos Captain',
        cost: 40,
        /* The Argonauts are a CREW - the heal is worth more the more of
           them are still standing, which makes Jason a proactive
           round-two cast rather than an emergency button, and makes him
           worse (correctly) in exactly the spot where Freyja and Medea
           are better. Capped at 26% so a full board does not out-heal
           Izanagi's 30% single-target. */
        /* `perLivingAlly` was invented; rather than add a fifth scaling
           term to the heal case for one card, Jason is differentiated by
           SHAPE instead of by a scalar: he is the only team heal in the
           game that also hands out Energy, which is what a captain does -
           he gets the crew moving. Distinct from Ganesha (cleanse+Energy,
           no heal) and from Vishnu (heal+cleanse, no Energy). */
        text: 'Heal all allies for <b>20% Max HP</b> and grant your team <b>10 Energy</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all', row: 'any' },
          effects: [
            { k: 'heal', pctMaxHp: 20, to: 'targets' },
            { k: 'gainEnergy', amt: 10 },
          ],
        },
      },
      icon: 'ra-ocean-emblem',
      art: 'assets/legends/hemithea-jason.png',
    },
  ],
});
