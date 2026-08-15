/* =============================================================
   AUTO-MINTED CALLSIGNS, AND THE NAME THAT WOULD NOT SAVE
   node sim/verify_callsign.js
   -------------------------------------------------------------
   The report was "sign up with Google, choose a username, it
   doesn't save". The write was never the problem - setHandle()
   stored the name correctly and the UI showed it. The damage came
   afterwards, from ensureProfile():

       handle: meta.full_name || meta.name || email.split('@')[0]

   which ran on EVERY session load and upserted it. So the next
   sign-in stamped the Google display name back over the chosen
   callsign. Save, works, come back tomorrow, reverted - with no
   error anywhere, because nothing failed.

   The fix has two halves, and both are asserted here:

     1. ensureProfile READS BEFORE IT WRITES. If the row already has
        a handle, it is left alone; only setHandle() may change it.
     2. Nobody is asked for a name at the door. A fresh account is
        minted one - two adjectives plus three digits - and Settings
        is where it gets changed.

   The end-to-end tests drive the REAL js/auth.js against a fake
   Supabase whose `profiles` table persists across sessions, which
   is the only way the original bug is visible: it needs a second
   sign-in to appear.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};

const authSrc = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

/* -------------------------------------------------------------
   A fake Supabase that behaves like the real one in the ways that
   matter: `profiles` is a TABLE that outlives the session, select
   returns what was stored, and upsert overwrites.
   ------------------------------------------------------------- */
function makeWorld() {
  const table = Object.create(null);
  const log = [];
  return { table, log };
}

