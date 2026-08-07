(function () {
  'use strict';
  var KEY = 'eol.tutorial.done';

  var STEPS = [
    { id:'welcome', target:null, pos:'center',
      title:'Welcome to Echoes of Legend',
      body:'A card battler where myth meets tactics. This quick tour will take you from the menu all the way into your first gate.',
      nextLabel:'Begin' },
    { id:'play-btn', target:'#btn-play', pos:'below',
      title:'Play is where it starts',
      body:'The <b>Play</b> button is the doorway to every battle. <b>Click the highlighted Play button</b>. Hover, pointer and clicks all work — only that button is alive right now.',
      action:true },
    { id:'campaign-mode', target:'#mode-campaign', pos:'right',
      title:'Take the Campaign road',
      body:'This is <b>Campaign</b>, ten gates before Gilgamesh judges your story. <b>Click Campaign</b>.',
      action:true },
    { id:'chapter-card', target:'#chapter-1', pos:'right',
      title:'Open Chapter 1',
      body:'<b>The Road of Echoes</b> — a nameless Wayfarer walks between memory and the Quiet. <b>Click the chapter plate</b>.',
      action:true },
    { id:'gate-one', target:'#chapter-stage-1', pos:'right',
      title:'Gate I: The Recruiter',
      body:'Every gate is a rival. <b>Click Gate I</b> to meet the old broker. He will test whether your story can last.',
      action:true },
    { id:'recruiter-dialogue', target:'#chapter-dialogue-next', pos:'below',
      title:'Listen, then answer',
      body:'The Recruiter speaks in 6 beats. <b>Keep clicking the highlighted Continue button</b>. On the last beat it becomes <b>Fight The Recruiter</b> — click it to choose your deck.',
      action:true },
    { id:'deck-pick', target:'#dm-list .dm-row:not(.disabled)', pos:'right',
      title:'Choose your twelve',
      body:'Pick a saved deck of 12. For your first fight, any complete deck works. <b>Click the highlighted deck row</b>.',
      action:true },
    { id:'ban-enemy', target:'#prep-enemy .pcard', pos:'right',
      title:'Ban the enemy',
      body:'You and the enemy ban 2 each, hidden from each other. <b>Click two enemy legends to ban them</b>. The overlay will stay locked to the ban zone until you have two.',
      action:false, // special handling: need 2 clicks, so not auto-advance on first click
      nextLabel:'I banned 2' },
    { id:'confirm-bans', target:'#prep-confirm-main', pos:'above',
      title:'Lock your bans',
      body:'Once you have 2 marked, <b>click Confirm bans</b>. Both sides reveal at once.',
      action:true },
    { id:'field-pick', target:'#prep-player .pcard', pos:'right',
      title:'Field your six',
      body:'Now pick 6 of your surviving 10. Tanks like front row. <b>Click legends in Your Deck to add them to Front/Back</b>. Tap a slotted legend to swap rows. Fill to 6.',
      action:false,
      nextLabel:'My six is ready' },
    { id:'field-go', target:'#prep-confirm', pos:'above',
      title:'To battle',
      body:'Front soaks, back supports. When you have 6, <b>click To battle</b>. The Colosseum awaits.',
      action:true },
    { id:'battle-intro', target:null, pos:'center',
      title:'Welcome to the arena',
      body:'This is The Recruiter — starter deck, same 12 you have. <b>Round 1 is Basics only</b>, Signatures unlock Round 2. Energy carries over up to 150. Your turn is timed but gentle.',
      nextLabel:'Got it' },
    { id:'battle-help', target:'#grid-player .bcell-wrap', pos:'right',
      title:'Your team — hover works',
      body:'<b>Hover any card</b> — the hero panel slides out beside it, no dim, fully interactive. <b>Click your hero</b> to see Skills, then click an <b>active Skill</b> and a target. The tutorial highlight follows the card shape exactly.',
      action:false,
      nextLabel:'Continue' },
    { id:'done', target:null, pos:'center',
      title:'You are on the Road',
      body:'You’ve walked from menu to gate to battle. The tutorial will pop hints occasionally (energy, passing, frontline). Good luck, Wayfarer — make the story last.',
      nextLabel:'Finish' },
  ];

  var overlay, highlight, dialog, titleEl, bodyEl, stepEl, prevBtn, nextBtn;
  var blockers = {}; // top, bottom, left, right
  var current = -1, active = false;
  var boundTarget = null, boundHandler = null;

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function build() {
    overlay = document.createElement('div'); overlay.className = 'tut-overlay';
    // blockers that surround the hole — only these block interaction outside
    ['top','bottom','left','right'].forEach(function (k) {
      var b = document.createElement('div');
      b.className = 'tut-blocker b-' + k;
      b.setAttribute('aria-hidden','true');
      overlay.appendChild(b);
      blockers[k] = b;
    });
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

    // background click for no-target steps advances
    overlay.addEventListener('click', function (e) {
      if (!active || current < 0) return;
      if (dialog.contains(e.target)) return;
      var s = STEPS[current];
      if (!s.target) { advance(); return; }
      // has-target: blockers already block outside, so clicks here mean inside hole?
      // If user clicked directly on blocker, do nothing. If clicked in hole, let target receive it naturally (pointer-events none on overlay).
      // This handler only catches clicks on overlay itself (hole area without target?) — ignore.
    });

    document.body.appendChild(overlay);
  }

  function cleanupTarget() {
    if (boundTarget && boundHandler) {
      try { boundTarget.removeEventListener('click', boundHandler); } catch (ex) {}
    }
    boundTarget = null; boundHandler = null;
    // clear elevated styles
    var prev = document.querySelectorAll('.tut-elevated');
    prev.forEach(function (el) {
      el.classList.remove('tut-elevated');
      el.style.removeProperty('z-index');
      el.style.removeProperty('position');
    });
  }

  function getScale() {
    return (window.EOL.scale && window.EOL.scale.factor()) || 1;
  }

  function getTarget(selector) {
    if (!selector) return null;
    try {
      // first matching visible element
      var all = document.querySelectorAll(selector);
      for (var i=0;i<all.length;i++) {
        var el = all[i];
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
      }
      return document.querySelector(selector);
    } catch (e) { return null; }
  }

  function positionHighlight(target) {
    var z = getScale();
    var vw = window.innerWidth / z;
    var vh = window.innerHeight / z;
    if (!target) {
      highlight.style.display = 'none';
      Object.values(blockers).forEach(function (b) { b.style.display = 'none'; });
      overlay.classList.remove('has-target');
      overlay.classList.add('no-target');
      return;
    }
    var r = target.getBoundingClientRect();
    var pad = 10;
    var left = r.left / z - pad;
    var top = r.top / z - pad;
    var width = r.width / z + pad*2;
    var height = r.height / z + pad*2;

    highlight.style.display = '';
    highlight.style.left = Math.max(0, left) + 'px';
    highlight.style.top = Math.max(0, top) + 'px';
    highlight.style.width = width + 'px';
    highlight.style.height = height + 'px';

    // shape-matching border radius
    try {
      var cs = getComputedStyle(target);
      var br = cs.borderRadius;
      if (!br || br === '0px') br = '14px';
      // if pill, keep pill
      if (br.indexOf('999') > -1) {
        highlight.style.borderRadius = '999px';
      } else {
        // add pad to each radius value
        // handle single value like "16px" -> "26px"
        // handle "50%" -> keep 50%
        if (br.indexOf('%') > -1) {
          // circular avatar
          highlight.style.borderRadius = br;
        } else {
          // try to parse first number
          var num = parseFloat(br);
          if (!isNaN(num)) {
            highlight.style.borderRadius = (num + pad) + 'px';
          } else {
            highlight.style.borderRadius = br;
          }
        }
      }
    } catch (e) {
      highlight.style.borderRadius = '14px';
    }

    // blockers around hole — no dim, just transparent click-blockers
    // top
    blockers.top.style.display = '';
    blockers.top.style.left = '0px';
    blockers.top.style.top = '0px';
    blockers.top.style.width = '100%';
    blockers.top.style.height = Math.max(0, top) + 'px';

    // bottom
    blockers.bottom.style.display = '';
    blockers.bottom.style.left = '0px';
    blockers.bottom.style.top = (top + height) + 'px';
    blockers.bottom.style.width = '100%';
    blockers.bottom.style.height = Math.max(0, vh - (top + height)) + 'px';

    // left
    blockers.left.style.display = '';
    blockers.left.style.left = '0px';
    blockers.left.style.top = Math.max(0, top) + 'px';
    blockers.left.style.width = Math.max(0, left) + 'px';
    blockers.left.style.height = height + 'px';

    // right
    blockers.right.style.display = '';
    blockers.right.style.left = (left + width) + 'px';
    blockers.right.style.top = Math.max(0, top) + 'px';
    blockers.right.style.width = Math.max(0, vw - (left + width)) + 'px';
    blockers.right.style.height = height + 'px';

    overlay.classList.add('has-target');
    overlay.classList.remove('no-target');
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
    // hide Next for pure action steps where we want them to click target
    nextBtn.style.visibility = s.action ? 'hidden' : '';

    var target = getTarget(s.target);
    positionHighlight(target);
    dialog.classList.remove('tut-center','tut-below','tut-right','tut-left','tut-above');
    dialog.classList.add('tut-' + (s.pos || 'center'));

    if (s.target && target) {
      // elevate target slightly so hover/pointer works - blockers surround hole, highlight is pointer-events none
      target.classList.add('tut-elevated');
      var cs = getComputedStyle(target);
      if (cs.position === 'static') target.style.position = 'relative';

      if (s.action) {
        boundTarget = target;
        boundHandler = function () {
          setTimeout(function () {
            if (!active) return;
            var nextIdx = current + 1;
            if (nextIdx >= STEPS.length) { end(); return; }
            var ns = STEPS[nextIdx];
            if (ns.target && !getTarget(ns.target)) {
              var retry = function () {
                document.removeEventListener('eol:view', retry);
                setTimeout(function () { if (active) showStep(nextIdx); }, 380);
              };
              document.addEventListener('eol:view', retry);
              setTimeout(function () { if (active && current === i) showStep(nextIdx); }, 800);
              return;
            }
            showStep(nextIdx);
          }, 360);
        };
        target.addEventListener('click', boundHandler, { once: true });
      }
      highlight.classList.remove('tut-pulse'); void highlight.offsetWidth; highlight.classList.add('tut-pulse');
    } else if (s.target && !target) {
      // target not yet in DOM — wait for view change
      var retry2 = function () {
        document.removeEventListener('eol:view', retry2);
        setTimeout(function () { if (active) showStep(i); }, 380);
      };
      document.addEventListener('eol:view', retry2);
      setTimeout(function () { if (active && current === i) showStep(i); }, 900);
    }
  }

  function advance() { if (current >= STEPS.length - 1) { end(); return; } showStep(current + 1); }
  function back() { if (current <= 0) return; showStep(current - 1); }

  function onResize() {
    if (!active || current < 0) return;
    var s = STEPS[current];
    if (s.target) positionHighlight(getTarget(s.target));
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
    overlay.classList.remove('on','has-target','no-target');
    document.body.classList.remove('tut-active');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (!STEPS[current] || !STEPS[current].action) advance(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  }

  window.EOL.tutorial = {
    start: start, end: end,
    isActive: function () { return active; },
    isDone: function () { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };
})();
