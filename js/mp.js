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

    /* A match in progress is still a "room" as far as the portal is
       concerned - it is where this player is - but it is full. */
    reportRoom(row.id, false, { room: row.id });

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
    reportRoom(null);
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
          if (res.error || !res.data || !res.data.length) return;
          var row = res.data[0];
          /* the leader pressed start: everyone goes to the match */
          if (row.match_id && (!room || !room.matchId)) {
            adoptRoom(row);
            stopRoomWatch();
            enterRoomMatch(row.match_id);
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
