#!/usr/bin/env node
'use strict';

/* =============================================================
   FACTION AUDIT - mechanical review of every card in the roster
   -------------------------------------------------------------
   WHY THIS EXISTS

   Seven new factions (49 legends) were designed in chat across
   several turns, and the owner caught three separate classes of
   error that a machine should have caught first:

     1. Damage budgets 30% above the game's ceiling, while heal
        values sat at HALF the weakest shipped healer.
     2. Two cards (Odysseus, Loki) with byte-identical effects.
     3. Stat/энергy values 2x the shipped precedent.

   Every one of those is checkable against data that already
   exists in data/*.js. Reviewing 49 cards by eye is exactly the
   kind of work that should not be done by eye.

   This tool reads the WHOLE roster - shipped and new alike - and
   reports:

     A. Damage budget      (multiplier x targets) / cost x 10
     B. Raw stats          against the role bands in
                           docs/CharacterGuidelines.md
     C. Ability power      against the per-role guidance table
     D. Heal / shield      against the shipped range
     E. Energy swings      against the shipped range
     F. Uniqueness         effect-signature collisions
     G. Uncapped stacks    growth effects with no `note` cap

   It is a REPORT, not a gate: several shipped cards are
   deliberately outside a band (Zeus at budget 0.87, Sun Wukong's
   revive). The job is to make every exception VISIBLE and
   deliberate, so a new card is never accidentally the strongest
   thing in the game.

   Usage:
     node sim/audit_factions.js            # whole roster
     node sim/audit_factions.js --new      # only the new factions
     node sim/audit_factions.js --quiet    # findings only
   ============================================================= */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const ARGV = process.argv.slice(2);
const ONLY_NEW = ARGV.includes('--new');
const QUIET = ARGV.includes('--quiet');

/* The seven factions added in this pass. Kept as a list rather than a
   flag on the faction so the audit needs no cooperation from data. */
const NEW_FACTIONS = [
  'asgard',
  'hemithea',
  'pandemonium',
  'devas',
  'genesis',
  'transylvania',
  'tortuga',
];

global.window = global;
global.document = {
  body: { dataset: {} },
  getElementById() {
    return null;
  },
  addEventListener() {},
};
global.location = { search: '' };
global.EOL = {};

const DATA = [
  'data/_schema.js',
  'data/roles.js',
  'data/camelot.js',
  'data/olympus.js',
  'data/yamato.js',
  'data/grimmwood.js',
  'data/sherwood.js',
  'data/huaxia.js',
  'data/roma.js',
  'data/kami.js',
  'data/duat.js',
];
/* New faction files are optional so the audit runs before they exist. */
for (const id of NEW_FACTIONS) {
  const rel = 'data/' + id + '.js';
  if (fs.existsSync(path.join(ROOT, rel))) DATA.push(rel);
}
for (const rel of DATA) {
  (0, eval)(fs.readFileSync(path.join(ROOT, rel), 'utf8') + `\n//# sourceURL=${rel}`);
}

/* ---- reference bands, from docs/CharacterGuidelines.md ------------ */
const STAT_BANDS = {
  Tank: { hp: [6800, 7600], atk: [950, 1100], def: [28, 32] },
  Bruiser: { hp: [5500, 6500], atk: [1450, 1750], def: [20, 25] },
  Caster: { hp: [4700, 5000], atk: [1850, 2050], def: [14, 18] },
  Controller: { hp: [4800, 5800], atk: [1150, 1400], def: [16, 20] },
  Medic: { hp: [4600, 5000], atk: [950, 1100], def: [18, 22] },
  Sniper: { hp: [4300, 4600], atk: [1700, 2000], def: [10, 15] },
};

/* Per-role signature damage guidance. `null` = damage is not this
   role's job and any direct multiplier is worth a look. */
