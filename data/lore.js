/* =============================================================
 * Echoes of Legend - LEGEND LORE
 * -------------------------------------------------------------
 * Two or three sentences of prose per legend, shown in the card
 * detail panel (js/card-detail.js).
 *
 * WHY THIS IS ITS OWN FILE
 *
 *   The faction files are mechanics: stats, specs, effect trees.
 *   Prose interleaved with `{ k: 'dmg', power: 1.3 }` makes both
 *   harder to read and turns every copy edit into a diff against
 *   balance data. Keeping the writing in one place also makes
 *   coverage checkable at a glance - sim/verify_all.js asserts
 *   that every card in the roster has an entry here.
 *
 * HOUSE STYLE (docs/CharacterGuidelines.md)
 *
 *   - Present tense. These legends are not remembered, they are
 *     PRESENT - that is the whole premise of the game.
 *   - Say what the myth is, then what this version of them wants.
 *     The second half is what makes them a card rather than an
 *     encyclopedia entry.
 *   - The prose must agree with the Signature Skill. If a card
 *     heals its allies, the lore does not call them a loner.
 *   - No rules vocabulary. Never "Provoke", "Exposed", "Marked",
 *     "Energy" - the skill text on the same panel already says
 *     that, in the exact words the engine means. Lore says why.
 *   - Never name the player, a faction leader, or a campaign
 *     event. Cards outlive chapters.
 *
 * Registered onto the cards by attach() at the bottom, so
 * `card.lore` behaves exactly like a field authored in the data
 * file. Loaded AFTER the faction files in index.html.
 * ============================================================= */

window.EOL = window.EOL || {};

