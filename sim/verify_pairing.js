/* =============================================================
   MATCH PAIRING - both players must actually start
   node sim/verify_pairing.js
   -------------------------------------------------------------
   Reported: "only one player loads into the game while the other is
   stuck on opponent found".

   THE CAUSE IS A LOST MESSAGE, NOT A STUCK SCREEN.

   Supabase Realtime broadcast is fire-and-forget. A message sent to a
   channel before the other client has SUBSCRIBED reaches nobody and
   is never replayed - there is no history and no retry.

   The two players do not subscribe at the same time, because they do
   not learn about the match at the same time:

     - the CLAIMER is handed the row by try_match() and subscribes at
       once;
     - the PARKED player discovers it through a 2-SECOND POLL, so they
       subscribe up to ~2s later.

   Both send their opening message as soon as they subscribe. The
   claimer's therefore goes out into an empty channel and is lost. The
   claimer then waits forever for a reply to a message the opponent
   never received, while the opponent - who sent theirs when both were
   listening - proceeds. One player in the game, one on "Opponent
   found". Intermittent, because it is a race.

   THIS SUITE MODELS THAT TIMELINE HONESTLY. The fake Realtime below
   DROPS any broadcast published while no peer is subscribed, which is
   the single behaviour that produced the bug. A fake that buffered
   would make the test pass against broken code, so the first thing
   asserted is that the harness itself reproduces the hang.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};

const MP_SRC = fs.readFileSync(path.join(ROOT, 'js/mp.js'), 'utf8');

/* ---------------------------------------------------------
   a fake Realtime that loses messages the way the real one does
   --------------------------------------------------------- */
function makeBus() {
  const channels = {}; // name -> [client]
  return {
    join(name, client) {
      (channels[name] = channels[name] || []).push(client);
    },
    leave(name, client) {
      channels[name] = (channels[name] || []).filter((c) => c !== client);
    },
    /* THE CRITICAL BEHAVIOUR: delivered only to whoever is subscribed
       RIGHT NOW. No history, no replay for latecomers. */
    publish(name, from, event, payload) {
      (channels[name] || []).forEach((c) => {
        if (c === from) return; // broadcast self:false
        c._recv(event, payload);
      });
    },
    peers(name, exceptKey) {
      return (channels[name] || []).filter((c) => c._key !== exceptKey);
    },
  };
}

/* One browser tab: its own copy of js/mp.js over a fake supabase. */
function makeClient(bus, user, db) {
  const client = { _key: user.id, subscribed: false, seen: [] };

  const chanFor = (name) => {
    const handlers = { broadcast: {}, presence: {} };
    const ch = {
      on(kind, opts, fn) {
        if (kind === 'broadcast') handlers.broadcast[opts.event] = fn;
        else handlers.presence[opts.event] = fn;
        return ch;
      },
      subscribe(cb) {
        client._chanName = name;
        client._handlers = handlers;
        bus.join(name, client);
        client.subscribed = true;
        cb('SUBSCRIBED');
        return ch;
      },
      track() {
        /* Announce ourselves: everyone already on the channel learns
           we exist, and we learn about them. This is what presence
           does, and it is the signal the fix depends on. */
        bus.peers(name, user.id).forEach((p) => {
          if (p._handlers && p._handlers.presence.join) p._handlers.presence.join();
          if (p._handlers && p._handlers.presence.sync) p._handlers.presence.sync();
        });
        if (handlers.presence.sync) handlers.presence.sync();
        return Promise.resolve('ok');
      },
      presenceState() {
        const st = {};
        bus.peers(name, null).forEach((p) => {
          st[p._key] = [{ id: p._key }];
        });
        return st;
      },
      send(msg) {
        bus.publish(name, client, msg.event, msg.payload);
        return Promise.resolve('ok');
      },
      unsubscribe() {
        bus.leave(name, client);
        client.subscribed = false;
      },
    };
    return ch;
  };

  client._recv = (event, payload) => {
    const h = client._handlers && client._handlers.broadcast[event];
    client.seen.push(event);
    if (h) h({ payload });
  };

  const sb = {
    channel: (name) => chanFor(name),
    rpc: (name, args) => Promise.resolve(db.rpc(name, args, user)),
    from: (table) => {
      const q = {
        _f: {},
        select() {
          return q;
        },
        or(s) {
          q._f.or = s;
          return q;
        },
        eq(k, v) {
          q._f[k] = v;
          return q;
        },
        limit() {
          return q;
        },
        delete() {
          q._del = true;
          return q;
        },
        then(res) {
          return Promise.resolve(res({ data: db.select(table, q._f, user), error: null }));
        },
      };
      return q;
    },
  };

  const W = {
    EOL: {
      /* Match the real auth surface exactly: mp.js reaches the
         supabase client through isReady()+rawClient(), not client(). */
      auth: {
        isReady: () => true,
        rawClient: () => sb,
        user: () => user,
        onChange: () => {},
      },
    },
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (t) => clearInterval(t),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    addEventListener: () => {},
    location: { href: 'https://example.com/' },
  };
  W.window = W;
  const sandbox = { window: W, document: { addEventListener() {} }, console, Promise, JSON, Math, Date, Object };
  sandbox.setInterval = W.setInterval;
  sandbox.clearInterval = W.clearInterval;
  sandbox.setTimeout = W.setTimeout;
  vm.createContext(sandbox);
  vm.runInContext(MP_SRC, sandbox, { filename: 'js/mp.js' });
  client.MP = W.EOL.mp;
  client.user = user;
  return client;
}