const POWER_GUIDE = {
  Sniper: [1.45, 2.6],
  Caster: [0.5, 1.3],
  Bruiser: [1.5, 2.0],
  Tank: [0, 0.85],
  Controller: [0.6, 1.1],
  Medic: [0, 0.0],
};

/* Zeus is the documented ceiling AND the documented exception: 60 EN,
   and he needs Marks already on the board to pay off. He is excluded by
   name rather than by raising the bar for everyone. */
const BUDGET_MAX = 0.87;
const BUDGET_EXEMPT = { Zeus: 1.3 };
const BUDGET_BAND = [0.3, 0.8];

const findings = [];
function flag(sev, card, msg) {
  findings.push({ sev, card, msg });
}

/* ---- effect tree walking ----------------------------------------- */
const BRANCHES = ['effects', 'then', 'other', 'heads', 'tails', 'choose'];
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, fn));
    return;
  }
  if (node.k) fn(node);
  BRANCHES.forEach((b) => {
    if (node[b]) walk(node[b], fn);
  });
}

function collect(card) {
  const out = [];
  const spec = card.ability && card.ability.spec;
  if (!spec) return out;
  walk(spec.effects, (e) => out.push(e));
  if (spec.choose) walk(spec.choose, (e) => out.push(e));
  return out;
}

/* How many legends does this skill actually deliver to? `choose`
   branches are alternatives, not additions, so the widest branch is the
   honest number rather than their sum. */
function targetCount(card) {
  const spec = card.ability && card.ability.spec;
  if (!spec) return 1;
  const t = spec.target || {};
  if (t.side === 'self') return 1;
  if (t.pick === 'two') return 2;
  if (t.pick === 'single') return 1;
  if (t.pick === 'all') {
    const eff = collect(card);
    /* An effect-level `take` limiter means the skill sweeps the board to
       CHOOSE, then delivers to N. Envy targets 'all' but damages only the
       single highest-ATK enemy; counting six made him look like a 1.20
       budget monster when he is really 0.20. Use the widest take among
       the damage effects. */
    const dmgTakes = eff
      .filter((e) => e.k === 'dmg' && e.take && e.take.n)
      .map((e) => e.take.n);
    if (dmgTakes.length) return Math.max(...dmgTakes);
    /* `onlyMarked` is a board-state filter, not a fixed count. Marks are
       scarce and the caster usually supplies them, so three is the
       realistic spread rather than a full six. */
    if (eff.some((e) => e.k === 'dmg' && e.onlyMarked)) return 3;
    /* A row-restricted 'all' hits at most three, not six. */
    if (eff.some((e) => e.frontOnly || e.backOnly)) return 3;
    if (t.row === 'front' || t.row === 'back') return 3;
    return 6;
  }
  return 1;
}

const cards = [];
(EOL.factions || []).forEach((f) => {
  (f.cards || []).forEach((c) => {
    cards.push({ card: c, faction: f });
  });
});

const scope = cards.filter(
  ({ faction }) => !ONLY_NEW || NEW_FACTIONS.includes(faction.id)
);

/* ================= A. DAMAGE BUDGET ================= */
const budgets = [];
scope.forEach(({ card }) => {
  const a = card.ability;
  if (!a || a.type !== 'Active' || !a.cost) return;
  const eff = collect(card);
  const dmg = eff.filter((e) => e.k === 'dmg' && e.power);
  if (!dmg.length) return;
  const top = Math.max(...dmg.map((e) => e.power));
  const n = targetCount(card);
  const budget = (top * n) / a.cost * 10;
  budgets.push({ name: card.name, role: card.role, budget, top, n, cost: a.cost });
  if (BUDGET_EXEMPT[card.name] && budget <= BUDGET_EXEMPT[card.name] + 0.01) {
    /* known, documented outlier - reported in the table, not as a finding */
  } else if (budget > BUDGET_MAX) {
    flag(
      'ERROR',
      card.name,
      `budget ${budget.toFixed(2)} exceeds the shipped ceiling ${BUDGET_MAX} (Zeus)`
    );
  } else if (budget > BUDGET_BAND[1]) {
    flag('WARN', card.name, `budget ${budget.toFixed(2)} above the ${BUDGET_BAND[1]} band top`);
  }
});

