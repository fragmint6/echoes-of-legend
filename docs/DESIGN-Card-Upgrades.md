# Card Upgrades and Echo Shards

**Status:** Implemented.

**Revised 2026-08-16:** the upgrade controls moved out of the card's hover overlay and
into a card detail dialog (§5); each level now carries **its own** boost (§1.3); the
shard spend moved to the Shop's Echo Shop tab (§3.5); levelling up has a ceremony and
levellable cards are flagged (§5.4); the card shows `Lv0`, three boost slots and star
pips on its frame (§5.1); and printed skill numbers scale with the card's own upgrades
(§5.5).

**Purpose:** Turn the collection's dead end into a long tail. Packs used to pay nothing
once every card was owned, and coins had exactly one sink in the entire codebase
(`shop.js` calling `econ.spend`). Duplicates now feed a bounded upgrade system, and Echo
Shards give the grind a target so it is never pure randomness.

This document records the upgrade design. It does not silently reorder `ROADMAP.md`.

---

## 1. The shape

Every card has an **upgrade level, 0 to 3**. Each level costs duplicates of that card:

| Level | Duplicates for this level | Cumulative |
|---|---|---|
| 1 | 1 | 1 |
| 2 | 3 | 4 |
| 3 | 5 | 9 |

Each level grants **both**:

- **+1.5% skill power**, compounding, rounded to whole percent for display; and
- **one stat the player chooses** — **+2% ATK**, **+2% HP**, or **+1.5 DEF points**.

### 1.0 Why DEF is points and not a percentage

DEF is not a scalable stat. It is a percentage-**point** damage reducer, clamped by the
engine to 0..75, and the whole roster spans only 10..30. A multiplicative +2% on `def:
10` rounds straight back to 10 — the DEF choice would have silently done nothing.

It gets **+1.5 flat points per level** instead, sized to match the other two options:
at max that is +5.3% to +6.9% effective HP depending on the card's base DEF, against
+6% for the HP choice. Engine and UI share the constant so they can never disagree.

Choices are **freely re-assignable** outside battle at no cost. They are locked at
battle start, so a respec can never be used as a mid-fight tactic.

### 1.1 Why these numbers

The roster's ATK band is tight and deliberate, and rarity is *scarcity, not power*
(epic ATK spans 980–1955; rare spans 1020–1955 — they overlap almost entirely). So the
ceiling is set by the tightest **intentional** margin between comparable cards, measured
from the shipped data:

| Gap | Cards |
|---|---|
| **3.45%** | Tomoe Gozen 145%@45 → Puss in Boots 150%@40 (Sniper) |
| 4.00% | Goldilocks 250%@40 → Anubis 260%@45 (Sniper) |
| 9.09% | Horus 165%@40 → Mordred 180%@40 (Sniper) |

At +1.5% per level, a single level never crosses the 3.45% floor. A fully maxed card
gains **+4.6%** total — just past that gap, but only after nine duplicates sunk into one
legend, which is the point of a long tail.

Worked example, the one from the design discussion: Anubis's 130%/260% becomes
132/264 → 134/268 → **136/272**.

### 1.2 What upgrades never touch

**Thresholds and Energy costs never move.** Anubis's execute stays at 25% HP (35% with
2+ debuffs) and stays at 45 Energy at every level.

This is the important line. Scaling a damage percentage is smooth. Moving a threshold is
a *cliff*: Anubis's 25% gate is the combo lock that Ma'at and Sekhmet exist to open, and
shifting it would make Duat's internal chain behave differently at different upgrade
levels. Costs are the same — they set the whole tempo of a turn.

Upgrades scale by **percentage, not flat points**. A flat +2 on Anubis's 260% execute is
+0.8%, but a flat +2 on Abe no Seimei's 50% is +4%; a flat bonus silently favours
weak-hitting cards.


### 1.3 One boost per level

*(Owner ruling 2026-08-16.)* Levels do **not** share a single chosen stat. Each level
carries its own, so `["atk", "atk", "hp"]` is a real build: +4% ATK, +2% HP, and the
+4.6% skill power that all three levels bought.

This makes a maxed card three small decisions instead of one toggle, and it lets a player
answer a specific question — "this Medic wants survivability, but I still want the heal to
scale" — rather than picking the least-bad single answer.

