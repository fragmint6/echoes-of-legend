# -*- coding: utf-8 -*-
"""Generate the Olympus line-art card portraits.

    python3 tools/gen_olympus_lineart.py

Writes six SVGs to assets/heroes-line/. The SVGs are committed, so this
script only needs running when the art itself changes; it exists so the
shared frame (substrate, halo rings, stroke weights, element colours)
stays consistent across the set instead of drifting file by file.

STYLE RULES, learned the hard way:

  1. THE HEAD FILLS THE FRAME. The first attempt drew a small head with
     dot eyes above a shoulder arc and every card read as a generic
     "user account" avatar. Big, cropped, cameo-like.

  2. CLASSICAL PROFILE, NOT A FRONT VIEW. The unbroken forehead-to-nose
     line is the strongest "Greek" cue available in a few strokes, and
     it removes the dot eyes that caused problem 1.

  3. ONE OVERSIZED ATTRIBUTE PER CARD, in white, overlapping the head:
     Zeus's bolt, Athena's crest, Hercules's club, Ares's spear,
     Medusa's eye, Apollo's sun. This is what makes the six
     distinguishable at thumbnail size, where the profile alone is not.

  4. CONTOURS MUST NOT COLLIDE. Hercules's lion hood originally traced
     the same curve as the skull and read as a lump; it works only once
     the pelt is clearly larger than the head beneath it.

  5. ATTACHED, TANGENT-ALIGNED TIPS. Medusa's snake heads are computed
     at each curve's endpoint and rotated to its end tangent - the
     hand-placed versions floated off the line and pointed inward.

GEOMETRY: authored 320x440 (8:11), matching every hero PNG, with all
subject matter inside x 17..303 / y 17..401. That is exactly what
survives both crops the game applies with object-fit: cover -
the collection card (250:385) trims the sides, the battle tile
(5:6 at center 30%) trims top and bottom. Check any change against
both before committing; see sim/verify_card_art.js.
"""
import os

W, H = 320, 440
EL = {'Lightning':'#63d7ff','Light':'#ffd977','Physical':'#ff4d4d',
      'Shadow':'#a05cd8','Fire':'#ff7a4d'}

def svg(name, el, body, halo_r=118, rot=0, ink='#ffffff'):
    c = EL[el]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{name}">
  <title>{name}</title>
  <rect width="{W}" height="{H}" fill="#06070d"/>
  <g fill="none" stroke="{c}" opacity=".18">
    <circle cx="160" cy="200" r="{halo_r}" stroke-width="1"/>
    <circle cx="160" cy="200" r="{halo_r+22}" stroke-width="1" stroke-dasharray="2 10" transform="rotate({rot} 160 200)"/>
  </g>
  <g fill="none" stroke="{c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
{body}
  </g>
