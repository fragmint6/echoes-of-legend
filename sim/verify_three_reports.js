/* =============================================================
   THREE PLAYTEST REPORTS
   node sim/verify_three_reports.js
   -------------------------------------------------------------
   1. "Hansel & Gretel survived a hit the indicator called lethal,
       at ~4% HP."
   2. "In Unabridged, the loser of the previous set should start
       the next one."
   3. "The Owned chip layers over the hover card in the elite
       reward picker."

   Report 1 was NOT an engine bug. dealDamage applies Provoke
   recovery BEFORE the blow lands (deliberately - healing after would
   be a hidden death-cheat), so the target's effective pool is larger
   than its HP bar. The PREVIEW did not know that and compared its
   number against hp+shield, so it painted a skull on a blow that
   could not kill. 4% is exactly Hansel & Gretel's healOnHit.

   The engine is therefore left alone; what changes is that
   previewDamage now reports the pool the hit must actually beat.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};

/* ---- engine harness ---- */
global.window = { EOL: {} };
global.performance = { now: () => Date.now() };
require(path.join(ROOT, 'data/_schema.js'));
require(path.join(ROOT, 'data/roles.js'));
['camelot', 'olympus', 'yamato', 'grimmwood', 'duat', 'takamagahara', 'roma', 'huaxia', 'sherwood'].forEach(
  (f) => require(path.join(ROOT, 'data', f + '.js'))
);
require(path.join(ROOT, 'data/battlefields.js'));
require(path.join(ROOT, 'js/engine.js'));
const E = window.EOL.engine;

const ALL = [];
window.EOL.factions.forEach((f) => f.cards.forEach((c) => ALL.push({ card: c, faction: f })));
const byName = (n) => ALL.find((e) => e.card.name === n);

/* =============================================================
   1. THE LETHAL INDICATOR MUST NOT LIE
   ============================================================= */
