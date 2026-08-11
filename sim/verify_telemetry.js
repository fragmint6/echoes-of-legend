/* =============================================================
   Privacy-light measurement + feedback regression
   node sim/verify_telemetry.js
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
let JSDOM;
try {
  ({ JSDOM } = require('/tmp/node_modules/jsdom'));
} catch (e) {
  ({ JSDOM } = require('jsdom'));
}

const ROOT = path.resolve(__dirname, '..');
const html = `<!doctype html><html><body data-view="home" data-gfx="low">
  <span id="build-tag">test build</span>
  <button class="measure-opt" data-measurement="on"></button>
  <button class="measure-opt" data-measurement="off"></button>
  <button id="btn-corner-feedback"></button>
  <button id="btn-result-feedback"></button>
  <div id="feedback-modal" hidden>
    <div id="feedback-scrim"></div>
    <button id="feedback-close"></button>
    <p id="feedback-foot"></p>
    <form id="feedback-form">
      <select id="feedback-category">
        <option value="bug">Bug</option>
        <option value="balance">Balance</option>
      </select>
      <textarea id="feedback-message"></textarea>
      <input type="checkbox" id="feedback-diagnostics" checked>
      <button id="feedback-submit" type="submit"></button>
    </form>
    <button id="feedback-copy"></button>
  </div>
</body></html>`;

const dom = new JSDOM(html, {
  url: 'https://example.test/?utm_source=discord&utm_campaign=alpha',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
const calls = [];
const client = {
  rpc(name, args) {
    calls.push({ name, args });
    return Promise.resolve({ data: name === 'submit_player_feedback' ? 7 : null, error: null });
  },
};
w.EOL = {
  auth: {
    rawClient: () => client,
    onChange(fn) {
      fn(null);
    },
  },
};

w.eval(fs.readFileSync(path.join(ROOT, 'js/telemetry.js'), 'utf8'));
w.EOL.telemetry.init();

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) {
    pass++;
    console.log('  PASS  ' + message);
  } else {
    fail++;
    console.log('  FAIL  ' + message);
  }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await wait(30);
  const session = calls.find((call) => call.name === 'record_telemetry');
  ok(!!session, 'session measurement reaches the Supabase RPC');
  ok(session && session.args.p_event === 'session_started', 'the first event is session_started');
  ok(
    session && session.args.p_context.utm_source === 'discord',
    'campaign attribution is retained without a full URL'
  );
  ok(
    session && !Object.prototype.hasOwnProperty.call(session.args.p_context, 'email'),
    'measurement contains no email'
  );
  ok(
    session && !Object.prototype.hasOwnProperty.call(session.args.p_context, 'userAgent'),
    'measurement contains no full user-agent'
  );

  w.EOL.telemetry.battleStarted({ mode: 'online_classic', field: 'colosseum' });
  w.EOL.telemetry.battleCompleted({ won: true, rounds: 4 });
  await wait(30);
  ok(
    calls.some(
      (call) =>
        call.name === 'record_telemetry' &&
        call.args.p_event === 'battle_completed' &&
        call.args.p_context.mode === 'online_classic' &&
        call.args.p_context.rounds === 4
    ),
    'battle completion keeps only coarse match context'
  );

  w.EOL.telemetry.openFeedback('result');
  w.document.getElementById('feedback-message').value = 'Burn looked delayed on the enemy card.';
  w.document
    .getElementById('feedback-form')
    .dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await wait(30);
  const feedback = calls.find((call) => call.name === 'submit_player_feedback');
  ok(!!feedback, 'voluntary feedback reaches its dedicated RPC');
  ok(feedback && feedback.args.p_category === 'balance', 'feedback category is preserved');
  ok(
    feedback && feedback.args.p_context.last_battle.mode === 'online_classic',
    'opted-in diagnostics include the coarse last-match type'
  );
  ok(
    feedback && !Object.prototype.hasOwnProperty.call(feedback.args.p_context, 'email'),
    'feedback diagnostics contain no email'
  );

  const beforeOff = calls.length;
  w.EOL.telemetry.setEnabled(false);
  w.EOL.telemetry.track('view_opened', { view: 'collection' });
  await wait(20);
  ok(calls.length === beforeOff, 'measurement opt-out stops new funnel events');
  ok(
    !w.localStorage.getItem('eol.measurement.visitor'),
    'measurement opt-out erases the persistent anonymous visitor id'
  );

  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const migration = fs.readFileSync(path.join(ROOT, 'docs/supabase-migration-06.sql'), 'utf8');
  ok(
    /mode-card:nth-of-type\(4\)[\s\S]{0,180}animation-delay:\s*0\.33s/.test(css),
    'the fourth Daily card receives the final entrance stagger'
  );
  ok(
    page.lastIndexOf('<script src="js/telemetry.js"') >
      page.lastIndexOf('<script src="js/auth.js"') &&
      page.lastIndexOf('<script src="js/telemetry.js"') <
        page.lastIndexOf('<script src="js/app.js"'),
    'measurement loads after auth and before the app starts'
  );
  ok(
    /create table if not exists public\.telemetry_events/.test(migration) &&
      /create table if not exists public\.player_feedback/.test(migration),
    'migration 06 owns both private Supabase stores'
  );
  const telemetryTable = migration.match(
    /create table if not exists public\.telemetry_events \(([\s\S]*?)\n\);/
  );
  ok(
    telemetryTable && !/user_id|email|callsign/i.test(telemetryTable[1]),
    'the anonymous funnel table has no account identity fields'
  );
  const feedbackTable = migration.match(
    /create table if not exists public\.player_feedback \(([\s\S]*?)\n\);/
  );
  ok(
    feedbackTable && !/user_id|email|callsign/i.test(feedbackTable[1]),
    'the feedback inbox has no account identity fields'
  );

  console.log('\n' + (fail ? fail + ' FAILED' : 'ALL ' + pass + ' ASSERTIONS PASSED'));
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  dom.window.close();
  process.exit(1);
});
