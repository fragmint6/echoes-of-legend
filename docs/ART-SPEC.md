# Character Art Specification

The authoritative brief for every hero portrait in Echoes of Legend. One
entry per hero, written so any artist or generator produces a piece that
sits in the same world as the other 56.

Status: **22 of 57 implemented** (Camelot 6, Olympus 6, Sherwood 6,
Grimmwood 4), all body-only. Every hero is specified; the rest await
generation. Add art a batch at a time and run `python3 tools/wire_art.py` -
cards without a portrait keep their icon glyph, so a partly-illustrated
roster is a supported state.

**Known outstanding:**
- `grimmwood-snow-white` - the image generator's safety filter rejects this
  one at the output stage, twice, across two rewordings. It is not a prompt
  content problem we can see; try again later or author it by hand.
- `olympus-athena` still carries ~6.4k pixels of detached sparkle from the
  first pass and should be regenerated.

---

## 1. Hard constraints

These are not stylistic preferences. Break one and the art fails in the UI.

| Constraint | Value | Why |
| --- | --- | --- |
| Canvas | **96 x 96**, square | Renders at 154px in collection (2x DPR = 308 device px) and ~90px in battle. 96 upscales cleanly with `pixelated`; 64 was too coarse for the collection circle. |
| Format | PNG-32, transparent background | The card supplies its own backdrop. A baked background breaks the circular mask. |
| Palette | **32 colours max** per portrait | Keeps the pixel-art read honest. Anti-aliased gradients turn to mush at 96px. |
| Anti-aliasing | **None.** Hard pixel edges only | The renderer uses `image-rendering: pixelated`. Soft edges fight it and look blurry. |
| Safe area | Subject inside the **central 78%** | The collection card masks art to a circle. Anything in the corners is clipped. |
| Head position | Eyeline at **34-40%** from top | Portraits must agree with each other, or the grid looks drunk. |
| Framing | **Bust: head, shoulders, upper chest.** No full bodies, no legs | At 90px a full body is an unreadable smudge. |
| Silhouette | Must be identifiable **as a black shape** | The primary readability test. See section 4. |
| Facing | 3/4 view toward the viewer's left, or straight on | Consistent lighting direction across the roster. |
| Light source | Upper left, cool key / warm rim | Matches the card's `radial-gradient at 50% 30%`. |

### Do not include

**The body, hair and clothing only. Nothing else may appear.**

- **No weapons.** No sword, bow, arrow, staff, spear, dagger, axe, shield
  or polearm. Nothing held in the hands, and no hands raised into frame.
- **No effects.** No particles, sparkles, motes, embers, smoke, haze, aura,
  halo, glow orbs, runes, lightning arcs or energy of any kind.
- **No props or companions.** No lyres, tankards, scrolls, mirrors, fans,
  banners, apples, candles, ravens or foxes.
- Text, letters, numerals, signatures, watermarks
- Frames, borders, vignettes, drop shadows onto a background
- Ground planes, horizons, scenery, interior sets
- Anything in the corners: they are masked away

#### Why weapons and effects are banned

This is not a style preference, it is a layout constraint. The card masks
every portrait with **one fixed circle**, and `process_art.py` auto-fits
each piece to its bounding box. A held weapon or a floating effect enlarges
that box, so the fitter shrinks the actual character to make room for it.

Measured on the first pass: Zeus's bolt, Robin Hood's bow, Lancelot's sword
and Apollo's halo each pushed the bounding box out, and those heroes came
out visibly smaller than heroes with a plain bust. Merlin carried **24,102
pixels** of detached sparkle. The result was that no single cut line fit
the roster, which is exactly the symptom that prompted this rule.

With body-only art the silhouettes are uniform and one fixed mask works
for all 57. `verify_art.py` fails any portrait whose detached blobs exceed
4% of the body.

---

## 2. Shared visual language

Every portrait in the game obeys these so the roster reads as one set.

**Rendering.** Clean pixel art. Flat colour fills with deliberate, blocky
shading - two to four tones per material, never a smooth ramp. Think 16-bit
console portrait work: confident shapes, hard shadow terminators, selective
1px highlights on metal edges and eyes.

**Outline.** Selective dark outline (not a uniform 1px keyline). Outline
where the subject meets the background; skip it where two lit forms meet
inside the silhouette. This is what separates competent pixel art from
traced clipart.

