# Campaign Mode - Design Proposal (ARCHIVED)

> **SUPERSEDED 2026-08-05.** The campaign that is actually being built is
> specified in **`docs/DESIGN-Campaign-Chapter1.md`** (Chapter 1: "The
> Road of Echoes" - 10 personality-rival stages, Gilgamesh finale). This
> older proposal is kept for two things that remain true and useful: the
> difficulty findings (AI search depth is NOT a usable difficulty dial;
> first-mover advantage swamps AI quality in fixed mirrors) and the
> reuse map of existing machinery below.
>
> Original status: proposal ONLY, no code written, concept superseded.
> Original goal: the place a new player *starts*, learning one faction at
> a time - combos, synergies, and keywords - on a ramping difficulty curve.

---

## 1. What the codebase already gives us

Before designing anything, I checked what exists. Campaign needs less new machinery than
it looks like:

| Need | Already exists | Where |
| --- | --- | --- |
| Fixed, hand-authored teams | `BATTLE().start({teams:{player,enemy}})` bypasses deck building entirely | `js/battle.js:2872` |
| Teaching overlays | `coachShow(key, icon, title, body)` - fires once per context, remembers via localStorage | `js/play.js:101` |
| Progress persistence | `localStorage` pattern used by decks (`eol.decks.v1`) and coach (`eol.coach.v1`) | `js/deck.js`, `js/play.js` |
| A home-screen entry point | `#mode-campaign` button, currently `disabled` placeholder | `index.html:330` |
| Difficulty knobs | `AI.setDepth()`, `AI.setSimulationBudget()` | `js/ai.js` |

**The campaign is mostly content + a map screen.** That is the good news.

---

## 2. The finding that should shape the design

I measured difficulty two ways before recommending a curve. The results matter:

### AI search depth is NOT a usable difficulty dial

Fixed mirror teams, varying only the enemy's search depth:

| Enemy depth | Player (depth 4) win rate |
| --- | --- |
| 1 | 63 - 67% |
| 2 | 63% |
| 4 | 92 - 96% |

Difficulty is **non-monotonic** - a *deeper* enemy AI made the player win *more*. And the
control run explains why:

| Both sides same depth | P1 win rate |
| --- | --- |
| 1 | 100% |
| 2 | 88% |
| 4 | 92% |

**In a fixed-team mirror, whoever moves first wins ~90% of the time.** First-mover
advantage swamps AI quality. (In the balance sim this is invisible because teams are
randomised and the opener alternates by round - but a campaign uses *fixed* teams, which
is exactly the case where it dominates.)

> ⚠️ **Design consequence:** do not build the difficulty curve on `AI.setDepth()`. It does
> not do what it appears to do, and in fixed-team fights it can invert.

### Roster quality IS a usable dial

Same player six, progressively stronger enemy sixes:

| Enemy roster tier | Player win rate |
| --- | --- |
| T1 commons/rares | 100% |
| T2 mid | 96% |
| T3 strong | 46% |
| T4 elite | 58% |

That is a real, tunable curve. **Difficulty should come from the enemy's roster and
composition, not from the AI's cleverness.**

A secondary, very controllable dial: **who opens the fight**. Given first-mover is worth
~40pp in fixed teams, letting the player open early missions and the enemy open late ones
is a large difficulty lever that costs nothing to implement.

---

## 3. Structure

**8 chapters - one per faction, in a deliberate teaching order.** Each chapter is
4 missions plus a boss. 40 missions total.

Order is chosen so each faction's keyword builds on the last:

| # | Chapter | Teaches | Why here |
| --- | --- | --- | --- |
| 1 | **Camelot** | Shields, Taunt, Exposed; the front/back row | Most forgiving. Shields make mistakes survivable. |
| 2 | **Sherwood** | Targeting, focus fire, Exposed payoff | Consumes ch.1's Exposed. Teaches "kill the right thing." |
| 3 | **Olympus** | Marks - apply then consume | First true two-card combo. |
| 4 | **Huaxia** | Marks + counterplay, revive, counter-strike | Deepens Marks; introduces reacting to the enemy. |
| 5 | **Grimmwood** | Debuffs, Burn, coin-flip variance | Teaches debuff stacking and risk. |
| 6 | **Yamato** | Energy economy, cost manipulation | Resource management, once combat is understood. |
| 7 | **Roma** | Kill-chains, Triumph payoffs | Rewards sequencing - needs everything above. |
| 8 | **Takamagahara** | The Divine Cycle; punishing/undoing | Hardest. Assumes fluency in every keyword. |

### Mission shape inside a chapter

1. **Mission 1 - Handed a script.** Fixed 3v3, player team pre-built, a coach overlay
   names the combo and the *exact* two cards. Nearly unloseable.
2. **Mission 2 - Same combo, real pressure.** 4v4, enemy actually fights back.
3. **Mission 3 - Add a partner.** 5v5, introduces a cross-faction card that plugs into
   the chapter's keyword.
4. **Mission 4 - Build it yourself.** 6v6, player picks 6 from a pool of ~9. First real
   agency.
5. **Boss.** 6v6 vs a hand-authored gimmick team that *punishes* the chapter's keyword,
   forcing the player to apply it correctly rather than mechanically.

### The ramp, concretely

Difficulty ramps on the levers that actually work:

- **Team size:** 3v3 → 4v4 → 5v5 → 6v6
- **Enemy roster tier:** T1 → T2 → T3 → T4 (the measured 100% → 96% → 46% → 58% curve)
- **Who opens:** player opens missions 1 - 2; enemy opens 3, boss, and all of ch.6+
- **Player agency:** fixed team → pick 6 of 9 → bring your own deck (ch.7 - 8)

---

## 4. Teaching, concretely

The existing `coachShow()` is a one-shot modal. Campaign needs **two** additions, and I'd
keep both small:

1. **Mission briefing** (reuse `coachShow` almost as-is): before the fight, name the combo
   in plain language.
   > *"Lancelot grows every time an ally gains a Shield. Play King Arthur's shields
   > first, then swing."*

2. **Objectives** - the one genuinely new teaching mechanic, and worth it. Each mission
   carries 1 - 3 optional goals that *force* the lesson rather than describing it:
   - "Win without losing a hero"
   - "Consume 3 Marks"
   - "Land a kill with a Shielded Lancelot"
   - "Win in 6 rounds or fewer"

   Objectives are checkable from the existing engine event stream (`EOL.onBattleEvent`)
   - the same hook `sim/sim.js` already uses for telemetry. No engine changes needed.

Completing objectives is what unlocks the *next chapter*, so players cannot brute-force
past a keyword they never learned.

---

## 5. Rewards / progression

Keep it simple and non-grindy:

- Each mission cleared → the missions after it unlock.
- Each **chapter** cleared → that faction's 6 heroes are marked "mastered" on the home
  screen, and a **prebuilt 12-card deck** for that faction is added to the player's deck
  list (they can edit or delete it).

That last part matters: a new player finishing chapter 1 walks out with a *working
Camelot deck* they understand, instead of an empty deck builder and 51 unfamiliar cards.
It connects the campaign directly to Classic/Draft.

---

## 6. Implementation plan

Four pieces, in dependency order. I'd ship 1 - 2 first and playtest chapter 1 before
authoring all 40 missions.

**1. `data/campaign.js` - pure content, no logic.**

```js
window.EOL.campaign = {
  chapters: [{
    id: 'camelot', name: 'Oaths of Steel', faction: 'camelot',
    missions: [{
      id: 'camelot-1', name: 'The Shield Wall', size: 3,
      brief: { title: 'Shields', icon: 'ra-shield',
               body: 'Lancelot grows whenever an ally gains a Shield...' },
      player: ['camelot-king-arthur','camelot-lancelot','camelot-guinevere'],
      enemy:  ['olympus-ares','grimmwood-pied-piper','sherwood-friar-tuck'],
      opener: 'player',                  // the measured ~40pp lever
      objectives: [
        { id: 'noloss', text: 'Win without losing a hero', check: 'noDeaths' },
        { id: 'shields', text: 'Grant 4 Shields', check: 'shieldsGranted', n: 4 },
      ],
    }, /* ... */],
  }],
};
```

**2. `js/campaign.js` - map screen, progress, objective tracking.**
- `localStorage` key `eol.campaign.v1` → `{ cleared: [missionId], objectives: {id:[objId]} }`
- Objective checking subscribes to `EOL.onBattleEvent`, exactly like `sim/sim.js`
- Calls the existing `BATTLE().start({teams})` - **no engine changes**

**3. `index.html` / `css` - a chapter-select map + mission list.**
The prep-phase card grid is already the right visual language; a chapter map can reuse
`.pcard`/`.field-slot` styling rather than inventing a new one.

**4. Enable `#mode-campaign`** and route it in `js/play.js`.

### Engine changes needed: **none**

Everything above runs on `start({teams})`, `onBattleEvent`, and `coachShow`. The one
thing I'd *consider* adding later is a per-mission modifier hook (e.g. "enemy starts with
+20 Energy") for boss variety - but that is a later refinement, not a v1 requirement.

---

## 7. Risks

- **40 missions is a lot of authoring.** Each needs a hand-picked team, a brief, and
  objectives. Recommend building **chapter 1 end-to-end first** and playtesting the shape
  before committing to the other seven.
- **Fixed teams expose balance outliers.** A hand-authored mission can be accidentally
  unwinnable in a way random sims never surface. Every mission should be auto-played by
  the AI (say 50 games) as a CI check; anything below ~30% or above ~95% for the player
  gets retuned. This reuses the existing sim harness.
- **First-mover advantage (~40pp) is huge in fixed teams.** It's a great difficulty lever
  but it must be set deliberately per mission, not left to chance.
- **Balance is still in motion.** Takamagahara has not been re-measured since the nerfs,
  and Guinevere has sat near 35% for three runs. Authoring 40 missions against a roster
  that is still moving means rework - worth doing the 2,000-game validation first.

---

## 8. Recommendation

Build in this order:

1. **Run the 2,000-game balance validation first.** Authoring content against unvalidated
   cards is how you end up rewriting missions.
2. **Chapter 1 (Camelot) end-to-end** - data format, map screen, objectives, one boss.
   Playtest it.
3. If the shape feels right, author chapters 2 - 8 as content.

The sequencing matters more than the volume: the map screen and objective system are
maybe a day of work, and the remaining 90% is content that only pays off if the shape is
proven first.
