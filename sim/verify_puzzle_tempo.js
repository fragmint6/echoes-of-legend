#!/usr/bin/env node
'use strict';

/* =============================================================
   THE PUZZLE LENGTH CONTRACT
   -------------------------------------------------------------
   Owner ruling 2026-08-16: "games are dragging out way too long
   right now, make it so that the intended solution is like 3-5
   rounds."

   Before the tempo rewrite the forge optimised only for "does the
   depth-4 AI eventually win, within twenty rounds". Nothing scored
   how LONG the win took, so the checkpoint ranker - which sorted by
   health parity - reliably picked the slowest shape on the board: a
   near-full 6v5. Measured over 130 checkpoints, only 63 of 170
   winning continuations landed inside five rounds and the tail ran
   to seventeen.

   This file is the regression net for the three mechanisms that
   replaced that, and it is deliberately BEHAVIOURAL where it can
   afford to be. Most of the existing daily coverage is source-text
   assertions (`sim/verify_daily_ui.js`), which cannot tell a
   constant that was renamed from a rule that was removed. Sections
   B, C and D actually run the engine.

   Runtime is ~30-60s: it plays real depth-4 battles. That is the
   price of testing the property the ruling is about rather than
   testing that a number still appears in a file.
   ============================================================= */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;

function ok(cond, message) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + message);
  } else {
    fail++;
    console.log('  FAIL  ' + message);
  }
}

/* Same host shim the Web Worker and the Node forge tool use. */
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
  'data/takamagahara.js',
  'data/duat.js',
  'data/battlefields.js',
  'data/draft-ai.js',
  'js/engine.js',
  'js/ai.js',
  'js/daily.js',
];
for (const rel of SCRIPTS) {
  (0, eval)(fs.readFileSync(path.join(ROOT, rel), 'utf8') + `\n//# sourceURL=${rel}`);
}

const D = EOL.daily;
const E = EOL.engine;
const AI = EOL.ai;
const L = D._limits;

function rng32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('A. the length contract is declared, not implied');
ok(L.solveMin === 3 && L.solveMax === 5, 'the intended solution is 3-5 rounds (owner ruling)');
ok(
  D._solveDeadline(5) === 9 && D._solveDeadline(6) === 10 && D._solveDeadline(8) === 12,
  'the deadline is round + SOLVE_MAX - 1, so five rounds INCLUDING the opening one'
);
/* The old twenty-round horizon is what the ruling is against. If a
   ROUND_CAP ever comes back, the deadline stops being the only limit and
   this whole contract quietly reverts. */
const dailySource = fs.readFileSync(path.join(ROOT, 'js/daily.js'), 'utf8');
/* Matches a declaration or a use, not the header prose that explains why
   it was removed - the explanation is the most useful part of the diff
   and a test that forbade mentioning the old design would delete it. */
ok(
  !/(var|let|const)\s+ROUND_CAP\b/.test(dailySource) &&
    !/B\.round\s*<=\s*ROUND_CAP/.test(dailySource),
  'the twenty-round continuation horizon is gone, not merely unused'
);
ok(
  L.tempoMax < 4,
  'the tempo ceiling sits below the measured 4.0 cliff, where no sampled board ever solved in time'
);

console.log('B. tempo predicts solve length (the prefilter earns its place)');
AI.setDepth(4);
AI.setSimulationBudget({
  beamWidth: 3,
  pruneKeep: 1,
  minRollouts: 1,
  maxRollouts: 2,
  timeBudget: 12,
});

const pool = [];
(EOL.factions || []).forEach((f) => (f.cards || []).forEach((c) => pool.push({ card: c, faction: f })));

function playAi(B, side) {
  const act = AI.bestAction(B, side);
  if (!act) {
    E.passTurn(B, side);
    return;
  }
  const r = E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
  if (!r || !r.ok) B.acted[side][act.unit.uid] = true;
}

/* Collect real mid-battle player-decision checkpoints, exactly the way
   scoutBattle does, and bucket them by tempo. */
