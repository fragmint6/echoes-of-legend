/* =============================================================
   Echoes of Legend — Frontend Renderer
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

  /* ---- lookup tables ---- */
  var ELEMENT_ICON = {
    Physical: 'ra-crossed-swords',
    Magic: 'ra-crystals',
    Shadow: 'ra-moon-sun',
    Light: 'ra-sun',
    Lightning: 'ra-lightning-bolt',
    Fire: 'ra-fire',
    Nature: 'ra-leaf'
  };
  var ELEMENT_COLOR = {
    Physical: 'var(--e-physical)',
    Magic: 'var(--e-magic)',
    Shadow: 'var(--e-shadow)',
    Light: 'var(--e-light)',
    Lightning: 'var(--e-lightning)',
    Fire: 'var(--e-fire)',
    Nature: 'var(--e-nature)'
  };
  var ROLE_ICON = {
    Tank: 'ra-shield',
    Bruiser: 'ra-battered-axe',
    Caster: 'ra-fairy-wand',
    Controller: 'ra-gears',
    Medic: 'ra-health',
    Sniper: 'ra-archery-target'
  };

  /* bar scaling maxima */
  var MAX = { hp: 8500, atk: 1150, def: 50 };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // ability text may contain intentional <b> tags from the data files;
  // element names get colour-coded on the way out
  function rich(s) { return window.EOL.colorElements(String(s)); }

  function statRow(icon, key, val, display, max, color) {
    var pct = Math.max(4, Math.min(100, (val / max) * 100));
    return (
      '<div class="stat-row" style="--sc:' + color + ';--pct:' + pct.toFixed(1) + '%">' +
        '<i class="stat-ico ra ' + icon + '"></i>' +
        '<span class="stat-key">' + key + '</span>' +
        '<span class="stat-bar"><span class="stat-fill"></span></span>' +
        '<span class="stat-val">' + display + '</span>' +
      '</div>'
    );
  }

  function buildCard(card, faction, index) {
    var el = document.createElement('article');
    el.className = 'card';
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

    var costTag = isActive && card.ability.cost != null
      ? '<span class="ab-cost"><i class="ra ra-lightning-bolt"></i>' + card.ability.cost + '</span>'
      : '';

    el.innerHTML =
      '<div class="card-art">' +
        '<div class="art-ring"></div>' +
        '<i class="art-glyph ra ' + card.icon + '"></i>' +
      '</div>' +
      '<div class="card-vignette"></div>' +
      '<div class="card-sheen"></div>' +
      '<div class="card-frame"></div>' +
      '<span class="corner tl"></span><span class="corner tr"></span>' +
      '<span class="corner bl"></span><span class="corner br"></span>' +

      '<div class="card-top">' +
        '<span class="rarity-tag">' + esc(card.rarity) + '</span>' +
        '<span class="element-orb" title="' + esc(card.element) + '">' +
          '<i class="ra ' + (ELEMENT_ICON[card.element] || 'ra-player') + '"></i>' +
        '</span>' +
      '</div>' +

      '<div class="card-plate">' +
        '<div class="plate-role">' +
          '<i class="ra ' + (ROLE_ICON[card.role] || 'ra-player') + '"></i>' + esc(card.role) +
        '</div>' +
        '<h3 class="card-name">' + esc(card.name) + '</h3>' +
        '<div class="plate-hint"><i class="ri-cursor-line"></i><span class="hint-txt"></span></div>' +
      '</div>' +

      '<div class="card-overlay">' +
        '<div class="ov-head">' +
          '<h3 class="ov-name">' + esc(card.name) + '</h3>' +
          '<div class="ov-meta">' + esc(card.rarity) +
            '<span class="dot">◆</span>' + esc(card.role) +
            '<span class="dot">◆</span><span class="el">' + esc(card.element) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="stat-block">' +
          statRow('ra-health', 'HP', card.stats.hp, card.stats.hp.toLocaleString(), MAX.hp, '#ff5f7e') +
          statRow('ra-sword', 'ATK', card.stats.atk, card.stats.atk.toLocaleString(), MAX.atk, '#ffb347') +
          statRow('ra-shield', 'DEF', card.stats.def, card.stats.def + '%', MAX.def, '#5fb2ff') +
        '</div>' +
        '<div class="ability" style="--ab-c:' + abColor + '">' +
          '<div class="ab-top">' +
            '<span class="ab-type">' + esc(card.ability.type) + '</span>' + costTag +
          '</div>' +
          '<div class="ab-name">' + esc(card.ability.name) + '</div>' +
          '<div class="ab-text">' + rich(card.ability.text) +
            (card.ability.note ? '<div class="ab-note">' + rich(card.ability.note) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="ov-foot">' +
          '<span class="role-pill"><i class="ra ' + (ROLE_ICON[card.role] || 'ra-player') + '"></i> ' + esc(card.role) + '</span>' +
          '<span>' + esc(faction.name) + '</span>' +
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

  /* ---------------- render one flat alphabetical grid ---------------- */
  function render() {
    var grid = document.getElementById('roster');
    if (!grid) return;
    grid.innerHTML = '';
    ROSTER.forEach(function (entry, i) {
      grid.appendChild(buildCard(entry.card, entry.faction, i));
    });
    var total = document.getElementById('total-count');
    if (total) total.textContent = ROSTER.length;
  }

  /* ---------------- filtering ---------------- */
  var state = { faction: 'all', rarity: 'all', role: 'all', q: '' };

  function applyFilters() {
    var shown = 0;
    document.querySelectorAll('.card').forEach(function (c) {
      var ok =
        (state.faction === 'all' || c.dataset.faction === state.faction) &&
        (state.rarity === 'all' || c.dataset.rarity === state.rarity) &&
        (state.role === 'all' || c.dataset.role === state.role) &&
        (state.q === '' || c.dataset.name.indexOf(state.q) !== -1);
      c.classList.toggle('is-hidden', !ok);
      if (ok) shown++;
    });

    var empty = document.getElementById('empty');
    if (empty) empty.classList.toggle('show', shown === 0);
    var vis = document.getElementById('visible-count');
    if (vis) vis.textContent = shown;
  }

  /* ---------------- custom dropdowns ---------------- */
  function closeAllMenus(except) {
    document.querySelectorAll('.dd.open').forEach(function (d) {
      if (d !== except) d.classList.remove('open');
    });
  }

  /* Build one dropdown.
     opts: [{value, label, icon}]  onPick: fn(value) */
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
      var o = opts.filter(function (x) { return x.value === v; })[0] || opts[0];
      btn.innerHTML =
        '<span class="dd-label">' + label + '</span>' +
        '<span class="dd-value">' +
          (o.icon ? '<i class="' + o.icon + '"></i>' : '') + esc(o.text) +
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
      b.innerHTML = (o.icon ? '<i class="' + o.icon + '"></i>' : '<i class="dd-blank"></i>') +
        '<span>' + esc(o.text) + '</span><i class="dd-check ri-check-line"></i>';
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
      { value: 'legendary', text: 'Legendary' },
      { value: 'epic', text: 'Epic' },
      { value: 'rare', text: 'Rare' },
      { value: 'common', text: 'Common' }
    ];

    var roleOpts = [{ value: 'all', text: 'All Roles', icon: 'ri-team-line' }];
    ['Tank', 'Bruiser', 'Caster', 'Controller', 'Medic', 'Sniper'].forEach(function (r) {
      roleOpts.push({ value: r, text: r, icon: 'ra ' + ROLE_ICON[r] });
    });

    buildDropdown(host, 'Faction', factionOpts, function (v) { state.faction = v; applyFilters(); });
    buildDropdown(host, 'Rarity', rarityOpts, function (v) { state.rarity = v; applyFilters(); });
    buildDropdown(host, 'Role', roleOpts, function (v) { state.role = v; applyFilters(); });

    document.addEventListener('click', function () { closeAllMenus(null); });
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

  /* ---------------- view routing ---------------- */
  function show(view) {
    // any battle tooltip must not survive a view change
    if (window.EOL.battle && window.EOL.battle.hideTip) window.EOL.battle.hideTip();
    document.querySelectorAll('[data-view]').forEach(function (v) {
      v.classList.toggle('active', v.dataset.view === view);
    });
    document.body.dataset.view = view;
    window.scrollTo(0, 0);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!ROSTER.length) {
      console.error('[EOL] No faction data loaded.');
      return;
    }
    render();
    buildFilters();
    applyFilters();

    document.getElementById('btn-collection').addEventListener('click', function () {
      show('collection');
    });
    document.getElementById('btn-back').addEventListener('click', function () {
      show('home');
    });
    document.getElementById('btn-play').addEventListener('click', function () {
      show('battle');
      window.EOL.battle.start();
    });
    document.getElementById('btn-leave').addEventListener('click', function () {
      show('home');
    });
    document.getElementById('btn-result-home').addEventListener('click', function () {
      document.getElementById('result').className = 'result';
      show('home');
    });

    show('home');
    console.log('[EOL] ' + ROSTER.length + ' heroes across ' + FACTIONS.length + ' factions.');
  });
})();
