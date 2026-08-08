/* =============================================================
   Echoes of Legend — Universal Dialogue System
   -------------------------------------------------------------
   Reusable, future-proof dialogue engine used by:
   - Campaign stages
   - First-boot tutorial (Recruiter as teacher)
   - Future codex entries, rival taunts, etc.

   Usage:
   EOL.dialogue.open({
     speaker: "The Recruiter",
     lines: [ { text: "..." }, { text: "...", coach: true }, ... ],
     onComplete: function() { ... },
     onBattle: function() { ... }   // when a line has battle: true
   });
============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var modal, speakerEl, textEl, stepEl, nextBtn, closeBtn, scrim;
  var currentLines = [];
  var currentIndex = 0;
  var onCompleteCallback = null;
  var onBattleCallback = null;
  var isOpen = false;

  function $(id) { return document.getElementById(id); }

  function init() {
    modal    = $('chapter-dialogue');
    speakerEl = $('chapter-dialogue-speaker');
    textEl    = $('chapter-dialogue-text');
    stepEl    = $('chapter-dialogue-step');
    nextBtn   = $('chapter-dialogue-next');
    closeBtn  = $('chapter-dialogue-close');
    scrim     = $('chapter-dialogue-scrim');

    if (!modal) {
      console.warn('[Dialogue] #chapter-dialogue modal not found in DOM');
      return;
    }

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (scrim)    scrim.addEventListener('click', close);
    if (nextBtn)  nextBtn.addEventListener('click', advance);

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        advance();
      }
    });
  }

  function render() {
    if (!currentLines.length || currentIndex >= currentLines.length) return;

    var line = currentLines[currentIndex];

    if (speakerEl) speakerEl.textContent = line.speaker || 'Unknown';
    if (textEl)    textEl.textContent    = line.text || '';

    if (stepEl) {
      stepEl.textContent = (currentIndex + 1) + ' / ' + currentLines.length;
    }

    // Dynamic button text
    if (nextBtn) {
      if (line.battle) {
        nextBtn.innerHTML = '<i class="ra ra-crossed-swords"></i><span>Fight</span>';
      } else if (line.final) {
        nextBtn.innerHTML = '<span>Finish</span><i class="ri-check-line"></i>';
      } else if (line.coach) {
        nextBtn.innerHTML = '<span>Got it</span><i class="ri-check-line"></i>';
      } else {
        nextBtn.innerHTML = '<span>Continue</span><i class="ri-arrow-right-line"></i>';
      }
    }
  }

  function open(config) {
    if (!modal) init();
    if (!modal) return;

    currentLines       = config.lines || [];
    currentIndex       = 0;
    onCompleteCallback = config.onComplete || null;
    onBattleCallback   = config.onBattle || null;

    if (!currentLines.length) {
      console.warn('[Dialogue] No lines provided');
      return;
    }

    isOpen = true;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.dataset.dialogueOpen = '1';

    render();

    // Auto-focus next button
    setTimeout(function () {
      if (nextBtn) nextBtn.focus();
    }, 50);
  }

  function advance() {
    if (!currentLines.length) return;

    var line = currentLines[currentIndex];

    // Handle special line types
    if (line.battle && onBattleCallback) {
      close();
      onBattleCallback();
      return;
    }

    if (currentIndex < currentLines.length - 1) {
      currentIndex++;
      render();
      return;
    }

    // Final line
    close();

    if (onCompleteCallback) {
      onCompleteCallback();
    }
  }

  function close() {
    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.dataset.dialogueOpen = '0';
    isOpen = false;

    // Clear callbacks
    onCompleteCallback = null;
    onBattleCallback = null;
  }

  function isDialogueOpen() {
    return isOpen;
  }

  // Public API
  window.EOL.dialogue = {
    open: open,
    close: close,
    isOpen: isDialogueOpen,
    // Convenience for simple cases
    speak: function (speaker, lines, onDone) {
      var formatted = lines.map(function (l) {
        return typeof l === 'string' ? { speaker: speaker, text: l } : l;
      });
      open({ speaker: speaker, lines: formatted, onComplete: onDone });
    }
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();