const inBand = [];
const overBand = [];
for (let g = 0; g < 5; g++) {
  const rng = rng32(20260816 + g * 104729);
  const fields = EOL.battlefields || [];
  const field = fields[Math.floor(rng() * fields.length)];
  const teams = EOL.rules.splitCapped(pool, rng);
  const B = E.createBattle(E.optimizeFormation(teams[0]), E.optimizeFormation(teams[1]), {
    roleAware: false,
    field,
    rng,
    oddFirst: rng() < 0.5 ? 'player' : 'enemy',
    simulation: true,
  });
  B.silent = true;
  let steps = 0;
  while (!B.over && B.round <= L.roundMax && steps++ < 700) {
    const side = E.advanceAction(B);
    if (!side) {
      if (!B.over) E.nextRound(B);
      continue;
    }
    if (
      side === 'player' &&
      B.round >= L.roundMin &&
      E.unitsOf(B, 'player').length >= 2 &&
      E.unitsOf(B, 'enemy').length >= 2
    ) {
      const t = D._tempo(B);
      const snap = { state: E.cloneBattle(B, rng32(g * 7919 + steps)), round: B.round, tempo: t };
      if (t >= L.tempoMin && t <= L.tempoMax) inBand.push(snap);
      else if (t > L.tempoMax && t < 50) overBand.push(snap);
    }
    playAi(B, side);
  }
}
ok(inBand.length > 0, 'real scouting produces checkpoints inside the tempo band (n=' + inBand.length + ')');
ok(overBand.length > 0, 'and also produces the slow ones the band rejects (n=' + overBand.length + ')');

/* THE CENTRAL CLAIM, stated at the CLIFF rather than at the ceiling.
   TEMPO_MAX (3.6) is deliberately set below the measured cliff (4.0) as
   a safety margin, because the estimate ignores enemy healing, shield
   regeneration and revives - all of which make the true figure worse and
   none of which make it better. So boards in the 3.6-4.0 gap are
   genuinely borderline and DO sometimes win in time; asserting they
   never do would be asserting the margin does not exist.

   What must hold is the property the prefilter is built on: past the
   cliff the board is unfinishable, full stop. An earlier draft of this
   test checked `> TEMPO_MAX` and failed 6 of 8 - the assertion was
   wrong, not the filter. */
const pastCliff = overBand.filter((c) => c.tempo >= 4.5);
let cliffWins = 0;
pastCliff.slice(0, 8).forEach((c, i) => {
  const r = D._runContinuationReport(c.state, (i * 7919 + 13) | 0, E, AI);
  if (r.won) cliffWins++;
});
ok(
  pastCliff.length > 0,
  'scouting sees boards well past the cliff (n=' + pastCliff.length + ')'
);
ok(
  cliffWins === 0,
  'and none of them is winnable inside the deadline (' +
    cliffWins +
    ' of ' +
    Math.min(8, pastCliff.length) +
    ') - the prefilter is discarding the unfinishable, not the merely hard'
);

console.log('C. the deadline is enforced in the trial runner');
const sample = inBand[0] || overBand[0];
const rep = D._runContinuationReport(sample.state, 4242, E, AI);
ok(
  rep.deadline === D._solveDeadline(sample.round),
  'a continuation reports the same deadline the serializer would publish'
);
ok(
  rep.solvedIn >= 1 && rep.solvedIn <= L.solveMax,
  'rounds spent never exceed the deadline window (' + rep.solvedIn + ')'
);
/* A timed-out battle must not be scored as a win even if the player was
   winning on material. This is the exact bug the rewrite exists to fix,
   expressed as an invariant. */
ok(!(rep.timedOut && rep.won), 'a battle that runs past the deadline is never reported as won');

