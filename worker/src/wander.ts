// wander.ts — the human front door: dual-pane MUD + ScummVM-style view.
// One input drives both panes; every command echoes in text AND renders in
// the scene pane; the whole session is downloadable as JSON state.
// v2: edge-walk sync (screen edges are exits, the scene slides between
// rooms) + the nine-verb sentence bar (verbs + hotspots assemble the
// command visibly in the input bar — SCUMM's sentence line, typed or
// clicked, identical).
// v3: the terrain beam — a 3D view toggle in the scene pane loads
// /scene/:room (terrain's scene.json contract) and renders the same room
// walkable in Three.js; the painted 2D view stays the default. The MUD
// stays the truth; both views are shadows of the same room JSON.

export function wanderHtml(base = ""): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wander the Reef — Crab Traps</title>
<style>
:root{--hull:#0a1628;--hull2:#0e1f36;--brass:#d9a441;--brass-soft:#e8c47c;--foam:#f4f0e6;--mist:#9db4c9;--teal:#2e7d74;--card:#13233d}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--hull);color:var(--foam);font-family:Georgia,'Times New Roman',serif;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;background:var(--hull2);border-bottom:1px solid #22395c}
header h1{font-size:1.05rem;font-weight:400;letter-spacing:.08em}
header h1 b{color:var(--brass)}
#conn{font-size:.75rem;color:var(--mist);font-family:Verdana,sans-serif}
/* Sierra status HUD — one strip over both panes */
#hud{display:flex;gap:28px;align-items:center;padding:6px 18px;background:#0b1a30;border-bottom:1px solid #22395c;font-family:Verdana,sans-serif;font-size:.72rem;letter-spacing:.05em;color:var(--mist)}
#hud span{display:inline-block}
#hud-room{color:var(--brass-soft)}
#hud-health.up{color:#57c98a}
#hud-health.down{color:#c96a5a}
.tick{animation:hudtick .6s ease}
@keyframes hudtick{0%{transform:scale(1)}35%{transform:scale(1.3);color:#fff}100%{transform:scale(1)}}
main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:0}
@media(max-width:800px){main{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
/* MUD pane */
#mud{background:#081120;padding:16px;overflow-y:auto;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:.84rem;line-height:1.6;display:flex;flex-direction:column;gap:2px}
#mud .sys{color:#5c7694}
#mud .room{color:var(--brass-soft)}
#mud .txt{color:#c8d8ea}
#mud .you{color:var(--teal)}
#mud .err{color:#c96a5a}
/* Scene pane (scummvm-style) — slides between rooms */
#scene-wrap{background:var(--hull2);display:flex;flex-direction:column;position:relative;border-left:1px solid #22395c;overflow:hidden}
#scene-slide{flex:1;position:relative;overflow:hidden;transition:transform .42s ease,opacity .42s ease}
#scene{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:pointer}
#scene-cap{position:absolute;bottom:8px;left:0;right:0;text-align:center;color:var(--mist);font-size:.75rem;font-style:italic;pointer-events:none;z-index:4}
/* view toggle — the same room in two views (2D painted default, 3D terrain) */
#viewbar{position:absolute;top:10px;right:12px;z-index:5;display:flex;gap:6px}
.viewbtn{background:rgba(10,22,40,.88);color:var(--mist);border:1px solid #2c4a73;border-radius:5px;font-family:Verdana,sans-serif;font-size:.66rem;letter-spacing:.07em;text-transform:uppercase;padding:5px 11px;cursor:pointer}
.viewbtn:hover{border-color:var(--brass);color:var(--brass-soft)}
.viewbtn.active{background:var(--brass);color:var(--hull);border-color:var(--brass)}
#scene-3d{position:absolute;inset:0;display:none;background:var(--hull);cursor:crosshair}
#scene-3d canvas{display:block}
/* mint cutscene letterbox (input-lock + esc-skip by design, SCUMM cutscene opcode) */
#letterbox{position:absolute;inset:0;pointer-events:none;z-index:3}
.lb-bar{position:absolute;left:0;right:0;height:0;background:#04070d;transition:height .5s ease}
.lb-top{top:0}
.lb-bot{bottom:0}
#letterbox.on .lb-bar{height:13%}
/* nine-verb sentence rail */
#verbbar{display:flex;align-items:center;gap:6px;padding:8px 18px;background:var(--hull2);border-top:1px solid #22395c;flex-wrap:wrap}
.vb{background:transparent;color:var(--brass-soft);border:1px solid #2c4a73;border-radius:5px;font-family:Verdana,sans-serif;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;padding:5px 12px;cursor:pointer}
.vb:hover{border-color:var(--brass)}
.vb.active{background:var(--brass);color:var(--hull);border-color:var(--brass)}
#verb-hint{color:var(--mist);font-size:.7rem;font-style:italic;margin-left:auto}
#cmd.ghost{color:var(--brass-soft);font-style:italic}
/* command bar */
footer{display:flex;gap:10px;padding:10px 18px;background:var(--hull2);border-top:1px solid #22395c}
#cmd{flex:1;background:#081120;border:1px solid #2c4a73;border-radius:6px;color:var(--foam);font-family:'SF Mono',Menlo,monospace;font-size:.9rem;padding:10px 14px;outline:none}
#cmd:focus{border-color:var(--brass)}
button{background:var(--brass);border:none;border-radius:6px;color:var(--hull);font-family:Verdana,sans-serif;font-weight:bold;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;padding:0 18px;cursor:pointer}
button:hover{filter:brightness(1.1)}
#dl{background:transparent;color:var(--brass-soft);border:1px solid var(--brass)}
</style>
</head>
<body>
<header>
  <h1>Wander the Reef <b>·</b> one command, two views</h1>
  <div><span id="conn">waking the reef…</span> <button id="dl" title="download session state as JSON">⬇ state.json</button></div>
</header>
<div id="hud">
  <span id="hud-room">somewhere on the reef</span>
  <span id="hud-score">score 0</span>
  <span id="hud-bricks">bricks —</span>
  <span id="hud-health" class="down">● reef asleep</span>
</div>
<main>
  <div id="mud"></div>
  <div id="scene-wrap">
    <div id="scene-slide">
      <canvas id="scene" width="640" height="480"></canvas>
      <div id="scene-3d"></div>
    </div>
    <div id="viewbar">
      <button class="viewbtn active" id="view-2d" title="the painted ScummVM-style view">2D painted</button>
      <button class="viewbtn" id="view-3d" title="the same room, walkable — terrain's scene.json">3D walkable</button>
    </div>
    <div id="scene-cap">the same room, seen from inside — click objects, walk the edges</div>
    <div id="letterbox" class="letterbox"><div class="lb-bar lb-top"></div><div class="lb-bar lb-bot"></div></div>
  </div>
</main>
<div id="verbbar">
  <button class="vb" id="v-look" data-v="examine">Look</button>
  <button class="vb" id="v-use" data-v="use">Use</button>
  <button class="vb" id="v-talk" data-v="talk to">Talk</button>
  <button class="vb" id="v-walk" data-v="go">Walk</button>
  <button class="vb" id="v-push" data-v="push">Push</button>
  <button class="vb" id="v-pull" data-v="pull">Pull</button>
  <button class="vb" id="v-open" data-v="open">Open</button>
  <button class="vb" id="v-close" data-v="close">Close</button>
  <button class="vb" id="v-give" data-v="give">Give</button>
  <span id="verb-hint">verb → click the scene · or just type</span>
</div>
<footer>
  <input id="cmd" placeholder="look · go &lt;room&gt; · examine &lt;object&gt; · help" autocomplete="off" autofocus>
  <button id="send">Send</button>
</footer>
<script>
const API = location.origin;
const mud = document.getElementById('mud');
const cv = document.getElementById('scene');
const g = cv.getContext('2d');
const slide = document.getElementById('scene-slide');
const CAPTION_HOME = 'the same room, seen from inside — click objects, walk the edges';
let agent = 'wanderer-' + Math.random().toString(36).slice(2,7);
let room = null; const visited = new Set(); const log = []; let catches = 0;
let verb = null; // armed verb from the sentence rail (the SCUMM sentence line)

function say(cls, text){ const d=document.createElement('div'); d.className=cls; d.textContent=text; mud.appendChild(d); mud.scrollTop=mud.scrollHeight; log.push({t:Date.now(),cls,text}); }
function sceneCap(text){ const el=document.getElementById('scene-cap'); el.textContent=text; clearTimeout(sceneCap._t); sceneCap._t=setTimeout(()=>{el.textContent=CAPTION_HOME;},2600); }

// ---------- Sierra status HUD (the score ledger — one event, two renderings) ----------
function bump(id){ const el=document.getElementById(id); el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
function hudRoom(name){ const el=document.getElementById('hud-room'); el.textContent=name; bump('hud-room'); }
function hudCatch(){ catches++; const el=document.getElementById('hud-score'); el.textContent='score '+catches; bump('hud-score'); }
async function refreshBricks(){ try{ const m=await api('/map'); const n=(m.rooms||[]).length; const el=document.getElementById('hud-bricks'); el.textContent='bricks '+n; bump('hud-bricks'); }catch(e){} }

// ---------- sentence rail (the nine verbs — clicks emit parser words) ----------
document.querySelectorAll('#verbbar .vb').forEach(b=>{
  b.addEventListener('click', ()=>armVerb(b.dataset.v));
});
function armVerb(word){
  verb = (verb===word) ? null : word;
  document.querySelectorAll('#verbbar .vb').forEach(b=>b.classList.toggle('active', b.dataset.v===verb));
  const c=document.getElementById('cmd');
  if(verb){ c.value=verb+' '; c.classList.add('ghost'); } else { c.classList.remove('ghost'); }
  c.focus();
}
function setSentence(text){ const c=document.getElementById('cmd'); c.value=text; c.classList.add('ghost'); c.focus(); }
function commit(){
  if(cutscene) return; // the cutscene owns the input lock
  const c=document.getElementById('cmd'); const line=c.value; c.value='';
  c.classList.remove('ghost');
  if(verb){ verb=null; document.querySelectorAll('#verbbar .vb').forEach(b=>b.classList.remove('active')); }
  doCmd(line);
}

// ---------- scene rendering (scummvm-ish: painted backdrop + hotspots) ----------
function hash(s){let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)}
function drawScene(){
  const W=cv.width,H=cv.height;
  g.fillStyle='#0a1628'; g.fillRect(0,0,W,H);
  if(!room){ g.fillStyle='#5c7694'; g.font='16px Georgia'; g.fillText('the reef is waking…',W/2-70,H/2); return; }
  const h=hash(room.name||'reef');
  // floor + wall bands, palette seeded by room
  const hues=[[14,35],[195,40],[268,25],[160,30]];
  const [hh,ss]=hues[h%hues.length];
  const wall=g.createLinearGradient(0,0,0,H*.55); wall.addColorStop(0,'hsl('+hh+','+ss+'%,16%)'); wall.addColorStop(1,'hsl('+hh+','+ss+'%,10%)');
  g.fillStyle=wall; g.fillRect(0,0,W,H*.55); g.fillStyle='#081120'; g.fillRect(0,H*.55,W,H*.45);
  // porthole glow
  g.beginPath(); g.arc(W*.82,H*.22,44,0,7); g.fillStyle='rgba(217,164,65,.14)'; g.fill();
  g.beginPath(); g.arc(W*.82,H*.22,44,0,7); g.strokeStyle='rgba(217,164,65,.5)'; g.stroke();
  g.beginPath(); g.arc(W*.82,H*.22,26,0,7); g.fillStyle='rgba(232,196,124,.18)'; g.fill();
  // room name plaque
  g.fillStyle='rgba(13,25,45,.9)'; g.fillRect(W*.08,H*.06,Math.min(W*.6,room.name.length*11+30),38);
  g.strokeStyle='rgba(217,164,65,.7)'; g.strokeRect(W*.08,H*.06,Math.min(W*.6,room.name.length*11+30),38);
  g.fillStyle='#e8c47c'; g.font='bold 17px Georgia'; g.fillText(room.name, W*.08+14, H*.06+25);
  // exits first — doorframes live on the screen edges (behind the props:
  // AGI priority bands, doors behind pedestals, in front of south walls)
  (room.exits||[]).slice(0,4).forEach((e,i)=>{
    const side=['left','right','top','bottom'][i%4];
    let x,y,w,hgt;
    if(side==='left'){x=W*.02;y=H*.30;w=W*.09;hgt=H*.36}
    else if(side==='right'){x=W*.89;y=H*.30;w=W*.09;hgt=H*.36}
    else if(side==='top'){x=W*.60;y=H*.03;w=W*.14;hgt=H*.18}
    else{x=W*.40;y=H*.70;w=W*.12;hgt=H*.24}
    g.strokeStyle='rgba(46,125,116,.8)'; g.lineWidth=3;
    g.strokeRect(x,y,w,hgt);
    g.fillStyle='rgba(46,125,116,.12)'; g.fillRect(x,y,w,hgt);
    g.fillStyle='#7fb8ae'; g.font='11px Verdana';
    g.fillText((''+(e.name||e)).slice(0,12), x, y-6);
    e._x=x; e._y=y; e._w=w; e._h=hgt; e._side=side;
  });
  // objects as pedestaled hotspots
  (room.objects||[]).slice(0,5).forEach((o,i)=>{
    const x=W*.14+i*(W*.72/Math.max(1,Math.min(5,(room.objects||[]).length)));
    const y=H*.68; const oh=hash(o.name||o)%40;
    g.fillStyle='#13233d'; g.fillRect(x-24,y-26,48,8); // pedestal
    g.fillStyle='hsla('+(oh%360)+',35%,45%,.85)';
    g.beginPath(); g.roundRect?g.roundRect(x-16,y-60-oh*.3,32,36+oh*.3,6):g.rect(x-16,y-60-oh*.3,32,36+oh*.3); g.fill();
    g.fillStyle='rgba(232,196,124,.85)'; g.font='12px Georgia'; g.textAlign='center';
    g.fillText((o.name||o).slice(0,14), x, y+26); g.textAlign='left';
    o._x=x; o._y=y;
  });
}

// ---------- edge-walk: the screen edges are exits, the pane slides ----------
function exitSide(e){ return e._side || ['left','right','top','bottom'][hash(''+(e.name||e))%4]; }
function slideScene(side){
  const out={left:'translateX(-26%)',right:'translateX(26%)',top:'translateY(-26%)',bottom:'translateY(26%)'}[side];
  const back={left:'translateX(26%)',right:'translateX(-26%)',top:'translateY(26%)',bottom:'translateY(-26%)'}[side];
  if(!out) return;
  slide.style.transition='transform .4s ease-in,opacity .4s ease-in';
  slide.style.transform=out; slide.style.opacity='.25';
  setTimeout(()=>{
    slide.style.transition='none';
    slide.style.transform=back; slide.style.opacity='.25';
    drawScene();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      slide.style.transition='transform .42s ease-out,opacity .42s ease-out';
      slide.style.transform='translate(0,0)'; slide.style.opacity='1';
    }));
  },420);
}

// ---------- 3D pane (the terrain beam — one room, two views) ----------
// The painted canvas stays the default; the 3D toggle loads /scene/:room
// (terrain's scene.json contract, compiled server-side) and renders it with
// a minimal Three.js scene: floor, walls, ceiling, lit objects, exits as
// glowing doorways. Degrades to the 2D view if the CDN or the endpoint is
// unreachable. Clicks stay terminal commands (law 3: commands are the
// protocol) — click an object to examine it, click a doorway to go.
const scene3d = document.getElementById('scene-3d');
let viewMode = '2d'; // painted canvas is the default view
const T3 = { scene:null, camera:null, renderer:null, objs:[], keys:{}, yaw:0, pitch:0, locked:false, ray:null, loopId:0 };

function loadThree(){
  if(window.THREE) return Promise.resolve();
  if(loadThree._p) return loadThree._p;
  loadThree._p = new Promise(function(res,rej){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload=function(){ window.THREE?res():rej(new Error('three missing')); };
    s.onerror=function(){ rej(new Error('three cdn unreachable')); };
    document.head.appendChild(s);
    setTimeout(function(){ if(!window.THREE) rej(new Error('three cdn timed out')); }, 8000);
  });
  return loadThree._p;
}
function setViewBtns(){
  document.getElementById('view-2d').classList.toggle('active', viewMode==='2d');
  document.getElementById('view-3d').classList.toggle('active', viewMode==='3d');
}
function view2d(){
  if(viewMode==='2d') return;
  viewMode='2d'; setViewBtns(); stop3d();
  cv.style.display='block'; scene3d.style.display='none';
  drawScene();
}
function view3d(){
  if(viewMode==='3d') return;
  if(!room){ sceneCap('the reef is still waking — enter first'); return; }
  loadThree()
    .then(function(){ return drawScene3D(); })
    .then(function(){
      viewMode='3d'; setViewBtns();
      cv.style.display='none'; scene3d.style.display='block';
      sceneCap('3D — the same room, walkable · click to look, WASD to walk, click a doorway to go');
      start3d();
    })
    .catch(function(){ sceneCap('the 3D engine is unreachable — staying in the painted view'); });
}
function paneSize(){
  const w=scene3d.clientWidth||cv.width, h=scene3d.clientHeight||cv.height;
  return {w:w||640, h:h||480};
}
function geom3d(type){
  switch(type){
    case 'SphereGeometry': return new THREE.SphereGeometry(0.5,12,12);
    case 'CylinderGeometry': return new THREE.CylinderGeometry(0.35,0.45,1,10);
    case 'ConeGeometry': return new THREE.ConeGeometry(0.45,1,10);
    case 'TorusGeometry': return new THREE.TorusGeometry(0.4,0.15,8,16);
    case 'PlaneGeometry': return new THREE.PlaneGeometry(1,1);
    default: return new THREE.BoxGeometry(1,1,1);
  }
}
function mat3d(p,fallback){
  p=p||{};
  const m=new THREE.MeshStandardMaterial();
  m.color=new THREE.Color(p.color||fallback||'#888888');
  if(p.metalness!==undefined) m.metalness=p.metalness;
  if(p.roughness!==undefined) m.roughness=p.roughness;
  if(p.emissive){ m.emissive=new THREE.Color(p.emissive); m.emissiveIntensity=(p.emissiveIntensity!==undefined)?p.emissiveIntensity:1; }
  if(p.opacity!==undefined){ m.transparent=true; m.opacity=p.opacity; }
  return m;
}
function objMat3d(o){
  const p=o.material||{};
  const m=new THREE.MeshStandardMaterial();
  m.color=new THREE.Color(p.color||'#8899aa');
  if(p.metalness!==undefined) m.metalness=p.metalness;
  if(p.roughness!==undefined) m.roughness=p.roughness;
  if(p.emissive){ m.emissive=new THREE.Color(p.emissive); m.emissiveIntensity=(p.emissiveIntensity!==undefined)?p.emissiveIntensity:1; }
  else { m.emissive=new THREE.Color(m.color).multiplyScalar(0.55); m.emissiveIntensity=0.35; } // lit objects
  return m;
}
function label3d(text){
  const c=document.createElement('canvas'); const x=c.getContext('2d');
  x.font='bold 14px Verdana'; const w=Math.max(140, x.measureText(text).width+24);
  c.width=w; c.height=30;
  x.fillStyle='rgba(4,9,16,.88)'; x.fillRect(0,0,w,30);
  x.strokeStyle='rgba(217,164,65,.7)'; x.strokeRect(0.5,0.5,w-1,29);
  x.fillStyle='#e8c47c'; x.font='bold 14px Verdana'; x.textAlign='center'; x.textBaseline='middle';
  x.fillText(text,w/2,16);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true}));
  sp.scale.set(2.6,0.66,1);
  return sp;
}
function build3D(sj){
  const theme=sj.theme||{};
  const s=new THREE.Scene();
  s.background=new THREE.Color(theme.bg||'#0a0a1a');
  T3.objs=[];
  // floor (contract geometry)
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20), mat3d(sj.floor&&sj.floor.material,'#2a2a2a'));
  floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; s.add(floor);
  // walls — simple boxes, thick enough to read from inside
  const wm=mat3d((sj.walls&&sj.walls[0]&&sj.walls[0].material)||null,'#3a3a4a');
  function wallBox(wx,wy,wz,ww,wh,wd){ const m=new THREE.Mesh(new THREE.BoxGeometry(ww,wh,wd),wm); m.position.set(wx,wy,wz); s.add(m); }
  wallBox(0,4,-10,20,8,0.4); wallBox(0,4,10,20,8,0.4); wallBox(10,4,0,0.4,8,20); wallBox(-10,4,0,0.4,8,20);
  // ceiling
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(20,20), mat3d(sj.ceiling&&sj.ceiling.material,'#303040'));
  ceil.rotation.x=Math.PI/2; ceil.position.y=8; s.add(ceil);
  // lights — ambient, accent overhead, hemisphere fill
  s.add(new THREE.AmbientLight(0x404060,0.5));
  const accent=new THREE.Color(theme.accent||'#ffd700');
  const main=new THREE.PointLight(accent,0.9,30); main.position.set(0,6,0); s.add(main);
  s.add(new THREE.HemisphereLight(0x606080,0x303040,0.35));
  // exits — glowing doorways; clicking one executes go <target>
  (sj.exits||[]).forEach(function(ex){
    const pos=ex.position||{x:0,y:2,z:-9};
    const col=new THREE.Color(ex.color||theme.accent||'#ffd700');
    const ew=(ex.size&&ex.size.width)||3, eh=(ex.size&&ex.size.height)||4;
    const frame=new THREE.Mesh(
      new THREE.BoxGeometry(ew+0.6,eh+0.6,0.35),
      new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.55,metalness:0.8,roughness:0.2})
    );
    frame.position.set(pos.x||0,pos.y||2,pos.z||0);
    frame.userData={type:'exit',exit:ex}; s.add(frame); T3.objs.push(frame);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(ew,eh), new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.18,side:THREE.DoubleSide}));
    glow.position.set(pos.x||0,pos.y||2,(pos.z||0)+0.25); s.add(glow); T3.objs.push(glow);
    const label=label3d(ex.direction+' → '+(ex.target||'?'));
    label.position.set(pos.x||0,(pos.y||2)+eh/2+0.7,pos.z||0); s.add(label); T3.objs.push(label);
  });
  // objects — contract geometry + material, faint emissive so they read in the dark
  (sj.objects||[]).forEach(function(o){
    const mesh=new THREE.Mesh(geom3d(o.geometry&&o.geometry.type), objMat3d(o));
    const p=o.position||{};
    mesh.position.set(p.x!==undefined?p.x:0, p.y!==undefined?p.y:0.5, p.z!==undefined?p.z:0);
    if(o.scale) mesh.scale.set(o.scale.x||1,o.scale.y||1,o.scale.z||1);
    mesh.userData={type:'object',obj:o};
    s.add(mesh); T3.objs.push(mesh);
  });
  // camera from the contract
  const cp=(sj.camera&&sj.camera.position)||{x:0,y:4,z:8};
  const size=paneSize();
  T3.camera=new THREE.PerspectiveCamera((sj.camera&&sj.camera.fov)||60, size.w/size.h, 0.1, 200);
  T3.camera.position.set(cp.x||0, cp.y||4, cp.z||8);
  T3.camera.lookAt(0,1,0);
  T3.yaw=0; T3.pitch=0;
  // renderer
  if(T3.renderer) T3.renderer.dispose();
  T3.renderer=new THREE.WebGLRenderer({antialias:true});
  T3.renderer.setSize(size.w,size.h);
  T3.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  scene3d.innerHTML='';
  scene3d.appendChild(T3.renderer.domElement);
  T3.scene=s; T3.ray=new THREE.Raycaster();
  window.addEventListener('resize', resize3d);
}
function resize3d(){
  if(!T3.renderer||!T3.camera) return;
  const size=paneSize();
  T3.renderer.setSize(size.w,size.h);
  T3.camera.aspect=size.w/size.h; T3.camera.updateProjectionMatrix();
}
async function drawScene3D(){
  const r=room||{};
  const ref=(r.id!==undefined&&r.id!==null)?r.id:(r.name||'');
  if(ref==='') throw new Error('no room');
  const res=await fetch(API+'/scene/'+encodeURIComponent(String(ref)));
  if(!res.ok) throw new Error('scene '+res.status);
  build3D(await res.json());
}
// one room, one render — whichever view is live
function renderRoom(){
  if(viewMode==='3d'){
    drawScene3D().catch(function(){ view2d(); sceneCap('the 3D scene would not load — back to the painted view'); });
  } else drawScene();
}
function start3d(){ stop3d(); T3.loopId=requestAnimationFrame(loop3d); }
function stop3d(){ if(T3.loopId){ cancelAnimationFrame(T3.loopId); T3.loopId=0; } }
function loop3d(){
  if(viewMode!=='3d'||!T3.scene||!T3.renderer||!T3.camera){ stop3d(); return; }
  move3d();
  T3.renderer.render(T3.scene,T3.camera);
  T3.loopId=requestAnimationFrame(loop3d);
}
function move3d(){
  const k=T3.keys, sp=0.14;
  let f=0,r=0;
  if(k.KeyW||k.ArrowUp) f+=1; if(k.KeyS||k.ArrowDown) f-=1;
  if(k.KeyD||k.ArrowRight) r+=1; if(k.KeyA||k.ArrowLeft) r-=1;
  if(f||r){
    const y=T3.yaw;
    const dx=Math.sin(y), dz=Math.cos(y);
    const rx=Math.cos(y), rz=-Math.sin(y);
    const p=T3.camera.position;
    p.x+=(-dx*f+rx*r)*sp; p.z+=(-dz*f+rz*r)*sp;
    p.x=Math.max(-9.2,Math.min(9.2,p.x)); p.z=Math.max(-9.2,Math.min(9.2,p.z));
  }
  T3.camera.position.y=1.6; // walk, don't fly
}
document.addEventListener('keydown',e=>{ if(viewMode==='3d'&&document.activeElement&&document.activeElement.id!=='cmd') T3.keys[e.code]=true; });
document.addEventListener('keyup',e=>{ T3.keys[e.code]=false; });
scene3d.addEventListener('click', ev=>{
  if(!T3.renderer||!T3.scene) return;
  if(!T3.locked){ T3.renderer.domElement.requestPointerLock(); return; }
  T3.ray.setFromCamera(new THREE.Vector2(0,0), T3.camera); // locked: looking = clicking
  const hits=T3.ray.intersectObjects(T3.objs,true);
  if(hits.length){
    const ud=hits[0].object.userData||{};
    if(ud.type==='exit'){
      const target=(ud.exit&&ud.exit.target)||'';
      document.exitPointerLock();
      return doCmd('go '+target);
    }
    if(ud.type==='object'){
      const name=(ud.obj&&ud.obj.name)||'';
      document.exitPointerLock();
      if(verb) return setSentence(verb+' '+(name||''));
      return doCmd('examine '+(name||''));
    }
  }
  document.exitPointerLock();
});
document.addEventListener('pointerlockchange', ()=>{ T3.locked=(document.pointerLockElement===T3.renderer.domElement); });
document.getElementById('view-2d').onclick=()=>view2d();
document.getElementById('view-3d').onclick=()=>view3d();

