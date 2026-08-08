# Campaign Mode - Chapter 1: "The Road of Echoes"
### Rev 7 - 2026-08-08. Supersedes rev 6 (same path; see git history).

> **REV 7 - every gate is playable.**
>
> - **All ten stages are implemented end-to-end** in `data/campaign-ch1.js`
>   (content) + `js/campaign.js` (glue): authored rival twelves everywhere
>   (R1), scripted sixes on stages 1-4 (§8 dial 2), personality ban
>   profiles (§9.11), draft personas + curated 36-card pools on 6-8,
>   authored fight cards on 5/9/10, pair grants + choice-shaped exam
>   grants (R8/R9), and Gilgamesh pinned + unbannable by hardcode (R5).
> - **The enablers landed in `js/play.js`:** `cfg.war` (positive format
>   control, §9.1), `cfg.fightCard` (the pinned-field/set short-circuit of
>   §9.2 is fixed - a war now ALWAYS runs `setBegin`), `cfg.botSix`
>   (§9.10), `cfg.botBanProfile` (§9.11), `pinned`/`unbannable` honoured in
>   `chooseSix`/`setBotSix`/the ban grid (§9.3), and `opts.pool` +
>   `opts.persona` on `startDraft` (§9.4).
> - **Dialogue moved to a bottom-anchored bar** (the centred modal covered
>   the screen and was rejected). Busts render the full 128x176 hero-art
>   frame at native scale, `image-rendering: pixelated`, fully inside the
>   bar. Rivals also **speak during the match** via a pointer-transparent,
>   self-expiring bark card front-and-centre under the HUD - lines queue,
>   honouring §6's law that blocking overlays are for pre/post-fight only.
> - **Gate I is fully scripted** (owner ruling 2026-08-08): no deck
>   picker (the starter twelve is the deck), the bans and the six are the
>   ledger's marked picks - enforced in `js/play.js` (`cfg.script`),
>   narrated by the tutor bubble (`js/campaign.js`), with round-boundary
>   lessons (basics, energy income, signatures, the round-4 ramp) riding
>   the bark queue via a `campaign.onBattleRound` hook.
> - **Coverage:** `sim/verify_campaign.js` (deck legality per §9.8, grant
>   curriculum, terrain wiring, pool constraints, boss flags + an engine
>   smoke with the boss on the board). `sim/verify_all.js` stays green.
> - Still open: difficulty soak against §8's curve targets (the `--teams
>   fixed` harness), codex/chronicle screens, and the economy pass that
>   makes tier-2 coin spendable.

> **REV 6 - the shell is on screen, and D1 is closed.**
>
> - **The chapter select exists and is reachable.** Clicking Campaign on
>   the mode grid opens a real view (`data-view="campaign"`, `index.html`)
>   with exactly one plate on it: *Chapter 1 - The Road of Echoes*. It is
>   deliberately **nonfunctional** - the plate acknowledges the click and
>   says it is not open yet. Nothing in the flow touches save state, the
>   roster or a battle. This is the route and the framing going up early
>   so they can be judged before ten stages of content are authored on
>   top of them.
> - **D1 is CLOSED** - by deleting the `POWER` table rather than
>   refilling it. See the resolution note at the top of §8.0. Every
>   tuning number in this document is unblocked, and §8's dial 1 is
>   valid for Duat for the first time.
> - **§9.1's format leak is half-closed.** Unabridged is now a
>   Classic-only format by law (`canBeSet()` in `js/play.js`), so a
>   stage - or a draft, which is what surfaced it - can no longer
>   inherit the player's global war-length toggle. The campaign still
>   needs the *positive* control (`cfg.war`) that item asks for.

> **REV 5 - [OPEN-A] and [OPEN-B] answered, plus a blocking defect found
> while answering them.**
>
> - **R8 - Faction Blessings STACK.** 4/4/4 grants three blessings.
>   `docs/ROADMAP.md:82` ("one active blessing max") is **stale and
>   superseded** - marked as such in that file. This promotes the pair-grant
>   curriculum from "harmless either way" to **required**. → §2, §7.3.
> - **R9 - There is no formal rotation.** "Ranked meta rotation" means the
>   balance meta shifting under patches, not a rotating legal pool. Tier-3
>   rewards therefore become **choice-shaped**, not card-shaped, and the
>   campaign inherits a **balance-patch maintenance duty**. → §7.2, §8.
> - **DEFECT D1 (blocking, and not a campaign bug).** *(Closed in rev 6.)*
>   `data/draft-ai.js`'s `POWER` table rates **51 of 63 cards**. All six **Duat** cards and six
>   of the twelve **Grimmwood** cards are missing, so `powerOf` returns
>   **0** - league average - for 19% of the roster, in Classic and Draft
>   today. Those two factions are precisely this chapter's **starter deck
>   and boss faction**. → §8.0, §9.0.

> **REV 4 - three further owner rulings, same day.**
>
> - **R5 - Force Gilgamesh into all three games by hardcode.** Don't teach
>   the AI to value him; just make him non-negotiable. **Accepted** - and
>   it is the better call, see §5. Law **L5 is downgraded** from a law to
>   an optional polish item.
> - **R6 - Campaign rewards must serve the whole game, not just the
>   campaign.** 1-2 fixed curriculum cards per stage, plus other reward
>   types - including cards relevant to **ranked meta rotation**. → §7.2,
>   and **[OPEN-A]** in §10.
> - **R7 - Faction Blessings correction.** Blessings are for competitive
>   deckbuilding, not campaign. **4 Grimmwood grants the same blessing as
>   12 Grimmwood**, so a mono deck is not advantaged - a 4/4/4 tri-faction
>   deck is. **Rev 3's "inverted curve" warning was wrong and is
>   withdrawn.** But it inverts into a real and sharper problem (§2), and
>   it collides with a locked ROADMAP rule (**[OPEN-B]**).

> **STATUS: DESIGN LOCKED.** The creative spine has been stable since
> rev 1 - ten stages, personality rivals, Gilgamesh at the end, heavy
> lore. Rev 2 fixed the mechanics against a code review. **Rev 3 folds in
> four owner rulings from 2026-08-05 (session 2)** and the empirical work
> they forced:
>
> - **R1 - Handpicked decks everywhere.** Every single-game and Unabridged
>   stage uses an authored rival 12. We may design around Gilgamesh being
>   pinned. → §4, §5, §9.
> - **R2 - Faction Blessings are a later, separate feature** (4+ cards of
>   one faction in your deck grants a bonus). Not in this chapter. → §2
>   naming note, §10.
> - **R3 - No leaving mid-set.** The Home lock stays. Rev 2's
>   recommendation to allow escape is **overturned**. → §9.9.
> - **R4 - The Grimmwood deck is granted at first boot**, not as a stage-1
>   reward, and **"player brings" is not fixed** - the player brings
>   whatever they own, with progression running through currency → packs.
>   → §7 (rewritten).
>
> R4 is the one with teeth. A fluid collection means rival decks can no
> longer be tuned against an assumed pool, so §7 introduces the **floor
> rule** and a **deterministic grant curriculum**, both derived from a
> keyword audit of the actual card data (§7.3).
>
> Open items are marked **[OPEN]** and listed in §10.

---

## 0. What the campaign IS

- The game's **lore vessel** - 99% of all lore lives here (standing
  ROADMAP law: no lore anywhere else in the client).
- A **teaching campaign**. Chapter 1 teaches the whole game, one thing at
  a time, wrapped in an intricate story with personality-driven rivals.
- Rivals are **personalities, not factions**. The character is the
  opponent; the *deck* expresses the faction being taught.
- ~9-10 stages per chapter. Chapter 1 has **10**.
- **Rewards are lore + one named card + currency** (§7). Currency is
  authored now and inert until the economy lands.

### The five laws

| # | Law | Why |
|---|---|---|
| L1 | **Terrain is always symmetric.** Stages pin an existing battlefield; no bespoke one-sided rules, ever. | `data/battlefields.js:35` makes symmetry a standing law; the entire balance methodology rests on it. |
| L2 | **Difficulty comes from decks, never from the AI.** Search depth and turn order are both banned as dials. | Measured: depth is non-monotonic; opener is now worth ~0-10pp, deck power ~67pp. See §8. |
| L3 | **One new system per stage.** Combat loop, then prep, then sets, then draft. | A first-ever fight that opens with a ban phase teaches nothing. |
| L4 | **Everything bespoke is a card, and every card is audited.** | The boss is data like any other hero, so `sim/audit_abilities.js` covers him. |
| **L5** | **Bespoke cards get hard guarantees, not AI hints.** Where a campaign card *must* appear, pin it by hardcode; do not rely on the bot valuing it correctly. | Rev 4 (R5). Rev 3 made AI registration a law; that was over-engineering. The scoring blindness in §5 is real, but the fix is a must-keep, not a tuned heuristic. Registration survives as optional polish. |

---

## 1. Framing story

When a legend's story ends, what remains is an **Echo** - and every Echo
walks the same road: a passage of trials between story and memory, held
by ten champions. At the road's end sits **Gilgamesh, the First Legend**
- the first person who ever refused to be forgotten - who judges whether
a new legend's story deserves to last.

The player leads a warband of echoes up the road. Each champion holds a
gate, teaches one truth a legend must carry, and - when beaten - **leaves
one of their own echoes behind to walk with you**. You arrive with one
faction's worth of stories and reach the throne carrying eight.

> That last sentence is no longer only flavour. As of rev 3 it is the
> **mechanical reward**: each stage grants one specific, named card from
> the rival's faction. See §7.2.

Chapter 1 ends at the scales of the dead (Duat), and the gate behind
Gilgamesh's throne opens toward **Uruk**, seeding the Mesopotamian
faction for Chapter 2.

**Tone:** mythic, warm, a little wry. Short lines, strong images. Every
beat skippable, every beat collectible.

---

## 2. The stage map (rev 3)

| # | Format | Floor collection* | Terrain (pinned) | Teaches | Rival | Grants on clear |
|---|--------|-------------------|------------------|---------|-------|-----------------|
| 1 | **Fixed six** (no prep) | scripted six | Colosseum | The battle loop: energy, Basics vs Signatures, rows, round flow | The Recruiter | coin |
| 2 | Classic | 12 (Grimmwood) | The Narrow Pass | **Prep itself** (bans + fielding), front row, Shields, Provoke + pierce tax | The Oathkeeper | 2× Camelot + coin |
| 3 | Classic | 14 | The Open Plains | Focus fire, kill priority, protecting your carry | The Outlaw | 2× Sherwood + coin |
| 4 | Classic | 16 | The Mana Spring | **Reading** Marks: setup → consume; energy banking | The Anointed | 2× Olympus + coin |
| 5 | **Unabridged** | 18 | fight card: Colosseum / Narrow Pass / Open Plains | **Sets + deck construction** - the first real build | The Warden of the Mid-Road | **choice of 2** + coin (larger) |
| 6 | **Draft** | curated pool (own 20) | The Energy Void | Draft fundamentals; energy economy | The Trickster | 2× Yamato + coin |
| 7 | Draft | curated pool (own 22) | The Blood Battlefield | Counter-drafting; kill engines | The Strategist | 2× Roma + coin |
| 8 | Draft | curated pool (own 24) | The Spirit World | Burn, cleanse and Silence - attrition and answers | The Chronicler | 2× Takamagahara + coin |
| 9 | **Unabridged** | 26 | fight card: Energy Void / Blood Battlefield / Spirit World | Cross-faction synergy; full set mastery | The Last Guardian | **choice of 2** + coin (larger) |
| 10 | **Unabridged** | 28 | fight card: The Legend's Trial / The Ancient Ruins / The Mirror Realm | Judgement, thresholds, closing a won game | **Gilgamesh** | 2× Duat + coin |

> \* **"Floor collection" is a guaranteed minimum, not a grant.** Per R4
> the player brings whatever they own; packs bought with currency sit on
> top of this number and vary per player. Every rival is tuned against the
> floor. See §7.1. Stages 6-8 are drafts, so the collection does not enter
> the fight - the number in parentheses is only what has accrued. Tier-3
> rotation rewards (§7.2) sit outside this column entirely.

### Changes from rev 2's table

- The "Player brings (pool N)" column is gone. It described a granted pool
  that R4 removed. What replaced it is a **floor**, which is a weaker but
  *true* guarantee.
- **Stage 8 no longer claims to teach revive.** Takamagahara contains
  **zero** revive effects (audited - §7.3). It is the burn / cleanse /
  Silence faction. Revive appears exactly once in the whole Chapter 1
  roster: `duat-isis`, at stage 10.
- **Stage 4 now says "*reading* Marks"**, because the player cannot cast
  one until they own the stage-4 grant. See §7.4.

### Why the terrain table looks like that

Every battlefield is used **exactly once as a lesson**, and the two exams
replay the ground the player has already walked:

- Stages 1-4 introduce four boards, each chosen to *reinforce the same
  lesson as the rival*: the Narrow Pass makes the front line matter while
  the Oathkeeper builds a wall out of it; the Open Plains punishes
  turtling while the Outlaw shoots your carry; the Mana Spring pays for
  the two-card Mark chain the Anointed is demonstrating.
- **Stage 5's fight card is three of those four boards.** The mid-road
  exam is fought entirely on terrain the player has been taught.
- Stages 6-8 introduce three more, each matched to its draft lesson:
  the Energy Void makes Yamato's economy bite, the Blood Battlefield pays
  Roma's kill engine, the Spirit World is a wall that only attrition
  (Takamagahara) gets through.
- **Stage 9's fight card is exactly those three.**
- **Stage 10 uses the three boards never yet seen** - the last three
  truths - and no exam follows, because Gilgamesh *is* the exam.

Ten boards, ten stages, nothing wasted, nothing bespoke.

> **Naming note (confirmed by R2).** Rev 1 called a stage's pinned board a
> "blessing". That word is **reserved**: Faction Blessings are a separate,
> later feature where holding **4+ cards of one faction** in your deck
> grants a bonus. The campaign must never use the word. Campaign stages
> **pin a battlefield** - existing vocabulary, no new concept.
>
#### Forward-compatibility with Faction Blessings (rev 4, R7)

**Rev 3 got this backwards and the warning is withdrawn.** It assumed a
bigger mono stack meant a bigger bonus. It does not: **4 Grimmwood grants
the same blessing as 12 Grimmwood.** A 12-card mono deck therefore buys
*one* blessing with all twelve slots, which is the **worst** rate in the
game. The efficient shape is 4/4/4 across three factions.

That does not make the campaign safe - it relocates the problem, and the
new one is sharper:

> **The floor player is shaped wrong for blessings.** The floor collection
> (§7.1) is Grimmwood 12 plus a thin spread of singletons - one card per
> faction across seven factions. That shape can reach **exactly one**
> blessing, ever, for the entire chapter, and the singletons contribute
> nothing. Meanwhile the authored rival decks at stages 5, 9 and 10 are
> cross-faction by design and will sit naturally at 4/4/4. When blessings
> ship, those three stages get **three blessings against your one** unless
> the grant curriculum changes shape.

**The fix is free if we do it now, and expensive later: grant in stacks,
not singletons.** R6 already allows 1-2 cards per stage. Spend that budget
so grants *accumulate toward fours* rather than sampling every faction
once. Concretely (see §7.3):

- Faction grants arrive as **pairs**, and each taught faction is granted
  across **two** stages, so a faction the player keeps investing in
  reaches 4.
- The two exam stages (5 and 9) grant a **choice of 2 from any taught
  faction** - which lets the player deliberately *complete* a four-stack.
  That is the deckbuilding lesson stage 5 already exists to teach, and it
  becomes the blessing tutorial for free when blessings land.

Two cheap defences on top:
1. Record the faction counts of every authored rival 12 in the stage data,
   so the re-tune is a data pass and not an archaeology dig.
2. Reserve **stage 5** (not stage 2) as the teaching beat for blessings
   when they land - it is the first stage where the player builds a deck
   at all, and therefore the first place a 4/4/4 decision is meaningful.

> **[OPEN-B] RESOLVED (R8): blessings STACK.** 4/4/4 grants three
> blessings. `docs/ROADMAP.md:82` ("one active blessing max… a pick chip,
> not silent math") is stale; it has been marked superseded in that file.
>
> Everything above is therefore **required**, not optional. Three further
> consequences follow:
>
> 1. **Rival decks at stages 5, 9 and 10 must be authored at 4/4/4 on
>    purpose**, with their faction counts recorded in the stage data. They
>    will pick up three blessings for free the day the feature lands; that
>    is fine and even desirable at the exams and the boss, but it must be
>    a deliberate authored fact rather than an accident of deck-building.
> 2. **The curated draft pools of stages 6-8 inherit ROADMAP's hard
>    requirement** (`ROADMAP.md:96`): with blessings, a pool must put **≥4
>    cards of every faction into every draft**. That constrains §9's
>    curated-pool options - see the revised note there.
> 3. **The draft AI will need faction-count awareness.** Today `value()`
>    has only a token `+0.6` "flavour clump" per same-faction ally
>    (`draft-ai.js:283`), which is nowhere near enough to make a bot chase
>    a four-stack. Not this chapter's problem, but it is the campaign's
>    rivals who will look stupid first, so log it against Phase 2.

#### Can the floor player actually reach 4/4/4? (yes, exactly)

Under stacking this stops being rhetorical, so here is the arithmetic for
a player who buys nothing:

| Source | Cards | Blessing reach |
|---|---|---|
| Grimmwood starter | 12 | **1 blessing**, guaranteed, from turn one |
| Each taught faction (stages 2,3,4,6,7,8,10) | 2 each | half a pledge - nothing on its own |
| Exam grants (stages 5 and 9) | choice of 2, twice | **completes two factions to 4** |

So the floor player lands on **Grimmwood 4+ plus two completed
four-stacks = three blessings**, exactly matching the authored 4/4/4
rivals. It is tight by design: every taught faction sits at 2 - a
half-pledge - and the two exam grants are the moment the player answers
ROADMAP's own question, *"which throne do I pledge?"* (`ROADMAP.md:98`).

The failure mode is a new player spreading both exam choices across four
different factions and completing nothing. That is a real trap, and it is
also the exact lesson stage 5 exists to teach - so when blessings ship,
the stage 5 coach beat must state the threshold plainly **before** the
choice is offered, and the choice UI should show the resulting counts.

### Law of the map

- Factions introduced at stages 2-4 and 6-8 (six), Duat at stage 10 (seven).
  Grimmwood is the start, not an introduction.
- **Huaxia is NOT in Chapter 1** (held for Chapter 2). Note it is also
  the highest-mean-POWER faction in the roster (+0.33), so holding it
  back is a balance convenience as well as a story one.
- Stages 5 and 9 introduce no faction. They are exams.
- **Chapter 1 structurally cannot teach `untargetable`** - it exists on
  exactly one card in the game and that card is Huaxia. It is a Chapter 2
  keyword. Do not write a stage card that implies otherwise, and think
  twice before giving it to Gilgamesh (he would be the chapter's only
  source, teaching a counter the player has never seen).

---

## 3. The agency ramp

L3 in practice. The player gains one *system* at a time:

| Stage | Player controls | New system |
|---|---|---|
| 1 | nothing but the fight | the battle loop |
| 2 | 2 bans + which 6 of 12 + rows | **preparation** |
| 3-4 | same, from a growing collection | - |
| 5 | **which 12** (deck builder), plus sets/sideboard/board calls | **deck construction + Unabridged** |
| 6-8 | draft picks | **drafting**, then counter-drafting |
| 9-10 | everything | - |

**Stage 1 skips preparation entirely** and uses the existing
`BATTLE().start({teams:{player,enemy}})` bypass (`js/battle.js:4222`).
That is the cheapest possible stage to build *and* the correct teaching
choice: a player's first-ever fight should not open with a ban phase.

**Stage 5 is where deck construction is taught.** Rev 1 never taught it -
the 12-card, max-4-per-role builder is an entire screen the campaign
ignored. By stage 5 the player owns at least 18 cards across four
factions and has a concrete reason to build: the exam. If they arrive
with no legal deck, the stage routes them to the editor rather than
shuffling randomly.

> Under R4 the ramp gains a second axis the player controls: **the shop**.
> That is deliberate but it is *not* a taught system in Chapter 1 - the
> campaign never requires a purchase (§7.1). Currency accumulates, packs
> are optional upside, and no stage card ever says "come back stronger".

---

## 4. The cast

Personality is expressed ONLY through: **deck composition, ban behaviour,
draft behaviour, fielding behaviour, board-call behaviour, and one gimmick
printed on the stage card.** No bespoke battle rules anywhere in Chapter 1.

Per **R1**, every rival's 12 is **handpicked**. Nothing is rolled. This is
already supported: `startPrep(cfg)` takes `cfg.enemy12` directly
(`js/play.js:815-816`), so authored rival decks need no new code. What
*is* missing is control over the enemy's **six** and **bans** - see
enablers §9.10 and §9.11.

**Stage 1 - The Recruiter** (Grimmwood). Warm, exacting, ancient. Fights
to *measure* you, not to beat you - which is also the mechanical excuse
for the ~95% target: he fields a **scripted, deliberately modest six**
from the mirror deck. (A true mirror against an equal bot is ~50%, not
95%. Rev 1's target and its "mirror of your starter deck" premise
contradicted each other; the scripted six resolves it.)
*Card:* "Plays it straight. Nothing hidden."

**Stage 2 - The Oathkeeper** (Camelot). A knight who tells you his next
oath before he swears it. Bans your best back-line threat, fields a
Provoke wall, wants the Narrow Pass and gets it.
*Card:* "Nothing reaches your back line while he stands - go through him."

**Stage 3 - The Outlaw** (Sherwood). Charming, insolent, fixated on your
biggest gun. Focus-fires your highest-ATK hero; bans your protectors.
*Card:* "Always shoots your strongest legend. Bait or bury them."

**Stage 4 - The Anointed** (Olympus). Anoints his prey before the kill and
considers it courtesy. Telegraphed Mark chains.
*Card:* "His Marks are a promise. Answer them or pay."
> **Balance flag, now unavoidable.** Olympus is the roster's *weakest*
> faction by mean POWER (-0.73; next lowest is Roma at -0.39). Rev 2 noted
> this as a tuning problem. Rev 3's keyword audit makes it a **forced**
> one: Olympus is the **only** Mark faction available in Chapter 1
> (Huaxia, the other, is held back). The stage cannot be swapped to a
> stronger faction without losing the Mark lesson entirely. Build this
> deck as Olympus **Mark engine + strong neutral support** and budget it
> as the most-tuned deck of stages 1-4. **[OPEN]**

**Stage 5 - The Warden of the Mid-Road** (Elite, Unabridged). Solemn,
courteous, relentless. Deck from the four taught factions. **Sideboards
reactively** - swaps in answers to whatever beat him.
*Card:* "Three gates, one Warden. Adapt or fall. **No retreat once it
begins.**"
> That last clause is a rules disclosure, not flavour - see R3 / §9.9.
> Stage 5 is the player's first-ever set, so it is where the no-escape
> rule must be stated plainly, in the stage card *and* a coach beat,
> **before** the roulette spins.

**Stage 6 - The Trickster** (Draft, Yamato). Treats the pool as a prank.
Steals your synergy pieces, burns spite picks, snipes energy payoffs.

**Stage 7 - The Strategist** (Draft, Roma). Cold, patient, claims to have
read your last war.
> **Correction carried from rev 2:** do **not** weight his picks against
> the player's stage-6 deck. The draft bot already counter-drafts against
> your *live* picks (`foeOpens` passes `draft.picks.you` as `foeTeam`,
> `js/play.js:2087`); aiming it at a deck the player is not using makes him
> measurably *worse*. Keep the fiction in the dialogue; optionally seed his
> *opening* pick weights from the stage-6 deck, then let the live signal
> take over.

**Stage 8 - The Chronicler** (Draft, Takamagahara). A historian of dead
legends who drafts the curve, hoards answers, and writes down everyone who
disappoints them. Burns you out and cleanses himself clean.

**Stage 9 - The Last Guardian** (Elite, Unabridged). Silent, dutiful, the
last echo before the throne. Deck spans all seven taught factions.
*Card:* "Every road has one gate that does not speak."

**Stage 10 - Gilgamesh.** See §5.

---

## 5. Gilgamesh - the boss

- **Format:** Unabridged. Three boards, loser calls the next, mandatory
  substitutions. The player must beat the *set*, not one deck.
- **Faction introduced:** **Duat** - the scales, weighing, sentencing.
  The road ends at judgement because the whole road is the underworld of
  forgotten stories.
- **The card:** one **bespoke, non-roster Gilgamesh** leading a handpicked
  elite twelve. Campaign data only - never in `EOL.factions`, never
  draftable, never in a balance pool. **But he IS in the correctness
  audit** (§9) **and he IS registered with the draft AI** (L5, below).

### He is unbannable AND pinned - by hardcode (R5)

R1 lets us author his whole twelve, which solves the *depth* problem: we
can guarantee the other eleven are strong enough that mandatory swaps
never need to reach him. It does **not** solve the *selection* problem.

**The ruling (R5) is to hardcode it, and that is right.** Two flags, both
hard, neither negotiable at runtime:

- `unbannable` - the ban grid makes every enemy tile clickable
  (`js/play.js:989`); there is no exemption concept. Without the flag the
  player simply bans the boss and fights his retinue.
- `pinned` - a **must-keep** injected before `chooseSix` picks and honoured
  as an untouchable in `setBotSix`'s swap path. He is seeded into the six,
  the AI fills the other five around him, and the mandatory 1-2 swaps are
  drawn from the remaining eleven.

The rest of this subsection is the *rationale* - why the hardcode is
required rather than a nice-to-have. Keep it: someone will eventually
propose deleting the flag in favour of "just make him a strong card."

> **Why a strong card is not enough.** The bot picks its six with
> `chooseSix` → `draftAI.value`, which is
> `powerOf(card) * 3.0 + structureScore + pairSynergy + rarity`
> (`data/draft-ai.js:276-289`). For a card outside `EOL.factions`:
> - `powerOf` returns **0** (`draft-ai.js:92-95`) - and 0 is the roster
>   *mean*, so the First Legend scores as a perfectly average hero;
> - `tags()` returns `{gives:{},wants:{}}` because `buildWeb()` only walks
>   `EOL.factions` (`draft-ai.js:107-110`), so **every `pairSynergy` term
>   involving him is zero** - he reads as synergy-dead with his own team;
> - only `rarity: 'legendary'` (+0.8) argues for him at all.
>
> No stat line fixes this, because the problem is not his stats - it is
> that the scorer has never heard of him. Consequence without the flag:
> the bot may not field its own boss in game 1, and `setBotSix`'s rebuild
> path explicitly "drop[s] the weakest old-timers" by ascending `ai.value`
> (`js/play.js:2597-2607`) - which is him - after which the set's lock-out
> law (`js/play.js:1336-1342`) benches him **for the remainder of the boss
> fight.**

**Blast radius, now measured:** `js/ai.js` does **not** reference
`draftAI` anywhere - the in-battle search scores engine states directly.
So the scoring blindness touches **fielding, banning and drafting only**;
combat play is unaffected. That is what makes R5 sufficient: pin the three
places he could go missing and nothing else cares.

**Optional polish (no longer a law).** Giving Gilgamesh a `POWER` entry
and letting the keyword web scan campaign cards would make the *other five*
slots synergy-aware of him, instead of chosen as though he weren't there.
Worth doing only if his supporting cast plays incoherently in soak. Under
R1 the twelve is authored, so the synergy is already baked into the deck
list - the AI is choosing from a pre-curated set, not discovering value.
**[OPEN - defer until stage 10 soaks]**

**Residual detail to decide once.** With `pinned` seeding him into the
six, the AI still chooses the other five with no synergy awareness of him
(see the polish note above). The alternative is to author **three fixed
sixes** - one per game of the set - which is fully deterministic and
maximally tunable, but throws away the reactive sideboarding that is the
entire reason stage 10 is Unabridged. **Recommendation: must-keep only,
let the AI fill.** Revisit only if soak shows incoherent support lines.

### His ramp is in his kit, not in the ground

Per L1 and the standing ruling, the terrain stays symmetric. Gilgamesh
gets his menace the same way every other hero does - **a strong card**:

- Theme "He who saw the Deep": kingship that outlasts. A `static` passive
  granting permanent stacking growth per round survived, plus a judgement
  rider on low-HP targets (echoing the Duat execute threshold the player
  just learned). The fight is a race against his ramp. **[OPEN: numbers]**
- This is not an asymmetry. Both sides play the same rules; he is simply a
  card, visible on the board, with a status chip the player can watch tick
  up. That is strictly better than a hidden field rule: it is legible,
  it is counterable, and it is covered by the existing audit.

### Three mechanical traps to design around

1. **The Legend's Trial only sees Actives.** The champion buff picks each
   side's most expensive **Active** signature and requires `cost > 0`
   (`js/engine.js`, champion block). A purely *passive* Gilgamesh would
   get nothing from his own signature board, and the buff would land on a
   support instead. If the Legend's Trial stays on his fight card, give him
   an **expensive Active** - or move the board. Decide deliberately; do not
   let the kit and the terrain quietly fight each other.
2. **Duat cannot field a front line.** Verified: Duat is Sniper 2 /
   Caster 2 / Medic 2 - **no Tank, no Bruiser, no Controller**. A "Duat
   core + custom picks" six has no front row, and `optimizeFormation` will
   shove Casters into slots 0-2. Under R1 this is now easy - his authored
   twelve simply includes the wall - but it must be authored *on purpose*.
3. **Duat holds the chapter's only revive** (`duat-isis`). If Isis is in
   his twelve, the boss fight is also the player's first-ever exposure to
   revive, in a best-of-three, with no prior lesson. Either accept that as
   the intended final twist (it is thematically perfect - the scales give
   life back) and telegraph it hard in the stage card, or leave her out.
   **[OPEN]**

### Story beat

Gilgamesh is not evil. He tests whether your story deserves to last,
because his own epic is the story of failing to escape death and choosing
legend instead. Victory opens the gate toward Uruk.

---

## 6. Lore delivery (volume: HEAVY)

All lore lives in the campaign. All skippable, all collectible.

1. Chapter intro scene - the road, the echoes, why you walk it.
2. Pre-fight dialogue per stage (voice + telegraphed gimmick).
3. **Mid-fight taunts** at key beats (first blood, first signature, set
   transitions).
   > **Vehicle:** use the existing `cine()` banner queue
   > (`js/battle.js:2563` - already self-throttles to 4 and honours
   > `gfx: low`) or `toast()`. A **blocking overlay mid-battle is wrong**:
   > it fights the animation queue, the `busy` gate, the background ponder
   > search and the auto-end-turn timer. Blocking overlays are for
   > pre-fight and post-fight only.
   >
   > **Under R3 this now extends between games of a set.** The gap between
   > game 1 and game 2 is the sideboard screen, not the map - so per-game
   > boss dialogue has to ride the result screen and the sideboard header,
   > never a "back to map" beat.
4. Post-fight dialogue, win and lose variants (losing keeps lore - the
   rival's word on defeat is what sends you back).
5. Mid-chapter reveal at stage 5: what the road actually is.
6. Stage 9 truth: who the guardians are (echoes who chose to stay).
7. Gilgamesh scenes - pre-fight, per-game, ending.
8. Codex page per defeated rival (3-6 lines + plate) **plus a line for the
   echo they leave behind** - the granted card gets its own beat, because
   under R4 it is the reward.
9. Chronicle card at run end - stages, MVP, rounds - rendered even on a
   failed run. MVP is computable from `EOL.onBattleEvent`
   (`js/engine.js:716`); note it is a **single global hook slot**, so
   campaign telemetry and any future consumer must share it.

---

## 7. Progression, persistence, and the collection (rewritten for R4)

- **Checkpoints:** progress saves per stage; a loss retries that stage. No
  run resets. This is a teaching campaign; frustration is the enemy.
- **Persistence:** `localStorage`, `eol.campaign.v1` - highest stage
  unlocked, codex flags, chronicle history, seen-dialogue flags, granted
  card ids, currency balance, and per-stage attempt/clear counts.

### 7.0 The starter deck moves out of the campaign

Per R4 the player has the Grimmwood twelve **from first boot**, because
without it there is nothing to fight the Recruiter with. So the grant does
**not** live in campaign code:

- Hook it into `js/deck.js`'s existing first-boot path. `load()` already
  handles "no `eol.decks.v1` key" by attempting a legacy migration
  (`js/deck.js:107-118`); add: if there is no stored deck list **and** no
  legacy squad, seed a real, named, editable **"Grimmwood"** deck from the
  twelve ids.
- **`js/campaign.js` must not be a dependency of this.** A player who
  never opens the campaign still needs a deck.

Grimmwood is the only faction that can legally *be* a deck by itself -
12 cards, **exactly 2 per role** (verified: Tank ×2, Bruiser ×2,
Controller ×2, Caster ×2, Medic ×2, Sniper ×2), inside the max-4 cap.
That is not a coincidence to rely on silently: **write it down in
`data/grimmwood.js`**, because someone will otherwise "balance" a card out
of it and break the game's first-boot state.

### 7.1 The floor rule

R4 replaces a known pool with a **distribution**. The player's collection
at stage *N* = Grimmwood 12 + deterministic stage grants + whatever packs
their currency and luck produced. Rival decks cannot be tuned against a
number that varies per player, so:

> **The floor rule.** Every stage is tuned to be clearable with the
> **floor collection** - the Grimmwood twelve plus the grants from stages
> already cleared - and nothing else. Packs are strictly upside. **The
> campaign never requires a purchase.**

Two consequences to hold onto:

- The **curve targets in §8 become a band**, not a point: floor ≈ target,
  well-stocked collection ≈ target + 10-15pp. State which end any soak
  number refers to.
- A player who hoards currency and a player who spends it must both have
  a clearable path. The floor guarantees the first; the second is
  self-solving (more cards is never worse).

### 7.2 The reward stack (rev 4, R6)

R6: the campaign is not the whole game, so its rewards must pay out into
the rest of it - ranked included. Three tiers, each doing a different job.
Only tier 1 is load-bearing for Chapter 1 shipping.

| Tier | Reward | Job | Determinism |
|---|---|---|---|
| **1** | **1-2 named cards** from the rival's faction | The **floor** and the **curriculum** - the player owns the tool before the stage that needs it | Fixed, authored, identical for every player |
| **2** | **Currency** | Player expression; feeds packs; the hook for the economy pass | Fixed amount, random spend |
| **3** | **Rotation-relevant rewards** | Makes clearing the campaign matter to a ranked player | Resolves against the *current* rotation, not a hardcoded list |

> **Their echo walks with you.** Tier 1 is already the framing story (§1),
> so the mechanic and the fiction are the same sentence. It beats "+150
> coins" on three axes: the floor stays authored and knowable, the reward
> is legible (a face and a name, not a number), and the grant list becomes
> the **curriculum**.

#### The one architectural law for tier 3 (revised by R9)

**[OPEN-A] RESOLVED:** there is no formal rotating legal pool. "Ranked
meta rotation" means **the balance meta shifting under patches** - which
cards are currently strong changes, the legal roster does not. That kills
the need for a rotation-resolution service and replaces it with something
simpler and stronger:

> **Anything meant to stay relevant is granted as a *choice*, never as a
> card id.** "Choose 1 of 3", a faction-choice pack, a wildcard - resolved
> **at claim time** against the live roster. A fixed card id is correct
> only for tier 1, where the point is teaching a specific lesson and
> staleness is impossible.

A choice reward is automatically meta-current with zero maintenance: when
a patch moves the meta, the reward moves with it because the *player*
resolves it. A card-id reward silently decays into a dead reward.

Convenient consequence: **tier 1 and tier 3 converge on one mechanic.**
The exam stages already grant "choice of 2" (§7.3) for blessing reasons;
that same primitive is the tier-3 payout. One thing to build, two jobs.

This keeps `data/campaign-ch1.js` permanently correct and lets tier 3 ship
*after* Chapter 1 without touching the stage data - the `grants` object
simply gains a key.

#### The farming question

Chapter 1 is finite (10 stages) but replayable. The moment tier 3 pays out
anything a ranked player wants, replay becomes a farm. Standing rule:

- **First clear** pays tiers 1-3 in full.
- **Replays** pay a reduced, capped tier 2 only. Tier 1 is idempotent by
  nature (you already own the card); tier 3 must be first-clear only or
  hard-capped per rotation.
- Store per-stage clear counts in `eol.campaign.v1` (already planned for
  the difficulty curve, §8) so this needs no new persistence.

**[OPEN-A]** - what "ranked meta rotation" means concretely (a rotating
legal pool? seasonal reward sets? something else?) determines tier 3's
shape. The law above holds under every reading, so §7.3 and the build
order are not blocked on it. See §10.

### 7.3 The curriculum is the grant list (keyword audit)

Effect-keyword coverage across the Chapter 1 factions, scanned from the
card data on 2026-08-05 (counts = cards carrying the effect):

| faction | n | mark | revive | silence | untarg | counter | taunt | shield | cleanse | burn | exposed | gainEnergy |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| grimmwood | 12 | . | . | . | . | . | 2 | 4 | 2 | 1 | 4 | 1 |
| camelot | 6 | . | . | . | . | . | 1 | 4 | . | . | 2 | 1 |
| sherwood | 6 | . | . | . | . | 1 | . | 2 | . | . | 1 | . |
| olympus | 6 | **3** | . | . | . | . | 1 | . | . | 1 | 1 | . |
| yamato | 6 | . | . | 1 | . | . | . | 1 | 1 | . | 1 | 1 |
| roma | 6 | . | . | 1 | . | . | . | 2 | . | . | 1 | . |
| takamagahara | 6 | . | **0** | 1 | . | 1 | 1 | 3 | 3 | 2 | 1 | 2 |
| duat | 6 | . | **1** | . | . | . | . | . | 1 | 1 | 3 | 2 |
| *huaxia (ch2)* | 9 | 4 | 1 | . | 1 | 1 | 2 | 3 | 1 | 1 | 1 | 1 |

Four findings that changed this document:

1. **Mark exists in two factions only: Olympus and Huaxia.** Huaxia is
   held for Chapter 2, so **Olympus cannot be swapped out of stage 4** -
   despite being the weakest faction. §4's balance flag is now a
   constraint, not a preference.
2. **Takamagahara has no revive.** Rev 2's stage-8 lesson was wrong and is
   corrected in §2.
3. **Revive appears once in the entire chapter** (`duat-isis`) and
   **`untargetable` appears zero times** (Huaxia only). Chapter 1 cannot
   teach untargetable at all; revive is a stage-10 surprise or nothing.
4. **The Grimmwood starter already covers the stage 1-5 vocabulary** -
   shield ×4, taunt ×2, cleanse ×2, exposed ×4, lifesteal ×3, burn,
   coinFlip, gainEnergy. The player can *play* every lesson through stage
   3 with the starter deck. The single gap is **Mark**, which is exactly
   what stage 4 grants.

Grant curriculum. Each **anchor** teaches the lesson; each **partner**
pushes that faction toward a four-stack (§2, R8) and pays the reward-feel
debt the anchor sometimes incurs. POWER shown as `(z)`; `?` = unrated,
see D1 (§8.0).

| After | Anchor - the lesson | Partner - the payoff | Why this pair |
|---|---|---|---|
| **2** Camelot | `king-arthur` Tank, taunt `(1.15)` | `lancelot` Bruiser `(1.75)` | The Oathkeeper's wall handed to you, plus the roster's 2nd-strongest card. Camelot's other four are all negative, so this pair is also the honest one. Tank+Bruiser = a front line the player can actually build. |
| **3** Sherwood | `robin-hood` Sniper, outgoingMult `(-0.61)` | `little-john` Tank, counterStrike `(0.17)` | Stage 3 is *protect your carry*. This is that sentence as two cards - the carry, and the man who punishes anyone reaching past him - and it is the Outlaw's own pair. |
| **4** Olympus | **`zeus`** Caster, mark + consumeMark `(-0.83)` | `ares` Bruiser, Mark payoff + burn `(-1.10)` | Zeus alone is the whole loop: *"if any enemies are Marked, deal 130% ATK…; otherwise Mark all enemies"* - sets on cast 1, consumes on cast 2. Ares then cashes the **same** Mark a second time, which is the combo lesson. ⚠ Both are weak in raw z: this pair raises *capability* while lowering *power*. Tune stage 5 against that, not against the card count. |
| **5** exam | **choice of 2**, filtered to taught factions | - | Completes one faction to 4. The deckbuilding lesson, and later the blessing tutorial. Must not offer Huaxia. |
| **6** Yamato | `minamoto-no-yoshitsune` Bruiser, gainEnergy `(0.44)` | `tomoe-gozen` Sniper, stealEnergy `(-0.48)` | Generation plus denial: the Energy Void board as a two-card package. *Power alternative if the floor needs propping: `benkei` `(1.90)`.* |
| **7** Roma | `julius-caesar` Bruiser, kill-chain `(-0.95)` | `brutus` Sniper, executes highest-ATK `(0.12)` | *"If this defeats the target, immediately strike the lowest HP surviving enemy…"* - the kill engine as a card, and Brutus chains off the same idea. **Not Cicero** `(-1.78)`, the roster's worst card and a miserable reward. |
| **8** Takamagahara | `amaterasu` Caster, dmg+burn+cleanse+heal `(0.32)` | `izanami` Controller, burn engine `(0.83)` | The burn the Chronicler just used on you, *and* the answer to it, in one grant. |
| **9** exam | **choice of 2**, filtered to taught factions | - | Second completion window, before the boss. |
| **10** Duat | `isis` Medic, revive + cleanse `(?)` | `anubis` Sniper, gainEnergy `(?)` | The chapter's only revive, granted by the scales at the end of the road. Anubis for role diversity, and because the judge of the dead is the right escort. Both unrated - D1. |

Floor arriving at stage 10 = **28 cards across 8 factions**, rising to 30
on the final clear.

**Role spread of that floor** (Grimmwood 12 is 2-of-each; grants add the
rest): Tank 4 · Bruiser 6 · Sniper 6 · Caster 4 · Controller 3 · Medic 3
= 26, plus 4 from the two exam choices = **30**. Comfortably inside
`MAX_PER_ROLE = 4` for any legal 12, with Controller and Medic the thin
spots - which is where the exam choices will naturally go, and a reason to
filter those choices by role as well as by faction.

> **Two of these grants are unrated cards** (`duat-isis`, `duat-anubis`)
> and **six of the twelve starter cards are too**. The curriculum can be
> authored on function, as above, but it cannot be *balanced* until D1
> (§8.0) is fixed.

### 7.4 What a fluid collection forbids

- **No lesson may require the player to *own* a tool.** Either the tool is
  in the floor by then, or the lesson is taught *defensively* (the rival
  uses it on you). Stage 4 is the worked example: it teaches **reading**
  Marks, because Zeus arrives only on the clear.
- **No stage card may promise a deck shape** ("bring two Medics"). The
  campaign nudges - it opens the editor and highlights the granted cards -
  it never gates on composition.
- **Ownership gating, when it lands, must respect the floor.** If the
  future shop hides unowned cards from the deck builder, the floor list is
  the whitelist. Write the floor into `eol.campaign.v1` as it accrues so
  the gate has something to read.

---

## 8. Difficulty: what actually moves the needle

### 8.0 DEFECT D1 - the tuning instrument is broken before we start

> **RESOLVED 2026-08-05, later the same day, by deleting the table.**
> The analysis below stands as written and is left intact, because it is
> the reasoning that justified the fix and because §8's authoring dial
> is defined in terms of it. What changed: `data/draft-ai.js` no longer
> has a `POWER` table to be incomplete. It works out how strong a hero
> is by **playing it** - one controlled duel per card against a squad of
> average bodies, run by the real engine under the real search AI - and
> caches the result under a fingerprint of the roster's stats and
> abilities. Coverage is 63/63 by construction and re-measures itself
> when a card changes.
>
> Consequences for this document, all of them good:
> - **§8's dial 1 is valid again**, including for Duat. Mean rating over
>   a fielded six now means something for every faction.
> - **Every `(?)` in §7.3's grant table is now a real number.** They are
>   not filled in here because the ratings are a *measurement*, not a
>   constant - read them with `node sim/rate_check.js` rather than
>   copying them into prose, which is how the original table rotted.
> - **§9.0 item 0 is done**, and its assertion exists:
>   `sim/verify_all.js` §F fails if the brain cannot rate a hero, and
>   `--probe` runs the real measurement end to end.
> - Rev 3's "-0.73 for Duat" style per-faction means were arithmetic on
>   missing entries and should be re-derived before use.
>
> Measured: the deleted table scored r=0.44 against a 2,000-game
> win-rate run with 13 cards blank; the replacement scores r=0.57 with
> 63/63 covered, and beats the old brain 55.2% ±4.1 over 600 drafted
> games.

Found while pricing the grant curriculum. **`data/draft-ai.js`'s `POWER`
table rates 51 of the roster's 63 cards.** The twelve missing:

| Faction | Unrated cards |
|---|---|
| **duat** | anubis, horus, maat, sekhmet, isis, nephthys - **all six** |
| **grimmwood** | gingerbread-man, evil-queen, puss-in-boots, rapunzel, goldilocks, cinderella - **six of twelve** |

`powerOf` returns **0** for an unknown id (`draft-ai.js:92-95`), and 0 is
the roster *mean* - so 19% of the game's cards are silently scored as
exactly league-average by everything that consumes the table:

| Consumer | Weight on `powerOf` | What breaks |
|---|---|---|
| `chooseBans` → `denyValue` | **×4.2** (`draft-ai.js:298`) | The bot never bans an unrated card and misjudges which of yours to take |
| draft picks → `value` | **×3.0** (`draft-ai.js:279`) | Unrated cards are passed over or taken at the wrong time |
| `chooseSix` (bot fielding) | ×3.0 | The bot benches unrated cards for rated mediocrities |
| `setBotSix` (sideboard) | ×3.0 | Unrated cards are the "weakest old-timers" that get swapped out |

**This is a live defect in Classic and Draft today, not a campaign
concern.** But it lands on the campaign with unusual force, because the
two affected factions are precisely this chapter's **starter deck
(Grimmwood)** and **boss faction (Duat)**:

- Stages 1-2 hand the player a twelve of which **half is invisible to the
  bot's ban AI** - and `chooseBans(cfg.player12, …)` is exactly what the
  Oathkeeper's characterisation depends on.
- Stage 10's boss six is Duat, **entirely unrated**. My §5 analysis of
  Gilgamesh scoring 0 is not a special case for a bespoke card - it is
  already true of his whole supporting cast.
- **§8's dial 1 is invalid where it matters most.** "Mean `powerOf` over
  the fielded six" silently reports 0.00 for these cards, so it would rate
  a Duat six as perfectly average by construction.
- It also **retroactively invalidates a number in rev 3**: the per-faction
  mean of +0.00 for Duat was not a measurement, it was six missing entries
  averaging to zero.

**Nothing catches this.** `grep POWER sim/*.js` returns nothing - no sim,
no assertion, no preflight check covers table coverage, which is why it
has sat.

**Fix (§9.0):** regenerate the table with `sim/full.js` (which already
measures the four per-hero numbers the methodology doc describes, and
whose own header still says "57 heroes" - another marker that it predates
the current roster), then add a `verify_all` assertion that `POWER` covers
`EOL.factions` exactly, so a new faction can never ship unrated again.

**Until D1 is fixed, no campaign stage can be tuned.** Every number in
§8 below is measured on fixed sixes through the engine, so those stand -
but the *authoring* dial does not.

### 8.1 Measured findings

Re-measured on the current engine (100 games/cell, Colosseum, depth 2,
seeded). **Rev 1 inherited a stale finding and it must not be reused.**

**Turn order is dead as a dial.** The archived doc's "~40pp for whoever
moves first" no longer holds - the engine has since gained alternating
openers by round, a symmetric round-1 signature lock, energy carry-over
and the comeback grant:

| Fixed mirror | Player WR |
|---|---|
| Six A, player opens odd rounds | 41.0% ±9.6pp |
| Six A, enemy opens odd rounds | 41.0% ±9.6pp |
| Six B, player opens odd rounds | 55.0% ±9.8pp |
| Six B, enemy opens odd rounds | 45.0% ±9.8pp |

**Deck power is alive and large:**

| Matchup | Player WR |
|---|---|
| strong six vs weak six (player opens) | 90.0% |
| strong six vs weak six (enemy opens) | 76.7% |
| weak six vs strong six (player opens) | 23.3% |

~67pp of range from composition alone.

### The three sanctioned dials

1. **Rival fielded-six power.** First-pass tuning uses mean
   `draftAI.powerOf` over the rival's **fielded six** (not their 12).
   **Blocked on D1** (§8.0) - the table is 12 cards short and both gaps
   sit in this chapter's key factions.
   Roster POWER is a z-score: mean 0.00, range -1.78 (Cicero) to +2.02
   (Spartacus). Then sim-verify.
2. **Bot fielding freedom.** Stages 1-4 use a **scripted six** (authored,
   deterministic, no `chooseSix` roll - needs enabler §9.10). Stages 5+
   let the bot field adaptively from its authored twelve, because a set
   without sideboarding is not a set. Difficulty and predictability move
   together.
3. **Terrain**, which is telegraphed on the stage card so the player can
   build for it. Symmetric terrain is still a difficulty lever *because
   the rival's deck is built for it and the player's may not be* - that is
   exactly the "changes what drafts well without handing either player an
   advantage" property battlefields already advertise.

Banned: **AI search depth** (non-monotonic - a *deeper* enemy made the
player win more) and **turn order** (now ~0-10pp).

### Curve targets - now a band (§7.1)

| Stage | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **at the floor** | ~95% | ~90% | ~85% | ~75% | ~70% | ~65% | ~60% | ~55% | ~40% | ~20-30% |
| well-stocked | ~95% | ~95% | ~90% | ~85% | ~80% | (draft - unaffected) | | | ~55% | ~35-45% |

Stages 6-8 are drafts from a curated pool, so the player's collection does
not enter - those three are the only stages whose difficulty R4 does not
touch. That is a quiet argument for keeping them where they are.

> **Maintenance duty, new in rev 5 (R9).** Because the meta shifts through
> balance patches rather than a rotation, and because this chapter is ten
> **fixed, authored matchups**, every balance patch is a potential
> campaign-difficulty regression - a nerf to one Camelot card can quietly
> move stage 2 from 90% to 70%. **Add the campaign soak to the
> balance-patch checklist**, alongside `verify_all`. Ten hand-tuned
> matchups are a standing liability the moment card numbers move; this is
> the cheapest possible insurance and it costs nothing to institute now.
>
> Two honesty notes. (a) An AI-vs-AI soak measures **bot** win rate, not
> **median player** win rate; pick one vocabulary and state which the
> numbers are in. (b) Log stage attempts/clears into `eol.campaign.v1` so
> the real curve is observable instead of assumed.
>
> **Also worth one cheap run before authoring:** Six A sat at 41% in a
> *true mirror in both directions*, hinting at a small residual seat bias
> independent of turn order (trigger sweeps run in `boardOrder`, which is
> side-ordered). Probably n=100 noise. A 1,000-game mirror probe is
> insurance against authoring ten fixed matchups on top of a real one.

---

## 9. Technical plan

### Reused as-is

- `BATTLE().start({teams, field, rng, oddFirst})` - stage 1 and every
  fixed fight (`js/battle.js:4222`).
- `startPrep()` - bans + fielding, stages 2-5, 9, 10. **`cfg.enemy12`
  already accepts an authored rival deck** (`js/play.js:815-816`), so R1
  needs no new code on this axis.
- The shipped Unabridged set system - `setState`, fight card, roulette,
  mandatory subs, and (per R3) its Home lock.
- `draftAI` scoring; the draft bot's existing live counter-draft signal.
- `coachShow()` for teaching overlays; `cine()`/`toast()` for mid-fight lore.
- `EOL.onBattleEvent` for chronicle/MVP telemetry.
- The in-battle **`btn-forfeit`** - see §9.9.

### Enablers that must land first (these are code, not glue)

Rev 1's §8 listed several of these as already working. They are not.

0. ~~**Complete the `POWER` table and assert its coverage (D1, §8.0).**~~
   **DONE 2026-08-05.** Not by completing the table - by deleting it. The
   brain measures the roster by playing it and re-measures itself when a
   card changes, so there is no artefact left to go stale. The coverage
   assertion asked for here exists as `sim/verify_all.js` §F, and it
   asserts more than was asked: finite and discriminating ratings for
   every hero, at most one hero exactly on the mean, live pair synergy,
   and that neither public score inflates with team size. `--probe`
   additionally runs the real measurement and asserts 63/63.

1. **`cfg.war: 'single' | 'set'` on `startPrep`.** Format is currently read
   from a *global user preference* (`warLength()`, `js/play.js:830`). Left
   alone, a player who toggled Unabridged on gets stages 1-4 as best-of-3
   sets with mandatory subs; toggled off, stages 5/9/10 become single games.

   **Partly addressed 2026-08-05** by `canBeSet(cfg)` in `js/play.js`:
   Unabridged is now a Classic-only format by law, so drafts and
   multiplayer can no longer inherit the toggle. That closes the leak
   but does not yet give a caller the *positive* control this item asks
   for - the campaign still needs `cfg.war` to force a format per stage,
   and `canBeSet` is the single place it belongs.
2. **Fix the pinned-field/set short-circuit.** Same line:
   ```js
   if (warLength() === 'set') cfg.field = cfg.field || setBegin(cfg);
   ```
   If `cfg.field` is truthy, `setBegin()` **never runs**, so `setState`
   stays null and the set silently does not happen. Campaign pins fields on
   every stage - so stages 5, 9 and 10 would quietly degrade to single
   games. `startPrep` needs `cfg.fightCard` (three boards) as a separate
   input from `cfg.field`.
3. **`unbannable` + `pinned` flags, hardcoded (R5).** `unbannable` is an
   exemption in the ban grid (`js/play.js:989`). `pinned` is a **must-keep**:
   seed the card into the six before `chooseSix` (`js/play.js:164`) picks
   the rest, and treat it as untouchable in `setBotSix`'s swap path
   (`js/play.js:2569`) so the mandatory 1-2 rotations are drawn from the
   other eleven. No heuristics, no scoring - a hard rule. See §5.
4. **`opts.pool` + `opts.seed` on `startDraft`** - it currently hardcodes
   `RULES().draftPool(flatten(), rnd)` (`js/play.js:1814`).
5. **Export `coachShow`/`coachHide`** - module-private today.
6. **Board-call weighting** for set stages - `setBegin()` and `setBotCall()`
   both roll uniformly.
7. **Campaign branch in `rematch()`** (`js/play.js:2620` routes only to
   Classic/Draft) plus Retry / Continue / Back-to-map on the result screen
   - **suppressed while a set is live** (§9.9).
8. **`deckRules.isLegal()` assert on every rival deck**, with a
   `verify_all` case. Ten hand-built lists is exactly where a typo'd 5th
   Sniper ships silently. Under R1 this covers *every* stage, so it is
   cheap insurance on the whole content layer.
9. **~~Decide the mid-set escape.~~ RESOLVED by R3: the lock stays.**
   `js/battle.js:4049` hides the Home button until the set is decided
   (`home.style.display = sr && !sr.over ? 'none' : ''`). Rev 2 recommended
   allowing escape in campaign sets; **that is overturned** - it kills the
   momentum and seamlessness of a match. Three things follow, and they are
   requirements, not notes:
   - **The exit already exists and must not be removed.** `btn-forfeit` is
     live in-battle (`js/battle.js:1856-1886`); forfeiting loses that game
     honestly and the set proceeds. That is a deliberate surrender, not
     walking away, and it is the correct pressure valve. Do not let a
     future "clean up campaign UI" pass hide it.
   - **`setState` is in-memory only** (`js/play.js:2174`) and is never
     persisted. A refresh or tab close destroys a live set silently. With
     no Home button that is now the *only* accidental exit, so make the
     rule explicit: **campaign progress commits on stage completion only.**
     An abandoned set is a no-op; the stage replays from game 1. No resume,
     no partial credit, no `beforeunload` prompt.
   - **Telegraph it at stage 5**, the first set the player ever plays -
     stage card line + coach beat, before the roulette. Being trapped is
     fine; being *surprised* by being trapped is not.
10. **`cfg.botSix`** - an authored enemy six that bypasses `chooseSix`.
    Required by §8 dial 2 for stages 1-4 and missing from rev 2's list.
11. **`cfg.botBanProfile`** - the bot bans via
    `chooseBans(cfg.player12, cfg.enemy12)` (`js/play.js:834`), which has no
    personality hook. §4 gives the Oathkeeper and the Outlaw distinct ban
    behaviour; without this they ban identically and the characterisation
    is fiction only.
12. ~~**Register bespoke cards with `draft-ai`.**~~ **Downgraded by R5** to
    optional polish - the must-keep in §9.3 is the guarantee. Verified that
    `js/ai.js` never references `draftAI`, so the blindness cannot affect
    combat play. Revisit only if stage 10 soaks show an incoherent support
    line around the boss. **Not a launch blocker.**
13. **Boot-time Grimmwood deck** in `js/deck.js`'s first-boot path (§7.0),
    with no dependency on campaign code.
14. **A collection + currency store (R6).** `eol.campaign.v1` holds granted
    card ids and a currency balance; `grants` is applied idempotently on
    first clear only, with per-stage clear counts driving the replay taper
    (§7.2). No ownership *gating* is required for this - the store can be
    written and read long before the deck builder starts respecting it.
15. **A choice-grant primitive (R6 + R9).** Simplified by [OPEN-A]'s
    answer: with no formal rotation there is nothing to resolve against, so
    this is not a rotation service - it is a **"choose N of a candidate
    set" reward**, resolved at claim time from the live roster. Stage data
    describes the *choice* (how many, filtered to which factions), never
    card ids. The two exam grants (§7.3) are the first consumer and tier-3
    rewards are the second, so **build it once for stage 5** and tier 3
    costs nothing later.

### New pieces

- `data/campaign-ch1.js` - stages, rivals (authored 12s, scripted sixes,
  ban profiles, curated draft pools, pinned boards/fight cards, dialogue
  keys, coach beats, `grants: {card, coin}`, faction counts per deck),
  Gilgamesh card + his authored twelve.
- `js/campaign.js` - run state, stage launch, persistence, rival behaviour
  hooks, dialogue/codex/chronicle glue, grant application.
- Campaign map screen (replaces the disabled `#mode-campaign`,
  `index.html:777`), dialogue overlay, codex, chronicle.
- Load order: `data/campaign-ch1.js` then `js/campaign.js`, both after
  `js/play.js`, plain `<script>` tags - **the game must keep running from
  `file://`.**

### Sim & balance

- **`--teams fixed`** (or `sim/campaign_soak.js`) - does not exist;
  `sim/sim.js` supports `random|draft|pairs` only. Needed before any stage
  can be tuned. Under R1 *every* stage is a fixed matchup, so this harness
  is now the primary tuning tool for the whole chapter, not a nicety.
- **The boss card goes IN the audit, not out.** `sim/audit_abilities.js:37`
  builds its list from `EOL.factions`; excluding Gilgamesh makes the single
  most bespoke card in the game the only one with no correctness coverage -
  and a hand-written stacking `static` passive is precisely the Lu Bu bug
  class the audit was written to catch. Exclude him from **draft and
  balance pools**; never from **assertions**.
- **Soak every stage twice: floor collection and stocked collection**
  (§7.1). One number per stage is no longer a complete answer.
- `sim/verify_all.js` stays green (1479 assertions as of 2026-08-05).

### Curated draft pools (stages 6-8) - the honest version

A pool "weighted toward Yamato" cannot guarantee it teaches Yamato:
Yamato is **6 cards**, at most 6/36 of the pool, and in a snake draft the
player can simply take them all. Also, `draftPool()` currently yields
exactly 6-per-role x 6 roles; a faction-weighted pool must still let *both*
sides build a legal 12 under max-4/role, or the cap-waiver fallbacks fire
routinely and the role-cap lesson stops being true.

Pick one and write it down: **(a)** reserve the faction's cards for packs
the rival opens, **(b)** duplicate-weight them, or **(c)** accept the draft
is generic and let the *rival's deck* teach the faction, as stages 2-4 do.
Rev 3 leans **(c)** for honesty and **(a)** where it is cheap. **[OPEN]**

> **R8 adds a hard constraint here.** With stacking blessings,
> `ROADMAP.md:96` requires that **every faction puts ≥4 cards into every
> draft pool** (9x4 = 36 exactly, plus featured factions at 5) - otherwise
> a drafter cannot pledge to a throne and the blessing system is dead in
> draft. A campaign-curated pool must satisfy that same rule, which rules
> out naive faction-weighting: you cannot over-stuff Yamato without
> starving another faction below 4. Option **(a)** survives this cleanly,
> **(b)** does not. Re-decide once Phase 2's `draftPool()` shape is fixed,
> and until then do not author 36-card lists that will need rebuilding.

---

## 10. Open items

**Blocking:**

- ~~**[D1] Complete the `POWER` table** (§8.0, §9.0). 12 of 63 cards
  unrated - all of Duat, half of Grimmwood.~~ **CLOSED 2026-08-05.** The
  table is gone; the brain measures the roster by playing it and
  `verify_all.js` §F asserts it can rate every hero. Stage tuning is
  unblocked, and §8's dial 1 is valid for Duat for the first time.

**Resolved this revision:**

- ~~[OPEN-A] what "ranked meta rotation" means~~ → **R9: no formal
  rotation**; it is the balance meta shifting under patches. Tier-3
  rewards become **choice-shaped**, §9.15 collapses into a choice-grant
  primitive shared with the exam stages, and the campaign picks up a
  balance-patch soak duty (§8).
- ~~[OPEN-B] do blessings stack~~ → **R8: yes.** `ROADMAP.md:82` marked
  superseded. Pair grants promoted from optional to required; floor
  reachability worked out in §2.

**Everything else:****Everything else:**

1. Final rival names (rev 1 §4's list stands; "The Recruiter - *Heralds*
   keep no other name" is a copy bug and needs rewriting).
2. Gilgamesh's kit numbers, and whether he carries an expensive **Active**
   so the Legend's Trial champion buff can see him (§5).
3. Whether `duat-isis` (the chapter's only revive) belongs in the boss
   twelve (§5, trap 3).
4. Curated pool strategy for stages 6-8 (§9) + the 36 ids each.
5. Stage 4's Olympus deck - weakest faction, and now **unswappable**
   because it is the chapter's only Mark teacher (§4, §7.3).
6. Final grant ids for stages 3, 7 and 8 (§7.3 table).
7. Currency rates and pack pricing - deferred with the economy pass, but
   the floor rule (§7.1) means the campaign is *correct* at zero currency,
   so this can slip without blocking anything.
8. Dialogue copy (lore pass).
9. Rival plates/art (reuse `ra` glyphs + faction plates first).
10. Reconcile with `ROADMAP.md` Phase 3, which still describes a different
    product (a roguelite: one draft at node 1, 2 stash swaps, a Fate
    Rewoven revive token, run ends at the boss) with the same difficulty
    targets. Mark it superseded by this doc, or fold it into Chapter 2+.
    **R2 unblocks the sequencing question**: Faction Blessings are
    explicitly later, so the campaign is *not* queued behind them - but
    §2's inverted-curve warning stands and the retune must be scheduled
    with them.

### Resolved in rev 5

- ~~[OPEN-A]~~ → **R9** (no formal rotation; choice-shaped tier 3).
- ~~[OPEN-B]~~ → **R8** (blessings stack; `ROADMAP.md:82` superseded).
- Grant curriculum **fully specified** - all anchors and partners named,
  role spread checked against `MAX_PER_ROLE`.
- **Found D1**, which is now the top of the build order.

### Resolved in rev 4

- ~~L5 / AI registration as a law~~ → **R5: hardcode the must-keep.**
  `js/ai.js` verified not to touch `draftAI`, so combat is unaffected and
  registration is optional polish (§5, §9.12).
- ~~Rev 3's "blessings invert the difficulty curve" warning~~ →
  **withdrawn (R7).** 4-of and 12-of grant the same blessing. The real
  risk is the opposite: the floor player's singleton spread can only ever
  reach one blessing. Answered by granting in **pairs** (§2, §7.3).
- ~~Grants are one card + coin~~ → **R6: a three-tier reward stack**
  (curriculum cards / currency / rotation claims) with a first-clear-only
  rule for tier 3 (§7.2).

### Resolved since rev 2

- ~~Mid-set escape~~ → **R3: the lock stays** (§9.9).
- ~~Ownership bridge / inert `grants:` faction unlocks~~ → **R4: Grimmwood
  at first boot, grants are named cards + currency, floor rule** (§7).
- ~~Rival deck authoring~~ → **R1: handpicked everywhere**, already
  supported by `cfg.enemy12` (§4).
- ~~"Blessing" naming collision~~ → **R2: the word is reserved**; the
  campaign says "pinned battlefield" (§2).

---

## 11. Build order (recommended)

0. ~~**§9.0 - fix D1.**~~ **DONE 2026-08-05.** Shipped on its own, as
   planned - the fix was to delete the table rather than refill it, and
   the coverage assertion is `verify_all.js` §F. Every tuning number in
   this document is unblocked.
1. **Enablers §9.1-9.15** + `--teams fixed` soak + the 1,000-game mirror
   probe. ~a day, and it de-risks everything after it. §9.13 (boot-time
   Grimmwood deck) can ship on its own immediately - it is a fix to the
   game's first-run state, campaign or no campaign.
2. **Vertical slice: stages 1-2** end-to-end - map screen, dialogue
   overlay, codex entry, two rivals, the first grant (`camelot-king-arthur`
   landing in the collection), real teaching beats. Playtest the *shape*.
3. **Gilgamesh as a card**, fought standalone, with full audit coverage and
   L5 registration, before the set wrapper goes around him.
4. **Then** author stages 3-10 as content.

The slice is where you find out whether ten stages of heavy lore is the
product you want - at the cost of two stages instead of ten.

---

## Appendix - decisions log

**2026-08-05 (rev 1):** rivals-as-personalities over faction gauntlets;
10 stages; factions at 1-4 and 6-8; stage 9 introduces none; Gilgamesh
introduces Duat; Huaxia held for Chapter 2; checkpoints on loss;
lore-heavy; lore-only rewards.

**2026-08-05 (rev 2), after code review:**
- Boss asymmetry rejected. **All terrain symmetric; a stage's terrain is a
  pinned battlefield.** Boss menace moves into his card.
- Gilgamesh **unbannable**, and **pinned** into all three set games.
- Chapter re-architected around a gated end-state, bridged by a granted
  starter deck and inert `grants:` data.
- **Agency ramp** made explicit; stage 1 loses the prep phase; **stage 5
  now teaches deck construction**, which rev 1 never taught.
- Stage 7's counter-draft corrected to use the live draft signal.
- Turn-order difficulty lever **retired** (re-measured: ~0-10pp, not 40pp).
- Boss card moved **into** the correctness audit.

**2026-08-05 (rev 3), owner rulings R1-R4 + keyword audit:**
- **R1** Every rival 12 is handpicked (`cfg.enemy12` already supports it).
  Added `cfg.botSix` and `cfg.botBanProfile` as the missing halves.
- **R1 follow-through:** found that handpicking does **not** keep Gilgamesh
  on the board - `powerOf` returns 0 and the keyword web is empty for
  non-roster cards, so his own AI rates him average and synergy-dead and
  `setBotSix` benches him as "weakest". Added **law L5** (register bespoke
  cards with the draft AI) alongside the `pinned` flag.
- **R2** "Blessing" is reserved for the later 4+-faction feature. Logged
  the **inverted-curve** risk: blessings will buff mono-faction early
  stages and skip cross-faction late ones. Stage 2 reserved as their future
  teaching beat.
- **R3** No leaving mid-set - the Home lock stays. `btn-forfeit` documented
  as the sanctioned exit; `setState` is not persisted, so **campaign
  progress commits on stage completion only**; stage 5 must telegraph it.
- **R4** Grimmwood deck granted at **first boot** from `js/deck.js`, not by
  the campaign. "Player brings" replaced by the **floor rule** (tuned to
  Grimmwood 12 + prior grants; the campaign never requires a purchase),
  grants become **one named card + currency**, curve targets become a
  **band**.
- **Keyword audit of all 9 factions** drove four corrections: Mark exists
  only in Olympus + Huaxia (so stage 4 is unswappable); Takamagahara has
  **no revive** (stage 8's lesson was wrong); revive appears once in the
  chapter (`duat-isis`) and `untargetable` zero times; the Grimmwood
  starter already covers the stage 1-5 vocabulary except Mark - which is
  exactly the stage 4 grant. Proposed the full grant curriculum, anchored
  on **`olympus-zeus`**, whose signature sets *and* consumes Marks by
  itself.

**2026-08-05 (rev 4), owner rulings R5-R7:**
- **R5** Gilgamesh is forced into all three games by **hardcode**, not by
  teaching the AI to value him. Law L5 rewritten from "register bespoke
  cards with the AI" to "**bespoke cards get hard guarantees, not AI
  hints**". Verified `js/ai.js` never references `draftAI`, so the
  scoring blindness is confined to fielding/banning/drafting and cannot
  affect combat - which is what makes the narrow fix sufficient. The
  `powerOf`-returns-0 analysis is **kept as rationale**, because it is the
  answer to "why not just make him a strong card?".
- **R6** Rewards restructured into three tiers: 1-2 fixed curriculum cards
  (the floor), currency, and **rotation-relevant rewards** so the campaign
  pays into ranked. Added the architectural law that a stage grants a
  **claim against the current rotation**, resolved at claim time, never a
  hardcoded card id - plus a first-clear/replay taper so the campaign
  cannot be farmed. New enablers §9.14 (collection + currency store) and
  §9.15 (rotation-resolution seam).
- **R7** Rev 3's inverted-curve warning **withdrawn** - 4-of and 12-of
  grant the same blessing, so mono decks are the *worst* rate, not the
  best. Replaced with the real risk: the floor player's one-card-per-
  faction spread can reach exactly one blessing all chapter while
  cross-faction rival decks sit at 4/4/4. Fix is free if done now - grant
  in **pairs**, and make the two exam stages grant **choice of 2** so the
  player can deliberately complete a four-stack. Blessing teaching beat
  moved from stage 2 to stage 5. Surfaced **[OPEN-B]**: this premise
  contradicts `ROADMAP.md:82` ("one active blessing max").
- Floor recomputed for pair grants: 12 at stage 1 → 28 at stage 10 → 30
  on the final clear.

**2026-08-05 (rev 5), [OPEN-A]/[OPEN-B] answered + defect D1:**
- **R8** Faction Blessings **stack**: 4/4/4 = three blessings.
  `ROADMAP.md:82` ("one active blessing max") marked **superseded** in that
  file. Pair grants promoted from "harmless either way" to **required**;
  worked the floor arithmetic and showed the no-purchase player lands on
  exactly three blessings (Grimmwood 4+ and two exam completions). Added
  the 4/4/4 authoring rule for rival decks, the `ROADMAP.md:96` ≥4-per-
  faction constraint on curated draft pools, and a note that `value()`'s
  `+0.6` flavour clump is far too weak to make a bot chase a four-stack.
- **R9** No formal rotation - "meta rotation" is the balance meta moving
  under patches. Tier-3 rewards become **choice-shaped, not card-shaped**;
  the rotation-resolution seam collapses into a **choice-grant primitive**
  already needed for the exam stages, so tier 3 costs nothing extra. Added
  a standing **balance-patch soak duty**: ten fixed authored matchups are a
  regression surface every time card numbers move.
- **DEFECT D1 (new, blocking).** `data/draft-ai.js`'s `POWER` table rates
  **51 of 63 cards** - all six Duat and six of twelve Grimmwood are
  missing, so `powerOf` returns 0 (the roster mean) for 19% of the game.
  It feeds ban valuation (×4.2), draft picks (×3.0), bot fielding and
  sideboarding, and **no sim asserts coverage**. Live defect in Classic and
  Draft; lands hardest on this chapter because the two gaps are exactly the
  starter deck and the boss faction. Retroactively invalidates rev 3's
  "Duat mean +0.00", which was six missing entries averaging to zero rather
  than a measurement. Fix and a `verify_all` coverage assertion added as
  **§9.0**, now first in the build order.
- Grant curriculum fully specified with named anchors and partners, POWER
  values, and a role-spread check against `MAX_PER_ROLE`.
