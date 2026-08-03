# Battlefield Background Art Specification

Pixel-art backdrops for the ten battlefields. Companion to
`docs/ART-SPEC.md`, which governs character portraits; the two must read as
one game, so the shared rules there apply here unless overridden below.

Status: **all 10 regenerated at native resolution** (2026-08-03 refresh).

> **2026-08-03 refresh.** The board pipeline (`art-src/boards/` ->
> `process_boards.py` -> `verify_boards.py` -> `wire_boards.py`) was
> removed along with the rest of the art tooling because its
> resize-plus-quantise step visibly corrupted the scenes. Boards are now
> generated at native resolution straight from the briefs in section 4-5
> and written to `assets/boards/<id>.png` as opaque PNGs. The board layer
> uses `background-size: cover`, so any landscape aspect close to 1.80
> fits; the composition rules below (quiet centre, dark value ceiling,
> margin detail, no figures) are what actually gate shipping now. The
> retired mechanical caps (512 x 284, 24 colours, 72 KB) are kept for
> context but no longer enforced.

---

## 1. Hard constraints

| Constraint | Value | Why |
| --- | --- | --- |
| Canvas | **512 x 284** | The board measures 1688 x 934 CSS px on a 1080p desktop. 512 wide upscales x3.30 with `pixelated`. |
| Pixel scale | ~2.1x the character pixel | Portraits are 96px art in a 154px slot (x1.60). A coarser background pixel makes the backdrop *recede* behind the cards instead of competing with them. Measured, not guessed. |
| Format | JPEG q85, opaque (v2) | No transparency: this is the bottom layer, so no PNG is worth paying for. |
| Palette | **24 colours max** | Tighter than the 32 allowed for characters. A background must never out-detail a hero. |
| Anti-aliasing | **None** | `image-rendering: pixelated` is set on the layer; soft edges fight it. |
| File size | **< 72 KB each** | Measured, not assumed. At 512x284 the cost is *detail*, not palette: dropping the colosseum from 24 to 14 colours only moved it 61 KB -> 47 KB, which is not worth the quality. Ten fields stay under ~700 KB total. |
| Aspect | 1.80 (matches the board) | Phones render the board portrait (0.51), so the image is `cover`-cropped from the centre - keep the composition centre-safe. |

### Composition rules

These exist because **cards sit on top**. The art is scenery, not a poster.

1. **Keep the centre band quiet.** Cards occupy roughly the middle 80% of
   the board in two columns. Detail belongs at the top edge, the bottom
   edge, and the far left/right margins.
2. **No large bright shapes in the middle third.** They fight the cards
   and wreck text legibility.
3. **Value range: dark.** Nothing above ~55% luminance except a single
   deliberate light source. The board already applies a vignette and a
   dark floor glow, and the cards need to be the brightest thing present.
4. **Horizon around 45-55%** where a horizon makes sense, so the two card
   rows sit against different bands.
5. **Left-right symmetry of *mass*,** not of detail. The two teams face
   each other, so neither side may look more important.
6. **No characters, creatures or figures.** Places only.
7. **No text, no UI, no framing devices, no vignette** - the board draws
   its own.

---

## 2. Shared visual language

Same rendering discipline as the portraits: flat colour fills, deliberate
blocky shading, hard shadow terminators, selective 1px highlights. No
gradients that ramp smoothly across large areas; use dithering or banded
steps instead, which is what reads as "pixel art" rather than "small
photo".

**Depth by value, not by blur.** Three planes:

| Plane | Treatment |
| --- | --- |
| Far | Lowest contrast, closest to the field's atmosphere colour |
| Mid | The signature landform or structure - the thing you recognise |
| Near | Darkest, highest contrast, usually a floor or foreground lip at the bottom edge |

**Every field owns one light source** in its glow colour, placed off-centre
or high, never behind the cards.

---

## 3. The existing effect layers stay

`index.html` already stacks the scene as:

```
.sc-fx1   pattern / substrate     <- the new art goes here
.sc-grade per-field gradient
.sc-fx2   secondary detail
.sc-emblem signature object
.sc-particles  animated motes     <- kept
.sc-haze  centre glow + vignette  <- kept
```

