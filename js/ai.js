/* =============================================================
   Echoes of Legend - Enemy Bot
   -------------------------------------------------------------
   A depth-4 search engine, in the spirit of a chess engine.

   WHAT "DEPTH 4" MEANS HERE
   -------------------------
   A ply is one side's complete turn (every hero that can act, acts).
   The search therefore looks:

     ply 1   the bot's current turn, opening with the candidate action
     ply 2   the opponent's reply
     ply 3   the bot's follow-up
     ply 4   the opponent's second reply

   ...then scores the resulting position with `evaluate()`. Depth
   defaults to 4 (`SEARCH_DEPTH`) for gameplay; bulk-simulation
   harnesses temporarily lower it via `setDepth()`.

   WHY SAMPLING, NOT FULL ENUMERATION
   ----------------------------------
   A single turn is a *sequence* of up to 6 actions, each with ~12
   (ability x target) choices, so one ply alone is ~12^6 = 3M orderings
   and three plies is far past astronomical. Instead the bot:

     1. ranks every legal opening move with a fast static heuristic,
     2. keeps the best BEAM_WIDTH of them,
     3. plays each one out to the configured depth (4 in gameplay)
        several times, using the static heuristic as the in-rollout
        policy for both sides,
     4. averages the leaf evaluations and plays the best.

   Rollouts are repeated because the engine is stochastic (crits, coin
   flips), so a single playout is noise. Both sides use the same policy,
   which makes ply 2 a genuine adversarial reply rather than a null move.

   BUDGET
   ------
   `SIM_BUDGET` caps total rollouts per decision. Rollouts are shared out
   across the surviving candidates, with a floor of MIN_ROLLOUTS each.
   ============================================================= */
