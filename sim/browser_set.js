/* THE SET - end-to-end smoke: Bo3 with forced forfeits. */
const puppeteer = require('/tmp/node_modules/puppeteer'); // needs: cd /tmp && npm i puppeteer + chrome libs (see runbook S18)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let P;
const c = (sel) => P.evaluate((q) => { var el = document.querySelector(q); if (!el) throw new Error('no ' + q); el.click(); }, sel);
let f = 0;
const t = (ok, m) => console.log((ok ? '  PASS  ' : '  FAIL  ') + m) || (ok ? 0 : f++);
(async () => {
  const br = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await br.newPage(); P = p;
  await p.setViewport({ width: 1600, height: 950 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  await p.goto('http://localhost:8000/', { waitUntil: 'networkidle0' });
  await sleep(900);
  await p.evaluate(() => {
    try {
      localStorage.setItem(
        'eol.coach.v1',
        JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle'])
      );
      window.EOL.gfx.set('low');
    } catch (e) {}
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(700);

  /* --- war-length toggle exists + drives state --- */
  await p.evaluate(() => window.EOL.ui.show('play'));
  await sleep(350);
  t(await p.$('#war-length') !== null, 'war-length toggle rendered in solo grid');
  await c('#war-length .wl-opt[data-len="set"]');
  t(await p.evaluate(() => window.EOL.play.warLength() === 'set'), 'Bo3 selected + persisted');

  /* --- game 1: classic, surprise-me --- */
  await c('#mode-classic');
  await sleep(400);
  await c('.dm-row.random');
  await sleep(1200);
  t(
    await p.evaluate(() => !!window.EOL.play._setState()),
    'set state created at prep (game 1)'
  );
  t(
    await p.evaluate(() => !document.getElementById('set-fightcard').hidden),
    'fight card modal shown BEFORE bans'
  );
  t(
    await p.evaluate(
      () => document.querySelectorAll('#set-fightcard-plates .setm-plate').length === 3
    ),
    'fight card shows 3 boards'
  );
  await p.screenshot({ path: '/tmp/set_fightcard.png' });
  await c('#set-fightcard-go');
  await sleep(300);

  /* bans: pick 2 enemy cards then confirm */
  await p.evaluate(() => {
    window.EOL.play._prepState().youBans = [];
  });
  await sleep(200);
  const banIds = await p.evaluate(() => {
    var st = window.EOL.play._prepState();
    return st.enemy12.slice(0, 2).map((e) => e.card.id);
  });
  // click the prep cards for those ids via DOM scan of the enemy grid
  await p.evaluate((ids) => {
    var st = window.EOL.play._prepState();
    ids.forEach((id) => st.youBans.push(id));
  }, banIds);
  await p.evaluate(() => {
    // force a re-render and confirm through the real path
    window.EOL.ui.show('prep');
  });
  await sleep(400);
  await p.evaluate(() => { var b = document.getElementById('prep-confirm'); b.disabled = false; b.click(); });
  await sleep(2600); // reveal + sleep(1150) + battlefield modal

  /* fielding phase: pre-filled? No - game 1: pick 6 from surviving 10 */
  const fielded = await p.evaluate(() => {
    var st = window.EOL.play._prepState();
    if (!st || st.phase !== 'pick') return 'phase=' + (st && st.phase);
    var bans = st.botBans || [];
    var pool = st.player12.filter((e) => bans.indexOf(e.card.id) < 0);
    pool.slice(0, 6).forEach((e, i) => {
      (i < 3 ? st.front : st.back).push(e.card.id);
    });
    return 'ok';
  });
  t(fielded === 'ok', 'game 1 six slotted (' + fielded + ')');
  await p.evaluate(() => { var b = document.getElementById('prep-confirm'); b.disabled = false; b.click(); });
  await sleep(1800);
  t(
    await p.evaluate(() => document.body.dataset.view === 'battle'),
    'game 1 battle started'
  );
  t(
    await p.evaluate(() => {
      var c = document.getElementById('set-chip');
      return c && /Game 1/.test(c.textContent);
    }),
    'set chip visible: Game 1, 0-0'
  );

  /* forfeit game 1 -> loss recorded, sideboard offered */
  const forfeit = async () => {
    await p.evaluate(() => document.getElementById('btn-forfeit').click());
    await sleep(350);
    await p.evaluate(() => document.getElementById('btn-forfeit').click()); // armed confirm
    await sleep(3000);
  };
  await forfeit();
  const mid = await p.evaluate(() => {
    var st = window.EOL.play._setState();
    return {
      wins: st.wins,
      pending: st.pending,
      sub: document.querySelector('#result .result-sub').textContent,
      label: document.querySelector('#btn-rematch span').textContent,
    };
  });
  t(mid.wins.foe === 1 && mid.wins.you === 0, 'forfeit = game loss recorded (you 0 - foe 1)');
  t(mid.pending === 'sideboard', 'set continues: pending=sideboard');
  t(/Sideboard/.test(mid.label), 'rematch button relabelled "Sideboard"');
  await p.screenshot({ path: '/tmp/set_result_mid.png' });

  /* click Sideboard -> board-pick modal (player lost) */
  await c('#btn-rematch');
  await sleep(600);
  t(
    await p.evaluate(() => !document.getElementById('set-boardpick').hidden),
    'loser board-call modal shown (2 open slots)'
  );
  t(
    await p.evaluate(
      () => document.querySelectorAll('#set-boardpick-plates .setm-plate.pick').length === 2
    ),
    'exactly the 2 remaining boards offered'
  );
  await p.screenshot({ path: '/tmp/set_boardpick.png' });
  await p.evaluate(() =>
    document.querySelector('#set-boardpick-plates .setm-plate.pick').click()
  );
  await sleep(2200); // veil + revealBattlefield modal possible

  /* on the sideboard screen: six pre-slotted, must swap 1-2 */
  const sb = await p.evaluate(() => {
    var st = window.EOL.play._prepState();
    if (!st) return { ok: false, why: 'no prep' };
    var six = st.front.concat(st.back);
    var set = window.EOL.play._setState();
    return {
      ok: six.length === 6 && st.phase === 'pick',
      phase: st.phase,
      same:
        six.filter((id) => set.lastSix.front.concat(set.lastSix.back).includes(id)).length,
      swaps0: six.filter((id) => !set.lastSix.front.concat(set.lastSix.back).includes(id)).length,
    };
  });
  t(sb.ok, 'sideboard = pick phase with last six pre-slotted (' + JSON.stringify(sb) + ')');

  /* law: NO swap = confirm rejected (toast, stays on prep) */
  await p.evaluate(() => { var b = document.getElementById('prep-confirm'); b.disabled = false; b.click(); });
  await sleep(700);
  t(
    await p.evaluate(() => document.body.dataset.view === 'prep'),
    '0 swaps rejected by the rotation law'
  );

  /* make exactly 1 swap, then confirm */
  await p.evaluate(() => {
    var st = window.EOL.play._prepState();
    var set = window.EOL.play._setState();
    var six = st.front.concat(st.back);
    var bench = st.player12
      .filter((e) => (set.youBans || []).concat().indexOf(e.card.id) < 0)
      .map((e) => e.card.id)
      .filter((id) => six.indexOf(id) < 0);
    st.front[0] = bench[0];
  });
  await p.evaluate(() => { var b = document.getElementById('prep-confirm'); b.disabled = false; b.click(); });
  await sleep(2200);
  t(
    await p.evaluate(() => document.body.dataset.view === 'battle'),
    '1 swap accepted: game 2 battle started'
  );
  t(
    await p.evaluate(() => {
      var c = document.getElementById('set-chip');
      return c && /Game 2/.test(c.textContent);
    }),
    'set chip now reads Game 2'
  );

  /* forfeit game 2 -> set over 0-2, New set offered */
  await forfeit();
  const end = await p.evaluate(() => {
    var st = window.EOL.play._setState();
    return {
      wins: st && st.wins,
      pending: st && st.pending,
      sub: document.querySelector('#result .result-sub').textContent,
      label: document.querySelector('#btn-rematch span').textContent,
    };
  });
  t(end.wins && end.wins.foe === 2, 'second forfeit ends the set 0-2');
  t(end.pending === 'over', 'pending=over at set end');
  t(/New set/.test(end.label), 'button relabelled "New set"');
  t(/set slips away/i.test(end.sub), 'set-loss framing in the epitaph');
  await p.screenshot({ path: '/tmp/set_result_end.png' });

  /* New set -> fresh fight card */
  await c('#btn-rematch');
  await sleep(1500);
  t(
    await p.evaluate(() => {
      var st = window.EOL.play._setState();
      return st && st.game === 1 && st.wins.you === 0 && st.wins.foe === 0;
    }),
    'New set spins up a fresh war (game 1, 0-0)'
  );

  /* classic single battle: NO set state (regression guard) */
  await p.evaluate(() => {
    document.getElementById('set-fightcard-go') &&
      !document.getElementById('set-fightcard').hidden &&
      document.getElementById('set-fightcard-go').click();
  });
  await sleep(300);
  await p.evaluate(() => window.EOL.play.setWarLength('single'));
  await p.evaluate(() => {
    window.EOL.ui.show('play');
  });
  await sleep(300);
  await c('#mode-classic');
  await sleep(350);
  await c('.dm-row.random');
  await sleep(1000);
  t(
    await p.evaluate(() => window.EOL.play._setState() === null),
    'war-length single: no set state (classic untouched)'
  );
  t(
    await p.evaluate(() => document.getElementById('set-fightcard').hidden),
    'no fight card modal in single mode'
  );

  t(errs.length === 0, 'no page errors: ' + errs.join(' | ').slice(0, 240));
  console.log(f ? '\n' + f + ' FAILURES' : '\nALL PASS');
  await br.close();
  process.exit(f || errs.length ? 1 : 0);
})();
