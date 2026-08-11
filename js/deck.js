/* =============================================================
   Echoes of Legend - Deck Manager & Deck Editor
   -------------------------------------------------------------
   Decks are saved squads of TWELVE heroes (max 4 per role, max 2
   Legendaries). They
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
  /* The Chapter 1 player begins with a real legal Grimmwood deck. This
     marker prevents a deleted starter from respawning on every boot while
     still granting it once to existing local collections. */
  var GRIMMWOOD_STARTER_KEY = 'eol.grimmwood-starter.v1';
  var GRIMMWOOD_STARTER_ID = 'starter-grimmwood';
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
  function save(touched) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    } catch (e) {
      /* private mode */
    }
    /* Cloud sync is THE VAULT's job (js/cloud.js): its dirty-check
       loop picks up eol.decks.v1 like every other key. The old
       per-deck pushDeck() hook - and the dead `decks` table behind
       it - are gone (backend cleanup 2026-08-10). */
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

  /* ---------------- Chapter 1 starter deck ---------------- */
  function grimmwoodStarterIds() {
    var faction = (window.EOL.factions || []).filter(function (f) {
      return f.id === 'grimmwood';
    })[0];
    if (!faction || !Array.isArray(faction.cards)) return [];
    return faction.cards.map(function (card) {
      return card.id;
    });
  }

  function sameIds(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function starterAlreadyPresent(ids) {
    return decks.some(function (deck) {
      return (
        deck.id === GRIMMWOOD_STARTER_ID || (deck.name === 'Grimmwood' && sameIds(deck.ids, ids))
      );
    });
  }

  function starterClaimed() {
    try {
      return localStorage.getItem(GRIMMWOOD_STARTER_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markStarterClaimed() {
    try {
      localStorage.setItem(GRIMMWOOD_STARTER_KEY, '1');
    } catch (e) {
      /* private mode: this session still owns the deck */
    }
  }

  /* Seed once on the first load that sees this campaign-era build. The
     Grimmwood faction contains exactly twelve cards and its 2-per-role
     spread is legal under the normal 12-card / max-4 deck law. */
  function seedGrimmwoodStarter() {
    var ids = grimmwoodStarterIds();
    if (ids.length !== DECK_SIZE || starterAlreadyPresent(ids) || starterClaimed()) return null;
    var entries = ids
      .map(function (id) {
        return byId()[id];
      })
      .filter(Boolean);
    if (!window.EOL.deckRules || !window.EOL.deckRules.isLegal(entries)) return null;
    var deck = {
      id: GRIMMWOOD_STARTER_ID,
      name: 'Grimmwood',
      ids: ids,
      ts: Date.now(),
    };
    decks.unshift(deck);
    markStarterClaimed();
    return deck;
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
      var migrated = migrate(); // first boot after the 12-card change
      var starter = seedGrimmwoodStarter();
      if (migrated || starter) save(starter);
      return;
    }
    var arr;
    try {
      arr = JSON.parse(raw);
    } catch (e) {
      var recoveredStarter = seedGrimmwoodStarter();
      if (recoveredStarter) save(recoveredStarter);
      return;
    }
    if (!Array.isArray(arr)) {
      var invalidStarter = seedGrimmwoodStarter();
      if (invalidStarter) save(invalidStarter);
      return;
    }
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
    var starter = seedGrimmwoodStarter();
    if (starter) save(starter);
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
    /* the starter twelve is the Road's copy - it cannot be deleted
       (owner ruling 2026-08-10) */
    if (id === GRIMMWOOD_STARTER_ID) return;
    var i = decks.findIndex(function (d) {
      return d.id === id;
    });
    if (i < 0) return;
    decks.splice(i, 1);
    if (editing && editing.id === id) editing = null;
    save(); /* the vault syncs the whole deck list - nothing per-deck */
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
    /* THE ECONOMY: a deck holds only what you OWN. Drafts stay
       whole-roster by design; construction does not. */
    if (window.EOL.econ && !window.EOL.econ.owns(id)) {
      hintWarn('Not in your collection yet - the Shop and the Road pay in legends.');
      return false;
    }
    if (count() >= DECK_SIZE) {
      hintWarn('Deck is full - remove a legend first.');
      return false;
    }
    var cand = byId()[id].card;
    var currentEntries = entriesOf(editing);
    if (window.EOL.deckRules.legendaryCapBlocked(currentEntries, cand)) {
      hintWarn(
        'Max ' +
          window.EOL.deckRules.MAX_LEGENDARIES +
          ' Legendaries in Classic and Unabridged decks.'
      );
      return false;
    }
    if (window.EOL.deckRules.capBlocked(currentEntries, cand)) {
      hintWarn(
        'Max ' +
          MAX_PER_ROLE +
          ' legends per role - this deck already runs ' +
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
    /* the starter twelve is not editable - build your own from it */
    if (id === GRIMMWOOD_STARTER_ID) return;
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
    window.EOL.ui.show('collection', { isBack: true });
  }

  /* ---------------- collection tabs ---------------- */
  /* The tab bar is a segmented control: a gold thumb slides under the
     active tab (same language as the play screen's arena segment),
     and the two panels trade places with a directional slide. Both
     are presentation-only wrappers around the class/hidden flips. */
  function moveColThumb() {
    var bar = document.querySelector('.col-tabs');
    if (!bar) return;
    var selBtn = bar.querySelector('.col-tab.sel');
    if (!selBtn) return;
    var z =
      window.EOL && window.EOL.scale && window.EOL.scale.factor ? window.EOL.scale.factor() : 1;
    var b = bar.getBoundingClientRect();
    var t = selBtn.getBoundingClientRect();
    if (!t.width) return; // view hidden - measure on next show
    bar.style.setProperty('--thumb-x', Math.round((t.left - b.left) / z) + 'px');
    bar.style.setProperty('--thumb-w', Math.round(t.width / z) + 'px');
    bar.dataset.measured = '1';
  }
  var colAnimT = 0;
  function showTab(which) {
    var heroes = which === 'heroes';
    var ch = $('ctab-heroes'),
      cd = $('ctab-decks');
    var wasHeroes = ch && ch.classList.contains('sel');
    if (ch) {
      ch.classList.toggle('sel', heroes);
      ch.setAttribute('aria-selected', String(heroes));
    }
    if (cd) {
      cd.classList.toggle('sel', !heroes);
      cd.setAttribute('aria-selected', String(!heroes));
    }
    moveColThumb();
    var ph = $('cpanel-heroes'),
      pd = $('cpanel-decks');
    if (!ph || !pd) return;
    if (!heroes) renderManager();
    /* Directional panel swap: the outgoing view slides out the way the
       thumb travels, the incoming one rises in from the far side.
       gfx-low (and the initial paint) swap instantly. */
    var showEl = heroes ? ph : pd,
      hideEl = heroes ? pd : ph,
      dir = heroes ? '-r' : '';
    clearTimeout(colAnimT);
    ph.classList.remove('mg-out', 'mg-out-r', 'mg-in', 'mg-in-r');
    pd.classList.remove('mg-out', 'mg-out-r', 'mg-in', 'mg-in-r');
    if (document.body.dataset.gfx === 'low' || hideEl.hidden || wasHeroes === heroes) {
      hideEl.hidden = true;
      showEl.hidden = false;
      return;
    }
    hideEl.classList.add('mg-out' + dir);
    colAnimT = setTimeout(function () {
      hideEl.hidden = true;
      hideEl.classList.remove('mg-out' + dir);
      showEl.hidden = false;
      showEl.classList.add('mg-in' + dir);
      colAnimT = setTimeout(function () {
        showEl.classList.remove('mg-in' + dir);
      }, 620);
    }, 185);
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
          '<span class="dc-role"><i data-icon-domain="game" class="ra ' +
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
            '<i data-icon-domain="game" class="ra ' +
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
        (d.id === GRIMMWOOD_STARTER_ID
          ? '<span class="dc-locked"><i class="ri-lock-2-line"></i><span>Starter - the Road\'s copy</span></span>'
          : '<button class="btn btn-ghost btn-slim dc-edit"><i class="ri-edit-line"></i><span>Edit</span></button>' +
            '<button class="btn btn-ghost btn-slim dc-del"><i class="ri-delete-bin-line"></i><span>Delete</span></button>') +
        '</div>';
      var edBtn = el.querySelector('.dc-edit');
      if (edBtn)
        edBtn.addEventListener('click', function () {
          openEditor(d.id);
        });
      var delBtn = el.querySelector('.dc-del');
      if (delBtn)
        delBtn.addEventListener('click', function () {
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
    /* Slotkey diffing, same fix as the prep field tray: only a slot
       whose occupant actually changed gets a new node, so adding or
       removing one card never replays slot-in on the other eleven. */
    for (var slot = 0; slot < DECK_SIZE; slot++) {
      var id = editing ? editing.ids[slot] : null;
      var key = id ? id : 'empty-' + slot;
      var cell = host.children[slot];
      if (cell && cell.dataset.slotkey === key) continue;
      var fresh = document.createElement('div');
      fresh.dataset.slotkey = key;
      if (id) {
        var e = dict[id];
        fresh.className = 'deck-slot filled rarity-' + e.card.rarity;
        fresh.style.setProperty('--fc-primary', e.faction.colors.primary);
        fresh.innerHTML =
          '<span class="ds-order">' +
          (slot + 1) +
          '</span>' +
          '<i data-icon-domain="game" class="ds-glyph ra ' +
          e.card.icon +
          '"></i>' +
          '<span class="ds-name">' +
          esc(e.card.name) +
          '</span>' +
          '<span class="ds-role"><i data-icon-domain="game" class="ra ' +
          (window.EOL.ui.ROLE_ICON[e.card.role] || 'ra-player') +
          '"></i>' +
          esc(e.card.role) +
          '</span>';
        fresh.title = 'Click to remove ' + e.card.name;
        /* Rebuilt because a removal shifted the row, not because this
           hero was just added: no second entrance animation. */
        if (cell && !cell.dataset.slotkey.match(/^empty-/)) fresh.classList.add('no-enter');
        (function (cardId) {
          fresh.addEventListener('click', function () {
            removeCard(cardId);
          });
        })(id);
      } else {
        fresh.className = 'deck-slot empty';
        fresh.innerHTML = '<span class="ds-num">' + (slot + 1) + '</span>';
      }
      if (cell) host.replaceChild(fresh, cell);
      else host.appendChild(fresh);
    }
    /* Shrink any single long word (Rumpelstiltskin) so it fits on one line
       rather than being split mid-word; multi-word names still wrap at
       spaces at full size. */
    requestAnimationFrame(fitDeckSlotNames);
  }

  var _dctx = null;
  function fitDeckSlotNames() {
    var nodes = document.querySelectorAll('.deck-slot .ds-name');
    if (!nodes.length) return;
    if (!_dctx) _dctx = document.createElement('canvas').getContext('2d');
    var ctx = _dctx;
    nodes.forEach(function (el) {
      var text = (el.textContent || '').trim();
      var avail = el.clientWidth;
      if (!text || !avail) return;
      if (el.dataset.fitFor === text && el.dataset.fitW === String(avail)) return;
      var cs = getComputedStyle(el);
      var family = cs.fontFamily,
        weight = cs.fontWeight;
      var words = text.split(/\s+/);
      var px = 11.5,
        MIN = 7;
      ctx.font = weight + ' ' + px + 'px ' + family;
      var widest = 0;
      words.forEach(function (w) {
        widest = Math.max(widest, ctx.measureText(w).width);
      });
      if (widest > avail) {
        px = Math.max(MIN, Math.floor(px * (avail / widest) * 20) / 20);
        ctx.font = weight + ' ' + px + 'px ' + family;
        var guard = 0;
        while (px > MIN && guard++ < 60) {
          var w2 = 0;
          words.forEach(function (w) {
            w2 = Math.max(w2, ctx.measureText(w).width);
          });
          if (w2 <= avail) break;
          px -= 0.25;
          ctx.font = weight + ' ' + px + 'px ' + family;
        }
      }
      el.style.fontSize = px + 'px';
      el.dataset.fitFor = text;
      el.dataset.fitW = String(avail);
    });
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
    /* Deck construction is an ownership task, so the usable part of the
       collection always comes first. Alphabetical order remains stable
       inside the owned and unowned halves. */
    var econ = window.EOL.econ;
    var sorted = roster()
      .slice()
      .sort(function (a, b) {
        if (econ) {
          var ownedDelta = (econ.owns(b.card.id) ? 1 : 0) - (econ.owns(a.card.id) ? 1 : 0);
          if (ownedDelta) return ownedDelta;
        }
        return a.card.name.localeCompare(b.card.name, 'en', { sensitivity: 'base' });
      });
    sorted.forEach(function (e, i) {
      var el = window.EOL.ui.buildCard(e.card, e.faction, i, { markUnowned: true });
      /* No +/x button. Clicking the card already adds or removes it, so
         the badge was a second control for the same action sitting on
         top of the art. */
      el.addEventListener('click', function () {
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
    /* A campaign reward or pack can change ownership without reloading
       the page. Rebuild so the newly owned card moves into the leading
       group immediately, while preserving the active filters and deck. */
    document.addEventListener('eol:owned', function () {
      buildGrid();
      render();
      applyGridFilter();
    });

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
    /* the thumb is measured - re-park it whenever widths can move:
       view shown (it starts display:none, widthless), window resize,
       and once the display face finishes loading. */
    document.addEventListener('eol:view', function (ev) {
      if (ev.detail === 'collection') requestAnimationFrame(moveColThumb);
    });
    window.addEventListener('resize', moveColThumb);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveColThumb);
    requestAnimationFrame(moveColThumb);

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

  /* Minimal surface for js/auth.js to merge cloud and local decks
     without reaching into this module's internals. */
  window.EOL.deckStore = {
    all: function () {
      return decks.slice();
    },
    replaceAll: function (next) {
      decks = next || [];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
      } catch (e) {
        /* private mode */
      }
      render();
    },
  };

  window.EOL.decks = {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_KEY: LEGACY_KEY,
    GRIMMWOOD_STARTER_KEY: GRIMMWOOD_STARTER_KEY,
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
    /* Campaign boot / browser regression hooks. */
    grimmwoodStarterIds: grimmwoodStarterIds,
    seedGrimmwoodStarter: seedGrimmwoodStarter,
    renderManager: renderManager,
  };
})();
