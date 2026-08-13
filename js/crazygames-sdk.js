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
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchVeil, { once: true });
    } else {
      watchVeil();
    }
  });

  /* --------------------------------------------------------------
     Public surface. Kept small on purpose: the rest of the codebase
     should not learn SDK vocabulary, and nothing here is required
     for the game to run. */
  window.EOL.crazygames = {
    isReady: function () {
      return ready;
    },
    gameplayStart: gameplayStart,
    gameplayStop: gameplayStop,
    loadingStart: loadingStart,
    loadingStop: loadingStop,
    /* test hooks */
    _syncToView: syncToView,
    _applySettings: applySettings,
    _playing: function () {
      return playing;
    },
  };
})();
