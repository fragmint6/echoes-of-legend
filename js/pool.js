/* =============================================================
 * Custom draft pool builder
 * -------------------------------------------------------------
 * The 36 legends a private-room draft is dealt from.
 *
 * WHY 36
 *
 *   A draft pool is six cards per role across six roles - see
 *   draftPool() in data/_schema.js - and startDraft() cuts the pool
 *   into three-card packs. So the pool has to supply exactly as many
 *   cards as the packs will consume. 36 is not a round number chosen
 *   for looks; it is the size the draft already expects, which is why
 *   a custom pool can be handed straight to startDraft(opts.pool)
 *   with no other change to the draft code.
 *
 * WHY IT LOOKS LIKE THE DECK EDITOR
 *
 *   It is the same task - choose a set of legends from the roster -
 *   so it uses the same furniture: slots on top, filterable grid
 *   below, click to add or remove. Both surfaces call the SHARED
 *   builders (EOL.ui.buildCard, EOL.ui.buildDropdown), so a card
 *   renders identically in both and there is no second card template
 *   to keep in step.
 *
 * ONLY THE LEADER
 *
 *   Every other room setting is the party leader's to choose, and the
 *   pool is no different. The button is hidden for a guest rather
 *   than disabled: a control that can never do anything in this state
 *   is noise. The server enforces it regardless - set_room_settings
 *   carries `and leader = me`.
 * ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var POOL_SIZE = 36;

  function $(id) {
    return document.getElementById(id);
  }

  var chosen = []; // card ids, in the order they were picked
  var open = false;
  var built = false;
  var onCommit = null;
  var filter = { faction: 'all', rarity: 'all', role: 'all', q: '' };

  function roster() {
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      (f.cards || []).forEach(function (c) {
        out.push({ card: c, faction: f });
      });
    });
    return out;
  }

  var BY_ID = null;
  function byId() {
    if (!BY_ID) {
      BY_ID = {};
      roster().forEach(function (e) {
        BY_ID[e.card.id] = e;
      });
    }
    return BY_ID;
  }

  function has(id) {
    return chosen.indexOf(id) !== -1;
  }

  function toggle(id) {
    var i = chosen.indexOf(id);
    if (i !== -1) {
      chosen.splice(i, 1);
    } else {
      if (chosen.length >= POOL_SIZE) {
        note('That is all 36. Remove one to swap it out.');
        return;
      }
      chosen.push(id);
    }
    paint();
  }

  function note(msg) {
    var el = $('pool-note');
    if (el) el.textContent = msg || '';
  }

  /* ---------------------------------------------------------
     painting
     --------------------------------------------------------- */
  function paintSlots() {
    var host = $('pool-slots');
    if (!host) return;
    var dict = byId();
    /* Diff by occupant, like the deck tray: only a slot whose card
       actually changed is rebuilt, so adding one card does not replay
       the entrance animation on the other thirty-five. */
    for (var s = 0; s < POOL_SIZE; s++) {
      var id = chosen[s] || null;
      var key = id || 'empty-' + s;
      var cell = host.children[s];
      if (cell && cell.dataset.slotkey === key) continue;
      var fresh = document.createElement('div');
      fresh.dataset.slotkey = key;
      if (id && dict[id]) {
        var e = dict[id];
        fresh.className = 'pool-slot filled rarity-' + e.card.rarity;
        fresh.style.setProperty('--fc-primary', e.faction.colors.primary);
        fresh.title = e.card.name;
        var ico = document.createElement('i');
        ico.setAttribute('data-icon-domain', 'game');
        ico.className = 'ra ' + e.card.icon;
        fresh.appendChild(ico);
        (function (cid) {
          fresh.addEventListener('click', function () {
            toggle(cid);
          });
        })(id);
      } else {
        fresh.className = 'pool-slot';
      }
      if (cell) host.replaceChild(fresh, cell);
      else host.appendChild(fresh);
    }
    while (host.children.length > POOL_SIZE) host.removeChild(host.lastChild);
  }

  function paintCount() {
    var c = $('pool-count');
    if (c) c.textContent = String(chosen.length);
    var done = $('pool-done');
    /* Exactly 36 or nothing: a partial pool cannot be dealt into
       twelve three-card packs, and silently topping it up would mean
       the leader did not choose what they think they chose. */
    if (done) done.disabled = chosen.length !== POOL_SIZE;
  }

  function paintGrid() {
    var grid = $('pool-grid');
    if (!grid) return;
    Array.prototype.forEach.call(grid.children, function (el) {
      el.classList.toggle('picked', has(el.dataset.id));
    });
  }

  function paint() {
    paintSlots();
    paintCount();
    paintGrid();
    if (chosen.length === POOL_SIZE) note('Ready.');
    else note('');
  }

  function applyFilter() {
    var grid = $('pool-grid');
    if (!grid) return;
    var any = 0;
    Array.prototype.forEach.call(grid.children, function (el) {
      var show =
        (filter.faction === 'all' || el.dataset.faction === filter.faction) &&
        (filter.rarity === 'all' || el.dataset.rarity === filter.rarity) &&
        (filter.role === 'all' || el.dataset.role === filter.role) &&
        (filter.q === '' || el.dataset.name.indexOf(filter.q) !== -1);
      el.style.display = show ? '' : 'none';
      if (show) any++;
    });
    var empty = $('pool-empty');
    if (empty) empty.classList.toggle('show', any === 0);
  }

  /* ---------------------------------------------------------
     build once
     --------------------------------------------------------- */
  function buildGrid() {
    var grid = $('pool-grid');
    if (!grid || !window.EOL.ui || !window.EOL.ui.buildCard) return;
    grid.textContent = '';
    roster().forEach(function (e, i) {
      /* markUnowned is deliberately OFF. A draft pool is not your
         collection - the draft deals these cards to both players, so
         whether you happen to own one is irrelevant and greying it
         would imply a restriction that does not exist. */
      var el = window.EOL.ui.buildCard(e.card, e.faction, i, {});
      el.addEventListener('click', function () {
        toggle(e.card.id);
      });
      grid.appendChild(el);
    });
  }

  function buildFilters() {
    var host = $('pool-filters');
    if (!host || !window.EOL.ui || !window.EOL.ui.buildDropdown) return;

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
        icon: 'ra ' + ((window.EOL.ui.ROLE_ICON && window.EOL.ui.ROLE_ICON[r]) || 'ra-player'),
      });
    });

    window.EOL.ui.buildDropdown(host, 'Faction', factionOpts, function (v) {
      filter.faction = v;
      applyFilter();
    });
    window.EOL.ui.buildDropdown(host, 'Rarity', rarityOpts, function (v) {
      filter.rarity = v;
      applyFilter();
    });
    window.EOL.ui.buildDropdown(host, 'Role', roleOpts, function (v) {
      filter.role = v;
      applyFilter();
    });

    var s = $('pool-search');
    if (s)
      s.addEventListener('input', function () {
        filter.q = s.value.trim().toLowerCase();
        applyFilter();
      });
    var reset = $('pool-reset');
    if (reset)
      reset.addEventListener('click', function () {
        filter = { faction: 'all', rarity: 'all', role: 'all', q: '' };
        if (s) s.value = '';
        /* Same reset the deck editor performs: clicking each
           dropdown's first option is what actually re-labels the
           control, since the label is owned by buildDropdown. */
        host.querySelectorAll('.dd').forEach(function (dd) {
          dd.classList.remove('is-filtered');
          var first = dd.querySelector('.dd-opt');
          if (first) first.click();
        });
        applyFilter();
      });
  }

  /* Fill the empty slots at random, respecting what is already
     chosen. Uses the same role spread the automatic pool uses, so a
     half-built pool topped up this way still drafts sensibly rather
     than handing out nine Medics. */
  function fillRandom() {
    var dict = byId();
    var need = POOL_SIZE - chosen.length;
    if (need <= 0) return;

    var byRole = {};
    roster().forEach(function (e) {
      if (has(e.card.id)) return;
      (byRole[e.card.role] = byRole[e.card.role] || []).push(e.card.id);
    });
    /* how many of each role we already hold */
    var held = {};
    chosen.forEach(function (id) {
      var e = dict[id];
      if (e) held[e.card.role] = (held[e.card.role] || 0) + 1;
    });

    var roles = Object.keys(byRole);
    var perRole = Math.floor(POOL_SIZE / (roles.length || 1)); // 6
    roles.forEach(function (r) {
      var want = Math.max(0, perRole - (held[r] || 0));
      var bag = byRole[r].slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = bag[i];
        bag[i] = bag[j];
        bag[j] = t;
      }
      bag.slice(0, want).forEach(function (id) {
        if (chosen.length < POOL_SIZE) chosen.push(id);
      });
    });

    /* Rounding, or a role with too few cards, can leave a gap. Top up
       from whatever is left rather than stopping short of 36. */
    if (chosen.length < POOL_SIZE) {
      var rest = roster()
        .map(function (e) {
          return e.card.id;
        })
        .filter(function (id) {
          return !has(id);
        });
      for (var k = rest.length - 1; k > 0; k--) {
        var m = Math.floor(Math.random() * (k + 1));
        var tmp = rest[k];
        rest[k] = rest[m];
        rest[m] = tmp;
      }
      while (chosen.length < POOL_SIZE && rest.length) chosen.push(rest.shift());
    }
    paint();
  }

  function show(on, opts) {
    var m = $('pool-modal');
    if (!m) return;
    open = !!on;
    m.hidden = !on;
    if (!on) return;

    opts = opts || {};
    onCommit = opts.onCommit || null;
    chosen = (opts.pool || []).filter(function (id) {
      return !!byId()[id];
    });

    if (!built) {
      built = true;
      buildGrid();
      buildFilters();
    }
    applyFilter();
    paint();
  }

  function init() {
    var close = $('pool-close');
    if (close) close.addEventListener('click', function () { show(false); });
    var scrim = $('pool-scrim');
    if (scrim) scrim.addEventListener('click', function () { show(false); });
    var fill = $('pool-fill');
    if (fill) fill.addEventListener('click', fillRandom);
    var clear = $('pool-clear');
    if (clear)
      clear.addEventListener('click', function () {
        chosen = [];
        paint();
      });
    var done = $('pool-done');
    if (done)
      done.addEventListener('click', function () {
        if (chosen.length !== POOL_SIZE) return;
        if (onCommit) onCommit(chosen.slice());
        show(false);
      });
    /* CLAIM THE KEY, do not merely react to it. This listener runs
       before app.js's global "Escape backs out a view" handler, so
       closing quietly would leave that handler looking at a screen
       with nothing open - and it would back out of the room too.
       Stopping propagation is what makes Escape mean "close the
       builder" and only that. Capture phase for the same reason: the
       topmost thing decides first. */
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        show(false);
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.EOL.poolBuilder = {
    show: show,
    SIZE: POOL_SIZE,
    current: function () {
      return chosen.slice();
    },
  };
})();
