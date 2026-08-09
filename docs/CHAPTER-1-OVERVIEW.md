# Chapter I — The Road of Echoes: Complete Overview

*The campaign's chapter bible: lore, themes, the ten gates, difficulty
design, rewards, and the visual language. Written 2026-08-08 against the
shipped implementation (`data/campaign-ch1.js`, `js/campaign.js`).
Companion docs: `DESIGN-Campaign-Chapter1.md` (design law + history) and
`LORE-Campaign-Chapter1.md` (the full narrative prose).*

---

## 1. The Frame

When a legend's story ends, what remains is an **Echo** — not a ghost
(ghosts remember the rooms they died in), not a soul (souls belong to
gods, graves, and arguments no one has won). An Echo is the part of a
life that insists it was more than an ending.

Every Echo walks the same road: **ten gates** between memory and
oblivion, each held by a guardian who teaches one truth a legend must
carry. At the road's end waits **Gilgamesh, the First Legend** — the
first person who ever refused to be forgotten — judging whether a new
story deserves to last.

The player is **the Wayfarer**, and the Wayfarer is wrong in an
interesting way. Echoes arrive carrying an *ending*; the Wayfarer
arrived carrying an *absence*. No name — the first blank line the
Recruiter has written in his ledger in a very long age. Names in that
ledger are crossed out in red (devoured) or underlined in gold
(continuing). The Wayfarer's line stays blank until Gate I is cleared,
when a hand that is not the Recruiter's writes one word beneath it:
**CONTINUING.**

### The real plot underneath the teaching

Beneath the tutorial campaign runs the chapter's actual story, revealed
in stages:

- **Gate V (the Warden):** the Road is not a ladder or a tournament. It
  was built because too many echoes did not know what to do after their
  stories ended — some became tyrants of their old victories, some
  ghosts wearing their greatest wound like a crown. The guardians are
  not gatekeepers; they reached a door and *chose to stay*, because
  someone had to when the Road began to break.
- **Gate VIII (the Chronicler):** there is a hunger outside the Road
  called **the Quiet**. It does not kill stories — killing would be
  simpler. It removes the part that makes anyone *care* a story
  existed. A town remembers it had a king but not his name; a song
  keeps its melody and loses every word. The Wayfarer's page is blank
  because the Quiet found their world *before their ending was
  written* — and a sealed page breaks open: *THE ONE WHO ARRIVES
  WITHOUT AN ENDING CAN OPEN WHAT THE DEAD CANNOT.*
- **Gate IX (the Last Guardian):** she was like the Wayfarer once — a
  living story. She learned her name was the last thread tying the
  Quiet to her old life, and she cut it. Not to be forgotten: to keep
  the forgetting from crossing after her. The Quiet followed the
  Wayfarer in, because **an unfinished story is a door**.
