# Featured Clash — Rotating Multiplayer Modes

**Status:** Three formats selected in product discussion. Detailed balance numbers, ownership rules, rewards, and implementation order remain open.

**Selected rotations:** Blind Six, Forked Fates, and Regicide.

**Purpose:** Add one fresh, low-stakes multiplayer destination without creating another trophy ladder or permanently splitting players across several queues.

This document records a proposed feature separately from `ROADMAP.md`. It does not silently reorder the published roadmap.

---

## 1. Feature structure

Featured Clash is one unranked multiplayer card whose active ruleset rotates on a predictable cadence.

- Only **one** ruleset is active at a time.
- Every ruleset is live, human-controlled 1v1.
- Featured Clash never awards or removes Ranked trophies.
- Matchmaking may use hidden skill/MMR to avoid extreme mismatches.
- The active format uses one global queue rather than separate queues for all three formats.
- A rotation pays ordinary completed-PvP rewards plus a limited first-win reward.
- Rulesets change team selection or the victory objective while preserving the recognizable Echoes of Legend battle system.

A weekly rotation is the current recommendation, not yet a locked cadence.

---

## 2. Shared laws

Unless a rotation explicitly overrides one, Featured Clash inherits the normal laws for:

- deterministic battle seeds and board checksums;
- legal actions and target validation;
- turn clocks;
- reconnects, forfeits, and disconnects;
- battlefield behavior;
- card text and combat resolution;
- unbannable Legendary cards whenever a format actually contains bans;
- result verification before rewards are granted.

Featured Clash is **not Ranked**. Its rewards and profile record must never masquerade as Ranked trophies.

### Card access

The recommended direction is to loan every card required by the active format. That makes Featured Clash a place to discover unfamiliar legends without changing permanent ownership. Whether Blind Six and Regicide use the full loaned roster or the player's collection remains an open product decision.

---

## 3. Rotation A — Blind Six

### Hook

Build the whole team in secret. There is no twelve-card deck, scouting, or ban phase.

### Proposed flow

1. A battlefield is selected according to the final rotation rules.
2. Each player privately selects six legal legends.
3. Both players lock their choices without seeing the opposing six.
4. The squads reveal simultaneously.
5. Each player forms their front and back rows.
6. One normal battle determines the winner.

### What it tests

- Building a self-contained six rather than a flexible deck of twelve
- Predicting the kinds of hidden combinations other players will bring
- Formation after the opponent's composition is finally revealed
- Playing without bans as a safety valve
- Deciding whether to use a fragile high-synergy plan or a resilient general squad

### Recommended constraints

Blind Six needs a dedicated legality rule rather than blindly copying the deck-of-twelve caps. Candidate rules include:

- maximum two Legendaries in the final six;
- a lower same-role cap than Classic to prevent extreme one-role teams;
- no duplicate legends;
- all six choices committed simultaneously;
- a visible selection timer.

The exact role cap remains open and should be simulation-tested.

### Important open questions

- Is the battlefield revealed before or after squad selection?
- Do players bring a saved Blind Six squad or select after matchmaking?
- Are all cards loaned?
- Does formation occur before or after the squad reveal?
- Is any emergency protection needed against one solved dominant combination?

The recommended starting answers are selection after matchmaking, all cards loaned, simultaneous reveal, and formation after reveal. Battlefield timing needs playtesting: revealing it first rewards adaptation, while revealing it later rewards robust squads.

---

## 4. Rotation B — Forked Fates

### Hook

Every choice gives the unchosen legend to the opponent.

### Proposed flow

1. The battlefield is revealed.
2. Six draft rounds occur, one for each role.
3. Each round presents a pair of legends with the same role.
4. The player with priority chooses one legend.
5. The other player automatically receives the remaining legend.
6. Choice priority alternates so each player chooses first in three rounds.
7. After all six rounds, each player owns exactly one Tank, Bruiser, Sniper, Caster, Controller, and Medic.
8. Both players form their six and fight one normal battle.

### What it tests

- Evaluating two legends in the context of both developing teams
- Taking a strong card while knowingly handing over its counterpart
- Faction and skill synergy across a forced one-of-each-role structure
- Adapting to a battlefield before the first choice
- Reading what the opponent is constructing across six public decisions

### Pair generation

Pairs must be deterministic from the shared match seed and legal as a complete six-round table.

The generator or authored tables must account for:

- exactly one pair per role;
- rarity and Legendary distribution;
- faction variety;
- avoiding obviously lopsided pairs;
- preventing duplicate card identities;
- first-choice fairness across many matches;
- both clients displaying the same pair order and choice priority.

Forked Fates should loan its presented cards. Ownership cannot sensibly restrict one side of a forced pair.

### Priority

A simple alternating chooser gives each player three first choices. The starting chooser should be determined fairly from the shared seed or existing multiplayer initiative rule, and repeated matches should not permanently favor the host.

### Important open questions

- Are pairs generated for every match or drawn from curated pair tables?
- Does the pair order always follow the same role order or shuffle?
- May a player use one reroll or pair veto?
- How is the Legendary cap represented across forced pairs?
- Is there a short review window before formation?

The recommended first version has no rerolls or vetoes. Its strength is six quick, understandable decisions.

---

## 5. Rotation C — Regicide

### Hook

Protect your Crown and assassinate the enemy's. The first Crown death ends the battle.

### Proposed flow

1. Each player privately selects a legal squad of six.
2. Each privately designates one of those legends as their Crown.
3. Squads and Crowns reveal simultaneously.
4. Players form their front and back rows.
5. The battle uses normal actions, skills, Energy, and targeting.
6. The first side whose Crown dies loses immediately, even if its other five legends remain alive.

