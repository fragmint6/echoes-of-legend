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
    /* A WORKING set_handle/handle_status, mirroring migration 14.
       The old stub returned null for every RPC, which meant a rename
       silently did nothing and the rows below never changed - the
       assertions would have passed against a completely broken
       client. The cooldown is modelled with world.now so a test can
       jump forward in time without sleeping. */
    rpc: (name, args) => {
      const me = session && session.user && session.user.id;
      const COOLDOWN = 7 * 24 * 3600 * 1000;
      const now = () => world.now || Date.now();
      if (name === 'handle_status') {
        const row = me && world.table[me];
        if (!row) return Promise.resolve({ data: null, error: null });
        const at = row.handle_changed_at ? new Date(row.handle_changed_at).getTime() : null;
        return Promise.resolve({
          data: [
            {
              handle: row.handle,
              changed_at: row.handle_changed_at || null,
              next_allowed_at: at === null ? null : new Date(at + COOLDOWN).toISOString(),
              can_change: at === null || now() >= at + COOLDOWN,
            },
          ],
          error: null,
        });
      }
      if (name === 'set_handle') {
        const want = String((args && args.p_handle) || '').trim();
        const row = me && world.table[me];
        if (!me) return Promise.resolve({ data: null, error: { message: 'Sign in first.' } });
        if (!row) return Promise.resolve({ data: null, error: { message: 'No profile to rename.' } });
        if (want.length < 3 || want.length > 24 || !/^[A-Za-z0-9._-]+$/.test(want)) {
          return Promise.resolve({ data: null, error: { message: 'Only letters, numbers, and . _ - are allowed.' } });
        }
        /* re-saving your own name is a no-op, not a rename */
        if (want === row.handle) return Promise.resolve({ data: [Object.assign({}, row)], error: null });
        const at = row.handle_changed_at ? new Date(row.handle_changed_at).getTime() : null;
        if (at !== null && now() < at + COOLDOWN) {
          return Promise.resolve({
            data: null,
            error: { message: 'You can change your username again on Jan 01, 2000 at 00:00 UTC.' },
          });
        }
        const taken = Object.keys(world.table).some(
          (k) => k !== me && String(world.table[k].handle || '').toLowerCase() === want.toLowerCase()
        );
        if (taken) {
          return Promise.resolve({ data: null, error: { message: 'That username is taken.' } });
        }
        world.log.push('rpc set_handle ' + want);
        row.handle = want;
        row.handle_changed_at = new Date(now()).toISOString();
        return Promise.resolve({ data: [Object.assign({}, row)], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
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
    'generateHandle is exported so the minted-name shape can be tested'
  );

  /* THE ROLL BUTTON IS GONE (2026-08-15).
     A random callsign is assigned exactly once, when the profile row
     is created. Letting the player spin for one made the name a slot
     machine and made a once-a-week rename rule meaningless. */
  ok(!/set-reroll/.test(htmlSrc), 'Settings has no Roll button');
  ok(!/ri-dice/.test(htmlSrc), 'and no dice icon left behind');
  ok(!/set-reroll/.test(appSrc), 'no Roll handler is wired up');
  ok(!/set-reroll/.test(cssSrc), 'and its styling is gone too');
  ok(
    (appSrc.match(/generateHandle/g) || []).length === 0,
    'the UI never calls the generator - minting is auth.js at row creation only'
  );
  {
    /* Called once per account, from ensureProfile()/claimHandle(), and
       nowhere else. */
    const calls = (authSrc.match(/(?<!function )generateHandle\(\)/g) || []).length;
    ok(
      calls === 3,
      'generateHandle() is called on the mint path only - 2 in ensureProfile, ' +
        '1 on the claimHandle collision retry (found ' + calls + ')'
    );
  }
  ok(/\.set-name-row\s*\{[^}]*display:\s*flex/.test(cssSrc), 'the username row still lays out');
  ok(
    /\.set-name-row input\s*\{[^}]*min-width:\s*0/.test(cssSrc),
    'the input can shrink rather than overflowing the panel'
  );

  /* ===========================================================
     6. ONE RENAME PER WEEK - BEHAVIOUR, NOT JUST WIRING
     ===========================================================
     Exercised against the mock implementation of migration 14's
     set_handle(), which enforces the same rules the SQL does. */
  console.log('\n-- one change per week --');
  {
    const DAY = 24 * 3600 * 1000;
    const world = makeWorld();
    world.now = Date.UTC(2026, 0, 1);
    const A = boot(world, { full_name: 'John Smith', name: 'John Smith' });
    A.init();
    await settle();
    const minted = world.table['uid-1'].handle;

    ok(
      world.table['uid-1'].handle_changed_at == null,
      'a freshly minted name carries no cooldown - the mint is not a change'
    );
    let st = await A.handleStatus();
    ok(st.canChange === true, 'so a brand-new account may rename immediately');

    /* first change: allowed */
    await A.setHandle('FirstPick');
    await settle();
    ok(world.table['uid-1'].handle === 'FirstPick', 'the first rename goes through');
    ok(!!world.table['uid-1'].handle_changed_at, 'and stamps when it happened');

    /* second change, same day: refused */
    let err = null;
    await A.setHandle('SecondPick').catch((e) => (err = e));
    ok(!!err, 'a second rename the same day is refused');
    ok(
      /change your username again/i.test((err && err.message) || ''),
      'and the refusal names when it will be allowed -> ' + (err && err.message)
    );
    ok(world.table['uid-1'].handle === 'FirstPick', 'the name is unchanged by the refusal');

    /* still refused most of the way through the week */
    world.now += 6 * DAY;
    st = await A.handleStatus();
    ok(st.canChange === false, 'still locked after 6 days');
    err = null;
    await A.setHandle('SixDays').catch((e) => (err = e));
    ok(!!err && world.table['uid-1'].handle === 'FirstPick', 'and the write is still refused');

    /* after 7 days: allowed again */
    world.now += 1 * DAY + 1000;
    st = await A.handleStatus();
    ok(st.canChange === true, 'after 7 days the change unlocks');
    await A.setHandle('SecondPick');
    await settle();
    ok(world.table['uid-1'].handle === 'SecondPick', 'and the next rename goes through');

    /* re-saving the SAME name must not burn the weekly change */
    await A.setHandle('SecondPick');
    await settle();
    st = await A.handleStatus();
    const stampBefore = world.table['uid-1'].handle_changed_at;
    world.now += 1000;
    await A.setHandle('SecondPick');
    ok(
      world.table['uid-1'].handle_changed_at === stampBefore,
      'saving the name you already have is a no-op, not a rename'
    );
  }

  /* the taken-name path still reports honestly */
  {
    const world = makeWorld();
    world.now = Date.UTC(2026, 0, 1);
    world.table['uid-2'] = { id: 'uid-2', handle: 'Taken99' };
    const A = boot(world, { full_name: 'X', name: 'X' });
    A.init();
    await settle();
    let err = null;
    await A.setHandle('taken99').catch((e) => (err = e));
    ok(
      !!err && /taken/i.test(err.message),
      'a name somebody else holds is refused case-insensitively'
    );
  }

  /* ===========================================================
     7. THE LIMIT IS ENFORCED BY THE SERVER, NOT THE BROWSER
     =========================================================== */
  console.log('\n-- the rule lives in the database --');
  {
    const sql = fs.readFileSync(path.join(ROOT, 'docs/supabase-migration-14.sql'), 'utf8');
    const bare = sql.replace(/--[^\n]*/g, '');
    ok(/create or replace function public\.set_handle/.test(bare), 'migration 14 defines set_handle()');
    ok(/security definer/.test(bare), 'it is security definer, so it can write a pinned column');
    ok(
      /handle_changed_at\s*\+\s*public\.handle_cooldown\(\)/.test(bare),
      'the cooldown is applied against handle_changed_at'
    );
    ok(/interval '7 days'/.test(bare), 'and the cooldown is 7 days');
    ok(
      /add column if not exists handle_changed_at/.test(bare),
      'the stamp column is added idempotently'
    );
    ok(
      /create unique index if not exists profiles_handle_lower_idx/.test(bare),
      'a unique index makes "that username is taken" true rather than aspirational'
    );
    /* The whole point: the client may no longer write the column.
       This is done with a BEFORE UPDATE trigger, NOT a policy
       with-check that sub-selects profiles - see below. */
    const trg = (bare.match(/create or replace function public\.profiles_pin_handle[\s\S]*?\$\$;/) || [''])[0];
    ok(trg !== '', 'a pin trigger function exists');
    ok(
      /new\.handle\s*:=\s*old\.handle/.test(trg),
      'it forces handle back to its old value on any ordinary UPDATE'
    );
    ok(
      /new\.handle_changed_at\s*:=\s*old\.handle_changed_at/.test(trg),
      'and pins the stamp, so the cooldown cannot be cleared by hand'
    );
    ok(
      /current_setting\('app\.handle_write', true\)/.test(trg),
      'set_handle() gets through via a transaction-local flag'
    );
    ok(
      /set_config\('app\.handle_write', 'on', true\)/.test(bare),
      'and the flag is set LOCAL (true), so it cannot leak across pooled requests'
    );
    ok(
      /create trigger profiles_pin_handle_trg[\s\S]{0,120}before update on public\.profiles/.test(bare),
      'the trigger is wired to before update on profiles'
    );
    ok(
      /drop trigger if exists profiles_pin_handle_trg/.test(bare),
      'the trigger is dropped first, so the file re-runs cleanly'
    );
    ok(
      /drop policy if exists "own profile update"/.test(bare),
      'the old policy is dropped before being recreated'
    );

    /* 42P17 GUARD. A policy ON profiles that SELECTs profiles
       recurses and takes the whole table down for every user, which
       is far worse than the bug being fixed. The rule must never be
       expressed that way. */
    const pol = (bare.match(/create policy "own profile update"[\s\S]*?;/) || [''])[0];
    ok(pol !== '', 'the update policy is redefined');
    ok(
      !/select[\s\S]*?from\s+(public\.)?profiles/i.test(pol),
      'the policy does NOT sub-select profiles - that is 42P17 infinite recursion'
    );
    ok(
      /with check \(auth\.uid\(\) = id\)/.test(pol),
      'it stays a simple ownership check'
    );

    /* The client must go through the RPC. */
    ok(
      /\.rpc\('set_handle'/.test(authSrc),
      'js/auth.js renames through the RPC'
    );
    const fn = authSrc.slice(authSrc.indexOf('function setHandle'), authSrc.indexOf('function rpcMessage'));
    ok(
      !/from\('profiles'\)/.test(fn),
      'setHandle() no longer writes the profiles table directly'
    );
  }

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