/* ================= B. RAW STATS ================= */
scope.forEach(({ card }) => {
  const band = STAT_BANDS[card.role];
  if (!band || !card.stats) return;
  ['hp', 'atk', 'def'].forEach((k) => {
    const v = card.stats[k];
    const [lo, hi] = band[k];
    if (v < lo || v > hi) {
      flag('WARN', card.name, `${card.role} ${k} ${v} outside band ${lo}-${hi}`);
    }
  });
});

/* ================= C. ABILITY POWER BY ROLE ================= */
scope.forEach(({ card }) => {
  const guide = POWER_GUIDE[card.role];
  if (!guide) return;
  const eff = collect(card);
  const dmg = eff.filter((e) => e.k === 'dmg' && e.power);
  if (!dmg.length) return;
  const top = Math.max(...dmg.map((e) => e.power));
  const [lo, hi] = guide;
  if (card.role === 'Medic' && top > 0) {
    flag('WARN', card.name, `Medic deals ${Math.round(top * 100)}% direct damage (guide: 0%)`);
  } else if (hi > 0 && top > hi) {
    flag(
      'WARN',
      card.name,
      `${card.role} power ${Math.round(top * 100)}% above role guide ${Math.round(hi * 100)}%`
    );
  }
});

/* ================= D. HEAL / SHIELD RANGE ================= */
/* Bounds measured from the shipped roster rather than invented: heals
   run 8-35% Max HP, shields 12-22%. A value far outside that is either
   a typo or a card that will distort the healing economy. */
const HEAL_RANGE = [8, 35];
const SHIELD_RANGE = [10, 25];
scope.forEach(({ card }) => {
  collect(card).forEach((e) => {
    if (e.k === 'heal' && e.pctMaxHp) {
      if (e.pctMaxHp < HEAL_RANGE[0] || e.pctMaxHp > HEAL_RANGE[1]) {
        flag(
          'WARN',
          card.name,
          `heal ${e.pctMaxHp}% Max HP outside shipped range ${HEAL_RANGE.join('-')}%`
        );
      }
    }
    if (e.k === 'shield' && e.pctMaxHp) {
      if (e.pctMaxHp < SHIELD_RANGE[0] || e.pctMaxHp > SHIELD_RANGE[1]) {
        flag(
          'WARN',
          card.name,
          `shield ${e.pctMaxHp}% Max HP outside shipped range ${SHIELD_RANGE.join('-')}%`
        );
      }
    }
  });
});

/* ================= E. ENERGY SWINGS ================= */
/* Zhuge Liang drains 15, the largest shipped. Anything materially
   above that is a new economy, not a new card. */
const ENERGY_MAX = 15;
scope.forEach(({ card }) => {
  collect(card).forEach((e) => {
    const amt = e.amt || e.amount;
    if ((e.k === 'drainEnergy' || e.k === 'energy') && amt > ENERGY_MAX) {
      flag('WARN', card.name, `${e.k} ${amt} exceeds the shipped max ${ENERGY_MAX} (Zhuge Liang)`);
    }
  });
});

/* ================= F. UNIQUENESS ================= */
/* The signature deliberately ignores NUMBERS and keeps structure:
   two cards that both "Silence 1 enemy for 1 round and drain energy"
   are the same card even at different costs. That is the collision the
   owner spotted between Odysseus and Loki. */
function signature(card) {
  const a = card.ability;
  const spec = a.spec || {};
  const t = spec.target || {};
  const shape = collect(card)
    .map((e) => {
      const bits = [e.k];
      if (e.to) bits.push('to:' + e.to);
      if (e.stat) bits.push('stat:' + e.stat);
      if (e.element) bits.push('el:' + e.element);
      return bits.join(',');
    })
    .sort()
    .join(' | ');
  return [a.type, t.side || '-', t.pick || '-', shape].join(' || ');
}

