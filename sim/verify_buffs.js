/* =============================================================
   Buff / debuff economy + comeback grant - behaviour audit
   node sim/verify_buffs.js
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
  'data/sherwood.js',
  'data/grimmwood.js',
  'data/yamato.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/takamagahara.js',
  'data/battlefields.js',
  'data/draft-ai.js',
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

const FILL = [
  'camelot-guinevere',
  'sherwood-little-john',
  'grimmwood-snow-white',
  'olympus-apollo',
  'yamato-momotaro',
];
const CLEAN = [
  'olympus-hercules',
  'camelot-mordred',
  'huaxia-mulan',
  'olympus-medusa',
  'grimmwood-pied-piper',
  'sherwood-will-scarlet',
];
function board(mine, foes, field) {
  let n = 1;
  const rng = () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;
  const B = E.createBattle(mine.map(ent), (foes || CLEAN).map(ent), {
    rng,
    roleAware: true,
    simulation: true,
    field: field || null,
  });
  B.noOpeningLimit = true;
  B.energy.player = 150;
  B.energy.enemy = 150;
  return B;
}
const U = (B, id) => B.units.find((u) => u.card.id === id);
const near = (a, b, tol) => Math.abs(a - b) / Math.abs(b || 1) <= (tol || 0.06);

/* =============================================================
   A. SILENCE now denies the whole turn
   ============================================================= */
sec('A. Silence blocks every action');
{
  const B = board(['roma-cicero', ...FILL]);
  const foe = B.units.find((u) => u.side === 'enemy');
  foe.flags.silence = 1;
  ok(!E.canUse(B, foe, foe.card.ability), 'silenced hero cannot use its signature');
  ok(!E.canUse(B, foe, E.roleAbility(foe)), 'silenced hero cannot use its BASIC either (new)');
  foe.flags.silence = 0;
  ok(E.canUse(B, foe, E.roleAbility(foe)), 'un-silenced hero can act again');
}

/* =============================================================
   B. debuffCount / buffCount
   ============================================================= */
sec('B. Stack counting');
{
  const B = board(['roma-cicero', ...FILL]);
  const t = B.units.find((u) => u.side === 'enemy');
  ok(E.debuffCount(t) === 0, `clean target reads 0 debuffs (${E.debuffCount(t)})`);
  t.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null });
  ok(E.debuffCount(t) === 1, 'one negative stat buff = 1');
  t.flags.burn = 2;
  t.flags.exposed = 1;
  ok(E.debuffCount(t) === 3, `burn + exposed stack the count (${E.debuffCount(t)})`);
  t.buffs.push({ stat: 'def', amt: -10, turns: 2, tag: null });
  ok(E.debuffCount(t) === 4, `each negative stat counts separately (${E.debuffCount(t)})`);
  /* positive buffs must NOT count as debuffs */
  t.buffs.push({ stat: 'atk', amt: 30, turns: 2, tag: null });
  ok(E.debuffCount(t) === 4, 'a positive buff does not raise the debuff count');
  ok(E.buffCount(t) === 1, `buffCount sees the positive buff (${E.buffCount(t)})`);
  t.shield = 500;
  ok(E.buffCount(t) === 2, 'a Shield counts as a buff');
}

/* =============================================================
   C. perDebuff damage scaling
   ============================================================= */
