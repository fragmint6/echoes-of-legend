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

window.EOL.daily._showOfficialStatus({
  attempts_used: 1,
  attempts_remaining: 1,
  attempted: false,
  finished: true,
  won: true,
});
ok(nodes['daily-title'].textContent === 'Puzzle solved · replay available', 'a win does not silently remove the second allowance');

console.log('B. atomic database contract');
const migration = fs.readFileSync(path.join(ROOT, 'docs/supabase-migration-07.sql'), 'utf8');
ok(/primary key \(puzzle_id, user_id, attempt_no\)/i.test(migration), 'attempt rows are numbered in the primary key');
ok(/check \(attempt_no between 1 and 2\)/i.test(migration), 'the table itself rejects attempt numbers outside 1–2');
ok(/pg_advisory_xact_lock/.test(migration), 'concurrent tabs serialize their claims');
ok(/if used >= 2 then[\s\S]*daily_attempts_used/.test(migration), 'the claim RPC rejects a third board');
ok(/p_attempt: B\.puzzle\.attemptNo \|\| 1/.test(dailySource), 'results report the exact numbered attempt');

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

console.log('\n' + (fail ? fail + ' FAILED' : 'ALL ' + pass + ' ASSERTIONS PASSED'));
process.exit(fail ? 1 : 0);
