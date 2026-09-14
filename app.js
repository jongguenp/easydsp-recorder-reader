(()=>{"use strict";
const $=id=>document.getElementById(id),P=16,SKEY="easydsp-rec-settings-v3",DBNAME="easydsp-rec-db",STORE="files";
const state={ts:1,files:[],aliases:{},colors:{},units:{},visible:{},fileVisible:{},derived:[],scale:"common",zero:false,view:{start:0,end:1},cursorA:null,cursorB:null,nextCursor:"A"};
const palette=["#2563eb","#dc2626","#059669","#7c3aed","#d97706","#0891b2","#db2777","#4f46e5"];
class RecError extends Error{}
function ascii(u){let s="",c=8192;for(let i=0;i<u.length;i+=c)s+=String.fromCharCode(...u.subarray(i,Math.min(i+c,u.length)));return s}
function readCString(u,start,max=80){let end=start;while(end<u.length&&end<start+max&&u[end]!==0)end++;return ascii(u.subarray(start,end)).trim()}
function channels(u){
 const h=ascii(u.subarray(0,Math.min(4096,u.length))),re=/m_DATA\d+/g,seen=new Set(),a=[];let m;
 while((m=re.exec(h)))if(!seen.has(m[0])){seen.add(m[0]);a.push({name:m[0],off:m.index})}
 if(a.length)return a.sort((x,y)=>+x.name.split("DATA")[1]-+y.name.split("DATA")[1]);
 const slots=[128,228,328,428,528,628,728,828],fallback=[];
 for(const off of slots){const name=readCString(u,off);if(!/^[A-Za-z_][A-Za-z0-9_.]*(?:\[\d+\])?$/.test(name))return[];fallback.push({name,off})}
 return fallback
}
function score(v,start,counts){
 let p=start,s=0;
 try{for(const n of counts){if(n<2)return-1;const ids=[...new Set([0,Math.min(1,n-1),Math.min(2,n-1),n-1])];let prev=null;
  for(const i of ids){const o=p+i*P;if(o+16>v.byteLength)return-1;const x=v.getFloat64(o,true),y=v.getFloat64(o+8,true);if(!Number.isFinite(x)||!Number.isFinite(y))return-1;if(prev!==null&&x>=prev)s+=3;if(Math.abs(x-i)<1e-9)s+=2;prev=x}p+=n*P}}
 catch{return-1}return s
}
function infer(u,ch){
 if(!ch.length)throw new RecError("REC 채널 이름을 찾지 못했습니다.");
 const v=new DataView(u.buffer,u.byteOffset,u.byteLength),n=ch.length,start=Math.max(...ch.map(x=>x.off))+8,end=Math.min(4096,u.length-4*n),cand=[];
 for(let o=Math.ceil(start/4)*4;o<end;o+=4){let counts=[],tot=0,ok=true;for(let i=0;i<n;i++){const c=v.getUint32(o+4*i,true);if(c<2||c>1e7){ok=false;break}counts.push(c);tot+=c}if(!ok)continue;const ds=u.length-P*tot;if(ds<=o||ds<0||ds%8)continue;const sc=score(v,ds,counts);if(sc>=6*n)cand.push({o,counts,ds,sc})}
 if(!cand.length)throw new RecError("지원하지 않는 REC 형식입니다.");cand.sort((a,b)=>b.sc-a.sc||a.o-b.o);return cand[0]
}
function parse(buf,name){
 const u=new Uint8Array(buf);if(u.length<256)throw new RecError("REC 파일이 너무 작습니다.");
 const ch=channels(u),inf=infer(u,ch),v=new DataView(u.buffer,u.byteOffset,u.byteLength);let p=inf.ds,out=[];
 ch.forEach((c,k)=>{const n=inf.counts[k],tx=[],ty=[];for(let i=0;i<n;i++){const xv=v.getFloat64(p+i*P,true),yv=v.getFloat64(p+i*P+8,true);if(Number.isFinite(xv)&&Number.isFinite(yv)&&Math.abs(yv)<1e300){tx.push(xv);ty.push(yv)}}out.push({name:c.name,x:Float64Array.from(tx),y:Float64Array.from(ty)});p+=n*P});
 if(p!==u.length)throw new RecError("payload 길이가 일치하지 않습니다.");
 return{id:crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random(),name,channels:out}
}
function fileId(name,buf){const u=new Uint8Array(buf),step=Math.max(1,Math.floor(u.length/64));let h=2166136261>>>0;for(let i=0;i<u.length;i+=step){h^=u[i];h=Math.imul(h,16777619)>>>0}for(let i=0;i<name.length;i++){h^=name.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return "f"+h.toString(16)+"-"+u.length}\nfunction dbOpen(){return new Promise((resolve,reject)=>{if(!("indexedDB"in window))return resolve(null);const q=indexedDB.open(DBNAME,1);q.onupgradeneeded=()=>{const db=q.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"})};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}\nasync function dbPut(rec){const db=await dbOpen();if(!db)return;return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(rec);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}\nasync function dbDelete(id){const db=await dbOpen();if(!db)return;return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}\nasync function dbClear(){const db=await dbOpen();if(!db)return;return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}\nasync function dbAll(){const db=await dbOpen();if(!db)return[];return new Promise((resolve,reject)=>{const q=db.transaction(STORE,"readonly").objectStore(STORE).getAll();q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error)})}\nfunction load(){try{const s=JSON.parse(localStorage.getItem(SKEY)||localStorage.getItem("easydsp-rec-settings-v1")||"{}");Object.assign(state,{ts:+s.ts||1,aliases:s.aliases||{},colors:s.colors||{},visible:s.visible||{},scale:s.scale||"common",zero:!!s.zero,derived:s.derived||[]})}catch{}}
function save(){localStorage.setItem(SKEY,JSON.stringify({ts:state.ts,aliases:state.aliases,colors:state.colors,visible:state.visible,scale:state.scale,zero:state.zero,derived:state.derived.map(d=>({a:d.a,b:d.b,name:d.name,color:d.color}))}));alert("설정을 저장했습니다.")}
function sid(f,c){return f.id+"::"+c.name}
function alias(n){return state.aliases[n]||n}
function color(n){if(!state.colors[n])state.colors[n]=palette[(+(n.match(/\d+/)||[0])[0])%palette.length];return state.colors[n]}
function base(){let a=[];for(const f of state.files)for(const c of f.channels){const id=sid(f,c);a.push({id,file:f.name,original:c.name,name:alias(c.name),color:color(c.name),x:c.x,y:c.y,visible:state.visible[id]!==false})}return a}
function all(){const b=base(),map=new Map(b.map(x=>[x.id,x])),d=[];for(const q of state.derived){const A=map.get(q.a),B=map.get(q.b);if(!A||!B)continue;const n=Math.min(A.y.length,B.y.length),y=new Float64Array(n),x=new Float64Array(n);for(let i=0;i<n;i++){x[i]=i;y[i]=A.y[i]-B.y[i]}d.push({id:"d:"+q.a+"-"+q.b+"-"+q.name,file:"계산",original:q.name,name:q.name,color:q.color||"#111827",x,y,visible:true,derived:true})}return b.concat(d)}
function visibleSeries(){return all().filter(s=>s.visible)}
function fmt(v){if(!Number.isFinite(v))return"-";const a=Math.abs(v);return a>=1e4||a&&a<1e-3?v.toExponential(4):v.toFixed(4).replace(/\.?0+$/,"")}
function time(i){return i*state.ts/1000}
function maxN(){const s=visibleSeries();return s.length?Math.max(...s.map(x=>x.y.length)):0}
function clampView(){let a=Math.max(0,Math.min(.999999,state.view.start)),b=Math.max(.000001,Math.min(1,state.view.end));if(b-a<.002){const m=(a+b)/2;a=m-.001;b=m+.001}if(a<0){b-=a;a=0}if(b>1){a-=b-1;b=1}state.view.start=Math.max(0,a);state.view.end=Math.min(1,b)}
function resetView(){state.view={start:0,end:1};draw()}
function viewIndices(n){if(n<=1)return[0,0];clampView();return[Math.floor(state.view.start*(n-1)),Math.max(1,Math.ceil(state.view.end*(n-1)))]}
function renderFiles(){$("files").innerHTML=state.files.length?state.files.map(f=>`<div><b>${f.name}</b><div class="hint">${f.channels.length} channels · ${f.channels[0]?.y.length||0} samples</div></div>`).join(""):'<div class="empty">REC 파일을 선택하세요.</div>'}
function renderChannels(){const list=$("channelList"),items=base();if(!items.length){list.innerHTML='<div class="empty">REC 파일을 먼저 열어주세요.</div>';return}list.innerHTML=items.map(s=>`<div class="channel"><input type="checkbox" data-vis="${s.id}" ${s.visible?"checked":""}><div><div class="hint">${s.file} · ${s.original}</div><input type="text" data-alias="${s.original}" value="${alias(s.original)}"></div><input type="color" data-color="${s.original}" value="${color(s.original)}"></div>`).join("");list.querySelectorAll("[data-vis]").forEach(x=>x.onchange=()=>{state.visible[x.dataset.vis]=x.checked;draw();renderStats();renderLegend();renderRangeStats()});list.querySelectorAll("[data-alias]").forEach(x=>x.onchange=()=>{state.aliases[x.dataset.alias]=x.value.trim()||x.dataset.alias;renderAll()});list.querySelectorAll("[data-color]").forEach(x=>x.oninput=()=>{state.colors[x.dataset.color]=x.value;renderAll()})}
function renderLegend(){const v=visibleSeries();$("legend").innerHTML=v.map(s=>`<span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:5px"></i>${s.name}<small> · ${s.file}</small></span>`).join("")}
function fillDiff(){const a=base();for(const id of["a","b"])$(id).innerHTML=a.map(s=>`<option value="${s.id}">${s.file} · ${s.name}</option>`).join("")}
function statsRange(s,lo=0,hi=s.y.length-1){lo=Math.max(0,Math.min(lo,s.y.length-1));hi=Math.max(lo,Math.min(hi,s.y.length-1));let min=Infinity,max=-Infinity,mi=lo,ma=lo,sum=0,sq=0,n=0;for(let i=lo;i<=hi;i++){const y=s.y[i];if(y<min){min=y;mi=i}if(y>max){max=y;ma=i}sum+=y;sq+=y*y;n++}return{min,max,mi,ma,mean:sum/n,rms:Math.sqrt(sq/n),n}}
function renderStats(){const v=visibleSeries();$("stats").innerHTML=v.length?v.map(s=>{const q=statsRange(s);return`<tr><td>${s.name}<br><small>${s.file}</small></td><td>${fmt(q.min)}</td><td>${time(q.mi).toFixed(4)} s</td><td>${fmt(q.max)}</td><td>${time(q.ma).toFixed(4)} s</td><td>${fmt(q.mean)}</td><td>${fmt(q.rms)}</td></tr>`}).join(""):'<tr><td colspan="7">표시 데이터가 없습니다.</td></tr>'}
function cursorPair(){if(state.cursorA==null||state.cursorB==null)return null;return[state.cursorA,state.cursorB].sort((a,b)=>a-b)}
function renderCursorSummary(){
 const el=$("cursorSummary"),v=visibleSeries();
 if(state.cursorA==null&&state.cursorB==null){el.className="cursor-summary empty";el.textContent="Cursor A/B를 지정하면 Δt와 ΔY를 표시합니다.";return}
 let lines=[];
 if(state.cursorA!=null)lines.push(`A: Sample ${state.cursorA} · ${time(state.cursorA).toFixed(6)} s`);
 if(state.cursorB!=null)lines.push(`B: Sample ${state.cursorB} · ${time(state.cursorB).toFixed(6)} s`);
 if(state.cursorA!=null&&state.cursorB!=null){const dt=Math.abs(time(state.cursorB)-time(state.cursorA));lines.push(`Δt: ${dt.toFixed(6)} s`);for(const s of v){const a=s.y[Math.min(state.cursorA,s.y.length-1)],b=s.y[Math.min(state.cursorB,s.y.length-1)];lines.push(`${s.name} ΔY: ${fmt(b-a)}`)}}
 el.className="cursor-summary";el.textContent=lines.join("\n");el.style.whiteSpace="pre-line"
}
function renderRangeStats(){
 const p=cursorPair(),v=visibleSeries(),body=$("rangeStats"),info=$("rangeInfo");
 if(!p){info.textContent="Cursor A와 B를 지정하면 선택 구간 통계를 계산합니다.";body.innerHTML='<tr><td colspan="6">구간이 선택되지 않았습니다.</td></tr>';return}
 const [lo,hi]=p;info.textContent=`${time(lo).toFixed(6)} s ~ ${time(hi).toFixed(6)} s · ${hi-lo+1} samples · Δt ${(time(hi)-time(lo)).toFixed(6)} s`;
 body.innerHTML=v.map(s=>{const q=statsRange(s,lo,hi),a=s.y[Math.min(lo,s.y.length-1)],b=s.y[Math.min(hi,s.y.length-1)];return`<tr><td>${s.name}<br><small>${s.file}</small></td><td>${fmt(q.min)}</td><td>${fmt(q.max)}</td><td>${fmt(q.mean)}</td><td>${fmt(q.rms)}</td><td>${fmt(b-a)}</td></tr>`}).join("")
}
function ranges(series,lo,hi){
 if(state.scale==="per")return new Map(series.map(s=>{let mn=Infinity,mx=-Infinity;const h=Math.min(hi,s.y.length-1);for(let i=Math.min(lo,h);i<=h;i++){const y=s.y[i];if(y<mn)mn=y;if(y>mx)mx=y}if(state.zero){mn=Math.min(0,mn);mx=Math.max(0,mx)}if(!Number.isFinite(mn)){mn=0;mx=1}if(mn===mx){mn-=1;mx+=1}return[s.id,[mn,mx]]}));
 let mn=Infinity,mx=-Infinity;for(const s of series){const h=Math.min(hi,s.y.length-1);for(let i=Math.min(lo,h);i<=h;i++){const y=s.y[i];if(y<mn)mn=y;if(y>mx)mx=y}}if(state.zero){mn=Math.min(0,mn);mx=Math.max(0,mx)}if(!Number.isFinite(mn)){mn=0;mx=1}if(mn===mx){mn--;mx++}return new Map(series.map(s=>[s.id,[mn,mx]]))
}
function draw(){
 const cv=$("canvas"),box=cv.getBoundingClientRect(),dpr=devicePixelRatio||1;cv.width=Math.max(1,box.width*dpr);cv.height=Math.max(1,box.height*dpr);const c=cv.getContext("2d");c.scale(dpr,dpr);
 const W=box.width,H=box.height,L=48,R=12,T=16,B=34,series=visibleSeries();c.clearRect(0,0,W,H);c.strokeStyle="#e2e8f0";c.fillStyle="#64748b";c.font="11px sans-serif";
 for(let i=0;i<=4;i++){const y=T+(H-T-B)*i/4;c.beginPath();c.moveTo(L,y);c.lineTo(W-R,y);c.stroke()}
 if(!series.length){c.fillText("표시할 채널을 선택하세요.",L+10,T+30);return}
 const n=Math.max(...series.map(s=>s.y.length)),[lo,hi]=viewIndices(n),span=Math.max(1,hi-lo),rg=ranges(series,lo,hi);
 for(const s of series){const [mn,mx]=rg.get(s.id),h=Math.min(hi,s.y.length-1),l=Math.min(lo,h);c.strokeStyle=s.color;c.lineWidth=1.7;c.beginPath();let started=false;for(let i=l;i<=h;i++){const x=L+(W-L-R)*((i-lo)/span),y=T+(H-T-B)*(1-(s.y[i]-mn)/(mx-mn));if(started)c.lineTo(x,y);else{c.moveTo(x,y);started=true}}c.stroke()}
 c.fillStyle="#64748b";c.fillText(time(lo).toFixed(3)+" s",L,H-10);c.fillText(time(hi).toFixed(3)+" s",W-R-55,H-10);
 const pair=cursorPair();if(pair){const[a,b]=pair;c.fillStyle="#dbeafe";const xa=L+(W-L-R)*((a-lo)/span),xb=L+(W-L-R)*((b-lo)/span);if(xb>=L&&xa<=W-R)c.fillRect(Math.max(L,xa),T,Math.min(W-R,xb)-Math.max(L,xa),H-T-B)}
 for(const [idx,label,col] of [[state.cursorA,"A","#dc2626"],[state.cursorB,"B","#2563eb"]]){if(idx==null||idx<lo||idx>hi)continue;const x=L+(W-L-R)*((idx-lo)/span);c.strokeStyle=col;c.lineWidth=1.5;c.beginPath();c.moveTo(x,T);c.lineTo(x,H-B);c.stroke();c.fillStyle=col;c.fillText(label,x+3,T+11)}
 renderCursorSummary()
}
function setCursor(i){const n=maxN();if(!n)return;i=Math.max(0,Math.min(n-1,i));if(state.nextCursor==="A"){state.cursorA=i;state.nextCursor="B"}else{state.cursorB=i;state.nextCursor="A"}draw();renderRangeStats()}
function clearCursors(){state.cursorA=null;state.cursorB=null;state.nextCursor="A";$("tip").classList.add("hidden");draw();renderRangeStats();renderCursorSummary()}
function renderAll(){renderFiles();renderChannels();renderLegend();fillDiff();renderStats();renderRangeStats();draw()}
async function openFiles(fs){for(const f of fs){try{state.files.push(parse(await f.arrayBuffer(),f.name))}catch(e){alert(f.name+"\n"+e.message)}}state.view={start:0,end:1};clearCursors();renderAll()}
load();
$("ts").value=state.ts;$("scale").value=state.scale;$("zero").checked=state.zero;
$("file").onchange=e=>openFiles(e.target.files);
$("ts").onchange=e=>{state.ts=Math.max(.001,+e.target.value||1);renderStats();renderRangeStats();draw()};
$("ts1").onclick=()=>{$("ts").value=state.ts=1;renderStats();renderRangeStats();draw()};
$("ts2").onclick=()=>{$("ts").value=state.ts=2;renderStats();renderRangeStats();draw()};
$("save").onclick=save;
$("clear").onclick=()=>{if(confirm("불러온 REC를 모두 제거할까요?")){state.files=[];state.derived=[];state.view={start:0,end:1};clearCursors();renderAll()}};
$("scale").onchange=e=>{state.scale=e.target.value;draw()};
$("zero").onchange=e=>{state.zero=e.target.checked;draw()};
$("resetView").onclick=resetView;$("clearCursors").onclick=clearCursors;
$("addDiff").onclick=()=>{const a=$("a").value,b=$("b").value;if(!a||!b||a===b)return alert("서로 다른 두 데이터를 선택하세요.");state.derived.push({a,b,name:$("diffName").value.trim()||"A-B",color:"#111827"});renderAll()};
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{document.querySelectorAll(".tab,.panel").forEach(x=>x.classList.remove("active"));t.classList.add("active");$(t.dataset.tab).classList.add("active");if(t.dataset.tab==="graph")setTimeout(draw,20)});
const cv=$("canvas"),pts=new Map();let gesture=null,moved=false;
function chartIndex(clientX){const r=cv.getBoundingClientRect(),L=48,R=12,n=maxN();if(!n)return 0;const[lo,hi]=viewIndices(n),f=Math.max(0,Math.min(1,(clientX-r.left-L)/(r.width-L-R)));return Math.round(lo+f*(hi-lo))}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
cv.addEventListener("pointerdown",e=>{cv.setPointerCapture?.(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY});moved=false;if(pts.size===1){gesture={type:"pan",start:{...state.view},x:e.clientX}}else if(pts.size===2){const p=[...pts.values()];gesture={type:"pinch",start:{...state.view},d:dist(p[0],p[1]),mid:(p[0].x+p[1].x)/2}}});
cv.addEventListener("pointermove",e=>{if(!pts.has(e.pointerId))return;const p=pts.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;if(Math.hypot(p.x-p.sx,p.y-p.sy)>5)moved=true;const r=cv.getBoundingClientRect();
 if(pts.size===1&&gesture?.type==="pan"&&moved){const dx=e.clientX-gesture.x,span=gesture.start.end-gesture.start.start,shift=-dx/Math.max(1,r.width-60)*span;state.view.start=gesture.start.start+shift;state.view.end=gesture.start.end+shift;clampView();draw()}
 else if(pts.size>=2){const a=[...pts.values()].slice(0,2),d=dist(a[0],a[1]);if(!gesture||gesture.type!=="pinch"){gesture={type:"pinch",start:{...state.view},d,mid:(a[0].x+a[1].x)/2}}const ratio=Math.max(.2,Math.min(5,gesture.d/Math.max(1,d))),oldSpan=gesture.start.end-gesture.start.start,newSpan=Math.max(.002,Math.min(1,oldSpan*ratio)),midX=(a[0].x+a[1].x)/2,anchor=Math.max(0,Math.min(1,(midX-r.left-48)/Math.max(1,r.width-60))),center=gesture.start.start+anchor*oldSpan;state.view.start=center-anchor*newSpan;state.view.end=state.view.start+newSpan;clampView();moved=true;draw()}
});
function pointerEnd(e){const was=pts.get(e.pointerId);const single=pts.size===1;pts.delete(e.pointerId);if(single&&!moved&&was){const i=chartIndex(e.clientX);setCursor(i);const s=visibleSeries();$("tip").classList.remove("hidden");$("tip").textContent="Cursor "+(state.nextCursor==="A"?"B":"A")+" · Sample "+i+" · "+time(i).toFixed(6)+" s\n"+s.map(x=>x.name+": "+fmt(x.y[Math.min(i,x.y.length-1)])).join("\n")}if(!pts.size)gesture=null}
cv.addEventListener("pointerup",pointerEnd);cv.addEventListener("pointercancel",pointerEnd);
window.addEventListener("resize",draw);
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
renderAll();
})();