/* =============================================================
   Echoes of Legend — Campaign presentation
   -------------------------------------------------------------
   Narrative UI only. Stage progress/battles remain unimplemented, but
   Chapter 1 has canonical story text, the Recruiter's first conversation,
   and a truthful bridge to the seeded Grimmwood Classic deck.
   ============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};
  var STORY = window.EOL.campaignCh1 || {};
  var dialogueIndex = 0;
  var isOpen = false;

  function $(id) {
    return document.getElementById(id);
  }

  function setText(node, text) {
    if (node) node.textContent = text || '';
  }

  function stageLabel(stage) {
    return 'Stage ' + stage.id + ' · ' + stage.format;
  }

  /* The stage cards remain in markup so their locked state is legible before
     JS runs. Once mounted, this is the one source that owns their campaign
     language, preventing menu copy from drifting away from the chapter book. */
  function renderStageCopy() {
    (STORY.stages || []).forEach(function (stage) {
      var card = document.querySelector('[data-campaign-stage="' + stage.id + '"]');
      if (!card) return;
      setText(card.querySelector('.rival-kicker'), stageLabel(stage));
      setText(card.querySelector('.rival-name'), stage.rival);
      setText(card.querySelector('.rival-desc'), stage.line);
      var meta = card.querySelector('.rival-meta');
      if (meta) {
        var icon = meta.querySelector('i');
        meta.textContent = '';
        if (icon) meta.appendChild(icon);
        meta.appendChild(document.createTextNode(' ' + stage.terrain));
      }
      var lock = card.querySelector('.rival-lock');
      if (lock) {
        var lockIcon = lock.querySelector('i');
        lock.textContent = '';
        if (lockIcon) lock.appendChild(lockIcon);
        lock.appendChild(document.createTextNode(' ' + stage.lock));
      }
    });
  }

  function two(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function renderDialogue() {
    var lines = STORY.recruiterDialogue || [];
    var line = lines[dialogueIndex];
    if (!line) return;
    setText($('chapter-dialogue-speaker'), line.speaker);
    setText($('chapter-dialogue-text'), line.text);
    setText($('chapter-dialogue-step'), two(dialogueIndex + 1) + ' / ' + two(lines.length));
    var next = $('chapter-dialogue-next');
    if (next) {
      next.innerHTML = line.final
        ? '<i class="ra ra-book"></i><span>View Grimmwood deck</span>'
        : '<span>Continue</span><i class="ri-arrow-right-line"></i>';
    }
  }

  function closeRecruiterDialogue() {
    var modal = $('chapter-dialogue');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.dataset.campaignDialogue = '0';
    isOpen = false;
    var opener = $('chapter-stage-1');
    if (opener) opener.focus();
  }

  function openRecruiterDialogue() {
    var modal = $('chapter-dialogue');
    if (!modal || !(STORY.recruiterDialogue || []).length) return;
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

  function advanceRecruiterDialogue() {
    var lines = STORY.recruiterDialogue || [];
    if (!lines.length) return;
    if (dialogueIndex < lines.length - 1) {
      dialogueIndex++;
      renderDialogue();
      return;
    }
    closeRecruiterDialogue();
    /* The Recruiter's first encounter is Classic with the real starter
       deck, not a scripted fixed-six battle. The fight itself remains
       intentionally unbuilt; this final beat points the player at the
       deck that is already ready for it. */
    if (window.EOL.ui) window.EOL.ui.show('collection');
    window.setTimeout(function () {
      if (window.EOL.decks && window.EOL.decks.showTab) window.EOL.decks.showTab('decks');
    }, 0);
  }

  function mount() {
    renderStageCopy();
    var close = $('chapter-dialogue-close');
    var scrim = $('chapter-dialogue-scrim');
    var next = $('chapter-dialogue-next');
    if (close) close.addEventListener('click', closeRecruiterDialogue);
    if (scrim) scrim.addEventListener('click', closeRecruiterDialogue);
    if (next) next.addEventListener('click', advanceRecruiterDialogue);
    document.addEventListener('keydown', function (event) {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRecruiterDialogue();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        advanceRecruiterDialogue();
      }
    });
  }

  window.EOL.campaign = {
    openRecruiterDialogue: openRecruiterDialogue,
    closeRecruiterDialogue: closeRecruiterDialogue,
    dialogueOpen: function () {
      return isOpen;
    },
    story: STORY,
  };

  document.addEventListener('DOMContentLoaded', mount);
})();
