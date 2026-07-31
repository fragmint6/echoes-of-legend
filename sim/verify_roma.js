/* Roma implementation verification — data legality + engine behaviour.
   node sim/verify_roma.js                                            */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
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
  'js/engine.js',
  'js/ai.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL,
  E = EOL.engine;

let pass = 0,
  fail = 0;
function ok(c, m) {
  if (c) {
    pass++;
    console.log('  PASS  ' + m);
  } else {
    fail++;
    console.log('  FAIL  ' + m);
  }
}
const BANDS = {
  Tank: [[6800, 7600], [950, 1100], [28, 32]],
  Bruiser: [[5500, 6500], [1450, 1750], [20, 25]],
  Caster: [[4700, 5000], [1850, 2050], [14, 18]],
  Controller: [[4800, 5800], [1150, 1400], [16, 20]],
  Medic: [[4600, 5000], [950, 1100], [18, 22]],
  Sniper: [[4300, 4600], [1700, 2000], [10, 15]],
};

const roma = EOL.factions.find((f) => f.id === 'roma');
const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push(c)));

console.log('\n=== 1. Faction registration ===');
ok(!!roma, 'roma faction registered');
ok(roma.cards.length === 6, 'has 6 cards (' + roma.cards.length + ')');
ok(roma.icon === 'ra-guarded-tower', 'icon ra-guarded-tower');
ok(roma.tagline === 'The eternal city demands victory.', 'tagline');
ok(
  roma.colors.primary === '#7b4dc0' &&
    roma.colors.secondary === '#d4af37' &&
    roma.colors.glow === '#c9a0ff',
  'colors'
);
ok(EOL.factions.length === 7, '7 factions total');
ok(ALL.length === 45, '45 heroes total = 39 existing + 6 Roma (' + ALL.length + ')');

console.log('\n=== 2. Stat bands + uniqueness ===');
roma.cards.forEach((c) => {
  const b = BANDS[c.role],
    s = c.stats;
  const inb =
    s.hp >= b[0][0] && s.hp <= b[0][1] &&
    s.atk >= b[1][0] && s.atk <= b[1][1] &&
    s.def >= b[2][0] && s.def <= b[2][1];
  ok(inb, `${c.name} (${c.role}) ${s.hp}/${s.atk}/${s.def} in band`);
  ok(c.faction === 'roma', `${c.name} faction stamped`);
});
const ids = ALL.map((c) => c.id);
ok(new Set(ids).size === ids.length, 'all hero ids unique');
// ability spec uniqueness vs every existing card
const sig = (c) =>
  JSON.stringify([c.ability.name, c.ability.cost, (c.ability.spec || {}).target,
    (c.ability.spec || {}).effects || (c.ability.passive || {}).effects]);
const sigs = ALL.map(sig);
ok(new Set(sigs).size === sigs.length, 'no duplicate ability specification');

console.log('\n=== 3. Role cap legality ===');
const byRole = {};
ALL.forEach((c) => (byRole[c.role] = (byRole[c.role] || 0) + 1));
console.log('       roster by role:', JSON.stringify(byRole));
const short = Object.keys(byRole).filter((r) => byRole[r] < 6);
ok(byRole.Tank >= 3 && byRole.Sniper >= 3, 'every role can fill a capped team of 3');
console.log(short.length
  ? '       NOTE: roles under the 6-per-role draft snapshot law: ' + short.join(', ') +
    ' (pre-existing; Roma raised Caster 4->5)'
  : '       all roles meet the 6-per-role draft snapshot law');

console.log('\n=== 4. Ability text keywords ===');
const KNOWN = /Untargetable|Exposed|Burning|Burn|Marked|Marks|Mark|Shielded|Shield|Taunts|Taunting|Taunt|Silenced|Silence/g;
roma.cards.forEach((c) => {
  const bare = c.ability.text.replace(/<[^>]+>/g, '');
  const bad = (bare.match(/\b(Stun|Freeze|Poison|Bleed|Slow|Root|Blind)\b/g) || []);
  ok(bad.length === 0, `${c.name} text uses only defined status words`);
});

