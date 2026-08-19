/* =============================================================
   CARD UPGRADES + ECHO SHARDS
   -------------------------------------------------------------
   Duplicates used to be impossible: packs paid only unowned cards,
   so a complete collection turned the shop into a dead end and left
   coins with exactly one sink in the whole codebase. Duplicates are
   now real, and they feed two things at once.

     UPGRADE   0..3 levels per card, costing 1 / 3 / 5 duplicates
               (9 cumulative). Every level grants +2 skill points and
               one chosen raw-stat boost: +5% ATK, +7% HP, or +3% DEF,
               freely re-assignable outside battle.

     SHARDS    every duplicate also yields Echo Shards, and shards
               craft a duplicate of a card you ALREADY OWN at any
               rarity. That is the targeting mechanism: because packs
               have no rarity aiming, collecting 9 copies of one
               specific epic is ~204 hours of play, and melting the
               duplicates you did not want fixes that.

   THE NUMBERS AND WHY (see docs/DESIGN-Card-Upgrades.md)

     +1.5%/level is measured against the roster's tightest INTENTIONAL
     margin between comparable cards - Tomoe Gozen 145%@45 against
     Puss in Boots 150%@40, a 3.45% gap. One level never crosses it.
     A maxed card gains +4.6%, which is past that gap but costs nine
     duplicates sunk into a single legend.

     Craft cost is exactly 20x the yield of the same rarity, so
     melting 20 unwanted epics buys one epic you chose. Random pulls
     always beat crafting on value; shards are the pity floor.

   WHAT UPGRADES NEVER TOUCH

     Thresholds and Energy costs. Anubis stays 25%/35% and stays 45
     Energy at every level. Scaling a damage percentage is smooth;
     moving a threshold is a cliff - his 25% gate is the combo lock
     Ma'at and Sekhmet exist to open. Costs set the tempo of a turn.

   WHERE THEY APPLY

     Classic (single + Unabridged) singleplayer, campaign, MP and
     private rooms. NOT drafts (the great equalizer), NOT the Daily
     Puzzle (it promises everyone the exact same board). Enforced by
     the caller passing `upgrades` into createBattle, so a mode that
     says nothing gets stock cards by default.

   PER-LEVEL BOOSTS (owner ruling 2026-08-16)

     A card's levels no longer share ONE chosen stat. Each level
     carries its own, so "two ATK and one HP" is a real build and a
     maxed card is a small decision rather than a single toggle.

     Storage keeps `boosts: ['atk','hp','atk']` - one entry per level
     purchased, so the array length IS the level and the two can
     never disagree. `stat` survives in the v1 save only long enough
     to be migrated into an array of itself.

   Storage:
     eol.upgrades.v2   { v, shards,
                         cards: { id: {dupes, boosts: [stat, ...]} } }
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var KEY = 'eol.upgrades.v2';
  var LEGACY_KEY = 'eol.upgrades.v1';
  var VERSION = 2;

  var MAX_LEVEL = 3;
  /* duplicates required for level 1, 2, 3 */
  var LEVEL_COST = [1, 3, 5];
  /* FLAT skill bonus per level, in PERCENTAGE POINTS of the skill's
     own printed numbers (owner ruling 2026-08-16). A 50% ATK skill
     reads 52% at level 1, not 50.75% - legible without arithmetic,
     which the old compounding multiplier was not. Kept in lockstep
     with upAdd()/upPts() in js/engine.js. */
  var POWER_PER_LEVEL = 0.02;
  /* Chosen raw-stat boost per level. HP gets the largest percentage
     because health must survive an entire enemy turn; ATK is smaller
     because it amplifies every damaging action. DEF is percentage-point
     mitigation and therefore uses its own flat constant below. */
  var ATK_PER_LEVEL = 0.05;
  var HP_PER_LEVEL = 0.07;
  /* Legacy public alias retained for older integrations that read it. */
  var STAT_PER_LEVEL = ATK_PER_LEVEL;
  /* COINS PER LEVEL (owner ruling 2026-08-16). Copies alone were a
     pure time gate; a price makes levelling compete with packs for
     the same wallet, which is what makes it a decision. Flat rather
     than per-rarity: the duplicate cost already scales the grind. */
  var COIN_COST = 500;
  var STATS = ['atk', 'def', 'hp'];

  /* DEF receives a relative +3% per chosen level. Keep one decimal in
     presentation and battle state so the smaller stat does not round away. */
  var DEF_PER_LEVEL = 0.03;

  var SHARD_YIELD = { common: 15, rare: 60, epic: 200, legendary: 400 };
  var SHARD_CRAFT = { common: 300, rare: 1200, epic: 4000, legendary: 8000 };

  var state = null;

  function blank() {
    return { v: VERSION, shards: 0, cards: {} };
  }

  /* Normalise one card record from any stored shape into the v2
     one: { dupes, boosts: [stat, ...] }. */
  function readRec(r) {
    if (!r || typeof r !== 'object') return null;
    var boosts = [];
    if (Array.isArray(r.boosts)) {
      /* null is legal and meaningful: the level is bought but its
         boost has not been chosen yet. Anything unrecognised becomes
         null rather than being dropped, so the array length always
         equals the level. */
      r.boosts.forEach(function (b) {
        if (boosts.length < MAX_LEVEL) boosts.push(STATS.indexOf(b) >= 0 ? b : null);
      });
    } else {
      /* v1: ONE stat shared by every level. The honest migration is
         that same stat repeated `lv` times - the player's numbers do
         not change, they simply become editable per level. */
      var lv = Math.max(0, Math.min(MAX_LEVEL, Math.floor(+r.lv || 0)));
      var stat = STATS.indexOf(r.stat) >= 0 ? r.stat : 'atk';
      for (var i = 0; i < lv; i++) boosts.push(stat);
    }
    return { dupes: Math.max(0, Math.floor(+r.dupes || 0)), boosts: boosts };
  }

  function load() {
    if (state) return state;
    state = blank();
    try {
      /* Read v2, or migrate a v1 save once. The v1 key is left in
         place rather than deleted: a player who rolls the build back
         should find their upgrades, not an empty collection. */
      var raw = JSON.parse(localStorage.getItem(KEY));
      var migrating = false;
      if (!raw) {
        raw = JSON.parse(localStorage.getItem(LEGACY_KEY));
        migrating = !!raw;
      }
      if (raw && typeof raw === 'object') {
        state.shards = Math.max(0, Math.floor(+raw.shards || 0));
        if (raw.cards && typeof raw.cards === 'object') {
          Object.keys(raw.cards).forEach(function (id) {
            var rec2 = readRec(raw.cards[id]);
            if (rec2) state.cards[id] = rec2;
          });
        }
      }
      if (migrating) save();
    } catch (e) {
      /* a broken save must never break the boot */
      state = blank();
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(load()));
    } catch (e) {
      /* private mode: the session still works, it just forgets */
    }
    emit();
  }

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('eol:upgrades', { detail: summary() }));
    } catch (e) {
      /* no CustomEvent in a headless harness - nothing is listening there */
    }
  }

  function rec(id) {
    var s = load();
    if (!s.cards[id]) s.cards[id] = { dupes: 0, boosts: [] };
    return s.cards[id];
  }

  /* ---------------------------------------------------------
     card lookup - the roster is the source of truth for rarity
     --------------------------------------------------------- */
  var BY_ID = null;
  function cardById(id) {
    if (!BY_ID) {
      BY_ID = {};
      (window.EOL.factions || []).forEach(function (f) {
        f.cards.forEach(function (c) {
          BY_ID[c.id] = c;
        });
      });
    }
    return BY_ID[id] || null;
  }
  function rarityOf(id) {
    var c = cardById(id);
    return (c && c.rarity) || 'common';
  }

  /* ---------------------------------------------------------
     reading a card's upgrade
     --------------------------------------------------------- */
  /* THE LEVEL IS THE COUNT OF BOOSTS - including levels whose boost
     is still unassigned (stored as null). Storing the level
     separately would be a second source of truth that could disagree
     with the array. */
  function levelOf(id) {
    var s = load();
    return s.cards[id] ? s.cards[id].boosts.length : 0;
  }
  /* The boost chosen at each level, oldest first. */
  function boostsOf(id) {
    var s = load();
    return s.cards[id] ? s.cards[id].boosts.slice() : [];
  }
  /* How many levels went into each stat - what the engine and the UI
     actually need, since order does not affect the maths. */
  function boostCounts(id) {
    var out = { atk: 0, def: 0, hp: 0 };
    boostsOf(id).forEach(function (b) {
      /* an unassigned level counts toward nothing until it is picked */
      if (b && out[b] != null) out[b]++;
    });
    return out;
  }
  /* Back-compat: the DOMINANT stat, for anything that still wants one
     word for a build. Ties break by the STATS order so it is stable. */
  function statOf(id) {
    var c = boostCounts(id);
    var best = 'atk';
    STATS.forEach(function (k) {
      if (c[k] > c[best]) best = k;
    });
    return c[best] > 0 ? best : 'atk';
  }
  function dupesOf(id) {
    var s = load();
    return s.cards[id] ? s.cards[id].dupes : 0;
  }
  function costOfNextLevel(id) {
    var lv = levelOf(id);
    return lv >= MAX_LEVEL ? 0 : LEVEL_COST[lv];
  }
  function canLevel(id) {
    var lv = levelOf(id);
    if (lv >= MAX_LEVEL) return false;
    return dupesOf(id) >= LEVEL_COST[lv];
  }

  /* THE MULTIPLIERS. One place, so the engine, the collection UI and
     the battle preview can never disagree about what an upgrade is
     worth. Power compounds; the stat bonus is linear per level. */
  /* The skill bonus as a MULTIPLIER is gone - it is flat now. This
     returns the added fraction (0.06 at max), which is what the text
     scaler and the UI both want. */
  function powerAdd(lv) {
    lv = Math.max(0, Math.min(MAX_LEVEL, Math.floor(+lv || 0)));
    return POWER_PER_LEVEL * lv;
  }
  /* Back-compat shim for anything still asking for a multiplier. It
     is only meaningful as "+6%", never as a factor to multiply by. */
  function powerMult(lv) {
    return 1 + powerAdd(lv);
  }
  function statMult(lv) {
    lv = Math.max(0, Math.min(MAX_LEVEL, Math.floor(+lv || 0)));
    return 1 + STAT_PER_LEVEL * lv;
  }

  /* ---------------------------------------------------------
     THE BATTLE PAYLOAD
     -------------------------------------------------------------
     What createBattle consumes: { cardId: {lv, stat} }. Built for a
     specific list of card ids so a caller never leaks upgrades for
     cards that are not in the fight. Modes that pass nothing get
     stock cards, which is the safe default for drafts and puzzles.
     --------------------------------------------------------- */
  function payloadFor(ids) {
    var out = {};
    (ids || []).forEach(function (id) {
      var cid = id && id.card ? id.card.id : id;
      var b = boostsOf(cid);
      /* `lv` rides along for older readers, but `boosts` is the
         authority - its length IS the level. */
      if (b.length) out[cid] = { lv: b.length, boosts: b };
    });
    return out;
  }

  /* Sanitize a payload that arrived over the wire. An opponent's
     levels are applied to the opponent's team, so they must be
     clamped to the legal range before they touch the engine. */
  function sanitize(payload) {
    var out = {};
    if (!payload || typeof payload !== 'object') return out;
    Object.keys(payload).forEach(function (id) {
      var r = payload[id];
      if (!r || typeof r !== 'object') return;
      /* An opponent's build is untrusted input applied to their team,
         so it is rebuilt from scratch rather than trimmed: only known
         stat names survive, and never more than MAX_LEVEL of them.
         A payload carrying only the legacy {lv, stat} is expanded the
         same way the v1 save migration does. */
      var boosts = [];
      if (Array.isArray(r.boosts)) {
        /* null survives - it is a bought level with no stat picked
           yet, and the array length is the level. */
        r.boosts.forEach(function (b) {
          if (boosts.length < MAX_LEVEL) boosts.push(STATS.indexOf(b) >= 0 ? b : null);
        });
      } else {
        var lv = Math.max(0, Math.min(MAX_LEVEL, Math.floor(+r.lv || 0)));
        var stat = STATS.indexOf(r.stat) >= 0 ? r.stat : 'atk';
        for (var i = 0; i < lv; i++) boosts.push(stat);
      }
      if (!boosts.length) return;
      out[id] = { lv: boosts.length, boosts: boosts };
    });
    return out;
  }

  /* ---------------------------------------------------------
     earning
     --------------------------------------------------------- */
  function shards() {
    return load().shards;
  }
  function addShards(n) {
    var s = load();
    s.shards = Math.max(0, s.shards + Math.floor(+n || 0));
    save();
    return s.shards;
  }
  function spendShards(n) {
    var s = load();
    n = Math.floor(+n || 0);
    if (n <= 0 || s.shards < n) return false;
    s.shards -= n;
    save();
    return true;
  }
  function shardYield(rarity) {
    return SHARD_YIELD[rarity] || SHARD_YIELD.common;
  }
  function craftCost(rarity) {
    return SHARD_CRAFT[rarity] || SHARD_CRAFT.common;
  }

  /* A DUPLICATE ARRIVED. Pays shards always, and banks toward the
     next level while the card is not maxed. Returns what happened so
     the pack ceremony can say so. */
  function addDuplicate(id, n) {
    n = Math.max(1, Math.floor(+n || 1));
    var r = rec(id);
    var rarity = rarityOf(id);
    var gained = shardYield(rarity) * n;
    var s = load();
    s.shards += gained;
    /* Banked duplicates are capped at what the remaining levels can
       ever consume, so a maxed card does not hoard an invisible pile
       that would be refunded as nothing. Overflow is shards only. */
    var remaining = 0;
    for (var i = r.boosts.length; i < MAX_LEVEL; i++) remaining += LEVEL_COST[i];
    if (r.dupes < remaining) r.dupes = Math.min(remaining, r.dupes + n);
    save();
    return { shards: gained, dupes: r.dupes, maxed: r.boosts.length >= MAX_LEVEL };
  }

  /* CRAFT: shards buy a duplicate of a card you ALREADY OWN, at any
     rarity. Never a card you do not own - crafting is an upgrade
     currency, not a collection shortcut, so packs stay the only way
     to widen a collection and the Crown Law is untouched. */
  /* How many more copies this card can still USE: the duplicates its
     remaining levels will consume, minus what is already banked. Zero
     means every future level is already paid for. */
  function copiesWanted(id) {
    var r = rec(id);
    var remaining = 0;
    for (var i = r.boosts.length; i < MAX_LEVEL; i++) remaining += LEVEL_COST[i];
    return Math.max(0, remaining - r.dupes);
  }

  function craft(id) {
    var econ = window.EOL.econ;
    if (!cardById(id)) return { ok: false, reason: 'unknown' };
    if (econ && !econ.owns(id)) return { ok: false, reason: 'unowned' };
    var r = rec(id);
    if (r.boosts.length >= MAX_LEVEL) return { ok: false, reason: 'maxed' };
    /* A CARD HOLDS AT MOST NINE COPIES - what its three levels can
       consume - and never more (owner ruling 2026-08-16). This used
       to take the shards and then silently clamp `dupes`, so a full
       bank charged full price for nothing. Refused outright now. */
    if (copiesWanted(id) <= 0) return { ok: false, reason: 'full' };
    var cost = craftCost(rarityOf(id));
    var s = load();
    if (s.shards < cost) return { ok: false, reason: 'shards', cost: cost };
    s.shards -= cost;
    r.dupes += 1;
    save();
    return { ok: true, cost: cost, dupes: r.dupes };
  }

  /* SPEND banked duplicates on the next level. Boosts are recorded per
     level, leaving earlier choices alone. `stat` is optional: ATK is the
     visible default for every new level;
     callers may still pass HP or DEF explicitly, and the player can freely
     reassign any level afterwards outside battle. */
  function levelUp(id, stat) {
    var r = rec(id);
    if (r.boosts.length >= MAX_LEVEL) return { ok: false, reason: 'maxed' };
    var cost = LEVEL_COST[r.boosts.length];
    if (r.dupes < cost) return { ok: false, reason: 'dupes', cost: cost };
    /* COINS TOO. Checked before anything is spent, and taken through
       econ.spend so the one wallet stays the only place coins move. */
    var econ = window.EOL.econ;
    if (econ) {
      if (econ.coins() < COIN_COST) return { ok: false, reason: 'coins', coins: COIN_COST };
      if (!econ.spend(COIN_COST)) return { ok: false, reason: 'coins', coins: COIN_COST };
    }
    r.dupes -= cost;
    r.boosts.push(STATS.indexOf(stat) >= 0 ? stat : 'atk');
    save();
    return {
      ok: true,
      lv: r.boosts.length,
      stat: r.boosts[r.boosts.length - 1],
      coins: COIN_COST,
    };
  }

  /* RESPEC: free, and allowed only outside a battle. battle.js sets
     the lock at start and clears it at the result screen, so a
     re-assignment can never be used as a mid-fight tactic. */
  var battleLock = false;
  function setBattleLock(on) {
    battleLock = !!on;
  }
  /* Re-assign the boost on ONE level. `level` is 1-based, matching
     what the player sees on the pips. */
  function setBoost(id, level, stat) {
    if (battleLock) return { ok: false, reason: 'inBattle' };
    if (STATS.indexOf(stat) < 0) return { ok: false, reason: 'stat' };
    var r = rec(id);
    var i = Math.floor(+level || 0) - 1;
    if (i < 0 || i >= r.boosts.length) return { ok: false, reason: 'level' };
    if (r.boosts[i] === stat) return { ok: true, stat: stat, unchanged: true };
    r.boosts[i] = stat;
    save();
    return { ok: true, stat: stat, level: i + 1 };
  }

  /* Back-compat: point EVERY purchased level at one stat. The old
     one-stat-per-card respec, expressed in the new model. */
  function setStat(id, stat) {
    if (battleLock) return { ok: false, reason: 'inBattle' };
    if (STATS.indexOf(stat) < 0) return { ok: false, reason: 'stat' };
    var r = rec(id);
    if (!r.boosts.length) return { ok: false, reason: 'level' };
    r.boosts = r.boosts.map(function () {
      return stat;
    });
    save();
    return { ok: true, stat: stat };
  }

  function summary() {
    var s = load();
    var lv = 0;
    var maxed = 0;
    Object.keys(s.cards).forEach(function (id) {
      var n = s.cards[id].boosts.length;
      if (n > 0) lv++;
      if (n >= MAX_LEVEL) maxed++;
    });
    return { shards: s.shards, upgraded: lv, maxed: maxed };
  }

  /* Display helper: the card's numbers with its boosts applied. Used
     by the collection so the player sees exactly what the levels
     bought. Each stat moves by however many levels chose it, so this
     must agree exactly with applyUpgrades() in js/engine.js. */
  function statsFor(id, card) {
    card = card || cardById(id);
    if (!card) return null;
    var c = boostCounts(id);
    var lv = levelOf(id);
    return {
      hp: c.hp ? Math.round(card.stats.hp * (1 + HP_PER_LEVEL * c.hp)) : card.stats.hp,
      atk: c.atk ? Math.round(card.stats.atk * (1 + ATK_PER_LEVEL * c.atk)) : card.stats.atk,
      def: c.def
        ? Math.round(card.stats.def * (1 + DEF_PER_LEVEL * c.def) * 10) / 10
        : card.stats.def,
      lv: lv,
      counts: c,
      stat: statOf(id),
      power: powerMult(lv),
    };
  }

  window.EOL.upgrades = {
    MAX_LEVEL: MAX_LEVEL,
    LEVEL_COST: LEVEL_COST,
    POWER_PER_LEVEL: POWER_PER_LEVEL,
    COIN_COST: COIN_COST,
    STAT_PER_LEVEL: STAT_PER_LEVEL,
    ATK_PER_LEVEL: ATK_PER_LEVEL,
    HP_PER_LEVEL: HP_PER_LEVEL,
    DEF_PER_LEVEL: DEF_PER_LEVEL,
    STATS: STATS,
    SHARD_YIELD: SHARD_YIELD,
    SHARD_CRAFT: SHARD_CRAFT,

    levelOf: levelOf,
    statOf: statOf,
    boostsOf: boostsOf,
    boostCounts: boostCounts,
    dupesOf: dupesOf,
    costOfNextLevel: costOfNextLevel,
    copiesWanted: copiesWanted,
    canLevel: canLevel,
    powerMult: powerMult,
    powerAdd: powerAdd,
    statMult: statMult,
    statsFor: statsFor,

    payloadFor: payloadFor,
    sanitize: sanitize,

    shards: shards,
    addShards: addShards,
    spendShards: spendShards,
    shardYield: shardYield,
    craftCost: craftCost,
    addDuplicate: addDuplicate,
    craft: craft,
    levelUp: levelUp,
    setStat: setStat,
    setBoost: setBoost,
    setBattleLock: setBattleLock,
    summary: summary,

    /* test hooks */
    _reload: function () {
      /* Drop the in-memory copy and read storage again - the only way
         to exercise the v1 -> v2 migration from a test. */
      state = null;
      return load();
    },
    _reset: function () {
      state = blank();
      battleLock = false;
      try {
        localStorage.removeItem(KEY);
      } catch (e) {
        /* fine */
      }
    },
    _state: function () {
      return load();
    },
  };
})();
