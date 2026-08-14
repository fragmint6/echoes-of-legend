/* =============================================================
   DEFECT 1 - THE GUEST-PROGRESS WIPE
   node sim/verify_guest_signin.js
   -------------------------------------------------------------
   Reported: played as a guest, signed into an account that already
   held a cloud save, and the local progress vanished with no prompt.

   The rule this defends is one sentence: SIGNING IN MUST NEVER
   DESTROY UNSAVED LOCAL PROGRESS WITHOUT ASKING. Three separate
   defects were each sufficient to break it on their own, so each gets
   its own scenario here rather than one composite "does it prompt"
   check - a composite would have gone green as soon as any one of
   them was fixed.

   The fourth scenario is the opposite failure: a prompt on a brand
   new browser, where there is nothing to lose. A dialog that appears
   when it should not is how players learn to click through the one
   that matters.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CLOUD = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};

function storage(seed) {
  const v = Object.assign({}, seed || {});
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(v, k) ? v[k] : null),
    setItem: (k, x) => {
      v[k] = String(x);
    },
    removeItem: (k) => {
      delete v[k];
    },
    values: v,
  };
}

function canonicalDigest(v) {
  const c = (x) => {
    if (Array.isArray(x)) return x.map(c);
    if (x && typeof x === 'object') {
      const o = {};
      Object.keys(x)
        .sort()
        .forEach((k) => (o[k] = c(x[k])));
      return o;
    }
    return x;
  };
  return JSON.stringify(c(v));
}

const STARTER = Array.from({ length: 12 }, (_, i) => 'grimm' + i);

/* a guest who has actually played: coins, cards beyond the starter,
   two gates cleared, and a deck they built themselves */
const PLAYED = {
  'eol.wallet.v1': '450',
  'eol.owned.v1': JSON.stringify(STARTER.concat(['won1', 'won2'])),
  'eol.campaign.ch1.progress': JSON.stringify({ v: 3, runs: { normal: { cleared: [1, 2] } } }),
  'eol.decks.v1': JSON.stringify([{ id: 'starter-grimmwood' }, { id: 'mine', name: 'Mine' }]),
};
/* a browser that has never played: exactly what the first boot seeds */
const FRESH = {
  'eol.wallet.v1': '0',
  'eol.owned.v1': JSON.stringify(STARTER),
  'eol.campaign.ch1.progress': JSON.stringify({ v: 3, runs: { normal: { cleared: [] } } }),
  'eol.decks.v1': JSON.stringify([{ id: 'starter-grimmwood' }]),
};
const ACCOUNT_SAVE = {
  v: 2,
  wallet: 9999,
  owned: ['other'],
  campaign: { v: 3, runs: { normal: { cleared: [1, 2, 3, 4, 5] } } },
};

