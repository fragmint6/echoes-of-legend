/* =============================================================
   SAVE OWNERSHIP REGRESSION
   node sim/verify_save_ownership.js
   -------------------------------------------------------------
   THE ACCOUNT IS THE SAVE. This drives js/cloud.js against a fake
   Supabase and asserts the three transitions that move real player
   progress around - the places where a bug silently destroys
   somebody's collection:

     A. what counts as "progress worth protecting"
     B. signing IN
          - new account            -> device save is adopted
          - returning, empty device-> account save is restored
          - returning, real device -> the player is ASKED
     C. signing OUT
          - flush, then wipe, then reboot to a true first run
          - a FAILED flush must abort the wipe

   Everything runs in jsdom against the real module, not a copy.
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
const cloudSrc = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A save that looks like somebody actually played. */
function playedSave(o) {
  o = o || {};
  return {
    'eol.wallet.v1': String(o.coins == null ? 1200 : o.coins),
    'eol.owned.v1': JSON.stringify(o.owned || ['a', 'b', 'c', 'd', 'e', 'f', 'g']),
    'eol.campaign.ch1.progress': JSON.stringify({
      v: 3,
      runs: { normal: { cleared: o.gates || [1, 2, 3], unlocked: [1, 2, 3, 4] } },
      fought: [1, 2, 3],
    }),
    'eol.decks.v1': JSON.stringify([{ id: 'starter-grimmwood', ids: [] }].concat(o.decks || [])),
  };
}
/* A browser that has booted but never earned anything: the seeded
   starter deck and the tutorial flags, nothing else. */
function freshSave() {
  return {
    'eol.decks.v1': JSON.stringify([{ id: 'starter-grimmwood', ids: [1, 2, 3] }]),
    'eol.tutorial.intro.v1': '1',
    'eol.gfx': 'high',
    'eol.wallet.v1': '0',
    'eol.owned.v1': JSON.stringify(['s1', 's2', 's3']),
  };
}

/* ---------------------------------------------------------------
   Boot js/cloud.js with a fake auth + fake `saves` table.
   --------------------------------------------------------------- */
/* Postgres jsonb normalization: object keys come back ordered by
   length and then bytewise, never in insertion order. Arrays and
   scalars are untouched. Modelling this is what makes the fake table
   honest about round trips. */
function jsonb(v) {
  if (Array.isArray(v)) return v.map(jsonb);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v)
      .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
      .forEach((k) => {
        out[k] = jsonb(v[k]);
      });
    return out;
  }
  return v;
}

function makeWorld(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://fragmint6.web.app/',
    runScripts: 'dangerously',
  });
  const w = dom.window;

  Object.keys(opts.local || {}).forEach((k) => w.localStorage.setItem(k, opts.local[k]));

  const state = {
    row: opts.cloud ? { data: jsonb(opts.cloud) } : null,
    upserts: 0,
    /* replaced below by a getter reading the restore marker */
    failUpsert: !!opts.failUpsert,
    signedOut: 0,
    conflictAsked: 0,
    lastSummaries: null,
  };

  /* jsdom's window.location.reload is non-configurable AND unimplemented
     (it logs "Not implemented: navigation"). Counting reloads through the
     sessionStorage marker cloud.js writes immediately before calling it
     is both possible and closer to what actually matters: did the module
     commit to rebooting into the restored save? */
  Object.defineProperty(state, 'reloaded', {
    get: () => (w.sessionStorage.getItem('eol.cloud.restored') === '1' ? 1 : 0),
  });

  const table = {
    upsert(rowIn) {
      return Promise.resolve().then(() => {
        if (state.failUpsert) return { error: { message: 'offline' } };
        state.upserts++;
        /* Store it the way Postgres actually would. `saves.data` is
           jsonb, which does NOT keep the key order it was handed - it
           reorders by key length, then bytewise. An earlier version of
           this harness echoed the object back untouched, so every test
           here passed while signed-in players were shown the override
           prompt on every boot. A fake that is kinder than the database
           is not a test. */
        state.row = { data: jsonb(rowIn.data) };
        return { error: null };
      });
    },
    select() {
      return {
        eq() {
          return {
            maybeSingle: () =>
              Promise.resolve({ data: state.row ? { data: state.row.data } : null, error: null }),
          };
        },
      };
    },
  };

  let authCb = null;
  w.EOL = {
    auth: {
      configured: () => true,
      rawClient: () => ({ from: () => table }),
      onChange(fn) {
        authCb = fn;
      },
      signOut() {
        state.signedOut++;
        if (authCb) authCb(null);
        return Promise.resolve();
      },
    },
    /* The module is EOL.econ. This fixture said EOL.economy, which
       matched a typo in js/cloud.js and so agreed with the bug: the
       starter cards counted as earned progress and a fresh device was
       prompted about a save it did not have. */
    econ: { starterIds: () => ['s1', 's2', 's3'] },
  };

  /* A real <script> element, so `window` resolves the way it does in a
     browser rather than in eval's rebound scope. */
  const tag = w.document.createElement('script');
  tag.textContent = cloudSrc;
  w.document.body.appendChild(tag);
  const C = w.EOL.cloud;

  if (opts.onConflict) {
    C.onConflict((sums) => {
      state.conflictAsked++;
      state.lastSummaries = sums;
      return opts.onConflict(sums);
    });
  }

  C.init();
  return {
    w,
    C,
    state,
    signIn: (id) => authCb && authCb({ id: id || 'user-1' }),
    /* Drop the session WITHOUT running leave()'s wipe. This is what a
       page reload looks like to cloud.js: the module re-inits with no
       uid and then auth hands the same user straight back. */
    signOutQuiet: () => authCb && authCb(null),
    keys: () => Object.keys(w.localStorage).filter((k) => k.indexOf('eol.') === 0),
    get: (k) => w.localStorage.getItem(k),
  };
}