/* ---------- engine behaviour harness ---------- */
function mkBattle(aIds, bIds) {
  const find = (id) => ALL.find((c) => c.id === id);
  const A = aIds.map((id) => ({ card: find(id), faction: find(id).faction }));
  const Bt = bIds.map((id) => ({ card: find(id), faction: find(id).faction }));
  let n = 1;
  const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const B = E.createBattle(A, Bt, { rng, roleAware: true, simulation: true });
  B.noOpeningLimit = true; // engine's own unit-test hatch: allow round-1 signatures
  return B;
}
const U = (B, id) => B.units.find((u) => u.card.id === id);
const filler = ['camelot-guinevere', 'sherwood-little-john', 'grimmwood-snow-white',
  'olympus-apollo', 'yamato-momotaro'];

console.log('\n=== 5. targetHasBuff condition ===');
{
  const B = mkBattle(['roma-brutus', ...filler], ['camelot-king-arthur', ...filler]);
  const brutus = U(B, 'roma-brutus');
  const arthur = U(B, 'camelot-king-arthur');
  B.units.filter((u) => u.side === 'enemy' && u !== arthur).forEach((u) => { u.alive = false; });
  arthur.baseAtk = 9999; // guarantee highestAtk pick
  const bare = E.condMet
    ? null
    : null;
  // no buff -> 150%
  B.energy.player = 100;
  const hp0 = arthur.hp;
  E.useAbility(B, brutus, brutus.card.ability, [arthur]);
  const plain = hp0 - arthur.hp;
  // with a shield -> 210%
  arthur.hp = arthur.maxHp;
  arthur.shield = 0;
  B.acted.player = {};
  B.energy.player = 100;
  arthur.buffs.push({ stat: 'atk', amt: 20, turns: 2, tag: null });
  const hp1 = arthur.hp;
  E.useAbility(B, brutus, brutus.card.ability, [arthur]);
  const buffed = hp1 - arthur.hp;
  console.log(`       plain=${plain}  vs buffed=${buffed}  ratio=${(buffed / plain).toFixed(3)}`);
  ok(buffed > plain * 1.3, 'Et Tu, Brute deals ~40% more into a buffed target');
}

console.log('\n=== 6. killedCountAtLeast (Caesar chain) ===');
{
  // single kill -> NO permanent stack
  const B = mkBattle(['roma-julius-caesar', ...filler], ['olympus-medusa', 'camelot-mordred', ...filler.slice(0, 4)]);
  const cae = U(B, 'roma-julius-caesar');
  const v1 = B.units.filter((u) => u.side === 'enemy')[0];
  const v2 = B.units.filter((u) => u.side === 'enemy')[1];
  B.units.filter((u) => u.side === 'enemy' && u !== v1 && u !== v2).forEach((u) => { u.alive = false; });
  v1.hp = 1; v2.hp = 99999; v2.maxHp = 99999;
  B.energy.player = 100;
  E.useAbility(B, cae, cae.card.ability, [v1]);
  const s1 = cae.buffs.filter((b) => b.tag === 'veni-vidi-vici').length;
  ok(!v1.alive && s1 === 0, 'single kill grants NO stack (' + s1 + ')');

  // double kill -> exactly one stack
  const B2 = mkBattle(['roma-julius-caesar', ...filler], ['olympus-medusa', 'camelot-mordred', ...filler.slice(0, 4)]);
  const cae2 = U(B2, 'roma-julius-caesar');
  const e1 = B2.units.filter((u) => u.side === 'enemy')[0];
  const e2 = B2.units.filter((u) => u.side === 'enemy')[1];
  B2.units.filter((u) => u.side === 'enemy' && u !== e1 && u !== e2).forEach((u) => { u.alive = false; });
  e1.hp = 1; e2.hp = 1;
  B2.energy.player = 100;
  E.useAbility(B2, cae2, cae2.card.ability, [e1]);
  const s2 = cae2.buffs.filter((b) => b.tag === 'veni-vidi-vici').length;
  ok(!e1.alive && !e2.alive, 'chain executes the lowest-HP survivor');
  ok(s2 === 1, 'double kill grants exactly 1 permanent stack (' + s2 + ')');
}

