/* =============================================================
   Echoes of Legend - THE VAULT (cloud saves, 2026-08-10)
   -------------------------------------------------------------
   Everything the game remembers locally is mirrored to the player's
   Supabase row the moment they are signed in: wallet, owned cards,
   campaign progress, decks, settings, tutorial flags - the WHOLE
   local save, as one JSON document in `public.saves` (schema and
   RLS in docs/SUPABASE-SETUP.md section 10).

   THE THREE LAWS OF THE VAULT:

   1. THE GAME MUST WORK SIGNED OUT. Same law as js/auth.js. No
      account, no network, no Supabase SDK - nothing here runs, and
      localStorage remains the only save, exactly as before.

   2. THE ACCOUNT IS THE SAVE. On sign-in, if the account already
      holds a vault, it WINS: it is applied over the device and the
      page reloads once so every module reads the restored state
      from a clean boot (no half-migrated UI). If the account has no
      vault yet, the device's current save becomes its first one.
      Signing out changes nothing locally - the device keeps the
      state it had, which at that moment equals the account's.

   3. THE VAULT IS NEVER HALF-WRITTEN. Pushes send the entire
      snapshot in one upsert. There is no per-key merging to tear a
      wallet away from the collection it paid for.

   Pushes ride a light loop: a 4s dirty-check (localStorage string
   compare is cheap at ~15 keys), an immediate nudge on the economy
   events, and a flush when the tab hides. Failures are silent and
   retried by the next tick - a dropped connection must never
   interrupt play.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  /* Every key the game persists. New features MUST register here -
     verify_campaign greps this list against the KEY constants in the
     codebase so a forgotten key fails the battery, not the player. */
  var KEYS = [
    'eol.wallet.v1', // the one wallet
    'eol.owned.v1', // owned cards
    'eol.econ.migrated.v1', // one-time economy import marker
    'eol.campaign.ch1.progress', // the Road: clears, grants, fought, tells
    'eol.decks.v1', // every deck
    'eol.grimmwood-starter.v1', // starter-deck seed marker
    'eol.scale', // UI scale
    'eol.gfx', // graphics quality
    'eol.tips', // dismissed tip dots
    'eol.coach.v1', // seen coach overlays
    'eol.war.length', // single / set preference
    'eol.tutorial.intro.v1', // intro scene seen
    'eol.tutorial.guide.v1', // wayfinder pending
    'eol.tutorial.ledger.v1', // ledger spotlight seen
    'eol.uname.skip', // callsign prompt dismissed
  ];

  var TABLE = 'saves';
  var PUSH_TICK_MS = 4000;
  var lastPushed = null; // digest of the last snapshot we stored
  var uid = null; // signed-in user id, null when out
  var pulling = false;
  var timer = null;

  function client() {
    return window.EOL.auth && window.EOL.auth.rawClient ? window.EOL.auth.rawClient() : null;
  }

  function collect() {
    var out = {};
    KEYS.forEach(function (k) {
      try {
        var v = localStorage.getItem(k);
        if (v !== null) out[k] = v;
      } catch (e) {
        /* private mode: nothing to vault */
      }
    });
    return out;
  }

  function digest(snap) {
    return JSON.stringify(snap);
  }

  /* write a vault into localStorage; returns true if anything changed */
  function apply(snap) {
    var changed = false;
    try {
      KEYS.forEach(function (k) {
        var want = Object.prototype.hasOwnProperty.call(snap, k) ? String(snap[k]) : null;
        var have = localStorage.getItem(k);
        if (want === null && have !== null) {
          localStorage.removeItem(k);
          changed = true;
        } else if (want !== null && want !== have) {
          localStorage.setItem(k, want);
          changed = true;
        }
      });
    } catch (e) {
      /* private mode: the vault cannot land, play on */
    }
    return changed;
  }

  function push() {
    var c = client();
    if (!c || !uid || pulling) return Promise.resolve(false);
    var snap = collect();
    var d = digest(snap);
    if (d === lastPushed) return Promise.resolve(false);
    return c
      .from(TABLE)
      .upsert({ user_id: uid, data: snap, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .then(function (res) {
        if (res.error) throw res.error;
        lastPushed = d;
        return true;
      })
      .catch(function (err) {
        /* silent: the next tick retries; a missing table logs once so
           setup problems are findable, not fatal */
        if (err && err.code === '42P01' && !push._warned) {
          push._warned = true;
          console.warn(
            "[EOL] cloud saves: table 'saves' missing - run docs/SUPABASE-SETUP.md section 10"
          );
        }
        return false;
      });
  }

  /* sign-in: pull the vault. Account save present -> apply + one clean
     reload. Absent -> this device's save becomes the account's first. */
  function pull() {
    var c = client();
    if (!c || !uid) return Promise.resolve();
    pulling = true;
    return c
      .from(TABLE)
      .select('data')
      .eq('user_id', uid)
      .maybeSingle()
      .then(function (res) {
        pulling = false;
        if (res.error) throw res.error;
        if (res.data && res.data.data) {
          var snap = res.data.data;
          lastPushed = digest(snap);
          if (digest(collect()) !== lastPushed) {
            var changed = apply(snap);
            if (changed) {
              /* one clean boot so every module reads the restored
                 state; guard key prevents any possibility of a loop
                 (after reload the digests match and nothing applies) */
              try {
                sessionStorage.setItem('eol.cloud.restored', '1');
              } catch (e) {
                /* fine */
              }
              window.location.reload();
              return;
            }
          }
        } else {
          /* a brand-new vault: adopt the device state */
          return push();
        }
      })
      .catch(function (err) {
        pulling = false;
        if (err && err.code === '42P01' && !push._warned) {
          push._warned = true;
          console.warn(
            "[EOL] cloud saves: table 'saves' missing - run docs/SUPABASE-SETUP.md section 10"
          );
        }
      });
  }

  function startLoop() {
    if (timer) return;
    timer = window.setInterval(push, PUSH_TICK_MS);
  }
  function stopLoop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function init() {
    if (!window.EOL.auth || !window.EOL.auth.configured || !window.EOL.auth.configured()) return;
    window.EOL.auth.onChange(function (user) {
      var newUid = user ? user.id : null;
      if (newUid === uid) return;
      uid = newUid;
      lastPushed = null;
      if (uid) {
        pull().then(startLoop);
      } else {
        stopLoop();
      }
    });
    /* the tab hiding is the last reliable moment to write */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') push();
    });
    /* the economy moves fastest - nudge the vault right away */
    document.addEventListener('eol:coins', function () {
      push();
    });
    document.addEventListener('eol:owned', function () {
      push();
    });
  }

  window.EOL.cloud = {
    init: init,
    push: push,
    KEYS: KEYS.slice(),
    status: function () {
      return uid ? 'on' : 'off';
    },
    /* true on the first boot after a vault restore - app.js may greet */
    restored: function () {
      try {
        if (sessionStorage.getItem('eol.cloud.restored') === '1') {
          sessionStorage.removeItem('eol.cloud.restored');
          return true;
        }
      } catch (e) {
        /* fine */
      }
      return false;
    },
  };
})();