sec('C. Per-stack damage conversion');
{
  const B = board(['roma-cicero', ...FILL]);
  const cic = U(B, 'roma-cicero');
  const foe = B.units.find((u) => u.side === 'enemy');
  const base = E.atkOf(cic) * 1.1 * (1 - E.defOf(foe) / 100);
  const hp0 = foe.hp;
  E.useAbility(B, cic, cic.card.ability, [foe]);
  const clean = hp0 - foe.hp;
  ok(
    near(clean, base, 0.08),
    `clean target takes base 110% (${Math.round(clean)} vs ${Math.round(base)})`
  );
}
{
  const B = board(['roma-cicero', ...FILL]);
  const cic = U(B, 'roma-cicero');
  const foe = B.units.find((u) => u.side === 'enemy');
  foe.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null });
  foe.flags.burn = 2;
  foe.flags.exposed = 1; // 3 debuffs -> +75%
  const n = E.debuffCount(foe);
  const expect = (E.atkOf(cic) * 1.1 + E.atkOf(cic) * 0.15 * n) * (1 - E.defOf(foe) / 100);
  const hp0 = foe.hp;
  E.useAbility(B, cic, cic.card.ability, [foe]);
  const dealt = hp0 - foe.hp;
  ok(n === 3, `fixture has 3 debuffs (${n})`);
  ok(near(dealt, expect, 0.1), `+15% per debuff (${Math.round(dealt)} vs ${Math.round(expect)})`);
  ok(
    dealt > E.atkOf(cic) * 1.1 * 0.8,
    'stacking still raises the payout (now capped for role integrity)'
  );
}
{
  /* the cap must hold */
  const B = board(['roma-cicero', ...FILL]);
  const cic = U(B, 'roma-cicero');
  const foe = B.units.find((u) => u.side === 'enemy');
  for (let i = 0; i < 8; i++) foe.buffs.push({ stat: 'atk', amt: -5, turns: 2, tag: null });
  /* Cicero applies Exposed to an already-debuffed target BEFORE the hit, and
     Exposed zeroes DEF - so the model must use post-Exposed mitigation. */
  const capped = E.atkOf(cic) * 1.1 + E.atkOf(cic) * 0.15 * 3;
  const hp0 = foe.hp;
  E.useAbility(B, cic, cic.card.ability, [foe]);
  ok(E.debuffCount(foe) > 3, `fixture really has >3 debuffs (${E.debuffCount(foe)})`);
  ok(
    near(hp0 - foe.hp, capped, 0.1),
    `perDebuffMax caps the bonus at 3 stacks (${Math.round(hp0 - foe.hp)} vs ${Math.round(capped)})`
  );
}

/* =============================================================
   D. Debuff scaling & buff consumption
   ============================================================= */
sec('D. Debuff scaling (Inari) & buff consumption');
{
  const B = board(['takamagahara-inari', ...FILL]);
  const ina = U(B, 'takamagahara-inari');
  const foe = B.units.find((u) => u.side === 'enemy');
  foe.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null });
  foe.buffs.push({ stat: 'def', amt: -15, turns: 2, tag: null });
  foe.flags.burn = 2;
  const n = E.debuffCount(foe);
  ok(n === 3, `fixture has 3 debuffs (${n})`);
  const base = (E.atkOf(ina) * 0.75 + E.atkOf(ina) * 0.3 * n) * (1 - E.defOf(foe) / 100);
  const hp0 = foe.hp;
  E.useAbility(B, ina, ina.card.ability, [foe]);
  const dealt = hp0 - foe.hp;
  ok(dealt > 0, `deals damage (${Math.round(dealt)})`);
  ok(
    near(dealt, base, 0.1),
    `scales by debuffs (+30% per debuff: ${Math.round(dealt)} vs ${Math.round(base)})`
  );
  ok(foe.flags.exposed > 0, 'applies Exposed');
}
{
  /* a clean target: no debuffs, base ability still works */
  const B = board(['takamagahara-inari', ...FILL]);
  const ina = U(B, 'takamagahara-inari');
  const foe = B.units.find((u) => u.side === 'enemy');
  const base = E.atkOf(ina) * 0.75 * (1 - E.defOf(foe) / 100);
  const hp0 = foe.hp;
  E.useAbility(B, ina, ina.card.ability, [foe]);
  ok(
    near(hp0 - foe.hp, base, 0.1),
    `undebuffed target takes base 75% (${Math.round(hp0 - foe.hp)} vs ${Math.round(base)})`
  );
  ok(foe.flags.exposed > 0, 'still applies Exposed');
}
{
  /* consumeBuffs engine keyword verification */
  const B = board(['takamagahara-inari', ...FILL]);
  const ina = U(B, 'takamagahara-inari');
  const foe = B.units.find((u) => u.side === 'enemy');
  foe.buffs.push({ stat: 'atk', amt: 20, turns: 2, tag: null });
  foe.buffs.push({ stat: 'atk', amt: -25, turns: 2, tag: null });
  foe.shield = 500;
  E.applyEffectsPublic(B, ina, [foe], [{ k: 'consumeBuffs', to: 'targets', alsoShield: true }], {});
  ok(
    foe.buffs.some((b) => b.amt < 0),
    'debuffs are NOT removed by consumeBuffs'
  );
  ok(!foe.buffs.some((b) => b.amt > 0), 'only positive buffs are consumed');
  ok(foe.shield === 0, 'shield is stripped by consumeBuffs');
}

