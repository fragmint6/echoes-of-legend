/* =============================================================
   PLATFORM BUILD REGRESSION
   node sim/verify_platform.js
   -------------------------------------------------------------
   One codebase ships to two destinations (js/platform.js). This
   proves BOTH of them, and the half that matters most is the web
   build: every assertion in section A exists to catch a portal
   change that quietly altered the public game.

   Covers:
     A. the web build is untouched - accounts, online modes, the
        Discord link, and the dev console all behave as before
     B. the portal build hides community links, the arena switch,
        and the account controls it cannot honour
     C. the Daily Puzzle keeps its server-enforced shared board on
        an anonymous session, and portal tabs NEVER take the 6:55
        generation lease
     D. an anonymous session never passes as an account
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

/* ---------------------------------------------------------------
   Boot js/platform.js in a page whose referrer we control, and read
   back the capability object exactly as the game would.
   --------------------------------------------------------------- */
const platformSrc = read('js/platform.js');

function bootPlatform({ referrer = '', search = '', host = 'fragmint6.web.app' } = {}) {
  /* runScripts lets the file execute exactly as the browser runs it -
     a real <script> in a real document, not an eval with a rebound
     scope. That is what makes the document.referrer path meaningful.

     `host` matters as much as the referrer: CrazyGames serves uploaded
     builds from *.game-files.crazygames.com AND frames them with a
     referrer policy that can strip document.referrer entirely. A
     harness that only ever varied the referrer could not see that
     case at all. */
  const dom = new JSDOM(
    '<!doctype html><html><body><script>' + platformSrc + '<\/script></body></html>',
    {
      url: 'https://' + host + '/echoes-of-legend/' + search,
      referrer: referrer || undefined,
      runScripts: 'dangerously',
    }
  );
  return dom.window;
}

section('A. the web build is unchanged');
{
  const w = bootPlatform();
  const p = w.EOL.platform;
  ok(p.id === 'web', 'a direct visit is the web build');
  ok(p.isCrazyGames === false, 'the web build is not the portal build');
  ok(p.canPlayOnline === true, 'online modes stay available');
  ok(p.canLinkOut === true, 'the Discord link stays');
  ok(p.canEditIdentity === true, 'players can still rename themselves');
  ok(p.devConsole === true, 'the owner console still loads');
  ok(p.anonymousAuth === false, 'the web build never signs in anonymously');
  ok(p.canForgeDaily === true, 'the web build still forges the shared Daily');
  ok(w.document.body.dataset.platform === 'web', "body[data-platform] reads 'web'");

  const embedded = bootPlatform({ referrer: 'https://itch.io/games' });
  ok(
    embedded.EOL.platform.id === 'web',
    'an unrecognised embedder is NOT assumed to be the portal'
  );
}

