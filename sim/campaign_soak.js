/* =============================================================
   CAMPAIGN SOAK - the full-chapter playthrough + balance harness
   -------------------------------------------------------------
   The `--teams fixed` soak the design doc has demanded since rev 2
   (DESIGN-Campaign-Chapter1.md §9 "Sim & balance"). Replays every
   gate of Chapter 1 through the REAL engine with the REAL stage
   configs (authored rival twelves, scripted sixes, ban profiles,
   pinned boards, fight cards, swap laws, frozen draft pools, draft
   personas, the pinned/unbannable boss) and drives the player's
   side with the same brains the game ships:

     - deck building: greedy over the FLOOR collection by
       draftAI.value under the max-4 role law
     - bans / fielding: the play.js algorithms, reimplemented 1:1
     - battle: js/ai.js bestAction for both sides

   Two modes:
     node sim/campaign_soak.js --run        one full playthrough,
                                            retrying each gate until
                                            cleared (a player's road)
     node sim/campaign_soak.js [--n 40]     soak: N trials per gate,
                                            win rates vs the design
                                            curve (§8 targets)

   VOCABULARY NOTE (the design doc's honesty rule): these are
   BOT-vs-bot win rates - the search AI piloting the floor deck.
   A median human runs below the bot on gates they are still
   learning; treat the bot number as the ceiling of the band.
   ============================================================= */
'use strict';

global.window = { EOL: {} };
require('../data/_schema.js');
require('../data/roles.js');
[
  'camelot',
  'duat',
  'grimmwood',
  'huaxia',
  'olympus',
  'roma',
  'sherwood',
  'kami',
  'yamato',
].forEach(function (f) {
  require('../data/' + f + '.js');
});
require('../data/battlefields.js');
require('../data/campaign-ch1.js');
require('../data/draft-ai.js');
require('../js/engine.js');
require('../js/ai.js');

var EOL = window.EOL;
var E = EOL.engine;
var AI = EOL.ai;
var DAI = EOL.draftAI;
var RULES = EOL.deckRules;
var S = EOL.campaignCh1;

var args = process.argv.slice(2);
var MODE = args.indexOf('--run') >= 0 ? 'run' : 'soak';
var N = (function () {
  var i = args.indexOf('--n');
  return i >= 0 ? parseInt(args[i + 1], 10) || 40 : 40;
})();
var ONLY = (function () {
  var i = args.indexOf('--gate');
  return i >= 0 ? parseInt(args[i + 1], 10) : null;
})();
var TRACE = args.indexOf('--trace') >= 0;

var dict = {};
EOL.factions.forEach(function (f) {
  f.cards.forEach(function (c) {
    dict[c.id] = { card: c, faction: f };
  });
});
dict[S.bossCard.id] = { card: S.bossCard, faction: S.bossFaction };
function entriesFor(ids) {
  return (ids || []).map(function (id) {
    return dict[id];
  });
}
function fieldById(id) {
  return EOL.battlefieldById(id);
}

/* ---------------------------------------------------------
   play.js brains, mirrored (chooseSix / predictSix / bans / picks)
   --------------------------------------------------------- */
function counterBonus(mine, theirs) {
  var M = DAI.tags(mine.card || mine),
    T = DAI.tags(theirs.card || theirs);
  var s = 0;
  if (M.wants.enemyBuff && (T.gives.shield || T.gives.buff)) s += 0.55;
  if (M.gives.cleanse && T.gives.debuff) s += 0.35;
  if (M.gives.denial && ((theirs.card || theirs).ability.cost || 0) >= 45) s += 0.4;
  if (M.wants.debuff && T.gives.debuff) s += 0.15;
  return s;
}

