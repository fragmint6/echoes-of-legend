# Character Art Specification

The authoritative brief for every legend card illustration in Echoes of
Legend. One entry per legend, written so any artist or generator produces a
piece that sits in the same world as the other 62.

Status: **v2.3 - full-ART environmental card illustrations**, dynamic
role-driven action compositions, expanded to 115 legends (2026-08-18,
rev 5).

> **2026-08-17, rev 6 (THE STYLE IS PIXEL ART - READ THIS BEFORE
> GENERATING).** A first pass at the Chapter II art was generated as
> smooth painted fantasy illustration, was wrong, and was reverted
> along with everything else in that pass. The finding is kept here
> because it is the single easiest way to get this job wrong.
>
> At a 512px upscale the shipped cards *look* painterly, so "detailed
> painted digital fantasy art" seems like the right prompt. It is not.
> Viewed at 6x NEAREST - roughly how the card actually renders - the
> shipped art has obvious chunky pixel structure: hard stair-stepped
> contours, flat fills, visible dithering. The softness in an upscale
> is a downscaling artefact, not the source style.
>
> The prompt block in section 3 already said all of this ("flat colour
> fills, hard blocky shading with 3-5 tones per material, deliberate
> dithering, crisp hard pixel edges, no anti-aliasing"). It was
> overridden on the strength of a bad visual check. **Use section 3
> verbatim.**
>
> Two further failure modes, both hit for real while correcting it:
> - Leaning hard on "16-bit / SNES / sprite" pulls the generator into a
>   tight bust close-up. Say THREE-QUARTER-LENGTH explicitly.
> - Over-correcting to "wide shot, zoomed out" produces a small distant
>   figure that reads as a game sprite, not a card. The target is a
>   large commanding figure at 60-70% of frame width with the
>   environment fully visible around it.
>
> DO NOT JUDGE THE RESULT BY EYE ON AN UPSCALE - that is what caused
> the failure. Measure it. Take the fraction of horizontally adjacent
> pixel pairs whose summed RGB delta is <= 6 ("flat") and > 30
> ("hard"):
>
> ```python
> a = np.asarray(Image.open(f).convert('RGB'), dtype=int)
> d = np.abs(a[:, 1:] - a[:, :-1]).sum(-1)
> flat, hard = (d <= 6).mean(), (d > 30).mean()
> ```
>
> The shipped roster runs **flat 0.11-0.26, hard 0.34-0.57**. Smooth
> painted art lands near flat 0.09 / hard 0.62 - too few flat runs, too
> many soft mid-tone transitions dressed up as edges.

> **2026-08-18, rev 8.** Empyrean renamed **Genesis** (files, palette row,
> environment row and briefs); **Adam** authored as its Tank, the role the
> faction shipped without. **Kaguya moved from Yamato to Kami** - she is a
> being on loan from the moon, not a member of a human war camp - and
> **Miyamoto Musashi** authored to take her slot in Yamato. Roster 113 ->
> 115. Both new portraits generated this pass; both were regenerated once
> after the first attempt came back landscape and too smoothly shaded to
> pass the flat/hard test in section 4b.
>
> **2026-08-18, rev 7.** Five factions renamed by owner ruling -
> Takamagahara -> **Kami**, Gehenna -> **Pandemonium**, Devaloka ->
> **Devas**, Jotunheim -> **Asgard**, Achaea -> **Hemithea**. Every colour
> row, environment row and per-legend brief below uses the new names, and
> the art files were renamed to match (`kami-amaterasu.png` etc). Hercules
> moved from Olympus to Hemithea and **Poseidon** was authored to replace
> him as Olympus' Tank - he is the first new brief since rev 5 and the only
> card whose art was generated in this pass. Roster 112 -> 113.
>
> **2026-08-17, rev 5 (CHAPTER II).** Seven factions and 49 legends
> added: Asgard, Hemithea, Pandemonium, Devas, Genesis, Transylvania
> and Tortuga. Palettes and environments (section 2) and briefs
> (section 5b) are written for all of them. **No art is generated yet** -
> every new card ships `art: null` and renders its RPG Awesome icon
> glyph, which is a supported state (see section 4b, "cards without
> `art` keep their icon glyph, so factions can land one at a time").
> Nothing in the game is broken while the art is outstanding.
>
> Two of the new factions are drawn from **public-domain literature
> rather than myth**, and that constrains the art as much as the naming
> did - see the Transylvania and Tortuga notes in section 5.

> **2026-08-05, rev 4 (SHIPPING FORMAT).** *Corrected 2026-08-17: this
> revision says 128 x 176 and so does every row of MANIFEST.csv, but
> every file actually on disk measures **64 x 88** and weighs ~10.7-14.1
> KB against the manifest's recorded ~47-51 KB. Match the FILES, not
> these numbers - the files are what the game loads.*
>
> What actually ships in the
> repo is NOT the 640 x 880 JPEG described below: each legend is a
> **lossless PNG at `assets/legends/<id>.png`**, downscaled
> from the full-art source with a lanczos filter, linear-light
> correction and a sharpen pass (15) - every file is tracked in
> `assets/legends/MANIFEST.csv` (id, size, bytes, filter, sharpen).
> Card data points at the PNG: `art: 'assets/legends/<id>.png'`. All
> composition, lighting and silhouette rules below still govern the
> source art; treat "save JPEG q85 to `<id>.jpg`" below as "generate
> the source, then produce the PNG game build". All 63 original
> legends have generated art present; the 49 Chapter II legends are
> icon-only.

> **2026-08-03, rev 2 (v2.1).** Static bust shots made every card read
> alike. Cards are now **full art**: each legend is caught mid-motion doing
> what their role does - tanks braced, bruisers mid-swing, casters
> unleashing, controllers weaving, medics blessing, snipers aiming.
> Weapons and element-coloured energy are **allowed on the figure** (they
> may never cross the face). The v2 rules below are updated accordingly:
> where they still say "bust / no weapons / no effects", v2.1 wins.
>
> **2026-08-03, v2.** Two retired approaches taught us what breaks:
>
> 1. *The old pipeline* (`art-src/` + nine `tools/*.py` scripts) resized
>    and quantised every portrait to 96-128px / 32 colours and visibly
>    corrupted the art. Removed.
> 2. *The chroma-key cut-out* that replaced it destroyed the fringe:
>    keying a generated flat field to transparency always leaves a ring
>    of key-coloured blend pixels at the contour, glaringly visible on
>    the card. Removed.
>
> **v2 ends both.** Card art is now a complete, fully opaque illustration:
> the legend painted with their faction's environment baked in behind them.
> There is nothing to cut out, mask or convert - the generated scene is
> centre-cropped to the card's portrait aspect and shipped as a JPEG at
> `assets/legends/<id>.jpg`. The sigil-ring mask in CSS is deleted; the
> image simply covers the card and the HUD scrims keep the text legible.

- **roster: 115 legends; art present for all 115** (the 49 Chapter II
  portraits were delivered by the owner 2026-08-17; Poseidon added 2026-08-18)
- Six new Grimmwood legends were added in rev 3: Gingerbread Man, Evil Queen,
  Puss in Boots, Rapunzel, Goldilocks and Cinderella.
- Rev 5 added seven Chapter II factions (49 legends), briefed but not yet
  illustrated.

**Known outstanding:** art for the 49 Chapter II legends (all seven new
factions). They are fully briefed in section 5b and carry `art: null`
until generated, which renders the icon glyph instead.

---

## 1. Hard constraints

These are not stylistic preferences. Break one and the art fails in the UI.

| Constraint | Value | Why |
| --- | --- | --- |
| Canvas | **640 x 880**, portrait (aspect 0.727) | The collection card renders at 250/385 (0.649) with `object-fit: cover`, the battle tile at 5/6 (0.833): a 0.727 source centre-crops cleanly to both. |
| Format | Source: **JPEG q85, opaque**. Shipping: **128 x 176 lossless PNG** at `assets/legends/<id>.png` (rev 4). | v2 art is a baked scene - there is no alpha to preserve. The game build is the PNG downscale tracked in `assets/legends/MANIFEST.csv`; that is what card `art:` references. |
| File size | **< 180 KB each** budget | The art downloads once per card viewed; keep the whole roster cheap. |
| Composition (v2.1) | Dynamic three-quarter-length action figure, dominating the **central 55-70%** of the source canvas width, may reach the lower edge | Static busts read uniform across 63 cards; the role's action is what makes each card distinct. |
| Head position (v2.1) | Face clearly readable in the **upper third** (~25% from top) | The card's name plate and ability overlay own the bottom; faces live where nothing covers them. |
| Environment | Full-scene backdrop, **darker, slightly desaturated, broader pixel clusters** than the character | The figure must read sharply in front; a backdrop that out-detail the legend fights the HUD. |
| Backdrop geometry | Horizon **no higher than mid-canvas**; no bright shapes directly behind the head; calm upper sky | Bright clutter behind the head destroys the face at thumbnail size. |
| Light source | Upper left, cool key / warm rim | Consistent lighting across the roster and the card substrates. |
| Silhouette | Character identifiable against their backdrop **as a black shape** | Still the primary readability test. See section 2. |
| Facing | 3/4 view toward the viewer's left, or straight on | Consistent lighting direction across the roster. |

### Do not include (v2.1)

- **Nothing across the face.** Weapons, hands, hair and energy arcs are
  all allowed now, but none of them may cross or cover the face, and
  nothing may hide the eyes.
- **No crowds or copies.** No second copy of the character, no
  reflection, twin, triptych, collage, and no crowd of similar figures.
- **No companion creatures or sidekicks.** Only the character appears.
- **No blood, gore or corpses** - even on the Blood Battlefield.
- Text, letters, numerals, signatures, watermarks
- Frames, borders, vignettes, drop shadows - the card chrome supplies all
  of these
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

**Rim light.** Every legend gets a **1-2px rim light** along the upper-left
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
| Physical | `#ff4d4d` |
| Magic | `#ff4dd5` |
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

Each legend's costume leans on the faction's primary and secondary. The
element colour arrives via rim light and effects, so a Fire legend in a green
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
| Kami | `#e8e3d3` | `#c4392f` | Bleached silk, shrine white, vermilion accents. Ethereal, remote. |
| Duat | `#c9a227` | `#1f4e79` | Gold leaf, lapis inlay, linen wrap. Solemn, funerary. |
| Asgard | `#7fb4d4` | `#3d5a80` | Frost-rimed iron, wolf pelt, blue-white glacier light. Fatalistic, vast. |
| Hemithea | `#d8b26a` | `#8c3b2e` | Sun-bleached bronze, oxblood cloak, salt-worn leather. Mortal, weathered. |
| Pandemonium | `#c2402a` | `#2b1418` | Scorched brass, charred silk, ember-lit obsidian. Opulent and ruined. |
| Devas | `#e8a33d` | `#7b3fa0` | Temple gold, saffron and violet silk, sandalwood ash. Radiant, ornate. |
| Genesis | `#f2e6c2` | `#c9a227` | Bleached ivory, worked gold, unblemished linen. Austere, absolute. |
| Transylvania | `#8e2f45` | `#241019` | Oxblood velvet, tarnished silver, damp stone. Gaslit, decaying. |
| Tortuga | `#2f6f6a` | `#1a2a33` | Salt-bleached canvas, verdigris brass, waterlogged oak. Weathered, piratical. |

---


### Faction environments (v2)

One shared backdrop per faction keeps each set reading as a team. The
environment is **scene, not spotlight**: darker, slightly desaturated and
rendered with broader pixel clusters than the legend in front of it.

| Faction | Environment |
| --- | --- |
| Camelot | Torchlit stone castle ramparts, hanging blue and gold banners, brooding overcast evening sky |
| Olympus | Sunlit marble temple colonnade, laurel groves, distant hazy aegean sea |
| Sherwood | Deep greenwood forest, ancient oaks, shafts of pale light through leaves |
| Grimmwood | Gnarled storybook forest in violet gloom, hanging moss, pale mushrooms, drifting mist |
| Yamato | War camp on a misty battlefield, tattered crimson banners, distant mountains |
| Huaxia | Palace battlements above drifting clouds, red and gold war banners, distant jade peaks |
| Roma | Roman forum at golden hour, marble columns, cypress trees, raised eagle standard |
| Kami | Sea of clouds high above the world, great vermilion torii gate, drifting shrine streamers, sunrise |
| Duat | Desert night, temple pylons and obelisks under a band of cold stars, drifting sand |
| Asgard | Frozen fjord under a low aurora, black glacial cliffs, the roots of a vast dead tree, drifting snow |
| Hemithea | Storm-grey Aegean coast, beached war galleys, distant burning citadel on the headland |
| Pandemonium | A burning valley at dusk, terraced ruins and slag, low ash cloud, embers rising from fissures |
| Devas | Cloud-wreathed temple terraces at dawn, carved gopuram towers, lotus pools, drifting incense |
| Genesis | A vault of pale cloud and light, colossal unadorned gold architecture, no horizon detail |
| Transylvania | Gaslit cobbled street below a mountain castle, wet stone, fog, a single lit window |
| Tortuga | Moonlit harbour, wrecked and anchored hulls, a swinging lantern on a dark quay, low sea mist |

---

## 3. Prompt template (v2)

For generated art, every legend uses this skeleton. Fill the bracketed slots
from that legend's entry in section 5 and the faction table above.

```
Pixel art full-art legend card of [NAME], [ONE-LINE IDENTITY].
A dramatic full-art composition caught mid-motion: the character
[ROLE ACTION - tank braced / bruiser mid-swing / caster unleashing /
controller weaving / medic blessing / sniper aiming]. Three-quarter-length
figure dominating the portrait frame, occupying the central 55-70 percent
of the canvas width, the face clearly readable in the upper third, about
25 percent from the top. Strong diagonal action lines, cinematic energy.
Light source upper left. Eyes clearly readable: distinct dark pupil,
visible iris colour, clean whites.
[COSTUME AND MATERIALS.]
[DEFINING FEATURE - a worn or physical detail. Never a held object.]
Costume palette drawn from [FACTION MATERIALS], built on [PRIMARY] and
[SECONDARY], with a crisp 1-2 pixel [ELEMENT COLOUR] rim light along the
upper-left contour of the body itself.
Behind the character is a full painted environment: [FACTION ENVIRONMENT].
The backdrop is rendered darker, slightly desaturated and with broader,
softer pixel clusters than the character. Horizon no higher than the
middle of the canvas, no bright shapes directly behind the head, calm
upper sky. One single portrait of this one character alone in the scene.
Beautifully detailed 16-bit pixel art card illustration at high
resolution: flat colour fills, hard blocky shading with 3-5 tones per
material, deliberate dithering, selective dark outline, crisp hard pixel
edges, no anti-aliasing, tiny 1px specular highlights. Fully OPAQUE,
filling the entire canvas edge to edge. Weapons and element-coloured
energy on the figure are allowed; nothing may cross the face. No
companion creatures, no blood or gore, no text, no frame, no watermark.
[RARITY DIRECTION.]
```

Generate at the generator's native landscape size; the centre crop to
640 x 880 happens afterwards and is the only geometric adjustment.

---

## 4. Acceptance checklist (v2)

1. **Silhouette test.** Fill the character 100% black against the baked
   backdrop. Still identifiable? Two legends envying each other's outline
   means one needs a distinguishing shape.
2. **Backdrop-behaviour test.** Squint: the backdrop must fall back
   (darker, softer, broader) and the legend must snap forward.
3. **Cover-crop test.** View the centre 65% vertical strip (the
   collection card) and the centre 83% (the battle tile): face, crown and
   shoulders intact in both, nothing essential clipped at the sides.
4. **HUD test.** Place the real card chrome over it: name plate, element
   orb, status chips and the ability overlay all still readable.
5. **Alignment test.** Place beside three other portraits from the same
   faction: same environment, eyelines within a few pixels, no legend
   visibly larger or smaller.
6. **File budget.** JPEG q85 at 640 x 880, under ~180 KB.
7. **Scene hygiene.** No weapons, no held objects, no duplicate figure,
   no text.

---

## 4b. Flow (v2)

| Step | Notes |
| --- | --- |
| Write the prompt | one entry per legend, section 5; house style lives in the shared blocks (sections 2-3) so a change propagates to all |
| Generate | any generator at native resolution, the full scene in one image |
| Crop and save | centre-crop to the card aspect, resize to exactly 640 x 880, save JPEG q85 as the source (rev 4: the shipped file is then the 128 x 176 lossless PNG downscale at `assets/legends/<id>.png`, recorded in MANIFEST.csv). No keying, no masking, no palette work |
| Wire up | `art: 'assets/legends/<id>.png'` on the card (rev 4); cards without `art` keep their icon glyph, so factions can land one at a time |

The menu parallax layers in `assets/menu/` are the one place keying
survives: they still stack as transparent silhouettes (border flood fill
plus a magenta-hue sweep and a 2px matte erosion), because an opaque
layer would hide the ones beneath it. See `docs/BATTLEFIELD-ART-SPEC.md`
section 7.

---

## 4c. How the art is framed on the card (v2)

**Collection card.** The card is 250/385 (0.649) and draws the 640 x 880
illustration with `object-fit: cover` centred, so it samples the middle
~89% of the image's width - the environment keeps a visible margin left
and right of the bust. Hover applies a gentle `scale(1.045)`; there is no
mask to disturb. The sigil ring is suppressed on art cards and the
substrate gradient sits hidden behind the opaque image.

**Battle card.** The 5/6 tile `cover`-crops roughly the middle 83% of the
same file; status chips float top-left over the backdrop, the foot scrim
and name plate own the bottom, and the face sits clear in the upper
third. Hover scales 1.05.

**Why the masked sigil-ring composition was deleted:** it existed to hide
the edges of a cut-out. Once the illustration bakes its own backdrop, a
mask only cuts holes in the scenery.
## 5. Per-legend briefs

Format: **Name** `rarity / role / element` - identity, costume, defining
feature.

The "defining feature" is always something **worn or physical**: headgear,
hair, a facial feature, a collar, armour. Where an older draft named a held
object (Excalibur, a lyre, a quarterstaff) it has been replaced by the
equivalent worn detail.

> An earlier revision claimed `tools/art_prompts.py` was "the
> machine-readable source of truth and is checked against the live
> roster". **That file does not exist and no such check runs.** THIS
> DOCUMENT is the source of truth; the roster is the thing it must
> agree with. If a brief's `rarity / role / element` drifts from the
> card, the art gets made at the wrong rarity tier with the wrong
> rim-light colour - so the tags below were generated from the live
> card data rather than typed by hand.

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

**Poseidon** `epic / Tank / Magic`
Sea god, and the faction's wall. Powerfully built, mature, heavy grey-white
storm-tossed beard and wet hair, weathered sun-darkened skin, pale sea-green
eyes. Deep-sea bronze cuirass crusted with verdigris and barnacle; aegean
blue-green cloth over one shoulder in heavy folds; a dull coral and pale gold
circlet. Braced immovably, trident angled steeply across the frame.
Signature: dried salt rime and pale barnacle crust caked along the forearms
and cuirass rim - he has just risen out of the water. Violet-blue `#6fd3e8`
rim light. Epic: rich material detail, restrained energy.
*(Added 2026-08-18 with the card, which replaced Hercules as Olympus' Tank.)*

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

**Gingerbread Man** `common / Tank / Physical` - Living gingerbread guardian.
Baked gingerbread body with white icing piping, gumdrop buttons and a clean
cookie silhouette. Signature: the icing trim reads as simple cookie armour;
small `#d8894f` dust motes. Common: plain baked materials, no ornament.

**Evil Queen** `legendary / Caster / Shadow` - Regal fairy-tale queen. Pale,
severe face, black pointed crown, high collar and black-violet brocade gown.
Signature: the crown and violet mirror-like facets orbiting her spellwork;
`#a05cd8` shadow ribbons. Legendary: maximum worked fabric and crown detail.

**Puss in Boots** `rare / Sniper / Nature` - Anthropomorphic cat marksman.
Dark fur, wide-brimmed feathered hat, green-violet coat, leather belt and tall
boots. Signature: the hat-and-boots silhouette; one compact crossbow low at
the edge. `#5fd48a` Nature rim light. Rare: one distinctive costume feature.

**Rapunzel** `epic / Caster / Magic` - Tower princess with living golden hair.
Violet and damp-green storybook gown, tower collar and an impossibly long
braid sweeping through the scene. Signature: the hair is part of her body and
silhouette, never a companion. `#9b7bff` motes along the braid. Epic: layered
fabric and rich braid detail.

**Goldilocks** `rare / Sniper / Nature` - Adult golden-curled wanderer.
Ochre dress, moss-green cloak and a small bear-claw motif stitched at the
collar; no bear or animal companion. Signature: three distinct golden curls;
`#5fd48a` leaf motes. Rare: practical fairy-tale travel wear.

**Cinderella** `rare / Medic / Light` - Woodland healer in a transformed gown.
Pale blue and silver dress, repaired storybook seams and a glass-like silver
shoe at the lower edge. Signature: the silver shoe and cool blue silhouette;
`#ffd977` light cupped low in her hands. Rare: one elegant costume feature.

**Rev 3 prompt rule.** These six additions use the shared Section 3 prompt
skeleton unchanged. Replace only `[NAME]`, `[ONE-LINE IDENTITY]`, the role
action, costume/materials, defining feature, element colour, faction palette,
environment and rarity direction from the entries above. Do not substitute a
meta-style instruction for the shared rendering block.

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

**Momotaro** `epic / Tank / Physical` - Peach boy legend. Young, broad,
grinning with total confidence. Simple armour over a peach-pink haori,
hachimaki headband. Signature: a war banner over the shoulder, plus a pheasant
feather. `#d8894f` dust. Epic: banner detail and animal companions implied.

**Miyamoto Musashi** `epic / Sniper / Physical` - The two-sword duellist,
*(added 2026-08-18 when Kaguya moved to Kami)*. Lean weathered ronin in his
thirties, unkempt shoulder-length black hair tied roughly back, stubbled jaw,
a hard flat stare. Travel-worn dark indigo kimono with the sleeves pushed
back, faded persimmon sash, and pointedly **no armour** - cloth where every
other Yamato legend wears iron. Both blades drawn: the katana low and level,
the wakizashi raised at the shoulder. Signature: the two-sword guard held in
complete stillness, the instant before the cut. Steel-white rim. Epic: worn
cloth folds and rope-wrapped hilts.

---

### Huaxia - Empires rise where the dragon sleeps `#b03a2e` / `#d9a521`

**Qin Shi Huang** `epic / Caster / Magic` - First Emperor. Severe,
absolute, thin beard, eyes that do not move. Black and gold imperial robes,
a mianguan crown with hanging bead strings across the brow. Signature: the
bead curtain of the crown. `#9b7bff` glyphs forming a wall-like lattice
behind. Epic: dense imperial ornament.

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

### Kami - The plain of high heaven keeps its own counsel `#e8e3d3` / `#c4392f`

**Kaguya** `epic / Caster / Magic` - Moon princess *(moved here from Yamato
2026-08-18; brief and shipped art unchanged, filename now
`kami-kaguya.png`)*. Ethereal, pale to the point of translucency, impossibly
long black hair drifting as if underwater. Twelve-layered junihitoe in white
and silver. Signature: a full moon disc behind her head. `#9b7bff` motes
rising. Epic: layered silk, weightless hair.

*Environment note: her shipped portrait carries Yamato's misty war camp, not
Kami's sea of clouds and vermilion torii. Section 4 test 5 (alignment) fails
for this one card against its new faction - same situation as Hercules in
Hemithea. Left deliberately; flagged for the next art pass.*

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

---

## 5b. Chapter II briefs (rev 5 - art outstanding)

Same format and same hard constraints as section 5. These 49 legends are
briefed but **not yet generated**; each ships `art: null` and renders its
icon glyph until the art lands.

Two standing notes that apply to every brief below:

- **The defining feature is worn or physical, never a held object.** A
  pirate's cutlass, an angel's sword and a god's thunderbolt may all
  appear on the figure under the v2.1 rules, but the *signature* line
  names something that survives the silhouette test on its own.
- **Two factions are literary, not mythological.** Transylvania is drawn
  from novels published 1818-1897 and Tortuga from real 18th-century
  people and sailors' folklore. The art must follow the same rule the
  card names did: **Shelley's creature, not Universal's** - articulate,
  gaunt, stitched, no flat head and no neck bolts - and **the folkloric
  drowned-sailor Davy Jones, not Disney's** - no tentacle face. Those
  designs are protected; the source texts are not.

### Asgard - The wolf is loose, and we are glad `#7fb4d4` / `#3d5a80`

**Odin** `legendary / Caster / Lightning` - The one-eyed Allfather,
unleashing. Gaunt weathered face, iron-grey beard in frost-stiff braids,
a plain leather patch over the right socket and a pale unblinking left
eye. Wide-brimmed traveller's hat shadowing the brow, wolf-pelt mantle
over frost-rimed ringmail, a raven-feather collar. Signature: the eye
patch and hat brim together - the silhouette must read as one-eyed
wanderer, not king. `#63d7ff` arcs crawling across the pelt. Legendary:
deep layered furs, worked silver knotwork, an unmistakable outline.

**Thor** `epic / Bruiser / Lightning` - Red-bearded thunder, mid-swing.
Broad open face, wind-burnt cheeks, plaited copper-red beard. Iron-banded
leather over bare arms, a heavy studded belt. Signature: the belt and the
braided beard. `#63d7ff` sheeting off his shoulders as the hammer comes
round. Epic: worked iron bands, thick braid detail.

**Fenrir** `epic / Bruiser / Physical` - The bound wolf straining. A
towering wolf-headed figure, jaws parted, ears flat. The ribbon Gleipnir
- deceptively thin, silk-fine, glowing faintly - wound at the throat and
forelimbs, biting into the fur. Signature: the thin bright binding
against the mass of dark pelt. `#ff4d4d` rim. Epic: individually shaped
fur clusters, the binding rendered as a single clean line.

**Hel** `epic / Controller / Shadow` - Half-living queen of the quiet
dead. One side of the face is a composed young woman, the other is
blue-black and hollowed; she is entirely at ease with it. High collar of
raven feathers, grave-linen and dark furs. Signature: the vertical divide
of the face, absolutely clean down the centre. `#a05cd8` haze pooling at
the dead side. Epic: heavy fur and feather work.

**Loki** `rare / Controller / Shadow` - The bound trickster, unrepentant.
Sharp narrow face, half a grin, green eyes too bright. Scarred lips.
Ragged finery, a knotted serpent-scale collar. Signature: the stitched
scarring at the mouth. `#a05cd8` haze. Rare: one distinctive feature -
the scarred grin.

**Freyja** `rare / Medic / Light` - She takes first pick of the slain.
Calm, unhurried, pale hair loose over a falcon-feather cloak clasped at
the throat. Amber and gold torc. Signature: the falcon-feather cloak
gathered at the shoulders. `#ffd977` bloom. Rare: the cloak is the one
elaborate thing.

**Heimdall** `rare / Tank / Light` - The watchman, braced. Wide-eyed
alertness, close-cropped pale beard, gold-flecked irises. Frost-rimed
scale over a heavy blue cloak, a horn slung at the hip. Signature: the
gold teeth and the unblinking stare. `#ffd977` rim. Rare: the cloak clasp
is the one worked detail.

### Hemithea - Mortals, and worth more for it `#d8b26a` / `#8c3b2e`

**Hercules** `epic / Tank / Physical` - *(moved here from Olympus
2026-08-18; the brief and the shipped art are unchanged, only the faction
and the filename - `hemithea-hercules.png`. He is a mortal who earned his
myth, which is this faction's whole thesis.)* Strongman demigod. Enormous
shoulders and neck, jaw set, short dark curls and a beard. Wears the Nemean
lion pelt as a hood, the beast's upper jaw over his brow and paws knotted at
his chest. Bare, scarred torso. Signature: the lion hood - the silhouette
must read as man-inside-lion. Dusty `#d8894f` impact motes near the
shoulders. Epic: heavy detail in the pelt fur and scarring.

**Note on environment.** His shipped portrait carries the *Olympus* backdrop
(marble colonnade, aegean sea), not Hemithea's storm-grey coast with beached
galleys. Section 4 test 5 (alignment) therefore fails for this one card
against its new faction. Left as-is deliberately: regenerating a shipped
portrait to fix a backdrop is a bigger change than the move, and the two
environments are close enough that it reads as the same sea. Flagged so the
next art pass can decide.

**Achilles** `legendary / Bruiser / Physical` - The short loud life,
mid-lunge. Young, beautiful, furious; dark curls bound with a leather
cord. Bronze cuirass moulded to the torso, oxblood cloak snapping behind,
greaves. Signature: the exposed unarmoured right heel, deliberately
visible at the lower edge of the frame. `#ff4d4d` rim. Legendary: the
finest worked bronze in the faction, layered and battle-scored.

**Odysseus** `epic / Controller / Physical` - Thinking three moves ahead.
Older, salt-weathered, a close beard going grey; the only calm face on
the field. Plain travelling leathers over a sailor's tunic, a conical
felt cap. Signature: the felt cap - the one man on the beach not wearing
a helm. `#ff4d4d` rim. Epic: worn detail everywhere, nothing new.

**Perseus** `epic / Sniper / Light` - The boy who came back. Lean, young,
level-eyed. Winged sandals, a curved harpe blade at the hip, a satchel
whose mouth is deliberately dark and closed. Signature: the small
feathered wings at the ankles. `#ffd977` rim. Epic: fine feather and
strap work.

**Medea** `epic / Medic / Shadow` - The herb that undoes death. Dark
intent eyes, black hair bound back severely, a colchian robe of deep
green and gold. Signature: a collar of small stoppered vials, each catching
a different light. `#a05cd8` haze at the fingertips. Epic: many
individually shaped vials.

**Atalanta** `rare / Sniper / Nature` - First spear into the boar. Lean
runner's build, hair cropped short and practical, a single boar-tusk
ornament at the throat. Hide hunting gear. Signature: the boar tusk.
`#5fd48a` rim. Rare: the tusk is the one distinguishing feature.

**Ajax** `rare / Tank / Physical` - Standing where the arrows are. Huge,
slow-blinking, plainly built. The famous sevenfold shield strapped at the
forearm, its seven oxhide layers visible in cross-section at the rim.
Signature: the layered shield edge. `#ff4d4d` rim. Rare: the shield is
the whole costume.

**Jason** `rare / Medic / Nature` - The captain, not the voyage. Open,
tired, a leader's face. Sea-stained cloak, a rope-worked belt. Signature:
a length of the Argo's own rigging worn coiled across the chest.
`#5fd48a` rim. Rare: the coiled rigging.

### Pandemonium - Everything you want, and the bill `#c2402a` / `#2b1418`

**Pride** `legendary / Caster / Light` - The first refusal. Beautiful,
cold, chin lifted; the only clean thing in the valley. Immaculate white
and gold, unburnt. Signature: a crown of thorned gold grown into the brow
- worn, not placed. `#ffd977` rim. Legendary: flawless tailoring amid
ruin, the most elaborate costume in the faction.

**Wrath** `epic / Bruiser / Fire` - Past the point words matter.
Blood-flushed face, teeth bared, eyes bloodshot. Armour half-shed and
hanging - he has been discarding it as he goes. Signature: the shed
straps and dangling plates. `#ff7a4d` heat shimmer. Epic: detailed
ruined armour.

**Envy** `epic / Caster / Shadow` - Never quite anyone. A face that seems
borrowed, features slightly mismatched, eyes fixed off-frame at someone
else. Clothing that apes finery without fitting. Signature: the
ill-fitting stolen finery. `#a05cd8` haze. Epic: rich fabrics, badly
worn.

**Greed** `epic / Controller / Magic` - He does not spend. Narrow, dry,
long-fingered; a miser's stoop. Coin-scale mail - actual coins pierced
and sewn into overlapping rows. Signature: the coin mail. `#ff4dd5` rim.
Epic: hundreds of individually shaped coins.

**Gluttony** `rare / Bruiser / Physical` - Feeding himself first.
Enormous, soft-faced, mid-chew and unembarrassed. A bib-like leather
apron, greasy. Signature: the apron. `#ff4d4d` rim. Rare: one feature,
plainly rendered.

**Sloth** `rare / Tank / Shadow` - Unhurried in a frightening way.
Half-lidded eyes, utterly still, seated even in motion. Heavy layered
robes gone to dust, cobwebbed at the shoulders. Signature: the cobwebs
- nothing has moved here in a long time. `#a05cd8` haze. Rare: the
webbing is the one detail.

**Lust** `rare / Controller / Magic` - The wanting of being wanted.
Beautiful and entirely aware of it, head turned toward the viewer.
Draped silks in ember tones. Signature: a fine chain worn at the throat
and wrists, slack, clearly ornamental. `#ff4dd5` rim. Rare: the chain.

### Devas - The wheel turns, and the gods turn with it `#e8a33d` / `#7b3fa0`

**Shiva** `legendary / Bruiser / Shadow` - The dance that keeps time.
Ash-pale skin, matted ascetic's hair piled and bound, a crescent moon at
the crown, third eye closed on the brow. Tiger-skin at the waist, serpent
at the throat, rudraksha beads. Signature: the closed third eye and the
crescent. `#a05cd8` rim. Legendary: maximum ornament - beads, ash, coiled
serpent, worked gold.

**Vishnu** `epic / Medic / Light` - Patient across ten lives. Serene
blue-skinned face, calm to the point of stillness. Yellow silk, a tall
jewelled crown, a garland of forest flowers. Signature: the tall crown.
`#ffd977` bloom. Epic: intricate crown and garland work.

**Kali** `epic / Caster / Shadow` - When protecting stops being polite.
Black-skinned, wide-eyed, tongue out - not comic, appalling. Wild
unbound hair. Signature: the garland of small skulls at the throat, each
distinctly shaped. `#a05cd8` haze. Epic: many individual skulls.

**Durga** `epic / Tank / Fire` - The line holds. Composed, many-armed
implied by layered shoulder-plates rather than literal duplication -
**no second copy of the figure**. Crimson and gold silk over scale.
Signature: the tiered shoulder-plates reading as a fan of arms in
silhouette. `#ff7a4d` rim. Epic: heavy layered goldwork.

**Ganesha** `rare / Medic / Nature` - Moving what is in the way.
Elephant-headed, one tusk broken short, small kind eyes. Saffron silk, a
snake worn as a belt. Signature: the broken tusk. `#5fd48a` rim. Rare:
the tusk is the distinguishing feature.

**Hanuman** `rare / Bruiser / Physical` - Over the top of the problem.
Monkey-featured, bright-eyed, mid-leap with the frame low. Simple
loincloth, a heavy gold armlet. Signature: the armlet and the long tail
curling out of frame. `#ff4d4d` rim. Rare: the armlet.

**Indra** `rare / Sniper / Lightning` - The thunderbolt, thrown at what
was singled out. Regal, slightly imperious, a short curled beard. Gold
scale over storm-blue silk. Signature: a diadem of small gold spikes.
`#63d7ff` arcs. Rare: the diadem.

### Genesis - The sentence was passed before you arrived `#f2e6c2` / `#c9a227`

**Adam** `epic / Tank / Nature` - The first man, standing as a wall *(added
2026-08-18 with the rebrand)*. Powerfully built, dark-haired, bearded,
ageless rather than old, deeply weathered sun-browned skin and sorrowful
steady eyes. **No armour and no crown** - an undyed roughspun wrap knotted at
the waist, coarse linen over one shoulder, a plain rope belt, in a faction
where everyone else wears worked gold. Braced immovably, one forearm raised
across the body as a guard. Signature: dry cracked earth and pale clay dust
caked over his hands, forearms and shoulders, as though he were shaped from
dirt and never quite finished drying. Leaf-green rim. Epic: the dust and the
cloth, rendered heavier than the gold behind him.

**Lucifer** `legendary / Caster / Fire` - The brightest, mid-fall.
Beautiful, composed, entirely unrepentant; the face of someone who lost
an argument and still believes he was right. White and gold vestments
scorching at the hem, wings still white at the shoulder and charring
toward the tips. Signature: the wings caught mid-transition, clean at the
root and burnt at the edge. `#ff7a4d` rim. Legendary: the most elaborate
costume in the faction, ruined at the edges.

**Michael** `epic / Bruiser / Light` - Sent when the discussion is over.
Severe, unlined, absolutely certain. Plain gold-chased plate, no
ornament beyond function. Signature: the plain unadorned helm-halo, a
thin ring of beaten gold. `#ffd977` rim. Epic: finely worked but
deliberately austere plate.

**Azrael** `epic / Sniper / Shadow` - Names the hour and waits. Hooded,
face mostly shadow, only a level gaze visible. Dark layered robes, a
scribe's cord at the waist. Signature: the deep hood with the single
readable line of the eyes. `#a05cd8` haze. Epic: heavy layered fabric.

**Gabriel** `epic / Caster / Light` - The voice that tells you.
Youthful, open-mouthed mid-announcement, head slightly raised. White and
gold, a horn slung at the back. Signature: the raised chin and the horn's
curve behind the shoulder. `#ffd977` bloom. Epic: rich vestment detail.

**Raphael** `rare / Medic / Nature` - Walked a boy across a country under
a false name. Warm, unremarkable, travel-worn - deliberately the least
angelic of the seven. Pilgrim's cloak over plain robes. Signature: the
traveller's staff-strap worn across the chest. `#5fd48a` rim. Rare: the
strap.

**Uriel** `rare / Caster / Fire` - The flame at the gate. Stern, dark,
eyes reflecting fire. Simple robes, a scorched hem. Signature: a band of
small flames burning steadily at the crown, worn like a circlet.
`#ff7a4d` rim. Rare: the flame circlet.

**Metatron** `rare / Controller / Magic` - Keeps the record, decides what
it says. Ageless, ink-stained fingers, spectacles of thin gold wire.
Scribal robes covered in fine written script. Signature: the wire
spectacles. `#ff4dd5` rim. Rare: the spectacles.

### Transylvania - What is taken is never given back `#8e2f45` / `#241019`

> **Public domain only.** Every figure here is from a novel published
> 1818-1897. Do not reference the Universal Pictures designs - no
> flat-topped green monster, no neck bolts, no wolf-man, no bandaged
> mummy. Those are protected studio designs; Shelley, Stoker, Stevenson,
> Wells, Le Fanu and Wilde are not.

**Dracula** `legendary / Caster / Shadow` - Old, courteous, uninterested
in consent. Aristocratic, high forehead, white hair swept back, heavy
brows, thin cruel mouth. Black evening dress under an oxblood-lined
cloak, high collar. Signature: the standing collar framing the head.
`#a05cd8` haze. Legendary: immaculate period tailoring, the richest
costume in the faction.

**Frankenstein's Monster** `epic / Tank / Physical` - Articulate, grieving,
enormous. **Shelley's creature:** yellowed translucent skin over visible
musculature, lank black hair, watery pale eyes, lips thin and dark - a
tall gaunt figure, not a square-headed brute. Ill-fitting stolen clothes,
too small at the wrists. Signature: the black surgical sutures at the
throat and wrists. `#ff4d4d` rim. Epic: detailed suturing and layered
mismatched cloth.

**Carmilla** `epic / Controller / Shadow` - Arrives as a guest. Young,
languid, genuinely affectionate; heavy-lidded green eyes. Ivory
nightgown and a dark travelling cloak. Signature: the loose unbound hair
falling forward over one shoulder. `#a05cd8` haze. Epic: fine lace and
period fabric detail.

**Mr. Hyde** `epic / Bruiser / Physical` - What was already in the house.
Smaller than expected, hunched, wrong in a way nobody can name; a
delighted grin. Jekyll's good clothes hanging far too large on him.
Signature: the oversized ill-fitting coat and cuffs. `#ff4d4d` rim.
Epic: rich tailoring worn badly.

**Van Helsing** `rare / Sniper / Light` - An old academic with tools.
Elderly, spectacled, entirely unimpressed. Heavy travelling coat.
Signature: a bandolier of small implements worn across the chest - no
single one identifiable. `#ffd977` rim. Rare: the bandolier.

**The Invisible Man** `rare / Sniper / Magic` - Cannot be looked at.
Head entirely wound in bandages, dark round goggles, a scarf; the face
is a construction, not a face. Long overcoat, collar up. Signature: the
goggles over bandages. `#ff4dd5` rim. Rare: the wrapping is the whole
design. **Exception to the face rule:** the goggles ARE his readable
"eyes" - keep them large, clean and catching light.

**Dorian Gray** `rare / Tank / Magic` - Immaculate, running out of
canvas. Flawless young face, bored, beautiful. Perfect evening dress, a
buttonhole flower. Signature: the buttonhole - the only spot of living
colour on him. `#ff4dd5` rim. Rare: the flower.

### Tortuga - Take what you can. Give nothing back `#2f6f6a` / `#1a2a33`

> **Real people and folklore, not the films.** Blackbeard, Anne Bonny,
> Calico Jack and Captain Kidd are historical. Davy Jones, the Kraken and
> the Flying Dutchman are 18th-century sailors' folklore. Do not
> reference the Disney designs - **Davy Jones has a human face, no
> tentacles.**

**Blackbeard** `legendary / Caster / Fire` - Reputation did the work.
Enormous black beard braided and tied with ribbon, slow-burning cannon
fuse woven into it and lit, smoke wreathing his head. Wide hat, heavy
coat, crossed bandoliers. Signature: the lit fuses in the beard.
`#ff7a4d` embers. Legendary: the most elaborate silhouette in the
faction - hat, beard, smoke and bandoliers together.

**Davy Jones** `epic / Controller / Shadow` - Not a captain, the place
captains end up. A drowned man's face - **human**, bloated, grey-green,
patient. Waterlogged naval coat, barnacle crust at the shoulders,
seaweed. Signature: the barnacle crust. `#a05cd8` haze. Epic: detailed
encrustation and rotted braid.

**The Kraken** `epic / Tank / Nature` - Comes up under the keel. A
towering mass rising from the water, one great eye readable in the upper
third of the frame where a face would be. Suckered limbs breaking the
surface at the lower edge. Signature: the single enormous eye.
`#5fd48a` rim. Epic: detailed sucker and skin texture. **Composition
note:** the eye takes the "face" position; everything else falls away
into the water.

**Anne Bonny** `epic / Bruiser / Physical` - Still standing when the crew
went below. Red hair loose, jaw set, sunburnt. Man's coat cut down and
belted, open shirt. Signature: the cut-down coat, plainly re-tailored.
`#ff4d4d` rim. Epic: worked buttons and layered stolen cloth.

**Captain Kidd** `rare / Sniper / Physical` - A privateer hanged as a
pirate. Respectable, greying, faintly aggrieved - he still thinks the
commission was valid. Sober merchant's coat. Signature: a rolled chart
tucked permanently under the arm. `#ff4d4d` rim. Rare: the chart.

**Calico Jack** `rare / Controller / Physical` - Remembered for the flag.
Loose calico shirt in bright striped cotton - the reason for the name.
Signature: the striped calico. `#ff4d4d` rim. Rare: the shirt is the
whole costume.

**The Flying Dutchman** `rare / Caster / Shadow` - Condemned to sail.
A captain's figure half-transparent at the edges, sea-rotted uniform,
hollow eyes with a distant light in them. Signature: the dissolving
contour - solid at the head, fraying to spray at the shoulders.
`#a05cd8` haze. Rare: the fraying silhouette. **Exception to the opacity
rule:** the FIGURE fades, the canvas does not - the backdrop behind him
is fully painted and opaque.
