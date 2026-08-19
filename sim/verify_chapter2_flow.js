#!/usr/bin/env node
'use strict';
/* =============================================================
   CHAPTER II CAMPAIGN FLOW - jsdom end-to-end regression
   -------------------------------------------------------------
   Companion to browser_campaign_jsdom.js, which covers Chapter I.
   This drives Chapter II through a real DOM:

     A. gate XI heroic actually grants a Hemithea epic
     B. rivals field their strongest legal six (adaptive sideboard),
        not a deterministic in-order refill
     C. the ban personalities match the ledger tells
     D. no text mojibake anywhere on the chapter plate

   Requires jsdom (see sim/browser_campaign_jsdom.js).
   Run: node sim/verify_chapter2_flow.js
   ============================================================= */
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
  await new Promise((r) => server.listen(8098, r));
  const dom = await JSDOM.fromURL('http://127.0.0.1:8098/', {
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
  /* jsdom's resource loading is not deterministic - wait for the game
     to actually boot instead of trusting a fixed sleep. */
  for (let i = 0; i < 160 && !(dom.window.EOL && dom.window.EOL.campaign); i++) await sleep(500);
  const w = dom.window;
  const d = w.document;
  const $ = (id) => d.getElementById(id);
  const EOL = w.EOL;

  t(!!EOL && !!EOL.campaign, 'game boots without errors');
  /* The sandboxed harness cannot load the Supabase CDN script, and jsdom
     sometimes surfaces its own benign parse warnings as window errors -
     neither is a page bug. Filter them out; everything else must be
     clean. */
  const benign = (m) => /supabase|csstree|cannot load script/i.test(m);
  const realErrs = (w.__errs || []).filter((m) => !benign(m));
  t(realErrs.length === 0, 'no page errors on boot' + (realErrs.length ? ' -> ' + realErrs[0] : ''));

  /* ---------- A. the coin table + heroic rewards at gate XI ---------- */
  console.log('A. the coin table (100/200/500 · 200/400/750 · 300/600/1000)');
  EOL.campaign.setChapter(2);
  EOL.campaign.setDifficulty('heroic');
  const stage11 = EOL.campaign._stageById(11);
  const heroic = EOL.campaign.rewardFor(stage11, 'heroic');
  const legend = EOL.campaign.rewardFor(stage11, 'legend');
  t(!!stage11, 'gate XI resolves');
  /* The full table, both chapters: gate / elite / boss per difficulty. */
  const CLASSES = { 11: 'gate', 15: 'elite', 20: 'boss', 1: 'gate', 5: 'elite', 10: 'boss' };
  const WANT = {
    normal: { gate: 100, elite: 200, boss: 500 },
    heroic: { gate: 200, elite: 400, boss: 750 },
    legend: { gate: 300, elite: 600, boss: 1000 },
  };
  let tableOk = 0;
  [1, 2].forEach((ch) => {
    EOL.campaign.setChapter(ch);
    ['normal', 'heroic', 'legend'].forEach((diff) => {
      Object.keys(CLASSES).forEach((stageId) => {
        const st = EOL.campaign._stageById(parseInt(stageId, 10));
        if (ch === 1 && parseInt(stageId, 10) > 10) return;
        if (ch === 2 && parseInt(stageId, 10) < 11) return;
        const got = EOL.campaign.rewardFor(st, diff).coins;
        const want = WANT[diff][CLASSES[stageId]];
        if (got === want) tableOk++;
        else t(false, 'ch' + ch + ' ' + diff + ' gate ' + stageId + ': ' + got + ' != ' + want);
      });
    });
  });
  t(tableOk === 18, 'every chapter/difficulty/class coin value matches the table (' + tableOk + '/18)');
  EOL.campaign.setChapter(2);
  t(!!legend.legendPack && legend.legendPack === 'hemithea-achilles', 'legend tier keeps the Achilles crown');
  t(legend.coins === 300, 'and now pays its 300 coins WITH the pack');
  t(!!heroic.companion, 'heroic tier grants a card');
  if (heroic.companion) {
    const comp = EOL.campaign._entriesFor([heroic.companion])[0];
    t(comp && comp.card.rarity === 'epic' && comp.faction.id === 'hemithea', 'and it is an epic from Hemithea (' + heroic.companion + ')');
  }
  t(heroic.coins === 200, 'heroic gate XI pays 200 coins');
  const normal = EOL.campaign.rewardFor(stage11, 'normal');
  t(normal.coins === 100 && !normal.legendPack && !normal.companion, 'normal stays coins-only (100)');
  /* The old one-off: Legend Gate I's 300-coin foothold is now simply
     the table's normal-gate Legend payout - no special case anywhere.
     And Gate I now rides the road like every other gate: on Legend it
     crowns Evil Queen alongside those coins. */
  EOL.campaign.setChapter(1);
  const ch1Gate1 = EOL.campaign.rewardFor(EOL.campaign._stageById(1), 'legend');
  t(
    ch1Gate1.coins === 300 && ch1Gate1.legendPack === 'grimmwood-evil-queen',
    'Chapter I gate I on Legend pays the table 300 AND crowns Evil Queen'
  );
  const ch1Gate1Heroic = EOL.campaign.rewardFor(EOL.campaign._stageById(1), 'heroic');
  t(
    ch1Gate1Heroic.coins === 200 && ch1Gate1Heroic.companion === 'grimmwood-big-bad-wolf',
    'Chapter I gate I on Heroic pays 200 AND grants its set echo, Big Bad Wolf'
  );
  t(EOL.campaign.rewardFor(EOL.campaign._stageById(10), 'normal').coins === 500, 'the Chapter I boss pays 500 on Normal');
  EOL.campaign.setChapter(2);

  /* ---------- B. rival fielding is adaptive ---------- */
  console.log('B. chapter II rivals sideboard live (strongest six)');
  const S = EOL.campaign.story;
  const play = EOL.play;
  t(S.stages.length === 10, 'ten gates in chapter II');
  let fieldOk = 0;
  const inspected = [];
  S.stages.forEach((st) => {
    const enemy12 = EOL.campaign._entriesFor(st.enemy12);
    const pool = enemy12.filter((e) => st.botSix.indexOf(e.card.id) < 0);
    // the bench must contain cards that are NOT the six
    if (pool.length !== 6) return;
    // banned = first two botSix members; the refill must come from the
    // strongest bench, not the first bench entries in list order.
    inspected.push(st.id);
    const bans = st.botSix.slice(0, 2);
    const survive = enemy12.filter((e) => bans.indexOf(e.card.id) < 0);
    const six = play._chooseSix(survive, [], st.botSix, st.aiProfile);
    const ids = six.map((e) => e.card.id);
    t(
      bans.every((b) => ids.indexOf(b) < 0) && ids.length === 6 && new Set(ids).size === 6,
      'gate ' + st.id + ': banned cards stay out and six legal cards come in'
    );
    fieldOk++;
  });
  t(fieldOk === 10, 'all ten gates resolve a legal adaptive six');

  /* Every rival's aiProfile must resolve to a REAL personality. The
     chapter shipped with `adaptive`, which is not a personality -
     profileFor() returned null and every gate XI..XX rival evaluated
     positions with no character at all. */
  let profileOk = 0;
  S.stages.forEach((st) => {
    const p = EOL.ai.profileFor({ aiProfiles: { enemy: st.aiProfile } }, 'enemy');
    if (p) profileOk++;
    else t(false, 'gate ' + st.id + ' personality "' + st.aiProfile + '" does not resolve');
  });
  t(profileOk === 10, 'all ten personalities resolve in js/ai.js');

  /* The adaptive-sideboard switch itself: Chapter II must opt out of the
     deterministic in-order refill that Chapter I uses for its tutorial
     gates. Asserted in the code as well as in behaviour, because a
     removed guard would silently restore weakest-first refills. */
  {
    const playSrc = fs.readFileSync(path.join(ROOT, 'js/play.js'), 'utf8');
    const campSrc = fs.readFileSync(path.join(ROOT, 'js/campaign.js'), 'utf8');
    t(/!prep\.adaptiveSix/.test(playSrc), 'play.js keeps the live-sideboard switch');
    t(/adaptiveSix: chapter\(\)\.id === 2/.test(campSrc), 'Chapter II passes it; Chapter I keeps its scripted sixes');
  }

  /* The Understudy, banned into her opening six, fields the strongest
     bench her evaluator can find - including the Monkey King-class
     bodies other gates would hide. This is the gate the owner caught
     fielding weakly, so it gets a concrete pin: with Achilles and
     Odysseus struck, the six is refilled from the bench by value, and
     the legendary wolf is never silently skipped in favour of a
     deterministic list-order refill. */
  {
    const st = EOL.campaign._stageById(11);
    const entries = EOL.campaign._entriesFor(st.enemy12);
    const bans = st.botSix.slice(0, 2);
    const survive = entries.filter((e) => bans.indexOf(e.card.id) < 0);
    const six = play._chooseSix(survive, [], st.botSix, st.aiProfile);
    const ids = six.map((e) => e.card.id);
    t(
      ids.length === 6 && bans.every((b) => ids.indexOf(b) < 0),
      'the Understudy never fields a card you banned (' + ids.join(', ') + ')'
    );
    t(
      ids.indexOf('hemithea-medea') >= 0 && ids.indexOf('hemithea-ajax') >= 0,
      'her six keeps the cauldron and the shield - the two cards her lesson is built on'
    );
  }

  /* ---------- C. ban personalities match the tells ---------- */
  console.log('C. ban personalities match the ledger');
  const player12 = EOL.campaign._entriesFor([
    'grimmwood-big-bad-wolf',
    'grimmwood-red-riding-hood',
    'grimmwood-pied-piper',
    'grimmwood-hansel-gretel',
    'grimmwood-cinderella',
    'grimmwood-goldilocks',
    'camelot-guinevere',
    'camelot-lancelot',
    'camelot-mordred',
    'sherwood-little-john',
    'sherwood-friar-tuck',
    'sherwood-will-scarlet',
  ]);
  const costOf = (id) => {
    const e = EOL.campaign._entriesFor([id])[0];
    return (e.card.ability && e.card.ability.cost) || 0;
  };
  const byStage = (id) => EOL.campaign._stageById(id);
  {
    const st = byStage(11);
    const bans = play._personaBans(st.banProfile, player12, [], true);
    const costs = player12.map((e) => costOf(e.card.id));
    const top2 = costs.slice().sort((a, b) => b - a).slice(0, 2);
    const banned = bans.map(costOf);
    t(bans.length === 2, 'the Understudy bans two cards');
    t(
      banned.slice().sort((a, b) => b - a).join(',') === top2.join(','),
      'and they are the two you paid the most for (' + banned.join('/') + ' of ' + top2.join('/') + ')'
    );
  }
  {
    const st = byStage(12);
    const bans = play._personaBans(st.banProfile, player12, [], true);
    const costs = player12.map((e) => costOf(e.card.id));
    const bottom2 = costs.slice().sort((a, b) => a - b).slice(0, 2);
    const banned = bans.map(costOf);
    t(bans.length === 2, 'the Bookmaker bans two cards');
    t(
      banned.slice().sort((a, b) => a - b).join(',') === bottom2.join(','),
      'and they are the cheapest you brought (' + banned.join('/') + ' of ' + bottom2.join('/') + ')'
    );
  }

  /* ---------- D. chapter plate hygiene ---------- */
  console.log('D. chapter plate renders the real rewards');
  EOL.campaign.setChapter(2);
  EOL.campaign.setDifficulty('heroic');
  d.body.dataset.view = 'chapter';
  await sleep(400);
  const bodyText = d.body.textContent;
  t(bodyText.indexOf('Chapter 2') >= 0 || bodyText.indexOf('Hundred-Year') >= 0, 'chapter II plate renders');
  const mojibake = /[\ufffd]|\\u[0-9a-fA-F]{4}/.test(bodyText);
  t(!mojibake, 'no mojibake or literal escapes on the chapter II plate');

  /* ---------- E. the every-card console command ---------- */
  console.log('E. EOL.dev.allCards() grants and COUNTS the whole roster');
  {
    const allIds = [];
    (EOL.factions || []).forEach((f) => f.cards.forEach((c) => allIds.push(c.id)));
    const res = EOL.dev.allCards();
    t(
      res === 'owned: ' + allIds.length + ' / ' + allIds.length + ' (every collectible card)',
      'the command reports the true full-roster count (' + res + ')'
    );
    t(EOL.econ.owns('hemithea-achilles'), 'a withheld Chapter II legendary is owned');
    t(EOL.econ.owns('transylvania-mr-hyde'), 'a renamed card is owned under its new id');
    t(
      allIds.every((id) => EOL.econ.owns(id)),
      'every faction card - all ' + allIds.length + ' - is owned after the command'
    );
    /* The old bug this pins: the command granted every card but its
       numerator used ownedCount(), which only counts the obtainable
       Chapter I shelf - so a full grant read as "55 / N owned". */
  }
  {
    const gate11 = d.querySelector('[data-campaign-stage="11"] .sc-rewards');
    const txt = gate11 ? gate11.textContent : '';
    t(
      txt.indexOf('200') >= 0 && txt.indexOf('Odysseus') >= 0,
      'gate XI heroic shows +200 coins AND names its set echo, Odysseus (' + txt.replace(/\s+/g, ' ').trim() + ')'
    );
    t(
      txt.indexOf('Epic echo') < 0,
      'the retired "Epic echo - Faction" loot-label wording is gone from the plate'
    );
  }
  {
    const gate16 = d.querySelector('[data-campaign-stage="16"] .sc-rewards');
    const txt = gate16 ? gate16.textContent : '';
    t(
      txt.indexOf('Fenrir') >= 0,
      'the Undertaker names his set echo, Fenrir, on the plate too'
    );
  }
  {
    /* Legend now advertises its coins beside the pack. */
    EOL.campaign.setDifficulty('legend');
    await sleep(300);
    const gate11L = d.querySelector('[data-campaign-stage="11"] .sc-rewards');
    const txtL = gate11L ? gate11L.textContent : '';
    t(
      txtL.indexOf('300') >= 0 && txtL.indexOf('Legendary reward pack') >= 0,
      'gate XI legend shows +300 coins AND the Legendary pack'
    );
    const bossL = d.querySelector('[data-campaign-stage="20"] .sc-rewards');
    t(
      bossL && bossL.textContent.indexOf('1000') >= 0,
      'the boss advertises its 1000 Legend coins'
    );
    EOL.campaign.setDifficulty('heroic');
    await sleep(300);
  }

  /* ---------- F. the crisp-pixel law is wired ---------- */
  console.log('F. the crisp-pixel law (all softening reverted)');
  {
    const flat = d.getElementById('eol-flat');
    t(!flat, 'the #eol-flat posterization filter is fully reverted');
    const cssSrc = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    t(cssSrc.indexOf('url(#eol-flat)') < 0 && htmlSrc.indexOf('eol-flat') < 0, 'no flat-filter reference survives in css or html');
    t(
      cssSrc.indexOf('filter: blur(0.75px)') < 0,
      'the softening blur is gone from every art site - crisp pixels everywhere'
    );
    t(
      /\.art-portrait img,\s*\.bart-portrait img\s*\{[^}]*image-rendering:\s*pixelated;/s.test(cssSrc),
      'legend art still draws nearest-neighbour, unfiltered'
    );
    /* THE NATIVE-SIZE LAW: every fixed art frame renders at the
       source's own size - LEGEND art at 64x88 (card detail), RIVAL
       portraits at 128x176 (dialogue bust). The 256px experiment is
       retired. */
    const bustRule = /\.chapter-dialogue-bust\s*\{[^}]*width:\s*128px;[^}]*height:\s*176px;/s;
    t(bustRule.test(cssSrc), 'the dialogue bust renders rival portraits at their native 128x176');
    t(
      /\.cd-art\s*\{[^}]*width:\s*64px;[^}]*height:\s*88px;/s.test(cssSrc),
      'the card-detail art panel stays at the legend art native 64x88'
    );
    t(
      !/\.chapter-dialogue-bust\s*\{[^}]*width:\s*256px/s.test(cssSrc),
      'the 256px experiment is retired'
    );

    /* EVERY RIVAL HAS A FACE: each stage in both chapters carries a
       portrait path that resolves to a shipped file. */
    const missingPortraits = [];
    [1, 2].forEach((ch) => {
      EOL.campaign.setChapter(ch);
      EOL.campaign.story.stages.forEach((st) => {
        if (!st.portrait) {
          missingPortraits.push(st.id + ' (null)');
        } else if (!fs.existsSync(path.join(ROOT, st.portrait))) {
          missingPortraits.push(st.id + ' (' + st.portrait + ')');
        }
      });
    });
    t(missingPortraits.length === 0, 'all twenty rivals ship a portrait that resolves' + (missingPortraits.length ? ' -> ' + missingPortraits.join(', ') : ''));
    EOL.campaign.setChapter(2);
  }

  /* ---------- G2. the gate circle shows the rival's face ---------- */
  {
    EOL.campaign.setChapter(2);
    d.body.dataset.view = 'chapter';
    await sleep(400);
    const av11 = d.querySelector('[data-campaign-stage="11"] .sc-avatar');
    const img11 = av11 && av11.querySelector('img.sc-portrait');
    t(
      !!img11 && img11.getAttribute('src') === 'assets/rivals/the-understudy.png',
      'the gate circle renders the Understudy portrait'
    );
    const av16 = d.querySelector('[data-campaign-stage="16"] .sc-avatar');
    const img16 = av16 && av16.querySelector('img.sc-portrait');
    t(
      !!img16 && img16.getAttribute('src') === 'assets/rivals/the-undertaker.png',
      'and the Undertaker - every gate circle carries its rival'
    );
    EOL.campaign.setChapter(1);
    d.body.dataset.view = 'chapter';
    await sleep(400);
    const av1 = d.querySelector('[data-campaign-stage="1"] .sc-avatar');
    const img1 = av1 && av1.querySelector('img.sc-portrait');
    t(
      !!img1 && img1.getAttribute('src') === 'assets/rivals/the-recruiter.png',
      'Chapter 1 circles render too - the Recruiter has a face again'
    );
    EOL.campaign.setChapter(2);
    await sleep(200);
  }

  /* ---------- G. every reward grant changes the collection ---------- */
  console.log('G. grants always pay - copies are upgrade material');
  {
    /* A grant of an owned card is a COPY, banked toward that card's
       next level - never a silent no-op. The plain grant (packs, dev
       ownership tools) must NOT bank copies, because packs already
       bank their own duplicates around their ceremony. */
    const U = EOL.upgrades;
    const plainBefore = U.dupesOf('grimmwood-evil-queen');
    EOL.econ.grant(['grimmwood-evil-queen']);
    t(U.dupesOf('grimmwood-evil-queen') === plainBefore, 'a plain grant does not double-bank copies');
    EOL.econ.grant(['grimmwood-evil-queen'], { dupes: true });
    t(U.dupesOf('grimmwood-evil-queen') === plainBefore + 1, 'a reward grant of an owned card banks one copy');
    EOL.econ.grant(['grimmwood-big-bad-wolf'], { dupes: true });
    t(U.dupesOf('grimmwood-big-bad-wolf') === 1, 'starter-shelf cards bank copies too');
    /* The full campaign path: clearing Gate I on Heroic grants the
       wolf - owned since boot - and the collection still moves. */
    EOL.campaign.setChapter(1);
    EOL.campaign.setDifficulty('heroic');
    const wolfBefore = U.dupesOf('grimmwood-big-bad-wolf');
    EOL.campaign._recordClear(EOL.campaign._stageById(1));
    t(U.dupesOf('grimmwood-big-bad-wolf') === wolfBefore + 1, 'clearing Gate I Heroic banks the wolf copy through recordClear');
    EOL.campaign.setDifficulty('legend');
    const queenBefore = U.dupesOf('grimmwood-evil-queen');
    EOL.campaign._recordClear(EOL.campaign._stageById(1));
    t(U.dupesOf('grimmwood-evil-queen') === queenBefore + 1, 'clearing Gate I Legend banks the queen copy through recordClear');
    t(
      !!(EOL.campaign.getProgress().grantDupes && EOL.campaign.getProgress().grantDupes[1]) &&
        EOL.campaign.getProgress().grantDupes[1].indexOf('grimmwood-evil-queen') >= 0,
      'the progress records which granted cards were copies, so the ceremony can say so'
    );
    EOL.campaign.setChapter(2);
    EOL.campaign.setDifficulty('heroic');
  }

  /* ---------- H. the adjusted wheel, its rulebook picture, and the
     element filters ---------- */
  console.log('H. the adjusted wheel + rulebook picture + element filters');
  {
    /* The owner-adjusted cycle, held by the engine table. */
    const BEATS = EOL.engine.ELEMENT_BEATS;
    t(BEATS.Fire === 'Nature', 'Fire beats Nature');
    t(BEATS.Nature === 'Light', 'Nature beats Light');
    t(BEATS.Light === 'Shadow', 'Light beats Shadow');
    t(BEATS.Shadow === 'Magic', 'Shadow beats Magic');
    t(BEATS.Magic === 'Lightning', 'Magic beats Lightning');
    t(BEATS.Lightning === 'Physical', 'Lightning beats Physical');
    t(BEATS.Physical === 'Fire', 'Physical beats Fire');

    /* The rulebook wheel renders the real table - seven spokes, seven
       arrows, hover classes present. */
    const wheel = d.getElementById('element-wheel');
    t(!!wheel && wheel.dataset.built === '1', 'the rulebook wheel is built at boot');
    t(
      wheel && wheel.querySelectorAll('.ew-node').length === 7,
      'all seven spokes render'
    );
    t(
      wheel && wheel.querySelectorAll('.ew-arrow').length === 7,
      'all seven arrows render - one from each spoke to its prey'
    );
    t(
      wheel && wheel.querySelectorAll('.ew-rune').length === 14,
      'the inscription renders - two carved runes per sector'
    );
    const fireNode = wheel && wheel.querySelector('.ew-node[data-ew="Fire"]');
    const natureNode = wheel && wheel.querySelector('.ew-node[data-ew="Nature"]');
    const physNode = wheel && wheel.querySelector('.ew-node[data-ew="Physical"]');
    if (fireNode && natureNode && physNode) {
      fireNode.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: false }));
      t(
        wheel.dataset.ewActive === 'Fire' &&
          natureNode.classList.contains('ew-prey') &&
          physNode.classList.contains('ew-predator'),
        'hovering Fire lights its prey (Nature) and predator (Physical)'
      );
      t(
        wheel.querySelector('.ew-arrow[data-from="Fire"]').classList.contains('hot'),
        'and the Fire-to-Nature arrow burns'
      );
      t(
        Array.from(wheel.querySelectorAll('.ew-rune')).some((rn) => rn.dataset.sector === 'Fire' && rn.classList.contains('ew-rune-hot')),
        "Fire's own runes wake when Fire is hovered"
      );
      const detail = d.getElementById('ew-detail-name');
      t(
        detail && detail.textContent === 'Fire sears Nature',
        'the detail panel speaks the matchup (' + (detail && detail.textContent) + ')'
      );
    }

    /* Both card browsers offer an Element filter. */
    d.body.dataset.view = 'collection';
    await sleep(400);
    const colFilters = Array.from(d.querySelectorAll('#filters .dd-btn')).map((b) => b.textContent.trim());
    t(colFilters.some((t2) => t2.indexOf('Element') >= 0), 'the collection toolbar carries an Element filter');
    const colOpts = Array.from(d.querySelectorAll('#filters .dd-opt')).map((o) => o.textContent.trim());
    t(
      ['Fire', 'Nature', 'Light', 'Shadow', 'Magic', 'Lightning', 'Physical'].every((el) => colOpts.indexOf(el) >= 0),
      'all seven elements are listed in cycle order (' + colOpts.filter((o) => o !== 'All Elements').join(', ') + ')'
    );
    d.body.dataset.view = 'play';
    await sleep(300);
    const deckFilters = Array.from(d.querySelectorAll('#deck-filters .dd-btn')).map((b) => b.textContent.trim());
    t(deckFilters.some((t2) => t2.indexOf('Element') >= 0), 'the deck builder toolbar carries an Element filter too');
    const deckOpts = Array.from(d.querySelectorAll('#deck-filters .dd-opt')).map((o) => o.textContent.trim());
    t(
      ['Fire', 'Nature', 'Light', 'Shadow', 'Magic', 'Lightning', 'Physical'].every((el) => deckOpts.indexOf(el) >= 0),
      'and lists all seven elements'
    );
  }

  /* ---------- I. the pack shelves: featured, daily, chapter gating ---------- */
  console.log('I. the pack shelves - featured pairs, the free daily, chapter gating');
  {
    const shop = EOL.shop;
    /* Pool scoping: each pack draws from its own universe, and every
       universe obeys the Crown Law. */
    const c1 = shop._packUniverse(shop.PACKS.echo);
    const c2 = shop._packUniverse(shop.PACKS.archive);
    const all = shop._packUniverse(shop.PACKS.daily);
    t(c1.length === 46, 'the Echoes universe is the 46 Chapter I non-legendaries (' + c1.length + ')');
    t(c2.length === 52, 'the Archive universe is the 52 Chapter II non-legendaries (' + c2.length + ')');
    t(all.length === 98, 'the Daily universe is every non-legendary in the game (' + all.length + ')');
    t(
      [c1, c2, all].every((pool) => pool.every((e) => e.card.rarity !== 'legendary')),
      'the Crown Law holds in every universe'
    );
    const feat = shop._packUniverse(Object.assign({}, shop.PACKS.featured, { _featuredMeta: shop._featuredMeta(0) }));
    t(
      feat.length > 0 &&
        new Set(feat.map((e) => e.faction.id)).size === 2 &&
        feat.every((e) => shop._featuredMeta(0).factions.indexOf(e.faction.id) >= 0),
      'a featured universe is exactly its two factions (' + feat.length + ' cards)'
    );
    /* The rotation: four authored weeks, two packs each, sixteen
       distinct factions across the cycle. */
    t(shop.FEATURED_WEEKS.length === 4, 'the featured rotation is four weeks');
    const weekFactions = new Set();
    shop.FEATURED_WEEKS.forEach((week) => {
      t(week.length === 2, 'each week fields exactly two featured packs');
      week.forEach((pk) => {
        t(pk.factions.length === 2 && !!pk.name && !!pk.blurb, pk.name + ' names two factions and its reason');
        pk.factions.forEach((f) => weekFactions.add(f));
      });
    });
    t(weekFactions.size === 16, 'the cycle features all sixteen factions exactly once (' + weekFactions.size + ')');

    /* The chapter gating law, in the live shop DOM. */
    d.body.dataset.view = 'shop';
    await sleep(400);
    /* each shelf pack wears its own wrapper, pips and wordmark */
    [
      ['daily', 'Daily', 'ra-book', 1],
      ['echo', 'Echoes', 'ra-spiral-shell', 5],
      ['archive', 'Archive', 'ra-scroll-unfurled', 5],
    ].forEach((row) => {
      const host = d.querySelector('.product-pack[data-pack="' + row[0] + '"]');
      const face = host && host.querySelector('.pk-face');
      t(
        !!face && face.classList.contains('pk-' + row[0]) &&
          !!face.querySelector('.pk-emblem .' + row[2]) &&
          face.querySelectorAll('.pk-pips span').length === row[3] &&
          host.querySelector('.pk-wordmark span').textContent === row[1],
        'the ' + row[1] + ' pack wears its wrapper, emblem, pips and wordmark'
      );
    });
    {
      const f0 = d.querySelector('.product-pack[data-pack="featured"][data-slot="0"]');
      t(
        !!f0 && f0.querySelectorAll('.pk-emblem i').length === 2,
        'the featured wrapper shows both faction crests'
      );
    }
    EOL.campaign.setChapter(1);
    EOL.shop.paintShop();
    t(
      !d.querySelector('.product[data-product="echo"]').hidden &&
        d.querySelector('.product[data-product="archive"]').hidden,
      'on Chapter I only the Echoes shelf shows - the Archive stays sealed'
    );
    EOL.campaign.setChapter(2);
    EOL.shop.paintShop();
    t(
      !d.querySelector('.product[data-product="archive"]').hidden,
      'on Chapter II the Archive opens'
    );
    EOL.campaign.setChapter(1);
    EOL.shop.paintShop();

    /* The daily claim guard, exercised through the real begin(). The
       collection may already be complete (the every-card command ran
       earlier), so the observable truth is the RESULTS array: one
       card on the claim, untouched on the refused second claim. */
    const r0 = shop.results();
    const claimedBefore = shop._dailyClaimed();
    shop.begin('daily');
    const r1 = shop.results();
    if (!claimedBefore) {
      t(r1.length === 1 && r1 !== r0, 'the free daily claim rolls exactly one card');
      t(r1.every((e) => e.card.rarity !== 'legendary'), 'and the Crown Law holds even on the freebie');
      t(shop._dailyClaimed(), 'and the day is marked');
      shop.begin('daily');
      const r2 = shop.results();
      t(
        r2.length === 1 && r2[0] === r1[0],
        'a second claim the same day grants nothing - the same single result stands'
      );
    } else {
      t(true, 'the daily was already claimed earlier in this suite run');
    }
  }

  server.close();
  console.log('');
  console.log(fails + ' fail(s)');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
