/* =============================================================
   REAL INVITES + THE CUSTOM DRAFT POOL
   node sim/verify_invites_pool.js
   -------------------------------------------------------------
   Two features from the same brief, plus the two backlog fixes that
   shipped alongside them.

   INVITES. "Invite by callsign" used to call player_exists() and then
   tell the INVITER "found them, now send them the code yourself" -
   a spellchecker, not an invitation. Now the invite is delivered to
   the other player's screen, it must NOT appear while they are in a
   game, and inviting someone who is playing must say so.

   THE POOL. A private-room draft can be dealt from 36 hand-picked
   legends instead of a generated pool. 36 is the size draftPool()
   already produces (six roles x six), which is why a custom list can
   be handed straight to startDraft().

   The pool builder is booted in jsdom against the real markup and
   driven through its public surface, because the interesting claims
   are behavioural: does "fill random" actually reach exactly 36, does
   it respect what is already picked, is "use this pool" blocked at 35.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? (pass++, console.log('  ok   ' + m)) : (fail++, console.log('  FAIL ' + m));
};
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const sql = read('docs/supabase-migration-13.sql');
const mp = read('js/mp.js');
const play = read('js/play.js');
const poolSrc = read('js/pool.js');
const html = read('index.html');

/* =============================================================
   1. THE SERVER SIDE OF AN INVITE
   ============================================================= */
console.log('\nAN INVITE IS ACTUALLY DELIVERED');
{
  ok(/create table if not exists public\.mp_invites/.test(sql), 'invites are real rows, not a broadcast');
  ok(
    /create or replace function public\.send_invite/.test(sql),
    'there is a send_invite RPC'
  );

  const fn = sql.slice(sql.indexOf('function public.send_invite'), sql.indexOf('grant execute on function public.send_invite'));

  /* THE HEADLINE RULE: do not interrupt someone mid-match. */
  ok(
    /from mp_matches[\s\S]{0,120}status = 'active'[\s\S]{0,120}return 'busy'/.test(fn),
    'a player in a LIVE MATCH is never sent an invite'
  );
  ok(/return 'busy'/.test(fn), "and the inviter is told 'busy' rather than nothing happening");
  ok(/return 'no_player'/.test(fn), 'an unknown callsign is reported as such');
  ok(/return 'self'/.test(fn), 'you cannot invite yourself');
  ok(
    /and leader = me[\s\S]{0,80}return 'no_room'/.test(fn),
    'only the party LEADER can invite, enforced server-side'
  );
  ok(
    /on conflict \(from_user, to_user\) do update/.test(fn),
    're-inviting refreshes one row instead of stacking duplicate toasts'
  );

  /* A room in a lobby is not "busy" - you can leave a lobby. Only a
     live match blocks. Assert the check names mp_matches, not rooms. */
  ok(
    !/from mp_rooms[\s\S]{0,100}return 'busy'/.test(fn),
    'sitting in a ROOM lobby does not make you unreachable'
  );

  const list = sql.slice(sql.indexOf('function public.my_invites'), sql.indexOf('grant execute on function public.my_invites'));
  ok(/i\.to_user = auth\.uid\(\)/.test(list), 'you only receive invites addressed to you');
  ok(
    /join mp_rooms r on r\.code = i\.code[\s\S]{0,200}r\.status = 'open'[\s\S]{0,80}r\.guest is null/.test(list),
    'an invite to a room that has started or filled up is not shown'
  );
  ok(/interval '2 minutes'/.test(sql), 'invites expire, so an old one cannot ambush a player');

  ok(/enable row level security/.test(sql), 'RLS is on');
  const pol = sql.slice(sql.indexOf('create policy "read my invites"'), sql.indexOf('sweep_invites:'));
  ok(!/for insert|for update|for delete/.test(pol), 'no client write policy - only the definer functions write');
}

/* =============================================================
   2. THE CLIENT WILL NOT SHOW ONE MID-GAME
   ============================================================= */
