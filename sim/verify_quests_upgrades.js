/* =============================================================
   Quests + card upgrades / Echo Shards - behaviour audit
   node sim/verify_quests_upgrades.js
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

/* ---- a localStorage good enough for the modules under test ---- */
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
global.window = { EOL: {}, dispatchEvent: () => {}, addEventListener: () => {} };
global.performance = { now: () => Date.now() };
global.CustomEvent = function (n, o) {
  this.type = n;
  this.detail = o && o.detail;
};

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
  'data/battlefields.js',
  'js/engine.js',
  'js/economy.js',
  'js/upgrades.js',
  'js/quests.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const EOL = window.EOL;
const E = EOL.engine;
const U = EOL.upgrades;
const Q = EOL.quests;

const CARD = {};
EOL.factions.forEach((f) => f.cards.forEach((c) => (CARD[c.id] = { card: c, faction: f })));
const ent = (id) => CARD[id];

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.log('  \x1b[31mFAIL\x1b[0m  ' + m);
  }
};
const sec = (t) => console.log('\n\x1b[1m' + t + '\x1b[0m');
const near = (a, b, eps) => Math.abs(a - b) <= (eps == null ? 0.5 : eps);

const SIX = [
  'duat-anubis',
  'camelot-lancelot',
  'olympus-zeus',
  'roma-brutus',
  'sherwood-robin-hood',
  'yamato-momotaro',
];
const FOES = [
  'grimmwood-red-riding-hood',
  'grimmwood-big-bad-wolf',
  'grimmwood-rumpelstiltskin',
  'grimmwood-cinderella',
  'grimmwood-goldilocks',
  'grimmwood-puss-in-boots',
];
const mine = () => SIX.map(ent);
const foes = () => FOES.map(ent);
const unitOf = (B, id) => B.units.find((u) => u.card.id === id && u.side === 'player');

/* =============================================================
   A. UPGRADE MATH
   ============================================================= */
sec('A. Upgrade multipliers');
U._reset();

ok(U.MAX_LEVEL === 3, 'max level is 3');
ok(
  JSON.stringify(U.LEVEL_COST) === JSON.stringify([1, 3, 5]),
  'level costs are 1 / 3 / 5 duplicates'
);
ok(U.powerMult(0) === 1, 'level 0 is no power change');
ok(near(U.powerMult(1), 1.015, 1e-9), 'level 1 power is +1.5%');
ok(near(U.powerMult(3), Math.pow(1.015, 3), 1e-9), 'power compounds');
ok(near(U.powerMult(3), 1.045678, 1e-5), 'max power is +4.57%');

/* The ceiling exists because the roster's tightest INTENTIONAL gap
   between comparable cards is 3.45% (Tomoe 145%@45 -> Puss in Boots
   150%@40). One level must never cross it. */
ok(U.powerMult(1) - 1 < 0.0345, 'one level stays inside the tightest designed gap (3.45%)');

sec('B. Anubis worked example (the number the owner asked for)');
ok(Math.round(130 * U.powerMult(1)) === 132, '130% -> 132% at level 1');
ok(Math.round(260 * U.powerMult(1)) === 264, '260% -> 264% at level 1');
ok(Math.round(130 * U.powerMult(3)) === 136, '130% -> 136% at level 3');
ok(Math.round(260 * U.powerMult(3)) === 272, '260% -> 272% at level 3');

/* =============================================================
   C. THRESHOLDS AND COSTS NEVER MOVE
   ============================================================= */
sec('C. Upgrades never touch thresholds or Energy costs');
{
  const anubis = CARD['duat-anubis'].card;
  const before = JSON.stringify(anubis.ability.spec);
  const cost = anubis.ability.cost;
  U._reset();
  U.addDuplicate('duat-anubis', 9);
  U.levelUp('duat-anubis', 'atk');
  U.levelUp('duat-anubis', 'atk');
  U.levelUp('duat-anubis', 'atk');
  ok(U.levelOf('duat-anubis') === 3, 'nine duplicates buy all three levels');
  ok(JSON.stringify(anubis.ability.spec) === before, 'card spec is not mutated by upgrading');
  ok(anubis.ability.cost === cost, 'Energy cost is untouched');

  const B = E.createBattle(mine(), foes(), {
    upgrades: U.payloadFor(SIX),
  });
  const u = unitOf(B, 'duat-anubis');
  ok(u.upLevel === 3, 'engine sees level 3');
  /* the execute gate lives in the spec, which we just proved is
     unmodified - assert the branch condition explicitly too */
  const branch = anubis.ability.spec.effects[0];
  ok(branch.cond.targetHpBelow === 0.25, 'execute threshold still 25%');
  ok(
    branch.other[0].cond.targetHpBelow === 0.35 && branch.other[0].cond.debuffCountAtLeast === 2,
    'extended threshold still 35% at 2+ debuffs'
  );
}

