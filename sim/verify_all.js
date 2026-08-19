/* =============================================================
   Echoes of Legend - Full-Roster Behaviour Audit
   -------------------------------------------------------------
   node sim/verify_all.js

   Three layers:
     A. STATIC   - schema, stat bands, icons, uniqueness, keyword
                   legality, condition/effect/trigger validity. Runs
                   over every card in the roster automatically.
     B. DYNAMIC  - per-card behavioural assertions: cast the ability
                   in a controlled board state and check the actual
                   engine outcome against the card's printed text.
     C. SOAK     - AI-vs-AI games with an event tap, asserting global
                   invariants (no negative HP, no double actions, no
                   effects from dead units, durations respected).
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
global.performance = { now: () => Date.now() };
const FILES = [
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
  /* CHAPTER II FACTIONS (2026-08-17). Added here as well as to
     index.html - this list is what the whole suite audits, so a new
     faction file that is not in it passes every check VACUOUSLY. The
     49 new legends were briefly invisible to the lore coverage
     assertion for exactly that reason. */
  'data/asgard.js',
  'data/hemithea.js',
  'data/pandemonium.js',
  'data/devas.js',
  'data/genesis.js',
  'data/transylvania.js',
  'data/tortuga.js',
  'data/lore.js',
  'js/engine.js',
  'js/ai.js',
  'js/text.js',
];
FILES.forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL,
  E = EOL.engine,
  AI = EOL.ai;

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push(c)));
const CARD = {};
ALL.forEach((c) => (CARD[c.id] = c));

let pass = 0,
  fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push(msg);
    console.log('  \x1b[31mFAIL\x1b[0m  ' + msg);
  }
}
function section(t) {
  console.log('\n\x1b[1m' + t + '\x1b[0m');
}

/* ---------------- board helpers ---------------- */
const FILL = [
  'camelot-guinevere',
  'sherwood-little-john',
  'grimmwood-snow-white',
  'olympus-apollo',
  'yamato-momotaro',
];
/* opponents with NO incoming-damage modifiers and NO reaction damage, so
   damage models are exact. (Athena has damageMult 0.85, Benkei
   damageResist - they'd skew every number.)

   Medusa was here until 2026-08-16, when her gaze gained a 25% ATK
   retaliation: she was the only legend with no scalable magnitude at
   all, so an upgrade bought her nothing. That rider means she now
   deals damage when struck, which silently perturbed every model that
   attacked into this row. Lancelot replaces her - his passive fires
   only on ALLY events, so it can never touch a foe-side number. */
const CLEAN_FOES = [
  'hemithea-hercules',
  'camelot-mordred',
  'huaxia-mulan',
  'camelot-lancelot',
  'grimmwood-pied-piper',
  'sherwood-will-scarlet',
];
const ent = (id) => ({ card: CARD[id], faction: CARD[id].faction });

function board(myIds, foeIds) {
  let n = 1;
  const rng = () => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648;
  const B = E.createBattle(myIds.map(ent), (foeIds || CLEAN_FOES).map(ent), {
    rng,
    roleAware: true,
    simulation: true,
  });
  B.noOpeningLimit = true; // engine's own test hatch: allow round-1 signatures
  B.energy.player = 100;
  B.energy.enemy = 100;
  return B;
}
const U = (B, id) => B.units.find((u) => u.card.id === id);
const foesOf = (B) => B.units.filter((u) => u.side === 'enemy' && u.alive);
const alliesOf = (B) => B.units.filter((u) => u.side === 'player' && u.alive);
/* expected post-mitigation damage for `power` × ATK against t */
const model = (src, t, power) => E.atkOf(src) * power * (1 - E.defOf(t) / 100);
const near = (a, b, tol) =>
  b === 0 ? Math.abs(a) < 1 : Math.abs(a - b) / Math.abs(b) <= (tol || 0.06);

/* solo-cast a legend's signature and return per-unit HP deltas */
function cast(B, id, targets) {
  const u = U(B, id);
  const before = new Map(B.units.map((x) => [x.uid, x.hp]));
  const r = E.useAbility(B, u, u.card.ability, targets);
  const delta = {};
  B.units.forEach((x) => (delta[x.uid] = before.get(x.uid) - x.hp));
  return { r, u, delta };
}

/* =============================================================
   A. STATIC AUDIT - every card, automatically
   ============================================================= */
section('A. STATIC AUDIT (whole roster)');

const BANDS = {
  Tank: [
    [6800, 7600],
    [950, 1100],
    [28, 32],
  ],
  Bruiser: [
    [5500, 6500],
    [1450, 1750],
    [20, 25],
  ],
  Caster: [
    [4700, 5000],
    [1850, 2050],
    [14, 18],
  ],
  Controller: [
    [4800, 5800],
    [1150, 1400],
    [16, 20],
  ],
  Medic: [
    [4600, 5000],
    [950, 1100],
    [18, 22],
  ],
  Sniper: [
    [4300, 4600],
    [1700, 2000],
    [10, 15],
  ],
};
const ROLES = Object.keys(BANDS);
const RARITIES = ['legendary', 'epic', 'rare', 'common'];
const ELEMENTS = ['Physical', 'Magic', 'Shadow', 'Light', 'Lightning', 'Fire', 'Nature'];

/* every effect kind / condition / trigger the engine actually implements */
const ENG = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
const KINDS = new Set(
  (ENG.match(/^      case '(\w+)':/gm) || []).map((m) => m.match(/'(\w+)'/)[1])
);
/* Declarative damage modifiers never pass through applyEffect's switch -
   outgoingMult/incomingMult read them straight off the passive. They are
   implemented, just not as dispatched effect kinds. */
['outgoingMult', 'damageMult', 'damageResist'].forEach((k) => KINDS.add(k));
const CONDS = new Set((ENG.match(/cond\.(\w+)/g) || []).map((m) => m.slice(5)));
const TRIGS = new Set(
  (ENG.match(/hasTrig\([a-z]+, '(\w+)'\)/g) || [])
    .map((m) => m.match(/'(\w+)'/)[1])
    .concat(['static'])
);

/* The RPG Awesome class list is vendored so icon validation always runs.
   (It previously read /tmp, which meant the 59 icon-existence assertions
   silently skipped whenever /tmp was cleared - a quiet loss of coverage.) */
var ICON_FILE = path.join(__dirname, 'fixtures', 'rpg-awesome-icons.txt');
if (!fs.existsSync(ICON_FILE) && fs.existsSync('/tmp/icons.txt')) ICON_FILE = '/tmp/icons.txt';
const ICONS = fs.existsSync(ICON_FILE)
  ? new Set(fs.readFileSync(ICON_FILE, 'utf8').trim().split('\n'))
  : null;
if (!ICONS) console.log('  WARNING: icon list missing - icon assertions skipped');

/* walk every effect in a card, including nested arms */
function walkEffects(card, cb) {
  const a = card.ability;
  const seen = [];
  (function w(list, where) {
    (list || []).forEach((e) => {
      if (!e || !e.k) return;
      seen.push(e);
      cb(e, where);
      if (e.k === 'branch') {
        w(e.then, where + '.then');
        w(e.other, where + '.other');
      }
      if (e.k === 'coinFlip') {
        w(e.heads && e.heads.effects, where + '.heads');
        w(e.tails && e.tails.effects, where + '.tails');
      }
      if (e.k === 'randomOf') w(e.options, where + '.randomOf');
      if (e.k === 'delayed') w(e.effects, where + '.delayed');
    });
  })(
    a.spec
      ? a.spec.effects || (a.spec.choose && a.spec.choose[0].effects)
      : a.passive && a.passive.effects,
    'root'
  );
  if (a.passive && a.passive.onHit)
    (a.passive.onHit || []).forEach((e) => {
      seen.push(e);
      cb(e, 'onHit');
    });
  return seen;
}

const ids = new Set(),
  names = new Set(),
  iconUse = {};
ALL.forEach((c) => {
  const L = `${c.name} (${c.faction})`;
  ok(!ids.has(c.id), `${L}: id unique`);
  ids.add(c.id);
  ok(!names.has(c.name), `${L}: name unique`);
  names.add(c.name);
  ok(ROLES.indexOf(c.role) >= 0, `${L}: valid role`);
  ok(RARITIES.indexOf(c.rarity) >= 0, `${L}: valid rarity`);
  ok(ELEMENTS.indexOf(c.element) >= 0, `${L}: valid element "${c.element}"`);

  const b = BANDS[c.role],
    s = c.stats;
  ok(s.hp >= b[0][0] && s.hp <= b[0][1], `${L}: HP ${s.hp} in ${c.role} band ${b[0].join('-')}`);
  ok(s.atk >= b[1][0] && s.atk <= b[1][1], `${L}: ATK ${s.atk} in band ${b[1].join('-')}`);
  ok(s.def >= b[2][0] && s.def <= b[2][1], `${L}: DEF ${s.def} in band ${b[2].join('-')}`);

  (iconUse[c.icon] = iconUse[c.icon] || []).push(L);
  if (ICONS) ok(ICONS.has(c.icon), `${L}: icon ${c.icon} exists in RPG Awesome`);

  const a = c.ability;
  ok(a.type === 'Active' || a.type === 'Passive', `${L}: ability type valid`);
  if (a.type === 'Active') {
    ok(typeof a.cost === 'number' && a.cost >= 0, `${L}: active has numeric cost`);
    ok(!!a.spec && !!a.spec.target, `${L}: active has spec.target`);
  } else {
    ok(a.cost === null, `${L}: passive cost is null`);
    ok(!!a.passive, `${L}: passive has passive block`);
    const trigs = a.passive.triggers || [a.passive.trigger];
    trigs.forEach((t) => ok(TRIGS.has(t), `${L}: trigger "${t}" implemented in engine`));
  }
  /* no undefined status keywords in the prose */
  const bare = (a.text || '').replace(/<[^>]+>/g, '');
  const badWords = bare.match(/\b(Stun|Freeze|Poison|Bleed|Slow|Root|Blind|Confuse|Charm)\b/g);
  ok(
    !badWords,
    `${L}: no undefined status keywords${badWords ? ' (' + badWords.join(',') + ')' : ''}`
  );

  /* every effect kind + condition must exist in the engine */
  walkEffects(c, (e, where) => {
    ok(KINDS.has(e.k), `${L}: effect kind "${e.k}" implemented (${where})`);
    const conds = [].concat(
      e.if ? Object.keys(e.if) : [],
      (e.ifMult || []).flatMap((m) => Object.keys(m.when || {})),
      e.when && typeof e.when === 'object' ? Object.keys(e.when) : []
    );
    conds.forEach((k) => ok(CONDS.has(k), `${L}: condition "${k}" implemented (${where})`));
    if (e.take)
      ok(
        typeof e.take.n === 'number' &&
          ['highestAtk', 'lowestHp', 'highestHp'].indexOf(e.take.by) >= 0,
        `${L}: take {n,by} valid (${where})`
      );
    if (e.stackTag)
      ok(typeof e.maxStacks === 'number', `${L}: stackTag "${e.stackTag}" has maxStacks`);
  });
});
EOL.factions.forEach((f) => {
  (iconUse[f.icon] = iconUse[f.icon] || []).push(`faction:${f.name}`);
  if (ICONS) ok(ICONS.has(f.icon), `faction ${f.name}: icon ${f.icon} exists`);
});
Object.keys(iconUse).forEach((i) =>
  ok(iconUse[i].length === 1, `icon ${i} used once (${iconUse[i].join(' | ')})`)
);

/* ---- ROLE INTEGRITY (docs/CharacterGuidelines.md) ----
   The stat band is only half the definition; these check the JOB. */
{
  const dmgOf = (c) => {
    let total = 0,
      aoe = false;
    const walk = (l) =>
      (l || []).forEach((e) => {
        if (!e || !e.k) return;
        if (e.k === 'dmg') total += e.power || 0;
        walk(e.then);
        walk(e.other);
        walk(e.effects);
        walk(e.options);
        if (e.heads) walk(e.heads.effects);
        if (e.tails) walk(e.tails.effects);
      });
    if (c.ability.spec) {
      walk(c.ability.spec.effects);
      const t = c.ability.spec.target || {};
      aoe = t.pick === 'all' || t.pick === 'two';
    }
    return { total, aoe };
  };
  ALL.forEach((c) => {
    const L = `${c.name} (${c.role})`;
    const d = dmgOf(c);
    /* Rule 1: Controllers and Medics are never damage dealers. Their signature
       multiplier must stay below the Sniper floor (1.45x). */
    if (c.role === 'Medic') {
      ok(d.total === 0, `${L}: Medic deals no direct signature damage (${d.total})`);
    }
    if (c.role === 'Controller') {
      ok(d.total <= 1.2, `${L}: Controller signature power stays support-tier (${d.total} <= 1.2)`);
    }
    /* Rule: a Controller may scale off debuffs, but the scaling must be capped */
    const scal = [];
    (function w(l) {
      (l || []).forEach((e) => {
        if (!e || !e.k) return;
        if (e.perDebuff || e.perBuff) scal.push(e);
        w(e.then);
        w(e.other);
        w(e.effects);
      });
    })(c.ability.spec && c.ability.spec.effects);
    scal.forEach((e) => {
      if (e.perDebuff) ok(e.perDebuffMax != null, `${L}: perDebuff scaling is capped`);
      if (e.perBuff) ok(e.perBuffMax != null, `${L}: perBuff scaling is capped`);
    });
    /* Rule 4: Tanks trade damage for presence */
    if (c.role === 'Tank') {
      ok(d.total <= 0.9, `${L}: Tank signature is not a damage spell (${d.total})`);
    }
  });
}

/* ability-spec uniqueness across the roster */
const sigOf = (c) =>
  JSON.stringify([
    c.ability.name,
    c.ability.cost,
    (c.ability.spec || {}).target,
    (c.ability.spec || {}).effects || (c.ability.passive || {}).effects,
  ]);
