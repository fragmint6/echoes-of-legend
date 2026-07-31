/* =============================================================
   Echoes of Legend — Play Flow (modes, preparation, draft)
   -------------------------------------------------------------
   Owns everything between "Play" and the battle board:

     Play menu     Classic / Draft / Campaign (placeholder)
     Classic       pick a saved deck of 12 (or a shuffle row), the bot
                   rolls a random legal 12 of its own
     Draft         snake-draft: packs of 3, you open odd packs and the
                   bot opens even ones (3 -> 1+1, one discard per pack);
                   12 packs = two legal decks of 12
     Preparation   shared by both modes: ban 2 enemy heroes (choices
                   hidden until you commit yours), then field 6 of your
                   surviving 10 and arrange front/back rows

   Bot brains (bans, six, draft picks) reuse the synergistic
   draft-scoring already shipped for team building in battle.js.
   ============================================================= */
(function () {
  'use strict';
  window.EOL = window.EOL || {};

  var BATTLE = function () { return window.EOL.battle; };
  var RULES = function () { return window.EOL.deckRules; };

  /* ---------------- shared roster helpers ---------------- */
  var FLAT = null, BY_ID = null;
  function flatten() {
    if (FLAT) return FLAT;
    FLAT = [];
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) { FLAT.push({ card: c, faction: f }); });
    });
    return FLAT;
  }
  function byId() {
    if (!BY_ID) {
      BY_ID = {};
      flatten().forEach(function (e) { BY_ID[e.card.id] = e; });
    }
    return BY_ID;
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return (window.EOL.ui && window.EOL.ui.esc) ? window.EOL.ui.esc(s) : String(s);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------------- status toasts (non-blocking beats) ---------------- */
  function toast(msg, icon) {
    var host = $('toasts');
    if (!host) return;
    var cls = icon ? (icon.indexOf('ra-') === 0 ? 'ra ' : 'ri ') + icon : 'ri ri-information-line';
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<i class="' + cls + '"></i><span>' + esc(msg) + '</span>';
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2100);
    setTimeout(function () { t.remove(); }, 2450);
  }

  /* ---------------- coach overlays (what to do, once per context) ---------------- */
  var COACH_KEY = 'eol.coach.v1';
  function coachSeen() {
    try { return JSON.parse(localStorage.getItem(COACH_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function coachHide() {
    var c = $('coach');
    if (!c) return;
    c.classList.remove('show');
    c.setAttribute('aria-hidden', 'true');
  }
  function coachOpen() {
    var c = $('coach');
    return !!(c && c.classList.contains('show'));
  }
  /* Shows the overlay unless this context was already explained once. */
  function coachShow(key, icon, title, body) {
    if (coachSeen().indexOf(key) >= 0) return false;
    var c = $('coach');
    if (!c) return true;
    $('coach-ico').className = 'ra ' + icon;
    $('coach-title').textContent = title;
    $('coach-body').textContent = body;
    c.classList.add('show');
    c.setAttribute('aria-hidden', 'false');
    try {
      var seen = coachSeen();
      seen.push(key);
      localStorage.setItem(COACH_KEY, JSON.stringify(seen));
    } catch (e) { /* private mode */ }
    return true;
  }


  /* ---------------- bot brains ---------------- */
  /* draftValue(team, cand) shipped with the bot team builder — synergy
     links (mark web), coverage rails and faction flavour. Bans flip it:
     the bot crosses out what YOUR squad makes strongest. A raw-power
     term keeps isolated stat monsters bannable too, and a small roll
     stops identical rosters from always drawing identical bans. */
  function powerOf(entry) {
    var s = entry.card.stats;
    return (s.atk + s.hp / 6 + s.def * 10) / 400;
  }

  function banScore(deckEntries, i) {
    var cand = deckEntries[i];
    var rest = deckEntries.filter(function (_, j) { return j !== i; });
    var v = window.EOL.battle._draftValue(rest, cand) + powerOf(cand) +
            Math.random() * 1.5;
    return v;
  }

  /* The bot's two bans against a 12-hero deck. */
  function chooseBans(deckEntries) {
    return deckEntries
      .map(function (_, i) { return i; })
      .sort(function (a, b) { return banScore(deckEntries, b) - banScore(deckEntries, a); })
      .slice(0, RULES().BANS)
      .map(function (i) { return deckEntries[i].card.id; });
  }

  /* Greedy best battle six from the surviving pool. Structure rails
     (same philosophy as the draft builder): never leave a Tank in the
     pool while the six go without one when a slot opens late — same for
     a Medic. The field carries NO role cap: the 2026-07-30 ruling makes
     the deck's max-4 the only rule. */
  function chooseSix(pool) {
    var team = [], rest = pool.slice();
    var FIELD = RULES().FIELD_SIZE;
    while (team.length < FIELD && rest.length) {
      var counts = {};
      team.forEach(function (t) { counts[t.card.role] = (counts[t.card.role] || 0) + 1; });
      var slotsLeft = FIELD - team.length;
      var forced = null;
      var hasTank = rest.some(function (e) { return e.card.role === 'Tank'; });
      var hasMedic = rest.some(function (e) { return e.card.role === 'Medic'; });
      if (!counts.Tank && hasTank && slotsLeft <= 2) forced = 'Tank';
      else if (!counts.Medic && hasMedic && slotsLeft <= 1) forced = 'Medic';

      var best = -1, bestScore = -Infinity;
      for (var passForced = 0; passForced < 2 && best < 0; passForced++) {
        for (var i = 0; i < rest.length; i++) {
          if (forced && !passForced && rest[i].card.role !== forced) continue;
          var v = window.EOL.battle._draftValue(team, rest[i]) + Math.random() * 2.5;
          if (v > bestScore) { bestScore = v; best = i; }
        }
      }
      team.push(rest.splice(best, 1)[0]);
    }
    return team;
  }

  /* Bot's draft pick from the on-table cards (respects the max-4 deck
     rule against its own pile). */
  function draftPick(team, offered) {
    var legal = offered.filter(function (e) {
      return !RULES().capBlocked(team, e.card);
    });
    if (!legal.length) legal = offered.slice();   // pool cornered the pile
    var best = legal[0], bestScore = -Infinity;
    legal.forEach(function (e) {
      var v = window.EOL.battle._draftValue(team, e) + Math.random() * 2.5;
      if (v > bestScore) { bestScore = v; best = e; }
    });
    return best;
  }

  /* =====================================================
     PREPARATION PHASE
     Two real card decks face off — yours left, theirs right — at
     collection aspect ratio, with full hover detail on every card.
     Bans stamp onto their deck; your picks slot from yours into the
     formation tray while their side folds away.
     ===================================================== */
  var prep = null;          // active preparation state
  var prepAnim = false;     // entrance stagger runs on phase ENTRY only —
                            // re-renders from ban/pick clicks stay snappy

  /* ---------------- battle-style hover tooltip ---------------- */
  /* The prep board speaks the battle board's language: cards look like
     the ones on the battlefield, and hovering one opens the same
     floating hero panel the fight uses (signature + role basic). */
  var SMAX = null;
  function statMax() {
    if (SMAX) return SMAX;
    SMAX = { hp: 1, atk: 1, def: 1 };
    flatten().forEach(function (e) {
      SMAX.hp = Math.max(SMAX.hp, e.card.stats.hp);
      SMAX.atk = Math.max(SMAX.atk, e.card.stats.atk);
      SMAX.def = Math.max(SMAX.def, e.card.stats.def);
    });
    return SMAX;
  }
  function rich(s) { return window.EOL.ui.rich(String(s)); }
  function roleIc(role) { return window.EOL.ui.ROLE_ICON[role] || 'ra-player'; }
  function elIc(el) { return window.EOL.ui.ELEMENT_ICON[el] || 'ra-player'; }
  function elCol(el) { return window.EOL.ui.ELEMENT_COLOR[el] || '#fff'; }

  function tipLine(icon, key, val, pct, color) {
    return '<div class="dk-stat" style="--sc:' + color + '">' +
      '<i class="ra ' + icon + '"></i>' +
      '<span class="dk-stat-k">' + key + '</span>' +
      '<span class="dk-stat-bar"><span style="width:' + Math.max(2, pct) + '%"></span></span>' +
      '<span class="dk-stat-v">' + val + '</span></div>';
  }
  function tipAbRow(a, tag, tagTxt) {
    return '<div class="dk-ab ' + tag + '">' +
      '<div class="dk-ab-top">' +
        '<span class="dk-tag ' + tag + '">' + tagTxt + '</span>' +
        '<span class="dk-ab-name">' + esc(a.name) + '</span>' +
        (a.type === 'Active' && a.cost != null
          ? '<span class="dk-cost"><i class="ra ra-lightning-bolt"></i>' + a.cost + '</span>' : '') +
      '</div>' +
      '<div class="dk-ab-text">' + rich(a.text) +
        (a.note ? '<div class="dk-note">' + rich(a.note) + '</div>' : '') + '</div>' +
    '</div>';
  }
  var lastTipId = null, tipSwapTimer = null;
  function showPrepTip(e, side) {
    var tip = $('prep-tip');
    if (!tip || !prep) return;
    var c = e.card, m = statMax();
    var sig = c.ability;
    var basic = window.EOL.engine.roleAbility({ role: c.role, element: c.element });
    var fresh = lastTipId !== c.id;
    lastTipId = c.id;
    tip.dataset.rarity = c.rarity;
    tip.innerHTML =
      '<div class="dk-head">' +
        '<div class="dk-portrait" data-rarity="' + c.rarity + '" style="--fc-primary:' +
          e.faction.colors.primary + '"><i class="ra ' + c.icon + '"></i></div>' +
        '<div class="dk-id">' +
          '<div class="dk-name">' + esc(c.name) + '</div>' +
          '<div class="dk-meta"><span>' + esc(c.role) + '</span>' +
            '<span style="color:' + elCol(c.element) + '">' + esc(c.element) + '</span></div>' +
          '<div class="dk-pos">' + esc(e.faction.name) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dk-stats">' +
        tipLine('ra-health', 'HP', c.stats.hp.toLocaleString(), c.stats.hp / m.hp * 100, '#ff5f7e') +
        tipLine('ra-sword', 'ATK', c.stats.atk.toLocaleString(), c.stats.atk / m.atk * 100, '#ffb347') +
        tipLine('ra-shield', 'DEF', c.stats.def + '%', c.stats.def / m.def * 100, '#5fb2ff') +
      '</div>' +
      '<div class="dk-abs">' +
        tipAbRow(sig, sig.type === 'Passive' ? 'passive' : 'sig',
                 sig.type === 'Passive' ? 'Passive' : 'Skill') +
        tipAbRow(basic, 'role', 'Basic') +
      '</div>';
    tip.classList.toggle('right', side === 'foe');   // your side left, theirs right
    tip.classList.add('show');
    tip.setAttribute('aria-hidden', 'false');
    if (fresh) {
      tip.classList.remove('swap');
      void tip.offsetWidth;
      tip.classList.add('swap');
      clearTimeout(tipSwapTimer);
      tipSwapTimer = setTimeout(function () { tip.classList.remove('swap'); }, 280);
    }
  }
  function hidePrepTip() {
    var tip = $('prep-tip');
    lastTipId = null;
    if (tip) { tip.classList.remove('show'); tip.setAttribute('aria-hidden', 'true'); }
  }

  /* A battle-board card: HP bar + ATK/DEF above a squarer art tile,
     exactly the shape the fight itself uses. Hover opens the tooltip. */
  function boardCard(e, i, side) {
    var c = e.card;
    var wrap = document.createElement('div');
    wrap.className = 'pcard prep-c';
    wrap.dataset.rarity = c.rarity;
    wrap.style.setProperty('--fc-primary', e.faction.colors.primary);
    if (prepAnim) wrap.style.animationDelay = (i * 30) + 'ms';
    wrap.innerHTML =
      '<div class="bstats">' +
        '<div class="bhp"><i class="ra ra-health bhp-ico"></i>' +
          '<span class="bbar"><span class="bbar-fill" style="width:100%"></span></span>' +
          '<span class="bhp-txt">' + c.stats.hp.toLocaleString() + '</span></div>' +
        '<div class="bnums">' +
          '<span class="bnum"><i class="ra ra-sword"></i>' + c.stats.atk + '</span>' +
          '<span class="bnum"><i class="ra ra-shield"></i>' + c.stats.def + '%</span></div>' +
      '</div>' +
      '<div class="bcard" data-rarity="' + c.rarity + '">' +
        '<div class="bcard-inner">' +
          '<div class="bcard-art"><span class="bart-ring"></span><i class="ra ' + c.icon + '"></i></div>' +
          '<div class="bcard-vig"></div>' +
          '<div class="bcard-frame"></div>' +
          '<span class="bcorner tl"></span><span class="bcorner tr"></span>' +
          '<span class="bcorner bl"></span><span class="bcorner br"></span>' +
          '<div class="bcard-top"><span class="borb" title="' + esc(c.element) + '">' +
            '<i class="ra ' + elIc(c.element) + '"></i></span></div>' +
          '<div class="bcard-foot">' +
            '<div class="bcard-role"><i class="ra ' + roleIc(c.role) + '"></i>' + esc(c.role) + '</div>' +
            '<div class="bcard-name">' + esc(c.name) + '</div>' +
          '</div>' +
          '<div class="bcard-ring"></div>' +
        '</div>' +
      '</div>';
    wrap.addEventListener('mouseenter', function () { showPrepTip(e, side); });
    wrap.addEventListener('mouseleave', hidePrepTip);
    return wrap;
  }

  /* front/back slot of a fielded id -> {row, idx} | null */
  function slotOf(id) {
    var fi = prep.front.indexOf(id);
    if (fi >= 0) return { row: 'front', idx: fi };
    var bi = prep.back.indexOf(id);
    if (bi >= 0) return { row: 'back', idx: bi };
    return null;
  }

  function startPrep(cfg) {
    // cfg: { mode, deckId|null, player12:[entries], enemy12:[entries] }
    var botBans = chooseBans(cfg.player12);   // locked in NOW, revealed later
    prep = {
      mode: cfg.mode,
      deckId: cfg.deckId || null,
      player12: cfg.player12,
      enemy12: cfg.enemy12,
      botBans: botBans,
      youBans: [],
      revealed: false,
      phase: 'ban',
      front: [],
      back: []
    };
    prepAnim = true;
    renderPrep();
    window.EOL.ui.show('prep');
    coachShow('prep-ban', 'ra-interdiction', 'Phase 1: Ban Two Heroes',
      'Tap 2 of the enemy\'s 12 heroes to ban them from the fight. The enemy bans 2 of ' +
      'yours at the same time — their picks stay hidden until you lock yours in.');
  }

  function renderPrep() {
    var p = prep, foeGrid = $('prep-enemy'), youGrid = $('prep-player');
    if (!p || !foeGrid || !youGrid) return;
    var dict = byId();
    hidePrepTip();   // the grid is about to be rebuilt, so stale hovers die

    $('prep-sub').textContent = p.phase === 'ban'
      ? 'Phase 1 — ban 2 of the enemy\'s heroes'
      : 'Phase 2 — field 6 of your surviving heroes';
    $('pstep-ban').classList.toggle('sel', p.phase === 'ban');
    $('pstep-pick').classList.toggle('sel', p.phase === 'pick');
    $('pstep-ban').classList.toggle('done', p.phase !== 'ban');

    /* the sides trade with the phase: bans show both decks, fielding
       folds theirs away and brings up the formation tray */
    $('prep-side-foe').hidden = p.phase === 'pick';
    $('prep-field').hidden = p.phase !== 'pick';
    $('prep-actions-main').hidden = p.phase === 'pick';
    $('prep-vs').hidden = p.phase === 'pick';

    /* entrance stagger only on phase entry; pick clicks stay snappy */
    youGrid.classList.toggle('quiet', !prepAnim);
    foeGrid.classList.toggle('quiet', !prepAnim);
    prepAnim = false;

    /* ---- your deck (left) ---- */
    youGrid.innerHTML = '';
    p.player12.forEach(function (e, i) {
      var el = boardCard(e, i, 'you');
      var foeBanned = p.botBans.indexOf(e.card.id) >= 0;
      if (p.revealed && foeBanned) el.classList.add('banned');
      if (p.phase === 'pick' && !foeBanned) {
        var slot = slotOf(e.card.id);
        if (slot) {
          el.classList.add('picked');
          var chip = document.createElement('span');
          chip.className = 'mk-slot ' + (slot.row === 'front' ? 'f' : 'b');
          chip.textContent = (slot.row === 'front' ? 'F' : 'B') + (slot.idx + 1);
          el.appendChild(chip);
        }
        el.addEventListener('click', function () { toggleSix(e.card.id); });
      }
      youGrid.appendChild(el);
    });
    $('prep-player-note').textContent = !p.revealed
      ? 'their 2 bans land here — hidden until you commit yours'
      : 'the enemy banned: ' + p.botBans.map(function (id) { return dict[id].card.name; }).join(', ');

    /* ---- enemy deck (right, ban phase only) ---- */
    if (p.phase === 'ban') {
      foeGrid.innerHTML = '';
      p.enemy12.forEach(function (e, i) {
        var el = boardCard(e, i, 'foe');
        var banned = p.youBans.indexOf(e.card.id) >= 0;
        el.classList.toggle('banpick', banned);
        el.addEventListener('click', function () {
          var i2 = p.youBans.indexOf(e.card.id);
          if (i2 >= 0) p.youBans.splice(i2, 1);
          else {
            if (p.youBans.length >= RULES().BANS) { flashNode('prep-enemy-note'); return; }
            p.youBans.push(e.card.id);
          }
          renderPrep();
        });
        foeGrid.appendChild(el);
      });
      $('prep-enemy-note').textContent = p.revealed
        ? 'struck out — the enemy fields 6 of its remaining 10'
        : 'tap 2 to ban (' + p.youBans.length + '/' + RULES().BANS + ')';
    }

    if (p.phase === 'pick') renderField();

    /* ---- confirms: dock under the board (ban) / inside the tray (pick) ---- */
    var cm = $('prep-confirm-main');
    cm.disabled = p.youBans.length !== RULES().BANS;
    cm.classList.toggle('ready', !cm.disabled);
    $('prep-confirm-main-txt').textContent = 'Confirm bans';
    var c = $('prep-confirm');
    c.disabled = (p.front.length + p.back.length) !== RULES().FIELD_SIZE;
    c.classList.toggle('ready', !c.disabled);
    $('prep-confirm-txt').textContent = 'To battle';
  }

  function flashNode(id) {
    var n = $(id);
    if (!n) return;
    n.classList.remove('flash');
    void n.offsetWidth;
    n.classList.add('flash');
  }

  /* Free-slot suggestion for the field tray: frontline roles go front. */
  function toggleSix(id) {
    var all = prep.front.concat(prep.back);
    var idx = all.indexOf(id);
    if (idx >= 0) {
      var fi = prep.front.indexOf(id);
      if (fi >= 0) prep.front.splice(fi, 1);
      else prep.back.splice(prep.back.indexOf(id), 1);
    } else {
      if (all.length >= RULES().FIELD_SIZE) { flashNode('prep-player-note'); return; }
      var role = byId()[id].card.role;
      var wantFront = role === 'Tank' || role === 'Bruiser';
      if (wantFront && prep.front.length < 3) prep.front.push(id);
      else if (prep.back.length < 3) prep.back.push(id);
      else if (prep.front.length < 3) prep.front.push(id);
      else return;
    }
    renderPrep();
  }

  function renderField() {
    var dict = byId();
    $('field-n').textContent = prep.front.length + prep.back.length;
    [['field-front', prep.front, 'F', 'front'], ['field-back', prep.back, 'B', 'back']]
      .forEach(function (pair) {
        var host = $(pair[0]);
        if (!host) return;
        host.innerHTML = '';
        var ids = pair[1];
        for (var s = 0; s < 3; s++) {
          var id = ids[s];
          var cell = document.createElement('button');
          cell.type = 'button';
          if (id) {
            var e = dict[id];
            cell.className = 'field-slot filled rarity-' + e.card.rarity;
            cell.style.setProperty('--fc-primary', e.faction.colors.primary);
            cell.innerHTML =
              '<span class="fs-order">' + pair[2] + (s + 1) + '</span>' +
              '<i class="fs-glyph ra ' + e.card.icon + '"></i>' +
              '<span class="fs-name">' + esc(e.card.name) + '</span>' +
              '<span class="fs-role"><i class="ra ' + roleIc(e.card.role) + '"></i>' +
                esc(e.card.role) + '</span>' +
              '<span class="fs-x" title="Swap rows"><i class="ri-arrow-up-down-line"></i></span>';
            (function (idCopy, row, entry) {
              cell.addEventListener('click', function () { swapRow(idCopy, row); });
              cell.addEventListener('mouseenter', function () { showPrepTip(entry, 'you'); });
              cell.addEventListener('mouseleave', hidePrepTip);
            })(id, pair[3], e);
          } else {
            cell.className = 'field-slot empty';
            cell.innerHTML = '<span class="fs-num">' + pair[2] + (s + 1) + '</span>';
            cell.disabled = true;
          }
          host.appendChild(cell);
        }
      });
  }

  function swapRow(id, from) {
    var src = from === 'front' ? prep.front : prep.back;
    var dst = from === 'front' ? prep.back : prep.front;
    if (dst.length >= 3) { flashNode('prep-sub'); return; }
    src.splice(src.indexOf(id), 1);
    dst.push(id);
    renderPrep();
  }

  /* Confirm: bans -> reveal + advance; six -> battle. */
  async function prepConfirm() {
    if (!prep) return;
    if (prep.phase === 'ban') {
      if (prep.youBans.length !== RULES().BANS) return;
      prep.revealed = true;
      renderPrep();
      $('prep-sub').textContent = 'Bans locked — both sides revealed';
      toast('Bans locked — both sides revealed', 'ri-eye-line');
      // stamped, seen, then their side folds away for the fielding
      await sleep(1150);
      if (!prep) return;
      prep.phase = 'pick';
      prepAnim = true;
      renderPrep();
      coachShow('prep-pick', 'ra-diamond', 'Phase 2: Field Your Six',
        'Pick 6 of your surviving heroes and mind the formation: the front row soaks the ' +
        'hits while the back row supports. Tap a slotted hero to swap its row.');
      return;
    }
    var dict = byId();
    var playerSix = prep.front.concat(prep.back).map(function (id) { return dict[id]; });
    if (playerSix.length !== RULES().FIELD_SIZE) return;
    var survive = prep.enemy12.filter(function (e) {
      return prep.youBans.indexOf(e.card.id) < 0;
    });
    var enemySix = chooseSix(survive);
    var cfg = prep;
    prep = null;
    window.EOL.ui.show('battle');
    BATTLE().start({ teams: { player: playerSix, enemy: enemySix } });
    lastConfig = cfg.mode === 'classic'
      ? { mode: 'classic', deckId: cfg.deckId, random: !cfg.deckId }
      : { mode: 'draft' };
  }

  /* =====================================================
     CLASSIC — deck picker modal
     ===================================================== */
  function modalShow(on) {
    var m = $('deck-modal');
    if (!m) return;
    m.classList.toggle('show', on);
    m.setAttribute('aria-hidden', String(!on));
  }

  function startClassicDeck(deckId) {
    var deck = deckId ? window.EOL.decks.get(deckId) : null;
    var player12 = deck
      ? window.EOL.decks.entriesOf(deck)
      : RULES().randomDeck(flatten(), Math.random);   // the shuffle row
    if (!player12) return;
    modalShow(false);
    startPrep({
      mode: 'classic',
      deckId: deck ? deck.id : null,
      player12: player12,
      enemy12: RULES().randomDeck(flatten(), Math.random)
    });
  }

  function openClassicModal() {
    var host = $('dm-list');
    host.innerHTML = '';

    /* Shuffle row first — instant classic for a new player, and a
       "get me in" shortcut even for deck owners. */
    var r = document.createElement('button');
    r.className = 'dm-row random';
    r.type = 'button';
    r.innerHTML =
      '<span class="dm-ico"><i class="ri-shuffle-line"></i></span>' +
      '<span class="dm-body"><span class="dm-name">Surprise me</span>' +
      '<span class="dm-meta">A random legal squad of 12 — just this game</span></span>' +
      '<i class="dm-go ri-arrow-right-line"></i>';
    r.addEventListener('click', function () { startClassicDeck(null); });
    host.appendChild(r);

    var decks = window.EOL.decks.list();
    if (!decks.length) {
      var none = document.createElement('p');
      none.className = 'dm-empty';
      none.innerHTML = 'No saved decks yet &mdash; forge one from <b>New deck</b> below.';
      host.appendChild(none);
    }
    decks.slice().sort(function (a, b) { return b.ts - a.ts; }).forEach(function (d) {
      var ok = window.EOL.decks.isComplete(d);
      var row = document.createElement('button');
      row.className = 'dm-row' + (ok ? '' : ' disabled');
      row.type = 'button';
      if (!ok) row.disabled = true;
      row.innerHTML =
        '<span class="dm-ico"><i class="ri-stack-line"></i></span>' +
        '<span class="dm-body"><span class="dm-name">' + esc(d.name) + '</span>' +
        '<span class="dm-meta">' + d.ids.length + '/12 heroes' +
          (ok ? '' : ' — needs 12 to battle (edit it)') + '</span></span>' +
        (ok ? '<i class="dm-go ri-arrow-right-line"></i>' : '');
      if (ok) row.addEventListener('click', function () { startClassicDeck(d.id); });
      host.appendChild(row);
    });
    modalShow(true);
  }

  /* =====================================================
     DRAFT — snake draft, packs of 3
     -------------------------------------------------------------
     The pack is dealt ONCE and stays on the table: picks mark the
     card in place (greyed + a colored claim stamp), piles update
     the instant each hero is chosen, and only a brand-new pack gets
     the entrance deal.
     ===================================================== */
  var draft = null;
  var BOT_OPEN_MS = 1150;     // the bot studies a pack it opened
  var BOT_ANSWER_MS = 1050;   // the bot weighs its answer to yours
  var SETTLE_MS = 850;        // beat to read the picks before the next pack

  function packStarter(i) { return i % 2 === 0 ? 'you' : 'foe'; }

  function startDraft() {
    var pool = RULES().draftPool(flatten(), Math.random);
    var shuffled = pool.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    var packs = [];
    for (var k = 0; k < shuffled.length; k += 3) packs.push(shuffled.slice(k, k + 3));
    draft = {
      packs: packs,
      packNo: 0,
      offered: packs[0].slice(),
      picks: { you: [], foe: [] },
      busy: false
    };
    renderPack();
    renderDraftHead();
    window.EOL.ui.show('draft');
    coachShow('draft', 'ra-clovers-card', 'The Snake Draft',
      'Packs of three, 12 packs. You open the odd packs, the enemy opens the even ones. ' +
      'One pick each per pack, the third card burns — both squads build to 12, then preparation begins.');
  }

  /* header text + order chips — cheap enough to refresh on every beat */
  function renderDraftHead() {
    var d = draft;
    if (!d) return;
    document.querySelector('.view.draft').classList.toggle('busy', !!d.busy);
    var total = d.packs.length;
    var starter = packStarter(d.packNo);
    $('draft-sub').textContent = 'Pack ' + (d.packNo + 1) + ' of ' + total +
      (d.busy ? ' — the enemy weighs its pick...'
              : starter === 'you' ? ' — your pick'
                                  : ' — your pick (the enemy opened this pack)');
    $('draft-order').innerHTML =
      '<span class="dorder-chip' + (starter === 'you' ? ' on' : '') + '">' +
        (starter === 'you' ? 'You open this pack' : 'Enemy opened this pack') + '</span>' +
      '<span class="dorder-chip">' + (d.packNo % 2 ? 'Snake order: the enemy picks first' : 'Snake order: you pick first') + '</span>';
  }

  /* deal a fresh pack: the only time pack cards are (re)built */
  function renderPack() {
    var d = draft;
    var packHost = $('draft-pack');
    packHost.innerHTML = '';
    d.offered.forEach(function (e, i) {
      e._taken = null;
      var wrap = document.createElement('div');
      wrap.className = 'dpack-card';
      wrap.style.animationDelay = (i * 90) + 'ms';
      var card = window.EOL.ui.buildCard(e.card, e.faction, i);
      var hint = card.querySelector('.hint-txt');
      if (hint) hint.textContent = 'draft this hero';
      wrap.appendChild(card);
      wrap.addEventListener('click', function () { youPick(e); });
      e._wrap = wrap;
      packHost.appendChild(wrap);
    });
    updateCaps();
  }

  /* re-check the max-4 law against your squad after every pick, in place */
  function updateCaps() {
    var d = draft;
    if (!d) return;
    d.offered.forEach(function (e) {
      if (e._taken || !e._wrap) return;
      var blocked = RULES().capBlocked(d.picks.you, e.card);
      e._wrap.classList.toggle('capped', blocked);
      e._wrap.title = blocked ? 'Role capped — your squad already runs 4 ' + e.card.role + 's' : '';
    });
  }

  /* a claimed card greys down, gains its owner's border and claim stamp */
  function markTaken(e, who) {
    e._taken = who;
    if (!e._wrap) return;
    e._wrap.classList.add('taken', who === 'you' ? 'taken-you' : 'taken-foe');
    e._wrap.classList.remove('capped');
    e._wrap.title = '';
    var stamp = document.createElement('span');
    stamp.className = 'dtake';
    stamp.textContent = who === 'you' ? 'Yours' : 'Enemy';
    e._wrap.appendChild(stamp);
  }

  /* the leftover third of a pack burns away before the next deal */
  function burnCard(e) {
    e._taken = 'burn';
    if (e._wrap) {
      e._wrap.classList.add('burnout');
      e._wrap.classList.remove('capped');
    }
  }

  /* Both squads fill in live — freshSide's newest pip is the only one
     that pops, so a repaint never replays the whole strip. */
  function paintPiles(freshSide) {
    var d = draft;
    [['dpile-you', 'dp-you-n', d.picks.you, 'you'], ['dpile-foe', 'dp-foe-n', d.picks.foe, 'foe']]
      .forEach(function (cfg) {
        var host = $(cfg[0]);
        host.innerHTML = '';
        cfg[2].forEach(function (e, idx) {
          var pip = document.createElement('span');
          pip.className = 'dc-pip rarity-' + e.card.rarity +
            (cfg[3] === freshSide && idx === cfg[2].length - 1 ? ' fresh' : '');
          pip.title = e.card.name;
          pip.innerHTML = '<i class="ra ' + e.card.icon + '"></i>';
          host.appendChild(pip);
        });
        var left = RULES().DECK_SIZE - cfg[2].length;
        for (var i = 0; i < left; i++) {
          var e2 = document.createElement('span');
          e2.className = 'dc-pip empty';
          host.appendChild(e2);
        }
        $(cfg[1]).textContent = cfg[2].length;
      });
  }

  /* Any untaken card your squad can still legally hold? The 4-cap is
     waived when the pack corners you, exactly like the bot's fallback. */
  function anyLegalForYou(d) {
    return d.offered.some(function (e) { return !e._taken && !RULES().capBlocked(d.picks.you, e.card); });
  }

  /* your click: mark yours now, pile updates instantly, the bot thinks */
  function youPick(e) {
    var d = draft;
    if (!d || d.busy || e._taken) return;
    if (RULES().capBlocked(d.picks.you, e.card)) {
      if (anyLegalForYou(d)) { flashNode('draft-sub'); return; }
      /* cornered: the pack holds only capped roles — the cap waives */
      toast('Role cap waived — no legal pick remained', 'ri-error-warning-line');
    }
    markTaken(e, 'you');
    d.picks.you.push(e);
    paintPiles('you');
    var remaining = d.offered.filter(function (x) { return !x._taken; });
    if (remaining.length === 1) {
      // you answered a foe-opened pack: the last card burns
      burnCard(remaining[0]);
      renderDraftHead();
      setTimeout(advancePack, SETTLE_MS);
      return;
    }
    // you opened: the bot answers from the two you left
    d.busy = true;
    updateCaps();
    renderDraftHead();
    setTimeout(function () {
      if (!draft) return;
      var foePick = draftPick(draft.picks.foe, remaining);
      markTaken(foePick, 'foe');
      draft.picks.foe.push(foePick);
      paintPiles('foe');
      draft.offered.filter(function (x) { return !x._taken; }).forEach(burnCard);
      setTimeout(advancePack, SETTLE_MS);
    }, BOT_ANSWER_MS);
  }

  /* Foe-opened packs: the bot takes one of three, you answer from two. */
  function foeOpens() {
    setTimeout(function () {
      if (!draft) return;
      var foePick = draftPick(draft.picks.foe, draft.offered);
      markTaken(foePick, 'foe');
      draft.picks.foe.push(foePick);
      paintPiles('foe');
      draft.busy = false;
      updateCaps();
      renderDraftHead();
    }, BOT_OPEN_MS);
  }

  function advancePack() {
    var d = draft;
    if (!d) return;
    d.packNo += 1;
    if (d.packNo >= d.packs.length) {
      // two legal twelves — settle the piles, then Preparation takes over
      var you12 = d.picks.you.slice();
      var foe12 = d.picks.foe.slice();
      paintPiles(null);
      draft = null;
      startPrep({ mode: 'draft', player12: you12, enemy12: foe12 });
      return;
    }
    d.offered = d.packs[d.packNo].slice();
    d.busy = packStarter(d.packNo) === 'foe';
    renderPack();
    renderDraftHead();
    if (d.busy) foeOpens();
  }

  /* =====================================================
     rematch routing
     ===================================================== */
  var lastConfig = null;

  function rematch() {
    var ov = $('result');
    if (ov) ov.className = 'result';
    if (!lastConfig) { window.EOL.ui.show('battle'); BATTLE().start(); return; }
    if (lastConfig.mode === 'classic') {
      var d = lastConfig.deckId ? window.EOL.decks.get(lastConfig.deckId) : null;
      if (lastConfig.random || !d || !window.EOL.decks.isComplete(d)) {
        // random rows re-shuffle; a deleted/unfinished deck falls back to the picker
        if (lastConfig.random) startClassicDeck(null);
        else openClassicModal();
        return;
      }
      startClassicDeck(d.id);
      return;
    }
    startDraft();
  }

  /* =====================================================
     wiring
     ===================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    var mc = $('mode-classic'), md = $('mode-draft'), mcmp = $('mode-campaign');
    if (mc) mc.addEventListener('click', openClassicModal);
    if (md) md.addEventListener('click', startDraft);
    // mode-campaign is disabled-markup only: a visible placeholder that
    // does nothing until the campaign arrives
    if (mcmp) mcmp.addEventListener('click', function (e) { e.preventDefault(); });

    var bp = $('btn-play-back');
    if (bp) bp.addEventListener('click', function () { modalShow(false); window.EOL.ui.show('home'); });
    var bprep = $('btn-prep-back');
    if (bprep) bprep.addEventListener('click', function () { prep = null; window.EOL.ui.show('play'); });
    var bd = $('btn-draft-back');
    if (bd) bd.addEventListener('click', function () { draft = null; window.EOL.ui.show('play'); });

    var dc = $('dm-cancel');
    if (dc) dc.addEventListener('click', function () { modalShow(false); });
    var dn = $('dm-new');
    if (dn) dn.addEventListener('click', function () {
      modalShow(false);
      window.EOL.decks.openEditor();
    });
    var dm = $('deck-modal');
    if (dm) dm.addEventListener('click', function (e) { if (e.target === dm) modalShow(false); });

    var pc = $('prep-confirm');
    if (pc) pc.addEventListener('click', prepConfirm);
    var pcm = $('prep-confirm-main');
    if (pcm) pcm.addEventListener('click', prepConfirm);

    var ck = $('coach-ok');
    if (ck) ck.addEventListener('click', coachHide);
    var cov = $('coach');
    if (cov) cov.addEventListener('click', function (e) { if (e.target === cov) coachHide(); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (coachOpen()) { e.stopPropagation(); coachHide(); return; }
      if ($('deck-modal').classList.contains('show')) {
        e.stopPropagation();
        modalShow(false);
      }
    }, true);
  });

  window.EOL.play = {
    rematch: rematch,
    openClassicModal: openClassicModal,
    startDraft: startDraft,
    startPrep: startPrep,
    /* test hooks */
    _chooseBans: chooseBans,
    _chooseSix: chooseSix,
    _draftPick: draftPick,
    _prepState: function () { return prep; },
    _draftState: function () { return draft; },
    _lastConfig: function () { return lastConfig; },
    _packStarter: packStarter
  };
})();
