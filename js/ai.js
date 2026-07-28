/* =============================================================
   Echoes of Legend — Enemy Bot
   -------------------------------------------------------------
   Scores every (unit x ability x target) it can legally perform
   and plays the best one. Deliberately simple and readable:
   heuristics only, no search.
   ============================================================= */
(function () {
  'use strict';

  var E = window.EOL.engine;

  function hpFrac(u) { return u.hp / u.maxHp; }

  /* rough "value" of an ability's effects, used to rank options */
  function scoreAction(B, unit, ability, targets) {
    var spec = ability.spec || {};
    var s = 0;
    var atk = E.atkOf(unit);

    (spec.effects || (spec.choose && spec.choose[0].effects) || []).forEach(function (e) {
      switch (e.k) {
        case 'dmg': {
          targets.forEach(function (t) {
            var raw = atk * e.power * (1 - E.defOf(t) / 100);
            // finishing blows are worth a lot
            if (raw >= t.hp) s += 900 + raw * 0.4;
            else s += raw;
            // focus squishier targets slightly
            s += (1 - hpFrac(t)) * 120;
          });
          break;
        }
        case 'heal': {
          targets.forEach(function (t) {
            var amt = e.pctMaxHp != null ? t.maxHp * e.pctMaxHp / 100 : atk * (e.power || 1);
            var missing = t.maxHp - t.hp;
            // healing a full-HP ally is wasted
            s += Math.min(amt, missing) * (hpFrac(t) < 0.4 ? 1.5 : 0.65);
            if (missing < t.maxHp * 0.08) s -= 260;
          });
          break;
        }
        case 'stat': {
          var mag = Math.abs(e.amt) * 9;
          s += mag * (e.turns > 1 ? 1.15 : 1);
          break;
        }
        case 'shield':   s += 260; break;
        case 'taunt':    s += 210; break;
        case 'silence':  s += 330; break;
        case 'cleanse':  s += 120; break;
        case 'stealEnergy': s += 300; break;
        case 'costMod':  s += 190; break;
        case 'healMod':  s += 150; break;
        case 'delayed':  s += 520; break;
        case 'randomOf': s += 130; break;
        case 'copyAllyActive': s += 340; break;
        case 'lifesteal': s += 90; break;
        default: s += 40;
      }
    });

    // prefer spending energy on impactful things, not trivia
    var cost = E.costOf(B, unit, ability);
    s -= cost * 3.2;

    // signature abilities are usually stronger than the basic
    if (!ability.basic) s += 120;

    return s;
  }

  /* Build the list of every legal action the bot could take. */
  function candidates(B, side) {
    var out = [];
    E.unitsOf(B, side).forEach(function (unit) {
      if (B.acted[side][unit.uid]) return;

      [unit.card.ability, E.roleAbility(unit)].forEach(function (ability) {
        if (!ability || ability.type !== 'Active') return;
        if (!E.canUse(B, unit, ability)) return;

        var need = E.pickCount(ability);
        var chooseCount = (ability.spec && ability.spec.choose) ? ability.spec.choose.length : 1;

        for (var ci = 0; ci < chooseCount; ci++) {
          if (need === 0) {
            var t0 = E.resolveTargets(B, unit, ability, []);
            out.push({ unit: unit, ability: ability, targets: t0, chosen: [], choose: ci,
                       score: scoreAction(B, unit, ability, t0) });
          } else {
            var pool = E.legalTargets(B, unit, ability);
            if (!pool.length) continue;

            // Robin Hood's forced target
            var forced = E.forcedTarget(B, unit, ability);
            if (forced) pool = [forced];

            if (need === 1) {
              pool.forEach(function (t) {
                out.push({ unit: unit, ability: ability, targets: [t], chosen: [t], choose: ci,
                           score: scoreAction(B, unit, ability, [t]) });
              });
            } else {
              // pick the two best by simple heuristic rather than all pairs
              var two = pool.slice().sort(function (a, b) {
                return E.atkOf(b) - E.atkOf(a);
              }).slice(0, need);
              if (two.length === need) {
                out.push({ unit: unit, ability: ability, targets: two, chosen: two, choose: ci,
                           score: scoreAction(B, unit, ability, two) });
              }
            }
          }
        }
      });
    });
    return out;
  }

  /* Choose the single best action, or null if nothing worthwhile. */
  function bestAction(B, side) {
    var list = candidates(B, side);
    if (!list.length) return null;

    // small jitter so the bot isn't perfectly deterministic
    list.forEach(function (c) { c.score += (B.rng() - 0.5) * 60; });
    list.sort(function (a, b) { return b.score - a.score; });

    var best = list[0];
    // if the only options are actively bad (e.g. healing a full-HP ally), pass
    if (best.score < -120) return null;
    return best;
  }

  window.EOL.ai = { bestAction: bestAction, candidates: candidates, scoreAction: scoreAction };
})();