const sigs = ALL.map(sigOf);
ok(new Set(sigs).size === sigs.length, 'no two cards share an ability specification');

/* role depth */
const byRole = {};
ALL.forEach((c) => (byRole[c.role] = (byRole[c.role] || 0) + 1));
ROLES.forEach((r) => ok(byRole[r] >= 3, `role ${r} has >=3 legends (${byRole[r]})`));
console.log('  roster: ' + ALL.length + ' legends | ' + JSON.stringify(byRole));

/* =============================================================
   B. DYNAMIC - Kami, card by card
   ============================================================= */
section('B1. Amaterasu - Heaven-Shining Radiance');
{
  const B = board(['kami-amaterasu', ...FILL]);
  const ama = U(B, 'kami-amaterasu');
  const foes = foesOf(B);
  const exp = model(ama, foes[0], 0.5);
  const { delta } = cast(B, 'kami-amaterasu', []);
  ok(
    foes.every((f) => delta[f.uid] > 0),
    'hits ALL enemies (AoE)'
  );
  ok(
    near(delta[foes[0].uid], exp),
    `base damage is 50% ATK (${Math.round(delta[foes[0].uid])} vs ${Math.round(exp)})`
  );
  ok(
    foes.filter((f) => f.flags.burn > 0).length === 3,
    `Burn now hits only the 3 lowest-HP enemies (${foes.filter((f) => f.flags.burn > 0).length})`
  );
  ok(
    foes.filter((f) => f.flags.burn > 0).every((f) => f.flags.burn === 1),
    'Burn duration cut to 1 round'
  );
  ok(!(ama.flags.untargetable > 0), 'grants NO self-Untargetable (exploit removed)');
  ok(!(ama.flags.silence > 0), 'grants NO self-Silence (non-drawback removed)');
}
{
  /* the 105% mode requires a PARTNER's Burn */
  const B = board(['kami-amaterasu', ...FILL]);
  const ama = U(B, 'kami-amaterasu');
  const foes = foesOf(B);
  foes.forEach((f) => (f.flags.burn = 2));
  const exp = model(ama, foes[0], 0.5 * 1.5);
  const { delta } = cast(B, 'kami-amaterasu', []);
  ok(
    near(delta[foes[0].uid], exp),
    `75% ATK into a Burning target (${Math.round(delta[foes[0].uid])} vs ${Math.round(exp)})`
  );
}
{
  /* kill rider */
  const B = board(['kami-amaterasu', ...FILL]);
  const allies = alliesOf(B);
  allies.forEach((a) => (a.hp = Math.round(a.maxHp * 0.5)));
  allies[1].buffs.push({ stat: 'atk', amt: -30, turns: 2, tag: null });
  foesOf(B).forEach((f) => (f.hp = 1));
  const hp0 = allies.map((a) => a.hp);
  cast(B, 'kami-amaterasu', []);
  ok(
    allies.some((a, i) => a.hp > hp0[i]),
    'kill: allies healed'
  );
  ok(!allies[1].buffs.some((b) => b.amt < 0), 'kill: allies cleansed');
}
{
  const B = board(['kami-amaterasu', ...FILL]);
  const allies = alliesOf(B);
  allies.forEach((a) => (a.hp = Math.round(a.maxHp * 0.5)));
  const hp0 = allies.map((a) => a.hp);
  cast(B, 'kami-amaterasu', []);
  ok(
    allies.every((a, i) => a.hp === hp0[i]),
    'no kill: NO heal (rider genuinely conditional)'
  );
}
{
  /* the lone-survivor lock must be gone */
  const B = board(['kami-amaterasu', ...FILL]);
  const ama = U(B, 'kami-amaterasu');
  B.units
    .filter((u) => u.side === 'player' && u !== ama)
    .forEach((u) => {
      u.alive = false;
      u.hp = 0;
    });
  cast(B, 'kami-amaterasu', []);
  const foe = foesOf(B)[0];
  ok(
    E.legalTargets(B, foe, E.roleAbility(foe)).length > 0,
    'as LAST SURVIVOR she is still targetable (no untargetable lock)'
  );
}

section('B2. Tsukuyomi - Moonlit Reproach');
{
  const B = board(['kami-tsukuyomi', ...FILL]);
  const tsu = U(B, 'kami-tsukuyomi');
  const foes = foesOf(B);
  const clean = foes[0],
    dirty = foes[1];
  dirty.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null }); // pre-debuffed
  /* NERFED 2026-08-02: 90/60 -> 80/40, cost tax 2 rounds -> 1. */
  const expClean = model(tsu, clean, 0.8);
  const expDirty = model(tsu, dirty, 1.2);
  const { delta } = cast(B, 'kami-tsukuyomi', [clean, dirty]);
  ok(
    near(delta[clean.uid], expClean),
    `clean target takes 80% (${Math.round(delta[clean.uid])} vs ${Math.round(expClean)})`
  );
  ok(
    near(delta[dirty.uid], expDirty),
    `debuffed target takes 120% (${Math.round(delta[dirty.uid])} vs ${Math.round(expDirty)})`
  );
  ok(clean.flags.silence > 0 && dirty.flags.silence > 0, 'Silences both targets');
  const cm = (dirty.costMods || []).reduce((s, m) => s + (m.flat || 0), 0);
  ok(cm === 10, `debuffed target gets +10 EN cost (got ${cm})`);
  const cmTurns = (dirty.costMods || []).map((m) => m.turns);
  ok(
    cmTurns.every((t) => t === 1),
    `cost tax lasts 1 round (got ${cmTurns.join(',')})`
  );
  ok(
    (clean.costMods || []).reduce((s, m) => s + (m.flat || 0), 0) === 0,
    'clean target gets NO cost tax (his own Silence must not satisfy the condition)'
  );
}

section('B3. Izanami - A Thousand a Day');
{
  const B = board(['kami-izanami', ...FILL]);
  const iza = U(B, 'kami-izanami');
  const victim = alliesOf(B).find((u) => u.card.id !== 'kami-izanami');
  const foes = foesOf(B);
  const hiAtk = foes.slice().sort((a, b) => E.atkOf(b) - E.atkOf(a))[0];
  victim.hp = 1;
  const killer = foesOf(B)[0];
  B.energy.enemy = 100;
  E.useAbility(B, killer, E.roleAbility(killer), [victim]);
  ok(!victim.alive, 'ally died (trigger fired)');
  ok(
    foes.every((f) => f.buffs.some((b) => b.stat === 'def' && b.amt === -10)),
    'all enemies get -10% DEF'
  );
  ok(hiAtk.flags.burn > 0, 'highest-ATK enemy is Burned');
  ok(
    foes.filter((f) => f.flags.burn > 0).length === 1,
    'ONLY one enemy burned (take n:1 works on burn)'
  );
  ok(iza.buffs.filter((b) => b.tag === 'thousand-a-day').length === 1, 'Izanami gains 1 ATK stack');
}
{
  /* stack cap */
  const B = board(['kami-izanami', ...FILL]);
  const iza = U(B, 'kami-izanami');
  for (let i = 0; i < 6; i++) {
    const v = alliesOf(B).find((u) => u.card.id !== 'kami-izanami');
    if (!v) break;
    v.hp = 1;
    const k = foesOf(B)[0];
    B.energy.enemy = 100;
    B.acted.enemy = {};
    E.useAbility(B, k, E.roleAbility(k), [v]);
  }
  ok(iza.buffs.filter((b) => b.tag === 'thousand-a-day').length <= 4, 'ATK stacks capped at 4');
}

section("B4. Inari - Kitsune's Bounty");
{
  const B = board(['kami-inari', ...FILL]);
  const ina = U(B, 'kami-inari');
  const foe = foesOf(B)[0];
  const exp = model(ina, foe, 0.75);
  B.energy.player = 50;
  const before = B.energy.player;
  const cost = E.costOf(B, ina, ina.card.ability);
  const { delta } = cast(B, 'kami-inari', [foe]);
  ok(
    near(delta[foe.uid], exp),
    `deals 75% ATK (${Math.round(delta[foe.uid])} vs ${Math.round(exp)})`
  );
  ok(foe.flags.exposed > 0, 'applies Exposed');
  ok(
    B.energy.player === before - cost + 12,
    `refunds 12 EN on a clean target (${before}->${B.energy.player}, cost ${cost})`
  );
}
{
  const B = board(['kami-inari', ...FILL]);
  const ina = U(B, 'kami-inari');
  const foe = foesOf(B)[0];
  foe.flags.exposed = 1; // partner set it up
  foe.flags.burn = 2; // 2 debuffs
  B.energy.player = 50;
  const before = B.energy.player;
  const cost = E.costOf(B, ina, ina.card.ability);
  const { delta } = cast(B, 'kami-inari', [foe]);
  const exp = model(ina, foe, 0.75 + 0.3 * 2);
  ok(
    near(delta[foe.uid], exp),
    `scales with debuffs (+30% per debuff: ${Math.round(delta[foe.uid])} vs ${Math.round(exp)})`
  );
  ok(
    B.energy.player === before - cost + 18,
    `refunds 18 EN into a pre-Exposed target (${before}->${B.energy.player})`
  );
}

section('B5. Izanagi - Misogi at the River Mouth');
{
  const B = board(['kami-izanagi', ...FILL]);
  const tgt = alliesOf(B).find((u) => u.card.id !== 'kami-izanagi');
  tgt.hp = Math.round(tgt.maxHp * 0.4);
  tgt.buffs.push({ stat: 'atk', amt: -30, turns: 3, tag: null });
  tgt.buffs.push({ stat: 'def', amt: -20, turns: 3, tag: null });
  tgt.flags.burn = 2;
  tgt.flags.exposed = 2;
  tgt.flags.silence = 1;
  const others = alliesOf(B).filter((u) => u !== tgt);
  others.forEach((o) => {
    o.hp = Math.round(o.maxHp * 0.5);
    o.buffs.push({ stat: 'atk', amt: -10, turns: 2, tag: null });
  });
  const hp0 = tgt.hp,
    oHp0 = others.map((o) => o.hp);
  cast(B, 'kami-izanagi', [tgt]);
  ok(!E.hasDebuff(tgt), 'primary target FULLY cleansed (all debuffs, incl. burn/exposed/silence)');
  ok(tgt.hp > hp0, 'primary target healed');
  ok(tgt.shield > 0, 'was debuffed -> gains Shield');
  ok(
    tgt.buffs.some((b) => b.stat === 'atk' && b.amt === 20),
    'was debuffed -> gains +20% ATK'
  );
  ok(
    others.every((o, i) => o.hp > oHp0[i]),
    'other allies healed 8%'
  );
  ok(
    others.every((o) => !o.buffs.some((b) => b.amt < 0)),
    'other allies cleansed 1 debuff'
  );
}
{
  /* clean target: no rider */
  const B = board(['kami-izanagi', ...FILL]);
  const tgt = alliesOf(B).find((u) => u.card.id !== 'kami-izanagi');
  tgt.hp = Math.round(tgt.maxHp * 0.5);
  cast(B, 'kami-izanagi', [tgt]);
  ok(tgt.shield === 0, 'clean target: NO Shield rider');
  ok(!tgt.buffs.some((b) => b.stat === 'atk' && b.amt === 20), 'clean target: NO ATK rider');
}

section('B6. Susanoo - Slayer of Yamata no Orochi (per-trigger routing)');
{
  /* standing counter is armed at battle start, and fires on the FIRST hit */
  const B = board(['kami-susanoo', ...FILL]);
  const sus = U(B, 'kami-susanoo');
  ok(sus.flags.counterPow === 0.45, 'static: counter armed at battle start (45%)');
  ok(
    sus.shield === Math.round(sus.maxHp * 0.1),
    `static: opening Shield is 10% Max HP (${sus.shield})`
  );
  const foe = foesOf(B)[0];
  const foeHp0 = foe.hp;
  const shield0 = sus.shield;
  B.energy.enemy = 100;
  E.useAbility(B, foe, E.roleAbility(foe), [sus]);
  const back = foeHp0 - foe.hp;
  const exp = E.atkOf(sus) * 0.45 * (1 - E.defOf(foe) / 100);
  ok(back > 0, 'counter fires on the FIRST attack (no off-by-one)');
  ok(
    near(back, exp, 0.2),
    `counter deals ~45% ATK (${Math.round(back)} vs ${Math.round(exp)} pre-crit)`
  );
  ok(!(sus.flags.taunt > 0), 'being attacked does NOT taunt (on: routing works)');
  ok(sus.shield <= shield0, 'being attacked grants NO new shield (on: routing works)');
}
{
  /* allyBelowHp -> taunt+shield, no counter set */
  const B = board(['kami-susanoo', ...FILL]);
  const sus = U(B, 'kami-susanoo');
  const ally =
    alliesOf(B).find((u) => u !== sus && u.slot >= 3) || alliesOf(B).find((u) => u !== sus);
  ally.hp = ally.maxHp;
  const foe = foesOf(B)[0];
  B.energy.enemy = 100;
  ally.hp = Math.round(ally.maxHp * 0.25); // below the 30% threshold
  // trigger via a real damage event
  E.useAbility(B, foe, E.roleAbility(foe), [ally.flags.taunt ? ally : ally]);
  ok(sus.flags.taunt > 0 || sus.shield > 0, 'allyBelowHp: taunts and/or shields');
  ok(sus.shield > 0, 'allyBelowHp: gains a Shield');
}

/* =============================================================
   B7. REGRESSION - a behavioural probe for every OTHER active
   ============================================================= */
