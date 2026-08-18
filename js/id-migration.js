/* =============================================================
   FACTION ID MIGRATION (2026-08-18)
   -------------------------------------------------------------
   Five factions were renamed by owner ruling, and one card changed
   faction. Card ids embed the faction id - `takamagahara-amaterasu`
   became `kami-amaterasu` - and those ids are the PRIMARY KEYS in
   every player's save:

     eol.owned.v1     ["camelot-merlin", "takamagahara-inari", ...]
     eol.decks.v1     [{ ids: [cardId x<=12] }, ...]
     eol.deck.v1      legacy single squad, 6 ids
     eol.upgrades.v2  { cards: { cardId: {dupes, boosts} } }

   Without this file, every existing player silently loses their
   Takamagahara collection, any deck containing those cards, and the
   duplicate/upgrade progress attached to them. The cards would not
   appear "lost" in a way anyone could report usefully either - the
   ids simply stop matching the roster, so they vanish from the
   collection screen and get filtered out of saved decks.

   WHY A SEPARATE FILE, LOADED FIRST
   -------------------------------------------------------------
   economy.js, deck.js and upgrades.js each read their own key on
   first call, and they are loaded in an order that is not
   guaranteed to be stable. Putting the rewrite in any one of them
   would leave the other two racing it. This file runs before all of
   them (see index.html) and touches nothing else.

   WHY IT IS IDEMPOTENT AND ONE-WAY
   -------------------------------------------------------------
   A DONE_KEY guard means a second run is a no-op, but the mapping is
   also written so that running it twice would be harmless anyway:
   the new ids do not match any old prefix, so a second pass finds
   nothing to rewrite. Belt and braces, because a corrupted rewrite
   of a collection is not recoverable and there is no undo.

   WHY IT NEVER THROWS
   -------------------------------------------------------------
   Same rule economy.js already follows: a broken or hand-edited save
   must never break the boot. Every step is wrapped; a failure leaves
   the save exactly as it was and the player sees an unmigrated (but
   intact) collection rather than a white screen.

   CLOUD SAVES: js/cloud.js syncs these same localStorage keys, so an
   account save written before today lands OLD ids in localStorage.
   cloud.restore() applies the snapshot and then calls
   window.location.reload(), leaving `eol.cloud.restored` = '1' in
   sessionStorage - so the restored data arrives on a FRESH BOOT, and
   this file runs again on that boot. The DONE_KEY would normally
   short-circuit that second run, so the boot call below ignores the
   guard whenever the cloud-restore marker is present. That marker is
   consumed by cloud.js later in the same boot, so this reads it
   without clearing it.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var DONE_KEY = 'eol.idmap.2026-08-18';

  /* old faction id -> new faction id. Card ids are `<faction>-<slug>`
     and only the PREFIX changes, so a prefix swap is sufficient and
     is safer than a full id table: it cannot get out of step with
     the roster when a card is added or renamed later. */
  var FACTION_RENAMES = {
    takamagahara: 'kami',
    gehenna: 'pandemonium',
    devaloka: 'devas',
    jotunheim: 'asgard',
    achaea: 'hemithea',
  };

  /* Cards that changed FACTION, not just faction name. These need a
     full id mapping because the slug's owner moved. Hercules left
     Olympus for Hemithea when the owner ruled that a mortal who
     earned his myth belongs with the mortals. */
  var CARD_MOVES = {
    'olympus-hercules': 'hemithea-hercules',
  };

  function mapId(id) {
    if (typeof id !== 'string') return id;
    if (CARD_MOVES[id]) return CARD_MOVES[id];
    var dash = id.indexOf('-');
    if (dash < 0) return id;
    var fac = id.slice(0, dash);
    var rest = id.slice(dash);
    return FACTION_RENAMES[fac] ? FACTION_RENAMES[fac] + rest : id;
  }

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function write(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {
      /* quota or private mode - leave the old value alone */
    }
  }

  /* ---- the four shapes ---- */

  function migrateIdArray(key) {
    var arr = read(key);
    if (!Array.isArray(arr)) return 0;
    var n = 0;
    var out = arr.map(function (id) {
      var m = mapId(id);
      if (m !== id) n++;
      return m;
    });
    /* De-duplicate: if a save somehow held BOTH ids (possible only
       through a hand-edit or a half-restored cloud sync) the rewrite
       would produce a duplicate entry, and ownership code assumes
       one row per card. */
    var seen = {};
    out = out.filter(function (id) {
      if (seen[id]) return false;
      seen[id] = 1;
      return true;
    });
    if (n) write(key, out);
    return n;
  }

  function migrateDecks(key) {
    var decks = read(key);
    if (!Array.isArray(decks)) return 0;
    var n = 0;
    decks.forEach(function (d) {
      if (!d || !Array.isArray(d.ids)) return;
      d.ids = d.ids.map(function (id) {
        var m = mapId(id);
        if (m !== id) n++;
        return m;
      });
    });
    if (n) write(key, decks);
    return n;
  }

  function migrateUpgrades(key) {
    var save = read(key);
    if (!save || !save.cards || typeof save.cards !== 'object') return 0;
    var n = 0;
    var out = {};
    Object.keys(save.cards).forEach(function (id) {
      var m = mapId(id);
      if (m !== id) n++;
      /* If both ids somehow exist, keep the richer record rather than
         letting key order decide. Losing upgrade levels is the one
         failure here a player would actually notice. */
      if (out[m]) {
        var a = out[m];
        var b = save.cards[id];
        out[m] = {
          dupes: Math.max(a.dupes || 0, b.dupes || 0),
          boosts: (a.boosts || []).length >= (b.boosts || []).length ? a.boosts : b.boosts,
        };
      } else {
        out[m] = save.cards[id];
      }
    });
    if (n) {
      save.cards = out;
      write(key, save);
    }
    return n;
  }

  function run(force) {
    try {
      if (!force && localStorage.getItem(DONE_KEY) === '1') return 0;
      var n = 0;
      n += migrateIdArray('eol.owned.v1');
      n += migrateDecks('eol.decks.v1');
      n += migrateIdArray('eol.deck.v1'); // legacy single squad: a bare id array
      n += migrateUpgrades('eol.upgrades.v2');
      localStorage.setItem(DONE_KEY, '1');
      if (n && window.console && console.info) {
        console.info('[EOL] migrated ' + n + ' card ids to the 2026-08-18 faction names.');
      }
      return n;
    } catch (e) {
      /* a broken save must never break the boot */
      return 0;
    }
  }

  /* Was this boot caused by a cloud restore? If so the localStorage we
     are looking at was written by the vault seconds ago and may hold
     pre-rename ids, even though DONE_KEY says this device already
     migrated. Force the rewrite in that case.

     READ ONLY - cloud.js consumes this marker later in the same boot
     to decide whether to promote the migrated save back to the vault.
     Clearing it here would break that. */
  var viaCloud = false;
  try {
    viaCloud = sessionStorage.getItem('eol.cloud.restored') === '1';
  } catch (e) {
    /* no sessionStorage - treat as a normal boot */
  }
  run(viaCloud);

  window.EOL.idMigration = { run: run, mapId: mapId };
})();