/* =============================================================
   E. Team-wide buff conversions
   ============================================================= */
sec('E. Trap buffs converted to team-wide');
{
  const B = board(['camelot-guinevere', ...FILL]);
  const g = U(B, 'camelot-guinevere');
  const t = B.units.find((u) => u.side === 'player' && u.card.id !== 'camelot-guinevere');
  t.shield = 500; // pre-shielded triggers the rider
  t.hp = Math.round(t.maxHp * 0.6);
  E.useAbility(B, g, g.card.ability, [t]);
  const allies = B.units.filter((u) => u.side === 'player' && u.alive);
  const buffed = allies.filter((u) => u.buffs.some((b) => b.stat === 'atk' && b.amt === 10)).length;
  ok(
    buffed === allies.length,
    `Guinevere's ATK rider is now team-wide (${buffed}/${allies.length})`
  );
}
{
  const B = board(['olympus-apollo', ...FILL]);
  const a = U(B, 'olympus-apollo');
  const t = B.units.find((u) => u.side === 'player' && u.card.id !== 'olympus-apollo');
  t.hp = Math.round(t.maxHp * 0.5);
  E.useAbility(B, a, a.card.ability, [t]);
  const allies = B.units.filter((u) => u.side === 'player' && u.alive);
  const crit = allies.filter((u) => u.buffs.some((b) => b.stat === 'crit')).length;
  ok(crit === allies.length, `Apollo's crit is now team-wide (${crit}/${allies.length})`);
}

/* =============================================================
   F. COMEBACK GRANT
   ============================================================= */
