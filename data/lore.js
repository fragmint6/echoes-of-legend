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
  'olympus-poseidon':
    'The sea does not defend a coastline so much as decide where it is. Poseidon plants his trident and the fight rearranges itself around him - and everyone who swings at him has, without noticing, agreed to be found.',
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
  'yamato-miyamoto-musashi':
    'Sixty-one duels and not one of them a second exchange. Musashi reads a stranger the way other men read weather, and by the time the blade moves he has already decided which of the two of them is going home - so he prefers them whole, unhurried, and certain they will win.',
  'kami-kaguya':
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

  /* ---------------- Kami - the plain of high heaven ---------------- */
  'kami-amaterasu':
    'She hid in a cave once and the world learned exactly what her absence was worth. Amaterasu burns the field entire, and where her light finishes something, her people are made whole in the same moment.',
  'kami-tsukuyomi':
    'He killed a goddess over table manners and has not spoken to his sister since. Tsukuyomi\u2019s reproach falls in silence - two enemies quieted at once, and the guilty ones quieted hardest.',
  'kami-izanami':
    'A thousand a day, she promised, and she has never once been late. Izanami is nourished by loss: every ally who falls sharpens her and weakens everything still standing opposite.',
  'kami-inari':
    'Foxes, rice and very careful accounting. Inari collects on suffering already inflicted - the more the enemy is carrying, the richer her return, and the offering always comes back to her people as fuel.',
  'kami-izanagi':
    'He went into the land of the dead for his wife and came back needing to wash. Izanagi\u2019s purification is total: whatever clings to an ally is simply no longer part of them, and the river gives back more than it takes.',
  'kami-susanoo':
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

  /* ================= CHAPTER II FACTIONS =================
     Seven factions added 2026-08-17. Same house style: present
     tense, no rules vocabulary, and the prose names its own
     legend so a mis-pasted entry fails sim/verify_all.js. */
  'asgard-odin':
    'He traded an eye for the sight of how it ends, and the trade was worth it only if he can look at the ending without flinching. Odin has been rehearsing that steadiness for a very long age; the ravens bring him nothing now that he has not already grieved.',
  'asgard-thor':
    'The simplest thing on any field. Thor does not read the prophecy or argue with it - he finds whatever is largest and hits it, on the reasoning that a world about to end deserves at least one person still doing the obvious job well.',
  'asgard-fenrir':
    'The ribbon that holds him is soft as a cat\'s footfall and it has held for a thousand years, because the gods asked nicely and a hand was left in his mouth as the price. Fenrir is patient the way a held breath is patient. He is counting.',
  'asgard-hel':
    'Half her face is a woman and half is what is left afterwards, and she has never once found that remarkable. Hel keeps the ones nobody sings about, and she is unhurried, because everyone arrives eventually and she has room.',
  'asgard-loki':
    'He is not on anyone\'s side, including his own, and he is the only one honest about it. Loki\'s worst moment is always his last one - whatever he has been saving comes out when the room finally stops him, and the room is never ready.',
  'asgard-freyja':
    'She takes first pick of the slain, before the hall of the brave gets a look, and she chooses the ones nobody else would have carried home. Freyja\'s hall is not a reward. It is a place to put people down gently.',
  'asgard-heimdall':
    'He can hear grass growing and wool lengthening on a sheep, and he has not slept in an age of the world. Heimdall stands at the bridge because someone has to be awake when it starts, and he intends to be the one who says so first.',
  'hemithea-achilles':
    'He was offered a long quiet life and turned it down for a short loud one, and the arithmetic still satisfies him. Achilles is best when something has finally hurt him - grief is the only fuel he has ever really trusted.',
  'hemithea-odysseus':
    'Ten years to get home and he is still the only person in any room thinking three moves ahead. Odysseus does not fight what is in front of him; he arranges for it to be somewhere less convenient first, then walks through the gap.',
  'hemithea-perseus':
    'A boy sent to fetch a monster\'s head as a joke, who came back with it. Perseus has been dangerous ever since he learned that the thing everyone fears can be carried in a bag if you are willing to look away at the right moment.',
  'hemithea-medea':
    'She knows the herb that undoes death and she has used it on people who did not deserve it, which is a thing she thinks about. Medea will bring your friend back once. What that costs her is not written on the label.',
  'hemithea-atalanta':
    'Raised by a bear, faster than every suitor, and first spear into the boar that half of Greece had failed to kill. Atalanta hunts what is still whole and still proud - wounded things bore her, and she has never pretended otherwise.',
  'hemithea-ajax':
    'The biggest shield on the field, seven layers of oxhide, and a man who genuinely believes it is his job to stand where the arrows are going. Ajax is steady while he is standing. Everyone around him has learned to rely on that.',
  'hemithea-hercules':
    'Twelve impossible labours, and the twelfth one is not being angry about the other eleven. Hercules plants himself between his people and the worst of it because that is the only work he has ever been given that he actually chose.',
  'hemithea-jason':
    'He did not row the ship or kill the dragon or win the fleece alone - he got the right people onto one deck and kept them there. Jason\'s talent is the crew, and he would rather be remembered for the roster than the voyage.',
  'pandemonium-pride':
    'The first refusal, and still the purest. Pride would rather burn on his own terms than be mended on anyone else\'s, and he means it so completely that help offered to him simply slides off and lands somewhere useless.',
  'pandemonium-wrath':
    'There is a point in every argument where the words stop mattering, and Wrath lives just past it. He gets stronger the longer he goes and he stops guarding anything at all, which he considers a fair exchange.',
  'pandemonium-envy':
    'He is never quite anyone, because being someone would mean giving up the option of being whoever is currently winning. Envy takes what looks best on you, wears it badly, and hates you slightly more for having had it first.',
  'pandemonium-greed':
    'He does not spend. That is the whole of him. Greed simply arranges for a little more to arrive on his side of the table each time the table is set, and for a little less to arrive on yours, forever.',
  'pandemonium-gluttony':
    'The hunger is not for food and never was - it is for the reassurance of taking something in. Gluttony feeds himself first, always, and has never once been embarrassed about it in front of people who needed feeding more.',
  'pandemonium-sloth':
    'He is not lazy. He is unhurried in a way that is genuinely frightening, because it means he has decided nothing here is worth his hurry. Sloth does nothing today so that what he does tomorrow lands twice as hard.',
  'pandemonium-lust':
    'Not desire - the wanting of being wanted. Lust turns whoever he touches into the centre of the room, and everything aimed at that room follows them there, which is exactly the fate they were asking for.',
  'devas-shiva':
    'He dances and the world keeps time to it, and when he stops the world stops too. Shiva is not cruel about this; destruction is simply the half of the job nobody volunteers for, and he has never asked to be relieved.',
  'devas-vishnu':
    'He has come down ten times wearing ten different lives, and each one was a whole existence lived properly, not a costume. Vishnu preserves things - patiently, repeatedly, and with the tiredness of someone who knows he will be back.',
  'devas-kali':
    'She is what happens when the protecting stops being polite. Kali wears the count of what she has ended and does not apologise for the necklace, because someone asked her to save them and she did.',
  'devas-durga':
    'Made from the combined fury of every god who had run out of ideas, riding a lion into a fight they had already lost. Durga does not retreat and has never learned how - the whole point of her is that the line holds.',
  'devas-ganesha':
    'He sits at the start of things, and whatever is in the way of the start, he moves. Ganesha writes down what is dictated to him even when he disagrees, then quietly removes the obstacle nobody else had noticed.',
  'devas-hanuman':
    'He forgot he could leap oceans until someone reminded him, which is the most useful thing anyone has ever said to him. Hanuman goes over the top of the problem and lands behind it, cheerfully, before anyone has agreed he can.',
  'devas-indra':
    'King of the gods on a good day and a cautionary tale on the rest, armed with a weapon made from a sage\'s own bones. Indra throws the thunderbolt at whatever has already been singled out, and rarely asks who did the singling.',
  'genesis-lucifer':
    'He was the brightest of them and the argument he lost was about service, not about evil. Lucifer still pronounces sentence in the old formal way, and still pays for the privilege out of his own light every time he does it.',
  'genesis-michael':
    'The one sent when the discussion is over. Michael carries a sword that was never meant for duels, only for endings, and he is unfailingly courteous right up until the moment he is not.',
  'genesis-azrael':
    'He does not chase and he does not rush. Azrael writes a name and an hour, and the hour comes - whether he is still standing in the room when it arrives is a detail that has never once affected the outcome.',
  'genesis-gabriel':
    'The voice that tells you what is coming, which is a mercy and also the opposite of one. Gabriel announces things, and announced things have a way of arriving sooner than the people who heard them expected.',
  'genesis-raphael':
    'He walked a boy across a country under a false name to teach him how to cure his father, and never once broke character. Raphael undoes what has been set in motion; he is the reason a sentence is not always final.',
  'genesis-adam':
    'The first body, and the first sentence passed on one. Adam stands in front of the others because he has already been told exactly what it costs and exactly when it arrives - and the whole point of him is that the species outlives the arithmetic.',
  'genesis-uriel':
    'He holds the flame at the gate of the garden, and the flame is not a threat so much as a fact about the door. Uriel sets things alight and lets the burning do the arguing while everyone waits.',
  'genesis-metatron':
    'He keeps the record, which means he decides what the record says. Metatron can close a mouth mid-sentence and has done it often enough that most of the host chooses its words carefully around him.',
  'transylvania-dracula':
    'Old, courteous, and entirely uninterested in your consent. Dracula takes a little from everyone in the room and wears it better than any of them did, which he considers the natural order rather than a theft.',
  'transylvania-monster':
    'He learned to speak by listening at a wall, learned to read from three books in a ditch, and asked only for one person in the world who would not scream. Frankenstein\'s Monster is enormous, articulate, and still waiting for an answer.',
  'transylvania-carmilla':
    'She arrives as a guest, stays as a friend, and leaves the household weaker in ways nobody can quite date. Carmilla is unhurried and genuinely affectionate, which is the part that makes her difficult to be angry about.',
  'transylvania-hyde':
    'The draught does not create him. It simply removes the argument against him. Mr. Hyde is what was already in the house with the door finally open, and he gets less careful about his own skin every time he is let out.',
  'transylvania-van-helsing':
    'An old academic with a bag of very specific tools and no patience whatsoever for the supernatural\'s sense of ceremony. Van Helsing undoes preparation - whatever ward you spent the evening arranging, he has a method for it.',
  'transylvania-invisible-man':
    'The formula worked, which was the tragedy. The Invisible Man cannot be looked at, cannot be found, and has discovered that a person nobody can see stops bothering to behave like one.',
  'transylvania-dorian-gray':
    'The picture in the attic takes the damage and the ruin and the years, and the man downstairs stays exactly as he was on the day he wished it. Dorian Gray is unmarked, immaculate, and quietly running out of canvas.',
  'tortuga-blackbeard':
    'He wove slow-burning cord into his beard and lit it before boarding, because a man who appears to be on fire rarely has to fight. Blackbeard\'s reputation did most of the work, and he maintained it personally.',
  'tortuga-davy-jones':
    'Not a captain - the place captains end up. Davy Jones keeps a locker at the bottom of everything, and what he files there does not get filed back out again, whatever is promised on the surface.',
  'tortuga-kraken':
    'It comes up under the keel and takes the whole line down with it, and no one has ever agreed on how big it is because no one has seen all of it at once. The Kraken drags everything within reach into the same water.',
  'tortuga-anne-bonny':
    'She dressed as she pleased, fought better than the men who objected, and was still standing when the rest of the crew had gone below to drink. Anne Bonny takes what her opponent brought and puts it to better use.',
  'tortuga-captain-kidd':
    'A privateer with a commission, hanged as a pirate, and remembered mostly for a hoard that may never have existed. Captain Kidd still marks his target first, and still expects the whole crew to be paid when it goes down.',
  'tortuga-calico-jack':
    'He is remembered for the flag more than the fighting, which is fair - the skull and crossed blades were his, and they emptied more decks than his cutlass ever did. Calico Jack raises the colours and lets the fear do the boarding.',
  'tortuga-flying-dutchman':
    'Condemned to sail and never make port, crewed by everyone the sea has already taken. The Flying Dutchman grows heavier and more dangerous with every name added to her roll, and she has never once been short of names.',
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
