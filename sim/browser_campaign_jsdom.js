/* =============================================================
   CAMPAIGN BROWSER FLOW - jsdom end-to-end regression
   -------------------------------------------------------------
   Drives the campaign through a REAL DOM: the chapter map, the
   bottom dialogue bar, the fully scripted Gate I (shielded tutor
   beats, scripted bans with golden marks, ordered fielding with
   role lessons, the arena + tip-dot beats, and the ENTIRE frozen
   match line played click by click), the result -> epilogue ->
   map loop, the campaign-locked deck picker (no war-length
   toggle), the authored set at Gate V, and the frozen draft pool
   at Gate VI - plus a DOM-wide mojibake sweep.

   Requires jsdom (not vendored):
     cd /tmp && npm install jsdom --no-audit --no-fund
   Then: node sim/browser_campaign_jsdom.js

   (The sibling browser_*.js tests use puppeteer; this one uses
   jsdom so it can run where Chrome downloads are blocked.)
   ============================================================= */
'use strict';

let JSDOM;
try {
  ({ JSDOM } = require('/tmp/node_modules/jsdom'));
} catch (e) {
  try {
    ({ JSDOM } = require('jsdom'));
  } catch (e2) {
    console.error('jsdom not found. Install it first:  cd /tmp && npm install jsdom');
    process.exit(2);
  }
}
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '..');
const html = fs
  .readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script src="https:[^"]+"><\/script>/g, '')
  .replace(/<link[^>]+href="https:[^"]*"[^>]*>/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const t = (ok, msg) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + msg);
  if (!ok) fails++;
};
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  try {
    const buf = req.url === '/' ? Buffer.from(html) : fs.readFileSync(file);
    res.writeHead(200, { 'content-type': req.url === '/' ? 'text/html' : 'text/javascript' });
    res.end(buf);
  } catch (e) {
    res.writeHead(404);
    res.end();
  }
});

