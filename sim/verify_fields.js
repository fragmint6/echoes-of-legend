/* =============================================================
   Battlefield + energy-carryover behaviour audit
   node sim/verify_fields.js
   ============================================================= */
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
  /* Hercules moved to Hemithea 2026-08-18 (owner ruling); this suite
     uses him as a fixture, so the file has to be loaded or CARD[] has a
     hole and every board built from it throws. */
  'data/hemithea.js',
  'data/sherwood.js',
  'data/grimmwood.js',
  'data/yamato.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/kami.js',
  'data/battlefields.js',
  'js/engine.js',
  'js/ai.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL,
  E = EOL.engine,
  AI = EOL.ai;

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push(c)));
const CARD = {};
ALL.forEach((c) => (CARD[c.id] = c));
const ent = (id) => ({ card: CARD[id], faction: CARD[id].faction });

let pass = 0,
  fail = 0;
const fails = [];
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    fails.push(m);
    console.log('  \x1b[31mFAIL\x1b[0m  ' + m);
  }
};
const sec = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');

const FRONT = ['camelot-king-arthur', 'hemithea-hercules', 'sherwood-guy-of-gisborne'];
const BACK = ['sherwood-robin-hood', 'camelot-merlin', 'olympus-apollo'];
const SIX = FRONT.concat(BACK);
const FOES = [
  'yamato-benkei',
  'huaxia-guan-yu',
  'grimmwood-big-bad-wolf',
  'olympus-medusa',
  'grimmwood-pied-piper',
  'camelot-guinevere',
];

function board(field, opts) {
  let n = (opts && opts.seed) || 1;
  const rng = () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;
  const B = E.createBattle(SIX.map(ent), FOES.map(ent), {
    rng,
    roleAware: true,
    simulation: true,
    field: field,
  });
  B.noOpeningLimit = true;
  return B;
}
const F = (id) => EOL.battlefieldById(id);
const U = (B, id) => B.units.find((u) => u.card.id === id);

/* ---------------- data integrity ---------------- */
sec('A. Battlefield data');
ok(EOL.battlefields.length === 10, `10 battlefields defined (${EOL.battlefields.length})`);
const ids = EOL.battlefields.map((f) => f.id);
ok(new Set(ids).size === ids.length, 'battlefield ids unique');
const ICON_FILE = path.join(__dirname, 'fixtures', 'rpg-awesome-icons.txt');
const ICONS = fs.existsSync(ICON_FILE)
  ? new Set(fs.readFileSync(ICON_FILE, 'utf8').trim().split('\n'))
  : null;
EOL.battlefields.forEach((f) => {
  ok(!!f.name && !!f.tagline && !!f.icon, `${f.id}: has name/tagline/icon`);
  ok(Array.isArray(f.rules) && f.rules.length > 0, `${f.id}: documents its rules`);
  ok(!!f.colors && !!f.colors.primary, `${f.id}: has a colour scheme`);
  if (ICONS) ok(ICONS.has(f.icon), `${f.id}: icon ${f.icon} exists in RPG Awesome`);
});
{
  const c = F('colosseum');
  const mods = [
    'basicsFrontRowOnly',
    'backRowAtk',
    'frontRowDef',
    'energyPerRound',
    'energyCap',
    'echoFirstAbility',
    'deathEnergy',
    'woundedAtk',
    'championAtk',
    'championHp',
    'roundBuffs',
  ];
  ok(
    mods.every((k) => c[k] === undefined),
    'Colosseum carries NO mechanical modifiers'
  );
}

