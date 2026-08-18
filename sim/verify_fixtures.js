#!/usr/bin/env node
'use strict';

/* =============================================================
   FIXTURE INTEGRITY - every hard-coded card id, everywhere
   node sim/verify_fixtures.js
   -------------------------------------------------------------
   WHY THIS EXISTS

   Cards keep moving between factions, and card ids embed the
   faction id. Every move so far has left something behind:

     - Hercules -> Hemithea broke four suites that named
       `hemithea-hercules` but never loaded data/hemithea.js, so
       CARD[] had a hole and every board built from it threw;
     - the same move broke sim/audit_abilities.js the same way,
       and that one was not noticed for a whole turn because the
       suite is not in the usual run list;
     - Kaguya -> Kami left her in a Chapter I draft pool where she
       was suddenly a different faction's card;
     - Musashi joining Yamato broke "featured faction complete"
       for gate VI, because a frozen pool has to hold all of the
       faction it features.

   Every one of those is the same bug: a hard-coded id somewhere
   stopped agreeing with the roster. Reading the diff never caught
   it; a script always did. So this is the script, run as a suite.

   IT DELIBERATELY DOES NOT LOAD THE ENGINE. It is a static audit
   over source text plus the card registry, which means it is fast
   (<1s), cannot be broken by an engine change, and can check files
   that would refuse to run at all (the puppeteer suites).
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

/* ---- the live roster ---- */
global.window = {};
require(path.join(ROOT, 'data/_schema.js'));
const DATA_DIR = path.join(ROOT, 'data');
const FACTION_FILES = fs
  .readdirSync(DATA_DIR)
  .filter(
    (f) =>
      f.endsWith('.js') &&
      !['_schema.js', 'roles.js', 'lore.js', 'battlefields.js', 'campaign-ch1.js', 'draft-ai.js'].includes(f)
  );
FACTION_FILES.forEach((f) => require(path.join(DATA_DIR, f)));

const CARD = {};
const FAC = {};
window.EOL.factions.forEach((f) =>
  f.cards.forEach((c) => {
    CARD[c.id] = c;
    FAC[c.id] = f.id;
  })
);
const FACTION_IDS = new Set(window.EOL.factions.map((f) => f.id));

/* Faction ids that no longer exist. A card id carrying one of these
   prefixes is always a stale fixture, wherever it appears. */
const RETIRED_PREFIXES = ['takamagahara', 'gehenna', 'devaloka', 'jotunheim', 'achaea', 'empyrean'];

/* Files that are ALLOWED to name retired ids, because remapping them
   is their job. */
const MIGRATION_FILES = ['js/id-migration.js', 'sim/verify_id_migration.js'];

/* ids that look like card ids but are not roster cards */
const NON_ROSTER = new Set(['campaign-gilgamesh']);

function jsFiles() {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'assets', 'docs', 'covers'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  })(ROOT);
  return out;
}

