/* =============================================================
 * Accounts - Supabase auth
 * -------------------------------------------------------------
 * WHAT AN ACCOUNT IS FOR, AND WHAT IT IS NOT
 *
 *   An account exists here for exactly one reason: matchmaking needs
 *   two stable identities to pair. It does NOT sync your collection.
 *   Decks, graphics settings and dismissed tutorials all stay on the
 *   device, on purpose - see the note above pushDeck().
 *
 * Design rules this module follows:
 *
 *  1. THE GAME MUST WORK SIGNED OUT. Every singleplayer feature stays
 *     available with no account and no network. If Supabase is
 *     unconfigured or unreachable, the app behaves exactly as it did
 *     before; only multiplayer is unavailable.
 *
 *  2. NO SECRETS IN THE CLIENT. Only the publishable key is used.
 *     Every table is protected by Row Level Security, so this key can
 *     only touch the signed-in user's own rows. See
 *     docs/SUPABASE-SETUP.md for the schema and policies.
 *
 *  3. NOTHING LOCAL IS EVER OVERWRITTEN. Signing in and out cannot
 *     touch a deck, because nothing is uploaded in the first place.
 * ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  /* Read the config LAZILY. This module and js/supabase-config.js are
     separate script tags, and capturing the object at load time meant
     an empty config was cached before the config file had run. */
  function cfg() {
    return window.EOL.supabaseConfig || {};
  }
  var client = null;
  var session = null;
  var profile = null;
  var listeners = [];

  /* ---------------------------------------------------------
     boot
     --------------------------------------------------------- */
  function configured() {
    var c = cfg();
    return !!(c.url && c.anonKey);
  }

  /* Guard against the most damaging possible mistake: pasting a
     service-role key into a file the browser downloads. */
  function keyLooksSecret(key) {
    if (!key) return false;
    if (key.indexOf('sb_secret_') === 0) return true;
    if (key.indexOf('service_role') >= 0) return true;
    // legacy JWTs carry the role in the payload
    try {
      var parts = key.split('.');
      if (parts.length === 3) {
        var body = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (body && body.role === 'service_role') return true;
      }
    } catch (e) {
      /* not a JWT, fine */
    }
    return false;
  }

  function init() {
    /* THREE STATES, NOT TWO.
       body[data-auth] was only ever 'in' or 'out', so the moment
       between "we have credentials" and "the session came back" was
       indistinguishable from being signed out. On a slow connection
       the account button sat reading "Sign in" for a second or two
       and multiplayer looked locked when it was merely still
       connecting. 'wait' is that gap, and the UI can now show it. */
    if (!configured()) {
      setState(null);
      return;
    }
    if (keyLooksSecret(cfg().anonKey)) {
      console.error(
        '[EOL] REFUSING TO START SUPABASE: that looks like a SECRET / service-role key.\n' +
          'It bypasses Row Level Security and must never ship in browser code.\n' +
          'Use the PUBLISHABLE (anon) key from Project Settings -> API Keys, and\n' +
          'rotate the secret key immediately if it has been shared.'
      );
      setState(null);
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      console.warn('[EOL] Supabase SDK not loaded; running in local-only mode.');
      setState(null);
      return;
    }

    setState('wait');
    client = window.supabase.createClient(cfg().url, cfg().anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    client.auth.getSession().then(function (res) {
      handleSession(res && res.data ? res.data.session : null);
    });
    client.auth.onAuthStateChange(function (_evt, s) {
      handleSession(s);
    });
  }

  function handleSession(s) {
    var wasSignedIn = !!session;
    session = s || null;
    if (session) {
      ensureProfile()
        .then(function () {
          setState(session);
        })
        .catch(function (err) {
          /* A missing profiles table must not lock anyone out of a
             match - the identity in the JWT is what matchmaking uses. */
          console.warn('[EOL] profile write failed, continuing:', err && err.message);
          setState(session);
        });
    } else {
      profile = null;
      setState(null);
      if (wasSignedIn) notify();
    }
  }

  function setState(s) {
    document.body.dataset.auth = s === 'wait' ? 'wait' : s ? 'in' : 'out';
    notify();
  }

  /* True only while the very first session lookup is in flight. */
  function connecting() {
    return document.body.dataset.auth === 'wait';
  }

  function notify() {
    listeners.forEach(function (fn) {
      try {
        fn(publicUser());
      } catch (e) {
        /* a broken listener must not break auth */
      }
    });
  }

  function publicUser() {
    if (!session || !session.user) return null;
    var u = session.user;
    var meta = u.user_metadata || {};
    return {
      id: u.id,
      email: u.email || '',
      name:
        (profile && profile.handle) || meta.full_name || meta.name || (u.email || '').split('@')[0],
      avatar: meta.avatar_url || meta.picture || '',
    };
  }

  /* ---------------------------------------------------------
     profile row
     --------------------------------------------------------- */
  function ensureProfile() {
    if (!client || !session) return Promise.resolve(null);
    var u = session.user;
    var meta = u.user_metadata || {};
    return client
      .from('profiles')
      .upsert(
        {
          id: u.id,
          handle: meta.full_name || meta.name || (u.email || 'player').split('@')[0],
          avatar_url: meta.avatar_url || meta.picture || null,
        },
        { onConflict: 'id' }
      )
      .select()
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        profile = res.data;
        return profile;
      });
  }

  /* ---------------------------------------------------------
     NO DECK SYNC
     -------------------------------------------------------------
     Decks stay on the device, deliberately. Accounts exist here for
     ONE reason: to give a player a stable identity so matchmaking can
     pair two of them. Syncing collections is a separate feature with
     its own merge-conflict questions, and shipping it half-done risks
     the one thing that must never happen - losing someone's decks.

     js/deck.js still calls pushDeck/deleteDeck; they are kept as
     no-ops so that module needs no signed-in special case and sync can
     be reinstated later without touching it.
     --------------------------------------------------------- */
  function pushDeck() {
    return Promise.resolve();
  }
  function deleteDeck() {
    return Promise.resolve();
  }

  /* ---------------------------------------------------------
     public API
     --------------------------------------------------------- */
  window.EOL.auth = {
    init: init,
    configured: configured,
    isReady: function () {
      return !!client;
    },
    connecting: connecting,
    user: publicUser,
    onChange: function (fn) {
      listeners.push(fn);
      fn(publicUser());
    },

    signInWithGoogle: function () {
      if (!client) return Promise.reject(new Error('offline'));
      return client.auth
        .signInWithOAuth({
          provider: 'google',
          options: { redirectTo: cfg().redirectTo || window.location.href.split('#')[0] },
        })
        .then(function (res) {
          if (res.error) throw res.error;
          return res;
        });
    },

    signIn: function (email, password) {
      if (!client) return Promise.reject(new Error('offline'));
      return client.auth
        .signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          return res;
        });
    },

    signUp: function (email, password, handle) {
      if (!client) return Promise.reject(new Error('offline'));
      return client.auth
        .signUp({
          email: email,
          password: password,
          options: { data: { full_name: handle || '' } },
        })
        .then(function (res) {
          if (res.error) throw res.error;
          return res;
        });
    },

    signOut: function () {
      if (!client) return Promise.resolve();
      return client.auth.signOut();
    },

    /* Retained as no-ops: decks are local-only for now. */
    pushDeck: pushDeck,
    deleteDeck: deleteDeck,

    /* js/mp.js borrows the configured client rather than creating a
       second one, so both share a single auth session and socket. */
    /* The raw access token, for the ONE case where the supabase
       client cannot be used: a sendBeacon() during page teardown.
       PostgREST needs it to resolve auth.uid(), and without it an
       RPC silently succeeds while doing nothing. */
    accessToken: function () {
      return session && session.access_token ? session.access_token : null;
    },

    rawClient: function () {
      return client;
    },
  };
})();
