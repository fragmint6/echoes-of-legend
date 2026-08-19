# Card Upgrades and Echo Shards

**Status:** Implemented.

**Revised 2026-08-16:** the upgrade controls moved out of the card's hover overlay and
into a card detail dialog (§5); each level now carries **its own** boost (§1.3); the
shard spend moved to the Shop's Echo Shop tab (§3.5); levelling up has a ceremony and
levellable cards are flagged (§5.4); the card shows `Lv0`, three boost slots and level
stars on its frame (§5.1); printed skill numbers reflect the card's own upgrades (§5.5);
the skill bonus is now **flat** (§1.4); a level also costs **500 coins** (§1.5); a card
holds at most **nine copies** (§3.6); a new level defaults visibly to **ATK** (§1.6);
and **every legend** now has something an upgrade can raise (§1.7).

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

- **+2 percentage points to every magnitude in its Signature Skill** (§1.4); and
- **one stat the player chooses, per level** — **+5% ATK**, **+7% HP**, or
  **+3 DEF percentage points** (§1.3).

It also costs **500 coins** (§1.5).

### 1.0 DEF uses percentage points

DEF is already displayed as a percentage damage reducer, so its booster adds **3 flat
percentage points** per chosen level. A Tank at 30% DEF therefore moves to 33%, exactly
as shown in both the detail dialog and battle state.

Choices are **freely re-assignable** outside battle at no cost. They are locked at
battle start, so a respec can never be used as a mid-fight tactic.

### 1.1 Why these numbers

Each level grants **+5% ATK, +7% HP, or +3 DEF percentage points** for that level's chosen booster
(§1.3), plus **+2 percentage points to every magnitude in the card's own Signature
Skill** (§1.4).

### 1.2 What upgrades never touch

**Thresholds and Energy costs never move.** Anubis's execute stays at 25% HP (35% with
2+ debuffs) and stays at 45 Energy at every level.

This is the important line. Scaling a damage percentage is smooth. Moving a threshold is
a *cliff*: Anubis's 25% gate is the combo lock that Ma'at and Sekhmet exist to open, and
shifting it would make Duat's internal chain behave differently at different upgrade
levels. Costs are the same — they set the whole tempo of a turn.

The **stat** share is a percentage; the **skill** bonus is flat points (§1.4). Those are
different jobs. A stat multiplies a number the engine already scales by round, buffs and
battlefield, so a percentage keeps it proportional. A skill coefficient is a number the
player reads off the card, so flat points keep it legible — and yes, that means +2 is
worth relatively more to Abe no Seimei's 50% than to Anubis's 260%. That is the intended
direction: the small-coefficient cards are the ones whose upgrades were invisible.


### 1.3 One boost per level

*(Owner ruling 2026-08-16.)* Levels do **not** share a single chosen stat. Each level
carries its own, so `["atk", "atk", "hp"]` is a real build: +10% ATK, +7% HP, and the
+6 skill points that all three levels bought.

This makes a maxed card three small decisions instead of one toggle, and it lets a player
answer a specific question — "this Medic wants survivability, but I still want the heal to
scale" — rather than picking the least-bad single answer.

