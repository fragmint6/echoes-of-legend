/* =============================================================
   THE POOL BUILDER'S SHELL
   node sim/verify_pool_ui.js
   -------------------------------------------------------------
   Four reports about the room UI rather than the draft itself:

     - the 36 slots should read as four rows of nine
     - the invite control still said "Check", left over from when it
       only verified that a callsign existed
     - the draft-pool dropdown had exactly one option and sat beside
       a second control for the same decision
     - Escape did not close the builder

   The Escape one is the interesting failure. pool.js DID handle
   Escape, and closing worked in isolation - but js/app.js also had a
   global Escape listener that called goBack() with no check for
   anything being open, so the key closed the builder AND navigated
   the whole view away behind it. Testing pool.js alone would have
   shown a pass; the bug only exists when both listeners are present.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const { JSDOM } = require('jsdom');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const play = fs.readFileSync(path.join(ROOT, 'js/play.js'), 'utf8');
const poolSrc = fs.readFileSync(path.join(ROOT, 'js/pool.js'), 'utf8');

/* =============================================================
   1. FOUR ROWS OF NINE
   ============================================================= */
console.log('\nTHE TRAY IS FOUR ROWS OF NINE');
{
  const dom = new JSDOM(
    '<!doctype html><html><head><style>' +
      css +
      '</style></head><body><div class="pool-slots"></div></body></html>'
  );
  const W = dom.window;
  const cols = W.getComputedStyle(W.document.querySelector('.pool-slots')).gridTemplateColumns;
  ok(/repeat\(9,/.test(cols), 'the slot tray is nine columns wide (' + cols + ')');
  ok(
    !/auto-fill|auto-fit/.test(cols),
    'and fixed, so the shape does not reflow to 7 or 11 across on another window'
  );
  /* 36 into 9 is what makes it four rows; assert the arithmetic that
     the layout depends on rather than trusting the constant. */
  const size = /var POOL_SIZE = (\d+);/.exec(poolSrc);
  ok(size && +size[1] === 36, 'the pool is still 36 cards');
  ok(+size[1] % 9 === 0 && +size[1] / 9 === 4, 'which is exactly four rows of nine');
}

/* =============================================================
   2. IT IS AN INVITE, NOT A CHECK
   ============================================================= */
console.log('\nTHE INVITE CONTROL SAYS WHAT IT DOES');
{
  const form = html.slice(html.indexOf('id="room-invite-form"'), html.indexOf('room-invite-note'));
  ok(/<span>Invite<\/span>/.test(form), 'the button reads "Invite"');
  ok(!/<span>Check<\/span>/.test(form), 'not "Check", which described the old callsign lookup');
  ok(
    !/placeholder="Invite by callsign"/.test(form),
    'the field no longer duplicates the verb in its placeholder'
  );
  ok(/placeholder="Their callsign"/.test(form), 'it just names what to type');
  /* "callsign" itself is the game's word for a username everywhere
     else, so it stays - only the stale VERB was wrong. */
  ok(/aria-label="Invite a player by callsign"/.test(form), 'the accessible name still says invite');
  ok(
    !/checks the name exists, then hands/.test(html),
    'and the comment above it no longer describes the old behaviour'
  );
}

/* =============================================================
   3. ONE POOL CONTROL, AND IT IS REQUIRED
   ============================================================= */
console.log('\nEVERY DRAFT POOL IS BUILT');
{
  ok(!/id="room-pool"[^-]/.test(html), 'the one-option "Random" dropdown is gone');
  ok(!/data-opt="custom-pool"/.test(html), 'the second, separate row is gone');
  ok(
    (html.match(/data-opt="pool"/g) || []).length === 1,
    'exactly one draft-pool row remains'
  );
  ok(/id="room-pool-count"/.test(html) && /id="room-pool-edit"/.test(html),
    'it holds the status and the Build button');
  ok(/>Not built</.test(html), 'and starts by saying the pool is not built');

  ok(!/pSel/.test(play), 'the dropdown handler is gone from play.js');
  ok(
    !/pool: s\.pool \|\| null/.test(play),
    'and the dead "pool" preset is no longer carried in settings'
  );
  ok(/pool36: null/.test(fs.readFileSync(path.join(ROOT, 'js/mp.js'), 'utf8')),
    'the room defaults declare pool36 instead');

  /* the gate */
  ok(
    /poolReady = s\.mode !== 'draft' \|\| \(s\.pool36 && s\.pool36\.length\) === POOL36/.test(play),
    'a draft cannot start until 36 cards exist'
  );
  ok(/'Build the draft pool'/.test(play), 'and the button explains why it is disabled');
  ok(
    /s\.mode !== 'draft'/.test(play),
    'Classic is unaffected - both players bring their own deck, so there is no pool'
  );

  /* the pool must survive an unrelated settings change */
  ok(
    /pool36: \(s\.pool36 && s\.pool36\.slice\(\)\) \|\| null/.test(play),
    'settingsOf carries pool36 forward, so changing the battlefield cannot erase it'
  );
}

/* =============================================================
   4. ESCAPE CLOSES THE BUILDER AND NOTHING ELSE
   ============================================================= */
console.log('\nESCAPE CLOSES WHAT IS IN FRONT OF YOU');
{
  /* app.js's overlay probe, exercised against the real markup and the
     real stylesheet. */
  const withCss = html.replace(
    /<link[^>]*style\.css[^>]*>/,
    '<style>' + css + '</style>'
  );
  const dom = new JSDOM(withCss);
  const W = dom.window,
    D = W.document;
  const start = app.indexOf('function overlayOpen()');
  const end = app.indexOf('return found;\n    }', start) + 'return found;\n    }'.length;
  ok(start > 0, 'app.js asks whether an overlay is open before backing out a view');
  const ctx = { window: W, document: D, console };
  vm.createContext(ctx);
  vm.runInContext(app.slice(start, end) + '; globalThis._ov = overlayOpen;', ctx);
  const ov = () => ctx._ov();

  ok(ov() === false, 'a bare screen reports nothing open');

  const pool = D.getElementById('pool-modal');
  pool.hidden = false;
  ok(ov() === true, 'the pool builder counts as an overlay');
  pool.hidden = true;

  const room = D.getElementById('room-modal');
  room.hidden = false;
  ok(ov() === true, 'so does the room panel - neither ever announced itself');
  room.hidden = true;

  D.body.dataset.modal = '1';
  ok(ov() === true, 'the existing body[data-modal] convention still works');
  delete D.body.dataset.modal;

  /* aria-hidden is a third convention in use, and the Daily overlay
     uses ONLY that - it would otherwise read as permanently open. */
  const daily = D.getElementById('daily-modal');
  daily.setAttribute('aria-hidden', 'false');
  ok(ov() === true, 'an aria-hidden-driven overlay is detected when open');
  daily.setAttribute('aria-hidden', 'true');
  ok(ov() === false, 'and not detected when closed');

  ok(ov() === false, 'with everything shut, Escape is free to back out a view');

  /* the guard is actually wired into the handler */
  const handler = app.slice(app.indexOf('// No Leave buttons on these screens'));
  ok(
    /if \(overlayOpen\(\)\) return;/.test(handler.slice(0, 600)),
    'the Escape-to-go-back handler defers to it'
  );

  /* BOTH LISTENERS TOGETHER - the actual reported bug. */
  const dom2 = new JSDOM(html, { runScripts: 'outside-only' });
  const W2 = dom2.window,
    D2 = W2.document;
  const cards = [];
  ['Tank', 'Bruiser', 'Caster', 'Controller', 'Medic', 'Sniper'].forEach((r) => {
    for (let i = 0; i < 10; i++)
      cards.push({
        id: r.toLowerCase() + i,
        name: r + ' ' + i,
        role: r,
        rarity: 'common',
        element: 'x',
        icon: 'ra-sword',
        ability: {},
      });
  });
  W2.EOL = {
    factions: [{ id: 'f1', name: 'F', icon: 'i', colors: { primary: '#fff' }, cards }],
    ui: {
      ROLE_ICON: {},
      buildCard: (c, f) => {
        const e = D2.createElement('article');
        e.className = 'card';
        e.dataset.id = c.id;
        e.dataset.name = c.name.toLowerCase();
        e.dataset.role = c.role;
        e.dataset.rarity = c.rarity;
        e.dataset.faction = f.id;
        return e;
      },
      buildDropdown: () => {},
    },
  };
  vm.createContext(W2);
  vm.runInContext(poolSrc, W2, { filename: 'js/pool.js' });

  return new Promise((r) => {
    if (D2.readyState === 'loading') D2.addEventListener('DOMContentLoaded', () => r());
    else r();
  }).then(() => {
    /* stand in for app.js's global handler, guard included */
    let view = 'home';
    const ctx2 = { window: W2, document: D2, console };
    vm.createContext(ctx2);
    vm.runInContext(app.slice(start, end) + '; globalThis._ov = overlayOpen;', ctx2);
    /* app.js listens on the BUBBLE phase; pool.js claims the key on
       capture. Model both faithfully - if the fixture put them in the
       same phase it would prove nothing about the real ordering. */
    D2.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (ctx2._ov()) return;
      view = 'BACKED-OUT';
    });

    const m = D2.getElementById('pool-modal');
    W2.EOL.poolBuilder.show(true, { pool: [], onCommit: () => {} });
    ok(m.hidden === false, 'the builder is open');

    D2.dispatchEvent(new W2.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(m.hidden === true, 'Escape closes the builder');
    ok(view === 'home', 'and the view behind it does NOT also back out');

    /* second press, nothing open: Escape resumes its normal job */
    D2.dispatchEvent(new W2.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(view === 'BACKED-OUT', 'with the builder shut, Escape backs out as before');

    console.log('\npass ' + pass + '  fail ' + fail);
    process.exit(fail ? 1 : 0);
  });
}
