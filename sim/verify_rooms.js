/* =============================================================
   PRIVATE ROOMS + CRAZYGAMES MULTIPLAYER COMPLIANCE
   node sim/verify_rooms.js
   -------------------------------------------------------------
   Two halves.

   BEHAVIOUR. js/mp.js is driven against a fake Supabase and a fake
   CrazyGames SDK, so the room lifecycle is exercised for real:
   create, join, the party leader's exclusive control of the
   settings, starting, and the errors a player can actually hit.

   COMPLIANCE. CrazyGames REJECTS a game from the Multiplayer
   category unless it reports room data, offers an invite link and
   button, and honours isInstantMultiplayer. Those are asserted on
   the calls the bridge actually makes, not on the source text.

   The fakes are deliberate: there is no Supabase and no portal in
   CI, and the point is to test OUR logic, not theirs.
   ============================================================= */
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};

/* ---- fake server ---- */
function makeDB(){
  const rooms=new Map(),matches=new Map();
  let seq=0;
  return {rooms,matches,
    rpc(name,args,uid,uname){
      if(name==='create_room'){
        const code='ROOM'+(++seq);
        const r={code,leader:uid,leader_name:uname,guest:null,guest_name:null,
                 settings:args.p_settings||{},status:'open',match_id:null};
        rooms.set(code,r);return {data:r};
      }
      if(name==='join_room'){
        const r=rooms.get(args.p_code);
        if(!r)return{error:{message:'room not found'}};
        if(r.leader===uid||r.guest===uid)return{data:r};
        if(r.guest)return{error:{message:'room full'}};
        r.guest=uid;r.guest_name=uname;r.status='ready';return{data:r};
      }
      if(name==='set_room_settings'){
        const r=rooms.get(args.p_code);
        if(!r||r.leader!==uid)return{error:{message:'not the party leader'}};
        r.settings=args.p_settings;return{data:r};
      }
      if(name==='start_room'){
        const r=rooms.get(args.p_code);
        if(!r)return{error:{message:'room not found'}};
        if(r.leader!==uid)return{error:{message:'not the party leader'}};
        if(!r.guest)return{error:{message:'nobody has joined yet'}};
        const m={id:'M'+(++seq),mode:r.settings.mode==='classic'?'classic':'draft',
                 seed:12345,p1:r.leader,p2:r.guest,p1_name:r.leader_name,p2_name:r.guest_name,status:'active'};
        matches.set(m.id,m);r.match_id=m.id;r.status='closed';return{data:m};
      }
      if(name==='find_my_room'){
        for(const r of rooms.values())
          if((r.leader===uid||r.guest===uid)&&r.status!=='closed')return{data:r};
        return{data:null};
      }
      if(name==='player_exists')return{data:args.p_handle.toLowerCase()==='rival'};
      if(name==='touch_room'||name==='touch_match')return{data:null};
      return{data:null};
    }};
}

function makeClient(db,uid,uname){
  /* must be a REAL promise: a hand-rolled thenable that calls f(v)
     eagerly turns a throw inside onFulfilled into a synchronous
     exception, which no .catch() could ever see */
  const thenable=v=>Promise.resolve(v);
  return {
    rpc:(n,a)=>thenable(db.rpc(n,a||{},uid,uname)),
    from:(t)=>{
      const q={_code:null,_id:null,
        select(){return q;},
        eq(col,v){if(col==='code')q._code=v;if(col==='id')q._id=v;return q;},
        or(){return q;},limit(){return q;},
        then(f){
          if(t==='mp_rooms'){const r=db.rooms.get(q._code);return Promise.resolve(f({data:r?[r]:[]}));}
          if(t==='mp_matches'){const m=db.matches.get(q._id);return Promise.resolve(f({data:m?[m]:[]}));}
          return Promise.resolve(f({data:[]}));
        }};
      return q;
    },
    channel:()=>({on(){return this;},subscribe(cb){cb&&cb('SUBSCRIBED');return this;},
                  track(){},send(){return Promise.resolve();},unsubscribe(){}}),
  };
}

/* ---- load mp.js in a sandbox ---- */
function loadMP(db,uid,uname,cg){
  const w={EOL:{}};
  w.EOL.auth={isReady:()=>true,rawClient:()=>makeClient(db,uid,uname),
              user:()=>({id:uid,name:uname}),isAnonymous:()=>false};
  w.EOL.platform={canPlayOnline:true};
  if(cg)w.EOL.crazygames=cg;
  w.location={href:'https://example.com/play',search:''};
  const sandbox={window:w,console,setInterval:()=>0,clearInterval:()=>{},
                 URL,URLSearchParams,Promise,Date,Math,String,Number,Object,Array,JSON};
  const src=fs.readFileSync(path.join(ROOT,'js/mp.js'),'utf8');
  const keys=Object.keys(sandbox);
  new Function(...keys,src)(...keys.map(k=>sandbox[k]));
  return w.EOL.mp;
}

