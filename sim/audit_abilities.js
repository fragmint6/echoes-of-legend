/* =============================================================
   Echoes of Legend - Ability Correctness Audit ("do exactly what
   the card says, and NOTHING else")
   -------------------------------------------------------------
   node sim/audit_abilities.js

   Born 2026-08-04 from three live bugs found in one Bo3 set:
     1. Lu Bu's selfKilled effects (gainEnergy, mark) also fired in
        the battle-start `static` setup pass - his team opened every
        game at +15 Energy with a random enemy pre-Marked.
     2. selfKilled fired for ANY teammate's kill, not the killer's.
     3. (design law, verified working) every damaging Skill consumes
        a Mark even with nothing to gain from it; Basics never do.

   Layers:
     A. ROUTING LINT - shared effects arrays can't smuggle trigger
        effects into the wrong trigger again (the Lu Bu class).
     B. REGRESSION - behavioural proofs for bugs 1-3 + the mark law.
     C. NOTHING-ELSE SWEEP - every Active signature in the roster is
        cast on a controlled board; every state channel is diffed and
        must fall inside the channel set the SPEC declares.
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
  'data/roma.js', 'data/kami.js', 'data/duat.js',
  /* Hercules moved Olympus -> Hemithea on 2026-08-18 and this file uses
     him in CLEAN_FOES, so the faction has to be loaded or CARD[] has a
     hole and every board built from it throws on `.faction`. */
  'data/hemithea.js',
  'js/engine.js', 'js/ai.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL, E = EOL.engine;

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push(c)));
const CARD = {};
ALL.forEach((c) => (CARD[c.id] = c));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; fails.push(msg); console.log('  \x1b[31mFAIL\x1b[0m  ' + msg); }
}
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

const CLEAN_FOES = ['hemithea-hercules', 'camelot-mordred', 'huaxia-mulan',
  'olympus-medusa', 'grimmwood-pied-piper', 'sherwood-will-scarlet'];
const FILL = ['camelot-guinevere', 'sherwood-little-john', 'grimmwood-snow-white',
  'olympus-apollo', 'yamato-momotaro'];
const ent = (id) => ({ card: CARD[id], faction: CARD[id].faction });
const U = (B, id) => B.units.find((u) => u.card.id === id);

function board(myIds, foeIds, opts) {
  let n = 7;
  const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const B = E.createBattle(myIds.map(ent), (foeIds || CLEAN_FOES).map(ent),
    Object.assign({ rng, roleAware: true, simulation: true }, opts || {}));
  B.noOpeningLimit = true;
  B.energy.player = 100; B.energy.enemy = 100;
  return B;
}

/* =============================================================
   A. ROUTING LINT
   ============================================================= */
section('A. TRIGGER-ROUTING LINT (whole roster)');

const SETUP_KINDS = ['stat', 'shield', 'taunt', 'counterStrike', 'untargetable'];
const DECLARATIVE = ['outgoingMult', 'damageMult', 'damageResist'];
function trigList(p) { return p.triggers ? p.triggers.slice() : p.trigger ? [p.trigger] : []; }

ALL.forEach((c) => {
  const p = c.ability && c.ability.passive;
  if (!p) return;
  const trigs = trigList(p);
  (p.effects || []).forEach((e, i) => {
    (e.on ? [].concat(e.on) : []).forEach((name) => {
      ok(trigs.indexOf(name) >= 0,
        c.id + ': effect #' + i + ' (' + e.k + ') routed on:"' + name +
        '" but passive triggers are [' + trigs.join(',') + ']');
    });
    /* THE LU BU RULE: an unrouted effect on a static-trigger passive
       fires at battle start - so unrouted effects must be either the
       declarative mults the damage pipeline reads, or true standing
       setups. Anything else leaks into battle creation. */
    if (trigs.indexOf('static') >= 0 && !e.on) {
      ok(
        DECLARATIVE.indexOf(e.k) >= 0 || SETUP_KINDS.indexOf(e.k) >= 0,
        c.id + ': unrouted "' + e.k + '" on a static passive fires at battle ' +
        'start (route it with on:[...] - Lu Bu bug, 2026-08)'
      );
    }
  });
});

/* =============================================================
   B. REGRESSION PROOFS
   ============================================================= */
