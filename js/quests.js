/* =============================================================
   QUESTS - the Daily and Weekly board
   -------------------------------------------------------------
   Three dailies and three weeklies, shown on a floating board on
   the home screen. See docs/DESIGN-Quests.md.

   THE ANTI-FARM LAW

     Match pay rewards a LOSS (25 sp / 50 pvp) and a forfeit produces
     an ordinary result on the same pay path. So "play N matches"
     would be a forfeit-farm button: quit instantly, collect, repeat.

     Therefore NO quest counts matches, wins or losses. Every
     objective counts something that only accumulates INSIDE a fight
     - damage, healing, shielding, casts, kills, rounds survived.
     Rushing them means playing the game properly. `dailyPuzzle` is
     the one exception and it cannot be farmed at all: the server
     grants two attempts and a win closes the day.

   RESET

     7:00 AM America/New_York, the Daily Puzzle's existing boundary -
     two definitions of "day" in one game is a bug factory. Weeks
     anchor to Monday on the same line. Detection is lazy: the stored
     period key is compared whenever the board is read or progress
     recorded, so a tab left open overnight rolls over on touch.

   SELECTION

     Deterministic from a hash of the period key, so every player
     sees the SAME three quests on a given day (discussable, and a
     reroll cannot be farmed by clearing storage).

   Storage:
     eol.quests.v1   { v, day, week, daily:[], weekly:[],
                       prog:{}, claimed:{}, bonus:{} }
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var KEY = 'eol.quests.v1';
  var SLOTS = 3;
  var DAILY_REWARD = 60;
  var WEEKLY_REWARD = 250;
  var DAILY_BONUS = 120;
  var WEEKLY_BONUS = 600;
  var RESET_HOUR = 7; // 7:00 AM Eastern, same as the Daily Puzzle

  /* ---------------------------------------------------------
     THE CATALOGUE
     -------------------------------------------------------------
     Deliberately larger than the three slots so a day feels
     different from the last. Daily targets are sized so a normal
     session (2-4 fights) clears two or three; weekly is roughly 6x.
     --------------------------------------------------------- */
  var DAILY = [
    { id: 'd-dmg-1', metric: 'damage', target: 25000, icon: 'ra-sword', text: 'Deal {t} damage' },
    { id: 'd-dmg-2', metric: 'damage', target: 40000, icon: 'ra-sword', text: 'Deal {t} damage' },
    { id: 'd-heal', metric: 'healing', target: 8000, icon: 'ra-health', text: 'Restore {t} HP' },
    {
      id: 'd-shield',
      metric: 'shield',
      target: 6000,
      icon: 'ra-shield',
      text: 'Raise {t} shielding',
    },
    {
      id: 'd-abil',
      metric: 'abilities',
      target: 12,
      icon: 'ra-lightning-bolt',
      text: 'Cast {t} signature abilities',
    },
    { id: 'd-kill', metric: 'kills', target: 8, icon: 'ra-crossed-swords', text: 'Defeat {t} legends' },
    {
      id: 'd-round',
      metric: 'rounds',
      target: 20,
      icon: 'ra-hourglass',
      text: 'Survive {t} battle rounds',
    },
    {
      id: 'd-fact',
      metric: 'factions',
      target: 4,
      icon: 'ra-banner',
      text: 'Field legends from {t} different factions',
    },
    {
      id: 'd-puzzle',
      metric: 'dailyPuzzle',
      target: 1,
      icon: 'ra-perspective-dice-six',
      text: 'Attempt the Daily Puzzle',
    },
  ];

  var WEEKLY = [
    { id: 'w-dmg', metric: 'damage', target: 200000, icon: 'ra-sword', text: 'Deal {t} damage' },
    { id: 'w-heal', metric: 'healing', target: 50000, icon: 'ra-health', text: 'Restore {t} HP' },
    {
      id: 'w-shield',
      metric: 'shield',
      target: 40000,
      icon: 'ra-shield',
      text: 'Raise {t} shielding',
    },
    {
      id: 'w-abil',
      metric: 'abilities',
      target: 80,
      icon: 'ra-lightning-bolt',
      text: 'Cast {t} signature abilities',
    },
    {
      id: 'w-kill',
      metric: 'kills',
      target: 50,
      icon: 'ra-crossed-swords',
      text: 'Defeat {t} legends',
    },
    {
      id: 'w-round',
      metric: 'rounds',
      target: 120,
      icon: 'ra-hourglass',
      text: 'Survive {t} battle rounds',
    },
    {
      id: 'w-fact',
      metric: 'factions',
      target: 7,
      icon: 'ra-banner',
      text: 'Field legends from {t} different factions',
    },
    {
      id: 'w-puzzle',
      metric: 'dailyPuzzle',
      target: 4,
      icon: 'ra-perspective-dice-six',
      text: 'Attempt the Daily Puzzle {t} times',
    },
  ];

  var BY_ID = {};
  DAILY.concat(WEEKLY).forEach(function (q) {
    BY_ID[q.id] = q;
  });

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
    var q = questDate(now);
    return q.y + '-' + pad(q.m) + '-' + pad(q.d);
  }

  /* Weeks anchor to MONDAY. Step the quest-date back to the most
     recent Monday and use that date as the key. */
  function weekKey(now) {
    var q = questDate(now);
    var back = (q.wd + 6) % 7; // days since Monday
    var t = Date.UTC(q.y, q.m - 1, q.d) - back * 86400000;
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
    /* Never two quests on the same metric in one board: three damage
       objectives would read as one quest with a bigger number. */
    var used = {};
    while (bag.length && out.length < n) {
      var i = Math.floor(r() * bag.length);
      var q = bag.splice(i, 1)[0];
      if (used[q.metric]) continue;
      used[q.metric] = true;
      out.push(q.id);
    }
    /* If the metric rule starved the board (small pool), backfill. */
    if (out.length < n) {
      pool.forEach(function (q) {
        if (out.length < n && out.indexOf(q.id) < 0) out.push(q.id);
      });
    }
    return out;
  }

  /* ---------------------------------------------------------
     state
     --------------------------------------------------------- */
  var state = null;

  function blank() {
    return {
      v: 1,
      day: '',
      week: '',
      daily: [],
      weekly: [],
      prog: {}, // questId -> number
      claimed: {}, // questId -> 1
      bonus: {}, // 'daily'|'weekly' -> 1
    };
  }

  function load() {
    if (state) return state;
    state = blank();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        state.day = typeof raw.day === 'string' ? raw.day : '';
        state.week = typeof raw.week === 'string' ? raw.week : '';
        state.daily = Array.isArray(raw.daily) ? raw.daily.filter(validId) : [];
        state.weekly = Array.isArray(raw.weekly) ? raw.weekly.filter(validId) : [];
        state.prog = raw.prog && typeof raw.prog === 'object' ? raw.prog : {};
        state.claimed = raw.claimed && typeof raw.claimed === 'object' ? raw.claimed : {};
        state.bonus = raw.bonus && typeof raw.bonus === 'object' ? raw.bonus : {};
      }
    } catch (e) {
      state = blank();
    }
    return state;
  }
  function validId(id) {
    return !!BY_ID[id];
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

  /* ROLL OVER. Called before every read and every write, so the
     board is always describing the current period. */
  function refresh(now) {
    var s = load();
    var dk = dayKey(now);
    var wk = weekKey(now);
    var changed = false;

    if (s.day !== dk) {
      /* clear only the daily half - a weekly must survive the night */
      s.daily.forEach(function (id) {
        delete s.prog[id];
        delete s.claimed[id];
      });
      delete s.bonus.daily;
      s.day = dk;
      s.daily = pick(DAILY, SLOTS, hash('d:' + dk));
      changed = true;
    }
    if (s.week !== wk) {
      s.weekly.forEach(function (id) {
        delete s.prog[id];
        delete s.claimed[id];
      });
      delete s.bonus.weekly;
      s.week = wk;
      s.weekly = pick(WEEKLY, SLOTS, hash('w:' + wk));
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
  function record(metric, amount) {
    amount = Math.max(0, Math.floor(+amount || 0));
    if (!metric || !amount) return;
    var s = refresh();
    var touched = false;
    s.daily.concat(s.weekly).forEach(function (id) {
      var q = BY_ID[id];
      if (!q || q.metric !== metric) return;
      if (s.claimed[id]) return;
      var cur = +s.prog[id] || 0;
      if (cur >= q.target) return;
      /* `factions` is a high-water mark, not a running total - the
         count of distinct factions in ONE battle. Everything else
         accumulates. */
      s.prog[id] = q.metric === 'factions' ? Math.max(cur, amount) : cur + amount;
      touched = true;
    });
    if (touched) save();
  }

  /* Batch form: one save for a whole battle's worth of metrics. */
  function recordBatch(map) {
    if (!map) return;
    var s = refresh();
    var touched = false;
    s.daily.concat(s.weekly).forEach(function (id) {
      var q = BY_ID[id];
      if (!q || s.claimed[id]) return;
      var amount = Math.max(0, Math.floor(+map[q.metric] || 0));
      if (!amount) return;
      var cur = +s.prog[id] || 0;
      if (cur >= q.target) return;
      s.prog[id] = q.metric === 'factions' ? Math.max(cur, amount) : cur + amount;
      touched = true;
    });
    if (touched) save();
  }

  /* ---------------------------------------------------------
     reading
     --------------------------------------------------------- */
  function entry(id, tier) {
    var s = load();
    var q = BY_ID[id];
    if (!q) return null;
    var prog = Math.min(q.target, +s.prog[id] || 0);
    var done = prog >= q.target;
    return {
      id: id,
      tier: tier,
      metric: q.metric,
      icon: q.icon,
      text: q.text.replace('{t}', q.target.toLocaleString()),
      target: q.target,
      progress: prog,
      done: done,
      claimed: !!s.claimed[id],
      reward: tier === 'daily' ? DAILY_REWARD : WEEKLY_REWARD,
    };
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
      return list.length > 0 && list.every(function (q) {
        return q.claimed;
      });
    }
    return {
      day: s.day,
      week: s.week,
      daily: daily,
      weekly: weekly,
      dailyBonus: {
        reward: DAILY_BONUS,
        ready: allClaimed(daily) && !s.bonus.daily,
        claimed: !!s.bonus.daily,
      },
      weeklyBonus: {
        reward: WEEKLY_BONUS,
        ready: allClaimed(weekly) && !s.bonus.weekly,
        claimed: !!s.bonus.weekly,
      },
      resetsAt: nextResetMs(now),
    };
  }

  /* Milliseconds until the next 7:00 AM Eastern. Iterating minutes
     is the same trick daily.js uses and it handles both DST jumps
     without maintaining an offset. */
  function nextResetMs(now) {
    var t0 = (now ? now.getTime() : Date.now());
    for (var i = 1; i <= 1500; i++) {
      var probe = new Date(t0 + i * 60000);
      var p = easternParts(probe);
      if (p && p.hour === RESET_HOUR && p.minute === 0) return probe.getTime() - t0;
    }
    return 0;
  }

  /* How many rewards are sitting unclaimed - drives the board badge. */
  function claimable(now) {
    var b = board(now);
    var n = 0;
    b.daily.concat(b.weekly).forEach(function (q) {
      if (q.done && !q.claimed) n++;
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
    var q = BY_ID[id];
    if (!q) return { ok: false, reason: 'unknown' };
    var tier = s.daily.indexOf(id) >= 0 ? 'daily' : s.weekly.indexOf(id) >= 0 ? 'weekly' : null;
    if (!tier) return { ok: false, reason: 'inactive' };
    if (s.claimed[id]) return { ok: false, reason: 'claimed' };
    if ((+s.prog[id] || 0) < q.target) return { ok: false, reason: 'incomplete' };
    s.claimed[id] = 1;
    var reward = tier === 'daily' ? DAILY_REWARD : WEEKLY_REWARD;
    if (window.EOL.econ) window.EOL.econ.addCoins(reward);
    save();
    return { ok: true, coins: reward, tier: tier };
  }

  function claimBonus(tier) {
    var s = refresh();
    if (tier !== 'daily' && tier !== 'weekly') return { ok: false, reason: 'tier' };
    if (s.bonus[tier]) return { ok: false, reason: 'claimed' };
    var list = tier === 'daily' ? s.daily : s.weekly;
    var all = list.length > 0 && list.every(function (id) {
      return !!s.claimed[id];
    });
    if (!all) return { ok: false, reason: 'incomplete' };
    s.bonus[tier] = 1;
    var reward = tier === 'daily' ? DAILY_BONUS : WEEKLY_BONUS;
    if (window.EOL.econ) window.EOL.econ.addCoins(reward);
    save();
    return { ok: true, coins: reward };
  }

  window.EOL.quests = {
    DAILY_REWARD: DAILY_REWARD,
    WEEKLY_REWARD: WEEKLY_REWARD,
    DAILY_BONUS: DAILY_BONUS,
    WEEKLY_BONUS: WEEKLY_BONUS,
    SLOTS: SLOTS,
    catalogue: { daily: DAILY, weekly: WEEKLY },

    dayKey: dayKey,
    weekKey: weekKey,
    board: board,
    claimable: claimable,
    record: record,
    recordBatch: recordBatch,
    claim: claim,
    claimBonus: claimBonus,
    refresh: refresh,

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
  };
})();
