# Code review: `DESIGN-Campaign-Chapter1.md`

**Reviewer pass date:** 2026-08-05 · **Method:** read the engine, data, UI and sim
layers first, then the plan. Every claim below is checked against the code and
cites `file:line`. Two empirical probes were run (§7).

---

## 0. Verdict

**The creative design is strong and the reuse instinct is right. The technical
plan is optimistic in three specific places, and it inherits one balance
"finding" that is no longer true.**

Nothing here is a reason not to build it. But §8 of the plan reads as "we drive
existing machinery"; in reality **five of the six things it says it will drive
cannot currently be driven from outside `play.js`**, and one of them
(`warLength`) will actively corrupt the stage formats if left alone. Those are
small, cheap fixes — but they are code changes, not glue, and they should be
scoped as such before authoring 10 stages of content on top.

---

## 1. What the codebase actually is (context for the notes below)

- **63 heroes / 9 factions**, pure-data cards interpreted by a ~31-effect
  declarative engine (`js/engine.js`). Alternating **action**-level turns,
  round-1 signature lock for both sides, energy carry-over (60/80/100, cap 150),
  comeback grant (15/hero deficit), ATK ramp from round 4, fixed 1.5× crit.
- **10 battlefields**, all *symmetric by explicit law* (`data/battlefields.js:35`).
  The Colosseum is the balance benchmark precisely because it has no modifiers.
- **Bot** = depth-4 beam search + rollouts (`js/ai.js`); **draft brain** =
  `data/draft-ai.js` (measured per-hero POWER z-scores + keyword synergy web +
  structure + threat).
- **Modes shipped:** Classic, Draft, Online Classic/Draft, and **Unabridged**
  (best-of-3 set: 3-board fight card, loser calls the next board, mandatory 1–2
  substitutions, subbed-out heroes locked out for the set).
- **No economy.** `js/shop.js:3` — packs are *preview only*, the player already
  owns everything. **No ownership layer exists to gate against.**
- **No cloud save for content.** `js/auth.js:8` — accounts exist for matchmaking
  only; decks/settings/coach flags are `localStorage`.
- Runs from `file://` (plain `<script>` tags, no bundler). Test suite:
  `node sim/verify_all.js` → **1479 assertions, all green** (I ran it).

The plan's reading of the codebase is accurate. Good.

---

## 2. What the plan gets right

1. **Personalities over faction gauntlets.** Correct, and cheap: the levers it
   names (deck, bans, fielding, board preference) are all real and all already
   parameterised.
2. **One mechanic per stage, mapped onto real faction identities.** I checked
   each: Camelot→shield/provoke/exposed ✓, Sherwood→forced targeting +
   bodyguard + execute ✓, Olympus→mark apply/consume ✓, Yamato→energy
   drain/thresholds ✓, Roma→kill engine ✓, Takamagahara→burn/cleanse/revive ✓,
   Duat→weigh/sentence ✓. The teaching order is defensible.
3. **Grimmwood as the starter faction** is *mechanically forced and correct* —
   and the plan never says why. **Grimmwood is the only faction with 12 cards
   (2 per role), i.e. the only faction that can legally form a whole deck by
   itself.** That is load-bearing; write it down or someone will "fix" it later.
4. **Lore-only rewards for now.** Right call — there is no ownership layer, so
   any card reward would have to invent one.
5. **`localStorage` persistence.** Consistent with every other subsystem.
6. **"Difficulty must not come from AI search depth."** Still correct (see §7),
   even though the *reason* given for it has expired.

---

## 3. Blocking issues (fix before authoring content)

### 3.1 `warLength` will silently corrupt every stage format

`js/play.js:830`:

```js
if (!isMp && !cfg.setContinues) {
  setKill();
  if (warLength() === 'set') cfg.field = cfg.field || setBegin(cfg);
}
```

`warLength()` is a **global user preference** read from `localStorage`
(`eol.war.length`). Consequences as written:

- A player who has toggled Unabridged on in the Play menu gets **stages 1–4 and
  6–8 as best-of-3 sets**, complete with mandatory substitutions — destroying
  the entire teaching curve.
- A player with it off gets **stages 5, 9 and 10 as single games** — the Warden
  stage no longer teaches sets, and Gilgamesh is no longer a set boss.

**Fix:** `startPrep(cfg)` needs an explicit `cfg.war: 'single' | 'set'` that
overrides the preference. One line, but it must exist before any stage is
authored, because stage design assumes format.

### 3.2 The boss is bannable