sec('F. Comeback energy (+15 per hero of deficit)');
{
  const B = board(['camelot-king-arthur', ...FILL]);
  B.energy.player = 0;
  B.energy.enemy = 0;
  E.nextRound(B); // even teams
  ok(B.comeback.player === 0 && B.comeback.enemy === 0, 'no grant when teams are even');
  const even = B.energy.player;
  ok(even === B.energy.enemy, 'both sides receive the same on an even board');
}
{
  const B = board(['camelot-king-arthur', ...FILL]);
  /* kill two player heroes -> player is 2 down */
  const doomed = B.units.filter((u) => u.side === 'player').slice(0, 2);
  doomed.forEach((u) => {
    u.alive = false;
    u.hp = 0;
  });
  B.energy.player = 0;
  B.energy.enemy = 0;
  E.nextRound(B);
  ok(B.comeback.player === 30, `2 heroes down = +30 energy at 15/hero (${B.comeback.player})`);
  ok(B.comeback.enemy === 0, 'the leading side gets nothing');
  ok(B.energy.player === B.energy.enemy + 30, 'the trailing side really banks the extra');
}
{
  /* the grant must FADE as the deficit closes */
  const B = board(['camelot-king-arthur', ...FILL]);
  const doomed = B.units.filter((u) => u.side === 'player').slice(0, 3);
  doomed.forEach((u) => {
    u.alive = false;
    u.hp = 0;
  });
  B.energy.player = 0;
  B.energy.enemy = 0;
  E.nextRound(B);
  ok(B.comeback.player === 45, `3 down = +45 (${B.comeback.player})`);
  /* now the enemy loses two, cutting the deficit to 1 */
  B.units
    .filter((u) => u.side === 'enemy')
    .slice(0, 2)
    .forEach((u) => {
      u.alive = false;
      u.hp = 0;
    });
  B.energy.player = 0;
  B.energy.enemy = 0;
  E.nextRound(B);
  ok(
    B.comeback.player === 15,
    `deficit closed to 1 -> grant shrinks to +15 (${B.comeback.player})`
  );
  /* and equalise entirely */
  B.units
    .filter((u) => u.side === 'enemy' && u.alive)
    .slice(0, 1)
    .forEach((u) => {
      u.alive = false;
      u.hp = 0;
    });
  B.energy.player = 0;
  B.energy.enemy = 0;
  E.nextRound(B);
  ok(B.comeback.player === 0, `tied board -> grant is gone (${B.comeback.player})`);
  ok(B.comeback.enemy === 0, 'and the other side still gets none');
}
{
  /* it must never break the cap */
  const B = board(['camelot-king-arthur', ...FILL]);
  B.units
    .filter((u) => u.side === 'player')
    .slice(0, 4)
    .forEach((u) => {
      u.alive = false;
      u.hp = 0;
    });
  B.energy.player = 145;
  E.nextRound(B);
  ok(
    B.energy.player <= E.energyCap(B),
    `comeback respects the energy cap (${B.energy.player} <= ${E.energyCap(B)})`
  );
}
{
  /* clone must carry it so AI rollouts price it */
  const B = board(['camelot-king-arthur', ...FILL]);
  B.comeback.player = 20;
  const C = E.cloneBattle(B, B.rng);
  ok(C.comeback && C.comeback.player === 20, 'cloneBattle carries the comeback state');
}

/* =============================================================
   G. AI actually values the new tools
   ============================================================= */
sec('G. AI valuation');
{
  const B = board(['roma-cicero', ...FILL]);
  const cic = U(B, 'roma-cicero');
  const cleanFoe = B.units.filter((u) => u.side === 'enemy')[0];
  const dirtyFoe = B.units.filter((u) => u.side === 'enemy')[1];
  dirtyFoe.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null });
  dirtyFoe.flags.burn = 2;
  dirtyFoe.flags.exposed = 1;
  const vClean = AI.scoreAction(B, cic, cic.card.ability, [cleanFoe]);
  const vDirty = AI.scoreAction(B, cic, cic.card.ability, [dirtyFoe]);
  ok(
    vDirty > vClean,
    `AI prefers the stacked target (${Math.round(vClean)} -> ${Math.round(vDirty)})`
  );
}
{
  const B = board(['takamagahara-inari', ...FILL]);
  const ina = U(B, 'takamagahara-inari');
  const plain = B.units.filter((u) => u.side === 'enemy')[0];
  const buffed = B.units.filter((u) => u.side === 'enemy')[1];
  buffed.buffs.push({ stat: 'atk', amt: 25, turns: 2, tag: null });
  buffed.buffs.push({ stat: 'def', amt: 15, turns: 2, tag: null });
  buffed.shield = 700;
  const vPlain = AI.scoreAction(B, ina, ina.card.ability, [plain]);
  const vBuffed = AI.scoreAction(B, ina, ina.card.ability, [buffed]);
  ok(
    vBuffed > vPlain,
    `AI prefers stripping a buffed target (${Math.round(vPlain)} -> ${Math.round(vBuffed)})`
  );
}

/* =============================================================
   H. SOAK - invariants with everything switched on
   ============================================================= */