section('B7. Regression probes - existing roster actives');
const PROBES = {
  'camelot-merlin': (B, u) => {
    const mate = alliesOf(B)[1];
    const mateBasic = E.roleAbility(mate);
    const before = E.costOf(B, mate, mate.card.ability);
    const beforeBasic = E.costOf(B, mate, mateBasic);
    cast(B, u.card.id, []);
    const after = E.costOf(B, mate, mate.card.ability);
    ok(after <= before, 'Merlin: allied skill costs reduced');
    /* BOTH halves of Prophecy are Signature-only (2026-08-05). Allied
       role Basics keep their printed price - without this the discount
       silently subsidised the cheap fallback every legend casts. */
    ok(E.costOf(B, mate, mateBasic) === beforeBasic, 'Merlin: allied Basics are NOT discounted');
    ok(
      alliesOf(B).every((a) => a.shield > 0),
      'Merlin: all allies shielded'
    );
    /* 55 EN / signature-only tax retune (2026-08-05) */
    ok(u.card.ability.cost === 55, 'Merlin: Prophecy costs 55');
    ok(
      alliesOf(B).every((a) => a.shield === Math.round(a.maxHp * 0.08)),
      'Merlin: the Shield is exactly 8% Max HP'
    );
    /* the enemy tax reaches Signatures ONLY - Basics stay priced */
    const foe =
      foesOf(B).find((f) => f.card.ability.type === 'Active' && f.card.ability.cost > 0) ||
      foesOf(B)[0];
    const basic = E.roleAbility(foe);
    ok(E.costOf(B, foe, basic) === (basic.cost || 0), 'Merlin: enemy Basics are NOT taxed');
    if (foe.card.ability.type === 'Active' && foe.card.ability.cost > 0) {
      ok(
        E.costOf(B, foe, foe.card.ability) === foe.card.ability.cost + 15,
        'Merlin: enemy Signatures are taxed +15'
      );
    }
  },
  'camelot-guinevere': (B, u) => {
    const t = alliesOf(B).find((x) => x !== u);
    t.hp = Math.round(t.maxHp * 0.5);
    const hp0 = t.hp;
    cast(B, u.card.id, [t]);
    ok(t.hp > hp0, 'Guinevere: heals');
    ok(t.shield > 0, 'Guinevere: shields');
  },
  'camelot-mordred': (B, u) => {
    const { delta } = cast(B, u.card.id, []);
    ok(
      Object.values(delta).some((d) => d > 0),
      'Mordred: deals damage to the lowest-HP enemy'
    );
    /* row law (2026-08-05): Exposed spreads along the TARGET's row -
       no adjacency, no other row */
    const lo = foesOf(B)
      .slice()
      .sort((a, b) => a.hp - b.hp)[0];
    const sameRow = foesOf(B).filter((f) => E.isFront(f) === E.isFront(lo));
    const otherRow = foesOf(B).filter((f) => E.isFront(f) !== E.isFront(lo));
    ok(
      sameRow.length >= 2 && sameRow.every((f) => f.flags.exposed > 0),
      `Mordred: Exposed lands on the target's whole row (${sameRow.length})`
    );
    ok(
      otherRow.every((f) => !(f.flags.exposed > 0)),
      'Mordred: the other row stays clean'
    );
  },
  'camelot-morgan-le-fay': (B, u) => {
    const f = foesOf(B).slice(0, 2);
    const slots = f.map((x) => x.slot);
    cast(B, u.card.id, f);
    ok(
      f.every((x) => x.flags.exposed > 0),
      'Morgan: applies Exposed to both'
    );
    ok(
      f.every((x) => x.buffs.some((b) => b.stat === 'atk' && b.amt === -30)),
      'Morgan: -30% ATK on both'
    );
    /* the swap is gone (2026-08-05): too broken in player hands. The
       debuffs stay, the BOARD positions never move. */
    ok(
      f.every((x, i) => x.slot === slots[i]),
      'Morgan: nobody swaps places anymore'
    );
  },
  'grimmwood-rapunzel': (B, u) => {
    /* back-row law (2026-08-05): the hair reaches the BACK row only,
       not the whole enemy side */
    const fronts = foesOf(B).filter((f) => E.isFront(f));
    const backs = foesOf(B).filter((f) => !E.isFront(f));
    const fHp = fronts.map((f) => f.hp);
    const bHp = backs.map((b) => b.hp);
    cast(B, u.card.id, []);
    ok(
      backs.every((b, i) => b.hp < bHp[i] || b.flags.exposed > 0 || b.buffs.length > 0),
      'Rapunzel: every back-row enemy is hit'
    );
    ok(
      fronts.every((f, i) => f.hp === fHp[i] && !(f.flags.exposed > 0) && !f.buffs.length),
      'Rapunzel: the front row is untouched'
    );
  },
  'olympus-zeus': (B, u) => {
    const foes = foesOf(B);
    cast(B, u.card.id, []);
    ok(
      foes.every((f) => f.flags.marked > 0),
      'Zeus: no marks present -> Marks all enemies'
    );
    // second cast should now consume
    B.acted.player = {};
    B.energy.player = 100;
    const hp0 = foes.map((f) => f.hp);
    cast(B, u.card.id, []);
    ok(
      foes.some((f, i) => f.hp < hp0[i]),
      'Zeus: marks present -> consumes for damage'
    );
  },
  'hemithea-hercules': (B, u) => {
    cast(B, u.card.id, []);
    ok(u.flags.taunt > 0, 'Hercules: taunts');
    ok(
      u.buffs.some((b) => b.stat === 'def' && b.amt === 25),
      'Hercules: +25% DEF'
    );
    ok(
      u.buffs.some((b) => b.stat === 'atk' && b.amt === 20),
      'Hercules: +20% ATK'
    );
  },
  'olympus-apollo': (B, u) => {
    const t = alliesOf(B).find((x) => x !== u);
    t.hp = Math.round(t.maxHp * 0.5);
    const hp0 = t.hp;
    cast(B, u.card.id, [t]);
    ok(t.hp > hp0, 'Apollo: heals');
    ok(
      t.buffs.some((b) => b.stat === 'crit'),
      'Apollo: grants crit'
    );
    ok(foesOf(B).filter((f) => f.flags.marked > 0).length === 1, 'Apollo: marks exactly 1 enemy');
  },
  'sherwood-guy-of-gisborne': (B, u) => {
    const f = foesOf(B).filter((x) => E.isFront(x))[0] || foesOf(B)[0];
    const exp = model(u, f, 1.8);
    const { delta } = cast(B, u.card.id, [f]);
    ok(
      near(delta[f.uid], exp),
      `Guy: 180% ATK on a healthy target (${Math.round(delta[f.uid])} vs ${Math.round(exp)})`
    );
  },
  'sherwood-little-john': (B, u) => {
    const t = alliesOf(B).find((x) => x !== u);
    cast(B, u.card.id, [t]);
    ok(u.shield > 0 && t.shield > 0, 'Little John: shields self and ally');
    ok(
      u.buffs.some((b) => b.stat === 'def'),
      'Little John: +DEF self'
    );
  },
  'sherwood-friar-tuck': (B, u) => {
    const f = foesOf(B)[0];
    cast(B, u.card.id, [f]);
    ok(
      f.buffs.some((b) => b.stat === 'atk' && b.amt === -25),
      'Friar Tuck: -25% ATK'
    );
    ok(!(f.flags.exposed > 0), 'Friar Tuck: no Exposed on a previously-clean target');
  },
  'grimmwood-snow-white': (B, u) => {
    const allies = alliesOf(B);
    allies.forEach((a) => {
      a.hp = Math.round(a.maxHp * 0.5);
      a.buffs.push({ stat: 'atk', amt: -10, turns: 2, tag: null });
    });
    const hp0 = allies.map((a) => a.hp);
    cast(B, u.card.id, []);
    ok(
      allies.every((a, i) => a.hp > hp0[i]),
      'Snow White: heals all allies'
    );
    ok(
      allies.every((a) => !a.buffs.some((b) => b.amt < 0)),
      'Snow White: cleanses 1 debuff each'
    );
  },
  'grimmwood-big-bad-wolf': (B, u) => {
    const f = foesOf(B).filter((x) => E.isFront(x))[0] || foesOf(B)[0];
    u.hp = Math.round(u.maxHp * 0.5);
    const hp0 = u.hp;
    cast(B, u.card.id, [f]);
    ok(u.hp > hp0, 'Big Bad Wolf: lifesteals');
  },
  'grimmwood-hansel-gretel': (B, u) => {
    cast(B, u.card.id, []);
    ok(u.shield > 0, 'Hansel & Gretel: self shield');
    ok(u.flags.taunt > 0, 'Hansel & Gretel: taunts');
  },
  'grimmwood-pied-piper': (B, u) => {
    const f = foesOf(B).slice(0, 2);
    cast(B, u.card.id, f);
    ok(
      f.every((x) => x.buffs.some((b) => b.stat === 'atk' && b.amt === -20)),
      'Pied Piper: -20% ATK on both'
    );
  },
  'yamato-minamoto-no-yoshitsune': (B, u) => {
    const f = foesOf(B)[0];
    const { delta } = cast(B, u.card.id, [f]);
    ok(delta[f.uid] > 0, 'Yoshitsune: deals damage');
  },
  'yamato-momotaro': (B, u) => {
    B.energy.player = 100;
    cast(B, u.card.id, []);
    ok(
      alliesOf(B).every((a) => a.buffs.some((b) => b.stat === 'def' && b.amt === 12)),
      'Momotaro: high energy -> +12% DEF'
    );
    ok(
      alliesOf(B)
        .filter(E.isFront)
        .some((a) => a.shield > 0),
      'Momotaro: high energy -> front shield'
    );
  },
  'yamato-abe-no-seimei': (B, u) => {
    const f = foesOf(B)[0];
    B.energy.player = 100;
    const { delta } = cast(B, u.card.id, [f]);
    ok(delta[f.uid] > 0, 'Abe: immediate hit lands');
    ok(f.pending.length === 1, 'Abe: shikigami sealed (delayed effect queued)');
    ok(f.flags.silence > 0, 'Abe: 50+ EN -> Silence');
    ok(
      f.buffs.some((b) => b.stat === 'atk' && b.amt === -25),
      'Abe: 50+ EN -> -25% ATK'
    );
    const hp1 = f.hp;
    E.nextRound(B);
    ok(f.hp < hp1, 'Abe: prophecy strikes at end of round');
    ok(f.flags.exposed > 0, 'Abe: prophecy applies Exposed');
  },
  'kami-kaguya': (B, u) => {
    const before = JSON.stringify(B.units.map((x) => x.hp + '|' + x.shield + '|' + x.buffs.length));
    cast(B, u.card.id, []);
    const after = JSON.stringify(B.units.map((x) => x.hp + '|' + x.shield + '|' + x.buffs.length));
    ok(before !== after, 'Kaguya: copying an ally skill changes board state');
  },
  'huaxia-qin-shi-huang': (B, u) => {
    const foes = foesOf(B);
    cast(B, u.card.id, []);
    ok(
      foes.filter((f) => f.flags.marked > 0).length === 3,
      'Qin Shi Huang: marks exactly 3 (buffed)'
    );
    ok(
      alliesOf(B).every((a) => a.buffs.some((x) => x.stat === 'def' && x.amt === 10)),
      'Qin Shi Huang: grants all allies +10% DEF (buffed)'
    );
  },
  'huaxia-zhuge-liang': (B, u) => {
    const f = foesOf(B).slice(0, 2);
    const e0 = B.energy.enemy;
    cast(B, u.card.id, f);
    ok(
      f.every((x) => x.flags.marked > 0),
      'Zhuge Liang: marks both'
    );
    ok(B.energy.enemy < e0, 'Zhuge Liang: drains enemy energy');
  },
  'huaxia-guan-yu': (B, u) => {
    cast(B, u.card.id, []);
    ok(u.shield > 0 && u.flags.taunt > 0, 'Guan Yu: shield + taunt');
  },
  'huaxia-hua-tuo': (B, u) => {
    const t = alliesOf(B).find((x) => x !== u);
    t.hp = Math.round(t.maxHp * 0.4);
    t.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null });
    cast(B, u.card.id, [t]);
    ok(t.shield > 0, 'Hua Tuo: debuffed ally -> shield branch');
  },
  'huaxia-huang-zhong': (B, u) => {
    const { delta } = cast(B, u.card.id, []);
    ok(
      Object.values(delta).some((d) => d > 0),
      'Huang Zhong: hits the lowest-HP enemy'
    );
  },
  'huaxia-nezha': (B, u) => {
    const f = foesOf(B)[0];
    const { delta } = cast(B, u.card.id, [f]);
    ok(delta[f.uid] > 0, 'Nezha: deals damage');
  },
  'roma-julius-caesar': (B, u) => {
    const f = foesOf(B).filter(E.isFront)[0] || foesOf(B)[0];
    const exp = model(u, f, 1.5);
    const { delta } = cast(B, u.card.id, [f]);
    ok(
      near(delta[f.uid], exp),
      `Caesar: 150% ATK (${Math.round(delta[f.uid])} vs ${Math.round(exp)})`
    );
    ok(
      u.buffs.filter((b) => b.tag === 'veni-vidi-vici').length === 0,
      'Caesar: no stack without a double kill'
    );
  },
  'roma-brutus': (B, u) => {
    const hi = foesOf(B)
      .slice()
      .sort((a, b) => E.atkOf(b) - E.atkOf(a))[0];
    const exp = model(u, hi, 1.5);
    const { delta } = cast(B, u.card.id, []);
    ok(
      near(delta[hi.uid], exp),
      `Brutus: 150% into an unbuffed target (${Math.round(delta[hi.uid])} vs ${Math.round(exp)})`
    );
  },
  'roma-cicero': (B, u) => {
    const f = foesOf(B)[0];
    const exp = model(u, f, 1.1);
    const { delta } = cast(B, u.card.id, [f]);
    ok(
      near(delta[f.uid], exp),
      `Cicero: 110% ATK (${Math.round(delta[f.uid])} vs ${Math.round(exp)})`
    );
    ok(f.flags.silence > 0, 'Cicero: silences');
    ok((f.costMods || []).reduce((s, m) => s + (m.flat || 0), 0) === 12, 'Cicero: +12 EN cost');
  },
  'roma-constantine-the-great': (B, u) => {
    cast(B, u.card.id, []);
    const atk = alliesOf(B)[0]
      .buffs.filter((b) => b.stat === 'atk')
      .reduce((s, b) => s + b.amt, 0);
    ok(atk === 10, `Constantine: no kill -> +10% ATK (got ${atk})`);
    ok(
      alliesOf(B).every((a) => a.shield === 0),
      'Constantine: no kill -> no shield'
    );
  },
};
Object.keys(PROBES).forEach((id) => {
  if (!CARD[id]) {
    ok(false, `probe target ${id} missing from roster`);
    return;
  }
  try {
    const B = board([id, ...FILL.filter((f) => f !== id)].slice(0, 6));
    const u = U(B, id);
    if (!u) {
      ok(false, `${id}: not placed on board`);
      return;
    }
    PROBES[id](B, u);
  } catch (err) {
    ok(false, `${id}: probe threw - ${err.message}`);
  }
});

