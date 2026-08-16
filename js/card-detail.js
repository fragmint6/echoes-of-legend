/* =============================================================
   THE CARD DETAIL DIALOG
   -------------------------------------------------------------
   Everything about one legend, on a surface big enough to hold it:
   the portrait, the lore, the exact numbers, the full Signature
   Skill text, and the upgrade controls.

   WHY THIS EXISTS (owner ruling 2026-08-16)

     The upgrade controls used to live inside the card's HOVER
     overlay. That conflated two different jobs. Reading a card is
     a glance; upgrading one is a decision - and putting the
     decision inside the glance meant the player had to hold a
     hover steady to press a button, the panel competed with the
     ability text for room, and a 240px-wide card had to carry four
     controls plus three stat bars plus prose.

     Now hover shows STATE (see upgradeBadges in js/app.js: level
     top-left, boosts top-right) and a click opens this, which is
     where anything you can CHANGE lives.

   WHAT IT IS NOT

     Not a second source of truth. Every number is read live from
     EOL.upgrades on each paint, and every mutation goes through
     the same levelUp/craft/setStat the old panel called. This file
     owns presentation and nothing else.

   REPAINTING

     Mutations repaint the dialog in place (so pips, costs and
     buttons stay honest) and ask js/app.js to repaint just the one
     card behind it, so the roster's badges agree without a grid
     rebuild that would lose scroll position.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var openId = null; // card id currently shown, null when closed
  var lastFocus = null; // what to give the keyboard back to on close

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return window.EOL.ui && window.EOL.ui.esc ? window.EOL.ui.esc(s) : String(s);
  }
  function rich(s) {
    return window.EOL.ui && window.EOL.ui.rich ? window.EOL.ui.rich(s) : String(s);
  }
  function U() {
    return window.EOL.upgrades;
  }

  function entryFor(id) {
    if (window.EOL.ui && window.EOL.ui.entryFor) return window.EOL.ui.entryFor(id);
    var found = null;
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (c.id === id) found = { card: c, faction: f };
      });
    });
    return found;
  }

  /* ---------------------------------------------------------
     the stat table
     -------------------------------------------------------------
     Base and upgraded, side by side. A player deciding where to
     spend a duplicate needs to see what the last one bought, not a
     single number they have to remember the old value of.
     --------------------------------------------------------- */
  function statTable(card) {
    var up = U();
    var s = up ? up.statsFor(card.id, card) : null;
    var lv = up ? up.levelOf(card.id) : 0;
    var rows = [
      { k: 'HP', icon: 'ra-health', base: card.stats.hp, now: s ? s.hp : card.stats.hp, c: '#ff5f7e' },
      {
        k: 'ATK',
        icon: 'ra-sword',
        base: card.stats.atk,
        now: s ? s.atk : card.stats.atk,
        c: '#ffb347',
      },
      {
        k: 'DEF',
        icon: 'ra-shield',
        base: card.stats.def,
        now: s ? s.def : card.stats.def,
        c: '#5fb2ff',
        pct: true,
      },
    ];
    return (
      '<div class="cd-stats">' +
      rows
        .map(function (r) {
          var moved = lv > 0 && r.now !== r.base;
          var fmt = function (v) {
            return r.pct ? v + '%' : Math.round(v).toLocaleString();
          };
          return (
            '<div class="cd-stat" style="--sc:' +
            r.c +
            '">' +
            '<i data-icon-domain="game" class="ra ' +
            r.icon +
            '"></i>' +
            '<span class="cd-stat-k">' +
            r.k +
            '</span>' +
            '<span class="cd-stat-v' +
            (moved ? ' up' : '') +
            '">' +
            fmt(r.now) +
            (moved
              ? '<span class="cd-stat-base">was ' + fmt(r.base) + '</span>'
              : '') +
            '</span>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  /* ---------------------------------------------------------
     THE UPGRADE PANEL
     -------------------------------------------------------------
     Levels 0..3, bought with duplicates (1 / 3 / 5), each granting
     a compounding +1.5% skill power AND +2% of one chosen stat.
     The stat is re-assignable for free outside a battle, so this
     shows three buttons rather than a one-time choice.

     Unowned legends get an explanation instead: shards deepen what
     you have, packs are what widen it.
     --------------------------------------------------------- */
  function upgradePanel(card) {
    var up = U();
    if (!up) return '';
    var econ = window.EOL.econ;
    if (econ && !econ.owns(card.id)) {
      return (
        '<div class="cd-up cd-up-locked">' +
        '<p class="up-note"><i class="ri-lock-line"></i> You do not own this legend yet. ' +
        'Packs in the Shop are the only way to add one to your collection.</p>' +
        '</div>'
      );
    }
    var lv = up.levelOf(card.id);
    var dupes = up.dupesOf(card.id);
    var maxed = lv >= up.MAX_LEVEL;
    var need = up.costOfNextLevel(card.id);
    var can = up.canLevel(card.id);
    var stat = up.statOf(card.id);
    var craft = up.craftCost(card.rarity);
    var shards = up.shards();

    var pips = '';
    for (var i = 1; i <= up.MAX_LEVEL; i++) {
      pips += '<span class="up-pip' + (i <= lv ? ' on' : '') + '"></span>';
    }

    var statBtns = ['atk', 'def', 'hp']
      .map(function (k) {
        return (
          '<button type="button" class="up-stat' +
          (stat === k && lv > 0 ? ' sel' : '') +
          '" data-up-stat="' +
          k +
          '" data-up-card="' +
          esc(card.id) +
          '"' +
          (lv > 0 ? '' : ' disabled') +
          '>' +
          k.toUpperCase() +
          '</button>'
        );
      })
      .join('');

    return (
      '<div class="cd-up">' +
      '<div class="up-head">' +
      '<span class="up-title"><i class="ri-sparkling-2-fill"></i>Upgrade</span>' +
      '<span class="up-pips">' +
      pips +
      '</span>' +
      '</div>' +
      (maxed
        ? '<p class="up-note up-maxed">Fully upgraded &mdash; further copies pay shards only</p>'
        : '<p class="up-note">' +
          /* Clamp the numerator: banked copies can exceed what the NEXT
             level costs (they are saved toward later levels too), and
             "9 / 1" reads like a bug. */
          Math.min(dupes, need) +
          ' / ' +
          need +
          ' copies toward level ' +
          (lv + 1) +
          (dupes > need ? ' <span class="up-bank">(' + dupes + ' banked)</span>' : '') +
          '</p>') +
      '<div class="up-stats">' +
      '<span class="up-stats-lbl">Boost</span>' +
      statBtns +
      '</div>' +
      (lv > 0
        ? '<p class="cd-up-worth">Each level adds <b>+2% ' +
          esc(stat.toUpperCase()) +
          '</b> and <b>+1.5% skill power</b>, compounding.</p>'
        : '<p class="cd-up-worth">A level adds <b>+2%</b> of a stat you choose and ' +
          '<b>+1.5% skill power</b>. The choice is free to change outside a battle.</p>') +
      '<div class="up-actions">' +
      (maxed
        ? ''
        : '<button type="button" class="up-btn up-level" data-up-level="' +
          esc(card.id) +
          '"' +
          (can ? '' : ' disabled') +
          '>Level up</button>' +
          '<button type="button" class="up-btn up-craft" data-up-craft="' +
          esc(card.id) +
          '"' +
          (shards >= craft ? '' : ' disabled') +
          ' title="Spend Echo Shards on a copy of this legend">' +
          '<i class="ri-sparkling-2-fill"></i>' +
          craft.toLocaleString() +
          '</button>') +
      '</div>' +
      '</div>'
    );
  }

  /* ---------------------------------------------------------
     the dialog body
     --------------------------------------------------------- */
  function render(id) {
    var entry = entryFor(id);
    if (!entry) return false;
    var card = entry.card;
    var faction = entry.faction;
    var host = $('cd-body');
    if (!host) return false;

    var UI = window.EOL.ui || {};
    var ROLE_ICON = UI.ROLE_ICON || {};
    var ELEMENT_ICON = UI.ELEMENT_ICON || {};
    var ELEMENT_COLOR = UI.ELEMENT_COLOR || {};
    var econ = window.EOL.econ;
    var owned = !econ || econ.owns(card.id);

    var art = card.art
      ? '<img src="' + esc(card.art) + '" alt="" draggable="false" />'
      : '<i data-icon-domain="game" class="ra ' + esc(card.icon) + '"></i>';

    var isActive = card.ability.type === 'Active';
    var cost =
      isActive && card.ability.cost != null
        ? '<span class="ab-cost"><i data-icon-domain="game" class="ra ra-lightning-bolt"></i>' +
          card.ability.cost +
          '</span>'
        : '';

    host.innerHTML =
      '<div class="cd-hero" data-rarity="' +
      esc(card.rarity) +
      '" style="--fc-primary:' +
      esc(faction.colors.primary) +
      ';--el:' +
      esc(ELEMENT_COLOR[card.element] || '#fff') +
      '">' +
      '<div class="cd-art' +
      (card.art ? ' has-art' : '') +
      (owned ? '' : ' locked') +
      '">' +
      art +
      '</div>' +
      '<div class="cd-ident">' +
      '<span class="cd-faction">' +
      esc(faction.name) +
      '</span>' +
      '<h2 class="cd-name">' +
      esc(card.name) +
      '</h2>' +
      '<div class="cd-tags">' +
      '<span class="cd-tag rar" data-rarity="' +
      esc(card.rarity) +
      '">' +
      esc(card.rarity) +
      '</span>' +
      '<span class="cd-tag"><i data-icon-domain="game" class="ra ' +
      esc(ROLE_ICON[card.role] || 'ra-player') +
      '"></i>' +
      esc(card.role) +
      '</span>' +
      '<span class="cd-tag el"><i data-icon-domain="game" class="ra ' +
      esc(ELEMENT_ICON[card.element] || 'ra-player') +
      '"></i>' +
      esc(card.element) +
      '</span>' +
      (owned ? '' : '<span class="cd-tag locked"><i class="ri-lock-line"></i>Not owned</span>') +
      '</div>' +
      '</div>' +
      '</div>' +
      /* THE LORE. Only rendered when the legend actually has some -
         an empty quote block is worse than no quote block. */
      (card.lore ? '<p class="cd-lore">' + esc(card.lore) + '</p>' : '') +
      statTable(card) +
      '<div class="cd-skill" style="--ab-c:' +
      (isActive ? 'var(--rar-1)' : '#7fe3c0') +
      '">' +
      '<div class="cd-skill-top">' +
      '<span class="ab-type">' +
      esc(card.ability.type) +
      '</span>' +
      cost +
      '</div>' +
      '<h3 class="cd-skill-name">' +
      esc(card.ability.name) +
      '</h3>' +
      '<p class="cd-skill-text">' +
      rich(card.ability.text) +
      '</p>' +
      (card.ability.note
        ? '<p class="cd-skill-note">' + rich(card.ability.note) + '</p>'
        : '') +
      '</div>' +
      upgradePanel(card);
    return true;
  }

  /* ---------------------------------------------------------
     open / close
     --------------------------------------------------------- */
  function open(id) {
    var modal = $('card-detail');
    if (!modal || !render(id)) return;
    openId = id;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.dataset.modal = '1';
    var close = $('cd-close');
    if (close) close.focus();
    if (window.EOL.audio) window.EOL.audio.ui('tap');
  }

  function close() {
    var modal = $('card-detail');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    openId = null;
    /* Only clear the modal flag if nothing else is holding it - the
       dialog can be opened from the deck builder, which has modals
       of its own. */
    if (!document.querySelector('.auth-modal:not([hidden]), .room-modal:not([hidden])')) {
      delete document.body.dataset.modal;
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  /* A mutation changed the card: repaint the dialog AND the one card
     behind it, so the badges on the roster agree immediately. */
  function refresh() {
    if (!openId) return;
    render(openId);
    if (window.EOL.ui && window.EOL.ui.repaintCard) window.EOL.ui.repaintCard(openId);
  }

  function toast(msg, icon) {
    if (window.EOL.ui && window.EOL.ui.toast) window.EOL.ui.toast(msg, icon);
  }

  /* ---------------------------------------------------------
     the upgrade controls
     -------------------------------------------------------------
     Delegated from the dialog body, which is re-rendered on every
     change - per-control listeners would go stale on the first
     click. Same three verbs the old in-card panel drove.
     --------------------------------------------------------- */
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var up = U();
    if (!up) return;

    var lvl = t.closest('[data-up-level]');
    if (lvl) {
      var id = lvl.dataset.upLevel;
      var r = up.levelUp(id, up.statOf(id));
      if (r.ok) {
        toast('Upgraded to level ' + r.lv, 'ri-sparkling-2-fill');
        if (window.EOL.audio) window.EOL.audio.ui('confirm');
      } else if (r.reason === 'dupes') {
        toast('Needs ' + r.cost + ' copies of this legend', 'ri-information-line');
      } else if (r.reason === 'inBattle') {
        toast('Upgrades cannot change during a battle', 'ri-lock-line');
      }
      refresh();
      return;
    }

    var craft = t.closest('[data-up-craft]');
    if (craft) {
      var cid = craft.dataset.upCraft;
      var cr = up.craft(cid);
      if (cr.ok) {
        toast('Copy crafted for ' + cr.cost + ' shards', 'ri-sparkling-2-fill');
        if (window.EOL.audio) window.EOL.audio.ui('confirm');
      } else if (cr.reason === 'shards') {
        toast('Not enough Echo Shards', 'ri-sparkling-2-fill');
      } else if (cr.reason === 'unowned') {
        /* Shards deepen legends you own; they never widen a
           collection. Packs remain the only way to obtain a card. */
        toast('Shards only buy copies of legends you own', 'ri-lock-line');
      }
      refresh();
      return;
    }

    var st = t.closest('[data-up-stat]');
    if (st) {
      var sid = st.dataset.upCard;
      var sr = up.setStat(sid, st.dataset.upStat);
      if (!sr.ok && sr.reason === 'inBattle') {
        toast('Boosts cannot change during a battle', 'ri-lock-line');
      } else if (sr.ok && window.EOL.audio) {
        window.EOL.audio.ui('tap');
      }
      refresh();
    }
  }

  function init() {
    var modal = $('card-detail');
    if (!modal) return;
    var body = $('cd-body');
    if (body) body.addEventListener('click', onClick);
    var closeBtn = $('cd-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var scrim = $('cd-scrim');
    if (scrim) scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
    /* A pack or a campaign grant can change ownership while the
       dialog is open - repaint rather than showing a stale lock. */
    document.addEventListener('eol:owned', function () {
      if (openId) render(openId);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.EOL.cardDetail = {
    open: open,
    close: close,
    init: init,
    isOpen: function () {
      return !!openId;
    },
    /* test hook */
    _openId: function () {
      return openId;
    },
  };
})();