The art is added as a new **`.sc-art`** layer *below* everything. Particles
and the haze vignette continue to run on top, so the board keeps its life.

Where a field has art, the procedural pattern layers (`.sc-fx1`,
`.sc-grade`, `.sc-fx2`) are hidden: the Narrow Pass was rendering its CSS
chevron stripes straight over the painted canyon walls. `.sc-haze` is a
special case - most fields use it as the centre glow, but a couple hang a
second wall pattern on it, so it is reset to glow-and-vignette only.

Fields without art keep every one of those layers, so the board set can be
illustrated a few at a time.

**Two implementation notes worth keeping:**

- The image URL is set inline by `js/battle.js` from the field's `art` key,
  resolved with `new URL(art, document.baseURI)`. A bare relative `url()`
  inside a custom property resolves against **the stylesheet**, which
  turned every path into `/css/assets/...` and 404'd on all ten fields.
- Low-graphics mode **keeps** the backdrop. It is one static image with no
  per-frame cost and it is the main thing making the board feel like a
  place; only its fade transition is dropped.

---

## 4. Per-field briefs

Format: **Name** `rule` - palette - composition.

### The Narrow Pass `narrow-pass`
`#8d7a63` / `#4a5568`, glow `#c9b8a0`
A slot canyon at dusk. Sheer rock walls rise steeply from both the left and
right edges and lean inward toward the top, leaving a bright vertical
channel of pale sky down the centre. Stratified rock bands in warm greys and
dust-browns. Scree at the base. The centre channel is the only bright area
and it is narrow.

### The Open Plains `open-plains`
`#7bb661` / `#e3c567`, glow `#c8f08f`
Endless grassland under a wide evening sky. A low horizon at 40%, banded
grass in mown stripes running to the vanishing point, a distant treeline as
a dark silhouette. Warm gold light raking from the upper left. Empty,
exposed, nothing to hide behind.

### The Mana Spring `mana-spring`
`#4aa3e0` / `#8be0ff`, glow `#a8ecff`
A grotto pool of luminous water. Cyan light comes from *below*, thrown up
onto wet cave walls and stalactites at the top edge. Concentric ripple rings
in banded blues fill the lower half. Damp stone in cool blue-greys.

### The Energy Void `energy-void`
`#5b4b8a` / `#2d2a4a`, glow `#9b8bd0`
Deep space with something wrong in it. Near-black violet field, a scatter of
cold stars, and a slow spiral of dim purple light collapsing toward a point
above the centre. Fragments of shattered rock drift at the edges. The
darkest board in the set.

### The Colosseum `colosseum`
`#d4af37` / `#8a6d3b`, glow `#ffe9a8`
A Roman arena floor at golden hour. Raked stone seating curves across the
top third in banded tiers, deep in shadow. Below it, packed sand in warm
ochres with rake lines and dark stains. Torches on the far wall. Neutral,
grand, no terrain advantage - this is the default field.

### The Mirror Realm `mirror-realm`
`#b18cd9` / `#6fd3e8`, glow `#e2c9ff`
An impossible hall of standing mirrors. Tall reflective panels line the left
and right edges in violet and cyan, each throwing a slightly wrong
reflection. A polished floor at the bottom mirrors the panels back. Perfect
bilateral symmetry, which no other field has.

### The Spirit World `spirit-world`
`#6fd3e8` / `#3f9b8c`, glow `#b6f5ff`
A drowned forest of translucent trees. Pale cyan trunks recede in ranks,
each fainter than the last. Ground fog at the bottom edge in banded teal.
Everything slightly transparent, nothing solid, no hard ground line.

### The Ancient Ruins `ancient-ruins`
`#c2a878` / `#6b8f71`, glow `#f0dcb0`
A collapsed temple reclaimed by the forest. Broken sandstone columns stand
at both edges, some snapped mid-shaft. Fallen blocks and flagstones below,
green creepers over everything. Warm shafts of light through a missing roof.

### The Hero's Trial `heros-trial`
`#e0a93b` / `#b3541e`, glow `#ffd88a`
A proving ground on a volcanic plateau. Dark basalt underfoot, cracks
glowing orange. Braziers on tall iron stands line both edges. A rust-red sky
banded with ash. Heat, ordeal, judgement.

