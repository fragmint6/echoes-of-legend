/* =============================================================
   CRAZYGAMES ACCOUNTS REGRESSION
   node sim/verify_cg_accounts.js
   -------------------------------------------------------------
   A CrazyGames login must buy a REAL Supabase account, because
   that is what makes multiplayer work on the portal build. Before
   this existed the portal had only an anonymous session: a
   per-browser uid, no profiles row, and every opponent displayed
   as the literal string 'Player'.

   What is proved here:

     A. the security boundary - only the SIGNED token is trusted,
        it is never decoded or stored client-side, and the
        forgeable __dangerousUserId is never sent anywhere
     B. the happy path - a logged-in CrazyGames player ends up with
        a durable account and mp.available() === true
     C. every failure degrades to exactly what shipped before:
        a guest with local progress and a working Daily Puzzle
     D. no boot race between the SDK and the anonymous fallback
     E. the Edge Function's own guarantees, read from its source

   The SDK and Supabase are simulated - this sandbox cannot reach
   either - so the FIRST REAL HANDSHAKE HAPPENS ON UPLOAD. What is
   verified here is our half of the contract.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
let JSDOM;
try {
  ({ JSDOM } = require('/tmp/node_modules/jsdom'));
} catch (e) {
  ({ JSDOM } = require('jsdom'));
}

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  \x1b[32mPASS\x1b[0m  ' + label);
  } else {
    fail++;
    console.log('  \x1b[31mFAIL\x1b[0m  ' + label);
  }
}
function section(t) {
  console.log('\n\x1b[1m' + t + '\x1b[0m');
}

const CG_USER = {
  __dangerousUserId: 'FORGEABLE-DO-NOT-TRUST',
  username: 'LegendFan42',
  profilePictureUrl: 'https://images.crazygames.com/a/7.png',
};
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.signed.by-crazygames';

/* -------------------------------------------------------------
   A portal boot with everything swappable, so each scenario is a
   one-liner rather than a copy of the harness.
   ------------------------------------------------------------- */
