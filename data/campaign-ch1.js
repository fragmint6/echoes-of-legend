/* =============================================================
   Echoes of Legend — Campaign Chapter 1 Narrative Data
   -------------------------------------------------------------
   The campaign is where the game's lore lives. This small, plain-script
   data layer gives the chapter menu and dialogue their canonical story
   language without making campaign progress or battles functional yet.
   ============================================================= */
window.EOL = window.EOL || {};

window.EOL.campaignCh1 = {
  id: 'road-of-echoes',
  title: 'The Road of Echoes',
  subtitle: 'An unfinished story walks between memory and oblivion.',
  starterDeck: {
    id: 'starter-grimmwood',
    name: 'Grimmwood',
    faction: 'grimmwood',
  },
  stages: [
    {
      id: 1,
      rival: 'The Recruiter',
      mode: 'classic',
      playerDeck: 'starter-grimmwood',
      format: 'Classic · Grimmwood deck',
      terrain: 'The Colosseum',
      line: 'Beneath ancient twisted pines at the threshold of the road, an immortal memory broker opens a weathered ledger and writes a blank line. “You are not exactly dead — which is why we must be quick. Every Echo thinks this road leads to immortality. It does not. It only asks you to survive yourself.” He presses a brass coin bearing an empty chair into your palm, waiting to see if your story has the strength to continue.',
      lock: 'The first question',
    },
    {
      id: 2,
      rival: 'The Oathkeeper',
      format: 'Classic',
      terrain: 'The Narrow Pass',
      line: 'A scarred veteran sitting on a stone block at the Narrow Pass mends his shield with iron wire and asks who your strength protects.',
      enemy12: ['camelot-king-arthur','camelot-lancelot','camelot-merlin','camelot-guinevere','camelot-morgan-le-fay','camelot-mordred','camelot-king-arthur','camelot-lancelot','camelot-merlin','camelot-guinevere','camelot-morgan-le-fay','camelot-mordred'],
      botSix: ['camelot-king-arthur','camelot-lancelot','camelot-merlin','camelot-guinevere','camelot-morgan-le-fay','camelot-mordred'],
      banProfile: 'Bans your best back-line threat; fields a Provoke wall',
      talk: 'A wall is not made to keep danger out. It is made to tell danger where it must stop.',
      grants: { card: 'camelot-king-arthur', coin: 50 },
      coachBeats: ['The Narrow Pass makes the front line matter.', 'Nothing reaches your back line while he stands — go through him.'],
      lock: 'Clear The Recruiter',
    },
    {
      id: 3,
      rival: 'The Outlaw',
      format: 'Classic',
      terrain: 'The Open Plains',
      line: 'A young woman from a bookshop family whose records were burned before its books sights your brightest echo to see who you leave behind.',
      enemy12: ['sherwood-robin-hood','sherwood-little-john','sherwood-will-scarlet','sherwood-maid-marian','sherwood-friar-tuck','sherwood-guy-of-gisborne','sherwood-robin-hood','sherwood-little-john','sherwood-will-scarlet','sherwood-maid-marian','sherwood-friar-tuck','sherwood-guy-of-gisborne'],
      botSix: ['sherwood-robin-hood','sherwood-little-john','sherwood-will-scarlet','sherwood-maid-marian','sherwood-friar-tuck','sherwood-guy-of-gisborne'],
      banProfile: 'Bans your protectors; focus-fires your highest-ATK hero',
      talk: 'Always shoots your strongest legend. Bait or bury them.',
      grants: { card: 'sherwood-robin-hood', coin: 50 },
      coachBeats: ['Focus fire — protect your carry.', 'Bait the Outlaw or bury her first.'],
      lock: 'Clear The Oathkeeper',
    },
    {
      id: 4,
      rival: 'The Anointed',
      format: 'Classic',
      terrain: 'The Mana Spring',
      line: 'An ascetic keeper marks the spring pool stones with astrolabe rings &mdash; decide whether a Mark becomes a prophecy or freedom.',
      enemy12: ['olympus-zeus','olympus-ares','olympus-athena','olympus-hercules','olympus-apollo','olympus-medusa','olympus-zeus','olympus-ares','olympus-athena','olympus-hercules','olympus-apollo','olympus-medusa'],
      botSix: ['olympus-zeus','olympus-ares','olympus-athena','olympus-hercules','olympus-apollo','olympus-medusa'],
      banProfile: 'Bans answers to Marks; telegraphs Mark chains',
      talk: 'His Marks are a promise. Answer them or pay.',
      grants: { card: 'olympus-zeus', coin: 50 },
      coachBeats: ['Marks are a promise — answer or consume.', 'Reading Marks: setup → consume.'],
      lock: 'Clear The Outlaw',
    },
    {
      id: 5,
      rival: 'The Warden of the Mid-Road',
      format: 'Unabridged · Three gates',
      terrain: 'Colosseum · Pass · Plains',
      line: 'At the three stone arches, the guardians reveal why they chose to remain between memory and the Quiet to test all who follow.',
      enemy12: ['camelot-king-arthur','sherwood-robin-hood','olympus-zeus','yamato-minamoto-no-yoshitsune','camelot-lancelot','sherwood-little-john','olympus-ares','yamato-tomoe-gozen','camelot-merlin','sherwood-maid-marian','olympus-athena','yamato-benkei'],
      botSix: null,
      banProfile: 'Adaptive: bans the deck piece that hurt him last game',
      talk: 'Three gates, one Warden. Adapt or fall. No retreat once it begins.',
      grants: { choice: 2, factions: ['camelot','sherwood','olympus','yamato'], coin: 80 },
      coachBeats: ['Deck construction matters now — build a legal 12.', 'No retreat once the set begins.'],
      lock: 'Clear The Anointed',
    },
    {
      id: 6,
      rival: 'The Trickster',
      format: 'Draft',
      terrain: 'The Energy Void',
      line: 'A wanderer deals blank wooden tiles in the dead quiet of the Energy Void &mdash; “every choice leaves another possible self across the table.”',
      lock: 'Clear the Mid-Road',
    },
    {
      id: 7,
      rival: 'The Strategist',
      format: 'Draft',
      terrain: 'The Blood Battlefield',
      line: 'Over the Blood Battlefield, a tactician plots movements on an engraved marble grid, calling every choice an inevitable pattern.',
      enemy12: ['roma-julius-caesar','roma-spartacus','roma-augustus','roma-cicero','roma-brutus','roma-constantine-the-great','roma-julius-caesar','roma-spartacus','roma-augustus','roma-cicero','roma-brutus','roma-constantine-the-great'],
      botSix: null,
      banProfile: 'Cold, patient; claims to have read your last war',
      talk: 'Every pattern is inevitable once you see it.',
      grants: { card: 'roma-julius-caesar', coin: 50 },
      curatedPool: ['roma-julius-caesar','roma-spartacus','roma-augustus','roma-cicero','roma-brutus','roma-constantine-the-great','roma-julius-caesar','roma-spartacus','roma-augustus','roma-cicero','roma-brutus','roma-constantine-the-great','roma-julius-caesar','roma-spartacus','roma-augustus','roma-cicero','roma-brutus','roma-constantine-the-great'],
      coachBeats: ['Counter-draft — deny the kill engine.', 'Patience is its own weapon.'],
      lock: 'Clear The Trickster',
    },
    {
      id: 8,
      rival: 'The Chronicler',
      format: 'Draft',
      terrain: 'The Spirit World',
      line: 'In a wall-less library beneath cold stars, an immortal archivist copies names into parchment as the Quiet learns that you exist.',
      enemy12: ['takamagahara-amaterasu','takamagahara-tsukuyomi','takamagahara-izanami','takamagahara-inari','takamagahara-izanagi','takamagahara-susanoo','takamagahara-amaterasu','takamagahara-tsukuyomi','takamagahara-izanami','takamagahara-inari','takamagahara-izanagi','takamagahara-susanoo'],
      botSix: null,
      banProfile: 'Hoards answers; drafts the curve; writes down disappointment',
      talk: 'The Quiet learns that you exist — and it will remember.',
      grants: { card: 'takamagahara-amaterasu', coin: 50 },
      curatedPool: ['takamagahara-amaterasu','takamagahara-tsukuyomi','takamagahara-izanami','takamagahara-inari','takamagahara-izanagi','takamagahara-susanoo','takamagahara-amaterasu','takamagahara-tsukuyomi','takamagahara-izanami','takamagahara-inari','takamagahara-izanagi','takamagahara-susanoo','takamagahara-amaterasu','takamagahara-tsukuyomi','takamagahara-izanami','takamagahara-inari','takamagahara-izanagi','takamagahara-susanoo'],
      coachBeats: ['Burn and cleanse — answers first.', 'Attrition wins when the wall holds.'],
      lock: 'Clear The Strategist',
    },
    {
      id: 9,
      rival: 'The Last Guardian',
      format: 'Unabridged · Three gates',
      terrain: 'Void · Battlefield · Spirit World',
      line: 'Standing before the great bronze threshold under falling ash, a nameless guardian shows the terrible cost of holding a door shut.',
      enemy12: ['camelot-king-arthur','sherwood-robin-hood','olympus-zeus','yamato-minamoto-no-yoshitsune','roma-julius-caesar','takamagahara-amaterasu','camelot-lancelot','sherwood-little-john','olympus-ares','yamato-tomoe-gozen','roma-spartacus','takamagahara-izanami'],
      botSix: null,
      banProfile: 'Silent, dutiful; swaps to answers; no retreat',
      talk: 'Every road has one gate that does not speak.',
      grants: { choice: 2, factions: ['camelot','sherwood','olympus','yamato','roma','takamagahara'], coin: 80 },
      coachBeats: ['Cross-faction synergy is the final lesson.', 'Build for the exam — not for one board.'],
      lock: 'Clear The Chronicler',
    },
    {
      id: 10,
      rival: 'Gilgamesh',
      format: 'Unabridged · Final judgment',
      terrain: "The Legend's Trial · Ruins · Mirror Realm",
      line: 'The First King stands beside the great scales of memory in the hall of Uruk, judging whether your story can continue without devouring the living.',
      enemy12: ['duat-anubis','duat-isis','duat-horus','duat-maat','duat-sekhmet','duat-nephthys','duat-anubis','duat-isis','duat-horus','duat-maat','duat-sekhmet','duat-nephthys'],
      botSix: ['duat-anubis','duat-isis','duat-horus','duat-maat','duat-sekhmet','duat-nephthys'],
      banProfile: 'Unbannable; pinned into every game; swaps only from his eleven',
      talk: 'He who saw the Deep does not forgive — but he remembers.',
      grants: { card: 'duat-isis', coin: 100 },
      coachBeats: ['The scales weigh memory, not power.', 'Judgement is the last truth.'],
      lock: 'Clear The Last Guardian',
    },
  ],
  dialogues: {
    1: [
      {
        speaker: 'The Recruiter',
        text: '“Name?”',
      },
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
        text: '“I promised to bring forty-three people home. I brought twelve. For years I said the oath had died with the others. Then I came here and learned an oath does not die just because the people who heard it do.”',
      },
      {
        speaker: 'The Wayfarer',
        text: '“What did they call you before?”',
      },
      {
        speaker: 'The Oathkeeper',
        text: '“Too late. A wall is not made to keep danger out. It is made to tell danger where it must stop.”',
      },
      {
        speaker: 'The Oathkeeper',
        text: '“The Road of Echoes narrows at this pass. Beyond my shield wait nine more truths. When you are ready to learn what strength is for, stand before my gate.”',
        final: true,
      },
    ],
  3: [
    { speaker: 'The Outlaw', text: '"Your brightest echo is already in my sights. Let us see if you leave anything behind."' },
    { speaker: 'The Wayfarer', text: '"You came for what I carry?"' },
    { speaker: 'The Outlaw', text: '"Always shoots your strongest legend. Bait or bury them."', battle: true, final: true },
  ],
  4: [
    { speaker: 'The Anointed', text: '"Beside the cracked spring pool, decide whether a Mark becomes prophecy or freedom."' },
    { speaker: 'The Wayfarer', text: '"And if I choose freedom?"' },
    { speaker: 'The Anointed', text: '"His Marks are a promise. Answer them or pay."', battle: true, final: true },
  ],
  5: [
    { speaker: 'The Warden of the Mid-Road', text: '"Three gates, one Warden. Adapt or fall. No retreat once it begins."' },
    { speaker: 'The Wayfarer', text: '"What truth do you guard?"' },
    { speaker: 'The Warden', text: '"Strength is not what you hold, but what you are willing to lose."', battle: true, final: true },
  ],
  6: [
    { speaker: 'The Trickster', text: '"Every choice leaves another possible self across the table."' },
    { speaker: 'The Wayfarer', text: '"You deal in possibilities?"' },
    { speaker: 'The Trickster', text: '"Every choice is a door."', battle: true, final: true },
  ],
  7: [
    { speaker: 'The Strategist', text: '"Every choice is an inevitable pattern on my marble grid."' },
    { speaker: 'The Wayfarer', text: '"You have read my last war?"' },
    { speaker: 'The Strategist', text: '"I read the pattern. Break it, and the grid cracks."', battle: true, final: true },
  ],
  8: [
    { speaker: 'The Chronicler', text: '"I copy names into parchment as the Quiet learns that you exist."' },
    { speaker: 'The Wayfarer', text: '"Then I am already forgotten?"' },
    { speaker: 'The Chronicler', text: '"Not yet. But attrition gets through."', battle: true, final: true },
  ],
  9: [
    { speaker: 'The Last Guardian', text: '"Every road has one gate that does not speak."' },
    { speaker: 'The Wayfarer', text: '"What do you ask?"' },
    { speaker: 'The Last Guardian', text: '"Remember what you leave behind."', battle: true, final: true },
  ],
  10: [
    { speaker: 'Gilgamesh', text: '"He who saw the Deep does not forgive — but he remembers."' },
    { speaker: 'The Wayfarer', text: '"I came to continue, not to become a prison."' },
    { speaker: 'Gilgamesh', text: '"Then let the scales speak. Judgment is the last truth."', battle: true, final: true },
  ],
  },
  recruiterDialogue: [
    {
      speaker: 'The Recruiter',
      text: '“Name?”',
    },
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
  /* Spoken after Gate I is cleared, before the road lets you continue
     to Gate II. */
  epilogue: [
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
};
