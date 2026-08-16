/* =============================================================
   QUESTS - the Daily and Weekly board
   -------------------------------------------------------------
   Three dailies and EIGHT weeklies, shown on a permanent board on
   the home screen. See docs/DESIGN-Quests.md.

   THE ANTI-FARM LAW

     Match pay rewards a LOSS (25 sp / 50 pvp) and a forfeit produces
     an ordinary result on the same pay path. So a naive "play N
     matches" quest would be a forfeit-farm button: quit instantly,
     collect, repeat.

     Most objectives therefore count something that only accumulates
     INSIDE a fight - damage, healing, shielding, casts, kills, crits,
     rounds survived. The quests that DO count battles (play N drafts,
     fight on N battlefields, play N different modes) only count a
     QUALIFYING battle, which js/battle.js defines as: not forfeited,
     at least three rounds played, at least three actions taken. A
     quitter banks nothing, so the fastest route to "play 10 drafts"
     is to play ten drafts.

     `dailyPuzzle` is the historical exception and cannot be farmed at
     all: the server grants two attempts and a win closes the day.
     Because of that cap it is also the most reliable MULTI-DAY quest
     on the board - five attempts is at minimum three days.

   REWARDS ARE PROPORTIONAL

     Every objective declares `unit`, the amount a single ordinary
     battle produces. effort = target / unit, in battles, and the coin
     value is effort x the tier's rate. A quest that takes four times
     as long pays roughly four times as much - nothing is hand-priced,
     so retuning a target retunes its payout with it.

   RESET

     7:00 AM America/New_York, the Daily Puzzle's existing boundary -
     two definitions of "day" in one game is a bug factory. Weeks
     anchor to Monday on the same line. Detection is lazy: the stored
     period key is compared whenever the board is read or progress
     recorded, so a tab left open overnight rolls over on touch.

   SELECTION

     Deterministic from a hash of the period key, so every player
     sees the SAME board on a given day (discussable, and a reroll
     cannot be farmed by clearing storage). One quest per FAMILY, so
     a week never asks for two flavours of the same thing.

   Storage:
     eol.quests.v2   { v, day, week, daily:[], weekly:[],
                       prog:{}, sets:{}, claimed:{}, bonus:{} }
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var KEY = 'eol.quests.v2';
  var VERSION = 2;
  var SLOTS = 3; // dailies on the board
  var WEEKLY_SLOTS = 8; // weeklies on the board - a week's worth of work
  var RESET_HOUR = 7; // 7:00 AM Eastern, same as the Daily Puzzle

  /* ---------------------------------------------------------
     THE PRICE OF EFFORT
     -------------------------------------------------------------
     One "battle" is the unit of work: roughly four minutes. A daily
     pays 26 coins per battle of effort; a weekly pays 14, because
     eight weeklies run in PARALLEL - the same fight advances the
     damage one, the crit one and the rounds one at once, so paying
     each of them a daily rate would pay for the same four minutes
     eight times over.

     The rates are set by the target income, not by feel: a player
     who clears everything earns about 4,300 coins/week, in the same
     band as the 3,450 the Echo Shard economy in
     DESIGN-Card-Upgrades.md was tuned against. Clamped at both ends
     so a rounding accident can never mint or insult.
     --------------------------------------------------------- */
  var RATE = { daily: 26, weekly: 14 };
  var FLOOR = { daily: 40, weekly: 70 };
  var CEIL = { daily: 130, weekly: 340 };
  /* The all-clear bonus is half of what the tier's quests paid, so it
     scales with the board instead of drifting away from it. */
  var BONUS_SHARE = 0.5;

  /* ---------------------------------------------------------
     WHAT ONE ORDINARY BATTLE PRODUCES
     -------------------------------------------------------------
     MEASURED, not guessed: 60 full six-on-six battles driven by
     js/ai.js on both sides over random rosters (the same harness
     sim/sim.js uses). The averages that came back, per battle, for
     the player's side:

       damage 48,053   healing 7,302   shielding 6,444
       kills 4.4       rounds 10.7     crits 0.5
       signatures 13.3 basics 21.1     3.2 distinct elements

     Rounded conservatively downwards, because a human clears a board
     a little slower than a depth-4 search does. These numbers are the
     denominator of every reward on the board, so they are stated once,
     here, rather than implied by hand-priced coins. Re-measure with
     /tmp-style harnesses if the engine's damage budget ever moves.
     --------------------------------------------------------- */
  var PER_BATTLE = {
    damage: 40000,
    healing: 6000,
    shield: 5000,
    abilities: 12,
    basics: 18,
    crits: 0.5, // crit chance comes from a handful of cards - rare
    kills: 4,
    rounds: 10,
    elem: 12000, // damage of one particular element
    /* A quest naming ONE legend or ONE role only advances when that
       legend is fielded and that role is played. Measured at 6.3 and
       9.6 casts in the battles where they appear; discounted hard,
       because the player also has to choose to bring them. */
    sig: 2.5,
    roleBasic: 4,
    mode: 1, // qualifying battles in a given mode
    pvp: 0.7, // an online match costs queue time too
    puzzle: 0.7, // capped at two attempts a day, so it costs days
    campaign: 0.8,
  };

  function round10(n) {
    return Math.max(10, Math.round(n / 10) * 10);
  }
  function priceOf(tier, effort) {
    var raw = effort * RATE[tier];
    return round10(Math.min(CEIL[tier], Math.max(FLOOR[tier], raw)));
  }

  /* ---------------------------------------------------------
     THE CATALOGUE
     -------------------------------------------------------------
     kind:
       'sum'  progress accumulates (the default)
       'best' progress is the best SINGLE battle
       'set'  progress is the number of distinct tokens collected

     family: at most one quest per family may appear on one board.
     --------------------------------------------------------- */
  function q(tier, def) {
    def.tier = tier;
    def.kind = def.kind || 'sum';
    def.family = def.family || def.metric;
    def.effort = def.target / def.unit;
    def.reward = priceOf(tier, def.effort);
    return def;
  }

  var ELEMENTS = ['Physical', 'Magic', 'Light', 'Shadow', 'Nature', 'Fire', 'Lightning'];
  var ROLES = ['Tank', 'Bruiser', 'Caster', 'Controller', 'Medic', 'Sniper'];
  var ROLE_BASIC = {
    Tank: 'Guard',
    Bruiser: 'Strike',
    Caster: 'Spell',
    Controller: 'Disrupt',
    Medic: 'Restore',
    Sniper: 'Aim',
  };
  var ELEM_ICON = {
    Physical: 'ra-sword',
    Magic: 'ra-crystal-wand',
    Light: 'ra-sun',
    Shadow: 'ra-moon-sun',
    Nature: 'ra-leaf',
    Fire: 'ra-fire',
    Lightning: 'ra-lightning-bolt',
  };
  var ROLE_ICON = {
    Tank: 'ra-shield',
    Bruiser: 'ra-muscle-up',
    Caster: 'ra-fairy-wand',
    Controller: 'ra-hand',
    Medic: 'ra-health',
    Sniper: 'ra-targeted',
  };
  var MODES = [
    { tag: 'classic', label: 'Classic', icon: 'ra-castle-flag', unit: PER_BATTLE.mode },
    { tag: 'draft', label: 'Draft', icon: 'ra-spades-card', unit: PER_BATTLE.mode },
    { tag: 'pvp', label: 'online', icon: 'ra-crossed-swords', unit: PER_BATTLE.pvp },
    { tag: 'campaign', label: 'campaign', icon: 'ra-footprint', unit: PER_BATTLE.campaign },
  ];

  /* THE STARTER TWELVE are the only legends every player is
     guaranteed to be able to field in Classic, so a "cast this
     legend's signature" quest is drawn from them and nowhere else -
     a quest you cannot start is not a quest. Passives are excluded:
     you cannot cast what never leaves the card. */
  function signatureCards() {
    var out = [];
    var factions = (window.EOL && window.EOL.factions) || [];
    factions.forEach(function (f) {
      if (f.id !== 'grimmwood') return;
      f.cards.forEach(function (c) {
        if (!c.ability || c.ability.type !== 'Active') return;
        out.push({ id: c.id, name: c.name, ability: c.ability.name, icon: c.icon });
      });
    });
    return out;
  }

  var DAILY = null;
  var WEEKLY = null;
  var BY_ID = null;

  function buildCatalogue() {
    if (DAILY && WEEKLY) return;
    var cards = signatureCards();

    /* ---------------- DAILIES: one session's work ---------------- */
    DAILY = [
      q('daily', {
        id: 'd-dmg-1',
        metric: 'damage',
        target: 90000,
        unit: PER_BATTLE.damage,
        icon: 'ra-sword',
        text: 'Deal {t} damage',
      }),
      q('daily', {
        id: 'd-dmg-2',
        metric: 'damage',
        target: 140000,
        unit: PER_BATTLE.damage,
        icon: 'ra-sword',
        text: 'Deal {t} damage',
      }),
      q('daily', {
        id: 'd-heal',
        metric: 'healing',
        target: 15000,
        unit: PER_BATTLE.healing,
        icon: 'ra-health',
        text: 'Restore {t} HP',
      }),
      q('daily', {
        id: 'd-shield',
        metric: 'shield',
        target: 12000,
        unit: PER_BATTLE.shield,
        icon: 'ra-shield',
        text: 'Raise {t} shielding',
      }),
      q('daily', {
        id: 'd-abil',
        metric: 'abilities',
        target: 30,
        unit: PER_BATTLE.abilities,
        family: 'signature',
        icon: 'ra-lightning-bolt',
        text: 'Cast {t} signature skills',
      }),
      q('daily', {
        id: 'd-basic',
        metric: 'basics',
        target: 45,
        unit: PER_BATTLE.basics,
        family: 'basics',
        icon: 'ra-plain-dagger',
        text: 'Use {t} role basics',
      }),
      q('daily', {
        id: 'd-crit',
        metric: 'crits',
        target: 2,
        unit: PER_BATTLE.crits,
        icon: 'ra-explosion',
        /* Crit Chance comes from a handful of legends (Red Riding
           Hood is in the starter twelve, so nobody is locked out).
           The text names the requirement rather than leaving the
           player wondering why the bar never moves. */
        text: 'Land {t} critical hits (bring a Crit Chance legend)',
      }),
      q('daily', {
        id: 'd-kill',
        metric: 'kills',
        target: 10,
        unit: PER_BATTLE.kills,
        icon: 'ra-crossed-swords',
        text: 'Defeat {t} legends',
      }),
      q('daily', {
        id: 'd-round',
        metric: 'rounds',
        target: 26,
        unit: PER_BATTLE.rounds,
        icon: 'ra-hourglass',
        text: 'Survive {t} battle rounds',
      }),
      q('daily', {
        id: 'd-fact',
        metric: 'factions',
        kind: 'best',
        target: 4,
        unit: 2,
        icon: 'ra-castle-emblem',
        text: 'Field {t} different factions in one battle',
      }),
      q('daily', {
        id: 'd-sweep',
        metric: 'battleKills',
        kind: 'best',
        target: 6,
        unit: 1.4,
        icon: 'ra-skull',
        text: 'Wipe out all {t} enemy legends in a single battle',
      }),
      q('daily', {
        id: 'd-long',
        metric: 'battleRounds',
        kind: 'best',
        target: 10,
        unit: 3,
        icon: 'ra-hourglass',
        text: 'Reach round {t} in a single battle',
      }),
      q('daily', {
        id: 'd-modes',
        metric: 'setModes',
        kind: 'set',
        target: 2,
        unit: 0.9,
        icon: 'ra-compass',
        text: 'Play a full battle in {t} different modes',
      }),
      q('daily', {
        id: 'd-fields',
        metric: 'setFields',
        kind: 'set',
        target: 3,
        unit: 1.2,
        icon: 'ra-tower',
        text: 'Fight on {t} different battlefields',
      }),
      q('daily', {
        id: 'd-puzzle',
        metric: 'dailyPuzzle',
        target: 1,
        unit: PER_BATTLE.puzzle,
        icon: 'ra-perspective-dice-six',
        text: 'Attempt the Daily Puzzle',
      }),
    ];

    /* ---------------- WEEKLIES: several days' work ----------------
       Eight are shown, drawn from ~45. They are deliberately built so
       a week cannot be finished in one sitting: the mode quests need
       real matches, the set quests need variety, and the Daily Puzzle
       one is hard-capped at two attempts a day. */
    WEEKLY = [
      q('weekly', {
        id: 'w-dmg',
        metric: 'damage',
        target: 500000,
        unit: PER_BATTLE.damage,
        icon: 'ra-sword',
        text: 'Deal {t} damage',
      }),
      q('weekly', {
        id: 'w-dmg-big',
        metric: 'damage',
        target: 750000,
        unit: PER_BATTLE.damage,
        icon: 'ra-sword',
        text: 'Deal {t} damage',
      }),
      q('weekly', {
        id: 'w-heal',
        metric: 'healing',
        target: 70000,
        unit: PER_BATTLE.healing,
        icon: 'ra-health',
        text: 'Restore {t} HP',
      }),
      q('weekly', {
        id: 'w-shield',
        metric: 'shield',
        target: 60000,
        unit: PER_BATTLE.shield,
        icon: 'ra-shield',
        text: 'Raise {t} shielding',
      }),
      q('weekly', {
        id: 'w-abil',
        metric: 'abilities',
        target: 150,
        unit: PER_BATTLE.abilities,
        /* Shares a family with the per-legend signature quests: "cast
           90 signatures" and "cast Cinderella's twelve times" on one
           board is the same instruction printed twice. */
        family: 'signature',
        icon: 'ra-lightning-bolt',
        text: 'Cast {t} signature skills',
      }),
      q('weekly', {
        id: 'w-basic',
        metric: 'basics',
        target: 220,
        unit: PER_BATTLE.basics,
        family: 'basics',
        icon: 'ra-plain-dagger',
        text: 'Use {t} role basics',
      }),
      q('weekly', {
        id: 'w-crit',
        metric: 'crits',
        target: 7,
        unit: PER_BATTLE.crits,
        icon: 'ra-explosion',
        text: 'Land {t} critical hits (bring a Crit Chance legend)',
      }),
      q('weekly', {
        id: 'w-kill',
        metric: 'kills',
        target: 55,
        unit: PER_BATTLE.kills,
        icon: 'ra-crossed-swords',
        text: 'Defeat {t} legends',
      }),
      q('weekly', {
        id: 'w-round',
        metric: 'rounds',
        target: 130,
        unit: PER_BATTLE.rounds,
        icon: 'ra-hourglass',
        text: 'Survive {t} battle rounds',
      }),
      q('weekly', {
        id: 'w-puzzle',
        metric: 'dailyPuzzle',
        target: 6,
        unit: PER_BATTLE.puzzle,
        icon: 'ra-perspective-dice-six',
        text: 'Attempt the Daily Puzzle {t} times',
      }),
      /* ---- the long single-battle feats ---- */
      q('weekly', {
        id: 'w-sweep',
        metric: 'battleKills',
        kind: 'best',
        target: 6,
        unit: 1.4,
        icon: 'ra-skull',
        text: 'Wipe out all {t} enemy legends in a single battle',
      }),
      q('weekly', {
        id: 'w-marathon',
        metric: 'battleRounds',
        kind: 'best',
        target: 14,
        unit: 2,
        icon: 'ra-hourglass',
        text: 'Reach round {t} in a single battle',
      }),
      q('weekly', {
        id: 'w-burst',
        metric: 'battleDamage',
        kind: 'best',
        target: 22000,
        unit: 3000,
        icon: 'ra-explosion',
        text: 'Deal {t} damage in a single battle',
      }),
      /* ---- variety: the whole point of a weekly ---- */
      q('weekly', {
        id: 'w-modes',
        metric: 'setModes',
        kind: 'set',
        target: 3,
        unit: 0.55,
        family: 'setModes',
        icon: 'ra-compass',
        text: 'Play a full battle in {t} different modes',
      }),
      q('weekly', {
        id: 'w-fields',
        metric: 'setFields',
        kind: 'set',
        target: 6,
        unit: 0.75,
        icon: 'ra-tower',
        text: 'Fight on {t} different battlefields',
      }),
      q('weekly', {
        id: 'w-factions',
        metric: 'setFactions',
        kind: 'set',
        target: 7,
        unit: 0.7,
        icon: 'ra-castle-emblem',
        text: 'Field legends from {t} different factions',
      }),
      q('weekly', {
        id: 'w-roles',
        metric: 'setRoles',
        kind: 'set',
        target: 6,
        unit: 0.9,
        icon: 'ra-knight-helmet',
        text: 'Field all {t} roles',
      }),
      q('weekly', {
        id: 'w-elements',
        metric: 'setElements',
        kind: 'set',
        target: 6,
        unit: 0.8,
        icon: 'ra-crystal-cluster',
        text: 'Deal damage of {t} different elements',
      }),
    ];

    /* ---- one weekly per MODE: "play this mode N times" ---- */
    MODES.forEach(function (m) {
      WEEKLY.push(
        q('weekly', {
          id: 'w-mode-' + m.tag,
          metric: 'mode:' + m.tag,
          target: m.tag === 'pvp' ? 6 : m.tag === 'campaign' ? 8 : 10,
          unit: m.unit,
          family: 'mode-' + m.tag,
          icon: m.icon,
          text:
            m.tag === 'pvp'
              ? 'Play {t} online matches to the finish'
              : m.tag === 'campaign'
                ? 'Fight {t} campaign battles to the finish'
                : 'Play {t} ' + m.label + ' battles to the finish',
        })
      );
      /* a smaller daily cousin, so the modes are a daily nudge too */
      DAILY.push(
        q('daily', {
          id: 'd-mode-' + m.tag,
          metric: 'mode:' + m.tag,
          target: m.tag === 'pvp' ? 1 : 2,
          unit: m.unit,
          family: 'mode-' + m.tag,
          icon: m.icon,
          text:
            m.tag === 'pvp'
              ? 'Play an online match to the finish'
              : m.tag === 'campaign'
                ? 'Fight {t} campaign battles to the finish'
                : 'Play {t} ' + m.label + ' battles to the finish',
        })
      );
    });

    /* ---- one weekly per ELEMENT ---- */
    ELEMENTS.forEach(function (el) {
      WEEKLY.push(
        q('weekly', {
          id: 'w-elem-' + el.toLowerCase(),
          metric: 'elem:' + el,
          target: 150000,
          unit: PER_BATTLE.elem,
          family: 'element',
          icon: ELEM_ICON[el] || 'ra-crystal-cluster',
          text: 'Deal {t} ' + el + ' damage',
        })
      );
    });

    /* ---- one weekly per ROLE BASIC ---- */
    ROLES.forEach(function (role) {
      WEEKLY.push(
        q('weekly', {
          id: 'w-basic-' + role.toLowerCase(),
          metric: 'basic:' + role,
          target: 45,
          unit: PER_BATTLE.roleBasic,
          family: 'basics',
          icon: ROLE_ICON[role] || 'ra-plain-dagger',
          text: "Use the " + role + "'s " + ROLE_BASIC[role] + ' basic {t} times',
        })
      );
    });

    /* ---- one weekly per STARTER LEGEND's signature ---- */
    cards.forEach(function (c) {
      WEEKLY.push(
        q('weekly', {
          id: 'w-sig-' + c.id,
          metric: 'sig:' + c.id,
          target: 30,
          unit: PER_BATTLE.sig,
          family: 'signature',
          icon: c.icon || 'ra-lightning-bolt',
          text: 'Cast ' + c.name + "'s " + c.ability + ' {t} times',
        })
      );
      DAILY.push(
        q('daily', {
          id: 'd-sig-' + c.id,
          metric: 'sig:' + c.id,
          target: 6,
          unit: PER_BATTLE.sig,
          family: 'signature',
          icon: c.icon || 'ra-lightning-bolt',
          text: 'Cast ' + c.name + "'s " + c.ability + ' {t} times',
        })
      );
    });

    BY_ID = {};
    DAILY.concat(WEEKLY).forEach(function (def) {
      BY_ID[def.id] = def;
    });
  }

  function defOf(id) {
    buildCatalogue();
    return BY_ID[id] || null;
  }

  /* ---------------------------------------------------------
     THE CLOCK
     -------------------------------------------------------------
     Same DST-safe technique as js/daily.js: ask Intl for the wall
     clock in New York rather than maintaining a UTC offset.
     --------------------------------------------------------- */
  function easternParts(date) {
    var out = {};
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
      })
        .formatToParts(date || new Date())
        .forEach(function (p) {
          if (p.type === 'literal') return;
          out[p.type] = p.type === 'weekday' ? p.value : Number(p.value);
        });
    } catch (e) {
      return null;
    }
    return out;
  }

  /* The "quest day" starts at 7:00 AM Eastern, so anything before
     that belongs to the previous calendar day. */
  function questDate(now) {
    var p = easternParts(now || new Date());
    if (!p) {
      /* No Intl: fall back to UTC days. Wrong boundary, but the board
         still works rather than throwing on boot. */
      var d = new Date(now || Date.now());
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() };
    }
    var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var y = p.year,
      m = p.month,
      day = p.day,
      wd = WD[p.weekday];
    if (p.hour < RESET_HOUR) {
      /* step back one day using UTC arithmetic on the civil date */
      var t = Date.UTC(y, m - 1, day) - 86400000;
      var b = new Date(t);
      y = b.getUTCFullYear();
      m = b.getUTCMonth() + 1;
      day = b.getUTCDate();
      wd = (wd + 6) % 7;
    }
    return { y: y, m: m, d: day, wd: wd };
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function dayKey(now) {
    var d = questDate(now);
    return d.y + '-' + pad(d.m) + '-' + pad(d.d);
  }

  /* Weeks anchor to MONDAY. Step the quest-date back to the most
     recent Monday and use that date as the key. */
  function weekKey(now) {
    var d = questDate(now);
    var back = (d.wd + 6) % 7; // days since Monday
    var t = Date.UTC(d.y, d.m - 1, d.d) - back * 86400000;
    var b = new Date(t);
    return b.getUTCFullYear() + '-W' + pad(b.getUTCMonth() + 1) + pad(b.getUTCDate());
  }

  /* ---------------------------------------------------------
     deterministic selection
     --------------------------------------------------------- */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  function rng32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(pool, n, seed) {
    var r = rng32(seed);
    var bag = pool.slice();
    var out = [];
    /* Never two quests from the same FAMILY on one board: eight
       "deal X element damage" objectives would read as one quest
       with a bigger number, and a board of clones teaches nothing
       about the game. */
    var used = {};
    while (bag.length && out.length < n) {
      var i = Math.floor(r() * bag.length);
      var def = bag.splice(i, 1)[0];
      if (used[def.family]) continue;
      used[def.family] = true;
      out.push(def.id);
    }
    /* If the family rule starved the board (small pool), backfill. */
    if (out.length < n) {
      pool.forEach(function (def) {
        if (out.length < n && out.indexOf(def.id) < 0) out.push(def.id);
      });
    }
    return out;
  }

  /* WEEKLY SHAPE. A week of eight random objectives can legitimately
     roll zero reasons to leave your favourite mode, which is the one
     thing the weekly tier exists to prevent. So two of the eight
     slots are reserved: one MODE quest and one VARIETY quest (a
     "N different X" set). The rest is the ordinary deterministic
     draw, and the whole thing is still a pure function of the week
     key - every player gets the identical eight. */
  function pickWeekly(seed) {
    var out = [];
    var used = {};
    function take(pool, s) {
      var chosen = pick(pool, 1, s)[0];
      if (chosen && out.indexOf(chosen) < 0) {
        out.push(chosen);
        used[BY_ID[chosen].family] = true;
      }
    }
    take(
      WEEKLY.filter(function (d) {
        return d.metric.indexOf('mode:') === 0;
      }),
      seed ^ 0x9e3779b9
    );
    take(
      WEEKLY.filter(function (d) {
        return d.kind === 'set';
      }),
      seed ^ 0x51ed270b
    );
    var rest = WEEKLY.filter(function (d) {
      return out.indexOf(d.id) < 0 && !used[d.family];
    });
    pick(rest, WEEKLY_SLOTS - out.length, seed).forEach(function (id) {
      out.push(id);
    });
    /* Present them heaviest-last, so the board reads as a ramp. */
    out.sort(function (a, b) {
      return BY_ID[a].effort - BY_ID[b].effort;
    });
    return out;
  }

  /* ---------------------------------------------------------
     state
     --------------------------------------------------------- */
  var state = null;

  function blank() {
    return {
      v: VERSION,
      day: '',
      week: '',
      daily: [],
      weekly: [],
      prog: {}, // questId -> number
      sets: {}, // questId -> [token] for kind:'set'
      claimed: {}, // questId -> 1
      bonus: {}, // 'daily'|'weekly' -> 1
    };
  }

  function load() {
    if (state) return state;
    buildCatalogue();
    state = blank();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      /* A save from before the catalogue rewrite describes quests that
         no longer exist. Start clean rather than half-restore it. */
      if (raw && typeof raw === 'object' && raw.v === VERSION) {
        state.day = typeof raw.day === 'string' ? raw.day : '';
        state.week = typeof raw.week === 'string' ? raw.week : '';
        state.daily = Array.isArray(raw.daily) ? raw.daily.filter(validId) : [];
        state.weekly = Array.isArray(raw.weekly) ? raw.weekly.filter(validId) : [];
        state.prog = raw.prog && typeof raw.prog === 'object' ? raw.prog : {};
        state.sets = raw.sets && typeof raw.sets === 'object' ? raw.sets : {};
        state.claimed = raw.claimed && typeof raw.claimed === 'object' ? raw.claimed : {};
        state.bonus = raw.bonus && typeof raw.bonus === 'object' ? raw.bonus : {};
      }
    } catch (e) {
      state = blank();
    }
    return state;
  }
  function validId(id) {
    return !!(BY_ID && BY_ID[id]);
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(load()));
    } catch (e) {
      /* private mode forgets; the session still works */
    }
    emit();
  }

  function emit() {
    try {
      window.dispatchEvent(new CustomEvent('eol:quests', { detail: null }));
    } catch (e) {
      /* headless */
    }
  }

  function clearQuest(s, id) {
    delete s.prog[id];
    delete s.sets[id];
    delete s.claimed[id];
  }

  /* ROLL OVER. Called before every read and every write, so the
     board is always describing the current period. */
  function refresh(now) {
    buildCatalogue();
    var s = load();
    var dk = dayKey(now);
    var wk = weekKey(now);
    var changed = false;

    if (s.day !== dk || !s.daily.length) {
      /* clear only the daily half - a weekly must survive the night */
      s.daily.forEach(function (id) {
        clearQuest(s, id);
      });
      delete s.bonus.daily;
      s.day = dk;
      s.daily = pick(DAILY, SLOTS, hash('d:' + dk));
      changed = true;
    }
    if (s.week !== wk || !s.weekly.length) {
      s.weekly.forEach(function (id) {
        clearQuest(s, id);
      });
      delete s.bonus.weekly;
      s.week = wk;
      s.weekly = pickWeekly(hash('w:' + wk));
      changed = true;
    }
    if (changed) save();
    return s;
  }

  /* ---------------------------------------------------------
     recording
     -------------------------------------------------------------
     ONE entry point. Called at battle end from the accumulated
     tally rather than per hit: a disconnect mid-fight banks
     nothing (correct anti-abuse) and it avoids a write per tick.
     --------------------------------------------------------- */
  function applyOne(s, id, value) {
    var def = BY_ID[id];
    if (!def || s.claimed[id]) return false;
    if (def.kind === 'set') {
      var tokens = Array.isArray(value) ? value : value == null ? [] : [value];
      var have = Array.isArray(s.sets[id]) ? s.sets[id] : [];
      var added = false;
      tokens.forEach(function (t) {
        if (t == null || t === '') return;
        var tok = String(t);
        if (have.indexOf(tok) < 0) {
          have.push(tok);
          added = true;
        }
      });
      if (!added) return false;
      s.sets[id] = have;
      s.prog[id] = have.length;
      return true;
    }
    var amount = Math.max(0, Math.floor(+value || 0));
    if (!amount) return false;
    var cur = +s.prog[id] || 0;
    if (cur >= def.target) return false;
    /* 'best' is a high-water mark - the best SINGLE battle. Everything
       else accumulates across the period. */
    s.prog[id] = def.kind === 'best' ? Math.max(cur, amount) : cur + amount;
    return true;
  }

  function record(metric, amount) {
    if (!metric) return;
    var s = refresh();
    var touched = false;
    s.daily.concat(s.weekly).forEach(function (id) {
      var def = BY_ID[id];
      if (!def || def.metric !== metric) return;
      if (applyOne(s, id, amount)) touched = true;
    });
    if (touched) save();
  }

  /* Batch form: one save for a whole battle's worth of metrics. */
  function recordBatch(map) {
    if (!map) return;
    var s = refresh();
    var touched = false;
    s.daily.concat(s.weekly).forEach(function (id) {
      var def = BY_ID[id];
      if (!def) return;
      if (!(def.metric in map)) return;
      if (applyOne(s, id, map[def.metric])) touched = true;
    });
    if (touched) save();
  }

  /* ---------------------------------------------------------
     reading
     --------------------------------------------------------- */
  function entry(id, tier) {
    var s = load();
    var def = BY_ID[id];
    if (!def) return null;
    var prog = Math.min(def.target, +s.prog[id] || 0);
    var done = prog >= def.target;
    return {
      id: id,
      tier: tier,
      metric: def.metric,
      family: def.family,
      kind: def.kind,
      icon: def.icon,
      text: def.text.replace('{t}', def.target.toLocaleString()),
      target: def.target,
      progress: prog,
      done: done,
      claimed: !!s.claimed[id],
      effort: def.effort,
      reward: def.reward,
    };
  }

  function bonusFor(list) {
    var sum = 0;
    list.forEach(function (e) {
      sum += e.reward;
    });
    return round10(sum * BONUS_SHARE);
  }

  function board(now) {
    var s = refresh(now);
    var daily = s.daily
      .map(function (id) {
        return entry(id, 'daily');
      })
      .filter(Boolean);
    var weekly = s.weekly
      .map(function (id) {
        return entry(id, 'weekly');
      })
      .filter(Boolean);
    function allClaimed(list) {
      return (
        list.length > 0 &&
        list.every(function (e) {
          return e.claimed;
        })
      );
    }
    function claimedCount(list) {
      var n = 0;
      list.forEach(function (e) {
        if (e.claimed) n++;
      });
      return n;
    }
    return {
      day: s.day,
      week: s.week,
      daily: daily,
      weekly: weekly,
      dailyClaimed: claimedCount(daily),
      weeklyClaimed: claimedCount(weekly),
      dailyBonus: {
        reward: bonusFor(daily),
        ready: allClaimed(daily) && !s.bonus.daily,
        claimed: !!s.bonus.daily,
      },
      weeklyBonus: {
        reward: bonusFor(weekly),
        ready: allClaimed(weekly) && !s.bonus.weekly,
        claimed: !!s.bonus.weekly,
      },
      resetsAt: nextResetMs(now),
      weekResetsAt: nextWeekResetMs(now),
    };
  }

  /* Milliseconds until the next 7:00 AM Eastern. Iterating minutes
     is the same trick daily.js uses and it handles both DST jumps
     without maintaining an offset. */
  function nextResetMs(now) {
    var t0 = now ? now.getTime() : Date.now();
    for (var i = 1; i <= 1500; i++) {
      var probe = new Date(t0 + i * 60000);
      var p = easternParts(probe);
      if (p && p.hour === RESET_HOUR && p.minute === 0) return probe.getTime() - t0;
    }
    return 0;
  }

  /* The weekly board turns over on the first 7 AM boundary that lands
     in a NEW week key - computed rather than guessed at, so the label
     is right on the Monday itself. */
  function nextWeekResetMs(now) {
    var t0 = now ? now.getTime() : Date.now();
    var wk = weekKey(now);
    var gap = nextResetMs(now);
    for (var d = 0; d < 8; d++) {
      var probe = new Date(t0 + gap + d * 86400000);
      if (weekKey(probe) !== wk) return gap + d * 86400000;
    }
    return gap;
  }

  /* How many rewards are sitting unclaimed - drives the board badge. */
  function claimable(now) {
    var b = board(now);
    var n = 0;
    b.daily.concat(b.weekly).forEach(function (e) {
      if (e.done && !e.claimed) n++;
    });
    if (b.dailyBonus.ready) n++;
    if (b.weeklyBonus.ready) n++;
    return n;
  }

  /* ---------------------------------------------------------
     claiming
     -------------------------------------------------------------
     Explicit, never automatic: an auto-paid quest is invisible, and
     the click is the moment the board earns its place. Idempotent,
     so a double-click or a reload mid-claim cannot pay twice.
     --------------------------------------------------------- */
  function claim(id) {
    var s = refresh();
    var def = BY_ID[id];
    if (!def) return { ok: false, reason: 'unknown' };
    var tier = s.daily.indexOf(id) >= 0 ? 'daily' : s.weekly.indexOf(id) >= 0 ? 'weekly' : null;
    if (!tier) return { ok: false, reason: 'inactive' };
    if (s.claimed[id]) return { ok: false, reason: 'claimed' };
    if ((+s.prog[id] || 0) < def.target) return { ok: false, reason: 'incomplete' };
    s.claimed[id] = 1;
    var reward = def.reward;
    if (window.EOL.econ) window.EOL.econ.addCoins(reward);
    save();
    return { ok: true, coins: reward, tier: tier };
  }

  function claimBonus(tier) {
    var s = refresh();
    if (tier !== 'daily' && tier !== 'weekly') return { ok: false, reason: 'tier' };
    if (s.bonus[tier]) return { ok: false, reason: 'claimed' };
    var list = tier === 'daily' ? s.daily : s.weekly;
    var all =
      list.length > 0 &&
      list.every(function (id) {
        return !!s.claimed[id];
      });
    if (!all) return { ok: false, reason: 'incomplete' };
    var b = board();
    s.bonus[tier] = 1;
    var reward = tier === 'daily' ? b.dailyBonus.reward : b.weeklyBonus.reward;
    if (window.EOL.econ) window.EOL.econ.addCoins(reward);
    save();
    return { ok: true, coins: reward };
  }

  window.EOL.quests = {
    SLOTS: SLOTS,
    WEEKLY_SLOTS: WEEKLY_SLOTS,
    RATE: RATE,
    PER_BATTLE: PER_BATTLE,
    get catalogue() {
      buildCatalogue();
      return { daily: DAILY, weekly: WEEKLY };
    },

    dayKey: dayKey,
    weekKey: weekKey,
    board: board,
    claimable: claimable,
    record: record,
    recordBatch: recordBatch,
    claim: claim,
    claimBonus: claimBonus,
    refresh: refresh,
    def: defOf,

    /* test hooks */
    _reset: function () {
      state = blank();
      try {
        localStorage.removeItem(KEY);
      } catch (e) {
        /* fine */
      }
    },
    _state: function () {
      return load();
    },
    /* Pin an exact board. Tests need to aim at one specific objective,
       and the real selection is (deliberately) not steerable. */
    _setBoard: function (tier, ids) {
      var s = refresh();
      ids = (ids || []).filter(validId);
      if (tier === 'daily') s.daily = ids;
      else s.weekly = ids;
      ids.forEach(function (id) {
        clearQuest(s, id);
      });
      save();
      return ids;
    },
  };
})();