/* =============================================================
   D. STAT APPLICATION
   ============================================================= */
sec('D. Chosen stat, and only the chosen stat');
{
  const base = E.createBattle(mine(), foes(), {});
  const b = unitOf(base, 'duat-anubis');
  const baseAtk = b.baseAtk,
    baseHp = b.maxHp,
    baseDef = b.baseDef;

  const atkB = E.createBattle(mine(), foes(), {
    upgrades: { 'duat-anubis': { lv: 3, stat: 'atk' } },
  });
  const ua = unitOf(atkB, 'duat-anubis');
  ok(ua.baseAtk === Math.round(baseAtk * 1.06), 'ATK choice is +2%/level');
  ok(ua.maxHp === baseHp && ua.baseDef === baseDef, 'ATK choice leaves HP and DEF alone');

  const hpB = E.createBattle(mine(), foes(), {
    upgrades: { 'duat-anubis': { lv: 3, stat: 'hp' } },
  });
  const uh = unitOf(hpB, 'duat-anubis');
  ok(uh.maxHp === Math.round(baseHp * 1.06), 'HP choice is +2%/level');
  ok(uh.hp === uh.maxHp, 'HP choice starts the fight full');
  ok(uh.baseAtk === baseAtk, 'HP choice leaves ATK alone');

  /* DEF is a percentage-POINT reducer clamped 0..75 across a 10..30
     roster, so a multiplicative bonus would round back to nothing.
     It gets flat points instead. */
  const defB = E.createBattle(mine(), foes(), {
    upgrades: { 'duat-anubis': { lv: 3, stat: 'def' } },
  });
  const ud = unitOf(defB, 'duat-anubis');
  ok(ud.baseDef > baseDef, 'DEF choice actually moves DEF (it is points, not a multiplier)');
  ok(ud.baseDef === baseDef + 4.5, 'DEF choice is +1.5 points per level');
  ok(ud.baseAtk === baseAtk && ud.maxHp === baseHp, 'DEF choice leaves ATK and HP alone');
}

/* =============================================================
   E. THE DEFAULT IS STOCK
   ============================================================= */
sec('E. Stock by default (drafts and the puzzle depend on this)');
{
  const B = E.createBattle(mine(), foes(), {});
  ok(
    B.units.every((u) => u.upLevel === 0 && u.upPower === 1),
    'no opts.upgrades means every unit is stock'
  );
  const B2 = E.createBattle(mine(), foes(), {
    upgrades: { 'duat-anubis': { lv: 3, stat: 'atk' } },
  });
  ok(
    B2.units.filter((u) => u.side === 'enemy').every((u) => u.upLevel === 0),
    'player upgrades never leak onto the enemy'
  );
  const B3 = E.createBattle(mine(), foes(), {
    enemyUpgrades: { 'grimmwood-big-bad-wolf': { lv: 2, stat: 'atk' } },
  });
  const wolf = B3.units.find((u) => u.card.id === 'grimmwood-big-bad-wolf');
  ok(wolf && wolf.upLevel === 2, 'enemyUpgrades apply to the enemy side');
  ok(
    B3.units.filter((u) => u.side === 'player').every((u) => u.upLevel === 0),
    'enemy upgrades never leak onto the player'
  );
}

/* =============================================================
   F. SKILL POWER REACHES REAL DAMAGE
   ============================================================= */
