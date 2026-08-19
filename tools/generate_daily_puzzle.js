#!/usr/bin/env node
/* =============================================================
 * Daily Puzzle generator smoke test
 * -------------------------------------------------------------
 * Runs the exact browser/Web Worker forge under Node, serializes the
 * checkpoint, and validates an exact round-trip. Official staging is done
 * by a leased signed-in browser; this tool never contacts Supabase.
 *
 *   node tools/generate_daily_puzzle.js --dry-run
 * ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const outFlag = process.argv.indexOf('--out');
const OUT_FILE = outFlag >= 0 ? process.argv[outFlag + 1] : null;

/* Browser globals used by the classic-script data and engine files. The
   generator itself never touches DOM; these no-op methods keep daily.js's
   event wiring inert when it is evaluated under Node. */
global.window = global;
global.document = {
  body: { dataset: {} },
  getElementById() {
    return null;
  },
  addEventListener() {},
};
global.location = { search: '' };
global.EOL = {};

const SCRIPTS = [
  'data/_schema.js',
  'data/roles.js',
  'data/camelot.js',
  'data/olympus.js',
  'data/yamato.js',
  'data/grimmwood.js',
  'data/sherwood.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/kami.js',
  'data/duat.js',
  'data/battlefields.js',
  'data/draft-ai.js',
  'js/engine.js',
  'js/ai.js',
  'js/daily.js',
];

for (const rel of SCRIPTS) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  (0, eval)(`${code}\n//# sourceURL=${rel}`);
}

function easternParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
  };
}

function isoDay(y, m, d) {
  return [String(y).padStart(4, '0'), String(m).padStart(2, '0'), String(d).padStart(2, '0')].join(
    '-'
  );
}

function nextDay(parts) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 12));
  return isoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function targetPuzzleDay() {
  if (process.env.PUZZLE_DAY) return process.env.PUZZLE_DAY;
  const now = easternParts(new Date());
  return now.hour >= 7 ? nextDay(now) : isoDay(now.year, now.month, now.day);
}

function randomInt32() {
  return crypto.randomBytes(4).readInt32LE(0);
}

async function main() {
  const generationSeed = process.env.PUZZLE_SEED
    ? Number.parseInt(process.env.PUZZLE_SEED, 10) | 0
    : randomInt32();
  const started = Date.now();
  console.log(`[daily] generating seed=${generationSeed} at depth 4`);

  const rec = await EOL.daily._generatePosition(generationSeed);
  if (rec.futureSeed == null || !rec.certificate) {
    throw new Error('Daily forge did not return a winning-line certificate');
  }
  const futureSeed = rec.futureSeed | 0;
  const forgeMs = Date.now() - started;
  const position = EOL.daily._serializeBattle(rec.candidate.state, futureSeed);

  /* The worker refuses to upload a payload the browser cannot rebuild.
     This catches missing mutable fields here, before a whole day is lost. */
  const rebuilt = EOL.daily._deserializeBattle(position);
  const roundTrip = EOL.daily._serializeBattle(rebuilt, futureSeed);
  if (
    rebuilt.round !== rec.candidate.round ||
    rebuilt.turn !== 'player' ||
    rebuilt.units.length !== 12 ||
    rebuilt.field.id !== rec.candidate.state.field.id ||
    JSON.stringify(roundTrip) !== JSON.stringify(position)
  ) {
    throw new Error('Daily position failed serialization round-trip');
  }

  const metrics = {
    round: rec.candidate.round,
    wins: rec.wins,
    trials: rec.trials,
    rate: rec.rate,
    forgeMs,
    generationSeed,
    certificate: rec.certificate,
  };
  const packet = {
    v: 1,
    position,
    meta: metrics,
    generatedAt: new Date().toISOString(),
  };
  const encoded = JSON.stringify(packet);
  metrics.payloadHash = crypto.createHash('sha256').update(encoded).digest('hex');
  const puzzleDay = targetPuzzleDay();

  console.log(
    `[daily] round=${metrics.round} estimate=${metrics.wins}/${metrics.trials} ` +
      `forge=${(forgeMs / 1000).toFixed(1)}s bytes=${Buffer.byteLength(encoded)} day=${puzzleDay}`
  );
  console.log(`[daily] payload sha256=${metrics.payloadHash}`);

  if (OUT_FILE) {
    fs.mkdirSync(path.dirname(path.resolve(OUT_FILE)), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({ packet, metrics, puzzleDay }, null, 2));
    console.log(`[daily] wrote ${OUT_FILE}`);
  }

  console.log('[daily] smoke test complete; nothing uploaded');
}

main().catch((err) => {
  console.error('[daily] FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