function signIn(opts) {
  const local = storage(opts.local);
  const session = storage(opts.session || {});
  let prompted = false,
    reloads = 0;
  const writes = [];
  const client = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: { data: opts.cloud }, error: null });
        },
        upsert(p) {
          writes.push(p);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  let listener = null;
  const ctx = {
    console,
    Promise,
    JSON,
    localStorage: local,
    sessionStorage: session,
    document: { addEventListener() {} },
    location: {
      reload() {
        reloads++;
      },
    },
    setInterval: () => 1,
    clearInterval() {},
  };
  ctx.window = ctx;
  ctx.EOL = {
    econ: { starterIds: () => STARTER },
    auth: {
      configured: () => true,
      rawClient: () => client,
      onChange(l) {
        listener = l;
      },
      signOut() {},
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CLOUD, ctx, { filename: 'js/cloud.js' });
  if (!opts.noHandler)
    ctx.EOL.cloud.onConflict(() => {
      prompted = true;
      return opts.answer === undefined ? null : opts.answer;
    });
  ctx.EOL.cloud.init();
  listener({ id: 'u1' });
  return new Promise((r) =>
    setTimeout(
      () =>
        r({
          prompted,
          reloads,
          writes,
          local,
          session,
          wallet: local.getItem('eol.wallet.v1'),
        }),
      40
    )
  );
}

(async function () {
  console.log('\nA GUEST WITH PROGRESS SIGNS IN, ACCOUNT ALREADY HAS A SAVE');
  {
    const r = await signIn({ local: PLAYED, cloud: ACCOUNT_SAVE });
    ok(r.prompted, 'the player is ASKED before anything is destroyed');
    ok(r.wallet === '450', 'and nothing is overwritten while the question is open');
    ok(r.reloads === 0, 'no reload happens behind the prompt');
  }

  console.log('\nDEFECT: A STALE RESTORE GUARD SKIPPED THE QUESTION');
  {
    /* The guard is a SESSION flag, and a session outlives the sign-out
       that follows it: restore an account, sign out, play as a guest,
       sign back in - same tab, marker still set. It used to suppress
       the prompt outright. */
    const r = await signIn({
      local: PLAYED,
      cloud: ACCOUNT_SAVE,
      session: { 'eol.cloud.restored': '1' },
    });
    ok(r.prompted, 'a leftover restore marker no longer suppresses the prompt');
    ok(r.wallet === '450', 'guest progress survives it');
  }
  {
    /* Worse: the guard was honoured even with a digest that proves it
       came from a DIFFERENT save, which pushed the guest's device over
       the account. */
    const r = await signIn({
      local: PLAYED,
      cloud: ACCOUNT_SAVE,
      session: {
        'eol.cloud.restored': '1',
        'eol.cloud.restoreDigest': JSON.stringify({ some: 'other save' }),
      },
    });
    ok(r.prompted, 'a guard whose digest matches nothing is not trusted');
    ok(r.wallet === '450', 'and it cannot silently overwrite the account either');
  }
  {
    /* The guard's ONE legitimate job still works: the previous boot
       applied this exact save, a client migration changed the shape,
       promote it instead of restoring and reloading forever. */
    const r = await signIn({
      local: PLAYED,
      cloud: ACCOUNT_SAVE,
      session: {
        'eol.cloud.restored': '1',
        'eol.cloud.restoreDigest': canonicalDigest(ACCOUNT_SAVE),
      },
    });
    ok(!r.prompted && r.writes.length === 1, 'a PROVEN guard still promotes a client migration');
    ok(r.reloads === 0, 'without a second reload');
    ok(
      !r.session.values['eol.cloud.restoreDigest'],
      'and the guard is consumed so it cannot be reused'
    );
  }

  console.log('\nDEFECT: THE PROMPT WAS NEVER REGISTERED ON SOME BUILDS');
  {
    const r = await signIn({ local: PLAYED, cloud: ACCOUNT_SAVE, noHandler: true });
    ok(
      !r.prompted && r.wallet === '9999',
      'with no handler the vault still falls back to "account wins" (the pre-existing contract)'
    );
    /* ...which is exactly why registration must not be conditional. */
    ok(
      /function installSaveConflictHandler/.test(APP),
      'so the handler is installed by its own function, not buried in initAuth()'
    );
    ok(
      /initAuth\(\);\s*\n\s*installSaveConflictHandler\(\);\s*\n\s*if \(window\.EOL\.cloud\) window\.EOL\.cloud\.init\(\);/.test(
        APP
      ),
      'and it is installed at boot BEFORE cloud.init(), unconditionally'
    );
    const initAuthBody = APP.slice(APP.indexOf('function initAuth('), APP.indexOf('function initGfx'));
    ok(
      !/onConflict\(/.test(initAuthBody),
      'initAuth no longer owns the registration - it returns early when the account UI is absent'
    );
  }

  console.log('\nDEFECT: A BRAND NEW BROWSER PROMPTED ABOUT NOTHING');
  {
    const r = await signIn({ local: FRESH, cloud: ACCOUNT_SAVE });
    ok(
      !r.prompted,
      'the seeded starter deck is not "progress" - a fresh install restores silently'
    );
    ok(r.wallet === '9999', 'and simply adopts the account save');
    ok(
      /window\.EOL\.econ && window\.EOL\.econ\.starterIds/.test(CLOUD),
      'because the starter list is read from EOL.econ - the module that exists'
    );
    ok(
      !/window\.EOL\.economy/.test(CLOUD),
      'the old EOL.economy typo, which silently made starterSize 0, is gone'
    );
  }

  console.log('\nTHE PLAYER CAN STILL CHOOSE EITHER SIDE');
  {
    const keep = await signIn({ local: PLAYED, cloud: ACCOUNT_SAVE, answer: 'local' });
    ok(
      keep.wallet === '450' && keep.writes.length === 1,
      'choosing "keep this device" uploads the guest save to the account'
    );
    const take = await signIn({ local: PLAYED, cloud: ACCOUNT_SAVE, answer: 'cloud' });
    ok(take.wallet === '9999' && take.reloads === 1, 'choosing "keep the account" restores it');
  }

  console.log('\nTHE DIALOG ITSELF');
  {
    ok(/id="merge-modal"/.test(HTML), 'the collision dialog exists in the page');
    ['merge-keep-cloud', 'merge-keep-local', 'merge-cancel', 'merge-scrim'].forEach((id) =>
      ok(HTML.indexOf('id="' + id + '"') !== -1, '  it has #' + id)
    );
    ok(
      /if \(!modal\) return 'cloud';/.test(APP),
      'headless builds keep the documented fallback rather than hanging the sign-in'
    );
  }

  console.log('\npass ' + pass + '  fail ' + fail);
  process.exit(fail ? 1 : 0);
})();
