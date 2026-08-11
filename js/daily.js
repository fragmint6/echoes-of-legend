/* =============================================================
   DAILY PUZZLE
   -------------------------------------------------------------
   A scheduled Node worker runs this same procedural forge shortly before
   7:00 AM America/New_York, stages its serialized checkpoint in Supabase,
   and the database publishes it at reset. Every signed-in player claims
   the exact same position and deterministic future luck once.

   The original browser forge remains available behind `?dailyLab=1` for
   calibration. It never reads an authored position list: unrestricted
   legal teams are drawn, depth-4 AI plays into rounds 5-8, and candidate
   player turns are tested through fresh depth-4 continuations.
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
      $('daily-enter').disabled = false;
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

  function plain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* The database stores immutable ids plus every mutable engine field —
     never card definitions and never the unit -> battle back-pointer.
     Keeping the wire format explicit makes a published position small,
     inspectable and safe from accidental cycles when the engine grows. */
  function serializeBattle(B, futureSeed) {
    if (!B || !Array.isArray(B.units) || B.units.length !== 12) {
      throw new Error('Cannot serialize an invalid puzzle battle');
    }
    return {
      v: 1,
      rngSeed: futureSeed | 0,
      battle: {
        round: B.round,
        oddFirst: B.oddFirst,
        turn: B.turn,
        first: B.first,
        noOpeningLimit: !!B.noOpeningLimit,
        passed: plain(B.passed),
        turnPassed: plain(B.turnPassed),
        lastActor: B.lastActor,
        actionNo: B.actionNo,
        turnId: B.turnId,
        energy: plain(B.energy),
        field: B.field ? B.field.id : null,
        comeback: plain(B.comeback),
        deathSeq: B.deathSeq || 0,
        roundEchoUsed: plain(B.roundEchoUsed || { player: false, enemy: false }),
        costMods: plain(B.costMods || { player: [], enemy: [] }),
        deferred: plain(B.deferred || []),
        acted: plain(B.acted),
        units: B.units.map(function (u) {
          var row = {
            uid: u.uid,
            card: u.card.id,
            faction: u.faction.id,
            side: u.side,
            slot: u.slot,
            idx: u.idx,
            name: u.name,
            role: u.role,
            element: u.element,
            maxHp: u.maxHp,
            hp: u.hp,
            baseAtk: u.baseAtk,
            baseDef: u.baseDef,
            shield: u.shield,
            shieldSrc: u.shieldSrc,
            alive: u.alive,
            diedAt: u.diedAt,
            spiritSpared: u.spiritSpared,
            deathCheated: u.deathCheated,
            streakUid: u.streakUid,
            lastDamagedRound: u.lastDamagedRound,
            buffs: plain(u.buffs || []),
            flags: plain(u.flags || {}),
            usedOnce: plain(u.usedOnce || {}),
            roundFlags: plain(u.roundFlags || {}),
            stackTotals: plain(u.stackTotals || {}),
            pending: plain(u.pending || []),
          };
          if (u.costMods) row.costMods = plain(u.costMods);
          if (u.triggeredBy) row.triggeredBy = plain(u.triggeredBy);
          return row;
        }),
      },
    };
  }

  function deserializeBattle(payload) {
    if (!payload || payload.v !== 1 || !payload.battle || !Array.isArray(payload.battle.units)) {
      throw new Error('Unsupported daily puzzle position');
    }
    var src = payload.battle;
    if (src.units.length !== 12 || src.round < ROUND_MIN || src.round > ROUND_MAX) {
      throw new Error('Daily puzzle position failed validation');
    }

    var factions = {};
    var cards = {};
    (window.EOL.factions || []).forEach(function (faction) {
      factions[faction.id] = faction;
      (faction.cards || []).forEach(function (card) {
        cards[card.id] = card;
      });
    });
    var field =
      src.field && window.EOL.battlefieldById ? window.EOL.battlefieldById(src.field) : null;
    if (src.field && !field) throw new Error('Daily puzzle uses an unknown battlefield');

    var B = {
      round: src.round,
      oddFirst: src.oddFirst,
      turn: src.turn,
      first: src.first,
      noOpeningLimit: !!src.noOpeningLimit,
      passed: plain(src.passed),
      turnPassed: plain(src.turnPassed),
      lastActor: src.lastActor,
      actionNo: src.actionNo,
      turnId: src.turnId,
      units: [],
      uidMap: {},
      energy: plain(src.energy),
      field: field,
      comeback: plain(src.comeback),
      deathSeq: src.deathSeq || 0,
      roundEchoUsed: plain(src.roundEchoUsed || { player: false, enemy: false }),
      costMods: plain(src.costMods || { player: [], enemy: [] }),
      log: [],
      simulation: false,
      silent: false,
      deferred: plain(src.deferred || []),
      tally: {},
      over: false,
      winner: null,
      acted: plain(src.acted),
      rng: rng32(payload.rngSeed | 0),
    };

    src.units.forEach(function (row) {
      var card = cards[row.card];
      var faction = factions[row.faction];
      if (!card || !faction || (row.side !== 'player' && row.side !== 'enemy')) {
        throw new Error('Daily puzzle contains an unknown legend');
      }
      var u = {
        battle: B,
        uid: row.uid,
        card: card,
        faction: faction,
        side: row.side,
        slot: row.slot,
        idx: row.idx,
        name: row.name || card.name,
        role: row.role || card.role,
        element: row.element || card.element,
        maxHp: row.maxHp,
        hp: row.hp,
        baseAtk: row.baseAtk,
        baseDef: row.baseDef,
        shield: row.shield || 0,
        shieldSrc: row.shieldSrc,
        alive: !!row.alive,
        diedAt: row.diedAt,
        spiritSpared: row.spiritSpared,
        deathCheated: row.deathCheated,
        streakUid: row.streakUid,
        lastDamagedRound: row.lastDamagedRound,
        buffs: plain(row.buffs || []),
        flags: plain(row.flags || {}),
        usedOnce: plain(row.usedOnce || {}),
        roundFlags: plain(row.roundFlags || {}),
        stackTotals: plain(row.stackTotals || {}),
        pending: plain(row.pending || []),
      };
      if (row.costMods) u.costMods = plain(row.costMods);
      if (row.triggeredBy) u.triggeredBy = plain(row.triggeredBy);
      B.units.push(u);
      B.uidMap[u.uid] = u;
    });
    if (B.turn !== 'player') throw new Error('Daily puzzle does not open on a player decision');
    return B;
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
            state: E.cloneBattle(B, rng32(seed ^ ((candidates.length + 1) * 7919))),
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
          await addTrials(rec, PRELIM_TRIALS, seed ^ (attempt * 65537), candidateNo, job, E, AI);
          best = better(best, rec);

          /* Five trials can express 20% or 40%, both close enough to earn
             a second sample. Only accept after ten so the displayed rate
             is never based on the tiny screening pass alone. */
          if (rec.distance <= 0.11) {
            await addTrials(rec, FINAL_TRIALS, seed ^ (attempt * 65537), candidateNo, job, E, AI);
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
    shownProgress = 0;
    progress(0, err && err.message ? err.message : 'Generation failed');
    var enter = $('daily-enter');
    if (enter) {
      enter.hidden = false;
      enter.dataset.action = 'lab-retry';
      var label = enter.querySelector('span');
      if (label) label.textContent = 'Try again';
    }
  }

  function showOfficialError(message) {
    if ($('daily-title')) $('daily-title').textContent = 'The puzzle is unavailable';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'The official position could not be reached. Your attempt has not been consumed.';
    }
    shownProgress = 0;
    progress(0, message || 'Try again in a moment');
    var enter = $('daily-enter');
    if (enter) {
      enter.hidden = false;
      enter.disabled = false;
      enter.dataset.action = 'official-retry';
      var label = enter.querySelector('span');
      if (label) label.textContent = 'Try again';
    }
    if ($('daily-fine')) $('daily-fine').textContent = 'Resets every day at 7:00 AM Eastern Time';
  }

  function paintOfficialMetrics(metrics) {
    metrics = metrics || {};
    if ($('daily-round')) $('daily-round').textContent = 'Round ' + (metrics.round || '—');
    if ($('daily-rate')) {
      $('daily-rate').textContent =
        metrics.rate == null ? '—' : Math.round(Number(metrics.rate) * 100) + '%';
    }
    if ($('daily-time')) {
      $('daily-time').textContent =
        metrics.wins == null || metrics.trials == null
          ? '—'
          : metrics.wins + ' / ' + metrics.trials;
    }
    if ($('daily-metric-third')) $('daily-metric-third').textContent = 'AI sample';
    if ($('daily-metrics')) $('daily-metrics').hidden = false;
  }

  function supabaseClient() {
    return window.EOL.auth && window.EOL.auth.rawClient ? window.EOL.auth.rawClient() : null;
  }

  function signedInUser() {
    return window.EOL.auth && window.EOL.auth.user ? window.EOL.auth.user() : null;
  }

  function askForAccount() {
    var account = $('acct-btn');
    if (account) account.click();
    if (window.EOL.ui && window.EOL.ui.toast) {
      window.EOL.ui.toast('Sign in to claim one official Daily Puzzle attempt', 'ri-lock-line');
    }
  }

  async function startLab() {
    var myJob = ++jobSeq;
    var seed = randomSeed();
    readyPuzzle = null;
    activePuzzle = false;
    var result = $('result');
    if (result) result.className = 'result';
    if (document.body.dataset.view !== 'play' && window.EOL.ui && window.EOL.ui.show) {
      window.EOL.ui.show('play');
    }
    openModal();
    if ($('daily-metric-third')) $('daily-metric-third').textContent = 'Forge time';
    var started =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    try {
      await yieldControl(myJob);
      var rec = await generatePosition(myJob, seed);
      assertCurrent(myJob);
      var ended =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      showReady(rec, ended - started, seed);
    } catch (err) {
      if (err && err.name === 'DailyPuzzleCancelled') return;
      console.error('[daily puzzle]', err);
      if (myJob === jobSeq) showError(err);
    }
  }

  function showOfficialStatus(row) {
    var metrics = row.metrics || {};
    var modal = $('daily-modal');
    if (modal) modal.classList.add('ready');
    paintOfficialMetrics(metrics);
    progress(100, row.attempted ? 'Today’s attempt has been used' : 'Ready · one attempt');
    if ($('daily-fine')) $('daily-fine').textContent = 'Resets every day at 7:00 AM Eastern Time';

    var enter = $('daily-enter');
    if (row.attempted) {
      if ($('daily-title'))
        $('daily-title').textContent = row.won ? 'Puzzle solved' : 'Attempt spent';
      if ($('daily-copy')) {
        $('daily-copy').textContent = row.finished
          ? row.won
            ? 'You found today’s winning line. A new shared position arrives at the next reset.'
            : 'Today’s line is closed. A new shared position arrives at the next reset.'
          : 'This attempt was claimed when the battle opened and cannot be replayed today.';
      }
      if (enter) enter.hidden = true;
      return;
    }

    if ($('daily-title')) $('daily-title').textContent = 'Today’s position awaits';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'Everyone receives this exact board and this exact future luck. Opening the battle consumes your one attempt.';
    }
    if (enter) {
      enter.hidden = false;
      enter.disabled = false;
      enter.dataset.action = 'claim';
      var label = enter.querySelector('span');
      if (label) label.textContent = 'Begin my attempt';
    }
  }

  async function loadOfficialStatus(job) {
    var client = supabaseClient();
    if (!client) throw new Error('Account service is offline');
    var response = await client.rpc('daily_puzzle_status').maybeSingle();
    assertCurrent(job);
    if (response.error) throw response.error;
    if (!response.data) throw new Error('No Daily Puzzle has been published yet');
    showOfficialStatus(response.data);
  }

  async function startOfficial() {
    if (!signedInUser()) {
      askForAccount();
      return;
    }
    var myJob = ++jobSeq;
    readyPuzzle = null;
    activePuzzle = false;
    var result = $('result');
    if (result) result.className = 'result';
    if (document.body.dataset.view !== 'play' && window.EOL.ui && window.EOL.ui.show) {
      window.EOL.ui.show('play');
    }
    openModal();
    if ($('daily-title')) $('daily-title').textContent = 'Today’s Daily Puzzle';
    if ($('daily-copy')) {
      $('daily-copy').textContent = 'Checking the shared position and your attempt…';
    }
    if ($('daily-fine')) $('daily-fine').textContent = 'Resets every day at 7:00 AM Eastern Time';
    progress(18, 'Contacting the puzzle archive…');
    try {
      await loadOfficialStatus(myJob);
    } catch (err) {
      if (err && err.name === 'DailyPuzzleCancelled') return;
      console.error('[daily puzzle]', err);
      if (myJob === jobSeq) showOfficialError(err && err.message);
    }
  }

  function start() {
    /* `?dailyLab=1` keeps the original browser forge reachable for
       balancing work without weakening the one-attempt official mode. */
    var lab = false;
    try {
      lab = new URLSearchParams(window.location.search).get('dailyLab') === '1';
    } catch (e) {}
    return lab ? startLab() : startOfficial();
  }

  async function claimOfficial() {
    var job = jobSeq;
    var enter = $('daily-enter');
    if (enter) enter.disabled = true;
    progress(100, 'Claiming today’s attempt…');
    try {
      var client = supabaseClient();
      if (!client) throw new Error('Account service is offline');
      var response = await client.rpc('claim_daily_puzzle').single();
      assertCurrent(job);
      if (response.error) throw response.error;
      var row = response.data;
      var packet = row && row.payload;
      if (!packet || packet.v !== 1 || !packet.position) {
        throw new Error('Published puzzle data is invalid');
      }
      var metrics = packet.meta || row.metrics || {};
      readyPuzzle = {
        state: deserializeBattle(packet.position),
        round: metrics.round,
        wins: metrics.wins,
        trials: metrics.trials,
        rate: Number(metrics.rate) || 0,
        elapsed: metrics.forgeMs || 0,
        liveSeed: packet.position.rngSeed | 0,
        official: true,
        puzzleId: row.puzzle_id,
        puzzleDay: row.puzzle_day,
      };
      enterPuzzle();
    } catch (err) {
      console.error('[daily puzzle claim]', err);
      if (job !== jobSeq) return;
      /* A second tab may have claimed between status and click. Refreshing
         status tells the truth without ever handing out a second board. */
      try {
        await loadOfficialStatus(job);
      } catch (statusErr) {
        showOfficialError((err && err.message) || 'Attempt could not be claimed');
      }
    } finally {
      if (enter) enter.disabled = false;
    }
  }

  function enterPuzzle() {
    if (!readyPuzzle || !window.EOL.battle) return;
    var E = window.EOL.engine;
    var liveSeed =
      readyPuzzle.liveSeed == null ? (readyPuzzle.seed ^ 0x6d2b79f5) | 0 : readyPuzzle.liveSeed | 0;
    var live = E.cloneBattle(readyPuzzle.state, rng32(liveSeed));
    var meta = {
      id: readyPuzzle.puzzleId || null,
      day: readyPuzzle.puzzleDay || null,
      official: !!readyPuzzle.official,
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
    if (B.puzzle.official && B.puzzle.id && !B.puzzle._reported) {
      B.puzzle._reported = true;
      var client = supabaseClient();
      if (client) {
        client
          .rpc('finish_daily_attempt', {
            p_puzzle: B.puzzle.id,
            p_won: !!win,
            p_rounds: B.round,
          })
          .then(function (response) {
            if (response.error) console.warn('[daily puzzle result]', response.error.message);
          });
      }
    }
    return {
      puzzle: true,
      title: win ? 'Puzzle Solved' : 'Line Broken',
      sub: win
        ? 'You turned a losing story into a victory.'
        : B.puzzle.official
          ? 'The line closes for today. A new position arrives at 7:00 AM Eastern.'
          : 'This position has a winning line. Forge another, or try a fresh one.',
      rematchLabel: B.puzzle.official ? 'Daily Puzzle' : 'New Puzzle',
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
        if (enter.dataset.action === 'claim') claimOfficial();
        else if (enter.dataset.action === 'lab-retry') startLab();
        else if (enter.dataset.action === 'official-retry') startOfficial();
        else enterPuzzle();
      });
    }
    document.addEventListener(
      'keydown',
      function (e) {
        var modal = $('daily-modal');
        if (e.key === 'Escape' && modal && modal.getAttribute('aria-hidden') === 'false') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeModal();
        }
      },
      true
    );
  });

  window.EOL.daily = {
    start: start,
    startLab: startLab,
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
    _serializeBattle: serializeBattle,
    _deserializeBattle: deserializeBattle,
    _generatePosition: function (seed) {
      return generatePosition(jobSeq, seed | 0);
    },
  };
})();
