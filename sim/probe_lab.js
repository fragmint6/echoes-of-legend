/* =============================================================
   Echoes of Legend - MEASURED-RATING prototype
   -------------------------------------------------------------
   node sim/probe_lab.js --gt /tmp/gt.json [--reps 4] [--cap 8]

   The question this answers: can the draft AI work out how good a
   card is by PLAYING it, cheaply, instead of by pricing its effect
   tree with hand-written constants?

   Method - marginal value in a mirror:
     - Build a VANILLA body from roster-mean stats with an empty
       passive, so it only ever casts its role Basic. Six of them, one
       per role, is the control squad.
     - The control squad against itself is a mirror: whatever edge the
       acting order confers is measured once and subtracted.
     - To rate card X, swap X in for the control body of its own role
       on one side and run the same seeds. What is left in the HP
       differential is X's contribution and nothing else.

   Nothing here is hand-priced. The engine executes the real effects.

   A measuring instrument. Not shipped game code.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--'))
    args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
});
const ROOT = path.resolve(__dirname, '..');
const REPS = parseInt(args.reps || '4', 10);
const CAP = parseInt(args.cap || '8', 10);

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

/* --policy ai runs the game's own search instead of the greedy script.
   It is ~15x slower and could never ship as a per-draft cost, but it
   measures the CEILING of the probe idea: if a good policy cannot pull
   the correlation up either, the weakness is the probe design and not
   the cheap policy, and the whole approach should be abandoned rather
   than optimised. */
const POLICY = String(args.policy || 'greedy');
if (POLICY === 'ai') {
  AI.setDepth(parseInt(args.depth || '1', 10));
  AI.setSimulationBudget({
    beamWidth: parseInt(args.beam || '3', 10),
    pruneKeep: 1,
    minRollouts: parseInt(args.roll || '1', 10),
    maxRollouts: parseInt(args.roll || '2', 10),
    timeBudget: parseInt(args.aiMs || '8', 10),
  });
}
/* --both rates each card from BOTH seats and averages, which cancels
   the acting-order edge per card instead of only on average. */
const BOTH = !!args.both;

const POOL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => POOL.push({ card: c, faction: f })));
const FIELD = EOL.battlefieldById('colosseum');
const ROLES = ['Tank', 'Bruiser', 'Caster', 'Controller', 'Medic', 'Sniper'];

/* ---- the vanilla body, derived from the roster ---- */
let sh = 0,
  sa = 0,
  sd = 0;
POOL.forEach((e) => {
  sh += e.card.stats.hp;
  sa += e.card.stats.atk;
  sd += e.card.stats.def;
});
const N = POOL.length;
const MEAN = {
  hp: Math.round(sh / N),
  atk: Math.round(sa / N),
  def: Math.round(sd / N),
};
console.log('[vanilla] roster mean stats', JSON.stringify(MEAN));

