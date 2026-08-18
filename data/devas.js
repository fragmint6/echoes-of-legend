/* Faction: Devas - Marks and the cleansing hand
   -------------------------------------------------------------
   WHAT THIS FACTION IS ABOUT

   The realm of the gods, split between the hand that MARKS and the
   hand that CLEANSES. Kali and Indra put marks on the board; Shiva
   spends them. Ganesha and Vishnu take debuffs off your own side.
   Durga and Hanuman are the bodies that buy those turns.

   NO CYCLE. An earlier draft proposed a rotating team-wide
   Creation/Preservation/Destruction phase. That was a new global
   state, new UI, a new serialized field and a new mirror-determinism
   surface - a new FEATURE, which the owner had explicitly ruled out.
   The wheel is gone. What remains is the same pantheon expressed in
   the vocabulary the game already has, which is also how Kami
   and Duat were built.

   WHY MARKS, WHEN OLYMPUS AND HUAXIA ALREADY MARK
   -------------------------------------------------------------
   Deliberately the same lane, because the guidelines require factions
   to feed each other rather than sit in silos - 81% of all Marks in
   the shipped game get consumed, so mark SUPPLY is the scarce half.
   Devas is built as the consumer side: Shiva is the single hardest
   mark-payoff in the game, and Indra converts a wide mark spread into
   AoE. Drafted next to Olympus or Huaxia they get better; drafted
   alone Kali has to feed them herself, which she can, slowly.

   Brahma is deliberately NOT here. He anchors the Trimurti as an
   idea, but as a character he has almost no worship, no temples and
   no story cycle - Ganesha is both the better Creation figure and one
   of the most recognisable gods in the world.

   CROSS-FACTION
   -------------------------------------------------------------
     - Zeus, Qin Shi Huang and Kali all supply marks Shiva/Indra spend.
     - Ganesha's team cleanse is the answer to Grimmwood and Pandemonium
       debuff stacking, and to Hel's anti-heal.
     - Hanuman ignores Provoke, which is the counter to Camelot walls,
       the Kraken and Frankenstein's Monster.
   ============================================================= */
