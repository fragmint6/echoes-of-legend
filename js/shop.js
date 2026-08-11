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

  /* THE SHELF (owner rulings 2026-08-10): three tiers - a budget
     taste, the standard five, and a top shelf heavy with Epics.
     THE CROWN LAW, same day: NO LEGENDARY IN ANY PACK, ever. The
     future may sell coins, and the day it does, the only thing money
     can speed up is the shelf of echoes - crowns are earned on the
     Road. Epic is the ceiling of every table below. */
  var PACKS = {
    trio: {
      key: 'trio',
      name: 'Trio Pack',
      price: 120,
      size: 3,
      odds: [
        ['common', 50],
        ['rare', 35],
        ['epic', 15],
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
        ['epic', 20],
      ],
      final: [['epic', 100]],
    },
    crown: {
      key: 'crown',
      name: 'Crown Pack',
      price: 700,
      size: 5,
      odds: [
        ['common', 15],
        ['rare', 45],
        ['epic', 40],
      ],
      final: [['epic', 100]],
    },
    /* THE LEGEND PACK - never on the shelf, never priced. The Road
       hands one over after certain gates: a single-card ceremony
       carrying that faction's one legendary. begin() refuses it;
       only campaign.js can open it, through openLegendPack(). */
    legend: {
      key: 'legend',
      name: 'Legend Pack',
      price: 0,
      size: 1,
      odds: [],
      final: null,
    },
  };

  /* Sequence timings (ms) - cinematic pacing; tests set FAST mode.
     THE DEAL (reworked 2026-08-10, owner: 'too sporadic'): the old
     reveal appended cards one by one into a CENTERED flex row, so
     every arrival shoved the whole fan sideways while the previous
     card was still flipping - three animations fighting. Now it is
     two calm phases: all slots reserved at burst (the row never
     reflows), backs DEALT from the pack's spot left to right on a
     fixed rhythm, then FLIPPED one at a time. */
  var DUR = {
    introDrop: 950, // pack falls in
    hintDelay: 650, // "click to open" fades up after the drop
    charge: 700, // shake + glow build-up
    burst: 620, // flash + halves + particles
    dealStagger: 110, // the dealer's rhythm: flick, flick, flick
    dealDur: 340, // one card's flight from the deck to its slot
    dealBeat: 220, // breath between the deal and the first flip
    flipStagger: 430, // one flip fully lands before the next begins
    legendBeat: 900, // a legendary holds the table a moment longer
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
  /* Pools are built from the PACKABLE roster only - unowned AND below
     legendary (the Crown Law). `entries` is injectable for tests, and
     the legendary filter applies even then: no injected pool can put
     a crown in a wrapper. */
  function poolByRarity(entries) {
    var pools = { common: [], rare: [], epic: [] };
    var list =
      entries ||
      (window.EOL.econ
        ? window.EOL.econ.packableEntries()
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
      if (e.card.rarity === 'legendary') return;
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
        rarity === 'common' ? ['common', 'rare', 'epic'] : [rarity, 'epic', 'rare', 'common'];
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
  var currentAwardMeta = null;

  function syncOpenAnother() {
    var again = el('po-again');
    if (!again) return;
    var econ = window.EOL.econ;
    var pack = currentPack;
    var canBuy =
      !!pack &&
      pack.price > 0 &&
      ['trio', 'echo', 'crown'].indexOf(pack.key) >= 0 &&
      !!econ &&
      econ.coins() >= pack.price &&
      econ.packableEntries().length > 0;
    again.hidden = !canBuy;
  }

  /* 1 - the PURCHASE: price gated, cards granted at roll time */
  function begin(packKey) {
    var pack = PACKS[packKey] || currentPack || PACKS.echo;
    var econ = window.EOL.econ;
    if (!econ) return;
    /* the Legend Pack is the Road's to give, never the shelf's to sell */
    if (pack.key === 'legend') return;
    if (!econ.packableEntries().length) {
      if (window.EOL.audio) window.EOL.audio.ui('deny');
      if (window.EOL.ui && window.EOL.ui.toast)
        window.EOL.ui.toast(
          'Every echo the shelf sells is yours - the legends left walk the Road',
          'ri-checkbox-circle-line'
        );
      return;
    }
    if (!econ.spend(pack.price)) {
      if (window.EOL.audio) window.EOL.audio.ui('deny');
      if (window.EOL.ui && window.EOL.ui.toast)
        window.EOL.ui.toast('Not enough coins - the Road pays in gates and wars', 'ri-coin-fill');
      return;
    }
    if (window.EOL.audio) window.EOL.audio.pack('buy');
    currentAwardMeta = null;
    results = rollPack(Math.random, pack);
    /* GRANT NOW: the ceremony is theater, the ledger is truth */
    econ.grant(
      results.map(function (e) {
        return e.card.id;
      })
    );
    startCeremony(pack);
  }

  /* THE LEGEND PACK: campaign.js opens this after a gate that grants
     a legendary. The card is already granted by recordClear (a mid-
     ceremony refresh can never eat a crown); this is pure theater -
     one card, no price, no 'open another'. */
  function openLegendPack(cardId, meta) {
    var entry = null;
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (c.id === cardId) entry = { card: c, faction: f };
      });
    });
    if (!entry) return false;
    if (window.EOL.econ) window.EOL.econ.grant([cardId]); // idempotent safety
    currentAwardMeta = meta || null;
    results = [entry];
    startCeremony(PACKS.legend);
    return true;
  }

  /* the shared curtain-up: stamp the wrapper, reset the stage, drop
     the pack onto the table */
  function startCeremony(pack) {
    currentPack = pack;
    paintShop();
    /* the pack on the table wears the wrapper you paid for */
    document.querySelectorAll('#po-pack .pk-host').forEach(function (h) {
      h.dataset.pack = pack.key;
      buildPackFace(h);
    });
    resetStage();
    syncOpenAnother();
    var isCampaignLegend = pack.key === 'legend';
    var award = el('po-campaign-award');
    if (award) {
      award.hidden = !isCampaignLegend;
      var awardName = el('po-campaign-award-name');
      if (awardName && isCampaignLegend) {
        /* The wrapper is the reveal. Before it tears, confirm only where
           the reward came from—never print the card hiding inside. */
        awardName.textContent =
          (currentAwardMeta && currentAwardMeta.gate ? currentAwardMeta.gate + ' · ' : '') +
          'Open the pack to discover who answered';
      }
    }
    var hint = el('po-hint');
    if (hint)
      hint.textContent = isCampaignLegend
        ? 'Click to reveal your Legendary'
        : 'Click the pack to open it';
    var summaryTitle = document.querySelector('#po-summary .po-sum-title');
    if (summaryTitle)
      summaryTitle.textContent = isCampaignLegend ? 'Legendary Acquired' : 'Pack Contents';
    state = 'intro';
    var overlay = el('pack-opening');
    overlay.classList.toggle('campaign-legend', isCampaignLegend);
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pack-open');
    el('po-skip').classList.add('show');

    var packEl = el('po-pack');
    // restart the drop animation
    void packEl.offsetWidth;
    packEl.classList.add('drop');
    if (window.EOL.audio) {
      window.EOL.audio.duck(0.42, 0.8);
      window.EOL.audio.pack('drop');
    }
    later(function () {
      if (state !== 'intro') return;
      state = 'await';
      packEl.classList.remove('drop');
      packEl.classList.add('idle');
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
    if (window.EOL.audio) window.EOL.audio.pack('charge');
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
    if (window.EOL.audio) {
      window.EOL.audio.duck(0.28, 0.9);
      window.EOL.audio.pack('burst');
    }
    later(function () {
      el('po-flash').classList.remove('on');
      el('po-packwrap').classList.add('gone');
      overlay.classList.remove('shake');
      dealAll();
    }, dur('burst'));
  }

  /* 3 - THE DEAL: every slot exists before anything moves (the row
     is measured once and never reflows), then the backs deal out on
     the dealer's rhythm, then the flips walk left to right. */
  function dealAll() {
    state = 'reveal';
    var host = el('po-cards');
    var flips = results.map(function (entry, i) {
      var flip = buildFlip(entry, i);
      flip.classList.add('undealt');
      host.appendChild(flip);
      return flip;
    });
    flips.forEach(function (flip, i) {
      later(function () {
        flip.classList.remove('undealt');
        flip.classList.add('dealt');
        if (window.EOL.audio)
          window.EOL.audio.pack('deal', { pan: (i - (flips.length - 1) / 2) * 0.22 });
      }, i * DUR.dealStagger);
    });
    later(
      function () {
        flipNext(flips);
      },
      results.length * DUR.dealStagger + DUR.dealDur + DUR.dealBeat
    );
  }

  function flipNext(flips) {
    if (revealed >= flips.length) {
      later(summary, dur('settle'));
      return;
    }
    var entry = results[revealed];
    var flip = flips[revealed];
    revealed++;
    flip.classList.add('flipped', 'r-' + entry.card.rarity);
    var isLegend = entry.card.rarity === 'legendary';
    if (window.EOL.audio) window.EOL.audio.pack(isLegend ? 'legendary' : 'flip');
    if (isLegend) legendBanner(entry.card.name);
    later(
      function () {
        flipNext(flips);
      },
      DUR.flipStagger + (isLegend ? DUR.legendBeat : 0)
    );
  }

  function buildFlip(entry, i) {
    var flip = document.createElement('div');
    flip.className = 'po-flip';
    flip.style.setProperty('--i', i - (results.length - 1) / 2);
    flip.innerHTML =
      '<div class="po-flip-inner">' +
      '<div class="po-back"><div class="po-back-ring"></div>' +
      '<i data-icon-domain="game" class="ra ra-crossed-swords"></i></div>' +
      '<div class="po-front"></div>' +
      '</div>';
    var front = flip.querySelector('.po-front');
    front.appendChild(window.EOL.ui.buildCard(entry.card, entry.faction, i));
    return flip;
  }

  function legendBanner(name) {
    var award = el('po-campaign-award');
    if (award) award.hidden = true;
    var b = el('po-legend-banner');
    b.innerHTML =
      '<i data-icon-domain="game" class="ra ra-crown"></i><span>Legendary - ' +
      window.EOL.ui.esc(name) +
      '</span>';
    b.classList.add('show');
    later(function () {
      b.classList.remove('show');
    }, dur('legendHold'));
  }

  /* 4 - fan settles, actions appear */
  function summary() {
    state = 'summary';
    syncOpenAnother();
    el('po-cards').classList.add('settled');
    el('po-summary').classList.add('show');
    el('po-skip').classList.remove('show');
    if (window.EOL.audio) window.EOL.audio.pack('summary');
  }

  function close() {
    clearTimers();
    state = 'idle';
    results = [];
    var overlay = el('pack-opening');
    overlay.classList.remove('on', 'campaign-legend');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pack-open');
    var award = el('po-campaign-award');
    if (award) award.hidden = true;
    currentAwardMeta = null;
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
    var award = el('po-campaign-award');
    if (award) award.hidden = true;
    el('pack-opening').classList.remove('shake');
    el('po-hint').classList.remove('show');
    /* the deal may not have started (skip during intro/charge): make
       sure every slot exists, then jump them all to their end state */
    var host = el('po-cards');
    while (host.children.length < results.length) {
      host.appendChild(buildFlip(results[host.children.length], host.children.length));
    }
    Array.prototype.forEach.call(host.children, function (flip, i) {
      flip.classList.remove('undealt');
      flip.classList.add('dealt', 'flipped', 'no-anim', 'r-' + results[i].card.rarity);
    });
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
  /* THE PACK FACE, third and final take (owner ruling 2026-08-10):
     pure CSS/DOM again - the generated wrappers never agreed with
     each other on shape or style. ONE skeleton (field, rays, holo,
     crimped bands, double frame, medal, pips, wordmark) painted by
     this builder into every pack host (shop product, opening pack,
     both burst halves), skinned per tier by a pk-{key} class:
     burlap bronze for Trio, gilt navy for Echoes, royal violet with
     ruby studs for Crown. The pips row is the pack size - three
     little fanned cards on the budget shelf, five up top. */
  var PK_STYLE = {
    trio: { icon: 'ra-diamonds-card' },
    echo: { icon: 'ra-spiral-shell' },
    crown: { icon: 'ra-crown' },
    legend: { icon: 'ra-sunbeams' },
  };
  function buildPackFace(host) {
    if (!host) return;
    var key = PACKS[host.dataset.pack] ? host.dataset.pack : 'echo';
    var pack = PACKS[key];
    var face = host.querySelector('.pk-face');
    if (!face) {
      face = document.createElement('div');
      host.insertBefore(face, host.firstChild);
    }
    face.className = 'pk-face pk-' + key;
    var pips = '';
    for (var i = 0; i < pack.size; i++) pips += '<span></span>';
    face.innerHTML =
      '<div class="pk-weave"></div>' +
      '<div class="pk-rays"></div>' +
      '<div class="pk-holo"></div>' +
      '<div class="pk-crimp top"></div><div class="pk-crimp bot"></div>' +
      '<div class="pk-frame"></div>' +
      '<span class="pk-corner tl"></span><span class="pk-corner tr"></span>' +
      '<span class="pk-corner bl"></span><span class="pk-corner br"></span>' +
      '<span class="pk-spark s1"></span><span class="pk-spark s2"></span><span class="pk-spark s3"></span>' +
      '<div class="pk-emblem">' +
      '<div class="pk-medal"></div>' +
      '<div class="pk-ring outer"></div>' +
      '<div class="pk-ring inner"></div>' +
      '<span class="pk-stud n"></span><span class="pk-stud e"></span>' +
      '<span class="pk-stud s"></span><span class="pk-stud w"></span>' +
      '<i data-icon-domain="game" class="ra ' +
      PK_STYLE[key].icon +
      '"></i>' +
      '</div>' +
      '<div class="pk-pips">' +
      pips +
      '</div>' +
      '<div class="pk-wordmark"><span>' +
      pack.name.split(' ')[0] +
      '</span><i data-icon-domain="game" class="ra ra-crossed-swords"></i><span>Pack</span></div>';
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
    /* the shelf sells down to the last ECHO; the legends that remain
       are the Road's business, and the counter says so */
    var left = econ.packableEntries().length;
    var prog = el('shop-progress');
    if (prog)
      prog.textContent =
        left === 0
          ? econ.unownedEntries().length === 0
            ? 'Collection complete - every echo answers to you'
            : 'Every echo the shelf sells is yours - the legends left walk the Road'
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
    /* The ceremony is shared by Shop purchases and campaign rewards. It
       was authored inside the Shop section, so opening it from the chapter
       map only set state on an ancestor hidden with the inactive view—the
       player did not actually see it until visiting Shop. Promote the one
       overlay to the document layer before any route can open it. */
    var ceremony = el('pack-opening');
    if (ceremony && ceremony.parentNode !== document.body) document.body.appendChild(ceremony);

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
      /* The theater is global now: a campaign reward opens over Chapter,
         while paid packs open over Shop. Escape must work in both places. */
      if (!el('pack-opening').classList.contains('on')) return;
      if (state === 'summary') close();
      else skip();
    });
    document.addEventListener('eol:coins', function () {
      paintShop();
      syncOpenAnother();
    });
    document.addEventListener('eol:owned', function () {
      paintShop();
      syncOpenAnother();
    });
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
    openLegendPack: openLegendPack,
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
