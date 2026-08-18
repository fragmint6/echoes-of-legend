#!/usr/bin/env node
'use strict';

/* =============================================================
   SAVE-ID MIGRATION - regression net
   node sim/verify_id_migration.js
   -------------------------------------------------------------
   Five factions were renamed on 2026-08-18 and one card changed
   faction. Card ids embed the faction id, and those ids are the
   primary keys in every player's save. js/id-migration.js rewrites
   them on boot.

   This suite exists because the failure mode is SILENT and
   UNRECOVERABLE. If the rewrite is wrong, a player's collection,
   decks and upgrade levels do not error - they simply stop matching
   the roster and disappear, and there is no undo and no way for the
   player to report it usefully ("some of my cards are gone").

   It runs the real file against a fake localStorage rather than
   asserting on its source text, because a source-text test cannot
   tell whether the rewrite actually produces ids that exist in the
   shipped roster - which is the only thing that matters.
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

/* ---- the live roster, so we can prove migrated ids are real ---- */
global.window = {};
require(path.join(ROOT, 'data/_schema.js'));
fs.readdirSync(path.join(ROOT, 'data'))
  .filter(
    (f) =>
      f.endsWith('.js') &&
      !['_schema.js', 'roles.js', 'lore.js', 'battlefields.js', 'campaign-ch1.js', 'draft-ai.js'].includes(f)
  )
  .forEach((f) => require(path.join(ROOT, 'data', f)));
const REAL_IDS = new Set();
window.EOL.factions.forEach((f) => f.cards.forEach((c) => REAL_IDS.add(c.id)));

/* ---- load the migration against a fake storage ---- */
function freshEnv(store, session) {
  const s = store || {};
  const ss = session || {};
  delete require.cache[require.resolve(path.join(ROOT, 'js/id-migration.js'))];
  global.window = {};
  global.document = { addEventListener() {} };
  global.localStorage = {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => {
      s[k] = String(v);
    },
    removeItem: (k) => {
      delete s[k];
    },
  };
  global.sessionStorage = {
    getItem: (k) => (k in ss ? ss[k] : null),
    setItem: (k, v) => {
      ss[k] = String(v);
    },
    removeItem: (k) => {
      delete ss[k];
    },
  };
  require(path.join(ROOT, 'js/id-migration.js'));
  return s;
}
const J = (v) => JSON.stringify(v);
const P = (v) => JSON.parse(v);

console.log('A. the five faction renames, across every save shape');
{
  const store = {
    'eol.owned.v1': J([
      'takamagahara-amaterasu',
      'gehenna-pride',
      'devaloka-shiva',
      'jotunheim-odin',
      'achaea-ajax',
      'camelot-merlin',
    ]),
    'eol.decks.v1': J([{ id: 1, name: 'a', ids: ['takamagahara-susanoo', 'jotunheim-thor', 'camelot-merlin'] }]),
    'eol.deck.v1': J(['devaloka-kali', 'achaea-medea']),
    'eol.upgrades.v2': J({ v: 2, shards: 7, cards: { 'takamagahara-inari': { dupes: 3, boosts: ['atk'] } } }),
  };
  freshEnv(store);

  const owned = P(store['eol.owned.v1']);
  ok(owned.includes('kami-amaterasu'), 'takamagahara -> kami (owned)');
  ok(owned.includes('pandemonium-pride'), 'gehenna -> pandemonium (owned)');
  ok(owned.includes('devas-shiva'), 'devaloka -> devas (owned)');
  ok(owned.includes('asgard-odin'), 'jotunheim -> asgard (owned)');
  ok(owned.includes('hemithea-ajax'), 'achaea -> hemithea (owned)');
  ok(owned.includes('camelot-merlin'), 'an untouched faction is left exactly alone');

  ok(P(store['eol.decks.v1'])[0].ids[0] === 'kami-susanoo', 'saved decks are rewritten');
  ok(P(store['eol.deck.v1'])[0] === 'devas-kali', 'the legacy single squad is rewritten');
  ok(!!P(store['eol.upgrades.v2']).cards['kami-inari'], 'upgrade records are re-keyed');
  ok(
    P(store['eol.upgrades.v2']).cards['kami-inari'].dupes === 3,
    'upgrade levels and dupes survive the re-key'
  );
}

