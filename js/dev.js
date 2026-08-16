/* =============================================================
   Echoes of Legend - THE WORKBENCH (owner/dev console kit)
   -------------------------------------------------------------
   Typed into the browser console (F12). Exists because the owner
   was digging through the database to give himself pack-testing
   coins (2026-08-10) - the answer must be one line, not a jsonb
   spelunking trip:

       EOL.dev.coins(5000)     grant coins (negative takes them)
       EOL.dev.grantAll()      own every obtainable card
       EOL.dev.openRoad()      unlock every campaign gate
       EOL.dev.resetRoad()     blank the campaign + tutorial ONLY
                               (cards and coins kept) and reload
       EOL.dev.reset()         wipe the LOCAL save and reload
       EOL.dev.save()          push the vault right now (signed in)
       EOL.dev.puzzle()        forge + play a PRIVATE practice puzzle
       EOL.dev.puzzleRules()   show the puzzle length calibration

   Resetting the SHARED Daily Puzzle is not here on purpose - it
   deletes every player's attempt rows, so it is a service_role
   operation. See docs/supabase-migration-15.sql:
       select * from public.reset_daily_puzzle();

   Deliberately shipped in production: until the economy moves
   server-side (SUPABASE-SETUP.md, 'What is deliberately not built
   yet'), a player with the console open can only cheat themselves -
   there is no ladder, no trade, no other victim. Every command
   also nudges the vault, so a signed-in owner's test state follows
   the account.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  function vaultNudge() {
    if (window.EOL.cloud && window.EOL.cloud.push) window.EOL.cloud.push();
  }

  window.EOL.dev = {
    coins: function (n) {
      var econ = window.EOL.econ;
      if (!econ) return 'economy not loaded';
      n = parseInt(n, 10) || 0;
      if (n >= 0) econ.addCoins(n);
      else econ.spend(Math.min(-n, econ.coins()));
      vaultNudge();
      return 'wallet: ' + econ.coins();
    },
    grantAll: function () {
      var econ = window.EOL.econ;
      if (!econ) return 'economy not loaded';
      econ.grant(
        econ.obtainableEntries().map(function (e) {
          return e.card.id;
        })
      );
      vaultNudge();
      return 'owned: ' + econ.ownedCount() + ' / ' + econ.obtainableEntries().length;
    },
    openRoad: function () {
      var c = window.EOL.campaign;
      if (!c || !c.getProgress) return 'campaign not loaded';
      var prog = c.getProgress();
      for (var i = 1; i <= 10; i++) if (prog.unlocked.indexOf(i) < 0) prog.unlocked.push(i);
      try {
        localStorage.setItem('eol.campaign.ch1.progress', JSON.stringify(prog));
      } catch (e) {
        return 'private mode - nothing saved';
      }
      vaultNudge();
      return 'all ten gates unlocked (reload to repaint the map)';
    },
    resetRoad: function () {
      /* Campaign + tutorial only: the collection and wallet stay.
         OWNER TOOL, not a player feature - a fresh Road re-pays each
         difficulty's gate rewards and re-runs card ceremonies (grants are
         idempotent, coins are not), so a player-facing reset needs a
         no-re-pay design first. */
      try {
        [
          'eol.campaign.ch1.progress',
          'eol.tutorial.intro.v1',
          'eol.tutorial.guide.v1',
          'eol.tutorial.ledger.v1',
        ].forEach(function (k) {
          localStorage.removeItem(k);
        });
      } catch (e) {
        return 'private mode - nothing saved';
      }
      /* the vault must hold the blank Road BEFORE the reload, or the
         boot pull restores the account save right over the reset */
      var landed =
        window.EOL.cloud && window.EOL.cloud.status() === 'on'
          ? window.EOL.cloud.push()
          : Promise.resolve();
      landed
        .catch(function () {})
        .then(function () {
          window.location.reload();
        });
      return 'blanking the Road...';
    },
    reset: function () {
      /* local only - the vault is NOT touched here on purpose. A
         signed-in reload pulls the account save straight back; to
         truly start over, delete the saves row in the dashboard
         first, then run this. */
      var doomed = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('eol.') === 0) doomed.push(k);
        }
        doomed.forEach(function (k) {
          localStorage.removeItem(k);
        });
      } catch (e) {
        return 'private mode - nothing to wipe';
      }
      window.location.reload();
    },
    save: function () {
      if (!window.EOL.cloud) return 'vault not loaded';
      if (window.EOL.cloud.status() !== 'on') return 'not signed in - local save only';
      window.EOL.cloud.push();
      return 'vault push queued';
    },

    /* ---- LOCAL PRACTICE PUZZLE --------------------------------------
       Forge a position with the current engine and play it immediately.
       This is `?dailyLab=1` without the URL round-trip, which matters
       when the thing being checked is a forge change: reloading the page
       to add a query string also reloads the code you just edited out of
       cache, and it is easy to end up measuring the old build.

       It is NOT a reset of the shared Daily. It cannot be: the published
       board lives in Postgres and clearing it is a service_role
       operation on every player's row at once, which is deliberately not
       reachable from anything that ships in the browser bundle (see
       docs/supabase-migration-15.sql). This only makes YOU a private
       board. */
    puzzle: function () {
      if (!window.EOL.daily || !window.EOL.daily.startLab) return 'daily puzzle not loaded';
      window.EOL.daily.startLab();
      return 'forging a practice position (30s or so) - it is private, not the shared Daily';
    },

    /* Print what the local forge is currently calibrated to. The numbers
       that define "how long is a puzzle" are otherwise only visible by
       reading js/daily.js, and the whole point of the workbench is that
       the owner should not have to. */
    puzzleRules: function () {
      var d = window.EOL.daily;
      if (!d || !d._limits) return 'daily puzzle not loaded';
      var L = d._limits;
      return (
        'intended solution ' +
        L.solveMin +
        '-' +
        L.solveMax +
        ' rounds · opens in round ' +
        L.roundMin +
        '-' +
        L.roundMax +
        ' · tempo band ' +
        L.tempoMin +
        '-' +
        L.tempoMax
      );
    },
  };
})();
