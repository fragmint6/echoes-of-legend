/* =============================================================
   Echoes of Legend - BATTLEFIELD LOOP SEAMLESSNESS
   -------------------------------------------------------------
   Browser test. Requires puppeteer and a local server:
     cd /tmp && npm install puppeteer --no-audit --no-fund
     python3 -m http.server 8777    (from the project root)
     node sim/browser_loops.js

   A looping background must arrive back exactly where it started, or
   the restart shows as a visible snap. Three real offenders were
   found this way - the Energy Void gradient ended at 0.9 opacity and
   jumped back to 0.15, the Mana Spring ripple ended mid-fade, and
   Open Plains scrolled a 34px-period stripe by an arbitrary 90px.

   THE SUBTLETY THAT MATTERS: `currentTime` includes the animation's
   DELAY. Sampling at t=duration lands mid-cycle for every delayed
   particle, which made 508 perfectly good animations look broken.
   The end of the first cycle is at (delay + duration).

   A loop passes if its start and end states match numerically, or if
   both are effectively invisible (a particle that has faded out).
   ============================================================= */
const puppeteer = require('/tmp/node_modules/puppeteer');
const CHROME = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  });
  const p = await br.newPage();
  await p.setViewport({ width: 1600, height: 950 });
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
  const FIELDS = [
    'energy-void',
    'mana-spring',
    'open-plains',
    'spirit-world',
    'colosseum',
    'blood-battlefield',
    'ancient-ruins',
    'mirror-realm',
    'narrow-pass',
    'heros-trial',
  ];
  let total = 0;
  for (const field of FIELDS) {
    const bad = await p.evaluate(async (fid) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const fl = window.EOL.play._flat();
      window.EOL.ui.show('battle');
      window.EOL.battle.start({
        teams: { player: fl.slice(0, 6), enemy: fl.slice(6, 12) },
        field: window.EOL.battlefieldById(fid),
      });
      await sleep(500);
      const board = document.getElementById('board');
      const out = [];
      const anims = document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.target;
        return t && board.contains(t) && a.effect.getTiming().iterations === Infinity;
      });
      const num = (s) => (s || '').match(/-?[\d.]+/g) || [];
      for (const a of anims) {
        const tgt = a.effect.target,
          tim = a.effect.getTiming();
        if ((tim.direction || 'normal') !== 'normal') continue; // alternate = seamless
        const delay = tim.delay || 0,
          dur = tim.duration;
        if (!dur || !isFinite(dur)) continue;
        const read = () => {
          const cs = getComputedStyle(tgt);
          return {
            o: parseFloat(cs.opacity),
            t: cs.transform,
            bp: cs.backgroundPosition,
            bs: cs.backgroundSize,
          };
        };
        a.pause();
        a.currentTime = delay; // exact START of a cycle
        await sleep(24);
        const s0 = read();
        a.currentTime = delay + dur; // exact END of that cycle
        await sleep(24);
        const s1 = read();
        a.play();
        /* Seamless if the two ends match numerically, OR both are
          effectively invisible (a particle that has faded out). */
        const invisible = s0.o <= 0.02 && s1.o <= 0.02;
        const close = (x, y) => {
          const A = num(x),
            B = num(y);
          if (A.length !== B.length) return false;
          return A.every((v, i) => Math.abs(parseFloat(v) - parseFloat(B[i])) < 0.75);
        };
        const same =
          Math.abs(s0.o - s1.o) < 0.02 &&
          close(s0.t, s1.t) &&
          close(s0.bp, s1.bp) &&
          close(s0.bs, s1.bs);
        if (!invisible && !same) out.push({ n: a.animationName, s0, s1 });
      }
      return out;
    }, field);
    total += bad.length;
    console.log(
      ('  ' + field + '                  ').slice(0, 22) +
        (bad.length
          ? bad.length + ' CUT -> ' + [...new Set(bad.map((b) => b.n))].join(', ')
          : 'seamless')
    );
    bad
      .slice(0, 2)
      .forEach((b) =>
        console.log(
          '        ' + b.n + '  o:' + b.s0.o + '->' + b.s1.o + '  t:' + b.s0.t + ' -> ' + b.s1.t
        )
      );
  }
  console.log(
    '\n' + (total ? '== ' + total + ' NON-SEAMLESS ==' : '== ALL BOARD LOOPS SEAMLESS ==')
  );
  await br.close();
  process.exit(total ? 1 : 0);
})();