// ---------- mint cutscene (law 5: growth is the drama) ----------
let cutscene = null; // {end} while the reef is being born
function mintCutscene(detail, after){
  const lb=document.getElementById('letterbox'); lb.classList.add('on');
  const cmd=document.getElementById('cmd'); cmd.disabled=true; // input lock — cutscene opcode
  const W=cv.width,H=cv.height;
  const cols=9,rows=5,gap=3,total=cols*rows;
  const bw=(W*.56-gap*(cols-1))/cols, bh=(H*.30-gap*(rows-1))/rows, ox=W*.22, oy=H*.36;
  const seed=hash(detail&&detail.name||'brick');
  g.fillStyle='rgba(4,9,16,.6)'; g.fillRect(0,0,W,H);
  g.textAlign='center';
  g.fillStyle='#e8c47c'; g.font='bold 18px Georgia';
  g.fillText((detail&&detail.kind==='room'?'a room is born: ':'an object surfaces: ')+((detail&&detail.name)||'?'), W/2, H*.24);
  g.fillStyle='#9db4c9'; g.font='italic 12px Georgia';
  g.fillText('brick by brick — esc or click to skip', W/2, H*.72);
  g.textAlign='left';
  let i=0;
  const timer=setInterval(()=>{
    if(i>=total){ end(); return; }
    const bx=ox+(i%cols)*(bw+gap), by=oy+((i/cols)|0)*(bh+gap);
    g.fillStyle='hsla('+((seed+i*47)%360)+',45%,'+(38+(i%3)*8)+'%,.95)';
    g.fillRect(bx,by,bw,bh);
    g.strokeStyle='rgba(217,164,65,.5)'; g.strokeRect(bx,by,bw,bh);
    i++;
  },50);
  function end(){
    if(!cutscene) return;
    clearInterval(timer); cutscene=null;
    lb.classList.remove('on'); cmd.disabled=false; cmd.focus();
    drawScene();
    if(after) after();
  }
  cutscene={end:end};
  setTimeout(()=>{ if(cutscene) end(); }, 50*total+2500); // never wedge the player
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&cutscene) cutscene.end(); }); // skip is by design

