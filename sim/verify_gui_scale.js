/* verify_gui_scale.js - the GUI scale slider must behave exactly like the
 * browser's own Ctrl +/- and nothing else.
 *
 * THE LAW (js/app.js, GUI SCALE note, model v3 2026-08-05)
 * -------------------------------------------------------
 * Ctrl +/- changes the LAYOUT VIEWPORT and lets everything reflow at a new
 * density. It does not resize the page, it does not reposition anything by
 * hand, and it does not leave dead bands. Root `zoom` reproduces that, with
 * exactly two documented gaps that applyScale() closes:
 *   (a) viewport units  -> --vw1/--vh1/--dvh1/--vmax1 recomputed as
 *                          device / zoom / 100
 *   (b) pixel media queries -> html.mqwNNN / html.mqhNNN classes
 *
 * WHAT THIS SUITE EXISTS TO PREVENT (2026-08-15)
 * ----------------------------------------------
 * A "fix" that divided full-viewport fixed layers by a --gui-z counter-scale
 * factor. The premise was wrong: under `zoom: z` the initial containing
 * block IS the zoomed viewport, so a fixed inset:0 box computes to
 * (window / z) CSS px and paints at (window / z) * z = window. It already
 * covers the window. Dividing on top made layers OVERSIZED - at 80% the
 * backdrop was drawn 2400px wide across a 1920px window, which moved the
 * gradient focal points and overflowed the 64px lattice.
 *
 * So the invariant is the opposite of a correction: NO full-viewport fixed
 * layer may carry a manual scale compensation. If one ever needs it again,
 * that is a real browser bug and it needs a probe and a comment, not a
 * silent calc().
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* css-tree gives a real parse. Classifying `position: fixed` rules with a
   regex is the kind of approximation that caused the bad fix. */
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
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

/* Assertions about what the code DOES must not read the comments: this file
   documents the two rejected models by name, and so does app.js. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');
const appCode = stripComments(app);
const cssCode = stripComments(css);

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

console.log('verify_gui_scale');

/* ---- 1. the mechanism is root zoom, and only root zoom ---- */
ok(/de\.style\.setProperty\('zoom'/.test(app), 'applyScale sets zoom on the root element');
ok(
  /if \(pct === 100\) de\.style\.removeProperty\('zoom'\)/.test(app),
  '100% removes zoom entirely, so the default build is untouched'
);
ok(
  !/document\.body\.style\.zoom/.test(appCode),
  'zoom is NOT put on body (model v1, cropped at >100%)'
);
ok(
  !/\.view[^\n]*transform:\s*scale/.test(cssCode),
  'views are NOT paint-scaled (model v2, left dead bands)'
);

/* ---- 2. the two documented gaps are still closed ---- */
ok(/--vw1/.test(app) && /--vh1/.test(app), 'paintViewport publishes --vw1/--vh1');
ok(/--dvh1/.test(app) && /--vmax1/.test(app), 'paintViewport publishes --dvh1/--vmax1');
/* Both axes must divide by the zoom factor. Dropping the divide on one of
   them silently de-syncs every vh/vw-derived length from the real viewport
   - the layout still "works", it is just wrong by the scale factor. */
ok(
  /var lw = window\.innerWidth \/ z;/.test(appCode),
  'logical width is window.innerWidth / z'
);
ok(
  /var lh = window\.innerHeight \/ z;/.test(appCode),
  'logical height is window.innerHeight / z'
);
/* and those logical numbers, not the device ones, must drive the units */
ok(
  /--vw1[\s\S]{0,80}lw \/ 100/.test(appCode),
  '--vw1 is derived from the logical width'
);
ok(
  /--vh1[\s\S]{0,80}lh \/ 100/.test(appCode),
  '--vh1 is derived from the logical height'
);
/* the same logical numbers drive the emulated breakpoints */
ok(
  /mqw[\s\S]{0,60}lw <= MQ_W/.test(appCode),
  'width breakpoints compare against the logical width'
);
ok(/mqw/.test(app) && /mqh/.test(app), 'pixel breakpoints are re-emulated as mqw/mqh classes');
ok(
  /new Event\('resize'\)/.test(app),
  'a resize is dispatched so layout sizers re-run at the new density'
);

/* ---- 3. THE REGRESSION GUARD: no manual scale compensation ----
   Any full-viewport fixed layer that divides itself by a scale factor is
   re-introducing the exact bug this file documents. */
const ast = csstree.parse(css, { positions: true });
const offenders = [];
const fullViewport = [];

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
    const full =
      d['inset'] === '0' ||
      d['inset'] === '0px' ||
      ['top', 'left', 'right', 'bottom'].every((k) => d[k] === '0' || d[k] === '0px');
    if (!full) return;
    const sel = csstree.generate(node.prelude);
    fullViewport.push(sel);
    const w = d['width'] || '';
    const h = d['height'] || '';
    if (/gui-z|--scale|scale-factor/.test(w) || /gui-z|--scale|scale-factor/.test(h)) {
      offenders.push(sel + ' (line ' + node.loc.start.line + ')');
    }
  },
});

ok(fullViewport.length >= 20, 'found the full-viewport fixed layers (' + fullViewport.length + ')');
ok(
  offenders.length === 0,
  'no full-viewport fixed layer counter-scales itself' +
    (offenders.length ? ' -> ' + offenders.join(', ') : '')
);

/* the backdrop specifically, since that is the pair that had it */
ok(
  !/\.bg-layer[\s,][^{]*\{[^}]*gui-z/.test(css),
  '.bg-layer does not divide by a scale factor'
);
ok(!/--gui-z/.test(appCode), 'app.js no longer publishes --gui-z');

/* ---- 4. rect->style conversion still has its factor ----
   This one IS legitimate: getBoundingClientRect reports zoomed px while
   style/offset* are unzoomed, so anything turning a rect into a style must
   divide. Removing it would break drag maths, not coverage. */
ok(/EOL\.scale\s*=\s*\{[^}]*factor/.test(app), 'EOL.scale.factor() is still exported');
ok(/scale\.factor\(\)/.test(app), 'app.js uses the factor for its own rect math');
const battle = fs.readFileSync(path.join(ROOT, 'js', 'battle.js'), 'utf8');
ok(/function uiS\(\)/.test(battle), 'battle.js keeps uiS() for rect->style conversion');

/* ---- 5. geometry: what root zoom actually does ----
   Encoded so the reasoning cannot drift again. */
function paintedWidth(windowPx, z, manualDivide) {
  /* the ICB is the zoomed viewport: a fixed inset:0 box is window/z CSS px */
  const cssPx = (windowPx / z) * (manualDivide ? 1 / z : 1);
  return cssPx * z; /* device px actually painted */
}
for (const pct of [80, 85, 90, 95, 100, 105, 110]) {
  const z = pct / 100;
  ok(
    Math.abs(paintedWidth(1920, z, false) - 1920) < 1e-6,
    'a plain fixed inset:0 layer covers the window exactly at ' + pct + '%'
  );
}
ok(
  Math.abs(paintedWidth(1920, 0.8, true) - 2400) < 1e-6,
  'the old manual divide would paint 2400px across a 1920px window at 80%'
);

/* ---- 6. the slider range is unchanged ---- */
ok(/SCALE_MIN = 80/.test(app), 'scale range starts at 80%');
ok(/SCALE_MAX = 110/.test(app), 'scale range ends at 110%');
ok(/SCALE_DEF = 100/.test(app), 'default scale is 100%');

console.log('  ' + pass + '/' + (pass + fail) + ' passed');
if (fail) process.exit(1);
