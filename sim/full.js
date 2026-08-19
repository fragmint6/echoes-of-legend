/* =============================================================
   Echoes of Legend - FULL BALANCE RUN
   -------------------------------------------------------------
   node sim/full.js [--depth 4] [--quick]

   ONE command. Run it whenever you want to know whether the game is
   balanced. It is the only balance command you need.

   WHY THIS EXISTS
   -------------------------------------------------------------
   A single random-draw simulation answers one question - "is this
   card fair beside five strangers" - and quietly implies it has
   answered a different one: "is this card fair when a human builds
   around it and bans what scares them". A live match proved the gap.
   The player out-drafted his opponent decisively and the sim's
   numbers gave no warning at all.

   Three separate blind spots caused that:

     1. RANDOM DRAW DESTROYS COMBOS. 57 legends means 1,596 possible
        pairs and each game shows 30, so at 1,200 games the
        best-covered pair has 39 appearances. Combo questions cannot
        be settled by random draw at any sample size that fits in an
        afternoon.

     2. NOBODY BANNED. A card can sit at 50% purely because
        opponents keep deleting it. Its win rate is average BECAUSE
        the threat is high. Without a ban phase that relationship is
        invisible - and it is the single best power signal there is.

     3. THE INSTRUMENT SHARED THE BLIND SPOT. Drafting with
        draft-ai.js means a card the heuristic undervalues is rarely
        drafted, so it gets little data, so nobody learns it is
        strong. And the heuristic's weights came from earlier sim
        results. Circular.

   WHAT THIS RUNS
   -------------------------------------------------------------
     PHASE 1  random draw, bans on      broad coverage, every legend
     PHASE 2  full draft, bans on       realistic teams and ban data
     PHASE 3  forced inclusion, per legend equal sample, no AI opinion

   Phase 3 is the one that breaks the circle: each legend is PINNED
   into a deck regardless of whether the draft AI wanted it.

   HOW TO READ IT
   -------------------------------------------------------------
   Four numbers per legend, and win rate is the weakest of them:

     ban rate     how frightening is it
     forced WR    how strong is it when made to play
     pick rate    does the draft AI want it
     free WR      the old number, confounded by all of the above

   The interesting cases are the DISAGREEMENTS. High forced WR with
   a low pick rate means the draft AI is misjudging the card, which
   is a bug report about draft-ai.js rather than about the legend.

   WHAT IT STILL CANNOT DO
   -------------------------------------------------------------
   Depth 4 is better than depth 2, not good. The draft AI is a proxy
   for a drafting human, not a replacement. No bot adapts across
   games the way two people do by their third match. Red Riding
   Hood's 13,000 shield was found by playing, not by simulating, and
   that will keep being true.

   This does NOT replace sim/verify_all.js. Simming asserts nothing;
   it measures a build that is assumed to already be correct.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--'))
    args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
});

const ROOT = path.resolve(__dirname, '..');
const DEPTH = parseInt(args.depth || '4', 10);
const SEED = parseInt(args.seed || '20260802', 10);
const QUICK = !!args.quick;
const OUT = args.out ? path.resolve(args.out) : path.join(__dirname, 'full.json');
const OUT_MD = args.report ? path.resolve(args.report) : path.join(__dirname, 'full.md');

/* Sample sizes. --quick exists so the pipeline itself can be tested
   in a minute; it is NOT enough data to balance on and the report
   says so. */
const N_RANDOM = QUICK ? 40 : parseInt(args.random || '5000', 10);
const N_DRAFT = QUICK ? 40 : parseInt(args.draft || '2000', 10);
const N_FORCED = QUICK ? 4 : parseInt(args.forced || '40', 10);

