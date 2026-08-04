# Echoes of Legend — From 8/10 to 10/10
### Gameplay memo, 2026-08-04. The question: what makes strangers try it and veterans stay.

Everything below is GAMEPLAY. No new art, no sound, no modes-as-ornament.
Each idea is grounded in systems that already exist (draft, bans, hidden
prep, 60/80/100 energy, ramp-at-4, 10 boards, 9 factions, the sim harness),
so nothing here asks for a new engine.

---

## 0. The diagnosis — why is it 8/10 and not 10/10?

Watch a full session honestly:

1. **Draft (2 min):** real decisions. Snake openers, burns, hate-picks. Good.
2. **Prep (1 min):** 2 blind bans + front/back fielding + board read. Good.
3. **Battle (2–3 min):** you make **zero** decisions. You watch the machine.
4. Match ends. Menu. Next match: same 57 cards, same bot, same rules.

Three structural flaws follow from that shape:

**A. The decision-per-minute curve is L-shaped.**
All agency is front-loaded; the payoff phase is pure spectate. When the
fight goes badly you feel cheated ("the RNG"), not outplayed — because you
literally could not have done anything. The benchmark competitive
auto-battler (Mechabellum) wins its audience precisely by keeping a
decision layer alive between rounds; the benchmark PvE ones (The Bazaar,
The Last Flame, Astronarch) keep it alive between *runs*.

**B. All variance is RNG; none of it is constructed.**
Match 40 feels like match 1 because the only differences are dice.
"No two games alike" in S-tier games never comes from card RNG — it comes
from RULES THAT CHANGE PER RUN (relics, quests, trinkets, augments).
The cards are fixed; the war mutates.

**C. Opponents have no personality, matches have no plot.**
One anonymous bot, one game, one result. No adaptation, no revenge arc,
no stakes lever. Every serious versus game derives its drama from *set
structure* (best-of-N with information leaking between games). We throw
that narrative engine away by playing single-game matches.

