/* verify_card_art.js - every card's `art` path must point at a real file.
 *
 * Why this suite exists: all three render sites (js/app.js, js/battle.js,
 * js/play.js) branch only on the TRUTHINESS of card.art. A typo'd or deleted
 * asset therefore fails silently - the <img> 404s and the player sees an
 * empty box where a portrait should be, with nothing in the console that
 * points at the card. Nothing validated these paths before.
 *
 * The Olympus SVG outline trial (2026-08-15) has been REVERTED - all nine
 * factions are back on the painted PNGs - so the geometry assertions that
 * pinned the vector format are gone with it. What remains is the part that
 * was always the point: every art path resolves, and every card is a PNG.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log('  FAIL ' + msg);
  }
}

/* ---- load the card data the same way the other suites do ---- */
global.window = { EOL: {} };
const EOL = global.window.EOL;

const files = [
  'data/_schema.js',
  'data/roles.js',
  'data/olympus.js',
  'data/asgard.js',
  'data/egypt.js',
  'data/yokai.js',
  'data/celtic.js',
  'data/aztec.js',
  'data/slavic.js',
  'data/mesopotamia.js',
  'data/vedic.js',
];
for (const f of files) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) eval(fs.readFileSync(p, 'utf8'));
}

/* EOL.factions is an ARRAY of faction objects, each with .id and .cards */
const factions = EOL.factions || [];
const allCards = [];
for (const f of factions) {
  for (const c of f.cards || []) allCards.push({ faction: f.id, card: c });
}

console.log('verify_card_art');
ok(allCards.length > 0, 'loaded at least one card (got ' + allCards.length + ')');

/* ---- 1. every declared art path resolves to a file on disk ---- */
let withArt = 0;
for (const { faction, card } of allCards) {
  if (!card.art) continue;
  withArt++;
  const abs = path.join(ROOT, card.art);
  ok(
    fs.existsSync(abs),
    'art file exists for ' + faction + '/' + card.name + ' -> ' + card.art
  );
}
ok(withArt > 0, 'at least one card declares art (got ' + withArt + ')');

/* ---- 2. art paths are relative, so they work under any base href ---- */
for (const { faction, card } of allCards) {
  if (!card.art) continue;
  ok(
    !card.art.startsWith('/') && !/^[a-z]+:/i.test(card.art),
    'art path is relative for ' + faction + '/' + card.name
  );
}

/* ---- 3. EVERY faction uses the painted PNGs ----
   Olympus briefly shipped as SVG outlines and was reverted. This is the
   assert that fails loudly if a vector experiment is ever half-landed
   again, leaving one faction on a different format than the rest. */
for (const { faction, card } of allCards) {
  if (!card.art) continue;
  ok(
    card.art.endsWith('.png'),
    'card art is a painted png for ' + faction + '/' + card.name + ' (got ' + card.art + ')'
  );
}

/* Olympus specifically, since it is the one that was swapped away. */
const olympus = allCards.filter((x) => x.faction === 'olympus');
ok(olympus.length === 6, 'olympus has 6 cards (got ' + olympus.length + ')');
for (const { card } of olympus) {
  ok(
    /^assets\/legends\/olympus-[a-z]+\.png$/.test(card.art || ''),
    'olympus card ' + card.name + ' is back on its painted png (got ' + card.art + ')'
  );
}

/* ---- 4. the reverted vector pipeline is fully gone ----
   Leftovers are worse than either state: a stale assets/legends-line/ or a
   tools/gen_olympus_art.py would keep re-raising "is this still a thing?". */
for (const stale of [
  'assets/legends-line',
  'assets/legends-line',
  'tools/gen_olympus_art.py',
  'tools/lib_trace_ink.py',
  'tools/lib_contours.py',
]) {
  ok(!fs.existsSync(path.join(ROOT, stale)), 'removed with the revert: ' + stale);
}

/* ---- 5. all art lives in one directory ---- */
for (const { faction, card } of allCards) {
  if (!card.art) continue;
  ok(
    card.art.startsWith('assets/legends/'),
    'art lives under assets/legends/ for ' + faction + '/' + card.name
  );
}

console.log('  ' + pass + '/' + (pass + fail) + ' passed');
if (fail) process.exit(1);
