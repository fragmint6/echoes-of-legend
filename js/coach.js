/* =============================================================
   Echoes of Legend — Recruiter Coach / Tutorial System
   -------------------------------------------------------------
   Large, beautiful, non-intrusive coach panel used for the
   first-boot tutorial. The Recruiter has a big portrait area
   and the panel is prominent but does not block the whole screen.

   The tutorial properly leads the player into Gate I battle.
============================================================= */
(function () {
  'use strict';

  window.EOL = window.EOL || {};

  var container;
  var tutorialActive = false;

  function createContainer() {
    if (container) return container;

    container = document.createElement('div');
    container.id = 'coach-container';
    container.style.cssText = `
      position: fixed;
      bottom: 32px;
      right: 32px;
      z-index: 10000;
      width: 420px;
      max-width: 92vw;
      font-family: var(--font-ui, system-ui);
    `;
    document.body.appendChild(container);
    return container;
  }

  function showCoach(config) {
    createContainer();

    // Remove existing
    var existing = document.getElementById('coach-bubble');
    if (existing) existing.remove();

    var bubble = document.createElement('div');
    bubble.id = 'coach-bubble';
    bubble.style.cssText = `
      background: #1a140f;
      color: #f4e9d8;
      border: 4px solid #c9a26e;
      border-radius: 18px;
      box-shadow: 0 16px 50px rgba(0,0,0,0.8);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-size: 17px;
    `;

    var speaker = config.speaker || "The Recruiter";
    var text = config.text || "";

    bubble.innerHTML = `
      <div style="display:flex; background:#2a2118; padding:14px 18px; align-items:center; gap:14px; border-bottom:3px solid #c9a26e;">
        <!-- Recruiter Portrait -->
        <div style="width:86px; height:86px; border-radius:14px; overflow:hidden; border:3px solid #c9a26e; flex-shrink:0; background:#3a2a1f; box-shadow: 0 0 0 4px #1a140f;">
          <img src="assets/rivals/the-recruiter.png" 
               style="width:100%; height:100%; object-fit:cover; display:block;" 
               alt="The Recruiter">
        </div>
        
        <div style="flex:1; min-width:0;">
          <div style="font-weight:800; color:#c9a26e; font-size:21px; line-height:1;">${speaker}</div>
          <div style="font-size:13px; opacity:0.75; margin-top:4px;">Your guide on the Road of Echoes</div>
        </div>
      </div>

      <div style="padding:22px 26px; font-size:17.5px; line-height:1.55;">
        ${text}
      </div>

      <div style="padding:16px 20px; background:#2a2118; display:flex; gap:12px; justify-content:flex-end; border-top:2px solid #5c4630;">
        ${config.showNext !== false ? 
          `<button id="coach-next" style="background:#c9a26e; color:#1a140f; border:none; padding:10px 26px; border-radius:9px; font-weight:800; font-size:16px; cursor:pointer;">Continue</button>` : ''}
        ${config.showGotIt ? 
          `<button id="coach-gotit" style="background:transparent; color:#c9a26e; border:3px solid #c9a26e; padding:10px 24px; border-radius:9px; font-weight:700; cursor:pointer;">Got it</button>` : ''}
      </div>
    `;

    container.appendChild(bubble);

    var nextBtn = bubble.querySelector('#coach-next');
    if (nextBtn && config.onNext) {
      nextBtn.onclick = () => {
        bubble.remove();
        config.onNext();
      };
    }

    var gotItBtn = bubble.querySelector('#coach-gotit');
    if (gotItBtn && config.onGotIt) {
      gotItBtn.onclick = () => {
        bubble.remove();
        config.onGotIt();
      };
    }

    return bubble;
  }

  function hideCoach() {
    var b = document.getElementById('coach-bubble');
    if (b) b.remove();
  }

  // ==================== FIRST-BOOT TUTORIAL ====================
  function startFirstBootTutorial() {
    if (localStorage.getItem('eol.tutorial.completed') === 'true') return;

    tutorialActive = true;

    showCoach({
      speaker: "The Recruiter",
      text: "Welcome to Echoes of Legend. Your Grimmwood deck is ready. I will teach you everything you need — step by step.",
      onNext: () => {
        showCoach({
          speaker: "The Recruiter",
          text: "Click the big <b>Play</b> button.",
          onNext: () => {
            waitForClick('#btn-play', () => {
              showCoach({
                speaker: "The Recruiter",
                text: "Now click <b>Campaign</b>.",
                onNext: () => {
                  waitForClick('#mode-campaign, button[id*="campaign"]', () => {
                    showCoach({
                      speaker: "The Recruiter",
                      text: "Click <b>Gate I — The Recruiter</b> to begin your first story.",
                      onNext: () => {
                        waitForClick('[data-campaign-stage="1"]', () => {
                          // Open the real campaign dialogue
                          if (window.EOL.campaign && window.EOL.campaign.openStageDialogue) {
                            window.EOL.campaign.openStageDialogue(1);
                          }
                          // The tutorial will finish after the player wins the battle
                          // (handled in campaign.js via onBattleResult)
                        });
                      }
                    });
                  });
                }
              });
            });
          }
        });
      }
    });
  }

  function waitForClick(selector, callback) {
    function tryAttach() {
      const el = document.querySelector(selector);
      if (!el) {
        setTimeout(tryAttach, 250);
        return;
      }
      el.addEventListener('click', function handler() {
        el.removeEventListener('click', handler);
        callback();
      }, { once: true });
    }
    tryAttach();
  }

  // Called from campaign.js after winning Stage 1
  function completeTutorialAfterVictory() {
    if (!tutorialActive) return;

    showCoach({
      speaker: "The Recruiter",
      text: "You survived your first battle. You now understand energy, formation, and the core rules. The tutorial is complete.",
      showGotIt: true,
      onGotIt: () => {
        localStorage.setItem('eol.tutorial.completed', 'true');
        tutorialActive = false;
        hideCoach();
      }
    });
  }

  // Allow replaying the tutorial from the corner button
  function replayTutorial() {
    // Temporarily allow replay even if completed
    var wasCompleted = localStorage.getItem('eol.tutorial.completed') === 'true';
    if (wasCompleted) {
      localStorage.removeItem('eol.tutorial.completed');
    }
    tutorialActive = true;
    startFirstBootTutorial();
  }

  window.EOL.coach = {
    show: showCoach,
    hide: hideCoach,
    startTutorial: startFirstBootTutorial,
    replayTutorial: replayTutorial,
    completeAfterVictory: completeTutorialAfterVictory,
    isActive: () => tutorialActive
  };

  // Wire up the top-left Tutorial button
  document.addEventListener('DOMContentLoaded', function () {
    var tutorialBtn = document.getElementById('btn-corner-tutorial');
    if (tutorialBtn) {
      tutorialBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.EOL.coach && window.EOL.coach.replayTutorial) {
          window.EOL.coach.replayTutorial();
        }
      });
    }
  });

})();