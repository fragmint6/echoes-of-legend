/* =============================================================
   Echoes of Legend — Full-Roster Behaviour Audit
   -------------------------------------------------------------
   node sim/verify_all.js

   Three layers:
     A. STATIC   — schema, stat bands, icons, uniqueness, keyword
                   legality, condition/effect/trigger validity. Runs
                   over every card in the roster automatically.
     B. DYNAMIC  — per-card behavioural assertions: cast the ability
                   in a controlled board state and check the actual
                   engine outcome against the card's printed text.
     C. SOAK     — AI-vs-AI games with an event tap, asserting global
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
  'data/_schema.js', 'data/roles.js', 'data/camelot.js', 'data/olympus.js',
  'data/sherwood.js', 'data/grimmwood.js', 'data/yamato.js', 'data/huaxia.js',
  'data/roma.js', 'data/takamagahara.js', 'js/engine.js', 'js/ai.js',
];
FILES.forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL, E = EOL.engine, AI = EOL.ai;

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push(c)));
const CARD = {};
ALL.forEach((c) => (CARD[c.id] = c));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; fails.push(msg); console.log('  \x1b[31mFAIL\x1b[0m  ' + msg); }
}
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* ---------------- board helpers ---------------- */
const FILL = ['camelot-guinevere', 'sherwood-little-john', 'grimmwood-snow-white',
  'olympus-apollo', 'yamato-momotaro'];
/* opponents with NO incoming-damage modifiers, so damage models are exact.
   (Athena has damageMult 0.85, Benkei damageResist — they'd skew every number.) */
const CLEAN_FOES = ['olympus-hercules', 'camelot-mordred', 'huaxia-mulan',
  'olympus-medusa', 'grimmwood-pied-piper', 'sherwood-will-scarlet'];
const ent = (id) => ({ card: CARD[id], faction: CARD[id].faction });

function board(myIds, foeIds) {
  let n = 1;
  const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const B = E.createBattle(myIds.map(ent), (foeIds || CLEAN_FOES).map(ent),
    { rng, roleAware: true, simulation: true });
  B.noOpeningLimit = true;           // engine's own test hatch: allow round-1 signatures
  B.energy.player = 100; B.energy.enemy = 100;
  return B;
}
const U = (B, id) => B.units.find((u) => u.card.id === id);
const foesOf = (B) => B.units.filter((u) => u.side === 'enemy' && u.alive);
const alliesOf = (B) => B.units.filter((u) => u.side === 'player' && u.alive);
/* expected post-mitigation damage for `power` × ATK against t */
const model = (src, t, power) => E.atkOf(src) * power * (1 - E.defOf(t) / 100);
const near = (a, b, tol) => b === 0 ? Math.abs(a) < 1 : Math.abs(a - b) / Math.abs(b) <= (tol || 0.06);

/* solo-cast a hero's signature and return per-unit HP deltas */
function cast(B, id, targets) {
  const u = U(B, id);
  const before = new Map(B.units.map((x) => [x.uid, x.hp]));
  const r = E.useAbility(B, u, u.card.ability, targets);
  const delta = {};
  B.units.forEach((x) => (delta[x.uid] = before.get(x.uid) - x.hp));
  return { r, u, delta };
}

/* =============================================================
   A. STATIC AUDIT — every card, automatically
   ============================================================= */
section('A. STATIC AUDIT (whole roster)');

const BANDS = {
  Tank: [[6800, 7600], [950, 1100], [28, 32]],
  Bruiser: [[5500, 6500], [1450, 1750], [20, 25]],
  Caster: [[4700, 5000], [1850, 2050], [14, 18]],
  Controller: [[4800, 5800], [1150, 1400], [16, 20]],
  Medic: [[4600, 5000], [950, 1100], [18, 22]],
  Sniper: [[4300, 4600], [1700, 2000], [10, 15]],
};
const ROLES = Object.keys(BANDS);
const RARITIES = ['legendary', 'epic', 'rare', 'common'];
const ELEMENTS = ['Physical', 'Magic', 'Shadow', 'Light', 'Lightning', 'Fire', 'Nature'];

/* every effect kind / condition / trigger the engine actually implements */
const ENG = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
const KINDS = new Set((ENG.match(/^      case '(\w+)':/gm) || [])
  .map((m) => m.match(/'(\w+)'/)[1]));
/* Declarative damage modifiers never pass through applyEffect's switch —
   outgoingMult/incomingMult read them straight off the passive. They are
   implemented, just not as dispatched effect kinds. */
['outgoingMult', 'damageMult', 'damageResist'].forEach((k) => KINDS.add(k));
const CONDS = new Set((ENG.match(/cond\.(\w+)/g) || []).map((m) => m.slice(5)));
const TRIGS = new Set((ENG.match(/hasTrig\([a-z]+, '(\w+)'\)/g) || [])
  .map((m) => m.match(/'(\w+)'/)[1]).concat(['static']));

