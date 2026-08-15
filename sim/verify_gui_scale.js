/* verify_gui_scale.js - the GUI scale slider must not break the backdrop
 * or leave unpainted black strips at the edge of the screen.
 *
 * THE BUG THIS GUARDS (2026-08-15)
 * --------------------------------
 * The scale control sets `zoom` on <html> (js/app.js applyScale). Under
 * `zoom: z`, a position:fixed box with inset:0 resolves against the ZOOMED
 * viewport, so it paints only z x the real window. At the 80% portal
 * default that leaves a 384px unpainted strip down the right and 216px
 * along the bottom of a 1080p screen.
 *
 * Two visible symptoms, one cause:
 *   - backdrops (.menu-bg, .chapter-bg) stopped short of the window edge;
 *   - opaque/dark scrims (#veil, modal backdrops, the .play/.collection/
 *     .shop cinema backplate) left that strip unpainted, which reads as a
 *     BLACK BOX at the edge of the play menu and other menus.
 *
 * The fix divides width/height by --gui-z on every full-viewport fixed
 * layer. This suite asserts that every such layer carries the correction,
 * and - just as important - that PINNED fixed elements (toasts, the tutor
 * card, tooltips) do NOT, because stretching those would move them.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* css-tree is the only dependency: a real CSS parser is the point of this
   suite - classifying `position: fixed` rules with a regex is exactly the
   kind of approximation that let the bug through in the first place.
   Same lookup order the jsdom suites use. */
let csstree;
try {
  csstree = require('/tmp/node_modules/css-tree');
} catch (e) {
  try {
    csstree = require('css-tree');
  } catch (e2) {
    console.log('verify_gui_scale');
    console.log('  SKIP css-tree not installed (npm install --no-save css-tree)');
    process.exit(0);
  }
}

const ROOT = path.join(__dirname, '..');
const CSS = path.join(ROOT, 'css', 'style.css');
const APP = path.join(ROOT, 'js', 'app.js');

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log('  FAIL ' + msg);
  }
}

const src = fs.readFileSync(CSS, 'utf8');
const appSrc = fs.readFileSync(APP, 'utf8');

console.log('verify_gui_scale');

/* ---- 1. the JS side still publishes the factor ---- */
ok(
  /--gui-z/.test(appSrc),
  'applyScale publishes --gui-z'
);
ok(
  /de\.style\.setProperty\('zoom'/.test(appSrc),
  'applyScale drives root zoom'
);
ok(
  /removeProperty\('zoom'\)/.test(appSrc),
  '100% removes zoom entirely (default build untouched)'
);

/* ---- 2. classify every position:fixed rule ---- */
const ast = csstree.parse(src, { positions: true });

const fullViewport = [];
const pinned = [];

csstree.walk(ast, {
  visit: 'Rule',
  enter(node) {
    const d = {};
    csstree.walk(node.block, {
      visit: 'Declaration',
      enter(x) {
        d[x.property] = csstree.generate(x.value).trim();
      },
    });
    if (d['position'] !== 'fixed') return;

    const sel = csstree.generate(node.prelude);
    const inset = d['inset'] === '0' || d['inset'] === '0px';
    const four = ['top', 'left', 'right', 'bottom'].every(
      (k) => d[k] === '0' || d[k] === '0px'
    );
    const rec = { sel, line: node.loc.start.line, w: d['width'] || '', h: d['height'] || '' };
    if (inset || four) fullViewport.push(rec);
    else pinned.push(rec);
  },
});

ok(fullViewport.length >= 20, 'found the full-viewport fixed layers (' + fullViewport.length + ')');
ok(pinned.length >= 5, 'found the pinned fixed elements (' + pinned.length + ')');

/* ---- 3. EVERY full-viewport fixed layer counter-scales ----
   This is the assert that would have caught the original bug: .menu-bg,
   .chapter-bg, #veil and the .play::before backplate were all in this
   list and none of them divided by --gui-z. */
for (const r of fullViewport) {
  ok(
    r.w.includes('gui-z') && r.h.includes('gui-z'),
    'full-viewport layer counter-scales: ' + r.sel.slice(0, 46) + ' (line ' + r.line + ')'
  );
}

/* ---- 4. PINNED elements must NOT be stretched ----
   A toast anchored bottom-center or the tutor card at left:16px would be
   dragged off position by a width override. */
for (const r of pinned) {
  ok(
    !r.w.includes('gui-z') && !r.h.includes('gui-z'),
    'pinned element left alone: ' + r.sel.slice(0, 46) + ' (line ' + r.line + ')'
  );
}

/* ---- 5. the specific layers named in the bug report ---- */
const bySel = {};
for (const r of fullViewport) bySel[r.sel] = r;

const MUST_COVER = [
  '.menu-bg',       // home backdrop
  '.chapter-bg',    // campaign backdrop
  '#veil',          // opaque transition scrim
  '.setm',          // settings modal (where the slider lives)
  '.room-modal',
  '.deck-modal',
  '.auth-modal',
  '.result',
];
for (const sel of MUST_COVER) {
  ok(!!bySel[sel], 'known full-viewport layer present: ' + sel);
  if (bySel[sel]) {
    ok(
      bySel[sel].w.includes('gui-z'),
      sel + ' is corrected for GUI scale'
    );
  }
}

/* the cinema backplate behind play/collection/shop - the "black places in
   the play menu" - is a ::before on several views, so match on substring */
const backplate = fullViewport.find((r) => r.sel.includes('.play::before'));
ok(!!backplate, 'the play/collection/shop cinema backplate is a full-viewport layer');
if (backplate) {
  ok(backplate.w.includes('gui-z'), 'the cinema backplate is corrected for GUI scale');
}

/* ---- 6. the correction is a no-op at 100% ----
   var(--gui-z, 1) must carry the fallback, or a page that never runs
   applyScale (or runs it before the property is set) would divide by
   nothing and collapse the layer. */
const uses = src.match(/calc\(100% \/ var\(--gui-z[^)]*\)\)/g) || [];
ok(uses.length >= 40, 'the counter-scale calc is used widely (' + uses.length + ' occurrences)');
ok(
  uses.every((u) => u.includes('--gui-z, 1')),
  'every counter-scale calc carries the `, 1` fallback'
);

/* ---- 7. geometry sanity: the correction restores true coverage ---- */
function coverage(zoom, corrected) {
  /* a fixed inset:0 box paints zoom * window; dividing by zoom restores 1 */
  return corrected ? zoom * (1 / zoom) : zoom;
}
for (const pct of [80, 85, 90, 95, 100, 105, 110]) {
  const z = pct / 100;
  ok(
    Math.abs(coverage(z, true) - 1) < 1e-9,
    'corrected layer covers the full window at ' + pct + '%'
  );
}
ok(Math.abs(coverage(0.8, false) - 0.8) < 1e-9, 'uncorrected layer would cover only 80% at 80%');

console.log('  ' + pass + '/' + (pass + fail) + ' passed');
if (fail) process.exit(1);