/* A minimal server: one match row, and the queue semantics that
   matter (claimer gets the row now, parked player polls for it). */
function makeDB() {
  const matches = [];
  return {
    matches,
    rpc(name, args, user) {
      if (name === 'try_match') {
        const waiting = this._waiting;
        if (waiting && waiting.id !== user.id) {
          this._waiting = null;
          const row = {
            id: 'M1',
            mode: 'classic',
            seed: 7,
            p1: waiting.id, // the PARKED player was first in, so they are p1
            p2: user.id,
            p1_name: waiting.name,
            p2_name: user.name,
            status: 'active',
            settings: {},
          };
          matches.push(row);
          return { data: [row], error: null };
        }
        this._waiting = user;
        return { data: [], error: null };
      }
      return { data: null, error: null };
    },
    /* The parked player's poll. Returning nothing until `holdUntil`
       models the real 2s interval: the row exists, they just have not
       noticed yet. That gap is the whole bug. */
    select(table, f, user) {
      if (table !== 'mp_matches') return [];
      if (this.holdUntil && Date.now() < this.holdUntil) return [];
      return matches.filter((m) => m.p1 === user.id || m.p2 === user.id);
    },
  };
}

/* ---------------------------------------------------------
   Drive a real pairing through the PUBLIC entry point.

   findMatch() is what js/play.js calls, and it reaches joinMatch by
   both routes: the claimer straight from try_match's row, the parked
   player from the 2s poll. Driving the public function means the test
   exercises the same code the game does, including the poll.

   `parkedJoinsLateMs` is how far behind the parked player is. The
   real poll interval is 2000ms; the harness shortens the wait by
   letting the fake server withhold the row until that deadline, so
   the TIMING is simulated but the CODE PATH is the production one.
   --------------------------------------------------------- */
function pairingExplicit(parkedJoinsLateMs) {
  const bus = makeBus();
  const db = makeDB();
  db.holdUntil = Date.now() + parkedJoinsLateMs;
  const A = makeClient(bus, { id: 'ua', name: 'Alice' }, db); // parks
  const B = makeClient(bus, { id: 'ub', name: 'Bob' }, db); // claims

  const started = {};
  const wire = (c) => {
    /* Exactly what js/play.js does on 'matched' for Classic: send our
       deck at once, then wait for theirs. */
    c.MP.on('matched', () => c.MP.send('net', { kind: 'deck', from: c.user.name }));
    c.MP.on('net', () => {
      started[c.user.name] = true;
    });
  };
  wire(A);
  wire(B);

  /* The parked player's poll ticks every 2000ms (js/mp.js
     watchForClaim), so the wait has to clear the first tick AFTER the
     hold expires, plus a little for the subscribe and the flush. */
  const POLL_MS = 2000;
  const wait = Math.ceil((parkedJoinsLateMs + 50) / POLL_MS) * POLL_MS + 400;

  return A.MP.findMatch('classic') // parks in the queue
    .then(() => B.MP.findMatch('classic')) // claims: joins immediately
    .then(() => new Promise((r) => setTimeout(r, wait)))
    .then(() => {
      A.MP.leave();
      B.MP.leave();
      return started;
    });
}

