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

  /* Shop codes live beside the wallet rather than in the presentation
     layer: the one-time claim and its coins are one economy operation,
     and the Vault can carry both to every signed-in device. Codes are
     normalized before lookup so pasted whitespace and letter case do not
     turn one offer into several claims. */
  var REDEMPTION_CODES = {
    CREATOR5000: { coins: 5000 },
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
  function readArr(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
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
     truth the deck manager seeds from */
  var STARTER = null;
  function starterIds() {
    if (STARTER) return STARTER;
    var f = (window.EOL.factions || []).filter(function (x) {
      return x.id === 'grimmwood';
    })[0];
    STARTER = f
      ? f.cards.map(function (c) {
          return c.id;
        })
      : [];
    return STARTER;
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
          write(OWNED_KEY, owned);
        }
      }
      write(MIGRATED_KEY, '1');
    } catch (e) {
      /* a broken save must never break the boot */
    }
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
  function redeemCode(raw) {
    migrate();
    var code = normalizeCode(raw);
    if (!code) return { ok: false, status: 'empty', code: '' };
    var reward = REDEMPTION_CODES[code];
    if (!reward) return { ok: false, status: 'invalid', code: code };
    if (hasRedeemedCode(code)) return { ok: false, status: 'redeemed', code: code };

    /* Mark the claim before emitting the wallet event. The Vault's
       immediate economy push therefore sees the redemption marker and
       its coins in the same full-save snapshot. The in-memory marker keeps
       the one-claim law for this session even if storage is unavailable. */
    var redeemed = redeemedCodes();
    redeemed.push(code);
    sessionRedeemed[code] = true;
    write(REDEEMED_CODES_KEY, redeemed);
    var balance = addCoins(reward.coins);
    return {
      ok: true,
      status: 'granted',
      code: code,
      coins: reward.coins,
      balance: balance,
    };
  }

  function owns(id) {
    migrate();
    if (starterIds().indexOf(id) >= 0) return true;
    return readArr(OWNED_KEY).indexOf(id) >= 0;
  }
  function grant(ids) {
    migrate();
    var owned = readArr(OWNED_KEY);
    var added = [];
    (ids || []).forEach(function (id) {
      if (starterIds().indexOf(id) >= 0) return;
      if (owned.indexOf(id) < 0) {
        owned.push(id);
        added.push(id);
      }
    });
    if (added.length) {
      write(OWNED_KEY, owned);
      emitOwned();
    }
    return added;
  }

  /* what the shop may ever sell: everything except Huaxia (held for
     Chapter 2). Deliberately NOT progression-gated - the Road's fog
     protects its reveals in the LEDGER; the shop just sells cards. */
  function obtainableEntries() {
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      if (f.id === 'huaxia') return;
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
    owns: owns,
    grant: grant,
    starterIds: starterIds,
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
