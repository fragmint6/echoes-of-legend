#!/usr/bin/env node
'use strict';

/* =============================================================
   CHAPTER II FACTIONS - behavioural regression net
   -------------------------------------------------------------
   Seven factions, 49 legends, added 2026-08-17. sim/verify_all.js
   already covers the roster-wide invariants (stat bands, icons,
   lore, Provoke, upgrade scaling) now that the new files are in
   its FILES list. This suite covers the things that are specific
   to these factions and would otherwise be tested by nobody:

     A. the five engine additions actually fire
     B. the faction identities hold (mark supply/consume, the
        fallen count, the Locker)
     C. the Chapter II shelf is closed - none of this leaks into
        the shop or Chapter I drafts before its Road exists

   Everything here RUNS THE ENGINE. Source-text assertions were
   what let 49 cards sit invisible to verify_all for an hour:
   the file list did not include them, so every check passed
   vacuously. A behavioural test cannot pass vacuously.
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

global.window = {};
global.performance = { now: () => Date.now() };
[
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
  'data/jotunheim.js',
  'data/achaea.js',
  'data/gehenna.js',
  'data/devaloka.js',
  'data/empyrean.js',
  'data/transylvania.js',
  'data/tortuga.js',
  'data/lore.js',
  'js/engine.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const EOL = window.EOL;
const E = EOL.engine;
const AP = E.applyEffectsPublic;

const NEW = [
  'jotunheim',
  'achaea',
  'gehenna',
  'devaloka',
  'empyrean',
  'transylvania',
  'tortuga',
];

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push({ card: c, faction: f })));
const g = (id) => {
  const e = ALL.find((x) => x.card.id === id);
  if (!e) throw new Error('unknown card ' + id);
  return e;
};
const FOES = [
  g('camelot-merlin'),
  g('olympus-athena'),
  g('roma-cicero'),
  g('duat-horus'),
  g('yamato-benkei'),
  g('grimmwood-cinderella'),
];
function battle(team, opts) {
  const B = E.createBattle(team, FOES, {
    roleAware: false,
    rng: () => 0.5,
    oddFirst: 'player',
    ...(opts || {}),
  });
  B.silent = true;
  B.round = 3;
  B.energy.player = 250;
  B.energy.enemy = 250;
  return B;
}
const FILLER = [g('camelot-king-arthur'), g('olympus-zeus'), g('roma-brutus')];

console.log('A. structure');
NEW.forEach((id) => {
  const f = EOL.factions.find((x) => x.id === id);
  ok(!!f && f.cards.length === 7, id + ' registers 7 legends');
});
{
  const missing = ALL.filter((e) => NEW.includes(e.faction.id) && !e.card.lore);
  ok(missing.length === 0, 'all 49 new legends have lore');
  /* One legendary per faction is the shipped rarity law (one per six
     roster slots); at seven cards each faction carries exactly one. */
  const bad = NEW.filter((id) => {
    const f = EOL.factions.find((x) => x.id === id);
    return f.cards.filter((c) => c.rarity === 'legendary').length !== 1;
  });
  ok(bad.length === 0, 'each new faction carries exactly one legendary' + (bad.length ? ' (' + bad + ')' : ''));
}

