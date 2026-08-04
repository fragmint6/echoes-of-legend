/* =============================================================
   Echoes of Legend - Draft Intelligence
   -------------------------------------------------------------
   Shared brain for the three places the bot makes roster decisions:
   DRAFTING a pack, BANNING your deck, and FIELDING its six.

   The old `draftValue()` in battle.js knew three things: Mark links,
   faction clumping, and "do I have a Tank yet". It had no idea which
   heroes were actually strong, could not see any keyword except Mark,
   and never looked at the opponent. This module replaces it with:

     1. POWER      empirical per-hero strength, derived from the
                   5,000-game balance run (win-rate z-score). This is
                   measured, not guessed.
     2. SYNERGY    a full keyword web - Mark, Exposed, Burn, Shield,
                   debuff-payoff, death-trigger, energy economy - so
                   the bot can see combos beyond Marks.
     3. STRUCTURE  role coverage, front/back balance, and the measured
                   comp facts (2+ Tanks wins, 2+ Controllers loses).
     4. THREAT     for bans: what is strong in YOUR deck, what your
                   deck's synergies would enable, and what counters the
                   bot's own plan.

   Everything is data-driven off the card definitions, so new cards are
   picked up automatically; only POWER needs a refresh after a balance
   pass (regenerate from sim/results.json).
   ============================================================= */
window.EOL = window.EOL || {};

