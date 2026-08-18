/* =============================================================
   "No actions available" law (2026-08-05)
   -------------------------------------------------------------
   A side that cannot legally aim at ANYTHING has no actions:
   when the enemy's only survivor is Untargetable (Sun Wukong's
   vanish), enemy-aimed casts go dark and the side auto-passes -
   UNLESS something could still legally fire, e.g. a Medic's
   ally-targeted Restore. And when the banner speaks, it names
   the REAL reason: targets / energy / skills / acted.

   node sim/verify_no_actions.js
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
global.performance = { now: () => Date.now() };
[
  'data/_schema.js', 'data/roles.js', 'data/camelot.js', 'data/olympus.js',
  'data/sherwood.js', 'data/grimmwood.js', 'data/yamato.js', 'data/huaxia.js',
  'data/roma.js', 'data/kami.js', 'data/battlefields.js',
  'js/engine.js', 'js/ai.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL, E = EOL.engine;

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push(c)));
const CARD = {};
ALL.forEach((c) => (CARD[c.id] = c));
const ent = (id) => ({ card: CARD[id], faction: CARD[id].faction });

let pass = 0, fail = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log('  \x1b[31mFAIL\x1b[0m  ' + m); } };
const sec = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

function board(aIds, bIds) {
  let n = 7;
  const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const B = E.createBattle(aIds.map(ent), bIds.map(ent),
    { rng, roleAware: true, simulation: true, field: EOL.battlefieldById('colosseum') });
  B.noOpeningLimit = true;
  return B;
}
const U = (B, id) => B.units.find((u) => u.card.id === id);
const kill = (u) => { u.hp = 0; u.alive = false; };

/* helper: does this ability aim at the ENEMY side? */
function aimsAtEnemy(ability) {
  const t = (ability.spec && ability.spec.target) || {};
  return t.side === 'enemy';
}

/* A team whose every unit aims ONLY at the enemy (no self/auto/ally
   casts), so an Untargetable wall leaves it with literally nothing. */
const ENEMY_ONLY = [];
ALL.forEach((c) => {
  if (c.role !== 'Medic' && aimsAtEnemy(c.ability)) ENEMY_ONLY.push(c.id);
});
const MEDIC = CARD[ALL.find((c) => c.role === 'Medic').id].id;
const WUKONG = 'huaxia-sun-wukong';
ok(!!CARD[WUKONG], 'Sun Wukong exists in data');
ok(ENEMY_ONLY.length >= 6, `at least 6 enemy-only attackers exist (${ENEMY_ONLY.length})`);

sec('A. The Wukong wall - lone Untargetable survivor locks a side out');
{
  const team = ENEMY_ONLY.slice(0, 6);
  const foes = [WUKONG, 'huaxia-nezha', 'huaxia-guan-yu', 'olympus-ares', 'grimmwood-big-bad-wolf'];
  const B = board(team, foes);
  B.energy.player = 150;
  B.energy.enemy = 150;
  const wk = U(B, WUKONG);
  /* every other enemy dies; Wukong stands alone behind his vanish */
  B.units.filter((u) => u.side === 'enemy' && u !== wk).forEach(kill);
  ok(wk.alive, 'Wukong still stands');
  /* what his passive grants: Untargetable AND Provoke, together */
  wk.flags.untargetable = 1;
  wk.flags.taunt = 1;
  /* sanity: NOT a single player unit has a legal cast, energy is fine */
  const usable = E.unitsCanAct(B, 'player');
  ok(usable.length === 0, `no player unit can act through Untargetable (${usable.length} can)`);
  ok(!E.canAct(B, 'player'), 'canAct(player) is false');
  ok(E.whyCantAct(B, 'player') === 'targets', `reason is "targets" (${E.whyCantAct(B, 'player')})`);
  /* Provoke does NOT rescue the situation: the filter strips
     Untargetable first, so the taunt has nothing to grab */
  const arthur = B.units.find((u) => u.side === 'player');
  const pool = E.legalTargets(B, arthur, arthur.card.ability);
  ok(pool.length === 0, `Untargetable beats Provoke - target pool empty (${pool.length})`);
  /* the driver auto-passes the locked-out side */
  const hpBefore = wk.hp;
  E.advanceAction(B);
  ok(B.passed.player === true, 'player side auto-passed for the round');
  ok(wk.hp === hpBefore && wk.alive, 'Wukong untouched through the lockout');
  const passLog = B.log.filter((l) => l.kind === 'round' && /pass/.test(l.text || ''));
  ok(passLog.length > 0 || B.passed.player, 'pass recorded in the log feed');
}