function fieldPersonaBonus(profile, entry) {
  if (!profile || !entry) return 0;
  var role = entry.card.role;
  var roles = {
    sentinel: { Tank: 0.14, Medic: 0.08, Bruiser: 0.04 },
    hunter: { Sniper: 0.16, Bruiser: 0.1, Controller: 0.04 },
    anointed: { Caster: 0.14, Controller: 0.12, Medic: 0.06 },
    warden: { Controller: 0.1, Tank: 0.07, Medic: 0.06 },
    trickster: { Controller: 0.18, Caster: 0.07 },
    strategist: { Controller: 0.14, Sniper: 0.1, Bruiser: 0.07 },
    chronicler: { Caster: 0.16, Controller: 0.12, Medic: 0.08 },
    guardian: { Tank: 0.14, Controller: 0.1, Caster: 0.06 },
    conqueror: { Bruiser: 0.15, Caster: 0.12, Sniper: 0.1, Medic: 0.05 },
  };
  var v = roles[profile] && roles[profile][role] ? roles[profile][role] : 0;
  var tags = DAI.tags(entry);
  if (profile === 'trickster' && (tags.gives.denial || tags.gives.energy)) v += 0.3;
  if (profile === 'strategist' && (tags.gives.kills || tags.gives.exposed)) v += 0.28;
  if (profile === 'chronicler' && (tags.gives.burn || tags.gives.cleanse || tags.gives.denial))
    v += 0.3;
  if (profile === 'conqueror' && (tags.gives.exposed || tags.gives.kills)) v += 0.28;
  return v;
}

function chooseSix(pool, enemyPool, preSeed, jitter, aiProfile) {
  var team = [],
    rest = pool.slice();
  var FIELD = RULES.FIELD_SIZE;
  (preSeed || []).forEach(function (p) {
    var pid = p && p.card ? p.card.id : p;
    for (var s = 0; s < rest.length; s++) {
      if (rest[s].card.id === pid) {
        if (team.length < FIELD) team.push(rest.splice(s, 1)[0]);
        break;
      }
    }
  });
  while (team.length < FIELD && rest.length) {
    var counts = {};
    team.forEach(function (t) {
      counts[t.card.role] = (counts[t.card.role] || 0) + 1;
    });
    var slotsLeft = FIELD - team.length;
    var forced = null;
    var poolHas = function (role) {
      return rest.some(function (e) {
        return e.card.role === role;
      });
    };
    if (!counts.Tank && poolHas('Tank') && slotsLeft <= 2) forced = 'Tank';
    else if (!counts.Medic && poolHas('Medic') && slotsLeft <= 1) forced = 'Medic';
    var best = -1,
      bestScore = -Infinity;
    for (var pass = 0; pass < 2 && best < 0; pass++) {
      for (var i = 0; i < rest.length; i++) {
        if (forced && pass === 0 && rest[i].card.role !== forced) continue;
        var v =
          DAI.value(team, rest[i], { size: FIELD }) +
          fieldPersonaBonus(aiProfile, rest[i]) +
          Math.random() * (jitter == null ? (aiProfile ? 0.45 : 1.5) : jitter);
        if (enemyPool && enemyPool.length) {
          for (var k = 0; k < enemyPool.length; k++) v += counterBonus(rest[i], enemyPool[k]);
        }
        if (v > bestScore) {
          bestScore = v;
          best = i;
        }
      }
    }
    if (best < 0) best = 0;
    team.push(rest.splice(best, 1)[0]);
  }
  return team;
}

function predictSix(pool) {
  return chooseSix(pool, null, null, 3.0);
}

/* Mirrors play.js: randomize only inside a genuine near-tie so a clear
   outlier remains a deterministic ban. */