### The Blood Battlefield `blood-battlefield`
`#b03a3a` / `#5c1a1a`, glow `#ff8a8a`
The aftermath of a great battle. Churned dark mud, broken spear shafts and
tattered banner poles leaning at the edges, a low red-black sky heavy with
smoke. Grim rather than gory: **no bodies, no blood spatter** - just the
wreckage of war.

---

## 5. Prompt template

```
Pixel art battlefield background, [NAME], [ONE-LINE PLACE].
[COMPOSITION.]
Wide landscape scene, [LIGHT SOURCE] as the only bright area.
Colour palette built on [PRIMARY] and [SECONDARY] with [GLOW] light.
Dark overall value, nothing brighter than mid-tone except the light source.
The centre of the image is deliberately empty and quiet: all detail sits
along the top edge, the bottom edge and the far left and right margins.
Detailed 16-bit pixel art in the style of a Super Nintendo RPG background,
flat colour fills, banded and dithered shading, hard pixel edges, no
anti-aliasing, limited palette of at most 24 colours.
No characters, no people, no creatures, no text, no UI, no frame,
no border, no vignette, no watermark.
```

---

## 6. Acceptance checklist

1. **Canvas** is exactly 512 x 284.
2. **Colour count** <= 24: `magick identify -format "%k"`.
3. **Centre quiet:** the middle 40% x 60% region has lower variance than
   the outer margins.
4. **Value ceiling:** < 8% of pixels above 60% luminance.
5. **Card legibility:** place six real cards over it and confirm names and
   numbers still read.
6. **No figures.** Visual check.
7. **File size** < 72 KB.

Checks 1-4 and 7 were previously automated; since the 2026-08 refresh they
are run by eye against the rendered board, at native resolution.

---

## 7. The main menu backdrop

Same house style, different job. Lives in `assets/menu/`.

Four layers, each a **640x360** tile repeating in x and scrolling at its
own speed. Depth comes from the speed ratio, not from blur:

| Layer | Content | Loop | Measured drift |
| --- | --- | --- | --- |
| `sky` | twilight gradient, stars, thin cloud | 420s | 27 px / 6s |
| `far` | snow-capped mountain silhouette | 260s | 44 px / 6s |
| `mid` | colosseum and ruined columns, torchlit | 150s | 77 px / 6s |
| `near` | black clifftop, grass, banner poles | 90s | 128 px / 6s |

Plus three CSS-only layers that cost no storage: a breathing ground fog,
twenty drifting embers on individual lanes, and a final grade that darkens
the middle so the wordmark always sits on a quiet field.

### Seamless tiling is built, not hoped for

Each layer is generated `W + 200` wide, then the right edge is cross-faded
over the left and the overlap cropped, so `out[0]` is by construction the
column that followed `out[W-1]`. Blending happens in **premultiplied
alpha**, or transparent pixels drag colour into the fade and leave a halo.

Verified numerically: the wrap discontinuity is compared against the
average neighbour difference inside the tile. Ratios below 2.0 are
invisible; the shipped layers measure 0.70, 0.45, 1.43 and 0.36.

### Three traps worth remembering

- **Quantise, fade, quantise.** Fading last leaves a hard edge where the
  palette lands (ratios 2.03 and 4.65). Fading first invents thousands of
  intermediate tones and blows the 24-colour budget (2,756 on `far`).
  Doing it on both sides gives a smooth wrap and an in-budget palette.
- **Enclosed pockets.** The border flood fill cannot reach sky seen
  *through* a colosseum arch, so those stayed opaque as pale stone blobs.
  Same failure the character pipeline hit on Tomoe Gozen's neck gap; the
  same pocket sweep fixes it, and needs no size guard here because a
  silhouette layer has no near-white costume to protect.
- **Never use the `animation:` shorthand for these.** It resets every
  sub-property it omits, so it set `animation-duration` back to `0s` and
  silently froze all four layers - they loaded and rendered but never
  moved. Longhand only.

Low graphics and `prefers-reduced-motion` keep the painted scene and drop
every animation: the backdrop is the main thing giving the menu a sense of
place, and a static composite costs one paint.
