/* =============================================================
   THE SHIKIGAMI IS VISIBLE
   node sim/verify_shikigami.js
   -------------------------------------------------------------
   Abe no Seimei's Shikigami Prophecy is the roster's only `delayed`
   effect: it seals a paper servant on the target that strikes at the
   END OF THE ROUND. It had no status chip, so from the receiving
   side a legend just took a second, unexplained hit after the turn was
   over - and there was nothing on screen to play around.

   That matters more for this card than most, because being
   telegraphed is its entire design. The rework note in
   data/yamato.js says the payoff is "deliberately back-loaded and
   telegraphed - it can be played around, unlike an instant nuke",
   and the engine backs that up: a dead caster's pending effects do
   not resolve, so killing the diviner before the round ends cancels
   the prophecy. None of that counterplay is discoverable if the
   seal is invisible.

   The chip is driven off u.pending, which already carried the tag,
   the real remaining `turns`, and survives cloning for the AI's
   lookahead. So this is a display fix with no mechanical change -
   asserted below by checking that the damage, the Exposed rider and
   the dead-caster cancel all still behave exactly as before.
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

global.window = { EOL: {} };
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
  'js/text.js',
].forEach((f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
const EOL = window.EOL;
const E = EOL.engine;

const all = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => all.push({ card: c, faction: f.id })));
const ABE = all.filter((e) => e.card.id === 'yamato-abe-no-seimei')[0];
const rest = all.filter((e) => e.card.id !== ABE.card.id);

function freshBattle() {
  const B = E.createBattle([ABE].concat(rest.slice(0, 5)), rest.slice(5, 11), {});
  B.noOpeningLimit = true;
  B.round = 3;
  B.energy = { player: 100, enemy: 100 };
  return B;
}
const casterOf = (B) => B.units.filter((u) => u.card.id === 'yamato-abe-no-seimei')[0];
const foeOf = (B) => B.units.filter((u) => u.side === 'enemy' && u.alive)[0];
const chipOn = (u) => EOL.statusesOf(u, E).filter((s) => s.key === 'shikigami')[0];

/* -------------------------------------------------------------
   1. THE REGISTRY ENTRY
   ------------------------------------------------------------- */
console.log('\n-- the status exists and is well formed --');
{
  const def = EOL.STATUS.shikigami;
  ok(!!def, 'a "shikigami" status is registered');
  ok(def && def.kind === 'debuff', 'it is a debuff, so it renders in the hostile colour');
  ok(def && !!def.label, 'it has a label (' + (def && def.label) + ')');
  ok(def && !!def.desc, 'it has a rule description');
  ok(
    def && /end of the round/i.test(def.desc),
    'the description says WHEN it lands - the whole point of a telegraph'
  );
  ok(
    def && /caster|diviner/i.test(def.desc),
    'and names the counterplay: killing the caster stops it'
  );

  /* Glyph law from js/text.js: every chip wears a unique icon. */
  const icons = Object.keys(EOL.STATUS).map((k) => EOL.STATUS[k].icon);
  const dupes = icons.filter((ic, i) => icons.indexOf(ic) !== i);
  ok(dupes.length === 0, 'every status icon is still unique (no duplicates: ' + dupes + ')');

  /* An icon that is not in the font renders as an empty box. The
     first draft of this used 'ra-paper-lantern', which does not
     exist in RPG-Awesome 0.2.0. */
  const known = [
    'ra-quill-ink',
    'ra-hourglass',
    'ra-scroll-unfurled',
    'ra-uncertainty',
    'ra-rune-stone',
    'ra-crystal-ball',
  ];
  ok(
    def && known.indexOf(def.icon) >= 0,
    'the icon (' + (def && def.icon) + ') is one verified to exist in RPG-Awesome 0.2.0'
  );
}

/* -------------------------------------------------------------
   2. IT APPEARS WHEN THE PROPHECY IS SEALED
   ------------------------------------------------------------- */
