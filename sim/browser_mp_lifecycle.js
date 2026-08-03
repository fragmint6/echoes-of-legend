/* =============================================================
   Echoes of Legend - MATCH LIFECYCLE (forfeit + turn clock)
   -------------------------------------------------------------
   Browser test. Requires puppeteer and a local server:
     cd /tmp && npm install puppeteer --no-audit --no-fund
     python3 -m http.server 8777    (from the project root)
     node sim/browser_mp_lifecycle.js

   Two real players can stall or rage-quit; the bot never could, so
   none of this machinery existed until multiplayer shipped.

   Guards:
     - the 30s turn clock appears in multiplayer and NOT in solo
     - forfeit needs two clicks (one mis-click must not end a match)
     - a forfeit resolves as Defeat for the quitter and Victory for
       the opponent, on both screens
     - endMatch() fires so the row stops being "your active match"

   Two bugs this caught on first run:
     1. start() inlined announce+ponder instead of calling
        maybeAutoEndTurn, so round 1 never started a clock - the one
        turn a staller could sit on forever.
     2. The forfeit button is a child of .board, whose click handler
        disarmed it on the very click that armed it.
   ============================================================= */
const puppeteer=require('/tmp/node_modules/puppeteer');
const CHROME='/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SEED=987654321;
function shim(isHost,opp){return `(()=>{
  window.__out=[];const MP=window.EOL.mp;const h={};
  MP.on=(n,f)=>{(h[n]=h[n]||[]).push(f)};
  MP.send=(e,p)=>{window.__out.push({event:e,payload:p});return Promise.resolve()};
  MP.available=()=>true; MP.isHost=()=>${isHost}; MP.current=()=>window.__match;
  MP.resume=()=>Promise.resolve(null);
  MP.endMatch=()=>{window.__ended=true};
  window.__emit=(n,p)=>(h[n]||[]).forEach(f=>f(p));
  window.__match={id:'t',seed:${SEED},host:${isHost},oppId:'x',oppName:${JSON.stringify(opp)}};
  window.EOL.auth.user=()=>({id:'${isHost?'host':'guest'}',name:'${isHost?'Host':'Guest'}',email:'',avatar:''});
  window.EOL.auth.isReady=()=>true;
  window.EOL.play._initMp();
  try{localStorage.setItem('eol.coach.v1',JSON.stringify(['draft','prep-ban','prep-pick','battle']));}catch(e){}
  window.EOL.gfx.set('low');
})()`;}
(async()=>{
 const br=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--blink-settings=primaryHoverType=2,availableHoverTypes=2']});
 const errs=[];
 const mk=async(host,opp)=>{const p=await br.newPage();await p.setViewport({width:1600,height:950});
   p.on('pageerror',e=>errs.push((host?'H':'G')+': '+e.message));
   p.on('console',m=>{if(m.type()==='error')errs.push((host?'H':'G')+' console: '+m.text())});
   await p.goto(process.env.EOL_URL || 'http://localhost:8777/index.html',{waitUntil:'networkidle0'});
   await p.evaluate(shim(host,opp)); return p;};
 const A=await mk(true,'Guest'), B=await mk(false,'Host');
 async function pump(){for(let i=0;i<6;i++){
   const a=await A.evaluate(()=>{const o=window.__out;window.__out=[];return o});
   const b=await B.evaluate(()=>{const o=window.__out;window.__out=[];return o});
   for(const m of a) await B.evaluate((e,p)=>window.__emit(e,p),m.event,m.payload);
   for(const m of b) await A.evaluate((e,p)=>window.__emit(e,p),m.event,m.payload);
   if(!a.length&&!b.length)return; await sleep(120);}}
 let f=0;const t=(ok,m)=>{if(!ok)f++;console.log((ok?'  PASS  ':'  FAIL  ')+m)};

 // start both directly in a synced battle (skip draft for speed)
 for(const [p,host] of [[A,true],[B,false]]){
   await p.evaluate((h,seed)=>{
     const fl=window.EOL.play._flat();
     const mine=h?fl.slice(0,6):fl.slice(6,12);
     const foe =h?fl.slice(6,12):fl.slice(0,6);
     window.EOL.netplay.begin(window.__match);
     window.EOL.ui.show('battle');
     window.EOL.battle.start({teams:{player:mine,enemy:foe},enemyFormed:true,
       field:window.EOL.battlefieldById('colosseum'),
       rng:window.EOL.netplay.rngFrom(seed+0x5f37),
       oddFirst:h?'player':'enemy',
       net:window.EOL.netplay.controller(()=>{})});
   }, host, SEED);
 }
 await sleep(3500); await pump();

 const ui=await A.evaluate(()=>({clock:!document.getElementById('turn-clock').hidden,
   ff:!document.getElementById('btn-forfeit').hidden,
   secs:document.getElementById('tc-num').textContent}));
 t(ui.clock,'turn clock visible in multiplayer (showing '+ui.secs+'s)');
 t(ui.ff,'forfeit button visible in multiplayer');
 t(parseInt(ui.secs,10)<=30&&parseInt(ui.secs,10)>20,'clock counts down from 30 (at '+ui.secs+')');

 // forfeit requires two clicks
 await A.evaluate(()=>document.getElementById('btn-forfeit').click());
 await sleep(200);
 const armed=await A.evaluate(()=>({arm:document.getElementById('btn-forfeit').classList.contains('arm'),
   txt:document.querySelector('#btn-forfeit span').textContent,
   over:window.EOL.battle.getState().over}));
 t(armed.arm&&/Confirm/i.test(armed.txt),'first click ARMS rather than forfeiting ("'+armed.txt+'")');
 t(!armed.over,'battle is NOT over after one click');

 await A.evaluate(()=>document.getElementById('btn-forfeit').click());
 await sleep(600); await pump(); await sleep(2500); await pump(); await sleep(2000);

 const res=await A.evaluate(()=>{const S=window.EOL.battle.getState();
   return {over:S.over,winner:S.winner,ended:!!window.__ended,
     title:(document.querySelector('#result.show .result-title')||{}).textContent}});
 const res2=await B.evaluate(()=>{const S=window.EOL.battle.getState();
   return {over:S.over,winner:S.winner,title:(document.querySelector('#result.show .result-title')||{}).textContent}});
 t(res.over&&res.winner==='enemy','forfeiter loses ('+res.winner+')');
 t(res2.over&&res2.winner==='player','opponent WINS ('+res2.winner+')');
 t(res.title==='Defeat'&&res2.title==='Victory','result screens are opposite: "'+res.title+'" / "'+res2.title+'"');
 t(res.ended,'endMatch() called so the row is closed server-side');
 const clk=await A.evaluate(()=>document.getElementById('turn-clock').hidden);
 t(clk,'clock hidden once the battle ends');

 t(errs.length===0,'no console/page errors ('+errs.length+')');
 errs.slice(0,5).forEach(e=>console.log('    '+e));
 console.log(f?'\n===== '+f+' FAILED =====':'\n===== ALL PASSED =====');
 await br.close(); process.exit(f?1:0);
})();
