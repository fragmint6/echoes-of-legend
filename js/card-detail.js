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
  /* THE WHEEL OF SEVEN - the element's prey and its predator, in the
     game's own words: "Fire sears Nature, and bows to Physical." */
  function elementWheelLine(card) {
    var E = window.EOL.engine;
    if (!E || !E.ELEMENT_BEATS || !card || !card.element) return '';
    var beats = E.ELEMENT_BEATS;
    var prey = beats[card.element];
    var predator = null;
    Object.keys(beats).forEach(function (el) {
      if (beats[el] === card.element) predator = el;
    });
    if (!prey && !predator) return '';
    var verbs = {
      Fire: 'sears',
      Nature: 'shades',
      Light: 'dispels',
      Shadow: 'devours',
      Magic: 'contains',
      Lightning: 'strikes',
      Physical: 'smothers',
    };
    return (
      '<div class="cd-wheel">' +
      '<i data-icon-domain="game" class="ra ra-cycle"></i>' +
      '<span>' +
      esc(card.element) +
      ' ' +
      esc(verbs[card.element] || 'answers') +
      ' <b>' +
      esc(prey || '-') +
      '</b>' +
      (predator ? ' · bows to <b>' + esc(predator) + '</b>' : '') +
      '</span></div>'
    );
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
    var rows = [
      {
        k: 'HP',
        key: 'hp',
        icon: 'ra-health',
        base: card.stats.hp,
        now: s ? s.hp : card.stats.hp,
        c: '#ff5f7e',
      },
      {
        k: 'ATK',
        key: 'atk',
        icon: 'ra-sword',
        base: card.stats.atk,
        now: s ? s.atk : card.stats.atk,
        c: '#ffb347',
      },
      {
        k: 'DEF',
        key: 'def',
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
          /* Show the comparison only when this exact stat owns at least
             one booster. Level alone is not a reason to repeat a base value. */
          var moved = !!(s && s.counts && s.counts[r.key] > 0);
          var fmt = function (v) {
            return r.pct ? v + '%' : Math.round(v).toLocaleString();
          };
          /* The VALUE is the first child node of .cd-stat-v, so the
             count-up animation can rewrite it without touching the
             "was N" line beside it. */
          return (
            '<div class="cd-stat" data-stat="' +
            r.key +
            '" style="--sc:' +
            r.c +
            '">' +
            '<i data-icon-domain="game" class="ra ' +
            r.icon +
            '"></i>' +
            '<span class="cd-stat-k">' +
            r.k +
            '</span>' +
            /* The "was N" node is ALWAYS emitted, hidden when the stat
               has not moved. refreshQuiet then only has to toggle and
               retext it - if it were conditional, a boost re-pick
               would have to rebuild the tile, which is exactly the
               re-render this dialog is trying to avoid. */
            '<span class="cd-stat-v' +
            (moved ? ' up' : '') +
            '">' +
            fmt(r.now) +
            '<span class="cd-stat-base"' +
            (moved ? '' : ' hidden') +
            '>was ' +
            fmt(r.base) +
            '</span>' +
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
     Levels 0..3, bought with duplicates (1 / 3 / 5). Every level
     grants a compounding +1.5% skill power, plus +2% of a stat
     chosen FOR THAT LEVEL - so "two ATK and one HP" is a real
     build, and a maxed card is three small decisions instead of one
     toggle. Each level's choice is re-assignable for free outside a
     battle.

     The shard CRAFT button is deliberately absent: buying copies is
     shopping, and it lives in the Shop's Echo Shop tab where you can
     see every legend at once. This panel spends copies; it does not
     sell them.

     Unowned legends get an explanation instead: shards deepen what
     you have, packs are what widen it.
     --------------------------------------------------------- */
  var STAT_LABEL = { atk: 'ATK', def: 'DEF', hp: 'HP' };

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
    var boosts = up.boostsOf(card.id);
    var dupes = up.dupesOf(card.id);
    var maxed = lv >= up.MAX_LEVEL;
    var need = up.costOfNextLevel(card.id);
    var econ2 = window.EOL.econ;
    var coinCost = up.COIN_COST || 0;
    var coins = econ2 ? econ2.coins() : coinCost;
    var hasCopies = up.canLevel(card.id);
    var canAfford = coins >= coinCost;
    /* Both gates, separately, so the button can say WHICH one is
       missing rather than just sitting greyed out. */
    var can = hasCopies && canAfford;

    var pips = '';
    for (var i = 1; i <= up.MAX_LEVEL; i++) {
      pips += '<span class="up-pip' + (i <= lv ? ' on' : '') + '"></span>';
    }

    /* ONE ROW PER PURCHASED LEVEL. The rows are the record of the
       build - three buttons each, the chosen one lit. A level that
       has not been bought is not shown at all: an empty row implies
       a choice the player does not have yet.

       A freshly bought level starts with NOTHING selected (owner
       ruling 2026-08-16): `boosts[i]` is null until the player
       picks, so the row reads as a question rather than as a default
       somebody already answered for them. */
    var rows = boosts
      .map(function (b, idx) {
        var level = idx + 1;
        var btns = ['atk', 'def', 'hp']
          .map(function (k) {
            return (
              '<button type="button" class="up-stat' +
              (b === k ? ' sel' : '') +
              '" data-up-stat="' +
              k +
              '" data-up-level-index="' +
              level +
              '" data-up-card="' +
              esc(card.id) +
              '">' +
              STAT_LABEL[k] +
              '</button>'
            );
          })
          .join('');
        return (
          '<div class="up-row' +
          (b ? '' : ' unset') +
          '">' +
          '<span class="up-row-lbl">Lv' +
          level +
          '</span>' +
          btns +
          '</div>'
        );
      })
      .join('');

    /* What the build currently adds up to, in the player's words. A
       level whose boost is still unchosen contributes nothing yet and
       is called out, so an unspent choice cannot be missed. */
    var counts = up.boostCounts(card.id);
    var parts = [];
    ['atk', 'hp', 'def'].forEach(function (k) {
      if (counts[k]) parts.push(counts[k] + '\u00d7 ' + STAT_LABEL[k]);
    });
    var unset = boosts.filter(function (b) {
      return !b;
    }).length;

    return (
      '<div class="cd-up"' +
      (can ? ' data-ready="1"' : '') +
      '>' +
      '<div class="up-head">' +
      '<span class="up-title"><i class="ri-sparkling-2-fill"></i>Upgrade</span>' +
      '<span class="up-pips">' +
      pips +
      '</span>' +
      '</div>' +
      (maxed
        ? '<p class="up-note up-maxed">Fully upgraded &mdash; further copies pay shards only</p>'
        : /* HELD / NEEDED, always in that shape (owner ruling
             2026-08-16). The old line switched between "Ready to
             level up" and "2 / 3 copies", with a parenthesised
             "(9 banked)" bolted on when the bank ran ahead - three
             different readings of one fact. It is one fact, so it
             gets one format: what you have over what this level
             costs. The numerator is NOT clamped, because "9 / 1" is
             the truth and it is useful - it says the next two levels
             are already paid for. */
          '<p class="up-note' +
          (can ? ' up-ready' : '') +
          '">' +
          '<span class="up-copies"><b>' +
          dupes +
          '</b> / ' +
          need +
          ' copies</span>' +
          (hasCopies
            ? '<span class="up-ready-tag"><i class="ri-sparkling-line"></i>Ready</span>'
            : '<span class="up-toward">toward level ' + (lv + 1) + '</span>') +
          '</p>') +
      /* The container is ALWAYS present, even at level 0 with no rows
         inside it - refreshQuiet appends the new row into it, and a
         container that only appears at level 1 would force a
         re-render on the very first upgrade. */
      '<div class="up-rows"' +
      (lv ? '' : ' hidden') +
      '><span class="up-stats-lbl">Boost per level</span>' +
      rows +
      '</div>' +
      (lv
        ?
          '<p class="cd-up-worth">' +
          (unset
            ? '<b class="up-pick">' +
              unset +
              (unset === 1 ? ' boost' : ' boosts') +
              ' still to choose.</b> '
            : '') +
          (parts.length ? 'This build: <b>' + parts.join(' + ') + '</b>, and e' : 'E') +
          'very number in the skill below is <b>+' +
          Math.round(up.powerAdd(lv) * 100) +
          '</b> higher.</p>'
        : '<p class="cd-up-worth">Every level adds <b>+2%</b> of a stat you pick ' +
          '<b>for that level</b>, and <b>+2 points</b> to every number in the skill ' +
          '(a 50% hit becomes 52%). Mix them however you like &mdash; the choices are ' +
          'free to change outside a battle.</p>') +
      '<div class="up-actions">' +
      (maxed
        ? ''
        : '<button type="button" class="up-btn up-level" data-up-level="' +
          esc(card.id) +
          '"' +
          (can ? '' : ' disabled') +
          '>' +
          (hasCopies && !canAfford ? 'Not enough coins' : 'Level up to ' + (lv + 1)) +
          '<b class="up-coin"><i class="ri-coin-fill"></i>' +
          coinCost.toLocaleString() +
          '</b>' +
          '</button>') +
      (maxed
        ? ''
        : '<a class="up-btn up-shop" href="#" data-up-shop>' +
          '<i class="ri-store-2-line"></i>Need copies?</a>') +
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
    var up = U();
    var lvNow = up ? up.levelOf(card.id) : 0;

    var art = card.art
      ? '<img src="' + esc(card.art) + '" alt="" draggable="false" />'
      : '<i data-icon-domain="game" class="ra ' + esc(card.icon) + '"></i>';

    var isActive = card.ability.type === 'Active';
    var cost =
      isActive && card.ability.cost != null
        ? '<span class="ab-cost cd-energy-cost" title="Energy cost"><i data-icon-domain="game" class="ra ra-lightning-bolt"></i>' +
          '<b>' + card.ability.cost + '</b><span>Energy</span></span>'
        : '';

    host.innerHTML =
      '<div class="cd-hero" data-rarity="' +
      esc(card.rarity) +
      '" style="--fc-primary:' +
      esc(faction.colors.primary) +
      ';--el:' +
      esc(ELEMENT_COLOR[card.element] || '#fff') +
      '">' +
      /* THE SPLIT LAYOUT (2026-08-19): the art owns the FULL height
         of the dialog on the left; every word of information lives
         in the right column. */
      '<div class="cd-art-col">' +
      '<div class="cd-art' +
      (card.art ? ' has-art' : '') +
      (owned ? '' : ' locked') +
      '">' +
      art +
      '</div>' +
      /* Lore belongs to the portrait: it reads as the legend's caption
         and no longer crowds the mechanical information column. */
      (card.lore ? '<p class="cd-lore cd-art-lore">' + esc(card.lore) + '</p>' : '') +
      '</div>' +
      '<div class="cd-info-col">' +
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
      /* THE LEVEL IS ALWAYS STATED for a legend you own, including
         LEVEL 0. "No badge" is ambiguous - it could mean unupgraded
         or it could mean the UI forgot - and a player deciding where
         to spend copies needs the baseline said out loud. */
      (owned
        ? '<span class="cd-tag lv" data-lv="' +
          lvNow +
          '"><i class="ri-sparkling-2-fill"></i>Level ' +
          lvNow +
          ' / ' +
          (up ? up.MAX_LEVEL : 3) +
          '</span>'
        : '<span class="cd-tag locked"><i class="ri-lock-line"></i>Not owned</span>') +
      '</div>' +
      /* THE WHEEL OF SEVEN: the element now means something, so the
         detail says what it means - this legend sears one element and
         bows to another. */
      elementWheelLine(card) +
      '</div>' +
      statTable(card) +
      '<div class="cd-skill' + (isActive ? ' is-active' : ' is-passive') + '" style="--ab-c:' +
      (isActive ? 'var(--r-epic-1, #c07cff)' : '#7fe3c0') +
      '">' +
      '<div class="cd-skill-top">' +
      '<span class="ab-type"><i class="' +
      (isActive ? 'ri-sword-line' : 'ri-repeat-line') +
      '" aria-hidden="true"></i>' +
      esc(card.ability.type) +
      ' skill</span>' +
      cost +
      '</div>' +
      '<h3 class="cd-skill-name">' +
      esc(card.ability.name) +
      '</h3>' +
      '<p class="cd-skill-text">' +
      /* Scaled to THIS copy's level, exactly like the hover overlay -
         the dialog is where a player decides what to buy, so it must
         not be the one place still quoting the stock numbers. */
      rich(
        up && window.EOL.scaleSkillText && owned
          ? window.EOL.scaleSkillText(card.ability.text, card, up.powerAdd(lvNow) * 100)
          : card.ability.text
      ) +
      '</p>' +
      (card.ability.note
        ? '<p class="cd-skill-note">' + rich(card.ability.note) + '</p>'
        : '') +
      '</div>' +
      upgradePanel(card) +
      '</div>' +
      '</div>';
    return true;
  }

  /* =============================================================
     THE LEVEL-UP CEREMONY
     -------------------------------------------------------------
     Nine duplicates is a long grind, and the old reward for
     finishing it was a pip quietly turning on. This is the payoff:

       1. the dialog flashes and kicks, so the thing you clicked
          reacts
       2. a shockwave ring expands out of the panel
       3. shards of light fly outward, seeded deterministically so
          it looks designed rather than random-per-frame
       4. the new level lands as a struck stamp - "LEVEL 2" - over
          the card art
       5. the stat that grew counts UP to its new value

     All of it is one overlay appended to the dialog and removed on
     completion, so nothing survives to leak. Respects both kill
     switches: `body[data-gfx=low]` and prefers-reduced-motion get
     the stamp and the numbers, without the particles.
     ============================================================= */
  var MAX_SHARDS = 18;

  function reducedMotion() {
    if (document.body.dataset.gfx === 'low') return true;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  function celebrate(id, fromLevel, toLevel) {
    var card = $('cd-card');
    var host = $('cd-body');
    if (!card || !host) return;
    var up = U();
    var maxed = up && toLevel >= up.MAX_LEVEL;

    if (window.EOL.audio) window.EOL.audio.ui(maxed ? 'levelmax' : 'levelup');

    /* Remove any ceremony still running - a fast double level-up
       must not stack two overlays. */
    var old = card.querySelector('.lvup');
    if (old) old.remove();

    var fx = document.createElement('div');
    fx.className = 'lvup' + (maxed ? ' maxed' : '');
    fx.setAttribute('aria-hidden', 'true');

    var lean = reducedMotion();
    var bits = '';
    if (!lean) {
      /* Deterministic spray: even angles with a fixed jitter, so the
         burst reads as a designed starburst instead of a clump. */
      for (var i = 0; i < MAX_SHARDS; i++) {
        var ang = (360 / MAX_SHARDS) * i + (i % 3) * 7;
        var dist = 120 + ((i * 37) % 90);
        var delay = ((i * 13) % 90) / 1000;
        bits +=
          '<span class="lvup-shard" style="--ang:' +
          ang +
          'deg;--dist:' +
          dist +
          'px;--d:' +
          delay +
          's"></span>';
      }
    }

    fx.innerHTML =
      (lean ? '' : '<span class="lvup-ring"></span><span class="lvup-ring two"></span>') +
      '<span class="lvup-flash"></span>' +
      '<span class="lvup-bits">' +
      bits +
      '</span>' +
      '<span class="lvup-stamp">' +
      '<b>' +
      (maxed ? 'MAX LEVEL' : 'LEVEL ' + toLevel) +
      '</b>' +
      '<small>' +
      (maxed ? 'fully upgraded' : '+1.5% skill power') +
      '</small>' +
      '</span>';

    card.appendChild(fx);
    /* The panel itself reacts, so the burst is not floating over an
       inert box. */
    card.classList.add('lvup-kick');

    var DURATION = lean ? 1100 : 1700;
    setTimeout(function () {
      card.classList.remove('lvup-kick');
      if (fx.parentNode) fx.remove();
    }, DURATION);

    /* THE NUMBER CLIMBS. Runs after the repaint, against the stat
       tile that actually moved, so the player sees WHICH stat their
       choice bought. */
    setTimeout(function () {
      countUpStats(id, fromLevel);
    }, 60);
  }

  /* Animate the stat tiles from their previous values to the current
     ones. Reads both from EOL.upgrades rather than the DOM, so it
     cannot be confused by a repaint landing mid-flight. */
  function countUpStats(id, fromLevel) {
    var up = U();
    var entry = entryFor(id);
    if (!up || !entry) return;
    var card = entry.card;
    var now = up.statsFor(id, card);
    if (!now) return;

    var prev;
    if (fromLevel == null) {
      /* A BOOST RE-PICK, not a level-up: start from whatever the
         tiles currently show, because the change is sideways and
         there is no "previous level" to compute from. */
      prev = {};
      ['hp', 'atk', 'def'].forEach(function (k) {
        var el = document.querySelector('.cd-stat[data-stat="' + k + '"] .cd-stat-v');
        var txt = el && el.firstChild ? String(el.firstChild.nodeValue) : '';
        var n = parseFloat(txt.replace(/[^\d.]/g, ''));
        prev[k] = isFinite(n) ? n : now[k];
      });
    } else {
      /* What the numbers were one level ago: the same maths with the
         last boost removed. */
      var boosts = up.boostsOf(id).slice(0, fromLevel);
      var was = { atk: 0, def: 0, hp: 0 };
      boosts.forEach(function (b) {
        if (b) was[b]++;
      });
      /* Mirrors statsFor() exactly - if these two ever disagree the
         number animates to a value the card does not actually have. */
      prev = {
        hp: was.hp ? Math.round(card.stats.hp * (1 + up.HP_PER_LEVEL * was.hp)) : card.stats.hp,
        atk: was.atk
          ? Math.round(card.stats.atk * (1 + up.ATK_PER_LEVEL * was.atk))
          : card.stats.atk,
        def: was.def
          ? Math.round(card.stats.def * (1 + up.DEF_PER_LEVEL * was.def) * 10) / 10
          : card.stats.def,
      };
    }

    ['hp', 'atk', 'def'].forEach(function (k) {
      if (prev[k] === now[k]) return;
      var tile = document.querySelector('.cd-stat[data-stat="' + k + '"] .cd-stat-v');
      if (!tile) return;
      tile.classList.add('bump');
      var isPct = k === 'def';
      var from = prev[k];
      var to = now[k];
      var t0 = 0;
      var DUR = 620;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / DUR);
        /* ease-out: fast then settling, which reads as "landing on"
           the number rather than crawling to it */
        var e = 1 - Math.pow(1 - p, 3);
        var v = from + (to - from) * e;
        tile.firstChild.nodeValue = isPct
          ? Math.round(v * 10) / 10 + '%'
          : Math.round(v).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
        else setTimeout(function () {
          tile.classList.remove('bump');
        }, 260);
      }
      requestAnimationFrame(step);
    });
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
    /* The entrance animation belongs to OPENING, not to the card forever.
       Upgrade celebrations temporarily use their own animation; leaving
       mg-rise on .cd-card caused it to restart when that animation ended. */
    modal.classList.remove('opening');
    void modal.offsetWidth;
    modal.classList.add('opening');
    window.setTimeout(function () {
      modal.classList.remove('opening');
    }, 320);
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

  /* LEVEL-UP REFRESH, without the flicker.
     -------------------------------------------------------------
     A full render() during the ceremony tore the dialog down and
     rebuilt it - so the panel visibly blinked out and "reappeared"
     underneath the animation. Only two regions actually change, so
     only those are replaced: the upgrade block, and the level chip
     in the hero. The stat tiles are left ALONE on purpose, because
     countUpStats() is mid-flight animating them to their new values
     and a rebuild would snap them straight to the end. */
  function refreshQuiet(id) {
    var entry = entryFor(id);
    if (!entry) return;
    var body = $('cd-body');
    var up = U();
    if (!body || !up) return;
    var card = entry.card;
    var lv = up.levelOf(id);

    /* PATCH, NEVER REPLACE. Swapping the .cd-up node re-flowed the
       dialog mid-ceremony, which is the "popup refreshes" the owner
       kept seeing: the panel vanished and a new one appeared under
       the animation. Every field below is written in place, so the
       dialog's boxes never move. */
    var panel = body.querySelector('.cd-up');
    if (panel) {
      var boosts = up.boostsOf(id);
      var dupes = up.dupesOf(id);
      var need = up.costOfNextLevel(id);
      var maxed = lv >= up.MAX_LEVEL;
      var econ = window.EOL.econ;
      var coinCost = up.COIN_COST || 0;
      var hasCopies = up.canLevel(id);
      var canAfford = (econ ? econ.coins() : coinCost) >= coinCost;
      var can = hasCopies && canAfford;

      panel.toggleAttribute('data-ready', !!can);

      /* pips */
      var pips = panel.querySelectorAll('.up-pip');
      for (var i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < lv);

      /* the copies line */
      var note = panel.querySelector('.up-note');
      if (note) {
        note.classList.toggle('up-ready', !!can);
        note.classList.toggle('up-maxed', maxed);
        note.innerHTML = maxed
          ? 'Fully upgraded &mdash; further copies pay shards only'
          : '<span class="up-copies"><b>' +
            dupes +
            '</b> / ' +
            need +
            ' copies</span>' +
            (hasCopies
              ? '<span class="up-ready-tag"><i class="ri-sparkling-line"></i>Ready</span>'
              : '<span class="up-toward">toward level ' + (lv + 1) + '</span>');
      }

      /* ONE NEW ROW, appended. The existing rows are untouched, so a
         boost the player already chose cannot flicker or reset. */
      var rowHost = panel.querySelector('.up-rows');
      if (rowHost) {
        if (boosts.length) rowHost.hidden = false;
        var have = rowHost.querySelectorAll('.up-row').length;
        for (var n = have; n < boosts.length; n++) {
          var b = boosts[n];
          var level = n + 1;
          var row = document.createElement('div');
          row.className = 'up-row' + (b ? '' : ' unset');
          row.innerHTML =
            '<span class="up-row-lbl">Lv' +
            level +
            '</span>' +
            ['atk', 'def', 'hp']
              .map(function (k) {
                return (
                  '<button type="button" class="up-stat' +
                  (b === k ? ' sel' : '') +
                  '" data-up-stat="' +
                  k +
                  '" data-up-level-index="' +
                  level +
                  '" data-up-card="' +
                  esc(card.id) +
                  '">' +
                  STAT_LABEL[k] +
                  '</button>'
                );
              })
              .join('');
          rowHost.appendChild(row);
        }
      }

      /* the summary line */
      var worth = panel.querySelector('.cd-up-worth');
      if (worth) {
        var counts = up.boostCounts(id);
        var parts = [];
        ['atk', 'hp', 'def'].forEach(function (k) {
          if (counts[k]) parts.push(counts[k] + '\u00d7 ' + STAT_LABEL[k]);
        });
        var unset = boosts.filter(function (x) {
          return !x;
        }).length;
        worth.innerHTML =
          (unset
            ? '<b class="up-pick">' +
              unset +
              (unset === 1 ? ' boost' : ' boosts') +
              ' still to choose.</b> '
            : '') +
          (parts.length ? 'This build: <b>' + parts.join(' + ') + '</b>, and e' : 'E') +
          'very number in the skill below is <b>+' +
          Math.round(up.powerAdd(lv) * 100) +
          '</b> higher.';
      }

      /* the button */
      var btn = panel.querySelector('.up-level');
      if (btn) {
        if (maxed) {
          btn.remove();
        } else {
          btn.disabled = !can;
          btn.innerHTML =
            (hasCopies && !canAfford ? 'Not enough coins' : 'Level up to ' + (lv + 1)) +
            '<b class="up-coin"><i class="ri-coin-fill"></i>' +
            coinCost.toLocaleString() +
            '</b>';
        }
      }
    }

    /* THE STAT TILES. Their VALUE is animated by countUpStats, but the
       "was N" line and the highlight state are structural and must be
       corrected here - otherwise re-pointing a boost leaves a stale
       "was" beside a number that has since moved somewhere else. */
    var nowStats = up.statsFor(id, card);
    if (nowStats) {
      [
        ['hp', card.stats.hp, nowStats.hp, false],
        ['atk', card.stats.atk, nowStats.atk, false],
        ['def', card.stats.def, nowStats.def, true],
      ].forEach(function (row) {
        var tile = body.querySelector('.cd-stat[data-stat="' + row[0] + '"] .cd-stat-v');
        if (!tile) return;
        var counts = up.boostCounts(id);
        var moved = !!counts[row[0]];
        tile.classList.toggle('up', moved);
        var base = tile.querySelector('.cd-stat-base');
        if (base) {
          base.hidden = !moved;
          base.textContent = 'was ' + (row[3] ? row[1] + '%' : Math.round(row[1]).toLocaleString());
        }
      });
    }

    /* the hero's level chip */
    var chip = body.querySelector('.cd-tag.lv');
    if (chip) {
      chip.dataset.lv = lv;
      chip.innerHTML = '<i class="ri-sparkling-2-fill"></i>Level ' + lv + ' / ' + up.MAX_LEVEL;
    }
    /* the skill text carries the card's own numbers, which just grew */
    var skill = body.querySelector('.cd-skill-text');
    if (skill && window.EOL.scaleSkillText) {
      skill.innerHTML = rich(
        window.EOL.scaleSkillText(card.ability.text, card, up.powerAdd(lv) * 100)
      );
    }
    if (window.EOL.ui && window.EOL.ui.repaintCard) window.EOL.ui.repaintCard(id);
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
      var before = up.levelOf(id);
      /* New levels start on ATK so the upgrade has an immediate, visible
         result. Every per-level button remains freely reassignable. */
      var r = up.levelUp(id, 'atk');
      if (r.ok) {
        /* THE CEREMONY. Played first, then the panel is patched in
           place - a full re-render here is what made the dialog
           blink out and reappear under the animation. */
        celebrate(id, before, r.lv);
        refreshQuiet(id);
      } else {
        if (r.reason === 'dupes') {
          toast('Needs ' + r.cost + ' copies of this legend', 'ri-information-line');
        } else if (r.reason === 'coins') {
          toast('Needs ' + r.coins.toLocaleString() + ' coins', 'ri-coin-fill');
        } else if (r.reason === 'inBattle') {
          toast('Upgrades cannot change during a battle', 'ri-lock-line');
        }
        refresh();
      }
      return;
    }

    /* "Need copies?" - the shard shopfront is in the Shop now. */
    var shop = t.closest('[data-up-shop]');
    if (shop) {
      e.preventDefault();
      close();
      if (window.EOL.ui && window.EOL.ui.show) window.EOL.ui.show('shop');
      var echoTab = document.getElementById('stab-echo');
      if (echoTab) echoTab.click();
      return;
    }

    var st = t.closest('[data-up-stat]');
    if (st) {
      var sid = st.dataset.upCard;
      /* PER-LEVEL. The button knows which level it belongs to, so a
         click re-points that level alone and leaves the rest. */
      var level = parseInt(st.dataset.upLevelIndex, 10);
      var sr = up.setBoost(sid, level, st.dataset.upStat);
      if (!sr.ok && sr.reason === 'inBattle') {
        toast('Boosts cannot change during a battle', 'ri-lock-line');
        return;
      }
      if (sr.ok && !sr.unchanged) {
        if (window.EOL.audio) window.EOL.audio.ui('tap');
        /* Light the clicked button and clear its siblings by hand -
           a re-render would rebuild the dialog under the player's
           cursor for what is a one-class change. */
        var row = st.closest('.up-row');
        if (row) {
          row.classList.remove('unset');
          row.querySelectorAll('.up-stat').forEach(function (b) {
            b.classList.toggle('sel', b === st);
          });
        }
        /* The stats, the summary and the card behind all move with it.
           The tiles animate from whatever they currently READ, since a
           re-pick moves stats sideways rather than up a level. */
        refreshQuiet(sid);
        countUpStats(sid, null);
      }
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
