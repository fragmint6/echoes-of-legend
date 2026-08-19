/* =============================================================
   Echoes of Legend - AI v AI Balance Simulation Harness
   -------------------------------------------------------------
   node sim/sim.js --games 1500 [--seed 42]

   - Random 12-legend draw per game under the deck rule (max 3 legends
     per role per team, EOL.rules.shared with battle.js/deck.js),
     split 6 v 6, smart role-based formation via createBattle
     {roleAware: true} (Tanks/Bruisers front, the rest back).
   - Both sides driven by js/ai.js bestAction() at depth 2.
   - All statistics come from the engine's structured event hook
     (window.EOL.onBattleEvent) - observation only.
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
  'data/roma.js',
  'data/kami.js',
  'data/duat.js',
  'data/battlefields.js',
  /* the draft heuristic, so --teams draft/pairs can use the SAME
     scoring the in-game draft bot uses rather than a second one */
  'data/draft-ai.js',
  'js/engine.js',
  'js/ai.js',
].forEach((f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
});
const EOL = window.EOL,
  E = EOL.engine,
  AI = EOL.ai;
/* SEARCH DEPTH.
   Depth 2 is a SPEED choice for a 5,000-game run, not a statement
   that depth 2 plays well. It cannot see a move whose payoff is two
   turns away, which systematically undervalues every enabler in the
   game - Merlin's discount, a setup Mark, a shield that pays off
   next round. If a legend climbs when depth rises, the earlier number
   was measuring the AI's blind spot rather than the card.
   Compare runs: --depth 2 against --depth 4. */
const SIM_DEPTH = parseInt(args.depth || '2', 10);
AI.setDepth(SIM_DEPTH);
/* random | draft | pairs | forced - see pickTeams() */
const TEAM_MODE = args.teams || 'random';
/* --bans 1 runs the real ban phase: each side drafts TWELVE, bans two
   of the opponent's, then fields six of its own ten. Without it the
   sim plays a game the ranked ladder does not have, and ban rate -
   arguably the best power signal there is - stays unmeasurable. */
const WITH_BANS = !!args.bans;
/* --force <legendId> pins a legend into P1's twelve every game. Equal
   sample per legend, and inclusion is not the draft AI's decision. */
const FORCE_ID = typeof args.force === 'string' ? args.force : null;
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
/* Control-run switch: drop a faction from the draw pool so a baseline can
   be measured without it (used to attribute outliers to the new faction). */
if (args.exclude) {
  const drop = String(args.exclude).split(',');
  for (let i = POOL.length - 1; i >= 0; i--)
    if (drop.indexOf(POOL[i].faction) >= 0) POOL.splice(i, 1);
  console.log('[control] excluded factions:', drop.join(','), '- pool now', POOL.length);
}
/* A/B harness for the Abe no Seimei emergency nerf. Each variant patches
   Binding Seal in place before the pool is frozen. Note the coupling: the
   Silence rider is gated on `drainedEnergyAbove: 20`, so any variant that
   lowers the drain MUST lower that threshold too or the Silence silently
   never fires. */
if (args.abe) {
  const abe = POOL.find((e) => e.card.id === 'yamato-abe-no-seimei');
  if (abe) {
    const ab = abe.card.ability;
    const fx = ab.spec.effects;
    const dmg = fx.filter((e) => e.k === 'dmg');
    const tax = fx.find((e) => e.k === 'drainTax');
    const sil = fx.find((e) => e.k === 'silence');
    const V = String(args.abe);
    if (V === 'A') {
      ab.cost = 50;
    } else if (V === 'B') {
      tax.amt = 12;
      sil.if.drainedEnergyAbove = 12;
    } else if (V === 'C') {
      ab.cost = 48;
      tax.amt = 12;
      sil.if.drainedEnergyAbove = 12;
    } else if (V === 'D') {
      ab.cost = 45;
      dmg.forEach((d) => (d.power = 0.55));
    } else if (V === 'E') {
      ab.cost = 50;
      tax.amt = 12;
      sil.if.drainedEnergyAbove = 12;
      dmg.forEach((d) => (d.power = 0.6));
    } else if (V !== 'base') {
      throw new Error('unknown --abe variant ' + V);
    }
    console.log(
      `[A/B] Abe variant ${V}: cost=${ab.cost} drain=${tax.amt} silenceGate=${sil.if.drainedEnergyAbove} dmg=${dmg.map((d) => d.power).join('x')}`
    );
  }
}
const LEGEND = {};
POOL.forEach((e) => {
  LEGEND[e.card.id] = e.card;
});
const ROLES = ['Tank', 'Bruiser', 'Controller', 'Caster', 'Medic', 'Sniper'];

