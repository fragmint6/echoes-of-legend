/* =============================================================
   MIGRATION DEPENDENCIES
   node sim/verify_migrations.js
   -------------------------------------------------------------
   Migration 12 shipped broken:

     ERROR: 42703: column m.settings does not exist

   The cause was an UNDECLARED DEPENDENCY. mp_matches.settings is
   added by migration 11 (private rooms), and migration 12 archived
   that column while only claiming to require 02. On a project that
   had not adopted rooms yet, 12 failed with an error naming a column
   rather than the migration that was missing.

   This suite models the schema by replaying the migrations in order
   and checking that every column a migration reads has been created
   by that point. It is a static model - there is no Postgres in CI -
   so it deliberately checks the ONE thing that actually broke:
   "does this column exist yet", not "is this valid SQL".

   The real defence is that a migration should not need its
   predecessors' optional features at all. So the important assertion
   here is the last one: 12 must survive being run on a database that
   has never seen 11, in either order.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* SQL comments may discuss columns that do not exist yet - the whole
   file is prose as much as code - so they are stripped first. */
const strip = (s) => s.replace(/--[^\n]*/g, '');

const files = fs
  .readdirSync(path.join(ROOT, 'docs'))
  .filter((f) => /^supabase-migration-\d+\.sql$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

/* ---------------------------------------------------------
   build the schema by replaying every migration in order
   --------------------------------------------------------- */
function columnsOf(sqlText, table) {
  const cols = new Set();
  /* create table ... ( ... ) */
  const re = new RegExp('create table if not exists public\\.' + table + '\\s*\\(([\\s\\S]*?)\\n\\);', 'g');
  let m;
  while ((m = re.exec(sqlText))) {
    m[1].split('\n').forEach((line) => {
      const c = line.trim().match(/^([a-z_]+)\s+[a-z]/);
      if (c) cols.add(c[1]);
    });
  }
  /* alter table ... add column [if not exists] X */
  const re2 = new RegExp(
    'alter table public\\.' + table + '\\s*\\n?\\s*add column (?:if not exists )?([a-z_]+)',
    'g'
  );
  while ((m = re2.exec(sqlText))) cols.add(m[1]);
  return cols;
}

console.log('\nSCHEMA REPLAY: mp_matches');
{
  const base = strip(read('docs/supabase-setup.sql'));
  let known = columnsOf(base, 'mp_matches');
  ok(known.has('id') && known.has('seed') && known.has('status'), 'the base setup creates mp_matches');
  ok(!known.has('settings'), 'the base setup does NOT have settings - it arrives in a later migration');

  const addedBy = {};
  files.forEach((f) => {
    const s = strip(read('docs/' + f));
    columnsOf(s, 'mp_matches').forEach((c) => {
      if (!known.has(c)) addedBy[c] = addedBy[c] || f;
      known.add(c);
    });
  });
  ok(known.has('settings'), 'settings is added by some migration');

  /* Every migration that READS a column of mp_matches must run after
     the migration that created it. Walk them in order and check. */
  let have = columnsOf(base, 'mp_matches');
  let violations = [];
  files.forEach((f) => {
    const s = strip(read('docs/' + f));
    /* Only look at files that actually touch mp_matches. */
    if (!/mp_matches/.test(s)) return;
    /* Column references through the `m` alias or `m.` record - the
       form that broke. */
    const refs = new Set((s.match(/\bm\.[a-z_]+/g) || []).map((r) => r.slice(2)));
    /* what this file itself adds counts as available within it */
    columnsOf(s, 'mp_matches').forEach((c) => have.add(c));
    refs.forEach((c) => {
      /* `m.` is also used for other record variables in these files;
         only judge names we know to be mp_matches columns. */
      if (!known.has(c)) return;
      if (!have.has(c)) violations.push(f + ' reads m.' + c + ' before it exists');
    });
  });
  ok(
    violations.length === 0,
    'no migration reads an mp_matches column before it is created' +
      (violations.length ? ' -- ' + violations.join('; ') : '')
  );
}

/* ---------------------------------------------------------
   the specific regression
   --------------------------------------------------------- */
console.log('\nMIGRATION 12 STANDS ALONE');
{
  const m11 = strip(read('docs/supabase-migration-11.sql'));
  const m12 = strip(read('docs/supabase-migration-12.sql'));

  ok(/add column if not exists settings jsonb/.test(m11), 'migration 11 declares settings');
  ok(
    /add column if not exists settings jsonb/.test(m12),
    'migration 12 declares settings TOO, so it does not depend on 11 having been run'
  );

  /* Both must be `if not exists`, or running them in the wrong order
     - or twice - errors instead of being a no-op. */
  const decls = (m11 + m12).match(/add column[^;\n]*settings[^;\n]*/g) || [];
  ok(decls.length === 2, 'exactly the two declarations, one per migration');
  ok(
    decls.every((d) => /if not exists/.test(d)),
    'both are `if not exists`, so either order works and re-running is safe'
  );
  /* Identical definitions: a different default or nullability in the
     two files would make the resulting schema depend on run order. */
  const norm = (d) => d.replace(/\s+/g, ' ').replace(/^add column if not exists /, '').trim();
  ok(
    norm(decls[0]) === norm(decls[1]),
    'the two definitions are identical, so run order cannot change the schema'
  );

  ok(
    /add column if not exists settings/.test(m12.slice(0, m12.indexOf('create table if not exists public.mp_history'))),
    'migration 12 declares the column BEFORE the table that archives it'
  );
  const firstRead = m12.search(/\bm\.settings\b|\bsettings\b(?=[^;]*from mp_matches)/);
  ok(
    m12.indexOf('add column if not exists settings') < firstRead,
    'and before anything reads it'
  );

  /* The header has to tell the truth about prerequisites, because
     that header is the only instruction the person running it gets. */
  ok(
    !/Requires migrations 02 and 11/.test(m12),
    'the header no longer claims a dependency on 11 that is not real'
  );
  /* Deliberately against the RAW file, not the comment-stripped copy:
     the rationale lives in the header prose, and that prose is the
     thing that stops someone "tidying" the duplicate declaration away
     again. */
  ok(
    /42703|not a prerequisite/i.test(read('docs/supabase-migration-12.sql')),
    'the header records WHY the declaration is duplicated, so it is not "simplified" back'
  );
}

/* ---------------------------------------------------------
   general hygiene across all migrations
   --------------------------------------------------------- */
console.log('\nEVERY MIGRATION IS RE-RUNNABLE');
{
  files.forEach((f) => {
    const s = strip(read('docs/' + f));
    const creates = s.match(/create table (?!if not exists)/g) || [];
    ok(creates.length === 0, f + ': every create table is `if not exists`');
    const adds = s.match(/add column (?!if not exists)/g) || [];
    ok(adds.length === 0, f + ': every add column is `if not exists`');
    /* A bare `create policy` fails on a second run; the convention in
       this repo is to drop first. */
    const pols = (s.match(/create policy/g) || []).length;
    const drops = (s.match(/drop policy if exists/g) || []).length;
    ok(pols === 0 || drops >= pols, f + ': every policy is dropped before it is created');
  });
}

console.log('\npass ' + pass + '  fail ' + fail);
process.exit(fail ? 1 : 0);