Every level's choice stays free to re-assign outside a battle (`setBoost(id, level,
stat)`), and the skill bonus is unaffected by the mix: it counts **levels**, not any one
stat, so a mixed build loses nothing in skill power.

`statsFor()` and the engine's `applyUpgrades()` both compute per-stat counts from the same
array, and `sim/verify_quests_upgrades.js` asserts the two agree exactly — a mismatch there
would mean the collection lies about what a card does in a fight.

### 1.4 The skill bonus is FLAT

*(Owner ruling 2026-08-16.)* A level adds **+2 percentage points** to the skill's own
printed numbers. A 50% hit becomes 52% at level 1 and 56% at max — not 50.75%.

The previous rule was a compounding ×1.015 multiplier. It was defensible on paper and
illegible in practice: nobody can read "130% ATK" and a level badge and work out 132.0,
and the second level did not add the same amount as the first. Flat points mean the card
text *is* the arithmetic.

**What moves** is every magnitude the signature owns: damage coefficients (including
per-debuff and per-buff riders), heal and shield percentages, the stat swings the
signature applies, lifesteal shares, revive percentages, counter-strike power, and the
taunt riders. Debuffs deepen rather than shrink — Morgan's `-30% ATK` becomes `-36%`, and
a damage-taken multiplier like Athena's `0.85` drops to `0.79`.

**What never moves**: thresholds (`below 25% HP`), durations (`for 2 rounds`), Energy
costs and refunds, and counts (`2 enemies`). A cliff is not a curve; moving one silently
rewrites every combo tuned against it.

`upAdd()` / `upPts()` / `upToward()` in `js/engine.js` are the single implementation, and
`EOL.scaleSkillText` mirrors them so the printed card and the fight agree.

### 1.5 A level also costs coins

*(Owner ruling 2026-08-16.)* **500 coins**, flat, on top of the duplicates.

Copies alone were a pure time gate — you either had them or you waited. A price makes
levelling compete with packs for the same wallet, which is what turns "can I?" into
"should I?". Flat rather than per-rarity, because the duplicate cost already scales the
grind and a legendary is hard enough to level without a second multiplier.

Taken through `econ.spend()` so the one wallet stays the only place coins move, and
checked **before** anything is deducted, so a failed level-up costs nothing.

---

### 1.6 A new level defaults to ATK

Buying a level selects **ATK** immediately, so the purchase always produces a visible raw
stat increase. Every level remains freely re-assignable to HP or DEF outside battle.
Legacy saves may still contain a `null` choice; the array's length remains the level so
those saves retain their full skill bonus until the player chooses a stat.

### 1.7 Every legend benefits

Fourteen legends originally gained nothing from an upgrade: their entire signature is a
stat swing, a damage multiplier, or a copy, and the old power multiplier touched none of
those. §1.4 extended the bonus to every magnitude a signature owns, which fixed thirteen
of them.

**Medusa was the last.** Her gaze applied `Exposed` and nothing else — a binary status
with no number anywhere in it. Scaling its *duration* was rejected outright: a duration is
a cliff, and `1 round` becoming `2` would silently double the combo window every Duat and
Camelot payoff is tuned against. Instead her gaze now bites for **25% ATK Shadow**, a
small number that is genuinely hers to grow (25% → 31% at max) and leaves the debuff as
the reason to field her.

This is verified by behaviour, not by inspection. `sim/verify_quests_upgrades.js` drives
every legend through nine scenarios — casting its signature, taking a signature, taking a
basic twice, landing two basics, an ally killing, an ally dying, taking a lethal blow, an
ally casting — at level 0 and level 3 with the **stat boost held equal**, so only the
skill bonus can differ. Any legend whose fingerprint is identical across both fails the
suite.

*(Three earlier versions of that audit reported false positives — a probe that never
managed to cast, or that let the stat boost mask the result. The current one holds the
stat constant and uses the engine's own `autoPick` and `noOpeningLimit` so every cast
actually lands.)*

---

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

**The levels and the ids are ONE message and must be latched together.** The two clients
never reach a phase at the same instant, so `netplay.js` latches an opponent's `six`
that arrives before this client has opened the phase, and replays it when `startSix()`
runs. `startSix()` therefore must not clear `six.up`: it used to, while leaving
`six.theirs` in place, so a fast opponent's ids survived the latch and their **levels
were thrown away**. The receiving client then built that team stock while the sender
built it upgraded — two different boards, and the first hit failed the checksum and
killed the match as a desync. Only `end()` resets the pair, together.

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

### 3.6 Nine copies, and not one more

*(Owner ruling 2026-08-16.)* A card can hold **at most nine duplicates** — exactly what
its three levels consume (1 + 3 + 5). Once the bank covers every remaining level, the
Echo Shop refuses to sell another.

This was a real bug, not just a UI gap: `craft()` took the shards and *then* clamped
`dupes` to the remaining need, so buying into a full bank charged full price for nothing.
It now returns `{ ok: false, reason: 'full' }` before any currency moves, the card is
shown as *"All 9 copies banked"*, and its buy button is disabled.

`copiesWanted(id)` is the shared predicate — remaining level costs minus what is banked.

---

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

**The level, top-left.** Just the number in the card's display face — no pill, no border.
A bordered capsule around two characters was the heaviest thing in the corner for the least
information.

**Three boost slots, top-right.** One per possible level, laid out horizontally and
positioned individually — deliberately *not* wrapped in a container, which made three 18px
icons read as a widget rather than as state. A filled slot is a coloured icon naming the
stat that level bought; an empty slot is a dashed socket.

**One colour per stat, everywhere.** ATK amber `#ffb347`, DEF blue `#5fb2ff`, HP red
`#ff5f7e` — the same three in the stat tiles, the card's boost slots, and the dialog's
boost buttons. A selected ATK looks like ATK wherever you meet it, so a build reads without
a legend. The previous single badge collapsed the whole build into
one *dominant* stat, so `2×ATK + 1×HP` and `3×ATK` looked identical.

