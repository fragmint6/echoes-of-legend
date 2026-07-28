// headless harness: fake window, load data+engine+ai, run full battles
global.window = global;
global.console.warn = console.warn;
const fs=require('fs'), vm=require('vm');
const files=['data/_schema.js','data/roles.js','data/camelot.js','data/olympus.js',
             'data/eastern-legends.js','data/grimmwood.js','js/engine.js','js/ai.js'];
for(const f of files) vm.runInThisContext(fs.readFileSync(f,'utf8'), {filename:f});

const E=window.EOL.engine, AI=window.EOL.ai;
const all=[]; window.EOL.factions.forEach(f=>f.cards.forEach(c=>all.push({card:c,faction:f})));
console.log('cards loaded:', all.length);

// verify every card has a usable spec or passive
let issues=0;
all.forEach(e=>{
  const a=e.card.ability;
  if(a.type==='Active' && !a.spec){console.log('NO SPEC:',e.card.name);issues++;}
  if(a.type==='Passive' && !a.passive){console.log('NO PASSIVE:',e.card.name);issues++;}
});
console.log('data issues:', issues);

// seeded rng for reproducibility
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function playGame(seed, verbose){
  const rng=mulberry(seed);
  const shuf=arr=>arr.map(v=>[rng(),v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]);
  const pool=shuf(all.slice());
  const B=E.createBattle(pool.slice(0,6), pool.slice(6,12), {rng});
  let guard=0;
  while(!B.over && B.round<=60 && guard<3000){
    for(const side of ['player','enemy']){
      let acts=0;
      while(!B.over && acts<6){
        const a=AI.bestAction(B, side);
        if(!a) break;
        const r=E.useAbility(B,a.unit,a.ability,a.chosen,a.choose);
        if(!r.ok){ B.acted[side][a.unit.uid]=true; }
        acts++; guard++;
      }
    }
    if(B.over) break;
    E.nextRound(B);
  }
  return B;
}

let wins={player:0,enemy:0,none:0}, rounds=[], errs=0;
for(let s=1;s<=400;s++){
  try{
    const B=playGame(s);
    if(B.winner) wins[B.winner]++; else wins.none++;
    rounds.push(B.round);
  }catch(err){ errs++; if(errs<4) console.log('ERR seed',s,err.message,'\n',err.stack.split('\n')[1]); }
}
console.log('200 games ->', wins, 'errors:', errs);
console.log('avg rounds:', (rounds.reduce((a,b)=>a+b,0)/rounds.length).toFixed(1),
            'max:', Math.max(...rounds), 'min:', Math.min(...rounds));
