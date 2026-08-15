/* =============================================================
 * Echoes of Legend - Card Data Registry & Schema
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
 *     cost:    number|null   energy cost - Actives only
 *     text:    string        full description, written as prose. Keep it to
 *                            one sentence where possible; may contain <b>.
 *     note:    string|null   trailing footnote, used for stacking caps and
 *                            limits, e.g. "Max: 5 stacks." / "Once per battle."
 *   }
 *   icon:      string        RPG Awesome class - fallback art, and the
 *                            glyph still used in lists and tooltips
 *   art:       string|null   optional path to a 128x176 pixel-art portrait
 *                            (lossless PNG), relative to the project root.
 *                            When present the card renders it instead of the
 *                            icon glyph. See docs/ART-SPEC.md (rev 4) and
 *                            assets/legends/MANIFEST.csv.
 * }
 *
 * ---- STATUS EFFECTS -----------------------------------------
 * Two damage/defence states beyond the ordinary stat buffs:
 *
 *   Burn     { k: 'burn', turns: N }
 *              Deals 5% of the victim's MAX HP on EVERY TURN that
 *              legend's side takes, ignoring DEF and shields. The
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
   generation and the sim harness: at most MAX_PER_ROLE legends of
   the same role in one team of six. `roleCount` counts members,
   `withinRoleCap` validates an id list, `splitCapped` draws two
   legal teams of six from a shuffled entry pool (greedy walk with
   reshuffle retry - the pool is 36 legends across 6 roles, so it
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
     skipping any legend whose role is already at the cap in that team. */
  function splitCapped(pool, rng) {
    rng = rng || Math.random;
    for (var attempt = 0; attempt < 100; attempt++) {
      var idx = pool.map(function (_, i) {
        return i;
      });
      for (var i = idx.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var t = idx[i];
        idx[i] = idx[j];
        idx[j] = t;
      }
      var teams = [[], []],
        counts = [{}, {}],
        cur = 0;
      for (var k = 0; k < idx.length; k++) {
        var e = pool[idx[k]];
        var role = (e.card || e).role;
        if ((counts[cur][role] || 0) >= MAX_PER_ROLE) continue;
        teams[cur].push(e);
        counts[cur][role] = (counts[cur][role] || 0) + 1;
        if (teams[cur].length === 6) {
          cur++;
          if (cur === 2) break;
        }
      }
      if (teams[0].length === 6 && teams[1].length === 6) return teams;
    }
    throw new Error('splitCapped: could not draw two legal teams');
  }

  return {
    MAX_PER_ROLE: MAX_PER_ROLE,
    roleCount: roleCount,
    withinRoleCap: withinRoleCap,
    splitCapped: splitCapped,
  };
})();

/* =============================================================
   GAME DECK RULES (post pass-12 model - Classic & Draft modes)
   -------------------------------------------------------------
   A constructed game deck is 12 distinct legends, at most 4 of any
   one role and at most 2 Legendaries. Every battle opens with the
   PREPARATION phase: each side bans
   BANS legends from the opponent's 12 (chosen simultaneously,
   revealed together), then fields FIELD_SIZE = 6 of their own
   remaining (12 - BANS) legends. Per the 2026-07-30 ruling the
   deck's max-4 is the ONLY legality rule: the battle six may
   field all 4 of a role. `EOL.rules` above (max 3 on a team of
   six) now belongs ONLY to the sim series, which re-baselines
   whenever it adopts the 12-card model.
   ============================================================= */
