(function () {
  'use strict';
  var KEY = 'eol.tutorial.done';

  /* Tutorial v3: dim overlay (lighter) + elevated target layered OVER dim.
     - Overlay is full-screen rgba(2,3,10,0.38) + blur 4px (main effect blur)
     - No hole cutout: target sits above dim via z-index 8001
     - Dialog has arrow pointing at target
     - Full flow must be completable without hiccups
  */

  var STEPS = [
    { id:'welcome', target:null, pos:'center',
      title:'Welcome to Echoes of Legend',
      body:'I will walk you from menu to your first real gate. The world dims, but only the pointed thing and this box are alive.',
      nextLabel:'Begin' },
    { id:'play-btn', target:'#btn-play', pos:'auto',
      title:'Play',
      body:'Every battle starts here. Click the highlighted Play button — it floats above the dim.',
      action:true },
    { id:'campaign-mode', target:'#mode-campaign', pos:'auto',
      title:'Campaign',
      body:'Ten gates before Gilgamesh judges if your story can last. Click Campaign.',
      action:true },
    { id:'chapter-card', target:'#chapter-1', pos:'auto',
      title:'Chapter 1: The Road of Echoes',
      body:'This is where unfinished stories learn to continue. Click the chapter plate.',
      action:true },
    { id:'gate-one', target:'#chapter-stage-1', pos:'auto',
      title:'Gate I — The Recruiter',
      body:'First gate is open. Click it to meet the broker who will give you your first deck.',
      action:true },
    { id:'recruiter-dialogue', target:'#chapter-dialogue-next', pos:'auto',
      title:'Listen to The Recruiter',
      body:'He speaks in 6 beats. Keep clicking Continue. Last beat becomes Fight — click it when it appears. The dialog sits above the dim, never covering the button.',
      action:true },

    { id:'deck-unlock', target:null, pos:'center',
      title:'A gift for the road',
      body:'The Recruiter slides a satchel across the table. You receive the Grimmwood starter — 12 legends from the dark woods.',
      nextLabel:'Show me',
      onEnter: function (next) {
        try {
          if (window.EOL.decks && window.EOL.decks.seedGrimmwoodStarter) {
            window.EOL.decks.seedGrimmwoodStarter();
          }
        } catch(e){}
        showDeckReward(function(){ next(); });
      }
    },

    { id:'collection-intro', target:null, pos:'center',
      title:'Your collection',
      body:'Decks are your squads of 12. I will take you to Collection to see Grimmwood and the builder.',
      nextLabel:'To Collection',
      onEnter: function (next) {
        // navigate with veil-aware delay
        if (window.EOL.ui && window.EOL.ui.show) window.EOL.ui.show('collection');
        // wait longer than veil (560+720) to ensure view ready
        setTimeout(next, 1450);
      }
    },

    { id:'collection-decks-tab', target:'#ctab-decks', pos:'auto',
      title:'Decks tab',
      body:'Legends are the codex. Decks are your squads. Click the highlighted Decks tab.',
      action:true },

    { id:'collection-deck-row', target:'#decks-list .deck-card', pos:'auto',
      title:'Grimmwood starter',
      body:'There it is — 12 Grimmwood legends. Click it to open the builder.',
      action:true,
      // wait helper: if deck-cards not yet rendered, poll
      waitFor: true },

    { id:'deck-builder', target:'#deck-slots-12', pos:'auto',
      title:'The deck builder',
      body:'Your Twelve on top — order does not matter. Below is the whole roster. When done, click Done.',
      action:false,
      nextLabel:'Got it' },

    { id:'deck-builder-save', target:'#btn-deck-save', pos:'auto',
      title:'Save and return',
      body:'Builder autosaves. Click Done to return to Collection.',
      action:true },

    { id:'back-to-chapter', target:null, pos:'center',
      title:'Back to the Road',
      body:'Nice. You now know where decks live. Back to Chapter 1 to face The Recruiter.',
      nextLabel:'Back to gates',
      onEnter: function (next) {
        if (window.EOL.ui && window.EOL.ui.show) window.EOL.ui.show('chapter');
        setTimeout(next, 1450);
      }
    },

    { id:'gate-one-again', target:'#chapter-stage-1', pos:'auto',
      title:'Gate I again — now you have a deck',
      body:'Now that you have seen your deck, face The Recruiter again. Click Gate I, then Fight.',
      action:true },

    { id:'recruiter-dialogue-2', target:'#chapter-dialogue-next', pos:'auto',
      title:'Second audience',
      body:'Same 6 beats, but now you know what Six with teeth means. Keep clicking Continue → Fight.',
      action:true },

    { id:'deck-pick-again', target:'#dm-list .dm-row:not(.disabled)', pos:'auto',
      title:'Choose Grimmwood',
      body:'Pick the Grimmwood deck you just saw.',
      action:true },

    { id:'ban-enemy', target:'#prep-enemy .pcard', pos:'auto',
      title:'Ban 2 enemies',
      body:'You and enemy ban 2 each, hidden. Click any 2 enemy cards (they turn red), then click Next in this box.',
      action:false,
      nextLabel:'Banned 2' },

    { id:'confirm-bans', target:'#prep-confirm-main', pos:'auto',
      title:'Confirm bans',
      body:'Both sides reveal. Click Confirm bans.',
      action:true },

    { id:'field-pick', target:'#prep-player .pcard', pos:'auto',
      title:'Field 6',
      body:'Pick 6 of your 10 survivors. Click until 6 fielded, then Next.',
      action:false,
      nextLabel:'Fielded 6' },

    { id:'field-go', target:'#prep-confirm', pos:'auto',
      title:'To the Colosseum',
      body:'Your six vs his. Click To battle.',
      action:true },

    { id:'battle-intro', target:null, pos:'center',
      title:'Round 1: Basics only',
      body:'You are in vs The Recruiter — same Grimmwood vs Grimmwood. Signatures unlock Round 2. Energy carries. Hover any card — panel appears.',
      nextLabel:'Fight!' },

    { id:'done', target:null, pos:'center',
      title:'Road begun',
      body:'You walked menu → campaign → chapter → got Grimmwood ceremony → toured collection & builder → back to gate → bans → field → battle. Replay from top-left.',
      nextLabel:'Finish' },
  ];

  var overlay, dialog, titleEl, bodyEl, stepEl, prevBtn, nextBtn;
  var current = -1, active = false;
  var boundTarget = null, boundHandler = null;
  var retryTimer = null;

  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function scale(){ return (window.EOL.scale && window.EOL.scale.factor()) || 1; }

  function build(){
    overlay = document.createElement('div');
    overlay.className = 'tut-overlay';
    overlay.setAttribute('aria-hidden','true');

    dialog = document.createElement('div');
    dialog.className='tut-dialog tut-center';
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','tut-title');

    var closeBtn=document.createElement('button');
    closeBtn.className='tut-close';
    closeBtn.type='button';
    closeBtn.setAttribute('aria-label','Skip tutorial');
    closeBtn.innerHTML='<i class="ri-close-line"></i>';
    closeBtn.addEventListener('click', end);

    titleEl=document.createElement('h3');
    titleEl.id='tut-title'; titleEl.className='tut-title';
    bodyEl=document.createElement('p');
    bodyEl.className='tut-body';
    stepEl=document.createElement('span');
    stepEl.className='tut-step';

    var foot=document.createElement('div');
    foot.className='tut-foot';
    prevBtn=document.createElement('button');
    prevBtn.className='btn btn-ghost btn-slim tut-prev';
    prevBtn.type='button';
    prevBtn.innerHTML='<i class="ri-arrow-left-line"></i><span>Back</span>';
    prevBtn.addEventListener('click', back);
    nextBtn=document.createElement('button');
    nextBtn.className='btn btn-primary btn-slim tut-next';
    nextBtn.type='button';
    nextBtn.innerHTML='<span>Next</span><i class="ri-arrow-right-line"></i>';
    nextBtn.addEventListener('click', advance);

    foot.appendChild(prevBtn);
    foot.appendChild(nextBtn);
    dialog.appendChild(closeBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(bodyEl);
    dialog.appendChild(stepEl);
    dialog.appendChild(foot);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e){
      if(!active || current<0) return;
      if(dialog.contains(e.target)) return;
      // clicking dim when no target advances
      var s=STEPS[current];
      if(s && !s.target) advance();
    });
  }

  function getTarget(sel){
    if(!sel) return null;
    try{
      var list=document.querySelectorAll(sel);
      for(var i=0;i<list.length;i++){
        var el=list[i];
        if(!el) continue;
        // ensure in DOM and visible
        if(el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
          // might still be visible via flex, check rect
          var r=el.getBoundingClientRect();
          if(r.width<2 || r.height<2) continue;
        }
        var r=el.getBoundingClientRect();
        if(r.width>2 && r.height>2) return el;
      }
      return document.querySelector(sel);
    }catch(e){ return null; }
  }

  function placeOverlay(target){
    if(!target){
      overlay.classList.remove('has-target');
      overlay.classList.add('no-target');
      positionDialog(null, 'center');
      return;
    }
    overlay.classList.add('has-target');
    overlay.classList.remove('no-target');
    positionDialog(target, STEPS[current] ? STEPS[current].pos : 'auto');
  }

  function positionDialog(target, pos){
    dialog.style.left=''; dialog.style.top=''; dialog.style.right=''; dialog.style.bottom=''; dialog.style.transform='';
    dialog.classList.remove('tut-below','tut-above','tut-right','tut-left','tut-center','tut-auto');

    if(!target || pos==='center'){
      dialog.classList.add('tut-center');
      dialog.style.left='50%'; dialog.style.top='50%'; dialog.style.transform='translate(-50%,-50%)';
      return;
    }

    var gap=18;
    var z=scale();
    var vw=window.innerWidth / z;
    var vh=window.innerHeight / z;
    // ensure dialog has size
    var dr=dialog.getBoundingClientRect();
    var dw=(dr.width / z) || 380;
    var dh=(dr.height / z) || 180;
    var tr=target.getBoundingClientRect();
    var tLeft=tr.left / z, tTop=tr.top / z, tW=tr.width / z, tH=tr.height / z;
    var tRight=tLeft+tW, tBottom=tTop+tH;
    var tCX=tLeft+tW/2, tCY=tTop+tH/2;

    var autoPos=pos;
    if(pos==='auto'){
      var below=vh - tBottom - gap;
      var above=tTop - gap;
      var right=vw - tRight - gap;
      var left=tLeft - gap;
      if(tCY < vh*0.55 && below>dh+20) autoPos='below';
      else if(above>dh+20) autoPos='above';
      else if(right>dw+20) autoPos='right';
      else if(left>dw+20) autoPos='left';
      else autoPos='below';
    }

    var left, top;
    if(autoPos==='below'){ left=tCX - dw/2; top=tBottom+gap; }
    else if(autoPos==='above'){ left=tCX - dw/2; top=tTop - dh - gap; }
    else if(autoPos==='right'){ left=tRight+gap; top=tCY - dh/2; }
    else if(autoPos==='left'){ left=tLeft - dw - gap; top=tCY - dh/2; }
    else { left=tCX - dw/2; top=tBottom+gap; }

    var margin=12;
    left=Math.max(margin, Math.min(left, vw - dw - margin));
    top=Math.max(margin, Math.min(top, vh - dh - margin));

    dialog.classList.add('tut-'+autoPos);
    dialog.style.left=left+'px';
    dialog.style.top=top+'px';
  }

  function cleanupTarget(){
    if(boundTarget && boundHandler){
      try{ boundTarget.removeEventListener('click', boundHandler); }catch(e){}
    }
    if(retryTimer){ clearTimeout(retryTimer); retryTimer=null; }
    var elevated=document.querySelectorAll('.tut-elevated');
    elevated.forEach(function(el){
      el.classList.remove('tut-elevated');
      el.style.removeProperty('box-shadow');
      // position may have been set to relative for stacking, remove if we set it
      if(el.dataset.tutPosSet){
        el.style.removeProperty('position');
        delete el.dataset.tutPosSet;
      }
    });
    boundTarget=null; boundHandler=null;
  }

  function showDeckReward(cb){
    var modal=document.getElementById('deck-reward');
    var preview=document.getElementById('dr-preview');
    var cont=document.getElementById('dr-continue');
    var scrim=document.getElementById('dr-scrim');
    if(!modal) { cb && cb(); return; }

    try{
      preview.innerHTML='';
      var fac = (window.EOL.factions||[]).find(function(f){ return f.id==='grimmwood'; });
      if(fac && fac.cards){
        fac.cards.slice(0,12).forEach(function(c){
          var s=document.createElement('span');
          s.innerHTML='<i class="ra '+c.icon+'"></i>';
          s.title=c.name;
          preview.appendChild(s);
        });
      }
    }catch(e){}

    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    var closed=false;
    var close=function(){
      if(closed) return;
      closed=true;
      modal.hidden=true;
      modal.setAttribute('aria-hidden','true');
      if(cont) cont.removeEventListener('click', close);
      if(scrim) scrim.removeEventListener('click', close);
      if(cb) cb();
    };
    if(cont) cont.addEventListener('click', close);
    if(scrim) scrim.addEventListener('click', close);
  }

  function waitForTarget(sel, cb, tries){
    tries = tries || 0;
    if(tries > 40){ cb(null); return; }
    var t = getTarget(sel);
    if(t){ cb(t); return; }
    retryTimer = setTimeout(function(){ waitForTarget(sel, cb, tries+1); }, 220);
  }

  function showStep(i){
    if(i<0 || i>=STEPS.length) return;
    cleanupTarget();
    current=i;
    var s=STEPS[i];
    titleEl.innerHTML=esc(s.title);
    bodyEl.innerHTML=s.body;
    stepEl.textContent=(i+1)+' / '+STEPS.length;
    prevBtn.style.visibility = i===0 ? 'hidden' : '';
    var isLast = i===STEPS.length-1;
    nextBtn.querySelector('span').textContent = s.nextLabel || (isLast?'Finish':'Next');
    nextBtn.querySelector('i').className = isLast ? 'ri-check-line' : (s.action ? 'ri-cursor-line' : 'ri-arrow-right-line');
    nextBtn.style.visibility = s.action ? 'hidden' : '';

    var target = getTarget(s.target);

    if(s.waitFor && s.target && !target){
      // poll for target (deck list may render late)
      placeOverlay(null);
      waitForTarget(s.target, function(found){
        if(!active || current!==i) return;
        if(found) showStep(i); // re-enter same step now that target exists
      });
      return;
    }

    if(!target && s.target){
      placeOverlay(null);
      // wait for view change or element
      var onView = function(){
        document.removeEventListener('eol:view', onView);
        setTimeout(function(){ if(active && current===i) showStep(i); }, 500);
      };
      document.addEventListener('eol:view', onView);
      retryTimer = setTimeout(function(){ if(active && current===i) showStep(i); }, 1100);
      return;
    }

    placeOverlay(target);

    if(target){
      target.classList.add('tut-elevated');
      var cs=getComputedStyle(target);
      if(cs.position==='static'){
        target.style.position='relative';
        target.dataset.tutPosSet='1';
      }

      if(s.action){
        boundTarget=target;
        boundHandler=function(){
          setTimeout(function(){
            if(!active) return;
            var nxt=current+1;
            if(nxt>=STEPS.length){ end(); return; }
            // small delay to let veil / modal / navigation settle
            setTimeout(function(){
              if(active) showStep(nxt);
            }, 420);
          }, 320);
        };
        target.addEventListener('click', boundHandler, {once:true});
      }
    }

    requestAnimationFrame(function(){
      if(active && current===i) placeOverlay(target);
    });

    if(s.onEnter){
      try{
        s.onEnter(function(){
          var nxt=i+1;
          if(nxt<STEPS.length) showStep(nxt);
        });
      }catch(e){}
    }
  }

  function advance(){ if(current>=STEPS.length-1){ end(); return; } showStep(current+1); }
  function back(){ if(current<=0) return; showStep(current-1); }

  function onResize(){
    if(!active || current<0) return;
    var s=STEPS[current];
    placeOverlay(getTarget(s.target));
  }

  function start(){
    if(active) return;
    if(!overlay) build();
    active=true;
    overlay.classList.add('on');
    document.body.classList.add('tut-active');
    showStep(0);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
  }

  function end(){
    if(!active) return;
    active=false;
    cleanupTarget();
    overlay.classList.remove('on','has-target','no-target');
    document.body.classList.remove('tut-active');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    try{ localStorage.setItem(KEY,'1'); }catch(e){}
    var dr=document.getElementById('deck-reward');
    if(dr) { dr.hidden=true; dr.setAttribute('aria-hidden','true'); }
  }

  function onKey(e){
    if(e.key==='Escape'){ e.preventDefault(); end(); }
    else if(e.key==='ArrowRight' || e.key==='Enter'){
      e.preventDefault();
      var s=STEPS[current];
      if(s && !s.action) advance();
    }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); back(); }
  }

  window.EOL.tutorial={ start:start, end:end, isActive:function(){return active;}, isDone:function(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}, reset:function(){try{localStorage.removeItem(KEY);}catch(e){}}, _showDeckReward: showDeckReward };
})();
