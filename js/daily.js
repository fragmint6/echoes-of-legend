/* =============================================================
   DAILY PUZZLE LAB
   -------------------------------------------------------------
   The test version deliberately generates a NEW puzzle on every launch.
   It does not read an authored position list: unrestricted legal teams
   are drawn, depth-4 AI plays a real match into rounds 5-8, and candidate
   player turns are tested through fresh depth-4 continuations. The best
   bounded candidate is offered to the player in the ordinary battle UI.

   This is interactive calibration, not the eventual publication service.
   The small, fast sample keeps the browser responsive; a production daily
   will need a deterministic server recipe and a much larger trial count.
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var TARGET_RATE = 0.3;
  var SCOUT_ATTEMPTS = 5;
  var CANDIDATES_PER_SCOUT = 10;
  var PRELIM_TRIALS = 5;
  var FINAL_TRIALS = 10;
  var ROUND_MIN = 5;
  var ROUND_MAX = 8;
  var ROUND_CAP = 20;
  var STEP_CAP = 700;
  var FAST_DEPTH4_BUDGET = {
    beamWidth: 3,
    pruneKeep: 1,
    minRollouts: 1,
    maxRollouts: 2,
    timeBudget: 12,
  };

  var jobSeq = 0;
  var readyPuzzle = null;
  var activePuzzle = false;
  var shownProgress = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function randomSeed() {
    try {
      var a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] | 0;
    } catch (e) {
      return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    }
  }

  /* Mulberry32: the same tiny reproducible generator used by the sim
     harness. Each continuation gets its own seed so trial variance comes
     from game luck rather than from mutation of the source checkpoint. */
  function rng32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Cancelled() {
    this.name = 'DailyPuzzleCancelled';
    this.message = 'Puzzle generation cancelled';
  }
  Cancelled.prototype = Object.create(Error.prototype);

  function assertCurrent(job) {
    if (job !== jobSeq) throw new Cancelled();
  }

  function yieldControl(job) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          assertCurrent(job);
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  }

  function progress(pct, status) {
    pct = Math.max(shownProgress, Math.max(0, Math.min(100, Math.round(pct))));
    shownProgress = pct;
    var bar = $('daily-progress');
    var fill = $('daily-progress-fill');
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
    if (fill) fill.style.width = pct + '%';
    if (status != null && $('daily-status')) $('daily-status').textContent = status;
  }

  function openModal() {
    var modal = $('daily-modal');
    if (!modal) return;
    shownProgress = 0;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.remove('ready');
    if ($('daily-title')) $('daily-title').textContent = 'Scouting a battle';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'Two depth-4 rivals are playing toward a difficult decision. This can take a few seconds.';
    }
    if ($('daily-metrics')) $('daily-metrics').hidden = true;
    if ($('daily-enter')) {
      $('daily-enter').hidden = true;
      $('daily-enter').dataset.action = 'play';
      var label = $('daily-enter').querySelector('span');
      if (label) label.textContent = 'Play this position';
    }
    if ($('daily-fine')) {
      $('daily-fine').textContent =
        'Fresh every play during testing · target: about 30% AI win rate';
    }
    progress(2, 'Building unrestricted teams…');
  }

  function closeModal() {
    jobSeq++;
    readyPuzzle = null;
    var modal = $('daily-modal');
    if (modal) modal.setAttribute('aria-hidden', 'true');
  }

  function rosterPool() {
    var pool = [];
    (window.EOL.factions || []).forEach(function (faction) {
      (faction.cards || []).forEach(function (card) {
        pool.push({ card: card, faction: faction });
      });
    });
    return pool;
  }

  function playAiAction(B, side, E, AI) {
    var act = AI.bestAction(B, side);
    if (!act) {
      E.passTurn(B, side);
      return;
    }
    var res = E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
    /* Search should only return legal actions. If a malformed candidate
       slips through, consume that unit's action instead of hanging the
       generator forever on the same decision. */
    if (!res || !res.ok) B.acted[side][act.unit.uid] = true;
  }

  function checkpointStrength(B) {
    function sideValue(side) {
      var alive = B.units.filter(function (u) {
        return u.side === side && u.alive;
      });
      var bodies = alive.reduce(function (sum, u) {
        return sum + (u.hp + (u.shield || 0) * 0.65) / Math.max(1, u.maxHp);
      }, 0);
      return bodies + (B.energy[side] || 0) / 130;
    }
    var p = sideValue('player');
    var e = sideValue('enemy');
    return p + e ? p / (p + e) : 0.5;
  }

  async function scoutBattle(seed, attempt, job, E, AI) {
    var rng = rng32(seed);
    var pool = rosterPool();
    var fields = window.EOL.battlefields || [];
    var field = fields.length ? fields[Math.floor(rng() * fields.length)] : null;
    var B = null;
    var openingDistance = Infinity;

    /* A completely lopsided random deck produces checkpoints that are 0%
       or 100% no matter where they are sampled. Draw several independent
       legal pairings and keep the one the engine evaluator sees as the
       most balanced opening. The later checkpoint queue supplies the
       slight player disadvantage. This is still unrestricted procedural
       team generation; it merely spends cheap setup work before the real
       AI-vs-AI scouting match. */
    for (var pairing = 0; pairing < 6; pairing++) {
      var teams = window.EOL.rules.splitCapped(pool, rng);
      var probe = E.createBattle(E.optimizeFormation(teams[0]), E.optimizeFormation(teams[1]), {
        roleAware: false,
        field: field,
        rng: rng,
        oddFirst: rng() < 0.5 ? 'player' : 'enemy',
        simulation: true,
      });
      var openingScore = AI.evaluate(probe, 'player');
      var distance = Math.abs(openingScore);
      if (distance < openingDistance) {
        openingDistance = distance;
        B = probe;
      }
    }
    B.silent = true;

    var candidates = [];
    var steps = 0;
    while (!B.over && B.round <= ROUND_MAX && steps++ < STEP_CAP) {
      var side = E.advanceAction(B);
      if (!side) {
        if (!B.over) E.nextRound(B);
        continue;
      }

      /* `advanceAction` has settled auto-passes, so this is a genuine
         human decision window. Capturing before the AI move lets battle.js
         open directly on an actionable player turn. */
      if (side === 'player' && B.round >= ROUND_MIN && B.round <= ROUND_MAX) {
        var playerAlive = E.unitsOf(B, 'player').length;
        var enemyAlive = E.unitsOf(B, 'enemy').length;
        if (playerAlive >= 2 && enemyAlive >= 2) {
          candidates.push({
            state: E.cloneBattle(B, rng32(seed ^ (candidates.length + 1) * 7919)),
            strength: checkpointStrength(B),
            round: B.round,
          });
        }
      }

      playAiAction(B, side, E, AI);
      if (steps % 3 === 0) {
        progress(
          7 + attempt * 10 + Math.min(9, B.round),
          'Scouting match ' + (attempt + 1) + ' of ' + SCOUT_ATTEMPTS + ' · round ' + B.round
        );
        await yieldControl(job);
      }
    }

    /* Health alone is not the verdict, but it is a useful queue: positions
       near a slight player disadvantage are tested first. Round distance
       is only a tie-break so the centre of the requested window wins. */
    candidates.sort(function (a, b) {
      var da = Math.abs(a.strength - 0.47) + Math.abs(a.round - 6.5) * 0.008;
      var db = Math.abs(b.strength - 0.47) + Math.abs(b.round - 6.5) * 0.008;
      return da - db;
    });
    return candidates.slice(0, CANDIDATES_PER_SCOUT);
  }

  function runContinuation(source, seed, E, AI) {
    var B = E.cloneBattle(source, rng32(seed));
    B.rng = rng32(seed);
    B.simulation = true;
    B.silent = true;
    var steps = 0;
    while (!B.over && B.round <= ROUND_CAP && steps++ < STEP_CAP) {
      var side = E.advanceAction(B);
      if (!side) {
        if (!B.over) E.nextRound(B);
        continue;
      }
      playAiAction(B, side, E, AI);
    }
    return B.winner === 'player';
  }

  async function addTrials(rec, total, seed, candidateNo, job, E, AI) {
    while (rec.trials < total) {
      var trialSeed = (seed + candidateNo * 104729 + rec.trials * 7919) | 0;
      if (runContinuation(rec.candidate.state, trialSeed, E, AI)) rec.wins++;
      rec.trials++;
      progress(
        35 + Math.min(56, candidateNo * 3 + rec.trials * 1.7),
        'Testing checkpoint ' + candidateNo + ' · trial ' + rec.trials + ' of ' + total
      );
      /* A whole continuation is intentionally the largest synchronous
         chunk. Yielding after every trial makes both progress and Cancel
         paint between searches. */
      await yieldControl(job);
    }
    rec.rate = rec.wins / rec.trials;
    rec.distance = Math.abs(rec.rate - TARGET_RATE);
    return rec;
  }

  function better(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (b.distance !== a.distance) return b.distance < a.distance ? b : a;
    if (b.trials !== a.trials) return b.trials > a.trials ? b : a;
    return Math.abs(b.candidate.round - 6.5) < Math.abs(a.candidate.round - 6.5) ? b : a;
  }

  async function generatePosition(job, seed) {
    var E = window.EOL.engine;
    var AI = window.EOL.ai;
    if (!E || !AI || !window.EOL.rules || !window.EOL.rules.splitCapped) {
      throw new Error('Puzzle systems are not ready');
    }

    var oldDepth = AI.SEARCH_DEPTH || 4;
    var oldBudget = AI.simulationBudget ? AI.simulationBudget() : null;
    var best = null;
    var candidateNo = 0;

    AI.setDepth(4);
    AI.setSimulationBudget(FAST_DEPTH4_BUDGET);
    try {
      for (var attempt = 0; attempt < SCOUT_ATTEMPTS; attempt++) {
        assertCurrent(job);
        var candidates = await scoutBattle((seed + attempt * 0x9e3779b9) | 0, attempt, job, E, AI);
        for (var i = 0; i < candidates.length; i++) {
          candidateNo++;
          var rec = {
            candidate: candidates[i],
            wins: 0,
            trials: 0,
            rate: 0,
            distance: Infinity,
          };
          await addTrials(rec, PRELIM_TRIALS, seed ^ attempt * 65537, candidateNo, job, E, AI);
          best = better(best, rec);

          /* Five trials can express 20% or 40%, both close enough to earn
             a second sample. Only accept after ten so the displayed rate
             is never based on the tiny screening pass alone. */
          if (rec.distance <= 0.11) {
            await addTrials(rec, FINAL_TRIALS, seed ^ attempt * 65537, candidateNo, job, E, AI);
            best = better(best, rec);
            if (rec.rate >= 0.2 && rec.rate <= 0.4) return rec;
          }
        }
      }

      if (!best) throw new Error('No stable player checkpoint appeared in rounds 5–8');
      if (best.trials < FINAL_TRIALS) {
        await addTrials(best, FINAL_TRIALS, seed ^ 0x51f15e, candidateNo + 1, job, E, AI);
      }
      return best;
    } finally {
      /* AI configuration is global. The forge borrows it, then restores it
         exactly even on Cancel/error so normal matches and sim tools are
         never silently left on the fast calibration budget. */
      AI.setDepth(oldDepth);
      if (oldBudget) AI.setSimulationBudget(oldBudget);
      else AI.clearSimulationBudget();
    }
  }

  function showReady(rec, elapsed, seed) {
    var pct = Math.round(rec.rate * 100);
    readyPuzzle = {
      state: rec.candidate.state,
      round: rec.candidate.round,
      wins: rec.wins,
      trials: rec.trials,
      rate: rec.rate,
      elapsed: elapsed,
      seed: seed,
    };
    var modal = $('daily-modal');
    if (modal) modal.classList.add('ready');
    if ($('daily-title')) $('daily-title').textContent = 'Position forged';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'Born from a real AI battle. The player side won ' +
        rec.wins +
        ' of ' +
        rec.trials +
        ' fast depth-4 continuations from this exact decision.';
    }
    if ($('daily-round')) $('daily-round').textContent = 'Round ' + rec.candidate.round;
    if ($('daily-rate')) $('daily-rate').textContent = pct + '%';
    if ($('daily-time')) $('daily-time').textContent = (elapsed / 1000).toFixed(1) + 's';
    if ($('daily-metrics')) $('daily-metrics').hidden = false;
    if ($('daily-enter')) $('daily-enter').hidden = false;
    if ($('daily-fine')) {
      $('daily-fine').textContent =
        rec.distance <= 0.1
          ? 'Target acquired · small browser sample for test play'
          : 'Closest checkpoint found inside the interactive test budget';
    }
    progress(100, 'Ready · find the winning line');
  }

  function showError(err) {
    if ($('daily-title')) $('daily-title').textContent = 'The forge went cold';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'No playable checkpoint could be completed this time. Try another fresh scouting match.';
    }
    progress(0, err && err.message ? err.message : 'Generation failed');
    var enter = $('daily-enter');
    if (enter) {
      enter.hidden = false;
      enter.dataset.action = 'retry';
      var label = enter.querySelector('span');
      if (label) label.textContent = 'Try again';
    }
  }

  async function start() {
    var myJob = ++jobSeq;
    var seed = randomSeed();
    readyPuzzle = null;
    activePuzzle = false;
    var result = $('result');
    if (result) result.className = 'result';
    if (
      document.body.dataset.view !== 'play' &&
      window.EOL.ui &&
      window.EOL.ui.show
    ) {
      window.EOL.ui.show('play');
    }
    openModal();
    var started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    try {
      await yieldControl(myJob);
      var rec = await generatePosition(myJob, seed);
      assertCurrent(myJob);
      var ended = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      showReady(rec, ended - started, seed);
    } catch (err) {
      if (err && err.name === 'DailyPuzzleCancelled') return;
      console.error('[daily puzzle]', err);
      if (myJob === jobSeq) showError(err);
    }
  }

  function enterPuzzle() {
    if (!readyPuzzle || !window.EOL.battle) return;
    var E = window.EOL.engine;
    var liveSeed = (readyPuzzle.seed ^ 0x6d2b79f5) | 0;
    var live = E.cloneBattle(readyPuzzle.state, rng32(liveSeed));
    var meta = {
      startRound: readyPuzzle.round,
      estimate: readyPuzzle.rate,
      wins: readyPuzzle.wins,
      trials: readyPuzzle.trials,
      forgeMs: readyPuzzle.elapsed,
    };
    readyPuzzle = null;
    activePuzzle = true;
    $('daily-modal').setAttribute('aria-hidden', 'true');
    window.EOL.ui.show('battle');
    window.EOL.battle.start({
      prebuilt: live,
      puzzle: meta,
      rng: rng32(liveSeed),
    });
  }

  function onResult(win, B) {
    if (!B || !B.puzzle) return null;
    activePuzzle = true;
    return {
      puzzle: true,
      title: win ? 'Puzzle Solved' : 'Line Broken',
      sub: win
        ? 'You turned a losing story into a victory.'
        : 'This position has a winning line. Forge another, or try a fresh one.',
      rematchLabel: 'New Puzzle',
      homeLabel: 'Back to Play',
    };
  }

  function consumeResult() {
    if (!activePuzzle) return false;
    activePuzzle = false;
    var result = $('result');
    if (result) result.className = 'result';
    if (window.EOL.ui && window.EOL.ui.show) window.EOL.ui.show('play');
    return true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var mode = $('mode-daily');
    if (mode) mode.addEventListener('click', start);
    var close = $('daily-close');
    if (close) close.addEventListener('click', closeModal);
    var enter = $('daily-enter');
    if (enter) {
      enter.addEventListener('click', function () {
        if (enter.dataset.action === 'retry') start();
        else enterPuzzle();
      });
    }
    document.addEventListener('keydown', function (e) {
      var modal = $('daily-modal');
      if (e.key === 'Escape' && modal && modal.getAttribute('aria-hidden') === 'false') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeModal();
      }
    }, true);
  });

  window.EOL.daily = {
    start: start,
    enter: enterPuzzle,
    cancel: closeModal,
    onResult: onResult,
    consumeResult: consumeResult,
    deactivate: function () {
      activePuzzle = false;
    },
    active: function () {
      return activePuzzle;
    },
    /* Focused harness hooks: generation is otherwise intentionally private
       so no authored/checkpoint state becomes part of the public API. */
    _rng32: rng32,
    _runContinuation: runContinuation,
    _generatePosition: function (seed) {
      return generatePosition(jobSeq, seed | 0);
    },
  };
})();
