"""Per-hero art prompts, built from docs/ART-SPEC.md.

Single source of truth for generation. `prompt(hero_id)` assembles the
full text from the shared style block plus that hero's specifics, so a
change to house style propagates to every portrait at once.
"""

FACTION = {
    "camelot": {
        "primary": "#4c7bd8",
        "secondary": "#c9a227",
        "materials": "polished steel, blue enamel and gold trim",
    },
    "olympus": {
        "primary": "#d8b64c",
        "secondary": "#6fd3e8",
        "materials": "sun-bleached marble, laurel gold and aegean blue cloth",
    },
    "sherwood": {
        "primary": "#3f9b5c",
        "secondary": "#c8a34a",
        "materials": "waxed leather, forest wool and worn brass",
    },
    "grimmwood": {
        "primary": "#4fa86a",
        "secondary": "#8a5ad8",
        "materials": "damp bark, storybook cloth and fungal violet",
    },
    "yamato": {
        "primary": "#e05a4a",
        "secondary": "#f0c05a",
        "materials": "lacquered armour, silk cord, crimson and gold",
    },
    "huaxia": {
        "primary": "#b03a2e",
        "secondary": "#d9a521",
        "materials": "scale armour, imperial silk, jade and bronze",
    },
    "roma": {
        "primary": "#7b4dc0",
        "secondary": "#d4af37",
        "materials": "burnished bronze, tyrian purple and laurel",
    },
    "takamagahara": {
        "primary": "#e8e3d3",
        "secondary": "#c4392f",
        "materials": "bleached silk, shrine white and vermilion accents",
    },
    "duat": {
        "primary": "#c9a227",
        "secondary": "#1f4e79",
        "materials": "gold leaf, lapis inlay and linen wrap",
    },
}

ELEMENT = {
    "Physical": "#d8894f",
    "Magic": "#9b7bff",
    "Shadow": "#a05cd8",
    "Light": "#ffd977",
    "Lightning": "#63d7ff",
    "Fire": "#ff7a4d",
    "Nature": "#5fd48a",
}

RARITY = {
    "common": (
        "Grounded and practical: plain honest materials, no ornament, "
        "no decoration beyond what the costume needs."
    ),
    "rare": "One distinctive costume feature that makes them recognisable.",
    "epic": "Elaborate costume detail: layered fabric, worked metal, rich texture.",
    "legendary": (
        "Maximum costume presence: ornate materials, intricate worked detail "
        "and an unmistakable head-and-shoulders silhouette."
    ),
}

STYLE = (
    "Clean 16-bit pixel art, flat colour fills, hard blocky shading with "
    "2-4 tones per material, selective dark outline, crisp hard pixel edges, "
    "no anti-aliasing, limited palette of at most 32 colours. "
    "Fully transparent background."
)

# Everything that inflates the silhouette past the head and shoulders. A
# held weapon or a floating effect changes the bounding box per hero, which
# breaks a shared mask: the auto-fit shrinks the actual character to make
# room for a sword tip or a halo, so no two portraits end up the same size.
NEGATIVE = (
    "Absolutely no weapons of any kind: no sword, no bow, no arrow, no staff, "
    "no spear, no dagger, no axe, no shield, no polearm. "
    "Nothing held in the hands and no hands raised into frame. "
    "No floating particles, no sparkles, no motes, no embers, no smoke, "
    "no haze, no aura, no halo, no glow orbs, no magic effects, no runes, "
    "no lightning arcs, no energy of any kind around the figure. "
    "No companion creatures and no objects behind the head. "
    "Only the character's own body, hair and clothing may appear. "
    "No text, no lettering, no frame, no border, no ground, no scenery, "
    "no drop shadow."
)