(async () => {
  await new Promise((r) => server.listen(8099, r));
  const dom = await JSDOM.fromURL('http://127.0.0.1:8099/', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = (q) => ({
        matches: false,
        media: q,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
      });
      window.scrollTo = () => {};
      window.HTMLCanvasElement.prototype.getContext = () => null;
      window.__errs = [];
      window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
    },
  });
  await sleep(3500);
  const w = dom.window,
    d = w.document;
  const $ = (id) => d.getElementById(id);
  w.localStorage.setItem('eol.coach.v1', JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle']));
  d.body.dataset.gfx = 'low';

  /* ---------- FIRST BOOT: the Recruiter interrupts the menu ---------- */
  t(d.body.dataset.view === 'home', 'boot lands on home');
  // the intro fires 2.1s after campaign.js runs, and jsdom loads the
  // script chain slowly - poll for it instead of guessing the moment
  for (let g = 0; g < 40 && $('chapter-dialogue').hidden; g++) await sleep(300);
  t(!$('chapter-dialogue').hidden, 'first-boot intro auto-opens on a fresh save');
  t($('chapter-dialogue-speaker').textContent === 'The Recruiter', 'the Recruiter does the interrupting');
  t(w.localStorage.getItem('eol.tutorial.intro.v1') === '1', 'intro marked seen the moment it runs');
  // skipping with X still walks you to the Road - it is a flow, not a scene
  $('chapter-dialogue-close').click();
  await sleep(1600);
  t(d.body.dataset.view === 'chapter', 'skipping the intro STILL lands on the chapter map');
  t(!$('chapter-dialogue').hidden, 'and Gate I opens its dialogue unprompted');
  t($('chapter-dialogue-step').textContent.indexOf('01') === 0, 'gate 1 scene starts at line one');
  t(!$('chapter-dialogue-portrait').hidden && $('chapter-dialogue-glyph').hidden, 'portrait clean (no glyph overlay)');
  for (let i = 0; i < 8 && !$('chapter-dialogue').hidden; i++) {
    $('chapter-dialogue-next').click();
    await sleep(50);
  }
  await sleep(900);
  t(!$('deck-modal').classList.contains('show'), 'no deck picker on the scripted gate');
  t(d.body.dataset.view === 'prep', 'prep opens directly');
  const prep = w.EOL.play._prepState();
  t(!!prep.script && prep.script.match && prep.script.match.moves.length === 41, 'the 41-move line is loaded in prep');
  await sleep(400);
  t(!$('tutor').hidden && !$('tutor-next').hidden, 'tutor intro with Continue');
  t(!$('tutor-shield').hidden, 'info beat raises the soft dim shield');
  $('tutor-next').click();
  await sleep(320);
  $('tutor-next').click();
  await sleep(320);
  t($('tutor-shield').hidden, 'action beat drops the shield');
  d.querySelector('#prep-enemy .prep-c[data-cid="grimmwood-rumpelstiltskin"]').click();
  await sleep(280);
  d.querySelector('#prep-enemy .prep-c[data-cid="grimmwood-evil-queen"]').click();
  await sleep(280);
  t(w.EOL.play._prepState().youBans.length === 2, 'both scripted bans placed');
  $('prep-confirm-main').click();
  await sleep(600);
  const pr = w.EOL.play._prepState();
  t(pr.phase === 'ban' && pr.revealed, 'reveal hold is running');
  t(!$('tutor').hidden && $('tutor-next').hidden, 'reveal narrated ungated during the hold');
  t($('tutor-text').textContent.indexOf('candle-children') >= 0, 'narration names his bans while the stamps show');
  await sleep(3200);
  t(w.EOL.play._prepState().phase === 'pick', 'pick phase opens after the long hold');
  await sleep(500);
  t($('bf-reveal').classList.contains('show'), 'battlefield card is up');
  t(!$('tutor').hidden && !$('tutor-next').hidden, 'arena lesson shows while the card is up');
  t($('tutor-text').textContent.indexOf('ARENA') >= 0, 'arena beat text');
  t($('tutor-shield').hidden, 'arena beat has NO dim (the card stays visible)');
  t($('bf-go').disabled, 'Field-your-six is HELD while the arena lesson is unread');
  $('tutor-next').click();
  await sleep(320);
  t($('tutor-text').textContent.indexOf('question-mark dots') >= 0, 'tips beat follows');
  t($('tutor-shield').hidden, 'tips beat has NO dim (dots hoverable)');
  t($('bf-go').disabled, 'Field-your-six still held through the tips beat');
  $('tutor-next').click();
  await sleep(320);
  t(!$('bf-go').disabled, 'Field-your-six releases once both beats are read');
  if ($('bf-reveal').classList.contains('show')) {
    $('bf-go').disabled = false;
    $('bf-go').click();
    await sleep(400);
  }
  const order = w.EOL.play._prepState().script.six.slice();
  let roleBeats = 0;
  for (const id of order) {
    const marked = d.querySelector('#prep-player .prep-c.tutor-pick');
    t(!!marked && marked.dataset.cid === id, 'mark points at ' + id);
    marked.click();
    await sleep(320);
    if (!$('tutor-next').hidden) {
      roleBeats++;
      $('tutor-next').click();
      await sleep(280);
    }
  }
  t(roleBeats === 6, 'six role lessons delivered (' + roleBeats + ')');
  if (!$('tutor-next').hidden) {
    $('tutor-next').click();
    await sleep(300);
  }
  $('prep-confirm').click();
  await sleep(900);
  t(d.body.dataset.view === 'battle', 'battle starts');
  t($('tutor').hidden, 'tutor stands down once the fight begins');

  /* ---------- THE SCRIPTED MATCH: visible marks + all 41 moves ---------- */
  const B1 = w.EOL.battle.getState();
  t(B1.campaignStage === 1, 'battle carries stage id');
  t($('pf-name-enemy').textContent === 'The Recruiter', 'enemy commander plate shows the rival');
  let ms0 = w.EOL.battle._scriptState();
  t(!!ms0 && ms0.moves.length === 41, 'move script loaded (41)');
  await sleep(600);
  {
    const mv = ms0.moves[ms0.i];
    const u = B1.units.find((x) => x.side === 'player' && x.card.id === mv.unit);
    const marked = d.querySelector('.bcard.tutor-pick');
    t(!!marked && marked.dataset.uid === String(u.uid), "the line's unit is MARKED on the board");
  }
  let sawTargetMark = false,
    sawPassMark = false,
    sawAbilityMark = false,
    sawRoleSay = false;
  const guard = Date.now() + 420000;
  while (Date.now() < guard) {
    const B = w.EOL.battle.getState();
    if (!B || B.over) break;
    const ms = w.EOL.battle._scriptState();
    if (!ms) break;
    const mv = ms.moves[ms.i];
    if (!mv) break;
    if (/CONTROLLERS|BRUISERS|SNIPERS|CASTERS|MEDICS|TANKS are/.test($('rival-bark-text').textContent))
      sawRoleSay = true;
    if (mv.side !== 'player' || B.turn !== 'player' || d.body.dataset.busy === '1') {
      await sleep(220);
      continue;
    }
    if (mv.pass) {
      const et = $('btn-endturn');
      if (et.disabled) {
        await sleep(220);
        continue;
      }
      if (et.classList.contains('tutor-pick')) sawPassMark = true;
      et.click();
      await sleep(350);
      continue;
    }
    const u = B.units.find((x) => x.side === 'player' && x.card.id === mv.unit && x.alive);
    if (!u) break;
    const cardEl = d.querySelector('.bcard[data-uid="' + u.uid + '"]');
    if (!cardEl) {
      await sleep(200);
      continue;
    }
    cardEl.click();
    await sleep(140);
    const abBtn = d.querySelector('#flyout .dk-ab.act[data-ab="' + (mv.ability === 'sig' ? 0 : 1) + '"]');
    if (!abBtn) {
      await sleep(260);
      continue;
    }
    if (abBtn.classList.contains('tutor-pick')) sawAbilityMark = true;
    abBtn.click();
    await sleep(140);
    for (const tg of mv.targets || []) {
      const B2 = w.EOL.battle.getState();
      const tu = B2.units.find((x) => x.side === tg.side && x.card.id === tg.id && x.alive);
      const tEl = tu && d.querySelector('.bcard[data-uid="' + tu.uid + '"]');
      if (tEl) {
        if (tEl.classList.contains('tutor-pick')) sawTargetMark = true;
        tEl.click();
        await sleep(140);
      }
    }
    await sleep(260);
  }
  const Bend = w.EOL.battle.getState();
  t(!!Bend && Bend.over && Bend.winner === 'player', 'the 41-move line ends in VICTORY');
  t(Bend.units.filter((x) => x.side === 'player' && x.alive).length === 6, 'all six stand');
  t(!w.EOL.battle._scriptState(), 'line fully consumed');
  t(sawAbilityMark, 'ability rows were marked during the match');
  t(sawTargetMark, 'targets were marked during the match');
  t(sawPassMark, 'the Pass dial was marked on scripted passes');
  t(sawRoleSay, 'signature narration teaches ROLES, not damage numbers');
  let shown = false;
  for (let g = 0; g < 30 && !shown; g++) {
    await sleep(400);
    shown = $('result').className.indexOf('show') >= 0;
  }
  t(shown, 'result screen shows');
  await sleep(300);
  let prog = w.EOL.campaign.getProgress();
  t(prog.cleared.indexOf(1) >= 0 && prog.unlocked.indexOf(2) >= 0, 'stage 1 cleared, gate 2 unlocked');
  $('btn-result-home').click();
  await sleep(300);
  t(!$('chapter-dialogue').hidden, 'epilogue opens');
  $('chapter-dialogue-close').click();
  await sleep(900);
  t(d.body.dataset.view === 'chapter', 'back on the map');

  /* ---------- STAGE 5: campaign picker locks the format ---------- */
  prog = w.EOL.campaign.getProgress();
  [3, 4, 5].forEach((n) => {
    if (prog.unlocked.indexOf(n) < 0) prog.unlocked.push(n);
  });
  w.localStorage.setItem('eol.campaign.ch1.progress', JSON.stringify(prog));
  w.localStorage.setItem('eol.war.length', 'single');
  w.EOL.campaign._launchStage(w.EOL.campaign._stageById(5));
  await sleep(200);
  t($('deck-modal').classList.contains('show'), 'stage 5 opens the deck picker');
  t($('war-length').hidden, 'war-length toggle hidden attr set in campaign');
  t(w.getComputedStyle($('war-length')).display === 'none', 'war-length toggle actually INVISIBLE (CSS [hidden] wins)');
  Array.from(d.querySelectorAll('#dm-list .dm-row'))
    .find((r) => r.textContent.indexOf('Grimmwood') >= 0)
    .click();
  await sleep(900);
  const ss = w.EOL.play._setState();
  t(!!ss && ss.campaignStage === 5, 'stage 5 forces the set');
  w.EOL.ui.show('chapter');
  await sleep(700);

  /* ---------- STAGE 6: the FROZEN draft pool ---------- */
  w.EOL.campaign._launchStage(w.EOL.campaign._stageById(6));
  await sleep(1000);
  t(d.body.dataset.view === 'draft', 'stage 6 goes straight to the draft table');
  const ds = w.EOL.play._draftState();
  const poolCards = ds.packs.flat().map((e) => e.card.id).sort();
  const frozen = w.EOL.campaign._stageById(6).pool.cards.slice().sort();
  t(JSON.stringify(poolCards) === JSON.stringify(frozen), 'draft pool is EXACTLY the frozen 36');
  t(poolCards.every((id) => id.indexOf('huaxia-') !== 0 && id.indexOf('duat-') !== 0), 'no Huaxia/Duat in the pool');

  /* ---------- Tutorial corner button replays the intro ---------- */
  w.EOL.ui.show('chapter');
  await sleep(700);
  $('btn-corner-tutorial').click();
  await sleep(200);
  t(!$('chapter-dialogue').hidden, 'Tutorial button replays the intro');
  t($('chapter-dialogue-speaker').textContent === 'The Recruiter', 'replay is voiced by the Recruiter');
  for (let i = 0; i < 3 && !$('chapter-dialogue').hidden; i++) {
    $('chapter-dialogue-next').click();
    await sleep(120);
  }
  await sleep(1600);
  t(d.body.dataset.view === 'chapter', 'replayed intro also walks to the map');
  t(!$('chapter-dialogue').hidden, 'and reopens Gate I');
  $('chapter-dialogue-close').click();
  await sleep(200);

  /* ---------- mojibake sweep ---------- */
  {
    const walker = d.createTreeWalker(d.body, w.NodeFilter.SHOW_TEXT);
    let n,
      bad = [];
    while ((n = walker.nextNode())) {
      if (/[\u00c2\ufffd]|\u00e2\u20ac/.test(n.textContent)) bad.push(n.textContent.trim().slice(0, 60));
    }
    t(bad.length === 0, 'no mojibake anywhere in the rendered DOM' + (bad.length ? ' (' + bad[0] + ')' : ''));
  }

  console.log('');
  console.log('page errors: ' + JSON.stringify(w.__errs));
  if (w.__errs.length) fails++;
  console.log(fails ? 'FAILURES: ' + fails : 'ALL FLOW CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error('CRASH', e && (e.stack || e));
  process.exit(2);
});
