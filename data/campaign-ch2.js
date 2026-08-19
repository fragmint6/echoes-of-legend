/* =============================================================
   Echoes of Legend - Campaign Chapter II: The Hundred-Year Truce
   -------------------------------------------------------------
   The playable Road for Chapter II, authored 2026-08-18e against
   docs/LORE-Campaign-Chapter2.md and docs/CHAPTER-2-OVERVIEW.md.
   Those two documents are the design source of truth; this file is
   the implementation, and js/campaign.js is only the glue.

   SHAPE, MEASURED FROM CHAPTER I (see CHAPTER-2-OVERVIEW section 3.5):
     - ten gates, numbered XI..XX so the Road reads as one continuous
       journey rather than restarting at 1;
     - EIGHT of them introduce a faction, including the boss;
     - exactly TWO introduce nothing, and they are the exams (XV, XIX),
       which pay choice-of-two instead. This is Chapter I's arrangement
       (its exams are V and IX, and Gilgamesh hands over Duat), not a
       deviation from it.

   THE PROGRESSION LAW STILL HOLDS. A gate may only field factions the
   player has already been handed. Chapter II starts from the full
   Chapter I shelf - the player arrives with a finished collection - and
   adds one faction per introducing gate. sim/verify_chapter2_campaign.js
   proves every twelve against that rule, so a future card move cannot
   quietly leak Pandemonium into gate XI.

   DIFFICULTY: no freebies (owner ruling). Chapter I opened at ~95% and
   ramped; this chapter opens at ~45% and never rises above it. Nobody
   here is learning the loop, so:
     - every rival sideboards live from their twelve (no scripted sixes
       beyond the authored opening six);
     - the bans bite from gate one;
     - the two elites ARE the two exams.

   THE TWELVES ARE GENERATED, THEN AUDITED. Each was built by a script
   that enforces the constructed-deck law (12 cards, <= 2 legendaries,
   <= 4 of any role) and the progression law, rather than hand-typed -
   hand-typing is how Chapter I ended up fielding cards from factions it
   had not introduced. The rival's own faction always comes first, so a
   ban into the six pulls the next card of the same identity.
   ============================================================= */
window.EOL = window.EOL || {};