Stage 10 is Unabridged, which means the **ban phase runs and the player bans 2
of the enemy's 12** (`js/play.js:989` makes every enemy tile clickable; there is
no unbannable concept anywhere in the codebase). A first-time player will ban
the biggest scariest card on the board — which is Gilgamesh. The final boss of
Chapter 1 can be deleted before the fight starts.

Also unhandled: the set's **lockout law**. A hero subbed out of the six sits out
the rest of the set (`js/play.js:1338`). If Gilgamesh must be fielded in all
three games, the bot needs a "must keep" concept — `setBotSix()`
(`js/play.js:2569`) has none, and its rebuild path can legitimately drop him.

**Fix:** a `card.unbannable` / `entry.locked` flag honoured in the ban grid and
in `setBotSix`. Small, but it is engine/UI surface, not campaign data.

### 3.3 The boss "blessing" is an engine change that breaks a standing law

§5 says the blessing will be "expressed with existing battlefield-style keys so
it stays symmetric-feeling and testable", then describes **"Gilgamesh's side
gains a small permanent boon each game of the set"** — which is by definition
asymmetric.

There is no side-scoped field key. `roundBuffs` applies to *every living unit*
(`js/engine.js:3831` → `boardOrder(B).forEach`), and `data/battlefields.js:35`
states the law: *"every effect is SYMMETRIC… the sim runs exclusively in the
Colosseum so hero win rates stay comparable."* Adding a one-sided field key
means (a) a real engine change, (b) a new asymmetric code path in the one system
the whole balance methodology assumes is symmetric.

**Recommendation:** put the asymmetry **on the card, not the field.** A bespoke
Gilgamesh passive (`trigger: 'static'` + per-round stacking `stat` effects) gets
you the identical ramp with **zero engine change**, is covered by
`sim/audit_abilities.js` automatically, renders as a visible status chip so the
player can *see* the ramp they are racing, and keeps the battlefield law intact.
This is strictly better on every axis.

### 3.4 `sim/verify_all.js` "stays green" is the wrong goal for the boss card

§8 says campaign data is *excluded* from roster assertions. But
`sim/audit_abilities.js:37` builds its target list from `EOL.factions` — so
excluding Gilgamesh means **the single most bespoke card in the game is the only
card with no correctness coverage**. The audit exists specifically to catch the
Lu Bu class of bug (trigger effects leaking into the `static` battle-start pass)
— exactly the failure mode a hand-written boss passive invites.

**Fix:** the audit should scan `EOL.factions` **plus** an opt-in campaign card
list. Exclude Gilgamesh from *draft pools and balance pools*, never from
*correctness assertions*.

---

## 4. Things §8 claims already work, that don't

| Plan says | Reality | Cost |
|---|---|---|
| "`startDraft()` with a seeded, curated pool" | `js/play.js:1814` hardcodes `RULES().draftPool(flatten(), rnd)`. No `opts.pool`, no `opts.seed` for solo. | small |
| "`coachShow()` for stage-specific overlays" | `coachShow` is module-private (`js/play.js:107`); `window.EOL.play` exports neither it nor `coachHide`. | trivial |
| "the rival's board calls become personality-weighted" | `setBegin()` (`js/play.js:2175`) rolls 3 boards from a uniform `rollBattlefield()`; `setBotCall()` (`js/play.js:2444`) picks uniformly. Both need a weight hook. | small |
| "`draftAI` scoring with per-rival weight overrides" | `draftAI` exports `value/denyValue/pairSynergy/powerOf/tags/structureScore` — **all weights are module-private constants**. There is no override surface at all. | medium |
| "stage 7 reads your stage-6 deck and weights picks against it" | The bot **already** counter-drafts against your *live* picks — `foeOpens()` passes `draft.picks.you` as `foeTeam` (`js/play.js:2087` → `draftPick(team, offered, foeTeam)`). Reading the stage-6 deck instead aims the counter-draft at a deck the player **is not using**, which makes the bot *worse*, not smarter. | design |
| "`BATTLE().start({teams})` bypass already exists" | ✅ True (`js/battle.js:4222`), and it also accepts `field`, `rng` and `oddFirst`. | — |

**On stage 7:** keep the flavour ("I have read your last war") in the *dialogue*,
but drive the actual picks off the live `foeTeam` signal that already works.
Optionally seed the bot's opening weights from the stage-6 deck — that gets you
both the fiction and a bot that isn't handicapped.

---

## 5. Gaps the plan doesn't cover

