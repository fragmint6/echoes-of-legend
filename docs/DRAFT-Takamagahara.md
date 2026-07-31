# Faction Draft — Takamagahara

> **Status: DRAFT for review. No code written, no simulation run.**
> Nothing in `data/` has been touched. This document is the proposal.

---

## 1. Design Constraint

Per the direction given: **no bespoke single-faction mechanic.** Takamagahara's identity is built
from the existing keyword vocabulary (Shield, Taunt, Silence, Exposed, Burn, Mark, Untargetable,
cleanse, revive, Energy, cost-up/down, lifesteal, counter-strike, crit, stat buffs/debuffs) plus
**custom passive triggers**, which the Character Guidelines explicitly call a "vocabulary, not a cap."

Two engine additions are proposed. **Both are generic infrastructure, not faction-private
mechanics** — each is a trigger or targeting rule any future faction can use. They are listed in
§5 with justification, and each is something the roster arguably should already have had.

---

## 2. Faction Identity

| Field | Value |
| --- | --- |
| `id` | `takamagahara` |
| `name` | Takamagahara |
| `icon` | `ra-metal-gate` (the torii — the gate between heaven and earth) |
| `tagline` | *"The plain of high heaven keeps its own counsel."* |
| `colors` | primary `#e8e3d3` (shrine-paper white-gold) · secondary `#c4392f` (torii vermilion) · glow `#fff3c4` |

**Mechanical identity: the Divine Cycle — death, purification, and return.**

Takamagahara is the only faction whose cards are built around the **loop of losing and regaining**.
Where Roma monetises *enemy* deaths and Grimmwood stacks debuffs, Takamagahara is about *your own*
side breaking and being made whole: heroes leave the board and come back, debuffs get washed off,
and the faction's payoffs read the *history* of the fight rather than its current state.

This is legible in the source myth — Izanami dies and becomes queen of Yomi; Izanagi descends to
retrieve her, fails, and purifies himself (*misogi*); from that purification Amaterasu, Tsukuyomi
and Susanoo are born. Amaterasu then hides in the cave and must be drawn back out. **Every card
below is a beat in that cycle.**

Colour separation from existing factions:

- **Yamato** (Energy economy) — different axis entirely; Takamagahara barely touches Energy.
- **Camelot** (Shields/Exposed) — Camelot prevents damage; Takamagahara *recovers* from it.
- **Roma** (kills) — Roma is paid when the *enemy* dies; Takamagahara when *its own* side does.
- **Grimmwood** (debuffs) — Grimmwood applies; Takamagahara *removes* (and punishes removal).

---

## 3. Role Allocation

Chosen to fix the roster gaps identified in the last balance report: **Caster (5, 46.9% WR) and
Controller (8, 47.8% WR) are the thinnest and weakest roles; Bruiser (10) and Tank (8) are the
deepest.** This faction adds **no Bruiser and no Sniper.**

| Hero | Role | Rarity | Element | Icon |
| --- | --- | --- | --- | --- |
| Amaterasu | Caster | Legendary | Light | `ra-sun` |
| Tsukuyomi | Caster | Epic | Shadow | `ra-mirror` |
| Izanami | Controller | Legendary | Shadow | `ra-tombstone` |
| Inari | Controller | Rare | Nature | `ra-fox` |
| Izanagi | Medic | Epic | Light | `ra-water-drop` |
| Susanoo | Tank | Epic | Lightning | `ra-trident` |

Resulting roster: Bruiser 10, Controller 10, Tank 9, Sniper 8, Caster 7, Medic 7.
**Every role reaches 7+, and the 6-per-role draft-snapshot law activates for the first time.**

All six icons verified to exist in RPG Awesome 0.2.0 and to be unused elsewhere in the roster.
No new icon library is required.

---

## 4. The Cards

### 4.1 Amaterasu — Legendary Caster, Light · `ra-sun`

**Stats** `hp 4970 / atk 1950 / def 15` — Caster band (4700–5000 / 1850–2050 / 14–18) ✅

