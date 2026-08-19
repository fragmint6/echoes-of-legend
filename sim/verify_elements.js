#!/usr/bin/env node
'use strict';

/* =============================================================
   THE WHEEL OF SEVEN - elements are mechanical (2026-08-19)
   node sim/verify_elements.js
   -------------------------------------------------------------
   The wheel is the fairness law: seven elements in a cycle, each
   sears one and bows to one, advantage 1.08 / disadvantage 1/1.08
   (exact reciprocals). This suite holds it to that contract:

     A. the table itself - one prey and one predator each
     B. the reciprocity law - the two halves cancel exactly
     C. the damage pipeline applies it (real casts)
     D. the preview is honest - the hover IS the dealt number
     E. the AI prices the matchup
     F. the mirror stays deterministic (pure function of state)

   Every other suite runs WITH the wheel live: their damage
   assertions are ratio- or same-pair-based (the wheel cancels out),
   and verify_all's damage model includes the wheel factor. THIS
   suite is where the matchup math itself is pinned.
   ============================================================= */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + msg);
  } else {
    fail++;
    console.log('  FAIL  ' + msg);
  }
}

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
  'data/kami.js',
  'data/duat.js',
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
].forEach((f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const EOL = window.EOL;
const E = EOL.engine;

const ALL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push({ card: c, faction: f })));
const g = (id) => {
  const e = ALL.find((x) => x.card.id === id);
  if (!e) throw new Error('unknown card ' + id);
  return e;
};
const FOES = [
  g('camelot-merlin'),
  g('olympus-athena'),
  g('roma-cicero'),
  g('duat-horus'),
  g('yamato-benkei'),
  g('grimmwood-cinderella'),
];
const FILLER = [g('camelot-king-arthur'), g('olympus-zeus'), g('roma-brutus')];

function battle(team, foes, opts) {
  const B = E.createBattle(team, foes || FOES, {
    roleAware: false,
    rng: () => 0.5,
    oddFirst: 'player',
    ...(opts || {}),
  });
  B.silent = true;
  B.round = 3;
  B.energy.player = 150;
  B.energy.enemy = 150;
  return B;
}
/* a six-card enemy board with one of each wheel-relevant element */
function elementBoard() {
  const pick = (el, exclude) =>
    ALL.find(
      (x) =>
        x.card.element === el &&
        x.card.role !== 'Tank' &&
        (!exclude || exclude.indexOf(x.card.id) < 0)
    );
  return [
    pick('Nature'),
    pick('Fire'),
    pick('Magic'),
    pick('Light'),
    pick('Shadow'),
    pick('Lightning') || pick('Physical'),
  ].filter(Boolean);
}
const unit = (B, id) => B.units.find((u) => u.card.id === id);

console.log('A. the table: seven elements, one prey and one predator each');
{
  const els = Object.keys(E.ELEMENT_BEATS);
  ok(els.length === 7, 'seven elements in the cycle');
  const preys = new Set(Object.values(E.ELEMENT_BEATS));
  ok(preys.size === 7, 'seven distinct prey - a perfect cycle, no orphan');
  els.forEach((el) => {
    const prey = E.ELEMENT_BEATS[el];
    ok(prey && prey !== el, el + ' sears exactly one other element (' + prey + ')');
    const predators = els.filter((x) => E.ELEMENT_BEATS[x] === el);
    ok(predators.length === 1, el + ' bows to exactly one predator (' + predators[0] + ')');
  });
  /* the authored lore cycle, stated once and held */
  ok(E.ELEMENT_BEATS.Fire === 'Nature', 'Fire sears Nature');
  ok(E.ELEMENT_BEATS.Nature === 'Lightning', 'Nature grounds Lightning');
  ok(E.ELEMENT_BEATS.Lightning === 'Physical', 'Lightning strikes the body');
  ok(E.ELEMENT_BEATS.Physical === 'Magic', 'the blade cuts the spell');
  ok(E.ELEMENT_BEATS.Magic === 'Shadow', 'the word binds the shadow');
  ok(E.ELEMENT_BEATS.Shadow === 'Light', 'the shadow eclipses the Light');
  ok(E.ELEMENT_BEATS.Light === 'Fire', 'the sun outshines the flame');
}

console.log('B. the reciprocity law - the two halves cancel exactly');
{
  ok(Math.abs(E.ELEMENT_ADV - 1.08) < 1e-9, 'advantage is exactly 1.08');
  ok(
    Math.abs(E.ELEMENT_DIS * E.ELEMENT_ADV - 1) < 1e-9,
    'disadvantage is the exact reciprocal (' + E.ELEMENT_DIS.toFixed(6) + ')'
  );
  Object.keys(E.ELEMENT_BEATS).forEach((a) => {
    const b = E.ELEMENT_BEATS[a];
    ok(
      Math.abs(E.elementMult(a, b) * E.elementMult(b, a) - 1) < 1e-9,
      a + ' vs ' + b + ': advantage and disadvantage cancel exactly'
    );
  });
  ok(E.elementMult('Fire', 'Magic') === 1, 'a neutral matchup multiplies by exactly 1');
  ok(E.elementMult('Physical', 'Physical') === 1, 'a mirror matchup is neutral');
  ok(E.elementMult('Fire', undefined) === 1 && E.elementMult(undefined, 'Fire') === 1, 'unknown elements are neutral - the wheel never breaks a card');
}

