/* =============================================================
   Echoes of Legend - Campaign Chapter 1 System
   -------------------------------------------------------------
   The glue between the content layer (data/campaign-ch1.js) and
   the game: stage progression + persistence, the dialogue BAR
   (bottom-anchored - it must never cover the board or the map),
   stage launching for all three formats (classic / Unabridged set
   / draft), rival behaviour hooks, IN-BATTLE rival barks, grants,
   and the result-screen framing.

   Laws honoured here:
     R1  every rival twelve is authored data, nothing is rolled
     R3  no leaving mid-set; progress commits on stage completion
     R5  the boss is pinned + unbannable by hardcode (js/play.js)
     §6  mid-fight lore is NON-BLOCKING (later barks self-expire;
         Gates I-II are event-driven and reader-paced, with only a
         small optional dismiss control accepting input)
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};
  var STORY = window.EOL.campaignCh1 || {};
  var PROGRESS_KEY = 'eol.campaign.ch1.progress';

  function $(id) {
    return document.getElementById(id);
  }
  function setText(node, text) {
    if (node) node.textContent = text || '';
  }
  function two(n) {
    return n < 10 ? '0' + n : String(n);
  }
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  function stageById(id) {
    var list = STORY.stages || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function stageLabel(stage) {
    return 'Stage ' + stage.id + ' - ' + stage.format;
  }
  function fieldById(id) {
    return (id && window.EOL.battlefieldById && window.EOL.battlefieldById(id)) || null;
  }
  function rivalOf(stage) {
    return { name: stage.rival, img: stage.portrait || null };
  }

  /* ---------------------------------------------------------
     Roster resolution - campaign decks are card-id lists; the
     boss card lives OUTSIDE EOL.factions (never draftable, never
     in a balance pool) and resolves through the story data.
     --------------------------------------------------------- */
  var CARD_DICT = null;
  function cardDict() {
    if (CARD_DICT) return CARD_DICT;
    CARD_DICT = {};
    (window.EOL.factions || []).forEach(function (f) {
      f.cards.forEach(function (c) {
        CARD_DICT[c.id] = { card: c, faction: f };
      });
    });
    if (STORY.bossCard && STORY.bossFaction) {
      CARD_DICT[STORY.bossCard.id] = { card: STORY.bossCard, faction: STORY.bossFaction };
    }
    return CARD_DICT;
  }
  function entriesFor(ids) {
    var dict = cardDict();
    return (ids || [])
      .map(function (id) {
        return dict[id];
      })
      .filter(Boolean);
  }
  function starterEntries() {
    var starter = window.EOL.decks && window.EOL.decks.get('starter-grimmwood');
    if (starter) return window.EOL.decks.entriesOf(starter);
    var fac = (window.EOL.factions || []).filter(function (f) {
      return f.id === 'grimmwood';
    })[0];
    if (!fac) return [];
    return fac.cards.map(function (c) {
      return { card: c, faction: fac };
    });
  }

  /* ---------------------------------------------------------
     Curated draft pools (stages 6-8).
     -------------------------------------------------------------
     The 36 cards of every draft gate are FIXED, authored data
     (owner ruling 2026-08-09): `stage.pool.cards` in
     data/campaign-ch1.js - 6 per role, the featured faction's full
     six guaranteed, no Huaxia (Chapter 2) and no Duat (the boss
     reveal). Only the deal order varies between runs, like a
     shuffled deck. The procedural builder below survives purely as
     a fallback for a stage that ships without a frozen list.
     --------------------------------------------------------- */
  function limitDraftLegendaries(entries, featuredId) {
    var max = (window.EOL.deckRules && window.EOL.deckRules.DRAFT_MAX_LEGENDARIES) || 4;
    var crowns = entries.filter(function (e) {
      return e.card.rarity === 'legendary';
    });
    if (crowns.length <= max) return entries;

    /* Keep the featured faction's crown first so an authored promise
       that the whole faction appears remains true, then keep the first
       authored crowns up to the table cap. Replace extras with unused
       non-Legendaries of the same role to preserve all 36 seats. */
    crowns.sort(function (a, b) {
      return (b.faction.id === featuredId ? 1 : 0) - (a.faction.id === featuredId ? 1 : 0);
    });
    var keep = {};
    crowns.slice(0, max).forEach(function (e) {
      keep[e.card.id] = true;
    });
    var used = {};
    entries.forEach(function (e) {
      used[e.card.id] = true;
    });
    var replacements = [];
    (window.EOL.factions || []).forEach(function (f) {
      if (f.id === 'huaxia' || f.id === 'duat') return;
      f.cards.forEach(function (c) {
        if (c.rarity !== 'legendary' && !used[c.id]) replacements.push({ card: c, faction: f });
      });
    });
    return entries.map(function (e) {
      if (e.card.rarity !== 'legendary' || keep[e.card.id]) return e;
      for (var i = 0; i < replacements.length; i++) {
        if (replacements[i].card.role !== e.card.role) continue;
        return replacements.splice(i, 1)[0];
      }
      return e; // malformed future roster: validation will flag it
    });
  }

  function buildPool(spec) {
    var featuredId = spec && spec.featured ? spec.featured : spec;
    if (spec && spec.cards && spec.cards.length) {
      var frozen = entriesFor(spec.cards);
      if (frozen.length === spec.cards.length) return limitDraftLegendaries(frozen, featuredId);
    }
    var byRole = {};
    (window.EOL.factions || []).forEach(function (f) {
      if (f.id === 'huaxia' || f.id === 'duat') return;
      f.cards.forEach(function (c) {
        (byRole[c.role] = byRole[c.role] || []).push({ card: c, faction: f });
      });
    });
    var pool = [];
    Object.keys(byRole).forEach(function (role) {
      var featured = byRole[role].filter(function (e) {
        return e.faction.id === featuredId;
      });
      var rest = byRole[role].filter(function (e) {
        return e.faction.id !== featuredId;
      });
      for (var i = rest.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = rest[i];
        rest[i] = rest[j];
        rest[j] = t;
      }
      pool = pool.concat(featured.concat(rest).slice(0, 6));
    });
    return limitDraftLegendaries(pool, featuredId);
  }

  /* ---------------------------------------------------------
     Progress + the collection/currency store (§9.14).
     eol.campaign.ch1.progress:
       cleared   [stageIds]       unlocked  [stageIds]
       clears    {stageId: n}     per-stage clear counts (replay taper)
       grants    [cardIds]        awarded Legendaries and resolved exam
                                  choices (idempotent)
       coins     n                tier-2 currency, inert until the
                                  economy pass lands
       choices   {stageId:[ids]}  resolved exam choices (R9)
       pendingChoice stageId|null an unclaimed exam choice
     --------------------------------------------------------- */
  function getProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.unlocked)) {
          parsed.cleared = parsed.cleared || [];
          parsed.clears = parsed.clears || {};
          parsed.grants = parsed.grants || [];
          parsed.coins = parsed.coins || 0;
          parsed.choices = parsed.choices || {};
          parsed.tellsBroken = parsed.tellsBroken || [];
          parsed.fought = parsed.fought || [];
          return parsed;
        }
      }
    } catch (e) {
      /* private mode fallback */
    }
    return {
      cleared: [],
      unlocked: [1],
      clears: {},
      grants: [],
      coins: 0,
      choices: {},
      pendingChoice: null,
      /* an unopened Legend Pack ceremony (grant already landed) */
      pendingLegend: null,
      /* stages whose ban-claim tell the player has FALSIFIED - the
         ledger keeps the correction forever (playtester ruling:
         that is the match you remember) */
      tellsBroken: [],
      /* stages whose rival the player has faced at least once, win
         or lose - the ledger opens their twelve after first blood */
      fought: [],
    };
  }
  function saveProgress(prog) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(prog));
    } catch (e) {
      /* private mode: the session still works, it just forgets */
    }
  }

  /* play.js reports the moment a reveal falsifies a role-claim tell. */
  function onTellBreak(stageId) {
    if (!stageId) return;
    var prog = getProgress();
    if (prog.tellsBroken.indexOf(stageId) < 0) {
      prog.tellsBroken.push(stageId);
      saveProgress(prog);
    }
  }

  /* first blood: the rival has been faced at least once (win or lose) */
  function progFought(stageId) {
    var prog = getProgress();
    if (prog.fought.indexOf(stageId) >= 0) return false;
    prog.fought.push(stageId);
    saveProgress(prog);
    return true;
  }

  function recordClear(stage, prog) {
    prog = prog || getProgress();
    var first = prog.cleared.indexOf(stage.id) < 0;
    if (first) prog.cleared.push(stage.id);
    if (stage.id < 10 && prog.unlocked.indexOf(stage.id + 1) < 0) prog.unlocked.push(stage.id + 1);
    prog.clears[stage.id] = (prog.clears[stage.id] || 0) + 1;
    var g = stage.grants || {};
    if (first) {
      prog.coins += g.coins || 0;
      if (g.choice) prog.pendingChoice = stage.id;
      /* THE LEGEND PACK (owner ruling 2026-08-10): a gate that ends a
         faction's road hands over its ONE legendary - granted HERE,
         at clear time (refresh-proof), with the one-card ceremony
         queued for the chapter map. Legendaries reach a collection
         no other way: the shop's tables stop at Epic. */
      if (g.legendPack) {
        if (prog.grants.indexOf(g.legendPack) < 0) prog.grants.push(g.legendPack);
        prog.pendingLegend = stage.id;
      }
      /* THE ECONOMY: coins enter the wallet and the gate Legendary
         enters the collection. Exam choices are granted when selected.
         prog keeps its own totals as the road's record. */
      if (window.EOL.econ) {
        window.EOL.econ.grant(g.legendPack ? [g.legendPack] : []);
        window.EOL.econ.addCoins(g.coins || 0);
      }
    } else {
      /* Replays pay a FLAT 25 (owner ruling 2026-08-10, replacing
         the old 25%-of-gate cut): every gate is worth revisiting,
         none is worth farming. */
      var replayPay = 25;
      prog.coins += replayPay;
      if (window.EOL.econ) window.EOL.econ.addCoins(replayPay);
    }
    saveProgress(prog);
    updateStageCards();
    return first;
  }

  /* ---------------------------------------------------------
     THE DIALOGUE BAR
     -------------------------------------------------------------
     Bottom-anchored, visual-novel style: the scene stays visible,
     the words live in a strip along the bottom edge. Clicking
     anywhere (bar or scrim) advances; X or Esc skips the scene.
     One widget serves pre-fight scenes and victory epilogues.
     --------------------------------------------------------- */
  var dlg = null; // { stage, lines, index, kind:'pre'|'epilogue', onDone }

  function portraitFor(speaker, stage) {
    var list = STORY.stages || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].rival === speaker) return list[i].portrait || null;
    }
    if (stage && speaker === stage.rival) return stage.portrait || null;
    return null; // the Wayfarer has no face yet - that is the story
  }

  function renderDialogue() {
    if (!dlg) return;
    var line = dlg.lines[dlg.index];
    if (!line) return;
    setText($('chapter-dialogue-speaker'), line.speaker);
    var textEl = $('chapter-dialogue-text');
    if (textEl) {
      textEl.textContent = line.text || '';
      /* restart the per-line fade so each beat visibly lands */
      textEl.classList.remove('line-in');
      void textEl.offsetWidth;
      textEl.classList.add('line-in');
    }
    var kicker = $('chapter-dialogue-kicker');
    if (kicker) {
      /* icon separators, never raw glyph punctuation - encoding-proof */
      kicker.innerHTML =
        '<i class="ri-book-open-line"></i> Chapter 1 <i class="ri-sword-line kick-sep"></i> Gate ' +
        (ROMAN[dlg.stage ? dlg.stage.id : 1] || '') +
        (dlg.kind === 'epilogue'
          ? ' <i class="ri-checkbox-circle-line kick-sep"></i> Cleared'
          : '');
    }
    var img = $('chapter-dialogue-portrait');
    var glyph = $('chapter-dialogue-glyph');
    var src = portraitFor(line.speaker, dlg.stage);
    if (img && glyph) {
      if (src) {
        img.src = src;
        img.hidden = false;
        glyph.hidden = true;
      } else {
        img.hidden = true;
        glyph.hidden = false;
      }
    }
    setText($('chapter-dialogue-step'), two(dlg.index + 1) + ' / ' + two(dlg.lines.length));
    if (window.EOL.audio) window.EOL.audio.campaign('dialogue');
    /* Skip tutorial is offered ONLY on the intro scene - gate scenes
       and epilogues are content, and content is walked, not skipped */
    var skipT = $('chapter-dialogue-skiptut');
    if (skipT) skipT.hidden = dlg.kind !== 'intro';
    var next = $('chapter-dialogue-next');
    if (next) {
      if (line.battle) {
        next.innerHTML =
          '<i class="ri-sword-line"></i><span>Fight ' +
          (dlg.stage ? dlg.stage.rival : '') +
          '</span>';
      } else if (dlg.index >= dlg.lines.length - 1) {
        next.innerHTML =
          '<span>' +
          (dlg.kind === 'epilogue' ? 'Walk on' : dlg.kind === 'intro' ? 'To the Road' : 'Close') +
          '</span><i class="ri-check-line"></i>';
      } else {
        next.innerHTML = '<span>Continue</span><i class="ri-arrow-right-line"></i>';
      }
    }
  }

  function openDialogue(stage, lines, kind, onDone) {
    if (!lines || !lines.length) {
      if (onDone) onDone();
      return;
    }
    var modal = $('chapter-dialogue');
    if (!modal) {
      if (onDone) onDone();
      return;
    }
    dlg = { stage: stage, lines: lines, index: 0, kind: kind || 'pre', onDone: onDone || null };
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.dataset.campaignDialogue = '1';
    renderDialogue();
    window.setTimeout(function () {
      var next = $('chapter-dialogue-next');
      if (next) next.focus();
    }, 0);
  }

  function closeDialogue() {
    var modal = $('chapter-dialogue');
    if (!modal || !dlg) return;
    var done = dlg.onDone;
    var kind = dlg.kind;
    var stage = dlg.stage;
    dlg = null;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (window.EOL.audio) window.EOL.audio.ui('back');
    document.body.dataset.campaignDialogue = '0';
    if (kind !== 'pre') {
      /* Epilogues and the intro tutorial are FLOWS, not scenes: closing
         them by ANY route (X, scrim-skip, Esc) must continue to their
         destination - the reward path, or the Road itself - never
         strand the player where the overlay happened to be. */
      if (done) done();
      return;
    }
    var opener = stage && document.querySelector('[data-campaign-stage="' + stage.id + '"]');
    if (opener && opener.focus) opener.focus();
  }

  function advanceDialogue() {
    if (!dlg) return;
    var line = dlg.lines[dlg.index];
    if (dlg.index < dlg.lines.length - 1) {
      dlg.index++;
      renderDialogue();
      return;
    }
    var stage = dlg.stage;
    var launch = !!(line && line.battle && dlg.kind === 'pre');
    closeDialogue();
    if (launch && stage) launchStage(stage);
  }

  function openStageDialogue(stageId) {
    var stage = stageById(stageId || 1);
    if (!stage) return;
    /* any gate answering the door means the wayfinder's work is done */
    stopNavGuide();
    var lines = (STORY.dialogues || {})[stage.id] || [];
    openDialogue(stage, lines, 'pre', null);
  }

  /* ---------------------------------------------------------
     THE FIRST-BOOT TUTORIAL
     -------------------------------------------------------------
     The Recruiter interrupts the main menu exactly once (a fresh
     save, nothing cleared) and whenever the Tutorial corner button
     asks. It is a FLOW, not a scene: however it ends - read through,
     skipped with X, Escaped - it hands over to the WAYFINDER below,
     which points the player down the real path to Gate I (Play,
     Campaign, Chapter 1, the gate plate) and lets them do every
     click themselves. The gate stays refusable; the road to it is
     merely lit, never forced.
     --------------------------------------------------------- */
  var INTRO_KEY = 'eol.tutorial.intro.v1';
  function introSeen() {
    try {
      return localStorage.getItem(INTRO_KEY) === '1';
    } catch (e) {
      return true; // private mode: never nag a session we cannot remember
    }
  }
  function markIntroSeen() {
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch (e) {
      /* private mode */
    }
  }

  function runIntroTutorial() {
    var stage = stageById(1);
    var lines = STORY.intro || [];
    if (!stage || !lines.length) return;
    markIntroSeen();
    openDialogue(stage, lines, 'intro', startNavGuide);
  }

  function maybeRunFirstBoot() {
    if (introSeen()) {
      /* a refresh mid-walk: the pointer survives the reload */
      if (guidePending() && !getProgress().cleared.length && !dlg) startNavGuide();
      return;
    }
    var prog = getProgress();
    if (prog.cleared.length) {
      /* an existing road-walker predates the intro - never interrupt */
      markIntroSeen();
      return;
    }
    if (document.body.dataset.view !== 'home') return;
    if (dlg) return; // something else owns the bar
    runIntroTutorial();
  }

  /* ---------------------------------------------------------
     THE WAYFINDER
     -------------------------------------------------------------
     The Recruiter does not teleport anyone. When the intro closes he
     starts pointing: a pointer-transparent bubble beside the NEXT
     button on the road (home's Play, the Campaign mode card, the
     Chapter 1 plate, the Gate I node) plus a golden pulse on the
     button itself. The player performs every click - but ONLY that
     click: while the guide points, a capture-phase trap (below)
     swallows clicks on every other button and the bubble shakes its
     head, so the walk cannot wander off the rails. The guide ends
     the moment any gate dialogue opens - the road has been found -
     and a pending flag in localStorage lets the pointer survive a
     mid-walk refresh.
     --------------------------------------------------------- */
  var GUIDE_KEY = 'eol.tutorial.guide.v1';
  var navGuide = null;

  function guidePending() {
    try {
      return localStorage.getItem(GUIDE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  function setGuidePending(on) {
    try {
      if (on) localStorage.setItem(GUIDE_KEY, '1');
      else localStorage.removeItem(GUIDE_KEY);
    } catch (e) {
      /* private mode */
    }
  }

  var GUIDE_FALLBACK = {
    home: 'Press the Play button - the road starts there.',
    solo: 'Switch to the Singleplayer tab - the Road is walked alone.',
    play: 'Take the Campaign card - that is the Road of Echoes.',
    campaign: 'Open Chapter 1: The Road of Echoes.',
    chapter: 'Click Gate I and we will talk terms.',
  };
  function guideText(key) {
    return (STORY.guide || {})[key] || GUIDE_FALLBACK[key] || '';
  }

  /* Which button does the current screen owe the player? */
  function guideTargetFor(view) {
    if (view === 'home') {
      return { el: document.getElementById('btn-play'), key: 'home' };
    }
    if (view === 'play') {
      var soloGrid = document.getElementById('mode-grid-solo');
      if (soloGrid && soloGrid.hidden) {
        /* they flipped to Multiplayer - point back at the solo tab */
        return { el: document.querySelector('.play-tab[data-arena="solo"]'), key: 'solo' };
      }
      return { el: document.getElementById('mode-campaign'), key: 'play' };
    }
    if (view === 'campaign') {
      return { el: document.getElementById('chapter-1'), key: 'campaign' };
    }
    if (view === 'chapter') {
      return { el: document.querySelector('[data-campaign-stage="1"]'), key: 'chapter' };
    }
    return null; // Shop, Collection, Rulebook... hide, keep watching
  }

  function positionGuide(box, el) {
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!r || (!r.width && !r.height)) {
      /* not laid out (headless tests, mid-transition): park bottom-center */
      box.style.top = 'auto';
      box.style.bottom = '84px';
      box.style.left = '50%';
      box.style.transform = 'translateX(-50%)';
      box.classList.remove('point-up', 'point-down');
      box.classList.add('point-none');
      return;
    }
    /* THE SCALE LAW (js/app.js paintViewport): rects report ZOOMED px,
       style writes land in LAYOUT px. Every rect-derived number must
       divide by the scale factor - this function skipped that, so the
       bubble drifted off its button the moment the UI scale left 100%
       (outside report 2026-08-10: 'tutorial elements are shifted
       around weirdly when you change your UI scale'). innerWidth is
       device px (root zoom does not change it), so it converts too;
       offsetWidth/Height are already layout px and pass through. */
    var z = window.EOL.scale && window.EOL.scale.factor ? window.EOL.scale.factor() : 1;
    var rTop = r.top / z;
    var rBottom = r.bottom / z;
    var rLeft = r.left / z;
    var rWidth = r.width / z;
    box.style.bottom = 'auto';
    box.style.transform = 'none';
    var vw = (window.innerWidth || 1280) / z;
    var vh = (window.innerHeight || 720) / z;
    var bw = box.offsetWidth || 380;
    var bh = box.offsetHeight || 100;
    var below = rBottom + 16 + bh <= vh - 10;
    var top = below ? rBottom + 14 : rTop - 14 - bh;
    /* a target scrolled half out of view must not drag the bubble
       offscreen with it */
    top = Math.min(Math.max(10, top), Math.max(10, vh - bh - 10));
    var left = Math.min(Math.max(12, rLeft + rWidth / 2 - bw / 2), Math.max(12, vw - bw - 12));
    box.style.top = Math.round(top) + 'px';
    box.style.left = Math.round(left) + 'px';
    box.classList.toggle('point-up', below);
    box.classList.toggle('point-down', !below);
    box.classList.remove('point-none');
    /* keep the tick aligned with the button it points at */
    var ax = Math.round(rLeft + rWidth / 2 - left);
    box.style.setProperty('--guide-arrow-x', Math.min(Math.max(20, ax), bw - 20) + 'px');
  }

  function setGuide(tgt) {
    var box = $('nav-guide');
    if (!box || !navGuide) return;
    var el = tgt && tgt.el;
    if (!el) {
      if (navGuide.lastEl) {
        navGuide.lastEl.classList.remove('guide-mark');
        navGuide.lastEl = null;
      }
      navGuide.lastKey = null;
      box.classList.remove('show');
      box.hidden = true;
      return;
    }
    if (navGuide.lastEl !== el) {
      if (navGuide.lastEl) navGuide.lastEl.classList.remove('guide-mark');
      /* A carousel slide can be valid but offscreen. Bring the Campaign
         card into the centred slot before measuring the wayfinder bubble. */
      if (window.EOL.play && window.EOL.play.showModeCard) {
        window.EOL.play.showModeCard(el, true, false);
      }
      el.classList.add('guide-mark');
      navGuide.lastEl = el;
    }
    if (navGuide.lastKey !== tgt.key) {
      navGuide.lastKey = tgt.key;
      setText($('nav-guide-text'), guideText(tgt.key));
      box.hidden = false;
      box.classList.remove('show');
      void box.offsetWidth; /* restart the fade so each step visibly lands */
      box.classList.add('show');
    } else if (box.hidden) {
      box.hidden = false;
      box.classList.add('show');
    }
    positionGuide(box, el);
  }

  function guideTick() {
    if (!navGuide) return;
    var view = document.body.dataset.view;
    if (view === 'prep' || view === 'battle' || view === 'draft') {
      /* they are already in a war - the road has clearly been found */
      stopNavGuide();
      return;
    }
    if (dlg) {
      /* a dialogue owns the screen (intro replay, a gate scene) */
      setGuide(null);
      return;
    }
    setGuide(guideTargetFor(view));
  }

  function startNavGuide() {
    if (navGuide) return;
    setGuidePending(true);
    navGuide = {
      timer: window.setInterval(guideTick, 280),
      lastEl: null,
      lastKey: null,
    };
    guideTick();
  }

  function stopNavGuide() {
    setGuidePending(false);
    if (!navGuide) return;
    window.clearInterval(navGuide.timer);
    if (navGuide.lastEl) navGuide.lastEl.classList.remove('guide-mark');
    navGuide = null;
    var box = $('nav-guide');
    if (box) {
      box.classList.remove('show', 'deny');
      box.hidden = true;
    }
  }

  /* The way out: a tutorial must be refusable in ONE click. Skipping
     closes the intro scene and retires the wayfinder - and that is
     ALL it does. No forced navigation: the player stays exactly where
     they stand and the menus simply belong to them again (owner
     ruling 2026-08-09). Gate I itself is CONTENT, not tutorial: from
     the moment a gate is clicked, nothing more can be skipped by
     this route. */
  function skipTutorial() {
    if (dlg && dlg.kind === 'intro') {
      dlg.onDone = null; // do NOT hand over to the wayfinder
      closeDialogue();
    }
    stopNavGuide(); // also clears the pending flag
  }

  /* While the wayfinder points, the OTHER doors are locked: a
     capture-phase trap swallows any click outside the marked button
     (the tutorial is on rails, exactly like the scripted gate it leads
     to). The bubble shakes its head at refused clicks. The trap only
     bites while a target is actually marked - on screens the guide
     does not know (reached before the lock existed, e.g. a resumed
     save) every button still works so nobody can be walled in. */
  function guideClickTrap(ev) {
    if (!navGuide || !navGuide.lastEl) return;
    if (navGuide.lastEl.contains(ev.target)) return; // the one true click
    var skip = document.getElementById('nav-guide-skip');
    if (skip && skip.contains(ev.target)) return; // the way out is always open
    var bar = document.getElementById('chapter-dialogue');
    if (bar && !bar.hidden && bar.contains(ev.target)) return; // a scene owns the screen
    ev.preventDefault();
    ev.stopPropagation();
    var box = $('nav-guide');
    if (box && !box.hidden) {
      box.classList.remove('deny');
      void box.offsetWidth;
      box.classList.add('deny');
    }
  }

  /* ---------------------------------------------------------
     STAGE LAUNCH - one recipe per format.
     --------------------------------------------------------- */
  var activeCampaignStage = null;

  function hideDeckModal() {
    var modal = document.getElementById('deck-modal');
    if (modal) {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function launchStage(stage) {
    stopNavGuide();
    activeCampaignStage = stage.id;
    if (stage.mode === 'draft') {
      launchDraft(stage);
      return;
    }
    if (window.EOL.audio) {
      window.EOL.audio.duck(0.34, 0.9);
      window.EOL.audio.campaign('gate');
    }
    if (!window.EOL.play || !window.EOL.play.startPrep) return;
    /* THE SCRIPTED GATE (stage 1): no deck picker - the ledger brings
       the starter twelve, the script marks the bans and the six, and
       the tutor narrates every phase. */
    if (stage.script) {
      var scripted12 = starterEntries();
      if (!scripted12 || scripted12.length !== 12) return;
      window.EOL.play.startPrep({
        mode: 'classic',
        deckId: null,
        player12: scripted12,
        enemy12: entriesFor(stage.enemy12),
        campaignStage: stage.id,
        war: 'single',
        botSix: stage.botSix || null,
        botBanProfile: stage.banProfile || null,
        aiProfile: stage.aiProfile || null,
        rival: rivalOf(stage),
        script: stage.script,
        field: fieldById(stage.field),
        oddFirst: 'player',
      });
      startPrepTutor(stage);
      return;
    }
    if (!window.EOL.play.openClassicModal) return;
    window.EOL.play.openClassicModal(
      function (deckId) {
        var deck = deckId && window.EOL.decks ? window.EOL.decks.get(deckId) : null;
        var player12 = deck ? window.EOL.decks.entriesOf(deck) : starterEntries();
        if (!player12 || player12.length !== 12) player12 = starterEntries();
        var enemy12 = entriesFor(stage.enemy12);
        hideDeckModal();
        var cfg = {
          mode: 'classic',
          deckId: deckId,
          player12: player12,
          enemy12: enemy12,
          campaignStage: stage.id,
          war: stage.mode === 'set' ? 'set' : 'single',
          botSix: stage.botSix || null,
          botBanProfile: stage.banProfile || null,
          aiProfile: stage.aiProfile || null,
          /* the Recruiter's ledger: HOW this rival bans, told BEFORE
             the player commits their own (playtest note 2026-08-09:
             the least-informed call must not stay the blindest one) */
          banTell: stage.banTell || null,
          banTellBroken: stage.banTellBroken || null,
          advisor: stage.advisor || null,
          pinnedEnemy: stage.pinned || null,
          unbannable: stage.unbannable || null,
          rival: rivalOf(stage),
          /* stage 1 keeps the gentle opener; later gates use the
             engine's normal alternation */
          oddFirst: stage.id === 1 ? 'player' : null,
        };
        if (stage.mode === 'set') {
          cfg.fightCard = (stage.fightCard || []).map(fieldById).filter(Boolean);
        } else {
          cfg.field = fieldById(stage.field);
        }
        window.EOL.play.startPrep(cfg);
        /* THE ADVISED GATE: the Recruiter walks one more gate at the
           player's shoulder - counsel in silver, hands in pockets */
        if (stage.advisor) startPrepTutor(stage);
      },
      {
        isCampaign: true,
        hideRandom: true,
        title: 'Choose your deck to face ' + stage.rival,
        sub:
          stage.mode === 'set'
            ? 'Unabridged: best of three on ' +
              stage.terrain +
              '. Substitutions are law - no retreat once it begins.'
            : 'Select your squad of 12 for the battle on ' + stage.terrain + '.',
      }
    );
  }

  function launchDraft(stage) {
    if (!window.EOL.play || !window.EOL.play.startDraft) return;
    window.EOL.play.startDraft({
      pool: buildPool(stage.pool),
      persona: stage.persona || null,
      personaJitter: stage.personaJitter || 0,
      campaign: {
        stage: stage.id,
        field: fieldById(stage.field),
        banProfile: stage.banProfile || null,
        banTell: stage.banTell || null,
        aiProfile: stage.aiProfile || null,
        rival: rivalOf(stage),
      },
    });
  }

  /* ---------------------------------------------------------
     IN-BATTLE RIVAL DIALOGUE (barks)
     -------------------------------------------------------------
     A speech card front and centre under the HUD. It rides the
     engine's observational event hook - never gameplay logic. Later
     rivals self-expire and queue lightweight flavour. Gates I-II are
     different by design: dialogue is attached to actual moves/events,
     and a newer context REPLACES the old one. Gate II remains reader-
     paced; Gate I also clears after a generous reading window, so the
     Recruiter's words can never trail behind the battle.
     Nothing blocks the board or the turn system.
     --------------------------------------------------------- */
  var BARK_GAP = 5200;
  var barkQ = [];
  var barkActive = false;
  var barkTimer = null;
  var barkWaits = 0;
  var barkBusyWaits = 0;

  function reactiveDialogue(stage) {
    return !!(stage && stage.reactiveDialogue);
  }

  function barkMs(text) {
    /* Reading time. Playtest note (2026-08-10, watched live): a player
       who is reading AND playing needs far more than the old ~300wpm
       ceiling - lines kept dying mid-sentence. ~45ms/char with a
       taller floor and ceiling; under queue pressure the line trims
       toward pace instead of lingering at the maximum. */
    var ms = Math.max(3800, Math.min(12000, 2600 + text.length * 45));
    if (barkQ.length) ms = Math.min(ms, 8500);
    return ms;
  }

  function hideBark() {
    barkQ.length = 0;
    barkActive = false;
    barkWaits = 0;
    barkBusyWaits = 0;
    window.clearTimeout(barkTimer);
    var el = $('rival-bark');
    if (el) {
      el.classList.remove('show', 'reactive');
      var dismiss = $('rival-bark-dismiss');
      if (dismiss) dismiss.hidden = true;
    }
  }

  /* A bark must land AFTER what it talks about is visible. Events fire
     the instant the ENGINE resolves - 'their healer falls' used to
     appear while she was still standing on screen, and round lessons
     spoke underneath the ROUND banner (playtest 2026-08-10). The board
     is 'loud' while an action's animations play (body busy) or while a
     tier-1 announcement owns the centre; the queue waits for quiet.
     The slim turn strip does not count - it is up half the fight. */
  function boardLoud() {
    if (document.body.dataset.busy === '1') return true;
    var c = document.getElementById('cine');
    if (c && c.classList.contains('show') && c.className.indexOf('slim') < 0) return true;
    return false;
  }

  function pumpBark() {
    if (barkActive || !barkQ.length) return;
    /* The battle view swaps in behind the gate veil (~560ms); a line
       queued at battle start simply waits for it instead of dying. */
    if (document.body.dataset.view !== 'battle') {
      if (barkWaits++ > 12) {
        barkQ.length = 0;
        barkWaits = 0;
        return;
      }
      window.clearTimeout(barkTimer);
      barkTimer = window.setTimeout(pumpBark, 420);
      return;
    }
    barkWaits = 0;
    /* wait for the moment to land - but a board that never goes quiet
       (12s cap) gets spoken over rather than silencing the road */
    if (boardLoud() && barkBusyWaits++ < 40) {
      window.clearTimeout(barkTimer);
      barkTimer = window.setTimeout(pumpBark, 300);
      return;
    }
    barkBusyWaits = 0;
    var b = barkQ.shift();
    displayBark(b);
  }

  /* the shared display path: pumpBark's quiet-queue and sayNow's
     queue-jump both land here */
  function displayBark(b) {
    var el = $('rival-bark');
    if (!el) return;
    var face = $('rival-bark-face');
    if (face) {
      if (b.stage.portrait) {
        face.src = b.stage.portrait;
        face.hidden = false;
      } else {
        face.hidden = true;
      }
    }
    setText($('rival-bark-name'), b.stage.rival);
    setText($('rival-bark-text'), b.text);
    var paced = reactiveDialogue(b.stage);
    el.classList.toggle('reactive', paced);
    var dismiss = $('rival-bark-dismiss');
    if (dismiss) dismiss.hidden = !paced;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth; // restart the slide-in
    el.classList.add('show');
    barkActive = true;
    if (window.EOL.audio) window.EOL.audio.campaign('bark');
    window.clearTimeout(barkTimer);
    /* Reactive dialogue follows play rather than a chatter clock. Gate I
       additionally has a generous expiry: it stays manually dismissible,
       but never camps over the board after the instruction was read. */
    if (paced && !b.stage.autoDismissDialogue) return;
    barkTimer = window.setTimeout(
      function () {
        el.classList.remove('show');
        barkActive = false;
        barkTimer = window.setTimeout(pumpBark, 380); // a breath between lines
      },
      b.ms || barkMs(b.text)
    );
  }

  /* THE QUEUE-JUMP: an off-script click needs its correction NOW, not
     after the lesson backlog. If the same line is already up it shakes
     instead of restarting - rapid clicking reads as insistence, not
     flicker. */
  function sayNow(stage, text) {
    if (!text) return;
    var el = $('rival-bark');
    if (!el) return;
    var txtEl = $('rival-bark-text');
    if (el.classList.contains('show') && txtEl && txtEl.textContent === text) {
      el.classList.remove('deny');
      void el.offsetWidth;
      el.classList.add('deny');
      /* A refused click replays the complete reading window. Gate II's
         fully reader-paced counsel still remains until the player acts or
         dismisses it. */
      if (!reactiveDialogue(stage) || stage.autoDismissDialogue) {
        window.clearTimeout(barkTimer);
        barkTimer = window.setTimeout(function () {
          el.classList.remove('show');
          barkActive = false;
          barkTimer = window.setTimeout(pumpBark, 380);
        }, barkMs(text));
      }
      return;
    }
    displayBark({ stage: stage, text: text, ms: null });
  }

  function queueBark(stage, text, ms) {
    if (!text) return;
    if (reactiveDialogue(stage)) {
      /* Never let tutorial speech lag behind play. Keep only the newest
         observation/instruction, leave the current line visible while an
         animation is loud, then replace it as soon as the board settles. */
      barkQ.length = 0;
      barkQ.push({ stage: stage, text: text, ms: null });
      if (barkActive) {
        barkActive = false;
        window.clearTimeout(barkTimer);
      }
      pumpBark();
      return;
    }
    if (barkQ.length > 7) return; // dialogue never piles into a backlog
    barkQ.push({ stage: stage, text: text, ms: ms || null });
    pumpBark();
  }

  function dismissReactiveBark() {
    var el = $('rival-bark');
    if (!el || !el.classList.contains('reactive')) return;
    el.classList.remove('show');
    barkActive = false;
    window.clearTimeout(barkTimer);
    /* If a newer event arrived during an animation, it remains eligible
       to appear once the board is quiet; dismissing stale text must not
       discard the current instruction. */
    barkTimer = window.setTimeout(pumpBark, 180);
  }

  function barkLine(stage, key) {
    var b = stage.barks || {};
    var v = b[key];
    if (Array.isArray(v)) return v[Math.floor(Math.random() * v.length)] || null;
    return v || null;
  }

  var battleWatch = null;

  function clearBattleWatch() {
    if (!battleWatch) return;
    window.EOL.onBattleEvent = battleWatch.prevHook || null;
    battleWatch = null;
  }

  function fireBark(key, opts) {
    if (!battleWatch) return;
    opts = opts || {};
    if (battleWatch.fired[key]) return;
    if (opts.chance != null && Math.random() > opts.chance) return;
    var now = Date.now();
    if (!opts.force && now - battleWatch.lastAt < BARK_GAP) return;
    var text = barkLine(battleWatch.stage, key);
    if (!text) return;
    battleWatch.fired[key] = true;
    battleWatch.lastAt = now;
    queueBark(battleWatch.stage, text);
  }

  function aliveCount(B, side) {
    return (B.units || []).filter(function (u) {
      return u.side === side && u.alive;
    }).length;
  }

  function watchEvent(B, ev) {
    if (!battleWatch || !ev) return;
    if (ev.t === 'death') {
      var u = (B.units || []).filter(function (x) {
        return x.uid === ev.uid;
      })[0];
      if (!u) return;
      battleWatch.deaths[u.side] = (battleWatch.deaths[u.side] || 0) + 1;
      var total = battleWatch.deaths.player + battleWatch.deaths.enemy;
      if (total === 1) {
        fireBark(u.side === 'enemy' ? 'firstBloodYou' : 'firstBloodFoe', { force: true });
        return;
      }
      if (u.side === 'player') {
        if (aliveCount(B, 'player') <= 2) fireBark('playerLow');
        else fireBark('allyDown', { chance: 0.65 });
      } else {
        /* the REACTION for their fallen healer outranks the generic
           death barks - it is the lesson the shortened script kept
           trying to teach ('cure it at the source') */
        var rxD = (battleWatch.stage.tutorial || {}).reactions;
        if (u.role === 'Medic' && rxD && rxD.foeMedicDown && battleWatch.rxFree) {
          if (fireReaction('foeMedicDown', rxD.foeMedicDown, { force: true })) return;
        }
        var left = aliveCount(B, 'enemy');
        if (left === 1) fireBark('foeLast', { force: true });
        else if (left <= 3) fireBark('foeHalf');
        else fireBark('foeDown', { chance: 0.4 });
      }
    } else if (ev.t === 'heal') {
      /* their medic undoing your work, once: the shape of the annoyance */
      var healer = (B.units || []).filter(function (x) {
        return x.uid === ev.src;
      })[0];
      var rxH = (battleWatch.stage.tutorial || {}).reactions;
      if (
        healer &&
        healer.side === 'enemy' &&
        ev.tgt !== ev.src &&
        (ev.amount || 0) > 0 &&
        rxH &&
        rxH.enemyHeals &&
        battleWatch.rxFree
      ) {
        fireReaction('enemyHeals', rxH.enemyHeals);
      }
    } else if (ev.t === 'revive') {
      var r = (B.units || []).filter(function (x) {
        return x.uid === ev.uid;
      })[0];
      if (r && r.side === 'enemy') fireBark('rivalRevive', { force: true });
    }
  }

  /* Called by battle.js start() whenever a campaign battle opens. */
  function onBattleStart(B) {
    clearBattleWatch();
    var stage = stageById(B.campaignStage);
    if (!stage) return;
    activeCampaignStage = stage.id;
    battleWatch = {
      stage: stage,
      fired: {},
      deaths: { player: 0, enemy: 0 },
      lastAt: 0,
      prevHook: window.EOL.onBattleEvent || null,
      /* THE REACTION LAYER (gate 1, post-handoff): rxFree flips true
         when the scripted line ends; each reaction fires once, with a
         cooldown, and silence is always allowed. */
      rxFree: !(stage.script && stage.script.match),
      rxFired: {},
      rxCool: 0,
    };
    window.EOL.onBattleEvent = function (BB, ev) {
      if (battleWatch && battleWatch.prevHook) {
        try {
          battleWatch.prevHook(BB, ev);
        } catch (e) {
          /* an external listener must not break the road */
        }
      }
      try {
        watchEvent(BB, ev);
      } catch (e) {
        /* barks are flavour; they never break a fight */
      }
    };
    /* Gates I-II have no time-fired opener or round monologue. Their
       dialogue starts only when the script asks for a move or the battle
       produces something worth reacting to. This keeps both fast learners
       and slow readers aligned with the words on screen. */
    if (reactiveDialogue(stage)) {
      battleWatch.fired.start = true;
      return;
    }
    /* Later set stages greet each game differently. */
    var key = 'start';
    try {
      var ss = window.EOL.play && window.EOL.play._setState ? window.EOL.play._setState() : null;
      if (ss && ss.game === 2) key = 'start2';
      else if (ss && ss.game >= 3) key = 'start3';
    } catch (e) {
      /* fall back to the game-1 line */
    }
    var stageRef = stage;
    var openKey = key;
    window.setTimeout(function () {
      if (!battleWatch || battleWatch.stage !== stageRef) return;
      var text = barkLine(stageRef, openKey) || barkLine(stageRef, 'start');
      if (text && !battleWatch.fired.start) {
        battleWatch.fired.start = true;
        battleWatch.lastAt = Date.now();
        queueBark(stageRef, text);
      }
    }, 2100);
  }

  /* Called by battle.js on every round boundary of a campaign battle.
     Carries the guided gate's round lessons (basics, energy, the
     signature unlock, the ramp) - and nothing outside a tutorial. */
  function onBattleRound(B) {
    if (!battleWatch) return;
    var stage = battleWatch.stage;
    /* Early-gate teaching is attached to the player's marked move and
       actual battle events. Round-number timers were the source of stale
       dialogue and are deliberately silent here. */
    if (reactiveDialogue(stage)) return;
    var T = stage.tutorial;
    if (!T || !T.rounds) return;
    var lines = T.rounds[B.round];
    if (!lines || battleWatch.fired['round' + B.round]) return;
    battleWatch.fired['round' + B.round] = true;
    battleWatch.lastAt = Date.now();
    lines.forEach(function (line) {
      queueBark(stage, line);
    });
  }

  /* THE SCRIPTED MATCH narration (battle.js's move-script layer).
     onScriptMove fires when a move becomes current - the Recruiter
     issues the instruction before the hand moves. onScriptSay fires
     as a scripted ENEMY move executes. */
  function onScriptMove(B, mv) {
    if (!battleWatch || !mv) return;
    if (mv.side === 'player' && mv.say) queueBark(battleWatch.stage, mv.say);
  }
  function onScriptSay(B, mv) {
    if (!battleWatch || !mv || !mv.say) return;
    queueBark(battleWatch.stage, mv.say);
  }
  /* An off-script click during the guided opening: repeat the current
     INSTRUCTION where the player's eyes already live, instead of the
     toast chip nobody read (playtest 2026-08-10). */
  function onScriptDeny(B, mv) {
    if (!battleWatch) return;
    var text =
      (mv && mv.say) ||
      'The Recruiter taps the ledger. "The marked move, Blank - the gold is not a suggestion."';
    sayNow(battleWatch.stage, text);
  }

  /* Preparation uses the same correction rule as battle: when a Gate I
     click strays from the gold marks, put the relevant instruction back
     in the Recruiter's own bubble instead of emitting a bottom toast. */
  function onPrepScriptDeny(stageId, text) {
    var stage = stageById(stageId);
    if (!stage || !stage.script) return false;
    showTutor(stage, text, false);
    return true;
  }

  function onScriptEnd(B, reason) {
    if (!battleWatch) return;
    battleWatch.rxFree = true; // the Recruiter stops steering either way
    if (reason === 'done') {
      /* THE HANDOFF (2026-08-10): the shortened line ends at the top of
         round 3 by design - the war is the player's now, and he says so */
      var T = battleWatch.stage.tutorial || {};
      if (T.handoff) queueBark(battleWatch.stage, T.handoff);
      return;
    }
    if (reason === 'desync') {
      /* the line broke (a balance patch moved a number) - the fight
         gracefully becomes a normal battle, and says so in character */
      queueBark(
        battleWatch.stage,
        'The Recruiter squints at his ledger. "The ink has moved. Fight it your own way, Blank - I will watch."'
      );
    }
  }

  /* THE REACTIONS - the Recruiter answering the player's OWN choices
     after the handoff. Observations, never corrections: the four
     role-signature lessons the shortened script no longer scripts,
     the unprompted pass, the fall of the enemy healer. Each fires
     once; a cooldown keeps him from chaining barks; anything
     unremarkable earns silence. */
  var RX_COOLDOWN = 6500;

  function fireReaction(key, text, opts) {
    if (!battleWatch || !battleWatch.rxFree || !text) return false;
    if (battleWatch.rxFired[key]) return false;
    var now = Date.now();
    if (!(opts && opts.force) && now < battleWatch.rxCool) return false;
    battleWatch.rxFired[key] = true;
    battleWatch.rxCool = now + RX_COOLDOWN;
    queueBark(battleWatch.stage, text);
    return true;
  }

  function onPlayerAction(B, info) {
    if (!battleWatch || !info) return;
    /* In reader-paced gates, taking the next action is itself an
       acknowledgement. Hide the previous line; a newer event already
       parked in barkQ (for example first blood) is preserved and will
       appear when the action animation settles. Scripted instructions
       are excluded because scriptAdvance has already installed the next
       marked move before this callback runs. */
    if (reactiveDialogue(battleWatch.stage) && battleWatch.rxFree) dismissReactiveBark();
    var T = battleWatch.stage.tutorial || {};
    var rx = T.reactions;
    if (!rx) return;
    /* Enemy deaths - including their healer - are handled in watchEvent.
       Let that consequence outrank a generic role observation from the
       same blow instead of replacing it in the reactive slot. */
    if (info.killedRoles && info.killedRoles.length) return;
    if (info.sig && rx.roles && rx.roles[info.role]) {
      if (fireReaction('role-' + info.role, rx.roles[info.role])) return;
    }
    if (info.pass && rx.pass) {
      fireReaction('pass', rx.pass);
    }
  }

  /* ---------------------------------------------------------
     THE TUTOR - the Recruiter's guided-lesson bubble (gate I).
     -------------------------------------------------------------
     A corner narrator for the scripted prep: informational beats
     carry a Continue button; action beats stay up and re-word
     themselves as the player follows the marks. It polls the prep
     state (cheap, 4x/sec) instead of threading callbacks through
     play.js - the script enforcement already lives there, so the
     tutor only has to SAY things, never gate them. In battle the
     bark queue takes over.
     --------------------------------------------------------- */
  var tut = null; // { stage, flags, seq, timer }

  function hideTutor() {
    var el = $('tutor');
    if (el) el.hidden = true;
    var shield = $('tutor-shield');
    if (shield) shield.hidden = true;
    setTutorHold(false);
  }

  /* THE HOLD FLAG. While a shielded (informational) beat owns the
     screen, the prep UI must not INVITE what the shield refuses: the
     first outside playtest report (2026-08-09) was exactly this -
     header reading 'tap 2 to ban', two cards gold-marked, and every
     tap silently swallowed by the shield until Continue. play.js
     reads this flag to park the golden marks and swap the prompt
     while the Recruiter is talking. */
  function setTutorHold(on) {
    var was = document.body.dataset.tutorHold === '1';
    if (was === !!on) return;
    document.body.dataset.tutorHold = on ? '1' : '0';
    /* repaint the prep chrome NOW - the next poll tick is 260ms away
       and the marks must never linger under a fresh shield */
    if (window.EOL.play && window.EOL.play.repaintPrep) window.EOL.play.repaintPrep();
  }

  function showTutor(stage, text, withNext, onNext, opts) {
    opts = opts || {};
    var el = $('tutor');
    if (!el || !text) return;
    var face = $('tutor-face');
    if (face && stage.portrait) face.src = stage.portrait;
    setText($('tutor-name'), stage.rival);
    var body = $('tutor-text');
    if (body && body.textContent !== text) body.textContent = text;
    var btn = $('tutor-next');
    if (btn) {
      btn.hidden = !withNext;
      btn.onclick = withNext
        ? function () {
            if (onNext) onNext();
          }
        : null;
    }
    /* Informational beats OWN the screen: a soft dim shield swallows
       every click until Continue is pressed. Beats that POINT AT live
       UI (the arena card, the tip dots) skip the shield so the thing
       being described stays visible and hoverable. */
    var shield = $('tutor-shield');
    var shieldOn = withNext && opts.shield !== false;
    if (shield) shield.hidden = !shieldOn;
    setTutorHold(shieldOn);
    el.hidden = false;
  }

  function startPrepTutor(stage) {
    stopPrepTutor();
    if (!stage.tutorial && !stage.advisor) return;
    tut = { stage: stage, flags: {}, seq: null, timer: window.setInterval(tutorTick, 260) };
    /* claim the battlefield popup's button BEFORE the popup opens:
       play.js's entrance unlock (animationend / 900ms fallback) checks
       this flag, so the button can never flash enabled in the gap
       between our polls while the arena + tips beats are unread */
    var T = stage.tutorial;
    var bfGo = $('bf-go');
    if (bfGo && T && (T.arena || T.tips)) {
      bfGo.dataset.campaignHold = '1';
      bfGo.disabled = true;
      tut.heldGo = true;
    }
    tutorTick();
  }

  function stopPrepTutor() {
    if (!tut) return;
    window.clearInterval(tut.timer);
    tut = null;
    hideTutor();
    /* never leave the popup button held for a future non-campaign
       game - play.js re-disables it on every popup open anyway */
    var bfGo = $('bf-go');
    if (bfGo && bfGo.dataset.campaignHold === '1') {
      delete bfGo.dataset.campaignHold;
      bfGo.disabled = false;
    }
  }

  /* A gated info sequence: each line waits for Continue. Returns true
     while the sequence still owns the bubble. */
  function runTutorSeq(lines, key, opts) {
    if (!lines || !lines.length || tut.flags[key]) return false;
    if (!tut.seq || tut.seq.key !== key) tut.seq = { key: key, i: 0 };
    var i = tut.seq.i;
    if (i >= lines.length) {
      tut.flags[key] = true;
      tut.seq = null;
      return false;
    }
    showTutor(
      tut.stage,
      lines[i],
      true,
      function () {
        if (!tut || !tut.seq || tut.seq.key !== key) return;
        tut.seq.i++;
        tutorTick();
      },
      opts
    );
    return true;
  }

  function tutorTick() {
    if (!tut) return;
    var view = document.body.dataset.view;
    if (view === 'battle') {
      stopPrepTutor(); // the bark queue narrates the fight
      return;
    }
    var p = window.EOL.play && window.EOL.play._prepState ? window.EOL.play._prepState() : null;
    if (!p || p.campaignStage !== tut.stage.id) {
      if (view !== 'prep') stopPrepTutor(); // the player walked away
      return;
    }
    var T = tut.stage.tutorial;
    if (!T) {
      /* THE ADVISED GATE (stage 2): no script, no shield, no holds -
         the Recruiter stands at the shoulder with silver counsel and
         his hands in his pockets. One line per phase, ungated. */
      var A = tut.stage.advisor;
      if (!A) {
        stopPrepTutor();
        return;
      }
      var REC = { rival: 'The Recruiter', portrait: 'assets/rivals/the-recruiter.png' };
      if (p.phase === 'ban') {
        if (p.waiting || p.revealed) hideTutor();
        else showTutor(REC, A.ban, false);
      } else if (p.phase === 'pick') {
        showTutor(REC, A.six, false);
      }
      return;
    }
    if (p.phase === 'ban') {
      if (runTutorSeq(T.intro, 'intro')) return;
      if (p.waiting) {
        hideTutor();
        return;
      }
      if (p.revealed) {
        /* the stamps are ON SCREEN right now - narrate them, ungated,
           while play.js holds the reveal a little longer for the
           scripted gate */
        showTutor(tut.stage, T.reveal, false);
        return;
      }
      var n = (p.youBans || []).length;
      showTutor(tut.stage, n === 0 ? T.ban0 : n === 1 ? T.ban1 : T.ban2, false);
    } else if (p.phase === 'pick') {
      /* the ARENA lesson plays while the battlefield card is still up
         (the tutor floats above it) and the TIPS beat leaves the dots
         hoverable - no shield on either. But the card's own "Field
         your six" button is HELD until both beats are read: without
         this the popup could be dismissed straight past the lesson
         that points at it (user note 2026-08-09). */
      var gatedBeats = (T.arena && !tut.flags.arena) || (T.tips && !tut.flags.tips);
      var bfGo = $('bf-go');
      if (bfGo) {
        if (gatedBeats) {
          bfGo.dataset.campaignHold = '1';
          bfGo.disabled = true;
          tut.heldGo = true;
        } else if (tut.heldGo) {
          delete bfGo.dataset.campaignHold;
          bfGo.disabled = false;
          tut.heldGo = false;
        }
      }
      if (T.arena && runTutorSeq([T.arena], 'arena', { shield: false })) return;
      if (T.tips && runTutorSeq([T.tips], 'tips', { shield: false })) return;
      var six = (tut.stage.script && tut.stage.script.six) || [];
      var fielded = p.front.concat(p.back);
      /* every fielded legend earns its role lesson, in the ledger's order */
      for (var k = 0; k < six.length; k++) {
        var cid = six[k];
        if (fielded.indexOf(cid) >= 0 && T.roles && T.roles[cid]) {
          if (runTutorSeq([T.roles[cid]], 'role-' + cid)) return;
        }
      }
      if (fielded.length < 6) {
        var nextId = null;
        for (k = 0; k < six.length; k++) {
          if (fielded.indexOf(six[k]) < 0) {
            nextId = six[k];
            break;
          }
        }
        var entry = nextId ? cardDict()[nextId] : null;
        showTutor(
          tut.stage,
          String(T.field || '')
            .replace('{name}', entry ? entry.card.name : '')
            .replace('{n}', String(6 - fielded.length)),
          false
        );
      } else if (runTutorSeq([T.rows], 'rows')) {
        return;
      } else {
        showTutor(tut.stage, T.toBattle, false);
      }
    }
  }

  /* ---------------------------------------------------------
     RESULTS - one pending campaign result, consumed by the result
     screen. battle.js frames the buttons from what we return here;
     the campaign never reaches into the result DOM itself.
     --------------------------------------------------------- */
  var resultInfo = null;

  function rewardLine(stage, first) {
    if (!first) return '+25 coins · Replay reward';
    var g = stage.grants || {};
    var parts = ['+' + (g.coins || 0) + ' coins'];
    if (g.choice) parts.push('Choose ' + g.choice.count + ' Echoes');
    /* The pack itself is the reveal. The result receipt confirms the
       reward category without naming the card before the wrapper opens. */
    if (g.legendPack) parts.push('Legendary reward pack');
    return parts.join(' · ');
  }

  function onBattleResult(win, info) {
    clearBattleWatch();
    hideBark();
    info = info || {};
    if (!activeCampaignStage) return null;
    /* Guard against a STALE stage: a campaign battle abandoned mid-fight
       leaves activeCampaignStage set, and the next ordinary Classic win
       must not be scored as a gate clear. The battle itself knows what
       it is - trust it over our own memory. */
    try {
      var live =
        window.EOL.battle && window.EOL.battle.getState ? window.EOL.battle.getState() : null;
      if (live && live.campaignStage !== activeCampaignStage) {
        activeCampaignStage = null;
        return null;
      }
    } catch (e) {
      /* no battle state readable - fall through on our own record */
    }
    /* Mid-set: the war is undecided, the sideboard framing stands,
       and NOTHING commits (R3: progress commits on stage completion
       only). The stage stays active for the next game. */
    if (info.midSet) return null;
    var stage = stageById(activeCampaignStage);
    if (!stage) {
      activeCampaignStage = null;
      return null;
    }
    var firstClear = false;
    /* FIRST BLOOD (owner ruling 2026-08-10): facing a rival once -
       win or lose - opens their forces in the ledger. */
    progFought(stage.id);
    if (win) firstClear = recordClear(stage);
    resultInfo = { stage: stage.id, won: win, first: firstClear };
    return {
      campaign: true,
      sub: win ? stage.resultWin : stage.resultLose,
      rewards: win ? rewardLine(stage, firstClear) : null,
      rematchLabel: 'Retry',
      homeLabel: win ? 'Continue' : 'Map',
    };
  }

  /* The result screen's primary action: fight the gate again. Skips
     the scene (the player has read it) and goes straight back to the
     deck picker / draft table. */
  function retry(stageId) {
    resultInfo = null;
    var stage = stageById(stageId || activeCampaignStage || 1);
    if (!stage) return;
    hideBark();
    launchStage(stage);
  }

  /* The result screen's secondary action. Returns true when the
     campaign consumed the click (epilogue / choice / map routing) so
     the generic home handler stands down. */
  function consumeResult() {
    if (!resultInfo) return false;
    var r = resultInfo;
    resultInfo = null;
    activeCampaignStage = null;
    var stage = stageById(r.stage);
    if (r.won && stage) {
      var lines = (STORY.epilogues || {})[stage.id] || [];
      openDialogue(stage, lines, 'epilogue', function () {
        maybeOfferChoice(stage, function () {
          window.EOL.ui.show('chapter');
        });
      });
    } else {
      window.EOL.ui.show('chapter');
    }
    return true;
  }

  /* ---------------------------------------------------------
     THE CHOICE GRANT (R9) - exams pay out as a choice, resolved at
     claim time against the live roster, never as hardcoded ids.
     --------------------------------------------------------- */
  function choiceCandidates(stage) {
    var g = stage.grants && stage.grants.choice;
    if (!g) return [];
    var dict = cardDict();
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      if ((g.factions || []).indexOf(f.id) < 0) return;
      f.cards.forEach(function (c) {
        /* THE CROWN LAW: legendaries travel only inside Legend Packs -
           an exam choice never offers one. Every ordinary card remains on
           the Warden's table, including owned cards, so the reward reads as
           the complete Camelot / Sherwood / Olympus shelf rather than an
           unexplained random subset. Ownership is rendered on the card and
           only the unowned remainder can be selected. */
        if (c.rarity !== 'legendary') out.push(dict[c.id]);
      });
    });
    return out;
  }

  function choiceOwned(entry, prog) {
    if (window.EOL.econ && window.EOL.econ.owns(entry.card.id)) return true;
    /* Old pre-economy saves can carry campaign grants before the one-time
       ownership import has run. Honour that ledger here as well. */
    return (prog.grants || []).indexOf(entry.card.id) >= 0;
  }

  function maybeOfferChoice(stage, done) {
    var prog = getProgress();
    if (
      !stage.grants ||
      !stage.grants.choice ||
      prog.choices[stage.id] ||
      prog.pendingChoice !== stage.id
    ) {
      done();
      return;
    }
    openGrantChoice(stage, done);
  }

  function openGrantChoice(stage, done) {
    var modal = $('grant-choice');
    if (!modal) {
      done();
      return;
    }
    var g = stage.grants.choice;
    var prog = getProgress();
    var candidates = choiceCandidates(stage);
    if (!candidates.length) {
      prog.pendingChoice = null;
      saveProgress(prog);
      done();
      return;
    }
    var available = candidates.filter(function (e) {
      return !choiceOwned(e, prog);
    });
    /* A collector who already owns almost everything must never be trapped
       behind an impossible "choose 2". They take every remaining new card;
       with none left, the complete greyed shelf is still shown and the
       button simply acknowledges it. */
    var required = Math.min(g.count, available.length);
    var picked = [];
    if (window.EOL.audio) window.EOL.audio.campaign('reward');
    setText(
      $('grant-choice-sub'),
      required
        ? stage.rival +
            ' opens the complete non-Legendary shelf from ' +
            (g.factions || [])
              .map(function (id) {
                var f = (window.EOL.factions || []).filter(function (x) {
                  return x.id === id;
                })[0];
                return f ? f.name : id;
              })
              .join(', ') +
            '. Choose ' +
            required +
            (required === 1 ? ' unowned echo.' : ' unowned echoes.')
        : 'Every non-Legendary echo on this table is already yours.'
    );
    var grid = $('grant-choice-grid');
    grid.innerHTML = '';
    var go = $('grant-choice-go');
    var sync = function () {
      go.disabled = picked.length !== required;
      go.querySelector('span').textContent =
        required === 0
          ? 'Continue'
          : picked.length === required
            ? 'Carry them'
            : 'Choose ' + (required - picked.length) + ' more';
    };
    candidates.forEach(function (e) {
      /* Reuse the Ledger's actual little battle card and hover panel,
         rather than reducing a mythic choice to a generic icon button. */
      var b =
        window.EOL.play && window.EOL.play.tileFor
          ? window.EOL.play.tileFor(e, $('grant-choice-tip'))
          : document.createElement('div');
      var owned = choiceOwned(e, prog);
      b.classList.add('gc-card-choice');
      b.setAttribute('role', 'checkbox');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', owned ? e.card.name + ' - Owned' : 'Choose ' + e.card.name);
      if (owned) {
        b.classList.add('is-owned');
        b.setAttribute('aria-disabled', 'true');
        b.tabIndex = -1;
        var ownedChip = document.createElement('span');
        ownedChip.className = 'gc-owned';
        ownedChip.textContent = 'Owned';
        b.appendChild(ownedChip);
      } else {
        b.tabIndex = 0;
      }
      var toggle = function () {
        if (owned) return;
        var i = picked.indexOf(e.card.id);
        if (i >= 0) {
          picked.splice(i, 1);
          b.classList.remove('sel');
          b.setAttribute('aria-checked', 'false');
        } else {
          if (picked.length >= required) {
            if (window.EOL.audio) window.EOL.audio.ui('deny');
            return;
          }
          picked.push(e.card.id);
          b.classList.add('sel');
          b.setAttribute('aria-checked', 'true');
        }
        if (window.EOL.audio) window.EOL.audio.card(i >= 0 ? 'remove' : 'pick');
        sync();
      };
      b.addEventListener('click', toggle);
      b.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        toggle();
      });
      grid.appendChild(b);
    });
    if (window.EOL.play && window.EOL.play.fitTileNames) window.EOL.play.fitTileNames();
    sync();
    go.onclick = function () {
      if (picked.length !== required) return;
      var p2 = getProgress();
      picked.forEach(function (id) {
        if (p2.grants.indexOf(id) < 0) p2.grants.push(id);
      });
      p2.choices[stage.id] = picked.slice();
      if (p2.pendingChoice === stage.id) p2.pendingChoice = null;
      saveProgress(p2);
      /* the chosen echoes are OWNED now, not just remembered */
      if (window.EOL.econ) window.EOL.econ.grant(picked);
      modal.hidden = true;
      if (window.EOL.audio) window.EOL.audio.campaign('reward');
      done();
    };
    modal.hidden = false;
  }

  /* An unclaimed exam choice (the tab closed mid-reward) re-offers
     itself the next time the chapter map opens. */
  function reofferPendingChoice() {
    var prog = getProgress();
    if (!prog.pendingChoice) return;
    var stage = stageById(prog.pendingChoice);
    if (!stage) return;
    openGrantChoice(stage, function () {
      updateStageCards();
    });
  }

  /* THE LEGEND CEREMONY: an unopened Legend Pack plays the one-card
     opening the next time the chapter map is quiet. The card is
     already owned (granted at clear time), while the durable queue stays
     set until the theater accepts it. Waits out any dialogue on screen. */
  function reofferPendingLegend() {
    var prog = getProgress();
    if (!prog.pendingLegend) return;
    var stage = stageById(prog.pendingLegend);
    if (!stage || !stage.grants || !stage.grants.legendPack) {
      prog.pendingLegend = null;
      saveProgress(prog);
      return;
    }
    if (dlg) {
      /* an epilogue is still talking - try again when it is done */
      window.setTimeout(reofferPendingLegend, 900);
      return;
    }
    if (document.body.dataset.view !== 'chapter') return;
    /* Do not consume the durable queue until the global theater actually
       accepts it. Previously the flag was cleared first; if Shop had not
       mounted yet, the reward was owned but its reveal was silently lost. */
    if (!(window.EOL.shop && window.EOL.shop.openLegendPack)) {
      window.setTimeout(reofferPendingLegend, 120);
      return;
    }
    var opened = window.EOL.shop.openLegendPack(stage.grants.legendPack, {
      gate: 'Gate ' + ROMAN[stage.id] + ' cleared',
    });
    if (!opened) return;
    prog.pendingLegend = null;
    saveProgress(prog);
  }

  /* ---------------------------------------------------------
     CHAPTER MAP - stage card states and copy.
     --------------------------------------------------------- */
  function paintStageRewards(card, stage, cleared) {
    var info = card.querySelector('.sc-info');
    if (!info) return;
    var row = info.querySelector('.sc-rewards');
    if (!row) {
      row = document.createElement('span');
      row.className = 'sc-rewards';
      info.appendChild(row);
    }
    var g = stage.grants || {};
    var chips = [];
    chips.push(
      '<span class="sc-reward coin"><i class="ri-coin-fill"></i>' + (g.coins || 0) + ' coins</span>'
    );
    if (g.choice)
      chips.push(
        '<span class="sc-reward"><i data-icon-domain="game" class="ra ra-locked-fortress"></i>Choose ' +
          g.choice.count +
          ' Echoes</span>'
      );
    if (g.legendPack)
      chips.push(
        '<span class="sc-reward legendary"><i data-icon-domain="game" class="ra ra-crown"></i>Legendary reward pack</span>'
      );
    row.innerHTML = '<b>' + (cleared ? 'Earned' : 'First clear') + '</b>' + chips.join('');
  }

  function updateStageCards() {
    var prog = getProgress();
    var unlocked = prog.unlocked || [1];
    var cleared = prog.cleared || [];

    (STORY.stages || []).forEach(function (stage) {
      var card = document.querySelector('[data-campaign-stage="' + stage.id + '"]');
      if (!card) return;

      var isUnlocked = unlocked.indexOf(stage.id) >= 0;
      var isCleared = cleared.indexOf(stage.id) >= 0;

      card.classList.toggle('is-locked', !isUnlocked);
      card.classList.toggle('is-cleared', isCleared);
      card.disabled = !isUnlocked;

      var state = card.querySelector('.sc-state-badge, .rival-state, .rival-lock');
      var prompt = card.querySelector('.sc-prompt');
      paintStageRewards(card, stage, isCleared);

      if (isCleared) {
        if (state) {
          state.innerHTML =
            '<i class="ri-checkbox-circle-fill" style="color:#8fe3b0"></i> Gate Cleared';
        }
        if (prompt) {
          prompt.innerHTML = '<i class="ri-chat-3-line"></i> Click to walk the gate again';
        }
      } else if (isUnlocked) {
        if (state) {
          state.innerHTML = '<i class="ri-lock-unlock-line" style="color:#ffd98a"></i> Open Gate';
        }
        if (prompt) {
          prompt.innerHTML = '<i class="ri-chat-3-line"></i> Click to speak with ' + stage.rival;
        }
      } else {
        if (state) {
          state.innerHTML = '<i class="ri-lock-2-fill"></i> Locked';
        }
        if (prompt) {
          prompt.innerHTML = '<i class="ri-lock-2-line"></i> ' + (stage.lock || 'Gate Locked');
        }
      }
    });

    var progressN = document.querySelector('.chapter-progress-n');
    if (progressN) {
      var currentDisplay = Math.min(10, Math.max(1, cleared.length + 1));
      progressN.innerHTML = '<b>' + two(currentDisplay) + '</b><i>/</i>10';
    }
  }

  function renderStageCopy() {
    (STORY.stages || []).forEach(function (stage) {
      var card = document.querySelector('[data-campaign-stage="' + stage.id + '"]');
      if (!card) return;
      setText(card.querySelector('.sc-kicker, .rival-kicker'), stageLabel(stage));
      setText(card.querySelector('.sc-name, .rival-name'), stage.rival);
      var desc = card.querySelector('.sc-desc, .rival-desc');
      if (desc && stage.line) setText(desc, stage.line);
      var meta = card.querySelector('.sc-meta, .rival-meta');
      if (meta) {
        var icon = meta.querySelector('i');
        meta.textContent = '';
        if (icon) meta.appendChild(icon);
        meta.appendChild(document.createTextNode(' ' + stage.terrain));
      }
    });
    updateStageCards();
  }

  function bindStageClicks() {
    for (var i = 1; i <= 10; i++) {
      (function (stageId) {
        var card = document.querySelector('[data-campaign-stage="' + stageId + '"]');
        if (card) {
          card.addEventListener('click', function () {
            var prog = getProgress();
            var unlocked = prog.unlocked || [1];
            if (unlocked.indexOf(stageId) >= 0) {
              openStageDialogue(stageId);
            }
          });
        }
      })(i);
    }
  }

  /* ---------------------------------------------------------
     THE LEDGER (2026-08-10, revised same day per owner notes)
     -------------------------------------------------------------
     The Recruiter's book, made openable from the chapter header.
     Everything on these pages is the same story data the gates run
     on - zero duplicated prose. Ten rival pages under fog of war:

       sealed   (gate locked)   name withheld, page unwritten
       intel    (gate unlocked) what the Recruiter would share:
                the GROUND (full arena laws, not just the name),
                the HABIT (the tell + what they prefer to strike),
                and his COUNSEL
       full     (gate cleared)  adds the twelve as real battle
                tiles with the prep hover panel, the record, the
                post-fight word - and, forever, any correction the
                player forced onto a ban-claim.
     --------------------------------------------------------- */
  var ledgerSel = 1;

  function ledgerStateOf(stage, prog) {
    if (prog.cleared.indexOf(stage.id) >= 0) return 'full';
    /* FIRST BLOOD (owner ruling 2026-08-10): one fight - won or lost -
       opens the rival's forces in the ledger */
    if (prog.fought.indexOf(stage.id) >= 0) return 'met';
    if (prog.unlocked.indexOf(stage.id) >= 0) return 'intel';
    return 'sealed';
  }

  function ledgerFieldIds(stage) {
    return stage.field ? [stage.field] : (stage.fightCard || []).slice();
  }

  /* what the profile actually reaches for, in plain words - the tell
     is the reputation, this is the mechanism (owner note 2026-08-10:
     'include what they like to ban') */
  function habitPrefs(stage) {
    var bp = stage.banProfile || {};
    var parts = [];
    if (bp.ids && bp.ids.length) {
      var dict = cardDict();
      parts.push(
        bp.ids
          .map(function (id) {
            return dict[id] ? dict[id].card.name : id;
          })
          .join(' and ') + ' - always'
      );
    }
    if (bp.roles && bp.roles.length) {
      parts.push(
        bp.roles
          .map(function (r) {
            return r + 's';
          })
          .join(' and ')
      );
    }
    if (bp.stat === 'atk') parts.push('your hardest hitters');
    if (bp.power) parts.push('your strongest legends');
    if (!parts.length) parts.push('whatever your twelve leans on - the load-bearing pieces');
    return parts.join(', then ');
  }

  function renderLedgerList() {
    var host = $('ledger-list');
    if (!host) return;
    var prog = getProgress();
    host.innerHTML = (STORY.stages || [])
      .map(function (stage) {
        var st = ledgerStateOf(stage, prog);
        var name = st === 'sealed' ? 'Page unwritten' : stage.rival;
        var icon =
          st === 'full'
            ? '<i class="ri-checkbox-circle-fill lg-done"></i>'
            : st === 'met'
              ? '<i class="ri-sword-line lg-met"></i>'
              : st === 'intel'
                ? '<i class="ri-lock-unlock-line lg-open"></i>'
                : '<i class="ri-lock-2-fill lg-lock"></i>';
        var face =
          st === 'sealed'
            ? '<span class="lg-face lg-face-hood"><i data-icon-domain="game" class="ra ra-hood"></i></span>'
            : '<span class="lg-face"><img src="' +
              stage.portrait +
              '" alt="" draggable="false" /></span>';
        return (
          '<button type="button" class="lg-row' +
          (stage.id === ledgerSel ? ' sel' : '') +
          (st === 'sealed' ? ' sealed' : '') +
          '" data-lg="' +
          stage.id +
          '">' +
          face +
          '<span class="lg-row-body"><b>Gate ' +
          ROMAN[stage.id] +
          '</b><span>' +
          name +
          '</span></span>' +
          icon +
          '</button>'
        );
      })
      .join('');
  }

  function renderLedgerPage() {
    var host = $('ledger-page');
    if (!host) return;
    var stage = stageById(ledgerSel);
    var prog = getProgress();
    if (!stage) return;
    var st = ledgerStateOf(stage, prog);
    if (st === 'sealed') {
      host.innerHTML =
        '<div class="lg-sealed"><i data-icon-domain="game" class="ra ra-hood"></i>' +
        '<h3>Gate ' +
        ROMAN[stage.id] +
        '</h3>' +
        '<p>The Road has not taken you there. The ledger keeps its pages in order, Blank.</p></div>';
      return;
    }
    var broke = prog.tellsBroken.indexOf(stage.id) >= 0;
    var clears = prog.clears[stage.id] || 0;
    var html =
      '<div class="lg-hero">' +
      '<img class="lg-portrait" src="' +
      stage.portrait +
      '" alt="" draggable="false" />' +
      '<div class="lg-hero-body">' +
      '<span class="lg-kicker">Gate ' +
      ROMAN[stage.id] +
      ' - ' +
      stage.format +
      '</span>' +
      '<h3>' +
      stage.rival +
      '</h3>' +
      '<p class="lg-line">' +
      stage.line +
      '</p>' +
      '</div></div>';
    /* GROUND: the full arena card(s), not just the name - tagline,
       every law in force, and the drafting note */
    var grounds = ledgerFieldIds(stage)
      .map(function (fid) {
        var f = fieldById(fid);
        if (!f) return '';
        return (
          '<div class="lg-ground">' +
          '<img class="lg-board" src="assets/boards/thumbs/' +
          fid +
          '.png" alt="" loading="lazy" draggable="false" />' +
          '<div class="lg-ground-body"><b>' +
          f.name +
          '</b><span class="lg-tagline">' +
          (f.tagline || '') +
          '</span>' +
          '<ul class="lg-rules">' +
          (f.rules || [])
            .map(function (r) {
              return '<li>' + r + '</li>';
            })
            .join('') +
          '</ul>' +
          (f.draft ? '<span class="lg-draftnote">' + f.draft + '</span>' : '') +
          '</div></div>'
        );
      })
      .join('');
    html +=
      '<div class="lg-fact"><span class="lg-label"><i class="ri-map-pin-line"></i> Ground</span>' +
      grounds +
      '</div>';
    /* HABIT: the reputation, the mechanism, and any correction the
       player forced onto the claim */
    var bp = stage.banProfile || {};
    var hasProfile = !!(
      (bp.ids && bp.ids.length) ||
      (bp.roles && bp.roles.length) ||
      bp.stat ||
      bp.power
    );
    if (stage.banTell || hasProfile) {
      html +=
        '<div class="lg-fact"><span class="lg-label"><i class="ri-scissors-cut-line"></i> Habit</span>' +
        (stage.banTell
          ? broke && stage.banTellBroken
            ? '<p class="lg-struck">' +
              stage.banTell +
              '</p><p class="lg-correct">' +
              stage.banTellBroken +
              '</p>'
            : '<p>' + stage.banTell + '</p>'
          : '') +
        '<p class="lg-prefs"><b>Likes to ban:</b> ' +
        habitPrefs(stage) +
        '</p>' +
        '</div>';
    }
    if (stage.counsel && (stage.id !== 1 || st === 'full')) {
      html +=
        '<div class="lg-fact"><span class="lg-label"><i class="ri-lightbulb-line"></i> Counsel</span><p>' +
        stage.counsel +
        '</p></div>';
    }
    var revealed = st === 'full' || st === 'met';
    var isDraft = stage.mode === 'draft';
    if (isDraft) {
      /* DRAFT GATES field no fixed twelve - they sit at a table. The
         ledger shows the FACTIONS whose echoes are in the pool
         (owner ruling 2026-08-10), once the rival has been faced. */
      if (revealed) {
        var seen = {};
        var pool = (stage.pool && stage.pool.cards) || [];
        var chips = '';
        pool.forEach(function (id) {
          var e = cardDict()[id];
          if (!e || seen[e.faction.id]) return;
          seen[e.faction.id] = true;
          chips +=
            '<span class="lg-fchip' +
            (e.faction.id === (stage.pool && stage.pool.featured) ? ' featured' : '') +
            '" style="--fc:' +
            e.faction.colors.primary +
            '"><i data-icon-domain="game" class="ra ' +
            e.faction.icon +
            '"></i>' +
            e.faction.name +
            '</span>';
        });
        html +=
          '<div class="lg-fact"><span class="lg-label"><i class="ri-stack-line"></i> The Table</span>' +
          '<p class="lg-tablenote">No fixed twelve - a draft. The pool draws from these roads' +
          ((stage.pool || {}).featured
            ? ' (the bright crest is the featured faction, always whole)'
            : '') +
          ':</p>' +
          '<div class="lg-factions">' +
          chips +
          '</div></div>';
      } else {
        html +=
          '<div class="lg-fact lg-unwritten"><span class="lg-label"><i class="ri-stack-line"></i> The Table</span>' +
          '<p>A draft table. Its roads stay unwritten until you first sit across from them.</p></div>';
      }
      if (st === 'full') {
        html +=
          '<div class="lg-fact lg-record"><span class="lg-label"><i class="ri-flag-line"></i> Record</span>' +
          '<p>Gate cleared' +
          (clears > 1 ? ' - walked ' + clears + ' times' : '') +
          '. <span class="lg-word">' +
          (stage.resultWin || '') +
          '</span></p></div>';
      }
    } else if (revealed) {
      html +=
        '<div class="lg-fact"><span class="lg-label"><i class="ri-stack-line"></i> The Twelve</span>' +
        '<div class="prep-cards lg-twelve" id="lg-twelve"></div></div>';
      if (st === 'full') {
        html +=
          '<div class="lg-fact lg-record"><span class="lg-label"><i class="ri-flag-line"></i> Record</span>' +
          '<p>Gate cleared' +
          (clears > 1 ? ' - walked ' + clears + ' times' : '') +
          '. <span class="lg-word">' +
          (stage.resultWin || '') +
          '</span></p></div>';
      } else {
        html +=
          '<div class="lg-fact lg-record"><span class="lg-label"><i class="ri-flag-line"></i> Record</span>' +
          '<p>Met, not beaten. The gate still stands - but their forces are written now.</p></div>';
      }
    } else {
      html +=
        '<div class="lg-fact lg-unwritten"><span class="lg-label"><i class="ri-stack-line"></i> The Twelve</span>' +
        '<p>Unwritten until you first cross blades.</p></div>';
    }
    host.innerHTML = html;
    /* the twelve are REAL battle tiles with the prep hover panel,
       bound to the ledger's own flyout instance */
    if (revealed && !isDraft && window.EOL.play && window.EOL.play.tileFor) {
      var grid = $('lg-twelve');
      var tip = $('ledger-tip');
      var dict = cardDict();
      if (grid) {
        (stage.enemy12 || []).forEach(function (id) {
          var e = dict[id];
          if (e) grid.appendChild(window.EOL.play.tileFor(e, tip));
        });
        if (window.EOL.play.fitTileNames) window.EOL.play.fitTileNames();
      }
    }
  }

  function renderLedger() {
    renderLedgerList();
    renderLedgerPage();
  }

  function openLedger() {
    var box = $('ledger');
    if (!box) return;
    dismissLedgerSpot();
    /* open onto the furthest page the player can read */
    var prog = getProgress();
    var best = 1;
    (STORY.stages || []).forEach(function (s) {
      if (prog.unlocked.indexOf(s.id) >= 0) best = s.id;
    });
    ledgerSel = best;
    renderLedger();
    box.hidden = false;
    if (window.EOL.audio) window.EOL.audio.campaign('page');
    box.setAttribute('aria-hidden', 'false');
  }

  function closeLedger() {
    var box = $('ledger');
    if (!box || box.hidden) return;
    box.hidden = true;
    box.setAttribute('aria-hidden', 'true');
    var tip = $('ledger-tip');
    if (tip) {
      tip.classList.remove('show');
      tip.setAttribute('aria-hidden', 'true');
    }
  }

  /* THE INTRODUCTION - once, right after Gate I falls: the button
     earns a pointer the moment its pages start mattering. A soft
     spotlight, never a lock: dismissed by any click, or by time. */
  var LEDGER_SPOT_KEY = 'eol.tutorial.ledger.v1';
  var ledgerSpotTimer = null;
  /* the spotlight's anchor, remembered so a UI-rescale or window
     resize can re-seat the bubble (it is placed once, not ticked
     like the wayfinder) */
  var ledgerSpotEl = null;

  function ledgerSpotSeen() {
    try {
      return localStorage.getItem(LEDGER_SPOT_KEY) === '1';
    } catch (e) {
      return true;
    }
  }

  function dismissLedgerSpot() {
    var btn = $('btn-ledger');
    if (btn) btn.classList.remove('guide-mark');
    ledgerSpotEl = null;
    if (ledgerSpotTimer) {
      window.clearTimeout(ledgerSpotTimer);
      ledgerSpotTimer = null;
    }
    /* only touch the bubble if the wayfinder is not using it */
    if (!navGuide) {
      var box = $('nav-guide');
      if (box) {
        box.classList.remove('show');
        box.hidden = true;
      }
      var skip = $('nav-guide-skip');
      if (skip) skip.hidden = false; // hand the bubble back intact
    }
    document.removeEventListener('click', ledgerSpotClick, true);
  }

  function ledgerSpotClick(ev) {
    /* any click dismisses; a click on the button itself still lands */
    dismissLedgerSpot();
    void ev;
  }

  function maybeSpotLedger() {
    if (ledgerSpotSeen()) return;
    if (navGuide || dlg) return; // never fight the wayfinder or a scene
    var prog = getProgress();
    if (prog.cleared.indexOf(1) < 0) return; // the pages matter after Gate I
    var btn = $('btn-ledger');
    var box = $('nav-guide');
    if (!btn || !box) return;
    try {
      localStorage.setItem(LEDGER_SPOT_KEY, '1');
    } catch (e) {
      /* private mode: show it this session anyway */
    }
    btn.classList.add('guide-mark');
    var txt = (STORY.guide || {}).ledger || 'The Ledger holds my pages on every rival ahead.';
    var body = $('nav-guide-text');
    if (body) body.textContent = txt;
    var skip = $('nav-guide-skip');
    if (skip) skip.hidden = true; // nothing to skip - it is a pointer, not a flow
    box.hidden = false;
    box.classList.remove('deny');
    void box.offsetWidth;
    box.classList.add('show');
    ledgerSpotEl = btn;
    positionGuide(box, btn);
    window.setTimeout(function () {
      document.addEventListener('click', ledgerSpotClick, true);
    }, 250);
    ledgerSpotTimer = window.setTimeout(dismissLedgerSpot, 16000);
  }

  /* ---------------------------------------------------------
     wiring
     --------------------------------------------------------- */
  function mount() {
    renderStageCopy();
    bindStageClicks();

    var close = $('chapter-dialogue-close');
    var scrim = $('chapter-dialogue-scrim');
    var next = $('chapter-dialogue-next');
    var bar = document.querySelector('.chapter-dialogue-bar');
    if (close)
      close.addEventListener('click', function (ev) {
        ev.stopPropagation();
        closeDialogue();
      });
    /* VN convention: a click anywhere in the scene advances. The X (or
       Esc) is the skip. */
    if (scrim) scrim.addEventListener('click', advanceDialogue);
    if (bar)
      bar.addEventListener('click', function (ev) {
        if (ev.target.closest && ev.target.closest('#chapter-dialogue-close')) return;
        if (ev.target.closest && ev.target.closest('#chapter-dialogue-next')) return;
        if (ev.target.closest && ev.target.closest('#chapter-dialogue-skiptut')) return;
        advanceDialogue();
      });
    if (next)
      next.addEventListener('click', function (ev) {
        /* renderDialogue rewrites this button's children. Without stopping
           here, a click that began on the old child can reach the bar as a
           now-detached target and evade its closest() guard, advancing a
           second line from the same gesture. */
        ev.stopPropagation();
        advanceDialogue();
      });

    /* Skip tutorial - one in the intro scene's footer, one riding the
       wayfinder bubble. Both end the SAME flow the same way. */
    var skipT = $('chapter-dialogue-skiptut');
    if (skipT)
      skipT.addEventListener('click', function (ev) {
        ev.stopPropagation();
        skipTutorial();
      });
    var gSkip = $('nav-guide-skip');
    if (gSkip)
      gSkip.addEventListener('click', function (ev) {
        ev.stopPropagation();
        skipTutorial();
      });

    document.addEventListener('keydown', function (event) {
      if (!dlg) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDialogue();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        advanceDialogue();
      }
    });

    /* the wayfinder's lock: swallow clicks on anything but the marked
       button while the guide is pointing (capture phase, so it wins
       against every button's own listener) */
    document.addEventListener('click', guideClickTrap, true);

    /* A rescale or window resize moves every anchor; re-seat whichever
       bubble is up. The wayfinder would self-heal on its 280ms tick,
       but a visible beat of drift reads as broken; the ledger
       spotlight has no tick at all and NEVER healed. applyScale()
       dispatches a synthetic resize after re-zooming, so this covers
       the in-game UI scale slider and real window changes alike. */
    window.addEventListener('resize', function () {
      var box = $('nav-guide');
      if (!box || box.hidden) return;
      var el = navGuide ? navGuide.lastEl : ledgerSpotEl;
      if (el) positionGuide(box, el);
    });

    /* A tap on the tutor's shield used to vanish without a trace -
       the first outside playtest stalled exactly there. Now the
       bubble shakes its head, pointing the eye at Continue. */
    var barkDismiss = $('rival-bark-dismiss');
    if (barkDismiss) barkDismiss.addEventListener('click', dismissReactiveBark);

    var tshield = $('tutor-shield');
    if (tshield)
      tshield.addEventListener('click', function () {
        var box = $('tutor');
        if (!box || box.hidden) return;
        box.classList.remove('deny');
        void box.offsetWidth;
        box.classList.add('deny');
        /* drop the class after it plays so a later re-show gets its
           normal rise animation back, not a replayed head-shake */
        window.setTimeout(function () {
          box.classList.remove('deny');
        }, 400);
      });

    document.addEventListener('eol:view', function (ev) {
      if (ev.detail === 'chapter') {
        updateStageCards();
        window.setTimeout(reofferPendingChoice, 120);
        /* An unopened Legend Pack appears as soon as the chapter map is
           back on screen. It is a campaign reward, never something the
           player should have to visit the Shop to discover. */
        window.setTimeout(reofferPendingLegend, 0);
        /* the one-time ledger introduction, once Gate I has fallen */
        window.setTimeout(maybeSpotLedger, 900);
      }
      /* the wayfinder re-points the moment the screen changes - the
         interval alone would lag a beat behind the veil */
      if (navGuide) guideTick();
      /* Leaving the battle view mid-fight (forfeit routing, home) must
         tear the bark watch down - the hook is a shared global slot. */
      if (ev.detail !== 'battle') {
        clearBattleWatch();
        hideBark();
      }
      /* And the tutor dies with the gate it narrates. */
      if (ev.detail !== 'prep' && ev.detail !== 'battle') {
        stopPrepTutor();
      }
    });

    /* The Tutorial corner button on the main menu replays the intro
       flow on demand; a fresh save gets it unprompted, once the boot
       veil has settled. */
    var tbtn = $('btn-corner-tutorial');
    if (tbtn) tbtn.addEventListener('click', runIntroTutorial);

    /* THE LEDGER - open/close, tabs, page selection */
    var lbtn = $('btn-ledger');
    if (lbtn) lbtn.addEventListener('click', openLedger);
    var lclose = $('ledger-close');
    if (lclose) lclose.addEventListener('click', closeLedger);
    var lscrim = $('ledger-scrim');
    if (lscrim) lscrim.addEventListener('click', closeLedger);
    var llist = $('ledger-list');
    if (llist)
      llist.addEventListener('click', function (ev) {
        var row = ev.target.closest && ev.target.closest('.lg-row');
        if (!row) return;
        ledgerSel = parseInt(row.dataset.lg, 10) || 1;
        renderLedger();
        if (window.EOL.audio) window.EOL.audio.campaign('page');
      });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && $('ledger') && !$('ledger').hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeLedger();
      }
    });

    window.setTimeout(maybeRunFirstBoot, 2100);
  }

  window.EOL.campaign = {
    openStageDialogue: openStageDialogue,
    openRecruiterDialogue: function () {
      openStageDialogue(1);
    },
    closeRecruiterDialogue: closeDialogue,
    closeDialogue: closeDialogue,
    dialogueOpen: function () {
      return !!dlg;
    },
    onBattleStart: onBattleStart,
    onBattleRound: onBattleRound,
    onScriptMove: onScriptMove,
    onScriptSay: onScriptSay,
    onScriptEnd: onScriptEnd,
    onScriptDeny: onScriptDeny,
    onPrepScriptDeny: onPrepScriptDeny,
    onPlayerAction: onPlayerAction,
    onBattleResult: onBattleResult,
    startTutorial: runIntroTutorial,
    skipTutorial: skipTutorial,
    openLedger: openLedger,
    closeLedger: closeLedger,
    onTellBreak: onTellBreak,
    retry: retry,
    consumeResult: consumeResult,
    updateStageCards: updateStageCards,
    getProgress: getProgress,
    story: STORY,
    /* test hooks */
    _entriesFor: entriesFor,
    _buildPool: buildPool,
    _launchStage: launchStage,
    _stageById: stageById,
    _recordClear: recordClear,
    _watchEvent: watchEvent,
    _battleWatch: function () {
      return battleWatch;
    },
    _navGuide: function () {
      return navGuide;
    },
  };

  /* The DCL race guard: with enough data files ahead of this one, the
     document can already be interactive by the time this script runs -
     a listener registered after the fact never fires, and the whole
     campaign UI silently fails to bind (found via the jsdom harness,
     but just as real on a slow network). */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