> ⚠️ **REDESIGNED.** The first draft ("Hidden in the Rock Cave") was broken. See §4.1b for the
> post-mortem — it is kept deliberately, because the failure mode is one to design against.

**Ability — "Heaven-Shining Radiance"** · Active · **50 EN**

> Deal **70% ATK Light Damage** to all enemies, increased to **105%** against **Burning** enemies,
> then apply **Burn** for 2 rounds to all of them. If this defeats an enemy, all allies cleanse
> **1** debuff and heal **8% Max HP**.

```js
spec: {
  target: { side: 'enemy', pick: 'all', row: 'any' },
  effects: [
    // the bonus is tested BEFORE her own Burn lands, so she cannot trigger her own condition
    { k: 'dmg', power: 0.7, element: 'Light',
      ifMult: [{ when: { targetBurning: true }, mult: 1.5 }] },
    { k: 'burn', turns: 2, to: 'targets', when: 'now' },
    { k: 'cleanse', count: 1, to: 'allies', if: { killedTarget: true } },
    { k: 'heal', pctMaxHp: 8, to: 'allies', if: { killedTarget: true } },
  ],
}
```

**Why this version works.** The sun does not hide — it *burns*, and the myth's real image is
Amaterasu's light restoring the world once she returns. The power now comes from **the state of the
board**, not from self-protection:

- She is **always targetable**. Her 4,970 HP and 15 DEF are the drawback; she is a glass cannon
  who has to survive a round of focus fire to cast again.
- The 105% mode **requires a partner** to have applied Burn first. Alone she is a 70% AoE, which
  is modest for 50 EN — she is *designed* to want a setup card.
- The sustain rider is **genuinely conditional** on securing a kill (verified: no heal when
  nothing dies), so it rewards good timing rather than paying out every cast.

**Verified** (14/14 assertions, `/tmp/amaterasu_v2.js`): 955 damage plain vs 1433 into a Burning
target — exactly the 1.5× multiplier — Burn lands on all six, cleanse+heal fire only on a kill,
and as the **last hero standing she remains targetable**.

**Uses zero engine additions.** `targetBurning` and `killedTarget` both already exist.