**Rim light.** Every hero gets a **1-2px rim light** along the upper-left
contour in their **element colour**. This is the single strongest unifier
across the roster and it makes the bust pop off the dark card.

**Value structure.** Faces and focal detail carry the lightest values. Lower
chest and shoulders fall into shadow so the bust fades into the card rather
than ending in a hard cut.

**Expression.** Heroic, composed, in-character. No smiling for the camera,
no goofy poses, no modern gestures.

### Element colours (rim light and effect accents)

Element appears **only** as the rim light along the body's upper-left
contour. It never becomes an effect in the frame.

| Element | Hex |
| --- | --- |
| Physical | `#d8894f` |
| Magic | `#9b7bff` |
| Shadow | `#a05cd8` |
| Light | `#ffd977` |
| Lightning | `#63d7ff` |
| Fire | `#ff7a4d` |
| Nature | `#5fd48a` |

### Rarity, expressed as production value

Rarity is **not** a colour on the character. It is how much visual event the
portrait contains.

| Rarity | Direction |
| --- | --- |
| `common` | Grounded. Plain honest materials, no ornament. |
| `rare` | One distinctive costume feature that makes them recognisable. |
| `epic` | Elaborate costume detail: layered fabric, worked metal, rich texture. |
| `legendary` | Maximum costume presence: ornate materials, intricate worked detail, an unmistakable head-and-shoulders silhouette. |

Rarity is carried **entirely by costume**, because effects are banned. A
legendary is not brighter than a common - it is more elaborately dressed.

### Faction palettes

Each hero's costume leans on the faction's primary and secondary. The
element colour arrives via rim light and effects, so a Fire hero in a green
faction still reads as both.

| Faction | Primary | Secondary | Material and mood |
| --- | --- | --- | --- |
| Camelot | `#4c7bd8` | `#c9a227` | Polished steel, blue enamel, gold trim. Chivalric, formal. |
| Olympus | `#d8b64c` | `#6fd3e8` | Sun-bleached marble, laurel gold, aegean cloth. Classical. |
| Sherwood | `#3f9b5c` | `#c8a34a` | Waxed leather, forest wool, worn brass. Practical, outlaw. |
| Grimmwood | `#4fa86a` | `#8a5ad8` | Damp bark, storybook cloth, fungal violet. Uneasy, fairy-tale. |
| Yamato | `#e05a4a` | `#f0c05a` | Lacquered armour, silk cord, crimson and gold. Disciplined. |
| Huaxia | `#b03a2e` | `#d9a521` | Scale armour, imperial silk, jade and bronze. Grand, martial. |
| Roma | `#7b4dc0` | `#d4af37` | Burnished bronze, tyrian purple, laurel. Imperial, severe. |
| Takamagahara | `#e8e3d3` | `#c4392f` | Bleached silk, shrine white, vermilion accents. Ethereal, remote. |
| Duat | `#c9a227` | `#1f4e79` | Gold leaf, lapis inlay, linen wrap. Solemn, funerary. |

---

## 3. Prompt template

For generated art, every hero uses this skeleton. Fill the bracketed slots
from that hero's entry in section 5.

```
64x64 pixel art character portrait, [NAME], [ONE-LINE IDENTITY].
Bust framing: head, shoulders and upper chest only, centred, facing
three-quarter left, eyeline 36% from the top.
[COSTUME AND MATERIALS.]
[DEFINING FEATURE - a worn or physical detail: headgear, hair, facial
feature, collar or armour. Never a held object.]
Palette drawn from [FACTION PRIMARY] and [FACTION SECONDARY], with a
1-2px [ELEMENT COLOUR] rim light along the upper-left contour.
Clean 16-bit pixel art, flat colour fills, hard blocky shading, 2-4 tones
per material, selective dark outline, no anti-aliasing, limited palette of
32 colours.
Fully transparent background. No text, no frame, no ground, no scenery.
[RARITY DIRECTION.]
```

Generate at 64x64 or 96x96. If the generator only produces larger, downsample
with **nearest neighbour** to 96x96 - never bilinear, which destroys the hard
edges.

---

## 4. Acceptance checklist

Run every portrait through this before it ships:

1. **Silhouette test.** Fill the art 100% black. Is the hero still
   identifiable? If two heroes' silhouettes are confusable, one needs a
   distinguishing shape.
2. **Circle test.** Mask to a centred circle at 78% width. Is anything
   important clipped?