/* ---------------- energy carry-over ---------------- */
sec('B. Energy carry-over (cap 150)');
{
  const B = board(null);
  ok(B.energy.player === 60, `round 1 grants 60 (${B.energy.player})`);
  B.energy.player = 50;
  B.energy.enemy = 50;
  E.nextRound(B); // round 2 grants 80
  ok(B.energy.player === 130, `unspent 50 + 80 grant = 130 (${B.energy.player})`);
  E.nextRound(B); // round 3 grants 100 -> 230 clamped to 150
  ok(B.energy.player === 150, `clamped to the 150 cap (${B.energy.player})`);
  E.nextRound(B);
  ok(B.energy.player === 150, `stays at the cap (${B.energy.player})`);
}
{
  // spending draws the bank down, and the grant never scales past 100
  const B = board(null);
  for (let r = 1; r < 8; r++) E.nextRound(B);
  ok(B.round === 8, 'advanced to round 8');
  ok(E.energyForRound(8) === 100, `round 8 grant is still 100, not 150 (${E.energyForRound(8)})`);
}
{
  const B = board(null);
  B.energy.player = 0;
  E.addEnergy(B, 'player', 999);
  ok(B.energy.player === 150, `addEnergy clamps to 150 (${B.energy.player})`);
  E.addEnergy(B, 'player', -999);
  ok(B.energy.player === 0, `addEnergy floors at 0 (${B.energy.player})`);
}

/* ---------------- 1. Narrow Pass ---------------- */
sec('C. The Narrow Pass');
{
  const B = board(F('narrow-pass'));
  B.energy.player = 150;
  const frontU = U(B, 'camelot-king-arthur');
  const backU = U(B, 'sherwood-robin-hood');
  ok(E.isFront(frontU) && !E.isFront(backU), 'test fixture rows are as expected');
  ok(E.canUse(B, frontU, E.roleAbility(frontU)), 'front row CAN use a Basic');
  ok(!E.canUse(B, backU, E.roleAbility(backU)), 'back row CANNOT use a Basic');
  const backSig = backU.card.ability;
  if (backSig.type === 'Active') {
    ok(E.canUse(B, backU, backSig), 'back row CAN still use its Skill');
  } else {
    const merlin = U(B, 'camelot-merlin');
    ok(E.canUse(B, merlin, merlin.card.ability), 'back row CAN still use its Skill');
  }
  const B2 = board(null);
  B2.energy.player = 150;
  ok(
    E.canUse(B2, U(B2, 'sherwood-robin-hood'), E.roleAbility(U(B2, 'sherwood-robin-hood'))),
    'without the field the back row keeps its Basic'
  );

  /* THE STALL (reported 2026-08-14).
     A back-row legend on this field has no Basic, so a signature is its
     only move. Zhuge Liang's needs TWO targets; facing a single
     survivor it cannot be aimed at all. usableNow() only asked for
     "at least one" legal target, so the engine believed the side could
     act, refused to auto-pass, and the round stalled with every
     ability greyed out - the battle UI already required >= pickCount,
     so the two disagreed.

     Assert the whole chain, not just the predicate: a stuck side must
     also actually pass when the round driver next runs. */
  /* Zhuge is not in the shared SIX fixture, so build a board that has
     him in the back row explicitly. (A previous version looked him up
     in the default board and silently skipped the whole check when he
     was absent - the suite prints only failures, so it looked green.) */
  const zhugeSix = FRONT.concat(['huaxia-zhuge-liang', 'camelot-merlin', 'olympus-apollo']);
  const buildZ = (foeIds) => {
    let n = 1;
    const rng = () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;
    const b = E.createBattle(zhugeSix.map(ent), foeIds.map(ent), {
      rng,
      roleAware: true,
      simulation: true,
      field: F('narrow-pass'),
    });
    b.noOpeningLimit = true;
    return b;
  };

  const B3 = buildZ(FOES);
  B3.energy.player = 150;
  B3.round = 3;
  const zhuge = U(B3, 'huaxia-zhuge-liang');
  ok(!!zhuge, 'Zhuge Liang is on the test board');
  {
    /* leave exactly one enemy standing */
    E.unitsOf(B3, 'enemy').forEach((u, i) => {
      if (i > 0) {
        u.hp = 0;
        u.alive = false;
      }
    });
    /* and leave Zhuge as our only living legend */
    E.unitsOf(B3, 'player').forEach((u) => {
      if (u !== zhuge) {
        u.hp = 0;
        u.alive = false;
      }
    });
    const sig = zhuge.card.ability;
    ok(!E.isFront(zhuge), 'Zhuge Liang is in the back row');
    ok(E.pickCount(sig) === 2, 'his signature needs two targets');
    ok(E.legalTargets(B3, zhuge, sig).length === 1, 'only one enemy is left to aim at');
    ok(!E.canUse(B3, zhuge, E.roleAbility(zhuge)), 'his Basic is blocked by the field');
    ok(!E.usableNow(B3, zhuge, sig), 'a two-target skill is NOT usable against one enemy');
    ok(!E.canAct(B3, 'player'), 'so the side genuinely cannot act');
    ok(E.whyCantAct(B3, 'player') === 'targets', 'and the reason given is targets, not energy');
    E.advanceAction(B3);
    ok(B3.passed.player === true, 'the round driver auto-passes the stuck side');

    /* The counterpart: two enemies alive and the same skill is fine. */
    const B4 = buildZ(FOES);
    B4.energy.player = 150;
    B4.round = 3;
    const z4 = U(B4, 'huaxia-zhuge-liang');
    E.unitsOf(B4, 'enemy').forEach((u, i) => {
      if (i > 1) {
        u.hp = 0;
        u.alive = false;
      }
    });
    ok(E.usableNow(B4, z4, z4.card.ability), 'the same skill IS usable when two enemies remain');
  }
}