1. **Where does the player's deck come from?** §7 says "own collection, no
   gating". So a returning player can bring the strongest 12 in the game to
   stage 1, and a brand-new player may have **no saved deck at all**. Classic's
   fallback is a random shuffle (`startClassicDeck(null)`) — a random 12 as your
   introduction to a *teaching* campaign is bad. The archived doc's best idea
   was **granting a prebuilt faction deck on chapter completion**; the new plan
   dropped it. Bring it back, at minimum as a **pre-made Grimmwood starter deck
   handed to the player at stage 1** (it is a legal 12 by itself — see §2.3).

2. **Difficulty targets are unstable against an unbounded player deck.** "Stage
   1 ≈ 95%, Gilgamesh ≈ 20–30%" is not a property of the stage; it is a property
   of the *matchup*. With no gating, the player's side varies by ~65pp of power
   (measured, §7). Either constrain the player's deck per stage (recommended for
   1–4: hand them the teaching deck) or restate the targets as "vs. the intended
   deck".

3. **Post-battle routing.** `rematch()` (`js/play.js:2620`) routes only to
   Classic/Draft; `btn-result-home` goes to the main menu. A campaign battle
   ending will dump the player **out of the campaign**. Needs a campaign branch
   plus Retry / Continue / Back-to-map buttons.

4. **Mid-set escape.** `js/battle.js:4049` hides the Home button while a set is
   live — *"there is no walking away from the war"*. For a teaching campaign
   whose stated design value is *"frustration is the enemy"*, trapping a new
   player inside a 3-game boss set with no exit is the wrong default. Decide
   this explicitly.

5. **Mid-fight taunts need the right vehicle.** A blocking dialogue overlay
   during battle will fight the animation queue, the `busy` gate, the background
   ponder search and the auto-end-turn timer. Use the **existing `cine()` banner
   queue** (`js/battle.js:2563` — it already self-throttles to 4 and respects
   `gfx: low`) or `toast()`. Reserve the blocking overlay for pre/post-fight.

