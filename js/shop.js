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

  /* THE SHELF (owner ruling 2026-08-19 - the chapter packs, the
     featured pairs and the free daily):
       - FEATURED: two packs a week, each two factions, named for how
         the pair is related (the rotation is authored, not random);
       - DAILY: free, one card, the whole non-legendary roster, long
         odds with a small Epic chance - once a day;
       - CHAPTER: one pack per chapter - Echoes (Chapter I) and
         Archive (Chapter II) - 500 coins, five cards, one Epic
         guaranteed.
     THE CROWN LAW, unchanged since 2026-08-10: NO LEGENDARY IN ANY
     PACK, ever - featured, daily and chapter packs included. Epic is
     the ceiling of every table below. */
  var PACKS = {
    daily: {
      key: 'daily',
      name: 'Daily Pack',
      word: 'Daily',
      price: 0,
      size: 1,
      odds: [
        ['common', 75],
        ['rare', 20],
        ['epic', 5],
      ],
      final: null, // one card, no guarantee - the freebie is the point
      pool: 'all',
    },
    echo: {
      key: 'echo',
      name: 'Echoes Pack',
      word: 'Echoes',
      price: 500,
      size: 5,
      odds: [
        ['common', 45],
        ['rare', 35],
        ['epic', 20],
      ],
      final: [['epic', 100]],
      pool: 'chapter1',
    },
    archive: {
      key: 'archive',
      name: 'Archive Pack',
      word: 'Archive',
      price: 500,
      size: 5,
      odds: [
        ['common', 45],
        ['rare', 35],
        ['epic', 20],
      ],
      final: [['epic', 100]],
      pool: 'chapter2',
    },
    /* the two featured shelves: one pack each, two factions each,
       named by their relationship. The pack's pool and face resolve
       from the weekly rotation below. */
    featured: {
      key: 'featured',
      name: 'Featured Pack',
      word: 'Featured',
      price: 500,
      size: 5,
      odds: [
        ['common', 45],
        ['rare', 35],
        ['epic', 20],
      ],
      final: [['epic', 100]],
      pool: 'featured',
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
  /* the shelf's sellable packs, in display order */
  var SHELF_KEYS = ['daily', 'echo', 'archive', 'featured'];

  /* ---------------------------------------------------------
     THE FEATURED ROTATION (weekly, authored).
     ---------------------------------------------------------
     Two pairs a week, each pair named for the relationship between
     its two factions. Sixteen factions, four weeks - every faction
     is featured exactly once a cycle, and every pairing is a line
     the game actually teaches (the mark circuit, the fallen count,
     the theft economy...). The rotation is keyed by ISO week, so
     it is stable for a player all week and returns in four.
     --------------------------------------------------------- */
  var FEATURED_WEEKS = [
    [
      {
        name: 'Divine Pact',
        word: 'Divine',
        factions: ['genesis', 'olympus'],
        blurb: 'Two heavens, one court: the old gods mark, the new ones seal, and the hour comes sooner.',
      },
      {
        name: "Debtors' Ledger",
        word: 'Ledger',
        factions: ['pandemonium', 'tortuga'],
        blurb: 'Every price is stated, every price is paid - the sins name the cost, the pirates take it anyway.',
      },
    ],
    [
      {
        name: 'Deathless Court',
        word: 'Court',
        factions: ['duat', 'asgard'],
        blurb: 'The scales read every fallen legend, and the north counts the same dead.',
      },
      {
        name: 'Green Hollow',
        word: 'Hollow',
        factions: ['grimmwood', 'hemithea'],
        blurb: 'The woods make a legend of anyone - and mortals only ascend when the fight gives them a reason.',
      },
    ],
    [
      {
        name: 'Mark Circuit',
        word: 'Circuit',
        factions: ['huaxia', 'devas'],
        blurb: 'Marks supplied, marks spent, marks supplied again - the wheel the two empires trade.',
      },
      {
        name: 'Old Roads',
        word: 'Roads',
        factions: ['sherwood', 'kami'],
        blurb: 'Outlaws and foxes: borrowed names, long knives, and shrines in the green.',
      },
    ],
    [
      {
        name: 'Wall & Word',
        word: 'Wall',
        factions: ['camelot', 'yamato'],
        blurb: 'Two codes of honor - the wall that shields, the oath that binds - drawn against each other.',
      },
      {
        name: 'First & Last Throne',
        word: 'Throne',
        factions: ['roma', 'transylvania'],
        blurb: 'An empire that lasted, and the things that refused to end with it.',
      },
    ],
  ];

  function isoWeekNumber(d) {
    d = d || new Date();
    var day = (d.getDay() + 6) % 7; // Monday = 0
    var thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);
    var firstThursday = new Date(thursday.getFullYear(), 0, 4);
    var firstDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(4 - firstDay + 7);
    return 1 + Math.round((thursday - firstThursday) / (7 * 24 * 3600 * 1000));
  }

  function rotationFor(week) {
    return FEATURED_WEEKS[(week - 1) % FEATURED_WEEKS.length];
  }
  function featuredMeta(slot) {
    return rotationFor(isoWeekNumber())[slot] || FEATURED_WEEKS[0][slot];
  }

  /* ---------------- pack pools (pure) ---------------- */
  var CHAPTER1_FACTIONS = ['grimmwood', 'camelot', 'sherwood', 'olympus', 'yamato', 'roma', 'kami', 'duat'];
  var CHAPTER2_FACTIONS = ['huaxia', 'asgard', 'hemithea', 'pandemonium', 'devas', 'genesis', 'transylvania', 'tortuga'];

  /* Every card the pack may EVER contain - its universe. The Crown
     Law lives here: a legendary never enters ANY pack's universe,
     featured, daily or chapter. Ownership filters on top of this. */
  function packUniverse(pack) {
    var out = [];
    var want = null;
    if (pack && pack.pool === 'chapter1') want = CHAPTER1_FACTIONS;
    else if (pack && pack.pool === 'chapter2') want = CHAPTER2_FACTIONS;
    else if (pack && pack.pool === 'featured') {
      var meta = pack._featuredMeta || featuredMeta(pack._featuredSlot || 0);
      want = meta.factions;
    }
    (window.EOL.factions || []).forEach(function (f) {
      if (want && want.indexOf(f.id) < 0) return;
      f.cards.forEach(function (c) {
        if (c.rarity === 'legendary') return; // the Crown Law
        out.push({ card: c, faction: f });
      });
    });
    return out;
  }

  /* Unowned, sub-legendary cards from the pack's universe - the
     Crown Law applies to every pool, featured and daily included.
     The old shelf never dead-ended (duplicates pay shards) and the
     new one does not either: when the universe is fully owned the
     fallback returns its whole non-legendary roster as duplicates. */
  function duplicateAwarePool(pack) {
    pack = pack || PACKS.echo;
    var econ = window.EOL.econ;
    var universe = packUniverse(pack).filter(function (e) {
      return e.card.rarity !== 'legendary';
    });
    if (!econ) return universe;
    var fresh = universe.filter(function (e) {
      return !econ.owns(e.card.id);
    });
    return fresh.length ? fresh : universe;
  }

  /* Chapter II merchandise is a reward for finishing Chapter I, not
     merely for opening the chapter selector. Gate X on ANY difficulty
     unlocks it. Read the Chapter I save directly so the answer remains
     correct while the campaign module is currently displaying Chapter II. */
  function clearedChapterOne() {
    try {
      var raw = localStorage.getItem('eol.campaign.ch1.progress');
      if (!raw) return false;
      var progress = JSON.parse(raw);
      if (progress.runs) {
        return Object.keys(progress.runs).some(function (difficulty) {
          var run = progress.runs[difficulty];
          return run && Array.isArray(run.cleared) && run.cleared.indexOf(10) >= 0;
        });
      }
      /* Legacy saves pre-date difficulty runs. */
      return Array.isArray(progress.cleared) && progress.cleared.indexOf(10) >= 0;
    } catch (e) {
      return false;
    }
  }
  function packVisible(key) {
    return key !== 'archive' || clearedChapterOne();
  }

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
  /* Pools are built from the universe of the pack being opened. `entries`
     remains injectable for deterministic tests; without it, the scoped
     duplicate-aware pool above is used. Keeping one pool function is
     important: an older unscoped duplicateAwarePool declaration here used
     to shadow the chapter-aware implementation and let Chapter II cards
     leak into an Echoes Pack. */
  function poolByRarity(entries, pack) {
    var pools = { common: [], rare: [], epic: [] };
    var list =
      entries ||
      (window.EOL.econ
        ? duplicateAwarePool(pack)
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
    var pools = poolByRarity(entries, pack);
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
  function escHtml(value) {
    if (window.EOL.ui && window.EOL.ui.esc) return window.EOL.ui.esc(value);
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
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
      SHELF_KEYS.indexOf(pack.key) >= 0 &&
      pack.key !== 'daily' &&
      !!econ &&
      econ.coins() >= pack.price &&
      duplicateAwarePool(pack).length > 0;
    again.hidden = !canBuy;
  }

  /* ---- the free daily pack: once per local day ---- */
  function dailyDateKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function dailyClaimed() {
    try {
      return localStorage.getItem('eol.daily.pack.' + dailyDateKey()) === '1';
    } catch (e) {
      return false;
    }
  }
  function markDailyClaimed() {
    try {
      localStorage.setItem('eol.daily.pack.' + dailyDateKey(), '1');
    } catch (e) {
      /* private mode: the claim still resolves this session */
    }
  }

  /* 1 - the PURCHASE: price gated, cards granted at roll time */
  function begin(packKey, packOverride) {
    var pack = PACKS[packKey] || currentPack || PACKS.echo;
    if (packOverride) {
      pack = Object.assign({}, pack, packOverride);
    }
    var econ = window.EOL.econ;
    if (!econ) return;
    /* the Legend Pack is the Road's to give, never the shelf's to sell */
    if (pack.key === 'legend' || pack.key === 'epic') return;
    /* THE DAILY PACK is free and once a day - the only pack with a
       claim guard instead of a price. */
    if (pack.key === 'daily') {
      if (dailyClaimed()) {
        if (window.EOL.audio) window.EOL.audio.ui('deny');
        if (window.EOL.ui && window.EOL.ui.toast)
          window.EOL.ui.toast('Already claimed - the shelf restocks at midnight', 'ri-time-line');
        return;
      }
      markDailyClaimed();
    } else if (!packVisible(pack.key)) {
      return; // a gated shelf is not for sale yet
    }
    /* The old guard refused the sale once every card was owned. Packs
       now pay duplicates (which are upgrade material and Echo Shards),
       so the shelf only closes if there is genuinely nothing to draw -
       which cannot happen while the roster has a non-legendary card. */
    if (!duplicateAwarePool(pack).length) {
      if (window.EOL.audio) window.EOL.audio.ui('deny');
      if (window.EOL.ui && window.EOL.ui.toast)
        window.EOL.ui.toast(
          'Every echo the shelf sells is yours - the legends left walk the Road',
          'ri-checkbox-circle-line'
        );
      return;
    }
    if (pack.price > 0 && !econ.spend(pack.price)) {
      if (window.EOL.audio) window.EOL.audio.ui('deny');
      if (window.EOL.ui && window.EOL.ui.toast)
        window.EOL.ui.toast('Not enough coins - the Road pays in gates and wars', 'ri-coin-fill');
      return;
    }
    if (window.EOL.audio) window.EOL.audio.pack('buy');
    currentAwardMeta = null;
    results = rollPack(Math.random, pack, duplicateAwarePool(pack));
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
     mid-ceremony refresh cannot eat it); this is one-card theater only.
     A DUPLICATE grant (the card was already owned - the starter shelf,
     a crown from another run) wears the same copy tag a pack duplicate
     does: it is not a dud, it is Echo Shards plus a step toward the
     card's next level. */
  function openCampaignReward(cardId, meta) {
    var entry = null;
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (c.id === cardId) entry = { card: c, faction: f };
      });
    });
    if (!entry) return false;
    var rarity = meta && meta.rarity === 'epic' ? 'epic' : 'legend';
    /* Idempotent safety only - the copy itself was banked by
       recordClear through econ.grant({dupes:true}); a second bank
       here would double-count the duplicate. */
    if (window.EOL.econ) window.EOL.econ.grant([cardId]);
    if (meta && meta.duplicate) {
      entry.duplicate = true;
      entry.shards = window.EOL.upgrades
        ? window.EOL.upgrades.shardYield(entry.card.rarity)
        : 0;
      lastDupes.push(entry);
    }
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
      if (pack._featuredSlot != null) h.dataset.slot = String(pack._featuredSlot);
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
    daily: { icon: 'ra-book' },
    echo: { icon: 'ra-spiral-shell' },
    archive: { icon: 'ra-scroll-unfurled' },
    featured: { icon: 'ra-daggers' },
    legend: { icon: 'ra-sunbeams' },
    epic: { icon: 'ra-gem' },
  };
  function factionById(id) {
    return (window.EOL.factions || []).filter(function (f) {
      return f.id === id;
    })[0];
  }
  function buildPackFace(host) {
    if (!host) return;
    var key = PACKS[host.dataset.pack] ? host.dataset.pack : 'echo';
    var pack = PACKS[key];
    /* a featured face is stamped with its weekly pair: the two
       faction crests ride in the emblem instead of one icon */
    var meta = null;
    if (key === 'featured') {
      meta = pack._featuredMeta || featuredMeta(parseInt(host.dataset.slot || '0', 10));
    }
    var face = host.querySelector('.pk-face');
    if (!face) {
      face = document.createElement('div');
      host.insertBefore(face, host.firstChild);
    }
    face.className = 'pk-face pk-' + key;
    var pips = '';
    for (var i = 0; i < pack.size; i++) pips += '<span></span>';
    var emblemIcons = '';
    if (meta) {
      var f1 = factionById(meta.factions[0]);
      var f2 = factionById(meta.factions[1]);
      emblemIcons =
        '<i data-icon-domain="game" class="ra ' +
        (f1 ? f1.icon : 'ra-crossed-swords') +
        '"></i><i data-icon-domain="game" class="ra ' +
        (f2 ? f2.icon : 'ra-crossed-swords') +
        '"></i>';
    } else {
      emblemIcons = '<i data-icon-domain="game" class="ra ' + PK_STYLE[key].icon + '"></i>';
    }
    face.innerHTML =
      '<div class="pk-weave"></div>' +
      '<div class="pk-rays"></div>' +
      '<div class="pk-holo"></div>' +
      '<div class="pk-crimp top"></div><div class="pk-crimp bot"></div>' +
      '<div class="pk-frame"></div>' +
      '<span class="pk-corner tl"></span><span class="pk-corner tr"></span>' +
      '<span class="pk-corner bl"></span><span class="pk-corner br"></span>' +
      '<span class="pk-spark s1"></span><span class="pk-spark s2"></span><span class="pk-spark s3"></span>' +
      '<div class="pk-emblem' +
      (meta ? ' pk-emblem-pair' : '') +
      '">' +
      '<div class="pk-medal"></div>' +
      '<div class="pk-ring outer"></div>' +
      '<div class="pk-ring inner"></div>' +
      '<span class="pk-stud n"></span><span class="pk-stud e"></span>' +
      '<span class="pk-stud s"></span><span class="pk-stud w"></span>' +
      emblemIcons +
      '</div>' +
      '<div class="pk-pips">' +
      pips +
      '</div>' +
      '<div class="pk-wordmark"><span>' +
      (meta ? meta.word : pack.word || pack.name.split(' ')[0]) +
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
       which are upgrade material. Only the price gates the button now -
       and the daily pack gates on the day instead. */
    document.querySelectorAll('.buy-pack').forEach(function (btn) {
      var pack = PACKS[btn.dataset.pack];
      if (!pack) return;
      if (pack.key === 'featured') {
        var slot = parseInt(btn.dataset.slot || '0', 10);
        var meta = featuredMeta(slot);
        pack = Object.assign({}, pack, { _featuredMeta: meta });
      }
      if (pack.key === 'daily') {
        var claimed = dailyClaimed();
        btn.disabled = claimed;
        btn.innerHTML = claimed
          ? '<i class="ri-check-line"></i><span>Opened</span>'
          : '<i class="ri-gift-line"></i><span>Open free</span>';
        return;
      }
      btn.disabled = econ.coins() < pack.price || !duplicateAwarePool(pack).length;
      btn.innerHTML = COIN_IMG + '<span>' + pack.price + '</span>';
    });

    /* THE FEATURED SHELF: names, blurbs and odds resolve from the
       weekly rotation, and the two faction crests ride the wrapper. */
    [0, 1].forEach(function (slot) {
      var product = el('product-featured-' + slot);
      var host = document.querySelector('.product-pack[data-pack="featured"][data-slot="' + slot + '"]');
      var meta = featuredMeta(slot);
      if (product) {
        var name = product.querySelector('.product-name');
        var info = product.querySelector('.product-info');
        var f1 = factionById(meta.factions[0]);
        var f2 = factionById(meta.factions[1]);
        var f1Name = f1 ? f1.name : meta.factions[0];
        var f2Name = f2 ? f2.name : meta.factions[1];
        if (name) name.textContent = meta.name + ' Pack';
        if (info)
          info.innerHTML =
            '<div class="product-tip"><i class="ri-sword-line"></i><span><b>Featured this week</b>' +
            escHtml(f1Name) + ' × ' + escHtml(f2Name) + '</span></div>' +
            '<div class="product-info-body">' +
            '<p class="product-desc">' + escHtml(meta.blurb) + '</p>' +
            '<div class="pack-facts"><span><i class="ri-stack-line"></i><b>5</b> cards</span>' +
            '<span><i class="ri-trophy-line"></i>Epic finisher</span></div>' +
            '<div class="faction-list featured-factions"><b>Featured factions</b><span>' +
            escHtml(f1Name) + '</span><span>' + escHtml(f2Name) + '</span></div>' +
            '<div class="odds-title"><span>Reveal odds</span><em>cards 1–4</em></div>' +
            '<div class="odds-grid"><span class="odds-common"><b>Common</b><i style="--odds:45%"></i><strong>45%</strong></span>' +
            '<span class="odds-rare"><b>Rare</b><i style="--odds:35%"></i><strong>35%</strong></span>' +
            '<span class="odds-epic"><b>Epic</b><i style="--odds:20%"></i><strong>20%</strong></span></div>' +
            '<div class="guarantee"><i class="ri-sparkling-2-line"></i><span>Final reveal</span><b>Epic · 100%</b></div></div>';
      }
      if (host) {
        host.dataset.slot = String(slot);
        buildPackFace(host);
      }
    });

    /* THE CHAPTER SHELF follows the visibility law: a chapter's pack
       shows while the player is on that chapter or has beaten it. */
    SHELF_KEYS.forEach(function (key) {
      if (key === 'daily' || key === 'featured') return;
      var product = document.querySelector('.product[data-product="' + key + '"]');
      if (product) product.hidden = !packVisible(key);
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
  var echoFilter = 'ready';
  /* THE CHAPTER TABS (2026-08-19): the shelf of owned legends is
     long, so it pages by chapter. */
  var echoChapter = 'all';

  /* THE ECHO LAZY LOAD (2026-08-19): the grid used to innerHTML
     every owned card in one pass - with the roster open to 115 the
     shelf re-painted a wall of DOM per keystroke. Rows are computed
     once per paint, then rendered in batches as the sentinel
     approaches. */
  var ECHO_PAGE = 12;
  var echoBatch = { rows: [], i: 0, observer: null };

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

  /* Every owned legend, with what a copy costs and what it is worth.
     `toNext` is the number of copies still missing before the next
     level can be bought - the single most useful number on the page,
     and what the list sorts on. */
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
        /* A card holds at most nine copies - what its three levels
           can consume. Once the bank covers every remaining level
           there is nothing a further copy could ever be spent on. */
        var wanted = U.copiesWanted ? U.copiesWanted(c.id) : 1;
        out.push({
          card: c,
          faction: f,
          lv: lv,
          maxed: maxed,
          dupes: dupes,
          need: need,
          toNext: maxed ? 0 : Math.max(0, need - dupes),
          ready: !maxed && dupes >= need,
          full: !maxed && wanted <= 0,
          buyable: !maxed && wanted > 0,
          cost: U.craftCost(c.rarity),
          /* upgradeable in place: copies on hand AND coins in the
             one wallet */
          canUp:
            !maxed &&
            U.canLevel(c.id) &&
            window.EOL.econ.coins() >= U.COIN_COST,
        });
      });
    });
    /* ALWAYS BY RARITY (owner ruling 2026-08-16): common first,
       legendary last. A shelf that reshuffles as you buy is a shelf
       you have to re-read every time; rarity is a fixed order the
       player already knows, and it happens to run cheapest-first
       because craft cost scales with rarity. Name breaks ties. */
    out.sort(function (a, b) {
      var ra = RARITY_ORDER[a.card.rarity] || 0;
      var rb = RARITY_ORDER[b.card.rarity] || 0;
      if (ra !== rb) return ra - rb;
      return a.card.name.localeCompare(b.card.name, 'en', { sensitivity: 'base' });
    });
    return out;
  }

  var BOOST_ICON = { atk: 'ra-sword', def: 'ra-shield', hp: 'ra-health' };
  var RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3 };

  /* THE CARD, ONE ROW (2026-08-19 restyle): rarity-tinted rail,
     pips, the copy gap, and a buy button that lights up only when
     the shard balance can actually afford it. */
  function echoCardHTML(r, shards) {
    var U = upg();
    var esc = window.EOL.ui && window.EOL.ui.esc ? window.EOL.ui.esc : String;
    var pips = '';
    for (var i = 1; i <= U.MAX_LEVEL; i++) {
      pips += '<span class="ec-pip' + (i <= r.lv ? ' on' : '') + '"></span>';
    }
    var pct = r.maxed ? 100 : Math.min(100, (Math.min(r.dupes, r.need) / r.need) * 100);
    var boosts = U.boostsOf(r.card.id)
      .map(function (b) {
        return (
          '<i data-icon-domain="game" class="ra ' +
          BOOST_ICON[b] +
          ' ec-boost" data-boost="' +
          b +
          '"></i>'
        );
      })
      .join('');
    var status = r.maxed
      ? '<span class="ec-status maxed">Fully upgraded</span>'
      : r.full
        ? '<span class="ec-status maxed">' + r.dupes + ' / ' + r.dupes + ' copies held</span>'
        : r.ready
          ? '<span class="ec-status ready"><i class="ri-sparkling-line"></i>Ready for level ' +
            (r.lv + 1) +
            '</span>'
          : '<span class="ec-status">' +
            r.toNext +
            (r.toNext === 1 ? ' copy' : ' copies') +
            ' to level ' +
            (r.lv + 1) +
            '</span>';
    var afford = shards >= r.cost && r.buyable;
    return (
      '<article class="ec-card' +
      (r.ready ? ' ready' : '') +
      (r.maxed || r.full ? ' maxed' : '') +
      '" data-echo-card="' +
      esc(r.card.id) +
      '" data-rarity="' +
      esc(r.card.rarity) +
      '" style="--fc-primary:' +
      esc(r.faction.colors.primary) +
      ';--rar:' +
      'var(--r-' +
      esc(r.card.rarity) +
      '-1)' +
      '">' +
      '<span class="ec-art' +
      (r.card.art ? ' has-art' : '') +
      '">' +
      (r.card.art
        ? '<img src="' + esc(r.card.art) + '" alt="" draggable="false" loading="lazy" />'
        : '<i data-icon-domain="game" class="ra ' + esc(r.card.icon) + '"></i>') +
      '<span class="ec-rarity" data-rarity="' +
      esc(r.card.rarity) +
      '">' +
      esc(r.card.rarity) +
      '</span>' +
      '<span class="ec-pips">' +
      pips +
      '</span>' +
      '</span>' +
      '<div class="ec-body">' +
      '<div class="ec-top">' +
      '<b class="ec-name">' +
      esc(r.card.name) +
      '</b>' +
      '<span class="ec-boosts">' +
      boosts +
      '</span>' +
      '</div>' +
      status +
      '<div class="ec-bar"><span style="width:' +
      pct.toFixed(0) +
      '%"></span></div>' +
      '<div class="ec-foot">' +
      '<span class="ec-held">' +
      (r.maxed ? 'no levels left' : r.dupes + ' / ' + r.need + ' copies') +
      '</span>' +
      '<span class="ec-actions">' +
      /* THE UPGRADE BUTTON (2026-08-19): level up right here - it
         costs the copies this card holds plus the coin fee, and it
         lights up only when both are in hand. */
      '<button type="button" class="ec-up' +
      (r.canUp ? ' ok' : '') +
      '" data-echo-up="' +
      esc(r.card.id) +
      '"' +
      (r.canUp ? '' : ' disabled') +
      ' title="Level up (uses ' +
      (U && U.costOfNextLevel ? U.costOfNextLevel(r.card.id) : '') +
      ' copies + ' +
      (U ? U.COIN_COST : 500) +
      ' coins)"><i class="ri-arrow-up-double-line"></i>' +
      (U ? U.COIN_COST : 500).toLocaleString() +
      '</button>' +
      '<button type="button" class="ec-buy' +
      (afford ? ' ok' : '') +
      '" data-echo-buy="' +
      esc(r.card.id) +
      '"' +
      (afford ? '' : ' disabled') +
      ' title="Craft a copy with shards"><i class="ri-sparkling-2-line"></i>' +
      r.cost.toLocaleString() +
      '</button>' +
      '</span>' +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function echoRowsFiltered(all) {
    return all.filter(function (r) {
      if (echoChapter === 'ch1' && CHAPTER2_FACTIONS.indexOf(r.faction.id) >= 0) return false;
      if (echoChapter === 'ch2' && CHAPTER1_FACTIONS.indexOf(r.faction.id) >= 0) return false;
      if (echoFilter === 'ready' && !r.ready) return false;
      if (echoFilter === 'upgradable' && !r.buyable) return false;
      if (echoQuery && r.card.name.toLowerCase().indexOf(echoQuery) < 0) return false;
      return true;
    });
  }

  function renderEchoBatch() {
    var grid = el('echo-grid');
    var sent = el('echo-sentinel');
    if (!grid) return;
    var rows = echoBatch.rows;
    var slice = rows.slice(echoBatch.i, echoBatch.i + ECHO_PAGE);
    grid.insertAdjacentHTML('beforeend', slice.map(function (r) {
      return echoCardHTML(r, upg().shards());
    }).join(''));
    echoBatch.i += slice.length;
    if (sent) sent.hidden = echoBatch.i >= rows.length;
  }

  function armEchoObserver() {
    var sent = el('echo-sentinel');
    if (!sent) return;
    if (echoBatch.observer) echoBatch.observer.disconnect();
    if ('IntersectionObserver' in window) {
      echoBatch.observer = new IntersectionObserver(
        function (entries) {
          if (entries.some(function (e2) { return e2.isIntersecting; })) renderEchoBatch();
        },
        { rootMargin: '600px 0px' }
      );
      echoBatch.observer.observe(sent);
    } else {
      /* no observer: render everything, nothing is lost */
      while (echoBatch.i < echoBatch.rows.length) renderEchoBatch();
    }
  }

  function paintEcho() {
    var grid = el('echo-grid');
    var U = upg();
    if (!grid || !U) return;
    var shards = U.shards();

    var bal = el('echo-balance');
    if (bal) bal.textContent = shards.toLocaleString();

    var all = echoRows();
    /* Say what the balance can actually DO - a number with no frame of
       reference is just a number. */
    var afford = el('echo-afford');
    if (afford) {
      var buyable = all.filter(function (r) {
        return r.buyable && shards >= r.cost;
      }).length;
      afford.textContent = buyable
        ? 'enough for a copy of ' + buyable + ' of your legends'
        : all.length
          ? 'not enough for a copy yet - open packs to melt duplicates'
          : '';
    }

    var rows = echoRowsFiltered(all);

    /* lazy batches: compute once, render as the sentinel approaches */
    grid.innerHTML = '';
    echoBatch.rows = rows;
    echoBatch.i = 0;
    renderEchoBatch();
    armEchoObserver();

    var empty = el('echo-empty');
    if (empty) {
      empty.hidden = rows.length > 0;
      var msg = echoQuery
        ? 'No legend you own matches that name.'
        : echoChapter !== 'all'
          ? 'You own no legends from that chapter yet - open a pack.'
          : echoFilter === 'ready'
            ? 'Nothing is one copy away yet. Buy a copy below, or switch to <b>Upgradable</b>.'
            : all.length
              ? 'Every legend you own is fully upgraded.'
              : 'Open a pack to start collecting legends.';
      empty.innerHTML = '<i class="ri-sparkling-2-line"></i><p>' + msg + '</p>';
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
        if (btn.dataset.pack === 'featured') {
          var slot = parseInt(btn.dataset.slot || '0', 10);
          var meta = featuredMeta(slot);
          begin('featured', {
            _featuredSlot: slot,
            _featuredMeta: meta,
            name: meta.name + ' Pack',
            word: meta.word,
          });
        } else {
          begin(btn.dataset.pack);
        }
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
      if (!currentPack) return;
      if (currentPack.key === 'featured') {
        begin('featured', {
          _featuredSlot: currentPack._featuredSlot,
          _featuredMeta: currentPack._featuredMeta || featuredMeta(currentPack._featuredSlot || 0),
          name: currentPack.name,
          word: currentPack.word,
        });
      } else {
        begin(currentPack.key);
      }
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
    document.querySelectorAll('[data-echo-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        echoFilter = btn.dataset.echoFilter;
        document.querySelectorAll('[data-echo-filter]').forEach(function (b) {
          b.classList.toggle('sel', b === btn);
        });
        paintEcho();
      });
    });
    /* THE CHAPTER TABS: page the owned shelf by chapter. */
    document.querySelectorAll('[data-echo-chapter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        echoChapter = btn.dataset.echoChapter;
        document.querySelectorAll('[data-echo-chapter]').forEach(function (b) {
          b.classList.toggle('sel', b === btn);
        });
        paintEcho();
      });
    });
    var echoGrid = el('echo-grid');
    if (echoGrid)
      echoGrid.addEventListener('click', function (e) {
        var U = upg();
        if (!U) return;
        /* THE UPGRADE BUTTON first: level the card up in place. */
        var upBtn = e.target.closest ? e.target.closest('[data-echo-up]') : null;
        if (upBtn) {
          var upr = U.levelUp(upBtn.dataset.echoUp, 'atk');
          if (upr.ok) {
            if (window.EOL.ui.toast)
              window.EOL.ui.toast(
                'Leveled to ' + upr.lv + ' with an ATK boost',
                'ri-arrow-up-double-line'
              );
            if (window.EOL.audio) window.EOL.audio.ui('levelup');
          } else if (upr.reason === 'dupes') {
            if (window.EOL.ui.toast)
              window.EOL.ui.toast(
                'Not enough copies - craft one below',
                'ri-sparkling-2-fill'
              );
          } else if (upr.reason === 'coins') {
            if (window.EOL.ui.toast)
              window.EOL.ui.toast('Not enough coins - the Road pays', 'ri-coin-fill');
          } else if (upr.reason === 'maxed') {
            if (window.EOL.ui.toast)
              window.EOL.ui.toast('That legend is already fully upgraded', 'ri-information-line');
          }
          paintEcho();
          paintShop();
          return;
        }
        var btn = e.target.closest ? e.target.closest('[data-echo-buy]') : null;
        if (!btn) return;
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
        } else if (r.reason === 'full') {
          /* Nine copies is the cap - every level this card has left is
             already paid for. Buying a tenth would burn shards on
             nothing, which is what the old clamp quietly did. */
          if (window.EOL.ui.toast)
            window.EOL.ui.toast(
              'Already holding every copy this legend can use',
              'ri-information-line'
            );
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
    SHELF_KEYS: SHELF_KEYS,
    FEATURED_WEEKS: FEATURED_WEEKS,
    rollPack: rollPack,
    rollRarity: rollRarity,
    begin: begin,
    openCampaignReward: openCampaignReward,
    openLegendPack: openLegendPack,
    paintShop: paintShop,
    paintEcho: paintEcho,
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
    /* test hooks - the pool maths behind the shelf */
    _packUniverse: packUniverse,
    _duplicateAwarePool: duplicateAwarePool,
    _rotationFor: rotationFor,
    _featuredMeta: featuredMeta,
    _packVisible: packVisible,
    _dailyClaimed: dailyClaimed,
    _markDailyClaimed: markDailyClaimed,
    _dailyDateKey: dailyDateKey,
  };
})();