cv.addEventListener('click', ev=>{
  if(cutscene){ cutscene.end(); return; }
  const r=cv.getBoundingClientRect(); const x=(ev.clientX-r.left)*cv.width/r.width, y=(ev.clientY-r.top)*cv.height/r.height;
  // objects — armed verb? the sentence assembles in the input bar; bare click examines
  for(const o of (room&&room.objects)||[]){
    if(Math.abs(x-o._x)<34&&Math.abs(y-(o._y-30))<44){
      if(verb){ return setSentence(verb+' '+(o.name||o)); }
      return doCmd('examine '+(o.name||o));
    }
  }
  // doorframes — armed verb (other than Walk)? assemble; Walk/bare click walks
  for(const e of (room&&room.exits)||[]){
    if(x>e._x&&x<e._x+e._w&&y>e._y&&y<e._y+e._h){
      if(verb&&verb!=='go'){ return setSentence(verb+' '+(e.name||e)); }
      return doCmd('go '+(e.name||e));
    }
  }
  // screen-edge strips: walking off the edge executes go <exit>
  const mX=cv.width*.14, mY=cv.height*.12;
  let side=null;
  if(x<mX) side='left'; else if(x>cv.width-mX) side='right';
  else if(y<mY) side='top'; else if(y>cv.height-mY) side='bottom';
  if(side){
    const exits=(room&&room.exits)||[];
    const pick=exits.filter(e=>e._side===side)[0]||exits[0];
    if(pick) return doCmd('go '+(pick.name||pick));
    sceneCap('the reef ends that way — for now'); return;
  }
});

