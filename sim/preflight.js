/* =============================================================
   Echoes of Legend - DEPLOY PREFLIGHT
   -------------------------------------------------------------
   node sim/preflight.js

   Reads js/supabase-config.js and interrogates the REAL project.
   Answers two questions: can two people queue and play, and is the
   one-attempt Daily Puzzle gate installed?

   Every check reports what it actually observed, so a failure names
   the fix instead of just saying "something is wrong".
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

/* load the config the browser would load */
global.window = {};
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(ROOT, 'js/supabase-config.js'), 'utf8'));
const CFG = window.EOL.supabaseConfig || {};

let fails = 0;
let warns = 0;
const pass = (m) => console.log('  \x1b[32mPASS\x1b[0m  ' + m);
const fail = (m) => {
  fails++;
  console.log('  \x1b[31mFAIL\x1b[0m  ' + m);
};
const warn = (m) => {
  warns++;
  console.log('  \x1b[33mWARN\x1b[0m  ' + m);
};

async function get(url, opts) {
  const res = await fetch(url, opts);
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  return { status: res.status, body };
}

(async () => {
  console.log('');
  console.log('================================================================');
  console.log('  DEPLOY PREFLIGHT');
  console.log('================================================================');

  /* ---------- 1. config shape ---------- */
  console.log('\n  Configuration');
  if (!CFG.url || !CFG.anonKey) {
    fail('js/supabase-config.js is not filled in.');
    process.exit(1);
  }
  if (/\/rest\/v1/.test(CFG.url) || /\/$/.test(CFG.url)) {
    fail(
      'url must be the BASE project URL with no trailing path or slash.\n' +
        '          Found: ' +
        CFG.url
    );
  } else {
    pass('url is a clean base project URL');
  }

  if (CFG.anonKey.indexOf('sb_secret_') === 0 || CFG.anonKey.indexOf('service_role') >= 0) {
    fail('SECRET key in client config. Use the publishable key and rotate that one now.');
  } else if (CFG.anonKey.indexOf('sb_publishable_') === 0) {
    pass('publishable key (not a secret key)');
  } else {
    warn('key is not in sb_publishable_ form - assuming a legacy anon JWT');
  }

  const U = CFG.url.replace(/\/+$/, '');
  const K = CFG.anonKey;
  const H = { apikey: K };

  /* ---------- 2. the key actually works ---------- */
  console.log('\n  Reachability');
  let settings;
  try {
    settings = await get(U + '/auth/v1/settings', { headers: H });
  } catch (e) {
    fail('cannot reach the project at all: ' + e.message);
    process.exit(1);
  }
  if (settings.status === 200) pass('project reachable and the key authenticates');
  else {
    fail('auth settings returned HTTP ' + settings.status + ' - key or URL is wrong');
    process.exit(1);
  }

  /* ---------- 3. schema ---------- */
  console.log('\n  Database schema');
  /* THE BACKEND MAP: identity + vault + two matchmaking tables +
     the active/staged Daily Puzzle store and its atomic attempt claims.
     `decks` and `ladders` remain dead weight and have a graveyard check. */
  const need = [
    'profiles',
    'mp_queue',
    'mp_matches',
    'saves',
    'daily_puzzles',
    'daily_puzzle_attempts',
    'daily_puzzle_jobs',
  ];
  const missing = [];
  for (const t of need) {
    const r = await get(U + '/rest/v1/' + t + '?select=*&limit=1', { headers: H });
    if (r.body && r.body.code === 'PGRST205') {
      missing.push(t);
      fail("table '" + t + "' does not exist");
    } else if (r.status === 200) {
      pass("table '" + t + "' exists and is readable");
    } else if (r.status === 401 || r.status === 403) {
      pass("table '" + t + "' exists (RLS is hiding rows, which is correct)");
    } else {
      warn("table '" + t + "' returned HTTP " + r.status);
    }
  }
  /* the graveyard: tables the cleanup migration should have removed */
  for (const t of ['decks', 'ladders']) {
    const r = await get(U + '/rest/v1/' + t + '?select=*&limit=1', { headers: H });
    if (r.body && r.body.code === 'PGRST205') {
      pass("dead table '" + t + "' is gone");
    } else {
      warn(
        "dead table '" + t + "' still exists - run the cleanup SQL in SUPABASE-SETUP.md section 9b"
      );
    }
  }

  /* ---------- 4. the matchmaking function ---------- */
  console.log('\n  Matchmaking function');
  const rpc = await get(U + '/rest/v1/rpc/try_match', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, H),
    body: JSON.stringify({ p_mode: 'draft' }),
  });
  if (rpc.body && rpc.body.code === 'PGRST202') {
    fail('try_match() does not exist - matchmaking cannot pair anyone');
  } else if (rpc.body && /not authenticated/i.test(rpc.body.message || '')) {
    pass('try_match() exists and correctly refuses an unauthenticated caller');
  } else if (rpc.status === 200) {
    warn('try_match() ran for an ANONYMOUS caller - it should require a signed-in user');
  } else {
    pass('try_match() exists (HTTP ' + rpc.status + ': ' + (rpc.body && rpc.body.message) + ')');
  }

  /* ---------- 4b. Daily Puzzle gate ---------- */
  console.log('\n  Daily Puzzle function');
  const dailyRpc = await get(U + '/rest/v1/rpc/daily_puzzle_status', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, H),
    body: '{}',
  });
  if (dailyRpc.body && dailyRpc.body.code === 'PGRST202') {
    fail('daily_puzzle_status() is missing - run Supabase migration 04');
  } else if (
    dailyRpc.status === 401 ||
    dailyRpc.status === 403 ||
    (dailyRpc.body && /authentication|required|permission/i.test(dailyRpc.body.message || ''))
  ) {
    pass('daily_puzzle_status() exists and requires a signed-in account');
  } else if (dailyRpc.status === 200) {
    warn('daily_puzzle_status() exposed data to an anonymous caller');
  } else {
    pass(
      'daily_puzzle_status() exists (HTTP ' +
        dailyRpc.status +
        ': ' +
        (dailyRpc.body && dailyRpc.body.message) +
        ')'
    );
  }

  /* ---------- 5. RLS really is on ---------- */
  console.log('\n  Row Level Security');
  const probes = [
    ['profiles', { id: '00000000-0000-0000-0000-000000000009', handle: 'preflight' }],
    ['saves', { user_id: '00000000-0000-0000-0000-000000000009', data: { v: 2, wallet: 9999 } }],
    [
      'daily_puzzles',
      {
        slot: 'active',
        puzzle_day: '2099-01-01',
        payload: { v: 1 },
        metrics: {},
      },
    ],
  ];
  for (const [t, row] of probes) {
    if (missing.indexOf(t) >= 0) continue;
    const r = await get(U + '/rest/v1/' + t, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, H),
      body: JSON.stringify(row),
    });
    if (r.status === 401 || r.status === 403 || (r.body && r.body.code === '42501')) {
      pass("anonymous writes to '" + t + "' are blocked");
    } else if (r.status === 201 || r.status === 200) {
      fail("ANONYMOUS WRITE SUCCEEDED on '" + t + "' - RLS is not protecting this table");
    } else {
      warn("'" + t + "' write probe returned HTTP " + r.status);
    }
  }

  /* ---------- 6. auth providers ---------- */
  console.log('\n  Sign-in');
  const s = settings.body || {};
  const ext = s.external || {};
  if (ext.email) pass('email sign-in is enabled');
  else fail('email sign-in is DISABLED - nobody can make an account');
  if (s.disable_signup) fail('signups are DISABLED - new players cannot register');
  else pass('signups are open');
  if (ext.google) pass('Google sign-in is enabled');
  if (s.mailer_autoconfirm === false) {
    warn(
      'email confirmation is REQUIRED. Every test account must click a link\n' +
        '          before it can queue. Turn "Confirm email" off while testing:\n' +
        '          Authentication -> Sign In / Providers -> Email.'
    );
  } else {
    pass('email auto-confirm is on - accounts work immediately');
  }

  /* ---------- 7. realtime ----------
     Broadcast is what carries every draft pick and battle action, so
     "it should be on by default" is not good enough - open a real
     channel and push a real message through it.

     This needs a browser: the realtime client wants a native
     WebSocket, which Node 20 does not provide. If puppeteer is not
     installed we say so rather than silently skipping a check that
     matters. */
  console.log('\n  Realtime (Broadcast)');
  let puppeteer = null;
  try {
    puppeteer = require('/tmp/node_modules/puppeteer');
  } catch (e) {
    try {
      puppeteer = require('puppeteer');
    } catch (e2) {
      puppeteer = null;
    }
  }
  if (!puppeteer) {
    warn(
      'skipped - puppeteer not installed, so a real WebSocket could not\n' +
        '          be opened. Install it to check:\n' +
        '          cd /tmp && npm install puppeteer --no-audit --no-fund'
    );
  } else {
    let br = null;
    try {
      br = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox'],
      });
      const page = await br.newPage();
      /* about:blank has no origin the SDK can use, so load the CDN
         bundle from a real https page. */
      await page.goto('https://cdn.jsdelivr.net/', { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({
        url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
      });
      const out = await page.evaluate(
        async (url, key) => {
          const { createClient } = window.supabase;
          const a = createClient(url, key);
          const b = createClient(url, key);
          const recv = new Promise((res) => {
            const ch = b.channel('eol-preflight', { config: { broadcast: { self: false } } });
            ch.on('broadcast', { event: 'ping' }, (m) => res(m.payload));
            ch.subscribe((s) => {
              if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') res({ error: s });
            });
          });
          const sender = await new Promise((res) => {
            const ch = a.channel('eol-preflight', { config: { broadcast: { self: false } } });
            ch.subscribe((s) => {
              if (s === 'SUBSCRIBED') res(ch);
              if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') res(null);
            });
            setTimeout(() => res(null), 15000);
          });
          if (!sender) return { fail: 'the channel would not open' };
          await new Promise((r) => setTimeout(r, 700));
          await sender.send({ type: 'broadcast', event: 'ping', payload: { hello: 'world' } });
          const got = await Promise.race([
            recv,
            new Promise((r) => setTimeout(() => r({ timeout: true }), 15000)),
          ]);
          return { got };
        },
        U,
        K
      );
      if (out.got && out.got.hello === 'world') {
        pass('two clients exchanged a broadcast message - realtime is working');
      } else if (out.fail) {
        fail('realtime: ' + out.fail);
      } else if (out.got && out.got.timeout) {
        fail('both clients subscribed but the message never arrived');
      } else {
        fail('realtime returned ' + JSON.stringify(out.got));
      }
    } catch (e) {
      warn('realtime check could not run: ' + e.message.split('\n')[0]);
    } finally {
      if (br) await br.close();
    }
  }

  /* ---------- verdict ---------- */
  console.log('\n================================================================');
  if (fails) {
    console.log(
      '  \x1b[31m' + fails + ' BLOCKER(S)\x1b[0m' + (warns ? ' and ' + warns + ' warning(s)' : '')
    );
    console.log('  Multiplayer will NOT work until the failures above are fixed.');
    console.log('  The SQL for all of them is in docs/SUPABASE-SETUP.md steps 2-4.');
  } else {
    console.log('  \x1b[32mREADY\x1b[0m' + (warns ? ' - with ' + warns + ' warning(s) above' : ''));
    console.log('  Two signed-in players can queue and play.');
  }
  console.log('================================================================');
  process.exit(fails ? 1 : 0);
})();