/* Battlefield for the run - Colosseum (neutral) unless --field says otherwise. */
const SIM_FIELD = EOL.battlefieldById(args.field || 'colosseum');
if (!SIM_FIELD) throw new Error('unknown --field ' + args.field);
console.log('[field] ' + SIM_FIELD.name + ' - ' + SIM_FIELD.rules.join(' '));

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
function mkLegendStats() {
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
    legendName: '',
    kind: '',
  };
}
function mkStatusStats() {
  return { applied: 0, refreshed: 0, roundsSum: 0, closed: 0, cleansed: 0, value: 0 };
}

let A = {
  /* The run's configuration travels WITH its results. Comparing a
     draft run against a random one, or depth 4 against depth 2, is
     only meaningful if you can tell them apart afterwards. */
  meta: {
    games: 0,
    seed: SEED,
    depth: SIM_DEPTH,
    teams: TEAM_MODE,
    bans: WITH_BANS,
    force: FORCE_ID,
    date: new Date().toISOString(),
  },
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
  legends: {},
  roles: {},
  abilities: {},
  basics: {},
  statuses: {},
  burn: { ticks: 0, tickDmg: 0, kills: 0 },
  exposed: { dmgWhile: 0, killsWhile: 0 },
  mark: { triggers: 0, triggerDmg: 0 },
  /* Draft-phase telemetry. Only populated with --bans.
       drafted - taken into a twelve
       banned  - deleted by the opponent
       fielded - actually played from the surviving ten
     A legend with a high ban rate and a middling win rate is not
     balanced; it is being removed precisely because it is strong. */
  draftStats: {},
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
A.legendInfo = {};
Object.keys(LEGEND).forEach((id) => {
  const c = LEGEND[id];
  A.legendInfo[id] = {
    id,
    name: c.name,
    faction: POOL.find((e) => e.card.id === id).faction,
    rarity: c.rarity,
    role: c.role,
    element: c.element,
  };
});
ROLES.forEach((r) => {
  A.roles[r] = mkLegendStats();
});
['burn', 'exposed', 'marked', 'silence', 'taunt', 'healMod', 'untargetable'].forEach((s) => {
  A.statuses[s] = mkStatusStats();
});
const legendAgg = (id) => (A.legends[id] = A.legends[id] || mkLegendStats());
const abilAgg = (k) => (A.abilities[k] = A.abilities[k] || mkAbilityStats());

/* =============================================================
   TEAM SELECTION MODES
   -------------------------------------------------------------
   See the note in runGame. `random` is the unbiased baseline;
   `draft` and `pairs` deliberately seek the ceiling.
   ============================================================= */
const DAI = EOL.draftAI;

/* Role cap for a TEAM OF SIX is 3 (EOL.rules.MAX_PER_ROLE). Note this
   is NOT deckRules.MAX_PER_ROLE, which is 4 and governs a deck of
   twelve - using the wrong one would quietly let these modes build
   teams the game would reject. */
function capBlocked6(team, card) {
  return EOL.rules.roleCount(team, card.role) >= EOL.rules.MAX_PER_ROLE;
}

/* --teams draft -----------------------------------------------
   Two bots snake-draft from packs of three using the SAME scoring
   the in-game draft bot uses, then fight. This is the closest the
   simulation gets to how a real ranked match is actually built, and
   it is the only mode where "I out-drafted him" can show up in the
   numbers at all. */
function draftTeams(rng) {
  const pool = POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  const teams = [[], []];
  let packNo = 0;
  let p = 0;
  while (teams[0].length < 6 && teams[1].length < 6 && p + 3 <= pool.length) {
    const pack = pool.slice(p, p + 3);
    p += 3;
    /* snake: the opener alternates, exactly as the game does */
    const opener = packNo % 2;
    const order = [opener, 1 - opener];
    for (const side of order) {
      if (teams[side].length >= 6) continue;
      const legal = pack.filter((e) => e && !capBlocked6(teams[side], e.card));
      const from = legal.length ? legal : pack.filter(Boolean);
      if (!from.length) break;
      /* the real draft heuristic, plus a small roll so identical
         pools do not always produce identical boards */
      let best = from[0];
      let bestV = -Infinity;
      for (const cand of from) {
        const v = DAI.value(teams[side], cand, { size: 6 }) + rng() * 2.5;
        if (v > bestV) {
          bestV = v;
          best = cand;
        }
      }
      teams[side].push(best);
      pack[pack.indexOf(best)] = null;
    }
    packNo++;
  }
  /* top up if the pool ran dry before both squads filled */
  for (const side of [0, 1]) {
    while (teams[side].length < 6 && p < pool.length) {
      const e = pool[p++];
      if (e && !capBlocked6(teams[side], e.card)) teams[side].push(e);
    }
  }
  return teams[0].length === 6 && teams[1].length === 6 ? teams : EOL.rules.splitCapped(POOL, rng);
}

/* --teams pairs ------------------------------------------------
   Force a high-synergy duo onto each side and fill the rest at
   random. Random draw samples a given pair in roughly 1 game in 90,
   which is far too sparse to say anything about combos; this makes
   the combo the controlled variable while everything else stays
   noisy. */
let PAIR_LIST = null;
function topPairs() {
  if (PAIR_LIST) return PAIR_LIST;
  const out = [];
  for (let i = 0; i < POOL.length; i++) {
    for (let j = i + 1; j < POOL.length; j++) {
      const a = POOL[i];
      const b = POOL[j];
      const v = DAI.pairSynergy(a, b);
      if (v > 0) out.push({ a, b, v });
    }
  }
  out.sort((x, y) => y.v - x.v);
  PAIR_LIST = out.slice(0, 60);
  return PAIR_LIST;
}

function pairTeams(rng) {
  const pairs = topPairs();
  if (!pairs.length) return EOL.rules.splitCapped(POOL, rng);
  const teams = [[], []];
  const used = new Set();
  for (const side of [0, 1]) {
    let pick = null;
    for (let tries = 0; tries < 40 && !pick; tries++) {
      const c = pairs[Math.floor(rng() * pairs.length)];
      if (!used.has(c.a.card.id) && !used.has(c.b.card.id)) pick = c;
    }
    if (!pick) return EOL.rules.splitCapped(POOL, rng);
    teams[side].push(pick.a, pick.b);
    used.add(pick.a.card.id);
    used.add(pick.b.card.id);
  }
  const rest = POOL.filter((e) => !used.has(e.card.id));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = rest[i];
    rest[i] = rest[j];
    rest[j] = t;
  }
  let k = 0;
  for (const side of [0, 1]) {
    while (teams[side].length < 6 && k < rest.length) {
      const e = rest[k++];
      if (!capBlocked6(teams[side], e.card)) teams[side].push(e);
    }
  }
  return teams[0].length === 6 && teams[1].length === 6 ? teams : EOL.rules.splitCapped(POOL, rng);
}