const bySig = {};
cards.forEach(({ card, faction }) => {
  const s = signature(card);
  if (!s.endsWith('|| ')) {
    (bySig[s] = bySig[s] || []).push({ name: card.name, faction: faction.id });
  }
});
Object.keys(bySig).forEach((s) => {
  const group = bySig[s];
  if (group.length < 2) return;
  /* Only report if at least one side is in scope. */
  if (ONLY_NEW && !group.some((g) => NEW_FACTIONS.includes(g.faction))) return;
  flag(
    'ERROR',
    group.map((g) => g.name).join(' = '),
    'identical effect signature: ' + s.slice(0, 90)
  );
});

/* Duplicate skill names, which the guidelines forbid outright. */
const byName = {};
cards.forEach(({ card }) => {
  const n = (card.ability && card.ability.name) || '';
  (byName[n] = byName[n] || []).push(card.name);
});
Object.keys(byName).forEach((n) => {
  if (byName[n].length > 1) {
    flag('ERROR', byName[n].join(' = '), `duplicate skill name "${n}"`);
  }
});

/* ================= G. UNCAPPED GROWTH ================= */
/* `maxStacks` is a LIFETIME cap and exists because Red Riding Hood
   once produced a 13,000 shield. A permanent/stacking effect with
   neither a cap nor a `note` explaining the bound is the same bug
   waiting to happen. */
scope.forEach(({ card }) => {
  const a = card.ability;
  const note = (a && a.note) || '';
  const capped = /max|once|per round|per battle/i.test(note);
  collect(card).forEach((e) => {
    const permanent = e.k === 'stat' && !e.turns;
    const stacking = !!e.stackTag && !e.maxStacks;
    if ((permanent || stacking) && !capped) {
      flag(
        'WARN',
        card.name,
        `${e.k}${e.stat ? ' ' + e.stat : ''} grows with no cap and no bounding note`
      );
    }
  });
});

/* ================= REPORT ================= */
const label = ONLY_NEW ? 'NEW FACTIONS' : 'FULL ROSTER';
console.log('='.repeat(64));
console.log(`FACTION AUDIT - ${label} - ${scope.length} legends`);
console.log('='.repeat(64));

if (!QUIET && budgets.length) {
  budgets.sort((a, b) => b.budget - a.budget);
  console.log('\nDamage budget, highest first  [(mult x targets) / cost x 10]');
  budgets.slice(0, 12).forEach((b) => {
    const bar = b.budget > BUDGET_MAX ? ' <-- OVER CEILING' : b.budget > 0.8 ? ' <-- high' : '';
    console.log(
      `  ${b.budget.toFixed(2).padStart(5)}  ${String(Math.round(b.top * 100)).padStart(4)}% x${b.n} @${String(b.cost).padStart(3)}  ${b.role.padEnd(11)} ${b.name}${bar}`
    );
  });
  const vals = budgets.map((b) => b.budget).sort((a, b) => a - b);
  console.log(
    `  median ${vals[Math.floor(vals.length / 2)].toFixed(2)}   max ${vals[vals.length - 1].toFixed(2)}   n=${vals.length}`
  );
}

const errors = findings.filter((f) => f.sev === 'ERROR');
const warns = findings.filter((f) => f.sev === 'WARN');

console.log(`\nFindings: ${errors.length} error(s), ${warns.length} warning(s)`);
if (errors.length) {
  console.log('\nERRORS (must fix)');
  errors.forEach((f) => console.log(`  x ${f.card}: ${f.msg}`));
}
if (warns.length) {
  console.log('\nWARNINGS (deliberate exceptions allowed - check each)');
  warns.forEach((f) => console.log(`  ! ${f.card}: ${f.msg}`));
}
console.log('');
process.exit(errors.length ? 1 : 0);