section('B. REGRESSION - energy start, Lu Bu kill law, mark law, Athena');

/* B1: Lu Bu on the board must NOT change the opening state. */
{
  const B = board(['huaxia-lu-bu'].concat(FILL));
  ok(B.energy.player === B.energy.enemy,
    'battle start with Lu Bu: energies equal (' + B.energy.player + ' vs ' + B.energy.enemy + ')');
  ok(!B.units.some((u) => u.flags.marked > 0),
    'battle start with Lu Bu: nobody is pre-marked');
}

/* B2: Lu Bu's OWN kill procs; a TEAMMATE's kill does not. */
{
  const B = board(['huaxia-lu-bu'].concat(FILL));
  const lb = U(B, 'huaxia-lu-bu');
  const basicCost = E.roleAbility(lb).cost || 0;
  const v = B.units.find((u) => u.side === 'enemy' && u.alive);
  const v2 = B.units.filter((u) => u.side === 'enemy' && u.alive)[1];
  B.energy.player = 50;
  v.hp = 1;
  E.useAbility(B, lb, E.roleAbility(lb), [v]);
  const eAfterOwn = B.energy.player;
  const markedAfterOwn = B.units.filter((u) => u.side === 'enemy' && u.flags.marked > 0).length;
  ok(!v.alive, 'Lu Bu basic killed the 1hp victim (test premise)');
  ok(eAfterOwn === 50 - basicCost + 15,
    'Lu Bu OWN kill refunds +15 (50 -basic=' + basicCost + ' +15 -> ' + eAfterOwn + ')');
  ok(markedAfterOwn === 1, 'Lu Bu OWN kill marks exactly one survivor (' + markedAfterOwn + ')');
  // teammate kill: no proc
  B.energy.player = 50;
  const marksBefore = B.units.filter((u) => u.side === 'enemy' && u.flags.marked > 0).length;
  v2.hp = 1;
  const mate = U(B, 'yamato-momotaro');
  E.useAbility(B, mate, E.roleAbility(mate), [v2]);
  const marksAfter = B.units.filter((u) => u.side === 'enemy' && u.flags.marked > 0).length;
  ok(B.energy.player === 50 - basicCost,
    'TEAMMATE kill: no Lu Bu refund (energy ' + B.energy.player + ', want ' + (50 - basicCost) + ')');
  ok(marksAfter === marksBefore,
    'TEAMMATE kill: no Lu Bu mark (' + marksBefore + ' -> ' + marksAfter + ')');
}

/* B3: mark law - Skills consume, Basics do not, even with nothing to gain.
   Precision Volley auto-aims the LOWEST-HP enemy (by design), so the mark
   lands on whichever unit the auto-rule resolves - assert against that one. */
{
  const B = board(['huaxia-huang-zhong', 'yamato-momotaro'].concat(FILL.slice(0, 4)));
  const hz = U(B, 'huaxia-huang-zhong');
  const resolved = E.resolveTargets(B, hz, hz.card.ability, []);
  const victim = resolved[0];
  victim.flags.marked = 1;
  const momo = U(B, 'yamato-momotaro');
  E.useAbility(B, momo, E.roleAbility(momo), [victim]); // a BASIC on the marked victim
  ok((victim.flags.marked | 0) === 1, 'BASIC does not consume a Mark');
  B.energy.player = 100;
  E.useAbility(B, hz, hz.card.ability, []);
  ok((victim.flags.marked | 0) === 0,
    'damaging Skill consumed the Mark even with nothing to gain');
}

/* B4: Athena marks Skill casters only, never Basic attackers. */
{
  const B = board(['olympus-athena'].concat(FILL));
  const foe = B.units.find((u) => u.side === 'enemy');
  E.useAbility(B, foe, E.roleAbility(foe), [U(B, 'olympus-athena')]);
  ok((foe.flags.marked | 0) === 0, 'Athena: a BASIC does not draw her Mark');
  E.nextRound(B); // acting flag clears; same unit may now cast
  const r = E.useAbility(B, foe, foe.card.ability, []);
  ok(r.ok && (foe.flags.marked | 0) > 0,
    'Athena: casting a Skill drew her Mark (' + (r.reason || 'ok') + ')');
}

