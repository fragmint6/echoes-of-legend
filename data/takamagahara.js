/* Faction: Takamagahara — the Divine Cycle (death, purification, return)
   -------------------------------------------------------------
   The Plain of High Heaven. Where Roma is paid when the ENEMY dies and
   Grimmwood stacks debuffs onto them, Takamagahara is the faction built
   around its OWN side breaking and being made whole again: heroes are
   purified, cursed, avenged and restored.

   The myth is the mechanic. Izanami dies and becomes queen of Yomi;
   Izanagi descends to retrieve her, fails, and washes the defilement off
   in the river (misogi); from that purification Amaterasu, Tsukuyomi and
   Susanoo are born. Every card here is a beat in that cycle.

   Identity notes
   --------------
   - No bespoke faction-only mechanic. Everything is built from the
     existing keyword vocabulary (Burn, Exposed, Silence, Shield, Taunt,
     cleanse, counter-strike, Energy, cost-up, stat buffs/debuffs).
   - The one engine addition used here — `on:` per-trigger effect routing
     (Susanoo) — is generic infrastructure, not a faction mechanic: any
     multi-trigger passive in any future faction can use it.

   Role allocation is deliberate. Per the last balance report Caster (5
   heroes, 46.9% WR) and Controller (8, 47.8%) were the thinnest and
   weakest roles while Bruiser sat at 10. This faction adds 2 Casters,
   2 Controllers, 1 Medic and 1 Tank — and no Bruiser or Sniper.
   ============================================================= */
