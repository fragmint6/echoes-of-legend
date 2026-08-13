/* =============================================================
 * Accounts - Supabase auth
 * -------------------------------------------------------------
 * WHAT AN ACCOUNT IS FOR
 *
 *   Two jobs, cleanly split: a stable identity so matchmaking can
 *   pair two players (this module + js/mp.js), and a home for the
 *   player's save - THE VAULT in js/cloud.js, which mirrors the
 *   whole local state to the `saves` table when signed in.
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
 *  3. THE ACCOUNT IS THE CLOUD SAVE. Signed-out progress remains in
 *     localStorage. A new account adopts that device save; signing into
 *     an account with an existing Vault restores the account's save.
 *     js/cloud.js owns that synchronization and its reload guard.
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
     USERNAME LAW
     ---------------------------------------------------------
     A username (callsign) is what opponents see in matchmaking, so
     the character set is locked: letters, numbers, and . _ - only,
     3-24 characters. `handle_chosen` in user_metadata records that
     the name came from the player (the form / the Google prompt)
     rather than being auto-derived from their email - that flag is
     the difference between "has a name" and "was asked". */
  var USERNAME_RE = /^[A-Za-z0-9._-]{3,24}$/;

  /* Returns null when valid, otherwise the message to show. */
  function validateHandle(h) {
    if (!h) return 'Pick a username.';
    if (h.length < 3) return 'Too short - 3 characters minimum.';
    if (h.length > 24) return 'Too long - 24 characters maximum.';
    if (!USERNAME_RE.test(h)) return 'Only letters, numbers, and . _ - are allowed.';
    return null;
  }

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

    /* Arm the boot gate before the first session lookup, on builds
       where the SDK owns identity and an anonymous fallback exists. */
    var P0 = window.EOL.platform;
    if (P0 && P0.sdk && P0.anonymousAuth) {
      portalGate = true;
      portalGateTimer = setTimeout(function () {
        /* The SDK never answered. Fall back rather than leaving the
           Daily Puzzle without a session forever. */
        openPortalGate();
      }, 9000);
    }

    client = window.supabase.createClient(cfg().url, cfg().anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    client.auth.getSession().then(function (res) {
      var s = res && res.data ? res.data.session : null;
      handleSession(s);
      if (!s) maybeSignInAnonymously();
    });
    client.auth.onAuthStateChange(function (_evt, s) {
      handleSession(s);
    });
  }

  /* ---------------------------------------------------------
     ANONYMOUS SESSIONS (portal builds)
     -------------------------------------------------------------
     The Daily Puzzle is enforced in Postgres, not in the client: one
     shared `active` board per day, and a (puzzle_id, user_id,
     attempt_no) ledger capped at two. Every one of those RPCs opens
     with `auth.uid()` and raises 'authentication required' when it is
     null, and the tables themselves are REVOKEd from anon.

     Inside the CrazyGames iframe, Google cannot redirect and there is
     no account to sign into - so without a session the Daily is simply
     gone. signInAnonymously() creates a REAL auth.users row, which
     means auth.uid() is non-null and every existing RPC, grant, and
     policy keeps working with no schema change at all. The player gets
     the genuine shared board and a genuine two-attempt limit.

     Two things this deliberately does NOT do:
       - it never runs on the web build, where a real account is
         offered and anonymous rows would just be litter;
       - it never grants a generation lease (js/daily.js), so portal
         tabs consume the Daily and never publish it.
     --------------------------------------------------------- */
  function wantsAnonymous() {
    var p = window.EOL.platform;
    if (!p || !p.anonymousAuth) return false;
    /* A CrazyGames sign-in is in flight, or has already produced a
       real account. Creating an anonymous row now would race it and
       leave the player on a throwaway identity. See signInWithCrazyGames. */
    if (portalExchange) return false;
    return true;
  }

  /* THE BOOT RACE.
     -------------------------------------------------------------
     init() runs from app.js the moment the page is ready, but the
     CrazyGames SDK resolves asynchronously and may take seconds (it
     has its own 8s timeout). Left alone, the anonymous sign-in
     always won, and the player was stranded on a throwaway identity
     a few hundred milliseconds before their real account arrived.

     So on a build that has BOTH the SDK and the anonymous fallback,
     the fallback waits for the SDK to say which it is: an account
     (signInWithCrazyGames) or a guest (portalIsGuest). The timeout
     is the backstop for an SDK that never answers at all - the
     Daily Puzzle still gets its session, just a little later. */
  var portalGate = false;
  var portalGateTimer = 0;

  function openPortalGate() {
    if (!portalGate) return;
    portalGate = false;
    clearTimeout(portalGateTimer);
    if (!session) maybeSignInAnonymously();
  }

  /* js/crazygames-sdk.js calls this when the player is NOT logged in
     to CrazyGames. A guest is a normal, supported state. */
  function portalIsGuest() {
    openPortalGate();
  }

  /* ---------------------------------------------------------
     CRAZYGAMES ACCOUNTS
     -------------------------------------------------------------
     A REAL account for a portal player, so multiplayer works.

     The anonymous session above is not an account: its uid is
     per-browser, it has no profiles row (so opponents saw the
     literal name 'Player'), and nothing ties it to the person
     playing. This exchanges the SDK's signed token for a durable
     Supabase account keyed on the CrazyGames id.

     WHAT IS TRUSTED. Only getUserToken(), and only after the Edge
     Function has checked its RS256 signature against CrazyGames'
     published key. `__dangerousUserId` is never sent - it is
     forgeable from the console. The token is never stored, never
     decoded here, and never logged: it goes straight to the
     function and is dropped.

     WHY THE FUNCTION RETURNS CREDENTIALS. Minting a session
     server-side would mean hand-managing access and refresh tokens
     in the client. Instead the function returns the shadow
     account's email and password, the normal SDK sign-in runs, and
     session persistence and refresh work exactly as they do for an
     email account. Those credentials are derived from the service
     role key and are unobtainable without a valid CrazyGames token.

     DEGRADING. Every failure path leaves the player exactly where
     they were: a guest with local progress. The Daily Puzzle's
     anonymous fallback still runs, because a portal player who is
     not logged in to CrazyGames is a perfectly normal case.
     --------------------------------------------------------- */
  var portalExchange = false;

  function cgAuthEndpoint() {
    var c = cfg();
    if (c.cgAuthUrl) return c.cgAuthUrl;
    if (!c.url) return '';
    return c.url.replace(/\/+$/, '') + '/functions/v1/cg-auth';
  }

  /* True once a CrazyGames-backed session is live. The UI asks this
     to tell a real portal account from the anonymous fallback. */
  function isPortalAccount() {
    var u = session && session.user;
    if (!u) return false;
    var meta = u.user_metadata || {};
    return !!meta.cg_user_id;
  }

  function signInWithCrazyGames(getToken) {
    if (!client) return Promise.resolve(null);
    if (portalExchange) return Promise.resolve(null);
    if (isPortalAccount()) return Promise.resolve(session);

    var endpoint = cgAuthEndpoint();
    if (!endpoint) return Promise.resolve(null);

    portalExchange = true;
    /* We are answering the gate, so its timeout is no longer needed -
       but leave the gate itself closed so the anonymous fallback
       cannot fire underneath the exchange. */
    clearTimeout(portalGateTimer);
    portalGate = true;
    setState('wait');

    return Promise.resolve()
      .then(getToken)
      .then(function (token) {
        if (!token) throw new Error('no token');
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            /* The function runs with --no-verify-jwt, but the
               platform's gateway still wants an apikey header. */
            apikey: cfg().anonKey || '',
          },
          body: JSON.stringify({ token: token }),
        });
      })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error('cg-auth ' + res.status + ': ' + t.slice(0, 200));
          });
        }
        return res.json();
      })
      .then(function (creds) {
        if (!creds || !creds.email || !creds.password)
          throw new Error('cg-auth gave no credentials');
        /* An anonymous session may already be live from a previous
           boot. Signing in replaces it; the anonymous row is left
           behind and migration 09 documents how to sweep those. */
        return client.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
      })
      .then(function (res) {
        if (res.error) throw res.error;
        /* A real account is live: the gate has served its purpose and
           the anonymous fallback must never run now. */
        portalGate = false;
        clearTimeout(portalGateTimer);
        return res.data && res.data.session ? res.data.session : null;
      })
      .catch(function (err) {
        /* A guest, an undeployed function, or a portal outage all
           land here, and none of them should break the game. */
        console.warn('[EOL] CrazyGames sign-in unavailable:', (err && err.message) || err);
        portalExchange = false;
        /* The anonymous fallback was suppressed while this ran, so
           give the Daily Puzzle its session back. */
        openPortalGate();
        return null;
      });
  }

  function maybeSignInAnonymously() {
    if (!client || !wantsAnonymous()) return;
    /* Hold for the SDK's verdict - see THE BOOT RACE above. */
    if (portalGate) return;
    if (!client.auth.signInAnonymously) {
      console.warn('[EOL] Supabase build has no signInAnonymously; Daily Puzzle stays locked.');
      return;
    }
    setState('wait');
    client.auth
      .signInAnonymously()
      .then(function (res) {
        if (res.error) throw res.error;
      })
      .catch(function (err) {
        /* Anonymous sign-ins are a project-level toggle in the Supabase
           dashboard. If it is off, say so precisely rather than leaving
           a silent 'wait' spinner - the rest of the game is unaffected,
           only the Daily Puzzle needs the session. */
        console.warn(
          '[EOL] Anonymous sign-in failed (enable it in Supabase -> ' +
            'Authentication -> Sign In / Providers -> Anonymous): ' +
            ((err && err.message) || err)
        );
        setState(null);
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

  /* An anonymous session is a real auth.users row with no email and no
     identities - it exists so the Daily Puzzle's server-side ledger has
     a uid to key on. Supabase marks it is_anonymous; the identities
     fallback covers older SDK builds. */
  function sessionIsAnonymous() {
    var u = session && session.user;
    if (!u) return false;
    if (typeof u.is_anonymous === 'boolean') return u.is_anonymous;
    return !u.email && Array.isArray(u.identities) && u.identities.length === 0;
  }

  /* ---------------------------------------------------------
     THE PORTAL OWNS THE PLAYER'S IDENTITY
     -------------------------------------------------------------
     On CrazyGames the name and avatar belong to the CrazyGames
     account, not to us. js/crazygames-sdk.js reads them from the
     user module and parks them here, and they are overlaid onto
     whatever the Supabase session says.

     Two reasons this is an overlay rather than a write into the
     session: the portal's session is anonymous and has nothing to
     write to, and the player can rename themselves on CrazyGames at
     any moment - the auth listener then updates this and the UI
     follows, with no stale copy of a username anywhere in our code.

     This is display only. `__dangerousUserId` is exactly what its
     name says: it is trivially forged from the browser console and
     must never authenticate anything. Anything server-side needs
     getUserToken() verified against CrazyGames' public key. */
  var portalIdentity = null;

  function setPortalIdentity(user) {
    portalIdentity =
      user && user.username
        ? { name: String(user.username), avatar: String(user.profilePictureUrl || '') }
        : null;
    notify();
  }

  function publicUser() {
    /* THE PORTAL IDENTITY DOES NOT DEPEND ON SUPABASE.
       A CrazyGames player is signed in whether or not we ever got a
       Supabase session - and on the portal we frequently will not,
       because the anonymous sign-in needs a CDN and a network that
       an embedded iframe may not have. Checking the session first
       would throw away a perfectly good identity for a reason the
       player cannot see. The Supabase uid is still used when it
       exists (the Daily Puzzle needs it); it is simply not required
       in order to have a name. */
    if (portalIdentity) {
      return {
        id: session && session.user ? session.user.id : '',
        email: '',
        name: portalIdentity.name,
        avatar: portalIdentity.avatar,
        anonymous: false,
        portal: true,
        /* A CrazyGames NAME is not a CrazyGames ACCOUNT. The name
           arrives from the SDK the moment the page loads; the
           account only exists once the token has been verified and
           a session minted. Multiplayer, the vault and anything
           else that needs a durable uid must read this, not
           `portal`. */
        portalAccount: isPortalAccount(),
      };
    }
    if (!session || !session.user) return null;
    var u = session.user;
    var meta = u.user_metadata || {};
    var anon = sessionIsAnonymous();
    return {
      id: u.id,
      email: u.email || '',
      /* No email to derive a name from, and nothing the player can
         rename, so anonymous sessions carry a fixed label rather than
         an empty string that the UI would render as a blank pill. */
      name: anon
        ? 'Guest'
        : (profile && profile.handle) ||
          meta.full_name ||
          meta.name ||
          (u.email || '').split('@')[0],
      avatar: anon ? '' : meta.avatar_url || meta.picture || '',
      anonymous: anon,
      portal: false,
    };
  }

  /* ---------------------------------------------------------
     profile row
     --------------------------------------------------------- */
  function ensureProfile() {
    if (!client || !session) return Promise.resolve(null);
    /* profiles is the table matchmaking reads to show your opponent a
       name. An anonymous portal session never queues, so it needs no
       row - skip the upsert instead of seeding thousands of identical
       'Guest' profiles that nothing will ever read. */
    if (sessionIsAnonymous()) {
      profile = null;
      return Promise.resolve(null);
    }
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
     PROFILE EDITS
     ---------------------------------------------------------
     Username and password changes come from the settings modal and
     the post-Google callsign prompt. Both go through the auth user
     first (metadata is the durable record), then the profiles row
     that matchmaking reads. A username that loses the uniqueness
     race is reported, not silently mangled.
     --------------------------------------------------------- */
  function setHandle(handle) {
    if (!client || !session) return Promise.reject(new Error('Sign in first.'));
    var bad = validateHandle(handle);
    if (bad) return Promise.reject(new Error(bad));
    return client.auth
      .updateUser({ data: { full_name: handle, handle_chosen: true } })
      .then(function (res) {
        if (res.error) throw res.error;
        return client
          .from('profiles')
          .upsert({ id: session.user.id, handle: handle }, { onConflict: 'id' })
          .select()
          .single();
      })
      .then(function (res) {
        /* Postgres 23505 = unique violation: someone else owns this
           callsign. Surface it as a pick-another message. */
        if (res.error) {
          if (res.error.code === '23505') throw new Error('That username is taken.');
          throw res.error;
        }
        profile = res.data;
        notify();
        return profile;
      });
  }

  function updatePassword(newPassword) {
    if (!client || !session) return Promise.reject(new Error('Sign in first.'));
    if (!newPassword || newPassword.length < 6)
      return Promise.reject(new Error('Password needs at least 6 characters.'));
    return client.auth.updateUser({ password: newPassword }).then(function (res) {
      if (res.error) throw res.error;
      return res;
    });
  }

  /* True while a signed-in user is still wearing a name we derived
     from their email/Google instead of one they chose. The prompt
     (see app.js) stays on them until this is false. */
  function needsHandle() {
    if (!session || !session.user) return false;
    /* Never stalk an anonymous session for a callsign: there is nobody
       to show it to, and the portal build has no way to set one. */
    if (sessionIsAnonymous()) return false;
    var p = window.EOL.platform;
    if (p && p.canEditIdentity === false) return false;
    var meta = session.user.user_metadata || {};
    return !meta.handle_chosen;
  }

  /* ---------------------------------------------------------
     public API
     --------------------------------------------------------- */
  window.EOL.auth = {
    init: init,
    configured: configured,
    /* js/crazygames-sdk.js calls this with the CrazyGames user (or
       null for a guest). Display only - see setPortalIdentity. */
    setPortalIdentity: setPortalIdentity,
    /* Exchanges a CrazyGames token for a REAL account (multiplayer,
       a stable uid, a profiles row). Takes a function returning the
       token so the token never has to sit in a variable here. */
    signInWithCrazyGames: signInWithCrazyGames,
    /* The player is not logged in to CrazyGames - release the boot
       gate so the Daily Puzzle's anonymous session can be created. */
    portalIsGuest: portalIsGuest,
    /* True when the live session is a CrazyGames-backed account, as
       opposed to the anonymous Daily-Puzzle fallback. */
    isPortalAccount: isPortalAccount,
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
          /* the form asked for a name, so this one counts as chosen -
             Google users are the only ones the callsign prompt stalks */
          options: { data: { full_name: handle || '', handle_chosen: !!handle } },
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

    /* settings modal + callsign prompt */
    validateHandle: validateHandle,
    setHandle: setHandle,
    updatePassword: updatePassword,
    needsHandle: needsHandle,
    /* Lets the UI ask "is this a real account?" without knowing which
       build it is running in. */
    isAnonymous: sessionIsAnonymous,

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
