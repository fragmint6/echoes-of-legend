/* NO-ACTIONS LAW - live browser proof (durable, 2026-08-05).
   -------------------------------------------------------------
   1. THE WUKONG WALL: enemy reduced to a lone Untargetable+Provoke
      Sun Wukong. The player side has NO legal casts -> the driver
      auto-passes it and the banner names the reason:
      "NO ACTIONS LEFT / No available targets". Screenshot.
   2. THE MEDIC EXCEPTION: same wall, but the player fields a Medic -
      Restore still has allies, so the side keeps the turn. Screenshot.
   3. ICON AUDIT: every glyph this build ships (set/element/status)
      rendered on a contact sheet; asserts the RPG Awesome webfont is
      loaded and each <i class="ra ..."> resolves to a real glyph.

   Boot: EOL_URL=http://localhost:8000/index.html node sim/browser_no_actions.js */
'use strict';
const puppeteer = require('/tmp/node_modules/puppeteer');
const CHROME =
  process.env.EOL_CHROME ||
  '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const URL = process.env.EOL_URL || 'http://localhost:8000/index.html';
const SHOT_DIR = process.env.EOL_SHOT_DIR || '/home/user/art_prep';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1600, height: 950 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  let f = 0;
  const t = (ok, m) => { if (!ok) f++; console.log((ok ? '  PASS  ' : '  FAIL  ') + m); };
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => {
    try { localStorage.setItem('eol.coach.v1', JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle'])); } catch (e) {}
    window.EOL.gfx.set('low');
  });
  await p.reload({ waitUntil: 'networkidle0' });

  /* pick six attackers whose BASIC *and* SIGNATURE both aim at the
     enemy, plus (separately) one Medic - computed from live data so the
     proof can't drift from the card pool. */
  const picks = await p.evaluate(() => {
    const enemyOnly = [];
    let medic = null;
    window.EOL.factions.forEach((fa) =>
      fa.cards.forEach((c) => {
        const sig = c.ability;
        const sigEnemy = sig && sig.type === 'Active' && sig.spec && sig.spec.target && sig.spec.target.side === 'enemy';
        const base = window.EOL.roleAbilities[c.role];
        const baseEnemy = base && base.spec && base.spec.target && base.spec.target.side === 'enemy';
        if (c.role === 'Medic') { if (!medic) medic = c.id; return; }
        if (sigEnemy && baseEnemy) enemyOnly.push(c.id);
      })
    );
    return { six: enemyOnly.slice(0, 6), five: enemyOnly.slice(0, 5), medic: medic };
  });
  t(picks.six.length === 6 && !!picks.medic, `pool supports the proof (6 attackers, medic ${picks.medic})`);

  const FOES = ['huaxia-sun-wukong', 'huaxia-nezha', 'huaxia-guan-yu', 'olympus-ares', 'grimmwood-pied-piper', 'olympus-medusa'];

  async function boot(playerIds) {
    await p.evaluate((pIds, eIds) => {
      const cardOf = {};
      window.EOL.factions.forEach((fa) => fa.cards.forEach((c) => (cardOf[c.id] = { card: c, faction: fa })));
      window.EOL.ui.show('battle');
      window.EOL.battle.start({
        teams: { player: pIds.map((id) => cardOf[id]), enemy: eIds.map((id) => cardOf[id]) },
        field: window.EOL.battlefieldById('colosseum'),
      });
    }, playerIds, FOES);
    await sleep(1100);
    /* rig the wall: only Wukong stands, Untargetable + Provoke together,
       exactly like 72 Transformations leaves him */
    await p.evaluate(() => {
      const B = window.EOL.battle.getState();
      B.units.forEach((u) => {
        if (u.side === 'enemy' && u.card.id !== 'huaxia-sun-wukong') { u.hp = 0; u.alive = false; }
      });
      const wk = B.units.find((u) => u.card.id === 'huaxia-sun-wukong');
      wk.flags.untargetable = 1;
      wk.flags.taunt = 1;
      B.energy.player = 150;
      /* garnish one attacker with statuses so the sheet doubles as a
         status-chip proof */
      const u0 = B.units.find((u) => u.side === 'player');
      u0.flags.burn = 2; u0.flags.silence = 1; u0.flags.taunt = 1;
      u0.shield = 120;
    });
  }

  const pollCine = async (ms, shotPath) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const txt = await p.evaluate(() => {
        const el = document.getElementById('cine');
        return el ? el.textContent : '';
      });
      if (/No available targets|Not enough Energy|No skills available|Every legend has acted/i.test(txt)) {
        if (shotPath) await p.screenshot({ path: shotPath }); // banner mid-display
        return txt;
      }
      await sleep(80);
    }
    return null;
  };

  /* ---------- 1. THE WUKONG WALL ---------- */
  await boot(picks.six);
  /* the Unabridged pill rides the top bar - proof for the "set icon"
     complaint in the same shot (patched score, real renderer) */
  await p.evaluate(() => {
    window.EOL.play.setPillInfo = () => ({ game: 1, you: 0, foe: 0 });
  });
  const reason = await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    return {
      why: window.EOL.engine.whyCantAct(B, 'player'),
      canAct: window.EOL.engine.unitsCanAct(B, 'player').length,
    };
  });
  t(reason.why === 'targets', `live engine diagnosis: "targets" (${reason.why}), ${reason.canAct} casters`);
  await p.evaluate(() => document.getElementById('btn-endturn').click());
  const banner = await pollCine(15000, SHOT_DIR + '/s26d_wukong_banner.png');
  t(!!banner && /No available targets/i.test(banner), `banner names the reason: ${JSON.stringify((banner || '').slice(0, 80))}`);
  const after = await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const sp = document.getElementById('set-pill');
    return {
      passed: B.passed.player === true,
      pillShown: sp && !sp.hidden,
      pillText: sp ? sp.textContent.trim() : '',
    };
  });
  t(after.passed, 'player side auto-passed by the driver');
  t(after.pillShown && /UNABRIDGED/.test(after.pillText), `set pill live with the scroll glyph (${after.pillText})`);
  await sleep(400);
  await p.screenshot({ path: SHOT_DIR + '/s26d_wukong_wall.png' });

  /* ---------- 2. THE MEDIC EXCEPTION ---------- */
  /* Fresh page between scenarios: the wall scenario leaves the bot's
     queued action timers mid-flight, and start() cancels the PONDER
     only - a reload is the bulletproof quiesce. */
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  await boot(picks.five.concat([picks.medic]));
  const med = await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const able = window.EOL.engine.unitsCanAct(B, 'player');
    return { n: able.length, roles: able.map((u) => u.role) };
  });
  t(med.n === 1 && med.roles[0] === 'Medic', `behind the wall only the Medic can act (${med.roles.join(',') || 'none'})`);
  /* A chosen pass runs the game's own action pipeline (bot answers, the
     grid repaints honest) - and unlike the wall scenario, control must
     come BACK to the player, un-passed, because the Medic has a move. */
  await p.evaluate(() => document.getElementById('btn-endturn').click());
  let back = false;
  for (let i = 0; i < 130 && !back; i++) {
    back = await p.evaluate(() => {
      const B = window.EOL.battle.getState();
      /* the enemy actually answered (lastActor==='enemy') and control is
         back with us, idle and un-passed */
      return B.turn === 'player' && B.lastActor === 'enemy' && !B.passed.player && document.body.dataset.busy !== '1';
    });
    await sleep(120);
  }
  t(back, 'control returned to the player - no lockout while the Medic stands');
  const noLock = await p.evaluate(() => !/NO ACTIONS/i.test((document.getElementById('cine') || {}).textContent || ''));
  t(noLock, 'no NO-ACTIONS banner while the Medic has a legal cast');
  await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const m = window.EOL.engine.unitsCanAct(B, 'player')[0];
    /* light the Medic up in the UI exactly like a tap would */
    const el = document.querySelector(`.bcard[data-uid="${m.uid}"]`);
    if (el) el.click();
  });
  await sleep(900);
  const fly = await p.evaluate(() => {
    const fl = document.getElementById('flyout');
    if (!fl || fl.hidden) return null;
    return [...fl.querySelectorAll('.dk-ab')].map((b) => ({
      name: b.textContent.trim().slice(0, 40),
      disabled: b.classList.contains('dis') || b.disabled === true,
    }));
  });
  t(!!fly && fly.some((b) => !b.disabled), `Medic flyout offers a live cast (${fly ? fly.map((x) => x.name + (x.disabled ? '[off]' : '[on]')).join(' | ') : 'none'})`);
  await p.screenshot({ path: SHOT_DIR + '/s26d_medic_exception.png' });

  /* ---------- 3. ICON CONTACT SHEET ---------- */
  const audit = await p.evaluate(() => {
    const EOL = window.EOL;
    const glyphs = [];
    glyphs.push(['SET / Unabridged', 'ra-scroll-unfurled', '#ffd98a']);
    const EICON = { Physical: 'ra-axe', Magic: 'ra-crystal-wand', Shadow: 'ra-moon-sun', Light: 'ra-sunbeams', Lightning: 'ra-lightning-bolt', Fire: 'ra-fire', Nature: 'ra-leaf' };
    Object.entries(EICON).forEach(([k, v]) => glyphs.push(['ELEMENT ' + k, v, 'var(--e-' + k.toLowerCase() + ')']));
    Object.entries(EOL.STATUS).forEach(([k, v]) => glyphs.push([k + ' · ' + v.label, v.icon, v.color]));
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#12100e;display:grid;' +
      'grid-template-columns:repeat(4,1fr);gap:10px;padding:18px;overflow:auto;font-family:Inter,sans-serif';
    const bad = [];
    glyphs.forEach(([label, cls, color]) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'background:#1d1a16;border:1px solid #3a332a;border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px';
      const i = document.createElement('i');
      i.className = 'ra ' + cls;
      i.style.cssText = 'font-size:34px;color:' + color;
      const s = document.createElement('span');
      s.textContent = label;
      s.style.cssText = 'color:#e8ddc9;font-size:12px';
      cell.appendChild(i); cell.appendChild(s); sheet.appendChild(cell);
    });
    document.body.appendChild(sheet);
    const fontLoaded = document.fonts ? document.fonts.check('16px RPGAwesome') : 'n/a';
    sheet.querySelectorAll('i.ra').forEach((i) => {
      const cs = getComputedStyle(i, ':before');
      const content = cs.content;
      const w = i.getBoundingClientRect().width;
      if (!content || content === 'none' || content === '""' || w < 8 || !/RPGAwesome/i.test(cs.fontFamily)) {
        bad.push(i.className + ' content=' + content + ' w=' + w + ' fam=' + cs.fontFamily);
      }
    });
    return { fontLoaded, bad, count: glyphs.length };
  });
  t(audit.fontLoaded === true, `RPGAwesome webfont loaded (${audit.fontLoaded})`);
  t(audit.bad.length === 0, `all ${audit.count} shipped glyphs resolve (${audit.bad.length ? audit.bad.join(' ;; ') : 'none broken'})`);
  await sleep(250);
  await p.screenshot({ path: SHOT_DIR + '/s26d_icon_sheet.png' });

  console.log(errs.length ? '\x1b[33mPAGE ERRORS:\x1b[0m\n' + errs.join('\n') : 'no page errors');
  console.log(f ? `\n\x1b[31m${f} FAILURES\x1b[0m` : '\n\x1b[32mALL BROWSER PROOFS PASSED\x1b[0m');
  await br.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