function boot(world, metaStore, opts) {
  opts = opts || {};
  const listeners = [];
  const uid = opts.uid || 'uid-1';
  const mkSession = () => ({
    user: {
      id: uid,
      email: opts.email || 'john@gmail.com',
      is_anonymous: !!opts.anonymous,
      identities: opts.anonymous ? [] : [{ provider: 'google' }],
      user_metadata: JSON.parse(JSON.stringify(metaStore)),
    },
    access_token: 'jwt',
  });
  let session = opts.noSession ? null : mkSession();

  let collisionsLeft = opts.collisions || 0;

  function from(tableName) {
    const st = { id: null, pending: null };
    const api = {
      select: () => api,
      eq: (col, val) => {
        st.id = val;
        return api;
      },
      maybeSingle: () => {
        world.log.push('select ' + tableName);
        const row = world.table[st.id];
        return Promise.resolve({ data: row ? Object.assign({}, row) : null, error: null });
      },
      upsert: (row) => {
        world.log.push('upsert ' + tableName + ' handle=' + row.handle);
        if (collisionsLeft > 0) {
          collisionsLeft--;
          return {
            select: () => ({
              single: () => Promise.resolve({ data: null, error: { code: '23505' } }),
            }),
          };
        }
        st.id = row.id;
        st.pending = row;
        return api;
      },
      update: (row) => {
        world.log.push('update ' + tableName + ' ' + JSON.stringify(row));
        st.pending = row;
        return api;
      },
      single: () => {
        if (st.pending) {
          world.table[st.id] = Object.assign({}, world.table[st.id], st.pending);
        }
        const row = world.table[st.id];
        return Promise.resolve({ data: row ? Object.assign({}, row) : null, error: null });
      },
    };
    return api;
  }

  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      onAuthStateChange: (f) => {
        listeners.push(f);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      updateUser: (o) => {
        Object.assign(metaStore, o.data || {});
        session = mkSession();
        return Promise.resolve({ data: { user: session.user }, error: null });
      },
      signInAnonymously: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from,
    channel: () => ({ subscribe() {}, unsubscribe() {} }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  const win = {
    EOL: {
      platform: {
        anonymousAuth: !!opts.anonymousAuth,
        canEditIdentity: opts.canEditIdentity !== false,
      },
      supabaseConfig: { url: 'https://x.supabase.co', anonKey: 'anon-publishable-key' },
    },
    supabase: { createClient: () => client },
    location: { search: '', hash: '', pathname: '/', href: 'http://x/' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    crypto: require('crypto').webcrypto,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    open: () => null,
    name: '',
  };
  win.window = win;
  win.document = {
    body: { dataset: {} },
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    documentElement: { dataset: {} },
  };
  vm.runInContext(authSrc, vm.createContext(win), { filename: 'auth.js' });
  return win.EOL.auth;
}

const settle = () => new Promise((r) => setTimeout(r, 60));

(async () => {
  /* ===========================================================
     1. THE SHAPE OF A MINTED NAME
     =========================================================== */
  console.log('\n-- the minted callsign --');
  {
    const world = makeWorld();
    const A = boot(world, { full_name: 'John Smith' });
    const names = [];
    for (let i = 0; i < 400; i++) names.push(A.generateHandle());

    ok(
      names.every((n) => /^[A-Z][a-z]+[A-Z][a-z]+[0-9]{3}$/.test(n)),
      'every name is two capitalised adjectives followed by three digits'
    );
    ok(
      names.every((n) => !A.validateHandle(n)),
      'every generated name passes the validator that guards the form'
    );
    ok(
      names.every((n) => n.length <= 24),
      'the longest pairing still fits the 24-character ceiling (got ' +
        Math.max.apply(null, names.map((n) => n.length)) +
        ')'
    );
    ok(
      names.every((n) => /[0-9]{3}$/.test(n) && !/[0-9]{4}/.test(n)),
      'exactly three digits - 100-999, never a leading zero or a fourth'
    );
    ok(new Set(names).size > 300, 'names vary: ' + new Set(names).size + ' distinct out of 400');
    ok(
      !names.some((n) => /John|Smith|gmail|@/.test(n)),
      'a minted name never leaks the real name or email it replaced'
    );
  }

  /* ===========================================================
     2. THE ORIGINAL BUG: A CHOSEN NAME MUST SURVIVE A RE-LOGIN
     =========================================================== */
  console.log('\n-- the name that would not save --');
  {
    const world = makeWorld();

    /* Visit 1: fresh Google sign-up. */
    let A = boot(world, {
      full_name: 'John Smith',
      name: 'John Smith',
      avatar_url: 'http://g/pic',
    });
    A.init();
    await settle();
    const minted = world.table['uid-1'] && world.table['uid-1'].handle;

    ok(!!minted, 'signing up with Google creates the profiles row unprompted');
    ok(
      /^[A-Z][a-z]+[A-Z][a-z]+[0-9]{3}$/.test(minted || ''),
      'the row is seeded with a minted callsign (' + minted + ')'
    );
    ok(minted !== 'John Smith', 'the row is NOT seeded with the Google display name');
    ok(A.user().name === minted, 'the account button shows the minted callsign immediately');
    ok(A.needsHandle() === false, 'no callsign prompt is raised - nobody is asked to invent one');

    /* The player renames in Settings. */
    await A.setHandle('Scribe_77');
    await settle();
    ok(world.table['uid-1'].handle === 'Scribe_77', 'Settings can rename the callsign');

    /* Visit 2: signs in with Google again. Supabase re-applies the
       provider claims, so user_metadata.full_name is the Google name
       once more. THIS is the visit that used to destroy the name. */
    A = boot(world, {
      full_name: 'John Smith',
      name: 'John Smith',
      avatar_url: 'http://g/pic',
      handle_chosen: true,
    });
    A.init();
    await settle();

    ok(
      world.table['uid-1'].handle === 'Scribe_77',
      'signing in with Google AGAIN does not overwrite the chosen name'
    );
    ok(A.user().name === 'Scribe_77', 'and the UI still shows the chosen name, not "John Smith"');

    /* A third visit, to be sure it is stable rather than merely lucky. */
    A = boot(world, { full_name: 'John Smith', handle_chosen: true });
    A.init();
    await settle();
    ok(world.table['uid-1'].handle === 'Scribe_77', 'still intact after a third sign-in');
  }

  /* ===========================================================
     3. ensureProfile MUST READ BEFORE IT WRITES
     =========================================================== */
  console.log('\n-- read before write --');
  {
    const world = makeWorld();
    world.table['uid-1'] = { id: 'uid-1', handle: 'Scribe_77', avatar_url: 'http://g/pic' };
    const A = boot(world, { full_name: 'John Smith', avatar_url: 'http://g/pic' });
    A.init();
    await settle();

    const wroteHandle = world.log.filter((l) => l.indexOf('upsert') === 0);
    ok(wroteHandle.length === 0, 'an existing row triggers no handle upsert at all');
    ok(
      world.log.some((l) => l.indexOf('select profiles') === 0),
      'the row is read first to find out whether a name already exists'
    );
  }
  {
    /* The avatar is not player-owned, so it should still follow the
       provider even though the handle does not. */
    const world = makeWorld();
    world.table['uid-1'] = { id: 'uid-1', handle: 'Scribe_77', avatar_url: 'http://old/pic' };
    const A = boot(world, { full_name: 'John Smith', avatar_url: 'http://new/pic' });
    A.init();
    await settle();
    ok(
      world.table['uid-1'].avatar_url === 'http://new/pic',
      'a changed Google avatar still updates'
    );
    ok(world.table['uid-1'].handle === 'Scribe_77', 'and updating the avatar leaves the name alone');
  }

  /* ===========================================================
     4. COLLISIONS, PORTAL, AND ANONYMOUS
     =========================================================== */
  console.log('\n-- edges --');
  {
    const world = makeWorld();
    const A = boot(world, { full_name: 'John Smith' }, { collisions: 1 });
    A.init();
    await settle();
    ok(
      !!(world.table['uid-1'] && world.table['uid-1'].handle),
      'a name collision (23505) is retried with a fresh name rather than failing'
    );
  }
  {
    /* CrazyGames builds are REQUIRED to display the portal username,
       and cg-auth has already written it. Minting over it would break
       that requirement. */
    const world = makeWorld();
    const A = boot(world, {
      full_name: 'CrazyPlayer',
      cg_user_id: 'cg-1',
    });
    A.init();
    await settle();
    ok(
      world.table['uid-1'].handle === 'CrazyPlayer',
      'a CrazyGames account keeps its portal username instead of being minted one'
    );
  }
  {
    const world = makeWorld();
    const A = boot(world, {}, { anonymous: true });
    A.init();
    await settle();
    ok(
      !world.table['uid-1'],
      'an anonymous Daily-Puzzle session still writes no profiles row at all'
    );
  }

  /* ===========================================================
     5. THE PROMPT IS RETIRED; SETTINGS OWNS RENAMING
     =========================================================== */
  console.log('\n-- where a name gets changed --');
  ok(
    /function needsHandle\(\)[\s\S]{0,600}?return false;\s*\}/.test(authSrc),
    'needsHandle() is hard-wired false, so the sign-up prompt never fires'
  );
  ok(
    /generateHandle: generateHandle/.test(authSrc),
    'generateHandle is exported for the settings re-roll'
  );
  ok(
    /id="set-reroll"/.test(htmlSrc),
    'Settings offers a Roll button so a minted name can be re-rolled'
  );
  ok(
    /set-reroll[\s\S]{0,400}generateHandle\(\)/.test(appSrc),
    'the Roll button fills the field from the same generator'
  );
  ok(
    /set-reroll[\s\S]{0,400}Press Save/.test(appSrc),
    'rolling does not save by itself - the player still confirms'
  );
  ok(/\.set-name-row\s*\{[^}]*display:\s*flex/.test(cssSrc), 'the field and Roll sit on one row');
  ok(
    /\.set-name-row input\s*\{[^}]*min-width:\s*0/.test(cssSrc),
    'the input can shrink, so Roll is never pushed out of the panel'
  );

  /* The clobbering line must not come back. */
  ok(
    !/handle:\s*meta\.full_name\s*\|\|\s*meta\.name\s*\|\|\s*\(u\.email/.test(authSrc),
    'the unconditional "handle: meta.full_name || ..." upsert is gone for good'
  );

  console.log('\n----------------------------------------------');
  console.log('  pass ' + pass + '  fail ' + fail);
  console.log('----------------------------------------------');
  process.exit(fail ? 1 : 0);
})();