- **Gate X (Gilgamesh):** the twist that reframes the chapter. The
  Quiet is *his* — his grief for Enkidu grown teeth. He crossed
  deserts, seas, graves and gods to appeal death, was told no, hated
  the answer, and asked a different question: *what if nothing were
  ever forgotten?* Memory without mercy became hunger. The Road is his
  amends: a school that teaches legends to be **carried by the living
  without devouring them**. He refuses to hand the Wayfarer a name ("a
  name given by a king is a chain") — the trial is the only way to
  take one that means anything.

Victory does not produce a name. The blank line fills with a sentence —
**THE STORY CONTINUES** — and the gate behind the throne opens toward
**Uruk**, seeding Chapter II's Mesopotamian faction.

**Tone:** mythic, warm, a little wry. Short lines, strong images. Every
guardian gets exactly one knife hidden in the warmth.

---

## 2. The Themes

1. **Lasting vs. refusing to end.** The chapter's question, asked ten
   ways. Every guardian is a cautionary answer: the oath kept too late,
   the outlaw who forgot what she was stealing records *for*, the
   strategist praised but not acquitted, the guardian who cut her own
   name.
2. **The mechanic IS the fiction.** Rewards are literally the
   guardians' echoes joining the warband ("their echo walks with you").
   Every rival's playstyle is their personality expressed through deck,
   bans, drafting and fielding — never through cheats. Every board
   reinforces the lesson of the gate it hosts.
3. **One system per gate** (design law L3). Battle loop → preparation →
   deckbuilding and sets → drafting. A first-ever fight never opens
   with a ban phase.
4. **Difficulty from decks, never from the AI** (law L2). Measured:
   deck composition swings ~67 percentage points; AI search depth and
   turn order are banned dials.

---

## 3. The Ten Gates

### Gate I — The Recruiter
- **Format:** Guided Classic (fully scripted) · **Board:** The Colosseum
- **Teaches:** the entire battle loop — bans, roles, rows, energy,
  basics vs signatures, targeting, passing, the turn clock (which he
  notes ticks *for show only* on the Road — campaign battles never
  auto-pass you), the arena card, the tip dots.
- **Who he is:** a warm, exacting, ancient memory broker with a
  moss-green coat and a ledger thick enough to stop an arrow. He finds
  the newly ended before they wander into the thorns. Fights to
  *measure*, not to beat — "I will not trick you. The Road has enough
  of that ahead."
- **Playstyle:** the entire gate is a pre-computed line. The deck is
  the starter Grimmwood twelve; his bans, your bans, the ordered six
  (one of every role, Controller included) and **all 41 moves of the
  match** are the ledger's picks, gold-marked in the UI, with a role
  lesson for every fielded legend and a narration beat on every
  signature. The line ends in victory with all six of your legends
  standing — if you follow the marks.
- **Reward:** coin. And the word CONTINUING.

### Gate II — The Oathkeeper
- **Format:** Classic · **Board:** The Narrow Pass (front row matters;
  back row must spend signatures)
- **Teaches:** walls, Provoke, the front line — "what strength is for."
- **Who he is:** a scarred veteran in mismatched armor whose name is
  "Too Late." He promised forty-three people he would bring them home;
  he brought twelve. The pass's cliffs are nailed with shields reading
  I WILL RETURN · I WILL HOLD · I WILL NOT LEAVE YOU — every one kept
  too late, including his.
- **Playstyle:** Camelot's whole hall plus a second wall (Benkei,
  Gingerbread Man, Momotaro). Scripted triple-tank six. **Bans your
  best back-line threats** — he tells danger where it must stop.
- **Signature line:** "A wall is not built to keep danger out. It is
  built to tell danger where it must stop. So do the arithmetic: go
  through me."
