/* =============================================================
   DAILY PUZZLE
   -------------------------------------------------------------
   At 6:55 AM America/New_York, signed-in browsers compete for one short
   Supabase generation lease. The winner runs this procedural forge in a
   Web Worker, stages its serialized checkpoint, and the database publishes
   it at reset. Every player may claim the same position and future RNG twice.

   If no browser is online, the first visitor after reset recovers the job.
   `?dailyLab=1` keeps a private calibration forge. Neither path reads an
   authored position list: unrestricted teams are played by depth-4 AI into
   rounds 5-8, then candidate turns receive depth-4 continuation tests.

   -------------------------------------------------------------
   THE TEMPO REWRITE (2026-08-16, owner ruling: "games are dragging out
   way too long, make it so that the intended solution is like 3-5
   rounds")

   The old forge optimised for exactly one thing: the probability that
   depth-4 AI, handed the player side, eventually wins. "Eventually" was
   ROUND_CAP = 20. Nothing in the scoring function knew or cared how LONG
   that win took, so the checkpoint queue - which sorted by health parity
   around 0.47 - systematically preferred the worst possible shape for a
   puzzle: a fat, even 6v5 board where both teams are near full HP. Those
   positions are "balanced" in the sense the old ranker meant, and they
   are also unkillable. Measured over 130 certified-shape checkpoints,
   only 63 of 170 winning continuations finished within five rounds; the
   tail ran to seventeen.

   A puzzle is a position with a SHORT forced line. The fix is to make
   the length a first-class, enforced property in three places:

     1. TEMPO PREFILTER (`tempo()`). Before spending a single trial,
        estimate how many player actions of damage the enemy team can
        absorb. Measured against solve length this is a near-perfect
        predictor: every sampled checkpoint below tempo 3 solved inside
        five rounds, and NOT ONE above tempo 4 ever did, at any trial
        count. Checkpoints outside TEMPO_MIN..TEMPO_MAX are dropped at
        capture time. This is also why generation is now much faster -
        the forge stopped paying for twenty-round rollouts of positions
        that could never qualify.

     2. DEADLINE-CAPPED TRIALS. Every continuation now runs against
        `solveBy = round + SOLVE_MAX - 1` and a win after that round is
        scored as a LOSS. The calibrated ~30% win rate therefore means
        "30% of the time the AI finds the win IN TIME", not "30% of the
        time it grinds one out". A certificate additionally has to land
        no earlier than SOLVE_MIN, so the published board is never a
        one-click freebie either.

     3. THE DEADLINE SHIPS WITH THE POSITION. `solveBy` is serialized
        into the payload and enforced by js/battle.js during play. Even
        a certified 4-round line does not stop a player from flailing
        for fifteen rounds, so the round limit is what actually keeps a
        session short. The HUD chip shows the countdown.

   `solveBy` is an ADDITIVE field inside the existing `v: 1` wire format
   on purpose. The server's payload check in migration 04 asserts
   `position.v = '1'` and ignores unknown keys, so publishing keeps
   working with no migration and no coordinated deploy. Deserialization
   derives a default when the field is missing, so a position staged by
   an older tab still opens.
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var TARGET_RATE = 0.3;
  var MAX_DAILY_ATTEMPTS = 2;
  var SCOUT_ATTEMPTS = 5;
  var CANDIDATES_PER_SCOUT = 10;
  var PRELIM_TRIALS = 5;
  var FINAL_TRIALS = 10;
  var ROUND_MIN = 5;
  var ROUND_MAX = 8;
  var STEP_CAP = 700;

  /* ---- THE LENGTH CONTRACT ----------------------------------------
     SOLVE_MIN/SOLVE_MAX are the owner's "3-5 rounds", counted
     INCLUSIVELY from the checkpoint round. A position that opens in
     round 6 must be won in round 6, 7, 8, 9 or 10; its `solveBy` is 10.

     SOLVE_MIN is not decoration. Without it the tempo filter's own
     success case becomes the failure mode: the very lightest boards
     (tempo below 1) are won by mashing the obvious attack in a single
     round, which is not a puzzle either. A certificate whose winning
     line lands before SOLVE_MIN rounds is rejected the same way an
     over-long one is.

     ROUND_CAP is gone. It was a safety valve that had quietly become
     the design: twenty rounds of AI-vs-AI was the definition of "this
     position is solvable". Continuations now stop at the position's own
     deadline, which is both the correct semantics and roughly four
     times less rollout work per trial. */
  var SOLVE_MIN = 3;
  var SOLVE_MAX = 5;

  /* Enemy effective HP divided by the player's total ATK - very roughly
     "how many full-team attack rounds are left in this board". Sampled
     against real solve lengths, the usable window is narrow and the
     cliff above it is total (see the header). TEMPO_MAX is set at 3.6
     rather than at the observed 4.0 cliff because the estimate ignores
     healing, shields regenerating and revives, all of which push the
     true figure up and never down. */
  var TEMPO_MIN = 1.15;
  var TEMPO_MAX = 3.6;
  var CERTIFICATE_EXTRA_SEEDS = 12;
  var CERTIFICATE_CANDIDATES = 10;
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
  var generationWorker = null;
  var generationPromise = null;
  var generationTimer = null;
  var cardPollTimer = null;

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

  function setDailyStatus(status) {
    if (status != null && $('daily-status')) $('daily-status').textContent = status;
  }

  function openModal() {
    var modal = $('daily-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.remove('ready');
    if ($('daily-title')) $('daily-title').textContent = 'Preparing a practice puzzle';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'A fresh private position is being prepared for the developer lab.';
    }
    if ($('daily-enter')) {
      $('daily-enter').hidden = true;
      $('daily-enter').disabled = false;
      $('daily-enter').dataset.action = 'play';
      var label = $('daily-enter').querySelector('span');
      if (label) label.textContent = 'Play this position';
    }
    if ($('daily-fine')) {
      $('daily-fine').textContent = 'Developer lab · not the official Daily Puzzle';
    }
    setDailyStatus('Preparing a practice puzzle…');
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
  /* The last round in which a position opening on `round` may still be
     won. One helper, used by the trial runner, the certificate, the
     serializer and the round-limit HUD, so the number the forge proved
     and the number the player is held to can never drift apart. */
  function solveDeadline(round) {
    return (round | 0) + SOLVE_MAX - 1;
  }

  function serializeBattle(B, futureSeed) {
    if (!B || !Array.isArray(B.units) || B.units.length !== 12) {
      throw new Error('Cannot serialize an invalid puzzle battle');
    }
    return {
      v: 1,
      rngSeed: futureSeed | 0,
      /* Additive field, deliberately outside `battle` - it is a rule
         about the position, not engine state. See the header for why
         this does not need a payload-version bump. */
      solveBy: solveDeadline(B.round),
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
      /* A position staged before the tempo rewrite has no `solveBy`.
         Derive the same deadline rather than refusing to open it: the
         old board is longer than we would forge today, but shipping a
         hard error would black out the Daily until the next reset. */
      puzzleSolveBy: payload.solveBy | 0 || solveDeadline(src.round),
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

  /* ---- TEMPO -------------------------------------------------------
     How many "player attack rounds" of punishment the enemy team can
     still soak. Enemy effective HP (health plus shield, which has to be
     chewed through exactly like health) over the player's total ATK,
     discounted by 0.85 because not every action is a full-power hit and
     some are heals and buffs.

     This is deliberately CRUDE. It is a prefilter that runs on every
     captured checkpoint, before any rollout, so it has to be cheap; the
     expensive, exact answer is the certified continuation. Its only job
     is to throw away the boards that cannot possibly finish in five
     rounds, and at that job the measurement says it is close to
     perfect.

     Shields count at full weight here, unlike in checkpointStrength()
     which discounts them to 0.65 as a proxy for their expiring. For
     TEMPO the pessimistic reading is the right one: a shield that has
     not expired yet is HP the player must actually remove before the
     deadline. */
  function tempo(B) {
    var foeHp = 0;
    var myAtk = 0;
    var foes = 0;
    var mine = 0;
    B.units.forEach(function (u) {
      if (!u.alive) return;
      if (u.side === 'enemy') {
        foeHp += u.hp + (u.shield || 0);
        foes++;
      } else {
        myAtk += u.baseAtk;
        mine++;
      }
    });
    /* An empty side is a finished battle, not a puzzle. Return a value
       far outside the accepted band so the caller rejects it without
       needing a separate emptiness check. */
    if (!foes || !mine || myAtk <= 0) return Infinity;
    return foeHp / (myAtk * 0.85);
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
        /* THE TEMPO GATE. Cheap, and it runs before the clone: a board
           the player cannot kill inside the deadline is not a slow
           puzzle, it is not a puzzle, and cloning it just to spend five
           twenty-round rollouts discovering that was where nearly all
           of the old forge's time went. */
        var pace = playerAlive >= 2 && enemyAlive >= 2 ? tempo(B) : Infinity;
        if (pace >= TEMPO_MIN && pace <= TEMPO_MAX) {
          candidates.push({
            state: E.cloneBattle(B, rng32(seed ^ ((candidates.length + 1) * 7919))),
            strength: checkpointStrength(B),
            tempo: pace,
            round: B.round,
          });
        }
      }

      playAiAction(B, side, E, AI);
      if (steps % 3 === 0) await yieldControl(job);
    }

    /* Health alone is not the verdict, but it is a useful queue: positions
       near a slight player disadvantage are tested first. Round distance
       is only a tie-break so the centre of the requested window wins.

       TEMPO IS NOW PART OF THE QUEUE, not just the gate. Everything that
       reaches this sort already fits the band, but within the band the
       shape still matters: 2.4 is the middle of the range that produced
       genuine 3-5 round solves, while a checkpoint sitting at 3.5 is one
       unlucky heal away from being unwinnable in time and will burn its
       whole trial budget failing. The weight (0.10) is deliberately
       smaller than the strength term's natural spread, so tempo orders
       positions of similar difficulty rather than overriding difficulty
       altogether. */
    var rescue = candidates.reduce(function (best, candidate) {
      /* The rescue slot used to be "strongest player board", which after
         the tempo gate is actively the wrong pick: the strongest boards
         inside the band are the slowest ones in it. Take the fastest
         instead - if strict certification is failing everywhere, a
         position the player can obviously close out is the safest thing
         to fall back on. */
      return !best || candidate.tempo < best.tempo ? candidate : best;
    }, null);
    candidates.sort(function (a, b) {
      var da =
        Math.abs(a.strength - 0.47) + Math.abs(a.round - 6.5) * 0.008 + Math.abs(a.tempo - 2.4) * 0.1;
      var db =
        Math.abs(b.strength - 0.47) + Math.abs(b.round - 6.5) * 0.008 + Math.abs(b.tempo - 2.4) * 0.1;
      return da - db;
    });
    /* Reserve one slot for the strongest player checkpoint in this scout.
       It is not preferred for calibration, but gives strict certification
       a safer last resort instead of making a missed reset likely when all
       near-30% candidates fail under the full search budget. */
    var selected = candidates.slice(0, Math.max(1, CANDIDATES_PER_SCOUT - 1));
    if (rescue && selected.indexOf(rescue) < 0) selected.push(rescue);
    else if (candidates[selected.length]) selected.push(candidates[selected.length]);
    return selected;
  }

  /* Play the position out and report not just WHETHER the player side
     wins but IN WHAT ROUND. `won` is the calibration verdict and it is
     deliberately narrower than "the player eventually won": a line that
     needs a sixteenth round is a loss here, because that is exactly the
     experience the rewrite exists to stop shipping.

     Timing out is reported separately from losing (`timedOut`) so the
     forge's own diagnostics can tell "the AI cannot beat this board"
     apart from "the AI beats this board slowly" - two very different
     reasons to discard a candidate, and only the second one means the
     tempo prefilter let something through it should have caught. */
  function runContinuationReport(source, seed, E, AI) {
    var B = E.cloneBattle(source, rng32(seed));
    B.rng = rng32(seed);
    B.simulation = true;
    B.silent = true;
    var startRound = B.round;
    var deadline = solveDeadline(startRound);
    var steps = 0;
    var playerActions = 0;
    var enemyActions = 0;
    var timedOut = false;
    while (!B.over && steps++ < STEP_CAP) {
      /* Checked at the TOP of the loop, before advanceAction, so a
         battle that rolls past the deadline stops immediately instead of
         playing one more free round of actions the player would never
         have been allowed to take. */
      if (B.round > deadline) {
        timedOut = true;
        break;
      }
      var side = E.advanceAction(B);
      if (!side) {
        if (!B.over) E.nextRound(B);
        continue;
      }
      if (side === 'player') playerActions++;
      else enemyActions++;
      /* Both sides choose through the same depth-4 bestAction path. In a
         certificate this means every move in the winning player line has
         survived the strongest response the shipped enemy AI can choose. */
      playAiAction(B, side, E, AI);
    }
    var solvedIn = Math.max(1, Math.min(B.round, deadline) - startRound + 1);
    return {
      /* Both clauses matter. `!timedOut` alone would accept a battle
         that the step cap ended, and `B.winner === 'player'` alone would
         accept the twenty-round grind. */
      won: !timedOut && B.winner === 'player',
      timedOut: timedOut,
      winner: B.winner || null,
      startRound: startRound,
      deadline: deadline,
      solvedIn: solvedIn,
      steps: steps,
      playerActions: playerActions,
      enemyActions: enemyActions,
    };
  }

  function runContinuation(source, seed, E, AI) {
    return runContinuationReport(source, seed, E, AI).won;
  }

  /* ---- WHY THE OPENING-LINE COUNT WAS REPLACED ---------------------
     The old tightness gate asked "how many different FIRST moves still
     win?" and demanded the answer be 1 or 2. Under the new deadline it
     stopped working, and measuring it showed why: it varies only move
     one and then hands the position back to a full-strength depth-4
     player for the rest of the line. That player repairs almost any
     opening, so the count collapsed to "nearly all of them" - 9 out of 9
     certifiable candidates in a calibration run scored 3+ and were
     rejected, which is what made the first tempo build unable to publish
     anything at all.

     Worse, the metric measured the wrong property even when it worked. A
     puzzle is not "only one legal first move"; it is "you have to keep
     playing well". The replacement (`naiveSolves`) asks that directly.

     Kept and exported because it is still a meaningful diagnostic, and
     because deleting a function the harness asserts on would hide a
     regression rather than fix one. It is no longer part of the
     publication gate. */
  function countWinningOpeningLines(source, seed, E, AI) {
    var moves = AI.candidates ? AI.candidates(source, 'player') : [];
    var deadline = solveDeadline(source.round);
    var winningMoves = 0;
    for (var m = 0; m < moves.length; m++) {
      var act = moves[m];
      var B = E.cloneBattle(source, rng32(seed));
      B.rng = rng32(seed);
      B.simulation = true;
      B.silent = true;
      var actor = B.uidMap ? B.uidMap[act.unit.uid] : null;
      if (!actor) {
        for (var ui = 0; ui < B.units.length; ui++) {
          if (B.units[ui].uid === act.unit.uid) {
            actor = B.units[ui];
            break;
          }
        }
      }
      if (!actor) continue;
      var chosen = (act.chosen || [])
        .map(function (u) {
          return B.uidMap ? B.uidMap[u.uid] : null;
        })
        .filter(Boolean);

      var res = E.useAbility(B, actor, act.ability, chosen, act.choose);
      if (!res || !res.ok) continue;

      var steps = 0;
      while (!B.over && B.round <= deadline && steps++ < STEP_CAP) {
        var side = E.advanceAction(B);
        if (!side) {
          if (!B.over) E.nextRound(B);
          continue;
        }
        playAiAction(B, side, E, AI);
      }
      if (B.winner === 'player' && B.round <= deadline) {
        winningMoves++;
        if (winningMoves > 2) return winningMoves;
      }
    }
    var Bpass = E.cloneBattle(source, rng32(seed));
    Bpass.rng = rng32(seed);
    Bpass.simulation = true;
    Bpass.silent = true;
    E.passTurn(Bpass, 'player');
    var passSteps = 0;
    while (!Bpass.over && Bpass.round <= deadline && passSteps++ < STEP_CAP) {
      var pside = E.advanceAction(Bpass);
      if (!pside) {
        if (!Bpass.over) E.nextRound(Bpass);
        continue;
      }
      playAiAction(Bpass, pside, E, AI);
    }
    /* Passing on move one and still winning inside the deadline is the
       clearest possible sign the board solves itself. It counts as a
       winning line, which pushes the position toward the >2 rejection. */
    if (Bpass.winner === 'player' && Bpass.round <= deadline) {
      winningMoves++;
    }
    return winningMoves;
  }

  /* ---- THE OBVIOUS-MOVE TEST ---------------------------------------
     Replay the identical position and the identical RNG stream, but let
     the PLAYER side play badly: take the top heuristically-ordered
     candidate every turn with no lookahead at all, while the enemy keeps
     its full depth-4 search. That is a fair model of a player who reads
     each board once and clicks the move that looks strongest.

     If that player also wins inside the deadline, the position is not a
     puzzle - it is a board that wins itself, and the certified "winning
     line" was never a line the player had to find. Rejecting on this is
     what stops the tempo filter from over-correcting: a very light board
     (tempo near 1) is fast precisely because everything works on it, and
     fast-and-trivial is not the ruling.

     The naive player deliberately uses AI.candidates() ordering rather
     than a random legal move. Random play loses to everything and would
     certify every position; the heuristic ordering is roughly "what an
     attentive human would try first", which is the standard the puzzle
     actually has to beat. */
  function naiveSolves(source, seed, E, AI) {
    var B = E.cloneBattle(source, rng32(seed));
    B.rng = rng32(seed);
    B.simulation = true;
    B.silent = true;
    var deadline = solveDeadline(source.round);
    var steps = 0;
    while (!B.over && steps++ < STEP_CAP) {
      if (B.round > deadline) return false;
      var side = E.advanceAction(B);
      if (!side) {
        if (!B.over) E.nextRound(B);
        continue;
      }
      if (side !== 'player') {
        playAiAction(B, side, E, AI);
        continue;
      }
      var moves = AI.candidates ? AI.candidates(B, 'player') : [];
      if (!moves.length) {
        E.passTurn(B, 'player');
        continue;
      }
      var act = moves[0];
      var res = E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
      /* Same guard as playAiAction: never let a malformed candidate spin
         the loop forever on one decision. */
      if (!res || !res.ok) B.acted.player[act.unit.uid] = true;
    }
    return B.winner === 'player';
  }

  async function addTrials(rec, total, seed, candidateNo, job, E, AI) {
    rec.winningSeeds = rec.winningSeeds || [];
    while (rec.trials < total) {
      var trialSeed = (seed + candidateNo * 104729 + rec.trials * 7919) | 0;
      if (runContinuation(rec.candidate.state, trialSeed, E, AI)) {
        rec.wins++;
        rec.winningSeeds.push(trialSeed);
      }
      rec.trials++;
      /* A whole continuation is intentionally the largest synchronous
         chunk. Yielding after every trial keeps Cancel responsive between
         searches. */
      await yieldControl(job);
    }
    rec.rate = rec.wins / rec.trials;
    rec.distance = Math.abs(rec.rate - TARGET_RATE);
    return rec;
  }

  /* A sampled win is not enough: scouting deliberately uses a tiny budget,
     and publishing under an unrelated RNG stream used to invalidate even
     that evidence. Re-run exact winning seeds first, then deterministic
     extras, with the override removed so both sides use the full normal
     depth-4 gameplay budget. Only the seed that wins this strict replay is
     serialized into the puzzle. */
  async function certifyRecord(rec, generationSeed, job, E, AI) {
    if (rec.certificateTested) return null;
    rec.certificateTested = true;
    var borrowedBudget = AI.simulationBudget ? AI.simulationBudget() : null;
    var seeds = (rec.winningSeeds || []).slice();
    var seen = {};
    seeds.forEach(function (value) {
      seen[value | 0] = true;
    });
    for (var i = 0; i < CERTIFICATE_EXTRA_SEEDS; i++) {
      var extra =
        (generationSeed ^
          Math.imul((rec.candidateNo || 1) + i + 1, 0x9e3779b1) ^
          Math.imul(i + 17, 0x85ebca6b)) |
        0;
      if (!seen[extra]) {
        seen[extra] = true;
        seeds.push(extra);
      }
    }

    AI.setDepth(4);
    AI.clearSimulationBudget();
    try {
      for (var s = 0; s < seeds.length; s++) {
        assertCurrent(job);
        var report = runContinuationReport(rec.candidate.state, seeds[s], E, AI);
        /* `report.won` already carries the SOLVE_MAX ceiling. The floor
           is applied here rather than inside the report because a fast
           win is a perfectly good CALIBRATION result - it tells the
           sampler the board is winnable - it is just not a publishable
           puzzle. Keeping the two ideas apart stops a one-move board
           from being scored as unwinnable and dragging the whole
           candidate's rate away from the 30% target for the wrong
           reason. */
        if (report.won && report.solvedIn >= SOLVE_MIN) {
          /* Enforce puzzle tightness: the position must NOT fall to a
             player who simply takes the best-looking move every turn.
             See naiveSolves() for why this replaced the opening-line
             count. Evaluated only after a win is already certified, so
             the expensive second playout runs at most once per record. */
          if (!naiveSolves(rec.candidate.state, seeds[s], E, AI)) {
            rec.futureSeed = seeds[s] | 0;
            rec.certificate = {
              depth: 4,
              budget: 'normal',
              steps: report.steps,
              playerActions: report.playerActions,
              enemyActions: report.enemyActions,
              testedSeeds: s + 1,
              /* Recorded as proof the gate ran, not as a threshold. */
              naiveSolves: false,
              /* The proof carries its own length. `solvedIn` is the
                 headline number for the owner ruling and `solveBy` is
                 what battle.js enforces; publishing both means a stored
                 position can be audited after the fact without re-running
                 the forge. */
              solvedIn: report.solvedIn,
              solveBy: report.deadline,
              startRound: report.startRound,
              tempo: Math.round((rec.candidate.tempo || 0) * 100) / 100,
            };
            return rec;
          }
        }
        await yieldControl(job);
      }
      return null;
    } finally {
      if (borrowedBudget) AI.setSimulationBudget(borrowedBudget);
      else AI.clearSimulationBudget();
    }
  }

  function compareRecords(a, b) {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.trials !== b.trials) return b.trials - a.trials;
    return Math.abs(a.candidate.round - 6.5) - Math.abs(b.candidate.round - 6.5);
  }

  async function generatePosition(job, seed) {
    var E = window.EOL.engine;
    var AI = window.EOL.ai;
    if (!E || !AI || !window.EOL.rules || !window.EOL.rules.splitCapped) {
      throw new Error('Puzzle systems are not ready');
    }

    var oldDepth = AI.SEARCH_DEPTH || 4;
    var oldBudget = AI.simulationBudget ? AI.simulationBudget() : null;
    var records = [];
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
            candidateNo: candidateNo,
            wins: 0,
            trials: 0,
            rate: 0,
            distance: Infinity,
            winningSeeds: [],
          };
          records.push(rec);
          await addTrials(rec, PRELIM_TRIALS, seed ^ (attempt * 65537), candidateNo, job, E, AI);

          /* Five trials can express 20% or 40%, both close enough to earn
             a second sample. Only accept after ten—and only after a full
             depth-4 replay certifies its exact published RNG stream.

             THE BAND WIDENED FROM 0.2-0.4 TO 0.2-0.8 (2026-08-16). The
             old narrow band assumed the fast-budget win rate was a
             difficulty dial. Under a deadline it is not: the same
             checkpoint scores near 0 or near 1 depending on whether the
             crippled scouting budget happens to find the tempo line in
             time, and measured rates cluster at the ends rather than
             spreading around 0.3. Holding the old window discarded most
             genuinely certifiable positions on sampling noise. Difficulty
             is now enforced where it is actually measured - the SOLVE_MIN
             floor and the obvious-move test in certifyRecord, both run at
             full depth-4 strength. This screen's remaining job is just to
             skip candidates that never win, cheaply. */
          if (rec.rate >= 0.2) {
            await addTrials(rec, FINAL_TRIALS, seed ^ (attempt * 65537), candidateNo, job, E, AI);
            if (rec.rate >= 0.2 && rec.rate <= 0.8) {
              var certified = await certifyRecord(rec, seed, job, E, AI);
              if (certified) return certified;
            }
          }
        }
      }

      if (!records.length) throw new Error('No stable player checkpoint appeared in rounds 5–8');
      records.sort(compareRecords);
      /* The old fallback returned the numerically closest rate even when it
         had zero player wins. A forge may now fail and retry, but it can
         never publish an impossible or unproven position. */
      var finalists = records.slice(0, CERTIFICATE_CANDIDATES);
      for (var f = 0; f < finalists.length; f++) {
        var finalist = finalists[f];
        if (finalist.trials < FINAL_TRIALS) {
          await addTrials(
            finalist,
            FINAL_TRIALS,
            seed ^ 0x51f15e,
            finalist.candidateNo,
            job,
            E,
            AI
          );
        }
      }
      /* Re-rank after every finalist has the same sample size; otherwise a
         lucky 2/5 screen could outrank a genuinely closer ten-trial rate. */
      finalists.sort(compareRecords);
      for (var c = 0; c < finalists.length; c++) {
        var fallbackCertificate = await certifyRecord(finalists[c], seed, job, E, AI);
        if (fallbackCertificate) return fallbackCertificate;
      }

      /* Calibration remains the first priority. Only after every closest
         rate fails strict replay do we try each scout's player-strongest
         checkpoint, which materially improves publication reliability
         while retaining the same non-negotiable certificate gate. */
      var rescues = records
        .filter(function (record) {
          return !record.certificateTested;
        })
        .sort(function (a, b) {
          return b.candidate.strength - a.candidate.strength;
        })
        .slice(0, SCOUT_ATTEMPTS);
      for (var r = 0; r < rescues.length; r++) {
        if (rescues[r].trials < FINAL_TRIALS) {
          await addTrials(
            rescues[r],
            FINAL_TRIALS,
            seed ^ 0x2c1b3c6d,
            rescues[r].candidateNo,
            job,
            E,
            AI
          );
        }
        var rescueCertificate = await certifyRecord(rescues[r], seed, job, E, AI);
        if (rescueCertificate) return rescueCertificate;
      }
      throw new Error('No full-depth winning line could be certified; puzzle was not published');
    } finally {
      /* AI configuration is global. The forge borrows it, then restores it
         exactly even on Cancel/error so normal matches and sim tools are
         never silently left on the fast calibration budget. */
      AI.setDepth(oldDepth);
      if (oldBudget) AI.setSimulationBudget(oldBudget);
      else AI.clearSimulationBudget();
    }
  }

  function showReady(rec) {
    if (rec.futureSeed == null || !rec.certificate) {
      throw new Error('Practice puzzle is missing its winning-line certificate');
    }
    readyPuzzle = {
      state: rec.candidate.state,
      round: rec.candidate.round,
      liveSeed: rec.futureSeed | 0,
      solveBy: rec.certificate.solveBy,
    };
    var modal = $('daily-modal');
    if (modal) modal.classList.add('ready');
    if ($('daily-title')) $('daily-title').textContent = 'Practice position ready';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'A fresh private position is ready. Enter the battle and find the winning line.';
    }
    if ($('daily-enter')) $('daily-enter').hidden = false;
    if ($('daily-fine')) {
      $('daily-fine').textContent = 'Developer lab · not the official Daily Puzzle';
    }
    setDailyStatus('Ready to play');
  }

  function showError() {
    if ($('daily-title')) $('daily-title').textContent = 'The practice puzzle is unavailable';
    if ($('daily-copy')) {
      $('daily-copy').textContent = 'A playable practice position could not be prepared this time.';
    }
    setDailyStatus('Try again in a moment');
    var enter = $('daily-enter');
    if (enter) {
      enter.hidden = false;
      enter.dataset.action = 'lab-retry';
      var label = enter.querySelector('span');
      if (label) label.textContent = 'Try again';
    }
  }

  function showOfficialError() {
    if ($('daily-title')) $('daily-title').textContent = 'The puzzle is unavailable';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'The official position could not be reached. Your attempt has not been consumed.';
    }
    setDailyStatus('Try again in a moment');
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

  function supabaseClient() {
    return window.EOL.auth && window.EOL.auth.rawClient ? window.EOL.auth.rawClient() : null;
  }

  function signedInUser() {
    return window.EOL.auth && window.EOL.auth.user ? window.EOL.auth.user() : null;
  }

  /* May THIS build take a generation lease and publish the shared board?
     Only builds with real accounts may: see maybeForgeShared. */
  function canForgeDaily() {
    var p = window.EOL.platform;
    return !p || p.canForgeDaily !== false;
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function easternClock(date) {
    var out = {};
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(date || new Date())
        .forEach(function (part) {
          if (part.type !== 'literal') out[part.type] = Number(part.value);
        });
    } catch (e) {
      return null;
    }
    return out;
  }

  function inGenerationWindow() {
    var p = easternClock(new Date());
    return !!p && p.hour === 6 && p.minute >= 55;
  }

  function idleForBackgroundForge() {
    var view = document.body.dataset.view;
    return view !== 'battle' && view !== 'prep' && view !== 'draft';
  }

  function setDailyCardBuilding(building) {
    var card = $('mode-daily');
    if (!card) return;
    card.disabled = !!building;
    card.classList.toggle('forging', !!building);
    card.setAttribute('aria-busy', building ? 'true' : 'false');
    card.title = building ? 'The shared Daily Puzzle is being generated.' : '';
    var cta = $('daily-card-cta');
    if (cta) {
      cta.innerHTML = building
        ? 'Puzzle under construction <i class="ri-hammer-line"></i>'
        : 'Today’s puzzle <i class="ri-arrow-right-line"></i>';
    }
    if (!building && cardPollTimer) {
      clearTimeout(cardPollTimer);
      cardPollTimer = null;
    }
  }

  async function pollDailyCard() {
    if (cardPollTimer) {
      clearTimeout(cardPollTimer);
      cardPollTimer = null;
    }
    if (!signedInUser()) {
      setDailyCardBuilding(false);
      return;
    }
    var client = supabaseClient();
    if (!client) return;
    try {
      var response = await client.rpc('daily_puzzle_status').maybeSingle();
      if (!response.error && response.data) {
        setDailyCardBuilding(false);
        return;
      }
    } catch (e) {
      /* The next poll retries; card status must never break navigation. */
    }
    setDailyCardBuilding(true);
    /* If a lease holder disappeared, this becomes eligible as soon as its
       lease expires. The RPC still guarantees only one browser wins. */
    maybeForgeShared(true, false);
    cardPollTimer = setTimeout(pollDailyCard, 5000);
  }

  function paintSharedForge() {
    var modal = $('daily-modal');
    if (!modal || modal.getAttribute('aria-hidden') === 'true') return;
    modal.classList.remove('ready');
    if ($('daily-title')) $('daily-title').textContent = 'Puzzle under construction';
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        'Today’s shared position is still being prepared. This window will update automatically when it is ready.';
    }
    if ($('daily-enter')) $('daily-enter').hidden = true;
    setDailyStatus('Waiting for today’s puzzle…');
  }

  function generateInWorker(lease) {
    if (!window.Worker) {
      return generatePosition(jobSeq, randomSeed()).then(function (rec) {
        if (rec.futureSeed == null || !rec.certificate) {
          throw new Error('Daily forge did not return a winning-line certificate');
        }
        var futureSeed = rec.futureSeed | 0;
        var metrics = {
          round: rec.candidate.round,
          wins: rec.wins,
          trials: rec.trials,
          rate: rec.rate,
          forgeMs: 0,
          certificate: rec.certificate,
        };
        return {
          token: lease.token,
          puzzleDay: lease.puzzle_day,
          payload: {
            v: 1,
            position: serializeBattle(rec.candidate.state, futureSeed),
            meta: metrics,
            generatedAt: new Date().toISOString(),
          },
          metrics: metrics,
        };
      });
    }

    return new Promise(function (resolve, reject) {
      var worker = new Worker(new URL('js/daily-worker.js', document.baseURI));
      generationWorker = worker;
      worker.onmessage = function (event) {
        var msg = event.data || {};
        if (msg.token !== lease.token) return;
        worker.terminate();
        generationWorker = null;
        if (msg.kind === 'complete') resolve(msg);
        else reject(new Error(msg.message || 'Puzzle generation failed'));
      };
      worker.onerror = function (event) {
        worker.terminate();
        generationWorker = null;
        reject(new Error(event.message || 'Puzzle worker failed'));
      };
      worker.postMessage({
        kind: 'generate',
        token: lease.token,
        puzzleDay: lease.puzzle_day,
      });
    });
  }

  /* Browser-coordinated publication: the database grants one short lease,
     so a crowd of open clients still runs exactly one forge. */
  function maybeForgeShared(recover, visible) {
    if (generationPromise) return generationPromise;
    if (!signedInUser()) return Promise.resolve(false);
    /* PORTAL BUILDS NEVER FORGE. The CrazyGames build signs in
       anonymously so the shared board and the two-attempt ledger keep
       working - but an anonymous session satisfies signedInUser(), which
       would let portal tabs win the 6:55 lease and generate the puzzle
       THE WHOLE PLAYERBASE receives. They consume the Daily; they do not
       produce it. */
    if (!canForgeDaily()) return Promise.resolve(false);
    if (!recover && !idleForBackgroundForge()) return Promise.resolve(false);
    var client = supabaseClient();
    if (!client) return Promise.resolve(false);

    generationPromise = (async function () {
      var claim = await client
        .rpc('claim_daily_generation', { p_recover: !!recover })
        .maybeSingle();
      if (claim.error) throw claim.error;
      if (!claim.data) {
        if (recover) pollDailyCard();
        return false;
      }
      if (recover) setDailyCardBuilding(true);
      if (visible) paintSharedForge();

      var candidate = await generateInWorker(claim.data);
      var submitted = await client.rpc('submit_daily_candidate', {
        p_token: claim.data.token,
        p_puzzle_day: claim.data.puzzle_day,
        p_payload: candidate.payload,
        p_metrics: candidate.metrics,
      });
      if (submitted.error) throw submitted.error;
      document.dispatchEvent(
        new CustomEvent('eol:daily-published', { detail: claim.data.puzzle_day })
      );
      if (recover) setDailyCardBuilding(false);
      return true;
    })()
      .catch(function (error) {
        console.warn('[daily puzzle forge]', error && error.message ? error.message : error);
        if (recover) pollDailyCard();
        return false;
      })
      .finally(function () {
        generationPromise = null;
      });
    return generationPromise;
  }

  function armGenerationClock() {
    if (generationTimer) clearTimeout(generationTimer);
    if (!signedInUser()) return;
    /* No lease, no need for the 6:55 alarm either (maybeForgeShared). */
    if (!canForgeDaily()) return;

    var now = Date.now();
    var next = null;
    /* Find the next 6:55 Eastern minute. Iterating wall-clock minutes is
       simple and handles both DST jumps without maintaining an offset. */
    for (var i = 0; i <= 1500; i++) {
      var probe = new Date(now + i * 60000);
      var p = easternClock(probe);
      if (p && p.hour === 6 && p.minute === 55 && probe.getTime() > now + 1000) {
        next = probe.getTime();
        break;
      }
    }
    if (!next) return;
    generationTimer = setTimeout(
      async function tick() {
        if (inGenerationWindow()) {
          await maybeForgeShared(false, false);
          generationTimer = setTimeout(tick, 30000);
        } else {
          armGenerationClock();
        }
      },
      Math.max(1000, next - now)
    );
  }

  function beginClientScheduler(user) {
    if (generationTimer) {
      clearTimeout(generationTimer);
      generationTimer = null;
    }
    if (!user) {
      setDailyCardBuilding(false);
      return;
    }
    /* One cheap server check recovers a missed reset. During 6:55–6:59,
       follow it with the next-day staging request. */
    maybeForgeShared(true, false).then(function () {
      if (inGenerationWindow()) return maybeForgeShared(false, false);
      return false;
    });
    armGenerationClock();
  }

  function askForAccount() {
    var account = $('acct-btn');
    if (account) account.click();
    if (window.EOL.ui && window.EOL.ui.toast) {
      window.EOL.ui.toast('Sign in to claim two official Daily Puzzle attempts', 'ri-lock-line');
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
    try {
      await yieldControl(myJob);
      var rec = await generatePosition(myJob, seed);
      assertCurrent(myJob);
      showReady(rec);
    } catch (err) {
      if (err && err.name === 'DailyPuzzleCancelled') return;
      console.error('[daily puzzle]', err);
      if (myJob === jobSeq) showError();
    }
  }

  function attemptCounts(row) {
    var used =
      row && row.attempts_used != null
        ? Number(row.attempts_used)
        : row && row.attempted
          ? MAX_DAILY_ATTEMPTS
          : 0;
    if (!isFinite(used)) used = 0;
    used = Math.max(0, Math.min(MAX_DAILY_ATTEMPTS, Math.floor(used)));
    var remaining =
      row && row.attempts_remaining != null
        ? Number(row.attempts_remaining)
        : MAX_DAILY_ATTEMPTS - used;
    if (!isFinite(remaining)) remaining = MAX_DAILY_ATTEMPTS - used;
    remaining = Math.max(0, Math.min(MAX_DAILY_ATTEMPTS, Math.floor(remaining)));
    /* SOLVING IT ENDS THE DAY. The second attempt exists to give a
       player who lost another crack at the same shared position - it
       was never a replay token for a puzzle already beaten. A solver
       who spends it can only match their own result, and a leaderboard
       that counts "solved in N rounds" would quietly reward whoever
       burned a redundant attempt to shave a round off. Once won, the
       day is closed. The database enforces the same rule (migration
       10); this keeps the UI honest even against a stale status row. */
    if (row && row.won) remaining = 0;
    return { used: used, remaining: remaining, won: !!(row && row.won) };
  }

  function showOfficialStatus(row) {
    setDailyCardBuilding(false);
    var modal = $('daily-modal');
    if (modal) modal.classList.add('ready');
    var count = attemptCounts(row);
    setDailyStatus(
      count.won
        ? 'Solved · come back at the next reset'
        : count.remaining > 0
          ? 'Ready · ' +
            count.remaining +
            ' attempt' +
            (count.remaining === 1 ? '' : 's') +
            ' remaining'
          : 'Both attempts have been used'
    );
    if ($('daily-fine')) $('daily-fine').textContent = 'Resets every day at 7:00 AM Eastern Time';

    var enter = $('daily-enter');
    if (count.remaining <= 0) {
      if ($('daily-title'))
        $('daily-title').textContent = count.won ? 'Puzzle solved' : 'Both attempts spent';
      if ($('daily-copy')) {
        $('daily-copy').textContent = count.won
          ? count.used === 1
            ? 'You solved today’s position on your first attempt. A new shared position arrives at the next reset.'
            : 'You found today’s winning line. A new shared position arrives at the next reset.'
          : row.finished
            ? 'Both lines are closed. A new shared position arrives at the next reset.'
            : 'Both attempts were claimed when their battles opened and cannot be replayed today.';
      }
      if (enter) enter.hidden = true;
      return;
    }

    if ($('daily-title')) {
      $('daily-title').textContent =
        count.used === 0 ? 'Today’s position awaits' : 'Second attempt awaits';
    }
    if ($('daily-copy')) {
      $('daily-copy').textContent =
        count.used === 0
          ? 'Everyone receives this exact board and this exact future luck. Opening the battle consumes the first of your two attempts.'
          : 'Your first attempt is spent. Opening the battle again consumes your final attempt on the same shared position.';
    }
    if (enter) {
      enter.hidden = false;
      enter.disabled = false;
      enter.dataset.action = 'claim';
      var label = enter.querySelector('span');
      if (label)
        label.textContent = count.used === 0 ? 'Begin first attempt' : 'Begin second attempt';
    }
  }

  async function readOfficialStatus(job) {
    var client = supabaseClient();
    if (!client) throw new Error('Account service is offline');
    var response = await client.rpc('daily_puzzle_status').maybeSingle();
    assertCurrent(job);
    if (response.error) throw response.error;
    return response.data || null;
  }

  async function loadOfficialStatus(job) {
    var row = await readOfficialStatus(job);
    if (row) {
      showOfficialStatus(row);
      return;
    }

    /* No current row means nobody was online for the scheduled forge.
       Recover in this browser (or wait for the other lease holder), then
       poll until the server atomically exposes the completed position. */
    setDailyCardBuilding(true);
    paintSharedForge();
    await maybeForgeShared(true, true);
    for (var i = 0; i < 75; i++) {
      await delay(2000);
      row = await readOfficialStatus(job);
      if (row) {
        showOfficialStatus(row);
        return;
      }
      /* If another browser crashed with the lease, retry periodically;
         the server awards it only after that lease expires. */
      if (i > 0 && i % 5 === 0) await maybeForgeShared(true, true);
      setDailyStatus('Waiting for today’s puzzle…');
    }
    throw new Error('Today’s puzzle is still being forged');
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
    setDailyStatus('Checking today’s puzzle…');
    try {
      await loadOfficialStatus(myJob);
    } catch (err) {
      if (err && err.name === 'DailyPuzzleCancelled') return;
      console.error('[daily puzzle]', err);
      if (myJob === jobSeq) showOfficialError();
    }
  }

  function start() {
    /* `?dailyLab=1` keeps the original browser forge reachable for
       balancing work without weakening the two-attempt official mode. */
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
    setDailyStatus('Opening today’s puzzle…');
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
      var state = deserializeBattle(packet.position);
      readyPuzzle = {
        state: state,
        round: state.round,
        solveBy: state.puzzleSolveBy,
        liveSeed: packet.position.rngSeed | 0,
        official: true,
        puzzleId: row.puzzle_id,
        puzzleDay: row.puzzle_day,
        attemptNo: Number(row.attempt_no || 1),
      };
      enterPuzzle();
    } catch (err) {
      console.error('[daily puzzle claim]', err);
      if (job !== jobSeq) return;
      /* Another tab may have claimed the remaining allowance between the
         status read and this click. Refresh from the atomic server count. */
      try {
        await loadOfficialStatus(job);
      } catch (statusErr) {
        showOfficialError();
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
      attemptNo: readyPuzzle.attemptNo || null,
      startRound: readyPuzzle.round,
      /* The round limit travels with the puzzle rather than being
         recomputed in battle.js. A lab position, a freshly published
         one and a legacy one can legitimately have different deadlines,
         and the only correct value is the one its certificate proved. */
      solveBy: readyPuzzle.solveBy || solveDeadline(readyPuzzle.round),
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
    /* Quest metric `dailyPuzzle` - the one objective that cannot be
       farmed at all, because the server grants two attempts per reset
       and a win closes the day. Counted per completed attempt, win or
       lose, so a hard board is not a wasted quest. */
    if (window.EOL.quests && !B.puzzle._questCounted) {
      B.puzzle._questCounted = true;
      window.EOL.quests.record('dailyPuzzle', 1);
    }
    if (B.puzzle.official && B.puzzle.id && !B.puzzle._reported) {
      B.puzzle._reported = true;
      var client = supabaseClient();
      if (client) {
        client
          .rpc('finish_daily_attempt', {
            p_puzzle: B.puzzle.id,
            p_attempt: B.puzzle.attemptNo || 1,
            p_won: !!win,
            p_rounds: B.round,
          })
          .then(function (response) {
            if (response.error) console.warn('[daily puzzle result]', response.error.message);
          });
      }
    }
    /* Running out of rounds is its own defeat and reads very differently
       from being wiped out - the player may still have a full team on
       the board. Saying "Line Broken / your team has fallen" there would
       be simply untrue, and it hides the actual lesson, which is that
       the solution was faster than what they played. */
    var expired = !win && B._puzzleExpired;
    return {
      puzzle: true,
      title: win ? 'Puzzle Solved' : expired ? 'Out of Rounds' : 'Line Broken',
      sub: expired
        ? (B.puzzle.official && (B.puzzle.attemptNo || 1) < MAX_DAILY_ATTEMPTS
            ? 'The winning line is shorter than that. One attempt remains before the 7:00 AM Eastern reset.'
            : B.puzzle.official
              ? 'The winning line is shorter than that. A new position arrives at 7:00 AM Eastern.'
              : 'The winning line is shorter than that. Forge another position and try again.')
        : win
        ? B.puzzle.official
          ? /* A win closes the day - there is no replay to offer. */
            'You found the winning line. A new position arrives at 7:00 AM Eastern.'
          : 'You turned a losing story into a victory.'
        : B.puzzle.official
          ? (B.puzzle.attemptNo || 1) < MAX_DAILY_ATTEMPTS
            ? 'One attempt remains on this position before the 7:00 AM Eastern reset.'
            : 'Both lines are closed. A new position arrives at 7:00 AM Eastern.'
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
    if (window.EOL.auth && window.EOL.auth.onChange) {
      window.EOL.auth.onChange(beginClientScheduler);
    }
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
    _runContinuationReport: runContinuationReport,
    _tempo: tempo,
    _naiveSolves: naiveSolves,
    _solveDeadline: solveDeadline,
    _limits: {
      solveMin: SOLVE_MIN,
      solveMax: SOLVE_MAX,
      tempoMin: TEMPO_MIN,
      tempoMax: TEMPO_MAX,
      roundMin: ROUND_MIN,
      roundMax: ROUND_MAX,
    },
    _serializeBattle: serializeBattle,
    _deserializeBattle: deserializeBattle,
    _attemptCounts: attemptCounts,
    _showOfficialStatus: showOfficialStatus,
    _generatePosition: function (seed) {
      return generatePosition(jobSeq, seed | 0);
    },
  };
})();
