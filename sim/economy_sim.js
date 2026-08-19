/* =============================================================
   Echoes of Legend - Economy Sim & Invariants
   -------------------------------------------------------------
   node sim/economy_sim.js

   A. INVARIANTS - 400 rolls per pack tier over a fresh (starter-
      only) collection: sizes honoured, guarantees honoured, never
      a Huaxia card, never a duplicate inside one pack.
   B. THE RUN - a player who clears Normal Chapter 1 (1400 coins), buys
      Echoes Packs greedily, then grinds singleplayer at the owner
      rates (50 win / 25 loss, 65% winrate): how many packs and
      matches to a complete collection, and roughly how long?
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
/* headless shims for the browser-facing modules */
const MEM = {};
global.localStorage = {
  getItem: (k) => (k in MEM ? MEM[k] : null),
  setItem: (k, v) => {
    MEM[k] = String(v);
  },
  removeItem: (k) => {
    delete MEM[k];
  },
};
global.document = {
  addEventListener() {},
  dispatchEvent() {},
  getElementById: () => null,
  querySelectorAll: () => [],
};
global.CustomEvent = function () {};
[
  'js/text.js',
  'data/_schema.js',
  'data/roles.js',
  'data/camelot.js',
  'data/olympus.js',
  'data/sherwood.js',
  'data/grimmwood.js',
  'data/yamato.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/kami.js',
  'data/duat.js',
  'data/asgard.js',
  'data/hemithea.js',
  'data/pandemonium.js',
  'data/devas.js',
  'data/genesis.js',
  'data/transylvania.js',
  'data/tortuga.js',
  'js/economy.js',
  'js/shop.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL;
const econ = EOL.econ;
const shop = EOL.shop;

let pass = 0,
  fail = 0;
function ok(c, msg) {
  if (c) pass++;
  else {
    fail++;
    console.log('  FAIL  ' + msg);
  }
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log('A. pack invariants (400 rolls per tier, starter-only collection)');
econ._reset();
const creatorPolicy = econ.codePolicy('creator5000');
ok(
  creatorPolicy && creatorPolicy.coins === 5000 && creatorPolicy.singleUserOnly === false,
  'CREATOR5000 explicitly uses the every-account-once code mode'
);
const redemption = econ.redeemCode('  creator5000  ');
ok(
  redemption.ok && redemption.code === 'CREATOR5000' && redemption.coins === 5000,
  'CREATOR5000 is case-insensitive, trims pasted whitespace, and grants 5,000 coins'
);
ok(econ.coins() === 5000, 'the creator-code reward lands in the shared wallet');
const repeated = econ.redeemCode('CREATOR5000');
ok(!repeated.ok && repeated.status === 'redeemed' && econ.coins() === 5000, 'a code can be redeemed only once');
const invalid = econ.redeemCode('NOT-A-CODE');
ok(!invalid.ok && invalid.status === 'invalid' && econ.coins() === 5000, 'an unknown code grants nothing');
econ._reset();
const fresh = econ.unownedEntries();
/* the shelf is open now (2026-08-19): 115 cards obtainable, the
   starter's 12 Grimmwood owned at boot */
ok(fresh.length === 103, `obtainable-and-unowned at start is 103 (${fresh.length})`);
ok(
  fresh.some((e) => e.faction.id === 'huaxia'),
  'Huaxia is obtainable - the whole roster is on the shelf'
);
/* THE CROWN LAW (owner ruling 2026-08-10): packs sell echoes, never
   crowns - the packable pool is the unowned roster below legendary */
const packable = econ.packableEntries();
/* 103 unowned - 15 unowned legendaries (17 crowns, 2 owned by the
   Grimmwood starter) */
ok(packable.length === 88, `packable (unowned, sub-legendary) at start is 88 (${packable.length})`);
ok(
  packable.every((e) => e.card.rarity !== 'legendary'),
  'the packable pool holds no legendary'
);
ok(
  shop.PACKS.echo.price === 500 &&
    shop.PACKS.archive.price === 500 &&
    shop.PACKS.daily.price === 0 &&
    shop.PACKS.featured.price === 500,
  'shelf prices are Daily 0 / Echoes 500 / Archive 500 / Featured 500'
);
Object.keys(shop.PACKS).forEach((key) => {
  const pack = shop.PACKS[key];
  if (key === 'legend' || key === 'epic') {
    /* the Road's own wrappers: one card, no price, off the shelf */
    ok(pack.size === 1 && pack.price === 0, pack.name + ': one card, never priced');
    return;
  }
  const rng = mulberry(1234 + pack.price);
  let finalOk = true,
    dupeOk = true,
    sizeOk = true,
    huaxiaOk = true,
    crownOk = true;
  /* each pack rolls from its OWN universe (chapter, featured pair,
     whole roster), filtered to unowned */
  const universe = shop._packUniverse(pack).filter((e) => econ.unownedEntries().some((u) => u.card.id === e.card.id));
  const meta = pack.pool === 'featured' ? shop._featuredMeta(0) : null;
  const wantsHuaxia = pack.pool === 'chapter2' || pack.pool === 'all' || (meta && meta.factions.indexOf('huaxia') >= 0);
  for (let i = 0; i < 400; i++) {
    const out = shop.rollPack(rng, pack, universe.slice());
    if (out.length !== pack.size) sizeOk = false;
    const ids = out.map((e) => e.card.id);
    if (new Set(ids).size !== ids.length) dupeOk = false;
    if (out.some((e) => e.faction.id === 'huaxia') && !wantsHuaxia) huaxiaOk = false;
    if (out.some((e) => e.card.rarity === 'legendary')) crownOk = false;
    if (pack.final) {
      const last = out[out.length - 1];
      if (last.card.rarity !== 'epic') finalOk = false;
    }
  }
  ok(sizeOk, pack.name + ': always ' + pack.size + ' cards');
  ok(dupeOk, pack.name + ': never a duplicate inside a pack');
  ok(huaxiaOk, pack.name + ': stays inside its own universe');
  ok(crownOk, pack.name + ': NEVER a legendary - even fed the raw unowned roster');
  if (pack.final) ok(finalOk, pack.name + ': final-card guarantee (always Epic) holds');
  ok(
    (pack.price > 0 || pack.key === 'daily') && pack.odds.reduce((t, r) => t + r[1], 0) === 100,
    pack.name + ': odds sum to 100'
  );
});

/* C. the ownership math is roster-driven (2026-08-19) */
/* C. the ownership math is roster-driven (2026-08-19) */
const ECONOMY_SRC = fs.readFileSync(path.join(ROOT, 'js/economy.js'), 'utf8');
console.log('C. the ledger never disagrees with itself');
{
  /* The empty-cache guard: calling starterIds() before the faction
     files land must NOT poison the session - [] used to be cached
     (it is truthy), and every later count ran 12 starters short.
     Re-eval the module in a clean sub-environment to prove it. */
  const MEM2 = {};
  const sub = {
    localStorage: {
      getItem: (k) => (k in MEM2 ? MEM2[k] : null),
      setItem: (k, v) => {
        MEM2[k] = String(v);
      },
      removeItem: (k) => {
        delete MEM2[k];
      },
    },
    document: { addEventListener() {}, dispatchEvent() {} },
    CustomEvent: function () {},
    window: null,
  };
  sub.window = { EOL: { factions: [] } };
  new Function('localStorage', 'document', 'CustomEvent', 'window', ECONOMY_SRC)(
    sub.localStorage,
    sub.document,
    sub.CustomEvent,
    sub.window
  );
  const subEcon = sub.window.EOL.econ;
  const early = subEcon.starterIds();
  ok(early.length === 0, 'before the faction files land, the starter list is honestly empty (' + early.length + ')');
  sub.window.EOL.factions = EOL.factions; // the faction files arrive
  const late = subEcon.starterIds();
  ok(late.length === 12, 'and once they land, the SAME session resolves all twelve starters (' + late.length + ')');
}

console.log('D. the old save shapes count what the grid shows');
{
  /* the exact reported bug, reproduced against the live ledger: an
     old build's save owns all of Chapter I and nothing else. */
  const MEM3 = {};
  const sub = {
    localStorage: {
      getItem: (k) => (k in MEM3 ? MEM3[k] : null),
      setItem: (k, v) => {
        MEM3[k] = String(v);
      },
      removeItem: (k) => {
        delete MEM3[k];
      },
    },
    document: { addEventListener() {}, dispatchEvent() {} },
    CustomEvent: function () {},
    window: null,
  };
  sub.window = { EOL: { factions: EOL.factions } };
  new Function('localStorage', 'document', 'CustomEvent', 'window', ECONOMY_SRC)(
    sub.localStorage,
    sub.document,
    sub.CustomEvent,
    sub.window
  );
  const subEcon2 = sub.window.EOL.econ;
  const ch1 = [];
  EOL.factions.forEach((f) => {
    if (['huaxia', 'asgard', 'hemithea', 'pandemonium', 'devas', 'genesis', 'transylvania', 'tortuga'].indexOf(f.id) >= 0) return;
    f.cards.forEach((c) => {
      if (f.id !== 'grimmwood') ch1.push(c.id);
    });
  });
  MEM3['eol.owned.v1'] = JSON.stringify(ch1);
  ok(subEcon2.ownedCount() === 55, 'an old Chapter-I-only save counts 55 owned (' + subEcon2.ownedCount() + ')');
  ok(
    subEcon2.obtainableEntries().filter((e) => subEcon2.owns(e.card.id)).length === subEcon2.ownedCount(),
    'the grid loop and the counter derive the SAME number'
  );
  /* and the reconcile repairs the polluted ledger to the same truth */
  MEM3['eol.owned.v1'] = JSON.stringify(
    ch1.concat(['transylvania-hyde', 'campaign-asmodeus', 'transylvania-mr-hyde', 'transylvania-mr-hyde'])
  );
  const r = subEcon2.reconcile();
  /* 43 ch1 + 12 starter + Mr. Hyde = 56; two ghost rows drop. */
  ok(r.owned === 56 && r.dropped === 2, 'reconcile drops only the ghosts (' + r.owned + ' owned, ' + r.dropped + ' dropped)');
  const after = JSON.parse(MEM3['eol.owned.v1']);
  ok(after.length === new Set(after).size, 'the written ledger has no duplicates');
}

console.log('B. the run: Chapter 1 coins -> packs -> the grind');
econ._reset();
const rng = mulberry(77);
/* Coin table 2026-08-19: a complete Normal Road = 8 gates x 100 +
   2 elites x 200 + the boss's 500. */
const CHAPTER_COINS = 1700;
let wallet = CHAPTER_COINS; // complete Normal Road
let packs = 0,
  matches = 0,
  wins = 0;
const PAY = econ.PAY;
const packDef = shop.PACKS.echo;
/* the shelf's job ends when every SOLD echo is owned - the seven
   faction legendaries are the campaign's to give, not the shop's */
while (econ.packableEntries().length > 0 && packs + matches < 4000) {
  if (wallet >= packDef.price) {
    wallet -= packDef.price;
    const out = shop.rollPack(rng, packDef);
    econ.grant(out.map((e) => e.card.id));
    packs++;
  } else {
    const win = rng() < 0.65;
    wallet += win ? PAY.spWin : PAY.spLoss;
    matches++;
    if (win) wins++;
  }
}
ok(econ.packableEntries().length === 0, 'every sold echo lands');
const leftovers = econ.unownedEntries();
/* 17 crowns in the roster, 2 owned by the Grimmwood starter - every
   other card is on the shelf, so 15 crowns are the Road's to give */
ok(
  leftovers.length === 15 && leftovers.every((e) => e.card.rarity === 'legendary'),
  `all that remains after the shelf is the Road's crowns (${leftovers.length})`
);
const hours = ((matches * 3.5) / 60).toFixed(1);
console.log(
  `  Normal Road coins carried ${Math.floor(CHAPTER_COINS / packDef.price)} packs; total ${packs} packs, ` +
    `${matches} matches (${wins} won) - roughly ${hours}h of play after the campaign`
);
/* THE CROWN LAW shortened the shelf ON PURPOSE: 35 sellable echoes
   (was 42 with crowns in the pool), so the shop is a sprint and the
   seven legendaries pace the long game through the campaign. The old
   'grind is real' floor (>15 matches) measured a pool that no longer
   exists; what still matters is that the shelf can't be emptied by
   chapter coins alone and never becomes a slog. */
ok(packs >= 7, `at least seven packs to fill the 35-echo shelf (${packs})`);
ok(matches > 0 && matches < 400, `chapter coins alone do not finish it; the rest stays humane (${matches} matches)`);

console.log('');
if (fail) {
  console.log('ECONOMY SIM: ' + fail + ' FAILED');
  process.exit(1);
}
console.log('ECONOMY SIM: ALL ' + pass + ' CHECKS PASSED');
