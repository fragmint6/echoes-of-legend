/* =============================================================
   Echoes of Legend — Battle UI
   Renders the board, handles selection/targeting, drives the bot.
   ============================================================= */
(function () {
  'use strict';

  var E,
    AI,
    B = null;
  var sel = null; // { unit, ability, needed, chosen[] }
  var busy = false; // blocks input while the bot acts
  var playerDone = false; // has the player taken their turn this round?
  var enemyDone = false; // has the bot taken its turn this round?
  var ROLE_ICON = {
    Tank: 'ra-shield',
    Bruiser: 'ra-battered-axe',
    Caster: 'ra-fairy-wand',
    Controller: 'ra-gears',
    Medic: 'ra-health',
    Sniper: 'ra-archery-target',
  };
  var ELEMENT_ICON = {
    Physical: 'ra-crossed-swords',
    Magic: 'ra-crystals',
    Shadow: 'ra-moon-sun',
    Light: 'ra-sun',
    Lightning: 'ra-lightning-bolt',
    Fire: 'ra-fire',
    Nature: 'ra-leaf',
  };
  var ELEMENT_COLOR = {
    Physical: 'var(--e-physical)',
    Magic: 'var(--e-magic)',
    Shadow: 'var(--e-shadow)',
    Light: 'var(--e-light)',
    Lightning: 'var(--e-lightning)',
    Fire: 'var(--e-fire)',
    Nature: 'var(--e-nature)',
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function $(id) {
    return document.getElementById(id);
  }
  function rich(t) {
    return window.EOL.colorElements(String(t));
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  /* ---------------------------------------------------------
     team building
     -------------------------------------------------------------
     With a player deck (6 card ids from the deck builder): the player
     fields exactly those heroes, and the enemy draws 6 distinct random
     heroes from the remaining pool. Without a deck, both sides are
     random — 12 distinct heroes split 6v6, as before. */
  var playerDeck = null; // card ids of the last deck used (for rematch)

  function flatten() {
    var all = [];
    window.EOL.factions.forEach(function (f) {
      f.cards.forEach(function (c) {
        all.push({ card: c, faction: f });
      });
    });
    return all;
  }

  function buildTeams(deckIds) {
    var all = flatten();
    var byId = {};
    all.forEach(function (e) {
      byId[e.card.id] = e;
    });
    var deckEntries =
      deckIds && deckIds.length === 6
        ? deckIds.map(function (id) {
            return byId[id];
          })
        : null;
    var legal =
      deckEntries &&
      deckEntries.every(Boolean) &&
      new Set(deckIds).size === 6 &&
      window.EOL.rules.withinRoleCap(deckEntries); // hard deck rule: <=3 per role

    if (!legal) {
      var rnd = window.EOL.rules.splitCapped(all, Math.random);
      /* player keeps the pure-random draw; the bot drafts around three
         of its randoms, same as the deck path */
      var seeds = rnd[1].slice(0, 3);
      var rest2 = all.filter(function (e) {
        return rnd[0].indexOf(e) < 0 && seeds.indexOf(e) < 0;
      });
      return { player: rnd[0], enemy: draftBotTeam(seeds, rest2), explicit: false };
    }

    var inDeck = {};
    deckIds.forEach(function (id) {
      inDeck[id] = true;
    });
    var rest = all
      .filter(function (e) {
        return !inDeck[e.card.id];
      })
      .sort(function () {
        return Math.random() - 0.5;
      });
    /* The bot drafts, too — its team is half luck, half judgement:
       three capped randoms from the leftover pool, then three picks
       drafted around them. */
    var enemyRnd = [];
    var counts = {};
    for (var i = 0; i < rest.length && enemyRnd.length < 3; i++) {
      var r = rest[i].card.role;
      if ((counts[r] || 0) >= window.EOL.rules.MAX_PER_ROLE) continue;
      counts[r] = (counts[r] || 0) + 1;
      enemyRnd.push(rest[i]);
      rest[i] = null;
    }
    var enemy = draftBotTeam(enemyRnd, rest.filter(Boolean));
    return {
      /* the deck's array order IS the player's formation: slots 0-2 are
         the front row, 3-5 the back row (deck builder guarantees this). */
      player: deckIds.map(function (id) {
        return byId[id];
      }),
      enemy: enemy,
      explicit: true,
    };
  }

  /* ---------------------------------------------------------
     Bot drafting — three picks built around the random three
     -------------------------------------------------------------
     Synergy is scored straight from the card specs: mark sources feed
     mark consumers (discovered by walking each kit, so cards added
     later join the web automatically), then role coverage (a Tank, a
     Medic, damage dealers) and a light faction-flavour clump. A small
     roll keeps identical pools from always ending on identical boards.
     --------------------------------------------------------- */
  var MARK_SETS = null;

  function markSets() {
    if (MARK_SETS) return MARK_SETS;
    var src = {},
      con = {};
    function see(e, id) {
      if (e.k === 'mark') src[id] = true;
      if (e.k === 'consumeMark' || e.onlyMarked || e.ifTargetMarked || e.ifAttackerMarked)
        con[id] = true;
      if (e.if && (e.if.targetMarked || e.if.ifTargetMarked)) con[id] = true;
      if (e.when && (e.when.targetMarked || e.when.ifAttackerMarked)) con[id] = true;
      if (e.cond && (e.cond.anyTargetMarked || e.cond.anyEnemyMarked)) con[id] = true;
      if (e.then) walk(e.then, id);
      if (e.other) walk(e.other, id);
    }
    function walk(effects, id) {
      (effects || []).forEach(function (e) {
        see(e, id);
      });
    }
    window.EOL.factions.forEach(function (f) {
      f.cards.forEach(function (c) {
        walk(c.ability.spec && c.ability.spec.effects, c.id);
        walk(c.ability.passive && c.ability.passive.effects, c.id);
        walk(c.ability.passive && c.ability.passive.onHit, c.id);
      });
    });
    MARK_SETS = { src: src, con: con };
    return MARK_SETS;
  }

  function draftValue(team, cand) {
    var ms = markSets();
    var s = 0;
    team.forEach(function (t) {
      /* a mark link scores once per counterpart; two-way links (think
         Athena feeding Zeus AND cashing his marks) only get a small
         extra, else double-dipping buries role coverage entirely */
      var fwd = ms.src[cand.card.id] && ms.con[t.card.id];
      var rev = ms.con[cand.card.id] && ms.src[t.card.id];
      if (fwd || rev) s += 6;
      if (fwd && rev) s += 2;
      if (cand.faction.id === t.faction.id) s += 1; // flavour clump
    });
    var counts = {};
    team.forEach(function (t) {
      counts[t.card.role] = (counts[t.card.role] || 0) + 1;
    });
    var role = cand.card.role;
    /* coverage beats synergy by a nose: the first Tank outranks any
       single synergy pull (a tankless team of combos is the classic
       bad draft), the first Medic nearly so */
    if (role === 'Tank') s += counts.Tank ? 2 : 9;
    else if (role === 'Medic') s += counts.Medic ? 2 : 6;
    else {
      var dmg = (counts.Bruiser || 0) + (counts.Sniper || 0) + (counts.Caster || 0);
      s += dmg < 2 ? 4 : 1;
    }
    return s;
  }

  /* Greedy picks with a light roll for board variety. Structure rails
     guard the tail: synergy compounds quadratically (every web member
     makes the next web member look better), so a draft that still
     lacks a Tank or a Medic when the slots run short must close them
     out — the web holds the free slots, never the skeleton. */
  function draftBotTeam(randoms, pool) {
    var team = randoms.slice();
    var rest = pool.slice();
    while (team.length < 6) {
      var counts = {};
      team.forEach(function (t) {
        counts[t.card.role] = (counts[t.card.role] || 0) + 1;
      });
      var slotsLeft = 6 - team.length;
      var needTank = !counts.Tank,
        needMedic = !counts.Medic;
      var forced = null;
      if (needTank && slotsLeft <= (needMedic ? 2 : 1)) forced = 'Tank';
      else if (needMedic && slotsLeft <= 1) forced = 'Medic';

      var best = -1,
        bestScore = -Infinity;
      for (var passForced = 0; passForced < 2 && best < 0; passForced++) {
        for (var i = 0; i < rest.length; i++) {
          var cand = rest[i];
          if ((counts[cand.card.role] || 0) >= window.EOL.rules.MAX_PER_ROLE) continue;
          if (forced && !passForced && cand.card.role !== forced) continue;
          var v = draftValue(team, cand) + Math.random() * 2.5;
          if (v > bestScore) {
            bestScore = v;
            best = i;
          }
        }
        /* forced role absent from the pool: drop the rail */
      }
      if (best < 0) break; // pool exhausted under the cap
      team.push(rest.splice(best, 1)[0]);
    }
    return team;
  }

  /* ---------------------------------------------------------
     rendering
     --------------------------------------------------------- */
  /* `deadView` renders the hero as a corpse regardless of engine state.
     A revive resolves synchronously in the engine, so without this the
     card would already show its restored HP and new buffs while the
     death/resurrection is still playing out on screen. */
  function unitCardHTML(u, deadView) {
    var pct = deadView ? 0 : Math.max(0, (u.hp / u.maxHp) * 100);
    var shieldPct = deadView ? 0 : Math.min(100, (u.shield / u.maxHp) * 100);
    var atk = deadView ? u.baseAtk : E.atkOf(u);
    var def = deadView ? u.baseDef : E.defOf(u);
    var atkDelta = deadView ? 0 : atk - u.baseAtk;
    var defDelta = deadView ? 0 : def - u.baseDef;

    /* every buff/debuff gets its own icon, laid out in rows of 3 */
    var sts = window.EOL.statusesOf(u, E);
    // team-wide cost modifiers apply to this unit too
    (B.costMods[u.side] || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      var key = up ? 'costup' : 'costdown';
      var def = window.EOL.STATUS[key];
      var hit = sts.filter(function (o) {
        return o.key === key;
      })[0];
      if (hit) hit.count += 1;
      else
        sts.push({
          key: key,
          icon: def.icon,
          kind: def.kind,
          label: def.label,
          turns: m.turns,
          count: 1,
        });
    });

    if (deadView) sts = [];

    var chips = sts
      .map(function (st) {
        var tip =
          st.label + (st.turns ? ' (' + st.turns + ' round' + (st.turns > 1 ? 's' : '') + ')' : '');
        var sdef = window.EOL.STATUS[st.key] || {};
        var big = st.key === 'burn' || st.key === 'exposed' ? ' big-status' : '';
        return (
          '<span class="st-chip ' +
          st.kind +
          big +
          '"' +
          (sdef.color ? ' style="--sc:' + sdef.color + '"' : '') +
          ' title="' +
          esc(tip) +
          '">' +
          '<i class="ra ' +
          st.icon +
          '"></i>' +
          (st.count > 1 ? '<b class="st-n">' + st.count + '</b>' : '') +
          '</span>'
        );
      })
      .join('');

    var acted = deadView ? false : B.acted[u.side][u.uid];

    return (
      '' +
      '<div class="bstats">' +
      '<div class="bhp">' +
      '<i class="ra ra-health bhp-ico"></i>' +
      '<span class="bbar">' +
      '<span class="bbar-fill" style="width:' +
      pct +
      '%"></span>' +
      (!deadView && u.shield > 0
        ? '<span class="bbar-shield" style="width:' + shieldPct + '%"></span>'
        : '') +
      '</span>' +
      '<span class="bhp-txt' +
      (!deadView && u.shield > 0 ? ' shielded' : '') +
      '">' +
      (deadView ? '0' : Math.ceil(u.hp + u.shield).toLocaleString()) +
      '</span>' +
      '</div>' +
      '<div class="bnums">' +
      '<span class="bnum' +
      (atkDelta > 0 ? ' up' : atkDelta < 0 ? ' down' : '') +
      '">' +
      '<i class="ra ra-sword"></i>' +
      atk +
      '</span>' +
      '<span class="bnum' +
      (defDelta > 0 ? ' up' : defDelta < 0 ? ' down' : '') +
      '">' +
      '<i class="ra ra-shield"></i>' +
      def +
      '%</span>' +
      '</div>' +
      '</div>' +
      /* card art, styled to match the collection: rarity frame, corner
         filigree, rune ring, element orb, rarity pip and role plate */
      '<div class="bcard">' +
      '<div class="bcard-inner">' +
      '<div class="bcard-art">' +
      '<span class="bart-ring"></span>' +
      '<i class="ra ' +
      u.card.icon +
      '"></i>' +
      '</div>' +
      '<div class="bcard-vig"></div>' +
      '<div class="bcard-frame"></div>' +
      '<span class="bcorner tl"></span><span class="bcorner tr"></span>' +
      '<span class="bcorner bl"></span><span class="bcorner br"></span>' +
      '<div class="bcard-top">' +
      '<span class="borb" title="' +
      esc(u.element) +
      '">' +
      '<i class="ra ' +
      (ELEMENT_ICON[u.element] || 'ra-player') +
      '"></i></span>' +
      '</div>' +
      '<div class="bcard-chips">' +
      chips +
      '</div>' +
      '<div class="bcard-foot">' +
      '<div class="bcard-role"><i class="ra ' +
      (ROLE_ICON[u.role] || 'ra-player') +
      '"></i>' +
      esc(u.role) +
      '</div>' +
      '<div class="bcard-name">' +
      esc(u.name) +
      '</div>' +
      '</div>' +
      (acted ? '<div class="bcard-acted"><i class="ri-check-line"></i></div>' : '') +
      '<div class="bcard-ring"></div>' +
      '</div>' +
      '</div>'
    );
  }

  function abilityTip(u) {
    var sig = u.card.ability;
    var role = E.roleAbility(u);
    function row(a, isSig) {
      var cost = a.type === 'Active' ? E.costOf(B, u, a) : null;
      var afford = a.type !== 'Active' || B.energy[u.side] >= cost;
      return (
        '<div class="tip-ab' +
        (afford ? '' : ' poor') +
        '">' +
        '<div class="tip-ab-top">' +
        '<span class="tip-tag ' +
        (a.type === 'Passive' ? 'passive' : isSig ? 'sig' : 'role') +
        '">' +
        (a.type === 'Passive' ? 'Passive' : isSig ? 'Skill' : 'Basic') +
        '</span>' +
        '<span class="tip-ab-name">' +
        esc(a.name) +
        '</span>' +
        (a.type === 'Active'
          ? '<span class="tip-cost"><i class="ra ra-lightning-bolt"></i>' + cost + '</span>'
          : '') +
        '</div>' +
        '<div class="tip-ab-text">' +
        a.text +
        (a.note ? '<div class="tip-note">' + a.note + '</div>' : '') +
        '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="btip">' +
      '<div class="tip-head">' +
      '<span class="tip-name">' +
      esc(u.name) +
      '</span>' +
      '<span class="tip-meta">' +
      esc(u.role) +
      '<i class="ra ra-diamond tip-dot"></i><span style="color:' +
      (ELEMENT_COLOR[u.element] || '#fff') +
      '">' +
      esc(u.element) +
      '</span>' +
      '<i class="ra ra-diamond tip-dot"></i>' +
      (E.isFront(u) ? 'Front' : 'Back') +
      ' Row</span>' +
      '</div>' +
      row(sig, true) +
      row(role, false) +
      '</div>'
    );
  }

  /* FLIP: remember where every card sits before a rebuild so we can
     glide it from its old slot to its new one afterwards. */
  function captureSlots() {
    var map = {};
    document.querySelectorAll('.bcell-wrap').forEach(function (el) {
      var card = el.querySelector('.bcard');
      if (!card || !card.dataset.uid) return;
      var r = el.getBoundingClientRect();
      map[card.dataset.uid] = { x: r.left, y: r.top };
    });
    return map;
  }

  function glideSlots(before) {
    document.querySelectorAll('.bcell-wrap').forEach(function (el) {
      var card = el.querySelector('.bcard');
      if (!card || !card.dataset.uid) return;
      var old = before[card.dataset.uid];
      if (!old) return;
      var r = el.getBoundingClientRect();
      var dx = old.x - r.left,
        dy = old.y - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      // jump back to the old spot, then release for a smooth glide
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(function () {
        el.style.transition = '';
        el.style.transform = '';
      });
    });
  }

  function render() {
    if (!B) return;
    var slotsBefore = captureSlots();
    ['enemy', 'player'].forEach(function (side) {
      var wrap = $('grid-' + side);
      if (!wrap) return;
      wrap.innerHTML = '';
      // slots 0-5; front row (0-2) faces the middle of the board
      /* Formation is 2 columns x 3 rows, filled row-major. Each side's
         FRONT row (slots 0-2) takes the column nearest the centre line:
           player (left side)  -> front row is the RIGHT column
           enemy  (right side) -> front row is the LEFT column */
      var order =
        side === 'player'
          ? [3, 0, 4, 1, 5, 2] // rows of: back, front
          : [0, 3, 1, 4, 2, 5]; // rows of: front, back
      order.forEach(function (slot) {
        var u = B.units.filter(function (x) {
          return x.side === side && x.slot === slot;
        })[0];
        var cell = document.createElement('div');
        cell.className = 'bcell';
        if (!u) {
          cell.classList.add('empty');
          wrap.appendChild(cell);
          return;
        }

        // a hero whose resurrection hasn't lit yet still reads as a corpse
        var vdead = !u.alive || isDownForRevive(u.uid);
        cell.className =
          'bcell-wrap ' + side + (vdead ? ' dead' : '') + (E.isFront(u) ? ' front' : ' back');
        cell.dataset.uid = u.uid;
        cell.style.setProperty('--fc-primary', u.faction.colors.primary);
        cell.style.setProperty('--el', ELEMENT_COLOR[u.element] || '#fff');
        cell.dataset.rarity = u.card.rarity;
        cell.innerHTML = unitCardHTML(u, vdead && u.alive);

        var inner = cell.querySelector('.bcard');
        if (inner) {
          inner.dataset.uid = u.uid;
          inner.dataset.rarity = u.card.rarity;
          inner.classList.add(side);
          if (vdead) inner.classList.add('dead');
          if (E.isFront(u)) inner.classList.add('front');
          else inner.classList.add('back');
        }
        if (!vdead) {
          var hit = inner;
          hit.addEventListener('click', function (ev) {
            ev.stopPropagation();
            onCardClick(u);
          });
          hit.addEventListener('mouseenter', function () {
            hoverUnit = u;
            paintDock();
          });
          hit.addEventListener('mouseleave', function () {
            if (hoverUnit === u) {
              hoverUnit = null;
              paintDock();
            }
          });
        }
        wrap.appendChild(cell);
      });
    });

    // energy + round
    ['player', 'enemy'].forEach(function (s) {
      var en = B.energy[s];
      var cap = E.energyForRound(B.round);
      $('en-fill-' + s).style.width = Math.min(100, (en / 100) * 100) + '%';
      $('en-val-' + s).textContent = en;
      $('en-cap-' + s).textContent = '/' + cap;
      var alive = E.unitsOf(B, s).length;
      $('alive-' + s).textContent = alive;
    });
    $('round-num').textContent = B.round;

    /* The phase is announced by the ROUND overlay (subs: basics only /
       skills unlocked) and by the lock badges on the ability rows — the
       old HUD pill was removed as HUD clutter. */
    var ramp = Math.round((E.rampMult(B.round) - 1) * 100);
    var rt = $('ramp-tag');
    if (rt) {
      rt.classList.toggle('on', ramp > 0);
      $('ramp-val').textContent = '+' + ramp + '%';
      var next = Math.round((E.rampMult(B.round + 1) - 1) * 100);
      rt.title =
        ramp > 0
          ? 'All heroes have +' + ramp + '% ATK. Next round: +' + next + '%.'
          : 'From round ' +
            E.RAMP_FROM +
            ', all heroes gain +' +
            Math.round(E.RAMP_STEP * 100) +
            '% ATK each round.';
    }
    var tl = $('turn-label');
    tl.textContent = B.over ? 'Battle Over' : B.turn === 'player' ? 'Your Action' : 'Enemy Action';
    tl.classList.toggle('enemy-turn', !B.over && B.turn === 'enemy');

    /* Status line under the round counter. States plainly what the game
       is waiting on, which the old "who opened the round" badge did not. */
    var it = $('init-tag');
    if (it) {
      var msg,
        cls = false;
      /* SHORT texts only — the pill is centre-clipped to ~150 px so it
         can never creep back over the energy readouts or the Pass
         button (full text lives in the pill's tooltip). */
      if (B.over) {
        msg = 'Battle over';
      } else if (B.passed.player && !B.passed.enemy) {
        msg = 'Enemy finishing';
        cls = true;
      } else if (B.passed.enemy && !B.passed.player) {
        msg = 'Enemy passed';
      } else if (B.turnPassed.enemy && B.turn === 'player') {
        msg = 'Enemy skipped'; // back-to-back chance: act!
      } else if (B.turn === 'enemy') {
        msg = 'Enemy thinking';
        cls = true;
      } else {
        msg = 'Your action';
      }
      it.classList.toggle('on', true);
      it.classList.toggle('enemy', cls);
      $('init-val').textContent = msg;
      it.title =
        'Sides trade one action at a time. Passing skips only ' +
        'that action — the round ends when both sides pass back-to-back.';
    }
    document.body.dataset.turn = B.turn;

    var canEnd = !B.over && B.turn === 'player';
    $('btn-endturn').disabled = !canEnd;

    sizeBoard();
    glideSlots(slotsBefore);
    Object.keys(reviveFx).forEach(applyReviveClass);
    paintSelection();
    paintDock();
  }

  /* Size the grid columns from the available row height. The factor stays
     at the old portrait 250:355 so the squarer 5:6 tile always fits its
     slot vertically (tile height = width * 6/5 < artH). */
  function sizeBoard() {
    ['player', 'enemy'].forEach(function (side) {
      var grid = $('grid-' + side);
      if (!grid) return;
      var cell = grid.querySelector('.bcell-wrap');
      var stats = grid.querySelector('.bstats');
      if (!cell || !stats) return;
      var rowH = cell.getBoundingClientRect().height;
      var statsH = stats.getBoundingClientRect().height;
      var gap = 5;
      var artH = Math.max(40, rowH - statsH - gap);
      grid.style.setProperty('--cardw', Math.floor((artH * 250) / 355) + 'px');
    });
    fitNames();
  }

  /* ---------------------------------------------------------
     Per-hero name fitting
     -------------------------------------------------------------
     Names range from "Zeus" to "Rumpelstiltskin", so one font size
     can't serve both: the long ones were clipped by the card border.
     Each name is measured against its own card and given its own size,
     so every hero's name fills the available width as fully as it can
     without overflowing.

     Measurement is done on a shared off-screen canvas rather than by
     reading offsetWidth in a loop, so there is no layout thrash.
     --------------------------------------------------------- */
  var MAX_NAME_PX = 12;
  var MIN_NAME_PX = 7.5;
  var _measureCtx = null;

  function measureCtx() {
    if (!_measureCtx) {
      var c = document.createElement('canvas');
      _measureCtx = c.getContext('2d');
    }
    return _measureCtx;
  }

  /* Widest font size (in px) at which `text` fits `avail` px. */
  function fitFontSize(ctx, text, avail, weight, family) {
    // width scales linearly with font size, so one measurement at a
    // reference size gives the answer directly — no binary search
    ctx.font = weight + ' ' + MAX_NAME_PX + 'px ' + family;
    var w = ctx.measureText(text).width;
    if (w <= avail) return MAX_NAME_PX;
    var px = MAX_NAME_PX * (avail / w);
    // letter-spacing and hinting make the linear estimate slightly
    // optimistic, so shave a hair and re-check
    px = Math.floor(px * 20) / 20;
    ctx.font = weight + ' ' + px + 'px ' + family;
    while (px > MIN_NAME_PX && ctx.measureText(text).width > avail) {
      px -= 0.25;
      ctx.font = weight + ' ' + px + 'px ' + family;
    }
    return Math.max(MIN_NAME_PX, px);
  }

  function fitNames() {
    /* Battle-board names only. Preparation cards (.prep-c) deliberately
       wrap onto multiple lines at a fixed size, so they must not be given
       an inline single-line font size here. */
    var nodes = document.querySelectorAll('.bcard-name:not(.prep-c .bcard-name)');
    if (!nodes.length) return;
    var ctx = measureCtx();
    // all board names share one font stack; read it once
    var probe = getComputedStyle(nodes[0]);
    var family = probe.fontFamily;
    var weight = probe.fontWeight;

    nodes.forEach(function (el) {
      var text = el.textContent;
      if (!text) return;
      // the foot padding is the only thing between the name and the edge
      var avail = el.clientWidth;
      if (!avail) return;
      if (el.dataset.fitFor === text && el.dataset.fitW === String(avail)) return;
      var px = fitFontSize(ctx, text, avail, weight, family);
      el.style.fontSize = px + 'px';
      el.dataset.fitFor = text;
      el.dataset.fitW = String(avail);
    });
  }

  /* highlight selected unit + legal targets */
  function paintSelection() {
    document.querySelectorAll('.bcard').forEach(function (c) {
      c.classList.remove('selected', 'targetable', 'chosen');
    });
    if (!sel) return;

    var selEl = document.querySelector('.bcard[data-uid="' + sel.unit.uid + '"]');
    if (selEl) selEl.classList.add(sel.view ? 'viewing' : 'selected');

    if (sel.ability) {
      var pool = E.legalTargets(B, sel.unit, sel.ability);
      var forced = E.forcedTarget(B, sel.unit, sel.ability);
      if (forced) pool = [forced];
      pool.forEach(function (u) {
        var el = document.querySelector('.bcard[data-uid="' + u.uid + '"]');
        if (el) el.classList.add('targetable');
      });
      sel.chosen.forEach(function (u) {
        var el = document.querySelector('.bcard[data-uid="' + u.uid + '"]');
        if (el) el.classList.add('chosen');
      });
    }
  }

  /* ---------------------------------------------------------
     Floating hero panel
     Appears in the empty space beside the board: allies on the
     left, enemies on the right. Hovering previews a hero; clicking
     one of yours locks it there and makes the abilities clickable.
     The layout is identical either way.
     --------------------------------------------------------- */
  var hoverUnit = null;

  function abilityRowHTML(u, a, isSig, interactive, idx) {
    var isActive = a.type === 'Active';
    var cost = isActive ? E.costOf(B, u, a) : null;
    var usable = isActive && E.canUse(B, u, a);
    var hasTargets = !isActive || E.pickCount(a) === 0 || E.legalTargets(B, u, a).length > 0;
    /* Only Actives may grey out (locked/unaffordable/no targets). Passives
       simply aren't selectable — greying them read as "broken". */
    var dis = isActive && (!usable || !hasTargets);
    var tag = a.type === 'Passive' ? 'passive' : isSig ? 'sig' : 'role';
    var tagTxt = a.type === 'Passive' ? 'Passive' : isSig ? 'Skill' : 'Basic';
    /* roleAbility() builds a fresh object every render, so for Basics the
       identity check fails right after re-paint and the selection's blue
       vanishes (signatures keep their gold because the card ref is stable).
       Match Basics by name + side instead. */
    var isSel =
      sel &&
      sel.ability &&
      (sel.ability === a ||
        (a.basic && sel.ability.basic && sel.ability.name === a.name && sel.unit === u));

    var lockedPhase = isSig && E.signatureBlocked(B, u, a);
    var lockTooltip = '';
    if (lockedPhase) {
      lockTooltip = 'Locked during Battle Phase 1 (Round 1). Unlocks in Round 2.';
    }

    // Only surface reasons the player can't infer from the UI itself —
    // an unaffordable cost is already obvious from the greyed-out button.
    var reason = '';
    if (lockedPhase) {
      reason = 'Locked in current Battle Phase';
    } else if (interactive && isActive && dis) {
      if (!hasTargets) reason = 'No valid targets';
      else if (u.flags.silence > 0 && !a.basic) reason = 'Silenced';
    }

    var el = interactive && isActive && !dis ? 'button' : 'div';
    return (
      '<' +
      el +
      ' class="dk-ab ' +
      tag +
      (interactive && isActive ? ' act' : '') +
      (dis ? ' dis' : '') +
      (isSel ? ' sel' : '') +
      '"' +
      (interactive && isActive && !dis ? ' data-ab="' + idx + '"' : '') +
      (lockTooltip ? ' title="' + esc(lockTooltip) + '"' : '') +
      '>' +
      '<div class="dk-ab-top">' +
      '<span class="dk-tag ' +
      tag +
      '">' +
      tagTxt +
      '</span>' +
      '<span class="dk-ab-name">' +
      esc(a.name) +
      '</span>' +
      (lockedPhase
        ? '<span class="dk-lock-badge" title="' +
          esc(lockTooltip) +
          '"><i class="ri-lock-fill"></i></span>'
        : '') +
      (isActive && !lockedPhase
        ? '<span class="dk-cost"><i class="ra ra-lightning-bolt"></i>' + cost + '</span>'
        : '') +
      '</div>' +
      '<div class="dk-ab-text">' +
      rich(a.text) +
      (a.note ? '<div class="dk-note">' + rich(a.note) + '</div>' : '') +
      '</div>' +
      (reason
        ? '<div class="dk-reason"><i class="ri-error-warning-line"></i>' + reason + '</div>'
        : '') +
      '</' +
      el +
      '>'
    );
  }

  /* Human-readable description for each active status. */
  function statusDesc(u, st) {
    var amt = 0;
    (u.buffs || []).forEach(function (b) {
      if (!b.stat) return;
      var k = b.stat + (b.amt >= 0 ? '+' : '-');
      if (k === st.key) amt += b.amt;
    });
    switch (st.key) {
      case 'atk+':
      case 'atk-':
        return (amt > 0 ? '+' : '') + amt + '% Attack';
      case 'def+':
      case 'def-':
        return (amt > 0 ? '+' : '') + amt + '% Defence';
      case 'crit+':
      case 'crit-':
        return (amt > 0 ? '+' : '') + amt + '% Crit Chance';
      case 'shield':
        return 'Absorbs ' + u.shield.toLocaleString() + ' damage';
      case 'taunt':
        return 'Forces enemies to attack this hero';
      case 'untargetable':
        return 'Cannot be targeted by enemies';
      case 'silence':
        return 'Skill blocked — Basic still usable';
      case 'marked':
        return 'This unit is marked for special interactions with certain abilities';
      case 'burn':
        return (
          'Takes ' +
          Math.round(u.maxHp * 0.05).toLocaleString() +
          " damage on every turn this hero's side takes"
        );
      case 'exposed':
        return 'Defence reduced to 0%';
      case 'healdown':
        return 'Healing received reduced by ' + Math.abs(u.flags.healMod) + '%';
      case 'costup':
        return 'Ability costs increased';
      case 'costdown':
        return 'Ability costs reduced';
      default:
        return '';
    }
  }

  function statusListHTML(u) {
    var sts = window.EOL.statusesOf(u, E);
    (B.costMods[u.side] || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      var key = up ? 'costup' : 'costdown';
      if (
        !sts.some(function (o) {
          return o.key === key;
        })
      ) {
        var d = window.EOL.STATUS[key];
        sts.push({
          key: key,
          icon: d.icon,
          kind: d.kind,
          label: d.label,
          turns: m.turns,
          count: 1,
        });
      }
    });
    if (!sts.length) return '';

    return (
      '<div class="dk-sts">' +
      sts
        .map(function (st) {
          return (
            '<div class="dk-st ' +
            st.kind +
            '">' +
            '<i class="ra ' +
            st.icon +
            '"></i>' +
            '<div class="dk-st-body">' +
            '<div class="dk-st-top">' +
            '<span class="dk-st-name">' +
            esc(st.label) +
            '</span>' +
            (st.count > 1 ? '<span class="dk-st-x">x' + st.count + '</span>' : '') +
            (st.turns
              ? '<span class="dk-st-t">' + st.turns + '<i class="ra ra-hourglass"></i></span>'
              : '') +
            '</div>' +
            '<div class="dk-st-desc">' +
            esc(statusDesc(u, st)) +
            '</div>' +
            '</div>' +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  /* Roster-wide maxima for the flyout's stat bars. Computed once from
     the card data so a bar is a real comparison between heroes rather
     than a hard-coded ceiling that everyone clips. Head-room is added so
     buffed values still have somewhere to go. */
  var STAT_MAX = null;
  function statMax() {
    if (STAT_MAX) return STAT_MAX;
    var hp = 0,
      atk = 0,
      def = 0;
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        if (c.stats.hp > hp) hp = c.stats.hp;
        if (c.stats.atk > atk) atk = c.stats.atk;
        if (c.stats.def > def) def = c.stats.def;
      });
    });
    STAT_MAX = {
      hp: hp || 7000,
      atk: Math.round((atk || 2000) * 1.35),
      def: Math.max(def || 30, 40),
    };
    return STAT_MAX;
  }

  function statLine(icon, key, val, pct, color) {
    return (
      '<div class="dk-stat" style="--sc:' +
      color +
      '">' +
      '<i class="ra ' +
      icon +
      '"></i>' +
      '<span class="dk-stat-k">' +
      key +
      '</span>' +
      '<span class="dk-stat-bar"><span style="width:' +
      Math.max(2, pct) +
      '%"></span></span>' +
      '<span class="dk-stat-v">' +
      val +
      '</span></div>'
    );
  }

  /* Decide what the panel shows: a locked selection beats a hover. */
  var dockKey = '';
  var swapTimer = null;

  function paintDock() {
    var fly = $('flyout');
    if (!fly) return;

    var u = (sel && sel.unit) || hoverUnit;
    // a hero mid-resurrection has no live stats to show
    if (u && isDownForRevive(u.uid)) u = null;
    if (!u) {
      fly.classList.remove('show');
      dockKey = '';
      return;
    }

    var locked = !!(sel && sel.unit);
    var sig = u.card.ability;
    var role = E.roleAbility(u);
    var mine = u.side === 'player';
    var interactive = locked && mine && !sel.view && !B.over && B.turn === 'player';
    // Only a genuinely different hero replays the swap animation. Locking
    // the same card (hover -> click) must not re-animate the panel.
    var fresh = dockKey !== u.uid;
    dockKey = u.uid;

    var hint = '';
    if (interactive && sel.ability) {
      var left = sel.needed - sel.chosen.length;
      hint =
        sel.needed === 0
          ? 'Resolving...'
          : left > 0
            ? 'Select <b>' + left + '</b> target' + (left > 1 ? 's' : '')
            : 'Confirming...';
    }

    var choices = '';
    if (interactive && sel.ability && sel.ability.spec && sel.ability.spec.choose) {
      choices = '<div class="dk-choices">';
      sel.ability.spec.choose.forEach(function (c, i) {
        choices +=
          '<button class="dk-choice' +
          (sel.choose === i ? ' sel' : '') +
          '" data-choice="' +
          i +
          '"><i class="ra ' +
          (c.icon || 'ra-diamond') +
          '"></i>' +
          esc(c.label) +
          '</button>';
      });
      choices += '</div>';
    }

    fly.innerHTML =
      '<div class="dk-head">' +
      '<div class="dk-portrait" style="--fc-primary:' +
      u.faction.colors.primary +
      '">' +
      '<i class="ra ' +
      u.card.icon +
      '"></i>' +
      '</div>' +
      '<div class="dk-id">' +
      '<div class="dk-name">' +
      esc(u.name) +
      '</div>' +
      '<div class="dk-meta">' +
      '<span>' +
      esc(u.role) +
      '</span>' +
      '<span style="color:' +
      (ELEMENT_COLOR[u.element] || '#fff') +
      '">' +
      esc(u.element) +
      '</span>' +
      '</div>' +
      '<div class="dk-pos">' +
      esc(u.faction.name) +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="dk-stats">' +
      statLine(
        'ra-health',
        'HP',
        Math.ceil(u.hp + u.shield).toLocaleString() + ' / ' + u.maxHp.toLocaleString(),
        (u.hp / u.maxHp) * 100,
        '#ff5f7e'
      ) +
      statLine(
        'ra-sword',
        'ATK',
        E.atkOf(u),
        Math.min(100, (E.atkOf(u) / statMax().atk) * 100),
        '#ffb347'
      ) +
      statLine(
        'ra-shield',
        'DEF',
        E.defOf(u) + '%',
        Math.min(100, (E.defOf(u) / statMax().def) * 100),
        '#5fb2ff'
      ) +
      (u.shield > 0
        ? statLine(
            'ra-round-shield',
            'SHD',
            u.shield,
            Math.min(100, (u.shield / u.maxHp) * 100),
            '#9fd8ff'
          )
        : '') +
      '</div>' +
      '<div class="dk-abs">' +
      abilityRowHTML(u, sig, true, interactive, 0) +
      abilityRowHTML(u, role, false, interactive, 1) +
      '</div>' +
      statusListHTML(u) +
      choices +
      (hint ? '<div class="dk-hint">' + hint + '</div>' : '');

    // allies open to the left of the board, enemies to the right
    fly.classList.toggle('right', u.side === 'enemy');
    fly.classList.toggle('locked', locked);
    fly.dataset.rarity = u.card.rarity;
    // mark a fresh unit so the whole panel animates in as one piece
    if (fresh) {
      fly.classList.remove('swap');
      void fly.offsetWidth;
      fly.classList.add('swap');
      // drop the class once it's done so a later rebuild of the SAME hero
      // (e.g. hover -> click) doesn't leave it armed and replay
      clearTimeout(swapTimer);
      swapTimer = setTimeout(function () {
        fly.classList.remove('swap');
      }, 280);
    }
    fly.classList.add('show');
    positionDock();

    fly.querySelectorAll('.dk-ab.act[data-ab]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var which = parseInt(btn.dataset.ab, 10);
        chooseAbility(u, which === 0 ? sig : role);
      });
    });
    fly.querySelectorAll('.dk-choice').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        sel.choose = parseInt(btn.dataset.choice, 10);
        paintDock();
      });
    });
  }

  /* The panel is pinned near the top of the board rather than tracking
     the hovered card, so it never jumps around as the pointer moves. */
  function positionDock() {
    var fly = $('flyout');
    if (fly) fly.style.top = '';
  }

  function chooseAbility(u, ability) {
    sel = { unit: u, ability: ability, needed: E.pickCount(ability), chosen: [], choose: 0 };

    // Robin Hood auto-locks his target
    var forced = E.forcedTarget(B, u, ability);
    if (forced && sel.needed === 1) {
      sel.chosen = [forced];
    }

    paintDock();
    paintSelection();

    if (sel.needed === 0) {
      // no target needed — fire immediately
      commit();
    } else if (sel.chosen.length === sel.needed) {
      commit();
    }
  }

  function onCardClick(u) {
    if (busy || B.over || B.turn !== 'player') return;

    var targeting = !!(sel && sel.ability && sel.needed > 0);

    // picking a target for a pending ability
    if (targeting) {
      var pool = E.legalTargets(B, sel.unit, sel.ability);
      var forced = E.forcedTarget(B, sel.unit, sel.ability);
      if (forced) pool = [forced];
      if (
        pool.some(function (x) {
          return x.uid === u.uid;
        })
      ) {
        if (
          sel.chosen.some(function (x) {
            return x.uid === u.uid;
          })
        ) {
          sel.chosen = sel.chosen.filter(function (x) {
            return x.uid !== u.uid;
          });
        } else {
          sel.chosen.push(u);
        }
        paintSelection();
        paintDock();
        if (sel.chosen.length === sel.needed) commit();
        return;
      }
    }

    // Enemy cards are not selectable outside of target picking — clicking
    // one just clears any pending selection.
    if (u.side !== 'player') {
      clearSel();
      return;
    }

    // your own heroes that can't act are view-only
    if (B.acted.player[u.uid]) {
      sel = { unit: u, ability: null, needed: 0, chosen: [], choose: 0, view: true };
      paintDock();
      paintSelection();
      return;
    }
    sel = { unit: u, ability: null, needed: 0, chosen: [], choose: 0 };
    paintDock();
    paintSelection();
  }

  function commit() {
    var s = sel;
    if (!s || !s.ability) return;
    var mark = B.log.length;
    var res = E.useAbility(B, s.unit, s.ability, s.chosen, s.choose);
    if (!res.ok) {
      toast('Cannot use that: ' + res.reason);
      return;
    }
    clearSel();
    render();

    // A coin flip has to be watched before anything else resolves, so
    // block input, play it, then release the rest of the log.
    var coin = B.log.slice(mark).filter(function (l) {
      return l.type === 'coin';
    })[0];
    if (coin) {
      busy = true;
      document.body.dataset.busy = '1';
      var coinHold = playCoinFlip(coin.meta.coin);
      setTimeout(function () {
        render();
        var h2 = flashRecent();
        setTimeout(function () {
          busy = false;
          document.body.dataset.busy = '0';
          render();
          afterPlayerAction();
        }, h2 || 0);
      }, coinHold);
      return;
    }

    var hold = flashRecent();
    if (hold) {
      // a resurrection plays out before control passes
      busy = true;
      document.body.dataset.busy = '1';
      setTimeout(function () {
        busy = false;
        document.body.dataset.busy = '0';
        render();
        afterPlayerAction();
      }, hold);
      return;
    }
    afterPlayerAction();
  }

  function clearSel() {
    sel = null;
    paintSelection();
    paintDock();
  }

  /* ---------------------------------------------------------
     Auto end-turn countdown
     When the player has no legal moves left we don't end the turn
     outright — the End Turn button fills over 5s and the player can
     click it to go immediately.
     --------------------------------------------------------- */
  var AUTO_MS = 5000;
  var autoRaf = null,
    autoStart = 0;

  function cancelAuto() {
    if (autoRaf) {
      cancelAnimationFrame(autoRaf);
      autoRaf = null;
    }
    var btn = $('btn-endturn');
    if (btn) {
      btn.classList.remove('counting');
      btn.style.setProperty('--fill', '0%');
      var lbl = btn.querySelector('.et-count');
      if (lbl) lbl.textContent = '';
    }
  }

  function startAuto() {
    cancelAuto();
    var btn = $('btn-endturn');
    if (!btn || btn.disabled) return;
    btn.classList.add('counting');
    autoStart = performance.now();

    function frame(now) {
      if (B.over || B.turn !== 'player') {
        cancelAuto();
        return;
      }
      var t = Math.min(1, (now - autoStart) / AUTO_MS);
      btn.style.setProperty('--fill', (t * 100).toFixed(1) + '%');
      var lbl = btn.querySelector('.et-count');
      if (lbl) lbl.textContent = Math.ceil(((1 - t) * AUTO_MS) / 1000) + 's';
      if (t >= 1) {
        cancelAuto();
        endTurn();
        return;
      }
      autoRaf = requestAnimationFrame(frame);
    }
    autoRaf = requestAnimationFrame(frame);
  }

  /* Player's window: banner the handover and start the bot pondering;
     if the player has no legal action left they must pass, so the End
     Turn button fills over 5s and passes for them. */
  function maybeAutoEndTurn() {
    if (B.over || B.turn !== 'player') return;
    announceTurn('player');
    ponderKick();
    if (!E.canAct(B, 'player')) startAuto();
  }

  /* ---------------------------------------------------------
     PONDERING — the bot keeps thinking during the player's window
     -------------------------------------------------------------
     Stockfish-style pondering. A live decision is always made at
     depth 4 minimum, but while the player is deciding, the bot
     predicts the likeliest player actions (its own top heuristic
     picks, plus a pass — the only move when the player can't act, so
     that branch always lands), applies each one on a throwaway clone,
     and re-searches the resulting positions at growing depth, from
     PONDER_MIN_DEPTH up to PONDER_MAX_DEPTH. Breadth-first: every
     branch reaches a depth before any branch climbs higher, and each
     pass runs in its own macrotask so the board never freezes.

     A pondered move only counts when the position that actually
     arrives matches the position that was searched. rng-driven
     variance on the player's real action (crits, coin flips, burn
     ticks at a round rollover) can leave the states diverged — the
     state key comparison catches that, and the bot simply thinks
     live at depth 4 exactly as it always has. */
  var PONDER_MIN_DEPTH = 4;
  var PONDER_MAX_DEPTH = 8;
  var PONDER_BUDGET_MS = 1600; // total compute per player window
  var PONDER_GAP_MS = 90; // breathing room between deep passes
  var ponder = null; // live pondering session
  var ponderTimer = null;
  /* Diagnostics: how often the arriving position is one pondering
     searched. Exposed as EOL.battle.ponderStats() for tuning.
     misses are simply decisions - hits. */
  var ponderStats = { kicks: 0, decisions: 0, hits: 0, lastDepth: 0 };

  function ponderCancel() {
    if (ponderTimer) {
      clearTimeout(ponderTimer);
      ponderTimer = null;
    }
    if (ponder) ponder.cancelled = true;
    ponder = null;
  }

  /* A position fingerprint. Matches between the live battle and a
     pondered clone exactly when the player took the predicted action
     AND its outcome rolled no variance (cloneUnit preserves field
     order, so serialized buffs/pending align). */
  function stateKey(S) {
    var actedP = Object.keys(S.acted.player).sort().join(',');
    var actedE = Object.keys(S.acted.enemy).sort().join(',');
    var costM = ['player', 'enemy']
      .map(function (s) {
        return (S.costMods[s] || [])
          .map(function (m) {
            return (m.flat || 0) + '/' + (m.pct || 0) + '/' + m.turns;
          })
          .join(',');
      })
      .join('|');
    var units = S.units
      .map(function (u) {
        var bf = (u.buffs || [])
          .map(function (b) {
            return (
              (b.stat || '') +
              (b.amt != null ? b.amt : '') +
              ':' +
              b.turns +
              (b.tag ? '#' + b.tag : '')
            );
          })
          .sort()
          .join(',');
        var fl = [];
        for (var k in u.flags) if (u.flags[k]) fl.push(k + '=' + u.flags[k]);
        var pd = (u.pending || [])
          .map(function (p) {
            return p.tag + ':' + p.turns;
          })
          .join(',');
        return [
          u.uid,
          u.alive ? 1 : 0,
          Math.round(u.hp),
          Math.round(u.shield),
          bf,
          fl.sort().join(','),
          pd,
        ].join('|');
      })
      .join(';');
    return [
      S.round,
      S.turn,
      S.energy.player,
      S.energy.enemy,
      S.passed.player ? 1 : 0,
      S.passed.enemy ? 1 : 0,
      S.turnPassed.player ? 1 : 0,
      S.turnPassed.enemy ? 1 : 0,
      actedP,
      actedE,
      costM,
      units,
    ].join('#');
  }

  /* Map an action described against one battle onto its twin in a
     clone (units matched by uid) — mirrors the AI's own rebind. */
  function ponderRebind(C, act) {
    var byUid = {};
    C.units.forEach(function (u) {
      byUid[u.uid] = u;
    });
    var unit = byUid[act.unit.uid];
    if (!unit) return null;
    var ability = act.ability.basic ? E.roleAbility(unit) : unit.card.ability;
    var chosen = (act.chosen || [])
      .map(function (t) {
        return byUid[t.uid];
      })
      .filter(Boolean);
    if ((act.chosen || []).length !== chosen.length) return null;
    return { unit: unit, ability: ability, chosen: chosen, choose: act.choose };
  }

  /* Play the predicted player action on the clone and advance the
     clock until the enemy is to move. False when the branch leads
     somewhere the bot doesn't act next. */
  function ponderApply(C, p) {
    if (p.pass) {
      E.passTurn(C, 'player');
    } else {
      var bound = ponderRebind(C, p.act);
      if (!bound) return false;
      var r = E.useAbility(C, bound.unit, bound.ability, bound.chosen, bound.choose);
      if (!r.ok) return false;
    }
    var n = C.over ? null : E.advanceAction(C);
    var guard = 0;
    while (!C.over && !n && guard++ < 24) {
      E.nextRound(C);
      if (!C.over) n = E.advanceAction(C);
    }
    return n === 'enemy' && !C.over;
  }

  function ponderKick() {
    ponderCancel();
    if (!B || B.over || B.turn !== 'player') return;

    var preds = [];
    if (!E.canAct(B, 'player')) {
      preds.push({ pass: true }); // the only move — a free hit
    } else {
      var cand = AI.candidates(B, 'player').sort(function (a, b) {
        return b.score - a.score;
      });
      var seen = {};
      for (var i = 0; i < cand.length && preds.length < 3; i++) {
        var c = cand[i];
        var id =
          c.unit.uid +
          '|' +
          c.ability.name +
          '|' +
          (c.chosen || [])
            .map(function (t) {
              return t.uid;
            })
            .join(',') +
          '|' +
          (c.choose || 0);
        if (seen[id]) continue;
        seen[id] = true;
        preds.push({ act: c });
      }
      preds.push({ pass: true }); // voluntary-pass hedge
    }

    var session = { t0: performance.now(), cancelled: false, branches: [] };
    preds.forEach(function (p) {
      var C = E.cloneBattle(B, Math.random);
      if (!ponderApply(C, p)) return;
      session.branches.push({ C: C, key: stateKey(C), depth: 0, move: null });
    });
    if (!session.branches.length) return;

    // predictions that land on the same position collapse into one
    var uniq = {};
    session.branches = session.branches.filter(function (b) {
      if (uniq[b.key]) return false;
      uniq[b.key] = true;
      return true;
    });

    ponder = session;
    ponderStats.kicks++;
    ponderTimer = setTimeout(function () {
      ponderStep(session, PONDER_MIN_DEPTH, 0);
    }, PONDER_GAP_MS);
  }

  function ponderOnce(br, d) {
    try {
      AI.setDepth(d);
      var act = AI.bestAction(br.C, 'enemy');
      AI.resetDepth();
      return act || true; // a null (pass) result needs no deeper passes
    } catch (e) {
      AI.resetDepth();
      return null; // scrap this branch
    }
  }

  function ponderStep(session, d, i) {
    if (!ponder || ponder !== session || session.cancelled) return;
    if (d > PONDER_MAX_DEPTH) return;
    if (performance.now() - session.t0 > PONDER_BUDGET_MS) return;

    var br = session.branches[i];
    var act = ponderOnce(br, d);
    if (act === null) {
      session.branches.splice(i, 1);
      if (!session.branches.length) {
        ponderCancel();
        return;
      }
      ponderSchedule(session, d, i); // same slot: the next branch
      return;
    }
    br.depth = d;
    if (act === true) {
      /* deeper search decided passing is best: honour that, but keep a
         move stored by an earlier pass — it stays the fallback plan
         for this very position (it was legal there by construction). */
      br.passed = true;
    } else {
      br.passed = false;
      br.move = {
        uid: act.unit.uid,
        basic: !!act.ability.basic,
        name: act.ability.name,
        chosen: (act.chosen || []).map(function (t) {
          return t.uid;
        }),
        choose: act.choose || 0,
      };
    }
    ponderSchedule(session, d, i + 1);
  }

  function ponderSchedule(session, d, i) {
    if (performance.now() - session.t0 > PONDER_BUDGET_MS) return;
    var nd = d,
      ni = i;
    if (ni >= session.branches.length) {
      nd = d + 1;
      ni = 0; // everyone has depth d — climb
      if (nd > PONDER_MAX_DEPTH) return;
    }
    ponderTimer = setTimeout(function () {
      ponderStep(session, nd, ni);
    }, PONDER_GAP_MS);
  }

  /* Pull a pondered move if the arriving position matches a searched
     one. Any irregularity and the caller falls back to the live
     depth-4 search — pondering can only ever upgrade a decision. */
  function ponderAction() {
    if (!ponder) return null;
    var key = stateKey(B);
    var br = null;
    for (var i = 0; i < ponder.branches.length; i++) {
      var b = ponder.branches[i];
      if (b.depth >= PONDER_MIN_DEPTH && b.key === key) {
        br = b;
        break;
      }
    }
    if (!br) return null;
    /* the search itself ruled passing best on this exact position —
       no need to burn the live search just to agree */
    if (!br.move) {
      if (br.passed) {
        ponderStats.hits++;
        return { pass: true };
      }
      return null;
    }

    var unit = null;
    B.units.forEach(function (u) {
      if (u.uid === br.move.uid) unit = u;
    });
    if (!unit || !unit.alive || unit.side !== 'enemy') return null;
    if (B.acted.enemy[unit.uid]) return null;

    var ability = br.move.basic ? E.roleAbility(unit) : unit.card.ability;
    if (!ability || ability.name !== br.move.name) return null;
    if (!E.canUse(B, unit, ability)) return null;

    var chosen = br.move.chosen
      .map(function (uid) {
        var t = null;
        B.units.forEach(function (u) {
          if (u.uid === uid) t = u;
        });
        return t;
      })
      .filter(Boolean);
    if (chosen.length !== br.move.chosen.length) return null;

    var need = E.pickCount(ability);
    if (need !== chosen.length) return null;
    if (need > 0) {
      var pool = E.legalTargets(B, unit, ability);
      var forced = E.forcedTarget(B, unit, ability);
      if (forced) pool = [forced];
      var legal = chosen.every(function (t) {
        return pool.some(function (p) {
          return p.uid === t.uid;
        });
      });
      if (!legal) return null;
    }
    ponderStats.hits++;
    ponderStats.lastDepth = br.depth;
    return {
      unit: unit,
      ability: ability,
      targets: chosen,
      chosen: chosen,
      choose: br.move.choose,
    };
  }

  /* ---------------------------------------------------------
     turn flow
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     ALTERNATING-ACTION FLOW
     -------------------------------------------------------------
     One ability = one action, then control passes. After the player
     acts we hand the clock to the engine: if it comes back 'enemy' the
     bot takes exactly one action and hands back; if the round is spent
     it rolls over.
     --------------------------------------------------------- */

  /* Called after the player resolves a single action. */
  function afterPlayerAction() {
    if (B.over) return endBattle();
    var nxt = E.advanceAction(B);
    if (!nxt) {
      startNextRound();
      return;
    }
    if (nxt === 'enemy') {
      render();
      runEnemyAction();
      return;
    }
    // still the player's action (the enemy passed)
    render();
    maybeAutoEndTurn();
  }

  /* "Pass" skips ONLY this action (2026-07-30 ruling): the enemy may
     still act, and if they do, you get another window this same round.
     The round only ends when both sides pass back-to-back. */
  function endTurn() {
    if (busy || B.over) return;
    cancelAuto();
    clearSel();
    E.passTurn(B, 'player');
    cine('YOU PASS', '', 'player', 1000, true);
    afterPlayerAction();
  }

  /* Roll the round over and hand control to whoever opens it. */
  function startNextRound() {
    E.nextRound(B);
    if (B.over) {
      render();
      return endBattle();
    }
    render();
    announceRound();
    var nxt = E.advanceAction(B);
    if (!nxt) {
      startNextRound();
      return;
    }
    if (nxt === 'enemy') {
      runEnemyAction();
      return;
    }
    maybeAutoEndTurn();
  }

  /* The bot takes exactly ONE action, then control returns. */
  async function runEnemyAction() {
    busy = true;
    document.body.dataset.busy = '1';
    /* Settle the decision while the position still exactly matches what
       pondering saw. A pondered move is depth 4-8; the live fallback is
       the usual depth 4. A pondered PASS is trusted outright. */
    ponderStats.decisions++;
    var decision = ponderAction(); // act | { pass: true } | null
    ponderCancel();
    var act = null;
    if (decision && decision.pass) {
      act = null; // pondering's verdict: pass
    } else if (decision) {
      act = decision; // pondered move (depth 4-8)
    } else {
      act = AI.bestAction(B, 'enemy'); // live fallback at the usual depth 4
    }
    render();
    // hold until the announcements have played out — the player's
    // thinking time (pondering itself already ran during THEIR window)
    await cineGate();

    if (!act) {
      E.passTurn(B, 'enemy');
      cine('ENEMY PASSES', '', 'enemy', 1100, true);
      await sleep(700);
    } else {
      announceTurn('enemy');
      // brief highlight so the player can follow what the bot is doing
      var el = document.querySelector('.bcard[data-uid="' + act.unit.uid + '"]');
      if (el) el.classList.add('ai-acting');
      act.targets.forEach(function (t) {
        var te = document.querySelector('.bcard[data-uid="' + t.uid + '"]');
        if (te) te.classList.add('ai-target');
      });
      // hold a beat so the acting/target highlights can be read before
      // the cast takes over
      await sleep(800);

      var mark = B.log.length;
      E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
      render();

      var coin = B.log.slice(mark).filter(function (l) {
        return l.type === 'coin';
      })[0];
      if (coin) await sleep(playCoinFlip(coin.meta.coin));

      await sleep(flashRecent() || 0);
      await sleep(850);
    }

    busy = false;
    document.body.dataset.busy = '0';
    if (B.over) return endBattle();

    var nxt = E.advanceAction(B);
    if (!nxt) {
      startNextRound();
      return;
    }
    if (nxt === 'enemy') {
      runEnemyAction();
      return;
    } // player passed
    render();
    maybeAutoEndTurn();
  }

  /* ---------------------------------------------------------
     Cinematic announcements
     -------------------------------------------------------------
     Replaces the old bottom toast ticker. Two tiers share one
     fixed, pointer-transparent overlay:

       tier 1  ROUND N (+ phase / ramp notes) — full cinematic with
               dim and a slow cycle
       tier 2  YOUR TURN / ENEMY TURN / passes — slim banner, no
               dim, quick cycle; deduped per unbroken streak so a
               side taking several actions in a row doesn't re-announce

     Announcements push into a small queue so a round reveal and its
     opening turn banner play one after another instead of stomping
     each other. Not used for skills — those read from the cast fx.
     --------------------------------------------------------- */
  var cineQ = [];
  var cineLive = false;
  var cineTimer = null;
  var turnBannerSide = null;

  function cine(title, sub, tone, ms, slim) {
    cineQ.push({
      title: title,
      sub: sub || '',
      tone: tone || 'round',
      ms: ms || 1350,
      slim: !!slim,
    });
    if (cineQ.length > 4) cineQ.shift(); // announcements never pile up
    cineDrain();
  }

  function cineDrain() {
    if (cineLive || !cineQ.length) return;
    var c = $('cine');
    if (!c) {
      cineQ.length = 0;
      return;
    }
    var it = cineQ.shift();
    cineLive = true;
    $('cine-title').textContent = it.title;
    $('cine-sub').textContent = it.sub;
    c.className = 'cine tone-' + it.tone + (it.slim ? ' slim' : '');
    c.style.setProperty('--cd', it.ms / 1000 + 's');
    void c.offsetWidth; // restart the cycle animation
    c.classList.add('show');
    cineTimer = setTimeout(function () {
      c.classList.remove('show');
      cineLive = false;
      cineDrain();
    }, it.ms);
  }

  function cineReset() {
    cineQ.length = 0;
    cineLive = false;
    clearTimeout(cineTimer);
    var c = $('cine');
    if (c) c.classList.remove('show');
  }

  function announceRound() {
    turnBannerSide = null; // a fresh round re-announces its opener
    var sub =
      B.round === 1
        ? 'Phase 1 — basics only'
        : B.round === 2
          ? 'Phase 2 — skills unlocked'
          : B.round === E.RAMP_FROM
            ? 'ATK ramp begins — +' + Math.round(E.RAMP_STEP * 100) + '% each round'
            : '';
    cine('ROUND ' + B.round, sub, 'round', 2100);
  }

  function announceTurn(side) {
    if (turnBannerSide === side) return; // same streak — stay quiet
    turnBannerSide = side;
    var sub =
      side === 'enemy' && B.passed.player
        ? 'Finishing the round'
        : side === 'player' && B.passed.enemy
          ? 'The round is yours'
          : '';
    cine(side === 'player' ? 'YOUR TURN' : 'ENEMY TURN', sub, side, 1000, true);
  }

  /* Let the announcements finish before the bot moves. The think time
     is the point: pondering already did its work during the player's
     own window, so this pause is purely breathing room for the player.
     Total wait = remaining overlay time + a readable beat after. */
  async function cineGate() {
    var guard = 0;
    while ((cineLive || cineQ.length) && guard++ < 80) await sleep(60);
    if (guard >= 80) return sleep(700); // wedged queue — floor beat
    return sleep(1100); // quiet beat after the last fade
  }

  /* ---------------------------------------------------------
     log / toast / end
     --------------------------------------------------------- */
  var lastLogLen = 0;

  /* ---------------------------------------------------------
     Attack effects
     A slash/bolt flies from the attacker to the target, the target
     flinches, and the board shakes on a big hit.
     --------------------------------------------------------- */
  var ELEMENT_FX = {
    Physical: {
      color: '#ffb27a',
      style: 'slash',
      trail: '#d8894f',
      sigil: 'ra-crossed-swords',
      shape: 'blade',
    },
    Magic: {
      color: '#c3aaff',
      style: 'orb',
      trail: '#9b7bff',
      sigil: 'ra-rune-stone',
      shape: 'arcane',
    },
    Shadow: {
      color: '#d08cff',
      style: 'wisp',
      trail: '#a05cd8',
      sigil: 'ra-moon-sun',
      shape: 'void',
    },
    Light: {
      color: '#ffe9a8',
      style: 'beam',
      trail: '#ffd977',
      sigil: 'ra-sun-symbol',
      shape: 'holy',
    },
    Lightning: {
      color: '#9fe8ff',
      style: 'bolt',
      trail: '#63d7ff',
      sigil: 'ra-lightning-bolt',
      shape: 'storm',
    },
    Fire: {
      color: '#ffb07a',
      style: 'flame',
      trail: '#ff7a4d',
      sigil: 'ra-fire-symbol',
      shape: 'ember',
    },
    Nature: {
      color: '#a6f0c2',
      style: 'thorn',
      trail: '#5fd48a',
      sigil: 'ra-pine-tree',
      shape: 'bloom',
    },
  };

  function fxLayer() {
    var l = $('fx');
    if (!l) {
      l = document.createElement('div');
      l.id = 'fx';
      l.className = 'fx-layer';
      $('board').appendChild(l);
    }
    return l;
  }

  function centreOf(uid) {
    var el = document.querySelector('.bcard[data-uid="' + uid + '"]');
    var layer = fxLayer();
    if (!el) return null;
    var lr = layer.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - lr.left, y: r.top + r.height / 2 - lr.top, el: el };
  }

  function spawn(cls, x, y, color, life) {
    var n = document.createElement('div');
    n.className = cls;
    n.style.left = x + 'px';
    n.style.top = y + 'px';
    if (color) n.style.setProperty('--fx', color);
    fxLayer().appendChild(n);
    setTimeout(function () {
      n.remove();
    }, life);
    return n;
  }

  /* --------------------------------------------------------
     Cast tell — fires at the caster as an ability begins.
     A rotating rune ring plus an element sigil, so you can see
     *what* is being cast before the projectile even lands.
     -------------------------------------------------------- */
  function playCast(uid, element, signature) {
    var a = centreOf(uid);
    if (!a) return;
    var fx = ELEMENT_FX[element] || ELEMENT_FX.Physical;

    var ring = spawn('fx-cast-ring' + (signature ? ' big' : ''), a.x, a.y, fx.color, 700);
    ring.innerHTML = '<span></span><span></span>';

    if (signature) {
      var sig = spawn('fx-cast-sigil', a.x, a.y, fx.color, 760);
      sig.innerHTML = '<i class="ra ' + fx.sigil + '"></i>';
    }

    // motes gathering inward before the release
    var n = signature ? 10 : 6;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2;
      var d = 34 + Math.random() * 18;
      var m = spawn('fx-gather', a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, fx.color, 460);
      m.style.setProperty('--gx', -Math.cos(ang) * d + 'px');
      m.style.setProperty('--gy', -Math.sin(ang) * d + 'px');
      m.style.animationDelay = i * 22 + 'ms';
    }

    if (a.el) {
      a.el.classList.add('casting');
      a.el.style.setProperty('--cast', fx.color);
      setTimeout(function () {
        var n2 = document.querySelector('.bcard[data-uid="' + uid + '"]');
        if (n2) {
          n2.classList.remove('casting');
          n2.style.removeProperty('--cast');
        }
      }, 620);
    }
  }

  /* --------------------------------------------------------
     Single-target strike: charge -> travel -> impact
     Each element gets its own projectile treatment.
     -------------------------------------------------------- */
  function playStrike(srcUid, tgtUid, element, crit) {
    var a = centreOf(srcUid),
      t = centreOf(tgtUid);
    if (!a || !t) return;
    var fx = ELEMENT_FX[element] || ELEMENT_FX.Physical;
    var dx = t.x - a.x,
      dy = t.y - a.y;
    var ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    var dist = Math.hypot(dx, dy);

    // 1. wind-up flare at the attacker
    var charge = spawn('fx-charge', a.x, a.y, fx.color, 260);
    charge.style.setProperty('--rot', ang + 'deg');
    if (a.el) {
      a.el.classList.add('lunge');
      a.el.style.setProperty('--lx', (dx > 0 ? 12 : -12) + 'px');
      setTimeout(function () {
        a.el.classList.remove('lunge');
        a.el.style.removeProperty('--lx');
      }, 320);
    }

    setTimeout(function () {
      // 2. projectile + trail
      var bolt = spawn('fx-bolt s-' + fx.style, a.x, a.y, fx.color, 320);
      bolt.style.setProperty('--dx', dx + 'px');
      bolt.style.setProperty('--dy', dy + 'px');
      bolt.style.setProperty('--rot', ang + 'deg');

      var beam = spawn('fx-beam', a.x, a.y, fx.trail, 340);
      beam.style.width = dist + 'px';
      beam.style.transform = 'rotate(' + ang + 'deg)';

      // sparks shed along the path
      for (var i = 0; i < 4; i++) {
        (function (k) {
          setTimeout(function () {
            var p = k / 4;
            var sp = spawn('fx-spark', a.x + dx * p, a.y + dy * p, fx.color, 420);
            sp.style.setProperty('--sx', Math.random() * 26 - 13 + 'px');
            sp.style.setProperty('--sy', Math.random() * 26 - 13 + 'px');
          }, k * 34);
        })(i);
      }

      // 3. impact
      setTimeout(function () {
        playImpact(t.x, t.y, fx, crit, element);
      }, 190);
    }, 130);
  }

  /* A critical gets its own sequence: the screen dims, a slashing X
     tears across the target, then a gold shockwave. */
  function playCritImpact(x, y, fx) {
    var layer = fxLayer();
    var lr = layer.getBoundingClientRect();

    var dim = spawn('fx-dim', lr.width / 2, lr.height / 2, null, 620);
    dim.style.left = '0';
    dim.style.top = '0';

    var slash = spawn('fx-crit-slash', x, y, '#ffd050', 700);
    slash.innerHTML = '<span></span><span></span>';

    spawn('fx-crit-ring', x, y, '#ffd050', 760);
    spawn('fx-ring slow', x, y, fx.color, 700);

    for (var i = 0; i < 14; i++) {
      var d = spawn('fx-dust', x, y, i % 2 ? '#ffd050' : fx.trail, 900);
      var ang = Math.random() * Math.PI * 2;
      var dist = 40 + Math.random() * 60;
      d.style.setProperty('--sx', Math.cos(ang) * dist + 'px');
      d.style.setProperty('--sy', Math.sin(ang) * dist + 'px');
      d.style.animationDelay = i * 16 + 'ms';
    }

    var bd = $('board');
    bd.classList.add('shake', 'crit-flash');
    setTimeout(function () {
      bd.classList.remove('shake', 'crit-flash');
    }, 520);

    var word = spawn('fx-crit', x, y, '#ffd050', 1200);
    word.textContent = 'CRITICAL';
  }

  function playImpact(x, y, fx, crit, element) {
    if (crit) {
      playCritImpact(x, y, fx);
    }
    var burst = spawn('fx-burst' + (crit ? ' crit' : ''), x, y, fx.color, 620);
    var shards = crit ? 10 : 7;
    var html = '';
    for (var i = 0; i < shards; i++) {
      html +=
        '<span style="--a:' +
        i * (360 / shards) +
        'deg;--d:' +
        (16 + Math.random() * 14) +
        'px"></span>';
    }
    burst.innerHTML = html;

    spawn('fx-ring', x, y, fx.color, 520);

    // a flat shock disc that reads as the blow landing on a surface
    spawn('fx-shock-disc', x, y, fx.color, 460);

    // element-flavoured debris: embers rise, thorns scatter, etc.
    var shape = fx.shape || 'blade';
    for (var j = 0; j < 6; j++) {
      var d = spawn('fx-dust s-' + shape, x, y, fx.trail, 700);
      d.style.setProperty('--sx', Math.random() * 70 - 35 + 'px');
      d.style.setProperty('--sy', -18 - Math.random() * 40 + 'px');
      d.style.animationDelay = j * 22 + 'ms';
    }

    // a few heavier chunks thrown along the hit direction
    for (var q = 0; q < 4; q++) {
      var ch = spawn('fx-chunk', x, y, fx.color, 620);
      var ca = Math.random() * Math.PI * 2;
      var cd = 26 + Math.random() * 40;
      ch.style.setProperty('--sx', (Math.cos(ca) * cd).toFixed(1) + 'px');
      ch.style.setProperty('--sy', (Math.sin(ca) * cd - 12).toFixed(1) + 'px');
      ch.style.setProperty('--rot', Math.floor(Math.random() * 540 - 270) + 'deg');
      ch.style.animationDelay = q * 26 + 'ms';
    }
  }

  /* --------------------------------------------------------
     AoE: a shockwave from the caster, the board washed in the
     element's colour, then an element-character strike on every
     target before the impact bursts.
     -------------------------------------------------------- */
  function playAoe(srcUid, targetUids, element) {
    var fx = ELEMENT_FX[element] || ELEMENT_FX.Magic;
    var el = element || 'Magic';
    var a = centreOf(srcUid);
    if (a) {
      spawn('fx-wave', a.x, a.y, fx.color, 900);
      spawn('fx-wave d2', a.x, a.y, fx.trail, 900);
      spawn('fx-charge big', a.x, a.y, fx.color, 420);
    }
    var bd = $('board');
    bd.classList.add('flash-' + el.toLowerCase());
    setTimeout(function () {
      bd.classList.remove('flash-' + el.toLowerCase());
    }, 460);

    targetUids.forEach(function (uid, i) {
      setTimeout(
        function () {
          var t = centreOf(uid);
          if (!t) return;
          playAoeStrike(t, fx, el);
          setTimeout(function () {
            playImpact(t.x, t.y, fx, false, element);
          }, 170);
        },
        90 + i * 80
      );
    });
  }

  /* The strike that lands on each AoE victim — every element has its
     own signature: storms fork jagged lightning down the board, fire
     calls a meteor volley, nature blooms leaves, light wheels god-rays
     behind its beam, magic stamps a rune, shadow tears rifts and
     physical pounds shock rings out of the impact point. */
  function playAoeStrike(t, fx, element) {
    switch (element) {
      case 'Lightning': {
        // twin forks crashing down — the flicker is what sells it
        var z = spawn('fx-zigzag', t.x, 0, fx.color, 500);
        z.style.top = '0px';
        z.style.setProperty('--h', t.y + 44 + 'px');
        var z2 = spawn('fx-zigzag', t.x + (Math.random() * 36 - 18), 0, fx.trail, 560);
        z2.style.top = '0px';
        z2.style.setProperty('--h', t.y + 44 + 'px');
        z2.style.animationDelay = '90ms';
        break;
      }
      case 'Fire':
        // a volley of meteors streaking in from above
        for (var m = 0; m < 3; m++) {
          (function (k) {
            setTimeout(function () {
              var me = spawn('fx-meteor', t.x, t.y, k === 2 ? '#ffd9a0' : fx.color, 740);
              me.style.setProperty('--mx', 110 + Math.random() * 90 + 'px');
              me.style.setProperty('--my', -(200 + Math.random() * 130) + 'px');
              me.style.setProperty('--ta', 26 + Math.random() * 22 + 'deg');
            }, k * 90);
          })(m);
        }
        break;
      case 'Nature': {
        // leaves and petals blooming out of the ground strike
        var bl = spawn('fx-bloom', t.x, t.y, fx.color, 1000);
        var html = '';
        for (var p = 0; p < 8; p++) {
          html +=
            '<i class="ra ' +
            (p % 2 ? 'ra-leaf' : fx.sigil) +
            '" style="--a:' +
            p * 45 +
            'deg;animation-delay:' +
            p * 24 +
            'ms"></i>';
        }
        bl.innerHTML = html;
        spawn('fx-ring slow', t.x, t.y, fx.trail, 700);
        break;
      }
      case 'Light': {
        // the classic beam, now with a wheel of god-rays behind it
        var ry = spawn('fx-rays', t.x, t.y, fx.color, 640);
        var rh = '';
        for (var r = 0; r < 8; r++) {
          rh += '<span style="transform: rotate(' + r * 45 + 'deg)"></span>';
        }
        ry.innerHTML = rh;
        var col = spawn('fx-column', t.x, 0, fx.color, 520);
        col.style.top = '0px';
        col.style.setProperty('--h', t.y + 40 + 'px');
        break;
      }
      case 'Magic': {
        // a glowing rune stamps down over the target
        var st = spawn('fx-rune-stamp', t.x, t.y, fx.color, 620);
        st.innerHTML = '<i class="ra ' + fx.sigil + '"></i>';
        var col2 = spawn('fx-column', t.x, 0, fx.trail, 500);
        col2.style.top = '0px';
        col2.style.opacity = '.55';
        col2.style.setProperty('--h', t.y + 40 + 'px');
        break;
      }
      case 'Shadow':
        // two rifts tear across the card, one high, one low
        for (var s = 0; s < 2; s++) {
          (function (k) {
            setTimeout(function () {
              var ri = spawn('fx-rift', t.x, t.y + (k ? -14 : 10), fx.color, 700);
              ri.style.setProperty('--ra', (k ? 24 : -30) + 'deg');
            }, k * 110);
          })(s);
        }
        break;
      default:
        // physical: shock rings pound out of the impact point
        spawn('fx-quake', t.x, t.y, fx.color, 560);
        setTimeout(function () {
          spawn('fx-quake', t.x, t.y, fx.trail, 700);
        }, 110);
    }
  }

  /* --------------------------------------------------------
     Revive (Sun Wukong's 72 Transformations)
     Smoke swallows the falling hero, a golden pillar erupts,
     rings snap outward and the card burns off its death pallor.
     -------------------------------------------------------- */
  /* Timeline. The engine resurrects synchronously, so the whole
     death-and-return has to be staged here:

       falling   340ms  hero drains to grey, stats blank out
       down      500ms  held grey while the smoke and pillar erupt
       restoring 700ms  colour and stats come back with the light

     `deadView` in unitCardHTML is on for the first two phases, so his HP,
     ATK/DEF and status chips stay dead until the light actually restores
     him rather than snapping live the instant the engine revives. */
  var REVIVE_FALL_MS = 340;
  var REVIVE_DOWN_MS = 500;
  var REVIVE_RESTORE_MS = 700;
  var REVIVE_TOTAL_MS = REVIVE_FALL_MS + REVIVE_DOWN_MS + REVIVE_RESTORE_MS;
  var reviveFx = {}; // uid -> { phase, at } so render() can resume the anim

  /* true while the hero should still be drawn as a corpse */
  function isDownForRevive(uid) {
    var st = reviveFx[uid];
    return !!st && (st.phase === 'falling' || st.phase === 'down');
  }

  /* (Re)paint the current revive phase on a card, offset by however much of
     it has already played, so a mid-flight render() resumes instead of
     restarting or snapping. Called on spawn and after every render. */
  function applyReviveClass(uid) {
    var cell = document.querySelector('.bcell-wrap[data-uid="' + uid + '"]');
    if (!cell) return;
    var st = reviveFx[uid];
    cell.classList.remove('falling', 'down', 'restoring');
    cell.style.removeProperty('animation-delay');
    if (!st) return;
    cell.classList.add(st.phase);
    var elapsed = performance.now() - st.at;
    if (elapsed > 8) cell.style.animationDelay = '-' + Math.round(elapsed) + 'ms';
  }

  /* Step the revive state machine, re-rendering on each phase change so the
     stat block flips from corpse to living exactly when the light returns. */
  function reviveStep(uid, phase, next, ms) {
    if (phase) reviveFx[uid] = { phase: phase, at: performance.now() };
    else delete reviveFx[uid];
    render();
    if (next)
      setTimeout(function () {
        next();
      }, ms);
  }

  function playRevive(uid, label) {
    var c = centreOf(uid);
    if (!c) return 0;
    var GOLD = '#ffd050';

    // the board holds its breath
    var dim = spawn('fx-dim', 0, 0, null, REVIVE_TOTAL_MS + 300);
    dim.style.left = '0';
    dim.style.top = '0';
    dim.style.animationDuration = REVIVE_TOTAL_MS + 300 + 'ms';

    // 0. the hero visibly falls, stays down, then is restored
    reviveStep(
      uid,
      'falling',
      function () {
        reviveStep(
          uid,
          'down',
          function () {
            reviveStep(
              uid,
              'restoring',
              function () {
                reviveStep(uid, null);
              },
              REVIVE_RESTORE_MS
            );
          },
          REVIVE_DOWN_MS
        );
      },
      REVIVE_FALL_MS
    );

    // 1. transformation smoke rolls over the card
    for (var s = 0; s < 9; s++) {
      var pf = spawn('fx-smoke', c.x, c.y, '#e8dcc0', 1100);
      var sa = (s / 9) * Math.PI * 2 + Math.random() * 0.4;
      var sd = 18 + Math.random() * 34;
      pf.style.setProperty('--sx', (Math.cos(sa) * sd).toFixed(1) + 'px');
      pf.style.setProperty('--sy', (Math.sin(sa) * sd - 10).toFixed(1) + 'px');
      pf.style.animationDelay = REVIVE_FALL_MS * 0.5 + s * 26 + 'ms';
    }

    // 2. pillar of golden light climbs out of the smoke
    setTimeout(function () {
      // pillar stands on the card and rises off the top of the board
      // (CSS pins it to top:0, so --h is the distance down to the hero)
      var col = spawn('fx-revive-pillar', c.x, c.y, GOLD, 1200);
      col.style.top = '0px'; // spawn() sets top inline
      col.style.setProperty('--h', c.y + 40 + 'px');
      spawn('fx-revive-flare', c.x, c.y, GOLD, 900);

      // 3. three rings snap outward, one behind the other
      [0, 130, 260].forEach(function (d) {
        setTimeout(function () {
          spawn('fx-revive-ring', c.x, c.y, GOLD, 820);
        }, d);
      });

      // 4. embers stream upward
      for (var i = 0; i < 18; i++) {
        var m = spawn('fx-revive-mote', c.x, c.y, i % 3 ? GOLD : '#fff3c4', 1200);
        m.style.setProperty('--sx', (Math.random() * 96 - 48).toFixed(1) + 'px');
        m.style.setProperty('--sy', (-46 - Math.random() * 82).toFixed(1) + 'px');
        m.style.animationDelay = i * 30 + 'ms';
      }

      // 5. the card pulses gold as it comes back. render() has rebuilt the
      //    DOM by now, so c.el is stale — re-query it.
      var live = document.querySelector('.bcard[data-uid="' + uid + '"]');
      if (live) {
        live.classList.add('reborn');
        setTimeout(function () {
          var n = document.querySelector('.bcard[data-uid="' + uid + '"]');
          if (n) n.classList.remove('reborn');
        }, REVIVE_RESTORE_MS + 200);
      }

      var bd = $('board');
      bd.classList.add('revive-flash');
      setTimeout(function () {
        bd.classList.remove('revive-flash');
      }, 700);

      // 6. callout
      var word = spawn('fx-revive-word', c.x, c.y, GOLD, 1400);
      word.textContent = label || 'REBORN';
    }, REVIVE_FALL_MS + REVIVE_DOWN_MS);

    return REVIVE_TOTAL_MS + 500;
  }

  /* --------------------------------------------------------
     Coin flip — a spinning coin that lands on a face
     -------------------------------------------------------- */
  function playCoinFlip(face, label) {
    var layer = fxLayer();
    var lr = layer.getBoundingClientRect();
    var wrap = document.createElement('div');
    wrap.className = 'fx-coin-wrap';
    wrap.style.left = lr.width / 2 + 'px';
    wrap.style.top = lr.height * 0.34 + 'px';
    wrap.innerHTML =
      '<div class="fx-coin ' +
      face +
      '">' +
      '<div class="coin-face heads"><i class="ra ra-crown"></i></div>' +
      '<div class="coin-face tails"><i class="ra ra-moon-sun"></i></div>' +
      '</div>' +
      '<div class="fx-coin-label"></div>';
    layer.appendChild(wrap);
    // reveal the result text once the coin settles
    setTimeout(function () {
      var t = wrap.querySelector('.fx-coin-label');
      t.textContent = face === 'heads' ? 'HEADS' : 'TAILS';
      t.classList.add('show');
    }, 1150);
    setTimeout(function () {
      wrap.classList.add('out');
    }, 1900);
    setTimeout(function () {
      wrap.remove();
    }, 2300);
    return 2100;
  }

  /* --------------------------------------------------------
     Buff / debuff visuals. Signature skills get a bigger,
     showier version than Basics.
     -------------------------------------------------------- */
  var STATUS_FX = {
    taunt: { color: '#ffd98a', icon: 'ra-shield', kind: 'buff' },
    untargetable: { color: '#a9e9ff', icon: 'ra-aura', kind: 'buff' },
    shield: { color: '#9fd8ff', icon: 'ra-round-shield', kind: 'buff' },
    silence: { color: '#e0a3ff', icon: 'ra-uncertainty', kind: 'debuff' },
    marked: { color: '#ffe066', icon: 'ra-lightning-storm', kind: 'debuff' },
    burn: { color: '#ff7a3c', icon: 'ra-burning-embers', kind: 'debuff' },
    exposed: { color: '#ff5f7e', icon: 'ra-broken-shield', kind: 'debuff' },
    healdown: { color: '#ff9d9d', icon: 'ra-broken-heart', kind: 'debuff' },
    costup: { color: '#ff9d9d', icon: 'ra-hourglass', kind: 'debuff' },
    costdown: { color: '#8fe3b0', icon: 'ra-hourglass', kind: 'buff' },
    atk: { color: '#ffb347', icon: 'ra-muscle-up', kind: 'buff' },
    def: { color: '#5fb2ff', icon: 'ra-heavy-shield', kind: 'buff' },
    crit: { color: '#ffd050', icon: 'ra-target-arrows', kind: 'buff' },
  };

  function playStatus(uid, key, positive, signature) {
    var t = centreOf(uid);
    if (!t) return;
    var def = STATUS_FX[key] || STATUS_FX.atk;
    var color = positive ? def.color : def.kind === 'buff' ? '#ff9d9d' : def.color;
    var big = signature ? ' big' : '';

    // rising or sinking glyph
    var g = spawn(
      'fx-status ' + (positive ? 'up' : 'down') + big,
      t.x,
      t.y + (positive ? 16 : -16),
      color,
      1000
    );
    g.innerHTML = '<i class="ra ' + def.icon + '"></i>';

    // ring sweeping the card
    spawn('fx-stat-ring ' + (positive ? 'up' : 'down') + big, t.x, t.y, color, 720);

    if (signature) {
      // signature skills also throw a rune circle and orbiting motes
      spawn('fx-rune ' + (positive ? 'up' : 'down'), t.x, t.y, color, 900);
      for (var i = 0; i < 6; i++) {
        var m = spawn('fx-mote', t.x, t.y, color, 860);
        m.style.setProperty('--a', i * 60 + 'deg');
        m.style.animationDelay = i * 45 + 'ms';
      }
    }
    var el = t.el;
    if (el) {
      var cls = positive ? 'buffed' : 'debuffed';
      el.classList.add(cls);
      setTimeout(function () {
        el.classList.remove(cls);
      }, 620);
    }
  }

  /* team-wide status (cost modifiers) pulses every unit on that side */
  function playTeamStatus(side, key, positive, signature) {
    E.unitsOf(B, side).forEach(function (u, i) {
      setTimeout(function () {
        playStatus(u.uid, key, positive, signature);
      }, i * 60);
    });
  }

  /* soft pulse for heals / buffs that have no attacker */
  /* Burn tick: a small pyre of flames rises off the card. */
  function playBurnTick(uid) {
    var t = centreOf(uid);
    if (!t) return;
    var C = '#ff7a3c';
    spawn('fx-burn-glow', t.x, t.y, C, 760);
    for (var i = 0; i < 9; i++) {
      var f = spawn('fx-burn-flame', t.x, t.y, i % 3 ? C : '#ffc46b', 820);
      f.style.setProperty('--sx', (Math.random() * 46 - 23).toFixed(1) + 'px');
      f.style.setProperty('--sy', (-30 - Math.random() * 44).toFixed(1) + 'px');
      f.style.animationDelay = i * 40 + 'ms';
    }
    if (t.el) {
      t.el.classList.add('burning-hit');
      setTimeout(function () {
        var n = document.querySelector('.bcard[data-uid="' + uid + '"]');
        if (n) n.classList.remove('burning-hit');
      }, 780);
    }
  }

  function playAura(uid, kind) {
    var t = centreOf(uid);
    if (!t) return;
    spawn('fx-aura ' + kind, t.x, t.y, null, 640);
    if (kind === 'heal') {
      // a swelling ring of light under the hero
      spawn('fx-heal-ring', t.x, t.y, '#7ef0a8', 820);
      for (var i = 0; i < 5; i++) {
        var m = spawn('fx-plus', t.x + (Math.random() * 44 - 22), t.y + 14, '#7ef0a8', 900);
        m.style.animationDelay = i * 70 + 'ms';
      }
      // motes spiralling upward
      for (var k = 0; k < 8; k++) {
        var sp = spawn('fx-heal-mote', t.x, t.y + 18, '#9dffc4', 950);
        sp.style.setProperty('--sx', (Math.random() * 58 - 29).toFixed(1) + 'px');
        sp.style.setProperty('--sy', (-40 - Math.random() * 46).toFixed(1) + 'px');
        sp.style.animationDelay = k * 46 + 'ms';
      }
    }
  }

  /* A shield forming: a hexagonal barrier snaps into place. */
  function playShieldForm(uid) {
    var t = centreOf(uid);
    if (!t) return;
    spawn('fx-barrier', t.x, t.y, '#9fd8ff', 900);
    spawn('fx-barrier d2', t.x, t.y, '#cfe9ff', 900);
    for (var i = 0; i < 6; i++) {
      var sh = spawn('fx-barrier-shard', t.x, t.y, '#9fd8ff', 760);
      var a = (i / 6) * Math.PI * 2;
      sh.style.setProperty('--sx', (Math.cos(a) * 40).toFixed(1) + 'px');
      sh.style.setProperty('--sy', (Math.sin(a) * 40).toFixed(1) + 'px');
      sh.style.animationDelay = i * 30 + 'ms';
    }
  }

  /* Cleanse: debuffs shatter and lift away. */
  function playCleanse(uid) {
    var t = centreOf(uid);
    if (!t) return;
    spawn('fx-cleanse-ring', t.x, t.y, '#bfe9ff', 760);
    for (var i = 0; i < 7; i++) {
      var p = spawn('fx-cleanse-mote', t.x, t.y, '#e8f6ff', 820);
      p.style.setProperty('--sx', (Math.random() * 60 - 30).toFixed(1) + 'px');
      p.style.setProperty('--sy', (-34 - Math.random() * 40).toFixed(1) + 'px');
      p.style.animationDelay = i * 34 + 'ms';
    }
  }

  /* Energy gained / stolen: a chevron pulse at the hero. */
  function playEnergy(uid, positive) {
    var t = centreOf(uid);
    if (!t) return;
    var c = positive ? '#7fe3ff' : '#ff9d9d';
    spawn('fx-energy-burst', t.x, t.y, c, 720);
    for (var i = 0; i < 5; i++) {
      var b = spawn('fx-energy-bit', t.x, t.y, c, 700);
      b.style.setProperty('--sx', (Math.random() * 50 - 25).toFixed(1) + 'px');
      b.style.setProperty(
        '--sy',
        ((positive ? -1 : 1) * (24 + Math.random() * 30)).toFixed(1) + 'px'
      );
      b.style.animationDelay = i * 40 + 'ms';
    }
  }

  /* Plays every FX for the log entries added since the last call.
     Returns how long the caller should wait before moving on. */
  function flashRecent() {
    var fresh = B.log.slice(lastLogLen);
    lastLogLen = B.log.length;
    var hold = 0;

    // group damage from the same attacker so multi-target hits read as AoE
    var groups = {};
    var order = [];
    fresh.forEach(function (l) {
      if (l.type !== 'damage' || !l.meta || !l.meta.src) return;
      var k = l.meta.src + '|' + (l.meta.element || '');
      if (!groups[k]) {
        groups[k] = [];
        order.push(k);
      }
      groups[k].push(l);
    });

    order.forEach(function (k) {
      var hits = groups[k];
      // AoE only when several DISTINCT victims are struck. Abilities that
      // hit one target twice (Mulan's Aim, Nezha's follow-up) are not AoE.
      var uids = [];
      hits.forEach(function (h) {
        if (uids.indexOf(h.meta.uid) === -1) uids.push(h.meta.uid);
      });
      if (uids.length < 2) return;

      playAoe(hits[0].meta.src, uids, hits[0].meta.element);
      hits.forEach(function (h, i) {
        h.__aoe = true;
        popNumber(h, 260 + i * 70);
      });
    });

    var seq = {}; // per-target hit counter, so repeat hits stagger
    var absorbed = {}; // targets whose shield already played this blow
    var lastHit = {}; // uid -> offset of the most recent blow
    var revived = {}; // uid -> ms to hold back follow-up status pops
    fresh.forEach(function (l) {
      if (!l.meta) return;
      if (!l.meta.uid && !l.meta.side) return;

      if (l.type === 'coin') {
        // already played by commit() before the rest of the log released
        return;
      }
      if (l.type === 'action') {
        // the cast tell fires first, so you see what is being cast
        playCast(l.meta.uid, l.meta.element, l.meta.signature);
        return;
      }
      if (l.type === 'damage' && l.meta.src && !l.__aoe) {
        // multi-hit abilities land one blow at a time instead of stacking
        var seat = seq[l.meta.uid] || 0;
        var already = absorbed[l.meta.uid];
        if (already) {
          // the shield already played this blow's projectile
          popNumber(l, already.offset + 400);
          absorbed[l.meta.uid] = null;
          return;
        }
        seq[l.meta.uid] = seat + 1;
        var offset = seat * 720;
        lastHit[l.meta.uid] = offset;
        setTimeout(function () {
          playStrike(l.meta.src, l.meta.uid, l.meta.element, l.meta.crit);
        }, offset);
        popNumber(l, offset + 320);
        return;
      }
      if (l.type === 'revive') {
        // land the resurrection just after the blow that felled the hero
        var rdelay = (lastHit[l.meta.uid] || 0) + 420;
        revived[l.meta.uid] = rdelay + REVIVE_FALL_MS + REVIVE_DOWN_MS + REVIVE_RESTORE_MS;
        hold = Math.max(hold, rdelay + REVIVE_TOTAL_MS + 500);
        (function (uid, d) {
          setTimeout(function () {
            playRevive(uid, 'REBORN');
          }, d);
        })(l.meta.uid, rdelay);
        return;
      }
      if (l.type === 'burn') {
        // damage-over-time tick: flames lick up the card, then the number
        playBurnTick(l.meta.uid);
        popNumber(l, 160);
        return;
      }
      if (l.type === 'heal') {
        playAura(l.meta.uid, 'heal');
        popNumber(l, 0);
        return;
      }
      if (l.type === 'energy' && l.meta.uid) {
        playEnergy(l.meta.uid, (l.meta.amount || 0) >= 0);
        return;
      }
      if (l.type === 'cleanse') {
        playCleanse(l.meta.uid);
        return;
      }
      if (l.type === 'absorb') {
        // shield soaked the blow — show it in shield colour
        var aseat = seq[l.meta.uid] || 0;
        seq[l.meta.uid] = aseat + 1;
        var aoff = aseat * 720;
        absorbed[l.meta.uid] = { offset: aoff };
        if (l.meta.src) {
          setTimeout(function () {
            playStrike(l.meta.src, l.meta.uid, 'Light', false);
          }, aoff);
        }
        popNumber(l, aoff + 320);
        return;
      }
      if (l.type === 'shield' && l.meta.amount != null) {
        playShieldForm(l.meta.uid);
        playStatus(l.meta.uid, 'shield', true, l.meta.signature);
        popNumber(l, 0);
        return;
      }
      if (l.type === 'buff' || l.type === 'debuff' || l.type === 'shield' || l.type === 'mark') {
        var key = l.meta.status || l.meta.stat;
        if (!key) return;
        var positive = l.type === 'buff' || l.type === 'shield';
        if (l.meta.amt != null) positive = l.meta.amt >= 0;
        // a hero mid-resurrection shows its new buffs once the light clears
        var wait = revived[l.meta.uid] || 0;
        if (wait) {
          (function (uid, k, pos, sig, d) {
            setTimeout(function () {
              playStatus(uid, k, pos, sig);
            }, d);
          })(l.meta.uid, key, positive, l.meta.signature, wait);
          return;
        }
        if (l.meta.side) playTeamStatus(l.meta.side, key, positive, l.meta.signature);
        else playStatus(l.meta.uid, key, positive, l.meta.signature);
        return;
      }
      if (l.type === 'damage' && !l.meta.src && !l.__aoe) popNumber(l, 0);
    });
    return hold;
  }

  /* floating damage / heal number, timed to land with the impact */
  /* Floating combat number. Rendered into the fx layer rather than the
     card so a dying card's grayscale filter can't wash it out. */
  function popNumber(l, delay) {
    if (l.meta.amount == null) return;
    var kind =
      l.type === 'heal'
        ? 'heal'
        : l.type === 'absorb'
          ? 'absorb'
          : l.type === 'shield'
            ? 'shieldgain'
            : l.type === 'burn'
              ? 'burn'
              : 'damage';
    var sign = kind === 'heal' || kind === 'shieldgain' ? '+' : '-';

    setTimeout(function () {
      var c = centreOf(l.meta.uid);
      if (!c) return;
      var pop = document.createElement('div');
      pop.className = 'pop ' + kind + (l.meta.crit ? ' crit' : '');
      pop.textContent = sign + Number(l.meta.amount).toLocaleString();
      // stack simultaneous numbers so they don't overlap
      var lane = popLane[l.meta.uid] || 0;
      popLane[l.meta.uid] = lane + 1;
      setTimeout(function () {
        popLane[l.meta.uid] = Math.max(0, (popLane[l.meta.uid] || 1) - 1);
      }, 900);
      pop.style.left = c.x + 'px';
      pop.style.top = c.y - lane * 26 + 'px';
      fxLayer().appendChild(pop);
      setTimeout(function () {
        pop.remove();
      }, 1100);

      if (l.meta.uid && c.el) {
        var cls = kind === 'heal' || kind === 'shieldgain' ? 'healed' : 'hit';
        c.el.classList.add(cls);
        setTimeout(function () {
          c.el.classList.remove('hit', 'healed');
        }, 1000);
      }
    }, delay);
  }
  var popLane = {};

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
    }, 2000);
  }

  function endBattle() {
    hideTip();
    cancelAuto();
    ponderCancel();
    cineReset();
    clearSel();
    var win = B.winner === 'player';
    var ov = $('result');
    ov.className = 'result show ' + (win ? 'win' : 'lose');
    ov.querySelector('.result-title').textContent = win ? 'Victory' : 'Defeat';
    ov.querySelector('.result-sub').textContent = win
      ? 'The enemy team has fallen.'
      : 'Your team has fallen.';
    ov.querySelector('.result-rounds').textContent =
      B.round === 1 ? 'Won in a single round' : 'Lasted ' + B.round + ' rounds';
  }

  /* Flyouts are CSS-driven and live inside each card, so nothing to
     position here. Kept so callers can force-clear any stray node. */
  function hideTip() {
    document.querySelectorAll('.tip-wrap').forEach(function (t) {
      t.remove();
    });
  }

  /* ---------------------------------------------------------
     boot
     -------------------------------------------------------------
     start({ deck: [cardId x6] }) fields that deck on the player side;
     start() with no args fields random teams — or reuses the last deck,
     so Rematch keeps your squad and shuffles a fresh enemy. */
  /* boot
     -------------------------------------------------------------
     start({ teams: { player: [entry x6], enemy: [entry x6] } }) fields
     exactly those sixes from the preparation phase — the player array's
     order IS their formation; the enemy gets role-aware auto-formation.
     Bare start() keeps the legacy random-team path (tests, fallbacks). */
  function start(opts) {
    E = window.EOL.engine;
    AI = window.EOL.ai;
    opts = opts || {};
    if (opts.teams && opts.teams.player && opts.teams.enemy) {
      playerDeck = null; // mode flows own their rematch config
      B = E.createBattle(opts.teams.player, E.optimizeFormation(opts.teams.enemy), {
        roleAware: false,
      });
    } else {
      if (opts.deck) playerDeck = opts.deck.slice();
      var teams = buildTeams(playerDeck);
      /* Decked formation is explicit — the player's array order is their
         placement; only the enemy gets the role-aware auto-formation. */
      B = teams.explicit
        ? E.createBattle(teams.player, E.optimizeFormation(teams.enemy), { roleAware: false })
        : E.createBattle(teams.player, teams.enemy, { roleAware: true });
    }
    sel = null;
    busy = false;
    hoverUnit = null;
    lastLogLen = 0;
    playerDone = false;
    enemyDone = false;
    reviveFx = {};
    document.body.dataset.busy = '0';
    hideTip();
    cancelAuto();
    ponderCancel();
    cineReset();
    turnBannerSide = null;
    $('result').className = 'result';

    // profile icons come from each team's first hero's faction
    $('pf-player').innerHTML = '<i class="ra ra-player"></i>';
    $('pf-enemy').innerHTML = '<i class="ra ra-skull"></i>';

    render();

    // round 1 always opens on the player (odd rounds are P1's)
    announceRound();
    announceTurn('player');
    ponderKick();
  }

  window.EOL.battle = {
    start: start,
    endTurn: endTurn,
    getState: function () {
      return B;
    },
    ponderStats: function () {
      return {
        kicks: ponderStats.kicks,
        decisions: ponderStats.decisions,
        hits: ponderStats.hits,
        misses: Math.max(0, ponderStats.decisions - ponderStats.hits),
        lastDepth: ponderStats.lastDepth,
      };
    },
    clearSel: clearSel,
    hideTip: hideTip,
    playStrike: playStrike,
    playAura: playAura,
    playAoe: playAoe,
    playStatus: playStatus,
    playCritImpact: playCritImpact,
    playCoinFlip: playCoinFlip,
    playRevive: playRevive,
    playBurnTick: playBurnTick,
    playCast: playCast,
    playShieldForm: playShieldForm,
    playCleanse: playCleanse,
    playEnergy: playEnergy,
    render: render,
    /* test hooks for the bot's draft (harness only) */
    _draft: draftBotTeam,
    _draftValue: draftValue,
    _markSets: markSets,
  };

  window.addEventListener('resize', function () {
    if (B) {
      sizeBoard();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var et = $('btn-endturn');
    if (et) et.addEventListener('click', endTurn);
    var rm = $('btn-rematch');
    if (rm)
      rm.addEventListener('click', function () {
        if (window.EOL.play && window.EOL.play.rematch) window.EOL.play.rematch();
        else start();
      });
    // clicking empty space cancels a pending selection
    var board = $('board');
    if (board)
      board.addEventListener('click', function () {
        if (!busy) clearSel();
      });
  });
})();

