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
     §6  mid-fight lore is NON-BLOCKING (the bark widget is
         pointer-transparent and self-expiring; blocking overlays
         are for pre-fight and post-fight only)
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
  function buildPool(spec) {
    var featuredId = spec && spec.featured ? spec.featured : spec;
    if (spec && spec.cards && spec.cards.length) {
      var frozen = entriesFor(spec.cards);
      if (frozen.length === spec.cards.length) return frozen;
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
    return pool;
  }

  /* ---------------------------------------------------------
     Progress + the collection/currency store (§9.14).
     eol.campaign.ch1.progress:
       cleared   [stageIds]       unlocked  [stageIds]
       clears    {stageId: n}     per-stage clear counts (replay taper)
       grants    [cardIds]        tier-1 curriculum, applied on FIRST
                                  clear only (idempotent)
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
    };
  }
  function saveProgress(prog) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(prog));
    } catch (e) {
      /* private mode: the session still works, it just forgets */
    }
  }

  function recordClear(stage, prog) {
    prog = prog || getProgress();
    var first = prog.cleared.indexOf(stage.id) < 0;
    if (first) prog.cleared.push(stage.id);
    if (stage.id < 10 && prog.unlocked.indexOf(stage.id + 1) < 0) prog.unlocked.push(stage.id + 1);
    prog.clears[stage.id] = (prog.clears[stage.id] || 0) + 1;
    var g = stage.grants || {};
    if (first) {
      (g.cards || []).forEach(function (id) {
        if (prog.grants.indexOf(id) < 0) prog.grants.push(id);
      });
      prog.coins += g.coins || 0;
      if (g.choice) prog.pendingChoice = stage.id;
    } else {
      /* Replays pay a reduced, capped tier 2 only (§7.2). */
      prog.coins += Math.round((g.coins || 0) * 0.25);
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
        (dlg.kind === 'epilogue' ? ' <i class="ri-checkbox-circle-line kick-sep"></i> Cleared' : '');
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
    var next = $('chapter-dialogue-next');
    if (next) {
      if (line.battle) {
        next.innerHTML =
          '<i class="ra ra-crossed-swords"></i><span>Fight ' +
          (dlg.stage ? dlg.stage.rival : '') +
          '</span>';
      } else if (dlg.index >= dlg.lines.length - 1) {
        next.innerHTML = '<span>' + (dlg.kind === 'epilogue' ? 'Walk on' : 'Close') + '</span><i class="ri-check-line"></i>';
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
    document.body.dataset.campaignDialogue = '0';
    if (kind === 'epilogue') {
      /* The epilogue is an overlay on the settled battle screen; closing
         it by ANY route (X, scrim-skip, Esc) must continue the flow, not
         strand the player on an ended board. */
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
    var lines = (STORY.dialogues || {})[stage.id] || [];
    openDialogue(stage, lines, 'pre', null);
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
    activeCampaignStage = stage.id;
    if (stage.mode === 'draft') {
      launchDraft(stage);
      return;
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
      },
      {
        isCampaign: true,
        hideRandom: true,
        title: 'Choose your deck to face ' + stage.rival,
        sub:
          stage.mode === 'set'
            ? 'Unabridged: best of three on ' + stage.terrain + '. Substitutions are law - no retreat once it begins.'
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
        rival: rivalOf(stage),
      },
    });
  }

  /* ---------------------------------------------------------
     IN-BATTLE RIVAL DIALOGUE (barks)
     -------------------------------------------------------------
     A speech card front and centre under the HUD. It rides the
     engine's observational event hook - never gameplay logic - and
     self-expires, so it cannot fight the animation queue, the busy
     gate or the auto-end-turn timer (§6's standing rule against
     blocking mid-battle lore).

     Lines QUEUE: a burst of dialogue (the Recruiter's guided gate,
     a round beat landing on a death beat) plays in sequence rather
     than stomping itself. The queue drains only while the battle
     view is up, and dies with it.
     --------------------------------------------------------- */
  var BARK_GAP = 5200;
  var barkQ = [];
  var barkActive = false;
  var barkTimer = null;
  var barkWaits = 0;

  function barkMs(text) {
    /* reading time scales with the line; clamped so short quips snap
       and long lessons linger */
    return Math.max(3200, Math.min(8000, 2400 + text.length * 32));
  }

  function hideBark() {
    barkQ.length = 0;
    barkActive = false;
    barkWaits = 0;
    window.clearTimeout(barkTimer);
    var el = $('rival-bark');
    if (el) el.classList.remove('show');
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
    var b = barkQ.shift();
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
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth; // restart the slide-in
    el.classList.add('show');
    barkActive = true;
    window.clearTimeout(barkTimer);
    barkTimer = window.setTimeout(function () {
      el.classList.remove('show');
      barkActive = false;
      barkTimer = window.setTimeout(pumpBark, 380); // a breath between lines
    }, b.ms || barkMs(b.text));
  }

  function queueBark(stage, text, ms) {
    if (!text) return;
    if (barkQ.length > 7) return; // dialogue never piles into a backlog
    barkQ.push({ stage: stage, text: text, ms: ms || null });
    pumpBark();
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
        var left = aliveCount(B, 'enemy');
        if (left === 1) fireBark('foeLast', { force: true });
        else if (left <= 3) fireBark('foeHalf');
        else fireBark('foeDown', { chance: 0.4 });
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
    /* The opening line waits for the view swap + round banner. Set
       stages greet each game differently. The Recruiter's guided gate
       skips its generic opener - the round-1 lesson lines ARE its
       opening dialogue (see onBattleRound). */
    if (stage.tutorial && stage.tutorial.rounds && stage.tutorial.rounds[1]) {
      battleWatch.fired.start = true;
      return;
    }
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
  function onScriptEnd(B, reason) {
    if (!battleWatch) return;
    if (reason === 'desync') {
      /* the line broke (a balance patch moved a number) - the fight
         gracefully becomes a normal battle, and says so in character */
      queueBark(
        battleWatch.stage,
        'The Recruiter squints at his ledger. "The ink has moved. Fight it your own way, Blank - I will watch."'
      );
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
    if (shield) shield.hidden = !withNext || opts.shield === false;
    el.hidden = false;
  }

  function startPrepTutor(stage) {
    stopPrepTutor();
    if (!stage.tutorial) return;
    tut = { stage: stage, flags: {}, seq: null, timer: window.setInterval(tutorTick, 260) };
    tutorTick();
  }

  function stopPrepTutor() {
    if (!tut) return;
    window.clearInterval(tut.timer);
    tut = null;
    hideTutor();
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
         hoverable - no shield on either */
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
      var live = window.EOL.battle && window.EOL.battle.getState ? window.EOL.battle.getState() : null;
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
    resultInfo = { stage: stage.id, won: win };
    if (win) recordClear(stage);
    return {
      campaign: true,
      sub: win ? stage.resultWin : stage.resultLose,
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
  function choiceCandidates(stage, prog) {
    var g = stage.grants && stage.grants.choice;
    if (!g) return [];
    var dict = cardDict();
    var taken = {};
    (prog.grants || []).forEach(function (id) {
      taken[id] = true;
    });
    var out = [];
    (window.EOL.factions || []).forEach(function (f) {
      if ((g.factions || []).indexOf(f.id) < 0) return;
      f.cards.forEach(function (c) {
        if (!taken[c.id]) out.push(dict[c.id]);
      });
    });
    return out;
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
    var candidates = choiceCandidates(stage, prog);
    if (!candidates.length) {
      prog.pendingChoice = null;
      saveProgress(prog);
      done();
      return;
    }
    var picked = [];
    setText(
      $('grant-choice-sub'),
      stage.rival +
        ' offers a choice: take ' +
        g.count +
        ' echoes from the factions the road has taught. They will walk with you.'
    );
    var grid = $('grant-choice-grid');
    grid.innerHTML = '';
    var go = $('grant-choice-go');
    var sync = function () {
      go.disabled = picked.length !== g.count;
      go.querySelector('span').textContent =
        picked.length === g.count ? 'Carry them' : 'Choose ' + (g.count - picked.length) + ' more';
    };
    candidates.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'gc-tile rarity-' + e.card.rarity;
      b.style.setProperty('--fc', e.faction.colors.primary);
      b.innerHTML =
        '<i class="ra ' +
        e.card.icon +
        '"></i><span class="gc-name">' +
        (window.EOL.ui ? window.EOL.ui.esc(e.card.name) : e.card.name) +
        '</span><span class="gc-role">' +
        e.card.role +
        ' - ' +
        e.faction.name +
        '</span>';
      b.addEventListener('click', function () {
        var i = picked.indexOf(e.card.id);
        if (i >= 0) {
          picked.splice(i, 1);
          b.classList.remove('sel');
        } else {
          if (picked.length >= g.count) return;
          picked.push(e.card.id);
          b.classList.add('sel');
        }
        sync();
      });
      grid.appendChild(b);
    });
    sync();
    go.onclick = function () {
      if (picked.length !== g.count) return;
      var p2 = getProgress();
      picked.forEach(function (id) {
        if (p2.grants.indexOf(id) < 0) p2.grants.push(id);
      });
      p2.choices[stage.id] = picked.slice();
      if (p2.pendingChoice === stage.id) p2.pendingChoice = null;
      saveProgress(p2);
      modal.hidden = true;
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

  /* ---------------------------------------------------------
     CHAPTER MAP - stage card states and copy.
     --------------------------------------------------------- */
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

      if (isCleared) {
        if (state) {
          state.innerHTML =
            '<i class="ri-checkbox-circle-fill" style="color:#8fe3b0"></i> Gate Cleared';
        }
        if (prompt) {
          prompt.innerHTML = '<i class="ra ra-speech-bubble"></i> Click to walk the gate again';
        }
      } else if (isUnlocked) {
        if (state) {
          state.innerHTML = '<i class="ri-lock-unlock-line" style="color:#ffd98a"></i> Open Gate';
        }
        if (prompt) {
          prompt.innerHTML =
            '<i class="ra ra-speech-bubble"></i> Click to speak with ' + stage.rival;
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
        advanceDialogue();
      });
    if (next) next.addEventListener('click', advanceDialogue);

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

    document.addEventListener('eol:view', function (ev) {
      if (ev.detail === 'chapter') {
        updateStageCards();
        window.setTimeout(reofferPendingChoice, 400);
      }
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
    onBattleResult: onBattleResult,
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
    _watchEvent: watchEvent,
    _battleWatch: function () {
      return battleWatch;
    },
  };

  document.addEventListener('DOMContentLoaded', mount);
})();
