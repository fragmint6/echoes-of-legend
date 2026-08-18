#!/usr/bin/env node
'use strict';

/* =============================================================
   CHAPTER II CAMPAIGN - the playable Road
   node sim/verify_chapter2_campaign.js
   -------------------------------------------------------------
   docs/CHAPTER-2-OVERVIEW.md was design-only until 2026-08-18e.
   data/campaign-ch2.js is the implementation, and this suite is the
   contract between them: if the doc says the boss hands over
   Pandemonium and the data does not, one of them is wrong and the
   build should say so.

   It also re-runs every structural law Chapter I learned the hard
   way, because a second chapter is a second chance to make all the
   same mistakes:

     - the progression law (a bout may only field factions the
       player has already been handed) - Chapter I leaked Kami and
       Roma cards into gate VI for weeks;
     - the constructed-deck law on every twelve (12 cards, <= 2
       crowns, <= 4 of a role) - a rival with an illegal twelve
       cannot field a legal six;
     - grants that name real cards from met factions - gate IV
       promised Hercules after he changed faction;
     - epilogues that do not promise cards the bout never gives.

   Run alongside sim/verify_chapter2.js, which covers the FACTIONS.
   This one covers the CAMPAIGN.
   ============================================================= */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + msg);
  } else {
    fail++;
    console.log('  FAIL  ' + msg);
  }
}

global.window = {};
require(path.join(ROOT, 'data/_schema.js'));
fs.readdirSync(path.join(ROOT, 'data'))
  .filter(
    (f) =>
      f.endsWith('.js') &&
      !['_schema.js', 'roles.js', 'lore.js', 'battlefields.js', 'campaign-ch1.js', 'campaign-ch2.js', 'draft-ai.js'].includes(f)
  )
  .forEach((f) => require(path.join(ROOT, 'data', f)));
require(path.join(ROOT, 'data/battlefields.js'));
require(path.join(ROOT, 'data/campaign-ch2.js'));

const EOL = window.EOL;
const S = EOL.campaignCh2;
const R = EOL.deckRules;
const CARD = {};
EOL.factions.forEach((f) => f.cards.forEach((c) => (CARD[c.id] = { card: c, faction: f.id })));
const FIELDS = new Set(EOL.battlefields.map((b) => b.id));

/* Chapter II opens on the full Chapter I shelf and adds one faction per
   introducing bout. The exams introduce nothing. */
const CH1 = ['grimmwood', 'camelot', 'sherwood', 'olympus', 'yamato', 'roma', 'kami', 'duat'];
const INTRO = {
  11: 'hemithea',
  12: 'huaxia',
  13: 'genesis',
  14: 'transylvania',
  16: 'asgard',
  17: 'devas',
  18: 'tortuga',
  20: 'pandemonium',
};
const EXAMS = [15, 19];

console.log('A. shape');
{
  ok(!!S, 'data/campaign-ch2.js registers window.EOL.campaignCh2');
  ok(S.stages.length === 10, 'ten bouts (' + S.stages.length + ')');
  ok(
    S.stages.map((s) => s.id).join(',') === '11,12,13,14,15,16,17,18,19,20',
    'numbered XI..XX so the Road continues rather than restarting'
  );
  ok(Object.keys(INTRO).length === 8, 'eight bouts introduce a faction, as in Chapter I');
  ok(
    EXAMS.every((id) => !INTRO[id]),
    'the two exams introduce nothing'
  );
  /* Chapter I's shape, restated: the BOSS introduces a faction. This is
     the fact I originally got wrong about Chapter I, which produced a
     bogus "8 factions into 7 slots" deficit. */
  ok(INTRO[20] === 'pandemonium', 'the boss (XX) hands over the last faction, as Gilgamesh hands over Duat');
  ok(!!S.bossCard && S.bossCard.unbannable && S.bossCard.pinned, 'the boss card is unbannable and pinned');
  ok(!!S.bossFaction, 'the boss carries its own faction record so it never enters a draft pool');
  ok(S.bossCard.art === null, 'the boss card has no art yet - the owner is drawing the rivals');
}