(async () => {
  section('A. what counts as progress worth protecting');
  {
    const { C } = makeWorld({});
    const sum = (local) => {
      const world = makeWorld({ local });
      return world.C._summarize(world.C._collect());
    };

    ok(
      sum(freshSave()).any === false,
      'a fresh boot (starter deck + tutorial flags) is NOT progress'
    );
    ok(sum({}).any === false, 'an empty browser is not progress');
    ok(sum(playedSave()).any === true, 'coins, cards, gates and decks ARE progress');
    ok(sum({ 'eol.wallet.v1': '30' }).any === true, 'earning a single coin counts');
    ok(
      sum({ 'eol.campaign.ch1.progress': JSON.stringify({ runs: { normal: { cleared: [1] } } }) })
        .any === true,
      'clearing one gate counts'
    );
    ok(
      sum({ 'eol.decks.v1': JSON.stringify([{ id: 'mine', ids: [] }]) }).any === true,
      'building your own deck counts'
    );
    ok(
      sum({ 'eol.gfx': 'low', 'eol.scale': '120' }).any === false,
      'settings alone are never worth a prompt'
    );

    const s = C._summarize({
      wallet: 900,
      owned: ['a', 'b', 'c', 'd'],
      campaign: { runs: { normal: { cleared: [1, 2] }, heroic: { cleared: [1] } }, fought: [1] },
      decks: [{ id: 'starter-grimmwood' }, { id: 'x' }, { id: 'y' }],
    });
    ok(s.coins === 900, 'summary reports coins');
    ok(s.gates === 3, 'summary counts gates across every difficulty');
    ok(s.decks === 2, 'summary excludes the seeded starter deck');
  }

  section('B. signing in');
  {
    /* new account: the device save is adopted, nothing is destroyed */
    const world = makeWorld({ local: playedSave(), cloud: null });
    world.signIn();
    await sleep(30);
    ok(world.state.upserts === 1, 'a brand-new account adopts the device save');
    ok(world.state.reloaded === 0, 'no reload - the player keeps playing');
    ok(world.state.row.data.wallet === 1200, 'the adopted save carries the coins');
    ok(world.state.conflictAsked === 0, 'nothing to ask about');
  }
  {
    /* returning account, nothing on this device: restore silently */
    const cloud = { v: 2, wallet: 5000, owned: ['x', 'y'], campaign: { runs: {} } };
    const world = makeWorld({ local: freshSave(), cloud, onConflict: () => 'local' });
    world.signIn();
    await sleep(30);
    ok(world.state.conflictAsked === 0, 'a fresh device is never asked - the account just wins');
    ok(world.get('eol.wallet.v1') === '5000', 'the account save was applied');
    ok(world.state.reloaded === 1, 'one clean reboot into the restored save');
  }
  {
    /* returning account AND real local progress: must ask */
    const cloud = { v: 2, wallet: 5000, owned: ['x', 'y'], campaign: { runs: {} } };
    const world = makeWorld({ local: playedSave(), cloud, onConflict: () => 'cloud' });
    world.signIn();
    await sleep(30);
    ok(world.state.conflictAsked === 1, 'two real saves ALWAYS prompt');
    ok(world.state.lastSummaries.local.coins === 1200, 'the prompt is given the device totals');
    ok(world.state.lastSummaries.cloud.coins === 5000, 'the prompt is given the account totals');
    ok(world.get('eol.wallet.v1') === '5000', "choosing 'cloud' restores the account");
    ok(world.state.reloaded === 1, "choosing 'cloud' reboots once");
  }
  {
    const cloud = { v: 2, wallet: 5000, owned: ['x'], campaign: { runs: {} } };
    const world = makeWorld({ local: playedSave(), cloud, onConflict: () => 'local' });
    world.signIn();
    await sleep(30);
    ok(world.get('eol.wallet.v1') === '1200', "choosing 'local' keeps the device save");
    ok(world.state.row.data.wallet === 1200, "choosing 'local' overwrites the account");
    ok(world.state.reloaded === 0, "choosing 'local' never reboots");
  }
  {
    const cloud = { v: 2, wallet: 5000, owned: ['x'], campaign: { runs: {} } };
    const world = makeWorld({ local: playedSave(), cloud, onConflict: () => null });
    world.signIn();
    await sleep(30);
    ok(world.get('eol.wallet.v1') === '1200', 'cancelling changes NOTHING locally');
    ok(world.state.row.data.wallet === 5000, 'cancelling leaves the account untouched');
    ok(world.state.signedOut === 1, 'cancelling signs back out');
  }
  {
    /* a promise-returning handler (the real UI) must be awaited */
    const cloud = { v: 2, wallet: 777, owned: [], campaign: { runs: {} } };
    const world = makeWorld({
      local: playedSave(),
      cloud,
      onConflict: () => new Promise((r) => setTimeout(() => r('cloud'), 20)),
    });
    world.signIn();
    await sleep(80);
    ok(world.get('eol.wallet.v1') === '777', 'an async choice is awaited, not ignored');
  }

  section('B2. the returning player is NOT interrogated every boot');
  {
    /* THE REGRESSION. Sign in once, then boot again as the same player
       on the same device with nothing changed. The vault now holds this
       exact save, so there is no collision and nothing to ask about.

       This shipped broken: digest() was a raw JSON.stringify, but the
       column is jsonb and Postgres hands objects back with their keys
       reordered. The save was compared against a re-serialized copy of
       ITSELF, mismatched, and the override prompt fired on every load. */
    const world = makeWorld({ local: playedSave(), cloud: null, onConflict: () => 'local' });
    world.signIn();
    await sleep(30);
    ok(world.state.conflictAsked === 0, 'first sign-in adopts the save silently');

    for (let boot = 2; boot <= 4; boot++) {
      world.signOutQuiet();
      world.signIn();
      await sleep(30);
      ok(world.state.conflictAsked === 0, 'boot ' + boot + ': still no prompt');
    }
    ok(world.state.reloaded === 0, 'and no reload loop either');
    ok(world.get('eol.wallet.v1') === '1200', 'the save is untouched throughout');
  }
  {
    /* The same guarantee for a player whose vault predates this session:
       an account save that MEANS the same thing as the device save must
       not prompt, however the database chose to order its keys. */
    const world = makeWorld({
      local: playedSave(),
      cloud: null,
      onConflict: () => 'local',
    });
    world.signIn();
    await sleep(30);
    const stored = world.state.row.data;
    const shuffled = {};
    Object.keys(stored)
      .reverse()
      .forEach((k) => {
        shuffled[k] = stored[k];
      });
    const world2 = makeWorld({ local: playedSave(), cloud: shuffled, onConflict: () => 'local' });
    world2.signIn();
    await sleep(30);
    ok(world2.state.conflictAsked === 0, 'key order alone is never a conflict');
    ok(world2.state.reloaded === 0, 'and never triggers a restore');
  }
  {
    /* The guard must not have been loosened into uselessness: a save
       that genuinely differs still has to stop and ask. */
    const cloud = { v: 2, wallet: 5000, owned: ['x'], campaign: { runs: {} } };
    const world = makeWorld({ local: playedSave(), cloud, onConflict: () => 'local' });
    world.signIn();
    await sleep(30);
    ok(world.state.conflictAsked === 1, 'a genuinely different save STILL prompts');
  }

  section('C. signing out clears the device');
  {
    const world = makeWorld({ local: playedSave(), cloud: null });
    world.signIn();
    await sleep(30);
    const before = world.keys().length;
    const left = await world.C.leave();
    ok(left === true, 'leave() reports success');
    ok(before > 0 && world.keys().length === 0, 'every local key is erased');
    ok(world.state.upserts >= 1, 'the save was flushed to the account BEFORE the wipe');
    ok(world.state.row.data.wallet === 1200, 'the account kept the final state');
    ok(world.C.cleared() === true, 'the next boot knows it was cleared');
    ok(world.C.cleared() === false, 'the cleared marker is consumed once');
  }
  {
    /* THE REAL RISK. Sign in, play a bit more, THEN lose the network and
       try to sign out. The last few minutes exist only on this device,
       so erasing it would destroy them. */
    const world = makeWorld({ local: playedSave(), cloud: null });
    world.signIn();
    await sleep(30);
    world.w.localStorage.setItem('eol.wallet.v1', '9999'); // earned since the last push
    world.state.failUpsert = true;
    world.C.push._warned = true;
    const left = await world.C.leave();
    ok(left === false, 'a failed flush reports failure');
    ok(world.keys().length > 0, 'a failed flush ABORTS the wipe - nothing is erased');
    ok(world.get('eol.wallet.v1') === '9999', 'unsynced progress survives a failed sign-out');
  }
  {
    /* Nothing has changed since the last CONFIRMED push, so the vault
       provably holds this state and the wipe is safe even though push()
       returns false ("nothing to do"). */
    const world = makeWorld({ local: playedSave(), cloud: null });
    world.signIn();
    await sleep(30);
    const left = await world.C.leave();
    ok(left === true, 'an already-synced device signs out cleanly');
    ok(world.keys().length === 0, 'and is erased');
  }
  {
    const world = makeWorld({ local: playedSave(), cloud: null });
    const left = await world.C.leave();
    ok(left === false, 'leave() is a no-op when signed out');
    ok(world.keys().length > 0, 'a signed-out device is never wiped');
  }

  section('D. the wiped device really is a first run');
  {
    const world = makeWorld({ local: playedSave(), cloud: null });
    world.signIn();
    await sleep(30);
    await world.C.leave();
    const leftovers = world.C.KEYS.filter((k) => world.get(k) !== null);
    ok(leftovers.length === 0, 'no vaulted key survives: ' + (leftovers.join(', ') || 'none'));
    ok(
      world.C._summarize(world.C._collect()).any === false,
      'the wiped device reports no progress'
    );
  }

  section('E. the dialogs exist and state the cost');
  {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    const pageDoc = new JSDOM(html).window.document;

    ['merge-modal', 'signout-modal'].forEach((id) => {
      const el = pageDoc.getElementById(id);
      ok(!!el, '#' + id + ' exists');
      ok(el && el.hasAttribute('hidden'), '#' + id + ' is hidden at rest');
      ok(
        el && el.getAttribute('role') === 'dialog' && el.getAttribute('aria-modal') === 'true',
        '#' + id + ' is a modal dialog'
      );
    });

    /* every element app.js reaches for must be in the document */
    const refs = [...app.matchAll(/getElementById\('((?:merge|signout)-[a-z-]+)'\)/g)].map(
      (m) => m[1]
    );
    const missing = [...new Set(refs)].filter((r) => !pageDoc.getElementById(r));
    ok(
      missing.length === 0,
      'app.js references no missing dialog element: ' + (missing.join(', ') || 'none')
    );

    ok(
      /replaces<\/b> the other|<b>replaces<\/b>/.test(html),
      'the collision dialog says one save replaces the other'
    );
    ok(/Cancel and stay signed out/.test(html), 'the collision dialog offers a no-loss way out');
    ok(
      /Log out and clear this device/.test(html),
      'the menu item warns that signing out clears the browser'
    );
    ok(
      /cleared from this browser/.test(html),
      'the sign-out dialog explains the wipe before it happens'
    );
    ok(/onConflict\(askSaveConflict\)/.test(app), 'app.js installs the collision handler');
    ok(
      app.indexOf('initAuth();') < app.indexOf('window.EOL.cloud.init()'),
      'the handler is installed BEFORE the vault starts pulling'
    );
    ok(
      /confirmSignOut\(\)/.test(app) && !/acct-logout[\s\S]{0,200}A\.signOut\(\)/.test(app),
      'the log-out button goes through the confirmation, never straight to signOut'
    );
  }

  console.log('\n================================================================');
  if (fail === 0) {
    console.log('\x1b[32mALL ' + pass + ' ASSERTIONS PASSED\x1b[0m');
  } else {
    console.log('\x1b[31m' + fail + ' FAILED\x1b[0m, ' + pass + ' passed');
  }
  console.log('================================================================');
  process.exit(fail === 0 ? 0 : 1);
})();