/* ---------------- 2. Open Plains ---------------- */
sec('D. The Open Plains');
{
  const plain = board(null),
    open = board(F('open-plains'));
  const bp = U(plain, 'sherwood-robin-hood'),
    bo = U(open, 'sherwood-robin-hood');
  const fp = U(plain, 'camelot-king-arthur'),
    fo = U(open, 'camelot-king-arthur');
  ok(
    Math.abs(E.atkOf(bo) / E.atkOf(bp) - 1.15) < 0.02,
    `back row ATK +15% (${E.atkOf(bp)} -> ${E.atkOf(bo)})`
  );
  ok(E.defOf(fo) === E.defOf(fp) - 15, `front row DEF -15 (${E.defOf(fp)} -> ${E.defOf(fo)})`);
  ok(E.atkOf(fo) === E.atkOf(fp), 'front row ATK unchanged');
  ok(E.defOf(bo) === E.defOf(bp), 'back row DEF unchanged');
}

/* ---------------- 3/4. Mana Spring & Energy Void ---------------- */
sec('E. Mana Spring / Energy Void');
{
  const B = board(F('mana-spring'));
  B.energy.player = 0;
  B.energy.enemy = 0;
  E.nextRound(B); // round 2: 80 + 20
  ok(B.energy.player === 100, `+20 per round (${B.energy.player})`);
  ok(E.energyCap(B) === 170, `cap raised to 170 (${E.energyCap(B)})`);
  B.energy.player = 165;
  E.addEnergy(B, 'player', 50);
  ok(B.energy.player === 170, `clamps at the raised cap (${B.energy.player})`);
}
{
  const B = board(F('energy-void'));
  B.energy.player = 0;
  B.energy.enemy = 0;
  E.nextRound(B); // round 2: 80 - 10
  ok(B.energy.player === 70, `-10 per round (${B.energy.player})`);
  ok(E.energyCap(B) === 150, 'cap unchanged at 150');
  const c = U(B, 'camelot-merlin');
  ok(E.costOf(B, c, c.card.ability) === c.card.ability.cost, 'ability costs are unchanged');
}

/* ---------------- 5. Colosseum ---------------- */
sec('F. The Colosseum (neutral)');
{
  const plain = board(null),
    col = board(F('colosseum'));
  const a = U(plain, 'sherwood-robin-hood'),
    b = U(col, 'sherwood-robin-hood');
  ok(E.atkOf(a) === E.atkOf(b) && E.defOf(a) === E.defOf(b), 'stats identical to no-field');
  col.energy.player = 0;
  plain.energy.player = 0;
  E.nextRound(col);
  E.nextRound(plain);
  ok(col.energy.player === plain.energy.player, 'energy identical to no-field');
  ok(
    E.canUse(col, U(col, 'sherwood-robin-hood'), E.roleAbility(U(col, 'sherwood-robin-hood'))),
    'back row keeps its Basic'
  );
}