3. **Thumbnail test.** View at 48px. Does the face still read?
4. **Alignment test.** Place beside three other portraits from the same
   faction. Are the eyelines within a few pixels?
5. **Colour count.** `magick identify -format "%k"` must return <= 32.
6. **Edge test.** Zoom to 800%. Any semi-transparent or anti-aliased pixels
   at the contour mean it was resized wrong.
7. **Legibility over the card.** Check the name plate, element orb and status
   chips are all still readable on top of it.

`tools/verify_art.py` automates 2, 5, 6 and the canvas size.

---

## 4b. Pipeline

| Step | Command | Notes |
| --- | --- | --- |
| Write the prompt | edit `tools/art_prompts.py` | one entry per hero; house style lives in the shared blocks so a change propagates to all |
| Generate | any generator, at 64 or larger | output lands in `art-src/`, which is **not** shipped |
| Process | `python3 tools/process_art.py` | cut out, trim, scale, centre, quantise, harden alpha; writes `assets/heroes/<id>.png` |
| Verify | `python3 tools/verify_art.py` | exits non-zero on any failure |
| Wire up | add `art: 'assets/heroes/<id>.png'` to the card | cards without `art` keep their icon glyph, so factions can land one at a time |

**The generator flattens transparency into a light checkerboard** rather
than returning real alpha. `process_art.py` reconstructs it with a flood
fill inward from the border, not a global colour threshold - a threshold
would delete white cloth *inside* the figure, such as Zeus's himation.

---

## 4c. How the art is framed on the card

**Collection card.** The portrait is drawn at 1.15x the sigil ring's
diameter and masked by the *union* of two shapes: a half-plane covering
everything above the ring's centre line, and the ring's circle, with the cut line at
**33% down the circle**: only the top third is unmasked, so the crown of
the head breaks out above the arc while the body stays held inside the
sigil.

A single fixed cut only works because every silhouette is now uniform.
The previous attempt used a per-hero-variable cut precisely because
weapons and effects made every bounding box a different shape - removing
them removed the need for the variable.

Two CSS traps this hit, both worth knowing:

- **`radial-gradient(circle <percentage> ...)` is invalid** and silently
  voids the whole `mask-image` declaration. The computed value comes back
  as `none` and nothing is masked. The explicit two-value `ellipse 27% 27%`
  form is required. The box is square, so it is still a circle.
- **The translate must account for the ring's own `-54%` offset**, not just
  the downward push. The correct expression is `-(0.04 + cy x K) / K`,
  which is card-size independent. Getting it "close" put the mask 5.2px
  above the drawn ring - visible as art spilling past the bottom arc.

Hover therefore uses a **pure translate, never a scale**: the mask is sized
in percentages of the element, so scaling the element scales the mask
circle off the drawn ring. The ring is also frozen in place on art cards,
since it is the cut line.

**Battle card.** No circle there, so the portrait simply fills the tile,
inset 17% from the top so the status chip row never lands on the face.

---

## 5. Per-hero briefs

Format: **Name** `rarity / role / element` - identity, costume, defining
feature.

The "defining feature" is always something **worn or physical**: headgear,
hair, a facial feature, a collar, armour. Where an older draft named a held
object (Excalibur, a lyre, a quarterstaff) it has been replaced by the
equivalent worn detail. `tools/art_prompts.py` is the machine-readable
source of truth and is checked against the live roster.

### Olympus - Thunder sits the throne of heaven `#d8b64c` / `#6fd3e8`

**Zeus** `legendary / Caster / Lightning`
King of the gods, storm-crowned. Iron-grey beard braided with gold rings,
heavy brow, thunderhead hair. Bare chested under a gold-clasped himation the
colour of storm cloud; a laurel of beaten gold. Signature: a lightning bolt
gripped at the shoulder, its light throwing hard shadows up his face. Arcs of
`#63d7ff` crawl across his beard and shoulders, with a faint corona behind
the head. Legendary: maximum presence, the brightest thing on the card.

**Athena** `rare / Controller / Light`
Goddess of measured war. Calm, level gaze, dark hair bound under a raised
Corinthian helm pushed back to reveal the face. Bronze cuirass over a pale
chiton; the aegis at her shoulder bearing a small gorgon boss. Signature: the
raised helm crest, a clean arc against the background. Soft `#ffd977` halo
behind the helm, an owl's eye-shine implied in the shadow at her shoulder.

