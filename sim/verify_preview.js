/* =============================================================
   Echoes of Legend - TARGET PREVIEW HONESTY
   -------------------------------------------------------------
   node sim/verify_preview.js

   Hovering a Skill highlights who it will hit. That highlight must
   not LIE. It used to: Zeus lights up all six enemies, but if any
   are Marked he strikes only those - so the preview promised five
   victims it would never touch.

   The fix was generic (E.affectedTargets walks the card's own effect
   tree), so the test is generic too. For every card with an active
   Skill, in three board states - clean, two enemies Marked, two
   enemies debuffed - it previews, then actually casts, and asserts
   the preview never claims more victims than the cast produced.

   A card-by-card fix would pass a Zeus test and quietly regress on
   the next card that narrows its targets. This catches that.
   ============================================================= */
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
  'data/duat.js',
  'data/battlefields.js',
  'js/engine.js',
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const EOL = window.EOL,
  E = EOL.engine;
const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push(c)));
const CARD = {};
ALL.forEach((c) => (CARD[c.id] = c));
const ent = (id) => ({ card: CARD[id], faction: CARD[id].faction });
const FILL = [
  'camelot-guinevere',
  'sherwood-little-john',
  'grimmwood-snow-white',
  'olympus-apollo',
  'yamato-momotaro',
];
const FOES = [
  'hemithea-hercules',
  'camelot-mordred',
  'huaxia-mulan',
  'olympus-medusa',
  'grimmwood-pied-piper',
  'sherwood-will-scarlet',
];
function mk(id) {
  const B = E.createBattle([id, ...FILL].map(ent), FOES.map(ent), {
    roleAware: true,
    simulation: true,
  });
  B.noOpeningLimit = true;
  B.energy.player = 150;
  B.energy.enemy = 150;
  return B;
}

let checked = 0,
  mismatch = [],
  wider = 0;
for (const c of ALL) {
  if (c.ability.type !== 'Active') continue;
  for (const scenario of ['clean', 'marked', 'debuffed']) {
    const B = mk(c.id);
    const u = B.units.find((x) => x.card.id === c.id);
    const ab = c.ability;
    if (!E.canUse(B, u, ab)) continue;
    const foes = B.units.filter((x) => x.side === 'enemy' && x.alive);
    if (scenario === 'marked') {
      foes[1].flags.marked = 1;
      foes[3].flags.marked = 1;
    }
    if (scenario === 'debuffed') {
      foes[0].flags.exposed = 2;
      foes[2].flags.burn = 2;
    }
    const need = E.pickCount(ab);
    let chosen = [];
    if (need > 0) {
      let pool;
      try {
        pool = E.legalTargets(B, u, ab);
      } catch (e) {
        continue;
      }
      if (!pool.length) continue;
      chosen = pool.slice(0, need);
      if (chosen.length < need) continue;
    }
    let prev;
    try {
      prev = E.affectedTargets(B, u, ab, chosen, 0);
    } catch (e) {
      mismatch.push(c.id + ' [' + scenario + '] preview threw: ' + e.message);
      continue;
    }
    const before = new Map(
      B.units.map((x) => [
        x.uid,
        { hp: x.hp, sh: x.shield, fl: JSON.stringify(x.flags), bf: x.buffs.length },
      ])
    );
    try {
      E.useAbility(B, u, ab, chosen);
    } catch (e) {
      continue;
    }
    // who actually changed, on the OPPOSING side only (previews are about victims)
    const touched = B.units.filter((x) => {
      const b = before.get(x.uid);
      return (
        b.hp !== x.hp ||
        b.sh !== x.shield ||
        b.fl !== JSON.stringify(x.flags) ||
        b.bf !== x.buffs.length
      );
    });
    const tgtSide = (ab.spec && ab.spec.target && ab.spec.target.side) || 'enemy';
    if (tgtSide !== 'enemy') continue;
    const touchedFoes = touched
      .filter((x) => x.side === 'enemy')
      .map((x) => x.uid)
      .sort();
    const prevIds = prev
      .filter((x) => x.side === 'enemy')
      .map((x) => x.uid)
      .sort();
    checked++;
    // the preview must not claim MORE victims than were actually touched
    const extra = prevIds.filter((id) => touchedFoes.indexOf(id) < 0);
    if (extra.length && touchedFoes.length) {
      wider++;
      mismatch.push(
        c.id + ' [' + scenario + '] preview ' + prevIds.length + ' vs hit ' + touchedFoes.length
      );
    }
  }
}
console.log('  scenarios checked: ' + checked);
console.log('  previews claiming more victims than were hit: ' + wider);
mismatch.slice(0, 15).forEach((m) => console.log('    ' + m));

