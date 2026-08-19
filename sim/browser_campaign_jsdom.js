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
  for (let g = 0; g < 40 && d.body.dataset.view !== 'home'; g++) await sleep(200);
  t(d.body.dataset.view === 'home', 'boot lands on home');
  // the intro fires 2.1s after campaign.js runs, and jsdom loads the
  // script chain slowly - poll for it instead of guessing the moment
  for (let g = 0; g < 40 && $('chapter-dialogue').hidden; g++) await sleep(300);
  t(!$('chapter-dialogue').hidden, 'first-boot intro auto-opens on a fresh save');
  t($('chapter-dialogue-speaker').textContent === 'The Recruiter', 'the Recruiter does the interrupting');
  t(!$('chapter-dialogue-skiptut').hidden, 'Skip tutorial offered on the intro scene');
  t(w.localStorage.getItem('eol.tutorial.intro.v1') === '1', 'intro marked seen the moment it runs');
  // skipping with X hands over to the WAYFINDER - no teleport, the
  // player walks the path themselves with the Recruiter pointing
  $('chapter-dialogue-close').click();
  await sleep(700);
  t(d.body.dataset.view === 'home', 'skipping the intro does NOT teleport - still home');
  t(!!w.EOL.campaign._navGuide(), 'the wayfinder starts when the intro closes');
  t(w.localStorage.getItem('eol.tutorial.guide.v1') === '1', 'wayfinder pending flag persists for refreshes');
  t(!$('nav-guide').hidden, 'guide bubble is up on home');
  t($('nav-guide-text').textContent.indexOf('PLAY') >= 0, 'it asks for the Play button');
  t($('btn-play').classList.contains('guide-mark'), 'Play button carries the golden pulse');
  // every OTHER door is locked while the wayfinder points
  $('btn-shop').click();
  await sleep(700);
  t(d.body.dataset.view === 'home', 'Shop refuses while the wayfinder points');
  $('btn-collection').click();
  await sleep(700);
  t(d.body.dataset.view === 'home', 'Collection refuses too');
  t(!!w.EOL.campaign._navGuide(), 'guide survives the refused clicks');
  // step 1: the player presses Play
  $('btn-play').click();
  await sleep(1100);
  t(d.body.dataset.view === 'play', 'player walked to the play screen');
  t(
    d.querySelectorAll('#mode-carousel-solo .mode-card').length === 4 &&
      d.querySelectorAll('#mode-carousel-solo .mode-carousel-dots > button').length === 4,
    'singleplayer modes are presented as a four-slide carousel'
  );
  t(
    $('mode-campaign').classList.contains('carousel-current'),
    'the carousel centres Campaign when the wayfinder asks for it'
  );
  t(
    $('mode-mp-guild').classList.contains('soon') &&
      $('mode-mp-guild').getAttribute('aria-disabled') === 'true' &&
      $('mode-mp-guild').textContent.indexOf('Coming soon') >= 0,
    'Multiplayer includes a coming-soon Guild Battles slide'
  );
  t($('mode-campaign').classList.contains('guide-mark'), 'guide re-points at the Campaign card');
  t(!$('btn-play').classList.contains('guide-mark'), 'the old mark is lifted');
  t($('nav-guide-text').textContent.indexOf('CAMPAIGN') >= 0, 'the bubble names the Campaign card');
  // the sibling mode cards are locked as well
  $('mode-classic').click();
  await sleep(500);
  t(!$('deck-modal').classList.contains('show'), 'Classic stays shut - only the Campaign card answers');
  t(d.body.dataset.view === 'play', 'no view drift from the refused Classic click');
  // step 2: the player takes the Campaign card
  $('mode-campaign').click();
  await sleep(1100);
  t(d.body.dataset.view === 'campaign', 'player walked to the chapter select');
  t($('chapter-1').classList.contains('guide-mark'), 'guide re-points at the Chapter 1 plate');
  // step 3: open the chapter
  $('chapter-1').click();
  await sleep(1100);
  t(d.body.dataset.view === 'chapter', 'player walked onto the Road of Echoes');
  t(d.querySelector('[data-campaign-stage="1"]').classList.contains('guide-mark'), 'guide re-points at Gate I');
  // step 4: knock on Gate I - the wayfinder's work ends here
  d.querySelector('[data-campaign-stage="1"]').click();
  await sleep(400);
  t(!$('chapter-dialogue').hidden, 'Gate I opens its dialogue when the player knocks');
  t($('chapter-dialogue-skiptut').hidden, 'no Skip-tutorial on a gate scene - Gate I is content');
  t(!w.EOL.campaign._navGuide(), 'the wayfinder retires the moment a gate answers');
  t($('nav-guide').hidden, 'guide bubble is gone');
  t(w.localStorage.getItem('eol.tutorial.guide.v1') !== '1', 'pending flag cleared - no ghost pointer next boot');
  t(!d.querySelector('.guide-mark'), 'no stray golden pulse anywhere');
  t($('chapter-dialogue-step').textContent.indexOf('01') === 0, 'gate 1 scene starts at line one');
  t(!$('chapter-dialogue-portrait').hidden && $('chapter-dialogue-glyph').hidden, 'portrait clean (no glyph overlay)');
  // Reproduce the old double-advance exactly: clicking the inner span
  // used to rewrite/detach that target, then bubble into the dialogue bar.
  $('chapter-dialogue-next').querySelector('span').click();
  await sleep(50);
  t(
    $('chapter-dialogue-step').textContent.indexOf('02') === 0,
    'one click on the Continue label advances exactly one dialogue line'
  );
  for (let i = 0; i < 8 && !$('chapter-dialogue').hidden; i++) {
    $('chapter-dialogue-next').click();
    await sleep(50);
  }
  await sleep(900);
  t(!$('deck-modal').classList.contains('show'), 'no deck picker on the scripted gate');
  t(d.body.dataset.view === 'prep', 'prep opens directly');
  t(
    $('prep-fields').hidden && $('prep-fields').style.display === 'none',
    'See battlefields is fully hidden during the ban phase'
  );
  const prep = w.EOL.play._prepState();
  t(!!prep.script && prep.script.match && prep.script.match.moves.length === 16, 'the 16-move OPENING is loaded in prep (rounds 1-2 - the handoff design)');
  await sleep(400);
  t(!$('tutor').hidden && !$('tutor-next').hidden, 'tutor intro with Continue');
  t(!$('tutor-shield').hidden, 'info beat raises the soft dim shield');
  // the playtest stall (2026-08-09): while the shield swallows taps, the
  // UI must not invite them - no gold marks, and the header says WHY
  t(d.body.dataset.tutorHold === '1', 'shielded beat raises the hold flag');
  t(!d.querySelector('#prep-enemy .prep-c.tutor-pick'), 'ban marks are PARKED while the Recruiter talks');
  t($('prep-enemy-note').textContent.indexOf('Recruiter') >= 0, 'header explains the hold instead of asking for bans');
  t($('prep-ledger-tell').hidden, 'no ledger tell on the scripted gate - the script narrates the bans');
  $('tutor-next').click();
  await sleep(320);
  t(!d.querySelector('#prep-enemy .prep-c.tutor-pick'), 'marks still parked on the second shielded beat');
  $('tutor-next').click();
  await sleep(500);
  t($('tutor-shield').hidden, 'action beat drops the shield');
  t(d.body.dataset.tutorHold !== '1', 'the hold lifts with the shield');
  t(d.querySelectorAll('#prep-enemy .prep-c.tutor-pick').length === 2, 'both ban marks appear the moment the board is truly live');
  t($('prep-enemy-note').textContent.indexOf('tap 2 to ban') === 0, 'header asks for bans again');
  d.querySelector('#prep-enemy .prep-c[data-cid="grimmwood-rumpelstiltskin"]').click();
  await sleep(180);
  t(w.EOL.play._prepState().youBans.length === 0, 'Legendary crowns refuse constructed bans');
  t(
    $('tutor-text').textContent.indexOf('Hansel & Gretel') >= 0 &&
      $('tutor-text').textContent.indexOf('Puss in Boots') >= 0,
    'a wrong Gate I prep click re-shows the relevant Recruiter instruction'
  );
  t(
    !Array.from($('toasts').children).some((node) =>
      /Rumpelstiltskin|Legendary|cannot be banned/.test(node.textContent)
    ),
    'the wrong Gate I prep click produces no bottom toast'
  );
  d.querySelector('#prep-enemy .prep-c[data-cid="grimmwood-hansel-gretel"]').click();
  await sleep(280);
  d.querySelector('#prep-enemy .prep-c[data-cid="grimmwood-puss-in-boots"]').click();
  await sleep(280);
  t(w.EOL.play._prepState().youBans.length === 2, 'both scripted non-Legendary bans placed');
  $('prep-confirm-main').click();
  await sleep(600);
  const pr = w.EOL.play._prepState();
  t(pr.phase === 'ban' && pr.revealed, 'reveal hold is running');
  t(!$('tutor').hidden && $('tutor-next').hidden, 'reveal narrated ungated during the hold');
  t($('tutor-text').textContent.indexOf('candle-children') >= 0, 'narration names his bans while the stamps show');
  await sleep(3200);
  t(w.EOL.play._prepState().phase === 'pick', 'pick phase opens after the long hold');
  t(!$('prep-fields').hidden, 'See battlefields returns for the fielding phase');
  await sleep(500);
  t($('bf-reveal').classList.contains('show'), 'battlefield card is up');
  t(!$('tutor').hidden && !$('tutor-next').hidden, 'arena lesson shows while the card is up');
  t($('tutor-text').textContent.indexOf('ARENA') >= 0, 'arena beat text');
  t($('tutor-shield').hidden, 'arena beat has NO dim (the card stays visible)');
  t($('bf-go').disabled, 'Field-your-six is HELD while the arena lesson is unread');
  // the flash bug (user note 2026-08-09): play.js's entrance unlock
  // fires ~900ms after the popup opens and used to re-enable the
  // button until the tutor's next poll caught it. Outwait the unlock
  // and make sure the hold is authoritative now.
  await sleep(1200);
  t($('bf-go').disabled, 'the entrance unlock cannot flash the button past the hold');
  t($('bf-go').dataset.campaignHold === '1', 'the hold flag is on the button itself');
  $('tutor-next').click();
  await sleep(320);
  t($('tutor-text').textContent.indexOf('question-mark dots') >= 0, 'tips beat follows');
  t($('tutor-shield').hidden, 'tips beat has NO dim (dots hoverable)');
  t($('bf-go').disabled, 'Field-your-six still held through the tips beat');
  $('tutor-next').click();
  await sleep(320);
  t(!$('bf-go').disabled, 'Field-your-six releases once both beats are read');
  t($('bf-go').dataset.campaignHold !== '1', 'and the hold flag is lifted with it');
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
      // shielded role lesson: the NEXT card's mark waits until Continue
      t(!d.querySelector('#prep-player .prep-c.tutor-pick'), 'next mark parked during the ' + id + ' lesson');
      $('tutor-next').click();
      await sleep(450);
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

  /* ---------- THE SCRIPTED OPENING: visible marks, rounds 1-2 ---------- */
  const B1 = w.EOL.battle.getState();
  t(B1.campaignStage === 1, 'battle carries stage id');
  t($('pf-name-enemy').textContent === 'The Recruiter', 'enemy commander plate shows the rival');
  let ms0 = w.EOL.battle._scriptState();
  t(!!ms0 && ms0.moves.length === 16, 'move script loaded (16 - the ledger owns rounds 1-2 only)');
  for (let g = 0; g < 45 && !$('rival-bark').classList.contains('reactive'); g++) await sleep(300);
  t($('rival-bark').classList.contains('reactive'), 'Gate I dialogue uses reader-paced reactive mode');
  t(!$('rival-bark-dismiss').hidden, 'reader-paced dialogue offers an optional Got it control');
  t(
    $('rival-bark-text').textContent === ms0.moves[ms0.i].say,
    'the dialogue describes the current marked move, not a timed round beat'
  );
  $('rival-bark-dismiss').click();
  await sleep(120);
  t(!$('rival-bark').classList.contains('show'), 'Got it dismisses the line without advancing the battle');
  {
    const mv = ms0.moves[ms0.i];
    const u = B1.units.find((x) => x.side === 'player' && x.card.id === mv.unit);
    const marked = d.querySelector('.bcard.tutor-pick');
    t(!!marked && marked.dataset.uid === String(u.uid), "the line's unit is MARKED on the board");
  }
  {
    // off-script attempt: the INSTRUCTION re-speaks as dialogue, no toast chip
    const say0 = ms0.moves[ms0.i].say;
    let resaid = false;
    for (let g = 0; g < 12 && !resaid; g++) {
      if (!$('btn-endturn').disabled) $('btn-endturn').click();
      await sleep(300);
      resaid = $('rival-bark-text').textContent === say0;
    }
    t(resaid, 'an off-script pass re-speaks the current instruction as dialogue');
    t(w.EOL.battle._scriptState().i === ms0.i, 'and the refused pass consumes nothing');
    t(!$('toast').classList.contains('show'), 'no toast chip for the denial');
  }
  let sawTargetMark = false,
    sawPassMark = false,
    sawAbilityMark = false,
    sawBannerCut = false,
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
    // the stale-caption fix: acting while the slim YOUR TURN banner is
    // up must cut it short in the same click
    const cineEl = $('cine');
    const turnBannerUp =
      cineEl.classList.contains('show') &&
      /\bslim\b/.test(cineEl.className) &&
      /tone-player/.test(cineEl.className);
    cardEl.click();
    if (turnBannerUp && !cineEl.classList.contains('show')) sawBannerCut = true;
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
  /* ---------- THE HANDOFF: the ledger closes, the war stays live ---------- */
  t(!w.EOL.battle._scriptState(), 'the opening is fully consumed');
  {
    const Bh = w.EOL.battle.getState();
    t(!!Bh && !Bh.over, 'the handoff leaves the war LIVE - no more escort');
    t(Bh.units.filter((x) => x.alive).length === 12, 'nobody has died when the ledger closes');
  }
  t(sawAbilityMark, 'ability rows were marked during the opening');
  t(sawTargetMark, 'targets were marked during the opening');
  t(sawPassMark, 'the Pass dial was marked on the scripted pass');

  /* ---------- FREE PLAY: the player fights, the Recruiter REACTS ----------
     Drive the player's side through the real UI (unit click, ability
     click, target click), guided by the game's own AI. Along the way the
     handoff bark must land and at least one role-lesson REACTION must
     fire on a signature the player chose to cast. */
  let sawHandoffBark = false,
    sawStatusLesson = false,
    sawDmgPreview = false;
  const guard2 = Date.now() + 420000;
  while (Date.now() < guard2) {
    const B = w.EOL.battle.getState();
    if (!B || B.over) break;
    const barkTxt = $('rival-bark-text').textContent;
    if (/ledger ends here/i.test(barkTxt)) sawHandoffBark = true;
    if (/STATUSES|sigils/.test(barkTxt)) sawStatusLesson = true;
    if (/CONTROLLERS|CASTERS/.test(barkTxt)) sawRoleSay = true; // queued scripted says drain here
    if (/BRUISERS|SNIPERS|MEDICS|TANKS/.test(barkTxt)) sawRoleSay = true;
    if (B.turn !== 'player' || d.body.dataset.busy === '1') {
      await sleep(220);
      continue;
    }
    /* a pending target pick resolves first - click a lit card */
    const lit = d.querySelector('.bcard.targetable');
    if (lit) {
      lit.click();
      await sleep(160);
      continue;
    }
    const act = w.EOL.ai.bestAction(B, 'player');
    if (!act || !act.unit || !act.ability) {
      const et = $('btn-endturn');
      if (!et.disabled) {
        et.click();
        await sleep(320);
      } else await sleep(220);
      continue;
    }
    const cardEl = d.querySelector('.bcard[data-uid="' + act.unit.uid + '"]');
    if (!cardEl) {
      await sleep(200);
      continue;
    }
    const cineEl = $('cine');
    const turnBannerUp =
      cineEl.classList.contains('show') &&
      /\bslim\b/.test(cineEl.className) &&
      /tone-player/.test(cineEl.className);
    cardEl.click();
    if (turnBannerUp && !cineEl.classList.contains('show')) sawBannerCut = true;
    await sleep(140);
    const isSig = act.ability === act.unit.card.ability;
    const abBtn = d.querySelector('#flyout .dk-ab.act[data-ab="' + (isSig ? 0 : 1) + '"]');
    if (abBtn) {
      abBtn.click();
      await sleep(140);
      // the damage preview: targetable enemies wear the number
      if (d.querySelector('.bcard.targetable .dmg-preview')) sawDmgPreview = true;
    }
    /* prefer the AI's own victims when they are lit */
    for (const tu of act.chosen || act.targets || []) {
      const tEl = tu && d.querySelector('.bcard.targetable[data-uid="' + tu.uid + '"]');
      if (tEl) {
        tEl.click();
        await sleep(140);
      }
    }
    await sleep(240);
  }
  const Bend = w.EOL.battle.getState();
  t(!!Bend && Bend.over && Bend.winner === 'player', 'the FREE half still ends in VICTORY');
  t(sawHandoffBark, 'the Recruiter announces the handoff ("the ledger ends here")');
  {
    // the reaction layer: assert the FIRING (the queue may still be
    // draining lessons when the battle ends - display is timing, the
    // record is truth)
    const bw = w.EOL.campaign._battleWatch();
    t(
      !!bw && Object.keys(bw.rxFired || {}).some((k) => k.indexOf('role-') === 0),
      'a role-signature REACTION fired on a move the player chose'
    );
  }
  t(sawStatusLesson, 'the reactive handoff teaches reading the status sigils');
  t(sawRoleSay, 'signature narration teaches ROLES, not damage numbers');
  t(sawDmgPreview, 'targetable enemies wore a damage preview during free play');
  t(sawBannerCut, 'acting cuts a lingering YOUR TURN banner in the same click');
  let shown = false;
  for (let g = 0; g < 30 && !shown; g++) {
    await sleep(400);
    shown = $('result').className.indexOf('show') >= 0;
  }
  t(shown, 'result screen shows');
  t(!$('result-stats').hidden, 'the battle report is on the result screen');
  t(d.querySelectorAll('#result-stats .rs-row').length === 12, 'a report line for every legend in the fight');
  const critUnit = w.EOL.battle.getState().units.find((u) => u.alive);
  w.EOL.battle._popNumber(
    { type: 'damage', meta: { uid: critUnit.uid, amount: 1234, crit: true } },
    0
  );
  await sleep(30);
  t(
    !!d.querySelector('.pop.crit .pop-critical') &&
      d.querySelector('.pop.crit .pop-critical').textContent === 'CRITICAL',
    'every critical damage number carries explicit CRITICAL text'
  );
  t($('result-stats').textContent.indexOf("The Recruiter's legends") >= 0, "the enemy column carries the rival's name");
  t(
    !$('result-coins').hidden && $('result-coins').textContent.indexOf('+100 coins') >= 0,
    'campaign victory shows its selected-difficulty gate reward receipt'
  );
  await sleep(300);
  let prog = w.EOL.campaign.getProgress();
  t(prog.cleared.indexOf(1) >= 0 && prog.unlocked.indexOf(2) >= 0, 'stage 1 cleared, gate 2 unlocked');
  $('btn-result-home').click();
  await sleep(300);
  t(!$('chapter-dialogue').hidden, 'epilogue opens');
  $('chapter-dialogue-close').click();
  await sleep(900);
  t(d.body.dataset.view === 'chapter', 'back on the map');

  /* ---------- THE LEDGER: introduced once, then a real index ---------- */
  // the spotlight: after Gate I falls, the ledger button earns a pointer
  for (let g = 0; g < 15 && !$('btn-ledger').classList.contains('guide-mark'); g++) await sleep(250);
  t($('btn-ledger').classList.contains('guide-mark'), 'the ledger button is spotlit after Gate I');
  t(!$('nav-guide').hidden && $('nav-guide-text').textContent.indexOf('LEDGER') >= 0, 'the Recruiter introduces his book');
  t($('nav-guide-skip').hidden, 'a pointer, not a flow - no skip pill');
  t(w.localStorage.getItem('eol.tutorial.ledger.v1') === '1', 'the spotlight is once-per-save');
  $('btn-ledger').click();
  await sleep(300);
  t(!$('btn-ledger').classList.contains('guide-mark'), 'opening the ledger retires the spotlight');
  t(!$('ledger').hidden, 'the ledger opens');
  t(d.querySelectorAll('#ledger-list .lg-row').length === 10, 'ten pages, one per gate');
  // opens on the furthest readable page: gate 2 (unlocked, intel state)
  t($('ledger-page').textContent.indexOf('killers-at-a-distance') >= 0, 'gate 2 intel: the habit is readable BEFORE the fight');
  t($('ledger-page').textContent.indexOf('Likes to ban:') >= 0, 'the habit names the MECHANISM, not just the reputation');
  t($('ledger-page').textContent.indexOf('your hardest hitters') >= 0, 'derived truthfully from the ban profile');
  t($('ledger-page').textContent.indexOf('Only front-row legends') >= 0, 'the Ground carries the full arena laws, not just a name');
  t($('ledger-page').textContent.indexOf('lazy back row') >= 0, 'and the counsel (recommended bans/decks) is there');
  t($('ledger-page').textContent.indexOf('Unwritten until you first cross blades') >= 0, 'but his twelve stays unwritten until first blood');
  // gate 1: cleared - the full page with REAL battle tiles
  d.querySelector('#ledger-list .lg-row[data-lg="1"]').click();
  await sleep(200);
  t(d.querySelectorAll('#ledger-page .prep-c').length === 12, "the Recruiter's twelve is written out as real battle tiles");
  t($('ledger-page').textContent.indexOf('Gate cleared') >= 0, 'with the record stamped');
  {
    // hovering a tile opens the ledger's own flyout - the same panel prep uses
    const tile = d.querySelector('#ledger-page .prep-c');
    tile.dispatchEvent(new w.Event('mouseenter'));
    await sleep(120);
    t($('ledger-tip').classList.contains('show'), 'hovering a tile opens the hover card');
    t($('ledger-tip').textContent.indexOf('HP') >= 0, 'and it is the full stat panel');
    tile.dispatchEvent(new w.Event('mouseleave'));
    await sleep(120);
    t(!$('ledger-tip').classList.contains('show'), 'and it closes on leave');
  }
  // gate 3: locked - sealed page, no leaks
  d.querySelector('#ledger-list .lg-row[data-lg="3"]').click();
  await sleep(150);
  t($('ledger-page').textContent.indexOf('The Road has not taken you there') >= 0, 'locked gates keep sealed pages');
  t($('ledger-page').textContent.indexOf('Outlaw') < 0, 'and leak no names');
  // broken claims persist to the store the ledger reads
  w.EOL.campaign.onTellBreak(3);
  t(w.EOL.campaign.getProgress().tellsBroken.indexOf(3) >= 0, 'a broken ban-claim is recorded forever');
  $('ledger-close').click();
  await sleep(200);
  t($('ledger').hidden, 'the ledger closes');
  // the spotlight never repeats
  w.EOL.ui.show('home');
  await sleep(700);
  w.EOL.ui.show('chapter');
  await sleep(1400);
  t(!$('btn-ledger').classList.contains('guide-mark'), 'the spotlight is a one-time introduction');

  /* ---------- STAGE 2: THE ADVISED GATE (do -> advise -> release) ---------- */
  w.EOL.campaign._launchStage(w.EOL.campaign._stageById(2));
  await sleep(300);
  Array.from(d.querySelectorAll('#dm-list .dm-row'))
    .find((r) => r.textContent.indexOf('Grimmwood') >= 0)
    .click();
  await sleep(700);
  t(d.body.dataset.view === 'prep', 'gate 2 opens preparation');
  t(
    w.EOL.campaign._stageById(2).reactiveDialogue === true,
    'Gate II also uses event-driven, reader-paced in-match dialogue'
  );
  {
    const p2 = w.EOL.play._prepState();
    t(!!p2.advisor && !p2.script, 'gate 2 is advised, never scripted');
    t(!!p2.advice && p2.advice.bans.length === 2, 'silver ban counsel computed from the real deny math');
    t(d.querySelectorAll('#prep-enemy .prep-c.advice-pick').length === 2, 'both counseled bans wear SILVER marks');
    t(!d.querySelector('#prep-enemy .prep-c.tutor-pick'), 'and no GOLD marks - silver is advice, gold is law');
    t(!$('tutor').hidden && $('tutor-next').hidden, 'the Recruiter counsels, ungated (no Continue, no shield)');
    t($('tutor-name').textContent === 'The Recruiter', 'the counsel is voiced by the Recruiter, not the rival');
    t($('tutor-text').textContent.indexOf('Refuse freely') >= 0, 'and it says outright that refusing is fine');
    t($('tutor-shield').hidden, 'no shield - the advised gate never locks the board');
    // REFUSING the counsel must cost nothing: ban a NON-advised card
    const freePick = Array.from(d.querySelectorAll('#prep-enemy .prep-c')).find(
      (el) => el.dataset.rarity !== 'legendary' && p2.advice.bans.indexOf(el.dataset.cid) < 0
    );
    freePick.click();
    await sleep(250);
    t(w.EOL.play._prepState().youBans.length === 1, 'a non-counseled ban lands without resistance');
    // then follow half the counsel
    d.querySelector('#prep-enemy .prep-c.advice-pick').click();
    await sleep(250);
    t(w.EOL.play._prepState().youBans.length === 2, 'mixed obedience: one his, one yours');
    $('prep-confirm-main').click();
    // reveal hold (non-scripted) then the pick phase - poll, not guess
    for (let g = 0; g < 25 && w.EOL.play._prepState().phase !== 'pick'; g++) await sleep(300);
    t(w.EOL.play._prepState().phase === 'pick', 'pick phase opens');
    // THE BROKEN CLAIM: deterministic per-run - read what he ACTUALLY
    // banned, then demand the strip tells the matching truth
    {
      const p2r = w.EOL.play._prepState();
      const roleOf = (id) => {
        let r = null;
        w.EOL.factions.forEach((f) => f.cards.forEach((c) => { if (c.id === id) r = c.role; }));
        return r;
      };
      const claim = ['Sniper', 'Caster'];
      const struck = (p2r.botBans || []).some((id) => claim.indexOf(roleOf(id)) >= 0);
      if (struck) {
        t($('prep-ledger-tell').hidden, 'claim held - the ledger yields to the truth and hides');
      } else {
        t(!$('prep-ledger-tell').hidden, 'claim BROKEN - the ledger corrects itself out loud');
        t(
          $('prep-ledger-tell-text').textContent.indexOf('corrected') >= 0,
          'and says so in the authored words'
        );
        t($('prep-ledger-tell').classList.contains('broken'), 'wearing the correction style');
      }
    }
    await sleep(400);
    const p2b = w.EOL.play._prepState();
    t(!!p2b.adviceSix && p2b.adviceSix.length === 6, 'a silver SIX is counseled from what survived');
    t(
      d.querySelectorAll('#prep-player .prep-c.advice-pick').length === 6,
      'all six suggestions marked while none are fielded'
    );
    t($('tutor-text').textContent.indexOf('your hand, your gate') >= 0, 'the six counsel line plays');
    // following one piece of counsel retires that one mark
    d.querySelector('#prep-player .prep-c.advice-pick').click();
    await sleep(300);
    t(
      d.querySelectorAll('#prep-player .prep-c.advice-pick').length === 5,
      'counsel disappears as it is followed'
    );
  }
  w.EOL.ui.show('chapter');
  await sleep(700);

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
  // the Recruiter's ledger: the rival's banning reputation is READ
  // before the player's own bans are committed (playtest ruling)
  t(!$('prep-ledger-tell').hidden, "the ledger reads the Warden's bans BEFORE you commit yours");
  t(
    $('prep-ledger-tell-text').textContent.indexOf('single point of failure') >= 0,
    'and the tell is the authored one'
  );
  const yourPrepLayout = w.getComputedStyle($('prep-side-you'));
  const rivalPrepLayout = w.getComputedStyle($('prep-side-foe'));
  t(
    yourPrepLayout.flexGrow === rivalPrepLayout.flexGrow &&
      yourPrepLayout.flexBasis === rivalPrepLayout.flexBasis &&
      /^0/.test(yourPrepLayout.flexBasis),
    'a long ledger cannot give the rival side more than half of the ban board'
  );
  t(
    w.getComputedStyle($('prep-ledger-tell')).overflowWrap === 'anywhere',
    'long ledger text wraps inside its equal-width side instead of widening it'
  );
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

  /* ---------- Signed-in hard save: Tutorial is never a dead button ---------- */
  // Account vaults preserve the last selected Road. Before the fix, a cloud
  // save on Heroic/Legend made runIntroTutorial's Normal-only guard silently
  // reject the explicit Tutorial-button click.
  w.EOL.campaign.setDifficulty('legend');
  d.body.dataset.auth = 'in';
  w.EOL.ui.show('home');
  await sleep(700);
  $('btn-corner-tutorial').click();
  await sleep(250);
  t(w.EOL.campaign.difficulty() === 'normal', 'signed-in hard save moves to Normal for the tutorial');
  t(!$('chapter-dialogue').hidden, 'Tutorial button opens for a signed-in account');
  t(!$('chapter-dialogue-skiptut').hidden, 'signed-in replay is the skippable intro flow');
  $('chapter-dialogue-skiptut').click();
  await sleep(300);
  d.body.dataset.auth = 'out';

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
  await sleep(700);
  t(!!w.EOL.campaign._navGuide(), 'replayed intro also hands over to the wayfinder');
  t(d.body.dataset.view === 'chapter', 'no teleport on replay either - view unchanged');
  t(d.querySelector('[data-campaign-stage="1"]').classList.contains('guide-mark'), 'wayfinder points at Gate I from the map');
  d.querySelector('[data-campaign-stage="1"]').click();
  await sleep(300);
  t(!$('chapter-dialogue').hidden, 'knocking reopens Gate I');
  t(!w.EOL.campaign._navGuide(), 'and retires the replayed wayfinder');
  $('chapter-dialogue-close').click();
  await sleep(200);

  /* ---------- Skip tutorial: one click out, no forced navigation ---------- */
  // skip from inside the intro scene - the player stays where they were
  w.EOL.ui.show('home');
  await sleep(700);
  $('btn-corner-tutorial').click();
  await sleep(250);
  t(!$('chapter-dialogue').hidden && !$('chapter-dialogue-skiptut').hidden, 'skip test: intro up with the skip pill');
  $('chapter-dialogue-skiptut').click();
  await sleep(900);
  t($('chapter-dialogue').hidden, 'skip closes the intro scene');
  t(!w.EOL.campaign._navGuide(), 'skip does NOT hand over to the wayfinder');
  t(d.body.dataset.view === 'home', 'skip forces NO navigation - the player stays put');
  t(w.localStorage.getItem('eol.tutorial.guide.v1') !== '1', 'no ghost pointer left pending');
  t(!d.querySelector('.guide-mark'), 'no stray pulse after the skip');
  // and the menus belong to the player again - Shop opens freely
  $('btn-shop').click();
  await sleep(900);
  t(d.body.dataset.view === 'shop', 'after the skip every door opens again');
  w.EOL.ui.show('home');
  await sleep(700);
  // skip from the wayfinder bubble mid-walk
  $('btn-corner-tutorial').click();
  await sleep(250);
  for (let i = 0; i < 3 && !$('chapter-dialogue').hidden; i++) {
    $('chapter-dialogue-next').click();
    await sleep(120);
  }
  await sleep(700);
  t(!!w.EOL.campaign._navGuide(), 'wayfinder running for the restart test');
  t(!$('nav-guide').hidden, 'bubble up (with its skip pill riding along)');
  // A cloud-restored pending guide installs the capture-phase click trap.
  // Tutorial itself must remain an escape hatch instead of being swallowed.
  $('btn-corner-tutorial').click();
  await sleep(250);
  t(!$('chapter-dialogue').hidden, 'Tutorial button restarts an already-pending cloud wayfinder');
  t(!w.EOL.campaign._navGuide(), 'restarting retires the old wayfinder before opening the intro');
  $('chapter-dialogue-skiptut').click();
  await sleep(400);

  // Start once more to retain direct coverage of the bubble's own Skip control.
  $('btn-corner-tutorial').click();
  await sleep(250);
  for (let i = 0; i < 3 && !$('chapter-dialogue').hidden; i++) {
    $('chapter-dialogue-next').click();
    await sleep(120);
  }
  await sleep(700);
  t(!!w.EOL.campaign._navGuide(), 'wayfinder running for the bubble-skip test');
  $('nav-guide-skip').click();
  await sleep(500);
  t(!w.EOL.campaign._navGuide(), 'bubble skip retires the wayfinder');
  t(d.body.dataset.view === 'home', 'and leaves the player exactly where they stood');
  t($('chapter-dialogue').hidden, 'without opening anything on their behalf');
  t($('nav-guide').hidden, 'bubble gone after the skip');

  /* The carousel remains fully navigable after the guided walk. */
  w.EOL.ui.show('play');
  await sleep(250);
  d.querySelector('.play-tab[data-arena="mp"]').click();
  await sleep(350);
  t(
    $('mode-grid-solo').hidden &&
      !$('mode-grid-mp').hidden &&
      $('mode-carousel-solo').hidden &&
      !$('mode-carousel-mp').hidden,
    'the Multiplayer tab swaps to its carousel without leaking the solo track'
  );
  $('mode-carousel-mp').querySelector('[data-carousel-next]').click();
  await sleep(50);
  t($('mode-mp-draft').classList.contains('carousel-current'), 'carousel arrows advance to Online Draft');
  $('mode-carousel-mp').querySelector('[data-carousel-next]').click();
  await sleep(50);
  t($('mode-mp-guild').classList.contains('carousel-current'), 'Guild Battles can be centred as a coming-soon slide');
  d.querySelector('.play-tab[data-arena="solo"]').click();
  await sleep(350);
  t(
    !$('mode-grid-solo').hidden && $('mode-grid-mp').hidden,
    'returning to Singleplayer restores only its carousel'
  );
  w.EOL.ui.show('chapter');
  await sleep(700);

  /* ---------- DIFFICULTY RUNS + THE ECONOMY ---------- */
  t(
    d.querySelectorAll('#road-difficulty [data-road-difficulty]').length === 3 &&
      d.querySelector('[data-road-difficulty="normal"]').classList.contains('sel'),
    'the Road exposes Normal, Heroic, and Legend with Normal selected after migration'
  );
  d.querySelector('[data-road-difficulty="heroic"]').click();
  await sleep(200);
  t(
    w.EOL.campaign.difficulty() === 'heroic' &&
      d.querySelector('[data-campaign-stage="2"]').classList.contains('is-locked'),
    'Heroic opens as an independent run'
  );
  const heroicGate1 = d.querySelector('[data-campaign-stage="1"] .sc-rewards');
  t(
    heroicGate1.textContent.indexOf('200') >= 0 &&
      heroicGate1.textContent.indexOf('Epic') >= 0 &&
      heroicGate1.textContent.indexOf('Legendary') < 0,
    'Heroic faction gates advertise only double coins and their Epic'
  );
  d.querySelector('[data-road-difficulty="legend"]').click();
  await sleep(200);
  const legendGate2Preview = d.querySelector('[data-campaign-stage="2"] .sc-rewards');
  t(
    legendGate2Preview.querySelectorAll('.sc-reward').length === 2 &&
      !!legendGate2Preview.querySelector('.legendary') &&
      !!legendGate2Preview.querySelector('.coin') &&
      legendGate2Preview.textContent.indexOf('300') >= 0,
    'Legend faction gates advertise their Legendary reward AND its 300 coins'
  );
  d.querySelector('[data-road-difficulty="normal"]').click();
  await sleep(200);
  t(
    w.EOL.campaign.getProgress().cleared.includes(1) &&
      !d.querySelector('[data-campaign-stage="2"]').classList.contains('locked'),
    'returning to Normal restores its cleared and unlocked gates'
  );

  t(w.EOL.econ.coins() === 100, 'Gate I paid its flat 100 into the shared wallet (' + w.EOL.econ.coins() + ')');
  // the home wallet chip rides beside the account pill and tracks eol:coins
  w.EOL.ui.show('home');
  await sleep(400);
  t($('home-coins-val').textContent === '100', 'the home coin chip shows the wallet (' + $('home-coins-val').textContent + ')');
  t(!!d.querySelector('#home-coins .ri-coin-fill'), 'and wears the library coin icon');
  w.EOL.econ.addCoins(5);
  await sleep(100);
  t($('home-coins-val').textContent === '105', 'the chip moves live on eol:coins');
  w.EOL.econ.spend(5);
  await sleep(100);
  w.EOL.ui.show('chapter');
  await sleep(400);
  t(w.EOL.econ.owns('grimmwood-snow-white'), 'the starter twelve is owned forever');
  t(!w.EOL.econ.owns('camelot-king-arthur'), 'ungranted legends are NOT owned');
  t(!w.EOL.econ.owns('huaxia-sun-wukong') && w.EOL.econ.obtainableEntries().every((e) => e.faction.id !== 'huaxia'), 'Huaxia is unobtainable (Chapter 2 cargo)');
  // the deck editor's grid wears the locks
  t(!d.querySelector('#deck-grid .card[data-id="grimmwood-snow-white"]').classList.contains('unowned'), 'owned cards are open in the deck editor');
  t(d.querySelector('#deck-grid .card[data-id="duat-anubis"]').classList.contains('unowned'), 'unowned cards are locked in the deck editor');
  {
    const cards = Array.from(d.querySelectorAll('#deck-grid .card[data-id]'));
    const firstUnowned = cards.findIndex((c) => c.classList.contains('unowned'));
    const lastOwned = cards.reduce((m, c, i) => (c.classList.contains('unowned') ? m : i), -1);
    t(firstUnowned === -1 || lastOwned < firstUnowned, 'the deck builder lists every owned card before any unowned card');
  }
  // the collection: owned count is honest, owned legends lead the grid
  w.EOL.ui.show('collection');
  await sleep(700);
  $('ctab-legends').click();
  await sleep(400);
  {
    const ownedN = w.EOL.econ.ownedCount();
    t($('owned-count').textContent === String(ownedN), 'the collection counts what you OWN (' + $('owned-count').textContent + ' of ' + $('total-count').textContent + ')');
    t(Number($('total-count').textContent) > ownedN, 'and no longer claims the whole roster');
    const cards = Array.from(d.querySelectorAll('#roster .card[data-id]'));
    t(cards.length > 0, 'the roster grid painted');
    const firstUnowned = cards.findIndex((c) => c.classList.contains('unowned'));
    const lastOwned = cards.reduce((m, c, i) => (c.classList.contains('unowned') ? m : i), -1);
    t(firstUnowned === -1 || lastOwned < firstUnowned, 'every owned legend paints before every unowned one');
    t(!!d.querySelector('#filters .dd-opt .ra-crown.rar-legendary') && !!d.querySelector('#filters .dd-opt .ra-gem.rar-epic'), 'the rarity dropdown wears tier crests in tier colors');
  }
  // the starter deck cannot be deleted or edited
  w.EOL.ui.show('collection');
  await sleep(700);
  $('ctab-decks').click();
  await sleep(300);
  {
    const rows = Array.from(d.querySelectorAll('#decks-list > *'));
    const starter = rows.find((r) => r.textContent.indexOf('Grimmwood') >= 0);
    t(!!starter && !!starter.querySelector('.dc-locked'), "the starter deck wears the Road's padlock");
    t(!!starter && !starter.querySelector('.dc-del') && !starter.querySelector('.dc-edit'), 'and offers neither Delete nor Edit');
  }
  /* Bans vary only inside a measured near-tie. A real outlier remains a
     lock, while campaign role priorities still fence the variation into
     the rival's authored personality. */
  {
    const oldDeny = w.EOL.draftAI.denyValue;
    const oldRandom = w.Math.random;
    const entry = (id, role = 'Sniper', atk = 1800) => ({
      card: { id, rarity: 'common', role, stats: { hp: 5000, atk, def: 12 } },
      faction: { id: 'test' },
    });
    const scores = {};
    w.EOL.draftAI.denyValue = (_deck, candidate) => scores[candidate.card.id] || 0;
    let roll = 0;
    w.Math.random = () => ((roll++ * 37) % 100) / 100;
    try {
      const close = [entry('close-a'), entry('close-b'), entry('close-c'), entry('low')];
      Object.assign(scores, { 'close-a': 10, 'close-b': 9.8, 'close-c': 9.7, low: 2 });
      const closePairs = new Set();
      for (let i = 0; i < 30; i++)
        closePairs.add(w.EOL.play._chooseBans(close, [], true).slice().sort().join('|'));
      t(closePairs.size > 1, 'similarly valued cards produce more than one AI ban pair');

      const dominant = [entry('bomb'), entry('runner-a'), entry('runner-b'), entry('weak')];
      Object.assign(scores, { bomb: 20, 'runner-a': 10, 'runner-b': 9.8, weak: 1 });
      let bombHeld = true;
      for (let i = 0; i < 30; i++)
        if (w.EOL.play._chooseBans(dominant, [], true).indexOf('bomb') < 0) bombHeld = false;
      t(bombHeld, 'a clearly dominant card is reliably banned through every random roll');

      const personaDeck = [
        entry('aim-a', 'Sniper', 2000),
        entry('aim-b', 'Sniper', 1960),
        entry('aim-c', 'Sniper', 1920),
        entry('off-role', 'Tank', 2400),
      ];
      Object.assign(scores, { 'aim-a': 10, 'aim-b': 9.9, 'aim-c': 9.8, 'off-role': 10.5 });
      const personaPairs = new Set();
      let stayedInRole = true;
      for (let i = 0; i < 30; i++) {
        const bans = w.EOL.play._personaBans({ roles: ['Sniper'], stat: 'atk' }, personaDeck, [], true);
        personaPairs.add(bans.slice().sort().join('|'));
        if (bans.indexOf('off-role') >= 0) stayedInRole = false;
      }
      t(personaPairs.size > 1, 'campaign personalities also vary among close preferred targets');
      t(stayedInRole, 'persona variation never abandons an available authored role priority');

      Object.assign(scores, { 'aim-a': 10, 'aim-b': 9.9, 'aim-c': 9.8, 'off-role': 20 });
      let personaBombHeld = true;
      for (let i = 0; i < 30; i++) {
        const bans = w.EOL.play._personaBans({ roles: ['Sniper'] }, personaDeck, [], true);
        if (bans.indexOf('off-role') < 0) personaBombHeld = false;
      }
      t(personaBombHeld, 'even a campaign personality always removes a true threat outlier');
    } finally {
      w.EOL.draftAI.denyValue = oldDeny;
      w.Math.random = oldRandom;
    }
  }

  // the shelf: redeem the launch creator code, then buy a Trio pack for real
  w.EOL.ui.show('shop');
  await sleep(700);
  t(
    $('shop-code-modal').hidden &&
      $('shop-code-form').closest('#shop-code-modal') === $('shop-code-modal'),
    'the code form starts hidden inside its popup instead of occupying the shop shelf'
  );
  t(
    $('shop-code-open').classList.contains('shop-wallet') &&
      $('shop-code-open').previousElementSibling === $('shop-wallet'),
    'the Redeem code button is a wallet-style chip directly beside the coin balance'
  );
  $('shop-code-open').click();
  t(
    !$('shop-code-modal').hidden && d.activeElement === $('shop-code-input'),
    'clicking the Redeem code chip opens the popup and focuses its input'
  );
  t(
    w.EOL.econ.codePolicy('CREATOR5000').singleUserOnly === false,
    'CREATOR5000 is explicitly configured for every-account-once redemption'
  );
  $('shop-code-input').value = '  creator5000  ';
  $('shop-code-submit').click();
  t(w.EOL.econ.coins() === 5100, 'CREATOR5000 grants 5,000 coins into the shared wallet');
  t(
    $('shop-code-status').dataset.state === 'success' &&
      $('shop-code-status').textContent.indexOf('5,000 coins added') >= 0,
    'the shop visibly confirms a successful code redemption'
  );
  $('shop-code-input').value = 'CREATOR5000';
  $('shop-code-submit').click();
  t(
    w.EOL.econ.coins() === 5100 && $('shop-code-status').textContent.indexOf('already been redeemed') >= 0,
    'the same code cannot pay twice'
  );
  $('shop-code-input').value = 'NOPE';
  $('shop-code-submit').click();
  t(
    w.EOL.econ.coins() === 5100 && $('shop-code-status').textContent.indexOf('Sign in') >= 0,
    'an online-only or unknown code pays nothing and asks for account verification'
  );
  $('shop-code-close').click();
  t(
    $('shop-code-modal').hidden && d.activeElement === $('shop-code-open'),
    'closing the code popup returns focus to its wallet chip'
  );
  t(
    w.EOL.shop.PACKS.trio.price === 200 &&
      w.EOL.shop.PACKS.echo.price === 500 &&
      w.EOL.shop.PACKS.crown.price === 1000,
    'the shelf uses the 200 / 500 / 1,000 pack prices'
  );
  t($('shop-wallet').textContent.indexOf('5,100') >= 0 || $('shop-wallet').textContent.indexOf('5100') >= 0, 'the shop shows the wallet');
  // the library coin (owner ruling: icon font, never a generated sprite)
  t(!!$('shop-wallet').querySelector('i.ri-coin-fill'), 'the wallet wears the library coin, not the energy bolt');
  t(!$('shop-wallet').querySelector('.ra-lightning-bolt') && !$('shop-wallet').querySelector('img'), 'no lightning bolt and no sprite anywhere near the wallet');
  // tiered CSS wrappers: one skeleton, each shelf pack wearing its own skin
  for (const [key, word, icon] of [
    ['trio', 'Trio', 'ra-diamonds-card'],
    ['echo', 'Echoes', 'ra-spiral-shell'],
    ['crown', 'Crown', 'ra-crown'],
  ]) {
    const host = d.querySelector('.product-pack[data-pack="' + key + '"]');
    const face = host && host.querySelector('.pk-face');
    t(!!face && face.classList.contains('pk-' + key), 'the ' + word + ' pack wears its own skin');
    t(!!face && !!face.querySelector('.pk-emblem .' + icon), 'and its own emblem (' + icon + ')');
    t(!!face && face.querySelectorAll('.pk-pips span').length === w.EOL.shop.PACKS[key].size, 'and a pip fan matching its size');
    t(!!host && host.querySelector('.pk-wordmark span').textContent === word, 'and its wordmark says ' + word);
  }
  w.EOL.shop.setFast(true);
  {
    const before = w.EOL.econ.unownedEntries().length;
    const coinsBefore = w.EOL.econ.coins();
    d.querySelector('.buy-pack[data-pack="trio"]').click();
    // the pack on the opening table must wear the wrapper that was bought
    t(
      Array.from(d.querySelectorAll('#po-pack .pk-face')).length >= 3 &&
        Array.from(d.querySelectorAll('#po-pack .pk-face')).every((f) => f.classList.contains('pk-trio')),
      'the opening pack (and both burst halves) wear the Trio skin'
    );
    for (let g = 0; g < 20 && w.EOL.shop.state() !== 'summary'; g++) {
      if (w.EOL.shop.state() === 'await') w.EOL.shop.charge();
      await sleep(150);
    }
    t(w.EOL.shop.state() === 'summary', 'the pack opens to its summary');
    t($('po-summary').textContent.indexOf('Preview only') < 0, "the demo-era 'Preview only' note is DEAD");
    t($('po-summary').textContent.indexOf('Yours now') >= 0, 'the summary tells the truth: the cards are owned');
    t(w.EOL.econ.coins() === coinsBefore - 200, 'the Trio pack cost 200 coins');
    t(w.EOL.econ.unownedEntries().length === before - 3, 'three NEW legends joined the collection');
    t(w.EOL.shop.results().every((e) => e.faction.id !== 'huaxia'), 'no Huaxia in the pull');
    t(w.EOL.shop.results().every((e) => e.card.rarity !== 'legendary'), 'and no legendary - the Crown Law holds in the pull');
    t(w.EOL.shop.results().every((e) => w.EOL.econ.owns(e.card.id)), 'the pull is OWNED (granted at roll time)');
    t(!$('po-again').hidden, 'Open Another appears while another Trio pack is affordable');
    const drain = w.EOL.econ.coins() - 199;
    w.EOL.econ.spend(drain);
    t($('po-again').hidden, 'Open Another hides immediately when the pack is no longer affordable');
    w.EOL.econ.addCoins(drain);
    w.EOL.shop.close();
  }

  /* ---------- THE CROWN LAW + THE LEGEND PACK ---------- */
  {
    const P = w.EOL.shop.PACKS;
    t(
      ['trio', 'echo', 'crown'].every((k) =>
        P[k].odds.concat(P[k].final || []).every((row) => row[0] !== 'legendary')
      ),
      'no odds table anywhere names a legendary'
    );
    t(w.EOL.cloud && typeof w.EOL.cloud.push === 'function' && w.EOL.cloud.status() === 'off', 'the vault idles signed-out (local play untouched)');
    t(
      w.EOL.cloud.KEYS.indexOf('eol.wallet.v1') >= 0 &&
        w.EOL.cloud.KEYS.indexOf('eol.shop.codes.v1') >= 0 &&
        w.EOL.cloud.KEYS.indexOf('eol.campaign.ch1.progress') >= 0 &&
        w.EOL.cloud.KEYS.indexOf('eol.decks.v1') >= 0,
      'the vault registry carries wallet, redeemed codes, campaign, and decks'
    );
    // On Legend, Gate II ends Camelot's road: its ONE legendary arrives
    // at clear time, then plays a one-card reward ceremony on the map.
    w.EOL.campaign.setDifficulty('legend');
    t(!w.EOL.econ.owns('camelot-king-arthur'), 'the crown is not owned before the Legend gate falls');
    w.EOL.campaign._recordClear(w.EOL.campaign._stageById(2));
    t(w.EOL.econ.owns('camelot-king-arthur'), 'Gate II grants its legend at CLEAR time (refresh-proof)');
    t(w.EOL.campaign.getProgress().pendingLegend === 2, 'with the ceremony queued');
    w.EOL.ui.show('chapter');
    await sleep(1500);
    t(d.body.dataset.view === 'chapter', 'Legendary reveal opens after the chapter map returns');
    t(
      $('pack-opening').parentNode === d.body && $('pack-opening').classList.contains('on'),
      'the global reward theater is actually visible over the chapter map'
    );
    t(
      !$('po-campaign-award').hidden &&
        $('po-campaign-award').textContent.indexOf('Legendary reward pack') >= 0 &&
        $('po-campaign-award-name').textContent.indexOf('Gate II cleared') >= 0 &&
        $('po-campaign-award').textContent.indexOf('King Arthur') < 0,
      'the gate popup confirms the pack without revealing its Legendary'
    );
    const gate2Rewards = d.querySelector('[data-campaign-stage="2"] .sc-rewards');
    t(
      gate2Rewards &&
        gate2Rewards.querySelectorAll('.sc-reward').length === 2 &&
        !!gate2Rewards.querySelector('.coin') &&
        !!gate2Rewards.querySelector('.legendary') &&
        gate2Rewards.textContent.indexOf('Legendary reward pack') >= 0 &&
        gate2Rewards.textContent.indexOf('300') >= 0 &&
        gate2Rewards.textContent.indexOf('King Arthur') < 0,
      'a Legend gate receipt shows its 300 coins beside the spoiler-free pack'
    );
    for (let g = 0; g < 30 && w.EOL.shop.state() !== 'summary'; g++) {
      if (w.EOL.shop.state() === 'await') w.EOL.shop.charge();
      await sleep(150);
    }
    t(w.EOL.shop.state() === 'summary', 'the Legend Pack ceremony plays to its summary');
    t(d.querySelector('#po-summary .po-sum-title').textContent === 'Legendary Acquired', 'the reveal ends on an explicit Legendary Acquired receipt');
    t(w.EOL.shop.results().length === 1 && w.EOL.shop.results()[0].card.id === 'camelot-king-arthur', 'one card in the wrapper - THE card');
    t($('po-cards').textContent.indexOf('King Arthur') >= 0, 'the Legendary identity appears only after the pack opens');
    t(
      $('po-again').hidden && w.getComputedStyle($('po-again')).display === 'none',
      'no visible Open Another action on a free Legend Pack'
    );
    t(!!d.querySelector('#po-pack .pk-face.pk-legend'), 'and it wears the Legend wrapper');
    w.EOL.shop.close();
    t(w.EOL.campaign.getProgress().pendingLegend === null, 'the ceremony never replays');
  }

  /* ---------- HEROIC EPIC REWARD: durable, then visibly confirmed ---------- */
  {
    w.EOL.campaign.setDifficulty('heroic');
    w.EOL.campaign._recordClear(w.EOL.campaign._stageById(1));
    const pending = w.EOL.campaign.getProgress().pendingEpic;
    t(
      pending && pending.stage === 1 && w.EOL.econ.owns(pending.card),
      'the Heroic Epic is owned immediately and queued safely before its ceremony'
    );
    w.EOL.ui.show('home');
    w.EOL.ui.show('chapter');
    await sleep(1200);
    t(
      $('pack-opening').classList.contains('on') &&
        !$('po-campaign-award').hidden &&
        $('po-campaign-award').textContent.indexOf('Epic reward pack') >= 0,
      'returning to the chapter map visibly confirms the awarded Heroic Epic'
    );
    for (let g = 0; g < 30 && w.EOL.shop.state() !== 'summary'; g++) {
      if (w.EOL.shop.state() === 'await') w.EOL.shop.charge();
      await sleep(100);
    }
    t(
      w.EOL.shop.state() === 'summary' &&
        d.querySelector('#po-summary .po-sum-title').textContent === 'Epic Acquired' &&
        !!d.querySelector('#po-pack .pk-face.pk-epic'),
      'the Heroic ceremony reveals one Epic in its own wrapper'
    );
    w.EOL.shop.close();
    t(w.EOL.campaign.getProgress().pendingEpic === null, 'the Epic ceremony clears its durable queue');
  }

  /* ---------- THE WORKBENCH + the readable vault document ---------- */
  {
    t(!!w.EOL.dev && typeof w.EOL.dev.coins === 'function', 'the owner workbench is loaded');
    t(typeof w.EOL.dev.resetRoad === 'function', 'resetRoad answers the campaign-reset question');
    const before = w.EOL.econ.coins();
    w.EOL.dev.coins(500);
    t(w.EOL.econ.coins() === before + 500, 'EOL.dev.coins(500) is the one-line test-coin answer');
    w.EOL.dev.coins(-500);
    t(w.EOL.econ.coins() === before, 'and negative takes them back');
    const doc = w.EOL.cloud._collect();
    t(doc.v === 2, 'the vault document is format v2');
    t(typeof doc.wallet === 'number' && doc.wallet === w.EOL.econ.coins(), 'wallet is a NUMBER a human can edit in the dashboard');
    t(Array.isArray(doc.owned), 'owned is a plain list of card ids');
    t(
      doc.flags && Array.isArray(doc.flags.shopCodes) && doc.flags.shopCodes.indexOf('CREATOR5000') >= 0,
      'the redeemed-code marker travels in the same Vault document as its coins'
    );
    t(doc.campaign && typeof doc.campaign === 'object' && Array.isArray(doc.campaign.cleared), 'campaign progress is a readable object');
    t(doc.settings && typeof doc.settings === 'object', 'settings are grouped, not scattered');
    t(!w.EOL.auth.pushDeck && !w.EOL.auth.deleteDeck, 'the dead per-deck sync hooks are gone with their table');
  }

  /* ---------- FIRST BLOOD in the ledger; draft gates list ROADS ---------- */
  {
    const prog = w.EOL.campaign.getProgress();
    [3, 6].forEach((n) => {
      if (prog.unlocked.indexOf(n) < 0) prog.unlocked.push(n);
      if (prog.fought.indexOf(n) < 0) prog.fought.push(n);
    });
    w.localStorage.setItem('eol.campaign.ch1.progress', JSON.stringify(prog));
    w.EOL.campaign.openLedger();
    await sleep(300);
    d.querySelector('#ledger-list .lg-row[data-lg="3"]').click();
    await sleep(250);
    t(d.querySelectorAll('#ledger-page .prep-c').length === 12, 'one fight (won or lost) writes the twelve into the ledger');
    t($('ledger-page').textContent.indexOf('Met, not beaten') >= 0, 'and the record says met, not beaten');
    d.querySelector('#ledger-list .lg-row[data-lg="6"]').click();
    await sleep(250);
    t(!d.querySelector('#ledger-page .prep-c'), 'a draft gate never claims a fixed twelve');
    t(
      d.querySelectorAll('#ledger-page .lg-fchip').length === 7,
      "the Trickster's page honestly lists every road represented on her capped table"
    );
    t(!!d.querySelector('#ledger-page .lg-fchip.featured'), 'with the featured faction wearing the bright crest');
    $('ledger-close').click();
    await sleep(200);
  }

  /* ---------- WARDEN REWARD: complete, ownership-aware road shelf ---------- */
  {
    /* A shop purchase before reaching the Warden must remain visible, but
       greyed and unavailable rather than disappearing from her full shelf. */
    w.EOL.econ.grant(['camelot-merlin']);
    w.EOL.campaign.setDifficulty('legend');
    w.EOL.campaign._recordClear(w.EOL.campaign._stageById(5));
    /* Re-enter as the real result flow does; calling show() on the already
       active chapter view intentionally emits no duplicate transition. */
    w.EOL.ui.show('home');
    w.EOL.ui.show('chapter');
    await sleep(350);
    t(!$('grant-choice').hidden, "the Warden's two-Echo reward reopens on the chapter map");
    const choices = Array.from(d.querySelectorAll('#grant-choice-grid .gc-card-choice'));
    const eligible = w.EOL.play
      ._flat()
      .filter(
        (entry) =>
          ['grimmwood', 'camelot', 'sherwood', 'olympus'].includes(entry.faction.id) &&
          entry.card.rarity !== 'legendary'
      );
    t(
      choices.length === eligible.length && choices.length === 25,
      'the Legend Warden shows every non-Legendary card from all four introduced factions'
    );
    t(
      choices.every((el) => el.dataset.cid !== 'camelot-king-arthur' && el.dataset.cid !== 'sherwood-robin-hood' && el.dataset.cid !== 'olympus-zeus'),
      'the Warden never includes Legendary cards'
    );
    t(
      choices.length > 0 &&
        choices.every((el) => el.classList.contains('prep-c') && !!el.querySelector('.bcard-art') && !!el.querySelector('.bcard-role')),
      'every Warden option uses the Ledger miniature-card language'
    );
    const owned = d.querySelector('#grant-choice-grid [data-cid="camelot-merlin"]');
    t(
      !!owned &&
        owned.classList.contains('is-owned') &&
        owned.getAttribute('aria-disabled') === 'true' &&
        owned.textContent.indexOf('Owned') >= 0,
      'already-owned Warden cards stay visible, greyed, and marked Owned'
    );
    owned.click();
    t(owned.getAttribute('aria-checked') === 'false', 'an owned Warden card cannot be selected again');
    const available = choices.filter((el) => !el.classList.contains('is-owned'));
    if (available.length >= 2) {
      available[0].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      available[1].click();
      t(
        available[0].getAttribute('aria-checked') === 'true' &&
          available[1].getAttribute('aria-checked') === 'true',
        'unowned Warden cards support keyboard and pointer selection semantics'
      );
      t(!$('grant-choice-go').disabled, 'the reward unlocks only after two unowned cards are selected');
      $('grant-choice-go').click();
      await sleep(100);
      t($('grant-choice').hidden, 'claiming the Warden cards closes the reward');
    } else {
      t(false, 'unowned Warden cards support keyboard and pointer selection semantics');
      t(false, 'the reward unlocks only after two unowned cards are selected');
      t(false, 'claiming the Warden cards closes the reward');
    }
  }

  /* ---------- DAILY PUZZLE: two explicit attempts ---------- */
  {
    w.EOL.daily._showOfficialStatus({
      attempts_used: 0,
      attempts_remaining: 2,
      attempted: false,
      finished: false,
      won: false,
    });
    t(
      $('daily-status').textContent === 'Ready · 2 attempts remaining' &&
        $('daily-enter').querySelector('span').textContent === 'Begin first attempt',
      'a fresh Daily Puzzle offers the first of two attempts'
    );
    w.EOL.daily._showOfficialStatus({
      attempts_used: 1,
      attempts_remaining: 1,
      attempted: false,
      finished: true,
      won: false,
    });
    t(
      $('daily-status').textContent === 'Ready · 1 attempt remaining' &&
        $('daily-enter').querySelector('span').textContent === 'Begin second attempt',
      'one spent Daily attempt leaves a clearly named second attempt'
    );
    w.EOL.daily._showOfficialStatus({
      attempts_used: 2,
      attempts_remaining: 0,
      attempted: true,
      finished: true,
      won: false,
    });
    t($('daily-enter').hidden, 'the Daily Puzzle offers no third attempt');
    w.EOL.daily.cancel();
  }

  /* ---------- mojibake sweep ---------- */
  {
    const walker = d.createTreeWalker(d.body, w.NodeFilter.SHOW_TEXT);
    let n,
      bad = [];
    while ((n = walker.nextNode())) {
      if (/[\u00c2\ufffd]|\u00e2\u20ac/.test(n.textContent)) bad.push(n.textContent.trim().slice(0, 60));
    }
    t(bad.length === 0, 'no mojibake anywhere in the rendered DOM' + (bad.length ? ' (' + bad[0] + ')' : ''));
    // stale-copy sweep: demo-era language must never resurface
    t(d.body.textContent.indexOf('Preview only') < 0 && d.body.textContent.indexOf('nothing was added') < 0, 'no demo-era copy anywhere in the DOM');
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
