/* =============================================================
   CRAZYGAMES SDK BRIDGE
   -------------------------------------------------------------
   Loaded ONLY on the portal build (js/platform.js). On the web build
   this file is never fetched, and every function below is absent.

   WHAT THIS DOES, AND WHY IT MATTERS DURING BASIC LAUNCH.

   Basic Launch is the trial where CrazyGames measures how players
   respond before inviting a game to Full Launch. The game module is
   how they see that: loadingStart/loadingStop time the boot, and
   gameplayStart/gameplayStop mark when somebody is actually PLAYING
   rather than sitting in a menu. Their docs also note the first
   gameplay event is what determines a game's initial loading size.

   Without these calls, a player who spends four minutes in a battle
   and four minutes reading the Rulebook looks identical. With them,
   the engagement CrazyGames measures is the engagement that actually
   happened. That is the whole reason to integrate this early.

   WHAT THIS DELIBERATELY DOES NOT DO: ads. Video ads are disabled
   during Basic Launch - the SDK answers `adsDisabledBasicLaunch` -
   so ad placements cannot be tested or tuned yet and would be
   guesswork committed to code. Banners, rewarded ads, and Xsolla
   purchases all belong to the Full Launch pass, together with the
   user module (getUserToken) that replaces the anonymous Supabase
   session in js/auth.js.

   THE GAME MUST SURVIVE THIS FILE FAILING. The SDK is a third-party
   script on a CDN: it can be blocked by an ad blocker, time out, or
   never initialize. Every entry point below is wrapped so that a
   dead SDK costs the player nothing at all.
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var P = window.EOL.platform;
  if (!P || !P.sdk) return; // web build: nothing to do

  var SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
  var LOAD_TIMEOUT_MS = 8000;

  var sdk = null; // window.CrazyGames.SDK once initialized
  var ready = false;
  /* Two layers, deliberately. `playing`/`loadingOpen` are what the GAME
     is doing; `sentPlaying`/`sentLoading` are what the SDK has actually
     been told. They diverge during startup, because the game begins
     loading and can even reach a view before init() resolves. Keeping
     them apart is what lets us flush the true state once the SDK
     answers, instead of silently dropping those early calls. */
  var playing = false;
  var loadingOpen = false;
  var sentPlaying = false;
  var sentLoading = false;

  /* Views where the player is actually playing rather than reading a
     menu. Everything not listed here counts as a break. */
  var PLAY_VIEWS = { battle: 1, draft: 1, prep: 1 };

  function log(msg, err) {
    /* One line, never a throw. A portal player cannot act on this. */
    if (err) console.warn('[EOL] CrazyGames SDK: ' + msg, err);
    else console.info('[EOL] CrazyGames SDK: ' + msg);
  }

  /* --------------------------------------------------------------
     Load the SDK script. Resolves with null when it cannot be had -
     blocked, offline, or simply slow - so callers never branch on
     an exception. */
  function loadScript() {
    return new Promise(function (resolve) {
      if (window.CrazyGames && window.CrazyGames.SDK) return resolve(window.CrazyGames.SDK);

      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        resolve(value);
      }

      var el = document.createElement('script');
      el.src = SDK_URL;
      el.async = true;
      el.onload = function () {
        finish((window.CrazyGames && window.CrazyGames.SDK) || null);
      };
      el.onerror = function () {
        log('script could not be loaded (ad blocker or network) - continuing without it');
        finish(null);
      };
      document.head.appendChild(el);

      /* An unresolved promise here would leave the boot veil waiting
         on a script that is never coming. */
      setTimeout(function () {
        if (!done) log('load timed out - continuing without it');
        finish(null);
      }, LOAD_TIMEOUT_MS);
    });
  }

  /* v3 requires an explicit init() and is unusable until it resolves. */
  function init() {
    return loadScript()
      .then(function (loaded) {
        if (!loaded) return false;
        sdk = loaded;
        return Promise.resolve(sdk.init()).then(
          function () {
            ready = true;
            log('ready (environment: ' + safeEnv() + ')');
            return true;
          },
          function (err) {
            sdk = null;
            log('init failed - continuing without it', err);
            return false;
          }
        );
      })
      .catch(function (err) {
        sdk = null;
        log('init threw - continuing without it', err);
        return false;
      });
  }

  function safeEnv() {
    try {
      return (sdk && sdk.game && sdk.game.environment) || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  /* Every call into the SDK goes through here. */
  function call(path, fn) {
    if (!ready || !sdk) return;
    try {
      fn();
    } catch (e) {
      log(path + ' failed', e);
    }
  }

  /* --------------------------------------------------------------
     LOADING. Brackets the boot: from this module's own start until
     the first view is painted and the veil lifts. */
  function loadingStart() {
    loadingOpen = true;
    flush();
  }

  function loadingStop() {
    loadingOpen = false;
    flush();
  }

  /* --------------------------------------------------------------
     GAMEPLAY. Idempotent on purpose: eol:view can fire for the same
     view twice (a re-show, a veil settle), and the SDK should not
     receive gameplayStart twice in a row. */
  function gameplayStart() {
    playing = true;
    flush();
  }

  function gameplayStop() {
    playing = false;
    flush();
  }

  /* Reconcile what the SDK has been told with what is actually true.
     Before init() resolves this does nothing; the moment it does, the
     real state is delivered - so a battle entered during a slow SDK
     load is still counted, and a loading phase that ended before the
     SDK arrived is never reported as an unmatched stop. */
  function flush() {
    if (!ready || !sdk) return;

    if (loadingOpen && !sentLoading) {
      sentLoading = true;
      call('loadingStart', function () {
        sdk.game.loadingStart();
      });
    } else if (!loadingOpen && sentLoading) {
      sentLoading = false;
      call('loadingStop', function () {
        sdk.game.loadingStop();
      });
    }

    if (playing && !sentPlaying) {
      sentPlaying = true;
      call('gameplayStart', function () {
        sdk.game.gameplayStart();
      });
    } else if (!playing && sentPlaying) {
      sentPlaying = false;
      call('gameplayStop', function () {
        sdk.game.gameplayStop();
      });
    }
  }

  function syncToView(view) {
    if (PLAY_VIEWS[view]) gameplayStart();
    else gameplayStop();
  }

  /* --------------------------------------------------------------
     GAME SETTINGS. CrazyGames can mute a game from its own chrome,
     and that setting OUTRANKS our in-game control - a player who hits
     Unmute in Settings must still hear nothing while the portal has
     us muted. js/audio.js keeps this separate from the player's own
     preference so nothing is written over and the original setting
     returns intact when the portal releases the mute.

     `disableChat` is read for completeness but the game has no chat
     to disable, so there is nothing to act on. */
  function applySettings(settings) {
    if (!settings) return;
    var A = window.EOL.audio;
    if (A && A.setExternalMute) {
      try {
        A.setExternalMute(!!settings.muteAudio);
      } catch (e) {
        log('applying muteAudio failed', e);
      }
    }
  }

  function readSettings() {
    if (!ready || !sdk || !sdk.game) return null;
    try {
      return sdk.game.settings || null;
    } catch (e) {
      log('reading settings failed', e);
      return null;
    }
  }

  /* Audio may not exist yet when the SDK answers (audio.js mounts on
     DOMContentLoaded), so the first apply is retried once the DOM is
     ready rather than dropped. */
  function syncSettings() {
    var s = readSettings();
    if (!s) return;
    if (window.EOL.audio && window.EOL.audio.setExternalMute) {
      applySettings(s);
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        function () {
          applySettings(readSettings());
        },
        { once: true }
      );
    }
  }

  /* --------------------------------------------------------------
     WIRING. The listener is attached IMMEDIATELY - before init()
     resolves - so a view change during startup is not missed. The
     calls no-op until `ready`, and the current view is replayed once
     the SDK answers. */
  document.addEventListener('eol:view', function (ev) {
    syncToView(ev && ev.detail);
  });

  /* The boot veil lifting is the honest "the game is up" moment: it
     waits on the first view's art and fonts, not merely on scripts. */
  var veilWatch = null;
  function watchVeil() {
    var veil = document.getElementById('veil');
    if (!veil) {
      loadingStop();
      return;
    }
    if (!veil.classList.contains('on')) {
      loadingStop();
      return;
    }
    veilWatch = new MutationObserver(function () {
      if (!veil.classList.contains('on')) {
        if (veilWatch) veilWatch.disconnect();
        veilWatch = null;
        loadingStop();
      }
    });
    veilWatch.observe(veil, { attributes: true, attributeFilter: ['class'] });
    /* Belt and braces: app.js has its own 3.2s failsafe for a stuck
       veil, so never let loading hang longer than that plus a margin. */
    setTimeout(function () {
      if (veilWatch) {
        veilWatch.disconnect();
        veilWatch = null;
      }
      loadingStop();
    }, 12000);
  }

  loadingStart();

  init().then(function () {
    /* The SDK has answered. Deliver whatever is true right now: the
       view the player already reached, and the loading phase that may
       already have started or finished while we were waiting. */
    if (ready) {
      var view = (document.body && document.body.dataset.view) || 'home';
      syncToView(view);
      flush();
      /* Honour a mute that was already set before the game loaded, then
         follow every later change the portal makes. */
      syncSettings();
      call('addSettingsChangeListener', function () {
        sdk.game.addSettingsChangeListener(applySettings);
      });
      /* Progress save. Only when platform.js says this build owns it,
         so the Supabase vault and the Data module can never both be
         writing the same keys. */
      if (P.dataModule) {
        try {
          initSave();
        } catch (e) {
          log('progress save setup failed - the local save still works', e);
        }
      }
      /* Identity last: it only affects what is displayed, so it must
         never delay loading or saving. */
      try {
        initUser();
      } catch (e) {
        log('identity setup failed - continuing as guest', e);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchVeil, { once: true });
    } else {
      watchVeil();
    }
  });

  /* --------------------------------------------------------------
     PROGRESS SAVE (the Data module)
     -------------------------------------------------------------
     On the portal, progress belongs to the player's CrazyGames
     account, and the SDK syncs it across their devices. The module's
     API is deliberately identical to localStorage - getItem,
     setItem, removeItem, clear - so this is a mirror, not a rewrite
     of how the game saves.

     WHICH KEYS. js/cloud.js's MAP is already the single source of
     truth for "what counts as progress", and it is exported as
     EOL.cloud.KEYS. Reusing it means a new persisted key is picked
     up here automatically, exactly as it is by the web build's
     vault. There is no second list to forget to update.

     DIRECTION AT BOOT. The account wins when it has anything,
     because it is the only copy that survives this browser. The
     local save is adopted only when the account has nothing - which
     is precisely the guest-plays-then-signs-in case, and the SDK
     also does this transfer itself for guests. When the account
     already holds progress it is written down to localStorage and
     the game reads it normally from there.

     WHY NOT ALSO THE SUPABASE VAULT. Two cloud saves writing the
     same keys would race and lose data. js/platform.js picks exactly
     one: cloudVault on web, dataModule on the portal. */
  var SAVE_DEBOUNCE_MS = 1200; // the SDK debounces ~1s of its own
  var saveTimer = null;
  var mirroring = false;

  function dataModule() {
    if (!ready || !sdk) return null;
    try {
      return sdk.data || null;
    } catch (e) {
      return null;
    }
  }

  function progressKeys() {
    var C = window.EOL.cloud;
    if (C && C.KEYS && C.KEYS.length) return C.KEYS;
    return [];
  }

  /* account -> this device. Returns true if anything landed. */
  function pullSave() {
    var data = dataModule();
    if (!data) return false;
    var keys = progressKeys();
    var landed = 0;
    keys.forEach(function (k) {
      var remote;
      try {
        remote = data.getItem(k);
      } catch (e) {
        return;
      }
      if (remote === null || remote === undefined) return;
      try {
        if (localStorage.getItem(k) !== remote) localStorage.setItem(k, String(remote));
        landed++;
      } catch (e) {
        /* private mode: nothing we can do, play on */
      }
    });
    return landed > 0;
  }

  /* this device -> account. Whole snapshot, never a partial write. */
  function pushSave() {
    var data = dataModule();
    if (!data || mirroring) return;
    mirroring = true;
    try {
      progressKeys().forEach(function (k) {
        var local;
        try {
          local = localStorage.getItem(k);
        } catch (e) {
          return;
        }
        try {
          if (local === null) data.removeItem(k);
          else data.setItem(k, local);
        } catch (e) {
          /* dataLimitExcedeed / dataModuleDisabled / other - the game
             keeps its local save either way, so this is not fatal. */
          log('data module write failed for ' + k, e);
        }
      });
    } finally {
      mirroring = false;
    }
  }

  function scheduleSave() {
    if (!dataModule()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      pushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  function initSave() {
    var data = dataModule();
    if (!data) return;

    /* Does the account already hold a save? */
    var hasRemote = false;
    var keys = progressKeys();
    for (var i = 0; i < keys.length; i++) {
      try {
        if (data.getItem(keys[i]) !== null && data.getItem(keys[i]) !== undefined) {
          hasRemote = true;
          break;
        }
      } catch (e) {
        /* keep looking */
      }
    }

    if (hasRemote) {
      /* The account is the save. Write it down and let the game boot
         from it - the veil is still up at this point, so no module
         has read a stale value yet. */
      pullSave();
      log('progress restored from the CrazyGames account');
    } else {
      /* Nothing up there yet: this device's save becomes the first. */
      pushSave();
      log('local progress adopted by the CrazyGames account');
    }

    /* Mirror on the same signals the Supabase vault uses, so the two
       builds stay behaviourally identical. */
    document.addEventListener('eol:coins', scheduleSave);
    document.addEventListener('eol:owned', scheduleSave);
    document.addEventListener('eol:view', scheduleSave);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
        pushSave(); // last reliable moment to write
      }
    });
  }

  /* --------------------------------------------------------------
     IDENTITY (the user module)
     -------------------------------------------------------------
     The portal owns the player's name and avatar, so the game shows
     theirs instead of inventing one. Three rules from the docs shape
     this:

       1. `isUserAccountAvailable` is false when the game is embedded
          on a third-party domain. Check it before anything else -
          the module is simply not there in that case.
       2. A null user is a GUEST, and that is a normal, supported
          state. Never block on it, and never pop the auth prompt
          automatically: the docs are explicit that it confuses
          people. A login button is allowed, but not as a main CTA.
       3. Ask on every start, because devices are shared and people
          rename themselves. The auth listener covers logins during
          play; logout refreshes the whole page, so there is nothing
          to handle for it.

     `__dangerousUserId` is deliberately not touched. It is forgeable
     from the console and must never authenticate anything - that is
     what getUserToken() plus server-side verification is for, and
     that only becomes necessary if progress ever moves to our own
     backend. Today progress lives in the Data module, which is
     already keyed on the account by the SDK. */
  var userModule = null;

  function users() {
    if (!ready || !sdk) return null;
    try {
      if (!sdk.user || !sdk.user.isUserAccountAvailable) return null;
      return sdk.user;
    } catch (e) {
      return null;
    }
  }

  function tellGame(user) {
    var A = window.EOL.auth;
    if (!A || !A.setPortalIdentity) return;
    try {
      A.setPortalIdentity(user || null);
    } catch (e) {
      log('publishing identity failed', e);
    }
  }

  /* THE TOKEN NEVER TOUCHES ANYTHING BUT THE EXCHANGE.
     -------------------------------------------------------------
     getUserToken() is the only trustworthy identifier CrazyGames
     gives us: a JWT they signed. It is passed as a THUNK so it is
     fetched inside auth.js at the moment of use and never parked in
     a variable here. It is never decoded, never stored, never
     logged - the Edge Function verifies the signature server-side
     against CrazyGames' published key.

     `__dangerousUserId` is not read anywhere. It is forgeable from
     the console and authenticates nothing. */
  function upgradeToAccount() {
    var A = window.EOL.auth;
    if (!A || !A.signInWithCrazyGames) return;
    if (!userModule || !userModule.getUserToken) return;
    try {
      A.signInWithCrazyGames(function () {
        return userModule.getUserToken();
      }).then(function (session) {
        if (session) log('CrazyGames account linked - multiplayer available');
      });
    } catch (e) {
      log('account link failed - continuing as a local player', e);
    }
  }

  function onUser(user) {
    tellGame(user);
    if (user) log('signed in as ' + user.username);
    /* A CrazyGames login is worth a real account: it is what gives
       the player a stable uid, a name their opponents can see, and
       multiplayer. A guest releases auth.js's boot gate instead so
       the Daily Puzzle still gets its anonymous session. */
    if (user) {
      upgradeToAccount();
    } else {
      var A = window.EOL.auth;
      if (A && A.portalIsGuest) A.portalIsGuest();
    }
    /* A login mid-session means a different account's progress may
       now be behind the Data module, so re-read it. The SDK reloads
       the page itself for data-module games, but doing this makes
       the behaviour correct even if that changes. */
    if (user && P.dataModule) {
      try {
        if (pullSave()) log('progress reloaded for the new account');
      } catch (e) {
        log('reloading progress after login failed', e);
      }
    }
  }

  function initUser() {
    userModule = users();
    if (!userModule) {
      /* Embedded off-portal, or an SDK without the module: the game
         carries on exactly as it does for a guest. Release auth.js's
         boot gate immediately rather than making the Daily Puzzle
         wait out the timeout for an answer that will never come. */
      var A0 = window.EOL.auth;
      if (A0 && A0.portalIsGuest) A0.portalIsGuest();
      return;
    }
    /* Ask every start - shared devices, renames, new logins. */
    Promise.resolve()
      .then(function () {
        return userModule.getUser();
      })
      .then(
        function (user) {
          onUser(user || null);
        },
        function (err) {
          /* userNotAuthenticated is the ordinary guest case. */
          if (!err || err.code !== 'userNotAuthenticated') {
            log('getUser failed - continuing as guest', err);
          }
          tellGame(null);
          var A1 = window.EOL.auth;
          if (A1 && A1.portalIsGuest) A1.portalIsGuest();
        }
      );

    call('addAuthListener', function () {
      userModule.addAuthListener(onUser);
    });
  }

  /* --------------------------------------------------------------
     Public surface. Kept small on purpose: the rest of the codebase
     should not learn SDK vocabulary, and nothing here is required
     for the game to run. */
  window.EOL.crazygames = {
    isReady: function () {
      return ready;
    },

    /* Is CrazyGames' own login popup available? False off-portal and
       for an SDK without the user module, so callers can fall back
       to whatever the web build offers. */
    canPromptLogin: function () {
      var u = users();
      return !!(u && u.showAuthPrompt);
    },

    /* Open CrazyGames' login/register popup. ONLY on an explicit
       player action - the docs warn that prompting unasked confuses
       people, and it must never be a main call to action.

       Resolves with the user, or null if they cancelled or it could
       not open. A successful login runs the same onUser() path as a
       login detected at boot, so the account is minted exactly once. */
    promptLogin: function () {
      var u = users();
      if (!u || !u.showAuthPrompt) return Promise.resolve(null);
      return Promise.resolve()
        .then(function () {
          return u.showAuthPrompt();
        })
        .then(
          function (user) {
            if (user) onUser(user);
            return user || null;
          },
          function (err) {
            /* userCancelled is the player changing their mind, which
               is not a problem worth logging as one. */
            if (err && err.code !== 'userCancelled') log('auth prompt failed', err);
            return null;
          }
        );
    },
    gameplayStart: gameplayStart,
    gameplayStop: gameplayStop,
    loadingStart: loadingStart,
    loadingStop: loadingStop,
    /* test hooks */
    _syncToView: syncToView,
    _applySettings: applySettings,
    _initSave: initSave,
    _initUser: initUser,
    _onUser: onUser,
    _pushSave: pushSave,
    _pullSave: pullSave,
    _playing: function () {
      return playing;
    },
  };
})();