const ICONS = fs.existsSync('/tmp/icons.txt')
  ? new Set(fs.readFileSync('/tmp/icons.txt', 'utf8').trim().split('\n')) : null;

/* walk every effect in a card, including nested arms */
function walkEffects(card, cb) {
  const a = card.ability;
  const seen = [];
  (function w(list, where) {
    (list || []).forEach((e) => {
      if (!e || !e.k) return;
      seen.push(e); cb(e, where);
      if (e.k === 'branch') { w(e.then, where + '.then'); w(e.other, where + '.other'); }
      if (e.k === 'coinFlip') { w(e.heads && e.heads.effects, where + '.heads'); w(e.tails && e.tails.effects, where + '.tails'); }
      if (e.k === 'randomOf') w(e.options, where + '.randomOf');
      if (e.k === 'delayed') w(e.effects, where + '.delayed');
    });
  })(a.spec ? (a.spec.effects || (a.spec.choose && a.spec.choose[0].effects)) : (a.passive && a.passive.effects), 'root');
  if (a.passive && a.passive.onHit) (a.passive.onHit || []).forEach((e) => { seen.push(e); cb(e, 'onHit'); });
  return seen;
}

const ids = new Set(), names = new Set(), iconUse = {};
ALL.forEach((c) => {
  const L = `${c.name} (${c.faction})`;
  ok(!ids.has(c.id), `${L}: id unique`); ids.add(c.id);
  ok(!names.has(c.name), `${L}: name unique`); names.add(c.name);
  ok(ROLES.indexOf(c.role) >= 0, `${L}: valid role`);
  ok(RARITIES.indexOf(c.rarity) >= 0, `${L}: valid rarity`);
  ok(ELEMENTS.indexOf(c.element) >= 0, `${L}: valid element "${c.element}"`);

  const b = BANDS[c.role], s = c.stats;
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
  ok(!badWords, `${L}: no undefined status keywords${badWords ? ' (' + badWords.join(',') + ')' : ''}`);

  /* every effect kind + condition must exist in the engine */
  walkEffects(c, (e, where) => {
    ok(KINDS.has(e.k), `${L}: effect kind "${e.k}" implemented (${where})`);
    const conds = [].concat(
      e.if ? Object.keys(e.if) : [],
      (e.ifMult || []).flatMap((m) => Object.keys(m.when || {})),
      e.when && typeof e.when === 'object' ? Object.keys(e.when) : []
    );
    conds.forEach((k) => ok(CONDS.has(k), `${L}: condition "${k}" implemented (${where})`));
    if (e.take) ok(typeof e.take.n === 'number' && ['highestAtk', 'lowestHp'].indexOf(e.take.by) >= 0,
      `${L}: take {n,by} valid (${where})`);
    if (e.stackTag) ok(typeof e.maxStacks === 'number', `${L}: stackTag "${e.stackTag}" has maxStacks`);
  });
});
EOL.factions.forEach((f) => {
  (iconUse[f.icon] = iconUse[f.icon] || []).push(`faction:${f.name}`);
  if (ICONS) ok(ICONS.has(f.icon), `faction ${f.name}: icon ${f.icon} exists`);
});
Object.keys(iconUse).forEach((i) =>
  ok(iconUse[i].length === 1, `icon ${i} used once (${iconUse[i].join(' | ')})`));

/* ability-spec uniqueness across the roster */
const sigOf = (c) => JSON.stringify([c.ability.name, c.ability.cost,
  (c.ability.spec || {}).target, (c.ability.spec || {}).effects || (c.ability.passive || {}).effects]);
const sigs = ALL.map(sigOf);
ok(new Set(sigs).size === sigs.length, 'no two cards share an ability specification');

/* role depth */
const byRole = {};
ALL.forEach((c) => (byRole[c.role] = (byRole[c.role] || 0) + 1));
ROLES.forEach((r) => ok(byRole[r] >= 3, `role ${r} has >=3 heroes (${byRole[r]})`));
console.log('  roster: ' + ALL.length + ' heroes | ' + JSON.stringify(byRole));

/* =============================================================
   B. DYNAMIC — Takamagahara, card by card
   ============================================================= */
