/* =============================================================
   SINGLEPLAYER REGRESSION - the game with no backend
   -------------------------------------------------------------
   Browser test. Requires puppeteer:
     cd /tmp && npm install puppeteer --no-audit --no-fund
   Then:  node sim/browser_solo.js

   Everything multiplayer added must be invisible to a player who
   never signs in. Plays a full solo draft, ban phase and battle with
   NO Supabase configuration at all, which is the state the game
   ships in, and fails on any console error.
   ============================================================= */
const puppeteer=require('/tmp/node_modules/puppeteer');
const CHROME='/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const br=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--blink-settings=primaryHoverType=2,availableHoverTypes=2']});
 const p=await br.newPage(); await p.setViewport({width:1600,height:950});
 const errs=[]; p.on('pageerror',e=>errs.push('pageerror: '+e.message));
 p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
 /* This file's whole point: singleplayer must not CARE whether a
    backend is configured. Blank the config BEFORE any page script
    runs, so the app boots exactly as it does for someone who never
    filled in js/supabase-config.js. That stays a valid test whether or
    not the shipped file has real credentials in it. */
 await p.evaluateOnNewDocument(()=>{
   window.EOL={supabaseConfig:{url:'',anonKey:'',redirectTo:''}};
   Object.defineProperty(window.EOL,'supabaseConfig',{value:{url:'',anonKey:'',redirectTo:''},writable:false,configurable:false});
 });
 await p.goto('file://' + require('path').resolve(__dirname,'..','index.html') + '',{waitUntil:'networkidle0'});
 await p.evaluate(()=>{try{localStorage.setItem('eol.coach.v1',JSON.stringify(['draft','prep-ban','prep-pick','battle']));}catch(e){} window.EOL.gfx.set('low');});
 await p.reload({waitUntil:'networkidle0'});
 const chk=(ok,m)=>console.log((ok?'  PASS  ':'  FAIL  ')+m);
 let f=0; const t=(ok,m)=>{if(!ok)f++;chk(ok,m);};

 t(await p.evaluate(()=>!window.EOL.auth.configured()),'runs with NO supabase config');
 t(await p.evaluate(()=>!window.EOL.auth.isReady()),'auth reports not-ready rather than throwing');

 // play menu + tabs
 await p.evaluate(()=>window.EOL.ui.show('play')); await sleep(300);
 t(await p.evaluate(()=>{const s=document.getElementById('mode-grid-solo'),m=document.getElementById('mode-grid-mp');return !s.hidden&&m.hidden;}),'Singleplayer tab is the default view');
 await p.evaluate(()=>document.querySelector('.play-tab[data-arena="mp"]').click()); await sleep(250);
 t(await p.evaluate(()=>{const s=document.getElementById('mode-grid-solo'),m=document.getElementById('mode-grid-mp');return s.hidden&&!m.hidden;}),'Multiplayer tab switches the grid');
 t(await p.evaluate(()=>!document.getElementById('mp-lock').hidden),'the account lock badge shows while signed out');
 await p.evaluate(()=>document.getElementById('mode-mp-draft').click()); await sleep(400);
 t(await p.evaluate(()=>{const m=document.getElementById('mm-modal');return !m.hidden&&/[Ss]ign in/.test(document.getElementById('mm-sub').textContent);}),'clicking ranked draft signed-out explains an account is needed');
 await p.evaluate(()=>document.getElementById('mm-cancel').click()); await sleep(200);

 // a full solo draft against the bot
 await p.evaluate(()=>document.querySelector('.play-tab[data-arena="solo"]').click()); await sleep(200);
 await p.evaluate(()=>window.EOL.play.startDraft()); await sleep(900);
 let g=0;
 while(g++<160){
  const st=await p.evaluate(()=>{const d=window.EOL.play._draftState();if(!d)return null;return {busy:d.busy,pack:d.packNo};});
  if(!st) break;
  if(!st.busy) await p.evaluate(()=>{const c=[...document.querySelectorAll('#draft-pack .dpack-card')].filter(x=>!x.classList.contains('taken')&&!x.classList.contains('burnout')&&!x.classList.contains('capped'));if(c.length)c[0].click();});
  await sleep(220);
 }
 t(g<160,'solo draft completed ('+g+' steps)');
 t(await p.evaluate(()=>document.body.dataset.view)==='prep','solo draft reached preparation');

 // bans (the bot's are pre-locked, so the reveal is immediate)
 await p.evaluate(()=>{const c=[...document.querySelectorAll('#prep-enemy .pcard')];c[0].click();c[1].click();});
 await sleep(200);
 await p.evaluate(()=>document.getElementById('prep-confirm-main').click());
 await sleep(3000);
 t(await p.evaluate(()=>window.EOL.play._prepState()?.phase)==='pick','solo bans revealed and advanced to fielding');
 t(await p.evaluate(()=>[...document.querySelectorAll('#prep-player .pcard.banned')].length)===2,'the bot banned exactly 2 of your heroes');

 await p.evaluate(()=>{const c=[...document.querySelectorAll('#prep-player .pcard:not(.banned)')];for(let i=0;i<6;i++)c[i].click();});
 await sleep(300);
 await p.evaluate(()=>document.getElementById('prep-confirm').click());
 await sleep(2500);
 t(await p.evaluate(()=>document.body.dataset.view)==='battle','solo reached the battle board');
 const st=await p.evaluate(()=>{const B=window.EOL.battle.getState();return B?{n:B.units.length,turn:B.turn,odd:B.oddFirst,round:B.round}:null;});
 t(st&&st.n===12,'12 heroes on the board');
 t(st&&st.odd==='player'&&st.turn==='player','solo still opens on the player (oddFirst='+(st&&st.odd)+')');

 // let the bot actually take a turn
 await p.evaluate(()=>document.getElementById('btn-endturn').click());
 await sleep(9000);
 const after=await p.evaluate(()=>{const B=window.EOL.battle.getState();return {log:B.log.length,round:B.round};});
 t(after.log>2,'the bot responded and the battle progressed ('+after.log+' log entries)');

 t(errs.length===0,'no console or page errors ('+errs.length+')');
 errs.slice(0,6).forEach(e=>console.log('    '+e));
 console.log(f?'\n===== '+f+' FAILED =====':'\n===== ALL PASSED =====');
 await br.close(); process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
