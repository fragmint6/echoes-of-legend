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
  for (let i = 0; i < 8 && !$('chapter-dialogue').hidden; i++) {
    $('chapter-dialogue-next').click();
    await sleep(50);
  }
  await sleep(900);
  t(!$('deck-modal').classList.contains('show'), 'no deck picker on the scripted gate');
  t(d.body.dataset.view === 'prep', 'prep opens directly');
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
  await sleep(600);
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
  t(sawStatusLesson, 'round 3 taught reading the status sigils (and the hover)');
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
  t($('result-stats').textContent.indexOf("The Recruiter's legends") >= 0, "the enemy column carries the rival's name");
  t($('result-coins').hidden, 'campaign battles pay through their gates, not per match');
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
  t($('ledger-page').textContent.indexOf('Likes to strike:') >= 0, 'the habit names the MECHANISM, not just the reputation');
  t($('ledger-page').textContent.indexOf('your hardest hitters') >= 0, 'derived truthfully from the ban profile');
  t($('ledger-page').textContent.indexOf('Only front-row legends') >= 0, 'the Ground carries the full arena laws, not just a name');
  t($('ledger-page').textContent.indexOf('lazy back row') >= 0, 'and the counsel (recommended bans/decks) is there');
  t($('ledger-page').textContent.indexOf('Unwritten until the gate is walked') >= 0, 'but his twelve stays unwritten');
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
      (el) => p2.advice.bans.indexOf(el.dataset.cid) < 0
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
  t(!!w.EOL.campaign._navGuide(), 'wayfinder running for the bubble-skip test');
  t(!$('nav-guide').hidden, 'bubble up (with its skip pill riding along)');
  $('nav-guide-skip').click();
  await sleep(500);
  t(!w.EOL.campaign._navGuide(), 'bubble skip retires the wayfinder');
  t(d.body.dataset.view === 'home', 'and leaves the player exactly where they stood');
  t($('chapter-dialogue').hidden, 'without opening anything on their behalf');
  t($('nav-guide').hidden, 'bubble gone after the skip');
  w.EOL.ui.show('chapter');
  await sleep(700);

  /* ---------- THE ECONOMY: wallet, locks, the shelf ---------- */
  t(w.EOL.econ.coins() === 100, 'Gate I paid its 100 coins into the ONE wallet (' + w.EOL.econ.coins() + ')');
  t(w.EOL.econ.owns('grimmwood-snow-white'), 'the starter twelve is owned forever');
  t(!w.EOL.econ.owns('camelot-king-arthur'), 'ungranted legends are NOT owned');
  t(!w.EOL.econ.owns('huaxia-sun-wukong') && w.EOL.econ.obtainableEntries().every((e) => e.faction.id !== 'huaxia'), 'Huaxia is unobtainable (Chapter 2 cargo)');
  // the deck editor's grid wears the locks
  t(!d.querySelector('#deck-grid .card[data-id="grimmwood-snow-white"]').classList.contains('unowned'), 'owned cards are open in the deck editor');
  t(d.querySelector('#deck-grid .card[data-id="duat-anubis"]').classList.contains('unowned'), 'unowned cards are locked in the deck editor');
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
  // the shelf: buy a Trio pack for real
  // (jsdom never fetches images, so check the sprites exist on disk)
  {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');
    t(fs.existsSync(path.join(root, 'assets/ui/coin.png')), 'the minted coin sprite exists on disk');
    for (const k of ['trio', 'echo', 'crown'])
      t(fs.existsSync(path.join(root, 'assets/packs', k + '.png')), 'the ' + k + ' wrapper painting exists on disk');
  }
  w.EOL.econ.addCoins(1000);
  w.EOL.ui.show('shop');
  await sleep(700);
  t($('shop-wallet').textContent.indexOf('1,100') >= 0 || $('shop-wallet').textContent.indexOf('1100') >= 0, 'the shop shows the wallet');
  // the minted coin sprite (2026-08-10): currency no longer borrows the energy bolt
  t(!!$('shop-wallet').querySelector('img.coin-ico'), 'the wallet wears the minted coin, not the energy bolt');
  t(!$('shop-wallet').querySelector('.ra-lightning-bolt'), 'no lightning bolt anywhere near the wallet');
  // tiered pixel wrappers: each shelf pack wears its own painting + name
  for (const [key, word] of [['trio', 'Trio'], ['echo', 'Echoes'], ['crown', 'Crown']]) {
    const host = d.querySelector('.product-pack[data-pack="' + key + '"]');
    const art = host && host.querySelector('.pk-art');
    t(!!art && art.getAttribute('src') === 'assets/packs/' + key + '.png', 'the ' + word + ' pack wears its own wrapper art');
    t(!!host && host.querySelector('.pk-wordmark span').textContent === word, 'and its wordmark says ' + word);
  }
  w.EOL.shop.setFast(true);
  {
    const before = w.EOL.econ.unownedEntries().length;
    const coinsBefore = w.EOL.econ.coins();
    d.querySelector('.buy-pack[data-pack="trio"]').click();
    // the pack on the opening table must wear the wrapper that was bought
    t(
      Array.from(d.querySelectorAll('#po-pack .pk-art')).length >= 3 &&
        Array.from(d.querySelectorAll('#po-pack .pk-art')).every((img) => img.getAttribute('src') === 'assets/packs/trio.png'),
      'the opening pack (and both burst halves) wear the Trio wrapper'
    );
    for (let g = 0; g < 20 && w.EOL.shop.state() !== 'summary'; g++) {
      if (w.EOL.shop.state() === 'await') w.EOL.shop.charge();
      await sleep(150);
    }
    t(w.EOL.shop.state() === 'summary', 'the pack opens to its summary');
    t(w.EOL.econ.coins() === coinsBefore - 120, 'the Trio pack cost 120 coins');
    t(w.EOL.econ.unownedEntries().length === before - 3, 'three NEW legends joined the collection');
    t(w.EOL.shop.results().every((e) => e.faction.id !== 'huaxia'), 'no Huaxia in the pull');
    t(w.EOL.shop.results().every((e) => w.EOL.econ.owns(e.card.id)), 'the pull is OWNED (granted at roll time)');
    w.EOL.shop.close();
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
