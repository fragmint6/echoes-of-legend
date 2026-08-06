/* =============================================================
   Echoes of Legend - Draft AI A/B harness
   -------------------------------------------------------------
   node sim/ab_draft.js --games 400 [--seed 7] [--a /tmp/old.js] [--b data/draft-ai.js]

   Two DIFFERENT draft brains run the real ranked pipeline against
   each other - draft twelve from shared packs, ban two of the
   opponent's, field six - and then the resulting boards fight under
   the same js/ai.js at the same depth.

   This is the only test that answers "does the new AI draft better".
   Correlating its ratings against the old hand-maintained POWER
   table cannot: the table is the thing being replaced, so agreement
   with it is not evidence of anything.

   Sides are swapped every other game so any first-pick / player-one
   edge cancels out instead of being attributed to a brain.

   This file is a measuring instrument, not shipped game code.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--'))
    args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
});
const N_GAMES = parseInt(args.games || '400', 10);
const SEED = parseInt(args.seed || '20260805', 10);
const ROUND_CAP = 20;
const ROOT = path.resolve(__dirname, '..');

global.window = {};
global.performance = { now: () => Date.now() };
[
  'data/_schema.js',
  'data/roles.js',
  'data/camelot.js',
  'data/olympus.js',
  'data/sherwood.js',
  'data/grimmwood.js',
  'data/yamato.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/takamagahara.js',
  'data/duat.js',
  'data/battlefields.js',
  'js/engine.js',
  'js/ai.js',
].forEach((f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
const EOL = window.EOL,
  E = EOL.engine,
  AI = EOL.ai;

const DEPTH = parseInt(args.depth || '2', 10);
AI.setDepth(DEPTH);
AI.setSimulationBudget({
  beamWidth: 5,
  pruneKeep: 2,
  minRollouts: 2,
  maxRollouts: 6,
  timeBudget: 25,
});

/* Load a draft brain in isolation. Each file assigns window.EOL.draftAI,
   so it is captured immediately and the slot is freed for the next.

   `powerFrom` swaps ONLY the per-card strength term for a supplied
   table, leaving every other part of the module alone. That is the
   experiment that says whether a brain lost because its ratings are
   wrong or because its synergy / structure / counter reasoning is: run
   the new module with the old ratings and see which score it inherits.
   The injection is textual because `powerOf` is module-private, which
   is correct for shipped code - the seam belongs in the instrument. */
function loadBrain(file, powerFrom, syn) {
  let src = fs.readFileSync(path.resolve(ROOT, file), 'utf8');
  if (powerFrom) {
    const marker = 'function powerOf(card) {';
    if (src.indexOf(marker) < 0) throw new Error('powerOf seam not found in ' + file);
    src = src.replace(
      marker,
      marker + '\n    if (window.__POWER) return window.__POWER[card && card.id] || 0;'
    );
  }
  /* --syn refits the one constant that decides whether the bot drafts
     cards or keyword chains, by playing the two settings against each
     other. Everything else about the brain is held identical, so the
     result is attributable to the weight and to nothing else. */
  if (syn != null) {
    const m = src.match(/var SYNERGY_W = [\d.]+;/);
    if (!m) throw new Error('SYNERGY_W seam not found in ' + file);
    src = src.replace(m[0], 'var SYNERGY_W = ' + Number(syn) + ';');
  }
  const shim = { EOL: EOL, __POWER: powerFrom || null };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(shim);
  const brain = EOL.draftAI;
  delete EOL.draftAI;
  return brain;
}

/* Pull the old committed POWER table out of its own source, so the
   experiment cannot drift from what actually shipped. */
function oldPowerTable() {
  const src = fs.readFileSync('/tmp/draft-ai-old.js', 'utf8');
  const m = src.match(/var POWER = \{([\s\S]*?)\};/);
  if (!m) throw new Error('no POWER table in the old source');
  const out = {};
  m[1].replace(/'([^']+)':\s*(-?[\d.]+)/g, (_, id, v) => {
    out[id] = parseFloat(v);
    return '';
  });
  return out;
}

/* --hybrid runs NEW's module with OLD's ratings as side B, which
   isolates the rating term from everything else in the module. */
