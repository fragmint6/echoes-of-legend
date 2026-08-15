/* =============================================================
   DESYNC DETECTION - the checksum actually catches drift
   -------------------------------------------------------------
   Browser test. Requires puppeteer:
     cd /tmp && npm install puppeteer --no-audit --no-fund
   Then:  node sim/browser_desync.js

   A guard that never fires is worse than no guard, because it
   inspires false confidence. This tampers with a board behind the
   engine's back and asserts the checksum notices every kind of
   change: hit points, status flags and formation.
   ============================================================= */
const puppeteer = require('/tmp/node_modules/puppeteer');
const CHROME='/home/user/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome';
(async()=>{
 const b=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox']});
 const p=await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://' + require('path').resolve(__dirname,'..','index.html') + '',{waitUntil:'networkidle0'});
 const r=await p.evaluate(()=>{
  const NP=window.EOL.netplay, E=window.EOL.engine;
  const flat=window.EOL.play._flat();
  const six=flat.slice(0,6), six2=flat.slice(6,12);
  const B=E.createBattle(six,six2,{roleAware:true});
  NP.begin({id:'t',seed:1,host:true,oppName:'X'});
  const a=NP.checksum(B);
  const b2=NP.checksum(B);
  // identical board -> identical checksum
  const stable = a===b2;
  // change one legend's HP -> checksum must move
  B.units[0].hp -= 1;
  const c=NP.checksum(B);
  B.units[0].hp += 1;
  // change a status flag -> checksum must move
  B.units[3].flags.taunt = 2;
  const d=NP.checksum(B);
  delete B.units[3].flags.taunt;
  // move a legend between rows -> checksum must move
  const s=B.units[1].slot; B.units[1].slot=5;
  const e=NP.checksum(B);
  B.units[1].slot=s;
  const back=NP.checksum(B);
  return {stable, hpMoved:a!==c, flagMoved:a!==d, slotMoved:a!==e, restored:a===back};
 });
 const chk=(ok,m)=>console.log((ok?'  PASS  ':'  FAIL  ')+m);
 let f=0; const t=(ok,m)=>{if(!ok)f++;chk(ok,m);};
 t(r.stable,'checksum is stable for an unchanged board');
 t(r.hpMoved,'checksum changes when a legend loses 1 HP');
 t(r.flagMoved,'checksum changes when a status flag appears');
 t(r.slotMoved,'checksum changes when a legend changes row');
 t(r.restored,'checksum returns to its original value when the board is restored');
 t(errs.length===0,'no page errors ('+errs.length+')');
 console.log(f?'\n===== '+f+' FAILED =====':'\n===== ALL PASSED =====');
 await b.close(); process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