function vanilla(role) {
  return {
    card: {
      id: '_vanilla-' + role.toLowerCase(),
      name: 'Sparring ' + role,
      rarity: 'common',
      role: role,
      element: 'Physical',
      stats: { hp: MEAN.hp, atk: MEAN.atk, def: MEAN.def },
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
    faction: { id: '_lab', name: 'Lab' },
  };
}
const CONTROL = ROLES.map(vanilla);

function rng32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* A deliberately dumb policy: cast the Signature when it is affordable
   and legal, otherwise the role Basic, on the engine's own first legal
   target. It measures the CARD's throughput rather than a search AI's
   skill with it, and it is ~15x faster than bestAction, which is what
   makes a per-card probe affordable in a browser at all. */
function step(B, side) {
  if (POLICY === 'ai') {
    const act = AI.bestAction(B, side);
    if (!act) return false;
    const res = E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
    if (!res.ok) B.acted[side][act.unit.uid] = true;
    return true;
  }
  const mine = B.units.filter((u) => u.alive && u.side === side && !B.acted[side][u.uid]);
  for (const u of mine) {
    const options = [u.card.ability, E.roleAbility(u)];
    for (const ab of options) {
      if (!ab || ab.type !== 'Active') continue;
      if (!E.canUse(B, u, ab)) continue;
      const pool = E.legalTargets(B, u, ab) || [];
      const chosen = pool.length ? [pool[0]] : [];
      const res = E.useAbility(B, u, ab, chosen);
      if (res.ok) return true;
      B.acted[side][u.uid] = true;
    }
  }
  return false;
}

function duel(t1, t2, seed) {
  const B = E.createBattle(t1, t2, {
    rng: rng32(seed),
    roleAware: true,
    simulation: true,
    field: FIELD,
  });
  let steps = 0;
  while (!B.over && B.round <= CAP && steps++ < 800) {
    const side = E.advanceAction(B);
    if (!side) {
      if (!B.over) E.nextRound(B);
      continue;
    }
    if (!step(B, side)) E.passTurn(B, side);
  }
  let mine = 0,
    theirs = 0;
  B.units.forEach((u) => {
    const f = u.alive ? (u.hp + u.shield) / u.maxHp : 0;
    if (u.side === 'player') mine += f;
    else theirs += f;
  });
  return (mine - theirs) / 6;
}

/* ---- zero point: the control squad against itself ---- */
const SEED0 = parseInt(args.seed || '1000', 10);
const SEEDS = [];
for (let i = 0; i < REPS; i++) SEEDS.push(SEED0 + i * 7919);
let zero = 0;
SEEDS.forEach((s) => (zero += duel(CONTROL, CONTROL, s)));
zero /= SEEDS.length;
console.log('[mirror] control vs control =', zero.toFixed(4), '(subtracted as the zero point)');

/* ---- rate every card ---- */
const t0 = Date.now();
const score = {};
POOL.forEach((e) => {
  const team = CONTROL.map((c) => (c.card.role === e.card.role ? e : c));
  /* If the roster ever gains a role the control squad lacks, replace
     the weakest slot instead of silently rating the control squad. */
  if (team.indexOf(e) < 0) team[0] = e;
  let s = 0,
    n = 0;
  SEEDS.forEach((sd) => {
    s += duel(team, CONTROL, sd) - zero;
    n++;
    if (BOTH) {
      /* seat two: the sign flips, so the same quantity is being
         averaged and the acting-order edge cancels exactly */
      s += -(duel(CONTROL, team, sd) + zero);
      n++;
    }
  });
  score[e.card.id] = s / n;
});
const ms = Date.now() - t0;
console.log(
  '[probe] ' +
    POOL.length +
    ' cards x ' +
    REPS +
    ' reps in ' +
    ms +
    'ms  (' +
    (ms / POOL.length).toFixed(1) +
    'ms per card)'
);

/* --dump writes the raw per-card scores so two runs can be correlated
   against EACH OTHER. That is the seed-stability question - does the
   probe rank the roster the same way twice - which is separate from
   how well any one run tracks the truth. */
if (args.dump) {
  fs.writeFileSync(String(args.dump), JSON.stringify(score, null, 1));
  console.log('[dump] wrote ' + args.dump);
}

/* ---- score it against ground truth ---- */
const gt = JSON.parse(fs.readFileSync(args.gt || '/tmp/gt.json', 'utf8'));
const rows = [];
Object.keys(gt.heroes).forEach((id) => {
  const s = gt.heroes[id];
  if (!s.apps || score[id] == null) return;
  rows.push({ id, wr: (s.wins / s.apps) * 100, v: score[id] });
});

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx,
      dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}
function rankOf(vals) {
  const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(vals.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
const xs = rows.map((r) => r.v),
  ys = rows.map((r) => r.wr);
const r = pearson(xs, ys);
const rho = pearson(rankOf(xs), rankOf(ys));
const k = 10;
const byModel = rows.slice().sort((a, b) => b.v - a.v);
console.log('');
console.log(
  '  MEASURED probe   n=' +
    rows.length +
    '  r=' +
    r.toFixed(3) +
    '  rho=' +
    rho.toFixed(3) +
    '  | mean WR of top' +
    k +
    ' ' +
    (byModel.slice(0, k).reduce((s, x) => s + x.wr, 0) / k).toFixed(1) +
    '%  bottom' +
    k +
    ' ' +
    (byModel.slice(-k).reduce((s, x) => s + x.wr, 0) / k).toFixed(1) +
    '%'
);
console.log('');
console.log('  TOP 10 by probe:');
byModel
  .slice(0, 10)
  .forEach((x) => console.log('    ' + x.v.toFixed(3).padStart(7) + '  ' + x.id.padEnd(32) + ' wr ' + x.wr.toFixed(1) + '%'));
console.log('  BOTTOM 10 by probe:');
byModel
  .slice(-10)
  .forEach((x) => console.log('    ' + x.v.toFixed(3).padStart(7) + '  ' + x.id.padEnd(32) + ' wr ' + x.wr.toFixed(1) + '%'));
console.log('');
