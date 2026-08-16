from PIL import Image, ImageDraw
from pathlib import Path
import hashlib, math, random

OUT = Path('/home/user/assets/legends')
OUT.mkdir(parents=True, exist_ok=True)
W, H = 160, 220
SCALE = 4
INK = (17, 20, 31)
DEEP = (12, 17, 28)
WHITE = (240, 237, 220)

ELEMENTS = {
    'Physical': '#ff4d4d', 'Magic': '#ff4dd5', 'Shadow': '#a05cd8',
    'Light': '#ffd977', 'Lightning': '#63d7ff', 'Fire': '#ff7a4d',
    'Nature': '#5fd48a'
}
FACTIONS = {
    'Olympus': {
        'primary':'#d8b64c','secondary':'#6fd3e8',
        'sky':('#40526d','#263b58'),'ground':'#5f6872','mid':'#77828b','light':'#b7c2bf'
    },
    'Camelot': {
        'primary':'#4c7bd8','secondary':'#c9a227',
        'sky':('#303c58','#1b263e'),'ground':'#414654','mid':'#5c6070','light':'#89909b'
    },
    'Sherwood': {
        'primary':'#3f9b5c','secondary':'#c8a34a',
        'sky':('#274c43','#183129'),'ground':'#253c2e','mid':'#345c3e','light':'#5d8258'
    },
    'Grimmwood': {
        'primary':'#4fa86a','secondary':'#8a5ad8',
        'sky':('#3f3859','#211c38'),'ground':'#292433','mid':'#4a3c4a','light':'#746278'
    },
    'Yamato': {
        'primary':'#e05a4a','secondary':'#f0c05a',
        'sky':('#4d4350','#292536'),'ground':'#4d3c3d','mid':'#6f5550','light':'#967266'
    },
    'Huaxia': {
        'primary':'#b03a2e','secondary':'#d9a521',
        'sky':('#4b516b','#27324e'),'ground':'#4b4b59','mid':'#6a6671','light':'#99918a'
    },
    'Roma': {
        'primary':'#7b4dc0','secondary':'#d4af37',
        'sky':('#634e65','#312c47'),'ground':'#55484f','mid':'#74616a','light':'#a08b87'
    },
    'Takamagahara': {
        'primary':'#e8e3d3','secondary':'#c4392f',
        'sky':('#657181','#384a5a'),'ground':'#5b6970','mid':'#76848a','light':'#a7aaa0'
    },
    'Duat': {
        'primary':'#c9a227','secondary':'#1f4e79',
        'sky':('#202b46','#10182e'),'ground':'#67543b','mid':'#816c48','light':'#a7915b'
    },
}

def rgb(c):
    if c is None: return None
    if isinstance(c, tuple): return c
    c = c.lstrip('#')
    return tuple(int(c[i:i+2],16) for i in (0,2,4))

def mix(a,b,t):
    a,b=rgb(a),rgb(b)
    return tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))

def shade(c,t):
    return mix(c, DEEP if t < 0 else WHITE, abs(t))

def poly(d, pts, fill, outline=INK, width=2):
    d.polygon(pts, fill=rgb(fill))
    if outline and width:
        d.line(pts+[pts[0]], fill=rgb(outline), width=width, joint='curve')

def line(d, pts, fill, width=1):
    d.line(pts, fill=rgb(fill), width=width, joint='curve')

def rect(d, box, fill, outline=None, width=1):
    d.rectangle(box, fill=rgb(fill), outline=rgb(outline) if outline else None, width=width)

def ellipse(d, box, fill, outline=None, width=1):
    d.ellipse(box, fill=rgb(fill), outline=rgb(outline) if outline else None, width=width)

def seeded(name):
    return random.Random(int(hashlib.sha256(name.encode()).hexdigest()[:12],16))

