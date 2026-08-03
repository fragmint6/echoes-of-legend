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
  'data/sherwood.js',
  'data/grimmwood.js',
  'data/yamato.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/takamagahara.js',
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
  'olympus-hercules',
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
console.log(wider ? '\n== ' + wider + ' OVERCLAIM(S) ==' : '\n== NO PREVIEW OVERCLAIMS ==');
process.exit(wider ? 1 : 0);