function boot(opts) {
  const o = Object.assign(
    { loggedIn: true, fnStatus: 200, hasUserModule: true, hasSupabase: true },
    opts || {}
  );

  const dom = new JSDOM(read('index.html'), {
    url: 'https://games.crazygames.com/index.html?platform=crazygames',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;

  const state = { tokenAsked: 0, anonCalls: 0, posts: [], promptShown: 0 };

  const userModule = o.hasUserModule
    ? {
        isUserAccountAvailable: true,
        getUser: () => Promise.resolve(o.loggedIn ? CG_USER : null),
        getUserToken: () => {
          state.tokenAsked++;
          return Promise.resolve(TOKEN);
        },
        showAuthPrompt: () => {
          state.promptShown++;
          return Promise.resolve(CG_USER);
        },
        addAuthListener(fn) {
          state.authListener = fn;
        },
        removeAuthListener() {},
      }
    : undefined;

  w.CrazyGames = {
    SDK: {
      init: () => Promise.resolve(),
      game: {
        loadingStart() {},
        loadingStop() {},
        gameplayStart() {},
        gameplayStop() {},
        addSettingsChangeListener() {},
        getSettings: () => ({ muted: false }),
      },
      data: {
        getItem: () => null,
        setItem() {},
        removeItem() {},
        clear() {},
      },
      user: userModule,
    },
  };

  w.fetch = (url, init) => {
    state.posts.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    if (o.fnStatus !== 200) {
      return Promise.resolve({
        ok: false,
        status: o.fnStatus,
        text: () => Promise.resolve('error'),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          email: 'cg_FORGEABLE-DO-NOT-TRUST@crazygames.invalid',
          password: 'derived-from-service-role-key',
          username: CG_USER.username,
          avatar_url: CG_USER.profilePictureUrl,
        }),
    });
  };

  let session = null;
  const listeners = [];
  if (o.hasSupabase) {
    w.supabase = {
      createClient: () => ({
        auth: {
          getSession: () => Promise.resolve({ data: { session } }),
          onAuthStateChange: (fn) => {
            listeners.push(fn);
            return { data: { subscription: { unsubscribe() {} } } };
          },
          signInAnonymously: () => {
            state.anonCalls++;
            session = {
              user: {
                id: 'anon-per-browser',
                is_anonymous: true,
                identities: [],
                user_metadata: {},
              },
            };
            listeners.forEach((f) => f('SIGNED_IN', session));
            return Promise.resolve({ data: { session }, error: null });
          },
          signInWithPassword: () => {
            session = {
              user: {
                id: 'durable-cg-account',
                email: 'cg_FORGEABLE-DO-NOT-TRUST@crazygames.invalid',
                is_anonymous: false,
                identities: [{ provider: 'email' }],
                user_metadata: {
                  full_name: CG_USER.username,
                  avatar_url: CG_USER.profilePictureUrl,
                  cg_user_id: 'FORGEABLE-DO-NOT-TRUST',
                },
              },
              access_token: 'real.session.jwt',
            };
            listeners.forEach((f) => f('SIGNED_IN', session));
            return Promise.resolve({ data: { session }, error: null });
          },
          signOut: () => Promise.resolve({ error: null }),
        },
        from: () => ({
          upsert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { handle: CG_USER.username }, error: null }),
            }),
          }),
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
        rpc: () => Promise.resolve({ data: null, error: null }),
        channel: () => ({ subscribe() {}, unsubscribe() {} }),
      }),
    };
  }

  [
    'js/platform.js',
    'js/supabase-config.js',
    'js/auth.js',
    'js/mp.js',
    'js/crazygames-sdk.js',
  ].forEach((f) => {
    try {
      w.eval(read(f));
    } catch (e) {
      /* a module that needs DOM we do not have must not abort the run */
    }
  });

  w.EOL.auth.init();
  return { w, state };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ===========================================================
     A. the security boundary
     =========================================================== */
  section('A. only the signed token is trusted');
  {
    const { w, state } = boot({ loggedIn: true });
    await wait(700);

    ok(state.posts.length === 1, 'the token is exchanged exactly once');
    const post = state.posts[0] || { url: '', body: {} };
    ok(/\/functions\/v1\/cg-auth$/.test(post.url), 'it is sent to our own cg-auth function');
    ok(post.body.token === TOKEN, 'the SIGNED token is what gets sent');
    ok(
      JSON.stringify(post.body).indexOf('FORGEABLE') < 0,
      'the forgeable __dangerousUserId is NEVER sent'
    );
    ok(state.tokenAsked === 1, 'getUserToken() is called once per login, not polled');

    const bridge = read('js/crazygames-sdk.js')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const auth = read('js/auth.js')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    ok(!/__dangerousUserId/.test(bridge), 'the bridge never reads the dangerous id');
    ok(!/__dangerousUserId/.test(auth), 'auth.js never reads the dangerous id');
    /* auth.js DOES call atob() once - in keyLooksSecret(), which
       decodes the SUPABASE ANON KEY to catch a service-role key
       pasted into browser code. That is a safety guard, not token
       handling, so match the token specifically rather than banning
       the function outright. */
    ok(
      !/atob\s*\([^)]*token|jwtDecode|from\s+['"][^'"]*jose/.test(bridge + auth),
      'the CrazyGames token is never decoded client-side'
    );
    ok(
      /keyLooksSecret/.test(auth),
      "and the anon key is still screened for a service-role key (that's what atob is for)"
    );
    ok(
      !/(local|session)Storage[\s\S]{0,60}token/i.test(bridge + auth),
      'the token is never stored'
    );
  }

  /* ===========================================================
     B. the happy path
     =========================================================== */
  section('B. a CrazyGames login buys a real account');
  {
    const { w, state } = boot({ loggedIn: true });
    await wait(700);
    const A = w.EOL.auth;
    const u = A.user();

    ok(!!u, 'the player has an identity');
    ok(u.name === CG_USER.username, 'it carries the CrazyGames username');
    ok(u.avatar === CG_USER.profilePictureUrl, 'and their avatar');
    ok(A.isAnonymous() === false, 'the session is NOT anonymous');
    ok(A.isPortalAccount() === true, 'isPortalAccount() reports a portal-backed account');
    ok(u.portalAccount === true, 'publicUser() exposes portalAccount for callers');
    ok(u.id === 'durable-cg-account', 'the uid is durable, not a per-browser anon id');
    ok(state.anonCalls === 0, 'no anonymous row was created for an account holder');

    ok(w.EOL.mp.available() === true, 'MULTIPLAYER IS AVAILABLE');
    ok(w.EOL.platform.canPlayOnline === true, 'the portal build allows online play');
    ok(
      w.EOL.platform.canEditIdentity === false,
      'identity editing STAYS locked (CG owns the name)'
    );
    ok(w.EOL.platform.cloudVault === false, 'progress still belongs to the Data module');
  }

  /* ===========================================================
     C. degrading
     =========================================================== */
  section('C. every failure degrades to a working guest');
  {
    const guest = boot({ loggedIn: false });
    await wait(700);
    ok(guest.state.anonCalls === 1, 'a guest still gets the anonymous session');
    ok(guest.w.EOL.auth.isAnonymous() === true, 'and it is anonymous');
    ok(guest.state.posts.length === 0, 'no token exchange is attempted for a guest');
    ok(guest.w.EOL.mp.available() === false, 'multiplayer stays locked for a guest');
    ok(
      guest.w.EOL.crazygames.canPromptLogin() === true,
      'the CrazyGames login popup is offered to them'
    );

    const down = boot({ loggedIn: true, fnStatus: 500 });
    await wait(900);
    ok(down.state.anonCalls === 1, 'an undeployed/broken function falls back to anonymous');
    ok(down.w.EOL.mp.available() === false, 'multiplayer locks rather than half-working');
    ok(!!down.w.EOL.auth.user(), 'the player still has a usable session');

    const embedded = boot({ loggedIn: false, hasUserModule: false });
    await wait(700);
    ok(embedded.state.anonCalls === 1, 'off-portal embeds fall back immediately');
    ok(
      embedded.w.EOL.crazygames.canPromptLogin() === false,
      'no login popup where the module does not exist'
    );

    const offline = boot({ loggedIn: true, hasSupabase: false });
    await wait(700);
    ok(!offline.w.EOL.auth.isReady(), 'no Supabase SDK: auth simply is not ready');
    ok(offline.w.EOL.mp.available() === false, 'and multiplayer is off, not broken');
  }

  /* ===========================================================
     D. the boot race
     =========================================================== */
  section('D. the SDK and the anonymous fallback do not race');
  {
    /* The SDK resolves asynchronously; auth.init() runs immediately.
       Without the gate the anonymous sign-in always won and the
       player was stranded on a throwaway identity. */
    const auth = read('js/auth.js');
    ok(/portalGate/.test(auth), 'a boot gate exists');
    ok(
      /portalGateTimer[\s\S]{0,400}setTimeout/.test(auth),
      'it has a timeout so a silent SDK cannot strand the Daily Puzzle'
    );
    const bridge = read('js/crazygames-sdk.js');
    ok(
      (bridge.match(/portalIsGuest/g) || []).length >= 3,
      'every guest path releases the gate (no module, getUser fails, null user)'
    );

    const { state } = boot({ loggedIn: true });
    await wait(120);
    ok(state.anonCalls === 0, 'the fallback has NOT fired while the exchange is in flight');
    await wait(700);
    ok(state.anonCalls === 0, 'and never fires once the account lands');
  }

  /* ===========================================================
     E. the Edge Function's guarantees
     =========================================================== */
  section('E. the server verifies what the client cannot');
  {
    const fnRaw = read('supabase/functions/cg-auth/index.ts');
    /* Strip comments: the header EXPLAINS why the dangerous id is not
       trusted, and a warning about a thing must not read as use of it. */
    const fn = fnRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(/sdk\.crazygames\.com\/publicKey\.json/.test(fn), 'it fetches CrazyGames public key');
    ok(/jwtVerify/.test(fn), 'it verifies the signature');
    ok(/algorithms:\s*\['RS256'\]/.test(fn), 'RS256 is PINNED (blocks alg:none / HS256 forgery)');
    ok(
      /crazyGamesKey\(true\)/.test(fn),
      'a rotated key is re-fetched once before rejecting the token'
    );
    ok(!/__dangerousUserId/.test(fn), 'the function never reads the dangerous id');
    ok(
      /payload\.userId/.test(fn) && /payload\.username/.test(fn),
      'identity comes from the VERIFIED payload, not the request body'
    );
    ok(!/console\.log\([^)]*token/.test(fn), 'the token is never logged');
    ok(/SUPABASE_SERVICE_ROLE_KEY/.test(fn), 'it uses the service role key server-side only');

    /* The client must never CARRY a service-role key. It does mention
       the string 'sb_secret_' - inside keyLooksSecret(), the guard that
       refuses to boot if one was pasted into supabase-config.js - so
       look for an actual assignment, not the word. */
    const client =
      read('js/auth.js') + read('js/crazygames-sdk.js') + read('js/supabase-config.js');
    ok(
      !/(sb_secret_[A-Za-z0-9_-]{8,})|service_role['"]?\s*:/.test(client),
      'no service-role key value anywhere in the client'
    );
    ok(
      /keyLooksSecret/.test(read('js/auth.js')),
      'and the client actively refuses to start if one is pasted in'
    );

    const sql = read('docs/supabase-migration-09.sql');
    ok(/create table if not exists public\.cg_link/.test(sql), 'the link table exists');
    ok(/enable row level security/.test(sql), 'RLS is on for it');
    ok(
      !/cg_link[\s\S]{0,400}for insert/.test(sql),
      'the browser has NO insert policy - it cannot claim a CrazyGames id'
    );
    ok(
      /coalesce\(my_name, 'Player'\)/.test(sql) && /cg_link l where l\.user_id = me/.test(sql),
      'try_match falls back to the CrazyGames username, so opponents are not all "Player"'
    );
  }

  console.log('\n================================================================');
  if (fail) {
    console.log('\x1b[31m' + fail + ' FAILED\x1b[0m, ' + pass + ' passed');
  } else {
    console.log('\x1b[32mALL ' + pass + ' ASSERTIONS PASSED\x1b[0m');
  }
  console.log('================================================================');
  process.exit(fail ? 1 : 0);
})();