Every level's choice stays free to re-assign outside a battle (`setBoost(id, level,
stat)`), and the skill-power multiplier is unchanged: it compounds on the **level count**,
not on any one stat, so mixing costs nothing in power.

`statsFor()` and the engine's `applyUpgrades()` both compute per-stat counts from the same
array, and `sim/verify_quests_upgrades.js` asserts the two agree exactly — a mismatch there
would mean the collection lies about what a card does in a fight.

---

## 2. Where upgrades apply

Upgraded stats apply in:

- Singleplayer **Classic** (single and Unabridged)
- **Campaign**
- Multiplayer **Classic** (single and Unabridged)
- Private room **Classic** (single and Unabridged)

Cards are **stock** everywhere else — explicitly:

- **all Drafts**, singleplayer and multiplayer and private-room. Ownership already never
  gates drafts; `economy.js` calls them "the great equalizer" and they stay that way.
- **the Daily Puzzle**, whose UI promises "Everyone receives this exact board and this
  exact future luck." An upgraded board would make that sentence false, and the puzzle is
  the one mode where players compare results directly.
- **Featured Clash** and anything else added later, unless it opts in.

The enemy in a PvE battle is always stock. Campaign rivals keep their own difficulty
scaling, which is unrelated and unchanged.

### 2.1 Multiplayer: the wire and the checksum

MP exchanges card **ids** (`{ ids: [...] }`), and each client builds units from its own
copy of `data/*.js`. Every action then carries an FNV-1a checksum of the board that
hashes rounded HP and shield per unit. Upgrades that existed only locally would desync
both clients on the first hit.

So the deck message now carries upgrade levels alongside the ids
(`{ ids: [...], up: { cardId: {lv, stat} } }`), and both clients build the *same*
upgraded units. The opponent's levels are applied to the opponent's team exactly as
received.

**Known limitation, recorded deliberately:** the client is the authority here. The
server never sees decks, and `isLegal()` validates size, distinctness, role caps and
legendary count — never ownership. A modified client could already claim cards it does
not own; it can now also claim max upgrades, and the checksum will not catch it because
both clients agree on the lie.

Nothing valuable is stolen today because trophies are not live. **Server-side deck and
upgrade validation is a prerequisite for ranked play**, which `ROADMAP.md` already
implies ("matches need server-side verification before rating can be trusted"). This
adds one item to that list rather than creating a new problem.

---

## 3. Echo Shards

Shards are the targeting mechanism. Without them the grind is unreachable: because packs
have no rarity targeting, collecting 9 duplicates of one *specific* epic costs about
77 Crown packs — 76,500 coins, roughly **204 hours** of play. Shards cut that to a sane
number by letting unwanted duplicates convert into the card you actually want.

### 3.1 Yields — every duplicate pays

| Rarity | Shards per duplicate |
|---|---|
| Common | 15 |
| Rare | 60 |
| Epic | 200 |
| Legendary | 400 |

A duplicate pays shards **and** counts toward that card's upgrade at the same time. Once
a card is maxed at level 3, further duplicates pay shards only — the overflow case.

### 3.2 Crafting — shards buy duplicates of cards you own

*(Since 2026-08-16 this is spent in the Shop's Echo Shop tab, not in the collection —
see §3.5.)*

| Rarity | Shards per duplicate |
|---|---|
| Common | 300 |
| Rare | 1,200 |
| Epic | 4,000 |
| Legendary | 8,000 |

The craft cost is exactly **20× the yield of the same rarity**. That ratio is the single
dial for the whole economy: melting 20 unwanted epics buys one epic you chose. Random
pulls always beat crafting on raw value, so packs stay the primary route and shards are
the pity floor.

**Shards buy duplicates of cards you already own, at any rarity. They never buy a card
you do not own.** Crafting is an upgrade currency, not a collection shortcut — so packs
remain the only way to *widen* a collection, and coins keep their job.

### 3.3 How legendaries become upgradeable

Packs can never contain a legendary (the Crown Law) so legendary duplicates have no pack
source. Crafting solves it: any duplicate of any rarity yields shards, and shards can
craft a legendary duplicate at 8,000 each.

The Crown Law survives exactly as written. You still cannot buy a legendary you do not
own — you can only deepen one the Road already gave you. Money still buys speed on the
shelf of echoes and never buys a crown.

### 3.4 What this does to the shop

Under these yields, expected shards per 100 coins are **Trio 88 · Echoes 68 · Crown 55**.
Trio still wins on raw shard value, but Crown concentrates its yield into *epics*, which
are the expensive upgrade targets. That partially corrects the inverted price ladder
(where the no-duplicates rule made Trio strictly the best pack) without changing a single
price.

Once every card is owned, packs pay duplicates instead of refusing to open, so the shop
never dead-ends again.

---

### 3.5 Where shards are spent

*(Owner ruling 2026-08-16.)* The craft button used to live inside each card's upgrade
panel. That gave the game's second currency no shopfront at all: you could only spend it
one legend at a time, from a screen whose job was something else, and there was nowhere to
compare what your shards could buy.

Buying copies is **shopping**, so it lives in the Shop, behind a **Packs / Echo Shop** tab
pair.

The shard balance is the subject of the screen — a large counter that also states what it
can *do* ("enough for a copy of 9 of your legends"), because a number with no frame of
reference is just a number. Below it, every legend you own is a card carrying its level as
pips, the boosts it already took, a progress bar toward its next level, and its price. The
list sorts ready-to-level first, then by how few copies are missing.

Filtering is a segmented control — **Ready to level / Upgradable / All** — defaulting to
Upgradable's subset so a maxed legend is not offered a copy it cannot use. Selling into a
maxed card is a trap, not an option.

The upgrade panel keeps a **"Need copies?"** link that closes the dialog and lands you on
that tab. The rule itself is unchanged: shards buy copies of legends you **already own**,
never new ones.

---

## 4. Storage

One key, `eol.upgrades.v2`:

```
{
  v: 2,
  shards: 1234,
  cards: { "duat-anubis": { dupes: 4, boosts: ["atk", "hp"] } }
}
```

`boosts` holds one stat name **per level purchased**, so its length *is* the level — the
two can never disagree. A `v1` save (`{ dupes, lv, stat }`) is migrated on first read by
repeating its single stat `lv` times, which produces byte-for-byte identical numbers; the
old key is left in place so rolling the build back does not lose anything.

`dupes` is the number of duplicates *banked and not yet spent* on a level. Levels are
purchased explicitly by the player, not auto-applied, so the choice of stat is always
deliberate.

Registered in the `cloud.js` `MAP` table; rides the existing account sync. No migration.

---

## 5. Where the UI lives

*(Owner ruling 2026-08-16.)*

The controls originally sat **inside the card's hover overlay** in the collection. That
conflated two different jobs. Reading a card is a glance; upgrading one is a decision —
and putting the decision inside the glance meant you had to hold a hover steady to press
a button, the panel fought the skill text for room, and a 240px card carried four
controls on top of three stat bars and prose.

The split now:

| Surface | Shows | Interaction |
|---|---|---|
| **Card hover** | level badge (top-left), boost badge (top-right) | none — read-only |
| **Card detail dialog** | portrait, lore, base-vs-upgraded stats, full skill, upgrade controls | everything you can change |

### 5.1 The badges

`upgradeBadges()` in `js/app.js`. Absolutely positioned in the overlay's corners, so they
cannot push the stat bars around.

**The level, always.** `Lv0` is shown for every owned legend, not just upgraded ones — "no
badge" is ambiguous between un-upgraded and a UI that forgot. It renders quiet at zero and
lights up once there is something to show.

**Three boost slots, top-right.** One per possible level: a filled slot is a coloured icon
naming the stat that level bought (ATK amber, DEF blue, HP red — the same colours as the
stat bars), an empty slot is a dashed socket. The previous single badge collapsed the whole
build into one *dominant* stat, which meant `2×ATK + 1×HP` and `3×ATK` looked identical.

**Stars on the frame.** A levelled card wears 1–3 stars set into the middle of its top
border, readable across a scrolling grid with no hover and no click. Drawn with `clip-path`
because neither RPG Awesome 0.2.0 nor the pinned Remix set carries a plain star.

**The ready badge.** A card with enough banked copies wears a pulsing purple chevron in the
top-left corner. It is a real `.card-ready` element, not a pseudo: `.card::before` is
already the element-colour edge stripe, and `::after` would have to fight it for the same
box.

**No dead gap.** `.ov-head` used to reserve a blanket 26px of top padding on *every* card to
clear the card-top bar — which the overlay covers anyway. Only cards that actually carry
badges reserve room now, and only the 22px those need.

### 5.2 The dialog

`js/card-detail.js` + `#card-detail`. Opened by clicking a card in the collection
(`options.detail`), or by the explicit `.card-info` button in the deck builder — that grid
already answers a click by adding or removing the legend, and stealing that gesture would
cost more than the dialog is worth.

It owns presentation only. Every number is read live from `EOL.upgrades` on each paint,
and each mutation calls the same `levelUp` / `craft` / `setStat` the old in-card panel
did. After a mutation it repaints itself *and* asks `EOL.ui.repaintCard(id)` to rebuild
just the one card behind it, so the roster's badges agree without a grid rebuild that
would throw away scroll position and hover.

An **unowned** legend gets the dialog too — lore, stats and skill are worth reading before
you own it — but the upgrade block is replaced by a line explaining that packs are the
only way to widen a collection.

### 5.3 Lore

Card prose lives in `data/lore.js`, keyed by card id and attached onto `card.lore` at
load. Kept out of the faction files deliberately: those are mechanics, and prose
interleaved with effect trees makes both harder to read and turns every copy edit into a
diff against balance data. `sim/verify_all.js` enforces coverage, length, that no entry
names a card that does not exist, that each entry names its own legend, and that prose
never uses rules vocabulary (the skill text on the same panel already says that, in the
exact words the engine means).

### 5.4 Making it feel like something

Nine duplicates is a long grind, and the reward for finishing it used to be a pip quietly
switching on.

**Finding it.** A legend with enough banked copies to buy a level is flagged twice: a
pulsing dot on the card in the grid (visible without hovering — otherwise the only way to
find out was to open all 63 legends one at a time), and an explicit *Level up* pill in the
hover overlay. The dialog's panel glows and its button reads *"Level up to 2"*.

**Level 0 is stated.** An owned legend always shows `Level 0 / 3` rather than no badge at
all — "no badge" is ambiguous between un-upgraded and a UI that forgot, and a player
deciding where to spend copies needs the baseline said out loud.

**The ceremony.** Levelling up plays a flash, two expanding shockwave rings, eighteen
light shards on deterministic angles, a struck `LEVEL 2` stamp, and a count-up on the stat
that actually grew — so the animation tells you *which* choice you just bought. Level 3
gets a bigger version in the legendary colour reading `MAX LEVEL`, with its own fanfare
(`audio.ui('levelmax')`). The whole thing is one overlay appended to the dialog and
removed on completion, so nothing leaks.

Both kill switches are respected: `body[data-gfx='low']` and `prefers-reduced-motion` keep
the stamp and the numbers and drop the particles.

### 5.5 Skill text that knows its upgrades

A levelled card hits harder, but its printed Signature Skill still read *"Deal 130% ATK"* —
so the collection told the player the upgrade did nothing to the thing the upgrade is
**for**. `EOL.scaleSkillText()` (`js/text.js`) rewrites those numbers on both the hover
overlay and the detail dialog.

It rewrites **exactly** what `engine.js` multiplies by `upPower` at the effect sites: `dmg`
power / perDebuff / perBuff, `heal` power and pctMaxHp, and `shield` pctMaxHp. Everything
else is deliberately untouched, because the engine does not move it either — stat buffs,
lifesteal shares, Energy refunds, thresholds and durations all stay put. Anubis at level 3
reads *"Deal 135.9% ATK ... if the target is below 25% HP"*: the damage grew, the execute
gate did not.

Three safeguards keep it from lying:

- values come from the **spec**, not from parsing prose, so the list is exactly the set the
  engine will scale;
- each is matched with its **unit** (`ATK` / `Max HP`), because three cards print the same
  number twice with different units — Momotaro's `12% DEF` beside `12% Max HP`,
  Constantine's `10% ATK` beside `10% Max HP`. The buff stays put while the shield grows;
- a number the card uses **both** scalably and non-scalably with the same unit is skipped
  entirely. No card does this today; the guard means one added later fails safe.

Scaled numbers render in the upgrade colour with the original in a tooltip. Stock surfaces —
drafts, packs, the Daily Puzzle — never scale, because there the card really is stock.
`sim/verify_all.js` walks all 63 legends and asserts no number is scaled that the engine
leaves alone, and that every scaled number equals value × the multiplier.
