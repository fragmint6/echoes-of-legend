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

  /* THE DOCUMENT (v2, 2026-08-10): one HUMAN-READABLE json per user.
     v1 stored raw localStorage strings under their storage keys -
     correct, but unreadable in the dashboard (the owner could not
     find the wallet to give himself test coins). v2 is organized the
     way a person thinks:

       {
         v: 2,
         wallet: 1230,                    <- EDIT THIS NUMBER in the
                                             dashboard to grant coins
         owned: ["camelot-lancelot",...],
         campaign: { cleared:[...], fought:[...], ... },
         decks: {...},
         settings: { scale: 100, gfx: "high", warLength: "set" },
         flags: { tutorialIntro: "1", tips: {...}, ... }
       }

     MAP is the single source of truth: storage key <-> document path
     <-> type. New persisted keys MUST be added here - verify_campaign
     greps this file for every _KEY constant in the codebase. */
  var MAP = [
    ['eol.wallet.v1', 'wallet', 'int'],
    ['eol.owned.v1', 'owned', 'json'],
    ['eol.campaign.ch1.progress', 'campaign', 'json'],
    ['eol.decks.v1', 'decks', 'json'],
    ['eol.scale', 'settings.scale', 'int'],
    ['eol.gfx', 'settings.gfx', 'str'],
    ['eol.war.length', 'settings.warLength', 'str'],
    ['eol.tips', 'flags.tips', 'json'],
    ['eol.coach.v1', 'flags.coach', 'json'],
    ['eol.econ.migrated.v1', 'flags.econMigrated', 'str'],
    ['eol.grimmwood-starter.v1', 'flags.starterSeeded', 'str'],
    ['eol.tutorial.intro.v1', 'flags.tutorialIntro', 'str'],
    ['eol.tutorial.guide.v1', 'flags.tutorialGuide', 'str'],
    ['eol.tutorial.ledger.v1', 'flags.tutorialLedger', 'str'],
    ['eol.uname.skip', 'flags.unameSkip', 'str'],
  ];
  var KEYS = MAP.map(function (row) {
    return row[0];
  });

  var TABLE = 'saves';
  var PUSH_TICK_MS = 4000;
  var lastPushed = null; // digest of the last snapshot we stored
  var uid = null; // signed-in user id, null when out
  var pulling = false;
  var timer = null;

  function client() {
    return window.EOL.auth && window.EOL.auth.rawClient ? window.EOL.auth.rawClient() : null;
  }

  function setPath(obj, path, val) {
    var parts = path.split('.');
    var host = obj;
    for (var i = 0; i < parts.length - 1; i++) host = host[parts[i]] = host[parts[i]] || {};
    host[parts[parts.length - 1]] = val;
  }
  function getPath(obj, path) {
    var parts = path.split('.');
    var host = obj;
    for (var i = 0; i < parts.length && host != null; i++) host = host[parts[i]];
    return host === undefined ? null : host;
  }

  /* localStorage -> the v2 document */
  function collect() {
    var doc = { v: 2 };
    MAP.forEach(function (row) {
      try {
        var raw = localStorage.getItem(row[0]);
        if (raw === null) return;
        var val = raw;
        if (row[2] === 'int') val = parseInt(raw, 10);
        else if (row[2] === 'json') {
          try {
            val = JSON.parse(raw);
          } catch (e) {
            val = raw;
          }
        }
        setPath(doc, row[1], val);
      } catch (e) {
        /* private mode: nothing to vault */
      }
    });
    return doc;
  }

  function digest(snap) {
    return JSON.stringify(snap);
  }

  /* the v2 document -> localStorage; returns true if anything changed.
     A v1 vault (raw 'eol.*' keys, no version field) is read the old
     way once and becomes v2 on the next push - nobody's save is lost
     to the reorganization. */
  function apply(doc) {
    var changed = false;
    function write(k, want) {
      try {
        var have = localStorage.getItem(k);
        if (want === null && have !== null) {
          localStorage.removeItem(k);
          changed = true;
        } else if (want !== null && want !== have) {
          localStorage.setItem(k, want);
          changed = true;
        }
      } catch (e) {
        /* private mode: the vault cannot land, play on */
      }
    }
    if (!doc || doc.v !== 2) {
      /* v1: raw strings under storage keys */
      KEYS.forEach(function (k) {
        var has = doc && Object.prototype.hasOwnProperty.call(doc, k);
        write(k, has ? String(doc[k]) : null);
      });
      return changed;
    }
    MAP.forEach(function (row) {
      var val = getPath(doc, row[1]);
      var want = null;
      if (val !== null && val !== undefined)
        want = row[2] === 'json' && typeof val !== 'string' ? JSON.stringify(val) : String(val);
      write(row[0], want);
    });
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
    /* test hook: the exact document a push would store */
    _collect: collect,
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
