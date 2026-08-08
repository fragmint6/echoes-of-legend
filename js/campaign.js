/* =============================================================
   Echoes of Legend — Campaign Chapter 1 System
   -------------------------------------------------------------
   Tier 1 narrative dialogue, stage progression state, and the
   full playable battle for Stage 1 (The Recruiter).
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};
  var STORY = window.EOL.campaignCh1 || {};
  var PROGRESS_KEY = 'eol.campaign.ch1.progress';
  var dialogueIndex = 0;
  var currentStage = 1;
  var currentLines = [];
  var isOpen = false;
  var activeCampaignStage = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(node, text) {
    if (node) node.textContent = text || '';
  }

  function stageLabel(stage) {
    return 'Stage ' + stage.id + ' · ' + stage.format;
  }

  function two(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function getProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.unlocked)) return parsed;
      }
    } catch (e) {
      /* private mode fallback */
    }
    return { cleared: [], unlocked: [1] };
  }

  function saveProgress(prog) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(prog));
    } catch (e) {}
  }

  function findCard(id) {
    var factions = window.EOL.factions || [];
    for (var i = 0; i < factions.length; i++) {
      var f = factions[i];
      for (var j = 0; j < f.cards.length; j++) {
        if (f.cards[j].id === id) return { card: f.cards[j], faction: f };
      }
    }
    return null;
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

      if (isCleared) {
        if (state) {
          state.innerHTML =
            '<i class="ri-checkbox-circle-fill" style="color:#8fe3b0"></i> Gate Cleared';
        }
        if (prompt) {
          prompt.innerHTML = '<i class="ra ra-speech-bubble"></i> Click to replay dialogue';
        }
      } else if (isUnlocked) {
        if (state) {
          state.innerHTML = '<i class="ri-lock-unlock-line" style="color:#ffd98a"></i> Open Gate';
        }
        if (prompt) {
          prompt.innerHTML = '<i class="ra ra-speech-bubble"></i> Click to enter dialogue';
        }
      } else {
        if (state) {
          state.innerHTML = '<i class="ri-lock-2-fill"></i> Locked';
        }
        if (prompt) {
          prompt.innerHTML = '<i class="ri-lock-2-line"></i> Gate Locked';
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

  function renderDialogue() {
    var line = currentLines[dialogueIndex];
    if (!line) return;
    setText($('chapter-dialogue-speaker'), line.speaker);
    setText($('chapter-dialogue-text'), line.text);
    setText($('chapter-dialogue-step'), two(dialogueIndex + 1) + ' / ' + two(currentLines.length));
    var next = $('chapter-dialogue-next');
    if (next) {
      if (line.battle) {
        var rivalName = (STORY.stages || []).filter(function(s){ return s.id === currentStage; })[0];
        next.innerHTML = '<i class="ra ra-crossed-swords"></i><span>Fight ' + (rivalName ? rivalName.rival : 'The Rival') + '</span>';
      } else if (line.final) {
        next.innerHTML = '<span>Close</span><i class="ri-check-line"></i>';
      } else {
        next.innerHTML = '<span>Continue</span><i class="ri-arrow-right-line"></i>';
      }
    }
  }

  function closeDialogue() {
    var modal = $('chapter-dialogue');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.dataset.campaignDialogue = '0';
    isOpen = false;
    /* The epilogue is an overlay on the settled battle screen; closing it
       by any route (X, scrim, Esc) must land on the chapter map, not
       strand the player on an ended board. */
    if (currentStage === -1) {
      activeCampaignStage = null;
      currentStage = 1;
      window.EOL.ui.show('chapter');
      return;
    }
    var opener = document.querySelector('[data-campaign-stage="' + currentStage + '"]');
    if (opener) opener.focus();
  }

  function openStageDialogue(stageId) {
    currentStage = stageId || 1;
    var dialogues = STORY.dialogues || {};
    currentLines = dialogues[currentStage] || STORY.recruiterDialogue || [];
    if (!currentLines.length) return;

    var modal = $('chapter-dialogue');
    if (!modal) return;

    dialogueIndex = 0;
    isOpen = true;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.dataset.campaignDialogue = '1';
    renderDialogue();
    window.setTimeout(function () {
      var next = $('chapter-dialogue-next');
      if (next) next.focus();
    }, 0);
  }

  /* The post-battle epilogue (a stage-1 victory). Runs through the same
     dialogue modal; on its final line the road returns to the chapter
     map so the player can see Gate II open. */
  function openEpilogue() {
    currentStage = -1; // sentinel: not a playable stage
    currentLines = STORY.epilogue || [];
    if (!currentLines.length) return;
    var modal = $('chapter-dialogue');
    if (!modal) return;
    dialogueIndex = 0;
    isOpen = true;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.dataset.campaignDialogue = '1';
    renderDialogue();
    window.setTimeout(function () {
      var next = $('chapter-dialogue-next');
      if (next) next.focus();
    }, 0);
  }

  function showRivalTaunt(stageId, text) {
    var taunt = $('rival-taunt');
    if (!taunt) return;
    var stage = (STORY.stages || []).filter(function (s) { return s.id === stageId; })[0];
    var portrait = $('rt-portrait');
    var nameEl = $('rt-name');
    var textEl = $('rt-text');
    if (portrait && stage) {
      var key = (stage.rival || '').toLowerCase().replace(/\s+/g, '-');
      portrait.src = 'assets/rivals/' + key + '.png';
      portrait.alt = stage.rival || '';
    }
    if (nameEl) nameEl.textContent = stage ? stage.rival : 'Rival';
    if (textEl) textEl.textContent = text || '';
    taunt.hidden = false;
    window.setTimeout(function () { if (taunt) taunt.hidden = true; }, 5000);
  }

  function hideRivalTaunt() {
    var taunt = $('rival-taunt');
    if (taunt) taunt.hidden = true;
  }

  function getStage(stageId) {
    var s = STORY.stages || [];
    for (var i = 0; i < s.length; i++) if (s[i].id === stageId) return s[i];
    return null;
  }

  function startStageBattle(stageId) {
    activeCampaignStage = stageId;
    var stage = getStage(stageId);
    if (!stage) return;
    if (window.EOL.play && window.EOL.play.openClassicModal) {
      window.EOL.play.openClassicModal(
        function (deckId) {
          var deck = deckId ? window.EOL.decks.get(deckId) : null;
          var starter = window.EOL.decks.get('starter-grimmwood');
          function grimmwoodEntries() {
            var fac = (window.EOL.factions || []).filter(function (f) { return f.id === 'grimmwood'; })[0];
            if (!fac || !fac.cards) return null;
            return fac.cards.map(function (c) { return { card: c, faction: fac }; });
          }
          var player12 = deck ? window.EOL.decks.entriesOf(deck) : (starter ? window.EOL.decks.entriesOf(starter) : grimmwoodEntries());
          var enemy12 = player12;
          if (stage && Array.isArray(stage.enemy12)) {
            enemy12 = [];
            stage.enemy12.forEach(function (id) {
              for (var f = 0; f < (window.EOL.factions || []).length; f++) {
                var fac = window.EOL.factions[f];
                for (var c = 0; c < (fac.cards || []).length; c++) {
                  if (fac.cards[c].id === id) { enemy12.push({ card: fac.cards[c], faction: fac }); break; }
                }
              }
            });
          } else if (starter && (stage.id === 1 || stage.id === 2 || stage.id === 3 || stage.id === 4)) {
            enemy12 = window.EOL.decks.entriesOf(starter);
          }
          var field = null;
          if (stage && stage.terrain) {
            var idMap = { 'colosseum':'colosseum','narrow-pass':'narrow-pass','open-plains':'open-plains','mana-spring':'mana-spring','energy-void':'energy-void','blood-battlefield':'blood-battlefield','spirit-world':'spirit-world',"the legend's trial":"legend's-trial","ancient-ruins":"ancient-ruins","mirror-realm":"mirror-realm" };
            var key = Object.keys(idMap).find(function (k) { return stage.terrain.toLowerCase().indexOf(k) !== -1 || stage.terrain.toLowerCase().indexOf(k.replace('-',' ')) !== -1; });
            if (key) field = (window.EOL.battlefieldById && window.EOL.battlefieldById(idMap[key])) || null;
          }
          var modal = document.getElementById('deck-modal');
          if (modal) { modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); }
          var mode = stage.mode || 'classic';
          var war = (mode === 'unabridged') ? 'set' : 'single';
          if (mode === 'draft') {
            if (window.EOL.play.startDraft) {
              window.EOL.play.startDraft({ seed: Math.random(), pool: stage.curatedPool ? stage.curatedPool.slice() : null });
            }
            showRivalTaunt(stageId, stage.talk || 'Every choice is a door.');
            return;
          }
          window.EOL.play.startPrep({
            mode: mode,
            deckId: deckId,
            player12: player12,
            enemy12: enemy12,
            field: field,
            campaignStage: stageId,
            warLength: war,
            oddFirst: 'player',
            botSix: stage.botSix ? stage.botSix.map(function (id) { var e = null; for (var f = 0; f < (window.EOL.factions || []).length; f++) { var fac = window.EOL.factions[f]; for (var c = 0; c < (fac.cards || []).length; c++) { if (fac.cards[c].id === id) { e = { card: fac.cards[c], faction: fac }; break; } } if (e) break; } return e; }) : null,
          });
          showRivalTaunt(stageId, stage.talk || 'Let us see what you bring this time.');
        },
        { isCampaign: true, hideRandom: true }
      );
    }
  }

  function startRecruiterFight() {
    startStageBattle(1);
  }

  function advanceDialogue() {
    if (!currentLines.length) return;
    var line = currentLines[dialogueIndex];
    if (dialogueIndex < currentLines.length - 1) {
      dialogueIndex++;
      renderDialogue();
      return;
    }

    closeDialogue();

    if (line && line.battle) {
      startStageBattle(currentStage);
      return;
    }
  }

  /* One pending campaign result, consumed by the result screen. Kept as
     state so battle.js/app.js can frame the buttons without campaign.js
     needing to reach into the result DOM itself. */
  var resultInfo = null;

  function onBattleResult(win) {
    resultInfo = null;
    if (activeCampaignStage) {
      var prog = getProgress();
      var cleared = prog.cleared || [];
      var unlocked = prog.unlocked || [1];
      if (win) {
        if (cleared.indexOf(activeCampaignStage) === -1) cleared.push(activeCampaignStage);
        if (unlocked.indexOf(activeCampaignStage + 1) === -1 && activeCampaignStage < 10) unlocked.push(activeCampaignStage + 1);
        saveProgress({ cleared: cleared, unlocked: unlocked });
        updateStageCards();
      }
      resultInfo = { stage: activeCampaignStage, won: win };
      return { campaign: true, won: win };
    }
    activeCampaignStage = null;
    return null;
  }

  /* The result screen's primary action: fight the gate again. Re-enters
     the Recruiter's flow (dialogue -> deck -> prep) fresh. */
  function retry(stageId) {
    resultInfo = null;
    activeCampaignStage = stageId || 1;
    currentStage = stageId || 1;
    window.EOL.ui.show('chapter');
    window.setTimeout(function () {
      openStageDialogue(currentStage);
    }, 60);
  }

  /* The result screen's secondary action. Returns true when the campaign
     consumed the click (opened the epilogue or routed to the map) so the
     generic home handler should stand down. */
  function consumeResult() {
    if (!resultInfo) return false;
    var r = resultInfo;
    resultInfo = null;
    activeCampaignStage = null;
    if (r.won && r.stage === 10) {
      openEpilogue();
    } else {
      currentStage = r.stage || 1;
      window.EOL.ui.show('chapter');
    }
    return true;
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

  function mount() {
    renderStageCopy();
    bindStageClicks();

    var close = $('chapter-dialogue-close');
    var scrim = $('chapter-dialogue-scrim');
    var next = $('chapter-dialogue-next');
    if (close) close.addEventListener('click', closeDialogue);
    if (scrim) scrim.addEventListener('click', closeDialogue);
    if (next) next.addEventListener('click', advanceDialogue);

    document.addEventListener('keydown', function (event) {
      if (!isOpen) return;
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
      }
    });
  }

  window.EOL.campaign = {
    openStageDialogue: openStageDialogue,
    openRecruiterDialogue: function () {
      openStageDialogue(1);
    },
    closeRecruiterDialogue: closeDialogue,
    dialogueOpen: function () {
      return isOpen;
    },
    onBattleResult: onBattleResult,
    retry: retry,
    consumeResult: consumeResult,
    updateStageCards: updateStageCards,
    story: STORY,
    showRivalTaunt: showRivalTaunt,
    hideRivalTaunt: hideRivalTaunt,
    startStageBattle: startStageBattle,
    getStage: getStage,
  };

  document.addEventListener('DOMContentLoaded', mount);
})();
