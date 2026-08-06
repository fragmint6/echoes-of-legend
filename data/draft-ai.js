/* =============================================================
   Echoes of Legend - Draft Intelligence
   -------------------------------------------------------------
   Shared brain for the three places the bot makes roster decisions:
   DRAFTING a pack, BANNING your deck, and FIELDING its six.

   ---- REWRITTEN 2026-08-05: NO PRE-BAKED DATA ------------------
   The previous version leaned on a hand-maintained `POWER` table of
   win-rate z-scores copied out of a balance run. That table had three
   fatal properties:

     1. It went stale silently. It rated 51 of 63 cards - every Duat
        hero and half of Grimmwood were missing - and `powerOf`
        returned 0 for an unknown id. Zero is the roster MEAN, so 19%
        of the game was scored as "perfectly average" by ban
        valuation (x4.2), draft picks (x3.0), fielding and
        sideboarding. Nothing asserted coverage, so nobody noticed.
     2. It could not reason. A number per card says nothing about WHY
        a card is good, so it could not answer "does this counter me?"
     3. Its companion synergy term was DEAD CODE. `pairSynergy` looked
        up `tags(entry)`, but `tags` indexed by `card.id` and was being
        handed the {card,faction} wrapper, whose `.id` is undefined.
        Every lookup missed, every pair scored 0, and the shipped draft
        bot has never once considered a combination. Measured, not
        inferred: summed over all 1,953 pairs the old module returns
        exactly 0.0.

   Nothing here is a table. Everything is derived from the cards
   themselves, at runtime, so a new hero, a new faction or a balance
   tweak is picked up automatically and correctly.

     1. RATING     HOW GOOD IS THIS CARD. Answered by PLAYING it: the
                   card is dropped into a controlled duel against a
                   squad of average bodies and the engine runs the
                   real fight. See §2 - this is the heart of the
                   module and it replaces all hand-written pricing.
     2. IMPACT     a cheap analytic estimate of the same quantity,
                   priced off the effect tree. It is only the COLD
                   START: it answers instantly while §2 is still
                   measuring, and it is worth roughly what reading a
                   card's ATK is worth (r=0.33 against measured win
                   rate, where the probe scores r=0.57).
     3. SYNERGY    a keyword web - Mark, Exposed, Burn, Shield,
                   debuff-payoff, death-trigger, energy economy - so
                   the bot sees combos, not just numbers.
     4. STRUCTURE  role coverage, front/back balance, keystone rails.
     5. COUNTERS   what a card does to a SPECIFIC opposing roster.
                   This is what the ban AI reasons with.
     6. LOOKAHEAD  the draft picks with one ply of opponent modelling:
                   "if I take this, what do they take with what's left?"

   ---- HOW THE WEIGHTS WERE SET --------------------------------
   Every constant below that could not be derived was measured, not
   guessed, against a 2,000-game unbiased run (`sim/sim.js --teams
   random`) and a head-to-head draft harness (`sim/ab_draft.js`). The
   validators live in `sim/rate_check.js` and `sim/probe_lab.js`. The
   headline results, so a future change can be judged against them:

     rating                      Pearson r vs measured win rate
     ------------------------------------------------------------
     eHP alone                            -0.10
     ATK alone                             0.34
     analytic effect pricing (§3)          0.33
     the old hand-maintained POWER table   0.44   (and 13 cards blank)
     MEASURED probe (§2)                   0.57   (63 of 63 covered)

   A rating is only better if it DRAFTS better, so that was measured
   too. Over 600 games in which both sides run the full ranked pipeline
   - draft twelve from shared packs, ban two, field six - and then
   fight under the same search AI, this module beats the one it
   replaces 313 to 254, a 55.2% win rate +/- 4.1 at 95%. The same
   harness with the same brain on both sides reads 50.1%, so the seat
   and the packs are not the reason.

   ============================================================= */
window.EOL = window.EOL || {};

