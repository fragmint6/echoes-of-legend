/* =============================================================
   MATCH HISTORY - archive, replay tape, and the screen that reads it
   node sim/verify_history.js
   -------------------------------------------------------------
   The player asked for two things that sound contradictory:

     "finished matches still exist within the database and I want
      them to be deleted"
     "implement a match history system where you can see what
      happened exactly"

   The resolution is archive-then-delete: a finished match is copied
   into mp_history with a full replay tape and removed from
   mp_matches. Both halves have to hold, so both are tested.

   THREE LAYERS, ALL DRIVEN FOR REAL:

     SQL     - migration 12 is read and its guarantees asserted
               (idempotence, RLS, the delete, the backfill).
     CLIENT  - js/netplay.js is run against fake globals to prove the
               tape actually records both players' moves in order and
               that finish() archives rather than merely ends.
     SCREEN  - js/history.js is booted in jsdom against a fake mp
               layer and a real tape, and the rendered DOM is read
               back. A history screen that renders the wrong player's
               name is worse than no history screen.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};

const sql = fs.readFileSync(path.join(ROOT, 'docs/supabase-migration-12.sql'), 'utf8');
const netplaySrc = fs.readFileSync(path.join(ROOT, 'js/netplay.js'), 'utf8');
const mpSrc = fs.readFileSync(path.join(ROOT, 'js/mp.js'), 'utf8');
const historySrc = fs.readFileSync(path.join(ROOT, 'js/history.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* =============================================================
   1. THE ARCHIVE EXISTS AND THE LIVE TABLE IS EMPTIED
   ============================================================= */
console.log('\nFINISHED MATCHES LEAVE mp_matches');
{
  ok(/create table if not exists public\.mp_history/.test(sql), 'there is a separate archive table');
  ok(
    /create or replace function public\.archive_match/.test(sql),
    'archive_match is the way a match becomes history'
  );

  const fn = sql.slice(sql.indexOf('function public.archive_match'), sql.indexOf('grant execute on function public.archive_match'));
  ok(/insert into mp_history/.test(fn), 'archive_match copies the row into the archive');
  ok(/delete from mp_matches where id = m\.id/.test(fn), 'archive_match DELETES the live row');
  ok(
    fn.indexOf('insert into mp_history') < fn.indexOf('delete from mp_matches'),
    'it archives BEFORE deleting, so a failure cannot lose the match'
  );
  ok(/on conflict \(id\) do nothing/.test(fn), 'the second player archiving the same match is absorbed');
  ok(/for update/.test(fn), 'the row is locked, so two simultaneous archives cannot race');
  ok(
    /if m\.p1 <> me and m\.p2 <> me then\s*\n\s*return;/.test(fn),
    'a stranger cannot archive somebody else\u2019s match'
  );
  ok(/if me is null then/.test(fn), 'an anonymous caller is rejected');

  /* the sweeper has to agree with the new rule or it silently
     re-accumulates the clutter this migration removes */
  const sweep = sql.slice(sql.indexOf('function public.sweep_matches'));
  ok(/delete from mp_matches/.test(sweep), 'the sweeper deletes abandoned matches rather than marking them done');
  ok(/status = 'done'/.test(sweep), 'the sweeper also clears any legacy done rows left behind');
  ok(/'disconnect'/.test(sweep), 'an abandoned match is still archived, so it does not just vanish');

  ok(
    /delete from public\.mp_matches where status = 'done';/.test(sql),
    'the migration backfills: existing finished rows are cleared out'
  );
  ok(
    sql.indexOf('insert into public.mp_history') < sql.lastIndexOf('delete from public.mp_matches'),
    'the backfill archives before it deletes too'
  );
}

/* =============================================================
   2. THE ARCHIVE IS PRIVATE AND READ-ONLY
   ============================================================= */
