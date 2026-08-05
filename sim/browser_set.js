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
  /* 2026-08-05: match length is chosen in the deck popup (the launch
     decision), not on the play screen grid. */
  await p.evaluate(() => window.EOL.ui.show('play'));
  await sleep(350);
  await c('#mode-classic');
  await sleep(400);
  t(
    await p.evaluate(() => {
      var w = document.getElementById('war-length');
      return !!w && !w.hidden;
    }),
    'war-length toggle rendered inside the deck popup'
  );
  await c('#war-length .wl-opt[data-len="set"]');
  t(await p.evaluate(() => window.EOL.play.warLength() === 'set'), 'Bo3 selected + persisted');

  /* --- helper tip dots: hover pops the shared tooltip, settings kills them --- */
  t(
    await p.evaluate(() => document.querySelectorAll('.tipdot').length >= 10),
    'tip dots scattered across the game (>=10)'
  );
  await p.evaluate(() => {
    document.querySelector('.wl-head .tipdot').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await sleep(150);
  t(
    await p.evaluate(() => {
      var f = document.getElementById('tip-float');
      return f && f.classList.contains('show') && f.textContent.length > 20;
    }),
    'hovering a tip dot shows its tooltip'
  );
  await p.evaluate(() => {
    document.querySelector('.wl-head .tipdot').dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });
  t(
    await p.evaluate(() => {
      document.querySelector('.tips-opt[data-tips="off"]').click();
      var off =
        document.body.dataset.tips === 'off' &&
        getComputedStyle(document.querySelector('.wl-head .tipdot')).display === 'none';
      document.querySelector('.tips-opt[data-tips="on"]').click();
      var back =
        document.body.dataset.tips === 'on' &&
        getComputedStyle(document.querySelector('.wl-head .tipdot')).display !== 'none';
      return off && back;
    }),
    'settings toggle hides and restores every tip dot'
  );

  /* --- game 1: classic, surprise-me (deck popup already open) --- */
  await c('.dm-row.random');
  await sleep(1200);
  t(
    await p.evaluate(() => !!window.EOL.play._setState()),
    'set state created at prep (game 1)'
  );
  t(
    await p.evaluate(() => document.getElementById('set-fightcard').hidden),
    'no fight card at prep start (user law: it reveals after bans)'
  );

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
  await sleep(2600); // reveal + sleep(1150) + fight card

  /* user law 2026-08-04: the fight card replaces the single-board reveal
     AFTER bans are locked, BEFORE fielding */
  t(
    await p.evaluate(() => !document.getElementById('set-fightcard').hidden),
    'fight card revealed after bans, before fielding'
  );
  t(
    await p.evaluate(
      () => document.querySelectorAll('#set-fightcard-plates .setm-plate').length === 3
    ),
    'fight card shows 3 boards'
  );
  t(
    await p.evaluate(() => {
      var st = window.EOL.play._setState();
      if (typeof st.game1Slot !== 'number' || st.game1Slot < 0 || st.game1Slot > 2) return false;
      if (st.usedSlots.length !== 1 || st.usedSlots[0] !== st.game1Slot) return false;
      /* gfx low lands instantly: exactly the rolled plate is stamped Game 1 */
      var slots = Array.prototype.map.call(
        document.querySelectorAll('#set-fightcard-plates .setm-plate .setm-slot'),
        (n) => n.textContent
      );
      return (
        slots.filter((x) => /Game 1/.test(x)).length === 1 && /Game 1/.test(slots[st.game1Slot])
      );
    }),
    'game-1 board is the ROLLED slot, never hardwired slot 0'
  );
  await p.screenshot({ path: '/tmp/set_fightcard.png' });
  await c('#set-fightcard-go');
  await sleep(400);

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
      var c = document.getElementById('set-pill');
      return c && !c.hidden && /G1\/3/.test(c.textContent) && /0 - 0/.test(c.textContent);
    }),
    'set pill visible in HUD: G1/3, 0 - 0'
  );
  t(
    await p.evaluate(() => {
      var it = document.getElementById('init-tag');
      return it && !it.classList.contains('on');
    }),
    'set pill REPLACES the action pill (action pill suppressed)'
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

  /* 2026-08-05: the header shows the score only - the rotation law is
     carried by the Field Six tip and the confirm button's reason, not
     a second lecture in the sub line */
  const subTxt = await p.evaluate(() => document.getElementById('prep-sub').textContent);
  t(
    /^Unabridged · Game 2 of 3/.test(subTxt) && !/fresh legends/.test(subTxt),
    'sideboard header = score line only ("' + subTxt + '")'
  );

  /* law: NO swap = confirm rejected (toast, stays on prep) */
  await p.evaluate(() => { var b = document.getElementById('prep-confirm'); b.disabled = false; b.click(); });
  await sleep(700);
  t(
    await p.evaluate(() => document.body.dataset.view === 'prep'),
    '0 swaps rejected by the rotation law'
  );

  /* make exactly 1 swap, then confirm (bench excludes every ban list) */
  const swapIds = await p.evaluate(() => {
    var st = window.EOL.play._prepState();
    var set = window.EOL.play._setState();
    var six = st.front.concat(st.back);
    var bannedIds = (set.botBans || []).concat(set.youBans || []);
    var bench = st.player12
      .map((e) => e.card.id)
      .filter(
        (id) =>
          six.indexOf(id) < 0 &&
          bannedIds.indexOf(id) < 0 &&
          (set.lockedOut || []).indexOf(id) < 0
      );
    var outId = st.front[0];
    st.front[0] = bench[0];
    return { out: outId, inn: bench[0] };
  });
  await p.evaluate(() => { var b = document.getElementById('prep-confirm'); b.disabled = false; b.click(); });
  await sleep(2200);
  t(
    await p.evaluate(() => document.body.dataset.view === 'battle'),
    '1 swap accepted: game 2 battle started'
  );
  /* sub lockout law: the hero swapped OUT sits out the rest of the set */
  t(
    await p.evaluate(
      (o) => window.EOL.play._setState().lockedOut.indexOf(o.out) >= 0,
      swapIds
    ),
    'subbed-out hero locked for the rest of the set (' + swapIds.out + ')'
  );
  t(
    await p.evaluate(
      (o) => window.EOL.play._setState().lockedOut.indexOf(o.inn) < 0,
      swapIds
    ),
    'subbed-in hero stays eligible (only the out-going lock)'
  );
  t(
    await p.evaluate(() => {
      var c = document.getElementById('set-pill');
      return c && !c.hidden && /G2\/3/.test(c.textContent);
    }),
    'set pill now reads G2/3'
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
  t(/New Unabridged/.test(end.label), 'button relabelled "New Unabridged"');
  t(/Unabridged is lost/i.test(end.sub), 'Unabridged-loss framing in the epitaph');
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