console.log('\nNO TOAST WHILE YOU ARE PLAYING');
{
  ok(/function startInviteWatch/.test(mp) && /function stopInviteWatch/.test(mp), 'the watch can be stopped');
  ok(
    /startHeartbeat\(\);[\s\S]{0,240}stopInviteWatch\(\)/.test(mp),
    'joining a match STOPS the invite poll - the guarantee is upstream of the UI'
  );
  const poll = mp.slice(mp.indexOf('function pollInvites'), mp.indexOf('function startInviteWatch'));
  ok(/if \(!me\(\) \|\| busyNow\(\)\)/.test(poll), 'the poll refuses to run while busy');
  ok(
    /if \(busyNow\(\)\) return;/.test(poll),
    'and re-checks after the round trip, so a match starting mid-flight still suppresses it'
  );
  ok(/seenInvites\[inv\.id\]/.test(poll), 'the same invite is never shown twice');
  ok(
    /function busyNow[\s\S]{0,200}!!match/.test(mp),
    'busy means "in a match", decided from the live match object'
  );
  ok(
    /startInviteWatch\(\);/.test(mp.slice(mp.indexOf('function leave()'))),
    'leaving a match makes you reachable again'
  );
  ok(
    /MP\.available\(\)\) MP\.startInviteWatch/.test(play),
    'the watch follows sign-in state, so a signed-out browser never polls'
  );
}

/* =============================================================
   3. THE INVITER IS TOLD WHY
   ============================================================= */