console.log('\nHISTORY IS THE PLAYERS\u2019 OWN');
{
  ok(/alter table public\.mp_history enable row level security/.test(sql), 'RLS is on');
  const pol = sql.slice(sql.indexOf('create policy "read my history"'), sql.indexOf('archive_match:'));
  ok(/for select using \(auth\.uid\(\) = p1 or auth\.uid\(\) = p2\)/.test(pol), 'you may read only your own matches');
  ok(!/for insert|for update|for delete/.test(pol), 'there is no client write policy - only the definer function writes');

  const list = sql.slice(sql.indexOf('function public.my_history'), sql.indexOf('grant execute on function public.my_history'));
  ok(/where h\.p1 = auth\.uid\(\) or h\.p2 = auth\.uid\(\)/.test(list), 'the list is scoped to the caller');
  ok(!/\breplay\b/.test(list.replace(/has_replay|h\.replay is not null/g, '')), 'the list does NOT ship the big replay column');
  ok(/least\(coalesce\(p_limit, 40\), 100\)/.test(list), 'the page size is capped, so one call cannot pull everything');
  ok(/order by h\.ended_at desc/.test(list), 'newest first');
  ok(
    /when \(h\.winner = 'p1' and h\.p1 = auth\.uid\(\)\)/.test(list),
    'win/loss is resolved from the CALLER\u2019s side, not stored per player'
  );

  const one = sql.slice(sql.indexOf('function public.match_replay'));
  ok(/and \(h\.p1 = auth\.uid\(\) or h\.p2 = auth\.uid\(\)\)/.test(one), 'you cannot fetch a replay of a match you did not play');
}

/* =============================================================
   3. THE TAPE - run js/netplay.js for real
   -------------------------------------------------------------
   netplay.js is an IIFE over `window`, so it can be executed with a
   fabricated global and then driven through its public surface. This
   is the part that has to be exercised rather than grepped: a tape
   that records only one player's moves would still pass every text
   assertion and be useless.
   ============================================================= */