sec('H. Soak');
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
  let err = 0,
    viol = 0,
    games = 0,
    silencedTurns = 0,
    comebackSeen = 0;
  for (let i = 0; i < 100; i++) {
    try {
      let a = 8080 + i * 7919;
      const rng = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648;
      const t = EOL.rules.splitCapped(POOL, rng);
      const B = E.createBattle(t[0], t[1], { rng, roleAware: true, simulation: true });
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
        /* a silenced unit must never be handed an action */
        if (act.unit.flags.silence > 0) silencedTurns++;
        E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
        const cap = E.energyCap(B);
        if (B.energy.player > cap || B.energy.enemy > cap) viol++;
        if (B.energy.player < 0 || B.energy.enemy < 0) viol++;
        if (B.units.some((u) => u.hp < 0 || u.hp > u.maxHp)) viol++;
      }
      if (B.comeback.player > 0 || B.comeback.enemy > 0) comebackSeen++;
      games++;
    } catch (e) {
      err++;
      if (err <= 2) console.log('    ERR: ' + e.message);
    }
  }
  ok(err === 0, `100 games, no engine errors (${err})`);
  ok(viol === 0, `no energy/HP invariant breaches (${viol})`);
  ok(silencedTurns === 0, `a silenced hero was never given a turn (${silencedTurns})`);
  console.log(`  games with a comeback grant active at the end: ${comebackSeen}/${games}`);
}

/* =============================================================
   LIFESTEAL FEEDS ON THE FULL BLOW  (reported 2026-08-15)
   "Big Bad Wolf heals 25% of the damage dealt (40% vs a debuffed
   target)" - 5000 damage should return 1250 HP. It did not: the
   damage loop fed ctx.lastDamage from dealDamage()'s return value,
   which is HP LOST ONLY - the shield soak is subtracted from it
   before HP is touched. Against a shielded target he healed off a
   fraction of his hit, and off a fully-absorbed hit he healed
   nothing at all, even though the blow plainly landed. The passive
   on-hit rider path (Red Riding Hood) already added the soak back.
   ============================================================= */
{
  const mk = (shield, hurtPct) => {
    const B = E.createBattle([ent('grimmwood-big-bad-wolf')], [ent('grimmwood-snow-white')], {
      seed: 7,
    });
    B.noOpeningLimit = true;
    B.round = 3;
    B.energy = { player: 100, enemy: 100 };
    const wolf = B.units.find((u) => u.side === 'player');
    const foe = B.units.find((u) => u.side === 'enemy');
    foe.hp = foe.maxHp;
    foe.shield = shield;
    wolf.hp = Math.round(wolf.maxHp * hurtPct);
    return { B, wolf, foe };
  };

  let baseline = null;
  [0, 2000, 5000, 20000].forEach((shield) => {
    const { B, wolf, foe } = mk(shield, 0.5);
    const hp0 = wolf.hp;
    const fh = foe.hp;
    const fs = foe.shield;
    E.useAbility(B, wolf, wolf.card.ability, [foe], 0);
    const dealt = fh - foe.hp + (fs - foe.shield);
    const healed = wolf.hp - hp0;
    if (baseline === null) baseline = dealt;
    ok(
      dealt === baseline,
      `Wolf's blow is the same size whatever the shield (${shield}: ${dealt} vs ${baseline})`
    );
    ok(
      healed === Math.round(dealt * 0.25),
      `Wolf heals 25% of the damage DEALT, shield ${shield}: ` +
        `healed ${healed}, expected ${Math.round(dealt * 0.25)} of ${dealt}`
    );
  });

  /* the headline number from the report */
  {
    const { B, wolf, foe } = mk(0, 0.5);
    const hp0 = wolf.hp;
    const fh = foe.hp;
    E.useAbility(B, wolf, wolf.card.ability, [foe], 0);
    const dealt = fh - foe.hp;
    const healed = wolf.hp - hp0;
    ok(
      Math.abs(healed / dealt - 0.25) < 0.01,
      `lifesteal ratio is 25% (dealt ${dealt}, healed ${healed})`
    );
  }

  /* healing may not overflow max HP */
  {
    const { B, wolf, foe } = mk(0, 0.99);
    E.useAbility(B, wolf, wolf.card.ability, [foe], 0);
    ok(wolf.hp <= wolf.maxHp, 'lifesteal never pushes the Wolf over max HP');
  }
}