(function () {
  'use strict';

  var E = window.EOL.engine;

  /* Plies of lookahead. Gameplay runs at 4 (one full reply deeper than
     the original depth-3 design). Balance harnesses lower it via
     setDepth() - a full sweep needs tens of thousands of games and
     depth 2 is several times faster while ranking moves nearly
     identically. */
  var SEARCH_DEPTH = 4;
  var DEFAULT_DEPTH = 4;
  var BEAM_WIDTH = 8; // candidate opening moves carried into search
  var SIM_BUDGET = 2400; // rollout budget per decision
  var MIN_ROLLOUTS = 5; // per surviving candidate
  var MAX_ROLLOUTS = 18;
  var TIME_BUDGET = 90; // ms; hard ceiling so the UI stays responsive

  /* Successive halving: cheap first pass over the whole beam, then
     spend the remaining budget only on the survivors. */
  var PRUNE_KEEP = 4; // candidates kept for the deep pass

  /* Simulation can use a smaller, explicit search budget while retaining
     depth-2 lookahead. Gameplay defaults above remain unchanged. */
  var SIMULATION_BUDGET = null;
  function activeBudget() {
    return (
      SIMULATION_BUDGET || {
        beamWidth: BEAM_WIDTH,
        pruneKeep: PRUNE_KEEP,
        minRollouts: MIN_ROLLOUTS,
        maxRollouts: MAX_ROLLOUTS,
        timeBudget: TIME_BUDGET,
      }
    );
  }

  function hpFrac(u) {
    return u.hp / u.maxHp;
  }

  /* -----------------------------------------------------------
     Deterministic RNG so a search is reproducible and so the
     variance between candidates comes from the game, not the seed.
     xorshift32 - fast and good enough for rollouts.
     ----------------------------------------------------------- */
  function makeRng(seed) {
    var x = seed | 0;
    if (x === 0) x = 0x9e3779b9;
    return function () {
      x ^= x << 13;
      x |= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x |= 0;
      return ((x >>> 0) % 100000) / 100000;
    };
  }

  /* =============================================================
     STATIC EVALUATION
     -------------------------------------------------------------
     Returns a score from `side`'s point of view: positive is good.
     Everything is denominated in "effective HP" so the terms are
     commensurable and the numbers stay interpretable.
     ============================================================= */

  /* A hero is worth more than their raw HP: losing one costs you an
     action every round for the rest of the game. Support roles are
     worth more than their statline suggests. */
  var ROLE_VALUE = {
    Medic: 1.45,
    Tank: 1.1,
    Controller: 1.2,
    Caster: 1.15,
    Sniper: 1.15,
    Bruiser: 1.05,
  };

  function unitValue(B, u) {
    if (!u.alive) return 0;

    // survivability: current HP plus shield, scaled by defence
    var ehp = (u.hp + u.shield) / Math.max(0.25, 1 - E.defOf(u) / 100);

    // offence: what this hero threatens per turn
    var threat = E.atkOf(u) * 1.9 * (1 + E.critOf(u) / 200);

    var v = ehp * 0.55 + threat * 0.75;

    // simply being alive holds a slot and an action
    v += 900 * (ROLE_VALUE[u.role] || 1);

    // a hero who can still act this round is worth more than a spent one
    if (!B.acted[u.side][u.uid]) v += 260;

    // ---- pending damage already on the books ----
    if (u.flags.burn > 0) {
      v -= u.maxHp * 0.05 * u.flags.burn * 1.05;
    }
    (u.pending || []).forEach(function () {
      v -= 420;
    });

    // ---- states that change how damage resolves ----
    if (u.flags.exposed > 0) v -= u.maxHp * 0.1 + E.defOf(u) * 12;
    if (u.flags.marked > 0) v -= 220;
    if (u.flags.silence > 0) v -= 520; // signature locked out
    if (u.flags.healMod) v -= 200;
    if (u.flags.untargetable > 0) v += 620;
    /* Provoke is worth less than it used to be: since the 2026-08-01
       protection pass it no longer walls Sniper signatures (they pierce
       at 0.8x) and no longer collapses AoE to a single target. It still
       redirects every other single-target attack, which is most of the
       board, so it keeps most of its value - but not all of it. */
    if (u.flags.taunt > 0) v += 190;

    // low-HP heroes are at risk of being finished off; value them
    // slightly under their raw numbers so the bot protects them
    var f = hpFrac(u);
    if (f < 0.3) v -= (380 * (0.3 - f)) / 0.3;

    return v;
  }

  /* Whole-position evaluation from `side`'s perspective. */
  function evaluate(B, side) {
    if (B.over) {
      if (B.winner === side) return 1e7;
      if (B.winner) return -1e7;
      return 0;
    }
    var foe = E.opposite(side);
    var mine = 0,
      theirs = 0,
      myAlive = 0,
      foeAlive = 0;

    B.units.forEach(function (u) {
      if (!u.alive) return;
      var v = unitValue(B, u);
      if (u.side === side) {
        mine += v;
        myAlive++;
      } else {
        theirs += v;
        foeAlive++;
      }
    });

    var s = mine - theirs;

    // Losing bodies is worse than the HP suggests: a 6v4 is far better
    // than the raw totals imply, because actions compound each round.
    s += (myAlive - foeAlive) * 700;

    // Wiping a front row exposes the enemy back line (engine rule)
    if (E.frontRowWiped(B, foe)) s += 500;
    if (E.frontRowWiped(B, side)) s -= 500;

    // Unspent energy has option value, but only up to what you can use
    s += Math.min(B.energy[side], 100) * 2.4;
    s -= Math.min(B.energy[foe], 100) * 2.4;

    return s;
  }

  /* =============================================================
     STATIC HEURISTIC (the in-rollout policy, and the beam filter)
     ============================================================= */

  function scoreAction(B, unit, ability, targets) {
    var spec = ability.spec || {};
    var atk = E.atkOf(unit);
    var s = scoreEffects(
      B,
      unit,
      spec.effects || (spec.choose && spec.choose[0].effects) || [],
      targets,
      atk
    );

    var cost = E.costOf(B, unit, ability);
    s -= cost * 3.2;
    if (!ability.basic) s += 120;
    return s;
  }

  /* Does this action's damage certainly kill something outright?
     Uses the pessimistic (no-crit) damage so it never over-promises. */
  function lethalCount(B, unit, ability, targets, chooseIndex) {
    var n = 0;
    (targets || []).forEach(function (t) {
      if (!t.alive) return;
      var pv = E.previewDamage(B, unit, ability, t, chooseIndex || 0);
      if (pv && pv.dmg >= t.hp + t.shield) n++;
    });
    return n;
  }

  /* What removing these units is worth, used to weight a certain kill.
     Scaling by the victim's own value means killing a Medic outranks
     killing a spent Bruiser, and it keeps the bonus on the same scale as
     everything else in evaluate(). */
  function lethalValue(B, unit, ability, targets, chooseIndex) {
    var v = 0;
    (targets || []).forEach(function (t) {
      if (!t.alive) return;
      var pv = E.previewDamage(B, unit, ability, t, chooseIndex || 0);
      if (pv && pv.dmg >= t.hp + t.shield) v += unitValue(B, t);
    });
    return v;
  }

  /* Score a list of effects. Split out from scoreAction so `branch` can
     recurse into whichever arm will actually resolve. */
  /* Resolve which units ONE effect actually lands on, mirroring the
     engine's `to:` redirect so team-wide riders score real value. */
  function fxTargets(B, unit, e, targets) {
    if (!e.to || e.to === 'targets') return targets;
    if (e.to === 'self') return [unit];
    if (e.to === 'allies') return E.unitsOf(B, unit.side);
    if (e.to === 'frontAllies') return E.unitsOf(B, unit.side).filter(E.isFront);
    if (e.to === 'otherAllies')
      return E.unitsOf(B, unit.side).filter(function (u) {
        return targets.indexOf(u) < 0;
      });
    if (e.to === 'enemies') return E.unitsOf(B, E.opposite(unit.side));
    /* targetRowEnemies (Mordred's row-wide Exposed): score the real row
       of the first target instead of pretending it is single-target */
    if (e.to === 'targetRowEnemies' && targets.length)
      return E.unitsOf(B, targets[0].side).filter(function (u) {
        return E.isFront(u) === E.isFront(targets[0]);
      });
    return targets; // triggerTarget / adjacentTargets: approximate by targets
  }

  function scoreEffects(B, unit, effects, targets, atk) {
    var s = 0;
    (effects || []).forEach(function (e) {
      if (e.ifStacks) {
        var sc = unit.buffs.filter(function (b) {
          return b.tag === e.ifStacks.tag;
        }).length;
        if (sc + 1 < e.ifStacks.min) return; // this proc would not reach it
      }
      var ft = fxTargets(B, unit, e, targets);
      switch (e.k) {
        case 'dmg': {
          ft.forEach(function (t) {
            var bonus = 0;
            /* per-stack scaling - the AI must see that hitting a heavily
               debuffed target is worth far more, or it will never set up */
            if (e.perDebuff && E.debuffCount) {
              var dn = E.debuffCount(t);
              if (e.perDebuffMax != null) dn = Math.min(dn, e.perDebuffMax);
              bonus += atk * e.perDebuff * dn;
            }
            if (e.perBuff && E.buffCount) {
              var bn = E.buffCount(t);
              if (e.perBuffMax != null) bn = Math.min(bn, e.perBuffMax);
              bonus += atk * e.perBuff * bn;
            }
            var raw = (atk * e.power + bonus) * (1 - E.defOf(t) / 100);
            if (raw >= t.hp)
              s += 900 + raw * 0.4; // finishing blow
            else s += raw;
            s += (1 - hpFrac(t)) * 120; // focus the wounded
          });
          break;
        }
        case 'heal': {
          targets.forEach(function (t) {
            var amt = e.pctMaxHp != null ? (t.maxHp * e.pctMaxHp) / 100 : atk * (e.power || 1);
            var missing = t.maxHp - t.hp;
            s += Math.min(amt, missing) * (hpFrac(t) < 0.4 ? 1.5 : 0.65);
            if (e.overflow === 'shield') {
              // overflow is not waste: it comes back as burst protection
              s += Math.max(0, amt - missing) * 0.5;
            } else if (missing < t.maxHp * 0.08) {
              s -= 260; // plain healing of a full bar is still a waste
            }
          });
          break;
        }
        case 'stat': {
          var per = 0;
          /* Debuffs now feed per-stack payoffs across the roster, so a
             debuff is worth more than its raw stat swing suggests. */
          if (e.amt < 0) s += 90;
          targets.forEach(function (t) {
            var base =
              e.stat === 'atk'
                ? E.atkOf(t) * 1.1
                : e.stat === 'def'
                  ? t.maxHp * 0.3
                  : E.atkOf(t) * 0.9;
            per += base * (Math.abs(e.amt) / 100);
          });
          if (!ft.length) per = Math.abs(e.amt) * 12;
          s += per * (e.turns > 1 ? 1.35 : 1) * (e.turns > 50 ? 1.6 : 1);
          break;
        }
        case 'shield': {
          targets.forEach(function (t) {
            s += t.maxHp * ((e.pctMaxHp || 0) / 100) * 0.9;
          });
          break;
        }
        case 'taunt': {
          targets.forEach(function (t) {
            s += t.hp * 0.16 + 180;
          });
          break;
        }
        case 'mark': {
          // A Mark is spent on use, so re-marking an already marked target
          // is worthless - only fresh marks count (bounded by `take`).
          var fresh = ft.filter(function (t) {
            return !(t.flags.marked > 0);
          }).length;
          if (e.take && fresh > e.take.n) fresh = e.take.n;
          s += fresh * 130;
          break;
        }
        case 'consumeMark':
          break;
        case 'consumeBuffs': {
          /* worth the number of stacks it can cash */
          ft.forEach(function (t) {
            var n = E.buffCount ? E.buffCount(t) : 0;
            s += n * 260;
          });
          break;
        }
        case 'silence':
          /* Silence now blocks EVERY action, Basics included, so it denies a
             whole turn rather than downgrading one. Priced against what a
             hero would have done with that turn. */
          ft.forEach(function (t) {
            s += 420 + E.atkOf(t) * 0.55;
          });
          if (!ft.length) s += 500;
          break;
        case 'stealEnergy':
          s += 300;
          break;
        case 'drainTax':
          s += 300;
          break;
        case 'loseEnergy':
          s -= 80;
          break;
        case 'drainEnergy':
          s += (e.amt || 10) * 20;
          break;
        case 'counterStrike': {
          targets.forEach(function (t) {
            s += t.hp * 0.12 + 160;
          });
          break;
        }
        case 'costMod':
          s += 190;
          break;
        case 'healMod':
          s += 150;
          break;
        case 'delayed': {
          s += 300 + scoreEffects(B, unit, e.effects, targets, atk) * 0.7;
          break;
        }
        case 'randomOf':
          s += 130;
          break;
        case 'coinFlip': {
          var h = scoreEffects(B, unit, e.heads && e.heads.effects, targets, atk);
          var tl = scoreEffects(B, unit, e.tails && e.tails.effects, targets, atk);
          s += (h + tl) / 2;
          break;
        }
        case 'copyAllyActive':
          s += 340;
          break;
        case 'lifesteal':
          s += 90;
          break;
        case 'gainEnergy':
          s += (e.amt || 0) * 5;
          break;
        case 'burn': {
          targets.forEach(function (t) {
            var tick = t.maxHp * 0.05;
            if (t.flags.burn > 0)
              s += tick * 0.4; // only a refresh
            else s += tick * (e.turns || 2) * 0.95;
          });
          break;
        }
        case 'exposed': {
          targets.forEach(function (t) {
            if (t.flags.exposed > 0) {
              s += 40;
              return;
            }
            s += 180 + E.defOf(t) * 14;
          });
          break;
        }
        case 'extendDebuffs': {
          var any = ft.filter(function (t) {
            return E.hasDebuff(t);
          }).length;
          s += any ? 150 + any * 90 : -60;
          break;
        }
        case 'cleanse': {
          targets.forEach(function (t) {
            if (e.only) {
              s += t.flags[e.only] > 0 ? 200 : -30;
              return;
            }
            s += E.hasDebuff(t) ? 150 : -25;
          });
          break;
        }
        case 'branch': {
          var c = e.cond || {};
          var pass = true;
          if (c.anyTargetMarked)
            pass = targets.some(function (t) {
              return t.flags.marked > 0;
            });
          if (c.anyTargetDebuffed)
            pass = targets.some(function (t) {
              return E.hasDebuff(t);
            });
          if (c.anyEnemyMarked) {
            pass = E.unitsOf(B, E.opposite(unit.side)).some(function (t) {
              return t.flags.marked > 0;
            });
          }
          if (c.targetHasDebuff != null) {
            pass =
              pass && targets.length > 0 && E.hasDebuff(targets[0]) === !!c.targetHasDebuff;
          }
          if (c.debuffCountAtLeast != null) {
            pass =
              pass && targets.length > 0 && E.debuffCount(targets[0]) >= c.debuffCountAtLeast;
          }
          if (c.buffCountAtLeast != null) {
            pass = pass && targets.length > 0 && E.buffCount(targets[0]) >= c.buffCountAtLeast;
          }
          var hp = targets.length ? targets[0].hp / targets[0].maxHp : null;
          if (c.targetHpBelow != null) pass = pass && hp != null && hp < c.targetHpBelow;
          if (c.targetHpAbove != null) pass = pass && hp != null && hp > c.targetHpAbove;
          if (c.targetHpBetween)
            pass = pass && hp != null && hp >= c.targetHpBetween[0] && hp <= c.targetHpBetween[1];
          if (c.targetHpOutside)
            pass = pass && hp != null && (hp < c.targetHpOutside[0] || hp > c.targetHpOutside[1]);
          if (c.selfShielded) pass = unit.shield > 0;
          s += scoreEffects(B, unit, pass ? e.then : e.other || e.else, targets, atk);
          break;
        }
        default:
          s += 40;
      }
    });
    return s;
  }

  /* Build the list of every legal action a side could take right now. */
  function candidates(B, side) {
    var out = [];
    E.unitsOf(B, side).forEach(function (unit) {
      if (B.acted[side][unit.uid]) return;

      [unit.card.ability, E.roleAbility(unit)].forEach(function (ability) {
        if (!ability || ability.type !== 'Active') return;
        if (!E.canUse(B, unit, ability)) return;

        var need = E.pickCount(ability);
        var chooseCount = ability.spec && ability.spec.choose ? ability.spec.choose.length : 1;

        for (var ci = 0; ci < chooseCount; ci++) {
          if (need === 0) {
            var t0 = E.resolveTargets(B, unit, ability, []);
            out.push({
              unit: unit,
              ability: ability,
              targets: t0,
              chosen: [],
              choose: ci,
              score: scoreAction(B, unit, ability, t0),
              lethal: lethalCount(B, unit, ability, t0, ci),
              lethalVal: lethalValue(B, unit, ability, t0, ci),
            });
          } else {
            var pool = E.legalTargets(B, unit, ability);
            if (!pool.length) continue;

            var forced = E.forcedTarget(B, unit, ability); // Robin Hood
            if (forced) pool = [forced];

            if (need === 1) {
              /* Simulation/gameplay search pruning: target types rather than
                 every legal unit. Preserve execute, threat, Tank, Mark and
                 Exposed choices; cap the expensive depth search at 3. */
              if (pool.length > 3) {
                var ranked = pool.slice();
                var low = ranked.slice().sort(function (a, b) {
                  return a.hp / a.maxHp - b.hp / b.maxHp;
                })[0];
                var high = ranked.slice().sort(function (a, b) {
                  return E.atkOf(b) - E.atkOf(a);
                })[0];
                var prey = ranked
                  .filter(function (t) {
                    return t.flags.marked > 0 || t.flags.exposed > 0;
                  })
                  .sort(function (a, b) {
                    return a.hp / a.maxHp - b.hp / b.maxHp;
                  })[0];
                var tank = ranked
                  .filter(function (t) {
                    return t.role === 'Tank';
                  })
                  .sort(function (a, b) {
                    return E.atkOf(b) - E.atkOf(a);
                  })[0];
                var kept = [];
                [low, prey, high, tank].forEach(function (t) {
                  if (t && kept.indexOf(t) < 0 && kept.length < 3) kept.push(t);
                });
                pool = kept;
              }
              pool.forEach(function (t) {
                out.push({
                  unit: unit,
                  ability: ability,
                  targets: [t],
                  chosen: [t],
                  choose: ci,
                  score: scoreAction(B, unit, ability, [t]),
                  lethal: lethalCount(B, unit, ability, [t], ci),
                  lethalVal: lethalValue(B, unit, ability, [t], ci),
                });
              });
            } else {
              var two = pool
                .slice()
                .sort(function (a, b) {
                  return E.atkOf(b) - E.atkOf(a);
                })
                .slice(0, need);
              if (two.length === need) {
                out.push({
                  unit: unit,
                  ability: ability,
                  targets: two,
                  chosen: two,
                  choose: ci,
                  score: scoreAction(B, unit, ability, two),
                  lethal: lethalCount(B, unit, ability, two, ci),
                  lethalVal: lethalValue(B, unit, ability, two, ci),
                });
              }
            }
          }
        }
      });
    });
    return out;
  }

  /* The greedy policy used *inside* rollouts for both sides. Cheap on
     purpose - it is called thousands of times per decision. */
  function policyAction(B, side, rng) {
    var list = candidates(B, side);
    if (!list.length) return null;
    var best = null,
      bestScore = -Infinity;
    for (var i = 0; i < list.length; i++) {
      // light jitter keeps repeated rollouts from being identical
      var sc = list[i].score + (rng() - 0.5) * 90;
      if (sc > bestScore) {
        bestScore = sc;
        best = list[i];
      }
    }
    if (best && best.score < -120) return null;
    return best;
  }

  /* =============================================================
     ROLLOUT MACHINERY
     ============================================================= */

  /* ---------------------------------------------------------
     ROLLOUT MACHINERY - alternating actions
     -------------------------------------------------------------
     A ply is now ONE ACTION, because that is the unit of play: a side
     uses one ability and control passes. So the depth-4 gameplay
     search reads:

         ply 1  our action (the candidate being tested)
         ply 2  the opponent's reply
         ply 3  our follow-up
         ply 4  the opponent's second reply

     If a side cannot act it passes and the other continues; when both
     have passed the round rolls over and play resumes.
     --------------------------------------------------------- */

  /* Take a single action for `side` using the greedy policy.
     Returns true if an ability was used, false if the side passed.
     NOTE: rollouts model a chosen pass as the sticky round-out
     (passSide). Live play rules passing as turn-level (passTurn -
     the passer may act again later in the round). Rollouts keep the
     stickier model on purpose: a round-forfeit branch is a cheaper
     search, and the divergence only ever understates the value of
     passing, which the live flow then grants anyway. */
  function actOnce(C, side, rng) {
    var a = policyAction(C, side, rng);
    if (!a) {
      E.passSide(C, side);
      return false;
    }
    var r = E.useAbility(C, a.unit, a.ability, a.chosen, a.choose);
    if (!r.ok) {
      C.acted[side][a.unit.uid] = true;
      return false;
    }
    return true;
  }

  /* Advance the clock one ply, rolling the round over when both sides
     are spent. Returns the side to move next, or null if the game ended
     or the rollout should stop. */
  function stepClock(C) {
    if (C.over) return null;
    var nxt = E.advanceAction(C);
    if (nxt) return nxt;
    // round exhausted: roll it over and resume
    E.nextRound(C);
    if (C.over) return null;
    return E.advanceAction(C);
  }

  /* Map an action described against the real battle onto its twin in a
     cloned battle (units are matched by uid). */
  function rebind(C, act) {
    var byUid = C.uidMap || {};
    if (!C.uidMap)
      C.units.forEach(function (u) {
        byUid[u.uid] = u;
      });
    var unit = byUid[act.unit.uid];
    if (!unit) return null;
    var ability = act.ability.basic ? E.roleAbility(unit) : unit.card.ability;
    var chosen = (act.chosen || [])
      .map(function (t) {
        return byUid[t.uid];
      })
      .filter(Boolean);
    if ((act.chosen || []).length !== chosen.length) return null;
    return { unit: unit, ability: ability, chosen: chosen, choose: act.choose };
  }

  /* One playout to SEARCH_DEPTH starting from `act`. Returns the leaf eval. */
  function rollout(B, side, act, seed) {
    var rng = makeRng(seed);
    var C = E.cloneBattle(B, rng);

    var bound = rebind(C, act);
    if (!bound) return -Infinity;

    var r = E.useAbility(C, bound.unit, bound.ability, bound.chosen, bound.choose);
    if (!r.ok) return -Infinity;

    /* Plies 2..N: single alternating actions. Each iteration hands the
       clock on and lets whoever is to move take exactly one action. */
    var toMove = stepClock(C);
    for (var ply = 2; ply <= SEARCH_DEPTH && toMove && !C.over; ply++) {
      actOnce(C, toMove, rng);
      toMove = C.over ? null : stepClock(C);
    }

    /* Let the position settle a little past the horizon so the leaf isn't
       evaluated mid-exchange (a classic horizon effect: our hit counted,
       their reply not yet). Cheap, and it markedly steadies the eval. */
    var settle = 0;
    while (!C.over && toMove && settle++ < 4) {
      actOnce(C, toMove, rng);
      toMove = C.over ? null : stepClock(C);
    }

    return evaluate(C, side);
  }

  /* =============================================================
     TOP LEVEL
     ============================================================= */

  var lastSearch = null; // diagnostics for the UI / tests

  function bestAction(B, side) {
    var budget = activeBudget();
    var list = candidates(B, side);
    if (!list.length) {
      lastSearch = null;
      return null;
    }

    // Only one legal move: no point searching.
    if (list.length === 1) {
      lastSearch = { depth: SEARCH_DEPTH, considered: 1, rollouts: 0, evaluated: 1 };
      return list[0].score < -120 ? null : list[0];
    }

    // ---- beam: keep the most promising openings ----
    list.sort(function (a, b) {
      return b.score - a.score;
    });
    var beam = list.slice(0, Math.min(budget.beamWidth, list.length));

    var seedBase = Math.floor(B.rng() * 0x7fffffff) | 0;
    var t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    function elapsed() {
      var now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      return now - t0;
    }

    var totalRollouts = 0;

    /* Run `n` rollouts of one candidate, accumulating onto its record.
       Common random numbers: every candidate sees the same seed
       sequence, so they're compared on identical luck. */
    function sample(rec, n) {
      for (var k = 0; k < n; k++) {
        var v = rollout(B, side, rec.act, seedBase + (rec.n + k) * 7919);
        if (v === -Infinity) {
          rec.invalid = true;
          continue;
        }
        rec.sum += v;
        if (v < rec.worst) rec.worst = v;
        if (v > rec.best) rec.best = v;
        rec.n++;
        totalRollouts++;
      }
    }
    function valueOf(rec) {
      if (!rec.n) return -Infinity;
      var mean = rec.sum / rec.n;
      // mostly the mean, plus a slice of the worst case so the bot
      // avoids lines that are good on average but sometimes lose
      var v = mean * 0.85 + rec.worst * 0.15 + rec.act.score * 0.02;
      /* A kill that is certain this instant beats a speculative line of
         equal average value: it removes an enemy action for good and
         cannot be undone by healing. The bonus is the victim's own worth
         (so killing a Medic outranks killing a spent Bruiser) plus a
         floor per body. A flat bonus was not enough - rollout variance
         still lost an available finishing blow ~3 times in 20. */
      v += (rec.act.lethalVal || 0) * 0.6 + (rec.act.lethal || 0) * 600;
      return v;
    }

    var recs = beam.map(function (a) {
      return { act: a, sum: 0, n: 0, worst: Infinity, best: -Infinity };
    });

    // ---- stage 1: a shallow look at every candidate ----
    for (var i = 0; i < recs.length; i++) {
      sample(recs[i], budget.minRollouts);
      if (elapsed() > budget.timeBudget) break;
    }

    // A forced win found this early is worth taking immediately.
    for (var w = 0; w < recs.length; w++) {
      if (recs[w].n && recs[w].worst >= 1e6) {
        lastSearch = {
          depth: SEARCH_DEPTH,
          considered: list.length,
          beam: beam.length,
          rollouts: totalRollouts,
          perCandidate: budget.minRollouts,
          value: Math.round(valueOf(recs[w])),
          decisive: true,
        };
        return recs[w].act;
      }
    }

    // ---- stage 2: spend what's left on the strongest few ----
    recs.sort(function (a, b) {
      return valueOf(b) - valueOf(a);
    });
    var keep = recs.slice(0, Math.min(budget.pruneKeep, recs.length));
    var extra = Math.floor(SIM_BUDGET / Math.max(1, keep.length));
    extra = Math.max(0, Math.min(budget.maxRollouts, extra) - budget.minRollouts);

    for (var pass = 0; pass < extra && elapsed() < TIME_BUDGET; pass++) {
      for (var j = 0; j < keep.length; j++) {
        sample(keep[j], 1);
        if (elapsed() > budget.timeBudget) break;
      }
    }

    /* Pick the winner. If any candidate is a guaranteed kill, the choice
       is made *among those only*: taking a free body off the board is
       never worse than a speculative line, and leaving it to the scoring
       alone let rollout variance drop the kill a few times in sixty. */
    var anyLethal = recs.some(function (r) {
      return r.n && (r.act.lethal || 0) > 0;
    });
    var best = null,
      bestVal = -Infinity;
    recs.forEach(function (r) {
      if (!r.n) return;
      if (anyLethal && !(r.act.lethal > 0)) return;
      var v = valueOf(r);
      if (v > bestVal) {
        bestVal = v;
        best = r.act;
      }
    });
    // fall back to the full field if the lethal set somehow scored nothing
    if (!best) {
      recs.forEach(function (r) {
        var v = valueOf(r);
        if (v > bestVal) {
          bestVal = v;
          best = r.act;
        }
      });
    }

    lastSearch = {
      depth: SEARCH_DEPTH,
      considered: list.length,
      beam: beam.length,
      rollouts: totalRollouts,
      ms: Math.round(elapsed()),
      value: Math.round(bestVal),
    };

    if (!best) return null;
    if (best.score < -120 && bestVal < 0) return null;
    return best;
  }

  window.EOL.ai = {
    bestAction: bestAction,
    candidates: candidates,
    scoreAction: scoreAction,
    scoreEffects: scoreEffects,
    evaluate: evaluate,
    unitValue: unitValue,
    rollout: rollout,
    policyAction: policyAction,
    SEARCH_DEPTH: SEARCH_DEPTH,
    /* Harness hook: temporarily lower the depth for bulk simulation.
       Use resetDepth() when done - gameplay must run at 4. */
    setDepth: function (d) {
      SEARCH_DEPTH = Math.max(1, d | 0);
      window.EOL.ai.SEARCH_DEPTH = SEARCH_DEPTH;
      return SEARCH_DEPTH;
    },
    setSimulationBudget: function (opts) {
      opts = opts || {};
      SIMULATION_BUDGET = {
        beamWidth: Math.max(1, opts.beamWidth || 5),
        pruneKeep: Math.max(1, opts.pruneKeep || 2),
        minRollouts: Math.max(1, opts.minRollouts || 2),
        maxRollouts: Math.max(1, opts.maxRollouts || 6),
        timeBudget: Math.max(1, opts.timeBudget || 25),
      };
      return SIMULATION_BUDGET;
    },
    clearSimulationBudget: function () {
      SIMULATION_BUDGET = null;
    },
    /* Read the override back, so a caller that borrows the AI for its
       own purposes can put the settings back exactly as it found them.
       data/draft-ai.js rates cards by playing them, which means
       retuning depth and budget mid-session; without a getter it could
       only guess at what to restore and would silently reset a sim
       harness's configuration. Returns null when no override is set. */
    simulationBudget: function () {
      return SIMULATION_BUDGET
        ? {
            beamWidth: SIMULATION_BUDGET.beamWidth,
            pruneKeep: SIMULATION_BUDGET.pruneKeep,
            minRollouts: SIMULATION_BUDGET.minRollouts,
            maxRollouts: SIMULATION_BUDGET.maxRollouts,
            timeBudget: SIMULATION_BUDGET.timeBudget,
          }
        : null;
    },
    resetDepth: function () {
      SEARCH_DEPTH = DEFAULT_DEPTH;
      window.EOL.ai.SEARCH_DEPTH = SEARCH_DEPTH;
      return SEARCH_DEPTH;
    },
    lastSearch: function () {
      return lastSearch;
    },
  };
})();