ROSTER = [
    # id, faction, name, rarity, role, element, identity, costume, feature
    ('olympus-zeus','Olympus','Zeus','legendary','Caster','Lightning','storm-crowned king of the gods','storm-grey himation, bare chest, gold clasp and beaten-gold laurel','laurel-lightning'),
    ('olympus-athena','Olympus','Athena','rare','Controller','Light','goddess of measured war','bronze cuirass over pale chiton, blue and gold classical trim','helm-crest'),
    ('olympus-hercules','Olympus','Hercules','epic','Tank','Physical','strongman demigod','bare scarred torso, dusty lion pelt and gold knot','lionhood'),
    ('olympus-apollo','Olympus','Apollo','rare','Medic','Light','serene sun god and healer','saffron chiton, bare shoulder and gold laurel','solar-lyre'),
    ('olympus-medusa','Olympus','Medusa','epic','Controller','Shadow','cursed gorgon','green scales, bronze scale collar and dark woven wraps','serpent-hair'),
    ('olympus-ares','Olympus','Ares','common','Bruiser','Fire','brutal god of war','dented bronze cuirass, dark functional straps','close-helm'),
    ('camelot-king-arthur','Camelot','King Arthur','legendary','Tank','Physical','weary but resolute noble king','mirror steel plate, blue enamel, gold edging, mail coif','crown-pommel'),
    ('camelot-merlin','Camelot','Merlin','epic','Controller','Magic','ancient wizard','midnight robe with gold constellation embroidery and hood','runes-hood'),
    ('camelot-lancelot','Camelot','Lancelot','common','Bruiser','Physical','peerless knight','plain maintained steel plate and blue surcoat','raised-blade'),
    ('camelot-morgan-le-fay','Camelot','Morgan le Fay','epic','Controller','Shadow','sorceress queen','black and violet layered robes with feather collar','raven-smoke'),
    ('camelot-guinevere','Camelot','Guinevere','rare','Medic','Light','queen and healer','pale blue gown and gold-embroidered mantle','circlet-hands'),
    ('camelot-mordred','Camelot','Mordred','rare','Sniper','Shadow','hard-eyed traitor son','blackened mail and dark broken-crown surcoat','reversed-dagger'),
    ('sherwood-guy-of-gisborne','Sherwood','Guy of Gisborne','epic','Bruiser','Shadow','ruthless hunter-knight','dark mail under a heavy horsehide cloak','horsehide-helm'),
    ('sherwood-robin-hood','Sherwood','Robin Hood','legendary','Sniper','Nature','confident outlaw archer','waxed leather bracers, green hood and forest wool','hood-bow'),
    ('sherwood-will-scarlet','Sherwood','Will Scarlet','rare','Bruiser','Physical','reckless duellist','scarlet doublet, open collar and worn leather belt','scarlet-daggers'),
    ('sherwood-little-john','Sherwood','Little John','epic','Tank','Physical','giant of a man','rough green wool and wide leather belt','staff-giant'),
    ('sherwood-maid-marian','Sherwood','Maid Marian','common','Medic','Light','noblewoman turned outlaw','simple green riding cloak over plain linen','braid-horn'),
    ('sherwood-friar-tuck','Sherwood','Friar Tuck','rare','Controller','Light','fighting monk','brown habit, rope belt and wooden cross','tonsure-tankard'),
    ('grimmwood-hansel-gretel','Grimmwood','Hansel & Gretel','epic','Tank','Nature','two pale siblings, too calm','ragged peasant clothes, patched wool and frayed hems','dual-candle'),
    ('grimmwood-rumpelstiltskin','Grimmwood','Rumpelstiltskin','legendary','Controller','Magic','grinning trickster imp','dense patchwork motley with mismatched stitches','imp-thread'),
    ('grimmwood-big-bad-wolf','Grimmwood','Big Bad Wolf','epic','Bruiser','Nature','massive anthropomorphic wolf','shaggy dark fur and shredded storybook shawl','wolf-muzzle'),
    ('grimmwood-snow-white','Grimmwood','Snow White','common','Medic','Nature','storybook princess','simple blue and yellow bodice, clean red ribbon','apple-ribbon'),
    ('grimmwood-red-riding-hood','Grimmwood','Red Riding Hood','rare','Bruiser','Physical','hard-faced young hunter','crimson hooded cloak over woodsman coat','red-hood-hatchet'),
    ('grimmwood-pied-piper','Grimmwood','Pied Piper','rare','Controller','Magic','enigmatic enchanter musician','green and violet diamond-patterned motley','feather-cap-pipe'),
    ('grimmwood-gingerbread-man','Grimmwood','Gingerbread Man','common','Tank','Physical','living gingerbread guardian','baked gingerbread body, icing piping and gumdrop buttons','icing-armor'),
    ('grimmwood-evil-queen','Grimmwood','Evil Queen','legendary','Caster','Shadow','regal fairy-tale queen','black and violet brocade gown, high collar and pointed crown','black-crown'),
    ('grimmwood-puss-in-boots','Grimmwood','Puss in Boots','rare','Sniper','Physical','anthropomorphic cat marksman','dark fur, feathered hat, green-violet coat and tall boots','cat-hat-crossbow'),
    ('grimmwood-rapunzel','Grimmwood','Rapunzel','epic','Caster','Magic','tower princess with living golden hair','violet gown, long golden braid and tower collar','long-golden-hair'),
    ('grimmwood-goldilocks','Grimmwood','Goldilocks','rare','Sniper','Nature','adult golden-curled wanderer','ochre dress, moss-green cloak and bear-claw motif','gold-curls-bow'),
    ('grimmwood-cinderella','Grimmwood','Cinderella','rare','Medic','Light','woodland healer in a transformed gown','pale blue and silver gown with a glass-like shoe','silver-shoe-hands'),
    ('yamato-minamoto-no-yoshitsune','Yamato','Minamoto no Yoshitsune','rare','Bruiser','Physical','young fierce warlord','red-laced o-yoroi with gold fittings','topknot-crossed-swords'),
    ('yamato-tomoe-gozen','Yamato','Tomoe Gozen','rare','Sniper','Physical','unflinching onna-musha archer','red and gold lamellar over dark kimono','high-hair-yumi'),
    ('yamato-benkei','Yamato','Benkei','common','Tank','Physical','immovable warrior monk','plain dark robes over simple armour','shaved-naginata'),
    ('yamato-abe-no-seimei','Yamato','Abe no Seimei','legendary','Controller','Magic','serene onmyoji','white silk kariginu with intricate seal pattern','eboshi-shikigami'),
    ('yamato-momotaro','Yamato','Momotaro','epic','Tank','Physical','confident peach boy legend','simple armour over peach-pink haori and headband','banner-feather'),
    ('yamato-kaguya','Yamato','Kaguya','epic','Caster','Magic','ethereal moon princess','twelve-layered white and silver junihitoe','moon-longhair'),
    ('huaxia-qin-shi-huang','Huaxia','Qin Shi Huang','legendary','Caster','Magic','severe first emperor','black and gold imperial robes with dense ornament','mianguan-beads'),
    ('huaxia-lu-bu','Huaxia','Lu Bu','rare','Bruiser','Physical','arrogant peerless warrior','red and gold scale armour with tall headdress','pheasant-plumes'),
    ('huaxia-zhuge-liang','Huaxia','Zhuge Liang','epic','Controller','Magic','calm master strategist','crane-white scholar robe with fine embroidery','guan-fan'),
    ('huaxia-guan-yu','Huaxia','Guan Yu','epic','Tank','Physical','god of war','green robe over gold scale armour','long-beard-crescent'),
    ('huaxia-hua-tuo','Huaxia','Hua Tuo','rare','Medic','Light','kind legendary physician','plain grey scholar robe with satchel strap','spectacles-herbs'),
    ('huaxia-huang-zhong','Huaxia','Huang Zhong','rare','Sniper','Physical','weathered veteran archer','practical scale armour and worn bracers','white-beard-bow'),
    ('huaxia-sun-wukong','Huaxia','Sun Wukong','legendary','Bruiser','Physical','irreverent monkey king','red and gold armour, circlet and feathered cap','monkey-staff'),
    ('huaxia-nezha','Huaxia','Nezha','epic','Sniper','Fire','ancient-eyed child deity','red silk sash and gold armour','child-wheels'),
    ('huaxia-mulan','Huaxia','Mulan','common','Sniper','Physical','determined woman warrior','ordinary anonymous soldier scale armour','simple-helm-crossbow'),
    ('roma-julius-caesar','Roma','Julius Caesar','epic','Bruiser','Physical','calculating dictator','bronze muscle cuirass and Tyrian purple cloak','laurel-cuirass'),
    ('roma-spartacus','Roma','Spartacus','common','Tank','Physical','defiant rebel gladiator','battered mismatched armour, one bare shoulder','broken-chain'),
    ('roma-augustus','Roma','Augustus','rare','Medic','Light','cold idealised first emperor','white toga with purple stripe','oak-crown'),
    ('roma-cicero','Roma','Cicero','epic','Controller','Magic','sharp orator mid-speech','plain white toga with worked hem','scroll-glyphs'),
    ('roma-brutus','Roma','Brutus','rare','Sniper','Shadow','haunted assassin senator','white toga half in shadow','hidden-dagger'),
    ('roma-constantine-the-great','Roma','Constantine the Great','legendary','Caster','Light','regal emperor convert','gold-scale armour and purple imperial cloak','diadem-standard'),
    ('takamagahara-amaterasu','Takamagahara','Amaterasu','legendary','Caster','Light','serene sun goddess','white and vermilion shrine silks with gold ornaments','solar-corona'),
    ('takamagahara-tsukuyomi','Takamagahara','Tsukuyomi','rare','Caster','Shadow','cold austere moon god','black and white court robes','silver-hair-mirror'),
    ('takamagahara-izanami','Takamagahara','Izanami','common','Controller','Shadow','beautiful goddess of death','plain white burial silk','half-veil'),
    ('takamagahara-inari','Takamagahara','Inari','epic','Controller','Nature','sly androgynous fox deity','white and vermilion shrine robes','fox-mask-tails'),
    ('takamagahara-izanagi','Takamagahara','Izanagi','epic','Medic','Light','sorrowful creator god','white ceremonial robes with layered sash','purification-water'),
    ('takamagahara-susanoo','Takamagahara','Susanoo','rare','Tank','Lightning','wild storm god','half-armoured warrior layers over loose robe','wild-hair-trident'),
    ('duat-anubis','Duat','Anubis','legendary','Sniper','Shadow','jackal-headed god of the dead','linen wrap, lavish gold and lapis collar','jackal-head'),
    ('duat-horus','Duat','Horus','rare','Sniper','Light','falcon-headed god','blue and gold nemes with gold pectoral','falcon-head'),
    ('duat-maat','Duat',"Ma'at",'rare','Caster','Light','serene goddess of truth','white linen and gold collar','ostrich-feather'),
    ('duat-sekhmet','Duat','Sekhmet','epic','Caster','Fire','lioness of war','gold-picked mane and solar disc','lioness-solar'),
    ('duat-isis','Duat','Isis','epic','Medic','Magic','goddess of magic and rebirth','white linen, gold collar and throne headdress','feathered-wings'),
    ('duat-nephthys','Duat','Nephthys','common','Medic','Shadow','goddess of mourning','simple dark linen and modest gold collar','folded-wings'),
]


