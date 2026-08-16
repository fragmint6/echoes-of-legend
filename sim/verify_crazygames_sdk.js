/* =============================================================
   CRAZYGAMES SDK BRIDGE REGRESSION
   node sim/verify_crazygames_sdk.js
   -------------------------------------------------------------
   The bridge reports loading and gameplay timing during Basic
   Launch. Two things must hold:

     1. it reports the RIGHT thing - gameplay is "in a battle", not
        "the tab is open", and start/stop never repeat
     2. it can fail completely without costing the player anything

   (2) is the important half. The SDK is a third-party CDN script
   inside an iframe: ad blockers eat it, networks drop it, init()
   rejects. Every one of those paths is exercised here.
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
const bridgeSrc = fs.readFileSync(path.join(ROOT, 'js/crazygames-sdk.js'), 'utf8');

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

/* ---------------------------------------------------------------
   Boot the bridge with a fake SDK whose behaviour we control.
   mode: 'ok' | 'blocked' | 'initRejects' | 'throws'
   --------------------------------------------------------------- */
function makeWorld(opts) {
  opts = opts || {};
  const mode = opts.mode || 'ok';
  const dom = new JSDOM(
    '<!doctype html><html><body data-view="home"><div id="veil" class="on"></div></body></html>',
    { url: 'https://games.crazygames.com/eol/', runScripts: 'dangerously' }
  );
  const w = dom.window;
  const calls = [];

  const settingsListeners = [];
  const authListeners = [];
  const identity = { current: undefined, calls: 0 };
  const audio = {
    externalMute: null,
    playerMuted: false,
    setExternalMute(on) {
      if (opts.audioThrows) throw new Error('audio boom');
      audio.externalMute = !!on;
    },
  };
  w.EOL = {
    platform: {
      sdk: opts.sdk !== false,
      isCrazyGames: true,
      dataModule: opts.dataModule !== false,
      cloudVault: false,
    },
  };
  /* cloud.js is the single source of truth for which keys are progress */
  w.EOL.cloud = { KEYS: ['eol.wallet.v1', 'eol.owned.v1', 'eol.campaign.ch1.progress'] };
  if (!opts.noAuth) {
    w.EOL.auth = {
      setPortalIdentity(u) {
        if (opts.authThrows) throw new Error('auth boom');
        identity.calls++;
        identity.current = u;
      },
    };
  }
  Object.keys(opts.local || {}).forEach((k) => w.localStorage.setItem(k, opts.local[k]));
  if (!opts.noAudio) w.EOL.audio = audio;

  /* Stand in for the CDN: createElement('script') for the SDK URL
     resolves to our fake instead of a network fetch. */
  const realCreate = w.document.createElement.bind(w.document);
  w.document.createElement = function (tag) {
    const el = realCreate(tag);
    if (String(tag).toLowerCase() !== 'script') return el;
    let src = '';
    Object.defineProperty(el, 'src', {
      configurable: true,
      get: () => src,
      set(v) {
        src = v;
        if (String(v).indexOf('crazygames-sdk') === -1) return;
        setTimeout(() => {
          if (mode === 'blocked') {
            if (el.onerror) el.onerror(new w.Event('error'));
            return;
          }
          w.CrazyGames = {
            SDK: {
              init() {
                calls.push('init');
                if (mode === 'initRejects') return Promise.reject(new Error('nope'));
                return Promise.resolve();
              },
              user: {
                isUserAccountAvailable: opts.accountAvailable !== false,
                getUser() {
                  calls.push('getUser');
                  if (opts.userThrows) return Promise.reject({ code: 'unexpectedError' });
                  if (!opts.portalUser) return Promise.reject({ code: 'userNotAuthenticated' });
                  return Promise.resolve(opts.portalUser);
                },
                addAuthListener(fn) {
                  calls.push('addAuthListener');
                  authListeners.push(fn);
                },
                removeAuthListener() {},
                showAuthPrompt() {
                  calls.push('showAuthPrompt');
                  return Promise.resolve(null);
                },
                getUserToken() {
                  calls.push('getUserToken');
                  return Promise.resolve('jwt');
                },
              },
              data: {
                _store: Object.assign({}, opts.remoteSave || {}),
                getItem(k) {
                  if (opts.dataThrows) throw new Error('dataModuleDisabled');
                  return k in this._store ? this._store[k] : null;
                },
                setItem(k, v) {
                  if (opts.dataThrows) throw new Error('dataLimitExcedeed');
                  this._store[k] = String(v);
                },
                removeItem(k) {
                  if (opts.dataThrows) throw new Error('dataModuleDisabled');
                  delete this._store[k];
                },
                clear() {
                  this._store = {};
                },
              },
              game: {
                environment: 'crazygames',
                settings: opts.settings || { muteAudio: false, disableChat: false },
                addSettingsChangeListener(fn) {
                  if (mode === 'throws') throw new Error('boom');
                  calls.push('addSettingsChangeListener');
                  settingsListeners.push(fn);
                },
                removeSettingsChangeListener() {},
                loadingStart() {
                  if (mode === 'throws') throw new Error('boom');
                  calls.push('loadingStart');
                },
                loadingStop() {
                  if (mode === 'throws') throw new Error('boom');
                  calls.push('loadingStop');
                },
                gameplayStart() {
                  if (mode === 'throws') throw new Error('boom');
                  calls.push('gameplayStart');
                },
                gameplayStop() {
                  if (mode === 'throws') throw new Error('boom');
                  calls.push('gameplayStop');
                },
              },
            },
          };
          if (el.onload) el.onload();
        }, 5);
      },
    });
    return el;
  };

  const tag = realCreate('script');
  tag.textContent = bridgeSrc;
  w.document.body.appendChild(tag);

  return {
    w,
    calls,
    api: () => w.EOL.crazygames,
    audio,
    identity,
    portalLogin: (u) => authListeners.forEach((fn) => fn(u)),
    authListeners: () => authListeners.length,
    remote: () => (w.CrazyGames ? w.CrazyGames.SDK.data._store : null),
    local: (k) => w.localStorage.getItem(k),
    setLocal: (k, v) => w.localStorage.setItem(k, v),
    /* the portal changing its mute after load */
    portalSetMute(on) {
      settingsListeners.forEach((fn) => fn({ muteAudio: on, disableChat: false }));
    },
    listeners: () => settingsListeners.length,
    view(v) {
      w.document.body.dataset.view = v;
      w.document.dispatchEvent(new w.CustomEvent('eol:view', { detail: v }));
    },
    liftVeil() {
      w.document.getElementById('veil').classList.remove('on');
    },
  };
}

