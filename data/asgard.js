/* Faction: Asgard - Ragnarok (the fallen count)
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT

   The end is prophesied, and they are the only ones who profit from
   it arriving. Where Roma is paid when the ENEMY dies and
   Kami is paid when its OWN side breaks, Asgard is paid
   for the corpse count itself - both sides, no distinction. The Norse
   are not counting their casualties. They are reading the world
   ending.

   THE COUNT IS NOT A NEW MECHANIC. It reads `B.deathSeq`, the
   engine's existing monotonic death counter, through one new
   condition (`fallenAtLeast`). No status, no keyword, no glossary
   entry, no UI, nothing to serialize. Card text says "legends have
   fallen on either side" in plain words, matching how Spartacus,
   Caesar and Guan Yu already talk about defeat.

   THE INTERNAL SHAPE (why draft two, not one)
   -------------------------------------------------------------
     Fenrir     is deliberately BAD until the third death - half
                damage, a real cost paid up front - and permanently
                the best Bruiser body in the faction afterwards.
     Odin       is a mediocre AoE that becomes a huge one at 3.
     Hel        manufactures the deaths that turn the other two on,
                by shutting off enemy healing.
     Loki       is worth more dead than alive: his whole payload
                fires when he falls, which ALSO advances the count.
     Heimdall   buys the rounds needed to reach the threshold.
     Freyja     scales smoothly with the count rather than at a
                cliff, so the faction is not all-or-nothing.
     Thor       is the one unconditional card - the reason a
                Asgard draft is not helpless before round four.

   THE HONEST COST: three of these seven are below curve for the
   first half of a fight. That is the identity. A player who cannot
   survive to the third death should not draft them.

   CROSS-FACTION
   -------------------------------------------------------------
     - Roma's kill engine and Kami's self-sacrifice both
       ACCELERATE the count. Asgard + Roma is the intended
       degenerate-looking pair that is actually fair, because Roma
       has to spend its own tempo to get there.
     - Hel's anti-heal is the counter to Medic-heavy drafts that
       Duat's Sekhmet also wants.
     - Loki's death-burst feeds Duat (Burn under the execute line)
       and Grimmwood (debuff stacking).
   ============================================================= */
