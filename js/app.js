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

  /* ---- lookup tables ---- */
  var ELEMENT_ICON = {
    Physical: 'ra-crossed-swords',
    Magic: 'ra-crystals',
    Shadow: 'ra-moon-sun',
    Light: 'ra-sun',
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
      '<i class="stat-ico ra ' +
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

    var costTag =
      isActive && card.ability.cost != null
        ? '<span class="ab-cost"><i class="ra ra-lightning-bolt"></i>' +
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
      : '<i class="art-glyph ra ' + card.icon + '"></i>';

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
      '<i class="ra ' +
      (ELEMENT_ICON[card.element] || 'ra-player') +
      '"></i>' +
      '</span>' +
      '</div>' +
      '<div class="card-plate">' +
      '<div class="plate-role">' +
      '<i class="ra ' +
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
      '<i class="ra ra-diamond dot"></i>' +
      esc(card.role) +
      '<i class="ra ra-diamond dot"></i><span class="el">' +
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
      '<span class="role-pill"><i class="ra ' +
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
    ROLE_ICON: ROLE_ICON,
    ELEMENT_ICON: ELEMENT_ICON,
    ELEMENT_COLOR: ELEMENT_COLOR,
    buildDropdown: buildDropdown,
    closeAllMenus: closeAllMenus,
    show: function (view) {
      show(view);
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
    return ROSTER.filter(function (entry) {
      var c = entry.card;
      return (
        (state.faction === 'all' || entry.faction.id === state.faction) &&
        (state.rarity === 'all' || c.rarity === state.rarity) &&
        (state.role === 'all' || c.role === state.role) &&
        (state.q === '' || c.name.toLowerCase().indexOf(state.q) !== -1)
      );
    });
  }

  function renderBatch() {
    var grid = document.getElementById('roster');
    if (!grid || rendered >= filtered.length) return;
    var end = Math.min(rendered + PAGE, filtered.length);
    for (var i = rendered; i < end; i++) {
      grid.appendChild(buildCard(filtered[i].card, filtered[i].faction, i));
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
      var o =
        opts.filter(function (x) {
          return x.value === v;
        })[0] || opts[0];
      btn.innerHTML =
        '<span class="dd-label">' +
        label +
        '</span>' +
        '<span class="dd-value">' +
        (o.icon ? '<i class="' + o.icon + '"></i>' : '') +
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
        (o.icon ? '<i class="' + o.icon + '"></i>' : '<i class="dd-blank"></i>') +
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
      { value: 'legendary', text: 'Legendary' },
      { value: 'epic', text: 'Epic' },
      { value: 'rare', text: 'Rare' },
      { value: 'common', text: 'Common' },
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
  var VEIL_MIN_MS = 430;
  var VEIL_MIN_LOW_MS = 180; // low-graphics users traded garnish for speed
  var VEIL_MAX_MS = 1600;

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
    scopes.forEach(function (scope) {
      scope.querySelectorAll('img').forEach(function (im) {
        if (!im.complete) track(im.currentSrc || im.src);
      });
      scope
        .querySelectorAll('.sc-art, .mb-sky, .mb-far, .mb-mid, .mb-near, .bf-art.has-art')
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
  function show(view) {
    if (veil) veil.classList.add('on');
    // any battle tooltip must not survive a view change
    if (window.EOL.battle && window.EOL.battle.hideTip) window.EOL.battle.hideTip();
    document.querySelectorAll('[data-view]').forEach(function (v) {
      v.classList.toggle('active', v.dataset.view === view);
    });
    document.body.dataset.view = view;
    /* The wait cursor belongs to an animating battle board and nothing
       else. Leaving the battle for any reason - result screen, forfeit,
       an opponent disconnecting mid-animation - must release it, or the
       pointer stays stuck on the hourglass across the whole menu. This
       is the single place every view change passes through, so clearing
       it here closes the whole class of bug rather than one path. */
    if (view !== 'battle') {
      document.body.dataset.busy = '0';
      document.body.dataset.netwait = '0';
    }
    window.scrollTo(0, 0);
    /* Anything that has to MEASURE itself cannot do so while its view
       is hidden (zero width). Announce the change so those modules can
       re-measure at the first moment they are able to. */
    document.dispatchEvent(new CustomEvent('eol:view', { detail: view }));
    veilSettle();
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
        ? 'Create an account to play ranked matches against other players.'
        : 'Sign in to play ranked matches against other players.';
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
          'Singleplayer works as normal and your decks are saved on this device.';
      } else {
        foot.innerHTML =
          '<i class="ri-information-line"></i>An account unlocks multiplayer. ' +
          'Your decks stay on this device.';
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

    openBtn.addEventListener('click', function () {
      var u = A && A.user && A.user();
      if (u) {
        /* signed in: the button becomes sign-out */
        A.signOut();
        return;
      }
      open();
    });
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
          openBtn.title = 'Signed in as ' + (user.email || user.name) + ' - click to sign out';
          if (av) {
            av.innerHTML = user.avatar
              ? '<img src="' + esc(user.avatar) + '" alt="" />'
              : '<i class="ra ra-player"></i>';
          }
          if (!modal.hidden) close();
        } else {
          if (label) label.textContent = 'Sign in';
          openBtn.title = 'Sign in';
          if (av) av.innerHTML = '<i class="ra ra-player"></i>';
        }
      });
    }

    setMode('in');
    say('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    initGfx();
    if (window.EOL.auth) window.EOL.auth.init();
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
    document.getElementById('btn-back').addEventListener('click', function () {
      show('home');
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
      show('home');
    });
    document.getElementById('btn-shop-back').addEventListener('click', function () {
      show('home');
    });
    // No Leave buttons on these screens - Esc backs out one level.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var v = document.body.dataset.view;
      if (v === 'battle' || v === 'play') show('home');
      else if (v === 'prep' || v === 'draft') show('play');
      else if (v === 'deck' && window.EOL.decks) window.EOL.decks.closeEditor();
      // the shop and the deck picker modal handle Esc themselves
    });
    document.getElementById('btn-result-home').addEventListener('click', function () {
      document.getElementById('result').className = 'result';
      show('home');
    });

    show('home');
    console.log('[EOL] ' + ROSTER.length + ' heroes across ' + FACTIONS.length + ' factions.');
  });
})();
