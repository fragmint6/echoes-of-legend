# Echoes of Legend — Development Roadmap
### Locked 2026-08-04, status updated 2026-08-05. Source: GAMEPLAY-S-TIER.md + user design rulings (this document is the law; the memo is history)

> **STATUS 2026-08-05.** Phase 1 (Unabridged) is **IMPLEMENTED and live
> in the client** for solo play — see the Phase 1 section for exactly
> what shipped. The roster has also grown **57 → 63 heroes** (Grimmwood
> expansion: Gingerbread Man, Evil Queen, Puss in Boots, Rapunzel,
> Goldilocks, Cinderella), so every "57-card" figure below reads as 63
> unless it is quoting a historical measurement.

User rulings that shape everything below:

1. **Unabridged (Bo3 + sideboard + loser-picks-board) ships — but never in
   Classic.** Classic stays single-game speed. In ranked, Unabridged only
   unlocks at a mid-ladder rank (new players play Bo1).
   (2026-08-05 rebrand: the system once called "The Set" is now
   **Unabridged**; it is still played in sets of games.)
2. **Trophy Forge is REJECTED.** Its replacement is **Faction Blessings**:
   ≥4 cards of one faction in your deck grants a faction-wide bonus.
   (Example from the user: 4+ Grimmwood → your debuffs last 1 round longer.)
3. **Legends Gauntlet ships as CHAPTERS.** Chapter 1 uses the current
   63-card roster and ends at **The First Legend** (chapter boss). New
   chapters arrive with each major card-pool expansion (~50 cards), so
   expansions become events.
4. **The Gauntlet is the game's ONLY lore vessel.** No lore anywhere else
   in the client. Therefore everything lore-shaped must be *excellent*:
   short, collectible, rewarded, skippable.
5. Everything else from the memo (Burn-to-Counsel, Wager, board
   objectives, ascension duplicates) is **PARKED** — see §7.

---

## Phase 1 — UNABRIDGED (best-of-3 war)  ✅ SHIPPED 2026-08-05 (solo)
**What is live in the client right now** (`js/play.js`, war-length toggle
on the solo launch screen):

- Single Battle / **Unabridged · Bo3** switch at match launch (solo only;
  the choice persists in `eol.war.length`).
- **Fight card**: 3 distinct battlefields rolled at set start and shown
  up front with their rules; a roulette spin reveals which hosts game 1.
- **Loser calls the next board** from the remaining slots; the unpicked
  leftover hosts the decider. (The bot currently calls at random — a
  board-read heuristic is Phase-1b polish.)
- **Bans happen once** before game 1 and persist set-wide.
- **Mandatory substitutions** between games (1-2 swaps); the identical
  six can never be fielded twice in a row, and a hero subbed OUT is
  locked out of the rest of the set (both sides play by the same law).
- First to 2 wins; result screen and set pill track the score.

**Scope** (locked): opt-in mode for solo-vs-bot and MP-unranked at ship;
ranked integration waits for the ladder (Phase 4). Classic untouched.
**Remaining Phase-1 work:** the MP wiring (Phase 1b) — all set state is
seeded-board compatible and nothing in it is solo-engine-tied.

**User adjustments, locked as law over the memo:**

- **Prep is OPEN-INFO, always, in every mode.** Both 12-card decks are
  shown; each side bans 2 of the OPPONENT's cards; only the 6-fielding
  is simultaneous-hidden (you never see their six until the battle
  starts). This is current behavior and must never change — in Unabridged
  it applies set-wide: bans happen once, before game 1, and persist for
  all games of the set.
- **Fight card = 3 battlefields revealed AT PREP START** (before bans),
  with game 1's board pre-designated, so both players ban AND field
  with full knowledge of all three boards. The loser of each game picks
  the next board from the remaining slots (they saw their options from
  the start); the last unpicked slot is the decider's board.
- **Substitution law: exactly ≥1 and ≤2 per between-games window —
  MANDATORY.** You may never field the identical six twice in a row;
  this is the combo-rotation rule. Swap heroes between your six and
  your bench (surviving 10 minus fielded six); formation is re-picked
  hidden each game.

---

## Phase 2 — FACTION BLESSINGS
**Law** (defaults to be confirmed at Phase-2 kickoff):

- Threshold locks at **draft end on the 12-card deck** — bans cannot
  strip your blessing (no feel-bad; rewards drafting, not luck of the
  ban rotation).
- **One active blessing max.** If your deck has 4+ of two factions, you
  choose which blessing to invoke at prep (a pick chip, not silent math).
- Blessings must **reward each faction's existing identity**, never raw
  stat padding — so mono-faction is a *flavour commitment*, not the
  dominant strategy (counter-design against meta homogeneity).
- Sim gate per blessing: forced-on A/B ≥1200 games vs baseline; accept
  only if avg-rounds shift ≤ ±1.0, first-kill conversion within ±5pp,
  draw rate not increased.