(async function () {
  console.log('\nTHE HARNESS REPRODUCES THE REAL TRANSPORT');
  {
    /* Prove the fake actually drops messages sent to an empty
       channel. If it did not, every assertion below would be
       meaningless. */
    const bus = makeBus();
    const db = makeDB();
    const solo = makeClient(bus, { id: 'u1', name: 'Solo' }, db);
    const late = makeClient(bus, { id: 'u2', name: 'Late' }, db);
    await solo.MP.findMatch('classic'); // parks
    await late.MP.findMatch('classic'); // claims and subscribes
    /* Publish while only the claimer is on the channel. The parked
       player has not subscribed, so this must reach nobody. */
    bus.publish('match:M1', late, 'net', { kind: 'deck' });
    await new Promise((r) => setTimeout(r, 30));
    ok(
      solo.seen.indexOf('net') === -1,
      'a broadcast published before the peer subscribed is LOST (as in production)'
    );
  }

  console.log('\nBOTH PLAYERS START, WHOEVER SUBSCRIBES FIRST');
  {
    /* The reported case: the parked player is ~2s behind. */
    const started = await pairingExplicit(300);
    ok(started.Bob === true, 'the claimer receives the parked player\u2019s opening message');
    ok(
      started.Alice === true,
      'and the PARKED player receives the claimer\u2019s - this is the bug that hung the match'
    );
  }

  console.log('\nTHE RACE IS CLOSED AT EVERY DELAY');
  {
    for (const d of [0, 50, 300, 1200, 2500]) {
      const started = await pairingExplicit(d);
      ok(
        started.Alice === true && started.Bob === true,
        'both players start when the parked side is ' + d + 'ms behind'
      );
    }
  }

  console.log('\nTHE OUTBOX DOES NOT BREAK WHAT ALREADY WORKED');
  {
    ok(/function flushOutbox/.test(MP_SRC), 'there is one flush point, not a copy per call site');
    ok(
      /outbox\.push\(/.test(MP_SRC) && /if \(!peerHere\)/.test(MP_SRC),
      'send() holds a message only while the peer is absent'
    );
    /* FIFO matters: js/netplay.js sequences messages and rejects
       anything out of order, so a queue that flushed backwards would
       trade a hang for a desync. */
    const flush = MP_SRC.slice(MP_SRC.indexOf('function flushOutbox'), MP_SRC.indexOf('function flushOutbox') + 400);
    ok(
      /forEach/.test(flush) && !/reverse|pop\(\)/.test(flush),
      'the outbox flushes in order, so netplay\u2019s sequencing still holds'
    );
    ok(
      /peerHere = false;\s*\n\s*outbox = \[\];/.test(MP_SRC),
      'joining a match resets the outbox, so nothing leaks between games'
    );
    {
      /* Slice the leave handler rather than regexing across it: the
         explanatory comment sits between the selector and the line,
         and a fixed lookahead window silently misses it. */
      const at = MP_SRC.indexOf("{ event: 'leave' }");
      const body = at > -1 ? MP_SRC.slice(at, at + 500) : '';
      ok(
        /peerHere = false/.test(body),
        'if the opponent drops, we stop broadcasting into an empty channel again'
      );
    }
  }

  console.log('\npass ' + pass + '  fail ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log('  FAIL harness threw: ' + (e && e.stack));
  console.log('\npass ' + pass + '  fail ' + (fail + 1));
  process.exit(1);
});