section('B. the portal build is detected and stripped');
{
  const hosts = [
    'https://www.crazygames.com/game/echoes-of-legend',
    'https://crazygames.com/game/echoes-of-legend',
    'https://de.crazygames.com/spiel/echoes',
    'https://developer.crazygames.com/qa-tool',
  ];
  hosts.forEach((h) => {
    ok(bootPlatform({ referrer: h }).EOL.platform.isCrazyGames, 'detected from ' + h);
  });
  ok(
    bootPlatform({ referrer: 'https://notcrazygames.com/' }).EOL.platform.id === 'web',
    'a lookalike hostname does NOT match'
  );

  /* THE UPLOADED BUILD, WITH NO REFERRER.
     CrazyGames hosts uploaded games on *.game-files.crazygames.com and
     frames them with a referrer policy that strips document.referrer
     cross-origin. Detection used to rest on the referrer alone, so the
     real portal build fell through to 'web': the SDK bridge was never
     injected (their QA panel showed "SDK not currently detected"), no
     CrazyGames account was minted, multiplayer stayed locked, and the
     Supabase vault wrongly took over progress. The document's own
     hostname is the signal that cannot be stripped. */
  const uploaded = bootPlatform({
    host: 'echoes-of-legend.game-files.crazygames.com',
  }).EOL.platform;
  ok(uploaded.id === 'crazygames', 'an uploaded build with NO referrer is still the portal build');
  ok(uploaded.sdk === true, 'so the SDK bridge is injected and can init');
  ok(uploaded.cloudVault === false, 'and the Supabase vault stays off the portal build');
  ok(uploaded.dataModule === true, 'progress belongs to the CrazyGames Data module');

  ok(
    bootPlatform({ host: 'crazygames.com.evil.net' }).EOL.platform.id === 'web',
    'a suffix-spoofed hostname does NOT match'
  );
  ok(
    bootPlatform({ host: 'echoesoflegend.example.com' }).EOL.platform.id === 'web',
    'a self-hosted build on its own domain is still the web build'
  );
  ok(
    bootPlatform({ search: '?platform=crazygames' }).EOL.platform.isCrazyGames,
    '?platform=crazygames forces the portal build for local testing'
  );
  ok(
    bootPlatform({ referrer: 'https://www.crazygames.com/', search: '?platform=web' }).EOL.platform
      .id === 'web',
    '?platform=web forces the web build back'
  );

  const p = bootPlatform({ referrer: 'https://www.crazygames.com/' }).EOL.platform;
  /* Online play is ON for the portal build now that a CrazyGames
     login buys a real account (js/auth.js signInWithCrazyGames).
     Whether a given PLAYER may queue is a session question, and
     js/mp.js answers it by refusing anonymous sessions. */
  ok(p.canPlayOnline === true, 'online modes are available on the portal build');
  ok(p.canLinkOut === false, 'community links are off');
  ok(p.canEditIdentity === false, 'identity editing is off');
  ok(p.devConsole === false, 'the owner console is off');
  ok(p.anonymousAuth === true, 'anonymous sessions are on');
  ok(p.canForgeDaily === false, 'puzzle generation is off');
}

section('C. the hidden controls are actually hidden');
{
  const css = read('css/platform.css');
  const sel = (s) => css.includes(s);
  ok(sel('[data-community]'), 'community links are hidden by one tag rule');

  /* EVERY off-site link must carry the tag. The feedback panel's
     "Open Discord" fallback shares no classes with the corner button,
     so a class-based rule silently missed it. */
  const pageDom = new JSDOM(read('index.html'));
  const pageDoc = pageDom.window.document;
  const offsite = [...pageDoc.querySelectorAll('a[href*="discord.gg"]')];
  ok(offsite.length >= 2, 'both Discord links are still present in the web build');
  ok(
    offsite.every((a) => a.hasAttribute('data-community')),
    'every off-site Discord link is tagged [data-community]'
  );
  /* The arena switch and the multiplayer carousel are NO LONGER
     hidden: a CrazyGames account can queue. A portal guest sees
     exactly what a signed-out web player sees - the switch, the lock
     badge, and a login offer. Assert the rules are GONE, so nobody
     reinstates them by habit. */
  ok(!sel('#play-tabs'), 'the Singleplayer/Multiplayer switch is NOT hidden any more');
  ok(!sel('#mode-carousel-mp'), 'the multiplayer carousel is NOT hidden any more');
  ok(
    !css.includes('#mode-carousel-solo,\n') || css.includes('#mode-carousel-solo {'),
    'the SINGLEPLAYER carousel is never hidden'
  );
  ok(sel('#acct-logout'), 'log out is hidden');
  ok(sel('#auth-modal'), 'the sign-in modal is hidden');
  ok(
    css.split('\n').filter((l) => l.includes('mode-card') && l.includes('crazygames')).length === 0,
    'individual mode cards are NOT hidden (that would break carousel dots)'
  );

  const html = read('index.html');
  ok(
    html.indexOf('js/platform.js') < html.indexOf('data/_schema.js'),
    'platform.js loads before every module that reads it'
  );
  ok(
    html.includes('css/platform.css') &&
      html.indexOf('css/platform.css') > html.indexOf('css/style.css'),
    'platform.css loads last so it wins on equal specificity'
  );
  ok(
    /platform\.devConsole/.test(html) && html.includes('document.write(\'<script src="js/dev.js"'),
    'js/dev.js is loaded conditionally, not unconditionally'
  );
}

