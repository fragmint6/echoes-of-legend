#!/usr/bin/env node
'use strict';

/* Focused contract for the two-attempt Daily Puzzle and the mode carousel.
   The status painter runs against a tiny DOM rather than a browser so this
   check stays dependency-free and fast. */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;

function ok(cond, message) {
  if (cond) {
    pass++;
    console.log('  PASS  ' + message);
  } else {
    fail++;
    console.log('  FAIL  ' + message);
  }
}

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) {
    names.forEach((name) => this.values.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }
  toggle(name, on) {
    if (on === undefined) on = !this.values.has(name);
    if (on) this.values.add(name);
    else this.values.delete(name);
    return on;
  }
  contains(name) {
    return this.values.has(name);
  }
}

class FakeNode {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.classList = new ClassList();
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.title = '';
    this.label = null;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  querySelector(selector) {
    return selector === 'span' ? this.label : null;
  }
  addEventListener() {}
}

const ids = [
  'mode-daily',
  'daily-card-cta',
  'daily-modal',
  'daily-title',
  'daily-copy',
  'daily-status',
  'daily-enter',
  'daily-fine',
  'daily-close',
  'result',
];
const nodes = Object.fromEntries(ids.map((id) => [id, new FakeNode()]));
nodes['daily-enter'].label = new FakeNode();
nodes['daily-modal'].setAttribute('aria-hidden', 'true');

const document = {
  body: { dataset: { view: 'play' } },
  getElementById(id) {
    return nodes[id] || null;
  },
  addEventListener() {},
  dispatchEvent() {},
};
const window = {
  EOL: {},
  location: { search: '' },
  setTimeout,
  clearTimeout,
  addEventListener() {},
};

const dailySource = fs.readFileSync(path.join(ROOT, 'js/daily.js'), 'utf8');
new Function('window', 'document', dailySource)(window, document);

console.log('A. two-attempt status states');
window.EOL.daily._showOfficialStatus({
  attempts_used: 0,
  attempts_remaining: 2,
  attempted: false,
  finished: false,
  won: false,
});
ok(nodes['daily-status'].textContent === 'Ready · 2 attempts remaining', 'a fresh day offers both attempts');
ok(nodes['daily-enter'].hidden === false, 'the first attempt can be opened');
ok(nodes['daily-enter'].label.textContent === 'Begin first attempt', 'the first claim is named clearly');

window.EOL.daily._showOfficialStatus({
  attempts_used: 1,
  attempts_remaining: 1,
  attempted: false,
  finished: true,
  won: false,
});
ok(nodes['daily-status'].textContent === 'Ready · 1 attempt remaining', 'one claim leaves exactly one attempt');
ok(nodes['daily-title'].textContent === 'Second attempt awaits', 'the modal offers the second line');
ok(nodes['daily-enter'].label.textContent === 'Begin second attempt', 'the final claim is named clearly');

window.EOL.daily._showOfficialStatus({
  attempts_used: 2,
  attempts_remaining: 0,
  attempted: true,
  finished: true,
  won: false,
});
ok(nodes['daily-enter'].hidden === true, 'no third attempt can be opened');
ok(nodes['daily-title'].textContent === 'Both attempts spent', 'the exhausted state tells the truth');

/* SOLVING IT ENDS THE DAY. The second attempt is for a player who
   LOST; handing it to a winner let them re-fight a position whose
   solution they already knew and improve their recorded round count,
   which is unfair to anyone who stopped at their first win. The server
   enforces this too (docs/supabase-migration-10.sql). */
window.EOL.daily._showOfficialStatus({
  attempts_used: 1,
  attempts_remaining: 1,
  attempted: false,
  finished: true,
  won: true,
});
ok(
  nodes['daily-title'].textContent === 'Puzzle solved',
  'a first-attempt win closes the puzzle instead of offering a replay'
);
ok(
  nodes['daily-enter'].hidden === true,
  'and the enter button is gone - no second chance on a solved board'
);
ok(
  /first attempt/.test(nodes['daily-copy'].textContent),
  'the copy credits the first-attempt solve'
);
ok(
  nodes['daily-status'].textContent === 'Solved · come back at the next reset',
  'the status line stops advertising a remaining attempt'
);

/* A win on the SECOND attempt closes the day the same way, and must
   not claim it was a first-attempt solve. */
window.EOL.daily._showOfficialStatus({
  attempts_used: 2,
  attempts_remaining: 0,
  attempted: true,
  finished: true,
  won: true,
});
ok(
  nodes['daily-title'].textContent === 'Puzzle solved',
  'a second-attempt win also reads as solved, not as attempts spent'
);
ok(
  !/first attempt/.test(nodes['daily-copy'].textContent),
  'and does not falsely credit a first-attempt solve'
);

/* Losing still leaves the second attempt intact - the whole point of it. */
window.EOL.daily._showOfficialStatus({
  attempts_used: 1,
  attempts_remaining: 1,
  attempted: false,
  finished: true,
  won: false,
});
ok(
  nodes['daily-enter'].hidden === false && nodes['daily-title'].textContent === 'Second attempt awaits',
  'a LOSS still keeps the second attempt available'
);