(function () {
  'use strict';

  /* ---------------------------------------------------------
     THE BOSS CARD - Asmodeus, the Redactor
     -------------------------------------------------------------
     Chapter I's Gilgamesh is the template: a bespoke legendary that is
     `unbannable` and `pinned`, so the ban grid refuses him and he is
     seeded into every six of the set.

     WHY HIS SIGNATURE IS NOT DAMAGE. The chapter's theme is that a
     record can be edited after the fact, and the boss should BE that.
     The Redaction strikes a legend out of the current round: the target
     is silenced and loses its buffs, "as though it had never acted".
     That is the overrule from the lore, expressed with vocabulary the
     engine already has (silence + consumeBuffs) rather than a new
     undo/replay system, which would need the engine to keep a rewindable
     action log it does not keep.

     HONEST NOTE: the lore describes the overrule as undoing and
     REPLAYING the action as the official version. The replay half is not
     implemented - see docs/CHAPTER-2-OVERVIEW.md section 8. What ships
     is the undo half plus the escalating price, which is the part the
     engine can express truthfully today.
     --------------------------------------------------------- */
  var BOSS_FACTION = {
    id: 'the-canon',
    name: 'The Canon',
    icon: 'ra-book',
    tagline: 'The sentence was passed before you arrived.',
    colors: { primary: '#c9a227', secondary: '#2b1418', glow: '#ffe9a8' },
  };

  var ASMODEUS = {
    id: 'campaign-asmodeus',
    name: 'Asmodeus',
    rarity: 'legendary',
    role: 'Caster',
    element: 'Shadow',
    /* Sits at Gilgamesh's weight class. Chapter II's player arrives with
       a finished collection, so the boss is tuned against a full shelf
       rather than a chapter's worth of grants. NOT SIMMED - see the
       honesty note in docs/CHAPTER-2-OVERVIEW.md. */
    stats: { hp: 8400, atk: 2100, def: 33 },
    unbannable: true,
    pinned: true,
    icon: 'ra-quill-ink',
    art: null,
    ability: {
      type: 'Active',
      name: 'The Redaction',
      cost: 50,
      text:
        'Strike one legend from the record: deal <b>120% ATK Shadow Damage</b>, ' +
        '<b>Silence</b> them for 1 round and remove every buff they carry. ' +
        'Each cast, Asmodeus permanently gains <b>12% ATK</b> - the record grows by revision.',
      note: 'Max: 6 revisions.',
      spec: {
        target: { side: 'enemy', pick: 'single', row: 'any' },
        effects: [
          { k: 'dmg', power: 1.2, element: 'Shadow' },
          { k: 'silence', turns: 1, to: 'targets' },
          { k: 'consumeBuffs', to: 'targets' },
          {
            k: 'stat',
            stat: 'atk',
            amt: 12,
            turns: 99,
            to: 'self',
            stackTag: 'the-redaction',
            maxStacks: 6,
          },
        ],
      },
    },
  };

  var STAGES = [
    {
      id: 11,
      key: 'the-understudy',
      rival: 'The Understudy',
      portrait: null,
      mode: 'classic',
      aiProfile: 'understudy',
      reactiveDialogue: true,
      format: 'Classic',
      terrain: 'The Colosseum',
      field: 'colosseum',
      line: 'A fixer\'s fighter, paid to lose the opening gate convincingly - and doing it properly anyway. Nothing on her board is finished yet: every mortal she fields becomes something else the moment the fight gives it a reason.',
      lock: 'Enter the Concord',
      enemy12: [
        'hemithea-achilles',
        'hemithea-odysseus',
        'hemithea-perseus',
        'hemithea-medea',
        'hemithea-atalanta',
        'hemithea-ajax',
        'hemithea-hercules',
        'hemithea-jason',
        'grimmwood-big-bad-wolf',
        'sherwood-guy-of-gisborne',
        'roma-julius-caesar',
        'camelot-king-arthur',
      ],
      botSix: [
        'hemithea-achilles',
        'hemithea-odysseus',
        'hemithea-perseus',
        'hemithea-medea',
        'hemithea-atalanta',
        'hemithea-ajax',
      ],
      /* The tell is the spec: she takes the two cards you PAID the
         most for, which is a price-axis ban (highest Energy cost), not
         a power-score ban. Enforced behaviourally by
         sim/verify_chapter2_flow.js section C. */
      banProfile: { stat: 'cost' },
      banTell: 'She takes the two cards you paid the most for. "No shortcuts on day one."',
      grants: { legendPack: 'hemithea-achilles', companion: 'hemithea-odysseus', coins: 150 },
      resultWin: '"Eleven silver and a fair opinion of a dead mercenary," she says. "I delivered both."',
      resultLose: '"You read my board on turn one," she says, not unkindly. "Everyone does. Come back and read it on turn four."',
    },
    {
      id: 12,
      key: 'the-bookmaker',
      rival: 'The Bookmaker',
      portrait: null,
      mode: 'classic',
      aiProfile: 'bookmaker',
      reactiveDialogue: true,
      format: 'Classic',
      terrain: 'The Colosseum',
      field: 'colosseum',
      line: 'The Concord\'s bookmaker chalks every price where the crowd can read it. He never opens a position - he prices yours and takes the other side, and an empire\'s court answers each thing you do.',
      lock: 'Clear The Understudy',
      enemy12: [
        'huaxia-qin-shi-huang',
        'huaxia-lu-bu',
        'huaxia-zhuge-liang',
        'huaxia-guan-yu',
        'huaxia-hua-tuo',
        'huaxia-huang-zhong',
        'huaxia-sun-wukong',
        'huaxia-nezha',
        'huaxia-mulan',
        'grimmwood-rumpelstiltskin',
        'camelot-merlin',
        'camelot-morgan-le-fay',
      ],
      botSix: [
        'huaxia-qin-shi-huang',
        'huaxia-lu-bu',
        'huaxia-zhuge-liang',
        'huaxia-guan-yu',
        'huaxia-hua-tuo',
        'huaxia-huang-zhong',
      ],
      /* The tell is the spec: the CHEAPEST thing you brought, whatever
         it is. `costAsc` reads the price axis from the bottom. */
      banProfile: { stat: 'cost', costAsc: true },
      banTell: 'He strikes the cheapest thing you brought. "I set prices. You do not."',
      grants: { legendPack: 'huaxia-sun-wukong', companion: 'huaxia-guan-yu', coins: 150 },
      resultWin: '"You waited," he says, marking the tablet. "Nobody waits. I shall have to reprice you."',
      resultLose: '"You committed first," he says. "You always had the option not to."',
    },
    {
      id: 13,
      key: 'the-herald',
      rival: 'The Herald',
      portrait: null,
      mode: 'classic',
      aiProfile: 'herald',
      reactiveDialogue: true,
      format: 'Classic',
      terrain: 'The Mana Spring',
      field: 'mana-spring',
      line: 'The Canon\'s sword-bearer walks out first and reads what is about to happen, then does it. His court deals almost nothing on the turn it acts - the damage is scheduled, in the open, two rounds out.',
      lock: 'Clear The Bookmaker',
      enemy12: [
        'genesis-lucifer',
        'genesis-michael',
        'genesis-azrael',
        'genesis-gabriel',
        'genesis-adam',
        'genesis-raphael',
        'genesis-uriel',
        'genesis-metatron',
        'grimmwood-evil-queen',
        'yamato-miyamoto-musashi',
        'hemithea-perseus',
        'huaxia-nezha',
      ],
      botSix: [
        'genesis-lucifer',
        'genesis-michael',
        'genesis-azrael',
        'genesis-gabriel',
        'genesis-adam',
        'genesis-raphael',
      ],
      banProfile: { roles: ['Sniper'], stat: 'atk' },
      banTell: '"The court will not be hurried." He takes whatever of yours resolves fastest.',
      grants: { legendPack: 'genesis-lucifer', companion: 'genesis-azrael', coins: 150 },
      resultWin: '"I was told the petitioner is a liar," he says. "I was also told not to ask who told me."',
      resultLose: '"You tried to out-damage a sentence," he says. "Sentences do not race."',
    },
    {
      id: 14,
      key: 'the-collector',
      rival: 'The Collector',
      portrait: null,
      mode: 'classic',
      aiProfile: 'collector',
      reactiveDialogue: true,
      format: 'Classic',
      terrain: 'The Spirit World',
      field: 'spirit-world',
      line: 'She keeps things - not her things, everyone\'s. Nine collapsed traditions sit catalogued in her vault. She does not remove your advantages; she keeps them, and they reappear on her side of the table.',
      lock: 'Clear The Herald',
      enemy12: [
        'transylvania-dracula',
        'transylvania-monster',
        'transylvania-carmilla',
        'transylvania-hyde',
        'transylvania-van-helsing',
        'transylvania-invisible-man',
        'transylvania-dorian-gray',
        'grimmwood-rumpelstiltskin',
        'camelot-merlin',
        'camelot-morgan-le-fay',
        'grimmwood-rapunzel',
        'kami-kaguya',
      ],
      botSix: [
        'transylvania-dracula',
        'transylvania-monster',
        'transylvania-carmilla',
        'transylvania-hyde',
        'transylvania-van-helsing',
        'transylvania-invisible-man',
      ],
      banProfile: { roles: ['Medic', 'Controller'] },
      banTell: 'She takes your cleansers first, so that what she takes stays taken.',
      grants: { legendPack: 'transylvania-dracula', companion: 'transylvania-carmilla', coins: 150 },
      resultWin: '"Nine of them have burned since I started keeping," she says. "Every one asked me to be reasonable first."',
      resultLose: '"You opened with a buff turn," she says, filing it. "Thank you."',
    },
    {
      id: 15,
      key: 'the-hero-of-the-bridge',
      rival: 'The Hero of the Bridge',
      portrait: null,
      mode: 'set',
      aiProfile: 'bridgeHero',
      reactiveDialogue: true,
      format: 'Unabridged best-of-3 - the first exam',
      terrain: 'Ground already walked',
      fightCard: ['colosseum', 'mana-spring', 'spirit-world'],
      line: 'Sargon withdraws the petition, and Concord procedure is clear: a claimant takes over an abandoned petition by defeating the version of the petitioner that is in the book. The entry has no seam. Nothing on it is overstated, and nothing is ragged.',
      lock: 'Clear The Collector',
      enemy12: [
        'hemithea-odysseus',
        'hemithea-perseus',
        'hemithea-medea',
        'huaxia-qin-shi-huang',
        'huaxia-zhuge-liang',
        'huaxia-guan-yu',
        'genesis-michael',
        'genesis-azrael',
        'genesis-gabriel',
        'transylvania-monster',
        'transylvania-carmilla',
        'transylvania-hyde',
      ],
      botSix: [
        'hemithea-odysseus',
        'hemithea-perseus',
        'hemithea-medea',
        'huaxia-qin-shi-huang',
        'huaxia-zhuge-liang',
        'huaxia-guan-yu',
      ],
      grants: { choice: { count: 2 }, coins: 300 },
      resultWin: 'The entry stops mid-sentence and does not finish it. At the rail, the real Sargon says forty names out loud, in order, and gets two of them wrong.',
      resultLose: '"Say it with me," the entry suggests. "It sounds better when there are two of us saying it."',
    },
    {
      id: 16,
      key: 'the-undertaker',
      rival: 'The Undertaker',
      portrait: null,
      mode: 'classic',
      aiProfile: 'undertaker',
      reactiveDialogue: true,
      format: 'Classic - elite',
      terrain: 'The Blood Battlefield',
      field: 'blood-battlefield',
      line: 'He buried a world once, properly, with a field growing back afterwards - and he has never forgiven the Concord for propping legends up past their natural death. His deck is below curve while the board is full, and it improves with every legend that falls.',
      lock: 'Clear the record',
      enemy12: [
        'asgard-odin',
        'asgard-thor',
        'asgard-fenrir',
        'asgard-hel',
        'asgard-loki',
        'asgard-freyja',
        'asgard-heimdall',
        'hemithea-achilles',
        'grimmwood-big-bad-wolf',
        'grimmwood-rapunzel',
        'kami-kaguya',
        'duat-sekhmet',
      ],
      botSix: [
        'asgard-odin',
        'asgard-thor',
        'asgard-fenrir',
        'asgard-hel',
        'asgard-loki',
        'asgard-freyja',
      ],
      banProfile: { roles: ['Medic'] },
      banTell: 'He bans your healers. You cannot outlast a ramp by refusing to end.',
      grants: { legendPack: 'asgard-odin', companion: 'asgard-fenrir', coins: 200 },
      resultWin: '"You closed it before the third death," he says. "Most people trade. Trading is how I win."',
      resultLose: '"Every exchange you won made me stronger," he says. "That was the whole argument."',
    },
    {
      id: 17,
      key: 'the-mason',
      rival: 'The Mason',
      portrait: null,
      mode: 'classic',
      aiProfile: 'mason',
      reactiveDialogue: true,
      format: 'Classic',
      terrain: 'The Ancient Ruins',
      field: 'ancient-ruins',
      line: 'She built the retaining wall the Concord floor sits on, one course at a time, and has never seen the point of laying a stone before the bed under it is true. Nothing on her board kills anything by itself.',
      lock: 'Clear The Undertaker',
      enemy12: [
        'devas-shiva',
        'devas-vishnu',
        'devas-kali',
        'devas-durga',
        'devas-ganesha',
        'devas-hanuman',
        'devas-indra',
        'grimmwood-evil-queen',
        'grimmwood-rapunzel',
        'kami-kaguya',
        'camelot-merlin',
        'camelot-morgan-le-fay',
      ],
      botSix: [
        'devas-shiva',
        'devas-vishnu',
        'devas-kali',
        'devas-durga',
        'devas-ganesha',
        'devas-hanuman',
      ],
      banProfile: { roles: ['Sniper', 'Bruiser'], power: true },
      banTell: 'She takes your finishers, so you cannot skip the lesson with a bigger hammer than she has a combo.',
      grants: { legendPack: 'devas-shiva', companion: 'devas-kali', coins: 150 },
      resultWin: '"You killed the setup," she says. "Eleven centuries, and you are the third."',
      resultLose: '"You answered the scariest card," she says. "It was never the scariest card."',
    },
    {
      id: 18,
      key: 'the-wrecker',
      rival: 'The Wrecker',
      portrait: null,
      mode: 'classic',
      aiProfile: 'wrecker',
      reactiveDialogue: true,
      format: 'Classic',
      terrain: 'The Open Plains',
      field: 'open-plains',
      line: 'A wrecker in the trade sense: she works the coast where things go down and takes off what floats before the sea gets it. Nothing she does is destroyed - buffs, energy, shields, a revive you were counting on, all of it changes hands.',
      lock: 'Clear The Mason',
      enemy12: [
        'tortuga-blackbeard',
        'tortuga-davy-jones',
        'tortuga-kraken',
        'tortuga-anne-bonny',
        'tortuga-captain-kidd',
        'tortuga-calico-jack',
        'tortuga-flying-dutchman',
        'grimmwood-rumpelstiltskin',
        'camelot-merlin',
        'grimmwood-rapunzel',
        'kami-kaguya',
        'grimmwood-big-bad-wolf',
      ],
      botSix: [
        'tortuga-blackbeard',
        'tortuga-davy-jones',
        'tortuga-kraken',
        'tortuga-anne-bonny',
        'tortuga-captain-kidd',
        'tortuga-calico-jack',
      ],
      banProfile: { roles: ['Medic', 'Controller'], stat: 'atk' },
      banTell: 'She bans your buff support, so the theft cannot be replaced.',
      grants: { legendPack: 'tortuga-blackbeard', companion: 'tortuga-davy-jones', coins: 150 },
      resultWin: '"You committed late," she says, almost admiring. "Nothing to lift."',
      resultLose: '"Everyone in this city says the Canon like it\'s a mountain," she says. "It weighs four pounds."',
    },
    {
      id: 19,
      key: 'the-auditor',
      rival: 'The Auditor',
      portrait: null,
      mode: 'set',
      aiProfile: 'auditor',
      reactiveDialogue: true,
      format: 'Unabridged best-of-3 - the second exam',
      terrain: 'Ground already walked',
      fightCard: ['blood-battlefield', 'ancient-ruins', 'open-plains'],
      line: 'Four thousand mornings in a room nobody enters, and today somebody finally files. He does not start anything: his twelve is built out of the seven decks you were handed, each one aimed back at the habit it taught you.',
      lock: 'Clear The Wrecker',
      enemy12: [
        'huaxia-qin-shi-huang',
        'huaxia-zhuge-liang',
        'genesis-michael',
        'genesis-azrael',
        'transylvania-monster',
        'transylvania-carmilla',
        'asgard-thor',
        'asgard-fenrir',
        'devas-vishnu',
        'devas-kali',
        'tortuga-davy-jones',
        'tortuga-kraken',
      ],
      botSix: [
        'huaxia-qin-shi-huang',
        'huaxia-zhuge-liang',
        'genesis-michael',
        'genesis-azrael',
        'transylvania-monster',
        'transylvania-carmilla',
      ],
      grants: { choice: { count: 2 }, coins: 300 },
      resultWin: '"I will not have my first audit in four hundred years thrown out on procedure," he says. "It will not be."',
      resultLose: '"Four thousand years is not devotion," he says. "Devotion gets tired. Four thousand years is procedure."',
    },
    {
      id: 20,
      key: 'asmodeus-the-redactor',
      rival: 'Asmodeus, the Redactor',
      portrait: null,
      mode: 'set',
      aiProfile: 'redactor',
      reactiveDialogue: true,
      format: 'Unabridged best-of-3 - the final',
      terrain: 'The Concord floor',
      fightCard: ['energy-void', 'mirror-realm', 'heros-trial'],
      line: 'The voice that has read every ruling for four hundred years, and the hand that chose which lines were read at all. He fields the sins, and every one of them buys its power at a stated, visible price - which is what four hundred years of tidy history has been.',
      lock: 'Clear The Auditor',
      enemy12: [
        'pandemonium-pride',
        'pandemonium-wrath',
        'pandemonium-envy',
        'pandemonium-greed',
        'pandemonium-gluttony',
        'pandemonium-sloth',
        'pandemonium-lust',
        'grimmwood-evil-queen',
        'grimmwood-rapunzel',
        'grimmwood-big-bad-wolf',
        'sherwood-guy-of-gisborne',
        'camelot-merlin',
      ],
      botSix: [
        'pandemonium-pride',
        'pandemonium-wrath',
        'pandemonium-envy',
        'pandemonium-greed',
        'pandemonium-gluttony',
        'pandemonium-sloth',
      ],
      banProfile: { power: true },
      banTell: '"The record will reflect that you were never permitted them." He takes your two strongest.',
      grants: { legendPack: 'pandemonium-pride', companion: 'pandemonium-greed', coins: 600 },
      resultWin: '"You want one line," he says. "I was protecting a hundred years of peace from one line. Tell me which of us was being selfish, and be honest about the answer."',
      resultLose: '"An institution that admits fallibility stops being obeyed," he says. "I watched the century that followed the last time. You did not."',
    },
  ];

  /* ---------------------------------------------------------
     DIALOGUE. Pre-fight scenes keyed by gate id, then epilogues.
     Same contract as Chapter I: `final: true` closes the scene, and
     `battle: true` turns the Next button into Fight.

     The epilogues follow Chapter I's corrected law (2026-08-18d): a
     rival OFFERS rather than asserting arrival, because Normal is a
     coins-only tier and "X joins your echoes" is false there.
     --------------------------------------------------------- */
  var DIALOGUES = {
    11: [
      {
        speaker: 'Sargon',
        text: 'He cannot hold a tablet steady any more, so he holds the petition against his chest with both hands. "Four hundred years ago a scribe put my name on another man\'s victories. I have asked eleven times to have it corrected. This is the twelfth, and I cannot fight it myself."',
      },
      {
        speaker: 'Sargon',
        text: '"You have no name of your own. I have a name that is not mine. Between us that is almost one honest man." He does not smile. "Fight my twelfth."',
      },
      {
        speaker: 'The Understudy',
        text: 'She is stretching her shoulders when you arrive, entirely unbothered. "Somebody is paying me to lose this one convincingly. Third Concord running. It is honest work and I am very good at it."',
        battle: true,
      },
    ],
    12: [
      {
        speaker: 'The Bookmaker',
        text: 'He chalks a number beside your name without looking up. "Eleven to two against. I would take it, if I were the sort of person who took my own prices."',
      },
      {
        speaker: 'The Bookmaker',
        text: '"I will fund the twelfth petition. Filing costs, witnesses, the entire week." He sets down the chalk. "In exchange for a debt, payable later, terms unspecified. That is what a debt IS. If you knew the price you would call it a purchase."',
        battle: true,
      },
    ],
    13: [
      {
        speaker: 'The Herald',
        text: 'He reads the charge sheet aloud before he fights, because that is the office. "I am told the petitioner is a liar. I am also told not to ask who told me."',
      },
      {
        speaker: 'The Herald',
        text: 'He folds the sheet away. "Only one of those instructions I intend to keep."',
        battle: true,
      },
    ],
    14: [
      {
        speaker: 'The Collector',
        text: 'The vault under the city is colder than the street above it, and larger. "Nine traditions have collapsed since I started keeping. I have the whole of each of them. Catalogued."',
      },
      {
        speaker: 'The Collector',
        text: '"The original account of your mercenary\'s war is on the fourth shelf. I will not lend it, sell it, or copy it." She does not sound unkind. "Everything I have was saved by refusing exactly those three requests from more sympathetic people than you."',
        battle: true,
      },
    ],
    15: [
      {
        speaker: 'Sargon',
        text: 'The account is four hundred years old and entirely unedited. You read it aloud to him, because he cannot hold it. He held a bridge for two days with forty people. Eleven hundred civilians crossed the river behind him. He died on the second afternoon in a way that was neither noble nor quick.',
      },
      {
        speaker: 'Sargon',
        text: '"The Canon did not invent it," he says. "It tidied it. It took out the forty names. It took out the vomiting, and the sergeant I held at knifepoint to keep the line, and the fact that I was on that bridge at all because I misjudged the retreat and was too proud to say so."',
      },
      {
        speaker: 'Sargon',
        text: 'He is quiet for a while. "I was never correcting a record. I was refusing a compliment. For four centuries." He reaches for the petition. "Withdraw it."',
      },
      {
        speaker: 'The Concord',
        text: 'He is entitled to withdraw, and he does. Procedure is equally clear: a claimant may take over an abandoned petition by defeating the version of the petitioner that stands in the book. On the floor, the Canon\'s Sargon is already waiting - the speech, the banner, the last stand, forty men it does not name.',
        battle: true,
      },
    ],
    16: [
      {
        speaker: 'The Undertaker',
        text: '"I buried a world once. Properly. Prophesied, attended, a field growing back over it the following spring." He looks around the pavilions with open contempt. "Then I came here, where nothing is allowed to finish."',
      },
      {
        speaker: 'The Undertaker',
        text: '"I have read your record too. Every one of his forty is still stood on that bridge because he will not let them off it." He rolls his shoulders. "Ask yourself who the Canon is serving now."',
        battle: true,
      },
    ],
    17: [
      {
        speaker: 'The Mason',
        text: 'She has brought the same proposal to every Concord for eleven centuries: the Canon should expire yearly, not once a century. It has never reached a vote. "It is obviously fairer and completely unworkable. Both things are true and only one of them is interesting."',
      },
      {
        speaker: 'The Mason',
        text: '"Back annual revision in public and my influence is behind your petition tomorrow." She lets that sit. "You think it would wreck the thing you are trying to fix. You are probably right. Decide anyway."',
        battle: true,
      },
    ],
    18: [
      {
        speaker: 'The Wrecker',
        text: 'She has the Canon under her arm. She is not hiding it. "Everyone in this city says the Canon like it is a mountain. It weighs four pounds. I have carried heavier by accident."',
      },
      {
        speaker: 'The Wrecker',
        text: '"Take it. No trick - a stolen Canon is worthless to someone nobody will trade with." She holds it out. "Use it before the ruling and your line is corrected tonight, in front of everyone, by theft. Or beat me for the privilege of doing it the slow way."',
        battle: true,
      },
    ],
    19: [
      {
        speaker: 'The Auditor',
        text: 'An office nobody has needed in four hundred years, kept by a functionary of an empire that no longer exists. He has the hours chalked on the door. He keeps them. "Somebody filed. I had begun to think nobody would."',
      },
      {
        speaker: 'The Auditor',
        text: '"A petition granted without proof of competence is overturned within a century." He sets out twelve cards, all of them yours in every way that matters - the schedule, the theft, the ramp, the two-card kill. "I will not have my first audit in four hundred years thrown out on procedure."',
        battle: true,
      },
    ],
    20: [
      {
        speaker: 'Asmodeus',
        text: 'The archive found the error two centuries ago and buried it, because a Canon that admits one mistake admits the possibility of all of them. The man who buried it reads every ruling aloud, and has done for four hundred years. He does not pretend otherwise.',
      },
      {
        speaker: 'Asmodeus',
        text: '"You want one line," he says. "I am protecting a hundred years of peace from one line. Tell me which of us is being selfish, and be honest about the answer."',
        battle: true,
      },
    ],
  };

  var EPILOGUES = {
    11: [
      {
        speaker: 'The Understudy',
        text: '"Everyone here is bought. The trick is knowing what for." She collects her eleven silver from a man who is no longer smiling. "I went for that and a fair opinion of a dead mercenary. I intend to deliver both."',
      },
      {
        speaker: 'The Understudy',
        text: 'She pushes two of her own across the bench - the tactician and the runner. "They are not finished either. That is the point of them." The Bookmaker is already chalking tomorrow\'s price.',
        final: true,
      },
    ],
    12: [
      {
        speaker: 'The Bookmaker',
        text: 'He wipes your odds off the board without complaint. "You waited. Nobody waits." He offers the monkey king and the general - an empire\'s court, run like a ledger. "I have never lied to a bettor. I simply noticed that nobody reads the back of the tablet."',
        final: true,
      },
    ],
    13: [
      {
        speaker: 'The Herald',
        text: 'Mid-gate an official pressed a ruling into his hand that would have ended it. He refused it, gave no reason, and lost. He offers the appointed hour and the healer. "Do not thank me. I do not yet know what I did."',
        final: true,
      },
    ],
    14: [
      {
        speaker: 'The Collector',
        text: 'She brings up the account herself, and the two who kept it. "Read it in the vault. It does not leave." Her hand stays flat on the case a moment longer than it needs to. "Everything I have was saved by refusing. This is the first time refusing was the wrong instrument."',
        final: true,
      },
    ],
    15: [
      {
        speaker: 'Sargon',
        text: 'The entry stops mid-sentence and does not finish it. At the rail, the real one says the forty names out loud, in order, for the first time since the bridge. It takes some minutes. He gets two of them wrong and has to check.',
      },
      {
        speaker: 'Sargon',
        text: 'He does not thank you. "You did not withdraw it," he says, as though reporting a fact about the weather. Then, later, quieter: "Neither did they."',
        final: true,
      },
    ],
    16: [
      {
        speaker: 'The Undertaker',
        text: 'He offers the all-father and the wolf without ceremony. "You closed it before the third death. Most people trade." He looks at the pavilions again. "I still think the honest answer is a bonfire. Prove me wrong in front of everyone tomorrow and I will carry the water myself."',
        final: true,
      },
    ],
    17: [
      {
        speaker: 'The Mason',
        text: '"You killed the setup," she says, packing away the wax. "Eleven centuries and you are the third." She sets down the remover and the destroyer. "We are the same complaint at different volumes. Only one of us has been polite about it."',
        final: true,
      },
    ],
    18: [
      {
        speaker: 'The Wrecker',
        text: 'She puts the Canon back on its stand, which surprises the guards more than the theft did. "You committed late. Nothing to lift." The captain and the drowned man change hands instead. "Do it the slow way, then. I will be watching from the cheap seats, which is where the honest people sit."',
        final: true,
      },
    ],
    19: [
      {
        speaker: 'The Auditor',
        text: 'He opens the book. The holders did not forge the entry - a scribe did, carelessly, exactly as Sargon has said for four hundred years. They found the error two centuries ago and buried it, because impartiality that admits error is not impartiality any more.',
      },
      {
        speaker: 'The Auditor',
        text: '"The sword-bearer on day three was never told why," he says. "He declined to win anyway. Remember that tomorrow, when the man who WAS told is standing in front of you." He grants you standing, and a choice of what to carry.',
        final: true,
      },
    ],
    20: [
      {
        speaker: 'Asmodeus',
        text: 'He does not argue the ruling. He reads it out, in the voice that has read every ruling for four centuries, and it is the first time in two hundred years that what he says aloud and what he knows are the same sentence.',
      },
      {
        speaker: 'The Wayfarer',
        text: 'You hold the Canon for a day and a half - the shortest tenure in the history of the Concord. The line is corrected. The audit is published. The century is abolished: the Canon now passes whenever a petition is proven, by audit, by anyone.',
      },
      {
        speaker: 'Sargon',
        text: 'The corrected entry has the misjudgement in it, and the knifepoint, and the vomiting, and the forty names. Crowds do not cheer it. Within thirty years nobody performs it at all, because it is not performable. He goes thin anyway - slower, on his own terms, with somebody reading the true version aloud to him.',
      },
      {
        speaker: 'The Auditor',
        text: 'He stops you at the gate and hands over a blank tablet. "Petition form. For when you want your own line looked at." - "I do not have a line." - "No," he agrees. "That is generally the point at which people begin one."',
        final: true,
      },
    ],
  };

  var INTRO = [
    {
      speaker: 'The Concord',
      text: 'Every hundred years, in a city that exists for one week and is dismantled afterwards, the dead settle the only thing they still genuinely disagree about: whose version is true. The winner holds the Canon for a century - the authority to say how every contested legend is remembered.',
    },
    {
      speaker: 'The Concord',
      text: 'It has worked for four hundred years. That is the problem.',
    },
    {
      speaker: 'Sargon',
      text: 'A mercenary captain with no relation to the king of the same name - and that is the joke of his entire afterlife - is going thin. Within the year there will be a hero in the Canon and nobody left behind it. A petitioner must fight his own gate, and he can no longer lift a sword.',
    },
    {
      speaker: 'Sargon',
      text: 'So he goes looking for someone whose entire nature is carrying other people\'s stories.',
      final: true,
    },
  ];

  window.EOL.campaignCh2 = {
    id: 2,
    title: 'The Hundred-Year Truce',
    subtitle: 'One city, one week, and the authority to say what happened.',
    /* Chapter II starts from the full Chapter I shelf - the player
       arrives with a finished collection, which is the premise of the
       whole difficulty curve. There is no starter deck to grant. */
    starterDeck: null,
    bossFaction: BOSS_FACTION,
    bossCard: ASMODEUS,
    /* Chapter II's ledger is a different object owned by a different
       person: the Concord keeps a REGISTER of scheduled gates, and the
       one man who still reads it is the Auditor at gate XIX. Its empty
       page is his voice, not the Recruiter's. */
    ledger: {
      title: 'The Concord Register',
      icon: 'ri-file-list-3-line',
      aria: 'Open the Concord Register',
      empty: 'Not yet scheduled. The register is kept in order, and order is the only thing it is kept in.',
    },
    stages: STAGES,
    dialogues: DIALOGUES,
    epilogues: EPILOGUES,
    intro: INTRO,
    epilogue: EPILOGUES[20],
  };
})();