var BAN_VARIATION_WINDOW = 1.1;
var BAN_DOMINANT_GAP = BAN_VARIATION_WINDOW * 2;
function variedBanOrder(scored, count) {
  var pool = scored.slice();
  var out = [];
  while (out.length < count && pool.length) {
    pool.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    var best = pool[0].score;
    var near = pool.filter(function (candidate) {
      return best - candidate.score <= BAN_VARIATION_WINDOW;
    });
    var total = 0;
    near.forEach(function (candidate) {
      candidate._banWeight = 1 + BAN_VARIATION_WINDOW - (best - candidate.score);
      total += candidate._banWeight;
    });
    var roll = Math.min(0.999999999, Math.max(0, Math.random())) * total;
    var chosen = near[near.length - 1];
    for (var i = 0; i < near.length; i++) {
      roll -= near[i]._banWeight;
      if (roll < 0) {
        chosen = near[i];
        break;
      }
    }
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

function personaBans(profile, deckEntries, myPool, allowLegendaries) {
  profile = profile || {};
  var legal = deckEntries.filter(function (e) {
    return allowLegendaries || e.card.rarity !== 'legendary';
  });
  var out = [];
  (profile.ids || []).forEach(function (id) {
    if (out.length >= RULES.BANS || out.indexOf(id) >= 0) return;
    if (
      legal.some(function (e) {
        return e.card.id === id;
      })
    )
      out.push(id);
  });
  while (out.length < RULES.BANS) {
    var scored = legal
      .filter(function (e) {
        return out.indexOf(e.card.id) < 0;
      })
      .map(function (e) {
        return {
          id: e.card.id,
          entry: e,
          role: profile.roles && profile.roles.indexOf(e.card.role) >= 0 ? 1 : 0,
          stat: profile.stat === 'atk' ? e.card.stats.atk : 0,
          power: profile.power ? DAI.powerOf(e.card) : 0,
          deny: DAI.denyValue(deckEntries, e, myPool || []),
        };
      });
    if (!scored.length) break;
    var byThreat = scored.slice().sort(function (a, b) {
      return b.deny - a.deny;
    });
    if (byThreat.length === 1 || byThreat[0].deny - byThreat[1].deny > BAN_DOMINANT_GAP) {
      out.push(byThreat[0].id);
      continue;
    }
    if (profile.roles) {
      var preferred = scored.filter(function (candidate) {
        return candidate.role;
      });
      if (preferred.length) scored = preferred;
    }
    if (profile.stat === 'atk') {
      var topStat = Math.max.apply(
        null,
        scored.map(function (candidate) {
          return candidate.stat;
        })
      );
      var statWindow = Math.max(90, topStat * 0.08);
      scored = scored.filter(function (candidate) {
        return topStat - candidate.stat <= statWindow;
      });
      scored.forEach(function (candidate) {
        candidate.profileTie = 0.6 * (1 - (topStat - candidate.stat) / statWindow);
      });
    } else if (profile.power) {
      var topPower = Math.max.apply(
        null,
        scored.map(function (candidate) {
          return candidate.power;
        })
      );
      var powerWindow = 0.35;
      scored = scored.filter(function (candidate) {
        return topPower - candidate.power <= powerWindow;
      });
      scored.forEach(function (candidate) {
        candidate.profileTie = 0.6 * (1 - (topPower - candidate.power) / powerWindow);
      });
    }
    scored.forEach(function (candidate) {
      candidate.score = candidate.deny + (candidate.profileTie || 0);
    });
    var pick = variedBanOrder(scored, 1)[0];
    if (!pick) break;
    out.push(pick.id);
  }
  return out.slice(0, RULES.BANS);
}

function playerBans(enemyDeck, myDeck, unbannable, allowLegendaries) {
  var scored = enemyDeck
    .filter(function (e) {
      return (
        (allowLegendaries || e.card.rarity !== 'legendary') &&
        (!unbannable || unbannable.indexOf(e.card.id) < 0)
      );
    })
    .map(function (e) {
      return { id: e.card.id, score: DAI.denyValue(enemyDeck, e, myDeck) };
    });
  return variedBanOrder(scored, RULES.BANS).map(function (x) {
    return x.id;
  });
}

function draftPick(team, offered, foeTeam, persona, personaJitter) {
  var legal = offered.filter(function (e) {
    return !RULES.capBlocked(team, e.card);
  });
  if (!legal.length) legal = offered.slice();
  var best = legal[0],
    bestScore = -Infinity;
  legal.forEach(function (e) {
    var mine = DAI.value(team, e, { size: RULES.DECK_SIZE });
    var theirs = foeTeam ? DAI.value(foeTeam, e, { size: RULES.DECK_SIZE }) : 0;
    var v = mine + Math.max(0, theirs - mine) * 0.35 + DAI.powerOf(e.card) * 0.8;
    if (persona) {
      var T = DAI.tags(e.card);
      if (persona === 'trickster') {
        v += Math.max(0, theirs - mine) * 0.55;
        if (T.gives.energy) v += 0.7;
        if (T.gives.denial) v += 0.6;
        if (T.wants.energy && !T.gives.energy) v -= 0.3;
      } else if (persona === 'strategist') {
        if (foeTeam)
          for (var c = 0; c < foeTeam.length; c++) v += counterBonus(e, foeTeam[c]) * 0.65;
        if (T.gives.kills || T.wants.kills) v += 0.65;
        if (T.gives.denial || T.gives.exposed) v += 0.45;
        v += DAI.powerOf(e.card) * 0.45;
      } else if (persona === 'chronicler') {
        if (T.gives.burn) v += 0.8;
        if (T.gives.cleanse) v += 0.65;
        if (T.gives.denial) v += 0.6;
        if (T.gives.exposed) v += 0.35;
      }
      v += Math.random() * (personaJitter || 0);
    }
    v += Math.random() * (persona ? 0.35 : 1.5);
    if (v > bestScore) {
      bestScore = v;
      best = e;
    }
  });
  return best;
}

/* the player's deck: greedy 12 from a collection under the role cap */
function buildDeck(collection) {
  var team = [],
    rest = collection.slice();
  while (team.length < RULES.DECK_SIZE && rest.length) {
    var best = -1,
      bestScore = -Infinity;
    for (var i = 0; i < rest.length; i++) {
      if (RULES.capBlocked(team, rest[i].card)) continue;
      if (RULES.legendaryCapBlocked(team, rest[i].card)) continue;
      var v = DAI.value(team, rest[i], { size: RULES.DECK_SIZE }) + DAI.powerOf(rest[i].card) * 0.8;
      if (v > bestScore) {
        bestScore = v;
        best = i;
      }
    }
    if (best < 0) break;
    team.push(rest.splice(best, 1)[0]);
  }
  return team;
}

/* ---------------------------------------------------------
   one battle: js/ai.js on both sides
   --------------------------------------------------------- */
function playBattle(playerSix, enemySix, field, opts) {
  opts = opts || {};
  var B = E.createBattle(E.optimizeFormation(playerSix), E.optimizeFormation(enemySix), {
    roleAware: false,
    field: field || null,
    oddFirst: opts.oddFirst || null,
  });
  B.aiProfiles = opts.aiProfile ? { enemy: opts.aiProfile } : null;
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
  }
  return { win: B.winner === 'player', rounds: B.round };
}

/* ---------------------------------------------------------
   the FLOOR collection accrued before each gate
   --------------------------------------------------------- */
function floorBefore(stageId) {
  var ids = EOL.factions
    .filter(function (f) {
      return f.id === 'grimmwood';
    })[0]
    .cards.map(function (c) {
      return c.id;
    });
  S.stages.forEach(function (st) {
    if (st.id >= stageId) return;
    var g = st.grants || {};
    if (g.legendPack && ids.indexOf(g.legendPack) < 0) ids.push(g.legendPack);
    if (g.choice) {
      /* the exam choices: pick the 2 highest-rated candidates from the
         allowed factions the floor does not own yet */
      var cands = [];
      EOL.factions.forEach(function (f) {
        if (g.choice.factions.indexOf(f.id) < 0) return;
        f.cards.forEach(function (c) {
          if (c.rarity !== 'legendary' && ids.indexOf(c.id) < 0) cands.push(c);
        });
      });
      cands.sort(function (a, b) {
        return DAI.powerOf(b) - DAI.powerOf(a);
      });
      cands.slice(0, g.choice.count).forEach(function (c) {
        ids.push(c.id);
      });
    }
  });
  return entriesFor(ids);
}

/* ---------------------------------------------------------
   gate players
   --------------------------------------------------------- */
function playClassicGate(st, playerDeck) {
  var enemy12 = entriesFor(st.enemy12);
  var botBans = personaBans(st.banProfile, playerDeck, enemy12);
  var youBans = playerBans(enemy12, playerDeck, st.unbannable);
  var mySurv = playerDeck.filter(function (e) {
    return botBans.indexOf(e.card.id) < 0;
  });
  var foeSurv = enemy12.filter(function (e) {
    return youBans.indexOf(e.card.id) < 0;
  });
  var predicted = predictSix(mySurv);
  var enemySix = null;
  if (st.botSix && st.botSix.length) {
    /* the deterministic scripted-six refill, mirroring js/play.js */
    enemySix = [];
    var take = function (id) {
      if (enemySix.length >= RULES.FIELD_SIZE) return;
      if (
        enemySix.some(function (e) {
          return e.card.id === id;
        })
      )
        return;
      for (var s2 = 0; s2 < foeSurv.length; s2++) {
        if (foeSurv[s2].card.id === id) {
          enemySix.push(foeSurv[s2]);
          return;
        }
      }
    };
    st.botSix.forEach(take);
    st.enemy12.forEach(take);
    if (enemySix.length < RULES.FIELD_SIZE) enemySix = null;
  }
  if (!enemySix)
    enemySix = chooseSix(foeSurv, predicted, st.pinned || null, null, st.aiProfile || null);
  var playerSix = chooseSix(mySurv, predictSix(foeSurv));
  if (TRACE) {
    var names = function (xs) {
      return xs
        .map(function (e) {
          return e.card.name;
        })
        .join(', ');
    };
    console.log('\n[Gate ' + st.id + ' trace]');
    console.log('player deck: ' + names(playerDeck));
    console.log('rival bans: ' + botBans.join(', '));
    console.log('player bans: ' + youBans.join(', '));
    console.log('player six: ' + names(playerSix));
    console.log('rival six: ' + names(enemySix));
  }
  var r = playBattle(playerSix, enemySix, fieldById(st.field), {
    oddFirst: st.id === 1 ? 'player' : null,
    aiProfile: st.aiProfile || null,
  });
  return { win: r.win, games: 1, rounds: r.rounds };
}

function sideboard(oldIds, survive, forecast, pinnedIds, aiProfile) {
  /* re-run chooseSix, then hold the 1-2 swap law exactly like play.js */
  var chosen = chooseSix(survive, forecast, pinnedIds, null, aiProfile || null);
  if (!oldIds.length) return chosen;
  var fresh = chosen.filter(function (e) {
    return oldIds.indexOf(e.card.id) < 0;
  }).length;
  if (fresh >= 1 && fresh <= 2) return chosen;
  var base = survive.filter(function (e) {
    return oldIds.indexOf(e.card.id) >= 0;
  });
  var bench = survive.filter(function (e) {
    return oldIds.indexOf(e.card.id) < 0;
  });
  bench.sort(function (a, b) {
    return (
      DAI.value(chosen, b, { size: 6 }) +
      fieldPersonaBonus(aiProfile, b) -
      DAI.value(chosen, a, { size: 6 }) -
      fieldPersonaBonus(aiProfile, a)
    );
  });
  var need = fresh < 1 ? 1 : 2 - fresh;
  var pinnedIn = base.filter(function (e) {
    return (pinnedIds || []).indexOf(e.card.id) >= 0;
  });
  var droppable = base.filter(function (e) {
    return (pinnedIds || []).indexOf(e.card.id) < 0;
  });
  var half = pinnedIn.concat(
    droppable
      .slice()
      .sort(function (a, b) {
        return (
          DAI.value(base, a, { size: 6 }) +
          fieldPersonaBonus(aiProfile, a) -
          DAI.value(base, b, { size: 6 }) -
          fieldPersonaBonus(aiProfile, b)
        );
      })
      .slice(need)
  );
  return chooseSix(
    half.concat(bench.slice(0, need * 2)),
    forecast,
    pinnedIds,
    null,
    aiProfile || null
  );
}

function playSetGate(st, playerDeck) {
  var enemy12 = entriesFor(st.enemy12);
  var botBans = personaBans(st.banProfile, playerDeck, enemy12);
  var youBans = playerBans(enemy12, playerDeck, st.unbannable);
  var mySurv = playerDeck.filter(function (e) {
    return botBans.indexOf(e.card.id) < 0;
  });
  var foeSurv = enemy12.filter(function (e) {
    return youBans.indexOf(e.card.id) < 0;
  });
  var card = st.fightCard.map(fieldById);
  var slots = [0, 1, 2];
  var used = [slots.splice(Math.floor(Math.random() * 3), 1)[0]];
  var wins = { you: 0, foe: 0 };
  var myLocked = [],
    foeLocked = [];
  var myLast = null,
    foeLast = null;
  var games = 0,
    roundsTotal = 0;
  while (wins.you < 2 && wins.foe < 2) {
    games++;
    var field = card[used[used.length - 1]];
    var mPool = mySurv.filter(function (e) {
      return myLocked.indexOf(e.card.id) < 0;
    });
    var fPool = foeSurv.filter(function (e) {
      return foeLocked.indexOf(e.card.id) < 0;
    });
    var predicted = predictSix(mPool);
    var eSix = foeLast
      ? sideboard(foeLast, fPool, predicted, st.pinned || [], st.aiProfile || null)
      : chooseSix(fPool, predicted, st.pinned || null, null, st.aiProfile || null);
    var pSix = myLast
      ? sideboard(myLast, mPool, predictSix(fPool), [])
      : chooseSix(mPool, predictSix(fPool));
    if (TRACE) {
      var setNames = function (xs) {
        return xs
          .map(function (e) {
            return e.card.name;
          })
          .join(', ');
      };
      console.log('\n[Gate ' + st.id + ' set game ' + games + ' trace]');
      console.log('rival bans: ' + botBans.join(', '));
      console.log('player bans: ' + youBans.join(', '));
      console.log('player six: ' + setNames(pSix));
      console.log('rival six: ' + setNames(eSix));
    }
    var r = playBattle(pSix, eSix, field, { aiProfile: st.aiProfile || null });
    roundsTotal += r.rounds;
    /* lockouts: whoever left the six sits out the rest of the set */
    if (myLast)
      myLast.forEach(function (id) {
        if (
          !pSix.some(function (e) {
            return e.card.id === id;
          }) &&
          myLocked.indexOf(id) < 0
        )
          myLocked.push(id);
      });
    if (foeLast)
      foeLast.forEach(function (id) {
        if (
          !eSix.some(function (e) {
            return e.card.id === id;
          }) &&
          foeLocked.indexOf(id) < 0
        )
          foeLocked.push(id);
      });
    myLast = pSix.map(function (e) {
      return e.card.id;
    });
    foeLast = eSix.map(function (e) {
      return e.card.id;
    });
    if (r.win) wins.you++;
    else wins.foe++;
    if (slots.length && wins.you < 2 && wins.foe < 2) {
      used.push(slots.splice(Math.floor(Math.random() * slots.length), 1)[0]);
    }
  }
  return {
    win: wins.you === 2,
    games: games,
    rounds: roundsTotal,
    score: wins.you + '-' + wins.foe,
  };
}

function playDraftGate(st) {
  var pool = entriesFor(st.pool.cards);
  var shuffled = pool.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = t;
  }
  var packs = [];
  for (var k = 0; k < shuffled.length; k += 3) packs.push(shuffled.slice(k, k + 3));
  var you = [],
    foe = [];
  packs.forEach(function (pack, idx) {
    var youOpen = idx % 2 === 0;
    var offered = pack.slice();
    var take = function (who) {
      var e =
        who === 'you'
          ? draftPick(you, offered, foe, null)
          : draftPick(foe, offered, you, st.persona, st.personaJitter);
      offered.splice(offered.indexOf(e), 1);
      (who === 'you' ? you : foe).push(e);
    };
    take(youOpen ? 'you' : 'foe');
    take(youOpen ? 'foe' : 'you');
    /* third card burns */
  });
  var botBans = personaBans(st.banProfile, you, foe, true);
  var youBans = playerBans(foe, you, null, true);
  var mySurv = you.filter(function (e) {
    return botBans.indexOf(e.card.id) < 0;
  });
  var foeSurv = foe.filter(function (e) {
    return youBans.indexOf(e.card.id) < 0;
  });
  var eSix = chooseSix(foeSurv, predictSix(mySurv), null, null, st.aiProfile || null);
  var pSix = chooseSix(mySurv, predictSix(foeSurv));
  if (TRACE) {
    var draftNames = function (xs) {
      return xs
        .map(function (e) {
          return e.card.name;
        })
        .join(', ');
    };
    console.log('\n[Gate ' + st.id + ' draft trace]');
    console.log('player twelve: ' + draftNames(you));
    console.log('rival twelve: ' + draftNames(foe));
    console.log('rival bans: ' + botBans.join(', '));
    console.log('player bans: ' + youBans.join(', '));
    console.log('player six: ' + draftNames(pSix));
    console.log('rival six: ' + draftNames(eSix));
  }
  var r = playBattle(pSix, eSix, fieldById(st.field), {
    aiProfile: st.aiProfile || null,
  });
  return { win: r.win, games: 1, rounds: r.rounds };
}