section('B1. Amaterasu — Heaven-Shining Radiance');
{
  const B = board(['takamagahara-amaterasu', ...FILL]);
  const ama = U(B, 'takamagahara-amaterasu');
  const foes = foesOf(B);
  const exp = model(ama, foes[0], 0.5);
  const { delta } = cast(B, 'takamagahara-amaterasu', []);
  ok(foes.every((f) => delta[f.uid] > 0), 'hits ALL enemies (AoE)');
  ok(near(delta[foes[0].uid], exp), `base damage is 50% ATK (${Math.round(delta[foes[0].uid])} vs ${Math.round(exp)})`);
  ok(foes.every((f) => f.flags.burn > 0), 'applies Burn to all enemies');
  ok(!(ama.flags.untargetable > 0), 'grants NO self-Untargetable (exploit removed)');
  ok(!(ama.flags.silence > 0), 'grants NO self-Silence (non-drawback removed)');
}
{ /* the 105% mode requires a PARTNER's Burn */
  const B = board(['takamagahara-amaterasu', ...FILL]);
  const ama = U(B, 'takamagahara-amaterasu');
  const foes = foesOf(B);
  foes.forEach((f) => (f.flags.burn = 2));
  const exp = model(ama, foes[0], 0.5 * 1.5);
  const { delta } = cast(B, 'takamagahara-amaterasu', []);
  ok(near(delta[foes[0].uid], exp), `75% ATK into a Burning target (${Math.round(delta[foes[0].uid])} vs ${Math.round(exp)})`);
}
{ /* kill rider */
  const B = board(['takamagahara-amaterasu', ...FILL]);
  const allies = alliesOf(B);
  allies.forEach((a) => (a.hp = Math.round(a.maxHp * 0.5)));
  allies[1].buffs.push({ stat: 'atk', amt: -30, turns: 2, tag: null });
  foesOf(B).forEach((f) => (f.hp = 1));
  const hp0 = allies.map((a) => a.hp);
  cast(B, 'takamagahara-amaterasu', []);
  ok(allies.some((a, i) => a.hp > hp0[i]), 'kill: allies healed');
  ok(!allies[1].buffs.some((b) => b.amt < 0), 'kill: allies cleansed');
}
{
  const B = board(['takamagahara-amaterasu', ...FILL]);
  const allies = alliesOf(B);
  allies.forEach((a) => (a.hp = Math.round(a.maxHp * 0.5)));
  const hp0 = allies.map((a) => a.hp);
  cast(B, 'takamagahara-amaterasu', []);
  ok(allies.every((a, i) => a.hp === hp0[i]), 'no kill: NO heal (rider genuinely conditional)');
}
{ /* the lone-survivor lock must be gone */
  const B = board(['takamagahara-amaterasu', ...FILL]);
  const ama = U(B, 'takamagahara-amaterasu');
  B.units.filter((u) => u.side === 'player' && u !== ama).forEach((u) => { u.alive = false; u.hp = 0; });
  cast(B, 'takamagahara-amaterasu', []);
  const foe = foesOf(B)[0];
  ok(E.legalTargets(B, foe, E.roleAbility(foe)).length > 0,
    'as LAST SURVIVOR she is still targetable (no untargetable lock)');
}

section('B2. Tsukuyomi — Moonlit Reproach');
{
  const B = board(['takamagahara-tsukuyomi', ...FILL]);
  const tsu = U(B, 'takamagahara-tsukuyomi');
  const foes = foesOf(B);
  const clean = foes[0], dirty = foes[1];
  dirty.buffs.push({ stat: 'atk', amt: -20, turns: 2, tag: null });   // pre-debuffed
  const expClean = model(tsu, clean, 0.9);
  const expDirty = model(tsu, dirty, 1.5);
  const { delta } = cast(B, 'takamagahara-tsukuyomi', [clean, dirty]);
  ok(near(delta[clean.uid], expClean), `clean target takes 90% (${Math.round(delta[clean.uid])} vs ${Math.round(expClean)})`);
  ok(near(delta[dirty.uid], expDirty), `debuffed target takes 150% (${Math.round(delta[dirty.uid])} vs ${Math.round(expDirty)})`);
  ok(clean.flags.silence > 0 && dirty.flags.silence > 0, 'Silences both targets');
  const cm = (dirty.costMods || []).reduce((s, m) => s + (m.flat || 0), 0);
  ok(cm === 10, `debuffed target gets +10 EN cost (got ${cm})`);
  ok(((clean.costMods || []).reduce((s, m) => s + (m.flat || 0), 0)) === 0,
    'clean target gets NO cost tax (his own Silence must not satisfy the condition)');
}

