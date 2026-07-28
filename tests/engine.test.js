global.window = global;
const fs=require('fs'), vm=require('vm');
['data/_schema.js','data/roles.js','data/camelot.js','data/olympus.js','data/eastern-legends.js','data/grimmwood.js','js/engine.js','js/ai.js'].forEach(f=>vm.runInThisContext(fs.readFileSync(f,'utf8'),{filename:f}));
const E=window.EOL.engine;
const byName={}; window.EOL.factions.forEach(f=>f.cards.forEach(c=>byName[c.name]={card:c,faction:f}));
let pass=0,fail=0;
function ok(c,m){ if(c){pass++;} else {fail++; console.log('  FAIL:',m);} }
function mk(pl,en){ return E.createBattle(pl.map(n=>byName[n]),en.map(n=>byName[n]),{rng:()=>0.5}); }

// 1. energy schedule
ok(E.energyForRound(1)===30&&E.energyForRound(2)===50&&E.energyForRound(3)===70
   &&E.energyForRound(4)===90&&E.energyForRound(5)===100&&E.energyForRound(9)===100,'energy curve');

// 2. Tank/Bruiser restricted to front row
let B=mk(['King Arthur','Merlin','Lancelot','Guinevere','Mordred','Morgan le Fay'],
         ['Zeus','Athena','Hercules','Apollo','Medusa','Ares']);
let arthur=E.unitsOf(B,'player')[0];
let t=E.legalTargets(B,arthur,E.roleAbility(arthur));
ok(t.length===3&&t.every(u=>u.slot<3),'tank front-row only ('+t.map(u=>u.name)+')');

// controller hits anything
let morgan=E.unitsOf(B,'player').find(u=>u.role==='Controller');
ok(E.legalTargets(B,morgan,E.roleAbility(morgan)).length===6,'controller any row');

// medic targets allies only
let guin=E.unitsOf(B,'player').find(u=>u.role==='Medic');
let mt=E.legalTargets(B,guin,E.roleAbility(guin));
ok(mt.length===6&&mt.every(u=>u.side==='player'),'medic allies only');

// 3. front row cleared -> back row becomes targetable
E.unitsOf(B,'enemy').filter(u=>u.slot<3).forEach(u=>{u.alive=false;});
ok(E.legalTargets(B,arthur,E.roleAbility(arthur)).every(u=>u.slot>=3),'back row after front cleared');

// 4. taunt overrides
B=mk(['King Arthur','Merlin','Lancelot','Guinevere','Mordred','Morgan le Fay'],
     ['Zeus','Athena','Hercules','Apollo','Medusa','Ares']);
let herc=E.unitsOf(B,'enemy').find(u=>u.name==='Hercules');
herc.flags.taunt=2;
let tt=E.legalTargets(B,E.unitsOf(B,'player').find(u=>u.role==='Controller'),E.roleAbility(morgan));
ok(tt.length===1&&tt[0].name==='Hercules','taunt forces single target');

// 5. cost + energy spend
B=mk(['Merlin','King Arthur','Lancelot','Guinevere','Mordred','Morgan le Fay'],
     ['Zeus','Athena','Hercules','Apollo','Medusa','Ares']);
let merlin=E.unitsOf(B,'player').find(u=>u.name==='Merlin');
ok(E.costOf(B,merlin,merlin.card.ability)===75,'merlin cost 75');
ok(!E.canUse(B,merlin,merlin.card.ability),'cannot afford 75 at 30 energy');
B.energy.player=100;
ok(E.canUse(B,merlin,merlin.card.ability),'can afford at 100');
E.useAbility(B,merlin,merlin.card.ability,[],null);
ok(B.energy.player===25,'energy deducted -> '+B.energy.player);
// merlin lowers ally costs by 20
let mord=E.unitsOf(B,'player').find(u=>u.name==='Mordred');
ok(E.costOf(B,mord,mord.card.ability)===10,'ally cost -20 -> '+E.costOf(B,mord,mord.card.ability));