(async () => {
  section('A. the happy path reports what Basic Launch measures');
  {
    const world = makeWorld({ mode: 'ok' });
    await sleep(60);
    ok(world.api().isReady() === true, 'the bridge initializes');
    ok(world.calls.indexOf('init') !== -1, 'SDK.init() is awaited (v3 requires it)');
    /* Nothing can reach the SDK before init() resolves - v3 forbids it.
       What matters is that the loading phase which began during boot is
       still delivered afterwards, rather than dropped on the floor. */
    ok(
      world.calls[0] === 'init' && world.calls[1] === 'loadingStart',
      'a loading phase begun before init() is still reported once init resolves'
    );

    world.liftVeil();
    await sleep(60);
    ok(world.calls.indexOf('loadingStop') !== -1, 'loadingStop fires when the boot veil lifts');

    world.view('battle');
    ok(world.calls.indexOf('gameplayStart') !== -1, 'entering a battle starts gameplay');
    world.view('home');
    ok(world.calls.indexOf('gameplayStop') !== -1, 'returning to a menu stops gameplay');
  }

  section('B. gameplay means PLAYING, not "the tab is open"');
  {
    const world = makeWorld({ mode: 'ok' });
    await sleep(60);
    const only = () => world.calls.filter((c) => c.indexOf('gameplay') === 0);

    ['battle', 'draft', 'prep'].forEach((v) => {
      const before = only().length;
      world.view('home');
      world.view(v);
      ok(only().length > before, v + ' counts as gameplay');
    });

    ['home', 'play', 'shop', 'collection', 'rulebook', 'campaign', 'chapter', 'deck'].forEach(
      (v) => {
        world.view('battle');
        const n = only().length;
        world.view(v);
        const added = only().slice(n);
        ok(added.length === 1 && added[0] === 'gameplayStop', v + ' is a break, not gameplay');
      }
    );
  }

  section('C. no duplicate start/stop pairs');
  {
    const world = makeWorld({ mode: 'ok' });
    await sleep(60);
    world.view('battle');
    world.view('battle');
    world.view('battle');
    const starts = world.calls.filter((c) => c === 'gameplayStart').length;
    ok(starts === 1, 'the same view repeated starts gameplay once, not three times');

    world.view('home');
    world.view('home');
    const stops = world.calls.filter((c) => c === 'gameplayStop').length;
    ok(stops === 1, 'repeated menu views stop gameplay once');

    world.liftVeil();
    await sleep(40);
    world.liftVeil();
    await sleep(20);
    ok(world.calls.filter((c) => c === 'loadingStop').length === 1, 'loadingStop is reported once');
  }

  section('C2. a slow SDK does not lose the state it missed');
  {
    /* The realistic failure this guards: the player is already deep in
       a battle by the time a slow CDN answers. If we only listened for
       FUTURE view changes, that battle would be measured as menu time -
       exactly the number Basic Launch judges the game on. */
    const world = makeWorld({ mode: 'ok' });
    world.view('battle'); // before init() has any chance to resolve
    ok(world.calls.length === 0, 'nothing is sent to an SDK that has not initialized');
    await sleep(60);
    ok(
      world.calls.indexOf('gameplayStart') !== -1,
      'a battle entered during SDK load is reported once the SDK arrives'
    );
    ok(world.calls.filter((c) => c === 'gameplayStart').length === 1, 'and reported exactly once');
  }
  {
    /* The mirror case: boot finished before the SDK did. An unmatched
       loadingStop would be worse than silence. */
    const world = makeWorld({ mode: 'ok' });
    world.liftVeil();
    await sleep(80);
    const starts = world.calls.filter((c) => c === 'loadingStart').length;
    const stops = world.calls.filter((c) => c === 'loadingStop').length;
    ok(stops <= starts, 'loadingStop is never sent without a matching loadingStart');
  }

  section('D. a dead SDK costs the player nothing');
  {
    const blocked = makeWorld({ mode: 'blocked' });
    await sleep(60);
    ok(blocked.api().isReady() === false, 'an ad-blocked SDK never reports ready');
    blocked.view('battle');
    blocked.liftVeil();
    await sleep(40);
    ok(blocked.calls.length === 0, 'and nothing is called into it');
    ok(typeof blocked.api().gameplayStart === 'function', 'the public surface still exists');

    const rejected = makeWorld({ mode: 'initRejects' });
    await sleep(60);
    ok(rejected.api().isReady() === false, 'a rejected init() is handled');
    rejected.view('battle');
    ok(
      rejected.calls.filter((c) => c !== 'init').length === 0,
      'a rejected init() blocks every later call'
    );

    const throwing = makeWorld({ mode: 'throws' });
    await sleep(60);
    let threw = false;
    try {
      throwing.view('battle');
      throwing.view('home');
      throwing.liftVeil();
      await sleep(40);
    } catch (e) {
      threw = true;
    }
    ok(!threw, 'an SDK that throws on every call cannot break the game');
  }

  section('D2. the portal can mute the game, and outranks the player');
  {
    /* A mute already set before the game finished loading must be
       honoured on arrival, not only on later changes. */
    const world = makeWorld({ mode: 'ok', settings: { muteAudio: true, disableChat: false } });
    await sleep(60);
    ok(world.audio.externalMute === true, 'a mute set before load is applied on init');
    ok(world.listeners() === 1, 'and a change listener is registered');
  }
  {
    const world = makeWorld({ mode: 'ok' });
    await sleep(60);
    ok(world.audio.externalMute === false, 'an unmuted portal leaves audio alone');
    world.portalSetMute(true);
    ok(world.audio.externalMute === true, 'the portal muting later is followed');
    world.portalSetMute(false);
    ok(world.audio.externalMute === false, 'and unmuting is followed too');
  }
  {
    /* The requirement in one assertion: the portal's mute is not a
       suggestion. It must survive the player pressing Unmute. */
    const world = makeWorld({ mode: 'ok', settings: { muteAudio: true, disableChat: false } });
    await sleep(60);
    const src = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
    ok(
      /function muted\(\)\s*\{[\s\S]{0,120}prefs\.muted \|\| externalMute/.test(src),
      'audio.js mutes when EITHER the player or the portal says so'
    );
    ok(
      /setMuted[\s\S]{0,400}if \(muted\(\)\) stopMusic/.test(src),
      'the in-game unmute cannot override the portal mute'
    );
    ok(
      !/persistPrefs[\s\S]{0,80}externalMute/.test(src),
      "the portal's mute is never written into the player's saved prefs"
    );
    ok(world.audio.playerMuted === false, "and never alters the player's own setting");
  }
  {
    /* Audio is a separate module that may be absent or broken; muting
       must never be able to take the game down with it. */
    const world = makeWorld({ mode: 'ok', noAudio: true });
    await sleep(60);
    ok(world.api().isReady() === true, 'a missing audio module does not break the bridge');
    let threw = false;
    try {
      world.portalSetMute(true);
    } catch (e) {
      threw = true;
    }
    ok(!threw, 'and a mute arriving with no audio module is survivable');

    const bad = makeWorld({ mode: 'ok', audioThrows: true });
    await sleep(60);
    let threw2 = false;
    try {
      bad.portalSetMute(true);
    } catch (e) {
      threw2 = true;
    }
    ok(!threw2, 'an audio module that throws cannot break the game');
  }

  section('D3. the real js/audio.js honours the priority rule');
  {
    /* Source patterns above prove the shape; this drives the ACTUAL
       audio module, because the rule only matters if it holds in the
       code that ships. */
    const adom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://games.crazygames.com/',
      runScripts: 'dangerously',
    });
    const aw = adom.window;
    aw.EOL = { platform: { sdk: true, isCrazyGames: true } };
    const t = aw.document.createElement('script');
    t.textContent = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
    aw.document.body.appendChild(t);
    const A = aw.EOL.audio;

    ok(A.isMuted() === false, 'starts unmuted');
    A.setExternalMute(true);
    ok(A.isMuted() === true, 'the portal mute silences the game');
    ok(A.getPrefs().muted === false, "the player's own preference is untouched");
    A.setMuted(false);
    ok(A.isMuted() === true, 'pressing Unmute in game CANNOT override the portal');
    A.setMuted(true);
    A.setExternalMute(false);
    ok(A.isMuted() === true, "releasing the portal mute respects the player's own mute");
    A.setMuted(false);
    ok(A.isMuted() === false, 'and the player is in control again afterwards');
    ok(
      (aw.localStorage.getItem('eol.audio.v1') || '').indexOf('external') === -1,
      "the portal's mute is never persisted"
    );
    aw.close();
  }

  section('D4. progress syncs to the CrazyGames account');
  {
    /* Guest played, then signed in: the account has nothing, so this
       device's save becomes its first. Nothing may be destroyed. */
    const world = makeWorld({
      mode: 'ok',
      local: { 'eol.wallet.v1': '1200', 'eol.owned.v1': '["a","b"]' },
      remoteSave: null,
    });
    await sleep(60);
    ok(world.remote()['eol.wallet.v1'] === '1200', 'an empty account adopts the local save');
    ok(world.remote()['eol.owned.v1'] === '["a","b"]', 'the whole snapshot goes up');
    ok(world.local('eol.wallet.v1') === '1200', 'and the device keeps playing its own save');
  }
  {
    /* Returning on a second device: the account is the only copy that
       survives a browser, so it wins and is written down locally. */
    const world = makeWorld({
      mode: 'ok',
      local: { 'eol.wallet.v1': '5' },
      remoteSave: { 'eol.wallet.v1': '9000', 'eol.owned.v1': '["x"]' },
    });
    await sleep(60);
    ok(world.local('eol.wallet.v1') === '9000', 'the account save is restored to the device');
    ok(world.local('eol.owned.v1') === '["x"]', 'every progress key is restored');
  }
  {
    /* Ongoing play must reach the account, debounced. */
    const world = makeWorld({ mode: 'ok', local: { 'eol.wallet.v1': '10' } });
    await sleep(60);
    world.setLocal('eol.wallet.v1', '75');
    world.w.document.dispatchEvent(new world.w.CustomEvent('eol:coins'));
    ok(world.remote()['eol.wallet.v1'] === '10', 'writes are debounced, not one-per-coin');
    await sleep(1500);
    ok(world.remote()['eol.wallet.v1'] === '75', 'and land after the debounce');
  }
  {
    /* Only the keys cloud.js calls progress - never the auth token. */
    const world = makeWorld({ mode: 'ok', local: { 'eol.wallet.v1': '1' } });
    world.setLocal('sb-ghchcvrojojrlbgqbvga-auth-token', 'SECRET');
    await sleep(60);
    world.w.document.dispatchEvent(new world.w.CustomEvent('eol:coins'));
    await sleep(1500);
    const keys = Object.keys(world.remote());
    ok(
      keys.every((k) => k.indexOf('eol.') === 0),
      'only eol.* progress keys are synced: ' + keys.join(',')
    );
    ok(
      keys.indexOf('sb-ghchcvrojojrlbgqbvga-auth-token') === -1,
      'the Supabase auth token is NEVER sent to the account'
    );
  }
  {
    /* The module can refuse (1MB cap, or not enabled on the form).
       The local save must survive that completely. */
    const world = makeWorld({
      mode: 'ok',
      local: { 'eol.wallet.v1': '1200' },
      dataThrows: true,
    });
    await sleep(60);
    ok(world.local('eol.wallet.v1') === '1200', 'a failing data module never harms the save');
    let threw = false;
    try {
      world.w.document.dispatchEvent(new world.w.CustomEvent('eol:coins'));
      await sleep(1500);
    } catch (e) {
      threw = true;
    }
    ok(!threw, 'and cannot throw into the game');
  }

  section('D5. exactly one cloud save is ever active');
  {
    const plat = fs.readFileSync(path.join(ROOT, 'js/platform.js'), 'utf8');
    ok(/cloudVault: !isCG/.test(plat), 'the Supabase vault is web-only');
    ok(/dataModule: isCG/.test(plat), 'the Data module is portal-only');

    const cloud = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8');
    ok(/cloudVault === false\) return;/.test(cloud), 'cloud.js refuses to run on the portal build');
    ok(
      /if \(P\.dataModule\)/.test(bridgeSrc),
      'the bridge only saves when the platform says it owns saving'
    );

    /* The bug this prevents: the portal's ANONYMOUS Supabase session
       is not an account - no email, no password, nothing to sign back
       into - so a save pushed to it could never be recovered, and
       every visitor would leave an orphan row behind. */
    const cdom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://games.crazygames.com/',
      runScripts: 'dangerously',
    });
    const cw = cdom.window;
    cw.localStorage.setItem('eol.wallet.v1', '1200');
    let upserts = 0;
    let authCb = null;
    cw.EOL = {
      platform: { id: 'crazygames', isCrazyGames: true, anonymousAuth: true, cloudVault: false },
      auth: {
        configured: () => true,
        rawClient: () => ({
          from: () => ({
            upsert() {
              upserts++;
              return Promise.resolve({ error: null });
            },
            select() {
              return {
                eq() {
                  return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
                },
              };
            },
          }),
        }),
        onChange(fn) {
          authCb = fn;
        },
        isAnonymous: () => true,
      },
      economy: { starterIds: () => ['s1'] },
    };
    const ct = cw.document.createElement('script');
    ct.textContent = fs.readFileSync(path.join(ROOT, 'js/cloud.js'), 'utf8');
    cw.document.body.appendChild(ct);
    cw.EOL.cloud.init();
    if (authCb) authCb({ id: 'anon-uuid' });
    await sleep(80);
    ok(upserts === 0, 'an anonymous portal session writes NOTHING to the Supabase vault');
    ok(cw.EOL.cloud.status() === 'off', 'and the vault reports itself off');
    cw.close();
  }

  section('D6. the portal owns the player identity');
  {
    const CG_USER = {
      __dangerousUserId: 'GAR5irLOPebfbol3QXww2WL1Ja61',
      username: 'SingingCheese.TLNU',
      profilePictureUrl: 'https://images.crazygames.com/userportal/avatars/4.png',
    };
    const world = makeWorld({ mode: 'ok', portalUser: CG_USER });
    await sleep(60);
    ok(world.identity.current !== null, 'a signed-in CrazyGames player is detected');
    ok(world.identity.current.username === 'SingingCheese.TLNU', 'their username is published');
    ok(
      world.identity.current.profilePictureUrl.indexOf('avatars/4.png') !== -1,
      'their avatar is published'
    );
    ok(world.authListeners() === 1, 'a login during play will be noticed');
    ok(world.calls.indexOf('showAuthPrompt') === -1, 'the auth prompt is NEVER opened by itself');
  }
  {
    /* A guest is a normal, supported state - not an error. */
    const world = makeWorld({ mode: 'ok', portalUser: null });
    await sleep(60);
    ok(world.identity.current === null, 'a guest publishes no identity');
    ok(world.api().isReady() === true, 'and the game runs perfectly well as a guest');
    ok(world.calls.indexOf('showAuthPrompt') === -1, 'still no auth prompt for guests');

    /* Logging in mid-session must be picked up. */
    world.portalLogin({ username: 'LaterLogin.AB12', profilePictureUrl: 'x.png' });
    ok(
      world.identity.current && world.identity.current.username === 'LaterLogin.AB12',
      'signing in during play updates the identity'
    );
  }
  {
    /* isUserAccountAvailable is false when embedded off-portal. */
    const world = makeWorld({ mode: 'ok', portalUser: {}, accountAvailable: false });
    await sleep(60);
    ok(world.calls.indexOf('getUser') === -1, 'no user calls when accounts are unavailable');
    ok(world.identity.calls === 0, 'and no identity is published');
  }
  {
    const world = makeWorld({ mode: 'ok', userThrows: true });
    await sleep(60);
    ok(world.identity.current === null, 'a failing getUser falls back to guest');
    const w2 = makeWorld({ mode: 'ok', portalUser: { username: 'x' }, noAuth: true });
    await sleep(60);
    ok(w2.api().isReady() === true, 'a missing auth module cannot break the bridge');
    const w3 = makeWorld({ mode: 'ok', portalUser: { username: 'x' }, authThrows: true });
    await sleep(60);
    ok(w3.api().isReady() === true, 'an auth module that throws cannot break the bridge');
  }
  {
    /* THE IDENTITY MUST NOT DEPEND ON SUPABASE.
       Inside the portal iframe the Supabase SDK often never loads at
       all (blocked CDN, no network), so there is no session. A
       CrazyGames player is still signed in, and an early
       `if (!session) return null` threw that away - the pill fell
       back to "Sign in" for a player who was already signed in. */
    const adom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://games.crazygames.com/',
      runScripts: 'dangerously',
    });
    const aw = adom.window;
    aw.EOL = { platform: { id: 'crazygames', isCrazyGames: true, canEditIdentity: false } };
    aw.EOL.supabaseConfig = { url: '', anonKey: '' }; // nothing to connect to
    const at = aw.document.createElement('script');
    at.textContent = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
    aw.document.body.appendChild(at);

    ok(aw.EOL.auth.user() === null, 'no session and no portal identity means no user');
    aw.EOL.auth.setPortalIdentity({ username: 'NoSupabase.9Q', profilePictureUrl: 'p.png' });
    const u = aw.EOL.auth.user();
    ok(!!u, 'a CrazyGames identity survives having NO Supabase session');
    ok(u && u.name === 'NoSupabase.9Q', 'and carries the portal username');
    ok(u && u.portal === true && u.anonymous === false, 'and is a real player, not a guest');
    aw.EOL.auth.setPortalIdentity(null);
    ok(aw.EOL.auth.user() === null, 'clearing the identity returns to signed-out');
    aw.close();
  }
  {
    /* THE SECURITY PROPERTY. __dangerousUserId is forgeable from the
       console; it must never be used to identify or authenticate. */
    ok(
      !/__dangerousUserId/.test(bridgeSrc) ||
        /never authenticate|forgeable|deliberately not touched/.test(bridgeSrc),
      '__dangerousUserId is not used as an identifier'
    );
    const auth = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
    /* Mentioning it in a warning comment is fine; READING it is not. */
    const authCode = auth.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(
      !/__dangerousUserId/.test(authCode),
      'auth.js never reads the dangerous id (comments aside)'
    );
    const bridgeCode = bridgeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    /* There IS a server now (supabase/functions/cg-auth), so the token
       is fetched - that is the whole point. What must stay true is how
       it is handled: obtained from the SDK, handed straight to the
       exchange, and never decoded or persisted in the client. */
    ok(/getUserToken\s*\(/.test(bridgeCode), 'the signed token IS fetched (it buys the account)');
    ok(
      !/atob\s*\(|JSON\.parse\s*\([^)]*token|jwtDecode|split\s*\(\s*['"]\.['"]\s*\)/.test(
        bridgeCode
      ),
      'the bridge never decodes the token client-side'
    );
    ok(
      !/localStorage[\s\S]{0,40}token|sessionStorage[\s\S]{0,40}token/i.test(bridgeCode),
      'the token is never stored'
    );
    const authCode2 = auth.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(
      !/atob\s*\(\s*token|jwtDecode/.test(authCode2),
      'auth.js never decodes the token either - the server verifies it'
    );
    /* The exchange must post to our own function, not anywhere else. */
    ok(
      /functions\/v1\/cg-auth/.test(authCode2),
      'the token goes to the cg-auth function for RS256 verification'
    );
    ok(
      /portalIdentity/.test(auth) && /display only|Display only/.test(auth),
      'the portal identity is documented as display-only'
    );
  }
  {
    /* The identity must reach the UI as a real user, not a guest. */
    const auth = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
    ok(/anonymous: false,\s*\n\s*portal: true/.test(auth), 'a portal player is not anonymous');
    const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    ok(/user && user\.portal/.test(app), 'app.js renders the CrazyGames name on the pill');
    ok(/data-portal-user/.test(app), 'and un-hides the label for it');
    const pcss = fs.readFileSync(path.join(ROOT, 'css/platform.css'), 'utf8');
    ok(
      /:not\(\[data-portal-user\]\) \.acct-btn \.acct-label/.test(pcss),
      'the CSS only hides the label while there is no portal identity'
    );
    ok(
      /acct-login|auth-modal/.test(pcss),
      'external sign-in controls stay hidden on the portal build'
    );
  }

  section('E. the web build never loads it');
  {
    const off = makeWorld({ sdk: false });
    await sleep(60);
    ok(off.w.EOL.crazygames === undefined, 'no public surface without platform.sdk');
    ok(off.calls.length === 0, 'no SDK calls at all');

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok(
      /platform\.sdk[\s\S]{0,160}crazygames-sdk\.js/.test(html),
      'index.html loads the bridge conditionally'
    );
    ok(
      html.indexOf('js/app.js') < html.indexOf('js/crazygames-sdk.js'),
      'the bridge loads AFTER the game, so a slow CDN cannot delay boot'
    );
    const plat = fs.readFileSync(path.join(ROOT, 'js/platform.js'), 'utf8');
    ok(/sdk: isCG/.test(plat), 'platform.js gates the bridge on the portal build');
  }

  section('F. scope is Basic Launch only');
  {
    const src = bridgeSrc;
    ok(!/requestAd|requestBanner|showBanner/.test(src), 'no ad calls (disabled in Basic Launch)');
    ok(!/getXsollaUserToken\(/.test(src), 'no purchase calls (Xsolla is invite-only)');
    ok(/sdk\.user/.test(src), 'the user module IS integrated (identity)');
    ok(/gameplayStart|gameplayStop/.test(src), 'gameplay timing IS integrated');
    ok(/loadingStart|loadingStop/.test(src), 'loading timing IS integrated');
    ok(/crazygames-sdk-v3\.js/.test(src), 'targets the v3 SDK');
    ok(
      /setTimeout[\s\S]{0,200}LOAD_TIMEOUT_MS|LOAD_TIMEOUT_MS/.test(src),
      'the load has a timeout'
    );
  }

  console.log('\n================================================================');
  if (fail === 0) console.log('\x1b[32mALL ' + pass + ' ASSERTIONS PASSED\x1b[0m');
  else console.log('\x1b[31m' + fail + ' FAILED\x1b[0m, ' + pass + ' passed');
  console.log('================================================================');
  process.exit(fail === 0 ? 0 : 1);
})();
