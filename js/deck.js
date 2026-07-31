/* =============================================================
   Echoes of Legend — Deck Manager & Deck Editor
   -------------------------------------------------------------
   Decks are saved squads of TWELVE heroes (max 4 per role). They
   live in the Collection's Decks tab; the editor is this screen's
   re-skinned grid (intentionally identical to the Collection, plus
   the deck tray on top). Formation is no longer chosen here: at
   battle time the enemy bans 2 of your 12, then you pick and
   arrange your battle six in the Preparation phase.

   Storage: eol.decks.v1 -> [{ id, name, ids:[cardId x<=12], ts }]
   Migration: the legacy single squad (eol.deck.v1, 6 ids) imports
   as a prefilled, incomplete deck called "Legacy Squad".
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var STORAGE_KEY = 'eol.decks.v1';
  var LEGACY_KEY = 'eol.deck.v1';
  var DECK_SIZE = (window.EOL.deckRules && window.EOL.deckRules.DECK_SIZE) || 12;
  var MAX_PER_ROLE = (window.EOL.deckRules && window.EOL.deckRules.MAX_PER_ROLE) || 4;

  var decks = []; // [{id,name,ids,ts}]
  var editing = null; // deck object currently in the editor
  var stateFilter = { faction: 'all', rarity: 'all', role: 'all', q: '' };
  var BY_ID = null;
  var idSeq = 1;
  var hintTimer = null;

  function $(id) {
    return document.getElementById(id);
  }
  function esc(s) {
    return window.EOL.ui && window.EOL.ui.esc ? window.EOL.ui.esc(s) : String(s);
  }

  function roster() {
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        out.push({ card: c, faction: f });
      });
    });
    return out;
  }

  function byId() {
    if (!BY_ID) {
      BY_ID = {};
      roster().forEach(function (e) {
        BY_ID[e.card.id] = e;
      });
    }
    return BY_ID;
  }

  /* ---------------- persistence ---------------- */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    } catch (e) {
      /* private mode */
    }
  }

  /* One-time import of the legacy 6-hero squad. Prefills an
     incomplete deck the player can finish in the editor. */
  function migrate() {
    var raw;
    try {
      raw = localStorage.getItem(LEGACY_KEY);
    } catch (e) {
      return false;
    }
    if (!raw) return false;
    var ids;
    try {
      ids = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    if (!Array.isArray(ids) || !ids.length) return false;
    var dict = byId();
    var known = [];
    ids.forEach(function (id) {
      if (id && dict[id] && known.indexOf(id) < 0) known.push(id);
    });
    if (!known.length) return false;
    decks.push({
      id: 'd' + idSeq++,
      name: 'Legacy Squad',
      ids: known.slice(0, DECK_SIZE),
      ts: Date.now(),
    });
    return true;
  }

  function load() {
    decks = [];
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return;
    }
    if (!raw) {
      if (migrate()) save(); // first boot after the 12-card change
      return;
    }
    var arr;
    try {
      arr = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!Array.isArray(arr)) return;
    var dict = byId();
    arr.forEach(function (d) {
      if (!d || !Array.isArray(d.ids)) return;
      var seen = {},
        ids = [];
      d.ids.forEach(function (id) {
        if (id && dict[id] && !seen[id] && ids.length < DECK_SIZE) {
          seen[id] = true;
          ids.push(id);
        }
      });
      var deck = {
        id: d.id || 'd' + idSeq++,
        name: (d.name || '').trim() || 'Squad',
        ids: ids,
        ts: d.ts || Date.now(),
      };
      decks.push(deck);
      var n = parseInt(String(deck.id).slice(1), 10);
      if (!isNaN(n) && n >= idSeq) idSeq = n + 1;
    });
  }

  /* ---------------- deck api ---------------- */
  function list() {
    return decks.slice();
  }

  function get(id) {
    for (var i = 0; i < decks.length; i++) if (decks[i].id === id) return decks[i];
    return null;
  }

  function entriesOf(deck) {
    var dict = byId();
    return deck.ids
      .map(function (id) {
        return dict[id];
      })
      .filter(Boolean);
  }

  /* A deck is battle-ready exactly when the 12-card rule is satisfied. */
  function isComplete(deck) {
    return !!deck && window.EOL.deckRules.isLegal(entriesOf(deck));
  }

  function freshName() {
    var n = decks.length + 1,
      name;
    do {
      name = 'Squad ' + n++;
    } while (
      decks.some(function (d) {
        return d.name === name;
      })
    );
    return name;
  }

  function create(ids, name) {
    var deck = {
      id: 'd' + idSeq++,
      name: name || freshName(),
      ids: (ids || []).slice(0, DECK_SIZE),
      ts: Date.now(),
    };
    decks.push(deck);
    save();
    return deck;
  }

  function rename(id, name) {
    var d = get(id);
    if (!d) return;
    d.name = (name || '').trim() || d.name;
    d.ts = Date.now();
    save();
  }

  function removeDeck(id) {
    var i = decks.findIndex(function (d) {
      return d.id === id;
    });
    if (i < 0) return;
    decks.splice(i, 1);
    if (editing && editing.id === id) editing = null;
    save();
  }

  /* ---------------- editor state ---------------- */
  function count() {
    return editing ? editing.ids.length : 0;
  }
  function has(id) {
    return !!editing && editing.ids.indexOf(id) >= 0;
  }

  /* Flash a rule warning in the tray hint. */
  function hintWarn(msg) {
    var h = document.querySelector('.deck-hint');
    if (!h) return;
    if (!h.dataset.orig) h.dataset.orig = h.innerHTML;
    h.innerHTML = '<i class="ri-error-warning-line"></i> ' + esc(msg);
    h.classList.add('warn');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () {
      h.innerHTML = h.dataset.orig;
      h.classList.remove('warn');
    }, 2600);
  }

  function add(id) {
    if (!editing || !byId()[id] || has(id)) return false;
    if (count() >= DECK_SIZE) {
      hintWarn('Deck is full — remove a hero first.');
      return false;
    }
    var cand = byId()[id].card;
    if (window.EOL.deckRules.capBlocked(entriesOf(editing), cand)) {
      hintWarn(
        'Max ' +
          MAX_PER_ROLE +
          ' heroes per role — this deck already runs ' +
          MAX_PER_ROLE +
          ' ' +
          cand.role +
          's.'
      );
      return false;
    }
    editing.ids.push(id);
    editing.ts = Date.now();
    save();
    render();
    return true;
  }

  function removeCard(id) {
    if (!editing) return false;
    var i = editing.ids.indexOf(id);
    if (i < 0) return false;
    editing.ids.splice(i, 1);
    editing.ts = Date.now();
    save();
    render();
    return true;
  }

  function toggle(id) {
    return has(id) ? removeCard(id) : add(id);
  }

  function clear() {
    if (!editing || !count()) return;
    editing.ids = [];
    save();
    render();
  }

  function openEditor(id) {
    var d = id ? get(id) : null;
    if (!d) d = create();
    editing = d;
    var nameIn = $('deck-name');
    if (nameIn) nameIn.value = d.name;
    render();
    applyGridFilter();
    window.EOL.ui.show('deck');
  }

  function closeEditor() {
    editing = null;
    showTab('decks');
    window.EOL.ui.show('collection');
  }

  /* ---------------- collection tabs ---------------- */
  function showTab(which) {
    var heroes = which === 'heroes';
    var ch = $('ctab-heroes'),
      cd = $('ctab-decks');
    if (ch) {
      ch.classList.toggle('sel', heroes);
      ch.setAttribute('aria-selected', String(heroes));
    }
    if (cd) {
      cd.classList.toggle('sel', !heroes);
      cd.setAttribute('aria-selected', String(!heroes));
    }
    var ph = $('cpanel-heroes'),
      pd = $('cpanel-decks');
    if (ph) ph.hidden = !heroes;
    if (pd) pd.hidden = heroes;
    if (!heroes) renderManager();
  }

  /* ---------------- manager rendering ---------------- */
  function roleChips(deck) {
    var dict = byId(),
      cnt = {};
    deck.ids.forEach(function (id) {
      var r = dict[id].card.role;
      cnt[r] = (cnt[r] || 0) + 1;
    });
    var icons = window.EOL.ui.ROLE_ICON;
    return Object.keys(cnt)
      .sort()
      .map(function (r) {
        return (
          '<span class="dc-role"><i class="ra ' +
          (icons[r] || 'ra-player') +
          '"></i>' +
          cnt[r] +
          '</span>'
        );
      })
      .join('');
  }

  function renderManager() {
    var host = $('decks-list');
    if (!host) return;
    var dict = byId();
    host.innerHTML = '';
    $('decks-empty').classList.toggle('show', decks.length === 0);
    decks.forEach(function (d) {
      var el = document.createElement('article');
      el.className = 'deck-card' + (isComplete(d) ? '' : ' incomplete');
      var strip = d.ids
        .map(function (id) {
          var e = dict[id];
          return (
            '<span class="dc-pip rarity-' +
            e.card.rarity +
            '" title="' +
            esc(e.card.name) +
            '">' +
            '<i class="ra ' +
            e.card.icon +
            '"></i></span>'
          );
        })
        .join('');
      for (var i = d.ids.length; i < DECK_SIZE; i++) {
        strip += '<span class="dc-pip empty"><i class="ri-add-line"></i></span>';
      }
      el.innerHTML =
        '<div class="dc-head">' +
        '<span class="dc-name">' +
        esc(d.name) +
        '</span>' +
        '<span class="dc-count' +
        (isComplete(d) ? ' ok' : '') +
        '">' +
        d.ids.length +
        '/' +
        DECK_SIZE +
        (isComplete(d) ? ' <i class="ri-check-line"></i>' : '') +
        '</span>' +
        '</div>' +
        '<div class="dc-strip">' +
        strip +
        '</div>' +
        '<div class="dc-roles">' +
        roleChips(d) +
        '</div>' +
        '<div class="dc-actions">' +
        '<button class="btn btn-ghost btn-slim dc-edit"><i class="ri-edit-line"></i><span>Edit</span></button>' +
        '<button class="btn btn-ghost btn-slim dc-del"><i class="ri-delete-bin-line"></i><span>Delete</span></button>' +
        '</div>';
      el.querySelector('.dc-edit').addEventListener('click', function () {
        openEditor(d.id);
      });
      el.querySelector('.dc-del').addEventListener('click', function () {
        removeDeck(d.id);
        renderManager();
      });
      host.appendChild(el);
    });
  }

  /* ---------------- editor rendering ---------------- */
  function renderTray() {
    var host = $('deck-slots-12');
    if (!host) return;
    var dict = byId();
    host.innerHTML = '';
    for (var slot = 0; slot < DECK_SIZE; slot++) {
      var id = editing ? editing.ids[slot] : null;
      var cell = document.createElement('div');
      if (id) {
        var e = dict[id];
        cell.className = 'deck-slot filled rarity-' + e.card.rarity;
        cell.style.setProperty('--fc-primary', e.faction.colors.primary);
        cell.innerHTML =
          '<span class="ds-order">' +
          (slot + 1) +
          '</span>' +
          '<i class="ds-glyph ra ' +
          e.card.icon +
          '"></i>' +
          '<span class="ds-name">' +
          esc(e.card.name) +
          '</span>' +
          '<span class="ds-role"><i class="ra ' +
          (window.EOL.ui.ROLE_ICON[e.card.role] || 'ra-player') +
          '"></i>' +
          esc(e.card.role) +
          '</span>' +
          '<button class="ds-x" title="Remove ' +
          esc(e.card.name) +
          '" aria-label="Remove ' +
          esc(e.card.name) +
          '"><i class="ri-close-line"></i></button>';
        cell.addEventListener('click', function () {
          removeCard(id);
        });
      } else {
        cell.className = 'deck-slot empty';
        cell.innerHTML = '<span class="ds-num">' + (slot + 1) + '</span>';
      }
      host.appendChild(cell);
    }
  }

  function renderGridState() {
    var grid = $('deck-grid');
    if (!grid) return;
    var full = editing && count() >= DECK_SIZE;
    grid.querySelectorAll('.card').forEach(function (el) {
      var id = el.dataset.id;
      var idx = editing ? editing.ids.indexOf(id) : -1;
      var picked = idx >= 0;
      el.classList.toggle('in-deck', picked);
      el.classList.toggle('deck-full', !!full && !picked);
      var fab = el.querySelector('.deck-add');
      if (fab) {
        fab.innerHTML = '<i class="ri-' + (picked ? 'close' : 'add') + '-line"></i>';
        fab.title = picked ? 'Remove from deck' : 'Add to deck';
      }
      var badge = el.querySelector('.deck-badge');
      if (picked) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'deck-badge';
          el.appendChild(badge);
        }
        badge.textContent = idx + 1;
        badge.title = 'In this deck';
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function renderHeader() {
    var c = $('deck-count');
    if (c) c.textContent = count();
  }

  function render() {
    renderTray();
    renderGridState();
    renderHeader();
  }

  function applyGridFilter() {
    var grid = $('deck-grid');
    if (!grid) return;
    var any = 0;
    grid.querySelectorAll('.card').forEach(function (el) {
      var show =
        (stateFilter.faction === 'all' || el.dataset.faction === stateFilter.faction) &&
        (stateFilter.rarity === 'all' || el.dataset.rarity === stateFilter.rarity) &&
        (stateFilter.role === 'all' || el.dataset.role === stateFilter.role) &&
        (stateFilter.q === '' || el.dataset.name.indexOf(stateFilter.q) !== -1);
      el.style.display = show ? '' : 'none';
      if (show) any++;
    });
    var empty = $('deck-empty');
    if (empty) empty.classList.toggle('show', any === 0);
  }

  /* ---------------- filters (identical to the collection) ---------------- */
  function buildDeckFilters() {
    var host = $('deck-filters');
    if (!host) return;

    var factionOpts = [{ value: 'all', text: 'All Factions', icon: 'ri-stack-line' }];
    (window.EOL.factions || []).forEach(function (f) {
      factionOpts.push({ value: f.id, text: f.name, icon: 'ra ' + f.icon });
    });

    var rarityOpts = [
      { value: 'all', text: 'All Rarities', icon: 'ri-sparkling-line' },
      { value: 'legendary', text: 'Legendary' },
      { value: 'epic', text: 'Epic' },
      { value: 'rare', text: 'Rare' },
      { value: 'common', text: 'Common' },
    ];

    var roleOpts = [{ value: 'all', text: 'All Roles', icon: 'ri-team-line' }];
    ['Tank', 'Bruiser', 'Caster', 'Controller', 'Medic', 'Sniper'].forEach(function (r) {
      roleOpts.push({
        value: r,
        text: r,
        icon: 'ra ' + (window.EOL.ui.ROLE_ICON[r] || 'ra-player'),
      });
    });

    window.EOL.ui.buildDropdown(host, 'Faction', factionOpts, function (v) {
      stateFilter.faction = v;
      applyGridFilter();
    });
    window.EOL.ui.buildDropdown(host, 'Rarity', rarityOpts, function (v) {
      stateFilter.rarity = v;
      applyGridFilter();
    });
    window.EOL.ui.buildDropdown(host, 'Role', roleOpts, function (v) {
      stateFilter.role = v;
      applyGridFilter();
    });

    var s = $('deck-search');
    if (s) {
      s.addEventListener('input', function () {
        stateFilter.q = s.value.trim().toLowerCase();
        applyGridFilter();
      });
    }

    var reset = $('deck-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        stateFilter = { faction: 'all', rarity: 'all', role: 'all', q: '' };
        if (s) s.value = '';
        host.querySelectorAll('.dd').forEach(function (dd) {
          dd.classList.remove('is-filtered');
          var first = dd.querySelector('.dd-opt');
          if (first) first.click();
        });
        applyGridFilter();
      });
    }
  }

  /* ---------------- one-time build ---------------- */
  function buildGrid() {
    var grid = $('deck-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var sorted = roster()
      .slice()
      .sort(function (a, b) {
        return a.card.name.localeCompare(b.card.name, 'en', { sensitivity: 'base' });
      });
    sorted.forEach(function (e, i) {
      var el = window.EOL.ui.buildCard(e.card, e.faction, i);
      var fab = document.createElement('button');
      fab.className = 'deck-add';
      fab.type = 'button';
      fab.innerHTML = '<i class="ri-add-line"></i>';
      fab.setAttribute('aria-label', 'Add ' + e.card.name + ' to deck');
      el.appendChild(fab);
      fab.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggle(e.card.id);
      });
      el.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('.deck-add')) return;
        if (window.matchMedia('(hover: none)').matches) return; // tap = details
        toggle(e.card.id);
      });
      grid.appendChild(el);
    });
  }

  /* ---------------- boot ---------------- */
  function mount() {
    buildDeckFilters();
    buildGrid();
    load();
    render();

    var tabH = $('ctab-heroes'),
      tabD = $('ctab-decks');
    if (tabH)
      tabH.addEventListener('click', function () {
        showTab('heroes');
      });
    if (tabD)
      tabD.addEventListener('click', function () {
        showTab('decks');
      });

    var nw = $('btn-new-deck');
    if (nw)
      nw.addEventListener('click', function () {
        openEditor();
      });

    var clearBtn = $('btn-deck-clear');
    if (clearBtn) clearBtn.addEventListener('click', clear);
    var doneBtn = $('btn-deck-save');
    if (doneBtn) doneBtn.addEventListener('click', closeEditor);
    var backBtn = $('btn-deck-back');
    if (backBtn) backBtn.addEventListener('click', closeEditor);

    var nameIn = $('deck-name');
    if (nameIn) {
      nameIn.addEventListener('input', function () {
        if (editing) rename(editing.id, nameIn.value);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', mount);

  window.EOL.decks = {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_KEY: LEGACY_KEY,
    DECK_SIZE: DECK_SIZE,
    MAX_PER_ROLE: MAX_PER_ROLE,
    list: list,
    get: get,
    entriesOf: entriesOf,
    isComplete: isComplete,
    create: create,
    rename: rename,
    remove: removeDeck,
    openEditor: openEditor,
    closeEditor: closeEditor,
    showTab: showTab,
    add: add,
    removeCard: removeCard,
    toggle: toggle,
    clear: clear,
    count: count,
    has: has,
    editingId: function () {
      return editing ? editing.id : null;
    },
    editingIds: function () {
      return editing ? editing.ids.slice() : [];
    },
    refresh: render,
    reload: load,
    renderManager: renderManager,
  };
})();

