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
  'data/kami.js',
  'data/duat.js',
  'data/asgard.js',
  'data/hemithea.js',
  'data/pandemonium.js',
  'data/devas.js',
  'data/genesis.js',
  'data/transylvania.js',
  'data/tortuga.js',
  'data/lore.js',
  'js/engine.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const EOL = window.EOL;
const E = EOL.engine;
const AP = E.applyEffectsPublic;

const NEW = [
  'asgard',
  'hemithea',
  'pandemonium',
  'devas',
  'genesis',
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
  /* CHANGED 2026-08-18: Hemithea has EIGHT, not seven. Hercules moved
     here from Olympus (owner ruling) because he is a mortal who earned
     his myth, which is this faction's whole thesis. The other six new
     factions still hold at seven, so the expectation is per-faction
     rather than a flat 7 - a blanket number would have quietly hidden
     the move, which is the opposite of what this suite is for. */
  /* Per-faction, because two of them have grown: Hemithea took
     Hercules from Olympus, Genesis gained Adam. A flat 7 would hide
     the next such move. */
  const want = id === 'hemithea' || id === 'genesis' ? 8 : 7;
  ok(!!f && f.cards.length === want, id + ' registers ' + want + ' legends');
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

console.log('B. the fallen count (Asgard)');
{
  /* Fenrir is the load-bearing case: he is deliberately BAD until the
     third death, which is a real cost paid up front. If the condition
     silently stopped working he would just be a strong Bruiser, and
     nothing else in the suite would notice. */
  function fenrirDamage(deaths) {
    const B = battle([g('asgard-fenrir'), g('asgard-odin'), g('asgard-freyja'), ...FILLER]);
    B.deathSeq = deaths;
    const fen = B.units.find((u) => u.card.id === 'asgard-fenrir');
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
    const B = battle([g('asgard-odin'), g('asgard-thor'), g('asgard-hel'), ...FILLER]);
    B.deathSeq = deaths;
    const odin = B.units.find((u) => u.card.id === 'asgard-odin');
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
  const B = battle([g('asgard-freyja'), ...FILLER, g('asgard-hel'), g('asgard-thor')]);
  const fr = B.units.find((u) => u.card.id === 'asgard-freyja');
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

console.log('C. Marks - Devas supplies and consumes');
{
  const B = battle([g('devas-kali'), g('devas-shiva'), g('devas-indra'), ...FILLER]);
  const kali = B.units.find((u) => u.card.id === 'devas-kali');
  const foes = B.units.filter((u) => u.side === 'enemy');
  E.useAbility(B, kali, kali.card.ability, [foes[0], foes[1]]);
  const marked = B.units.filter((u) => u.side === 'enemy' && u.flags.marked > 0).length;
  ok(marked === 2, 'Kali supplies 2 Marks (' + marked + ')');

  /* Shiva's payoff must actually read the mark - the whole faction's
     internal chain is Kali -> Shiva/Indra. */
  function shivaDamage(markTarget) {
    const B2 = battle([g('devas-shiva'), ...FILLER, g('devas-kali'), g('devas-vishnu')]);
    const sh = B2.units.find((u) => u.card.id === 'devas-shiva');
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
  const B = battle([g('tortuga-davy-jones'), g('duat-isis'), ...FILLER, g('hemithea-medea')]);
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

console.log('E. delayed effects (Genesis)');
{
  const B = battle([g('genesis-azrael'), g('genesis-gabriel'), g('genesis-raphael'), ...FILLER]);
  const az = B.units.find((u) => u.card.id === 'genesis-azrael');
  const tgt = B.units.find((u) => u.side === 'enemy' && u.slot === 0);
  E.useAbility(B, az, az.card.ability, [tgt]);
  ok(tgt.pending.length === 1, 'Azrael seals a delayed strike');
  const before = tgt.pending[0].turns;

  const gab = B.units.find((u) => u.card.id === 'genesis-gabriel');
  E.useAbility(B, gab, gab.card.ability, []);
  ok(tgt.pending[0].turns === before - 1, 'Gabriel pulls it one round closer (' + before + ' -> ' + tgt.pending[0].turns + ')');

  /* Raphael is the counterplay that keeps the faction fair. He clears
     pending effects from an ALLY, so put one on our own side first. */
  const B2 = battle([g('genesis-raphael'), ...FILLER, g('genesis-uriel'), g('genesis-michael')]);
  const raph = B2.units.find((u) => u.card.id === 'genesis-raphael');
  const friend = B2.units.find((u) => u.side === 'player' && u.uid !== raph.uid);
  friend.pending.push({ turns: 2, srcUid: raph.uid, effects: [{ k: 'dmg', power: 2 }], scale: 1 });
  E.useAbility(B2, raph, raph.card.ability, [friend]);
  ok(friend.pending.length === 0, 'Raphael cancels a pending effect aimed at an ally');
}

console.log('F. Greed taxes the enemy pool, not his own (Pandemonium)');
{
  const B = E.createBattle([g('pandemonium-greed'), ...FILLER, g('pandemonium-wrath'), g('pandemonium-pride')], FOES, {
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
     pool regardless of `to:` - Pandemonium silently taxed itself. The swing
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

  /* INVERTED 2026-08-18b (owner ruling: "keep the shop as is with the
     pack pool containing just chapter 1 cards").

     This block used to assert that all fifty Chapter II cards WERE
     obtainable and forty-three of them packable. That was the state
     between the two rulings. The shop is now closed to the whole
     chapter again, so the correct assertion is the opposite one, and it
     is written as zero-or-nothing rather than deleted so the flip stays
     legible to whoever reads this next.

     WHY THE REVERT: releasing them took the packable pool from 35 to 80
     cards and roughly halved the odds of pulling any specific Chapter I
     legend - for players who cannot play Chapter II, because it does
     not exist in code yet. */
  ok(
    obtainable.filter(isNew).length === 0,
    'no Chapter II card is obtainable while the chapter is unplayable (' +
      obtainable.filter(isNew).length +
      ')'
  );
  ok(
    packable.filter(isNew).length === 0,
    'no Chapter II card is packable either (' +
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
  /* RESTORED 2026-08-18b, after one turn in the opposite state.

     The history, since this assertion has now flipped twice:
       1. originally: all eight Chapter II factions withheld;
       2. 2026-08-18a: released, on the reasoning that only legendaries
          needed holding back - this test was rewritten to assert their
          ABSENCE from the list;
       3. 2026-08-18b (owner): "keep the shop as is with the pack pool
          containing just chapter 1 cards" - so they are withheld again
          and this asserts their PRESENCE once more.

     Kept as an explicit per-faction loop rather than a regex on the
     whole literal, because the failure that matters is one faction
     quietly falling off the list, and a whole-literal match would also
     fail for harmless reformatting. */
  ok(/var WITHHELD = \[/.test(econSrc), 'the shop still has a single withhold list');
  ok(
    new RegExp("WITHHELD[^\\]]*'huaxia'").test(econSrc),
    'Huaxia is withheld - it is a story reveal as well as a Chapter II card'
  );
  NEW.forEach((id) => {
    ok(
      new RegExp("WITHHELD[^\\]]*'" + id + "'").test(econSrc),
      id + ' is withheld from the shop while Chapter II is unplayable'
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

  /* The ten bouts, keyed by numeral so a reordered doc still matches.

     CORRECTED 2026-08-18 (owner: "Aren't there supposed to be 10 gates?").
     This map used to have nine entries with a hole at XV, because XV was
     written as a cutscene - which quietly made Chapter II a nine-stage
     chapter against Chapter One's ten gates. XV is now a bout (the exam),
     so the map is contiguous XI..XX and the count is asserted below. */
  const RIVALS = {
    XI: 'THE UNDERSTUDY',
    XII: 'THE BOOKMAKER',
    XIII: 'THE HERALD',
    XIV: 'THE COLLECTOR',
    XV: 'THE HERO OF THE BRIDGE',
    XVI: 'THE UNDERTAKER',
    XVII: 'THE MASON',
    XVIII: 'THE WRECKER',
    XIX: 'THE AUDITOR',
    XX: 'THE REDACTOR'
  };
  /* The count is its own assertion because the failure mode is a MISSING
     bout, and a loop over a short map passes happily while being short. */
  ok(Object.keys(RIVALS).length === 10, 'Chapter II has ten bouts, matching Chapter One\'s ten gates');
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

  /* The stage count, asserted against the PROSE as well as the map above,
     because the two can drift apart: renaming a heading is a different
     edit from fixing the section title and the difficulty table, and the
     first pass shipped with all three disagreeing. */
  ok(/## 2\. The ten people in the way/.test(lore), 'section 2 is titled for ten people, not nine');
  ok(
    /\| \*\*XV The Hero of the Bridge\*\* \| \*\*~35%\*\* \| \*\*elite \/ first exam\*\*/.test(lore),
    'XV carries a win-rate target in the difficulty table like every other bout'
  );
  ok(!/no bout/i.test(lore), 'no bout in the chapter is described as having no bout');
  /* INVERTED 2026-08-18. This used to assert the OPPOSITE - that the doc
     justified examining ONCE where Chapter One examines twice. That was
     built on a wrong reading of Chapter One (I had assumed its boss and
     opener introduced nothing, making the slot math impossible), and the
     owner corrected it: "there's 2 elites and the rest of the 8 gates all
     introduce one". Chapter Two now examines twice, at XV and XIX, and the
     two exams ARE the two elites. The assertion is inverted rather than
     deleted so the history of the ruling stays visible in the suite. */
  ok(
    /Two exams, at the same beats as Chapter One/.test(lore),
    'the chapter examines twice, at the same beats as Chapter One'
  );
  ok(
    /### The elites, which are the exams/.test(lore),
    'the doc states outright that the elites and the exams are the same two bouts'
  );
  /* The structural laws that were measured out of campaign-ch1.js. If a
     future edit drifts the chapter back to "the boss introduces nothing",
     these fail. */
  ok(/## 0\.3 The shape, taken from Chapter One/.test(lore), 'the measured Chapter One shape has its own section');
  ok(
    /\| X \| \*\*Gilgamesh — boss\*\* \| legendPack Anubis \| \*\*Duat\*\* \|/.test(lore),
    'the doc records that Chapter One\'s BOSS introduces a faction'
  );

  /* Chapter One's law, restated as a test: rivals are people, never
     "houses". Scoped to the STORY BODY (section 1 through section 5)
     rather than the whole file, because the meta sections deliberately
     quote the word while explaining why it was thrown out - an unscoped
     match fails on its own changelog, which is the sort of test that gets
     deleted rather than fixed. */
  const body = lore.slice(lore.indexOf('## 1. The premise'), lore.indexOf('## 6. Where the cards come in'));
  ok(!/\bhouses?\b/i.test(body), 'the Chapter II story body never says "house"');
}

console.log('J. the overview agrees with the lore');
{
  /* CHAPTER-2-OVERVIEW.md is a SECOND copy of the same facts - names,
     win-rate targets, unlocks, legendaries - written for a different
     reader. Two copies of anything drift, and the drift is silent
     because both files are prose that nobody diffs. Chapter One has the
     same pair of docs and the same exposure.

     This section pins only the facts that exist in BOTH files, which is
     the subset that can actually disagree. It deliberately does not
     check wording: the overview is allowed to be terser, and a test
     that demands identical sentences just gets deleted the first time
     someone edits one of them. */
  const lore = fs.readFileSync(path.join(ROOT, 'docs/LORE-Campaign-Chapter2.md'), 'utf8');
  const over = fs.readFileSync(path.join(ROOT, 'docs/CHAPTER-2-OVERVIEW.md'), 'utf8');

  const RIVALS = {
    XI: 'The Understudy',
    XII: 'The Bookmaker',
    XIII: 'The Herald',
    XIV: 'The Collector',
    XV: 'The Hero of the Bridge',
    XVI: 'The Undertaker',
    XVII: 'The Mason',
    XVIII: 'The Wrecker',
    XIX: 'The Auditor',
    XX: 'The Redactor'
  };
  Object.keys(RIVALS).forEach((num) => {
    ok(
      over.toUpperCase().indexOf(RIVALS[num].toUpperCase()) !== -1,
      'the overview names ' + RIVALS[num]
    );
  });

  /* The win-rate rows. Pulled out of BOTH difficulty tables by numeral
     and compared, rather than hard-coded here - so retuning the chapter
     means editing two docs and zero tests, but forgetting one of the two
     docs still fails. */
  function wrTable(src) {
    const out = {};
    src.split('\n').forEach((l) => {
      const m = l.match(/^\|\s*\*{0,2}(X[IVX]*)\s+[^|]*\|\s*\*{0,2}~(\d+)%/);
      if (m) out[m[1]] = m[2];
    });
    return out;
  }
  const a = wrTable(lore);
  const b = wrTable(over);
  ok(Object.keys(a).length === 10, 'the lore difficulty table has all ten bouts (' + Object.keys(a).length + ')');
  ok(Object.keys(b).length === 10, 'the overview difficulty table has all ten bouts (' + Object.keys(b).length + ')');
  Object.keys(a).forEach((num) => {
    ok(a[num] === b[num], 'bout ' + num + ' targets ~' + a[num] + '% in both docs');
  });

  /* Each faction's one legendary must be credited to the same bout in
     both files. This is the pairing that was already got wrong once this
     session (Fenrir vs Odin as Asgard's legendary), so it gets a
     test rather than a careful read. */
  const LEGEND = {
    hemithea: 'Achilles',
    pandemonium: 'Pride',
    genesis: 'Lucifer',
    transylvania: 'Dracula',
    asgard: 'Odin',
    devas: 'Shiva',
    tortuga: 'Blackbeard'
  };
  Object.keys(LEGEND).forEach((fid) => {
    const f = EOL.factions.find((x) => x.id === fid);
    const legs = f.cards.filter((c) => c.rarity === 'legendary');
    ok(
      legs.length === 1 && legs[0].name === LEGEND[fid],
      fid + "'s legendary is " + LEGEND[fid] + ' in the data, the lore and the overview'
    );
    ok(
      new RegExp('\\*\\*' + LEGEND[fid] + '\\*\\*').test(over),
      'the overview bolds ' + LEGEND[fid] + ' as a centrepiece'
    );
  });

  /* THE UNLOCK MAP, asserted in both docs.

     This is the thing that actually drifted on 2026-08-18: the chapter
     was restructured so the two elites introduce nothing and the boss
     hands over the last faction, and three separate tables had to move
     together (lore section 6, lore section 6b, overview section 7). Two
     of them did and one did not, and only the win-rate cross-check
     caught it - by luck, because that test happened to cover a bout
     whose number also changed.

     So: pin the mapping itself. Each faction must be credited to its
     bout in BOTH files, and the two exams must be credited to neither. */
  const UNLOCK = {
    XI: 'Hemithea',
    XII: 'Huaxia',
    XIII: 'Genesis',
    XIV: 'Transylvania',
    XVI: 'Asgard',
    XVII: 'Devas',
    XVIII: 'Tortuga',
    XX: 'Pandemonium'
  };
  const unlockRow = (src, num) =>
    src.split('\n').filter((l) => l.trim().startsWith('|') && new RegExp('\\b' + num + '\\b').test(l));
  Object.keys(UNLOCK).forEach((num) => {
    const want = UNLOCK[num];
    const inLore = unlockRow(lore, num).some((l) => l.indexOf(want) !== -1);
    const inOver = unlockRow(over, num).some((l) => l.indexOf(want) !== -1);
    ok(inLore && inOver, 'bout ' + num + ' unlocks ' + want + ' in both docs');
  });
  ok(Object.keys(UNLOCK).length === 8, 'exactly eight factions are introduced, as in Chapter One');

  /* The exams must introduce nothing. Asserted as the ABSENCE of any
     faction name on their rows, which is what "unlocks nothing" means in
     a table - a row that merely omits the column would pass a weaker
     test while still reading as an unlock in the prose above it. */
  const FACTIONS = ['Hemithea', 'Huaxia', 'Genesis', 'Transylvania', 'Asgard', 'Devas', 'Tortuga', 'Pandemonium'];
  ['XV', 'XIX'].forEach((num) => {
    const rows = unlockRow(over, num).concat(unlockRow(lore, num));
    const unlockish = rows.filter((l) => /nlock|— \|/.test(l));
    const leaks = unlockish.filter((l) =>
      FACTIONS.some((f) => new RegExp(f + '\\s*\\|').test(l))
    );
    ok(leaks.length === 0, 'exam ' + num + ' introduces no faction in either doc');
  });

  /* Asmodeus: the boss has a name AND a title, and the title alone must
     never be the only thing the docs call him - that was the owner's
     complaint about the rival names generally. */
  ok(/Asmodeus/.test(lore) && /Asmodeus/.test(over), 'the boss is named Asmodeus in both docs');
  ok(
    /"The Redactor" is a title, not a name|The title is not the name/.test(lore + over),
    'the docs say outright that the Redactor is a title'
  );

  /* The overview must keep its own honesty header. Chapter One's
     overview says it was written against the shipped implementation;
     this one was NOT, and a reader who assumes otherwise will treat
     authored win-rates as measured ones. */
  ok(/Status: DESIGN ONLY/.test(over), 'the overview flags itself as design-only, not written against code');
  ok(/authored intent/i.test(over), 'the overview says its win-rates are authored, not measured');
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
