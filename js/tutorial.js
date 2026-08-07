(function () {
  'use strict';
  var KEY = 'eol.tutorial.done';
  var PAD = 8;

  var STEPS = [
    { id:'welcome', target:null, pos:'center',
      title:'Welcome to Echoes of Legend',
      body:'A quick guided path from menu to your first real gate. I will highlight exactly what to click — only the highlighted thing can be clicked. Hover and cursors work on it.',
      nextLabel:'Begin tour' },
    { id:'play-btn', target:'#btn-play', pos:'auto',
      title:'Open Play',
      body:'Every fight starts in <b>Play</b>. The button is highlighted with a gold ring that matches its shape. Click it.',
      action:true },
    { id:'campaign-mode', target:'#mode-campaign', pos:'auto',
      title:'Choose Campaign',
      body:'<b>Campaign</b> is the story route — ten gates to Gilgamesh. Click the highlighted Campaign card.',
      action:true },
    { id:'chapter-card', target:'#chapter-1', pos:'auto',
      title:'Chapter 1: The Road of Echoes',
      body:'Art by sh4dowmob. <b>Click the chapter</b> to see the ten gates.',
      action:true },
    { id:'gate-one', target:'#chapter-stage-1', pos:'auto',
      title:'Gate I — The Recruiter',
      body:'First gate is open. Others are blurred until you clear this one. <b>Click Gate I</b>.',
      action:true },
    { id:'recruiter-dialogue', target:'#chapter-dialogue-next', pos:'auto',
      title:'Talk to The Recruiter',
      body:'He speaks in 6 beats. Keep clicking the highlighted <b>Continue</b> button. On the last beat it becomes <b>Fight</b> — click it.',
      action:true },
    { id:'deck-pick', target:'#dm-list .dm-row:not(.disabled)', pos:'auto',
      title:'Pick a squad of 12',
      body:'For your first run any complete deck works. The highlight hugs the row border exactly. <b>Click the highlighted deck</b>.',
      action:true },
    { id:'ban-enemy', target:'#prep-enemy .pcard', pos:'auto',
      title:'Ban 2 enemy legends',
      body:'Bans are hidden until both commit. Click <b>any 2 highlighted enemy cards</b> to mark them, then use <b>Next</b> below.',
      action:false,
      nextLabel:'I banned 2' },
    { id:'confirm-bans', target:'#prep-confirm-main', pos:'auto',
      title:'Lock bans',
      body:'Both sides reveal at once. <b>Click Confirm bans</b>.',
      action:true },
    { id:'field-pick', target:'#prep-player .pcard', pos:'auto',
      title:'Field 6 legends',
      body:'Tap in Your Deck to add to Front/Back. Front soaks hits. <b>Click legends until you have 6 fielded</b>, then Next.',
      action:false,
      nextLabel:'My six is ready' },
    { id:'field-go', target:'#prep-confirm', pos:'auto',
      title:'To the Colosseum',
      body:'Formation is set. <b>Click To battle</b> to face The Recruiter.',
      action:true },
    { id:'battle-intro', target:null, pos:'center',
      title:'Round 1: Basics only',
      body:'Signatures unlock Round 2. Energy from 60→80→100 carries to 150. Hover any ally — panel appears beside card, no dim. Click a hero, then a Skill, then a target.',
      nextLabel:'Let me fight' },
    { id:'done', target:null, pos:'center',
      title:'You are on the Road',
      body:'You went from menu to gate to first battle. Future gates will unlock as you clear them. You can replay this tour from the top-left graduation cap anytime.',
      nextLabel:'Finish' },
  ];

  var overlay, highlight, dialog, titleEl, bodyEl, stepEl, prevBtn, nextBtn;
  var current = -1, active = false;
  var boundTarget = null, boundHandler = null;

  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function scale(){ return (window.EOL.scale && window.EOL.scale.factor()) || 1; }

  function build(){
    overlay = document.createElement('div');
    overlay.className = 'tut-overlay';
    highlight = document.createElement('div');
    highlight.className = 'tut-highlight';
    dialog = document.createElement('div');
    dialog.className = 'tut-dialog';
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','tut-title');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'tut-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label','Skip tutorial');
    closeBtn.innerHTML = '<i class="ri-close-line"></i>';
    closeBtn.addEventListener('click', end);

    titleEl = document.createElement('h3');
    titleEl.id='tut-title'; titleEl.className='tut-title';
    bodyEl = document.createElement('p');
    bodyEl.className='tut-body';
    stepEl = document.createElement('span');
    stepEl.className='tut-step';

    var foot = document.createElement('div');
    foot.className='tut-foot';
    prevBtn = document.createElement('button');
    prevBtn.className='btn btn-ghost btn-slim tut-prev';
    prevBtn.type='button';
    prevBtn.innerHTML='<i class="ri-arrow-left-line"></i><span>Back</span>';
    prevBtn.addEventListener('click', back);
    nextBtn = document.createElement('button');
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

    overlay.appendChild(highlight);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function getTarget(sel){
    if(!sel) return null;
    try{
      var list = document.querySelectorAll(sel);
      for(var i=0;i<list.length;i++){
        var el=list[i];
        if(!el) continue;
        var rect=el.getBoundingClientRect();
        if(rect.width>2 && rect.height>2 && el.offsetParent!==null) return el;
      }
      return document.querySelector(sel);
    }catch(e){ return null; }
  }

  function copyRadius(el, hl, pad){
    try{
      var cs=getComputedStyle(el);
      var br=cs.borderRadius;
      if(!br || br==='0px'){ hl.style.borderRadius='12px'; return; }
      // pill
      if(br.indexOf('999')>-1){ hl.style.borderRadius='999px'; return; }
      // percent (circle avatar)
      if(br.indexOf('%')>-1){
        // keep circle
        hl.style.borderRadius=br;
        return;
      }
      // parse px values and add pad
      // borderRadius can be like "14px" or "14px 14px 14px 14px"
      var parts=br.split(/\s+/);
      var out=parts.map(function(p){
        var n=parseFloat(p);
        if(isNaN(n)) return p;
        return (n+pad)+'px';
      }).join(' ');
      hl.style.borderRadius=out;
    }catch(e){ hl.style.borderRadius='12px'; }
  }

  function placeHighlight(target){
    if(!target){
      highlight.style.display='none';
      overlay.classList.remove('has-target');
      overlay.classList.add('no-target');
      positionDialog(null, 'center');
      return;
    }
    var z=scale();
    var r=target.getBoundingClientRect();
    var left=r.left / z - PAD;
    var top=r.top / z - PAD;
    var w=r.width / z + PAD*2;
    var h=r.height / z + PAD*2;

    highlight.style.display='';
    highlight.style.left=Math.max(2,left)+'px';
    highlight.style.top=Math.max(2,top)+'px';
    highlight.style.width=w+'px';
    highlight.style.height=h+'px';
    copyRadius(target, highlight, PAD);

    overlay.classList.add('has-target');
    overlay.classList.remove('no-target');

    positionDialog(target, STEPS[current] ? STEPS[current].pos : 'auto');
  }

  function positionDialog(target, pos){
    // measure dialog after content set
    dialog.style.left=''; dialog.style.top=''; dialog.style.right=''; dialog.style.bottom=''; dialog.style.transform='';
    // default center
    if(!target || pos==='center'){
      dialog.className = dialog.className.replace(/\btut-(below|above|right|left|auto)\b/g,'').trim() + ' tut-center';
      dialog.style.left='50%';
      dialog.style.top='50%';
      dialog.style.transform='translate(-50%,-50%)';
      dialog.style.right='auto';
      dialog.style.bottom='auto';
      return;
    }

    var gap=18;
    var z=scale();
    var vw=window.innerWidth / z;
    var vh=window.innerHeight / z;

    // need dialog size
    var dr=dialog.getBoundingClientRect();
    var dw=dr.width / z || 380;
    var dh=dr.height / z || 180;

    var tr=target.getBoundingClientRect();
    var tLeft=tr.left / z;
    var tTop=tr.top / z;
    var tW=tr.width / z;
    var tH=tr.height / z;
    var tRight=tLeft+tW;
    var tBottom=tTop+tH;
    var tCenterX=tLeft+tW/2;
    var tCenterY=tTop+tH/2;

    var autoPos = pos;
    if(pos==='auto'){
      // pick best side with most space
      var spaceBelow=vh - tBottom - gap;
      var spaceAbove=tTop - gap;
      var spaceRight=vw - tRight - gap;
      var spaceLeft=tLeft - gap;
      // prefer below if target in top half, above if in bottom half
      if(tCenterY < vh*0.5 && spaceBelow > dh+20) autoPos='below';
      else if(spaceAbove > dh+20) autoPos='above';
      else if(spaceRight > dw+20) autoPos='right';
      else if(spaceLeft > dw+20) autoPos='left';
      else autoPos='below';
    }

    var left, top;
    dialog.classList.remove('tut-center','tut-below','tut-above','tut-right','tut-left','tut-auto');
    dialog.classList.add('tut-'+autoPos);

    if(autoPos==='below'){
      left = tCenterX - dw/2;
      top = tBottom + gap;
    }else if(autoPos==='above'){
      left = tCenterX - dw/2;
      top = tTop - dh - gap;
    }else if(autoPos==='right'){
      left = tRight + gap;
      top = tCenterY - dh/2;
    }else if(autoPos==='left'){
      left = tLeft - dw - gap;
      top = tCenterY - dh/2;
    }else{
      left = tCenterX - dw/2;
      top = tBottom + gap;
    }

    // clamp inside viewport with 12px margin
    var margin=12;
    left = Math.max(margin, Math.min(left, vw - dw - margin));
    top = Math.max(margin, Math.min(top, vh - dh - margin));

    dialog.style.left=left+'px';
    dialog.style.top=top+'px';
    dialog.style.right='auto';
    dialog.style.bottom='auto';
    dialog.style.transform='none';
  }

  function cleanupTarget(){
    if(boundTarget && boundHandler){
      try{ boundTarget.removeEventListener('click', boundHandler); }catch(e){}
    }
    var elevated=document.querySelectorAll('.tut-elevated');
    elevated.forEach(function(el){
      el.classList.remove('tut-elevated');
      el.style.removeProperty('position');
    });
    boundTarget=null; boundHandler=null;
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

    var target=getTarget(s.target);

    if(!target && s.target){
      // wait for target to appear
      placeHighlight(null);
      var retry=function(){
        document.removeEventListener('eol:view', retry);
        setTimeout(function(){ if(active) showStep(i); }, 320);
      };
      document.addEventListener('eol:view', retry);
      setTimeout(function(){ if(active && current===i) showStep(i); }, 900);
      return;
    }

    placeHighlight(target);

    if(target){
      target.classList.add('tut-elevated');
      var cs=getComputedStyle(target);
      if(cs.position==='static') target.style.position='relative';

      if(s.action){
        boundTarget=target;
        boundHandler=function(){
          setTimeout(function(){
            if(!active) return;
            var nxt=current+1;
            if(nxt>=STEPS.length){ end(); return; }
            var ns=STEPS[nxt];
            if(ns.target && !getTarget(ns.target)){
              var r=function(){
                document.removeEventListener('eol:view', r);
                setTimeout(function(){ if(active) showStep(nxt); }, 360);
              };
              document.addEventListener('eol:view', r);
              setTimeout(function(){ if(active) showStep(nxt); }, 850);
              return;
            }
            showStep(nxt);
          }, 340);
        };
        target.addEventListener('click', boundHandler, {once:true});
      }
    }
    // re-position dialog after target placed (need highlight size)
    requestAnimationFrame(function(){
      if(active && current===i) positionDialog(target, s.pos);
    });
  }

  function advance(){ if(current>=STEPS.length-1){ end(); return; } showStep(current+1); }
  function back(){ if(current<=0) return; showStep(current-1); }

  function onResize(){
    if(!active || current<0) return;
    var s=STEPS[current];
    placeHighlight(getTarget(s.target));
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

  window.EOL.tutorial={ start:start, end:end, isActive:function(){return active;}, isDone:function(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}, reset:function(){try{localStorage.removeItem(KEY);}catch(e){}} };
})();