console.log('B. every twelve is a legal constructed deck');
S.stages.forEach((st) => {
  const d = st.enemy12 || [];
  const unknown = d.filter((i) => !CARD[i]);
  ok(d.length === 12, 'bout ' + st.id + ': twelve cards (' + d.length + ')');
  ok(new Set(d).size === d.length, 'bout ' + st.id + ': no duplicates');
  ok(unknown.length === 0, 'bout ' + st.id + ': every id resolves' + (unknown.length ? ' (' + unknown + ')' : ''));
  if (unknown.length) return;
  const crowns = d.filter((i) => CARD[i].card.rarity === 'legendary').length;
  ok(crowns <= R.MAX_LEGENDARIES, 'bout ' + st.id + ': at most ' + R.MAX_LEGENDARIES + ' crowns (' + crowns + ')');
  const roles = {};
  d.forEach((i) => (roles[CARD[i].card.role] = (roles[CARD[i].card.role] || 0) + 1));
  const over = Object.keys(roles).filter((r) => roles[r] > R.MAX_PER_ROLE);
  ok(over.length === 0, 'bout ' + st.id + ': role cap respected' + (over.length ? ' (' + over + ')' : ''));
  const six = st.botSix || [];
  ok(six.length === R.FIELD_SIZE, 'bout ' + st.id + ': an authored six');
  ok(
    six.every((i) => d.indexOf(i) >= 0),
    'bout ' + st.id + ': the six is drawn from the twelve'
  );
});

console.log('C. the progression law');
S.stages.forEach((st) => {
  const met = new Set(CH1);
  Object.keys(INTRO).forEach((k) => {
    if (+k <= st.id) met.add(INTRO[k]);
  });
  const leak = (st.enemy12 || []).filter((i) => CARD[i] && !met.has(CARD[i].faction));
  ok(
    leak.length === 0,
    'bout ' + st.id + ': fields only factions the player has met' + (leak.length ? ' (LEAK ' + leak.join(', ') + ')' : '')
  );
  /* The rival must actually FIELD the faction it hands over, or the
     bout is not a demonstration of it - that is the whole Chapter I
     pattern (the Outlaw sells Sherwood by playing Sherwood). */
  if (INTRO[st.id]) {
    const own = (st.enemy12 || []).filter((i) => CARD[i] && CARD[i].faction === INTRO[st.id]).length;
    ok(own >= 6, 'bout ' + st.id + ': fields its own faction in depth (' + own + ' of ' + INTRO[st.id] + ')');
  }
});

console.log('D. grants match the design');
S.stages.forEach((st) => {
  const g = st.grants || {};
  const keys = Object.keys(g);
  ok(
    keys.every((k) => ['coins', 'legendPack', 'companion', 'choice'].indexOf(k) >= 0),
    'bout ' + st.id + ': grant keys are known (' + keys.join(',') + ')'
  );
  const met = new Set(CH1);
  Object.keys(INTRO).forEach((k) => {
    if (+k <= st.id) met.add(INTRO[k]);
  });
  [g.legendPack, g.companion].filter(Boolean).forEach((id) => {
    ok(!!CARD[id], 'bout ' + st.id + ': granted card ' + id + ' exists');
    if (CARD[id]) {
      ok(met.has(CARD[id].faction), 'bout ' + st.id + ': grants from a met faction (' + CARD[id].faction + ')');
    }
  });
  if (INTRO[st.id]) {
    ok(
      !!g.legendPack && CARD[g.legendPack] && CARD[g.legendPack].card.rarity === 'legendary',
      'bout ' + st.id + ': an introducing bout pays its faction crown'
    );
    ok(
      CARD[g.legendPack].faction === INTRO[st.id],
      'bout ' + st.id + ": the crown belongs to the faction being introduced"
    );
  } else {
    ok(!g.legendPack, 'bout ' + st.id + ' (exam): pays no faction crown');
    ok(!!g.choice, 'bout ' + st.id + ' (exam): pays choice-of-two, as Chapter I exams do');
  }
});

console.log('E. boards and formats');
S.stages.forEach((st) => {
  const fields = st.fightCard || (st.field ? [st.field] : []);
  const bad = fields.filter((f) => !FIELDS.has(f));
  ok(fields.length > 0, 'bout ' + st.id + ': a board is pinned');
  ok(bad.length === 0, 'bout ' + st.id + ': boards exist' + (bad.length ? ' (' + bad + ')' : ''));
  if (st.mode === 'set') {
    ok(fields.length === 3, 'bout ' + st.id + ': a best-of-3 pins three boards');
  }
  ok(!!st.line && !!st.resultWin && !!st.resultLose, 'bout ' + st.id + ': authored line and both results');
});

