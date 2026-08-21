# Why CrazyGames rejected the game, and what to fix

"The overall quality of the game does not yet meet the expectations of our
platform" is CrazyGames' catch-all rejection. It is not a verdict on the
design. It is what the reviewer writes after a short session in a small
iframe, and everything below is a plausible cause found by auditing the
build against their published requirements.

Reviewed 2026-08-21 against
`docs.crazygames.com/requirements/{intro,gameplay,quality}`.

**Nothing here is a guess about their internal notes.** Each item is a
measured fact about this build plus the requirement it collides with.

---

## The likely decisive three

### 1. It is not playable on a phone, and mobile is most of their traffic

Hard evidence in this repo:

- **Zero gameplay touch handlers.** The only `touchstart`/`pointerdown`
  listeners in `js/` are two in `js/audio.js` (autoplay unlock) and one
  capability sniff in `js/telemetry.js`. `js/play.js`, `js/battle.js` and
  `js/deck.js` register none.
- **13 `[data-tip]` elements and 9 `mouseenter` handlers** carry
  information that has no touch equivalent. On the prep board the hover
  panel is the only place a card's stats and boosters are shown - it is
  the one screen where the six is actually chosen.
- `docs/CRAZYGAMES.md` already concedes this: *"Mobile - not yet. The CSS
  has breakpoints, but deck.js and play.js register no touch/pointer
  handlers."*

The submission form was answered "mobile: no", which is honest, but a
reviewer still opens it on a phone. What they get is a game that renders
and then does not respond.

**This is the single most likely cause of the rejection.**

### 2. The game is not readable in the iframe sizes they actually test

CrazyGames lists the exact frames they check. The smallest desktop one is
**821 x 462** and the most common are 907 x 510 and 1216 x 684.

This build has:

- **111 width-driven rules** (`html.mqw*`, seven breakpoints: 520 to 980)
- **9 height-driven rules**, all at a **single** breakpoint: `mqh820`

`MQ_H = [820]` in `js/app.js:1630`. Every CrazyGames desktop frame is
**shorter than 820px**, so *every* one of them falls into the same single
height bucket - including the 462px one, which is 44% shorter than the
only breakpoint the game knows about.

The battle board is a 3-row grid of 5:6 cards plus a stats strip, sized
from `--vh1`. At 462px of height that is roughly 130px per row before
padding. The UI scale control only goes down to 80%.

This is the "text and images must be legible at devicePixelRatio 1 on
responsive iframe sizes" check, and it is the one most likely to have been
failed on a desktop reviewer's screen.

### 3. Time-to-playable is far too long

Measured payload:

| | size |
| --- | --- |
| `assets/` | **36 MB** |
| Menu parallax alone (`assets/menu/*.png`) | **6.0 MB** |
| Code (js + css + data + html) | 3.2 MB |
| **First view before anything is interactive** | **~9.2 MB** |

The menu parallax is loaded by `css/style.css` as `url()` backgrounds on
`.menu-bg`, so it is fetched for the home screen - it is not deferred.
Ten board PNGs are 2 MB each, all 2560x1440 truecolor PNG.

Estimated time to first playable:

| connection | now | after WebP |
| --- | --- | --- |
| Fast 4G / median broadband | 6.1 s | 2.9 s |
| Slow 4G | 18.4 s | 8.6 s |
| 3G | 46.0 s | 21.4 s |

"The game must load quickly" is a stated Basic requirement, and Basic
Launch progression is judged on engagement metrics that a 6-18 second
black screen destroys.

**WebP at quality 82 was measured on this repo's own art:**

```
menu-bg.png    2.2M -> 393K   (82% smaller)
colosseum.png  2.1M -> 355K   (83% smaller)
cw-bg.png      2.3M -> 493K   (79% smaller)
```

36 MB of assets becomes roughly **6 MB**. This is the highest
effort-to-reward fix available and `docs/CRAZYGAMES.md` already flags it
as "not required but would materially improve load time".

---

## Also worth fixing before resubmitting

### 4. New players do not land in gameplay

`body[data-view]` is `home` on first boot. Their guideline: *"Provide a
simple onboarding phase where new users land directly"*, and for Full
Implementation, *"Games should land new users in gameplay immediately...
a maximum of 1 click"*.

A card battler cannot literally open mid-battle, but the reviewer's first
30 seconds currently go to a menu. Consider booting a fresh save straight
into Chapter I Stage 1 (which already has scripted tutorial play), with
the menu reachable from there.

### 5. The 380 KB WAV

`assets/audio/dialogue-talk.wav` is the only uncompressed audio file in
the build. As OGG/MP3 it is a few tens of KB.

### 6. Verify no custom fullscreen button

*"Custom in-game fullscreen buttons are prohibited."* Worth a grep of the
settings UI before resubmission - CrazyGames provides fullscreen itself.

---

## What is already correct

Worth stating, because these are not why it was rejected:

- Boots with **zero console errors** (verified in a jsdom harness).
- **36 MB / 166 files** is inside the 50 MB no-SDK cap and the 1500 file
  limit - the size problem is load *time*, not the hard limit.
- The SDK integration is genuinely good: gameplay events, mute priority,
  Data-module saves, and a real account exchange, all with failure paths
  designed for adblock.
- **Escape is unbound everywhere** (their restricted-keys rule).
- English throughout, PEGI 12, no external ads, no cross-promotion in a
  main CTA.

---

## Suggested order

1. **Convert PNG to WebP** - biggest win, lowest risk, mechanical. 36 MB
   to ~6 MB, and load time roughly a third of what it is.
2. **Add height breakpoints** below 820: at minimum 700, 620, 520, 460,
   and test the battle board at 821x462 and 907x510.
3. **Add touch support** to prep, battle and deck - and give every hover
   panel a tap equivalent. This is the big one, and the reason to do it
   is not CrazyGames, it is that most web-game players are on phones.
4. Boot a fresh save into the tutorial gate.
5. Re-encode the WAV.
6. Run the developer portal QA tool at every listed iframe size before
   resubmitting.

Items 1, 2 and 5 are a few days of mechanical work. Item 3 is the real
project, and it is what "quality" most likely meant here.