const HYBRID = !!args.hybrid;
const BRAIN = {
  A: {
    name: String(args.aName || (args.aSyn != null ? 'syn=' + args.aSyn : '') || args.a || 'OLD'),
    ai: loadBrain(args.a || '/tmp/draft-ai-old.js', null, args.aSyn),
  },
  B: HYBRID
    ? { name: 'NEW+oldRatings', ai: loadBrain(args.b || 'data/draft-ai.js', oldPowerTable()) }
    : {
        name: String(args.bName || (args.bSyn != null ? 'syn=' + args.bSyn : '') || args.b || 'NEW'),
        ai: loadBrain(args.b || 'data/draft-ai.js', null, args.bSyn),
      },
};

/* The new brain rates cards by PLAYING them and fills that in on idle
   in the client. There is no idle in a batch run, so the measurement is
   forced now - otherwise the A/B would be scoring its cold-start
   estimate, which the player only sees for the first few seconds of a
   session. --cold measures that case deliberately. */
['A', 'B'].forEach((k) => {
  const b = BRAIN[k];
  if (args.cold || !b.ai.measureNow) return;
  const t = Date.now();
  const out = b.ai.measureNow();
  if (out)
    console.log(
      '[warm] ' +
        b.name +
        ': measured ' +
        Object.keys(out).length +
        ' cards in ' +
        (Date.now() - t) +
        'ms'
    );
});

const POOL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => POOL.push({ card: c, faction: f.id })));

const FIELD = EOL.battlefieldById('colosseum');

function rng32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the ranked pipeline, but each side has its own brain ---------- */
const DECK = EOL.deckRules.DECK_SIZE;
const capDeck = (team, card) =>
  team.filter((e) => e.card.role === card.role).length >= EOL.deckRules.MAX_PER_ROLE;

function draftTwelve(rng, brains) {
  const pool = POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  const decks = [[], []];
  let packNo = 0;
  let p = 0;
  while ((decks[0].length < DECK || decks[1].length < DECK) && p + 3 <= pool.length) {
    const pack = pool.slice(p, p + 3);
    p += 3;
    const opener = packNo % 2;
    for (const side of [opener, 1 - opener]) {
      if (decks[side].length >= DECK) continue;
      const legal = pack.filter((e) => e && !capDeck(decks[side], e.card));
      const from = legal.length ? legal : pack.filter(Boolean);
      if (!from.length) break;
      const D = brains[side];
      let best = from[0];
      let bestV = -Infinity;
      for (const cand of from) {
        const v = D.value(decks[side], cand, { size: DECK }) + rng() * 2.5;
        if (v > bestV) {
          bestV = v;
          best = cand;
        }
      }
      decks[side].push(best);
      pack[pack.indexOf(best)] = null;
    }
    packNo++;
  }
  for (const side of [0, 1]) {
    while (decks[side].length < DECK && p < pool.length) {
      const e = pool[p++];
      if (e && !capDeck(decks[side], e.card)) decks[side].push(e);
    }
  }
  return decks;
}

function chooseBans(D, theirDeck, myDeck, rng) {
  const scored = theirDeck.map((e, i) => ({
    i,
    v: D.denyValue(theirDeck, e, myDeck || []) + rng() * 1.2,
  }));
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, EOL.deckRules.BANS).map((x) => theirDeck[x.i]);
}

function chooseSix(D, pool, rng) {
  const team = [];
  const rest = pool.slice();
  while (team.length < 6 && rest.length) {
    const counts = {};
    team.forEach((t) => (counts[t.card.role] = (counts[t.card.role] || 0) + 1));
    const left = 6 - team.length;
    const has = (role) => rest.some((e) => e.card.role === role);
    let forced = null;
    if (!counts.Tank && has('Tank') && left <= 2) forced = 'Tank';
    else if (!counts.Medic && has('Medic') && left <= 1) forced = 'Medic';
    let best = -1;
    let bestV = -Infinity;
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      for (let i = 0; i < rest.length; i++) {
        if (forced && pass === 0 && rest[i].card.role !== forced) continue;
        const v = D.value(team, rest[i], { size: 6 }) + rng() * 1.5;
        if (v > bestV) {
          bestV = v;
          best = i;
        }
      }
    }
    if (best < 0) best = 0;
    team.push(rest.splice(best, 1)[0]);
  }
  return team;
}