console.log('\nTHE REPLAY TAPE RECORDS BOTH PLAYERS, IN ORDER');
{
  const rpcs = [];
  const sent = [];
  const W = {
    EOL: {
      mp: {
        send: (ev, msg) => sent.push({ ev, msg }),
        endMatch: () => rpcs.push({ name: 'end_match' }),
        archiveMatch: (rec) => {
          rpcs.push({ name: 'archive_match', rec });
          return Promise.resolve(true);
        },
      },
      battle: { getState: () => B },
      engine: {
        roleAbility: (u) => ({ name: 'Basic', basic: true }),
      },
    },
  };
  const sandbox = { window: W, document: { addEventListener() {} }, console };
  const mkUnit = (side, idx, name) => ({
    side,
    idx,
    alive: true,
    hp: 10,
    maxHp: 10,
    shield: 0,
    buffs: [],
    flags: {},
    card: { id: name.toLowerCase(), name, ability: { name: name + ' Skill' } },
  });
  const B = {
    round: 3,
    energy: { player: 30, enemy: 30 },
    units: [
      mkUnit('player', 0, 'Robin'),
      mkUnit('player', 1, 'Arthur'),
      mkUnit('enemy', 0, 'Hansel'),
      mkUnit('enemy', 1, 'Gretel'),
    ],
  };

  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(netplaySrc, sandbox, { filename: 'js/netplay.js' });
  const NP = W.EOL.netplay;
  ok(!!NP, 'netplay.js loaded');

  NP.begin({ id: 'M1', host: true, oppName: 'Them' });

  /* walk the real handshake so the opening position is captured the
     way it is in a game, not poked in from the side */
  NP.startBans(() => {});
  NP.submitBans(['x']);
  NP.receive({ kind: 'bans', seq: 0, body: { ids: ['y'] } });
  let sixDone = false;
  NP.startSix(() => {
    sixDone = true;
  });
  NP.submitSix(['robin', 'arthur']);
  NP.receive({ kind: 'six', seq: 1, body: { ids: ['hansel', 'gretel'] } });
  ok(sixDone, 'the battle handshake completed');

  const ctl = NP.controller(() => {});

  /* our move */
  ctl.onLocal({ unit: B.units[0], ability: B.units[0].card.ability, chosen: [B.units[2]] });
  /* their move, delivered the way the wire delivers it */
  const p = ctl.decide(B);
  NP.receive({
    kind: 'act',
    seq: 2,
    body: { act: { unit: { side: 'player', idx: 0 }, slot: 0, targets: [{ side: 'enemy', idx: 1 }] }, sum: null },
  });

  return p
    .then(() => {
      B.round = 4;
      ctl.onLocal({ unit: B.units[1], ability: B.units[1].card.ability, chosen: [B.units[3]] });

      B.over = true;
      B.winner = 'player';
      ctl.finish(B);

      const arch = rpcs.filter((r) => r.name === 'archive_match');
      ok(arch.length === 1, 'finishing a match archives it exactly once');
      const rec = arch[0].rec;
      ok(rec.ending === 'victory', 'a natural finish is recorded as a victory ending');
      ok(rec.rounds === 4, 'the round count is recorded');

      /* THE CRITICAL ONE. We are the host, so we are p1, and we won -
         so the archived winner must be 'p1'. Reporting "player" here
         would show BOTH players a win. */
      ok(rec.winner === 'p1', 'the winner is reported in absolute p1/p2 terms, not "player"');

      const tape = rec.replay;
      ok(!!tape && !!tape.opening, 'the tape carries the opening position');
      ok(
        JSON.stringify(tape.opening.mine) === JSON.stringify(['robin', 'arthur']),
        'the opening records our squad'
      );
      ok(
        JSON.stringify(tape.opening.theirs) === JSON.stringify(['hansel', 'gretel']),
        'the opening records their squad'
      );
      ok(tape.opening.host === true, 'the opening records which seat wrote the tape');

      ok(tape.actions.length === 3, 'every action was taped: two of ours and one of theirs');
      ok(
        tape.actions.map((a) => a.by).join(',') === 'me,them,me',
        'the tape preserves the ORDER and the authorship of the moves'
      );
      ok(tape.actions[0].r === 3 && tape.actions[2].r === 4, 'each action carries the round it happened in');
      ok(tape.actions[0].act.unit.idx === 0, 'a taped action names its legend');
      ok(tape.actions[0].act.targets[0].idx === 0, 'a taped action names its targets');

      /* a match is archived once even if finish() is reached twice -
         battle.js has more than one path into endBattle() */
      ctl.finish(B);
      ok(
        rpcs.filter((r) => r.name === 'archive_match').length === 1,
        'a double finish does not archive twice'
      );

      /* =========================================================
         THE OTHER THREE SEATS
         ---------------------------------------------------------
         'player' is relative and p1/p2 is absolute, so the mapping
         between them has FOUR cases and only one of them was just
         exercised. A bug that drops the host term entirely - say
         `winner = iWon ? 'p1' : 'p2'` - is invisible from the
         host-who-won case alone and would tell the guest they won a
         game they lost. Run all four.
         ========================================================= */
      function seat(isHost, iWon) {
        const got = [];
        W.EOL.mp.archiveMatch = (rec) => {
          got.push(rec);
          return Promise.resolve(true);
        };
        NP.end('local');
        NP.begin({ id: 'M', host: isHost, oppName: 'Them' });
        const c = NP.controller(() => {});
        c.finish({ round: 1, over: true, winner: iWon ? 'player' : 'enemy' });
        return got[0] && got[0].winner;
      }
      ok(seat(true, true) === 'p1', 'host wins  -> p1');
      ok(seat(true, false) === 'p2', 'host loses -> p2');
      ok(seat(false, true) === 'p2', 'GUEST wins  -> p2 (the guest is never p1)');
      ok(seat(false, false) === 'p1', 'guest loses -> p1');

      return phase4();
    })
    .then(() => {
      console.log('\npass ' + pass + '  fail ' + fail);
      process.exit(fail ? 1 : 0);
    })
    .catch((e) => {
      console.log('  FAIL harness threw: ' + (e && e.stack));
      console.log('\npass ' + pass + '  fail ' + (fail + 1));
      process.exit(1);
    });
}

