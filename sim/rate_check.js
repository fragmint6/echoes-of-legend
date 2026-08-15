/* =============================================================
   Echoes of Legend - draft-AI rating validator
   -------------------------------------------------------------
   node sim/rate_check.js --gt /tmp/gt.json [--ai data/draft-ai.js]

   Scores a draft brain's per-card RATING against measured win rate
   from an unbiased `--teams random` run. Correlating a rating against
   the table it replaces proves nothing (the table is the thing under
   suspicion); correlating it against what actually WINS is the test
   that means something.

   Reports Pearson r, Spearman rho, and - the number that matters for
   a draft - top/bottom decile precision: of the cards the model calls
   best, how many really are.

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

global.window = {};
global.performance = { now: () => Date.now() };
/* The engine and the search AI are loaded too, because the shipped
   brain does not read a table - it RATES CARDS BY PLAYING THEM. Score
   it without an engine present and you are only scoring its cold-start
   estimate, which is not what ships. */
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
const EOL = window.EOL;

function load(file) {
  const src = fs.readFileSync(path.resolve(ROOT, file), 'utf8');
  const shim = { EOL: EOL };
  // eslint-disable-next-line no-new-func
  new Function('window', src)(shim);
  const b = EOL.draftAI;
  delete EOL.draftAI;
  return b;
}

const gt = JSON.parse(fs.readFileSync(args.gt || '/tmp/gt.json', 'utf8'));
const LEGEND = {};
EOL.factions.forEach((f) => f.cards.forEach((c) => (LEGEND[c.id] = c)));

/* ---- ground truth: win rate, and its standard error ---- */
const truth = [];
Object.keys(gt.legends).forEach((id) => {
  const s = gt.legends[id];
  if (!s.apps || !LEGEND[id]) return;
  truth.push({ id, wr: (s.wins / s.apps) * 100, apps: s.apps });
});
truth.sort((a, b) => b.wr - a.wr);

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
    const mid = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = mid;
    i = j + 1;
  }
  return r;
}
function spearman(xs, ys) {
  return pearson(rankOf(xs), rankOf(ys));
}

function report(label, rate) {
  const rows = truth.map((t) => ({ id: t.id, wr: t.wr, r: rate(LEGEND[t.id]) }));
  const covered = rows.filter((x) => isFinite(x.r) && x.r !== 0).length;
  const xs = rows.map((x) => (isFinite(x.r) ? x.r : 0));
  const ys = rows.map((x) => x.wr);
  const r = pearson(xs, ys);
  const rho = spearman(xs, ys);

  /* decile precision: how much of the truth's top 10 does the model's
     top 10 actually contain, and the same at the bottom */
  const n = rows.length;
  const k = Math.max(4, Math.round(n * 0.16)); // ~top 10 of 63
  const byTruth = rows.slice().sort((a, b) => b.wr - a.wr);
  const byModel = rows.slice().sort((a, b) => b.r - a.r);
  const topTruth = new Set(byTruth.slice(0, k).map((x) => x.id));
  const botTruth = new Set(byTruth.slice(-k).map((x) => x.id));
  const topHit = byModel.slice(0, k).filter((x) => topTruth.has(x.id)).length;
  const botHit = byModel.slice(-k).filter((x) => botTruth.has(x.id)).length;
  /* mean true win rate of the k cards the model likes most - the single
     most decision-relevant number here */
  const topWr = byModel.slice(0, k).reduce((s, x) => s + x.wr, 0) / k;
  const botWr = byModel.slice(-k).reduce((s, x) => s + x.wr, 0) / k;

  console.log(
    '  ' +
      label.padEnd(22) +
      ' cover ' +
      String(covered + '/' + n).padEnd(7) +
      ' r=' +
      r.toFixed(3).padStart(6) +
      '  rho=' +
      rho.toFixed(3).padStart(6) +
      '  top' +
      k +
      ' hit ' +
      topHit +
      '/' +
      k +
      '  bot hit ' +
      botHit +
      '/' +
      k +
      '  | mean WR of picks ' +
      topWr.toFixed(1) +
      '%  of fades ' +
      botWr.toFixed(1) +
      '%'
  );
  return { r, rho, topWr, botWr, rows };
}

console.log('');
console.log('=== RATING vs MEASURED WIN RATE ================================');
console.log(
  '  ground truth: ' +
    gt.meta.games +
    ' games, teams=' +
    gt.meta.teams +
    ', depth=' +
    gt.meta.depth
);
console.log('');

const brains = {};
(args.ai ? [args.ai] : ['data/draft-ai.js', '/tmp/draft-ai-old.js']).forEach((f) => {
  brains[f] = load(f);
  /* Warm the measured rating synchronously. In the client this happens
     on idle and is cached under a fingerprint of the roster; here it is
     just made to happen before the questions start. --cold skips it, to
     score the estimate the AI uses in the first seconds after boot. */
  if (!args.cold && brains[f].measureNow) {
    const t = Date.now();
    const out = brains[f].measureNow();
    console.log(
      '  [warm] ' +
        path.basename(f) +
        ' measured ' +
        (out ? Object.keys(out).length : 0) +
        ' cards in ' +
        (Date.now() - t) +
        'ms  (source: ' +
        (brains[f].ratingSource ? brains[f].ratingSource() : '?') +
        ')'
    );
  }
});

/* dumb baselines, so "better than nothing" is a measured claim */
const statOnly = (c) => {
  const def = Math.max(0, Math.min(80, c.stats.def || 0));
  return ((c.stats.hp || 0) / (1 - def / 100)) * 0.0002 + (c.stats.atk || 0) * 0.001;
};
report('baseline: stats only', statOnly);
report('baseline: ATK', (c) => c.stats.atk || 0);
report('baseline: eHP', (c) => (c.stats.hp || 0) / (1 - Math.min(80, c.stats.def || 0) / 100));
console.log('');
Object.keys(brains).forEach((f) => {
  report(path.basename(f) === 'draft-ai.js' && f.indexOf('tmp') < 0 ? 'NEW derived' : 'OLD table', (c) =>
    brains[f].powerOf(c)
  );
});

/* worst misses, so the model can be debugged rather than just scored */
if (args.misses) {
  const main = brains[args.ai || 'data/draft-ai.js'];
  const rows = truth.map((t) => ({ id: t.id, wr: t.wr, r: main.powerOf(LEGEND[t.id]) }));
  const wrRank = rankOf(rows.map((x) => x.wr));
  const rRank = rankOf(rows.map((x) => x.r));
  rows.forEach((x, i) => (x.err = rRank[i] - wrRank[i]));
  rows.sort((a, b) => b.err - a.err);
  console.log('');
  console.log('  OVERRATED (model loves, truth does not):');
  rows.slice(0, 8).forEach((x) =>
    console.log(
      '    +' + String(x.err).padStart(3) + '  ' + x.id.padEnd(32) + ' wr ' + x.wr.toFixed(1) + '%'
    )
  );
  console.log('  UNDERRATED (truth loves, model does not):');
  rows
    .slice(-8)
    .reverse()
    .forEach((x) =>
      console.log(
        '    ' + String(x.err).padStart(4) + '  ' + x.id.padEnd(32) + ' wr ' + x.wr.toFixed(1) + '%'
      )
    );
}
console.log('');
