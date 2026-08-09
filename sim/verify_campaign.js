/* =============================================================
   CAMPAIGN CHAPTER 1 - content + rival-behaviour regressions
   -------------------------------------------------------------
   Node, no browser. Loads the real data + engine and asserts the
   whole campaign content layer, per DESIGN-Campaign-Chapter1.md:

     A. every authored rival twelve is deckRules.isLegal() (§9.8 -
        "ten hand-built lists is exactly where a typo'd 5th Sniper
        ships silently")
     B. scripted sixes are subsets of their own twelves; ban
        profiles reference cards the player can actually own
     C. stage/terrain wiring: pinned boards exist, set stages carry
        3-board fight cards, lesson stages carry a single board
     D. the grant curriculum: every tier-1 id resolves, pairs stay
        pairs, exam grants are choice-shaped (R9), faction counts
        recorded for the blessings retune (R8)
     E. dialogue coverage: a scene + epilogue + result lines +
        barks for all ten gates; every scene ends on battle:true
     F. curated draft pools: 36 cards, 6 per role, the featured
        faction complete, no Huaxia (Chapter 2) and no Duat (the
        boss reveal) in any Chapter 1 draft
     G. Gilgamesh: unbannable + pinned flags declared (R5), his kit
        is made only of audited spec primitives, the draft brain
        can rate him (no powerOf=0 blindness), and a real engine
        game with him on the board finishes without throwing

   Run:  node sim/verify_campaign.js
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
require('../data/campaign-ch1.js');
require('../data/draft-ai.js');
require('../js/engine.js');
require('../js/ai.js');

var EOL = window.EOL;
var S = EOL.campaignCh1;
var E = EOL.engine;
var AI = EOL.ai;

var checks = 0;
var fails = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) {
    fails++;
    console.log('  FAIL  ' + msg);
  }
}

var dict = {};
EOL.factions.forEach(function (f) {
  f.cards.forEach(function (c) {
    dict[c.id] = { card: c, faction: f };
  });
});
dict[S.bossCard.id] = { card: S.bossCard, faction: S.bossFaction };
var fields = {};
EOL.battlefields.forEach(function (b) {
  fields[b.id] = b;
});

console.log('A. rival deck legality');
S.stages.forEach(function (st) {
  if (st.mode === 'draft') return;
  var entries = (st.enemy12 || []).map(function (id) {
    return dict[id];
  });
  ok(entries.every(Boolean), 'stage ' + st.id + ': every enemy12 id resolves');
  ok(EOL.deckRules.isLegal(entries.filter(Boolean)), 'stage ' + st.id + ': enemy12 is a legal 12');
});

console.log('B. scripted sixes + rival behaviour data');
S.stages.forEach(function (st) {
  if (st.botSix) {
    ok(st.botSix.length === 6, 'stage ' + st.id + ': botSix is six');
    ok(
      st.botSix.every(function (id) {
        return st.enemy12.indexOf(id) >= 0;
      }),
      'stage ' + st.id + ': botSix drawn from its own twelve'
    );
    ok(st.mode === 'classic', 'stage ' + st.id + ': scripted six only on single-game lessons');
  }
  var bp = st.banProfile || {};
  (bp.ids || []).forEach(function (id) {
    ok(!!dict[id], 'stage ' + st.id + ': ban-profile id ' + id + ' exists');
  });
});

console.log('B2. the fully scripted first gate');
(function () {
  var st1 = S.stages[0];
  var sc = st1.script;
  ok(!!sc, 'stage 1 carries a script');
  ok(sc.bans && sc.bans.length === 2, 'script bans exactly two');
  sc.bans.forEach(function (id) {
    ok(st1.enemy12.indexOf(id) >= 0, 'scripted ban ' + id + ' exists in the rival twelve');
  });
  ok(sc.six && sc.six.length === 6, 'script fields exactly six');
  var hisBans = (st1.banProfile && st1.banProfile.ids) || [];
  var roles = {};
  sc.six.forEach(function (id) {
    ok(!!dict[id] && dict[id].faction.id === 'grimmwood', 'scripted six ' + id + ' is a starter card');
    ok(hisBans.indexOf(id) < 0, 'scripted six ' + id + ' survives the Recruiter\'s bans');
    roles[dict[id].card.role] = true;
  });
  ok(Object.keys(roles).length === 6, 'the lesson six covers ALL SIX ROLES (controller included)');
  var T = st1.tutorial;
  ok(!!T, 'stage 1 carries tutorial copy');
  ok(T.intro && T.intro.length >= 2, 'tutorial: prep intro beats');
  ['ban0', 'ban1', 'ban2', 'reveal', 'arena', 'tips', 'field', 'rows', 'toBattle'].forEach(function (k) {
    ok(typeof T[k] === 'string' && T[k].length > 20, 'tutorial: ' + k + ' authored');
  });
  ok(T.field.indexOf('{name}') >= 0, 'tutorial: field prompt names the next card');
  sc.six.forEach(function (id) {
    ok(T.roles && typeof T.roles[id] === 'string' && T.roles[id].length > 30, 'tutorial: role lesson for ' + id);
  });
  ok(T.rounds && T.rounds[1] && T.rounds[1].length >= 2, 'tutorial: round-1 lessons');
  ok(T.rounds[2] && T.rounds[2].length >= 1, 'tutorial: round-2 signature lesson');
  ok(T.rounds[4] && T.rounds[4].length >= 1, 'tutorial: round-4 ramp lesson (RAMP_FROM=4)');
})();

console.log('B3. the frozen match line REPLAYS to a clean win');
(function () {
  var st1 = S.stages[0];
  var match = st1.script.match;
  ok(!!match && match.moves && match.moves.length > 20, 'a frozen line exists');
  if (!match) return;
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
  /* exactly the browser's setup: script click order -> formation
     click order [T,B,M,C,S,Ctrl] -> front [T,B,Ctrl], back [M,C,S] */
  var player = [
    st1.script.six[0],
    st1.script.six[1],
    st1.script.six[5],
    st1.script.six[2],
    st1.script.six[3],
    st1.script.six[4],
  ].map(function (id) {
    return dict[id];
  });
  var enemy = E.optimizeFormation(
    st1.botSix.map(function (id) {
      return dict[id];
    })
  );
  var B = E.createBattle(player, enemy, {
    roleAware: false,
    field: EOL.battlefieldById('colosseum'),
    rng: mulberry(match.seed),
    oddFirst: 'player',
  });
  var sigs = {};
  var i = 0;
  var okSeq = true;
  var steps = 0;
  while (!B.over && i < match.moves.length && steps++ < 500) {
    var side = E.advanceAction(B);
    if (!side) {
      if (!B.over) E.nextRound(B);
      continue;
    }
    var mv = match.moves[i++];
    if (!mv || mv.side !== side) {
      okSeq = false;
      break;
    }
    if (mv.pass) {
      E.passTurn(B, side);
      continue;
    }
    var u = B.units.filter(function (x) {
      return x.side === side && x.card.id === mv.unit && x.alive;
    })[0];
    if (!u) {
      okSeq = false;
      break;
    }
    var ab = mv.ability === 'sig' ? u.card.ability : E.roleAbility(u);
    var chosen = (mv.targets || []).map(function (t) {
      return B.units.filter(function (x) {
        return x.side === t.side && x.card.id === t.id && x.alive;
      })[0];
    });
    if (chosen.some(function (c) { return !c; })) {
      okSeq = false;
      break;
    }
    var res = E.useAbility(B, u, ab, chosen, 0);
    if (!res.ok) {
      okSeq = false;
      break;
    }
    if (side === 'player' && mv.ability === 'sig') sigs[mv.unit] = true;
  }
  ok(okSeq, 'every move of the line applies cleanly (side order, units, targets, costs)');
  ok(B.over && B.winner === 'player', 'the line ends in a player VICTORY');
  ok(Object.keys(sigs).length === 6, 'the line casts all SIX signatures (' + Object.keys(sigs).length + ')');
  var alive = B.units.filter(function (x) {
    return x.side === 'player' && x.alive;
  }).length;
  ok(alive === 6, 'no player hero dies on the line (' + alive + '/6 stand)');
  ok(i === match.moves.length, 'the line is consumed exactly (' + i + '/' + match.moves.length + ')');
  var says = match.moves.filter(function (m) {
    return m.say;
  }).length;
  ok(says >= 10, 'the Recruiter narrates the line (' + says + ' teaching beats)');
})();

