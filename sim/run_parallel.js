/* =============================================================
   Two-threaded sim driver
   -------------------------------------------------------------
   sim/sim.js seeds game i with (SEED + i), so the seed space can be
   sharded cleanly: shard 0 runs seeds S..S+N/2-1, shard 1 runs
   S+N/2..S+N-1. No game is ever simulated twice, and the union is
   bit-identical to a single-threaded run of N games from S.

   node sim/run_parallel.js --games 2000 [--seed 20260729] [--threads 2]
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--'))
    args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
});
const GAMES = parseInt(args.games || '2000', 10);
const SEED = parseInt(args.seed || '20260729', 10);
const THREADS = parseInt(args.threads || '2', 10);
const OUT = args.out ? path.resolve(args.out) : path.join(__dirname, 'results.json');

const per = Math.floor(GAMES / THREADS);
const shards = [];
for (let i = 0; i < THREADS; i++) {
  shards.push({
    idx: i,
    games: i === THREADS - 1 ? GAMES - per * (THREADS - 1) : per,
    seed: SEED + per * i,
    out: path.join(__dirname, `.shard${i}.json`),
  });
}

console.log(`[parallel] ${GAMES} games across ${THREADS} threads`);
shards.forEach((s) =>
  console.log(`  shard ${s.idx}: ${s.games} games, seeds ${s.seed}..${s.seed + s.games - 1}`)
);

const t0 = Date.now();
let doneCount = 0;

Promise.all(
  shards.map(
    (s) =>
      new Promise((res, rej) => {
        const p = fork(
          path.join(__dirname, 'sim.js'),
          ['--games', String(s.games), '--seed', String(s.seed), '--out', s.out]
            .concat(args.exclude ? ['--exclude', String(args.exclude)] : [])
            .concat(args.abe ? ['--abe', String(args.abe)] : [])
            .concat(args.field ? ['--field', String(args.field)] : [])
            .concat(args.noCarry ? ['--noCarry', '1'] : [])
            .concat(args.noComeback ? ['--noComeback', '1'] : [])
            /* Forward the run-shape flags. These were silently
               dropped, so `--depth 4` and `--teams draft` ran the
               DEFAULT configuration in every shard and the resulting
               comparison was meaningless - two runs that differed
               only in their filename. */
            .concat(args.depth ? ['--depth', String(args.depth)] : [])
            .concat(args.teams ? ['--teams', String(args.teams)] : [])
            /* Same trap as --depth and --teams before them: a flag that
               is not forwarded produces a run that LOOKS configured and
               is not. Anything added to sim.js must be added here too,
               and its value checked in meta afterwards. */
            .concat(args.bans ? ['--bans', '1'] : [])
            .concat(args.force ? ['--force', String(args.force)] : []),
          { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
        );
        p.stdout.on('data', (d) => {
          const line = d.toString().trim().split('\n').pop();
          if (line) process.stdout.write(`  [s${s.idx}] ${line}\n`);
        });
        p.stderr.on('data', (d) => process.stderr.write(`  [s${s.idx}!] ${d}`));
        p.on('exit', (code) => {
          if (code !== 0) return rej(new Error(`shard ${s.idx} exited ${code}`));
          doneCount++;
          console.log(`  [s${s.idx}] finished (${doneCount}/${THREADS})`);
          res();
        });
        p.on('error', rej);
      })
  )
)
  .then(() => {
    console.log('[parallel] merging shards...');
    const parts = shards.map((s) => JSON.parse(fs.readFileSync(s.out, 'utf8')));
    const merged = parts.reduce((acc, p) => (acc ? deepMerge(acc, p) : p), null);
    merged.meta.games = parts.reduce((n, p) => n + p.meta.games, 0);
    merged.meta.seed = SEED;
    /* deepMerge SUMS numbers, so every scalar in meta has to be
       restored from the shard rather than left as a total. Reading
       it back from a shard (not a hardcoded 2) is what makes
       --depth visible in the output at all. */
    merged.meta.depth = parts[0].meta.depth;
    merged.meta.teams = parts[0].meta.teams;
    merged.meta.bans = parts[0].meta.bans;
    merged.meta.force = parts[0].meta.force;
    merged.meta.threads = THREADS;
    merged.meta.shardSeeds = shards.map((s) => s.seed);
    merged.meta.date = new Date().toISOString();
    merged.meta.wallSeconds = +((Date.now() - t0) / 1000).toFixed(1);
    fs.writeFileSync(OUT, JSON.stringify(merged));
    shards.forEach((s) => fs.unlinkSync(s.out));
    console.log(
      `[parallel] done: ${merged.meta.games} games in ${merged.meta.wallSeconds}s -> ${OUT} ` +
        `(${(fs.statSync(OUT).size / 1e6).toFixed(1)}MB)`
    );
  })
  .catch((e) => {
    console.error('[parallel] FAILED', e);
    process.exit(1);
  });

/* Sum numbers, concat arrays, recurse objects. Strings (names, ids,
   roles) are identical across shards so the first one wins. */
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => {
      if (!(k in a)) out[k] = b[k];
      else if (!(k in b)) out[k] = a[k];
      else out[k] = deepMerge(a[k], b[k]);
    });
    return out;
  }
  return a; // strings / bools / null: identical across shards
}