window.EOL.draftAI = (function () {
  'use strict';

  /* ---------------------------------------------------------
     0. ROSTER SNAPSHOT
     Everything below is derived, cached, and invalidated together
     by _rebuild(). Campaign / bespoke cards that are not in
     EOL.factions can be registered with `learn()`.
     --------------------------------------------------------- */
  var EXTRA = []; // cards outside EOL.factions (campaign bosses, tests)
  var CACHE = null;

  function learn(cards) {
    (Array.isArray(cards) ? cards : [cards]).forEach(function (c) {
      if (c && c.id && c.stats && c.ability) EXTRA.push(c);
    });
    CACHE = null;
  }

  function roster() {
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        out.push(c);
      });
    });
    return out.concat(EXTRA);
  }

  /* ---------------------------------------------------------
     1. THE CURRENCY
     -------------------------------------------------------------
     One point = "1% of a reference hero's ATK, dealt once, to one
     enemy". Everything - healing, shields, energy, control - is
     converted into that unit so a Medic and a Sniper can be compared
     without a hand-written opinion about which role matters.

     The two conversion rates are measured off the roster itself
     rather than guessed, so re-balancing HP or ATK globally does not
     silently skew the model.
     --------------------------------------------------------- */
  var ENERGY_PER_ROUND = 80; // ENERGY_BY_ROUND mid value (engine.js)
  var FIELD = 6;

  function build() {
    var cards = roster();
    var n = cards.length || 1;
    var sumHp = 0,
      sumAtk = 0,
      sumDef = 0;
    cards.forEach(function (c) {
      sumHp += c.stats.hp || 0;
      sumAtk += c.stats.atk || 0;
      sumDef += c.stats.def || 0;
    });
    var meanHp = sumHp / n,
      meanAtk = sumAtk / n || 1,
      meanDef = sumDef / n;

    var C = {
      cards: cards,
      /* how many "% of ATK" one "% of max HP" is worth */
      hpToAtk: meanHp / meanAtk,
      /* a signature costing X energy buys roughly X * this much impact,
         so energy granted or denied can be priced against damage */
      energyToImpact: 2.2,
      meanHp: meanHp,
      meanAtk: meanAtk,
      meanDef: meanDef,
      web: {},
      impact: {},
      rating: {},
    };
    CACHE = C;

    /* pass 1 - keyword web (needed before impact so copyAllyActive can
       fall back to a roster average) */
    cards.forEach(function (c) {
      C.web[c.id] = scanTags(c);
    });

    /* pass 2 - raw impact per round */
    var raw = [];
    cards.forEach(function (c) {
      var v = abilityPerRound(c, C);
      /* A malformed or unrecognised node must never poison the whole
         table - one NaN in the list makes every z-score NaN. */
      if (!isFinite(v)) v = 0;
      C.impact[c.id] = v;
      raw.push(v);
    });

    /* pass 3 - stat budget, then blend and normalise to a z-score.
       Normalising last is what keeps this drop-in compatible with the
       old table's scale (mean 0, sd 1, roughly -2..+2). */
    var ehp = [],
      atk = [];
    cards.forEach(function (c) {
      ehp.push(effHp(c));
      atk.push(c.stats.atk || 0);
    });
    var rE = rankNormal(ehp),
      rA = rankNormal(atk),
      rI = rankNormal(raw);

    var blended = cards.map(function (c, i) {
      var statScore = 0.55 * rE[i] + 0.45 * rA[i];
      var abilityScore = rI[i];
      return 0.42 * statScore + 0.58 * abilityScore;
    });
    var final = rankNormal(blended);
    cards.forEach(function (c, i) {
      C.rating[c.id] = round2(final[i]);
    });
    return C;
  }

  function ctx() {
    return CACHE || build();
  }

  /* Rank-normal transform: map a list onto a standard normal by RANK.
     -------------------------------------------------------------
     A plain z-score is at the mercy of outliers - one card priced 20x
     the median flattens all 62 others into a narrow band and every
     downstream weight stops discriminating. Ranking first is immune to
     that while still producing the mean-0, sd-1, roughly-+/-2 shape the
     rest of the module (and the old measured table) is calibrated for. */
  function rankNormal(list) {
    var n = list.length || 1;
    var order = list
      .map(function (v, i) {
        return [isFinite(v) ? v : 0, i];
      })
      .sort(function (a, b) {
        return a[0] - b[0];
      });
    var out = new Array(n);
    var i = 0;
    while (i < n) {
      /* average the rank across ties so identical cards score identically */
      var j = i;
      while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
      var mid = (i + j) / 2;
      for (var k = i; k <= j; k++) out[order[k][1]] = probit((mid + 0.5) / n);
      i = j + 1;
    }
    return out;
  }

  /* Inverse standard-normal CDF (Acklam's rational approximation). */
  function probit(p) {
    if (p <= 0) return -3;
    if (p >= 1) return 3;
    var a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269,
      -30.6647980661472, 2.50662827745924];
    var b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197,
      -13.2806815528857];
    var c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373,
      4.37466414146497, 2.93816398269878];
    var d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    var pl = 0.02425,
      q,
      r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - pl) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /* mean/sd normaliser over a list of numbers */
  function zer(list) {
    var n = list.length || 1;
    var m = 0;
    list.forEach(function (v) {
      m += v;
    });
    m /= n;
    var s = 0;
    list.forEach(function (v) {
      s += (v - m) * (v - m);
    });
    var sd = Math.sqrt(s / n) || 1;
    return function (v) {
      return (v - m) / sd;
    };
  }
  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  /* DEF is a percentage damage reduction, so effective HP is the
     survivability number that actually matters. Clamped because a
     hypothetical 100% DEF would divide by zero. */
  function effHp(c) {
    var def = Math.max(0, Math.min(80, c.stats.def || 0));
    return (c.stats.hp || 0) / (1 - def / 100);
  }

  /* ---------------------------------------------------------
     2. IMPACT - pricing an ability from its effect tree
     -------------------------------------------------------------
     Walks the declarative spec the engine itself executes, so the
     model can never disagree with the card text: there is no card
     text involved.
     --------------------------------------------------------- */

  /* How many bodies does an effect land on? */
  function spread(pick) {
    switch (pick) {
      case 'all':
        return 3.4; // 6 targets, taxed for AoE and overkill
      case 'two':
        return 1.85;
      case 'row':
        return 2.0;
      case 'auto':
      case 'single':
      case 'lowest':
      case 'highest':
      case 'random':
        return 1;
      default:
        return 1;
    }
  }
  function spreadTo(to) {
    switch (to) {
      case 'allies':
      case 'enemies':
        return 3.4;
      case 'otherAllies':
        return 2.9;
      case 'frontAllies':
      case 'targetRowEnemies':
        return 2.0;
      default:
        return 1;
    }
  }

  var STAT_WEIGHT = { atk: 1.0, def: 0.8, crit: 0.75, critDmg: 0.5, spd: 0.6 };

  /* A duration in ROUNDS, valued over a realistic fight horizon.
     `turns: 99` is the data's idiom for "rest of the battle" - taking it
     literally valued Lancelot at 75x his real worth. Anything past a few
     rounds is worth a premium, not a multiple. */
  function dur(t) {
    if (t == null) return 1;
    if (t >= 10) return 3.5; // "rest of battle"
    return Math.min(Math.max(1, t), 4);
  }
  /* Counts in the data may be the string 'all', or a sentinel like 99
     meaning "as many as there are". Both must land on a realistic
     number: `cleanse: 99` priced literally made one Medic worth more
     than the rest of the roster combined. */
  function num(v, dflt, allAs, cap) {
    if (v === 'all') return allAs;
    var n = Number(v);
    if (!isFinite(n) || n === 0) return dflt;
    return cap == null ? n : Math.min(n, cap);
  }

  /* Value of ONE effect node, excluding its children. */
  function nodeValue(e, C) {
    var t = dur(e.turns);
    var hp2a = C.hpToAtk;
    switch (e.k) {
      case 'dmg': {
        /* `power` is a FRACTION of ATK in the data (1.8 = 180% ATK), so
           it must be scaled to the currency, not read as a percent. */
        var base = num(e.power, 1, 1) * 100 * num(e.count || e.n, 1, 2, 4);
        /* conditional damage multipliers ("+40% if buffed") */
        (e.ifMult || []).forEach(function (x) {
          base += (num(x.mult, 1, 1) - 1) * 100 * num(e.power, 1, 1) * 0.45;
        });
        if (e.markedPower) base += (num(e.markedPower, 1, 1) - num(e.power, 1, 1)) * 100 * 0.5;
        return base;
      }
      case 'heal':
        return (
          ((e.pctMaxHp || 0) + (e.perCleansed || 0) * 2 + (e.perDebuff || 0) * 2) *
          hp2a *
          0.85 *
          num(e.count, 1, 2, 3)
        );
      case 'shield':
        return (e.pctMaxHp || e.shieldPctMaxHp || 0) * hp2a * 1.0;
      case 'revive':
        return 200 + (e.pctMaxHp || 30) * 2;
      case 'lifesteal':
        return (e.pct || 30) * 0.9;
      case 'stat': {
        var w = STAT_WEIGHT[e.stat] == null ? 0.6 : STAT_WEIGHT[e.stat];
        var amt = Math.abs(e.amt || 0);
        var stacks = e.maxStacks ? Math.min(e.maxStacks, 6) * 0.5 : 1;
        return amt * t * w * 0.55 * stacks;
      }
      case 'exposed':
        return 42 * t;
      case 'burn':
        /* 5% max HP per TURN the victim's side takes - roughly 1.6
           actions per round - ignoring DEF and shields */
        return 5 * hp2a * 1.6 * t;
      case 'taunt':
        return 50 * t;
      case 'untargetable':
        return 95 * t;
      case 'silence':
        return 75 * t;
      case 'cleanse':
        return 30 * num(e.count, 1, 2.5, 3);
      case 'mark':
        return 22; // an enabler; its real worth shows up in synergy
      case 'consumeMark':
        return 30;
      case 'consumeBuffs':
        return 25;
      case 'counterStrike':
        /* a free retaliation each time it triggers; `power` is a fraction */
        return (40 + num(e.power, 0.5, 0.5) * 100) * t;
      case 'gainEnergy':
        return (e.amt || 0) * C.energyToImpact;
      case 'stealEnergy':
        return (e.amt || 0) * C.energyToImpact * 1.6; // both ends of the swing
      case 'drainEnergy':
      case 'drainTax':
        return (e.amt || 0) * C.energyToImpact * 1.2;
      case 'costMod':
        return Math.abs(e.flat || 0) * C.energyToImpact * t * 2.2;
      case 'damageResist':
      case 'damageMult':
        /* either a flat percent (pct: 22) or a multiplier (mult: 0.85) */
        return (e.pct != null ? Math.abs(e.pct) : Math.abs(1 - num(e.mult, 1, 1)) * 100) * t * 1.4;
      case 'outgoingMult':
        return (e.pct != null ? Math.abs(e.pct) : Math.abs(num(e.mult, 1, 1) - 1) * 100) * t * 1.5;
      case 'healMod':
        return Math.abs(e.pct || 0) * t * 0.6;
      case 'copyAllyActive':
        return 90; // an average signature, one round late
      default:
        return 0;
    }
  }

  /* Does this node hide behind a condition? Conditions are real value
     but they are not free - discount them. */
  function condDiscount(e) {
    var d = 1;
    if (e.if) d *= 0.65;
    if (e.cond) d *= 0.7;
    if (e.oncePerBattle) d *= 0.45;
    if (e.oncePerRound) d *= 0.8;
    if (e.firstPerRound) d *= 0.8;
    if (e.onlyMarked || e.ifTargetMarked || e.ifAttackerMarked || e.ifTargetDebuffed) d *= 0.7;
    return d;
  }

  /* Sum a whole effect list, following every branch the engine can. */
  function listValue(list, mult, C) {
    var total = 0;
    (list || []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var m = mult * spreadTo(e.to) * condDiscount(e);
      total += nodeValue(e, C) * m;

      /* structural nodes: average the outcomes the engine can take */
      if (e.k === 'branch') {
        var a = listValue(e.then || (e.heads && e.heads.effects), m, C);
        var b = listValue(e.other || (e.tails && e.tails.effects), m, C);
        total += (a + b) / 2;
      } else if (e.k === 'coinFlip') {
        var h = listValue(e.heads && e.heads.effects, m, C);
        var tl = listValue(e.tails && e.tails.effects, m, C);
        total += (h + tl) / 2;
      } else if (e.k === 'randomOf' || e.options || e.choose) {
        var opts = e.options || e.choose || [];
        var s = 0;
        opts.forEach(function (o) {
          s += listValue(o.effects || o, m, C);
        });
        total += opts.length ? s / opts.length : 0;
      } else if (e.k === 'delayed') {
        total += listValue(e.effects, m * 0.85, C);
      } else {
        total += listValue(e.effects, m, C);
        total += listValue(e.then, m * 0.8, C);
      }

      /* damage scalers that add a second helping */
      if (e.perDebuff) total += (e.perDebuff || 0) * (e.perDebuffMax || 3) * 0.5 * m;
      if (e.perBuff) total += (e.perBuff || 0) * (e.perBuffMax || 3) * 0.5 * m;
      if (e.ifMult)
        (e.ifMult || []).forEach(function (x) {
          total += (x.amt || 0) * 0.45 * m;
        });
    });
    return total;
  }

  /* How often does a passive actually fire, per round? */
  var TRIGGER_RATE = {
    static: 1.0,
    selfAttacked: 1.3,
    wasAttacked: 1.3,
    incomingAbilityDamage: 1.0,
    alliedCastSkill: 1.5,
    enemyCastSkill: 1.2,
    allyWarded: 0.8,
    allyStruckDebuffed: 0.8,
    allyStruckExposed: 0.8,
    allyBelowHp: 0.6,
    teamKilled: 0.7,
    selfKilled: 0.7,
    allyDied: 0.45,
    sameTargetStreak: 0.5,
    wouldDie: 0.35,
  };

  /* The headline number: expected impact contributed per round. */
  function abilityPerRound(card, C) {
    var a = card.ability || {};
    if (a.passive) {
      var trigs = a.passive.triggers || [a.passive.trigger];
      var rate = 0;
      trigs.forEach(function (t) {
        rate += TRIGGER_RATE[t] == null ? 0.8 : TRIGGER_RATE[t];
      });
      if (a.passive.firstPerRound) rate = Math.min(rate, 1);
      var body =
        listValue(a.passive.effects, 1, C) + listValue(a.passive.onHit, 1, C) * 0.9;
      /* cheating death once is worth roughly a whole extra body */
      if (a.passive.deathCheat) body += 150 / Math.max(rate, 0.2);
      /* passives cost nothing and can never be denied by an empty
         energy bar - a modest premium, not a free doubling */
      return body * rate * 1.05;
    }

    var tmult = spread(a.spec && a.spec.target && a.spec.target.pick);
    var impact = listValue(a.spec && a.spec.effects, tmult, C);
    /* "choose one of two modes" signatures carry their effects under
       `choose` instead of `effects`; the player picks, so take the best
       rather than the average. */
    if (a.spec && a.spec.choose && a.spec.choose.length) {
      var bestMode = 0;
      a.spec.choose.forEach(function (o) {
        bestMode = Math.max(bestMode, listValue(o.effects, tmult, C));
      });
      impact += bestMode;
    }
    var cost = Math.max(10, a.cost || 40);
    /* How often does this actually get cast? NOT one-sixth of the team
       pool: a side concentrates its energy on whichever signature is
       carrying the game, so the card being valued is assumed to be one
       the team wants to fire. ~45% of a round's energy is the share a
       focal card commands, clamped so neither a 15-cost trickle nor a
       70-cost bomb leaves the believable range. */
    var casts = Math.max(0.25, Math.min(1.25, (ENERGY_PER_ROUND * 0.45) / cost));
    return impact * casts;
  }

  /* =========================================================
     2. THE MEASURED RATING - work it out by playing the card
     -----------------------------------------------------------
     Pricing an effect tree by hand is guesswork dressed up as
     arithmetic, and it measures as such: the analytic model in §3
     scores r=0.33 against real win rate, which is what you get from
     reading a card's ATK and nothing else. The reason is structural,
     not a matter of better constants - a number written next to
     `k: 'silence'` cannot know that Silence is worth a great deal
     against a 60-cost bomb and nothing at all against a Passive.

     So don't price the card. PLAY it.

       - Build a VANILLA body: roster-mean HP, ATK and DEF, and an
         empty Passive, so it only ever casts its role Basic. Six of
         them, one per role, is the sparring squad. Nothing about it is
         authored; it is the arithmetic mean of whatever the roster
         currently is.
       - The sparring squad against itself is a mirror, so its result
         is the zero point and is subtracted.
       - To rate card X, swap X in for the sparring body of its own
         role and run the same fight. What is left in the health
         differential is X's contribution and nothing else.
       - Run it from BOTH seats and average, so the advantage of acting
         first cancels exactly rather than on average.

     The engine executes the card's real effects, and the game's own
     `js/ai.js` chooses the moves, so a card is judged on what it
     actually does in a real fight against a real opponent. It scores
     r=0.57 against measured win rate - well past the hand-maintained
     table it replaces (0.44), and that table needed a human to
     regenerate it after every balance pass. For scale: the win-rate
     run it is being scored against is itself only reliable to 0.87
     (~370 games per hero), which caps ANY rating at r=0.93.

     COST AND WHEN IT RUNS. About 45ms per duel, six duels per card
     (three seeds x two seats), ~15s for a 63-card roster. That is far
     too slow to do on demand, so:
       - the result is cached in localStorage under a FINGERPRINT of
         every card's stats and ability. Change a number on a card and
         the fingerprint changes and the roster is re-measured by
         itself. This is the specific defect that killed the old table
         and it cannot recur here - there is nothing to forget to do.
       - a cold cache is filled in the BACKGROUND, a duel or two per
         idle slice, never while a battle is on screen. js/play.js
         starts it at the menu, so it is normally long finished before
         anyone opens a draft.
       - it is DETERMINISTIC. Same roster in, byte-identical ratings
         out, on a fast machine or a machine under three times the
         load. That is not free - see the timeBudget note in
         withProbeAI - and it is what makes the cached result safe to
         trust and the sims reproducible.
       - until it finishes, §3's analytic estimate answers. The two are
         never mixed: the switch-over is all-or-nothing, because a
         half-measured roster would be scoring two thirds of the cards
         on one scale and one third on another.
     ========================================================= */
  var PROBE_V = 1; // bump to invalidate every cached rating
  var STORE_KEY = 'eol.draftai.rating';
  var MEASURED = null; // {id: z} once the whole roster is done
  var measuring = null; // in-flight background job
  var noScheduler = false; // host has no idle callback and no timer

  /* Probe settings. Every one of these was swept in sim/probe_lab.js
     against a 2,000-game random-team win-rate run, not guessed.

     SEARCH. beam 2 / 1 rollout at depth 1. beam 1 scored r=0.52 and
     beam 4 scored r=0.44 for 46% more time - a smarter policy is not a
     better instrument past this point, it just spends longer arriving
     at the same fight.

     ROUND CAP 8. This one is counter-intuitive and worth the ink: a
     LONGER probe fight is a WORSE measurement.

         cap  5    6    8    10   12   16
         r    .54  .56  .54  .47  .43  .37    (3 seeds, both seats)

     Past eight rounds the two sparring squads have ground each other
     down and the health differential saturates - every card starts
     looking like a decided fight instead of a measured contribution,
     and the resolution between cards collapses. Five to eight is a
     flat plateau; eight is kept because it is the point the
     head-to-head result below was validated at, and the plateau's
     internal differences are inside the seed noise.

     THREE seeds, not one. A single seed ranks the roster with a
     reliability of only 0.78 (two runs on different seeds agree at
     r=0.78), and one unlucky seed drops the correlation with real win
     rate from 0.60 to 0.45. Three independent seeds lift that
     reliability to ~0.91, which is where the curve flattens: the error
     left after that is the probe's own bias, and more seeds only buy
     time. Roughly 240ms of measurement per card - about 15s for the
     whole roster, once per roster version, in the background.

     KNOWN BIAS, so it is not rediscovered as a surprise. The sparring
     squad is a mirror of average bodies, so a card whose worth is
     CONDITIONAL on its team-mates is measured against mediocre ones.
     The residuals say exactly that: the heroes the probe most
     underrates against real win rate are the supports and sustain
     pieces (Maid Marian, Snow White, Little John, Pied Piper), whose
     output scales with what they are keeping alive. §4's keyword web
     is what is meant to pay for that, and §6 explains why it currently
     cannot pay very much. */
  var PROBE = {
    depth: 1,
    beam: 2,
    rollouts: 1,
    roundCap: 8,
    seeds: [0x5eed, 0x5eed + 7919, 0x5eed + 15838],
  };
  var ROLE_LIST = ['Tank', 'Bruiser', 'Caster', 'Controller', 'Medic', 'Sniper'];

  function engineReady() {
    var E = window.EOL.engine,
      A = window.EOL.ai;
    return !!(E && E.createBattle && A && A.bestAction);
  }

  /* FNV-1a over everything that could change a card's strength. */
  function fingerprint(cards) {
    var h = 0x811c9dc5;
    var s = 'v' + PROBE_V + '|';
    cards
      .map(function (c) {
        return (
          c.id +
          ':' +
          c.role +
          ':' +
          [c.stats.hp, c.stats.atk, c.stats.def].join(',') +
          ':' +
          JSON.stringify(c.ability)
        );
      })
      .sort()
      .forEach(function (x) {
        s += x + '|';
      });
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36) + '.' + s.length.toString(36);
  }

  function readCache(fp) {
    try {
      var raw = window.localStorage && window.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.fp === fp && o.r ? o.r : null;
    } catch (e) {
      return null; // private mode, quota, corrupt entry - just re-measure
    }
  }
  function writeCache(fp, r) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ fp: fp, r: r }));
    } catch (e) {
      /* nothing to do: the rating still works this session */
    }
  }

  /* The sparring body. Derived, never authored. */
  function vanilla(role, C) {
    return {
      card: {
        id: '_spar-' + role,
        name: 'Sparring ' + role,
        rarity: 'common',
        role: role,
        element: 'Physical',
        stats: {
          hp: Math.round(C.meanHp),
          atk: Math.round(C.meanAtk),
          def: Math.round(C.meanDef),
        },
        ability: {
          type: 'Passive',
          name: 'Nothing',
          cost: null,
          text: '',
          note: null,
          passive: { triggers: ['static'], effects: [] },
        },
        icon: 'ra-player',
        art: null,
      },
      faction: { id: '_spar', name: 'Sparring' },
    };
  }

  function rng32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* One duel. Returns the health differential from side one's view. */
  function duel(t1, t2, seed) {
    var E = window.EOL.engine,
      A = window.EOL.ai;
    var B = E.createBattle(t1, t2, {
      rng: rng32(seed),
      roleAware: true,
      simulation: true,
      field: null,
    });
    /* Never let a probe reach the telemetry hook: sim harnesses and the
       battle UI both listen on it, and a rating run is not a game. */
    B.silent = true;
    var steps = 0;
    while (!B.over && B.round <= PROBE.roundCap && steps++ < 600) {
      var side = E.advanceAction(B);
      if (!side) {
        if (!B.over) E.nextRound(B);
        continue;
      }
      var act = A.bestAction(B, side);
      if (!act) {
        E.passTurn(B, side);
        continue;
      }
      var res = E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
      if (!res.ok) B.acted[side][act.unit.uid] = true;
    }
    var mine = 0,
      theirs = 0;
    B.units.forEach(function (u) {
      var f = u.alive ? (u.hp + u.shield) / u.maxHp : 0;
      if (u.side === 'player') mine += f;
      else theirs += f;
    });
    return (mine - theirs) / FIELD;
  }

  /* Borrow the AI, then hand it back exactly as it was. The search
     depth and rollout budget are module-level globals in js/ai.js, so
     a probe that forgot to restore them would quietly play the rest of
     the session - or the rest of a sim run - at depth 1. */
  function withProbeAI(fn) {
    var A = window.EOL.ai;
    var depth = A.SEARCH_DEPTH;
    var budget = A.simulationBudget ? A.simulationBudget() : null;
    var hook = window.EOL.onBattleEvent;
    window.EOL.onBattleEvent = null;
    A.setDepth(PROBE.depth);
    A.setSimulationBudget({
      beamWidth: PROBE.beam,
      pruneKeep: 1,
      minRollouts: PROBE.rollouts,
      maxRollouts: PROBE.rollouts,
      /* Deliberately unreachable. js/ai.js cuts its rollout loops on
         WALL CLOCK, which is the right call for a player waiting on a
         turn and the wrong one for an instrument: with a real budget
         the same card measures differently on a fast machine, on a
         loaded machine, or on the second run of the same batch, and a
         rating that moves with CPU load is not a measurement. The work
         here is tiny and bounded anyway - a beam of two, one rollout,
         one ply - so nothing is being allowed to run away. */
      timeBudget: 600000,
    });
    try {
      return fn();
    } finally {
      window.EOL.onBattleEvent = hook;
      A.setDepth(depth);
      if (budget) A.setSimulationBudget(budget);
      else A.clearSimulationBudget();
    }
  }

  /* A job is a flat queue of SINGLE DUELS, not of cards.

     The unit matters. One duel costs ~45ms; one card is six of them
     (three seeds from both seats) and would be a third of a second of
     blocked main thread inside what is supposed to be an idle slice -
     a visible stutter. Stepping one duel at a time keeps the longest
     uninterruptible piece of work at about three frames, and lets a
     slice stop the moment the browser wants the thread back.

     BOTH SEATS. The sparring squad is identical on both sides, so the
     only asymmetry left in a duel is which side acts first - worth
     roughly a tenth of a team's health, which is more than the gap
     between a good card and a mediocre one. Playing the card from each
     seat and averaging the two signed results cancels that edge
     exactly, per card, rather than subtracting an average of it. It
     also removes the need for a separate mirror baseline: an equal
     shift applied to every card cannot change their order, and order
     is all §2 publishes. */
  function newJob() {
    var C = ctx();
    var control = ROLE_LIST.map(function (r) {
      return vanilla(r, C);
    });
    var work = [];
    C.cards.forEach(function (card) {
      PROBE.seeds.forEach(function (sd) {
        work.push({ card: card, seed: sd, seat: 0 });
        work.push({ card: card, seed: sd, seat: 1 });
      });
    });
    return {
      work: work,
      i: 0,
      control: control,
      sum: {},
      n: {},
      fp: fingerprint(C.cards),
    };
  }

  function squadWith(job, card) {
    var entry = { card: card, faction: { id: card.faction || '_x' } };
    var team = job.control.map(function (c) {
      return c.card.role === card.role ? entry : c;
    });
    if (team.indexOf(entry) < 0) team[0] = entry; // a role the squad lacks
    return team;
  }

  /* One duel. Returns true when the whole job is finished. */
  function jobStep(job) {
    if (job.i >= job.work.length) return true;
    var w = job.work[job.i++];
    var team = squadWith(job, w.card);
    var v =
      w.seat === 0
        ? duel(team, job.control, w.seed)
        : -duel(job.control, team, w.seed);
    var id = w.card.id;
    job.sum[id] = (job.sum[id] || 0) + (isFinite(v) ? v : 0);
    job.n[id] = (job.n[id] || 0) + 1;
    return job.i >= job.work.length;
  }

  /* Put the finished measurements onto the same z-scale the rest of the
     module is calibrated for, and publish them as one atomic swap. */
  function finishJob(job) {
    var ids = Object.keys(job.sum);
    var vals = ids.map(function (id) {
      return job.sum[id] / (job.n[id] || 1);
    });
    var z = rankNormal(vals);
    var out = {};
    ids.forEach(function (id, i) {
      out[id] = round2(z[i]);
    });
    MEASURED = out;
    writeCache(job.fp, out);
    measuring = null;
    return out;
  }

  /* SYNCHRONOUS. For sims, tests and tooling - it blocks for seconds.
     Never call it from the client; measureInBackground is the browser
     path. */
  function measureNow() {
    if (!engineReady()) return null;
    return withProbeAI(function () {
      var job = newJob();
      var guard = 0;
      while (!jobStep(job) && guard++ < 100000);
      return finishJob(job);
    });
  }

  /* BACKGROUND. A duel or two per idle slice, and only while the client
     is idle: a probe is a real battle simulation and must never compete
     with an animating board for the main thread. */
  function schedule(cb) {
    if (typeof window.requestIdleCallback === 'function') {
      /* A long timeout on purpose. requestIdleCallback's timeout is a
         promise to run the callback EVEN IF the browser is busy, and a
         probe duel is ~45ms of blocking work - forcing that through a
         loading screen or a view transition is exactly the stutter this
         whole scheduler exists to avoid. Ten seconds is short enough to
         guarantee the job finishes on a page nobody is touching and
         long enough that it never elbows in front of an animation. */
      window.requestIdleCallback(cb, { timeout: 10000 });
      return true;
    }
    if (typeof window.setTimeout === 'function') {
      window.setTimeout(cb, 24);
      return true;
    }
    return false; // no scheduler (a node harness): stay on the estimate
  }
  /* Never measure over an animation. A battle board is the obvious one;
     the boot veil is the other, because DOMContentLoaded fires while
     the loading screen is still up and its assets are still arriving. */
  function busy() {
    try {
      if (document.body && document.body.dataset.view === 'battle') return true;
      var veil = document.getElementById('veil');
      return !!(veil && veil.classList.contains('on'));
    } catch (e) {
      return false;
    }
  }
  function measureInBackground() {
    /* `noScheduler` latches for a host with neither requestIdleCallback
       nor setTimeout - a node harness. Without it, powerOf would build
       and throw away a fresh job on every single call. */
    if (MEASURED || measuring || noScheduler || !engineReady()) return;
    var job = newJob();
    var cached = readCache(job.fp);
    if (cached) {
      MEASURED = cached;
      return;
    }
    measuring = job;
    var pump = function (deadline) {
      if (measuring !== job) return; // superseded by _rebuild
      if (busy()) {
        schedule(pump);
        return;
      }
      var done = false;
      withProbeAI(function () {
        /* Always one duel, so the job cannot stall on a browser that
           reports no idle time; more only while the browser says there
           is room for another whole one. */
        do {
          done = jobStep(job);
        } while (
          !done &&
          deadline &&
          deadline.timeRemaining &&
          deadline.timeRemaining() > 60
        );
      });
      if (done) finishJob(job);
      else if (!schedule(pump)) stall();
    };
    if (!schedule(pump)) stall();
    function stall() {
      noScheduler = true;
      measuring = null;
    }
  }

  /* ---------------------------------------------------------
     3b. PUBLIC: how strong is this card, on a z-scale?
     Coverage is total by construction - there is no table to miss.
     --------------------------------------------------------- */
  function powerOf(card) {
    if (!card || !card.id) return 0;
    /* Kick the measurement off the first time anyone asks. Boot order
       puts this file before js/engine.js, so it cannot start at load. */
    if (!MEASURED && !measuring) measureInBackground();
    if (MEASURED && MEASURED[card.id] != null) return MEASURED[card.id];
    var C = ctx();
    if (C.rating[card.id] != null) return C.rating[card.id];
    /* A card the roster has never seen (a campaign boss handed straight
       to the engine). Price it live rather than calling it average. */
    learn(card);
    C = ctx();
    return C.rating[card.id] == null ? 0 : C.rating[card.id];
  }

  /* ---------------------------------------------------------
     4. KEYWORD WEB - what each hero GIVES and what it WANTS
     --------------------------------------------------------- */
  function tags(card) {
    var C = ctx();
    if (!C.web[card.id]) {
      C.web[card.id] = scanTags(card);
    }
    return C.web[card.id];
  }

  function scanTags(c) {
    var gives = {};
    var wants = {};
    var a = c.ability || {};

    function cond(o) {
      if (!o) return;
      if (o.targetMarked || o.anyTargetMarked || o.anyEnemyMarked) wants.mark = 1;
      if (o.targetExposed) wants.exposed = 1;
      if (o.targetBurning) wants.burn = 1;
      if (o.targetHasDebuff || o.anyTargetDebuffed) wants.debuff = 1;
      if (o.targetShielded || o.selfShielded) wants.shield = 1;
      if (o.targetHasBuff) wants.enemyBuff = 1;
      if (o.selfEnergyAbove != null) wants.energy = 1;
      if (o.killedTarget || o.killedCountAtLeast != null) wants.kills = 1;
      if (o.targetHpBelow != null || o.targetHpBetween || o.targetHpOutside) gives.execute = 1;
      if (o.targetTaunting) wants.enemyTaunt = 1;
      if (o.targetBackRow) gives.reach = 1;
      if (o.anyAllyFallen) wants.deaths = 1;
    }

    function see(e) {
      if (!e || !e.k) return;
      if (e.k === 'mark') gives.mark = 1;
      if (e.k === 'exposed') gives.exposed = 1;
      if (e.k === 'burn') gives.burn = 1;
      if (e.k === 'shield') gives.shield = 1;
      if (e.k === 'taunt') gives.taunt = 1;
      if (e.k === 'untargetable') gives.untargetable = 1;
      if (e.k === 'heal' || e.k === 'revive') gives.heal = 1;
      if (e.k === 'revive') gives.revive = 1;
      if (e.k === 'cleanse') gives.cleanse = 1;
      if (e.k === 'counterStrike') gives.counter = 1;
      if (e.k === 'gainEnergy' || e.k === 'stealEnergy') gives.energy = 1;
      if (e.k === 'silence' || e.k === 'costMod' || e.k === 'drainEnergy' || e.k === 'drainTax')
        gives.denial = 1;
      if (e.k === 'consumeBuffs') gives.buffHate = 1;
      if (e.k === 'stat' && e.amt < 0) gives.debuff = 1;
      if (e.k === 'stat' && e.amt > 0 && (e.to === 'allies' || e.to === 'targets'))
        gives.buff = 1;
      if (e.k === 'dmg' && (e.to === 'enemies' || (e.count || 0) > 1)) gives.aoe = 1;
      if (e.k === 'consumeMark' || e.onlyMarked || e.ifTargetMarked || e.ifAttackerMarked)
        wants.mark = 1;
      if (e.ifTargetDebuffed) wants.debuff = 1;
      cond(e.if);
      cond(e.when);
      cond(e.cond);
      (e.ifMult || []).forEach(function (m) {
        cond(m.when);
      });
      walk(e.then);
      walk(e.other);
      walk(e.options);
      walk(e.effects);
      if (e.heads) walk(e.heads.effects);
      if (e.tails) walk(e.tails.effects);
    }
    function walk(list) {
      (list || []).forEach(see);
    }

    walk(a.spec && a.spec.effects);
    walk(a.passive && a.passive.effects);
    walk(a.passive && a.passive.onHit);

    if (a.spec && a.spec.target) {
      if (a.spec.target.pick === 'all') gives.aoe = 1;
      if (a.spec.target.row === 'back' || a.spec.target.backOnly) gives.reach = 1;
    }
    if (a.spec && a.spec.noPierceTax) gives.pierce = 1;

    /* passive triggers describe what a hero feeds on */
    var trigs = a.passive ? a.passive.triggers || [a.passive.trigger] : [];
    trigs.forEach(function (t) {
      if (t === 'allyDied') wants.deaths = 1;
      if (t === 'selfKilled' || t === 'teamKilled') wants.kills = 1;
      if (t === 'allyWarded') wants.shield = 1;
      if (t === 'allyStruckDebuffed') wants.debuff = 1;
      if (t === 'allyStruckExposed') wants.exposed = 1;
      if (t === 'alliedCastSkill') wants.casters = 1;
      if (t === 'wasAttacked' || t === 'selfAttacked' || t === 'incomingAbilityDamage')
        gives.punish = 1;
    });
    /* a hero that dies a lot feeds death-triggers; tanks tend to */
    if (c.role === 'Tank' || c.role === 'Bruiser') gives.deaths = 0.5;
    /* every damage role can pop a Mark / cash an Exposed */
    if (c.role === 'Sniper' || c.role === 'Caster' || c.role === 'Bruiser') gives.kills = 1;
    if (c.role === 'Sniper') gives.reach = 1;
    /* an expensive Active is a fat target for denial */
    if (a.type === 'Active' && (a.cost || 0) >= 45) wants.energy = 1;
    return { gives: gives, wants: wants };
  }

  /* How well does `cand` mesh with one existing team member? */
  var LINK_WEIGHT = {
    mark: 3.2,
    exposed: 2.8,
    burn: 2.4,
    debuff: 2.2,
    shield: 2.0,
    deaths: 1.8,
    kills: 1.6,
    energy: 1.4,
    enemyBuff: 1.2,
    casters: 1.2,
    heal: 0.8,
    cleanse: 0.8,
  };

  function pairSynergy(a, b) {
    var A = tags(a.card || a),
      B = tags(b.card || b);
    var s = 0;
    Object.keys(LINK_WEIGHT).forEach(function (k) {
      var w = LINK_WEIGHT[k];
      if (A.gives[k] && B.wants[k]) s += w * (A.gives[k] === 0.5 ? 0.5 : 1);
      if (B.gives[k] && A.wants[k]) s += w * (B.gives[k] === 0.5 ? 0.5 : 1);
    });
    return s;
  }

  /* ---------------------------------------------------------
     5. STRUCTURE - role coverage and front/back balance
     --------------------------------------------------------- */
  var ROLE_BIAS = {
    Tank: 1.4,
    Bruiser: 0.5,
    Sniper: 0.3,
    Caster: 0.2,
    Medic: 0.6,
    Controller: -0.6,
  };

  function structureScore(team, cand, size) {
    var counts = {};
    team.forEach(function (t) {
      counts[t.card.role] = (counts[t.card.role] || 0) + 1;
    });
    var role = cand.card.role;
    var have = counts[role] || 0;
    var slotsLeft = (size || 6) - team.length;
    var s = 0;

    if (role === 'Tank') s += have === 0 ? 9 : have === 1 ? 3.5 : -1;
    else if (role === 'Medic') s += have === 0 ? 6.5 : have === 1 ? 1.0 : -2.5;
    else {
      var dmg = (counts.Bruiser || 0) + (counts.Sniper || 0) + (counts.Caster || 0);
      s += dmg < 2 ? 4.5 : dmg < 3 ? 2.0 : 0.5;
    }
    s += ROLE_BIAS[role] == null ? 0 : ROLE_BIAS[role];
    s -= have * 1.1;

    if (slotsLeft <= 2 && role === 'Tank' && !counts.Tank) s += 5;
    if (slotsLeft <= 1 && role === 'Medic' && !counts.Medic) s += 4;

    var front = 0;
    team.forEach(function (t) {
      if (t.card.role === 'Tank' || t.card.role === 'Bruiser') front++;
    });
    var isFront = role === 'Tank' || role === 'Bruiser';
    if (isFront && front < 2) s += 2.2;
    if (isFront && front >= 3) s -= 1.5;
    return s;
  }

  /* ---------------------------------------------------------
     6. PUBLIC: value a candidate for MY team
     --------------------------------------------------------- */
  /* HOW LOUD IS SYNERGY ALLOWED TO BE.
     -------------------------------------------------------------
     This constant is the single most dangerous number in the module,
     and getting it wrong is what made the first version of this
     rewrite LOSE to the module it replaced, 71% to 29% over 235
     drafted games.

     The reason is arithmetic. `powerOf` is a z-score, so the strength
     term spans about +/-7 once weighted. Synergy was being SUMMED over
     every team-mate: eleven of them by the end of a twelve, up to ~9
     each. A term that reaches 60 sitting beside a term that reaches 7
     is not a tiebreaker, it is the whole decision - the bot was
     drafting keyword chains and letting the strong cards go.

     It went unnoticed for exactly one reason: in the module being
     replaced the same term was silently zero (see the header), so
     turning it on for the first time and rebalancing around it were
     the same change. Two fixes, both needed:

       1. MEAN, not sum. Synergy is now "how well does this fit" -
          a property of the fit, not of how many cards have been
          drafted so far. Summing made the term grow with team size,
          so late picks were scored on a different scale from early
          ones even though nothing about the cards had changed.
       2. A weight measured head-to-head rather than assumed.

     WHAT THE HEAD-TO-HEAD ACTUALLY SAYS, in full, because it is not the
     flattering answer. Same brain both sides, only this constant
     changed, 500 drafted games each (`sim/ab_draft.js --aSyn --bSyn`):

       0    vs 0.55    50.6% +/- 4.5   - no measurable difference
       0.55 vs 1.6     51.5% +/- 4.4   - 0.55 ahead, inside the noise

     So synergy at this volume is a TIEBREAKER and nothing more: it
     costs nothing, it wins nothing that can be measured at n=500, and
     turning it up starts to cost. All of this module's measurable edge
     comes from §2's rating, not from the keyword web. 0.55 is kept
     because it is the top of the flat region - it breaks ties between
     equally-rated cards in favour of the one that combos, which is the
     right tie-break and a visibly smarter draft - but anyone tempted
     to make it louder should read the two rows above first. */
  var SYNERGY_W = 0.55;

  function value(team, cand, opts) {
    opts = opts || {};
    var s = 0;
    s += powerOf(cand.card) * (opts.powerWeight == null ? 3.0 : opts.powerWeight);
    s += structureScore(team, cand, opts.size);
    /* NO FACTION BONUS. There used to be a flat +0.6 per same-faction
       team-mate here, and it was wrong twice over. Mechanically,
       faction is decoration: the engine reads it for nothing but the
       banner (grep `faction` in js/engine.js - it is stored on the unit
       and never consulted), so it cannot be worth points on its own.
       And whatever cohesion factions DO have is already in the keyword
       web, measured rather than asserted: same-faction pairs average
       0.77 on pairSynergy against 0.60 for cross-faction pairs, because
       a faction's heroes really do share themes. Paying for it twice,
       with a term that SUMMED to as much as +6.6 across a twelve, was
       the same scale defect the synergy weight below had - it made the
       bot chase banners over cards. */
    var syn = 0;
    team.forEach(function (t) {
      syn += pairSynergy(cand, t);
    });
    var w = opts.synergyWeight == null ? SYNERGY_W : opts.synergyWeight;
    if (team.length) s += w * (syn / team.length);
    var r = cand.card.rarity;
    s += r === 'legendary' ? 0.8 : r === 'epic' ? 0.4 : 0;
    return s;
  }

  /* ---------------------------------------------------------
     7. COUNTERS - does `threat` specifically punish `mine`?
     -------------------------------------------------------------
     This is the part the ban AI reasons with, and it is entirely
     read off the two cards' own definitions. Every clause is a
     concrete interaction the engine actually implements.
     --------------------------------------------------------- */
  function counterPressure(threat, mine) {
    var T = tags(threat.card || threat),
      M = tags(mine.card || mine);
    var tc = threat.card || threat,
      mc = mine.card || mine;
    var s = 0;

    /* they punish buffs, I am a buff/shield deck */
    if ((T.wants.enemyBuff || T.gives.buffHate) && (M.gives.shield || M.gives.buff)) s += 2.6;
    /* they strip energy or silence, and my payoff is an expensive Active */
    var cost = (mc.ability && mc.ability.cost) || 0;
    if (T.gives.denial && cost >= 45) s += 2.2;
    if (T.gives.denial && cost >= 60) s += 0.8;
    /* they cleanse, my plan is debuffs */
    if (T.gives.cleanse && (M.gives.debuff || M.gives.burn || M.gives.exposed)) s += 1.6;
    /* they reach the back line, I am a squishy back-liner */
    if (T.gives.reach && (mc.role === 'Caster' || mc.role === 'Medic' || mc.role === 'Sniper'))
      s += 1.5;
    /* they ignore Provoke, my plan is to body-block */
    if (T.gives.pierce && M.gives.taunt) s += 2.4;
    /* they execute, I am fragile */
    if (T.gives.execute && effHp(mc) < ctx().meanHp) s += 1.2;
    /* they go wide, I go tall - AoE punishes stacked front lines */
    if (T.gives.aoe && (mc.role === 'Tank' || mc.role === 'Bruiser')) s += 0.9;
    /* they out-heal, my plan is chip damage */
    if (T.gives.heal && M.gives.burn) s += 1.0;
    /* they counter-attack, I am a melee role that must connect */
    if (T.gives.counter && (mc.role === 'Bruiser' || mc.role === 'Tank')) s += 1.1;
    /* they punish being attacked, and I am the one attacking a lot */
    if (T.gives.punish && (mc.role === 'Bruiser' || mc.role === 'Sniper')) s += 0.6;
    /* they deny my healer specifically */
    if (T.gives.denial && mc.role === 'Medic') s += 0.9;
    return s;
  }

  /* Total pressure a candidate exerts on a whole roster. */
  function counterScore(threat, myTeam) {
    var s = 0;
    (myTeam || []).forEach(function (m) {
      s += counterPressure(threat, m);
    });
    return s;
  }

  /* ---------------------------------------------------------
     8. PUBLIC: how much do I want to DENY this to the opponent?
     Used for bans and for draft hate-picks.
     --------------------------------------------------------- */
  function denyValue(theirTeam, cand, myTeam) {
    var s = 0;
    /* raw strength is the biggest single term - ban the best card */
    s += powerOf(cand.card) * 4.2;
    /* What their existing roster would unlock with it, and how hard the
       card hits MY plan. Both are AVERAGED over the roster they are
       measured against, for the same reason value() averages: summed,
       they scale with deck size and drown the strength term, and a
       twelve is twice the roster a six is. Averaged, they answer the
       question actually being asked - "how much does this one card fit
       them, and how badly does it hurt me" - which is comparable
       between a ban phase (twelve) and a hate-pick (a partial six). */
    var others = (theirTeam || []).filter(function (t) {
      return t.card.id !== cand.card.id;
    });
    if (others.length) {
      var syn = 0;
      others.forEach(function (t) {
        syn += pairSynergy(cand, t);
      });
      s += 0.85 * (syn / others.length);
    }
    /* a card that hard-counters MY plan is worth removing - this is the
       "ban what beats me", and it reads both rosters, not a table */
    if (myTeam && myTeam.length) s += 0.7 * (counterScore(cand, myTeam) / myTeam.length);
    /* denying their only Tank / only Medic is disproportionately good */
    var role = cand.card.role;
    var n = (theirTeam || []).filter(function (t) {
      return t.card.role === role;
    }).length;
    if ((role === 'Tank' || role === 'Medic') && n <= 2) s += 2.4;
    return s;
  }

  /* ---------------------------------------------------------
     9. DRAFT LOOKAHEAD
     -------------------------------------------------------------
     A pack is opened, three cards are on the table, and whatever I
     leave behind my opponent chooses from. That is a one-ply game, and
     it is cheap enough to solve exactly instead of guessing:

        for each card X I could take:
           my gain  = value(X to me)
           their reply = the best of what is LEFT, valued for THEM
           score(X) = my gain - regret * their reply

     So the bot stops taking a marginal upgrade when doing so hands
     over a bomb, and it stops hate-drafting when the hate pick costs
     more than it denies. `predictPick` is exported so callers (and
     tests) can ask the same question directly.
     --------------------------------------------------------- */
  function predictPick(team, offered, foeTeam, opts) {
    opts = opts || {};
    var size = opts.size || 12;
    var best = null,
      bestV = -Infinity;
    (offered || []).forEach(function (e) {
      var v = value(team, e, { size: size });
      /* averaged, for the same reason denyValue averages */
      if (opts.counterWeight && foeTeam && foeTeam.length)
        v += (counterScore(e, foeTeam) / foeTeam.length) * opts.counterWeight;
      if (v > bestV) {
        bestV = v;
        best = e;
      }
    });
    return { pick: best, value: bestV === -Infinity ? 0 : bestV };
  }

  function pickFromPack(team, offered, foeTeam, opts) {
    opts = opts || {};
    var size = opts.size || 12;
    var regret = opts.regret == null ? 0.55 : opts.regret;
    var legal = (offered || []).filter(function (e) {
      return !opts.illegal || !opts.illegal(e);
    });
    if (!legal.length) legal = (offered || []).slice();
    if (!legal.length) return null;

    var best = legal[0],
      bestScore = -Infinity;
    legal.forEach(function (e) {
      /* what this card is worth to me, including what it does TO them */
      var mine = value(team, e, { size: size });
      if (foeTeam && foeTeam.length)
        mine += (counterScore(e, foeTeam) / foeTeam.length) * 0.35;

      /* what the opponent takes from what I leave behind */
      var left = legal.filter(function (x) {
        return x !== e;
      });
      var reply = predictPick(foeTeam || [], left, team, { size: size, counterWeight: 0.35 });

      var score = mine - regret * reply.value;
      if (opts.jitter) score += Math.random() * opts.jitter;
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    });
    return best;
  }

  return {
    value: value,
    denyValue: denyValue,
    pairSynergy: pairSynergy,
    powerOf: powerOf,
    tags: tags,
    structureScore: structureScore,
    counterPressure: counterPressure,
    counterScore: counterScore,
    predictPick: predictPick,
    pickFromPack: pickFromPack,
    learn: learn,

    /* ---- the measured rating, as an explicit surface ----
       `warm()` is the polite call: it starts the background job if
       there is nothing cached and returns immediately. The client
       makes it once at boot so the roster is already rated by the time
       anyone opens a draft. */
    warm: measureInBackground,
    /* Blocks for seconds. Sims, tests and tooling only. */
    measureNow: measureNow,
    /* 'cached' | 'measuring' | 'estimated' - what powerOf is answering
       from right now. Useful in a test, and honest in a debug panel. */
    ratingSource: function () {
      return MEASURED ? 'cached' : measuring ? 'measuring' : 'estimated';
    },

    /* introspection for sims and tuning - not used by the game */
    _impact: function (card) {
      return ctx().impact[card.id];
    },
    _rebuild: function () {
      CACHE = null;
      MEASURED = null;
      measuring = null;
      noScheduler = false;
    },
  };
})();
