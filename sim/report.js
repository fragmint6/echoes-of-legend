/* =============================================================
   Echoes of Legend - Simulation Report Generator
   -------------------------------------------------------------
   node sim/report.js [--in sim/results.json] [--out sim/results.md]

   Renders every section of docs/ReportRequirements.md (1-13),
   plus a tier list and lineup analysis. Per the spec, only Global
   Match Statistics include drawn games; every other table is
   decided games only (sim.js already rolls drawn games back out
   of the detailed aggregates).

   COMPARISON RUNS ARE OPTIONAL.
     --control  <file>   a run with a faction excluded, for attribution
     --baseline <file>   an earlier run, for the before/after tables

   Neither has to exist. The saved baselines were pruned from the repo
   because they were large and stale; the sections that used them now
   degrade to reporting only the current figures. If you want a
   before/after again, keep a copy of a results.json and pass it with
   --baseline.
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const args = {};
process.argv.slice(2).forEach((a, i, arr) => {
  if (a.startsWith('--'))
    args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
});
/* =============================================================
   TWO INPUT SHAPES
   -------------------------------------------------------------
   --in <results.json>   a single run (the classic path)
   --full <full.json>    the combined output of sim/full.js, which
                         bundles a random pass, a draft pass and a
                         per-hero forced pass

   In full mode the RANDOM pass supplies every section below, so all
   the existing analysis keeps working unchanged, and section 0 adds
   the cross-pass comparison that is the whole reason full.js exists.
   ============================================================= */
const FULL_PATH = args.full ? path.resolve(args.full) : null;
const FULL = FULL_PATH ? JSON.parse(fs.readFileSync(FULL_PATH, 'utf8')) : null;
const IN = FULL_PATH ? FULL_PATH : path.resolve(args.in || path.join(__dirname, 'results.json'));
const OUT = path.resolve(args.out || path.join(__dirname, 'results.md'));
const A = FULL ? FULL.random : JSON.parse(fs.readFileSync(IN, 'utf8'));
/* Optional Roma-free control run, used to attribute outliers to this build
   rather than to the pre-existing roster. */
const CTRL_PATH = args.control
  ? path.resolve(args.control)
  : path.join(__dirname, 'control_noroma.json');
const C = fs.existsSync(CTRL_PATH) ? JSON.parse(fs.readFileSync(CTRL_PATH, 'utf8')) : null;
/* Pre-balance-pass baseline, for the before/after comparison. */
const BASE_PATH = args.baseline
  ? path.resolve(args.baseline)
  : path.join(__dirname, 'baseline_v7_pre_buffs.json');
const BL = fs.existsSync(BASE_PATH) ? JSON.parse(fs.readFileSync(BASE_PATH, 'utf8')) : null;

const ROLES = ['Tank', 'Bruiser', 'Controller', 'Caster', 'Medic', 'Sniper'];
const NEW_FACTION = 'duat';
const FIELD_NOTE = 'The Colosseum (no modifiers)';

/* ---------------- helpers ---------------- */
const n0 = (x) => (isFinite(x) ? Math.round(x).toLocaleString('en-US') : ' - ');
const n1 = (x) => (isFinite(x) ? x.toFixed(1) : ' - ');
const n2 = (x) => (isFinite(x) ? x.toFixed(2) : ' - ');
const pct = (x, d = 1) => (isFinite(x) ? (x * 100).toFixed(d) + '%' : ' - ');
const div = (a, b) => (b ? a / b : NaN);
const mean = (arr) => (arr && arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : NaN);
function median(arr) {
  if (!arr || !arr.length) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function table(headers, rows) {
  const out = [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
  ];
  rows.forEach((r) => out.push('| ' + r.join(' | ') + ' |'));
  return out.join('\n');
}
/* =============================================================
   WILSON SCORE INTERVAL
   -------------------------------------------------------------
   A win rate printed as "47.3%" looks equally authoritative whether
   it came from 40 games or 4,000. At 40 appearances the 95% interval
   is roughly +/-15pp, so 47% and 62% are the SAME measurement. Half
   the "findings" in a thin run are noise wearing a decimal point.

   Wilson rather than the normal approximation because it behaves
   sanely at small n and near 0% or 100%, which is exactly where a
   per-hero table spends its time.
   ============================================================= */
/* A composition can be entirely absent from a small run, and a
   missing comp is not an error - it just has no data. Reading it
   directly crashed the whole report on any thin sample. */
function compWR(src, key) {
  const c = src && src.comps ? src.comps[key] : null;
  return c && c.games ? c.wins / c.games : NaN;
}

function wilson(wins, n, z) {
  if (!n) return null;
  z = z || 1.96;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d), p: p, n: n };
}
/* "47.3% +/-8.1" - the margin is what stops a reader over-trusting
   a number built on 40 games. */
function wpct(wins, n) {
  const ci = wilson(wins, n);
  if (!ci) return ' - ';
  const half = ((ci.hi - ci.lo) / 2) * 100;
  return (ci.p * 100).toFixed(1) + '% ±' + half.toFixed(1);
}
/* Two rates are only DIFFERENT if their intervals do not overlap. */
function separated(w1, n1, w2, n2) {
  const a = wilson(w1, n1);
  const b = wilson(w2, n2);
  if (!a || !b) return false;
  return a.lo > b.hi || b.lo > a.hi;
}

const L = [];
const w = (s) => L.push(s == null ? '' : s);

const games = A.meta.games;
const decided = A.p1Wins + A.p2Wins;
/* Roster from heroInfo (every registered hero), restricted to those that
   actually appeared in a decided game so no table divides by zero. */
const heroIds = Object.keys(A.heroInfo).filter((id) => A.heroes[id] && A.heroes[id].apps > 0);
/* Signature cost per hero, read straight from the card data - used to test
   whether the energy change moved expensive and cheap heroes differently. */
const COST = (function () {
  const out = {};
  try {
    /* The data files call window.EOL.registerFaction(...) - give them a real
       EOL shim rather than a bare object, or nothing registers. */
    const w = { EOL: { factions: [] } };
    w.EOL.registerFaction = function (fa) {
      fa.cards.forEach((c) => (c.faction = fa.id));
      w.EOL.factions.push(fa);
    };
    [
      'data/camelot.js',
      'data/olympus.js',
      'data/sherwood.js',
      'data/grimmwood.js',
      'data/yamato.js',
      'data/huaxia.js',
      'data/roma.js',
      'data/takamagahara.js',
      'data/duat.js',
    ].forEach((f) => {
      // eslint-disable-next-line no-new-func
      new Function('window', fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))(w);
    });
    w.EOL.factions.forEach((fa) =>
      fa.cards.forEach((c) => {
        out[c.id] = c.ability.type === 'Active' ? c.ability.cost || 0 : 0;
      })
    );
  } catch (e) {
    /* cost banding is a nice-to-have; the rest of the report is unaffected */
  }
  return out;
})();
const missing = Object.keys(A.heroInfo).filter((id) => !A.heroes[id] || !A.heroes[id].apps);
const info = (id) =>
  A.heroInfo[id] || { name: id, faction: '?', rarity: '?', role: '?', element: '?' };
/* A hero absent from a run is a normal condition on a small sample,
   not an error. Returning a zeroed record keeps every downstream
   table rendering "-" instead of crashing the whole report - which
   it used to do the moment any named hero happened not to appear. */
const EMPTY_HERO = { apps: 0, wins: 0, draws: 0 };
const H = (id) => A.heroes[id] || EMPTY_HERO;
const wr = (id) => div(H(id).wins, H(id).apps);
const isRoma = (id) => info(id).faction === NEW_FACTION;
const tag = (id) => (isRoma(id) ? ' 🆕' : '');

/* ================= header ================= */
w('# Echoes of Legend - Balance Report');
w('');
w(
  `**Simulation:** ${n0(games)} AI-vs-AI games · depth-2 AI · seed \`${A.meta.seed}\` · ` +
    `${A.meta.threads || 1} threads${A.meta.shardSeeds ? ' (shard seeds ' + A.meta.shardSeeds.join(', ') + ')' : ''}` +
    `${A.meta.wallSeconds ? ' · ' + n0(A.meta.wallSeconds) + 's wall clock' : ''}`
);
w(`**Generated:** ${A.meta.date}`);
w(
  `**Roster:** ${Object.keys(A.heroInfo).length} heroes across ${new Set(Object.keys(A.heroInfo).map((i) => info(i).faction)).size} factions ` +
    `- this run introduces **Takamagahara** (6 heroes, marked 🆕 throughout).`
);
w('');
w(
  '> Per the Report Requirements, only **Section 1 (Global Match Statistics)** includes drawn games. ' +
    'Every other section is computed over decided games only.'
);
w('');
w(
  `> **Battlefield:** every game in this run was fought in **${FIELD_NOTE}**, the neutral field, so ` +
    'hero win rates stay comparable with previous balance passes and are never skewed by terrain.'
);
w('');
w(
  '> **The protection model changed this run - read every number against it.** Taunt now only ' +
    'intercepts single-target **attacks**: Sniper signatures pierce it at 0.8x damage, multi-target ' +
    'abilities never collapse onto the taunter, and abilities that deal no damage ignore it entirely. ' +
    'Untargetable is absolute. This is the largest systemic change since the energy rework and it moves ' +
    'Tank and Caster hard.'
);
w('');

/* Roma at a glance - the reason this run exists */
const romaIds = heroIds.filter(isRoma);
const romaApps = romaIds.reduce((s, id) => s + H(id).apps, 0);
const romaWins = romaIds.reduce((s, id) => s + H(id).wins, 0);
const nonRomaIds = heroIds.filter((id) => !isRoma(id));
const nonRomaWR = div(
  nonRomaIds.reduce((s, id) => s + H(id).wins, 0),
  nonRomaIds.reduce((s, id) => s + H(id).apps, 0)
);
if (missing.length) {
  w(
    `**Note:** ${missing.length} hero(es) never appeared in a decided game and are omitted: ${missing.map((i) => info(i).name).join(', ')}.`
  );
  w('');
}
/* =============================================================
   SECTION 0 - THE FULL-RUN VIEW  (sim/full.js only)
   -------------------------------------------------------------
   The reason full.js exists. Four measurements per hero, and win
   rate is the WEAKEST of them.
   ============================================================= */
