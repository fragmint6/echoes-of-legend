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
    ok(!/SDK\.user|getXsollaUserToken\(/.test(src), 'no user/purchase calls (Full Launch work)');
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