console.log('C. the damage pipeline applies the wheel');
{
  /* Fire attacker, Nature victim: the wheel's cleanest pair. */
  const board = elementBoard();
  /* pick a Bruiser whose SIGNATURE deals the element - passives and
     cross-element actives would muddy the matchup */
  const sigBruiser = (el) =>
    ALL.find(
      (x) =>
        x.card.role === 'Bruiser' &&
        x.card.ability &&
        x.card.ability.type === 'Active' &&
        x.card.ability.spec &&
        ((x.card.ability.spec.effects || [])[0] || {}).element === el
    );
  const fireCard = sigBruiser('Fire');
  const B = battle([fireCard, ...FILLER, g('camelot-guinevere'), g('sherwood-little-john')], board);
  const src = unit(B, fireCard.card.id);
  /* use the FIRE signature - the basic is Physical damage, and the
     wheel reads the damage's element, not the card's */
  const ab = src.card.ability;
  ok(ab.spec.effects[0].element === 'Fire', 'the test signature deals Fire damage');
  const victims = B.units.filter((u) => u.side === 'enemy');
  const nature = victims.find((u) => u.element === 'Nature');
  const neutral = victims.find((u) => u.element === 'Magic');
  ok(!!nature && !!neutral, 'the test board has a Nature victim and a neutral Magic victim');
  /* Both previews first - the signature self-buffs ATK per cast, so a
     preview taken mid-sequence would read a different attacker. */
  const pNature = E.previewDamage(B, src, ab, nature).dmg;
  const pNeutral = E.previewDamage(B, src, ab, neutral).dmg;
  const ratio = pNature / pNeutral;
  const want = E.ELEMENT_ADV * (1 - E.defOf(nature) / 100) / (1 - E.defOf(neutral) / 100);
  ok(
    Math.abs(ratio / want - 1) < 0.02,
    'a Fire hit on Nature previews at exactly 1.08x the neutral matchup (ratio ' + ratio.toFixed(3) + ')'
  );
  /* Cast each blow in its own fresh battle so the self-buff cannot
     drift the comparison, and the dealt numbers must agree with the
     previews (no double-count, no drift). */
  const mk = () =>
    battle([fireCard, ...FILLER, g('camelot-guinevere'), g('sherwood-little-john')], board);
  const Bn = mk();
  const srcN = unit(Bn, fireCard.card.id);
  const natN = Bn.units.find((u) => u.side === 'enemy' && u.element === 'Nature');
  const h1 = natN.hp;
  E.useAbility(Bn, srcN, ab, [natN]);
  const dNature = h1 - natN.hp;
  const Bm = mk();
  const srcM = unit(Bm, fireCard.card.id);
  const neuM = Bm.units.find((u) => u.side === 'enemy' && u.element === 'Magic');
  const h2 = neuM.hp;
  E.useAbility(Bm, srcM, ab, [neuM]);
  const dNeutral = h2 - neuM.hp;
  ok(dNature > 0 && dNeutral > 0, 'both blows land');
  ok(
    Math.abs(dNature - pNature) <= 1 && Math.abs(dNeutral - pNeutral) <= 1,
    'the real casts land what the previews promised (' + dNature + '/' + pNature + ', ' + dNeutral + '/' + pNeutral + ')'
  );
  /* the weak half: Nature attacking Fire */
  const natureCard = sigBruiser('Nature');
  const B2 = battle([natureCard, ...FILLER, g('camelot-guinevere'), g('sherwood-little-john')], board);
  const src2 = unit(B2, natureCard.card.id);
  const ab2 = src2.card.ability;
  ok(ab2.spec.effects[0].element === 'Nature', 'the weak-half signature deals Nature damage');
  const fire2 = B2.units.find((u) => u.side === 'enemy' && u.element === 'Fire');
  const neutral2 = B2.units.find((u) => u.side === 'enemy' && u.element === 'Magic');
  const rWeak = E.previewDamage(B2, src2, ab2, fire2).dmg;
  const rNeutral = E.previewDamage(B2, src2, ab2, neutral2).dmg;
  const wantWeak =
    E.ELEMENT_DIS * (1 - E.defOf(fire2) / 100) / (1 - E.defOf(neutral2) / 100);
  ok(
    Math.abs(rWeak / rNeutral / wantWeak - 1) < 0.02,
    'Nature on Fire previews at exactly the reciprocal disadvantage'
  );
}

