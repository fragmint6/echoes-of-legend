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
ok(fresh.length === 42, `obtainable-and-unowned at start is 42 (${fresh.length})`);
ok(
  fresh.every((e) => e.faction.id !== 'huaxia'),
  'Huaxia is never obtainable (held for Chapter 2)'
);
/* THE CROWN LAW (owner ruling 2026-08-10): packs sell echoes, never
   crowns - the packable pool is the unowned roster below legendary */
const packable = econ.packableEntries();
ok(packable.length === 35, `packable (unowned, sub-legendary) at start is 35 (${packable.length})`);
ok(
  packable.every((e) => e.card.rarity !== 'legendary'),
  'the packable pool holds no legendary'
);
ok(
  shop.PACKS.trio.price === 200 && shop.PACKS.echo.price === 500 && shop.PACKS.crown.price === 1000,
  'shelf prices are Trio 200 / Echoes 500 / Crown 1,000'
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
  for (let i = 0; i < 400; i++) {
    const out = shop.rollPack(rng, pack, fresh.slice());
    if (out.length !== pack.size) sizeOk = false;
    const ids = out.map((e) => e.card.id);
    if (new Set(ids).size !== ids.length) dupeOk = false;
    if (out.some((e) => e.faction.id === 'huaxia')) huaxiaOk = false;
    if (out.some((e) => e.card.rarity === 'legendary')) crownOk = false;
    if (pack.final) {
      const last = out[out.length - 1];
      if (last.card.rarity !== 'epic') finalOk = false;
    }
  }
  ok(sizeOk, pack.name + ': always ' + pack.size + ' cards');
  ok(dupeOk, pack.name + ': never a duplicate inside a pack');
  ok(huaxiaOk, pack.name + ': never Huaxia');
  ok(crownOk, pack.name + ': NEVER a legendary - even fed the raw unowned roster');
  if (pack.final) ok(finalOk, pack.name + ': final-card guarantee (always Epic) holds');
  ok(pack.price > 0 && pack.odds.reduce((t, r) => t + r[1], 0) === 100, pack.name + ': odds sum to 100');
});

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
ok(
  leftovers.length === 7 && leftovers.every((e) => e.card.rarity === 'legendary'),
  `all that remains after the shelf is the Road's seven crowns (${leftovers.length})`
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