sec('F. Skill power changes the damage actually dealt');
{
  function hit(levels) {
    const B = E.createBattle(mine(), foes(), {
      upgrades: levels,
      rng: () => 0.99, // never crit
    });
    B.noOpeningLimit = true;
    B.round = 3;
    B.energy = { player: 100, enemy: 100 };
    const src = unitOf(B, 'duat-anubis');
    const tgt = B.units.find((u) => u.side === 'enemy' && u.alive);
    const before = tgt.hp;
    E.useAbility(B, src, src.card.ability, [tgt]);
    return before - tgt.hp;
  }
  const stock = hit(null);
  const lv3 = hit({ 'duat-anubis': { lv: 3, stat: 'def' } }); // def so ATK is unchanged
  ok(stock > 0 && lv3 > 0, 'both swings landed');
  ok(lv3 > stock, 'a level-3 signature hits harder than stock');
  const ratio = lv3 / stock;
  ok(ratio > 1.03 && ratio < 1.06, 'the increase is ~4.6%, not a runaway (' + ratio.toFixed(4) + ')');
}

sec('F2. The shared role basic is NOT upgraded');
{
  /* An upgrade buys the card's own signature. Basic/role attacks are
     shared machinery every legend uses, so boosting them would mean
     upgrading a card silently buffed a system rather than a legend. */
  function basicHit(up) {
    const B = E.createBattle(mine(), foes(), { upgrades: up, rng: () => 0.99 });
    B.noOpeningLimit = true;
    B.round = 3;
    B.energy = { player: 100, enemy: 100 };
    const s = unitOf(B, 'duat-anubis');
    const role = E.roleAbility ? E.roleAbility(s) : null;
    if (!role) return null;
    const t = B.units.find((u) => u.side === 'enemy' && u.alive);
    const before = t.hp;
    E.useAbility(B, s, role, [t]);
    return before - t.hp;
  }
  const up = basicHit({ 'duat-anubis': { lv: 3, stat: 'def' } });
  const stock = basicHit(null);
  if (up === null) {
    pass++; // no role ability exported in this build
  } else {
    ok(up === stock, 'a level-3 card basic-attacks for exactly the stock number');
  }
}

/* =============================================================
   G. SHARD ECONOMY
   ============================================================= */
sec('G. Echo Shards');
U._reset();
ok(U.shardYield('common') === 15, 'common duplicate pays 15');
ok(U.shardYield('rare') === 60, 'rare duplicate pays 60');
ok(U.shardYield('epic') === 200, 'epic duplicate pays 200');
ok(U.shardYield('legendary') === 400, 'legendary duplicate pays 400');
['common', 'rare', 'epic', 'legendary'].forEach((r) => {
  ok(U.craftCost(r) === U.shardYield(r) * 20, 'craft cost for ' + r + ' is 20x its yield');
});

{
  U._reset();
  const got = U.addDuplicate('duat-anubis', 1); // legendary
  ok(got.shards === 400, 'a legendary duplicate pays 400 shards');
  ok(U.dupesOf('duat-anubis') === 1, 'and banks one copy');
  ok(U.canLevel('duat-anubis'), 'one copy is enough for level 1');
  const r = U.levelUp('duat-anubis', 'hp');
  ok(r.ok && r.lv === 1, 'level 1 purchased');
  ok(U.dupesOf('duat-anubis') === 0, 'the copy was spent');
  ok(!U.canLevel('duat-anubis'), 'level 2 needs three more');
}

sec('H. Crafting buys copies of OWNED cards only, any rarity');
{
  U._reset();
  EOL.econ._reset();
  U.addShards(100000);
  const legendary = 'duat-anubis';
  ok(!EOL.econ.owns(legendary), 'Anubis is not owned at the start');
  let r = U.craft(legendary);
  ok(!r.ok && r.reason === 'unowned', 'cannot craft a copy of a card you do not own');
  EOL.econ.grant([legendary]);
  r = U.craft(legendary);
  ok(r.ok, 'once owned, a legendary copy can be crafted');
  ok(r.cost === 8000, 'legendary craft costs 8000 shards');
  ok(U.dupesOf(legendary) === 1, 'the crafted copy banks');

  /* the Crown Law: crafting deepens a legend you own, it never
     widens the collection */
  const before = EOL.econ.ownedCount();
  U.craft(legendary);
  ok(EOL.econ.ownedCount() === before, 'crafting never grants a new card');
}

