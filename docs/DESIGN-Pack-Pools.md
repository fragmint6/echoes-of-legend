# DESIGN — Pack Pools: chapter tiers and the featured shelf

*Written 2026-08-19 as a decision document. Nothing ships until the
owner picks; candidate structures are labelled, measured facts are
from the live roster, and the recommendation is at the end.*

---

## 1. What packs are today

One shelf, three tiers, one pool - every non-legendary Chapter I card
the player does not own yet:

| Pack | Price | Size | Odds (C/R/E) | Final card |
|---|---|---|---|---|
| Trio | 200 | 3 | 50 / 35 / 15 | none |
| Echoes | 500 | 5 | 45 / 35 / 20 | Epic, guaranteed |
| Crown | 1000 | 5 | 15 / 45 / 40 | Epic, guaranteed |

Two laws hold everything together:

- **The Crown Law.** No pack ever contains a legendary, in any tier.
  Crowns come from the Road alone (or from crafting a duplicate of
  one you already own).
- **Duplicates are progress.** A pack never wastes a pull: a card you
  already own pays Echo Shards and banks a copy toward its next
  upgrade level. This is what makes small pools safe.

The Chapter II shelf is withheld wholesale (owner ruling 2026-08-18b),
which was the right call while Chapter II did not exist. It exists
now, which is exactly why this document is being written.

## 2. Measured pools

| Pool | Factions | Cards | Legendaries | Packable (non-legendary) |
|---|---|---|---|---|
| Chapter I | 8 | 55 | 9 | **46** |
| Chapter II | 8 | 60 | 8 | **52** |

The two pools are nearly the same size, which matters: the existing
tier odds were tuned around a ~46-card pool, so per-chapter tiers can
**reuse the tuned numbers unchanged**. Splitting into chapter pools
also fixes, for good, the dilution problem that motivated the
withhold - a Chapter I player's odds of any specific Chapter I card
never move again.

A two-faction featured pool is ~9-18 packable cards; a three-faction
pool ~15-30. Duplicates will arrive fast in featured packs - which is
fine, because duplicates are shards and upgrade copies now, and the
copy bank is already capped (a card can hold at most the copies its
levels consume; overflow becomes shards). Nothing runs away.

## 3. The proposed structure

### 3.1 One shop, chapter segmented control

The Packs tab gains a segmented control:

> **[ Chapter I · The Road ] [ Chapter II · The Concord ] [ Featured ]**

Each chapter section shows the same three tiers with chapter-flavored
names and a one-line description, mechanically identical to today's
Trio/Echoes/Crown:

| Tier | Chapter I name | Chapter II name | Price | Size | Final |
|---|---|---|---|---|---|
| 1 | Kindling | Chalk | 200 | 3 | none |
| 2 | Lantern | Tablet | 500 | 5 | Epic |
| 3 | Beacon | Register | 1000 | 5 | Epic |

(Names are proposals - the rule is just "same three tiers, chapter
voice". The Concord's "Chalk / Tablet / Register" runs on the
chapter's own record-keeping imagery.)

Why ONE shop rather than two storefronts: the wallet, the shard
counter, the pack ceremony, the code redemption and the collection
count all already live in one room. A segmented control is one row of
buttons; a second storefront is a second of everything.

### 3.2 The Featured shelf - the Pact Pack

One daily pack, 3 factions, cross-chapter allowed:

- **Price 700, size 3** - and the guarantee is the point: **one card
  from each of the three featured factions.** That makes every Pact
  Pack teach a three-way line instead of being a lucky dip.
- Odds within each faction's slot follow the faction's own rarity
  mix; legendaries are excluded per the Crown Law.
- The pack face shows the three faction crests; hovering names the
  synergy ("the fallen count and the marks that feed it").
- **Rotation: daily**, matching the Daily Puzzle cadence - 16
  factions at 3 per day means every faction is featured roughly every
  five days, and the rotation is authored, not random, so the pairs
  are always meaningful. A weekly rotation would leave a faction
  unbuyable for a month.

**Authored pairings matter more than chapter borders.** The game's
whole design praises factions that feed each other; the featured
shelf should be the storefront of that philosophy. A starting list:

| Featured three | Why |
|---|---|
| Asgard · Roma · Kami | deaths are the currency: the fallen count, the kill engine, the sacrifice |
| Olympus · Huaxia · Devas | the mark circuit: supply, consume, supply |
| Hemithea · Asgard · Duat | ally death turns the mortals on - and Medea answers it |
| Genesis · Pandemonium · Tortuga | announced prices, paid prices, stolen prices |
| Grimmwood · Sherwood · Camelot | the Chapter I classic: woods, outlaws, walls |
| Transylvania · Kami · Huaxia | what is taken, what is given back, what is marked |

Each rotation ships with a one-line "why these three" note, which is
also how the game teaches the cross-faction language to new players.

### 3.3 What the featured pack is NOT

- It is not a legendary door. Crown Law applies - featured or not,
  no pack contains a crown.
- It is not random. The roster is curated and the rotation is
  authored, because "Featured" that nobody chose is just the old
  pool wearing a hat.

## 4. The Chapter II unlock question

Options:

- **Open from boot.** The chapter select is already open, the Road
  is playable, and duplicates are progression - so Chapter II packs
  cannot spoil anything the ledger fog does not already hide.
- **Unlock after Gate XI falls.** A first-clear gate keeps a small
  ceremony ("the Concord now sells its chalk to you") and preserves
  a whisper of the reveal arc.
- **Unlock after the chapter is cleared.** Too slow - the player
  needs the cards to play the chapter, not after.

**Recommendation: open from boot.** The original withhold existed
because Chapter II was unplayable and its pool was diluting Chapter I
odds. Both reasons are gone - per-chapter pools fix the dilution, and
the Road is live. Gate XI's reward (Achilles) stays meaningful
because it is the faction's legendary, and legends are never in
packs anyway.

## 5. Honest scope

The design is small; the bookkeeping is where the work is:

- pack definitions gain `pool` (chapter id or featured set) and the
  featured rotation data;
- economy's `packableEntries` becomes pool-aware;
- the shop UI gains the segmented control and the featured shelf;
- `verify_chapter2.js` sections G/H currently assert the closed
  shelf - they flip to assert per-chapter pools and the Crown Law;
- the odds copy in index.html and the economy sim update.

One afternoon of implementation, one day with the ceremony polish.

## 6. Open questions for the owner

1. Tier names - keep "Trio / Echoes / Crown" everywhere, or the
   chapter-voiced names above?
2. The Pact guarantee - one card per featured faction (recommended),
   or a plain random draw from the three?
3. Featured rotation - daily (recommended), or weekly?
4. Chapter II packs - open from boot (recommended), or after Gate
   XI's first clear?
5. Featured price - 700 for a 3-card pack with the faction guarantee
   sits between Echoes and Crown. Sit with that, or move it?