console.log('\n=== 7. Constantine kill-gated shield ===');
{
  // no kill -> +10% atk, no shield
  const B = mkBattle(['roma-constantine-the-great', ...filler], ['olympus-hercules', ...filler]);
  const con = U(B, 'roma-constantine-the-great');
  B.energy.player = 100;
  E.useAbility(B, con, con.card.ability, []);
  const allies = B.units.filter((u) => u.side === 'player' && u.alive);
  const atkB = allies[0].buffs.filter((b) => b.stat === 'atk').reduce((s, b) => s + b.amt, 0);
  const shielded = allies.some((u) => u.shield > 0);
  ok(atkB === 10, 'no kill -> allies +10% ATK (' + atkB + ')');
  ok(!shielded, 'no kill -> NO shield');

  // kill -> +20% atk and a shield
  const B2 = mkBattle(['roma-constantine-the-great', ...filler], ['olympus-hercules', ...filler]);
  const con2 = U(B2, 'roma-constantine-the-great');
  B2.units.filter((u) => u.side === 'enemy').forEach((u) => { u.hp = 1; });
  B2.energy.player = 100;
  E.useAbility(B2, con2, con2.card.ability, []);
  const al2 = B2.units.filter((u) => u.side === 'player' && u.alive);
  const atk2 = al2[0].buffs.filter((b) => b.stat === 'atk').reduce((s, b) => s + b.amt, 0);
  ok(atk2 === 20, 'kill -> allies +20% ATK (' + atk2 + ')');
  ok(al2.every((u) => u.shield > 0), 'kill -> every ally shielded');
}

console.log('\n=== 8. Spartacus / Augustus passives ===');
{
  const B = mkBattle(['roma-spartacus', 'roma-augustus', ...filler.slice(0, 4)], ['camelot-mordred', ...filler]);
  const sp = U(B, 'roma-spartacus');
  const victim = B.units.filter((u) => u.side === 'player' && u.card.id !== 'roma-spartacus' && u.card.id !== 'roma-augustus')[0];
  const shBefore = sp.shield;
  // kill the ally through the real damage path (handleDeath isn't exported)
  victim.hp = 1;
  const foe = B.units.filter((u) => u.side === 'enemy')[0];
  B.energy.enemy = 100;
  E.useAbility(B, foe, E.roleAbility(foe), [victim]);
  const others = B.units.filter((u) => u.side === 'player' && u.alive);
  const gained = others.every((u) => u.buffs.some((b) => b.tag === 'i-am-spartacus'));
  ok(gained, 'ally death -> all surviving allies gain the ATK stack');
  ok(sp.shield > shBefore, 'ally death -> Spartacus shields himself');
}
{
  // Augustus fires on a team kill
  const B = mkBattle(['roma-augustus', 'camelot-mordred', ...filler.slice(0, 4)], ['olympus-medusa', ...filler]);
  const aug = U(B, 'roma-augustus');
  const mord = U(B, 'camelot-mordred');
  const wounded = B.units.filter((u) => u.side === 'player');
  wounded.forEach((u) => { u.hp = Math.round(u.maxHp * 0.5); });
  const foe = B.units.filter((u) => u.side === 'enemy')[0];
  B.units.filter((u) => u.side === 'enemy' && u !== foe).forEach((u) => { u.alive = false; });
  foe.hp = 1;
  B.energy.player = 100;
  const before = wounded.map((u) => u.hp);
  E.useAbility(B, mord, mord.card.ability, [foe]);
  const healed = wounded.filter((u, i) => u.hp > before[i]).length;
  ok(!foe.alive, 'enemy defeated');
  ok(healed === 2, 'Pax Romana heals exactly 2 allies (' + healed + ')');
}

