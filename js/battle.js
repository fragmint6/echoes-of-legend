/* =============================================================
   Echoes of Legend — Battle UI
   Renders the board, handles selection/targeting, drives the bot.
   ============================================================= */
(function () {
  'use strict';

  var E, AI, B = null;
  var sel = null;        // { unit, ability, needed, chosen[] }
  var busy = false;      // blocks input while the bot acts
  var ROLE_ICON = {
    Tank: 'ra-shield', Bruiser: 'ra-battered-axe', Caster: 'ra-fairy-wand',
    Controller: 'ra-gears', Medic: 'ra-health', Sniper: 'ra-archery-target'
  };
  var ELEMENT_ICON = {
    Physical: 'ra-crossed-swords', Magic: 'ra-crystals', Shadow: 'ra-moon-sun',
    Light: 'ra-sun', Lightning: 'ra-lightning-bolt', Fire: 'ra-fire', Nature: 'ra-leaf'
  };
  var ELEMENT_COLOR = {
    Physical: 'var(--e-physical)', Magic: 'var(--e-magic)', Shadow: 'var(--e-shadow)',
    Light: 'var(--e-light)', Lightning: 'var(--e-lightning)', Fire: 'var(--e-fire)',
    Nature: 'var(--e-nature)'
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function $(id) { return document.getElementById(id); }
  function rich(t) { return window.EOL.colorElements(String(t)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------------------------------------------------------
     team building — one random hero per role, no duplicates
     --------------------------------------------------------- */
  function buildTeams() {
    var all = [];
    window.EOL.factions.forEach(function (f) {
      f.cards.forEach(function (c) { all.push({ card: c, faction: f }); });
    });
    var shuffled = all.slice().sort(function () { return Math.random() - 0.5; });
    return {
      player: shuffled.slice(0, 6),
      enemy: shuffled.slice(6, 12)
    };
  }

  /* ---------------------------------------------------------
     rendering
     --------------------------------------------------------- */
  function unitCardHTML(u) {
    var pct = Math.max(0, u.hp / u.maxHp * 100);
    var shieldPct = Math.min(100, u.shield / u.maxHp * 100);
    var atk = E.atkOf(u), def = E.defOf(u);
    var atkDelta = atk - u.baseAtk;
    var defDelta = def - u.baseDef;

    /* every buff/debuff gets its own icon, laid out in rows of 3 */
    var sts = window.EOL.statusesOf(u, E);
    // team-wide cost modifiers apply to this unit too
    (B.costMods[u.side] || []).forEach(function (m) {
      var up = (m.flat || 0) > 0 || (m.pct || 0) > 0;
      var key = up ? 'costup' : 'costdown';
      var def = window.EOL.STATUS[key];
      var hit = sts.filter(function (o) { return o.key === key; })[0];
      if (hit) hit.count += 1;
      else sts.push({ key: key, icon: def.icon, kind: def.kind, label: def.label,
                      turns: m.turns, count: 1 });
    });

    var chips = sts.map(function (st) {
      var tip = st.label + (st.turns ? ' · ' + st.turns + ' turn' + (st.turns > 1 ? 's' : '') : '');
      return '<span class="st-chip ' + st.kind + '" title="' + esc(tip) + '">' +
        '<i class="ra ' + st.icon + '"></i>' +
        (st.count > 1 ? '<b class="st-n">' + st.count + '</b>' : '') +
      '</span>';
    }).join('');

    var acted = B.acted[u.side][u.uid];

    return '' +
      '<div class="bstats">' +
        '<div class="bhp">' +
          '<i class="ra ra-health bhp-ico"></i>' +
          '<span class="bbar">' +
            '<span class="bbar-fill" style="width:' + pct + '%"></span>' +
            (u.shield > 0 ? '<span class="bbar-shield" style="width:' + shieldPct + '%"></span>' : '') +
          '</span>' +
          '<span class="bhp-txt">' + Math.ceil(u.hp).toLocaleString() + '</span>' +
        '</div>' +
        '<div class="bnums">' +
          '<span class="bnum' + (atkDelta > 0 ? ' up' : atkDelta < 0 ? ' down' : '') + '">' +
            '<i class="ra ra-sword"></i>' + atk + '</span>' +
          '<span class="bnum' + (defDelta > 0 ? ' up' : defDelta < 0 ? ' down' : '') + '">' +
            '<i class="ra ra-shield"></i>' + def + '%</span>' +
        '</div>' +
      '</div>' +

      /* card art, styled to match the collection: rarity frame, corner
         filigree, rune ring, element orb, rarity pip and role plate */
      '<div class="bcard">' +
      '<div class="bcard-inner">' +
        '<div class="bcard-art">' +
          '<span class="bart-ring"></span>' +
          '<i class="ra ' + u.card.icon + '"></i>' +
        '</div>' +
        '<div class="bcard-vig"></div>' +
        '<div class="bcard-frame"></div>' +
        '<span class="bcorner tl"></span><span class="bcorner tr"></span>' +
        '<span class="bcorner bl"></span><span class="bcorner br"></span>' +
        '<div class="bcard-top">' +
          '<span class="borb" title="' + esc(u.element) + '">' +
            '<i class="ra ' + (ELEMENT_ICON[u.element] || 'ra-player') + '"></i></span>' +
        '</div>' +
        '<div class="bcard-chips">' + chips + '</div>' +
        '<div class="bcard-foot">' +
          '<div class="bcard-role"><i class="ra ' + (ROLE_ICON[u.role] || 'ra-player') + '"></i>' +
            esc(u.role) + '</div>' +
          '<div class="bcard-name">' + esc(u.name) + '</div>' +
        '</div>' +
        (acted ? '<div class="bcard-acted"><i class="ri-check-line"></i></div>' : '') +
        '<div class="bcard-ring"></div>' +
      '</div>' +
      '</div>';
  }

  function abilityTip(u) {
    var sig = u.card.ability;
    var role = E.roleAbility(u);
    function row(a, isSig) {
      var cost = a.type === 'Active' ? E.costOf(B, u, a) : null;
      var afford = a.type !== 'Active' || B.energy[u.side] >= cost;
      return '<div class="tip-ab' + (afford ? '' : ' poor') + '">' +
        '<div class="tip-ab-top">' +
          '<span class="tip-tag ' + (a.type === 'Passive' ? 'passive' : (isSig ? 'sig' : 'role')) + '">' +
            (a.type === 'Passive' ? 'Passive' : (isSig ? 'Skill' : 'Basic')) + '</span>' +
          '<span class="tip-ab-name">' + esc(a.name) + '</span>' +
          (a.type === 'Active'
            ? '<span class="tip-cost"><i class="ra ra-lightning-bolt"></i>' + cost + '</span>' : '') +
        '</div>' +
        '<div class="tip-ab-text">' + a.text +
          (a.note ? '<div class="tip-note">' + a.note + '</div>' : '') + '</div>' +
      '</div>';
    }
    return '<div class="btip">' +
      '<div class="tip-head">' +
        '<span class="tip-name">' + esc(u.name) + '</span>' +
        '<span class="tip-meta">' + esc(u.role) +
          ' · <span style="color:' + (ELEMENT_COLOR[u.element] || '#fff') + '">' + esc(u.element) + '</span>' +
          ' · ' + (E.isFront(u) ? 'Front' : 'Back') + ' Row</span>' +
      '</div>' + row(sig, true) + row(role, false) + '</div>';
  }

  function render() {
    if (!B) return;
    ['enemy', 'player'].forEach(function (side) {
      var wrap = $('grid-' + side);
      if (!wrap) return;
      wrap.innerHTML = '';
      // slots 0-5; front row (0-2) faces the middle of the board
      /* Formation is 2 columns x 3 rows, filled row-major. Each side's
         FRONT row (slots 0-2) takes the column nearest the centre line:
           player (left side)  -> front row is the RIGHT column
           enemy  (right side) -> front row is the LEFT column */
      var order = side === 'player'
        ? [3, 0, 4, 1, 5, 2]   // rows of: back, front
        : [0, 3, 1, 4, 2, 5];  // rows of: front, back
      order.forEach(function (slot) {
        var u = B.units.filter(function (x) { return x.side === side && x.slot === slot; })[0];
        var cell = document.createElement('div');
        cell.className = 'bcell';
        if (!u) { cell.classList.add('empty'); wrap.appendChild(cell); return; }

        cell.className = 'bcell-wrap ' + side + (u.alive ? '' : ' dead') +
          (E.isFront(u) ? ' front' : ' back');
        cell.dataset.uid = u.uid;
        cell.style.setProperty('--fc-primary', u.faction.colors.primary);
        cell.style.setProperty('--el', ELEMENT_COLOR[u.element] || '#fff');
        cell.dataset.rarity = u.card.rarity;
        cell.innerHTML = unitCardHTML(u);

        var inner = cell.querySelector('.bcard');
        if (inner) {
          inner.dataset.uid = u.uid;
          inner.dataset.rarity = u.card.rarity;
          inner.classList.add(side);
          if (!u.alive) inner.classList.add('dead');
          if (E.isFront(u)) inner.classList.add('front');
          else inner.classList.add('back');
        }
        if (u.alive) {
          var hit = inner;
          hit.addEventListener('click', function (ev) {
            ev.stopPropagation();
            onCardClick(u);
          });
          hit.addEventListener('mouseenter', function () { hoverUnit = u; paintDock(); });
          hit.addEventListener('mouseleave', function () {
            if (hoverUnit === u) { hoverUnit = null; paintDock(); }
          });
        }
        wrap.appendChild(cell);
      });
    });

    // energy + round
    ['player', 'enemy'].forEach(function (s) {
      var en = B.energy[s];
      var cap = E.energyForRound(B.round);
      $('en-fill-' + s).style.width = Math.min(100, en / 100 * 100) + '%';
      $('en-val-' + s).textContent = en;
      $('en-cap-' + s).textContent = '/' + cap;
      var alive = E.unitsOf(B, s).length;
      $('alive-' + s).textContent = alive;
    });
    $('round-num').textContent = B.round;
    $('turn-label').textContent = B.over ? 'Battle Over'
      : (B.turn === 'player' ? 'Your Turn' : 'Enemy Turn');
    document.body.dataset.turn = B.turn;

    var canEnd = !B.over && B.turn === 'player';
    $('btn-endturn').disabled = !canEnd;

    sizeBoard();
    paintSelection();
    paintDock();
  }

  /* Size the grid columns from the available row height so the card art
     keeps its 250:355 ratio at any window size. */
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
      grid.style.setProperty('--cardw', Math.floor(artH * 250 / 355) + 'px');
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
    var dis = !usable || !hasTargets;
    var tag = a.type === 'Passive' ? 'passive' : (isSig ? 'sig' : 'role');
    var tagTxt = a.type === 'Passive' ? 'Passive' : (isSig ? 'Skill' : 'Basic');
    var isSel = sel && sel.ability === a;

    var reason = '';
    if (interactive && isActive && dis) {
      if (!hasTargets) reason = 'No valid targets';
      else if (u.flags.silence > 0 && !a.basic) reason = 'Silenced';
      else if (B.acted[u.side][u.uid]) reason = 'Already acted';
      else if (B.energy[u.side] < cost) reason = 'Not enough Energy';
    }

    var el = interactive && isActive && !dis ? 'button' : 'div';
    return '<' + el + ' class="dk-ab ' + tag +
        (interactive && isActive ? ' act' : '') +
        (dis ? ' dis' : '') + (isSel ? ' sel' : '') + '"' +
        (interactive && isActive && !dis ? ' data-ab="' + idx + '"' : '') + '>' +
      '<div class="dk-ab-top">' +
        '<span class="dk-tag ' + tag + '">' + tagTxt + '</span>' +
        '<span class="dk-ab-name">' + esc(a.name) + '</span>' +
        (isActive ? '<span class="dk-cost"><i class="ra ra-lightning-bolt"></i>' + cost + '</span>' : '') +
      '</div>' +
      '<div class="dk-ab-text">' + rich(a.text) +
        (a.note ? '<div class="dk-note">' + rich(a.note) + '</div>' : '') + '</div>' +
      (reason ? '<div class="dk-reason"><i class="ri-error-warning-line"></i>' + reason + '</div>' : '') +
      '</' + el + '>';
  }

  function statLine(icon, key, val, pct, color) {
    return '<div class="dk-stat" style="--sc:' + color + '">' +
      '<i class="ra ' + icon + '"></i>' +
      '<span class="dk-stat-k">' + key + '</span>' +
      '<span class="dk-stat-bar"><span style="width:' + Math.max(2, pct) + '%"></span></span>' +
      '<span class="dk-stat-v">' + val + '</span></div>';
  }

  /* Decide what the panel shows: a locked selection beats a hover. */
  function paintDock() {
    var fly = $('flyout');
    if (!fly) return;

    var u = (sel && sel.unit) || hoverUnit;
    if (!u) { fly.classList.remove('show'); return; }

    var locked = !!(sel && sel.unit);
    var sig = u.card.ability;
    var role = E.roleAbility(u);
    var mine = u.side === 'player';
    var interactive = locked && mine && !sel.view && !B.over && B.turn === 'player';

    var hint = '';
    if (interactive && sel.ability) {
      var left = sel.needed - sel.chosen.length;
      hint = sel.needed === 0 ? 'Resolving…'
        : (left > 0 ? 'Select <b>' + left + '</b> target' + (left > 1 ? 's' : '') : 'Confirming…');
    }

    var choices = '';
    if (interactive && sel.ability && sel.ability.spec && sel.ability.spec.choose) {
      choices = '<div class="dk-choices">';
      sel.ability.spec.choose.forEach(function (c, i) {
        choices += '<button class="dk-choice' + (sel.choose === i ? ' sel' : '') +
          '" data-choice="' + i + '"><i class="ra ' + (c.icon || 'ra-diamond') + '"></i>' +
          esc(c.label) + '</button>';
      });
      choices += '</div>';
    }

    fly.innerHTML =
      '<div class="dk-head">' +
        '<div class="dk-portrait" data-rarity="' + u.card.rarity + '"' +
          ' style="--fc-primary:' + u.faction.colors.primary + '">' +
          '<i class="ra ' + u.card.icon + '"></i>' +
        '</div>' +
        '<div class="dk-id">' +
          '<div class="dk-name">' + esc(u.name) + '</div>' +
          '<div class="dk-meta">' +
            '<span class="dk-rar ' + u.card.rarity + '">' + esc(u.card.rarity) + '</span>' +
            '<span>' + esc(u.role) + '</span>' +
            '<span style="color:' + (ELEMENT_COLOR[u.element] || '#fff') + '">' + esc(u.element) + '</span>' +
          '</div>' +
          '<div class="dk-pos">' + (E.isFront(u) ? 'Front Row' : 'Back Row') + ' · ' +
            esc(u.faction.name) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="dk-stats">' +
        statLine('ra-health', 'HP', Math.ceil(u.hp).toLocaleString() + ' / ' + u.maxHp.toLocaleString(),
                 u.hp / u.maxHp * 100, '#ff5f7e') +
        statLine('ra-sword', 'ATK', E.atkOf(u), Math.min(100, E.atkOf(u) / 1400 * 100), '#ffb347') +
        statLine('ra-shield', 'DEF', E.defOf(u) + '%', Math.min(100, E.defOf(u) / 85 * 100), '#5fb2ff') +
        (u.shield > 0 ? statLine('ra-round-shield', 'SHD', u.shield,
                 Math.min(100, u.shield / u.maxHp * 100), '#9fd8ff') : '') +
      '</div>' +

      '<div class="dk-abs">' +
        abilityRowHTML(u, sig, true, interactive, 0) +
        abilityRowHTML(u, role, false, interactive, 1) +
      '</div>' +
      choices +
      (hint ? '<div class="dk-hint">' + hint + '</div>' : '');

    // allies open to the left of the board, enemies to the right
    fly.classList.toggle('right', u.side === 'enemy');
    fly.classList.toggle('locked', locked);
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
      if (pool.some(function (x) { return x.uid === u.uid; })) {
        if (sel.chosen.some(function (x) { return x.uid === u.uid; })) {
          sel.chosen = sel.chosen.filter(function (x) { return x.uid !== u.uid; });
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
    if (u.side !== 'player') { clearSel(); return; }

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
    var res = E.useAbility(B, s.unit, s.ability, s.chosen, s.choose);
    if (!res.ok) { toast('Cannot use that: ' + res.reason); return; }
    clearSel();
    render();
    flashRecent();
    if (B.over) return endBattle();
    maybeAutoEndTurn();
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
  var autoRaf = null, autoStart = 0;

  function cancelAuto() {
    if (autoRaf) { cancelAnimationFrame(autoRaf); autoRaf = null; }
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
      if (B.over || B.turn !== 'player') { cancelAuto(); return; }
      var t = Math.min(1, (now - autoStart) / AUTO_MS);
      btn.style.setProperty('--fill', (t * 100).toFixed(1) + '%');
      var lbl = btn.querySelector('.et-count');
      if (lbl) lbl.textContent = Math.ceil((1 - t) * AUTO_MS / 1000) + 's';
      if (t >= 1) { cancelAuto(); endTurn(); return; }
      autoRaf = requestAnimationFrame(frame);
    }
    autoRaf = requestAnimationFrame(frame);
  }

  /* start the countdown once the player is out of legal moves */
  function maybeAutoEndTurn() {
    var left = E.unitsOf(B, 'player').filter(function (u) {
      if (B.acted.player[u.uid]) return false;
      return E.canUse(B, u, u.card.ability) || E.canUse(B, u, E.roleAbility(u));
    });
    if (!left.length) startAuto();
  }

  /* ---------------------------------------------------------
     turn flow
     --------------------------------------------------------- */
  function endTurn() {
    if (busy || B.over) return;
    cancelAuto();
    clearSel();
    E.setTurn(B, 'enemy');
    render();
    runEnemyTurn();
  }

  async function runEnemyTurn() {
    busy = true;
    document.body.dataset.busy = '1';
    render();
    await sleep(520);

    var guard = 0;
    while (!B.over && guard < 8) {
      var act = AI.bestAction(B, 'enemy');
      if (!act) break;
      guard++;

      // brief highlight so the player can follow what the bot is doing
      var el = document.querySelector('.bcard[data-uid="' + act.unit.uid + '"]');
      if (el) el.classList.add('ai-acting');
      act.targets.forEach(function (t) {
        var te = document.querySelector('.bcard[data-uid="' + t.uid + '"]');
        if (te) te.classList.add('ai-target');
      });
      await sleep(600);

      E.useAbility(B, act.unit, act.ability, act.chosen, act.choose);
      render();
      flashRecent();
      await sleep(480);
    }

    busy = false;
    document.body.dataset.busy = '0';
    if (B.over) return endBattle();

    E.setTurn(B, 'player');
    E.nextRound(B);
    render();
    if (B.over) return endBattle();
    toast('Round ' + B.round + ' — Energy ' + B.energy.player);
  }

  /* ---------------------------------------------------------
     log / toast / end
     --------------------------------------------------------- */
  var lastLogLen = 0;

  /* pop damage/heal numbers for anything new since the last render */
  function flashRecent() {
    var fresh = B.log.slice(lastLogLen);
    lastLogLen = B.log.length;
    fresh.forEach(function (l) {
      if (!l.meta || !l.meta.uid) return;
      if (l.type !== 'damage' && l.type !== 'heal') return;
      var el = document.querySelector('.bcard[data-uid="' + l.meta.uid + '"]');
      if (!el) return;
      var pop = document.createElement('div');
      pop.className = 'pop ' + l.type + (l.meta.crit ? ' crit' : '');
      pop.textContent = (l.type === 'damage' ? '-' : '+') + l.meta.amount;
      el.appendChild(pop);
      el.classList.add(l.type === 'damage' ? 'hit' : 'healed');
      setTimeout(function () {
        el.classList.remove('hit', 'healed');
        pop.remove();
      }, 1000);
    });
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function endBattle() {
    hideTip();
    cancelAuto();
    clearSel();
    var win = B.winner === 'player';
    var ov = $('result');
    ov.className = 'result show ' + (win ? 'win' : 'lose');
    ov.querySelector('.result-title').textContent = win ? 'Victory' : 'Defeat';
    ov.querySelector('.result-sub').textContent =
      win ? 'The enemy team has fallen.' : 'Your team has fallen.';
    ov.querySelector('.result-rounds').textContent =
      B.round === 1 ? 'Won in a single round' : 'Lasted ' + B.round + ' rounds';
  }

  /* Flyouts are CSS-driven and live inside each card, so nothing to
     position here. Kept so callers can force-clear any stray node. */
  function hideTip() {
    document.querySelectorAll('.tip-wrap').forEach(function (t) { t.remove(); });
  }

  /* ---------------------------------------------------------
     boot
     --------------------------------------------------------- */
  function start() {
    E = window.EOL.engine;
    AI = window.EOL.ai;
    var teams = buildTeams();
    B = E.createBattle(teams.player, teams.enemy, {});
    sel = null; busy = false; hoverUnit = null; lastLogLen = 0;
    document.body.dataset.busy = '0';
    hideTip();
    cancelAuto();
    $('result').className = 'result';

    // profile icons come from each team's first hero's faction
    $('pf-player').innerHTML = '<i class="ra ra-player"></i>';
    $('pf-enemy').innerHTML = '<i class="ra ra-skull"></i>';

    render();
    toast('Round 1 — Choose a hero to act');
  }

  window.EOL.battle = {
    start: start,
    endTurn: endTurn,
    getState: function () { return B; },
    clearSel: clearSel,
    hideTip: hideTip
  };

  window.addEventListener('resize', function () { if (B) { sizeBoard(); } });

  document.addEventListener('DOMContentLoaded', function () {
    var et = $('btn-endturn');
    if (et) et.addEventListener('click', endTurn);
    var rm = $('btn-rematch');
    if (rm) rm.addEventListener('click', start);
    // clicking empty space cancels a pending selection
    var board = $('board');
    if (board) board.addEventListener('click', function () { if (!busy) clearSel(); });
  });
})();