**Draft-pool consequence (hard requirement):** today the pool is a
per-role snapshot — 6 heroes per role drawn from the 63-card roster, 36
total (`draftPool()` in `data/_schema.js`) — so a faction's cards are
spread across roles and sighting 4 of one faction in a single draft is
still a coin flip you then must win picks for.
With blessings, the pool must guarantee **every faction puts ≥4 cards
into every draft** (e.g., 9×4 = 36 exactly, plus 2 featured factions at
5). This turns pack 1 into "which throne do I pledge?" — the intended
feeling. Tuning knob lives in `data/_schema.js draftPool()`.

**Seed designs** (Phase-2 kick-off material, identity-first):
| Faction | Identity | Blessing seed |
|---|---|---|
| Grimmwood | curses, debuffs | your debuffs last +1 round *(user's)* |
| Camelot | vows, wards | first ally death each battle shields the survivors |
| Olympus | sky, marks | your marks also drain 5 energy on sig |
| Roma | legion discipline | +DEF aura while your front line is intact |
| Huaxia | strategy, energy | your first sig each battle costs 15 less |
| Takamagahara | kami, radiance | cleansing also heals |
| Yamato | the duel | first kill each battle refunds 20 energy |
| Duat | death rites | every death (both sides) grants your survivors a decaying ward |
| Sherwood | tricks, steals | your steals/denials hit +1 extra where legal |

Capstone question (open): an **ascended tier at 6-of** (the whole
faction in your deck) — stronger second effect. Default: ship Phase 2
single-tier; decide capstone after meta data exists.

---

## Phase 3 — LEGENDS GAUNTLET, Chapter 1: "The Nine Thrones"
Chapter 1 = 10 nodes on the current 63-card pool. Boss: **The First
Legend** (canon vote pending — see §8).

- **Structure:** draft once at node 1 → fight → **2 stash swaps** between
  nodes (swap your pool) + no other run-modifiers → boss at 10 →
  Chronicle. One **Fate Rewoven** revive token earned mid-chapter.
- **Rivals have names, plates, taunts, and ONE readable gimmick**
  written on their node card. Gimmicks are biases a player can scout and
  exploit (Lady of Bans / The Swarm / The Mirror Sage / The Purist
  [no sigs either side] / The Undertaker / The Accountant / The Twins /
  etc. — seed list in memo §III).
- **Lore-as-loot:** each rival defeat unlocks their codex page (3–6
  lines, one relic illustration slot using existing plate art). Codex
  lives inside the Gauntlet only. Chronicle run-recap screen at run end
  (MVP, kills, rounds, a shareable artifact card) — every run, even a
  dead one, ends with something collectible.
- The existing "Campaign (placeholder)" tab is replaced for real.
- Bots are draftAI + bias knobs (weights, forced roles, spread) + a
  scripted per-node board blessing for the boss. Sims: verify_all stays
  green; boss win-rates get a difficulty curve check (target: node 3
  ≈ 85% for median player, node 9 ≈ 40%, boss ≈ 20–30%).

**Effort:** ~2–3 sessions once this is unblocked.

---

## Phase 4 — RANKED LADDER + THE LONG WAR
Unabridged enters ranked here, gated.

- 6 tiers, placements = 5 provisional games, MMR-lite (Elo-k on Bo1 sets:
  Bo3 counts double weight).
- **Unabridged unlocks at Tier 3 ("Gold" equivalent)** with an unlock
  ceremony: *"You have earned the Long War."* Below Tier 3: Bo1 ranked —
  new players learn single matches; veterans get the full war.
- Unranked MP keeps its Set opt-in from Phase 1. Classic never changes.
- The parked **Wager** merges here as the ranked stakes lever if wanted.

---

## Phase 5+ — EXPANSIONS & CHAPTER CADENCE
- Expansions (≈50 cards / new factions) ship **with** a Gauntlet
  chapter. Chapter 2's first new faction is canonically seeded by
  Chapter 1's ending (§8).
- Chapter bosses become the expansion's marketing face.

---

## 7. PARKED (do not build without sign-off)
Burn-to-Counsel (draft-burns become tactic cards) · The Wager standalone
(folds into Phase 4) · Board alt-win objectives (needs heavy per-board
sims) · Ascension duplicates (needs pool + draftAI pass) · Fate boons
(gauntlet-scoped mini-boons; ONLY if Chapter 1 runs feel reward-thin in
playtest, since trophies were vetoed globally).

## 8. OPEN CANON VOTES (pending user)
1. **Chapter-1 boss identity.** Proposal: **Gilgamesh, King of Uruk** —
   the literal first legend of recorded human story (Epic of Gilgamesh,
   ~2100 BC). He *is* "The First Legend"; Chapter 2 then introduces the
   Mesopotamian faction his chapter foreshadows.
2. Faction-blessing tiers: single-tier at 4+ (default) vs two-tier
   (4+ blessing, 6-of capstone).
3. Ladder tier names (Phase 4, no rush).

## 9. STANDING DEVELOPMENT LAW (every phase)
- `node --check` every touched JS file; CSS brace-balance 0; curl the
  :8000 server.
- `node sim/verify_all.js` green (1479 assertions as of 2026-08-05) before
  every handoff.
- Any rule that changes pacing runs the A/B harness at ≥1200 games/side
  with the tolerance gates from Phase 2 §law.
- Runbook `/home/user/art_prep/CONTINUE.md` gets a dated session entry
  after every work unit.