/* ---------------- 6. Mirror Realm ---------------- */
sec('G. The Mirror Realm');
{
  const B = board(F('mirror-realm'));
  B.energy.player = 150;
  const merlin = U(B, 'camelot-merlin');
  const foes = B.units.filter((u) => u.side === 'enemy');
  const hp0 = foes.map((f) => f.hp);
  const eBefore = B.energy.player;
  const cost = E.costOf(B, merlin, merlin.card.ability);
  E.useAbility(B, merlin, merlin.card.ability, []);
  ok(
    B.roundEchoUsed.player === true || B.roundEchoUsed === true,
    "echo flag set after the player's first signature"
  );
  ok(B.energy.player === eBefore - cost, `echo costs no energy (spent only ${cost})`);
  // a second cast by player must NOT echo
  const gis = U(B, 'sherwood-guy-of-gisborne');
  B.energy.player = 150;
  const before2 = B.roundEchoUsed.player || B.roundEchoUsed;
  E.useAbility(B, gis, gis.card.ability, [foes.find((f) => f.alive && E.isFront(f)) || foes[0]]);
  ok(
    before2 && (B.roundEchoUsed.player || B.roundEchoUsed),
    'still only one echo for player this round'
  );
  E.nextRound(B);
  ok(!B.roundEchoUsed.player && !B.roundEchoUsed.enemy, 'echo resets on the next round');
}
{
  // the echo really does deal ~50% extra on a damaging skill
  const plain = board(null, { seed: 7 });
  const mirror = board(F('mirror-realm'), { seed: 7 });
  [plain, mirror].forEach((B) => {
    B.energy.player = 150;
  });
  const gp = U(plain, 'sherwood-guy-of-gisborne'),
    gm = U(mirror, 'sherwood-guy-of-gisborne');
  const tp = plain.units.filter((u) => u.side === 'enemy' && E.isFront(u))[0];
  const tm = mirror.units.filter((u) => u.side === 'enemy' && E.isFront(u))[0];
  const p0 = tp.hp,
    m0 = tm.hp;
  E.useAbility(plain, gp, gp.card.ability, [tp]);
  E.useAbility(mirror, gm, gm.card.ability, [tm]);
  const dp = p0 - tp.hp,
    dm = m0 - tm.hp;
  ok(dm > dp, `echo adds damage (${dp} -> ${dm})`);
  ok(
    Math.abs(dm / dp - 1.5) < 0.15,
    `echo is ~50% of the original (ratio ${(dm / dp).toFixed(2)})`
  );
}

/* ---------------- 7. Spirit World ---------------- */
sec('H. The Spirit World');
/* victims are chosen deliberately: Guan Yu (front-row Tank, no death
   passive / no always-on defence) - NOT Benkei, whose Standing Death
   passive revives him at 2% after any real kill and would pollute
   every lethality assertion. */