sec('I. Duplicates cap at what the remaining levels can consume');
{
  U._reset();
  EOL.econ._reset();
  EOL.econ.grant(['duat-anubis']);
  U.addDuplicate('duat-anubis', 50);
  ok(U.dupesOf('duat-anubis') === 9, 'banked copies cap at the 9 a full upgrade needs');
  U.levelUp('duat-anubis', 'atk');
  U.levelUp('duat-anubis', 'atk');
  U.levelUp('duat-anubis', 'atk');
  ok(U.levelOf('duat-anubis') === 3, 'maxed');
  const s0 = U.shards();
  const got = U.addDuplicate('duat-anubis', 1);
  ok(U.shards() === s0 + 400, 'a duplicate of a maxed card still pays shards');
  ok(got.maxed === true, 'and reports the card as maxed');
  ok(!U.canLevel('duat-anubis'), 'a maxed card cannot level again');
}

sec('J. Respec is free outside battle and locked inside');
{
  U._reset();
  U.addDuplicate('duat-anubis', 1);
  U.levelUp('duat-anubis', 'atk');
  ok(U.statOf('duat-anubis') === 'atk', 'stat starts as chosen');
  ok(U.setStat('duat-anubis', 'hp').ok, 'stat can be re-assigned');
  ok(U.statOf('duat-anubis') === 'hp', 're-assignment took');
  U.setBattleLock(true);
  const r = U.setStat('duat-anubis', 'def');
  ok(!r.ok && r.reason === 'inBattle', 'respec is refused during a battle');
  ok(U.statOf('duat-anubis') === 'hp', 'and the stat did not change');
  U.setBattleLock(false);
  ok(U.setStat('duat-anubis', 'def').ok, 'respec works again after the battle');
}

sec('K. Wire payload is sanitized');
{
  const dirty = {
    'duat-anubis': { lv: 99, stat: 'atk' },
    'camelot-lancelot': { lv: -4, stat: 'hp' },
    'olympus-zeus': { lv: 2, stat: 'nonsense' },
    junk: null,
  };
  const clean = U.sanitize(dirty);
  ok(clean['duat-anubis'].lv === 3, 'an over-max level is clamped to 3');
  ok(!clean['camelot-lancelot'], 'a zero/negative level is dropped');
  ok(clean['olympus-zeus'].stat === 'atk', 'an unknown stat falls back to atk');
  ok(!clean.junk, 'junk entries are dropped');
  ok(Object.keys(U.sanitize(null)).length === 0, 'null payload is an empty object');

  /* and the engine must respect the clamp even if handed raw junk */
  const B = E.createBattle(mine(), foes(), {
    upgrades: { 'duat-anubis': { lv: 900, stat: 'atk' } },
  });
  ok(unitOf(B, 'duat-anubis').upLevel === 3, 'engine clamps a hostile level to 3');
}

/* =============================================================
   K2. MULTIPLAYER DESYNC - the reason levels ride the wire
   -------------------------------------------------------------
   Both clients build units from their own copy of data/*.js and
   every action carries an FNV-1a checksum of rounded HP and shield.
   An upgrade held by only one client MUST diverge - that is the bug
   this feature had to solve, so it is asserted rather than assumed.
   ============================================================= */
sec('K2. Upgrades must travel, or the boards desync');
{
  const NP = (function () {
    const src = fs.readFileSync(path.join(ROOT, 'js/netplay.js'), 'utf8');
    eval(src);
    return window.EOL.netplay;
  })();

  const mk = (up) => {
    const B = E.createBattle(mine(), foes(), { upgrades: up, rng: () => 0.99 });
    B.noOpeningLimit = true;
    B.round = 3;
    B.energy = { player: 100, enemy: 100 };
    return B;
  };
  const swing = (B) => {
    const s = unitOf(B, 'duat-anubis');
    const t = B.units.find((u) => u.side === 'enemy' && u.alive);
    E.useAbility(B, s, s.card.ability, [t]);
  };
  const ATK = { 'duat-anubis': { lv: 3, stat: 'atk' } };
  const HP = { 'duat-anubis': { lv: 3, stat: 'hp' } };

  ok(
    NP.checksum(mk(HP)) !== NP.checksum(mk(null)),
    'an HP upgrade on one side alone diverges at battle start'
  );

  const a = mk(ATK),
    b = mk(null);
  ok(NP.checksum(a) === NP.checksum(b), 'an ATK upgrade is invisible before anyone swings');
  swing(a);
  swing(b);
  ok(
    NP.checksum(a) !== NP.checksum(b),
    'an ATK upgrade on one side alone diverges as soon as a blow lands'
  );

  const c1 = mk(ATK),
    c2 = mk(ATK);
  for (let i = 0; i < 3; i++) {
    swing(c1);
    swing(c2);
  }
  ok(
    NP.checksum(c1) === NP.checksum(c2),
    'two clients carrying the SAME payload stay in lockstep'
  );
}