**Combos.** Her Burn is the setup for the *next* cast, and for every debuff-conditional payoff in
the game (Tsukuyomi's 150% mode, Robin Hood, Red Riding Hood, Caster basics). She wants a Burn
partner up front: Nezha, Rumpelstiltskin (heads), or Ares. Internally, Izanami's −10% DEF spread
amplifies the AoE, and Inari's Energy refund helps pay the 50 EN.

---

### 4.1b Post-mortem — why the first Amaterasu was broken

The original design gave her self-**Untargetable** + self-**Silence** for a round, then a delayed
AoE via `when: 'next'`. Three separate failures, all confirmed empirically
(`/tmp/amaterasu_exploit.js`):

| # | Failure | Evidence |
| --- | --- | --- |
| 1 | **The self-Silence was not a drawback.** A hero acts at most once per round (`B.acted`), so Silencing herself *after* casting costs nothing. `tickTimers` then decrements it to 0 at the round rollover — before it could ever block anything. | `silence=1` after cast, `canUse=true` next round. Net effect: **zero**. |
| 2 | **Lone-survivor lock.** `legalTargets` filters out Untargetable enemies. With her as the last hero alive, the enemy team had **no legal target at all**, and 50 EN against a 90–100 EN/round pool sustains it forever. | Enemy legal targets: **0**. Locked **8/8** rounds tested. |
| 3 | **The payoff fired from a dead caster.** Deferred `next` effects resolve from the queue without checking that the source is alive, so killing her did not prevent the AoE — removing the only counterplay. | Dead Amaterasu still dealt **12,995** damage. |

**The design lesson:** in a one-action-per-round game, *self-directed* restrictions (Silence,
cost-up, "cannot act next turn") are not real costs on a hero who has already acted. A drawback
has to be paid in something the opponent can exploit — board presence, tempo, or a resource.
The new version pays in **fragility**: she must stand in the open at 4,970 HP.

> **Note on failure 3:** that is a *general engine bug*, not specific to this card — no card
> currently uses `when: 'next'`, which is why it has never surfaced. Flagging it separately; it
> should be fixed (skip deferred effects whose source is dead) regardless of what happens to this
> faction.

### 4.2 Tsukuyomi — Epic Caster, Shadow · `ra-mirror`

**Stats** `hp 4740 / atk 1905 / def 15` — Caster band ✅

**Ability — "Moonlit Reproach"** · Active · **45 EN**

> Deal **90% ATK Shadow Damage** to two enemies and **Silence** them for 1 round. Each target that
> is **already debuffed** instead takes **150% ATK** and has their ability cost raised by **10
> Energy** for 2 rounds.

```js
spec: {
  target: { side: 'enemy', pick: 'two', row: 'any' },
  effects: [
    { k: 'dmg', power: 0.9, element: 'Shadow' },
    { k: 'dmg', power: 0.6, element: 'Shadow', if: { targetHasDebuff: true } },
    { k: 'silence', turns: 1, to: 'targets', when: 'now' },
    { k: 'costMod', unit: true, flat: 10, turns: 2, to: 'targets',
      if: { targetHasDebuff: true }, when: 'now' },
  ],
}
```

**Why it's interesting.** Tsukuyomi killed Ukemochi over a breach of etiquette and Amaterasu never
spoke to him again — he is the god of *judgement passed on the already-guilty*. Mechanically he is
a **debuff detonator**: fine on a clean target, brutal on a dirty one.

**Combos.** This is the strongest cross-faction card in the faction. Grimmwood (Pied Piper,
Rumpelstiltskin) and Roma (Cicero) hand him pre-debuffed targets; Olympus/Huaxia Marks also count
as debuffs via `hasDebuff()`, so a Marked enemy is already "guilty." Note the ordering: the
conditional damage is tested **before** his own Silence lands, so he cannot satisfy his own
condition — same discipline as Friar Tuck and Cicero.

---

### 4.3 Izanami — Legendary Controller, Shadow · `ra-tombstone`

**Stats** `hp 5615 / atk 1350 / def 20` — Controller band (4800–5800 / 1150–1400 / 16–20) ✅

**Ability — "A Thousand a Day"** · Passive · trigger `allyDied`

> Whenever an ally is defeated, the slayer's whole team is dragged toward Yomi: all enemies suffer
> **−10% DEF** for 2 rounds and the enemy with the highest ATK is **Burned** for 2 rounds.
> Izanami gains **12% ATK** for the rest of the battle.
> *Max: 4 stacks.*

```js
passive: {
  trigger: 'allyDied',
  effects: [
    { k: 'stat', stat: 'def', amt: -10, turns: 2, to: 'enemies', when: 'now' },
    { k: 'burn', turns: 2, to: 'enemies', take: { n: 1, by: 'highestAtk' }, when: 'now' },
    { k: 'stat', stat: 'atk', amt: 12, turns: 99, to: 'self',
      stackTag: 'thousand-a-day', maxStacks: 4 },
  ],
}
```

**Why it's interesting.** Izanami's curse — *"I will kill a thousand people a day"* — is the
mythological origin of death itself. She is the faction's **losing-board engine**: the more of your
team dies, the more the enemy rots. Distinct from Roma's Spartacus (who buffs *allies* on ally
death) and from Mulan (self-only stats): Izanami is the only `allyDied` card that **debuffs the
enemy team**, which is a different lever and stacks with both.

**Combos.** Spartacus + Izanami + Mulan is a real "comeback core" across three factions. The −10%
DEF spread is a damage amplifier for every Caster and Sniper on the board, and the Burn feeds
Grimmwood/Sherwood debuff-conditional payoffs.

---

### 4.4 Inari — Rare Controller, Nature · `ra-fox`

**Stats** `hp 4835 / atk 1160 / def 20` — Controller band ✅

**Ability — "Kitsune's Bounty"** · Active · **25 EN**

