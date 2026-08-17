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

/* THE FILE LIST IS DISCOVERED, NOT HARD-CODED (2026-08-17).
   -------------------------------------------------------------
   This list used to be written by hand and named six files that have
   never existed in the repo - asgard, egypt, yokai, celtic, aztec,
   slavic, mesopotamia, vedic - apparently a plan for factions that
   were never built. Because the loader skips anything missing, the
   suite silently loaded ONE faction (Olympus) and cheerfully reported
   "38/38 passed" while validating 6 cards out of 112.

   A hard-coded list that fails open is worse than no list: it reports
   success for work it never looked at. Read the directory instead, so
   a new faction file is covered the moment it lands. */
const SKIP = new Set(['_schema.js', 'roles.js', 'lore.js', 'battlefields.js', 'draft-ai.js', 'campaign-ch1.js']);
eval(fs.readFileSync(path.join(ROOT, 'data/_schema.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'data/roles.js'), 'utf8'));
const factionFiles = fs
  .readdirSync(path.join(ROOT, 'data'))
  .filter((f) => f.endsWith('.js') && !SKIP.has(f))
  .sort();
for (const f of factionFiles) {
  eval(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
}

/* EOL.factions is an ARRAY of faction objects, each with .id and .cards */
const factions = EOL.factions || [];
const allCards = [];
for (const f of factions) {
  for (const c of f.cards || []) allCards.push({ faction: f.id, card: c });
}

console.log('verify_card_art');
ok(allCards.length > 0, 'loaded at least one card (got ' + allCards.length + ')');
/* Guard the discovery itself: if the loader ever regresses to seeing one
   faction again, say so loudly instead of passing. */
ok(
  factions.length >= 16,
  'every faction file was loaded (' + factions.length + ' factions, ' + allCards.length + ' cards)'
);

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

/* ---- 6. EVERY legend has an art brief, and the brief agrees ----
   docs/ART-SPEC.md is the source of truth for what an artist draws, and
   a brief whose rarity/role/element has drifted from the card is worse
   than no brief - it produces art tuned to the wrong rarity tier and
   the wrong rim-light colour.

   An earlier revision of the spec claimed `tools/art_prompts.py` was
   "checked against the live roster". No such file and no such check
   existed. This is that check. */
{
  const spec = fs.readFileSync(path.join(ROOT, 'docs/ART-SPEC.md'), 'utf8');
  const briefs = {};
  const re = /\*\*(.+?)\*\*\s*`([^`]+)`/g;
  let m;
  while ((m = re.exec(spec))) briefs[m[1].trim()] = m[2].trim();

  const missing = [];
  const drift = [];
  for (const { card } of allCards) {
    const b = briefs[card.name];
    if (!b) {
      missing.push(card.name);
      continue;
    }
    const want = card.rarity + ' / ' + card.role + ' / ' + card.element;
    if (b !== want) drift.push(card.name + ': spec says "' + b + '", card is "' + want + '"');
  }
  ok(
    missing.length === 0,
    'every legend has an art brief' + (missing.length ? ' (missing: ' + missing.slice(0, 6).join(', ') + ')' : '')
  );
  ok(
    drift.length === 0,
    'no brief has drifted from its card' + (drift.length ? ' (' + drift.slice(0, 4).join(' | ') + ')' : '')
  );
}

/* ---- 7. cards without art are a SUPPORTED state, not a bug ----
   The render sites branch on truthiness and fall back to the icon
   glyph, which is how a faction can land before its art does. Assert
   the fallback is intact so "art: null" never becomes an empty box. */
{
  const noArt = allCards.filter((e) => !e.card.art);
  const noIcon = noArt.filter((e) => !e.card.icon);
  ok(
    noIcon.length === 0,
    'every legend without art still has an icon glyph' +
      (noIcon.length ? ' (' + noIcon.map((e) => e.card.name).join(', ') + ')' : '')
  );
  console.log(
    '  note  ' + noArt.length + ' of ' + allCards.length + ' legends are icon-only (art outstanding)'
  );
}

console.log('  ' + pass + '/' + (pass + fail) + ' passed');
if (fail) process.exit(1);
