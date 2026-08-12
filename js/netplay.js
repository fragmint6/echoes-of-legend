/* =============================================================
 * Multiplayer match play - bans, formation and battle over the wire
 * -------------------------------------------------------------
 * WHAT THIS SOLVES
 *
 *   Two people, two computers, one match. Neither machine is a
 *   server, so both must arrive at the same board without either one
 *   being able to lie cheaply or drift silently.
 *
 * THE THREE HARD PROBLEMS AND THEIR ANSWERS
 *
 * 1. NAMING. `uid` is a page-global counter, so hero u7 on my screen
 *    is a different hero on yours. Nothing may ever be addressed by
 *    uid. Every wire reference is (side, idx) where `idx` is the
 *    hero's fixed position in its team array, and `side` is flipped
 *    on receipt: my 'player' is your 'enemy'. `mirrorSide()` is the
 *    only place that flip happens.
 *
 * 2. PERSPECTIVE. Each client insists it is 'player'. That is fine
 *    for rendering and fatal for turn order, because both would open
 *    round 1. The engine now takes `oddFirst`: the host passes
 *    'player', the guest passes 'enemy', and the alternation lines
 *    up. Same battle, two cameras.
 *
 * 3. LUCK. Crits, coin flips and the Ancient Ruins relic all roll
 *    dice. Two independent Math.random streams would desync on the
 *    first crit. Both clients seed one mulberry32 from the match
 *    seed and consume it in the same order, because they replay the
 *    same actions in the same sequence.
 *
 * DESYNC IS DETECTED, NOT ASSUMED AWAY
 *
 *   Every action carries a checksum of the sender's board state
 *   BEFORE the move. The receiver compares it to its own. A mismatch
 *   means the two simulations have diverged, which is either a bug
 *   or tampering, and the match is stopped and said out loud rather
 *   than quietly played out on two different boards.
 *
 * WHAT THIS IS NOT
 *
 *   Not server-authoritative. Both clients run the engine and trust
 *   each other's moves, so a modified client can still cheat within
 *   the rules its own engine enforces. The checksum catches drift,
 *   not a determined attacker. Real anti-cheat needs the action log
 *   replayed server-side, which is the next milestone and is why
 *   nothing here writes trophies.
 * ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var S = null; // live match session

  function MP() {
    return window.EOL.mp;
  }
  function E() {
    return window.EOL.engine;
  }

  /* my 'player' is their 'enemy' - the single point of reflection */
  function mirrorSide(side) {
    return side === 'player' ? 'enemy' : 'player';
  }

  /* ---------------------------------------------------------
     ordered, checksummed transport
     -------------------------------------------------------------
     Realtime broadcast does not promise ordering, so every message
     carries a sequence number and anything arriving early is parked
     until its turn comes. Without this a fast double-action could
     apply in reverse and desync both boards.
     --------------------------------------------------------- */
  function newSession(match) {
    return {
      match: match,
      host: !!match.host,
      seq: 0, // next sequence number WE will send
      expect: 0, // next sequence number we will accept
      parked: {}, // seq -> payload that arrived early
      pendingAction: null, // resolver waiting on the opponent's move
      dead: false,
      onDesync: null,
    };
  }

  function send(kind, body) {
    if (!S || S.dead) return;
    var msg = { kind: kind, seq: S.seq++, body: body };
    MP().send('net', msg);
  }

  function receive(msg) {
    if (!S || S.dead || !msg || typeof msg.seq !== 'number') return;
    if (msg.seq > S.expect) {
      S.parked[msg.seq] = msg; // out of order - hold it
      return;
    }
    if (msg.seq < S.expect) return; // duplicate
    S.expect++;
    dispatch(msg);
    while (S.parked[S.expect]) {
      var nxt = S.parked[S.expect];
      delete S.parked[S.expect];
      S.expect++;
      dispatch(nxt);
    }
  }

  function dispatch(msg) {
    if (msg.kind === 'forfeit') onRemoteForfeit();
    else if (msg.kind === 'deck') onRemoteDeck(msg.body);
    else if (msg.kind === 'bans') onRemoteBans(msg.body);
    else if (msg.kind === 'six') onRemoteSix(msg.body);
    else if (msg.kind === 'act') onRemoteAction(msg.body);
    else if (msg.kind === 'quit') fail('Your opponent left the match.');
  }

  /* They conceded. This is a WIN, not an error - it must end the
     battle on the result screen, never bounce us to the menu the way
     a disconnect does. */
  function onRemoteForfeit() {
    if (!S || S.dead) return;
    var B = window.EOL.battle && window.EOL.battle.getState();
    if (B && !B.over) {
      B.over = true;
      B.winner = 'player';
      /* We are almost certainly parked on decide(), waiting for the
         move they will now never send. Release it so the battle loop
         unwinds and reaches endBattle() instead of hanging on the
         board forever. */
      var p = S.pendingAction;
      S.pendingAction = null;
      if (p) p.resolve(null);
      if (S.onForfeitWin) S.onForfeitWin();
      return;
    }
    fail('Your opponent forfeited.');
  }

  function fail(text) {
    if (!S || S.dead) return;
    S.dead = true;
    /* Release anyone awaiting a move, or the battle loop hangs on a
       promise that will never settle. */
    if (S.pendingAction) {
      var rej = S.pendingAction.reject;
      S.pendingAction = null;
      rej(new Error(text));
    }
    if (S.onDesync) S.onDesync(text);
  }

  /* ---------------------------------------------------------
     board checksum
     -------------------------------------------------------------
     Order-stable and perspective-independent: units are keyed by
     (side, idx) with the side mirrored into the HOST's frame, so both
     clients hash the same board even though each calls itself
     'player'. Cheap enough to run on every action.
     --------------------------------------------------------- */
  /* Some flags hold a UID rather than a value - `counterSrc` names who
     swings back, `burnSrc` who lit the fire. Uids come from a
     page-global counter, so the same hero is u1 here and u19 there.
     Hashing them raw would report a desync on every single one of
     them, which is a false alarm: each engine resolves its own uids
     locally and both mean the same hero.

     They still have to be CHECKED though - "who is the counter-attacker"
     is real game state. So a uid is translated to the stable
     (side, idx) name before hashing, exactly like a wire reference. */
  var UID_FLAGS = { counterSrc: 1, burnSrc: 1 };

  function checksum(B) {
    if (!B) return '0';
    var mine = S && S.host ? 'player' : 'enemy'; // my side, in host frame
    var theirs = mine === 'player' ? 'enemy' : 'player';
    var name = {};
    B.units.forEach(function (u) {
      name[u.uid] = (u.side === 'player' ? mine : theirs) + '/' + u.idx;
    });
    var rows = B.units
      .map(function (u) {
        var side = u.side === 'player' ? mine : theirs;
        var fl = [];
        for (var k in u.flags) {
          if (!u.flags[k]) continue;
          fl.push(k + '=' + (UID_FLAGS[k] ? name[u.flags[k]] || '?' : u.flags[k]));
        }
        return [
          side,
          u.idx,
          u.alive ? 1 : 0,
          Math.round(u.hp),
          Math.round(u.shield),
          u.slot,
          fl.sort().join(','),
          /* who granted the shield, translated the same way */
          u.shieldSrc ? name[u.shieldSrc] || '?' : '',
        ].join(':');
      })
      .sort()
      .join('|');
    var eMine = S && S.host ? B.energy.player : B.energy.enemy;
    var eTheirs = S && S.host ? B.energy.enemy : B.energy.player;
    return hash([B.round, eMine, eTheirs, rows].join('#'));
  }

  /* FNV-1a. Not cryptographic - this catches divergence, not attack. */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  /* ---------------------------------------------------------
     phase 1 - bans
     -------------------------------------------------------------
     Both players ban blind and simultaneously, exactly as against the
     bot. Each side sends its two card ids; the reveal waits until BOTH
     have arrived, so neither can see the other's bans in time to
     change their own.
     --------------------------------------------------------- */
  /* The two clients do not reach a phase at the same instant - the
     draft's settle animation, a slower machine, or simply a faster
     decision all mean their submission can arrive before we have even
     built the screen that waits for it. So the payload is LATCHED the
     moment it lands and replayed when the phase opens. Dropping an
     early message here would hang the match forever. */
  var bans = { mine: null, theirs: null, done: null };

  function startBans(cb) {
    bans.mine = null;
    bans.done = cb;
    maybeRevealBans(); // theirs may already be latched
  }

  function submitBans(ids) {
    if (!S || S.dead) return;
    bans.mine = ids.slice();
    send('bans', { ids: bans.mine });
    maybeRevealBans();
  }

  function onRemoteBans(body) {
    bans.theirs = (body.ids || []).slice();
    maybeRevealBans();
  }

  function maybeRevealBans() {
    if (!bans.mine || !bans.theirs || !bans.done) return;
    var cb = bans.done;
    var theirs = bans.theirs;
    bans.done = null;
    cb(theirs);
  }

  /* ---------------------------------------------------------
     phase 2 - formation
     -------------------------------------------------------------
     Same handshake: send your six, wait for theirs. Sent as card ids
     in FRONT-then-BACK order, which IS the formation - slots 0-2 are
     the front row.
     --------------------------------------------------------- */
  /* Online Classic: both players send their whole twelve at match
     start. Same latch-and-wait shape as bans and formations, because
     the same race applies - either side can arrive first. */
  var decks = { mine: null, theirs: null, done: null };

  function startDecks(cb) {
    decks.mine = null;
    decks.done = cb;
    maybeStartClassic();
  }
  function submitDeck(ids) {
    if (!S || S.dead) return;
    decks.mine = ids.slice();
    send('deck', { ids: decks.mine });
    maybeStartClassic();
  }
  function onRemoteDeck(body) {
    decks.theirs = (body.ids || []).slice();
    maybeStartClassic();
  }
  function maybeStartClassic() {
    if (!decks.mine || !decks.theirs || !decks.done) return;
    var cb = decks.done;
    var theirs = decks.theirs;
    decks.done = null;
    cb(theirs);
  }

  var six = { mine: null, theirs: null, done: null };

  function startSix(cb) {
    six.mine = null;
    six.done = cb;
    maybeStartBattle(); // latched early arrival, same as bans
  }

  function submitSix(ids) {
    if (!S || S.dead) return;
    six.mine = ids.slice();
    send('six', { ids: six.mine });
    maybeStartBattle();
  }

  function onRemoteSix(body) {
    six.theirs = (body.ids || []).slice();
    maybeStartBattle();
  }

  function maybeStartBattle() {
    if (!six.mine || !six.theirs || !six.done) return;
    var cb = six.done;
    var theirs = six.theirs;
    six.done = null;
    cb(theirs);
  }

  /* ---------------------------------------------------------
     phase 3 - the battle
     -------------------------------------------------------------
     One action per message. `null` means a pass. A move names its
     hero and its targets by (side, idx) and its skill by slot: 0 is
     the signature, 1 the role Basic. Nothing else needs to cross,
     because the receiving engine recomputes the whole outcome.
     --------------------------------------------------------- */

  /* find a unit by wire reference, flipping the side into MY frame */
  function unitByRef(B, ref) {
    var want = mirrorSide(ref.side);
    for (var i = 0; i < B.units.length; i++) {
      if (B.units[i].side === want && B.units[i].idx === ref.idx) return B.units[i];
    }
    return null;
  }

  function refOf(u) {
    return { side: u.side, idx: u.idx };
  }

  /* Encode a local action for the wire. */
  function encode(B, act) {
    if (!act) return null;
    var sig = act.unit.card.ability;
    return {
      unit: refOf(act.unit),
      /* 0 = signature Skill, 1 = role Basic Skill. Sending the slot
         rather than the name means a later rename cannot break a
         match in flight. */
      slot: act.ability === sig ? 0 : 1,
      targets: (act.chosen || []).map(refOf),
      choose: act.choose || 0,
    };
  }

  /* Rebuild a remote action against OUR battle object. */
  function decode(B, wire) {
    if (!wire) return null;
    var unit = unitByRef(B, wire.unit);
    if (!unit) return null;
    var ability = wire.slot === 0 ? unit.card.ability : E().roleAbility(unit);
    var chosen = [];
    for (var i = 0; i < (wire.targets || []).length; i++) {
      var t = unitByRef(B, wire.targets[i]);
      if (!t) return null;
      chosen.push(t);
    }
    return {
      unit: unit,
      ability: ability,
      targets: chosen,
      chosen: chosen,
      choose: wire.choose || 0,
    };
  }

  function onRemoteAction(body) {
    if (!S || S.dead) return;
    var p = S.pendingAction;
    if (!p) {
      /* Their move outran our loop. Park it: the battle will ask for
         a move in a moment and take it straight from here. */
      S.inbox = S.inbox || [];
      S.inbox.push(body);
      return;
    }
    S.pendingAction = null;
    settleAction(p, body);
  }

  function settleAction(p, body) {
    var B = p.battle;
    if (!body.act) {
      S.expectSum = body.sum || null;
      p.resolve(null); // they passed
      return;
    }
    var act = decode(B, body.act);
    if (!act) {
      fail('An opponent move could not be read. The match has been stopped.');
      p.reject(new Error('undecodable'));
      return;
    }
    /* Their checksum describes the board AFTER their move. We cannot
       compare yet - we have not applied it. Hold it for verify(). */
    S.expectSum = body.sum || null;
    p.resolve(act);
  }

  /* The adaptor handed to js/battle.js. */
  function controller(onDesync) {
    S.onDesync = onDesync;
    return {
      label: S.match.oppName,
      decide: function (B) {
        return new Promise(function (resolve, reject) {
          if (!S || S.dead) {
            reject(new Error('match over'));
            return;
          }
          var p = { resolve: resolve, reject: reject, battle: B };
          /* Their move may already be waiting - a fast opponent, or a
             pass that needed no thought. */
          if (S.inbox && S.inbox.length) {
            settleAction(p, S.inbox.shift());
            return;
          }
          S.pendingAction = p;
        });
      },
      onLocal: function (act) {
        if (!S || S.dead) return;
        var B = window.EOL.battle.getState();
        /* Sent AFTER our engine resolved the move, so the checksum
           describes the resulting board. That is the strong check: it
           covers not just where the pieces were but everything the
           skill did to them - damage rolls, crits, coin flips, deaths.
           If their replay of our move lands anywhere else, they will
           see it immediately. */
        send('act', { act: encode(B, act), sum: checksum(B) });
      },
      /* A remote concession is terminal even if it arrives during our
         own turn (there may be no pending decide() promise to release).
         battle.js registers this once per board and owns the result UI. */
      onForfeitWin: function (fn) {
        if (S) S.onForfeitWin = fn;
      },
      /* We concede. Sent before the channel is torn down, or they sit
         waiting for a move that never arrives. */
      forfeit: function () {
        send('forfeit', {});
      },

      /* The battle reached a result. Close the match row so it stops
         being "your active match" - otherwise the next time either
         player opens the game the rejoin path would pull them back
         into a game that is already decided. */
      finish: function () {
        if (window.EOL.mp && window.EOL.mp.endMatch) window.EOL.mp.endMatch();
        /* Retire the session as well as the row. Leaving it alive
           meant a DECIDED match still counted as "in an online match",
           so closing the tab on the result screen warned about
           forfeiting a game that was already won. */
        if (S) S.dead = true;
      },

      /* Called by battle.js once it has applied a remote move, so the
         two boards are compared at the only moment they are supposed
         to be identical. */
      verify: function (B) {
        if (!S || S.dead || !S.expectSum) return true;
        var want = S.expectSum;
        S.expectSum = null;
        if (checksum(B) === want) return true;
        fail(
          'The two boards have gone out of sync, so the match was stopped. ' +
            'No result has been recorded.'
        );
        return false;
      },
    };
  }

  /* ---------------------------------------------------------
     lifecycle
     --------------------------------------------------------- */
  function begin(match) {
    S = newSession(match);
    S.inbox = [];
    return S;
  }

  function end(reason) {
    if (S) {
      if (!S.dead) {
        S.dead = true;
        if (reason !== 'remote') send('quit', {});
      }
      /* Anything still awaiting a move must be released, or the battle
         loop stays parked on a promise nobody will ever settle and the
         board freezes instead of returning to the menu. */
      if (S.pendingAction) {
        var rej = S.pendingAction.reject;
        S.pendingAction = null;
        try {
          rej(new Error('match ended'));
        } catch (e) {
          /* the awaiting loop has already unwound */
        }
      }
    }
    S = null;
    bans = { mine: null, theirs: null, done: null };
    six = { mine: null, theirs: null, done: null };
    decks = { mine: null, theirs: null, done: null };
  }

  function active() {
    return !!(S && !S.dead);
  }

  function isHost() {
    return !!(S && S.host);
  }

  /* mulberry32, identical to js/mp.js - both clients must roll the
     same numbers in the same order */
  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* =============================================================
     FORFEIT ON THE WAY OUT
     -------------------------------------------------------------
     Called both from the in-app confirmation and from `pagehide`.

     `duringUnload` is the hard case. The page is being destroyed, so
     a Realtime broadcast and a normal fetch are both likely to be
     cancelled mid-flight. sendBeacon() exists precisely for this:
     the browser is required to complete it after the page is gone.
     We beacon the end_match RPC so the row closes and the opponent
     is not left waiting on a player who no longer exists.

     The broadcast is still attempted first - if it lands, the
     opponent sees the forfeit instantly rather than waiting for the
     90s sweep. Best effort, never fatal.
     ============================================================= */
  function forfeitOut(duringUnload) {
    if (!S || S.dead) return;
    var id = S.match && S.match.id;

    /* tell them directly - may or may not survive teardown */
    try {
      send('forfeit', {});
    } catch (e) {
      /* the channel is already gone */
    }

    if (!duringUnload) {
      if (window.EOL.mp && window.EOL.mp.endMatch) window.EOL.mp.endMatch();
      return;
    }

    /* Unload path: beacon the RPC directly. This bypasses the
       supabase client, which cannot be trusted to finish a request
       while the page is being torn down. */
    try {
      var cfg = window.EOL.supabaseConfig || {};
      var A = window.EOL.auth;
      var tok = A && A.accessToken ? A.accessToken() : null;
      if (!id || !cfg.url || !cfg.anonKey || !navigator.sendBeacon) return;
      /* The USER'S token is required, not just the anon key.
         end_match() resolves the caller from auth.uid(), so an
         anonymous call returns HTTP 204 and changes nothing -
         a silent no-op that looks like success. Verified against
         the live project. */
      if (!tok) return;
      var url = cfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/end_match';
      /* sendBeacon cannot set headers, so the key and the token ride
         as query params. PostgREST accepts both there, and neither is
         more secret than what the page already ships. */
      var qs =
        '?apikey=' + encodeURIComponent(cfg.anonKey) + '&access_token=' + encodeURIComponent(tok);
      var blob = new Blob([JSON.stringify({ p_match: id })], { type: 'application/json' });
      navigator.sendBeacon(url + qs, blob);
    } catch (e) {
      /* nothing to salvage at this point */
    }
  }

  window.EOL.netplay = {
    begin: begin,
    end: end,
    active: active,
    isHost: isHost,
    receive: receive,
    forfeitOut: forfeitOut,
    startDecks: startDecks,
    submitDeck: submitDeck,
    startBans: startBans,
    submitBans: submitBans,
    startSix: startSix,
    submitSix: submitSix,
    controller: controller,
    rngFrom: rngFrom,
    checksum: checksum,
    /* test hooks */
    _encode: encode,
    _decode: decode,
    _session: function () {
      return S;
    },
  };
})();