/* =============================================================
   B8. Regression guards for the three bugs fixed this pass
   ============================================================= */
section('B8. Bug regression guards');
{
  /* Goldilocks' threshold is evaluated once at cast start. Her preview and
     resolution must describe the same one-hit branch even when that hit
     moves the target outside the 30-70% window. */
  const B = board(['grimmwood-goldilocks', ...FILL]);
  const goldi = U(B, 'grimmwood-goldilocks');
  const foe = foesOf(B)[0];
  foe.hp = foe.maxHp * 0.5;
  B.rng = () => 0.99; // deterministic non-critical resolution
  const pv = E.previewDamage(B, goldi, goldi.card.ability, foe, 0);
  const hp0 = foe.hp;
  const events = [];
  const tap = EOL.onBattleEvent;
  EOL.onBattleEvent = (b, ev) => {
    if (b === B && ev.src === goldi.uid && ev.tgt === foe.uid && ev.t === 'dmg') events.push(ev);
  };
  cast(B, 'grimmwood-goldilocks', [foe]);
  EOL.onBattleEvent = tap;
  ok(events.length === 1, `Goldilocks: Just Right resolves exactly one damage hit (${events.length})`);
  ok(
    near(hp0 - foe.hp, pv.dmg, 0.01),
    `Goldilocks: preview matches resolved damage (${Math.round(pv.dmg)} shown, ${Math.round(hp0 - foe.hp)} dealt)`
  );
}
{
  /* Provoke recovery occurs before the incoming hit, so the recovery can
     save Gingerbread Man from damage that would otherwise be lethal. */
  const B = board(['grimmwood-gingerbread-man', ...FILL]);
  const ginger = U(B, 'grimmwood-gingerbread-man');
  const foe = foesOf(B)[0];
  cast(B, 'grimmwood-gingerbread-man', [ginger]);
  ginger.shield = 0;
  ginger.hp = 900;
  const events = [];
  const tap = EOL.onBattleEvent;
  EOL.onBattleEvent = (b, ev) => {
    if (b === B && ev.tgt === ginger.uid && (ev.t === 'heal' || ev.t === 'dmg')) events.push(ev.t);
  };
  B.rng = () => 0.99;
  B.acted.enemy = {};
  B.energy.enemy = 100;
  E.useAbility(B, foe, E.roleAbility(foe), [ginger]);
  EOL.onBattleEvent = tap;
  ok(ginger.alive && ginger.hp > 0, 'Gingerbread Man: pre-hit recovery prevents the otherwise lethal blow');
  ok(
    events.indexOf('heal') >= 0 && events.indexOf('heal') < events.indexOf('dmg'),
    'Gingerbread Man: recovery event resolves before incoming damage'
  );
}
{
  const B = board(['grimmwood-gingerbread-man', ...FILL]);
  const ginger = U(B, 'grimmwood-gingerbread-man');
  ginger.shield = ginger.maxHp * 0.95;
  cast(B, 'grimmwood-gingerbread-man', [ginger]);
  ok(ginger.shield === ginger.maxHp, 'Shield is capped at exactly 100% Max HP');
}
{
  /* dead caster must not resolve a pending (u.pending) effect */
  const B = board(['yamato-abe-no-seimei', ...FILL]);
  const abe = U(B, 'yamato-abe-no-seimei');
  const foe = foesOf(B)[0];
  cast(B, 'yamato-abe-no-seimei', [foe]);
  ok(foe.pending.length === 1, 'Abe: prophecy queued');
  const hp0 = foe.hp;
  abe.alive = false;
  abe.hp = 0;
  E.nextRound(B);
  ok(foe.hp === hp0, "BUG FIX: a dead caster's pending effect does NOT resolve");
}
{
  /* dead caster must not resolve a deferred (when:'next'/'turn') effect */
  const B = board(['kami-amaterasu', ...FILL]);
  const before = B.deferred.length;
  ok(before === 0, 'no deferred effects leak at battle start');
}
{
  /* Susanoo counters the FIRST hit, and only while shielded */
  const B = board(['kami-susanoo', ...FILL]);
  const sus = U(B, 'kami-susanoo');
  const foe = foesOf(B)[0];
  const h0 = foe.hp;
  B.energy.enemy = 100;
  E.useAbility(B, foe, E.roleAbility(foe), [sus]);
  ok(foe.hp < h0, 'BUG FIX: counter fires on the very first attack');
  /* strip the shield -> counter must switch off (hadShield gate) */
  sus.shield = 0;
  B.acted.enemy = {};
  B.energy.enemy = 100;
  const h1 = foe.hp;
  E.useAbility(B, foe, E.roleAbility(foe), [sus]);
  ok(foe.hp === h1, 'counter switches OFF once the Shield is gone (hadShield gate)');
}
{
  /* `on:` routing must not leak across triggers for ANY multi-trigger passive */
  const multi = ALL.filter(
    (c) => c.ability.passive && (c.ability.passive.triggers || []).length > 1
  );
  multi.forEach((c) => {
    const eff = c.ability.passive.effects || [];
    const tagged = eff.filter((e) => e.on).length;
    ok(
      tagged === 0 || tagged === eff.length,
      `${c.name}: \`on:\` routing is all-or-nothing (${tagged}/${eff.length} tagged)`
    );
  });
  console.log('  multi-trigger passives checked: ' + multi.map((c) => c.name).join(', '));
}
{
  /* nerf values are actually live */
  const ama = CARD['kami-amaterasu'];
  ok(ama.ability.cost === 55, `Amaterasu cost is 55 EN (${ama.ability.cost})`);
  ok(ama.ability.spec.effects[0].power === 0.5, 'Amaterasu base power is 50%');
  ok(
    ama.ability.spec.effects.some((e) => e.k === 'cleanse' && e.if && e.if.killedTarget),
    'Amaterasu kill rider KEPT (cleanse on kill)'
  );
  ok(
    ama.ability.spec.effects.some((e) => e.k === 'heal' && e.if && e.if.killedTarget),
    'Amaterasu kill rider KEPT (heal on kill)'
  );
  const sus = CARD['kami-susanoo'];
  ok(
    sus.ability.passive.threshold === 0.3,
    `Susanoo threshold is 30% (${sus.ability.passive.threshold})`
  );
  {
    const sh = sus.ability.passive.effects.filter((e) => e.k === 'shield');
    const stat = sh.find((e) => e.on === 'static');
    const reflex = sh.find((e) => e.on === 'allyBelowHp');
    ok(stat && stat.pctMaxHp === 10, 'Susanoo opening Shield is 10% Max HP');
    ok(reflex && reflex.pctMaxHp === 8, 'Susanoo reflex Shield nerfed to 8% Max HP');
    ok(sus.ability.passive.oncePerRound === true, 'Susanoo reflex is capped once per round');
    const cs = sus.ability.passive.effects.find((e) => e.k === 'counterStrike');
    ok(cs && cs.power === 0.45, `Susanoo counter nerfed to 45% (${cs && cs.power})`);
  }
  /* printed text must match the data */
  ok(
    /50% ATK Light/.test(ama.ability.text) && /75%/.test(ama.ability.text),
    'Amaterasu text matches the nerfed numbers'
  );
  ok(
    /45% ATK/.test(sus.ability.text) && /8% Max HP Shield/.test(sus.ability.text),
    'Susanoo text matches the nerfed numbers'
  );
}

/* =============================================================
   B9. PROTECTION MODEL - Taunt is counterable, Untargetable is not
   -------------------------------------------------------------
   Locks the 2026-08-01 protection pass:
     - Sniper SIGNATURES pierce the Taunt redirect, at 0.8x damage.
     - Sniper BASICS (Aim) do not pierce.
     - Multi-target abilities never collapse to the taunter.
     - Untargetable is absolute: no pierce, no AoE, nothing.
     - Every other single-target attacker is still walled.
   ============================================================= */
section('B8b. Poseidon - Lord of the Shoreline (Mark-on-Provoke)');
{
  /* Added 2026-08-18 with the card. Poseidon replaced Hercules as
     Olympus' Tank when Hercules moved to Hemithea, and he introduced a
     NEW engine rider (`markAttacker` -> flags.tauntMark) rather than
     reusing an existing one, so it gets its own behavioural section.

     Why each assertion exists, in the order the bug would appear:

       1/2  the flag must actually arm, and the shield must be exact.
            A rider that silently no-ops is the failure mode the
            branchPasses() bug already produced once this session
            (unknown keys left pass=true, so Odin and Shiva always took
            the bonus arm). A declared-but-unread key looks identical
            in the card text and is invisible in play.
       3    the mark must land on the ATTACKER, not the tank. The
            obvious implementation - a `selfAttacked` passive - fires
            on the unit being hit and would mark Poseidon himself.
       4    allies must never be marked. dealDamage also runs for
            friendly-fire paths and reflected damage, and Marks feed
            Zeus' 130% conditional, so a stray ally mark is a real
            damage bug on the PLAYER's side of the table.
       5    the rider must die with the Provoke. If tauntMark outlived
            flags.taunt, Poseidon would mark for the rest of the battle
            off one cast - which is a Controller's output on a Tank. */
  const B = board(
    ['olympus-poseidon', 'camelot-guinevere', 'olympus-apollo'],
    ['camelot-mordred', 'huaxia-mulan', 'camelot-lancelot']
  );
  const pos = U(B, 'olympus-poseidon');
  E.useAbility(B, pos, pos.card.ability, []);
  ok(pos.flags.taunt === 2 && pos.flags.tauntMark === 1, 'Poseidon arms Provoke and the Mark rider together');
  ok(near(pos.shield, pos.maxHp * 0.18, 0.02), 'Poseidon shields for 18% Max HP');

  const mord = U(B, 'camelot-mordred');
  ok(!mord.flags.marked, 'an enemy is unmarked before it attacks the shoreline');
  E.useAbility(B, mord, E.roleAbility(mord), [pos]);
  ok(!!mord.flags.marked, 'an enemy that attacks a Provoking Poseidon is Marked');
  ok(!pos.flags.marked, 'Poseidon himself is never Marked by his own rider');

  const guin = U(B, 'camelot-guinevere');
  ok(!guin.flags.marked, 'allies are never Marked by the shoreline');

  /* Run the Provoke out and confirm the rider is cleared with it. */
  pos.flags.taunt = 0;
  E.nextRound(B);
  ok(!pos.flags.tauntMark, 'the Mark rider expires with the Provoke, not after it');
}