console.log('B. atomic database contract');
const migration = fs.readFileSync(path.join(ROOT, 'docs/supabase-migration-07.sql'), 'utf8');
ok(/primary key \(puzzle_id, user_id, attempt_no\)/i.test(migration), 'attempt rows are numbered in the primary key');
ok(/check \(attempt_no between 1 and 2\)/i.test(migration), 'the table itself rejects attempt numbers outside 1–2');
ok(/pg_advisory_xact_lock/.test(migration), 'concurrent tabs serialize their claims');
ok(/if used >= 2 then[\s\S]*daily_attempts_used/.test(migration), 'the claim RPC rejects a third board');
ok(/p_attempt: B\.puzzle\.attemptNo \|\| 1/.test(dailySource), 'results report the exact numbered attempt');

/* The "a win closes the day" rule is enforced in Postgres, not only in
   the client - otherwise a crafted RPC call could still claim a third
   board on a solved puzzle. */
const mig10 = fs.readFileSync(path.join(ROOT, 'docs/supabase-migration-10.sql'), 'utf8');
ok(
  /if already_won then[\s\S]*?daily_puzzle_solved/.test(mig10),
  'the claim RPC refuses a new board once the player has already won'
);
ok(
  /bool_or\(a\.won is true\)[\s\S]*?into used, already_won/.test(mig10),
  'the win check reads the same locked attempt rows as the count'
);
ok(
  /pg_advisory_xact_lock[\s\S]*?already_won/.test(mig10),
  'and is evaluated under the advisory lock, so two tabs cannot race past it'
);
ok(
  /when coalesce\(a\.any_won, false\) then 0/.test(mig10),
  'the status RPC reports zero remaining attempts for a solved day'
);
ok(
  /if used >= 2 then[\s\S]*?daily_attempts_used/.test(mig10),
  'the two-attempt cap survives the rewrite'
);
ok(
  /row && row\.won\) remaining = 0/.test(dailySource),
  'the client independently zeroes the allowance on a won day'
);