def background(im, faction, rng):
    d=ImageDraw.Draw(im)
    f=FACTIONS[faction]
    sky0,sky1=map(rgb,f['sky'])
    for y in range(0,126):
        t=y/126
        col=tuple(round(sky0[i]*(1-t)+sky1[i]*t) for i in range(3))
        rect(d,(0,y,159,y),col)
    # quiet blocky sky texture
    for _ in range(22):
        x=rng.randrange(0,160); y=rng.randrange(14,108)
        if rng.random()<.55:
            c=mix(sky1, sky0, rng.random()*.35)
            rect(d,(x,y,x+rng.randrange(3,12),y+rng.randrange(1,4)),c)
    g=rgb(f['ground']); m=rgb(f['mid']); l=rgb(f['light'])
    # Horizon is deliberately below the upper third and never a bright strip.
    if faction=='Olympus':
        rect(d,(0,108,159,159),mix(g,DEEP,.1))
        # distant sea and stepped shore
        rect(d,(0,104,159,121),mix(f['sky'][1],g,.25))
        for _ in range(8):
            x=rng.randrange(0,150); y=rng.randrange(107,121)
            rect(d,(x,y,x+rng.randrange(7,25),y+1),mix(l,g,.55))
        for x in (10,138):
            rect(d,(x,51,x+10,165),mix(m,DEEP,.25),INK,2)
            rect(d,(x-4,50,x+14,56),m,INK,2)
            rect(d,(x-2,67,x+12,71),m)
            rect(d,(x-2,112,x+12,116),m)
        poly(d,[(0,150),(35,145),(55,154),(88,148),(120,156),(160,143),(160,220),(0,220)],mix(g,DEEP,.05),None,0)
        for _ in range(30):
            x=rng.randrange(160); y=rng.randrange(150,219)
            rect(d,(x,y,x+rng.randrange(2,7),y+rng.randrange(1,4)),mix(m,g,.5))
    elif faction=='Camelot':
        # stone rampart and blue/gold banners
        rect(d,(0,112,159,173),g,INK,2)
        for y in range(120,171,12):
            line(d,[(0,y),(159,y)],mix(m,g,.4),1)
        for x in range(5,159,22):
            rect(d,(x,105,x+13,116),m,INK,2)
        for x,col in [(22,FACTIONS[faction]['primary']),(137,FACTIONS[faction]['secondary'])]:
            line(d,[(x,24),(x,91)],mix(m,DEEP,.3),2)
            poly(d,[(x,29),(x+18,35),(x+14,62),(x,59)],mix(col,DEEP,.55),INK,1)
            rect(d,(x+3,37,x+7,41),mix(col,WHITE,.15))
        # small torch, below head line
        for x in (8,151):
            rect(d,(x,92,x+4,108),mix(m,DEEP,.3),INK,1)
            rect(d,(x-1,86,x+5,96),(182,115,59),None,0)
        poly(d,[(0,166),(30,160),(70,168),(112,159),(159,168),(159,220),(0,220)],mix(g,DEEP,.25),None,0)
    elif faction=='Sherwood':
        # canopy masses, dark trunks, soft shafts
        for _ in range(9):
            x=rng.randrange(-10,160); y=rng.randrange(8,90)
            col=mix(f['sky'][0],f['sky'][1],rng.random()*.5)
            ellipse(d,(x-20,y-12,x+30,y+18),col)
        rect(d,(0,106,159,220),g, None,0)
        for x in (-8,25,143,168):
            line(d,[(x,40),(x+rng.randrange(-12,13),220)],mix(m,DEEP,.25),rng.randrange(4,8))
            line(d,[(x+2,70),(x-16,55)],mix(m,DEEP,.25),2)
            line(d,[(x-2,95),(x+17,77)],mix(m,DEEP,.25),2)
        # pale light shafts, kept beside head
        for x in (18,132):
            poly(d,[(x,26),(x+8,26),(x+22,138),(x+9,138)],mix((176,194,151),g,.72),None,0)
        for _ in range(35):
            x=rng.randrange(160); y=rng.randrange(115,220)
            rect(d,(x,y,x+rng.randrange(2,7),y+rng.randrange(1,4)),mix(m,g,.55))
    elif faction=='Grimmwood':
        # violet gloom, gnarled trunks and mist
        rect(d,(0,111,159,220),g,None,0)
        for x in (-6,32,144,167):
            line(d,[(x,18),(x+rng.randrange(-18,19),220)],mix(m,DEEP,.25),rng.randrange(4,8))
            line(d,[(x,70),(x+rng.randrange(-22,-6),47)],mix(m,DEEP,.25),2)
            line(d,[(x,99),(x+rng.randrange(8,24),73)],mix(m,DEEP,.25),2)
        for _ in range(15):
            x=rng.randrange(160); y=rng.randrange(118,190)
            rect(d,(x,y,x+rng.randrange(3,9),y+rng.randrange(2,5)),mix((154,117,175),g,.7))
        # pale mushrooms at floor, never as companions
        for x in (15,146,7,154):
            rect(d,(x,188,x+2,205),mix(l,DEEP,.35))
            ellipse(d,(x-4,184,x+6,191),mix((205,193,204),g,.35),INK,1)
        for _ in range(20):
            x=rng.randrange(160); y=rng.randrange(95,145)
            rect(d,(x,y,x+rng.randrange(4,12),y+1),mix((159,164,177),f['sky'][1],.55))
    elif faction=='Yamato':
        # misty battlefield and distant mountains
        poly(d,[(0,104),(18,88),(35,103),(52,82),(76,104),(100,84),(126,103),(146,76),(159,97),(159,151),(0,151)],mix(m,DEEP,.2),INK,1)
        rect(d,(0,113,159,177),g, None,0)
        for x,col in [(18,f['primary']),(142,f['primary'])]:
            line(d,[(x,35),(x,136)],mix(m,DEEP,.2),2)
            poly(d,[(x,42),(x+22,49),(x+18,79),(x,75)],mix(col,DEEP,.45),INK,1)
        for _ in range(24):
            x=rng.randrange(160); y=rng.randrange(110,180)
            rect(d,(x,y,x+rng.randrange(4,15),y+rng.randrange(1,3)),mix(l,g,.5))
        poly(d,[(0,164),(38,157),(71,169),(112,159),(159,166),(159,220),(0,220)],mix(g,DEEP,.18),None,0)
    elif faction=='Huaxia':
        # cloud sea and battlements, jade peaks at horizon
        poly(d,[(0,108),(18,99),(37,108),(55,91),(74,106),(99,88),(119,106),(143,96),(159,105),(159,139),(0,139)],mix(m,DEEP,.1),None,0)
        rect(d,(0,117,159,173),g,INK,2)
        for x in range(4,160,24):
            rect(d,(x,108,x+15,119),m,INK,2)
        for x,col in [(23,f['primary']),(137,f['secondary'])]:
            line(d,[(x,28),(x,113)],mix(m,DEEP,.25),2)
            poly(d,[(x,34),(x+22,39),(x+17,70),(x,66)],mix(col,DEEP,.5),INK,1)
        for _ in range(24):
            x=rng.randrange(160); y=rng.randrange(142,214)
            rect(d,(x,y,x+rng.randrange(3,10),y+rng.randrange(1,4)),mix(m,g,.45))
    elif faction=='Roma':
        # forum at golden hour, columns and cypress silhouettes
        rect(d,(0,110,159,165),g,INK,1)
        for x in (16,144):
            rect(d,(x,48,x+11,166),mix(l,g,.35),INK,2)
            rect(d,(x-4,46,x+15,53),m,INK,1)
            rect(d,(x-4,89,x+15,95),m)
            line(d,[(x+2,58),(x+2,156)],mix(WHITE,g,.8),1)
        for x in (3,155):
            poly(d,[(x,69),(x-11,104),(x+11,104)],mix(DEEP,m,.4),INK,1)
            line(d,[(x,103),(x,166)],DEEP,3)
        line(d,[(126,33),(126,137)],mix(m,DEEP,.25),2)
        poly(d,[(126,35),(144,42),(140,67),(126,62)],mix(f['secondary'],DEEP,.4),INK,1)
        poly(d,[(0,159),(35,151),(71,166),(105,153),(159,164),(159,220),(0,220)],mix(g,DEEP,.2),None,0)
    elif faction=='Takamagahara':
        # sea of clouds, distant torii and sunrise without a head-hotspot
        for _ in range(18):
            x=rng.randrange(-20,160); y=rng.randrange(102,170)
            ellipse(d,(x-18,y-8,x+25,y+9),mix(l,g,.48))
        rect(d,(0,170,159,220),mix(g,DEEP,.05),None,0)
        # torii at the side
        for x in (17,143):
            rect(d,(x,41,x+5,139),mix(f['secondary'],DEEP,.25),INK,1)
            rect(d,(x-15,36,x+21,43),mix(f['secondary'],DEEP,.2),INK,2)
            rect(d,(x-9,52,x+15,57),mix(f['secondary'],DEEP,.3),INK,1)
        for _ in range(13):
            x=rng.randrange(160); y=rng.randrange(40,110)
            line(d,[(x,y),(x+rng.randrange(-8,9),y+rng.randrange(4,12))],mix(f['secondary'],sky1,.4),1)
    elif faction=='Duat':
        # cold star band, pylons, obelisks and sand
        for _ in range(32):
            x=rng.randrange(160); y=rng.randrange(8,90)
            rect(d,(x,y,x+1,y+1),mix(WHITE,f['sky'][0],.35))
        rect(d,(0,113,159,177),g,INK,1)
        for x in (7,149):
            poly(d,[(x-15,158),(x-9,80),(x+9,80),(x+16,158)],mix(m,DEEP,.25),INK,2)
            line(d,[(x,88),(x,151)],mix(f['primary'],m,.45),1)
        rect(d,(0,168,159,220),mix(g,DEEP,.2),None,0)
        for _ in range(30):
            x=rng.randrange(160); y=rng.randrange(166,220)
            rect(d,(x,y,x+rng.randrange(2,8),y+rng.randrange(1,3)),mix(l,g,.45))
    return d