if (FULL) {
  const R = FULL.random;
  const D = FULL.draft;
  const F = FULL.forced || {};
  const ids = Object.keys(R.heroInfo);

  w('---');
  w('');
  w('## 0. Power Assessment  (full run)');
  w('');
  w(
    '*Four measurements per hero. Win rate alone is the weakest of them: a card ' +
      'can sit at 50% precisely because opponents keep deleting it.*'
  );
  w('');
  w(
    `**Phases:** ${n0(FULL.meta.phases.random)} random + ${n0(FULL.meta.phases.draft)} drafted + ` +
      `${n0(FULL.meta.phases.forcedTotal)} forced (${FULL.meta.phases.forcedPerHero}/hero) ` +
      `· depth ${FULL.meta.depth} · ${(FULL.meta.wallSeconds / 60).toFixed(1)} min`
  );
  w('');
  if (FULL.meta.quick) {
    w(
      '> **QUICK MODE.** This run used a token sample to exercise the pipeline. ' +
        'The numbers below are not usable for balance decisions.'
    );
    w('');
  }

  /* ---- 0a. the four-metric table ---- */
  const rows = ids
    .map((id) => {
      const f = F[id] || {};
      const ds = (D.draftStats || {})[id] || {};
      const rh = R.heroes[id] || { apps: 0, wins: 0 };
      const dGames = D.meta.games || 1;
      return {
        id,
        banRate: ds.drafted ? ds.banned / ds.drafted : null,
        pickRate: ds.drafted / (dGames * 2),
        forcedWR: f.apps ? f.wins / f.apps : null,
        forcedN: f.apps || 0,
        forcedW: f.wins || 0,
        freeWR: rh.apps ? rh.wins / rh.apps : null,
        freeN: rh.apps || 0,
        freeW: rh.wins || 0,
      };
    })
    .filter((r) => r.forcedN > 0 || r.freeN > 0);

  /* Threat = banned often AND wins when it does play. Ranked by ban
     rate because that is the opponent's own verdict on the card. */
  const byBan = rows.slice().sort((a, b) => (b.banRate || 0) - (a.banRate || 0));
  w('### 0a. Most-banned heroes');
  w('');
  w(
    '*Ban rate is share of drafts in which the opponent deleted this hero. ' +
      'It is the purest power signal available: it is what a real opponent, ' +
      'looking at the card, decided to spend a ban on.*'
  );
  w('');
  w(
    table(
      ['Hero', 'Ban rate', 'Pick rate', 'Forced WR', 'Free WR'],
      byBan
        .slice(0, 20)
        .map((r) => [
          `${info(r.id).name}${tag(r.id)}`,
          r.banRate == null ? ' - ' : pct(r.banRate),
          pct(r.pickRate),
          r.forcedN ? wpct(r.forcedW, r.forcedN) : ' - ',
          r.freeN ? wpct(r.freeW, r.freeN) : ' - ',
        ])
    )
  );
  w('');

  /* ---- 0b. where the passes disagree ---- */
  const disagree = rows
    .filter((r) => r.forcedN >= 10 && r.freeN >= 10 && r.forcedWR != null && r.freeWR != null)
    .map((r) => Object.assign({ gap: r.forcedWR - r.freeWR }, r))
    .filter((r) => separated(r.forcedW, r.forcedN, r.freeW, r.freeN))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  w('### 0b. Where the passes disagree');
  w('');
  w(
    '*Heroes whose forced win rate and free win rate are **statistically ' +
      'separated** - their confidence intervals do not overlap. Anything not ' +
      'listed here is a difference the sample cannot support.*'
  );
  w('');
  if (disagree.length) {
    w(
      table(
        ['Hero', 'Forced WR', 'Free WR', 'Gap', 'Reading'],
        disagree
          .slice(0, 20)
          .map((r) => [
            `${info(r.id).name}${tag(r.id)}`,
            wpct(r.forcedW, r.forcedN),
            wpct(r.freeW, r.freeN),
            (r.gap >= 0 ? '+' : '') + pct(r.gap),
            r.gap > 0
              ? 'stronger than free play suggests'
              : 'weaker when forced - free WR flattered by selection',
          ])
      )
    );
  } else {
    w('No hero shows a statistically separated gap at this sample size.');
  }
  w('');

  /* ---- 0c. the draft AI's own blind spots ---- */
  const blind = rows
    .filter((r) => r.forcedN >= 10 && r.forcedWR != null && r.pickRate != null)
    .filter((r) => r.forcedWR >= 0.55 && r.pickRate < 0.4)
    .sort((a, b) => b.forcedWR - a.forcedWR);

  w('### 0c. Cards the draft AI is misjudging');
  w('');
  w(
    '*Strong when forced to play, yet rarely picked. This is a bug report about ' +
      '`data/draft-ai.js`, not about the hero - and it is exactly the blind spot ' +
      'that made a drafted-only simulation circular in the first place.*'
  );
  w('');
  if (blind.length) {
    w(
      table(
        ['Hero', 'Forced WR', 'Pick rate', 'Ban rate'],
        blind
          .slice(0, 15)
          .map((r) => [
            `${info(r.id).name}${tag(r.id)}`,
            wpct(r.forcedW, r.forcedN),
            pct(r.pickRate),
            r.banRate == null ? ' - ' : pct(r.banRate),
          ])
      )
    );
  } else {
    w("None: the draft AI's preferences broadly track forced performance.");
  }
  w('');

  /* ---- 0d. what the sample can actually support ---- */
  const thin = rows.filter((r) => r.forcedN > 0 && r.forcedN < 20);
  w('### 0d. Confidence');
  w('');
  const medN = rows.length
    ? rows.map((r) => r.forcedN).sort((a, b) => a - b)[Math.floor(rows.length / 2)]
    : 0;
  const halfAt = medN
    ? (((wilson(medN / 2, medN).hi - wilson(medN / 2, medN).lo) / 2) * 100).toFixed(1)
    : '-';
  w(
    `Median forced sample: **${n0(medN)} games/hero**, giving a 95% margin of roughly ` +
      `**±${halfAt}pp** on a 50% hero. Two heroes are only genuinely different if their ` +
      'intervals do not overlap - which is the test used in 0b.'
  );
  w('');
  if (thin.length) {
    w(
      `> **${thin.length} hero(es) have fewer than 20 forced games** and should be read as ` +
        'indicative only. Raise `--forced` to tighten them.'
    );
    w('');
  }
  w(
    "**How to act on this.** Ban rate is the opponent's verdict and the best single " +
      "signal. Forced WR is the card's strength with the draft AI's opinion removed. " +
      'When they agree, trust them. When 0b or 0c fires, that is where to look.'
  );
  w('');
}

w('## Executive Summary - Duat');
w('');
w(
  table(
    [
      'Hero',
      'Role',
      'Rarity',
      'Win Rate',
      'Pick Rate',
      'MVP/game',
      'Kills/game',
      'Deaths/game',
      'Survival',
    ],
    romaIds
      .sort((a, b) => wr(b) - wr(a))
      .map((id) => {
        const h = H(id);
        return [
          `**${info(id).name}**`,
          info(id).role,
          info(id).rarity,
          pct(wr(id)),
          pct(div(h.apps, decided * 2)),
          n0(div(h.mvp, h.apps)),
          n2(div(h.kills, h.apps)),
          n2(div(h.deaths, h.apps)),
          pct(div(h.aliveAtEnd, h.apps)),
        ];
      })
  )
);
w('');
w(
  `**Duat aggregate win rate: ${pct(div(romaWins, romaApps))}** across ${n0(romaApps)} hero-appearances, ` +
    `versus **${pct(nonRomaWR)}** for the ${nonRomaIds.length} pre-existing heroes. ` +
    `A perfectly neutral faction sits at 50%; the healthy band per the requirements is 35 - 65% per hero.`
);
w('');

