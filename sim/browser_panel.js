/* =============================================================
   Echoes of Legend - HERO PANEL RENDERING
   -------------------------------------------------------------
   Browser test. Requires puppeteer and a local server:
     cd /tmp && npm install puppeteer --no-audit --no-fund
     python3 -m http.server 8777    (from the project root)
     node sim/browser_panel.js

   Guards two bugs that were both invisible to every other test,
   because both are about what the pixels end up doing rather than
   what the code says:

   1. CLIPPED SKILL NAMES. fitAbilityNames used to PREDICT the width
      flex would hand the name, and the prediction ran ~6px
      optimistic, so long names lost their last letters to
      overflow:hidden. It now measures the rendered result. This
      hovers every card and asserts no name overflows its box.

   2. SILENTLY UNDIMMED SKILLS. `.flyout.show .dk-ab` is more
      specific than `.dk-ab.dis`, so the entrance rule was restoring
      unusable Skills to full opacity - the greyscale survived but
      the dim did not. This reads the COMPUTED opacity.

   A source-level check would have passed in both cases. Only the
   rendered geometry catches them.
   ============================================================= */
const puppeteer = require('/tmp/node_modules/puppeteer');
const CHROME = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--blink-settings=primaryHoverType=2,availableHoverTypes=2'],
  });
  const p = await br.newPage();
  await p.setViewport({ width: 1600, height: 950 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  await p.goto(process.env.EOL_URL || 'http://localhost:8777/index.html', {
    waitUntil: 'networkidle0',
  });
  await p.evaluate(() => {
    try {
      localStorage.setItem(
        'eol.coach.v1',
        JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle'])
      );
    } catch (e) {}
  });
  await p.reload({ waitUntil: 'networkidle0' });
  let f = 0;
  const t = (ok, m) => {
    if (!ok) f++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + m);
  };

  /* ---------- BUG 1: long Skill names must not be visually clipped ----------
    Measure the rendered text width against the element's own box. If the
    text overflows, the name is being cut off on screen. */
  console.log('\n  BUG 1 - long Skill names clipped by measuring mid-transform');
  await p.evaluate(() => {
    const fl = window.EOL.play._flat();
    window.EOL.play.startPrep({
      mode: 'classic',
      player12: fl.slice(0, 12),
      enemy12: fl.slice(12, 24),
    });
  });
  await sleep(1000);

  // hover EVERY card in the grid; check each Skill name fits its box
  const bad = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = [];
    const cards = [...document.querySelectorAll('#prep-player .pcard, #prep-enemy .pcard')];
    for (const c of cards) {
      c.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await sleep(90);
      document.querySelectorAll('#prep-tip .dk-ab-name').forEach((el) => {
        // scrollWidth > clientWidth means the glyphs don't fit the box
        if (el.scrollWidth > el.clientWidth + 1) {
          out.push({ name: el.textContent, sw: el.scrollWidth, cw: el.clientWidth });
        }
      });
      c.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    }
    return out;
  });
  t(
    bad.length === 0,
    'no Skill name is clipped across all 24 prep cards' +
      (bad.length ? ' -> ' + JSON.stringify(bad.slice(0, 4)) : '')
  );

  // Zeus specifically, since that was the reported case
  const zeus = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cards = [...document.querySelectorAll('#prep-player .pcard, #prep-enemy .pcard')];
    const z = cards.find((c) => /zeus/i.test(c.dataset.cid || ''));
    if (!z) return null;
    z.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await sleep(300);
    const el = [...document.querySelectorAll('#prep-tip .dk-ab-name')].find((e) =>
      /Divine/i.test(e.textContent)
    );
    if (!el) return null;
    return {
      text: el.textContent,
      fits: el.scrollWidth <= el.clientWidth + 1,
      sw: el.scrollWidth,
      cw: el.clientWidth,
    };
  });
  t(
    zeus && zeus.text === 'Divine Judgment',
    'Zeus name renders in full: "' + (zeus && zeus.text) + '"'
  );
  t(
    zeus && zeus.fits,
    'Zeus name fits its box (' + (zeus && zeus.sw) + ' <= ' + (zeus && zeus.cw) + ')'
  );

  /* ---------- BUG 2: unusable Skills must actually be dimmed ---------- */
  console.log('\n  BUG 2 - .dis out-specified by the entrance rule');
  await p.evaluate(() => {
    const fl = window.EOL.play._flat();
    window.EOL.ui.show('battle');
    window.EOL.battle.start({ teams: { player: fl.slice(0, 6), enemy: fl.slice(6, 12) } });
  });
  await sleep(3000);
  const dim = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const B = window.EOL.battle.getState();
    B.energy.player = 0;
    window.EOL.battle.render();
    const u = B.units.find((x) => x.side === 'player');
    document.querySelector('.bcard[data-uid="' + u.uid + '"]').click();
    await sleep(800); // let the entrance transition finish
    const rows = [...document.querySelectorAll('#flyout .dk-ab')];
    const d = rows.filter((r) => r.classList.contains('dis'));
    const n = rows.filter((r) => !r.classList.contains('dis'));
    return {
      disCount: d.length,
      disOpacity: d.length ? getComputedStyle(d[0]).opacity : null,
      disFilter: d.length ? getComputedStyle(d[0]).filter : null,
      normalOpacity: n.length ? getComputedStyle(n[0]).opacity : null,
    };
  });
  t(dim.disCount > 0, 'found an unusable Skill to test (' + dim.disCount + ')');
  t(
    parseFloat(dim.disOpacity) < 0.75,
    'unusable Skill is dimmed: opacity ' + dim.disOpacity + ' (was silently 1)'
  );
  t(/grayscale/.test(dim.disFilter || ''), 'and desaturated: ' + dim.disFilter);
  t(dim.normalOpacity === '1', 'a usable Skill stays at full opacity (' + dim.normalOpacity + ')');

  t(errs.length === 0, 'no console/page errors (' + errs.length + ')');
  errs.slice(0, 4).forEach((e) => console.log('    ' + e));
  console.log(f ? '\n===== ' + f + ' FAILED =====' : '\n===== ALL PASSED =====');
  await br.close();
  process.exit(f ? 1 : 0);
})();