function rankedTeams(rng, brains) {
  const decks = draftTwelve(rng, brains);
  if (decks[0].length !== DECK || decks[1].length !== DECK) return null;
  const bansOn1 = chooseBans(brains[1], decks[0], decks[1], rng);
  const bansOn0 = chooseBans(brains[0], decks[1], decks[0], rng);
  const banned = [new Set(bansOn1.map((e) => e.card.id)), new Set(bansOn0.map((e) => e.card.id))];
  const survivors = [
    decks[0].filter((e) => !banned[0].has(e.card.id)),
    decks[1].filter((e) => !banned[1].has(e.card.id)),
  ];
  return [chooseSix(brains[0], survivors[0], rng), chooseSix(brains[1], survivors[1], rng)];
}

/* ---------- one battle ---------- */
function fight(teams, rng) {
  const B = E.createBattle(teams[0], teams[1], {
    rng,
    roleAware: true,
    simulation: true,
    field: FIELD,
  });
  let steps = 0;
  while (!B.over && B.round <= ROUND_CAP && steps++ < 5000) {
    const side = E.advanceAction(B);
    if (!side) {
      if (!B.over) E.nextRound(B);
      continue;
    }
    const act = AI.bestAction(B, side);
    if (!act) {
      E.passTurn(B, side);
      continue;
    }
    const res = E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
    if (!res.ok) B.acted[side][act.unit.uid] = true;
  }
  return B.over ? B.winner : null; // 'player' | 'enemy' | null
}

/* ---------- run ---------- */
const tally = { A: 0, B: 0, draws: 0 };
const picks = { A: {}, B: {} };
const t0 = Date.now();
for (let g = 0; g < N_GAMES; g++) {
  const rng = rng32(SEED + g * 7919);
  /* swap seats every other game: brain A is P1 on even games */
  const aSeat = g % 2;
  const brains = [];
  brains[aSeat] = BRAIN.A.ai;
  brains[1 - aSeat] = BRAIN.B.ai;
  const labels = [];
  labels[aSeat] = 'A';
  labels[1 - aSeat] = 'B';

  const teams = rankedTeams(rng, brains);
  if (!teams) continue;
  teams.forEach((t, side) => {
    const bag = picks[labels[side]];
    t.forEach((e) => (bag[e.card.id] = (bag[e.card.id] || 0) + 1));
  });

  const winner = fight(teams, rng);
  if (!winner) tally.draws++;
  else tally[labels[winner === 'player' ? 0 : 1]]++;
}

const decided = tally.A + tally.B;
const wrA = decided ? (tally.A / decided) * 100 : 0;
/* 95% CI on a proportion, so a 51% result is not read as a result */
const se = decided ? Math.sqrt((0.25 / decided)) * 100 : 0;
console.log('');
console.log('=== DRAFT BRAIN A/B ============================================');
console.log('  A = ' + BRAIN.A.name);
console.log('  B = ' + BRAIN.B.name);
console.log(
  '  games ' + N_GAMES + '  decided ' + decided + '  draws ' + tally.draws + '  depth ' + DEPTH
);
console.log(
  '  ' +
    BRAIN.A.name +
    ' ' +
    tally.A +
    '   ' +
    BRAIN.B.name +
    ' ' +
    tally.B +
    '   ->  A win rate ' +
    wrA.toFixed(1) +
    '%  +/- ' +
    (1.96 * se).toFixed(1)
);
console.log('  elapsed ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

if (args.picks) {
  const show = (lbl, name) => {
    const bag = picks[lbl];
    const top = Object.keys(bag)
      .sort((x, y) => bag[y] - bag[x])
      .slice(0, 12);
    console.log('  ' + name + ' most-fielded: ' + top.map((id) => id + '(' + bag[id] + ')').join(', '));
  };
  console.log('');
  show('A', BRAIN.A.name);
  show('B', BRAIN.B.name);
}