section('B8c. Musashi and Adam (added 2026-08-18)');
{
  /* MUSASHI - the duellist branch.
     Both arms are compared against EACH OTHER on the SAME target, with
     only the target's HP changed. Asserting "the card dealt damage"
     would have passed while the card was broken: the first draft used
     `targetHpAbove: 80`, but the engine compares a RATIO (hp/maxHp), so
     the condition could never be true and the bonus arm never fired.
     A ratio test catches that; a "did something happen" test does not.

     It also shipped with `pick: 1`, which pickCount() does not know -
     it returns 0 for anything that is not 'single'/'two', so the target
     list resolved EMPTY and the whole skill was a no-op that still
     reported ok:true. Both bugs were found here, not by reading. */
  const mk = () =>
    board(
      ['yamato-miyamoto-musashi', 'camelot-guinevere', 'olympus-apollo'],
      ['camelot-mordred', 'huaxia-mulan', 'camelot-lancelot']
    );
  function hit(pct) {
    const B = mk();
    const m = U(B, 'yamato-miyamoto-musashi');
    const t = U(B, 'camelot-mordred');
    t.hp = Math.floor(t.maxHp * pct);
    const before = t.hp;
    E.useAbility(B, m, m.card.ability, [t]);
    return {
      dmg: before - t.hp,
      mult: (before - t.hp) / (E.atkOf(m) * (1 - E.defOf(t) / 100)),
      crit: m.buffs.filter((b) => b.stat === 'crit').length,
    };
  }
  const full = hit(1.0);
  const edge = hit(0.85);
  const under = hit(0.79);
  ok(full.dmg > 0, 'Musashi actually deals damage (pick must be a form pickCount knows)');
  ok(near(full.mult, 2.0, 0.02), 'Musashi hits an untouched target for 200% ATK (got ' + full.mult.toFixed(2) + ')');
  ok(near(under.mult, 1.5, 0.02), 'Musashi hits a wounded target for 150% ATK (got ' + under.mult.toFixed(2) + ')');
  ok(near(edge.mult, 2.0, 0.02), 'the threshold is 80% Max HP, so 85% still takes the bonus arm');
  ok(full.crit === 1 && under.crit === 0, 'the Crit buff rides the bonus arm only');
  ok(full.dmg > under.dmg, 'the opening cut beats the follow-up - the card is an ANTI-execute');
}
{
  /* ADAM - the bet with a clock on it. */
  const B = board(
    ['genesis-adam', 'camelot-guinevere', 'olympus-apollo'],
    ['camelot-mordred', 'huaxia-mulan', 'camelot-lancelot']
  );
  const a = U(B, 'genesis-adam');
  E.useAbility(B, a, a.card.ability, []);
  ok(a.flags.taunt === 2, 'Adam provokes for 2 rounds');
  ok(a.buffs.some((b) => b.stat === 'def' && b.amt === 20), 'Adam gains 20% DEF');
  ok(a.pending.length === 1, 'Adam schedules exactly one payout');

  /* The cost must be REAL - healMod -100 has to actually refuse a heal,
     or the card is strictly upside. */
  a.hp = Math.floor(a.maxHp * 0.5);
  const beforeHeal = a.hp;
  E.applyEffectsPublic(B, U(B, 'camelot-guinevere'), [a], [{ k: 'heal', pctMaxHp: 30, to: 'targets' }], {});
  ok(a.hp === beforeHeal, 'Adam cannot be healed while the sentence stands');

  const allies = [U(B, 'camelot-guinevere'), U(B, 'olympus-apollo')];
  allies.forEach((x) => (x.hp = Math.floor(x.maxHp * 0.4)));
  const pre = allies.map((x) => x.hp);
  E.nextRound(B);
  E.nextRound(B);
  ok(
    allies.every((x, i) => x.hp > pre[i]),
    'surviving the 2 rounds heals the whole team'
  );
  ok(a.pending.length === 0, 'the payout is consumed, not left pending');
}
{
  /* ...and the enemy's counterplay: kill him and the heal never lands.
     Without this the card is a delayed team-heal with no risk. */
  const B = board(
    ['genesis-adam', 'camelot-guinevere', 'olympus-apollo'],
    ['camelot-mordred', 'huaxia-mulan', 'camelot-lancelot']
  );
  const a = U(B, 'genesis-adam');
  E.useAbility(B, a, a.card.ability, []);
  const allies = [U(B, 'camelot-guinevere'), U(B, 'olympus-apollo')];
  allies.forEach((x) => (x.hp = Math.floor(x.maxHp * 0.4)));
  const pre = allies.map((x) => x.hp);
  a.alive = false;
  a.hp = 0;
  E.nextRound(B);
  E.nextRound(B);
  ok(
    allies.every((x, i) => x.hp === pre[i]),
    'killing Adam inside the window cancels the heal - the bet is losable'
  );
}
{
  /* KAGUYA - the 70 -> 85% buff, measured rather than read off the text.
     Kaguya + exactly ONE ally makes the random copy deterministic. */
  const B = board(
    ['kami-kaguya', 'yamato-tomoe-gozen'],
    ['camelot-mordred', 'huaxia-mulan']
  );
  const k = U(B, 'kami-kaguya');
  const foes = foesOf(B);
  const before = foes.map((f) => f.hp);
  E.useAbility(B, k, k.card.ability, []);
  const dealt = foes.reduce((sum, f, i) => sum + (before[i] - f.hp), 0);
  /* Tomoe's 145%, cast off KAGUYA's ATK, scaled by 0.85. */
  const expect = E.atkOf(k) * 1.45 * 0.85 * (1 - E.defOf(foes[0]) / 100);
  ok(near(dealt, expect, 0.03), 'Kaguya copies at 85%, not 70% (got ' + Math.round(dealt) + ' vs ' + Math.round(expect) + ')');
  ok(
    CARD['kami-kaguya'].ability.spec.effects[0].scale === 0.85,
    'the copy scale in the data is 0.85'
  );
  ok(/85% effectiveness/.test(CARD['kami-kaguya'].ability.text), 'the card text says 85%');

  /* COST, 45 -> 35 (owner ruling 2026-08-18c). Asserted because the whole
     point of the card is that the copy is CHEAPER than the original it
     copies - at 45 the discount on the effect (85%) was cancelled by the
     absence of a discount on the price, so spending the energy on the
     real skill was almost always correct.

     The second assertion is the one that would catch a bad future tune:
     Moon Reflection must stay strictly cheaper than the median Active it
     can copy, or the card has no reason to be drafted. */
  ok(CARD['kami-kaguya'].ability.cost === 35, 'Moon Reflection costs 35 Energy');
  {
    const costs = ALL.filter(
      (c) => c.ability.type === 'Active' && c.ability.spec && typeof c.ability.cost === 'number'
    )
      .map((c) => c.ability.cost)
      .sort((a, b) => a - b);
    const median = costs[Math.floor(costs.length / 2)];
    ok(
      CARD['kami-kaguya'].ability.cost < median,
      'Moon Reflection is cheaper than the median Active it copies (' +
        CARD['kami-kaguya'].ability.cost +
        ' < ' +
        median +
        ')'
    );
  }
}

section('B9. Protection model - Taunt pierce / AoE no-collapse / Untargetable');
{
  const SNIPER_SIGS = ALL.filter(
    (c) => c.role === 'Sniper' && c.ability.type === 'Active' && c.ability.spec
  );
  const MULTI = ALL.filter((c) => {
    const t = c.ability.spec && c.ability.spec.target;
    return t && t.side === 'enemy' && (t.pick === 'all' || t.pick === 'two');
  });

  const foes = [
    'camelot-king-arthur',
    'hemithea-hercules',
    'huaxia-guan-yu',
    'camelot-merlin',
    'kami-kaguya',
    'olympus-apollo',
  ];
  const mates = [
    'grimmwood-snow-white',
    'sherwood-maid-marian',
    'huaxia-hua-tuo',
    'roma-augustus',
    'kami-izanagi',
  ];

  function setup(legendId, { taunt, untarg } = {}) {
    const B = board([legendId].concat(mates), foes);
    B.noOpeningLimit = true;
    B.energy.player = 150;
    if (taunt) U(B, taunt).flags.taunt = 2;
    if (untarg) U(B, untarg).flags.untargetable = 2;
    return B;
  }

  /* --- Sniper signatures pierce the redirect --- */
  SNIPER_SIGS.forEach((c) => {
    const B = setup(c.id, { taunt: 'camelot-king-arthur' });
    const pool = E.legalTargets(B, U(B, c.id), c.ability);
    ok(
      pool.length > 1,
      'Sniper sig pierces Taunt: ' + c.name + ' keeps ' + pool.length + ' legal targets'
    );
  });

  /* --- but the Sniper BASIC does not --- */
  {
    const aim = EOL.roleAbilities.Sniper;
    const B = setup('camelot-mordred', { taunt: 'camelot-king-arthur' });
    const pool = E.legalTargets(B, U(B, 'camelot-mordred'), aim);
    ok(
      pool.length === 1 && pool[0].card.id === 'camelot-king-arthur',
      'Sniper BASIC (Aim) is still walled by Taunt'
    );
  }

  /* --- the Provoke tax: 0.7x to anyone who is NOT the provoker --- */
  {
    const shoot = (legendId, victimId, taunt) => {
      const B = setup(legendId, taunt ? { taunt } : {});
      const v = U(B, victimId);
      const hp0 = v.hp;
      E.useAbility(B, U(B, legendId), CARD[legendId].ability, [v]);
      return hp0 - v.hp;
    };
    ['yamato-tomoe-gozen', 'huaxia-nezha'].forEach((id) => {
      const clean = shoot(id, 'kami-kaguya', null);
      const taxed = shoot(id, 'kami-kaguya', 'camelot-king-arthur');
      ok(
        near(taxed / clean, 0.7, 0.02),
        CARD[id].name + ' pays the 0.7x Provoke tax (' + clean + ' -> ' + taxed + ')'
      );
      const onTaunter = shoot(id, 'camelot-king-arthur', 'camelot-king-arthur');
      const onTaunterClean = shoot(id, 'camelot-king-arthur', null);
      ok(
        onTaunter === onTaunterClean,
        CARD[id].name + ' pays NO tax when it hits the provoker itself'
      );
    });
  }

  /* --- AoE now pays the same tax on everyone except the provoker --- */
  {
    const spread = (legendId, taunt) => {
      const B = setup(legendId, taunt ? { taunt } : {});
      const hp = {};
      B.units.filter((u) => u.side === 'enemy').forEach((u) => (hp[u.card.id] = u.hp));
      E.useAbility(B, U(B, legendId), CARD[legendId].ability, []);
      const out = {};
      B.units
        .filter((u) => u.side === 'enemy')
        .forEach((u) => (out[u.card.id] = hp[u.card.id] - u.hp));
      return out;
    };
    ['kami-amaterasu', 'huaxia-qin-shi-huang', 'duat-maat'].forEach((id) => {
      const clean = spread(id, null);
      const taxed = spread(id, 'camelot-king-arthur');
      const others = Object.keys(clean).filter((k) => k !== 'camelot-king-arthur' && clean[k] > 0);
      const ratios = others.map((k) => taxed[k] / clean[k]);
      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      ok(
        near(avg, 0.7, 0.03),
        CARD[id].name + ' AoE pays the Provoke tax off-target (' + (avg * 100).toFixed(1) + '%)'
      );
      ok(
        taxed['camelot-king-arthur'] === clean['camelot-king-arthur'],
        CARD[id].name + ' AoE still hits the provoker at FULL damage'
      );
      ok(
        Object.keys(taxed).length === Object.keys(clean).length,
        CARD[id].name + ' AoE still reaches every target (no collapse)'
      );
    });
  }

  /* --- multi-target abilities never collapse --- */
  MULTI.forEach((c) => {
    const clean = setup(c.id);
    const nClean = E.resolveTargets(
      clean,
      U(clean, c.id),
      c.ability,
      E.legalTargets(clean, U(clean, c.id), c.ability).slice(0, 2)
    ).length;
    const B = setup(c.id, { taunt: 'camelot-king-arthur' });
    const n = E.resolveTargets(
      B,
      U(B, c.id),
      c.ability,
      E.legalTargets(B, U(B, c.id), c.ability).slice(0, 2)
    ).length;
    ok(
      n === nClean && n > 1,
      'AoE never collapses: ' + c.name + ' hits ' + n + '/' + nClean + ' through a Taunt'
    );
  });

  /* --- Untargetable is absolute --- */
  SNIPER_SIGS.concat(MULTI).forEach((c) => {
    const B = setup(c.id, { untarg: 'camelot-merlin' });
    const pool = E.legalTargets(B, U(B, c.id), c.ability);
    ok(!pool.some((u) => u.card.id === 'camelot-merlin'), 'Untargetable is absolute vs ' + c.name);
  });
  {
    /* taunting AND untargetable: still unreachable, and it must not
       wall the sniper onto an illegal target either */
    const B = setup('camelot-mordred', { taunt: 'camelot-merlin', untarg: 'camelot-merlin' });
    const pool = E.legalTargets(B, U(B, 'camelot-mordred'), CARD['camelot-mordred'].ability);
    ok(
      pool.length > 0 && !pool.some((u) => u.card.id === 'camelot-merlin'),
      'Untargetable + Taunt on one legend stays unreachable'
    );
  }

  /* --- THE GOLDEN RULE: Taunt only intercepts single-target ATTACKS ---
     A synthetic pure-utility ability (no dmg) must never be redirected,
     because there is no blow for the taunter to body-block. */
  {
    const utility = {
      type: 'Active',
      name: '__probe_utility',
      cost: 10,
      spec: {
        target: { side: 'enemy', pick: 'single', row: 'any' },
        effects: [{ k: 'silence', turns: 1 }, { k: 'mark' }],
      },
    };
    const attack = {
      type: 'Active',
      name: '__probe_attack',
      cost: 10,
      spec: {
        target: { side: 'enemy', pick: 'single', row: 'any' },
        effects: [{ k: 'dmg', power: 1, element: 'Magic' }],
      },
    };
    const B = setup('camelot-morgan-le-fay', { taunt: 'camelot-king-arthur' });
    const caster = U(B, 'camelot-morgan-le-fay');
    ok(
      E.legalTargets(B, caster, utility).length > 1,
      'Golden rule: a pure-utility single-target ability is NOT blocked by Taunt'
    );
    const ap = E.legalTargets(B, caster, attack);
    ok(
      ap.length === 1 && ap[0].card.id === 'camelot-king-arthur',
      'Golden rule: a single-target ATTACK from the same legend IS blocked'
    );
    /* explicit override still works both ways */
    const forced = JSON.parse(JSON.stringify(attack));
    forced.spec.target.attack = false;
    ok(
      E.legalTargets(B, caster, forced).length > 1,
      'target.attack:false opts an ability out of the Taunt redirect'
    );
  }

  /* --- to:'enemies' riders must respect Untargetable ---
     Apollo's "Mark the highest ATK enemy" bypassed the target picker
     entirely and marked a legend who could not legally be targeted. */
  {
    const B = setup('olympus-apollo', { untarg: 'kami-kaguya' });
    E.useAbility(B, U(B, 'olympus-apollo'), CARD['olympus-apollo'].ability, [
      U(B, 'grimmwood-snow-white'),
    ]);
    const marked = B.units.filter((u) => u.side === 'enemy' && u.flags.marked);
    ok(
      !marked.some((u) => u.card.id === 'kami-kaguya'),
      'Apollo\u2019s Mark rider skips an Untargetable enemy'
    );
    ok(
      marked.length === 1,
      'Apollo\u2019s Mark rider still marks someone (' +
        (marked[0] ? marked[0].name : 'nobody') +
        ')'
    );
  }

  /* --- everyone else is still walled ---
     PURE UTILITY IS EXEMPT, and always was: guidelines section
     "The one rule", consequence 3 - "an ability that deals no damage
     ... ignores Provoke, because there is no blow to intercept."

     The filter did not encode that because until the Chapter II
     factions there was no single-target enemy skill in the roster
     with zero damage on it; every Controller carried at least a small
     hit. Lust, Metatron, Carmilla and Davy Jones are the first four,
     and the engine correctly lets them through the wall. Testing them
     against the redirect asserted the opposite of the documented rule. */
  const dealsDamage = (c) => {
    let found = false;
    const walk = (n) => {
      if (!n || typeof n !== 'object' || found) return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.k === 'dmg' || n.k === 'lifesteal') found = true;
      ['effects', 'then', 'other', 'heads', 'tails', 'choose'].forEach((b) => n[b] && walk(n[b]));
    };
    walk(c.ability.spec && c.ability.spec.effects);
    if (c.ability.spec && c.ability.spec.choose) walk(c.ability.spec.choose);
    return found;
  };
  ALL.filter((c) => {
    const t = c.ability.spec && c.ability.spec.target;
    return (
      t &&
      t.side === 'enemy' &&
      c.role !== 'Sniper' &&
      (t.pick === 'single' || t.pick === 'auto') &&
      dealsDamage(c)
    );
  }).forEach((c) => {
    const B = setup(c.id, { taunt: 'camelot-king-arthur' });
    const pool = E.legalTargets(B, U(B, c.id), c.ability);
    ok(
      pool.length === 1 && pool[0].card.id === 'camelot-king-arthur',
      'Taunt still walls ' + c.role + ' ' + c.name
    );
  });
}