section('D. the Daily Puzzle keeps its server-enforced rules');
{
  const daily = read('js/daily.js');
  ok(/function canForgeDaily/.test(daily), 'daily.js asks the platform whether it may forge');
  const forge = daily.slice(daily.indexOf('function maybeForgeShared'));
  ok(
    forge.indexOf('canForgeDaily()') < forge.indexOf('claim_daily_generation'),
    'the forge guard runs BEFORE the generation lease is claimed'
  );
  ok(
    /function armGenerationClock\(\)[\s\S]{0,400}?canForgeDaily\(\)/.test(daily),
    'the 6:55 alarm is never armed on a build that cannot forge'
  );
  ok(
    daily.includes('startOfficial') && !/dailyMode/.test(daily),
    'the portal build still runs the OFFICIAL shared puzzle, not the random lab forge'
  );

  const auth = read('js/auth.js');
  ok(/signInAnonymously/.test(auth), 'auth.js can create an anonymous session');
  ok(
    /wantsAnonymous[\s\S]{0,200}anonymousAuth/.test(auth),
    'anonymous sign-in is gated on the platform flag'
  );
  ok(
    /sessionIsAnonymous[\s\S]{0,300}is_anonymous/.test(auth),
    'anonymous sessions are identified by is_anonymous'
  );
  ok(
    /function ensureProfile[\s\S]{0,400}sessionIsAnonymous\(\)/.test(auth),
    'anonymous sessions do not litter the profiles table'
  );
  ok(
    /function needsHandle[\s\S]{0,300}sessionIsAnonymous\(\)/.test(auth),
    'anonymous sessions are never nagged for a callsign'
  );
}