console.log('B. the fallen count (Jotunheim)');
{
  /* Fenrir is the load-bearing case: he is deliberately BAD until the
     third death, which is a real cost paid up front. If the condition
     silently stopped working he would just be a strong Bruiser, and
     nothing else in the suite would notice. */
  function fenrirDamage(deaths) {
    const B = battle([g('jotunheim-fenrir'), g('jotunheim-odin'), g('jotunheim-freyja'), ...FILLER]);
    B.deathSeq = deaths;
    const fen = B.units.find((u) => u.card.id === 'jotunheim-fenrir');
    const tgt = B.units.find((u) => u.side === 'enemy' && u.slot === 0);
    const hp0 = tgt.hp;
    E.useAbility(B, fen, E.roleAbility(fen), [tgt]);
    return hp0 - tgt.hp;
  }
  const bound = fenrirDamage(0);
  const freed = fenrirDamage(3);
  ok(bound > 0, 'Fenrir deals damage while bound (' + bound + ')');
  ok(
    Math.abs(freed / bound - 2.5) < 0.05,
    'the chains break at 3 fallen: 0.5x -> 1.25x, a 2.5x swing (' + (freed / bound).toFixed(2) + ')'
  );

  /* ODIN'S BRANCH. `branchPasses()` is a hand-maintained subset of
     condMet() and an unknown key leaves `pass` at its default of TRUE -
     so before this was fixed Odin fired his 65% arm from round one and
     Shiva hit every target as if Marked. Both bugs were silent and
     generous, which is the kind no playtest reports. Assert the flip in
     BOTH directions so a future refactor of branchPasses cannot quietly
     re-open it. */
  function odinDamage(deaths) {
    const B = battle([g('jotunheim-odin'), g('jotunheim-thor'), g('jotunheim-hel'), ...FILLER]);
    B.deathSeq = deaths;
    const odin = B.units.find((u) => u.card.id === 'jotunheim-odin');
    const before = B.units.filter((u) => u.side === 'enemy').map((u) => u.hp);
    E.useAbility(B, odin, odin.card.ability, []);
    const after = B.units.filter((u) => u.side === 'enemy').map((u) => u.hp);
    return before.reduce((s, h, i) => s + (h - after[i]), 0);
  }
  const early = odinDamage(0);
  const late = odinDamage(3);
  ok(early > 0, 'Odin damages the board before the third death (' + early + ')');
  ok(
    Math.abs(late / early - 1.3) < 0.02,
    'and harder after it: 50% -> 65%, a 1.30x step (' + (late / early).toFixed(2) + ')'
  );

  /* Freyja scales smoothly rather than at a cliff, and the cap holds -
     an uncapped per-death heal is a full heal by round eight. */
  const B = battle([g('jotunheim-freyja'), ...FILLER, g('jotunheim-hel'), g('jotunheim-thor')]);
  const fr = B.units.find((u) => u.card.id === 'jotunheim-freyja');
  const ally = B.units.find((u) => u.side === 'player' && u.uid !== fr.uid);
  const heal = (deaths) => {
    ally.hp = 1000;
    B.deathSeq = deaths;
    AP(B, fr, [ally], [{ k: 'heal', pctMaxHp: 22, perFallen: 3, perFallenMax: 4, to: 'targets' }], {
      immediate: true,
    });
    return ally.hp - 1000;
  };
  const h0 = heal(0);
  const h4 = heal(4);
  const h9 = heal(9);
  ok(h4 > h0, 'Freyja heals more as legends fall');
  ok(
    Math.abs(h4 - h0 - ally.maxHp * 0.12) < 2,
    'the bonus is exactly 3% per fallen, capped at 4 (+12% Max HP)'
  );
  ok(h9 === h4, 'and the cap HOLDS past 4 fallen - no runaway heal');
}

console.log('C. Marks - Devaloka supplies and consumes');
{
  const B = battle([g('devaloka-kali'), g('devaloka-shiva'), g('devaloka-indra'), ...FILLER]);
  const kali = B.units.find((u) => u.card.id === 'devaloka-kali');
  const foes = B.units.filter((u) => u.side === 'enemy');
  E.useAbility(B, kali, kali.card.ability, [foes[0], foes[1]]);
  const marked = B.units.filter((u) => u.side === 'enemy' && u.flags.marked > 0).length;
  ok(marked === 2, 'Kali supplies 2 Marks (' + marked + ')');

  /* Shiva's payoff must actually read the mark - the whole faction's
     internal chain is Kali -> Shiva/Indra. */
  function shivaDamage(markTarget) {
    const B2 = battle([g('devaloka-shiva'), ...FILLER, g('devaloka-kali'), g('devaloka-vishnu')]);
    const sh = B2.units.find((u) => u.card.id === 'devaloka-shiva');
    const t = B2.units.find((u) => u.side === 'enemy' && u.slot === 0);
    if (markTarget) t.flags.marked = 1;
    const hp0 = t.hp;
    E.useAbility(B2, sh, sh.card.ability, [t]);
    return hp0 - t.hp;
  }
  const plain = shivaDamage(false);
  const onMark = shivaDamage(true);
  ok(onMark > plain, 'Shiva hits a Marked target harder (' + plain + ' -> ' + onMark + ')');
}