/* =============================================================
   4. THE CLIENT NEVER STRANDS A PLAYER, AND THE SCREEN READS RIGHT
   ============================================================= */
function phase4() {
  console.log('\nA MISSING ARCHIVE NEVER STRANDS A PLAYER');
  {
    const fn = mpSrc.slice(mpSrc.indexOf('function archiveMatch'), mpSrc.indexOf('function history'));
    ok(/rpc\('archive_match'/.test(fn), 'the client calls archive_match');
    ok(
      (fn.match(/end_match/g) || []).length >= 2,
      'both the error and the rejection path fall back to end_match'
    );
    ok(/stopHeartbeat\(\)/.test(fn), 'archiving stops the heartbeat, like endMatch does');
    ok(/archiveMatch: archiveMatch/.test(mpSrc) && /history: history/.test(mpSrc) && /replay: replay/.test(mpSrc),
      'the history API is exported');
  }

  console.log('\nTHE HISTORY SCREEN');
  const { JSDOM } = require('jsdom');
  /* Boot the real markup so the test breaks if the ids drift apart
     from the script - the commonest way a screen like this dies. */
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const W = dom.window;

  ok(!!W.document.getElementById('acct-history'), 'the entry point is in the account dropdown');
  const menu = W.document.getElementById('acct-menu');
  ok(
    menu && menu.contains(W.document.getElementById('acct-history')),
    'it is in the SAME dropdown as Settings and Sign out'
  );
  ok(!!W.document.getElementById('acct-settings') && !!W.document.getElementById('acct-logout'),
    'Settings and Log out are still there beside it');
  ok(/#acct-history\s*\{\s*display: none/.test(
      fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8').replace(/\s*\n\s*/g, ' ')
        .replace(/body:not\(\[data-auth='in'\]\) #acct-history \{ display: none/, "#acct-history { display: none")),
    'history is hidden while signed out - there is nothing to show a guest');

  ok(!!W.document.getElementById('hist-modal'), 'the history modal exists');
  ok(!!W.document.getElementById('hist-list') && !!W.document.getElementById('hist-log'),
    'it has both a list view and a per-match view');
  ok(/<script src="js\/history\.js">/.test(html), 'history.js is loaded by the page');

  /* --- drive the screen against a real tape --- */
  const ROWS = [
    {
      id: 'M1',
      mode: 'draft',
      opponent: 'Rival',
      i_was: 'p1',
      winner: 'p1',
      outcome: 'win',
      ending: 'victory',
      rounds: 4,
      has_replay: true,
      ended_at: new Date().toISOString(),
    },
    {
      id: 'M2',
      mode: 'classic',
      opponent: 'Other',
      i_was: 'p2',
      winner: 'p1',
      outcome: 'loss',
      ending: 'forfeit',
      rounds: 2,
      has_replay: false,
      ended_at: new Date().toISOString(),
    },
  ];
  const REPLAY = {
    id: 'M1',
    mode: 'draft',
    p1_name: 'Me',
    p2_name: 'Rival',
    i_was: 'p1',
    winner: 'p1',
    ending: 'victory',
    rounds: 4,
    replay: {
      opening: { mine: ['robin'], theirs: ['hansel'], host: true },
      actions: [
        { by: 'me', act: { unit: { side: 'player', idx: 0 }, slot: 0, targets: [{ side: 'enemy', idx: 0 }] }, r: 3 },
        { by: 'them', act: null, r: 3 },
        { by: 'me', act: { unit: { side: 'player', idx: 0 }, slot: 1, targets: [{ side: 'enemy', idx: 0 }] }, r: 4 },
      ],
    },
  };

  W.EOL = {
    factions: [
      {
        cards: [
          { id: 'robin', name: 'Robin Hood', role: 'Sniper', ability: { name: 'Aim' } },
          { id: 'hansel', name: 'Hansel', role: 'Tank', ability: { name: 'Crumbs' } },
        ],
      },
    ],
    roleAbilities: { Sniper: { name: 'Take Aim' }, Tank: { name: 'Brace' } },
    mp: {
      history: () => Promise.resolve({ rows: ROWS, error: null }),
      replay: () => Promise.resolve({ data: REPLAY, error: null }),
    },
  };

  const vm = require('vm');
  vm.createContext(W);
  vm.runInContext(historySrc, W, { filename: 'js/history.js' });

  /* history.js defers its wiring to DOMContentLoaded, exactly as it
     must in the real page - so the harness has to wait for it rather
     than clicking into a document that has not finished parsing. */
  return new Promise((r) => {
    if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', () => r());
    else r();
  }).then(() => {
    ok(true, 'the screen wires itself up once the document is ready');

    W.document.getElementById('acct-history').click();
    const modal = W.document.getElementById('hist-modal');
    ok(!modal.hidden, 'clicking the menu item opens the modal');
    ok(W.document.getElementById('acct-menu').hidden, 'and closes the dropdown behind it');
    return new Promise((r) => setTimeout(r, 0));
  }).then(() => {
    const rows = W.document.querySelectorAll('#hist-list .hist-row');
    ok(rows.length === 2, 'both matches are listed');
    ok(/Victory/.test(rows[0].textContent), 'a win reads as a Victory');
    ok(/Defeat/.test(rows[1].textContent), 'a loss reads as a Defeat');
    ok(/vs Rival/.test(rows[0].textContent), 'the opponent is named');
    ok(/4 rounds/.test(rows[0].textContent), 'the length is shown');
    ok(/Forfeited/.test(rows[1].textContent), 'how it ended is shown');

    /* A match with no tape must not offer to open an empty screen. */
    ok(rows[0].classList.contains('has-replay'), 'a match with a replay is openable');
    ok(!rows[1].classList.contains('has-replay'), 'a match without one is NOT openable');
    ok(rows[1].tabIndex !== 0, 'and it is not focusable either');

    rows[0].click();
    return new Promise((r2) => setTimeout(r2, 0));
  }).then(() => {
    ok(W.document.getElementById('hist-list-view').hidden, 'opening a match hides the list');
    ok(!W.document.getElementById('hist-one-view').hidden, 'and shows the match');

    const score = W.document.getElementById('hist-score').textContent;
    ok(/Victory/.test(score), 'the verdict is stated from MY side');
    ok(/Me vs Rival/.test(score), 'both players are named');
    ok(/Robin Hood/.test(score) && /Hansel/.test(score), 'both squads are listed by card name, not id');

    const items = W.document.querySelectorAll('#hist-log li');
    const text = Array.prototype.map.call(items, (li) => li.textContent).join(' | ');

    ok(/Round 3/.test(text) && /Round 4/.test(text), 'the log is grouped into rounds');
    ok(/Robin Hood/.test(text), 'a move names the legend who made it');
    /* slot 0 is the signature skill, slot 1 the role skill - if these
       were swapped every archived match would read wrong */
    ok(/used Aim on Hansel/.test(text), 'slot 0 resolves to the legend\u2019s signature skill');
    ok(/used Take Aim on Hansel/.test(text), 'slot 1 resolves to the ROLE skill, not the signature one');
    ok(/passed/.test(text), 'a pass is recorded as a pass rather than dropped');

    const mine = W.document.querySelectorAll('#hist-log .hist-move.hist-mine');
    ok(mine.length === 2, 'my two moves are marked as mine');
    const theirs = W.document.querySelectorAll('#hist-log .hist-move:not(.hist-mine)');
    ok(theirs.length === 1, 'and their one move is not');

    W.document.getElementById('hist-back').click();
    ok(!W.document.getElementById('hist-list-view').hidden, 'Back returns to the list');

    W.document.getElementById('hist-close').click();
    ok(W.document.getElementById('hist-modal').hidden, 'Close dismisses the modal');
  });
}