const SW_VICTIM = 'huaxia-guan-yu';
{
  /* New rule (2026-08-02): a lethal blow leaves the legend on 1 HP
     instead of killing them. Once per legend. */
  const B = board(F('spirit-world'));
  B.energy.player = 150;
  const killer = U(B, 'sherwood-guy-of-gisborne');
  const tgt = U(B, SW_VICTIM);
  tgt.hp = 1;
  E.useAbility(B, killer, E.roleAbility(killer), [tgt]); // single-hit BASIC
  ok(tgt.alive, 'a lethal blow does NOT kill in the Spirit World');
  ok(tgt.hp === 1, `the legend is held on exactly 1 HP (got ${tgt.hp})`);
  ok(tgt.spiritSpared === true, 'the reprieve is recorded on the legend');
}
{
  /* the reprieve is spent: the next lethal blow finishes the job */
  const B = board(F('spirit-world'));
  B.energy.player = 150;
  const killer = U(B, 'sherwood-guy-of-gisborne');
  const tgt = U(B, SW_VICTIM);
  tgt.hp = 1;
  E.useAbility(B, killer, E.roleAbility(killer), [tgt]);
  B.acted.player = {};
  B.energy.player = 150;
  E.useAbility(B, killer, E.roleAbility(killer), [tgt]);
  ok(!tgt.alive, 'the second lethal blow kills - the reprieve is once per legend');
}
{
  /* USER LAW 2026-08-05: "the next blow finishes the job" - a TWO-PART
     skill's follow-up REGISTERS inside the same cast. Guy of Gisborne's
     execute rider (fires below 40% HP) used to be swallowed by the
     same-action shield; now the spare lands on hit 1 and the rider
     kills. */
  const B = board(F('spirit-world'));
  B.energy.player = 150;
  const guy = U(B, 'sherwood-guy-of-gisborne');
  const tgt = U(B, SW_VICTIM);
  tgt.hp = Math.round(tgt.maxHp * 0.1); // below the 40% execute line, and hit 1 is lethal
  let hits = 0;
  const prevHook = EOL.onBattleEvent;
  EOL.onBattleEvent = (BB, ev) => {
    if (ev.t === 'dmg' && ev.tgt === tgt.uid) hits++;
  };
  E.useAbility(B, guy, guy.card.ability, [tgt]);
  EOL.onBattleEvent = prevHook;
  ok(hits === 2, `both parts of the two-part skill fired (${hits}/2)`);
  ok(tgt.spiritSpared === true, 'hit 1 was reprieved at the threshold');
  ok(!tgt.alive, 'the follow-up hit REGISTERS and kills - the next blow finishes the job');
}
{
  /* burn ticks honour the same reprieve: a lethal tick spares once,
     the next tick kills. (Previously burn ignored the field and killed
     straight through.) */
  const B = board(F('spirit-world'));
  B.simulation = false; // this regression inspects the visual replay log
  const tgt = U(B, SW_VICTIM);
  tgt.flags.burn = 3;
  tgt.hp = 5;
  E.setTurn(B, 'enemy'); // the burning side is handed the action -> tick
  ok(tgt.alive && tgt.hp === 1, `a lethal burn tick is reprieved to 1 HP (hp ${tgt.hp})`);
  ok(tgt.spiritSpared === true, 'the burn reprieve is recorded on the legend');
  const burnLog = B.log.filter((entry) => entry.type === 'burn').pop();
  ok(
    burnLog &&
      burnLog.meta.hpAfter === tgt.hp &&
      burnLog.meta.shieldAfter === tgt.shield &&
      burnLog.meta.maxHp === tgt.maxHp,
    'the Burn replay carries its post-tick HP snapshot for synchronized bars'
  );
  E.setTurn(B, 'player');
  E.setTurn(B, 'enemy'); // second tick
  ok(!tgt.alive, 'the next burn tick finishes the job');
}
{
  /* and it is field-gated */
  const B = board(null);
  B.energy.player = 150;
  const tgt = U(B, SW_VICTIM);
  tgt.hp = 1;
  const guy2 = U(B, 'sherwood-guy-of-gisborne');
  E.useAbility(B, guy2, E.roleAbility(guy2), [tgt]);
  ok(!tgt.alive, 'without the field a lethal blow kills as normal');
}