console.log('\nTHE INVITER GETS A REASON, NOT SILENCE');
{
  const h = play.slice(play.indexOf("var invForm = $('room-invite-form')"), play.indexOf("var invForm = $('room-invite-form')") + 1800);
  ok(/MP\.sendInvite\(/.test(h), 'the form actually sends an invite');
  ok(!/playerExists/.test(h), 'it no longer merely CHECKS that the name exists');
  ok(/is in a game right now/.test(h), 'a busy player is reported in plain words');
  ok(/No player called/.test(h), 'an unknown callsign is reported');
  ok(/Only the party leader can invite/.test(h), 'a non-leader is told why');
  ok(
    /could not be sent/.test(h),
    'an unexpected failure still says something rather than leaving the note stale'
  );
}

/* =============================================================
   4. THE POOL BUILDER, DRIVEN FOR REAL
   ============================================================= */
console.log('\nTHE 36-CARD POOL BUILDER');
{
  const { JSDOM } = require('jsdom');

  /* Boot the real builder against the real markup with a synthetic
     roster, so the role-spread rules can be tested against rosters
     the shipped card set does not happen to contain. */
  function boot(spec) {
    const dom = new JSDOM(html, { runScripts: 'outside-only' });
    const W = dom.window;
    const cards = [];
    Object.keys(spec).forEach((role) => {
      for (let i = 0; i < spec[role]; i++) {
        cards.push({
          id: role.toLowerCase() + i,
          name: role + ' ' + i,
          role: role,
          rarity: i === 0 ? 'legendary' : 'common',
          element: 'physical',
          icon: 'ra-sword',
          ability: { type: 'Active', name: 'Hit', cost: 10, text: 'x' },
        });
      }
    });
    W.EOL = {
      factions: [
        { id: 'f1', name: 'Faction', icon: 'ra-shield', colors: { primary: '#fff' }, cards: cards },
      ],
      ui: {
        ROLE_ICON: {},
        buildCard: function (card, faction) {
          const el = W.document.createElement('article');
          el.className = 'card';
          el.dataset.id = card.id;
          el.dataset.name = card.name.toLowerCase();
          el.dataset.role = card.role;
          el.dataset.rarity = card.rarity;
          el.dataset.faction = faction.id;
          return el;
        },
        buildDropdown: function () {},
      },
    };
    vm.createContext(W);
    vm.runInContext(poolSrc, W, { filename: 'js/pool.js' });
    return new Promise((r) => {
      if (W.document.readyState === 'loading')
        W.document.addEventListener('DOMContentLoaded', () => r());
      else r();
    }).then(() => ({ W, cards, PB: W.EOL.poolBuilder }));
  }

  const EVEN = { Tank: 10, Bruiser: 10, Caster: 10, Controller: 10, Medic: 10, Sniper: 10 };

  ok(!!new JSDOM(html).window.document.getElementById('pool-modal'), 'the builder exists in the page');
  ok(/<script src="js\/pool\.js">/.test(html), 'pool.js is loaded by the page');

  return boot(EVEN)
    .then(({ W, cards, PB }) => {
      const $$ = (id) => W.document.getElementById(id);
      ok(!!$$('pool-slots'), 'it has a slot tray');
      ok(!!$$('pool-fill'), 'it has Fill random');
      ok(!!$$('pool-search'), 'it has a search box');
      ok(!!$$('pool-filters'), 'it has a filter row');
      ok(!!PB, 'the builder exposes a public surface');
      ok(PB.SIZE === 36, 'the pool is 36 - six per role, the size draftPool() produces');

      let committed = null;
      PB.show(true, { pool: [], onCommit: (ids) => { committed = ids; } });

      const slots = $$('pool-slots');
      ok(slots.children.length === 36, 'thirty-six slots are rendered');
      ok(slots.querySelectorAll('.pool-slot.filled').length === 0, 'and they start empty');

      const done = $$('pool-done');
      ok(done.disabled === true, '"Use this pool" is blocked while the pool is incomplete');

      const grid = $$('pool-grid');
      ok(grid.children.length === cards.length, 'the whole roster is browsable');
      grid.children[0].click();
      grid.children[1].click();
      grid.children[2].click();
      ok($$('pool-count').textContent === '3', 'clicking a card adds it');
      ok(grid.children[0].classList.contains('picked'), 'a chosen card is marked in the grid');
      grid.children[2].click();
      ok($$('pool-count').textContent === '2', 'clicking it again removes it');
      ok(done.disabled === true, 'still blocked at 2');

      /* SEARCH is the only way to find a card in a 90-card grid. */
      const search = $$('pool-search');
      search.value = 'medic 4';
      search.dispatchEvent(new W.Event('input'));
      const visible = Array.prototype.filter.call(
        grid.children,
        (c) => !c.hidden && c.style.display !== 'none'
      );
      ok(
        visible.length === 1 && visible[0].dataset.id === 'medic4',
        'search narrows the grid to the match'
      );
      search.value = '';
      search.dispatchEvent(new W.Event('input'));
      ok(
        Array.prototype.filter.call(grid.children, (c) => !c.hidden && c.style.display !== 'none')
          .length === cards.length,
        'and clearing it restores the grid'
      );

      /* The empty state is toggled by a .show class, not [hidden] -
         it animates in. Asserting on `hidden` would pass no matter
         what the code did. */
      const emptyEl = $$('pool-empty');
      search.value = 'nothing matches this';
      search.dispatchEvent(new W.Event('input'));
      ok(
        Array.prototype.filter.call(grid.children, (c) => c.style.display !== 'none').length === 0 &&
          emptyEl.classList.contains('show'),
        'a search with no hits shows the empty state'
      );
      $$('pool-reset').click();
      ok(
        !emptyEl.classList.contains('show') && search.value === '',
        'and Reset clears the search and hides it again'
      );

      const keep = PB.current();
      $$('pool-fill').click();
      const filled = PB.current();
      ok(filled.length === 36, 'Fill random completes the pool to exactly 36');
      ok(keep.every((id) => filled.indexOf(id) !== -1), 'and keeps the cards that were already picked');
      ok(new Set(filled).size === 36, 'with no duplicates');

      const roleOf = {};
      cards.forEach((c) => (roleOf[c.id] = c.role));
      const spread = {};
      filled.forEach((id) => (spread[roleOf[id]] = (spread[roleOf[id]] || 0) + 1));
      /* SIX PER ROLE EXACTLY - the shape draftPool() produces, and the
         shape a draft needs so every role is contestable. The two
         cards already picked are Tanks, so a fill that ignored what
         was held would overshoot Tank and starve whichever role got
         truncated at 36. */
      ok(
        Object.keys(spread).length === 6 && Object.values(spread).every((n) => n === 6),
        'a random fill lands on exactly six of every role, counting what was already picked'
      );

      ok(done.disabled === false, '"Use this pool" unlocks at exactly 36');
      ok(slots.querySelectorAll('.pool-slot.filled').length === 36, 'every slot shows its card');

      /* a filled slot is how you remove a card without hunting the grid */
      slots.querySelector('.pool-slot.filled').click();
      ok(PB.current().length === 35, 'clicking a filled slot removes that card');
      ok(done.disabled === true, 'and 35 is not enough - start stays blocked');
      $$('pool-fill').click();

      $$('pool-done').click();
      ok(committed && committed.length === 36, 'committing hands back the 36 ids');
      ok($$('pool-modal').hidden === true, 'and closes the builder');

      PB.show(true, { pool: committed.slice(0, 5), onCommit: () => {} });
      ok(PB.current().length === 5, 'reopening seeds from the pool already agreed');

      $$('pool-clear').click();
      ok(PB.current().length === 0, 'Clear empties it');
    })
    .then(() =>
      /* A LOPSIDED ROSTER. Two roles cannot supply six, so the
         per-role pass alone lands short of 36. This is the exact case
         the real card set could drift into, and stopping short would
         mean a leader can never start the match. */
      boot({ Tank: 2, Bruiser: 3, Caster: 20, Controller: 20, Medic: 20, Sniper: 20 }).then(
        ({ W, PB }) => {
          PB.show(true, { pool: [], onCommit: () => {} });
          W.document.getElementById('pool-fill').click();
          ok(
            PB.current().length === 36,
            'Fill random still reaches 36 when some roles are too thin to supply six'
          );
          ok(new Set(PB.current()).size === 36, 'and still without duplicates');
          ok(
            W.document.getElementById('pool-done').disabled === false,
            'so the leader can always start after filling'
          );
        }
      )
    )
    .then(() =>
      /* A ROSTER TOO SMALL TO EVER REACH 36. It must not hang or
         silently pretend, it must simply stay blocked. */
      boot({ Tank: 4, Bruiser: 4, Caster: 4, Controller: 4, Medic: 4, Sniper: 4 }).then(({ PB, W }) => {
        PB.show(true, { pool: [], onCommit: () => {} });
        W.document.getElementById('pool-fill').click();
        ok(PB.current().length === 24, 'a roster smaller than 36 fills as far as it can');
        ok(
          W.document.getElementById('pool-done').disabled === true,
          'and start stays blocked rather than dealing a short pool'
        );
      })
    )
    .then(phase5);
}

/* =============================================================
   5. THE POOL REACHES THE DRAFT
   ============================================================= */
function phase5() {
  console.log('\nTHE AGREED POOL IS WHAT GETS DEALT');
  {
    ok(/pool36/.test(play), 'the custom pool travels in the room settings');
    ok(
      /push\(\{ pool36: ids \}\)/.test(play),
      'committing the builder writes it to the room, like every other term'
    );
    ok(
      /m\.settings && m\.settings\.pool36/.test(play),
      'the match reads it back from settings, so BOTH clients get the same list'
    );
    ok(/function poolEntries/.test(play), 'ids are resolved to card entries for the draft');
    const pe = play.slice(play.indexOf('function poolEntries'), play.indexOf('function poolEntries') + 400);
    ok(/\.filter\(Boolean\)/.test(pe), 'an id that no longer resolves is dropped, not thrown');

    /* startDraft already honours opts.pool verbatim - assert that, so
       nobody later "helpfully" re-filters a hand-picked pool through
       draftPool() and silently discards the leader's choices. */
    ok(
      /opts\.pool && opts\.pool\.length \? opts\.pool\.slice\(\) : RULES\(\)\.draftPool\(/.test(play),
      'a custom pool is used VERBATIM and never re-filtered by draftPool()'
    );

    /* leader-only, hidden not greyed */
    ok(
      /cpBtn\.hidden = !lead/.test(play),
      'only the party leader sees the Build button'
    );
    ok(
      /cpRow\.hidden = s\.mode !== 'draft'/.test(play),
      'and the row only exists in Draft, where a pool means anything'
    );
  }

  console.log('\nBACKLOG: ONE TOAST, AND A NON-BLOCKING SDK');
  {
    const battle = read('js/battle.js');
    const css = read('css/style.css');
    ok(
      /window\.EOL\.ui\.toast\(msg, icon\)/.test(battle),
      'battle.js delegates to the shared toast instead of keeping a second one'
    );
    ok(
      /function toast\(msg, icon\)/.test(battle),
      'and it now accepts an icon - battle.js was already passing one that was dropped'
    );
    ok(
      /#toast\.toast \{/.test(css),
      'the old battle toast CSS is scoped to #toast so it stops fighting the shared .toast rule'
    );
    ok(
      /<script\s+defer\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase/.test(html),
      'the Supabase CDN bundle no longer blocks first paint'
    );
  }

  console.log('\npass ' + pass + '  fail ' + fail);
  process.exit(fail ? 1 : 0);
}