// 6. role ability is free & always usable
// Merlin's Prophecy (-20 ally cost) is active here, so 15-20 clamps to 0
ok(E.costOf(B,mord,E.roleAbility(mord))===0,'basic 15 reduced to 0 by Prophecy -> '+E.costOf(B,mord,E.roleAbility(mord)));

// 7. one action per unit per round
ok(B.acted.player[merlin.uid]===true,'unit flagged as acted');
ok(!E.canUse(B,merlin,E.roleAbility(merlin)),'cannot act twice');

// 8. damage respects DEF
B=mk(['Mordred','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Hercules','Athena','Zeus','Apollo','Medusa','Ares']);
B.energy.player=100;
let m2=E.unitsOf(B,'player').find(u=>u.name==='Mordred');
let before={}; E.unitsOf(B,'enemy').forEach(u=>before[u.name]=u.hp);
E.useAbility(B,m2,m2.card.ability,[],null);   // auto lowest HP
let hit=E.unitsOf(B,'enemy').filter(u=>u.hp<before[u.name]);
ok(hit.length===1,'auto-target hit exactly one');
ok(hit[0].name==='Medusa'||hit[0].name==='Ares','auto lowest-hp picked '+hit[0].name);

// 9. Sun Wukong revives once
B=mk(['Sun Wukong','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Hercules','Athena','Zeus','Apollo','Medusa','Ares']);
let wk=E.unitsOf(B,'player').find(u=>u.name==='Sun Wukong');
wk.hp=10;
let zeus=E.unitsOf(B,'enemy').find(u=>u.name==='Zeus');
// force lethal
wk.hp=1; 
const eng=E; // deal damage via role ability of zeus targeting wukong
E.useAbility(B,zeus,E.roleAbility(zeus),[wk],null);
ok(wk.alive===true,'wukong revived (alive)');
ok(wk.hp===Math.round(wk.maxHp*0.25),'revive to 25% -> '+wk.hp);
ok(wk.flags.untargetable===1,'untargetable after revive');
// second death sticks
wk.flags.untargetable=0; wk.hp=1;
B.acted.enemy={};
E.useAbility(B,zeus,E.roleAbility(zeus),[wk],null);
ok(wk.alive===false,'second death is permanent');

// 10. untargetable excluded from targeting
B=mk(['Sun Wukong','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Hercules','Athena','Zeus','Apollo','Medusa','Ares']);
let wk2=E.unitsOf(B,'player').find(u=>u.name==='Sun Wukong');
wk2.flags.untargetable=1;
let zz=E.unitsOf(B,'enemy').find(u=>u.name==='Athena');
ok(!E.legalTargets(B,zz,E.roleAbility(zz)).some(u=>u.uid===wk2.uid),'untargetable excluded');

// 11. Lancelot stacks cap at 5
B=mk(['Lancelot','King Arthur','Guinevere','Merlin','Mordred','Morgan le Fay'],
     ['Hercules','Athena','Zeus','Apollo','Medusa','Ares']);
let lan=E.unitsOf(B,'player').find(u=>u.name==='Lancelot');
let ally=E.unitsOf(B,'player').find(u=>u.name==='King Arthur');
let foe=E.unitsOf(B,'enemy')[0];
for(let i=0;i<9;i++){ B.acted.enemy={}; B.energy.enemy=100; E.useAbility(B,foe,E.roleAbility(foe),[ally],null); }
ok(lan.buffs.filter(b=>b.tag==='finest-knight').length===5,
   'lancelot capped at 5 -> '+lan.buffs.filter(b=>b.tag==='finest-knight').length);

// 12. Zeus delayed damage lands next round
B=mk(['Zeus','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Hercules','Athena','Apollo','Medusa','Ares','Mordred']);
B.energy.player=100;
let z2=E.unitsOf(B,'player').find(u=>u.name==='Zeus');
E.useAbility(B,z2,z2.card.ability,[],null);
let hpBefore=E.unitsOf(B,'enemy').map(u=>u.hp);
ok(E.unitsOf(B,'enemy').every(u=>u.pending.length===1),'all enemies marked');
ok(E.unitsOf(B,'enemy').every((u,i)=>u.hp===hpBefore[i]),'no damage yet');
E.nextRound(B);
ok(E.unitsOf(B,'enemy').some((u,i)=>u.hp<hpBefore[i]),'delayed damage landed next round');