console.log('F. dialogue is complete and honest');
{
  const NAMES = [];
  EOL.factions.forEach((f) =>
    f.cards.forEach((c) => {
      if (c.name.length > 3) NAMES.push(c.name);
    })
  );
  const GIVING = /Take |offers |offer |holds out|sets |slides |pushes |grants |join your echoes|walk with you|are yours|go with you|change hands/i;
  S.stages.forEach((st) => {
    ok(((S.dialogues || {})[st.id] || []).length > 0, 'bout ' + st.id + ': has a pre-fight scene');
    ok(((S.epilogues || {})[st.id] || []).length > 0, 'bout ' + st.id + ': has an epilogue');
    const scene = (S.dialogues[st.id] || []);
    ok(
      scene.some((l) => l.battle),
      'bout ' + st.id + ': the scene ends in a fight'
    );
    ok(
      ((S.epilogues[st.id] || []).slice(-1)[0] || {}).final === true,
      'bout ' + st.id + ': the epilogue closes itself'
    );
    /* THE CHAPTER I BUG, guarded here from the start: an epilogue may
       not name a legend in a giving line unless the bout grants it. */
    const g = st.grants || {};
    const given = [g.legendPack, g.companion].filter(Boolean).map((id) => CARD[id] && CARD[id].card.name);
    const text = (S.epilogues[st.id] || []).map((l) => l.text || '').join(' ');
    if (GIVING.test(text)) {
      const promised = NAMES.filter((n) => text.indexOf(n) >= 0);
      const unfulfilled = promised.filter((n) => given.indexOf(n) < 0);
      ok(
        unfulfilled.length === 0,
        'bout ' + st.id + ': names no card it does not grant' +
          (unfulfilled.length ? ' (' + unfulfilled.join(', ') + ')' : '')
      );
    }
  });
  ok((S.intro || []).length > 0, 'the chapter has an intro scene');
}

console.log('G. the doc and the data agree');
{
  const over = fs.readFileSync(path.join(ROOT, 'docs/CHAPTER-2-OVERVIEW.md'), 'utf8');
  const NAME = {
    11: 'The Understudy',
    12: 'The Bookmaker',
    13: 'The Herald',
    14: 'The Collector',
    15: 'The Hero of the Bridge',
    16: 'The Undertaker',
    17: 'The Mason',
    18: 'The Wrecker',
    19: 'The Auditor',
    20: 'Asmodeus',
  };
  S.stages.forEach((st) => {
    ok(st.rival.indexOf(NAME[st.id]) >= 0, 'bout ' + st.id + ' is ' + NAME[st.id] + ' in the data');
    ok(over.indexOf(NAME[st.id]) >= 0, 'bout ' + st.id + ' is ' + NAME[st.id] + ' in the overview');
  });
  /* The unlock map, pinned against the doc's own reward table.
     The doc numbers bouts in ROMAN numerals ("| XI The Understudy |"),
     so match on those - an arabic match finds nothing and fails every
     row, which is what the first draft of this check did. */
  const ROMAN = {
    11: 'XI', 12: 'XII', 13: 'XIII', 14: 'XIV', 15: 'XV',
    16: 'XVI', 17: 'XVII', 18: 'XVIII', 19: 'XIX', 20: 'XX',
  };
  Object.keys(INTRO).forEach((id) => {
    const faction = INTRO[id];
    const pretty = faction.charAt(0).toUpperCase() + faction.slice(1);
    const row = over
      .split('\n')
      .filter((l) => l.trim().startsWith('|') && new RegExp('\\b' + ROMAN[id] + '\\b').test(l));
    ok(
      row.some((l) => l.indexOf(pretty) >= 0),
      'the overview credits bout ' + ROMAN[id] + ' with ' + pretty
    );
  });
}

console.log('H. wired into the page');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(html.indexOf('data/campaign-ch2.js') >= 0, 'index.html loads the chapter data');
  ok(html.indexOf('id="chapter-2"') >= 0, 'index.html has a Chapter 2 plate');
  ok(html.indexOf('assets/chapter-2/cw-bg.png') >= 0, 'the plate uses the Chapter 2 cover art');
  ok(fs.existsSync(path.join(ROOT, 'assets/chapter-2/cw-bg.png')), 'the cover art exists on disk');
  ok(html.indexOf('data-chapter-stages="2"') >= 0, 'the Chapter 2 stage list exists');
  S.stages.forEach((st) => {
    ok(
      html.indexOf('data-campaign-stage="' + st.id + '"') >= 0,
      'bout ' + st.id + ' has a stage card in the page'
    );
  });
  const js = fs.readFileSync(path.join(ROOT, 'js/campaign.js'), 'utf8');
  ok(/setChapter/.test(js), 'js/campaign.js exposes setChapter');
  ok(/eol\.campaign\.ch2\.progress/.test(js), 'Chapter II has its own progress key');
  ok(!/var STORY = /.test(js), 'the module no longer binds a single chapter at load');
  const play = fs.readFileSync(path.join(ROOT, 'js/play.js'), 'utf8');
  ok(/chapter-2/.test(play), 'js/play.js binds the Chapter 2 plate');
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
