# Campaign Mode - Chapter 1: "The Road of Echoes"
### Definitive design spec. Locked with the user 2026-08-05. Supersedes the old 40-mission proposal in DESIGN-Campaign.md.

> **STATUS: DESIGN LOCKED - implementation is next.** Every decision below
> came from an explicit user ruling in the 2026-08-05 design session;
> where a detail is still open it is marked **[OPEN]** and listed in §9.

---

## 0. What the campaign IS

- The campaign is the game's **lore vessel - 99% of all lore lives here**
  (standing ROADMAP law: no lore anywhere else in the client).
- It is a **teaching campaign**: Chapter 1's purpose is to teach the
  player the whole game, one mechanic per stage, wrapped in an intricate
  story with personality-driven rivals.
- Chapters are ~9-10 stages each. Chapter 1 has **10 stages**.
- Rivals are **personalities, not factions** - each rival is a character
  with readable tendencies; the *deck* expresses the faction being
  taught. (User ruling: "fighting a faction is boring.")
- **No card-ownership gating in this build.** All 63 heroes remain
  available everywhere; the collection/currency/pack economy is a
  separate later pass (currency is planned so the player can earn cards
  through campaign progression, but it ships later).
- Rewards for now: **lore only** (codex, dialogue, chronicle).

---

## 1. Framing story

When a legend's story ends, what remains is an **Echo** - and every Echo
walks the same road: a passage of trials between story and memory, held
by ten champions. At the road's end sits **Gilgamesh, the First Legend**
- the first person who ever refused to be forgotten - who judges whether
a new legend's story deserves to last.

The player leads a warband of echoes up the road. Each champion holds a
gate and teaches one truth a legend must carry. The Recruiter measures
you at the first gate; the trials grow harsher; the mid-road Warden
proves you can adapt; three drafters prove you can build; the Last
Guardian proves you can win with everything at once; and Gilgamesh
proves you deserve to be remembered.

Chapter 1 ends at the scales of the dead (Duat), and the gate behind
Gilgamesh's throne opens toward **Uruk** - seeding the Mesopotamian
faction for Chapter 2.

**Tone:** mythic, warm, a little wry. Short lines, strong images. Every
beat skippable, every beat collectible.

---

## 2. The stage map (LOCKED)

| # | Format | Introduces | Rival | Teaches |
|---|--------|-----------|-------|---------|
| 1 | Single Classic | **Grimmwood** | The Recruiter | The loop: energy, Basics vs Signatures, rows |
| 2 | Single Classic | **Camelot** | The Oathkeeper | Front row, Shields, Provoke |
| 3 | Single Classic | **Sherwood** | The Outlaw | Focus fire, kill priority, bodyguards |
| 4 | Single Classic | **Olympus** | The Anointed | Marks: setup -> consume |
| 5 | **Elite - Unabridged** | - | The Warden of the Mid-Road | Sets, sideboarding, board calls (exam on stages 1-4) |
| 6 | **Draft** | **Yamato** | The Trickster | Draft fundamentals, energy economy |
| 7 | **Draft** | **Roma** | The Strategist | Counter-drafting, kill engines |
| 8 | **Draft** | **Takamagahara** | The Chronicler | Value drafting, burn/cleanse/revive answers |
| 9 | **Elite - Unabridged** | - | The Last Guardian | Everything at once (deck from all 7 introduced factions) |
| 10 | **Unabridged** | **Duat** | **Gilgamesh, the First Legend** | The final exam: judgement, thresholds, closing |

Law of the map:
- Stages 1-4 introduce one faction each (Grimmwood + 3).
- Stages 6-8 introduce one faction each (+3 = 7 total).
- Stage 9 introduces nothing (exam on the seven).
- Stage 10 introduces the eighth and last (**Duat**).
- **Huaxia is NOT introduced in Chapter 1** (held for Chapter 2).
- Difficulty curve targets (win rate for a median player): stage 1 ~95%,
  stage 3 ~85%, stage 5 ~70%, stage 8 ~55%, stage 9 ~40%, Gilgamesh
  ~20-30%.

