/* =============================================================
   Echoes of Legend - LEAVE-MATCH GUARD
   -------------------------------------------------------------
   Browser test. Requires puppeteer and a local server:
     cd /tmp && npm install puppeteer --no-audit --no-fund
     python3 -m http.server 8777    (from the project root)
     node sim/browser_quit_guard.js

   Leaving a ranked match forfeits it, so the exit has to be
   guarded - AND the guard must stay quiet everywhere else. A
   warning that fires on every page close gets muscle-memoried away
   and protects nothing, so "does not nag" is tested as carefully as
   "does warn".

   Covers: singleplayer silence, live-match warning, the in-app
   confirmation, cancelling it, confirming it, and a DECIDED match
   not warning on the result screen.

   A note for anyone editing this: you cannot observe a synthetic
   beforeunload. A plain Event reports defaultPrevented:true with no
   listener at all, and its returnValue is not the settable
   BeforeUnloadEvent property, so the handler's write is discarded.
   A real navigation destroys the page mid-test. The guard's
   DECISION is therefore what gets asserted, via
   window.EOL.__wouldForfeitOnExit - the exact predicate the handler
   branches on.
   ============================================================= */
const puppeteer = require('/tmp/node_modules/puppeteer');
const CHROME = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--blink-settings=primaryHoverType=2,availableHoverTypes=2'],
  });
  const p = await br.newPage();
  await p.setViewport({ width: 1600, height: 950 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  await p.goto(process.env.EOL_URL || 'http://localhost:8777/index.html', {
    waitUntil: 'networkidle0',
  });
  await p.evaluate(() => {
    try {
      localStorage.setItem(
        'eol.coach.v1',
        JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle'])
      );
    } catch (e) {}
  });
  await p.reload({ waitUntil: 'networkidle0' });
  let f = 0;
  const t = (ok, m) => {
    if (!ok) f++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + m);
  };

  /* probe beforeunload without actually closing */
  /* The guard's DECISION is the testable unit. A synthetic
    beforeunload cannot be observed (its returnValue is not the
    settable BeforeUnloadEvent property) and a real navigation
    destroys the page mid-test. window.EOL.__wouldForfeitOnExit is
    the exact predicate the handler branches on. */
  const probe = () => p.evaluate(() => window.EOL.__wouldForfeitOnExit());

  // 1. singleplayer battle -> NO warning
  await p.evaluate(() => {
    const fl = window.EOL.play._flat();
    window.EOL.ui.show('battle');
    window.EOL.battle.start({ teams: { player: fl.slice(0, 6), enemy: fl.slice(6, 12) } });
  });
  await sleep(2500);
  t(!(await probe()), 'singleplayer battle does NOT warn on close');

  // 2. ranked match -> warns
  await p.evaluate(() => {
    const fl = window.EOL.play._flat();
    window.EOL.netplay.begin({
      id: '11111111-1111-1111-1111-111111111111',
      seed: 1,
      host: true,
      oppName: 'X',
    });
    window.EOL.ui.show('battle');
    window.EOL.battle.start({
      teams: { player: fl.slice(0, 6), enemy: fl.slice(6, 12) },
      net: window.EOL.netplay.controller(() => {}),
    });
  });
  await sleep(2500);
  t(await probe(), 'live ranked match DOES warn on close');

  // 3. in-app exit shows our modal instead of leaving silently
  await p.evaluate(() => window.EOL.ui.show('prep'));
  await sleep(200);
  const shown = await p.evaluate(async () => {
    document.getElementById('btn-prep-back').click();
    await new Promise((r) => setTimeout(r, 250));
    const m = document.getElementById('quit-modal');
    return {
      open: !m.hidden,
      body: (document.getElementById('quit-body') || {}).textContent || '',
      view: document.body.dataset.view,
    };
  });
  t(shown.open, 'in-app exit opens the confirmation instead of leaving');
  t(
    /forfeit/i.test(shown.body),
    'the modal states the consequence: "' + shown.body.trim().slice(0, 58) + '..."'
  );
  t(shown.view === 'prep', 'and does not navigate away until confirmed');

  // 4. "keep playing" cancels
  await p.evaluate(() => document.getElementById('quit-stay').click());
  await sleep(250);
  const stayed = await p.evaluate(() => ({
    hidden: document.getElementById('quit-modal').hidden,
    active: window.EOL.netplay.active(),
  }));
  t(stayed.hidden && stayed.active, '"Keep playing" closes the modal and keeps the match alive');

  // 5. confirming forfeits and leaves
  await p.evaluate(() => document.getElementById('btn-prep-back').click());
  await sleep(250);
  await p.evaluate(() => document.getElementById('quit-go').click());
  await sleep(600);
  const left = await p.evaluate(() => ({
    active: window.EOL.netplay.active(),
    view: document.body.dataset.view,
  }));
  t(!left.active, 'confirming ends the match session');
  t(left.view === 'play', 'and returns to the menu');
  t(!(await probe()), 'no longer warns once the match is over');

  // 6. a FINISHED match must not nag on the result screen
  await p.evaluate(() => {
    const fl = window.EOL.play._flat();
    window.EOL.netplay.begin({
      id: '22222222-2222-2222-2222-222222222222',
      seed: 1,
      host: true,
      oppName: 'X',
    });
    const c = window.EOL.netplay.controller(() => {});
    window.EOL.ui.show('battle');
    window.EOL.battle.start({ teams: { player: fl.slice(0, 6), enemy: fl.slice(6, 12) }, net: c });
  });
  await sleep(2500);
  /* End it through a REAL path (forfeit -> endBattle), not by poking
    B.over directly - endBattle is what retires the session, and
    bypassing it tests nothing that can actually happen in a game. */
  await p.evaluate(() => document.getElementById('btn-forfeit').click());
  await sleep(200);
  await p.evaluate(() => document.getElementById('btn-forfeit').click());
  await sleep(6000);
  const done = await p.evaluate(() => ({
    over: window.EOL.battle.getState().over,
    active: window.EOL.netplay.active(),
  }));
  t(done.over, 'the match reached a result');
  t(!done.active, 'the session is retired once the battle ends');
  t(!(await probe()), 'a DECIDED match does not warn on the result screen');

  t(errs.length === 0, 'no console/page errors (' + errs.length + ')');
  errs.slice(0, 4).forEach((e) => console.log('    ' + e));
  console.log(f ? '\n===== ' + f + ' FAILED =====' : '\n===== ALL PASSED =====');
  await br.close();
  process.exit(f ? 1 : 0);
})();