console.log('\nHANSEL & GRETEL: THE SKULL MUST MEAN DEATH');
{
  const hg = byName('Hansel & Gretel');
  const wolf = byName('Big Bad Wolf');

  /* their card promises this, and it is what the 4% came from */
  const taunt = (hg.card.ability.spec.effects || []).find((e) => e.k === 'taunt');
  ok(!!taunt && taunt.healOnHit === 4, 'their Skill recovers 4% Max HP before each incoming hit');

  function shot(hp, withProvoke) {
    const B = E.createBattle([wolf], [hg], {});
    B.noOpeningLimit = true;
    B.round = 3;
    B.energy = { player: 100, enemy: 100 };
    const me = B.units.find((u) => u.side === 'player');
    const foe = B.units.find((u) => u.side === 'enemy');
    if (withProvoke) {
      foe.flags.taunt = 1;
      foe.flags.tauntHeal = 4;
    }
    foe.hp = hp;
    const pv = E.previewDamage(B, me, wolf.card.ability, foe, 0);
    E.useAbility(B, me, wolf.card.ability, [foe], 0);
    return { pv, died: !foe.alive, left: foe.hp, maxHp: foe.maxHp };
  }

  /* THE REPORTED WINDOW: damage clearly exceeds the HP bar, and they
     live anyway. Every one of these used to show a skull. */
  let lies = 0;
  let survivedInWindow = 0;
  for (let hp = 2050; hp <= 2580; hp += 10) {
    const r = shot(hp, true);
    if (r.pv.lethal !== r.died) lies++;
    if (!r.died && r.pv.dmg > hp) survivedInWindow++;
  }
  ok(survivedInWindow > 0, 'there really is a band where damage beats the HP bar and they live');
  ok(lies === 0, 'and the skull now agrees with the outcome across that whole band');

  /* the specific shape of the complaint */
  const r = shot(2300, true);
  ok(r.pv.dmg > 2300 && !r.died, 'a 2,310 hit into 2,300 HP still leaves them standing');
  ok(!r.pv.lethal, 'the indicator no longer promises a kill there');
  ok(
    Math.round((r.left / r.maxHp) * 1000) / 10 <= 4,
    'they survive on a sliver - about 4%, exactly their recovery'
  );

  /* the preview explains itself */
  ok(r.pv.preHeal === 274, 'the preview reports the 274 HP recovered before the hit');
  ok(r.pv.effectiveHp === 2300 + 274, 'and the real pool the blow has to beat');

  /* lethal is still lethal */
  const kill = shot(1500, true);
  ok(kill.pv.lethal && kill.died, 'a blow that DOES beat the recovery still shows the skull');

  /* ORDINARY TARGETS ARE UNTOUCHED. The fix must not quietly change
     the indicator for the 99% of legends with no pre-hit recovery. */
  let plainLies = 0;
  for (let hp = 1500; hp <= 2600; hp += 10) {
    const p = shot(hp, false);
    if (p.pv.lethal !== p.died) plainLies++;
    if (p.pv.preHeal !== 0) plainLies++;
  }
  ok(plainLies === 0, 'a target with no recovery is previewed exactly as before');

  /* the heal cannot exceed missing HP, so neither can the claim */
  const B = E.createBattle([wolf], [hg], {});
  B.noOpeningLimit = true;
  B.round = 3;
  B.energy = { player: 100, enemy: 100 };
  const foe = B.units.find((u) => u.side === 'enemy');
  foe.flags.taunt = 1;
  foe.flags.tauntHeal = 4;
  foe.hp = foe.maxHp - 50;
  const near = E.previewDamage(B, B.units.find((u) => u.side === 'player'), wolf.card.ability, foe, 0);
  ok(near.preHeal === 50, 'near full HP the reported recovery is capped by the HP actually missing');

  /* Provoke recovery only applies while Provoking - a stale tauntHeal
     with no taunt must not inflate the pool. */
  const B2 = E.createBattle([wolf], [hg], {});
  B2.noOpeningLimit = true;
  B2.round = 3;
  B2.energy = { player: 100, enemy: 100 };
  const f2 = B2.units.find((u) => u.side === 'enemy');
  f2.flags.taunt = 0;
  f2.flags.tauntHeal = 4;
  f2.hp = 2300;
  const noTaunt = E.previewDamage(B2, B2.units.find((u) => u.side === 'player'), wolf.card.ability, f2, 0);
  ok(noTaunt.preHeal === 0, 'recovery is only counted while they are actually Provoking');

  /* the UI must ask the engine, not re-derive the comparison */
  const battle = fs.readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8');
  ok(
    !/pv\.dmg >= [a-z]+\.hp \+ [a-z]+\.shield/.test(battle),
    'battle.js no longer computes lethality from hp+shield behind the engine\u2019s back'
  );
  ok(
    (battle.match(/pv\.lethal/g) || []).length >= 3,
    'both damage chips and the breakdown read pv.lethal'
  );
  ok(/Recovers <b>/.test(battle), 'and the breakdown tells the player about the recovery');
}

/* =============================================================
   2. THE LOSER OPENS THE NEXT GAME
   ============================================================= */
