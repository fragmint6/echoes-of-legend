# Card Upgrades and Echo Shards

**Status:** Implemented.

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

## 4. Storage

One key, `eol.upgrades.v1`:

```
{
  v: 1,
  shards: 1234,
  cards: { "duat-anubis": { dupes: 4, lv: 2, stat: "atk" } }
}
```

`dupes` is the number of duplicates *banked and not yet spent* on a level. Levels are
purchased explicitly by the player, not auto-applied, so the choice of stat is always
deliberate.

Registered in the `cloud.js` `MAP` table; rides the existing account sync. No migration.