/* =============================================================
   C. NOTHING-ELSE SWEEP - every Active signature, channel diff
   ============================================================= */
section('C. NOTHING-ELSE SWEEP (' + ALL.filter((c) => c.ability.type === 'Active').length + ' Active signatures)');

/* effect kind -> state channels it is allowed to touch */
const CH = {
  /* a damaging effect also spends Marks on the targets it hits, so
     'flags' is a legitimate touch for every dmg line */
  dmg: ['hp', 'shield', 'flags'],
  heal: ['hp', 'shield'], // overflow:'shield' converts overheal
  shield: ['shield'],
  revive: ['hp', 'alive', 'shield', 'flags', 'buffs'],
  stat: ['buffs'],
  mark: ['flags'],
  burn: ['flags'],
  exposed: ['flags'],
  silence: ['flags'],
  taunt: ['flags'],
  untargetable: ['flags'],
  cleanse: ['flags', 'buffs'],
  delayed: ['pending'],
  branch: null, // expands
  randomOf: null,
  choose: null,
  auto: null,
  lifesteal: ['hp'],
  counterStrike: ['buffs'],
  consumeMark: ['flags'],
  consumeBuffs: ['buffs', 'shield'],
  swapTargets: [],
  costMod: ['costMods'],
  gainEnergy: ['energySelf'],
  stealEnergy: ['energySelf', 'energyFoe'],
  drainEnergy: ['energyFoe'],
  single: [],
  two: [],
  all: [],
  healMod: ['buffs'],
  outgoingMult: ['buffs'],
  damageMult: ['buffs'],
  damageResist: ['buffs'],
};

function armsOf(spec) {
  const arms = [];
  (spec.effects || []).forEach((e) => arms.push(e));
  (spec.choose || []).forEach((arm) => (arm.effects || []).forEach((e) => arms.push(e)));
  /* nested effect arms, expanded one pass deep */
  for (let i = arms.length - 1; i >= 0; i--) {
    const e = arms[i];
    if (e.k === 'branch') { arms.splice(i, 1); (e.then || []).forEach((x) => arms.push(x)); (e.other || []).forEach((x) => arms.push(x)); }
    else if (e.k === 'randomOf') { arms.splice(i, 1); (e.arms || e.options || []).forEach((x) => arms.push(x)); }
    else if (e.k === 'coinFlip') {
      arms.splice(i, 1);
      ((e.heads && e.heads.effects) || []).forEach((x) => arms.push(x));
      ((e.tails && e.tails.effects) || []).forEach((x) => arms.push(x));
    }
    else if (e.k === 'auto') { arms.splice(i, 1); (e.effects || e.then || []).forEach((x) => arms.push(x)); }
    else if (e.k === 'choose') { arms.splice(i, 1); (e.choose || []).forEach((x) => arms.push(x)); }
  }
  return arms;
}

function expectedChannels(spec) {
  const set = new Set();
  armsOf(spec).forEach((e) => {
    const m = CH[e.k];
    if (m == null) return;
    m.forEach((c) => set.add(c));
    /* riders that convert: a dmg rider also soaks shields; a delayed
       payload expands at resolution, not at cast */
    (e.effects || []).forEach((x) => (CH[x.k] || []).forEach((c) => set.add(c)));
  });
  return set;
}

function snap(B) {
  const s = { energy: { player: B.energy.player, enemy: B.energy.enemy }, units: {} };
  B.units.forEach((u) => {
    s.units[u.uid] = {
      alive: u.alive, hp: u.hp, shield: u.shield,
      buffs: u.buffs.length, pending: u.pending.length,
      flags: (u.flags.marked > 0 ? 1 : 0) + (u.flags.burn > 0 ? 2 : 0) +
        (u.flags.exposed > 0 ? 4 : 0) + (u.flags.silence > 0 ? 8 : 0) +
        (u.flags.taunt > 0 ? 16 : 0) + (u.flags.untargetable > 0 ? 32 : 0),
    };
  });
  return s;
}
function diffChannels(a, b) {
  const out = new Set();
  for (const uid in a.units) {
    const x = a.units[uid], y = b.units[uid];
    if (x.alive !== y.alive) out.add('alive');
    if (x.hp !== y.hp) out.add('hp');
    if (x.shield !== y.shield) out.add('shield');
    if (x.buffs !== y.buffs) out.add('buffs');
    if (x.pending !== y.pending) out.add('pending');
    if (x.flags !== y.flags) out.add('flags');
  }
  if (a.energy.player !== b.energy.player) out.add('energySelf');
  if (a.energy.enemy !== b.energy.enemy) out.add('energyFoe');
  return out;
}