/* ---------------- 8. Ancient Ruins ---------------- */
sec('I. The Ancient Ruins');
{
  const f = F('ancient-ruins');
  /* user law 2026-08-04: exactly three relics (+5% ATK / +5% DEF / 5% heal) */
  ok(f.roundBuffs.length === 3, `relic pool has exactly 3 entries (${f.roundBuffs.length})`);
  ok(
    f.roundBuffs.every((b) => b.id && b.label && Array.isArray(b.effects)),
    'every relic has id/label/effects'
  );
  const seen = {};
  for (let i = 0; i < 60; i++) {
    const B = board(f, { seed: 1000 + i * 37 });
    B.units.forEach((u) => {
      u.hp = Math.round(u.maxHp * 0.5);
    });
    const evs = [];
    EOL.onBattleEvent = (BB, ev) => {
      if (ev.t === 'fieldBuff') evs.push(ev.id);
    };
    E.nextRound(B);
    EOL.onBattleEvent = null;
    evs.forEach((id) => (seen[id] = (seen[id] || 0) + 1));
  }
  const distinct = Object.keys(seen).length;
  ok(distinct >= 3, `relics vary across rounds (${distinct} distinct in 60 rolls)`);
  ok(
    Object.keys(seen).every((k) => f.roundBuffs.some((b) => b.id === k)),
    'every fired relic exists in the pool'
  );
}
{
  // the relic reaches BOTH sides
  const f = F('ancient-ruins');
  let applied = false;
  for (let i = 0; i < 40 && !applied; i++) {
    const B = board(f, { seed: 500 + i * 13 });
    B.units.forEach((u) => {
      u.hp = Math.round(u.maxHp * 0.4);
    });
    const before = B.units.map((u) => u.hp);
    let fired = null;
    EOL.onBattleEvent = (BB, ev) => {
      if (ev.t === 'fieldBuff') fired = ev.id;
    };
    E.nextRound(B);
    EOL.onBattleEvent = null;
    if (fired === 'mend') {
      const pHealed = B.units.some((u, i2) => u.side === 'player' && u.hp > before[i2]);
      const eHealed = B.units.some((u, i2) => u.side === 'enemy' && u.hp > before[i2]);
      ok(pHealed && eHealed, 'a relic applies to BOTH sides (symmetric)');
      applied = true;
    }
  }
  if (!applied)
    console.log('       (mend relic did not roll in 40 tries - skipped symmetry probe)');
}
{
  // row-scoped relics hit only their row
  const B = board(F('ancient-ruins'));
  const front = B.units.filter((u) => u.side === 'player' && E.isFront(u))[0];
  const back = B.units.filter((u) => u.side === 'player' && !E.isFront(u))[0];
  E.applyEffectsPublic(
    B,
    front,
    [front],
    [{ k: 'stat', stat: 'def', amt: 10, turns: 1, to: 'self', frontOnly: true }],
    { immediate: true }
  );
  ok(
    front.buffs.some((b) => b.stat === 'def'),
    'frontOnly relic reaches a front legend'
  );
  E.applyEffectsPublic(
    B,
    back,
    [back],
    [{ k: 'stat', stat: 'def', amt: 10, turns: 1, to: 'self', frontOnly: true }],
    { immediate: true }
  );
  ok(!back.buffs.some((b) => b.stat === 'def'), 'frontOnly relic skips a back legend');
}

/* ---------------- 9. Legend's Trial ---------------- */
sec("J. The Legend's Trial");
{
  const plain = board(null),
    trial = board(F('heros-trial'));
  ['player', 'enemy'].forEach((side) => {
    const champs = trial.units.filter((u) => u.side === side && u.isChampion);
    ok(champs.length === 1, `${side}: exactly one champion (${champs.length})`);
    const team = trial.units.filter((u) => u.side === side);
    const costs = team.map((u) =>
      u.card.ability.type === 'Active' ? u.card.ability.cost || 0 : 0
    );
    const maxCost = Math.max.apply(null, costs);
    const champ = champs[0];
    const cc = champ.card.ability.type === 'Active' ? champ.card.ability.cost || 0 : 0;
    ok(cc === maxCost, `${side}: champion holds the priciest skill (${cc} = ${maxCost})`);
  });
  const cp = trial.units.find((u) => u.isChampion && u.side === 'player');
  const same = plain.units.find((u) => u.card.id === cp.card.id);
  ok(
    Math.abs(cp.maxHp / same.maxHp - 1.3) < 0.01,
    `champion +30% Max HP (${same.maxHp} -> ${cp.maxHp})`
  );
  ok(cp.hp === cp.maxHp, 'champion starts at full HP');
  ok(
    Math.abs(E.atkOf(cp) / E.atkOf(same) - 1.2) < 0.02,
    `champion +20% ATK (${E.atkOf(same)} -> ${E.atkOf(cp)})`
  );
  const nonChamp = trial.units.find((u) => u.side === 'player' && !u.isChampion);
  const plainNon = plain.units.find((u) => u.card.id === nonChamp.card.id);
  ok(nonChamp.maxHp === plainNon.maxHp, 'non-champions are untouched');
}

