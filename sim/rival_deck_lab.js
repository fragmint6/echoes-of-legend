/* =============================================================
   RIVAL DECK LAB - is an authored rival twelve the best legal build?
   -------------------------------------------------------------
   Reuses the SHIPPED campaign_soak machinery (real engine, real
   js/ai.js search, real ban profiles, real set-mode sideboarding)
   but lets us swap a stage's enemy12 for a candidate and replay the
   gate. Answers the only question that matters for a rival deck:
   how often does the player's floor deck beat it?

   PAIRED SEEDS. Math.random is replaced by a seeded PRNG, so every
   candidate faces the SAME battlefield rolls, ban jitter and AI
   tie-breaks (common random numbers). Two candidates differing by
   one card are compared on identical conditions, which removes most
   of the sampling noise at these trial counts.

   The metric is PLAYER win rate, and LOWER means a STRONGER rival.
   Each gate has a design target in campaign_soak's TARGETS table
   (gate 5 ~32%, gate 9 ~10%); the goal is to land near it, not to
   drive it to zero.

     node sim/rival_deck_lab.js --gate 5 --n 40           baseline
     node sim/rival_deck_lab.js --gate 5 --n 40 --swaps   1-card search
     node sim/rival_deck_lab.js --gate 5 --n 40 --deck a,b,c,...
     node sim/rival_deck_lab.js --gate 5 --candidates file.json

   --threads N forks workers (default: cpu count), because one set
   costs several seconds of real search.

   -------------------------------------------------------------
   FINDINGS, 2026-08-14 investigation (gates 5 and 9)
   -------------------------------------------------------------
   Question asked: the Warden fields no Olympus and only two Sherwood
   cards - is her twelve really the best legal build?

   1. RULE FOUND, and it is the important one. In every non-draft gate
      js/play.js:1342-1349 adds EVERY Legendary in the rival deck to
      cfg.unbannable. A rival Legendary is therefore ban-PROOF, and the
      constructed cap is two (data/_schema.js MAX_LEGENDARIES). Both the
      Warden and the Last Guardian ship ONE. Each is leaving a free
      ban-immune slot on the table - the single most promising lead.

   2. It still did not pay off. Exhaustive 1-card search at gate 5 (216
      substitutions) plus hand-built multi-card candidates at both gates,
      all replayed through the real engine:

        gate 5 baseline (real AI budget, 7 seeds, 140 sets) 42.9%
        best candidate  (+Rumpelstiltskin -Guy,
                         +Cinderella -Guinevere)            37.9%
        difference -5.0 pp, 95% CI -16.5 .. +6.5  -> NOT significant.

      That candidate looked like a 15 pp improvement on the four seeds
      used to FIND it and then came back +8.3 pp WORSE on three fresh
      holdout seeds. Classic selection bias; the pooled result is noise.

        gate 9 baseline (real AI budget, 3 seeds, 48 sets)  39.6%
        every candidate tried                       39.6% .. 64.6%
      Nothing beat the shipped list; most were much worse. The authored
      fortress (four walls + two healers) is doing real work.

   VERDICT: leave both twelves as they are. No legal rearrangement of
   the in-era card pool was shown to beat them by a significant margin.
   The absent Olympus is not a bug - Olympus's own cards rate poorly
   here (Zeus -0.7, Hercules -0.5, Athena -0.7 by draftAI.powerOf) and
   the Mark package needs support the Warden's debuff plan does not run.

   SEPARATE, REAL ISSUE - the difficulty curve, not the deck lists.
   Both gates play far easier than campaign_soak's TARGETS intend:
   gate 5 ~43% actual vs ~32% target, gate 9 ~40% vs ~10% target. Gate
   9 is the outlier by a wide margin. That gap is too large to close by
   swapping cards inside a 12-card list; it wants difficulty scaling
   (js/engine.js scaledRivalStats) or a target revision, and it is worth
   a deliberate decision rather than a silent tweak.

   METHOD WARNING for whoever runs this next: the fast AI budget
   reorders candidates relative to the shipped budget - at gate 5 the
   fast budget ranked G5-D best and the real budget ranked it near
   last. Rank with --budget fast if you must, but never conclude
   without re-running the finalists under --budget real on seeds you
   did not use to pick them.
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');

const ROOT = path.join(__dirname, '..');

/* ---------- load the soak's guts without its CLI driver ---------- */
function loadSoak() {
  let src = fs.readFileSync(path.join(ROOT, 'sim/campaign_soak.js'), 'utf8');
  const cut = src.indexOf("if (MODE === 'run')");
  if (cut < 0) throw new Error('campaign_soak.js driver marker moved - update rival_deck_lab');
  src = src.slice(0, cut);
  src = src.replace(/require\('\.\.\//g, "require('" + ROOT + "/");
  src = src.replace(/^'use strict';/m, '');
  src +=
    '\nmodule.exports={EOL:EOL,S:S,dict:dict,entriesFor:entriesFor,playSetGate:playSetGate,' +
    'playClassicGate:playClassicGate,buildDeck:buildDeck,floorBefore:floorBefore,' +
    'playGate:playGate,DAI:DAI,RULES:RULES,TARGETS:TARGETS};\n';
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'process', 'global', '__dirname', src)(
    mod,
    mod.exports,
    require,
    process,
    global,
    path.join(ROOT, 'sim')
  );
  return mod.exports;
}

const M = loadSoak();
const { S, dict, buildDeck, floorBefore, playSetGate, playClassicGate, DAI, RULES, TARGETS } = M;
const EOL = M.EOL;

/* DETERMINISM vs CALIBRATION - two budgets, and the difference matters.
   js/ai.js normally stops searching on a WALL-CLOCK timeBudget, so its
   move choice depends on machine load: two runs of the same seed can
   diverge. The FAST budget pins an explicit rollout count with the time
   cap raised out of reach, so the rollout count always binds first and
   the search is reproducible - ideal for RANKING many candidates.

   But campaign_soak's TARGETS table is calibrated against the SHIPPED
   default budget, and a weaker search changes the absolute win rate.
   So fast-budget numbers are only comparable BETWEEN CANDIDATES, never
   against the design target. Use --budget real to confirm a finalist
   against the target. */
const BUDGET_MODE = process.env.RDL_BUDGET || 'fast';
if (BUDGET_MODE === 'fast') {
  EOL.ai.setSimulationBudget({
    beamWidth: 5,
    pruneKeep: 2,
    minRollouts: 2,
    maxRollouts: 6,
    timeBudget: 1e9,
  });
} else {
  EOL.ai.clearSimulationBudget();
}

/* ---------- seeded RNG for paired comparison ---------- */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;

/* ---------- legality against the shipped constructed rules ---------- */
function legality(ids) {
  if (!Array.isArray(ids) || ids.length !== RULES.DECK_SIZE) return 'not ' + RULES.DECK_SIZE;
  if (new Set(ids).size !== ids.length) return 'duplicate card';
  const es = [];
  for (const id of ids) {
    if (!dict[id]) return 'unknown id ' + id;
    es.push(dict[id]);
  }
  if (!RULES.isLegal(es.map((e) => ({ card: e.card })))) return 'fails deckRules.isLegal';
  return null;
}

function factionOf(e) {
  return e.faction && e.faction.id ? e.faction.id : e.faction;
}
function describe(ids) {
  const es = ids.map((i) => dict[i]);
  const mix = {};
  const roles = {};
  es.forEach((e) => {
    mix[factionOf(e)] = (mix[factionOf(e)] || 0) + 1;
    roles[e.card.role] = (roles[e.card.role] || 0) + 1;
  });
  return {
    mix,
    roles,
    legendaries: es.filter((e) => e.card.rarity === 'legendary').length,
    power: es.reduce((n, e) => n + DAI.powerOf(e.card), 0),
  };
}

/* ---------- the evaluation itself ---------- */
function evalDeck(gate, ids, n, seed0) {
  const base = S.stages.find((s) => s.id === gate);
  const st = Object.assign({}, base, { enemy12: ids });
  const deck = buildDeck(floorBefore(gate));
  let w = 0,
    games = 0,
    rounds = 0;
  for (let i = 0; i < n; i++) {
    Math.random = mulberry32((seed0 || 1000) + i * 7919);
    const r = st.mode === 'set' ? playSetGate(st, deck) : playClassicGate(st, deck);
    if (r.win) w++;
    games += r.games || 1;
    rounds += r.rounds || 0;
  }
  Math.random = realRandom;
  return { playerWin: w / n, n, games: games / n, rounds: rounds / Math.max(1, games) };
}

/* ---------- candidate pool: cards this rival may legally field ---------- */
const INTRODUCED = {
  1: 'grimmwood',
  2: 'camelot',
  3: 'sherwood',
  4: 'olympus',
  6: 'yamato',
  7: 'roma',
  8: 'kami',
  10: 'duat',
};
function factionsAt(gate) {
  return Object.keys(INTRODUCED)
    .filter((g) => +g <= gate)
    .map((g) => INTRODUCED[g]);
}
function poolFor(gate) {
  const av = factionsAt(gate);
  const out = [];
  EOL.factions.forEach((f) => {
    if (av.indexOf(f.id) < 0) return;
    f.cards.forEach((c) => out.push(c.id));
  });
  return out;
}

module.exports = {
  M,
  evalDeck,
  legality,
  describe,
  poolFor,
  factionsAt,
  dict,
  S,
  DAI,
  RULES,
  TARGETS,
};

/* ---------- worker mode ---------- */
if (process.env.RDL_WORKER) {
  process.on('message', (job) => {
    if (job.done) process.exit(0);
    const r = evalDeck(job.gate, job.ids, job.n, job.seed);
    process.send({ key: job.key, label: job.label, ids: job.ids, res: r });
  });
} else if (require.main === module) {
  main();
}

function main() {
  const args = process.argv.slice(2);
  const argv = (k, d) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : d;
  };
  const gate = parseInt(argv('--gate', '5'), 10);
  const n = parseInt(argv('--n', '30'), 10);
  const seed = parseInt(argv('--seed', '1000'), 10);
  const threads = parseInt(argv('--threads', String(Math.max(1, os.cpus().length))), 10);
  const budget = argv('--budget', 'fast');
  const st = S.stages.find((s) => s.id === gate);
  if (!st) throw new Error('no stage ' + gate);

  /* build the job list */
  const jobs = [];
  const push = (label, ids) => {
    const bad = legality(ids);
    if (bad) {
      console.log('SKIP (illegal: ' + bad + ') ' + label);
      return;
    }
    jobs.push({ key: jobs.length, label, ids, gate, n, seed });
  };

  push('BASELINE (shipped)', st.enemy12);

  if (args.indexOf('--deck') >= 0) {
    push('--deck', argv('--deck').split(',').map((s) => s.trim()));
  }
  if (args.indexOf('--candidates') >= 0) {
    const list = JSON.parse(fs.readFileSync(argv('--candidates'), 'utf8'));
    list.forEach((c) => push(c.label || 'cand', c.ids));
  }
  if (args.indexOf('--swaps') >= 0) {
    /* single-card substitutions: every rostered card x every in-era
       card not already on the roster, keeping the twelve legal. */
    const pool = poolFor(gate).filter((id) => st.enemy12.indexOf(id) < 0);
    st.enemy12.forEach((out) => {
      pool.forEach((inn) => {
        const ids = st.enemy12.map((x) => (x === out ? inn : x));
        if (legality(ids)) return;
        push('-' + dict[out].card.name + ' +' + dict[inn].card.name, ids);
      });
    });
  }

  console.log('=== RIVAL DECK LAB : gate ' + gate + ' ' + st.rival + ' ===');
  console.log(
    'mode ' +
      st.mode +
      ' | aiProfile ' +
      st.aiProfile +
      ' | target player-win ~' +
      TARGETS[gate] +
      '%  (LOWER player-win = stronger rival)'
  );
  console.log('factions legal here: ' + factionsAt(gate).join(', '));
  console.log(
    jobs.length +
      ' candidate(s) x ' +
      n +
      ' paired sets, ' +
      threads +
      ' threads, ' +
      budget +
      ' AI budget' +
      (budget === 'fast'
        ? '  (ranking only - NOT comparable to the design target; use --budget real)'
        : '  (shipped search - comparable to the target)') +
      '\n'
  );

  const results = [];
  let next = 0,
    live = 0;
  const t0 = Date.now();
  const workers = [];
  for (let i = 0; i < Math.min(threads, jobs.length); i++) {
    const w = fork(__filename, [], {
      env: Object.assign({}, process.env, { RDL_WORKER: '1', RDL_BUDGET: budget }),
    });
    workers.push(w);
    w.on('message', (m) => {
      results.push(m);
      live--;
      if (results.length % 10 === 0 || jobs.length < 20) {
        process.stdout.write(
          '  ' + results.length + '/' + jobs.length + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)\r'
        );
      }
      feed(w);
    });
    feed(w);
  }
  function feed(w) {
    if (next >= jobs.length) {
      if (live === 0) finish();
      return;
    }
    live++;
    w.send(jobs[next++]);
  }
  function finish() {
    workers.forEach((w) => w.kill());
    results.sort((a, b) => a.res.playerWin - b.res.playerWin);
    const base = results.find((r) => r.label === 'BASELINE (shipped)');
    console.log('\n');
    console.log('player-win  delta   games  label');
    results.slice(0, 40).forEach((r) => {
      const d = base ? (r.res.playerWin - base.res.playerWin) * 100 : 0;
      console.log(
        (100 * r.res.playerWin).toFixed(1).padStart(8) +
          '%  ' +
          (d > 0 ? '+' : '') +
          d.toFixed(1).padStart(5) +
          '  ' +
          r.res.games.toFixed(2).padStart(5) +
          '  ' +
          r.label
      );
    });
    if (base) {
      const dd = describe(base.ids);
      console.log(
        '\nbaseline mix ' +
          JSON.stringify(dd.mix) +
          '  legendaries ' +
          dd.legendaries +
          '/' +
          RULES.MAX_LEGENDARIES
      );
    }
    console.log('total ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
}
