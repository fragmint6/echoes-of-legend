/* =============================================================
 * Echoes of Legend — Card Data Registry & Schema
 * =============================================================
 * Faction files register themselves into window.EOL.factions.
 * Loaded via plain <script> tags so the game runs from file://
 * without needing a local web server.
 *
 * ---- CARD SCHEMA -------------------------------------------
 * {
 *   id:        string   unique slug, e.g. "camelot-king-arthur"
 *   name:      string   display name
 *   faction:   string   faction id (set automatically on register)
 *   rarity:    "legendary" | "epic" | "rare" | "common"
 *   role:      "Tank" | "Bruiser" | "Caster" | "Controller" | "Medic" | "Sniper"
 *   element:   "Physical" | "Magic" | "Shadow" | "Light" | "Lightning" | "Fire" | "Nature"
 *   stats:     { hp: number, atk: number, def: number (percent) }
 * ---- EFFECT TIMING ------------------------------------------
 * Each effect may carry `when`:
 *   'now'   applies immediately
 *   'turn'  applies when the acting side next hands over control
 *   'round' applies at the end of the round (after both sides)
 * If omitted: damage/heals are immediate, stat+flag effects are
 * immediate on self/allies and end-of-turn on enemies.
 * `turns` durations are counted in ROUNDS and tick once, at the round
 * rollover. 1 = lasts to the END OF THE CURRENT ROUND; 2 = to the end of
 * the next round. The golden rule is that an effect lasts 1 round unless
 * it says otherwise.
 *
 *   ability: {
 *     type:    "Passive" | "Active"
 *     name:    string
 *     cost:    number|null   energy cost — Actives only
 *     text:    string        full description, written as prose. Keep it to
 *                            one sentence where possible; may contain <b>.
 *     note:    string|null   trailing footnote, used for stacking caps and
 *                            limits, e.g. "Max: 5 stacks." / "Once per battle."
 *   }
 *   icon:      string        RPG Awesome class — this IS the card art
 * }
 *
 * ---- STATUS EFFECTS -----------------------------------------
 * Two damage/defence states beyond the ordinary stat buffs:
 *
 *   Burn     { k: 'burn', turns: N }
 *              Deals 5% of the victim's MAX HP on EVERY TURN that
 *              hero's side takes, ignoring DEF and shields. The
 *              DURATION counts down in ROUNDS, so a 2-round Burn keeps
 *              ticking on each of the victim's turns until the round
 *              timer runs out - it hurts more the more actions a side
 *              takes. Does NOT stack; re-applying refreshes it.
 *
 *   Exposed  { k: 'exposed', turns: N }
 *              Defence is treated as 0% for the duration: base DEF,
 *              DEF buffs and the back-line penalty are all ignored.
 *
 * Both count as debuffs for anything that reads hasDebuff() (Robin
 * Hood, Big Bad Wolf, Red Riding Hood, Abe no Seimei, Caster Basic).
 *
 * ---- NOTES --------------------------------------------------
 *  - Passives never have a cooldown.
 *  - Cards are icon-only by design; there is no image field.
 *  - Initiative alternates every round (odd = player, even = enemy)
 *    so neither side keeps the opening move.
 * ============================================================= */

window.EOL = window.EOL || {};
window.EOL.factions = window.EOL.factions || [];

window.EOL.registerFaction = function (faction) {
  faction.cards.forEach(function (c) {
    c.faction = faction.id;
  });
  window.EOL.factions.push(faction);
};

/* =============================================================
   DECK CONSTRUCTION RULES
   -------------------------------------------------------------
   Hard legality rule shared by the deck builder, battle team
   generation and the sim harness: at most MAX_PER_ROLE heroes of
   the same role in one team of six. `roleCount` counts members,
   `withinRoleCap` validates an id list, `splitCapped` draws two
   legal teams of six from a shuffled entry pool (greedy walk with
   reshuffle retry — the pool is 36 heroes across 6 roles, so it
   converges immediately).
   ============================================================= */
