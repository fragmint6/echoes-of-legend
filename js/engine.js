/* =============================================================
   Echoes of Legend - Combat Engine
   -------------------------------------------------------------
   Data-driven. Abilities are declared as { target, effects[] } in
   the card data; this file interprets them. Adding a new ability
   should normally mean adding data, not code.

   Key concepts
   ------------
   Unit      a card instance on the board (hp, buffs, position)
   Spec      { target, effects[], choose[] } describing an ability
   Effect    { k: 'dmg' | 'heal' | 'stat' | ... , ...params }
   Condition { targetHpBelow, targetBackRow, killedTarget, ... }
   ============================================================= */
(function () {
  'use strict';

  /* Energy GRANTED at the start of each round. Unspent energy now CARRIES
     OVER (2026-07-31): the round grant is added to whatever is left, and the
     total is clamped to ENERGY_CAP. The grant itself still tops out at 100 -
     it does not scale to the cap - so from round 3 the income is flat and the
     only way to hold more is to have banked it.

     RETIMED 2026-08-04 after playtester feedback that the buildup felt
     too slow: the ladder was [50, 60, 70, 80, 90, 100] and is now
     [60, 80, 100] - max income arrives three rounds earlier, and the
     ATK ramp below moved round 6 -> round 4 to keep the late-game
     timer pressing at the same relative moment of the shorter curve. */
  var ENERGY_BY_ROUND = [60, 80, 100];

  /* Ceiling on banked energy. Battlefields may raise it (Mana Spring). */
  var ENERGY_CAP = 150;

  /* Comeback: extra energy per round, per legend of deficit, paid to whichever
     side is behind on living legends. Recalculated each round - it fades as
     the deficit closes and disappears entirely on a tie.

     Tuned empirically (1,200-game runs per value) against a no-grant control:
        0/legend  68.8% first-kill conversion
       10/legend  65.3%
       15/legend  63.2%   <- chosen
       20/legend  62.7%   (diminishing, and P1 drifts to 51.3%)
     15 captures nearly all the available correction; past that the curve
     flattens and the extra energy starts distorting the seat balance
     instead of closing the gap. */
  var COMEBACK_PER_LEGEND = 15;

  /* Energy is maxed from round 3, so from round 4 the pressure to close
     the game switches over to a compounding ATK bonus instead. */
  /* THE CRIT MULTIPLIER IS FIXED (2026-08-05): a crit always multiplies
     the post-DEF damage by exactly CRIT_MULT. No variance, no scaling,
     no battlefield can touch it - Crit Chance is the only moving part. */
  var CRIT_MULT = 1.5;
  var RAMP_FROM = 4;
  var RAMP_STEP = 0.15; // +15% ATK per round past the threshold

  /* Losing your whole front row exposes the back line. */
  var BACKLINE_DEF_PENALTY = 5; // percent

  /* Burn: a damage-over-time debuff. In the alternating-action model it
     ticks EVERY TIME THE BURNING LEGEND'S SIDE IS HANDED AN ACTION
     (tickBurn in setTurn), for a flat share of the victim's Max HP,
     while the duration itself only counts down on the round boundary -
     so a 2-round Burn on a busy board ticks many more than 2 times.
     Burn does not stack - re-applying refreshes the duration (longer
     wins). If that tempo ever needs taming, the knob is moving the
     tickBurn call to the round boundary, not this constant. */
  var BURN_PCT_MAX_HP = 5;

  function rampMult(round) {
    if (round < RAMP_FROM) return 1;
    return 1 + (round - RAMP_FROM + 1) * RAMP_STEP;
  }
  /* Healing decay REMOVED (balance pass 2026-07-30): Medics were by far the
     weakest role (37.5% role WR over 500 self-play games; all three dedicated
     Medics below 36%), and the late-game decay put a hard timer on their only
     job. healDecay() is kept as a stable API (exported + called in healUnit)
     but now always returns 1. */
  function healDecay() {
    return 1;
  }

  function energyForRound(r) {
    return ENERGY_BY_ROUND[Math.min(r - 1, ENERGY_BY_ROUND.length - 1)];
  }

  /* The live ceiling for a battle: base cap plus any battlefield modifier. */
  function energyCap(B) {
    return ENERGY_CAP + ((B && B.field && B.field.energyCap) || 0);
  }
  /* Clamp helper used everywhere energy is added, so no path can exceed the
     cap. Previously three call sites hardcoded Math.min(100, ...). */
  function addEnergy(B, side, amt) {
    B.energy[side] = Math.max(0, Math.min(energyCap(B), B.energy[side] + amt));
    return B.energy[side];
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /* ---------------------------------------------------------
     Unit
     --------------------------------------------------------- */
  var uid = 0;
  function makeUnit(card, faction, side, slot) {
    return {
      /* CARD UPGRADES. Set by createBattle from opts.upgrades /
         opts.enemyUpgrades, never read from storage here - the engine
         has no opinion about who owns what. A mode that passes
         nothing fights with stock cards, which is what keeps drafts
         and the Daily Puzzle honest. `upPower` multiplies signature
         damage/heal/shield output; the stat share is folded into
         baseAtk/baseDef/maxHp at creation. */
      upLevel: 0,
      upStat: null,
      upBoosts: null, // one stat name per level purchased
      upPower: 1,
      battle: null, // set on createBattle so stats can read round/board state
      uid: 'u' + ++uid,
      card: card,
      faction: faction,
      side: side, // 'player' | 'enemy'
      slot: slot, // 0..5  (0-2 front row, 3-5 back row)
      /* CROSS-CLIENT IDENTITY. `uid` counts up from a page-global
         counter, so the same legend has different uids in two browsers
         and can never be named over a wire. `idx` is the legend's
         position in the team array AT CREATION and never changes -
         swapTargets moves `slot`, not this. A network message names a
         legend as (side, idx), which the receiving client mirrors by
         flipping the side. See js/netbattle.js. */
      idx: slot,
      name: card.name,
      role: card.role,
      element: card.element,
      maxHp: card.stats.hp,
      hp: card.stats.hp,
      baseAtk: card.stats.atk,
      baseDef: card.stats.def,
      shield: 0,
      shieldSrc: null, // uid of the last legend who granted a shield
      alive: true,
      buffs: [], // {stat, amt, turns, tag, kind}
      flags: {}, // taunt / untargetable / silence -> turns
      usedOnce: {}, // once-per-battle passive tracking
      roundFlags: {}, // once-per-round passive tracking
      /* LIFETIME stack counts, keyed by stackTag. `maxStacks` used to
         count only the buffs currently held, so a 2-round buff freed
         its slot the moment it expired and the "Max: 4 stacks" note on
         the card was never a real ceiling - Red Riding Hood reached a
         13,000 shield in a live game. This counts every stack ever
         granted, which is what the card text actually promises. */
      stackTotals: {},
      pending: [], // delayed effects landing on this unit
      streakUid: null, // Will Scarlet: uid of the current victim
      lastDamagedRound: -1, // round in which this unit last took damage
    };
  }

  /* front row = slots 0,1,2  |  back row = slots 3,4,5 */
  function isFront(u) {
    return u.slot < 3;
  }

  /* ---------------------------------------------------------
     Derived stats - base + additive percent buffs
     --------------------------------------------------------- */
  function sumBuffs(u, stat) {
    var t = 0;
    u.buffs.forEach(function (b) {
      if (b.stat === stat) t += b.amt;
    });
    return t;
  }
  /* SKILL BONUS from card upgrades (owner ruling 2026-08-16: FLAT).
     Applies to a unit's SIGNATURE output only - the ability printed
     on the card. Basic attacks and role abilities are shared
     machinery, not the upgraded card, so they stay stock.
     `ctx.signature` is already tracked everywhere because the log
     and the battle report need it.

     FLAT, NOT MULTIPLIED. A level adds +2 PERCENTAGE POINTS to the
     skill's own numbers: 50% ATK becomes 52%, not 50.75%. That is
     the number the card prints, so the upgrade is legible without
     arithmetic - which the old compounding 1.5% multiplier was not.

     `upAdd` returns those points as a FRACTION (0.02 per level),
     because power coefficients are stored as fractions (1.30 = 130%).
     Effects whose magnitude is stored as whole percent - pctMaxHp,
     stat.amt, lifesteal.pct - use upPts() instead.

     Never a threshold, never a duration, never an Energy cost:
     Anubis's 130/260 becomes 132/264 at level 1, but his 25%/35%
     execute gate and his 45 Energy do not move. A cliff is not a
     curve, and moving one silently rewrites a combo. */
  function upAdd(u, ctx) {
    if (!u || !u.upLevel) return 0;
    if (ctx && ctx.signature === false) return 0;
    return 0.02 * u.upLevel;
  }
  /* the same bonus expressed in whole percentage points */
  function upPts(u, ctx) {
    return upAdd(u, ctx) * 100;
  }
  /* Toward STRONGER, whichever direction that is. A -15% ATK debuff
     deepens to -17%; a 0.85 damage-taken multiplier drops to 0.83.
     Sign-blind addition would make half the roster's upgrades a
     downgrade. */
  function upToward(base, pts) {
    return base < 0 ? base - pts : base + pts;
  }

  function atkOf(u) {
    var ramp = u.battle ? rampMult(u.battle.round) : 1;
    var pct = sumBuffs(u, 'atk');
    var f = u.battle && u.battle.field;
    if (f) {
      // Open Plains: the back line has room to work
      if (f.backRowAtk && !isFront(u)) pct += f.backRowAtk;
      // Blood Battlefield: the wounded fight harder
      if (f.woundedAtk && u.maxHp > 0 && u.hp / u.maxHp < (f.woundedBelow || 0.5)) {
        pct += f.woundedAtk;
      }
      // The Legend's Trial: the champion is empowered
      if (f.championAtk && u.isChampion) pct += f.championAtk;
    }
    return Math.max(1, Math.round(u.baseAtk * (1 + pct / 100) * ramp));
  }
  function defOf(u) {
    // Exposed strips defence entirely - base, buffs and all
    if (u.flags && u.flags.exposed > 0) return 0;
    var d = u.baseDef + sumBuffs(u, 'def');
    // Open Plains: no cover for the front line
    var fd = u.battle && u.battle.field;
    if (fd && fd.frontRowDef && isFront(u)) d += fd.frontRowDef;
    // if this unit's whole front row is gone, the back line is exposed
    if (u.battle && !isFront(u) && frontRowWiped(u.battle, u.side)) {
      d -= BACKLINE_DEF_PENALTY;
    }
    // DEF is a percentage reduction, capped so damage never hits zero
    return clamp(d, 0, 75);
  }

  /* true once every front-row slot on a side is dead */
  function frontRowWiped(B, side) {
    var front = B.units.filter(function (u) {
      return u.side === side && u.slot < 3;
    });
    if (!front.length) return false;
    return front.every(function (u) {
      return !u.alive;
    });
  }
  function critOf(u) {
    return clamp(sumBuffs(u, 'crit'), 0, 100);
  }

  /* How many DISTINCT debuffs are on a unit. Each negative stat buff counts
     once, and each status flag counts once - so a target under -20% ATK,
     Burn and Exposed reads as 3. Used by debuffCountAtLeast and by the
     per-stack damage multiplier (`perDebuff`). */
  function debuffCount(u) {
    if (!u) return 0;
    var n = 0;
    (u.buffs || []).forEach(function (b) {
      if (b.amt < 0) n++;
    });
    if (u.flags.silence > 0) n++;
    /* only a heal REDUCTION is a debuff - a positive healMod (heal-up
       buff) must not feed perDebuff attackers or Red Riding Hood */
    if (u.flags.healMod < 0) n++;
    if (u.flags.burn > 0) n++;
    if (u.flags.exposed > 0) n++;
    if (u.flags.marked > 0) n++;
    if (
      u.costMods &&
      u.costMods.some(function (m) {
        return (m.flat || 0) > 0 || (m.pct || 0) > 0;
      })
    )
      n++;
    return n;
  }

  /* Mirror of the above for positive buffs - the currency `consumeBuffs`
     spends and `buffCountAtLeast` reads. A Shield counts as one buff. */
  function buffCount(u) {
    if (!u) return 0;
    var n = 0;
    (u.buffs || []).forEach(function (b) {
      if (b.amt > 0) n++;
    });
    if (u.shield > 0) n++;
    if (u.flags.taunt > 0) n++;
    if (u.flags.untargetable > 0) n++;
    return n;
  }

  function hasDebuff(u) {
    if (!u) return false;
    return !!(
      (u.buffs &&
        u.buffs.some(function (b) {
          return b.amt < 0;
        })) ||
      (u.flags &&
        (u.flags.silence > 0 ||
          u.flags.healMod < 0 ||
          u.flags.burn > 0 ||
          u.flags.exposed > 0 ||
          u.flags.marked > 0)) ||
      (u.costMods &&
        u.costMods.some(function (m) {
          return (m.flat || 0) > 0 || (m.pct || 0) > 0;
        }))
    );
  }

  /* ---------------------------------------------------------
     Battle state
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     TURN MODEL - alternating ACTIONS
     -------------------------------------------------------------
     A round is no longer "player does everything, then enemy does
     everything". A round is a sequence of single ACTIONS that alternate
     between the sides:

         P1 acts -> P2 acts -> P1 acts -> P2 acts -> ...

     One action = one legend using one ability. Control passes immediately
     after it resolves. A side that cannot act (no energy, nothing legal)
     is skipped for the rest of the round (auto-PASS via passSide).

     A CHOSEN pass means "I pass this TURN", never "I end the round":
     passing skips only that side's current action, and the next action
     by either side answers it - the passer may act again later in the
     round. The round ends when both sides pass BACK-TO-BACK (each
     passes while the other's pass is still unanswered), or when
     neither side can act. (2026-07-30 ruling; previously a chosen
     pass forfeited the whole round.)

     Why: with whole-side turns the first mover could spend an entire
     energy pool before the opponent could respond. Measured in mirror
     matches, that was worth ~87-93% to whoever moved first, and no
     round-1 handicap could fix it (it only moved 93% -> 90%) because the
     advantage recurred every single round. Alternating at the action
     level removes the alpha strike outright.
     --------------------------------------------------------- */
  /* The player takes the first action of every round.

     That is worth real tempo: whoever acts first each round is far more
     likely to land the killing blow, and in mirror matches the player
     was winning ~63% off it (measured: the side that scored the last
     kill won 22/30, and the player scored it 22 times).

     Opening the round is a real advantage - the side that acts first is
     far more likely to land the killing blow. It is paid for directly:
     the side that OPENS the round may only use role Basics, never a
     signature Skill. The responder, acting second, keeps full access.

     Since pass 4 the opener ALTERNATES: P1 opens round 1, P2 opens
     round 2, and so on, so opening tempo is shared fairly. */
  function firstMover(round, oddFirst) {
    /* `oddFirst` names the side that opens the ODD rounds. It defaults
       to 'player' so singleplayer is unchanged.

       It exists for multiplayer. Each client calls itself 'player', so
       without this both machines would decide they open round 1 and the
       two boards would immediately disagree about whose action it is.
       The match host passes 'player' and the guest passes 'enemy', and
       the alternation then lines up on both screens. */
    var odd = oddFirst === 'enemy' ? 'enemy' : 'player';
    var even = odd === 'player' ? 'enemy' : 'player';
    return round % 2 === 1 ? odd : even;
  }

  /* How many opening rounds the first mover is limited to Basics for.
     Both sides are now restricted for round 1 only - symmetric by rule. */
  var FIRST_MOVER_BASIC_ROUNDS = 1;

  /* Is this ability locked out because `unit` opens an early round?
     Only ACTIVE signature Skills are locked - role Basics are always
     allowed, and Passives are never locked at all. */
  function signatureBlocked(B, unit, ability) {
    if (B.noOpeningLimit) return false; // unit-test escape hatch
    if (ability.basic) return false;
    if (ability.type !== 'Active') return false; // passives always work
    if (B.round <= FIRST_MOVER_BASIC_ROUNDS) return true;
    return false;
  }

  /* Optimize team formation: Tanks & Bruisers in front (slots 0-2),
     Medics, Casters, Controllers & Snipers in back (slots 3-5).
     Front gets overflow priority by durability (effective HP): if more
     than 3 frontline-role legends are present the most durable three stay
     up front; if fewer than 3, the most durable backline-role legends
     step up to fill the row. Slots within a row are mechanically
     identical, so inside each row the original random order is kept. */
  function optimizeFormation(entries) {
    if (!entries || entries.length !== 6) return entries;

    var FRONT_ROLES = { Tank: 1, Bruiser: 1 };
    function ehp(e) {
      var s = e.card.stats;
      return s.hp / Math.max(0.25, 1 - s.def / 100);
    }

    var frontline = [],
      backline = [];
    entries.forEach(function (e) {
      (FRONT_ROLES[e.card.role] ? frontline : backline).push(e);
    });

    /* Ties on effective HP are common (shared statlines), and an
       unbroken tie would place the same squad differently on two
       machines. Fall back to the card id, which both clients agree on
       regardless of how the array was built. */
    var byDurability = function (a, b) {
      return ehp(b) - ehp(a) || (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0);
    };
    // too many natural frontliners: keep the most durable 3 up front
    if (frontline.length > 3) {
      frontline.sort(byDurability);
      while (frontline.length > 3) backline.unshift(frontline.pop());
    }
    // too few: pull the most durable backliners forward
    if (frontline.length < 3) {
      backline.sort(byDurability);
      while (frontline.length < 3 && backline.length) frontline.push(backline.shift());
    }

    return frontline.concat(backline);
  }

  /* WHAT WILL THIS BLOW DO?
     -------------------------------------------------------------
     Playtest 2026-08-10: 'he is just attacking and hoping they die
     because he doesn't know how much damage his guy will deal.' The
     preview mirrors the dmg-case math EXACTLY - power, conditional
     multipliers, per-stack scaling, the provoke tax, outgoing and
     incoming multipliers, castable resist, defence - and leaves out
     only the dice: no crit (reported separately), shields shown as
     part of the number the target absorbs. Read-only: guaranteed to
     touch nothing. */
  function previewDamage(B, unit, ability, tgt, chooseIndex) {
    try {
      var spec = ability && ability.spec;
      if (!B || !unit || !spec || !tgt || !tgt.alive || ability.type !== 'Active') return null;
      var effects = spec.effects || [];
      if (spec.choose && spec.choose[chooseIndex || 0]) {
        effects = spec.choose[chooseIndex || 0].effects;
      }
      var ctx = { signature: !ability.basic, scale: 1, self: unit, preHp: {} };
      ctx.preHp[tgt.uid] = tgt.hp;
      /* the provoke tax, mirrored from useAbility */
      if (
        isAttack(ability) &&
        provokeLive(B, opposite(unit.side)) &&
        !((spec.target || {}).noPierceTax) &&
        (piercesTaunt(unit, ability) || isMultiTarget(ability)) &&
        !(tgt.flags.taunt > 0)
      ) {
        ctx.provokeTax = PROVOKE_TAX;
      }
      var total = 0;
      var found = false;
      /* one entry per damaging effect that lands on this target */
      var hits = [];
      /* Did a conditional arm decide this number, and did it pass? The
         UI surfaces this so a player can see WHY the damage is what it
         is - an HP window that reads as "should have fired" from the
         card face is the single most-reported confusion (Goldilocks).
         Null when the ability has no branch at all. */
      var bonusArm = null;
      /* Walk conditional branches as the resolver does. Previously the
         preview only saw top-level `dmg` entries, so branch-based
         executes (Anubis/Gilgamesh, and now Goldilocks) showed no number
         at all while two-line conditionals could show the wrong total. */
      function scan(list) {
        (list || []).forEach(function (e) {
          if (e.k === 'branch') {
            var pass = branchPasses(B, unit, [tgt], e.cond || {}, ctx);
            if (e.cond && e.cond.anyAllyFallen != null) {
              pass =
                B.units.some(function (u) {
                  return u.side === unit.side && !u.alive;
                }) === !!e.cond.anyAllyFallen;
            }
            if (bonusArm === null) bonusArm = !!pass;
            scan(pass ? e.then : e.other || e.else);
            return;
          }
          if (e.k !== 'dmg') return;
          if (e.to && e.to !== 'targets') return; // redirected effects do not hit this target
          if (e.if && !condMet(B, e.if, condCtx(ctx, tgt))) return;
          var provokeM = ctx.provokeTax && !(tgt.flags.taunt > 0) ? ctx.provokeTax : 1;
          var raw = atkOf(unit) * (e.power + upAdd(unit, ctx)) * (ctx.scale || 1) * provokeM;
          if (e.ifMult) {
            e.ifMult.forEach(function (m) {
              if (condMet(B, m.when, condCtx(ctx, tgt))) raw *= m.mult;
            });
          }
          if (e.perDebuff) {
            var dn = debuffCount(tgt);
            if (e.perDebuffMax != null) dn = Math.min(dn, e.perDebuffMax);
            raw +=
              atkOf(unit) * (e.perDebuff + upAdd(unit, ctx)) * dn * (ctx.scale || 1) * provokeM;
          }
          if (e.perBuff) {
            var bn = buffCount(tgt);
            if (e.perBuffMax != null) bn = Math.min(bn, e.perBuffMax);
            raw += atkOf(unit) * (e.perBuff + upAdd(unit, ctx)) * bn * (ctx.scale || 1) * provokeM;
          }
          /* TORTUGA (Flying Dutchman): scales with the caster's OWN
             fallen allies - the crew he has lost. Counts corpses on his
             side only, unlike Jotunheim's `fallenAtLeast` which reads
             both. Capped for the usual reason. */
          if (e.perFallenAlly) {
            var fa = B.units.filter(function (x) {
              return x.side === unit.side && !x.alive;
            }).length;
            if (e.perFallenAllyMax != null) fa = Math.min(fa, e.perFallenAllyMax);
            raw +=
              atkOf(unit) * (e.perFallenAlly + upAdd(unit, ctx)) * fa * (ctx.scale || 1) * provokeM;
          }
          var outM = outgoingMult(B, unit, tgt);
          B._multTrail = null;
          /* dryRun: this is previewDamage - report, never consume. */
          var inM = incomingMult(B, unit, tgt, ctx.signature === true, true);
          B._multTrail = null;
          var resistM = tgt.flags.resistPct > 0 ? 1 - Math.min(90, tgt.flags.resistPct) / 100 : 1;
          var afterDef = raw * outM * inM * resistM * (1 - defOf(tgt) / 100);
          var hit = Math.max(1, Math.round(afterDef));
          total += hit;
          found = true;

          /* THE WORKING-OUT. Every factor above is recorded in the order
             it was applied, so the UI can show a player how the number
             was reached instead of asking them to trust it. Only factors
             that actually did something are listed - a row of "x1" tells
             nobody anything. `steps` is presentation only; the arithmetic
             above is untouched and remains the single source of truth. */
          var st = [];
          st.push({ k: 'atk', label: 'Attack', value: atkOf(unit) });
          /* The upgrade is FLAT, so it shows as a bigger coefficient
             rather than a separate multiplier row - which is exactly
             how the card now prints it. */
          st.push({
            k: 'power',
            label: 'Skill power',
            mult: e.power + upAdd(unit, ctx),
            base: upAdd(unit, ctx) ? e.power : undefined,
            upLevel: upAdd(unit, ctx) ? unit.upLevel : undefined,
          });
          if (provokeM !== 1) st.push({ k: 'provoke', label: 'Provoke tax', mult: provokeM });
          if ((ctx.scale || 1) !== 1) st.push({ k: 'scale', label: 'Scaling', mult: ctx.scale });
          if (e.ifMult) {
            e.ifMult.forEach(function (m) {
              if (condMet(B, m.when, condCtx(ctx, tgt)))
                st.push({ k: 'ifMult', label: 'Conditional bonus', mult: m.mult });
            });
          }
          if (e.perDebuff) {
            var dn2 = debuffCount(tgt);
            if (e.perDebuffMax != null) dn2 = Math.min(dn2, e.perDebuffMax);
            if (dn2)
              st.push({
                k: 'perDebuff',
                label: 'Per debuff (' + dn2 + ')',
                add:
                  atkOf(unit) *
                  (e.perDebuff + upAdd(unit, ctx)) *
                  dn2 *
                  (ctx.scale || 1) *
                  provokeM,
              });
          }
          if (e.perBuff) {
            var bn2 = buffCount(tgt);
            if (e.perBuffMax != null) bn2 = Math.min(bn2, e.perBuffMax);
            if (bn2)
              st.push({
                k: 'perBuff',
                label: 'Per buff (' + bn2 + ')',
                add:
                  atkOf(unit) * (e.perBuff + upAdd(unit, ctx)) * bn2 * (ctx.scale || 1) * provokeM,
              });
          }
          st.push({ k: 'raw', label: 'Base damage', value: raw, subtotal: true });
          if (outM !== 1) st.push({ k: 'outgoing', label: 'Attacker bonus', mult: outM });
          if (inM !== 1) st.push({ k: 'incoming', label: 'Target damage taken', mult: inM });
          if (resistM !== 1)
            st.push({
              k: 'resist',
              label: 'Resistance (' + Math.min(90, tgt.flags.resistPct) + '%)',
              mult: resistM,
            });
          if (defOf(tgt))
            st.push({
              k: 'def',
              label: 'Defence (' + defOf(tgt) + ')',
              mult: 1 - defOf(tgt) / 100,
            });
          st.push({ k: 'total', label: 'Damage', value: hit, subtotal: true });
          hits.push({ steps: st, dmg: hit });
        });
      }
      scan(effects);
      if (!found) return null;

      /* THE EFFECTIVE HP THIS BLOW HAS TO GET THROUGH.
         Provoke recovery (Hansel & Gretel's Lost in the Woods, Run
         Run Run) heals the target BEFORE the hit resolves - see
         dealDamage. A preview that reported only `dmg` therefore let
         the UI compare it against the CURRENT hp and paint a skull on
         a blow that visibly leaves the target standing at ~4% - which
         reads as the tank cheating death rather than as the ability
         doing exactly what its card says.

         The heal is capped at maxHp like any other, so a target near
         full gains less than the nominal percentage. Reporting the
         effective pool keeps every caller honest without asking any
         of them to know this rule. */
      var preHeal = 0;
      if (tgt.flags.taunt > 0 && tgt.flags.tauntHeal) {
        preHeal = Math.min(
          tgt.maxHp * (tgt.flags.tauntHeal / 100),
          Math.max(0, tgt.maxHp - tgt.hp)
        );
        preHeal = Math.round(preHeal);
      }
      return {
        dmg: total,
        crit: Math.round(total * CRIT_MULT),
        critChance: Math.max(0, Math.round(critOf(unit))),
        /* true = the ability's conditional bonus applies to THIS target
           right now, false = it does not, null = no conditional. */
        bonus: bonusArm,
        /* the arithmetic behind `dmg`, for the hover breakdown */
        hits: hits,
        /* HP the target recovers before this blow lands (0 for almost
           everyone), and the total this hit must beat to kill. */
        preHeal: preHeal,
        effectiveHp: tgt.hp + tgt.shield + preHeal,
        lethal: total >= tgt.hp + tgt.shield + preHeal,
      };
    } catch (e) {
      return null; // a broken preview must never break a fight
    }
  }

  /* One source of truth for campaign rival scaling. Preparation uses this
     same helper to paint the numbers players inspect before battle, while
     createBattle applies them to the actual enemy units. HP is deliberately
     unchanged on every difficulty. */
  function scaledRivalStats(stats, bonus) {
    stats = stats || {};
    bonus = Math.max(0, +bonus || 0);
    return {
      hp: +stats.hp || 0,
      atk: Math.round((+stats.atk || 0) * (1 + bonus)),
      def: Math.round((+stats.def || 0) * (1 + bonus)),
    };
  }

  function createBattle(playerCards, enemyCards, opts) {
    opts = opts || {};
    // Smart role-based formation (Tanks/Bruisers front, rest back) when
    // the caller asks for it. Teams themselves stay exactly as drawn -
    // this only decides where each legend stands.
    if (opts.roleAware) {
      playerCards = optimizeFormation(playerCards);
      enemyCards = optimizeFormation(enemyCards);
    }
    /* Which side opens the odd rounds. Singleplayer, campaign and online
       now all share a 50/50 starting rule when oddFirst is not explicitly set. */
    var oddFirst =
      opts.oddFirst === 'enemy'
        ? 'enemy'
        : opts.oddFirst === 'player'
          ? 'player'
          : (opts.rng ? opts.rng() : Math.random()) < 0.5
            ? 'player'
            : 'enemy';
    var B = {
      round: 1,
      oddFirst: oddFirst,
      turn: firstMover(1, oddFirst),
      first: firstMover(1, oddFirst),
      roundEchoUsed: { player: false, enemy: false },
      /* Alternating-action bookkeeping. `passed` records sides locked
         out for the rest of the round (auto-pass: nothing legal to do).
         `turnPassed` records a CHOSEN pass of the current action only -
         cleared the moment either side takes an action (a pass only
         counts toward ending the round while it is unanswered). */
      passed: { player: false, enemy: false },
      turnPassed: { player: false, enemy: false },
      lastActor: null, // who took the previous action this round
      actionNo: 0, // actions taken this round, both sides combined
      turnId: 0, // increments on every action (see setTurn/takeAction)
      units: [],
      /* ROUND 1 GETS THE FIELD'S ENERGY MODIFIER TOO.
         nextRound() applies `energyPerRound`, but round 1 never goes
         through nextRound - the battle simply starts there. So the
         Mana Spring's +20 and the Energy Void's -10 silently skipped
         the opening round: the board said "+20 Energy every round"
         and then handed out 50. Clamped at 0 so a negative field
         cannot start a side underwater. */
      energy: (function () {
        var e0 = Math.max(0, energyForRound(1) + ((opts.field && opts.field.energyPerRound) || 0));
        return { player: e0, enemy: e0 };
      })(),
      field: opts.field || null, // active battlefield (see data/battlefields.js)
      comeback: { player: 0, enemy: 0 }, // energy granted for a legend deficit
      costMods: { player: [], enemy: [] }, // {flat,pct,turns}
      log: [],
      simulation: !!opts.simulation,
      deferred: [], // buffs/debuffs waiting for the turn to end
      /* THE BATTLE REPORT (2026-08-10): per-unit lifetime totals,
         accumulated at the damage/heal sites so every caller - UI,
         sims, tests - reads the same truth. uid -> {dealt, taken,
         healed, absorbed, kills}. */
      tally: {},
      over: false,
      winner: null,
      acted: { player: {}, enemy: {} }, // uid -> true for this round
      rng: opts.rng || Math.random,
    };

    playerCards.forEach(function (e, i) {
      B.units.push(makeUnit(e.card, e.faction, 'player', i));
    });
    enemyCards.forEach(function (e, i) {
      B.units.push(makeUnit(e.card, e.faction, 'enemy', i));
    });
    B.units.forEach(function (u) {
      u.battle = B;
    });

    /* CARD UPGRADES (docs/DESIGN-Card-Upgrades.md).
       Applied BEFORE difficulty scaling, battlefield champions and
       standing passives, so every downstream consumer reads the same
       final base stats - exactly like the rival scaling below.

       Levels arrive per side. Modes that pass nothing get stock
       cards: drafts stay the great equalizer and the Daily Puzzle
       keeps its promise that everyone receives the exact same board.

       Only the ONE chosen stat moves, by 2% per level. Skill power
       is a separate compounding multiplier applied at the effect
       sites; thresholds and Energy costs never move. */
    function applyUpgrades(side, table) {
      if (!table) return;
      B.units.forEach(function (u) {
        if (u.side !== side) return;
        var r = table[u.card.id];
        if (!r) return;
        /* PER-LEVEL BOOSTS. `boosts` is one stat name per level
           purchased, so its length is the level and each stat moves
           by however many levels chose it - "two ATK and one HP" is
           a real build. A payload carrying only the legacy
           {lv, stat} is expanded to that stat repeated lv times, so
           an older client's team still resolves identically. */
        var boosts = [];
        if (Array.isArray(r.boosts)) {
          /* A null entry is a level that is BOUGHT but whose stat the
             player has not picked yet. It must survive the copy: the
             array's length is the level, and the level is what pays
             the flat skill bonus. Dropping nulls here would silently
             demote a level-3 card to level 2 the moment one of its
             choices was left open. */
          r.boosts.forEach(function (b) {
            if (boosts.length < 3) {
              boosts.push(b === 'atk' || b === 'def' || b === 'hp' ? b : null);
            }
          });
        } else {
          var lv0 = Math.max(0, Math.min(3, Math.floor(+r.lv || 0)));
          var st = r.stat === 'def' || r.stat === 'hp' ? r.stat : 'atk';
          for (var i = 0; i < lv0; i++) boosts.push(st);
        }
        var lv = boosts.length;
        if (!lv) return;
        var n = { atk: 0, def: 0, hp: 0 };
        boosts.forEach(function (b) {
          if (b) n[b]++; // an unassigned level moves no stat
        });
        u.upLevel = lv;
        u.upBoosts = boosts.slice();
        /* One word for the build, for anything that wants a label.
           The maths below never reads it. */
        u.upStat = n.hp > n.atk && n.hp >= n.def ? 'hp' : n.def > n.atk && n.def >= n.hp ? 'def' : 'atk';
        u.upPower = Math.pow(1.015, lv);
        if (n.atk) u.baseAtk = Math.round(u.baseAtk * (1 + 0.02 * n.atk));
        if (n.hp) {
          u.maxHp = Math.round(u.maxHp * (1 + 0.02 * n.hp));
          u.hp = u.maxHp;
        }
        if (n.def) {
          /* DEF is NOT a scalable stat - it is a percentage-point
             damage reducer clamped to 0..75, and the roster only
             spans 10..30. Multiplying it by 1.02 rounds straight back
             to where it started, so the DEF choice would silently do
             nothing. It gets FLAT POINTS instead, sized so its value
             matches the other two: +1.5 points per level is +5.3% to
             +6.9% effective HP at max, against +6% for the HP choice. */
          u.baseDef = u.baseDef + 1.5 * n.def;
        }
      });
    }
    applyUpgrades('player', opts.upgrades);
    applyUpgrades('enemy', opts.enemyUpgrades);

    /* Campaign difficulty is a transparent rival-side base-stat multiplier.
       Multiplicative DEF means 20 becomes 22 on Heroic and 24 on Legend;
       it is not a hidden +10/+20 percentage-point wall. Applied before
       battlefield champions and standing passives so every consumer reads
       the same final base stats. */
    var enemyStatBonus = Math.max(0, +opts.enemyStatBonus || 0);
    if (enemyStatBonus) {
      B.units.forEach(function (u) {
        if (u.side !== 'enemy') return;
        var scaled = scaledRivalStats(
          { hp: u.maxHp, atk: u.baseAtk, def: u.baseDef },
          enemyStatBonus
        );
        u.baseAtk = scaled.atk;
        u.baseDef = scaled.def;
        u.difficultyBonus = enemyStatBonus;
      });
    }

    /* The Legend's Trial: each side's most expensive signature is the champion
       and gets a stat bump. Resolved once, at battle start, so it cannot
       shift mid-fight when costs are modified. HP is applied here because
       maxHp is a stored value, not a derived one. */
    if (B.field && (B.field.championAtk || B.field.championHp)) {
      ['player', 'enemy'].forEach(function (side) {
        var team = B.units.filter(function (u) {
          return u.side === side;
        });
        var best = null;
        team.forEach(function (u) {
          var c = u.card.ability.type === 'Active' ? u.card.ability.cost || 0 : 0;
          if (!best || c > best.c) best = { u: u, c: c };
        });
        if (best && best.c > 0) {
          best.u.isChampion = true;
          if (B.field.championHp) {
            var mult = 1 + B.field.championHp / 100;
            best.u.maxHp = Math.round(best.u.maxHp * mult);
            best.u.hp = best.u.maxHp;
          }
        }
      });
    }

    /* Apply battle-start `static` passive effects. Declarative modifiers
       (outgoingMult / damageMult / damageResist) are read directly by the
       damage pipeline and must NOT be applied here; and of what remains,
       ONLY true standing-setup kinds may arm at start (Susanoo's shield +
       permanent counter). Everything else on a static passive is a
       trigger effect that happens to share the effects array - Lu Bu's
       `gainEnergy`/`mark` entries belong to his selfKilled trigger, and
       until this allowlist existed they ALSO fired here, which is why
       Lu Bu's team started every battle at +15 Energy with a random
       enemy pre-marked. Kind-routed effects (`on:`) are filtered to the
       'static' trigger as before; unrouted effects must be a setup kind. */
    var STATIC_SETUP_KINDS = ['stat', 'shield', 'taunt', 'counterStrike', 'untargetable'];
    /* Battle-start setups can reference each other, so arm them in the
       canonical board order rather than array order. */
    boardOrder(B).forEach(function (u) {
      var p = passiveOf(u);
      if (!hasTrig(p, 'static')) return;
      var setup = (p.effects || []).filter(function (e) {
        if (e.k === 'outgoingMult' || e.k === 'damageMult' || e.k === 'damageResist') return false;
        if (e.on) return [].concat(e.on).indexOf('static') >= 0;
        return STATIC_SETUP_KINDS.indexOf(e.k) >= 0;
      });
      if (!setup.length) return;
      applyEffects(B, u, [u], setup, { trigger: 'static', immediate: true });
    });

    return B;
  }

  /* ---------------------------------------------------------
     CLONING - for AI search
     -------------------------------------------------------------
     The search AI plays out hypothetical lines, so it needs a
     throwaway copy of the whole battle. `card` and `faction` are
     immutable shared data and are copied by reference; everything
     the engine mutates is deep-copied. The `battle` back-pointer is
     rewired to the clone, and the log is dropped (nothing reads it).
     --------------------------------------------------------- */
  function cloneUnit(u, B2) {
    var c = {
      battle: B2,
      uid: u.uid,
      card: u.card, // shared, never mutated
      faction: u.faction, // shared, never mutated
      side: u.side,
      slot: u.slot,
      idx: u.idx,
      name: u.name,
      role: u.role,
      element: u.element,
      maxHp: u.maxHp,
      hp: u.hp,
      baseAtk: u.baseAtk,
      baseDef: u.baseDef,
      /* CARD UPGRADES must survive cloning. The stat share is already
         folded into baseAtk/baseDef/maxHp above, but `upPower` is read
         live at every effect site - without it the AI's lookahead
         evaluated an upgraded signature at STOCK power and quietly
         undervalued its own best move. (Pre-existing; found while
         adding per-level boosts 2026-08-16.) */
      upLevel: u.upLevel,
      upStat: u.upStat,
      upBoosts: u.upBoosts,
      upPower: u.upPower,
      shield: u.shield,
      shieldSrc: u.shieldSrc,
      alive: u.alive,
      /* carried so the AI's lookahead can still see WHO fell and in what
         order - `to:'fallenAllies'` (revive) reads it. */
      diedAt: u.diedAt,
      /* Spirit World reprieve is once per legend, so the AI's lookahead
         must know it has already been spent. */
      spiritSpared: u.spiritSpared,
      deathCheated: u.deathCheated,
      streakUid: u.streakUid,
      lastDamagedRound: u.lastDamagedRound,
      buffs: new Array(u.buffs.length),
      flags: {},
      usedOnce: {},
      roundFlags: {},
      /* Lifetime stack counts must survive cloning, or the AI's
         lookahead thinks a capped passive can still stack and
         over-values it. */
      stackTotals: {},
      pending: new Array(u.pending.length),
    };
    for (var i = 0; i < u.buffs.length; i++) {
      var b = u.buffs[i];
      c.buffs[i] = { stat: b.stat, amt: b.amt, turns: b.turns, tag: b.tag };
    }
    for (var k in u.flags) c.flags[k] = u.flags[k];
    for (var k2 in u.usedOnce) c.usedOnce[k2] = u.usedOnce[k2];
    for (var k3 in u.roundFlags) c.roundFlags[k3] = u.roundFlags[k3];
    if (u.stackTotals) for (var k5 in u.stackTotals) c.stackTotals[k5] = u.stackTotals[k5];
    for (var j = 0; j < u.pending.length; j++) {
      var pn = u.pending[j];
      c.pending[j] = {
        turns: pn.turns,
        tag: pn.tag,
        srcUid: pn.srcUid,
        effects: pn.effects,
        scale: pn.scale,
      };
    }
    if (u.costMods) {
      c.costMods = u.costMods.map(function (m) {
        return { flat: m.flat, pct: m.pct, turns: m.turns, signaturesOnly: m.signaturesOnly };
      });
    }
    if (u.triggeredBy) {
      c.triggeredBy = {};
      for (var k4 in u.triggeredBy) c.triggeredBy[k4] = u.triggeredBy[k4];
    }
    return c;
  }

  function cloneBattle(B, rng) {
    var B2 = {
      round: B.round,
      oddFirst: B.oddFirst,
      turn: B.turn,
      first: B.first,
      noOpeningLimit: B.noOpeningLimit,
      passed: { player: B.passed.player, enemy: B.passed.enemy },
      turnPassed: { player: B.turnPassed.player, enemy: B.turnPassed.enemy },
      lastActor: B.lastActor,
      actionNo: B.actionNo,
      turnId: B.turnId,
      units: new Array(B.units.length),
      uidMap: {},
      energy: { player: B.energy.player, enemy: B.energy.enemy },
      field: B.field, // battlefields are immutable config - share the reference
      /* Campaign rivals may value the same legal position differently.
         Profiles are immutable labels/config, so search clones share them
         exactly; they never alter rules, RNG or search depth. */
      aiProfiles: B.aiProfiles || null,
      comeback: { player: B.comeback.player, enemy: B.comeback.enemy },
      deathSeq: B.deathSeq,
      roundEchoUsed:
        typeof B.roundEchoUsed === 'object' && B.roundEchoUsed
          ? { player: !!B.roundEchoUsed.player, enemy: !!B.roundEchoUsed.enemy }
          : { player: false, enemy: false },
      costMods: {
        player: B.costMods.player.map(function (m) {
          return { flat: m.flat, pct: m.pct, turns: m.turns, signaturesOnly: m.signaturesOnly };
        }),
        enemy: B.costMods.enemy.map(function (m) {
          return { flat: m.flat, pct: m.pct, turns: m.turns, signaturesOnly: m.signaturesOnly };
        }),
      },
      log: [],
      simulation: !!B.simulation,
      silent: true, // suppress log writes entirely
      deferred: B.deferred.map(function (d) {
        return {
          phase: d.phase,
          armAt: d.armAt,
          srcUid: d.srcUid,
          targetUids: d.targetUids.slice(),
          effect: d.effect,
          ctx: d.ctx,
          side: d.side,
        };
      }),
      over: B.over,
      winner: B.winner,
      acted: { player: {}, enemy: {} },
      rng: rng || B.rng,
    };
    for (var s1 in B.acted.player) B2.acted.player[s1] = B.acted.player[s1];
    for (var s2 in B.acted.enemy) B2.acted.enemy[s2] = B.acted.enemy[s2];
    for (var i = 0; i < B.units.length; i++) {
      B2.units[i] = cloneUnit(B.units[i], B2);
      B2.uidMap[B2.units[i].uid] = B2.units[i];
    }
    return B2;
  }

  function unitsOf(B, side) {
    return B.units.filter(function (u) {
      return u.side === side && u.alive;
    });
  }

  /* ---------------------------------------------------------
     DETERMINISTIC TARGET ORDERING
     -------------------------------------------------------------
     Every "lowest HP" / "highest ATK" selector has to break ties the
     same way every time, on every machine. Array.prototype.sort is
     stable, but stability only preserves the INPUT order - and in a
     multiplayer match the two clients build their unit arrays from
     opposite perspectives, so "the input order" is not something both
     sides agree on.

     Two legends on 4,900 HP is not a rare edge case: shared statlines
     and full-HP openings make ties routine, and an unbroken tie means
     the two clients quietly heal or execute DIFFERENT legends and the
     match desyncs several rounds later, far from the cause.

     So every ordering ends in a stable tie-break on (slot, idx),
     which is a property of the board itself and therefore identical
     on both screens. `sortUnits` is the ONLY way units should ever be
     ordered for target selection.
     --------------------------------------------------------- */
  function sortUnits(list, cmp) {
    return list.slice().sort(function (a, b) {
      var d = cmp(a, b);
      if (d) return d;
      if (a.slot !== b.slot) return a.slot - b.slot;
      return (a.idx || 0) - (b.idx || 0);
    });
  }

  /* A CANONICAL ORDER FOR SWEEPING THE WHOLE BOARD.
     -------------------------------------------------------------
     `B.units` is built player-team-first, which means its order is a
     property of WHOSE SCREEN YOU ARE ON, not of the game. That is
     harmless for a sweep whose steps are independent, and a real bug
     for one whose steps interact - two delayed strikes landing on the
     same round resolved in one order for the host and the opposite
     order for the guest, and the second one killed a legend on only one
     of the two machines.

     Sorting by 'player' first would NOT fix it, because each client
     calls its own team 'player' - the two sweeps would still run in
     opposite orders. What is needed is an absolute frame, and
     `oddFirst` already provides one: it names, in local terms, the
     side that opens the odd rounds, and both clients agree on who
     that is. So "the odd-round opener's team, then the other" is a
     single global ordering that both machines compute identically.

     In singleplayer oddFirst is 'player', so this is exactly the old
     player-then-enemy order and nothing changes. */
  function boardOrder(B) {
    var firstSide = B.oddFirst === 'enemy' ? 'enemy' : 'player';
    return B.units.slice().sort(function (a, b) {
      if (a.side !== b.side) return a.side === firstSide ? -1 : 1;
      return a.slot - b.slot || (a.idx || 0) - (b.idx || 0);
    });
  }
  function opposite(side) {
    return side === 'player' ? 'enemy' : 'player';
  }
  function unitAt(B, side, slot) {
    return (
      B.units.filter(function (u) {
        return u.side === side && u.slot === slot && u.alive;
      })[0] || null
    );
  }

  function logMsg(B, type, text, meta) {
    if (B.silent || B.simulation) return; // search/sim runs do not build visual logs
    B.log.push({ round: B.round, type: type, text: text, meta: meta || {} });
  }

  /* Structured battle-event hook for statistics harnesses. A listener
     sets window.EOL.onBattleEvent = function (B, ev) and receives
     fine-grained events (damage, heals, shields, statuses, deaths...).
     Purely observational: gameplay logic never reads it, and silent
     AI-search clones are excluded, so rollouts never pollute stats. */
  function emit(B, ev) {
    if (B.silent) return;
    var h = window.EOL && window.EOL.onBattleEvent;
    if (h) h(B, ev);
  }

  /* ---------------------------------------------------------
     Energy cost, including cost modifiers
     --------------------------------------------------------- */
  function costOf(B, unit, ability) {
    var base = ability.cost || 0;
    if (base === 0) return 0;
    var flat = 0,
      pct = 0;
    /* `signaturesOnly` modifiers skip role Basics entirely (Prophecy). */
    B.costMods[unit.side].forEach(function (m) {
      if (m.signaturesOnly && ability.basic) return;
      flat += m.flat || 0;
      pct += m.pct || 0;
    });
    (unit.costMods || []).forEach(function (m) {
      if (m.signaturesOnly && ability.basic) return;
      flat += m.flat || 0;
      pct += m.pct || 0;
    });
    return Math.max(0, Math.round((base + flat) * (1 + pct / 100)));
  }

  function canUse(B, unit, ability, o) {
    if (!unit.alive || ability.type !== 'Active') return false;
    if (B.acted[unit.side][unit.uid]) return false;
    // Silence prevents the legend's signature Active only; Basics still work.
    /* Silence blocks EVERY action, Basics included (2026-07-31). It used
       to gate signatures only, so the AI simply answered with a Basic and a
       40 EN Silence bought almost nothing - measured at 2.86 applications
       per game for near-zero effect. A silenced legend now loses the turn,
       which is what makes control a real currency. */
    if (unit.flags.silence > 0) return false;
    // the side that opens the round is limited to Basics
    if (signatureBlocked(B, unit, ability)) return false;
    /* The Narrow Pass: the choke point means only the front line can throw a
       basic attack; the back row has to spend a real skill to contribute. */
    if (B.field && B.field.basicsFrontRowOnly && ability.basic && !isFront(unit)) return false;
    /* `oncePerBattle: true` on an Active locks it after a single cast.
       Generic gate - any card whose effect is too swingy to repeat (a
       resurrection, a full-team cleanse) declares it on the ability and
       the engine enforces it. Tracked on the unit, so it survives in
       cloneBattle and the AI's lookahead cannot "discover" a second use. */
    if (ability.oncePerBattle && unit.usedOnce['ab:' + ability.name]) return false;
    /* o.ignoreEnergy: legality WITHOUT the price, for diagnostics that
       need to separate "too poor" from "illegal" (whyCantAct). */
    return (o && o.ignoreEnergy) || B.energy[unit.side] >= costOf(B, unit, ability);
  }

  /* Can the unit fire this ability RIGHT NOW, targets included? canUse
     says the cast itself is legal (energy, silence, locks); a cast also
     needs something to AIM at - an enemy team whose only survivor is
     Untargetable leaves attacks with nobody to choose, and a side whose
     every ability is in that state has no actions at all. Abilities that
     aim at allies (a Medic's heal) still count, self/auto casts always
     do. */
  function usableNow(B, unit, ability, o) {
    if (!canUse(B, unit, ability, o)) return false;
    var t = (ability.spec && ability.spec.target) || {};
    if (t.side === 'none' || t.side === 'self' || t.side === 'auto') return true;
    /* ENOUGH targets, not just SOME. A `pick: 'two'` ability facing a
       single survivor cannot be cast at all - the targeting UI demands
       two choices and there is only one body to click.

       This used to read `> 0`, which quietly disagreed with the
       battle UI (js/battle.js already required `>= pickCount`). On the
       Narrow Pass a back-row legend has no Basic, so a two-target
       signature was the only move; against one enemy the engine
       believed the side could act, refused to auto-pass, and the round
       stalled with every ability greyed out. */
    return legalTargets(B, unit, ability).length >= Math.max(1, pickCount(ability));
  }

  /* WHY can't this side act? The advance banner used to blame Energy
     whenever anyone stood idle, but a locked-out side can be broke,
     target-starved, or skill-starved - three different feelings a player
     should be able to tell apart. Evaluated without Energy first: */
  function whyCantAct(B, side) {
    var idle = unitsOf(B, side).filter(function (u) {
      return u.alive && !B.acted[side][u.uid];
    });
    if (!idle.length) return 'acted';
    var free = { ignoreEnergy: true };
    /* energy-only blocker: something is fully legal, targets included,
       if we pretend the side is rich */
    if (
      idle.some(function (u) {
        return usableNow(B, u, u.card.ability, free) || usableNow(B, u, roleAbility(u), free);
      })
    )
      return 'energy';
    /* casts would be legal but nothing can be aimed at (the Untargetable
       straggler case) */
    if (
      idle.some(function (u) {
        return canUse(B, u, u.card.ability, free) || canUse(B, u, roleAbility(u), free);
      })
    )
      return 'targets';
    /* everything left is locked by silence, once-per-battle rules, the
       opening-Basic phase, or the field's own laws */
    return 'skills';
  }

  /* ---------------------------------------------------------
     PROTECTION MODEL  (revised 2026-08-02)
     -------------------------------------------------------------
     Two protection keywords with deliberately different strength:

       Provoke       a REDIRECT + a TAX. Forces single-target
                     attackers onto the provoker, and taxes anyone
                     who gets around it. Counterable by design.
       Untargetable  a NEGATION. Absolute. Nothing in the game may
                     pierce it, ever. Rare and expensive, and it is
                     the clean upper bound that lets Provoke stay
                     breakable.

     WHY THE RENAME. This used to be called Provoke, which in most
     games means "you cannot hit anything else." That is not what
     this keyword does: area damage splashes past it, Sniper
     signatures shoot through it, and pure utility ignores it. The
     word promised an absolute and delivered a tax, which is exactly
     the thing players then mis-predict. "taunt" says: I have
     drawn your attention and made hitting anyone else expensive.

     THE ONE RULE
       A Provoke redirects single-target ATTACKS onto the provoker.
       Anything that gets around it (a pierce, or an area effect
       splashing wide) deals PROVOKE_TAX damage to every target that
       is NOT the provoker. The provoker itself always takes full
       damage, so hitting the wall is never the worse option.

     WHY AoE IS NOW TAXED (the correction)
       The previous pass exempted area damage entirely and it
       overcorrected hard: measured over 5,000 games, Caster went
       50.0% -> 57.2% and Tank 55.1% -> 46.3%, with Caster x2 at
       63.0% and Tank x2 at 41.7% (best and worst comps in the
       game). The AoE exemption was worth far more than the Sniper
       pierce, because it simultaneously restored the Caster's full
       output AND removed the Tank's main way of blunting them.
       Taxing the splash keeps the fix that mattered - one Provoke
       no longer deletes 5/6 of a 55 EN spell - without making
       Provoke meaningless against the role it exists to stop.

     Both rules are role-generic infrastructure. Any future faction's
     Sniper inherits the pierce; any future AoE inherits the splash
     tax.
     --------------------------------------------------------- */
  /* Damage multiplier for anything that gets around a live Provoke.
     0.8 -> 0.7 in the same pass that started taxing AoE: Snipers only
     gained 3.3pp from the pierce, so they can carry the steeper rate. */
  var PROVOKE_TAX = 0.7;
  /* legacy alias kept so older call sites and tests keep resolving */
  var TAUNT_PIERCE_MULT = PROVOKE_TAX;

  /* Does this specific ability ignore the Provoke REDIRECT?
     Role default: Sniper signatures. A card may opt in explicitly with
     `target.piercesTaunt` (or opt out with `piercesTaunt: false`). */
  function piercesTaunt(unit, ability) {
    var t = (ability.spec || {}).target || {};
    if (t.piercesTaunt != null) return !!t.piercesTaunt;
    return unit.role === 'Sniper' && !ability.basic;
  }

  /* Multi-target abilities keep their whole target set through a
     Provoke - they just pay the tax on everyone who is not the
     provoker. */
  function isMultiTarget(ability) {
    var t = (ability.spec || {}).target || {};
    return t.pick === 'all' || t.pick === 'two';
  }

  /* A Provoke can only intercept something aimed AT a body. So it
     redirects single-target ATTACKS and nothing else. An ability that
     deals no damage - a pure debuff, a Mark, a Silence, an Energy
     drain - is not intercepted, because there is no blow to step in
     front of.

     `isAttack` walks the effect list (including branch/randomOf
     sub-effects) for anything that actually deals damage. A card may
     force the classification with `target.attack: true|false`. */
  function isAttack(ability) {
    var spec = ability.spec || {};
    var t = spec.target || {};
    if (t.attack != null) return !!t.attack;
    var found = false;
    (function walk(list) {
      (list || []).forEach(function (e) {
        if (!e || found) return;
        if (e.k === 'dmg' || e.k === 'lifesteal') {
          found = true;
          return;
        }
        if (e.k === 'branch') {
          walk(e.then);
          walk(e.other);
          walk(e.else);
        }
        if (e.k === 'randomOf') walk(e.options);
        if (e.effects) walk(e.effects);
      });
    })(spec.effects);
    if (!found && spec.choose) {
      spec.choose.forEach(function (c) {
        if (!found) {
          (c.effects || []).forEach(function (e) {
            if (e && (e.k === 'dmg' || e.k === 'lifesteal')) found = true;
          });
        }
      });
    }
    return found;
  }

  /* Does a Provoke intercept this ability at all? */
  function tauntApplies(unit, ability) {
    if (piercesTaunt(unit, ability)) return false; // Sniper signature
    if (isMultiTarget(ability)) return false; // area effects splash over
    return isAttack(ability); // pure utility is never body-blocked
  }

  /* Is there a live Provoke on the defending side right now? */
  function provokeLive(B, side) {
    return unitsOf(B, side).some(function (u) {
      return u.flags.taunt > 0 && !(u.flags.untargetable > 0);
    });
  }

  /* ---------------------------------------------------------
     TARGETING
     Returns the list of legal targets for an ability.
     --------------------------------------------------------- */
  function legalTargets(B, unit, ability) {
    var spec = ability.spec || {};
    var t = spec.target || {};
    if (t.side === 'none' || t.side === 'self' || t.side === 'auto') return [];

    var side = t.side === 'ally' ? unit.side : opposite(unit.side);
    var pool = unitsOf(B, side);

    if (side !== unit.side) {
      /* Untargetable is absolute and is filtered FIRST, so nothing below
         - including a Provoke pierce or an AoE - can reach through it. */
      pool = pool.filter(function (u) {
        return !(u.flags.untargetable > 0);
      });

      /* Provoke redirects single-target ATTACKS onto the taunter. Area
         effects, Sniper signatures and pure-utility abilities are all
         exempt - see tauntApplies(). */
      if (tauntApplies(unit, ability)) {
        var taunts = pool.filter(function (u) {
          return u.flags.taunt > 0;
        });
        if (taunts.length) return taunts;
      }

      // row restriction: role default, overridden by the ability spec
      var row = t.row;
      if (!row) row = unit.role === 'Tank' || unit.role === 'Bruiser' ? 'front' : 'any';
      if (row === 'front') {
        var front = pool.filter(isFront);
        if (front.length) pool = front; // back row only once front is cleared
      } else if (row === 'back') {
        /* 'back' (Rapunzel) is a HARD restriction, unlike 'front'.
           It used to mirror the melee rule and fall through to the front
           line once the back row was empty, so against a 3-unit enemy team
           - everyone in front - "damage back-row enemies" hit the entire
           board. The hair reaches OVER the front line; if there is nobody
           back there, it reaches nobody. Front row stays a preference
           (melee steps up when the front is cleared), because that is the
           melee rule and every Tank/Bruiser depends on it. */
        pool = pool.filter(function (u) {
          return !isFront(u);
        });
      }
    }
    return pool;
  }

  /* how many targets the player must choose */
  function pickCount(ability) {
    var t = (ability.spec && ability.spec.target) || {};
    if (t.pick === 'two') return 2;
    if (t.pick === 'single') return 1;
    return 0; // all / auto / self / none
  }

  /* resolve the final target list once the player has chosen */
  function resolveTargets(B, unit, ability, chosen) {
    var spec = ability.spec || {};
    var t = spec.target || {};
    if (t.side === 'self') return [unit];
    if (t.side === 'none' || t.side === 'auto') return [];

    var pool = legalTargets(B, unit, ability);

    if (t.pick === 'all') return pool;
    if (t.pick === 'auto') {
      var sorted = pool.slice();
      if (t.auto === 'lowestHp') {
        sorted = sortUnits(pool, function (a, b) {
          return a.hp - b.hp;
        });
      } else if (t.auto === 'highestAtk') {
        sorted = sortUnits(pool, function (a, b) {
          return atkOf(b) - atkOf(a);
        });
      }
      return sorted.slice(0, 1);
    }

    /* A FORCED TARGET IS A RULE, NOT A SUGGESTION.
       Robin Hood's "Always targets the enemy with the highest ATK" used
       to be applied only by the callers that happened to ask -
       js/ai.js and the click handlers in js/battle.js - while
       useAbility() resolved whatever it was handed. Anything that did
       not consult forcedTarget (a replayed network action, a scripted
       line, a future caller) could quietly aim him somewhere else, and
       the card simply did not do what it says.

       Enforcing it HERE makes it true for every path at once, because
       every caller funnels through resolveTargets. `forcedTarget` is
       itself computed from legalTargets, so Provoke, Untargetable and
       row limits are already respected: this can only ever narrow the
       choice to one legal enemy, never widen it to an illegal one.

       It also reads LIVE ATK - atkOf() includes buffs, debuffs, the
       round ramp and terrain - so a legend buffed above Robin's usual
       prey becomes his target the moment the buff lands, which is what
       "highest ATK" has to mean in a game with ATK buffs in it. */
    var forced = forcedTarget(B, unit, ability);
    if (forced) return [forced];

    return (chosen || []).slice(0, pickCount(ability));
  }

  /* =============================================================
     WHO WOULD THIS ACTUALLY HIT?
     -------------------------------------------------------------
     `resolveTargets` answers "who is legally selected". That is not
     the same question as "who ends up being affected", because the
     effect tree can narrow the set further:

       - `onlyMarked` drops every unmarked target (Zeus)
       - a `branch` picks `then` or `other`, and each side can carry
         its own filters
       - `take: {n, by}` keeps only the top N
       - `frontOnly` / `backOnly` trim by row
       - per-effect `if` conditions can exclude individual targets

     The target preview used to show the LEGAL pool, so Zeus lit up
     all six enemies even when only one was Marked and only that one
     would be struck. That is a lie told by the UI about what the
     button does.

     This walks the same effect list the resolver walks and returns
     the units that would take a hit or a status. It is generic: any
     card, present or future, that uses these filters previews
     correctly without a special case, because it reads the card's
     own data rather than naming legends.

     Read-only. It never mutates the battle.
     ============================================================= */
  /* Effect kinds that DELIVER something to a legend, and therefore say
     "this legend is being hit". Everything absent from this list is
     either bookkeeping (`consumeMark`, `consumeBuffs`), a caster-side
     modifier (`outgoingMult`, `costMod`), or control flow. Listing the
     deliverers explicitly means a new bookkeeping effect cannot
     silently widen every preview in the game. */
  var DELIVERS = {
    dmg: 1,
    lifesteal: 1,
    heal: 1,
    shield: 1,
    stat: 1,
    mark: 1,
    burn: 1,
    silence: 1,
    exposed: 1,
    taunt: 1,
    untargetable: 1,
    cleanse: 1,
    healMod: 1,
    revive: 1,
    counterStrike: 1,
    damageResist: 1,
    damageMult: 1,
    drainEnergy: 1,
    stealEnergy: 1,
    delayed: 1,
    swapTargets: 1,
  };

  function affectedTargets(B, unit, ability, chosen, chooseIndex) {
    var spec = ability.spec || {};
    var base = resolveTargets(B, unit, ability, chosen);

    /* MANUAL-PICK SKILLS WITH NOTHING PICKED YET.
       resolveTargets answers "who is being hit", so for a single-target
       Skill with no selection it correctly returns nothing. But the
       hover PREVIEW is asking a different question - "who could I
       hit?" - and the honest answer there is the legal pool.

       Without this, hovering any Basic (Guard, Restore, Aim...) lit up
       nobody at all, because those are all manual-pick. The narrowing
       below still applies, so a Skill that only strikes the Marked
       still previews only the Marked. */
    if (!base.length && !(chosen && chosen.length) && pickCount(ability) > 0) {
      base = legalTargets(B, unit, ability);
    }
    if (!base.length) return base;

    var effects = spec.effects;
    if (spec.choose && spec.choose[chooseIndex || 0]) {
      effects = spec.choose[chooseIndex || 0].effects;
    }
    if (!effects || !effects.length) return base;

    var hit = [];
    var seen = {};
    var ctx = { self: unit, preDamaged: {}, turnIdAtStart: B.turnId };

    /* Only effects that LAND ON THE TARGETS tell us who is struck.
       A `to:'self'` heal or a `to:'allies'` buff says nothing about
       which enemy is hit, so those are skipped. */
    function scan(list) {
      list.forEach(function (e) {
        if (!e) return;
        if (e.k === 'branch') {
          /* Evaluate the branch exactly as the resolver would, then
             follow only the arm that would actually run. */
          var arm = branchPasses(B, unit, base, e.cond || {}) ? e.then : e.other;
          if (arm && arm.length) scan(arm);
          return;
        }
        /* a redirect means these effects do not describe the targets */
        if (e.to && e.to !== 'targets') return;

        /* BOOKKEEPING EFFECTS DO NOT DEFINE THE HIGHLIGHT.
           `consumeMark` and friends sweep the whole target list as an
           accounting step - Zeus consumes every Mark after striking.
           Counting them would put all six enemies back into the
           preview and undo the narrowing the real effects performed.
           Only effects that DELIVER something to a legend (damage, a
           heal, a status, a stat change) say who is being hit. */
        if (DELIVERS[e.k] !== 1) return;

        var set = base.slice();
        if (e.onlyMarked) {
          set = set.filter(function (t) {
            return t.flags.marked > 0;
          });
        }
        if (e.frontOnly) set = set.filter(isFront);
        if (e.backOnly) {
          set = set.filter(function (t) {
            return !isFront(t);
          });
        }
        if (e.if) {
          set = set.filter(function (t) {
            return condMet(B, e.if, condCtx(ctx, t));
          });
        }
        if (e.take && set.length > e.take.n) {
          if (e.take.by === 'highestAtk') {
            set = sortUnits(set, function (a, b) {
              return atkOf(b) - atkOf(a);
            });
          } else if (e.take.by === 'lowestHp') {
            set = sortUnits(set, function (a, b) {
              return a.hp - b.hp;
            });
          } else if (e.take.by === 'highestHp') {
            set = sortUnits(set, function (a, b) {
              return b.hp - a.hp;
            });
          }
          set = set.slice(0, e.take.n);
        }
        set.forEach(function (t) {
          if (seen[t.uid]) return;
          seen[t.uid] = 1;
          hit.push(t);
        });
      });
    }
    try {
      scan(effects);
    } catch (err) {
      return base; // never let a preview break the board
    }
    /* An ability whose every effect is a redirect (pure self-buff with
       an enemy target line) still legitimately "targets" its pool. */
    return hit.length ? hit : base;
  }

  /* Shared by the resolver and the preview so a branch can never be
     evaluated one way for the game and another way for the UI. */
  function branchPasses(B, src, list, cond, ctx) {
    var pass = true;
    ctx = ctx || {};
    if (cond.anyTargetMarked) {
      pass = list.some(function (t) {
        return t.flags.marked > 0;
      });
    }
    if (cond.anyTargetDebuffed) {
      pass = list.some(function (t) {
        return hasDebuff(t);
      });
    }
    if (cond.anyEnemyMarked) {
      pass = unitsOf(B, opposite(src.side)).some(function (t) {
        return t.flags.marked > 0;
      });
    }
    if (cond.targetHasDebuff != null) {
      pass = list.length > 0 && hasDebuff(list[0]) === !!cond.targetHasDebuff;
    }
    /* JOTUNHEIM: the fallen count, readable from a branch.
       -------------------------------------------------------------
       branchPasses() is a HAND-MAINTAINED subset of condMet(), and an
       unknown key does not fail closed - it leaves `pass` at its
       default of true. Odin's `fallenAtLeast: 3` therefore fired the
       bonus arm from round one, and Shiva's `targetMarked` (a real
       condMet key, but not one branchPasses knows) did the same.

       Both were silent: the card did MORE than its text, which no
       assertion was looking for. Delegating unknown keys to condMet
       would be the deeper fix, but the two functions deliberately
       differ - branchPasses reasons about a target LIST where condMet
       reasons about one target - so the honest repair is to teach it
       the keys the roster actually uses, and to have
       sim/verify_chapter2.js prove each branch flips. */
    if (cond.fallenAtLeast != null) pass = (B.deathSeq || 0) >= cond.fallenAtLeast;
    if (cond.fallenBelow != null) pass = (B.deathSeq || 0) < cond.fallenBelow;
    if (cond.targetMarked != null) {
      pass = list.length > 0 && list[0].flags.marked > 0 === !!cond.targetMarked;
    }
    if (cond.selfShielded) pass = src.shield > 0;
    if (cond.targetShielded != null) {
      pass = list.length > 0 && list[0].shield > 0 === !!cond.targetShielded;
    }
    if (cond.debuffCountAtLeast != null) {
      pass = list.length > 0 && debuffCount(list[0]) >= cond.debuffCountAtLeast;
    }
    if (cond.buffCountAtLeast != null) {
      pass = list.length > 0 && buffCount(list[0]) >= cond.buffCountAtLeast;
    }
    var first = list[0];
    var firstHp =
      first && ctx.preHp && ctx.preHp[first.uid] != null
        ? ctx.preHp[first.uid] / first.maxHp
        : first
          ? first.hp / first.maxHp
          : null;
    if (cond.targetHpBelow != null) {
      pass = pass && list.length > 0 && firstHp < cond.targetHpBelow;
    }
    if (cond.targetHpAbove != null) {
      pass = pass && list.length > 0 && firstHp > cond.targetHpAbove;
    }
    if (cond.targetHpBetween) {
      pass =
        pass &&
        list.length > 0 &&
        firstHp >= cond.targetHpBetween[0] &&
        firstHp <= cond.targetHpBetween[1];
    }
    if (cond.targetHpOutside) {
      pass =
        pass &&
        list.length > 0 &&
        (firstHp < cond.targetHpOutside[0] || firstHp > cond.targetHpOutside[1]);
    }
    return pass;
  }

  /* Robin Hood's passive forces his target selection */
  function forcedTarget(B, unit, ability) {
    var p = unit.card.ability.passive;
    if (!p || !hasTrig(p, 'static') || !p.forceTarget) return null;
    if (ability.cost > 0 && (ability.spec.target || {}).pick !== 'single') return null;
    var pool = legalTargets(B, unit, ability);
    if (!pool.length) return null;
    var s = pool.slice();
    if (p.forceTarget === 'highestAtk') {
      s = sortUnits(pool, function (a, b) {
        return atkOf(b) - atkOf(a);
      });
    }
    return s[0];
  }

  /* ---------------------------------------------------------
     CONDITIONS
     --------------------------------------------------------- */
  /* Build the object passed to condMet: the ability-wide ctx plus the
     target currently being processed. Keeping the spread explicit avoids
     silently dropping fields like preDamaged. */
  function condCtx(ctx, target) {
    return {
      target: target,
      self: ctx.self,
      /* HP-gated effects read the target at cast start. Without this,
         an earlier hit/heal in the same ability could switch on a later
         mutually-exclusive arm (Goldilocks fired both damage lines) or
         switch off a promised triage bonus. */
      preHp: ctx.preHp,
      preDamaged: ctx.preDamaged,
      wasMarked: ctx.wasMarked,
      lastDamage: ctx.lastDamage,
      turnIdAtStart: ctx.turnIdAtStart,
      killedSomething: ctx.killedSomething,
      killCount: ctx.killCount,
      /* Abe no Seimei: how much Energy THIS cast has drained so far. Must be
         forwarded or `drainedEnergyAbove` always reads 0 and its gate can
         never pass. */
      drainedEnergy: ctx.drainedEnergy,
      scale: ctx.scale,
      signature: ctx.signature,
    };
  }

  function condMet(B, cond, ctx) {
    if (!cond) return true;
    var tgt = ctx.target;
    /* Snapshot HP once per cast. Conditions that are part of a triggered
       passive have no snapshot and correctly read the live value. */
    var hpRatio =
      tgt && ctx.preHp && ctx.preHp[tgt.uid] != null
        ? ctx.preHp[tgt.uid] / tgt.maxHp
        : tgt
          ? tgt.hp / tgt.maxHp
          : null;
    if (cond.targetHpBelow != null) {
      if (!tgt || hpRatio >= cond.targetHpBelow) return false;
    }
    if (cond.targetHpAbove != null) {
      if (!tgt || hpRatio <= cond.targetHpAbove) return false;
    }
    /* Goldilocks: an HP window. `targetHpBetween` is INCLUSIVE at both
       ends ("between 30% and 70% HP" includes a legend sitting at exactly
       30% or 70%); `targetHpOutside` is its exact complement. */
    if (cond.targetHpBetween) {
      if (!tgt) return false;
      if (hpRatio < cond.targetHpBetween[0] || hpRatio > cond.targetHpBetween[1]) return false;
    }
    if (cond.targetHpOutside) {
      if (!tgt) return false;
      if (hpRatio >= cond.targetHpOutside[0] && hpRatio <= cond.targetHpOutside[1]) return false;
    }
    if (cond.targetBackRow) {
      if (!tgt || isFront(tgt)) return false;
    }
    if (cond.targetHasDebuff != null) {
      if (!tgt) return false;
      if (hasDebuff(tgt) !== !!cond.targetHasDebuff) return false;
    }
    if (cond.targetDamagedBefore) {
      // Uses the snapshot taken before this ability began resolving, so a
      // multi-hit ability can't trigger the follow-up off its own first hit.
      if (!tgt || !ctx.preDamaged || !ctx.preDamaged[tgt.uid]) return false;
    }
    if (cond.targetElement) {
      if (!tgt || tgt.element !== cond.targetElement) return false;
    }
    if (cond.targetExposed) {
      if (!tgt || !(tgt.flags.exposed > 0)) return false;
    }
    if (cond.targetMarked || cond.ifTargetMarked) {
      if (!tgt || !(tgt.flags.marked > 0 || (ctx.wasMarked && ctx.wasMarked[tgt.uid])))
        return false;
    }
    if (cond.targetBurning) {
      if (!tgt || !(tgt.flags.burn > 0)) return false;
    }
    /* is the victim the one currently body-blocking for its team? Lets a
       card reward punching through a wall specifically. */
    if (cond.targetTaunting != null) {
      if (!tgt || tgt.flags.taunt > 0 !== !!cond.targetTaunting) return false;
    }
    /* ACHAEA: the caster's own HP. `targetHpBelow` reads the victim,
       which is the wrong end for a passive that asks "am I hurt?" -
       Achilles' rage triggers on HIS wound, not his attacker's. Reads
       live HP because a passive has no pre-cast snapshot. */
    if (cond.selfHpBelow != null) {
      if (!ctx.self || ctx.self.hp / ctx.self.maxHp >= cond.selfHpBelow) return false;
    }
    if (cond.selfHpAbove != null) {
      if (!ctx.self || ctx.self.hp / ctx.self.maxHp <= cond.selfHpAbove) return false;
    }
    if (cond.selfShielded) {
      if (!ctx.self || ctx.self.shield <= 0) return false;
    }
    if (cond.targetShielded) {
      if (!tgt || tgt.shield <= 0) return false;
    }
    /* Brutus: the target is carrying something POSITIVE - a Shield or any
       positive stat buff. The mirror of targetHasDebuff, and the reason
       Roma punishes a Camelot/Olympus/Yamato setup turn. */
    /* Stacking payoffs. `targetHasDebuff` is binary, so the SECOND debuff on
       a target was worth nothing and stacking control had no damage
       conversion. These count them, so a card can scale off pressure. */
    if (cond.debuffCountAtLeast != null) {
      if (!tgt || debuffCount(tgt) < cond.debuffCountAtLeast) return false;
    }
    if (cond.buffCountAtLeast != null) {
      if (!tgt || buffCount(tgt) < cond.buffCountAtLeast) return false;
    }
    if (cond.targetHasBuff != null) {
      if (!tgt) return false;
      var buffed =
        tgt.shield > 0 ||
        tgt.buffs.some(function (b) {
          return b.amt > 0;
        });
      if (buffed !== !!cond.targetHasBuff) return false;
    }
    if (cond.selfEnergyAbove != null) {
      if (!ctx.self || B.energy[ctx.self.side] <= cond.selfEnergyAbove) return false;
    }
    if (cond.selfEnergyBelow != null) {
      if (!ctx.self || B.energy[ctx.self.side] >= cond.selfEnergyBelow) return false;
    }
    if (cond.killedTarget) {
      if (!ctx.killedSomething) return false;
    }
    /* Caesar: how many units THIS cast has killed so far. killedSomething is
       a single boolean, so it cannot tell one kill from a double kill -
       killCount is incremented per lethal blow in the `dmg` case. */
    if (cond.killedCountAtLeast != null) {
      if ((ctx.killCount || 0) < cond.killedCountAtLeast) return false;
    }
    if (cond.drainedEnergyAbove != null) {
      if ((ctx.drainedEnergy || 0) < cond.drainedEnergyAbove) return false;
    }
    /* JOTUNHEIM: how many legends have FALLEN so far, counting both
       sides. `deathSeq` is the engine's existing monotonic death counter
       (incremented in handleDeath) - this condition only reads it, so
       Ragnarok needs no new state, no new status and nothing to
       serialize. Deliberately counts BOTH teams: the Norse read the end
       of the world approaching, not their own casualties, and a card
       that only counted your own losses would reward losing. */
    if (cond.fallenAtLeast != null) {
      if ((B.deathSeq || 0) < cond.fallenAtLeast) return false;
    }
    /* The complement, so a static passive can express "while fewer than
       N have fallen" without needing an `unless` keyword (Fenrir's
       chains). Strictly below, so fallenBelow:3 and fallenAtLeast:3
       partition the space with no overlap and no gap. */
    if (cond.fallenBelow != null) {
      if ((B.deathSeq || 0) >= cond.fallenBelow) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------
     Passive helpers
     --------------------------------------------------------- */
  function passiveOf(u) {
    /* Defeated legends are inert. Keeping this guard at the passive lookup
       prevents every reaction path—ally damage, wards, kills, counters and
       field modifiers—from accidentally asking a corpse to participate.
       wouldDie is still legal because handleDeath checks it before flipping
       the unit's `alive` flag. */
    if (!u || !u.alive) return null;
    var a = u.card.ability;
    return a.type === 'Passive' && a.passive ? a.passive : null;
  }

  /* A passive may declare a single `trigger` or a `triggers` array of
     trigger names (Mulan, Athena, Lancelot). */
  function hasTrig(p, name) {
    if (!p) return false;
    return p.triggers ? p.triggers.indexOf(name) >= 0 : p.trigger === name;
  }

  /* Lancelot: an ally just gained a Shield or Provoke. */
  function fireAllyWarded(B, warded) {
    unitsOf(B, warded.side).forEach(function (u) {
      var p = passiveOf(u);
      if (!hasTrig(p, 'allyWarded')) return;
      var before = u.buffs.length;
      emit(B, {
        t: 'proc',
        owner: u.uid,
        ability: u.card.ability.name,
        trigger: 'allyWarded',
        round: B.round,
      });
      applyEffects(B, u, [u], p.effects, {
        trigger: 'allyWarded',
        immediate: true,
        triggerTarget: warded,
      });
      if (u.buffs.length > before) {
        logMsg(B, 'passive', u.name + ' stands taller - ' + u.card.ability.name + '!', {
          uid: u.uid,
        });
      }
    });
  }

  /* Red Riding Hood: an ally just struck a debuffed enemy. */
  function fireAllyStruckDebuffed(B, attacker, target) {
    if (!hasDebuff(target)) return;
    unitsOf(B, attacker.side).forEach(function (u) {
      var p = passiveOf(u);
      if (!hasTrig(p, 'allyStruckDebuffed')) return;
      var before = u.buffs.length;
      emit(B, {
        t: 'proc',
        owner: u.uid,
        ability: u.card.ability.name,
        trigger: 'allyStruckDebuffed',
        round: B.round,
      });
      applyEffects(B, u, [u], p.effects, {
        trigger: 'allyStruckDebuffed',
        immediate: true,
        triggerTarget: target,
      });
      if (u.buffs.length > before) {
        logMsg(B, 'passive', u.name + ' presses the advantage.', { uid: u.uid });
      }
    });
  }

  /* Lancelot: an ally just struck an Exposed enemy. */
  function fireAllyStruckExposed(B, attacker, target) {
    unitsOf(B, attacker.side).forEach(function (u) {
      var p = passiveOf(u);
      if (!hasTrig(p, 'allyStruckExposed')) return;
      emit(B, {
        t: 'proc',
        owner: u.uid,
        ability: u.card.ability.name,
        trigger: 'allyStruckExposed',
        round: B.round,
      });
      applyEffects(B, u, [u], p.effects, {
        trigger: 'allyStruckExposed',
        immediate: true,
        triggerTarget: target,
      });
      logMsg(B, 'passive', u.name + ' exploits the opening - ' + u.card.ability.name + '.', {
        uid: u.uid,
      });
    });
  }

  /* static outgoing damage multipliers (Robin Hood, Red Riding Hood) */
  function outgoingMult(B, attacker, target) {
    var p = passiveOf(attacker);
    var m = 1;
    if (p && hasTrig(p, 'static')) {
      (p.effects || []).forEach(function (e) {
        if (e.k !== 'outgoingMult') return;
        /* A PASSIVE IS THE CARD'S SIGNATURE. Robin Hood's 1.12 becomes
           1.18 at max level - the same flat +2 points per level every
           other signature number gets. Passives have no cast context,
           so the bonus is read straight off the owner. */
        if (condMet(B, e.when, { target: target, self: attacker })) {
          m *= upToward(e.mult - 1, upPts(attacker, null) / 100) + 1;
        }
      });
    }
    return m;
  }

  /* Athena: the first enemy Skill each round deals 40% less, and any
     Marked attacker deals 15% less. Both live on the DEFENDING side. */
  /* `dryRun` means "tell me the number, change nothing".
     -------------------------------------------------------------
     THIS FUNCTION USED TO MUTATE THE BATTLE. The firstPerRound gate
     below consumes a once-per-round flag (Athena's Divine Strategy),
     and previewDamage() calls straight into here - so merely ASKING
     what a move would do burned the flag on the live board.

     Two ways that reached players:

       - js/ai.js:342,356 previews against the LIVE battle while
         searching, so the AI thinking about a move spent the real
         Athena charge;
       - js/battle.js:1334,1415 previews on hover, so a human simply
         MOUSING OVER a target consumed it - and in multiplayer only
         on the hovering player's client, which desyncs the two
         boards. That is the mirror harness's 37/200 divergence.

     The flag now moves only when damage is actually dealt. */
  function incomingMult(B, attacker, defender, isAbilityDamage, dryRun) {
    var m = 1;
    unitsOf(B, defender.side).forEach(function (u) {
      var p = passiveOf(u);
      if (!p || (!hasTrig(p, 'incomingAbilityDamage') && !hasTrig(p, 'static'))) return;
      (p.effects || []).forEach(function (e) {
        if (e.k !== 'damageMult' && e.k !== 'damageResist') return;
        /* honour a `when` gate on the modifier itself. Benkei's Standing
           Death resist (selfEnergyAbove 49) was the only card carrying
           one and it was silently ignored - he took 15% less damage at
           every energy level, not just at 50+. */
        if (e.when && !condMet(B, e.when, { self: u, attacker: attacker, defender: defender }))
          return;
        /* The passive's owner upgrades their own defensive multiplier.
           These are reductions (<1), so stronger means FURTHER from 1:
           Athena's 0.85 becomes 0.79 at max, Benkei's 0.85 likewise. */
        var eMult = e.mult < 1 ? Math.max(0, e.mult - upPts(u, null) / 100) : e.mult;
        var applied = false;
        if (e.firstPerRound) {
          // only signature Skills, and only the first one each round
          if (!isAbilityDamage) return;
          if (u.roundFlags.athenaFirst) return;
          /* A preview must not spend the charge - it only reports what
             WOULD happen. Only a real hit consumes it. */
          if (!dryRun) u.roundFlags.athenaFirst = true;
          m *= eMult;
          applied = true;
          logMsg(B, 'passive', u.name + "'s Divine Strategy blunts the attack.", { uid: u.uid });
        } else if (e.ifAttackerMarked) {
          if (!(attacker.flags.marked > 0)) return;
          m *= eMult;
          applied = true;
        } else {
          m *= eMult;
          applied = true;
        }
        if (applied) {
          // statistics: remember who blunted this blow so dealDamage can
          // credit the damage it prevented
          (B._multTrail = B._multTrail || []).push({ owner: u.uid, mult: eMult });
          emit(B, {
            t: 'proc',
            owner: u.uid,
            ability: u.card.ability.name,
            trigger: 'incomingAbilityDamage',
            round: B.round,
          });
        }
      });
    });
    return m;
  }

  /* ---------------------------------------------------------
     Core damage / heal
     --------------------------------------------------------- */
  /* the battle report's ledger line for one unit. AI lookahead clones
     (cloneBattle) do not carry a tally - they get a throwaway one so
     the simulation math never notices the bookkeeping. */
  function tallyOf(B, uid) {
    if (!B.tally) B.tally = {};
    var t = B.tally[uid];
    if (!t) t = B.tally[uid] = { dealt: 0, taken: 0, healed: 0, absorbed: 0, kills: 0 };
    return t;
  }

  function dealDamage(B, src, tgt, raw, element, isAbility, noCounter, noRiders) {
    if (!tgt.alive) return 0;

    /* Run, Run, Run / Breadcrumb Barricade recover BEFORE the incoming
       blow resolves. Resolving this after damage let a nominally lethal
       hit take the target to 0 and then heal it back before death was
       finalized, creating a hidden death-cheat. Pre-hit recovery can
       still save a low legend, but a blow larger than the recovered HP now
       kills them honestly. */
    if (tgt.flags.taunt > 0 && tgt.flags.tauntHeal) {
      healUnit(B, tgt, tgt, tgt.maxHp * (tgt.flags.tauntHeal / 100));
    }

    /* Guan Yu: whether the target was Shielded at the moment the attack
       landed (before the shield could absorb it). */
    var hadShield = tgt.shield > 0;

    var outM = outgoingMult(B, src, tgt);
    B._multTrail = null; // incomingMult fills this with who blunted the blow
    var inM = incomingMult(B, src, tgt, isAbility);
    /* CASTABLE damage reduction (2026-08-01). `damageResist` used to be a
       passive-only declarative modifier read out of a static passive. As a
       timed flag it becomes a real support tool - a Medic can pre-emptively
       harden an ally instead of only repairing damage after it lands. */
    var resistM = tgt.flags.resistPct > 0 ? 1 - Math.min(90, tgt.flags.resistPct) / 100 : 1;
    var mult = outM * inM * resistM;
    var afterDef = raw * mult * (1 - defOf(tgt) / 100);

    // crit - always exactly CRIT_MULT (1.5x), never variable
    var crit = false;
    if (critOf(src) > 0 && B.rng() * 100 < critOf(src)) {
      crit = true;
      afterDef *= CRIT_MULT;
    }

    var dmg = Math.max(1, Math.round(afterDef));

    // shield soaks first
    var absorbed = 0;
    if (tgt.shield > 0) {
      absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) {
        // flagged as absorb so the UI can show it in shield colour
        logMsg(B, 'absorb', tgt.name + "'s shield absorbs " + absorbed + '.', {
          uid: tgt.uid,
          amount: absorbed,
          src: src.uid,
          /* A fully absorbed crit has no later HP-damage number to carry
             its verdict, so the shield number owns the critical tell. */
          crit: crit && dmg === 0,
          element: element,
        });
      }
    }

    var hpBefore = tgt.hp;
    if (dmg > 0) {
      tgt.hp = Math.max(0, tgt.hp - dmg);
      tgt.lastDamagedRound = B.round;
    }

    /* A Mark is spent the moment an Skill damages the target. Captured
       before it is cleared so riders that key off "was Marked" (Ares'
       Burn, Athena's damage cut) still see it for this same blow. */
    /* THE SPIRIT WORLD: nothing dies to damage here. A blow that would
       be lethal instead leaves the legend on 1 HP. It is a once-per-legend
       reprieve (`spiritSpared`) rather than a standing immunity - the
       NEXT blow finishes the job, even a second hit of the SAME cast
       (user ruling 2026-08-05: a two-part skill's follow-up - Sniper's
       Aim rider, Guy of Gisborne's execute - must REGISTER; the old
       same-action shield kept the spare alive but swallowed the follow
       hit's feedback, which read as "my skill didn't register"). The
       field's counter-pressure identity is unchanged: single-hit burst
       is what the reprieve punishes; multi-hit and chip damage are the
       intended answers. Checked BEFORE Benkei's death-cheat so the two
       never both fire on the same blow. */
    if (B.field && B.field.spiritReprieve && tgt.hp <= 0 && !tgt.spiritSpared) {
      tgt.spiritSpared = true;
      tgt.hp = 1;
      emit(B, { t: 'spirit-spared', uid: tgt.uid, round: B.round });
      logMsg(B, 'passive', tgt.name + ' is held at the threshold by the spirits.', {
        uid: tgt.uid,
      });
    }

    // Benkei's one-time death-cheat is a passive condition, not a status.
    var deathPassive = passiveOf(tgt);
    if (tgt.hp <= 0 && deathPassive && deathPassive.deathCheat && !tgt.deathCheated) {
      tgt.deathCheated = true;
      tgt.hp = Math.max(1, Math.round(tgt.maxHp * 0.02));
      B.energy[tgt.side] = deathPassive.deathEnergy != null ? deathPassive.deathEnergy : 10;
      emit(B, {
        t: 'proc',
        owner: tgt.uid,
        ability: tgt.card.ability.name,
        trigger: 'deathCheat',
        round: B.round,
      });
      logMsg(B, 'passive', tgt.name + ' refuses to fall - Standing Death!', { uid: tgt.uid });
    }

    var wasMarked = tgt.flags.marked > 0;
    var wasDebuffed = hasDebuff(tgt); // pre-hit prey state (Red Riding Hood)
    if (wasMarked && isAbility && dmg > 0) {
      tgt.flags.marked = 0;
      tgt.flags.markedTurns = 0;
      logMsg(B, 'markConsumed', tgt.name + "'s mark is consumed.", {
        uid: tgt.uid,
        status: 'marked',
      });
      emit(B, {
        t: 'markConsumed',
        tgt: tgt.uid,
        by: src.uid,
        damage: dmg + absorbed,
        round: B.round,
      });
    }

    /* ---- statistics event ------------------------------------------
       amount        HP actually lost
       absorbed      soaked by shields (credited to the shield granter)
       overkill      damage beyond what killing the target required
       exposedBonus  extra damage caused purely by Exposed stripping DEF
       prevents      damage blunted by defender-side passives, per owner */
    var prevents = null;
    if (B._multTrail && B._multTrail.length) {
      var v = raw * outM;
      prevents = [];
      B._multTrail.forEach(function (m2) {
        var p = v * (1 - m2.mult);
        v *= m2.mult;
        if (p > 0.5) prevents.push({ owner: m2.owner, amt: Math.round(p) });
      });
      B._multTrail = null;
    }
    var exposedBonus = 0;
    if (tgt.flags.exposed > 0) {
      var xd = tgt.baseDef + sumBuffs(tgt, 'def');
      if (!isFront(tgt) && frontRowWiped(B, tgt.side)) xd -= BACKLINE_DEF_PENALTY;
      xd = clamp(xd, 0, 75);
      if (xd > 0) exposedBonus = Math.round(raw * mult * (xd / 100) * (crit ? CRIT_MULT : 1));
    }
    /* the battle report: dealt counts shield-soak too (the blow was
       thrown); taken counts only HP actually lost */
    var tS = tallyOf(B, src.uid);
    var tT = tallyOf(B, tgt.uid);
    tS.dealt += dmg + absorbed;
    tT.taken += dmg;
    tT.absorbed += absorbed;
    if (tgt.hp <= 0 && hpBefore > 0) tS.kills += 1;
    emit(B, {
      t: 'dmg',
      src: src.uid,
      tgt: tgt.uid,
      amount: dmg,
      absorbed: absorbed,
      overkill: Math.max(0, dmg - hpBefore),
      crit: crit,
      element: element,
      ability: !!isAbility,
      killed: tgt.hp <= 0,
      tgtFront: isFront(tgt),
      tgtTaunting: tgt.flags.taunt > 0,
      tgtMarked: wasMarked,
      tgtDefFlags: tgt.flags.exposed > 0,
      exposedBonus: exposedBonus,
      prevents: prevents,
      round: B.round,
    });

    if (dmg > 0) {
      logMsg(
        B,
        'damage',
        src.name + ' hits ' + tgt.name + ' for ' + dmg + (crit ? ' (CRIT)' : '') + '.',
        {
          uid: tgt.uid,
          src: src.uid,
          amount: dmg,
          crit: crit,
          element: element,
          hpAfter: tgt.hp,
          shieldAfter: tgt.shield,
          maxHp: tgt.maxHp,
        }
      );
    } else {
      logMsg(B, 'shield', tgt.name + ' takes no damage.', {
        uid: tgt.uid,
        hpAfter: tgt.hp,
        shieldAfter: tgt.shield,
        maxHp: tgt.maxHp,
      });
    }

    // Ares: gains ATK when attacking, and burns Marked victims
    var sp = passiveOf(src);
    if (sp && hasTrig(sp, 'selfAttacked')) {
      emit(B, {
        t: 'proc',
        owner: src.uid,
        ability: src.card.ability.name,
        trigger: 'selfAttacked',
        round: B.round,
      });
      applyEffects(B, src, [src], sp.effects, { trigger: 'selfAttacked', immediate: true });
    }

    /* On-hit riders fire for ANY passive that declares them - Red Riding
       Hood's lifesteal vs debuffed prey must not require a selfAttacked
       stacking trigger. They read pre-hit flags: `wasMarked` (the Mark is
       already consumed by this very blow) and `wasDebuffed`. `lastDamage`
       is the full blow (HP + shield soak) so lifesteal can feed on it. */
    /* `noRiders` marks this hit as itself the product of a rider: a rider's
       damage must NOT fire further riders. Since basics stopped consuming
       Marks, Ares's Bloodlust bonus hit landed on a still-Marked target,
       re-qualified for its own rider, and looped into an unbounded damage
       chain (stack overflow). One rider per hit, always. */
    if (sp && sp.onHit && tgt.alive && !noRiders) {
      sp.onHit.forEach(function (e) {
        if (e.ifTargetMarked && !wasMarked) return;
        if (e.ifTargetDebuffed && !wasDebuffed) return;
        applyEffect(B, src, [tgt], e, { lastDamage: dmg + absorbed, rider: true });
      });
    }

    // Red Riding Hood: an ally hitting a debuffed enemy feeds her Crit
    fireAllyStruckDebuffed(B, src, tgt);

    // Lancelot: an ally striking an Exposed enemy sharpens him further
    if (tgt.flags.exposed > 0) fireAllyStruckExposed(B, src, tgt);

    /* Provoke recovery resolved before this blow at the top of
       dealDamage; it must never resurrect a target from a lethal hit. */

    /* Will Scarlet: attacking the same target again and again builds
       stacks; switching targets wipes them. Tracked on the attacker. */
    var wp = passiveOf(src);
    if (wp && hasTrig(wp, 'sameTargetStreak')) {
      if (src.streakUid !== tgt.uid) {
        // new victim: the oldest stack decays away (not the whole pile)
        var si = src.buffs.findIndex(function (b) {
          return b.tag === wp.stackTag;
        });
        if (si >= 0) src.buffs.splice(si, 1);
        src.streakUid = tgt.uid;
      } else {
        emit(B, {
          t: 'proc',
          owner: src.uid,
          ability: src.card.ability.name,
          trigger: 'sameTargetStreak',
          round: B.round,
        });
        applyEffects(B, src, [src], wp.effects, { trigger: 'sameTargetStreak', immediate: true });
      }
    }

    // Defender reactions (Medusa): once each round if requested.
    if (tgt.alive) {
      var dp = passiveOf(tgt);
      if (hasTrig(dp, 'wasAttacked') && (!dp.firstPerRound || !tgt.roundFlags.wasAttacked)) {
        if (dp.firstPerRound) tgt.roundFlags.wasAttacked = true;
        emit(B, {
          t: 'proc',
          owner: tgt.uid,
          ability: tgt.card.ability.name,
          trigger: 'wasAttacked',
          round: B.round,
        });
        applyEffects(B, tgt, [src], dp.effects, {
          trigger: 'wasAttacked',
          immediate: true,
          triggerTarget: src,
        });
        logMsg(B, 'passive', tgt.name + ' answers with ' + tgt.card.ability.name + '!', {
          uid: tgt.uid,
        });
      }
    }

    // Lancelot: allies gaining ATK when an ally is damaged
    unitsOf(B, tgt.side).forEach(function (u) {
      if (u.uid === tgt.uid) return;
      var p = passiveOf(u);
      if (p && hasTrig(p, 'allyDamaged')) {
        emit(B, {
          t: 'proc',
          owner: u.uid,
          ability: u.card.ability.name,
          trigger: 'allyDamaged',
          round: B.round,
        });
        applyEffects(B, u, [u], p.effects, {
          trigger: 'allyDamaged',
          immediate: true,
          triggerTarget: tgt,
        });
      }
    });

    // Arthur & Mulan: shield + taunt (or stack up) when an ally drops low
    unitsOf(B, tgt.side).forEach(function (u) {
      var p = passiveOf(u);
      if (!hasTrig(p, 'allyBelowHp')) return;
      if (u.uid === tgt.uid) return;
      if (tgt.hp / tgt.maxHp >= (p.threshold || 0.4)) return;
      // fires at most once per distinct ally, for the whole battle
      if (p.oncePerAlly) {
        u.triggeredBy = u.triggeredBy || {};
        if (u.triggeredBy[tgt.uid]) return;
        u.triggeredBy[tgt.uid] = true;
      } else if (p.oncePerRound) {
        if (u.roundFlags['allyBelowHp']) return;
        u.roundFlags['allyBelowHp'] = true;
      }
      emit(B, {
        t: 'proc',
        owner: u.uid,
        ability: u.card.ability.name,
        trigger: 'allyBelowHp',
        round: B.round,
      });
      applyEffects(B, u, [u], p.effects, {
        trigger: 'allyBelowHp',
        immediate: true,
        triggerTarget: tgt,
      });
      logMsg(B, 'passive', u.name + ' answers the call - ' + u.card.ability.name + '!', {
        uid: u.uid,
      });
    });

    /* Guan Yu: an enemy attacking him while Shielded eats a counter-strike.
       `noCounter` prevents two counters from chaining into each other. */
    if (!noCounter && tgt.alive && hadShield && tgt.flags.counterTurns > 0 && src.alive) {
      var cPow = (src.flags.marked > 0 ? tgt.flags.counterPowMarked : tgt.flags.counterPow) || 0;
      if (cPow > 0) {
        /* Little John (pass 9): the counter is armed on an ally but struck
           by the caster - resolve whoever counterSrc says should swing. */
        var striker = tgt;
        if (tgt.flags.counterSrc) {
          var su = B.units.find(function (u) {
            return u.uid === tgt.flags.counterSrc && u.alive;
          });
          if (su && su.side === tgt.side) striker = su;
        }
        logMsg(
          B,
          'damage',
          striker.name +
            (striker === tgt
              ? ' counter-strikes '
              : ' guards ' + tgt.name + ' and counter-strikes ') +
            src.name +
            '!',
          { uid: src.uid }
        );
        emit(B, {
          t: 'proc',
          owner: striker.uid,
          ability: striker.card.ability.name,
          trigger: 'counterStrike',
          round: B.round,
        });
        /* Counters are reactions, not signature casts: they damage but
           must not spend the target's Mark on the caster's behalf. */
        dealDamage(B, striker, src, atkOf(striker) * cPow, striker.element, false, true);
      }
    }

    if (tgt.hp <= 0) handleDeath(B, tgt, src.uid);
    return dmg;
  }

  function handleDeath(B, u, killerUid) {
    // Sun Wukong: revive once
    var p = passiveOf(u);
    if (p && hasTrig(p, 'wouldDie') && !u.usedOnce.wouldDie) {
      u.usedOnce.wouldDie = true;
      // logged first so the UI can play the revive before the buffs it grants
      logMsg(B, 'revive', u.name + ' refuses to fall - ' + u.card.ability.name + '!', {
        uid: u.uid,
        ability: u.card.ability.name,
      });
      emit(B, {
        t: 'proc',
        owner: u.uid,
        ability: u.card.ability.name,
        trigger: 'wouldDie',
        round: B.round,
      });
      emit(B, {
        t: 'revive',
        uid: u.uid,
        by: u.uid,
        round: B.round,
        amount: Math.round((u.maxHp * ((p.effects[0] || {}).pctMaxHp || 0)) / 100),
      });
      applyEffects(B, u, [u], p.effects, { trigger: 'wouldDie', immediate: true });
      return;
    }

    u.alive = false;
    u.hp = 0;
    /* Defeat cancels armed reactions. Their ordinary duration counters may
       continue to decay for a possible resurrection, but no expiry heal,
       shield or counter may wait on the corpse and fire later. */
    u.flags.taunt = 0;
    u.flags.tauntHeal = null;
    u.flags.tauntShield = null;
    u.flags.counterTurns = 0;
    u.flags.counterPow = 0;
    u.flags.counterPowMarked = 0;
    delete u.flags.counterSrc;
    /* death order, so `to:'fallenAllies'` can raise the most recent
       casualty first. Monotonic counter rather than round number,
       which would tie for two deaths in the same round. */
    B.deathSeq = (B.deathSeq || 0) + 1;
    u.diedAt = B.deathSeq;
    logMsg(B, 'death', u.name + ' is defeated.', { uid: u.uid });
    emit(B, { t: 'death', uid: u.uid, round: B.round });

    /* The Spirit World: a fallen legend's spirit powers their own side. */
    if (B.field && B.field.deathEnergy) {
      addEnergy(B, u.side, B.field.deathEnergy);
      logMsg(B, 'energy', u.name + "'s spirit empowers their allies.", {
        uid: u.uid,
        amount: B.field.deathEnergy,
      });
      emit(B, {
        t: 'energy',
        side: u.side,
        uid: u.uid,
        amount: B.field.deathEnergy,
        kind: 'field',
        round: B.round,
      });
    }

    /* Lu Bu: the killer's OWN passive cares that THEY landed the kill.
       killerUid is supplied by the damage path (ability or Burn). The
       effect must fire for the killer unit itself, never a teammate -
       the card says "when Lu Bu defeats an enemy", and the team-wide
       loop used to proc his refund on a support's kill too. */
    if (killerUid) {
      var killer = B.units.filter(function (x) {
        return x.uid === killerUid;
      })[0];
      if (killer && killer.side !== u.side) {
        var kp = passiveOf(killer);
        if (hasTrig(kp, 'selfKilled')) {
          var kse = (kp.effects || []).filter(function (x) {
            return x.k !== 'outgoingMult';
          });
          if (kse.length) {
            emit(B, {
              t: 'proc',
              owner: killer.uid,
              ability: killer.card.ability.name,
              trigger: 'selfKilled',
              round: B.round,
            });
            applyEffects(B, killer, [killer], kse, {
              trigger: 'selfKilled',
              immediate: true,
              triggerTarget: u,
            });
            logMsg(
              B,
              'passive',
              killer.name + ' presses the rout - ' + killer.card.ability.name + '!',
              {
                uid: killer.uid,
              }
            );
          }
        }
        /* Augustus (teamKilled): the card says "every time your TEAM defeats
           an enemy", so ANY kill credited to this side fires it - for every
           teamKilled holder on that side, not just the killer. (selfKilled
           above is the opposite semantics: the killer's own scalp only.) */
        unitsOf(B, killer.side).forEach(function (tm) {
          var tp = passiveOf(tm);
          if (!hasTrig(tp, 'teamKilled')) return;
          emit(B, {
            t: 'proc',
            owner: tm.uid,
            ability: tm.card.ability.name,
            trigger: 'teamKilled',
            round: B.round,
          });
          applyEffects(B, tm, [tm], tp.effects, {
            trigger: 'teamKilled',
            immediate: true,
            triggerTarget: u,
          });
          logMsg(B, 'passive', tm.name + ' spreads the peace - ' + tm.card.ability.name + '!', {
            uid: tm.uid,
          });
        });
      }
    }

    // Mulan: gains stats when an ally dies
    unitsOf(B, u.side).forEach(function (a) {
      var ap = passiveOf(a);
      if (ap && hasTrig(ap, 'allyDied')) {
        emit(B, {
          t: 'proc',
          owner: a.uid,
          ability: a.card.ability.name,
          trigger: 'allyDied',
          round: B.round,
        });
        applyEffects(B, a, [a], ap.effects, { trigger: 'allyDied', immediate: true });
        logMsg(B, 'passive', a.name + "'s resolve hardens.", { uid: a.uid });
      }
    });

    checkEnd(B);
  }

  /* No legend may carry more Shield than 100% of their Max HP. Return the
     amount that actually fit so combat text, events and the report never
     claim shield that was discarded by the cap. */
  function addShieldCapped(tgt, amount) {
    var cap = Math.max(0, Math.round(tgt.maxHp));
    tgt.shield = Math.max(0, Math.min(cap, Math.round(tgt.shield || 0)));
    var gain = Math.max(0, Math.min(Math.round(amount || 0), cap - tgt.shield));
    tgt.shield += gain;
    return gain;
  }

  function healUnit(B, src, tgt, amount, opts) {
    if (!tgt.alive) return 0;
    var mod = healDecay(B.round);
    if (tgt.flags.healMod) mod += tgt.flags.healMod / 100;
    var amt = Math.max(0, Math.round(amount * mod));
    var before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
    var real = tgt.hp - before;
    if (real > 0) {
      tallyOf(B, src.uid).healed += real;
      logMsg(B, 'heal', src.name + ' heals ' + tgt.name + ' for ' + real + '.', {
        uid: tgt.uid,
        amount: real,
      });
      emit(B, { t: 'heal', src: src.uid, tgt: tgt.uid, amount: real, round: B.round });
    }
    /* Overheal rider (Restore): whatever the heal cannot restore becomes a
       Shield instead - burst insurance rather than wasted healing. */
    var overflow = amt - real;
    if (opts && opts.overflowShield && overflow > 0) {
      overflow = addShieldCapped(tgt, overflow);
      if (overflow > 0) {
        tgt.shieldSrc = src.uid; // granter credited for absorbs
        logMsg(B, 'shield', tgt.name + "'s overflow hardens into a " + overflow + ' shield.', {
          uid: tgt.uid,
          status: 'shield',
          amount: overflow,
        });
        emit(B, {
          t: 'shield',
          src: src.uid,
          tgt: tgt.uid,
          amount: overflow,
          signature: !!opts.signature,
          overflow: true,
          round: B.round,
        });
        fireAllyWarded(B, tgt);
      }
    }
    return real;
  }

  /* When a cleanse zeroes a debuff value, its paired bookkeeping must go
     too - otherwise extendDebuffs "extends" a dead timer (healModTurns
     ticking into a 0% healMod, a ghost affliction that logs "afflictions
     linger" on a clean legend). Burn's source credit and Mark's timed
     variants follow the value they belong to. */
  function scrubDeadTimer(t, key) {
    if (key === 'burn') t.flags.burnSrc = null;
    if (key === 'healMod') t.flags.healModTurns = 0;
    if (key === 'marked') t.flags.markedTurns = 0;
  }

  /* ---------------------------------------------------------
     EFFECT INTERPRETER
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     TIMING
     turn  = one side acting
     round = both sides having acted

     Every effect declares when it lands via `when`:
       'now'   applies immediately
       'next'  applies at the start of the caster's next turn
       'turn'  applies at the end of the acting side's turn (legacy)
       'round' applies at the end of the round (after both sides)

     Defaults, if an effect doesn't say: anything landing on the caster
     or an ally is immediate; anything landing on an enemy waits for the
     end of that side's turn. Damage/healing always resolve instantly.

     Durations in `turns` are counted in ROUNDS - the golden rule is that
     an effect lasts 1 round unless it says otherwise.
     --------------------------------------------------------- */
  var TIMED_KINDS = {
    stat: 1,
    taunt: 1,
    untargetable: 1,
    silence: 1,
    healMod: 1,
    costMod: 1,
    shield: 1,
  };

  function timingOf(e, src, targets) {
    if (e.when) return e.when; // explicit wins
    return 'now'; // everything else is immediate
  }

  function applyEffects(B, src, targets, effects, ctx) {
    /* A queued rider or multi-part cast stops with its caster. Damage had
       its own mid-cast guard, but heals, shields and stat effects did not,
       allowing the remainder of an action to resolve from the grave. */
    if (!src || !src.alive) return;
    ctx = ctx || {};
    (effects || []).forEach(function (e) {
      /* A counter can defeat the caster during an earlier damage effect
         in this very list; re-check between every component. */
      if (!src.alive) return;
      /* Per-trigger routing. A passive declaring `triggers: [...]` fires its
         whole effects list on ANY of them; an effect may add `on: 'name'`
         (or an array) to respond to only some. Effects without `on` are
         unaffected, so every pre-existing card behaves exactly as before. */
      if (e.on && ctx.trigger) {
        var onList = Array.isArray(e.on) ? e.on : [e.on];
        if (onList.indexOf(ctx.trigger) < 0) return;
      }
      var when = ctx.immediate ? 'now' : timingOf(e, src, targets);
      if (when === 'now' || B.resolvingDeferred) {
        applyEffect(B, src, targets, e, ctx);
        return;
      }
      if (when === 'next') {
        // queued during your turn; must skip the current turn boundary
        B.deferred.push({
          phase: 'next',
          armAt: B.turnId,
          srcUid: src.uid,
          targetUids: (targets || []).map(function (t) {
            return t.uid;
          }),
          effect: e,
          ctx: {
            scale: ctx.scale,
            preHp: ctx.preHp,
            preDamaged: ctx.preDamaged,
            killedSomething: ctx.killedSomething,
            signature: ctx.signature,
          },
          side: src.side,
        });
        return;
      }
      B.deferred.push({
        phase: when, // 'turn' | 'round'
        srcUid: src.uid,
        targetUids: (targets || []).map(function (t) {
          return t.uid;
        }),
        effect: e,
        ctx: {
          scale: ctx.scale,
          preHp: ctx.preHp,
          preDamaged: ctx.preDamaged,
          killedSomething: ctx.killedSomething,
          signature: ctx.signature,
        },
        side: src.side,
      });
    });
  }

  /* Flush queued effects. `phase` is 'turn' (only the given side's) or
     'round' (everything still waiting). */
  function resolveDeferred(B, side, phase) {
    if (!B.deferred.length) return 0;
    phase = phase || 'turn';
    var take = function (d) {
      if (phase === 'round') return d.phase === 'round';
      if (d.phase !== phase || d.side !== side) return false;
      // a 'next' effect can't fire on the turn boundary it was created in
      if (phase === 'next' && d.armAt != null && B.turnId <= d.armAt) return false;
      return true;
    };
    var mine = B.deferred.filter(take);
    B.deferred = B.deferred.filter(function (d) {
      return !take(d);
    });
    if (!mine.length) return 0;

    B.resolvingDeferred = true;
    mine.forEach(function (d) {
      var src = B.units.filter(function (u) {
        return u.uid === d.srcUid;
      })[0];
      /* A dead caster's queued effects do not resolve. Without this a legend
         killed before their delayed payoff landed still dealt full damage
         from the grave, which removed the counterplay that makes telegraphed
         effects fair. (No shipped card used `when:'next'`, so this had never
         surfaced.) */
      if (!src || !src.alive) return;
      var targets = d.targetUids
        .map(function (id) {
          return B.units.filter(function (u) {
            return u.uid === id;
          })[0];
        })
        .filter(function (u) {
          return u && u.alive;
        });
      applyEffect(B, src, targets, d.effect, d.ctx || {});
    });
    B.resolvingDeferred = false;
    return mine.length;
  }

  /* `maxStacks` is a LIFETIME cap, not a concurrent one.
     -------------------------------------------------------------
     It used to count the buffs a legend currently held. With a 2-round
     buff that is barely a cap at all: each stack expires and frees
     its slot, so a passive that triggers often just keeps re-earning
     them. Red Riding Hood's "Max: 4 stacks" produced a 13,000 shield
     in a real game, because the trigger fires on every ally attack
     against a debuffed enemy and nothing ever actually stopped.

     `stackTotals` counts every stack ever granted for that tag, so
     the note on the card is the truth for the whole battle. */
  function stacksUsed(u, tag) {
    return (u.stackTotals && u.stackTotals[tag]) || 0;
  }
  function addBuff(B, u, stat, amt, turns, tag, maxStacks, refresh) {
    /* REFRESH replaces rather than adds.
       Some riders are worded "gain X for N rounds" - one buff, kept
       topped up while a condition holds. Without this they were just
       re-applied on every trigger and silently stacked: Lancelot's
       "10% DEF for 2 rounds" reached +72% DEF. A refreshing buff
       resets its own timer and never multiplies. */
    if (tag && refresh) {
      for (var i = 0; i < u.buffs.length; i++) {
        if (u.buffs[i].tag === tag) {
          u.buffs[i].amt = amt;
          u.buffs[i].turns = turns;
          return true;
        }
      }
    }
    if (tag && maxStacks) {
      if (stacksUsed(u, tag) >= maxStacks) return false;
    }
    if (tag) {
      u.stackTotals = u.stackTotals || {};
      u.stackTotals[tag] = stacksUsed(u, tag) + 1;
    }
    u.buffs.push({ stat: stat, amt: amt, turns: turns, tag: tag || null });
    return true;
  }

  function applyEffect(B, src, targets, e, ctx) {
    /* stack-count gate (Lancelot's DEF rider): only applies once the
       given stackTag has reached the minimum stack count */
    if (e.ifStacks) {
      var stacks = src.buffs.filter(function (b) {
        return b.tag === e.ifStacks.tag;
      }).length;
      if (stacks < e.ifStacks.min) return;
    }
    var list = targets || [];
    ctx = ctx || {};
    ctx.self = src; // so `selfShielded` conditions can read the caster
    if (e.onlyMarked) {
      list = list.filter(function (t) {
        return t.flags.marked > 0;
      });
      if (!list.length) return;
    }

    /* Adjacent-enemy spread (Mordred): `if` conditions read the ORIGINAL
       targets, then the effect lands on enemies neighbouring their slots.
       Recursed once with the condition/to fields stripped. */
    if (e.to === 'adjacentTargets') {
      var adj = [];
      (list || []).forEach(function (t) {
        if (e.if && !condMet(B, e.if, condCtx(ctx, t))) return;
        unitsOf(B, t.side).forEach(function (u) {
          if (Math.abs(u.slot - t.slot) === 1 && adj.indexOf(u) < 0) adj.push(u);
        });
      });
      var e2 = {};
      Object.keys(e).forEach(function (k) {
        if (k !== 'if' && k !== 'to') e2[k] = e[k];
      });
      applyEffect(B, src, adj, e2, ctx);
      return;
    }
    /* Enemies standing in the same ROW as each incoming target (front
       row <-> front row, back row <-> back row; the target itself is
       included). Mordred's Treasonous Strike spreads Exposed down the
       line this way (2026-08-05, replacing the old adjacency rule). */
    if (e.to === 'targetRowEnemies') {
      var rowMates = [];
      (list || []).forEach(function (t) {
        if (e.if && !condMet(B, e.if, condCtx(ctx, t))) return;
        unitsOf(B, t.side).forEach(function (u) {
          if (isFront(u) === isFront(t) && rowMates.indexOf(u) < 0) rowMates.push(u);
        });
      });
      var e2r = {};
      Object.keys(e).forEach(function (k) {
        if (k !== 'if' && k !== 'to') e2r[k] = e[k];
      });
      applyEffect(B, src, rowMates, e2r, ctx);
      return;
    }

    // "to" redirects which units the effect lands on
    if (e.to === 'self') list = [src];
    else if (e.to === 'allies') list = unitsOf(B, src.side);
    else if (e.to === 'frontAllies') list = unitsOf(B, src.side).filter(isFront);
    else if (e.to === 'lowestHpAlly') {
      list = sortUnits(unitsOf(B, src.side), function (a, b) {
        return a.hp / a.maxHp - b.hp / b.maxHp;
      }).slice(0, 1);
    }
    /* every living ally EXCEPT the ability's own targets (Restore triage) */
    else if (e.to === 'otherAllies')
      list = unitsOf(B, src.side).filter(function (u) {
        return targets.indexOf(u) < 0;
      });
    else if (e.to === 'enemies') list = unitsOf(B, opposite(src.side));
    /* Fallen allies - the only redirect that deliberately looks at DEAD
       units, so a revive has something to target. `unitsOf` filters
       corpses out everywhere else, which is why resurrection needs its
       own selector. Most recently fallen first, so "raise the last legend
       you lost" is the natural reading. Generic: any future card that
       wants to interact with the dead uses this. */
    else if (e.to === 'fallenAllies' || e.to === 'lastFallenAlly') {
      list = sortUnits(
        B.units.filter(function (u) {
          return u.side === src.side && !u.alive;
        }),
        function (a, b) {
          return (b.diedAt || 0) - (a.diedAt || 0);
        }
      );
      // 'lastFallenAlly' is the single most recent casualty
      if (e.to === 'lastFallenAlly') list = list.slice(0, 1);
    } else if (e.to === 'triggerTarget') list = ctx.triggerTarget ? [ctx.triggerTarget] : [];
    /* 'targets' (or no redirect): KEEP the incoming list as filtered
       above - re-assigning `targets` here used to stomp onlyMarked
       (Zeus's Divine Judgment then-hit literally everyone). */
    else list = list;

    /* A target that fell earlier in this same multi-part action is no
       longer eligible for healing, shields, buffs, control or riders.
       Resurrection is the sole intentional interaction with a corpse and
       receives the dedicated fallenAllies selector above. */
    /* Kept so an effect whose recipient is the CASTER can still read the
       target it was conditioned on after that target has died - lifesteal
       is the case that matters (see below). */
    var rawTargets = (list || []).slice();
    if (e.k !== 'revive') {
      list = (list || []).filter(function (u) {
        return u && u.alive;
      });
    }

    /* UNTARGETABLE IS ABSOLUTE (2026-08-01).
       `legalTargets` filters untargetable enemies out of an ability's own
       target picker, but a `to:` REDIRECT bypassed that picker entirely -
       so Apollo's "Mark the highest ATK enemy" rider happily marked a legend
       who could not legally be targeted, and any future to:'enemies' rider
       had the same hole. Enforce the rule once, here, for every redirect
       that lands on the opposing side. Provoke is deliberately NOT checked:
       a Provoke only redirects single-target ATTACKS, and these riders are
       neither single-target picks nor attacks. */
    if (list && list.length) {
      var oppSide = opposite(src.side);
      list = list.filter(function (u) {
        return !(u.side === oppSide && u.flags.untargetable > 0);
      });
    }

    /* Row filters - used by the Ancient Ruins relic pool so a single buff
       can hit only the front or only the back line. */
    if (e.frontOnly) list = list.filter(isFront);
    if (e.backOnly) {
      list = list.filter(function (u) {
        return !isFront(u);
      });
    }

    /* Optional `take` limit: of the resolved targets, only the top N by a
       given ordering actually receive the effect (Qin Shi Huang, Apollo). */
    if (e.take && list && list.length > e.take.n) {
      var tk = list.slice();
      if (e.take.by === 'highestAtk') {
        tk = sortUnits(list, function (a, b) {
          return atkOf(b) - atkOf(a);
        });
      } else if (e.take.by === 'lowestHp') {
        tk = sortUnits(list, function (a, b) {
          return a.hp - b.hp;
        });
      } else if (e.take.by === 'highestHp') {
        tk = sortUnits(list, function (a, b) {
          return b.hp - a.hp;
        });
      }
      list = tk.slice(0, e.take.n);
    }

    switch (e.k) {
      case 'dmg': {
        list.forEach(function (t) {
          /* A caster killed MID-CAST stops dealing damage. A counter-strike
             (Guan Yu, Susanoo) resolves inside dealDamage, so an AoE could
             kill its own caster on hit 1 and still land hits 2..n from a
             corpse. Pre-existing; surfaced by the energy-carryover pass,
             which lets big AoEs be cast far more often. */
          if (!src.alive) return;
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var aliveBefore = t.alive;
          var element = e.element === 'inherit' ? src.element : e.element;
          /* Provoke tax: everyone EXCEPT the provoker takes reduced
             damage from a blow that got around them. Applied per target
             rather than per cast so an AoE prices the provoker (full)
             and the rest of the board (taxed) in the same swing. */
          var provokeM = ctx.provokeTax && !(t.flags.taunt > 0) ? ctx.provokeTax : 1;
          /* FLAT upgrade: +2 points of the printed coefficient per
             level, added BEFORE scale/provoke so a 70% skill that
             reads 76% at max really lands 76% of ATK. */
          var power = (e.power + upAdd(src, ctx)) * (ctx.scale || 1) * provokeM;
          var raw = atkOf(src) * power;
          if (e.ifMult) {
            e.ifMult.forEach(function (m) {
              if (condMet(B, m.when, condCtx(ctx, t))) raw *= m.mult;
            });
          }
          /* Per-stack scaling: the damage conversion that makes stacking
             control worth doing. `perDebuff: 0.4` adds +40% ATK of the base
             power for EVERY debuff on the target (optionally capped). */
          if (e.perDebuff) {
            var dn = debuffCount(t);
            if (e.perDebuffMax != null) dn = Math.min(dn, e.perDebuffMax);
            raw +=
              atkOf(src) * (e.perDebuff + upAdd(src, ctx)) * dn * (ctx.scale || 1) * provokeM;
          }
          if (e.perBuff) {
            var bn = buffCount(t);
            if (e.perBuffMax != null) bn = Math.min(bn, e.perBuffMax);
            raw += atkOf(src) * (e.perBuff + upAdd(src, ctx)) * bn * (ctx.scale || 1) * provokeM;
          }
          /* TORTUGA (Flying Dutchman) - live counterpart of the same
             term in previewDamage. Both sites must stay in step or the
             preview lies about the number the player is about to deal. */
          if (e.perFallenAlly) {
            var fa2 = B.units.filter(function (x) {
              return x.side === src.side && !x.alive;
            }).length;
            if (e.perFallenAllyMax != null) fa2 = Math.min(fa2, e.perFallenAllyMax);
            raw +=
              atkOf(src) * (e.perFallenAlly + upAdd(src, ctx)) * fa2 * (ctx.scale || 1) * provokeM;
          }
          /* Only a SIGNATURE spends a Mark - ctx.signature rides in from
             useAbility (`!ability.basic`). This used to pass a flat true,
             so Basic attacks consumed Marks too: a Zeus mark you were
             meant to detonate with a Skill evaporated on contact with a
             free attack, and the whole mark-combo loop leaked. */
          var shieldBefore = t.shield || 0;
          var dealt = dealDamage(
            B,
            src,
            t,
            raw,
            element,
            ctx.signature === true,
            false,
            ctx.rider === true
          );
          /* THE FULL BLOW, NOT JUST THE HP LOST. dealDamage() returns the
             HP damage only - the shield soak is already subtracted from it.
             Feeding that to lifesteal meant Big Bad Wolf healed off a
             fraction of what he actually hit for, and healed NOTHING at all
             when the blow was fully absorbed, even though "25% of the damage
             dealt" had plainly happened. The passive on-hit rider path
             (Red Riding Hood) already adds the soak back for exactly this
             reason; the active path did not. */
          var soaked = Math.max(0, shieldBefore - (t.shield || 0));
          ctx.lastDamage = (ctx.lastDamage || 0) + dealt + soaked;
          if (e.energyBonus && dealt > 0) {
            addEnergy(B, src.side, e.energyBonus);
            emit(B, {
              t: 'energy',
              side: src.side,
              uid: src.uid,
              amount: e.energyBonus,
              kind: 'bonus',
              round: B.round,
            });
          }
          /* `dealDamage` returns 0 against an already-dead unit, so a unit
             can only be counted once: alive before the blow, dead after. */
          if (!t.alive && aliveBefore) {
            ctx.killedSomething = true;
            ctx.killCount = (ctx.killCount || 0) + 1;
          }
        });
        break;
      }

      case 'heal': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var amt =
            e.pctMaxHp != null
              ? t.maxHp * ((e.pctMaxHp + upPts(src, ctx)) / 100)
              : atkOf(src) * ((e.power || 1) + upAdd(src, ctx));
          /* Cinderella (Glass Slipper): an extra slice of Max HP for
             every debuff this cast has already cleansed from THIS
             target, recorded on ctx by the cleanse case. The two heal
             lines stay separate in the log so the bonus reads as its
             own number. */
          if (e.perCleansed && ctx.cleansed && ctx.cleansed[t.uid])
            amt += t.maxHp * ((e.perCleansed + upPts(src, ctx)) / 100) * ctx.cleansed[t.uid];
          /* JOTUNHEIM (Freyja): a slice of Max HP for every legend that
             has fallen on either side. Same shape as perCleansed, and
             CAPPED by perFallenMax for the same reason maxStacks exists -
             an uncapped per-death scalar becomes a full heal in a long
             game. */
          if (e.perFallen) {
            var fallenN = B.deathSeq || 0;
            if (e.perFallenMax != null) fallenN = Math.min(fallenN, e.perFallenMax);
            amt += t.maxHp * ((e.perFallen + upPts(src, ctx)) / 100) * fallenN;
          }
          healUnit(B, src, t, amt * (ctx.scale || 1), {
            overflowShield: e.overflow === 'shield',
            signature: !!ctx.signature,
          });
        });
        break;
      }

      case 'lifesteal': {
        /* LIFESTEAL HEALS THE CASTER, SO A KILL MUST STILL PAY OUT.
           This used to iterate `list`, the surviving targets. Every other
           effect kind does that correctly - a heal or a buff genuinely has
           nowhere to land once its target has fallen - but lifesteal's
           recipient is `src`, and the target is only a CONDITION on it.
           Since applyEffect() strips the dead from `list` before the
           switch, killing the victim emptied the array and the loop body
           never ran: Big Bad Wolf healed for a hit that did not finish
           anyone and healed nothing at all for the hit that did. Killing
           something is not a reason to be denied the drink.

           `rawTargets` is the pre-filter list, so the condition can still
           read the corpse - handleDeath() leaves `buffs` intact, so
           targetHasDebuff answers the same before and after death.

           Paid ONCE per cast, not once per surviving target. lastDamage is
           already the total across every target of this effect group, so
           looping would have multiplied an AoE's lifesteal by its target
           count; the old loop only avoided that because a single-target
           list happened to have one element. */
        var lsTargets = (rawTargets && rawTargets.length ? rawTargets : list);
        var lsQualifies = !lsTargets.length;
        for (var li = 0; li < lsTargets.length; li++) {
          if (condMet(B, e.if, condCtx(ctx, lsTargets[li]))) {
            lsQualifies = true;
            break;
          }
        }
        if (lsQualifies && ctx.lastDamage) {
          healUnit(B, src, src, ctx.lastDamage * ((e.pct + upPts(src, ctx)) / 100));
        }
        break;
      }

      case 'stat': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          /* A SIGNATURE's own stat swing grows with the card's level -
             flat points, toward stronger. Hercules's +20% ATK reads
             +26% at max, and Morgan's -30% ATK debuff deepens to -36%.
             Without this, fourteen legends whose whole skill IS a stat
             swing gained nothing at all from an upgrade. */
          var amt = upToward(e.amt, upPts(src, ctx)) * (ctx.scale || 1);
          var ok = addBuff(
            B,
            t,
            e.stat,
            Math.round(amt),
            e.turns,
            e.stackTag,
            e.maxStacks,
            e.refresh
          );
          if (ok) {
            logMsg(
              B,
              amt >= 0 ? 'buff' : 'debuff',
              t.name +
                ' ' +
                (amt >= 0 ? '+' : '') +
                Math.round(amt) +
                '% ' +
                e.stat.toUpperCase() +
                '.',
              { uid: t.uid, stat: e.stat, amt: Math.round(amt), signature: !!ctx.signature }
            );
            emit(B, {
              t: 'stat',
              stat: e.stat,
              amt: Math.round(amt),
              turns: e.turns,
              src: src.uid,
              tgt: t.uid,
              signature: !!ctx.signature,
              round: B.round,
            });
          }
        });
        break;
      }

      case 'shield': {
        list.forEach(function (t) {
          /* Shields used to ignore `if` entirely, so Momotaro's
             energy-gated shield was silently unconditional. Conditions on a
             shield now resolve like every other effect (Constantine's
             kill-rider depends on it). */
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          /* A shield inside a CAPPED passive obeys the same cap.
             Red Riding Hood's shield carried no stackTag at all, so
             while her ATK and Crit stopped at 4 stacks the shield kept
             growing every single trigger - the 13,000-shield bug. A
             shield that shares its passive's tag now stops when that
             tag is spent. */
          if (e.stackTag && e.maxStacks) {
            if (stacksUsed(t, e.stackTag) >= e.maxStacks) return;
            t.stackTotals = t.stackTotals || {};
            t.stackTotals[e.stackTag] = stacksUsed(t, e.stackTag) + 1;
          }
          var amt = addShieldCapped(
            t,
            t.maxHp * ((e.pctMaxHp + upPts(src, ctx)) / 100) * (ctx.scale || 1)
          );
          if (amt <= 0) return;
          t.shieldSrc = src.uid; // last granter is credited for absorbs
          logMsg(B, 'shield', t.name + ' gains a ' + amt + ' shield.', {
            uid: t.uid,
            status: 'shield',
            amount: amt,
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'shield',
            src: src.uid,
            tgt: t.uid,
            amount: amt,
            signature: !!ctx.signature,
            round: B.round,
          });
          fireAllyWarded(B, t);
        });
        break;
      }

      case 'taunt':
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          // taunt always runs to the end of your next turn, minimum
          t.flags.taunt = Math.max(e.turns || 1, 1);
          /* Both riders bake in the caster's level at ARM time - they
             pay out later, with no cast context left to read. */
          // Hercules: queue a shield for when the taunt drops
          if (e.shieldOnEnd) {
            t.flags.tauntShield = e.shieldOnEnd + upPts(src, ctx);
          }
          // Hansel & Gretel: heal each time they're struck while provoking
          if (e.healOnHit) {
            t.flags.tauntHeal = e.healOnHit + upPts(src, ctx);
          }
          logMsg(B, 'buff', t.name + ' taunts the enemy.', {
            uid: t.uid,
            status: 'taunt',
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'taunt',
            src: src.uid,
            tgt: t.uid,
            turns: t.flags.taunt,
            signature: !!ctx.signature,
            round: B.round,
          });
          fireAllyWarded(B, t);
        });
        break;

      case 'untargetable':
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          /* refresh rule, same as Burn/Exposed: the LONGER remaining
             duration wins, a fresh 1-turn must not shorten a 2-turn */
          t.flags.untargetable = Math.max(t.flags.untargetable || 0, e.turns);
          logMsg(B, 'buff', t.name + ' cannot be targeted.', {
            uid: t.uid,
            status: 'untargetable',
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'untargetable',
            src: src.uid,
            tgt: t.uid,
            turns: e.turns,
            signature: !!ctx.signature,
            round: B.round,
          });
        });
        break;

      /* Timed damage reduction as a castable buff. Generic: any future
         protective card uses this rather than a bespoke passive. Read by
         dealDamage via `flags.resistPct`; capped at 90% so nothing can be
         made outright immune. */
      case 'damageResist':
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          /* a passive-style declarative entry (mult/firstPerRound) is read
             straight out of the passive by incomingMult - only the timed
             `pct` form is a castable flag. */
          if (e.pct == null) return;
          t.flags.resistPct = Math.max(t.flags.resistPct || 0, e.pct);
          t.flags.resistPctTurns = e.turns;
          logMsg(B, 'buff', t.name + ' is warded against harm.', {
            uid: t.uid,
            status: 'resist',
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'resist',
            src: src.uid,
            tgt: t.uid,
            turns: e.turns,
            signature: !!ctx.signature,
            round: B.round,
          });
        });
        break;

      case 'silence':
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          /* refresh rule, same as Burn/Exposed: longer remaining wins */
          t.flags.silence = Math.max(t.flags.silence || 0, e.turns);
          logMsg(B, 'debuff', t.name + ' is silenced.', {
            uid: t.uid,
            status: 'silence',
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'silence',
            src: src.uid,
            tgt: t.uid,
            turns: e.turns,
            signature: !!ctx.signature,
            round: B.round,
          });
        });
        break;

      case 'healMod':
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          t.flags.healMod = e.pct;
          t.flags.healModTurns = e.turns;
          logMsg(B, 'debuff', t.name + ' healing reduced.', {
            uid: t.uid,
            status: 'healdown',
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'healMod',
            src: src.uid,
            tgt: t.uid,
            turns: e.turns,
            signature: !!ctx.signature,
            round: B.round,
          });
        });
        break;

      case 'burn': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          // Burn doesn't stack; the longer remaining duration wins
          var turns = e.turns || 2;
          var refreshed = (t.flags.burn || 0) > 0;
          t.flags.burn = Math.max(t.flags.burn || 0, turns);
          t.flags.burnFresh = true;
          // remember who lit it so the kill is credited correctly
          t.flags.burnSrc = src.uid;
          logMsg(B, 'debuff', t.name + ' is set alight.', {
            uid: t.uid,
            status: 'burn',
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'burn',
            src: src.uid,
            tgt: t.uid,
            turns: turns,
            refreshed: refreshed,
            signature: !!ctx.signature,
            round: B.round,
          });
        });
        break;
      }

      case 'exposed': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var turns = e.turns || 1;
          var refreshed = (t.flags.exposed || 0) > 0;
          t.flags.exposed = Math.max(t.flags.exposed || 0, turns);
          logMsg(B, 'debuff', t.name + ' is exposed.', {
            uid: t.uid,
            status: 'exposed',
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'exposed',
            src: src.uid,
            tgt: t.uid,
            turns: turns,
            refreshed: refreshed,
            signature: !!ctx.signature,
            round: B.round,
          });
        });
        break;
      }

      /* Abe no Seimei: push every debuff on the target out by N turns. */
      case 'extendDebuffs': {
        var addT = e.turns || 1;
        var touched = 0;
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var any = false;
          t.buffs.forEach(function (b) {
            if (b.amt < 0) {
              b.turns += addT;
              any = true;
            }
          });
          // Mark is deliberately absent: it has no duration to extend,
          // it persists until an Skill damages the target.
          ['silence', 'burn', 'exposed'].forEach(function (f) {
            if (t.flags[f] > 0) {
              t.flags[f] += addT;
              any = true;
            }
          });
          // a standing Mark still counts as an affliction worth reporting
          if (t.flags.marked > 0) any = true;
          if (t.flags.healModTurns > 0) {
            t.flags.healModTurns += addT;
            any = true;
          }
          (t.costMods || []).forEach(function (m) {
            if ((m.flat || 0) > 0 || (m.pct || 0) > 0) {
              m.turns += addT;
              any = true;
            }
          });
          if (any) {
            touched++;
            logMsg(B, 'debuff', t.name + "'s afflictions linger.", {
              uid: t.uid,
              status: 'marked',
              signature: !!ctx.signature,
            });
          }
        });
        ctx.extendedAny = touched > 0;
        break;
      }

      case 'cleanse': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          // `only` restricts the cleanse to one named debuff (Momotaro: Burn)
          if (e.only) {
            if (t.flags[e.only] > 0) {
              t.flags[e.only] = 0;
              scrubDeadTimer(t, e.only);
              logMsg(B, 'cleanse', t.name + ' is cleansed of ' + e.only + '.', { uid: t.uid });
              emit(B, { t: 'cleanse', src: src.uid, tgt: t.uid, what: [e.only], round: B.round });
            }
            return;
          }
          /* count:'all' scrubs every debuff (Cinderella). The loop is
             work-conserving - it stops the moment nothing is left to
             remove, so the 99 is just an upper bound, never busywork. */
          var n = e.count === 'all' ? 99 : e.count || 1,
            removed = 0,
            removedWhat = [];
          for (var i = 0; i < n; i++) {
            var idx = t.buffs.findIndex(function (b) {
              return b.amt < 0;
            });
            if (idx >= 0) {
              removedWhat.push(
                t.buffs[idx].stat + (t.buffs[idx].tag ? ':' + t.buffs[idx].tag : '')
              );
              t.buffs.splice(idx, 1);
              removed++;
            } else if (t.flags.burn > 0) {
              t.flags.burn = 0;
              scrubDeadTimer(t, 'burn');
              removed++;
              removedWhat.push('burn');
            } else if (t.flags.exposed > 0) {
              t.flags.exposed = 0;
              removed++;
              removedWhat.push('exposed');
            } else if (t.flags.silence > 0) {
              t.flags.silence = 0;
              removed++;
              removedWhat.push('silence');
            } else if (t.flags.healMod) {
              t.flags.healMod = 0;
              scrubDeadTimer(t, 'healMod');
              removed++;
              removedWhat.push('healMod');
            } else if (t.flags.marked > 0) {
              t.flags.marked = 0;
              scrubDeadTimer(t, 'marked');
              removed++;
              removedWhat.push('marked');
            }
          }
          /* Remember how much this cast scrubbed from each target -
             Cinderella's per-debuff heal (perCleansed) reads it later
             in the same cast. */
          if (removed && ctx) {
            ctx.cleansed = ctx.cleansed || {};
            ctx.cleansed[t.uid] = (ctx.cleansed[t.uid] || 0) + removed;
          }
          if (removed) logMsg(B, 'cleanse', t.name + ' is cleansed.', { uid: t.uid });
          if (removed)
            emit(B, { t: 'cleanse', src: src.uid, tgt: t.uid, what: removedWhat, round: B.round });
        });
        break;
      }

      case 'costMod': {
        /* team-wide costMod has no target, so a condition on it is read
           against the ability's own targets (same rule as gainEnergy). */
        if (e.if) {
          var okCM = (targets || []).length
            ? (targets || []).some(function (t) {
                return condMet(B, e.if, condCtx(ctx, t));
              })
            : condMet(B, e.if, condCtx(ctx, null));
          if (!okCM) break;
        }
        if (e.side) {
          // team-wide modifier
          var s = e.side === 'ally' ? src.side : opposite(src.side);
          B.costMods[s].push({
            flat: e.flat || 0,
            pct: e.pct || 0,
            turns: e.turns,
            /* `signaturesOnly: true` prices ONLY Signature Skills - role
               Basics are exempt (Merlin's Prophecy tax, 2026-08-05). */
            signaturesOnly: !!e.signaturesOnly,
          });
          var up = (e.flat || 0) > 0 || (e.pct || 0) > 0;
          logMsg(
            B,
            up ? 'debuff' : 'buff',
            (e.signaturesOnly ? 'Signature costs' : 'Skill costs') +
              ' shifted for ' +
              (s === 'player' ? 'your team' : 'the enemy') +
              '.',
            { side: s, status: up ? 'costup' : 'costdown', signature: !!ctx.signature }
          );
        } else {
          list.forEach(function (t) {
            if (!condMet(B, e.if, condCtx(ctx, t))) return;
            t.costMods = t.costMods || [];
            t.costMods.push({
              flat: e.flat || 0,
              pct: e.pct || 0,
              turns: e.turns,
              signaturesOnly: !!e.signaturesOnly,
            });
          });
        }
        break;
      }

      case 'gainEnergy': {
        // conditions on an energy gain read against the ability's targets
        var okE = true;
        if (e.if) {
          okE = (targets || []).some(function (t) {
            return condMet(B, e.if, condCtx(ctx, t));
          });
        }
        if (okE) {
          addEnergy(B, src.side, e.amt);
          logMsg(B, 'energy', src.name + ' gains ' + e.amt + ' Energy.', {
            uid: src.uid,
            amount: e.amt,
          });
          emit(B, {
            t: 'energy',
            side: src.side,
            uid: src.uid,
            amount: e.amt,
            kind: 'gain',
            round: B.round,
          });
        }
        break;
      }

      case 'stealEnergy': {
        /* pool-level effect: a condition is read against the ability's
           targets, matching the gainEnergy rule. */
        if (e.if) {
          var okENS = (targets || []).length
            ? (targets || []).some(function (t) {
                return condMet(B, e.if, condCtx(ctx, t));
              })
            : condMet(B, e.if, condCtx(ctx, null));
          if (!okENS) break;
        }
        var foe = opposite(src.side);
        var take = Math.min(B.energy[foe], e.amt);
        B.energy[foe] -= take;
        addEnergy(B, src.side, take);
        logMsg(B, 'energy', 'Stole ' + take + ' Energy.', {});
        emit(B, {
          t: 'energy',
          side: src.side,
          uid: src.uid,
          amount: take,
          kind: 'steal',
          round: B.round,
        });
        break;
      }

      /* Zhuge Liang: remove enemy energy, gaining nothing in return. */
      case 'drainEnergy': {
        /* pool-level effect: a condition is read against the ability's
           targets, matching the gainEnergy rule. */
        if (e.if) {
          var okEND = (targets || []).length
            ? (targets || []).some(function (t) {
                return condMet(B, e.if, condCtx(ctx, t));
              })
            : condMet(B, e.if, condCtx(ctx, null));
          if (!okEND) break;
        }
        var foe3 = opposite(src.side);
        var rem = Math.min(B.energy[foe3], e.amt);
        B.energy[foe3] = Math.max(0, B.energy[foe3] - rem);
        logMsg(
          B,
          'energy',
          'Drained ' +
            rem +
            ' Energy from ' +
            (foe3 === 'player' ? 'your team' : 'the enemy') +
            '.',
          {}
        );
        emit(B, {
          t: 'energy',
          side: src.side,
          uid: src.uid,
          amount: rem,
          kind: 'drain',
          round: B.round,
        });
        break;
      }

      case 'loseEnergy': {
        /* pool-level effect: a condition is read against the ability's
           targets, matching the gainEnergy rule. */
        if (e.if) {
          var okENL = (targets || []).length
            ? (targets || []).some(function (t) {
                return condMet(B, e.if, condCtx(ctx, t));
              })
            : condMet(B, e.if, condCtx(ctx, null));
          if (!okENL) break;
        }
        var lost =
          e.setTo != null
            ? Math.max(0, B.energy[src.side] - e.setTo)
            : Math.min(B.energy[src.side], e.amt || 0);
        B.energy[src.side] = e.setTo != null ? e.setTo : B.energy[src.side] - lost;
        emit(B, {
          t: 'energy',
          side: src.side,
          uid: src.uid,
          amount: lost,
          kind: 'lose',
          round: B.round,
        });
        break;
      }
      case 'drainTax': {
        /* pool-level effect: a condition is read against the ability's
           targets, matching the gainEnergy rule. */
        if (e.if) {
          var okENT = (targets || []).length
            ? (targets || []).some(function (t) {
                return condMet(B, e.if, condCtx(ctx, t));
              })
            : condMet(B, e.if, condCtx(ctx, null));
          if (!okENT) break;
        }
        var foe4 = opposite(src.side),
          drained = Math.min(B.energy[foe4], e.amt || 0);
        B.energy[foe4] -= drained;
        if (drained > 0)
          B.costMods[foe4].push({
            flat: (e.costPer10 || 5) * Math.floor(drained / 10),
            turns: e.turns || 1,
          });
        ctx.drainedEnergy = (ctx.drainedEnergy || 0) + drained;
        emit(B, {
          t: 'energy',
          side: src.side,
          uid: src.uid,
          amount: drained,
          kind: 'drainTax',
          round: B.round,
        });
        break;
      }

      /* Counter-strike setup (fired from dealDamage whenever the flagged
         unit is attacked while Shielded). Guan Yu arms himself; Little John
         (pass 9) arms an ALLY but swings back personally - src:'caster'
         records who actually counter-strikes. */
      case 'counterStrike': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          /* Baked in at ARM time from the caster's level: Guan Yu and
             Little John arm the counter, so it is their upgrade that
             pays for it, and the swing itself happens later with no
             cast context to read. */
          var cUp = upAdd(src, ctx);
          t.flags.counterPow = e.power + cUp;
          t.flags.counterPowMarked = (e.markedPower != null ? e.markedPower : e.power) + cUp;
          t.flags.counterTurns = e.turns || 1;
          if (e.src === 'caster') t.flags.counterSrc = src.uid;
          else delete t.flags.counterSrc;
          logMsg(B, 'buff', t.name + ' readies a counter-strike.', {
            uid: t.uid,
            signature: !!ctx.signature,
          });
          emit(B, {
            t: 'statusApply',
            status: 'counterStrike',
            src: src.uid,
            tgt: t.uid,
            turns: t.flags.counterTurns,
            signature: !!ctx.signature,
            round: B.round,
          });
        });
        break;
      }

      case 'swapTargets': {
        if (list.length >= 2) {
          var a = list[0],
            b = list[1];
          var tmp = a.slot;
          a.slot = b.slot;
          b.slot = tmp;
          logMsg(B, 'move', a.name + ' and ' + b.name + ' swap places.', {});
          emit(B, { t: 'swap', src: src.uid, a: a.uid, b: b.uid, round: B.round });
        }
        break;
      }

      case 'revive': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          /* THE LOCKER HOLDS. Davy Jones's condemnation refuses every
             revive in the game - Isis, Medea, Osiris, Sun Wukong's
             death-cheat. Checked here, at the single revive site, so no
             future revive card can accidentally bypass it. */
          if (t.flags && t.flags.noRevive) {
            logMsg(B, 'debuff', t.name + ' cannot return - the Locker holds them.', {
              uid: t.uid,
            });
            return;
          }
          t.alive = true;
          t.hp = Math.round(t.maxHp * ((e.pctMaxHp + upPts(src, ctx)) / 100));
          /* Generic `wipe` rider: a legend who comes back should come back
             CLEAN. Without it a revive inherited whatever killed it -
             Burn kept ticking, Exposed kept DEF at zero, and a stacked
             ATK debuff persisted through death, so "revive with 30% HP"
             could mean reviving straight back into a death sentence.
             Runs BEFORE the rest of the revive's own effects, so shields
             and buffs granted by the same passive survive. */
          if (e.wipe) {
            t.buffs.length = 0;
            t.flags.burn = 0;
            t.flags.exposed = 0;
            t.flags.silence = 0;
            t.flags.marked = 0;
            t.flags.healMod = 0;
            t.flags.taunt = 0;
            t.flags.untargetable = 0;
            t.shield = 0;
            t.shieldSrc = null;
            logMsg(B, 'cleanse', t.name + ' returns cleansed of all effects.', {
              uid: t.uid,
            });
            emit(B, { t: 'cleanse', src: src.uid, tgt: t.uid, what: ['all'], round: B.round });
          }
          /* A revive necessarily un-kills its target, so any FOLLOWING
             effect aimed at `fallenAllies` finds nobody - the legend it
             wanted is alive again. A shield on the returning legend
             therefore has to be part of the revive itself rather than a
             separate effect. Generic `shieldPctMaxHp` rider. */
          if (e.shieldPctMaxHp) {
            var sh = addShieldCapped(
              t,
              t.maxHp * ((e.shieldPctMaxHp + upPts(src, ctx)) / 100) * (ctx.scale || 1)
            );
            if (sh > 0) {
              t.shieldSrc = src.uid;
              logMsg(B, 'shield', t.name + ' returns behind a ' + sh + ' shield.', {
                uid: t.uid,
                status: 'shield',
                amount: sh,
                signature: !!ctx.signature,
              });
              emit(B, {
                t: 'shield',
                src: src.uid,
                tgt: t.uid,
                amount: sh,
                signature: !!ctx.signature,
                round: B.round,
              });
            }
          }
          emit(B, { t: 'revive', uid: t.uid, by: src.uid, round: B.round, amount: t.hp });
        });
        break;
      }

      /* EMPYREAN: Gabriel accelerates every sealed fate on the board,
         Raphael cancels the ones aimed at his ally. Both reach into the
         SAME per-unit `pending` queue that `delayed` writes (Zeus's
         thunderbolt, Abe no Seimei's shikigami, Azrael's hour), so they
         work on any faction's delayed effects rather than only their
         own - the cross-faction hand-off the guidelines ask for.

         Neither is a new mechanic: they are queue maintenance on a
         structure that already exists, already serializes and already
         survives cloneBattle. */
      case 'hastenDelayed': {
        var hastenBy = e.turns || 1;
        var hastened = 0;
        B.units.forEach(function (u) {
          (u.pending || []).forEach(function (p) {
            if (p.turns > 1) {
              p.turns = Math.max(1, p.turns - hastenBy);
              hastened++;
            }
          });
        });
        if (hastened) {
          logMsg(B, 'mark', 'What was sealed draws nearer - ' + hastened + ' fates hasten.', {});
        }
        break;
      }

      case 'cancelDelayed': {
        var cancelled = 0;
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          cancelled += (t.pending || []).length;
          t.pending = [];
        });
        if (cancelled) {
          logMsg(B, 'cleanse', 'A sealed fate is undone.', {});
        }
        break;
      }

      /* TORTUGA (Davy Jones): condemn a legend so that nothing can
         bring them back. Not a new mechanic - the engine already has
         two revive gates (`spiritSpared`, `deathCheated`); this is a
         third, set by an ability instead of by a passive. Stored on the
         unit so it survives serialization and cloneBattle like any
         other flag. */
      case 'noRevive': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          t.flags.noRevive = 1;
          logMsg(B, 'debuff', t.name + ' is claimed by the Locker.', {
            uid: t.uid,
            status: 'norevive',
            signature: !!ctx.signature,
          });
        });
        break;
      }

      case 'delayed': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          t.pending.push({
            turns: e.turns,
            tag: e.tag,
            srcUid: src.uid,
            effects: e.effects,
            scale: ctx.scale || 1,
          });
        });
        /* This used to log "N enemies are marked", which described a
           different mechanic entirely - Marked is a real status that
           the next Skill consumes. A delayed effect is a sealed fate
           with a clock on it, so say that, and name the seal. */
        logMsg(
          B,
          'mark',
          e.tag === 'shikigami'
            ? list.length === 1
              ? 'A shikigami is sealed - it strikes at the end of the round.'
              : list.length + ' legends are sealed with a shikigami.'
            : list.length + ' legends have a fate sealed upon them.',
          {}
        );
        break;
      }

      case 'branch': {
        /* Evaluated by the SHARED branchPasses() so the UI preview and
           the real resolution can never disagree about which arm runs.
           `anyAllyFallen` stays here: it reads the battle rather than
           the target list, and only the resolver needs it. */
        var cond = e.cond || {};
        var pass = branchPasses(B, src, list, cond, ctx);
        if (cond.anyAllyFallen != null) {
          pass =
            B.units.some(function (u) {
              return u.side === src.side && !u.alive;
            }) === !!cond.anyAllyFallen;
        }
        applyEffects(B, src, list, pass ? e.then : e.other || e.else, ctx);
        break;
      }

      case 'mark': {
        /* A Mark normally sits on the target until an Skill damages them
           (see dealDamage) or something explicitly consumes it. Marks have
           no duration - the global rule; the e.turns expiry path stays in
           the engine as an unused escape hatch (no card uses it).
           Re-marking an already-marked target is a no-op. */
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          if (t.flags.marked) return;
          t.flags.marked = 1;
          if (e.turns) t.flags.markedTurns = e.turns;
          logMsg(B, 'mark', t.name + ' is marked.', {
            uid: t.uid,
            status: 'marked',
            signature: true,
          });
          emit(B, {
            t: 'statusApply',
            status: 'marked',
            src: src.uid,
            tgt: t.uid,
            turns: e.turns || null,
            signature: true,
            round: B.round,
          });
        });
        break;
      }

      /* The buff exit valve. Marks work because something CASHES them; buffs
         just ticked away, which is why 23 of 30 in the roster were dead
         riders. `consumeBuffs` spends every positive buff on a unit and pays
         out per stack - the same shape as consumeMark. */
      case 'consumeBuffs': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var n = buffCount(t);
          if (!n) return;
          /* strip the positive stat buffs (statuses are left alone: taunt
             and untargetable are positional, not stockpiled value) */
          t.buffs = t.buffs.filter(function (b) {
            return b.amt <= 0;
          });
          if (e.alsoShield && t.shield > 0) t.shield = 0;
          var payload = e.payload || [];
          emit(B, { t: 'buffsConsumed', tgt: t.uid, count: n, by: src.uid, round: B.round });
          logMsg(B, 'buff', t.name + "'s blessings are spent (" + n + ').', { uid: t.uid });
          /* the payout scales with how many stacks were cashed */
          applyEffects(B, src, [t], payload, {
            immediate: true,
            scale: (ctx.scale || 1) * n,
            signature: !!ctx.signature,
          });
        });
        break;
      }

      case 'consumeMark': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          if (t.flags.marked) {
            emit(B, { t: 'markConsumed', tgt: t.uid, by: src.uid, damage: 0, round: B.round });
          }
          t.flags.marked = 0;
          t.flags.markedTurns = 0;
        });
        break;
      }

      case 'coinFlip': {
        var heads = B.rng() < 0.5;
        var face = heads ? e.heads : e.tails;
        logMsg(B, 'coin', (heads ? 'Heads! ' : 'Tails! ') + face.label + '.', {
          coin: heads ? 'heads' : 'tails',
          uid: src.uid,
        });
        applyEffects(B, src, list, face.effects, ctx);
        break;
      }

      case 'randomOf': {
        list.forEach(function (t) {
          var opt = e.options[Math.floor(B.rng() * e.options.length)];
          applyEffect(B, src, [t], opt, ctx); // already inside resolution
        });
        break;
      }

      case 'copyAllyActive': {
        var allies = unitsOf(B, src.side).filter(function (u) {
          return u.uid !== src.uid && u.card.ability.type === 'Active' && u.card.ability.spec;
        });
        if (!allies.length) {
          logMsg(B, 'info', 'No ally skill to copy.', {});
          break;
        }
        var pickAlly = allies[Math.floor(B.rng() * allies.length)];
        var copied = pickAlly.card.ability;
        logMsg(B, 'info', src.name + ' copies ' + copied.name + '.', { uid: src.uid });
        var sub = copied.spec;
        var subTargets = resolveTargets(B, src, copied, autoPick(B, src, copied));
        var subCtx = {
          /* Kaguya's own level pays for the copy: her whole signature IS
             the copy, so without this she is the one card whose upgrade
             buys nothing. The copied skill's effects then resolve with
             HER level, not the original owner's - `signature` stays
             true and `src` is Kaguya throughout. */
          scale: (ctx.scale || 1) * ((e.scale || 1) + upAdd(src, ctx)),
          killedSomething: ctx.killedSomething,
        };
        var eff = sub.effects || (sub.choose && sub.choose[0].effects) || [];
        if (e.bonusBuffTurns) {
          // deep-ish copy so the ally's own card data isn't mutated
          eff = eff.map(function (x) {
            if (x.k === 'stat' && x.amt > 0 && x.turns && x.turns < 90) {
              var c2 = {};
              Object.keys(x).forEach(function (k) {
                c2[k] = x[k];
              });
              c2.turns = x.turns + e.bonusBuffTurns;
              return c2;
            }
            return x;
          });
        }
        applyEffects(B, src, subTargets, eff, subCtx);
        if (subCtx.killedSomething) ctx.killedSomething = true;
        break;
      }

      default:
        console.warn('[engine] unknown effect', e.k);
    }
  }

  /* pick sensible targets automatically (used by AI + copied skills) */
  function autoPick(B, unit, ability) {
    var n = pickCount(ability);
    if (!n) return [];
    var pool = legalTargets(B, unit, ability);
    if (!pool.length) return [];
    var t = ability.spec.target || {};
    var sorted =
      t.side === 'ally'
        ? sortUnits(pool, function (a, b) {
            return a.hp / a.maxHp - b.hp / b.maxHp;
          })
        : sortUnits(pool, function (a, b) {
            return a.hp - b.hp;
          });
    return sorted.slice(0, n);
  }

  /* ---------------------------------------------------------
     USING AN ABILITY
     --------------------------------------------------------- */
  function useAbility(B, unit, ability, chosen, chooseIndex) {
    if (B.over) return { ok: false, reason: 'battle over' };
    if (!canUse(B, unit, ability)) return { ok: false, reason: 'cannot use' };

    var cost = costOf(B, unit, ability);
    var spec = ability.spec || {};

    var targets = resolveTargets(B, unit, ability, chosen);
    if (pickCount(ability) && targets.length < pickCount(ability)) {
      return { ok: false, reason: 'needs target' };
    }

    B.energy[unit.side] -= cost;
    B.acted[unit.side][unit.uid] = true;
    if (ability.oncePerBattle) unit.usedOnce['ab:' + ability.name] = true;

    logMsg(
      B,
      'action',
      unit.name + ' uses ' + ability.name + (cost ? ' (' + cost + ' EN)' : '') + '.',
      { uid: unit.uid, ability: ability.name, element: unit.element, signature: !ability.basic }
    );

    var ctx0 = {
      turnIdAtStart: B.turnId,
      preHp: {},
      preDamaged: {},
      wasMarked: {},
      signature: !ability.basic,
    };
    /* Snapshot every unit, not only the clicked targets: effects may
       redirect to allies/enemies/rows, and HP conditions on those units
       must still describe cast-start state. */
    B.units.forEach(function (u) {
      ctx0.preHp[u.uid] = u.hp;
    });
    targets.forEach(function (t) {
      ctx0.preDamaged[t.uid] = t.lastDamagedRound === B.round;
      ctx0.wasMarked[t.uid] = t.flags.marked > 0;
    });

    /* PROVOKE TAX. Anything that gets around a live Provoke deals
       reduced damage to every target that is NOT the provoker:
         - a Sniper signature piercing the redirect
         - an area effect splashing past it
       The provoker always takes full damage, so hitting the wall is
       never the worse option. Flagged here, applied per-target in the
       `dmg` case, because an AoE hits the provoker and everyone else
       in the same cast and they must be priced differently.

       `target.noPierceTax` waives it. That is a CARD-level perk
       (Horus), never a faction rule. */
    if (
      isAttack(ability) &&
      provokeLive(B, opposite(unit.side)) &&
      !((ability.spec || {}).target || {}).noPierceTax &&
      (piercesTaunt(unit, ability) || isMultiTarget(ability))
    ) {
      var evades = targets.some(function (t) {
        return !(t.flags.taunt > 0);
      });
      if (evades) {
        ctx0.provokeTax = PROVOKE_TAX;
        logMsg(B, 'info', unit.name + ' strikes around the Provoke (reduced power).', {
          uid: unit.uid,
        });
        emit(B, {
          t: 'provoke-tax',
          uid: unit.uid,
          side: unit.side,
          ability: ability.name,
          mult: PROVOKE_TAX,
          round: B.round,
        });
      }
    }

    var effects = spec.effects;
    if (spec.choose) {
      var idx = chooseIndex != null ? chooseIndex : 0;
      effects = spec.choose[idx].effects;
      logMsg(B, 'info', spec.choose[idx].label + '.', {});
    }

    applyEffects(B, unit, targets, effects, ctx0);
    checkEnd(B);

    if (!ability.basic && !B.over) {
      unitsOf(B, unit.side).forEach(function (w) {
        if (w.uid === unit.uid) return;
        var ap = passiveOf(w);
        if (!hasTrig(ap, 'alliedCastSkill')) return;
        emit(B, {
          t: 'proc',
          owner: w.uid,
          ability: w.card.ability.name,
          trigger: 'alliedCastSkill',
          round: B.round,
        });
        applyEffects(B, w, [w], ap.effects, {
          trigger: 'alliedCastSkill',
          immediate: true,
          triggerTarget: unit,
        });
      });
    }

    /* Athena: an enemy casting a Skill (signature Active) draws her Mark.
       Only kinds meaningful to a trigger fire are applied (her team-wide
       damageMult entries are not castable effects). */
    if (!ability.basic && !B.over) {
      unitsOf(B, opposite(unit.side)).forEach(function (w) {
        var ap = passiveOf(w);
        if (!hasTrig(ap, 'enemyCastSkill')) return;
        var cse = (ap.effects || []).filter(function (x) {
          return x.k !== 'damageMult';
        });
        if (!cse.length) return;
        emit(B, {
          t: 'proc',
          owner: w.uid,
          ability: w.card.ability.name,
          trigger: 'enemyCastSkill',
          round: B.round,
        });
        applyEffects(B, w, [unit], cse, { immediate: true, triggerTarget: unit });
        logMsg(B, 'passive', w.name + ' marks the aggressor - ' + w.card.ability.name + '.', {
          uid: w.uid,
        });
      });
    }

    /* The Mirror Realm: the FIRST Signature Skill for each player each round
       echoes at 50% effectiveness, costs nothing, and cannot echo itself (the guard flag
       stops an infinite reflection). Resolved after the original so the
       board state the copy reads is the post-cast one. */
    var echoUsed =
      typeof B.roundEchoUsed === 'object' && B.roundEchoUsed
        ? B.roundEchoUsed[unit.side]
        : !!B.roundEchoUsed;
    if (
      B.field &&
      (B.field.echoFirstSignature || B.field.echoFirstAbility) &&
      !ability.basic &&
      !echoUsed &&
      !B._echoing &&
      !B.over &&
      unit.alive
    ) {
      if (typeof B.roundEchoUsed === 'object' && B.roundEchoUsed) {
        B.roundEchoUsed[unit.side] = true;
      } else {
        B.roundEchoUsed = true;
      }
      B._echoing = true;
      logMsg(B, 'info', 'The Mirror Realm echoes ' + ability.name + '!', {
        uid: unit.uid,
        signature: true,
      });
      emit(B, {
        t: 'proc',
        owner: unit.uid,
        ability: ability.name,
        trigger: 'mirrorEcho',
        round: B.round,
      });
      var echoTargets = resolveTargets(B, unit, ability, chosen).filter(function (t) {
        return t.alive;
      });
      var echoEffects = spec.choose
        ? spec.choose[chooseIndex != null ? chooseIndex : 0].effects
        : spec.effects;
      applyEffects(B, unit, echoTargets, echoEffects, {
        scale: B.field.echoScale || 0.5,
        signature: true,
        preHp: ctx0.preHp,
        preDamaged: ctx0.preDamaged,
        wasMarked: ctx0.wasMarked,
      });
      B._echoing = false;
      checkEnd(B);
    }

    /* One ability = one action. Control passes to the opponent as soon
       as it resolves. Acting ANSWERS any standing turn-pass on both
       sides: a pass only counts toward ending the round while
       unanswered, so the passer always gets a fresh window later in
       the round. (Sides locked out by `passed` stay locked out.) */
    B.turnPassed.player = false;
    B.turnPassed.enemy = false;
    B.actionNo += 1;
    B.turnId += 1;
    B.lastActor = unit.side;

    return { ok: true };
  }

  /* ---------------------------------------------------------
     TURN / ROUND FLOW
     --------------------------------------------------------- */
  function unitsCanAct(B, side) {
    return unitsOf(B, side).filter(function (u) {
      if (B.acted[side][u.uid]) return false;
      return usableNow(B, u, u.card.ability) || usableNow(B, u, roleAbility(u));
    });
  }

  function roleAbility(u) {
    var base = window.EOL.roleAbilities[u.role];
    // text is templated per-element for Casters
    return {
      type: 'Active',
      name: base.name,
      cost: base.cost,
      basic: true,
      text: base.text.replace('{ELEMENT}', u.element),
      spec: base.spec,
    };
  }

  /* Changing the active side starts a new "turn" for effects that care
     (e.g. Nezha's follow-up on an already-damaged target). */
  /* Burn damage-over-time. Ticks on every TURN a burning legend takes -
     i.e. each time that unit's side is about to act - for a flat share of
     its Max HP, ignoring DEF and shields.

     The duration counts DOWN IN ROUNDS like every other status, so a
     "2 round" Burn keeps ticking on each of the victim's turns until the
     round timer runs out. That makes Burn hurt more the more actions a
     side takes, which is the point of a per-turn DoT. */
  function tickBurn(B, side) {
    unitsOf(B, side).forEach(function (u) {
      if (!(u.flags.burn > 0)) return;
      var dmg = Math.max(1, Math.round(u.maxHp * (BURN_PCT_MAX_HP / 100)));
      var hpBefore = u.hp;
      u.hp = Math.max(0, u.hp - dmg);
      u.lastDamagedRound = B.round;
      /* The Spirit World's reprieve covers burn damage exactly like a
         blow: a lethal tick holds the legend at 1 HP once, and the NEXT
         tick (or any blow) finishes the job. Before this, burn ignored
         the field entirely and killed through the reprieve. */
      if (B.field && B.field.spiritReprieve && u.hp <= 0 && !u.spiritSpared) {
        u.spiritSpared = true;
        u.hp = 1;
        emit(B, { t: 'spirit-spared', uid: u.uid, round: B.round });
        logMsg(B, 'passive', u.name + ' is held at the threshold by the spirits.', {
          uid: u.uid,
        });
      }
      logMsg(B, 'burn', u.name + ' burns for ' + dmg + '.', {
        uid: u.uid,
        amount: dmg,
        element: 'Fire',
        status: 'burn',
        /* The renderer plays this log over the pre-handoff board. Carry
           the post-tick snapshot so the HP bar moves with the flames and
           number instead of waiting for the next action's full render. */
        hpAfter: u.hp,
        shieldAfter: u.shield,
        maxHp: u.maxHp,
      });
      /* the battle report: burn credits its arsonist when known */
      tallyOf(B, u.uid).taken += Math.min(dmg, hpBefore);
      if (u.flags.burnSrc) {
        var burnT = tallyOf(B, u.flags.burnSrc);
        burnT.dealt += Math.min(dmg, hpBefore);
        if (u.hp <= 0) burnT.kills += 1;
      }
      emit(B, {
        t: 'burnTick',
        uid: u.uid,
        src: u.flags.burnSrc || null,
        amount: Math.min(dmg, hpBefore),
        overkill: Math.max(0, dmg - hpBefore),
        killed: u.hp <= 0,
        round: B.round,
      });
      if (u.hp <= 0) handleDeath(B, u, u.flags.burnSrc);
    });
  }

  /* Hand control to `side`. In the alternating-action model this is
     called between individual actions - and that is exactly when Burn
     ticks (see BURN_PCT_MAX_HP): every action hand-off costs the burning
     side a slice of Max HP. Round bookkeeping (durations, energy, ramp)
     still happens only on the round boundary. */
  function setTurn(B, side) {
    if (B.turn !== side) {
      var n = resolveDeferred(B, B.turn, 'turn');
      if (n) logMsg(B, 'buff', 'Pending effects resolve.', {});
      B.turnId += 1;
    }
    B.turn = side;
    var m = resolveDeferred(B, side, 'next');
    if (m) logMsg(B, 'buff', 'Delayed effects take hold.', {});
    // burning legends take their tick as their side is handed the action
    tickBurn(B, side);
    checkEnd(B);
    return B.turn;
  }

  /* ---------------------------------------------------------
     ROUND DRIVER
     --------------------------------------------------------- */

  /* Can `side` legally take any action right now? */
  function canAct(B, side) {
    if (B.over) return false;
    return unitsCanAct(B, side).length > 0;
  }

  /* Record that a side cannot act - it is locked out for the rest of
     the round (auto-pass, sticky). */
  function passSide(B, side) {
    if (B.passed[side]) return false;
    B.passed[side] = true;
    logMsg(B, 'pass', (side === 'player' ? 'You pass' : 'The enemy passes') + '.', {
      side: side,
      kind: 'round',
    });
    return true;
  }

  /* A CHOSEN pass skips only this action (2026-07-30 ruling). The flag
     stands until any action answers it; the round ends when both flags
     stand together, or when neither side can act. */
  function passTurn(B, side) {
    if (B.passed[side]) return false; // already out for the round
    B.turnPassed[side] = true;
    logMsg(B, 'pass', (side === 'player' ? 'You pass' : 'The enemy passes') + '.', {
      side: side,
      kind: 'turn',
    });
    return true;
  }

  /* Whose action is it? Returns 'player' | 'enemy' | null.
     Strict alternation, skipping any side that has passed (round lock or
     unanswered turn-pass).

     `lastActor` is null at the start of a round, so the round's first
     mover is B.first; thereafter it is whoever did NOT just act. */
  function nextActor(B) {
    if (B.over) return null;
    if (roundComplete(B)) return null;
    var prefer = B.lastActor == null ? B.first : opposite(B.lastActor);
    var other = opposite(prefer);
    if (!B.passed[prefer] && !B.turnPassed[prefer] && canAct(B, prefer)) return prefer;
    if (!B.passed[other] && !B.turnPassed[other] && canAct(B, other)) return other;
    return null;
  }

  /* True once neither side can (or will) act again this round: both
     locked out, or a back-to-back pair of chosen passes. */
  function roundComplete(B) {
    if (B.over) return true;
    var pOk = !B.passed.player && !B.turnPassed.player && canAct(B, 'player');
    var eOk = !B.passed.enemy && !B.turnPassed.enemy && canAct(B, 'enemy');
    return !pOk && !eOk;
  }

  /* Advance the clock to whoever acts next, auto-passing any side that
     has run out of legal moves. Returns the side to move, or null when
     the round is over. */
  function advanceAction(B) {
    if (B.over) return null;
    ['player', 'enemy'].forEach(function (sd) {
      if (!B.passed[sd] && !canAct(B, sd)) passSide(B, sd);
    });
    var nxt = nextActor(B);
    if (!nxt) return null;
    setTurn(B, nxt);
    return nxt;
  }

  /* Durations are counted in ROUNDS and tick once, at the rollover.

       1 round  = lasts to the END OF THE CURRENT ROUND, expires as the
                  next round begins
       2 rounds = to the end of the NEXT round
       N rounds = to the end of the (N-1)th round after this one

     There is deliberately no "fresh" grace any more. An effect applied
     mid-round is still spent by that round's rollover, which is what
     "for 1 round" reads as. */
  function tickTimers(B) {
    B.units.forEach(function (u) {
      u.buffs = u.buffs.filter(function (b) {
        b.turns -= 1;
        return b.turns > 0;
      });
      if (u.costMods) {
        u.costMods = u.costMods.filter(function (m) {
          m.turns -= 1;
          return m.turns > 0;
        });
      }
      ['untargetable', 'silence', 'counterTurns'].forEach(function (f) {
        if (u.flags[f] > 0) u.flags[f] -= 1;
        if (f === 'counterTurns' && u.flags[f] <= 0) {
          u.flags.counterPow = 0;
          u.flags.counterPowMarked = 0;
          delete u.flags.counterSrc;
        }
      });
      if (u.flags.taunt > 0) {
        u.flags.taunt -= 1;
        // Hercules: a shield forms as the taunt drops
        if (u.flags.taunt <= 0) u.flags.tauntHeal = null;
        if (u.flags.taunt <= 0 && u.flags.tauntShield) {
          var shieldPct = u.flags.tauntShield;
          /* Expiry riders belong to the living unit that armed them.
             Hercules used to form his end-of-Provoke shield even after
             being defeated because timers tick for every board slot. */
          u.flags.tauntShield = null;
          if (u.alive) {
            var amt = addShieldCapped(u, u.maxHp * (shieldPct / 100));
            if (amt > 0) {
              u.shieldSrc = u.uid;
              logMsg(B, 'shield', u.name + "'s labors end - a " + amt + ' shield forms.', {
                uid: u.uid,
                status: 'shield',
                amount: amt,
                signature: true,
              });
              emit(B, {
                t: 'shield',
                src: u.uid,
                tgt: u.uid,
                amount: amt,
                signature: true,
                round: B.round,
              });
              fireAllyWarded(B, u);
            }
          }
        }
      }
      // Duration-less Marks deliberately do NOT tick: they persist until
      // an Skill damages the target. Marks applied with a duration
      // (markedTurns) expire here like every other status.
      if (u.flags.markedTurns > 0) {
        u.flags.markedTurns -= 1;
        if (u.flags.markedTurns <= 0) {
          u.flags.marked = 0;
          u.flags.markedTurns = 0;
        }
      }
      if (u.flags.exposed > 0) u.flags.exposed -= 1;
      if (u.flags.burn > 0) {
        u.flags.burn -= 1;
        if (u.flags.burn <= 0) {
          u.flags.burn = 0;
          u.flags.burnSrc = null;
        }
      }
      if (u.flags.healModTurns > 0) {
        u.flags.healModTurns -= 1;
        if (u.flags.healModTurns <= 0) u.flags.healMod = 0;
      }
      if (u.flags.resistPctTurns > 0) {
        u.flags.resistPctTurns -= 1;
        if (u.flags.resistPctTurns <= 0) u.flags.resistPct = 0;
      }
    });
    ['player', 'enemy'].forEach(function (side) {
      B.costMods[side] = B.costMods[side].filter(function (m) {
        m.turns -= 1;
        return m.turns > 0;
      });
    });
  }

  function endTurn(B) {
    return setTurn(B, opposite(B.turn));
  }

  function tickDown(list) {
    return list.filter(function (b) {
      b.turns -= 1;
      return b.turns > 0;
    });
  }

  /* advance to the next round: refresh energy, expire buffs, fire delayed effects */
  function nextRound(B) {
    B.round += 1;
    /* Energy CARRIES OVER: add the round grant to what is banked, clamped to
       the cap. Battlefield income modifiers (Mana Spring +20, Energy Void
       -10) apply to the grant, never below zero. */
    var e = energyForRound(B.round) + ((B.field && B.field.energyPerRound) || 0);

    /* COMEBACK GRANT (2026-07-31). First blood decided 68.9% of games
       because losing a legend costs ACTIONS, not just damage: turns strictly
       alternate, so 4 living legends get 4 actions against their 6. The
       trailing side is paid COMEBACK_PER_LEGEND energy per legend of deficit,
       which lets fewer legends cast bigger - it buys back value per action
       rather than handing out extra actions.

       Recomputed from scratch every round, so it shrinks the moment the
       deficit closes and vanishes on a tie. It is never banked as a
       permanent edge. */
    var alive = {
      player: unitsOf(B, 'player').length,
      enemy: unitsOf(B, 'enemy').length,
    };
    ['player', 'enemy'].forEach(function (side) {
      var deficit = Math.max(0, alive[opposite(side)] - alive[side]);
      var bonus = B.noComeback ? 0 : deficit * COMEBACK_PER_LEGEND;
      B.comeback[side] = bonus;
      addEnergy(B, side, Math.max(0, e) + bonus);
      if (bonus > 0) {
        logMsg(
          B,
          'energy',
          (side === 'player' ? 'Your' : 'The enemy') +
            ' outnumbered ranks rally - +' +
            bonus +
            ' Energy.',
          { side: side, amount: bonus }
        );
        emit(B, {
          t: 'energy',
          side: side,
          amount: bonus,
          kind: 'comeback',
          deficit: deficit,
          round: B.round,
        });
      }
    });
    B.acted = { player: {}, enemy: {} };
    B.passed = { player: false, enemy: false };
    B.turnPassed = { player: false, enemy: false };
    B.lastActor = null;
    B.actionNo = 0;
    B.first = firstMover(B.round, B.oddFirst);
    B.turn = B.first;

    B.units.forEach(function (u) {
      u.roundFlags = {};
    });
    B.roundEchoUsed = { player: false, enemy: false }; // Mirror Realm: one signature echo per side per round
    tickTimers(B);

    // end-of-round effects land AFTER this round's durations tick, so they
    // get their full stated lifetime instead of expiring immediately
    var landed = resolveDeferred(B, null, 'round');
    if (landed) logMsg(B, 'buff', 'End-of-round effects resolve.', {});

    /* Resolve delayed effects (Zeus, Abe no Seimei's shikigami).
       ORDER MATTERS: two prophecies landing on the same rollover can
       interact - the first can kill a legend and cancel the second - so
       this sweep must run in the same sequence on both clients. */
    boardOrder(B).forEach(function (u) {
      if (!u.pending.length) return;
      var still = [];
      u.pending.forEach(function (p) {
        p.turns -= 1;
        if (p.turns > 0) {
          still.push(p);
          return;
        }
        var src = B.units.filter(function (x) {
          return x.uid === p.srcUid;
        })[0];
        /* Same rule as resolveDeferred: a dead caster's pending effects do
           not resolve. Abe no Seimei's shikigami was striking from the
           grave, which removed the counterplay of killing the diviner
           before the prophecy lands. */
        if (src && src.alive && u.alive) {
          applyEffects(B, src, [u], p.effects, { scale: p.scale, immediate: true });
        }
      });
      u.pending = still;
    });

    /* The Ancient Ruins: a relic wakes each round. Symmetric - it fires for
       both sides, so it adds texture without handing either player an edge. */
    if (B.field && B.field.roundBuffs && B.field.roundBuffs.length) {
      var pool = B.field.roundBuffs;
      var pick = pool[Math.floor(B.rng() * pool.length)];
      logMsg(B, 'round', 'The ruins stir - ' + pick.label + '.', { status: 'field' });
      emit(B, { t: 'fieldBuff', id: pick.id, label: pick.label, round: B.round });
      boardOrder(B).forEach(function (u) {
        if (!u.alive) return;
        applyEffects(B, u, [u], pick.effects, { immediate: true, fieldBuff: true });
      });
    }

    /* GEHENNA (Greed): the `roundStart` passive trigger. Fires once per
       legend per round rollover, AFTER the round's energy grant so a
       tax lands on the topped-up pool rather than being overwritten by
       it, and after field relics so it cannot be undone by them.

       Deliberately placed inside nextRound rather than in battle.js:
       energy is engine state, and a passive that only fired in the UI
       layer would desync the AI's search and the mirror check. Round 1
       never passes through nextRound, so a roundStart passive correctly
       starts paying from round 2 - the same rule the energy grant
       itself follows. */
    boardOrder(B).forEach(function (u) {
      var rp = passiveOf(u);
      if (!hasTrig(rp, 'roundStart')) return;
      emit(B, {
        t: 'proc',
        owner: u.uid,
        ability: u.card.ability.name,
        trigger: 'roundStart',
        round: B.round,
      });
      applyEffects(B, u, [u], rp.effects, { trigger: 'roundStart', immediate: true });
    });

    logMsg(B, 'round', 'Round ' + B.round + ' - Energy restored to ' + e + '.', {});
    if (B.round === RAMP_FROM) {
      logMsg(B, 'round', 'The tide turns - all legends grow stronger each round.', {});
    }
    checkEnd(B);
    return B.round;
  }

  function checkEnd(B) {
    var p = unitsOf(B, 'player').length;
    var e = unitsOf(B, 'enemy').length;
    if (p === 0 || e === 0) {
      B.over = true;
      B.winner = p === 0 ? 'enemy' : 'player';
    }
    return B.over;
  }

  /* ---------------------------------------------------------
     exports
     --------------------------------------------------------- */
  window.EOL = window.EOL || {};
  window.EOL.engine = {
    ENERGY_BY_ROUND: ENERGY_BY_ROUND,
    energyForRound: energyForRound,
    CRIT_MULT: CRIT_MULT,
    RAMP_FROM: RAMP_FROM,
    RAMP_STEP: RAMP_STEP,
    rampMult: rampMult,
    firstMover: firstMover,
    FIRST_MOVER_BASIC_ROUNDS: FIRST_MOVER_BASIC_ROUNDS,
    signatureBlocked: signatureBlocked,
    healDecay: healDecay,
    frontRowWiped: frontRowWiped,
    createBattle: createBattle,
    scaledRivalStats: scaledRivalStats,
    optimizeFormation: optimizeFormation,
    unitsOf: unitsOf,
    unitAt: unitAt,
    opposite: opposite,
    isFront: isFront,
    atkOf: atkOf,
    defOf: defOf,
    critOf: critOf,
    hasDebuff: hasDebuff,
    debuffCount: debuffCount,
    buffCount: buffCount,
    costOf: costOf,
    canUse: canUse,
    usableNow: usableNow,
    whyCantAct: whyCantAct,
    previewDamage: previewDamage,
    legalTargets: legalTargets,
    pickCount: pickCount,
    resolveTargets: resolveTargets,
    affectedTargets: affectedTargets,
    forcedTarget: forcedTarget,
    autoPick: autoPick,
    useAbility: useAbility,
    roleAbility: roleAbility,
    unitsCanAct: unitsCanAct,
    endTurn: endTurn,
    setTurn: setTurn,
    resolveDeferred: resolveDeferred,
    applyEffectsPublic: applyEffects,
    nextRound: nextRound,
    checkEnd: checkEnd,
    passiveOf: passiveOf,
    canAct: canAct,
    passSide: passSide,
    passTurn: passTurn,
    nextActor: nextActor,
    roundComplete: roundComplete,
    advanceAction: advanceAction,
    cloneBattle: cloneBattle,
    BURN_PCT_MAX_HP: BURN_PCT_MAX_HP,
    COMEBACK_PER_LEGEND: COMEBACK_PER_LEGEND,
    ENERGY_CAP: ENERGY_CAP,
    energyCap: energyCap,
    addEnergy: addEnergy,
    energyForRound: energyForRound,
    tickBurn: tickBurn,
  };
})();