console.log('B. Hercules changed faction, not just faction name');
{
  const store = {
    'eol.owned.v1': J(['olympus-hercules']),
    'eol.upgrades.v2': J({ v: 2, cards: { 'olympus-hercules': { dupes: 5, boosts: ['hp', 'hp'] } } }),
  };
  freshEnv(store);
  ok(P(store['eol.owned.v1'])[0] === 'hemithea-hercules', 'olympus-hercules -> hemithea-hercules');
  ok(
    P(store['eol.upgrades.v2']).cards['hemithea-hercules'].boosts.length === 2,
    "a moved card keeps its upgrade boosts (they are the player's money)"
  );
}

console.log('C. every migrated id exists in the shipped roster');
{
  /* The point of the whole exercise. A rewrite that produces
     plausible-looking ids that are not in the roster is worse than no
     rewrite at all - the cards vanish either way, but this way the
     save is also corrupted. */
  const store = { 'eol.owned.v1': J(Array.from(REAL_IDS)) };
  freshEnv(store);
  const after = P(store['eol.owned.v1']);
  const bogus = after.filter((id) => !REAL_IDS.has(id));
  ok(bogus.length === 0, 'migrating the entire live roster produces no unknown ids (' + bogus.length + ')');

  const store2 = {
    'eol.owned.v1': J([
      'takamagahara-amaterasu',
      'takamagahara-tsukuyomi',
      'takamagahara-izanami',
      'takamagahara-izanagi',
      'takamagahara-inari',
      'takamagahara-susanoo',
      'gehenna-wrath',
      'devaloka-ganesha',
      'jotunheim-fenrir',
      'achaea-achilles',
      'olympus-hercules',
    ]),
  };
  freshEnv(store2);
  const after2 = P(store2['eol.owned.v1']);
  const bad = after2.filter((id) => !REAL_IDS.has(id));
  ok(bad.length === 0, 'a full pre-rename collection migrates to real ids (' + bad.join(',') + ')');
  ok(after2.length === 11, 'no card is lost or duplicated in the rewrite');
}

console.log('D. idempotence and safety');
{
  const store = { 'eol.owned.v1': J(['takamagahara-inari']) };
  freshEnv(store);
  const once = store['eol.owned.v1'];
  freshEnv(store); // second boot, DONE_KEY set
  ok(store['eol.owned.v1'] === once, 'a second boot is a no-op');

  /* Running with the guard cleared must ALSO be safe - the new ids
     match no old prefix, so there is nothing left to rewrite. */
  delete store['eol.idmap.2026-08-18'];
  freshEnv(store);
  ok(store['eol.owned.v1'] === once, 'even a forced re-run cannot double-migrate');

  const broken = { 'eol.owned.v1': '{not json', 'eol.decks.v1': 'null', 'eol.upgrades.v2': '[]' };
  let threw = false;
  try {
    freshEnv(broken);
  } catch (e) {
    threw = true;
  }
  ok(!threw, 'a corrupt save does not throw during boot');
  ok(broken['eol.owned.v1'] === '{not json', 'a corrupt value is left untouched rather than half-written');
}

console.log('E. a cloud restore re-arms the migration');
{
  /* cloud.restore() writes the vault over localStorage and reloads, so
     old ids can arrive on a device that already set DONE_KEY. The boot
     must force the rewrite when the restore marker is present. */
  const store = { 'eol.idmap.2026-08-18': '1', 'eol.owned.v1': J(['takamagahara-inari']) };
  freshEnv(store, {}); // no marker: guard holds, nothing happens
  ok(P(store['eol.owned.v1'])[0] === 'takamagahara-inari', 'without the marker the guard short-circuits');

  const store2 = { 'eol.idmap.2026-08-18': '1', 'eol.owned.v1': J(['takamagahara-inari']) };
  const sess = { 'eol.cloud.restored': '1' };
  freshEnv(store2, sess);
  ok(P(store2['eol.owned.v1'])[0] === 'kami-inari', 'a cloud-restore boot migrates despite the guard');
  ok(sess['eol.cloud.restored'] === '1', 'the restore marker is READ, not consumed - cloud.js still needs it');
}

console.log('F. the file is wired into the page before its consumers');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = (f) => html.indexOf('js/' + f);
  ok(at('id-migration.js') > 0, 'index.html loads js/id-migration.js');
  ['economy.js', 'upgrades.js', 'deck.js'].forEach((f) => {
    ok(
      at('id-migration.js') < at(f),
      'id-migration.js loads before ' + f + ' (which reads the keys it rewrites)'
    );
  });
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