console.log('C. carousel and Guild placeholder');
const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const play = fs.readFileSync(path.join(ROOT, 'js/play.js'), 'utf8');
ok((page.match(/data-mode-carousel/g) || []).length === 2, 'solo and multiplayer each use a carousel');
ok(/id="mode-mp-guild"[\s\S]*?aria-disabled="true"/.test(page), 'Guild Battles is a non-actionable multiplayer placeholder');
ok(/id="mode-mp-guild"[\s\S]*?Coming soon[\s\S]*?Guild Battles/.test(page), 'the Guild slide visibly says Coming soon');
ok(/scroll-snap-type:\s*x mandatory/.test(css), 'the mode track has touch-friendly horizontal snapping');
ok(/data-carousel-prev/.test(page) && /data-carousel-next/.test(page), 'each carousel exposes previous and next controls');
ok(/function showModeCard\(/.test(play) && /ArrowLeft/.test(play) && /ArrowRight/.test(play), 'carousel navigation supports programmatic and keyboard movement');
ok(/--mode-edge-fade:\s*42px/.test(css) && /mask-image:\s*linear-gradient/.test(css), 'both carousel tracks fade subtly at their left and right edges');

console.log('D. certified publication and battle presentation');
const worker = fs.readFileSync(path.join(ROOT, 'js/daily-worker.js'), 'utf8');
const nodeForge = fs.readFileSync(path.join(ROOT, 'tools/generate_daily_puzzle.js'), 'utf8');
const battle = fs.readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8');
ok(
  /function certifyRecord\(/.test(dailySource) &&
    /AI\.clearSimulationBudget\(\)/.test(dailySource) &&
    /No full-depth winning line could be certified/.test(dailySource),
  'the forge rejects every candidate without a full normal-budget depth-4 winning line'
);
ok(
  /var futureSeed = rec\.futureSeed \| 0/.test(worker) &&
    /const futureSeed = rec\.futureSeed \| 0/.test(nodeForge) &&
    !/futureSeed = randomInt32\(\)/.test(worker + nodeForge),
  'worker and Node publication serialize the certified RNG stream, never an unrelated random seed'
);
ok(
  /certificate:\s*rec\.certificate/.test(worker) && /certificate:\s*rec\.certificate/.test(nodeForge),
  'both publication paths retain certificate metrics'
);
ok(
  /if \(B\.puzzle\) return;[\s\S]*THE SCRIPTED MATCH/.test(battle),
  'Daily enemies stay on the exact certified depth-4 path instead of deeper optional pondering'
);
ok(
  /Math\.max\(0, Math\.round\(\(u\.hp \/ u\.maxHp\) \* 100\)\) \+ '%'/m.test(battle) &&
    /deadView \? '0' : Math\.ceil\(u\.hp \+ u\.shield\)/.test(battle),
  'battle flyouts show HP percent while board cards retain actual HP values'
);
/* The percentage is ROUNDED, not ceiled. Math.ceil displayed 29.01% as
   "30%", which sat inside Goldilocks' 30-70% bonus window while the
   engine read the true 29.01% and withheld the bonus - the card
   promised a trigger that could not fire. */
ok(
  !/Math\.ceil\(\(u\.hp \/ u\.maxHp\) \* 100\)/.test(battle),
  'the HP percentage never rounds UP across a bonus threshold'
);
ok(
    /\.pop-critical\s*\{[\s\S]*font-family:\s*'Cinzel'[\s\S]*font-size:\s*28px/.test(css) &&
    !/\.pop-critical\s*\{[^}]*border:/s.test(css),
  'CRITICAL uses the large damage-number typography without a label box'
);
ok(
  /fx-coin-flight/.test(battle + css) &&
    /fx-coin-spin/.test(battle + css) &&
    /coin-edge/.test(battle + css) &&
    /aria-hidden="true"/.test(battle) &&
    /returns to full HP and Energy/.test(battle),
  'the coin ceremony separates toss, spin, thickness, delayed reveal, and readable outcome'
);

/* ---- THE COIN IS A BALLISTIC TOSS ----------------------------------
   The flip read as "not a real coinflip": the arc was a hand-placed
   set of keyframes run through an ease curve (so it drifted up and
   glided down at near-constant speed), the spin eased out mid-air, and
   the fate ring was mis-centred by ~34px so it hung beside the coin
   rather than around it. These assertions pin the physics. */
function coinKeyframes(name) {
  const i = css.indexOf('@keyframes ' + name + ' {');
  if (i < 0) return '';
  let depth = 0;
  const open = css.indexOf('{', i);
  for (let k = open; k < css.length; k++) {
    if (css[k] === '{') depth++;
    else if (css[k] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, k);
    }
  }
  return '';
}
const coinFlight = [
  ...coinKeyframes('coin-toss-flight').matchAll(
    /(\d+)%\s*\{\s*transform: translate3d\(0, (-?[\d.]+)px/g
  ),
].map((m) => [+m[1], +m[2]]);
ok(coinFlight.length >= 12, 'the coin flight samples a curve densely rather than eyeballing 4 stops');
const coinApex = coinFlight.reduce((a, b) => (b[1] < a[1] ? b : a));
ok(coinApex[0] >= 40 && coinApex[0] <= 52, 'the toss apexes near mid-flight');
const slopes = (seg) => {
  const g = [];
  for (let i = 1; i < seg.length; i++)
    g.push(Math.abs(seg[i][1] - seg[i - 1][1]) / (seg[i][0] - seg[i - 1][0]));
  return g;
};
const upSlope = slopes(coinFlight.filter((p) => p[0] <= coinApex[0]));
const downSlope = slopes(coinFlight.filter((p) => p[0] >= coinApex[0] && p[1] <= 0));
ok(upSlope[0] > upSlope[upSlope.length - 1], 'the rise decelerates into the apex, as gravity requires');
ok(
  downSlope[downSlope.length - 1] > downSlope[0],
  'and the fall accelerates out of it instead of gliding'
);
ok(
  /animation: coin-toss-flight [\d.]+s linear/.test(css),
  'the flight is linear-timed so the sampled parabola is not eased a second time'
);
ok(
  /animation: coin-face-heads [\d.]+s linear/.test(css),
  'the coin spins at a constant rate instead of slowing down in mid-air'
);
for (const [spinName, deg] of [
  ['coin-face-heads', 2160],
  ['coin-face-tails', 2340],
]) {
  const end = coinKeyframes(spinName).match(
    /100%\s*\{\s*transform: rotateX\(0deg\) rotateY\((\d+)deg\)/
  );
  ok(!!end && +end[1] === deg, spinName + ' still settles on ' + deg / 360 + ' turns');
  ok(!!end && +end[1] % 180 === 0, spinName + ' lands flat on a face, never edge-on');
}
const coinAura = css.match(/\.fx-coin-aura \{([\s\S]*?)\n\}/)[1];
ok(
  -(+coinAura.match(/width:\s*(\d+)px/)[1]) / 2 === +coinAura.match(/margin:\s*(-?\d+)px/)[1],
  'the fate ring is centred on the coin rather than floating above it'
);
const coinVig = css.match(/\.fx-coin-wrap::before \{([\s\S]*?)\n\}/)[1];
ok(
  -(+coinVig.match(/height:\s*(\d+)px/)[1]) / 2 === +coinVig.match(/margin:\s*(-?\d+)px/)[1],
  'and so is the vignette behind it'
);
const coinRing = [...coinKeyframes('coin-fate-ring').matchAll(/(\d+)%\s*\{[\s\S]*?scale\(([\d.]+)\)/g)].map(
  (m) => +m[2]
);
ok(
  coinRing.length >= 4 && coinRing[coinRing.length - 1] > coinRing[0],
  'the ring expands outward on impact instead of shrinking on its own schedule'
);
ok(
  /var landAt = reduced \? \d+ : 1450;/.test(battle),
  'the landing pulse fires on the impact frame (1450ms), matching the audio landing tone'
);

console.log('\n' + (fail ? fail + ' FAILED' : 'ALL ' + pass + ' ASSERTIONS PASSED'));
process.exit(fail ? 1 : 0);
