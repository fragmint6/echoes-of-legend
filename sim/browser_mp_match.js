/* =============================================================
   MULTIPLAYER MATCH - two real browser clients
   -------------------------------------------------------------
   Browser test. Requires puppeteer:
     cd /tmp && npm install puppeteer --no-audit --no-fund
   Then:  node sim/browser_mp_match.js

   Drives a COMPLETE match between two headless browsers wired to
   each other through an in-page stand-in for Supabase Realtime, and
   asserts at every stage that the two clients agree: identical packs
   from the shared seed, correct turn locking, blind simultaneous
   bans, mirrored squads, and a byte-identical board checksum after
   every single battle action, through to opposite result screens.
   ============================================================= */
const puppeteer = require('/tmp/node_modules/puppeteer');
const path = require('path').resolve(__dirname, '..', 'index.html');
const CHROME = '/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';

const SEED = 987654321;

function shim(isHost, oppName) {
  return `(() => {
    window.__out = [];
    const MP = window.EOL.mp;
    const handlers = {};
    // replace the supabase-backed transport with an in-page pipe the
    // harness pumps by hand
    MP.on = (n, fn) => { (handlers[n] = handlers[n] || []).push(fn); };
    MP.send = (event, payload) => { window.__out.push({ event, payload }); return Promise.resolve(); };
    MP.available = () => true;
    MP.isHost = () => ${isHost};
    MP.current = () => window.__match;
    window.__emit = (n, p) => (handlers[n] || []).forEach(f => f(p));
    window.__match = { id: 'test', seed: ${SEED}, host: ${isHost}, oppId: 'x', oppName: ${JSON.stringify(oppName)} };
    window.EOL.auth.user = () => ({ id: '${isHost ? 'host' : 'guest'}', name: ${JSON.stringify(oppName === 'Guest' ? 'Host' : 'Guest')}, email: '', avatar: '' });
    window.EOL.auth.isReady = () => true;
    window.EOL.play._initMp();
    // skip coach overlays so they never swallow a click
    try { localStorage.setItem('eol.coach.v1', JSON.stringify(['draft','prep-ban','prep-pick','battle'])); } catch (e) {}
    window.EOL.gfx.set('low');
  })()`;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--blink-settings=primaryHoverType=2,availableHoverTypes=2'],
  });

  const errs = [];
  const mk = async (isHost, opp) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 1600, height: 950 });
    p.on('pageerror', e => errs.push((isHost ? 'HOST' : 'GUEST') + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push((isHost ? 'HOST' : 'GUEST') + ' console: ' + m.text()); });
    await p.goto('file://' + path, { waitUntil: 'networkidle0' });
    await p.evaluate(shim(isHost, opp));
    return p;
  };

  const A = await mk(true, 'Guest');   // host
  const B = await mk(false, 'Host');   // guest

  // pump: drain each page's outbox into the other page's inbox
  async function pump() {
    for (let i = 0; i < 6; i++) {
      const a = await A.evaluate(() => { const o = window.__out; window.__out = []; return o; });
      const b = await B.evaluate(() => { const o = window.__out; window.__out = []; return o; });
      for (const m of a) await B.evaluate((e, p) => window.__emit(e, p), m.event, m.payload);
      for (const m of b) await A.evaluate((e, p) => window.__emit(e, p), m.event, m.payload);
      if (!a.length && !b.length) return;
      await sleep(120);
    }
  }

  const say = (ok, msg) => console.log((ok ? '  PASS  ' : '  FAIL  ') + msg);
  let fails = 0;
  const chk = (ok, msg) => { if (!ok) fails++; say(ok, msg); };

  // ---------- matched ----------
  await A.evaluate(() => window.__emit('matched', window.__match));
  await B.evaluate(() => window.__emit('matched', window.__match));
  await sleep(2000);
  await pump();

  const view = p => p.evaluate(() => document.body.dataset.view || '?');
  chk((await view(A)) === 'draft', 'host reached the draft, saw ' + (await view(A)));
  chk((await view(B)) === 'draft', 'guest reached the draft, saw ' + (await view(B)));

  // identical packs from the seed
  const packOf = p => p.evaluate(() => { const d = window.EOL.play._draftState(); return d ? d.offered.map(e => e.card.id) : []; });
  const pa = await packOf(A), pb = await packOf(B);
  chk(pa.length === 3 && JSON.stringify(pa) === JSON.stringify(pb), 'both clients built the same pack 0: ' + JSON.stringify(pa) + ' vs ' + JSON.stringify(pb));

  // ---------- run the whole draft ----------
  const canPick = p => p.evaluate(() => {
    const v = document.querySelector('.view.draft');
    if (!v || getComputedStyle(v).display === 'none') return false;
    return !v.classList.contains('busy');
  });
  const pick = async p => p.evaluate(() => {
    const cards = [...document.querySelectorAll('#draft-pack .dpack-card')].filter(c => !c.classList.contains('taken') && !c.classList.contains('burnout') && !c.classList.contains('capped'));
    if (!cards.length) return false;
    cards[0].click();
    return true;
  });

  let guard = 0;
  while (guard++ < 120) {
    const inDraft = (await view(A)) === 'draft' || (await view(B)) === 'draft';
    if (!inDraft) break;
    if (await canPick(A)) await pick(A);
    else if (await canPick(B)) await pick(B);
    await pump();
    await sleep(140);
  }
  chk(guard < 120, 'draft completed in ' + guard + ' iterations');
  chk((await view(A)) === 'prep', 'host reached preparation, saw ' + (await view(A)));
  chk((await view(B)) === 'prep', 'guest reached preparation, saw ' + (await view(B)));

  // squads must mirror
  const squad = p => p.evaluate(() => ({
    you: [...document.querySelectorAll('#prep-player .pcard')].map(c => c.dataset.cid),
    foe: [...document.querySelectorAll('#prep-enemy .pcard')].map(c => c.dataset.cid),
  }));
  const sa = await squad(A), sb = await squad(B);
  chk(sa.you.length === 12 && sb.you.length === 12, 'both squads are 12 (' + sa.you.length + '/' + sb.you.length + ')');
  chk(JSON.stringify(sa.you) === JSON.stringify(sb.foe), "host's twelve is the guest's opponent twelve");
  chk(JSON.stringify(sb.you) === JSON.stringify(sa.foe), "guest's twelve is the host's opponent twelve");

  // battlefield must match on both machines
  const fieldOf = p => p.evaluate(() => { const s = window.EOL.play._prepState(); return s ? s.field.id : null; });

  // ---------- bans ----------
  const ban2 = async p => p.evaluate(() => {
    const cards = [...document.querySelectorAll('#prep-enemy .pcard')];
    cards[0].click(); cards[1].click();
    return cards.slice(0, 2).map(c => c.dataset.cid);
  });
  const banA = await ban2(A);
  const banB = await ban2(B);

  // host commits first; nothing may be revealed until the guest does too
  await A.evaluate(() => document.getElementById('prep-confirm-main').click());
  await pump();
  await sleep(400);
  const revealedEarly = await A.evaluate(() => !!document.querySelector('#prep-player .pcard.banned'));
  chk(!revealedEarly, 'committing first does NOT reveal the opponent bans early');

  await B.evaluate(() => document.getElementById('prep-confirm-main').click());
  await pump();
  await sleep(2200);
  await pump();

  const bannedOn = p => p.evaluate(() => [...document.querySelectorAll('#prep-player .pcard.banned')].map(c => c.dataset.cid).sort());
  const bA = await bannedOn(A), bB = await bannedOn(B);
  chk(JSON.stringify(bA) === JSON.stringify(banB.sort()), "host sees exactly the guest's two bans");
  chk(JSON.stringify(bB) === JSON.stringify(banA.sort()), "guest sees exactly the host's two bans");

  const fA = await fieldOf(A), fB = await fieldOf(B);
  chk(fA && fA === fB, 'both clients rolled the same battlefield: ' + fA + ' / ' + fB);

  // ---------- formation ----------
  const pickSix = async p => p.evaluate(() => {
    const cards = [...document.querySelectorAll('#prep-player .pcard:not(.banned)')];
    let n = 0;
    for (const c of cards) { if (n >= 6) break; c.click(); n++; }
    return n;
  });
  chk((await pickSix(A)) === 6, 'host fielded six');
  chk((await pickSix(B)) === 6, 'guest fielded six');

  await A.evaluate(() => document.getElementById('prep-confirm').click());
  await pump();
  await sleep(400);
  chk((await view(A)) === 'prep', 'host waits in preparation until the guest commits');

  await B.evaluate(() => document.getElementById('prep-confirm').click());
  await pump();
  await sleep(1500);
  await pump();
  await sleep(1500);

  chk((await view(A)) === 'battle', 'host reached the battle, saw ' + (await view(A)));
  chk((await view(B)) === 'battle', 'guest reached the battle, saw ' + (await view(B)));

  // ---------- board agreement ----------
  const board = p => p.evaluate(() => {
    const B = window.EOL.battle.getState();
    if (!B) return null;
    const key = u => [u.side, u.idx, u.card.id, u.slot, Math.round(u.hp)].join(':');
    return {
      round: B.round,
      turn: B.turn,
      oddFirst: B.oddFirst,
      mine: B.units.filter(u => u.side === 'player').map(key),
      theirs: B.units.filter(u => u.side === 'enemy').map(key),
      sum: window.EOL.netplay.checksum(B),
    };
  });
  const boA = await board(A), boB = await board(B);
  chk(!!boA && !!boB, 'both engines built a battle');
  chk(JSON.stringify(boA.mine.map(s => s.split(':')[2])) === JSON.stringify(boB.theirs.map(s => s.split(':')[2])), "host's six is the guest's opposing six");
  chk(JSON.stringify(boB.mine.map(s => s.split(':')[2])) === JSON.stringify(boA.theirs.map(s => s.split(':')[2])), "guest's six is the host's opposing six");
  chk(boA.oddFirst === 'player' && boB.oddFirst === 'enemy', 'host opens odd rounds, guest opens even (' + boA.oddFirst + '/' + boB.oddFirst + ')');
  chk(boA.turn !== boB.turn, 'exactly one client is on turn (' + boA.turn + ' / ' + boB.turn + ')');
  chk(boA.sum === boB.sum, 'opening checksums match: ' + boA.sum + ' / ' + boB.sum);

  console.log('\n  --- battle turn exchange ---');

  // ---------- play some real actions across the wire ----------
  const onTurn = async p => (await p.evaluate(() => {
    const B = window.EOL.battle.getState();
    return B && !B.over && B.turn === 'player' && document.body.dataset.busy !== '1';
  }));
  const act = async p => p.evaluate(() => {
    const B = window.EOL.battle.getState();
    const E = window.EOL.engine;
    const me = B.units.filter(u => u.side === 'player' && u.alive && !B.acted.player[u.uid]);
    for (const u of me) {
      for (const ab of [u.card.ability, E.roleAbility(u)]) {
        if (!ab || ab.type !== 'Active') continue;
        if (!E.canUse(B, u, ab)) continue;
        const need = E.pickCount(ab);
        const el = document.querySelector('.bcard[data-uid="' + u.uid + '"]');
        if (!el) continue;
        el.click();
        const rows = [...document.querySelectorAll('#flyout .dk-ab.act[data-ab]')];
        const row = rows.find(r => r.dataset.ab === (ab === u.card.ability ? '0' : '1'));
        if (!row) continue;
        row.click();
        if (need > 0) {
          const pool = E.legalTargets(B, u, ab);
          for (let i = 0; i < need && i < pool.length; i++) {
            const te = document.querySelector('.bcard[data-uid="' + pool[i].uid + '"]');
            if (te) te.click();
          }
        }
        return u.card.id + '/' + ab.name;
      }
    }
    document.getElementById('btn-endturn').click();
    return 'PASS';
  });

  let exchanges = 0, desync = null;
  for (let i = 0; i < 260; i++) {
    const over = await A.evaluate(() => { const B = window.EOL.battle.getState(); return !B || B.over; });
    if (over) break;
    let who = null;
    if (await onTurn(A)) who = A; else if (await onTurn(B)) who = B;
    if (!who) { await pump(); await sleep(500); continue; }
    const what = await act(who);
    await sleep(300);
    await pump();

    /* Compare only when BOTH clients are quiet. Sampling mid-animation
       reads a board that has applied the move on one side and not yet
       on the other, which looks exactly like a desync and is not one. */
    const idle = async p => p.evaluate(() => {
      const B = window.EOL.battle.getState();
      return document.body.dataset.busy !== '1' && document.body.dataset.netwait !== '1' && (!B || B.over || B.turn === 'player' || true);
    });
    let settle = 0;
    while (settle++ < 40) {
      await pump();
      if ((await idle(A)) && (await idle(B))) {
        await sleep(250);
        await pump();
        if ((await idle(A)) && (await idle(B))) break;
      }
      await sleep(250);
    }

    const x = await board(A), y = await board(B);
    if (x && y && x.sum !== y.sum) { desync = { i, what, x: x.sum, y: y.sum, r: [x.round, y.round] }; break; }
    exchanges++;
  }

  const overA = await A.evaluate(() => { const B = window.EOL.battle.getState(); return !!(B && B.over); });
  const overB = await B.evaluate(() => { const B = window.EOL.battle.getState(); return !!(B && B.over); });
  chk(exchanges >= 4, 'played ' + exchanges + ' synchronised actions across the wire');
  chk(overA && overB, 'the match reached a result on both clients (' + overA + '/' + overB + ')');
  const winA = await A.evaluate(() => { const B = window.EOL.battle.getState(); return B && B.winner; });
  const winB = await B.evaluate(() => { const B = window.EOL.battle.getState(); return B && B.winner; });
  chk(winA && winB && winA !== winB, 'exactly one player won: host says ' + winA + ', guest says ' + winB);
  await sleep(2500);
  const resOf = p => p.evaluate(() => { const r = document.getElementById('result'); return r && r.classList.contains('show') ? r.querySelector('.result-title').textContent : ''; });
  const resA = await resOf(A);
  const resB = await resOf(B);
  chk(resA && resB && resA !== resB, 'result screens are opposite: host "' + resA + '", guest "' + resB + '"');
  chk(!desync, desync ? 'DESYNC after ' + desync.what + ' -> ' + JSON.stringify(desync) : 'boards stayed byte-identical through every exchange');

  const finA = await board(A), finB = await board(B);
  if (finA && finB) {
    chk(finA.sum === finB.sum, 'final checksums agree: ' + finA.sum + ' / ' + finB.sum);
    chk(finA.round === finB.round, 'both clients on round ' + finA.round + '/' + finB.round);
    console.log('  info    host HP ' + finA.mine.map(s => s.split(':')[4]).join(',') + ' | guest HP ' + finB.mine.map(s => s.split(':')[4]).join(','));
  }

  console.log('\n  console/page errors: ' + errs.length);
  errs.slice(0, 8).forEach(e => console.log('    ' + e));
  chk(errs.length === 0, 'no console or page errors');

  console.log('\n' + (fails ? '===== ' + fails + ' FAILED =====' : '===== ALL PASSED ====='));
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
