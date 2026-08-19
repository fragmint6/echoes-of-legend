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

const normalCoins = stages.map((stage) => C.rewardFor(stage, 'normal').coins);
const heroicCoins = stages.map((stage) => C.rewardFor(stage, 'heroic').coins);
ok(
  JSON.stringify(normalCoins) === JSON.stringify([100, 100, 100, 100, 200, 100, 100, 100, 200, 300]),
  'Normal pays 100 per gate, 200 per elite, and 300 for Gilgamesh'
);
ok(
  JSON.stringify(heroicCoins) === JSON.stringify(normalCoins.map((coins) => coins * 2)),
  'Heroic doubles every Normal coin reward'
);
ok(
  JSON.stringify(stages.map((stage) => C.rewardFor(stage, 'legend').coins)) ===
    JSON.stringify([300, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  'Legend pays 300 coins at Gate I and no coins at later gates'
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

/* Independent progression plus concrete first-clear payouts. */
const paid = [];
const granted = [];
EOL.econ = {
  addCoins(value) {
    paid.push(value);
  },
  grant(ids) {
    granted.push(...ids);
  },
  owns() {
    return false;
  },
};
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
    epicEntry &&
    epicEntry.card.rarity === 'epic' &&
    epicEntry.faction.id === 'grimmwood',
  'a Heroic first clear pays double coins and persists its random faction Epic'
);
C.setDifficulty('legend');
C._recordClear(stages[0]);
progress = C.getProgress();
ok(
  progress.coins === 600 && progress.cleared.includes(1),
  'a Legend Gate I first clear pays its one-time 300 coins'
);
C._recordClear(stages[1]);
progress = C.getProgress();
ok(
  progress.coins === 600 && progress.pendingLegend === 2 && granted.includes('camelot-king-arthur'),
  'later Legend faction gates pay no coins and grant their crown at clear time'
);
C.setDifficulty('normal');
ok(C.getProgress().cleared.includes(1), 'switching back restores the saved Normal run');

/* Engine-level stat scaling: player untouched; every rival gets the same
   multiplicative base ATK/DEF bonus before battle setup. */
const camelot = EOL.factions.find((faction) => faction.id === 'camelot');
const sherwood = EOL.factions.find((faction) => faction.id === 'sherwood');
const playerSix = camelot.cards.slice(0, 6).map((card) => ({ card, faction: camelot }));
const enemySix = sherwood.cards.slice(0, 6).map((card) => ({ card, faction: sherwood }));
const visibleHeroic = EOL.engine.scaledRivalStats(enemySix[0].card.stats, 0.1);
const visibleLegend = EOL.engine.scaledRivalStats(enemySix[0].card.stats, 0.2);
ok(
  visibleHeroic.atk === Math.round(enemySix[0].card.stats.atk * 1.1) &&
    visibleHeroic.def === Math.round(enemySix[0].card.stats.def * 1.1) &&
    visibleLegend.atk === Math.round(enemySix[0].card.stats.atk * 1.2) &&
    visibleLegend.def === Math.round(enemySix[0].card.stats.def * 1.2) &&
    visibleHeroic.hp === enemySix[0].card.stats.hp,
  'the shared visual stat helper exposes the exact Heroic and Legend rival numbers'
);
const heroicBattle = EOL.engine.createBattle(playerSix, enemySix, {
  roleAware: false,
  enemyStatBonus: 0.1,
});
const heroicEnemy = heroicBattle.units.find((unit) => unit.side === 'enemy');
const heroicPlayer = heroicBattle.units.find((unit) => unit.side === 'player');
ok(
  heroicEnemy.baseAtk === Math.round(heroicEnemy.card.stats.atk * 1.1) &&
    heroicEnemy.baseDef === Math.round(heroicEnemy.card.stats.def * 1.1) &&
    heroicEnemy.maxHp === heroicEnemy.card.stats.hp &&
    heroicPlayer.baseAtk === heroicPlayer.card.stats.atk &&
    heroicPlayer.baseDef === heroicPlayer.card.stats.def &&
    heroicPlayer.maxHp === heroicPlayer.card.stats.hp,
  'Heroic applies +10% ATK/DEF to rivals only, without changing either side’s HP'
);
const legendBattle = EOL.engine.createBattle(playerSix, enemySix, {
  roleAware: false,
  enemyStatBonus: 0.2,
});
const legendEnemy = legendBattle.units.find((unit) => unit.side === 'enemy');
ok(
  legendEnemy.baseAtk === Math.round(legendEnemy.card.stats.atk * 1.2) &&
    legendEnemy.baseDef === Math.round(legendEnemy.card.stats.def * 1.2),
  'Legend applies +20% ATK/DEF to rivals'
);

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
