#!/usr/bin/env node
'use strict';

/*
 * Icon boundary audit.
 *
 * Remix Icon owns interface chrome. RPG Awesome is a narrow exception for
 * game-domain semantics, and every rendered exception must carry the
 * data-icon-domain="game" review marker. See docs/icon-system.md.
 */

var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');
var files = [path.join(root, 'index.html')].concat(
  fs
    .readdirSync(path.join(root, 'js'))
    .filter(function (name) {
      return /\.js$/.test(name);
    })
    .sort()
    .map(function (name) {
      return path.join(root, 'js', name);
    })
);

/* Classes currently used by the app, checked against Remix Icon 4.5.0.
   Keeping this explicit means a typo or an unreviewed icon cannot silently
   render as an empty box. Add a class only after checking the pinned catalog. */
var remix45 = new Set(
  (
    'ri-add-circle-line ri-add-line ri-arrow-down-s-line ri-arrow-go-back-line ' +
    'ri-arrow-left-line ri-arrow-left-s-line ri-arrow-right-line ri-arrow-right-s-line ' +
    'ri-arrow-up-down-line ri-arrow-up-line ri-bar-chart-2-line ri-book-2-line ri-book-open-line ' +
    'ri-calculator-line ri-calendar-check-line ' +
    'ri-chat-3-line ri-check-double-line ri-check-line ri-checkbox-circle-fill ' +
    'ri-checkbox-circle-line ri-close-line ri-cloud-line ri-coin-fill ri-cursor-line ' +
    'ri-delete-bin-line ri-discord-fill ri-edit-line ri-equalizer-2-line ' +
    'ri-error-warning-line ri-eye-line ri-eye-off-line ri-file-list-3-line ri-flag-line ' +
    'ri-forbid-2-line ri-gamepad-line ri-gift-line ' +
    'ri-graduation-cap-line ri-hammer-line ri-home-4-line ri-image-line ri-inbox-2-line ' +
    'ri-information-line ri-landscape-line ri-leaf-line ri-lightbulb-line ri-links-line ' +
    'ri-loader-4-line ri-lock-2-fill ri-lock-2-line ri-lock-fill ri-lock-line ' +
    'ri-lock-unlock-line ri-login-box-line ri-logout-box-r-line ri-map-2-line ' +
    'ri-map-pin-line ri-music-2-line ri-play-circle-line ri-play-line ri-question-line ' +
    'ri-quill-pen-line ri-refresh-line ' +
    'ri-repeat-line ri-restart-line ri-road-map-line ri-save-3-line ri-scissors-cut-line ' +
    'ri-search-line ri-settings-4-line ri-shield-star-line ri-shield-user-line ' +
    'ri-shuffle-line ri-skip-forward-fill ri-skip-forward-line ri-sound-module-line ' +
    'ri-sparkling-2-line ri-sparkling-line ri-stack-line ri-store-2-line ri-sword-line ' +
    'ri-team-line ri-time-line ri-timer-line ri-trophy-line ri-user-3-line ' +
    'ri-user-star-line ri-volume-mute-line ri-volume-up-line ri-zoom-in-line'
  ).split(/\s+/)
);

var failures = [];
var counts = { remix: 0, game: 0 };

/* Classes from RPG Awesome 0.2.0, the pinned game-domain font.

   SOURCED FROM sim/fixtures/rpg-awesome-icons.txt, which is the vendored
   copy of the SHIPPED stylesheet - not from the project's website. Those
   two disagree: the site's gallery omits aliases and a handful of real
   glyphs (ra-broadsword, ra-broken-heart, ra-cloak-and-dagger,
   ra-crossed-sabres, ra-droplets all render fine but are not listed
   there). Trusting the gallery would flag working icons as broken.

   THIS CHECK EXISTS BECAUSE A MISSING GLYPH IS SILENT. An unknown `ra-`
   name does not warn - the font renders nothing and the icon shows as an
   empty box. Two shipped that way before this was added (2026-08-21):
   `ra-star-formation` on the damage preview chip and
   `ra-open-treasure-chest` on the rewards line. js/text.js already
   carried a hand-written warning about this exact trap; now it is
   enforced rather than remembered. */