window.EOL.draftAI = (function () {
  'use strict';

  /* ---------------------------------------------------------
     1. POWER - measured hero strength (win-rate z-score)
     Regenerate after a balance pass:
       node -e "...z-score of A.heroes[id].wins/apps..."
     Range is roughly -1.8 (Cicero) to +2.0 (Spartacus).
     --------------------------------------------------------- */
  var POWER = {
    'camelot-guinevere': -1.63,
    'camelot-king-arthur': 1.15,
    'camelot-lancelot': 1.75,
    'camelot-merlin': -0.58,
    'camelot-mordred': -0.11,
    'camelot-morgan-le-fay': -0.15,
    'grimmwood-big-bad-wolf': -0.01,
    'grimmwood-hansel-gretel': 0.21,
    'grimmwood-pied-piper': -0.74,
    'grimmwood-red-riding-hood': 0.16,
    'grimmwood-rumpelstiltskin': -0.12,
    'grimmwood-snow-white': 1.96,
    'huaxia-guan-yu': -0.22,
    'huaxia-hua-tuo': 0.51,
    'huaxia-huang-zhong': -0.17,
    'huaxia-lu-bu': 0.31,
    'huaxia-mulan': 0.28,
    'huaxia-nezha': 0.6,
    'huaxia-qin-shi-huang': 1.29,
    'huaxia-sun-wukong': 0.64,
    'huaxia-zhuge-liang': -0.24,
    'olympus-apollo': -0.91,
    'olympus-ares': -1.1,
    'olympus-athena': -0.56,
    'olympus-hercules': 0,
    'olympus-medusa': -1,
    'olympus-zeus': -0.83,
    'roma-augustus': -0.47,
    'roma-brutus': 0.12,
    'roma-cicero': -1.78,
    'roma-constantine-the-great': -1.27,
    'roma-julius-caesar': -0.95,
    'roma-spartacus': 2.02,
    'sherwood-friar-tuck': -1.36,
    'sherwood-guy-of-gisborne': 1.31,
    'sherwood-little-john': 0.17,
    'sherwood-maid-marian': 1.93,
    'sherwood-robin-hood': -0.61,
    'sherwood-will-scarlet': -1.34,
    'takamagahara-amaterasu': 0.32,
    'takamagahara-inari': -1.32,
    'takamagahara-izanagi': -0.69,
    'takamagahara-izanami': 0.83,
    'takamagahara-susanoo': 1.95,
    'takamagahara-tsukuyomi': 0.23,
    'yamato-abe-no-seimei': -0.23,
    'yamato-benkei': 1.9,
    'yamato-kaguya': -1.28,
    'yamato-momotaro': 0.08,
    'yamato-tomoe-gozen': -0.48,
    'yamato-minamoto-no-yoshitsune': 0.44,
  };
  function powerOf(card) {
    var p = POWER[card.id];
    return p == null ? 0 : p;
  }

  /* ---------------------------------------------------------
     2. KEYWORD WEB - what each hero GIVES and what it WANTS
     Scanned from the card data so new heroes register themselves.
     --------------------------------------------------------- */
  var WEB = null;
  function tags(card) {
    if (!WEB) buildWeb();
    return WEB[card.id] || { gives: {}, wants: {} };
  }

  function buildWeb() {
    WEB = {};
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        var gives = {};
        var wants = {};
        var a = c.ability;

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
        }

        function see(e) {
          if (!e || !e.k) return;
          if (e.k === 'mark') gives.mark = 1;
          if (e.k === 'exposed') gives.exposed = 1;
          if (e.k === 'burn') gives.burn = 1;
          if (e.k === 'shield') gives.shield = 1;
          if (e.k === 'taunt') gives.taunt = 1;
          if (e.k === 'heal' || e.k === 'revive') gives.heal = 1;
          if (e.k === 'cleanse') gives.cleanse = 1;
          if (e.k === 'gainEnergy' || e.k === 'stealEnergy') gives.energy = 1;
          if (e.k === 'silence' || e.k === 'costMod' || e.k === 'drainEnergy' || e.k === 'drainTax')
            gives.denial = 1;
          if (e.k === 'stat' && e.amt < 0) gives.debuff = 1;
          if (e.k === 'stat' && e.amt > 0 && (e.to === 'allies' || e.to === 'targets'))
            gives.buff = 1;
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

        /* passive triggers describe what a hero feeds on */
        var trigs = a.passive ? a.passive.triggers || [a.passive.trigger] : [];
        trigs.forEach(function (t) {
          if (t === 'allyDied') wants.deaths = 1;
          if (t === 'selfKilled') wants.kills = 1;
          if (t === 'allyWarded') wants.shield = 1;
          if (t === 'allyStruckDebuffed') wants.debuff = 1;
          if (t === 'allyStruckExposed') wants.exposed = 1;
          if (t === 'alliedCastSkill') wants.casters = 1;
        });
        /* a hero that dies a lot feeds death-triggers; tanks tend to */
        if (c.role === 'Tank' || c.role === 'Bruiser') gives.deaths = 0.5;
        /* every damage role can pop a Mark / cash an Exposed */
        if (c.role === 'Sniper' || c.role === 'Caster' || c.role === 'Bruiser') {
          gives.kills = 1;
        }
        WEB[c.id] = { gives: gives, wants: wants };
      });
    });
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
    var A = tags(a),
      B = tags(b);
    var s = 0;
    Object.keys(LINK_WEIGHT).forEach(function (k) {
      var w = LINK_WEIGHT[k];
      // a gives what b wants
      if (A.gives[k] && B.wants[k]) s += w * (A.gives[k] === 0.5 ? 0.5 : 1);
      // b gives what a wants
      if (B.gives[k] && A.wants[k]) s += w * (B.gives[k] === 0.5 ? 0.5 : 1);
    });
    return s;
  }

  /* ---------------------------------------------------------
     3. STRUCTURE - role coverage, grounded in measured comp data
     From the 5,000-game run:
        2+ Tanks       57.1%   |  0 Tanks 37.5%
        2+ Controllers 45.1%   |  0 Controllers 56.1%
     So tanks are worth stacking and controllers are not.
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

    /* first Tank and first Medic are near-mandatory; a tankless six
       measured 37.5% */
    if (role === 'Tank') s += have === 0 ? 9 : have === 1 ? 3.5 : -1;
    else if (role === 'Medic') s += have === 0 ? 6.5 : have === 1 ? 1.0 : -2.5;
    else {
      var dmg = (counts.Bruiser || 0) + (counts.Sniper || 0) + (counts.Caster || 0);
      s += dmg < 2 ? 4.5 : dmg < 3 ? 2.0 : 0.5;
    }
    /* measured role bias */
    s += ROLE_BIAS[role] == null ? 0 : ROLE_BIAS[role];
    /* diminishing returns on stacking any one role */
    s -= have * 1.1;

    /* late-slot rails: never finish without a Tank or Medic if one is
       still available (checked by the caller via `forcedRole`) */
    if (slotsLeft <= 2 && role === 'Tank' && !counts.Tank) s += 5;
    if (slotsLeft <= 1 && role === 'Medic' && !counts.Medic) s += 4;

    /* front/back balance - the front row soaks, so a six of squishies
       collapses. Tanks/Bruisers hold the line. */
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
     PUBLIC: value a candidate for MY team
     --------------------------------------------------------- */
  function value(team, cand, opts) {
    opts = opts || {};
    var s = 0;
    s += powerOf(cand.card) * (opts.powerWeight == null ? 3.0 : opts.powerWeight);
    s += structureScore(team, cand, opts.size);
    team.forEach(function (t) {
      s += pairSynergy(cand, t);
      if (cand.faction.id === t.faction.id) s += 0.6; // flavour clump, minor
    });
    /* rarity is a weak prior for raw stat budget */
    var r = cand.card.rarity;
    s += r === 'legendary' ? 0.8 : r === 'epic' ? 0.4 : 0;
    return s;
  }

  /* ---------------------------------------------------------
     PUBLIC: how much do I want to DENY this to the opponent?
     Used for bans and for draft hate-picks.
     --------------------------------------------------------- */
  function denyValue(theirTeam, cand, myTeam) {
    var s = 0;
    /* raw strength is the biggest single term - ban the best card */
    s += powerOf(cand.card) * 4.2;
    /* what their existing roster would unlock with it */
    (theirTeam || []).forEach(function (t) {
      if (t.card.id === cand.card.id) return;
      s += pairSynergy(cand, t) * 0.85;
    });
    /* a card that hard-counters MY plan is worth removing */
    (myTeam || []).forEach(function (m) {
      s += counterPressure(cand, m) * 0.7;
    });
    /* denying their only Tank / only Medic is disproportionately good */
    var role = cand.card.role;
    var n = (theirTeam || []).filter(function (t) {
      return t.card.role === role;
    }).length;
    if ((role === 'Tank' || role === 'Medic') && n <= 2) s += 2.4;
    return s;
  }

  /* Does `threat` specifically punish `mine`? */
  function counterPressure(threat, mine) {
    var T = tags(threat),
      M = tags(mine);
    var s = 0;
    // they punish buffs and I rely on buffs/shields
    if (T.wants.enemyBuff && (M.gives.shield || M.gives.buff)) s += 2.6;
    // they strip/deny and I am expensive
    var cost = mine.card.ability.cost || 0;
    if (T.gives.denial && cost >= 45) s += 2.2;
    // they cleanse and I rely on debuffs
    if (T.gives.cleanse && M.gives.debuff) s += 1.6;
    // they out-range me: I am a front-liner, they hit the back
    if (T.gives.kills && (mine.card.role === 'Tank' || mine.card.role === 'Bruiser')) s += 0.4;
    return s;
  }

  return {
    value: value,
    denyValue: denyValue,
    pairSynergy: pairSynergy,
    powerOf: powerOf,
    tags: tags,
    structureScore: structureScore,
    _rebuild: function () {
      WEB = null;
    },
  };
})();