// ---------- API ----------
async function api(path,body){ const r=await fetch(API+path, body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined); const j=await r.json().catch(function(){return {success:false,error:'the reef spoke in an unknown tongue ('+r.status+')'}}); if(!r.ok || j.success===false) throw new Error(j.error||('request failed ('+r.status+')')); return j; }
async function enter(){ try{ const s=await api('/enter?agent='+agent); room=s.room; visited.add(room.name); hudRoom(room.name); const hp=document.getElementById('hud-health'); hp.textContent='● reef awake'; hp.className='up'; say('sys','you are '+agent); say('room','— '+room.name+' —'); if(room.description) say('txt',room.description); say('sys','type help, arm a verb then click the scene, or walk the screen edges'); document.getElementById('conn').textContent='● on the reef'; renderRoom(); refreshBricks(); }catch(e){ const hp=document.getElementById('hud-health'); hp.textContent='● reef asleep'; hp.className='down'; say('err','the reef is asleep ('+e.message+') — try again soon'); document.getElementById('conn').textContent='● reef asleep'; } }
// ---------- punchline parser (Huh? is banned — every refusal is a hint) ----------
const QUIPS=[
  "You can't {v} the {o}. It's load-bearing — for the whole reef, probably.",
  "That's not the kind of thing you can {v}, no matter how generous you feel.",
  "You {v} the {o}. The {o} remains diplomatically unmoved.",
  "The {o} considers your attempt to {v} it, and declines with courtesy.",
  "You can't {v} the {o} — the tide would only laugh, and the tide is a cruel audience.",
  "I've seen adventurers with bigger arms try to {v} that {o}. The {o} won.",
  "Not now — the {o} is resting. It never answers {v} on an empty tide.",
  "That's the second-biggest attempt to {v} a {o} I've ever seen.",
  "Legends speak of a crab who tried to {v} the {o}. They never found the shell.",
  "The reef respects ambition, but {v} is above its pay grade."
];
const HINTS=[
  "(try examine {o} — looking is always free)",
  "(the reef honors go · look · examine · catch)",
  "(go <exit> is how you walk the reef)",
  "(examine {o} first — know it before you manhandle it)",
  "(type help when the tide confuses you)"
];
function punchline(cmd){
  const m=cmd.match(/^(\\S+(?:\\s+to)?)\\s+(.+)$/);
  const v=m?m[1]:'do that';
  const o=(m?m[2]:'that').replace(/^the\\s+/i,'');
  const q=QUIPS[hash(cmd)%QUIPS.length].replace(/\\{v\\}/g,v).replace(/\\{o\\}/g,o);
  const h=HINTS[hash(cmd+'?')%HINTS.length].replace(/\\{o\\}/g,o);
  say('err',q+' '+h);
  sceneCap(q);
}

