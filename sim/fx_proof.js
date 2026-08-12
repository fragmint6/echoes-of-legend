/* FX regression proof (durable home in sim/ since 2026-08-05 - it used
   to live in /tmp and died with every sandbox reset).
     A. enemy-side burn tick floats damage and paints HP at impact (non-lethal)
     B. a LETHAL burn tick still floats the number BEFORE #result appears
     C. player-side burn tick floats the number too
     D. Spirit World: the two-part Sniper basic's follow-up REGISTERS -
        hit 1 spares at 1 HP, the rider finishes the job (user law 14)
   Boot: EOL_URL=http://localhost:8000/index.html node sim/fx_proof.js */
'use strict';
const puppeteer = require('/tmp/node_modules/puppeteer');
const CHROME =
  process.env.EOL_CHROME ||
  '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const URL = process.env.EOL_URL || 'http://localhost:8000/index.html';
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
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  let f = 0;
  const t = (ok, m) => {
    if (!ok) f++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + m);
  };
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => {
    try {
      localStorage.setItem('eol.coach.v1', JSON.stringify(['draft', 'prep-ban', 'prep-pick', 'battle']));
    } catch (e) {}
  });
  await p.reload({ waitUntil: 'networkidle0' });

  async function boot(field, playerIds, enemyIds) {
    await p.evaluate((fld, pIds, eIds) => {
      const EOL = window.EOL;
      const cardOf = {};
      EOL.factions.forEach((fa) => fa.cards.forEach((c) => (cardOf[c.id] = { card: c, faction: fa })));
      EOL.ui.show('battle');
      EOL.battle.start({
        teams: { player: pIds.map((id) => cardOf[id]), enemy: eIds.map((id) => cardOf[id]) },
        field: fld ? EOL.battlefieldById(fld) : null,
      });
    }, field, playerIds, enemyIds);
    await sleep(1200);
  }
  const P6 = [
    'yamato-tomoe-gozen', // Sniper - section D's Aim rider needs her basic
    'grimmwood-puss-in-boots',
    'grimmwood-evil-queen',
    'grimmwood-rapunzel',
    'grimmwood-goldilocks',
    'grimmwood-cinderella',
  ];
  const E6 = [
    'olympus-hercules',
    'huaxia-guan-yu',
    'camelot-mordred',
    'olympus-medusa',
    'grimmwood-pied-piper',
    'camelot-guinevere',
  ];

  async function pollPop(sel, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const seen = await p.evaluate((s) => [...document.querySelectorAll(s)].map((x) => x.textContent), sel);
      if (seen.length) return seen;
      await sleep(90);
    }
    return null;
  }

  /* ---------- A: enemy-side burn tick floats (non-lethal) ---------- */
  await boot('colosseum', P6, E6);
  const burnProbe = await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const foe = B.units.find((u) => u.side === 'enemy' && u.alive);
    foe.flags.burn = 2;
    foe.flags.burnSrc = null;
    return { uid: foe.uid, displayedBefore: Math.ceil(foe.hp + foe.shield) };
  });
  await p.evaluate(() => document.getElementById('btn-endturn').click());
  let pops = await pollPop('.pop.burn', 2500);
  t(!!pops && pops.some((x) => /^-\d/.test(x)), 'A: enemy burn tick shows a damage number ' + JSON.stringify(pops));
  const burnSync = await p.evaluate((uid) => {
    const B = window.EOL.battle.getState();
    const unit = B.units.find((u) => u.uid === uid);
    const card = document.querySelector('.bcard[data-uid="' + uid + '"]');
    const text = card && card.closest('.bcell-wrap').querySelector('.bhp-txt');
    return {
      model: Math.ceil(unit.hp + unit.shield),
      painted: text ? Number(text.textContent.replace(/,/g, '')) : null,
    };
  }, burnProbe.uid);
  t(
    burnSync.model < burnProbe.displayedBefore && burnSync.painted === burnSync.model,
    'A: HP bar/text update during the Burn flames ' + JSON.stringify(burnSync)
  );
  await p.screenshot({ path: '/tmp/fx_burn_enemy.png' });
  await sleep(6000); // let the bot act & hand back

  /* ---------- B: lethal burn still shows the number BEFORE result UI ---------- */
  await boot('colosseum', P6, E6);
  await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const foes = B.units.filter((u) => u.side === 'enemy' && u.alive);
    foes.forEach((u, i) => {
      if (i === 0) {
        u.flags.burn = 3;
        u.flags.burnSrc = null;
        u.hp = 5;
      } else {
        u.alive = false;
        u.hp = 0;
      } // so the tick ENDS the battle
    });
  });
  await p.evaluate(() => document.getElementById('btn-endturn').click());
  pops = await pollPop('.pop.burn', 2500);
  t(!!pops && pops.some((x) => /^-\d/.test(x)), 'B: lethal burn tick shows the number first ' + JSON.stringify(pops));
  const res = await pollPop('#result h2, #result .result-title, #result', 6000);
  t(!!res && res.some((x) => /victory|defeat/i.test(x)), 'B: battle end follows the visible float ' + JSON.stringify(res && res.slice(0, 3)));
  await p.screenshot({ path: '/tmp/fx_burn_lethal.png' });
  await sleep(2500);

  /* ---------- C: player-side burn tick floats ---------- */
  await boot('colosseum', P6, E6);
  await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const me = B.units.find((u) => u.side === 'player' && u.alive);
    me.flags.burn = 2;
    me.flags.burnSrc = null;
  });
  await p.evaluate(() => document.getElementById('btn-endturn').click());
  /* the bot's answer + the handoff back take ~7s with full VFX on, so
     the tick that belongs to OUR side lands late - poll generously */
  pops = await pollPop('.pop.burn', 10000);
  t(!!pops && pops.some((x) => /^-\d/.test(x)), 'C: player-side burn tick shows a damage number ' + JSON.stringify(pops));
  await p.screenshot({ path: '/tmp/fx_burn_player.png' });
  await sleep(6000);

  /* ---------- D: Spirit World two-part follow-up registers ---------- */
  /* The two-part is the SNIPER BASIC (Aim): 85% hit, +5% rider against
     back-row targets. (An earlier draft of this proof swung Guy of
     Gisborne - but Guy is a Bruiser, his basic is front-row only, and
     the rider lives on Aim, not on him. Clicking the back-row Medic was
     an illegal target pick, so nothing ever fired: the game was right,
     the proof was wrong.) */
  await boot('spirit-world', P6, E6);
  const sniperUid = await p.evaluate(() => {
    const EOL = window.EOL;
    const B = EOL.battle.getState();
    const victim = B.units.find((u) => u.side === 'enemy' && u.card.id === 'camelot-guinevere');
    /* deterministic pin: 1 HP above the rider, far inside hit 1's lethal
       range (an 85% swing vs a small back-row Medic dwarfs 1 HP) */
    victim.hp = 40;
    victim.shield = 0;
    const sn = B.units.find((u) => u.side === 'player' && u.role === 'Sniper');
    return sn ? sn.uid : null;
  });
  t(!!sniperUid, 'D: a Sniper is fielded to throw Aim');
  /* The Spirit intro cine is longer than the Colosseum's and the whole UI
     is click-gated behind body[data-busy="1"]; an enemy-first opening adds
     a bot turn on top. Wait for a REAL player action window instead of a
     fixed sleep - a click that lands mid-cine falls into the void. */
  async function waitPlayerIdle(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const idle = await p.evaluate(() => {
        const B = window.EOL.battle.getState();
        return !!B && B.turn === 'player' && !B.passed.player && document.body.dataset.busy !== '1';
      });
      if (idle) return true;
      await sleep(150);
    }
    return false;
  }
  t(await waitPlayerIdle(25000), 'D: reached a player action window (intro + possible enemy opener done)');
  /* caster click with retry until the flyout actually opens */
  let opened = false;
  for (let i = 0; i < 5 && !opened; i++) {
    await waitPlayerIdle(8000);
    await p.evaluate((uid) => {
      document.querySelector('.bcard[data-uid="' + uid + '"]').click();
    }, sniperUid);
    for (let k = 0; k < 12 && !opened; k++) {
      await sleep(120);
      opened = await p.evaluate(() => !!document.querySelector('#flyout .dk-ab.act[data-ab="1"]'));
    }
  }
  t(opened, 'D: Sniper flyout opened');
  await p.evaluate(() => document.querySelector('#flyout .dk-ab.act[data-ab="1"]').click());
  await sleep(350);
  /* victim click with retry until the swing registers somewhere */
  let acted = false;
  for (let i = 0; i < 5 && !acted; i++) {
    await p.evaluate(() => {
      const B = window.EOL.battle.getState();
      const foe = B.units.find((u) => u.side === 'enemy' && u.card.id === 'camelot-guinevere');
      document.querySelector('.bcard[data-uid="' + foe.uid + '"]').click();
    });
    for (let k = 0; k < 25 && !acted; k++) {
      await sleep(120);
      acted = await p.evaluate((uid) => {
        const B = window.EOL.battle.getState();
        const v = B.units.find((u) => u.side === 'enemy' && u.card.id === 'camelot-guinevere');
        return !v.alive || v.hp < 40 || !!B.acted.player[uid];
      }, sniperUid);
    }
  }
  t(acted, 'D: the Sniper actually swung (click chain survived the cine gates)');
  pops = await pollPop('.pop.dmg, .pop', 2500);
  const fin = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const st = await p.evaluate(() => {
        const B = window.EOL.battle.getState();
        const v = B.units.find((u) => u.side === 'enemy' && u.card.id === 'camelot-guinevere');
        return v ? { alive: v.alive, hp: v.hp, spared: !!v.spiritSpared } : null;
      });
      if (st && !st.alive) return st;
      await sleep(120);
    }
    return null;
  })();
  t(
    !!fin && !fin.alive && fin.spared,
    'D: spared by hit 1, finished by the follow-up (the next blow registers) ' + JSON.stringify(fin)
  );
  await p.screenshot({ path: '/tmp/fx_spirit_2hit.png' });

  t(errs.length === 0, 'no console or page errors (' + errs.length + ')' + (errs.length ? ' :: ' + errs.join(' | ').slice(0, 200) : ''));
  console.log(f ? '\n' + f + ' FAILURES' : '\n===== ALL FX PROOFS PASSED =====');
  await br.close();
  process.exit(f ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