// 13. round advance restores energy + expires buffs
B=mk(['Hercules','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Athena','Zeus','Apollo','Medusa','Ares','Mordred']);
B.energy.player=100;
let h2=E.unitsOf(B,'player').find(u=>u.name==='Hercules');
E.useAbility(B,h2,h2.card.ability,[],null);
ok(h2.flags.taunt===2,'hercules taunt 2');
ok(E.defOf(h2)===70,'def 45+25=70 -> '+E.defOf(h2));
E.nextRound(B);
ok(B.energy.player===50&&B.energy.enemy===50,'round2 energy 50');
ok(h2.flags.taunt===1,'taunt ticked to 1');
E.nextRound(B);
ok(E.defOf(h2)===45,'buff expired -> def '+E.defOf(h2));
ok(B.energy.player===70,'round3 energy 70');

// 14. Guinevere cleanse removes a debuff
B=mk(['Guinevere','King Arthur','Lancelot','Merlin','Mordred','Morgan le Fay'],
     ['Athena','Zeus','Apollo','Medusa','Ares','Hercules']);
B.energy.player=100;
let g=E.unitsOf(B,'player').find(u=>u.name==='Guinevere');
let hurt=E.unitsOf(B,'player').find(u=>u.name==='Lancelot');
hurt.hp=hurt.maxHp*0.4; hurt.buffs.push({stat:'atk',amt:-20,turns:2,tag:null});
E.useAbility(B,g,g.card.ability,[hurt],null);
ok(hurt.buffs.filter(b=>b.amt<0).length===0,'debuff cleansed');
ok(hurt.hp>hurt.maxHp*0.4,'healed');

// 15. win detection
B=mk(['Mordred','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Athena','Zeus','Apollo','Medusa','Ares','Hercules']);
E.unitsOf(B,'enemy').forEach(u=>{u.hp=0;u.alive=false;});
E.checkEnd(B);
ok(B.over&&B.winner==='player','player win detected');

// 16. Momotaro new ability buffs all allies DEF
B=mk(['Momotaro','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Athena','Zeus','Apollo','Medusa','Ares','Hercules']);
B.energy.player=100;
let mom=E.unitsOf(B,'player').find(u=>u.name==='Momotaro');
let defsBefore=E.unitsOf(B,'player').map(u=>E.defOf(u));
E.useAbility(B,mom,mom.card.ability,[],null);
ok(E.unitsOf(B,'player').every((u,i)=>E.defOf(u)===defsBefore[i]+20),'momotaro +20% DEF to all allies');

// 17. Baba Yaga choice modes
B=mk(['Baba Yaga','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Athena','Zeus','Apollo','Medusa','Ares','Hercules']);
B.energy.player=100; B.energy.enemy=80;
let by=E.unitsOf(B,'player').find(u=>u.name==='Baba Yaga');
E.useAbility(B,by,by.card.ability,[],0);   // steal energy
ok(B.energy.enemy===45,'stole 35 energy -> '+B.energy.enemy);

// 18. Anansi silence blocks costed abilities but not role default
B=mk(['Anansi','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Zeus','Athena','Apollo','Medusa','Ares','Hercules']);
B.energy.player=100; B.energy.enemy=100;
let an=E.unitsOf(B,'player').find(u=>u.name==='Anansi');
let z3=E.unitsOf(B,'enemy').find(u=>u.name==='Zeus');
E.useAbility(B,an,an.card.ability,[z3],null);
ok(z3.flags.silence===1,'zeus silenced');
ok(!E.canUse(B,z3,z3.card.ability),'silenced blocks costed ability');
ok(E.canUse(B,z3,E.roleAbility(z3)),'silenced still allows Basic');


// 19. all six basics cost 15
Object.keys(window.EOL.roleAbilities).forEach(r=>{
  ok(window.EOL.roleAbilities[r].cost===15, r+' basic costs 15');
});