---

## 3. The cast

Rival personality is expressed ONLY through engine-friendly levers:
**deck composition, ban behavior, draft behavior, fielding behavior,
battlefield preference, and one gimmick printed on the stage card.**
No bespoke battle rules in Chapter 1 (the boss blessing, §5, is the one
scripted exception).

### Stage 1 - The Recruiter (Grimmwood)
- **Who:** the gatekeeper of the road. Warm, exacting, ancient. Fights
  you to *measure* you, not to beat you.
- **Deck:** Grimmwood 12 - a mirror of the player's starter deck.
- **Behavior:** honest bans (your two objectively strongest), balanced
  fielding, plays straight. Board: Colosseum.
- **Stage card gimmick:** "Plays it straight. Nothing hidden."
- **Extra:** carries the tutorial coach overlays (draft-free: teaches
  energy, Basics, Signatures, rows, end-of-round).

### Stage 2 - The Oathkeeper (Camelot)
- **Who:** a knight who has never broken an oath, and tells you exactly
  what his next one is before he swears it.
- **Deck:** Grimmwood core + Camelot teaching picks (Arthur-style
  shield/taunt line, Guinevere-style warding).
- **Teaches:** front-row law, Shields absorbing before HP, Provoke
  redirect + the pierce tax.
- **Behavior:** bans your biggest back-line threat; fields a taunt wall;
  weighted toward Narrow Pass / boards that reward the front line.
- **Gimmick on card:** "Nothing reaches your back line while he stands -
  go through him."

### Stage 3 - The Outlaw (Sherwood)
- **Who:** charming, insolent, and utterly fixated on your biggest gun.
- **Deck:** Grimmwood core + Sherwood teaching picks (Robin-style forced
  targeting, Gisborne-style execution, Little John-style guarding).
- **Teaches:** kill priority, focus fire, protecting key heroes, when to
  spend heals vs shields.
- **Behavior:** focus-fires your highest-ATK hero every chance; bans
  your best protectors; prefers Open Plains.
- **Gimmick on card:** "Always shoots your strongest legend. Bait or
  bury them."

### Stage 4 - The Anointed (Olympus)
- **Who:** a proud champion who anoints his prey before the kill and
  considers it courtesy.
- **Deck:** Grimmwood core + Olympus teaching picks (Apollo-style mark
  granting, Ares-style mark consuming, Zeus cycle).
- **Teaches:** two-step play - Mark setup, then consume; punishing
  ignored Marks.
- **Behavior:** telegraphed mark chains; prefers Mana Spring (energy
  banking lesson).
- **Gimmick on card:** "His Marks are a promise. Answer them or pay."

### Stage 5 - The Warden of the Mid-Road (Elite - Unabridged)
- **Who:** the road's first true test. Solemn, courteous, relentless.
- **Format:** first Unabridged - teaches the set system itself.
- **Deck:** built from the four taught factions (Grimmwood/Camelot/
  Sherwood/Olympus).
- **Teaches:** bans across a set, mandatory substitutions, loser-calls-
  the-board, adapting between games.
- **Behavior:** sideboards REACTIVELY (swaps answers to what beat them);
  board calls weighted by personality.
- **Gimmick on card:** "Three gates, one Warden. Adapt or fall."

### Stage 6 - The Trickster (Draft - Yamato)
- **Who:** a laughing drafter who treats the pool as a prank.
- **Format:** snake draft from a **curated 36-card pool weighted toward
  Yamato and energy-economy pieces** - chosen to suit the rival.
- **Teaches:** draft fundamentals (open/answer/hate-pick), burn cards,
  role caps; Yamato introduces energy economy (steal, refund,
  thresholds).
- **Behavior:** steals your synergy pieces, burns spite picks, snipes
  energy payoffs.

### Stage 7 - The Strategist (Draft - Roma)
- **Who:** cold, patient, already drafting against the deck you built
  in stage 6.
- **Format:** snake draft from a **curated pool weighted toward Roma**
  and kill-payoff pieces.