function playGate(st) {
  if (st.id === 1) {
    /* the scripted gate: the frozen line is a proven win (replayed in
       verify_campaign); model it as deterministic */
    return { win: true, games: 1, rounds: 6, scripted: true };
  }
  if (st.mode === 'draft') return playDraftGate(st);
  var deck = buildDeck(floorBefore(st.id));
  if (st.mode === 'set') return playSetGate(st, deck);
  return playClassicGate(st, deck);
}

/* ---------------------------------------------------------
   modes
   --------------------------------------------------------- */
/* After the guided Gate I, the road starts near an even fight and then
   closes steadily toward Gilgamesh's roughly one-in-twenty judgment. */
var TARGETS = { 1: 100, 2: 50, 3: 44, 4: 38, 5: 32, 6: 26, 7: 21, 8: 16, 9: 10, 10: 5 };

function pct(x, n) {
  return ((100 * x) / n).toFixed(0) + '%';
}

if (MODE === 'run') {
  console.log('=== FULL PLAYTHROUGH (floor collection, retries until clear) ===');
  var totalAttempts = 0;
  S.stages.forEach(function (st) {
    if (ONLY && st.id !== ONLY) return;
    var attempts = 0,
      r;
    do {
      attempts++;
      r = playGate(st);
    } while (!r.win && attempts < 25);
    totalAttempts += attempts;
    console.log(
      'Gate ' +
        String(st.id).padStart(2) +
        '  ' +
        st.rival.padEnd(26) +
        (r.win ? 'CLEARED' : 'STUCK  ') +
        '  attempts: ' +
        attempts +
        (r.score ? '  set ' + r.score : '') +
        (r.scripted ? '  (scripted line)' : '')
    );
    if (!r.win) {
      console.log('  !! gate ' + st.id + ' could not be cleared in 25 attempts - balance broken');
      process.exitCode = 1;
    }
  });
  console.log('Road complete in ' + totalAttempts + ' total attempts.');
} else {
  console.log('=== SOAK: ' + N + ' trials per gate, floor collection ===');
  console.log('(bot-vs-bot win rates; a median human lands below these)');
  console.log('');
  console.log('gate  rival                       winrate   target   avg games/rounds');
  S.stages.forEach(function (st) {
    if (ONLY && st.id !== ONLY) return;
    if (st.id === 1) {
      console.log(
        '   1  The Recruiter               100%*    ~100%     scripted line (proven in verify_campaign)'
      );
      return;
    }
    var w = 0,
      games = 0,
      rounds = 0;
    for (var i = 0; i < N; i++) {
      var r = playGate(st);
      if (r.win) w++;
      games += r.games;
      rounds += r.rounds;
    }
    console.log(
      '  ' +
        String(st.id).padStart(2) +
        '  ' +
        st.rival.padEnd(26) +
        '  ' +
        pct(w, N).padStart(5) +
        '    ~' +
        TARGETS[st.id] +
        '%     ' +
        (games / N).toFixed(1) +
        ' / ' +
        (rounds / games).toFixed(1)
    );
  });
}