// 20. basic is unaffordable below 15 energy
B=mk(['Mordred','King Arthur','Lancelot','Guinevere','Merlin','Morgan le Fay'],
     ['Athena','Zeus','Apollo','Medusa','Ares','Hercules']);
let mm=E.unitsOf(B,'player')[0];
B.energy.player=14;
ok(!E.canUse(B,mm,E.roleAbility(mm)),'basic blocked at 14 energy');
B.energy.player=15;
ok(E.canUse(B,mm,E.roleAbility(mm)),'basic usable at 15 energy');

// 21. Kaguya copies an ally's Active (random each cast)
B=mk(['Kaguya','Apollo','Merlin','Momotaro','Medusa','Pied Piper'],
     ['Athena','Zeus','Hercules','Snow White','Ares','Mordred']);
let kag=E.unitsOf(B,'player').find(u=>u.name==='Kaguya');
let copied=[];
for(let i=0;i<6;i++){
  B.acted.player={}; B.energy.player=100;
  const before=B.log.length;
  E.useAbility(B,kag,kag.card.ability,[],null);
  const line=B.log.slice(before).find(l=>/copies/.test(l.text));
  if(line) copied.push(line.text.match(/copies (.+)\./)[1]);
}
ok(copied.length===6,'kaguya copied on all 6 casts');
const allyActives=['Sun\'s Grace','Prophecy','Legendary Companions','Petrifying Gaze','Enchanted Melody'];
ok(copied.every(c=>allyActives.indexOf(c)>=0),'only copies ally Actives -> '+[...new Set(copied)].join(', '));

// 22. Nezha: single hit on a fresh target, double hit if already damaged
B=mk(['Nezha','Mordred','King Arthur','Guinevere','Merlin','Morgan le Fay'],
     ['Athena','Zeus','Hercules','Apollo','Ares','Medusa']);
let nez=E.unitsOf(B,'player').find(u=>u.name==='Nezha');
let vic=E.unitsOf(B,'enemy').find(u=>u.name==='Hercules');
B.energy.player=100;
let hp0=vic.hp, n0=B.log.length;
E.useAbility(B,nez,nez.card.ability,[vic],null);
let hits1=B.log.slice(n0).filter(l=>l.type==='damage').length;
ok(hits1===1,'nezha hits once on undamaged target -> '+hits1);
let dmg1=hp0-vic.hp;

// same turn, damage it first with someone else, then Nezha hits twice
B=mk(['Nezha','Mordred','King Arthur','Guinevere','Merlin','Morgan le Fay'],
     ['Athena','Zeus','Hercules','Apollo','Ares','Medusa']);
nez=E.unitsOf(B,'player').find(u=>u.name==='Nezha');
vic=E.unitsOf(B,'enemy').find(u=>u.name==='Hercules');
let mord2=E.unitsOf(B,'player').find(u=>u.name==='Mordred');
B.energy.player=200;
E.useAbility(B,mord2,E.roleAbility(mord2),[vic],null);   // soften it up first
let n1=B.log.length, hpMid=vic.hp;
E.useAbility(B,nez,nez.card.ability,[vic],null);
let hits2=B.log.slice(n1).filter(l=>l.type==='damage').length;
ok(hits2===2,'nezha hits twice on already-damaged target -> '+hits2);
ok((hpMid-vic.hp) > dmg1,'follow-up deals extra damage');

// next turn the flag resets
E.setTurn(B,'enemy'); E.setTurn(B,'player');
B.acted.player={}; B.energy.player=200;
let n2=B.log.length;
E.useAbility(B,nez,nez.card.ability,[vic],null);
ok(B.log.slice(n2).filter(l=>l.type==='damage').length===1,'resets on a new turn');

// 23. no ability still references the removed swap effect
let swapRefs=0;
window.EOL.factions.forEach(f=>f.cards.forEach(c=>{
  const t=JSON.stringify(c.ability);
  if(t.indexOf('swapWithSelf')>=0) swapRefs++;
}));
ok(swapRefs===0,'no swapWithSelf left in data');

console.log(`\n${pass} passed, ${fail} failed`);
