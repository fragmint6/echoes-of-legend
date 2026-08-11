# Guilds and the Guild League

**Status:** Product direction agreed in discussion; detailed numbers, rewards, naming, and implementation order remain open.

**Purpose:** Give players a persistent social identity and a recurring multiplayer event without asking them to assemble a premade team, schedule appointments, or let AI impersonate another player's tactics.

This document records the guild direction separately from `ROADMAP.md`. It does not silently reorder that published roadmap.

---

## 1. Product principles

1. **A player may join alone.** Guild participation must not assume an existing friend group.
2. **Every PvP decision belongs to a player.** AI may not pilot a guild member's defense or stand in for that person's play style.
3. **No appointment calendar.** The primary event must feel like ordinary matchmaking, not work scheduling or a Premier-style team commitment.
4. **Limited participation, not grinding.** The event happens every two weeks and uses a fixed number of scoring entries.
5. **The guild is a banner, not a power bonus.** Guild membership must not grant combat stats, exclusive competitive cards, or other advantages inside ordinary matches.
6. **Large guilds may not win through unlimited volume.** Membership caps, limited entries, contribution rules, or guild-size divisions must bound the scoring advantage.
7. **Results must be trusted.** Ranked and reward-bearing guild results require the same server-verified match record planned for meaningful trophies and ladders.

---

## 2. Why the original Guild War concept was rejected

The first concept was a three-day, four-guild round robin inspired by an automated-combat mobile game. Members would attack named defenders whose point values came from their trophy totals.

That structure does not transfer cleanly to Echoes of Legend:

- Trophies measure tactical decisions, while an AI-controlled defense removes those decisions.
- A submitted deck is not an honest representation of the owner's play style when generic AI pilots it.
- Live named challenges require both players to be present together.
- Availability calendars and fixed match appointments are too clunky and create a commitment designed for premade teams rather than open guilds.
- Correspondence play is a poor fit because one battle contains too many alternating actions to resolve comfortably inside a three-day event.

Therefore the current direction drops named AI defenses, scheduled fixtures, and direct guild-versus-guild rounds.

---

## 3. Current event direction

### 3.1 Working concept

A biweekly **Guild League**, **Grand Muster**, or **War Rally** opens for 72 hours.

A member queues alone and is matched live against a similarly skilled random player from a different guild. Each player represents their guild and controls every decision in an Unabridged set. A set victory contributes to the winner's guild event progress.

Guilds do not need to be directly paired against one another. The event uses one global cross-guild matchmaking population, which removes the concurrency problem created by named fixtures.

### 3.2 Recommended event cadence

- Runs for three days.
- Returns every two weeks.
- All event entries are available for the full 72 hours; there is no forced daily login.
- Recommended starting allowance: **three scoring Unabridged sets per eligible member per event**.
- Additional ordinary play does not create unlimited guild points.

Three Unabridged entries represent six to nine individual battles once every two weeks. This is enough to make participation meaningful without turning the event into a daily obligation.

The exact entry count remains a tuning decision.

### 3.3 Match flow

1. The player opens the Guild event.
2. The UI shows the guild's current event progress, remaining entries, and recent member results.
3. The player selects **Fight for Guild**.
4. Matchmaking searches the global Guild Battle population.
5. The opponent must belong to a different guild.
6. Both guild banners, player names, and ranks are presented.
7. The players complete a live Unabridged set.
8. The verified result updates personal contribution and guild progress.
9. The event entry is consumed according to the final disconnect/forfeit rules.

There are no defense bots, appointments, captains assigning fixtures, or required parties.

---

## 4. Matchmaking

Guild Battle matchmaking should:

- exclude members of the same guild;
- prefer comparable trophy/MMR ranges;
- avoid repeat opponents during the same event when population permits;
- widen the acceptable rating range gradually rather than waiting indefinitely;
- use the entire event population rather than splitting players into individual guild-pair queues;
- preserve the normal deterministic checks, reconnect behavior, clocks, and forfeit rules.

"Random opponent" means random among reasonable eligible opponents, not an unrestricted Bronze-versus-top-rank lottery.

### Ranked relationship

The recommended initial rule is:

- Guild Battles use the same **Unabridged gameplay rules** as the intended Ranked format.
- Ranked MMR may inform matchmaking.
- Guild Battle results initially remain separate from the personal Ranked rating so a casual guild member is not forced to wager ladder progress.

If population cannot support the event queue, allowing one match to count for both Ranked and Guild League can be reconsidered. That choice must be symmetric for both players and clearly communicated before queueing.

---

## 5. Scoring

The main score should remain immediately legible:

- **Unabridged set victory:** one Guild Win.
- **Set loss:** no Guild Win.
- Individual game score and defeated-opponent rating are retained as tiebreakers or secondary statistics.

Example contribution display:

> 3–0 sets · 6–2 games · three Guild Wins

Example guild display:

> The Hall of Embers · 38 Guild Wins