- **Teaches:** counter-drafting, kill engines, punishing setup.
- **Behavior:** reads your stage-6 deck (campaign state) and weights
  picks against it.

### Stage 8 - The Chronicler (Draft - Takamagahara)
- **Who:** a historian of dead legends who drafts for the long war and
  writes down everyone who disappoints them.
- **Format:** snake draft from a **curated pool weighted toward
  Takamagahara** and attrition pieces.
- **Teaches:** value drafting, burn/cleanse/revive answers, late-game
  comp planning.
- **Behavior:** drafts the curve, hoards answers, punishes one-trick
  pools.

### Stage 9 - The Last Guardian (Elite - Unabridged)
- **Who:** silent, dutiful, the last echo before the throne. The hardest
  skill check before Gilgamesh.
- **Format:** Unabridged. Deck drawn from **all seven introduced
  factions** - cross-faction synergy is the lesson.
- **Teaches:** cross-faction combo lines, full set mastery.
- **Gimmick on card:** "Every road has one gate that does not speak."

### Stage 10 - Gilgamesh, the First Legend (Unabridged - Duat)
See §5.

---

## 4. Rival names (draft - final copy pass later)

Working names; the lore copy pass (§6) finalizes them:
1. The Recruiter - **"Heralds"** keep no other name.
2. The Oathkeeper - **Corin** [OPEN].
3. The Outlaw - **Whistling Meg** [OPEN].
4. The Anointed - **Aurelion** [OPEN].
5. The Warden of the Mid-Road - unnamed by design.
6. The Trickster - **Kit** [OPEN].
7. The Strategist - **Veyra** [OPEN].
8. The Chronicler - unnamed pending copy.
9. The Last Guardian - unnamed by design.
10. **Gilgamesh, King of Uruk.**

---

## 5. Gilgamesh - the boss

- **Format:** Unabridged (best of 3). Three boards, loser calls next,
  mandatory substitutions - the player must beat the set, not one deck.
- **Faction introduced:** **Duat** - the scales, weighing, sentencing,
  execution. The campaign ends at judgement because the whole road is
  the underworld of forgotten stories.
- **The card:** one **bespoke, non-roster Gilgamesh card** leading a
  hand-built elite six (Duat core + custom picks). He lives in campaign
  data only - never in `EOL.factions`, never draftable, never in sim
  balance pools.
- **Kit sketch [OPEN - numbers in the balance pass]:** theme "He who saw
  the Deep" - kingship that outlasts: permanent growth per round
  survived + a judgement rider on low-HP targets (echoes the Duat
  execute threshold the player just learned). The fight is a race
  against his ramp.