# Bust: head, shoulders and upper chest.
#
# A tighter head-and-shoulders crop was tried and reverted. It did measurably
# sharpen the eyes (one eye went from 4.5 px to 7.1 px tall, because at bust
# scale the white, iris and pupil average into mud), but the whole-figure
# read was worse: the costume is most of what identifies a hero at card size,
# and cropping it away made the roster look same-y. Judged on the rendered
# card rather than on a 6x blow-up, the bust wins.
FRAMING = (
    "Bust framing showing head, shoulders and upper chest only, centred in "
    "frame, facing three-quarter toward the viewer's left, eyeline about 36 "
    "percent from the top, subject kept within the central 78 percent of the "
    "canvas. Light source upper left. "
    "The eyes are clearly readable, with a distinct dark pupil, a visible "
    "iris colour and clean whites - the eyes must not blur together."
)

HEROES = {
    # ---------------- camelot ----------------
    "camelot-king-arthur": {
        "name": "King Arthur",
        "faction": "camelot",
        "element": "Physical",
        "rarity": "legendary",
        "identity": "noble king of Britain, weary but resolute",
        "costume": "Mid-thirties, dark beard, tired resolute eyes. Bright polished plate armour with blue enamel inlay and gold edging.",
        "signature": "A heavy gold crown worn over a mail coif, above gold-edged pauldrons",
    },
    "camelot-merlin": {
        "name": "Merlin",
        "faction": "camelot",
        "element": "Magic",
        "rarity": "epic",
        "identity": "ancient wizard and kingmaker",
        "costume": "Deeply lined face, long white beard, pale piercing eyes. Midnight-blue robe embroidered with small gold stars.",
        "signature": "An enormous white beard reaching his chest, under a deep midnight-blue hood pushed half back",
    },
    "camelot-lancelot": {
        "name": "Lancelot",
        "faction": "camelot",
        "element": "Physical",
        "rarity": "common",
        "identity": "peerless and disciplined knight",
        "costume": "Handsome, clean-shaven, short dark hair. Plain but perfectly maintained steel plate and a blue surcoat.",
        "signature": "Immaculate plain steel pauldrons and gorget with a blue surcoat, entirely without ornament",
    },
    "camelot-morgan-le-fay": {
        "name": "Morgan le Fay",
        "faction": "camelot",
        "element": "Shadow",
        "rarity": "epic",
        "identity": "sorceress queen and schemer",
        "costume": "Pale sharp-featured face, black hair. Black and violet robes.",
        "signature": "A circlet of dark twisted iron on black hair, with a high collar of raven feathers",
    },
    "camelot-guinevere": {
        "name": "Guinevere",
        "faction": "camelot",
        "element": "Light",
        "rarity": "rare",
        "identity": "queen and healer",
        "costume": "Composed and kind, auburn hair, a pale blue gown.",
        "signature": "A slim gold circlet over braided auburn hair, above a gold-embroidered mantle",
    },
    "camelot-mordred": {
        "name": "Mordred",
        "faction": "camelot",
        "element": "Shadow",
        "rarity": "rare",
        "identity": "traitor son and assassin",
        "costume": "Young and hard-eyed, with a cruel resemblance to Arthur. Blackened mail.",
        "signature": "A dark surcoat bearing a broken crown device, over blackened mail",
    },
    # ---------------- olympus ----------------
    "olympus-zeus": {
        "name": "Zeus",
        "faction": "olympus",
        "element": "Lightning",
        "rarity": "legendary",
        "identity": "king of the gods, storm-crowned and thunderous",
        "costume": "Iron-grey beard, heavy brow, thick storm-grey hair. Bare chested beneath a storm-cloud himation clasped in gold.",
        "signature": "A crown of beaten gold laurel set in wild storm-grey hair, and a beard braided with small gold rings",
    },
    "olympus-athena": {
        "name": "Athena",
        "faction": "olympus",
        "element": "Light",
        "rarity": "rare",
        "identity": "goddess of measured war and strategy",
        "costume": "Calm level gaze, dark hair, a bronze cuirass over a pale chiton with the aegis at her shoulder bearing a small gorgon boss.",
        "signature": "A tall-crested Corinthian helm pushed back onto her head, revealing her face beneath",
    },
    "olympus-hercules": {
        "name": "Hercules",
        "faction": "olympus",
        "element": "Physical",
        "rarity": "epic",
        "identity": "strongman demigod of the twelve labours",
        "costume": "Enormous shoulders and neck, jaw set hard, short dark curls and a beard. Bare scarred torso.",
        "signature": "The Nemean lion pelt worn as a hood, the beast's upper jaw and teeth over his brow and its paws knotted at his chest",
    },
    "olympus-apollo": {
        "name": "Apollo",
        "faction": "olympus",
        "element": "Light",
        "rarity": "rare",
        "identity": "sun god, healer and archer",
        "costume": "Youthful unlined serene face, golden curls, one bare shoulder and a draped saffron chiton.",
        "signature": "A gold laurel wreath set in tight golden curls, above a bare shoulder",
    },
    "olympus-medusa": {
        "name": "Medusa",
        "faction": "olympus",
        "element": "Shadow",
        "rarity": "epic",
        "identity": "cursed gorgon with a petrifying gaze",
        "costume": "Green-scaled skin over a still-beautiful face, heavy-lidded eyes, a bronze scale collar.",
        "signature": "Hair made of many small alert serpents, each a distinct separated shape, defining her silhouette",
    },
    "olympus-ares": {
        "name": "Ares",
        "faction": "olympus",
        "element": "Fire",
        "rarity": "common",
        "identity": "god of slaughter and bloodlust",
        "costume": "Brutal scarred face mostly hidden behind a battered bronze close-helm, only eyes and snarling mouth visible. Dented bronze cuirass.",
        "signature": "A tall blood-red horsehair crest running front to back over a battered bronze helm",
    },
    # ---------------- sherwood ----------------
    "sherwood-guy-of-gisborne": {
        "name": "Guy of Gisborne",
        "faction": "sherwood",
        "element": "Shadow",
        "rarity": "epic",
        "identity": "ruthless hunter-knight",
        "costume": "Cold face, close-trimmed beard, hair scraped back. A horsehide cloak worn over dark mail.",
        "signature": "A horsehide hood that keeps the animal's shape over his head",
    },
    "sherwood-robin-hood": {
        "name": "Robin Hood",
        "faction": "sherwood",
        "element": "Nature",
        "rarity": "legendary",
        "identity": "outlaw archer of the greenwood",
        "costume": "Confident half smile, stubble, dark hair. Waxed leather bracers over a green jerkin.",
        "signature": "A green hood with a single feather tucked into its band, over a leather jerkin",
    },
    "sherwood-will-scarlet": {
        "name": "Will Scarlet",
        "faction": "sherwood",
        "element": "Physical",
        "rarity": "rare",
        "identity": "reckless duellist",
        "costume": "Young and grinning, red-brown hair.",
        "signature": "A scarlet doublet with a wide open collar, and a scar through one eyebrow",
    },
    "sherwood-little-john": {
        "name": "Little John",
        "faction": "sherwood",
        "element": "Physical",
        "rarity": "epic",
        "identity": "immovable giant of a man",
        "costume": "Broad bearded face, cheerful and unmovable. Rough green wool and a wide leather belt.",
        "signature": "Enormous shoulders in rough green wool that overflow the frame, above a full brown beard",
    },
    "sherwood-maid-marian": {
        "name": "Maid Marian",
        "faction": "sherwood",
        "element": "Light",
        "rarity": "common",
        "identity": "noblewoman turned outlaw",
        "costume": "Steady intelligent eyes, dark hair loosely braided. A plain linen dress.",
        "signature": "A simple green riding hood laid back on her shoulders over loosely braided dark hair",
    },
    "sherwood-friar-tuck": {
        "name": "Friar Tuck",
        "faction": "sherwood",
        "element": "Light",
        "rarity": "rare",
        "identity": "fighting monk of the greenwood",
        "costume": "Round ruddy laughing face. Brown habit and rope belt.",
        "signature": "A tonsured head above a coarse brown monk's habit and a knotted rope collar",
    },
    # ---------------- grimmwood ----------------
    "grimmwood-hansel-and-gretel": {
        "name": "Hansel and Gretel",
        "faction": "grimmwood",
        "element": "Nature",
        "rarity": "epic",
        "identity": "two lost children, too calm for what they have seen",
        "costume": "Two pale hollow-eyed children sharing the frame equally, in ragged peasant clothes.",
        "signature": "Two pale hollow-eyed children shoulder to shoulder in matching ragged peasant clothes",
    },
    "grimmwood-rumpelstiltskin": {
        "name": "Rumpelstiltskin",
        "faction": "grimmwood",
        "element": "Magic",
        "rarity": "legendary",
        "identity": "trickster imp and maker of cruel bargains",
        "costume": "Enormous ears, wild hair, eyes like coins. Patchwork motley.",
        "signature": "Enormous pointed ears and a grin with far too many teeth, above a patchwork motley collar",
    },
    "grimmwood-big-bad-wolf": {
        "name": "Big Bad Wolf",
        "faction": "grimmwood",
        "element": "Nature",
        "rarity": "epic",
        "identity": "savage anthropomorphic wolf",
        "costume": "Massive lupine head, yellow eyes, wet teeth. Coarse grey fur.",
        "signature": "A massive lupine head with the muzzle drawn back from wet teeth, and a shredded shawl at the neck",
    },
    "grimmwood-snow-white": {
        "name": "Snow White",
        "faction": "grimmwood",
        "element": "Nature",
        "rarity": "common",
        "identity": "fairy-tale princess of the woods",
        "costume": "Skin very pale, hair jet black, lips dark red - exactly the storybook triad. Simple blue and yellow bodice.",
        "signature": "Jet black hair against very pale skin with dark red lips, tied with a red ribbon",
    },
    "grimmwood-red-riding-hood": {
        "name": "Red Riding Hood",
        "faction": "grimmwood",
        "element": "Physical",
        "rarity": "rare",
        "identity": "young hunter in a red hood",
        "costume": "Young but hard-faced and freckled, jaw set. A crimson hooded cloak over a woodsman's coat.",
        "signature": "A peaked crimson hood pulled up over her head, above a woodsman's collar",
    },
    "grimmwood-pied-piper": {
        "name": "Pied Piper",
        "faction": "grimmwood",
        "element": "Magic",
        "rarity": "rare",
        "identity": "enchanter musician",
        "costume": "A thin unreadable smile, face half shadowed. Motley of green and violet diamonds.",
        "signature": "A tall feathered cap tilted low, shadowing half his face above a green and violet diamond motley",
    },
    # ---------------- yamato ----------------
    "yamato-yoshitsune": {
        "name": "Minamoto no Yoshitsune",
        "faction": "yamato",
        "element": "Physical",
        "rarity": "rare",
        "identity": "young and brilliant warlord",
        "costume": "Fine-boned and fierce. Red-laced o-yoroi armour with gold fittings.",
        "signature": "A tight high topknot above red-laced o-yoroi shoulder plates with gold fittings",
    },
    "yamato-tomoe-gozen": {
        "name": "Tomoe Gozen",
        "faction": "yamato",
        "element": "Physical",
        "rarity": "rare",
        "identity": "onna-musha archer",
        "costume": "Composed, beautiful and unflinching. Red and gold lamellar over a dark kimono.",
        "signature": "Long black hair bound high, above red and gold lamellar shoulder armour",
    },
    "yamato-benkei": {
        "name": "Benkei",
        "faction": "yamato",
        "element": "Physical",
        "rarity": "common",
        "identity": "immovable warrior monk",
        "costume": "Huge, bearded, shaven head, an utterly immovable expression. Plain dark robes over simple armour.",
        "signature": "A shaven head and full beard above a monk's hood laid back on heavy plain shoulders",
    },
    "yamato-abe-no-seimei": {
        "name": "Abe no Seimei",
        "faction": "yamato",
        "element": "Magic",
        "rarity": "legendary",
        "identity": "onmyoji diviner",
        "costume": "Serene ageless face, thin moustache. White silk kariginu robe.",
        "signature": "A tall black eboshi cap above white silk robes bearing a woven pentagram seal",
    },
    "yamato-momotaro": {
        "name": "Momotaro",
        "faction": "yamato",
        "element": "Physical",
        "rarity": "epic",
        "identity": "the peach boy hero",
        "costume": "Young, broad, grinning with total confidence. Simple armour over a peach-pink haori.",
        "signature": "A white hachimaki headband tied over dark hair, above a peach-pink haori collar",
    },
    "yamato-kaguya": {
        "name": "Kaguya",
        "faction": "yamato",
        "element": "Magic",
        "rarity": "epic",
        "identity": "the moon princess",
        "costume": "Ethereal and pale to the point of translucency. Twelve-layered junihitoe in white and silver.",
        "signature": "Impossibly long black hair drifting as if underwater, over the layered white and silver collars of a junihitoe",
    },
    # ---------------- huaxia ----------------
    "huaxia-qin-shi-huang": {
        "name": "Qin Shi Huang",
        "faction": "huaxia",
        "element": "Magic",
        "rarity": "legendary",
        "identity": "the First Emperor, absolute and severe",
        "costume": "Severe unmoving face, thin beard, eyes that do not move. Black and gold imperial robes.",
        "signature": "A mianguan crown with hanging bead strings falling across his brow",
    },
    "huaxia-lu-bu": {
        "name": "Lu Bu",
        "faction": "huaxia",
        "element": "Physical",
        "rarity": "rare",
        "identity": "peerless and arrogant warrior",
        "costume": "Arrogant and handsome with a heavy brow. Red and gold scale armour.",
        "signature": "A headdress carrying two very long pheasant tail feathers",
    },
    "huaxia-zhuge-liang": {
        "name": "Zhuge Liang",
        "faction": "huaxia",
        "element": "Magic",
        "rarity": "epic",
        "identity": "master strategist",
        "costume": "Calm and thoughtful, long thin beard. A simple crane-white robe.",
        "signature": "A scholar's guan cap above a plain crane-white robe and a long thin beard",
    },
    "huaxia-guan-yu": {
        "name": "Guan Yu",
        "faction": "huaxia",
        "element": "Physical",
        "rarity": "epic",
        "identity": "the god of war",
        "costume": "Red-brown face, phoenix-eye brows. Green robe over gold scale armour.",
        "signature": "An iconic long black beard reaching mid-chest, above a green robe over gold scale armour",
    },
    "huaxia-hua-tuo": {
        "name": "Hua Tuo",
        "faction": "huaxia",
        "element": "Light",
        "rarity": "rare",
        "identity": "legendary physician",
        "costume": "Kind and elderly, white beard. A plain grey scholar's robe.",
        "signature": "Small round spectacles and a long white beard, above a plain grey scholar's collar",
    },
    "huaxia-huang-zhong": {
        "name": "Huang Zhong",
        "faction": "huaxia",
        "element": "Physical",
        "rarity": "rare",
        "identity": "veteran archer, old but iron-hard",
        "costume": "Old but iron-hard, white beard. Practical scale armour with no ornament.",
        "signature": "A weathered squint and short white beard above unornamented practical scale armour",
    },
    "huaxia-sun-wukong": {
        "name": "Sun Wukong",
        "faction": "huaxia",
        "element": "Physical",
        "rarity": "legendary",
        "identity": "the Monkey King",
        "costume": "Simian face with golden fur, blazing gold eyes, a wide irreverent grin. Red and gold armour.",
        "signature": "A gold circlet band on the brow of a golden-furred simian face with blazing gold eyes",
    },
    "huaxia-nezha": {
        "name": "Nezha",
        "faction": "huaxia",
        "element": "Fire",
        "rarity": "epic",
        "identity": "child deity of war",
        "costume": "A young boy's face with ancient eyes. Red silk sash and gold armour.",
        "signature": "Hair tied in two high buns above a red silk sash and gold shoulder armour",
    },
    "huaxia-mulan": {
        "name": "Mulan",
        "faction": "huaxia",
        "element": "Physical",
        "rarity": "common",
        "identity": "woman warrior in disguise",
        "costume": "Determined and plain-featured. Ordinary soldier's scale armour, deliberately anonymous.",
        "signature": "A plain soldier's helm with hair bound tight beneath it, above anonymous scale armour",
    },
    # ---------------- roma ----------------
    "roma-julius-caesar": {
        "name": "Julius Caesar",
        "faction": "roma",
        "element": "Physical",
        "rarity": "epic",
        "identity": "dictator of Rome",
        "costume": "Aquiline nose, receding hair, calculating eyes. Bronze muscle cuirass under a tyrian purple cloak.",
        "signature": "A gold laurel crown on receding hair, above a bronze muscle cuirass and purple cloak",
    },
    "roma-spartacus": {
        "name": "Spartacus",
        "faction": "roma",
        "element": "Physical",
        "rarity": "common",
        "identity": "rebel gladiator",
        "costume": "Scarred, bearded and defiant, a slave brand on the shoulder. Battered mismatched gladiator armour, one bare shoulder, a manica on the visible arm.",
        "signature": "A slave brand burned into a bare scarred shoulder, above battered mismatched gladiator armour",
    },
    "roma-augustus": {
        "name": "Augustus",
        "faction": "roma",
        "element": "Light",
        "rarity": "rare",
        "identity": "first Emperor of Rome",
        "costume": "Young, cold, idealised features. A white toga with a purple stripe.",
        "signature": "A civic crown of oak leaves above a white toga with a purple stripe",
    },
    "roma-cicero": {
        "name": "Cicero",
        "faction": "roma",
        "element": "Magic",
        "rarity": "epic",
        "identity": "orator whose words are weapons",
        "costume": "Middle-aged and sharp, mouth open mid-word. A plain white toga.",
        "signature": "A stern orator's face caught mid-speech, above the heavy folds of a plain white toga",
    },
    "roma-brutus": {
        "name": "Brutus",
        "faction": "roma",
        "element": "Shadow",
        "rarity": "rare",
        "identity": "conflicted assassin senator",
        "costume": "Haunted and conflicted, short curls. A white toga.",
        "signature": "A haunted face half lost in shadow, above the folds of a white toga",
    },
    "roma-constantine-the-great": {
        "name": "Constantine the Great",
        "faction": "roma",
        "element": "Light",
        "rarity": "legendary",
        "identity": "emperor and convert",
        "costume": "Regal and bearded. Gold-scaled armour under a purple imperial cloak.",
        "signature": "A jewelled imperial diadem above gold-scaled armour and a purple cloak",
    },
    # ---------------- takamagahara ----------------
    "takamagahara-amaterasu": {
        "name": "Amaterasu",
        "faction": "takamagahara",
        "element": "Light",
        "rarity": "legendary",
        "identity": "sun goddess of high heaven",
        "costume": "Serene, eyes nearly closed, radiantly pale skin. White and vermilion shrine silks.",
        "signature": "A face lit almost too brightly to look at, framed by white and vermilion shrine silks and gold hair ornaments",
    },
    "takamagahara-tsukuyomi": {
        "name": "Tsukuyomi",
        "faction": "takamagahara",
        "element": "Shadow",
        "rarity": "rare",
        "identity": "cold and austere moon god",
        "costume": "Pale, austere, silver hair. Black and white court robes.",
        "signature": "Straight silver hair above the stiff black and white collars of court robes",
    },
    "takamagahara-izanami": {
        "name": "Izanami",
        "faction": "takamagahara",
        "element": "Shadow",
        "rarity": "common",
        "identity": "goddess of death",
        "costume": "Beautiful and decaying at once: one half of the face perfect, the other veiled in shadow. Plain white burial silk.",
        "signature": "A heavy white burial veil covering one half of her face, the other half perfect and pale",
    },
    "takamagahara-inari": {
        "name": "Inari",
        "faction": "takamagahara",
        "element": "Nature",
        "rarity": "epic",
        "identity": "sly fox deity",
        "costume": "Androgynous and knowing, in a white and vermilion robe.",
        "signature": "A white fox mask pushed up onto the forehead, revealing a knowing smile beneath",
    },
    "takamagahara-izanagi": {
        "name": "Izanagi",
        "faction": "takamagahara",
        "element": "Light",
        "rarity": "epic",
        "identity": "sorrowful creator god",
        "costume": "Noble, bearded and sorrowful, in white ceremonial robes.",
        "signature": "A noble bearded face above the wide white collar of ceremonial robes",
    },
    "takamagahara-susanoo": {
        "name": "Susanoo",
        "faction": "takamagahara",
        "element": "Lightning",
        "rarity": "rare",
        "identity": "wild storm god",
        "costume": "Grinning and wild, a warrior's build. Half-armoured over a loose robe.",
        "signature": "Wild unruly black hair above a half-armoured shoulder and loose robe",
    },
    # ---------------- duat ----------------
    "duat-anubis": {
        "name": "Anubis",
        "faction": "duat",
        "element": "Shadow",
        "rarity": "legendary",
        "identity": "jackal-headed god of the dead",
        "costume": "A black jackal head with tall alert ears and gold eyes. Gold and lapis collar over linen wrap.",
        "signature": "A black jackal head with tall alert ears and gold eyes, above a broad gold and lapis collar",
    },
    "duat-horus": {
        "name": "Horus",
        "faction": "duat",
        "element": "Light",
        "rarity": "rare",
        "identity": "falcon-headed god of the sky",
        "costume": "A falcon head with a fierce round eye and the Eye of Horus marking. Gold pectoral and a blue and gold nemes headdress.",
        "signature": "A falcon head with a fierce round eye, above a gold pectoral and blue and gold nemes headdress",
    },
    "duat-maat": {
        "name": "Ma'at",
        "faction": "duat",
        "element": "Light",
        "rarity": "rare",
        "identity": "goddess of truth and judgement",
        "costume": "A serene woman's face with dark hair, white linen and a gold collar.",
        "signature": "A single tall ostrich feather standing upright on her headband",
    },
    "duat-sekhmet": {
        "name": "Sekhmet",
        "faction": "duat",
        "element": "Fire",
        "rarity": "epic",
        "identity": "snarling lioness of war",
        "costume": "A lioness head, snarling, with a gold-worked mane.",
        "signature": "A snarling lioness head with the mane picked out in gold",
    },
    "duat-isis": {
        "name": "Isis",
        "faction": "duat",
        "element": "Magic",
        "rarity": "epic",
        "identity": "goddess of magic and rebirth",
        "costume": "Beautiful and composed, in fine white linen.",
        "signature": "A throne hieroglyph headdress above a broad beaded collar",
    },
    "duat-nephthys": {
        "name": "Nephthys",
        "faction": "duat",
        "element": "Shadow",
        "rarity": "common",
        "identity": "goddess of mourning",
        "costume": "Downcast eyes and quiet grief. Simple dark linen.",
        "signature": "Downcast eyes above simple dark linen and a modest gold collar",
    },
}


def prompt(hero_id):
    h = HEROES[hero_id]
    f = FACTION[h["faction"]]
    col = ELEMENT[h["element"]]
    return (
        f"64x64 pixel art character portrait of {h['name']}, {h['identity']}. "
        f"{FRAMING} "
        f"{h['costume']} "
        f"Defining feature: {h['signature']}. "
        f"Costume palette drawn from {f['materials']}, "
        f"built on {f['primary']} and {f['secondary']}, "
        f"with a crisp 1 to 2 pixel {col} rim light along the upper-left "
        f"contour of the body itself. "
        f"{STYLE} "
        f"{NEGATIVE} "
        f"{RARITY[h['rarity']]}"
    )


if __name__ == "__main__":
    for k in HEROES:
        print("=" * 70)
        print(k)
        print(prompt(k))
