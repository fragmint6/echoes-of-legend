/* =============================================================
   GATE I LINE GENERATOR - the scripted first match
   -------------------------------------------------------------
   The whole of gate I's battle is a PRE-COMPUTED line: every move
   on both sides, replayed in the browser under the same seeded
   rng (js/battle.js scripted-match layer). This tool generates
   that line against the REAL engine:

     - exact same setup as the browser: starter twelve, script
       bans, the ledger's six in click order, botSix enemy,
       Colosseum, oddFirst 'player', mulberry32 seed;
     - player policy: teach-by-doing (round 1 basics, then every
       signature in curriculum order, focus fire, an honest pass);
     - enemy policy: the Recruiter measures - basics only, a
       capped number of actions per round, his medic patches;
     - searches seeds until the line is CLEAN: the player wins,
       all six signatures cast, no player hero dies, and the game
       lands in a teachable 4-7 rounds.

   Run:  node sim/gen_gate1_line.js          (prints the line)
   The frozen line lives in data/campaign-ch1.js (script.match);
   sim/verify_campaign.js REPLAYS it and fails if a balance patch
   ever knocks it off its rails.
   ============================================================= */
'use strict';

global.window = { EOL: {} };
require('../data/_schema.js');
require('../data/roles.js');
['camelot', 'duat', 'grimmwood', 'huaxia', 'olympus', 'roma', 'sherwood', 'takamagahara', 'yamato'].forEach(
  function (f) {
    require('../data/' + f + '.js');
  }
);
require('../data/battlefields.js');

var EOL = window.EOL;
var E = null;

