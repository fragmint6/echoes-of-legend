/* =============================================================
   THE QUEST BOARD - home screen panel
   -------------------------------------------------------------
   Renders EOL.quests onto the floating right-hand panel. Pure view
   plus claim clicks; every rule lives in js/quests.js.

   Collapse state persists (eol.quests.collapsed). The board folds
   itself under 1100px because .home is overflow:hidden and the
   centred 700px .home-inner starts competing for width there - but a
   deliberate user choice is never overridden by the viewport.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var COLLAPSE_KEY = 'eol.quests.collapsed';
  /* WHERE THE BOARD STOPS FITTING.
     The panel is 330px wide at right:22, so it occupies the last
     352px. .home-inner is a CENTRED 700px column, so its right edge
     sits at (W + 700) / 2. They touch when

        W - 352  =  (W + 700) / 2   ->   W = 1404

     Rounded up to 1440 for breathing room, which is also a standard
     laptop width. Below that the board folds to its tab rather than
     sitting on top of the Play button.

     Measured against the LOGICAL viewport, not the device one: GUI
     scale is real browser zoom, so at 110% a 1440px screen is a
     1309px layout and must fold. */
  var NARROW = 1440;
  var seg = 'daily';
  var timer = null;
  var userChose = false;

  function $(id) {
    return document.getElementById(id);
  }
  function Q() {
    return window.EOL.quests;
  }

  function readCollapsed() {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  function writeCollapsed(v) {
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch (e) {
      /* private mode: the session still remembers, it just forgets on reload */
    }
  }

  function setCollapsed(v, remember) {
    var board = $('quest-board');
    if (!board) return;
    board.dataset.collapsed = v ? 'true' : 'false';
    var tab = $('qb-tab');
    if (tab) tab.setAttribute('aria-expanded', v ? 'false' : 'true');
    if (remember) {
      userChose = true;
      writeCollapsed(v);
    }
  }

  /* countdown to the next reset, in a shape a person reads at a glance */
  function humanGap(ms) {
    if (!ms || ms < 0) return '';
    var mins = Math.floor(ms / 60000);
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function questRow(q) {
    var pct = Math.max(0, Math.min(100, (q.progress / q.target) * 100));
    var esc = window.EOL.ui && window.EOL.ui.esc ? window.EOL.ui.esc : function (x) {
      return x;
    };
    var state = q.claimed ? 'claimed' : q.done ? 'ready' : 'open';
    return (
      '<li class="qb-item" data-state="' +
      state +
      '" data-id="' +
      esc(q.id) +
      '">' +
      '<span class="qb-ico"><i data-icon-domain="game" class="ra ' +
      esc(q.icon) +
      '"></i></span>' +
      '<div class="qb-main">' +
      '<p class="qb-text">' +
      esc(q.text) +
      '</p>' +
      '<div class="qb-bar"><span style="width:' +
      pct.toFixed(1) +
      '%"></span></div>' +
      '<p class="qb-prog">' +
      q.progress.toLocaleString() +
      ' / ' +
      q.target.toLocaleString() +
      '</p>' +
      '</div>' +
      (q.claimed
        ? '<span class="qb-done" title="Claimed"><i class="ri-check-double-line"></i></span>'
        : q.done
          ? '<button type="button" class="qb-claim" data-claim="' +
            esc(q.id) +
            '"><i class="ri-coin-fill"></i>' +
            q.reward +
            '</button>'
          : '<span class="qb-reward"><i class="ri-coin-fill"></i>' + q.reward + '</span>') +
      '</li>'
    );
  }

  function paint() {
    var board = $('quest-board');
    if (!board || !Q()) return;
    var b = Q().board();
    var list = seg === 'daily' ? b.daily : b.weekly;
    var host = $('qb-list');
    if (host) {
      host.innerHTML = '<ul class="qb-items">' + list.map(questRow).join('') + '</ul>';
    }

    /* the completion bonus, shown only once it is reachable */
    var bonus = seg === 'daily' ? b.dailyBonus : b.weeklyBonus;
    var bEl = $('qb-bonus');
    if (bEl) {
      if (bonus.claimed) {
        bEl.hidden = false;
        bEl.innerHTML =
          '<span class="qb-bonus-done"><i class="ri-check-double-line"></i>' +
          (seg === 'daily' ? 'Daily' : 'Weekly') +
          ' bonus claimed</span>';
      } else if (bonus.ready) {
        bEl.hidden = false;
        bEl.innerHTML =
          '<button type="button" class="qb-bonus-btn" data-bonus="' +
          seg +
          '"><i class="ri-treasure-map-line"></i>' +
          'Claim ' +
          (seg === 'daily' ? 'daily' : 'weekly') +
          ' bonus <b><i class="ri-coin-fill"></i>' +
          bonus.reward +
          '</b></button>';
      } else {
        bEl.hidden = false;
        bEl.innerHTML =
          '<span class="qb-bonus-hint">Clear all three for <b><i class="ri-coin-fill"></i>' +
          bonus.reward +
          '</b></span>';
      }
    }

    /* reset countdown per tier */
    var dt = $('qb-timer-daily');
    if (dt) dt.textContent = humanGap(b.resetsAt);
    var wt = $('qb-timer-weekly');
    if (wt) {
      /* weekly resets on the next Monday 7am - approximate from the
         daily gap plus whole days remaining, which is exact enough
         for a label that only ever shows days and hours */
      var now = new Date();
      var wk = Q().weekKey();
      var days = 0;
      for (var i = 0; i < 8; i++) {
        var probe = new Date(now.getTime() + i * 86400000);
        if (Q().weekKey(probe) !== wk) {
          days = i - 1;
          break;
        }
      }
      wt.textContent = humanGap(b.resetsAt + Math.max(0, days) * 86400000);
    }

    var n = Q().claimable();
    var badge = $('qb-badge');
    if (badge) {
      badge.textContent = n;
      badge.hidden = n === 0;
    }
    board.classList.toggle('has-claim', n > 0);

    var segD = $('qb-seg-daily');
    var segW = $('qb-seg-weekly');
    if (segD) {
      segD.classList.toggle('sel', seg === 'daily');
      segD.setAttribute('aria-selected', seg === 'daily' ? 'true' : 'false');
    }
    if (segW) {
      segW.classList.toggle('sel', seg === 'weekly');
      segW.setAttribute('aria-selected', seg === 'weekly' ? 'true' : 'false');
    }
  }

  function toast(msg, icon) {
    if (window.EOL.ui && window.EOL.ui.toast) window.EOL.ui.toast(msg, icon);
  }

  function onClick(e) {
    var claim = e.target.closest ? e.target.closest('[data-claim]') : null;
    if (claim) {
      var r = Q().claim(claim.dataset.claim);
      if (r.ok) {
        toast('Quest complete - ' + r.coins + ' coins', 'ri-coin-fill');
        if (window.EOL.audio) window.EOL.audio.ui('confirm');
      }
      paint();
      return;
    }
    var bonus = e.target.closest ? e.target.closest('[data-bonus]') : null;
    if (bonus) {
      var rb = Q().claimBonus(bonus.dataset.bonus);
      if (rb.ok) {
        toast('All quests cleared - ' + rb.coins + ' coins', 'ri-treasure-map-line');
        if (window.EOL.audio) window.EOL.audio.ui('confirm');
      }
      paint();
    }
  }

  /* The width the LAYOUT sees. GUI scale sets documentElement.zoom,
     which shrinks the logical viewport, so innerWidth alone would
     claim there is room that the centred column has already taken. */
  function logicalWidth() {
    var f =
      window.EOL.scale && window.EOL.scale.factor ? window.EOL.scale.factor() : 1;
    return window.innerWidth / (f || 1);
  }

  function fitViewport() {
    /* A deliberate collapse/expand is never overridden by a resize. */
    if (userChose) return;
    setCollapsed(logicalWidth() < NARROW, false);
  }

  function init() {
    var board = $('quest-board');
    if (!board || !Q()) return;

    var stored = readCollapsed();
    if (stored) {
      userChose = true;
      setCollapsed(true, false);
    } else {
      setCollapsed(logicalWidth() < NARROW, false);
    }

    var tab = $('qb-tab');
    if (tab) {
      tab.addEventListener('click', function () {
        setCollapsed(board.dataset.collapsed !== 'true', true);
        if (window.EOL.audio) window.EOL.audio.ui('tap');
      });
    }
    var close = $('qb-close');
    if (close) {
      close.addEventListener('click', function () {
        setCollapsed(true, true);
        if (window.EOL.audio) window.EOL.audio.ui('tap');
      });
    }
    var sd = $('qb-seg-daily');
    if (sd)
      sd.addEventListener('click', function () {
        seg = 'daily';
        paint();
      });
    var sw = $('qb-seg-weekly');
    if (sw)
      sw.addEventListener('click', function () {
        seg = 'weekly';
        paint();
      });

    board.addEventListener('click', onClick);
    window.addEventListener('eol:quests', paint);
    window.addEventListener('resize', fitViewport);

    paint();
    /* Re-paint every minute so the countdown moves and a rollover
       while the menu is open is picked up without a reload. */
    if (timer) clearInterval(timer);
    timer = setInterval(paint, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.EOL.questBoard = { paint: paint, init: init };
})();