/* =============================================================
   L. QUESTS
   ============================================================= */
sec('L. Quest board shape');
Q._reset();
{
  const b = Q.board();
  ok(b.daily.length === 3, 'three daily quests');
  ok(b.weekly.length === 3, 'three weekly quests');
  ok(
    b.daily.every((q) => q.progress === 0 && !q.done && !q.claimed),
    'a fresh board starts empty'
  );
  const metrics = b.daily.map((q) => q.metric);
  ok(new Set(metrics).size === metrics.length, 'no two dailies share a metric');
  const wm = b.weekly.map((q) => q.metric);
  ok(new Set(wm).size === wm.length, 'no two weeklies share a metric');
}

sec('M. Selection is deterministic per period');
{
  const a = Q.board();
  Q._reset();
  const b = Q.board();
  ok(
    JSON.stringify(a.daily.map((q) => q.id)) === JSON.stringify(b.daily.map((q) => q.id)),
    'the same day always selects the same three dailies'
  );
  ok(
    JSON.stringify(a.weekly.map((q) => q.id)) === JSON.stringify(b.weekly.map((q) => q.id)),
    'the same week always selects the same three weeklies'
  );
}

sec('N. No quest counts matches, wins or losses (the anti-farm law)');
{
  const all = Q.catalogue.daily.concat(Q.catalogue.weekly);
  const banned = ['matches', 'wins', 'losses', 'games', 'battles'];
  ok(
    all.every((q) => banned.indexOf(q.metric) < 0),
    'no objective uses a match/win/loss metric'
  );
  ok(
    all.every((q) => !/\b(win|lose|lost|match|forfeit)\b/i.test(q.text)),
    'no objective text asks the player to win or play N matches'
  );
}

sec('O. Recording and claiming');
{
  Q._reset();
  EOL.econ._reset();
  const b = Q.board();
  const dmg = b.daily.concat(b.weekly).find((q) => q.metric === 'damage');
  if (dmg) {
    Q.record('damage', Math.floor(dmg.target / 2));
    let e = Q.board().daily.concat(Q.board().weekly).find((q) => q.id === dmg.id);
    ok(e.progress === Math.floor(dmg.target / 2), 'progress accumulates');
    ok(!e.done, 'half way is not done');
    let r = Q.claim(dmg.id);
    ok(!r.ok && r.reason === 'incomplete', 'an unfinished quest cannot be claimed');
    Q.record('damage', dmg.target);
    e = Q.board().daily.concat(Q.board().weekly).find((q) => q.id === dmg.id);
    ok(e.progress === dmg.target, 'progress clamps at the target');
    ok(e.done, 'target reached');
    const coins0 = EOL.econ.coins();
    r = Q.claim(dmg.id);
    ok(r.ok, 'a finished quest claims');
    ok(EOL.econ.coins() === coins0 + r.coins, 'coins were paid');
    const again = Q.claim(dmg.id);
    ok(!again.ok && again.reason === 'claimed', 'claiming twice is refused');
    ok(EOL.econ.coins() === coins0 + r.coins, 'and pays nothing the second time');
  } else {
    ok(false, 'expected a damage quest somewhere on the board');
  }
}