6. **Curated draft pools are not guaranteed to teach their faction.** Stage 6's
   pool is "weighted toward Yamato" — but Yamato only has **6 cards**, so at most
   6/36 of the pool, and in a snake draft **the player can take all of them**.
   The stage's promise ("introduces Yamato") can simply fail. Also, `draftPool()`
   currently guarantees 6-per-role × 6 roles = exactly 36; a faction-weighted
   pool must still let *both* players build a legal 12 under max-4/role, or the
   cap-waiver fallbacks (`anyLegalForYou`, `draftPick`'s `legal.length` escape)
   fire routinely and the role-cap lesson stops being true.
   *Fix:* reserve the faction's cards for the packs the **rival opens**, or
   duplicate-weight them, or teach the faction in the pre-fight dialogue and
   accept the draft is generic.

7. **No fixed-team sim mode exists.** §8's "headless stage-by-stage soak" has no
   harness: `sim/sim.js` supports `--teams random|draft|pairs` only. You need a
   `--teams fixed` (or a `sim/campaign_soak.js`) that loads campaign stage data.
   Also worth stating: an AI-vs-AI soak measures *bot* win rate, not *median
   player* win rate — the §2 targets are stated in human terms and the two are
   not the same number. Pick one vocabulary.

8. **Deck legality is never validated on the enemy side.** `startPrep` accepts
   `cfg.enemy12` as-is; nothing runs `deckRules.isLegal()` on it. Ten hand-built
   rival decks is exactly the situation where a typo'd 5th Sniper ships silently.
   Add an assert (and a `verify_all` case).

9. **Roster shape constrains two stages.** Verified counts:
   `takamagahara` = Caster 2 / Controller 2 / Medic 1 / Tank 1 (**no Bruiser, no
   Sniper**); `duat` = Sniper 2 / Caster 2 / Medic 2 (**no Tank, no Bruiser, no
   Controller**). Gilgamesh's "Duat core + custom picks" therefore has **no front
   line** unless the custom picks supply one — `optimizeFormation` will shove
   Casters into the front row. That is a real fight-design constraint, not a
   detail.

10. **The plan and `ROADMAP.md` describe different products.** ROADMAP Phase 3
    ("The Nine Thrones") is a **roguelite**: one draft at node 1, 2 stash swaps
    between nodes, a Fate Rewoven revive token, run ends at the boss. The new
    plan is a **checkpointed teaching campaign** with per-stage formats and
    retry-on-loss. Both are live documents with the same difficulty targets. Also,
    ROADMAP sequences **Phase 2 (Faction Blessings) before Phase 3** — blessings
    would change deck-building fundamentally and would need their own teaching
    stage. Reconcile the two docs, or explicitly mark ROADMAP Phase 3 superseded.

---

## 6. Smaller notes

- §2 note "difficulty curve targets (win rate for a median player)" — no
  instrumentation exists to measure a median player. Consider logging
  stage attempt/clear counts to `eol.campaign.v1` so the curve is observable.
- §4: "The Recruiter — *Heralds* keep no other name" is unparseable. Copy bug.
- §6.9 Chronicle "MVP" is computable from `EOL.onBattleEvent` `dmg`/`heal`
  events (single global slot, `js/engine.js:716`, currently unused in the
  browser and correctly suppressed for AI-search clones). Good — but note it is
  *one* slot, so campaign and any future telemetry must share it.
- Load order: `data/campaign-ch1.js` before `js/campaign.js`, both after
  `js/play.js`, all as plain `<script>` tags (the game must keep running from
  `file://`).
- Effort: `css/style.css` is 20,313 lines and every screen in this game is
  heavily bespoke. A map screen + dialogue overlay + codex + chronicle is four
  new surfaces. ROADMAP's "~2–3 sessions" looks light by a wide margin.

---

## 7. Measured: one inherited "finding" has expired

The plan inherits the archived doc's difficulty findings as still-true. One of
them is not. I re-ran it against the current engine.

**Claim (archived doc §2):** *"In a fixed-team mirror, whoever moves first wins
~90% of the time… first-mover advantage swamps AI quality… a ~40pp lever."*

**Measured now** (100 games/cell, Colosseum, depth 2, seeded):

| Fixed mirror | Player win rate |
|---|---|
| Six A, player opens odd rounds | 41.0% ±9.6pp |
| Six A, enemy opens odd rounds | 41.0% ±9.6pp |
| Six B, player opens odd rounds | 55.0% ±9.8pp |
| Six B, enemy opens odd rounds | 45.0% ±9.8pp |

**Opening the round is now worth ~0–10pp, not ~40pp.** That is expected: since
that measurement the engine gained alternating openers by round
(`firstMover`), a round-1 signature lock applied to *both* sides
(`FIRST_MOVER_BASIC_ROUNDS = 1`), energy carry-over and the comeback grant.

Two consequences:

1. **"Who opens" is no longer a meaningful difficulty dial.** Do not plan around
   it. (The plan doesn't — but it also doesn't say the old doc is stale, and the
   old doc is cited as authoritative.)
2. **Roster/deck quality still is.** Same harness, fixed asymmetric teams:

| Matchup | Player win rate |
|---|---|
| strong six vs weak six (player opens) | 90.0% |
| strong six vs weak six (enemy opens) | 76.7% |
| weak six vs strong six (player opens) | 23.3% |

~67pp of range from deck composition alone. **The plan's core thesis —
difficulty comes from the rival's deck — is confirmed.** Just re-derive the
per-stage numbers; don't reuse the old table.

Side note worth a dedicated check: Six A sits at 41% in a *true mirror* in both
directions, which hints at a small residual seat bias independent of turn order
(trigger resolution runs in `boardOrder`, which is side-ordered). Probably
noise at n=100, but a 1,000-game mirror probe would be cheap insurance before
authoring fixed matchups against it.

---

## 8. Suggested sequencing

The plan is a big-bang: 10 stages × (deck + dialogue + coach beats) + 4 new UI
surfaces + boss card + 3 curated pools + a new sim harness. Recommend a vertical
slice first, in this order:

1. **Enablers (code, ~small):** `cfg.war` on `startPrep`; `opts.pool`/`opts.seed`
   on `startDraft`; export `coachShow`/`coachHide`; campaign branch in
   `rematch()`; `unbannable` flag; `isLegal()` assert on rival decks.
2. **`--teams fixed` soak + a 1,000-game mirror probe.** Get the measuring stick
   before authoring anything against it.
3. **Slice: stages 1–2 end-to-end** — map screen, dialogue overlay, codex entry,
   two rivals, real teaching beats. Playtest the *shape*.
4. **Boss card as a card** (§3.3) with full `audit_abilities` coverage, fought
   standalone, before the set wrapper.
5. **Then** author 3–10 as content.

Steps 1–2 are perhaps a day and de-risk everything after them. Step 3 is where
you find out whether "10 stages of heavy lore" is the product you want, at the
cost of two stages instead of ten.

---

## 9. Bottom line

Ship this design. Before you author content:

- fix `warLength` leakage (§3.1) — it silently breaks stage formats;
- make the boss unbannable (§3.2);
- move the boss blessing onto the card (§3.3) — better *and* cheaper;
- audit the boss card rather than excluding it (§3.4);
- decide the player's starting deck (§5.1) — the campaign currently has no
  answer for "new player, no deck";
- re-derive the difficulty numbers (§7) — the old table no longer describes this
  engine.

Everything else is scope honesty rather than error.
