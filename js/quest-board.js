/* =============================================================
   THE QUEST BOARD - home screen panel
   -------------------------------------------------------------
   Renders EOL.quests onto the floating right-hand panel. Pure view
   plus claim clicks; every rule lives in js/quests.js.

   THE BOARD IS NOT CLOSABLE (owner ruling 2026-08-16). There is no
   close button and no collapse toggle: a board you can dismiss is a
   board a returning player never sees again, which is the entire
   reason it exists. What used to be a collapse is now a pure LAYOUT
   decision, made for the player rather than by them:

     free     >= 1440px logical - the panel floats in the right
              margin and the menu column stays centred
     reserve  >= 980px  - the panel would collide with the centred
              700px .home-inner, so the menu reserves room for it
              (body[data-qb='reserve']) and shifts left instead of
              being covered
     stack    below that there is no margin to float in, so the home
              view becomes a scrolling column and the board sits in
              flow underneath the menu buttons

   Measured against the LOGICAL viewport, not the device one: GUI
   scale is real browser zoom, so at 110% a 1440px screen is a 1309px
   layout and must reserve.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  /* WHERE THE BOARD STOPS FITTING.
     The panel is 330px wide at right:22, so it occupies the last
     352px. .home-inner is a CENTRED 700px column, so its right edge
     sits at (W + 700) / 2. They touch when

        W - 352  =  (W + 700) / 2   ->   W = 1404

     Rounded up to 1440 for breathing room, which is also a standard
     laptop width. */
  var FLOAT_MIN = 1440;
  /* Below this the reserved layout leaves the menu column too narrow
     to read, so the board stacks under it instead. */
  var STACK_MAX = 980;
  var seg = 'daily';
  var timer = null;

  function $(id) {
    return document.getElementById(id);
  }
  function Q() {
    return window.EOL.quests;
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

  function esc(x) {
    return window.EOL.ui && window.EOL.ui.esc ? window.EOL.ui.esc(x) : x;
  }

  function questRow(q) {
    var pct = Math.max(0, Math.min(100, (q.progress / q.target) * 100));
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

    /* SIGNED OUT: the board explains itself instead of dangling
       objectives nobody may claim. Progress is hidden, never wiped -
       signing back in on this browser finds the week as it was. */
    var open = Q().available();
    board.dataset.locked = open ? 'false' : 'true';
    var lock = $('qb-lock');
    if (lock) lock.hidden = open;
    var tabs = $('qb-tabs');
    if (tabs) tabs.hidden = !open;
    var listHost = $('qb-list');
    var bonusHost = $('qb-bonus');
    if (!open) {
      if (listHost) listHost.innerHTML = '';
      if (bonusHost) bonusHost.hidden = true;
      board.classList.remove('has-claim');
      return;
    }
    if (listHost) listHost.hidden = false;

    var b = Q().board();
    var list = seg === 'daily' ? b.daily : b.weekly;
    var host = $('qb-list');
    if (host) {
      host.innerHTML = '<ul class="qb-items">' + list.map(questRow).join('') + '</ul>';
    }

    /* the completion bonus - it scales with the board it sits under,
       so the label always quotes the live number */
    var bonus = seg === 'daily' ? b.dailyBonus : b.weeklyBonus;
    var bEl = $('qb-bonus');
    if (bEl) {
      bEl.hidden = false;
      if (bonus.claimed) {
        bEl.innerHTML =
          '<span class="qb-bonus-done"><i class="ri-check-double-line"></i>' +
          (seg === 'daily' ? 'Daily' : 'Weekly') +
          ' bonus claimed</span>';
      } else if (bonus.ready) {
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
        bEl.innerHTML =
          '<span class="qb-bonus-hint">Clear all ' +
          list.length +
          ' for <b><i class="ri-coin-fill"></i>' +
          bonus.reward +
          '</b></span>';
      }
    }

    /* reset countdowns, both computed rather than approximated */
    var dt = $('qb-timer-daily');
    if (dt) dt.textContent = humanGap(b.resetsAt);
    var wt = $('qb-timer-weekly');
    if (wt) wt.textContent = humanGap(b.weekResetsAt);

    board.classList.toggle('has-claim', Q().claimable() > 0);

    /* "2/10" on the tab: a weekly tier is a week's worth of work, so
       the segment has to show how much of it is already banked. */
    var counts = {
      daily: b.dailyClaimed + '/' + b.daily.length,
      weekly: b.weeklyClaimed + '/' + b.weekly.length,
    };
    [
      ['daily', $('qb-seg-daily'), $('qb-count-daily')],
      ['weekly', $('qb-seg-weekly'), $('qb-count-weekly')],
    ].forEach(function (row) {
      var name = row[0],
        btn = row[1],
        cnt = row[2];
      if (btn) {
        btn.classList.toggle('sel', seg === name);
        btn.setAttribute('aria-selected', seg === name ? 'true' : 'false');
      }
      if (cnt) cnt.textContent = counts[name];
    });
  }

  function toast(msg, icon) {
    if (window.EOL.ui && window.EOL.ui.toast) window.EOL.ui.toast(msg, icon);
  }

  function onClick(e) {
    /* The signed-out panel's only control: hand the player to the
       same account dialog the profile pill opens. */
    var signIn = e.target.closest ? e.target.closest('[data-qb-signin]') : null;
    if (signIn) {
      if (window.EOL.account && window.EOL.account.open) window.EOL.account.open();
      if (window.EOL.audio) window.EOL.audio.ui('tap');
      return;
    }
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
        toast('Every quest cleared - ' + rb.coins + ' coins', 'ri-treasure-map-line');
        if (window.EOL.audio) window.EOL.audio.ui('confirm');
      }
      paint();
    }
  }

  /* The width the LAYOUT sees. GUI scale sets documentElement.zoom,
     which shrinks the logical viewport, so innerWidth alone would
     claim there is room that the centred column has already taken. */
  function logicalWidth() {
    var f = window.EOL.scale && window.EOL.scale.factor ? window.EOL.scale.factor() : 1;
    return window.innerWidth / (f || 1);
  }

  /* The board is never hidden - only placed. */
  function fitViewport() {
    var w = logicalWidth();
    var mode = w >= FLOAT_MIN ? 'free' : w >= STACK_MAX ? 'reserve' : 'stack';
    if (document.body.dataset.qb !== mode) document.body.dataset.qb = mode;
  }

  function init() {
    var board = $('quest-board');
    if (!board || !Q()) return;

    fitViewport();

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
    /* Signing in or out flips the whole panel between the objectives
       and the sign-in prompt, so the board has to follow auth. */
    if (window.EOL.auth && window.EOL.auth.onChange) window.EOL.auth.onChange(paint);

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

  window.EOL.questBoard = { paint: paint, init: init, fit: fitViewport };
})();