**Level stars on the frame.** A levelled card wears 1–3 gold stars in the middle of its top
border, readable across a scrolling grid with no hover and no click. They sit in a **notch
cut out of the frame** — the card's own surface, with no top border — so they read as part
of the border rather than a badge parked on it.

Deliberately large: 15px stars in a 26px notch. This is the card's headline fact and it has
to survive a scrolling grid, so the earlier 8–11px version was too timid. The points are
**rounded** rather than the classic ten-point polygon, whose needle tips alias badly at this
size. Drawn with `clip-path` because neither icon set carries a plain star. `card-top`
reserves room either side so a long rarity word cannot run under them.

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
that actually grew.

The dialog is **patched field by field** (`refreshQuiet`), never re-rendered and never
node-swapped. A full rebuild tore the panel down mid-animation; replacing just the `.cd-up`
node still re-flowed the dialog. Both read as the popup blinking out and reappearing. Now
the pips, the copies line, the button and the summary are each written in place, and a new
level **appends** one row — so a boost the player already chose cannot flicker or reset.

**The stat tiles** keep a *"was N"* line beside any stat an upgrade moved. The node is
always rendered and simply hidden when the stat is unchanged, so `refreshQuiet` can toggle
and re-text it in place — if it were conditional, re-pointing a boost would have to rebuild
the tile, which is the re-render this dialog exists to avoid, and the line went stale
instead.

**The copies line** is one shape at every state: `8 / 3 copies`, held over what this level
costs. It used to switch between *"Ready to level up"*, *"2 / 3 copies"* and a
parenthesised *"(9 banked)"* — three readings of one fact. The numerator is deliberately
**not** clamped: `9 / 1` is true and useful, because it says the next two levels are
already paid for. Level 3
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

It rewrites **exactly** what the engine moves (§1.4), by the same flat points. Anubis at
level 3 reads *"Deal 136% ATK ... if the target is below 25% HP"*: the damage grew, the
execute gate did not.

**The multiplier passives were the last gap.** `damageMult`, `damageResist`,
`outgoingMult` and `healMod` store a *factor* (`0.85`, `1.12`) but print the *distance
from 1* ("15% less damage", "12% increased damage"). Because no printed percentage ever
matched the stored number, Athena, Benkei, Robin Hood and Lu Bu read as unupgradeable at
every level even though the engine was scaling them correctly. The collector now converts
factor → printed percentage, so Athena's *"15% less damage"* reads **21%** at max.

Two other blind spots closed with it: a top-level `spec.choose` (Qin Shi Huang keeps his
two wall options there, not inside an effect) and `copyAllyActive.scale` (Kaguya, whose
entire signature is the copy). **All 63 legends** now show their upgrades in text, which
`sim/verify_all.js` asserts as an exact count rather than a threshold.

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

---

## 6. The surfaces a levelled card must show it on

*(2026-08-19. §2 says where upgrades **apply**; this says where they are **visible**. The
two drifted apart: the engine was applying levels correctly in every mode §2 lists, but
three of the four screens a player actually looks at were still drawing stock cards, so
the whole system read as "not working" even where it was.)*

| Surface | Shows | Built by |
|---|---|---|
| **Collection card** | Lv badge, three boost slots, level stars, upgraded stat bars, scaled skill text | `buildCard` / `upgradeBadges` (`js/app.js`) |
| **Card detail dialog** | base-vs-upgraded stats, per-level boost rows, scaled skill text, the controls | `js/card-detail.js` |
| **Preparation board** | level stars + boost pips on the tile; level block, upgraded stats and scaled signature in the hover panel | `boardCard` / `showPrepTip` (`js/play.js`) |
| **Live battle** | level stars + boost pips on the card; level block, live stats and scaled signature in the flyout | `battleUpgradeChrome` / `paintDock` (`js/battle.js`) |

Three rules hold on every one of them:

- **Your legends only.** The rival is always stock, so rival tiles and rival flyouts never
  render upgrade chrome. `prepUpgradeLevel()` in `js/play.js` is the preparation board's
  copy of the `upgradesFor()` predicate, asked of one card, and it returns 0 for the enemy
  side, for drafts, and for the puzzle — the same answer the engine will act on.
- **The Basic never scales.** Only the card's own Signature Skill carries the flat bonus,
  because that is exactly what `upAdd()`/`upPts()` do in the engine. A role Basic is shared
  machinery and prints stock numbers on every surface.
