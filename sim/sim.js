/* =============================================================
   Echoes of Legend — AI v AI Balance Simulation Harness
   -------------------------------------------------------------
   node sim/sim.js --games 1500 [--seed 42]

   - Random 12-hero draw per game under the deck rule (max 3 heroes
     per role per team, EOL.rules.shared with battle.js/deck.js),
     split 6 v 6, smart role-based formation via createBattle
     {roleAware: true} (Tanks/Bruisers front, the rest back).
   - Both sides driven by js/ai.js bestAction() at depth 2.
   - All statistics come from the engine's structured event hook
     (window.EOL.onBattleEvent) — observation only.
   - Writes sim/results.json by default (--out picks another path).
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--'))
    args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
});
const N_GAMES = parseInt(args.games || '1500', 10);
const SEED = parseInt(args.seed || '20260729', 10);
const ROUND_CAP = 20;
const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = args.out ? path.resolve(args.out) : path.join(__dirname, 'results.json');

/* ---------------- boot ---------------- */
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
  'js/engine.js',
  'js/ai.js',
].forEach((f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
const EOL = window.EOL,
  E = EOL.engine,
  AI = EOL.ai;
AI.setDepth(2); // per spec: AI v AI at depth 2
// Fast simulation budget: still depth 2, with fewer sampled rollouts.
AI.setSimulationBudget({
  beamWidth: parseInt(args.beam || '5', 10),
  pruneKeep: parseInt(args.prune || '2', 10),
  minRollouts: parseInt(args.minRollouts || '2', 10),
  maxRollouts: parseInt(args.maxRollouts || '6', 10),
  timeBudget: parseInt(args.aiMs || '25', 10),
});

const POOL = [];
EOL.factions.forEach((f) => f.cards.forEach((c) => POOL.push({ card: c, faction: f.id })));

/* A/B hook: restore Rumpelstiltskin's heads Burn to 3 rounds to measure
   whether his raw numbers were carrying him (--rumpel3 flag). */
if (args.rumpel3) {
  const r = POOL.find((e) => e.card.id === 'grimmwood-rumpelstiltskin');
  r.card.ability.spec.effects[0].heads.effects[0].turns = 3;
  console.log('[A/B] Rumpelstiltskin heads Burn = 3 rounds');
}
const HERO = {};
POOL.forEach((e) => {
  HERO[e.card.id] = e.card;
});
const ROLES = ['Tank', 'Bruiser', 'Controller', 'Caster', 'Medic', 'Sniper'];

function rng32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- aggregate tables ---------------- */
function mkHeroStats() {
  return {
    apps: 0,
    wins: 0,
    draws: 0,
    p1Apps: 0,
    p1Wins: 0,
    dmg: 0,
    dmgTaken: 0,
    heals: 0,
    shields: 0,
    absorbCredit: 0,
    prevented: 0,
    kills: 0,
    deaths: 0,
    energy: 0,
    basics: 0,
    sigs: 0,
    sigEnergy: 0,
    crits: 0,
    hits: 0,
    burnDmg: 0,
    exposedBonusDealt: 0,
    exposedBonusEnabled: 0,
    dmgVsTank: 0,
    dmgVsBackline: 0,
    tauntTurnsApplied: 0,
    redirects: 0,
    buffUpN: 0,
    debuffUpN: 0,
    upSamples: 0,
    overkill: 0,
    targeted: 0,
    teamTargeted: 0,
    focusN: 0,
    focusD: 0,
    dmgBeforeDeath: 0,
    deathGames: 0,
    dmgAfterFirstKill: 0,
    mvp: 0,
    aliveAtEnd: 0,
    lastSurvivorGames: 0,
    lastSurvivorWins: 0,
    firstKills: 0,
    firstKillWins: 0,
    concededFK: 0,
    concededFKWins: 0,
    firstKillRoundSum: 0,
    killGames: 0,
    kpSum: 0,
    roundsSum: 0,
    dmgPerRoundSum: 0,
  };
}
function mkAbilityStats() {
  return {
    casts: 0,
    value: 0,
    kills: 0,
    targetsHit: 0,
    dmg: 0,
    heal: 0,
    shield: 0,
    buffs: 0,
    debuffs: 0,
    heroName: '',
    kind: '',
  };
}
function mkStatusStats() {
  return { applied: 0, refreshed: 0, roundsSum: 0, closed: 0, cleansed: 0, value: 0 };
}

let A = {
  meta: { games: 0, seed: SEED, depth: 2, date: new Date().toISOString() },
  p1Wins: 0,
  p2Wins: 0,
  draws: 0,
  rounds: [],
  actionsPerGame: [],
  roundsPerGame: [],
  sigRoundsFirst: [],
  firstKillRounds: [],
  secondKillRounds: [],
  winnerAliveLeft: [],
  winnerHpLeft: [],
  fkDecisiveGames: 0,
  fkConverted: 0,
  gamesWithKill: 0,
  sigCasts: 0,
  basicCasts: 0,
  heroes: {},
  roles: {},
  abilities: {},
  basics: {},
  statuses: {},
  burn: { ticks: 0, tickDmg: 0, kills: 0 },
  exposed: { dmgWhile: 0, killsWhile: 0 },
  mark: { triggers: 0, triggerDmg: 0 },
  pairs: {},
  rolePairs: {},
  matchups: {},
  comps: {},
  pos: {
    front: { apps: 0, deaths: 0, aliveEnd: 0, dmg: 0, heals: 0, targeted: 0, redirects: 0 },
    back: { apps: 0, deaths: 0, aliveEnd: 0, dmg: 0, heals: 0, targeted: 0, redirects: 0 },
  },
  ai: {
    byKind: { Damage: 0, Heal: 0, Shield: 0, Buff: 0, Debuff: 0 },
    tgt: { n: 0, lowestHp: 0, highestAtk: 0, tank: 0, backline: 0, marked: 0, exposed: 0 },
  },
};
A.heroInfo = {};
Object.keys(HERO).forEach((id) => {
  const c = HERO[id];
  A.heroInfo[id] = {
    id,
    name: c.name,
    faction: POOL.find((e) => e.card.id === id).faction,
    rarity: c.rarity,
    role: c.role,
    element: c.element,
  };
});
ROLES.forEach((r) => {
  A.roles[r] = mkHeroStats();
});
['burn', 'exposed', 'marked', 'silence', 'taunt', 'healMod', 'untargetable'].forEach((s) => {
  A.statuses[s] = mkStatusStats();
});
const heroAgg = (id) => (A.heroes[id] = A.heroes[id] || mkHeroStats());
const abilAgg = (k) => (A.abilities[k] = A.abilities[k] || mkAbilityStats());

/* ================= one game ================= */
function runGame(seed) {
  const rng = rng32(seed);

  /* Deck legality: at most 3 heroes per role per team (EOL.rules) —
     same rule as the deck builder and battle team generation. */
  const picked = EOL.rules.splitCapped(POOL, rng);
  const B = E.createBattle(picked[0], picked[1], { rng, roleAware: true, simulation: true });

  const U = {}; // uid -> {id, name, role, side, slot, passiveKey}
  const G = {}; // heroId -> per-game accumulators
  const g0 = () => ({
    win: 0,
    draw: 0,
    p1: 0,
    dmg: 0,
    dmgTaken: 0,
    heals: 0,
    shields: 0,
    absorbCredit: 0,
    prevented: 0,
    kills: 0,
    deaths: 0,
    died: false,
    deathRound: -1,
    energy: 0,
    basics: 0,
    sigs: 0,
    sigEnergy: 0,
    crits: 0,
    hits: 0,
    burnDmg: 0,
    exposedBonusDealt: 0,
    exposedBonusEnabled: 0,
    dmgVsTank: 0,
    dmgVsBackline: 0,
    tauntTurnsApplied: 0,
    redirects: 0,
    buffUpN: 0,
    debuffUpN: 0,
    upSamples: 0,
    overkill: 0,
    targeted: 0,
    teamTargeted: 0,
    focusN: 0,
    focusD: 0,
    dmgSoFar: 0,
    dmgBeforeDeath: 0,
    dmgAfterFirstKill: 0,
    mvp: 0,
    aliveAtEnd: 0,
    lastSurvivor: 0,
    gotFirstKill: 0,
    concededFK: 0,
    firstKillRoundSum: 0,
    kp: 0,
    rounds: 0,
  });
  B.units.forEach((u) => {
    const passive = u.card.ability.type === 'Passive';
    U[u.uid] = {
      id: u.card.id,
      name: u.name,
      role: u.role,
      side: u.side,
      slot: u.slot,
      passiveKey: passive ? u.card.id + '|' + u.card.ability.name : null,
    };
    if (!G[u.card.id]) G[u.card.id] = g0();
    G[u.card.id].p1 = u.side === 'player' ? 1 : 0;
  });

  let actions = 0;
  let firstDeathRound = 0,
    secondDeathRound = 0,
    firstKillerId = null,
    firstSigRound = 0;
  const lastDmgOn = {};
  const lastExposer = {};
  const focus = {}; // tgtUid -> round -> Set(srcUid)
  const statusOpen = {}; // uid|status -> {src, startRound}
  let currentAction = null; // per-cast bucket

  function closeStatus(uid, status, how, round) {
    const inst = statusOpen[uid + '|' + status];
    if (!inst) return;
    const st = A.statuses[status];
    st.roundsSum += Math.max(0, round - inst.startRound);
    st.closed += 1;
    if (how === 'cleansed') st.cleansed += 1;
    delete statusOpen[uid + '|' + status];
  }

  let prevFlags = null;
  function watchFlags() {
    const snap = {};
    B.units.forEach((u) => {
      const f = {};
      ['burn', 'exposed', 'marked', 'silence', 'taunt', 'healMod', 'untargetable'].forEach((s) => {
        f[s] = (u.flags[s] || 0) > 0 ? 1 : 0;
      });
      snap[u.uid] = f;
      if (prevFlags && prevFlags[u.uid]) {
        const p = prevFlags[u.uid];
        Object.keys(f).forEach((s) => {
          if (p[s] && !f[s]) closeStatus(u.uid, s, u.alive ? 'expired' : 'died', B.round);
          if (!p[s] && f[s] && !statusOpen[u.uid + '|' + s]) {
            statusOpen[u.uid + '|' + s] = { src: null, startRound: B.round };
          }
        });
      }
    });
    prevFlags = snap;
  }

  /* route a secondary effect to its owner's passive row when it was
     produced by a passive outside that owner's own cast */
  function routePassiveValue(srcUid, field, amt) {
    const r = U[srcUid];
    if (!r || !r.passiveKey) return;
    if (currentAction && currentAction.actorUid === srcUid) return; // in cast bucket
    abilAgg(r.passiveKey)[field] += amt;
    abilAgg(r.passiveKey).value += amt;
  }

  EOL.onBattleEvent = function (BB, ev) {
    const S = currentAction ? currentAction.agg : null;
    switch (ev.t) {
      case 'dmg': {
        const src = U[ev.src],
          tgt = U[ev.tgt];
        if (!src || !tgt) break;
        const gs = G[src.id],
          gtt = G[tgt.id];
        gs.dmg += ev.amount;
        gs.dmgSoFar += ev.amount;
        if (firstDeathRound) gs.dmgAfterFirstKill += ev.amount;
        gtt.dmgTaken += ev.amount;
        gs.hits++;
        if (ev.crit) gs.crits++;
        if (ev.exposedBonus) {
          gs.exposedBonusDealt += ev.exposedBonus;
          A.exposed.dmgWhile += ev.amount;
          A.statuses.exposed.value += ev.exposedBonus;
          const xp = lastExposer[ev.tgt];
          if (xp && U[xp]) G[U[xp].id].exposedBonusEnabled += ev.exposedBonus;
          if (ev.killed) A.exposed.killsWhile++;
        }
        if (tgt.role === 'Tank') gs.dmgVsTank += ev.amount;
        if (!ev.tgtFront) gs.dmgVsBackline += ev.amount;
        (ev.tgtFront ? A.pos.front : A.pos.back).targeted++;
        (src.slot < 3 ? A.pos.front : A.pos.back).dmg += ev.amount;
        gtt.targeted++;
        B.units.forEach((x) => {
          if (x.side === tgt.side) G[x.card.id].teamTargeted++;
        });
        if (ev.absorbed) {
          const u = BB.units.find((x) => x.uid === ev.tgt);
          if (u && u.shieldSrc && U[u.shieldSrc]) {
            G[U[u.shieldSrc].id].absorbCredit += ev.absorbed;
            routePassiveValue(u.shieldSrc, 'value', ev.absorbed);
          }
        }
        if (ev.prevents)
          ev.prevents.forEach((p) => {
            if (U[p.owner]) {
              G[U[p.owner].id].prevented += p.amt;
              routePassiveValue(p.owner, 'value', p.amt);
            }
          });
        if (ev.tgtTaunting) {
          gtt.redirects++;
          (ev.tgtFront ? A.pos.front : A.pos.back).redirects++;
          A.statuses.taunt.value += ev.amount + ev.absorbed;
        }
        focus[ev.tgt] = focus[ev.tgt] || {};
        (focus[ev.tgt][ev.round] = focus[ev.tgt][ev.round] || new Set()).add(ev.src);
        lastDmgOn[ev.tgt] = ev.src;
        if (ev.killed) gs.overkill += ev.overkill;
        if (S && ev.src === currentAction.actorUid) {
          S.dmg += ev.amount;
          S.value += ev.amount;
          S.targets[ev.tgt] = 1;
          if (ev.killed) S.kills++;
          (S.lastDmgOnTgt = S.lastDmgOnTgt || {})[ev.tgt] = ev.amount + ev.absorbed;
        }
        break;
      }
      case 'burnTick': {
        const tU = U[ev.uid];
        if (tU) {
          G[tU.id].dmgTaken += ev.amount;
          focus[ev.uid] = focus[ev.uid] || {};
          (focus[ev.uid][ev.round] = focus[ev.uid][ev.round] || new Set()).add(ev.src || 'burn');
          (tU.slot < 3 ? A.pos.front : A.pos.back).targeted++;
        }
        A.burn.ticks++;
        A.burn.tickDmg += ev.amount;
        A.statuses.burn.value += ev.amount;
        if (ev.src && U[ev.src]) {
          G[U[ev.src].id].burnDmg += ev.amount;
          G[U[ev.src].id].dmg += ev.amount;
          G[U[ev.src].id].dmgSoFar += ev.amount;
          if (firstDeathRound) G[U[ev.src].id].dmgAfterFirstKill += ev.amount;
        }
        if (ev.killed) {
          A.burn.kills++;
          if (ev.src) lastDmgOn[ev.uid] = ev.src;
        }
        break;
      }
      case 'heal': {
        const src = U[ev.src];
        if (src) {
          G[src.id].heals += ev.amount;
          (src.slot < 3 ? A.pos.front : A.pos.back).heals += ev.amount;
          routePassiveValue(ev.src, 'heal', ev.amount);
        }
        if (S && ev.src === currentAction.actorUid) {
          S.heal += ev.amount;
          S.value += ev.amount;
          S.targets[ev.tgt] = 1;
        }
        break;
      }
      case 'shield': {
        const src = U[ev.src];
        if (src) {
          G[src.id].shields += ev.amount;
          routePassiveValue(ev.src, 'shield', ev.amount);
        }
        if (S && ev.src === currentAction.actorUid) {
          S.shield += ev.amount;
          S.value += ev.amount;
          S.targets[ev.tgt] = 1;
          S.buffs++;
        }
        break;
      }
      case 'stat': {
        const src = U[ev.src],
          tgt = U[ev.tgt];
        if (src && tgt)
          routePassiveValue(ev.src, 'value', Math.abs(ev.amt) * (ev.stat === 'def' ? 30 : 15));
        if (S && ev.src === currentAction.actorUid) {
          S.targets[ev.tgt] = 1;
          if (ev.amt >= 0) S.buffs++;
          else S.debuffs++;
          // utility value, priced like ai.js scoreEffects
          const u = BB.units.find((x) => x.uid === ev.tgt);
          if (u) {
            const base =
              ev.stat === 'atk'
                ? E.atkOf(u) * 1.1
                : ev.stat === 'def'
                  ? u.maxHp * 0.3
                  : E.atkOf(u) * 0.9;
            let v = base * (Math.abs(ev.amt) / 100);
            if (ev.turns > 1) v *= 1.35;
            if (ev.turns > 50) v *= 1.6;
            S.value += v;
          }
        }
        break;
      }
      case 'statusApply': {
        const st = A.statuses[ev.status];
        const tgtU = U[ev.tgt];
        if (st) {
          if (ev.refreshed) st.refreshed++;
          else st.applied++;
          if (statusOpen[ev.tgt + '|' + ev.status]) {
            closeStatus(ev.tgt, ev.status, 'refreshed', ev.round);
          }
          statusOpen[ev.tgt + '|' + ev.status] = { src: ev.src, startRound: ev.round };
          if (ev.status === 'exposed') lastExposer[ev.tgt] = ev.src;
          if (ev.status === 'taunt' && tgtU) G[tgtU.id].tauntTurnsApplied += ev.turns || 1;
          if (S && ev.src === currentAction.actorUid) {
            S.targets[ev.tgt] = 1;
            if (
              ev.status === 'taunt' ||
              ev.status === 'untargetable' ||
              ev.status === 'counterStrike'
            )
              S.buffs++;
            else S.debuffs++;
            // utility value, priced like ai.js scoreEffects
            const tu = BB.units.find((x) => x.uid === ev.tgt);
            if (ev.status === 'taunt' && tu) S.value += tu.hp * 0.16 + 180;
            else if (ev.status === 'silence') S.value += 330;
            else if (ev.status === 'healMod') S.value += 150;
            else if (ev.status === 'exposed' && tu && !ev.refreshed)
              S.value += 180 + tu.baseDef * 14;
            else if (ev.status === 'marked' && !ev.refreshed) S.value += 130;
            else if (ev.status === 'untargetable') S.value += 620;
          }
        }
        break;
      }
      case 'markConsumed': {
        A.mark.triggers++;
        let d = ev.damage;
        if (!d && currentAction && currentAction.agg.lastDmgOnTgt) {
          d = currentAction.agg.lastDmgOnTgt[ev.tgt] || 0;
        }
        A.mark.triggerDmg += d;
        A.statuses.marked.value += d;
        closeStatus(ev.tgt, 'marked', 'consumed', ev.round);
        watchFlags();
        break;
      }
      case 'cleanse': {
        ev.what.forEach((w) => {
          const base = w.split(':')[0];
          if (A.statuses[base]) closeStatus(ev.tgt, base, 'cleansed', ev.round);
          else if (base === 'marked') closeStatus(ev.tgt, 'marked', 'cleansed', ev.round);
        });
        if (S && ev.src === currentAction.actorUid) S.targets[ev.tgt] = 1;
        watchFlags();
        break;
      }
      case 'death': {
        const rr = U[ev.uid];
        if (rr) {
          const g = G[rr.id];
          g.deaths++;
          g.died = true;
          g.deathRound = ev.round;
          g.dmgBeforeDeath = g.dmgSoFar;
          (rr.slot < 3 ? A.pos.front : A.pos.back).deaths++;
          const killerUid = lastDmgOn[ev.uid];
          if (killerUid && U[killerUid] && U[killerUid].side !== rr.side) {
            const kg = G[U[killerUid].id];
            if (kg.kills === 0) kg.firstKillRoundSum += ev.round;
            kg.kills++;
            if (!firstDeathRound) {
              firstDeathRound = ev.round;
              firstKillerId = U[killerUid].id;
              kg.gotFirstKill = 1;
            } else if (!secondDeathRound) {
              secondDeathRound = ev.round;
            }
          }
          ['burn', 'exposed', 'marked', 'silence', 'taunt', 'healMod', 'untargetable'].forEach(
            (s) => closeStatus(ev.uid, s, 'died', ev.round)
          );
        }
        watchFlags();
        break;
      }
      case 'proc': {
        const o = U[ev.owner];
        if (o && o.passiveKey) {
          const rr = abilAgg(o.passiveKey);
          rr.casts++;
          rr.heroName = o.name;
          rr.kind = 'Passive';
        }
        break;
      }
      // revive / swap / energy: no table needs them
    }
    watchFlags();
  };

  /* ------------- battle loop ------------- */
  let steps = 0;
  while (!B.over && B.round <= ROUND_CAP && steps++ < 5000) {
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

    const unit = act.unit,
      ability = act.ability;
    const cost = E.costOf(B, unit, ability);
    const energyBefore = B.energy[side];
    const targets = E.resolveTargets(B, unit, ability, act.chosen);

    B.units.forEach((u) => {
      if (!u.alive) return;
      const g = G[u.card.id];
      g.upSamples++;
      if (u.buffs.some((b) => b.amt > 0)) g.buffUpN++;
      if (E.hasDebuff(u)) g.debuffUpN++;
    });

    currentAction = {
      actorUid: unit.uid,
      agg: { dmg: 0, heal: 0, shield: 0, value: 0, kills: 0, buffs: 0, debuffs: 0, targets: {} },
    };
    const res = E.useAbility(B, unit, ability, act.chosen, act.choose);
    const bucket = currentAction;
    currentAction = null;
    if (!res.ok) {
      B.acted[side][unit.uid] = true;
      continue;
    }

    actions++;
    const g = G[unit.card.id];
    g.energy += cost;
    A.ai.byKind[classify(ability)]++;

    if (ability.basic) {
      A.basicCasts++;
      g.basics++;
      const br = (A.basics[ability.name] = A.basics[ability.name] || mkAbilityStats());
      foldCast(br, bucket);
    } else {
      A.sigCasts++;
      g.sigs++;
      g.sigEnergy += energyBefore;
      if (!firstSigRound) firstSigRound = B.round;
      const rr = abilAgg(unit.card.id + '|' + ability.name);
      rr.heroName = unit.name;
      rr.kind = 'Signature (' + cost + ' EN)';
      foldCast(rr, bucket);
    }

    const spec = ability.spec || {},
      tSpec = spec.target || {};
    if (tSpec.side === 'enemy' && tSpec.pick === 'single' && targets[0]) {
      const pool = E.legalTargets(B, unit, ability);
      const chosen = targets[0];
      const lo = pool.slice().sort((a, b) => a.hp - b.hp)[0];
      const hi = pool.slice().sort((a, b) => E.atkOf(b) - E.atkOf(a))[0];
      const T = A.ai.tgt;
      T.n++;
      if (lo && chosen.uid === lo.uid) T.lowestHp++;
      if (hi && chosen.uid === hi.uid) T.highestAtk++;
      if (chosen.role === 'Tank') T.tank++;
      if (chosen.slot >= 3) T.backline++;
      if (chosen.flags.marked > 0) T.marked++;
      if (chosen.flags.exposed > 0) T.exposed++;
    }
  }

  /* ------------- wrap ------------- */
  const winnerSide = B.over ? B.winner : null;
  const gp = {
    winner: winnerSide === 'player' ? 'P1' : winnerSide === 'enemy' ? 'P2' : null,
    draw: !winnerSide,
    rounds: B.round,
    actions,
  };

  const teamKills = { player: 0, enemy: 0 };
  B.units.forEach((u) => {
    if (!u.alive) teamKills[E.opposite(u.side)]++;
  });

  const fkUnit = firstKillerId ? B.units.filter((u) => u.card.id === firstKillerId)[0] : null;
  const fkWon = !!(fkUnit && gp.winner && gp.winner === (fkUnit.side === 'player' ? 'P1' : 'P2'));

  B.units.forEach((u) => {
    const g = G[u.card.id];
    g.rounds = B.round;
    g.win = winnerSide === u.side ? 1 : 0;
    g.draw = winnerSide ? 0 : 1;
    g.aliveAtEnd = u.alive ? 1 : 0;
    g.kp = teamKills[u.side] ? g.kills / teamKills[u.side] : 0;
    if (fkUnit && u.side !== fkUnit.side) g.concededFK = 1;
    const aliveTeam = B.units.filter((x) => x.side === u.side && x.alive);
    if (u.alive && aliveTeam.length === 1) g.lastSurvivor = 1;
    // focus fire over rounds alive
    const fMap = focus[u.uid] || {};
    for (let r = 1; r <= B.round; r++) {
      if (!u.alive && g.deathRound > 0 && r > g.deathRound) continue;
      g.focusD++;
      if (fMap[r]) g.focusN += fMap[r].size;
    }
    g.mvp = g.dmg + 0.8 * (g.heals + g.shields + g.absorbCredit + g.prevented) + 400 * g.kills;
  });

  EOL.onBattleEvent = null;
  return { B, U, G, gp, firstDeathRound, secondDeathRound, firstSigRound, firstKillerId, fkWon };
}

function foldCast(rr, bucket) {
  rr.casts++;
  rr.value += bucket.agg.value;
  rr.kills += bucket.agg.kills;
  rr.targetsHit += Object.keys(bucket.agg.targets).length;
  rr.dmg += bucket.agg.dmg;
  rr.heal += bucket.agg.heal;
  rr.shield += bucket.agg.shield;
  rr.buffs += bucket.agg.buffs;
  rr.debuffs += bucket.agg.debuffs;
}

function classify(ability) {
  const spec = ability.spec || {};
  const flat = [];
  (function walk(list) {
    (list || []).forEach((e) => {
      flat.push(e.k);
      if (e.k === 'branch') {
        walk(e.then);
        walk(e.other);
      }
      if (e.k === 'coinFlip') {
        walk(e.heads && e.heads.effects);
        walk(e.tails && e.tails.effects);
      }
      if (e.k === 'randomOf') walk(e.options);
      if (e.k === 'delayed') walk(e.effects);
    });
  })(spec.effects || (spec.choose && spec.choose[0].effects) || []);
  const kinds = new Set(flat);
  const side = spec.target && spec.target.side;
  if (kinds.has('heal') || kinds.has('revive')) return 'Heal';
  if (kinds.has('shield')) return 'Shield';
  if (side === 'ally' || side === 'self') return 'Buff';
  if (kinds.has('dmg')) return 'Damage';
  return 'Debuff';
}

/* merge per-game hero records into hero + role tables */
function mergeHero(id, g) {
  const h = heroAgg(id),
    r = A.roles[HERO[id].role];
  [h, r].forEach((t) => {
    t.apps++;
    t.wins += g.win;
    t.draws += g.draw;
    t.p1Apps += g.p1;
    t.p1Wins += g.p1 ? g.win : 0;
    t.dmg += g.dmg;
    t.dmgTaken += g.dmgTaken;
    t.heals += g.heals;
    t.shields += g.shields;
    t.absorbCredit += g.absorbCredit;
    t.prevented += g.prevented;
    t.kills += g.kills;
    t.deaths += g.deaths;
    t.energy += g.energy;
    t.basics += g.basics;
    t.sigs += g.sigs;
    t.sigEnergy += g.sigEnergy;
    t.crits += g.crits;
    t.hits += g.hits;
    t.burnDmg += g.burnDmg;
    t.exposedBonusDealt += g.exposedBonusDealt;
    t.exposedBonusEnabled += g.exposedBonusEnabled;
    t.dmgVsTank += g.dmgVsTank;
    t.dmgVsBackline += g.dmgVsBackline;
    t.tauntTurnsApplied += g.tauntTurnsApplied;
    t.redirects += g.redirects;
    t.buffUpN += g.buffUpN;
    t.debuffUpN += g.debuffUpN;
    t.upSamples += g.upSamples;
    t.overkill += g.overkill;
    t.targeted += g.targeted;
    t.teamTargeted += g.teamTargeted;
    t.focusN += g.focusN;
    t.focusD += g.focusD;
    t.dmgBeforeDeath += g.dmgBeforeDeath;
    t.deathGames += g.died ? 1 : 0;
    t.dmgAfterFirstKill += g.dmgAfterFirstKill;
    t.mvp += g.mvp;
    t.aliveAtEnd += g.aliveAtEnd;
    t.lastSurvivorGames += g.lastSurvivor;
    t.lastSurvivorWins += g.lastSurvivor ? g.win : 0;
    t.firstKills += g.gotFirstKill;
    t.firstKillWins += g.gotFirstKill ? g.win : 0;
    t.concededFK += g.concededFK;
    t.concededFKWins += g.concededFK ? g.win : 0;
    t.firstKillRoundSum += g.firstKillRoundSum;
    t.killGames += g.kills > 0 ? 1 : 0;
    t.kpSum += g.kp;
    t.roundsSum += g.rounds;
    t.dmgPerRoundSum += g.rounds ? g.dmg / g.rounds : 0;
  });
}

function foldGame(gd) {
  const { B, G, gp } = gd;
  A.meta.games++;
  if (gp.winner === 'P1') A.p1Wins++;
  else if (gp.winner === 'P2') A.p2Wins++;
  else A.draws++;
  A.rounds.push(gp.rounds);
  A.roundsPerGame.push(gp.rounds);
  A.actionsPerGame.push(gp.actions);
  if (gd.firstSigRound) A.sigRoundsFirst.push(gd.firstSigRound);
  if (gd.firstDeathRound) {
    A.gamesWithKill++;
    A.firstKillRounds.push(gd.firstDeathRound);
    if (gp.winner) {
      A.fkDecisiveGames++;
      if (gd.fkWon) A.fkConverted++;
    }
    if (gd.secondDeathRound) A.secondKillRounds.push(gd.secondDeathRound);
  }
  if (!gp.winner) return; // all detailed tables are decided games only
  if (gp.winner) {
    const ws = gp.winner === 'P1' ? 'player' : 'enemy';
    const wu = B.units.filter((u) => u.side === ws);
    A.winnerAliveLeft.push(wu.filter((u) => u.alive).length);
    A.winnerHpLeft.push((wu.reduce((s, u) => s + (u.hp + u.shield) / u.maxHp, 0) / 6) * 100);
  }
  Object.keys(G).forEach((id) => mergeHero(id, G[id]));

  /* positions: slot occupancy */
  B.units.forEach((u) => {
    const P = u.slot < 3 ? A.pos.front : A.pos.back;
    P.apps++;
    if (u.alive) P.aliveEnd++;
  });

  /* pairs, role pairs, comps */
  [
    ['player', 'P1'],
    ['enemy', 'P2'],
  ].forEach(([side, label]) => {
    const units = B.units.filter((u) => u.side === side);
    const ids = units.map((u) => u.card.id);
    const roles = units.map((u) => u.role);
    const won = gp.winner === label ? 1 : 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = [ids[i], ids[j]].sort().join('|');
        const p = (A.pairs[k] = A.pairs[k] || { games: 0, wins: 0, dmg: 0, kp: 0 });
        p.games++;
        p.wins += won;
        p.dmg += G[ids[i]].dmg + G[ids[j]].dmg;
        p.kp += (G[ids[i]].kp + G[ids[j]].kp) / 2;
      }
    }
    const rp = new Set();
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) rp.add([roles[i], roles[j]].sort().join('+'));
    }
    rp.forEach((k) => {
      const r = (A.rolePairs[k] = A.rolePairs[k] || { games: 0, wins: 0 });
      r.games++;
      r.wins += won;
    });
    const counts = {};
    roles.forEach((r) => {
      counts[r] = (counts[r] || 0) + 1;
    });
    ROLES.forEach((role) => {
      const c0 = counts[role] || 0;
      const ck = role + '|' + Math.min(c0, 2);
      const c = (A.comps[ck] = A.comps[ck] || { games: 0, wins: 0 });
      c.games++;
      c.wins += won;
    });
  });

  /* matchups */
  const p1 = B.units.filter((u) => u.side === 'player').map((u) => u.card.id);
  const p2 = B.units.filter((u) => u.side === 'enemy').map((u) => u.card.id);
  p1.forEach((a) =>
    p2.forEach((b) => {
      const k = a + '>' + b;
      const m = (A.matchups[k] = A.matchups[k] || { games: 0, wins: 0 });
      m.games++;
      if (gp.winner === 'P1') m.wins++;
    })
  );
}

