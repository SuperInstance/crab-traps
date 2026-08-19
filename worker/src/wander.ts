// wander.ts — the human front door: dual-pane MUD + ScummVM-style view.
// One input drives both panes; every command echoes in text AND renders in
// the scene pane; the whole session is downloadable as JSON state.

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
main{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:0}
@media(max-width:800px){main{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
/* MUD pane */
#mud{background:#081120;padding:16px;overflow-y:auto;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:.84rem;line-height:1.6;display:flex;flex-direction:column;gap:2px}
#mud .sys{color:#5c7694}
#mud .room{color:var(--brass-soft)}
#mud .txt{color:#c8d8ea}
#mud .you{color:var(--teal)}
#mud .err{color:#c96a5a}
/* Scene pane (scummvm-style) */
#scene-wrap{background:var(--hull2);display:flex;flex-direction:column;position:relative;border-left:1px solid #22395c}
#scene{flex:1;width:100%;display:block;cursor:pointer}
#scene-cap{position:absolute;bottom:8px;left:0;right:0;text-align:center;color:var(--mist);font-size:.75rem;font-style:italic;pointer-events:none}
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
<main>
  <div id="mud"></div>
  <div id="scene-wrap">
    <canvas id="scene" width="640" height="480"></canvas>
    <div id="scene-cap">the same room, seen from inside — click objects to examine</div>
  </div>
</main>
<footer>
  <input id="cmd" placeholder="look · go &lt;room&gt; · examine &lt;object&gt; · help" autocomplete="off" autofocus>
  <button id="send">Send</button>
</footer>
<script>
const API = location.origin;
const mud = document.getElementById('mud');
const cv = document.getElementById('scene');
const g = cv.getContext('2d');
let agent = 'wanderer-' + Math.random().toString(36).slice(2,7);
let room = null; const visited = new Set(); const log = []; let catches = 0;

function say(cls, text){ const d=document.createElement('div'); d.className=cls; d.textContent=text; mud.appendChild(d); mud.scrollTop=mud.scrollHeight; log.push({t:Date.now(),cls,text}); }

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
  const floor=g.createLinearGradient(0,H*.55,0,H); floor.addColorStop(0,'hsl('+hh+','+ss+'%',8%')'.replace('%\\')||'hsl('+hh+','+ss+'%,8%)'); floor.addColorStop(1,'#050b14');
  g.fillStyle=wall; g.fillRect(0,0,W,H*.55); g.fillStyle='#081120'; g.fillRect(0,H*.55,W,H*.45);
  // porthole glow
  g.beginPath(); g.arc(W*.82,H*.22,44,0,7); g.fillStyle='rgba(217,164,65,.14)'; g.fill();
  g.beginPath(); g.arc(W*.82,H*.22,44,0,7); g.strokeStyle='rgba(217,164,65,.5)'; g.stroke();
  g.beginPath(); g.arc(W*.82,H*.22,26,0,7); g.fillStyle='rgba(232,196,124,.18)'; g.fill();
  // room name plaque
  g.fillStyle='rgba(13,25,45,.9)'; g.fillRect(W*.08,H*.06,Math.min(W*.6,room.name.length*11+30),38);
  g.strokeStyle='rgba(217,164,65,.7)'; g.strokeRect(W*.08,H*.06,Math.min(W*.6,room.name.length*11+30),38);
  g.fillStyle='#e8c47c'; g.font='bold 17px Georgia'; g.fillText(room.name, W*.08+14, H*.06+25);
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
  // exits as labelled doorframes
  (room.exits||[]).slice(0,4).forEach((e,i)=>{
    const x=W*.10+i*90, y=H*.18;
    g.strokeStyle='rgba(46,125,116,.8)'; g.lineWidth=3;
    g.strokeRect(x,y,54,H*.34);
    g.fillStyle='rgba(46,125,116,.12)'; g.fillRect(x,y,54,H*.34);
    g.fillStyle='#7fb8ae'; g.font='11px Verdana';
    g.fillText((''+(e.name||e)).slice(0,12), x, y-6);
    e._x=x; e._y=y;
  });
}
cv.addEventListener('click', ev=>{
  const r=cv.getBoundingClientRect(); const x=(ev.clientX-r.left)*cv.width/r.width, y=(ev.clientY-r.top)*cv.height/r.height;
  for(const o of (room&&room.objects)||[]) if(Math.abs(x-o._x)<34&&Math.abs(y-(o._y-30))<44) return doCmd('examine '+(o.name||o));
  for(const e of (room&&room.exits)||[]) if(x>e._x&&x<e._x+54&&y>e._y&&y<e._y+cv.height*.34) return doCmd('go '+(e.name||e));
});

// ---------- API ----------
async function api(path,body){ const r=await fetch(API+path, body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined); return r.json(); }
async function enter(){ try{ const s=await api('/enter?agent='+agent); room=s.room||s; visited.add(room.name); say('sys','you are '+agent); say('room','— '+room.name+' —'); if(room.description) say('txt',room.description); say('sys','type help, or click things in the scene pane'); document.getElementById('conn').textContent='● on the reef'; drawScene(); }catch(e){ say('err','the reef is asleep ('+e.message+') — try again soon'); document.getElementById('conn').textContent='● reef asleep'; } }
async function doCmd(raw){
  const line=raw.trim(); if(!line) return; say('you','> '+line);
  const lc=line.toLowerCase();
  try{
    if(lc==='help'){ say('sys','go <exit> · examine <object> · look · catch <json> · the scene pane is clickable'); return; }
    if(lc==='look'||lc==='l'){ const s=await api('/look?agent='+agent); room=s.room||s; say('room','— '+room.name+' —'); if(room.description) say('txt',room.description); (room.objects||[]).forEach(o=>say('sys','  · '+(o.name||o))); (room.exits||[]).forEach(e=>say('sys','  → '+(e.name||e))); drawScene(); return; }
    if(lc.startsWith('go ')||lc.startsWith('move ')){ const t=encodeURIComponent(line.slice(3).trim()); const s=await api('/go?agent='+agent+'&to='+t); if(s.error){ say('err',s.error); return; } room=s.room||s; visited.add(room.name); say('room','— '+room.name+' —'); if(room.description) say('txt',room.description); drawScene(); return; }
    if(lc.startsWith('examine ')||lc.startsWith('x ')||lc.startsWith('interact ')){ const t=encodeURIComponent(line.replace(/^\\w+\\s+/,'')); const s=await api('/interact?agent='+agent+'&obj='+t); say('txt', s.lore||s.description||s.error||'nothing special'); return; }
    if(lc.startsWith('catch ')){ const s=await api('/catch',{agent,room:room&&room.name,payload:line.slice(6)}); catches++; say('sys','catch accepted — '+(s.minted?('the reef grew: '+s.minted):'recorded')); if(s.room){room=s.room; drawScene();} return; }
    say('err',"unknown command — try help");
  }catch(e){ say('err',e.message); }
}
document.getElementById('send').onclick=()=>{const c=document.getElementById('cmd');doCmd(c.value);c.value='';};
document.getElementById('cmd').addEventListener('keydown',e=>{if(e.key==='Enter'){const c=e.target;doCmd(c.value);c.value='';}});
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
