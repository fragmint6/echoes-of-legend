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
        next.innerHTML = '<i class="ra ra-crossed-swords"></i><span>Fight The Recruiter</span>';
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

  function startRecruiterFight() {
    activeCampaignStage = 1;
    if (window.EOL.play && window.EOL.play.openClassicModal) {
      window.EOL.play.openClassicModal(
        function (deckId) {
          var deck = deckId ? window.EOL.decks.get(deckId) : null;
          var starter = window.EOL.decks.get('starter-grimmwood');
          var player12 = deck
            ? window.EOL.decks.entriesOf(deck)
            : starter
              ? window.EOL.decks.entriesOf(starter)
              : null;

          var recruiter12 = starter ? window.EOL.decks.entriesOf(starter) : player12;
          var colosseum =
            (window.EOL.battlefieldById && window.EOL.battlefieldById('colosseum')) || null;

          var modal = document.getElementById('deck-modal');
          if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
          }

          window.EOL.play.startPrep({
            mode: 'classic',
            deckId: deckId,
            player12: player12,
            enemy12: recruiter12,
            field: colosseum,
            campaignStage: 1,
            warLength: 'single',
          });
        },
        { isCampaign: true, hideRandom: true }
      );
    }
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

    if (line && line.battle && currentStage === 1) {
      startRecruiterFight();
    }
  }

  function onBattleResult(win) {
    if (activeCampaignStage === 1 && win) {
      var prog = getProgress();
      var cleared = prog.cleared || [];
      var unlocked = prog.unlocked || [1];

      if (cleared.indexOf(1) === -1) cleared.push(1);
      if (unlocked.indexOf(2) === -1) unlocked.push(2);

      saveProgress({ cleared: cleared, unlocked: unlocked });
      updateStageCards();
    }
    activeCampaignStage = null;
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
    updateStageCards: updateStageCards,
    story: STORY,
  };

  document.addEventListener('DOMContentLoaded', mount);
})();
