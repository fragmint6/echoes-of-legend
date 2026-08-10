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
  /* the Recruiter's ledger (playtest ruling 2026-08-09): every gate
     after the scripted first one TELLS the player how its rival bans
     before they commit their own - the first call of a gate must not
     also be the blindest one. */
  if (st.id === 1) {
    ok(!st.banTell, 'stage 1: no ledger tell - the script narrates the bans itself');
  } else {
    ok(
      typeof st.banTell === 'string' && st.banTell.length > 20 && st.banTell.length < 200,
      'stage ' + st.id + ': ledger tell present and sized'
    );
    ok(
      /^[\x20-\x7E]+$/.test(st.banTell || ''),
      'stage ' + st.id + ': ledger tell is pure ASCII'
    );
  }
  /* THE BROKEN CLAIM: only the role-claim tells (2-4) make a
     falsifiable promise, so only they carry a correction line */
  if (st.id >= 2 && st.id <= 4) {
    ok(
      typeof st.banTellBroken === 'string' &&
        st.banTellBroken.length > 20 &&
        /^[\x20-\x7E]+$/.test(st.banTellBroken),
      'stage ' + st.id + ': the broken-claim correction is authored (ASCII)'
    );
    ok(
      !!(st.banProfile && (st.banProfile.roles || []).length),
      'stage ' + st.id + ': a correction only where a role CLAIM exists'
    );
  } else {
    ok(!st.banTellBroken, 'stage ' + st.id + ': hedged/absent tells never made a breakable promise');
  }
  /* THE LEDGER: every page carries the Recruiter's counsel */
  ok(
    typeof st.counsel === 'string' && st.counsel.length > 20 && /^[\x20-\x7E]+$/.test(st.counsel),
    'stage ' + st.id + ': ledger counsel authored (ASCII)'
  );
});

/* the ledger's one-time introduction line */
ok(
  typeof (S.guide || {}).ledger === 'string' &&
    S.guide.ledger.indexOf('LEDGER') >= 0 &&
    /^[\x20-\x7E]+$/.test(S.guide.ledger),
  'the ledger spotlight line is authored (ASCII, names the LEDGER)'
);

/* THE ECONOMY (owner ruling 2026-08-10): the chapter pays exactly
   1500 - the less the campaign gives, the more the other modes
   matter. Second ruling same day: a FLAT 150 per gate (no curve),
   and replays pay a flat 25 (enforced in campaign.js). */
var chapterCoins = 0;
S.stages.forEach(function (st) {
  chapterCoins += (st.grants || {}).coins || 0;
});
ok(chapterCoins === 1500, 'Chapter 1 pays exactly 1500 coins (' + chapterCoins + ')');
ok(
  S.stages.every(function (st) {
    return (st.grants || {}).coins === 150;
  }),
  'every gate pays the same flat 150'
);

/* THE RARITY LAW (owner ruling 2026-08-10): one legendary per six
   roster slots. 6-11 cards -> exactly 1; 12-17 -> exactly 2. */
console.log('B3. the rarity and crown laws');
EOL.factions.forEach(function (f) {
  var n = f.cards.filter(function (c) {
    return c.rarity === 'legendary';
  }).length;
  var want = f.cards.length >= 12 ? 2 : 1;
  ok(
    n === want,
    f.id + ': ' + f.cards.length + ' cards carry ' + want + ' legendary (' + n + ')'
  );
});

/* THE CROWN LAW: every OBTAINABLE non-Grimmwood legendary is granted
   by exactly one gate's Legend Pack - the campaign is the only mint.
   (Grimmwood's two are the starter set; Huaxia is Chapter 2 cargo.) */
