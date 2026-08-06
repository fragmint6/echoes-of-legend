# Proposal: Campaign Narrative Integration (Chapter 1 — The Road of Echoes)

## 1. Executive Summary

Chapter 1 (_The Road of Echoes_) introduces a 7,200-word mythic narrative following the nameless Wayfarer crossing ten gates between memory and the Quiet. This proposal outlines how to incorporate the full prose seamlessly into the game engine without disrupting tactical card gameplay, cluttering the UI, or blocking the battle loop.

---

## 2. Core Architectural Principles

1. **Narrative-Driven Progression:** Story exposition occurs at natural transition boundaries (pre-fight preparation, post-fight resolution, and chapter milestones).
2. **Non-Blocking Combat:** Battles remain fluid and tactical. Gameplay is never halted mid-round by intrusive modal popups; combat dialogue is delivered via the existing lightweight cinematic banner queue (`cine()`) and combat log.
3. **Player Agency:** Dialogue is interactive and paced by the player (`Space`/`Enter` to advance, `Esc` to close/skip), with clear speaker attribution and progress steps.
4. **Clean Progression State:** Unlocks, clears, and story flags persist in `localStorage` under `eol.campaign.ch1.progress`.

---

## 3. Tier 1 Delivery System: Stage Prologues & Epilogues

Every stage features authored **Tier 1 Dialogue** (4–6 beats) directly adapted from the manuscript:

### Stage Breakdown & Lore Focus

- **Stage 1 — The Recruiter (_The Road of Echoes_)**
  - _Lesson:_ Classic Battle fundamentals & opening board tempo.
  - _Prologue:_ The blank ledger, the brass coin, and the question of what a legend wants to outlive.
  - _Battle:_ Classic match on _The Colosseum_ against The Recruiter's Grimmwood deck.
  - _Epilogue:_ The ledger records `CONTINUING.` Gate 2 unlocks.

- **Stage 2 — The Oathkeeper (_The Oath at the Pass_)**
  - _Lesson:_ Preparation phase (bans & front-row placement), Shields & Provoke tax.
  - _Prologue:_ The 43 promises reduced to 12 at the Narrow Pass; what strength is for.
  - _Battle:_ Classic match on _The Narrow Pass_.

- **Stage 3 — The Outlaw (_The Woman in the Watchtree_)**
  - _Lesson:_ Focus fire, kill priority, and protecting your carry.
  - _Prologue:_ A bookshop family whose records were burned; hunting the brightest echo.
  - _Battle:_ Classic match on _The Open Plains_.

- **Stage 4 — The Anointed (_The Covenant of the Astrolabe_)**
  - _Lesson:_ Reading Marks (setup & detonation), energy banking.
  - _Prologue:_ The spring pool, astrolabe rings, and Mark prophecies.
  - _Battle:_ Classic match on _The Mana Spring_.

- **Stage 5 — The Warden of the Mid-Road (_The Mid-Road Arches_)**
  - _Lesson:_ Unabridged Sets (Best of 3) & adaptive sideboarding.
  - _Prologue:_ The three arches; why the guardians chose to remain.
  - _Battle:_ Unabridged Set on _Colosseum / Narrow Pass / Open Plains_.

- **Stage 6 — The Trickster (_The Carved Tiles_)**
  - _Lesson:_ Snake drafting fundamentals & energy void management.
  - _Prologue:_ Choices left across the table; other possible selves.
  - _Battle:_ Draft match on _The Energy Void_.

- **Stage 7 — The Strategist (_The Marble Grid_)**
  - _Lesson:_ Counter-drafting & kill-chain engines.
  - _Prologue:_ Patterns vs destiny; breaking the calculated inevitability.
  - _Battle:_ Draft match on _The Blood Battlefield_.

- **Stage 8 — The Chronicler (_The Wall-less Library_)**
  - _Lesson:_ Status affliction attrition (Burn, Silence, Cleanse).
  - _Prologue:_ Cedar shelves under cold stars; the Quiet learning you exist.
  - _Battle:_ Draft match on _The Spirit World_.

- **Stage 9 — The Last Guardian (_The Bronze Threshold_)**
  - _Lesson:_ Cross-faction synergy & full set mastery.
  - _Prologue:_ Holding the door shut against oblivion; the cost of vigilance.
  - _Battle:_ Unabridged Set on _Void / Battlefield / Spirit World_.

- **Stage 10 — Gilgamesh (_He Who Saw the Deep_)**
  - _Lesson:_ Thresholds, endgame closure, and final judgment.
  - _Prologue:_ The Hall of the First King, the scales of memory, and Enkidu.
  - _Battle:_ Unabridged Set on _The Legend's Trial / Ancient Ruins / Mirror Realm_.
  - _Epilogue:_ The scales balance; the gate toward Uruk opens.

---

## 4. UI & Flow Integration

```
[Campaign View] ──(Click Stage)──> [Tier 1 Prologue Dialogue Modal]
                                                 │
                                                 ▼ (Fight Button)
                                    [Choose Deck Modal]
                                                 │
                                                 ▼
                                    [Preparation Phase (Bans & Fielding)]
                                                 │
                                                 ▼
                                    [6v6 Match on Pinned Battlefield]
                                                 │
                                                 ▼ (Victory)
                                    [Victory Screen & Stage Cleared]
                                                 │
                                                 ▼
                                    [Next Gate Unlocked on Map]
```

1. **Dialogue Modal (`.chapter-dialogue`):**
   - Speaker attribution with character portrait accent.
   - Step indicators (`01 / 06`) with smooth entry transitions.
   - Keyboard shortcuts (`Space`/`Enter` to advance, `Esc` to skip/close).

2. **Stage Progression States:**
   - **Locked:** Stage card is blurred (`filter: blur(3.5px)`), dimmed, and disabled.
   - **Available (Unlocked):** Unblurred, highlighted, and interactive.
   - **Cleared:** Displaying a gold/green `Cleared` checkmark banner.