async function doCmd(raw){
  const line=raw.trim(); if(!line) return; say('you','> '+line);
  const lc=line.toLowerCase();
  try{
    if(lc==='help'){ say('sys','go <exit> · examine <object> · look · catch <json> · score · the verb rail + scene clicks speak the same grammar'); return; }
    if(lc==='score'){ const b=document.getElementById('hud-bricks'); say('sys','score '+catches+' catch'+(catches===1?'':'es')+' this session · '+b.textContent+' in the reef'); bump('hud-score'); bump('hud-bricks'); return; }
    if(lc==='look'||lc==='l'){ const s=await api('/look?agent='+agent); if(!s.room) throw new Error('the reef lost your feet — enter again'); room=s.room; hudRoom(room.name); say('room','— '+room.name+' —'); if(room.description) say('txt',room.description); (room.objects||[]).forEach(o=>say('sys','  · '+(o.name||o))); (room.exits||[]).forEach(e=>say('sys','  → '+(e.name||e))); renderRoom(); return; }
    if(lc.startsWith('go ')||lc.startsWith('move ')){ const t=encodeURIComponent(line.slice(3).trim()); const s=await api('/go?agent='+agent+'&to='+t); if(s.error){ say('err',s.error); return; } const from=room; room=s.room; visited.add(room.name); hudRoom(room.name); const ex=((from&&from.exits)||[]).filter(e=>(''+(e.name||e)).toLowerCase()===decodeURIComponent(t).toLowerCase())[0]; say('room','— '+room.name+' —'); if(room.description) say('txt',room.description); renderRoom(); if(viewMode==='2d') slideScene(exitSide(ex||{})); return; }
    if(lc.startsWith('examine ')||lc.startsWith('x ')||lc.startsWith('interact ')){ const t=encodeURIComponent(line.replace(/^\\w+\\s+/,'')); const s=await api('/interact?agent='+agent+'&obj='+t,{}); say('txt', s.lore||s.description||s.error||'nothing special'); return; }
    if(lc.startsWith('catch ')){ const s=await api('/catch',{agent,room:room&&room.name,payload:line.slice(6)}); hudCatch();
      if(s.minted){
        const d=s.minted_detail||{};
        say('sys','catch accepted — the reef grew: '+s.minted);
        say('txt','this '+(d.kind==='room'?'room':'object')+' exists because '+agent+' submitted catch #'+(d.created_from_catch||'?')+' — your name is on the birth certificate');
        sceneCap('the reef grew');
        if(viewMode==='3d') view2d(); // the cutscene owns the pane — letterbox over the painted canvas
        mintCutscene(d, async()=>{ try{ const s2=await api('/look?agent='+agent); if(s2.room){ room=s2.room; renderRoom(); } }catch(e){} refreshBricks(); });
      } else { say('sys','catch accepted — recorded'); }
      return; }
    // nine-verb routing: walk to a real exit walks; everything else earns a refusal
    const vm=line.match(/^(use|talk to|talk|push|pull|open|close|give|walk(?:\\s+to)?)\\s+(.+)$/i);
    if(vm){
      const v=vm[1].toLowerCase(), objTxt=vm[2];
      if(v==='walk'||v==='walk to'){
        const ex=((room&&room.exits)||[]).filter(e=>(''+(e.name||e)).toLowerCase()===objTxt.toLowerCase())[0];
        if(ex) return doCmd('go '+objTxt);
      }
      return punchline(v+' '+objTxt);
    }
    return punchline(line);
  }catch(e){ say('err',e.message); }
}
document.getElementById('send').onclick=commit;
document.getElementById('cmd').addEventListener('keydown',e=>{if(e.key==='Enter')commit();});
document.getElementById('cmd').addEventListener('input',e=>e.target.classList.remove('ghost'));
document.getElementById('dl').onclick=()=>{
  const state={agent,rooms_visited:[...visited],commands:log,catches,exported_at:new Date().toISOString(),note:'state of a wander — crab-traps reef'};
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})); a.download='reef-state.json'; a.click();
  say('sys','state downloaded');
};
enter();
</script>
</body>
</html>`;
}