function mulberry(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var dict = {};
EOL.factions.forEach(function (f) {
  f.cards.forEach(function (c) {
    dict[c.id] = { card: c, faction: f };
  });
});

/* click order in the scripted prep -> front [ginger,bbw,piper], back [snow,eq,gold] */
var PLAYER_SIX = [
  'grimmwood-gingerbread-man',
  'grimmwood-big-bad-wolf',
  'grimmwood-pied-piper',
  'grimmwood-snow-white',
  'grimmwood-evil-queen',
  'grimmwood-goldilocks',
];
var ENEMY_SIX = [
  'grimmwood-gingerbread-man',
  'grimmwood-red-riding-hood',
  'grimmwood-goldilocks',
  'grimmwood-pied-piper',
  'grimmwood-rapunzel',
  'grimmwood-snow-white',
];
/* the curriculum: cheap multi-target first, the wall, the healer, the
   teeth, the rifle, the storm - one lesson per signature */
var SIG_ORDER = [
  'grimmwood-pied-piper',
  'grimmwood-gingerbread-man',
  'grimmwood-snow-white',
  'grimmwood-big-bad-wolf',
  'grimmwood-goldilocks',
  'grimmwood-evil-queen',
];

function unitsOf(B, side) {
  return B.units.filter(function (u) {
    return u.side === side && u.alive;
  });
}
function byId2(B, side, id) {
  return B.units.filter(function (u) {
    return u.side === side && u.card.id === id && u.alive;
  })[0];
}
function tRef(u) {
  return { side: u.side, id: u.card.id };
}

function playLine(seed, opt) {
  opt = opt || {};
  var ENEMY_CAP = opt.enemyCap || 3;
  var R1_ACTS = opt.r1Acts || 3;
  var HEAL_AT = opt.healAt || 0.75;
  var SIGS = opt.sigOrder || SIG_ORDER;
  delete require.cache[require.resolve('../js/engine.js')];
  require('../js/engine.js');
  E = EOL.engine;
  var player = PLAYER_SIX.map(function (id) {
    return dict[id];
  });
  var enemy = E.optimizeFormation(
    ENEMY_SIX.map(function (id) {
      return dict[id];
    })
  );
  var B = E.createBattle(player, enemy, {
    roleAware: false,
    field: EOL.battlefieldById('colosseum'),
    rng: mulberry(seed),
    oddFirst: 'player',
  });

  var moves = [];
  var sigsCast = {};
  var pActs = 0; // player actions this round
  var eActs = 0;
  var round = B.round;
  var steps = 0;

  function record(side, u, ab, chosen, pass) {
    moves.push(
      pass
        ? { side: side, pass: true, r: B.round }
        : {
            side: side,
            unit: u.card.id,
            ability: ab.basic ? 'basic' : 'sig',
            targets: chosen.map(tRef),
            r: B.round,
          }
    );
  }
  function noteKills(before) {
    var mv = moves[moves.length - 1];
    if (!mv || mv.pass) return;
    var killed = before.filter(function (u) {
      return !u.alive;
    });
    if (killed.length)
      mv.killed = killed.map(function (u) {
        return u.side + ':' + u.card.id;
      });
  }

  function playerMove() {
    var side = 'player';
    var e15 = B.energy.player >= 15;
    /* 1. the next signature in the curriculum, when affordable + legal */
    for (var k = 0; k < SIGS.length; k++) {
      var id = SIGS[k];
      if (sigsCast[id]) continue;
      var u = byId2(B, 'player', id);
      if (!u || B.acted.player[u.uid]) continue;
      var sig = u.card.ability;
      if (sig.type !== 'Active') continue;
      if (!E.canUse(B, u, sig)) break; // wait for it - the curriculum has an order
      var need = E.pickCount(sig);
      var pool = E.legalTargets(B, u, sig);
      if (pool.length < need) break;
      var chosen = [];
      if (need > 0) {
        var sorted = pool.slice().sort(function (a, b) {
          return a.hp - b.hp;
        });
        if (id === 'grimmwood-pied-piper') {
          /* the melody prefers the healthiest pair - debuffs on threats */
          sorted = pool.slice().sort(function (a, b) {
            return b.hp - a.hp;
          });
        }
        chosen = sorted.slice(0, need);
      }
      record(side, u, sig, chosen, false);
      E.useAbility(B, u, sig, chosen, 0);
      noteKills(chosen);
      sigsCast[id] = true;
      pActs++;
      return true;
    }
    /* 1b. curriculum done: keep closing with the damage signatures */
    if (
      Object.keys(sigsCast).length >= 6 &&
      B.energy.player >= 45
    ) {
      var closers = ['grimmwood-big-bad-wolf', 'grimmwood-goldilocks', 'grimmwood-evil-queen'];
      for (var c = 0; c < closers.length; c++) {
        var cu = byId2(B, 'player', closers[c]);
        if (!cu || B.acted.player[cu.uid]) continue;
        var cs = cu.card.ability;
        if (!E.canUse(B, cu, cs)) continue;
        var cn = E.pickCount(cs);
        var cp = E.legalTargets(B, cu, cs);
        if (cp.length < cn) continue;
        var cch =
          cn > 0
            ? cp
                .slice()
                .sort(function (x, y) {
                  return x.hp - y.hp;
                })
                .slice(0, cn)
            : [];
        record(side, cu, cs, cch, false);
        E.useAbility(B, cu, cs, cch, 0);
        noteKills(cch);
        pActs++;
        return true;
      }
    }
    /* 2. a basic: attackers focus the lowest-HP legal enemy */
    if (e15 && (B.round > 1 ? true : pActs < R1_ACTS)) {
      var order = [
        'grimmwood-big-bad-wolf',
        'grimmwood-goldilocks',
        'grimmwood-evil-queen',
        'grimmwood-pied-piper',
        'grimmwood-gingerbread-man',
      ];
      for (var i = 0; i < order.length; i++) {
        var a = byId2(B, 'player', order[i]);
        if (!a || B.acted.player[a.uid]) continue;
        var basic = E.roleAbility(a);
        if (!E.canUse(B, a, basic)) continue;
        var pool2 = E.legalTargets(B, a, basic);
        if (!pool2.length) continue;
        /* the lesson: kill the healer, then focus the lowest */
        var healer = pool2.filter(function (x) {
          return x.card.role === 'Medic';
        })[0];
        var tgt =
          healer ||
          pool2.slice().sort(function (x, y) {
            return x.hp - y.hp;
          })[0];
        record(side, a, basic, [tgt], false);
        E.useAbility(B, a, basic, [tgt], 0);
        noteKills([tgt]);
        pActs++;
        return true;
      }
      /* the healer patches when someone is hurt */
      var sw = byId2(B, 'player', 'grimmwood-snow-white');
      if (sw && !B.acted.player[sw.uid]) {
        var hurt = unitsOf(B, 'player')
          .filter(function (u2) {
            return u2.hp < u2.maxHp * HEAL_AT;
          })
          .sort(function (x, y) {
            return x.hp / x.maxHp - y.hp / y.maxHp;
          })[0];
        if (hurt) {
          var rb = E.roleAbility(sw);
          if (E.canUse(B, sw, rb)) {
            record(side, sw, rb, [hurt], false);
            E.useAbility(B, sw, rb, [hurt], 0);
            pActs++;
            return true;
          }
        }
      }
    }
    /* 3. pass - banking energy is also a move */
    record(side, null, null, null, true);
    E.passTurn(B, 'player');
    return true;
  }

  function enemyMove() {
    var side = 'enemy';
    var cap = typeof ENEMY_CAP === 'function' ? ENEMY_CAP(B.round) : ENEMY_CAP;
    if (eActs >= cap || B.energy.enemy < 15) {
      record(side, null, null, null, true);
      E.passTurn(B, 'enemy');
      return true;
    }
    /* his medic patches the most wounded ally below 65% */
    var sw = byId2(B, 'enemy', 'grimmwood-snow-white');
    if (sw && !B.acted.enemy[sw.uid]) {
      var hurt = unitsOf(B, 'enemy')
        .filter(function (u2) {
          return u2.hp < u2.maxHp * 0.65;
        })
        .sort(function (x, y) {
          return x.hp / x.maxHp - y.hp / y.maxHp;
        })[0];
      if (hurt) {
        var rb = E.roleAbility(sw);
        if (E.canUse(B, sw, rb)) {
          record(side, sw, rb, [hurt], false);
          E.useAbility(B, sw, rb, [hurt], 0);
          eActs++;
          return true;
        }
      }
    }
    /* otherwise: front-first basics into whatever the taunts allow */
    var order = unitsOf(B, 'enemy')
      .filter(function (u2) {
        return u2.card.id !== 'grimmwood-snow-white';
      })
      .sort(function (a, b) {
        return a.slot - b.slot;
      });
    for (var i = 0; i < order.length; i++) {
      var a = order[i];
      if (B.acted.enemy[a.uid]) continue;
      var basic = E.roleAbility(a);
      if (!E.canUse(B, a, basic)) continue;
      var pool = E.legalTargets(B, a, basic);
      if (!pool.length) continue;
      var sortedP = pool.slice().sort(function (x, y) {
        return x.slot - y.slot;
      });
      /* spread: the Recruiter tests the whole line instead of
         executing one hero - that IS his character (he measures) */
      var tgt = opt.spread ? sortedP[(eActs + B.round) % sortedP.length] : sortedP[0];
      record(side, a, basic, [tgt], false);
      E.useAbility(B, a, basic, [tgt], 0);
      noteKills([tgt]);
      eActs++;
      return true;
    }
    record(side, null, null, null, true);
    E.passTurn(B, 'enemy');
    return true;
  }

  while (!B.over && B.round <= 10 && steps++ < 400) {
    var side = E.advanceAction(B);
    if (!side) {
      if (!B.over) {
        E.nextRound(B);
        pActs = 0;
        eActs = 0;
        round = B.round;
      }
      continue;
    }
    if (side === 'player') playerMove();
    else enemyMove();
  }

  var playerDeaths = 6 - unitsOf(B, 'player').length;
  return {
    seed: seed,
    win: B.winner === 'player',
    rounds: B.round,
    sigs: Object.keys(sigsCast).length,
    playerDeaths: playerDeaths,
    moves: moves,
    over: B.over,
  };
}

/* search: a clean line = win, all six sigs, zero player deaths, 4-7 rounds */
var capLate = function (r) {
  return r <= 2 ? 3 : 2;
};
var VARIANTS = [
  { enemyCap: capLate, r1Acts: 3, healAt: 0.8, spread: true },
  { enemyCap: 3, r1Acts: 3, healAt: 0.8, spread: true },
  { enemyCap: capLate, r1Acts: 2, healAt: 0.85, spread: true },
  { enemyCap: 3, r1Acts: 3, healAt: 0.75 },
  { enemyCap: 3, r1Acts: 2, healAt: 0.8 },
  { enemyCap: 4, r1Acts: 3, healAt: 0.8 },
  {
    enemyCap: 3,
    r1Acts: 3,
    healAt: 0.8,
    sigOrder: [
      'grimmwood-pied-piper',
      'grimmwood-gingerbread-man',
      'grimmwood-big-bad-wolf',
      'grimmwood-snow-white',
      'grimmwood-goldilocks',
      'grimmwood-evil-queen',
    ],
  },
];
var best = null;
var score = function (r) {
  if (!r.win) return -1000;
  return r.sigs * 10 - r.playerDeaths * 30 - Math.abs(5.5 - r.rounds) - r.moves.length * 0.05;
};
outer: for (var v = 0; v < VARIANTS.length; v++) {
  for (var s = 1; s <= 300; s++) {
    var r = playLine(s, VARIANTS[v]);
    r.variant = v;
    if (r.win && r.sigs === 6 && r.playerDeaths === 0 && r.rounds >= 4 && r.rounds <= 7) {
      best = r;
      break outer;
    }
    if (!best || score(r) > score(best)) best = r;
  }
}

console.log(
  'seed', best.seed, '| variant', best.variant, '| win', best.win, '| rounds', best.rounds,
  '| sigs', best.sigs, '| player deaths', best.playerDeaths, '| moves', best.moves.length
);

/* ---- attach the Recruiter's teaching lines to the key moves ---- */
var SIG_SAY = {
  'grimmwood-pied-piper':
    "Now the Piper. His melody takes TWO victims at once - pick both marked. It carves their ATK down, and anyone already wounded by a debuff is torn EXPOSED. Controllers do not kill; they decide who dies.",
  'grimmwood-gingerbread-man':
    'The Gingerbread Man now: Run, Run, Run. A shield, a Provoke, and he HEALS every time they strike him. That is a wall - danger now has an address.',
  'grimmwood-snow-white':
    'Snow White: Forest Blessing. The whole line healed, a debuff wiped from every ally. A Medic buys back the mistakes your courage keeps making.',
  'grimmwood-big-bad-wolf':
    'Unchain the Wolf: Savage Hunger. Two hundred percent, and he eats a share of what he deals - more if the victim is debuffed. The Piper seasons, the Wolf dines.',
  'grimmwood-goldilocks':
    "Goldilocks: Just Right. Targets in the middle of their health take her FULL wrath. Snipers do not open wars - they end arguments.",
  'grimmwood-evil-queen':
    'And the Queen: The Mirror Never Lies. Every enemy pays at once, and the proudest is stripped EXPOSED for two rounds. Casters are how you punish a crowd.',
};
var firstSig = {};
var saidPass = false;
var saidOpen = false;
var saidEnemyGuard = false;
var saidEnemyHeal = false;
var saidHealerKill = false;
best.moves.forEach(function (mv, i) {
  if (mv.side === 'player') {
    if (!saidOpen && !mv.pass && mv.ability === 'basic') {
      saidOpen = true;
      mv.say =
        'Open with the marked legend - a Basic. Cheap, honest work. Tap the legend, tap the skill, tap the marked victim.';
    }
    if (!mv.pass && mv.ability === 'sig' && !firstSig[mv.unit]) {
      firstSig[mv.unit] = true;
      mv.say = SIG_SAY[mv.unit] || null;
    }
    if (mv.pass && !saidPass) {
      saidPass = true;
      mv.say =
        'Now PASS - yes, on purpose. Unspent Energy carries over, and round two has expensive plans. Hoarding is a move.';
    }
    if (
      !saidHealerKill &&
      !mv.pass &&
      (mv.killed || []).indexOf('enemy:grimmwood-snow-white') >= 0
    ) {
      saidHealerKill = true;
      mv.say =
        'Their healer stands in your sights. End her. Wars shorten when nobody argues with your arithmetic.';
    }
  } else {
    if (
      !saidEnemyGuard &&
      !mv.pass &&
      mv.unit === 'grimmwood-gingerbread-man' &&
      mv.ability === 'basic'
    ) {
      saidEnemyGuard = true;
      mv.say =
        'My wall raises his shield and PROVOKES - watch your teeth get pulled toward him. Walls work both ways, Blank.';
    }
    if (!saidEnemyHeal && !mv.pass && mv.unit === 'grimmwood-snow-white') {
      saidEnemyHeal = true;
      mv.say =
        'My healer stitches the damage back. Remember the shape of that annoyance - and cure it at the source.';
    }
  }
});
/* one closing line on the final move */
for (var q = best.moves.length - 1; q >= 0; q--) {
  if (best.moves[q].side === 'player' && !best.moves[q].pass) {
    if (!best.moves[q].say) best.moves[q].say = 'Finish it. The ledger is waiting on my signature.';
    break;
  }
}

/* readable listing */
var lastR = 0;
best.moves.forEach(function (mv, i) {
  if (mv.r !== lastR) {
    lastR = mv.r;
    console.log('---- ROUND ' + mv.r + ' ----');
  }
  console.log(
    ('  ' + i).slice(-4),
    mv.side === 'player' ? 'YOU  ' : 'FOE  ',
    mv.pass
      ? 'PASS'
      : mv.ability.toUpperCase() +
          ' ' +
          mv.unit.replace('grimmwood-', '') +
          ' -> ' +
          (mv.targets || [])
            .map(function (t) {
              return t.side.slice(0, 1) + ':' + t.id.replace('grimmwood-', '');
            })
            .join(', ') +
          ((mv.killed || []).length ? '  KILLS ' + mv.killed.join(',') : ''),
    mv.say ? ' [say]' : ''
  );
});

/* frozen snippet for data/campaign-ch1.js (r/killed stripped - the
   browser only needs the moves) */
var lean = best.moves.map(function (mv) {
  var o = { side: mv.side };
  if (mv.pass) o.pass = true;
  else {
    o.unit = mv.unit;
    o.ability = mv.ability;
    o.targets = mv.targets;
  }
  if (mv.say) o.say = mv.say;
  return o;
});
require('fs').writeFileSync(
  '/tmp/gate1_line.json',
  JSON.stringify({ seed: best.seed, moves: lean }, null, 0)
);
console.log('frozen line -> /tmp/gate1_line.json (seed ' + best.seed + ')');