console.log('\nUNABRIDGED: THE LOSER OF THE LAST GAME STARTS THE NEXT');
{
  const play = fs.readFileSync(path.join(ROOT, 'js/play.js'), 'utf8');
  /* slice forward FROM the function, not to the file's first
     'prepAnim = true' - there are three, and the earliest precedes
     this function, which would have produced an empty slice that
     silently passes nothing. */
  const bsgAt = play.indexOf('function beginSetGame');
  const fn = play.slice(bsgAt, play.indexOf('prepAnim = true;', bsgAt));
  ok(/oddFirst:/.test(fn), 'the next set game states who opens instead of re-rolling');
  ok(
    /oddFirst: setState\.lastWinner === 'you' \? 'enemy' : 'player'/.test(fn),
    'and it is the side that LOST the previous game'
  );

  /* the engine end of the contract */
  const six = ALL.slice(0, 6),
    foe = ALL.slice(6, 12);
  ok(E.createBattle(six, foe, { oddFirst: 'player' }).turn === 'player', "oddFirst 'player' opens with you");
  ok(E.createBattle(six, foe, { oddFirst: 'enemy' }).turn === 'enemy', "oddFirst 'enemy' opens with them");

  /* you lost game 1 -> you open game 2 */
  ok(
    E.createBattle(six, foe, { oddFirst: 'player' }).first === 'player',
    'so after losing, the next board opens on your action'
  );

  /* Game 1 keeps its coin flip: there is no previous game to concede
     the opening to, and a fixed opener would hand every set's first
     game to the same side. */
  const g1 = play.slice(play.indexOf('function setBegin'), play.indexOf('function setKill'));
  ok(!/oddFirst/.test(g1), 'game 1 of a set still rolls for the opening');
  let sawPlayer = false,
    sawEnemy = false;
  for (let i = 0; i < 200; i++) {
    const t = E.createBattle(six, foe, {}).turn;
    if (t === 'player') sawPlayer = true;
    else sawEnemy = true;
  }
  ok(sawPlayer && sawEnemy, 'an unspecified opener is still a genuine 50/50');

  /* the loser also picks the board - the new rule matches the old one */
  ok(
    /var loser = setState\.lastWinner === 'you' \? 'foe' : 'you'/.test(play),
    'consistent with the existing rule that the loser calls the next battlefield'
  );
}

/* =============================================================
   3. THE OWNED CHIP MUST NOT COVER THE HOVER CARD
   ============================================================= */
console.log('\nELITE REWARD PICKER: THE HOVER CARD SITS ON TOP');
{
  const { JSDOM } = require('jsdom');
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const dom = new JSDOM(
    '<!doctype html><html><head><style>' +
      css +
      '</style></head><body>' +
      '<div class="grant-choice"><div class="grant-choice-card">' +
      '<div class="grant-choice-grid prep-cards">' +
      '<div class="gc-card-choice is-owned"><span class="gc-owned">Owned</span></div>' +
      '<div class="gc-card-choice sel"></div>' +
      '</div>' +
      '<aside class="flyout grant-choice-flyout"></aside>' +
      '</div></div></body></html>'
  );
  const W = dom.window,
    D = W.document;
  const zOf = (sel) => parseInt(W.getComputedStyle(D.querySelector(sel)).zIndex, 10);

  const chip = zOf('.gc-owned');
  const flyout = zOf('.grant-choice-flyout');
  ok(flyout > chip, 'the hover card paints above the Owned chip (' + flyout + ' > ' + chip + ')');
  ok(
    flyout > 7,
    'and above the selected-tick decoration, which also sat at 7'
  );
  ok(
    W.getComputedStyle(D.querySelector('.gc-owned')).pointerEvents === 'none',
    'the chip still never eats a click'
  );

  /* The Ledger uses the same tile + flyout pattern; it has no chip, but
     its flyout must still clear everything in its own card. */
  const dom2 = new JSDOM(
    '<!doctype html><html><head><style>' +
      css +
      '</style></head><body>' +
      '<div class="ledger"><div class="ledger-card">' +
      '<button class="ledger-close"></button>' +
      '<div class="ledger-body"><div class="ledger-page prep-cards"></div></div>' +
      '<aside class="flyout ledger-flyout"></aside>' +
      '</div></div></body></html>'
  );
  const W2 = dom2.window;
  const lf = parseInt(W2.getComputedStyle(dom2.window.document.querySelector('.ledger-flyout')).zIndex, 10);
  const lc = parseInt(W2.getComputedStyle(dom2.window.document.querySelector('.ledger-close')).zIndex, 10);
  ok(lf > lc, 'the Ledger hover card also clears its own close button (' + lf + ' > ' + lc + ')');
}

console.log('\npass ' + pass + '  fail ' + fail);
process.exit(fail ? 1 : 0);