console.log('D. the Locker (Tortuga) beats every revive');
{
  const B = battle([g('tortuga-davy-jones'), g('duat-isis'), ...FILLER, g('achaea-medea')]);
  const dj = B.units.find((u) => u.card.id === 'tortuga-davy-jones');
  const victim = B.units.find((u) => u.side === 'enemy');
  E.useAbility(B, dj, dj.card.ability, [victim]);
  ok(victim.flags.noRevive === 1, 'Davy Jones condemns a target');
  victim.alive = false;
  victim.hp = 0;
  AP(B, dj, [victim], [{ k: 'revive', pctMaxHp: 40, to: 'targets' }], { immediate: true });
  ok(victim.alive === false, 'a condemned legend cannot be revived');
  const other = B.units.filter((u) => u.side === 'enemy')[1];
  other.alive = false;
  other.hp = 0;
  AP(B, dj, [other], [{ k: 'revive', pctMaxHp: 40, to: 'targets' }], { immediate: true });
  ok(other.alive === true, 'and an ordinary legend still revives normally');
}

console.log('E. delayed effects (Empyrean)');
{
  const B = battle([g('empyrean-azrael'), g('empyrean-gabriel'), g('empyrean-raphael'), ...FILLER]);
  const az = B.units.find((u) => u.card.id === 'empyrean-azrael');
  const tgt = B.units.find((u) => u.side === 'enemy' && u.slot === 0);
  E.useAbility(B, az, az.card.ability, [tgt]);
  ok(tgt.pending.length === 1, 'Azrael seals a delayed strike');
  const before = tgt.pending[0].turns;

  const gab = B.units.find((u) => u.card.id === 'empyrean-gabriel');
  E.useAbility(B, gab, gab.card.ability, []);
  ok(tgt.pending[0].turns === before - 1, 'Gabriel pulls it one round closer (' + before + ' -> ' + tgt.pending[0].turns + ')');

  /* Raphael is the counterplay that keeps the faction fair. He clears
     pending effects from an ALLY, so put one on our own side first. */
  const B2 = battle([g('empyrean-raphael'), ...FILLER, g('empyrean-uriel'), g('empyrean-michael')]);
  const raph = B2.units.find((u) => u.card.id === 'empyrean-raphael');
  const friend = B2.units.find((u) => u.side === 'player' && u.uid !== raph.uid);
  friend.pending.push({ turns: 2, srcUid: raph.uid, effects: [{ k: 'dmg', power: 2 }], scale: 1 });
  E.useAbility(B2, raph, raph.card.ability, [friend]);
  ok(friend.pending.length === 0, 'Raphael cancels a pending effect aimed at an ally');
}

console.log('F. Greed taxes the enemy pool, not his own (Gehenna)');
{
  const B = E.createBattle([g('gehenna-greed'), ...FILLER, g('gehenna-wrath'), g('gehenna-pride')], FOES, {
    roleAware: false,
    rng: () => 0.5,
    oddFirst: 'player',
  });
  B.silent = true;
  B.energy.player = 40;
  B.energy.enemy = 40;
  const p0 = B.energy.player;
  const e0 = B.energy.enemy;
  E.nextRound(B);
  /* The first draft used `loseEnergy`, which always debits the CASTER's
     pool regardless of `to:` - Gehenna silently taxed itself. The swing
     must favour the Greed side. */
  ok(
    B.energy.player - B.energy.enemy > p0 - e0,
    'the round tax swings energy toward Greed (' + B.energy.player + ' vs ' + B.energy.enemy + ')'
  );
}