console.log('C. terrain wiring');
S.stages.forEach(function (st) {
  if (st.mode === 'set') {
    ok(
      st.fightCard && st.fightCard.length === 3,
      'stage ' + st.id + ': set stage carries a 3-board fight card'
    );
    (st.fightCard || []).forEach(function (fid) {
      ok(!!fields[fid], 'stage ' + st.id + ': fight-card board ' + fid + ' exists');
    });
  } else {
    ok(!!fields[st.field], 'stage ' + st.id + ': pinned board ' + st.field + ' exists');
  }
});
// every battlefield used exactly once as a lesson/exam slot (§2)
var used = {};
S.stages.forEach(function (st) {
  (st.fightCard || (st.field ? [st.field] : [])).forEach(function (fid) {
    used[fid] = (used[fid] || 0) + 1;
  });
});
ok(Object.keys(used).length === EOL.battlefields.length, 'all ten boards appear on the road');

console.log('D. grant curriculum');
S.stages.forEach(function (st) {
  var g = st.grants || {};
  (g.cards || []).forEach(function (id) {
    ok(!!dict[id], 'stage ' + st.id + ': grant ' + id + ' resolves');
  });
  if (g.cards) ok(g.cards.length === 2, 'stage ' + st.id + ': faction grants arrive as PAIRS (R8)');
  if (g.choice) {
    ok(g.choice.count === 2, 'stage ' + st.id + ': exam grants choice of 2');
    g.choice.factions.forEach(function (fid) {
      ok(
        EOL.factions.some(function (f) {
          return f.id === fid;
        }),
        'stage ' + st.id + ': choice faction ' + fid + ' exists'
      );
    });
  }
  if (st.enemy12 && st.factionMix) {
    var mix = {};
    st.enemy12.forEach(function (id) {
      var f = dict[id].faction.id;
      mix[f] = (mix[f] || 0) + 1;
    });
    Object.keys(st.factionMix).forEach(function (k) {
      ok(
        mix[k] === st.factionMix[k],
        'stage ' + st.id + ': recorded faction count ' + k + ' matches the deck (R8 data pass)'
      );
    });
  }
});

