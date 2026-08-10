/* =============================================================
   Echoes of Legend - Campaign Chapter 1 Data: "The Road of Echoes"
   -------------------------------------------------------------
   The campaign is where the game's lore lives (standing ROADMAP
   law). This file is the whole CONTENT layer for Chapter 1:

     - the ten stages, each with its authored rival twelve
       (R1: handpicked everywhere - nothing is rolled),
     - scripted sixes for stages 1-4 (§8 dial 2),
     - ban profiles so each rival BANS in character (§9.11),
     - draft personas + curated pool specs for stages 6-8,
     - fight cards for the three Unabridged stages (5, 9, 10),
     - the grant curriculum (§7.3 - pairs, choice at the exams),
     - all dialogue: pre-fight scenes, victory epilogues, defeat
       lines, and IN-BATTLE RIVAL BARKS (non-blocking, see
       js/campaign.js + the #rival-bark element),
     - the bespoke Gilgamesh card. He is campaign data only:
       NEVER registered into EOL.factions, never draftable,
       never in a balance pool - but he IS built from the same
       audited spec primitives as every roster card (law L4/L5).

   Load order: after the faction files, before js/campaign.js.
   Plain script - the game must keep running from file://.
   ============================================================= */
window.EOL = window.EOL || {};

(function () {
  'use strict';

  /* ---------------------------------------------------------
     GILGAMESH - the First Legend (stage 10 boss)
     -------------------------------------------------------------
     Composed ONLY of audited primitives (dmg / branch / stat with
     stackTag+maxStacks), so sim/audit_abilities-class checks can
     reason about him like any roster card.

       - He is an EXPENSIVE ACTIVE on purpose: the Legend's Trial
         champion buff only sees Actives with cost > 0 (§5 trap 1),
         and his fight card includes that board.
       - His ramp is IN HIS KIT, not in the ground (L1): every cast
         of the signature banks a permanent ATK stack - the fight
         is a race against his patience.
       - The judgement rider echoes the Duat execute threshold the
         player is meeting for the first time in the same fight.

     `unbannable` + `pinned` are honoured by hardcode in js/play.js
     (R5): the ban grid refuses him, and he is seeded into every
     six of the set before the AI fills the rest.
     --------------------------------------------------------- */
  var BOSS_FACTION = {
    id: 'first-legend',
    name: 'Uruk',
    icon: 'ra-tower',
    tagline: 'The first story that refused to end.',
    colors: { primary: '#d4a017', secondary: '#3b2c17', glow: '#ffd77a' },
  };

  var GILGAMESH = {
    id: 'campaign-gilgamesh',
    name: 'Gilgamesh',
    rarity: 'legendary',
    role: 'Bruiser',
    element: 'Light',
    /* Soak-tuned 2026-08-09: at hp 6650 / atk 1690 / +10%x5 the set was
       won 70% at the floor vs the ~20-30% design target. The First
       Legend now hits like the end of a road should. */
    stats: { hp: 8600, atk: 2050, def: 34 },
    unbannable: true,
    pinned: true,
    icon: 'ra-crown',
    art: 'assets/rivals/gilgamesh.png',
    ability: {
      type: 'Active',
      name: 'He Who Saw the Deep',
      cost: 50,
      text:
        'Deal <b>180% ATK Light Damage</b>. If the target is below <b>40% HP</b>, ' +
        'instead deal <b>360% ATK</b> - the scales have already decided. Each cast, ' +
        'Gilgamesh permanently gains <b>15% ATK</b>: kingship that outlasts.',
      note: 'Max: 6 growth stacks.',
      spec: {
        target: { side: 'enemy', pick: 'single', row: 'any' },
        effects: [
          {
            k: 'branch',
            cond: { targetHpBelow: 0.4 },
            then: [{ k: 'dmg', power: 3.6, element: 'Light' }],
            other: [{ k: 'dmg', power: 1.8, element: 'Light' }],
          },
          {
            k: 'stat',
            stat: 'atk',
            amt: 15,
            turns: 99,
            to: 'self',
            stackTag: 'saw-the-deep',
            maxStacks: 6,
          },
        ],
      },
    },
  };

  /* ---------------------------------------------------------
     THE TEN GATES
     -------------------------------------------------------------
     Per-stage battle recipe. Everything a stage needs to launch
     lives here; js/campaign.js is only the glue.

       mode        'classic' (single game) | 'set' (Unabridged
                   best-of-3) | 'draft'
       field       pinned battlefield id (classic / draft stages)
       fightCard   three battlefield ids (set stages) - L1 says
                   terrain is always symmetric, so a stage pins
                   EXISTING boards, never bespoke rules
       enemy12     the authored rival deck (card ids; legal 12)
       factionMix  authored faction counts, recorded so the future
                   Faction Blessings retune is a data pass (R8)
       botSix      scripted fielded six - stages 1-4 only (§8:
                   difficulty comes from decks, never the AI)
       banProfile  how this rival bans, in character (§9.11):
                     ids:[..]     always-ban list, first priority
                     roles:[..]   prefers striking these roles
                     stat:'atk'   prefers your hardest hitters
                     power:true   prefers your highest-rated cards
       banTell     the Recruiter's ledger note on that habit, shown
                   during the ban phase BEFORE the player commits
                   (playtest ruling 2026-08-09: the first call of a
                   gate must not also be the blindest one). Stage 1
                   has none - the script narrates its bans itself.
       persona     draft-pick personality (stages 6-8):
                     'trickster' | 'strategist' | 'chronicler'
       pool        curated draft pool spec: { featured: factionId }
                   - the featured faction's full six is guaranteed
                   in the pool; the rest fills to 6-per-role
       grants      tier-1 curriculum cards + tier-2 coin. Exams
                   grant a CHOICE (R9: choice-shaped, resolved at
                   claim time against the live roster).
     --------------------------------------------------------- */
  var STAGES = [
    {
      id: 1,
      key: 'the-recruiter',
      rival: 'The Recruiter',
      portrait: 'assets/rivals/the-recruiter.png',
      mode: 'classic',
      format: 'Classic - Guided gate',
      terrain: 'The Colosseum',
      field: 'colosseum',
      line: 'An old memory broker opens a weathered ledger and writes a blank line. He fights to measure you, not to beat you - and he walks you through every law of the war himself: the bans, the ranks, the first blood. Plays it straight. Nothing hidden.',
      lock: 'The first question',
      enemy12: [
        'grimmwood-hansel-gretel',
        'grimmwood-rumpelstiltskin',
        'grimmwood-big-bad-wolf',
        'grimmwood-snow-white',
        'grimmwood-red-riding-hood',
        'grimmwood-pied-piper',
        'grimmwood-gingerbread-man',
        'grimmwood-evil-queen',
        'grimmwood-puss-in-boots',
        'grimmwood-rapunzel',
        'grimmwood-goldilocks',
        'grimmwood-cinderella',
      ],
      factionMix: { grimmwood: 12 },
      /* A scripted, deliberately modest six from the mirror deck -
         no legendaries. A true mirror is ~50%, not the ~95% a first
         fight should be; the scripted six resolves that (§4). */
      botSix: [
        'grimmwood-gingerbread-man',
        'grimmwood-red-riding-hood',
        'grimmwood-goldilocks',
        'grimmwood-pied-piper',
        'grimmwood-rapunzel',
        'grimmwood-snow-white',
      ],
      banProfile: { ids: ['grimmwood-hansel-gretel', 'grimmwood-cinderella'] },
      /* GATE I IS FULLY SCRIPTED (owner ruling 2026-08-08): the deck is
         the starter twelve, the bans and the fielded six are the
         ledger's picks, and the Recruiter narrates every phase. The
         script is enforced in js/play.js (marked tiles are the only
         legal clicks) and voiced by js/campaign.js's tutor engine. */
      script: {
        deck: 'starter-grimmwood',
        bans: ['grimmwood-rumpelstiltskin', 'grimmwood-evil-queen'],
        /* click order matters: the back row seats first, so the Piper
           takes the third front slot beside the wall and the wolf -
           one of every role on the field, exactly as the ledger drew it */
        six: [
          'grimmwood-gingerbread-man',
          'grimmwood-big-bad-wolf',
          'grimmwood-snow-white',
          'grimmwood-evil-queen',
          'grimmwood-goldilocks',
          'grimmwood-pied-piper',
        ],
        hintBan: 'The Recruiter taps the ledger - "Those two. Take my crown pieces."',
        hintSix: 'The Recruiter shakes his head - "The marked card. Trust the ledger this once."',
        /* THE WHOLE MATCH IS SCRIPTED: a pre-computed line generated
           against the real engine under this exact seed
           (sim/gen_gate1_line.js). The player wins, casts all six
           signatures, and loses nobody - if they follow the marks.
           sim/verify_campaign.js replays it after every balance
           patch. */
        match: {
          seed: 1,
          /* ROUNDS 1-2 ONLY (the handoff, 2026-08-10): the ledger walks the
             opening - turn order, basics, the pass lesson, the round-2
             signature unlock (Piper + Queen) - and ends at the top of round
             3 with the player ahead and everyone standing. From there the
             fight is FREE: the Recruiter reacts (tutorial.reactions) but
             never steers. Handoff position soak: 30/30 AI continuations won
             (avg 4.8/6 standing), with his own sig moderation active. */
          moves: [{"side":"player","unit":"grimmwood-big-bad-wolf","ability":"basic","targets":[{"side":"enemy","id":"grimmwood-pied-piper"}],"say":"Open with the marked legend - a Basic. Cheap, honest work. Tap the legend, tap the skill, tap the marked victim."},{"side":"enemy","unit":"grimmwood-gingerbread-man","ability":"basic","targets":[{"side":"player","id":"grimmwood-big-bad-wolf"}],"say":"My wall raises his shield and PROVOKES - watch your teeth get pulled toward him. Walls work both ways, Blank."},{"side":"player","unit":"grimmwood-goldilocks","ability":"basic","targets":[{"side":"enemy","id":"grimmwood-gingerbread-man"}]},{"side":"enemy","unit":"grimmwood-red-riding-hood","ability":"basic","targets":[{"side":"player","id":"grimmwood-pied-piper"}]},{"side":"player","unit":"grimmwood-evil-queen","ability":"basic","targets":[{"side":"enemy","id":"grimmwood-gingerbread-man"}]},{"side":"enemy","pass":true},{"side":"player","pass":true,"say":"Now PASS - yes, on purpose. Unspent Energy carries over, and round two has expensive plans. Hoarding is a move."},{"side":"enemy","unit":"grimmwood-gingerbread-man","ability":"basic","targets":[{"side":"player","id":"grimmwood-pied-piper"}]},{"side":"player","unit":"grimmwood-pied-piper","ability":"sig","targets":[{"side":"enemy","id":"grimmwood-red-riding-hood"},{"side":"enemy","id":"grimmwood-gingerbread-man"}],"say":"Now the Piper - pick both marked victims. CONTROLLERS do not win fights; they decide where fights are winnable: attack carved down, defences torn open, plans bent sideways."},{"side":"enemy","unit":"grimmwood-red-riding-hood","ability":"basic","targets":[{"side":"player","id":"grimmwood-gingerbread-man"}]},{"side":"player","unit":"grimmwood-evil-queen","ability":"sig","targets":[],"say":"And the Queen. CASTERS punish crowds: one incantation and the whole enemy line pays for standing together. Fragile as glass, worth every shard."},{"side":"enemy","pass":true},{"side":"player","unit":"grimmwood-big-bad-wolf","ability":"basic","targets":[{"side":"enemy","id":"grimmwood-gingerbread-man"}]},{"side":"enemy","pass":true},{"side":"player","unit":"grimmwood-goldilocks","ability":"basic","targets":[{"side":"enemy","id":"grimmwood-gingerbread-man"}]},{"side":"enemy","pass":true}],
        },
      },
      tutorial: {
        intro: [
          'Preparation. Two ledgers of twelve - mine on the right, yours on the left. Nobody fights with all twelve; wars are won by what you agree to leave out.',
          'First law: the bans. You strike two of MY legends out of the fight, and I strike two of yours. Simultaneous. Sealed. No peeking. Honest politics - the only kind left.',
        ],
        ban0: 'Strike my two crown pieces - Rumpelstiltskin and the Evil Queen. Never leave a legendary standing out of politeness. They are marked; tap them.',
        ban1: 'One down. The Evil Queen has noticed, and she is not flattered. Cross her out too.',
        ban2: 'Ruthless. I approve. Now press CONFIRM BANS - mine were written before you sat down.',
        reveal: 'There. I took your candle-children and your midnight girl. A ban is a question: what can you not live without? Remember how this feels, and do it to everyone after me.',
        arena: 'This card is the ARENA - read it before every war. The Colosseum is the one honest board: no special laws. Every other arena on this road bends the rules, and its card tells you exactly how. In battle, the badge in the top-left corner names the ground; hover it whenever you forget.',
        tips: 'And see the little question-mark dots scattered across every screen? Hover one - there is one on this very card. They explain whatever they sit beside. I wrote most of them myself, and I do not write for my health.',
        field: 'Now field the six the ledger marked - one at a time, in order. Tap the marked card: {name}.',
        roles: {
          'grimmwood-gingerbread-man':
            'A TANK. High health, real armor, and abilities that PROVOKE - forcing enemies to hit him instead of the people worth protecting. Every wall you will ever love is one of these.',
          'grimmwood-big-bad-wolf':
            'A BRUISER. Front-row muscle: hits hard, heals off the wounds he causes. Where the Tank is a promise, the Bruiser is a threat.',
          'grimmwood-snow-white':
            'A MEDIC. She undoes damage, strips debuffs, keeps six stories from becoming five. Kill theirs first; guard yours to the last breath.',
          'grimmwood-evil-queen':
            'A CASTER. Magic damage in wide, cruel shapes - whole enemy lines at once. Fragile as glass and worth every shard.',
          'grimmwood-goldilocks':
            'A SNIPER. She reaches the BACK ROW where the soft targets hide, and her signature executes anyone foolish enough to be half-dead in the open.',
          'grimmwood-pied-piper':
            'A CONTROLLER. He does not deal the damage - he decides where damage MATTERS: carving attack down, tearing defence open, bending the fight. He takes the last front slot; his song does not care where he stands.',
        },
        rows: 'Study the rows. FRONT soaks the blows - the wall, the wolf, and the piper holding the third gap. BACK works in peace - healer, witch, dead-eye. Snipers exist to punish a naked back line; rows are why yours is not naked.',
        toBattle:
          'Press TO BATTLE when your hand stops shaking. Mine did too, eventually. About a century in. The first two rounds are the ledger\'s - follow the golden marks while I name each lesson. From round three the war is YOURS.',
        /* THE HANDOFF + REACTIONS (2026-08-10): rounds 1-2 are scripted,
           then the Recruiter stops steering and starts REACTING - each
           line fires once, on the player's own choice, at the moment of
           consequence (the four role-signature lessons the shortened
           script no longer delivers, plus a few observations). Non-
           blocking barks, never corrections. */
        handoff:
          'The ledger ends here, Blank. Rounds one and two were mine - the war is yours now. I will watch, and I will talk, but I will not steer.',
        reactions: {
          roles: {
            Bruiser:
              'The Wolf, unchained - YOUR call this time. BRUISERS are the front line\'s teeth: they tear down whatever the wall holds still, and they grow stronger doing it.',
            Sniper:
              'Goldilocks, by your own hand. SNIPERS reach past every wall into the soft back row. They do not open wars - they end arguments.',
            Medic:
              'Snow White - good instinct. MEDICS buy back the mistakes your courage keeps making: wounds undone, poisons wiped. Wars are lost the round the healer dies.',
            Tank:
              'The Gingerbread Man plants himself because YOU asked. This is what TANKS are for: he shouts the loudest, and danger forgets your soft targets exist.',
          },
          enemyHeals:
            'My healer stitches the damage back. Remember the shape of that annoyance - and cure it at the source.',
          foeMedicDown:
            'Their healer falls - to YOUR arithmetic. Wars shorten when nobody is left to argue with it.',
          pass: 'Passing with a full purse, unprompted. You HAVE been listening. Savings win expensive rounds.',
        },
        rounds: {
          1: [
            'Round one: BASICS only - signatures wake in round two. Even legends stretch first.',
            'The tall bar by your crest is ENERGY: every skill spends it, savings carry over, and income grows each round - 60, then 80, then 100.',
            'See the dial by the Pass button? The TURN CLOCK - thirty seconds a move, out in the real wars. On my road it ticks for show only: the Road has waited centuries. Take your time.',
          ],
          2: [
            'Round two - SIGNATURES unlock. The expensive, theatrical ones. Time to spend what you hoarded.',
          ],
          4: [
            'Round four. From here the Road sharpens every blade a little more each round - it despises stalemates. Finish what you started.',
          ],
        },
      },
      grants: { coins: 100 },
      resultWin: 'The Recruiter closes his ledger - Gate I is yours.',
      resultLose:
        'The Recruiter sets down his quill. "Dead? At MY gate? Embarrassing - for me, Blank, not you. Take the rematch. Nobody has ever died at my gate twice."',
      barks: {
        start: '"I will not trick you. The Road has enough of that ahead."',
        firstBloodYou:
          '"First blood to you. Do not smile yet - the outnumbered side earns bonus Energy every round. The Road pays its wounded."',
        firstBloodFoe:
          '"First blood to me. Steady. Fewer heroes means fewer turns - but the Road pays YOU bonus Energy now. Spend it angrily."',
        allyDown: '"Another of yours gone. Each body lost is a turn lost every round. Guard the rest."',
        foeHalf: '"Half my side, gone. When you outnumber a foe, PRESS - turns are the true currency."',
        foeLast: '"One of mine left. Focus your fire, Blank. Mercy is for stories with endings."',
        playerLow:
          '"Two standing. The comeback Energy is yours every round now - spend it like your last sentence. It may be."',
      },
    },
    {
      id: 2,
      key: 'the-oathkeeper',
      rival: 'The Oathkeeper',
      portrait: 'assets/rivals/the-oathkeeper.png',
      mode: 'classic',
      format: 'Classic',
      terrain: 'The Narrow Pass',
      field: 'narrow-pass',
      line: 'A scarred veteran mends his shield with iron wire and asks who your strength protects. Nothing reaches your back line while he stands - go through him.',
      lock: 'Clear The Recruiter',
      /* Camelot's whole hall plus a second wall: the pass narrows and
         he intends to BE the reason it matters. */
      /* ORDERED: the scripted six first, then the bench weakest-first -
         a ban into the six pulls the NEXT NAME on this list (the
         deterministic-refill law in js/play.js). */
      enemy12: [
        'camelot-king-arthur',
        'yamato-benkei',
        'grimmwood-gingerbread-man',
        'camelot-guinevere',
        'sherwood-will-scarlet',
        'camelot-merlin',
        'sherwood-maid-marian',
        'sherwood-friar-tuck',
        'yamato-momotaro',
        'camelot-morgan-le-fay',
        'camelot-mordred',
        'camelot-lancelot',
      ],
      factionMix: { camelot: 6, yamato: 2, grimmwood: 1, sherwood: 3 },
      /* Soak-tuned 2026-08-09: the wall holds, the teeth behind it are
         modest - the lesson is going THROUGH him, not surviving Mordred. */
      botSix: [
        'camelot-king-arthur',
        'yamato-benkei',
        'grimmwood-gingerbread-man',
        'camelot-guinevere',
        'sherwood-will-scarlet',
        'camelot-merlin',
      ],
      /* He tells you his oath before he swears it: your best back-line
         threat is taken at the gate. */
      banProfile: { roles: ['Sniper', 'Caster'], stat: 'atk' },
      banTell: 'He strikes the killers-at-a-distance first: your archers, your mages, whatever hits hardest from safety.',
      /* THE ADVISED GATE (2026-08-10): gate 1 scripts, gate 2 ADVISES,
         gate 3+ releases. The Recruiter walks one more gate offering
         silver-marked counsel - computed live from the real deny math,
         never enforced. Refusing costs nothing. */
      advisor: {
        ban: 'My counsel stands in silver, Blank - the two I would strike from his twelve. But it is not me fighting. Refuse freely; the Road grades results, not obedience.',
        six: 'In silver again: the six I would field against him. Rearrange it, replace it, ignore it - your hand, your gate. This is the last one I walk beside you.',
      },
      grants: { cards: ['camelot-king-arthur', 'camelot-lancelot'], coins: 120 },
      resultWin: 'The Oathkeeper lowers his shield. "You saw the promise. Not the opening."',
      resultLose: '"A wall is not cruelty," the Oathkeeper says. "Come back and learn its shape."',
      barks: {
        start: '"The pass narrows here. So do excuses."',
        firstBloodYou: '"Through the shield. Good. That is the only honest road."',
        firstBloodFoe: '"I told danger where it must stop. You crossed the line."',
        allyDown: '"Who was protecting them? Think. Answer with your hands."',
        foeDown: '"He held exactly as long as he was asked to. That is all a wall may promise."',
        foeHalf: '"Forty-three. Twelve. I count everything, Wayfarer."',
        foeLast: '"One shield left. It is enough. It has to be."',
        playerLow: '"Your wall is breaking because it does not know what it defends."',
      },
    },
    {
      id: 3,
      key: 'the-outlaw',
      rival: 'The Outlaw',
      portrait: 'assets/rivals/the-outlaw.png',
      mode: 'classic',
      format: 'Classic',
      terrain: 'The Open Plains',
      field: 'open-plains',
      line: 'A rifle cracks from the watchtree. She always shoots your strongest legend - bait or bury them. Protect your brightest echo, or learn who you leave behind.',
      lock: 'Clear The Oathkeeper',
      /* Soak-tuned 2026-08-09: the original bench (Tomoe, Puss, Guy on
         call) meant banning Robin UPGRADED her six. The bench is now
         honest support - the lesson stays Robin's rifle, not the
         replacements. */
      enemy12: [
        'sherwood-robin-hood',
        'sherwood-little-john',
        'grimmwood-gingerbread-man',
        'sherwood-maid-marian',
        'grimmwood-snow-white',
        'sherwood-friar-tuck',
        'grimmwood-cinderella',
        'grimmwood-pied-piper',
        'sherwood-will-scarlet',
        'grimmwood-goldilocks',
        'grimmwood-rapunzel',
        'sherwood-guy-of-gisborne',
      ],
      factionMix: { sherwood: 6, grimmwood: 6 },
      /* Soak-tuned 2026-08-09: triple snipers on the +15% back-row board
         measured 13% player WR - a wall, not a lesson. Robin + Goldilocks
         still teach the focus-fire read. */
      /* Soak-tuned: Goldilocks' execute alone is worth ~40pp on the
         Plains - Robin's rifle carries the focus-fire lesson solo. */
      botSix: [
        'sherwood-robin-hood',
        'sherwood-little-john',
        'grimmwood-gingerbread-man',
        'sherwood-maid-marian',
        'grimmwood-snow-white',
        'sherwood-friar-tuck',
      ],
      /* She bans your protectors, so the favourite stands in the open.
         Soak-tuned 2026-08-09: taking BOTH walls AND healers off a
         14-card floor was the gate's real cruelty (+24pp measured when
         softened) - she now hunts the healers only. The flavour holds:
         the healer is the protector. */
      banProfile: { roles: ['Tank'] },
      banTell: 'She takes the walls. The ledger has never once seen her let a Tank stand.',
      grants: { cards: ['sherwood-robin-hood', 'sherwood-little-john'], coins: 120 },
      resultWin: '"Oh," she says softly. "You protect the strong so they can protect the rest."',
      resultLose: 'The Outlaw reloads without hurry. "The favorite ate the whole supper. Again?"',
      barks: {
        start: '"Every company has a favorite. Point them out or I will."',
        firstBloodYou: '"Quick hands. My father would have sold you a book about them."',
        firstBloodFoe: '"There is the large type. Now watch the scenery notice."',
        allyDown: '"That one carried too much of your hope. I could tell from here."',
        foeDown: '"Down. Watch how fast a company reorganizes its love."',
        foeHalf: '"You are spending my arrows faster than I like."',
        foeLast: '"Last shot in the tree. Make it interesting."',
        playerLow: '"See? The favorite eats the whole supper."',
      },
    },
    {
      id: 4,
      key: 'the-anointed',
      rival: 'The Anointed',
      portrait: 'assets/rivals/the-anointed.png',
      mode: 'classic',
      format: 'Classic',
      terrain: 'The Mana Spring',
      field: 'mana-spring',
      line: 'An ascetic keeper turns the rings of a bronze astrolabe and a gold circle blooms underfoot. Her Marks are a promise. Answer them or pay.',
      lock: 'Clear The Outlaw',
      /* Olympus Mark engine + strong neutral support - the most-tuned
         deck of stages 1-4, because Olympus is the chapter's only Mark
         teacher and cannot be swapped (§4 balance flag). */
      enemy12: [
        'roma-spartacus',
        'olympus-hercules',
        'olympus-ares',
        'olympus-zeus',
        'olympus-medusa',
        'olympus-apollo',
        'camelot-guinevere',
        'camelot-mordred',
        'olympus-athena',
        'yamato-kaguya',
        'grimmwood-big-bad-wolf',
        'grimmwood-evil-queen',
      ],
      factionMix: { olympus: 6, roma: 1, grimmwood: 2, yamato: 1, camelot: 2 },
      botSix: [
        'roma-spartacus',
        'olympus-hercules',
        'olympus-ares',
        'olympus-zeus',
        'olympus-medusa',
        'olympus-apollo',
      ],
      /* Marks must land and stick: your cleansers are anointed first. */
      banProfile: { roles: ['Medic'], stat: 'atk' },
      banTell: 'She strikes the healers first, then whatever swings heaviest. Mercy is hers to give, not yours.',
      grants: { cards: ['olympus-zeus', 'olympus-hercules'], coins: 140 },
      resultWin: 'The Anointed marks herself, and the circle goes dark. "You read the promise."',
      resultLose: '"A warning can be mercy," she says. "You treated it as noise."',
      barks: {
        start: '"A mark. Not a curse. Not yet."',
        firstBloodYou: '"You strike before the promise ripens. Interesting."',
        firstBloodFoe: '"I see you. I am coming. Prepare - I did say so."',
        allyDown: '"The circle closed. It always closes on the unprepared."',
        foeDown: '"The circle closes where it pleases. Even on mine."',
        foeHalf: '"Even a priestess can be weighed. Continue."',
        foeLast: '"One vow left to keep."',
        playerLow: '"A blade held very politely is still a blade."',
      },
    },
    {
      id: 5,
      key: 'the-warden-of-the-mid-road',
      rival: 'The Warden of the Mid-Road',
      portrait: 'assets/rivals/the-warden-of-the-mid-road.png',
      mode: 'set',
      format: 'Unabridged - Three gates',
      terrain: 'Colosseum - Pass - Plains',
      fightCard: ['colosseum', 'narrow-pass', 'open-plains'],
      line: 'Three toll arches, one Warden. Bring a deck you built yourself: best of three, mandatory substitutions, and NO RETREAT once it begins. Adapt or fall.',
      lock: 'Clear The Anointed',
      /* The exam deck: 4/4/4 across the three taught factions (R8 -
         authored on purpose, counts recorded for the blessings pass). */
      enemy12: [
        'camelot-king-arthur',
        'camelot-lancelot',
        'camelot-merlin',
        'camelot-guinevere',
        'sherwood-robin-hood',
        'sherwood-little-john',
        'sherwood-guy-of-gisborne',
        'sherwood-will-scarlet',
        'olympus-zeus',
        'olympus-hercules',
        'olympus-medusa',
        'olympus-apollo',
      ],
      factionMix: { camelot: 4, sherwood: 4, olympus: 4 },
      /* No scripted six from here up: a set without sideboarding is
         not a set. The Warden fields adaptively and swaps in answers. */
      banProfile: {},
      banTell: 'She reads your twelve like a ledger and strikes what the rest of it leans on. Bring no single point of failure.',
      grants: { choice: { count: 2, factions: ['camelot', 'sherwood', 'olympus'] }, coins: 220 },
      resultWin: 'The Warden lays the iron key on the table. "You changed after winning. Go on."',
      resultLose: '"The Mid-Road keeps what does not adapt," the Warden says. "Return ready."',
      barks: {
        start: '"Three gates. Three battles. No retreat between them."',
        start2: '"The second gate knows what you did at the first."',
        start3: '"The last gate. Show me what you have unlearned."',
        firstBloodYou: '"Recorded. The Road remembers openings."',
        firstBloodFoe: '"Old answers become new problems. Adjust."',
        allyDown: '"You carried that one too far on habit alone."',
        foeDown: '"Noted. The next gate will not offer that trade twice."',
        foeHalf: '"Good. Winning once was never the lesson."',
        foeLast: '"Finish it properly. Sloppiness is a toll I collect."',
        playerLow: '"This is where people stop pretending they are passing through."',
      },
    },
    {
      id: 6,
      key: 'the-trickster',
      rival: 'The Trickster',
      portrait: 'assets/rivals/the-trickster.png',
      mode: 'draft',
      format: 'Draft',
      terrain: 'The Energy Void',
      field: 'energy-void',
      persona: 'trickster',
      personaJitter: 4.5,
      pool: {
        featured: 'yamato',
        /* FROZEN POOL (owner ruling 2026-08-09): the 36 cards of every
           draft gate are fixed, authored data - 6 per role, the whole
           featured faction guaranteed, no Huaxia (Chapter 2) and no
           Duat (the boss reveal). This is the Trickster's table:
           energy payoffs and steal-bait on purpose. */
        cards: [
          'yamato-benkei', 'yamato-momotaro', 'camelot-king-arthur',
          'roma-spartacus', 'grimmwood-gingerbread-man', 'takamagahara-susanoo',
          'yamato-minamoto-no-yoshitsune', 'grimmwood-big-bad-wolf', 'camelot-lancelot',
          'roma-julius-caesar', 'sherwood-guy-of-gisborne', 'olympus-ares',
          'yamato-tomoe-gozen', 'grimmwood-puss-in-boots', 'grimmwood-goldilocks',
          'camelot-mordred', 'roma-brutus', 'sherwood-robin-hood',
          'yamato-kaguya', 'grimmwood-evil-queen', 'olympus-zeus',
          'takamagahara-amaterasu', 'takamagahara-tsukuyomi', 'grimmwood-rapunzel',
          'yamato-abe-no-seimei', 'takamagahara-inari', 'takamagahara-izanami',
          'camelot-merlin', 'olympus-medusa', 'grimmwood-rumpelstiltskin',
          'grimmwood-snow-white', 'camelot-guinevere', 'olympus-apollo',
          'roma-augustus', 'takamagahara-izanagi', 'sherwood-maid-marian',
        ],
      },
      line: 'She deals twelve cards onto black stone. "You take one. Then I take one. The only cheating is pretending you did not want what you picked." She will steal the pieces your plan needs.',
      lock: 'Clear the Mid-Road',
      banProfile: {},
      banTell: 'She bans on whim as much as wisdom. No pattern on record - and she knows the ledger looks.',
      grants: { cards: ['yamato-kaguya', 'yamato-benkei'], coins: 160 },
      resultWin: 'The Trickster laughs until she nearly falls off her chair. "You picked for the future. Expensive."',
      resultLose: '"Every choice leaves another possible self across the table," she grins. "Mine was better."',
      barks: {
        start: '"New rules! I will explain them after they stop helping me."',
        firstBloodYou: '"Rude. I had plans for that one."',
        firstBloodFoe: '"See, THIS is why you read the table before you sit at it."',
        allyDown: '"You handed me that one three picks ago."',
        foeDown: '"Ugh. I LIKED that card."',
        foeHalf: '"Okay. Okay! I am adjusting the rules again."',
        foeLast: '"One card left in my hand. Care to guess it?"',
        playerLow: '"The Void keeps what you cannot pay for."',
      },
    },
    {
      id: 7,
      key: 'the-strategist',
      rival: 'The Strategist',
      portrait: 'assets/rivals/the-strategist.png',
      mode: 'draft',
      format: 'Draft',
      terrain: 'The Blood Battlefield',
      field: 'blood-battlefield',
      persona: 'strategist',
      personaJitter: 0.6,
      pool: {
        featured: 'roma',
        /* FROZEN POOL: the Strategist's table - kill chains, execute
           payoffs, and the walls that deny them. */
        cards: [
          'roma-spartacus', 'camelot-king-arthur', 'olympus-hercules',
          'sherwood-little-john', 'yamato-benkei', 'grimmwood-hansel-gretel',
          'roma-julius-caesar', 'camelot-lancelot', 'grimmwood-big-bad-wolf',
          'sherwood-guy-of-gisborne', 'sherwood-will-scarlet', 'yamato-minamoto-no-yoshitsune',
          'roma-brutus', 'sherwood-robin-hood', 'grimmwood-goldilocks',
          'grimmwood-puss-in-boots', 'camelot-mordred', 'yamato-tomoe-gozen',
          'roma-constantine-the-great', 'olympus-zeus', 'grimmwood-evil-queen',
          'takamagahara-amaterasu', 'yamato-kaguya', 'grimmwood-rapunzel',
          'roma-cicero', 'olympus-medusa', 'camelot-morgan-le-fay',
          'takamagahara-izanami', 'grimmwood-pied-piper', 'olympus-athena',
          'roma-augustus', 'grimmwood-snow-white', 'camelot-guinevere',
          'olympus-apollo', 'takamagahara-izanagi', 'grimmwood-cinderella',
        ],
      },
      line: 'An old man plots your habits on a wax board of violet lines. He drafts against what you are drafting, and every careless victory becomes a path to your next defeat.',
      lock: 'Clear The Trickster',
      banProfile: {},
      banTell: 'He finds the card your plan cannot live without and removes it. Have a second plan.',
      grants: { cards: ['roma-julius-caesar', 'roma-brutus'], coins: 160 },
      resultWin: 'He wipes the violet board clean with his sleeve. "Good. I hated being right."',
      resultLose: '"Every decision casts a shadow," he says, not unkindly. "I only walked along yours."',
      barks: {
        start: '"You will protect the center first. Then you will overcorrect."',
        firstBloodYou: '"An unpriced move. How irritating."',
        firstBloodFoe: '"That line was drawn four turns ago. You walked it anyway."',
        allyDown: '"A defeated echo is a path to another defeat. Watch."',
        foeDown: '"Acceptable loss. That phrase once cost me a city district."',
        foeHalf: '"The geometry is... shifting. Noted."',
        foeLast: '"One piece. Sufficient, if the pattern holds."',
        playerLow: '"Mercy is also a formation. You have chosen not to use it."',
      },
    },
    {
      id: 8,
      key: 'the-chronicler',
      rival: 'The Chronicler',
      portrait: 'assets/rivals/the-chronicler.png',
      mode: 'draft',
      format: 'Draft',
      terrain: 'The Spirit World',
      field: 'spirit-world',
      persona: 'chronicler',
      personaJitter: 3.2,
      pool: {
        featured: 'takamagahara',
        /* FROZEN POOL: the Chronicler's catalogue - burn, cleanse,
           Silence, and the bodies that must outlast them. */
        cards: [
          'takamagahara-susanoo', 'grimmwood-gingerbread-man', 'olympus-hercules',
          'yamato-benkei', 'yamato-momotaro', 'grimmwood-hansel-gretel',
          'grimmwood-big-bad-wolf', 'grimmwood-red-riding-hood', 'camelot-lancelot',
          'olympus-ares', 'roma-julius-caesar', 'sherwood-will-scarlet',
          'sherwood-robin-hood', 'grimmwood-goldilocks', 'grimmwood-puss-in-boots',
          'camelot-mordred', 'roma-brutus', 'yamato-tomoe-gozen',
          'takamagahara-amaterasu', 'takamagahara-tsukuyomi', 'grimmwood-evil-queen',
          'olympus-zeus', 'grimmwood-rapunzel', 'yamato-kaguya',
          'takamagahara-izanami', 'takamagahara-inari', 'grimmwood-rumpelstiltskin',
          'sherwood-friar-tuck', 'camelot-merlin', 'grimmwood-pied-piper',
          'takamagahara-izanagi', 'grimmwood-snow-white', 'grimmwood-cinderella',
          'camelot-guinevere', 'olympus-apollo', 'sherwood-maid-marian',
        ],
      },
      line: 'In a wall-less library beneath cold stars, an archivist drafts the curve and hoards answers. They burn you out, cleanse themselves clean, and write down everyone who disappoints them.',
      lock: 'Clear The Strategist',
      banProfile: {},
      banTell: 'The Chronicler strikes what your story leans on - enough endings read to know a load-bearing hero on sight.',
      grants: { cards: ['takamagahara-amaterasu', 'takamagahara-izanami'], coins: 160 },
      resultWin: 'The Chronicler closes the book on a page that refuses to stay blank. "Continuing," they write.',
      resultLose: '"I have shelved this outcome before," the Chronicler sighs. "Try a different edition."',
      barks: {
        start: '"You took your time. The Road is patient. I am a schedule."',
        firstBloodYou: '"Noted. Margin, red ink."',
        firstBloodFoe: '"That name goes in the ledger of the briefly promising."',
        allyDown: '"Every life leaves clutter. That one left less than most."',
        foeDown: '"Deceased. Filed. Next."',
        foeHalf: '"You are editing my collection. Stop it."',
        foeLast: '"The last witness. Be careful what you make them watch."',
        playerLow: '"When does preserving something become changing it? Look at your line and answer."',
      },
    },
    {
      id: 9,
      key: 'the-last-guardian',
      rival: 'The Last Guardian',
      portrait: 'assets/rivals/the-last-guardian.png',
      mode: 'set',
      format: 'Unabridged - Three gates',
      terrain: 'Void - Battlefield - Spirit World',
      fightCard: ['energy-void', 'blood-battlefield', 'spirit-world'],
      line: 'Before the bronze threshold stands a guardian who does not speak. Best of three across the ground you have already walked. Every road has one gate that does not speak.',
      lock: 'Clear The Chronicler',
      /* 4/4/4 across the late-taught factions (R8). She holds the door;
         the deck is a wall with two executioners behind it. */
      /* Soak-tuned 2026-08-09: 23% vs the ~40% target with Abe no Seimei
         anchoring - the legendary diviner sits out; the door still holds. */
      enemy12: [
        'yamato-minamoto-no-yoshitsune',
        'yamato-benkei',
        'yamato-tomoe-gozen',
        'yamato-momotaro',
        'roma-julius-caesar',
        'roma-spartacus',
        'roma-brutus',
        'roma-augustus',
        'takamagahara-tsukuyomi',
        'takamagahara-izanami',
        'takamagahara-susanoo',
        'takamagahara-izanagi',
      ],
      factionMix: { yamato: 4, roma: 4, takamagahara: 4 },
      banProfile: { stat: 'atk' },
      banTell: 'She bans your heaviest hitters, every time. Power draws her eye; bring subtlety.',
      grants: {
        choice: { count: 2, factions: ['camelot', 'sherwood', 'olympus', 'yamato', 'roma', 'takamagahara'] },
        coins: 220,
      },
      resultWin: 'The Guardian speaks, voice rough with disuse: "Then carry it." The gate opens.',
      resultLose: 'The Guardian shakes her head once, and the gate stays shut. She will be here.',
      barks: {
        /* she does not speak - her barks are stage direction, not lines */
        start: 'The Guardian makes a sign with two fingers: I knew you would come.',
        start2: 'The Guardian resets her stance exactly. The door has not moved either.',
        start3: 'The Guardian tightens her grip on the wooden key. Last gate.',
        firstBloodYou: 'The Guardian nods once - approval, or a warning.',
        firstBloodFoe: 'The Guardian points to the dark wound in the gate, then makes a fist.',
        allyDown: 'The Guardian watches the echo fade. She has watched worse, for longer.',
        foeDown: 'The Guardian does not glance at her fallen. The door is all there is.',
        foeHalf: 'The Guardian plants her feet. Centuries of holding a door do not shift easily.',
        foeLast: 'The Guardian alone now, hand over the keyhole.',
        playerLow: 'The Guardian signs, slowly: an unfinished story is a door.',
      },
    },
    {
      id: 10,
      key: 'gilgamesh',
      rival: 'Gilgamesh',
      portrait: 'assets/rivals/gilgamesh.png',
      mode: 'set',
      format: 'Unabridged - Final judgment',
      terrain: "The Legend's Trial - Ruins - Mirror Realm",
      fightCard: ['heros-trial', 'ancient-ruins', 'mirror-realm'],
      line: 'The First King stands beside the great scales. He cannot be banned and he will not be benched - and the scales give life back: Isis walks with him. Beat the set, not one deck.',
      lock: 'Clear The Last Guardian',
      /* Duat's whole court + the wall Duat cannot field itself (§5
         trap 2) + the boss. Isis IS in the twelve - the chapter's only
         revive as the intended final twist, telegraphed on the card. */
      enemy12: [
        'campaign-gilgamesh',
        'duat-anubis',
        'duat-horus',
        'duat-maat',
        'duat-sekhmet',
        'duat-isis',
        'duat-nephthys',
        'roma-spartacus',
        'takamagahara-susanoo',
        'camelot-lancelot',
        'yamato-abe-no-seimei',
        'sherwood-robin-hood',
      ],
      factionMix: { 'first-legend': 1, duat: 6, roma: 1, takamagahara: 1, camelot: 1, yamato: 1, sherwood: 1 },
      pinned: ['campaign-gilgamesh'],
      unbannable: ['campaign-gilgamesh'],
      banProfile: { power: true },
      banTell: 'He strikes crowns: whatever is mightiest in your twelve, plan to fight without it. His own name cannot be struck at all.',
      grants: { cards: ['duat-isis', 'duat-anubis'], coins: 400 },
      resultWin: 'The scales balance. Gilgamesh bows his head. "Your story deserves to last."',
      resultLose: '"Death is not a mistake," Gilgamesh says. "Neither is losing. Come back when you know the difference."',
      barks: {
        start: '"Power. What you can do. Show me."',
        start2: '"Memory. What remains after you are gone. Show me."',
        start3: '"Self. What you become when no one is watching. Show me."',
        firstBloodYou: '"So the blank line has teeth. Enkidu would have liked you."',
        firstBloodFoe: '"The scales tip early. They usually correct themselves."',
        allyDown: '"Everything I loved, I outlived. Do not make my collection larger."',
        foeDown: '"Another witness gone. The hall remembers every one."',
        foeHalf: '"I crossed deserts, seas, graves and gods. You will need more than momentum."',
        foeLast: '"Now it is only me. It has been only me for a very long time."',
        playerLow: '"A story held too tightly becomes a prison. Loosen your grip and fight."',
        rivalRevive: '"The scales give life back. I told you they would."',
      },
    },
  ];

  /* ---------------------------------------------------------
     DIALOGUE - pre-fight scenes, one per stage.
     Delivered by the bottom dialogue bar (never a centre modal).
     The last line carries battle:true to launch the gate.
     Voice notes, per the chapter lore: mythic, warm, a little wry -
     short lines, strong images, and every guardian gets exactly one
     knife hidden in the warmth.
     --------------------------------------------------------- */
  var DIALOGUES = {
    1: [
      { speaker: 'The Recruiter', text: '"Name?"' },
      {
        speaker: 'The Wayfarer',
        text: 'Nothing comes. You remember hands. A road. The precise ache of losing something important. The name itself is simply... gone.',
      },
      {
        speaker: 'The Recruiter',
        text: '"Ah. That kind." He writes a blank line in the ledger, unhurried. "Hundreds of names in this book. Crossed out in red - devoured. Underlined in gold - continuing. Yours is the first blank I have written in a very long age."',
      },
      {
        speaker: 'The Recruiter',
        text: '"You are not exactly dead. You are not exactly alive either, which is why we must be quick - the thorns out there eat the undecided."',
      },
      {
        speaker: 'The Recruiter',
        text: '"Every Echo believes this road ends in immortality. Wrong. The Road is a question asked ten different ways: does your story deserve to last - and do you know the difference between lasting and refusing to end?"',
      },
      {
        speaker: 'The Recruiter',
        text: 'He presses a brass coin into your palm. A road on one face; an empty chair on the other. "What does it buy?" you ask. "Possibilities, if you are lucky. Regrets, if you are not."',
      },
      {
        speaker: 'The Recruiter',
        text: '"The first gate is mine, and I do not trick the new - I will walk you through the war myself. Every ban, every rank, every drop of first blood. All the gate asks is that you survive yourself."',
        battle: true,
        final: true,
      },
    ],
    2: [
      {
        speaker: 'The Wayfarer',
        text: 'Old shields are nailed to the cliff walls in rows, each carrying a single sentence. I WILL RETURN. I WILL HOLD. I WILL NOT LEAVE YOU.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '"Do not read those too long," says the old soldier, not looking up from the strap he is mending. "Every one of them was kept too late. Including mine."',
      },
      {
        speaker: 'The Oathkeeper',
        text: '"The Road says you have no name. A dangerous freedom, that. No name means no one has made a promise about you yet. No promise means none broken. I almost envy you."',
      },
      { speaker: 'The Wayfarer', text: '"What did they call you, before?"' },
      {
        speaker: 'The Oathkeeper',
        text: '"Too Late." He lets that sit. "I promised forty-three people I would bring them home. I brought twelve. For years I told myself the oath died with the others - then this road taught me an oath does not die just because everyone who heard it did."',
      },
      {
        speaker: 'The Oathkeeper',
        text: 'He stands - slowly, not from weakness but from economy - and lifts the shield. "A wall is not built to keep danger out, child. It is built to tell danger where it must stop. Nothing touches your back line while I stand. So do the arithmetic: go through me."',
        battle: true,
        final: true,
      },
    ],
    3: [
      {
        speaker: 'The Wayfarer',
        text: 'A rifle cracks. The stone at your feet splits clean in two. "Too slow," calls a cheerful voice from the watchtree.',
      },
      {
        speaker: 'The Outlaw',
        text: '"Relax, Blank. If I wanted you dead you would have been a footnote back at the pass. The Recruiter walks slow and I get bored." She swings down, rifle across her shoulders like a yoke.',
      },
      {
        speaker: 'The Outlaw',
        text: '"Here is my science. Every warband has a favorite - a king, a bright one, a loud one. Everyone swears they love the whole company. Then I put a sight on the centre of their pride, and we find out what the love is made of."',
      },
      { speaker: 'The Wayfarer', text: '"Why?"' },
      {
        speaker: 'The Outlaw',
        text: '"My father kept a bookshop. When the soldiers came they did not burn the books first - they burned the RECORDS. The pages that said which books belonged to whom. Names in large type survived. The rest of us were scenery." Her smile thins. "So I shoot the large type, and the scenery remembers it has hands."',
      },
      {
        speaker: 'The Outlaw',
        text: 'She taps the brass tube sight. "Protect your brightest echo, or dangle it as bait - either answer tells me something true. Ready when you are. You are my favorite this season, and I always shoot my favorites first."',
        battle: true,
        final: true,
      },
    ],
    4: [
      {
        speaker: 'The Wayfarer',
        text: 'The spring turns the cave ceiling into a second, wavering sky. Light moves through the rings of a bronze astrolabe - and a gold circle blooms beneath your wolf. It snarls.',
      },
      { speaker: 'The Anointed', text: '"A mark. Not a curse. Not yet."' },
      {
        speaker: 'The Anointed',
        text: 'You reach for the wolf. "Do not," she says - and you stop, because her voice holds no threat at all. Only certainty. "Watch."',
      },
      {
        speaker: 'The Anointed',
        text: '"In my first life I was taught that warning is mercy. A physician marks the wound before she cuts. A judge marks the guilty before the sentence. A mark is a promise: I see you. I am coming. Prepare."',
      },
      {
        speaker: 'The Anointed',
        text: '"Then I learned that people who love power also love deciding who wears the circle. My city called me too useful to be allowed to doubt." The circle under the wolf brightens. "So now I doubt professionally."',
      },
      {
        speaker: 'The Anointed',
        text: '"Read my promises, Wayfarer. Every one will be kept - on schedule, politely. Whether a promise becomes a prophecy is the only part that belongs to you."',
        battle: true,
        final: true,
      },
    ],
    5: [
      {
        speaker: 'The Wayfarer',
        text: 'Three toll arches lean over a paved square: rain falls through one, sun through the second, wind strips grass through the third. On the middle gate hangs a brass plaque with no name. Only a question. WHAT DO YOU WANT TO OUTLIVE?',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'The Warden pours tea into four cups, though only three of you are present. You look at the extra cup. "For whom?" - "For the person you were before you arrived." Her voice holds no cruelty. That makes it worse.',
      },
      { speaker: 'The Wayfarer', text: '"What is the Road? Truly."' },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '"Not a ladder. Not a tournament. Not even a judgement, though the First Legend enjoys the word. It is what was built because too many echoes did not know what to do after their stories ended."',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '"Some become tyrants of their own old victories. Some become ghosts wearing their greatest wound like a crown. Some grow hungry enough to erase other stories just to make room. The Road teaches carrying instead. The guardians are not gatekeepers - we reached a door and chose to stay, because someone had to, once the Road began to break."',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '"And you should know: you are not an Echo in the ordinary sense. Echoes arrive carrying an ending. You arrived carrying an absence. Gilgamesh has waited for a blank line longer than I have stood this watch."',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'She takes up the unlit signal lantern. "Now bring twelve you chose yourself - the Road stops lending its hand at my table. Three gates. Best of three. Substitutions are law, and there is NO RETREAT once it begins."',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '"The lesson is not whether you can win once. It is whether you can change after winning. Most cannot. Prove me wrong and I will pour the fourth cup out myself."',
        battle: true,
        final: true,
      },
    ],
    6: [
      {
        speaker: 'The Trickster',
        text: '"FINALLY. A blank person!" The gambler kicks her boots off the table. "I was starting to think the Road had become a retirement home with better lighting."',
      },
      {
        speaker: 'The Wayfarer',
        text: 'Cards drift through the violet dark around her table - swords never drawn, promises never spoken, names never chosen for children never born. She fans a hand of them onto the black stone.',
      },
      {
        speaker: 'The Trickster',
        text: '"House rules. The Road deals possible selves. You take one. Then I take one. Then you take one. The only cheating on this table is pretending you did not want what you picked."',
      },
      { speaker: 'The Wayfarer', text: '"What happened to you?"' },
      {
        speaker: 'The Trickster',
        text: '"Rude." A pause. "Fine. In my first story I was the hero\'s sister. I had three lines. \'Brother, be careful.\' \'Brother, come home.\' The third was never printed." She shuffles without looking. "So I learned to deal myself into other stories. Now I have ALL the lines."',
      },
      {
        speaker: 'The Trickster',
        text: '"Fair warning, Blank: whatever your pretty plan needs, I intend to be holding it. Draft like someone is robbing you." She grins. "Someone is."',
        battle: true,
        final: true,
      },
    ],
    7: [
      {
        speaker: 'The Strategist',
        text: 'The old man does not look up from his wax board. "You will protect the centre first. Then you will overcorrect. Then you will discover that mercy is also a formation."',
      },
      { speaker: 'The Wayfarer', text: '"How do you know that?"' },
      {
        speaker: 'The Strategist',
        text: '"Because every decision casts a shadow. You call it choice, since you can only see the hand that makes it. I call it geometry - I can see the lines afterward." He tilts the board: violet paths cross and recross. Some end in small circles. Some end in ash.',
      },
      {
        speaker: 'The Strategist',
        text: '"In my life I advised a city at war. I was very good. I saved it - by choosing which villages burned first. They minted coins with my face on them." The wind tugs his purple mantle. "Praise is not acquittal. That is why I am here."',
      },
      {
        speaker: 'The Strategist',
        text: '"We will draft now. Understand me: I will not be drafting cards. I will be drafting your habits." He wipes a corner of the board clean, making room for you. "Prove the pattern is not destiny. I would love to be wrong twice in one century."',
        battle: true,
        final: true,
      },
    ],
    8: [
      {
        speaker: 'The Chronicler',
        text: '"You took your time." - "The Road is long," you say. "No. The Road is patient. You are the one taking time."',
      },
      {
        speaker: 'The Chronicler',
        text: 'They turn a book toward you. Its pages are blank. "This is you. There should be an origin. An ending. Witnesses, revisions, contradictions - every life leaves clutter. You have none. I wrote on your page once, in my own ink." A pause. "The ink vanished."',
      },
      {
        speaker: 'The Chronicler',
        text: '"There is a hunger outside the Road. We call it the Quiet. It does not kill stories - killing would be simpler. It removes the part that makes anyone CARE the story existed."',
      },
      {
        speaker: 'The Chronicler',
        text: '"A town remembers it had a king, but not his name. A woman remembers loving someone, but not whom. A song keeps its melody and loses every word. Emptiness is greedy - and you, Blank, smell like its favorite meal."',
      },
      {
        speaker: 'The Chronicler',
        text: 'They set the pen down with terrible care. "I have seen a page like yours exactly once before. A guardian. Before she became the Last."',
      },
      {
        speaker: 'The Chronicler',
        text: '"So. I will burn what is already hurt. I will cleanse what has been poisoned. I will silence what might become dangerous. If you are worth the shelf space, prove it against the full catalogue."',
        battle: true,
        final: true,
      },
    ],
    9: [
      {
        speaker: 'The Wayfarer',
        text: 'The final gate stands at the end of every road at once. Behind you the ground remembers everywhere you have walked - colosseum, pass, plains. Before the gate waits a woman in scarred armor, a wooden key taller than her shoulder strapped across her back. She does not speak.',
      },
      {
        speaker: 'The Recruiter',
        text: 'The Guardian signs with two fingers, then two more. The Recruiter translates softly. "She says: I knew you would come."',
      },
      {
        speaker: 'The Recruiter',
        text: '"She was like you, once. A living story. The Quiet found her world before her ending could be written - the Road took what it could save."',
      },
      {
        speaker: 'The Recruiter',
        text: '"She reached this gate and learned her name was the last thread tying the Quiet to her old life. She cut it. Not to be forgotten - to keep the forgetting from crossing after her. Do not ask her for your name. Ask her what she gave up to keep hers, and she will show you the answer holding a door shut."',
      },
      {
        speaker: 'The Recruiter',
        text: 'The Guardian points at you. Then at the thin dark wound running down the centre of the gate. Then she makes a fist. "She says the Quiet followed you. Not because you are weak - because an unfinished story is a door."',
      },
      {
        speaker: 'The Recruiter',
        text: 'She raises the wooden key like a bar across the road. Three fields. Best of three. No taunts will come, and no warnings. The gate does not negotiate.',
        battle: true,
        final: true,
      },
    ],
    10: [
      {
        speaker: 'The Wayfarer',
        text: 'He is not sitting on the throne. He stands beside it, like a man long tired of ceremonies he himself invented. At the centre of the hall: scales large enough to weigh a city. On one pan, a cedar tablet. On the other - nothing.',
      },
      {
        speaker: 'Gilgamesh',
        text: '"Wayfarer." The name is not a name. It is an acknowledgement of the space where one should be. "I know what you are not. That is often the beginning."',
      },
      {
        speaker: 'Gilgamesh',
        text: '"I loved a man named Enkidu. When he died I decided the world had made an error, and I crossed deserts, seas, graves and gods to file my complaint. The answer was no. Death is not a mistake. I hated the answer - so I asked a different question."',
      },
      { speaker: 'Gilgamesh', text: '"What if nothing were ever forgotten?"' },
      { speaker: 'The Wayfarer', text: '"The Quiet."' },
      {
        speaker: 'Gilgamesh',
        text: '"My question, grown teeth." He does not flinch from it. "Memory without mercy becomes hunger. A story held too tightly becomes a prison. I built the Road to teach legends to be carried by the living - not to devour them. You are the first blank line ever to reach the tenth gate."',
      },
      {
        speaker: 'Gilgamesh',
        text: 'Three doors open in the hall. "Power - what you can do. Memory - what remains when you are gone. Self - what you become when no one is watching. I fight in all three. I cannot be banned from my own judgement, and the scales walk with me. They give life back. That is not a threat; it is a schedule."',
      },
      {
        speaker: 'Gilgamesh',
        text: '"You want your name. I know. If I hand it to you, you will wear it because a king said it was yours - and that is not a name, that is a chain. Take it from my hands the only way that means anything." He steps away from the throne. "The trial remains."',
        battle: true,
        final: true,
      },
    ],
  };

  /* ---------------------------------------------------------
     EPILOGUES - played on the settled result screen after a win,
     before the road returns to the map. The grant beat rides here:
     under R4 the reward IS the story ("their echo walks with you").
     --------------------------------------------------------- */
  var EPILOGUES = {
    1: [
      {
        speaker: 'The Recruiter',
        text: 'The old man closes the ledger - then thinks better of it and opens it again. "Hansel and Gretel: banned, and furious about it. Cinderella: banned, and gracious about it. It is always the ones who promise happy endings who fight hardest when someone tries to delete them."',
      },
      {
        speaker: 'The Wayfarer',
        text: 'Beneath your blank line, in a handwriting that is not his, one word has appeared. CONTINUING.',
      },
      {
        speaker: 'The Recruiter',
        text: '"I did not write that," he says quietly. "The Road did." He packs the lantern. "The Oathkeeper holds the pass ahead. He has been arguing with a wall for two hundred years - go lose the argument politely, and mind the shields. They read back."',
        final: true,
      },
    ],
    2: [
      {
        speaker: 'The Oathkeeper',
        text: 'He unwinds the white oath sash from beneath his armor - repaired so many times that no original thread remains - and cuts it in two without hesitating. He has clearly rehearsed letting go.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '"Two of mine walk with you now. The king who holds. The knight who answers. Do not spend them on doors that open politely." King Arthur and Lancelot join your echoes.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '"Strength is the cheapest thing on this road - every dead man had some. Deciding what it is FOR: that is the toll." He sits back down to his mending. "The Outlaw is next. She will test your convictions from four hundred paces. Walk in zigzags."',
        final: true,
      },
    ],
    3: [
      {
        speaker: 'The Outlaw',
        text: 'She cleans the rifle with a strip of blue cloth and does not look at you. "A street of bookshop records burns in about a minute. Did you know that? A whole neighborhood of WHO OWNS WHAT. One minute."',
      },
      {
        speaker: 'The Outlaw',
        text: '"Take the archer and the big man. One knows how to aim. One knows how to stand beside an aim without becoming its shadow." Robin Hood and Little John walk with you now.',
      },
      {
        speaker: 'The Outlaw',
        text: '"The Anointed is next - and her marks are worse than my bullets. Bullets are honest. A mark tells you exactly what will happen, then waits to see if you are fool enough to allow it." She reloads with exaggerated care. "Don\'t be. I want a rematch someday."',
        final: true,
      },
    ],
    4: [
      {
        speaker: 'The Anointed',
        text: 'At the end, the Anointed turns the astrolabe on herself. The circle at her feet glows gold - then goes dark, unanswered. "I was marked once. My city said I had become too useful to be allowed to doubt. The Road let me keep the difference between usefulness and obedience. It is the only thing I carried out."',
      },
      {
        speaker: 'The Anointed',
        text: '"Take the stormfather and the strong one. Zeus sets the promise and keeps it in the same breath - study that until it stops impressing you." Zeus and Hercules join your echoes.',
      },
      {
        speaker: 'The Anointed',
        text: 'The pool drains from the centre platform, revealing a stair. At its base wait three doors, and on the middle one a brass plaque with no name - only a question. WHAT DO YOU WANT TO OUTLIVE? "Answer carefully," she says. "The Warden collects answers the way I collect promises."',
        final: true,
      },
    ],
    5: [
      {
        speaker: 'The Warden of the Mid-Road',
        text: '"You changed between the gates. Most arrive with one answer and beat it against all three doors until something breaks." She lays the iron key on the table like a verdict. "You do not want immortality yet. Good. Wanting it too early ruins people - I keep the graves that prove it."',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'She offers two choice-echoes, their shapes flickering in your palm - a knight, an archer, a healer, a stormbearer. "Choose what you will carry. Not because it is strongest. Because it will change what you become."',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'The fourth gate opens without being touched. From somewhere beyond it comes laughter - bright, young, entirely unafraid. The Warden closes her eyes briefly. "The Trickster has decided the Road is getting serious. My condolences to you both."',
        final: true,
      },
    ],
    6: [
      {
        speaker: 'The Trickster',
        text: 'She pays up without sulking: two Yamato echoes, and a small lacquered tile with no image on either side. "What is it?" - "A reminder that every road forks before you can see it. And that someone keeps records of which fork you chose."',
      },
      {
        speaker: 'The Trickster',
        text: 'For one moment the grin goes out entirely. "The Strategist will tell you choice is a pattern. Charming man. He buried a hundred thousand people inside his arithmetic and it BALANCED." The grin returns, sharpened. "Do not let him convince you the pattern is destiny. I bet him you wouldn\'t."',
        final: true,
      },
    ],
    7: [
      {
        speaker: 'The Strategist',
        text: 'He wipes the violet board clean with his sleeve - a century of predicted futures, gone in one motion. "Good," he says. "I hated being right."',
      },
      {
        speaker: 'The Strategist',
        text: '"Take Caesar and Brutus. Caesar ends what he starts. Brutus ends what Caesar starts. Between them you will learn what a kill is worth BEFORE you pay for it, which is the only time the price can be argued."',
      },
      {
        speaker: 'The Strategist',
        text: 'He presses a small brass measuring pin into your hand. "Take this to the Chronicler. She will know why your line does not begin where it should." - "Will she tell me?" - "She will tell you far too much. It is her only kindness."',
        final: true,
      },
    ],
    8: [
      {
        speaker: 'The Wayfarer',
        text: 'When the mist settles, a book lies open on the ground where no book fell. Inside is a single sentence. THE ONE WHO ARRIVES WITHOUT AN ENDING CAN OPEN WHAT THE DEAD CANNOT.',
      },
      {
        speaker: 'The Chronicler',
        text: 'The Chronicler goes pale beneath the ash tone of their skin. "That page was sealed." - "By whom?" - "Gilgamesh." The rootless trees shiver without wind. Somewhere very far away, something notices that it has been named.',
      },
      {
        speaker: 'The Chronicler',
        text: 'They tear the page free, far too late, and press two Takamagahara echoes into your hands - the dawn and the dusk. "Go to the Last Guardian. Do not ask her for your name. Ask her what she gave up to keep hers."',
        final: true,
      },
    ],
    9: [
      {
        speaker: 'The Wayfarer',
        text: 'At the last moment there was an opening at her side, and you both knew it. You did not take it. You lowered your weapon, lifted the wooden key from her back, and held it out to her.',
      },
      {
        speaker: 'The Wayfarer',
        text: '"I do not know my name," you said. "But I know what it is for now."',
      },
      {
        speaker: 'The Last Guardian',
        text: 'She put her hand over yours on the key. And for the first time in centuries she spoke, her voice rough as a rusted hinge. "Then carry it." The gate opened - and the Quiet recoiled from the sound of a name she did not say.',
      },
      {
        speaker: 'The Wayfarer',
        text: 'Beyond the threshold waits a hall of scales, large enough to weigh a city. Choose the echoes who walk with you. It is the last choice before the throne.',
        final: true,
      },
    ],
    10: [
      {
        speaker: 'The Wayfarer',
        text: 'On one pan of the great scales rests the cedar tablet. Onto the other, the road lays itself down: a brass coin, a torn sash, a strip of blue cloth, an astrolabe ring, an iron key, a blank tile, a measuring pin, a torn page - and an unspoken silence. The scales balance.',
      },
      {
        speaker: 'Gilgamesh',
        text: 'Gilgamesh bows his head. "Your story deserves to last." From him it does not sound like a verdict. It sounds like an apology, accepted at last.',
      },
      {
        speaker: 'Gilgamesh',
        text: '"Two witnesses go with you. The scale that gives life back. The jackal that closes accounts." Isis and Anubis join your echoes. "Not rewards, Wayfarer. Witnesses."',
      },
      {
        speaker: 'Gilgamesh',
        text: 'A final gate opens behind the throne: mud brick, bronze, river light, impossible age. "Uruk," he says. And far back down the Road, at a folding table by the first bend, an old man in a moss-green coat watches the blank line in his ledger fill at last - not with a name. With a sentence.',
      },
      { speaker: 'The Wayfarer', text: 'THE STORY CONTINUES.', final: true },
    ],
  };

  window.EOL.campaignCh1 = {
    id: 'road-of-echoes',
    title: 'The Road of Echoes',
    subtitle: 'An unfinished story walks between memory and oblivion.',
    starterDeck: { id: 'starter-grimmwood', name: 'Grimmwood', faction: 'grimmwood' },
    bossFaction: BOSS_FACTION,
    bossCard: GILGAMESH,
    stages: STAGES,
    dialogues: DIALOGUES,
    epilogues: EPILOGUES,
    /* THE FIRST-BOOT TUTORIAL - the Recruiter interrupts the main menu
       once (and whenever the Tutorial button asks), then POINTS the
       player down the road to Gate I instead of teleporting them:
       skipping the scene still starts the wayfinder below. */
    intro: [
      {
        speaker: 'The Recruiter',
        text: '"There you are. No, do not look behind you - the thorns can smell new, and you, friend, positively reek of it."',
      },
      {
        speaker: 'The Recruiter',
        text: '"This world runs on wars of six: twelve legends to a ledger, two struck out before a blow lands, six on the field, and an arena with opinions of its own. Nobody learns swimming from the shore."',
      },
      {
        speaker: 'The Recruiter',
        text: '"So - the Road. Ten gates, ten teachers, and the first gate is mine: I walk you through every rule myself, and nobody has ever died at my gate twice." He lifts the lantern. "Come along, Blank."',
        final: true,
      },
    ],
    /* THE WAYFINDER - one line per screen on the road to Gate I.
       The orchestrator (js/campaign.js) shows whichever line matches
       the player's current view and pulses the button it points at;
       the player does every click themselves. Keyed by view, plus
       'solo' for the odd case where the Multiplayer tab is selected. */
    guide: {
      home: 'No teleporting on my road - you walk it. See the big PLAY button by the crest? Press it.',
      solo: 'Wrong side of the hall, friend - the Road is walked alone. Step back to the Singleplayer tab.',
      play: 'The compass card - CAMPAIGN. Ten gates, ten teachers, and the first one is mine. Take the road.',
      campaign: 'There it is: Chapter 1, The Road of Echoes. Open the chapter and count the gates yourself.',
      chapter: 'Gate I - the plate with my face on it. Knock, and we will talk terms in the Colosseum.',
    },
    /* Back-compat aliases (older callers referenced these names). */
    recruiterDialogue: DIALOGUES[1],
    epilogue: EPILOGUES[1],
  };
})();
