/* =============================================================
   Echoes of Legend - LIFETIME STACK CAPS
   -------------------------------------------------------------
   node sim/verify_stacks.js

   "Max: 4 stacks" has to mean four for the WHOLE BATTLE, not four
   at any one instant. It used to mean the latter, which with a
   2-round buff is barely a cap at all: each stack expires, frees its
   slot, and the passive re-earns it. Red Riding Hood reached a
   13,000 shield in a live match against a real opponent.

   Two bugs, both fixed:
     1. addBuff counted only buffs currently held. It now counts
        every stack ever granted, via unit.stackTotals.
     2. Her shield rider carried NO stackTag at all, so while ATK and
        Crit stopped at 4 the shield never stopped.

   The team here deliberately contains no other shield-granters, so
   the only thing feeding her shield is her own passive. (Apollo and
   Guinevere shielding her is legitimate and would mask the bug.)
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
const CARD = {};
EOL.factions.forEach((f) => f.cards.forEach((c) => (CARD[c.id] = c)));
const ent = (id) => ({ card: CARD[id], faction: CARD[id].faction });
let f = 0;
const t = (ok, m) => {
  if (!ok) f++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + m);
};

// Red Riding Hood + allies attacking debuffed enemies, many times
/* deliberately NO other shield-granters on the team, so the only
   source of her shield is her own passive */
const mine = [
  'grimmwood-red-riding-hood',
  'camelot-morgan-le-fay',
  'olympus-medusa',
  'camelot-mordred',
  'grimmwood-pied-piper',
  'sherwood-will-scarlet',
].map(ent);
const foes = [
  'hemithea-hercules',
  'camelot-mordred',
  'huaxia-mulan',
  'olympus-medusa',
  'grimmwood-pied-piper',
  'sherwood-will-scarlet',
].map(ent);
const B = E.createBattle(mine, foes, { roleAware: true, simulation: true });
B.noOpeningLimit = true;
const rrh = B.units.find((u) => u.card.id === 'grimmwood-red-riding-hood');
const maxShield = Math.round(rrh.maxHp * 0.1) * 4;

// simulate MANY ally-attacks-debuffed-enemy triggers across many rounds
for (let round = 0; round < 12; round++) {
  B.units
    .filter((u) => u.side === 'enemy')
    .forEach((u) => {
      u.flags.exposed = 2;
    });
  for (let i = 0; i < 6; i++) {
    const ally = B.units.filter((u) => u.side === 'player' && u.alive)[i % 6];
    const foe = B.units.filter((u) => u.side === 'enemy' && u.alive)[0];
    if (!ally || !foe) break;
    B.energy.player = 150;
    try {
      E.useAbility(B, ally, E.roleAbility(ally), [foe]);
    } catch (e) {}
    foe.hp = foe.maxHp; // keep them alive so triggers keep firing
  }
  E.nextRound(B); // buffs expire here - the old bug freed the slots
}
const crit = rrh.buffs.filter((b) => b.tag === 'hunters-courage-crit').length;
const atk = rrh.buffs.filter((b) => b.tag === 'hunters-courage-atk').length;
const tot = rrh.stackTotals || {};
console.log('  lifetime stacks granted:', JSON.stringify(tot));
console.log('  shield:', Math.round(rrh.shield), ' theoretical max (4 x 10% maxHP):', maxShield);
t(
  (tot['hunters-courage-crit'] || 0) <= 4,
  'crit stacks capped at 4 for the whole battle (got ' + (tot['hunters-courage-crit'] || 0) + ')'
);
t(
  (tot['hunters-courage-atk'] || 0) <= 4,
  'atk stacks capped at 4 for the whole battle (got ' + (tot['hunters-courage-atk'] || 0) + ')'
);
t(
  (tot['hunters-courage-shield'] || 0) <= 4,
  'shield grants capped at 4 (got ' + (tot['hunters-courage-shield'] || 0) + ')'
);
t(
  rrh.shield <= maxShield + 1,
  'shield cannot exceed ' + maxShield + ' (got ' + Math.round(rrh.shield) + ')'
);
t(rrh.shield < 13000, 'nowhere near the 13,000 seen in the live game');