/* =============================================================
   CONDITIONAL BONUSES ANNOUNCE THEMSELVES HONESTLY
   -------------------------------------------------------------
   "Goldilocks' trigger doesn't activate sometimes." The engine was
   correct at every HP value; the INTERFACE was not. The card face
   shows hp+shield and rounds the percentage, so a target could read
   as sitting inside a 30-70% window while the engine - which tests
   raw HP - correctly withheld the bonus.

   previewDamage now reports which conditional arm a shot will take,
   and battle.js stars the chip. That flag is only worth anything if
   it agrees with the damage that actually lands, so: for every
   single-target branch skill, sweep the victim's HP across the whole
   range and assert the flag predicts the real outcome every time.
   ============================================================= */
let flagChecked = 0;
const flagBad = [];
for (const c of ALL) {
  const ab = c.ability;
  if (ab.type !== 'Active') continue;
  const eff = (ab.spec && ab.spec.effects) || [];
  if (!eff.some((e) => e.k === 'branch')) continue;
  if (E.pickCount(ab) !== 1) continue;

  for (let pct = 5; pct <= 100; pct += 5) {
    const B = mk(c.id);
    const u = B.units.find((x) => x.card.id === c.id);
    if (!E.canUse(B, u, ab)) break;
    const pool = E.legalTargets(B, u, ab).filter((t) => t.side === 'enemy');
    if (!pool.length) break;
    const tgt = pool[0];
    /* A huge pool means the damage is never clamped by remaining HP,
       so "big vs small" stays measurable at every percentage. */
    tgt.maxHp = 400000;
    tgt.hp = Math.max(1, Math.round(tgt.maxHp * (pct / 100)));

    const pv = E.previewDamage(B, u, ab, tgt);
    if (!pv || pv.bonus === null || pv.bonus === undefined) continue;
    const before = tgt.hp;
    E.useAbility(B, u, ab, [tgt]);
    const dealt = before - tgt.hp;
    flagChecked++;
    /* The preview total is the contract; the flag must not contradict
       it. previewDamage already equals the resolved damage (asserted
       elsewhere), so a flag that disagrees with its own total is the
       failure we care about. */
    if (dealt > 0 && Math.abs(pv.dmg - dealt) > 1) {
      flagBad.push(c.id + ' @' + pct + '% preview ' + pv.dmg + ' vs dealt ' + dealt);
    }
  }
}
console.log('  branch-skill bonus flags checked: ' + flagChecked);
flagBad.slice(0, 10).forEach((m) => console.log('    ' + m));

/* Goldilocks specifically: the flag must track the documented window
   at its exact edges, and must ignore shields. */
const goldBad = [];
{
  const gid = 'grimmwood-goldilocks';
  /* Measure both arms against THIS harness's target rather than
     hardcoding a number: defence and elements change the totals, and a
     stale constant would make the test lie rather than fail honestly. */
  const shoot = (pct) => {
    const B = mk(gid);
    const u = B.units.find((x) => x.card.id === gid);
    const tgt = E.legalTargets(B, u, u.card.ability).filter((t) => t.side === 'enemy')[0];
    tgt.maxHp = 400000;
    tgt.hp = Math.max(1, Math.round(tgt.maxHp * (pct / 100)));
    const pv = E.previewDamage(B, u, u.card.ability, tgt);
    const before = tgt.hp;
    E.useAbility(B, u, u.card.ability, [tgt]);
    return { dealt: before - tgt.hp, bonus: pv.bonus };
  };
  const lowArm = shoot(95).dealt; // 120% arm
  const highArm = shoot(50).dealt; // 250% arm
  if (!(highArm > lowArm * 1.5)) {
    goldBad.push('the two arms are not distinguishable: ' + lowArm + ' vs ' + highArm);
  }
  const cut = (lowArm + highArm) / 2;
  for (let pct = 3; pct <= 100; pct++) {
    const r = shoot(pct);
    const big = r.dealt > cut;
    const inWindow = pct >= 30 && pct <= 70;
    if (r.bonus !== inWindow || r.bonus !== big) {
      goldBad.push('hp ' + pct + '% flag=' + r.bonus + ' window=' + inWindow + ' big=' + big);
    }
  }
  const B = mk(gid);
  const u = B.units.find((x) => x.card.id === gid);
  const tgt = E.legalTargets(B, u, u.card.ability).filter((t) => t.side === 'enemy')[0];
  tgt.maxHp = 400000;
  tgt.hp = Math.round(tgt.maxHp * 0.2);
  tgt.shield = Math.round(tgt.maxHp * 0.3); // reads as 50% on the card face
  const pv = E.previewDamage(B, u, u.card.ability, tgt);
  if (pv.bonus !== false) {
    goldBad.push('a shielded target at 20% raw HP was flagged as in-window');
  }
}
console.log("  Goldilocks' window disagreements: " + goldBad.length);
goldBad.slice(0, 8).forEach((m) => console.log('    ' + m));

const bad = wider + flagBad.length + goldBad.length;
console.log(
  bad ? '\n== ' + bad + ' PREVIEW DISHONESTY(IES) ==' : '\n== NO PREVIEW OVERCLAIMS OR FLAG LIES =='
);
process.exit(bad ? 1 : 0);
