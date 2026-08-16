/* =============================================================
   PLATFORM FLAG
   -------------------------------------------------------------
   ONE boot-time decision that the rest of the app reads instead of
   sniffing the environment in a dozen places.

   Echoes of Legend ships to two destinations from ONE codebase:

     web         fragmint6.web.app - the full game. Accounts, online
                 modes, the Discord community link, the dev console.

     crazygames  the portal build. Uploaded to CrazyGames and served
                 from their CDN inside a 16:9 iframe. Single-player
                 only, no community links, no dev console, and the
                 Daily Puzzle runs on an anonymous Supabase session
                 because Google OAuth cannot redirect inside a frame.

   Nothing is deleted for the portal build. Every difference is a
   capability flag read at runtime, so a balance change, a legend fix,
   or a new gate lands in BOTH builds automatically. This is the same
   trick body[data-auth] and body[data-gfx] already use.

   DETECTION. `document.referrer` is the top frame that embedded us.
   CrazyGames serves games from crazygames.com and its regional and
   preview hosts, so the hostname is matched by suffix rather than
   equality. `?platform=` forces either build for local testing:

       index.html?platform=crazygames    the portal build
       index.html?platform=web           the normal build

   The override is checked FIRST so a developer can always reproduce
   either build regardless of how the page was reached.

   LOAD ORDER. This file must run before every module that reads a
   capability - it is the first script tag in index.html, ahead of
   the data files. It writes body[data-platform] immediately so the
   stylesheet never paints a control it is about to hide.
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  /* Hosts that embed the portal build. Suffix-matched, so
     www.crazygames.com, de.crazygames.com, and the developer QA tool
     on games.crazygames.com all resolve to the same build. */
  var CG_HOSTS = ['crazygames.com', 'crazygames.co.uk', '1001juegos.com'];

  /* CrazyGames also runs a REGIONAL domain per market - crazygames.fr,
     .no, .com.br, .co.kr, .jp, .com.ua and more - and their sitelock
     guidance describes the general shape as `crazygames.*` where the
     TLD may be one or two parts. Listing them by hand went stale the
     moment a new market opened, and a miss is expensive: detect()
     would fall through to 'web', which un-hides the account controls
     that Basic Launch forbids and turns the wrong save system on.

     So the regional test is a SHAPE, not a list: a label of exactly
     'crazygames' followed by a 1- or 2-part TLD, optionally preceded
     by subdomains. 'notcrazygames.com' does not match - the label has
     to be the whole thing, not a suffix of a longer word. */
  var CG_REGIONAL = /(^|\.)crazygames\.[a-z]{2,}(\.[a-z]{2,})?$/;

  function hostOf(url) {
    if (!url) return '';
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  /* The hostname this document is actually served from. Unlike the
     referrer this survives every referrer policy, and unlike reading
     window.parent it never trips the same-origin policy. */
  function selfHost() {
    try {
      return String(window.location.hostname || '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function hostIsCrazyGames(host) {
    if (!host) return false;
    for (var i = 0; i < CG_HOSTS.length; i++) {
      var h = CG_HOSTS[i];
      if (host === h || host.slice(-(h.length + 1)) === '.' + h) return true;
    }
    return CG_REGIONAL.test(host);
  }

  function override() {
    try {
      return new URLSearchParams(window.location.search).get('platform');
    } catch (e) {
      return null;
    }
  }

  function detect() {
    var forced = override();
    if (forced === 'crazygames' || forced === 'cg') return 'crazygames';
    if (forced === 'web') return 'web';

    /* OUR OWN HOSTNAME FIRST, and it is the only signal that cannot be
       taken away from us. CrazyGames serves uploaded builds from
       <game>.game-files.crazygames.com, so when the document itself is
       on a portal domain this IS the portal build - no inference
       required.

       The referrer check below used to be the only test, and it is not
       reliable: the portal frames the game with a referrer policy that
       strips document.referrer to '' cross-origin. When that happened
       detect() fell through to 'web', which set platform.sdk false, so
       index.html never injected js/crazygames-sdk.js - the SDK never
       initialised (CrazyGames' QA panel reported "SDK not currently
       detected"), no CrazyGames login could be observed, no account was
       minted, and multiplayer stayed locked behind the anonymous-session
       guard. It also turned the Supabase cloud vault back ON for portal
       players, which is the wrong save system for that build. */
    if (hostIsCrazyGames(selfHost())) return 'crazygames';

    /* Then the referrer, which still catches portal domains that serve
       the game from somewhere else. An iframe whose parent we cannot
       read is NOT assumed to be the portal: a stricter default would
       strip accounts from anyone who embeds the public build. */
    if (hostIsCrazyGames(hostOf(document.referrer))) return 'crazygames';
    return 'web';
  }

  var id = detect();
  var isCG = id === 'crazygames';

  /* CAPABILITIES, not platform checks. Call sites ask what they are
     allowed to do; they never ask where they are running. When the
     CrazyGames SDK arrives at Full Launch, `canEditIdentity` flips
     back on for a CG-linked account and no call site changes. */
  window.EOL.platform = {
    id: id,
    isCrazyGames: isCG,

    /* The portal owns the player's name and avatar (the SDK token
       carries both), so in-game renaming would silently diverge from
       the profile CrazyGames shows. Also false today because the
       anonymous session HAS no name to edit. */
    canEditIdentity: !isCG,

    /* Online play needs a durable account, and the portal build now
       has one: js/crazygames-sdk.js exchanges the SDK's signed token
       for a real Supabase session (see js/auth.js
       signInWithCrazyGames and docs/supabase-migration-09.sql), so a
       logged-in CrazyGames player queues under their own name.

       This flag is now about the BUILD, not the player. A portal
       GUEST still cannot queue - but that is a session question, and
       js/mp.js already answers it by refusing anonymous sessions.
       Keeping the arena switch visible and letting the lock badge
       explain itself is what the web build has always done for a
       signed-out player, and the portal now behaves the same. */
    canPlayOnline: true,

    /* Community links off-site are cross-promotion under the portal's
       gameplay requirements. */
    canLinkOut: !isCG,

    /* The owner console (js/dev.js) grants coins and cards. Harmless
       on the public build - there is no ladder to cheat - but it has
       no business in a build under quality review. */
    devConsole: !isCG,

    /* The Daily Puzzle's shared board and two-attempt allowance are
       enforced by Postgres against auth.uid(). The portal build signs
       in anonymously so those RPCs keep working unchanged; it must
       NOT take a generation lease (see js/daily.js). */
    anonymousAuth: isCG,
    canForgeDaily: !isCG,

    /* WHERE PROGRESS IS SAVED.
       -------------------------------------------------------------
       Exactly one of these is true, because two cloud saves fighting
       over the same localStorage would be a data-loss bug.

       web         the Supabase vault (js/cloud.js), keyed on a real
                   account the player can sign back into.

       crazygames  the SDK's Data module (js/crazygames-sdk.js),
                   keyed on the player's CrazyGames account and
                   synced across their devices by the portal.

       The portal build must NOT use the Supabase vault. Its session
       there is anonymous - no email, no password, no way back in -
       so every such row is an unrecoverable write-only copy of a
       save, and the browser holding the only key to it. */
    cloudVault: !isCG,
    dataModule: isCG,

    /* Load the CrazyGames SDK bridge (js/crazygames-sdk.js). During
       Basic Launch this reports loading and gameplay timing, which is
       exactly what the trial measures. Ads, banners, and the user
       module are Full Launch work - video ads are disabled during
       Basic Launch anyway. */
    sdk: isCG,
  };

  /* Paint the attribute before first layout. document.body does not
     exist yet while <head> scripts run, so fall back to <html> and
     copy it across the moment the body appears. */
  function paint() {
    if (document.body) {
      document.body.dataset.platform = id;
      return true;
    }
    return false;
  }
  if (!paint()) {
    document.documentElement.setAttribute('data-platform', id);
    document.addEventListener('DOMContentLoaded', paint, { once: true });
  }
})();