/* ---- fake CG SDK that records what the portal was told ---- */
function makeCG(opts){
  const log=[];
  return {log,
    isReady:()=>true,
    updateRoom:(i)=>log.push(['updateRoom',JSON.stringify(i)]),
    leftRoom:()=>log.push(['leftRoom']),
    showInviteButton:(p)=>{log.push(['showInviteButton',JSON.stringify(p)]);return 'https://cg/inv';},
    hideInviteButton:()=>log.push(['hideInviteButton']),
    inviteLink:(p)=>{log.push(['inviteLink',JSON.stringify(p)]);return 'https://crazygames.com/g?room='+p.room;},
    inviteParam:(k)=>(opts.inviteParams||{})[k]||null,
    inviteParams:()=>opts.inviteParams||null,
    onJoinRoom:(fn)=>{opts.joinFn=fn;return ()=>{};},
    isInstantMultiplayer:()=>!!opts.instant,
  };
}

(async()=>{
console.log('LIFECYCLE: leader creates, guest joins, leader starts');
{
  const db=makeDB();
  const cgL=makeCG({}),cgG=makeCG({});
  const L=loadMP(db,'u-leader','Leader',cgL);
  const G=loadMP(db,'u-guest','Guest',cgG);
  const r=await L.createRoom({mode:'classic',length:'unabridged',field:null,pool:null});
  ok(!!r.code,'leader got a room code ('+r.code+')');
  ok(L.isLeader(),'creator is the party leader');
  const gr=await G.joinRoom(r.code);
  ok(gr.guest==='u-guest','guest occupies the second seat');
  ok(!G.isLeader(),'joiner is NOT the party leader');
  await L.setRoomSettings({mode:'classic',length:'unabridged',field:'colosseum',pool:null});
  ok(db.rooms.get(r.code).settings.field==='colosseum','leader can set the battlefield');
  let denied=false;
  try{await G.setRoomSettings({mode:'draft'});}catch(e){denied=true;}
  ok(denied,'guest CANNOT change the settings');
  const m=await L.startRoom();
  ok(m&&m.mode==='classic',"match inherits the leader's mode");
  ok(m.host===true,'leader is the host (p1)');
}

console.log('\nCG COMPLIANCE: room data + invite button');
{
  const db=makeDB();const cg=makeCG({});
  const L=loadMP(db,'u1','One',cg);
  const r=await L.createRoom(L.roomDefaults());
  const upd=cg.log.filter(e=>e[0]==='updateRoom');
  ok(upd.length>0,'updateRoom was called when the room opened');
  ok(/"roomId":"ROOM1"/.test(upd[0][1]),'reported roomId is the room code');
  ok(/"isJoinable":true/.test(upd[0][1]),'an empty room reports isJoinable:true');
  ok(cg.log.some(e=>e[0]==='showInviteButton'),'invite button shown while joinable');
  const link=L.inviteLink();
  ok(/room=ROOM1/.test(link),'invite link carries the room ('+link+')');
  const G=loadMP(db,'u2','Two',makeCG({}));
  await G.joinRoom(r.code);
  await new Promise(s=>setTimeout(s,10));
  await L.startRoom();
  const last=cg.log.filter(e=>e[0]==='updateRoom').pop();
  ok(/"isJoinable":false/.test(last[1]),'a started match reports isJoinable:false');
  ok(cg.log.some(e=>e[0]==='hideInviteButton'),'invite button hidden once not joinable');
  await L.leave();
  ok(cg.log.some(e=>e[0]==='leftRoom'),'leftRoom called on exit');
}

console.log('\nENTRY PATHS');
{
  const db=makeDB();
  const host=loadMP(db,'u1','One',makeCG({}));
  const hr=await host.createRoom(host.roomDefaults());
  // 1. started FROM an invite link
  const cg2=makeCG({inviteParams:{room:hr.code}});
  const joiner=loadMP(db,'u2','Two',cg2);
  const res=await joiner.bootstrap();
  ok(res.action==='joined','invite-link boot joins the room automatically');
  ok(res.room.code===hr.code,'joined the room named in the link');
  // 2. instant multiplayer
  const db2=makeDB();
  const cg3=makeCG({instant:true});
  const inst=loadMP(db2,'u9','Nine',cg3);
  const res2=await inst.bootstrap();
  ok(res2.action==='leading','isInstantMultiplayer opens a private room directly');
  ok(res2.instant===true,'flagged as an instant-multiplayer launch');
  ok(db2.rooms.size===1,'exactly one room was created');
  const only=[...db2.rooms.values()][0];
  ok(only.status==='open'&&!only.guest,'that room is immediately joinable by a friend');
  // 3. joined while already running
  const db3=makeDB();
  const a=loadMP(db3,'ua','A',makeCG({}));
  const ar=await a.createRoom(a.roomDefaults());
  const opts={};const cg4=makeCG(opts);
  const b=loadMP(db3,'ub','B',cg4);
  await b.bootstrap();
  ok(typeof opts.joinFn==='function','join-room listener registered at boot');
  opts.joinFn({room:ar.code});
  await new Promise(s=>setTimeout(s,20));
  ok(db3.rooms.get(ar.code).guest==='ub','accepting an invite mid-session joins without reload');
}

console.log('\nERRORS + WEB BUILD');
{
  const db=makeDB();
  const a=loadMP(db,'ua','A',null); // no SDK at all = web build
  const r=await a.createRoom(a.roomDefaults());
  ok(!!r.code,'rooms work with no CrazyGames SDK present');
  ok(/room=/.test(a.inviteLink()),'web build builds its own invite link');
  const b=loadMP(db,'ub','B',null);
  const c=loadMP(db,'uc','C',null);
  await b.joinRoom(r.code);
  let errText=null;
  c.on('roomError',e=>{errText=e.text;});
  try{await c.joinRoom(r.code);}catch(e){}
  ok(/already full/.test(errText||''),'third player is told the room is full');
  let e2=null;c.on('roomError',e=>{e2=e.text;});
  try{await c.joinRoom('NOPE99');}catch(e){}
  ok(/No room with that code/.test(e2||''),'bad code gives a readable error');
  ok(await a.playerExists('rival'),'playerExists finds a known handle');
  ok(!(await a.playerExists('ghost')),'playerExists rejects an unknown handle');
}

console.log('\nUI WIRING');
{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const play=fs.readFileSync(path.join(ROOT,'js/play.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'css/style.css'),'utf8');
  const {JSDOM}=require('jsdom');

const doc=new JSDOM(html).window.document;

/* 1. every $('...') inside initRooms must resolve */
const start=play.indexOf('function initRooms(');
const end=play.indexOf('\n  }',play.indexOf('MP.on(\'roomJoined\'',start));
const body=play.slice(start,end);
ok(body.length>1000,'initRooms body located');
const ids=[...new Set([...body.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(m=>m[1]))];
console.log('ids referenced by initRooms:',ids.length);
ids.forEach(id=>ok(doc.getElementById(id),'#'+id+' exists in index.html'));

/* 2. selectors the controller queries must match something */
[['.room-pill',2],['.room-opt[data-opt="pool"]',1]].forEach(([sel,min])=>{
  ok(doc.querySelectorAll(sel).length>=min,sel+' matches >= '+min+' node(s)');
});

/* 3. every data-set pill must name a real setting key */
const keys=['mode','length','field','pool'];
[...doc.querySelectorAll('.room-pill')].forEach(b=>{
  ok(keys.includes(b.dataset.set),'pill data-set="'+b.dataset.set+'" is a known setting');
  ok(!!b.dataset.val,'pill for '+b.dataset.set+' has a value');
});

/* 4. the mode card that opens it */
ok(doc.getElementById('mode-mp-room'),'Private Room mode card present');
ok(/mode-mp-room/.test(play),'mode-mp-room is bound in play.js');

/* 5. CSS for every class used in the room markup */
const modal=doc.getElementById('room-modal');
const classes=new Set();
modal.querySelectorAll('*').forEach(n=>n.classList.forEach(c=>classes.add(c)));
[...classes].filter(c=>c.startsWith('room-')).forEach(c=>{
  ok(css.includes('.'+c),'CSS defines .'+c);
});

/* 6. the modal starts hidden */
ok(modal.hasAttribute('hidden'),'room modal is hidden by default');
ok(doc.getElementById('room-lobby').hasAttribute('hidden'),'lobby face hidden by default');
ok(!doc.getElementById('room-door').hasAttribute('hidden'),'door face visible by default');

/* 7. start button cannot be pressed before anyone joins */
ok(doc.getElementById('room-start').hasAttribute('disabled'),'Start begins disabled');

}

console.log('\npass '+pass+'  fail '+fail);
process.exit(fail?1:0);
})();