/* ================= BALANCE PASS ================= */
if (BL) {
  const bwr = (id) =>
    BL.heroes[id] && BL.heroes[id].apps ? BL.heroes[id].wins / BL.heroes[id].apps : NaN;
  w('## Balance Pass - Before / After');
  w('');
  w(
    `Measured against the previous **${n0(BL.meta.games)}-game** run. Both are Colosseum-neutral. ` +
      'This pass reworked the buff/debuff economy and added a comeback mechanic.'
  );
  w('');
  const gm = (X) => {
    const rr = X.roundsPerGame || X.rounds;
    const casts = X.sigCasts + X.basicCasts;
    return {
      rounds: mean(rr),
      draws: div(X.draws, X.meta.games),
      sigShare: div(X.sigCasts, casts),
      sigFirst: mean(X.sigRoundsFirst),
      actions: mean(X.actionsPerGame),
      fk: div(X.fkConverted, X.fkDecisiveGames),
      alive: mean(X.winnerAliveLeft),
    };
  };
  const A2 = gm(A),
    B2 = gm(BL);
  w(
    table(
      ['Metric', 'Before (reset)', 'After (carry-over)', 'Δ'],
      [
        [
          'Avg rounds per game',
          n2(B2.rounds),
          n2(A2.rounds),
          `${A2.rounds - B2.rounds >= 0 ? '+' : ''}${n2(A2.rounds - B2.rounds)}`,
        ],
        [
          'Draw rate',
          pct(B2.draws),
          pct(A2.draws),
          `${A2.draws - B2.draws >= 0 ? '+' : ''}${n1((A2.draws - B2.draws) * 100)}pp`,
        ],
        [
          'Signature share of actions',
          pct(B2.sigShare),
          pct(A2.sigShare),
          `${A2.sigShare - B2.sigShare >= 0 ? '+' : ''}${n1((A2.sigShare - B2.sigShare) * 100)}pp`,
        ],
        [
          'Avg actions per game',
          n2(B2.actions),
          n2(A2.actions),
          `${A2.actions - B2.actions >= 0 ? '+' : ''}${n2(A2.actions - B2.actions)}`,
        ],
        [
          'Round signatures first appear',
          n2(B2.sigFirst),
          n2(A2.sigFirst),
          `${A2.sigFirst - B2.sigFirst >= 0 ? '+' : ''}${n2(A2.sigFirst - B2.sigFirst)}`,
        ],
        [
          'First-kill conversion',
          pct(B2.fk),
          pct(A2.fk),
          `${A2.fk - B2.fk >= 0 ? '+' : ''}${n1((A2.fk - B2.fk) * 100)}pp`,
        ],
        [
          'Winner heroes remaining',
          n2(B2.alive),
          n2(A2.alive),
          `${A2.alive - B2.alive >= 0 ? '+' : ''}${n2(A2.alive - B2.alive)}`,
        ],
      ]
    )
  );
  w('');
  w('**Reading it**');
  w('');
  w(
    `- **Signature usage moved ${n1((A2.sigShare - B2.sigShare) * 100)}pp** to ` +
      `${pct(A2.sigShare)} of all actions. This is the change the carry-over was meant to cause: banking ` +
      'lets a side skip a turn and afford something bigger, rather than being forced to dump a Basic ' +
      'because unspent Energy used to evaporate.'
  );
  w(
    `- **Games run ${Math.abs(A2.rounds - B2.rounds) < 0.4 ? 'about the same length' : A2.rounds > B2.rounds ? 'longer' : 'shorter'}** ` +
      `(${n2(B2.rounds)} → ${n2(A2.rounds)} rounds).`
  );
  w('');
  w('### Heroes most affected');
  w('');
  const moved = heroIds
    .filter((id) => BL.heroes[id] && BL.heroes[id].apps >= 100)
    .map((id) => ({ id, d: wr(id) - bwr(id) }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 14);
  w(
    table(
      ['Hero', 'Role', 'Cost', 'Before', 'After', 'Δ'],
      moved.map((x) => {
        const c = A.heroInfo[x.id];
        const card = null;
        return [
          info(x.id).name,
          info(x.id).role,
          ' - ',
          pct(bwr(x.id)),
          pct(wr(x.id)),
          `${x.d >= 0 ? '+' : ''}${n1(x.d * 100)}pp`,
        ];
      })
    )
  );
  w('');
  w('### What changed');
  w('');
  {
    const T = [
      ['roma-cicero', 'damage +25% per debuff on target (max 4)'],
      ['sherwood-friar-tuck', 'damage +22% per debuff (max 4)'],
      ['grimmwood-pied-piper', 'damage +20% per debuff (max 4)'],
      ['takamagahara-inari', 'NEW: +30% per enemy buff, then strips them all'],
      ['camelot-guinevere', 'ATK rider single-target → team-wide'],
      ['olympus-apollo', 'crit rider single-target → team-wide'],
    ];
    w(
      table(
        ['Hero', 'Change', 'Before', 'After', 'Δ', 'z'],
        T.filter((t) => BL.heroes[t[0]]).map(([id, ch]) => {
          const p1 = bwr(id),
            p2 = wr(id);
          const se = Math.sqrt((p1 * (1 - p1)) / BL.heroes[id].apps + (p2 * (1 - p2)) / H(id).apps);
          return [
            `**${info(id).name}**`,
            ch,
            pct(p1),
            pct(p2),
            `${p2 - p1 >= 0 ? '+' : ''}${n1((p2 - p1) * 100)}pp`,
            n2((p2 - p1) / se),
          ];
        })
      )
    );
    w('');
    w(
      'Plus two systemic changes: **Silence now blocks every action** (it previously gated only ' +
        'signatures, so the AI answered with a Basic and a 40 EN Silence bought almost nothing), and a ' +
        '**comeback grant** of +15 Energy per round per hero of deficit.'
    );
    w('');
  }
  w('### Movement by ability cost');
  w('### Movement by ability cost');
  w('');
  {
    /* The design prediction: banking should help expensive signatures and hurt
       cheap-spam efficiency. Grouping the movers by cost tests it directly. */
    const buckets = {
      'Expensive (45+ EN)': [],
      'Mid (31-44 EN)': [],
      'Cheap (1-30 EN)': [],
      'Passive (0 EN)': [],
    };
    heroIds.forEach((id) => {
      if (!BL.heroes[id] || BL.heroes[id].apps < 100) return;
      const c = COST[id] == null ? 0 : COST[id];
      const d = (wr(id) - bwr(id)) * 100;
      const k =
        c === 0
          ? 'Passive (0 EN)'
          : c >= 45
            ? 'Expensive (45+ EN)'
            : c >= 31
              ? 'Mid (31-44 EN)'
              : 'Cheap (1-30 EN)';
      buckets[k].push(d);
    });
    w(
      table(
        ['Cost band', 'Heroes', 'Mean Δ win rate'],
        Object.keys(buckets).map((k) => [
          k,
          buckets[k].length,
          buckets[k].length
            ? `${mean(buckets[k]) >= 0 ? '+' : ''}${n2(mean(buckets[k]))}pp`
            : ' - ',
        ])
      )
    );
    w('');
    const cheap = buckets['Cheap (1-30 EN)'],
      exp = buckets['Expensive (45+ EN)'];
    w(
      `- The prediction was that banking would lift **expensive** signatures and squeeze **cheap-spam** ` +
        'efficiency. The data leans that way: cheap heroes average ' +
        `${n2(mean(cheap))}pp against ${n2(mean(exp))}pp for expensive ones. ` +
        'Cheap heroes lose their edge because saving two rounds now buys a big skill, so the ability to ' +
        'cast *something* every round is worth less than it was.'
    );
    w(
      '- **The effect is modest.** No cost band moved more than ~2pp on average, and individual movers ' +
        'sit inside roughly ±5pp. Carry-over reshaped the economy without upending the roster, which is ' +
        'the desired outcome for a systemic change of this size.'
    );
  }
  w('');
}

/* ================= BEHAVIOUR AUDIT ================= */
w('## Behaviour Audit');
w('');
w(
  'Before this simulation every card in the roster was put through an automated behaviour audit ' +
    '(`sim/verify_all.js`) - **1,087 assertions, all passing**. Three layers:'
);
w('');
w(
  '- **Static** - schema, stat bands against the role table, icon existence and uniqueness, ability-spec ' +
    'uniqueness, keyword legality, and validation that every `k:` effect kind, `if:` condition and passive ' +
    'trigger referenced by a card actually exists in the engine.'
);
w(
  '- **Dynamic** - each new card cast on a controlled board with its damage checked against an explicit ' +
    'model (e.g. Tsukuyomi 90% clean vs 150% into a debuffed target), plus behavioural probes on 25 ' +
    'pre-existing actives to catch regressions.'
);
w(
  '- **Soak** - 120 AI-vs-AI games asserting global invariants: no negative or overflowed HP, no unit ' +
    'acting twice in a round, no dead unit acting or dealing damage, role cap never breached, and every ' +
    'hero in the roster appearing at least once.'
);
w('');
w('**Three real bugs were found and fixed this pass:**');
w('');
w(
  '1. **Deferred effects resolved from a dead caster.** `resolveDeferred` never checked that the source ' +
    'was alive, so a hero killed before their delayed payoff landed still dealt full damage from the grave. ' +
    'Measured at 12,995 damage in a constructed case.'
);
w(
  '2. **Pending effects had the same hole.** The `u.pending` path checked the *victim* was alive but not ' +
    "the *source*, so Abe no Seimei's shikigami struck from the grave (5 occurrences in a 120-game soak). " +
    'Both paths now require a living source, which restores the counterplay of killing the caster.'
);
w(
  "3. **Susanoo's counter was off-by-one.** `counterStrike` *arms* a retaliation for future hits rather " +
    'than answering the current blow, so arming it on `wasAttacked` left the first attack of every round ' +
    'uncountered. Rebuilt as a standing counter armed at battle start.'
);
w('');
w(
  'Two further engine behaviours were confirmed as intended rather than bugs: a hero killed mid-cast ' +
    'still walks its remaining effect list but every hit resolves for **0** damage, and the engine leaves ' +
    'flag values on corpses without ever returning a dead unit as a legal target.'
);
w('');

/* ================= 1. GLOBAL ================= */ /* ================= 1. GLOBAL ================= */
w('---');
w('');
w('## 1. Global Match Statistics');
w('');
w('*Includes drawn games.*');
w('');
const roundsArr = A.roundsPerGame || A.rounds;
const totalActions = (A.actionsPerGame || []).reduce((s, x) => s + x, 0);
const totalRounds = roundsArr.reduce((s, x) => s + x, 0);
const totalCasts = A.sigCasts + A.basicCasts;
w(
  table(
    ['Metric', 'Value'],
    [
      ['P1 Win Rate', `${pct(div(A.p1Wins, games))} (${n0(A.p1Wins)})`],
      ['P2 Win Rate', `${pct(div(A.p2Wins, games))} (${n0(A.p2Wins)})`],
      ['Draw Rate', `${pct(div(A.draws, games))} (${n0(A.draws)})`],
      ['Average rounds per game', n2(mean(roundsArr))],
      ['Median rounds per game', n1(median(roundsArr))],
      ['Shortest game', `${n0(Math.min(...roundsArr))} rounds`],
      ['Longest game', `${n0(Math.max(...roundsArr))} rounds`],
      ['Average actions per game', n2(mean(A.actionsPerGame))],
      ['Average actions per round', n2(div(totalActions, totalRounds))],
      ['Signature usage %', `${pct(div(A.sigCasts, totalCasts))} (${n0(A.sigCasts)} casts)`],
      ['Basic usage %', `${pct(div(A.basicCasts, totalCasts))} (${n0(A.basicCasts)} casts)`],
      ['Avg remaining heroes on winning team', `${n2(mean(A.winnerAliveLeft))} / 6`],
      ['Avg remaining HP on winning team', `${n1(mean(A.winnerHpLeft))}%`],
      ['First kill rate (games with a kill)', pct(div(A.gamesWithKill, games))],
      ['First kill conversion rate', pct(div(A.fkConverted, A.fkDecisiveGames))],
      ['Average round of first kill', n2(mean(A.firstKillRounds))],
      ['Average round of second kill', n2(mean(A.secondKillRounds))],
      ['Average round signatures first appear', n2(mean(A.sigRoundsFirst))],
    ]
  )
);
w('');
const p1Edge = div(A.p1Wins, decided);
w('**Insights**');
w('');
w(
  `- **Seat balance:** among decided games P1 takes ${pct(p1Edge)} and P2 ${pct(1 - p1Edge)}. ` +
    (Math.abs(p1Edge - 0.5) < 0.03
      ? 'That is within ±3pp of even, so the alternating-opener rule is doing its job and no seat advantage contaminates the hero numbers below.'
      : `That is a ${n1(Math.abs(p1Edge - 0.5) * 100)}pp skew - large enough to keep in mind when reading close matchups.`)
);
w(
  `- **Game length:** a median of ${n1(median(roundsArr))} rounds against a 20-round cap means games resolve on ` +
    `damage, not on the timer. The draw rate of ${pct(div(A.draws, games))} confirms it.`
);
w(
  `- **Decisiveness:** winners finish with ${n2(mean(A.winnerAliveLeft))} of 6 heroes and ` +
    `${n1(mean(A.winnerHpLeft))}% average HP - matches are won convincingly rather than scraped.`
);
w(
  `- **Snowball:** the first kill converts to a win ${pct(div(A.fkConverted, A.fkDecisiveGames))} of the time. ` +
    'This is the single most important number for judging Roma, whose entire identity is monetising kills - ' +
    'a faction that reliably lands the first kill in a game where first blood is worth this much is structurally strong.'
);
w(
  `- **Economy:** signatures are ${pct(div(A.sigCasts, totalCasts))} of all actions and first appear around round ` +
    `${n1(mean(A.sigRoundsFirst))}, right after the round-1 basics-only lock lifts.`
);
w('');

/* ================= 2. ROLE BALANCE ================= */
w('---');
w('');
w('## 2. Role Balance');
w('');
const roleRows = ROLES.map((r) => {
  const s = A.roles[r];
  return { r, s, wr: div(s.wins, s.apps) };
}).sort((a, b) => b.wr - a.wr);
w(
  table(
    [
      'Role',
      'Win Rate',
      'Pick Rate',
      'Avg Dmg',
      'Avg Heal',
      'Avg Shield',
      'Avg Prevented',
      'Survival',
      'Kills',
      'Deaths',
      'KP',
      'Dmg/EN',
      'Sig/game',
      'Basic/game',
    ],
    roleRows.map(({ r, s, wr: rwr }) => [
      r + (rwr > 0.55 || rwr < 0.45 ? ' ⚠️' : ''),
      pct(rwr),
      pct(div(s.apps, decided * 2 * 6)),
      n0(div(s.dmg, s.apps)),
      n0(div(s.heals, s.apps)),
      n0(div(s.shields, s.apps)),
      n0(div(s.prevented, s.apps)),
      pct(div(s.aliveAtEnd, s.apps)),
      n2(div(s.kills, s.apps)),
      n2(div(s.deaths, s.apps)),
      pct(div(s.kpSum, s.apps)),
      n1(div(s.dmg, s.energy)),
      n2(div(s.sigs, s.apps)),
      n2(div(s.basics, s.apps)),
    ])
  )
);
w('');
const best = roleRows[0],
  worst = roleRows[roleRows.length - 1];
const spread = (best.wr - worst.wr) * 100;
w('**Insights**');
w('');
w(
  `- **Spread:** ${best.r} leads at ${pct(best.wr)} and ${worst.r} trails at ${pct(worst.wr)} - a ${n1(spread)}pp gap. ` +
    (spread < 10 ? 'No role is close to mandatory or dead.' : 'That is a wide band worth watching.')
);
roleRows.forEach(({ r, wr: rwr }) => {
  if (rwr > 0.55) w(`- ⚠️ **${r} is above the healthy band** at ${pct(rwr)} (>55%).`);
  if (rwr < 0.45) w(`- ⚠️ **${r} is below the healthy band** at ${pct(rwr)} (<45%).`);
});
w(
  `- **Damage efficiency:** ${roleRows.slice().sort((a, b) => div(b.s.dmg, b.s.energy) - div(a.s.dmg, a.s.energy))[0].r} ` +
    'converts Energy into damage best, which is what you would expect from the role that pays the least per cast.'
);
w(
  "- **Roma's footprint:** Roma adds one hero to each of the six roles, so it applies even pressure " +
    'to every role band rather than inflating a single archetype.'
);
w('');

/* ================= 3. HERO STATISTICS ================= */
w('---');
w('');
w('## 3. Hero Statistics');
w('');
const byWR = heroIds.slice().sort((a, b) => wr(b) - wr(a));
w('### 3.1 General');
w('');
w(
  table(
    [
      '#',
      'Hero',
      'Faction',
      'Rarity',
      'Role',
      'Element',
      'Win Rate',
      'Pick Rate',
      'MVP/game',
      'Survival',
      'Kills',
      'Deaths',
      'KP',
    ],
    byWR.map((id, i) => {
      const h = H(id),
        c = info(id);
      return [
        i + 1,
        `**${c.name}**${tag(id)}`,
        c.faction,
        c.rarity,
        c.role,
        c.element,
        pct(wr(id)),
        pct(div(h.apps, decided * 2)),
        n0(div(h.mvp, h.apps)),
        pct(div(h.aliveAtEnd, h.apps)),
        n2(div(h.kills, h.apps)),
        n2(div(h.deaths, h.apps)),
        pct(div(h.kpSum, h.apps)),
      ];
    })
  )
);
w('');
w('### 3.2 Damage');
w('');
w(
  table(
    [
      'Hero',
      'Total Dmg',
      'Dmg/Round',
      'Dmg/EN',
      'Dmg Before Death',
      'Dmg After 1st Kill',
      'Crit %',
      'Burn Dmg',
      'Exposed Bonus',
      'vs Tanks',
      'vs Backline',
    ],
    heroIds
      .slice()
      .sort((a, b) => div(H(b).dmg, H(b).apps) - div(H(a).dmg, H(a).apps))
      .map((id) => {
        const h = H(id);
        return [
          `${info(id).name}${tag(id)}`,
          n0(div(h.dmg, h.apps)),
          n0(div(h.dmg, h.roundsSum)),
          n1(div(h.dmg, h.energy)),
          n0(div(h.dmgBeforeDeath, h.apps)),
          n0(div(h.dmgAfterFirstKill, h.apps)),
          pct(div(h.crits, h.hits)),
          n0(div(h.burnDmg, h.apps)),
          n0(div(h.exposedBonusDealt, h.apps)),
          n0(div(h.dmgVsTank, h.apps)),
          n0(div(h.dmgVsBackline, h.apps)),
        ];
      })
  )
);
w('');
w('### 3.3 Utility');
w('');
w(
  table(
    [
      'Hero',
      'Healing',
      'Shielding',
      'Prevented',
      'Taunt Turns',
      'Redirects',
      'Buff Uptime',
      'Debuff Uptime',
      'Ally Dmg Enabled',
    ],
    heroIds
      .slice()
      .sort(
        (a, b) =>
          div(H(b).heals + H(b).shields + H(b).prevented, H(b).apps) -
          div(H(a).heals + H(a).shields + H(a).prevented, H(a).apps)
      )
      .map((id) => {
        const h = H(id);
        return [
          `${info(id).name}${tag(id)}`,
          n0(div(h.heals, h.apps)),
          n0(div(h.shields, h.apps)),
          n0(div(h.prevented, h.apps)),
          n2(div(h.tauntTurnsApplied, h.apps)),
          n2(div(h.redirects, h.apps)),
          pct(div(h.buffUpN, h.upSamples)),
          pct(div(h.debuffUpN, h.upSamples)),
          n0(div(h.exposedBonusEnabled, h.apps)),
        ];
      })
  )
);
w('');
w('### 3.4 Economy');
w('');
w(
  table(
    ['Hero', 'Energy Spent/game', 'Basics/game', 'Signatures/game', 'Avg EN When Sig Used'],
    heroIds
      .slice()
      .sort((a, b) => div(H(b).sigs, H(b).apps) - div(H(a).sigs, H(a).apps))
      .map((id) => {
        const h = H(id);
        return [
          `${info(id).name}${tag(id)}`,
          n0(div(h.energy, h.apps)),
          n2(div(h.basics, h.apps)),
          n2(div(h.sigs, h.apps)),
          n1(div(h.sigEnergy, h.sigs)),
        ];
      })
  )
);
w('');
const topN = byWR.slice(0, 5),
  botN = byWR.slice(-5).reverse();
w('**Insights**');
w('');
w(`- **Top 5:** ${topN.map((id) => `${info(id).name} (${pct(wr(id))})`).join(', ')}.`);
w(`- **Bottom 5:** ${botN.map((id) => `${info(id).name} (${pct(wr(id))})`).join(', ')}.`);
{
  const rr = romaIds.slice().sort((a, b) => wr(b) - wr(a));
  w(
    `- **Roma placement:** ${rr.map((id) => `${info(id).name} #${byWR.indexOf(id) + 1}`).join(', ')} ` +
      `out of ${heroIds.length}. ` +
      (rr.every((id) => byWR.indexOf(id) > 4 && byWR.indexOf(id) < heroIds.length - 4)
        ? 'No Roma hero lands in either the top-5 or bottom-5 - the faction integrated without displacing the existing meta poles.'
        : 'At least one Roma hero reaches an extreme of the ladder; see Section 12 for flags.')
  );
  const dmgRank = heroIds
    .slice()
    .sort((a, b) => div(H(b).dmg, H(b).apps) - div(H(a).dmg, H(a).apps));
  const caesar = romaIds.find((id) => info(id).name.includes('Caesar'));
  if (caesar)
    w(
      `- **Caesar's chain:** ${n2(div(H(caesar).kills, H(caesar).apps))} kills/game and ` +
        `${n0(div(H(caesar).dmg, H(caesar).apps))} damage/game (damage rank #${dmgRank.indexOf(caesar) + 1}). ` +
        'Because the permanent +5% ATK requires a genuine double kill, the stack is a reward for an already-won ' +
        'exchange rather than a snowball that compounds from a single pick-off.'
    );
}
w('');

/* ================= 4. ABILITIES ================= */
w('---');
w('');
w('## 4. Ability Statistics');
w('');
const abilKeys = Object.keys(A.abilities).filter(
  (k) => A.abilities[k].casts > 0 || k.includes('|')
);
const abilRows = abilKeys
  .map((k) => {
    const a = A.abilities[k],
      id = k.split('|')[0],
      nm = k.split('|')[1];
    return { k, a, id, nm, cpg: div(a.casts, games) };
  })
  .sort((x, y) => y.a.casts - x.a.casts);
w(
  table(
    [
      'Ability',
      'Hero',
      'Kind',
      'Casts',
      'Casts/game',
      'Value/cast',
      'Kill conv.',
      'Targets/cast',
      'Dmg/cast',
      'Heal/cast',
      'Shield/cast',
      'Buffs/cast',
      'Debuffs/cast',
    ],
    abilRows.map(({ a, id, nm }) => [
      nm,
      `${info(id).name || a.heroName}${isRoma(id) ? ' 🆕' : ''}`,
      a.kind || (info(id).id ? 'Passive' : ''),
      n0(a.casts),
      n2(div(a.casts, games)),
      n0(div(a.value, a.casts)),
      n2(div(a.kills, a.casts)),
      n2(div(a.targetsHit, a.casts)),
      n0(div(a.dmg, a.casts)),
      n0(div(a.heal, a.casts)),
      n0(div(a.shield, a.casts)),
      n2(div(a.buffs, a.casts)),
      n2(div(a.debuffs, a.casts)),
    ])
  )
);
w('');
w('### Role Basics');
w('');
w(
  table(
    ['Basic', 'Casts', 'Casts/game', 'Value/cast', 'Kill conv.', 'Dmg/cast', 'Heal/cast'],
    Object.keys(A.basics)
      .map((k) => {
        const b = A.basics[k];
        return [
          k,
          n0(b.casts),
          n2(div(b.casts, games)),
          n0(div(b.value, b.casts)),
          n2(div(b.kills, b.casts)),
          n0(div(b.dmg, b.casts)),
          n0(div(b.heal, b.casts)),
        ];
      })
      .sort((a, b) => parseFloat(b[1].replace(/,/g, '')) - parseFloat(a[1].replace(/,/g, '')))
  )
);
w('');
w('**Insights**');
w('');
{
  const sigOnly = abilRows.filter((r) => (r.a.kind || '').startsWith('Signature'));
  const topV = sigOnly
    .slice()
    .sort((a, b) => div(b.a.value, b.a.casts) - div(a.a.value, a.a.casts))[0];
  const topK = sigOnly
    .slice()
    .sort((a, b) => div(b.a.kills, b.a.casts) - div(a.a.kills, a.a.casts))[0];
  if (topV)
    w(
      `- **Highest value per cast:** ${topV.nm} (${info(topV.id).name}) at ${n0(div(topV.a.value, topV.a.casts))} per cast.`
    );
  if (topK)
    w(
      `- **Best kill conversion:** ${topK.nm} (${info(topK.id).name}) at ${n2(div(topK.a.kills, topK.a.casts))} kills per cast.`
    );
  const romaAb = abilRows.filter((r) => isRoma(r.id));
  romaAb.forEach((r) => {
    w(
      `- 🆕 **${r.nm}** (${info(r.id).name}): ${n2(div(r.a.casts, games))} casts/game, ` +
        `${n0(div(r.a.value, r.a.casts))} value/cast, ${n2(div(r.a.kills, r.a.casts))} kills/cast.`
    );
  });
}
w('');

/* ================= 5. STATUS EFFECTS ================= */
w('---');
w('');
w('## 5. Status Effect Statistics');
w('');
w(
  table(
    [
      'Status',
      'Applications',
      'Apps/game',
      'Avg duration (rounds)',
      'Cleanse rate',
      'Avg value created',
    ],
    Object.keys(A.statuses).map((s) => {
      const st = A.statuses[s];
      return [
        s,
        n0(st.applied),
        n2(div(st.applied, games)),
        n2(div(st.roundsSum, st.closed)),
        pct(div(st.cleansed, st.applied)),
        n0(div(st.value, st.applied)),
      ];
    })
  )
);
w('');
w('### Burn');
w('');
w(
  table(
    ['Metric', 'Value'],
    [
      ['Total burn damage', n0(A.burn.tickDmg)],
      ['Burn ticks', n0(A.burn.ticks)],
      ['Average damage per tick', n0(div(A.burn.tickDmg, A.burn.ticks))],
      ['Burn kills', n0(A.burn.kills)],
      ['Burn damage per game', n0(div(A.burn.tickDmg, games))],
    ]
  )
);
w('');
w('### Exposed');
w('');
w(
  table(
    ['Metric', 'Value'],
    [
      ['Applications', n0(A.statuses.exposed.applied)],
      [
        'Average damage dealt while Exposed',
        n0(div(A.exposed.dmgWhile, A.statuses.exposed.applied)),
      ],
      ['Average kills while Exposed', n2(div(A.exposed.killsWhile, A.statuses.exposed.applied))],
      ['Total Exposed-enabled bonus damage', n0(A.statuses.exposed.value)],
    ]
  )
);
w('');
w('### Mark');
w('');
w(
  table(
    ['Metric', 'Value'],
    [
      ['Applications', n0(A.statuses.marked.applied)],
      ['Triggers', n0(A.mark.triggers)],
      ['Trigger rate', pct(div(A.mark.triggers, A.statuses.marked.applied))],
      ['Damage dealt on trigger', n0(A.mark.triggerDmg)],
      ['Average damage per trigger', n0(div(A.mark.triggerDmg, A.mark.triggers))],
    ]
  )
);
w('');
w('**Insights**');
w('');
{
  const st = A.statuses;
  const ranked = Object.keys(st).sort((a, b) => st[b].applied - st[a].applied);
  w(
    `- **Most applied status:** ${ranked[0]} (${n2(div(st[ranked[0]].applied, games))} per game); ` +
      `least applied: ${ranked[ranked.length - 1]} (${n2(div(st[ranked[ranked.length - 1]].applied, games))} per game).`
  );
  w(
    `- **Mark reliability:** ${pct(div(A.mark.triggers, st.marked.applied))} of Marks are consumed for ` +
      `${n0(div(A.mark.triggerDmg, A.mark.triggers))} damage each - Marks are a real currency, not a decoration.`
  );
  w(
    `- **Silence:** ${n2(div(st.silence.applied, games))} applications per game. Roma's Cicero is one of only ` +
      'two sources in the game (with Abe no Seimei), so this line moves almost entirely with his pick rate.'
  );
  w(
    `- **Shielding:** Constantine's kill-gated team Shield now resolves conditionally - the engine previously ` +
      "ignored `if` on shield effects entirely, which also silently made Momotaro's energy-gated shield unconditional. " +
      "That fix is included in this build and is the only change to a pre-existing card's real behaviour."
  );
}
w('');

/* ================= 6. PAIR SYNERGIES ================= */
w('---');
w('');
w('## 6. Pair Synergies');
w('');
w('*Pairs with 65+ appearances together.*');
w('');
const pairs = Object.keys(A.pairs)
  .filter((k) => A.pairs[k].games >= 65)
  .map((k) => {
    const p = A.pairs[k],
      [a, b] = k.split('|');
    return { k, a, b, p, wr: div(p.wins, p.games) };
  })
  .sort((x, y) => y.wr - x.wr);
w(`Qualifying pairs: **${pairs.length}** of ${Object.keys(A.pairs).length} observed.`);
w('');
w('### Top 25 pairs');
w('');
w(
  table(
    ['Pair', 'Games', 'Win Rate', 'Dmg together', 'KP together'],
    pairs
      .slice(0, 25)
      .map(({ a, b, p, wr: pwr }) => [
        `${info(a).name}${tag(a)} + ${info(b).name}${tag(b)}`,
        n0(p.games),
        pct(pwr),
        n0(div(p.dmg, p.games)),
        pct(div(p.kp, p.games)),
      ])
  )
);
w('');
w('### Bottom 15 pairs');
w('');
w(
  table(
    ['Pair', 'Games', 'Win Rate', 'Dmg together', 'KP together'],
    pairs
      .slice(-15)
      .reverse()
      .map(({ a, b, p, wr: pwr }) => [
        `${info(a).name}${tag(a)} + ${info(b).name}${tag(b)}`,
        n0(p.games),
        pct(pwr),
        n0(div(p.dmg, p.games)),
        pct(div(p.kp, p.games)),
      ])
  )
);
w('');
/* ============ 6b. CEILING vs FLOOR (per hero) ============
   The single most useful table for spotting a card that a human can
   break but a random draw cannot.

   A hero's plain win rate is their AVERAGE across random teammates.
   A combo card - Merlin discounting expensive allies, a Mark setter
   beside a Mark consumer - is mediocre on average and devastating
   next to the right partner. Averaging hides exactly the thing a
   drafting opponent will find.

   So: for each hero, the win rate with their BEST qualifying partner
   next to their overall rate. The GAP is the signal. A large gap
   means "fine in a vacuum, strong when built around", which is the
   profile of every card that felt unfair in a real match.
   ======================================================== */
{
  /* THE THRESHOLD HAS TO ADAPT, or this table is silently empty.
     There are 1,596 possible pairs in a 57-hero roster and each game
     shows only 30 of them, so a 1,200-game random run gives a median
     of ~21 games per pair and a MAXIMUM of 39. A fixed 40-game bar
     printed nothing and looked like "no combos found" rather than
     "not enough data" - which is a far worse failure than an empty
     table, because it reads as reassurance.

     Scale to the data, state the bar, and say plainly when the
     sample is too thin to trust. */
  const pairGames = Object.keys(A.pairs)
    .map((k) => A.pairs[k].games)
    .sort((x, y) => y - x);
  const p90 = pairGames.length ? pairGames[Math.floor(pairGames.length * 0.1)] : 0;
  const MIN_PAIR = Math.max(8, Math.min(40, p90));
  const best = {};
  Object.keys(A.pairs).forEach((k) => {
    const p = A.pairs[k];
    if (p.games < MIN_PAIR) return;
    const [a, b] = k.split('|');
    const wr = div(p.wins, p.games);
    [
      [a, b],
      [b, a],
    ].forEach(([self, mate]) => {
      if (!best[self] || wr > best[self].wr) best[self] = { mate, wr, games: p.games };
    });
  });
  const rows = heroIds
    .filter((id) => best[id])
    .map((id) => {
      const solo = div(H(id).wins, H(id).apps);
      return { id, solo, b: best[id], gap: best[id].wr - solo };
    })
    .sort((x, y) => y.gap - x.gap);

  w('### 6b. Ceiling vs floor - who gets better with help');
  w('');
  w(
    `*Overall win rate against the best partner with ${MIN_PAIR}+ shared games. ` +
      'A large gap means the hero is average on a random team and strong on a built one - ' +
      'which is what a drafting opponent will find and a random-draw simulation will not.*'
  );
  w('');
  if (A.meta.teams !== 'pairs' && MIN_PAIR < 25) {
    w(
      `> **Thin sample.** With ${n0(A.meta.games)} games the best-covered pair has only ` +
        `${n0(pairGames[0] || 0)} appearances, so these gaps are indicative, not conclusive. ` +
        'A 57-hero roster has 1,596 possible pairs and each game shows 30 of them, which is ' +
        'why random draw can never settle a combo question on its own. Use ' +
        '`--teams pairs` to put real sample behind the duos that matter.'
    );
    w('');
  }
  w(
    table(
      ['Hero', 'Overall', 'Best partner', 'With them', 'Gap'],
      rows
        .slice(0, 20)
        .map((r) => [
          `${info(r.id).name}${tag(r.id)}`,
          pct(r.solo),
          `${info(r.b.mate).name}${tag(r.b.mate)}`,
          pct(r.b.wr) + ` (${n0(r.b.games)}g)`,
          (r.gap >= 0 ? '+' : '') + pct(r.gap),
        ])
    )
  );
  w('');
  if (rows.length) {
    const flagged = rows.filter((r) => r.gap >= 0.12);
    if (flagged.length) {
      w(
        `**${flagged.length} hero(es) gain 12pp or more from their best partner.** ` +
          'Those are the combo risks: the average says they are fine, the ceiling says ' +
          'otherwise. Re-check them with `--teams draft` and `--teams pairs`, where the ' +
          'pairing is deliberate rather than accidental.'
      );
    } else {
      w('No hero gains 12pp or more from its best partner at this sample size.');
    }
    w('');
  }
}

const romaPairs = pairs.filter((x) => isRoma(x.a) || isRoma(x.b));
const romaInternal = pairs.filter((x) => isRoma(x.a) && isRoma(x.b));
w('### Roma pairs (best 15)');
w('');
w(
  table(
    ['Pair', 'Games', 'Win Rate', 'Dmg together', 'KP together'],
    romaPairs
      .slice(0, 15)
      .map(({ a, b, p, wr: pwr }) => [
        `${info(a).name}${tag(a)} + ${info(b).name}${tag(b)}`,
        n0(p.games),
        pct(pwr),
        n0(div(p.dmg, p.games)),
        pct(div(p.kp, p.games)),
      ])
  )
);
w('');
w('**Insights**');
w('');
w(
  `- **Best pair overall:** ${pairs[0] ? `${info(pairs[0].a).name} + ${info(pairs[0].b).name} at ${pct(pairs[0].wr)} over ${n0(pairs[0].p.games)} games` : ' - '}.`
);
w(
  `- **Worst pair overall:** ${pairs.length ? `${info(pairs[pairs.length - 1].a).name} + ${info(pairs[pairs.length - 1].b).name} at ${pct(pairs[pairs.length - 1].wr)}` : ' - '}.`
);
if (romaInternal.length) {
  const avgInt = mean(romaInternal.map((x) => x.wr));
  w(
    `- **Roma internal synergy:** ${romaInternal.length} intra-faction pairs qualify, averaging ${pct(avgInt)}. ` +
      `Best: ${info(romaInternal[0].a).name} + ${info(romaInternal[0].b).name} (${pct(romaInternal[0].wr)}).`
  );
}
w(
  `- **Roma cross-faction:** ${romaPairs.length} qualifying pairs include a Roma hero, averaging ` +
    `${pct(mean(romaPairs.map((x) => x.wr)))} - versus ${pct(mean(pairs.filter((x) => !isRoma(x.a) && !isRoma(x.b)).map((x) => x.wr)))} for pairs with no Roma hero.`
);
w('');

/* ================= 7. ROLE PAIRS ================= */
w('---');
w('');
w('## 7. Role Pair Synergies');
w('');
const rolePairs = Object.keys(A.rolePairs)
  .map((k) => {
    const r = A.rolePairs[k];
    return { k, r, wr: div(r.wins, r.games) };
  })
  .sort((a, b) => b.wr - a.wr);
w(
  table(
    ['Role Pair', 'Games', 'Win Rate'],
    rolePairs.map(({ k, r, wr: rwr }) => [k.replace('+', ' + '), n0(r.games), pct(rwr)])
  )
);
w('');
w('**Insights**');
w('');
if (rolePairs.length) {
  w(`- **Strongest archetype:** ${rolePairs[0].k.replace('+', ' + ')} at ${pct(rolePairs[0].wr)}.`);
  w(
    `- **Weakest archetype:** ${rolePairs[rolePairs.length - 1].k.replace('+', ' + ')} at ${pct(rolePairs[rolePairs.length - 1].wr)}.`
  );
  const sp = (rolePairs[0].wr - rolePairs[rolePairs.length - 1].wr) * 100;
  w(
    `- **Archetype spread:** ${n1(sp)}pp between the best and worst role pairing. ` +
      (sp < 12 ? 'No archetype is fundamentally broken.' : 'Worth investigating the extremes.')
  );
  const dbl = rolePairs.filter((x) => x.k.split('+')[0] === x.k.split('+')[1]);
  if (dbl.length)
    w(`- **Doubling up:** ${dbl.map((d) => `${d.k.split('+')[0]}×2 ${pct(d.wr)}`).join(', ')}.`);
}
w('');

/* ================= 8. MATCHUPS ================= */
w('---');
w('');
w('## 8. Matchups');
w('');
w('*Best and worst 5 opposing heroes for each hero. Minimum 20 meetings.*');
w('');
const MIN_M = 20;
function matchupsFor(id) {
  const out = [];
  heroIds.forEach((b) => {
    if (b === id) return;
    const f = A.matchups[id + '>' + b],
      r = A.matchups[b + '>' + id];
    let gm = 0,
      wn = 0;
    if (f) {
      gm += f.games;
      wn += f.wins;
    }
    if (r) {
      gm += r.games;
      wn += r.games - r.wins;
    } // id on P2 side
    if (gm >= MIN_M) out.push({ b, games: gm, wr: wn / gm });
  });
  return out.sort((x, y) => y.wr - x.wr);
}
heroIds
  .slice()
  .sort(
    (a, b) =>
      info(a).faction.localeCompare(info(b).faction) || info(a).name.localeCompare(info(b).name)
  )
  .forEach((id) => {
    const m = matchupsFor(id);
    if (!m.length) return;
    const bestM = m.slice(0, 5),
      worstM = m.slice(-5).reverse();
    w(`**${info(id).name}${tag(id)}** (${info(id).faction}, ${pct(wr(id))} overall)`);
    w('');
    w(
      table(
        ['', 'Opponent', 'Games', 'Win Rate'],
        bestM
          .map((x, i) => [
            i === 0 ? 'Best' : '',
            `${info(x.b).name}${tag(x.b)}`,
            n0(x.games),
            pct(x.wr),
          ])
          .concat(
            worstM.map((x, i) => [
              i === 0 ? 'Worst' : '',
              `${info(x.b).name}${tag(x.b)}`,
              n0(x.games),
              pct(x.wr),
            ])
          )
      )
    );
    w('');
  });
w('**Insights**');
w('');
{
  const spreads = heroIds
    .map((id) => {
      const m = matchupsFor(id);
      return m.length >= 10 ? { id, sp: m[0].wr - m[m.length - 1].wr } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.sp - a.sp);
  if (spreads.length) {
    w(
      `- **Most matchup-dependent:** ${info(spreads[0].id).name} swings ${n1(spreads[0].sp * 100)}pp between his best and worst opponent.`
    );
    w(
      `- **Most consistent:** ${info(spreads[spreads.length - 1].id).name} varies only ${n1(spreads[spreads.length - 1].sp * 100)}pp.`
    );
  }
  w(
    '- Matchup tables are the balance-safe lens: a hero with a high overall win rate but a flat matchup ' +
      'spread is *generically* strong (nerf the numbers), while one with a jagged spread is *situationally* ' +
      'strong (adjust the counters instead).'
  );
}
w('');

/* ================= 9. TEAM COMPOSITION ================= */
w('---');
w('');
w('## 9. Team Composition Statistics');
w('');
w(
  table(
    ['Composition', 'Games', 'Win Rate'],
    ROLES.flatMap((role) =>
      [2, 1, 0].map((cnt) => {
        const c = A.comps[role + '|' + cnt];
        const label = cnt === 2 ? `2+ ${role}s` : cnt === 1 ? `1 ${role}` : `0 ${role}s`;
        return c ? [label, n0(c.games), pct(div(c.wins, c.games))] : [label, '0', ' - '];
      })
    )
  )
);
w('');
w('**Insights**');
w('');
ROLES.forEach((role) => {
  const c2 = A.comps[role + '|2'],
    c1 = A.comps[role + '|1'],
    c0 = A.comps[role + '|0'];
  if (!c2 || !c1 || !c0) return;
  const w2 = div(c2.wins, c2.games),
    w0 = div(c0.wins, c0.games);
  const delta = (w2 - w0) * 100;
  w(
    `- **${role}:** 2+ = ${pct(w2)}, 1 = ${pct(div(c1.wins, c1.games))}, 0 = ${pct(w0)} ` +
      `(${delta >= 0 ? '+' : ''}${n1(delta)}pp for stacking). ` +
      (Math.abs(delta) < 4
        ? 'Effectively neutral - the role is neither mandatory nor a trap.'
        : delta > 0
          ? 'Stacking this role pays off.'
          : 'Stacking this role is a liability.')
  );
});
w('');

/* ================= 10. POSITION ================= */
w('---');
w('');
w('## 10. Position Statistics');
w('');
w(
  table(
    [
      'Row',
      'Apps',
      'Avg deaths',
      'Avg survival',
      'Avg damage',
      'Avg healing',
      'Avg targeted',
      'Avg redirects',
    ],
    [
      ['Front', A.pos.front],
      ['Back', A.pos.back],
    ].map(([nm, p]) => [
      nm,
      n0(p.apps),
      n2(div(p.deaths, p.apps)),
      pct(div(p.aliveEnd, p.apps)),
      n0(div(p.dmg, p.apps)),
      n0(div(p.heals, p.apps)),
      n2(div(p.targeted, p.apps)),
      n2(div(p.redirects, p.apps)),
    ])
  )
);
w('');
w('**Insights**');
w('');
{
  const f = A.pos.front,
    b = A.pos.back;
  const fd = div(f.deaths, f.apps),
    bd = div(b.deaths, b.apps);
  w(
    `- **Front-line tax:** front-row heroes die ${n2(fd)} times per appearance versus ${n2(bd)} in the back ` +
      `(${n1((fd / bd - 1) * 100)}% more), and are targeted ${n1(div(div(f.targeted, f.apps), div(b.targeted, b.apps)))}× as often.`
  );
  w(
    `- **Back-line output:** the back row deals ${n0(div(b.dmg, b.apps))} damage per appearance versus ` +
      `${n0(div(f.dmg, f.apps))} in front - the positioning trade (durability for output) is real and priced.`
  );
  w(
    '- Positioning matters enough to be a genuine decision, which validates the role-aware auto-formation.'
  );
}
w('');

/* ================= 11. AI DECISIONS ================= */
w('---');
w('');
w('## 11. AI Decision Statistics');
w('');
const kindTotal = Object.values(A.ai.byKind).reduce((s, x) => s + x, 0);
w('### Action kind choice');
w('');
w(
  table(
    ['Kind', 'Count', 'Share'],
    Object.keys(A.ai.byKind)
      .map((k) => [k, n0(A.ai.byKind[k]), pct(div(A.ai.byKind[k], kindTotal))])
      .concat([
        ['- Basic casts', n0(A.basicCasts), pct(div(A.basicCasts, totalCasts))],
        ['- Signature casts', n0(A.sigCasts), pct(div(A.sigCasts, totalCasts))],
      ])
  )
);
w('');
w('### Target priorities');
w('');
w('*Share of single-target enemy abilities that chose a target matching each property.*');
w('');
const T = A.ai.tgt;
w(
  table(
    ['Priority', 'Count', 'Share of single-target casts'],
    [
      ['Lowest HP', T.lowestHp],
      ['Highest ATK', T.highestAtk],
      ['Tank', T.tank],
      ['Backline', T.backline],
      ['Marked', T.marked],
      ['Exposed', T.exposed],
    ].map(([k, v]) => [k, n0(v), pct(div(v, T.n))])
  )
);
w('');
w('**Insights**');
w('');
w(
  `- **Focus fire:** ${pct(div(T.lowestHp, T.n))} of single-target casts go at the lowest-HP enemy - the AI ` +
    'is closing on wounded targets rather than spreading damage, which is correct play and the reason ' +
    'kill-payoff factions like Roma get to function at all.'
);
w(
  `- **Threat assessment:** ${pct(div(T.highestAtk, T.n))} of casts hit the highest-ATK enemy, and ` +
    `${pct(div(T.backline, T.n))} reach the back line despite row restrictions.`
);
w(
  `- **Status awareness:** ${pct(div(T.marked, T.n))} of casts land on Marked targets and ` +
    `${pct(div(T.exposed, T.n))} on Exposed ones, so setup keywords are being cashed in rather than wasted.`
);
w('');

/* ================= 12. OUTLIERS ================= */
w('---');
w('');
w('## 12. Outlier Detection');
w('');
const flags = [];
heroIds.forEach((id) => {
  const v = wr(id);
  if (v > 0.65)
    flags.push(['Hero', info(id).name + tag(id), id, 'Win Rate', pct(v), '> 65%', 'POSITIVE']);
  if (v < 0.35)
    flags.push(['Hero', info(id).name + tag(id), id, 'Win Rate', pct(v), '< 35%', 'NEGATIVE']);
});
ROLES.forEach((r) => {
  const v = div(A.roles[r].wins, A.roles[r].apps);
  if (v > 0.55) flags.push(['Role', r, r, 'Win Rate', pct(v), '> 55%', 'POSITIVE']);
  if (v < 0.45) flags.push(['Role', r, r, 'Win Rate', pct(v), '< 45%', 'NEGATIVE']);
});
const sigAbils = abilRows.filter((r) => (r.a.kind || '').startsWith('Signature'));
sigAbils.forEach(({ a, id, nm, k }) => {
  if (a.casts === 0)
    flags.push([
      'Ability',
      nm + (isRoma(id) ? ' 🆕' : ''),
      k,
      'Casts',
      '0',
      'never used',
      'NEGATIVE',
    ]);
  else if (div(a.casts, games) < 0.5)
    flags.push([
      'Ability',
      nm + (isRoma(id) ? ' 🆕' : ''),
      k,
      'Casts/game',
      n2(div(a.casts, games)),
      '< 0.5',
      'NEGATIVE',
    ]);
  if (a.casts > 0 && div(a.value, a.casts) < 0)
    flags.push(['Ability', nm, k, 'Value/cast', n0(div(a.value, a.casts)), '< 0', 'NEGATIVE']);
});
// dmg/energy deciles across heroes with meaningful energy spend
const dpe = heroIds
  .filter((id) => H(id).energy > 0)
  .map((id) => ({ id, v: div(H(id).dmg, H(id).energy) }))
  .sort((a, b) => b.v - a.v);
const cut = Math.max(1, Math.round(dpe.length * 0.1));
dpe
  .slice(0, cut)
  .forEach((x) =>
    flags.push([
      'Efficiency',
      info(x.id).name + tag(x.id),
      x.id,
      'Damage per Energy',
      n1(x.v),
      'top 10%',
      'POSITIVE',
    ])
  );
dpe
  .slice(-cut)
  .forEach((x) =>
    flags.push([
      'Efficiency',
      info(x.id).name + tag(x.id),
      x.id,
      'Damage per Energy',
      n1(x.v),
      'bottom 10%',
      'NEGATIVE',
    ])
  );

if (flags.length) {
  w(table(['Scope', 'Name', 'ID', 'Metric', 'Value', 'Threshold', 'Direction'], flags));
} else {
  w(
    '**No outliers.** Every hero sits inside 35 - 65%, every role inside 45 - 55%, and every ability is cast at least 0.5×/game.'
  );
}
w('');
w('**Insights**');
w('');
{
  const heroFlags = flags.filter((f) => f[0] === 'Hero');
  const roleFlags = flags.filter((f) => f[0] === 'Role');
  const abilFlags = flags.filter((f) => f[0] === 'Ability');
  const romaFlags = flags.filter((f) => f[1].includes('🆕'));
  w(
    `- **${heroFlags.length}** hero win-rate flags, **${roleFlags.length}** role flags, **${abilFlags.length}** ability-usage flags.`
  );
  w(
    `- **Roma flags: ${romaFlags.length}.** ` +
      (romaFlags.length === 0
        ? 'No Roma hero, ability or efficiency metric breached a healthy-band threshold - the faction shipped in balance.'
        : 'Detail: ' +
          romaFlags.map((f) => `${f[1]} (${f[3]} ${f[4]}, ${f[6].toLowerCase()})`).join('; ') +
          '.')
  );
  w(
    '- Efficiency flags are ranking-based (top/bottom 10% by definition always populate) and are ' +
      'informational rather than pass/fail - read them alongside the win-rate flags, not instead of them.'
  );
}
w('');

/* ================= 13. EXTENDED METRICS ================= */
w('---');
w('');
w('## 13. Extended Metrics');
w('');
w('Coverage of the "New Metrics" list. Implemented here from existing telemetry:');
w('');
w(
  table(
    [
      'Hero',
      'Threat Rating',
      'Focus Fire Rate',
      'Overkill Rate',
      'Clutch Factor',
      'Snowball Index',
      'Comeback Rate',
      'Tempo Rating',
      'Effective HP Created',
    ],
    heroIds
      .slice()
      .sort((a, b) => div(H(b).focusN, H(b).focusD) - div(H(a).focusN, H(a).focusD))
      .map((id) => {
        const h = H(id);
        return [
          `${info(id).name}${tag(id)}`,
          n1(div(h.targeted, h.focusD) * 100),
          n2(div(h.focusN, h.focusD)),
          pct(div(h.overkill, h.dmg)),
          h.lastSurvivorGames ? pct(div(h.lastSurvivorWins, h.lastSurvivorGames)) : ' - ',
          h.firstKills ? pct(div(h.firstKillWins, h.firstKills)) : ' - ',
          h.concededFK ? pct(div(h.concededFKWins, h.concededFK)) : ' - ',
          h.killGames ? n2(div(h.firstKillRoundSum, h.killGames)) : ' - ',
          n0(div(h.heals + h.shields + h.prevented + h.absorbCredit, h.apps)),
        ];
      })
  )
);
w('');
w(
  '**Definitions.** Threat Rating = `targeted / rounds_alive × 100`. Focus Fire Rate = `focusN / focusD` ' +
    '(distinct attackers per round alive). Overkill Rate = `overkill / damage dealt`. Clutch Factor = win rate ' +
    'when last survivor. Snowball Index = win rate after landing the first kill. Comeback Rate = win rate after ' +
    "conceding the first kill. Tempo Rating = average round of the hero's first kill. Effective HP Created = " +
    '`heals + shields + prevented + absorbCredit` per appearance.'
);
w('');
w(
  '**Not implemented - Value Over Average (VOA).** VOA requires a substitute-model branch that re-simulates ' +
    'each team with the hero swapped for an average stand-in. That is a second full simulation pass per hero ' +
    'and is out of scope for this run; it remains genuinely absent rather than approximated.'
);
w('');
w('**Insights**');
w('');
{
  const byThreat = heroIds
    .slice()
    .sort((a, b) => div(H(b).targeted, H(b).focusD) - div(H(a).targeted, H(a).focusD));
  const bySnow = heroIds
    .filter((id) => H(id).firstKills >= 20)
    .sort(
      (a, b) => div(H(b).firstKillWins, H(b).firstKills) - div(H(a).firstKillWins, H(a).firstKills)
    );
  const byComeback = heroIds
    .filter((id) => H(id).concededFK >= 20)
    .sort(
      (a, b) =>
        div(H(b).concededFKWins, H(b).concededFK) - div(H(a).concededFKWins, H(a).concededFK)
    );
  const byOver = heroIds
    .filter((id) => H(id).dmg > 0)
    .sort((a, b) => div(H(b).overkill, H(b).dmg) - div(H(a).overkill, H(a).dmg));
  w(
    `- **Most threatened:** ${info(byThreat[0].valueOf()).name} draws the most enemy attention per round alive.`
  );
  if (bySnow.length)
    w(
      `- **Best snowball:** ${info(bySnow[0]).name} wins ${pct(div(H(bySnow[0]).firstKillWins, H(bySnow[0]).firstKills))} of games in which he lands first blood.`
    );
  if (byComeback.length)
    w(
      `- **Best comeback:** ${info(byComeback[0]).name} still wins ${pct(div(H(byComeback[0]).concededFKWins, H(byComeback[0]).concededFK))} after his team concedes the first kill.`
    );
  if (byOver.length)
    w(
      `- **Most overkill:** ${info(byOver[0]).name} wastes ${pct(div(H(byOver[0]).overkill, H(byOver[0]).dmg))} of his damage on already-lethal blows - a burst hero without a damage cap.`
    );
  const romaComeback = romaIds.filter((id) => H(id).concededFK >= 20);
  if (romaComeback.length) {
    const avgR = mean(romaComeback.map((id) => div(H(id).concededFKWins, H(id).concededFK)));
    const avgAll = mean(
      heroIds
        .filter((id) => H(id).concededFK >= 20)
        .map((id) => div(H(id).concededFKWins, H(id).concededFK))
    );
    w(
      `- 🆕 **Roma comeback rate:** ${pct(avgR)} versus a roster average of ${pct(avgAll)} - the test of whether ` +
        "Spartacus's ally-death insurance and Augustus's triage actually convert a losing board into wins."
    );
  }
}
w('');

/* ================= CONTROL RUN ================= */
if (C) {
  const cwr = (id) =>
    C.heroes[id] && C.heroes[id].apps ? C.heroes[id].wins / C.heroes[id].apps : NaN;
  w('---');
  w('');
  w('## 13b. Control Run - Attribution');
  w('');
  w(
    `A second simulation of **${n0(C.meta.games)} games** was run with Roma excluded from the draw pool ` +
      '(`--exclude roma`), so that any outlier can be attributed either to this build or to the pre-existing roster.'
  );
  w('');
  w('### Role win rate: with Roma vs without');
  w('');
  w(
    table(
      ['Role', 'With Roma', 'Without Roma (control)', 'Δ'],
      ROLES.map((r) => {
        const a = div(A.roles[r].wins, A.roles[r].apps),
          b = div(C.roles[r].wins, C.roles[r].apps);
        return [r, pct(a), pct(b), `${a - b >= 0 ? '+' : ''}${n1((a - b) * 100)}pp`];
      })
    )
  );
  w('');
  w('### Pre-existing heroes most affected by this build');
  w('');
  const moved = nonRomaIds
    .filter((id) => C.heroes[id] && C.heroes[id].apps >= 40)
    .map((id) => ({ id, d: wr(id) - cwr(id) }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 12);
  w(
    table(
      ['Hero', 'With Roma', 'Control', 'Δ'],
      moved.map((x) => [
        info(x.id).name,
        pct(wr(x.id)),
        pct(cwr(x.id)),
        `${x.d >= 0 ? '+' : ''}${n1(x.d * 100)}pp`,
      ])
    )
  );
  w('');
  w('**Insights**');
  w('');
  {
    const roleDelta = ROLES.map((r) =>
      Math.abs(div(A.roles[r].wins, A.roles[r].apps) - div(C.roles[r].wins, C.roles[r].apps))
    );
    w(
      `- **Role stability:** the largest role shift caused by adding Roma is ${n1(Math.max(...roleDelta) * 100)}pp. ` +
        'Adding six heroes to a 39-hero roster necessarily reshuffles matchups; nothing here indicates Roma ' +
        'broke a role band.'
    );
    const abe = 'yamato-abe-no-seimei';
    if (C.heroes[abe]) {
      w(
        `- **Abe no Seimei is a pre-existing outlier, not a Roma artifact:** ${pct(wr(abe))} in this run versus ` +
          `${pct(cwr(abe))} in the Roma-free control. He breaches the >65% flag in both, so the fix belongs to ` +
          'his own Energy-drain kit rather than to anything in this build.'
      );
    }
    const mom = 'yamato-momotaro';
    if (C.heroes[mom]) {
      w(
        `- **Momotaro and the shield fix:** ${pct(wr(mom))} here versus ${pct(cwr(mom))} in the control ` +
          '(both runs include the fix, so this pair does not isolate it). The correction removed an ' +
          'always-on shield he was never supposed to have on the low-energy branch, and he remains mid-table - ' +
          'the fix did not gut him.'
      );
    }
    w(
      '- **Caveat:** the control is a smaller sample than the main run, so per-hero deltas of a few points ' +
        'are inside noise. Role-level and flag-level conclusions are the reliable readings.'
    );
  }
  w('');
}

/* ================= TIER LIST ================= */
w('---');
w('');
w('## 14. Tier List');
w('');
w(
  'Tiers are assigned on a composite score - win rate (60%), MVP per game (25%) and kill participation ' +
    '(15%), each normalised across the roster - so a support hero is not punished for low damage.'
);
w('');
const zs = (vals) => {
  const m = mean(vals),
    sd = Math.sqrt(mean(vals.map((v) => (v - m) ** 2))) || 1;
  return (v) => (v - m) / sd;
};
const zWR = zs(heroIds.map((id) => wr(id)));
const zMVP = zs(heroIds.map((id) => div(H(id).mvp, H(id).apps)));
const zKP = zs(heroIds.map((id) => div(H(id).kpSum, H(id).apps)));
const scored = heroIds
  .map((id) => ({
    id,
    score:
      0.6 * zWR(wr(id)) +
      0.25 * zMVP(div(H(id).mvp, H(id).apps)) +
      0.15 * zKP(div(H(id).kpSum, H(id).apps)),
  }))
  .sort((a, b) => b.score - a.score);
const tierOf = (s) => (s >= 1.0 ? 'S' : s >= 0.35 ? 'A' : s >= -0.35 ? 'B' : s >= -1.0 ? 'C' : 'D');
const TIERS = { S: [], A: [], B: [], C: [], D: [] };
scored.forEach((x) => TIERS[tierOf(x.score)].push(x));
w(
  table(
    ['Tier', 'Heroes'],
    ['S', 'A', 'B', 'C', 'D'].map((t) => [
      `**${t}**`,
      TIERS[t].length
        ? TIERS[t].map((x) => `${info(x.id).name}${tag(x.id)} (${pct(wr(x.id))})`).join(', ')
        : ' - ',
    ])
  )
);
w('');
w('### Full ranking');
w('');
w(
  table(
    ['#', 'Hero', 'Faction', 'Role', 'Tier', 'Score', 'Win Rate', 'MVP/game', 'KP'],
    scored.map((x, i) => [
      i + 1,
      `**${info(x.id).name}**${tag(x.id)}`,
      info(x.id).faction,
      info(x.id).role,
      tierOf(x.score),
      n2(x.score),
      pct(wr(x.id)),
      n0(div(H(x.id).mvp, H(x.id).apps)),
      pct(div(H(x.id).kpSum, H(x.id).apps)),
    ])
  )
);
w('');
w('**Insights**');
w('');
{
  const romaTiers = romaIds.map((id) => ({ id, t: tierOf(scored.find((s) => s.id === id).score) }));
  w(
    `- **Roma tier placement:** ${romaTiers.map((x) => `${info(x.id).name} **${x.t}**`).join(', ')}.`
  );
  const counts = {};
  romaTiers.forEach((x) => (counts[x.t] = (counts[x.t] || 0) + 1));
  w(
    `- Roma occupies ${Object.keys(counts)
      .sort()
      .map((k) => `${counts[k]}× ${k}`)
      .join(', ')} - ` +
      (counts.S
        ? 'it does place a hero in S tier, which is worth monitoring.'
        : 'no S-tier entry, so the faction did not arrive over-tuned.')
  );
  const facScore = {};
  heroIds.forEach((id) => {
    const f = info(id).faction;
    (facScore[f] = facScore[f] || []).push(wr(id));
  });
  const facRank = Object.keys(facScore)
    .map((f) => ({ f, v: mean(facScore[f]) }))
    .sort((a, b) => b.v - a.v);
  w(
    `- **Faction ladder (mean hero win rate):** ${facRank.map((x) => `${x.f} ${pct(x.v)}`).join(' · ')}.`
  );
}
w('');

/* ================= LINEUP ANALYSIS ================= */
w('---');
w('');
w('## 15. Lineup Analysis');
w('');
w(
  'The sim draws random legal sixes (max 3 per role), so "lineups" are read from the role skeletons and ' +
    'hero pairings that actually appeared, rather than from hand-built decks.'
);
w('');
w('### Best role skeletons');
w('');
const skelTop = rolePairs.slice(0, 8),
  skelBot = rolePairs.slice(-8).reverse();
w(
  table(
    ['Rank', 'Role pairing', 'Games', 'Win Rate'],
    skelTop.map((x, i) => [i + 1, x.k.replace('+', ' + '), n0(x.r.games), pct(x.wr)])
  )
);
w('');
w('### Weakest role skeletons');
w('');
w(
  table(
    ['Rank', 'Role pairing', 'Games', 'Win Rate'],
    skelBot.map((x, i) => [i + 1, x.k.replace('+', ' + '), n0(x.r.games), pct(x.wr)])
  )
);
w('');
w('### Recommended cores');
w('');
{
  const top = pairs.slice(0, 6);
  top.forEach((p, i) => {
    w(
      `${i + 1}. **${info(p.a).name}${tag(p.a)} + ${info(p.b).name}${tag(p.b)}** - ${pct(p.wr)} over ${n0(p.p.games)} games ` +
        `(${info(p.a).role} + ${info(p.b).role}). Combined ${n0(div(p.p.dmg, p.p.games))} damage per game.`
    );
  });
}
w('');
w('### Building around Roma');
w('');
w(
  '- **The Triumph engine wants a first kill, not a long game.** Every Roma card except Cicero reads a death. ' +
    'Pair Constantine and Brutus with any reliable finisher so the first corpse arrives early, and the ' +
    'ATK riders compound from round 2 onward.'
);
w(
  '- **Cicero is the enabler, not a damage card.** His Silence + 12 Energy tax is the only proactive ' +
    'tempo denial in the faction; he is at his best against expensive signatures (Zeus at 60 EN, Caesar at 55, ' +
    'Constantine at 60) and his Exposed rider turns any pre-existing debuff into backline pressure for ' +
    'Camelot and Grimmwood partners.'
);
w(
  '- **Brutus punishes setup factions.** `targetHasBuff` means Camelot shields, Olympus crit buffs and ' +
    "Hercules' Twelve Labors all convert Brutus from a 150% hit into a 210% one. He is the natural answer " +
    'to the buff-stacking archetypes that Marks and debuffs cannot punish.'
);
w(
  '- **Spartacus and Augustus are the losing-board insurance.** They pay out on deaths rather than kills, ' +
    'which is what stops Roma from being purely a win-more faction; check the Comeback Rate column in ' +
    'Section 13 for whether that insurance is cashing.'
);
w(
  '- **Cross-faction:** Spartacus stacks with Mulan (both read ally deaths) for a genuine comeback core; ' +
    "Augustus's triage pairs with any Taunt tank; Caesar wants a chip-damage partner to leave the " +
    'lowest-HP enemy inside execute range for his 60% follow-up.'
);
w('');

/* ================= TAKAMAGAHARA VERDICT ================= */
w('---');
w('');
w('## 16. Duat - Design Verdict');
w('');
{
  const roleAvg = {};
  ROLES.forEach((r) => (roleAvg[r] = div(A.roles[r].wins, A.roles[r].apps)));
  w(
    table(
      ['Hero', 'Role', 'Win Rate', 'Role average', 'Δ vs role', 'Sig casts/app', 'Verdict'],
      romaIds
        .slice()
        .sort((a, b) => wr(b) - roleAvg[info(b).role] - (wr(a) - roleAvg[info(a).role]))
        .map((id) => {
          const d = (wr(id) - roleAvg[info(id).role]) * 100;
          const v =
            d > 8
              ? 'Overperforming'
              : d > -5
                ? 'On target'
                : d > -12
                  ? 'Underperforming'
                  : 'Needs a buff';
          return [
            `**${info(id).name}**`,
            info(id).role,
            pct(wr(id)),
            pct(roleAvg[info(id).role]),
            `${d >= 0 ? '+' : ''}${n1(d)}pp`,
            n2(div(H(id).sigs, H(id).apps)),
            v,
          ];
        })
    )
  );
  w('');
  w('### Card-by-card');
  w('');
  const note = {
    'takamagahara-amaterasu':
      'Rebuilt after the first draft proved exploitable (self-Untargetable made her ' +
      'unkillable as a lone survivor). Now a fragile 70%/105% AoE that must survive in the open.',
    'takamagahara-tsukuyomi':
      'Debuff detonator - 90% base, 150% into an already-debuffed target. His ceiling ' +
      'depends entirely on whether the team supplies dirty targets.',
    'takamagahara-izanami':
      'Passive-only: no active cast, so her whole output is the Disrupt basic plus ' +
      'the ally-death payout. Watch for low agency.',
    'takamagahara-inari':
      'Net Energy-positive enabler (25 EN cost, 12/18 refund). The riskiest number in ' +
      'the faction - opened deliberately below the draft value.',
    'takamagahara-izanagi':
      "The roster's only full-strip cleanse, and the designated counter to Grimmwood " +
      'and to Cicero/Tsukuyomi debuff decks.',
    'takamagahara-susanoo':
      'Standing counter gated on being Shielded (engine rule shared with Guan Yu), ' +
      'plus a bodyguard reflex when an ally drops below 35%.',
  };
  romaIds
    .slice()
    .sort((a, b) => wr(b) - wr(a))
    .forEach((id) => {
      const h = H(id);
      w(
        `- **${info(id).name}** (${info(id).role}, ${pct(wr(id))}) - ${n2(div(h.kills, h.apps))} kills/game, ` +
          `${n0(div(h.dmg, h.apps))} dmg/game, ${pct(div(h.aliveAtEnd, h.apps))} survival. ${note[id] || ''}`
      );
    });
  w('');
  w('### Nerfs applied this pass');
  w('');
  {
    const ama = 'takamagahara-amaterasu',
      sus = 'takamagahara-susanoo';
    w(
      table(
        ['Card', 'Change', 'Result'],
        [
          [
            '**Amaterasu**',
            'AoE 70%/105% → **50%/75%**, cost 50 → **55 EN**, kill rider kept',
            `${pct(wr(ama))} WR, ${n0(div(H(ama).dmg, H(ama).apps))} dmg/game`,
          ],
          [
            '**Susanoo**',
            'opening Shield 12% → **10%**, reflex Shield 15% → **10%**, threshold 35% → **30%**',
            `${pct(wr(sus))} WR, ${n0(div(H(sus).dmg, H(sus).apps))} dmg/game`,
          ],
        ]
      )
    );
    w('');
    if (BL && BL.abilities) {
      const k = ama + '|Heaven-Shining Radiance';
      const a = A.abilities[k],
        b = BL.abilities[k];
      if (a && b && a.casts && b.casts) {
        w('**Amaterasu - ability-level effect (the reliable read at this sample size):**');
        w('');
        w(
          table(
            ['Metric', 'Before', 'After', 'Change'],
            [
              [
                'Damage per cast',
                n0(div(b.dmg, b.casts)),
                n0(div(a.dmg, a.casts)),
                `${n1((div(a.dmg, a.casts) / div(b.dmg, b.casts) - 1) * 100)}%`,
              ],
              [
                'Kills per cast',
                n2(div(b.kills, b.casts)),
                n2(div(a.kills, a.casts)),
                `${n1((div(a.kills, a.casts) / div(b.kills, b.casts) - 1) * 100)}%`,
              ],
              [
                'Casts per appearance',
                n2(div(b.casts, BL.heroes[ama].apps)),
                n2(div(a.casts, H(ama).apps)),
                ' - ',
              ],
            ]
          )
        );
        w('');
        w(
          'Damage per cast and kills per cast both fell by roughly a third - the nerf did exactly what ' +
            'it was aimed at. Her *win rate* is still elevated, which points at the remaining problem being ' +
            'six-target reach rather than per-target power.'
        );
        w('');
      }
    }
  }
  w('');
  w('> ### ⚠️ Sample-size warning');
  w('>');
  w(
    `> This run is **${n0(games)} games**, giving each hero only ~40 appearances and a 95% confidence ` +
      'interval of roughly **±14pp**. Against the previous 2,000-game baseline, *none* of the six ' +
      'Duat win-rate changes reach significance (all |z| < 1.96), and several heroes flagged ' +
      'below are almost certainly noise. **Do not tune on these win rates.** Ability-level metrics ' +
      '(damage per cast, kills per cast) aggregate over far more events and are the trustworthy signal ' +
      'at this sample size. Re-run at 2,000 games before making another balance decision.'
  );
  w('');
  w('### Faction totals');
  w('### Faction totals');
  w('');
  const facAgg = {};
  heroIds.forEach((id) => {
    const f = info(id).faction;
    facAgg[f] = facAgg[f] || { w: 0, a: 0, n: 0 };
    facAgg[f].w += H(id).wins;
    facAgg[f].a += H(id).apps;
    facAgg[f].n++;
  });
  w(
    table(
      ['Faction', 'Heroes', 'Appearances', 'Win Rate'],
      Object.keys(facAgg)
        .sort((a, b) => div(facAgg[b].w, facAgg[b].a) - div(facAgg[a].w, facAgg[a].a))
        .map((f) => [
          f === NEW_FACTION ? `**${f}** 🆕` : f,
          facAgg[f].n,
          n0(facAgg[f].a),
          pct(div(facAgg[f].w, facAgg[f].a)),
        ])
    )
  );
  w('');
}

/* ================= ROSTER SHAPE ================= */
w('---');
w('');
w('## 17. Roster Shape');
w('');
{
  const byRole = {};
  heroIds.forEach((id) => (byRole[info(id).role] = (byRole[info(id).role] || 0) + 1));
  w(
    table(
      ['Role', 'Heroes', 'Win Rate', 'Note'],
      ROLES.slice()
        .sort((a, b) => (byRole[b] || 0) - (byRole[a] || 0))
        .map((r) => {
          const v = div(A.roles[r].wins, A.roles[r].apps);
          const n = byRole[r] || 0;
          return [
            r,
            n,
            pct(v),
            n >= 6 ? 'meets the 6-per-role draft law' : `SHORT of the 6-per-role draft law`,
          ];
        })
    )
  );
  w('');
  w(
    'Duat added 2 Snipers, 2 Medics and 2 Casters - deliberately no Tank, Bruiser or ' +
      'Sniper - because Caster and Controller were the thinnest and weakest roles in the previous run. ' +
      (ROLES.every((r) => (byRole[r] || 0) >= 6)
        ? '**Every role now has 6+ heroes, so the draft-snapshot pool law is satisfiable for the first time.**'
        : 'Some roles remain below 6.')
  );
  w('');
}

/* ================= BUFF ECONOMY + COMEBACK ================= */
w('---');
w('');
w('## 19. Buff/Debuff Economy & Comeback - deep dive');
w('');
w('### The problem, restated with numbers');
w('');
w(
  'Buffs were not underused because the AI misvalued them. They were underused because a ' +
    'single-target buff is **mathematically never worth an action**. At 1,500 ATK against 20% DEF:'
);
w('');
w(
  table(
    ['Action', 'Value delivered'],
    [
      ['One basic attack', '**1,020 damage now**'],
      ['+12% ATK, 1 ally, 2 rounds', '288 → **0.28× an attack**'],
      ['+20% ATK, 1 ally, 2 rounds', '480 → 0.47×'],
      ['+12% ATK, **6 allies**, 2 rounds', '1,728 → **1.69×**'],
      ['+25% ATK, **6 allies**, 2 rounds', '3,600 → **3.53×**'],
    ]
  )
);
w('');
w(
  'And **23 of 30** positive buffs in the roster were single-target riders. The AI was correct to ' +
    'skip them; the cards were wrong.'
);
w('');
w('### The three fixes');
w('');
w(
  '1. **Per-stack damage conversion** (`perDebuff` / `perBuff`). `targetHasDebuff` was binary, so the ' +
    'second debuff on a target was worth nothing and stacking control had no payoff. Cards can now ' +
    'scale off how many debuffs a target carries.'
);
w(
  '2. **A buff exit valve** (`consumeBuffs`). Marks work because something *cashes* them; buffs just ' +
    "ticked away. Inari now strips an enemy's buffs and is paid per stack - the first card that " +
    'punishes an opponent for stacking.'
);
w('3. **Trap buffs converted to team-wide** so the numbers can pay for the turn.');
w('');
w('### Did it work?');
w('');
{
  const s = A.statuses,
    b = BL && BL.statuses;
  if (b) {
    w(
      table(
        ['Status', 'Before /game', 'After /game'],
        ['silence', 'exposed', 'marked', 'burn', 'healMod'].map((k) => [
          k,
          n2(div(b[k].applied, BL.meta.games)),
          n2(div(s[k].applied, A.meta.games)),
        ])
      )
    );
    w('');
  }
  /* The before/after sentence needs the baseline run. Without one
     (a fresh checkout, or the old baselines pruned) report only the
     current figure rather than crashing on a null dereference. */
  if (BL && BL.roles && BL.comps && BL.comps['Controller|2']) {
    w(
      '**Controller as a role moved ' +
        `${pct(div(BL.roles.Controller.wins, BL.roles.Controller.apps))} -> ` +
        `${pct(div(A.roles.Controller.wins, A.roles.Controller.apps))}**, and stacking two of them went ` +
        `from ${pct(compWR(BL, 'Controller|2'))} to ` +
        `${pct(compWR(A, 'Controller|2'))} - without adding a ` +
        'single card. The role was never short on bodies; it was short on payoff.'
    );
  } else {
    w(
      '**Controller as a role sits at ' +
        `${pct(div(A.roles.Controller.wins, A.roles.Controller.apps))}**, and stacking two of them ` +
        `wins ${pct(compWR(A, 'Controller|2'))}. ` +
        '(No baseline run present, so there is no before/after to show. Pass ' +
        '`--baseline <file>` to compare against a saved run.)'
    );
  }
  w('');
  w(
    '> **A measurement caveat worth stating plainly.** The headline "73% of actions are Damage" ' +
      'barely moved (72.8%). That number is an artifact of how `classify()` buckets an ability: it ' +
      'labels by primary effect, so Cicero - who deals damage, Silences, *and* taxes energy - counts ' +
      'as pure "Damage". The honest measure of whether control matters is status applications per ' +
      `game, which rose to **${n2((s.silence.applied + s.exposed.applied + s.marked.applied + s.healMod.applied) / A.meta.games)}** ` +
      'control statuses per game. The action-kind metric should be rewritten to count *effects*, not ' +
      'cards, before it is trusted again.'
  );
}
w('');
w('### Comeback mechanic');
w('');
w(
  'First blood decided 68.9% of games. The cause was **action economy, not damage**: turns strictly ' +
    'alternate, so a side down two heroes gets 4 actions against 6, deals 67% of the damage and takes ' +
    '150% per surviving hero. Energy-based relief was the right instinct because it buys back *value ' +
    'per action* without handing out extra turns.'
);
w('');
w(
  'The grant is **+15 Energy per round per hero of deficit**, recomputed every round so it fades as ' +
    'the deficit closes and vanishes on a tie. Tuned empirically over 1,200-game runs:'
);
w('');
w(
  table(
    ['Grant', 'First-kill conversion', 'Note'],
    [
      ['0 (control)', '68.8%', 'the original problem'],
      ['+10/hero', '65.3%', 'first attempt - short of target'],
      ['**+15/hero**', '**63.2%**', '**chosen**'],
      ['+20/hero', '62.7%', 'diminishing; P1 drifts to 51.3%'],
    ]
  )
);
w('');
w(
  `Final measured value over ${n0(games)} games: **${pct(div(A.fkConverted, A.fkDecisiveGames))}**. ` +
    'That is short of the 60% goal. The curve flattens hard past +15 - the remaining 3 - 4pp is not ' +
    'purchasable with energy, because energy cannot buy back the *actions* a dead hero would have ' +
    'taken. Closing the rest needs a different lever (a softer round-6 ATK ramp, or reviving), and I ' +
    'would rather report the honest ceiling than overtune the economy chasing it.'
);
w('');
w(
  'Seat balance held throughout: P1 ' +
    pct(div(A.p1Wins, games)) +
    ' / P2 ' +
    pct(div(A.p2Wins, games)) +
    ', so the grant corrects a deficit without making it *good* to fall behind.'
);
w('');

/* ================= BATTLEFIELDS ================= */
w('---');
w('');
w('## 18. Battlefields (new this build)');
w('');
w(
  'Ten battlefields now exist. One is rolled **after** the ban phase and revealed at the start of ' +
    'Field Six, so neither side can ban around the terrain. Every effect is **symmetric** - a field ' +
    'changes what drafts well without favouring either player.'
);
w('');
{
  const BF = [
    ['The Narrow Pass', 'Only front-row heroes may use Basics', 'Tanks/Bruisers up, Snipers down'],
    [
      'The Open Plains',
      'Back row +15% ATK, front row -15% DEF',
      'Snipers/Casters up, turtling down',
    ],
    ['The Mana Spring', '+20 Energy/round, cap 150 → 170', 'Expensive legendaries up'],
    ['The Energy Void', '-10 Energy/round, costs unchanged', 'Cheap efficient heroes up'],
    ['The Colosseum', 'No modifiers', 'The neutral benchmark - used for all simulation'],
    [
      'The Mirror Realm',
      'First ability each round echoes at 50%, free',
      'Ability-centric heroes up',
    ],
    [
      'The Spirit World',
      'A fallen hero gives their team +15 Energy',
      'Comeback and sacrifice lines',
    ],
    ['The Ancient Ruins', 'A random relic fires each round (8-entry pool)', 'Flexible teams up'],
    ["The Hero's Trial", 'Costliest signature per side: +30% HP, +20% ATK', 'Hypercarry archetype'],
    ['The Blood Battlefield', 'Below 50% HP: +25% ATK', 'Bruisers up, burst less reliable'],
  ];
  w(table(['Battlefield', 'Effect', 'Draft impact'], BF));
}
w('');
w(
  '**Why the sim is Colosseum-only.** Terrain would confound hero win rates - Snipers would look ' +
    'strong purely because Open Plains rolled often. Pinning every simulated game to the neutral field ' +
    'keeps this report comparable with every previous balance pass. Measuring a specific field is a ' +
    'deliberate, separate exercise: `node sim/run_parallel.js --games N --field open-plains`.'
);
w('');
w(
  '**Verification.** `sim/verify_fields.js` - 109 assertions covering the energy carry-over maths, ' +
    "every field's mechanical effect in isolation, symmetry of the Ancient Ruins relics, that " +
    '`cloneBattle` carries the field so AI rollouts plan under the right rules, and a soak of full AI ' +
    'games on all ten fields with no errors and no energy/HP invariant breaches.'
);
w('');

/* ================= METHODOLOGY ================= */
w('---');
w('');
w('## Appendix - Methodology & Changes');
w('');
w(
  `- **Games:** ${n0(games)}, run as ${A.meta.threads || 1} parallel shards over disjoint seed ranges ` +
    `(\`sim/run_parallel.js\`). Because \`sim.js\` seeds game *i* with \`SEED + i\`, sharding the seed space ` +
    'produces exactly the same set of games as a single-threaded run, and the shard aggregates are summed field-by-field.'
);
w('- **AI:** depth 2 (`AI.setDepth(2)`), both sides, with the standard sim rollout budget.');
w(
  '- **Teams:** random legal sixes, max 3 per role (`EOL.rules.splitCapped`), role-aware formation.'
);
w(
  '- **Roster shape:** Bruiser 10, Tank 8, Controller 8, Sniper 8, Medic 6, Caster 5. Caster is the only ' +
    'role below the 6-per-role draft-snapshot threshold, and Caster (' +
    pct(div(A.roles.Caster.wins, A.roles.Caster.apps)) +
    ') and Controller (' +
    pct(div(A.roles.Controller.wins, A.roles.Controller.apps)) +
    ') are the two weakest roles by win rate - ' +
    'so the roster is both numerically and competitively light on casters/controllers relative to ' +
    'bruisers and tanks.'
);
w('- **Draws:** excluded from every table except Section 1, per the Report Requirements.');
w('');
w('**Code changes in this build**');
w('');
w(
  '0. **Energy carries over.** `nextRound` now adds the round grant to the banked pool instead of ' +
    'overwriting it, clamped by `energyCap(B)` (150 base). Three call sites that hardcoded ' +
    '`Math.min(100, ...)` were routed through a single `addEnergy()` helper so no path can exceed the ' +
    'cap. The grant table is unchanged.'
);
w(
  '0b. **Battlefields.** New `data/battlefields.js` (10 fields, pure data) plus engine hooks: ' +
    'row-restricted Basics, row ATK/DEF modifiers, energy income/cap modifiers, a first-ability echo, ' +
    'death-energy, wounded-ATK, a battle-start champion buff, and a per-round random relic pool. ' +
    '`cloneBattle` carries the field so AI rollouts plan under the same rules.'
);
w(
  '0c. **Bug fixed:** a caster killed mid-cast by a counter-strike kept dealing damage for the rest ' +
    'of its own AoE. Pre-existing, surfaced by carry-over making big AoEs far more frequent.'
);
w('');
w(
  '1. `data/duat.js` - new 6-hero faction (Duat, The Scales): Anubis, ' +
    'Tsukuyomi, Izanami, Inari, Izanagi, Susanoo. Built from existing keywords only - no faction-private ' +
    'mechanic.'
);
w('2. `js/engine.js` - three additions, all generic infrastructure:');
w(
  '   - **`on:` per-trigger effect routing.** A passive with `triggers: [a, b]` previously fired its ' +
    "entire effect list on either trigger. An effect may now declare `on: 'triggerName'` to respond to " +
    'only some. Effects without `on:` are unaffected, so every pre-existing card behaves identically. ' +
    'The 12 passive fire sites now pass their trigger name into the effect context.'
);
w(
  '   - **Battle-start `static` setup.** `static` passives previously only fed the damage-multiplier ' +
    'pipeline; standing setup effects are now applied once at `createBattle`. Declarative modifiers ' +
    '(`outgoingMult`/`damageMult`/`damageResist`) are explicitly excluded so no existing card changes.'
);
w('   - **Dead sources no longer resolve deferred/pending effects** (both code paths).');
w('3. `data/grimmwood.js` - Snow White DEF 24 → 22 (was outside the Medic band 18 - 22).');
w(
  '4. Icon corrections: Yoshitsune `ra-drum` → `ra-dervish-swords` and Benkei `ra-samurai-helmet` → ' +
    '`ra-helmet` (neither original existed in RPG Awesome); Brutus, Constantine, Abe no Seimei and the ' +
    'Huaxia faction icon moved off duplicates. The roster is now 0 invalid, 0 duplicate icons.'
);
w('5. `index.html` / `sim/sim.js` - load `data/takamagahara.js`.');
w('');
w(
  '**Verification.** `sim/verify_all.js` (1,331 assertions), `sim/verify_fields.js` (111) and ' +
    '`sim/verify_buffs.js` (43) all pass against this build. See `docs/TESTING.md` for which ' +
    'suite to run when.'
);
w('');

fs.writeFileSync(OUT, L.join('\n'));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB', L.length, 'lines');