console.log('D. the preview is honest - the hover IS the dealt number');
{
  const sigBruiserD = (el) =>
    ALL.find(
      (x) =>
        x.card.role === 'Bruiser' &&
        x.card.ability &&
        x.card.ability.type === 'Active' &&
        x.card.ability.spec &&
        ((x.card.ability.spec.effects || [])[0] || {}).element === el
    );
  const fireCard = sigBruiserD('Fire');
  const B = battle([fireCard, ...FILLER, g('camelot-guinevere'), g('sherwood-little-john')], elementBoard());
  const src = unit(B, fireCard.card.id);
  const abD = src.card.ability;
  const nature = B.units.find((u) => u.side === 'enemy' && u.element === 'Nature');
  const pv = E.previewDamage(B, src, abD, nature);
  const hp0 = nature.hp;
  E.useAbility(B, src, abD, [nature]);
  const dealt = hp0 - nature.hp;
  ok(
    Math.abs(pv.dmg - dealt) <= 1 || Math.abs(pv.dmg - dealt) <= dealt * 0.01,
    'the preview matches the dealt damage with the wheel on (' + pv.dmg + ' vs ' + dealt + ')'
  );
  /* and the working-out NAMES the element factor, so the player can
     see WHY the number is what it is */
  const elStep = pv.hits[0].steps.filter((s) => s.k === 'element')[0];
  ok(
    !!elStep && Math.abs(elStep.mult - E.ELEMENT_ADV) < 1e-9 && /Nature/.test(elStep.label),
    'the breakdown shows the element advantage row (' + (elStep ? elStep.label + ' x' + elStep.mult : 'none') + ')'
  );
}

console.log('E. the AI prices the matchup');
{
  /* A Fire attacker choosing between an equal-stats Nature target and
     a neutral target must prefer the prey, all else held equal. */
  const sigBruiserE = (el) =>
    ALL.find(
      (x) =>
        x.card.role === 'Bruiser' &&
        x.card.ability &&
        x.card.ability.type === 'Active' &&
        x.card.ability.spec &&
        ((x.card.ability.spec.effects || [])[0] || {}).element === el
    );
  const fireCard = sigBruiserE('Fire');
  const B = battle([fireCard, ...FILLER, g('camelot-guinevere'), g('sherwood-little-john')], elementBoard());
  const src = unit(B, fireCard.card.id);
  const nature = B.units.find((u) => u.side === 'enemy' && u.element === 'Nature');
  const neutral = B.units.find((u) => u.side === 'enemy' && u.element === 'Magic');
  /* force identical stats so the wheel is the ONLY difference */
  const stats = { hp: nature.hp, maxHp: nature.maxHp, baseDef: nature.baseDef };
  neutral.hp = nature.hp;
  neutral.maxHp = nature.maxHp;
  neutral.baseDef = nature.baseDef;
  neutral.buffs = nature.buffs.slice();
  const cands = EOL.ai.candidates(B, src.side);
  const fireCand = cands.filter((c) => c.unit.uid === src.uid && c.ability === src.card.ability);
  ok(fireCand.length > 0, 'the AI generates candidate actions for the attacker');
  const targetScore = (tgt) => {
    const c = fireCand.filter((cand) => cand.targets && cand.targets[0] === tgt)[0];
    return c ? c.score : -Infinity;
  };
  ok(
    targetScore(nature) > targetScore(neutral),
    'with equal stats, the AI prefers the element prey (' +
      targetScore(nature) +
      ' vs ' +
      targetScore(neutral) +
      ')'
  );
}

console.log('F. determinism and neutrality bookkeeping');
{
  /* elementMult is a pure function of the two elements - the mirror
     lock and the sim can both trust it. */
  const a = E.elementMult('Shadow', 'Light');
  const b = E.elementMult('Shadow', 'Light');
  ok(a === b && a === E.ELEMENT_ADV, 'elementMult is pure and deterministic');
  /* every shipped card's element exists on the wheel */
  const orphans = ALL.filter((x) => !E.ELEMENT_BEATS[x.card.element]);
  ok(orphans.length === 0, 'every shipped element sits on the wheel' + (orphans.length ? ' (' + orphans.map((o) => o.card.element).join(', ') + ')' : ''));
  /* counter-strikes flow through the same pipeline: Guan Yu is
     Physical, so a Magic attacker striking him eats the wheel too */
  const B = battle([g('huaxia-guan-yu'), g('huaxia-hua-tuo'), g('huaxia-zhuge-liang'), ...FILLER]);
  const gy = unit(B, 'huaxia-guan-yu');
  E.useAbility(B, gy, gy.card.ability, []);
  const magicFoe = B.units.find((u) => u.side === 'enemy' && u.element === 'Magic');
  const foeHp0 = magicFoe.hp;
  E.useAbility(B, magicFoe, E.roleAbility(magicFoe), [gy]);
  const counterHit = magicFoe.hp < foeHp0;
  ok(counterHit, 'a counter-strike still lands with the wheel wired');
}

console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