**Hercules** `epic / Tank / Physical`
Strongman demigod. Enormous shoulders and neck, jaw set, short dark curls and
a beard. Wears the Nemean lion pelt as a hood, the beast's upper jaw over his
brow and paws knotted at his chest. Bare, scarred torso. Signature: the lion
hood - the silhouette must read as man-inside-lion. Dusty `#d8894f` impact
motes near the shoulders. Epic: heavy detail in the pelt fur and scarring.

**Apollo** `rare / Medic / Light`
Sun god, healer and archer. Youthful, unlined, serene. Golden curls under a
laurel wreath; a bare shoulder and draped saffron chiton. Signature: a solar
disc halo directly behind the head, rendered as clean radiating spokes rather
than a blur. Warm `#ffd977` bloom across the upper chest, a lyre's curved arm
just visible at the lower edge.

**Medusa** `epic / Controller / Shadow`
Cursed gorgon. Green-scaled skin over a still-beautiful face, heavy-lidded
eyes glowing faintly. Hair is a mass of small serpents, alert and separated
so they read as distinct shapes, not a lump. Bronze scale collar. Signature:
the serpent hair - the silhouette's defining feature. Violet `#a05cd8` haze
around the eyes; the faintest stone-grey creep at the outer edge of the
shoulders. Epic: many individually shaped snakes.

**Ares** `common / Bruiser / Fire`
God of slaughter. Brutal, scarred face mostly hidden behind a battered
close-helm with a blood-red horsehair crest; only eyes and snarling mouth
visible. Dented bronze cuirass, spattered dark. Signature: the crest and the
crude helm. Embers of `#ff7a4d` drifting past one shoulder. Common: plain,
functional gear, no ornament - his power reads as damage, not decoration.

---

### Camelot - Oaths of steel, crowns of fate `#4c7bd8` / `#c9a227`

**King Arthur** `legendary / Tank / Physical` - Noble king, mid-30s, dark
beard, weary but resolute. Mirror-polished plate with blue enamel inlay and
gold edging; a heavy crown over a mail coif. Signature: crown plus the
pommel of Excalibur at the lower edge, both catching light. Golden motes of
`#d8894f` dust. Legendary: ornate engraving across every plate.

**Merlin** `epic / Controller / Magic` - Ancient wizard, deep-lined face,
long white beard, eyes lit from within. Midnight-blue robe embroidered with
gold constellations, deep hood half-back. Signature: floating runes orbiting
his head. `#9b7bff` arcane motes and glyph fragments. Epic: elaborate
embroidery, active magic.

**Lancelot** `common / Bruiser / Physical` - Peerless knight. Handsome,
disciplined, clean-shaven, short dark hair. Plain but perfectly maintained
steel plate, blue surcoat, no gold. Signature: the raised sword blade at the
edge of frame. Minimal `#d8894f` glint. Common: quality without ornament.

**Morgan le Fay** `epic / Controller / Shadow` - Sorceress queen. Pale,
sharp-featured, black hair, a circlet of dark iron. Black and violet robes,
raven feathers at the collar. Signature: a raven perched at her shoulder,
half-dissolving into smoke. `#a05cd8` shadow curling upward. Epic: rich
feather and fabric detail.

**Guinevere** `rare / Medic / Light` - Queen and healer. Composed, kind,
auburn hair braided with gold thread; a slim gold circlet. Pale blue gown,
gold-embroidered mantle. Signature: hands raised at the lower edge cupping a
warm light. `#ffd977` glow rising across the chest.

**Mordred** `rare / Sniper / Shadow` - Traitor son. Young, hard-eyed, a cruel
resemblance to Arthur. Blackened mail, a dark surcoat with a broken crown
device. Signature: a dagger held low and reversed, catching a cold highlight.
`#a05cd8` shadow pooling under the jaw.

---

### Sherwood - Rob the rich, and outshoot the rest `#3f9b5c` / `#c8a34a`

**Guy of Gisborne** `epic / Bruiser / Shadow` - Ruthless hunter-knight. Cold
face, close beard, hair scraped back. Horsehide cloak over dark mail; a
knight's helm under one arm at the lower edge. Signature: the horsehide
hood's animal shape. `#a05cd8` shadow at his back. Epic: detailed hide and
mail.

