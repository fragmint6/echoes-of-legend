# Echoes of Legend

A 6v6 folklore card battler prototype: hero codex + a playable battle mode
against a bot.

## Run

Just open `index.html` in a browser. Data files load via plain `<script>` tags
(not `fetch`), so it works from `file://` with no server needed.

Optional local server:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Structure

```
echoes-of-legend/
├── index.html               # all three views + CDN links
├── css/style.css            # theme, cards, collection, battle
├── js/
│   ├── app.js               # view routing, collection grid, filters
│   ├── engine.js            # combat engine (data-driven, UI-free)
│   ├── ai.js                # enemy bot
│   └── battle.js            # battle board rendering + input
└── data/
    ├── _schema.js           # registry + documented card schema
    ├── roles.js             # the 6 role default abilities
    ├── camelot.js           # one file per faction
    ├── olympus.js
    ├── eastern-legends.js
    └── grimmwood.js
```

## Combat

**Board.** Horizontal layout: commanders + Energy in the HUD on top, your team
on the **left**, the enemy on the **right**, action options along the bottom.

Each side is a 2 x 3 formation — slots 0-2 are the **front row**, 3-5 the
**back row** — rotated so both front rows face the centre line (your front row
is your right column, the enemy's is their left column).

Stats (HP bar, ATK, DEF) sit **above each card** and are always visible;
buffed/debuffed values turn green/red. Cards carry the same chrome as the
collection: rarity frame + pip, corner filigree, rotating rune ring, element
orb and role plate.

**The hero panel** floats in the empty space beside the board — allies open it
on the **left**, enemies on the **right** — so the two teams stay centred.
Hovering previews a hero; clicking one of yours locks the panel there and makes
its abilities clickable. The layout is identical either way, so nothing shifts
when you click.

Each grid cell is split in two: a **stats block** (HP bar + icon, ATK, DEF) that
never moves, and the **card** below it, which is the only part that reacts to
hover. Hovering the stats does nothing.

Card art is locked to the collection's **250:355** ratio. CSS alone couldn't
hold it here (`min-content` can't resolve an aspect-ratio height inside a flex
column), so `sizeBoard()` sets the grid's column width from the measured row
height on every render and on resize.

Enemy cards are **not selectable** — clicking one clears your selection. They
only become clickable while you're picking a target for an ability.

**Energy.** Both sides start each round with a fixed pool:
round 1 = 30, then 50, 70, 90, and 100 from round 5 on.
Every hero may act **once per round**.

**Two abilities per hero.** Their signature ability, plus a **Basic** based on
role — Guard / Strike / Spell / Disrupt / Restore / Aim, defined in
`data/roles.js`. Every Basic costs **15 Energy**.

Silence blocks a hero's signature Active but *not* their Basic.

**Targeting** is derived from role, then overridden per-ability:

| Role | Default reach |
|---|---|
| Tank, Bruiser | front row only, until it is wiped out |
| Caster, Sniper, Controller | any enemy |
| Medic | allies only |

Taunt overrides everything; Untargetable units are skipped. Legal targets get a
pulsing green ring, your selection a gold one.

**Ending your turn.** Once you have no legal moves left, the End Turn button
fills over 5 seconds and then hands over automatically — click it any time to
go immediately.

**Escalation.** From round 9, damage grows +15% and healing decays -10% per
round. Without this, two-Medic teams reach a heal/damage equilibrium and the
battle never ends — 80 of 400 simulated games hit the round cap before this was
added, and 0 do now.

### Extending abilities

`engine.js` interprets declarative specs, so most new abilities are **data, not
code**:

```js
spec: {
  target: { side: 'enemy', pick: 'single', row: 'front' },
  effects: [
    { k: 'dmg', power: 2.1, element: 'Nature' },
    { k: 'lifesteal', pct: 25, if: { targetHpBelow: 0.5 } }
  ]
}
```

Effect kinds: `dmg`, `heal`, `lifesteal`, `stat`, `shield`, `taunt`,
`untargetable`, `silence`, `healMod`, `cleanse`, `costMod`, `stealEnergy`,
`swapTargets`, `swapWithSelf`, `revive`, `delayed`, `randomOf`,
`copyAllyActive`.
Conditions: `targetHpBelow/Above`, `targetBackRow`, `targetHasDebuff`,
`targetElement`, `killedTarget`.
Passive triggers: `allyBelowHp`, `allyDamaged`, `allyDied`, `selfAttacked`,
`wouldDie`, `incomingAbilityDamage`, `static`.

## Views

The app is a two-view SPA (no router, just `.view.active` toggling):

- **Home / dashboard** — animated title lockup with **Play** and **Collection**.
- **Battle** — the 6v6 board (see Combat below).
- **Collection** — every hero in one flat grid, sorted **alphabetically**
  (factions are no longer used as section headers, only as a filter).

## Card design

- **The icon IS the art.** Each hero's RPG Awesome glyph fills the whole card,
  rarity-tinted, over a slow-rotating rune ring. No bitmap images anywhere.
- **Resting state** shows only rarity tag, element orb, role, and name over a
  vignette — clean and readable.
- **On hover** the art pushes back (scale + blur + fade), a sheen sweeps across,
  and a blurred glass overlay fades in with the stats and ability. Overlay
  contents rise in a **staggered cascade** and the HP/ATK/DEF bars animate
  outward from zero.
- **Rarity drives color** throughout: frame gradient, corner filigree, glow,
  and the ability accent for Actives (Passives use a green accent).
- **Touch devices** get tap-to-toggle instead of hover, and the hint text
  automatically reads "Tap for details".

## Collection UI

- Faction / Rarity / Role are **custom dropdowns** (not native `<select>`, so
  they can carry icons and match the theme). One menu opens at a time; click
  outside or press `Esc` to close. Active filters get a blue-tinted button.
- Filters combine with the live search box; the reset button clears everything.
- The **toolbar is deliberately static** — it scrolls away with the page rather
  than sticking to the top.
- The page uses a **custom scrollbar** themed to the site (12px, rounded
  blue-violet thumb, no stepper arrows). Firefox gets `scrollbar-width` via an
  `@supports (-moz-appearance: none)` guard, because Chromium also honours that
  property and would otherwise shrink the styled WebKit bar.

## Ability text conventions

- Written as **prose, one sentence** where possible — no bullet lists.
- In battle the two abilities are labelled **Skill** (signature) and **Basic**.
- Element names inside ability text are **colour-coded automatically** by
  `EOL.colorElements()` (`js/text.js`), which walks the string and skips
  anything inside an HTML tag, so it can't corrupt the `<b>` markup.
- **Passives never have a cooldown**; only Actives carry an Energy cost.
- Stacking caps and limits go in the separate `note` field, which renders as
  italic small print under the text (e.g. "Max: 5 stacks.", "Once per battle.").

The ability box uses `margin-top: auto` so it **hugs its own content** and sits
flush at the bottom of the card. Boxes are therefore different heights per
hero (81–128px in the current roster) but every footer lines up — verified at a
uniform 3px from the card bottom across all 24.

## Adding a new faction

1. Create `data/my-faction.js` following the schema in `data/_schema.js`.
2. Call `window.EOL.registerFaction({...})` in it.
3. Add one `<script src="data/my-faction.js">` line to `index.html`.

The faction dropdown option is generated automatically from the data, and the
new cards merge into the alphabetical roster.

## Status effects

Every buff and debuff the engine can apply has its own icon, colour and label,
defined once in `window.EOL.STATUS` (`js/text.js`): ATK/DEF/Crit up and down,
Taunt, Untargetable, Shield, Silence, Marked, Healing Reduced, and ability cost
up/down. `statusesOf()` collapses a unit's live state into a de-duplicated list
(repeats show a small count badge).

They render in the card's top-left corner in a **grid of 3 per row** —
green-bordered for buffs, red for debuffs.

## Motion

Nothing in the game pops in or out. Views cross-fade, the hero panel and result
overlay fade + slide, filtered collection cards shrink away, and status chips
scale in. Anything that used `display: none` now animates through
`opacity`/`transform` with `visibility` on a matching delay so it still leaves
the layout when hidden.

## Input & chrome

- Nothing in the game is selectable or editable; `user-select` is disabled
  globally and re-enabled only for real `input`/`textarea` elements.
- Eight hand-drawn SVG cursors in `assets/cursors/` cover every state:
  default, pointer, target (picking a target), not-allowed, text, grab,
  grabbing and wait (while the bot thinks). They're wired through
  `--cur-*` custom properties, with a small override block at the end of
  the stylesheet so component-level rules can't beat them.

## Icon libraries

| Library | Use | Count |
|---|---|---|
| [RPG Awesome](https://nagoshiashumari.github.io/Rpg-Awesome/) | fantasy glyphs — `ra-*` | ~500 |
| [Remix Icon](https://remixicon.com/) | UI glyphs — `ri-*` | ~2800 |

Both load from jsDelivr. Every `ra-*` name used here was verified to exist in
the stylesheet — RPG Awesome lacks some obvious names (there's no `ra-flame`,
`ra-monkey`, or `ra-cauldron`), so check the reference before inventing one.

## Roster

24 heroes across 4 factions (6 each): Camelot, Olympus, Eastern Legends, Grimmwood.

## Notes for the next step

Collection stat bars scale against `MAX` in `app.js`
(`hp: 8500, atk: 1150, def: 50`) — bump these if you add stronger heroes.

`engine.js` has no DOM dependencies, so it can be loaded in Node for
simulation/balance testing (that's how the escalation threshold was tuned).
