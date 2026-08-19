/* =============================================================
   ROAD DIFFICULTY + REWARD CONTRACT
   node sim/verify_campaign_difficulty.js
   ============================================================= */
'use strict';

const storage = new Map();
global.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
global.document = {
  readyState: 'loading',
  body: { dataset: {} },
  addEventListener() {},
  dispatchEvent() {},
  getElementById() {
    return null;
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
global.window = global;
window.EOL = {};

require('../data/_schema.js');
require('../data/roles.js');
['camelot', 'duat', 'grimmwood', 'huaxia', 'olympus', 'roma', 'sherwood', 'kami', 'yamato'].forEach(
  (id) => require('../data/' + id + '.js')
);
require('../data/battlefields.js');
require('../data/campaign-ch1.js');
require('../js/engine.js');
/* Real economy + upgrades: grants of owned cards bank copies, and the
   suite proves it below. */
require('../js/upgrades.js');
require('../js/economy.js');
require('../js/campaign.js');

let checks = 0;
let fails = 0;
function ok(condition, message) {
  checks++;
  console.log((condition ? '  PASS  ' : '  FAIL  ') + message);
  if (!condition) fails++;
}

const C = EOL.campaign;
const stages = C.story.stages;

storage.set(
  'eol.campaign.ch1.progress',
  JSON.stringify({
    v: 2,
    unlocked: [1, 2],
    cleared: [1],
    fought: [1],
    grants: ['grimmwood-rapunzel'],
    pendingLegend: 2,
    pendingChoice: 5,
    coins: 150,
  })
);
let migrated = C.getProgress();
ok(
  migrated.v === 3 &&
    migrated.runs.normal.cleared.includes(1) &&
    migrated.runs.heroic.cleared.length === 0 &&
    migrated.runs.legend.cleared.length === 0 &&
    migrated.runs.normal.pendingLegend === 2 &&
    migrated.runs.normal.pendingChoice === 5 &&
    migrated.grants.includes('grimmwood-rapunzel') &&
    JSON.parse(storage.get('eol.campaign.ch1.progress')).v === 3,
  'legacy Road progress migrates into Normal while Heroic and Legend begin fresh'
);
storage.clear();

/* THE COIN TABLE (2026-08-19): gate / elite / boss per difficulty.
   Normal 100/200/500, Heroic 200/400/750, Legend 300/600/1000. Every
   difficulty pays every gate - Legend's old packs-instead-of-coins
   rule is gone. */
const normalCoins = stages.map((stage) => C.rewardFor(stage, 'normal').coins);
const heroicCoins = stages.map((stage) => C.rewardFor(stage, 'heroic').coins);
const legendCoins = stages.map((stage) => C.rewardFor(stage, 'legend').coins);
ok(
  JSON.stringify(normalCoins) === JSON.stringify([100, 100, 100, 100, 200, 100, 100, 100, 200, 500]),
  'Normal pays 100 per gate, 200 per elite, and 500 for the boss'
);
ok(
  JSON.stringify(heroicCoins) === JSON.stringify([200, 200, 200, 200, 400, 200, 200, 200, 400, 750]),
  'Heroic pays 200 per gate, 400 per elite, and 750 for the boss'
);
ok(
  JSON.stringify(legendCoins) === JSON.stringify([300, 300, 300, 300, 600, 300, 300, 300, 600, 1000]),
  'Legend pays 300 per gate, 600 per elite, and 1000 for the boss - coins AND packs'
);

const introduced = {
  1: 'grimmwood',
  2: 'camelot',
  3: 'sherwood',
  4: 'olympus',
  6: 'yamato',
  7: 'roma',
  8: 'kami',
  10: 'duat',
};
/* REPLACED 2026-08-18d. Heroic used to roll a RANDOM epic from the
   gate's faction; it now hands over the SECOND LEGEND THE EPILOGUE
   NAMES, pinned in data as `grants.companion`.

   The old assertion is inverted rather than deleted, because the change
   is a ruling and not a refactor: every gate epilogue names two echoes
   ("King Arthur and Lancelot join your echoes") and the code granted
   one, so the script was lying at seven gates. The random epic was the
   natural slot for the second name - it was already a second card, it
   was already faction-locked, and nobody could plan around the
   randomness anyway.

   Two things are asserted: the companion is what Heroic pays, and the
   random-epic path is GONE for those gates (epicFaction must be unset,
   or a gate would quietly pay three cards). */
ok(
  Object.keys(introduced).every((id) => {
    const stage = stages[+id - 1];
    const reward = C.rewardFor(stage, 'heroic');
    const companion = (stage.grants || {}).companion;
    return companion ? reward.companion === companion && !reward.epicFaction : true;
  }),
  'every non-elite Heroic gate awards the second legend its epilogue names'
);
ok(
  Object.keys(introduced).every((id) => {
    const stage = stages[+id - 1];
    return !(stage.grants || {}).companion || !C.rewardFor(stage, 'heroic').epicFaction;
  }),
  'the old random-Epic roll no longer fires alongside the named companion'
);

const heroicFive = C.rewardFor(stages[4], 'heroic').choice;
const heroicNine = C.rewardFor(stages[8], 'heroic').choice;
ok(
  heroicFive.count === 2 &&
    JSON.stringify(heroicFive.rarities) === JSON.stringify(['common', 'rare']) &&
    JSON.stringify(heroicFive.factions) ===
      JSON.stringify(['grimmwood', 'camelot', 'sherwood', 'olympus']),
  'Heroic Mid-Road offers two Common/Rare cards from every introduced faction'
);
ok(
  heroicNine.factions.length === 7 &&
    heroicNine.factions.includes('yamato') &&
    heroicNine.factions.includes('roma') &&
    heroicNine.factions.includes('kami'),
  'Heroic Last Guardian includes every faction introduced before Gate IX'
);

const legendFive = C.rewardFor(stages[4], 'legend').choice;
ok(
  legendFive.count === 2 &&
    legendFive.rarities.includes('epic') &&
    !legendFive.rarities.includes('legendary'),
  'Legend elites offer two non-Legendaries, including Epics but never crowns'
);
ok(
  [2, 3, 4, 6, 7, 8, 10].every((id) => !!C.rewardFor(stages[id - 1], 'legend').legendPack),
  'Legend retains every existing faction Legendary reward'
);

/* Independent progression plus concrete first-clear payouts. The real
   economy runs: a fresh account owns the whole Grimmwood starter
   shelf, so Gate I's set rewards arrive as COPIES. */
C._recordClear(stages[0]);
let progress = C.getProgress();
ok(
  C.difficulty() === 'normal' && progress.cleared.includes(1) && progress.coins === 100,
  'a Normal first clear records only in the Normal run and pays 100'
);
C.setDifficulty('heroic');
progress = C.getProgress();
ok(
  progress.cleared.length === 0 && progress.unlocked.length === 1,
  'Heroic has an independent ten-gate progression'
);
C._recordClear(stages[0]);
progress = C.getProgress();
const epicId = progress.pendingEpic && progress.pendingEpic.card;
const epicEntry = EOL.factions
  .flatMap((faction) => faction.cards.map((card) => ({ card, faction })))
  .find((entry) => entry.card.id === epicId);
ok(
  progress.coins === 300 &&
    epicId === 'grimmwood-big-bad-wolf' &&
    epicEntry &&
    epicEntry.card.rarity === 'epic' &&
    epicEntry.faction.id === 'grimmwood',
  'a Heroic first clear pays its 200 coins (100 Normal + 200 Heroic in the shared wallet) and persists its SET epic - Big Bad Wolf'
);
ok(
  EOL.upgrades.dupesOf('grimmwood-big-bad-wolf') === 1,
  'the wolf grant changes the collection even though the starter shelf owns him - one copy banked'
);
C.setDifficulty('legend');
C._recordClear(stages[0]);
progress = C.getProgress();
ok(
  progress.coins === 600 &&
    progress.cleared.includes(1) &&
    progress.pendingLegend === 1 &&
    EOL.upgrades.dupesOf('grimmwood-evil-queen') === 1,
  "a Legend Gate I first clear adds its 300 coins and crowns the queen - a COPY banked, never a silent no-op"
);
C._recordClear(stages[1]);
progress = C.getProgress();
ok(
  progress.coins === 900 &&
    progress.pendingLegend === 2 &&
    EOL.econ.owns('camelot-king-arthur') &&
    EOL.upgrades.dupesOf('camelot-king-arthur') === 0,
  'every Legend gate pays coins - Gate II adds another 300, a NEW crown joins the collection, and no phantom copy is banked'
);
C.setDifficulty('normal');
ok(C.getProgress().cleared.includes(1), 'switching back restores the saved Normal run');

/* Engine-level stat scaling: player untouched; every rival gets the same
   multiplicative base ATK/DEF bonus before battle setup. */
const camelot = EOL.factions.find((faction) => faction.id === 'camelot');
const sherwood = EOL.factions.find((faction) => faction.id === 'sherwood');
const playerSix = camelot.cards.slice(0, 6).map((card) => ({ card, faction: camelot }));
const enemySix = sherwood.cards.slice(0, 6).map((card) => ({ card, faction: sherwood }));
/* DIFFICULTY IS RIVAL CARD LEVELS NOW (owner ruling 2026-08-19).
   -------------------------------------------------------------
   This section used to hardcode 0.1 / 0.2 and assert the flat
   ATK/DEF multiplier. Those assertions kept passing after the rework
   for the wrong reason: they called scaledRivalStats() and
   createBattle() with literal bonuses instead of reading the values
   the campaign actually ships, so they were testing a dormant code
   path while the live difficulty went unchecked.

   Everything below is driven off C.difficulties, so it can never
   again pass while describing a system the game does not use. The
   multiplier helper is still exercised - it remains in the engine for
   a future modifier - but it is no longer confused for the setting. */
const DIFFS = C.difficulties;
ok(
  DIFFS.heroic.bonus === 0 && DIFFS.legend.bonus === 0,
  'no difficulty ships a flat rival stat multiplier any more'
);
ok(
  DIFFS.normal.lv === 0 && DIFFS.heroic.lv === 1 && DIFFS.legend.lv === 2,
  'ordinary gates field Lv0 / Lv1 / Lv2 rivals'
);
ok(
  DIFFS.normal.eliteLv === 0 && DIFFS.heroic.eliteLv === 2 && DIFFS.legend.eliteLv === 3,
  'elites and the final boss field one level higher on Heroic and Legend'
);

/* The engine still honours a raw bonus - the path is dormant, not
   deleted - so the helper keeps its own test at an explicit value. */
const probe = EOL.engine.scaledRivalStats(enemySix[0].card.stats, 0.1);
ok(
  probe.atk === Math.round(enemySix[0].card.stats.atk * 1.1) &&
    probe.def === Math.round(enemySix[0].card.stats.def * 1.1) &&
    probe.hp === enemySix[0].card.stats.hp,
  'the rival stat helper still works when a caller passes a bonus explicitly'
);

/* A rival built at a difficulty's level must actually arrive levelled,
   with its ROLE's booster and no other stat touched. */
const ROLE_WANT = {
  Tank: 'hp',
  Bruiser: 'hp',
  Sniper: 'atk',
  Caster: 'atk',
  Controller: 'def',
  Medic: 'def',
};

/* ASSERT THE SHIPPED MAPPING, not just this file's copy of it.
   The payload builder below mirrors campaign.js so the engine leg of
   the test can run standalone - but a mirror that is never compared
   is a second source of truth, and flipping Bruiser to ATK in
   campaign.js would leave every assertion here green. So the real
   RIVAL_BOOST table is read out of the module source and checked
   against ROLE_WANT first. */
{
  const campSrc = require('fs').readFileSync(
    require('path').join(__dirname, '../js/campaign.js'),
    'utf8'
  );
  const table = campSrc.slice(
    campSrc.indexOf('var RIVAL_BOOST'),
    campSrc.indexOf('function isEliteStage')
  );
  const shipped = {};
  table.replace(/(\w+):\s*'(atk|def|hp)'/g, (_, role, stat) => {
    shipped[role] = stat;
    return '';
  });
  ok(
    Object.keys(ROLE_WANT).every((r) => shipped[r] === ROLE_WANT[r]) &&
      Object.keys(shipped).length === Object.keys(ROLE_WANT).length,
    'campaign.js RIVAL_BOOST matches the documented role mapping ' +
      JSON.stringify(shipped)
  );
}
function rivalPayload(entries, lv) {
  const out = {};
  entries.forEach((e) => {
    const boosts = [];
    for (let i = 0; i < lv; i++) boosts.push(ROLE_WANT[e.card.role]);
    out[e.card.id] = { lv: lv, boosts: boosts };
  });
  return out;
}
[
  ['Heroic gate', DIFFS.heroic.lv],
  ['Heroic elite', DIFFS.heroic.eliteLv],
  ['Legend gate', DIFFS.legend.lv],
  ['Legend elite', DIFFS.legend.eliteLv],
].forEach(([label, lv]) => {
  const B = EOL.engine.createBattle(playerSix, enemySix, {
    roleAware: false,
    enemyUpgrades: rivalPayload(enemySix, lv),
  });
  const foes = B.units.filter((u) => u.side === 'enemy');
  const mine = B.units.filter((u) => u.side === 'player');
  ok(
    foes.every((u) => u.upLevel === lv),
    label + ': every rival arrives at level ' + lv
  );
  ok(
    mine.every((u) => u.upLevel === 0),
    label + ': the difficulty never touches the player'
  );
  ok(
    foes.every((u) => {
      const want = ROLE_WANT[u.role];
      const s = u.card.stats;
      if (want === 'hp') return u.maxHp > s.hp && u.baseAtk === s.atk && u.baseDef === s.def;
      if (want === 'atk') return u.baseAtk > s.atk && u.maxHp === s.hp && u.baseDef === s.def;
      return u.baseDef > s.def && u.maxHp === s.hp && u.baseAtk === s.atk;
    }),
    label + ': each rival takes its role booster and moves no other stat'
  );
});

const fs = require('fs');
const path = require('path');
const playSource = fs.readFileSync(path.join(__dirname, '../js/play.js'), 'utf8');
ok(
  /scaledRivalStats\(card\.stats, bonus\)/.test(playSource) &&
    playSource.indexOf('prep-scale-chip') < 0 &&
    playSource.indexOf('dk-rival-scale') < 0 &&
    playSource.indexOf('% ATK/DEF') < 0 &&
    /scaledStatValue\(visibleStats\.atk/.test(playSource) &&
    /scaledStatValue\(visibleStats\.def/.test(playSource),
  'Preparation paints boosted raw rival ATK/DEF values without a difficulty-bonus chip'
);
const draftHandoff = playSource.slice(
  playSource.indexOf('function advancePack'),
  playSource.indexOf('THE SET (best-of-3)')
);
ok(
  /campaignDifficulty:\s*camp \? camp\.difficulty/.test(draftHandoff) &&
    /enemyStatBonus:\s*camp \? camp\.enemyStatBonus/.test(draftHandoff),
  'the completed Draft carries campaign difficulty and rival scaling into Preparation'
);
const battleSource = fs.readFileSync(path.join(__dirname, '../js/battle.js'), 'utf8');
ok(
  (battleSource.match(/enemyStatBonus:\s*opts\.enemyStatBonus/g) || []).length === 3,
  'all three battle construction paths pass the rival scaling bonus to the engine'
);

const campaignSource = fs.readFileSync(path.join(__dirname, '../js/campaign.js'), 'utf8');
ok(
  C.tutorialsEnabled('normal') &&
    !C.tutorialsEnabled('heroic') &&
    !C.tutorialsEnabled('legend'),
  'the centralized campaign tutorial law enables Normal only'
);
C.setDifficulty('legend');
document.body.dataset.auth = 'in';
C.startTutorial();
ok(
  C.difficulty() === 'normal',
  'an explicit signed-in tutorial replay leaves the cloud-selected hard Road and opens on Normal'
);
C.skipTutorial();
document.body.dataset.auth = 'out';
ok(
  /advisor:\s*tutorialsEnabled\(difficulty\.id\)/.test(campaignSource) &&
    /reactiveDialogue\(stage\) && !tutorialsEnabled\(B\)/.test(campaignSource) &&
    /if \(!tutorialsEnabled\(\)\) return;[\s\S]*var stage = stageById\(1\)/.test(campaignSource),
  'Heroic and Legend suppress advisor, early-gate teaching dialogue, and the campaign wayfinder'
);
ok(
  /if \(!campaignTutorialsEnabled\(cfg\)\)[\s\S]*cfg\.script = null;[\s\S]*cfg\.advisor = null;/.test(
    playSource
  ) &&
    /campaignTutorialsEnabled\(p\)[\s\S]*p\.advisor/.test(playSource) &&
    /campaignTutorialsEnabled\(opts\)[\s\S]*opts\.moveScript/.test(battleSource),
  'hard-mode prep and battle paths cannot enforce or paint stale tutorial scripts'
);

console.log('\n' + (fails ? `${fails} OF ${checks} CHECKS FAILED` : `ALL ${checks} CHECKS PASSED`));
process.exit(fails ? 1 : 0);