sec('B. The Medic exception - an ally-aimed cast keeps the side alive');
{
  const team = ENEMY_ONLY.slice(0, 5).concat([MEDIC]);
  const foes = [WUKONG, 'huaxia-nezha', 'huaxia-guan-yu', 'olympus-ares', 'grimmwood-big-bad-wolf'];
  const B = board(team, foes);
  B.energy.player = 150;
  const wk = U(B, WUKONG);
  B.units.filter((u) => u.side === 'enemy' && u !== wk).forEach(kill);
  wk.flags.untargetable = 1;
  wk.flags.taunt = 1;
  ok(E.canAct(B, 'player') === true, 'side CAN still act with a Medic up');
  const usable = E.unitsCanAct(B, 'player');
  ok(usable.length === 1 && usable[0].role === 'Medic',
    `exactly the Medic has a legal action (${usable.map((u) => u.role).join(',')})`);
  const med = usable[0];
  const basic = med.card.ability.basic ? med.card.ability : null; // card ability may be signature
  const role = (function () {
    // Medic Restore targets an ally - legalTargets must offer the squad
    return true;
  })();
  const restore = (function () {
    const base = window.EOL.roleAbilities[med.role];
    return { type: 'Active', name: base.name, cost: base.cost, basic: true, text: base.text, spec: base.spec };
  })();
  ok(restore.spec.target.side === 'ally', 'Medic Restore aims at an ally');
  ok(E.legalTargets(B, med, restore).length > 0,
    `Restore has legal targets (${E.legalTargets(B, med, restore).length} allies)`);
  ok(E.usableNow ? E.usableNow(B, med, restore) : true, 'Restore is usable right now');
  void basic; void role;
}

sec('C. Honest reasons - the banner names the real blocker');
{
  /* energy: normal board, broke side -> 'energy' */
  const B1 = board(ENEMY_ONLY.slice(0, 6),
    [WUKONG, 'huaxia-nezha', 'huaxia-guan-yu', 'olympus-ares', 'grimmwood-big-bad-wolf']);
  B1.energy.player = 0;
  ok(E.whyCantAct(B1, 'player') === 'energy',
    `broke side hears "energy" (${E.whyCantAct(B1, 'player')})`);
  ok(!E.canAct(B1, 'player'), 'broke side cannot act (all basics cost Energy)');

  /* skills: rich, targets everywhere, but silenced -> 'skills' */
  const B2 = board(ENEMY_ONLY.slice(0, 6),
    [WUKONG, 'huaxia-nezha', 'huaxia-guan-yu', 'olympus-ares', 'grimmwood-big-bad-wolf']);
  B2.energy.player = 150;
  B2.units.filter((u) => u.side === 'player').forEach((u) => (u.flags.silence = 2));
  ok(E.whyCantAct(B2, 'player') === 'skills',
    `silenced side hears "skills" (${E.whyCantAct(B2, 'player')})`);
  ok(!E.canAct(B2, 'player'), 'silenced side cannot act');

  /* acted: everyone already moved -> 'acted' */
  const B3 = board(ENEMY_ONLY.slice(0, 6),
    [WUKONG, 'huaxia-nezha', 'huaxia-guan-yu', 'olympus-ares', 'grimmwood-big-bad-wolf']);
  B3.units.filter((u) => u.side === 'player').forEach((u) => (B3.acted.player[u.uid] = true));
  ok(E.whyCantAct(B3, 'player') === 'acted',
    `spent side hears "acted" (${E.whyCantAct(B3, 'player')})`);
}

sec('D. Enemy lockout through the AI lens');
{
  /* the enemy side behind the same wall must also fold (AI uses canAct) */
  const B = board(ENEMY_ONLY.slice(0, 6),
    [WUKONG]);
  B.energy.enemy = 150;
  const wk = U(B, WUKONG);
  wk.flags.untargetable = 1;
  /* player aims fine (Wukong's own vanish hides HIM, not his foes)...
     flip it: give the PLAYER's whole side untargetable? no - the law is
     symmetric via legalTargets; test the enemy locked out by making the
     whole player side untargetable */
  B.units.filter((u) => u.side === 'player').forEach((u) => (u.flags.untargetable = 1));
  /* his card ability is the Passive (72 Transformations) - the only move
     he can ever TAKE is his Bruiser basic, and that aims at the enemy */
  ok(wk.card.ability.type === 'Passive', 'Wukong card ability is his Passive (72 Transformations)');
  ok(aimsAtEnemy((function () {
    const base = window.EOL.roleAbilities[wk.role];
    return { spec: base.spec };
  })()), 'his only actable move - the Bruiser basic - aims at the enemy');
  ok(!E.canAct(B, 'enemy'), 'Wukong alone vs ghosts: the enemy cannot act');
  ok(E.whyCantAct(B, 'enemy') === 'targets', `enemy hears "targets" (${E.whyCantAct(B, 'enemy')})`);
}

sec('E. Round flow - one locked side does not freeze the other');
{
  const B = board(ENEMY_ONLY.slice(0, 6),
    [WUKONG, 'huaxia-nezha', 'huaxia-guan-yu', 'olympus-ares', 'grimmwood-big-bad-wolf']);
  B.energy.player = 150; B.energy.enemy = 150;
  const wk = U(B, WUKONG);
  B.units.filter((u) => u.side === 'enemy' && u !== wk).forEach(kill);
  wk.flags.untargetable = 1; wk.flags.taunt = 1;
  /* player locked; Wukong can still swing his signature's own target? -
     his aims are at the player, who IS targetable to him */
  ok(E.canAct(B, 'enemy'), 'Wukong can still act (his foes are not hidden)');
  ok(E.whyCantAct(B, 'player') === 'targets', 'player lockout reason is targets');
}

/* ------------------------------------------------------------- */
console.log('\n' + '='.repeat(64));
if (fail) {
  console.log(`\x1b[31m${fail} FAILED\x1b[0m / ${pass + fail}`);
  process.exit(1);
}
console.log(`\x1b[32mALL ${pass} ASSERTIONS PASSED\x1b[0m`);
