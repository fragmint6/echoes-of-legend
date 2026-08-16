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
      price: 200,
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
      price: 500,
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
      price: 1000,
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
    /* Heroic Road reward: also campaign-only and already granted before
       this one-card ceremony opens. */
    epic: {
      key: 'epic',
      name: 'Epic Pack',
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
  /* THE SHELF NEVER DEAD-ENDS (see docs/DESIGN-Card-Upgrades.md).
     Packs used to draw only from cards you did not own, so a complete
     collection turned the shop off entirely and left coins with no
     sink at all. Once nothing unowned is left, packs pay DUPLICATES
     from the same non-legendary universe instead - which is exactly
     the material the upgrade system runs on.

     The Crown Law is untouched: this pool is still built from
     obtainable, non-legendary cards, so no wrapper can ever contain a
     crown. Legendary duplicates come from crafting, never a pack. */
  function duplicateAwarePool() {
    var econ = window.EOL.econ;
    var fresh = econ.packableEntries();
    if (fresh.length) return fresh;
    return econ.obtainableEntries().filter(function (e) {
      return e.card.rarity !== 'legendary';
    });
  }

  /* Pools are built from the PACKABLE roster only - unowned AND below
     legendary (the Crown Law). `entries` is injectable for tests, and
     the legendary filter applies even then: no injected pool can put
     a crown in a wrapper. */
  function poolByRarity(entries) {
    var pools = { common: [], rare: [], epic: [] };
    var list =
      entries ||
      (window.EOL.econ
        ? duplicateAwarePool()
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
  var lastDupes = []; // duplicates in the pack just opened (shard payout)
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
      duplicateAwarePool().length > 0;
    again.hidden = !canBuy;
  }

  /* 1 - the PURCHASE: price gated, cards granted at roll time */
  function begin(packKey) {
    var pack = PACKS[packKey] || currentPack || PACKS.echo;
    var econ = window.EOL.econ;
    if (!econ) return;
    /* the Legend Pack is the Road's to give, never the shelf's to sell */
    if (pack.key === 'legend' || pack.key === 'epic') return;
    /* The old guard refused the sale once every card was owned. Packs
       now pay duplicates (which are upgrade material and Echo Shards),
       so the shelf only closes if there is genuinely nothing to draw -
       which cannot happen while the roster has a non-legendary card. */
    if (!duplicateAwarePool().length) {
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
    /* GRANT NOW: the ceremony is theater, the ledger is truth.
       A card already owned is a DUPLICATE: it pays Echo Shards and
       banks toward that card's next upgrade level instead of being a
       wasted pull. Recorded before the ceremony so a mid-reveal
       refresh cannot eat it, exactly like the grant. */
    var up = window.EOL.upgrades;
    lastDupes = [];
    results.forEach(function (e) {
      var dupe = econ.owns(e.card.id);
      e.duplicate = dupe;
      if (dupe && up) {
        var got = up.addDuplicate(e.card.id, 1);
        e.shards = got.shards;
        lastDupes.push(e);
      }
    });
    econ.grant(
      results.map(function (e) {
        return e.card.id;
      })
    );
    startCeremony(pack);
  }

  /* CAMPAIGN CARD PACKS: campaign.js opens these after a Heroic Epic or
     Legend crown clear. The card is already granted by recordClear (a
     mid-ceremony refresh cannot eat it); this is one-card theater only. */
  function openCampaignReward(cardId, meta) {
    var entry = null;
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (c.id === cardId) entry = { card: c, faction: f };
      });
    });
    if (!entry) return false;
    var rarity = meta && meta.rarity === 'epic' ? 'epic' : 'legend';
    if (window.EOL.econ) window.EOL.econ.grant([cardId]); // idempotent safety
    currentAwardMeta = meta || {};
    currentAwardMeta.rarity = rarity === 'legend' ? 'legendary' : 'epic';
    results = [entry];
    startCeremony(PACKS[rarity]);
    return true;
  }

  function openLegendPack(cardId, meta) {
    meta = meta || {};
    meta.rarity = 'legendary';
    return openCampaignReward(cardId, meta);
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
    var isCampaignAward = (pack.key === 'legend' || pack.key === 'epic') && !!currentAwardMeta;
    var isCampaignLegend = pack.key === 'legend' && isCampaignAward;
    var award = el('po-campaign-award');
    if (award) {
      award.hidden = !isCampaignAward;
      var awardKicker = el('po-campaign-award-kicker');
      var awardTitle = el('po-campaign-award-title');
      if (awardKicker && isCampaignAward)
        awardKicker.innerHTML =
          '<i data-icon-domain="game" class="ra ' +
          (isCampaignLegend ? 'ra-crown' : 'ra-gem') +
          '"></i> Gate reward';
      if (awardTitle && isCampaignAward)
        awardTitle.textContent = isCampaignLegend ? 'Legendary reward pack' : 'Epic reward pack';
      var awardName = el('po-campaign-award-name');
      if (awardName && isCampaignAward) {
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
        : isCampaignAward
          ? 'Click to reveal your Epic'
          : 'Click the pack to open it';
    var summaryTitle = document.querySelector('#po-summary .po-sum-title');
    if (summaryTitle)
      summaryTitle.textContent = isCampaignLegend
        ? 'Legendary Acquired'
        : isCampaignAward
          ? 'Epic Acquired'
          : 'Pack Contents';
    state = 'intro';
    var overlay = el('pack-opening');
    overlay.classList.toggle('campaign-legend', isCampaignAward);
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
    /* A DUPLICATE has to say so on the card, or the player reads it as
       a pull they already had and feels cheated. It is not a dud - it
       is shards plus a step toward that legend's next upgrade. */
    if (entry.duplicate) {
      flip.classList.add('po-dupe');
      var tag = document.createElement('span');
      tag.className = 'po-dupe-tag';
      tag.innerHTML =
        '<i class="ri-sparkling-2-fill"></i><b>+' +
        (entry.shards || 0).toLocaleString() +
        '</b><small>Echo Shards</small>';
      front.appendChild(tag);
    }
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
    /* Total the shard payout so a pack of duplicates still lands as a
       reward rather than as five cards you already owned. */
    var tally = el('po-shard-tally');
    if (tally) {
      var total = lastDupes.reduce(function (n, e) {
        return n + (e.shards || 0);
      }, 0);
      if (total > 0) {
        tally.innerHTML =
          '<i class="ri-sparkling-2-fill"></i><span>+' +
          total.toLocaleString() +
          ' Echo Shards</span>';
        tally.hidden = false;
      } else {
        tally.hidden = true;
      }
    }
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
    epic: { icon: 'ra-gem' },
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
    var up = window.EOL.upgrades;
    /* THE SHARD WALLET sits beside the coin wallet, because once the
       collection is complete it is the only currency a pack pays. */
    var sw = el('shop-shards');
    if (sw && up) {
      sw.innerHTML = '<i class="ri-sparkling-2-fill shard-ico"></i>' + up.shards().toLocaleString();
      sw.hidden = false;
    }
    var prog = el('shop-progress');
    if (prog)
      prog.textContent =
        left === 0
          ? 'Collection complete - packs now pay duplicates and Echo Shards'
          : econ.ownedCount() + ' / ' + econ.obtainableEntries().length + ' legends collected';
    /* Packs stay BUYABLE at a complete collection: they pay duplicates,
       which are upgrade material. Only the price gates the button now. */
    document.querySelectorAll('.buy-pack').forEach(function (btn) {
      var pack = PACKS[btn.dataset.pack];
      if (!pack) return;
      btn.disabled = econ.coins() < pack.price || !duplicateAwarePool().length;
      btn.innerHTML = COIN_IMG + '<span>' + pack.price + '</span>';
    });
  }

  /* =============================================================
     THE ECHO SHOP
     -------------------------------------------------------------
     Shards buy a duplicate of a legend you ALREADY OWN, at any
     rarity - including legendaries, which no pack may ever contain.
     Never a legend you do not own: crafting is an upgrade currency,
     not a collection shortcut, so packs stay the only way to widen a
     collection and the Crown Law is untouched.

     This used to live as one button inside each card's upgrade
     panel, which meant the second currency had no shopfront and you
     could only spend it one card at a time, from a screen whose job
     was something else. It is a shop, so it lives in the Shop.
     ============================================================= */
  var echoTab = 'packs';
  var echoQuery = '';
  var echoOnlyUseful = true;

  function upg() {
    return window.EOL.upgrades;
  }

  function shopTab(name) {
    echoTab = name === 'echo' ? 'echo' : 'packs';
    var packs = el('spanel-packs');
    var echo = el('spanel-echo');
    if (packs) packs.hidden = echoTab !== 'packs';
    if (echo) echo.hidden = echoTab !== 'echo';
    [
      ['packs', el('stab-packs')],
      ['echo', el('stab-echo')],
    ].forEach(function (row) {
      if (!row[1]) return;
      var on = echoTab === row[0];
      row[1].classList.toggle('sel', on);
      row[1].setAttribute('aria-selected', on ? 'true' : 'false');
    });
    moveShopThumb();
    if (echoTab === 'echo') paintEcho();
  }

  function moveShopThumb() {
    var thumb = document.querySelector('.shop-thumb');
    var sel = document.querySelector('.shop-tab.sel');
    if (!thumb || !sel || !sel.offsetWidth) return;
    thumb.style.width = sel.offsetWidth + 'px';
    thumb.style.transform = 'translateX(' + sel.offsetLeft + 'px)';
  }

  /* Every owned legend, with what a copy costs and whether a copy
     would actually do anything. A maxed card can still be bought
     for shards in principle, but there is nothing left to spend the
     copy on - so it is filtered out by default rather than sold as
     a trap. */
  function echoRows() {
    var econ = window.EOL.econ;
    var U = upg();
    if (!econ || !U) return [];
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (!econ.owns(c.id)) return;
        var lv = U.levelOf(c.id);
        var maxed = lv >= U.MAX_LEVEL;
        var dupes = U.dupesOf(c.id);
        var need = U.costOfNextLevel(c.id);
        out.push({
          card: c,
          faction: f,
          lv: lv,
          maxed: maxed,
          dupes: dupes,
          need: need,
          ready: !maxed && dupes >= need,
          cost: U.craftCost(c.rarity),
        });
      });
    });
    /* Cheapest useful thing first: a card one copy from a level is
       the most interesting row on the page. */
    out.sort(function (a, b) {
      if (a.maxed !== b.maxed) return a.maxed ? 1 : -1;
      var aNeed = Math.max(0, a.need - a.dupes);
      var bNeed = Math.max(0, b.need - b.dupes);
      if (aNeed !== bNeed) return aNeed - bNeed;
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.card.name.localeCompare(b.card.name, 'en', { sensitivity: 'base' });
    });
    return out;
  }

  function paintEcho() {
    var grid = el('echo-grid');
    var U = upg();
    if (!grid || !U) return;
    var bal = el('echo-balance');
    if (bal) {
      bal.innerHTML =
        '<i class="ri-sparkling-2-fill shard-ico"></i>' + U.shards().toLocaleString() + ' shards';
    }

    var shards = U.shards();
    var rows = echoRows().filter(function (r) {
      if (echoOnlyUseful && r.maxed) return false;
      if (echoQuery && r.card.name.toLowerCase().indexOf(echoQuery) < 0) return false;
      return true;
    });

    var esc = window.EOL.ui && window.EOL.ui.esc ? window.EOL.ui.esc : String;
    grid.innerHTML = rows
      .map(function (r) {
        var toNext = Math.max(0, r.need - r.dupes);
        var line = r.maxed
          ? 'Fully upgraded'
          : r.ready
            ? 'Ready to level up'
            : toNext + (toNext === 1 ? ' copy' : ' copies') + ' to level ' + (r.lv + 1);
        return (
          '<article class="echo-row' +
          (r.ready ? ' ready' : '') +
          '" data-echo-card="' +
          esc(r.card.id) +
          '">' +
          '<span class="echo-art' +
          (r.card.art ? ' has-art' : '') +
          '" style="--fc-primary:' +
          esc(r.faction.colors.primary) +
          '">' +
          (r.card.art
            ? '<img src="' + esc(r.card.art) + '" alt="" draggable="false" />'
            : '<i data-icon-domain="game" class="ra ' + esc(r.card.icon) + '"></i>') +
          '</span>' +
          '<span class="echo-info">' +
          '<b class="echo-name">' +
          esc(r.card.name) +
          '</b>' +
          '<span class="echo-meta"><span class="echo-rar" data-rarity="' +
          esc(r.card.rarity) +
          '">' +
          esc(r.card.rarity) +
          '</span>' +
          (r.lv ? '<span class="echo-lv">Lv' + r.lv + '</span>' : '') +
          '</span>' +
          '<span class="echo-need">' +
          line +
          '</span>' +
          '</span>' +
          '<button type="button" class="echo-buy" data-echo-buy="' +
          esc(r.card.id) +
          '"' +
          (shards >= r.cost && !r.maxed ? '' : ' disabled') +
          '><i class="ri-sparkling-2-fill"></i>' +
          r.cost.toLocaleString() +
          '</button>' +
          '</article>'
        );
      })
      .join('');

    var empty = el('echo-empty');
    if (empty) {
      empty.hidden = rows.length > 0;
      empty.textContent = echoQuery
        ? 'No legend you own matches that name.'
        : echoOnlyUseful
          ? 'Every legend you own is fully upgraded. Untick the filter to buy copies anyway.'
          : 'Open a pack to start collecting legends.';
    }
  }

  function setCodeStatus(message, stateName) {
    var status = el('shop-code-status');
    if (!status) return;
    status.textContent = message || '';
    if (stateName) status.dataset.state = stateName;
    else status.removeAttribute('data-state');
  }

  function openCodeModal() {
    var modal = el('shop-code-modal');
    var input = el('shop-code-input');
    if (!modal || !modal.hidden) return;
    if (!codeBusy) {
      if (input) input.value = '';
      setCodeStatus('', '');
    }
    modal.hidden = false;
    document.body.dataset.modal = '1';
    if (input) input.focus();
  }
  function closeCodeModal(restoreFocus) {
    var modal = el('shop-code-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    delete document.body.dataset.modal;
    if (restoreFocus !== false) {
      var trigger = el('shop-code-open');
      if (trigger) trigger.focus();
    }
  }

  var codeBusy = false;
  function setCodeBusy(busy) {
    codeBusy = !!busy;
    var input = el('shop-code-input');
    var button = el('shop-code-submit');
    if (input) input.disabled = codeBusy;
    if (button) {
      button.disabled = codeBusy;
      button.setAttribute('aria-busy', codeBusy ? 'true' : 'false');
    }
  }
  function finishCode(result, input) {
    setCodeBusy(false);
    result = result || { ok: false, status: 'unavailable' };
    if (result.ok) {
      input.value = '';
      setCodeStatus(
        result.code + ' redeemed - ' + result.coins.toLocaleString() + ' coins added.',
        'success'
      );
      if (window.EOL.audio) window.EOL.audio.ui('toggle');
      if (window.EOL.ui && window.EOL.ui.toast)
        window.EOL.ui.toast(
          result.code + ' redeemed - ' + result.coins.toLocaleString() + ' coins added',
          'ri-coin-fill'
        );
      return;
    }
    var messages = {
      empty: 'Enter a code first.',
      redeemed: 'That code has already been redeemed by this account.',
      claimed: 'That single-user code has already been claimed.',
      signin: 'Sign in to redeem account and single-user codes.',
      unavailable: 'Code redemption is unavailable right now. Try again shortly.',
      invalid: "That code isn't recognized.",
    };
    setCodeStatus(messages[result.status] || messages.invalid, 'error');
    if (window.EOL.audio) window.EOL.audio.ui('deny');
  }
  function submitCode() {
    var econ = window.EOL.econ;
    var input = el('shop-code-input');
    if (codeBusy || !econ || !input || typeof econ.redeemCode !== 'function') return;
    var result = econ.redeemCode(input.value);
    if (result && typeof result.then === 'function') {
      setCodeBusy(true);
      setCodeStatus('Checking code…', '');
      result.then(
        function (resolved) {
          finishCode(resolved, input);
        },
        function () {
          finishCode({ ok: false, status: 'unavailable' }, input);
        }
      );
    } else {
      finishCode(result, input);
    }
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
    var codeOpen = el('shop-code-open');
    var codeClose = el('shop-code-close');
    var codeScrim = el('shop-code-scrim');
    if (codeOpen) codeOpen.addEventListener('click', openCodeModal);
    if (codeClose)
      codeClose.addEventListener('click', function () {
        closeCodeModal(true);
      });
    if (codeScrim)
      codeScrim.addEventListener('click', function () {
        closeCodeModal(true);
      });
    var codeForm = el('shop-code-form');
    if (codeForm)
      codeForm.addEventListener('submit', function (event) {
        event.preventDefault();
        submitCode();
      });
    var codeInput = el('shop-code-input');
    if (codeInput)
      codeInput.addEventListener('input', function () {
        var status = el('shop-code-status');
        if (status && status.dataset.state === 'error') setCodeStatus('', '');
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
      var codeModal = el('shop-code-modal');
      if (codeModal && !codeModal.hidden) {
        closeCodeModal(true);
        return;
      }
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
    var tabPacks = el('stab-packs');
    var tabEcho = el('stab-echo');
    if (tabPacks)
      tabPacks.addEventListener('click', function () {
        shopTab('packs');
      });
    if (tabEcho)
      tabEcho.addEventListener('click', function () {
        shopTab('echo');
      });
    var echoSearch = el('echo-search');
    if (echoSearch)
      echoSearch.addEventListener('input', function () {
        echoQuery = (echoSearch.value || '').trim().toLowerCase();
        paintEcho();
      });
    var echoFilter = el('echo-only-useful');
    if (echoFilter)
      echoFilter.addEventListener('change', function () {
        echoOnlyUseful = !!echoFilter.checked;
        paintEcho();
      });
    var echoGrid = el('echo-grid');
    if (echoGrid)
      echoGrid.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('[data-echo-buy]') : null;
        if (!btn) return;
        var U = upg();
        if (!U) return;
        var r = U.craft(btn.dataset.echoBuy);
        if (r.ok) {
          if (window.EOL.ui.toast)
            window.EOL.ui.toast('Copy crafted for ' + r.cost + ' shards', 'ri-sparkling-2-fill');
          if (window.EOL.audio) window.EOL.audio.ui('confirm');
        } else if (r.reason === 'shards') {
          if (window.EOL.ui.toast) window.EOL.ui.toast('Not enough Echo Shards', 'ri-sparkling-2-fill');
        } else if (r.reason === 'maxed') {
          if (window.EOL.ui.toast)
            window.EOL.ui.toast('That legend is already fully upgraded', 'ri-information-line');
        }
        paintEcho();
        paintShop();
      });
    /* Crafting, packs and levelling all move the shard balance. */
    window.addEventListener('eol:upgrades', function () {
      if (echoTab === 'echo') paintEcho();
      paintShop();
    });
    window.addEventListener('resize', moveShopThumb);

    document.addEventListener('eol:view', function (ev) {
      if (ev.detail === 'shop') {
        paintShop();
        if (echoTab === 'echo') paintEcho();
        requestAnimationFrame(moveShopThumb);
      } else closeCodeModal(false);
    });
    paintShop();
    requestAnimationFrame(moveShopThumb);
  }

  document.addEventListener('DOMContentLoaded', mount);

  window.EOL.shop = {
    PACKS: PACKS,
    rollPack: rollPack,
    rollRarity: rollRarity,
    begin: begin,
    openCampaignReward: openCampaignReward,
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
