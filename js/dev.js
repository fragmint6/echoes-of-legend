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
       EOL.dev.reset()         wipe the LOCAL save and reload
       EOL.dev.save()          push the vault right now (signed in)

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
  };
})();