section('E. an anonymous session is not an account');
{
  /* These used to grep js/mp.js for a substring within N characters
     of `available:`, which broke the moment the comment above it grew.
     Run the real function instead - it is the behaviour that matters,
     not how close two tokens sit in the source. */
  const mpSrc = read('js/mp.js');
  const mpAvailable = (auth, platform) => {
    const w = bootPlatform({ referrer: 'https://www.crazygames.com/' });
    w.EOL.auth = auth;
    if (platform) Object.assign(w.EOL.platform, platform);
    /* eval inside the same window the platform flag was booted in, so
       js/mp.js sees the real window.EOL it expects. */
    w.eval(mpSrc);
    return w.EOL.mp.available();
  };

  const anonAuth = {
    isReady: () => true,
    rawClient: () => ({}),
    isAnonymous: () => true,
    user: () => ({ id: 'anon' }),
  };
  const acctAuth = {
    isReady: () => true,
    rawClient: () => ({}),
    isAnonymous: () => false,
    user: () => ({ id: 'real' }),
  };

  ok(mpAvailable(anonAuth) === false, 'multiplayer reports unavailable for an anonymous session');
  ok(
    mpAvailable(acctAuth, { canPlayOnline: false }) === false,
    'canPlayOnline === false still forces multiplayer off'
  );
  ok(
    mpAvailable(acctAuth) === true,
    'a real (CrazyGames-backed) account CAN queue on the portal build'
  );

  const play = read('js/play.js');
  /* The guard must sit inside initMultiplayer and bail BEFORE the tab
     listeners are bound - measure the real slice rather than guessing a
     character window. */
  const initMP = play.slice(
    play.indexOf('function initMultiplayer'),
    play.indexOf('/* tab switching */')
  );
  ok(
    initMP.includes('canPlayOnline') && /return;\s*}/.test(initMP),
    'initMultiplayer pins the solo arena and binds nothing else'
  );
  ok(
    /canPlayOnline[\s\S]{0,600}tabIndex = -1/.test(play),
    'the hidden arena tab is unreachable by keyboard'
  );

  const campaign = read('js/campaign.js');
  ok(
    /canFlip[\s\S]{0,200}canPlayOnline/.test(campaign),
    'the tutorial wayfinder never points at a hidden arena tab'
  );

  const app = read('js/app.js');
  ok(/user && user\.anonymous/.test(app), 'the account pill has a distinct anonymous state');

  /* GUI SCALE. The portal inset is smaller than a browser window, so
     the portal build defaults to 80% - as a DEFAULT, never an
     override: a stored value must still win. */
  ok(
    /isCrazyGames \? 80 : SCALE_DEF/.test(app),
    'the portal build defaults the GUI scale to 80%'
  );
  ok(
    /applyScale\(def\)/.test(app),
    'and "reset" returns to that default rather than always 100%'
  );

  /* The guest-save notice must survive on the portal - a player still
     needs telling their progress is local - but it must not act like a
     button, including for keyboard users. */
  ok(
    /isCrazyGames[\s\S]{0,200}tabindex', '-1'[\s\S]{0,120}aria-disabled/.test(app),
    'the portal guest-save notice is inert for keyboard and AT users too'
  );

  const platformCss = read('css/platform.css');
  ok(
    /#set-account\s*\{[\s\S]{0,80}display: none/.test(platformCss),
    'Settings > Account is hidden on the portal build'
  );
  ok(
    /:not\(\[data-portal-user\]\) \.home-cloud-cta \{[\s\S]{0,120}pointer-events: none/.test(
      platformCss
    ),
    'the save notice is shown but not clickable for a portal guest'
  );
  ok(
    /\[data-portal-user\] \.home-cloud-cta \{[\s\S]{0,80}display: none/.test(platformCss),
    'and disappears entirely once signed in on CrazyGames'
  );
  ok(
    /:not\(\[data-portal-user\]\) \.acct-btn \{[\s\S]{0,160}border-radius: 50%/.test(platformCss),
    'a signed-out portal player gets a plain settings button, not a hollow profile pill'
  );

  /* ---- GOOGLE SIGN-IN IS A POPUP ---------------------------------
     A full-page redirect tore down the running game to sign in. The
     popup must be opened synchronously inside the click (or the
     browser blocks it), must survive being blocked, and the relay in
     index.html must never disturb an ordinary page load. */
  const auth = read('js/auth.js');
  ok(
    /window\.open\('', 'eol-oauth'/.test(auth),
    'Google sign-in opens a popup rather than navigating the game away'
  );
  ok(
    auth.indexOf("window.open('', 'eol-oauth'") <
      auth.indexOf('skipBrowserRedirect: true'),
    'the popup is opened BEFORE awaiting the provider URL, so it is not treated as unrequested'
  );
  ok(
    /if \(!popup \|\| popup\.closed\)[\s\S]{0,320}signInWithOAuth/.test(auth),
    'a blocked popup falls back to the old full-page redirect instead of failing'
  );
  ok(
    /ev\.origin !== origin/.test(auth),
    'the opener only accepts an OAuth message from its own origin'
  );
  ok(
    /exchangeCodeForSession/.test(auth) && /setSession/.test(auth),
    'both the PKCE code and implicit-token shapes are handled'
  );
  ok(
    /gone = !popup \|\| popup\.closed/.test(auth) &&
      /Google sign-in was cancelled/.test(auth),
    'closing the popup rejects instead of leaving the modal spinning forever'
  );
  ok(
    /getSession\(\)[\s\S]{0,400}Google sign-in was cancelled/.test(auth),
    'but a session that landed as the popup closed is still honoured, not called a cancel'
  );

  const page = read('index.html');
  ok(
    page.indexOf("window.name !== 'eol-oauth'") < page.indexOf('js/platform.js'),
    'the OAuth relay runs before any game module loads'
  );
  /* The guard used to be `name !== 'eol-oauth' || !window.opener`, but
     the second half was wrong: COOP nulls window.opener inside the
     popup, so a real OAuth return bailed out and the sign-in hung. The
     REQUIREMENT is only that an ordinary page load is untouched, which
     the window.name check alone already guarantees - plus the `if
     (!msg) return` for a named window carrying no OAuth parameters. */
  ok(
    /if \(window\.name !== 'eol-oauth'\) return;/.test(page),
    'and does nothing at all in a normal (non-popup) page load'
  );
  ok(
    /if \(!msg\) return; \/\* not an OAuth return/.test(page),
    'a named window with no OAuth result still boots the game normally'
  );
  ok(
    /postMessage\(msg, window\.location\.origin\)/.test(page),
    'the relay posts to its own origin, never a wildcard'
  );

  /* ---- THE AUTH MODAL IS NOT CRAMPED ------------------------------
     The footnote used to sit between the header and the tabs, so a
     two-line message squeezed the tabs, Google button and fields
     together. It belongs at the bottom, like every other modal. */
  const authCard = page.slice(page.indexOf('id="auth-modal"'), page.indexOf('id="settings-modal"'));
  ok(
    authCard.indexOf('id="auth-foot"') > authCard.indexOf('id="auth-form"'),
    'the sign-in footnote sits below the form, not wedged into the header'
  );

  /* ---- GOOGLE SIGN-IN SURVIVES COOP -------------------------------
     Reported: "Google sign in gets randomly canceled sometimes:
     Cross-Origin-Opener-Policy policy would block the window.closed
     call."

     Navigating the popup to the provider can put it in a different
     browsing-context group. After that `popup.closed` returns TRUE for
     a window that is still open, and `window.opener` is null inside the
     popup. The old code trusted both, so it rejected a perfectly good
     sign-in about half a second in. */
  const authSrc = read('js/auth.js');
  ok(
    /liesAboutClosed/.test(authSrc),
    'a popup that reads closed immediately is treated as a COOP artefact'
  );
  ok(
    /BroadcastChannel\('eol-oauth'\)/.test(authSrc),
    'the opener listens on BroadcastChannel, which COOP cannot sever'
  );
  ok(
    /ev\.key !== 'eol:oauth:relay'/.test(authSrc),
    'the opener also listens for the localStorage relay'
  );
  ok(
    /if \(\+\+strikes < 3\) return;/.test(authSrc),
    'a closed reading is confirmed over several ticks before giving up'
  );
  ok(
    /BroadcastChannel\('eol-oauth'\)/.test(page),
    'the popup relay posts on BroadcastChannel'
  );
  ok(
    /eol:oauth:relay/.test(page),
    'the popup relay also writes the result to localStorage'
  );
  ok(
    !/window\.name !== 'eol-oauth' \|\| !window\.opener/.test(page),
    'the relay no longer gives up when COOP has nulled window.opener'
  );

  /* ---- CRAZYGAMES MULTIPLAYER REQUIREMENTS ------------------------
     These are not preferences. A game that does not report room data,
     offer an invite link/button, and honour isInstantMultiplayer is
     REJECTED from the CrazyGames Multiplayer category, so each of
     these is a release blocker and belongs in the permanent suite. */
  const sdkSrc = read('js/crazygames-sdk.js');
  const mpRoomSrc = read('js/mp.js');

  ok(/updateRoom/.test(sdkSrc), 'the SDK bridge exposes updateRoom (Room Data)');
  ok(/leftRoom/.test(sdkSrc), 'the SDK bridge exposes leftRoom');
  ok(/inviteLink/.test(sdkSrc), 'the SDK bridge exposes inviteLink');
  ok(/showInviteButton/.test(sdkSrc), 'the SDK bridge exposes showInviteButton');
  ok(/hideInviteButton/.test(sdkSrc), 'the SDK bridge exposes hideInviteButton');
  ok(
    /isInstantMultiplayer/.test(sdkSrc),
    'the SDK bridge reads isInstantMultiplayer'
  );
  ok(
    /addJoinRoomListener/.test(sdkSrc),
    'the SDK bridge registers a join-room listener (no reload on invite)'
  );
  ok(
    /isInstantJoin/.test(sdkSrc),
    'the deprecated isInstantJoin alias is still read for older embeds'
  );

  /* Every new room/invite method must be reachable from the public
     surface, otherwise mp.js silently no-ops on the portal. */
  const publicBlock = sdkSrc.slice(sdkSrc.indexOf('window.EOL.crazygames = {'));
  ['updateRoom', 'leftRoom', 'inviteLink', 'showInviteButton', 'hideInviteButton',
   'onJoinRoom', 'isInstantMultiplayer', 'inviteParam'].forEach((m) => {
    ok(
      new RegExp('\\n\\s*' + m + ':').test(publicBlock),
      m + ' is exported on window.EOL.crazygames'
    );
  });

  ok(
    /reportRoom\(/.test(mpRoomSrc),
    'mp.js reports room state to the portal from one place'
  );
  ok(
    /isJoinable/.test(mpRoomSrc),
    'mp.js reports an isJoinable flag'
  );
  ok(
    /function bootstrap\(/.test(mpRoomSrc),
    'mp.js has a bootstrap() covering the invite/instant entry paths'
  );

  /* ---- PRIVATE ROOMS ---------------------------------------------
     The party leader owns the settings, and that must be enforced by
     the SERVER - a UI-only rule is not a rule. */
  const mig = read('docs/supabase-migration-11.sql');
  ok(/create table if not exists public\.mp_rooms/.test(mig), 'migration 11 creates mp_rooms');
  ['create_room', 'join_room', 'set_room_settings', 'start_room', 'leave_room'].forEach((fn) => {
    ok(
      new RegExp('function public\\.' + fn + '\\(').test(mig),
      'migration 11 defines ' + fn + '()'
    );
  });
  ok(
    /not the party leader/.test(mig),
    'the server rejects a non-leader changing settings'
  );
  ok(
    /and leader = me/.test(mig),
    'set_room_settings is filtered on the leader, not just checked in the UI'
  );
  ok(/enable row level security/.test(mig), 'mp_rooms has RLS enabled');

  /* the room UI */
  const roomDoc = new JSDOM(page).window.document;
  ok(!!roomDoc.getElementById('room-modal'), 'the private-room modal exists');
  ok(!!roomDoc.getElementById('mode-mp-room'), 'a Private Room mode card exists');
  ok(
    roomDoc.getElementById('room-modal').hasAttribute('hidden'),
    'the private-room modal starts hidden'
  );
  ok(
    roomDoc.getElementById('room-start').hasAttribute('disabled'),
    'Start match is disabled until someone joins'
  );

  /* ---- FIXED-SIZE TILES -------------------------------------------
     `1fr` floors a track at min-content, so a long unbreakable name
     (Rumpelstiltskin) widened its own tile and shrank its neighbours.
     Every card grid must use minmax(0, 1fr). */
  const styleCss = read('css/style.css');
  ['.deck-slots', '.dp-slots', '.deck-slots-12', '.field-slots'].forEach((sel) => {
    const i = styleCss.indexOf('\n' + sel + ' {');
    const rule = i < 0 ? '' : styleCss.slice(i, styleCss.indexOf('}', i));
    const cols = (rule.match(/grid-template-columns:([^;]*);/) || [, ''])[1];
    ok(
      /minmax\(\s*0/.test(cols),
      sel + ' uses minmax(0, 1fr) so one long name cannot stretch a tile'
    );
  });
  ['.deck-slot', '.dp-slot', '.field-slot'].forEach((sel) => {
    const i = styleCss.indexOf('\n' + sel + ' {');
    const rule = i < 0 ? '' : styleCss.slice(i, styleCss.indexOf('}', i));
    ok(/min-width:\s*0/.test(rule), sel + ' carries min-width:0 so it cannot overflow its track');
  });

  /* ---- THE DAMAGE BREAKDOWN ---------------------------------------
     The hover must show HOW the number was reached. */
  const engineSrc = read('js/engine.js');
  const battleSrc = read('js/battle.js');
  ok(/hits: hits/.test(engineSrc), 'previewDamage returns the per-hit arithmetic');
  ok(
    /st\.push\(\{ k: 'atk'/.test(engineSrc),
    'the breakdown starts from the attacker\u2019s Attack'
  );
  ok(/k: 'def'/.test(engineSrc), 'the breakdown records the defence reduction');
  ok(/dmgBreakdownHTML/.test(battleSrc), 'the damage chip renders a breakdown panel');
  ok(
    /pointer-events: auto/.test(
      styleCss.slice(styleCss.indexOf('.dmg-preview {'), styleCss.indexOf('.dmg-preview i {'))
    ),
    'the damage chip is hoverable so the breakdown can be read'
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