console.log('\n-- casting the prophecy raises the chip --');
{
  const B = freshBattle();
  const caster = casterOf(B);
  const target = foeOf(B);

  ok(!chipOn(target), 'no chip before the cast');
  const res = E.useAbility(B, caster, caster.card.ability, [target]);
  ok(res && res.ok, 'Shikigami Prophecy casts');

  const chip = chipOn(target);
  ok(!!chip, 'THE REPORTED GAP: the sealed shikigami now shows a chip');
  ok(chip && chip.turns === 1, 'the chip carries the real clock (' + (chip && chip.turns) + ')');
  ok(
    chip && chip.label === EOL.STATUS.shikigami.label,
    'and the registry label, so the hover panel can explain it'
  );
  ok(
    target.pending.length === 1 && target.pending[0].tag === 'shikigami',
    'the chip is read from u.pending rather than duplicated state'
  );
}

/* -------------------------------------------------------------
   3. IT CLEARS WHEN THE PROPHECY RESOLVES - AND STILL HURTS
   ------------------------------------------------------------- */
console.log('\n-- the prophecy lands, the chip goes --');
{
  const B = freshBattle();
  const caster = casterOf(B);
  const target = foeOf(B);
  E.useAbility(B, caster, caster.card.ability, [target]);

  const hpBefore = target.hp;
  E.nextRound(B);

  ok(target.hp < hpBefore, 'the shikigami still strikes at end of round (mechanics unchanged)');
  ok(target.pending.length === 0, 'the pending effect is consumed');
  ok(!chipOn(target), 'the chip disappears once it has resolved - no ghost status');
  ok(
    EOL.statusesOf(target, E).some((s) => s.key === 'exposed'),
    'and the Exposed rider still applies'
  );
}

/* -------------------------------------------------------------
   4. THE COUNTERPLAY THE CHIP EXISTS TO ADVERTISE
   ------------------------------------------------------------- */
console.log('\n-- killing the diviner cancels the seal --');
{
  const B = freshBattle();
  const caster = casterOf(B);
  const target = foeOf(B);
  E.useAbility(B, caster, caster.card.ability, [target]);
  ok(!!chipOn(target), 'chip is up while the diviner lives');

  caster.alive = false;
  caster.hp = 0;
  const hpBefore = target.hp;
  E.nextRound(B);
  ok(target.hp >= hpBefore, 'a dead diviner means the shikigami never strikes');
}

/* -------------------------------------------------------------
   5. THE BATTLE LOG NO LONGER CALLS IT A MARK
   ------------------------------------------------------------- */
console.log('\n-- the log says what actually happened --');
{
  const B = freshBattle();
  const caster = casterOf(B);
  const target = foeOf(B);
  const before = B.log.length;
  E.useAbility(B, caster, caster.card.ability, [target]);
  const lines = B.log.slice(before).map((l) => l.msg || l.text || '');

  ok(
    lines.some((l) => /shikigami/i.test(l)),
    'the log names the shikigami'
  );
  ok(
    !lines.some((l) => /enemies are marked/i.test(l)),
    'it no longer reports "enemies are marked" - Marked is a different mechanic'
  );
}

/* -------------------------------------------------------------
   6. NO OTHER CARD IS AFFECTED
   ------------------------------------------------------------- */
console.log('\n-- nothing else changed --');
{
  const B = freshBattle();
  const target = foeOf(B);
  ok(
    EOL.statusesOf(target, E).length === 0,
    'a legend with no pending effects still reports no statuses'
  );

  /* The pending loop must not invent chips for untagged delayed
     effects, or a future card gets a blank one for free. */
  target.pending.push({ turns: 2, tag: 'not-a-registered-status', srcUid: 'x', effects: [] });
  ok(
    EOL.statusesOf(target, E).length === 0,
    'an unregistered pending tag renders no chip rather than a blank one'
  );
}

console.log('\n----------------------------------------------');
console.log('  pass ' + pass + '  fail ' + fail);
console.log('----------------------------------------------');
process.exit(fail ? 1 : 0);