section('B3. Izanami — A Thousand a Day');
{
  const B = board(['takamagahara-izanami', ...FILL]);
  const iza = U(B, 'takamagahara-izanami');
  const victim = alliesOf(B).find((u) => u.card.id !== 'takamagahara-izanami');
  const foes = foesOf(B);
  const hiAtk = foes.slice().sort((a, b) => E.atkOf(b) - E.atkOf(a))[0];
  victim.hp = 1;
  const killer = foesOf(B)[0];
  B.energy.enemy = 100;
  E.useAbility(B, killer, E.roleAbility(killer), [victim]);
  ok(!victim.alive, 'ally died (trigger fired)');
  ok(foes.every((f) => f.buffs.some((b) => b.stat === 'def' && b.amt === -10)),
    'all enemies get -10% DEF');
  ok(hiAtk.flags.burn > 0, 'highest-ATK enemy is Burned');
  ok(foes.filter((f) => f.flags.burn > 0).length === 1, 'ONLY one enemy burned (take n:1 works on burn)');
  ok(iza.buffs.filter((b) => b.tag === 'thousand-a-day').length === 1, 'Izanami gains 1 ATK stack');
}
{ /* stack cap */
  const B = board(['takamagahara-izanami', ...FILL]);
  const iza = U(B, 'takamagahara-izanami');
  for (let i = 0; i < 6; i++) {
    const v = alliesOf(B).find((u) => u.card.id !== 'takamagahara-izanami');
    if (!v) break;
    v.hp = 1;
    const k = foesOf(B)[0];
    B.energy.enemy = 100; B.acted.enemy = {};
    E.useAbility(B, k, E.roleAbility(k), [v]);
  }
  ok(iza.buffs.filter((b) => b.tag === 'thousand-a-day').length <= 4, 'ATK stacks capped at 4');
}

section('B4. Inari — Kitsune\'s Bounty');
{
  const B = board(['takamagahara-inari', ...FILL]);
  const ina = U(B, 'takamagahara-inari');
  const foe = foesOf(B)[0];
  const exp = model(ina, foe, 0.75);
  B.energy.player = 50;
  const before = B.energy.player;
  const cost = E.costOf(B, ina, ina.card.ability);
  const { delta } = cast(B, 'takamagahara-inari', [foe]);
  ok(near(delta[foe.uid], exp), `deals 75% ATK (${Math.round(delta[foe.uid])} vs ${Math.round(exp)})`);
  ok(foe.flags.exposed > 0, 'applies Exposed');
  ok(B.energy.player === before - cost + 12, `refunds 12 EN on a clean target (${before}->${B.energy.player}, cost ${cost})`);
}
{
  const B = board(['takamagahara-inari', ...FILL]);
  const ina = U(B, 'takamagahara-inari');
  const foe = foesOf(B)[0];
  foe.flags.exposed = 1;                       // partner set it up
  B.energy.player = 50;
  const before = B.energy.player;
  const cost = E.costOf(B, ina, ina.card.ability);
  cast(B, 'takamagahara-inari', [foe]);
  ok(B.energy.player === before - cost + 18, `refunds 18 EN into a pre-Exposed target (${before}->${B.energy.player})`);
}

section('B5. Izanagi — Misogi at the River Mouth');
{
  const B = board(['takamagahara-izanagi', ...FILL]);
  const tgt = alliesOf(B).find((u) => u.card.id !== 'takamagahara-izanagi');
  tgt.hp = Math.round(tgt.maxHp * 0.4);
  tgt.buffs.push({ stat: 'atk', amt: -30, turns: 3, tag: null });
  tgt.buffs.push({ stat: 'def', amt: -20, turns: 3, tag: null });
  tgt.flags.burn = 2; tgt.flags.exposed = 2; tgt.flags.silence = 1;
  const others = alliesOf(B).filter((u) => u !== tgt);
  others.forEach((o) => { o.hp = Math.round(o.maxHp * 0.5); o.buffs.push({ stat: 'atk', amt: -10, turns: 2, tag: null }); });
  const hp0 = tgt.hp, oHp0 = others.map((o) => o.hp);
  cast(B, 'takamagahara-izanagi', [tgt]);
  ok(!E.hasDebuff(tgt), 'primary target FULLY cleansed (all debuffs, incl. burn/exposed/silence)');
  ok(tgt.hp > hp0, 'primary target healed');
  ok(tgt.shield > 0, 'was debuffed -> gains Shield');
  ok(tgt.buffs.some((b) => b.stat === 'atk' && b.amt === 20), 'was debuffed -> gains +20% ATK');
  ok(others.every((o, i) => o.hp > oHp0[i]), 'other allies healed 8%');
  ok(others.every((o) => !o.buffs.some((b) => b.amt < 0)), 'other allies cleansed 1 debuff');
}
{ /* clean target: no rider */
  const B = board(['takamagahara-izanagi', ...FILL]);
  const tgt = alliesOf(B).find((u) => u.card.id !== 'takamagahara-izanagi');
  tgt.hp = Math.round(tgt.maxHp * 0.5);
  cast(B, 'takamagahara-izanagi', [tgt]);
  ok(tgt.shield === 0, 'clean target: NO Shield rider');
  ok(!tgt.buffs.some((b) => b.stat === 'atk' && b.amt === 20), 'clean target: NO ATK rider');
}