**Robin Hood** `legendary / Sniper / Nature` - Outlaw archer. Confident half
smile, stubble, dark hair under a green hood with a single feather. Waxed
leather bracers, bowstring across the chest. Signature: the drawn longbow
limb crossing the upper frame, arrow nocked. `#5fd48a` leaf motes.
Legendary: crisp detail on bow, fletching and leather grain.

**Will Scarlet** `rare / Bruiser / Physical` - Reckless duellist. Young,
grinning, red-brown hair, a scar through one eyebrow. Scarlet doublet, open
collar. Signature: twin daggers crossed at the lower edge. Faint `#d8894f`
spark where the blades meet.

**Little John** `epic / Tank / Physical` - Giant of a man. Broad bearded
face, cheerful and immovable, filling the frame edge to edge. Rough green
wool, a wide leather belt. Signature: quarterstaff held vertically, and
shoulders that overflow the safe area's width. `#d8894f` dust. Epic: heavy
texture in wool and beard.

**Maid Marian** `common / Medic / Light` - Noblewoman turned outlaw.
Steady, intelligent eyes, dark hair loosely braided. Simple green riding
cloak over a plain linen dress. Signature: a small hunting horn at her
collar. Soft `#ffd977` glow. Common: unadorned, practical.

**Friar Tuck** `rare / Controller / Light` - Fighting monk. Round, ruddy,
laughing face, tonsured head. Brown habit, rope belt, a wooden cross.
Signature: a raised tankard at the lower edge. Warm `#ffd977` bloom.

---

### Grimmwood - Every tale in these woods has teeth `#4fa86a` / `#8a5ad8`

**Hansel & Gretel** `epic / Tank / Nature` - Two children, shoulder to
shoulder, sharing the frame - the only dual portrait in the game. Pale,
hollow-eyed, too calm. Ragged peasant clothes. Signature: Gretel holds a
guttering candle that lights both faces from below. `#5fd48a` will-o-wisp
motes. Epic: strong two-figure composition, unsettling.

**Rumpelstiltskin** `legendary / Controller / Magic` - Trickster imp. Wide
grin far too full of teeth, enormous ears, wild hair, eyes like coins.
Patchwork motley. Signature: gold thread spinning itself in the air around
his hands. `#9b7bff` glyphs among the thread. Legendary: dense detail,
maximum menace.

**Big Bad Wolf** `epic / Bruiser / Nature` - Anthropomorphic wolf. Massive
lupine head, yellow eyes, muzzle drawn back from wet teeth. Shredded remains
of a grandmother's shawl at the neck. Signature: the fanged muzzle. `#5fd48a`
breath fog. Epic: individual fur clumps, real weight.

**Snow White** `common / Medic / Nature` - Fairy-tale princess. Skin very
pale, hair black, lips dark red - the storybook triad, exactly. Simple blue
and yellow bodice, red hair ribbon. Signature: a single red apple held at the
lower edge. Faint `#5fd48a` leaf motes. Common: clean and simple.

**Red Riding Hood** `rare / Bruiser / Physical` - Hunter in a red hood. Young
but hard-faced, freckled, jaw set. Crimson hooded cloak over a woodsman's
coat. Signature: the hood's peak, plus a hatchet on the shoulder. `#d8894f`
sparks.

**Pied Piper** `rare / Controller / Magic` - Enchanter musician. Face half
shadowed by a tall feathered cap; a thin unreadable smile. Motley of green
and violet diamonds. Signature: the pipe raised to his lips. `#9b7bff` visible
notes drifting from it.

---

### Yamato - The rising sun knows no surrender `#e05a4a` / `#f0c05a`

**Minamoto no Yoshitsune** `rare / Bruiser / Physical` - Young warlord.
Fine-boned, fierce, hair in a tight topknot. Red-laced o-yoroi with gold
fittings. Signature: two swords crossed behind the shoulders. `#d8894f`
motion dust.

**Tomoe Gozen** `rare / Sniper / Physical` - Onna-musha archer. Composed,
beautiful, unflinching; long black hair bound high. Red and gold lamellar
over a dark kimono. Signature: a yumi's upper limb crossing the frame with a
nocked arrow. `#d8894f` glint.

**Benkei** `common / Tank / Physical` - Warrior monk. Huge, bearded, shaven
head, an immovable expression. Plain dark robes over simple armour, a monk's
hood at the neck. Signature: naginata haft held vertical. Minimal effects.
Common: no ornament at all - mass is the whole read.

