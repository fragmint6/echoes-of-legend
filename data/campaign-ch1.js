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
      format: 'Classic · Grimmwood deck',
      terrain: 'The Colosseum',
      field: 'colosseum',
      line: 'An old memory broker opens a weathered ledger and writes a blank line. “You are not exactly dead — which is why we must be quick.” He fights to measure you, not to beat you. Plays it straight. Nothing hidden.',
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
      grants: { coins: 100 },
      resultWin: 'The Recruiter closes his ledger — Gate I is yours.',
      resultLose: 'The Recruiter sets down his quill. “The road will still be here.”',
      barks: {
        start: '“I will not trick you. The Road has enough of that ahead.”',
        firstBloodYou: '“Hm. You fight as if you are trying to remember.”',
        firstBloodFoe: '“Do not confuse remembering with recovering.”',
        allyDown: '“An echo fades. Watch what the others do about it.”',
        foeHalf: '“Good. Fear has discovered it has hands.”',
        foeLast: 'The Recruiter licks his pen, already writing.',
        playerLow: '“Steady, Blank. Survive yourself — that is the whole test.”',
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
     --------------------------------------------------------- */
  var DIALOGUES = {
    1: [
      { speaker: 'The Recruiter', text: '“Name?”' },
      {
        speaker: 'The Wayfarer',
        text: 'Nothing comes. You remember hands, a road, and the ache of losing something important. You do not remember a name.',
      },
      {
        speaker: 'The Recruiter',
        text: '“Ah. That kind.” The old man writes a blank line in his ledger. “You are not exactly dead. Which is why we must be quick.”',
      },
      {
        speaker: 'The Recruiter',
        text: '“Every Echo thinks this road leads to immortality. It does not. It asks whether your story can last without becoming trapped inside itself.”',
      },
      {
        speaker: 'The Recruiter',
        text: 'He sets a brass coin in your palm. One side bears a road; the other, an empty chair. “The first gate is generous. It only asks you to survive yourself.”',
      },
      {
        speaker: 'The Recruiter',
        text: '“Bring your echoes. Six with teeth are a fair beginning. Let us see if your story has the strength to continue.”',
        battle: true,
        final: true,
      },
    ],
    2: [
      {
        speaker: 'The Oathkeeper',
        text: 'The old soldier does not rise at first. He finishes mending the shield strap, because a job half-done is a promise half-broken.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '“The Road says you have no name. A dangerous freedom. No name means no one has yet made a promise about you. No promise means no one has yet broken one.”',
      },
      { speaker: 'The Wayfarer', text: '“What did they call you before?”' },
      { speaker: 'The Oathkeeper', text: '“Too late.”' },
      {
        speaker: 'The Oathkeeper',
        text: '“I promised to bring forty-three people home. I brought twelve. Then I came here and learned an oath does not die just because the people who heard it do.”',
      },
      {
        speaker: 'The Oathkeeper',
        text: 'He stands, slowly — not weakness; economy. “A wall is not made to keep danger out. It is made to tell danger where it must stop. Nothing reaches your back line while I stand. So: go through me.”',
        battle: true,
        final: true,
      },
    ],
    3: [
      {
        speaker: 'The Outlaw',
        text: 'A rifle cracks. The shot splits the stone at your feet, cleanly, in two. “Too slow,” calls a voice from the watchtree.',
      },
      {
        speaker: 'The Outlaw',
        text: '“Every group has a strongest piece. A king, a favorite, a loud one. Everyone swears they love the whole company — then I put a sight on the center of their pride and find out.”',
      },
      { speaker: 'The Wayfarer', text: '“Why?”' },
      {
        speaker: 'The Outlaw',
        text: '“Because in my first story, the rich had their names printed in large type and the rest of us were scenery. Shoot the large type, and the scenery notices it has hands.”',
      },
      {
        speaker: 'The Outlaw',
        text: 'She swings the barrel toward the plains. “Protect your brightest echo, Wayfarer. Or use it as bait. Either answer tells me something.”',
        battle: true,
        final: true,
      },
    ],
    4: [
      {
        speaker: 'The Anointed',
        text: 'Light moves through the rings of a bronze astrolabe, and a golden circle blooms beneath your fiercest echo. It snarls.',
      },
      { speaker: 'The Anointed', text: '“A mark. Not a curse. Not yet.”' },
      {
        speaker: 'The Anointed',
        text: '“In my life I was taught that warning was mercy. A physician marks a wound before she cuts. A judge marks the guilty before sentencing. The mark is a promise: I see you. I am coming. Prepare.”',
      },
      {
        speaker: 'The Anointed',
        text: '“And then I learned that people who love power also enjoy deciding who is marked.”',
      },
      {
        speaker: 'The Anointed',
        text: 'The circle brightens. “A warning can be mercy. It can also be a blade held very politely. Read my promises, Wayfarer — every one will be kept.”',
        battle: true,
        final: true,
      },
    ],
    5: [
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'Three toll arches lean over a paved square. Beyond one, the pale colosseum. Beyond another, the narrow pass. Beyond the third, wind tears at open grass.',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'The Warden pours tea into four cups, though only three of you are present. You look at the extra cup. “For the person you were before you arrived,” she says.',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '“The Road was made because too many echoes did not know what to do after their stories ended. Some became tyrants of their old victories. Some became ghosts wearing their greatest wound like a crown.”',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '“The guardians are not gatekeepers. We are those who reached a door and chose not to leave — because someone had to stay when the Road began to break.”',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '“Now. Bring twelve you chose yourself — the Road stops lending you its hand here. Three gates, best of three, substitutions are law, and there is NO retreat once it begins.”',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: '“The lesson is not whether you can win once. It is whether you can change after winning.”',
        battle: true,
        final: true,
      },
    ],
    6: [
      {
        speaker: 'The Trickster',
        text: '“Finally! A blank person. I was worried the Road had become a retirement home.” Cards drift through the violet dark — swords never drawn, names never chosen.',
      },
      {
        speaker: 'The Trickster',
        text: 'She flicks her wrist. Cards land on the black stone table. “The Road gives you possible selves. You take one. Then I take one. Then you take one.”',
      },
      { speaker: 'The Wayfarer', text: '“What happened to you?”' },
      {
        speaker: 'The Trickster',
        text: '“In my first story I was a daughter who stood behind the hero. I had three lines. One was: Brother, be careful. One was: Brother, come home. The third was never printed.”',
      },
      {
        speaker: 'The Trickster',
        text: '“So I learned to deal myself into other stories.” Her grin sharpens. “The only cheating is pretending you did not want what you picked. Shall we?”',
        battle: true,
        final: true,
      },
    ],
    7: [
      {
        speaker: 'The Strategist',
        text: 'The old man does not look up from his wax board. “I know. You will protect the center first. Then you will overcorrect. Then you will discover that mercy is also a formation.”',
      },
      { speaker: 'The Wayfarer', text: '“How do you know that?”' },
      {
        speaker: 'The Strategist',
        text: '“Because every decision casts a shadow. You call it choice because you can only see the hand that makes it. I call it geometry, because I can see the lines afterward.”',
      },
      {
        speaker: 'The Strategist',
        text: '“In my life I advised a city during a war. I was very good. I saved the city — by deciding which villages would burn first. People praised the result. Praise is not acquittal.”',
      },
      {
        speaker: 'The Strategist',
        text: 'He sets a fresh wax board between you. “Draft, Wayfarer. I will be drafting your habits. Prove the pattern is not destiny.”',
        battle: true,
        final: true,
      },
    ],
    8: [
      {
        speaker: 'The Chronicler',
        text: '“You took your time,” says the archivist at the black desk. Books drift open around them, pages blank until you come near.',
      },
      {
        speaker: 'The Chronicler',
        text: 'They open a book and turn it toward you. Its pages are empty. “This is you. There should be an origin. Witnesses. Revisions. Every life leaves clutter. You have none.”',
      },
      {
        speaker: 'The Chronicler',
        text: '“There is a hunger outside the Road. We call it the Quiet. It does not kill stories — killing would be simpler. It removes the part that makes anyone care the story existed.”',
      },
      {
        speaker: 'The Chronicler',
        text: '“A town remembers it had a king, but not his name. A song keeps its melody and loses every word. Because emptiness is greedy.”',
      },
      {
        speaker: 'The Chronicler',
        text: 'Ink stains their fingers as they reach for a fresh pen. “I burn what is already hurt. I cleanse what has been poisoned. I silence what might become dangerous. Show me you are worth the shelf space.”',
        battle: true,
        final: true,
      },
    ],
    9: [
      {
        speaker: 'The Wayfarer',
        text: 'The final gate stands at the end of every road at once. Before it waits a woman in scarred gate armor, a wooden key taller than her shoulder strapped across her back.',
      },
      {
        speaker: 'The Recruiter',
        text: 'The Guardian signs with two fingers. The Recruiter translates softly: “She says — I knew you would come.”',
      },
      {
        speaker: 'The Recruiter',
        text: '“She was like you, once. A living story. The Quiet found her world before her ending was written. She reached this gate and learned her name was the last thread connecting the Quiet to her old life.”',
      },
      {
        speaker: 'The Recruiter',
        text: '“She gave it up. Not to be forgotten — to keep the forgetting from crossing after her.”',
      },
      {
        speaker: 'The Recruiter',
        text: 'The Guardian points at you. Then at the dark wound in the gate. Then she makes a fist. “She says the Quiet followed you. Not because you are weak. Because an unfinished story is a door.”',
      },
      {
        speaker: 'The Recruiter',
        text: 'She draws no breath to speak. She simply raises the key like a bar across the road. Three fields. Best of three. The gate does not negotiate.',
        battle: true,
        final: true,
      },
    ],
    10: [
      {
        speaker: 'Gilgamesh',
        text: 'He is not sitting on the throne. He stands beside it, as though tired of waiting for someone to arrive and unwilling to make a ceremony of it. “Wayfarer.” The name is not a name. It is an acknowledgement of the space where one should be.',
      },
      {
        speaker: 'Gilgamesh',
        text: '“I loved a man named Enkidu. When he died, I believed the world had made a mistake. I crossed deserts, seas, graves and gods looking for a way to undo it. I learned that death is not a mistake. I hated the answer. So I tried another question.”',
      },
      { speaker: 'Gilgamesh', text: '“What if nothing were ever forgotten?”' },
      { speaker: 'The Wayfarer', text: '“The Quiet.”' },
      {
        speaker: 'Gilgamesh',
        text: '“Yes. Memory without mercy becomes hunger. A story held too tightly becomes a prison. I built the Road not to keep every legend alive forever, but to teach legends how to be carried by the living without devouring them.”',
      },
      {
        speaker: 'Gilgamesh',
        text: 'Three doors open in the hall. “Power — what you can do. Memory — what remains after you are gone. Self — what you become when no one is watching.”',
      },
      {
        speaker: 'Gilgamesh',
        text: '“I cannot be banned from my own judgement, and I will not leave the field. The scales walk with me — and the scales give life back. The trial remains.”',
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
        text: 'The old man closes his ledger, then thinks better of it and writes a line. “Hansel & Gretel. Cinderella. It is always the ones who promise a happy ending who fight the hardest.”',
      },
      {
        speaker: 'The Wayfarer',
        text: 'The brass coin in your palm grows warm, and a second gate shimmers into being further up the road.',
      },
      {
        speaker: 'The Recruiter',
        text: '“You asked the road a question and it answered: your story can continue. The Oathkeeper waits at the Narrow Pass. Survive him, and the road will show you what strength is for.”',
        final: true,
      },
    ],
    2: [
      {
        speaker: 'The Oathkeeper',
        text: 'He removes the white oath sash from beneath his armor. Its cloth has been repaired so often that no original thread remains. He splits it in two.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '“Two of my echoes will walk with you. The king who holds, and the knight who answers.” King Arthur and Lancelot join your collection.',
      },
      {
        speaker: 'The Oathkeeper',
        text: '“Strength is easy to admire. The harder thing is deciding what strength is for. Watch the third guardian — she thinks a wall is only useful if someone knows where to shoot through it.”',
        final: true,
      },
    ],
    3: [
      {
        speaker: 'The Outlaw',
        text: 'She sits on the hill and cleans the rifle with a strip of blue cloth. “My father kept a bookshop. The first thing soldiers burn is not books — it is the records that say which books belonged to whom.”',
      },
      {
        speaker: 'The Outlaw',
        text: '“Take these two. One knows how to aim. One knows how to stand beside an aim without becoming its shadow.” Robin Hood and Little John walk with you now.',
      },
      {
        speaker: 'The Outlaw',
        text: '“The Anointed is next. Her marks are worse than bullets. Bullets are honest — a mark tells you what will happen, and waits to see whether you are foolish enough to let it.”',
        final: true,
      },
    ],
    4: [
      {
        speaker: 'The Anointed',
        text: '“I was marked once,” she says. “My city said I had become too useful to be allowed to doubt. So I came to the Road, where usefulness is not the same as obedience.”',
      },
      {
        speaker: 'The Anointed',
        text: 'She gives you two echoes: one bright with storm-light, one heavy with the weight of holding. Zeus and Hercules join your collection.',
      },
      {
        speaker: 'The Anointed',
        text: '“Do not worship the tools you are given. Read them. A mark is only a promise — you decide whether it becomes prophecy.” The pool drains, revealing a stair. At its base: three doors, and a question. WHAT DO YOU WANT TO OUTLIVE?',
        final: true,
      },
    ],
    5: [
      {
        speaker: 'The Warden of the Mid-Road',
        text: '“You do not want immortality. Not yet. That is good — wanting it too early ruins people.”',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'She offers two choice-echoes, each changing shape in your palm: a knight, an archer, a healer, a stormbearer. “Choose what you will carry. Not because it is strongest. Because it will change what you become.”',
      },
      {
        speaker: 'The Warden of the Mid-Road',
        text: 'The fourth gate opens without being touched. From beyond it comes laughter — bright, young, entirely unafraid. “Ah,” says the Warden. “The Trickster has decided the Road is getting serious.”',
        final: true,
      },
    ],
    6: [
      {
        speaker: 'The Trickster',
        text: 'She hands over two Yamato echoes and a small lacquered tile, blank on both sides. “What is this?” you ask. “A reminder that every road forks before you see it — and that someone keeps records of which fork you chose.”',
      },
      {
        speaker: 'The Trickster',
        text: 'Her grin fades, just for a moment. “The Strategist will tell you choice is a pattern. Do not let him convince you that pattern is destiny.”',
        final: true,
      },
    ],
    7: [
      {
        speaker: 'The Strategist',
        text: 'He gives you two Roma echoes and one small brass measuring pin. “Take this to the Chronicler. She will know why your line does not begin where it should.”',
      },
      { speaker: 'The Wayfarer', text: '“Will she tell me?”' },
      {
        speaker: 'The Strategist',
        text: '“She will tell you too much. That is her favorite kind of cruelty.”',
        final: true,
      },
    ],
    8: [
      {
        speaker: 'The Chronicler',
        text: 'A book lies open on the ground where no book fell. Inside is a single sentence: THE ONE WHO ARRIVES WITHOUT AN ENDING CAN OPEN WHAT THE DEAD CANNOT.',
      },
      {
        speaker: 'The Chronicler',
        text: 'The Chronicler goes pale beneath the ash tone of their skin. “That page was sealed.” “By whom?” “Gilgamesh.” Somewhere very far away, something notices it has been named.',
      },
      {
        speaker: 'The Chronicler',
        text: 'They press two Takamagahara echoes into your hands. “Go to the Last Guardian. Do not ask her for your name. Ask her what she gave up to keep hers.”',
        final: true,
      },
    ],
    9: [
      {
        speaker: 'The Wayfarer',
        text: 'At the last moment there was an opening at the Guardian’s side. You did not take it. You lowered your weapon, took the wooden key from her back, and held it out to her.',
      },
      {
        speaker: 'The Wayfarer',
        text: '“I do not know my name,” you said. “But I know what it is for now.”',
      },
      {
        speaker: 'The Last Guardian',
        text: 'She put her hand over yours on the key. And for the first time, she spoke — her voice rough with disuse. “Then carry it.” The gate opened, and the Quiet recoiled from the sound of a name she did not say.',
      },
      {
        speaker: 'The Wayfarer',
        text: 'Beyond the threshold waits a hall of scales. Choose which echoes walk with you — the last choice before the throne.',
        final: true,
      },
    ],
    10: [
      {
        speaker: 'Gilgamesh',
        text: 'The scales balance: a cedar tablet against a brass coin, a torn sash, a strip of blue cloth, an astrolabe ring, an iron key, a blank tile, a measuring pin, a torn page, and an unspoken silence.',
      },
      { speaker: 'Gilgamesh', text: '“Your story deserves to last.”' },
      {
        speaker: 'Gilgamesh',
        text: 'He offers two final echoes — one holding the memory of revival, one carrying the weight of judgment. “Take them. Not as rewards. As witnesses.” Isis and Anubis walk with you.',
      },
      {
        speaker: 'Gilgamesh',
        text: 'A final gate opens behind the throne. Beyond it rises a city of mud brick, bronze, and impossible age. “Uruk,” says Gilgamesh. And in the Recruiter’s ledger, far down the road, the blank line fills at last — not with a name, but with a sentence.',
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