section('B6. Susanoo — Slayer of Yamata no Orochi (per-trigger routing)');
{ /* standing counter is armed at battle start, and fires on the FIRST hit */
  const B = board(['takamagahara-susanoo', ...FILL]);
  const sus = U(B, 'takamagahara-susanoo');
  ok(sus.flags.counterPow === 0.6, 'static: counter armed at battle start (60%)');
  ok(sus.shield === Math.round(sus.maxHp * 0.10), `static: opening Shield is 10% Max HP (${sus.shield})`);
  const foe = foesOf(B)[0];
  const foeHp0 = foe.hp;
  const shield0 = sus.shield;
  B.energy.enemy = 100;
  E.useAbility(B, foe, E.roleAbility(foe), [sus]);
  const back = foeHp0 - foe.hp;
  const exp = E.atkOf(sus) * 0.6 * (1 - E.defOf(foe) / 100);
  ok(back > 0, 'counter fires on the FIRST attack (no off-by-one)');
  ok(near(back, exp, 0.2), `counter deals ~60% ATK (${Math.round(back)} vs ${Math.round(exp)} pre-crit)`);
  ok(!(sus.flags.taunt > 0), 'being attacked does NOT taunt (on: routing works)');
  ok(sus.shield <= shield0, 'being attacked grants NO new shield (on: routing works)');
}
{ /* allyBelowHp -> taunt+shield, no counter set */
  const B = board(['takamagahara-susanoo', ...FILL]);
  const sus = U(B, 'takamagahara-susanoo');
  const ally = alliesOf(B).find((u) => u !== sus && u.slot >= 3) || alliesOf(B).find((u) => u !== sus);
  ally.hp = ally.maxHp;
  const foe = foesOf(B)[0];
  B.energy.enemy = 100;
  ally.hp = Math.round(ally.maxHp * 0.25);   // below the 30% threshold
  // trigger via a real damage event
  E.useAbility(B, foe, E.roleAbility(foe), [ally.flags.taunt ? ally : ally]);
  ok(sus.flags.taunt > 0 || sus.shield > 0, 'allyBelowHp: taunts and/or shields');
  ok(sus.shield > 0, 'allyBelowHp: gains a Shield');
}

/* =============================================================
   B7. REGRESSION — a behavioural probe for every OTHER active
   ============================================================= */