/* =============================================================
   ROSTER-WIDE: every card whose note promises a stack cap
   -------------------------------------------------------------
   Red Riding Hood was found by playtesting, which means the next
   one would be too. This drives EVERY maxStacks passive far past
   its cap and asserts the engine actually holds the line, so the
   whole class is covered rather than the one card that got caught.
   ============================================================= */
console.log('\n  --- roster-wide stack caps ---');
{
  const ALL = [];
  EOL.factions.forEach((fac) => fac.cards.forEach((c) => ALL.push(c)));
  const effectsOf = (c) => {
    const a = c.ability;
    const eff = (a.passive && a.passive.effects) || (a.spec && a.spec.effects) || [];
    const flat = [];
    (function walk(l) {
      (l || []).forEach((e) => {
        if (!e) return;
        flat.push(e);
        if (e.then) walk(e.then);
        if (e.other) walk(e.other);
        if (e.effects) walk(e.effects);
      });
    })(eff);
    return flat;
  };
  const capped = ALL.filter((c) => effectsOf(c).some((e) => e.maxStacks));
  t(capped.length >= 8, 'found the capped-stack cards to check (' + capped.length + ')');

  const FOES = [
    'hemithea-hercules',
    'camelot-mordred',
    'huaxia-mulan',
    'olympus-medusa',
    'grimmwood-pied-piper',
    'sherwood-will-scarlet',
  ];
  capped.forEach((c) => {
    const ids = [
      c.id,
      'camelot-guinevere',
      'olympus-apollo',
      'camelot-king-arthur',
      'sherwood-little-john',
      'yamato-momotaro',
    ];
    const team = ids
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .slice(0, 6)
      .map(ent);
    while (team.length < 6) team.push(ent('grimmwood-snow-white'));
    const BB = E.createBattle(team, FOES.map(ent), { roleAware: true, simulation: true });
    BB.noOpeningLimit = true;
    const me = BB.units.find((u) => u.card.id === c.id);
    if (!me) return;
    for (let r = 0; r < 14; r++) {
      BB.units
        .filter((u) => u.side === 'enemy')
        .forEach((u) => {
          u.flags.exposed = 2;
          u.hp = u.maxHp;
        });
      for (let i = 0; i < 6; i++) {
        const ally = BB.units.filter((u) => u.side === 'player' && u.alive)[i % 6];
        const foe = BB.units.filter((u) => u.side === 'enemy' && u.alive)[0];
        if (!ally || !foe) break;
        BB.energy.player = 150;
        try {
          E.useAbility(BB, ally, ally.card.ability, [foe]);
        } catch (e) {}
        try {
          E.useAbility(BB, ally, E.roleAbility(ally), [foe]);
        } catch (e) {}
      }
      E.nextRound(BB);
    }
    effectsOf(c)
      .filter((e) => e.stackTag && e.maxStacks)
      .forEach((e) => {
        const used = (me.stackTotals || {})[e.stackTag] || 0;
        t(
          used <= e.maxStacks,
          c.name + ': ' + e.stackTag + ' <= ' + e.maxStacks + ' (got ' + used + ')'
        );
      });
    const byStat = {};
    me.buffs.forEach((b) => {
      byStat[b.stat] = (byStat[b.stat] || 0) + b.amt;
    });
    Object.keys(byStat).forEach((st) => {
      t(
        Math.abs(byStat[st]) <= 100,
        c.name + ': ' + st + ' total stays sane (' + byStat[st] + '%)'
      );
    });
  });
}

console.log(f ? '\n== ' + f + ' FAILED ==' : '\n== ALL PASSED ==');
process.exit(f ? 1 : 0);
