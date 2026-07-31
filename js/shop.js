/* =============================================================
   Echoes of Legend — Shop & Pack Opening
   Preview only: the player already owns every card, so nothing
   revealed here is ever stored. rollPack() is pure (seedable rng)
   so the odds can be unit-tested; the opening sequence is a small
   state machine driven by setTimeout, with a fast mode for tests.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var PACK_SIZE = 5;
  /* Card odds, slots 1-4. The 5th card is always Epic or better. */
  var ODDS = [
    ['common', 45],
    ['rare', 35],
    ['epic', 16],
    ['legendary', 4],
  ];
  var FINAL_ODDS = [
    ['epic', 80],
    ['legendary', 20],
  ];

  /* Sequence timings (ms) — cinematic pacing; tests set FAST mode. */
  var DUR = {
    introDrop: 950, // pack falls in
    hintDelay: 650, // "click to open" fades up after the drop
    charge: 700, // shake + glow build-up
    burst: 620, // flash + halves + particles
    cardStagger: 300, // delay between reveals
    cardFlipLag: 230, // back shown, then flip
    settle: 550, // pause before summary
    legendHold: 1700, // legendary banner on screen
  };
  var FAST = false;
  function dur(k) {
    return FAST ? 0 : DUR[k];
  }

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------------- pack contents (pure) ---------------- */
  function poolByRarity() {
    var pools = { common: [], rare: [], epic: [], legendary: [] };
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        (pools[c.rarity] = pools[c.rarity] || []).push({ card: c, faction: f });
      });
    });
    return pools;
  }

  function rollRarity(table, rng) {
    var total = 0;
    table.forEach(function (row) {
      total += row[1];
    });
    var r = rng() * total;
    for (var i = 0; i < table.length; i++) {
      r -= table[i][1];
      if (r < 0) return table[i][0];
    }
    return table[table.length - 1][0];
  }

  /* Returns [{card, faction}] of length PACK_SIZE. No state touched. */
  function rollPack(rng) {
    rng = rng || Math.random;
    var pools = poolByRarity();
    function pickFrom(rarity) {
      /* buckets are never empty with the current roster, but fall back
         gracefully if one ever is */
      var order =
        rarity === 'common'
          ? ['common', 'rare', 'epic', 'legendary']
          : [rarity, 'epic', 'rare', 'legendary', 'common'];
      for (var i = 0; i < order.length; i++) {
        var p = pools[order[i]];
        if (p && p.length) return p[Math.floor(rng() * p.length)];
      }
      return null;
    }
    var out = [];
    for (var i = 0; i < PACK_SIZE - 1; i++) out.push(pickFrom(rollRarity(ODDS, rng)));
    out.push(pickFrom(rollRarity(FINAL_ODDS, rng)));
    return out.filter(Boolean);
  }

  /* ---------------- opening state machine ---------------- */
  var state = 'idle'; // idle | intro | await | charging | burst | reveal | summary
  var results = [];
  var timers = [];
  var revealed = 0;

  function later(fn, ms) {
    timers.push(
      setTimeout(
        function () {
          fn();
        },
        FAST ? 0 : ms
      )
    );
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function el(id) {
    return document.getElementById(id);
  }

  function resetStage() {
    clearTimers();
    revealed = 0;
    var overlay = el('pack-opening');
    overlay.classList.remove('shake');
    el('po-cards').innerHTML = '';
    el('po-particles').innerHTML = '';
    el('po-summary').classList.remove('show');
    el('po-flash').classList.remove('on');
    el('po-legend-banner').className = 'po-legend-banner';
    el('po-hint').classList.remove('show');
    var pack = el('po-pack');
    pack.className = 'po-pack';
    var wrap = el('po-packwrap');
    wrap.classList.remove('gone');
  }

  /* 1 — pack drops in and invites the click */
  function begin() {
    results = rollPack();
    resetStage();
    state = 'intro';
    var overlay = el('pack-opening');
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pack-open');
    el('po-skip').classList.add('show');

    var pack = el('po-pack');
    // restart the drop animation
    void pack.offsetWidth;
    pack.classList.add('drop');
    later(function () {
      if (state !== 'intro') return;
      state = 'await';
      pack.classList.remove('drop');
      pack.classList.add('idle');
      el('po-hint').classList.add('show');
    }, dur('introDrop'));
  }

  /* 2 — the click: shake builds, then the pack bursts */
  function charge() {
    if (state !== 'await') return;
    state = 'charging';
    el('po-hint').classList.remove('show');
    var pack = el('po-pack');
    pack.classList.remove('idle');
    pack.classList.add('charging');
    later(burst, dur('charge'));
  }

  function burst() {
    if (state !== 'charging') return;
    state = 'burst';
    var overlay = el('pack-opening');
    var pack = el('po-pack');
    pack.classList.remove('charging');
    pack.classList.add('burst');
    overlay.classList.add('shake');
    el('po-flash').classList.add('on');
    spawnParticles();
    later(function () {
      el('po-flash').classList.remove('on');
      el('po-packwrap').classList.add('gone');
      overlay.classList.remove('shake');
      revealNext();
    }, dur('burst'));
  }

  /* 3 — cards fly out and flip over one by one */
  function revealNext() {
    state = 'reveal';
    if (revealed >= results.length) {
      later(summary, dur('settle'));
      return;
    }
    var entry = results[revealed];
    var i = revealed;
    revealed++;
    var flip = buildFlip(entry, i);
    el('po-cards').appendChild(flip);
    later(function () {
      flip.classList.add('flipped');
      flip.classList.add('r-' + entry.card.rarity);
      if (entry.card.rarity === 'legendary') legendBanner(entry.card.name);
      later(revealNext, dur('cardStagger'));
    }, dur('cardFlipLag'));
  }

  function buildFlip(entry, i) {
    var flip = document.createElement('div');
    flip.className = 'po-flip';
    flip.style.setProperty('--i', i - (results.length - 1) / 2);
    flip.innerHTML =
      '<div class="po-flip-inner">' +
      '<div class="po-back"><div class="po-back-ring"></div>' +
      '<i class="ra ra-crossed-swords"></i></div>' +
      '<div class="po-front"></div>' +
      '</div>';
    var front = flip.querySelector('.po-front');
    front.appendChild(window.EOL.ui.buildCard(entry.card, entry.faction, i));
    return flip;
  }

  function legendBanner(name) {
    var b = el('po-legend-banner');
    b.innerHTML =
      '<i class="ra ra-crown"></i><span>Legendary &mdash; ' + window.EOL.ui.esc(name) + '</span>';
    b.classList.add('show');
    later(function () {
      b.classList.remove('show');
    }, dur('legendHold'));
  }

  /* 4 — fan settles, actions appear */
  function summary() {
    state = 'summary';
    el('po-cards').classList.add('settled');
    el('po-summary').classList.add('show');
    el('po-skip').classList.remove('show');
  }

  function close() {
    clearTimers();
    state = 'idle';
    results = [];
    var overlay = el('pack-opening');
    overlay.classList.remove('on');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pack-open');
    el('po-cards').classList.remove('settled');
    el('po-summary').classList.remove('show');
    el('po-cards').innerHTML = '';
    el('po-particles').innerHTML = '';
    el('po-packwrap').classList.remove('gone');
    el('po-pack').className = 'po-pack';
    el('po-hint').classList.remove('show');
    el('po-legend-banner').className = 'po-legend-banner';
    el('po-skip').classList.remove('show');
  }

  /* Skip: jump every not-yet-shown card straight to its flipped state,
     then land on the summary without the remaining timeline. */
  function skip() {
    if (state === 'summary') {
      close();
      return;
    }
    if (state === 'idle' || state === 'summary') return;
    clearTimers();
    el('po-packwrap').classList.add('gone');
    el('po-flash').classList.remove('on');
    el('po-legend-banner').className = 'po-legend-banner';
    el('pack-opening').classList.remove('shake');
    el('po-hint').classList.remove('show');
    for (var i = revealed; i < results.length; i++) {
      var flip = buildFlip(results[i], i);
      flip.classList.add('flipped', 'no-anim');
      flip.classList.add('r-' + results[i].card.rarity);
      el('po-cards').appendChild(flip);
    }
    revealed = results.length;
    summary();
  }

  /* ---------------- particles ---------------- */
  function spawnParticles() {
    var host = el('po-particles');
    if (!host) return;
    host.innerHTML = '';
    var colors = ['#fff7e0', '#ffd977', '#ffb347', '#ffe066', '#ffffff', '#c07cff', '#63d7ff'];
    var n = 52;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span');
      var ang = Math.random() * Math.PI * 2;
      var dist = 130 + Math.random() * 420;
      s.className = 'po-p';
      s.style.setProperty('--tx', (Math.cos(ang) * dist).toFixed(0) + 'px');
      s.style.setProperty('--ty', (Math.sin(ang) * dist * 0.8).toFixed(0) + 'px');
      s.style.setProperty('--sz', (2.5 + Math.random() * 5).toFixed(1) + 'px');
      s.style.setProperty('--c', colors[i % colors.length]);
      s.style.setProperty('--t', (0.65 + Math.random() * 0.8).toFixed(2) + 's');
      s.style.animationDelay = (Math.random() * 130).toFixed(0) + 'ms';
      host.appendChild(s);
    }
  }

  /* ---------------- boot ---------------- */
  /* The pack art is pure CSS/DOM — one builder paints every pack face
     (shop product, opening pack, and both burst halves) from the same
     markup so they always line up. */
  function buildPackFace(host) {
    if (!host || host.querySelector('.pk-face')) return;
    var face = document.createElement('div');
    face.className = 'pk-face';
    face.innerHTML =
      '<div class="pk-rays"></div>' +
      '<div class="pk-holo"></div>' +
      '<div class="pk-band top"></div><div class="pk-band bot"></div>' +
      '<div class="pk-frame"></div>' +
      '<span class="pk-corner tl"></span><span class="pk-corner tr"></span>' +
      '<span class="pk-corner bl"></span><span class="pk-corner br"></span>' +
      '<div class="pk-emblem">' +
      '<div class="pk-ring outer"></div>' +
      '<div class="pk-ring inner"></div>' +
      '<i class="ra ra-crossed-swords"></i>' +
      '</div>' +
      '<div class="pk-wordmark"><span>Echoes</span><i class="ra ra-diamond"></i><span>Pack</span></div>';
    host.insertBefore(face, host.firstChild);
  }

  function mount() {
    document.querySelectorAll('.pk-host').forEach(buildPackFace);

    var odds = el('product-odds');
    if (odds) {
      odds.innerHTML =
        '<span><b>Card odds</b> Common 45% <i class="ra ra-diamond tip-dot"></i> Rare 35% ' +
        '<i class="ra ra-diamond tip-dot"></i> Epic 16% <i class="ra ra-diamond tip-dot"></i> ' +
        'Legendary 4%</span>' +
        '<span><b>Final card</b> Epic 80% <i class="ra ra-diamond tip-dot"></i> Legendary 20%</span>';
    }

    el('btn-open-pack').addEventListener('click', begin);
    el('po-again').addEventListener('click', begin);
    el('po-done').addEventListener('click', close);
    el('po-skip').addEventListener('click', skip);
    el('po-pack').addEventListener('click', charge);
    el('po-pack').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        charge();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.body.dataset.view !== 'shop') return;
      if (!el('pack-opening').classList.contains('on')) return;
      if (state === 'summary') close();
      else skip();
    });
  }

  document.addEventListener('DOMContentLoaded', mount);

  window.EOL.shop = {
    PACK_SIZE: PACK_SIZE,
    ODDS: ODDS,
    FINAL_ODDS: FINAL_ODDS,
    rollPack: rollPack,
    rollRarity: rollRarity,
    begin: begin,
    charge: charge,
    skip: skip,
    close: close,
    state: function () {
      return state;
    },
    results: function () {
      return results.slice();
    },
    setFast: function (v) {
      FAST = !!v;
    }, // test hook: zero-duration timers
  };
})();