/* =============================================================
   THE REAL RANKED PIPELINE: draft 12 -> ban 2 -> field 6
   -------------------------------------------------------------
   Everything above builds a team of six directly, which is a game
   the ranked ladder does not actually play. A real match drafts
   twelve, each side deletes two of the opponent's, and six of the
   surviving ten are fielded.

   That middle step is not cosmetic. A card can hold a 50% win rate
   purely because opponents keep removing it - the win rate is low
   BECAUSE the threat is high. Without a ban phase that relationship
   is invisible, and it is exactly what happened in the live match
   that prompted this work.

   Returns per-side detail so the caller can record pick / ban /
   field rates separately, not just who won.
   ============================================================= */
function draftTwelve(rng, forceId) {
  const pool = POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }
  const decks = [[], []];
  /* FORCED INCLUSION. Pin the legend into P1 before drafting starts.
     This is what breaks the circularity in --teams draft: if the
     heuristic undervalues a card it never gets drafted, so it never
     gets data, so nobody learns it is broken - and the heuristic's
     weights came from earlier sim results in the first place. */
  if (forceId) {
    const idx = pool.findIndex((e) => e.card.id === forceId);
    if (idx >= 0) decks[0].push(pool.splice(idx, 1)[0]);
  }
  let packNo = 0;
  let p = 0;
  const DECK = EOL.deckRules.DECK_SIZE;
  const capDeck = (team, card) =>
    team.filter((e) => e.card.role === card.role).length >= EOL.deckRules.MAX_PER_ROLE;

  while ((decks[0].length < DECK || decks[1].length < DECK) && p + 3 <= pool.length) {
    const pack = pool.slice(p, p + 3);
    p += 3;
    const opener = packNo % 2;
    for (const side of [opener, 1 - opener]) {
      if (decks[side].length >= DECK) continue;
      const legal = pack.filter((e) => e && !capDeck(decks[side], e.card));
      const from = legal.length ? legal : pack.filter(Boolean);
      if (!from.length) break;
      let best = from[0];
      let bestV = -Infinity;
      for (const cand of from) {
        const v = DAI.value(decks[side], cand, { size: DECK }) + rng() * 2.5;
        if (v > bestV) {
          bestV = v;
          best = cand;
        }
      }
      decks[side].push(best);
      pack[pack.indexOf(best)] = null;
    }
    packNo++;
  }
  /* top up from whatever is left if the pool ran short */
  for (const side of [0, 1]) {
    while (decks[side].length < DECK && p < pool.length) {
      const e = pool[p++];
      if (e && !capDeck(decks[side], e.card)) decks[side].push(e);
    }
  }
  return decks;
}