> Deal **75% ATK Nature Damage** and apply **Exposed** for 1 round. Refund **12 Energy** to your
> team's pool, or **20 Energy** if the target was already **Exposed**.

```js
spec: {
  target: { side: 'enemy', pick: 'single', row: 'any' },
  effects: [
    { k: 'gainEnergy', amt: 12 },
    { k: 'gainEnergy', amt: 8, if: { targetExposed: true } },   // 20 total
    { k: 'dmg', power: 0.75, element: 'Nature' },
    { k: 'exposed', turns: 1, to: 'targets', when: 'now' },
  ],
}
```

**Why it's interesting.** Inari is the kami of rice — literally *stored wealth* — and her foxes are
messengers and spies. A cheap 25 EN cast that **returns more Energy than it costs** makes her the
roster's premier enabler: she is how you afford Amaterasu's 50 EN or Izanami's team.

**Note the ordering:** the Energy refund is evaluated *before* her own Exposed lands, so the 20 EN
mode requires a *pre-existing* Exposed — she rewards a partner's setup rather than her own.

**Combos.** This is the faction's cross-faction glue. She feeds Yamato's expensive signatures, and
her Exposed is a setup keyword for Camelot (Lancelot's `allyStruckExposed`), Mordred, and Huang
Zhong. Inari → Tsukuyomi is the faction's cleanest internal line: she Exposes, he detonates the
debuff for 150%.

---

### 4.5 Izanagi — Epic Medic, Light · `ra-water-drop`

**Stats** `hp 4900 / atk 1080 / def 20` — Medic band (4600–5000 / 950–1100 / 18–22) ✅

**Ability — "Misogi at the River Mouth"** · Active · **40 EN**

> Cleanse **all** debuffs from an ally and heal them for **30% Max HP**. If they were carrying any
> debuff, they also gain a **15% Max HP Shield** and **20% ATK** for 2 rounds. Your other allies
> each cleanse **1** debuff and heal **8% Max HP**.

```js
spec: {
  target: { side: 'ally', pick: 'single', row: 'any' },
  effects: [
    // riders tested BEFORE the cleanse, so the purification doesn't erase its own condition
    { k: 'shield', pctMaxHp: 15, to: 'targets', if: { targetHasDebuff: true } },
    { k: 'stat', stat: 'atk', amt: 20, turns: 2, to: 'targets', if: { targetHasDebuff: true } },
    { k: 'cleanse', count: 99, to: 'targets' },
    { k: 'heal', pctMaxHp: 30, to: 'targets' },
    { k: 'cleanse', count: 1, to: 'otherAllies' },
    { k: 'heal', pctMaxHp: 8, to: 'otherAllies' },
  ],
}
```

**Why it's interesting.** *Misogi* — washing off the defilement of Yomi — is the single most
important ritual in Shinto, and it produced Amaterasu, Tsukuyomi and Susanoo. This is the roster's
only **full-strip cleanse**, and it converts the removed defilement into offence: purification is
rewarded, not merely neutral.

Existing cleansers only remove 1 debuff (Snow White, Hua Tuo, Momotaro's Burn-only). A total strip
plus a team-wide splash is a genuinely new support shape, and it is the natural answer to
Grimmwood — currently the faction with the least counterplay.

**Combos.** He is the designated answer to Amaterasu's self-Silence: cleanse it and she emerges a
round early. Against Grimmwood/Cicero/Tsukuyomi decks he is a hard counter. The Shield he grants
also triggers Camelot's Lancelot (`allyWarded`) and Roma's shield-reading effects.

---

### 4.6 Susanoo — Epic Tank, Lightning · `ra-trident`

**Stats** `hp 7210 / atk 1030 / def 30` — Tank band (6800–7600 / 950–1100 / 28–32) ✅

**Ability — "Slayer of Yamata no Orochi"** · Passive · triggers `wasAttacked`, `allyBelowHp`

> The first time each round Susanoo is attacked, counter-strike for **80% ATK Lightning Damage**.
> When an ally drops below **35% HP**, Susanoo immediately **Taunts** for 1 round, gains a **15%
> Max HP Shield**, and his counter-strike rises to **130% ATK** for that round.

```js
passive: {
  triggers: ['wasAttacked', 'allyBelowHp'],
  threshold: 0.35,
  firstPerRound: true,
  effects: [
    { k: 'counterStrike', power: 0.8, turns: 1, to: 'self' },
    { k: 'taunt', turns: 1, to: 'self' },
    { k: 'shield', pctMaxHp: 15, to: 'self' },
  ],
}
```

> ⚠️ **This card needs the most engine care.** A two-trigger passive where each trigger should fire
> a *different* subset of effects is not currently expressible — `applyEffects` runs the whole
> `effects` array for whichever trigger fired. See §5.2. If we don't want that addition, the
> fallback is to make Susanoo purely `allyBelowHp` (drop the standing counter), which costs the
> card some identity but needs zero engine work.

**Why it's interesting.** Susanoo is the storm god who was *banished from Takamagahara* and redeemed
himself by slaying the eight-headed serpent to save Kushinada. He is the faction's only frontliner:
a **retaliation tank** who becomes a bodyguard the moment someone is in danger. Distinct from Guan
Yu (counter while Shielded, self-serving) and Little John (plants a counter on an *ally*): Susanoo's
counter escalates in response to *team* danger.

**Combos.** Taunt + Shield triggers Lancelot's `allyWarded`. His Lightning counter is the faction's
only Lightning source. He protects the entire back-line-heavy faction, which otherwise has no front
row at all.

---

## 5. Engine Additions

Per the design constraint, neither of these is a faction-private mechanic — both are **generic
infrastructure** usable by any future card.

### 5.1 `take` support on the `burn` effect *(trivial, ~0 lines)*

Izanami's passive Burns "the highest-ATK enemy." `take: { n, by }` is already a generic,
effect-level target limiter applied centrally in `applyEffect` **before** the switch, so it should
already work on `burn` — this needs **verification, not code**. If it does work, this section is
void.

### 5.2 Per-trigger effect routing *(the real addition, ~10 lines)*

**Problem.** A passive with `triggers: ['a','b']` fires its entire `effects` array on either
trigger. Susanoo wants the counter-strike on `wasAttacked` and the Taunt/Shield on `allyBelowHp`.

**Proposal.** An optional `on:` field on any passive effect, naming which trigger(s) it responds to.
Effects without `on:` keep firing on every trigger, so **every existing card is unaffected**:

```js
{ k: 'counterStrike', power: 0.8, turns: 1, to: 'self', on: 'wasAttacked' },
{ k: 'taunt',  turns: 1, to: 'self',            on: 'allyBelowHp' },
{ k: 'shield', pctMaxHp: 15, to: 'self',        on: 'allyBelowHp' },
```

Implementation: thread the firing trigger name into the passive `ctx` (the fire sites already know
it — they pass it to `emit`), then filter in `applyEffects`:

```js
if (e.on && ctx.trigger) {
  var list = Array.isArray(e.on) ? e.on : [e.on];
  if (list.indexOf(ctx.trigger) < 0) return;
}
```

**Why this is general, not faction-private.** Multi-trigger passives already exist across the
roster — Mulan (`allyDied`/`allyBelowHp`), Lancelot (`allyWarded`/`allyStruckExposed`), Athena,
Lu Bu — and *every one of them* had to be designed so that firing all effects on any trigger is
acceptable. That is a real design constraint the engine imposes today, and lifting it widens what
every future faction can express. It is additive and opt-in.

### 5.3 Separate bug found — deferred effects from a dead source

Not a Takamagahara requirement, but found while testing: `resolveDeferred` resolves queued `next`/
`turn`/`round` effects without checking that the **source unit is still alive**, so a dead caster's
delayed payoff still lands (measured: 12,995 damage from a corpse). No shipped card uses
`when: 'next'`, which is why this has never surfaced. Recommend fixing independently of this
faction.

### 5.4 Explicitly **not** proposed

- No new status keyword, no new resource, no global battle state.
- No Day/Night cycle (rejected: single-faction-only).
- No new damage element.

---

## 6. Combo & Chain Map

**Internal (required: at least one line inside the faction)**

1. **Inari → Tsukuyomi.** Inari Exposes cheaply and refunds Energy; Tsukuyomi's damage jumps
   90%→150% against a debuffed target and adds a cost tax. The refund helps pay for his 45 EN.
2. **Amaterasu ↔ Tsukuyomi.** Amaterasu Burns all six enemies; Burn counts as a debuff, so every
   target is now "guilty" and Tsukuyomi's 150% mode is live on both of his. Reversed, any debuff
   Tsukuyomi leaves behind feeds her next cast.
3. **Izanami ← everyone.** Every ally death — including a Susanoo who died bodyguarding — feeds her
   stacks and spreads −10% DEF, amplifying Amaterasu's and Tsukuyomi's AoE.
4. **Susanoo → Izanagi.** Susanoo Taunts and eats damage; Izanagi heals and re-Shields him.

**Proactive win condition** (guideline requirement — no purely reactive faction): Amaterasu's
escalating AoE — 70% on the first pass, 105% on every pass after the Burn sticks — is the
faction's clock. Takamagahara is not purely a reaction faction.

**Cross-faction (required: each card fits at least one external line)**

| Card | Hands off | Rewards |
| --- | --- | --- |
| Amaterasu | **Burn** to the whole enemy team | pre-existing Burn (Nezha, Rumpelstiltskin, Ares) |
| Tsukuyomi | Silence, cost-up | **any** debuff or Mark — Grimmwood, Olympus, Huaxia, Cicero |
| Izanami | −10% DEF team-wide, Burn | ally deaths — stacks with Spartacus + Mulan |
| Inari | Exposed, **+Energy** | pre-existing Exposed (Camelot, Grimmwood) |
| Izanagi | Shield, cleanse | enemy debuff pressure — hard counter to Grimmwood |
| Susanoo | Taunt, Shield → Lancelot | allies in danger |

---

## 7. Guideline Checklist

| # | Check | Status |
| --- | --- | --- |
| 1 | Creates/strengthens a combo or chain | ✅ 4 internal lines, 6 cross-faction |
| 2 | Stats inside role budget bands | ✅ all six verified against the table |
| 3 | No duplicate ability specification | ✅ names, costs, targets, effect lists all novel |
| 4 | Fits faction identity, legible at a glance | ✅ shared torii/shrine palette, cycle theme |
| 5 | Respects role cap (4 deck / 3 sim) | ✅ max 2 of any role in the faction |
| 6 | No undefined keywords in ability text | ✅ only Shield/Silence/Exposed/Burn/Taunt |
| 7 | Engine additions rather than watered-down skills | ✅ §5, both generic |

**Balance risks flagged up front**

- **Inari's net-positive Energy** is the highest-risk number here. At 25 EN cost / 20 EN refund the
  net is −5, which is close to free and could distort the whole economy. Suggest opening at
  **12/18 refund** and letting the sim argue upward.
- **Amaterasu at 50 EN** is now a 70% AoE without a Burn partner, which may be *weak* for the
  price — the 105% mode is the real card. Watch whether she is castable at all before round 3.
- **Izanagi's full cleanse** is powerful specifically against Grimmwood and could flip that
  matchup hard. Worth watching the Grimmwood matchup table.
- **Izanami** is a legendary Controller with a passive and no active cast — her only output is the
  Disrupt basic. Verify she does not end up a low-agency stat-stick.

---

## 8. What I Need From You

1. **Approve or revise the concept** — especially the Divine Cycle identity, Inari's refund, and
   the rebuilt Amaterasu (§4.1). You called the whole faction "really broken"; I agree the numbers
   are untested and I would rather cut power before simulating than after.
2. **Ruling on §5.2** (`on:` per-trigger routing). Approve it, or tell me to fall back to the
   single-trigger Susanoo.
3. Then I'll write `data/takamagahara.js` + the engine work, verify it, and **only run the
   simulation when you tell me to.**