window.EOL.registerFaction({
  id: 'takamagahara',
  name: 'Takamagahara',
  icon: 'ra-metal-gate',
  tagline: 'The plain of high heaven keeps its own counsel.',
  colors: { primary: '#e8e3d3', secondary: '#c4392f', glow: '#fff3c4' },
  cards: [
    {
      id: 'takamagahara-amaterasu',
      name: 'Amaterasu',
      rarity: 'legendary',
      role: 'Caster',
      element: 'Light',
      stats: { hp: 4970, atk: 1950, def: 15 },
      ability: {
        type: 'Active',
        name: 'Heaven-Shining Radiance',
        /* REDESIGN NOTE. The first draft of this card gave her self-
           Untargetable + self-Silence for a round and a delayed AoE. It was
           broken three ways: (1) a hero acts at most once per round, so
           Silencing herself AFTER casting cost nothing and the flag ticked
           off before it could ever block anything; (2) as the last hero
           standing, Untargetable left the enemy with zero legal targets,
           and 50 EN against a 90-100 EN pool sustained the lock forever;
           (3) the delayed payoff resolved even from a dead caster.

           The lesson: in a one-action-per-round game a SELF-directed
           restriction is not a real cost. This version pays its cost in
           fragility instead — she stands in the open at 4,970 HP — and its
           power scales off the board rather than off self-protection. */
        /* NERF 2026-07-31 (post-baseline). She shipped at 81.1% WR with
           24,606 damage per game — 2.8x the next-best Caster — because a
           six-target AoE at 70%/105% is simply too much throughput. Cut to
           50%/75% and repriced 50 -> 55 EN. The kill rider is kept: it was
           not the problem, and it is the card's identity beat. */
        cost: 55,
        text: 'Deal <b>50% ATK Light Damage</b> to all enemies, increased to <b>75%</b> against <b>Burning</b> enemies, then apply <b>Burn</b> for 2 rounds to all of them. If this defeats an enemy, all allies cleanse <b>1</b> debuff and heal <b>8% Max HP</b>.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'all', row: 'any' },
          effects: [
            /* the Burning bonus is read BEFORE her own Burn lands, so she
               can never satisfy her own condition (cf. Friar Tuck, Cicero) */
            {
              k: 'dmg',
              power: 0.5,
              element: 'Light',
              ifMult: [{ when: { targetBurning: true }, mult: 1.5 }],
            },
            { k: 'burn', turns: 2, to: 'targets', when: 'now' },
            { k: 'cleanse', count: 1, to: 'allies', if: { killedTarget: true } },
            { k: 'heal', pctMaxHp: 8, to: 'allies', if: { killedTarget: true } },
          ],
        },
      },
      icon: 'ra-sun',
    },
    {
      id: 'takamagahara-tsukuyomi',
      name: 'Tsukuyomi',
      rarity: 'epic',
      role: 'Caster',
      element: 'Shadow',
      stats: { hp: 4740, atk: 1905, def: 15 },
      ability: {
        type: 'Active',
        name: 'Moonlit Reproach',
        cost: 45,
        text: 'Deal <b>90% ATK Shadow Damage</b> to <b>2 enemies</b> and <b>Silence</b> them for 1 round. Any target that was already debuffed takes an extra <b>60% ATK</b> and has their ability cost raised by <b>10 Energy</b> for 2 rounds.',
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'two', row: 'any' },
          effects: [
            /* judgement on the already-guilty: the debuff riders are tested
               before this cast's own Silence lands */
            { k: 'dmg', power: 0.9, element: 'Shadow' },
            { k: 'dmg', power: 0.6, element: 'Shadow', if: { targetHasDebuff: true } },
            {
              k: 'costMod',
              unit: true,
              flat: 10,
              turns: 2,
              to: 'targets',
              if: { targetHasDebuff: true },
              when: 'now',
            },
            { k: 'silence', turns: 1, to: 'targets', when: 'now' },
          ],
        },
      },
      icon: 'ra-mirror',
    },
    {
      id: 'takamagahara-izanami',
      name: 'Izanami',
      rarity: 'legendary',
      role: 'Controller',
      element: 'Shadow',
      stats: { hp: 5615, atk: 1350, def: 20 },
      ability: {
        type: 'Passive',
        name: 'A Thousand a Day',
        cost: null,
        text: "Whenever an ally is defeated, all enemies suffer <b>-10% DEF</b> for 2 rounds, the highest ATK enemy is <b>Burned</b> for 2 rounds, and Izanami gains <b>12% ATK</b> for the rest of the battle.",
        note: 'Max: 4 stacks.',
        passive: {
          trigger: 'allyDied',
          effects: [
            { k: 'stat', stat: 'def', amt: -10, turns: 2, to: 'enemies', when: 'now' },
            { k: 'burn', turns: 2, to: 'enemies', take: { n: 1, by: 'highestAtk' }, when: 'now' },
            {
              k: 'stat',
              stat: 'atk',
              amt: 12,
              turns: 99,
              to: 'self',
              stackTag: 'thousand-a-day',
              maxStacks: 4,
            },
          ],
        },
      },
      icon: 'ra-tombstone',
    },
    {
      id: 'takamagahara-inari',
      name: 'Inari',
      rarity: 'rare',
      role: 'Controller',
      element: 'Nature',
      stats: { hp: 4835, atk: 1160, def: 20 },
      ability: {
        type: 'Active',
        name: "Kitsune's Bounty",
        /* Opened at 12/+6 rather than the draft's 12/+8. At 25 EN with an
           18 EN refund the net cost is 7; the draft's 20 refund left a net
           of 5, which is close enough to free to distort the whole economy.
           Tune upward from evidence, not downward from a crisis. */
        cost: 25,
        text: "Deal <b>75% ATK Nature Damage</b> and apply <b>Exposed</b> for 1 round, refunding <b>12 Energy</b> to your team's pool — or <b>18 Energy</b> if that enemy was already <b>Exposed</b>.",
        note: null,
        spec: {
          target: { side: 'enemy', pick: 'single', row: 'any' },
          effects: [
            /* refund is read before her own Exposed lands, so the larger
               refund rewards a PARTNER's setup, never her own */
            { k: 'gainEnergy', amt: 12 },
            { k: 'gainEnergy', amt: 6, if: { targetExposed: true } },
            { k: 'dmg', power: 0.75, element: 'Nature' },
            { k: 'exposed', turns: 1, to: 'targets', when: 'now' },
          ],
        },
      },
      icon: 'ra-fox',
    },
    {
      id: 'takamagahara-izanagi',
      name: 'Izanagi',
      rarity: 'epic',
      role: 'Medic',
      element: 'Light',
      stats: { hp: 4900, atk: 1080, def: 20 },
      ability: {
        type: 'Active',
        name: 'Misogi at the River Mouth',
        cost: 40,
        text: 'Cleanse <b>all</b> debuffs from an ally and heal them for <b>30% Max HP</b>. If they were debuffed, they also gain a <b>15% Max HP Shield</b> and <b>20% ATK</b> for 2 rounds. Your other allies each cleanse <b>1</b> debuff and heal <b>8% Max HP</b>.',
        note: null,
        spec: {
          target: { side: 'ally', pick: 'single', row: 'any' },
          effects: [
            /* the riders are tested BEFORE the cleanse, or the purification
               would erase the very condition that pays for it */
            {
              k: 'shield',
              pctMaxHp: 15,
              to: 'targets',
              if: { targetHasDebuff: true },
            },
            {
              k: 'stat',
              stat: 'atk',
              amt: 20,
              turns: 2,
              to: 'targets',
              if: { targetHasDebuff: true },
            },
            { k: 'cleanse', count: 99, to: 'targets' },
            { k: 'heal', pctMaxHp: 30, to: 'targets' },
            { k: 'cleanse', count: 1, to: 'otherAllies' },
            { k: 'heal', pctMaxHp: 8, to: 'otherAllies' },
          ],
        },
      },
      icon: 'ra-water-drop',
    },
    {
      id: 'takamagahara-susanoo',
      name: 'Susanoo',
      rarity: 'epic',
      role: 'Tank',
      element: 'Lightning',
      stats: { hp: 7210, atk: 1030, def: 30 },
      ability: {
        type: 'Passive',
        name: 'Slayer of Yamata no Orochi',
        cost: null,
        text: 'Susanoo begins the battle with a <b>10% Max HP Shield</b>, and while <b>Shielded</b> he counter-strikes anyone who attacks him for <b>60% ATK Lightning Damage</b>. When an ally falls below <b>30% HP</b>, Susanoo immediately Taunts for 1 round and gains a <b>10% Max HP Shield</b>.',
        note: null,
        /* Uses the engine's `on:` routing so each trigger fires only its own
           effects — without it both triggers would run the whole list.

           The counter is armed on `static` (at battle start, like Robin
           Hood's aim) rather than on `wasAttacked`. `counterStrike` ARMS a
           retaliation for FUTURE hits; it does not answer the blow that is
           currently resolving. Arming it on wasAttacked therefore left the
           first attack of every round uncountered — an off-by-one against
           the printed text. A standing counter is also the better card:
           it makes attacking him a real decision from round 1.

           The engine only resolves a counter when the defender was Shielded
           at the moment of the hit (dealDamage's `hadShield` gate, shared
           with Guan Yu), so the opening Shield is not decoration — it is
           what switches the counter on. Losing the Shield switches it off
           until an ally drops low and he re-shields, which is the intended
           rhythm of the card. */
        passive: {
          triggers: ['static', 'allyBelowHp'],
          /* NERF 2026-07-31: shields 12%/15% -> 10%/10% and the bodyguard
             threshold 35% -> 30%. He shipped at 72.7% holding BOTH the
             highest Tank damage (6,485/game) and the highest Tank survival
             (50%), because the reflex Shield kept re-arming the standing
             counter. Smaller shields mean the counter switches off more
             often; the tighter threshold makes the reflex fire later.

             SECOND NERF: counter 80% -> 60%. The shield cut alone did not
             move him (survival and deaths per game were unchanged at 50% /
             0.50), which showed the shields were never what carried the
             card — the standing counter was. */
          threshold: 0.3,
          effects: [
            { k: 'shield', pctMaxHp: 10, to: 'self', on: 'static' },
            { k: 'counterStrike', power: 0.6, turns: 99, to: 'self', on: 'static' },
            { k: 'taunt', turns: 1, to: 'self', on: 'allyBelowHp' },
            { k: 'shield', pctMaxHp: 10, to: 'self', on: 'allyBelowHp' },
          ],
        },
      },
      icon: 'ra-trident',
    },
  ],
});
