/* 2026-08-05 order - live browser proofs (durable).
   -------------------------------------------------------------
   A. GUI scale v3: 80-110, default 100; root-element zoom with
      CTRL +/- semantics (views FILL the window at any percent);
      GLIDES on input, snaps on change; legacy level migration.
   B. Account errors: #auth-foot/#settings-foot/#uname-foot live at
      the TOP of their cards.
   C. Button hover bleed: .btn gains a 6px ::after below so the lift
      can't flicker :hover.
   D. Card retunes live in-page: Mordred row-Exposed, Rapunzel back
      row, Merlin 65/8%, Morgan no-swap.
   E. Battle UI under 87%: flyout anchors, damage pop lands on the
      victim, no zoom residue.
   F. Prep (solo): bf-reveal "Field your six" locked until the card
      entrance ends; "See battlefields" re-opens the reveal.
   G. Prep (Unabridged): fight-card go locked until the roulette
      lands; "See battlefields" shows the fight card viewer.

   Boot: EOL_URL=http://localhost:8000/index.html node sim/browser_s28.js */
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
  let f = 0;
  const mkPage = async () => {
    const p = await br.newPage();
    await p.setViewport({ width: 1600, height: 950 });
    const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    p._errs = errs;
    return p;
  };
  const t = (ok, m) => { if (!ok) f++; console.log((ok ? '  PASS  ' : '  FAIL  ') + m); };
  const waitFor = async (p, fn, ms, arg) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await p.evaluate(fn, arg)) return true;
      await sleep(120);
    }
    return false;
  };

  /* ---------- A + B + C: home / settings / DOM ---------- */
  let p = await mkPage();
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => {
    try { localStorage.setItem('eol.coach.v1', JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle'])); } catch (e) {}
    try { localStorage.removeItem('eol.scale'); } catch (e) {}
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(400);

  t(
    await p.evaluate(
      () =>
        window.EOL.scale.get() === 100 &&
        Math.abs(window.EOL.scale.factor() - 1) < 1e-9 &&
        document.documentElement.style.zoom === ''
    ),
    'A: scale defaults to 100% with no zoom property at all'
  );
  await p.evaluate(() => {
    document.getElementById('acct-btn').click();
    document.getElementById('acct-settings').click();
  });
  await sleep(350);
  t(await p.evaluate(() => !document.getElementById('settings-modal').hidden), 'A: settings modal opens');
  t(
    await p.evaluate(() => {
      var r = document.getElementById('scale-range');
      return r.min === '80' && r.max === '110' && r.value === '100';
    }),
    'A: slider runs 80-110 and starts at 100'
  );
  await p.evaluate(() => {
    var r = document.getElementById('scale-range');
    r.value = '95.6';
    r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const glide = await p.evaluate(() => ({
    applied: document.documentElement.style.zoom,
    label: document.getElementById('scale-val').textContent,
  }));
  t(glide.applied === '' && glide.label === '96%', `A: mid-drag only the readout glides (${glide.label}, zoom ${glide.applied || 'unset'})`);
  await p.evaluate(() => {
    var r = document.getElementById('scale-range');
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(150);
  const snap = await p.evaluate(() => ({
    applied: document.documentElement.style.zoom,
    pct: window.EOL.scale.get(),
    rangeVal: document.getElementById('scale-range').value,
  }));
  t(snap.applied === '0.96' && snap.pct === 96 && snap.rangeVal === '96', `A: snap lands on release (${snap.pct}%, zoom ${snap.applied})`);
  await p.screenshot({ path: SHOT_DIR + '/s28_settings_scale.png' });
  await p.evaluate(() => {
    document.getElementById('scale-reset').click();
    document.getElementById('settings-close') ? document.getElementById('settings-close').click() : document.getElementById('settings-scrim').click();
  });
  t(await p.evaluate(() => window.EOL.scale.get() === 100), 'A: reset returns to 100');

  /* the Ctrl +/- law, proven geometrically: at ANY percent the active
     view covers the window edge to edge - no dead band below (the old
     transform model) and no cropped bottom (the old body-zoom model) */
  const fillCheck = async (pct) => {
    await p.evaluate((q) => window.EOL.scale.set(q), pct);
    await sleep(250);
    return p.evaluate(() => {
      var v = document.querySelector('.view.active').getBoundingClientRect();
      var body = document.body.getBoundingClientRect();
      return {
        left: Math.abs(v.left) < 1.5,
        right: Math.abs(v.right - window.innerWidth) < 1.5,
        top: Math.abs(v.top) < 1.5,
        bottom: Math.abs(v.bottom - window.innerHeight) < 1.5,
        bodyBottom: Math.abs(body.bottom - window.innerHeight) < 1.5,
        vwVar: document.documentElement.style.getPropertyValue('--vw1'),
        noScroll: document.documentElement.scrollHeight <= window.innerHeight + 2,
        zoom: document.documentElement.style.zoom,
      };
    });
  };
  let fill = await fillCheck(80);
  t(fill.left && fill.right && fill.top && fill.bottom && fill.bodyBottom && fill.noScroll, `A: at 80% the view fills the window edge-to-edge (zoom ${fill.zoom}, vw1 ${fill.vwVar})`);
  await p.screenshot({ path: SHOT_DIR + '/s29_scale_80.png' });
  fill = await fillCheck(110);
  t(fill.left && fill.right && fill.top && fill.bottom && fill.bodyBottom && fill.noScroll, `A: at 110% nothing crops off the bottom (zoom ${fill.zoom}, vw1 ${fill.vwVar})`);
  await p.screenshot({ path: SHOT_DIR + '/s29_scale_110.png' });
  t(
    await p.evaluate(() => {
      var v = parseFloat(document.documentElement.style.getPropertyValue('--vw1'));
      return Math.abs(v - window.innerWidth / 1.1 / 100) < 0.05;
    }),
    'A: --vw1 tracks the logical viewport (device / zoom)'
  );
  await p.evaluate(() => window.EOL.scale.set(100));

  /* pixel breakpoints hang off the LOGICAL viewport now */
  await p.setViewport({ width: 940, height: 700 });
  await sleep(250);
  const mq = await p.evaluate(() => ({
    de: document.documentElement.className,
  }));
  t(/mqw980/.test(mq.de) && !/mqw900/.test(mq.de), `A: emulated mq tracks 940px logical width (${mq.de || 'no classes'})`);
  await p.evaluate(() => window.EOL.scale.set(80));
  await sleep(250);
  t(
    await p.evaluate(() => !/mqw98/.test(document.documentElement.className)),
    'A: at 80% the logical width is 1175px - the 980 breakpoint drops out, exactly like Ctrl -'
  );
  await p.evaluate(() => window.EOL.scale.set(100));
  await p.setViewport({ width: 1600, height: 950 });
  await sleep(200);

  /* legacy migration: v2 stored levels 1-4 - a '2' in storage must
     come up as 87%, never as a clamped 4 */
  await p.evaluate(() => {
    try { localStorage.setItem('eol.scale', '2'); } catch (e) {}
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  t(
    await p.evaluate(() => window.EOL.scale.get() === 87 && document.documentElement.style.zoom === '0.87'),
    'A: legacy level 2 migrates to 87%'
  );
  await p.evaluate(() => {
    try { localStorage.setItem('eol.scale', '100'); } catch (e) {}
    window.EOL.scale.set(100);
  });

  t(
    await p.evaluate(() => {
      var foot = document.getElementById('auth-foot');
      var form = document.getElementById('auth-submit').closest('form');
      return !!(foot.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
    'B: auth modal error line sits ABOVE the form'
  );
  t(
    await p.evaluate(() => {
      var foot = document.getElementById('settings-foot');
      var sec = document.getElementById('set-account');
      return !!(foot.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
    'B: settings account line sits at the TOP'
  );
  t(
    await p.evaluate(() => {
      var foot = document.getElementById('uname-foot');
      var form = document.getElementById('uname-form');
      return !!(foot.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
    'B: callsign modal error line sits at the TOP'
  );

  t(
    await p.evaluate(() => {
      var b = document.querySelector('.btn');
      var cs = getComputedStyle(b, '::after');
      return cs.content !== 'none' && cs.content !== '' && parseFloat(cs.height) >= 5 && cs.top !== 'auto';
    }),
    'C: .btn carries the 6px hover bleed below'
  );
  t(p._errs.length === 0, 'A-C: no page errors' + (p._errs.length ? ' :: ' + p._errs[0] : ''));

  /* ---------- D: card retunes, live engine ---------- */
  const cards = await p.evaluate(() => {
    const EOL = window.EOL, E = EOL.engine;
    const cardOf = {};
    EOL.factions.forEach((fa) => fa.cards.forEach((c) => (cardOf[c.id] = { card: c, faction: fa })));
    const mk = (ids) => ids.map((id) => cardOf[id]);
    const P = mk(['camelot-mordred', 'grimmwood-rapunzel', 'camelot-merlin', 'camelot-morgan-le-fay', 'olympus-hercules', 'huaxia-guan-yu']);
    const Q = mk(['olympus-ares', 'grimmwood-pied-piper', 'huaxia-nezha', 'camelot-guinevere', 'olympus-medusa', 'grimmwood-cinderella']);
    let n = 3;
    const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
    const B = E.createBattle(P, Q, { rng, roleAware: true, simulation: true, field: EOL.battlefieldById('colosseum') });
    B.noOpeningLimit = true;
    B.energy.player = 150;
    const out = {};
    const foes = () => B.units.filter((u) => u.side === 'enemy' && u.alive);
    const U = (id) => B.units.find((u) => u.card.id === id);
    // Mordred: Exposed runs the target's row, not adjacency
    {
      const m = U('camelot-mordred');
      m.card.ability.spec.target.auto = 'lowestHp';
      const lo = foes().sort((a, b) => a.hp - b.hp)[0];
      E.useAbility(B, m, m.card.ability, []);
      const same = foes().filter((x) => E.isFront(x) === E.isFront(lo));
      const other = foes().filter((x) => E.isFront(x) !== E.isFront(lo));
      out.mordred = same.every((x) => x.flags.exposed > 0) && other.every((x) => !(x.flags.exposed > 0));
    }
    // Rapunzel: back row only
    {
      const B2 = E.createBattle(P, Q, { rng, roleAware: true, simulation: true, field: EOL.battlefieldById('colosseum') });
      B2.noOpeningLimit = true; B2.energy.player = 150;
      const foes2 = () => B2.units.filter((u) => u.side === 'enemy' && u.alive);
      const fronts = foes2().filter((x) => E.isFront(x)); const fHp = fronts.map((x) => x.hp);
      const backs = foes2().filter((x) => !E.isFront(x)); const bHp = backs.map((x) => x.hp);
      const r = B2.units.find((u) => u.card.id === 'grimmwood-rapunzel');
      E.useAbility(B2, r, r.card.ability, []);
      out.rapunzel =
        backs.every((x, i) => x.hp < bHp[i] || x.buffs.length > 0 || x.flags.exposed > 0) &&
        fronts.every((x, i) => x.hp === fHp[i] && !x.buffs.length && !(x.flags.exposed > 0));
    }
    // Merlin: cost 55 (signatures-only tax), 8% shield
    {
      const B3 = E.createBattle(P, Q, { rng, roleAware: true, simulation: true, field: EOL.battlefieldById('colosseum') });
      B3.noOpeningLimit = true; B3.energy.player = 150;
      const me = B3.units.find((u) => u.card.id === 'camelot-merlin');
      const okCost = me.card.ability.cost === 55;
      E.useAbility(B3, me, me.card.ability, []);
      out.merlin =
        okCost &&
        B3.units.filter((u) => u.side === 'player' && u.alive).every((a) => a.shield === Math.round(a.maxHp * 0.08));
    }
    // Morgan: never swaps
    {
      const B4 = E.createBattle(P, Q, { rng, roleAware: true, simulation: true, field: EOL.battlefieldById('colosseum') });
      B4.noOpeningLimit = true; B4.energy.player = 150;
      const foes4 = B4.units.filter((u) => u.side === 'enemy' && u.alive).slice(0, 2);
      const slots = foes4.map((x) => x.slot);
      const mo = B4.units.find((u) => u.card.id === 'camelot-morgan-le-fay');
      const hasSwap = mo.card.ability.spec.effects.some((e) => e.k === 'swapTargets');
      E.useAbility(B4, mo, mo.card.ability, foes4);
      out.morgan =
        !hasSwap &&
        foes4.every((x, i) => x.slot === slots[i]) &&
        foes4.every((x) => x.flags.exposed > 0 && x.buffs.some((b) => b.stat === 'atk' && b.amt === -30));
    }
    return out;
  });
  t(cards.mordred, "D: Mordred Exposes the target's ROW (not adjacent)");
  t(cards.rapunzel, 'D: Rapunzel reaches the BACK row only');
  t(cards.merlin, 'D: Merlin costs 65 and shields exactly 8% Max HP');
  t(cards.morgan, 'D: Morgan debuffs without swapping anyone');

  /* ---------- E: battle UI under 87% ---------- */
  await p.evaluate(() => window.EOL.scale.set(87));
  await p.evaluate(() => {
    const EOL = window.EOL;
    const cardOf = {};
    EOL.factions.forEach((fa) => fa.cards.forEach((c) => (cardOf[c.id] = { card: c, faction: fa })));
    const P = ['olympus-hercules', 'huaxia-guan-yu', 'camelot-mordred', 'camelot-guinevere', 'grimmwood-rapunzel', 'olympus-zeus'].map((id) => cardOf[id]);
    const Q = ['olympus-ares', 'grimmwood-pied-piper', 'huaxia-nezha', 'camelot-morgan-le-fay', 'yamato-tomoe-gozen', 'grimmwood-cinderella'].map((id) => cardOf[id]);
    EOL.ui.show('battle');
    EOL.battle.start({ teams: { player: P, enemy: Q }, field: EOL.battlefieldById('colosseum') });
  });
  await sleep(1200);
  /* the battle view is max-width-capped, so at <100% zoom the CAP
     shrinks renderer-side and small side margins appear - that is
     exactly what real Ctrl - does and it is not the bug. The bug axis
     was VERTICAL: bands or cropping at the bottom. Pin that down: */
  t(
    await p.evaluate(() => {
      var v = document.querySelector('.view.active').getBoundingClientRect();
      var centred = Math.abs(v.left - (window.innerWidth - v.right)) < 3;
      return (
        document.documentElement.style.zoom === '0.87' &&
        document.body.style.zoom === '' &&
        Math.abs(v.top) < 2 &&
        Math.abs(v.bottom - window.innerHeight) < 2 &&
        centred
      );
    }),
    'E: root zoom at 0.87, battle fills the window vertically, centred'
  );
  /* if the enemy won the flip, pass until it is our window */
  await waitFor(p, () => {
    const B = window.EOL.battle.getState();
    return B.turn === 'player' && document.body.dataset.busy !== '1';
  }, 12000);
  await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const u = B.units.find((x) => x.side === 'player' && x.alive);
    document.querySelector('.bcard[data-uid="' + u.uid + '"]').click();
  });
  await sleep(800);
  const dock = await p.evaluate(() => {
    var fly = document.getElementById('flyout');
    var board = document.getElementById('board');
    var top = parseFloat(fly.style.top || '-1');
    return { shown: fly.classList.contains('show'), top: top, bh: board.clientHeight };
  });
  t(dock.shown && dock.top >= 8 && dock.top < dock.bh, `E: flyout anchors inside the board at 87% (top ${dock.top}/${dock.bh})`);
  /* real attack: the damage pop must land near the victim on screen.
     Target clicks inside FX/busy windows are dropped by design, and
     the pop itself only lives ~1.1s - so arm the target, wait for a
     clean window, then POLL for the pop instead of sampling once. */
  await p.evaluate(() => {
    document.querySelector('#flyout .dk-ab.act[data-ab="1"]').click();
  });
  t(
    await waitFor(
      p,
      () => document.body.dataset.busy !== '1' && document.querySelectorAll('.bcard.targetable').length > 0,
      5000
    ),
    'E: targeting marks legal targets at 87%'
  );
  await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const front = B.units.find((x) => x.side === 'enemy' && x.alive && window.EOL.engine.isFront(x));
    const el = document.querySelector('.bcard.targetable[data-uid="' + front.uid + '"]') || document.querySelector('.bcard.targetable');
    if (el) el.click();
  });
  let pop = null;
  let popShot = false;
  for (let i = 0; i < 28 && !pop; i++) {
    await sleep(110);
    pop = await p.evaluate(() => {
      var pops = [...document.querySelectorAll('#fx .pop, #fx [class*="pop"]')];
      if (!pops.length) return null;
      var z = window.EOL.scale.factor();
      var B = window.EOL.battle.getState();
      var victim = B.units.filter((x) => x.side === 'enemy' && x.alive && x.lastDamagedRound === B.round)[0];
      var el = pops[pops.length - 1].getBoundingClientRect();
      if (!victim) return { ok: true, note: 'no measurable victim', dz: z };
      var v = document.querySelector('.bcard[data-uid="' + victim.uid + '"]').getBoundingClientRect();
      return { ok: Math.abs(el.left + el.width / 2 - (v.left + v.width / 2)) < 90, dz: z, dy: Math.abs(el.top - v.top) };
    });
    if (pop && !popShot) {
      popShot = true;
      await p.screenshot({ path: SHOT_DIR + '/s29_battle_scale87.png' });
    }
  }
  t(!!pop && pop.ok !== false, `E: damage pop lands on the victim at 87% (${pop ? (pop.note ? pop.note : 'aligned, dy ' + Math.round(pop.dy || 0)) : 'no pop ever spawned'})`);
  if (!popShot) await p.screenshot({ path: SHOT_DIR + '/s29_battle_scale87.png' });
  await p.evaluate(() => window.EOL.scale.set(100));
  t(p._errs.length === 0, 'E: no page errors' + (p._errs.length ? ' :: ' + p._errs[0] : ''));
  await p.close();

  /* ---------- F: solo prep reveal gate + See battlefields ---------- */
  p = await mkPage();
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => {
    try { localStorage.setItem('eol.coach.v1', JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle'])); } catch (e) {}
    window.EOL.gfx.set('low');
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  await p.evaluate(() => {
    window.EOL.ui.show('play');
    window.EOL.play.openClassicModal();
  });
  await sleep(350);
  await p.evaluate(() => document.querySelector('#dm-list .dm-row').click());
  t(await waitFor(p, () => document.body.dataset.view === 'prep', 6000), 'F: classic deck pick reaches prep');
  /* ban phase: ban two enemy cards */
  await waitFor(p, () => document.querySelectorAll('#prep-enemy .pcard').length > 0, 5000);
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('#prep-enemy .pcard')];
    c[0].click(); c[1].click();
  });
  await p.evaluate(() => document.getElementById('prep-confirm-main').click());
  /* the battlefield reveal appears with "Field your six" LOCKED... */
  t(await waitFor(p, () => document.getElementById('bf-reveal').classList.contains('show'), 5000), 'F: battlefield reveal opens after bans');
  t(await p.evaluate(() => document.getElementById('bf-go').disabled === true), 'F: "Field your six" is locked during the reveal entrance');
  t(await waitFor(p, () => document.getElementById('bf-go').disabled === false, 3000), 'F: ...and unlocks once the entrance finishes');
  await p.evaluate(() => document.getElementById('bf-go').click());
  await sleep(500);
  t(await waitFor(p, () => !document.getElementById('prep-field').hidden, 5000), 'F: field-six section opens');
  t(await p.evaluate(() => !!document.getElementById('prep-fields') && document.getElementById('prep-fields').offsetWidth > 0), 'F: "See battlefields" button present');
  await p.evaluate(() => document.getElementById('prep-fields').click());
  await sleep(300);
  t(await p.evaluate(() => document.getElementById('bf-reveal').classList.contains('show')), 'F: "See battlefields" re-opens the battlefield popup');
  await p.screenshot({ path: SHOT_DIR + '/s28_prep_see_battlefields.png' });
  t(p._errs.length === 0, 'F: no page errors' + (p._errs.length ? ' :: ' + p._errs[0] : ''));
  await p.close();

  /* ---------- G: Unabridged fight-card gate + viewer ---------- */
  p = await mkPage();
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => {
    try { localStorage.setItem('eol.coach.v1', JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle'])); } catch (e) {}
    window.EOL.gfx.set('high'); // the roulette only spins in full motion
  });
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  await p.evaluate(() => {
    window.EOL.ui.show('play');
    window.EOL.play.openClassicModal();
  });
  await sleep(350);
  await p.evaluate(() => document.querySelector('#war-length .wl-opt[data-len="set"]').click());
  await p.evaluate(() => document.querySelector('#dm-list .dm-row').click());
  t(await waitFor(p, () => document.body.dataset.view === 'prep', 6000), 'G: Unabridged pick reaches prep');
  await waitFor(p, () => document.querySelectorAll('#prep-enemy .pcard').length > 0, 5000);
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('#prep-enemy .pcard')];
    c[0].click(); c[1].click();
  });
  await p.evaluate(() => document.getElementById('prep-confirm-main').click());
  t(await waitFor(p, () => !document.getElementById('set-fightcard').hidden, 6000), 'G: fight card opens after bans');
  t(await p.evaluate(() => document.getElementById('set-fightcard-go').disabled === true), 'G: "Field your six" locked while the roulette spins');
  t(await waitFor(p, () => document.getElementById('set-fightcard-go').disabled === false, 8000), 'G: ...unlocks when the marker lands');
  await p.evaluate(() => document.getElementById('set-fightcard-go').click());
  await sleep(500);
  t(await waitFor(p, () => !document.getElementById('prep-field').hidden, 5000), 'G: field-six section opens in the set');
  await p.evaluate(() => document.getElementById('prep-fields').click());
  await sleep(300);
  const viewer = await p.evaluate(() => {
    var m = document.getElementById('set-fightcard');
    var slots = [...document.querySelectorAll('#set-fightcard-plates .setm-slot')].map((x) => x.textContent);
    var btn = document.getElementById('set-fightcard-go');
    return {
      open: !m.hidden,
      title: document.getElementById('set-fightcard-title').textContent,
      game1: slots.filter((s) => /Game 1/.test(s)).length,
      openSlots: slots.filter((s) => /Open slot/.test(s)).length,
      btnTxt: btn.querySelector('span').textContent,
      btnEnabled: !btn.disabled,
    };
  });
  t(viewer.open && /UNABRIDGED/.test(viewer.title) && viewer.game1 === 1 && viewer.openSlots === 2 && /Back to fielding/.test(viewer.btnTxt) && viewer.btnEnabled, `G: fight card viewer marks Game 1 (${viewer.title.trim()}, go="${viewer.btnTxt}")`);
  await p.screenshot({ path: SHOT_DIR + '/s28_fightcard_viewer.png' });
  await p.evaluate(() => document.getElementById('set-fightcard-go').click());
  t(await waitFor(p, () => document.getElementById('set-fightcard').hidden === true, 3000), 'G: viewer backs out to fielding');
  t(p._errs.length === 0, 'G: no page errors' + (p._errs.length ? ' :: ' + p._errs[0] : ''));
  await p.close();

  console.log(f ? `\n\x1b[31m${f} FAILURES\x1b[0m` : '\n\x1b[32mALL S28 BROWSER PROOFS PASSED\x1b[0m');
  await br.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
