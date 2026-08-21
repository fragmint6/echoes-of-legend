# Audit against the CrazyGames quality guidelines

Every clause of the guidelines checked against this build, 2026-08-21.
Verdicts are **FAIL** (breaks the clause), **RISK** (a reviewer could
reasonably mark it down), **PASS**, or **N/A**.

Only the "Restricted Keys" section is a hard rule; the rest are
guidelines. But the rejection reason was *quality*, which is the word
this page defines - so the RISK items matter as much as the FAILs.

---

## Summary: what the game actually breaks

| # | Clause | Verdict |
| --- | --- | --- |
| 1 | Interface designed for the user's device | **FAIL** |
| 2 | Consistent resolution, no switching looks | **FAIL** |
| 3 | New users land directly in an onboarding phase | **FAIL** |
| 4 | Prioritize visuals, limit text in onboarding | **FAIL** |
| 5 | Game responds quickly / smooth flow | **RISK** |
| 6 | Not easily confused with a similarly named game | **RISK** |
| 7 | High resolution, free of artifacts | **RISK** |
| 8 | Audio levels consistent | **RISK** |
| — | Restricted keys, fullscreen, cross-promo, solo prominence | **PASS** |

---

## FAIL 1 - "The game interface is designed for the user's device"

Also: *"the display layout is comfortable and intuitive"*.

- **No gameplay touch handlers at all.** The only `touchstart` /
  `pointerdown` listeners in `js/` are two in `js/audio.js` (autoplay
  unlock) and one capability sniff in `js/telemetry.js`. `js/play.js`,
  `js/battle.js` and `js/deck.js` register none.
- **13 `[data-tip]` elements and 9 `mouseenter` handlers** are the only
  path to information that has no tap equivalent - including the prep
  board's hover panel, the one screen where the six is chosen.
- **Height breakpoints: one.** `MQ_H = [820]` (`js/app.js:1630`) against
  **111** width rules across seven breakpoints. Every desktop iframe
  CrazyGames tests (821x462, 907x510, 1077x606, 1216x684) is shorter
  than 820px, so all of them land in the same single bucket. The battle
  board is a 3-row grid sized from `--vh1`; at 462px that is ~130px per
  row before padding, and the UI scale floor is 80%.

## FAIL 2 - "Aesthetic style should remain consistent, not switch between looks i.e. ... high resolution to low resolution"

This is the clause I would bet the rejection on, and it is not a bug -
it is a deliberate art decision colliding with a written rule.

Distinct image sizes in `assets/`:

| size | count | what |
| --- | --- | --- |
| 64x88 | **115** | every legend portrait |
| 128x176 | 20 | rival portraits |
| 512x288 | 10 | board thumbnails |
| 2560x1440 | 13 | boards, menu, chapter art |

The game draws **64x88 pixel portraits** with
`image-rendering: pixelated` on top of **2560x1440 painted
backgrounds**. That is a literal switch from low resolution to high
resolution within a single frame.

Worse, `.cd-art` (card detail) shows that same 64x88 source at
`max-height: calc(var(--vh1) * 80)` - **80% of viewport height**, an
~8x upscale of an 88px-tall image.

The repo is explicit that this is intentional (css/style.css:16546,
"the pixels are the point", owner ruling 2026-08-19). The problem is
that the source art is **not authored pixel art** - it is detailed
painted illustration downsampled to 64px, so at 4x and beyond the faces
read as mush rather than as deliberate chunky pixels. A reviewer sees
compression-artifact-looking portraits against crisp painted boards.

**This does not mean abandon the style.** It means either commit to it
(a consistent low-res treatment everywhere, including boards) or raise
the portraits so they hold up at the sizes they are actually displayed
at. The current mix is the thing the clause names.

## FAIL 3 - "Provide a simple onboarding phase where new users land directly"

`body[data-view]` is `home` on first boot (verified in a jsdom harness).

There IS a real tutorial - the Recruiter's wayfinder in
`data/campaign-ch1.js` - and it is genuinely well made: it pulses the
next button and lets the player click through themselves. But it
*points* rather than lands. The scripted path is:

```
home -> PLAY -> CAMPAIGN -> Chapter 1 -> Gate I -> dialogue -> battle
```

