/* =============================================================
 * Match history - the archive, read back
 * -------------------------------------------------------------
 * A finished match no longer lives in mp_matches. It is copied into
 * mp_history together with its replay tape and then deleted, so the
 * live table only ever holds live games (see docs/supabase-migration-12.sql).
 * This file is the reading end of that: the list of past matches, and
 * one match opened as a turn-by-turn account of what happened.
 *
 * WHY A TAPE AND NOT A TRANSCRIPT
 *
 *   The tape stores what each player DID - legend, skill slot, targets -
 *   not what the engine then decided. That is deliberate. Damage
 *   numbers depend on buffs, terrain, crits and round state, and a
 *   transcript of them would be a second source of truth that can
 *   disagree with the engine. The actions are the ground truth the
 *   netcode itself trusts; everything else is derived.
 *
 *   So this renderer names the moves in the language the player used
 *   at the time: "Round 3 - Robin Hood used Aim on Hansel". That is
 *   "exactly what happened" at the resolution the record can honestly
 *   support, and it is enough to follow a whole match back.
 *
 * PERSPECTIVE
 *
 *   Every action was recorded by ONE client, in that client's frame,
 *   where 'player' means "the recorder" and 'enemy' means "the other
 *   one". `by` says whether the recorder or their opponent made the
 *   move. Since both clients archive the same match and the server
 *   keeps whichever arrived first, the tape may have been written by
 *   either seat - so the header always states whose view it is rather
 *   than assuming it is yours.
 * ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  function $(id) {
    return document.getElementById(id);
  }

  var open = false;
  var loading = false;
  var cardIndex = null;

  /* ---------------------------------------------------------
     card lookup
     ---------------------------------------------------------
     Built once, lazily, from the shipped faction data. The tape
     stores ids, so a card that has been renamed or reworked since
     still resolves - and one that has been REMOVED degrades to its
     id rather than breaking the whole view. */
  function cards() {
    if (cardIndex) return cardIndex;
    cardIndex = {};
    (window.EOL.factions || []).forEach(function (f) {
      (f.cards || []).forEach(function (c) {
        cardIndex[c.id] = c;
      });
    });
    return cardIndex;
  }

  function cardOf(id) {
    return cards()[id] || null;
  }

  function nameOf(id) {
    var c = cardOf(id);
    return c ? c.name : String(id || '?');
  }

  /* ---------------------------------------------------------
     rendering the list
     --------------------------------------------------------- */
  function fmtWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return 'Today ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  var ENDINGS = {
    victory: 'Fought to the end',
    forfeit: 'Forfeited',
    disconnect: 'Disconnected',
    unknown: '',
  };

  function row(m) {
    var li = document.createElement('li');
    li.className = 'hist-row hist-' + (m.outcome || 'unknown');
    if (m.has_replay) li.classList.add('has-replay');

    var verdict = document.createElement('span');
    verdict.className = 'hist-verdict';
    verdict.textContent =
      m.outcome === 'win'
        ? 'Victory'
        : m.outcome === 'loss'
          ? 'Defeat'
          : m.outcome === 'draw'
            ? 'Draw'
            : 'Unfinished';

    var body = document.createElement('span');
    body.className = 'hist-body';
    var opp = document.createElement('b');
    opp.textContent = 'vs ' + (m.opponent || 'Player');
    var meta = document.createElement('small');
    var bits = [];
    if (m.mode) bits.push(m.mode === 'classic' ? 'Classic' : 'Draft');
    if (m.rounds) bits.push(m.rounds + (m.rounds === 1 ? ' round' : ' rounds'));
    if (ENDINGS[m.ending]) bits.push(ENDINGS[m.ending]);
    meta.textContent = bits.join('  -  ');
    body.appendChild(opp);
    body.appendChild(meta);

    var when = document.createElement('span');
    when.className = 'hist-when';
    when.textContent = fmtWhen(m.ended_at);

    li.appendChild(verdict);
    li.appendChild(body);
    li.appendChild(when);

    /* Only a match with a tape can be opened. Rows without one - a
       disconnect nobody was present for - stay inert rather than
       opening an empty screen. */
    if (m.has_replay) {
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.addEventListener('click', function () {
        openMatch(m.id);
      });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMatch(m.id);
        }
      });
    }
    return li;
  }

  function msg(text) {
    var el = $('hist-msg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function showList() {
    var a = $('hist-list-view');
    var b = $('hist-one-view');
    if (a) a.hidden = false;
    if (b) b.hidden = true;
    var sub = $('hist-sub');
    if (sub) sub.textContent = 'Your finished online matches.';
  }

  function load() {
    var list = $('hist-list');
    if (!list || loading) return;
    loading = true;
    list.textContent = '';
    msg('Loading your matches...');

    var mp = window.EOL.mp;
    if (!mp || !mp.history) {
      loading = false;
      msg('Match history is unavailable right now.');
      return;
    }
    mp.history(40, 0).then(function (res) {
      loading = false;
      if (!open) return;
      if (res.error) {
        /* The commonest cause by far is that migration 12 has not been
           run against this project. Say something a player can act on
           instead of surfacing a Postgres error. */
        msg('Your match history could not be loaded. Please try again later.');
        return;
      }
      if (!res.rows.length) {
        msg('No finished matches yet. Play someone online and it will show up here.');
        return;
      }
      msg('');
      res.rows.forEach(function (m) {
        list.appendChild(row(m));
      });
    });
  }

  /* ---------------------------------------------------------
     rendering one match
     --------------------------------------------------------- */

  /* The tape names legends by (side, idx) in the RECORDER's frame.
     Rebuild both squads from the opening so those refs resolve back
     into names. `mine`/`theirs` are also the recorder's, and the
     recorder's own units are the ones on side 'player'. */
  function squads(opening) {
    var by = { player: [], enemy: [] };
    (opening.mine || []).forEach(function (id, i) {
      by.player[i] = id;
    });
    (opening.theirs || []).forEach(function (id, i) {
      by.enemy[i] = id;
    });
    return by;
  }

  function legendName(by, ref) {
    if (!ref || !by[ref.side]) return 'someone';
    return nameOf(by[ref.side][ref.idx]);
  }

  /* Slot 0 is the legend's signature skill, slot 1 the generic one for
     their role - the same two-slot encoding the wire uses, so a later
     rename cannot desync an archived match either. */
  function skillName(by, ref, slot) {
    var c = ref && by[ref.side] ? cardOf(by[ref.side][ref.idx]) : null;
    if (slot === 0) return c && c.ability ? c.ability.name : 'their skill';
    var roles = window.EOL.roleAbilities || {};
    var ra = c && roles[c.role];
    return ra ? ra.name : 'a basic skill';
  }

  function line(by, entry, who) {
    var li = document.createElement('li');
    li.className = 'hist-move hist-move-' + entry.by;

    if (!entry.act) {
      li.classList.add('hist-pass');
      li.textContent = who + ' passed.';
      return li;
    }

    var actor = legendName(by, entry.act.unit);
    var skill = skillName(by, entry.act.unit, entry.act.slot);
    var targets = (entry.act.targets || []).map(function (t) {
      return legendName(by, t);
    });

    var strong = document.createElement('b');
    strong.textContent = actor;
    li.appendChild(strong);

    var rest = document.createElement('span');
    var txt = ' used ' + skill;
    if (targets.length === 1) txt += ' on ' + targets[0];
    else if (targets.length > 1) {
      txt += ' on ' + targets.slice(0, -1).join(', ') + ' and ' + targets[targets.length - 1];
    }
    rest.textContent = txt;
    li.appendChild(rest);
    return li;
  }

  function renderMatch(d) {
    var log = $('hist-log');
    var score = $('hist-score');
    if (!log || !score) return;
    log.textContent = '';
    score.textContent = '';

    var tape = d.replay || {};
    var opening = tape.opening || null;
    var acts = tape.actions || [];

    /* Whose frame was this recorded in? The archive keeps the FIRST
       upload, which may have come from either player, so say so
       rather than silently mislabelling both sides. */
    var iWasP1 = d.i_was === 'p1';
    var meName = iWasP1 ? d.p1_name : d.p2_name;
    var themName = iWasP1 ? d.p2_name : d.p1_name;
    /* `by:'me'` is the RECORDER. The recorder is the host, and the
       host is p1 - the same mapping archive() used to report a
       winner. */
    var recorderIsP1 = !opening || opening.host !== false;
    var meIsRecorder = recorderIsP1 === iWasP1;

    var head = document.createElement('div');
    head.className = 'hist-score-head';
    var outcome =
      !d.winner
        ? 'Unfinished'
        : d.winner === 'draw'
          ? 'Draw'
          : (d.winner === 'p1') === iWasP1
            ? 'Victory'
            : 'Defeat';
    head.textContent = outcome + '  -  ' + (meName || 'You') + ' vs ' + (themName || 'Player');
    score.appendChild(head);

    var sub = document.createElement('div');
    sub.className = 'hist-score-sub';
    var bits = [];
    bits.push(d.mode === 'classic' ? 'Classic' : 'Draft');
    if (d.rounds) bits.push(d.rounds + (d.rounds === 1 ? ' round' : ' rounds'));
    if (ENDINGS[d.ending]) bits.push(ENDINGS[d.ending]);
    sub.textContent = bits.join('  -  ');
    score.appendChild(sub);

    if (!opening || !acts.length) {
      var none = document.createElement('li');
      none.className = 'hist-empty';
      none.textContent = 'No move-by-move record was captured for this match.';
      log.appendChild(none);
      return;
    }

    /* the squads, so the reader knows who was on the board */
    var by = squads(opening);
    var rosterEl = document.createElement('div');
    rosterEl.className = 'hist-squads';
    [
      { label: meIsRecorder ? 'Your squad' : (themName || 'Opponent') + "'s squad", ids: opening.mine },
      { label: meIsRecorder ? (themName || 'Opponent') + "'s squad" : 'Your squad', ids: opening.theirs },
    ].forEach(function (s) {
      var d2 = document.createElement('div');
      var b = document.createElement('b');
      b.textContent = s.label;
      var span = document.createElement('span');
      span.textContent = (s.ids || []).map(nameOf).join(', ');
      d2.appendChild(b);
      d2.appendChild(span);
      rosterEl.appendChild(d2);
    });
    score.appendChild(rosterEl);

    var lastRound = -1;
    acts.forEach(function (entry) {
      var r = entry.r || 0;
      if (r !== lastRound) {
        lastRound = r;
        var hdr = document.createElement('li');
        hdr.className = 'hist-round';
        hdr.textContent = 'Round ' + r;
        log.appendChild(hdr);
      }
      /* 'me' on the tape is the recorder, which is only YOU if you
         were the one who uploaded it. */
      var mine = entry.by === 'me' ? meIsRecorder : !meIsRecorder;
      var who = mine ? meName || 'You' : themName || 'Opponent';
      var li = line(by, entry, who);
      li.classList.toggle('hist-mine', mine);
      log.appendChild(li);
    });
  }

  function openMatch(id) {
    var mp = window.EOL.mp;
    if (!mp || !mp.replay) return;
    var a = $('hist-list-view');
    var b = $('hist-one-view');
    if (a) a.hidden = true;
    if (b) b.hidden = false;
    var log = $('hist-log');
    var score = $('hist-score');
    if (score) score.textContent = '';
    if (log) {
      log.textContent = '';
      var wait = document.createElement('li');
      wait.className = 'hist-empty';
      wait.textContent = 'Loading the match...';
      log.appendChild(wait);
    }
    var sub = $('hist-sub');
    if (sub) sub.textContent = 'What happened, turn by turn.';

    mp.replay(id).then(function (res) {
      if (!open) return;
      if (res.error || !res.data) {
        if (log) {
          log.textContent = '';
          var e = document.createElement('li');
          e.className = 'hist-empty';
          e.textContent = 'This match could not be loaded.';
          log.appendChild(e);
        }
        return;
      }
      renderMatch(res.data);
    });
  }

  /* ---------------------------------------------------------
     the modal
     --------------------------------------------------------- */
  function show(on) {
    var m = $('hist-modal');
    if (!m) return;
    open = !!on;
    m.hidden = !on;
    if (on) {
      showList();
      load();
    }
  }

  function init() {
    var btn = $('acct-history');
    if (btn) {
      btn.addEventListener('click', function () {
        var menu = $('acct-menu');
        if (menu) menu.hidden = true;
        show(true);
      });
    }
    var close = $('hist-close');
    if (close) close.addEventListener('click', function () { show(false); });
    var scrim = $('hist-scrim');
    if (scrim) scrim.addEventListener('click', function () { show(false); });
    var back = $('hist-back');
    if (back) back.addEventListener('click', function () { showList(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) show(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.EOL.history = { show: show, open: openMatch, reload: load };
})();