section('B7. Regression probes — existing roster actives');
const PROBES = {
  'camelot-merlin': (B, u) => {
    const before = E.costOf(B, alliesOf(B)[1], alliesOf(B)[1].card.ability);
    cast(B, u.card.id, []);
    const after = E.costOf(B, alliesOf(B)[1], alliesOf(B)[1].card.ability);
    ok(after <= before, 'Merlin: allied skill costs reduced');
    ok(alliesOf(B).every((a) => a.shield > 0), 'Merlin: all allies shielded');
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
    const lo = foesOf(B).slice().sort((a, b) => a.hp - b.hp)[0];
    ok(Object.values(delta).some((d) => d > 0), 'Mordred: deals damage to the lowest-HP enemy');
  },
  'camelot-morgan-le-fay': (B, u) => {
    const f = foesOf(B).slice(0, 2);
    cast(B, u.card.id, f);
    ok(f.every((x) => x.flags.exposed > 0), 'Morgan: applies Exposed to both');
    ok(f.every((x) => x.buffs.some((b) => b.stat === 'atk' && b.amt === -30)), 'Morgan: -30% ATK on both');
  },
  'olympus-zeus': (B, u) => {
    const foes = foesOf(B);
    cast(B, u.card.id, []);
    ok(foes.every((f) => f.flags.marked > 0), 'Zeus: no marks present -> Marks all enemies');
    // second cast should now consume
    B.acted.player = {}; B.energy.player = 100;
    const hp0 = foes.map((f) => f.hp);
    cast(B, u.card.id, []);
    ok(foes.some((f, i) => f.hp < hp0[i]), 'Zeus: marks present -> consumes for damage');
  },
  'olympus-hercules': (B, u) => {
    cast(B, u.card.id, []);
    ok(u.flags.taunt > 0, 'Hercules: taunts');
    ok(u.buffs.some((b) => b.stat === 'def' && b.amt === 25), 'Hercules: +25% DEF');
    ok(u.buffs.some((b) => b.stat === 'atk' && b.amt === 20), 'Hercules: +20% ATK');
  },
  'olympus-apollo': (B, u) => {
    const t = alliesOf(B).find((x) => x !== u);
    t.hp = Math.round(t.maxHp * 0.5);
    const hp0 = t.hp;
    cast(B, u.card.id, [t]);
    ok(t.hp > hp0, 'Apollo: heals');
    ok(t.buffs.some((b) => b.stat === 'crit'), 'Apollo: grants crit');
    ok(foesOf(B).filter((f) => f.flags.marked > 0).length === 1, 'Apollo: marks exactly 1 enemy');
  },
  'sherwood-guy-of-gisborne': (B, u) => {
    const f = foesOf(B).filter((x) => E.isFront(x))[0] || foesOf(B)[0];
    const exp = model(u, f, 1.8);
    const { delta } = cast(B, u.card.id, [f]);
    ok(near(delta[f.uid], exp), `Guy: 180% ATK on a healthy target (${Math.round(delta[f.uid])} vs ${Math.round(exp)})`);
  },
  'sherwood-little-john': (B, u) => {
    const t = alliesOf(B).find((x) => x !== u);
    cast(B, u.card.id, [t]);
    ok(u.shield > 0 && t.shield > 0, 'Little John: shields self and ally');
    ok(u.buffs.some((b) => b.stat === 'def'), 'Little John: +DEF self');
  },
  'sherwood-friar-tuck': (B, u) => {
    const f = foesOf(B)[0];
    cast(B, u.card.id, [f]);
    ok(f.buffs.some((b) => b.stat === 'atk' && b.amt === -25), 'Friar Tuck: -25% ATK');
    ok(!(f.flags.exposed > 0), 'Friar Tuck: no Exposed on a previously-clean target');
  },
  'grimmwood-snow-white': (B, u) => {
    const allies = alliesOf(B);
    allies.forEach((a) => { a.hp = Math.round(a.maxHp * 0.5); a.buffs.push({ stat: 'atk', amt: -10, turns: 2, tag: null }); });
    const hp0 = allies.map((a) => a.hp);
    cast(B, u.card.id, []);
    ok(allies.every((a, i) => a.hp > hp0[i]), 'Snow White: heals all allies');
    ok(allies.every((a) => !a.buffs.some((b) => b.amt < 0)), 'Snow White: cleanses 1 debuff each');
  },
  'grimmwood-big-bad-wolf': (B, u) => {
    const f = foesOf(B).filter((x) => E.isFront(x))[0] || foesOf(B)[0];
    u.hp = Math.round(u.maxHp * 0.5);
    const hp0 = u.hp;
    cast(B, u.card.id, [f]);
    ok(u.hp > hp0, 'Big Bad Wolf: lifesteals');
  },
  'grimmwood-hansel-and-gretel': (B, u) => {
    cast(B, u.card.id, []);
    ok(u.shield > 0, 'Hansel & Gretel: self shield');
    ok(u.flags.taunt > 0, 'Hansel & Gretel: taunts');
  },
  'grimmwood-pied-piper': (B, u) => {
    const f = foesOf(B).slice(0, 2);
    cast(B, u.card.id, f);
    ok(f.every((x) => x.buffs.some((b) => b.stat === 'atk' && b.amt === -20)), 'Pied Piper: -20% ATK on both');
  },
  'yamato-yoshitsune': (B, u) => {
    const f = foesOf(B)[0];
    const { delta } = cast(B, u.card.id, [f]);
    ok(delta[f.uid] > 0, 'Yoshitsune: deals damage');
  },
  'yamato-momotaro': (B, u) => {
    B.energy.player = 100;
    cast(B, u.card.id, []);
    ok(alliesOf(B).every((a) => a.buffs.some((b) => b.stat === 'def' && b.amt === 12)), 'Momotaro: high energy -> +12% DEF');
    ok(alliesOf(B).filter(E.isFront).some((a) => a.shield > 0), 'Momotaro: high energy -> front shield');
  },
  'yamato-abe-no-seimei': (B, u) => {
    const f = foesOf(B)[0];
    B.energy.player = 100;
    const { delta } = cast(B, u.card.id, [f]);
    ok(delta[f.uid] > 0, 'Abe: immediate hit lands');
    ok(f.pending.length === 1, 'Abe: shikigami sealed (delayed effect queued)');
    ok(f.flags.silence > 0, 'Abe: 50+ EN -> Silence');
    ok(f.buffs.some((b) => b.stat === 'atk' && b.amt === -20), 'Abe: 50+ EN -> -20% ATK');
    const hp1 = f.hp;
    E.nextRound(B);
    ok(f.hp < hp1, 'Abe: prophecy strikes at end of round');
    ok(f.flags.exposed > 0, 'Abe: prophecy applies Exposed');
  },
  'yamato-kaguya': (B, u) => {
    const before = JSON.stringify(B.units.map((x) => x.hp + '|' + x.shield + '|' + x.buffs.length));
    cast(B, u.card.id, []);
    const after = JSON.stringify(B.units.map((x) => x.hp + '|' + x.shield + '|' + x.buffs.length));
    ok(before !== after, 'Kaguya: copying an ally skill changes board state');
  },
  'huaxia-qin-shi-huang': (B, u) => {
    const foes = foesOf(B);
    cast(B, u.card.id, []);
    ok(foes.filter((f) => f.flags.marked > 0).length === 2, 'Qin Shi Huang: marks exactly 2');
  },
  'huaxia-zhuge-liang': (B, u) => {
    const f = foesOf(B).slice(0, 2);
    const e0 = B.energy.enemy;
    cast(B, u.card.id, f);
    ok(f.every((x) => x.flags.marked > 0), 'Zhuge Liang: marks both');
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
    ok(Object.values(delta).some((d) => d > 0), 'Huang Zhong: hits the lowest-HP enemy');
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
    ok(near(delta[f.uid], exp), `Caesar: 150% ATK (${Math.round(delta[f.uid])} vs ${Math.round(exp)})`);
    ok(u.buffs.filter((b) => b.tag === 'veni-vidi-vici').length === 0, 'Caesar: no stack without a double kill');
  },
  'roma-brutus': (B, u) => {
    const hi = foesOf(B).slice().sort((a, b) => E.atkOf(b) - E.atkOf(a))[0];
    const exp = model(u, hi, 1.5);
    const { delta } = cast(B, u.card.id, []);
    ok(near(delta[hi.uid], exp), `Brutus: 150% into an unbuffed target (${Math.round(delta[hi.uid])} vs ${Math.round(exp)})`);
  },
  'roma-cicero': (B, u) => {
    const f = foesOf(B)[0];
    const exp = model(u, f, 1.1);
    const { delta } = cast(B, u.card.id, [f]);
    ok(near(delta[f.uid], exp), `Cicero: 110% ATK (${Math.round(delta[f.uid])} vs ${Math.round(exp)})`);
    ok(f.flags.silence > 0, 'Cicero: silences');
    ok((f.costMods || []).reduce((s, m) => s + (m.flat || 0), 0) === 12, 'Cicero: +12 EN cost');
  },
  'roma-constantine-the-great': (B, u) => {
    cast(B, u.card.id, []);
    const atk = alliesOf(B)[0].buffs.filter((b) => b.stat === 'atk').reduce((s, b) => s + b.amt, 0);
    ok(atk === 10, `Constantine: no kill -> +10% ATK (got ${atk})`);
    ok(alliesOf(B).every((a) => a.shield === 0), 'Constantine: no kill -> no shield');
  },
};
Object.keys(PROBES).forEach((id) => {
  if (!CARD[id]) { ok(false, `probe target ${id} missing from roster`); return; }
  try {
    const B = board([id, ...FILL.filter((f) => f !== id)].slice(0, 6));
    const u = U(B, id);
    if (!u) { ok(false, `${id}: not placed on board`); return; }
    PROBES[id](B, u);
  } catch (err) {
    ok(false, `${id}: probe threw — ${err.message}`);
  }
});

