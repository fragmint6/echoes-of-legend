# Battlefield Background Art Specification

Pixel-art backdrops for the ten battlefields. Companion to
`docs/ART-SPEC.md`, which governs character portraits; the two must read as
one game, so the shared rules there apply here unless overridden below.

Status: **all 10 regenerated at 2560x1440 PNG** (2026-08-08 unification pass).

> **2026-08-08 unification.** The 2026-08-06 boards mixed several art
> styles. All ten were regenerated in ONE style, anchored on the two
> canonical backdrops - `assets/menu/menu-bg.png` and
> `assets/chapter-1/cw-bg.png` (hard 1px outlines, dithered sky bands,
> flat fills with blocky shading, dark muted palette, one restrained
> light source) - using both as style references, then centre-cropped
> to 16:9 and nearest-neighbour resized to 2560x1440 opaque PNG. Each
> board keeps its in-game accent palette (`data/battlefields.js`
> colors) so the CSS glows still match the art.

> **2026-08-06 refresh.** The 2026-08-03 boards were 512×284 JPEGs.
> They have been replaced with AI-generated 16-bit pixel-art scenes at
> **2560×1440 (1440p)** saved as opaque PNGs to `assets/boards/<id>.png`.
> The `cover` fit means any landscape aspect works, and at 1440p there
> is enough pixel density for every display size. The retired mechanical
> caps (512×284, 24 colours, 72 KB) are kept below for context but no
> longer enforced.

---

## 1. Hard constraints

| Constraint | Value | Why |
| --- | --- | --- |
| Canvas | **2560 x 1440** | 1440p covers every display; `cover` cropping keeps the centre safe for any shape. |
| Pixel scale | ~2.1x the character pixel | Portraits are 128 x 176 art rendered into the card tile. A coarser background pixel makes the backdrop *recede* behind the cards instead of competing with them. Measured, not guessed. |
| Format | PNG (opaque) | No transparency: this is the bottom layer. 1440p PNGs are ~2MB each; acceptable for a static web asset served once. |
| Palette | **Unlimited** | AI-generated pixel art; palette is implicit in the generation prompt, not post-quantised. |
| Anti-aliasing | **None** | `image-rendering: pixelated` is set on the layer; soft edges fight it. |
| File size | **~1.7–2.5 MB each** | 10 boards ≈ 20 MB total. Acceptable for a single page-load with browser caching. |
| Aspect | 1.78 (matches 16:9) | Phones render the board portrait, so the image is `cover`-cropped from the centre - keep the composition centre-safe. |

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

1. **Canvas** is exactly 2560 x 1440.
2. **No figures.** Visual check.
3. **Centre quiet:** the middle 40% x 60% region has lower variance than the outer margins.
4. **Card legibility:** place six real cards over it and confirm names and numbers still read.

Checks 1-4 are visual; the old automated pipeline (`process_boards.py`, `verify_boards.py`) is retired.

---

## 7. The main menu backdrop

Same house style, different job. Lives in `assets/menu/menu-bg.png`.

**2026-08-06:** The old four-layer parallax (sky/far/mid/near at 640×360
with seamless tiling and per-layer CSS drift) has been replaced by a
single **2560×1440 static pixel-art image** — ancient colosseum ruins
beneath a dramatic open sky. All menu particle layers (embers, shooting
stars, fireflies, fog banks, ash, spores, motes) continue to animate on
top of the static base. The old parallax layers (`sky.png`, `far.png`,
`mid.png`, `near.png`) are still present in `assets/menu/` but hidden
via CSS (`opacity: 0`).

Low graphics and `prefers-reduced-motion` keep the painted scene and drop
every animation: the backdrop is the main thing giving the menu a sense of
place, and a static composite costs one paint.

### Historical: seamless tiling (retired)

The old four-layer system is documented here for reference should it ever
return. Each layer was a 640×360 tile repeating in x, scrolling at its
own speed with depth from speed ratio, not blur. Seamless tiling was
achieved by generating `W+200` wide, cross-fading the right edge over the
left, and cropping the overlap. Three failure modes worth remembering:
quantise-after-fade (palette blowout), enclosed-pocket transparencies,
and the `animation:` shorthand resetting sub-properties to zero.
