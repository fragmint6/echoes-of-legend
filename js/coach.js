/* =============================================================
   Echoes of Legend — Non-Intrusive Coach / Tutorial System
   -------------------------------------------------------------
   Lightweight, non-blocking coach bubbles for step-by-step
   tutorials. The Recruiter teaches the player without hiding
   the UI.

   Usage:
   EOL.coach.startTutorial();           // first-boot guided experience
   EOL.coach.show({ text: "...", target: "#btn-play" });
============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var container;
  var currentStep = 0;
  var tutorialActive = false;

  function createContainer() {
    if (container) return container;

    container = document.createElement('div');
    container.id = 'coach-container';
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      max-width: 380px;
      font-family: var(--font-ui, system-ui);
    `;
    document.body.appendChild(container);
    return container;
  }

  function showCoach(config) {
    createContainer();

    // Remove any existing coach
    var existing = document.getElementById('coach-bubble');
    if (existing) existing.remove();

    var bubble = document.createElement('div');
    bubble.id = 'coach-bubble';
    bubble.style.cssText = `
      background: #1a140f;
      color: #f4e9d8;
      border: 2px solid #c9a26e;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.6);
      position: relative;
      margin-bottom: 12px;
    `;

    var speaker = config.speaker || "The Recruiter";
    var text = config.text || "";

    bubble.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <div style="width:32px; height:32px; background:#3a2a1f; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px;">
          <i class="ra ra-player" style="color:#c9a26e;"></i>
        </div>
        <div style="font-weight:600; color:#c9a26e; font-size:15px;">${speaker}</div>
      </div>
      <div style="line-height:1.45; font-size:15px;">${text}</div>
      <div style="margin-top:14px; display:flex; gap:8px; justify-content:flex-end;">
        ${config.showNext !== false ? 
          `<button id="coach-next" style="background:#c9a26e; color:#1a140f; border:none; padding:6px 16px; border-radius:6px; font-weight:600; cursor:pointer;">Continue</button>` : ''}
        ${config.showGotIt ? 
          `<button id="coach-gotit" style="background:transparent; color:#c9a26e; border:1px solid #c9a26e; padding:6px 14px; border-radius:6px; cursor:pointer;">Got it</button>` : ''}
      </div>
    `;

    container.appendChild(bubble);

    // Button handlers
    var nextBtn = bubble.querySelector('#coach-next');
    if (nextBtn && config.onNext) {
      nextBtn.onclick = function () {
        bubble.remove();
        config.onNext();
      };
    }

    var gotItBtn = bubble.querySelector('#coach-gotit');
    if (gotItBtn && config.onGotIt) {
      gotItBtn.onclick = function () {
        bubble.remove();
        config.onGotIt();
      };
    }

    return bubble;
  }

  function hideCoach() {
    var bubble = document.getElementById('coach-bubble');
    if (bubble) bubble.remove();
  }

  // ==================== FIRST-BOOT TUTORIAL ====================
  function startFirstBootTutorial() {
    if (localStorage.getItem('eol.tutorial.completed') === 'true') return;

    tutorialActive = true;
    currentStep = 0;

    // Step 0: Welcome
    showCoach({
      speaker: "The Recruiter",
      text: "Welcome to Echoes of Legend. Your Grimmwood deck is ready. I will teach you everything you need — step by step.",
      onNext: function () {
        // Step 1: Go to Play
        showCoach({
          speaker: "The Recruiter",
          text: "Click the big <b>Play</b> button to begin.",
          target: "#btn-play",
          onNext: function () {
            // Wait for the player to actually click Play
            waitForClick('#btn-play', function () {
              proceedToCampaignStep();
            });
          }
        });
      }
    });
  }

  function proceedToCampaignStep() {
    showCoach({
      speaker: "The Recruiter",
      text: "Now click <b>Campaign</b> — this is where your story begins.",
      onNext: function () {
        waitForClick('#mode-campaign, [data-view="campaign"]', function () {
          startRecruiterDialogue();
        });
      }
    });
  }

  function startRecruiterDialogue() {
    showCoach({
      speaker: "The Recruiter",
      text: "Click on <b>Gate I — The Recruiter</b> to speak with me.",
      onNext: function () {
        waitForClick('[data-campaign-stage="1"]', function () {
          // Now open the actual dialogue (we'll keep using the existing modal for story, but the tutorial is non-blocking)
          if (window.EOL.campaign && window.EOL.campaign.openStageDialogue) {
            window.EOL.campaign.openStageDialogue(1);
          }
          finishTutorialAfterBattle();
        });
      }
    });
  }

  function finishTutorialAfterBattle() {
    // This gets called from campaign.js after winning Stage 1
    showCoach({
      speaker: "The Recruiter",
      text: "You survived your first battle. You now understand energy, formation, and the basics. The tutorial is complete.",
      showGotIt: true,
      onGotIt: function () {
        localStorage.setItem('eol.tutorial.completed', 'true');
        tutorialActive = false;
        hideCoach();
      }
    });
  }

  function waitForClick(selector, callback) {
    var el = document.querySelector(selector);
    if (!el) {
      // If element doesn't exist yet, poll for it
      var interval = setInterval(function () {
        var found = document.querySelector(selector);
        if (found) {
          clearInterval(interval);
          found.addEventListener('click', function handler() {
            found.removeEventListener('click', handler);
            callback();
          }, { once: true });
        }
      }, 300);
      return;
    }

    el.addEventListener('click', function handler() {
      el.removeEventListener('click', handler);
      callback();
    }, { once: true });
  }

  // Public API
  window.EOL.coach = {
    show: showCoach,
    hide: hideCoach,
    startTutorial: startFirstBootTutorial,
    isActive: function () { return tutorialActive; }
  };

  // Auto-start on first boot (only if not completed)
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      if (localStorage.getItem('eol.tutorial.completed') !== 'true') {
        // Only start if we're on the home screen
        if (document.querySelector('[data-view="home"]') && !document.body.dataset.view) {
          // Don't auto-start immediately — wait for user to be ready
          // For now we expose the function so app.js can call it
        }
      }
    }, 1500);
  });

})();