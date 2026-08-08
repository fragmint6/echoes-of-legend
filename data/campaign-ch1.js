/* =============================================================
   Echoes of Legend — Campaign Chapter 1 Data: "The Road of Echoes"
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
    stats: { hp: 6650, atk: 1690, def: 25 },
    unbannable: true,
    pinned: true,
    icon: 'ra-crown',
    art: 'assets/rivals/gilgamesh.png',
    ability: {
      type: 'Active',
      name: 'He Who Saw the Deep',
      cost: 50,
      text:
        'Deal <b>150% ATK Light Damage</b>. If the target is below <b>30% HP</b>, ' +
        'instead deal <b>300% ATK</b> — the scales have already decided. Each cast, ' +
        'Gilgamesh permanently gains <b>10% ATK</b>: kingship that outlasts.',
      note: 'Max: 5 growth stacks.',
      spec: {
        target: { side: 'enemy', pick: 'single', row: 'any' },
        effects: [
          {
            k: 'branch',
            cond: { targetHpBelow: 0.3 },
            then: [{ k: 'dmg', power: 3.0, element: 'Light' }],
            other: [{ k: 'dmg', power: 1.5, element: 'Light' }],
          },
          {
            k: 'stat',
            stat: 'atk',
            amt: 10,
            turns: 99,
            to: 'self',
            stackTag: 'saw-the-deep',
            maxStacks: 5,
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
      format: 'Classic · Guided gate',
      terrain: 'The Colosseum',
      field: 'colosseum',
      line: 'An old memory broker opens a weathered ledger and writes a blank line. He fights to measure you, not to beat you — and he walks you through every law of the war himself: the bans, the ranks, the first blood. Plays it straight. Nothing hidden.',
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
        six: [
          'grimmwood-gingerbread-man',
          'grimmwood-big-bad-wolf',
          'grimmwood-red-riding-hood',
          'grimmwood-snow-white',
          'grimmwood-evil-queen',
          'grimmwood-goldilocks',
        ],
        hintBan: 'The Recruiter taps the ledger — “Those two. Take my crown pieces.”',
        hintSix: 'The Recruiter shakes his head — “The marked six. Trust the ledger this once.”',
      },
      tutorial: {
        intro: [
          'Preparation. Two ledgers of twelve — mine on the right, yours on the left. Nobody fights with all twelve; wars are won by what you agree to leave out.',
          'First law: the bans. You strike two of MY legends out of the fight, and I strike two of yours. Simultaneous. Sealed. No peeking. Honest politics — the only kind left.',
        ],
        ban0: 'Strike my two crown pieces — Rumpelstiltskin and the Evil Queen. Never leave a legendary standing out of politeness. They are marked; tap them.',
        ban1: 'One down. The Evil Queen has noticed, and she is not flattered. Cross her out too.',
        ban2: 'Ruthless. I approve. Now press CONFIRM BANS — mine were written before you sat down.',
        reveal: 'There. I took your candle-children and your midnight girl. A ban is a question: what can you not live without? Remember how this feels, and do it to everyone after me.',
        field: 'Field six of your surviving ten — the ledger marks the lesson six: a wall, two sets of teeth, a healer, a witch, a rifle. Tap each marked card. {n} to go.',
        rows: 'Study the rows. FRONT soaks the blows — your Gingerbread Man and both wolves’ teeth. BACK works in peace — healer, witch, dead-eye. Tap a fielded legend to swap its row. A naked back line is how snipers get famous.',
        toBattle: 'Press TO BATTLE when your hand stops shaking. Mine did too, eventually. About a century in.',
        rounds: {
          1: [
            'Round one: BASICS only. Every legend knows one plain trick — the signatures wake in round two. Even legends stretch first.',
            'The tall bar by your crest is ENERGY. Every skill spends it, and what you save carries over. Income grows each round: 60, then 80, then 100.',
            'Tap one of your six, choose a skill, choose a victim. And when nothing is worth doing — PASS. Hoarding Energy is also a move. Often the best one.',
          ],
          2: [
            'Round two — SIGNATURES unlock. The theatrical ones. Watch my Energy bar: when it runs fat, assume I am saving for something impolite.',
          ],
          4: [
            'Round four. From here the Road sharpens every blade — attacks grow crueller each round. It despises stalemates. Finish what you started.',
          ],
        },
      },
      grants: { coins: 100 },
      resultWin: 'The Recruiter closes his ledger — Gate I is yours.',
      resultLose: 'The Recruiter sets down his quill. “The road will still be here. So, unfortunately, will I.”',
      barks: {
        start: '“I will not trick you. The Road has enough of that ahead.”',
        firstBloodYou:
          '“First blood to you. Do not smile yet — the outnumbered side earns bonus Energy every round. The Road pays its wounded.”',
        firstBloodFoe:
          '“First blood to me. Steady. Fewer heroes means fewer turns — but the Road pays YOU bonus Energy now. Spend it angrily.”',
        allyDown: '“Another of yours gone. Each body lost is a turn lost every round. Guard the rest.”',
        foeHalf: '“Half my side, gone. When you outnumber a foe, PRESS — turns are the true currency.”',
        foeLast: '“One of mine left. Focus your fire, Blank. Mercy is for stories with endings.”',
        playerLow:
          '“Two standing. The comeback Energy is yours every round now — spend it like your last sentence. It may be.”',
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
      line: 'A scarred veteran mends his shield with iron wire and asks who your strength protects. Nothing reaches your back line while he stands — go through him.',
      lock: 'Clear The Recruiter',
      /* Camelot's whole hall plus a second wall: the pass narrows and
         he intends to BE the reason it matters. */
      enemy12: [
        'camelot-king-arthur',
        'camelot-lancelot',
        'camelot-merlin',
        'camelot-morgan-le-fay',
        'camelot-guinevere',
        'camelot-mordred',
        'yamato-benkei',
        'grimmwood-gingerbread-man',
        'yamato-momotaro',
        'sherwood-maid-marian',
        'sherwood-will-scarlet',
        'sherwood-friar-tuck',
      ],
      factionMix: { camelot: 6, yamato: 2, grimmwood: 1, sherwood: 3 },
      botSix: [
        'camelot-king-arthur',
        'yamato-benkei',
        'grimmwood-gingerbread-man',
        'camelot-guinevere',
        'camelot-mordred',
        'camelot-merlin',
      ],
      /* He tells you his oath before he swears it: your best back-line
         threat is taken at the gate. */
      banProfile: { roles: ['Sniper', 'Caster'], stat: 'atk' },
      grants: { cards: ['camelot-king-arthur', 'camelot-lancelot'], coins: 120 },
      resultWin: 'The Oathkeeper lowers his shield. “You saw the promise. Not the opening.”',
      resultLose: '“A wall is not cruelty,” the Oathkeeper says. “Come back and learn its shape.”',
      barks: {
        start: '“The pass narrows here. So do excuses.”',
        firstBloodYou: '“Through the shield. Good. That is the only honest road.”',
        firstBloodFoe: '“I told danger where it must stop. You crossed the line.”',
        allyDown: '“Who was protecting them? Think. Answer with your hands.”',
        foeDown: '“He held exactly as long as he was asked to. That is all a wall may promise.”',
        foeHalf: '“Forty-three. Twelve. I count everything, Wayfarer.”',
        foeLast: '“One shield left. It is enough. It has to be.”',
        playerLow: '“Your wall is breaking because it does not know what it defends.”',
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
      line: 'A rifle cracks from the watchtree. She always shoots your strongest legend — bait or bury them. Protect your brightest echo, or learn who you leave behind.',
      lock: 'Clear The Oathkeeper',
      enemy12: [
        'sherwood-robin-hood',
        'sherwood-guy-of-gisborne',
        'sherwood-will-scarlet',
        'sherwood-little-john',
        'sherwood-maid-marian',
        'sherwood-friar-tuck',
        'grimmwood-goldilocks',
        'yamato-tomoe-gozen',
        'grimmwood-puss-in-boots',
        'grimmwood-gingerbread-man',
        'grimmwood-snow-white',
        'grimmwood-red-riding-hood',
      ],
      factionMix: { sherwood: 6, grimmwood: 5, yamato: 1 },
      botSix: [
        'sherwood-robin-hood',
        'grimmwood-goldilocks',
        'yamato-tomoe-gozen',
        'sherwood-little-john',
        'sherwood-maid-marian',
        'sherwood-guy-of-gisborne',
      ],
      /* She bans your protectors, so the favourite stands in the open. */
      banProfile: { roles: ['Tank', 'Medic'] },
      grants: { cards: ['sherwood-robin-hood', 'sherwood-little-john'], coins: 120 },
      resultWin: '“Oh,” she says softly. “You protect the strong so they can protect the rest.”',
      resultLose: 'The Outlaw reloads without hurry. “The favorite ate the whole supper. Again?”',
      barks: {
        start: '“Every company has a favorite. Point them out or I will.”',
        firstBloodYou: '“Quick hands. My father would have sold you a book about them.”',
        firstBloodFoe: '“There is the large type. Now watch the scenery notice.”',
        allyDown: '“That one carried too much of your hope. I could tell from here.”',
        foeDown: '“Down. Watch how fast a company reorganizes its love.”',
        foeHalf: '“You are spending my arrows faster than I like.”',
        foeLast: '“Last shot in the tree. Make it interesting.”',
        playerLow: '“See? The favorite eats the whole supper.”',
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
        'olympus-zeus',
        'olympus-athena',
        'olympus-hercules',
        'olympus-apollo',
        'olympus-medusa',
        'olympus-ares',
        'roma-spartacus',
        'grimmwood-evil-queen',
        'grimmwood-big-bad-wolf',
        'yamato-kaguya',
        'camelot-mordred',
        'camelot-guinevere',
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
      grants: { cards: ['olympus-zeus', 'olympus-hercules'], coins: 140 },
      resultWin: 'The Anointed marks herself, and the circle goes dark. “You read the promise.”',
      resultLose: '“A warning can be mercy,” she says. “You treated it as noise.”',
      barks: {
        start: '“A mark. Not a curse. Not yet.”',
        firstBloodYou: '“You strike before the promise ripens. Interesting.”',
        firstBloodFoe: '“I see you. I am coming. Prepare — I did say so.”',
        allyDown: '“The circle closed. It always closes on the unprepared.”',
        foeDown: '“The circle closes where it pleases. Even on mine.”',
        foeHalf: '“Even a priestess can be weighed. Continue.”',
        foeLast: '“One vow left to keep.”',
        playerLow: '“A blade held very politely is still a blade.”',
      },
    },
    {
      id: 5,
      key: 'the-warden-of-the-mid-road',
      rival: 'The Warden of the Mid-Road',
      portrait: 'assets/rivals/the-warden-of-the-mid-road.png',
      mode: 'set',
      format: 'Unabridged · Three gates',
      terrain: 'Colosseum · Pass · Plains',
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
        'sherwood-friar-tuck',
        'olympus-zeus',
        'olympus-hercules',
        'olympus-medusa',
        'olympus-apollo',
      ],
      factionMix: { camelot: 4, sherwood: 4, olympus: 4 },
      /* No scripted six from here up: a set without sideboarding is
         not a set. The Warden fields adaptively and swaps in answers. */
      banProfile: {},
      grants: { choice: { count: 2, factions: ['camelot', 'sherwood', 'olympus'] }, coins: 220 },
      resultWin: 'The Warden lays the iron key on the table. “You changed after winning. Go on.”',
      resultLose: '“The Mid-Road keeps what does not adapt,” the Warden says. “Return ready.”',
      barks: {
        start: '“Three gates. Three battles. No retreat between them.”',
        start2: '“The second gate knows what you did at the first.”',
        start3: '“The last gate. Show me what you have unlearned.”',
        firstBloodYou: '“Recorded. The Road remembers openings.”',
        firstBloodFoe: '“Old answers become new problems. Adjust.”',
        allyDown: '“You carried that one too far on habit alone.”',
        foeDown: '“Noted. The next gate will not offer that trade twice.”',
        foeHalf: '“Good. Winning once was never the lesson.”',
        foeLast: '“Finish it properly. Sloppiness is a toll I collect.”',
        playerLow: '“This is where people stop pretending they are passing through.”',
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
      pool: { featured: 'yamato' },
      line: 'She deals twelve cards onto black stone. “You take one. Then I take one. The only cheating is pretending you did not want what you picked.” She will steal the pieces your plan needs.',
      lock: 'Clear the Mid-Road',
      banProfile: {},
      grants: { cards: ['yamato-kaguya', 'yamato-benkei'], coins: 160 },
      resultWin: 'The Trickster laughs until she nearly falls off her chair. “You picked for the future. Expensive.”',
      resultLose: '“Every choice leaves another possible self across the table,” she grins. “Mine was better.”',
      barks: {
        start: '“New rules! I will explain them after they stop helping me.”',
        firstBloodYou: '“Rude. I had plans for that one.”',
        firstBloodFoe: '“See, THIS is why you read the table before you sit at it.”',
        allyDown: '“You handed me that one three picks ago.”',
        foeDown: '“Ugh. I LIKED that card.”',
        foeHalf: '“Okay. Okay! I am adjusting the rules again.”',
        foeLast: '“One card left in my hand. Care to guess it?”',
        playerLow: '“The Void keeps what you cannot pay for.”',
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
      pool: { featured: 'roma' },
      line: 'An old man plots your habits on a wax board of violet lines. He drafts against what you are drafting, and every careless victory becomes a path to your next defeat.',
      lock: 'Clear The Trickster',
      banProfile: {},
      grants: { cards: ['roma-julius-caesar', 'roma-brutus'], coins: 160 },
      resultWin: 'He wipes the violet board clean with his sleeve. “Good. I hated being right.”',
      resultLose: '“Every decision casts a shadow,” he says, not unkindly. “I only walked along yours.”',
      barks: {
        start: '“You will protect the center first. Then you will overcorrect.”',
        firstBloodYou: '“An unpriced move. How irritating.”',
        firstBloodFoe: '“That line was drawn four turns ago. You walked it anyway.”',
        allyDown: '“A defeated echo is a path to another defeat. Watch.”',
        foeDown: '“Acceptable loss. That phrase once cost me a city district.”',
        foeHalf: '“The geometry is... shifting. Noted.”',
        foeLast: '“One piece. Sufficient, if the pattern holds.”',
        playerLow: '“Mercy is also a formation. You have chosen not to use it.”',
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
      pool: { featured: 'takamagahara' },
      line: 'In a wall-less library beneath cold stars, an archivist drafts the curve and hoards answers. They burn you out, cleanse themselves clean, and write down everyone who disappoints them.',
      lock: 'Clear The Strategist',
      banProfile: {},
      grants: { cards: ['takamagahara-amaterasu', 'takamagahara-izanami'], coins: 160 },
      resultWin: 'The Chronicler closes the book on a page that refuses to stay blank. “Continuing,” they write.',
      resultLose: '“I have shelved this outcome before,” the Chronicler sighs. “Try a different edition.”',
      barks: {
        start: '“You took your time. The Road is patient. I am a schedule.”',
        firstBloodYou: '“Noted. Margin, red ink.”',
        firstBloodFoe: '“That name goes in the ledger of the briefly promising.”',
        allyDown: '“Every life leaves clutter. That one left less than most.”',
        foeDown: '“Deceased. Filed. Next.”',
        foeHalf: '“You are editing my collection. Stop it.”',
        foeLast: '“The last witness. Be careful what you make them watch.”',
        playerLow: '“When does preserving something become changing it? Look at your line and answer.”',
      },
    },
    {
      id: 9,
      key: 'the-last-guardian',
      rival: 'The Last Guardian',
      portrait: 'assets/rivals/the-last-guardian.png',
      mode: 'set',
      format: 'Unabridged · Three gates',
      terrain: 'Void · Battlefield · Spirit World',
      fightCard: ['energy-void', 'blood-battlefield', 'spirit-world'],
      line: 'Before the bronze threshold stands a guardian who does not speak. Best of three across the ground you have already walked. Every road has one gate that does not speak.',
      lock: 'Clear The Chronicler',
      /* 4/4/4 across the late-taught factions (R8). She holds the door;
         the deck is a wall with two executioners behind it. */
      enemy12: [
        'yamato-abe-no-seimei',
        'yamato-benkei',
        'yamato-tomoe-gozen',
        'yamato-momotaro',
        'roma-julius-caesar',
        'roma-spartacus',
        'roma-brutus',
        'roma-augustus',
        'takamagahara-amaterasu',
        'takamagahara-izanami',
        'takamagahara-susanoo',
        'takamagahara-izanagi',
      ],
      factionMix: { yamato: 4, roma: 4, takamagahara: 4 },
      banProfile: { stat: 'atk' },
      grants: {
        choice: { count: 2, factions: ['camelot', 'sherwood', 'olympus', 'yamato', 'roma', 'takamagahara'] },
        coins: 220,
      },
      resultWin: 'The Guardian speaks, voice rough with disuse: “Then carry it.” The gate opens.',
      resultLose: 'The Guardian shakes her head once, and the gate stays shut. She will be here.',
      barks: {
        /* she does not speak - her barks are stage direction, not lines */
        start: 'The Guardian makes a sign with two fingers: I knew you would come.',
        start2: 'The Guardian resets her stance exactly. The door has not moved either.',
        start3: 'The Guardian tightens her grip on the wooden key. Last gate.',
        firstBloodYou: 'The Guardian nods once — approval, or a warning.',
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
      format: 'Unabridged · Final judgment',
      terrain: "The Legend's Trial · Ruins · Mirror Realm",
      fightCard: ['heros-trial', 'ancient-ruins', 'mirror-realm'],
      line: 'The First King stands beside the great scales. He cannot be banned and he will not be benched — and the scales give life back: Isis walks with him. Beat the set, not one deck.',
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
      grants: { cards: ['duat-isis', 'duat-anubis'], coins: 400 },
      resultWin: 'The scales balance. Gilgamesh bows his head. “Your story deserves to last.”',
      resultLose: '“Death is not a mistake,” Gilgamesh says. “Neither is losing. Come back when you know the difference.”',
      barks: {
        start: '“Power. What you can do. Show me.”',
        start2: '“Memory. What remains after you are gone. Show me.”',
        start3: '“Self. What you become when no one is watching. Show me.”',
        firstBloodYou: '“So the blank line has teeth. Enkidu would have liked you.”',
        firstBloodFoe: '“The scales tip early. They usually correct themselves.”',
        allyDown: '“Everything I loved, I outlived. Do not make my collection larger.”',
        foeDown: '“Another witness gone. The hall remembers every one.”',
        foeHalf: '“I crossed deserts, seas, graves and gods. You will need more than momentum.”',
        foeLast: '“Now it is only me. It has been only me for a very long time.”',
        playerLow: '“A story held too tightly becomes a prison. Loosen your grip and fight.”',
        rivalRevive: '“The scales give life back. I told you they would.”',
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
      { speaker: 'The Recruiter', text: '\u201cName?\u201d' },
      {
        speaker: 'The Wayfarer',
        text: 'Nothing comes. You remember hands. A road. The precise ache of losing something important. The name itself is simply\u2026 gone.',
      },
      {
        speaker: 'The Recruiter',
        text: '\u201cAh. That kind.\u201d He writes a blank line in the ledger, unhurried. \u201cHundreds of names in this book. Crossed out in red \u2014 devoured. Underlined in gold \u2014 continuing. Yours is the first blank I have written in a very long age.\u201d',
      },
      {
        speaker: 'The Recruiter',
        text: '\u201cYou are not exactly dead. You are not exactly alive either, which is why we must be quick \u2014 the thorns out there eat the undecided.\u201d',
      },
      {
        speaker: 'The Recruiter',
        text: '\u201cEvery Echo believes this road ends in immortality. Wrong. The Road is a question asked ten different ways: does your story deserve to last \u2014 and do you know the difference between lasting and refusing to end?\u201d',
      },
      {
        speaker: 'The Recruiter',
        text: 'He presses a brass coin into your palm. A road on one face; an empty chair on the other. \u201cWhat does it buy?\u201d you ask. \u201cPossibilities, if you are lucky. Regrets, if you are not.\u201d',
      },
      {
        speaker: 'The Recruiter',
        text: '\u201cThe first gate is mine, and I do not trick the new \u2014 I will walk you through the war myself. Every ban, every rank, every drop of first blood. All the gate asks is that you survive yourself.\u201d',
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
        text: '\u201cDo not read those too long,\u201d says the old soldier, not looking up from the strap he is mending. \u201cEvery one of them was kept too late. Including mine.\u201d',
      },
      {
        speaker: 'The Oathkeeper',
        text: '\u201cThe Road says you have no name. A dangerous freedom, that. No name means no one has made a promise about you yet. No promise means none broken. I almost envy you.\u201d',
      },
      { speaker: 'The Wayfarer', text: '\u201cWhat did they call you, before?\u201d' },
      {
        speaker: 'The Oathkeeper',
        text: '\u201cToo Late.\u201d He lets that sit. \u201cI promised forty-three people I would bring them home. I brought twelve. For years I told myself the oath died with the others \u2014 then this road taught me an oath does not die just because everyone who heard it did.\u201d',
      },
      {
        speaker: 'The Oathkeeper',
        text: 'He stands \u2014 slowly, not from weakness but from economy \u2014 and lifts the shield. \u201cA wall is not built to keep danger out, child. It is built to tell danger where it must stop. Nothing touches your back line while I stand. So do the arithmetic: go through me.\u201d',
        battle: true,
        final: true,
      },
    ],
    3: [
      {
        speaker: 'The Wayfarer',
        text: 'A rifle cracks. The stone at your feet splits clean in two. \u201cToo slow,\u201d calls a cheerful voice from the watchtree.',
      },
      {
        speaker: 'The Outlaw',
        text: '\u201cRelax, Blank. If I wanted you dead you would have been a footnote back at the pass. The Recruiter walks slow and I get bored.\u201d She swings down, rifle across her shoulders like a yoke.',
      },
      {
        speaker: 'The Outlaw',
        text: '\u201cHere is my science. Every warband has a favorite \u2014 a king, a bright one, a loud one. Everyone swears they love the whole company. Then I put a sight on the centre of their pride, and we find out what the love is made of.\u201d',
      },
      { speaker: 'The Wayfarer', text: '\u201cWhy?\u201d' },
      {
        speaker: 'The Outlaw',
        text: '\u201cMy father kept a bookshop. When the soldiers came they did not burn the books first \u2014 they burned the RECORDS. The pages that said which books belonged to whom. Names in large type survived. The rest of us were scenery.\u201d Her smile thins. \u201cSo I shoot the large type, and the scenery remembers it has hands.\u201d',
      },
      {
        speaker: 'The Outlaw',
        text: 'She taps the brass tube sight. \u201cProtect your brightest echo, or dangle it as bait \u2014 either answer tells me something true. Ready when you are. You are my favorite this season, and I always shoot my favorites first.\u201d',
        battle: true,
        final: true,
      },
    ],
    4: [
      {
        speaker: 'The Wayfarer',
        text: 'The spring turns the cave ceiling into a second, wavering sky. Light moves through the rings of a bronze astrolabe \u2014 and a gold circle blooms beneath your wolf. It snarls.',
      },
      { speaker: 'The Anointed', text: '\u201cA mark. Not a curse. Not yet.\u201d' },
      {
        speaker: 'The Anointed',
        text: 'You reach for the wolf. \u201cDo not,\u201d she says \u2014 and you stop, because her voice holds no threat at all. Only certainty. \u201cWatch.\u201d',
      },
      {
        speaker: 'The Anointed',
        text: '\u201cIn my first life I was taught that warning is mercy. A physician marks the wound before she cuts. A judge marks the guilty before the sentence. A mark is a promise: I see you. I am coming. Prepare.\u201d',
      },
      {
        speaker: 'The Anointed',
        text: '\u201cThen I learned that people who love power also love deciding who wears the circle. My city called me too useful to be allowed to doubt.\u201d The circle under the wolf brightens. \u201cSo now I doubt professionally.\u201d',
      },
      {
        speaker: 'The Anointed',
        text: '\u201cRead my promises, Wayfarer. Every one will be kept \u2014 on schedule, politely. Whether a promise becomes a prophecy is the only part that belongs to you.\u201d',
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
        text: 'The Warden pours tea into four cups, though only three of you are present. You look at the extra cup. \u201cFor whom?\u201d \u2014 \u201cFor the person you were before you arrived.\u201d Her voice holds no cruelty. That makes it worse.',
      },
      { speaker: 'The Wayfarer', text: '\u201cWhat is the Road? Truly.\u201d' },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '\u201cNot a ladder. Not a tournament. Not even a judgement, though the First Legend enjoys the word. It is what was built because too many echoes did not know what to do after their stories ended.\u201d',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '\u201cSome become tyrants of their own old victories. Some become ghosts wearing their greatest wound like a crown. Some grow hungry enough to erase other stories just to make room. The Road teaches carrying instead. The guardians are not gatekeepers \u2014 we reached a door and chose to stay, because someone had to, once the Road began to break.\u201d',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '\u201cAnd you should know: you are not an Echo in the ordinary sense. Echoes arrive carrying an ending. You arrived carrying an absence. Gilgamesh has waited for a blank line longer than I have stood this watch.\u201d',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'She takes up the unlit signal lantern. \u201cNow bring twelve you chose yourself \u2014 the Road stops lending its hand at my table. Three gates. Best of three. Substitutions are law, and there is NO RETREAT once it begins.\u201d',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '\u201cThe lesson is not whether you can win once. It is whether you can change after winning. Most cannot. Prove me wrong and I will pour the fourth cup out myself.\u201d',
        battle: true,
        final: true,
      },
    ],
    6: [
      {
        speaker: 'The Trickster',
        text: '\u201cFINALLY. A blank person!\u201d The gambler kicks her boots off the table. \u201cI was starting to think the Road had become a retirement home with better lighting.\u201d',
      },
      {
        speaker: 'The Wayfarer',
        text: 'Cards drift through the violet dark around her table \u2014 swords never drawn, promises never spoken, names never chosen for children never born. She fans a hand of them onto the black stone.',
      },
      {
        speaker: 'The Trickster',
        text: '\u201cHouse rules. The Road deals possible selves. You take one. Then I take one. Then you take one. The only cheating on this table is pretending you did not want what you picked.\u201d',
      },
      { speaker: 'The Wayfarer', text: '\u201cWhat happened to you?\u201d' },
      {
        speaker: 'The Trickster',
        text: '\u201cRude.\u201d A pause. \u201cFine. In my first story I was the hero\u2019s sister. I had three lines. \u2018Brother, be careful.\u2019 \u2018Brother, come home.\u2019 The third was never printed.\u201d She shuffles without looking. \u201cSo I learned to deal myself into other stories. Now I have ALL the lines.\u201d',
      },
      {
        speaker: 'The Trickster',
        text: '\u201cFair warning, Blank: whatever your pretty plan needs, I intend to be holding it. Draft like someone is robbing you.\u201d She grins. \u201cSomeone is.\u201d',
        battle: true,
        final: true,
      },
    ],
    7: [
      {
        speaker: 'The Strategist',
        text: 'The old man does not look up from his wax board. \u201cYou will protect the centre first. Then you will overcorrect. Then you will discover that mercy is also a formation.\u201d',
      },
      { speaker: 'The Wayfarer', text: '\u201cHow do you know that?\u201d' },
      {
        speaker: 'The Strategist',
        text: '\u201cBecause every decision casts a shadow. You call it choice, since you can only see the hand that makes it. I call it geometry \u2014 I can see the lines afterward.\u201d He tilts the board: violet paths cross and recross. Some end in small circles. Some end in ash.',
      },
      {
        speaker: 'The Strategist',
        text: '\u201cIn my life I advised a city at war. I was very good. I saved it \u2014 by choosing which villages burned first. They minted coins with my face on them.\u201d The wind tugs his purple mantle. \u201cPraise is not acquittal. That is why I am here.\u201d',
      },
      {
        speaker: 'The Strategist',
        text: '\u201cWe will draft now. Understand me: I will not be drafting cards. I will be drafting your habits.\u201d He wipes a corner of the board clean, making room for you. \u201cProve the pattern is not destiny. I would love to be wrong twice in one century.\u201d',
        battle: true,
        final: true,
      },
    ],
    8: [
      {
        speaker: 'The Chronicler',
        text: '\u201cYou took your time.\u201d \u2014 \u201cThe Road is long,\u201d you say. \u201cNo. The Road is patient. You are the one taking time.\u201d',
      },
      {
        speaker: 'The Chronicler',
        text: 'They turn a book toward you. Its pages are blank. \u201cThis is you. There should be an origin. An ending. Witnesses, revisions, contradictions \u2014 every life leaves clutter. You have none. I wrote on your page once, in my own ink.\u201d A pause. \u201cThe ink vanished.\u201d',
      },
      {
        speaker: 'The Chronicler',
        text: '\u201cThere is a hunger outside the Road. We call it the Quiet. It does not kill stories \u2014 killing would be simpler. It removes the part that makes anyone CARE the story existed.\u201d',
      },
      {
        speaker: 'The Chronicler',
        text: '\u201cA town remembers it had a king, but not his name. A woman remembers loving someone, but not whom. A song keeps its melody and loses every word. Emptiness is greedy \u2014 and you, Blank, smell like its favorite meal.\u201d',
      },
      {
        speaker: 'The Chronicler',
        text: 'They set the pen down with terrible care. \u201cI have seen a page like yours exactly once before. A guardian. Before she became the Last.\u201d',
      },
      {
        speaker: 'The Chronicler',
        text: '\u201cSo. I will burn what is already hurt. I will cleanse what has been poisoned. I will silence what might become dangerous. If you are worth the shelf space, prove it against the full catalogue.\u201d',
        battle: true,
        final: true,
      },
    ],
    9: [
      {
        speaker: 'The Wayfarer',
        text: 'The final gate stands at the end of every road at once. Behind you the ground remembers everywhere you have walked \u2014 colosseum, pass, plains. Before the gate waits a woman in scarred armor, a wooden key taller than her shoulder strapped across her back. She does not speak.',
      },
      {
        speaker: 'The Recruiter',
        text: 'The Guardian signs with two fingers, then two more. The Recruiter translates softly. \u201cShe says: I knew you would come.\u201d',
      },
      {
        speaker: 'The Recruiter',
        text: '\u201cShe was like you, once. A living story. The Quiet found her world before her ending could be written \u2014 the Road took what it could save.\u201d',
      },
      {
        speaker: 'The Recruiter',
        text: '\u201cShe reached this gate and learned her name was the last thread tying the Quiet to her old life. She cut it. Not to be forgotten \u2014 to keep the forgetting from crossing after her. Do not ask her for your name. Ask her what she gave up to keep hers, and she will show you the answer holding a door shut.\u201d',
      },
      {
        speaker: 'The Recruiter',
        text: 'The Guardian points at you. Then at the thin dark wound running down the centre of the gate. Then she makes a fist. \u201cShe says the Quiet followed you. Not because you are weak \u2014 because an unfinished story is a door.\u201d',
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
        text: 'He is not sitting on the throne. He stands beside it, like a man long tired of ceremonies he himself invented. At the centre of the hall: scales large enough to weigh a city. On one pan, a cedar tablet. On the other \u2014 nothing.',
      },
      {
        speaker: 'Gilgamesh',
        text: '\u201cWayfarer.\u201d The name is not a name. It is an acknowledgement of the space where one should be. \u201cI know what you are not. That is often the beginning.\u201d',
      },
      {
        speaker: 'Gilgamesh',
        text: '\u201cI loved a man named Enkidu. When he died I decided the world had made an error, and I crossed deserts, seas, graves and gods to file my complaint. The answer was no. Death is not a mistake. I hated the answer \u2014 so I asked a different question.\u201d',
      },
      { speaker: 'Gilgamesh', text: '\u201cWhat if nothing were ever forgotten?\u201d' },
      { speaker: 'The Wayfarer', text: '\u201cThe Quiet.\u201d' },
      {
        speaker: 'Gilgamesh',
        text: '\u201cMy question, grown teeth.\u201d He does not flinch from it. \u201cMemory without mercy becomes hunger. A story held too tightly becomes a prison. I built the Road to teach legends to be carried by the living \u2014 not to devour them. You are the first blank line ever to reach the tenth gate.\u201d',
      },
      {
        speaker: 'Gilgamesh',
        text: 'Three doors open in the hall. \u201cPower \u2014 what you can do. Memory \u2014 what remains when you are gone. Self \u2014 what you become when no one is watching. I fight in all three. I cannot be banned from my own judgement, and the scales walk with me. They give life back. That is not a threat; it is a schedule.\u201d',
      },
      {
        speaker: 'Gilgamesh',
        text: '\u201cYou want your name. I know. If I hand it to you, you will wear it because a king said it was yours \u2014 and that is not a name, that is a chain. Take it from my hands the only way that means anything.\u201d He steps away from the throne. \u201cThe trial remains.\u201d',
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
        text: 'The old man closes the ledger \u2014 then thinks better of it and opens it again. \u201cHansel and Gretel: banned, and furious about it. Cinderella: banned, and gracious about it. It is always the ones who promise happy endings who fight hardest when someone tries to delete them.\u201d',
      },
      {
        speaker: 'The Wayfarer',
        text: 'Beneath your blank line, in a handwriting that is not his, one word has appeared. CONTINUING.',
      },
      {
        speaker: 'The Recruiter',
        text: '\u201cI did not write that,\u201d he says quietly. \u201cThe Road did.\u201d He packs the lantern. \u201cThe Oathkeeper holds the pass ahead. He has been arguing with a wall for two hundred years \u2014 go lose the argument politely, and mind the shields. They read back.\u201d',
        final: true,
      },
    ],
    2: [
      {
        speaker: 'The Oathkeeper',
        text: 'He unwinds the white oath sash from beneath his armor \u2014 repaired so many times that no original thread remains \u2014 and cuts it in two without hesitating. He has clearly rehearsed letting go.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '\u201cTwo of mine walk with you now. The king who holds. The knight who answers. Do not spend them on doors that open politely.\u201d King Arthur and Lancelot join your echoes.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '\u201cStrength is the cheapest thing on this road \u2014 every dead man had some. Deciding what it is FOR: that is the toll.\u201d He sits back down to his mending. \u201cThe Outlaw is next. She will test your convictions from four hundred paces. Walk in zigzags.\u201d',
        final: true,
      },
    ],
    3: [
      {
        speaker: 'The Outlaw',
        text: 'She cleans the rifle with a strip of blue cloth and does not look at you. \u201cA street of bookshop records burns in about a minute. Did you know that? A whole neighborhood of WHO OWNS WHAT. One minute.\u201d',
      },
      {
        speaker: 'The Outlaw',
        text: '\u201cTake the archer and the big man. One knows how to aim. One knows how to stand beside an aim without becoming its shadow.\u201d Robin Hood and Little John walk with you now.',
      },
      {
        speaker: 'The Outlaw',
        text: '\u201cThe Anointed is next \u2014 and her marks are worse than my bullets. Bullets are honest. A mark tells you exactly what will happen, then waits to see if you are fool enough to allow it.\u201d She reloads with exaggerated care. \u201cDon\u2019t be. I want a rematch someday.\u201d',
        final: true,
      },
    ],
    4: [
      {
        speaker: 'The Anointed',
        text: 'At the end, the Anointed turns the astrolabe on herself. The circle at her feet glows gold \u2014 then goes dark, unanswered. \u201cI was marked once. My city said I had become too useful to be allowed to doubt. The Road let me keep the difference between usefulness and obedience. It is the only thing I carried out.\u201d',
      },
      {
        speaker: 'The Anointed',
        text: '\u201cTake the stormfather and the strong one. Zeus sets the promise and keeps it in the same breath \u2014 study that until it stops impressing you.\u201d Zeus and Hercules join your echoes.',
      },
      {
        speaker: 'The Anointed',
        text: 'The pool drains from the centre platform, revealing a stair. At its base wait three doors, and on the middle one a brass plaque with no name \u2014 only a question. WHAT DO YOU WANT TO OUTLIVE? \u201cAnswer carefully,\u201d she says. \u201cThe Warden collects answers the way I collect promises.\u201d',
        final: true,
      },
    ],
    5: [
      {
        speaker: 'The Warden of the Mid-Road',
        text: '\u201cYou changed between the gates. Most arrive with one answer and beat it against all three doors until something breaks.\u201d She lays the iron key on the table like a verdict. \u201cYou do not want immortality yet. Good. Wanting it too early ruins people \u2014 I keep the graves that prove it.\u201d',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'She offers two choice-echoes, their shapes flickering in your palm \u2014 a knight, an archer, a healer, a stormbearer. \u201cChoose what you will carry. Not because it is strongest. Because it will change what you become.\u201d',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'The fourth gate opens without being touched. From somewhere beyond it comes laughter \u2014 bright, young, entirely unafraid. The Warden closes her eyes briefly. \u201cThe Trickster has decided the Road is getting serious. My condolences to you both.\u201d',
        final: true,
      },
    ],
    6: [
      {
        speaker: 'The Trickster',
        text: 'She pays up without sulking: two Yamato echoes, and a small lacquered tile with no image on either side. \u201cWhat is it?\u201d \u2014 \u201cA reminder that every road forks before you can see it. And that someone keeps records of which fork you chose.\u201d',
      },
      {
        speaker: 'The Trickster',
        text: 'For one moment the grin goes out entirely. \u201cThe Strategist will tell you choice is a pattern. Charming man. He buried a hundred thousand people inside his arithmetic and it BALANCED.\u201d The grin returns, sharpened. \u201cDo not let him convince you the pattern is destiny. I bet him you wouldn\u2019t.\u201d',
        final: true,
      },
    ],
    7: [
      {
        speaker: 'The Strategist',
        text: 'He wipes the violet board clean with his sleeve \u2014 a century of predicted futures, gone in one motion. \u201cGood,\u201d he says. \u201cI hated being right.\u201d',
      },
      {
        speaker: 'The Strategist',
        text: '\u201cTake Caesar and Brutus. Caesar ends what he starts. Brutus ends what Caesar starts. Between them you will learn what a kill is worth BEFORE you pay for it, which is the only time the price can be argued.\u201d',
      },
      {
        speaker: 'The Strategist',
        text: 'He presses a small brass measuring pin into your hand. \u201cTake this to the Chronicler. She will know why your line does not begin where it should.\u201d \u2014 \u201cWill she tell me?\u201d \u2014 \u201cShe will tell you far too much. It is her only kindness.\u201d',
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
        text: 'The Chronicler goes pale beneath the ash tone of their skin. \u201cThat page was sealed.\u201d \u2014 \u201cBy whom?\u201d \u2014 \u201cGilgamesh.\u201d The rootless trees shiver without wind. Somewhere very far away, something notices that it has been named.',
      },
      {
        speaker: 'The Chronicler',
        text: 'They tear the page free, far too late, and press two Takamagahara echoes into your hands \u2014 the dawn and the dusk. \u201cGo to the Last Guardian. Do not ask her for your name. Ask her what she gave up to keep hers.\u201d',
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
        text: '\u201cI do not know my name,\u201d you said. \u201cBut I know what it is for now.\u201d',
      },
      {
        speaker: 'The Last Guardian',
        text: 'She put her hand over yours on the key. And for the first time in centuries she spoke, her voice rough as a rusted hinge. \u201cThen carry it.\u201d The gate opened \u2014 and the Quiet recoiled from the sound of a name she did not say.',
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
        text: 'On one pan of the great scales rests the cedar tablet. Onto the other, the road lays itself down: a brass coin, a torn sash, a strip of blue cloth, an astrolabe ring, an iron key, a blank tile, a measuring pin, a torn page \u2014 and an unspoken silence. The scales balance.',
      },
      {
        speaker: 'Gilgamesh',
        text: 'Gilgamesh bows his head. \u201cYour story deserves to last.\u201d From him it does not sound like a verdict. It sounds like an apology, accepted at last.',
      },
      {
        speaker: 'Gilgamesh',
        text: '\u201cTwo witnesses go with you. The scale that gives life back. The jackal that closes accounts.\u201d Isis and Anubis join your echoes. \u201cNot rewards, Wayfarer. Witnesses.\u201d',
      },
      {
        speaker: 'Gilgamesh',
        text: 'A final gate opens behind the throne: mud brick, bronze, river light, impossible age. \u201cUruk,\u201d he says. And far back down the Road, at a folding table by the first bend, an old man in a moss-green coat watches the blank line in his ledger fill at last \u2014 not with a name. With a sentence.',
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
    /* Back-compat aliases (older callers referenced these names). */
    recruiterDialogue: DIALOGUES[1],
    epilogue: EPILOGUES[1],
  };
})();
