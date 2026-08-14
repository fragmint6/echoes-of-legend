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

  /* =============================================================
     THE OUTBOX - why messages are held until the peer is present
     -------------------------------------------------------------
     Supabase Realtime broadcast is FIRE AND FORGET. A message sent to
     a channel before the other client has SUBSCRIBED is delivered to
     nobody and is not replayed when they arrive. There is no history.

     The two players never subscribe at the same moment, because they
     do not learn about the match at the same moment:

       - the CLAIMER is handed the match row by try_match() and
         subscribes immediately;
       - the PARKED player finds out through a 2-SECOND POLL, so they
         subscribe up to ~2s later.

     Both sides send their opening message (Classic deck, or the first
     draft pick) the instant they subscribe. The claimer's message
     therefore goes out into an empty channel and is lost, while the
     parked player's arrives normally. The result is exactly the
     reported symptom: ONE player loads into the game and the other
     sits on "Opponent found" forever, waiting for a message that was
     already thrown away.

     It is a race, so it is intermittent, and it is *more* likely the
     longer the poll takes to notice - which is why it looks random.

     The fix is to make send() reliable rather than to reorder the
     handshake. Presence tells us when the opponent is actually on the
     channel; until then outgoing messages queue here and are flushed
     in order once they arrive. Nothing above this layer changes, and
     the ordering guarantees js/netplay.js relies on are preserved
     because the queue is strictly FIFO.
     ============================================================= */
  var peerHere = false; // is the opponent subscribed to our channel?
  var outbox = []; // [{event, payload}] held until they are

  function flushOutbox() {
    if (!channel || !peerHere) return;
    var pending = outbox;
    outbox = [];
    pending.forEach(function (m) {
      channel.send({ type: 'broadcast', event: m.event, payload: m.payload });
    });
  }

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
      /* A private room's agreed terms - format, length, battlefield,
         draft pool. Empty {} for a queue match, whose terms are
         "whatever the queue rolls". */
      settings: row.settings || {},
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
    /* No invite toasts while a match is on. Stopping the poll is the
       guarantee: even if send_invite's busy check races a match
       starting, there is nothing here to surface it. */
    stopInviteWatch();

    /* A match in progress is still a "room" as far as the portal is
       concerned - it is where this player is - but it is full. */
    reportRoom(row.id, false, { room: row.id });

    channel = sb.channel('match:' + row.id, {
      config: { broadcast: { self: false, ack: true }, presence: { key: u.id } },
    });
    /* A fresh channel starts with nobody on it. Reset explicitly:
       these are module-scope and a previous match must not leave the
       next one believing the opponent is already listening. */
    peerHere = false;
    outbox = [];

    /* Presence is the only reliable "they are listening now" signal.
       `sync` fires with the full state on join and covers the case
       where they were already there before us; `join` covers them
       arriving after us. Either way, anything we queued goes out. */
    function notePeers() {
      if (!channel || peerHere) return;
      var state = {};
      try {
        state = channel.presenceState() || {};
      } catch (e) {
        return;
      }
      var others = Object.keys(state).filter(function (k) {
        return k !== u.id;
      });
      if (!others.length) return;
      peerHere = true;
      flushOutbox();
    }

    channel
      .on('presence', { event: 'sync' }, notePeers)
      .on('presence', { event: 'join' }, notePeers)
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
        /* They are gone, so the channel is empty again. Hold anything
           we send from here on: if they reconnect, presence fires
           again and the queue is delivered rather than lost a second
           time. */
        peerHere = false;
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
     MATCH HISTORY
     -------------------------------------------------------------
     A finished match does not belong in mp_matches. That table is
     live plumbing - polled for "your active match", swept, carrying a
     seed and settings that stop meaning anything the moment the game
     ends - so every finished row left behind slows down the queries
     that matter and clutters the database.

     archive_match() copies the row into mp_history with its replay
     and then deletes the original, which is why this is called
     INSTEAD of end_match() on a natural finish rather than as well
     as it. If it fails for any reason - most importantly, if the
     history migration has not been run yet - we fall back to
     end_match() so the row is still closed and neither player is
     rejoined into a decided game. A missing history feature must
     never strand somebody in a finished match.
     ============================================================= */
  function archiveMatch(rec) {
    if (!sb || !match) return Promise.resolve(false);
    var id = match.id;
    rec = rec || {};
    stopHeartbeat();
    return sb
      .rpc('archive_match', {
        p_match: id,
        p_winner: rec.winner || null,
        p_ending: rec.ending || 'unknown',
        p_rounds: rec.rounds || 0,
        p_replay: rec.replay || null,
      })
      .then(
        function (res) {
          if (res && res.error) {
            sb.rpc('end_match', { p_match: id }).then(function () {});
            return false;
          }
          return true;
        },
        function () {
          sb.rpc('end_match', { p_match: id }).then(function () {});
          return false;
        }
      );
  }

  /* The list behind the History screen. Resolved server-side into
     "me vs them" so the client never has to work out which seat it
     held in a match it may not have been alive for. */
  function history(limit, offset) {
    if (!sb) return Promise.resolve({ rows: [], error: 'offline' });
    return sb
      .rpc('my_history', { p_limit: limit || 40, p_offset: offset || 0 })
      .then(
        function (res) {
          if (res && res.error) return { rows: [], error: res.error.message || 'failed' };
          return { rows: (res && res.data) || [], error: null };
        },
        function (e) {
          return { rows: [], error: (e && e.message) || 'failed' };
        }
      );
  }

  /* One match in full, including the replay tape. Fetched only when a
     player opens a match - the tape is the big column and the list
     view has no use for it. */
  function replay(id) {
    if (!sb || !id) return Promise.resolve({ data: null, error: 'offline' });
    return sb.rpc('match_replay', { p_match: id }).then(
      function (res) {
        if (res && res.error) return { data: null, error: res.error.message || 'failed' };
        return { data: (res && res.data) || null, error: null };
      },
      function (e) {
        return { data: null, error: (e && e.message) || 'failed' };
      }
    );
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

  /* Broadcast, but never into an empty channel. If the opponent has
     not subscribed yet the message waits in the outbox and goes out
     the moment presence reports them, in the order it was queued. */
  function send(event, payload) {
    if (!channel) return Promise.resolve();
    if (!peerHere) {
      outbox.push({ event: event, payload: payload || {} });
      return Promise.resolve();
    }
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
      /* Straight out, not through the outbox: we are tearing the
         channel down on the next line, so a queued 'bye' would never
         be flushed. If nobody is listening the message is pointless
         anyway - there is no opponent to inform. */
      if (peerHere) {
        try {
          channel.send({ type: 'broadcast', event: 'bye', payload: {} });
        } catch (e) {
          /* the channel is already going away */
        }
      }
      try {
        channel.unsubscribe();
      } catch (e) {
        /* already gone */
      }
      channel = null;
    }
    peerHere = false;
    outbox = [];
    match = null;
    reportRoom(null);
    /* Back on the menu and reachable again. */
    startInviteWatch();
  }

  /* =============================================================
     PRIVATE ROOMS
     -------------------------------------------------------------
     A room is a match that has not happened yet. It exists so that
     two specific people can agree to play, on terms one of them
     chooses, before the server pairs anybody.

     WHY THIS IS NOT PART OF THE QUEUE. The queue's whole design is
     that you are interchangeable: try_match() grabs whoever is
     waiting. A room is the opposite - it names its participants and
     refuses everyone else. Bolting "but not that person" onto the
     queue would have made the atomic claim conditional, which is
     exactly the property that keeps double-claims impossible. So
     rooms are a separate table with their own lifecycle, and they
     converge on the existing design at the last possible moment:
     start_room() mints an ordinary mp_matches row, and from that
     instant everything downstream - draft, heartbeat, saveState,
     resume, endMatch - is the code that was already there.

     THE PARTY LEADER owns the settings. Only their client may write
     them, enforced in the database rather than the UI, and they
     become p1, which is also the host. One authority, not two.

     Events: `room` (the room changed - render it) and `roomError`.
     --------------------------------------------------------- */
  /* Is multiplayer usable at all right now? A named function because
     bootstrap() and the public surface both need it. */
  function available() {
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
  }

  /* ---------------------------------------------------------
     TELLING THE PORTAL WHERE WE ARE
     -------------------------------------------------------------
     CrazyGames requires the game to report its current room and
     whether it is joinable. Doing that HERE rather than in the UI is
     deliberate: this module is the only place that knows the truth
     about rooms and matches, so the portal cannot fall out of step
     with the game the way a second copy of the state would.

     No-ops entirely on the web build. */
  function portal() {
    var C = window.EOL.crazygames;
    return C && C.isReady && C.isReady() ? C : null;
  }

  function reportRoom(id, joinable, params) {
    var C = portal();
    if (!C) return;
    if (!id) {
      C.leftRoom();
      C.hideInviteButton();
      return;
    }
    C.updateRoom({ roomId: id, isJoinable: !!joinable, inviteParams: params || { room: id } });
    /* The invite BUTTON is the portal's own UI. It only makes sense
       while someone can actually accept, so it tracks joinability. */
    if (joinable) C.showInviteButton(params || { room: id });
    else C.hideInviteButton();
  }

  var room = null;
  var roomPoll = null;
  var roomBeat = null;
  var ROOM_POLL_MS = 2000;
  var ROOM_BEAT_MS = 20000;

  /* The settings a leader may choose. Kept here, beside the network
     code, because both clients must agree on the vocabulary and the
     server stores it verbatim. `null` means "roll it". */
  var ROOM_DEFAULTS = {
    mode: 'draft', // 'draft' | 'classic'
    length: 'single', // 'single' | 'unabridged'
    field: null, // battlefield id, or null = random
    pool: null, // draft pool / faction id, or null = random
  };

  function roomDefaults() {
    var out = {};
    for (var k in ROOM_DEFAULTS) if (ROOM_DEFAULTS.hasOwnProperty(k)) out[k] = ROOM_DEFAULTS[k];
    return out;
  }

  function iLead() {
    var u = me();
    return !!(room && u && room.leader === u.id);
  }

  function adoptRoom(row) {
    if (!row || !row.code) return null;
    var u = me();
    room = {
      code: row.code,
      leader: row.leader,
      leaderName: row.leader_name || 'Player',
      guest: row.guest || null,
      guestName: row.guest_name || null,
      settings: row.settings || roomDefaults(),
      status: row.status || 'open',
      matchId: row.match_id || null,
      isLeader: !!(u && row.leader === u.id),
    };
    /* joinable exactly while the second seat is free and the game has
       not started - which is also when the portal may send us people */
    reportRoom(room.code, room.status !== 'closed' && !room.guest, { room: room.code });
    emit('room', room);
    return room;
  }

  /* THE ROOM ENDED WITHOUT US ENDING IT.
     One exit for every way a lobby can die under a member's feet: the
     leader left, the row was swept, or it was deleted. Tears the local
     room down exactly as leaveRoom() does - stop polling, drop the
     state, stop advertising it to the portal - and then says why, so
     the UI can close the lobby and show a reason instead of leaving
     the player staring at a dead screen. `reason` is null when the
     player already knows (they closed it themselves). */
  function roomGone(reason) {
    stopRoomWatch();
    room = null;
    reportRoom(null);
    emit('room', null);
    if (reason) emit('roomError', { text: reason, raw: 'room-closed', disbanded: true });
  }

  function roomFail(err) {
    var m = (err && err.message) || '';
    var text = 'Something went wrong with that room.';
    if (/room not found/i.test(m)) text = 'No room with that code. Check it and try again.';
    else if (/room closed/i.test(m)) text = 'That room has closed.';
    else if (/room full/i.test(m)) text = 'That room is already full.';
    else if (/party leader/i.test(m)) text = 'Only the party leader can change that.';
    else if (/nobody has joined/i.test(m)) text = 'Nobody has joined yet.';
    else if (/does not exist|schema cache/i.test(m))
      text = 'Private rooms are not set up on the server yet. See docs/SUPABASE-SETUP.md.';
    else if (/JWT|not authenticated/i.test(m)) text = 'Sign in to use private rooms.';
    emit('roomError', { text: text, raw: m });
    return text;
  }

  /* Both sides poll their own room row. The leader is watching for a
     guest to arrive; the guest is watching for the settings to change
     and for the match to start. Polling rather than Realtime for the
     same reason matchmaking polls: far less to go wrong, and a lobby
     is not latency critical. */
  function watchRoom() {
    stopRoomWatch();
    roomPoll = setInterval(function () {
      if (!sb || !room) return;
      sb.from('mp_rooms')
        .select('*')
        .eq('code', room.code)
        .limit(1)
        .then(function (res) {
          if (res.error || !res.data || !res.data.length) {
            /* THE ROW IS GONE. A deleted room is a disbanded room: the
               sweeper can remove one whose heartbeat lapsed, and RLS
               can stop returning it once we are no longer a member.
               Either way there is nothing left to sit in. */
            if (res.error) return; // a transient fetch error is not a disband
            if (room && !room.matchId) roomGone('The party was disbanded.');
            return;
          }
          var row = res.data[0];
          /* the leader pressed start: everyone goes to the match */
          if (row.match_id && (!room || !room.matchId)) {
            adoptRoom(row);
            stopRoomWatch();
            enterRoomMatch(row.match_id);
            return;
          }
          /* THE LEADER LEFT: leave_room() closes the room rather than
             handing it on - there is no succession, and a room with no
             owner has no settings. The guest has to be TOLD, or they
             sit in a lobby that no longer exists waiting for a start
             that can never come. Only the guest acts on this: the
             leader is the one who closed it and has already left. */
          if (row.status === 'closed' && !row.match_id) {
            if (room && !room.isLeader) roomGone('The party leader left, so the party was disbanded.');
            else if (room) roomGone(null);
            return;
          }
          adoptRoom(row);
        });
    }, ROOM_POLL_MS);

    roomBeat = setInterval(function () {
      if (!sb || !room) return;
      sb.rpc('touch_room', { p_code: room.code }).then(function () {});
    }, ROOM_BEAT_MS);
  }

  function stopRoomWatch() {
    if (roomPoll) {
      clearInterval(roomPoll);
      roomPoll = null;
    }
    if (roomBeat) {
      clearInterval(roomBeat);
      roomBeat = null;
    }
  }

  /* The guest learns the match id from the room row rather than from
     the rpc, so it has to fetch the row itself before joining. */
  function enterRoomMatch(matchId) {
    if (!sb || !matchId) return;
    sb.from('mp_matches')
      .select('*')
      .eq('id', matchId)
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return;
        joinMatch(res.data[0]);
      });
  }

  function createRoom(settings) {
    if (!sb) sb = client();
    if (!sb) return Promise.reject(new Error('offline'));
    var s = settings || roomDefaults();
    return sb.rpc('create_room', { p_settings: s }).then(
      function (res) {
        if (res.error) throw res.error;
        var row = res.data && res.data.length ? res.data[0] : res.data;
        var r = adoptRoom(row);
        watchRoom();
        return r;
      })
      .catch(function (err) {
        roomFail(err);
        throw err;
      });
  }

  function joinRoom(code) {
    if (!sb) sb = client();
    if (!sb) return Promise.reject(new Error('offline'));
    var c = String(code || '')
      .trim()
      .toUpperCase();
    if (!c) return Promise.reject(new Error('room not found'));
    return sb.rpc('join_room', { p_code: c }).then(
      function (res) {
        if (res.error) throw res.error;
        var row = res.data && res.data.length ? res.data[0] : res.data;
        var r = adoptRoom(row);
        /* joining a room whose match already started goes straight in */
        if (row && row.match_id) enterRoomMatch(row.match_id);
        else watchRoom();
        return r;
      })
      .catch(function (err) {
        roomFail(err);
        throw err;
      });
  }

  function setRoomSettings(settings) {
    if (!sb || !room) return Promise.reject(new Error('no room'));
    if (!iLead()) return Promise.reject(new Error('not the party leader'));
    /* paint the leader's own choice immediately; the poll confirms it */
    room.settings = settings;
    emit('room', room);
    return sb.rpc('set_room_settings', { p_code: room.code, p_settings: settings }).then(
      function (res) {
        if (res.error) throw res.error;
        var row = res.data && res.data.length ? res.data[0] : res.data;
        return adoptRoom(row);
      })
      .catch(function (err) {
        roomFail(err);
        throw err;
      });
  }

  function startRoom() {
    if (!sb || !room) return Promise.reject(new Error('no room'));
    return sb.rpc('start_room', { p_code: room.code }).then(
      function (res) {
        if (res.error) throw res.error;
        var m = res.data && res.data.length ? res.data[0] : res.data;
        if (!m || !m.id) throw new Error('no match');
        stopRoomWatch();
        return joinMatch(m);
      })
      .catch(function (err) {
        roomFail(err);
        throw err;
      });
  }

  function leaveRoom() {
    var c = room && room.code;
    stopRoomWatch();
    room = null;
    reportRoom(null);
    emit('room', null);
    if (!sb || !c) return Promise.resolve();
    return sb.rpc('leave_room', { p_code: c }).then(
      function () {},
      function () {}
    );
  }

  /* Reconnect: is this player already in a room? */
  function resumeRoom() {
    if (!sb) sb = client();
    if (!sb || !me()) return Promise.resolve(null);
    return sb.rpc('find_my_room').then(
      function (res) {
        if (res.error) return null;
        var row = res.data && res.data.length ? res.data[0] : res.data;
        if (!row || !row.code) return null;
        var r = adoptRoom(row);
        if (row.match_id) enterRoomMatch(row.match_id);
        else watchRoom();
        return r;
      },
      function () {
        return null;
      }
    );
  }

  /* ---------------------------------------------------------
     THE INVITE LINK
     -------------------------------------------------------------
     On the portal, CrazyGames mints the link so that accepting it
     opens the game inside their site with the parameters attached.
     Off-portal we build the equivalent ourselves from the page URL,
     so the feature is not portal-only - a friend on the open web
     gets a link that works the same way.
     --------------------------------------------------------- */
  function inviteLink() {
    if (!room || !room.code) return null;
    var C = portal();
    if (C) {
      var link = C.inviteLink({ room: room.code });
      if (link) return link;
    }
    try {
      var u = new URL(window.location.href);
      u.searchParams.set('room', room.code);
      u.hash = '';
      return u.toString();
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------
     ARRIVING FROM AN INVITE, AND INSTANT MULTIPLAYER
     -------------------------------------------------------------
     Three ways in, and the docs are explicit that they are distinct:

       1. STARTED from an invite link - the parameters are waiting for
          us at boot (portal), or sit in the query string (web).
       2. ALREADY RUNNING when the player accepts an invite - the
          portal fires its join-room listener. Missing this is what
          forces a page reload, which would throw the session away.
       3. INSTANT MULTIPLAYER - the portal launched us specifically to
          play, so the first player of a party must land in a private
          room of their own, immediately joinable, without touching
          the main menu.

     `bootstrap()` resolves with what the caller should DO, so the UI
     layer decides how to render it and this module stays UI-free.
     --------------------------------------------------------- */
  function pendingInviteCode() {
    var C = portal();
    if (C) {
      var v = C.inviteParam('room');
      if (v) return String(v).toUpperCase();
    }
    try {
      var q = new URLSearchParams(window.location.search);
      var r = q.get('room');
      if (r) return String(r).trim().toUpperCase();
    } catch (e) {
      /* no query string worth reading */
    }
    return null;
  }

  function bootstrap() {
    if (!available()) return Promise.resolve({ action: 'none' });

    /* someone accepted an invite while we were already playing */
    var C = portal();
    if (C && C.onJoinRoom) {
      C.onJoinRoom(function (params) {
        var code = params && (params.room || params.roomName);
        if (!code) return;
        joinRoom(String(code).toUpperCase()).then(
          function (r) {
            emit('roomJoined', r);
          },
          function () {}
        );
      });
    }

    var code = pendingInviteCode();
    if (code) {
      return joinRoom(code).then(
        function (r) {
          return { action: 'joined', room: r };
        },
        function () {
          return { action: 'joinFailed', code: code };
        }
      );
    }

    /* Instant Multiplayer: be playable straight away. The portal
       accepts a settings screen here, which is exactly what a party
       leader wants, so we open a room with defaults and let them
       adjust it while people arrive. */
    if (C && C.isInstantMultiplayer && C.isInstantMultiplayer()) {
      return createRoom(roomDefaults()).then(
        function (r) {
          return { action: 'leading', room: r, instant: true };
        },
        function () {
          return { action: 'none' };
        }
      );
    }

    return Promise.resolve({ action: 'none' });
  }

  /* =============================================================
     INVITES
     -------------------------------------------------------------
     "Invite by callsign" used to call playerExists() and then tell
     the INVITER "found them, now send them the code yourself". The
     invitee was never contacted. send_invite() actually delivers it,
     and answers with a reason when it cannot:

       sent | no_player | busy | self | no_room

     `busy` is the one worth having: a player in a live match is not
     interrupted, and the inviter is told why rather than watching
     nothing happen.
     ============================================================= */
  function sendInvite(handle, code) {
    if (!sb) sb = client();
    if (!sb || !handle) return Promise.resolve('no_player');
    return sb
      .rpc('send_invite', { p_handle: String(handle).trim(), p_code: code || '' })
      .then(
        function (res) {
          if (res.error) return 'error';
          return res.data || 'error';
        },
        function () {
          return 'error';
        }
      );
  }

  /* The invitee's side. Polled while the player is on the menu; the
     server already filters to invites whose room is still open and
     still has a free seat, so anything returned here is joinable. */
  function myInvites() {
    if (!sb) sb = client();
    if (!sb || !me()) return Promise.resolve([]);
    return sb.rpc('my_invites').then(
      function (res) {
        if (res.error) return [];
        return res.data || [];
      },
      function () {
        return [];
      }
    );
  }

  function answerInvite(id, answer) {
    if (!sb) sb = client();
    if (!sb || !id) return Promise.resolve();
    return sb
      .rpc('answer_invite', { p_invite: id, p_answer: answer || 'seen' })
      .then(function () {}, function () {});
  }

  /* =============================================================
     THE INVITE WATCH
     -------------------------------------------------------------
     Runs only while the player is idle on the menu. Two rules, both
     from the brief: an invite must not appear while they are in a
     game, and it must not appear twice for the same invite.

     Stopping the poll during a match is not merely an optimisation -
     it is how "no toast while playing" is guaranteed even if the
     server's own busy check races with a match starting.
     ============================================================= */
  var inviteTimer = null;
  var seenInvites = {};
  var INVITE_POLL_MS = 6000;

  function busyNow() {
    /* In a match, or in a room lobby that is about to become one. */
    return !!match || !!(room && room.matchId);
  }

  function pollInvites() {
    if (!me() || busyNow()) return;
    myInvites().then(function (rows) {
      if (busyNow()) return; // a match started while the call was in flight
      rows.forEach(function (inv) {
        if (seenInvites[inv.id]) return;
        seenInvites[inv.id] = true;
        emit('invite', inv);
      });
    });
  }

  function startInviteWatch() {
    stopInviteWatch();
    if (!sb || !me()) return;
    inviteTimer = setInterval(pollInvites, INVITE_POLL_MS);
    pollInvites();
  }

  function stopInviteWatch() {
    if (inviteTimer) {
      clearInterval(inviteTimer);
      inviteTimer = null;
    }
  }

  /* "Is there a player by this name?" - used to validate an invite by
     username before telling someone their code was sent. */
  function playerExists(handle) {
    if (!sb) sb = client();
    if (!sb || !handle) return Promise.resolve(false);
    return sb.rpc('player_exists', { p_handle: String(handle).trim() }).then(
      function (res) {
        return !res.error && !!res.data;
      },
      function () {
        return false;
      }
    );
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
    archiveMatch: archiveMatch,
    history: history,
    replay: replay,
    saveState: saveState,
    current: function () {
      return match;
    },
    isHost: function () {
      return !!(match && match.host);
    },

    /* ---- private rooms ---- */
    createRoom: createRoom,
    joinRoom: joinRoom,
    setRoomSettings: setRoomSettings,
    startRoom: startRoom,
    leaveRoom: leaveRoom,
    resumeRoom: resumeRoom,
    playerExists: playerExists,
    sendInvite: sendInvite,
    myInvites: myInvites,
    answerInvite: answerInvite,
    startInviteWatch: startInviteWatch,
    stopInviteWatch: stopInviteWatch,
    roomDefaults: roomDefaults,
    inviteLink: inviteLink,
    bootstrap: bootstrap,
    pendingInviteCode: pendingInviteCode,
    room: function () {
      return room;
    },
    isLeader: iLead,
    available: available,
  };
})();