</svg>
'''

# The shared classical profile, facing right. Scaled up so the chin sits
# near y=300 and the crown near y=70 - it OWNS the frame.
# forehead -> nose -> lip -> chin, one continuous path.
PROFILE = '''    <path d="M156 68 q-40 8 -52 62 l-22 66 l26 10 l-12 19 l17 10 l-10 15 l19 26 q12 15 38 15"/>
    <path d="M156 68 q64 3 78 64 q12 55 -7 100 q-10 24 -37 31"/>'''

# ------------------------------------------------------------------ ZEUS
# Legendary / Caster / Lightning. Storm beard + the bolt as a scar of light.
ZEUS = PROFILE + '''
    <!-- beard: three strokes, heavy, hanging off the jaw -->
    <path d="M118 250 q6 56 42 74" stroke-width="3"/>
    <path d="M140 262 q2 52 26 68" stroke-width="2.4" opacity=".8"/>
    <path d="M160 300 q22 22 34 40" stroke-width="2.4" opacity=".8"/>
    <!-- brow, heavy -->
    <path d="M116 150 q26 -12 44 -4" stroke-width="3.4"/>
    <!-- THE BOLT: the one white gesture, crossing the whole card -->
    <path d="M262 40 l-46 118 h34 l-58 132" stroke="#ffffff" stroke-width="5"/>'''

# ---------------------------------------------------------------- ATHENA
# Rare / Controller / Light. The helm IS the silhouette; crest sweeps back.
ATHENA = '''    <!-- profile, but the brow is hidden under the helm -->
    <path d="M156 96 q-38 10 -48 58 l-20 60 l24 9 l-11 17 l16 9 l-9 14 l18 24 q11 14 35 14"/>
    <path d="M156 96 q60 3 74 60 q11 51 -7 93 q-9 22 -34 29"/>
    <!-- corinthian helm: one contour over the crown, nose-guard down -->
    <path d="M96 168 q-6 -86 62 -92 q68 6 62 92" stroke-width="3.6"/>
    <path d="M104 158 q56 -22 112 0" stroke-width="2.6" opacity=".75"/>
    <!-- cheek guard -->
    <path d="M118 172 q-4 46 14 66" stroke-width="2.6"/>
    <!-- crest: the big sweeping gesture, white -->
    <path d="M132 78 q26 -56 82 -52 q-10 46 -46 66" stroke="#ffffff" stroke-width="4"/>
    <path d="M150 70 q22 -34 56 -38" stroke="#ffffff" stroke-width="2" opacity=".7"/>'''

# -------------------------------------------------------------- HERCULES
# Epic / Tank / Physical. Lion pelt worn as a hood - jaw above the brow.
HERCULES = PROFILE + '''
    <!-- lion pelt worn as a hood: a contour clearly LARGER than the skull,
         so it never collides with the profile underneath -->
    <path d="M74 196 q-22 -112 84 -122 q106 10 84 122" stroke-width="3.6"/>
    <!-- pelt hem across the brow -->
    <path d="M74 196 q28 20 84 20 q56 0 84 -20" stroke-width="2.8" opacity=".85"/>
    <!-- ears, one each side of the hood -->
    <path d="M92 92 q-20 -22 2 -32 q20 -8 28 12" stroke-width="2.6"/>
    <path d="M224 92 q20 -22 -2 -32 q-20 -8 -28 12" stroke-width="2.6"/>
    <!-- mane: short overlapping locks around the pelt edge -->
    <g stroke-width="2.2" opacity=".7">
      <path d="M66 152 q-18 -8 -18 -26 M72 116 q-18 -12 -14 -32 M104 70 q-14 -18 -2 -34
               M158 52 q-2 -18 10 -30 M212 70 q14 -18 4 -34 M244 116 q18 -12 16 -32
               M252 152 q18 -8 18 -26"/>
    </g>
    <!-- beard -->
    <path d="M126 268 q10 40 40 54" stroke-width="2.6"/>
    <!-- the club: his one white gesture, hauled over the shoulder -->
    <path d="M244 372 L292 214" stroke="#ffffff" stroke-width="9" stroke-linecap="round"/>
    <g stroke="#06070d" stroke-width="2.4">
      <path d="M286 236 l-11 -4 M279 258 l-11 -4 M272 280 l-11 -4 M265 302 l-11 -4"/>
    </g>
'''

# ---------------------------------------------------------------- APOLLO
# Rare / Medic / Light. Laurel crown + sun rays; the calmest card.
APOLLO = PROFILE + '''
    <!-- laurel wreath: a band with long pointed leaves swept back along it -->
    <path d="M98 132 q58 -46 126 -10" stroke-width="2.6"/>
    <g stroke-width="2.2">
      <path d="M108 128 q-22 -16 -34 -6 q10 16 34 6 Z"/>
      <path d="M132 112 q-18 -22 -32 -16 q6 20 32 16 Z"/>
      <path d="M158 100 q-16 -24 -30 -20 q3 21 30 20 Z"/>
      <path d="M186 100 q-10 -26 -25 -25 q-1 22 25 25 Z"/>
      <path d="M210 110 q-4 -26 -18 -29 q-6 21 18 29 Z"/>
      <path d="M226 124 q4 -25 -9 -31 q-11 19 9 31 Z"/>
    </g>
    <!-- sun: a ring of rays, all inside the crop box -->
    <g stroke="#ffffff" stroke-width="2.2" opacity=".8">
      <path d="M160 40 v-14 M244 74 l10 -10 M290 200 h14 M30 200 H16 M76 74 l-10 -10"/>
      <path d="M272 130 l13 -6 M48 130 l-13 -6 M282 268 l13 6 M38 268 l-13 6"/>
    </g>