/* =============================================================
   C. SOAK - invariants across real AI games
   ============================================================= */
section('C. SOAK - invariants over AI-vs-AI games');
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

  const viol = {
    negHp: 0,
    overHp: 0,
    deadActed: 0,
    deadEffect: 0,
    doubleAct: 0,
    negShield: 0,
    staleFlag: 0,
    err: 0,
    capBreach: 0,
  };
  const seen = {};
  let games = 0,
    rounds = 0,
    casts = 0;
  const N = 120;

  for (let i = 0; i < N; i++) {
    try {
      let a = 31337 + i * 7919;
      const rng = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648;
      const teams = EOL.rules.splitCapped(POOL, rng);
      const B = E.createBattle(teams[0], teams[1], { rng, roleAware: true, simulation: true });
      B.units.forEach((u) => (seen[u.card.id] = (seen[u.card.id] || 0) + 1));

      /* role cap must hold on both sides */
      ['player', 'enemy'].forEach((s) => {
        const c = {};
        B.units.filter((u) => u.side === s).forEach((u) => (c[u.role] = (c[u.role] || 0) + 1));
        if (Object.values(c).some((n) => n > 3)) viol.capBreach++;
      });

      EOL.onBattleEvent = function (BB, ev) {
        if (ev.t === 'dmg' || ev.t === 'heal' || ev.t === 'shield') {
          const src = BB.units.find((x) => x.uid === ev.src);
          /* A legend killed mid-cast (e.g. by a counter-strike) still walks the
             rest of its own effect list, but every remaining hit resolves for
             0 - dealDamage returns early on a dead source's target. Only
             NON-ZERO damage from a corpse is a real violation. */
          if (src && !src.alive && ev.t === 'dmg' && ev.amount > 0) viol.deadEffect++;
        }
      };

      let guard = 0;
      while (!B.over && B.round <= 20 && guard++ < 5000) {
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
        if (B.acted[side][act.unit.uid]) viol.doubleAct++;
        if (!act.unit.alive) viol.deadActed++;
        E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
        if (!act.ability.basic) casts++;

        B.units.forEach((u) => {
          if (u.hp < 0) viol.negHp++;
          if (u.hp > u.maxHp) viol.overHp++;
          if (u.shield < 0) viol.negShield++;
          /* A corpse may keep its flag values (the engine does not scrub
             them, which is fine and cheap) - what must never happen is a
             dead unit being returned as a legal target. */
          if (!u.alive) {
            const pool = E.legalTargets(
              B,
              u.side === 'player'
                ? B.units.find((x) => x.side === 'enemy' && x.alive) || u
                : B.units.find((x) => x.side === 'player' && x.alive) || u,
              E.roleAbility(u)
            );
            if (pool.indexOf(u) >= 0) viol.staleFlag++;
          }
        });
      }
      EOL.onBattleEvent = null;
      games++;
      rounds += B.round;
    } catch (err) {
      viol.err++;
      if (viol.err <= 3) console.log('    ERROR: ' + err.message);
    }
  }
  console.log(
    `  ${games} games, avg ${(rounds / games).toFixed(1)} rounds, ${casts} signature casts`
  );
  ok(viol.err === 0, `no engine errors (${viol.err})`);
  ok(viol.negHp === 0, `no negative HP (${viol.negHp})`);
  ok(viol.overHp === 0, `no HP above max (${viol.overHp})`);
  ok(viol.negShield === 0, `no negative shield (${viol.negShield})`);
  ok(viol.deadActed === 0, `no dead unit took an action (${viol.deadActed})`);
  ok(viol.deadEffect === 0, `no NON-ZERO damage sourced from a dead unit (${viol.deadEffect})`);
  ok(viol.doubleAct === 0, `no unit acted twice in a round (${viol.doubleAct})`);
  ok(viol.staleFlag === 0, `a dead unit is never a legal target (${viol.staleFlag})`);
  ok(viol.capBreach === 0, `role cap (max 3) never breached (${viol.capBreach})`);

  const never = ALL.filter((c) => !seen[c.id]);
  ok(
    never.length === 0,
    `every legend appeared at least once${never.length ? ' (missing: ' + never.map((c) => c.name).join(', ') + ')' : ''}`
  );
  const tk = ALL.filter((c) => c.faction === 'kami');
  console.log(
    '  Kami appearances: ' + tk.map((c) => c.name + '=' + (seen[c.id] || 0)).join(', ')
  );
}

/* =============================================================
   DEATH-TRIGGERED PASSIVES
   -------------------------------------------------------------
   These fire when an ALLY dies, so the PROBES table above cannot
   reach them - it only casts a legend's own signature. They need a
   real kill driven through the damage path, because handleDeath is
   deliberately not exported.

   Ported here from the retired sim/verify_roma.js, which tested a
   frozen 7-faction snapshot and had drifted out of date. Written
   against the live roster instead, so they keep working as the game
   grows.
   ============================================================= */
section('D. DEATH-TRIGGERED PASSIVES');
{
  /* Spartacus: when an ally falls, every survivor gains an ATK stack
     and Spartacus shields himself. */
  const B = board(['roma-spartacus', 'roma-augustus', ...FILL.slice(0, 4)]);
  const sp = U(B, 'roma-spartacus');
  const victim = alliesOf(B).filter(
    (u) => u.card.id !== 'roma-spartacus' && u.card.id !== 'roma-augustus'
  )[0];
  const shieldBefore = sp.shield;
  victim.hp = 1;
  const foe = foesOf(B)[0];
  E.useAbility(B, foe, E.roleAbility(foe), [victim]);

  ok(!victim.alive, 'Spartacus setup: the ally actually died');
  ok(
    alliesOf(B).every((u) => u.buffs.some((b) => b.tag === 'i-am-spartacus')),
    'Spartacus: ally death -> every survivor gains the ATK stack'
  );
  ok(sp.shield > shieldBefore, 'Spartacus: ally death -> he shields himself');
}
{
  /* Augustus (Pax Romana): when the team scores a kill, heal the two
     most wounded allies - exactly two, not the whole team. */
  const B = board(['roma-augustus', 'camelot-mordred', ...FILL.slice(0, 4)]);
  const mord = U(B, 'camelot-mordred');
  const mine = alliesOf(B);
  mine.forEach((u) => {
    u.hp = Math.round(u.maxHp * 0.5);
  });
  const foe = foesOf(B)[0];
  foesOf(B)
    .filter((u) => u !== foe)
    .forEach((u) => {
      u.alive = false;
    });
  foe.hp = 1;
  const before = mine.map((u) => u.hp);
  E.useAbility(B, mord, mord.card.ability, [foe]);
  const healed = mine.filter((u, i) => u.hp > before[i]).length;

  ok(!foe.alive, 'Augustus setup: the enemy was defeated');
  ok(healed === 2, `Augustus: Pax Romana heals exactly 2 allies (got ${healed})`);
}

section('E. EXTERNAL-AUDIT REGRESSIONS (2026-08-04)');

{
  /* Sekhmet: the anti-heal is a REDUCTION. healUnit does mod += pct/100,
     so the data must say -30; +30 silently boosted enemy healing 1.3x. */
  const mkBoard = (castIt) => {
    const B = board(
      ['duat-sekhmet', ...CLEAN_FOES.slice(0, 5)],
      ['roma-augustus', ...CLEAN_FOES.slice(0, 5)]
    );
    const sekh = U(B, 'duat-sekhmet');
    if (castIt) E.useAbility(B, sekh, sekh.card.ability, []);
    return B;
  };
  const hurtAndHeal = (B) => {
    const aug = U(B, 'roma-augustus');
    B.units.forEach((u) => {
      if (u.side === 'enemy' && u !== aug) u.hp = u.maxHp;
    });
    aug.hp = 2000;
    const before = aug.hp;
    E.useAbility(B, aug, E.roleAbility(aug), []);
    return aug.hp - before;
  };
  const withCurse = mkBoard(true);
  /* every enemy carries the debuff at the NEGATIVE value */
  ok(
    foesOf(withCurse).every((u) => u.flags.healMod === -30),
    'Sekhmet: healMod is -30 on ALL enemies (not +30)'
  );
  const boostedHealed = hurtAndHeal(mkBoard(false));
  const cursedHealed = hurtAndHeal(mkBoard(true));
  ok(
    Math.abs(cursedHealed - boostedHealed * 0.7) <= 2,
    `Sekhmet: cursed heal is exactly 70% of the clean heal (${cursedHealed} vs ${boostedHealed})`
  );
  /* sign law: only a NEGATIVE healMod reads as a debuff */
  const probe = U(mkBoard(true), 'roma-augustus');
  probe.flags.healMod = 0;
  probe.flags.healMod = 25;
  ok(!E.hasDebuff(probe), 'a positive healMod (heal-up) is NOT a debuff');
  probe.flags.healMod = -25;
  ok(E.hasDebuff(probe), 'a negative healMod (heal-down) IS a debuff');
}

{
  /* Benkei's Standing Death gate: 15% less damage only at 50+ Energy.
     incomingMult used to skip the `when` clause entirely. Comparative
     ratio isolates the gate - every other defender-side mult applies
     identically in both boards. */
  const hitBenkei = (energy) => {
    const B = board(
      ['camelot-mordred', ...CLEAN_FOES.slice(0, 5)],
      ['yamato-benkei', ...CLEAN_FOES.slice(0, 5)]
    );
    B.energy.enemy = energy;
    const ben = U(B, 'yamato-benkei');
    const mord = U(B, 'camelot-mordred');
    const before = ben.hp;
    E.useAbility(B, mord, E.roleAbility(mord), [ben]);
    return before - ben.hp;
  };
  const low = hitBenkei(10);
  const high = hitBenkei(60);
  ok(
    Math.abs(high - low * 0.85) <= 2,
    `Benkei: at 60 Energy takes exactly 85% of the 10-Energy hit (${high} vs ${low})`
  );
}

{
  /* Zhuge Liang: the drain resolves ONCE per cast even with two victims -
     one pool is drained, so take:1 keeps it at the printed 15, not 30. */
  const B = board(['huaxia-zhuge-liang', ...CLEAN_FOES.slice(0, 5)]);
  B.energy.enemy = 60;
  const foes = foesOf(B);
  E.useAbility(B, U(B, 'huaxia-zhuge-liang'), U(B, 'huaxia-zhuge-liang').card.ability, [
    foes[0],
    foes[1],
  ]);
  ok(
    B.energy.enemy === 45,
    `Zhuge Liang drains exactly 15 with two targets (pool ${B.energy.enemy}/60)`
  );
}

{
  /* Silence refresh: longer remaining duration wins (Burn/Exposed rule) */
  const B = board(['roma-cicero', ...CLEAN_FOES.slice(0, 5)]);
  const cic = U(B, 'roma-cicero');
  const f0 = foesOf(B)[0];
  const f1 = foesOf(B)[1];
  f0.flags.silence = 2;
  E.useAbility(B, cic, cic.card.ability, [f0]);
  ok(
    f0.flags.silence === 2,
    `a fresh 1-turn Silence never shortens a 2-turn one (got ${f0.flags.silence})`
  );
  B.acted.player = {};
  B.energy.player = 100;
  E.useAbility(B, cic, cic.card.ability, [f1]);
  ok(f1.flags.silence === 1, 'Silence still applies normally on a clean target');
}

{
  /* Status chips: Warded + Counter Ready are now visible; healdown obeys
     the sign law. These STATUS defs existed but statusesOf never emitted. */
  const B = board(['camelot-guinevere', ...CLEAN_FOES.slice(0, 5)]);
  const u = alliesOf(B)[0];
  u.flags.resistPct = 22;
  u.flags.resistPctTurns = 2;
  u.flags.counterTurns = 1;
  u.flags.healMod = -30;
  u.flags.healModTurns = 2;
  const keys = EOL.statusesOf(u, E).map((o) => o.key);
  ok(keys.indexOf('resist') >= 0, 'Warded (timed damageResist) shows a chip');
  ok(keys.indexOf('counterstrike') >= 0, 'an armed counter-strike shows Counter Ready');
  ok(keys.indexOf('healdown') >= 0, 'heal-down wears the Healing Reduced chip');
  u.flags.healMod = 25;
  ok(
    EOL.statusesOf(u, E).every((o) => o.key !== 'healdown'),
    'a heal-UP buff never wears the Healing Reduced chip'
  );
}