console.log('A. no stale card ids anywhere in the source');
{
  const offenders = [];
  for (const abs of jsFiles()) {
    const rel = path.relative(ROOT, abs);
    if (MIGRATION_FILES.includes(rel)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const bad = new Set();
    for (const m of src.matchAll(/'([a-z][a-z0-9]+-[a-z0-9-]+)'/g)) {
      const id = m[1];
      if (NON_ROSTER.has(id)) continue;
      const prefix = id.split('-')[0];
      if (RETIRED_PREFIXES.includes(prefix)) bad.add(id + ' (retired faction)');
      else if (FACTION_IDS.has(prefix) && !CARD[id]) bad.add(id + ' (no such card)');
    }
    if (bad.size) offenders.push(rel + ': ' + [...bad].join(', '));
  }
  ok(offenders.length === 0, 'every hard-coded card id resolves to a real card' + (offenders.length ? '\n          ' + offenders.join('\n          ') : ''));
}

console.log('B. suites load the factions whose cards they name');
{
  /* The exact break that hit five files when Hercules moved. A suite
     that names a card but never loads its faction file gets `undefined`
     out of its CARD lookup and throws on the first board it builds.

     Only checks files that build a CARD map from an EXPLICIT list -
     anything using readdirSync loads the whole data dir and is safe by
     construction. */
  const offenders = [];
  for (const abs of jsFiles()) {
    const rel = path.relative(ROOT, abs);
    if (MIGRATION_FILES.includes(rel)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const explicit = [...src.matchAll(/'(?:\.\.\/)?data\/([a-z0-9-]+)\.js'/g)].map((m) => m[1]);
    if (!explicit.length) continue; // no explicit list
    if (/readdirSync/.test(src)) continue; // dynamic loader

    /* Several suites build the path instead of writing it out:

         ['camelot', 'duat', ...].forEach(f => require('../data/' + f + '.js'))

       The literal regex above cannot see those, and reporting them is a
       FALSE POSITIVE - verify_campaign, verify_campaign_difficulty and
       gen_gate1_line all run clean. So when a file concatenates a data
       path, harvest the bare faction names it lists as well. Checked by
       running all three: they pass, which is why this branch exists
       rather than "fixes" to three healthy files. */
    const loaded = new Set(explicit);
    if (/data\/' \+|'\/data\/'\s*\+|data\/'\s*\+/.test(src)) {
      for (const m of src.matchAll(/'([a-z][a-z0-9]{2,})'/g)) {
        if (FACTION_IDS.has(m[1])) loaded.add(m[1]);
      }
    }
    const needed = new Set();
    for (const m of src.matchAll(/'([a-z][a-z0-9]+-[a-z0-9-]+)'/g)) {
      const id = m[1];
      if (CARD[id]) needed.add(FAC[id]);
    }
    const missing = [...needed].filter((f) => !loaded.has(f));
    if (missing.length) offenders.push(rel + ' names ' + missing.join('/') + ' cards but does not load data/' + missing[0] + '.js');
  }
  ok(offenders.length === 0, 'no suite names a card from a faction it did not load' + (offenders.length ? '\n          ' + offenders.join('\n          ') : ''));
}

console.log('C. Chapter I frozen draft pools');
{
  /* Parsed by splitting on the stage declarations rather than one
     greedy regex over the file - a cross-stage match silently reported
     gate VI as "stage 1" while I was auditing this by hand, which is
     exactly the sort of wrong answer a checker is supposed to prevent. */
  const src = fs.readFileSync(path.join(ROOT, 'data/campaign-ch1.js'), 'utf8').split('\n');
  const marks = [];
  src.forEach((l, i) => {
    const m = /^      id: (\d+),/.exec(l);
    if (m) marks.push({ stage: +m[1], line: i });
  });
  const INTRO = { 1: 'grimmwood', 2: 'camelot', 3: 'sherwood', 4: 'olympus', 6: 'yamato', 7: 'roma', 8: 'kami', 10: 'duat' };

  let pools = 0;
  marks.forEach((mk, idx) => {
    const end = idx + 1 < marks.length ? marks[idx + 1].line : src.length;
    const body = src.slice(mk.line, end).join('\n');
    const fm = /featured: '([a-z0-9]+)'/.exec(body);
    const cm = /cards: \[([\s\S]*?)\]/.exec(body);
    if (!fm || !cm) return;
    pools++;
    const fac = fm[1];
    const ids = [...cm[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    const label = 'gate ' + mk.stage + ' (' + fac + ')';

    ok(ids.every((i) => !!CARD[i]), label + ': every pooled id is a real card');
    ok(new Set(ids).size === ids.length, label + ': no duplicates (' + ids.length + ' ids, ' + new Set(ids).size + ' distinct)');

    /* THE ONE MUSASHI BROKE: a frozen table must hold all of the
       faction it features, or the gate that introduces a faction does
       not actually show it to you. */
    const facCards = window.EOL.factions.find((f) => f.id === fac).cards.map((c) => c.id);
    const missing = facCards.filter((i) => !ids.includes(i));
    ok(missing.length === 0, label + ': featured faction complete' + (missing.length ? ' (MISSING ' + missing.join(', ') + ')' : ''));

    /* Future crowns stay hidden. Non-legendary previews from a later
       faction ARE allowed - that is the shipped law, and gate VI leans
       on it for Kaguya and Tsukuyomi. */
    const introduced = new Set(
      Object.keys(INTRO)
        .map(Number)
        .filter((k) => k <= mk.stage)
        .map((k) => INTRO[k])
    );
    const crowns = ids.filter((i) => !introduced.has(FAC[i]) && CARD[i].rarity === 'legendary');
    ok(crowns.length === 0, label + ': no Legendary from a future faction' + (crowns.length ? ' (LEAK ' + crowns.join(', ') + ')' : ''));

    /* Role depth. The pool audit in verify_campaign requires 4+ of each
       of the six roles; restated here so a card move that quietly
       drains a role fails in the fast suite too. */
    const roles = {};
    ids.forEach((i) => (roles[CARD[i].role] = (roles[CARD[i].role] || 0) + 1));
    const thin = Object.keys(roles).filter((r) => roles[r] < 4);
    ok(
      Object.keys(roles).length === 6 && thin.length === 0,
      label + ': all six roles present at depth 4+ ' + JSON.stringify(roles)
    );
  });
  ok(pools === 3, 'found all three curated draft pools (' + pools + ')');
}

console.log('D. Chapter I gated surfaces (enemy12 and grants)');
{
  /* Unlike pools, these may NOT preview anything: a rival cannot field
     a faction the player has not met, and a gate cannot grant one. */
  const src = fs.readFileSync(path.join(ROOT, 'data/campaign-ch1.js'), 'utf8').split('\n');
  const marks = [];
  src.forEach((l, i) => {
    const m = /^      id: (\d+),/.exec(l);
    if (m) marks.push({ stage: +m[1], line: i });
  });
  const INTRO = { 1: 'grimmwood', 2: 'camelot', 3: 'sherwood', 4: 'olympus', 6: 'yamato', 7: 'roma', 8: 'kami', 10: 'duat' };

  marks.forEach((mk, idx) => {
    const end = idx + 1 < marks.length ? marks[idx + 1].line : src.length;
    const body = src.slice(mk.line, end).join('\n');
    const introduced = new Set(
      Object.keys(INTRO)
        .map(Number)
        .filter((k) => k <= mk.stage)
        .map((k) => INTRO[k])
    );
    const e12m = /enemy12:\s*\[([\s\S]*?)\]/.exec(body);
    const ids = e12m ? [...e12m[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]) : [];
    const lp = /legendPack: '([a-z0-9-]+)'/.exec(body);
    const all = ids.concat(lp ? [lp[1]] : []).filter((i) => !NON_ROSTER.has(i));
    if (!all.length) return;

    const unknown = all.filter((i) => !CARD[i]);
    ok(unknown.length === 0, 'gate ' + mk.stage + ': every fielded/granted id is real' + (unknown.length ? ' (' + unknown.join(', ') + ')' : ''));
    const leak = all.filter((i) => CARD[i] && !introduced.has(FAC[i]));
    ok(leak.length === 0, 'gate ' + mk.stage + ': fields and grants only introduced factions' + (leak.length ? ' (LEAK ' + leak.join(', ') + ')' : ''));
  });
}

console.log('E. art and manifest agree with the roster');
{
  const ids = Object.keys(CARD);
  const missingArt = ids.filter((i) => CARD[i].art && !fs.existsSync(path.join(ROOT, CARD[i].art)));
  ok(missingArt.length === 0, 'every card art path exists on disk' + (missingArt.length ? ' (' + missingArt.join(', ') + ')' : ''));

  const noArt = ids.filter((i) => !CARD[i].art);
  ok(noArt.length === 0, 'every card has an art path' + (noArt.length ? ' (' + noArt.join(', ') + ')' : ''));

  /* The art filename must match the card id. When a card changes
     faction the PNG has to be renamed with it, and forgetting leaves a
     card pointing at another faction's file. */
  const mismatched = ids.filter((i) => CARD[i].art && path.basename(CARD[i].art, '.png') !== i);
  ok(mismatched.length === 0, 'every art filename matches its card id' + (mismatched.length ? ' (' + mismatched.join(', ') + ')' : ''));

  const man = fs
    .readFileSync(path.join(ROOT, 'assets/legends/MANIFEST.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(',')[0]);
  ok(man.length === ids.length, 'MANIFEST.csv has one row per card (' + man.length + ' rows, ' + ids.length + ' cards)');
  const ghosts = man.filter((m) => !CARD[m]);
  ok(ghosts.length === 0, 'MANIFEST.csv lists no cards that left the roster' + (ghosts.length ? ' (' + ghosts.join(', ') + ')' : ''));
}

console.log('F. index.html loads every faction file');
{
  /* A faction file that exists but is not scripted into the page is
     invisible in the real game while every node suite still passes. */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const missing = FACTION_FILES.filter((f) => html.indexOf('data/' + f) < 0);
  ok(missing.length === 0, 'index.html scripts every data/*.js faction file' + (missing.length ? ' (MISSING ' + missing.join(', ') + ')' : ''));
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