- **Reward:** King Arthur + Lancelot ("the king who holds, the knight
  who answers") + coin.

### Gate III — The Outlaw
- **Format:** Classic · **Board:** The Open Plains (back row +15%
  damage; front row −15% DEF)
- **Teaches:** focus fire, kill priority, protecting your carry.
- **Who she is:** a bookshop daughter with a blackpowder rifle. The
  soldiers didn't burn the books first — they burned the *records* that
  said which books belonged to whom. Names in large type survived; the
  rest were scenery. "So I shoot the large type, and the scenery
  remembers it has hands."
- **Playstyle:** Sherwood focus-fire with a sniper-stacked six (Robin
  Hood, Goldilocks, Tomoe Gozen). **Bans your protectors** so the
  favorite stands in the open. Always shoots your strongest.
- **Reward:** Robin Hood + Little John ("one knows how to aim; one
  knows how to stand beside an aim without becoming its shadow") + coin.

### Gate IV — The Anointed
- **Format:** Classic · **Board:** The Mana Spring (+20 energy income,
  +20 cap — pays for two-card Mark chains)
- **Teaches:** *reading* Marks — setup → consume; energy banking.
- **Who she is:** an ascetic priestess with a bronze astrolabe. Taught
  that warning is mercy (the physician marks before she cuts, the
  judge before the sentence) — then learned that people who love power
  also love choosing who wears the circle. Her city called her too
  useful to be allowed to doubt. "So now I doubt professionally."
- **Playstyle:** the Olympus Mark engine (Zeus sets and consumes in one
  breath) propped by strong neutral support — the most-tuned deck of
  gates 1-4, because Olympus is the chapter's only Mark faction.
  **Bans your cleansers** so the promises stick.
- **Signature line:** "A mark is a promise: I see you. I am coming.
  Prepare. Whether it becomes prophecy is the only part that belongs
  to you."
- **Reward:** Zeus + Hercules + coin.

### Gate V — The Warden of the Mid-Road *(first exam)*
- **Format:** **Unabridged best-of-3** · **Fight card:** Colosseum /
  Narrow Pass / Open Plains — ground already walked
- **Teaches:** deck construction (the player's first real build), sets,
  sideboarding, the no-retreat law — and that the lesson is not whether
  you can win once, but **whether you can change after winning**.
- **Who she is:** the keeper of the three toll arches, who pours tea
  into four cups when only three people are present ("For whom?" —
  "For the person you were before you arrived"). She delivers the
  mid-chapter reveal of what the Road is, and clocks the Wayfarer as
  something new: "Echoes arrive carrying an ending. You arrived
  carrying an absence."
- **Playstyle:** an authored 4/4/4 deck across the three taught
  factions (Camelot/Sherwood/Olympus), adaptive fielding, reactive
  sideboarding between games. Her toll: NO RETREAT once it begins.
- **Reward:** **choice of 2** echoes from the taught factions + larger
  coin — the deckbuilding lesson doubled as a reward.

### Gate VI — The Trickster
- **Format:** **Draft** · **Board:** The Energy Void (−10 energy income
  — poverty teaches budgeting)
- **Teaches:** draft fundamentals; the energy economy; that every
  choice leaves another possible self across the table.
- **Who she is:** a gambler in a vermilion jacket in a void full of
  things that almost existed. In her first story she was the hero's
  sister with three lines — "Brother, be careful," "Brother, come
  home," and a third that was never printed. "So I learned to deal
  myself into other stories. Now I have ALL the lines."
- **Playstyle:** drafts from a curated pool (all six Yamato guaranteed)
  with a thief's eye: **steals the pieces your plan needs** and snipes
  energy payoffs. "Draft like someone is robbing you. Someone is."
- **Reward:** Kaguya + Benkei + a blank lacquered tile + coin.

### Gate VII — The Strategist
- **Format:** **Draft** · **Board:** The Blood Battlefield (legends
  below 50% HP deal +25% — the kill engine's home ground)
- **Teaches:** counter-drafting; kill engines; that mercy is also a
  formation.
- **Who he is:** an old advisor with an architect's lens and a wax
  board of violet lines — some ending in circles, some in ash. He saved
  a city by choosing which villages burned first; they minted coins
  with his face. "Praise is not acquittal. That is why I am here."
- **Playstyle:** Roma pool; **counter-drafts your live picks** — "I
  will not be drafting cards. I will be drafting your habits." Values
  the cold strong card.
- **Reward:** Julius Caesar + Brutus ("Caesar ends what he starts;
  Brutus ends what Caesar starts") + a brass measuring pin + coin.

### Gate VIII — The Chronicler
- **Format:** **Draft** · **Board:** The Spirit World (a lethal blow
  leaves 1 HP once per legend — attrition's arena)
- **Teaches:** burn, cleanse, Silence — attrition and answers; kill the
  healer; when does preserving something become changing it.
- **Who they are:** an ash-pale archivist at a black desk in a
  wall-less library, ink-stained to the bone. Keeper of the blank book
  that is the Wayfarer's page ("Every life leaves clutter. You have
  none."). They name the Quiet, and they have seen a page like yours
  exactly once before — a guardian, before she became the Last.
- **Playstyle:** Takamagahara pool; drafts the curve and **hoards
  answers** — burn, cleanse, Silence, cost-denial. "If you are worth
  the shelf space, prove it against the full catalogue."
- **Reward:** Amaterasu + Izanami (the dawn and the dusk — the burn
  they used on you *and* the answer to it) + coin.

### Gate IX — The Last Guardian *(second exam)*
- **Format:** **Unabridged best-of-3** · **Fight card:** Energy Void /
  Blood Battlefield / Spirit World
- **Teaches:** full mastery under silence — what can be spent, what
  must be saved, what cannot be carried farther.
- **Who she is:** a woman in scarred gate armor with a wooden key
  taller than her shoulder, holding the last door shut. **She never
  speaks** — the Recruiter translates her signs, and her in-battle
  "dialogue" is pure stage direction. She gave up her name to cut the
  Quiet's thread to her world.
- **Playstyle:** an authored 4/4/4 wall (Yamato/Roma/Takamagahara) —
  four tanks deep with two executioners behind it. Bans your hardest
  hitters. No taunts, no warnings; the gate does not negotiate.
- **Reward:** **choice of 2** from any taught faction + larger coin —
  the last completion window before the throne. Her epilogue is the
  chapter's emotional peak: you decline the opening at her side, offer
  her the key, and she speaks — "Then carry it."

### Gate X — GILGAMESH *(the judgment)*
- **Format:** **Unabridged best-of-3** · **Fight card:** The Legend's
  Trial / The Ancient Ruins / The Mirror Realm — the three boards never
  yet seen, because no exam follows. Three doors: **Power** (what you
  can do), **Memory** (what remains when you are gone), **Self** (what
  you become when no one is watching).
- **Teaches:** judgement, thresholds, closing a won game — beating the
  *set*, not one deck.
- **Who he is:** not on the throne — standing beside it, tired of
  ceremonies he invented. The king who loved Enkidu, filed a complaint
  against death, and was told no.
- **Playstyle:** a bespoke boss card — **unbannable and pinned into
  every fielded six by hardcode**. His signature, *He Who Saw the
  Deep*, hits at 150%, executes at 300% below 30% HP (echoing the Duat
  threshold you are meeting for the first time), and banks a permanent
  +10% ATK per cast — kingship that outlasts; the fight is a race
  against his patience. His twelve is Duat's full court plus an
  authored front line, and **Isis walks with him** — the chapter's
  only revive, telegraphed on the stage card, landing as the final
  twist: "the scales give life back. That is not a threat; it is a
  schedule." He **bans your two strongest cards** — the scales weigh
  heaviest first.
- **Reward:** Isis + Anubis ("not rewards — witnesses"), the largest
  coin purse, and the gate toward Uruk.

---

## 4. Difficulty Design

**The three sanctioned dials** (per the design doc, all measured):

1. **Rival fielded-six power** — deck composition swings ~67pp.
2. **Bot fielding freedom** — gates 1-4 use scripted sixes
   (deterministic, predictable); gates 5+ field adaptively, because a
   set without sideboarding is not a set.
3. **Terrain** — symmetric always (law L1), but a rival deck *built
   for* its pinned board against a player deck that isn't is a real,
   honest edge.

**Banned dials:** AI search depth (measured non-monotonic — a deeper
enemy made players win *more*) and turn order (~0-10pp since the
comeback-energy patch). The campaign never cheats; the campaign never
needs to.

**The intended curve vs. the measured curve.** Soaked 2026-08-09 with
`sim/campaign_soak.js` (the design doc's `--teams fixed` harness):
every gate replayed with its exact shipped config, the player's side
driven by the game's own AI over the floor collection, n = 40-60
trials per gate. The soak numbers are BOT-vs-bot; a median human runs
below the bot on early gates and above it on gates whose counterplay
is knowledge (protect-the-carry, kill-the-healer).

| Gate | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Target (floor) | ~95%* | ~90% | ~85% | ~75% | ~70% | ~65% | ~60% | ~55% | ~40% | ~20-30% |
| Measured (bot) | 100%* | 100% | 95% | 92% | 85% | 68% | 58% | 58% | 30% | 20% |

\* Gate I is scripted: following the marks is a guaranteed clean sweep
(all six signatures cast, no losses). Gates 6-8 are drafts, so the
player's collection does not enter the fight.

The tuning pass behind those numbers (all deck-side, per the law):
the Outlaw's gate was rebuilt after the soak found bans into a
scripted six were REFILLED with the best of her bench (banning Little
John summoned Guy of Gisborne) - scripted sixes now refill
deterministically from the deck list, benches are ordered
weakest-first, and her bans hunt walls instead of stripping a 14-card
floor of all healing. Gilgamesh's card grew into its role (8600 HP /
2050 ATK / +15% ramp x6) after the set measured 70% player wins.
The exam decks and draft personas were tuned around the same runs;
a full-road playthrough (`--run`) clears in ~20 attempts total.

**The safety rails:** progress saves per gate (a loss retries, no run
resets — frustration is the enemy of a teaching campaign), the floor
rule (every gate is clearable with grants alone; packs are strictly
upside; the campaign never requires a purchase), and the no-retreat
law on sets (progress commits on gate completion only — an abandoned
set is a no-op, telegraphed plainly at Gate V before the first
roulette ever spins).

---

## 5. Rewards & Progression

Three tiers per gate (design R6):

1. **Curriculum cards** — 1-2 named echoes from the rival's faction,
   granted in **pairs** so factions accumulate toward the future
   4-per-faction Blessing threshold (R8). The grant list *is* the
   curriculum: you own the wall after the wall lesson, the Marks after
   the Mark lesson.
2. **Coin** — authored now, inert until the economy pass; replays pay
   a reduced 25% taper so the chapter can't be farmed.
3. **Choice grants** at the exams (V and IX) — "choose 2", resolved at
   claim time against the live roster (R9: choice-shaped rewards never
   go stale), letting a deliberate player complete four-stacks.

Floor arithmetic: 12 starter cards at Gate I → **30 cards across 8
factions** after the final clear, comfortably legal under the max-4
role cap, with the exam choices covering the thin Controller/Medic
spots.

---

## 6. The Visual Language

All ten boards (refreshed 2026-08-08) share one canonical style,
anchored on the main-menu and Chapter 1 backdrops: 16-bit pixel art,
hard 1px outlines, dithered sky bands, flat fills with blocky shading,
dark values with a single restrained light source, centers kept quiet
because the cards live there. Each keeps its in-game accent palette
(`data/battlefields.js`) so the CSS glows, chips and reveal cards
match the art:

| Board | Scene | Hosts |
|---|---|---|
| The Colosseum | gold dusk, ruined marble tiers, carved proving floor | I, V |
| The Narrow Pass | a canyon wound, oath-shields nailed to both cliffs | II, V |
| The Open Plains | silver-green sea of grass, the belled watchtree | III, V |
| The Mana Spring | glowing pool, water-light on the cave ceiling | IV |
| The Energy Void | starless violet, glow leaking *up* out of dead rock | VI, IX |
| The Blood Battlefield | bruise sky, ash like fleeing pages, snapped spears | VII, IX |
| The Spirit World | rootless ghost-trees, drifting books, cold stars | VIII, IX |
| The Legend's Trial | brazier terrace, twin judgement light-shafts | X |
| The Ancient Ruins | root-split temples, half-buried relics, grey dawn | X |
| The Mirror Realm | fractured floating panes over an obsidian floor | X |

Ten boards, ten gates: every board is used exactly once as a lesson,
the exams replay taught ground, and the boss fights on the three
truths never yet seen.

---

## 7. Status & Open Items

**Shipped:** all ten gates playable end-to-end; Gate I fully scripted
(prep + the 41-move match); bottom dialogue bar; in-match rival barks;
grants/coins/choice persistence; unified board art; 232 campaign
regression checks including a full replay of the scripted line.

**Open:** the balance soak of gates 2-10 against §4's curve targets
(`--teams fixed` harness), the codex/chronicle screens, the economy
pass that makes coin spendable, and Faction Blessings (a later feature
this chapter's pair-grants already prepare for).