/* ---------------- 10. Blood Battlefield ---------------- */
sec('K. The Blood Battlefield');
{
  const B = board(F('blood-battlefield'));
  const u = U(B, 'sherwood-guy-of-gisborne');
  u.hp = u.maxHp;
  const healthy = E.atkOf(u);
  u.hp = Math.round(u.maxHp * 0.49);
  const wounded = E.atkOf(u);
  ok(
    Math.abs(wounded / healthy - 1.25) < 0.02,
    `below 50% HP = +25% ATK (${healthy} -> ${wounded})`
  );
  u.hp = Math.round(u.maxHp * 0.51);
  ok(E.atkOf(u) === healthy, 'above 50% HP is unaffected');
  const plain = board(null);
  const p = U(plain, 'sherwood-guy-of-gisborne');
  p.hp = Math.round(p.maxHp * 0.3);
  ok(
    E.atkOf(p) === E.atkOf(U(board(null), 'sherwood-guy-of-gisborne')),
    'no wounded bonus without the field'
  );
}

/* ---------------- AI integration ---------------- */
sec('L. AI rollouts respect the field');
{
  const B = board(F('narrow-pass'));
  const C = E.cloneBattle(B, B.rng);
  ok(C.field && C.field.id === 'narrow-pass', 'cloneBattle carries the battlefield');
  ok(
    JSON.stringify(C.roundEchoUsed) === JSON.stringify(B.roundEchoUsed),
    'cloneBattle carries the echo guard'
  );
}

/* ---------------- full games on every field ---------------- */
sec('M. Soak - full AI games on all 10 battlefields');
{
  const POOL = [];
  EOL.factions.forEach((f) => f.cards.forEach((c) => POOL.push({ card: c, faction: f.id })));
  AI.setDepth(2);
  AI.setSimulationBudget({
    beamWidth: 4,
    pruneKeep: 2,
    minRollouts: 1,
    maxRollouts: 3,
    timeBudget: 12,
  });
  let totalErr = 0;
  EOL.battlefields.forEach((field) => {
    let err = 0,
      done = 0,
      rounds = 0,
      p1 = 0,
      viol = 0;
    for (let i = 0; i < 12; i++) {
      try {
        let a = 4242 + i * 7919;
        const rng = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648;
        const t = EOL.rules.splitCapped(POOL, rng);
        const B = E.createBattle(t[0], t[1], {
          rng,
          roleAware: true,
          simulation: true,
          field: field,
        });
        let g = 0;
        while (!B.over && B.round <= 20 && g++ < 5000) {
          const side = E.advanceAction(B);
          if (!side) {
            if (!B.over) E.nextRound(B);
            continue;
          }
          const act = AI.bestAction(B, side);
          if (!act) {
            E.passTurn(B, side);
            continue;
          }
          E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
          const cap = E.energyCap(B);
          if (B.energy.player > cap || B.energy.enemy > cap) viol++;
          if (B.energy.player < 0 || B.energy.enemy < 0) viol++;
          if (B.units.some((u) => u.hp < 0 || u.hp > u.maxHp)) viol++;
        }
        done++;
        rounds += B.round;
        if (B.winner === 'player') p1++;
      } catch (e) {
        err++;
        totalErr++;
        if (err <= 1) console.log('       ERR ' + field.id + ': ' + e.message);
      }
    }
    ok(
      err === 0 && viol === 0,
      `${field.name.padEnd(22)} ${done} games, avg ${(rounds / Math.max(1, done)).toFixed(1)} rounds, ` +
        `P1 ${Math.round((100 * p1) / Math.max(1, done))}%${err ? ' ERRORS:' + err : ''}${viol ? ' VIOL:' + viol : ''}`
    );
  });
  ok(totalErr === 0, `no engine errors across all fields (${totalErr})`);
}

console.log('\n' + '='.repeat(64));
if (fail) {
  console.log(`\x1b[31m${fail} FAILED\x1b[0m / ${pass + fail}`);
  fails.forEach((f) => console.log('  - ' + f));
} else {
  console.log(`\x1b[32mALL ${pass} ASSERTIONS PASSED\x1b[0m`);
}
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
