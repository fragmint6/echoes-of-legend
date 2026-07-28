/* =============================================================
   Echoes of Legend — Combat Engine
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

  var ENERGY_BY_ROUND = [30, 50, 70, 90, 100];

  /* Escalation: from this round on, all damage ramps up each round and
     healing weakens. Without it, two-Medic teams can out-heal incoming
     damage forever and the battle never resolves. */
  var ESCALATE_FROM = 8;
  var ESCALATE_STEP = 0.15;   // +15% damage per round past the threshold
  var HEAL_DECAY_STEP = 0.10; // -10% healing per round past the threshold

  function escalationMult(round) {
    if (round <= ESCALATE_FROM) return 1;
    return 1 + (round - ESCALATE_FROM) * ESCALATE_STEP;
  }
  function healDecay(round) {
    if (round <= ESCALATE_FROM) return 1;
    return Math.max(0.15, 1 - (round - ESCALATE_FROM) * HEAL_DECAY_STEP);
  }

  function energyForRound(r) {
    return ENERGY_BY_ROUND[Math.min(r - 1, ENERGY_BY_ROUND.length - 1)];
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------------------------------------------------------
     Unit
     --------------------------------------------------------- */
  var uid = 0;
  function makeUnit(card, faction, side, slot) {
    return {
      uid: 'u' + (++uid),
      card: card,
      faction: faction,
      side: side,               // 'player' | 'enemy'
      slot: slot,               // 0..5  (0-2 front row, 3-5 back row)
      name: card.name,
      role: card.role,
      element: card.element,
      maxHp: card.stats.hp,
      hp: card.stats.hp,
      baseAtk: card.stats.atk,
      baseDef: card.stats.def,
      shield: 0,
      alive: true,
      buffs: [],                // {stat, amt, turns, tag, kind}
      flags: {},                // taunt / untargetable / silence -> turns
      usedOnce: {},             // once-per-battle passive tracking
      roundFlags: {},           // once-per-round passive tracking
      pending: [],              // delayed effects landing on this unit
      lastDamagedTurn: -1       // turnId in which this unit last took damage
    };
  }

  /* front row = slots 0,1,2  |  back row = slots 3,4,5 */
  function isFront(u) { return u.slot < 3; }

  /* ---------------------------------------------------------
     Derived stats — base + additive percent buffs
     --------------------------------------------------------- */
  function sumBuffs(u, stat) {
    var t = 0;
    u.buffs.forEach(function (b) { if (b.stat === stat) t += b.amt; });
    return t;
  }
  function atkOf(u) {
    return Math.max(1, Math.round(u.baseAtk * (1 + sumBuffs(u, 'atk') / 100)));
  }
  function defOf(u) {
    // DEF is a percentage reduction, capped so damage never hits zero
    return clamp(u.baseDef + sumBuffs(u, 'def'), 0, 85);
  }
  function critOf(u) { return clamp(sumBuffs(u, 'crit'), 0, 100); }

  function hasDebuff(u) {
    return u.buffs.some(function (b) { return b.amt < 0; }) ||
      !!u.flags.silence || !!u.flags.healMod;
  }

  /* ---------------------------------------------------------
     Battle state
     --------------------------------------------------------- */
  function createBattle(playerCards, enemyCards, opts) {
    opts = opts || {};
    var B = {
      round: 1,
      turn: 'player',
      turnId: 0,      // increments every time the active side changes
      units: [],
      energy: { player: energyForRound(1), enemy: energyForRound(1) },
      costMods: { player: [], enemy: [] },  // {flat,pct,turns}
      log: [],
      over: false,
      winner: null,
      acted: { player: {}, enemy: {} },     // uid -> true for this round
      rng: opts.rng || Math.random
    };

    playerCards.forEach(function (e, i) {
      B.units.push(makeUnit(e.card, e.faction, 'player', i));
    });
    enemyCards.forEach(function (e, i) {
      B.units.push(makeUnit(e.card, e.faction, 'enemy', i));
    });

    return B;
  }

  function unitsOf(B, side) {
    return B.units.filter(function (u) { return u.side === side && u.alive; });
  }
  function opposite(side) { return side === 'player' ? 'enemy' : 'player'; }
  function unitAt(B, side, slot) {
    return B.units.filter(function (u) {
      return u.side === side && u.slot === slot && u.alive;
    })[0] || null;
  }

  function logMsg(B, type, text, meta) {
    B.log.push({ round: B.round, type: type, text: text, meta: meta || {} });
  }

  /* ---------------------------------------------------------
     Energy cost, including cost modifiers
     --------------------------------------------------------- */
  function costOf(B, unit, ability) {
    var base = ability.cost || 0;
    if (base === 0) return 0;
    var flat = 0, pct = 0;
    B.costMods[unit.side].forEach(function (m) {
      flat += m.flat || 0;
      pct += m.pct || 0;
    });
    (unit.costMods || []).forEach(function (m) {
      flat += m.flat || 0;
      pct += m.pct || 0;
    });
    return Math.max(0, Math.round((base + flat) * (1 + pct / 100)));
  }

  function canUse(B, unit, ability) {
    if (!unit.alive || ability.type !== 'Active') return false;
    if (B.acted[unit.side][unit.uid]) return false;
    // Silence prevents the hero's signature Active only; Basics still work.
    if (unit.flags.silence > 0 && !ability.basic) return false;
    return B.energy[unit.side] >= costOf(B, unit, ability);
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
      // untargetable enemies are skipped entirely
      pool = pool.filter(function (u) { return !(u.flags.untargetable > 0); });

      // Taunt overrides everything else
      var taunts = pool.filter(function (u) { return u.flags.taunt > 0; });
      if (taunts.length) return taunts;

      // row restriction: role default, overridden by the ability spec
      var row = t.row;
      if (!row) row = (unit.role === 'Tank' || unit.role === 'Bruiser') ? 'front' : 'any';
      if (row === 'front') {
        var front = pool.filter(isFront);
        if (front.length) pool = front;   // back row only once front is cleared
      }
    }
    return pool;
  }

  /* how many targets the player must choose */
  function pickCount(ability) {
    var t = (ability.spec && ability.spec.target) || {};
    if (t.pick === 'two') return 2;
    if (t.pick === 'single') return 1;
    return 0;   // all / auto / self / none
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
        sorted.sort(function (a, b) { return a.hp - b.hp; });
      } else if (t.auto === 'highestAtk') {
        sorted.sort(function (a, b) { return atkOf(b) - atkOf(a); });
      }
      return sorted.slice(0, 1);
    }
    return (chosen || []).slice(0, pickCount(ability));
  }

  /* Robin Hood's passive forces his target selection */
  function forcedTarget(B, unit, ability) {
    var p = unit.card.ability.passive;
    if (!p || p.trigger !== 'static' || !p.forceTarget) return null;
    if (ability.cost > 0 && (ability.spec.target || {}).pick !== 'single') return null;
    var pool = legalTargets(B, unit, ability);
    if (!pool.length) return null;
    var s = pool.slice();
    if (p.forceTarget === 'highestAtk') {
      s.sort(function (a, b) { return atkOf(b) - atkOf(a); });
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
      preDamaged: ctx.preDamaged,
      turnIdAtStart: ctx.turnIdAtStart,
      killedSomething: ctx.killedSomething,
      scale: ctx.scale
    };
  }

  function condMet(B, cond, ctx) {
    if (!cond) return true;
    var tgt = ctx.target;
    if (cond.targetHpBelow != null) {
      if (!tgt || tgt.hp / tgt.maxHp >= cond.targetHpBelow) return false;
    }
    if (cond.targetHpAbove != null) {
      if (!tgt || tgt.hp / tgt.maxHp <= cond.targetHpAbove) return false;
    }
    if (cond.targetBackRow) { if (!tgt || isFront(tgt)) return false; }
    if (cond.targetHasDebuff) { if (!tgt || !hasDebuff(tgt)) return false; }
    if (cond.targetDamagedBefore) {
      // Uses the snapshot taken before this ability began resolving, so a
      // multi-hit ability can't trigger the follow-up off its own first hit.
      if (!tgt || !ctx.preDamaged || !ctx.preDamaged[tgt.uid]) return false;
    }
    if (cond.targetElement) { if (!tgt || tgt.element !== cond.targetElement) return false; }
    if (cond.killedTarget) { if (!ctx.killedSomething) return false; }
    return true;
  }

  /* ---------------------------------------------------------
     Passive helpers
     --------------------------------------------------------- */
  function passiveOf(u) {
    var a = u.card.ability;
    return (a.type === 'Passive' && a.passive) ? a.passive : null;
  }

  /* static outgoing damage multipliers (Robin Hood, Red Riding Hood) */
  function outgoingMult(B, attacker, target) {
    var p = passiveOf(attacker);
    var m = 1;
    if (p && p.trigger === 'static') {
      (p.effects || []).forEach(function (e) {
        if (e.k !== 'outgoingMult') return;
        if (condMet(B, e.when, { target: target })) m *= e.mult;
      });
    }
    return m;
  }

  /* Athena: first enemy Active each round deals 40% less */
  function incomingMult(B, defender, isAbilityDamage) {
    var m = 1;
    if (!isAbilityDamage) return m;
    unitsOf(B, defender.side).forEach(function (u) {
      var p = passiveOf(u);
      if (!p || p.trigger !== 'incomingAbilityDamage') return;
      if (p.firstPerRound && u.roundFlags.athena) return;
      (p.effects || []).forEach(function (e) {
        if (e.k === 'damageMult') m *= e.mult;
      });
      u.roundFlags.athena = true;
      logMsg(B, 'passive', u.name + "'s Divine Strategy weakens the attack.", { uid: u.uid });
    });
    return m;
  }

  /* ---------------------------------------------------------
     Core damage / heal
     --------------------------------------------------------- */
  function dealDamage(B, src, tgt, raw, element, isAbility) {
    if (!tgt.alive) return 0;

    var mult = outgoingMult(B, src, tgt) * incomingMult(B, tgt, isAbility);
    mult *= escalationMult(B.round);
    var afterDef = raw * mult * (1 - defOf(tgt) / 100);

    // crit
    var crit = false;
    if (critOf(src) > 0 && B.rng() * 100 < critOf(src)) {
      crit = true;
      afterDef *= 1.5;
    }

    var dmg = Math.max(1, Math.round(afterDef));

    // shield soaks first
    if (tgt.shield > 0) {
      var absorbed = Math.min(tgt.shield, dmg);
      tgt.shield -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) {
        logMsg(B, 'shield', tgt.name + "'s shield absorbs " + absorbed + '.', { uid: tgt.uid });
      }
    }

    if (dmg > 0) {
      tgt.hp = Math.max(0, tgt.hp - dmg);
      tgt.lastDamagedTurn = B.turnId;
    }

    if (dmg > 0) {
      logMsg(B, 'damage',
        src.name + ' hits ' + tgt.name + ' for ' + dmg + (crit ? ' (CRIT)' : '') + '.',
        { uid: tgt.uid, src: src.uid, amount: dmg, crit: crit, element: element });
    } else {
      logMsg(B, 'shield', tgt.name + ' takes no damage.', { uid: tgt.uid });
    }

    // Ares: gains ATK when attacking
    var sp = passiveOf(src);
    if (sp && sp.trigger === 'selfAttacked') applyEffects(B, src, [src], sp.effects, {});

    // Lancelot: allies gaining ATK when an ally is damaged
    unitsOf(B, tgt.side).forEach(function (u) {
      if (u.uid === tgt.uid) return;
      var p = passiveOf(u);
      if (p && p.trigger === 'allyDamaged') applyEffects(B, u, [u], p.effects, {});
    });

    // Arthur: shield + taunt when an ally drops low
    unitsOf(B, tgt.side).forEach(function (u) {
      var p = passiveOf(u);
      if (!p || p.trigger !== 'allyBelowHp') return;
      if (u.uid === tgt.uid) return;
      if (tgt.hp / tgt.maxHp >= (p.threshold || 0.4)) return;
      if (p.oncePerRound && u.roundFlags['arthur']) return;
      u.roundFlags['arthur'] = true;
      applyEffects(B, u, [u], p.effects, {});
      logMsg(B, 'passive', u.name + ' answers the call — ' + u.card.ability.name + '!', { uid: u.uid });
    });

    if (tgt.hp <= 0) handleDeath(B, tgt);
    return dmg;
  }

  function handleDeath(B, u) {
    // Sun Wukong: revive once
    var p = passiveOf(u);
    if (p && p.trigger === 'wouldDie' && !u.usedOnce.wouldDie) {
      u.usedOnce.wouldDie = true;
      applyEffects(B, u, [u], p.effects, {});
      logMsg(B, 'revive', u.name + ' refuses to fall — ' + u.card.ability.name + '!', { uid: u.uid });
      return;
    }

    u.alive = false;
    u.hp = 0;
    logMsg(B, 'death', u.name + ' is defeated.', { uid: u.uid });

    // Mulan: gains stats when an ally dies
    unitsOf(B, u.side).forEach(function (a) {
      var ap = passiveOf(a);
      if (ap && ap.trigger === 'allyDied') {
        applyEffects(B, a, [a], ap.effects, {});
        logMsg(B, 'passive', a.name + "'s resolve hardens.", { uid: a.uid });
      }
    });

    checkEnd(B);
  }

  function healUnit(B, src, tgt, amount) {
    if (!tgt.alive) return 0;
    var mod = healDecay(B.round);
    if (tgt.flags.healMod) mod += tgt.flags.healMod / 100;
    var amt = Math.max(0, Math.round(amount * mod));
    var before = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt);
    var real = tgt.hp - before;
    if (real > 0) {
      logMsg(B, 'heal', src.name + ' heals ' + tgt.name + ' for ' + real + '.',
        { uid: tgt.uid, amount: real });
    }
    return real;
  }

  /* ---------------------------------------------------------
     EFFECT INTERPRETER
     --------------------------------------------------------- */
  function applyEffects(B, src, targets, effects, ctx) {
    ctx = ctx || {};
    (effects || []).forEach(function (e) {
      applyEffect(B, src, targets, e, ctx);
    });
  }

  function addBuff(B, u, stat, amt, turns, tag, maxStacks) {
    if (tag && maxStacks) {
      var n = u.buffs.filter(function (b) { return b.tag === tag; }).length;
      if (n >= maxStacks) return false;
    }
    u.buffs.push({ stat: stat, amt: amt, turns: turns, tag: tag || null });
    return true;
  }

  function applyEffect(B, src, targets, e, ctx) {
    var list = targets || [];

    // "to" redirects which units the effect lands on
    if (e.to === 'self') list = [src];
    else if (e.to === 'targets' || !e.to) list = targets;

    switch (e.k) {
      case 'dmg': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var element = e.element === 'inherit' ? src.element : e.element;
          var power = e.power * (ctx.scale || 1);
          var raw = atkOf(src) * power;
          if (e.ifMult) {
            e.ifMult.forEach(function (m) {
              if (condMet(B, m.when, condCtx(ctx, t))) raw *= m.mult;
            });
          }
          var dealt = dealDamage(B, src, t, raw, element, true);
          ctx.lastDamage = (ctx.lastDamage || 0) + dealt;
          if (!t.alive) ctx.killedSomething = true;
        });
        break;
      }

      case 'heal': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var amt = e.pctMaxHp != null
            ? t.maxHp * (e.pctMaxHp / 100)
            : atkOf(src) * (e.power || 1);
          healUnit(B, src, t, amt * (ctx.scale || 1));
        });
        break;
      }

      case 'lifesteal': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          if (ctx.lastDamage) healUnit(B, src, src, ctx.lastDamage * (e.pct / 100));
        });
        break;
      }

      case 'stat': {
        list.forEach(function (t) {
          if (!condMet(B, e.if, condCtx(ctx, t))) return;
          var amt = e.amt * (ctx.scale || 1);
          var ok = addBuff(B, t, e.stat, Math.round(amt), e.turns, e.stackTag, e.maxStacks);
          if (ok) {
            logMsg(B, amt >= 0 ? 'buff' : 'debuff',
              t.name + ' ' + (amt >= 0 ? '+' : '') + Math.round(amt) + '% ' + e.stat.toUpperCase() + '.',
              { uid: t.uid });
          }
        });
        break;
      }

      case 'shield': {
        list.forEach(function (t) {
          var amt = Math.round(t.maxHp * (e.pctMaxHp / 100) * (ctx.scale || 1));
          t.shield += amt;
          logMsg(B, 'shield', t.name + ' gains a ' + amt + ' shield.', { uid: t.uid });
        });
        break;
      }

      case 'taunt':
        list.forEach(function (t) { t.flags.taunt = e.turns; });
        break;

      case 'untargetable':
        list.forEach(function (t) { t.flags.untargetable = e.turns; });
        break;

      case 'silence':
        list.forEach(function (t) {
          t.flags.silence = e.turns;
          logMsg(B, 'debuff', t.name + ' is silenced.', { uid: t.uid });
        });
        break;

      case 'healMod':
        list.forEach(function (t) {
          t.flags.healMod = e.pct;
          t.flags.healModTurns = e.turns;
          logMsg(B, 'debuff', t.name + ' healing reduced.', { uid: t.uid });
        });
        break;

      case 'cleanse': {
        list.forEach(function (t) {
          var n = e.count || 1;
          for (var i = 0; i < n; i++) {
            var idx = t.buffs.findIndex(function (b) { return b.amt < 0; });
            if (idx >= 0) t.buffs.splice(idx, 1);
            else if (t.flags.silence) { t.flags.silence = 0; }
            else if (t.flags.healMod) { t.flags.healMod = 0; }
          }
          logMsg(B, 'buff', t.name + ' is cleansed.', { uid: t.uid });
        });
        break;
      }

      case 'costMod': {
        if (e.side) {
          // team-wide modifier
          var s = e.side === 'ally' ? src.side : opposite(src.side);
          B.costMods[s].push({ flat: e.flat || 0, pct: e.pct || 0, turns: e.turns });
          logMsg(B, 'buff', 'Ability costs shifted for ' +
            (s === 'player' ? 'your team' : 'the enemy') + '.', {});
        } else {
          list.forEach(function (t) {
            t.costMods = t.costMods || [];
            t.costMods.push({ flat: e.flat || 0, pct: e.pct || 0, turns: e.turns });
          });
        }
        break;
      }

      case 'stealEnergy': {
        var foe = opposite(src.side);
        var take = Math.min(B.energy[foe], e.amt);
        B.energy[foe] -= take;
        B.energy[src.side] = Math.min(100, B.energy[src.side] + take);
        logMsg(B, 'energy', 'Stole ' + take + ' Energy.', {});
        break;
      }

      case 'swapTargets': {
        if (list.length >= 2) {
          var a = list[0], b = list[1];
          var tmp = a.slot; a.slot = b.slot; b.slot = tmp;
          logMsg(B, 'move', a.name + ' and ' + b.name + ' swap places.', {});
        }
        break;
      }

      case 'revive': {
        list.forEach(function (t) {
          t.alive = true;
          t.hp = Math.round(t.maxHp * (e.pctMaxHp / 100));
        });
        break;
      }

      case 'delayed': {
        list.forEach(function (t) {
          t.pending.push({
            turns: e.turns,
            tag: e.tag,
            srcUid: src.uid,
            effects: e.effects,
            scale: ctx.scale || 1
          });
        });
        logMsg(B, 'mark', list.length + ' enemies are marked.', {});
        break;
      }

      case 'randomOf': {
        list.forEach(function (t) {
          var opt = e.options[Math.floor(B.rng() * e.options.length)];
          applyEffect(B, src, [t], opt, ctx);
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
        var subCtx = { scale: (ctx.scale || 1) * (e.scale || 1) };
        var eff = sub.effects || (sub.choose && sub.choose[0].effects) || [];
        applyEffects(B, src, subTargets, eff, subCtx);
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
    var t = (ability.spec.target || {});
    var sorted = pool.slice();
    if (t.side === 'ally') {
      sorted.sort(function (a, b) { return (a.hp / a.maxHp) - (b.hp / b.maxHp); });
    } else {
      sorted.sort(function (a, b) { return a.hp - b.hp; });
    }
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

    logMsg(B, 'action',
      unit.name + ' uses ' + ability.name + (cost ? ' (' + cost + ' EN)' : '') + '.',
      { uid: unit.uid, ability: ability.name });

    var ctx0 = { turnIdAtStart: B.turnId, preDamaged: {} };
    targets.forEach(function (t) {
      ctx0.preDamaged[t.uid] = (t.lastDamagedTurn === B.turnId);
    });

    var effects = spec.effects;
    if (spec.choose) {
      var idx = chooseIndex != null ? chooseIndex : 0;
      effects = spec.choose[idx].effects;
      logMsg(B, 'info', spec.choose[idx].label + '.', {});
    }

    applyEffects(B, unit, targets, effects, ctx0);
    checkEnd(B);
    return { ok: true };
  }

  /* ---------------------------------------------------------
     TURN / ROUND FLOW
     --------------------------------------------------------- */
  function unitsCanAct(B, side) {
    return unitsOf(B, side).filter(function (u) {
      if (B.acted[side][u.uid]) return false;
      return canUse(B, u, u.card.ability) || canUse(B, u, roleAbility(u));
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
      spec: base.spec
    };
  }

  /* Changing the active side starts a new "turn" for effects that care
     (e.g. Nezha's follow-up on an already-damaged target). */
  function setTurn(B, side) {
    if (B.turn !== side) B.turnId += 1;
    B.turn = side;
    return B.turn;
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
    var e = energyForRound(B.round);
    B.energy.player = e;
    B.energy.enemy = e;
    B.acted = { player: {}, enemy: {} };

    B.units.forEach(function (u) {
      u.roundFlags = {};
      u.buffs = tickDown(u.buffs);
      if (u.costMods) u.costMods = tickDown(u.costMods);
      ['taunt', 'untargetable', 'silence'].forEach(function (f) {
        if (u.flags[f] > 0) u.flags[f] -= 1;
      });
      if (u.flags.healModTurns > 0) {
        u.flags.healModTurns -= 1;
        if (u.flags.healModTurns <= 0) u.flags.healMod = 0;
      }
    });
    B.costMods.player = tickDown(B.costMods.player);
    B.costMods.enemy = tickDown(B.costMods.enemy);

    // resolve delayed effects (Zeus)
    B.units.forEach(function (u) {
      if (!u.pending.length) return;
      var still = [];
      u.pending.forEach(function (p) {
        p.turns -= 1;
        if (p.turns > 0) { still.push(p); return; }
        var src = B.units.filter(function (x) { return x.uid === p.srcUid; })[0];
        if (src && u.alive) {
          applyEffects(B, src, [u], p.effects, { scale: p.scale });
        }
      });
      u.pending = still;
    });

    logMsg(B, 'round', 'Round ' + B.round + ' — Energy restored to ' + e + '.', {});
    if (B.round === ESCALATE_FROM + 1) {
      logMsg(B, 'round', 'The tide turns — damage rises and healing weakens each round.', {});
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
    ESCALATE_FROM: ESCALATE_FROM,
    escalationMult: escalationMult,
    healDecay: healDecay,
    createBattle: createBattle,
    unitsOf: unitsOf,
    unitAt: unitAt,
    opposite: opposite,
    isFront: isFront,
    atkOf: atkOf,
    defOf: defOf,
    critOf: critOf,
    hasDebuff: hasDebuff,
    costOf: costOf,
    canUse: canUse,
    legalTargets: legalTargets,
    pickCount: pickCount,
    resolveTargets: resolveTargets,
    forcedTarget: forcedTarget,
    autoPick: autoPick,
    useAbility: useAbility,
    roleAbility: roleAbility,
    unitsCanAct: unitsCanAct,
    endTurn: endTurn,
    setTurn: setTurn,
    nextRound: nextRound,
    checkEnd: checkEnd,
    passiveOf: passiveOf
  };
})();
