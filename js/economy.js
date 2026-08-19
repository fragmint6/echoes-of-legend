/* =============================================================
   Echoes of Legend - The Economy (2026-08-10)
   -------------------------------------------------------------
   One WALLET, one OWNERSHIP ledger, everywhere. The rules, as
   ruled by the owner:

     - ownership gates DECK BUILDING (Classic and campaign decks),
       never drafts - drafts are built from nothing by definition
       and stay the great equalizer;
     - everyone owns the starter Grimmwood twelve, forever;
     - packs pay ONLY unowned cards (no duplicates - every pack is
       pure progress; an awakening system may spend dupes later);
     - Huaxia is held for Chapter 2 and is NOT obtainable;
     - the shop does NOT follow the campaign's progression law -
       an early Anubis is a trap purchase, not a broken one;
     - the campaign pays difficulty-specific gate coins into this wallet
       (1400 Normal / 2800 Heroic / 300 Legend), and matches pay per game: singleplayer
       50 win / 25 loss, PvP 75 win / 50 loss.

   Storage:
     eol.wallet.v1        number (coins)
     eol.owned.v1         [cardId] beyond the starter twelve
     eol.shop.codes.v1    [code] one-time shop redemptions
     eol.econ.migrated.v1 one-time import of pre-economy campaign
                          saves (their coins + grants)
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var WALLET_KEY = 'eol.wallet.v1';
  var OWNED_KEY = 'eol.owned.v1';
  var REDEEMED_CODES_KEY = 'eol.shop.codes.v1';
  var MIGRATED_KEY = 'eol.econ.migrated.v1';

  /* Public codes are mirrored here so signed-out play still works. The
     boolean is the policy switch requested for future offers:

       singleUserOnly:false  every account/save may claim it once
       singleUserOnly:true   exactly one signed-in account may claim it

     The second mode is NEVER decided by this client copy. Signed-in claims
     go through redeem_shop_code(), whose locked database row is the global
     source of truth. A true code cannot fall back offline. */
  var REDEMPTION_CODES = {
    CREATOR5000: { coins: 5000, singleUserOnly: false },
  };
  var sessionRedeemed = {};

  /* match pay, per game (owner ruling 2026-08-10) */
  var PAY = { spWin: 50, spLoss: 25, pvpWin: 75, pvpLoss: 50 };

  function readNum(key) {
    try {
      var v = parseInt(localStorage.getItem(key), 10);
      return isNaN(v) ? 0 : Math.max(0, v);
    } catch (e) {
      return 0;
    }
  }
  /* THE OWNERSHIP LEDGER IS ROSTER-DRIVEN (2026-08-19).
     -------------------------------------------------------------
     The old build's collection count and the new build's grid were
     reading two different truths - a stale cached bundle on one
     hand, an account save written by an older build on the other -
     and the result was a screen that owned all 115 legends while
     the counter said 55. Two laws kill that whole class of bug:

       1. every read of the owned array is sanitized against the
          live roster (stale ids from before a rename, the boss card,
          junk rows all drop out; duplicates collapse);
       2. every count is derived from the SAME roster, so a
          denominator and a numerator can never disagree again. */
  var ROSTER_IDS = null;
  function rosterIds() {
    if (ROSTER_IDS) return ROSTER_IDS;
    var set = {};
    (window.EOL.factions || []).forEach(function (f) {
      (f.cards || []).forEach(function (c) {
        set[c.id] = true;
      });
    });
    ROSTER_IDS = set;
    return ROSTER_IDS;
  }
  function sanitizeOwned(arr) {
    var roster = rosterIds();
    var seen = {};
    return (arr || []).filter(function (id) {
      if (!roster[id] || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }
  function readArr(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      if (!Array.isArray(v)) return [];
      return key === OWNED_KEY ? sanitizeOwned(v) : v;
    } catch (e) {
      return [];
    }
  }
  function write(key, v) {
    try {
      localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v));
    } catch (e) {
      /* private mode: the session economy still works, it just forgets */
    }
  }

  /* the starter twelve: the entire Grimmwood faction, same source of
     truth the deck manager seeds from. The empty result is NOT cached:
     an early call before the faction files land would otherwise poison
     every ownership count for the whole session ([] is truthy, so the
     old guard happily stored it). */
  var STARTER = null;
  function starterIds() {
    if (STARTER && STARTER.length) return STARTER;
    var f = (window.EOL.factions || []).filter(function (x) {
      return x.id === 'grimmwood';
    })[0];
    var ids = f
      ? f.cards.map(function (c) {
          return c.id;
        })
      : [];
    if (ids.length) STARTER = ids;
    return ids;
  }

  /* ONE-TIME IMPORT: saves from before the economy carried campaign
     coins and grants that nothing could spend or hold. They become
     real money and real cards, once. */
  function migrate() {
    try {
      if (localStorage.getItem(MIGRATED_KEY) === '1') return;
      var raw = localStorage.getItem('eol.campaign.ch1.progress');
      if (raw) {
        var prog = JSON.parse(raw);
        if (prog && typeof prog.coins === 'number' && prog.coins > 0) {
          write(WALLET_KEY, String(readNum(WALLET_KEY) + prog.coins));
        }
        if (prog && Array.isArray(prog.grants) && prog.grants.length) {
          var owned = readArr(OWNED_KEY);
          prog.grants.forEach(function (id) {
            if (owned.indexOf(id) < 0) owned.push(id);
          });
          write(OWNED_KEY, sanitizeOwned(owned));
        }
      }
      write(MIGRATED_KEY, '1');
    } catch (e) {
      /* a broken save must never break the boot */
    }
  }

  /* THE RECONCILE PASS (2026-08-19). One command, one source of
     truth. Every ownership source the game writes - the owned
     ledger, both campaigns' grants, and the starter shelf - is
     unioned against the live roster, and the result is written
     back. It repairs the database/local disagreement in place:
     nothing the player earned is dropped, stale ids are, and the
     count that comes out is exactly the count the grid shows.

     Runs on every boot (it is idempotent and cheap) AND from the
     console as EOL.dev.reconcile() so a broken account save can be
     fixed without touching a database row by hand. */
  function reconcile() {
    var rawArr = (function () {
      try {
        var v = JSON.parse(localStorage.getItem(OWNED_KEY));
        return Array.isArray(v) ? v : [];
      } catch (e) {
        return [];
      }
    })();
    var out = {};
    starterIds().forEach(function (id) {
      out[id] = true;
    });
    rawArr.forEach(function (id) {
      out[id] = true;
    });
    ['eol.campaign.ch1.progress', 'eol.campaign.ch2.progress'].forEach(function (key) {
      try {
        var prog = JSON.parse(localStorage.getItem(key));
        (prog && prog.grants ? prog.grants : []).forEach(function (id) {
          out[id] = true;
        });
      } catch (e) {
        /* private mode or broken save - the ledger still reconciles */
      }
    });
    var owned = sanitizeOwned(Object.keys(out));
    var current = readArr(OWNED_KEY);
    var same = current.length === owned.length && owned.every(function (id, i) {
      return current[i] === id;
    });
    if (!same) {
      write(OWNED_KEY, owned);
      /* a mid-session repair must repaint the grid and the counters */
      emitOwned();
    }
    return {
      owned: owned.length,
      changed: !same,
      dropped: rawArr.filter(function (id) {
        return owned.indexOf(id) < 0;
      }).length,
    };
  }

  function emitCoins() {
    try {
      document.dispatchEvent(new CustomEvent('eol:coins', { detail: coins() }));
    } catch (e) {
      /* decorative */
    }
  }
  function emitOwned() {
    try {
      document.dispatchEvent(new CustomEvent('eol:owned', {}));
    } catch (e) {
      /* decorative */
    }
  }

  function coins() {
    migrate();
    return readNum(WALLET_KEY);
  }
  function addCoins(n) {
    migrate();
    n = Math.round(n || 0);
    if (n <= 0) return coins();
    write(WALLET_KEY, String(readNum(WALLET_KEY) + n));
    emitCoins();
    return coins();
  }
  function setCoins(n) {
    migrate();
    n = Math.max(0, Math.round(n || 0));
    write(WALLET_KEY, String(n));
    emitCoins();
    return coins();
  }
  function spend(n) {
    migrate();
    n = Math.round(n || 0);
    var have = readNum(WALLET_KEY);
    if (n <= 0 || have < n) return false;
    write(WALLET_KEY, String(have - n));
    emitCoins();
    return true;
  }

  function normalizeCode(raw) {
    return String(raw == null ? '' : raw)
      .trim()
      .toUpperCase();
  }
  function redeemedCodes() {
    var seen = {};
    var out = [];
    readArr(REDEEMED_CODES_KEY).forEach(function (raw) {
      var code = normalizeCode(raw);
      if (!code || seen[code]) return;
      seen[code] = true;
      out.push(code);
    });
    Object.keys(sessionRedeemed).forEach(function (code) {
      if (!seen[code]) out.push(code);
    });
    return out;
  }
  function hasRedeemedCode(raw) {
    var code = normalizeCode(raw);
    return !!code && redeemedCodes().indexOf(code) >= 0;
  }
  function codePolicy(raw) {
    var reward = REDEMPTION_CODES[normalizeCode(raw)];
    return reward
      ? { coins: reward.coins, singleUserOnly: !!reward.singleUserOnly }
      : null;
  }
  function markCodeRedeemed(code) {
    var redeemed = redeemedCodes();
    if (redeemed.indexOf(code) < 0) redeemed.push(code);
    sessionRedeemed[code] = true;
    write(REDEEMED_CODES_KEY, redeemed);
  }
  function grantLocalCode(code, reward) {
    /* Mark before the coin event. The Vault's immediate push sees the
       redemption marker and wallet in the same full-save snapshot. */
    markCodeRedeemed(code);
    var balance = addCoins(reward.coins);
    return {
      ok: true,
      status: 'granted',
      code: code,
      coins: reward.coins,
      balance: balance,
      singleUserOnly: false,
      source: 'local',
    };
  }
  function redemptionClient() {
    var auth = window.EOL.auth;
    var user = auth && auth.user ? auth.user() : null;
    var client = auth && auth.rawClient ? auth.rawClient() : null;
    return user && client ? client : null;
  }
  function missingRedemptionRpc(err) {
    var msg = String((err && (err.message || err.details || err.code)) || '');
    return /PGRST202|redeem_shop_code.*schema cache|Could not find the function/i.test(msg);
  }
  function redeemCode(raw) {
    migrate();
    var code = normalizeCode(raw);
    if (!code) return { ok: false, status: 'empty', code: '' };
    if (hasRedeemedCode(code)) return { ok: false, status: 'redeemed', code: code };

    var localReward = REDEMPTION_CODES[code];
    var client = redemptionClient();
    if (!client) {
      if (localReward && !localReward.singleUserOnly) return grantLocalCode(code, localReward);
      var auth = window.EOL.auth;
      var canSignIn = auth && auth.configured && auth.configured();
      var needsAccount = (localReward && localReward.singleUserOnly) || canSignIn;
      return {
        ok: false,
        status: needsAccount ? 'signin' : 'invalid',
        code: code,
      };
    }

    /* The database owns signed-in claims for BOTH modes. Its code row is
       locked through the insert, so two accounts racing a single-user code
       cannot both win. p_wallet lets the RPC fold this client-authoritative
       prototype wallet into the atomic award without discarding unsynced
       local earnings. */
    var submittedWallet = coins();
    var request = client.rpc('redeem_shop_code', {
      p_code: code,
      p_wallet: submittedWallet,
    });
    if (request && typeof request.single === 'function') request = request.single();
    return Promise.resolve(request).then(
      function (response) {
        if (response && response.error) {
          if (missingRedemptionRpc(response.error) && localReward && !localReward.singleUserOnly) {
            if (!redeemCode._missingWarned) {
              redeemCode._missingWarned = true;
              console.warn(
                '[EOL] shop codes: migration 08 is not installed; using per-save redemption.'
              );
            }
            return grantLocalCode(code, localReward);
          }
          return { ok: false, status: 'unavailable', code: code };
        }
        var row = response && response.data;
        if (Array.isArray(row)) row = row[0];
        row = row || {};
        var status = row.result_status || 'unavailable';
        var rewardCoins = Math.max(0, Math.round(+row.reward_coins || 0));
        var serverWallet = Math.max(0, Math.round(+row.wallet_balance || submittedWallet));
        if (status === 'granted' || status === 'redeemed') {
          /* Preserve wallet movement that happened while the request was in
             flight. The RPC started from submittedWallet; only the delta
             since then belongs on top of its authoritative result. */
          var localDelta = coins() - submittedWallet;
          markCodeRedeemed(code);
          setCoins(Math.max(0, serverWallet + localDelta));
        }
        return {
          ok: status === 'granted',
          status: status,
          code: row.result_code || code,
          coins: rewardCoins,
          balance: coins(),
          singleUserOnly: !!row.single_user_only,
          source: 'server',
        };
      },
      function () {
        return { ok: false, status: 'unavailable', code: code };
      }
    );
  }

  function owns(id) {
    migrate();
    ensureReconciled();
    if (starterIds().indexOf(id) >= 0) return true;
    return readArr(OWNED_KEY).indexOf(id) >= 0;
  }
  /* THE RECONCILE RUNS ONCE PER BOOT, BEFORE THE FIRST OWNERSHIP
     QUESTION - whatever wrote the ledger (an old build, a cloud
     restore, a rename that predates the id-migration) is folded
     against the live roster before any counter or grid can read it. */
  var RECONCILED = false;
  function ensureReconciled() {
    if (RECONCILED) return;
    RECONCILED = true;
    reconcile();
  }
  function grant(ids, opts) {
    migrate();
    var owned = readArr(OWNED_KEY);
    var added = [];
    (ids || []).forEach(function (id) {
      /* A grant of a card you already carry is a COPY (2026-08-19,
         owner ruling): duplicates are upgrade material, so no reward
         grant is ever a no-op. Reward paths opt in via {dupes:true}
         and the copy banks toward the card's next level (overflow to
         Echo Shards) through the upgrades system. The pack shelf keeps
         the plain call - it banks its own duplicates around its
         ceremony, so double-counting is impossible. */
      if (owns(id)) {
        if (opts && opts.dupes && window.EOL.upgrades && window.EOL.upgrades.addDuplicate) {
          window.EOL.upgrades.addDuplicate(id, 1);
        }
        return;
      }
      owned.push(id);
      added.push(id);
    });
    if (added.length) {
      write(OWNED_KEY, owned);
      emitOwned();
    }
    return added;
  }

  /* THE CHAPTER SHELF (owner ruling 2026-08-19, superseding the
     2026-08-18b withhold).
     -------------------------------------------------------------
     Chapter II is playable now, so the whole roster is obtainable:
     every faction's cards count toward the collection, and pack pools
     are SCOPED per pack in js/shop.js (chapter / featured / daily).
     Per-chapter pools mean a Chapter I player's odds never dilute
     again, which was the only reason the withhold ever existed.

     The Crown Law is untouched: `packableEntries` still excludes
     every legendary, in every pool. */
  function obtainableEntries() {
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        out.push({ card: c, faction: f });
      });
    });
    return out;
  }
  function unownedEntries() {
    return obtainableEntries().filter(function (e) {
      return !owns(e.card.id);
    });
  }
  /* THE CROWN LAW (owner ruling 2026-08-10): legendaries are NEVER
     sold. Packs draw from this pool - unowned AND below legendary -
     so a paying player can buy speed toward a full shelf of echoes
     but can never buy a crown. Legends come from the Road alone. */
  function packableEntries() {
    return unownedEntries().filter(function (e) {
      return e.card.rarity !== 'legendary';
    });
  }
  function ownedCount() {
    return obtainableEntries().length - unownedEntries().length;
  }

  window.EOL.econ = {
    PAY: PAY,
    coins: coins,
    addCoins: addCoins,
    spend: spend,
    redeemCode: redeemCode,
    hasRedeemedCode: hasRedeemedCode,
    redeemedCodes: redeemedCodes,
    codePolicy: codePolicy,
    owns: owns,
    grant: grant,
    starterIds: starterIds,
    rosterIds: rosterIds,
    reconcile: reconcile,
    obtainableEntries: obtainableEntries,
    unownedEntries: unownedEntries,
    packableEntries: packableEntries,
    ownedCount: ownedCount,
    /* test hooks */
    _reset: function () {
      write(WALLET_KEY, '0');
      write(OWNED_KEY, []);
      write(REDEEMED_CODES_KEY, []);
      sessionRedeemed = {};
      write(MIGRATED_KEY, '1');
      emitCoins();
      emitOwned();
    },
  };
})();