sec('P. recordBatch and the factions high-water mark');
{
  Q._reset();
  const b = Q.board();
  const fq = b.daily.concat(b.weekly).find((q) => q.metric === 'factions');
  if (fq) {
    Q.recordBatch({ factions: 3 });
    Q.recordBatch({ factions: 2 });
    const e = Q.board().daily.concat(Q.board().weekly).find((q) => q.id === fq.id);
    ok(e.progress === 3, 'factions keeps the best single battle, it does not sum');
  } else {
    pass++; // no factions quest on this board; nothing to assert
  }
  const dq = Q.board().daily.concat(Q.board().weekly).find((q) => q.metric === 'damage');
  if (dq) {
    const before = Q.board().daily.concat(Q.board().weekly).find((q) => q.id === dq.id).progress;
    Q.recordBatch({ damage: 100 });
    Q.recordBatch({ damage: 100 });
    const after = Q.board().daily.concat(Q.board().weekly).find((q) => q.id === dq.id).progress;
    ok(after === Math.min(dq.target, before + 200), 'damage accumulates across battles');
  } else {
    pass++;
  }
}

sec('Q. Completion bonus');
{
  Q._reset();
  EOL.econ._reset();
  let b = Q.board();
  ok(!b.dailyBonus.ready, 'bonus is not ready on a fresh board');
  ok(Q.claimBonus('daily').ok === false, 'bonus cannot be claimed early');
  b.daily.forEach((q) => {
    Q.record(q.metric, q.target);
  });
  b = Q.board();
  ok(!b.dailyBonus.ready, 'bonus still waits until each quest is individually CLAIMED');
  b.daily.forEach((q) => Q.claim(q.id));
  b = Q.board();
  ok(b.dailyBonus.ready, 'bonus unlocks once all three are claimed');
  const c0 = EOL.econ.coins();
  const r = Q.claimBonus('daily');
  ok(r.ok && EOL.econ.coins() === c0 + Q.DAILY_BONUS, 'bonus pays ' + Q.DAILY_BONUS);
  ok(!Q.claimBonus('daily').ok, 'bonus cannot be claimed twice');
}

sec('R. Reset boundary is 7am Eastern, weekly anchors to Monday');
{
  /* 2026-08-16 is a Sunday. 11:00 UTC = 07:00 EDT. */
  const beforeReset = new Date(Date.UTC(2026, 7, 16, 10, 59));
  const afterReset = new Date(Date.UTC(2026, 7, 16, 11, 1));
  ok(Q.dayKey(beforeReset) === '2026-08-15', 'before 7am Eastern still belongs to the previous day');
  ok(Q.dayKey(afterReset) === '2026-08-16', 'after 7am Eastern is the new day');
  ok(Q.dayKey(beforeReset) !== Q.dayKey(afterReset), 'the boundary is a real rollover');

  /* Monday 2026-08-17 07:00 EDT = 11:00 UTC */
  const sunLate = new Date(Date.UTC(2026, 7, 17, 10, 59)); // still Sunday's quest-day
  const monEarly = new Date(Date.UTC(2026, 7, 17, 11, 1)); // Monday's quest-day
  ok(Q.weekKey(sunLate) !== Q.weekKey(monEarly), 'the week rolls over at Monday 7am Eastern');
  const monLater = new Date(Date.UTC(2026, 7, 18, 15, 0));
  ok(Q.weekKey(monEarly) === Q.weekKey(monLater), 'Tuesday shares Monday\u2019s week key');
}

sec('S. A daily rollover clears dailies but not weeklies');
{
  Q._reset();
  const st = Q._state();
  Q.board();
  const b0 = Q.board();
  b0.weekly.forEach((q) => Q.record(q.metric, q.target));
  const weeklyDone = Q.board().weekly.filter((q) => q.done).length;
  ok(weeklyDone > 0, 'weekly progress recorded');
  /* force a stale day, keep the week */
  Q._state().day = '1999-01-01';
  Q.refresh();
  const b1 = Q.board();
  ok(
    b1.weekly.filter((q) => q.done).length === weeklyDone,
    'a daily rollover leaves weekly progress intact'
  );
  ok(
    b1.daily.every((q) => q.progress === 0),
    'and the dailies are cleared'
  );
}

console.log(
  '\n' + (fail ? '\x1b[31m' : '\x1b[32m') + 'pass ' + pass + '  fail ' + fail + '\x1b[0m'
);
process.exit(fail ? 1 : 0);