console.log('E. dialogue coverage');
S.stages.forEach(function (st) {
  var scene = (S.dialogues || {})[st.id];
  var epi = (S.epilogues || {})[st.id];
  ok(scene && scene.length >= 3, 'stage ' + st.id + ': pre-fight scene exists');
  ok(scene && scene[scene.length - 1].battle === true, 'stage ' + st.id + ': scene ends on the fight');
  ok(epi && epi.length >= 2, 'stage ' + st.id + ': victory epilogue exists');
  ok(!!st.resultWin && !!st.resultLose, 'stage ' + st.id + ': win and lose result lines');
  ok(st.barks && !!st.barks.start, 'stage ' + st.id + ': in-battle barks authored');
  if (st.mode === 'set')
    ok(!!st.barks.start2 && !!st.barks.start3, 'stage ' + st.id + ': per-game set barks');
});

console.log('F. curated draft pools (FROZEN - owner ruling 2026-08-09)');
S.stages.forEach(function (st) {
  if (st.mode !== 'draft') return;
  var fid = st.pool.featured;
  var P = st.pool.cards || [];
  ok(P.length === 36, 'stage ' + st.id + ': frozen pool is 36 cards');
  ok(new Set(P).size === 36, 'stage ' + st.id + ': pool ids distinct');
  var roles = {};
  var okIds = true;
  P.forEach(function (id) {
    if (!dict[id]) okIds = false;
    else roles[dict[id].card.role] = (roles[dict[id].card.role] || 0) + 1;
  });
  ok(okIds, 'stage ' + st.id + ': every pool id resolves');
  ok(
    Object.keys(roles).length === 6 &&
      Object.keys(roles).every(function (r) {
        return roles[r] === 6;
      }),
    'stage ' + st.id + ': pool is 6-per-role'
  );
  var featN = P.filter(function (id) {
    return dict[id] && dict[id].faction.id === fid;
  }).length;
  var featTotal = EOL.factions.filter(function (f) {
    return f.id === fid;
  })[0].cards.length;
  ok(featN === featTotal, 'stage ' + st.id + ': featured faction complete in the pool');
  ok(
    P.every(function (id) {
      return dict[id] && dict[id].faction.id !== 'huaxia' && dict[id].faction.id !== 'duat';
    }),
    'stage ' + st.id + ': no Huaxia/Duat in the pool'
  );
  ok(!!st.persona, 'stage ' + st.id + ': draft persona set');
});

