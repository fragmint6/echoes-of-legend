(function () {
  'use strict';
  var KEY = 'eol.tutorial.done';

  var STEPS = [
    { id:'welcome', target:null, pos:'center',
      title:'Welcome to Echoes of Legend',
      body:'A card battler where myth meets tactics. This quick tour will show you the ropes.',
      nextLabel:'Begin' },
    { id:'play-btn', target:'#btn-play', pos:'below',
      title:'Click Play',
      body:'The <b>Play</b> button is where every battle begins. <b>Click it</b> to open the mode menu.',
      action:{nav:'play'} },
    { id:'campaign-mode', target:'#mode-campaign', pos:'right',
      title:'Click Campaign',
      body:'This is <b>Campaign</b>, a story-driven route across ten gates. <b>Click it</b> to see the chapter map.',
      action:{nav:'campaign'} },
    { id:'chapter-card', target:'#chapter-1', pos:'right',
      title:'Open Chapter 1',
      body:'A nameless Wayfarer crosses ten gates before the First Legend decides whether a story can continue. <b>Click the chapter card</b> to see the road ahead.',
      action:{nav:'chapter'} },
    { id:'gate-one', target:'#chapter-stage-1', pos:'right',
      title:'Gate I: The Recruiter',
      body:'Every gate is a rival you must defeat. <b>Click Gate I</b> to meet The Recruiter.',
      action:{nav:'chapter'} },
    { id:'done', target:null, pos:'center',
      title:'You Are Ready',
      body:'The road is yours. Build decks in the <b>Collection</b>, browse the <b>Rulebook</b>. Good luck, Wayfarer.',
      nextLabel:'Finish' },
  ];

  var overlay, highlight, dialog, titleEl, bodyEl, stepEl, prevBtn, nextBtn;
  var current = -1, active = false;

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function build() {
    overlay = document.createElement('div'); overlay.className = 'tut-overlay';
    highlight = document.createElement('div'); highlight.className = 'tut-highlight';
    dialog = document.createElement('div'); dialog.className = 'tut-dialog';
    dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','tut-title');

    var cb = document.createElement('button'); cb.className = 'tut-close'; cb.type = 'button';
    cb.setAttribute('aria-label','Skip tutorial'); cb.innerHTML = '<i class="ri-close-line"></i>';
    cb.addEventListener('click', end);

    titleEl = document.createElement('h3'); titleEl.id = 'tut-title'; titleEl.className = 'tut-title';
    bodyEl = document.createElement('p'); bodyEl.className = 'tut-body';
    stepEl = document.createElement('span'); stepEl.className = 'tut-step';

    var foot = document.createElement('div'); foot.className = 'tut-foot';
    prevBtn = document.createElement('button'); prevBtn.className = 'btn btn-ghost btn-slim tut-prev';
    prevBtn.type = 'button'; prevBtn.innerHTML = '<i class="ri-arrow-left-line"></i><span>Back</span>';
    prevBtn.addEventListener('click', back);
    nextBtn = document.createElement('button'); nextBtn.className = 'btn btn-primary btn-slim tut-next';
    nextBtn.type = 'button'; nextBtn.innerHTML = '<span>Next</span><i class="ri-arrow-right-line"></i>';
    nextBtn.addEventListener('click', advance);

    foot.appendChild(prevBtn); foot.appendChild(nextBtn);
    dialog.appendChild(cb); dialog.appendChild(titleEl); dialog.appendChild(bodyEl);
    dialog.appendChild(stepEl); dialog.appendChild(foot);
    overlay.appendChild(highlight); overlay.appendChild(dialog);

    /* Clicking the dark background (not the dialog) advances if it's a non-action step.
       Action steps: player must click the highlighted element. */
    overlay.addEventListener('click', function (e) {
      if (!active || current < 0) return;
      if (dialog.contains(e.target)) return; /* dialog buttons handled by their own listeners */
      var s = STEPS[current];
      if (s.target) {
        var tgt = document.querySelector(s.target);
        if (tgt && (tgt.contains(e.target) || tgt === e.target)) {
          /* Player clicked the right element — let it through, advance after */
          setTimeout(function () { if (active) showStep(current + 1); }, 500);
          return;
        }
      }
      /* Clicked nowhere useful. On non-action steps, allow background-click to advance.
         On action steps, do nothing — they must click the target. */
      if (!s.action) advance();
    });

    document.body.appendChild(overlay);
  }

  function positionHighlight(target) {
    if (!target) { highlight.style.display = 'none'; return; }
    highlight.style.display = '';
    var z = (window.EOL.scale && window.EOL.scale.factor()) || 1;
    var r = target.getBoundingClientRect(), pad = 8;
    highlight.style.left = Math.max(0, r.left / z - pad) + 'px';
    highlight.style.top = Math.max(0, r.top / z - pad) + 'px';
    highlight.style.width = r.width / z + pad * 2 + 'px';
    highlight.style.height = r.height / z + pad * 2 + 'px';
  }

  function showStep(i) {
    if (i < 0 || i >= STEPS.length) return;
    current = i; var s = STEPS[i];
    titleEl.innerHTML = esc(s.title); bodyEl.innerHTML = s.body;
    stepEl.textContent = (i + 1) + ' / ' + STEPS.length;
    prevBtn.style.visibility = i === 0 ? 'hidden' : '';
    var isLast = i === STEPS.length - 1;
    nextBtn.querySelector('span').textContent = s.nextLabel || (isLast ? 'Finish' : 'Next');
    nextBtn.querySelector('i').className = isLast ? 'ri-check-line' : 'ri-arrow-right-line';
    nextBtn.style.visibility = s.action ? 'hidden' : '';
    var target = s.target ? document.querySelector(s.target) : null;
    positionHighlight(target);
    dialog.classList.remove('tut-center','tut-below','tut-right','tut-left','tut-above');
    dialog.classList.add('tut-' + (s.pos || 'center'));
  }

  function advance() { if (current >= STEPS.length - 1) { end(); return; } showStep(current + 1); }
  function back() { if (current <= 0) return; showStep(current - 1); }

  function start() {
    if (active) return; if (!overlay) build(); active = true;
    overlay.classList.add('on'); document.body.classList.add('tut-active');
    showStep(0); document.addEventListener('keydown', onKey);
  }

  function end() {
    if (!active) return; active = false;
    overlay.classList.remove('on'); document.body.classList.remove('tut-active');
    document.removeEventListener('keydown', onKey);
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    if (window.EOL.ui && window.EOL.ui.show) window.EOL.ui.show('home');
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (!STEPS[current].action) advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  }

  window.EOL.tutorial = {
    start: start, end: end,
    isActive: function () { return active; },
    isDone: function () { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };
})();