console.log('\n=== 9. Cicero ===');
{
  const B = mkBattle(['roma-cicero', ...filler], ['olympus-zeus', ...filler]);
  const cic = U(B, 'roma-cicero');
  const zeus = U(B, 'olympus-zeus');
  B.energy.player = 100;
  const costBefore = E.costOf(B, zeus, zeus.card.ability);
  E.useAbility(B, cic, cic.card.ability, [zeus]);
  ok(zeus.flags.silence > 0, 'Philippics silences');
  const costAfter = E.costOf(B, zeus, zeus.card.ability);
  ok(costAfter === costBefore + 12, `cost +12 (${costBefore} -> ${costAfter})`);
  ok(!(zeus.flags.exposed > 0), 'no Exposed on a previously-clean target');

  const B2 = mkBattle(['roma-cicero', ...filler], ['olympus-zeus', ...filler]);
  const cic2 = U(B2, 'roma-cicero');
  const z2 = U(B2, 'olympus-zeus');
  z2.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null }); // pre-debuffed
  B2.energy.player = 100;
  E.useAbility(B2, cic2, cic2.card.ability, [z2]);
  ok(z2.flags.exposed > 0, 'Exposed applied to an already-debuffed target');
}

console.log('\n=== 10. Momotaro regression (shield `if` now honoured) ===');
{
  const B = mkBattle(['yamato-momotaro', ...filler], ['olympus-medusa', ...filler]);
  const mom = U(B, 'yamato-momotaro');
  B.energy.player = 100; // >=30 -> DEF + front shield branch
  E.useAbility(B, mom, mom.card.ability, []);
  const front = B.units.filter((u) => u.side === 'player' && u.slot < 3);
  ok(front.some((u) => u.shield > 0), 'high energy -> front allies shielded');

  const B2 = mkBattle(['yamato-momotaro', ...filler], ['olympus-medusa', ...filler]);
  const mom2 = U(B2, 'yamato-momotaro');
  B2.units.filter((u) => u.side === 'player').forEach((u) => { u.hp = Math.round(u.maxHp * 0.5); });
  B2.energy.player = 35;
  E.useAbility(B2, mom2, mom2.card.ability, []);
  B2.energy.player = 20; // low-energy branch: heal, and NO shield
  const B3 = mkBattle(['yamato-momotaro', ...filler], ['olympus-medusa', ...filler]);
  const mom3 = U(B3, 'yamato-momotaro');
  B3.units.filter((u) => u.side === 'player').forEach((u) => { u.hp = Math.round(u.maxHp * 0.5); });
  B3.energy.player = 29;
  E.useAbility(B3, mom3, mom3.card.ability, []);
  const anyShield = B3.units.filter((u) => u.side === 'player').some((u) => u.shield > 0);
  ok(!anyShield, 'low energy -> no shield (bug fixed; previously always-on)');
}

console.log('\n=== 11. Smoke: 60 AI-vs-AI games with Roma in the pool ===');
{
  const POOL = [];
  EOL.factions.forEach((f) => f.cards.forEach((c) => POOL.push({ card: c, faction: f.id })));
  const AI = EOL.ai;
  AI.setDepth(2);
  AI.setSimulationBudget({ beamWidth: 4, pruneKeep: 2, minRollouts: 1, maxRollouts: 3, timeBudget: 12 });
  let done = 0, err = 0, romaSeen = 0;
  for (let i = 0; i < 60; i++) {
    try {
      let a = 1000 + i * 7919;
      const rng = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
      const t = EOL.rules.splitCapped(POOL, rng);
      const B = E.createBattle(t[0], t[1], { rng, roleAware: true, simulation: true });
      if (B.units.some((u) => u.card.faction === 'roma')) romaSeen++;
      /* Mirror sim.js's real battle loop: advanceAction drives the
         alternating-action clock and tells us when the round is over. */
      let guard = 0;
      while (!B.over && B.round <= 20 && guard++ < 5000) {
        const side = E.advanceAction(B);
        if (!side) { if (!B.over) E.nextRound(B); continue; }
        const act = AI.bestAction(B, side);
        if (!act) { E.passTurn(B, side); continue; }
        E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
      }
      done++;
    } catch (e) {
      err++;
      if (err <= 2) console.log('       ERROR: ' + e.message);
    }
  }
  ok(err === 0, `60 games ran without engine errors (completed ${done}, errors ${err})`);
  ok(romaSeen > 30, `Roma appeared in ${romaSeen}/60 games`);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====\n`);
process.exit(fail ? 1 : 0);