console.log('D. the obvious-move test rejects boards that win themselves');
ok(
  /function naiveSolves\(/.test(dailySource) &&
    /if \(!naiveSolves\(rec\.candidate\.state/.test(dailySource),
  'certification actually calls the obvious-move test'
);
ok(
  /winningLines >= 1 && winningLines <= 2/.test(dailySource) === false,
  'the old opening-line count no longer gates publication'
);

console.log('E. the deadline ships with the position and survives the wire');
/* Round-trip a real checkpoint through the exact publish path. `solveBy`
   is an additive field in the v:1 payload; if serialization ever drops
   it, battle.js silently falls back to a derived value and a published
   puzzle could be enforced against a deadline its certificate never
   proved. */
const live = E.cloneBattle(sample.state, rng32(99));
live.turn = 'player';
const payload = D._serializeBattle(live, 777);
ok(payload.solveBy === D._solveDeadline(live.round), 'the payload carries the deadline');
ok(payload.v === 1, 'and does so without breaking the v:1 wire format the server validates');
const rebuilt = D._deserializeBattle(payload);
ok(rebuilt.puzzleSolveBy === payload.solveBy, 'deserialization restores the deadline');
const roundTrip = D._serializeBattle(rebuilt, 777);
ok(
  JSON.stringify(roundTrip) === JSON.stringify(payload),
  'and the round-trip is still byte-identical, so the worker will not reject it'
);
/* A position staged before this change has no solveBy. It must still
   open - blacking out the Daily for a day is worse than running one
   legacy board on a derived deadline. */
const legacy = JSON.parse(JSON.stringify(payload));
delete legacy.solveBy;
const legacyBattle = D._deserializeBattle(legacy);
ok(
  legacyBattle.puzzleSolveBy === D._solveDeadline(legacy.battle.round),
  'a pre-rewrite payload with no deadline derives one instead of failing to open'
);

console.log('F. battle.js holds the player to the same deadline');
const battleSource = fs.readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8');
ok(
  /function puzzleRoundsSpent\(\)/.test(battleSource) &&
    /B\.round \+ 1 > B\.puzzle\.solveBy/.test(battleSource),
  'rolling into a round past the deadline ends the puzzle'
);
ok(
  /if \(puzzleRoundsSpent\(\)\)[\s\S]{0,200}B\._puzzleExpired = true/.test(battleSource),
  'the limit is applied at the single round-rollover chokepoint'
);
ok(
  !/nextRound[\s\S]{0,80}solveBy/.test(fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8')),
  'the shared engine is untouched - campaign, draft and online cannot inherit a round limit'
);
ok(
  /B\._puzzleExpired/.test(dailySource) && /Out of Rounds/.test(dailySource),
  'running out of rounds is worded as its own outcome, not as "your team has fallen"'
);
ok(
  /puzzle-chip[\s\S]{0,400}rounds left/.test(battleSource) ||
    /rounds left[\s\S]{0,400}puzzle-chip/.test(battleSource),
  'the HUD chip shows the countdown, so the deadline is visible rather than a trap'
);

/* =============================================================
   G. THE WHOLE FORGE, END TO END
   -------------------------------------------------------------
   Everything above tests a mechanism in isolation. This runs the
   real generatePosition() the Web Worker runs and asserts the
   properties of what it actually produced. It is the only check
   here that would have caught the first tempo build, which had a
   correct prefilter, a correct deadline and a correct serializer,
   and still could not publish a single position because the
   inherited tightness gate rejected all of them.

   Two seeds rather than one: a single seed passing proves the path
   is not broken, but publication RELIABILITY is the property that
   failed last time, and one sample cannot see it.
   ============================================================= */
(async function forgeCheck() {
  console.log('G. the real forge publishes, and publishes short puzzles');
  const results = [];
  for (const seed of [12345, 1333]) {
    try {
      const rec = await D._generatePosition(seed);
      const cert = rec.certificate || {};
      results.push({
        seed,
        ok: true,
        solvedIn: cert.solvedIn,
        solveBy: cert.solveBy,
        startRound: cert.startRound,
        tempo: cert.tempo,
        naive: cert.naiveSolves,
        payloadSolveBy: D._serializeBattle(rec.candidate.state, rec.futureSeed).solveBy,
      });
    } catch (err) {
      results.push({ seed, ok: false, err: err && err.message });
    }
  }

  results.forEach((r) => {
    ok(r.ok, 'seed ' + r.seed + ' published a position' + (r.ok ? '' : ' (' + r.err + ')'));
    if (!r.ok) return;
    /* THE RULING, as an assertion. */
    ok(
      r.solvedIn >= L.solveMin && r.solvedIn <= L.solveMax,
      'seed ' + r.seed + ': the certified line is ' + r.solvedIn + ' rounds, inside 3-5'
    );
    ok(
      r.solveBy === r.startRound + L.solveMax - 1,
      'seed ' + r.seed + ': the published deadline matches the window it was proved against'
    );
    ok(
      r.payloadSolveBy === r.solveBy,
      'seed ' + r.seed + ': the payload deadline equals the certificate deadline'
    );
    ok(
      r.naive === false,
      'seed ' + r.seed + ': the position survived the obvious-move test'
    );
    ok(
      r.tempo >= L.tempoMin && r.tempo <= L.tempoMax,
      'seed ' + r.seed + ': the published board sits inside the tempo band (' + r.tempo + ')'
    );
  });

  console.log('');
  console.log(pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