That is **five clicks plus a dialogue scene** before the first move.
Their Full Implementation bar is "land in gameplay immediately, maximum
1 click".

## FAIL 4 - "Prioritize visuals and limit the use of text for onboarding"

`data/campaign-ch1.js` holds **101 dialogue lines / 3,538 words**. The
first-boot intro is 3 speeches before the player touches anything, and
Gate I adds 7 more lines (200 words) before the tutorial battle.

The writing is good. That is not the issue - the issue is that it is
the first thing a CrazyGames visitor meets, and their audience arrives
expecting to be playing in seconds.

Note the guidelines also require the onboarding be **skippable**. It is
(`tutorialsEnabled()`, and skip is offered on the intro scene), so that
sub-clause passes.

---

## RISK 5 - "Responds quickly" / "smooth flow and continuity"

First view is **~9.2 MB** before anything is interactive: 6.0 MB of
menu parallax (`assets/menu/*.png`, loaded as CSS `url()` backgrounds
on `.menu-bg`, so not deferred) plus 3.2 MB of code.

| connection | time to playable | after WebP |
| --- | --- | --- |
| Fast 4G / median broadband | 6.1 s | 2.9 s |
| Slow 4G | 18.4 s | 8.6 s |
| 3G | 46.0 s | 21.4 s |

Measured WebP savings on this repo's own art, quality 82:

```
menu-bg.png    2.2M -> 393K   (82% smaller)
colosseum.png  2.1M -> 355K   (83% smaller)
cw-bg.png      2.3M -> 493K   (79% smaller)
```

36 MB of assets becomes roughly 6 MB.

## RISK 6 - "Not easily confused with another game of a similar name"

`echoesoflegends.com` exists, and "Dawncraft: Echoes of Legends" is a
known Minecraft modpack with search presence. "Echoes of Legend" is not
a protected identifier, but it is not distinctive either, and this
clause is explicitly in the rubric.

## RISK 7 - "High resolution ... free of graphical defects like compression artifacts"

Covered by FAIL 2. Called out separately because a reviewer skimming
portraits may log it as "compression artifacts" without realising the
low resolution is intentional - which is exactly how a deliberate style
gets read as a defect.

## RISK 8 - "Audio levels are consistent / sounds aren't too loud or quiet"

Music and most SFX are procedural (`js/audio.js`), so they are
internally consistent. The one sampled asset is
`assets/audio/dialogue-talk.wav` - **387 KB uncompressed WAV**, the only
non-procedural sound in the game. Worth checking its level against the
procedural bus, and re-encoding it to OGG/MP3 (a few tens of KB).

---

## PASS - verified clean

- **Restricted keys.** No `Escape` binding anywhere in `js/`. The only
  bindings are `Enter` (5), `Space` (4) and `ArrowLeft` (1). No WASD, so
  the AZERTY/ZQSD concern does not apply.
- **No custom fullscreen button.** Zero `requestFullscreen` calls.
- **Cross-promotion.** The only external links are Discord, and both are
  tagged `data-community`, which `css/platform.css:24` hides entirely on
  the portal build. The `fragmint6.web.app` URLs are `<meta>`/canonical
  tags, not user-visible links - not a violation.
- **Solo as prominent as multiplayer.** Singleplayer is the default
  selected tab; the multiplayer tab carries an "account" note rather
  than failing silently.
- **Clear goals, easy to understand, English throughout.** Boots with
  zero console errors.
- **Easy to add content.** Factions are data files; a chapter is a data
  file plus a table entry.

---

## What I would do, in order

1. **WebP conversion.** Mechanical, no design decisions, ~30 MB saved
   and load time cut to a third.
2. **Height breakpoints** below 820 (700 / 620 / 520 / 460) and test the
   board at 821x462 and 907x510 in their QA tool.
3. **Decide the art question.** Either raise portrait resolution to suit
   the sizes they are displayed at, or make the low-res treatment
   consistent across boards and UI. The current split is what the
   consistency clause prohibits.
4. **Touch support** across prep, battle and deck, plus a tap path to
   every hover panel.
5. **Shorten the runway to the first move** - boot a fresh save closer to
   Gate I, and trim the intro speeches.
6. Re-encode the WAV.

1, 2 and 6 are mechanical. 3 and 4 are the real work, and together they
are what "overall quality" most likely referred to.