window.EOL.deckRules = (function () {
  var DECK_SIZE = 12;
  var MAX_PER_ROLE = 4;
  /* Constructed formats (Classic singles and Unabridged) may carry at
     most two crown cards. Draft controls rarity at the 36-card table
     instead, so its live picks continue to use capBlocked() for the
     role law only. */
  var MAX_LEGENDARIES = 2;
  var DRAFT_MAX_LEGENDARIES = 4;
  var BANS = 2;
  var FIELD_SIZE = 6;

  function legendaryCount(entries) {
    var n = 0;
    (entries || []).forEach(function (e) {
      var card = e && (e.card || e);
      if (card && card.rarity === 'legendary') n++;
    });
    return n;
  }

  /* True when a list of entries/ids is a legal CONSTRUCTED deck: full
     size, every legend distinct, at most MAX_PER_ROLE of any role, and
     no more than two Legendaries. */
  function isLegal(entries) {
    if (!entries || entries.length !== DECK_SIZE) return false;
    var seen = {},
      cnt = {},
      crowns = 0;
    for (var i = 0; i < entries.length; i++) {
      var card = entries[i].card || entries[i];
      if (!card || !card.id) return false;
      if (seen[card.id]) return false;
      seen[card.id] = true;
      cnt[card.role] = (cnt[card.role] || 0) + 1;
      if (cnt[card.role] > MAX_PER_ROLE) return false;
      if (card.rarity === 'legendary' && ++crowns > MAX_LEGENDARIES) return false;
    }
    return true;
  }

  /* Would adding `card` to a partial deck breach the role cap? This is
     intentionally role-only because Draft uses it while choosing its
     twelve. Constructed builders additionally call legendaryCapBlocked. */
  function capBlocked(entries, card) {
    var n = 0;
    entries.forEach(function (e) {
      if ((e.card || e).role === card.role) n++;
    });
    return n >= MAX_PER_ROLE;
  }

  function legendaryCapBlocked(entries, card) {
    return card.rarity === 'legendary' && legendaryCount(entries) >= MAX_LEGENDARIES;
  }

  /* Draw a random legal constructed deck of 12 distinct legends
     (max 4/role, max 2 Legendary) from an entry pool. Used for the
     Classic bot and the Surprise Me row. */
  function randomDeck(pool, rng) {
    rng = rng || Math.random;
    var idx = pool.map(function (_, i) {
      return i;
    });
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    var out = [],
      cnt = {},
      crowns = 0;
    for (var k = 0; k < idx.length && out.length < DECK_SIZE; k++) {
      var e = pool[idx[k]];
      var role = e.card.role;
      if ((cnt[role] || 0) >= MAX_PER_ROLE) continue;
      if (e.card.rarity === 'legendary' && crowns >= MAX_LEGENDARIES) continue;
      cnt[role] = (cnt[role] || 0) + 1;
      if (e.card.rarity === 'legendary') crowns++;
      out.push(e);
    }
    return out.length === DECK_SIZE ? out : null;
  }

  function shuffle(list, rng) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }

  /* Draft table law: exactly 36 cards (six per role where the roster
     supports it), with no more than four Legendaries visible across the
     whole table. Pick those four crowns globally first, then fill each
     role with ordinary cards; this avoids accidentally drawing one crown
     per role/faction and flooding a draft with six or seven of them. */
  function draftPool(pool, rng) {
    var byRole = {};
    pool.forEach(function (e) {
      (byRole[e.card.role] = byRole[e.card.role] || []).push(e);
    });
    var roles = Object.keys(byRole);
    var canSnap = roles.every(function (r) {
      return byRole[r].length >= 6;
    });
    if (!canSnap) {
      /* Small/custom pools are still rarity-capped, even when they cannot
         satisfy the normal six-per-role table shape. */
      var crowns = 0;
      return pool.filter(function (e) {
        if (e.card.rarity !== 'legendary') return true;
        return crowns++ < DRAFT_MAX_LEGENDARIES;
      });
    }
    rng = rng || Math.random;
    var legends = shuffle(
      pool.filter(function (e) {
        return e.card.rarity === 'legendary';
      }),
      rng
    ).slice(0, DRAFT_MAX_LEGENDARIES);
    var keepLegend = {};
    legends.forEach(function (e) {
      keepLegend[e.card.id] = true;
    });
    var out = [];
    roles.forEach(function (r) {
      var chosenCrowns = shuffle(
        byRole[r].filter(function (e) {
          return keepLegend[e.card.id];
        }),
        rng
      );
      var ordinary = shuffle(
        byRole[r].filter(function (e) {
          return e.card.rarity !== 'legendary';
        }),
        rng
      );
      out = out.concat(chosenCrowns.concat(ordinary).slice(0, 6));
    });
    return out;
  }

  return {
    DECK_SIZE: DECK_SIZE,
    MAX_PER_ROLE: MAX_PER_ROLE,
    MAX_LEGENDARIES: MAX_LEGENDARIES,
    DRAFT_MAX_LEGENDARIES: DRAFT_MAX_LEGENDARIES,
    BANS: BANS,
    FIELD_SIZE: FIELD_SIZE,
    isLegal: isLegal,
    capBlocked: capBlocked,
    legendaryCount: legendaryCount,
    legendaryCapBlocked: legendaryCapBlocked,
    randomDeck: randomDeck,
    draftPool: draftPool,
  };
})();