/* the sweep tests each SIGNATURE, no-one's passives: every unit on the
   board is an inert clone (passive stripped). Without this, defender
   reactions (Mulan's Warrior's Resolve arming when struck) and allied
   cast triggers read as the sig doing more than it says - they are the
   reactor's text, not the caster's. */
function inertCard(c) {
  const clone = JSON.parse(JSON.stringify(c));
  if (clone.ability) delete clone.ability.passive;
  return clone;
}
function inertBoard(casterId) {
  let n = 19;
  const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const mateIds = FILL.filter((f) => f !== casterId).slice(0, 5);
  const mk = (id) => ({ card: inertCard(CARD[id]), faction: CARD[id].faction });
  const caster = { card: CARD[casterId], faction: CARD[casterId].faction }; // caster keeps their passive
  const B = E.createBattle([caster].concat(mateIds.map(mk)), CLEAN_FOES.map(mk),
    { rng, roleAware: true, simulation: true });
  B.noOpeningLimit = true;
  B.energy.player = 100; B.energy.enemy = 100;
  return B;
}

let swept = 0, skipped = 0;
ALL.forEach((c) => {
  if (c.ability.type !== 'Active') return;
  const B = inertBoard(c.id);
  const u = U(B, c.id);
  if (!u) { skipped++; return; }
  B.energy.player = 999;
  let tgt = E.autoPick(B, u, c.ability.spec) || [];
  const need = E.pickCount(c.ability) || 0;
  if (need && tgt.length < need) {
    tgt = (E.legalTargets(B, u, c.ability) || [])
      .slice(0, need)
      .map((x) => B.units.find((w) => w.uid === (x && x.uid ? x.uid : x)) || x);
  }
  const before = snap(B);
  const cost = E.costOf(B, u, c.ability);
  let r;
  try { r = E.useAbility(B, u, c.ability, tgt); }
  catch (err) { ok(false, c.id + ': cast threw: ' + err.message); return; }
  const after = snap(B);
  if (!r || !r.ok) {
    ok(false, c.id + ' (' + c.ability.name + '): cast rejected -> ' + (r && r.reason));
    return;
  }
  /* copyAllyActive (kaguya): the copied spec is whichever ally's Active the
     rng lands on, so both the touched channels and any energy movement are
     runtime-decided and unanalysable here -- assert cast-ok/no-throw only. */
  const copiesAlly = armsOf(c.ability.spec || {}).some((e) => e.k === 'copyAllyActive');
  const touched = diffChannels(before, after);
  const expected = expectedChannels(c.ability.spec || {});
  /* casting always deducts energy from the caster's pool */
  expected.add('energySelf');
  const illegal = [...touched].filter((ch) => !expected.has(ch));
  ok(copiesAlly || illegal.length === 0,
    c.id + ' (' + c.ability.name + '): touched channels outside its spec -> ' +
    illegal.join(', ') + ' (declared: ' + [...expected].join(', ') + ')');
  /* the spent energy is exactly the printed cost, unless the ability
     itself moves energy around (riders make nets unanalysable) */
  const moves = copiesAlly || armsOf(c.ability.spec || {}).some((e) =>
    ['gainEnergy', 'stealEnergy', 'drainEnergy', 'costMod'].includes(e.k));
  if (!moves) {
    const spent = before.energy[u.side] - after.energy[u.side];
    ok(spent === cost,
      c.id + ' (' + c.ability.name + '): spent ' + spent + ' energy, card says ' + cost);
  }
  swept++;
});
console.log('    swept ' + swept + ' actives, skipped ' + skipped);

/* ============================================================= */
console.log('\n================================================================');
if (fail) {
  console.log('\x1b[31m' + fail + ' FAILURES\x1b[0m (' + pass + ' passed)');
  process.exit(1);
}
console.log('\x1b[32mALL ' + pass + ' AUDIT ASSERTIONS PASSED\x1b[0m');