A more complicated expected-result or trophy-weighted score may eventually be needed for a serious comparative league. It should not replace the understandable win count on the primary event screen.

### Competitive caveat

Skill-based matchmaking pushes most players toward an approximately even win rate. Consequently, raw Guild Wins primarily measure participation when every guild has similar entry capacity. If future rewards depend heavily on placement against other guilds, the design must account for:

- guild size and active membership;
- equal maximum scoring opportunities;
- strength of schedule;
- expected wins based on rating;
- missing or unused entries.

The first event should prefer cooperative reward thresholds over a winner-take-all global ranking.

---

## 6. Rewards

Rewards should have two layers.

### 6.1 Personal participation

Suggested milestones:

- complete one set: participation reward;
- win one set: contributor reward;
- win two sets: veteran reward;
- win every available set: flawless recognition or a modest bonus.

Exact rewards remain open.

### 6.2 Shared guild vault

Every Guild Win advances a communal event meter. Increasing thresholds unlock better final reward tiers for eligible participants.

A member should complete at least one Guild Battle to claim the shared event reward. This prevents entirely inactive accounts from joining only to collect.

Thresholds must be tuned against:

- guild membership cap;
- number of event entries per member;
- typical participation rate;
- expected 50% match win rate;
- guild-size divisions, if adopted.

### 6.3 Top contributor recognition

Most material value should live in participation milestones and the shared guild vault, not a single first-place prize. Overweighting the top contributor encourages blame, exclusion, and guild hopping.

Good top-contributor recognition includes:

- a temporary MVP title;
- profile or guild-hall placement;
- a banner ornament;
- a cosmetic frame;
- event-history recognition.

With limited entries, ties are expected. Multiple MVPs may be recognized, or game record and opponent strength may act as tiebreakers.

---

## 7. Guild-size fairness

Raw wins naturally favor guilds with more active members. Candidate solutions are:

1. **Guild-size divisions** — small, standard, and large guilds use different thresholds and leaderboards.
2. **A hard guild membership cap** — every guild has the same maximum possible event entries, while activity remains intentionally valuable.
3. **A fixed scoring roster** — competitively clean but risks officers excluding casual members; not preferred for the initial release.
4. **Cooperative thresholds without placement rewards** — guilds improve their own vault, while the global leaderboard is primarily cosmetic.

The recommended initial combination is a sensible guild membership cap, size-aware reward tuning, and cooperative vault tiers. A formal inter-guild placement league can follow once real participation data exists.

---

## 8. Persistent guild layer

A practical guild MVP may include:

- create, join, leave, invite code, and shareable invite link;
- guild name, banner, emblem, motto, and optional community link;
- owner, officer, and member roles;
- member roster and activity state;
- event contribution history;
- guild activity feed;
- direct challenge or private-room shortcuts once private rooms exist;
- seasonal guild record and unlocked cosmetic identity.

Live guild chat is not required for the MVP. Chat introduces moderation, reporting, blocking, storage, and safety work. A notice board, activity feed, and optional Discord/community link provide a smaller first step.

---

## 9. Explicit non-goals

The guild system should not initially include:

- AI-controlled replicas of members;
- scheduled availability calendars;
- mandatory premade teams;
- unlimited event grinding;
- combat-stat bonuses from guild membership;
- guild-exclusive competitive cards;
- card donation or lending economies;
- rewards so strong that leaving a casual guild becomes optimal;
- full chat before moderation tools exist;
- direct four-guild round-robin fixtures that cannot reliably find live opponents.

Cooperative raids, direct Guild Wars, and formal promotion/relegation leagues may be reconsidered later, but they are not necessary for the first Guild League.

---

## 10. Integrity and anti-abuse

Before reward-bearing release, define and enforce:

- minimum account or membership age before representing a guild;
- event-lock behavior for joining, leaving, and switching guilds;
- server verification of decks, actions, checksums, winner, and forfeit reason;
- same-guild matchmaking exclusion;
- repeat-opponent and win-trading detection;
- disconnect and reconnect treatment;
- whether an entry is consumed at queue acceptance, battle open, first action, or final result;
- reward eligibility after leaving a guild mid-event;
- legal deck and Legendary-cap rules for the event;
- behavior when one or both players fail to load the match.

The existing client-to-client checksum detects accidental drift but is not sufficient authority for trophies or valuable guild rewards.

---

## 11. Open decisions

The following remain intentionally unresolved:

- final feature and event names;
- guild membership cap;
- exact number of event entries;
- exact reward currencies and cosmetics;
- guild-size divisions versus a single capped size;
- cooperative threshold-only rewards versus comparative league placement;
- whether Guild Battles alter personal Ranked rating;
- event eligibility and guild-switch cooldown;
- tie rules and whether close set losses contribute anything;
- whether the first version includes private challenges, activity feeds, or profile cosmetics;
- where Guild League enters the authoritative roadmap without reordering existing commitments silently.
