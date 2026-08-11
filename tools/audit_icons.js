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
    'ri-arrow-left-line ri-arrow-right-line ri-arrow-up-down-line ri-bar-chart-2-line ' +
    'ri-book-2-line ri-book-open-line ri-calculator-line ri-calendar-check-line ' +
    'ri-chat-3-line ri-check-double-line ri-check-line ri-checkbox-circle-fill ' +
    'ri-checkbox-circle-line ri-close-line ri-cloud-line ri-coin-fill ri-cursor-line ' +
    'ri-delete-bin-line ri-discord-fill ri-edit-line ri-error-warning-line ri-eye-line ' +
    'ri-eye-off-line ri-file-list-3-line ri-flag-line ri-forbid-2-line ri-gamepad-line ' +
    'ri-graduation-cap-line ri-hammer-line ri-home-4-line ri-image-line ri-inbox-2-line ' +
    'ri-information-line ri-landscape-line ri-leaf-line ri-lightbulb-line ri-links-line ' +
    'ri-loader-4-line ri-lock-2-fill ri-lock-2-line ri-lock-fill ri-lock-line ' +
    'ri-lock-unlock-line ri-login-box-line ri-logout-box-r-line ri-map-2-line ' +
    'ri-map-pin-line ri-play-line ri-question-line ri-quill-pen-line ri-refresh-line ' +
    'ri-repeat-line ri-restart-line ri-road-map-line ri-save-3-line ri-scissors-cut-line ' +
    'ri-search-line ri-settings-4-line ri-shield-user-line ri-shuffle-line ' +
    'ri-skip-forward-fill ri-skip-forward-line ri-sparkling-2-line ri-sparkling-line ' +
    'ri-stack-line ri-store-2-line ri-sword-line ri-team-line ri-time-line ri-timer-line ' +
    'ri-trophy-line ri-user-3-line ri-user-star-line ri-zoom-in-line'
  ).split(/\s+/)
);

var failures = [];
var counts = { remix: 0, game: 0 };

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