/* =============================================================
   RAPUNZEL REACHES THE BACK ROW ONLY  (reported 2026-08-15)
   "Let Down Your Hair" is spec'd row: 'back', but legalTargets()
   treated that as a PREFERENCE - it mirrored the melee front-row
   rule and fell through to the whole pool when the back row was
   empty. Against a 3-unit enemy team (everyone in front) she hit
   the entire board. 'front' keeps the fall-through, because that
   is the melee rule every Tank/Bruiser depends on.
   ============================================================= */
{
  const filler = [
    'grimmwood-snow-white',
    'grimmwood-red-riding-hood',
    'grimmwood-goldilocks',
    'grimmwood-cinderella',
    'grimmwood-hansel-gretel',
    'grimmwood-evil-queen',
  ];
  const mk = (n) => {
    const B = E.createBattle(
      [ent('grimmwood-rapunzel')],
      filler.slice(0, n).map(ent),
      { seed: 5 }
    );
    B.noOpeningLimit = true;
    B.round = 3;
    B.energy = { player: 100, enemy: 100 };
    return B;
  };

  [6, 5, 4, 3, 2, 1].forEach((n) => {
    const B = mk(n);
    const rap = B.units.find((u) => u.side === 'player');
    const foes = B.units.filter((u) => u.side === 'enemy');
    const pool = E.legalTargets(B, rap, rap.card.ability);
    ok(
      pool.every((u) => !E.isFront(u)),
      `Rapunzel's legal targets are back-row only vs ${n} enemies ` +
        `(got slots ${pool.map((u) => u.slot).join(',') || 'none'})`
    );

    const hp0 = {};
    foes.forEach((f) => (hp0[f.uid] = f.hp));
    E.useAbility(B, rap, rap.card.ability, [], 0);
    const hitFront = foes.filter((f) => f.hp < hp0[f.uid] && E.isFront(f));
    ok(
      hitFront.length === 0,
      `and no front-row enemy takes damage vs ${n} enemies ` +
        `(hit slots ${hitFront.map((f) => f.slot).join(',') || 'none'})`
    );

    const debuffedFront = foes.filter((f) => E.isFront(f) && f.buffs.length);
    ok(
      debuffedFront.length === 0,
      `nor is any front-row enemy debuffed by her vs ${n} enemies`
    );
  });

  /* with a real back row she still works */
  {
    const B = mk(6);
    const rap = B.units.find((u) => u.side === 'player');
    const back = B.units.filter((u) => u.side === 'enemy' && !E.isFront(u));
    const hp0 = {};
    back.forEach((f) => (hp0[f.uid] = f.hp));
    E.useAbility(B, rap, rap.card.ability, [], 0);
    ok(
      back.every((f) => f.hp < hp0[f.uid]),
      'every back-row enemy is still hit when a back row exists'
    );
  }

  /* an empty back row must not be a castable energy trap */
  {
    const B = mk(3);
    const rap = B.units.find((u) => u.side === 'player');
    ok(
      !E.usableNow(B, rap, rap.card.ability),
      'with no back row to reach, the cast is not offered at all'
    );
  }

  /* the front-row rule is NOT changed by this */
  {
    const B = E.createBattle(
      [ent('grimmwood-big-bad-wolf')],
      ['grimmwood-cinderella', 'grimmwood-hansel-gretel'].map(ent),
      { seed: 3 }
    );
    B.noOpeningLimit = true;
    B.round = 3;
    B.energy = { player: 100, enemy: 100 };
    const wolf = B.units.find((u) => u.side === 'player');
    const foes = B.units.filter((u) => u.side === 'enemy');
    foes.forEach((f) => (f.slot = f.slot + 3)); /* force everyone to the back */
    const pool = E.legalTargets(B, wolf, wolf.card.ability);
    ok(
      pool.length > 0,
      'a front-row melee ability still steps up when the front row is empty'
    );
  }
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
