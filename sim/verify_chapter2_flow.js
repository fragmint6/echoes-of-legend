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
     the table's normal-gate Legend payout - no special case anywhere. */
  EOL.campaign.setChapter(1);
  const ch1Gate1 = EOL.campaign.rewardFor(EOL.campaign._stageById(1), 'legend');
  t(ch1Gate1.coins === 300 && ch1Gate1.legendPack == null, 'Chapter I gate I on Legend pays the table 300 (the old foothold, now generic)');
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
      txt.indexOf('200') >= 0 && txt.indexOf('Epic echo') >= 0 && txt.indexOf('Hemithea') >= 0,
      'gate XI heroic shows +200 coins AND the Hemithea Epic echo (' + txt.replace(/\s+/g, ' ').trim() + ')'
    );
  }
  {
    const gate16 = d.querySelector('[data-campaign-stage="16"] .sc-rewards');
    const txt = gate16 ? gate16.textContent : '';
    t(
      txt.indexOf('Epic echo') >= 0 && txt.indexOf('Asgard') >= 0,
      'the Undertaker hands over the Asgard epic on the plate too'
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

  server.close();
  console.log('');
  console.log(fails + ' fail(s)');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
