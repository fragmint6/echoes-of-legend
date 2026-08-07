(function () {
  'use strict';
  var KEY = 'eol.tutorial.done';

  /* NEW TUTORIAL per user mapping 2026-08-07:
     Play -> Campaign -> Chapter 1 -> Dialogue (6 beats) -> Claim Deck (ceremony, no collection tour)
     -> Choose deck popup (unabridged locked) -> Tips (?) -> Bans (help pick 2 best) -> Map -> Field six -> Join game
     -> Round 1 basics only (let them finish) -> Round 2 signatures + surface combos -> beat recruiter -> done

     Overlay: full-screen dim rgba 0.32 blur 2px, NO HOLE. Targets layered OVER dim via z-index 8001.
  */

  var STEPS = [
    { id:'welcome', target:null, pos:'center',
      title:'Welcome to Echoes of Legend',
      body:'I will guide you from first click to your first win over The Recruiter. The world dims, but only what you need glows above it.',
      nextLabel:'Begin' },

    { id:'play-btn', target:'#btn-play', pos:'auto',
      title:'Play',
      body:'Everything starts here. Click Play.',
      action:true },

    { id:'campaign-mode', target:'#mode-campaign', pos:'auto',
      title:'Campaign',
      body:'Campaign is the Road of Echoes — 10 gates. This tutorial does Gate I. Click Campaign.',
      action:true },

    { id:'chapter-card', target:'#chapter-1', pos:'auto',
      title:'Chapter 1',
      body:'The Road of Echoes. Click to open its 10 gates.',
      action:true },

    { id:'gate-one', target:'#chapter-stage-1', pos:'auto',
      title:'Gate I — The Recruiter',
      body:'First gate is open. Click it.',
      action:true },

    { id:'recruiter-dialogue', target:'#chapter-dialogue-next', pos:'auto',
      title:'The Recruiter',
      body:'He speaks 6 beats. Keep clicking Continue. Last becomes Fight. I keep the popup from ever covering the button.',
      action:true },

    { id:'deck-unlock', target:null, pos:'center',
      title:'A gift for the road',
      body:'The Recruiter slides a satchel: Grimmwood starter, 12 legends. This is your first legal deck.',
      nextLabel:'Claim it',
      onEnter: function(next){
        try{ if(window.EOL.decks && window.EOL.decks.seedGrimmwoodStarter) window.EOL.decks.seedGrimmwoodStarter(); }catch(e){}
        showDeckReward(function(){ next(); });
      } },

    { id:'deck-pick', target:'#dm-list .dm-row:not(.disabled)', pos:'auto',
      title:'Choose your deck',
      body:'Pick Grimmwood. Note: Unabridged (best of 3) is locked for campaign — this is a Single Battle. Your 6 will be chosen after bans.',
      action:true },

    { id:'tips', target:'.tipdot', pos:'auto',
      title:'Helper tips',
      body:'See those little (?) marks? They are tips scattered everywhere. Hover or tap for law. You can turn them off in Settings > Display > Helper tips.',
      action:false, nextLabel:'Got it' },

    { id:'ban-help', target:'#prep-enemy .pcard', pos:'auto',
      title:'Ban 2 — who is scary?',
      body:'Recruiter also runs Grimmwood. Best bans here: <b>Evil Queen</b> (legendary AoE + Exposed on highest HP) and <b>Rumpelstiltskin</b> (coin-flip: Burn + -15% ATK or -60% healing + Exposed). Both swing games. Click any 2 enemy cards, then Next.',
      action:false, nextLabel:'Banned' },

    { id:'confirm-bans', target:'#prep-confirm-main', pos:'auto',
      title:'Confirm bans',
      body:'Both sides reveal. Enemy banned Hansel & Gretel + Cinderella from you — his scripted answer to Grimmwood. Click Confirm.',
      action:true },

    { id:'battlefield', target:'#bf-card', pos:'auto',
      title:'The Colosseum',
      body:'No special rules — pure drafting and play. This is the balance benchmark. Other arenas add +15% back-row damage, energy shifts, echoes, etc. Click Continue to field.',
      action:false, nextLabel:'Understood',
      onEnter: function(next){
        // battlefield reveal modal appears after bans; wait for it
        var tries=0;
        var iv=setInterval(function(){
          var card=document.getElementById('bf-card') || document.getElementById('bf-reveal');
          if((card && card.offsetParent!==null) || tries>40){ clearInterval(iv); }
          tries++;
        },200);
      } },

    { id:'field-six', target:'#prep-player .pcard', pos:'auto',
      title:'Field 6',
      body:'Front row soaks — Tank/Bruiser love it. Back row supports — Sniper/Caster/Medic. Pick any 6 of your 10 survivors, then Next. Row swaps are free later.',
      action:false, nextLabel:'Fielded 6' },

    { id:'field-go', target:'#prep-confirm', pos:'auto',
      title:'To battle',
      body:'Your six vs his six, same Grimmwood. Click To battle.',
      action:true },

    { id:'battle-basic', target:null, pos:'center',
      title:'Round 1 — Basics only',
      body:'Round 1: Signatures locked. Only Basics + role Basics. Front tanks, back hits. Click a friendly card, pick Basic (blue), pick enemy front. Energy carries to 150. Finish Round 1 — I will stay quiet.',
      nextLabel:'Fight!',
      onEnter: function(next){
        document.body.classList.add('tut-battle');
        // allow battle board interaction
        setTimeout(function(){
          // auto-advance after they close this dialog? No, let them click Next to dismiss and play.
          // We'll listen for round change to 2 to auto-show next step
          var poll=setInterval(function(){
            try{
              var st=window.EOL.battle && window.EOL.battle.getState && window.EOL.battle.getState();
              if(st && st.round>=2){
                clearInterval(poll);
                showStepById('battle-signature');
              }
            }catch(e){}
          },800);
        },600);
      } },

    { id:'battle-signature', target:null, pos:'center',
      title:'Round 2 — Signatures unlock',
      body:'Signatures unlock now. They cost more but win games. Gold tag = Signature, Blue = Basic. Cost is top-right. If greyed, check energy or targets.',
      nextLabel:'Got it',
      onEnter: function(next){ document.body.classList.add('tut-battle'); } },

    { id:'battle-combos', target:null, pos:'center',
      title:'A taste of combos',
      body:'Grimmwood loves debuffs: <b>Marked</b> (lightning) feeds many. <b>Burn</b> ticks 5% Max HP per round, ignores DEF/Shields. <b>Exposed</b> zeroes DEF. Example: Evil Queen Exposes highest HP → Puss pierces for 45% more if 2+ debuffs + refunds 10 energy. Try it.',
      nextLabel:'Let me try' },

    { id:'battle-finish', target:null, pos:'center',
      title:'Finish him',
      body:'Beat The Recruiter. He moderates power in this gate (often uses Basics even with Signature ready) to measure you. When both sides pass back-to-back, round ends. First team to fall loses.',
      nextLabel:'Finish tutorial',
      onEnter: function(next){
        document.body.classList.add('tut-battle');
        var poll=setInterval(function(){
          try{
            var st=window.EOL.battle && window.EOL.battle.getState && window.EOL.battle.getState();
            if(st && st.over){
              clearInterval(poll);
              showStepById('done');
            }
          }catch(e){}
        },900);
      } },

    { id:'done', target:null, pos:'center',
      title:'Road begun',
      body:'You went Play → Campaign → Chapter → Dialogue → Claim Grimmwood → Pick deck (Unabridged locked) → Tips → Bans (Queen + Rumple best) → Colosseum → Field 6 → Battle Basics → Signatures → Combos → Victory. Replay from top-left cap icon.',
      nextLabel:'Finish' },
  ];

  var overlay, dialog, titleEl, bodyEl, stepEl, prevBtn, nextBtn;
  var current=-1, active=false;
  var boundTarget=null, boundHandler=null;
  var retryTimer=null;

  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function scale(){ return (window.EOL.scale && window.EOL.scale.factor()) || 1; }

  function build(){
    overlay=document.createElement('div');
    overlay.className='tut-overlay';
    overlay.setAttribute('aria-hidden','true');

    dialog=document.createElement('div');
    dialog.className='tut-dialog tut-center';
    dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','tut-title');

    var closeBtn=document.createElement('button');
    closeBtn.className='tut-close'; closeBtn.type='button';
    closeBtn.setAttribute('aria-label','Skip tutorial');
    closeBtn.innerHTML='<i class="ri-close-line"></i>';
    closeBtn.addEventListener('click', end);

    titleEl=document.createElement('h3'); titleEl.id='tut-title'; titleEl.className='tut-title';
    bodyEl=document.createElement('p'); bodyEl.className='tut-body';
    stepEl=document.createElement('span'); stepEl.className='tut-step';

    var foot=document.createElement('div'); foot.className='tut-foot';
    prevBtn=document.createElement('button'); prevBtn.className='btn btn-ghost btn-slim tut-prev'; prevBtn.type='button';
    prevBtn.innerHTML='<i class="ri-arrow-left-line"></i><span>Back</span>'; prevBtn.addEventListener('click', back);
    nextBtn=document.createElement('button'); nextBtn.className='btn btn-primary btn-slim tut-next'; nextBtn.type='button';
    nextBtn.innerHTML='<span>Next</span><i class="ri-arrow-right-line"></i>'; nextBtn.addEventListener('click', advance);

    foot.appendChild(prevBtn); foot.appendChild(nextBtn);
    dialog.appendChild(closeBtn); dialog.appendChild(titleEl); dialog.appendChild(bodyEl); dialog.appendChild(stepEl); dialog.appendChild(foot);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e){
      if(!active || current<0) return;
      if(dialog.contains(e.target)) return;
      var s=STEPS[current];
      if(s && !s.target) advance();
    });
  }

  function isVeilOn(){ var v=document.getElementById('veil'); return v && v.classList.contains('on'); }
  function waitForVeilOff(cb,tries){ tries=tries||0; if(tries>50){cb();return;} if(!isVeilOn()){cb();return;} retryTimer=setTimeout(function(){waitForVeilOff(cb,tries+1);},120); }

  function getTarget(sel){
    if(!sel) return null;
    try{
      var list=document.querySelectorAll(sel);
      for(var i=0;i<list.length;i++){
        var el=list[i];
        if(!el) continue;
        var r=el.getBoundingClientRect();
        if(r.width>2 && r.height>2){
          var cs=getComputedStyle(el);
          if(cs.visibility==='hidden' || cs.display==='none') continue;
          return el;
        }
      }
      return document.querySelector(sel);
    }catch(e){ return null; }
  }

  function placeOverlay(target){
    if(!target){
      overlay.classList.remove('has-target'); overlay.classList.add('no-target');
      positionDialog(null,'center'); return;
    }
    overlay.classList.add('has-target'); overlay.classList.remove('no-target');
    positionDialog(target, STEPS[current]?STEPS[current].pos:'auto');
  }

  function positionDialog(target,pos){
    dialog.style.left=''; dialog.style.top=''; dialog.style.right=''; dialog.style.bottom=''; dialog.style.transform='';
    dialog.classList.remove('tut-below','tut-above','tut-right','tut-left','tut-center','tut-auto');
    if(!target || pos==='center'){
      dialog.classList.add('tut-center');
      dialog.style.left='50%'; dialog.style.top='50%'; dialog.style.transform='translate(-50%,-50%)';
      return;
    }
    var gap=18, z=scale(), vw=window.innerWidth/z, vh=window.innerHeight/z;
    var dr=dialog.getBoundingClientRect(), dw=(dr.width/z)||380, dh=(dr.height/z)||180;
    var tr=target.getBoundingClientRect(), tLeft=tr.left/z, tTop=tr.top/z, tW=tr.width/z, tH=tr.height/z;
    var tRight=tLeft+tW, tBottom=tTop+tH, tCX=tLeft+tW/2, tCY=tTop+tH/2;
    var autoPos=pos;
    if(pos==='auto'){
      var below=vh - tBottom - gap, above=tTop - gap, right=vw - tRight - gap, left=tLeft - gap;
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
    var margin=12; left=Math.max(margin, Math.min(left, vw - dw - margin)); top=Math.max(margin, Math.min(top, vh - dh - margin));
    dialog.classList.add('tut-'+autoPos);
    dialog.style.left=left+'px'; dialog.style.top=top+'px';
  }

  function cleanupTarget(){
    if(boundTarget && boundHandler){ try{ boundTarget.removeEventListener('click', boundHandler); }catch(e){} }
    if(retryTimer){ clearTimeout(retryTimer); retryTimer=null; }
    document.querySelectorAll('.tut-elevated, .tut-elevated-parent').forEach(function(el){
      el.classList.remove('tut-elevated'); el.classList.remove('tut-elevated-parent');
      el.style.removeProperty('z-index');
      if(el.dataset.tutPosSet){ el.style.removeProperty('position'); delete el.dataset.tutPosSet; }
    });
    boundTarget=null; boundHandler=null;
  }

  function elevateWithAncestors(target){
    if(!target) return;
    target.classList.add('tut-elevated');
    var cs=getComputedStyle(target);
    if(cs.position==='static'){ target.style.position='relative'; target.dataset.tutPosSet='1'; }
    target.style.zIndex='8001';
    var cur=target.parentElement, depth=0;
    while(cur && cur!==document.body && depth<14){
      var ccs=getComputedStyle(cur);
      var isModal = cur.matches && (
        cur.matches('.chapter-dialogue') || cur.matches('.chapter-dialogue-card') ||
        cur.matches('.deck-modal') || cur.matches('.dm-card') ||
        cur.matches('.setm') || cur.matches('.setm-card') ||
        cur.matches('.bf-reveal') || cur.matches('.bf-card') ||
        cur.matches('.coach') || cur.matches('.auth-modal') || cur.matches('.mm-modal') ||
        cur.matches('.prep') || cur.matches('#bf-reveal')
      );
      if(isModal || ccs.position==='fixed'){
        cur.classList.add('tut-elevated-parent');
        cur.style.zIndex='8001';
        if(ccs.position==='static'){ cur.style.position='relative'; cur.dataset.tutPosSet='1'; }
      }
      cur=cur.parentElement; depth++;
    }
  }

  function showDeckReward(cb){
    var modal=document.getElementById('deck-reward');
    var preview=document.getElementById('dr-preview');
    var cont=document.getElementById('dr-continue');
    var scrim=document.getElementById('dr-scrim');
    if(!modal){ cb&&cb(); return; }
    try{
      preview.innerHTML='';
      var fac=(window.EOL.factions||[]).find(function(f){return f.id==='grimmwood';});
      if(fac && fac.cards){
        fac.cards.slice(0,12).forEach(function(c){
          var s=document.createElement('span'); s.innerHTML='<i class="ra '+c.icon+'"></i>'; s.title=c.name; preview.appendChild(s);
        });
      }
    }catch(e){}
    modal.hidden=false; modal.setAttribute('aria-hidden','false');
    var closed=false;
    var close=function(){
      if(closed) return; closed=true;
      modal.hidden=true; modal.setAttribute('aria-hidden','true');
      if(cont) cont.removeEventListener('click', close);
      if(scrim) scrim.removeEventListener('click', close);
      if(cb) cb();
    };
    if(cont) cont.addEventListener('click', close);
    if(scrim) scrim.addEventListener('click', close);
  }

  function waitForTarget(sel, cb, tries){
    tries=tries||0;
    if(tries>80){ cb(null); return; }
    var t=getTarget(sel);
    if(t && !isVeilOn()){ cb(t); return; }
    retryTimer=setTimeout(function(){ waitForTarget(sel, cb, tries+1); }, 200);
  }

  function showStep(i){
    if(i<0 || i>=STEPS.length) return;
    cleanupTarget();
    current=i;
    var s=STEPS[i];
    titleEl.innerHTML=esc(s.title);
    bodyEl.innerHTML=s.body;
    stepEl.textContent=(i+1)+' / '+STEPS.length;
    prevBtn.style.visibility=i===0?'hidden':'';
    var isLast=i===STEPS.length-1;
    nextBtn.querySelector('span').textContent=s.nextLabel||(isLast?'Finish':'Next');
    nextBtn.querySelector('i').className=isLast?'ri-check-line':(s.action?'ri-cursor-line':'ri-arrow-right-line');
    nextBtn.style.visibility=s.action?'hidden':'';

    // battle steps allow board interaction
    if(s.id && s.id.indexOf('battle')===0) document.body.classList.add('tut-battle');
    else if(s.id && s.id!=='field-go') document.body.classList.remove('tut-battle');

    var target=getTarget(s.target);
    if(!target && s.target){
      placeOverlay(null);
      waitForTarget(s.target, function(found){
        if(!active || current!==i) return;
        if(found) showStep(i);
        else {
          var onView=function(){ document.removeEventListener('eol:view', onView); setTimeout(function(){ if(active&&current===i) showStep(i); },600); };
          document.addEventListener('eol:view', onView);
        }
      });
      return;
    }

    placeOverlay(target);
    if(target){
      elevateWithAncestors(target);
      if(s.action){
        boundTarget=target;
        boundHandler=function(){
          var nxt=current+1;
          if(nxt>=STEPS.length){ setTimeout(end,300); return; }
          setTimeout(function(){
            if(!active) return;
            waitForVeilOff(function(){
              setTimeout(function(){
                if(!active) return;
                var ns=STEPS[nxt];
                if(ns.target){ waitForTarget(ns.target, function(){ if(active) showStep(nxt); }); }
                else showStep(nxt);
              },300);
            });
          },500);
        };
        target.addEventListener('click', boundHandler, {once:true});
      }
    }
    requestAnimationFrame(function(){ if(active&&current===i) placeOverlay(target); });
    if(s.onEnter){ try{ s.onEnter(function(){ var nxt=i+1; if(nxt<STEPS.length) showStep(nxt); }); }catch(e){} }
  }

  function showStepById(id){
    for(var i=0;i<STEPS.length;i++) if(STEPS[i].id===id){ showStep(i); return; }
  }

  function advance(){ if(current>=STEPS.length-1){ end(); return; } showStep(current+1); }
  function back(){ if(current<=0) return; showStep(current-1); }
  function onResize(){ if(!active||current<0) return; placeOverlay(getTarget(STEPS[current].target)); }

  function start(){
    if(active) return;
    if(!overlay) build();
    active=true; overlay.classList.add('on'); document.body.classList.add('tut-active');
    showStep(0);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
  }
  function end(){
    if(!active) return; active=false; cleanupTarget();
    overlay.classList.remove('on','has-target','no-target');
    document.body.classList.remove('tut-active','tut-battle');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    try{ localStorage.setItem(KEY,'1'); }catch(e){}
    var dr=document.getElementById('deck-reward'); if(dr){ dr.hidden=true; dr.setAttribute('aria-hidden','true'); }
  }
  function onKey(e){
    if(e.key==='Escape'){ e.preventDefault(); end(); }
    else if(e.key==='ArrowRight'||e.key==='Enter'){ e.preventDefault(); var s=STEPS[current]; if(s&&!s.action) advance(); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); back(); }
  }

  window.EOL.tutorial={ start:start, end:end, isActive:function(){return active;}, isDone:function(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}, reset:function(){try{localStorage.removeItem(KEY);}catch(e){}}, _showDeckReward:showDeckReward, _showStepById:showStepById };
})();