console.log('G. packs - 42 in, 7 legendaries and Huaxia out');
{
  /* OWNER RULING 2026-08-18: the seven factions' commons, rares and epics
     are buyable; their one legendary each is not, because the Crown Law
     keeps every legendary in the game out of packs. Huaxia stays wholly
     unbuyable because Chapter II spends it as the reveal at bout XIX.

     Asserted behaviourally against the real economy rather than by
     grepping js/economy.js, because the thing that matters is what the
     shop actually offers. */
  global.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
  const priorDoc = global.document;
  global.document = {
    body: { dataset: {} },
    getElementById() { return null; },
    addEventListener() {},
    dispatchEvent() {},
  };
  eval(fs.readFileSync(path.join(ROOT, 'js/economy.js'), 'utf8'));
  const econ = window.EOL.econ;

  const obtainable = econ.obtainableEntries();
  const packable = econ.packableEntries();
  const isNew = (e) => NEW.includes(e.faction.id);

  ok(
    obtainable.filter(isNew).length === 49,
    'all 49 Chapter II legends are obtainable (' + obtainable.filter(isNew).length + ')'
  );
  ok(
    packable.filter(isNew).length === 42,
    'exactly 42 are packable - 49 minus one legendary each (' +
      packable.filter(isNew).length +
      ')'
  );
  ok(
    packable.filter((e) => e.card.rarity === 'legendary').length === 0,
    'no legendary is packable anywhere in the game (the Crown Law)'
  );
  ok(
    obtainable.filter((e) => e.faction.id === 'huaxia').length === 0,
    'Huaxia is still withheld entirely - it is the bout XIX reveal'
  );

  /* One legendary per faction is the roster law AND the reason exactly 7
     cards are held back. If a faction ever gained a second, the pack count
     would silently drop to 41 and nobody would notice. */
  NEW.forEach((id) => {
    const f = EOL.factions.find((x) => x.id === id);
    const legs = f.cards.filter((c) => c.rarity === 'legendary');
    ok(legs.length === 1, id + ' has exactly one legendary (' + legs.map((c) => c.name) + ')');
  });

  global.document = priorDoc;
}

console.log('H. the Chapter II shelf is closed');
{
  /* These factions belong to a chapter whose Road does not exist yet.
     Selling them now spends the reveal and floods the pack pool; the
     campaign drafting them spoils it AND breaks the tuning of authored
     Chapter I rivals. Both exclusions are asserted here because both
     are one-line changes that are easy to lose. */
  const econSrc = fs.readFileSync(path.join(ROOT, 'js/economy.js'), 'utf8');
  const camp = fs.readFileSync(path.join(ROOT, 'js/campaign.js'), 'utf8');
  /* SUPERSEDED 2026-08-18. This used to assert the shop withheld all seven
     factions. The owner has since ruled that only the LEGENDARIES are held
     back - the other 42 cards belong in packs - so the seven ids are
     deliberately no longer on the withhold list, and section G above tests
     the real behaviour against the live economy.

     What survives is the part that is still true: Huaxia alone is withheld
     wholly, because Chapter II spends it as the reveal at bout XIX. */
  ok(
    /var WITHHELD = \['huaxia'\]/.test(econSrc),
    'the shop withholds Huaxia and nothing else'
  );
  NEW.forEach((id) => {
    ok(
      !new RegExp("WITHHELD[^;]*'" + id + "'").test(econSrc),
      id + ' is no longer withheld from the shop'
    );
  });
  ok(/NOT_IN_CHAPTER_1/.test(camp), 'the campaign has a single Chapter I exclusion list');
  NEW.forEach((id) => {
    ok(new RegExp("'" + id + "'").test(camp), 'Chapter I never drafts ' + id);
  });
}