def base_skin(name):
    if any(k in name for k in ['Anubis','Horus','Sekhmet','Big Bad Wolf']): return '#3b3439'
    if name in ['Medusa']: return '#6c9b72'
    if name=='Sun Wukong': return '#b6814f'
    if name in ['Hercules','Ares','Spartacus','Benkei','Guan Yu','Lu Bu','Susanoo','Little John']: return '#9b654b'
    if name in ['Kaguya','Amaterasu','Izanami','Isis','Nephthys','Snow White']: return '#e3c9b8'
    if name=='Nezha': return '#d49b78'
    return '#b9785d'


def draw_face(d,cx,cy,skin,kind='human',rng=None,small=False):
    sw=13 if small else 17
    sh=18 if small else 22
    if kind in ('jackal','wolf','lioness','falcon','monkey'):
        # animal head built from a blocky muzzle, ears/crest handled by caller
        poly(d,[(cx-sw,cy-7),(cx-sw+5,cy-17),(cx-5,cy-20),(cx+8,cy-17),(cx+sw,cy-8),(cx+sw-3,cy+10),(cx+8,cy+16),(cx-9,cy+15),(cx-sw+1,cy+8)],skin,INK,2)
        poly(d,[(cx-5,cy+3),(cx+7,cy+3),(cx+4,cy+11),(cx-4,cy+11)],shade(skin,-.35),INK,1)
        ellipse(d,(cx-10,cy-7,cx-4,cy-1),'#d6b45e',INK,1)
        ellipse(d,(cx+4,cy-7,cx+10,cy-1),'#d6b45e',INK,1)
        rect(d,(cx-8,cy-5,cx-6,cy-1),INK)
        rect(d,(cx+6,cy-5,cx+8,cy-1),INK)
        line(d,[(cx-5,cy+11),(cx,cy+13),(cx+5,cy+11)],INK,1)
        return
    ellipse(d,(cx-sw,cy-sh,cx+sw,cy+sh),skin,INK,2)
    # cheek / nose planes
    poly(d,[(cx-2,cy-6),(cx+2,cy-6),(cx+4,cy+7),(cx,cy+10),(cx-4,cy+7)],shade(skin,.12),None,0)
    # eyes: dark pupils, visible irises and clean whites
    eye_y=cy-4
    rect(d,(cx-sw+5,eye_y-2,cx-3,eye_y+2),WHITE,INK,1)
    rect(d,(cx+3,eye_y-2,cx+sw-5,eye_y+2),WHITE,INK,1)
    rect(d,(cx-6,eye_y-1,cx-3,eye_y+2),'#4b78a6',None,0)
    rect(d,(cx+3,eye_y-1,cx+6,eye_y+2),'#4b78a6',None,0)
    rect(d,(cx-5,eye_y,cx-3,eye_y+2),INK)
    rect(d,(cx+3,eye_y,cx+5,eye_y+2),INK)
    line(d,[(cx-sw+4,eye_y-5),(cx-3,eye_y-6)],INK,2)
    line(d,[(cx+3,eye_y-6),(cx+sw-4,eye_y-5)],INK,2)
    line(d,[(cx-6,cy+12),(cx,cy+14),(cx+7,cy+12)],INK,1)


def draw_hair(d,cx,cy,kind,skin,rng,small=False):
    sw=13 if small else 18
    if kind in ('animal','jackal','wolf','lioness','falcon','monkey'):
        return
    if kind in ('bald','shaved'):
        return
    hair={'white':'#d1d0c5','black':'#1c1d2b','dark':'#252331','brown':'#4b2d28','red':'#8f3d36','gold':'#bf8d35','silver':'#c7ced0','grey':'#656572'}.get(kind,'#252331')
    if kind=='longwhite': hair='#d1d0c5'
    # blocky hair cap and side locks
    poly(d,[(cx-sw,cy-7),(cx-sw+3,cy-18),(cx-8,cy-24),(cx+4,cy-25),(cx+sw-1,cy-17),(cx+sw,cy-5),(cx+sw-5,cy-9),(cx+7,cy-13),(cx-5,cy-12),(cx-sw+4,cy-8)],hair,INK,2)
    if kind in ('longwhite','black','dark','silver'):
        rect(d,(cx-sw+1,cy-2,cx-sw+6,cy+18),hair,INK,1)
        rect(d,(cx+sw-6,cy-1,cx+sw+1,cy+18),hair,INK,1)
    if kind=='red':
        rect(d,(cx-sw+2,cy-2,cx-sw+6,cy+13),hair,INK,1)
    # highlights
    line(d,[(cx-sw+3,cy-13),(cx-5,cy-21)],shade(hair,.32),1)
    if kind in ('white','longwhite','silver'):
        line(d,[(cx-8,cy-18),(cx+3,cy-22)],WHITE,1)


def outfit_colors(faction, name, rng):
    f=FACTIONS[faction]
    p=rgb(f['primary']); s=rgb(f['secondary'])
    # varied but faction-bound garment colors
    body=p
    if any(k in name for k in ['Merlin','Morgan','Mordred','Tsukuyomi','Izanami','Nephthys','Anubis']): body=mix('#1e2433',p,.22)
    if any(k in name for k in ['Hua Tuo','Cicero','Zhuge Liang','Ma\'at','Izanagi','Apollo','Guinevere']): body=mix('#e1d7c5',p,.14)
    if name in ['Robin Hood','Maid Marian','Little John','Friar Tuck']: body=mix('#315f45',p,.45)
    if name in ['Red Riding Hood','Lu Bu','Minamoto no Yoshitsune','Tomoe Gozen','Ares','Nezha']: body=mix('#9a3d39',p,.4)
    return body, s, mix(body,DEEP,.38), mix(body,WHITE,.25)


def add_rim(d,cx,head_y,body_col,rim,role,feature):
    # crisp pixel contour on the upper-left body itself
    if role in ('Tank','Bruiser'):
        pts=[(cx-38,84),(cx-50,101),(cx-42,126),(cx-31,142)]
    elif role in ('Caster','Controller'):
        pts=[(cx-27,80),(cx-43,98),(cx-37,126),(cx-27,144)]
    elif role=='Medic':
        pts=[(cx-24,82),(cx-41,101),(cx-33,131),(cx-22,149)]
    else:
        pts=[(cx-25,82),(cx-43,101),(cx-35,132),(cx-22,150)]
    line(d,pts,rim,2)
    line(d,[(cx-15,head_y-17),(cx-25,head_y-21)],rim,1)


def add_effects(d,cx,head_y,element,role,feature,rng):
    e=rgb(ELEMENTS[element])
    # faint, blocky effects, kept away from eyes
    if role in ('Caster','Controller'):
        for i in range(4 if feature in ('runes-hood','eboshi-shikigami','mianguan-beads','solar-corona') else 2):
            ang=(-2.6+i*1.5)+rng.random()*.2
            x=int(cx+math.cos(ang)*(35+rng.randrange(4,16)))
            y=int(head_y+math.sin(ang)*(26+rng.randrange(3,15)))
            rect(d,(x,y,x+2,y+2),e)
    elif role=='Medic':
        for i in range(6):
            x=int(cx+rng.randrange(-35,36)); y=int(127+rng.randrange(-14,18))
            rect(d,(x,y,x+2,y+2),e)
    elif role=='Bruiser':
        for i in range(4):
            x=int(cx+rng.choice([-1,1])*rng.randrange(32,57)); y=rng.randrange(74,137)
            rect(d,(x,y,x+2,y+2),e)
    elif role=='Tank' and element!='Physical':
        for i in range(3):
            x=int(cx+rng.choice([-1,1])*rng.randrange(32,52)); y=rng.randrange(86,145)
            rect(d,(x,y,x+2,y+2),e)
    # restrained diagonal streaks for lightning/fire only
    if element=='Lightning':
        for off in (-22,12):
            line(d,[(cx+off,head_y+28),(cx+off+8,head_y+19),(cx+off+5,head_y+14)],e,1)
    if element=='Fire':
        for off in (-34,35):
            poly(d,[(cx+off,113),(cx+off+3,106),(cx+off+5,114),(cx+off+2,121)],e,None,0)


