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

   2. THE ACCOUNT IS THE SAVE. Progress belongs to the account, not
      to the browser.

      SIGNING IN. If the account has no vault yet, the device's
      current save becomes its first one - somebody who played as a
      guest and then registered keeps everything. If the account
      already holds a vault and the device is carrying real progress
      of its own, the two cannot both survive, so the player is ASKED
      which one to keep instead of one silently winning. With nothing
      meaningful on the device (a fresh browser, or a save identical
      to the account's) the account is restored without a prompt.

      SIGNING OUT. The device is returned to a clean slate: the final
      state is flushed to the vault, every local key is erased, and
      the page reloads to first-boot. The account keeps everything;
      the browser keeps nothing. This is what makes a shared computer
      safe, and it is why sign-out asks for confirmation.

   3. THE VAULT IS NEVER HALF-WRITTEN. Pushes send the entire
      snapshot in one upsert. There is no per-key merging to tear a
      wallet away from the collection it paid for.

   A NOTE ON COMPARING SAVES. Every question this module asks - is
   there a collision, is a push needed, is it safe to wipe - is
   answered by digest(). `saves.data` is jsonb, and Postgres reorders
   object keys on the way in, so a digest built with a plain
   JSON.stringify finds a difference between a save and itself after
   one round trip. digest() therefore canonicalizes (keys sorted at
   every level) and must keep doing so.

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
    ['eol.shop.codes.v1', 'flags.shopCodes', 'json'],
    ['eol.campaign.ch1.progress', 'campaign', 'json'],
    ['eol.decks.v1', 'decks', 'json'],
    ['eol.scale', 'settings.scale', 'int'],
    ['eol.gfx', 'settings.gfx', 'str'],
    ['eol.audio.v1', 'settings.audio', 'json'],
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
  /* Set before the reload that follows an account restore. Read once at
     module boot, before app.js consumes the same marker for its toast.
     If deterministic client migrations then make localStorage newer than
     the just-restored cloud document, the upgraded local snapshot must go
     UP to Supabase—not be overwritten and reloaded forever. */
  var restoredBoot = false;
  var restoredDigest = null;
  /* app.js installs this: (summaries) -> 'local' | 'cloud' | null,
     possibly as a promise. Without a handler the account still wins,
     which is the pre-existing behaviour. */
  var conflictHandler = null;
  try {
    restoredBoot = sessionStorage.getItem('eol.cloud.restored') === '1';
    restoredDigest = sessionStorage.getItem('eol.cloud.restoreDigest');
  } catch (e) {
    /* fine */
  }

  function clearRestoreGuard() {
    restoredBoot = false;
    restoredDigest = null;
    try {
      sessionStorage.removeItem('eol.cloud.restored');
      sessionStorage.removeItem('eol.cloud.restoreDigest');
    } catch (e) {
      /* fine */
    }
  }

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

  /* THE DIGEST MUST BE CANONICAL.
     -------------------------------------------------------------
     This answers one question - "is the vault holding exactly this
     state?" - and every collision prompt, every skipped push, and
     the sign-out wipe's safety check all rest on the answer.

     Plain JSON.stringify cannot be that answer. The column is
     `jsonb`, and Postgres does not store an object as the bytes we
     sent it: jsonb keeps keys in its own order (shortest first, then
     bytewise), so a document that makes the round trip comes back
     semantically identical and textually different. Comparing the
     raw strings therefore reported a conflict between a save and
     ITSELF - which is exactly what put the override prompt in front
     of signed-in players on every single boot.

     Sorting keys at every level makes the digest depend on what the
     save MEANS rather than on the order a database happened to
     return it in. Array order is preserved: [1,2,3] and [3,2,1] are
     genuinely different saves. */
  function canonical(v) {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
      var out = {};
      Object.keys(v)
        .sort()
        .forEach(function (k) {
          out[k] = canonical(v[k]);
        });
      return out;
    }
    return v;
  }

  function digest(snap) {
    return JSON.stringify(canonical(snap));
  }

  /* ---------------------------------------------------------
     IS THERE ANYTHING HERE WORTH KEEPING?
     -------------------------------------------------------------
     Sign-in must only interrupt a player who would actually LOSE
     something. A first boot is not empty - deck.js seeds a 12-card
     Grimmwood starter and campaign.js writes its tutorial flags
     before anyone has played a single battle - so "does localStorage
     have keys" is the wrong question. Ask instead whether the player
     has any of the things a session PRODUCES:

       - coins earned or spent
       - cards beyond the seeded starter
       - any gate cleared on any difficulty
       - any battle fought
       - a deck they built or edited themselves

     Everything else (settings, tutorial flags, the starter deck) is
     replaceable and never worth a prompt.
     --------------------------------------------------------- */
  function summarize(doc) {
    var out = { coins: 0, cards: 0, gates: 0, fought: 0, decks: 0, any: false };
    if (!doc) return out;

    out.coins = Math.max(0, parseInt(doc.wallet, 10) || 0);
    out.cards = Array.isArray(doc.owned) ? doc.owned.length : 0;

    var camp = doc.campaign || {};
    var runs = camp.runs || {};
    Object.keys(runs).forEach(function (id) {
      var run = runs[id] || {};
      if (Array.isArray(run.cleared)) out.gates += run.cleared.length;
    });
    /* pre-difficulty saves kept `cleared` at the top level */
    if (!camp.runs && Array.isArray(camp.cleared)) out.gates += camp.cleared.length;
    out.fought = Array.isArray(camp.fought) ? camp.fought.length : 0;

    /* The seeded starter is not an achievement; a deck the player made
       or renamed is. */
    var decks = doc.decks;
    if (Array.isArray(decks)) {
      out.decks = decks.filter(function (d) {
        return d && d.id !== 'starter-grimmwood';
      }).length;
    }

    /* Owned cards only count as progress BEYOND the seeded starter. */
    var starterSize = 0;
    try {
      var ids = window.EOL.economy && window.EOL.economy.starterIds;
      starterSize = ids ? ids().length : 0;
    } catch (e) {
      /* economy not loaded (tests) - treat every card as earned */
    }

    out.any =
      out.coins > 0 || out.cards > starterSize || out.gates > 0 || out.fought > 0 || out.decks > 0;
    return out;
  }

  /* Erase every local key this module knows about. Used by sign-out:
     the vault has the state, the browser must not keep a copy. */
  function wipeLocal() {
    KEYS.forEach(function (k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {
        /* private mode */
      }
    });
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
      .upsert(
        { user_id: uid, data: snap, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
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

  /* Write an account save over this device and reboot into it. Returns
     true when a reload was scheduled. One clean boot means every module
     reads the restored state instead of half-migrating a live UI; the
     marker also lets the next boot promote any client-side save
     migration back to the vault without another reload. */
  function restore(snap) {
    var changed = apply(snap);
    if (!changed) return false;
    try {
      sessionStorage.setItem('eol.cloud.restored', '1');
      sessionStorage.setItem('eol.cloud.restoreDigest', digest(snap));
    } catch (e) {
      /* fine */
    }
    window.location.reload();
    return true;
  }

  /* sign-in: pull the vault. Account save present -> apply + one clean
     reload, or ask first when the device is carrying its own progress.
     Absent -> this device's save becomes the account's first. */
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
            /* THE COLLISION. The account holds a save AND this device is
               carrying progress of its own that is not already in it.
               Whichever way this resolves, one of them is destroyed, so
               it is not a decision this module may take by itself: hand
               both summaries to the UI and wait. Declining leaves the
               device untouched and signs back out, which is the only
               outcome that loses nothing. */
            var localDoc = collect();
            if (!restoredBoot && summarize(localDoc).any && conflictHandler) {
              var decision = conflictHandler({
                local: summarize(localDoc),
                cloud: summarize(snap),
              });
              return Promise.resolve(decision).then(function (choice) {
                if (choice === 'local') {
                  /* keep playing this device's save and overwrite the
                     account with it */
                  lastPushed = null;
                  return push();
                }
                if (choice === 'cloud') {
                  return restore(snap);
                }
                /* cancelled: no local change, and the session ends so the
                   player is exactly where they were before they signed in */
                if (window.EOL.auth && window.EOL.auth.signOut) window.EOL.auth.signOut();
                return false;
              });
            }
            if (restoredBoot && (!restoredDigest || restoredDigest === lastPushed)) {
              /* The previous boot already applied this exact account save.
                 Any difference now is a deterministic client migration
                 (for example campaign v2 -> three difficulty runs). Push
                 that upgrade once instead of restoring the old shape and
                 entering an infinite reload loop. The digest check keeps a
                 genuinely newer write from another device authoritative. */
              clearRestoreGuard();
              return push();
            }
            var changed = restore(snap);
            if (changed) return;
          }
          clearRestoreGuard();
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

  /* SIGNING OUT CLEARS THE DEVICE.
     The account is the save, so a browser that is no longer signed in
     must not keep a copy of it - otherwise the next person on this
     computer inherits the last player's coins, cards, and campaign,
     and a guest session silently continues from a stranger's state.

     Order matters and is not negotiable:
       1. flush, so nothing earned in the last few seconds is lost
       2. only then erase, and only if the flush resolved
       3. reload to a genuine first boot

     A failed flush ABORTS the wipe. Losing the network must never
     also lose the save; the player stays signed in with their
     progress intact. leave() runs BEFORE auth clears the session,
     because push() needs the uid it is about to drop. */
  function leave() {
    if (!uid) return Promise.resolve(false);
    return push()
      .then(function () {
        /* DO NOT trust push()'s return value here. It resolves false for
           two very different reasons - "nothing had changed" and "the
           upsert failed" - and erasing the device on the second one
           would destroy the save. `lastPushed` only advances on a
           CONFIRMED write, so comparing it to what is on disk right now
           is the honest question: does the vault provably hold this
           exact state? If not, keep everything. */
        if (lastPushed !== digest(collect())) return false;
        wipeLocal();
        try {
          sessionStorage.setItem('eol.cloud.cleared', '1');
        } catch (e) {
          /* fine */
        }
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function init() {
    /* THE PORTAL BUILD DOES NOT USE THIS VAULT.
       Its Supabase session is anonymous - it exists only to give the
       Daily Puzzle's attempt ledger a uid to key on. It is not an
       account: no email, no password, nothing to sign back into. A
       save pushed to it could never be recovered by the player, and
       every portal visitor would leave another orphan row behind.
       Progress there belongs to the CrazyGames account instead, via
       the SDK's Data module. See js/crazygames-sdk.js. */
    var P = window.EOL.platform;
    if (P && P.cloudVault === false) return;
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
    leave: leave,
    KEYS: KEYS.slice(),
    /* test hooks */
    _collect: collect,
    _summarize: summarize,
    onConflict: function (fn) {
      conflictHandler = fn;
    },
    status: function () {
      return uid ? 'on' : 'off';
    },
    /* true on the first boot after a sign-out wipe - app.js may greet */
    cleared: function () {
      try {
        if (sessionStorage.getItem('eol.cloud.cleared') === '1') {
          sessionStorage.removeItem('eol.cloud.cleared');
          return true;
        }
      } catch (e) {
        /* fine */
      }
      return false;
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