/* Which two of THEIR twelve do we delete? Uses the same denyValue
   heuristic the in-game bot uses, so ban rate reflects the bot's
   actual threat assessment rather than a second opinion invented
   here. */
function chooseBans(theirDeck, myDeck, rng) {
  const scored = theirDeck.map((e, i) => ({
    i,
    v: DAI.denyValue(theirDeck, e, myDeck || []) + rng() * 1.2,
  }));
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, EOL.deckRules.BANS).map((x) => theirDeck[x.i]);
}

/* Six of the surviving ten. Greedy on the same value function, with
   the same rails the game uses: never field without a Tank or Medic
   if one survived. The FIELD has no role cap - only the deck does.

   `pin` forces a legend onto the board. Forcing it into the DECK is not
   enough: the fielding step is the draft AI's judgement too, so a
   card it dislikes gets drafted and then benched. Measured on a test
   run, 17 of 57 forced legends never actually played - including
   Merlin, the card that started this whole investigation. A forced
   pass that never fields the legend measures nothing. */
function chooseSix(pool, rng, pin) {
  const team = [];
  const rest = pool.slice();
  if (pin) {
    const i = rest.findIndex((e) => e.card.id === pin);
    if (i >= 0) team.push(rest.splice(i, 1)[0]);
  }
  while (team.length < 6 && rest.length) {
    const counts = {};
    team.forEach((t) => (counts[t.card.role] = (counts[t.card.role] || 0) + 1));
    const left = 6 - team.length;
    const has = (role) => rest.some((e) => e.card.role === role);
    let forced = null;
    if (!counts.Tank && has('Tank') && left <= 2) forced = 'Tank';
    else if (!counts.Medic && has('Medic') && left <= 1) forced = 'Medic';

    let best = -1;
    let bestV = -Infinity;
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      for (let i = 0; i < rest.length; i++) {
        if (forced && pass === 0 && rest[i].card.role !== forced) continue;
        const v = DAI.value(team, rest[i], { size: 6 }) + rng() * 1.5;
        if (v > bestV) {
          bestV = v;
          best = i;
        }
      }
    }
    if (best < 0) best = 0;
    team.push(rest.splice(best, 1)[0]);
  }
  return team;
}