var rpg02 = new Set(
  (
    'ra-acid ra-acorn ra-alien-fire ra-all-for-one ra-alligator-clip ra-ammo-bag ra-anchor ' +
    'ra-angel-wings ra-ankh ra-anvil ra-apple ra-aquarius ra-arcane-mask ra-archer ' +
    'ra-archery-target ra-arena ra-aries ra-arrow-cluster ra-arrow-flights ra-arson ra-aura ' +
    'ra-aware ra-axe ra-axe-swing ra-ball ra-barbed-arrow ra-barrier ra-bat-sword ' +
    'ra-battered-axe ra-batteries ra-battery-0 ra-battery-100 ra-battery-25 ra-battery-50 ' +
    'ra-battery-75 ra-battery-black ra-battery-negative ra-battery-positive ra-battery-white ' +
    'ra-batwings ra-beam-wake ra-bear-trap ra-beer ra-beetle ra-bell ra-biohazard ' +
    'ra-bird-claw ra-bird-mask ra-blade-bite ra-blast ra-blaster ra-bleeding-eye ' +
    'ra-bleeding-hearts ra-bolt-shield ra-bomb-explosion ra-bombs ra-bone-bite ra-bone-knife ' +
    'ra-book ra-boomerang ra-boot-stomp ra-bottle-vapors ra-bottled-bolt ra-bottom-right ' +
    'ra-bowie-knife ra-bowling-pin ra-brain-freeze ra-brandy-bottle ra-bridge ' +
    'ra-broadhead-arrow ra-broadsword ra-broken-bone ra-broken-bottle ra-broken-heart ' +
    'ra-broken-shield ra-broken-skull ra-bubbling-potion ra-bullets ra-burning-book ' +
    'ra-burning-embers ra-burning-eye ra-burning-meteor ra-burst-blob ra-butterfly ' +
    'ra-campfire ra-cancel ra-cancer ra-candle ra-candle-fire ra-cannon-shot ra-capitol ' +
    'ra-capricorn ra-carrot ra-castle-emblem ra-castle-flag ra-cat ra-chain ra-cheese ' +
    'ra-chemical-arrow ra-chessboard ra-chicken-leg ra-circle-of-circles ra-circular-saw ' +
    'ra-circular-shield ra-cloak-and-dagger ra-clockwork ra-clover ra-clovers ' +
    'ra-clovers-card ra-cluster-bomb ra-coffee-mug ra-cog ra-cog-wheel ra-cold-heart ' +
    'ra-compass ra-corked-tube ra-crab-claw ra-cracked-helm ra-cracked-shield ra-croc-sword ' +
    'ra-crossbow ra-crossed-axes ra-crossed-bones ra-crossed-pistols ra-crossed-sabres ' +
    'ra-crossed-swords ra-crown ra-crown-of-thorns ra-crowned-heart ra-crush ra-crystal-ball ' +
    'ra-crystal-cluster ra-crystal-wand ra-crystals ra-cubes ra-cut-palm ra-cycle ra-daggers ' +
    'ra-daisy ra-dead-tree ra-death-skull ra-decapitation ra-defibrillate ra-demolish ' +
    'ra-dervish-swords ra-desert-skull ra-diamond ra-diamonds ra-diamonds-card ra-dice-five ' +
    'ra-dice-four ra-dice-one ra-dice-six ra-dice-three ra-dice-two ra-dinosaur ra-divert ' +
    'ra-diving-dagger ra-double-team ra-doubled ra-dragon ra-dragon-breath ra-dragon-wing ' +
    'ra-dragonfly ra-drill ra-dripping-blade ra-dripping-knife ra-dripping-sword ra-droplet ' +
    'ra-droplet-splash ra-droplets ra-duel ra-egg ra-egg-pod ra-eggplant ra-emerald ' +
    'ra-energise ra-explosion ra-explosive-materials ra-eye-monster ra-eye-shield ra-eyeball ' +
    'ra-fairy ra-fairy-wand ra-fall-down ra-falling ra-fast-ship ra-feather-wing ' +
    'ra-feathered-wing ra-fedora ra-fire ra-fire-bomb ra-fire-breath ra-fire-ring ' +
    'ra-fire-shield ra-fire-symbol ra-fireball-sword ra-fish ra-fizzing-flask ' +
    'ra-flame-symbol ra-flaming-arrow ra-flaming-claw ra-flaming-trident ra-flask ' +
    'ra-flat-hammer ra-flower ra-flowers ra-fluffy-swirl ra-focused-lightning ra-food-chain ' +
    'ra-footprint ra-forging ra-forward ra-fox ra-frost-emblem ra-frostfire ra-frozen-arrow ' +
    'ra-gamepad-cross ra-gavel ra-gear-hammer ra-gear-heart ra-gears ra-gecko ra-gem ' +
    'ra-gem-pendant ra-gemini ra-glass-heart ra-gloop ra-gold-bar ra-grappling-hook ra-grass ' +
    'ra-grass-patch ra-grenade ra-groundbreaker ra-guarded-tower ra-guillotine ra-halberd ' +
    'ra-hammer ra-hammer-drop ra-hand ra-hand-emblem ra-hand-saw ra-harpoon-trident ' +
    'ra-health ra-health-decrease ra-health-increase ra-heart-bottle ra-heart-tower ' +
    'ra-heartburn ra-hearts ra-hearts-card ra-heat-haze ra-heavy-fall ra-heavy-shield ' +
    'ra-helmet ra-help ra-hive-emblem ra-hole-ladder ra-honeycomb ra-hood ra-horn-call ' +
    'ra-horns ra-horseshoe ra-hospital-cross ra-hot-surface ra-hourglass ra-hydra ' +
    'ra-hydra-shot ra-ice-cube ra-implosion ra-incense ra-insect-jaws ra-interdiction ' +
    'ra-jetpack ra-jigsaw-piece ra-kaleidoscope ra-kettlebell ra-key ra-key-basic ' +
    'ra-kitchen-knives ra-knife ra-knife-fork ra-knight-helmet ra-kunai ra-lantern-flame ' +
    'ra-large-hammer ra-laser-blast ra-laser-site ra-lava ra-leaf ra-leo ra-level-four ' +
    'ra-level-four-advanced ra-level-three ra-level-three-advanced ra-level-two ' +
    'ra-level-two-advanced ra-lever ra-libra ra-light-bulb ra-lighthouse ra-lightning ' +
    'ra-lightning-bolt ra-lightning-storm ra-lightning-sword ra-lightning-trio ra-lion ' +
    'ra-lit-candelabra ra-load ra-locked-fortress ra-love-howl ra-maggot ra-magnet ' +
    'ra-mass-driver ra-match ra-meat ra-meat-hook ra-medical-pack ra-metal-gate ' +
    'ra-microphone ra-mine-wagon ra-mining-diamonds ra-mirror ra-monster-skull ra-moon-sun ' +
    'ra-mountains ra-mp5 ra-muscle-fat ra-muscle-up ra-musket ra-nails ra-nodular ra-noose ' +
    'ra-nuclear ra-ocarina ra-ocean-emblem ra-octopus ra-omega ra-on-target ra-ophiuchus ' +
    'ra-overhead ra-overmind ra-palm-tree ra-pawn ra-pawprint ra-perspective-dice-five ' +
    'ra-perspective-dice-four ra-perspective-dice-one ra-perspective-dice-random ' +
    'ra-perspective-dice-six ra-perspective-dice-three ra-perspective-dice-two ra-pill ' +
    'ra-pills ra-pine-tree ra-ping-pong ra-pisces ra-plain-dagger ra-player ' +
    'ra-player-despair ra-player-dodge ra-player-king ra-player-lift ra-player-pain ' +
    'ra-player-pyromaniac ra-player-shot ra-player-teleport ra-player-thunder-struck ' +
    'ra-podium ra-poison-cloud ra-potion ra-pyramids ra-queen-crown ra-quill-ink ra-rabbit ' +
    'ra-radar-dish ra-radial-balance ra-radioactive ra-raven ra-reactor ra-recycle ' +
    'ra-regeneration ra-relic-blade ra-repair ra-reverse ra-revolver ra-rifle ' +
    'ra-ringing-bell ra-roast-chicken ra-robot-arm ra-round-bottom-flask ra-round-shield ' +
    'ra-rss ra-rune-stone ra-sagittarius ra-sapphire ra-satellite ra-save ra-scorpio ' +
    'ra-scroll-unfurled ra-scythe ra-sea-serpent ra-seagull ra-shark ra-sheep ra-sheriff ' +
    'ra-shield ra-ship-emblem ra-shoe-prints ra-shot-through-the-heart ra-shotgun-shell ' +
    'ra-shovel ra-shuriken ra-sickle ra-sideswipe ra-site ra-skull ra-skull-trophy ' +
    'ra-slash-ring ra-small-fire ra-snail ra-snake ra-snorkel ra-snowflake ra-soccer-ball ' +
    'ra-spades ra-spades-card ra-spawn-node ra-spear-head ra-speech-bubble ra-speech-bubbles ' +
    'ra-spider-face ra-spikeball ra-spiked-mace ra-spiked-tentacle ra-spinning-sword ' +
    'ra-spiral-shell ra-splash ra-spray-can ra-sprout ra-sprout-emblem ra-stopwatch ' +
    'ra-suckered-tentacle ra-suits ra-sun ra-sun-symbol ra-sunbeams ra-super-mushroom ' +
    'ra-supersonic-arrow ra-surveillance-camera ra-sword ra-syringe ra-target-arrows ' +
    'ra-target-laser ra-targeted ra-taurus ra-telescope ra-tentacle ra-tesla ra-thorn-arrow ' +
    'ra-thorny-vine ra-three-keys ra-tic-tac-toe ra-toast ra-tombstone ra-tooth ra-torch ' +
    'ra-tower ra-trail ra-trefoil-lily ra-trident ra-triforce ra-trophy ra-turd ' +
    'ra-two-dragons ra-two-hearts ra-uncertainty ra-underhand ra-unplugged ra-vase ' +
    'ra-venomous-snake ra-vest ra-vial ra-vine-whip ra-virgo ra-water-drop ra-wifi ' +
    'ra-wireless-signal ra-wolf-head ra-wolf-howl ra-wooden-sign ra-wrench ra-wyvern ' +
    'ra-x-mark ra-zebra-shield ra-zigzag-leaf '
  ).trim().split(/\s+/)
);

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function lineOf(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function fail(file, source, offset, message) {
  failures.push(rel(file) + ':' + lineOf(source, offset) + ' ' + message);
}

files.forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var tagPattern = /<i\b[^>]*>/g;
  var tagMatch;

  while ((tagMatch = tagPattern.exec(source))) {
    var tag = tagMatch[0];
    var classMatch = tag.match(/\bclass="([^"]*)"/);
    if (!classMatch) continue;
    var classes = classMatch[1].split(/\s+/);
    var isRpg = classes.indexOf('ra') >= 0;
    var remixClasses = classes.filter(function (name) {
      return /^ri-[a-z0-9-]+$/.test(name);
    });

    if (isRpg) {
      counts.game += 1;
      if (!/\bdata-icon-domain="game"/.test(tag)) {
        fail(file, source, tagMatch.index, 'RPG Awesome markup needs data-icon-domain="game"');
      }
      classes
        .filter(function (name) {
          return /^ra-[a-z0-9-]+$/.test(name);
        })
        .forEach(function (name) {
          if (!rpg02.has(name)) {
            fail(file, source, tagMatch.index, 'unknown RPG Awesome 0.2.0 class: ' + name);
          }
        });
    } else if (/\bdata-icon-domain="game"/.test(tag) && classMatch[1].indexOf('+') < 0) {
      fail(
        file,
        source,
        tagMatch.index,
        'game-domain marker is present without the RPG Awesome base class'
      );
    }

    remixClasses.forEach(function (name) {
      counts.remix += 1;
      if (!remix45.has(name)) {
        fail(file, source, tagMatch.index, 'unknown Remix Icon 4.5.0 class: ' + name);
      }
    });
  }

  /* Direct class assignment bypasses markup inspection. Such assignments
     are rare; require the same explicit domain decision on their line. */
  var lines = source.split('\n');
  lines.forEach(function (line, index) {
    if (/\.className\s*=\s*['"]ra(?:\s|['"])/.test(line) && !/icon-domain:\s*game/.test(line)) {
      failures.push(
        rel(file) +
          ':' +
          (index + 1) +
          ' RPG Awesome className assignment needs // icon-domain: game'
      );
    }
  });

  /* Validate every Remix token, including dynamically assigned coach and
     toast icons that do not appear inside a literal <i> tag. */
  var tokenPattern = /\bri-[a-z0-9-]+\b/g;
  var tokenMatch;
  while ((tokenMatch = tokenPattern.exec(source))) {
    if (!remix45.has(tokenMatch[0])) {
      fail(file, source, tokenMatch.index, 'unknown Remix Icon 4.5.0 class: ' + tokenMatch[0]);
    }
  }
});

if (failures.length) {
  console.error(
    'Icon audit failed:\n' +
      failures
        .map(function (item) {
          return '  - ' + item;
        })
        .join('\n')
  );
  process.exitCode = 1;
} else {
  console.log(
    'Icon audit passed: ' +
      counts.remix +
      ' rendered Remix references; ' +
      counts.game +
      ' marked game-domain RPG Awesome references.'
  );
}