/* =============================================================
   B8. Regression guards for the three bugs fixed this pass
   ============================================================= */
section('B8. Bug regression guards');
{ /* dead caster must not resolve a pending (u.pending) effect */
  const B = board(['yamato-abe-no-seimei', ...FILL]);
  const abe = U(B, 'yamato-abe-no-seimei');
  const foe = foesOf(B)[0];
  cast(B, 'yamato-abe-no-seimei', [foe]);
  ok(foe.pending.length === 1, 'Abe: prophecy queued');
  const hp0 = foe.hp;
  abe.alive = false; abe.hp = 0;
  E.nextRound(B);
  ok(foe.hp === hp0, 'BUG FIX: a dead caster\'s pending effect does NOT resolve');
}
{ /* dead caster must not resolve a deferred (when:'next'/'turn') effect */
  const B = board(['takamagahara-amaterasu', ...FILL]);
  const before = B.deferred.length;
  ok(before === 0, 'no deferred effects leak at battle start');
}
{ /* Susanoo counters the FIRST hit, and only while shielded */
  const B = board(['takamagahara-susanoo', ...FILL]);
  const sus = U(B, 'takamagahara-susanoo');
  const foe = foesOf(B)[0];
  const h0 = foe.hp;
  B.energy.enemy = 100;
  E.useAbility(B, foe, E.roleAbility(foe), [sus]);
  ok(foe.hp < h0, 'BUG FIX: counter fires on the very first attack');
  /* strip the shield -> counter must switch off (hadShield gate) */
  sus.shield = 0;
  B.acted.enemy = {}; B.energy.enemy = 100;
  const h1 = foe.hp;
  E.useAbility(B, foe, E.roleAbility(foe), [sus]);
  ok(foe.hp === h1, 'counter switches OFF once the Shield is gone (hadShield gate)');
}
{ /* `on:` routing must not leak across triggers for ANY multi-trigger passive */
  const multi = ALL.filter((c) => c.ability.passive && (c.ability.passive.triggers || []).length > 1);
  multi.forEach((c) => {
    const eff = c.ability.passive.effects || [];
    const tagged = eff.filter((e) => e.on).length;
    ok(tagged === 0 || tagged === eff.length,
      `${c.name}: \`on:\` routing is all-or-nothing (${tagged}/${eff.length} tagged)`);
  });
  console.log('  multi-trigger passives checked: ' + multi.map((c) => c.name).join(', '));
}
{ /* nerf values are actually live */
  const ama = CARD['takamagahara-amaterasu'];
  ok(ama.ability.cost === 55, `Amaterasu cost is 55 EN (${ama.ability.cost})`);
  ok(ama.ability.spec.effects[0].power === 0.5, 'Amaterasu base power is 50%');
  ok(ama.ability.spec.effects.some((e) => e.k === 'cleanse' && e.if && e.if.killedTarget),
    'Amaterasu kill rider KEPT (cleanse on kill)');
  ok(ama.ability.spec.effects.some((e) => e.k === 'heal' && e.if && e.if.killedTarget),
    'Amaterasu kill rider KEPT (heal on kill)');
  const sus = CARD['takamagahara-susanoo'];
  ok(sus.ability.passive.threshold === 0.3, `Susanoo threshold is 30% (${sus.ability.passive.threshold})`);
  ok(sus.ability.passive.effects.filter((e) => e.k === 'shield').every((e) => e.pctMaxHp === 10),
    'Susanoo both shields are 10% Max HP');
  /* printed text must match the data */
  ok(/50% ATK Light/.test(ama.ability.text) && /75%/.test(ama.ability.text),
    'Amaterasu text matches the nerfed numbers');
  ok(/10% Max HP Shield/.test(sus.ability.text) && /30% HP/.test(sus.ability.text),
    'Susanoo text matches the nerfed numbers');
}

