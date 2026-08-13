/* =============================================================
 * Multiplayer - matchmaking and live draft over Supabase Realtime
 * -------------------------------------------------------------
 * DESIGN
 *
 *  Matchmaking is a QUEUE TABLE, not a lobby server. A player inserts
 *  a row into `mp_queue`; the first player whose insert sees a waiting
 *  opponent claims it inside a single Postgres function, so two
 *  players can never both claim the same partner. That atomicity is
 *  the whole reason this needs a database rather than broadcast
 *  messages.
 *
 *  Once matched, both clients open a Realtime BROADCAST channel named
 *  after the match id. Draft picks are ephemeral turn messages, so
 *  broadcast is the right primitive - no row per pick, no write
 *  amplification.
 *
 *  DETERMINISM. The server generates one `seed` per match and both
 *  clients build the identical pack order from it with the same PRNG.
 *  Nothing about the card pool is transmitted; only "I picked index
 *  N of the current pack". That keeps messages tiny and makes
 *  desync detectable.
 *
 *  HOST AUTHORITY. The player stored as `p1` is the host. Where the
 *  two clients could disagree (who opens a pack, the battlefield
 *  roll), the host's value wins and is broadcast.
 *
 *  This module owns NO UI. It exposes events and js/play.js renders.
 * ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var sb = null; // supabase client, borrowed from auth
  var channel = null;
  var match = null; // { id, seed, host, oppId, oppName }
  var handlers = {};
  var queueRow = null;
  var pollTimer = null;
  var beatTimer = null;

  function emit(name, payload) {
    (handlers[name] || []).forEach(function (fn) {
      try {
        fn(payload);
      } catch (e) {
        console.warn('[mp] handler error', e);
      }
    });
  }

  function on(name, fn) {
    (handlers[name] = handlers[name] || []).push(fn);
  }

  function client() {
    var A = window.EOL.auth;
    if (!A || !A.isReady || !A.isReady()) return null;
    return A.rawClient ? A.rawClient() : null;
  }

  function me() {
    var A = window.EOL.auth;
    return A && A.user ? A.user() : null;
  }

  /* ---------------------------------------------------------
     deterministic RNG - both clients must agree exactly
     mulberry32: tiny, fast, and identical across engines.
     --------------------------------------------------------- */
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

  /* ---------------------------------------------------------
     queue
     --------------------------------------------------------- */
  function findMatch(mode) {
    sb = client();
    var u = me();
    if (!sb) return Promise.reject(new Error('Sign in to play multiplayer.'));
    if (!u) return Promise.reject(new Error('Sign in to play multiplayer.'));

    emit('status', { state: 'searching', text: 'Looking for an opponent...' });

    /* try_match() is a SECURITY DEFINER function: it either pairs us
       with a waiting player and returns the match row, or parks us in
       the queue and returns null. Doing both sides in one statement is
       what prevents a double-claim. */
    return sb
      .rpc('try_match', { p_mode: mode === 'classic' ? 'classic' : 'draft' })
      .then(function (res) {
        if (res.error) throw res.error;
        var m = res.data && res.data.length ? res.data[0] : res.data;
        if (m && m.id) return joinMatch(m);
        // parked: wait for someone to claim us
        queueRow = true;
        watchForClaim();
        return null;
      })
      .catch(function (err) {
        emit('status', { state: 'error', text: friendly(err) });
        throw err;
      });
  }

  /* While parked we watch for a match naming us. Realtime postgres
     changes would be neater, but a short poll is far easier to reason
     about and matchmaking is not latency critical. */
  function watchForClaim() {
    clearInterval(pollTimer);
    var tries = 0;
    pollTimer = setInterval(function () {
      if (++tries > 150) {
        // ~5 minutes
        cancel();
        emit('status', { state: 'timeout', text: 'No opponent found. Try again.' });
        return;
      }
      var u = me();
      if (!sb || !u) return;
      /* The whole row: an explicit column list once omitted `mode`,
         and joinMatch then defaulted it to 'draft' - the parked player
         of a CLASSIC pairing silently landed in a draft (the claimer
         got the full row from the rpc, so only the parked side broke).
         `*` can never drift out of sync with joinMatch's reads again. */
      sb.from('mp_matches')
        .select('*')
        .or('p1.eq.' + u.id + ',p2.eq.' + u.id)
        .eq('status', 'active')
        .limit(1)
        .then(function (res) {
          if (res.error || !res.data || !res.data.length) return;
          clearInterval(pollTimer);
          joinMatch(res.data[0]);
        });
    }, 2000);
  }

  function joinMatch(row, isResume) {
    clearInterval(pollTimer);
    queueRow = null;
    var u = me();
    var host = row.p1 === u.id;
    match = {
      id: row.id,
      seed: row.seed,
      host: host,
      oppId: host ? row.p2 : row.p1,
      oppName: (host ? row.p2_name : row.p1_name) || 'Opponent',
      resumed: !!isResume,
      mode: row.mode || 'draft',
      /* Everything needed to rebuild the board after a reconnect.
         Empty on a fresh pairing. */
      state: {
        phase: row.phase || 'draft',
        picks: row.picks || {},
        bans: row.bans || {},
        six: row.six || {},
        decks: row.decks || {},
        field: row.field || null,
        mySlot: host ? 'p1' : 'p2',
        foeSlot: host ? 'p2' : 'p1',
      },
    };

    startHeartbeat();

    channel = sb.channel('match:' + row.id, {
      config: { broadcast: { self: false, ack: true }, presence: { key: u.id } },
    });

    channel
      .on('broadcast', { event: 'pick' }, function (msg) {
        emit('pick', msg.payload);
      })
      /* Everything after the draft - bans, formations, battle actions -
         rides one ordered envelope so js/netplay.js can sequence and
         checksum it in a single place instead of per event name. */
      .on('broadcast', { event: 'net' }, function (msg) {
        emit('net', msg.payload);
      })
      .on('broadcast', { event: 'bye' }, function () {
        emit('opponentLeft', {});
      })
      .on('presence', { event: 'leave' }, function () {
        emit('opponentLeft', {});
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          channel.track({ id: u.id, name: u.name });
          emit('matched', match);
        }
      });

    return match;
  }

  /* =============================================================
     HEARTBEAT
     -------------------------------------------------------------
     A match row used to be created and never touched again, so two
     players closing their tabs left it `active` forever - and since
     try_match() hands back your existing active match before it
     looks at the queue, that ghost kept dragging you into a game
     nobody was playing.

     Each client now says "still here" every 15s. The server sweeps
     matches where BOTH sides have gone quiet for 90s. One live
     heartbeat keeps the match open, which is exactly what makes
     rejoining possible for the player who dropped.
     ============================================================= */
  var BEAT_MS = 15000;

  function startHeartbeat() {
    stopHeartbeat();
    if (!sb || !match) return;
    var beat = function () {
      if (!sb || !match) return;
      sb.rpc('touch_match', { p_match: match.id }).then(function () {});
    };
    beat();
    beatTimer = setInterval(beat, BEAT_MS);
  }

  function stopHeartbeat() {
    if (beatTimer) {
      clearInterval(beatTimer);
      beatTimer = null;
    }
  }

  /* =============================================================
     PERSIST MATCH STATE
     -------------------------------------------------------------
     Draft picks, bans and formations used to be broadcast and never
     stored, so a reconnecting client had nothing to rebuild from and
     "rejoin" could only concede. These are small, and by the time
     they are written both players already know them, so storing them
     leaks nothing and makes a real rejoin possible.

     Fire-and-forget: a failed save must never interrupt a match in
     progress. The worst case is that a later reconnect falls back to
     conceding, which is exactly the old behaviour.
     ============================================================= */
  function saveState(patch) {
    if (!sb || !match) return Promise.resolve();
    var args = { p_match: match.id };
    if (patch.phase) args.p_phase = patch.phase;
    if (patch.picks) args.p_picks = patch.picks;
    if (patch.bans) args.p_bans = patch.bans;
    if (patch.six) args.p_six = patch.six;
    if (patch.deck) args.p_deck = patch.deck;
    if (patch.field) args.p_field = patch.field;
    return sb.rpc('save_match_state', args).then(
      function () {},
      function () {}
    );
  }

  /* Close the match server-side. Called on a natural finish and on a
     forfeit, so the row stops being returned as "your active match"
     and neither player is rejoined into a game that is over. */
  function endMatch() {
    if (!sb || !match) return;
    var id = match.id;
    stopHeartbeat();
    sb.rpc('end_match', { p_match: id }).then(function () {});
  }

  /* =============================================================
     REJOIN
     -------------------------------------------------------------
     Called once at startup. If a live match is still waiting - you
     crashed, closed the tab, lost wifi - drop straight back into
     it rather than making the player queue again and stranding the
     opponent who stayed.
     ============================================================= */
  function resume() {
    sb = client();
    var u = me();
    if (!sb || !u) return Promise.resolve(null);
    return sb
      .rpc('find_my_match')
      .then(function (res) {
        if (res.error) return null;
        var m = res.data && res.data.length ? res.data[0] : null;
        if (!m || !m.id) return null;
        emit('status', { state: 'resuming', text: 'Rejoining your match...' });
        return joinMatch(m, true);
      })
      .catch(function () {
        return null; // a failed rejoin must never block the menu
      });
  }

  function send(event, payload) {
    if (!channel) return Promise.resolve();
    return channel.send({ type: 'broadcast', event: event, payload: payload || {} });
  }

  function cancel() {
    clearInterval(pollTimer);
    var u = me();
    if (sb && u && queueRow) {
      sb.from('mp_queue')
        .delete()
        .eq('user_id', u.id)
        .then(function () {});
    }
    queueRow = null;
  }

  function leave() {
    cancel();
    stopHeartbeat();
    if (channel) {
      send('bye', {});
      try {
        channel.unsubscribe();
      } catch (e) {
        /* already gone */
      }
      channel = null;
    }
    match = null;
  }

  function friendly(err) {
    var m = (err && err.message) || '';
    if (/relation .* does not exist|schema cache/i.test(m))
      return 'Multiplayer tables are missing. See docs/SUPABASE-SETUP.md.';
    if (/JWT|not authenticated/i.test(m)) return 'Sign in to play multiplayer.';
    return m || 'Could not reach the match service.';
  }

  window.EOL.mp = {
    on: on,
    findMatch: findMatch,
    cancel: cancel,
    leave: leave,
    send: send,
    rngFrom: rngFrom,
    resume: resume,
    endMatch: endMatch,
    saveState: saveState,
    current: function () {
      return match;
    },
    isHost: function () {
      return !!(match && match.host);
    },
    available: function () {
      /* An anonymous session (portal builds - see js/auth.js) is a real
         auth.uid() for the Daily Puzzle's ledger, but it is NOT an
         account: no callsign for an opponent to see, and no way to
         recover it. It must never read as multiplayer-ready.

         A CrazyGames account is the opposite: signInWithCrazyGames()
         mints a durable session keyed on the verified CrazyGames id,
         with a profiles row carrying the player's real username. It
         is not anonymous, so it falls through this check and queues
         normally - no special case needed. */
      var A = window.EOL.auth;
      if (A && A.isAnonymous && A.isAnonymous()) return false;
      var p = window.EOL.platform;
      if (p && p.canPlayOnline === false) return false;
      return !!client() && !!me();
    },
  };
})();