(function () {
  var packs = [];
  S.stages.forEach(function (st) {
    if (st.grants && st.grants.legendPack) packs.push(st.grants.legendPack);
  });
  ok(packs.length === new Set(packs).size, 'no legendary is granted twice');
  var wanted = [];
  EOL.factions.forEach(function (f) {
    if (f.id === 'grimmwood' || f.id === 'huaxia') return;
    f.cards.forEach(function (c) {
      if (c.rarity === 'legendary') wanted.push(c.id);
    });
  });
  ok(
    wanted.length === packs.length &&
      wanted.every(function (id) {
        return packs.indexOf(id) >= 0;
      }),
    'every obtainable faction legendary rides exactly one Legend Pack (' +
      packs.length +
      ' of ' +
      wanted.length +
      ')'
  );
  /* and the shop's tables never name one */
  var shopSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'shop.js'),
    'utf8'
  );
  ok(
    !/\[\s*'legendary'\s*,\s*\d/.test(shopSrc),
    "no odds row in js/shop.js names 'legendary'"
  );
})();

/* THE VAULT REGISTRY (js/cloud.js): every persisted eol.* KEY constant
   in the codebase must be registered for cloud sync - a forgotten key
   fails here, not in a player's lost save. */
(function () {
  var fs = require('fs');
  var path = require('path');
  var cloudSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'cloud.js'), 'utf8');
  var registered = {};
  (cloudSrc.match(/'eol\.[^']+'/g) || []).forEach(function (m) {
    registered[m.slice(1, -1)] = true;
  });
  var exempt = {
    'eol.deck.v1': true, // legacy key, read-and-migrated only
    'eol.cloud.restored': true, // sessionStorage marker, per-boot
  };
  var missing = [];
  ['app.js', 'campaign.js', 'deck.js', 'economy.js', 'play.js', 'shop.js', 'battle.js'].forEach(
    function (f) {
      var src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
      (src.match(/_KEY = '(eol\.[^']+)'/g) || []).forEach(function (m) {
        var key = m.match(/'(eol\.[^']+)'/)[1];
        if (!registered[key] && !exempt[key] && missing.indexOf(key) < 0) missing.push(key);
      });
    }
  );
  ok(
    missing.length === 0,
    'every persisted key is registered in the vault' +
      (missing.length ? ' (missing: ' + missing.join(', ') + ')' : '')
  );
})();

/* THE SCALE LAW (js/app.js paintViewport): style.css must never name
   a raw viewport unit - under the root-zoom UI scale they resolve
   against the DEVICE window and get zoom-scaled on top, which is how
   the tutorial bubble family drifted at any scale but 100% (outside
   report 2026-08-10). Everything goes through var(--vw1)/--vh1/
   --dvh1/--vmax1; the only legal raw units are those four :root
   definitions themselves. */