**The genre data point nobody can ignore:** async-PvP and PvE-roguelite
auto-battlers dominate the genre now (The Bazaar, Super Auto Pets, The
Last Flame) because run structure is the cheapest source of unlimited
variety a small team can build ([r/AutoBattler, May 2026](https://www.reddit.com/r/AutoBattler/comments/1tqjaie/looking_for_autobattlers_to_play/)).
PvE roguelite + trophies is exactly the shape of our existing content.

Everything below attacks A, B, or C. Nothing is cosmetic.

---

## THE BIG THREE (this is where 8→10 lives)

### I. THE SET — best-of-3, information leaks between games
*Attacks A and C. The cheapest drama multiplier on this list.*

A match stops being one game. It becomes first-to-2.

- **Game 1:** exactly as today — blind bans, blind fielding.
- **Reveal:** both sixes are shown post-game (they already are, visually,
  on the board — so this costs nothing and leaks nothing new).
- **Between games:** each side may **sideboard up to 2 heroes** from their
  surviving 12 (banned stay banned); front/back formation is re-picked.
  The **loser picks the battlefield** for game 2 from a 3-board "fight
  card" revealed at match start.
- **Game 3 (decider):** each side swaps only 1; the board is the one
  remaining unused board. Symmetric information, maximum mind-game.

What it buys:

- **Adaptation as a skill.** "He fields double-striker backline — I
  sideboard the taunt wall." Suddenly your 12-card deck is a *sideboard
  arsenal*, and draft priorities change forever (you now draft answers,
  not just a plan). The draft gets DEEPER without changing one card.
- **Narrative shape.** Every match has Act I (probe), Act II (adapt),
  Act III (decider). "I lost g1 blind and reverse-swept" is a story a
  player RETELLS. Retold stories are the only marketing that matters.
- **Comeback lever.** Losing g1 earns board choice: a real, mechanical
  rubber-band that keeps dead matches alive and Bo3s tense.

Cost: prep-flow orchestration + set state + a between-games screen.
Battle engine: untouched. Sim: pacing check only (mind games aren't
simulable, and don't need to be). MP-compatible by construction.

Effort: ~1 session for the flow, ~1 for screens/UX. **Do this first.**

---

### II. TROPHY FORGE — run-modifiers that rewrite the rules of war
*Attacks B. The replayability engine.*

After a victory (in a set, or per campaign node), you pick **1 of 3
Trophies**. A trophy is a global rule modifier for YOUR war, stacking
with cards. ~36 launch trophies, all composed from effect kinds the
engine ALREADY has (shield, mark, burn, silence, revive, energy,
costMod, healMod, damageMult, taunt…). Examples in four rarities:

**Fieldcraft (common)**
- *Standard Bearer* — your frontline opens at +5 DEF.
- *Field Surgeons* — the first heal each battle splashes 25% to a second ally.
- *Entropy Tap* — your opener refunds 10 energy on cast.

**Legendcraft (rare)**
- *Ashes to Ashes* — your marks ignite: marked enemies burn.
- *Second Wind* — your first death each battle revives at 25% (as a
  ghost with cleanse, one per battle — engine has `revive`).
- *Cheap War* — round 4+, all your sigs cost 15 less.

**Kingly (epic)**
- *High Ground* — your backline is untargetable until your frontline falls
  (`untargetable` exists).
- *Blood Treasury* — gain 8 energy whenever an enemy dies.
- *Mirror Ward* — the first enemy sig each battle is reflected to a
  random enemy (reroute exists for `swapTargets` semantics).

**Cursed (trade-off picks — the interesting ones)**
- *Glass Cannon* — +15% ATK, −15% max HP.
- *All In* — round-1 energy +30, round-5 ramp starts a round late.
- *Lone Legend* — your highest-cost hero gets +20% stats; you field 5.

Design law: **trophies must change DECISIONS, not just add stats.**
"Backline untargetable till front falls" rewires how you position, what
you draft, what the opponent must bring. "+5 DEF" is filler — a thin
layer is fine for pacing, but every epic should make the next draft pick
different.

Presentation already exists: the rune-ward visual language, the reveal
popup, the collection grid, rarity palettes. A trophy is a card-less
card.

Balance: trophies live in SOLO + campaign only. Ranked MP stays pure.
The sim harness becomes the regression suite: `verify_all` + A/B
wall-clock pacing with trophies forced on, ensuring nothing breaks the
21-round cap or kills round structure. Cursed picks get power-budgeted
against the A/B baseline we already have from the energy retime.

Effort: hook layer in battle setup (~0.5 session), 36 trophy data
entries (~1 session), pick-UI reuse of draft screens (~0.5), sim pass.
**Do this second.**

---

### III. LEGENDS GAUNTLET — the campaign is a ladder of RIVALS, not bots
*Attacks B and C. The container that makes I and II matter.*

The placeholder Campaign tab becomes a 10-node climb. Each node is a
**named rival** — avatar plate, taunt line, a deck, and a *gimmick
written on the card* that thematically expresses a real rules bias:

1. **The Recruiter** — tutorial node, honest mirror draft.
2. **Lady of Bans** — always bans your two most expensive sigs. You know
   it going in; draft and field around it.
3. **The Swarm** — runs all low-cost aggro; its board +10% round-1 ATK.
   Punishes greedy lines.
4. **The Mirror Sage** — fields whatever six won your LAST battle. You
   must beat yourself. (Newcomers learn counter-picking here.)
5. **ELITE: The Usurper** — visibly cheats: opens at +20 energy and the
   board belongs to them. It's on the card. Beat him anyway — the
   highlight clip of the run.
6. **The Undertaker** — every death (both sides) heals his survivors.
7. **The Accountant** — energy drains both ways; loves `stealEnergy`.
8. **The Purist** — no sigs allowed for EITHER side (pre-announced;
   re-score your deck at draft time).
9. **ELITE: The Twins** — fields two formations alternating per round
   (waves-lite).
10. **FINAL: The Legend** — a stacked, all-epic six with one trophy of
    its own, ramping. The exam your build was for.

Run structure: **draft once at node 1** + 2 stash-swaps after each win;
**trophy pick after every node** (that's II, and it arrives in the exact
rhythm the player craves); permadeath with **one "Fate Rewoven" revive
token** earned at node 5. Death → the **Chronicle screen**: run recap
(MVP hero, kills, rounds, trophies) rendered as a collectible card —
screenshot-bait, and every run ends with an artifact even in failure.

Why persona-rivals instead of "harder bot": humans feel different
because of *tendencies*, and a bias you can READ AND EXPLOIT is worth
ten difficulty sliders. Newcomers get a curve; veterans get a puzzle-box
to speedrun. All art needed already exists (faction plates, boards, ra
glyphs, reveal popups).

Effort: rival definitions are data + draftAI bias knobs (they exist:
weights, spread, forced roles); node flow + Chronicle screen (~2
sessions total once I and II exist). **Do this third; it's the
once-I-and-II-exist payoff.**

---

## THE SPICES (deep cuts, after the big three land)

### IV. BURN-TO-COUNSEL — the draft's dead card fights back
Today the third card of each pack just burns. Instead you may **stash
the burn as a Counsel** (max 2 held): a one-use prep tactic.
*"Whisper" — peek one enemy ban before you field. "War Drum" — your
warrior opens at +15 energy. "Second Guess" — reroll the enemy-six
forecast.* Every draft now produces different TACTICS, not just
different decks, and the burn click stops feeling like cleanup.
~0.5 session. Cute thematically: *the tales you didn't choose still
whisper.*

### V. THE WAGER — a stakes lever, campaign-first
Post-prep, pre-battle, you may secretly **invoke the Chronicle**: win
this game and gain a bonus trophy pip / double MMR; lose and it costs
double too. Marvel Snap's entire tension economy in one button. Two
lines of rules, enormous sweat. Ranked-gated; campaign-first to watch
abuse patterns (~0.5 session).

### VI. BOARD OBJECTIVES — win conditions per battlefield
Extend existing board modifiers into alt-win conditions on select
boards: *Narrow Pass — hold the bridge slot 2 full rounds; Energy Void —
first to 3 sigs detonates.* Suddenly fielding math changes per board and
"losing the fight, winning the objective" stories appear. HIGHEST
balance risk on this page — must go through the full sim A/B before
shipping, tuned per board. (~1 session + sims.)

### VII. ASCENSION — duplicates in the pool
Let the 57-card pool hold a second copy of each legend; drafting your
own legend twice **ascends** it (new tier frame + ability upgrade
numbers, no new mechanics). Commit-to-an-arc-hetype drafting, pulls
deck identity earlier, makes the snake draft's hate-pick calculus mean
more (denying an ascension is a real pick). Requires pool + sim pass.
Worth trying in a sim harness BEFORE any UI: the draftAI must learn to
value second-copies, which is one weight key away.

---

## RECOMMENDED ORDER

| # | Item | Attacks | Effort | Needs sims? |
|---|------|---------|--------|-------------|
| 1 | **The Set** (Bo3 + sideboard + loser picks board) | A, C | ~2 sessions | pacing only |
| 2 | **Trophy Forge** (36 run-modifiers) | B | ~2 sessions | verify_all + A/B |
| 3 | **Legends Gauntlet** (10 persona rivals, reuses 1+2) | B, C | ~2 sessions | verify_all |
| 4 | Burn-to-Counsel | A, B | 0.5 | no |
| 5 | The Wager | C | 0.5 | no |
| 6 | Board objectives | A | 1 + heavy sims | YES, per board |
| 7 | Ascension duplicates | B | 1 + sims | YES |

**The sentence that summarizes the whole memo:**
your cards are finished — now make the *rules* draftable too.

Eight-to-ten is not more content. It is: information leaking between
games (The Set), rules mutating between runs (Trophies), and a ladder
of personalities to spend them on (The Gauntlet). Build those three and
the same 57 legends play like 570.