{
  /* THE LANCELOT CHIP BUG (2026-08-09). One stat chip can hold buffs on
     different clocks - his permanent (99-round) ATK stacks plus an
     ally's 2-round ATK buff. The merged chip kept only the FIRST
     member's timer, so the temporary buff read as permanent (or, in
     the other order, the permanent one read as expiring). The engine
     was always right; the chip lied. */
  const B = board(['camelot-lancelot', ...CLEAN_FOES.slice(0, 5)]);
  const u = U(B, 'camelot-lancelot');
  u.buffs.push({ stat: 'atk', amt: 10, turns: 99, tag: 'finest-knight-atk' });
  u.buffs.push({ stat: 'atk', amt: 10, turns: 99, tag: 'finest-knight-atk' });
  u.buffs.push({ stat: 'atk', amt: 25, turns: 2, tag: null });

  /* 1. engine truth: the temp part expires on schedule, permanent stacks stay */
  const atkPct = () => u.buffs.reduce((t, b) => t + (b.stat === 'atk' ? b.amt : 0), 0);
  ok(atkPct() === 45, `all buffs live before rollover (+${atkPct()}%)`);
  E.nextRound(B);
  E.nextRound(B);
  ok(
    atkPct() === 20,
    `the 2-round ally buff expired on schedule, permanent stacks stayed (+${atkPct()}%)`
  );

  /* 2. chip truth: same-clock stacks combine; different clocks remain distinct */
  u.buffs.push({ stat: 'atk', amt: 25, turns: 2, tag: null });
  let chip = EOL.statusesOf(u, E).find((o) => o.key === 'atk+');
  ok(chip && chip.turns >= 90, `merged chip wears the LONGEST clock (${chip && chip.turns})`);
  ok(chip && chip.count === 3, 'merged chip counts all three buffs');
  ok(
    chip && chip.parts && chip.parts.length === 2,
    'popup groups the stack into one permanent part and one temporary part'
  );
  ok(
    chip &&
      chip.parts.some((p) => p.turns === 2 && p.amt === 25) &&
      chip.parts.some((p) => p.turns >= 90 && p.amt === 20 && p.count === 2),
    'same-status effects on the same clock display as one summed stack'
  );

  /* 3. order independence: temp applied first must not shorten the chip */
  u.buffs.length = 0;
  u.buffs.push({ stat: 'atk', amt: 25, turns: 2, tag: null });
  u.buffs.push({ stat: 'atk', amt: 10, turns: 97, tag: 'finest-knight-atk' });
  chip = EOL.statusesOf(u, E).find((o) => o.key === 'atk+');
  ok(
    chip && chip.turns === 97,
    `temp-first order still shows the longest clock (${chip && chip.turns})`
  );

  /* 4. the same rule holds for merged team cost modifiers */
  u.buffs.length = 0;
  u.costMods = [
    { pct: 15, turns: 1 },
    { pct: 15, turns: 3 },
  ];
  chip = EOL.statusesOf(u, E).find((o) => o.key === 'costup');
  ok(chip && chip.turns === 3, `merged cost chip wears the longest clock (${chip && chip.turns})`);
}

{
  /* DEFEATED MEANS INERT. Expiry riders and leftover multi-part effects
     must neither protect a corpse nor let a defeated source act. */
  const B = board([
    'hemithea-hercules',
    'grimmwood-hansel-gretel',
    'camelot-guinevere',
    'sherwood-little-john',
    'grimmwood-snow-white',
    'olympus-apollo',
  ]);
  const hercules = U(B, 'hemithea-hercules');
  const hansel = U(B, 'grimmwood-hansel-gretel');
  const living = U(B, 'camelot-guinevere');

  cast(B, 'hemithea-hercules', []);
  hercules.alive = false;
  hercules.hp = 0;
  hercules.shield = 0;
  E.nextRound(B);
  E.nextRound(B);
  ok(hercules.shield === 0, 'defeated Hercules cannot form his end-of-Provoke shield');
  ok(E.passiveOf(hercules) === null, 'a defeated legend exposes no active passive');

  hansel.alive = false;
  hansel.hp = 0;
  hansel.shield = 0;
  E.applyEffectsPublic(B, living, [hansel], [{ k: 'shield', pctMaxHp: 30 }], {
    immediate: true,
  });
  ok(hansel.shield === 0 && !hansel.alive, 'ordinary effects cannot shield or revive a corpse');

  E.applyEffectsPublic(
    B,
    hercules,
    [hansel],
    [{ k: 'revive', pctMaxHp: 50, to: 'lastFallenAlly' }],
    { immediate: true }
  );
  ok(!hansel.alive && hansel.hp === 0, 'a defeated source cannot trigger a resurrection');
}

{
  /* Even when a Shield absorbs the entire hit, the combat log must retain
     the critical verdict so the renderer can print CRITICAL beside it. */
  const B = board(['grimmwood-goldilocks', ...CLEAN_FOES.slice(0, 5)]);
  const src = U(B, 'grimmwood-goldilocks');
  const target = foesOf(B)[0];
  B.simulation = false;
  src.buffs.push({ stat: 'crit', amt: 100, turns: 99, tag: 'crit-proof' });
  target.shield = target.maxHp;
  E.useAbility(B, src, E.roleAbility(src), [target]);
  const absorbed = B.log.find((l) => l.type === 'absorb');
  ok(
    absorbed && absorbed.meta && absorbed.meta.crit === true,
    'a fully absorbed critical still carries the explicit critical verdict'
  );
}

{
  /* THE BATTLE REPORT + DAMAGE PREVIEW (2026-08-10). The tally is
     engine truth, and the preview must equal the dice-free hit. */
  const B = board(['grimmwood-goldilocks', ...CLEAN_FOES.slice(0, 5)]);
  const g = U(B, 'grimmwood-goldilocks');
  const f = foesOf(B)[0];
  B.rng = () => 0.999; // no crits: the preview's exact regime
  const basic = E.roleAbility(g);
  const pv = E.previewDamage(B, g, basic, f);
  ok(!!pv && pv.dmg > 0, 'previewDamage prices a basic attack');
  ok(pv.crit === Math.round(pv.dmg * 1.5), 'crit projection is exactly 1.5x');
  const before = f.hp + f.shield;
  E.useAbility(B, g, basic, [f]);
  const lost = before - (f.hp + f.shield);
  ok(
    pv.dmg === lost,
    `preview equals the dice-free hit (preview ${pv.dmg} vs dealt ${lost})`
  );
  ok(
    B.tally[g.uid] && B.tally[g.uid].dealt === lost,
    'the tally credits the attacker with the blow'
  );
  ok(
    B.tally[f.uid] && B.tally[f.uid].taken + B.tally[f.uid].absorbed === lost,
    'and debits the victim'
  );
  /* healing credits the healer */
  const B2 = board(['grimmwood-snow-white', ...CLEAN_FOES.slice(0, 5)]);
  const sw = U(B2, 'grimmwood-snow-white');
  const ally = alliesOf(B2).find((x) => x.uid !== sw.uid) || sw;
  ally.hp = Math.max(1, ally.hp - 2000);
  B2.rng = () => 0.999;
  E.useAbility(B2, sw, E.roleAbility(sw), [ally]);
  ok(
    B2.tally[sw.uid] && B2.tally[sw.uid].healed > 0,
    'the tally credits the healer with the mending'
  );
}

{
  /* Sun Wukong (72 Transformations): the rebirth must CLEAR everything he
     was carrying when he died - otherwise he returns still Burning and
     Exposed, i.e. straight back into the death that just happened - while
     keeping what the rebirth itself grants. */
  const B = board(['huaxia-sun-wukong', ...FILL.slice(0, 5)]);
  const wu = U(B, 'huaxia-sun-wukong');

  wu.flags.burn = 3;
  wu.flags.exposed = 2;
  wu.flags.marked = 1;
  wu.flags.healMod = -50;
  wu.buffs.push({ stat: 'atk', amt: -40, turns: 9, tag: 'test-debuff' });

  /* Drive him to the wouldDie trigger with real enemy actions. Skip any
     foe whose basic would heal or cannot reach him. */
  let fired = false;
  for (let i = 0; i < 80 && !fired; i++) {
    wu.hp = 1;
    wu.shield = 0;
    wu.flags.untargetable = 0;
    const foe = foesOf(B).filter((u) => u.alive)[i % 6];
    if (!foe) break;
    foe.flags.silence = 0;
    const ab = E.roleAbility(foe);
    if (!E.legalTargets(B, foe, ab).some((t) => t.uid === wu.uid)) continue;
    E.useAbility(B, foe, ab, [wu]);
    if (wu.usedOnce && wu.usedOnce.wouldDie) fired = true;
  }

  ok(fired, 'Sun Wukong setup: the wouldDie passive actually fired');
  ok(wu.alive, 'Sun Wukong: survives his first death');
  ok(
    !wu.flags.burn && !wu.flags.exposed && !wu.flags.marked && !wu.flags.healMod,
    'Sun Wukong: rebirth clears every debuff FLAG he died with'
  );
  ok(
    !wu.buffs.some((b) => b.amt < 0),
    'Sun Wukong: rebirth clears every negative stat buff he died with'
  );
  ok(wu.shield > 0, 'Sun Wukong: the rebirth Shield survives its own wipe');
  ok(wu.flags.taunt > 0, 'Sun Wukong: the rebirth Provoke survives its own wipe');
  ok(wu.flags.untargetable > 0, 'Sun Wukong: rebirth Untargetable survives its own wipe');
  ok(
    wu.buffs.some((b) => b.stat === 'atk' && b.amt > 0),
    'Sun Wukong: the rebirth ATK buff survives its own wipe'
  );
}

/* =============================================================
   F. DRAFT INTELLIGENCE - rating coverage
   -------------------------------------------------------------
   The defect this section exists to prevent, in full, because it
   shipped: the draft AI used to score cards from a hand-copied
   `POWER` table that rated 51 of 63 legends. `powerOf` returned 0 for
   the other twelve, and 0 is not "unknown", it is the roster MEAN -
   so every Duat legend and half of Grimmwood were drafted, banned and
   fielded as exactly average. Nothing anywhere asserted that the
   table covered the roster, so adding a faction silently degraded
   the bot and no test went red.

   data/draft-ai.js no longer has a table - it prices cards off their
   own effect trees and then MEASURES them by playing them - so
   coverage is total by construction. These assertions make that
   structural claim a checked one: add a legend, add a faction, and if
   the brain cannot rate it this goes red immediately.

   The cheap path (the analytic cold-start estimate) is asserted
   always. `--probe` additionally runs the real measurement, which
   plays a few hundred duels and takes ~15s, and asserts the same
   coverage on the rating that actually ships.
   ============================================================= */