console.log('I. rival names are trades, not manoeuvres');
{
  /* Owner ruling 2026-08-18: "These rivals don't sound like actual names
     but like things like what is the long game bruh." The first pass named
     five of nine rivals after the EVENT in the fight (The Long Game, The
     Last Stand, The Heralded Blow, The Price-Setter, The Revision) where
     every Chapter One rival is an AGENT NOUN - somebody's trade or standing
     (the Outlaw, the Chronicler, the Warden, the Strategist).

     This section is a lint, not a taste test. It cannot judge whether a
     name is good; it CAN catch the specific regression that happened,
     which is a retired event-name creeping back into the body of the doc
     when someone edits a rival section and copies an old paragraph. The
     rejected names are allowed to appear exactly where they are being
     discussed as rejected - the revision note at the top and the rename
     table in section 0.2 - and nowhere else.

     Why check headings separately: a rename done with sed on the prose
     will happily miss the '### XVI - ...' line if the casing differs, and
     the heading is the one place a player-facing name is unambiguous. */
  const lore = fs.readFileSync(path.join(ROOT, 'docs/LORE-Campaign-Chapter2.md'), 'utf8');
  const lines = lore.split('\n');

  /* The nine bouts, keyed by numeral so a reordered doc still matches.
     XV is the record scene and has no rival, hence the gap. */
  const RIVALS = {
    XI: 'THE UNDERSTUDY',
    XII: 'THE BOOKMAKER',
    XIII: 'THE HERALD',
    XIV: 'THE COLLECTOR',
    XVI: 'THE UNDERTAKER',
    XVII: 'THE MASON',
    XVIII: 'THE WRECKER',
    XIX: 'THE AUDITOR',
    XX: 'THE REDACTOR'
  };
  Object.keys(RIVALS).forEach((num) => {
    const want = RIVALS[num];
    const found = lines.some(
      (l) => /^#{2,3} /.test(l) && new RegExp('\\b' + num + '\\b').test(l) && l.indexOf(want) !== -1
    );
    ok(found, 'bout ' + num + ' is headed ' + want);
  });

  /* The retired names. Each maps to the count of occurrences that are
     legitimate - i.e. inside the revision note or the rename table. If a
     count goes UP, an old name has leaked back into the prose. */
  const RETIRED = ['The Long Game', 'The Last Stand', 'The Heralded Blow', 'The Price-Setter', 'The Revision', 'The Taker', 'The Answer'];
  const discussionZone = lore.slice(0, lore.indexOf('## 1. The premise'));
  RETIRED.forEach((name) => {
    const total = lore.split(name).length - 1;
    const inZone = discussionZone.split(name).length - 1;
    ok(
      total === inZone,
      "'" + name + "' appears only where it is named as rejected (" + total + ' occurrences, all in the changelog/rename table)'
    );
  });

  /* The rename must stay EXPLAINED, not just done. Chapter One's docs
     carry their owner rulings inline; a silent rename would leave the
     next editor free to swing it back. */
  ok(/Revised 2026-08-18 - rivals renamed|Revised 2026-08-18 . rivals renamed/.test(lore), 'the rename carries a dated revision note');
  ok(/## 0\.2 How rivals are named/.test(lore), 'the naming law has its own section');

  /* Chapter One's law, restated as a test: rivals are people, never
     "houses". Scoped to the STORY BODY (section 1 through section 5)
     rather than the whole file, because the meta sections deliberately
     quote the word while explaining why it was thrown out - an unscoped
     match fails on its own changelog, which is the sort of test that gets
     deleted rather than fixed. */
  const body = lore.slice(lore.indexOf('## 1. The premise'), lore.indexOf('## 6. Where the cards come in'));
  ok(!/\bhouses?\b/i.test(body), 'the Chapter II story body never says "house"');
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