window.EOL.legendLore = {
  /* ---------------- Camelot - oaths of steel ---------------- */
  'camelot-king-arthur':
    'The sword said king, so king he became, and the weight of it has never once left his shoulders. Arthur measures his reign in the wounds he takes for other people; a knight who bleeds where he can see it is a failure of his own body, not theirs.',
  'camelot-merlin':
    'He remembers forwards. Every counsel Merlin gives has already been given, argued and regretted somewhere further along the line, which is why he sounds tired when he tells you the obvious - and why the obvious keeps turning out to be right.',
  'camelot-lancelot':
    'The finest blade Camelot ever raised, and the one crack in its foundation. Lancelot fights best beside people he is failing, so he never leaves the line: every ally still standing is one more day the reckoning waits.',
  'camelot-morgan-le-fay':
    'She was refused a place at the table, so she learned the shape of the room instead. Morgan does not break a shield - she convinces the arm behind it that the blow already landed, and the arm believes her.',
  'camelot-guinevere':
    'A queen without a sword is still the reason the swords hold. Guinevere walks the aftermath of every charge, and the knights who came back have all, at some point, come back because of her.',
  'camelot-mordred':
    'He is what the prophecy promised, and he is sick of being told so. Mordred aims at whatever is already failing - the wounded, the weakened, the crown itself - because a legend written before he was born deserves no better than the shortest road to its ending.',

  /* ---------------- Olympus - thunder on the throne ---------------- */
  'olympus-zeus':
    'Judgement first, thunder second. Zeus marks what has displeased him and lets the sky remember the verdict; by the time the bolt falls, the sentence is a formality that everyone present has already read.',
  'olympus-athena':
    'She has read the battle before it is fought and found it wanting. Athena wins by making the enemy expensive to be - every spell they cast tells her something, and everything she learns costs them the next one.',
  'olympus-hercules':
    'Twelve impossible labours, and the twelfth one is not being angry about the other eleven. Hercules plants himself between his people and the worst of it because that is the only work he has ever been given that he actually chose.',
  'olympus-apollo':
    'Light heals and light reveals, and he has never been able to do one without the other. Apollo mends his allies in the same breath that he shows them exactly which enemy is about to matter most.',
  'olympus-medusa':
    'She did nothing, and was made a monster for it. Now Medusa simply waits: look at her, raise a hand to her, and the punishment is your own, delivered by the same gaze the gods thought was a curse.',
  'olympus-ares':
    'Not the god of victory - the god of the part everyone pretends not to enjoy. Ares grows stronger with every blow he lands, and the burning ones are the ones he goes back for.',

  /* ---------------- Yamato - the rising sun ---------------- */
  'yamato-minamoto-no-yoshitsune':
    'A tactician who fights like a rumour: never where the drums say, always where the line is thinnest. Yoshitsune spends everything on the decisive stroke and trusts the kill itself to pay for the next one.',
  'yamato-tomoe-gozen':
    'A hundred archers can loose at a wall. Tomoe looses once, at the one throat that was holding the wall together, and takes the enemy\u2019s momentum home with her as spoils.',
  'yamato-benkei':
    'The warrior monk who died standing and did not fall down, because falling had not been agreed to. Benkei treats his own death as an administrative error to be contested later, and holds the bridge in the meantime.',
  'yamato-abe-no-seimei':
    'He does not curse you. He reads the omen already written over you and simply declines to look away until it comes true. What Seimei seals arrives at the end of the round, punctual as weather.',
  'yamato-momotaro':
    'Born from a peach, raised on millet dumplings, followed to the demon island by everything he ever shared them with. Momotaro\u2019s strength was never his own - it is the dog, the monkey, the pheasant, and the habit of feeding people first.',
  'yamato-kaguya':
    'The moon has already sent for her, and she is not going quietly. Kaguya reflects the brilliance of those around her back at the field, borrowing their light because her own is on loan and she knows the term.',

  /* ---------------- Grimmwood - every tale has teeth ---------------- */
  'grimmwood-hansel-gretel':
    'Hansel and Gretel walked into the dark on purpose the second time. They have learned that the woods take whatever is alone, so they never are - one shield, always split, and a trail of crumbs that leads their people back out.',
  'grimmwood-rumpelstiltskin':
    'He will help. Rumpelstiltskin always helps. The terms are agreed before the gold is spun and the price is never the one you were watching for - and whichever way the bargain falls, it was the side he offered you.',
  'grimmwood-big-bad-wolf':
    'Not a beast in the woods; the woods\u2019 own appetite, wearing a shape you will recognise. The Wolf feeds on what is already bleeding, and every mouthful closes his own wounds.',
  'grimmwood-snow-white':
    'Poisoned, buried, and still the first to kneel beside somebody worse off. Snow White\u2019s gentleness is not innocence - it is a decision she keeps making in a forest that has given her every reason not to.',
  'grimmwood-red-riding-hood':
    'She went back into the woods with the hood and an axe. Red hunts what hunts, and the sight of a wounded enemy steadies her hands rather than turning her stomach.',
  'grimmwood-pied-piper':
    'He was cheated of his fee once and has never taken payment on credit since. The Piper does not fight so much as arrange the enemy - a tune, a direction, and the debt collected from whoever was already stumbling.',
  'grimmwood-gingerbread-man':
    'Run, run, as fast as you can. He is a lure with legs and he knows it: the Gingerbread Man buys his side whole rounds simply by being the most infuriating thing on the field to chase.',
  'grimmwood-evil-queen':
    'The mirror never lies, and she has never once asked it a question she wanted answered honestly. The Queen strikes the whole room, then turns the glass on whoever is standing tallest.',
  'grimmwood-puss-in-boots':
    'Boots, hat, sword, and a completely fictional marquis he invented on a riverbank. Puss wins the fights nobody thought were fights yet, and slips past a guard by convincing everyone the guard was somewhere else.',
  'grimmwood-rapunzel':
    'Twenty years in a tower with nothing to practise on but her own hair and her own patience. Rapunzel reaches the ones who thought distance was safety, and lets them down.',
  'grimmwood-goldilocks':
    'Too hot, too cold, and then exactly right - a burglar with standards. Goldilocks ignores the healthy and the doomed alike, waiting for the enemy who has arrived precisely in the middle.',
  'grimmwood-cinderella':
    'Everything she was given was taken back at midnight, so she has become very good at giving things that stay. Cinderella lifts a curse the way she once lifted ashes: completely, and without being asked twice.',

  /* ---------------- Sherwood - rob the rich ---------------- */
  'sherwood-guy-of-gisborne':
    'The sheriff\u2019s hound, and the only man in Nottingham who takes the outlaws seriously. Gisborne does not stop when a target breaks - breaking is the point at which he starts hitting harder.',
  'sherwood-robin-hood':
    'Robin does not shoot the nearest man. He shoots the man the nearest man is waiting on - the loudest, the richest, the best armed - and the forest is quiet for a moment afterwards.',
  'sherwood-will-scarlet':
    'A duellist in a company of ambushers, which is a joke the others have stopped making. Will picks one opponent and refuses to be interested in anybody else until the matter is settled.',
  'sherwood-little-john':
    'Seven feet of quarterstaff manners. John\u2019s answer to a river, a bridge or a battle line is the same: stand in the middle of it, and make going around him somebody else\u2019s problem.',
  'sherwood-maid-marian':
    'She is not waiting in a tower for news of the fight; she is the reason there is anyone left to bring news back. Every time an outlaw does something reckless and brilliant, Marian is already moving toward whoever it cost.',
  'sherwood-friar-tuck':
    'A fighting friar with a sermon for every occasion and no patience for any of them. Tuck talks an enemy down - literally down, in increments - and hits hardest on the ones already having a bad day.',

  /* ---------------- Huaxia - where the dragon sleeps ---------------- */
  'huaxia-qin-shi-huang':
    'Qin Shi Huang unified an empire and then built a wall around the idea so it could not change its mind. The First Emperor condemns a whole rank of enemies for the record, and raises stone over his own people in the same decree.',
  'huaxia-lu-bu':
    'The mightiest warrior of the age and the least reliable ally in it. Lu Bu goes where the killing is best, and every man who falls to his halberd buys him the strength to reach the next one.',
  'huaxia-zhuge-liang':
    'The fan moves, the array closes, and the enemy discovers they agreed to this some time ago. Zhuge Liang wins by arithmetic - what the opposition can afford, minus what he has just taken from them.',
  'huaxia-guan-yu':
    'Loyalty made solid enough to stand behind. Guan Yu holds the front because his oath said he would, and anyone who tests the blade finds the crescent already coming back the other way.',
  'huaxia-hua-tuo':
    'The physician who treated warlords and peasants at the same price and was executed for the inconvenience. Hua Tuo reads a body the way a general reads ground, and mends what is wrong before it becomes what is fatal.',
  'huaxia-huang-zhong':
    'Old, and unbearably precise about it. Huang Zhong finds the enemy who is nearly finished and finishes them, because a veteran does not waste an arrow proving he is still young.',
  'huaxia-sun-wukong':
    'Seventy-two shapes, one immovable ego, and a name scratched out of the ledger of the dead by his own hand. Kill Sun Wukong once and the Monkey King comes back cleaner, angrier and considerably harder to hit.',
  'huaxia-nezha':
    'A child who returned his own flesh to his father and was rebuilt out of lotus and spite. Nezha strikes twice at anything already wounded, wheels burning, far too fast for the dignity of heaven.',
  'huaxia-mulan':
    'She took her father\u2019s place expecting to die politely and discovered she was extremely good at not dying. Mulan sharpens the moment her people start falling - grief arriving, as usual, in the shape of resolve.',

  /* ---------------- Roma - the eternal city ---------------- */
  'roma-julius-caesar':
    'He came, he saw, and the third part was never in question. Caesar converts a victory directly into the next one, and every enemy that falls to him is an argument for his own inevitability.',
  'roma-spartacus':
    'They gave him a sword to entertain them and were slow to see the flaw. Spartacus turns every ally\u2019s death into the whole line\u2019s fury - the one revolt Rome could never quite finish explaining away.',
  'roma-augustus':
    'The peace of Rome, paid for in other people\u2019s provinces. Augustus keeps his legions whole with an administrator\u2019s calm: a victory reported, and the wounded seen to before the cheering stops.',
  'roma-cicero':
    'The finest voice in the Senate, deployed as a weapon of war. Cicero takes an enemy\u2019s speech from them first, then their composure, then whatever they were about to spend it on.',
  'roma-brutus':
    'The honourable man, which is the cruellest thing anyone ever called him. Brutus goes for whoever is strongest and best protected, because a knife is only worth drawing on someone who thought they were safe.',
  'roma-constantine-the-great':
    'He saw the sign, and made an empire change its gods to match. Constantine leads with light across the whole front rank, and a victory under that banner lifts every soldier who witnessed it.',

  /* ---------------- Takamagahara - the plain of high heaven ---------------- */
  'takamagahara-amaterasu':
    'She hid in a cave once and the world learned exactly what her absence was worth. Amaterasu burns the field entire, and where her light finishes something, her people are made whole in the same moment.',
  'takamagahara-tsukuyomi':
    'He killed a goddess over table manners and has not spoken to his sister since. Tsukuyomi\u2019s reproach falls in silence - two enemies quieted at once, and the guilty ones quieted hardest.',
  'takamagahara-izanami':
    'A thousand a day, she promised, and she has never once been late. Izanami is nourished by loss: every ally who falls sharpens her and weakens everything still standing opposite.',
  'takamagahara-inari':
    'Foxes, rice and very careful accounting. Inari collects on suffering already inflicted - the more the enemy is carrying, the richer her return, and the offering always comes back to her people as fuel.',
  'takamagahara-izanagi':
    'He went into the land of the dead for his wife and came back needing to wash. Izanagi\u2019s purification is total: whatever clings to an ally is simply no longer part of them, and the river gives back more than it takes.',
  'takamagahara-susanoo':
    'Thrown out of heaven for being a storm indoors, and redeemed by killing something worse. Susanoo answers every blow struck at him with lightning, and steps in front of anyone about to go under.',

  /* ---------------- Duat - the scales do not blink ---------------- */
  'duat-anubis':
    'He does not hate you and he will not be hurried. Anubis weighs what is left of a heart, and when it is light enough to lift, the verdict is instant, exact and final.',
  'duat-horus':
    'The eye that does not close. Horus has been at war with his uncle for long enough to have run out of hiding places to respect - a raised shield or a back rank is a detail, not a defence.',
  'duat-maat':
    'Not a goddess of mercy. A goddess of the measurement. Ma\u2019at lays her feather against every heart in the room at once, and the heaviest are found wanting first.',
  'duat-sekhmet':
    'Sent to punish humanity and stopped only by being tricked into drinking until she slept. Sekhmet\u2019s breath spreads through a whole line: the burning suffer most, and nothing she touches mends easily.',
  'duat-isis':
    'She gathered her husband out of the pieces the river gave back, and nobody has told her a thing is finished since. Isis returns the fallen to the field because she has done it before, under worse conditions.',
  'duat-nephthys':
    'The mourner at the edge of the lamplight, who was there for the gathering and asked for no part of the credit. Nephthys covers whoever is closest to the end - and the veil holds tightest when it is needed most.',
};

/* Attach to the roster. Written as a merge rather than a lookup so
   `card.lore` behaves exactly like a field authored in the faction
   file - every consumer reads one shape, and a card whose lore has
   not been written yet is simply undefined rather than a special
   case at every call site. */
(function attach() {
  var lore = window.EOL.legendLore;
  (window.EOL.factions || []).forEach(function (f) {
    f.cards.forEach(function (c) {
      if (lore[c.id]) c.lore = lore[c.id];
    });
  });
})();