**Abe no Seimei** `legendary / Controller / Magic` - Onmyoji. Serene, ageless
face, thin moustache, tall black eboshi cap. White silk kariginu with a
pentagram seal. Signature: paper shikigami folded like birds circling his
head. `#9b7bff` glyphs. Legendary: intricate silk pattern and many
shikigami.

**Momotaro** `epic / Tank / Physical` - Peach boy hero. Young, broad,
grinning with total confidence. Simple armour over a peach-pink haori,
hachimaki headband. Signature: a war banner over the shoulder, plus a pheasant
feather. `#d8894f` dust. Epic: banner detail and animal companions implied.

**Kaguya** `epic / Caster / Magic` - Moon princess. Ethereal, pale to the
point of translucency, impossibly long black hair drifting as if underwater.
Twelve-layered junihitoe in white and silver. Signature: a full moon disc
behind her head. `#9b7bff` motes rising. Epic: layered silk, weightless hair.

---

### Huaxia - Empires rise where the dragon sleeps `#b03a2e` / `#d9a521`

**Qin Shi Huang** `legendary / Caster / Magic` - First Emperor. Severe,
absolute, thin beard, eyes that do not move. Black and gold imperial robes,
a mianguan crown with hanging bead strings across the brow. Signature: the
bead curtain of the crown. `#9b7bff` glyphs forming a wall-like lattice
behind. Legendary: dense imperial ornament.

**Lu Bu** `rare / Bruiser / Physical` - Peerless warrior. Arrogant,
handsome, heavy brow. Red and gold scale armour, a headdress with long
pheasant tail feathers. Signature: the twin pheasant plumes. `#d8894f`
sparks.

**Zhuge Liang** `epic / Controller / Magic` - Master strategist. Calm,
thoughtful, long thin beard, a scholar's guan cap. Simple crane-white robe.
Signature: a feather fan raised at chest height. `#9b7bff` glyph motes. Epic:
fine embroidery and active magic.

**Guan Yu** `epic / Tank / Physical` - God of war. Iconic long black beard to
mid-chest, red-brown face, phoenix-eye brows. Green robe over gold scale.
Signature: the beard plus the crescent blade's edge at the frame's top.
`#d8894f` dust. Epic: heavy armour detail.

**Hua Tuo** `rare / Medic / Light` - Legendary physician. Kind, elderly,
white beard, small round spectacles. Plain grey scholar's robe, a satchel
strap. Signature: medicinal herbs held in one hand. `#ffd977` warm glow.

**Huang Zhong** `rare / Sniper / Physical` - Veteran archer. Old but iron-
hard, white beard, weathered squint. Practical scale armour, no ornament.
Signature: bow limb and a full quiver at the shoulder. `#d8894f` glint.

**Sun Wukong** `legendary / Bruiser / Physical` - Monkey King. Simian face,
golden fur, blazing gold eyes, wide irreverent grin. Gold circlet band on the
brow, red and gold armour, phoenix-feather cap. Signature: the circlet plus
the ruyi jingu bang staff. `#d8894f` motion blur streaks. Legendary: maximum
energy and detail.

**Nezha** `epic / Sniper / Fire` - Child deity. Young boy's face, ancient
eyes, hair in two buns. Red silk sash, gold armour. Signature: the flaming
Wind Fire Wheels beneath him, entering at the lower frame edge. `#ff7a4d`
flame. Epic: active fire effects.

**Mulan** `common / Sniper / Physical` - Woman warrior in disguise.
Determined, plain-featured, hair bound tight under a simple helm. Ordinary
soldier's scale armour, deliberately anonymous. Signature: a crossbow's stock
at the lower edge. Minimal `#d8894f`. Common: deliberately unremarkable gear.

---

### Roma - The eternal city demands victory `#7b4dc0` / `#d4af37`

**Julius Caesar** `epic / Bruiser / Physical` - Dictator. Aquiline nose,
receding hair under a gold laurel, calculating eyes. Bronze muscle cuirass,
tyrian purple cloak. Signature: the laurel crown. `#d8894f` dust. Epic:
detailed cuirass relief.

**Spartacus** `common / Tank / Physical` - Rebel gladiator. Scarred, bearded,
defiant; a slave brand at the shoulder. Battered gladiator armour, one bare
shoulder, a manica on the visible arm. Signature: the broken chain still on
his wrist. Minimal effects. Common: damaged, mismatched kit.

