# Proposal: Campaign Narrative Integration (Chapter 1 — The Road of Echoes)

## 1. Executive Summary

Chapter 1 (*The Road of Echoes*) introduces a 7,200-word mythic narrative following the nameless Wayfarer crossing ten gates between memory and the Quiet. This proposal outlines how to incorporate the full prose seamlessly into the game engine without disrupting tactical card gameplay, cluttering the UI, or blocking the battle loop.

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

* **Stage 1 — The Recruiter (*The Road of Echoes*)**
  * *Lesson:* Classic Battle fundamentals & opening board tempo.
  * *Prologue:* The blank ledger, the brass coin, and the question of what a legend wants to outlive.
  * *Battle:* Classic match on *The Colosseum* against The Recruiter's Grimmwood deck.
  * *Epilogue:* The ledger records `CONTINUING.` Gate 2 unlocks.

* **Stage 2 — The Oathkeeper (*The Oath at the Pass*)**
  * *Lesson:* Preparation phase (bans & front-row placement), Shields & Provoke tax.
  * *Prologue:* The 43 promises reduced to 12 at the Narrow Pass; what strength is for.
  * *Battle:* Classic match on *The Narrow Pass*.

* **Stage 3 — The Outlaw (*The Woman in the Watchtree*)**
  * *Lesson:* Focus fire, kill priority, and protecting your carry.
  * *Prologue:* A bookshop family whose records were burned; hunting the brightest echo.
  * *Battle:* Classic match on *The Open Plains*.

* **Stage 4 — The Anointed (*The Covenant of the Astrolabe*)**
  * *Lesson:* Reading Marks (setup & detonation), energy banking.
  * *Prologue:* The spring pool, astrolabe rings, and Mark prophecies.
  * *Battle:* Classic match on *The Mana Spring*.

* **Stage 5 — The Warden of the Mid-Road (*The Mid-Road Arches*)**
  * *Lesson:* Unabridged Sets (Best of 3) & adaptive sideboarding.
  * *Prologue:* The three arches; why the guardians chose to remain.
  * *Battle:* Unabridged Set on *Colosseum / Narrow Pass / Open Plains*.

* **Stage 6 — The Trickster (*The Carved Tiles*)**
  * *Lesson:* Snake drafting fundamentals & energy void management.
  * *Prologue:* Choices left across the table; other possible selves.
  * *Battle:* Draft match on *The Energy Void*.

* **Stage 7 — The Strategist (*The Marble Grid*)**
  * *Lesson:* Counter-drafting & kill-chain engines.
  * *Prologue:* Patterns vs destiny; breaking the calculated inevitability.
  * *Battle:* Draft match on *The Blood Battlefield*.

* **Stage 8 — The Chronicler (*The Wall-less Library*)**
  * *Lesson:* Status affliction attrition (Burn, Silence, Cleanse).
  * *Prologue:* Cedar shelves under cold stars; the Quiet learning you exist.
  * *Battle:* Draft match on *The Spirit World*.

* **Stage 9 — The Last Guardian (*The Bronze Threshold*)**
  * *Lesson:* Cross-faction synergy & full set mastery.
  * *Prologue:* Holding the door shut against oblivion; the cost of vigilance.
  * *Battle:* Unabridged Set on *Void / Battlefield / Spirit World*.

* **Stage 10 — Gilgamesh (*He Who Saw the Deep*)**
  * *Lesson:* Thresholds, endgame closure, and final judgment.
  * *Prologue:* The Hall of the First King, the scales of memory, and Enkidu.
  * *Battle:* Unabridged Set on *The Legend's Trial / Ancient Ruins / Mirror Realm*.
  * *Epilogue:* The scales balance; the gate toward Uruk opens.

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
   * Speaker attribution with character portrait accent.
   * Step indicators (`01 / 06`) with smooth entry transitions.
   * Keyboard shortcuts (`Space`/`Enter` to advance, `Esc` to skip/close).

2. **Stage Progression States:**
   * **Locked:** Stage card is blurred (`filter: blur(3.5px)`), dimmed, and disabled.
   * **Available (Unlocked):** Unblurred, highlighted, and interactive.
   * **Cleared:** Displaying a gold/green `Cleared` checkmark banner.
