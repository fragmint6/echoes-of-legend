# Working prompt template for Chapter II legend art

Validated 2026-08-17 against the shipped roster. Produced `jotunheim-odin.png`,
which matches the shipped cards on pixel structure and framing.

**Read `docs/ART-SPEC.md` rev 6 first.** The single most important thing:
the style is PIXEL ART, not painted illustration. A previous pass got this
wrong because a 512px upscale of the shipped art looks painterly.

Fill the `[BRACKETS]` from the legend's brief in ART-SPEC section 5b.

```
Detailed 16-bit pixel art fantasy trading card illustration, portrait
orientation, in the style of a high-end Super Nintendo JRPG character card.

[NAME], [ONE-LINE IDENTITY], [ROLE ACTION: tank braced / bruiser mid-swing /
caster unleashing / controller weaving / medic blessing / sniper aiming].
THREE-QUARTER-LENGTH figure shown from mid-thigh upward, body filling the
central 60 to 70 percent of the frame width and dominating the composition.
Head and face clearly readable in the upper third, roughly 25 percent down
from the top. Heroic dramatic pose, strong diagonal action lines. Not a face
close-up, not a distant full-body sprite - a card portrait where the character
is large and commanding but the environment is fully visible around and behind.

Face: [FACE DESCRIPTION]. Eyes clearly readable with a dark pupil.
[COSTUME AND MATERIALS]. [DEFINING WORN FEATURE].

Costume built on [FACTION PRIMARY] and [FACTION SECONDARY], with a crisp
[ELEMENT COLOUR] rim light along the upper-left contour of the body.
[ELEMENT EFFECT ON THE FIGURE].

Behind them, a full environment: [FACTION ENVIRONMENT]. The backdrop is
darker, slightly desaturated, with broader softer pixel clusters than the
figure so they snap forward. Horizon no higher than mid-canvas, calm sky
directly behind the head.

STYLE: authentic pixel art with visible chunky square pixels, flat colour
fills, hard blocky shading with 3-5 tones per material, deliberate dithering
in the gradients, selective dark outlines, crisp hard pixel edges, no
anti-aliasing, no smooth airbrushed blending, tiny 1px specular highlights,
limited palette. Rich and detailed, but unmistakably built from pixels.

Fully opaque, filling the canvas edge to edge. ONE character alone in the
scene. No animals, no companions, no blood, no text, no frame, no border,
no watermark. Nothing crossing the face. [RARITY DIRECTION.]
```

## Then build it

```bash
python tools/legend_art/build_card_art.py <source.png> assets/legends/<id>.png
```

Crops to 8:11, downsamples in linear light with lanczos, unsharp 15, saves
64x88 lossless RGB PNG. Wire `art: 'assets/legends/<id>.png'` onto the card,
regenerate MANIFEST.csv, and run `node sim/verify_card_art.js`.

## Objective style check

Do not trust an upscale by eye - that is what caused the first failed pass.

```python
a = np.asarray(Image.open(f).convert('RGB'), dtype=int)
d = np.abs(a[:, 1:] - a[:, :-1]).sum(-1)
flat, hard = (d <= 6).mean(), (d > 30).mean()
```

Shipped roster: **flat 0.11-0.26, hard 0.34-0.57**.
Smooth painted art fails at roughly flat 0.09 / hard 0.62.