**Augustus** `rare / Medic / Light` - First Emperor of Rome. Young, cold,
idealised features. White toga with a purple stripe, a civic crown of oak
leaves. Signature: the oak crown. `#ffd977` glow.

**Cicero** `epic / Controller / Magic` - Orator. Middle-aged, sharp,
mid-speech with one hand raised. Plain white toga. Signature: a scroll in the
raised hand, words visible as `#9b7bff` glyphs leaving his mouth. Epic: the
magic is rhetoric made literal.

**Brutus** `rare / Sniper / Shadow` - Assassin senator. Conflicted, haunted,
short curls. White toga, half in shadow. Signature: a dagger concealed
against the chest, only the tip catching light. `#a05cd8` shadow swallowing
one side of the face.

**Constantine the Great** `legendary / Caster / Light` - Emperor convert.
Regal, bearded, diademed. Gold-scaled armour, purple imperial cloak.
Signature: a radiant chi-rho standard behind him. `#ffd977` rays. Legendary:
full imperial splendour.

---

### Takamagahara - The plain of high heaven keeps its own counsel `#e8e3d3` / `#c4392f`

**Amaterasu** `legendary / Caster / Light` - Sun goddess. Face almost too
bright to look at, serene, eyes closed or nearly. White and vermilion
shrine silks, gold ornaments. Signature: a solar corona filling the space
behind her, rendered as clean radiating spokes. `#ffd977` at maximum.
Legendary: the brightest portrait in the game.

**Tsukuyomi** `rare / Caster / Shadow` - Moon god. Cold, austere, pale;
silver hair. Black and white court robes. Signature: a bronze mirror held at
chest height reflecting nothing. `#a05cd8` shadow.

**Izanami** `common / Controller / Shadow` - Goddess of death. Beautiful and
decaying at once - one half of the face perfect, the other veiled in shadow.
Plain white burial silk. Signature: the veil. `#a05cd8` haze. Common: simple
garment, the horror does the work.

**Inari** `epic / Controller / Nature` - Fox deity. Androgynous, sly, a fox
mask pushed up onto the forehead revealing a knowing smile. White and
vermilion robes. Signature: multiple fox tails fanning behind. `#5fd48a`
motes. Epic: many distinct tails.

**Izanagi** `epic / Medic / Light` - Creator god. Noble, bearded, sorrowful.
White ceremonial robes. Signature: water streaming from his hands and
shoulders in a purification rite. `#ffd977` light through the water. Epic:
detailed water rendering.

**Susanoo** `rare / Tank / Lightning` - Storm god. Wild, grinning, unruly
black hair, a warrior's build. Half-armoured over a loose robe. Signature: a
trident, plus the coiled shape of Orochi implied in the shadow behind.
`#63d7ff` arcs.

---

### Duat - The scales do not blink `#c9a227` / `#1f4e79`

**Anubis** `legendary / Sniper / Shadow` - Jackal-headed god of the dead.
Black jackal head, tall alert ears, gold eyes. Gold and lapis collar, linen
wrap. Signature: the jackal head silhouette. `#a05cd8` shadow. Legendary:
lavish gold and lapis inlay.

**Horus** `rare / Sniper / Light` - Falcon-headed god. Falcon head, fierce
round eye, the Eye of Horus marking. Gold pectoral, blue and gold nemes.
Signature: the falcon head. `#ffd977` glow at the eye.

**Ma'at** `rare / Caster / Light` - Goddess of truth. Serene woman's face,
dark hair, a single tall ostrich feather upright on her headband. White
linen, gold collar. Signature: the feather. `#ffd977` glow, small balance
scales implied.

**Sekhmet** `epic / Caster / Fire` - Lioness of war. Lioness head, mane
picked out in gold, snarling. A solar disc with a cobra above her head.
Signature: the disc plus the mane. `#ff7a4d` heat shimmer. Epic: detailed
mane and active fire.

**Isis** `epic / Medic / Magic` - Goddess of magic and rebirth. Beautiful,
composed; a throne hieroglyph headdress. Signature: great feathered wings
spread behind her, entering from both sides. `#9b7bff` motes. Epic: detailed
feathering.

**Nephthys** `common / Medic / Shadow` - Goddess of mourning. Downcast eyes,
quiet grief. Simple dark linen, a modest gold collar. Signature: dark wings
folded close around the shoulders like a shawl. `#a05cd8` haze. Common:
restrained, minimal gold.