section('F. DRAFT INTELLIGENCE - rating coverage');
{
  eval(fs.readFileSync(path.join(ROOT, 'data/draft-ai.js'), 'utf8'));
  const DAI = EOL.draftAI;
  ok(!!DAI, 'draft AI module loads');

  const rate = (label, of) => {
    const vals = ALL.map((c) => of(c));
    const bad = ALL.filter((c, i) => !isFinite(vals[i]));
    ok(
      bad.length === 0,
      `${label}: every legend rates to a finite number (${bad.map((c) => c.id).join(', ')})`
    );
    /* The old failure mode was invisible precisely because it looked
       like a valid number. A card is only allowed to sit exactly on
       the roster mean if a real measurement put it there, so more
       than a couple of exact zeros means ids are being missed. */
    const zeros = ALL.filter((c, i) => vals[i] === 0);
    ok(
      zeros.length <= 1,
      `${label}: at most one legend sits exactly on the mean (got ${zeros.length}: ${zeros
        .map((c) => c.id)
        .slice(0, 14)
        .join(', ')})`
    );
    const distinct = new Set(vals.map((v) => v.toFixed(3))).size;
    ok(
      distinct >= ALL.length * 0.8,
      `${label}: ratings discriminate (${distinct} distinct of ${ALL.length})`
    );
    const sorted = vals.slice().sort((a, b) => a - b);
    ok(sorted[sorted.length - 1] - sorted[0] > 1, `${label}: the scale has real spread`);
    return vals;
  };

  ok(
    DAI.ratingSource() === 'estimated',
    'cold start answers from the analytic estimate, not a table'
  );
  rate('cold-start estimate', (c) => DAI.powerOf(c));

  /* Synergy has to be alive. It was dead code in the shipped module
     for its entire life - `tags()` was handed the {card,faction}
     wrapper and indexed it by `.id`, so every one of the 1,953 pairs
     scored 0.0 and the bot never once considered a combination. */
  const POOL = [];
  EOL.factions.forEach((f) => f.cards.forEach((c) => POOL.push({ card: c, faction: f })));
  let synTotal = 0,
    synPairs = 0;
  for (let i = 0; i < POOL.length; i += 1) {
    for (let j = i + 1; j < POOL.length; j += 1) {
      synTotal += DAI.pairSynergy(POOL[i], POOL[j]);
      synPairs += 1;
    }
  }
  ok(
    synTotal > 0,
    `pair synergy is live, not dead code (${synTotal.toFixed(1)} over ${synPairs} pairs)`
  );

  /* The cold-start estimate prices an ability by walking the same
     effect tree the engine executes. An effect kind it has no case for
     is priced at nothing - silently, exactly like the missing table
     rows did. So: every kind the ROSTER actually uses must have a case
     in `nodeValue`. Ship a new effect and this goes red on the same run
     that the engine's own kind check does. */
  {
    const src = fs.readFileSync(path.join(ROOT, 'data/draft-ai.js'), 'utf8');
    const from = src.indexOf('function nodeValue(');
    const to = src.indexOf('\n  function ', from + 1);
    ok(from > 0 && to > from, 'the draft AI effect pricer is findable for auditing');
    const priced = new Set(
      (src.slice(from, to).match(/case '(\w+)':/g) || []).map((m) => m.match(/'(\w+)'/)[1])
    );
    /* Structural nodes: the walker recurses into them and prices the
       arms, so the node itself correctly costs nothing. */
    ['branch', 'coinFlip', 'randomOf', 'delayed', 'repeat', 'perTarget'].forEach((k) =>
      priced.add(k)
    );
    const used = new Set();
    ALL.forEach((c) => walkEffects(c, (e) => used.add(e.k)));
    const unpriced = [...used].filter((k) => !priced.has(k)).sort();
    ok(
      unpriced.length === 0,
      `the draft AI prices every effect kind in the roster (unpriced: ${unpriced.join(', ')})`
    );
  }

  /* Scale discipline: both public scores must be a property of the
     FIT, not of how many cards happen to be on the board. Summed
     terms grow with team size and drown the strength term - the bug
     that made the first rewrite lose 71/29 to the module it replaced. */
  const cand = POOL.find((e) => e.card.id === 'camelot-mordred');
  const small = POOL.filter((e) => e.card.id !== cand.card.id).slice(0, 3);
  const big = POOL.filter((e) => e.card.id !== cand.card.id).slice(0, 11);
  const vSmall = DAI.value(small, cand, { size: 12 });
  const vBig = DAI.value(big, cand, { size: 12 });
  ok(
    Math.abs(vBig - vSmall) < 6,
    `value() does not inflate with team size (3 mates ${vSmall.toFixed(2)} vs 11 mates ${vBig.toFixed(2)})`
  );
  const dSmall = DAI.denyValue(small, cand, small);
  const dBig = DAI.denyValue(big, cand, big);
  ok(
    Math.abs(dBig - dSmall) < 6,
    `denyValue() does not inflate with roster size (${dSmall.toFixed(2)} vs ${dBig.toFixed(2)})`
  );

  if (process.argv.indexOf('--probe') >= 0) {
    const t0 = Date.now();
    /* The probe retunes the search AI's depth and rollout budget - both
       module-level globals - and must hand them back exactly as it
       found them. A probe that forgot would quietly play the rest of
       the session, or the rest of a sim run, at depth 1. */
    const depthBefore = AI.SEARCH_DEPTH;
    const budgetBefore = JSON.stringify(AI.simulationBudget());
    const measured = DAI.measureNow();
    ok(!!measured, 'the measured rating runs against the live engine');
    ok(
      measured && Object.keys(measured).length === ALL.length,
      `the measured rating covers the whole roster (${measured ? Object.keys(measured).length : 0}/${ALL.length})`
    );
    ok(DAI.ratingSource() === 'cached', 'after measuring, powerOf answers from the measurement');
    rate('measured rating', (c) => DAI.powerOf(c));
    ok(
      AI.SEARCH_DEPTH === depthBefore,
      'the probe hands the search AI back at the depth it borrowed it at'
    );
    ok(
      JSON.stringify(AI.simulationBudget()) === budgetBefore,
      'the probe restores the search AI rollout budget'
    );

    /* DETERMINISM. js/ai.js cuts its rollout loops on wall clock, so a
       probe run under a real time budget measures a card differently on
       a loaded machine than on an idle one - and the result is cached
       in the player's localStorage, so that difference would persist.
       The probe sets an unreachable budget for exactly this reason;
       this asserts it, because the failure is silent and only shows up
       as ratings that drift between sessions. */
    DAI._rebuild();
    const again = DAI.measureNow();
    ok(
      JSON.stringify(again) === JSON.stringify(measured),
      'the measured rating is deterministic - two runs agree exactly'
    );
    console.log('  (probe took ' + ((Date.now() - t0) / 1000).toFixed(1) + 's for two full runs)');
  }

  /* A legend the roster has never seen - a campaign boss handed straight
     to the engine - must be priced, not called average. Last, because
     `learn()` widens the roster and the coverage counts above are
     exact. */
  const boss = JSON.parse(JSON.stringify(CARD['camelot-mordred']));
  boss.id = '_audit-boss';
  boss.stats.atk = Math.round(boss.stats.atk * 1.6);
  DAI.learn(boss);
  ok(
    isFinite(DAI.powerOf(boss)) && DAI.powerOf(boss) !== 0,
    'an unknown card is priced on the spot, not defaulted to the mean'
  );
}

/* =============================================================
   LEGEND LORE (data/lore.js)
   -------------------------------------------------------------
   The card detail dialog reads card.lore. A legend with no prose
   renders a card with a hole in it, so coverage is enforced here
   rather than discovered by a player.
   ============================================================= */
section('LEGEND LORE');
{
  const missing = ALL.filter((c) => !c.lore).map((c) => c.id);
  ok(missing.length === 0, 'every legend has lore' + (missing.length ? ' (missing: ' + missing.slice(0, 5).join(', ') + ')' : ''));

  const stale = Object.keys(EOL.legendLore || {}).filter((id) => !CARD[id]);
  ok(stale.length === 0, 'no lore entry names a card that does not exist' + (stale.length ? ' (' + stale.join(', ') + ')' : ''));

  /* HOUSE STYLE: lore says WHY, the skill text says what. Rules
     vocabulary in prose is how two sources of truth start to
     disagree with each other. */
  const rules = /\b(Provoke|Provoking|Provoked|Exposed|Marked|Energy|Shielded|Burning|Burned|Silenced|Crit Chance|Max HP)\b/;
  const leaky = ALL.filter((c) => c.lore && rules.test(c.lore)).map((c) => c.id);
  ok(leaky.length === 0, 'no lore leaks rules vocabulary' + (leaky.length ? ' (' + leaky.slice(0, 5).join(', ') + ')' : ''));

  /* Long enough to be worth a dialog, short enough to read. */
  const tooShort = ALL.filter((c) => c.lore && c.lore.length < 80).map((c) => c.id);
  ok(tooShort.length === 0, 'no lore is a stub' + (tooShort.length ? ' (' + tooShort.slice(0, 5).join(', ') + ')' : ''));
  const tooLong = ALL.filter((c) => c.lore && c.lore.length > 420).map((c) => c.id);
  ok(tooLong.length === 0, 'no lore overflows the panel' + (tooLong.length ? ' (' + tooLong.slice(0, 5).join(', ') + ')' : ''));

  /* The prose must name the legend it belongs to, which is the
     cheapest possible check that lore has not been pasted onto the
     wrong card. Surnames and mononyms both count. */
  const flatten = (t) => t.replace(/[\u2018\u2019]/g, "'");
  const unnamed = ALL.filter((c) => {
    if (!c.lore) return false;
    /* Two-letter parts count: "Lu Bu" is a whole name. Curly and
       straight apostrophes are the same character to a reader, so
       Ma'at must not fail on typography. */
    const parts = flatten(c.name)
      .replace(/[^A-Za-z' ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    const lore = flatten(c.lore);
    return !parts.some((w) => lore.indexOf(w) >= 0);
  }).map((c) => c.id);
  ok(unnamed.length === 0, 'every lore entry names its own legend' + (unnamed.length ? ' (' + unnamed.slice(0, 5).join(', ') + ')' : ''));
}

/* =============================================================
   SKILL TEXT THAT SCALES WITH UPGRADES (js/text.js)
   -------------------------------------------------------------
   A levelled card hits harder, so its printed Signature Skill must
   say so - but ONLY for the numbers engine.js actually multiplies
   by upPower. A wrongly scaled number is a lie about the rules, so
   this walks the whole roster and checks both directions.
   ============================================================= */
section('SKILL TEXT SCALING');
{
  const PTS = 6; // a maxed card: +2 points per level, flat
  /* Every magnitude engine.js now moves. Mirrored deliberately rather
     than shared with js/text.js - if the two drift, this fails, which
     is the whole point. */
  const magsOf = (c) => {
    const S = new Set();
    const walk = (effs) =>
      (effs || []).forEach((e) => {
        if (!e || typeof e !== 'object') return;
        if (e.k === 'dmg') {
          ['power', 'perDebuff', 'perBuff'].forEach((k) => {
            if (e[k] != null) S.add(Math.round(e[k] * 100));
          });
        }
        if (e.k === 'heal') {
          if (e.pctMaxHp != null) S.add(e.pctMaxHp);
          if (e.power != null) S.add(Math.round(e.power * 100));
          if (e.perCleansed != null) S.add(e.perCleansed);
        }
        if (e.k === 'shield' && e.pctMaxHp != null) S.add(e.pctMaxHp);
        if (e.k === 'stat' && e.amt != null) S.add(Math.abs(e.amt));
        if (e.k === 'lifesteal' && e.pct != null) S.add(e.pct);
        if (e.k === 'taunt') {
          if (e.shieldOnEnd != null) S.add(e.shieldOnEnd);
          if (e.healOnHit != null) S.add(e.healOnHit);
        }
        if (e.k === 'revive') {
          if (e.pctMaxHp != null) S.add(e.pctMaxHp);
          if (e.shieldPctMaxHp != null) S.add(e.shieldPctMaxHp);
        }
        if (e.k === 'counterStrike') {
          if (e.power != null) S.add(Math.round(e.power * 100));
          if (e.markedPower != null) S.add(Math.round(e.markedPower * 100));
        }
        /* The multiplier passives are stored as a FACTOR but printed as
           the distance from 1 - "15% less damage" is mult 0.85. */
        if (e.k === 'damageMult' || e.k === 'damageResist' || e.k === 'outgoingMult') {
          if (e.mult != null) S.add(Math.round(Math.abs(1 - e.mult) * 1000) / 10);
          if (e.pct != null) S.add(Math.abs(e.pct));
        }
        if (e.k === 'healMod' && e.pct != null) S.add(Math.abs(e.pct));
        if (e.k === 'copyAllyActive' && e.scale != null) S.add(Math.round(e.scale * 100));
        ['then', 'other', 'effects'].forEach((k) => {
          if (Array.isArray(e[k])) walk(e[k]);
        });
        ['heads', 'tails'].forEach((k) => {
          if (e[k] && Array.isArray(e[k].effects)) walk(e[k].effects);
        });
        if (Array.isArray(e.choose)) e.choose.forEach((o) => walk(o.effects));
      });
    const sp = c.ability.spec || {};
    walk(sp.effects);
    if (Array.isArray(sp.choose)) sp.choose.forEach((o) => walk(o.effects));
    if (c.ability.passive) walk(c.ability.passive.effects);
    return S;
  };

  ok(typeof EOL.scaleSkillText === 'function', 'EOL.scaleSkillText exists');
  ok(
    ALL.every((c) => EOL.scaleSkillText(c.ability.text, c, 0) === c.ability.text),
    'level 0 (no points) never touches the text'
  );

  let wrong = 0;
  let badMath = 0;
  let changed = 0;
  let tokens = 0;
  const TOKEN = /title="(\d+)% before upgrades">([\d.]+)</g;
  ALL.forEach((c) => {
    const out = EOL.scaleSkillText(c.ability.text, c, PTS);
    if (out !== c.ability.text) changed++;
    const S = magsOf(c);
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(out))) {
      tokens++;
      if (!S.has(+m[1])) {
        wrong++;
        if (wrong <= 3) console.log('      scaled a value the engine does not:', c.id, m[1]);
      }
      if (Math.abs(+m[2] - (+m[1] + PTS)) > 0.001) badMath++;
    }
  });
  ok(wrong === 0, 'no number is scaled that the engine leaves alone');
  ok(badMath === 0, 'every scaled number is value + the flat bonus');
  ok(tokens > 90, 'the rewrite reaches the whole roster (' + tokens + ' numbers)');
  ok(changed === ALL.length, 'EVERY legend reflects its upgrades (' + changed + '/' + ALL.length + ')');

  /* The multiplier passives were invisible until 2026-08-16: stored as
     a factor, they never matched a printed percentage, so Athena, Benkei,
     Robin Hood and Lu Bu read as unupgradeable however many levels they
     had. */
  const ath = CARD['olympus-athena'];
  const at = EOL.scaleSkillText(ath.ability.text, ath, PTS);
  ok(/>21</.test(at), "Athena's 15% less damage reads 21% at max");
  ok(/>16</.test(at), '...and her 10% Marked reduction reads 16%');
  const rob = CARD['sherwood-robin-hood'];
  ok(/>18</.test(EOL.scaleSkillText(rob.ability.text, rob, PTS)), "Robin Hood's 12% bonus reads 18%");

  /* THE FLAT RULE, stated once: 50 goes to 52, not 50.75. */
  const anu = CARD['duat-anubis'];
  const an = EOL.scaleSkillText(anu.ability.text, anu, 2);
  ok(/>132</.test(an), 'a 130% coefficient reads 132% at level 1');
  ok(/25% HP/.test(an) && !/>27</.test(an), 'a THRESHOLD never moves');
  ok(/10 Energy/.test(an), 'and neither does an Energy refund');
  const anMax = EOL.scaleSkillText(anu.ability.text, anu, PTS);
  ok(/>136</.test(anMax) && />266</.test(anMax), 'both coefficients move by the same flat points');

  /* Durations and counts are not magnitudes. */
  const morgan = CARD['camelot-morgan-le-fay'];
  const mg = EOL.scaleSkillText(morgan.ability.text, morgan, PTS);
  ok(/for 2 rounds/.test(mg), 'a duration is untouched');
  ok(/>36</.test(mg), "and a debuff's magnitude DEEPENS (30% -> 36%)");

  /* The same number printed twice with different units. */
  const momo = CARD['yamato-momotaro'];
  const mo = EOL.scaleSkillText(momo.ability.text, momo, PTS);
  ok((mo.match(/>18</g) || []).length === 2, "Momotaro's 12% DEF and 12% shield both grow to 18%");
}

/* ---------------- summary ---------------- */
console.log('\n' + '='.repeat(64));
if (fail) {
  console.log(`\x1b[31m${fail} FAILED\x1b[0m / ${pass + fail} assertions`);
  console.log('\nFailures:');
  fails.forEach((f) => console.log('  - ' + f));
} else {
  console.log(`\x1b[32mALL ${pass} ASSERTIONS PASSED\x1b[0m`);
}
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
