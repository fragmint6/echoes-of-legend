# Chapter II legend art build

This directory contains the generated Chapter II legend PNGs specified by the updated `ART-SPEC.md`.

- Shipping size: **64 x 88 px lossless PNG**
- Source art: `assets/legend-src/` at **640 x 880 JPEG**
- Resampling: linear-light Lanczos with the shared low-sharpening pipeline
- Manifest: `MANIFEST.csv`

The current build contains all 49 Chapter II legends: all seven Asgard, Pandemonium, Devas, Genesis, Transylvania and Tortuga legends, plus Hemithea's seven. Batch 14 refreshed The Flying Dutchman. No Chapter II legends remain outstanding.

**2026-08-18.** Five factions were renamed (Takamagahara -> Kami, Gehenna -> Pandemonium, Devaloka -> Devas, Jotunheim -> Asgard, Achaea -> Hemithea) and every affected PNG was renamed to match its new card id. Hercules moved from Olympus to Hemithea, so `olympus-hercules.png` is now `hemithea-hercules.png` - the image is byte-identical, only the filename changed. `olympus-poseidon.png` was generated to replace him as Olympus' Tank. Roster is now **113 files**, and MANIFEST.csv was regenerated from disk.

**2026-08-18b.** Empyrean renamed **Genesis**; its seven PNGs were renamed to match. Kaguya moved from Yamato to Kami (`yamato-kaguya.png` -> `kami-kaguya.png`, image unchanged). Two new portraits generated: `yamato-miyamoto-musashi.png` and `genesis-adam.png`. Roster is now **115 files** and MANIFEST.csv was regenerated from disk.

Both new portraits were regenerated once: the first attempt came back landscape (1376x768) with smooth painterly shading, which fails the section 4b flat/hard test. The second pass asked explicitly for tall 5:7 portrait orientation and banded 16-bit shading, and both land inside the shipped envelope (Musashi flat 0.095 / hard 0.434, Adam flat 0.157 / hard 0.578; shipped range is flat 0.035-0.275, hard 0.258-0.694).