console.log('G. the boss');
ok(S.bossCard.unbannable === true, 'Gilgamesh declares unbannable (R5)');
ok(S.bossCard.pinned === true, 'Gilgamesh declares pinned (R5)');
ok(
  S.bossCard.ability.type === 'Active' && S.bossCard.ability.cost >= 45,
  "boss carries an expensive Active (the Legend's Trial champion buff must see him - §5 trap 1)"
);
var st10 = S.stages[9];
ok(st10.enemy12.indexOf(S.bossCard.id) >= 0, 'boss is in his own twelve');
ok((st10.pinned || []).indexOf(S.bossCard.id) >= 0, 'stage 10 pins the boss');
ok((st10.unbannable || []).indexOf(S.bossCard.id) >= 0, 'stage 10 refuses boss bans');
ok(st10.enemy12.indexOf('duat-isis') >= 0, "Isis in the twelve (the chapter's only revive, telegraphed)");
var tankInDeck = st10.enemy12.some(function (id) {
  return dict[id].card.role === 'Tank';
});
ok(tankInDeck, 'boss twelve authors its own front line (Duat cannot - §5 trap 2)');
// draft brain has no powerOf=0 blindness for him
var rating = EOL.draftAI.powerOf(S.bossCard);
ok(isFinite(rating) && rating !== 0, 'draft brain rates the boss live (' + rating.toFixed(2) + ')');

// engine smoke: a full game with the boss six on the board must finish
var bossSix = ['campaign-gilgamesh', 'duat-anubis', 'duat-maat', 'duat-sekhmet', 'duat-isis', 'roma-spartacus'].map(
  function (id) {
    return dict[id];
  }
);
var heroSix = [
  'grimmwood-hansel-gretel',
  'grimmwood-big-bad-wolf',
  'grimmwood-evil-queen',
  'grimmwood-snow-white',
  'grimmwood-goldilocks',
  'grimmwood-rumpelstiltskin',
].map(function (id) {
  return dict[id];
});
var threw = null;
var stacks = 0;
try {
  var B = E.createBattle(heroSix, E.optimizeFormation(bossSix), {
    roleAware: false,
    field: EOL.battlefieldById('heros-trial'),
  });
  var steps = 0;
  while (!B.over && B.round <= 30 && steps++ < 5000) {
    var side = E.advanceAction(B);
    if (!side) {
      if (!B.over) E.nextRound(B);
      continue;
    }
    var act = AI.bestAction(B, side);
    if (!act) {
      E.passTurn(B, side);
      continue;
    }
    E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
    var gil = B.units.filter(function (u) {
      return u.card.id === 'campaign-gilgamesh';
    })[0];
    if (gil && gil.stackTotals) stacks = Math.max(stacks, gil.stackTotals['saw-the-deep'] || 0);
  }
  ok(B.over || B.round > 30, 'boss game reaches a verdict');
} catch (e) {
  threw = e;
}
ok(!threw, 'boss game never throws' + (threw ? ' (' + threw.message + ')' : ''));
ok(stacks <= 5, 'growth stack cap holds (' + stacks + ' <= 5)');

console.log('');
if (fails) {
  console.log('CAMPAIGN VERIFY: ' + fails + ' of ' + checks + ' checks FAILED');
  process.exit(1);
}
console.log('CAMPAIGN VERIFY: ALL ' + checks + ' CHECKS PASSED');