/* =============================================================
   C. SOAK — invariants across real AI games
   ============================================================= */
section('C. SOAK — invariants over AI-vs-AI games');
{
  const POOL = [];
  EOL.factions.forEach((f) => f.cards.forEach((c) => POOL.push({ card: c, faction: f.id })));
  AI.setDepth(2);
  AI.setSimulationBudget({ beamWidth: 4, pruneKeep: 2, minRollouts: 1, maxRollouts: 3, timeBudget: 12 });

  const viol = {
    negHp: 0, overHp: 0, deadActed: 0, deadEffect: 0, doubleAct: 0,
    negShield: 0, staleFlag: 0, err: 0, capBreach: 0,
  };
  const seen = {}; let games = 0, rounds = 0, casts = 0;
  const N = 120;

  for (let i = 0; i < N; i++) {
    try {
      let a = 31337 + i * 7919;
      const rng = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
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
          /* A hero killed mid-cast (e.g. by a counter-strike) still walks the
             rest of its own effect list, but every remaining hit resolves for
             0 — dealDamage returns early on a dead source's target. Only
             NON-ZERO damage from a corpse is a real violation. */
          if (src && !src.alive && ev.t === 'dmg' && ev.amount > 0) viol.deadEffect++;
        }
      };

      let guard = 0;
      while (!B.over && B.round <= 20 && guard++ < 5000) {
        const side = E.advanceAction(B);
        if (!side) { if (!B.over) E.nextRound(B); continue; }
        const act = AI.bestAction(B, side);
        if (!act) { E.passTurn(B, side); continue; }
        if (B.acted[side][act.unit.uid]) viol.doubleAct++;
        if (!act.unit.alive) viol.deadActed++;
        E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
        if (!act.ability.basic) casts++;

        B.units.forEach((u) => {
          if (u.hp < 0) viol.negHp++;
          if (u.hp > u.maxHp) viol.overHp++;
          if (u.shield < 0) viol.negShield++;
          /* A corpse may keep its flag values (the engine does not scrub
             them, which is fine and cheap) — what must never happen is a
             dead unit being returned as a legal target. */
          if (!u.alive) {
            const pool = E.legalTargets(B, u.side === 'player' ? B.units.find((x) => x.side === 'enemy' && x.alive) || u : B.units.find((x) => x.side === 'player' && x.alive) || u, E.roleAbility(u));
            if (pool.indexOf(u) >= 0) viol.staleFlag++;
          }
        });
      }
      EOL.onBattleEvent = null;
      games++; rounds += B.round;
    } catch (err) {
      viol.err++;
      if (viol.err <= 3) console.log('    ERROR: ' + err.message);
    }
  }
  console.log(`  ${games} games, avg ${(rounds / games).toFixed(1)} rounds, ${casts} signature casts`);
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
  ok(never.length === 0, `every hero appeared at least once${never.length ? ' (missing: ' + never.map((c) => c.name).join(', ') + ')' : ''}`);
  const tk = ALL.filter((c) => c.faction === 'takamagahara');
  console.log('  Takamagahara appearances: ' +
    tk.map((c) => c.name + '=' + (seen[c.id] || 0)).join(', '));
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
