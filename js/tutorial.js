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
  var boundTarget = null, boundHandler = null;

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

    overlay.addEventListener('click', function (e) {
      if (!active || current < 0) return;
      if (dialog.contains(e.target)) return;
      var s = STEPS[current];
      if (!s.target) {
        advance();
        return;
      }
      // action step: only allow click when it's on the highlighted target
      var tgt = document.querySelector(s.target);
      if (!tgt) return;
      // figure out what's under the cursor by briefly hiding the overlay
      var x = e.clientX, y = e.clientY;
      var od = overlay.style.display, hd = highlight.style.display, dd = dialog.style.display;
      overlay.style.display = 'none';
      highlight.style.display = 'none';
      dialog.style.display = 'none';
      var under = document.elementFromPoint(x, y);
      overlay.style.display = od;
      highlight.style.display = hd;
      dialog.style.display = dd;
      if (under && (under === tgt || tgt.contains(under))) {
        // forward the click to the real element
        try { under.click(); } catch (ex) {}
        // advance is handled by boundHandler
        if (!boundTarget) {
          // fallback if no bound handler (race)
          setTimeout(function(){ if(active) showStep(current+1); }, 350);
        }
      }
      // else: click elsewhere is swallowed, do nothing
    });

    document.body.appendChild(overlay);
  }

  function cleanupTarget() {
    if (boundTarget && boundHandler) {
      try { boundTarget.removeEventListener('click', boundHandler); } catch (ex) {}
    }
    boundTarget = null; boundHandler = null;
  }

  function positionHighlight(target) {
    if (!target) { highlight.style.display = 'none'; return; }
    highlight.style.display = '';
    var z = (window.EOL.scale && window.EOL.scale.factor()) || 1;
    var r = target.getBoundingClientRect(), pad = 10;
    highlight.style.left = Math.max(0, r.left / z - pad) + 'px';
    highlight.style.top = Math.max(0, r.top / z - pad) + 'px';
    highlight.style.width = r.width / z + pad * 2 + 'px';
    highlight.style.height = r.height / z + pad * 2 + 'px';
    try {
      var cs = getComputedStyle(target);
      // copy the target's own radius so the highlight hugs its shape
      var br = cs.borderRadius;
      if (br && br !== '0px') {
        highlight.style.borderRadius = br;
      } else {
        highlight.style.borderRadius = '14px';
      }
      // if target is heavily pill-shaped (999px), expand radius a touch
      // to keep the gold border from clipping
      if (br && br.indexOf('999') > -1) {
        highlight.style.borderRadius = '999px';
      }
    } catch (e) {}
  }

  function showStep(i) {
    if (i < 0 || i >= STEPS.length) return;
    cleanupTarget();
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

    if (s.action && target) {
      overlay.style.pointerEvents = 'auto';
      highlight.style.pointerEvents = 'none';
      dialog.style.pointerEvents = 'auto';
      overlay.classList.add('has-target');

      boundTarget = target;
      boundHandler = function () {
        setTimeout(function () {
          if (!active) return;
          var nextIdx = current + 1;
          if (nextIdx >= STEPS.length) { end(); return; }
          var ns = STEPS[nextIdx];
          if (ns.target && !document.querySelector(ns.target)) {
            var retry = function () {
              document.removeEventListener('eol:view', retry);
              setTimeout(function () { if (active) showStep(nextIdx); }, 380);
            };
            document.addEventListener('eol:view', retry);
            setTimeout(function () { if (active && current === i) showStep(nextIdx); }, 750);
            return;
          }
          showStep(nextIdx);
        }, 360);
      };
      target.addEventListener('click', boundHandler, { once: true });
      highlight.classList.remove('tut-pulse'); void highlight.offsetWidth; highlight.classList.add('tut-pulse');
    } else {
      overlay.style.pointerEvents = 'auto';
      highlight.style.pointerEvents = 'none';
      dialog.style.pointerEvents = 'auto';
      overlay.classList.remove('has-target');
    }
  }

  function advance() { if (current >= STEPS.length - 1) { end(); return; } showStep(current + 1); }
  function back() { if (current <= 0) return; showStep(current - 1); }

  function onResize() {
    if (!active || current < 0) return;
    var s = STEPS[current];
    if (s.target) positionHighlight(document.querySelector(s.target));
  }

  function start() {
    if (active) return; if (!overlay) build(); active = true;
    overlay.classList.add('on'); document.body.classList.add('tut-active');
    showStep(0); document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
  }

  function end() {
    if (!active) return; active = false;
    cleanupTarget();
    overlay.classList.remove('on'); overlay.classList.remove('has-target');
    document.body.classList.remove('tut-active');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
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