def draw_head_feature(d,cx,cy,feature,meta,rng,small=False):
    # Hair/face base then add unmistakable silhouettes.
    name=meta[2]
    if feature in ('jackal-head','falcon-head','lioness-solar','wolf-muzzle'):
        kind={'jackal-head':'jackal','falcon-head':'falcon','lioness-solar':'lioness','wolf-muzzle':'wolf'}[feature]
        draw_face(d,cx,cy,base_skin(name),kind,rng,small)
        if kind in ('jackal','falcon'):
            poly(d,[(cx-14,cy-14),(cx-18,cy-31),(cx-10,cy-23),(cx-4,cy-17)],shade(base_skin(name),-.1),INK,2)
            poly(d,[(cx+7,cy-17),(cx+13,cy-31),(cx+17,cy-14),(cx+12,cy-8)],shade(base_skin(name),-.1),INK,2)
        if kind=='wolf':
            poly(d,[(cx-15,cy-16),(cx-19,cy-31),(cx-9,cy-23),(cx-4,cy-15)],shade(base_skin(name),-.05),INK,2)
            poly(d,[(cx+7,cy-15),(cx+13,cy-25),(cx+18,cy-29),(cx+17,cy-9)],shade(base_skin(name),-.05),INK,2)
            line(d,[(cx-9,cy+6),(cx+9,cy+6)],'#d4c5b0',2)
        if kind=='lioness':
            for a in range(8):
                x=cx+int(math.cos(a*math.pi/4)*23); y=cy+int(math.sin(a*math.pi/4)*24)
                line(d,[(cx+int(math.cos(a*math.pi/4)*17),cy+int(math.sin(a*math.pi/4)*17)),(x,y)],'#a98535',3)
        return
    # human head
    skin=base_skin(name)
    draw_face(d,cx,cy,skin,'human',rng,small)
    hair='dark'
    if name in ['Zeus','Apollo','Hercules','Hua Tuo','Huang Zhong','Guan Yu','Zhuge Liang','Benkei','Izanagi']: hair='white' if name not in ['Apollo','Hercules'] else ('gold' if name=='Apollo' else 'dark')
    if name in ['Athena','Medusa','Morgan le Fay','Maid Marian','Snow White','Izanami','Amaterasu','Inari','Kaguya']: hair='black'
    if name in ['Guinevere','Will Scarlet','Red Riding Hood']: hair='red'
    if name in ['King Arthur','Lancelot','Mordred','Robin Hood','Brutus','Julius Caesar','Spartacus','Susanoo','Tsukuyomi']: hair='dark'
    if name in ['Merlin']: hair='longwhite'
    if name in ['Ares','Lu Bu','Qin Shi Huang','Constantine the Great','Friar Tuck']: hair='brown'
    if name in ['Tomoe Gozen','Minamoto no Yoshitsune','Mulan','Rumpelstiltskin','Nezha','Momotaro']: hair='black'
    draw_hair(d,cx,cy,hair,skin,rng,small)
    # beard / moustache planes
    if name in ['Zeus','Hercules','King Arthur','Merlin','Benkei','Zhuge Liang','Guan Yu','Hua Tuo','Huang Zhong','Izanagi','Constantine the Great','Friar Tuck']:
        beard='#d1d0c5' if name not in ['Hercules','King Arthur'] else '#3c2c2a'
        if name=='Guan Yu': beard='#171925'
        poly(d,[(cx-10,cy+7),(cx+10,cy+7),(cx+7,cy+20),(cx,cy+25),(cx-8,cy+18)],beard,INK,1)
    if name in ['Qin Shi Huang','Tsukuyomi','Abe no Seimei']:
        line(d,[(cx-4,cy+10),(cx+5,cy+10)],'#24212a',2)
    # Feature silhouettes
    if feature in ('laurel-lightning','laurel-cuirass'):
        for i in range(5):
            ellipse(d,(cx-15+i*5,cy-23-(i%2)*2,cx-8+i*5,cy-18-(i%2)*2),'#c6a13b',INK,1)
    if feature in ('helm-crest','close-helm','simple-helm-crossbow'):
        poly(d,[(cx-19,cy-11),(cx-18,cy-25),(cx-6,cy-29),(cx+10,cy-26),(cx+18,cy-12),(cx+13,cy-7),(cx-13,cy-7)],'#766a62',INK,2)
        if feature=='helm-crest':
            poly(d,[(cx-4,cy-28),(cx+1,cy-39),(cx+5,cy-28)],'#7e4a42',INK,1)
        if feature=='close-helm':
            line(d,[(cx-17,cy-11),(cx+17,cy-11)],'#b27a58',1)
    if feature=='lionhood':
        poly(d,[(cx-19,cy-13),(cx-23,cy-25),(cx-13,cy-36),(cx+1,cy-30),(cx+18,cy-35),(cx+23,cy-22),(cx+18,cy-10)],'#8b6b49',INK,2)
        poly(d,[(cx-12,cy-23),(cx+13,cy-23),(cx+8,cy-14),(cx-8,cy-14)],'#b58b57',INK,1)
    if feature=='solar-lyre' or feature=='solar-corona':
        for a in range(0,360,30):
            rad=math.radians(a); r1=28; r2=39
            line(d,[(cx+int(math.cos(rad)*r1),cy+int(math.sin(rad)*r1)),(cx+int(math.cos(rad)*r2),cy+int(math.sin(rad)*r2))],'#d9a94c',1)
        ellipse(d,(cx-26,cy-28,cx+26,cy+28),None,'#d9a94c',2)
    if feature=='serpent-hair':
        for i in range(8):
            x=cx-20+i*6
            line(d,[(x,cy-16),(x-3+(i%2)*6,cy-29-rng.randrange(4,12)),(x+2,cy-38-rng.randrange(0,7))],'#6d9b6a',3)
            ellipse(d,(x-2,cy-40-rng.randrange(0,7),x+3,cy-35-rng.randrange(0,5)),'#6d9b6a',INK,1)
    if feature in ('crown-pommel','crown'):
        poly(d,[(cx-18,cy-20),(cx-14,cy-34),(cx-5,cy-25),(cx,cy-36),(cx+6,cy-25),(cx+16,cy-34),(cx+19,cy-19)],'#c9a227',INK,2)
    if feature in ('runes-hood','eboshi-shikigami'):
        poly(d,[(cx-16,cy-18),(cx-14,cy-37),(cx+7,cy-45),(cx+16,cy-28),(cx+12,cy-17)],'#202443',INK,2)
    if feature=='circlet-hands':
        line(d,[(cx-15,cy-20),(cx,cy-25),(cx+15,cy-20)],'#d4af37',2)
    if feature in ('horsehide-helm',):
        poly(d,[(cx-19,cy-11),(cx-24,cy-24),(cx-12,cy-33),(cx+7,cy-30),(cx+20,cy-19),(cx+17,cy-8)],'#4e3a31',INK,2)
    if feature in ('hood-bow','red-hood-hatchet'):
        poly(d,[(cx-23,cy-17),(cx-12,cy-35),(cx+10,cy-34),(cx+23,cy-16),(cx+13,cy-13),(cx-12,cy-13)],'#3d6748' if feature=='hood-bow' else '#8d3036',INK,2)
    if feature=='hood-bow':
        poly(d,[(cx+5,cy-33),(cx+12,cy-45),(cx+16,cy-31)],'#c8a34a',INK,1)
    if feature in ('topknot-crossed-swords','high-hair-yumi'):
        ellipse(d,(cx-6,cy-44,cx+7,cy-29),'#1a1b27',INK,1)
        rect(d,(cx-4,cy-47,cx+4,cy-42),'#1a1b27',INK,1)
    if feature=='shaved-naginata':
        ellipse(d,(cx-15,cy-28,cx+15,cy-6),shade(skin,.18),INK,1)
    if feature=='eboshi-shikigami':
        poly(d,[(cx-12,cy-22),(cx-12,cy-44),(cx+12,cy-44),(cx+15,cy-20)],'#181a28',INK,2)
    if feature=='moon-longhair':
        ellipse(d,(cx-33,cy-35,cx+33,cy+31),'#beb9d0',INK,1)
        # repaint facial opening
        ellipse(d,(cx-17,cy-22,cx+17,cy+22),skin,INK,2)
        draw_face(d,cx,cy,skin,'human',rng,small)
        draw_hair(d,cx,cy,'black',skin,rng,small)
        for dx in (-22,22): line(d,[(cx+dx,cy-10),(cx+dx*2,cy+83)],'#171924',5)
    if feature=='mianguan-beads':
        poly(d,[(cx-16,cy-26),(cx-11,cy-39),(cx+12,cy-39),(cx+17,cy-26)],'#171925',INK,2)
        for dx in (-10,-5,0,5,10):
            line(d,[(cx+dx,cy-27),(cx+dx,cy-7)],'#d9a521',1)
            rect(d,(cx+dx-1,cy-8,cx+dx+1,cy-5),'#d9a521')
    if feature=='pheasant-plumes':
        line(d,[(cx+7,cy-28),(cx+17,cy-55)],'#d9a521',3)
        line(d,[(cx+11,cy-29),(cx+25,cy-51)],'#b03a2e',2)
    if feature=='guan-fan':
        # cap
        poly(d,[(cx-16,cy-18),(cx-14,cy-36),(cx+14,cy-36),(cx+16,cy-18)],'#302735',INK,2)
    if feature=='long-beard-crescent':
        # reinforce long black beard
        poly(d,[(cx-10,cy+6),(cx+12,cy+7),(cx+8,cy+37),(cx,cy+49),(cx-9,cy+34)],'#151723',INK,1)
    if feature=='spectacles-herbs':
        ellipse(d,(cx-14,cy-8,cx-2,cy+2),None,INK,1); ellipse(d,(cx+2,cy-8,cx+14,cy+2),None,INK,1); line(d,[(cx-2,cy-3),(cx+2,cy-3)],INK,1)
    if feature=='monkey-staff':
        # ears and gold circlet
        ellipse(d,(cx-24,cy-8,cx-12,cy+6),'#b6814f',INK,1); ellipse(d,(cx+12,cy-8,cx+24,cy+6),'#b6814f',INK,1)
        line(d,[(cx-15,cy-21),(cx+15,cy-21)],'#d9a521',2)
    if feature=='child-wheels':
        ellipse(d,(cx-15,cy-22,cx+15,cy+20),skin,INK,2)
        draw_face(d,cx,cy,skin,'human',rng,True)
        draw_hair(d,cx,cy,'black',skin,rng,True)
        ellipse(d,(cx-30,169,cx-5,194),None,'#ff7a4d',2); ellipse(d,(cx+7,169,cx+32,194),None,'#ff7a4d',2)
    if feature=='solar-corona':
        for a in range(0,360,30):
            rad=math.radians(a); line(d,[(cx+int(math.cos(rad)*27),cy+int(math.sin(rad)*27)),(cx+int(math.cos(rad)*39),cy+int(math.sin(rad)*39))],'#ffd977',1)
    if feature=='silver-hair-mirror':
        line(d,[(cx-13,cy-22),(cx-21,cy+24)],'#c7ced0',3); line(d,[(cx+13,cy-22),(cx+21,cy+28)],'#c7ced0',3)
    if feature=='half-veil':
        poly(d,[(cx+1,cy-25),(cx+19,cy-15),(cx+21,cy+22),(cx+5,cy+28)],'#b9b8bd',INK,1)
    if feature=='fox-mask-tails':
        poly(d,[(cx-16,cy-25),(cx,cy-39),(cx+16,cy-25),(cx+8,cy-15),(cx-8,cy-15)],'#e1e0d4',INK,2)
        for i in range(5):
            x=cx-42+i*21
            poly(d,[(cx-9+i*3,96),(x,74-rng.randrange(0,13)),(x+12,83),(cx+11+i*3,106)],'#e1e0d4',INK,1)
    if feature=='wild-hair-trident':
        for dx in (-20,-12,12,20): line(d,[(cx+dx//2,cy-16),(cx+dx,cy-35-rng.randrange(4,13))],'#181a25',3)
    if feature=='jackal-head': pass
    if feature=='falcon-head':
        poly(d,[(cx+5,cy-1),(cx+27,cy+4),(cx+8,cy+9)],'#b89049',INK,1)
    if feature=='ostrich-feather':
        line(d,[(cx,cy-28),(cx+5,cy-59)],'#eee1bd',3)
        line(d,[(cx+5,cy-58),(cx+13,cy-68)],'#eee1bd',2)
    if feature=='lioness-solar':
        ellipse(d,(cx-27,cy-43,cx+27,cy+11),'#d1a946',INK,1)
        poly(d,[(cx+9,cy-41),(cx+13,cy-52),(cx+19,cy-43),(cx+15,cy-34)],'#b03a2e',INK,1)
    if feature in ('feathered-wings','folded-wings'):
        # behind-head wings: attached, no separate beings
        col='#d5c7b5' if feature=='feathered-wings' else '#3b3040'
        for side in (-1,1):
            pts=[(cx+side*14,cy+15),(cx+side*34,cy-8),(cx+side*49,cy+25),(cx+side*43,cy+73),(cx+side*24,cy+53)]
            poly(d,pts,col,INK,2)
            for j in range(3): line(d,[(cx+side*(22+j*5),cy+14+j*12),(cx+side*(39+j*3),cy+31+j*10)],shade(col,.2),1)
    if feature=='raven-smoke':
        poly(d,[(cx+18,cy+18),(cx+35,cy+6),(cx+43,cy+14),(cx+29,cy+24),(cx+46,cy+30),(cx+27,cy+31)],'#282033',None,0)
    # generic facial scars/marks for specific legends
    if name in ['Ares','Will Scarlet','Spartacus','Lu Bu','Huang Zhong']:
        line(d,[(cx+5,cy-10),(cx+11,cy+4)],'#6d3538',1)
    if name in ['Horus']:
        line(d,[(cx-13,cy+8),(cx-4,cy+12)],'#65a6bd',1)


def draw_costume(d,cx,head_y,meta,rng):
    legend_id,faction,name,rarity,role,element,identity,costume,feature=meta
    body,accent,shadow,hi=outfit_colors(faction,name,rng)
    # body silhouette and garment
    sw={'Tank':43,'Bruiser':38,'Caster':34,'Controller':33,'Medic':32,'Sniper':31}[role]
    if name in ['Little John','Hercules','Guan Yu','Benkei']: sw+=8
    top=75; bottom=224
    # rear cloak / tails
    if feature in ('horsehide-helm','raven-smoke','hood-bow','red-hood-hatchet','diadem-standard','moon-longhair'):
        poly(d,[(cx-sw//2,79),(cx-sw-10,124),(cx-sw-8,203),(cx-8,190),(cx+sw+10,213),(cx+sw+6,114),(cx+sw//2,79)],mix(body,DEEP,.35),INK,2)
    poly(d,[(cx-sw//2,top),(cx-22,91),(cx-31,136),(cx-25,191),(cx-16,220),(cx+24,220),(cx+33,166),(cx+28,121),(cx+sw//2,top)],body,INK,2)
    # torso planes
    poly(d,[(cx-20,85),(cx-7,101),(cx+6,101),(cx+20,85),(cx+26,145),(cx+16,189),(cx,202),(cx-17,188),(cx-26,145)],mix(body,shadow,.15),None,0)
    # clothing/armor central strip
    if feature in ('lionhood','crown-pommel','mianguan-beads','laurel-cuirass','diadem-standard','jackal-head','falcon-head','lioness-solar') or rarity in ('epic','legendary'):
        poly(d,[(cx-8,86),(cx+7,86),(cx+14,191),(cx+3,211),(cx-11,191)],accent,INK,1)
    else:
        line(d,[(cx-8,90),(cx-3,194)],mix(accent,body,.2),2)
    # faction costume lines and texture
    if faction in ('Camelot','Roma','Duat','Huaxia'):
        for y in range(98,174,13):
            line(d,[(cx-20,y),(cx+20,y+3)],mix(accent,body,.45),1)
    elif faction in ('Yamato','Takamagahara'):
        for y in range(99,165,11):
            line(d,[(cx-18,y),(cx+18,y+3)],mix(accent,body,.45),1)
    else:
        for i in range(6):
            x=cx-rng.randrange(14,25); y=rng.randrange(105,187)
            line(d,[(x,y),(x+rng.randrange(4,12),y+rng.randrange(1,5))],mix(accent,body,.35),1)
    # role arms and hands, laid above torso
    arm=shade(body,-.22)
    if role=='Tank':
        line(d,[(cx-25,92),(cx-54,119),(cx-48,149)],arm,15); line(d,[(cx-25,92),(cx-54,119),(cx-48,149)],INK,19); line(d,[(cx-25,92),(cx-54,119),(cx-48,149)],arm,13)
        line(d,[(cx+25,94),(cx+50,117),(cx+46,149)],arm,15); line(d,[(cx+25,94),(cx+50,117),(cx+46,149)],INK,19); line(d,[(cx+25,94),(cx+50,117),(cx+46,149)],arm,13)
        ellipse(d,(cx-55,145,cx-43,157),base_skin(name),INK,2); ellipse(d,(cx+42,145,cx+54,157),base_skin(name),INK,2)
    elif role=='Bruiser':
        line(d,[(cx-23,95),(cx-50,126),(cx-57,155)],arm,14); line(d,[(cx-23,95),(cx-50,126),(cx-57,155)],INK,18); line(d,[(cx-23,95),(cx-50,126),(cx-57,155)],arm,12)
        line(d,[(cx+22,96),(cx+47,79),(cx+58,57)],arm,14); line(d,[(cx+22,96),(cx+47,79),(cx+58,57)],INK,18); line(d,[(cx+22,96),(cx+47,79),(cx+58,57)],arm,12)
        ellipse(d,(cx+51,51,cx+64,64),base_skin(name),INK,2)
    elif role=='Caster':
        line(d,[(cx-20,97),(cx-43,80),(cx-48,52)],arm,12); line(d,[(cx-20,97),(cx-43,80),(cx-48,52)],INK,16); line(d,[(cx-20,97),(cx-43,80),(cx-48,52)],arm,10)
        line(d,[(cx+20,97),(cx+48,112),(cx+57,133)],arm,12); line(d,[(cx+20,97),(cx+48,112),(cx+57,133)],INK,16); line(d,[(cx+20,97),(cx+48,112),(cx+57,133)],arm,10)
        ellipse(d,(cx-54,45,cx-43,57),base_skin(name),INK,2); ellipse(d,(cx+52,129,cx+63,141),base_skin(name),INK,2)
    elif role=='Controller':
        line(d,[(cx-20,97),(cx-48,83),(cx-59,69)],arm,11); line(d,[(cx-20,97),(cx-48,83),(cx-59,69)],INK,15); line(d,[(cx-20,97),(cx-48,83),(cx-59,69)],arm,9)
        line(d,[(cx+20,97),(cx+48,83),(cx+59,67)],arm,11); line(d,[(cx+20,97),(cx+48,83),(cx+59,67)],INK,15); line(d,[(cx+20,97),(cx+48,83),(cx+59,67)],arm,9)
        ellipse(d,(cx-65,62,cx-54,73),base_skin(name),INK,2); ellipse(d,(cx+54,60,cx+65,71),base_skin(name),INK,2)
    elif role=='Medic':
        line(d,[(cx-19,98),(cx-35,119),(cx-29,137)],arm,11); line(d,[(cx-19,98),(cx-35,119),(cx-29,137)],INK,15); line(d,[(cx-19,98),(cx-35,119),(cx-29,137)],arm,9)
        line(d,[(cx+19,98),(cx+35,119),(cx+29,137)],arm,11); line(d,[(cx+19,98),(cx+35,119),(cx+29,137)],INK,15); line(d,[(cx+19,98),(cx+35,119),(cx+29,137)],arm,9)
        ellipse(d,(cx-36,133,cx-25,144),base_skin(name),INK,2); ellipse(d,(cx+25,133,cx+36,144),base_skin(name),INK,2)
    else: # sniper: forward draw and low weapon line
        line(d,[(cx-19,98),(cx-41,108),(cx-49,124)],arm,10); line(d,[(cx-19,98),(cx-41,108),(cx-49,124)],INK,14); line(d,[(cx-19,98),(cx-41,108),(cx-49,124)],arm,8)
        line(d,[(cx+19,98),(cx+45,111),(cx+51,128)],arm,10); line(d,[(cx+19,98),(cx+45,111),(cx+51,128)],INK,14); line(d,[(cx+19,98),(cx+45,111),(cx+51,128)],arm,8)
        ellipse(d,(cx-55,120,cx-45,130),base_skin(name),INK,2); ellipse(d,(cx+47,125,cx+57,135),base_skin(name),INK,2)
    # feature clothing details, all below/behind face
    if feature=='crown-pommel':
        line(d,[(cx+32,200),(cx+47,192)],'#d9b44b',3); ellipse(d,(cx+43,188,cx+51,196),'#d9b44b',INK,1)
    if feature=='raised-blade': line(d,[(cx+52,58),(cx+67,22)],'#d2d8d8',3); line(d,[(cx+53,57),(cx+68,22)],INK,5)
    if feature=='reversed-dagger': line(d,[(cx+48,151),(cx+62,166)],'#a9b6bc',2); line(d,[(cx+47,151),(cx+61,166)],INK,4)
    if feature in ('hood-bow','high-hair-yumi'):
        line(d,[(cx-49,119),(cx+53,101)],'#b79452',2); line(d,[(cx-49,119),(cx+53,101)],'#1e2227',1)
    if feature in ('scarlet-daggers','twin-daggers'):
        line(d,[(cx-29,153),(cx-49,179)],'#d6dada',2); line(d,[(cx+29,153),(cx+49,179)],'#d6dada',2)
    if feature in ('staff-giant','shaved-naginata'):
        line(d,[(cx+47,62),(cx+47,210)],'#8b6442',4); line(d,[(cx+47,62),(cx+47,210)],INK,6)
    if feature in ('red-hood-hatchet',):
        line(d,[(cx+30,122),(cx+58,88)],'#75492e',3); poly(d,[(cx+52,88),(cx+67,90),(cx+58,99)],'#9ca1a0',INK,1)
    if feature in ('topknot-crossed-swords','crossed-swords'):
        line(d,[(cx-40,108),(cx+39,168)],'#d5d4ce',2); line(d,[(cx+40,108),(cx-38,168)],'#d5d4ce',2)
    if feature=='banner-feather':
        line(d,[(cx+38,59),(cx+47,200)],'#744634',3); poly(d,[(cx+39,61),(cx+72,70),(cx+67,94),(cx+39,85)],'#b33c37',INK,1); line(d,[(cx+50,66),(cx+59,88)],'#f0c05a',1)
    if feature in ('guan-fan','spectacles-herbs','scroll-glyphs'):
        # object at lower edge / chest, never face
        if feature=='guan-fan':
            poly(d,[(cx+20,132),(cx+45,116),(cx+51,140),(cx+26,148)],'#eee0c6',INK,1)
            for j in range(4): line(d,[(cx+24+j*5,131),(cx+29+j*5,144)],'#ff4dd5',1)
        elif feature=='spectacles-herbs':
            for j in range(4): line(d,[(cx-5+j*4,148),(cx-8+j*4,137)],'#5f9c5e',2)
        else:
            rect(d,(cx+18,137,cx+47,160),'#e4d9c4',INK,1)
    if feature in ('long-beard-crescent',):
        poly(d,[(cx+22,81),(cx+61,75),(cx+64,84),(cx+24,91)],'#d5d1bf',INK,1)
    if feature=='monkey-staff':
        line(d,[(cx+51,45),(cx+51,205)],'#d9a521',5); line(d,[(cx+51,45),(cx+51,205)],INK,7)
    if feature=='simple-helm-crossbow':
        line(d,[(cx-39,148),(cx+42,137)],'#6c402d',4); line(d,[(cx+4,128),(cx+9,157)],'#b6bbc0',2)
    if feature=='hidden-dagger':
        line(d,[(cx+10,112),(cx+26,137)],'#c3cbd0',2)
    if feature=='diadem-standard':
        line(d,[(cx+38,39),(cx+38,177)],'#b88944',4); poly(d,[(cx+39,45),(cx+71,54),(cx+67,82),(cx+39,75)],'#d4af37',INK,1)
    if feature in ('purification-water','water'):
        for side in (-1,1):
            line(d,[(cx+side*22,126),(cx+side*29,145),(cx+side*24,166),(cx+side*32,183)],'#b8dff0',3)
    if feature=='wild-hair-trident':
        line(d,[(cx+47,71),(cx+56,203)],'#6d5c48',4); line(d,[(cx+47,71),(cx+56,203)],INK,6)
        line(d,[(cx+47,72),(cx+37,56)],'#b6c9ce',2); line(d,[(cx+47,72),(cx+47,51)],'#b6c9ce',2); line(d,[(cx+47,72),(cx+57,56)],'#b6c9ce',2)
    if feature=='silver-hair-mirror':
        ellipse(d,(cx+22,116,cx+47,143),'#8c8f9c',INK,2); ellipse(d,(cx+25,119,cx+44,140),'#273143',None,0)
    if feature=='half-veil': pass
    if feature=='fox-mask-tails': pass
    if feature=='ostrich-feather': pass
    if feature=='folded-wings': pass
    if feature=='feathered-wings': pass
    if feature=='jackal-head':
        # gold/lapis collar
        poly(d,[(cx-25,82),(cx,98),(cx+26,82),(cx+19,108),(cx,116),(cx-20,107)],'#c9a227',INK,2)
        for x in range(cx-17,cx+18,7): line(d,[(x,96),(x,108)],'#3a6d94',2)
    if feature=='falcon-head':
        poly(d,[(cx-27,81),(cx,94),(cx+28,81),(cx+22,106),(cx,114),(cx-22,105)],'#c9a227',INK,2)
        line(d,[(cx-16,93),(cx+17,102)],'#2d5d83',2)
    if feature=='lioness-solar':
        poly(d,[(cx-25,81),(cx,96),(cx+26,81),(cx+20,107),(cx,113),(cx-20,106)],'#c9a227',INK,2)
    if feature in ('feathered-wings','folded-wings'):
        pass


def draw_dual(d,cx,head_y,meta,rng):
    # Hansel & Gretel: two small adjacent figures, still one card composition.
    body,accent,shadow,hi=outfit_colors(meta[1],meta[2],rng)
    for ox, haircol in [(-16,'brown'),(16,'red')]:
        cy=head_y+rng.randrange(-1,2)
        draw_face(d,cx+ox,cy, '#d8b8aa','human',rng,True)
        draw_hair(d,cx+ox,cy,haircol,'#d8b8aa',rng,True)
        poly(d,[(cx+ox-13,cy+18),(cx+ox+13,cy+18),(cx+ox+19,200),(cx+ox-18,200)],mix(body,DEEP,.08),INK,2)
        line(d,[(cx+ox,cy+25),(cx+ox-2,190)],accent,2)
    # shared shoulders and candle in foreground
    line(d,[(cx-13,105),(cx-29,136)],shade(body,-.22),9); line(d,[(cx+13,105),(cx+29,136)],shade(body,-.22),9)
    rect(d,(cx-4,126,cx+4,159),'#d5c9ad',INK,1)
    poly(d,[(cx-5,126),(cx,116),(cx+5,126)],'#ffcf6a',INK,1)
    for x,y in [(cx-21,74),(cx+27,81),(cx-35,102),(cx+34,107)]: rect(d,(x,y,x+2,y+2),rgb(ELEMENTS['Nature']))


def draw_weapons_and_specials(d,cx,head_y,meta,rng):
    feat=meta[-1]; role=meta[4]; element=meta[5]; e=rgb(ELEMENTS[element])
    # objects not handled by costume function, always kept low or at side
    if feat=='dual-candle': return
    if feat=='imp-thread':
        for i in range(5):
            pts=[(cx-33+i*11,128),(cx-18+i*10,111-rng.randrange(0,8)),(cx+8+i*6,142)]
            line(d,pts,e,1)
    if feat=='wolf-muzzle':
        poly(d,[(cx-22,87),(cx,98),(cx+22,87),(cx+16,111),(cx,121),(cx-16,110)],'#6e635f',INK,2)
        line(d,[(cx-9,104),(cx+10,104)],'#d8d0c0',2)
    if feat=='apple-ribbon':
        ellipse(d,(cx+20,145,cx+37,162),'#9c3438',INK,2); line(d,[(cx+29,146),(cx+31,140)],'#58402b',2); poly(d,[(cx+31,142),(cx+39,137),(cx+35,148)],'#5fd48a',INK,1)
    if feat=='feather-cap-pipe':
        line(d,[(cx+20,123),(cx+61,118)],'#b8a079',3); rect(d,(cx+56,114,cx+65,121),'#b8a079',INK,1)
        for x in (cx-14,cx+20,cx+43): rect(d,(x,78-rng.randrange(0,10),x+2,80),e)
    if feat=='hachimaki' : line(d,[(cx-17,head_y-10),(cx+18,head_y-8)],'#f0c05a',2)
    if feat=='mianguan-beads': pass
    if feat=='ostrich-feather': pass
    if feat=='fox-mask-tails': pass
    if feat in ('feathered-wings','folded-wings'): pass


def draw_legend(meta):
    legend_id,faction,name,rarity,role,element,identity,costume,feature=meta
    rng=seeded(legend_id)
    im=Image.new('RGB',(W,H),rgb(FACTIONS[faction]['sky'][1]))
    d=background(im,faction,rng)
    cx=80+rng.randrange(-4,5); head_y=56+rng.randrange(-2,3)
    add_effects(d,cx,head_y,element,role,feature,rng)
    if feature=='dual-candle':
        draw_dual(d,cx,head_y,meta,rng)
    else:
        # Attached wings/tails are drawn behind the body before the costume.
        if feature in ('feathered-wings','folded-wings'):
            col='#d8cbbb' if feature=='feathered-wings' else '#3e3342'
            for side in (-1,1):
                pts=[(cx+side*15,91),(cx+side*38,71),(cx+side*54,106),(cx+side*46,157),(cx+side*22,137)]
                poly(d,pts,col,INK,2)
                for j in range(3): line(d,[(cx+side*(22+j*5),100+j*10),(cx+side*(40+j*4),122+j*9)],shade(col,.25),1)
        if feature=='fox-mask-tails':
            for i in range(5):
                side=-1 if i<3 else 1
                bx=cx+side*(16+(i%3)*8); by=112+(i%3)*14
                poly(d,[(cx+side*10,103),(bx,78+rng.randrange(-10,8)),(bx+side*12,88+rng.randrange(-5,10)),(cx+side*18,126)],'#e3dfd4',INK,1)
        draw_costume(d,cx,head_y,meta,rng)
        # special animal or human head sits above the torso
        if feature=='wolf-muzzle':
            draw_head_feature(d,cx,head_y,'wolf-muzzle',meta,rng)
        elif feature=='jackal-head':
            draw_head_feature(d,cx,head_y,'jackal-head',meta,rng)
        elif feature=='falcon-head':
            draw_head_feature(d,cx,head_y,'falcon-head',meta,rng)
        elif feature=='lioness-solar':
            draw_head_feature(d,cx,head_y,'lioness-solar',meta,rng)
        elif feature=='child-wheels':
            draw_head_feature(d,cx,head_y,feature,meta,rng)
        else:
            draw_head_feature(d,cx,head_y,feature,meta,rng)
        # costumes sometimes need attached details after head
        if feature=='dual-candle': pass
        draw_weapons_and_specials(d,cx,head_y,meta,rng)
        add_rim(d,cx,head_y,rgb(outfit_colors(faction,name,rng)[0]),ELEMENTS[element],role,feature)
        # role/action accents and faction-colored material blocks
        if rarity in ('epic','legendary'):
            for i in range(8 if rarity=='legendary' else 5):
                x=cx+rng.randrange(-30,31); y=rng.randrange(150,205)
                rect(d,(x,y,x+2,y+2),outfit_colors(faction,name,rng)[1])
    # broad dark lower fade so the portrait settles into the card
    for y in range(193,220,4):
        rect(d,(0,y,159,y+3),mix(FACTIONS[faction]['ground'],DEEP,(y-193)/35*.55),None,0)
    # re-add a few lower silhouette edges
    return im.resize((640,880),Image.Resampling.NEAREST)


def main():
    created=[]
    for meta in ROSTER:
        legend_id=meta[0]
        p=OUT/(legend_id+'.jpg')
        if p.exists():
            continue
        im=draw_legend(meta)
        im.save(p,'JPEG',quality=85,optimize=True,progressive=True,subsampling=2)
        created.append((legend_id,p.stat().st_size))
    print(f'Created {len(created)} fallback assets')
    for item in created: print(item[0],item[1])

if __name__=='__main__': main()