/* ---------------- main ---------------- */
const t0 = Date.now();
for (let i = 0; i < N_GAMES; i++) {
  /* Detailed telemetry is captured during resolution. Draws must remain
     global-only, so restore the aggregate before folding a drawn game. */
  const snapshot = JSON.stringify(A);
  const beforeSig = A.sigCasts,
    beforeBasic = A.basicCasts,
    beforeSigN = A.sigRoundsFirst.length;
  const game = runGame(SEED + i);
  if (game.gp.draw) {
    const drawSig = A.sigCasts - beforeSig,
      drawBasic = A.basicCasts - beforeBasic;
    const drawSigRounds = A.sigRoundsFirst.slice(beforeSigN);
    A = JSON.parse(snapshot);
    A.sigCasts += drawSig;
    A.basicCasts += drawBasic;
    A.sigRoundsFirst.push(...drawSigRounds);
  }
  foldGame(game);
  if ((i + 1) % 25 === 0) {
    const dt = (Date.now() - t0) / 1000;
    console.log(
      `  ${i + 1}/${N_GAMES}  ${dt.toFixed(0)}s  (${((1000 * dt) / (i + 1)).toFixed(0)} ms/game)`
    );
  }
}
console.log(`done: ${N_GAMES} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
fs.writeFileSync(OUT_JSON, JSON.stringify(A));
console.log('wrote', OUT_JSON, (fs.statSync(OUT_JSON).size / 1e6).toFixed(1) + 'MB');
