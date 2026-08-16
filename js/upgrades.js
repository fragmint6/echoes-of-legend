/* =============================================================
   CARD UPGRADES + ECHO SHARDS
   -------------------------------------------------------------
   Duplicates used to be impossible: packs paid only unowned cards,
   so a complete collection turned the shop into a dead end and left
   coins with exactly one sink in the whole codebase. Duplicates are
   now real, and they feed two things at once.

     UPGRADE   0..3 levels per card, costing 1 / 3 / 5 duplicates
               (9 cumulative). Every level grants BOTH a compounding
               +1.5% skill power AND +2% of one stat the player picks
               (ATK, DEF or HP), freely re-assignable outside battle.

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

   Storage:
     eol.upgrades.v1   { v, shards, cards: { id: {dupes, lv, stat} } }
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var KEY = 'eol.upgrades.v1';

  var MAX_LEVEL = 3;
  /* duplicates required for level 1, 2, 3 */
  var LEVEL_COST = [1, 3, 5];
  /* compounding skill power per level */
  var POWER_PER_LEVEL = 0.015;
  /* chosen stat, per level */
  var STAT_PER_LEVEL = 0.02;
  var STATS = ['atk', 'def', 'hp'];

  /* DEF is a percentage-POINT damage reducer (roster range 10..30,
     engine clamp 0..75), not a scalable stat: multiplying it by 1.02
     rounds straight back to where it started. So DEF gets flat points
     instead, sized to match the other two choices in value - +1.5
     points per level is +5.3% to +6.9% effective HP at max, against
     +6% for the HP choice. Kept in lockstep with engine.js. */
  var DEF_POINTS_PER_LEVEL = 1.5;

  var SHARD_YIELD = { common: 15, rare: 60, epic: 200, legendary: 400 };
  var SHARD_CRAFT = { common: 300, rare: 1200, epic: 4000, legendary: 8000 };

  var state = null;

  function blank() {
    return { v: 1, shards: 0, cards: {} };
  }

  function load() {
    if (state) return state;
    state = blank();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        state.shards = Math.max(0, Math.floor(+raw.shards || 0));
        if (raw.cards && typeof raw.cards === 'object') {
          Object.keys(raw.cards).forEach(function (id) {
            var r = raw.cards[id];
            if (!r || typeof r !== 'object') return;
            var lv = Math.max(0, Math.min(MAX_LEVEL, Math.floor(+r.lv || 0)));
            var stat = STATS.indexOf(r.stat) >= 0 ? r.stat : 'atk';
            state.cards[id] = {
              dupes: Math.max(0, Math.floor(+r.dupes || 0)),
              lv: lv,
              stat: stat,
            };
          });
        }
      }
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
    if (!s.cards[id]) s.cards[id] = { dupes: 0, lv: 0, stat: 'atk' };
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
  function levelOf(id) {
    var s = load();
    return s.cards[id] ? s.cards[id].lv : 0;
  }
  function statOf(id) {
    var s = load();
    return s.cards[id] ? s.cards[id].stat : 'atk';
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
  function powerMult(lv) {
    lv = Math.max(0, Math.min(MAX_LEVEL, Math.floor(+lv || 0)));
    return Math.pow(1 + POWER_PER_LEVEL, lv);
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
      var lv = levelOf(cid);
      if (lv > 0) out[cid] = { lv: lv, stat: statOf(cid) };
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
      var lv = Math.max(0, Math.min(MAX_LEVEL, Math.floor(+r.lv || 0)));
      if (!lv) return;
      out[id] = { lv: lv, stat: STATS.indexOf(r.stat) >= 0 ? r.stat : 'atk' };
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
    for (var i = r.lv; i < MAX_LEVEL; i++) remaining += LEVEL_COST[i];
    if (r.dupes < remaining) r.dupes = Math.min(remaining, r.dupes + n);
    save();
    return { shards: gained, dupes: r.dupes, maxed: r.lv >= MAX_LEVEL };
  }

  /* CRAFT: shards buy a duplicate of a card you ALREADY OWN, at any
     rarity. Never a card you do not own - crafting is an upgrade
     currency, not a collection shortcut, so packs stay the only way
     to widen a collection and the Crown Law is untouched. */
  function craft(id) {
    var econ = window.EOL.econ;
    if (!cardById(id)) return { ok: false, reason: 'unknown' };
    if (econ && !econ.owns(id)) return { ok: false, reason: 'unowned' };
    var r = rec(id);
    if (r.lv >= MAX_LEVEL) return { ok: false, reason: 'maxed' };
    var cost = craftCost(rarityOf(id));
    var s = load();
    if (s.shards < cost) return { ok: false, reason: 'shards', cost: cost };
    s.shards -= cost;
    var remaining = 0;
    for (var i = r.lv; i < MAX_LEVEL; i++) remaining += LEVEL_COST[i];
    r.dupes = Math.min(remaining, r.dupes + 1);
    save();
    return { ok: true, cost: cost, dupes: r.dupes };
  }

  /* SPEND banked duplicates on the next level. Explicit rather than
     automatic: the stat choice should be deliberate. */
  function levelUp(id, stat) {
    var r = rec(id);
    if (r.lv >= MAX_LEVEL) return { ok: false, reason: 'maxed' };
    var cost = LEVEL_COST[r.lv];
    if (r.dupes < cost) return { ok: false, reason: 'dupes', cost: cost };
    r.dupes -= cost;
    r.lv += 1;
    if (STATS.indexOf(stat) >= 0) r.stat = stat;
    save();
    return { ok: true, lv: r.lv, stat: r.stat };
  }

  /* RESPEC: free, and allowed only outside a battle. battle.js sets
     the lock at start and clears it at the result screen, so a
     re-assignment can never be used as a mid-fight tactic. */
  var battleLock = false;
  function setBattleLock(on) {
    battleLock = !!on;
  }
  function setStat(id, stat) {
    if (battleLock) return { ok: false, reason: 'inBattle' };
    if (STATS.indexOf(stat) < 0) return { ok: false, reason: 'stat' };
    var r = rec(id);
    if (!r.lv) return { ok: false, reason: 'level' };
    r.stat = stat;
    save();
    return { ok: true, stat: stat };
  }

  function summary() {
    var s = load();
    var lv = 0;
    var maxed = 0;
    Object.keys(s.cards).forEach(function (id) {
      if (s.cards[id].lv > 0) lv++;
      if (s.cards[id].lv >= MAX_LEVEL) maxed++;
    });
    return { shards: s.shards, upgraded: lv, maxed: maxed };
  }

  /* Display helper: the card's numbers at its current level. Used by
     the collection so the player sees exactly what a level bought. */
  function statsFor(id, card) {
    card = card || cardById(id);
    if (!card) return null;
    var lv = levelOf(id);
    var stat = statOf(id);
    var m = statMult(lv);
    var out = {
      hp: card.stats.hp,
      atk: card.stats.atk,
      def: card.stats.def,
      lv: lv,
      stat: stat,
      power: powerMult(lv),
    };
    if (lv > 0) {
      if (stat === 'atk') out.atk = Math.round(card.stats.atk * m);
      else if (stat === 'hp') out.hp = Math.round(card.stats.hp * m);
      else if (stat === 'def') out.def = card.stats.def + DEF_POINTS_PER_LEVEL * lv;
    }
    return out;
  }

  window.EOL.upgrades = {
    MAX_LEVEL: MAX_LEVEL,
    LEVEL_COST: LEVEL_COST,
    POWER_PER_LEVEL: POWER_PER_LEVEL,
    STAT_PER_LEVEL: STAT_PER_LEVEL,
    DEF_POINTS_PER_LEVEL: DEF_POINTS_PER_LEVEL,
    STATS: STATS,
    SHARD_YIELD: SHARD_YIELD,
    SHARD_CRAFT: SHARD_CRAFT,

    levelOf: levelOf,
    statOf: statOf,
    dupesOf: dupesOf,
    costOfNextLevel: costOfNextLevel,
    canLevel: canLevel,
    powerMult: powerMult,
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
    setBattleLock: setBattleLock,
    summary: summary,

    /* test hooks */
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
