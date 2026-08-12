/* =============================================================
   Echoes of Legend - Frontend Renderer
   Display only. No battle/card logic yet.
   ============================================================= */
(function () {
  'use strict';

  var FACTIONS = (window.EOL && window.EOL.factions) || [];

  /* flatten every faction into one roster, sorted A→Z */
  var ROSTER = [];
  FACTIONS.forEach(function (f) {
    f.cards.forEach(function (c) {
      ROSTER.push({ card: c, faction: f });
    });
  });
  ROSTER.sort(function (a, b) {
    return a.card.name.localeCompare(b.card.name, 'en', { sensitivity: 'base' });
  });

  /* ---- lookup tables ---- (see battle.js for the element glyph law) */
  var ELEMENT_ICON = {
    Physical: 'ra-axe',
    Magic: 'ra-crystal-wand',
    Shadow: 'ra-moon-sun',
    Light: 'ra-sunbeams',
    Lightning: 'ra-lightning-bolt',
    Fire: 'ra-fire',
    Nature: 'ra-leaf',
  };
  var ELEMENT_COLOR = {
    Physical: 'var(--e-physical)',
    Magic: 'var(--e-magic)',
    Shadow: 'var(--e-shadow)',
    Light: 'var(--e-light)',
    Lightning: 'var(--e-lightning)',
    Fire: 'var(--e-fire)',
    Nature: 'var(--e-nature)',
  };
  var ROLE_ICON = {
    Tank: 'ra-shield',
    Bruiser: 'ra-battered-axe',
    Caster: 'ra-fairy-wand',
    Controller: 'ra-gears',
    Medic: 'ra-health',
    Sniper: 'ra-archery-target',
  };

  /* bar scaling maxima */
  /* Scale bars against the real roster maxima (plus head-room) instead
     of hard-coded ceilings - the old atk: 1150 meant almost every hero
     showed a full ATK bar. */
  var MAX = (function () {
    var hp = 0,
      atk = 0,
      def = 0;
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (c.stats.hp > hp) hp = c.stats.hp;
        if (c.stats.atk > atk) atk = c.stats.atk;
        if (c.stats.def > def) def = c.stats.def;
      });
    });
    return {
      hp: Math.round((hp || 7000) * 1.05),
      atk: Math.round((atk || 2000) * 1.05),
      def: Math.max(def || 30, 35),
    };
  })();

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // ability text may contain intentional <b> tags from the data files;
  // element names get colour-coded on the way out
  function rich(s) {
    return window.EOL.colorElements(String(s));
  }

  function statRow(icon, key, val, display, max, color) {
    var pct = Math.max(4, Math.min(100, (val / max) * 100));
    return (
      '<div class="stat-row" style="--sc:' +
      color +
      ';--pct:' +
      pct.toFixed(1) +
      '%">' +
      '<i data-icon-domain="game" class="stat-ico ra ' +
      icon +
      '"></i>' +
      '<span class="stat-key">' +
      key +
      '</span>' +
      '<span class="stat-bar"><span class="stat-fill"></span></span>' +
      '<span class="stat-val">' +
      display +
      '</span>' +
      '</div>'
    );
  }

  function buildCard(card, faction, index, options) {
    options = options || {};
    var el = document.createElement('article');
    el.className = 'card';
    /* Ownership is collection/deck-builder information, not a property of
       the card itself. Draft and pack surfaces deliberately opt out. */
    if (options.markUnowned && window.EOL.econ && !window.EOL.econ.owns(card.id)) {
      el.className += ' unowned';
    }
    el.dataset.rarity = card.rarity;
    el.dataset.faction = faction.id;
    el.dataset.role = card.role;
    el.dataset.element = card.element;
    el.dataset.name = card.name.toLowerCase();
    el.dataset.id = card.id;
    el.tabIndex = 0;
    el.style.setProperty('--fc-primary', faction.colors.primary);
    el.style.setProperty('--el', ELEMENT_COLOR[card.element] || '#fff');
    el.style.animationDelay = Math.min(index * 40, 700) + 'ms';

    var isActive = card.ability.type === 'Active';
    var abColor = isActive ? 'var(--rar-1)' : '#7fe3c0';

    var costTag =
      isActive && card.ability.cost != null
        ? '<span class="ab-cost"><i data-icon-domain="game" class="ra ra-lightning-bolt"></i>' +
          card.ability.cost +
          '</span>'
        : '';

    /* Portrait art, when the card has it, renders inside the element sigil
       ring and replaces the glyph. Cards without art keep the glyph, so the
       roster can be illustrated a faction at a time. */
    var artLayer = card.art
      ? '<div class="art-portrait"><img src="' +
        esc(card.art) +
        '" alt="" draggable="false" /></div>'
      : '<i data-icon-domain="game" class="art-glyph ra ' + card.icon + '"></i>';

    el.innerHTML =
      '<div class="card-art' +
      (card.art ? ' has-art' : '') +
      '">' +
      '<div class="art-ring"></div>' +
      artLayer +
      '</div>' +
      '<div class="card-vignette"></div>' +
      '<div class="card-sheen"></div>' +
      '<div class="card-frame"></div>' +
      '<span class="corner tl"></span><span class="corner tr"></span>' +
      '<span class="corner bl"></span><span class="corner br"></span>' +
      '<div class="card-top">' +
      '<span class="rarity-tag">' +
      esc(card.rarity) +
      '</span>' +
      '<span class="element-orb" title="' +
      esc(card.element) +
      '">' +
      '<i data-icon-domain="game" class="ra ' +
      (ELEMENT_ICON[card.element] || 'ra-player') +
      '"></i>' +
      '</span>' +
      '</div>' +
      '<div class="card-plate">' +
      '<div class="plate-role">' +
      '<i data-icon-domain="game" class="ra ' +
      (ROLE_ICON[card.role] || 'ra-player') +
      '"></i>' +
      esc(card.role) +
      '</div>' +
      '<h3 class="card-name">' +
      esc(card.name) +
      '</h3>' +
      '<div class="plate-hint"><i class="ri-cursor-line"></i><span class="hint-txt"></span></div>' +
      '</div>' +
      '<div class="card-overlay">' +
      '<div class="ov-head">' +
      '<h3 class="ov-name">' +
      esc(card.name) +
      '</h3>' +
      '<div class="ov-meta">' +
      esc(card.rarity) +
      '<span class="dot">&middot;</span>' +
      esc(card.role) +
      '<span class="dot">&middot;</span><span class="el">' +
      esc(card.element) +
      '</span>' +
      '</div>' +
      '</div>' +
      '<div class="stat-block">' +
      statRow('ra-health', 'HP', card.stats.hp, card.stats.hp.toLocaleString(), MAX.hp, '#ff5f7e') +
      statRow(
        'ra-sword',
        'ATK',
        card.stats.atk,
        card.stats.atk.toLocaleString(),
        MAX.atk,
        '#ffb347'
      ) +
      statRow('ra-shield', 'DEF', card.stats.def, card.stats.def + '%', MAX.def, '#5fb2ff') +
      '</div>' +
      '<div class="ability" style="--ab-c:' +
      abColor +
      '">' +
      '<div class="ab-top">' +
      '<span class="ab-type">' +
      esc(card.ability.type) +
      '</span>' +
      costTag +
      '</div>' +
      '<div class="ab-name">' +
      esc(card.ability.name) +
      '</div>' +
      '<div class="ab-text">' +
      rich(card.ability.text) +
      (card.ability.note ? '<div class="ab-note">' + rich(card.ability.note) + '</div>' : '') +
      '</div>' +
      '</div>' +
      '<div class="ov-foot">' +
      '<span class="role-pill"><i data-icon-domain="game" class="ra ' +
      (ROLE_ICON[card.role] || 'ra-player') +
      '"></i> ' +
      esc(card.role) +
      '</span>' +
      '<span>' +
      esc(faction.name) +
      '</span>' +
      '</div>' +
      '</div>';

    /* tap-to-toggle on touch devices */
    el.addEventListener('click', function () {
      if (window.matchMedia('(hover: none)').matches) {
        var open = el.classList.contains('is-open');
        document.querySelectorAll('.card.is-open').forEach(function (c) {
          c.classList.remove('is-open');
        });
        if (!open) el.classList.add('is-open');
      }
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.classList.toggle('is-open');
      }
    });

    return el;
  }

  /* Shared builders for the deck builder and the shop pack opening.
     Set at script-load time (before DOMContentLoaded), so every module
     can use them as soon as the DOM is ready. */
  window.EOL.ui = {
    buildCard: buildCard,
    esc: esc,
    rich: rich,
    /* the ONE status toast. NOT `toast: toast` - app.js has no local
       toast, so that bare identifier resolved to the <div id="toast">
       element through browser id-globals and every ui.toast() call
       was a TypeError waiting on a code path (found 2026-08-10; the
       real function lives in play.js and is delegated to lazily). */
    toast: function (msg, icon) {
      if (window.EOL.play && typeof window.EOL.play.toast === 'function')
        window.EOL.play.toast(msg, icon);
    },
    ROLE_ICON: ROLE_ICON,
    ELEMENT_ICON: ELEMENT_ICON,
    ELEMENT_COLOR: ELEMENT_COLOR,
    buildDropdown: buildDropdown,
    closeAllMenus: closeAllMenus,
    show: function (view, opts) {
      show(view, opts);
    },
    goBack: function () {
      goBack();
    },
  };

  /* ---------------- lazy rendering ----------------
     Cards are built in small batches; a sentinel at the bottom of the
     grid pulls in the next batch as it approaches the viewport, so the
     DOM only ever holds what the user has scrolled to. */
  var state = { faction: 'all', rarity: 'all', role: 'all', q: '' };
  var PAGE = 12; // cards per lazy batch
  var filtered = ROSTER.slice(); // entries matching the current filters
  var rendered = 0; // how many of `filtered` are in the DOM

  function matching() {
    var list = ROSTER.filter(function (entry) {
      var c = entry.card;
      return (
        (state.faction === 'all' || entry.faction.id === state.faction) &&
        (state.rarity === 'all' || c.rarity === state.rarity) &&
        (state.role === 'all' || c.role === state.role) &&
        (state.q === '' || c.name.toLowerCase().indexOf(state.q) !== -1)
      );
    });
    /* OWNED FIRST, always (owner ruling 2026-08-10): your legends
       lead, the locked ones trail. ROSTER is already A-Z and sort()
       is stable in every engine we serve, so each half stays
       alphabetical. */
    var econ = window.EOL.econ;
    if (econ) {
      list.sort(function (a, b) {
        return (econ.owns(b.card.id) ? 1 : 0) - (econ.owns(a.card.id) ? 1 : 0);
      });
    }
    return list;
  }

  /* the truth line under the Collection title: how many of the
     roster you actually OWN (it used to read '63 of 63 legends' at
     a fresh install - the filter count posing as a collection
     count) */
  function paintOwnedCount() {
    var el = document.getElementById('owned-count');
    if (el && window.EOL.econ) el.textContent = window.EOL.econ.ownedCount();
  }

  /* ownership changes at runtime (packs, gate grants): every painted
     card re-checks its lock without a rebuild, the owned count moves,
     and the owned-first order is recomputed for the NEXT paint (the
     grid is rebuilt on every visit to the Collection). */
  document.addEventListener('eol:owned', function () {
    if (!window.EOL.econ) return;
    document.querySelectorAll('.card[data-id]').forEach(function (el) {
      el.classList.toggle('unowned', !window.EOL.econ.owns(el.dataset.id));
    });
    filtered = matching();
    paintOwnedCount();
  });

  /* THE HOME WALLET: the main-menu coin chip beside the account pill.
     Painted at boot and on every eol:coins; clicking it opens the
     Shop (the only question a wallet raises is where to spend it). */
  function paintHomeCoins() {
    var el = document.getElementById('home-coins-val');
    if (el && window.EOL.econ) el.textContent = window.EOL.econ.coins().toLocaleString();
  }
  document.addEventListener('eol:coins', paintHomeCoins);

  function renderBatch() {
    var grid = document.getElementById('roster');
    if (!grid || rendered >= filtered.length) return;
    var end = Math.min(rendered + PAGE, filtered.length);
    for (var i = rendered; i < end; i++) {
      grid.appendChild(buildCard(filtered[i].card, filtered[i].faction, i, { markUnowned: true }));
    }
    rendered = end;
    var sent = document.getElementById('roster-sentinel');
    if (sent) sent.classList.toggle('done', rendered >= filtered.length);
  }

  /* ---------------- filtering ---------------- */
  function applyFilters() {
    filtered = matching();
    var grid = document.getElementById('roster');
    if (grid) grid.innerHTML = '';
    rendered = 0;

    var empty = document.getElementById('empty');
    if (empty) empty.classList.toggle('show', filtered.length === 0);
    var vis = document.getElementById('visible-count');
    if (vis) vis.textContent = filtered.length;

    /* First batch now; if it doesn't fill the viewport the sentinel is
       already on screen and the observer immediately pulls the next one. */
    renderBatch();
  }

  /* Re-arm the lazy loading every time the Collection is opened. The grid
     used to be filled once and kept forever, so a second visit found all
     57 cards already in the DOM and showed them in one heavy paint. Now
     each return starts from the first batch again: the sentinel observer
     is still watching and pulls the rest in as the user scrolls. Filter
     state is kept - only the DOM is rebuilt. */
  document.addEventListener('eol:view', function (e) {
    if (e.detail !== 'collection') return;
    var grid = document.getElementById('roster');
    if (!grid) return;
    rendered = 0;
    grid.innerHTML = '';
    paintOwnedCount();
    var sent = document.getElementById('roster-sentinel');
    if (sent) sent.classList.remove('done');
    renderBatch();
  });

  /* ---------------- custom dropdowns ---------------- */
  function closeAllMenus(except) {
    document.querySelectorAll('.dd.open').forEach(function (d) {
      if (d !== except) d.classList.remove('open');
    });
  }

  /* Build one dropdown.
     opts: [{value, label, icon}]  onPick: fn(value)

     RPG Awesome is permitted here only when an option itself is a game
     concept (faction, rarity, role). Mark those nodes so the icon audit
     can distinguish them from ordinary dropdown chrome. */
  function iconDomainAttr(icon) {
    return icon && /(^|\s)ra(\s|$)/.test(icon) ? ' data-icon-domain="game"' : '';
  }
  function buildDropdown(host, label, opts, onPick) {
    var dd = document.createElement('div');
    dd.className = 'dd';

    var btn = document.createElement('button');
    btn.className = 'dd-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');

    var menu = document.createElement('div');
    menu.className = 'dd-menu';
    menu.setAttribute('role', 'listbox');

    function paint(v) {
      var o =
        opts.filter(function (x) {
          return x.value === v;
        })[0] || opts[0];
      btn.innerHTML =
        '<span class="dd-label">' +
        label +
        '</span>' +
        '<span class="dd-value">' +
        (o.icon ? '<i' + iconDomainAttr(o.icon) + ' class="' + o.icon + '"></i>' : '') +
        esc(o.text) +
        '</span>' +
        '<i class="dd-caret ri-arrow-down-s-line"></i>';
      menu.querySelectorAll('.dd-opt').forEach(function (el) {
        el.classList.toggle('sel', el.dataset.value === v);
        el.setAttribute('aria-selected', el.dataset.value === v ? 'true' : 'false');
      });
      dd.classList.toggle('is-filtered', v !== 'all');
    }

    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'dd-opt';
      b.type = 'button';
      b.dataset.value = o.value;
      b.setAttribute('role', 'option');
      b.innerHTML =
        (o.icon
          ? '<i' + iconDomainAttr(o.icon) + ' class="' + o.icon + '"></i>'
          : '<i class="dd-blank"></i>') +
        '<span>' +
        esc(o.text) +
        '</span><i class="dd-check ri-check-line"></i>';
      b.addEventListener('click', function () {
        paint(o.value);
        dd.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        onPick(o.value);
      });
      menu.appendChild(b);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !dd.classList.contains('open');
      closeAllMenus(dd);
      dd.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });

    dd.appendChild(btn);
    dd.appendChild(menu);
    host.appendChild(dd);
    paint('all');
    return dd;
  }

  function buildFilters() {
    var host = document.getElementById('filters');
    if (!host) return;

    var factionOpts = [{ value: 'all', text: 'All Factions', icon: 'ri-stack-line' }];
    FACTIONS.forEach(function (f) {
      factionOpts.push({ value: f.id, text: f.name, icon: 'ra ' + f.icon });
    });

    var rarityOpts = [
      { value: 'all', text: 'All Rarities', icon: 'ri-sparkling-line' },
      /* each tier wears its crest in its own color (owner request
         2026-08-10) - classes scoped so faction crests that happen to
         share a glyph stay untinted */
      { value: 'legendary', text: 'Legendary', icon: 'ra ra-crown rar-legendary' },
      { value: 'epic', text: 'Epic', icon: 'ra ra-gem rar-epic' },
      { value: 'rare', text: 'Rare', icon: 'ra ra-diamond rar-rare' },
      { value: 'common', text: 'Common', icon: 'ra ra-circular-shield rar-common' },
    ];

    var roleOpts = [{ value: 'all', text: 'All Roles', icon: 'ri-team-line' }];
    ['Tank', 'Bruiser', 'Caster', 'Controller', 'Medic', 'Sniper'].forEach(function (r) {
      roleOpts.push({ value: r, text: r, icon: 'ra ' + ROLE_ICON[r] });
    });

    buildDropdown(host, 'Faction', factionOpts, function (v) {
      state.faction = v;
      applyFilters();
    });
    buildDropdown(host, 'Rarity', rarityOpts, function (v) {
      state.rarity = v;
      applyFilters();
    });
    buildDropdown(host, 'Role', roleOpts, function (v) {
      state.role = v;
      applyFilters();
    });

    document.addEventListener('click', function () {
      closeAllMenus(null);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllMenus(null);
    });

    var s = document.getElementById('search');
    if (s) {
      s.addEventListener('input', function () {
        state.q = s.value.trim().toLowerCase();
        applyFilters();
      });
    }

    var reset = document.getElementById('reset');
    if (reset) {
      reset.addEventListener('click', function () {
        state = { faction: 'all', rarity: 'all', role: 'all', q: '' };
        if (s) s.value = '';
        host.querySelectorAll('.dd').forEach(function (dd) {
          dd.classList.remove('is-filtered');
          var first = dd.querySelector('.dd-opt');
          if (first) first.click();
        });
        applyFilters();
      });
    }
  }

  /* ---------------- transition veil ----------------
     Full-page loading screen between views. It boots ON in the markup
     (covering first paint) and every show() re-covers the swap, then
     hides once the incoming view's <img> tags, CSS-background art and
     fonts have decoded - no more half-rendered screens catching up
     after the transition. Two bounds keep it honest: a MINIMUM so a
     fast cached swap doesn't strobe the spinner, and a hard MAXIMUM so
     a slow asset can never trap the player behind the veil. */
  var veil = document.getElementById('veil');
  var VEIL_MIN_MS = 720;
  var VEIL_MIN_LOW_MS = 280; // low-graphics users traded garnish for speed
  var VEIL_MAX_MS = 1800;

  /* Promises for every visible asset the incoming view needs: <img>
     tags that haven't completed, and the painted layers that load via
     CSS background-image (menu parallax, the battle board, the
     battlefield reveal card). Background fetches are re-warmed through
     Image() - cached hits resolve immediately. */
  function veilAssetWaits() {
    var waits = [];
    function track(src) {
      if (!src || waits.length > 60) return;
      waits.push(
        new Promise(function (res) {
          var im = new Image();
          im.onload = im.onerror = function () {
            res();
          };
          im.src = src;
        })
      );
    }
    var scopes = [];
    var view = document.querySelector('[data-view].active');
    if (view) scopes.push(view);
    /* the menu parallax lives at body level, outside the home section */
    if (document.body.dataset.view === 'home') {
      var mb = document.getElementById('menu-bg');
      if (mb) scopes.push(mb);
    }
    /* Chapter 1's four generated parallax planes also live beside the
       views, so include them when the route opens. This keeps the veil
       from lifting halfway through a cold image decode. */
    if (document.body.dataset.view === 'chapter') {
      var cb = document.getElementById('chapter-bg');
      if (cb) scopes.push(cb);
    }
    scopes.forEach(function (scope) {
      scope.querySelectorAll('img').forEach(function (im) {
        if (!im.complete) track(im.currentSrc || im.src);
      });
      scope
        .querySelectorAll(
          '.sc-art, .mb-base, .mb-sky, .mb-far, .mb-mid, .mb-near, .cb-base, .cb-sky, .cb-far, .cb-mid, .cb-near, .bf-art.has-art'
        )
        .forEach(function (el) {
          var bg = getComputedStyle(el).backgroundImage;
          if (!bg || bg === 'none') return;
          (bg.match(/url\(("|')?[^"')]+\1?\)/g) || []).forEach(function (u) {
            track(u.replace(/^url\(("|')?|("|')?\)$/g, ''));
          });
        });
    });
    return waits;
  }

  function veilSettle() {
    if (!veil || !veil.classList.contains('on')) return;
    var low = window.EOL.gfx && window.EOL.gfx.isLow();
    /* Two animation frames first: view modules apply their art (the
       board's --bf-art, freshly built card grids) synchronously AFTER
       show() flips the class, so the waits must be collected once that
       work has landed, not before it. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var waits = veilAssetWaits();
        if (document.fonts && document.fonts.ready) {
          waits.push(
            document.fonts.ready.then(
              function () {},
              function () {}
            )
          );
        }
        var min = new Promise(function (res) {
          setTimeout(res, low ? VEIL_MIN_LOW_MS : VEIL_MIN_MS);
        });
        var cap = new Promise(function (res) {
          setTimeout(res, VEIL_MAX_MS);
        });
        Promise.race([Promise.all([Promise.all(waits), min]), cap]).then(function () {
          veil.classList.remove('on');
        });
      });
    });
  }

  /* Absolute failsafe: if anything above ever threw, the boot veil must
     still lift - a stuck loading screen is the one bug a user cannot
     click past. */
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (veil) veil.classList.remove('on');
    }, 3200);
  });

  /* ---------------- view routing ---------------- */
  var PARENT_VIEW = {
    deck: 'collection',
    collection: 'home',
    rulebook: 'home',
    shop: 'home',
    play: 'home',
    campaign: 'play',
    chapter: 'campaign',
    prep: 'play',
    draft: 'play',
    battle: 'home',
  };

  var navHistory = [];
  var currentView = 'home';

  function show(view, opts) {
    opts = opts || {};
    var needsClose = veil && !veil.classList.contains('on');
    var doSwap = function () {
      hideTipDot();
      if (window.EOL.battle && window.EOL.battle.hideTip) window.EOL.battle.hideTip();

      if (!opts.isBack && currentView && currentView !== view) {
        var existingIndex = navHistory.indexOf(view);
        if (existingIndex >= 0) {
          navHistory = navHistory.slice(0, existingIndex);
        } else {
          navHistory.push(currentView);
          if (navHistory.length > 30) navHistory.shift();
        }
      }
      currentView = view;
      document.querySelectorAll('[data-view]').forEach(function (v) {
        v.classList.toggle('active', v.dataset.view === view);
      });
      document.body.dataset.view = view;
      if (view !== 'battle') {
        document.body.dataset.busy = '0';
        document.body.dataset.netwait = '0';
      }
      window.scrollTo(0, 0);
      document.dispatchEvent(new CustomEvent('eol:view', { detail: view }));
      veilSettle();
    };

    if (needsClose) {
      // gate close first, then swap behind it
      veil.classList.add('on');
      hideTipDot();
      if (window.EOL.battle && window.EOL.battle.hideTip) window.EOL.battle.hideTip();
      setTimeout(doSwap, 560);
    } else {
      if (veil) veil.classList.add('on');
      doSwap();
    }
  }

  function goBack() {
    hideTipDot();
    if (window.EOL.battle && window.EOL.battle.hideTip) window.EOL.battle.hideTip();
    var cur = currentView;
    if (cur === 'deck' && window.EOL.decks) {
      window.EOL.decks.closeEditor();
      return;
    }
    while (navHistory.length > 0 && navHistory[navHistory.length - 1] === cur) {
      navHistory.pop();
    }
    if (navHistory.length > 0) {
      var prev = navHistory.pop();
      show(prev, { isBack: true });
    } else {
      var fallback = PARENT_VIEW[cur] || 'home';
      show(fallback, { isBack: true });
    }
  }

  /* ---------------------------------------------------------
     HELPER TIP DOTS
     -------------------------------------------------------------
     Every .tipdot in the game is a 14px ? chip beside a control, and
     its data-tip holds the law of whatever it sits next to. ONE
     floating tooltip serves them all via delegation (the same pattern
     as the battle's status-chip pop): dots rendered later - modals,
     fight cards, JS-written titles - work with zero wiring. body
     [data-tips] hides the dots outright (Settings > Display), and the
     choice persists.
     --------------------------------------------------------- */
  var TIPS_KEY = 'eol.tips';
  var tipFloatEl = null;
  var tipOwner = null;

  function tipsEnabled() {
    try {
      return localStorage.getItem(TIPS_KEY) !== 'off';
    } catch (e) {
      return true;
    }
  }
  function hideTipDot() {
    if (tipHoverTimer) {
      clearTimeout(tipHoverTimer);
      tipHoverTimer = null;
    }
    if (tipFloatEl) tipFloatEl.classList.remove('show');
    tipOwner = null;
  }
  function applyTips(on) {
    document.body.dataset.tips = on ? 'on' : 'off';
    try {
      localStorage.setItem(TIPS_KEY, on ? 'on' : 'off');
    } catch (e) {
      /* private mode */
    }
    document.querySelectorAll('.tips-opt').forEach(function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.tips === 'on') === on));
    });
    if (!on) hideTipDot();
  }
  /* 2026-08-05 redesign: the tooltip is a composed little panel
     (eyebrow + body + caret), not a bare text bubble. Hover opens it
     with a short intent delay so swiping the cursor across the screen
     doesn't light up every dot on the way past. */
  var tipHoverTimer = null;
  function showTipDot(dot) {
    var text = dot.getAttribute('data-tip');
    if (!text) return;
    hideTipDot();
    if (!tipFloatEl) {
      tipFloatEl = document.createElement('div');
      tipFloatEl.id = 'tip-float';
      tipFloatEl.setAttribute('role', 'tooltip');
      tipFloatEl.innerHTML = '<div class="tf-eyebrow">Tip</div><div class="tf-body"></div>';
      document.body.appendChild(tipFloatEl);
    }
    tipFloatEl.querySelector('.tf-body').textContent = text;
    /* restart the entrance animation for each owner */
    tipFloatEl.classList.remove('show');
    void tipFloatEl.offsetWidth;
    tipFloatEl.classList.add('show');
    /* above the dot, flipping below when the ceiling is too close, and
       clamped inside the viewport (mirrors the status-chip pop).
       Root-zoom bridge: rects are zoomed px, style/offset px are not -
       so everything crossing the glass divides by the factor. */
    var z = window.EOL.scale ? window.EOL.scale.factor() : 1;
    var a = dot.getBoundingClientRect();
    var w = tipFloatEl.offsetWidth;
    var h = tipFloatEl.offsetHeight;
    var pad = 8,
      gap = 9;
    var left = Math.max(
      pad,
      Math.min(a.left / z + a.width / z / 2 - w / 2, window.innerWidth / z - w - pad)
    );
    var top = a.top / z - h - gap;
    var below = false;
    if (top < pad) {
      top = a.bottom / z + gap;
      below = true;
    }
    top = Math.max(pad, Math.min(top, window.innerHeight / z - h - pad));
    tipFloatEl.classList.toggle('below', below);
    tipFloatEl.style.left = left + 'px';
    tipFloatEl.style.top = top + 'px';
    /* caret points BACK at the dot even when the panel slid aside */
    tipFloatEl.style.setProperty('--cx', Math.round(a.left / z + a.width / z / 2 - left) + 'px');
    tipOwner = dot;
  }
  function initTips() {
    applyTips(tipsEnabled());
    document.querySelectorAll('.tips-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        applyTips(b.dataset.tips === 'on');
      });
    });
    function dotOf(e) {
      return e.target && e.target.closest ? e.target.closest('.tipdot') : null;
    }
    /* A tip dot must never ACT - it only explains. Swallowing its
       click keeps a badge parked on a corner from ever passing a tap
       through to the control beneath. */
    document.addEventListener(
      'click',
      function (e) {
        var d = dotOf(e);
        if (d) {
          e.preventDefault();
          e.stopPropagation();
          showTipDot(d); /* touch users tap to read */
        } else if (tipOwner) hideTipDot();
      },
      true
    );
    document.addEventListener(
      'mouseover',
      function (e) {
        var d = dotOf(e);
        if (!d || d === tipOwner) return;
        /* intent delay: a dot you merely sweep past never opens */
        if (tipHoverTimer) clearTimeout(tipHoverTimer);
        tipHoverTimer = setTimeout(function () {
          tipHoverTimer = null;
          showTipDot(d);
        }, 150);
      },
      true
    );
    document.addEventListener(
      'mouseout',
      function (e) {
        var d = dotOf(e);
        if (d && tipHoverTimer) {
          /* left before the intent delay fired - no flash, no tip */
          clearTimeout(tipHoverTimer);
          tipHoverTimer = null;
        }
        if (!tipOwner || d !== tipOwner) return;
        var to = e.relatedTarget;
        if (to && to.closest && to.closest('.tipdot') === tipOwner) return;
        hideTipDot();
      },
      true
    );
    document.addEventListener(
      'focusin',
      function (e) {
        var d = dotOf(e);
        if (d) showTipDot(d);
      },
      true
    );
    document.addEventListener('focusout', hideTipDot, true);
    window.addEventListener('scroll', hideTipDot, true);
    window.addEventListener('resize', hideTipDot);
  }

  /* ---------------------------------------------------------
     GRAPHICS QUALITY
     -------------------------------------------------------------
     Writes body[data-gfx] and persists the choice. Applied at
     script-load time, before first paint, so a low-graphics user
     never sees a frame of the animations they turned off.
     --------------------------------------------------------- */
  var GFX_KEY = 'eol.gfx';
  function applyGfx(mode) {
    document.body.dataset.gfx = mode;
    try {
      localStorage.setItem(GFX_KEY, mode);
    } catch (e) {
      /* private mode: the toggle still works for this session */
    }
    document.querySelectorAll('.gfx-opt').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.gfx === mode));
    });
  }
  function initGfx() {
    var saved = 'high';
    try {
      saved = localStorage.getItem(GFX_KEY) || 'high';
    } catch (e) {
      saved = 'high';
    }
    /* respect the OS setting as the default if the user has never
       chosen - someone on reduce-motion should not have to opt out */
    try {
      if (
        !localStorage.getItem(GFX_KEY) &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        saved = 'low';
      }
    } catch (e) {
      /* ignore */
    }
    applyGfx(saved === 'low' ? 'low' : 'high');
    document.querySelectorAll('.gfx-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        applyGfx(b.dataset.gfx);
      });
    });
  }
  window.EOL.gfx = {
    get: function () {
      return document.body.dataset.gfx || 'high';
    },
    isLow: function () {
      return document.body.dataset.gfx === 'low';
    },
    set: applyGfx,
  };

  /* ---------------------------------------------------------
     GUI SCALE
     -------------------------------------------------------------
     80-110%, default 100. The thumb GLIDES while you drag (only the
     read-out follows it) and snaps to a whole percent when you let go.

     Semantics law (2026-08-05, third and final model): behave EXACTLY
     like the browser's own Ctrl +/-, because that is what players
     already reach for when they want the game to fit their screen.
     Ctrl +/- does not clip or leave dead bands - it changes the LAYOUT
     viewport, and everything reflows to fill the window at a new
     density. Two earlier models both failed at that:
       v1 `document.body.style.zoom`: viewport units inside the tree
          resolved against the DEVICE window and then got zoom-scaled
          on top - at >100% a 100dvh child rendered taller than the
          window and the bottom was cropped off.
       v2 paint-side `transform: scale()` on `.view`: layout can never
          see a transform, so shrinking 13% left a 13% empty band at
          the bottom (and 6.5% each side) - reads as "cut off".
     v3: `zoom` on the ROOT element. Probe-proven (2026-08-05, Chrome
     148): fixed/absolute layers pinned with inset:0 adapt to the
     zoomed viewport exactly like page zoom, and every length scales
     uniformly. Root zoom differs from real Ctrl +/- in only two
     places, and both are homed into line here:
       (a) viewport UNITS - style.css never names one directly; every
           vh/vw/dvh/vmax is var(--vh1)/var(--vw1)/var(--dvh1)/
           var(--vmax1) driven, and paintViewport() writes those as
           (device pixels / zoom / 100) = the LOGICAL viewport unit,
           exactly what Ctrl +/- would resolve them to;
       (b) pixel media queries - the breakpoints are html.mqw MQW
           and html.mqh classes toggled from the same logical numbers.
     Rect math: getBoundingClientRect reports ZOOMED pixels while
     style assignments and offset* are unzoomed - every rect->style
     conversion divides by EOL.scale.factor() (uiS() in battle.js,
     play.js, deck.js, plus the two body-level floaters: the tip dot
     here and the status popover in battle.js). */
  var SCALE_KEY = 'eol.scale';
  var SCALE_MIN = 80;
  var SCALE_MAX = 110;
  var SCALE_DEF = 100;
  var scalePct = SCALE_DEF;
  /* every emulated pixel breakpoint in style.css lives in one list so
     the stylesheet and this toggle can never drift apart */
  var MQ_W = [520, 560, 640, 720, 780, 900, 980];
  var MQ_H = [820];

  function paintViewport() {
    var z = scalePct / 100;
    /* logical viewport = device / zoom - what Ctrl +/- would report */
    var lw = window.innerWidth / z;
    var lh = window.innerHeight / z;
    var de = document.documentElement;
    de.style.setProperty('--vw1', (lw / 100).toFixed(3) + 'px');
    de.style.setProperty('--vh1', (lh / 100).toFixed(3) + 'px');
    de.style.setProperty('--dvh1', (lh / 100).toFixed(3) + 'px');
    de.style.setProperty('--vmax1', (Math.max(lw, lh) / 100).toFixed(3) + 'px');
    for (var i = 0; i < MQ_W.length; i++) de.classList.toggle('mqw' + MQ_W[i], lw <= MQ_W[i]);
    for (var j = 0; j < MQ_H.length; j++) de.classList.toggle('mqh' + MQ_H[j], lh <= MQ_H[j]);
  }

  function guiScale() {
    return scalePct;
  }
  function scaleFactor() {
    return scalePct / 100;
  }
  function applyScale(pct) {
    /* snap to 5% steps (80/85/90/95/100/105/110) - the slider walks in
       fives and every entry point lands on a five */
    pct = Math.min(
      SCALE_MAX,
      Math.max(SCALE_MIN, Math.round((parseFloat(pct) || SCALE_DEF) / 5) * 5)
    );
    scalePct = pct;
    var de = document.documentElement;
    /* 100% is no zoom at all: the property drops out completely, so
       the default build is byte-identical to build before the feature */
    if (pct === 100) de.style.removeProperty('zoom');
    else de.style.setProperty('zoom', String(pct / 100));
    paintViewport();
    try {
      localStorage.setItem(SCALE_KEY, String(pct));
    } catch (e) {
      /* private mode */
    }
    var r = document.getElementById('scale-range');
    if (r && parseFloat(r.value) !== pct) r.value = String(pct);
    var out = document.getElementById('scale-val');
    if (out) out.textContent = pct + '%';
    /* root zoom does not fire window.resize by itself; every layout
       sizer (board, dock, menus) already listens for resize - let
       them all do their job at the new density */
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (e2) {}
  }
  function initScale() {
    try {
      var raw = parseInt(localStorage.getItem(SCALE_KEY), 10);
      if (raw) {
        /* legacy migrations: v2 stored levels 1-4, v1 (zoom era)
           stored a percent 60-130; both land on the 5% grid below */
        scalePct = raw <= 4 ? { 1: 80, 2: 85, 3: 95, 4: 100 }[raw] || SCALE_DEF : raw;
      }
    } catch (e) {
      /* private mode */
    }
    applyScale(scalePct);
    var r = document.getElementById('scale-range');
    if (r) {
      /* glide-then-snap: mid-drag only the READ-OUT follows the thumb;
         the app itself rescales once, when the pointer lets go - no
         layout storms while the user is still deciding */
      r.addEventListener('input', function () {
        var v = Math.min(
          SCALE_MAX,
          Math.max(SCALE_MIN, Math.round((parseFloat(r.value) || SCALE_DEF) / 5) * 5)
        );
        var out = document.getElementById('scale-val');
        if (out) out.textContent = v + '%';
      });
      r.addEventListener('change', function () {
        applyScale(parseFloat(r.value));
      });
    }
    var res = document.getElementById('scale-reset');
    if (res)
      res.addEventListener('click', function () {
        applyScale(SCALE_DEF);
      });
    window.addEventListener('resize', paintViewport);
  }
  window.EOL.scale = { get: guiScale, set: applyScale, factor: scaleFactor };

  /* ---------------------------------------------------------
     AUTH UI
     -------------------------------------------------------------
     Drives the modal and delegates to window.EOL.auth (js/auth.js).
     When Supabase is not configured the module reports itself as not
     ready and every control explains that rather than failing
     silently - the game itself is unaffected either way.
     --------------------------------------------------------- */
  function initAuth() {
    var modal = document.getElementById('auth-modal');
    var openBtn = document.getElementById('acct-btn');
    if (!modal || !openBtn) return;

    var A = window.EOL.auth;
    var busy = false;

    function open() {
      modal.hidden = false;
      document.body.dataset.modal = '1';
      var first = modal.querySelector('.auth-google');
      if (first) first.focus();
    }
    function close() {
      modal.hidden = true;
      delete document.body.dataset.modal;
      openBtn.focus();
    }
    function setMode(mode) {
      modal.dataset.mode = mode;
      var up = mode === 'up';
      modal.querySelectorAll('.auth-tab').forEach(function (t) {
        var on = t.dataset.mode === mode;
        t.classList.toggle('sel', on);
        t.setAttribute('aria-selected', String(on));
      });
      document.getElementById('auth-title').textContent = up ? 'Join the ladder' : 'Welcome back';
      document.getElementById('auth-sub').textContent = up
        ? 'Your progress is saved on this device. Create an account to back it up, carry it across devices, and play online.'
        : 'Your progress is saved on this device. Sign in to restore your cloud save and play online.';
      document.getElementById('auth-submit-txt').textContent = up ? 'Create account' : 'Sign in';
      document.getElementById('auth-name-field').hidden = !up;
      say('');
    }

    /* one place for every message the modal shows */
    function say(msg, kind) {
      var foot = document.getElementById('auth-foot');
      if (!foot) return;
      var offline = !(A && A.isReady && A.isReady());
      foot.className = 'auth-foot' + (kind ? ' ' + kind : '');
      if (msg) {
        foot.innerHTML = '<i class="ri-information-line"></i>' + esc(msg);
      } else if (offline) {
        foot.innerHTML =
          '<i class="ri-information-line"></i>Accounts are not connected yet. ' +
          'Your progress remains saved on this device, but cloud backup is unavailable.';
      } else {
        foot.innerHTML =
          '<i class="ri-information-line"></i>Signed-out progress stays in this browser. ' +
          'Create an account for cloud backup; signing into an existing account restores that account’s save. ' +
          'Accounts also unlock multiplayer and official Daily Puzzles.';
      }
      if (kind) {
        foot.classList.remove('flash');
        void foot.offsetWidth;
        foot.classList.add('flash');
      }
    }

    function guard() {
      if (!(A && A.isReady && A.isReady())) {
        say(
          A && A.configured && A.configured()
            ? 'Could not reach the account service. Playing offline.'
            : 'Accounts are not configured yet. Add your Supabase URL and publishable key in js/supabase-config.js.',
          'warn'
        );
        return false;
      }
      if (busy) return false;
      return true;
    }

    function run(promise, working) {
      busy = true;
      say(working);
      promise
        .then(function () {
          busy = false;
        })
        .catch(function (err) {
          busy = false;
          say((err && err.message) || 'Something went wrong. Try again.', 'warn');
        });
    }

    openBtn.addEventListener('click', function (e) {
      /* The profile button opens the account menu for EVERYONE now
         (session 24 - the corner gear is gone, the menu carries
         Settings for all, plus Sign in or Log out depending on
         body[data-auth]). */
      e.stopPropagation();
      toggleAcctMenu();
    });
    var homeCloudBtn = document.getElementById('home-cloud-cta');
    if (homeCloudBtn) {
      homeCloudBtn.addEventListener('click', function () {
        setMode('in');
        open();
      });
    }
    document.getElementById('auth-close').addEventListener('click', close);
    document.getElementById('auth-scrim').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
    });
    modal.querySelectorAll('.auth-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        setMode(t.dataset.mode);
      });
    });

    document.getElementById('auth-google').addEventListener('click', function () {
      if (!guard()) return;
      run(A.signInWithGoogle(), 'Redirecting to Google...');
    });

    document.getElementById('auth-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!guard()) return;
      var f = e.target;
      var email = (f.email.value || '').trim();
      var pass = f.password.value || '';
      var handle = f.name ? (f.name.value || '').trim() : '';
      if (modal.dataset.mode === 'up' && handle && A.validateHandle) {
        /* usernames are matchmaking callsigns: letters, numbers, ._- */
        var badName = A.validateHandle(handle);
        if (badName) {
          say(badName, 'warn');
          return;
        }
      }
      if (!email || !pass) {
        say('Enter an email and password.', 'warn');
        return;
      }
      if (modal.dataset.mode === 'up') {
        run(
          A.signUp(email, pass, handle).then(function () {
            say('Check your inbox to confirm your email.');
          }),
          'Creating your account...'
        );
      } else {
        run(
          A.signIn(email, pass).then(function () {
            close();
          }),
          'Signing in...'
        );
      }
    });

    /* reflect auth state on the corner button */
    if (A && A.onChange) {
      A.onChange(function (user) {
        var label = openBtn.querySelector('.acct-label');
        var av = openBtn.querySelector('.acct-avatar');
        if (user) {
          if (label) label.textContent = user.name;
          openBtn.title = 'Signed in as ' + (user.email || user.name) + ' - account menu';
          if (av) {
            av.innerHTML = user.avatar
              ? '<img src="' + esc(user.avatar) + '" alt="" />'
              : '<i class="ri-user-3-line"></i>';
          }
          if (!modal.hidden) close();
        } else {
          if (label) label.textContent = 'Sign in';
          openBtn.title = 'Progress is saved on this device - sign in for cloud backup';
          if (av) av.innerHTML = '<i class="ri-user-3-line"></i>';
        }
      });
    }

    setMode('in');
    say('');

    /* ---------------------------------------------------------
       ACCOUNT MENU (signed-in)
       ---------------------------------------------------------
       The profile button opens this instead of signing out cold. */
    var acctMenu = document.getElementById('acct-menu');
    function toggleAcctMenu(force) {
      if (!acctMenu) return;
      var show = force != null ? force : acctMenu.hidden;
      acctMenu.hidden = !show;
    }
    if (acctMenu) {
      document.getElementById('acct-logout').addEventListener('click', function () {
        toggleAcctMenu(false);
        A.signOut();
      });
      document.getElementById('acct-login').addEventListener('click', function () {
        toggleAcctMenu(false);
        open();
      });
      document.getElementById('acct-settings').addEventListener('click', function () {
        toggleAcctMenu(false);
        openSettings();
      });
      document.addEventListener('click', function (e) {
        if (acctMenu.hidden) return;
        if (acctMenu.contains(e.target) || openBtn.contains(e.target)) return;
        toggleAcctMenu(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') toggleAcctMenu(false);
      });
    }

    /* ---------------------------------------------------------
       SETTINGS MODAL
       ---------------------------------------------------------
       Username + password edits (signed-in only) and the graphics
       quality switch. The graphics buttons are plain .gfx-opt
       elements: initGfx() already bound their clicks and keeps
       aria-pressed in sync, so there is nothing to wire here. */
    var setModal = document.getElementById('settings-modal');
    var setFoot = document.getElementById('settings-foot');
    function setSay(msg, kind) {
      if (!setFoot) return;
      setFoot.className = 'auth-foot' + (kind ? ' ' + kind : '');
      setFoot.innerHTML = msg ? '<i class="ri-information-line"></i>' + esc(msg) : '';
    }
    function openSettings() {
      if (!setModal) return;
      var u = A && A.user && A.user();
      var form = document.getElementById('settings-form');
      var note = document.getElementById('set-out-note');
      if (form) {
        form.style.display = u ? '' : 'none';
        var un = document.getElementById('set-username');
        if (un && u) un.value = u.name || '';
        var np = document.getElementById('set-newpass');
        if (np) np.value = '';
      }
      if (note) note.hidden = !!u;
      setSay('');
      setModal.hidden = false;
      document.body.dataset.modal = '1';
    }
    function closeSettings() {
      if (!setModal || setModal.hidden) return;
      setModal.hidden = true;
      delete document.body.dataset.modal;
    }
    var setBtn = document.getElementById('settings-btn');
    if (setBtn) setBtn.addEventListener('click', openSettings);
    if (setModal) {
      document.getElementById('settings-close').addEventListener('click', closeSettings);
      document.getElementById('settings-scrim').addEventListener('click', closeSettings);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSettings();
      });
      document.getElementById('settings-form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        var u = A && A.user && A.user();
        if (!u) return;
        var un = document.getElementById('set-username');
        var np = document.getElementById('set-newpass');
        var handle = (un.value || '').trim();
        var pass = np.value || '';
        var jobs = [];
        if (handle && handle !== u.name) {
          var bad = A.validateHandle(handle);
          if (bad) {
            setSay(bad, 'warn');
            return;
          }
          jobs.push(A.setHandle(handle));
        }
        if (pass) {
          if (pass.length < 6) {
            setSay('Password needs at least 6 characters.', 'warn');
            return;
          }
          jobs.push(A.updatePassword(pass));
        }
        if (!jobs.length) {
          setSay('Nothing to save.');
          return;
        }
        busy = true;
        setSay('Saving...');
        Promise.all(jobs)
          .then(function () {
            busy = false;
            np.value = '';
            setSay('Saved.');
          })
          .catch(function (err) {
            busy = false;
            setSay((err && err.message) || 'Could not save. Try again.', 'warn');
          });
      });
    }

    /* ---------------------------------------------------------
       CALLSIGN PROMPT (post-Google provisioning)
       ---------------------------------------------------------
       Google creates the auth identity but gives no callsign; while
       needsHandle() is true, this modal asks for one. "Pick one
       later" is honoured for the rest of the browser session, and
       the ask never interrupts a match (home view only). */
    var unModal = document.getElementById('uname-modal');
    var unFoot = document.getElementById('uname-foot');
    var unInput = document.getElementById('uname-input');
    var unForm = document.getElementById('uname-form');
    var unSkip = document.getElementById('uname-skip');
    var UN_SKIP_KEY = 'eol.uname.skip';
    function unSay(msg, kind) {
      if (!unFoot) return;
      unFoot.className = 'auth-foot' + (kind ? ' ' + kind : '');
      unFoot.innerHTML = msg ? '<i class="ri-information-line"></i>' + esc(msg) : '';
    }
    function closeUname() {
      if (!unModal || unModal.hidden) return;
      unModal.hidden = true;
      delete document.body.dataset.modal;
    }
    function maybePromptUsername() {
      if (!unModal || !(A && A.isReady && A.isReady())) return;
      var u = A.user && A.user();
      if (!u || !(A.needsHandle && A.needsHandle())) return;
      if (document.body.dataset.view !== 'home') return; // never ambush mid-match
      try {
        if (sessionStorage.getItem(UN_SKIP_KEY) === '1') return;
      } catch (e) {}
      if (!unModal.hidden || document.body.dataset.modal) return;
      setTimeout(function () {
        if (!unModal.hidden || document.body.dataset.modal) return;
        unSay('');
        if (unInput) unInput.value = '';
        unModal.hidden = false;
        document.body.dataset.modal = '1';
        if (unInput) unInput.focus();
      }, 400);
    }
    document.addEventListener('eol:view', maybePromptUsername);
    if (A && A.onChange) A.onChange(maybePromptUsername);
    if (unForm) {
      unForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (busy) return;
        var h = (unInput.value || '').trim();
        var bad = A.validateHandle(h);
        if (bad) {
          unSay(bad, 'warn');
          return;
        }
        busy = true;
        unSay('Claiming...');
        A.setHandle(h)
          .then(function () {
            busy = false;
            unSay('Welcome to the ladder, ' + h + '.');
            setTimeout(closeUname, 900);
          })
          .catch(function (err) {
            busy = false;
            unSay((err && err.message) || 'Could not set that name.', 'warn');
          });
      });
    }
    if (unSkip) {
      unSkip.addEventListener('click', function () {
        try {
          sessionStorage.setItem(UN_SKIP_KEY, '1');
        } catch (e) {}
        closeUname();
      });
    }

    /* ---------------------------------------------------------
       OAUTH ERROR SURFACE
       ---------------------------------------------------------
       Coming back from Google with an error in the URL (Supabase
       reports provider failures as query params on the redirect) is
       otherwise a silent dead end. Surface it in the auth modal and
       clean the address bar. access_denied = the user closed the
       consent screen, which needs no message. */
    (function () {
      try {
        var src = window.location.search + window.location.hash;
        if (src.indexOf('error') === -1) return;
        var codeM = src.match(/[?&#]error_code?=([^&]+)/i);
        if (codeM && /access_denied/i.test(codeM[1])) return;
        var m = src.match(/error_description=([^&]+)/);
        if (!m) return;
        var msg = decodeURIComponent(m[1].replace(/\+/g, ' '));
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch (e2) {}
        if (/signups? (are|is)? ?not allowed|disabled/i.test(msg)) {
          msg =
            'That Google account has no Echoes of Legend account on this server yet, and ' +
            'Google sign-ups are currently turned off there - create an account with ' +
            'email below instead, it takes twenty seconds.';
        }
        open();
        say(msg, 'warn');
      } catch (e) {}
    })();
  }

  /* ---------------------------------------------------------
     MENU ATMOSPHERE
     -------------------------------------------------------------
     Populates the five weather layers in the home backdrop (the
     CSS and choreography live next to .mb-ultra & friends in
     style.css). Every field is SEEDED so the scene is composed,
     not dice - all players get the same intentional frame, and a
     reload never re-deals the sky. All motion lives in CSS custom
     properties; this file only deals the --x/--dur/--o cards.
     --------------------------------------------------------- */
  function seededRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function between(rng, lo, hi) {
    return lo + rng() * (hi - lo);
  }
  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length) % arr.length];
  }

  var MENU_FIELDS = [
    /* fourth mote band: barely-visible dust hanging in the sky, the
       slowest thing in the frame */
    {
      sel: '.mb-ultra',
      n: 42,
      seed: 20260805,
      sz: [1, 2],
      dur: [70, 130],
      o: [0.16, 0.4],
      sway: [10, 34],
      tints: ['#cdd8f2', '#b9c8ec', '#e8ecf7'],
    },
    /* cold ash sifting down through the whole scene - the campfires'
       other half, grey where the embers are gold */
    {
      sel: '.mb-ash',
      n: 26,
      seed: 20260806,
      sz: [2, 4],
      dur: [38, 72],
      o: [0.2, 0.5],
      sway: [18, 46],
      tints: ['#cfd3dd', '#b9bdcb', '#e3d9c8', '#d6cec2'],
    },
    /* big soft seeds riding up-currents, dreamy and rare */
    {
      sel: '.mb-spores',
      n: 14,
      seed: 20260807,
      sz: [4, 8],
      dur: [50, 92],
      o: [0.16, 0.38],
      sway: [42, 110],
      tints: ['rgba(255,236,190,0.85)', 'rgba(214,226,255,0.8)', 'rgba(255,222,168,0.7)'],
    },
  ];
  /* banks and rays are not fields - four lanes and three shafts,
     hand-placed, no dice at all */
  var MENU_BANKS = [
    { b: '2%', h: 150, pc: 'rgba(158,172,214,0.10)', f: -26, to: 20, dur: 118, dl: -40 },
    { b: '7%', h: 210, pc: 'rgba(170,150,214,0.08)', f: 18, to: -24, dur: 96, dl: -12 },
    { b: '12%', h: 130, pc: 'rgba(150,168,220,0.12)', f: -14, to: 26, dur: 74, dl: -55 },
    { b: '0%', h: 260, pc: 'rgba(180,190,230,0.06)', f: 30, to: -30, dur: 132, dl: -70 },
  ];
  var MENU_RAYS = [
    { x: '14%', w: 300, l1: -16, l2: -11, o: 0.3, dur: 34, dl: -8, rx: 46 },
    { x: '46%', w: 380, l1: -13, l2: -18, o: 0.42, dur: 47, dl: -22, rx: 64 },
    { x: '74%', w: 260, l1: -18, l2: -13, o: 0.26, dur: 39, dl: -15, rx: 52 },
  ];

  function initMenuParticles() {
    MENU_FIELDS.forEach(function (f) {
      var host = document.querySelector(f.sel);
      if (!host || host.dataset.seeded) return;
      host.dataset.seeded = '1';
      var rng = seededRng(f.seed);
      var frag = document.createDocumentFragment();
      for (var i = 0; i < f.n; i++) {
        var el = document.createElement('i');
        var dur = between(rng, f.dur[0], f.dur[1]);
        el.style.setProperty('--x', between(rng, 1.5, 98.5).toFixed(2) + '%');
        el.style.setProperty('--dur', dur.toFixed(1) + 's');
        /* negative delays - the field is already mid-flight on load,
           nobody watches a synchronized wave rehearse */
        el.style.setProperty('--dl', (-between(rng, 0, dur)).toFixed(1) + 's');
        el.style.setProperty('--sz', between(rng, f.sz[0], f.sz[1]).toFixed(2) + 'px');
        el.style.setProperty('--o', between(rng, f.o[0], f.o[1]).toFixed(3));
        el.style.setProperty('--s1', Math.round(between(rng, f.sway[0], f.sway[1])) + 'px');
        el.style.setProperty('--s2', Math.round(between(rng, f.sway[0], f.sway[1])) + 'px');
        el.style.setProperty('--pc', pick(rng, f.tints));
        frag.appendChild(el);
      }
      host.appendChild(frag);
    });
    var banks = document.querySelector('.mb-fogbanks');
    if (banks && !banks.dataset.seeded) {
      banks.dataset.seeded = '1';
      MENU_BANKS.forEach(function (bk) {
        var el = document.createElement('i');
        el.style.setProperty('--b', bk.b);
        el.style.setProperty('--h', bk.h + 'px');
        el.style.setProperty('--pc', bk.pc);
        el.style.setProperty('--f', String(bk.f));
        el.style.setProperty('--to', String(bk.to));
        el.style.setProperty('--dur', bk.dur + 's');
        el.style.setProperty('--dl', bk.dl + 's');
        banks.appendChild(el);
      });
    }
    var rays = document.querySelector('.mb-rays');
    if (rays && !rays.dataset.seeded) {
      rays.dataset.seeded = '1';
      MENU_RAYS.forEach(function (r) {
        var el = document.createElement('i');
        el.style.setProperty('--x', r.x);
        el.style.setProperty('--w', r.w + 'px');
        el.style.setProperty('--l1', r.l1 + 'deg');
        el.style.setProperty('--l2', r.l2 + 'deg');
        el.style.setProperty('--o', String(r.o));
        el.style.setProperty('--dur', r.dur + 's');
        el.style.setProperty('--dl', r.dl + 's');
        el.style.setProperty('--rx', r.rx + 'px');
        rays.appendChild(el);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initGfx();
    initTips();
    initScale();
    initMenuParticles();
    if (window.EOL.auth) window.EOL.auth.init();
    if (window.EOL.cloud) window.EOL.cloud.init();
    if (window.EOL.cloud && window.EOL.cloud.restored() && window.EOL.ui && window.EOL.ui.toast)
      window.EOL.ui.toast('Your save was restored from your account', 'ri-cloud-line');
    initAuth();
    if (!ROSTER.length) {
      console.error('[EOL] No faction data loaded.');
      return;
    }

    /* home-page counts come from the data itself - they can never drift
       out of sync with the roster again */
    var sh = document.getElementById('stat-heroes');
    if (sh) sh.textContent = ROSTER.length;
    var sf = document.getElementById('stat-factions');
    if (sf) sf.textContent = FACTIONS.length;
    var total = document.getElementById('total-count');
    if (total) total.textContent = ROSTER.length;
    paintOwnedCount();

    /* lazy loading: watch the sentinel; fall back to eager rendering on
       browsers without IntersectionObserver */
    var sent = document.getElementById('roster-sentinel');
    if (sent && 'IntersectionObserver' in window) {
      new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) renderBatch();
          });
        },
        { root: null, rootMargin: '900px 0px' }
      ).observe(sent);
    } else {
      PAGE = ROSTER.length;
    }

    buildFilters();
    applyFilters();

    document.getElementById('btn-collection').addEventListener('click', function () {
      show('collection');
    });
    var homeCoins = document.getElementById('home-coins');
    if (homeCoins) {
      homeCoins.addEventListener('click', function () {
        show('shop');
      });
      paintHomeCoins();
    }
    var btnRulebook = document.getElementById('btn-rulebook');
    var btnCornerRulebook = document.getElementById('btn-corner-rulebook');
    if (btnRulebook) {
      btnRulebook.addEventListener('click', function () {
        show('rulebook');
      });
    }
    if (btnCornerRulebook) {
      btnCornerRulebook.addEventListener('click', function () {
        show('rulebook');
      });
    }
    var btnRulebookBack = document.getElementById('btn-rulebook-back');
    if (btnRulebookBack) {
      btnRulebookBack.addEventListener('click', function () {
        goBack();
      });
    }
    document.getElementById('btn-back').addEventListener('click', function () {
      goBack();
    });
    /* Play now opens the mode menu (Classic / Draft / Campaign). Deck
       building lives in the Collection's Decks tab. */
    document.getElementById('btn-play').addEventListener('click', function () {
      show('play');
    });
    document.getElementById('btn-shop').addEventListener('click', function () {
      show('shop');
    });
    document.getElementById('btn-deck-back').addEventListener('click', function () {
      if (window.EOL.decks) window.EOL.decks.closeEditor();
      else goBack();
    });
    document.getElementById('btn-shop-back').addEventListener('click', function () {
      goBack();
    });
    // No Leave buttons on these screens - Esc backs out one level.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      /* Campaign dialogue owns Escape while it is open; do not let the
         shared view-back handler strand an open scene on another screen. */
      if (
        window.EOL.campaign &&
        window.EOL.campaign.dialogueOpen &&
        window.EOL.campaign.dialogueOpen()
      ) {
        window.EOL.campaign.closeRecruiterDialogue();
        return;
      }
      goBack();
      // the shop and the deck picker modal handle Esc themselves
    });
    document.getElementById('btn-result-home').addEventListener('click', function () {
      document.getElementById('result').className = 'result';
      /* A puzzle's secondary action returns to the singleplayer mode
         screen; the next launch always forges another position. */
      if (window.EOL.daily && window.EOL.daily.consumeResult) {
        if (window.EOL.daily.consumeResult()) return;
      }
      /* Campaign owns its secondary result button: after Gate I the road
         either plays the victory epilogue or returns to the chapter map. */
      if (window.EOL.campaign && window.EOL.campaign.consumeResult) {
        if (window.EOL.campaign.consumeResult()) return;
      }
      show('home');
    });

    show('home');
    console.log('[EOL] ' + ROSTER.length + ' heroes across ' + FACTIONS.length + ' factions.');
  });
})();