### What it tests

- Constructing protection around one critical legend
- Assassination, disruption, Taunt, healing, and defensive timing
- Choosing whether to sacrifice another legend to preserve the Crown
- Deciding when to attack the objective and when to dismantle its support
- Formation under an alternate victory condition

### Crown's Ward

Without an additional rule, durable Tanks may become automatic Crown choices. The current recommendation is a visible **Crown's Ward** that normalizes survivability enough for fragile legends to remain plausible.

Possible implementations include:

- a shield whose size is inversely related to the legend's base Max HP;
- a fixed effective-HP floor;
- stronger Ward for back-row roles and weaker Ward for Tanks;
- restrictions on which roles may be crowned.

No formula is locked. This must be simulated across all eligible legends rather than balanced by intuition.

The Ward should protect survivability without changing the legend's ATK, ability text, or role identity.

### Rules requiring explicit decisions

Regicide must define:

- whether Crown death ends the match before death passives resolve;
- whether Spirit World reprieve prevents the first lethal Crown event;
- whether a Crown may be revived, and whether the game has already ended by then;
- how Untargetable, Taunt, redirection, and row protection interact with the Crown;
- what happens if both Crowns die in the same resolving action;
- whether damage-over-time can end the match normally;
- whether timeout and simultaneous deferred effects can produce a draw;
- whether the Crown is selected before or after battlefield reveal;
- whether all cards are loaned.

The cleanest initial law is that the Crown must reach actual resolved death; a successful reprieve prevents that death, but once death resolves the match ends before a later revive can undo it. Simultaneous-lethal ordering must use deterministic engine resolution and may require an explicit draw or acting-player rule.

### Selection relationship to Blind Six

Regicide can reuse much of Blind Six's private six-selection ceremony and legality checks. It then adds the private Crown designation and alternate victory condition. This makes it a sensible later rotation after Blind Six is stable.

---

## 6. Rewards without Ranked trophies

Featured Clash should have a small mastery loop, not a second ladder.

### 6.1 Ordinary match rewards

- A legitimate completed win or loss pays the normal PvP economy reward.
- A forfeit, AFK, or invalid result cannot be farmed for the same reward.
- If one rotation is substantially faster than ordinary PvP, its economy rate must be audited so it does not become the dominant coin farm.

### 6.2 First-win Clash Cache

The first verified victory of a rotation grants one limited **Clash Cache**. Candidate contents include ordinary coins, normal collection progress, and that rotation's Clash Seal.

Only one cache may be earned per rotation. Featured Clash is not an unlimited event-currency grind.

### 6.3 Seasonal Clashbook

Winning once stamps the active ruleset's page in a seasonal Clashbook.

A recommended six-rotation structure is:

- one seal: small ordinary reward;
- two seals: modest collection reward;
- four seals: the main seasonal cosmetic;
- six seals: prestige recognition or a variant cosmetic.

The main cosmetic should require fewer than every available seal so one missed rotation does not invalidate the season.

### 6.4 Recognition

Good non-power recognition includes:

- profile titles;
- card backs;
- profile or battle-intro frames;
- Clashbook decorations;
- permanent first-win stamps;
- per-format best streaks.

Featured Clash should not award exclusive playable cards, combat bonuses, or a large winner-take-all leaderboard prize.

---

## 7. Matchmaking and population

The rotation model exists partly to protect queue health.

- Only the active ruleset may be queued.
- Matchmaking uses one Featured Clash population.
- Hidden skill estimates may provide fair matches without exposing another trophy number.
- Search ranges widen gradually when population is low.
- Repeated opponent avoidance is best-effort, not a reason for an endless wait.
- A rotation may be temporarily unavailable if a critical rules bug is detected.

The game should show an approximate expected duration and clearly label the mode **Unranked** before the player queues.

---

## 8. Recommended implementation order

1. **Blind Six** — simplest selected format and establishes private six-selection, reveal, legality, reward, and rotation infrastructure.
2. **Forked Fates** — adds a deterministic shared pair draft and public choice sequence while retaining the ordinary win condition.
3. **Regicide** — reuses Blind Six selection but requires an alternate victory condition, Crown UI, extensive interaction laws, and roster-wide survivability simulation.
4. **Rotation scheduler and Clashbook polish** — may begin earlier, but should not obscure validating each format's gameplay.

Blind Six should ship as the first Featured Clash rather than waiting for all three formats to be complete. The later formats can enter once their own regression and balance suites pass.

---

## 9. Explicit non-goals

Featured Clash is not:

- another Ranked trophy ladder;
- a set of three simultaneous queues;
- a source of exclusive competitive cards;
- an unlimited currency farm;
- a daily obligation;
- a substitute for Classic, Draft, Unabridged, or Guild League;
- permission to apply untested global combat multipliers for novelty;
- a place where AI impersonates a human opponent.

---

## 10. Open decisions

- Final feature name and visual identity
- Rotation cadence and reset time
- Loaned roster versus owned collection in Blind Six and Regicide
- Blind Six role and Legendary caps
- Battlefield reveal timing in Blind Six and Regicide
- Forked Fates pair-generation method and Legendary rule
- Crown eligibility and Crown's Ward formula
- Simultaneous Crown-death resolution
- Exact Clash Cache and Clashbook rewards
- Cosmetic surfaces available at first release
- Hidden matchmaking rating source
- Server-verification dependency
- Placement in the authoritative roadmap without silently changing its existing order
