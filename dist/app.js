const $=s=>document.querySelector(s);
const data=await fetch('data/topology.json').then(r=>r.json());
const nodes=data.nodes, links=data.links;
const positions={
 'ixp-kg-sw2':[370,170], 'ixp-ixn-sw2':[560,100], 'ixp-kn7-sw1':[800,345],
 'ixp-ch-sw2':[800,200], 'ixp-sk1-sw1':[190,365], 'ixp-rl-sw1':[560,490], 'ixp-sk2-sw1':[800,575],
 'unpaired-ixp-kg-sw2-Ethernet160':[170,170], 'unpaired-ixp-sk1-sw1-Ethernet168':[90,485]
};
const districts={'ixp-kg-sw2':'Kista','ixp-ixn-sw2':'North Kista','ixp-kn7-sw1':'Östermalm','ixp-ch-sw2':'Östermalm · north of KN7','ixp-sk1-sw1':'Bromma','ixp-rl-sw1':'Årsta','ixp-sk2-sw1':'Sköndal'};
for(const n of nodes) n.district=districts[n.id]||'Far end unconfirmed';
// Schematic routes preserve district ordering, use 45° bends and separate parallel circuits.
const routes=[
 [[783,213],[783,332]], [[800,213],[800,332]], [[817,213],[817,332]],
 [[548,100],[440,100],[370,170]],
 [[560,113],[560,205],[400,365],[203,365]],
 [[577,113],[577,212],[407,382],[203,382],[190,369]],
 [[590,100],[655,165],[655,395],[560,490]],
 [[357,170],[270,257],[270,285],[190,365]],
 [[370,183],[370,280],[435,345],[787,345]],
 [[357,170],[183,170]],
 [[813,345],[890,422],[890,498],[813,575]],
 [[547,490],[460,490],[348,378],[203,378]],
 [[190,378],[190,425],[130,485],[103,485]]
];
const labels=[[716,246],[867,300],[875,230],[453,70],[481,282],[412,425],[689,290],[250,242],[576,325],[263,147],[891,463],[440,499],[162,454]];
let selected='link-8',selectedNode=null,view='topology',search='',showLabels=true,zoom=1,range=24,position=100,playing=false,timer;
const svgNS='http://www.w3.org/2000/svg';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const node=id=>nodes.find(n=>n.id===id);
const name=id=>node(id).label;
const short=id=>id.startsWith('unpaired')?'Unpaired':name(id).split(' ')[0];
const rate=v=>v===0?'0 b/s':v<.000001?(v*1e9).toFixed(1)+' b/s':v<1?(v*1e3).toFixed(1)+' Mb/s':v.toFixed(1)+' Gb/s';
const factor=()=>position===100?1:.45+.22*Math.sin(position/15)+.32*position/100;
const val=(l,k)=>l[k]*factor();
const color=l=>l.state==='down'?'#ed858c':l.state==='unpaired'?'#c7a965':Math.max(l.tx,l.rx)/l.capacity>=.7?'#efc66c':Math.max(l.tx,l.rx)/l.capacity>=.4?'#b5d770':Math.max(l.tx,l.rx)/l.capacity>=.01?'#71dcb0':'#526b5b';
const path=ps=>'M'+ps.map(p=>p.join(',')).join(' L');
function relevant(l){const q=search.toLowerCase();return (!q||[l.id,l.portA,l.portB,name(l.a),name(l.b),node(l.a).district,node(l.b).district].some(s=>s.toLowerCase().includes(q)))&&(!selectedNode||l.a===selectedNode||l.b===selectedNode)}
function draw(){
 $('#total').innerHTML=(links.reduce((s,l)=>s+l.tx+l.rx,0)).toFixed(1)+'<span class="unit">Gb/s</span>';
 const matched=links.filter(relevant);let content=`<defs><pattern id="diag" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#293c2e" stroke-width="1"/></pattern></defs><g id="zoom-group" transform="translate(${500-500*zoom} ${325-325*zoom}) scale(${zoom})"><text x="45" y="57" fill="#718575" font-size="10" letter-spacing="2">N ↑</text><text x="705" y="64" fill="#3b5040" font-size="10" letter-spacing="3">STOCKHOLM</text><text x="710" y="81" fill="#536a59" font-size="9">Geographic schematic · not to scale</text><path d="M50 420 C220 395 265 445 360 420 S480 395 520 430 S720 450 965 420" stroke="#243a30" stroke-width="27" fill="none" opacity=".42"/><text x="302" y="447" fill="#435d50" font-size="9" letter-spacing="3" transform="rotate(-9 302 447)">MÄLAREN</text>`;
 links.forEach((l,i)=>{const pts=routes[i],d=path(pts),[x,y]=labels[i],c=color(l),sel=selected===l.id&&!selectedNode; const tx=rate(val(l,'tx')),rx=rate(val(l,'rx')); content+=`<g class="circuit ${sel?'selected':''} ${!relevant(l)?'faded':''}" data-link="${l.id}" tabindex="0" role="button" aria-label="${esc(name(l.a)+' to '+name(l.b)+', '+l.capacity+' gigabits, '+l.state)}"><title>${esc(l.portA+' ↔ '+l.portB)}</title>${sel?`<path class="halo" d="${d}"/>`:''}<path class="base" stroke="${c}" ${l.state!=='up'?'stroke-dasharray="5 6"':''} d="${d}"/><path class="hit" d="${d}"/>${showLabels?`<g class="traffic-label"><rect class="value-bg" x="${x-58}" y="${y-18}" width="116" height="36" rx="4"/><text class="value" text-anchor="middle" x="${x}" y="${y-4}">${esc(short(l.a))} → ${tx}</text><text class="value" text-anchor="middle" x="${x}" y="${y+10}">${esc(short(l.b))} → ${rx}</text><text class="capacity-label" text-anchor="middle" x="${x}" y="${y+30}">${l.capacity}G · ${String(i+1).padStart(2,'0')}</text></g>`:''}</g>`});
 nodes.forEach(n=>{const [x,y]=positions[n.id],un=n.id.startsWith('unpaired'),match=matched.some(l=>l.a===n.id||l.b===n.id);let labelX=x,labelY=y-37,anchor='middle';if(n.id==='ixp-ch-sw2'){labelX=x+38;labelY=y-10;anchor='start'}if(n.id==='ixp-kn7-sw1'){labelX=x;labelY=y+47}if(n.id==='ixp-rl-sw1'){labelY=y+47}if(n.id==='ixp-sk1-sw1'){labelX=x-30;labelY=y-12;anchor='end'}if(n.id==='ixp-sk2-sw1'){labelY=y+39}if(un){labelY=y+32}
 content+=`<g class="node ${un?'unpaired':''} ${selectedNode===n.id?'selected':''} ${!match?'faded':''}" tabindex="0" role="button" data-node="${n.id}" aria-label="${esc(n.label+', '+n.district)}"><title>${esc(n.id)}</title><rect class="card" x="${x-14}" y="${y-14}" width="28" height="28" rx="${un?5:8}"/><circle cx="${x}" cy="${y}" r="${un?3:5}" fill="${un?'#c7a965':'#a4e9b2'}"/><text class="node-label" text-anchor="${anchor}" x="${labelX}" y="${labelY}">${un?'Obe L2VPN ◇':esc(n.label)}</text><text class="node-site" text-anchor="${anchor}" x="${labelX}" y="${labelY+16}">${un?'Unpaired far end':esc(n.district)}</text></g>`});
 content+='</g>';$('#network').innerHTML=content;$('#zoom-value').textContent=Math.round(zoom*100)+'%';
 $('#network').querySelectorAll('[data-link]').forEach(el=>bind(el,()=>selectLink(el.dataset.link)));
 $('#network').querySelectorAll('[data-node]').forEach(el=>bind(el,()=>{selectedNode=selectedNode===el.dataset.node?null:el.dataset.node;draw();inspect()}));
 drawTable();
}
function bind(el,fn){el.addEventListener('click',fn);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn()}})}
function selectLink(id){selected=id;selectedNode=null;draw();inspect()}
function series(value,seed=0){return Array.from({length:61},(_,i)=>{let f=.55+.25*Math.cos(i/9+seed)+.1*Math.sin(i*1.7+seed);return Math.max(0,value*f)})}
function line(values,w,h,max){return values.map((v,i)=>`${i?'L':'M'}${i*w/(values.length-1)},${h-v/max*h}`).join(' ')}
function inspect(){
 const root=$('#inspector');if(selectedNode){const n=node(selectedNode),ls=links.filter(l=>l.a===n.id||l.b===n.id);root.innerHTML=`<div class="inspector-kicker">SITE INSPECTOR <span>◉</span></div><h2>${esc(n.label)}</h2><p class="circuit-sub">${esc(n.district)}</p><span class="status-pill ${n.id.startsWith('unpaired')?'unpaired':''}">${n.id.startsWith('unpaired')?'◇ Far end unconfirmed':'● Reachable in supplied screenshot'}</span><div class="inspector-divider"></div><div class="detail-label">${ls.length} CONNECTED CIRCUIT${ls.length===1?'':'S'}</div><div class="node-links">${ls.map(l=>`<button data-inspect="${l.id}"><span>${esc(short(l.a))} ↔ ${esc(short(l.b))}</span><span style="color:${color(l)}">${l.capacity}G ${l.state==='down'?'↓':''}</span></button>`).join('')}</div><div class="inspector-note">The layout follows Stockholm’s district positions. Distances and fiber routes are schematic.</div>`;root.querySelectorAll('[data-inspect]').forEach(el=>el.onclick=()=>selectLink(el.dataset.inspect));return}
 const l=links.find(l=>l.id===selected),pct=k=>(val(l,k)/l.capacity*100).toFixed(1),s=l.state;
 const max=l.capacity;const a=series(l.tx,.1),b=series(l.rx,1);const chart=`<svg class="detail-chart" viewBox="0 0 250 90" preserveAspectRatio="none" aria-label="Illustrative directional throughput"><path d="M0 1H250 M0 30H250 M0 60H250 M0 89H250" stroke="#2c3b30" stroke-width=".6"/><path d="${line(a,250,85,max)}" stroke="#a4e9b2" fill="none" stroke-width="1.7"/><path d="${line(b,250,85,max)}" stroke="#8eacdc" fill="none" stroke-width="1.5"/></svg>`;
 root.innerHTML=`<div class="inspector-kicker">CIRCUIT INSPECTOR <span>↗</span></div><h2>${esc(short(l.a))}<span>↔</span>${esc(short(l.b))}</h2><p class="circuit-sub">${String(links.indexOf(l)+1).padStart(2,'0')} / ${l.capacity} Gb/s · ${esc(l.portA.split(' · ')[1]||'Circuit')}</p><span class="status-pill ${s}">${s==='up'?'● Operational':s==='down'?'↓ Down in screenshot':'◇ Unpaired interface'}</span><div class="inspector-divider"></div><div class="detail-label">DIRECTIONAL THROUGHPUT</div>${['tx','rx'].map((k,i)=>`<div class="traffic-row"><span style="color:${i?'#8eacdc':'#a4e9b2'}">${esc(short(i?l.b:l.a))} → ${esc(short(i?l.a:l.b))}</span><strong>${rate(val(l,k)).replace(' ',' <small>')}</small></strong></div><div class="traffic-bar ${i?'reverse':''}"><i style="width:${pct(k)}%"></i></div><div class="traffic-caption">${pct(k)}% of ${l.capacity} Gb/s</div>`).join('')}<div class="inspector-divider"></div><div class="chart-header"><span class="detail-label">ILLUSTRATIVE HISTORY</span><span>0–${l.capacity} Gb/s</span></div>${chart}<div class="chart-times"><span>−${range}h</span><span>−${range/2}h</span><span>Snapshot</span></div><div class="inspector-divider"></div><div class="detail-label">CIRCUIT ENDPOINTS</div>${[l.portA,l.portB].map((p,i)=>`<div class="endpoint"><div class="endpoint-letter">${i?'B':'A'}</div><div><strong>${esc(p.split(' / ')[0])}</strong><p>${esc(p.split(' / ')[1]||p)}</p></div></div>`).join('')}<div class="inspector-note ${s!=='up'?'alert':''}">${s==='unpaired'?'Far end is unconfirmed. These interfaces are intentionally separate; no connection between them is assumed.':s==='down'?'Both endpoint ports are down in the supplied screenshot. The parallel 400G circuit remains operational.':'Directional values come from the supplied screenshot. Historical curves are illustrative; live telemetry is not connected.'}</div>`;
}
function drawTable(){const rows=links.filter(relevant);$('#table-area').innerHTML=`<table><thead><tr><th>CIRCUIT</th><th>STATE</th><th>CAPACITY</th><th>A → B</th><th>B → A</th></tr></thead><tbody>${rows.map(l=>`<tr data-id="${l.id}" tabindex="0"><td>${esc(short(l.a))} ↔ ${esc(short(l.b))}<small>${esc(l.portA.split(' · ')[1]||'')} · ${l.id}</small></td><td style="color:${color(l)}">${l.state}</td><td>${l.capacity}G</td><td>${rate(val(l,'tx'))}</td><td>${rate(val(l,'rx'))}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">No sites or circuits match your search.</div>'}`;$('#table-area').querySelectorAll('[data-id]').forEach(el=>bind(el,()=>selectLink(el.dataset.id)))}
function setView(v){view=v;$('#map-area').hidden=v!=='topology';$('#table-area').hidden=v!=='circuits';for(const t of ['topology','circuits']){$('#'+t+'-tab').classList.toggle('selected',v===t);$('#'+t+'-tab').setAttribute('aria-selected',v===t)}$('.map-heading').style.display=v==='topology'?'flex':'none'}
function history(){const a=series(1,1);$('#overview-chart').innerHTML=`<defs><linearGradient id="area" x2="0" y2="1"><stop stop-color="#88bf8e" stop-opacity=".25"/><stop offset="1" stop-color="#88bf8e" stop-opacity=".01"/></linearGradient></defs><path d="${line(a,1000,52,1.1)} L1000,55 L0,55Z" fill="url(#area)"/><path d="${line(a,1000,52,1.1)}" stroke="#668c6d" fill="none" stroke-width="1.2"/>`;$('#time-ticks').innerHTML=[range,range*.75,range*.5,range*.25,0].map(n=>`<span>${n?'−'+n+'h':'Snapshot'}</span>`).join('');$('#history-time').textContent=position===100?'Snapshot':'−'+((100-position)/100*range).toFixed(1)+'h';$('#history-label').textContent=position===100?range+'-hour illustration':'Illustrative replay';}
$('#topology-tab').onclick=()=>setView('topology');$('#circuits-tab').onclick=()=>setView('circuits');$('#rail-circuits').onclick=()=>setView('circuits');$('.rail-icon.active').onclick=()=>setView('topology');
$('#search').oninput=e=>{search=e.target.value;draw()};$('#labels').onchange=e=>{showLabels=e.target.checked;draw()};
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();$('#search').focus()}if(e.key==='Escape'){selectedNode=null;search='';$('#search').value='';draw();inspect()}});
$('#zoom-in').onclick=()=>{zoom=Math.min(1.8,zoom+.2);draw()};$('#zoom-out').onclick=()=>{zoom=Math.max(.6,zoom-.2);draw()};$('#fit').onclick=()=>{zoom=1;draw()};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.fabric').requestFullscreen()}catch{toast('Fullscreen is unavailable in this preview.')}};
$('#scrubber').oninput=e=>{position=Number(e.target.value);draw();inspect();history()};
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Ⅱ':'▶';$('#play').setAttribute('aria-label',playing?'Pause illustrative history':'Play illustrative history');clearInterval(timer);if(playing){if(position===100)position=0;timer=setInterval(()=>{position=(position+1)%101;$('#scrubber').value=position;draw();inspect();history()},350)}};
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{range=Number(b.dataset.range);document.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('selected',x===b));history();inspect()});
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');setTimeout(()=>$('#toast').classList.remove('visible'),3000)}
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({source:'User-supplied Grafana definition and screenshots; history is illustrative',geography:'Stockholm geographic schematic, not to scale',nodes,links,illustrativePosition:position},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sonix-network-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Network snapshot exported')};
draw();inspect();history();