window.EOL.rules = (function () {
  var MAX_PER_ROLE = 3;

  function roleCount(entries, role, exceptId) {
    var n = 0;
    entries.forEach(function (e) {
      if (!e) return;
      var card = e.card || e;
      if (exceptId && card.id === exceptId) return;
      if (card.role === role) n++;
    });
    return n;
  }

  function withinRoleCap(entries) {
    var cnt = {};
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i]) continue;
      var role = (entries[i].card || entries[i]).role;
      cnt[role] = (cnt[role] || 0) + 1;
      if (cnt[role] > MAX_PER_ROLE) return false;
    }
    return true;
  }

  /* Shuffle the pool with rng, then walk it filling team A then team B,
     skipping any hero whose role is already at the cap in that team. */
  function splitCapped(pool, rng) {
    rng = rng || Math.random;
    for (var attempt = 0; attempt < 100; attempt++) {
      var idx = pool.map(function (_, i) { return i; });
      for (var i = idx.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
      }
      var teams = [[], []], counts = [{}, {}], cur = 0;
      for (var k = 0; k < idx.length; k++) {
        var e = pool[idx[k]];
        var role = (e.card || e).role;
        if ((counts[cur][role] || 0) >= MAX_PER_ROLE) continue;
        teams[cur].push(e);
        counts[cur][role] = (counts[cur][role] || 0) + 1;
        if (teams[cur].length === 6) { cur++; if (cur === 2) break; }
      }
      if (teams[0].length === 6 && teams[1].length === 6) return teams;
    }
    throw new Error('splitCapped: could not draw two legal teams');
  }

  return {
    MAX_PER_ROLE: MAX_PER_ROLE,
    roleCount: roleCount,
    withinRoleCap: withinRoleCap,
    splitCapped: splitCapped
  };
})();

/* =============================================================
   GAME DECK RULES (post pass-12 model — Classic & Draft modes)
   -------------------------------------------------------------
   A game deck is 12 distinct heroes, at most 4 of any one role.
   Every battle opens with the PREPARATION phase: each side bans
   BANS heroes from the opponent's 12 (chosen simultaneously,
   revealed together), then fields FIELD_SIZE = 6 of their own
   remaining (12 - BANS) heroes. Per the 2026-07-30 ruling the
   deck's max-4 is the ONLY legality rule: the battle six may
   field all 4 of a role. `EOL.rules` above (max 3 on a team of
   six) now belongs ONLY to the sim series, which re-baselines
   whenever it adopts the 12-card model.
   ============================================================= */
window.EOL.deckRules = (function () {
  var DECK_SIZE = 12;
  var MAX_PER_ROLE = 4;
  var BANS = 2;
  var FIELD_SIZE = 6;

  /* True when a list of entries/ids is a legal deck: full size,
     every hero distinct, at most MAX_PER_ROLE of any role. */
  function isLegal(entries) {
    if (!entries || entries.length !== DECK_SIZE) return false;
    var seen = {}, cnt = {};
    for (var i = 0; i < entries.length; i++) {
      var card = entries[i].card || entries[i];
      if (!card || !card.id) return false;
      if (seen[card.id]) return false;
      seen[card.id] = true;
      cnt[card.role] = (cnt[card.role] || 0) + 1;
      if (cnt[card.role] > MAX_PER_ROLE) return false;
    }
    return true;
  }

  /* Would adding `card` to a partial deck breach the role cap? */
  function capBlocked(entries, card) {
    var n = 0;
    entries.forEach(function (e) {
      if ((e.card || e).role === card.role) n++;
    });
    return n >= MAX_PER_ROLE;
  }

  /* Draw a random legal deck of 12 distinct heroes (max 4/role) from
     an entry pool ({card,faction}). Used for the Classic bot. */
  function randomDeck(pool, rng) {
    rng = rng || Math.random;
    var idx = pool.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    var out = [], cnt = {};
    for (var k = 0; k < idx.length && out.length < DECK_SIZE; k++) {
      var e = pool[idx[k]];
      var role = e.card.role;
      if ((cnt[role] || 0) >= MAX_PER_ROLE) continue;
      cnt[role] = (cnt[role] || 0) + 1;
      out.push(e);
    }
    return out.length === DECK_SIZE ? out : null;
  }

  /* Draft pool: the full 36-hero roster. Once every role has at
     least 6 heroes in the game, the pool becomes 6-per-role snapshotted
     from the roster — the draft law the pool is designed around. */
  function draftPool(pool, rng) {
    var byRole = {};
    pool.forEach(function (e) {
      (byRole[e.card.role] = byRole[e.card.role] || []).push(e);
    });
    var roles = Object.keys(byRole);
    var canSnap = roles.every(function (r) { return byRole[r].length >= 6; });
    if (!canSnap) return pool.slice();    // current roster: just use every card
    rng = rng || Math.random;
    var out = [];
    roles.forEach(function (r) {
      var list = byRole[r].slice();
      for (var i = list.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var t = list[i]; list[i] = list[j]; list[j] = t;
      }
      out = out.concat(list.slice(0, 6));
    });
    return out;
  }

  return {
    DECK_SIZE: DECK_SIZE,
    MAX_PER_ROLE: MAX_PER_ROLE,
    BANS: BANS,
    FIELD_SIZE: FIELD_SIZE,
    isLegal: isLegal,
    capBlocked: capBlocked,
    randomDeck: randomDeck,
    draftPool: draftPool
  };
})();