- **The numbers must equal `statsFor()`.** The preparation tile, the battle card and the
  fight all read the same maths, so a player never inspects one number and fights with
  another. Champions are the single documented exception: the Legend's Trial HP bump is a
  battlefield effect applied *after* upgrades, and it belongs to the board, not the card.

### 6.1 What was wrong before

- **The battle flyout showed nothing.** The upgrade block and the scaled-skill logic lived
  in an `abilityTip()` builder that no code path ever called; the live panel is
  `paintDock()`'s flyout, which had neither. Both now live on the flyout itself.
- **The preparation board showed nothing.** It is the screen where the six is *chosen*, and
  it drew stock tiles and a hover panel whose HP came straight off the card — so an
  all-HP build was invisible at the exact moment it mattered.
- **The multiplayer latch dropped the opponent's levels** (§2.1).
- **The printed worth was wrong.** The boost slots titled every stat `+2% <stat>` and the
  dialog promised `+2% of a stat`; the real boosters are +5% ATK, +7% HP and +3 DEF
  points. The `+2` belongs to the *skill* bonus, which is what made the error easy to
  miss. The level-up ceremony was still announcing the retired `+1.5% skill power`. All of
  these now read their figures from `EOL.upgrades` so they cannot drift again.

### 6.2 The hover sheen is gone

*(Owner request 2026-08-19.)* Collection cards no longer carry `.card-sheen` — the
diagonal shine that swept across on hover. It washed over the portrait, the stat bars and
the upgrade chrome that hover exists to reveal. Removed as a **node**, not hidden in CSS:
a card-sized gradient layer that is never visible is still a layer the compositor carries
for every card in a scrolling grid.

---

## 7. Campaign difficulty is rival card levels

*(Owner ruling 2026-08-19.)*

Heroic and Legend used to be a flat **x1.1 / x1.2** multiplier on rival ATK and DEF
(`enemyStatBonus` → `scaledRivalStats`). That predates this document: difficulty shipped
before upgrades did, and once upgrades existed the multiplier was an arbitrary *second*
scaling system sitting beside a real one. A harder rival should be a rival with
**levelled legends** — the same mechanic the player uses, read off the same card chrome.

| Difficulty | Ordinary gates | Elites & final boss |
|---|---|---|
| Normal | stock | stock |
| Heroic | Level 1 | Level 2 |
| Legend | Level 2 | Level 3 |

"Elite" is the predicate the coin table already uses (`eliteStages` plus the chapter's
`lastStage`), so the difficulty curve and the payout curve can never disagree about what
a gate is.

### 7.1 The boosters are fixed by role

A rival has no player to choose its boosters, and a random pick would make the same gate
harder or easier on a reroll. Each role takes the booster its job wants:

| Role | Booster |
|---|---|
| Tank, Bruiser | **HP** — they are there to survive the turn |
| Sniper, Caster | **ATK** — they are there to end it |
| Controller, Medic | **DEF** — they are there to still be standing |

`RIVAL_BOOST` in `js/campaign.js` is the one table, and
`sim/verify_campaign_difficulty.js` reads it out of the module source and compares it to
its own copy — a mirror that is never compared is a second source of truth.

### 7.2 What this touches

`rivalUpgrades(stage, difficulty)` builds a standard `{ cardId: {lv, boosts} }` payload
from the stage's enemy **twelve**, so a benched card costs nothing and a fielded one is
already levelled. It rides `cfg.enemyUpgrades` through `startPrep` → `BATTLE().start` →
`createBattle`, and is run through `upgrades.sanitize()` on the way, so a bad stage table
cannot hand the engine an illegal level.

- **Normal passes `null`**, which leaves the engine's stock default in place — the same
  thing that keeps drafts and the Daily Puzzle honest.
- **Campaign drafts stay stock on both sides.** Ownership never gated drafts and levels
  do not either; `launchDraft()` deliberately does not call `rivalUpgrades`.
- **Unabridged exams carry it through all three games** (`setState.enemyUpgrades`), or the
  set would be hard in game 1 and stock in games 2–3.
- **The preparation board shows it.** `prepUpgradeLevel()` reads the rival's level out of
  that payload rather than the player's collection, so a Legend-tier boss wears its stars
  *before* the player commits their bans.

`enemyStatBonus` is set to **0** on every tier rather than deleted. It is still threaded
through `play.js`, `battle.js` and the engine, and a future event or modifier may want a
raw multiplier that is not a card level; zeroing it here turns the system off in one place
instead of ripping out a working path.