'''

# ---------------------------------------------------------------- MEDUSA
# Epic / Controller / Shadow. Snakes MUST read as snakes: S-curves with
# heads, radiating wide - v1's two symmetric arcs read as bunny ears.
MEDUSA = '''    <path d="M156 96 q-38 10 -48 58 l-20 60 l24 9 l-11 17 l16 9 l-9 14 l18 24 q11 14 35 14"/>
    <path d="M156 96 q60 3 74 60 q11 51 -7 93 q-9 22 -34 29"/>
    <!-- the eye: the only white, and the reason to fear her -->
    <path d="M118 176 q16 -13 32 0 q-16 13 -32 0 Z" fill="#ffffff" stroke="#ffffff" stroke-width="1.6"/>
    <circle cx="134" cy="176" r="4.2" fill="#06070d" stroke="none"/>
    <!-- SIX snakes: each a single quadratic, each head attached at the
         curve endpoint and rotated to the end tangent (computed, not eyeballed) -->
    <g stroke-width="2.8">
      <path d="M116 112 Q56 72 88 34"/>
      <path d="M132 92 Q120 26 178 26"/>
      <path d="M178 84 Q206 30 250 58"/>
      <path d="M206 110 Q268 102 268 152"/>
      <path d="M98 140 Q36 132 44 92"/>
      <path d="M222 150 Q276 178 258 216"/>
    </g>
    <g fill="#ffffff" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round">
      <path d="M99 21 L93 39 L83 29 Z"/>
      <path d="M195 26 L178 33 L178 19 Z"/>
      <path d="M264 67 L246 64 L254 52 Z"/>
      <path d="M268 169 L261 152 L275 152 Z"/>
      <path d="M47 75 L51 93 L37 91 Z"/>
      <path d="M251 231 L252 213 L264 219 Z"/>
    </g>
'''

# ------------------------------------------------------------------ ARES
# Common / Bruiser / Fire. Helm with a hard T-visor; spear crossing down.
ARES = '''    <!-- helm silhouette replaces the crown; profile below it -->
    <path d="M100 186 q-8 -96 60 -102 q68 6 60 102"/>
    <!-- face opening: the T-slot, cut as negative space -->
    <path d="M112 176 q48 -20 96 0" stroke-width="3"/>
    <path d="M118 196 l0 34 q0 30 42 42" />
    <path d="M202 196 l0 30 q0 26 -20 40"/>
    <!-- nose guard: one vertical -->
    <path d="M148 168 l0 60" stroke-width="3.4"/>
    <!-- crest, swept hard back, white -->
    <path d="M124 96 q34 -58 96 -50 q-14 50 -62 68" stroke="#ffffff" stroke-width="4"/>
    <!-- spear, driven down through the card -->
    <path d="M272 34 L218 394" stroke="#ffffff" stroke-width="3"/>
    <path d="M272 34 l-20 22 l6 20 l20 -18 Z" fill="#ffffff" stroke="#ffffff" stroke-width="1.6"/>
    <!-- shoulder plate -->
    <path d="M96 300 q64 -26 130 6" stroke-width="2.6" opacity=".8"/>'''

CARDS = [
    ('olympus-zeus','Zeus','Lightning',ZEUS,118,12),
    ('olympus-athena','Athena','Light',ATHENA,120,-8),
    ('olympus-hercules','Hercules','Physical',HERCULES,124,20),
    ('olympus-apollo','Apollo','Light',APOLLO,116,0),
    ('olympus-medusa','Medusa','Shadow',MEDUSA,126,-18),
    ('olympus-ares','Ares','Fire',ARES,120,6),
]
out='/home/user/echoes-of-legend/assets/heroes-line'
os.makedirs(out,exist_ok=True)
for cid,name,el,body,r,rot in CARDS:
    open(os.path.join(out,cid+'.svg'),'w').write(svg(name,el,body,r,rot))
print('wrote %d'%len(CARDS))