window.EOL.registerFaction({
  id: 'asgard',
  name: 'Asgard',
  icon: 'ra-frost-emblem',
  tagline: 'The wolf is loose, and we are glad.',
  colors: { primary: '#7fb4d4', secondary: '#3d5a80', glow: '#bfe6ff' },
  cards: [
    {
      id: 'asgard-odin',
      name: 'Odin',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Lightning',
      stats: { hp: 4880, atk: 1990, def: 16 },
      ability: {
        type: 'Active',
        name: 'Gallows-Wisdom',
        cost: 55,
        /* The flip is AoE% -> AoE%, never single -> AoE. An earlier
           draft widened the target count at the threshold, which
           doubled his damage budget mid-fight (0.30 -> 0.90) and made
           the card two different cards. Raising the multiplier instead
           keeps the budget honest.

           TRIMMED after the audit: 60/70% put him at budget 0.76, the
           second-strongest AoE in the game behind Zeus and ahead of
           Ma'at - too high for a card whose payoff is CONDITIONAL, since
           the conditional half should not also be the best number. At
           50/65% he runs 0.55 -> 0.71: a fair AoE that becomes a strong
           one, which is the intended shape. */
        text: 'Deal <b>50% ATK Magic Damage</b> to all enemies, increased to <b>65% ATK</b> once <b>3 legends have fallen</b> on either side.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'branch',
              cond: { fallenAtLeast: 3 },
              then: [{ k: 'dmg', power: 0.65, element: 'Magic' }],
              other: [{ k: 'dmg', power: 0.5, element: 'Magic' }],
            },
          ],
        },
      },
      icon: 'ra-eye-shield',
      art: 'assets/legends/asgard-odin.png',
    },

    {
      id: 'asgard-thor',
      name: 'Thor',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Lightning',
      stats: { hp: 6200, atk: 1720, def: 24 },
      ability: {
        type: 'Active',
        name: 'Mjolnir',
        cost: 45,
        /* THE UNCONDITIONAL ONE. Every other card here is a promise
           about later; a faction made only of those is unplayable in
           the first three rounds. Thor is plain, immediate and sits
           squarely mid-band (185%, budget 0.41) precisely so the
           faction has a floor. */
        text: 'Deal <b>185% ATK Lightning Damage</b> to one enemy.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [{ k: 'dmg', power: 1.85, element: 'Lightning' }],
        },
      },
      icon: 'ra-lightning-storm',
      art: 'assets/legends/asgard-thor.png',
    },

    {
      id: 'asgard-fenrir',
      name: 'Fenrir',
      rarity: 'epic',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 6400, atk: 1740, def: 22 },
      ability: {
        type: 'Passive',
        name: 'Gleipnir',
        cost: null,
        /* A REAL COST, NOT A COSTUME (CharacterGuidelines: "the
           conditional trap"). Most conditionals are true on round one
           and decay; this one is FALSE on round one and turns on. The
           card is genuinely bad early - half damage on a Bruiser body -
           and the payoff is permanent. That asymmetry is the whole
           design: drafting Fenrir is a bet on the fight going long.

           Built on `outgoingMult` with a `when` condition - the same
           declarative static-passive mechanism Robin Hood uses - so the
           halving is read at damage time rather than applied as a
           castable flag. The `when` inverts cleanly: below 3 fallen the
           multiplier applies, at 3+ it stops, and the permanent ATK
           rider turns on. No window where both apply. */
        text: 'Fenrir deals <b>half damage</b> until <b>3 legends have fallen</b> on either side. The chains then break, and he deals <b>25% more damage</b> for the rest of the battle.',
        note: null,
        passive: {
          trigger: 'static',
          effects: [
            /* while bound: half damage */
            { k: 'outgoingMult', mult: 0.5, when: { fallenBelow: 3 } },
            /* once free: permanently stronger */
            { k: 'outgoingMult', mult: 1.25, when: { fallenAtLeast: 3 } },
          ],
        },
      },
      icon: 'ra-wolf-howl',
      art: 'assets/legends/asgard-fenrir.png',
    },

    {
      id: 'asgard-hel',
      name: 'Hel',
      rarity: 'epic',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 5400, atk: 1320, def: 19 },
      ability: {
        type: 'Active',
        name: 'Half-Dead Queen',
        cost: 40,
        /* Hel MANUFACTURES the count the rest of the faction reads.
           Anti-heal does not kill anything by itself; it stops the
           enemy climbing back out of Odin's and Thor's damage, which
           is how the third death actually arrives. Zero direct damage,
           correct for a Controller. */
        text: 'All enemies receive <b>35% less healing</b> for 2 rounds. Once <b>2 legends have fallen</b> on either side, also <b>Expose</b> the 2 lowest HP enemies for 1 round.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            { k: 'healMod', pct: -35, turns: 2, to: 'targets' },
            {
              k: 'exposed',
              turns: 1,
              to: 'targets',
              take: { n: 2, by: 'lowestHp' },
              if: { fallenAtLeast: 2 },
            },
          ],
        },
      },
      icon: 'ra-death-skull',
      art: 'assets/legends/asgard-hel.png',
    },

    {
      id: 'asgard-loki',
      name: 'Loki',
      rarity: 'rare',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 5100, atk: 1260, def: 17 },
      ability: {
        type: 'Passive',
        name: 'Bound Trickster',
        cost: null,
        /* REWRITTEN. The first draft was "Silence 1, drain Energy" -
           byte-identical to Hemithea's Odysseus, which is a violation of
           the Skill Uniqueness rule and was spotted immediately.

           This version is the only card in the roster whose entire
           payload fires on its OWN death, which is both thematically
           exact (Loki is the one who starts Ragnarok) and mechanically
           self-synergising: his death advances the count that turns on
           Fenrir and Odin. He is worth more dead than alive, and the
           enemy knows it, which makes killing him a real decision. */
        text: 'When Loki is defeated, all enemies are <b>Burned</b> for 2 rounds and lose <b>15% ATK</b> for 2 rounds.',
        note: null,
        passive: {
          trigger: 'selfKilled',
          effects: [
            { k: 'burn', turns: 2, to: 'enemies' },
            { k: 'stat', stat: 'atk', amt: -15, turns: 2, to: 'enemies' },
          ],
        },
      },
      icon: 'ra-venomous-snake',
      art: 'assets/legends/asgard-loki.png',
    },

    {
      id: 'asgard-freyja',
      name: 'Freyja',
      rarity: 'rare',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4900, atk: 1020, def: 21 },
      ability: {
        type: 'Active',
        name: 'Folkvangr',
        cost: 40,
        /* Freyja takes half the slain, so she scales SMOOTHLY with the
           count rather than at a cliff - the faction would be pure
           all-or-nothing if every card flipped at 3. Capped at +12% via
           perFallenMax (4 deaths) for the same reason maxStacks exists:
           an uncapped per-death heal is a full heal by round eight.
           22% base is in band with Snow White (22%) and Guinevere. */
        text: 'Heal the <b>2</b> lowest HP allies for <b>22% Max HP</b>, plus <b>3%</b> for each legend that has fallen on either side.',
        note: 'Max: +12% from the fallen.',
        spec: {
          target: { side: 'ally', pick: 'all', row: 'any' },
          effects: [
            {
              k: 'heal',
              pctMaxHp: 22,
              perFallen: 3,
              perFallenMax: 4,
              to: 'targets',
              take: { n: 2, by: 'lowestHp' },
            },
          ],
        },
      },
      icon: 'ra-feather-wing',
      art: 'assets/legends/asgard-freyja.png',
    },

    {
      id: 'asgard-heimdall',
      name: 'Heimdall',
      rarity: 'rare',
      role: 'Tank',
      element: 'Light',
      stats: { hp: 7300, atk: 1010, def: 30 },
      ability: {
        type: 'Active',
        name: 'Gjallarhorn',
        cost: 35,
        /* The watchman BUYS ROUNDS, which is exactly what a faction
           whose payoffs arrive at the third death needs from its Tank.
           Differentiated from the other three Provoke tanks in this
           release: Heimdall reduces damage taken WHILE Provoking
           (Durga shields the team, Frankenstein grows, Kraken provokes
           everyone). No two of them share an effect signature. */
        text: 'Provoke for 1 round and gain a <b>15% Max HP Shield</b>. While Provoking, Heimdall takes <b>20% less damage</b>.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'shield', pctMaxHp: 15, to: 'self' },
            { k: 'taunt', turns: 1, to: 'self' },
            { k: 'damageResist', pct: 20, turns: 1, to: 'self' },
          ],
        },
      },
      icon: 'ra-ringing-bell',
      art: 'assets/legends/asgard-heimdall.png',
    },
  ],
});
