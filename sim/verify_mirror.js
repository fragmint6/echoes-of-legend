/* =============================================================
   Echoes of Legend - MIRROR DETERMINISM CHECK
   -------------------------------------------------------------
   node sim/verify_mirror.js [--games 200] [--seed 4242]

   WHAT THIS PROVES

   In a multiplayer match two machines run the same battle from
   opposite perspectives: what one calls 'player' the other calls
   'enemy'. Only the chosen actions cross the wire; every consequence
   is recomputed locally on both sides.

   That is only safe if the engine is PERSPECTIVE-SYMMETRIC: given
   mirrored inputs it must produce mirrored outputs, action for
   action, hit point for hit point. Any place the engine treats
   'player' and 'enemy' differently - a tie-break that sorts by side,
   an rng draw taken in a different order, a rule keyed to the wrong
   team - shows up here as a divergence.

   HOW

   Build two battles from one squad pair. Battle A is the host's view
   (player = squad 1). Battle B is the guest's view, which is the same
   fight with the teams swapped and `oddFirst` flipped so both agree
   whose action it is. Then replay the identical action stream into
   both, translating each action by (side, idx), and compare a
   perspective-independent checksum after every single action.

   The first mismatch is reported with the action that caused it, so a
   failure names the culprit instead of just saying "desync".
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--'))
    args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
});
const N_GAMES = parseInt(args.games || '200', 10);
const SEED = parseInt(args.seed || '4242', 10);
const ROUND_CAP = 30;
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
  'data/kami.js',
  'data/duat.js',
  'data/battlefields.js',
  'js/engine.js',
  'js/ai.js',
].forEach((f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
const EOL = window.EOL;
const E = EOL.engine;
const AI = EOL.ai;
AI.setDepth(1);
AI.setSimulationBudget({ beamWidth: 3, pruneKeep: 2, rollouts: 2, maxRollouts: 8, timeMs: 30 });

/* deterministic rng, same generator both clients use */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROSTER = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => ROSTER.push({ card: c, faction: f })));

function drawSix(rnd) {
  const pool = ROSTER.slice();
  const team = [];
  const counts = {};
  while (team.length < 6 && pool.length) {
    const i = Math.floor(rnd() * pool.length);
    const e = pool.splice(i, 1)[0];
    const r = e.card.role;
    if ((counts[r] || 0) >= 3) continue;
    counts[r] = (counts[r] || 0) + 1;
    team.push(e);
  }
  return team;
}

/* Perspective-independent board hash. Units are keyed by (side, idx)
   expressed in the HOST's frame, so both views hash identically when
   they agree. */
/* Flags that store a UID, not a value. Uids are page-local, so they
   are translated to the stable (side, idx) name before hashing - the
   relationship is checked, the arbitrary number is not. */
const UID_FLAGS = { counterSrc: 1, burnSrc: 1 };

function checksum(B, hostView) {
  const mine = hostView ? 'player' : 'enemy';
  const theirs = hostView ? 'enemy' : 'player';
  const name = {};
  B.units.forEach((u) => {
    name[u.uid] = (u.side === 'player' ? mine : theirs) + '/' + u.idx;
  });
  const rows = B.units
    .map((u) => {
      const side = u.side === 'player' ? mine : theirs;
      const fl = [];
      for (const k in u.flags) {
        if (!u.flags[k]) continue;
        fl.push(k + '=' + (UID_FLAGS[k] ? name[u.flags[k]] || '?' : u.flags[k]));
      }
      const bf = (u.buffs || [])
        .map((b) => (b.stat || '') + (b.amt != null ? b.amt : '') + ':' + b.turns)
        .sort()
        .join(',');
      return [
        side,
        u.idx,
        u.alive ? 1 : 0,
        Math.round(u.hp),
        Math.round(u.shield),
        u.slot,
        fl.sort().join(','),
        bf,
        u.shieldSrc ? name[u.shieldSrc] || '?' : '',
      ].join(':');
    })
    .sort()
    .join('|');
  const eMine = hostView ? B.energy.player : B.energy.enemy;
  const eTheirs = hostView ? B.energy.enemy : B.energy.player;
  return [B.round, eMine, eTheirs, rows].join('#');
}

