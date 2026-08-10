/* =============================================================
   Echoes of Legend - Shop & Pack Opening (REAL since 2026-08-10)
   -------------------------------------------------------------
   Three pack tiers, priced in the one wallet the campaign and the
   matches pay into. Packs contain ONLY unowned cards (owner ruling:
   every pack is pure progress; duplicates may feed an awakening
   system someday). Cards are GRANTED at roll time, before the
   ceremony plays - a mid-animation refresh can never eat a card.
   Huaxia is not obtainable (held for Chapter 2); everything else
   is on the shelf from day one - the campaign's progression law is
   a road rule, not a shop rule.
   rollPack() stays pure (seedable rng) so odds are unit-testable;
   the opening sequence is the same state machine as ever, with a
   fast mode for tests.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  /* THE SHELF (owner ruling 2026-08-10): three tiers - a budget
     taste, the standard five, and a top shelf that hunts crowns. */
  var PACKS = {
    trio: {
      key: 'trio',
      name: 'Trio Pack',
      price: 120,
      size: 3,
      odds: [
        ['common', 50],
        ['rare', 34],
        ['epic', 13],
        ['legendary', 3],
      ],
      final: null, // no guarantee - it is the budget shelf
    },
    echo: {
      key: 'echo',
      name: 'Echoes Pack',
      price: 300,
      size: 5,
      odds: [
        ['common', 45],
        ['rare', 35],
        ['epic', 16],
        ['legendary', 4],
      ],
      final: [
        ['epic', 80],
        ['legendary', 20],
      ],
    },
    crown: {
      key: 'crown',
      name: 'Crown Pack',
      price: 700,
      size: 5,
      odds: [
        ['common', 20],
        ['rare', 38],
        ['epic', 30],
        ['legendary', 12],
      ],
      final: [
        ['epic', 55],
        ['legendary', 45],
      ],
    },
  };

  /* Sequence timings (ms) - cinematic pacing; tests set FAST mode. */
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
  /* Pools are built from the UNOWNED obtainable roster only - every
     card in every pack is new. `entries` is injectable for tests. */
  function poolByRarity(entries) {
    var pools = { common: [], rare: [], epic: [], legendary: [] };
    var list =
      entries ||
      (window.EOL.econ
        ? window.EOL.econ.unownedEntries()
        : (function () {
            var out = [];
            (window.EOL.factions || []).forEach(function (f) {
              f.cards.forEach(function (c) {
                out.push({ card: c, faction: f });
              });
            });
            return out;
          })());
    list.forEach(function (e) {
      (pools[e.card.rarity] = pools[e.card.rarity] || []).push(e);
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

  /* Returns [{card, faction}], at most pack.size, never a duplicate,
     never an owned card. Pure - no state touched. */
  function rollPack(rng, pack, entries) {
    rng = rng || Math.random;
    pack = pack || PACKS.echo;
    var pools = poolByRarity(entries);
    function pickFrom(rarity) {
      var order =
        rarity === 'common'
          ? ['common', 'rare', 'epic', 'legendary']
          : [rarity, 'epic', 'rare', 'legendary', 'common'];
      for (var i = 0; i < order.length; i++) {
        var p = pools[order[i]];
        if (p && p.length) return p.splice(Math.floor(rng() * p.length), 1)[0];
      }
      return null;
    }
    var out = [];
    var main = pack.final ? pack.size - 1 : pack.size;
    for (var i = 0; i < main; i++) out.push(pickFrom(rollRarity(pack.odds, rng)));
    if (pack.final) out.push(pickFrom(rollRarity(pack.final, rng)));
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

  var currentPack = null;

  /* 1 - the PURCHASE: price gated, cards granted at roll time */
  function begin(packKey) {
    var pack = PACKS[packKey] || currentPack || PACKS.echo;
    var econ = window.EOL.econ;
    if (!econ) return;
    if (!econ.unownedEntries().length) {
      if (window.EOL.ui && window.EOL.ui.toast)
        window.EOL.ui.toast('Your collection is complete - the Road has nothing left to sell', 'ra-crown');
      return;
    }
    if (!econ.spend(pack.price)) {
      if (window.EOL.ui && window.EOL.ui.toast)
        window.EOL.ui.toast('Not enough coins - the Road pays in gates and wars', 'ri-coin-fill');
      return;
    }
    currentPack = pack;
    results = rollPack(Math.random, pack);
    /* GRANT NOW: the ceremony is theater, the ledger is truth */
    econ.grant(
      results.map(function (e) {
        return e.card.id;
      })
    );
    paintShop();
    /* the pack on the table wears the wrapper you paid for */
    document.querySelectorAll('#po-pack .pk-host').forEach(function (h) {
      h.dataset.pack = pack.key;
      buildPackFace(h);
    });
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

  /* 2 - the click: shake builds, then the pack bursts */
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

  /* 3 - cards fly out and flip over one by one */
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
      '<i class="ra ra-crown"></i><span>Legendary - ' + window.EOL.ui.esc(name) + '</span>';
    b.classList.add('show');
    later(function () {
      b.classList.remove('show');
    }, dur('legendHold'));
  }

  /* 4 - fan settles, actions appear */
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
  /* The pack art is REAL pixel art since 2026-08-10 (one wrapper
     painting per tier in assets/packs/). One builder still paints
     every pack face (shop product, opening pack, and both burst
     halves) from the same markup so they always line up; the host's
     data-pack picks the wrapper, and begin() restamps the opening
     hosts so the pack you tear is the pack you bought. */
  var PACK_ART = {
    trio: 'assets/packs/trio.png',
    echo: 'assets/packs/echo.png',
    crown: 'assets/packs/crown.png',
  };
  function buildPackFace(host) {
    if (!host) return;
    var key = PACK_ART[host.dataset.pack] ? host.dataset.pack : 'echo';
    var face = host.querySelector('.pk-face');
    if (!face) {
      face = document.createElement('div');
      face.className = 'pk-face';
      face.innerHTML =
        '<img class="pk-art" alt="" draggable="false">' +
        '<div class="pk-holo"></div>' +
        '<div class="pk-wordmark"><span></span><i class="ra ra-crossed-swords"></i><span>Pack</span></div>';
      host.insertBefore(face, host.firstChild);
    }
    face.querySelector('.pk-art').src = PACK_ART[key];
    face.querySelector('.pk-wordmark span').textContent = PACKS[key].name.split(' ')[0];
  }

  /* the shelf: prices, balance, and what is left to pull.
     The coin is ri-coin-fill (remixicon 4.5.0, verified in the CDN
     sheet) - currency stopped borrowing the energy bolt, and the
     owner ruled AGAINST a generated sprite: library icon only. */
  var COIN_IMG = '<i class="ri-coin-fill coin-ico"></i>';
  function paintShop() {
    var econ = window.EOL.econ;
    if (!econ) return;
    var w = el('shop-wallet');
    if (w) w.innerHTML = COIN_IMG + econ.coins().toLocaleString();
    var left = econ.unownedEntries().length;
    var prog = el('shop-progress');
    if (prog)
      prog.textContent =
        left === 0
          ? 'Collection complete - every echo answers to you'
          : econ.ownedCount() + ' / ' + econ.obtainableEntries().length + ' legends collected';
    document.querySelectorAll('.buy-pack').forEach(function (btn) {
      var pack = PACKS[btn.dataset.pack];
      if (!pack) return;
      var can = left > 0 && econ.coins() >= pack.price;
      btn.disabled = !can;
      btn.innerHTML =
        left === 0
          ? '<i class="ri-check-line"></i><span>Complete</span>'
          : COIN_IMG + '<span>' + pack.price + '</span>';
    });
  }

  function mount() {
    document.querySelectorAll('.pk-host').forEach(buildPackFace);

    document.querySelectorAll('.buy-pack').forEach(function (btn) {
      btn.addEventListener('click', function () {
        begin(btn.dataset.pack);
      });
    });
    el('po-again').addEventListener('click', function () {
      begin(currentPack ? currentPack.key : 'echo');
    });
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
    document.addEventListener('eol:coins', paintShop);
    document.addEventListener('eol:owned', paintShop);
    document.addEventListener('eol:view', function (ev) {
      if (ev.detail === 'shop') paintShop();
    });
    paintShop();
  }

  document.addEventListener('DOMContentLoaded', mount);

  window.EOL.shop = {
    PACKS: PACKS,
    rollPack: rollPack,
    rollRarity: rollRarity,
    begin: begin,
    paintShop: paintShop,
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