(function () {
  var fs = require('fs');
  var css = fs.readFileSync(require('path').join(__dirname, '..', 'css', 'style.css'), 'utf8');
  css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // comments may SAY 100vh
  var hits = css.match(/[\d.]+(vw|vh|dvh|vmax|vmin)\b/g) || [];
  var legal = { '1vh': 1, '1dvh': 1, '1vw': 1, '1vmax': 1 };
  var rogue = hits.filter(function (h) {
    return !legal[h];
  });
  ok(
    rogue.length === 0,
    'style.css names no raw viewport units beyond the four :root vars' +
      (rogue.length ? ' (found ' + rogue.slice(0, 4).join(', ') + ')' : '')
  );
})();

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
  /* the post-handoff round-3 lessons (owner ruling 2026-08-10): read
     the sigils (and HOVER them), then the one-two - expose, execute */
  ok(
    Array.isArray((T.rounds || {})[3]) && T.rounds[3].length === 2,
    'tutorial: round-3 carries the status + combo lessons'
  );
  ok(
    /STATUS/i.test(T.rounds[3][0]) && /HOVER/.test(T.rounds[3][0]),
    'the status lesson teaches sigil-reading and the hover'
  );
  ok(/one-two/i.test(T.rounds[3][1]), 'the combo lesson preaches the one-two');
  ok(
    T.rounds[3].every(function (l) {
      return /^[\x20-\x7E]+$/.test(l);
    }),
    'round-3 lessons are pure ASCII'
  );
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
  ok(
    !!match && match.moves && match.moves.length >= 12 && match.moves.length <= 20,
    'a frozen OPENING exists (rounds 1-2 only - the handoff design)'
  );
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
  /* THE HANDOFF (2026-08-10): the line no longer plays the whole war.
     It ends at the top of round 3 with everyone standing and the
     player ahead - then the fight is free and the Recruiter only
     reacts. Verify the position, then finish the game with the AI on
     both sides (his live sig-moderation replicated) and demand the
     deterministic continuation still ends in a player victory. */
  ok(!B.over, 'the line ends with the war still LIVE (the handoff)');
  ok(
    B.round === 2 && E.roundComplete(B),
    'the ledger closes exactly as round 2 ends (round ' + B.round + ')'
  );
  ok(Object.keys(sigs).length === 2, 'the script itself teaches TWO signatures (Piper + Queen)');
  ok(sigs['grimmwood-pied-piper'] && sigs['grimmwood-evil-queen'], 'and they are the right two');
  var alive = B.units.filter(function (x) {
    return x.alive;
  }).length;
  ok(alive === 12, 'nobody has died when the ledger closes (' + alive + '/12 stand)');
  ok(i === match.moves.length, 'the line is consumed exactly (' + i + '/' + match.moves.length + ')');
  var says = match.moves.filter(function (m) {
    return m.say;
  }).length;
  ok(says >= 5, 'the Recruiter narrates the opening (' + says + ' teaching beats)');

  /* the free half: AI both sides, moderation on his signatures */
  var sigRound = -1;
  var contSteps = 0;
  while (!B.over && B.round <= 30 && contSteps++ < 4000) {
    var cSide = E.advanceAction(B);
    if (!cSide) {
      if (!B.over) E.nextRound(B);
      continue;
    }
    var act = AI.bestAction(B, cSide);
    if (cSide === 'enemy' && act && act.ability && !act.ability.basic) {
      var usedSig = sigRound === B.round;
      if (usedSig || B.rng() < 0.65) {
        var modBasic = E.roleAbility(act.unit);
        if (E.canUse(B, act.unit, modBasic)) {
          var modPool = E.legalTargets(B, act.unit, modBasic);
          if (modPool.length)
            act = { unit: act.unit, ability: modBasic, chosen: [modPool[0]], choose: 0 };
        }
      } else sigRound = B.round;
    }
    if (!act) {
      E.passTurn(B, cSide);
      continue;
    }
    E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
  }
  ok(B.over && B.winner === 'player', 'the free half still ends in a player VICTORY (AI floor)');

  /* the reaction layer's data: the four role lessons the script no
     longer scripts, plus the observations */
  var T1 = st1.tutorial || {};
  ok(typeof T1.handoff === 'string' && T1.handoff.length > 20, 'a handoff line exists');
  var rx = T1.reactions || {};
  ['Tank', 'Bruiser', 'Sniper', 'Medic'].forEach(function (r) {
    ok(
      rx.roles && typeof rx.roles[r] === 'string' && /^[\x20-\x7E]+$/.test(rx.roles[r]),
      'reaction: the ' + r + ' signature lesson survives the cut (ASCII)'
    );
  });
  ['enemyHeals', 'foeMedicDown', 'pass'].forEach(function (k) {
    ok(
      typeof rx[k] === 'string' && /^[\x20-\x7E]+$/.test(rx[k]),
      'reaction: ' + k + ' authored (ASCII)'
    );
  });
  /* the advised gate: stage 2 carries the Recruiter's silver counsel */
  var st2 = S.stages[1];
  ok(
    st2.advisor && typeof st2.advisor.ban === 'string' && typeof st2.advisor.six === 'string',
    'stage 2 is the ADVISED gate (ban + six counsel authored)'
  );
  ok(
    /^[\x20-\x7E]+$/.test(st2.advisor.ban + st2.advisor.six),
    'advisor counsel is pure ASCII'
  );
  S.stages.forEach(function (st) {
    if (st.id > 2) ok(!st.advisor, 'stage ' + st.id + ' is RELEASED - no advisor (do/advise/release)');
  });
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
    ok(
      dict[id].card.rarity !== 'legendary',
      'stage ' + st.id + ': named grants stay below legendary (crowns ride Legend Packs)'
    );
  });
  if (g.cards)
    ok(
      g.cards.length >= 1 && g.cards.length <= 2,
      'stage ' + st.id + ': faction grants arrive as one or two cards (R8, revised for Legend Packs)'
    );
  if (g.legendPack) {
    ok(!!dict[g.legendPack], 'stage ' + st.id + ': legend pack ' + g.legendPack + ' resolves');
    ok(
      dict[g.legendPack].card.rarity === 'legendary',
      'stage ' + st.id + ': the Legend Pack carries a LEGENDARY'
    );
  }
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