/* roster, for the forced pass */
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
  'data/kami.js',
  'data/duat.js',
].forEach((f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
const ROSTER = [];
window.EOL.factions.forEach((f) => f.cards.forEach((c) => ROSTER.push(c)));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eol-full-'));
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';

function runSim(label, extra, outFile) {
  const argv = ['--seed', String(SEED), '--depth', String(DEPTH), '--out', outFile].concat(extra);
  /* run_parallel shards across cores; it forwards every flag it is
     given, and its meta records the real configuration so a run can
     always be identified after the fact. */
  execFileSync(process.execPath, [path.join(__dirname, 'run_parallel.js')].concat(argv), {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const r = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  /* VERIFY THE RUN IS THE RUN WE ASKED FOR.
     run_parallel forwards flags to its shards explicitly, and a flag
     that is not forwarded yields a run that looks configured but is
     not - it has happened twice now (--depth, then --bans), each time
     producing a comparison between two identical configurations. So
     the request is checked against what the output actually records. */
  const want = {};
  for (let i = 0; i < extra.length; i += 2) want[extra[i].replace(/^--/, '')] = extra[i + 1];
  if (want.bans && !r.meta.bans) {
    throw new Error(label + ': --bans was requested but the run reports bans=false');
  }
  if (want.teams && r.meta.teams !== want.teams) {
    throw new Error(label + ': asked for teams=' + want.teams + ' but got ' + r.meta.teams);
  }
  if (want.force && r.meta.force !== want.force) {
    throw new Error(label + ': asked to force ' + want.force + ' but got ' + r.meta.force);
  }
  if (r.meta.depth !== DEPTH) {
    throw new Error(label + ': asked for depth ' + DEPTH + ' but got ' + r.meta.depth);
  }
  return r;
}

console.log('');
console.log('================================================================');
console.log('  FULL BALANCE RUN' + (QUICK ? '  [QUICK - pipeline test only]' : ''));
console.log('  depth ' + DEPTH + ', seed ' + SEED);
console.log('================================================================');

/* ---------- phase 1: random draw, with bans ---------- */
console.log('\n  [1/3] random draw + bans: ' + N_RANDOM + ' games');
const pRandom = runSim(
  'random',
  ['--games', String(N_RANDOM), '--teams', 'random', '--bans', '1'],
  path.join(tmp, 'random.json')
);
console.log('        done (' + el() + ')');

/* ---------- phase 2: full draft, with bans ---------- */
console.log('  [2/3] full draft + bans: ' + N_DRAFT + ' games');
const pDraft = runSim(
  'draft',
  ['--games', String(N_DRAFT), '--teams', 'draft', '--bans', '1'],
  path.join(tmp, 'draft.json')
);
console.log('        done (' + el() + ')');

/* ---------- phase 3: forced inclusion, legend by legend ---------- */
const totalForced = ROSTER.length * N_FORCED;
console.log(
  '  [3/3] forced inclusion: ' +
    ROSTER.length +
    ' legends x ' +
    N_FORCED +
    ' = ' +
    totalForced +
    ' games'
);
const forced = {};
ROSTER.forEach((c, i) => {
  const out = path.join(tmp, 'f_' + c.id + '.json');
  const r = runSim(
    'forced',
    ['--games', String(N_FORCED), '--teams', 'draft', '--bans', '1', '--force', c.id],
    out
  );
  const h = r.legends[c.id];
  const d = r.draftStats[c.id] || {};
  forced[c.id] = {
    apps: h ? h.apps : 0,
    wins: h ? h.wins : 0,
    drafted: d.drafted || 0,
    banned: d.banned || 0,
    fielded: d.fielded || 0,
    games: r.meta.games,
  };
  try {
    fs.unlinkSync(out);
  } catch (e) {
    /* best effort */
  }
  if ((i + 1) % 10 === 0 || i === ROSTER.length - 1) {
    console.log('        ' + (i + 1) + '/' + ROSTER.length + ' legends (' + el() + ')');
  }
});

/* ---------- combine ---------- */
const out = {
  kind: 'full',
  meta: {
    depth: DEPTH,
    seed: SEED,
    quick: QUICK,
    date: new Date().toISOString(),
    wallSeconds: +((Date.now() - t0) / 1000).toFixed(1),
    phases: {
      random: pRandom.meta.games,
      draft: pDraft.meta.games,
      forcedPerLegend: N_FORCED,
      forcedTotal: totalForced,
    },
  },
  random: pRandom,
  draft: pDraft,
  forced: forced,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('\n  wrote ' + OUT + ' (' + (fs.statSync(OUT).size / 1e6).toFixed(1) + 'MB)');

/* ---------- report ---------- */
execFileSync(
  process.execPath,
  [path.join(__dirname, 'report.js'), '--full', OUT, '--out', OUT_MD],
  {
    cwd: ROOT,
    stdio: 'inherit',
  }
);

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  /* leave the temp dir if it will not go */
}

console.log('\n================================================================');
console.log('  DONE in ' + ((Date.now() - t0) / 1000 / 60).toFixed(1) + ' minutes');
console.log('  report: ' + OUT_MD);
if (QUICK) {
  console.log('  \x1b[33mQUICK MODE - sample far too small to balance on.\x1b[0m');
}
console.log('================================================================');