- **Blessing:** one scripted boss rule (ROADMAP's "per-node board
  blessing"), expressed with existing battlefield-style keys so it stays
  symmetric-feeling and testable. [OPEN: exact blessing - candidate:
  Gilgamesh's side gains a small permanent boon each game of the set,
  rewarding closing fast.]
- **Story beat:** Gilgamesh is not evil. He tests whether your story
  deserves to last, because his own epic is the story of failing to
  escape death and choosing legend instead. Victory scene opens the
  gate toward Uruk (Chapter 2 seed).

---

## 6. Lore delivery (volume: HEAVY)

All lore lives inside the campaign. All of it skippable; all of it
collectible.

1. **Chapter intro scene** - the road, the echoes, why you walk it.
2. **Pre-fight dialogue** per stage (rival's voice establishes
   personality + telegraphs the gimmick).
3. **Mid-fight taunts** at key moments (first blood, first signature,
   set transitions in Unabridged stages).
4. **Post-fight dialogue** - win and lose variants (losing keeps lore:
   the rival's word on defeat sends you back to retry).
5. **Mid-chapter reveal** at stage 5 (what the road actually is).
6. **Stage 9 truth** (who the guardians are - echoes who chose to stay).
7. **Gilgamesh scenes** - pre-fight, per-game, ending.
8. **Codex pages** - one per defeated rival (3-6 lines + their plate).
9. **Chronicle card** - run-end recap artifact (stages, MVP, rounds),
   rendered even on a failed run.

Presentation: lightweight dialogue overlay (glyph/plate + name + line,
click to advance, ESC/skip button); codex lives inside the campaign
screen; no lore outside this mode.

---

## 7. Progression & persistence

- **Checkpoints:** progress saves per stage; a loss retries that stage.
  No run resets (teaching campaign; frustration is the enemy).
- **Persistence:** `localStorage` (`eol.campaign.v1`): highest stage
  unlocked, codex flags, chronicle history, seen-dialogue flags.
- **No ownership gating:** all 63 heroes available as today; the campaign
  does not lock or grant cards in this build. (Later pass: currency from
  campaign -> packs in shop -> more cards.)
- **Rewards:** lore only (codex + chronicle + dialogue).

---

## 8. Technical plan (reuse-first)

Existing machinery the campaign drives instead of replacing:
- `startPrep()` (bans + fielding) for Classic/Unabridged stages.
- `startDraft()` with a **seeded, curated pool** for stages 6-8 -
  `draftPool()` is replaced by the stage's own 36 when a rival supplies
  one.
- The shipped **Unabridged set system** (`setState`, fight card,
  roulette, mandatory subs) for stages 5/9/10 - the rival's board calls
  become **personality-weighted** instead of uniform-random.
- `draftAI` scoring with **per-rival weight overrides** (trickster /
  strategist / chronicler personas) and the stage-7 counter-draft
  reading the player's stage-6 deck from campaign state.
- `coachShow()` for stage-specific teaching overlays.
- `BATTLE().start({teams})` bypass already exists for fixed fights.

New pieces:
- `data/campaign-ch1.js` - chapter data: stage list, rival definitions
  (decks, ban profiles, draft pools, field weights, dialogue keys,
  coach beats), Gilgamesh card + elite six + blessing.
- `js/campaign.js` - run state, stage launch, persistence, rivalry
  behavior hooks, dialogue/codex/chronicle glue.
- Campaign node-map screen (replaces the disabled `mode-campaign`
  placeholder) - 10 plates, locked/unlocked/cleared states, codex entry.
- Dialogue overlay component (shared, skippable).
- Boss card injection at battle creation (campaign-only; never enters
  `EOL.factions`).

Sim & balance plan:
- Headless stage-by-stage soak (bot vs depth-4 reference) to tune each
  rival toward the §2 curve; difficulty comes from deck/bias/gimmick -
  **never from AI search depth** (DESIGN-Campaign finding: depth is not
  a usable difficulty dial).
- `sim/verify_all.js` stays green; campaign data is excluded from roster
  assertions (Gilgamesh is not a roster card).

---

## 9. Open items (tracked, not blocking)

1. Final rival names (§4).
2. Gilgamesh's exact kit numbers + boss blessing (§5) - balance pass.
3. Exact curated draft pools (36 ids each) for stages 6-8 - built with
   the personas, then sim-checked.
4. Dialogue copy itself (written in the lore pass).
5. Rival plates/art direction (reuse ra glyphs + faction plates first;
   bespoke portraits later).
6. The later economy pass: campaign currency -> shop packs -> card
   ownership (separate milestone; will revisit the "everyone owns all
   63" model when it lands).

---

## Appendix - why this shape (decisions log, 2026-08-05)

- Rivals with personalities beat faction gauntlets (user ruling).
- 10 stages; factions introduced at 1-4 and 6-8; stage 9 introduces
  none; Gilgamesh introduces Duat; Huaxia held for Chapter 2.
- Player deck: own collection, no gating this build; starter context is
  the Grimmwood deck (mirrored by the Recruiter).
- Rival decks are hand-built teaching lists (Grimmwood core + the
  specific cards that teach the stage's mechanic), not "best of faction".
- Formats: 1-4 single Classics; 5 elite Unabridged; 6-8 drafts with
  curated, persona-fitted 36-card pools; 9 elite Unabridged; 10
  Gilgamesh Unabridged.
- Checkpoints on loss. Lore-heavy. Lore-only rewards now, currency later.