console.log('F. curated draft pools (progression-law rebuild, owner ruling 2026-08-10)');
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
  /* Under the progression law the pool draws only from introduced
     factions, so a strict 6-per-role is no longer possible (gate VI's
     five factions hold exactly 5 snipers and 4 casters). The real
     requirements: every role present, and enough breadth that both
     drafters can build legal twelves. */
  ok(
    Object.keys(roles).length === 6 &&
      Object.keys(roles).every(function (r) {
        return roles[r] >= 4;
      }),
    'stage ' + st.id + ': every role present in playable depth (4+)'
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

console.log('H. THE PROGRESSION LAW (owner ruling 2026-08-10)');
/* Factions enter the Road one gate at a time - Grimmwood at I,
   Camelot II, Sherwood III, Olympus IV, Yamato VI, Roma VII,
   Takamagahara VIII, Duat only at X. A gate may not field, pool or
   grant a card from a faction the player has not been shown. */
(function () {
  var INTRO = {
    1: 'grimmwood',
    2: 'camelot',
    3: 'sherwood',
    4: 'olympus',
    6: 'yamato',
    7: 'roma',
    8: 'takamagahara',
    10: 'duat',
  };
  var facOf = {};
  EOL.factions.forEach(function (f) {
    f.cards.forEach(function (c) {
      facOf[c.id] = f.id;
    });
  });
  facOf[S.bossCard.id] = 'first-legend';
  var allowed = [];
  S.stages.forEach(function (st) {
    if (INTRO[st.id]) allowed.push(INTRO[st.id]);
    var okSet = {};
    allowed.forEach(function (f) {
      okSet[f] = true;
    });
    if (st.id === 10) okSet['first-legend'] = true;
    [
      ['enemy12', st.enemy12 || []],
      ['pool', (st.pool && st.pool.cards) || []],
      ['grants', (st.grants || {}).cards || []],
    ].forEach(function (pair) {
      var badIds = pair[1].filter(function (id) {
        return !okSet[facOf[id]];
      });
      ok(
        badIds.length === 0,
        'stage ' +
          st.id +
          ' ' +
          pair[0] +
          ': only introduced factions' +
          (badIds.length ? ' (LEAK: ' + badIds.join(', ') + ')' : '')
      );
    });
  });
})();

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
/* the growth cap comes from the DATA, not a hardcoded guess - and the
   probe battle is seeded, so the check cannot flake with the dice */
var growthCap = (function () {
  var sig = (S.bossCard.abilities || []).filter(function (a) {
    return a.sig;
  })[0];
  var fx = ((sig && sig.effects) || []).filter(function (e) {
    return e.stackTag === 'saw-the-deep';
  })[0];
  return (fx && fx.maxStacks) || 6;
})();
function mulberryBoss(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
try {
  var B = E.createBattle(heroSix, E.optimizeFormation(bossSix), {
    roleAware: false,
    field: EOL.battlefieldById('heros-trial'),
    rng: mulberryBoss(7),
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
ok(stacks <= growthCap, 'growth stack cap holds (' + stacks + ' <= ' + growthCap + ')');

console.log('');
if (fails) {
  console.log('CAMPAIGN VERIFY: ' + fails + ' of ' + checks + ' checks FAILED');
  process.exit(1);
}
console.log('CAMPAIGN VERIFY: ALL ' + checks + ' CHECKS PASSED');
