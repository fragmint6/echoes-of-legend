/* verify_card_art.js - every card's `art` path must point at a real file.
 *
 * Why this suite exists: all three render sites (js/app.js, js/battle.js,
 * js/play.js) branch only on the TRUTHINESS of card.art. A typo'd or deleted
 * asset therefore fails silently - the <img> 404s and the player sees an
 * empty box where a portrait should be, with nothing in the console that
 * points at the card. Nothing validated these paths before.
 *
 * It also pins the shape of the line-art format introduced for Olympus
 * (2026-08-15), because that art is hand-authored SVG rather than an export
 * from tools/resize_hero_art.py, so there is no pipeline enforcing its
 * geometry.
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

/* ---- 3. the Olympus line-art trial: all six cards, all SVG ---- */
const olympus = allCards.filter((x) => x.faction === 'olympus');
ok(olympus.length === 6, 'olympus has 6 cards (got ' + olympus.length + ')');
for (const { card } of olympus) {
  ok(
    /^assets\/heroes-line\/olympus-[a-z]+\.svg$/.test(card.art || ''),
    'olympus card ' + card.name + ' uses line-art svg (got ' + card.art + ')'
  );
}

/* ---- 4. the other factions still use the painted PNGs ----
   The line-art style is an Olympus-only trial; this assert is what will
   fail loudly if a later change quietly converts everyone. */
for (const { faction, card } of allCards) {
  if (faction === 'olympus' || !card.art) continue;
  ok(
    card.art.endsWith('.png'),
    'non-olympus card ' + faction + '/' + card.name + ' still uses png'
  );
}

/* ---- 5. line-art geometry: authored at the shared 8:11 hero ratio ----
   Both crops assume this. A stray viewBox would silently letterbox. */
const lineDir = path.join(ROOT, 'assets/heroes-line');
ok(fs.existsSync(lineDir), 'assets/heroes-line/ exists');
const svgs = fs.existsSync(lineDir)
  ? fs.readdirSync(lineDir).filter((f) => f.endsWith('.svg'))
  : [];
ok(svgs.length === 6, 'six line-art svgs on disk (got ' + svgs.length + ')');

for (const f of svgs) {
  const src = fs.readFileSync(path.join(lineDir, f), 'utf8');

  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(src);
  ok(!!vb, f + ': has a viewBox');
  if (vb) {
    const w = +vb[1];
    const h = +vb[2];
    ok(
      Math.abs(w / h - 8 / 11) < 0.01,
      f + ': viewBox is 8:11 (got ' + w + 'x' + h + ')'
    );
  }

  /* Well-formed enough to parse, and self-describing for a11y. */
  ok(src.includes('xmlns="http://www.w3.org/2000/svg"'), f + ': declares the svg namespace');
  ok(/<title>[^<]+<\/title>/.test(src), f + ': has a <title>');
  ok(src.trim().endsWith('</svg>'), f + ': is closed');

  /* The whole point of the style: a handful of strokes. If a future edit
     turns these into 200-path illustrations, that is a different style and
     this assert should be revisited deliberately, not drifted into. */
  const paths = (src.match(/<path\b/g) || []).length;
  ok(paths > 0 && paths <= 40, f + ': stroke count is small (' + paths + ' paths)');

  /* No raster escape hatch and no external refs - it must stay vector. */
  ok(!/<image\b/.test(src), f + ': embeds no raster image');

  /* Drawn on the same substrate the CSS paints behind it. */
  ok(src.includes('#06070d'), f + ': uses the card substrate colour');
}

console.log('  ' + pass + '/' + (pass + fail) + ' passed');
if (fail) process.exit(1);