window.EOL.registerFaction({
  id: 'devas',
  name: 'Devas',
  icon: 'ra-lightning-trio',
  tagline: 'The wheel turns, and the gods turn with it.',
  colors: { primary: '#e8a33d', secondary: '#7b3fa0', glow: '#ffd98a' },
  cards: [
    {
      id: 'devas-shiva',
      name: 'Shiva',
      rarity: 'legendary',
      role: 'Bruiser',
      element: 'Shadow',
      stats: { hp: 6350, atk: 1745, def: 23 },
      ability: {
        type: 'Active',
        name: 'Tandava',
        cost: 55,
        /* TRIMMED HARD. The first draft was 260% rising to 340% - the
           single largest number in the game, twice over, on a card that
           also had a Shield-ignoring clause. Anubis's 260% execute is
           the shipped ceiling and it is a LEGENDARY SNIPER with a
           conditional; a Bruiser has no business above it.

           TRIMMED AGAIN after the audit: 250% still broke the Bruiser
           guide (150-200%). At 150/200 he tops out exactly AT the
           Bruiser ceiling and only when a mark has been spent to get
           him there - budget 0.27 -> 0.36, comfortably in band. The
           payoff is the reliability of the mark combo, not a record
           number. */
        text: 'Deal <b>150% ATK Shadow Damage</b>, increased to <b>200% ATK</b> against a <b>Marked</b> enemy.',
        note: 'Consumes the Mark, as all Skill damage does.',
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'front' },
          effects: [
            {
              k: 'branch',
              /* `anyTargetMarked`, not `targetMarked`. branchPasses()
                 - the shared resolver used by both the preview and the
                 real cast - does not know `targetMarked`, so it fell
                 through to its default of `pass = true` and Shiva
                 silently took the 200% arm against EVERY target,
                 marked or not. Caught by sim/verify_chapter2.js. */
              cond: { anyTargetMarked: true },
              then: [{ k: 'dmg', power: 2.0, element: 'Shadow' }],
              other: [{ k: 'dmg', power: 1.5, element: 'Shadow' }],
            },
          ],
        },
      },
      icon: 'ra-fire-ring',
      art: 'assets/legends/devas-shiva.png',
    },

    {
      id: 'devas-vishnu',
      name: 'Vishnu',
      rarity: 'epic',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4900, atk: 1040, def: 21 },
      ability: {
        type: 'Active',
        name: 'The Ten Avatars',
        cost: 45,
        /* RAISED. The first draft healed 12% - literally half of Snow
           White's 22% at a HIGHER cost, which the owner correctly called
           out as unplayable. 24% to the whole team plus a cleanse each
           puts him between Izanagi (30% to targets) and Snow White, and
           the cleanse is what separates him from Jason's flat team heal. */
        text: 'Heal all allies for <b>24% Max HP</b> and cleanse <b>1</b> debuff from each of them.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all', row: 'any' },
          effects: [
            { k: 'heal', pctMaxHp: 24, to: 'targets' },
            { k: 'cleanse', n: 1, to: 'targets' },
          ],
        },
      },
      icon: 'ra-sunbeams',
      art: 'assets/legends/devas-vishnu.png',
    },

    {
      id: 'devas-kali',
      name: 'Kali',
      rarity: 'epic',
      role: 'Caster',
      element: 'Shadow',
      stats: { hp: 4780, atk: 1930, def: 15 },
      ability: {
        type: 'Active',
        name: 'Garland of Skulls',
        cost: 45,
        /* The SUPPLY half of the faction. Low damage on purpose (65%);
           what the card is actually paying for is two marks, which
           Shiva turns into +60% and Indra turns into an AoE. Cast alone
           it is a weak Caster turn - exactly the Duat pattern, where
           half the faction is deliberately incomplete. */
        text: 'Deal <b>65% ATK Shadow Damage</b> to <b>2</b> enemies and apply <b>Mark</b> to both.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            { k: 'dmg', power: 0.65, element: 'Shadow' },
            { k: 'mark', to: 'targets', when: 'now' },
          ],
        },
      },
      icon: 'ra-skull',
      art: 'assets/legends/devas-kali.png',
    },

    {
      id: 'devas-durga',
      name: 'Durga',
      rarity: 'epic',
      role: 'Tank',
      element: 'Fire',
      stats: { hp: 7350, atk: 1050, def: 30 },
      ability: {
        type: 'Active',
        name: 'Riding the Lion',
        cost: 40,
        /* Distinct from the release's other three Provoke tanks:
           Heimdall reduces his own damage taken, Frankenstein grows per
           hit, the Kraken provokes everyone. Durga is the only one who
           shields the WHOLE TEAM while stepping forward, which is what
           makes her the natural partner for Pandemonium's Wrath (who sheds
           DEF) and for a backline of Casters. */
        text: 'Provoke for 1 round and grant <b>every ally</b> a <b>15% Max HP Shield</b>.',
        note: null,
        spec: {
          target: { side: 'self' },
          effects: [
            { k: 'taunt', turns: 1, to: 'self' },
            { k: 'shield', pctMaxHp: 15, to: 'allies' },
          ],
        },
      },
      icon: 'ra-flaming-trident',
      art: 'assets/legends/devas-durga.png',
    },

    {
      id: 'devas-ganesha',
      name: 'Ganesha',
      rarity: 'rare',
      role: 'Medic',
      element: 'Nature',
      stats: { hp: 4700, atk: 1000, def: 20 },
      ability: {
        type: 'Active',
        name: 'Remover of Obstacles',
        cost: 35,
        /* Zero healing, which is unusual for a Medic and the point:
           he removes the REASON you are losing HP rather than the HP
           loss itself. The Energy rider makes him the enabler for
           Shiva's 55 and Odin's 55. Distinct from Vishnu (heal +
           cleanse) and from Jason (heal + Energy). */
        text: 'Cleanse <b>all</b> debuffs from every ally, heal them for <b>10% Max HP</b>, and grant your team <b>10 Energy</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'all', row: 'any' },
          effects: [
            { k: 'cleanse', n: 99, to: 'targets' },
            /* A small heal so the card HAS an upgradeable magnitude.
               Ganesha was one of five new legends whose skill scaled
               with nothing - the same hole Medusa had. Kept small (10%)
               so he stays the cleanse-and-Energy card rather than
               becoming a second Vishnu. */
            { k: 'heal', pctMaxHp: 10, to: 'targets' },
            { k: 'gainEnergy', amt: 10 },
          ],
        },
      },
      icon: 'ra-trefoil-lily',
      art: 'assets/legends/devas-ganesha.png',
    },

    {
      id: 'devas-hanuman',
      name: 'Hanuman',
      rarity: 'rare',
      role: 'Bruiser',
      element: 'Physical',
      stats: { hp: 5900, atk: 1620, def: 21 },
      ability: {
        type: 'Active',
        name: 'Leap to Lanka',
        cost: 40,
        /* The leap over the sea, expressed as the leap over the front
           row. `row: 'back'` already exists and already bypasses Provoke
           (the engine's piercesTaunt path treats an explicitly
           back-row-only strike as reaching past the wall), so this needs
           nothing new. It is the roster's answer to a Provoke-heavy
           board, which this very release adds four of. */
        text: 'Leap the enemy line and deal <b>175% ATK Physical Damage</b> to one <b>back row</b> enemy, ignoring <b>Provoke</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'back' },
          effects: [{ k: 'dmg', power: 1.75, element: 'Physical' }],
        },
      },
      icon: 'ra-boot-stomp',
      art: 'assets/legends/devas-hanuman.png',
    },

    {
      id: 'devas-indra',
      name: 'Indra',
      rarity: 'rare',
      role: 'Sniper',
      element: 'Lightning',
      stats: { hp: 4450, atk: 1860, def: 12 },
      ability: {
        type: 'Active',
        name: 'Vajra',
        cost: 50,
        /* THE OTHER MARK CONSUMER, and the reason Lightning stops being
           a rounding error in this game (3 cards in 63 before this
           release; Odin, Thor and Indra make it 6).

           `onlyMarked` already exists as an effect filter. Against one
           mark this is a weak 70%; against four it is the widest burst
           in the faction. The opponent controls it by spreading damage,
           and the player controls it by drafting Kali or Olympus. */
        text: 'Call down the thunderbolt: deal <b>70% ATK Lightning Damage</b> to every <b>Marked</b> enemy.',
        note: 'Weak against a board with no Marks.',
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [{ k: 'dmg', power: 0.7, element: 'Lightning', onlyMarked: true }],
        },
      },
      icon: 'ra-focused-lightning',
      art: 'assets/legends/devas-indra.png',
    },
  ],
});
