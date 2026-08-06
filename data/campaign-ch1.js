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
      line: 'An old memory broker asks what you want to outlive.',
      lock: 'The first question',
    },
    {
      id: 2,
      rival: 'The Oathkeeper',
      format: 'Classic',
      terrain: 'The Narrow Pass',
      line: 'A veteran who returned with twelve asks who your strength protects.',
      lock: 'Clear The Recruiter',
    },
    {
      id: 3,
      rival: 'The Outlaw',
      format: 'Classic',
      terrain: 'The Open Plains',
      line: 'A rifle sights your brightest echo to see who you leave behind.',
      lock: 'Clear The Oathkeeper',
    },
    {
      id: 4,
      rival: 'The Anointed',
      format: 'Classic',
      terrain: 'The Mana Spring',
      line: 'A Mark is a promise. Decide whether it becomes prophecy.',
      lock: 'Clear The Outlaw',
    },
    {
      id: 5,
      rival: 'The Warden of the Mid-Road',
      format: 'Unabridged · Three gates',
      terrain: 'Colosseum · Pass · Plains',
      line: 'At the Mid-Road, the guardians reveal why they chose to remain.',
      lock: 'Clear The Anointed',
    },
    {
      id: 6,
      rival: 'The Trickster',
      format: 'Draft',
      terrain: 'The Energy Void',
      line: 'Every choice leaves another possible self across the table.',
      lock: 'Clear the Mid-Road',
    },
    {
      id: 7,
      rival: 'The Strategist',
      format: 'Draft',
      terrain: 'The Blood Battlefield',
      line: 'He calls every choice a pattern. You must prove it is not destiny.',
      lock: 'Clear The Trickster',
    },
    {
      id: 8,
      rival: 'The Chronicler',
      format: 'Draft',
      terrain: 'The Spirit World',
      line: 'In the wall-less library, the Quiet learns that you exist.',
      lock: 'Clear The Strategist',
    },
    {
      id: 9,
      rival: 'The Last Guardian',
      format: 'Unabridged · Three gates',
      terrain: 'Void · Battlefield · Spirit World',
      line: 'A nameless guardian shows what it costs to hold a door shut.',
      lock: 'Clear The Chronicler',
    },
    {
      id: 10,
      rival: 'Gilgamesh',
      format: 'Unabridged · Final judgment',
      terrain: "The Legend's Trial · Ruins · Mirror Realm",
      line: 'The First Legend judges whether a story can continue without becoming a prison.',
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
};
