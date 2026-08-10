/* =============================================================
   Echoes of Legend - Economy Sim & Invariants
   -------------------------------------------------------------
   node sim/economy_sim.js

   A. INVARIANTS - 400 rolls per pack tier over a fresh (starter-
      only) collection: sizes honoured, guarantees honoured, never
      a Huaxia card, never a duplicate inside one pack.
   B. THE RUN - a player who clears Chapter 1 (1500 coins), buys
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
  'data/takamagahara.js',
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
const fresh = econ.unownedEntries();
ok(fresh.length === 42, `obtainable-and-unowned at start is 42 (${fresh.length})`);
ok(
  fresh.every((e) => e.faction.id !== 'huaxia'),
  'Huaxia is never obtainable (held for Chapter 2)'
);
Object.keys(shop.PACKS).forEach((key) => {
  const pack = shop.PACKS[key];
  const rng = mulberry(1234 + pack.price);
  let finalOk = true,
    dupeOk = true,
    sizeOk = true,
    huaxiaOk = true;
  for (let i = 0; i < 400; i++) {
    const out = shop.rollPack(rng, pack, fresh.slice());
    if (out.length !== pack.size) sizeOk = false;
    const ids = out.map((e) => e.card.id);
    if (new Set(ids).size !== ids.length) dupeOk = false;
    if (out.some((e) => e.faction.id === 'huaxia')) huaxiaOk = false;
    if (pack.final) {
      const last = out[out.length - 1];
      if (last.card.rarity !== 'epic' && last.card.rarity !== 'legendary') finalOk = false;
    }
  }
  ok(sizeOk, pack.name + ': always ' + pack.size + ' cards');
  ok(dupeOk, pack.name + ': never a duplicate inside a pack');
  ok(huaxiaOk, pack.name + ': never Huaxia');
  if (pack.final) ok(finalOk, pack.name + ': final-card guarantee (Epic+) holds');
  ok(pack.price > 0 && pack.odds.reduce((t, r) => t + r[1], 0) === 100, pack.name + ': odds sum to 100');
});

console.log('B. the run: Chapter 1 coins -> packs -> the grind');
econ._reset();
const rng = mulberry(77);
let wallet = 1500; // chapter total (owner ruling)
let packs = 0,
  matches = 0,
  wins = 0;
const PAY = econ.PAY;
const packDef = shop.PACKS.echo;
while (econ.unownedEntries().length > 0 && packs + matches < 4000) {
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
ok(econ.unownedEntries().length === 0, 'the collection completes');
const hours = ((matches * 3.5) / 60).toFixed(1);
console.log(
  `  chapter coins carried ${Math.min(10, packs)} packs; total ${packs} packs, ` +
    `${matches} matches (${wins} won) - roughly ${hours}h of play after the campaign`
);
ok(matches > 15 && matches < 400, `the grind is real but humane (${matches} matches)`);

console.log('');
if (fail) {
  console.log('ECONOMY SIM: ' + fail + ' FAILED');
  process.exit(1);
}
console.log('ECONOMY SIM: ALL ' + pass + ' CHECKS PASSED');