/* The whole ranked pipeline for one game. */
function rankedTeams(rng, forceId) {
  const decks = draftTwelve(rng, forceId);
  if (decks[0].length !== EOL.deckRules.DECK_SIZE || decks[1].length !== EOL.deckRules.DECK_SIZE) {
    return { teams: EOL.rules.splitCapped(POOL, rng), decks: null, bans: null };
  }
  /* Bans are simultaneous and blind: each side chooses without
     seeing the other's choice, so neither is computed from the
     other's result. */
  let bansOn1 = chooseBans(decks[0], decks[1], rng); // P2 deletes from P1
  const bansOn0 = chooseBans(decks[1], decks[0], rng); // P1 deletes from P2
  /* A forced legend is exempt from being banned. Otherwise the most
     threatening cards - exactly the ones worth measuring - get
     deleted in most of their own forced games and produce the
     thinnest data of all. Ban RATE is measured by the unforced
     passes, where nothing is exempt, so nothing is lost. */
  if (forceId) bansOn1 = bansOn1.filter((e) => e.card.id !== forceId);
  const banned = [new Set(bansOn1.map((e) => e.card.id)), new Set(bansOn0.map((e) => e.card.id))];
  const survivors = [
    decks[0].filter((e) => !banned[0].has(e.card.id)),
    decks[1].filter((e) => !banned[1].has(e.card.id)),
  ];
  const teams = [chooseSix(survivors[0], rng, forceId), chooseSix(survivors[1], rng)];
  return { teams, decks, bans: [bansOn1, bansOn0] };
}

function pickTeams(rng) {
  if (TEAM_MODE === 'draft') return draftTeams(rng);
  if (TEAM_MODE === 'pairs') return pairTeams(rng);
  /* Deck legality: at most 3 legends per role per team (EOL.rules) -
     same rule as the deck builder and battle team generation. */
  return EOL.rules.splitCapped(POOL, rng);
}

/* ================= one game ================= */
function runGame(seed) {
  const rng = rng32(seed);

  /* HOW THE TWO TEAMS ARE CHOSEN.
     -------------------------------------------------------------
     Random draw answers "is this card fair in a vacuum". It does NOT
     answer "is this card fair when someone builds around it", and a
     human opponent always asks the second question. A live match
     exposed the gap: Merlin's discount is mediocre beside five
     random legends and enormous beside expensive ones, but random
     draw samples that pairing almost never, so the sim measured his
     floor while the player used his ceiling.

       --teams random  (default) unbiased coverage, every legend plays
       --teams draft             both sides snake-draft with the real
                                 draft AI, which is what a human does
       --teams pairs             force a known synergy pair onto each
                                 side, random filler around it

     Draft and pairs are deliberately BIASED. That is the point: they
     measure the ceiling. Run them alongside random, never instead of
     it, and treat a large gap between the two as the finding. */
  /* With --bans we run the real ladder pipeline (draft 12, ban 2,
     field 6) and record what each phase decided. Without it, the
     legacy direct-to-six selection. */
  let picked,
    ranked = null;
  if (WITH_BANS) {
    ranked = rankedTeams(rng, FORCE_ID);
    picked = ranked.teams;
  } else {
    picked = pickTeams(rng);
  }
  /* Every simulated game is fought in the COLOSSEUM (no modifiers) so legend
     win rates stay comparable across balance passes and are never skewed by
     terrain. Override with --field <id> to measure a specific battlefield. */
  const B = E.createBattle(picked[0], picked[1], {
    rng,
    roleAware: true,
    simulation: true,
    field: SIM_FIELD,
  });
  if (args.noCarry) B.noCarry = true; // A/B control: old reset-every-round economy
  if (args.noComeback) B.noComeback = true; // A/B control: disable the deficit grant

  const U = {}; // uid -> {id, name, role, side, slot, passiveKey}
  const G = {}; // legendId -> per-game accumulators
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
          rr.legendName = o.name;
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
      rr.legendName = unit.name;
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
  return {
    B,
    U,
    G,
    gp,
    ranked,
    firstDeathRound,
    secondDeathRound,
    firstSigRound,
    firstKillerId,
    fkWon,
  };
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

/* merge per-game legend records into legend + role tables */
function mergeLegend(id, g) {
  const h = legendAgg(id),
    r = A.roles[LEGEND[id].role];
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
  /* pick / ban / field counters, when the ranked pipeline ran */
  if (gd.ranked && gd.ranked.decks) {
    const ds = (id) =>
      (A.draftStats[id] = A.draftStats[id] || { drafted: 0, banned: 0, fielded: 0 });
    gd.ranked.decks.forEach((deck) => deck.forEach((e) => ds(e.card.id).drafted++));
    (gd.ranked.bans || []).forEach((list) => list.forEach((e) => ds(e.card.id).banned++));
    gd.ranked.teams.forEach((team) => team.forEach((e) => ds(e.card.id).fielded++));
  }
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
  Object.keys(G).forEach((id) => mergeLegend(id, G[id]));

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
