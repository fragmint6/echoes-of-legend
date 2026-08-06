/* =============================================================
   Echoes of Legend - Tutorial
   -------------------------------------------------------------
   A linear walkthrough that locks the player through steps until
   they reach Chapter 1, Gate 1 (The Recruiter). Each step dims the
   background, highlights one element, and shows a dialogue box.
   Runs exactly once (localStorage flag). Esc / close button exits
   early; the player can restart from Settings.
   ============================================================= */
(function () {
  'use strict';

  var TUTORIAL_KEY = 'eol.tutorial.done';

  var STEPS = [
    {
      id: 'welcome',
      target: null,
      pos: 'center',
      title: 'Welcome to Echoes of Legend',
      body: 'A card battler where myth meets tactics. This quick tour will show you the ropes. Click <b>Next</b> to begin, or press Esc to skip.',
    },
    {
      id: 'play-btn',
      target: '#btn-play',
      pos: 'below',
      title: 'Start Here',
      body: 'The <b>Play</b> button is where every battle begins. Click it to choose your game mode: Classic, Draft, or Campaign.',
      action: 'click',
      nav: { view: 'home' },
    },
    {
      id: 'campaign-mode',
      target: '#mode-campaign',
      pos: 'right',
      title: 'Campaign Mode',
      body: 'This is the <b>Campaign</b>. A story-driven route across ten gates. Click it to see the chapter map.',
      action: 'click',
      nav: { view: 'play' },
    },
    {
      id: 'chapter-card',
      target: '#chapter-1',
      pos: 'right',
      title: 'Chapter 1: The Road of Echoes',
      body: 'A nameless Wayfarer crosses ten gates before the First Legend decides whether a story can continue. <b>Open the chapter</b> to see the road ahead.',
      action: 'click',
      nav: { view: 'campaign' },
    },
    {
      id: 'gate-one',
      target: '#chapter-stage-1',
      pos: 'right',
      title: 'Gate I: The Recruiter',
      body: 'Every gate is a rival you must defeat in a card battle. <b>Click this card</b> to meet The Recruiter, your first opponent. After this tutorial, come back here and start your first fight.',
      action: 'click',
      nav: { view: 'chapter' },
    },
    {
      id: 'done',
      target: null,
      pos: 'center',
      title: 'You Are Ready',
      body: 'The road is yours. Return to <b>Gate I</b> to fight The Recruiter. Build decks in the <b>Collection</b>, browse the <b>Rulebook</b>, and explore the <b>Campaign</b>. Good luck, Wayfarer.',
    },
  ];

  var overlay, highlight, dialog, titleEl, bodyEl, stepEl, prevBtn, nextBtn;
  var current = -1;
  var active = false;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'tut-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    highlight = document.createElement('div');
    highlight.className = 'tut-highlight';

    dialog = document.createElement('div');
    dialog.className = 'tut-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'tut-title');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'tut-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Skip tutorial');
    closeBtn.innerHTML = '<i class="ri-close-line"></i>';

    titleEl = document.createElement('h3');
    titleEl.id = 'tut-title';
    titleEl.className = 'tut-title';

    bodyEl = document.createElement('p');
    bodyEl.className = 'tut-body';

    stepEl = document.createElement('span');
    stepEl.className = 'tut-step';

    var foot = document.createElement('div');
    foot.className = 'tut-foot';

    prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn-ghost btn-slim tut-prev';
    prevBtn.type = 'button';
    prevBtn.innerHTML = '<i class="ri-arrow-left-line"></i><span>Back</span>';

    nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary btn-slim tut-next';
    nextBtn.type = 'button';
    nextBtn.innerHTML = '<span>Next</span><i class="ri-arrow-right-line"></i>';

    foot.appendChild(prevBtn);
    foot.appendChild(nextBtn);
    dialog.appendChild(closeBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(bodyEl);
    dialog.appendChild(stepEl);
    dialog.appendChild(foot);
    overlay.appendChild(highlight);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', end);
    nextBtn.addEventListener('click', advance);
    prevBtn.addEventListener('click', back);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) advance();
    });
  }

  function positionHighlight(target) {
    if (!target) {
      highlight.style.display = 'none';
      return;
    }
    highlight.style.display = '';
    var z = (window.EOL.scale && window.EOL.scale.factor()) || 1;
    var r = target.getBoundingClientRect();
    var pad = 8;
    highlight.style.left = Math.max(0, r.left / z - pad) + 'px';
    highlight.style.top = Math.max(0, r.top / z - pad) + 'px';
    highlight.style.width = r.width / z + pad * 2 + 'px';
    highlight.style.height = r.height / z + pad * 2 + 'px';
  }

  function showStep(i) {
    if (i < 0 || i >= STEPS.length) return;
    current = i;
    var s = STEPS[i];

    titleEl.innerHTML = esc(s.title);
    bodyEl.innerHTML = s.body;
    stepEl.textContent = (i + 1) + ' / ' + STEPS.length;
    prevBtn.style.visibility = i === 0 ? 'hidden' : '';
    nextBtn.querySelector('span').textContent = i === STEPS.length - 1 ? 'Finish' : 'Next';
    nextBtn.querySelector('i').className = i === STEPS.length - 1 ? 'ri-check-line' : 'ri-arrow-right-line';

    var target = s.target ? document.querySelector(s.target) : null;
    positionHighlight(target);

    dialog.classList.remove('tut-center', 'tut-below', 'tut-right', 'tut-left', 'tut-above');
    dialog.classList.add('tut-' + (s.pos || 'center'));
  }

  function advance() {
    if (current >= STEPS.length - 1) { end(); return; }
    var s = STEPS[current + 1];
    if (s.nav && window.EOL.ui && window.EOL.ui.show) {
      window.EOL.ui.show(s.nav.view);
      setTimeout(function () {
        showStep(current + 1);
        if (s.action === 'click' && s.target) {
          var el = document.querySelector(s.target);
          if (el) { el.classList.add('tut-pulse'); setTimeout(function () { el.classList.remove('tut-pulse'); }, 1200); }
        }
      }, 450);
    } else {
      showStep(current + 1);
    }
  }

  function back() {
    if (current <= 0) return;
    var s = STEPS[current - 1];
    if (s.nav && window.EOL.ui && window.EOL.ui.show) {
      window.EOL.ui.show(s.nav.view);
      setTimeout(function () { showStep(current - 1); }, 450);
    } else {
      showStep(current - 1);
    }
  }

  function start() {
    if (active) return;
    if (!overlay) build();
    active = true;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('on');
    document.body.classList.add('tut-active');
    showStep(0);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onActionClick, true);
  }

  function end() {
    if (!active) return;
    active = false;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('on');
    document.body.classList.remove('tut-active');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onActionClick, true);
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) {}
    if (window.EOL.ui && window.EOL.ui.show) window.EOL.ui.show('home');
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  }

  function onActionClick(e) {
    if (!active || current < 0) return;
    var s = STEPS[current];
    if (!s.action || !s.target) return;
    var tgt = document.querySelector(s.target);
    if (!tgt) return;
    if (tgt.contains(e.target) || tgt === e.target) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      advance();
    }
  }

  window.EOL.tutorial = {
    start: start,
    end: end,
    isDone: function () {
      try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (e) { return false; }
    },
    reset: function () {
      try { localStorage.removeItem(TUTORIAL_KEY); } catch (e) {}
    },
  };
})();