/* Per-field diff, so a failure names the exact field that moved
   instead of just reporting two different hashes. */
function rowsOf(B, hostView) {
  const mine = hostView ? 'player' : 'enemy';
  const theirs = hostView ? 'enemy' : 'player';
  const name = {};
  B.units.forEach((u) => {
    name[u.uid] = (u.side === 'player' ? mine : theirs) + '/' + u.idx;
  });
  return B.units
    .map((u) => {
      const fl = {};
      for (const k in u.flags) {
        if (!u.flags[k]) continue;
        fl[k] = UID_FLAGS[k] ? name[u.flags[k]] || '?' : u.flags[k];
      }
      return {
        key: (u.side === 'player' ? mine : theirs) + '/' + u.idx,
        name: u.name,
        alive: u.alive ? 1 : 0,
        hp: Math.round(u.hp),
        shield: Math.round(u.shield),
        slot: u.slot,
        flags: fl,
        buffs: (u.buffs || [])
          .map((b) => (b.stat || '') + (b.amt != null ? b.amt : '') + ':' + b.turns)
          .sort(),
        pending: (u.pending || []).map((p) => p.tag + ':' + p.turns).sort(),
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

function explain(H, G) {
  const a = rowsOf(H, true);
  const b = rowsOf(G, false);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    Object.keys(x).forEach((k) => {
      if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) {
        out.push(
          '        ' +
            x.key +
            ' ' +
            x.name +
            '  ' +
            k +
            ': host=' +
            JSON.stringify(x[k]) +
            '  guest=' +
            JSON.stringify(y[k])
        );
      }
    });
  }
  if (H.energy.player !== G.energy.enemy || H.energy.enemy !== G.energy.player) {
    out.push(
      '        ENERGY host=' + JSON.stringify(H.energy) + ' guest=' + JSON.stringify(G.energy)
    );
  }
  if (H.round !== G.round) out.push('        ROUND host=' + H.round + ' guest=' + G.round);
  return out;
}

/* translate a unit from one battle into the mirrored battle */
function mirrorUnit(Bother, u) {
  const want = u.side === 'player' ? 'enemy' : 'player';
  return Bother.units.find((x) => x.side === want && x.idx === u.idx) || null;
}

function abilityFor(u, slot) {
  return slot === 0 ? u.card.ability : E.roleAbility(u);
}

let games = 0;
let diverged = 0;
const failures = [];

for (let g = 0; g < N_GAMES; g++) {
  const rnd = mulberry32(SEED + g * 7919);
  const teamA = drawSix(rnd);
  const teamB = drawSix(rnd);
  const field = EOL.battlefieldById('colosseum');
  const battleSeed = (SEED + g * 104729) | 0;

  /* HOST view: player = teamA. GUEST view: player = teamB, and
     oddFirst flipped so both agree the host opens round 1. */
  const H = E.createBattle(E.optimizeFormation(teamA), E.optimizeFormation(teamB), {
    roleAware: false,
    field,
    rng: mulberry32(battleSeed),
    oddFirst: 'player',
  });
  const G = E.createBattle(E.optimizeFormation(teamB), E.optimizeFormation(teamA), {
    roleAware: false,
    field,
    rng: mulberry32(battleSeed),
    oddFirst: 'enemy',
  });

  if (checksum(H, true) !== checksum(G, false)) {
    diverged++;
    failures.push({ g, at: 'setup', h: checksum(H, true), gg: checksum(G, false) });
    games++;
    continue;
  }

  let bad = null;
  let steps = 0;
  while (!H.over && H.round <= ROUND_CAP && steps < 400 && !bad) {
    const side = E.advanceAction(H);
    if (!side) {
      if (H.over) break;
      /* advanceAction is not a pure query - it auto-passes any side
         that has nothing legal left, and setTurn ticks Burn. Both
         clocks must therefore be advanced the same number of times or
         the TEST introduces the very asymmetry it is looking for. */
      E.advanceAction(G);
      E.nextRound(H);
      E.nextRound(G);
      if (checksum(H, true) !== checksum(G, false)) {
        bad = { what: 'round rollover -> ' + H.round, diff: explain(H, G) };
      }
      continue;
    }
    /* Keep the guest's clock in step. Its own advanceAction must
       independently arrive at the mirrored side; if it does not, that
       IS the bug we are hunting. */
    const gside = E.advanceAction(G);
    const expect = side === 'player' ? 'enemy' : 'player';
    if (gside !== expect) {
      bad = { what: 'turn order disagreed: host ' + side + ', guest ' + gside };
      break;
    }

    /* AI.bestAction() draws one number from B.rng to seed its rollouts
       (js/ai.js). Only the host runs a bot here, so letting it draw
       from the battle stream would advance the host's luck and not the
       guest's - a divergence created BY the test rather than found by
       it. Lend it a throwaway stream and put the real one back.

       This is not a concern in the live game: in a match neither
       client runs the AI at all. */
    const realRng = H.rng;
    H.rng = mulberry32((battleSeed + steps * 31) | 0);
    const act = AI.bestAction(H, side);
    H.rng = realRng;
    steps++;
    if (!act) {
      E.passTurn(H, side);
      E.passTurn(G, expect);
    } else {
      const slot = act.ability === act.unit.card.ability ? 0 : 1;
      const gUnit = mirrorUnit(G, act.unit);
      const gTargets = (act.chosen || []).map((t) => mirrorUnit(G, t));
      if (!gUnit || gTargets.some((t) => !t)) {
        bad = { what: 'could not mirror ' + act.unit.name + ' / ' + act.ability.name };
        break;
      }
      E.useAbility(H, act.unit, act.ability, act.chosen, act.choose);
      E.useAbility(G, gUnit, abilityFor(gUnit, slot), gTargets, act.choose);
      if (checksum(H, true) !== checksum(G, false)) {
        bad = {
          what: act.unit.name + ' uses ' + act.ability.name,
          card: act.unit.card.id,
          ability: act.ability.name,
          round: H.round,
          diff: explain(H, G),
        };
      }
    }
  }

  games++;
  if (bad) {
    diverged++;
    failures.push(Object.assign({ g }, bad));
  }
}

/* ---------------- report ---------------- */
console.log('');
console.log('================================================================');
console.log('  MIRROR DETERMINISM - ' + games + ' games, seed ' + SEED);
console.log('================================================================');
console.log('  games checked      : ' + games);
console.log('  diverged           : ' + diverged);

if (failures.length) {
  const byCard = {};
  failures.forEach((f) => {
    const k = f.card || f.what;
    byCard[k] = (byCard[k] || 0) + 1;
  });
  console.log('');
  console.log('  divergence sources (most frequent first):');
  Object.keys(byCard)
    .sort((a, b) => byCard[b] - byCard[a])
    .slice(0, 15)
    .forEach((k) => console.log('    ' + String(byCard[k]).padStart(4) + '  ' + k));
  console.log('');
  console.log('  first 5 in detail:');
  failures.slice(0, 5).forEach((f) => {
    const d = f.diff || [];
    const head = Object.assign({}, f);
    delete head.diff;
    console.log('    ' + JSON.stringify(head));
    d.forEach((l) => console.log(l));
  });
  console.log('');
  console.log('\x1b[31m  FAILED: the engine is not perspective-symmetric.\x1b[0m');
  console.log('================================================================');
  process.exit(1);
}

console.log('');
console.log('\x1b[32m  PASSED: mirrored views stayed identical in every game.\x1b[0m');
console.log('================================================================');
