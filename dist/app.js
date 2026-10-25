import {LABEL_POSITIONS,CARD_WIDTH,CARD_HEIGHT,connector} from './map-labels.js';
import {VictoriaClient,DEFAULT_URL,MAX_AGE,discover,resolvedLinks,fabricQuery,historyQuery,vectorMap,matrixMap,at,stateOf,trafficValue,diagnosticQuery,diagnosticHistoryQuery,opticRows,ERRORS,historyWindow} from './metrics.js';
const $=s=>document.querySelector(s);
const data=await fetch('data/topology.json').then(r=>r.json());
const nodes=data.nodes, links=data.links;
for(const l of links){l.tx=null;l.rx=null;l.state='unknown';}
let endpoint=localStorage.getItem('sonix-metrics-url')||DEFAULT_URL,useCookies=localStorage.getItem('sonix-use-cookies')!=='false',client,instances=new Map(),resolved=[],liveMap=new Map(),liveTime=0,lastSuccess=0;
let historyMap=new Map(),windowData=null,historyError='',diagnostics=null,diagnosticError='',diagnosticLoading=false,detailTab='traffic',diagnosticMetric='rxErrors';
let sessionAbort=new AbortController(),historyAbort,diagnosticAbort,historyGeneration=0,diagnosticGeneration=0,connecting=false,connectionError='',refreshTimer;
const fmtTime=t=>t?new Date(t*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—';
const fmtDate=t=>t?new Date(t*1000).toLocaleString():'—';
function snapshotTime(){return position===100?liveTime:windowData?windowData.start+(windowData.end-windowData.start)*position/100:0;}
function reading(key){return position===100?(liveMap.get(key)??null):at(historyMap.get(key),snapshotTime(),windowData?.step||60);}
function nodeState(n){if(n.id.startsWith('unpaired'))return 'unpaired';const v=reading('node:'+n.id),t=reading('nodeTime:'+n.id);return t===null||snapshotTime()-t>MAX_AGE||v===null?'unknown':v===1?'up':'down';}

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
const labels=LABEL_POSITIONS;
let selected='link-8',selectedNode=null,view='topology',search='',showLabels=true,zoom=1,range=24,position=100,playing=false,timer;
const svgNS='http://www.w3.org/2000/svg';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const node=id=>nodes.find(n=>n.id===id);
const name=id=>node(id).label;
const short=id=>id.startsWith('unpaired')?'Unpaired':name(id).split(' ')[0];
const rate=v=>v===null||!Number.isFinite(v)?'—':v===0?'0 b/s':v<.000001?(v*1e9).toFixed(1)+' b/s':v<1?(v*1e3).toFixed(1)+' Mb/s':v.toFixed(1)+' Gb/s';
const val=(l,k)=>trafficValue(l,k,reading,snapshotTime());
const utilization=l=>Math.max(val(l,'tx')??0,val(l,'rx')??0)/l.capacity;
const color=l=>l.state==='down'?'#ed858c':l.state==='unpaired'?'#c7a965':l.state==='unknown'?'#808892':utilization(l)>=.95?'#ed7c83':utilization(l)>=.85?'#ec9965':utilization(l)>=.7?'#efc66c':utilization(l)>=.4?'#b5d770':utilization(l)>=.01?'#71dcb0':'#4f5c6e';
const path=ps=>'M'+ps.map(p=>p.join(',')).join(' L');
function relevant(l){const q=search.toLowerCase();return (!q||[l.id,l.portA,l.portB,name(l.a),name(l.b),node(l.a).district,node(l.b).district].some(s=>s.toLowerCase().includes(q)))&&(!selectedNode||l.a===selectedNode||l.b===selectedNode)}
function draw(){
 for(const l of links)l.state=stateOf(l,reading,snapshotTime());
 updateSummary();
 const matched=links.filter(relevant);let content=`<defs><pattern id="diag" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0" stroke="#27313e" stroke-width="1"/></pattern></defs><g id="zoom-group" transform="translate(${500-500*zoom} ${325-325*zoom}) scale(${zoom})"><text x="45" y="57" fill="#6e7988" font-size="10" letter-spacing="2">N ↑</text><text x="705" y="64" fill="#384453" font-size="10" letter-spacing="3">STOCKHOLM</text><text x="710" y="81" fill="#505d6d" font-size="9">Geographic schematic · not to scale</text><path d="M50 420 C220 395 265 445 360 420 S480 395 520 430 S720 450 965 420" stroke="#212d3d" stroke-width="27" fill="none" opacity=".42"/><text x="302" y="447" fill="#404e60" font-size="9" letter-spacing="3" transform="rotate(-9 302 447)">MÄLAREN</text>`;
 // Draw every route before any traffic card, so later routes cannot strike through text.
 links.forEach((l,i)=>{const d=path(routes[i]),c=color(l),sel=selected===l.id&&!selectedNode;content+=`<g class="circuit route ${sel?'selected':''} ${!relevant(l)?'faded':''}" data-link="${l.id}" ${showLabels?'aria-hidden="true"':`tabindex="0" role="button" aria-label="${esc(name(l.a)+' to '+name(l.b)+', '+l.capacity+' gigabits, '+l.state)}"`}><title>${esc(l.portA+' ↔ '+l.portB)}</title>${sel?`<path class="halo" d="${d}"/>`:''}<path class="base" stroke="${c}" ${l.state!=='up'?'stroke-dasharray="5 6"':''} d="${d}"/><path class="hit" d="${d}"/></g>`;});
 if(showLabels){
  content+='<g class="card-connectors" aria-hidden="true">';links.forEach((l,i)=>{const leader=connector(labels[i],routes[i]);if(leader)content+=`<path class="card-connector ${!relevant(l)?'faded':''}" stroke="${color(l)}" d="${path(leader)}"/>`;});content+='</g><g class="traffic-cards">';
  links.forEach((l,i)=>{const [x,y]=labels[i],sel=selected===l.id&&!selectedNode,tx=rate(val(l,'tx')),rx=rate(val(l,'rx'));content+=`<g class="circuit traffic-label ${sel?'selected':''} ${!relevant(l)?'faded':''}" data-link="${l.id}" tabindex="0" role="button" aria-label="${esc(name(l.a)+' to '+name(l.b)+', '+l.capacity+' gigabits, '+l.state)}"><title>${esc(l.portA+' ↔ '+l.portB)}</title><rect class="value-bg" x="${x-CARD_WIDTH/2}" y="${y-CARD_HEIGHT/2}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="5"/><text class="value" text-anchor="middle" x="${x}" y="${y-10}">${esc(short(l.a))}${l.unpaired?' TX':' →'} ${tx}</text><text class="value" text-anchor="middle" x="${x}" y="${y+3}">${esc(short(l.unpaired?l.a:l.b))}${l.unpaired?' RX':' →'} ${rx}</text><text class="capacity-label" text-anchor="middle" x="${x}" y="${y+18}">${l.capacity}G · ${String(i+1).padStart(2,'0')}</text></g>`;});content+='</g>';
 }
 nodes.forEach(n=>{const [x,y]=positions[n.id],un=n.id.startsWith('unpaired'),match=matched.some(l=>l.a===n.id||l.b===n.id);let labelX=x,labelY=y-37,anchor='middle';if(n.id==='ixp-ch-sw2'){labelX=x+38;labelY=y-10;anchor='start'}if(n.id==='ixp-kn7-sw1'){labelX=x;labelY=y+47}if(n.id==='ixp-rl-sw1'){labelY=y+47}if(n.id==='ixp-sk1-sw1'){labelX=x-30;labelY=y-12;anchor='end'}if(n.id==='ixp-sk2-sw1'){labelY=y+39}if(un){labelY=y+32}
 content+=`<g class="node ${un?'unpaired':''} ${selectedNode===n.id?'selected':''} ${nodeState(n)} ${!match?'faded':''}" tabindex="0" role="button" data-node="${n.id}" aria-label="${esc(n.label+', '+n.district)}"><title>${esc(n.id)}</title><rect class="card" x="${x-14}" y="${y-14}" width="28" height="28" rx="${un?5:8}"/><circle cx="${x}" cy="${y}" r="${un?3:5}" fill="${un?'#c7a965':nodeState(n)==='up'?'#70bff0':nodeState(n)==='down'?'#ed858c':'#808892'}"/><text class="node-label" text-anchor="${anchor}" x="${labelX}" y="${labelY}">${un?'Obe L2VPN ◇':esc(n.label)}</text><text class="node-site" text-anchor="${anchor}" x="${labelX}" y="${labelY+16}">${un?'Unpaired far end':esc(n.district)}</text></g>`});
 content+='</g>';$('#network').innerHTML=content;$('#zoom-value').textContent=Math.round(zoom*100)+'%';
 $('#network').querySelectorAll('[data-link]').forEach(el=>bind(el,()=>selectLink(el.dataset.link)));
 $('#network').querySelectorAll('[data-node]').forEach(el=>bind(el,()=>{selectedNode=selectedNode===el.dataset.node?null:el.dataset.node;draw();inspect()}));
 drawTable();
}
function bind(el,fn){el.addEventListener('click',fn);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn()}})}
function selectLink(id){selected=id;selectedNode=null;draw();inspect();loadDiagnostics()}
function line(values,w,h,max,min=0){let pen=false;return values.map((v,i)=>{if(v===null||!Number.isFinite(v)){pen=false;return '';}const d=`${pen?'L':'M'}${i*w/Math.max(1,values.length-1)},${h-(v-min)/(max-min||1)*h}`;pen=true;return d;}).join(' ')}
function gridTimes(){if(!windowData)return [];return Array.from({length:Math.round((windowData.end-windowData.start)/windowData.step)+1},(_,i)=>windowData.start+i*windowData.step);}
function measuredSeries(key,timeKey){return gridTimes().map(t=>{const value=at(historyMap.get(key),t,windowData.step),sample=timeKey?at(historyMap.get(timeKey),t,windowData.step):t;return sample===null||t-sample>MAX_AGE?null:value;});}
function chartHTML(series,max,min=0){const hasData=series.some(s=>s.values.some(v=>v!==null));return `<svg class="detail-chart" viewBox="0 0 250 90" preserveAspectRatio="none" aria-label="Measured history"><path d="M0 1H250 M0 30H250 M0 60H250 M0 89H250" stroke="#2a323d" stroke-width=".6"/>${hasData?series.map(s=>`<path d="${line(s.values,250,85,max,min)}" stroke="${s.color}" fill="none" stroke-width="1.6"/>`).join(''):`<text class="chart-message" x="125" y="45" text-anchor="middle">${esc(historyError||'No samples in selected range')}</text>`}</svg><div class="chart-times"><span>${fmtTime(windowData?.start)}</span><span>${fmtTime(windowData?(windowData.start+windowData.end)/2:0)}</span><span>${fmtTime(windowData?.end)}</span></div>`;}
function inspectorTabs(){return `<div class="inspector-tabs" role="tablist" aria-label="Circuit metrics">${['traffic','optics','errors'].map(t=>`<button role="tab" aria-selected="${detailTab===t}" class="${detailTab===t?'selected':''}" data-detail="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>`;}
function wireInspector(){document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{detailTab=b.dataset.detail;inspect();if(detailTab!=='traffic'&&!diagnostics&&!diagnosticLoading)loadDiagnostics()});const select=$('#diagnostic-metric');if(select)select.onchange=()=>{diagnosticMetric=select.value;inspect()};}
function inspect(){
 const root=$('#inspector');if(selectedNode){const n=node(selectedNode),ls=links.filter(l=>l.a===n.id||l.b===n.id),state=nodeState(n);root.innerHTML=`<div class="inspector-kicker">SITE INSPECTOR <span>◉</span></div><h2>${esc(n.label)}</h2><p class="circuit-sub">${esc(n.district)}</p><span class="status-pill ${state}">${state==='unpaired'?'◇ Far end unconfirmed':state==='up'?'● Exporter reachable':state==='down'?'↓ Exporter unreachable':'? Reachability unknown'}</span><div class="sample-age">${position===100?'Live':'Replay'} · ${fmtDate(snapshotTime())}</div><div class="inspector-divider"></div><div class="detail-label">${ls.length} CONNECTED CIRCUIT${ls.length===1?'':'S'}</div><div class="node-links">${ls.map(l=>`<button data-inspect="${l.id}"><span>${esc(short(l.a))} ↔ ${esc(short(l.b))}</span><span style="color:${color(l)}">${l.capacity}G ${l.state==='down'?'↓':''}</span></button>`).join('')}</div><div class="inspector-note">The layout follows Stockholm’s district positions. Distances and fiber routes are schematic.</div>`;root.querySelectorAll('[data-inspect]').forEach(el=>el.onclick=()=>selectLink(el.dataset.inspect));return}
 const l=links.find(l=>l.id===selected),pct=k=>val(l,k)===null?null:val(l,k)/l.capacity*100,s=l.state;
 let content='';if(detailTab==='traffic'){
 const a=measuredSeries(l.id+':tx',l.id+':txTime'),b=measuredSeries(l.id+':rx',l.id+':rxTime');
 content=`<div class="detail-label">DIRECTIONAL THROUGHPUT · 5M RATE</div>${['tx','rx'].map((k,i)=>`<div class="traffic-row"><span style="color:${i?'#b39ddb':'#70bff0'}">${esc(short(i?l.b:l.a))} → ${esc(short(i?l.a:l.b))}</span><strong>${rate(val(l,k)).replace(' ',' <small>')}</small></strong></div><div class="traffic-bar ${i?'reverse':''}"><i style="width:${Math.min(100,pct(k)||0)}%"></i></div><div class="traffic-caption">${pct(k)===null?'No fresh sample':pct(k).toFixed(1)+'% of '+l.capacity+' Gb/s'}</div>`).join('')}<div class="inspector-divider"></div><div class="chart-header"><span class="detail-label">MEASURED HISTORY</span><span>0–${l.capacity} Gb/s</span></div>${chartHTML([{values:a,color:'#70bff0'},{values:b,color:'#b39ddb'}],l.capacity)}<div class="inspector-divider"></div><div class="detail-label">CIRCUIT ENDPOINTS</div>${[l.portA,l.portB].map((p,i)=>`<div class="endpoint"><div class="endpoint-letter">${i?'B':'A'}</div><div><strong>${esc(p.split(' / ')[0])}</strong><p>${esc(p.split(' / ')[1]||p)}</p></div></div>`).join('')}`;
 }else content=diagnosticHTML(l);
 root.innerHTML=`<div class="inspector-kicker">CIRCUIT INSPECTOR <span>↗</span></div><h2>${esc(short(l.a))}<span>↔</span>${esc(short(l.b))}</h2><p class="circuit-sub">${String(links.indexOf(l)+1).padStart(2,'0')} / ${l.capacity} Gb/s · ${esc(l.portA.split(' · ')[1]||'Circuit')}</p><span class="status-pill ${s}">${s==='up'?'● Operational':s==='down'?'↓ Port down':s==='unpaired'?'◇ Unpaired interface':'? State unavailable'}</span><div class="sample-age">${position===100?'Live':'Replay'} · ${fmtDate(snapshotTime())}</div>${inspectorTabs()}${content}<div class="inspector-note ${l.unpaired?'alert':''}">${l.unpaired?'Far end is unconfirmed. Only the known local port is queried; RX and TX are measured at that port.':'Values are measured from VictoriaMetrics. Gaps and unavailable samples remain unknown. Crossings without stations are not junctions.'}</div>`;wireInspector();
}
function diagnosticHTML(l){
 if(diagnosticLoading&&!diagnostics)return '<div class="metric-empty">Loading port diagnostics…</div>';
 if(!diagnostics||diagnostics.link!==l.id)return `<div class="metric-empty">${esc(diagnosticError||connectionError||'Diagnostics are not available yet.')}</div>`;
 const d=diagnostics,replay=position!==100,time=replay?snapshotTime():Date.now()/1000;
 const current=(side,key)=>replay?at(d.history.get(side+':'+key),time,d.step):d.map.get(side+':'+key)??null;
 const fresh=(side,key)=>{const t=current(side,key+':time');return t!==null&&time-t<=MAX_AGE};
 if(detailTab==='optics')return ['A','B'].map(side=>{
  const e=l['endpoint'+side];if(!e)return `<div class="diagnostic-endpoint">B · Far end unconfirmed</div><p class="metric-empty">No far-end optics are assumed.</p>`;
  let rows=replay?d.opticsHistory.filter(r=>r.metric.binding===side+':optic').map(r=>{const ts=d.opticsHistory.find(x=>x.metric.binding===side+':opticTime'&&x.metric.property===r.metric.property);const sample=ts?at(ts.values,time,d.step):null;return {property:r.metric.property,unit:r.metric.unit,value:at(r.values,time,d.step),active:r.metric.active,stale:sample===null||time-sample>MAX_AGE,severity:'normal'};}):opticRows(d.raw,side,time);
  const measured=rows.filter(r=>/^(rx|tx)\d*power$|^temperature$|^tx\d*bias$/.test(r.property));
  const thresholds=rows.filter(r=>/alarm|warning/.test(r.property));
  const power=d.opticsHistory.filter(r=>r.metric.binding===side+':optic'&&r.metric.unit==='dBm').slice(0,16);
  const palette=['#70bff0','#b39ddb','#efc66c','#d1a8de','#74c4c6','#e2a586'];
  const curves=power.map((r,i)=>{const ts=d.opticsHistory.find(x=>x.metric.binding===side+':opticTime'&&x.metric.property===r.metric.property);return {color:palette[i%palette.length],label:r.metric.property,values:gridTimes().map(t=>{const sample=ts?at(ts.values,t,d.step):null;return sample===null||t-sample>MAX_AGE?null:at(r.values,t,d.step)})}});
  const all=curves.flatMap(c=>c.values).filter(v=>v!==null),min=all.length?Math.floor(Math.min(...all))-1:-30,max=all.length?Math.ceil(Math.max(...all))+1:5;
  return `<div class="diagnostic-endpoint">${side} · ${esc(e.instance)} / ${esc(e.interface)}</div>${measured.length?`<table class="diagnostics-table"><thead><tr><th>READING</th><th>VALUE</th><th>STATE</th></tr></thead><tbody>${measured.map(r=>`<tr><td>${esc(r.property)}</td><td>${r.stale||r.value===null?'—':r.value.toFixed(2)+' '+esc(r.unit||'unit not reported')}</td><td class="${r.stale?'inactive':r.severity==='alarm'?'alarm':r.severity==='warning'?'warning':''}">${r.stale?'stale':r.active==='false'?'inactive':r.severity==='normal'?'reported':r.severity}</td></tr>`).join('')}</tbody></table>`:'<p class="metric-empty">No optic readings exported for this port.</p>'}${thresholds.length?`<details class="thresholds"><summary>Module alarm and warning thresholds</summary><p>${thresholds.map(r=>`${esc(r.property)}: ${r.stale?'stale':r.value===null?'—':r.value+' '+esc(r.unit||'')}`).join('<br>')}</p></details>`:''}${curves.length?`<div class="inspector-divider"></div><div class="detail-label">OPTICAL POWER · ${min} TO ${max} dBm</div>${chartHTML(curves,max,min)}<div class="reading-tag">${curves.map(c=>`<span style="color:${c.color}">${esc(c.label)}</span>`).join(' · ')}</div>`:''}`;
 }).join('')+`<p class="sample-age">${replay?'Replay optics; alarm thresholds are shown in live view.':'Readings at '+fmtDate(d.time)} · Units and lane names from exporter.</p>`;
 const options=ERRORS.map(([key,,label])=>`<option value="${key}" ${diagnosticMetric===key?'selected':''}>${label}</option>`).join('');
 return `<div class="detail-label">PORT ERRORS & FEC</div><select id="diagnostic-metric" class="diag-select" aria-label="Error metric to chart">${options}</select>${['A','B'].map(side=>{
 const e=l['endpoint'+side];if(!e)return '<p class="metric-empty">B · Far end unconfirmed; no counters assumed.</p>';
 const curves=[{color:side==='A'?'#70bff0':'#b39ddb',values:gridTimes().map(t=>{const sample=at(d.history.get(side+':'+diagnosticMetric+':time'),t,d.step);return sample===null||t-sample>MAX_AGE?null:at(d.history.get(side+':'+diagnosticMetric+':rate'),t,d.step)})}];
 const mx=Math.max(1,...curves[0].values.filter(v=>v!==null));
 return `<div class="diagnostic-endpoint">${side} · ${esc(e.instance)} / ${esc(e.interface)}</div><table class="diagnostics-table"><thead><tr><th>COUNTER</th><th>RATE / S</th><th>LAST ${range}H TOTAL</th></tr></thead><tbody>${ERRORS.map(([key,,label,unit])=>{const v=fresh(side,key)?current(side,key+':rate'):null;const count=d.map.get(side+':'+key+':count')??null,sample=d.map.get(side+':'+key+':time')??null;return `<tr><td>${label}<small>${unit}</small></td><td class="${v>0?(key==='fecCorrected'?'':'warning'):''}">${v===null?'—':v.toLocaleString(undefined,{maximumFractionDigits:3})}</td><td>${sample===null||d.time-sample>MAX_AGE||count===null?'—':count.toLocaleString(undefined,{maximumFractionDigits:1})}</td></tr>`}).join('')}</tbody></table><div class="inspector-divider"></div><div class="detail-label">${esc(ERRORS.find(e=>e[0]===diagnosticMetric)[2])} · 0–${mx.toFixed(1)} / s</div>${chartHTML(curves,mx)}`;
 }).join('')}<p class="sample-age">Rates use a 5-minute window. Totals are counter-reset-aware increases over ${range}h ending ${fmtDate(d.time)}; totals stay fixed during replay. Corrected FEC counts are not packet loss.</p>`;
}
function drawTable(){const rows=links.filter(relevant);$('#table-area').innerHTML=`<table><thead><tr><th>CIRCUIT</th><th>STATE</th><th>CAPACITY</th><th>A → B</th><th>B → A</th></tr></thead><tbody>${rows.map(l=>`<tr data-id="${l.id}" tabindex="0"><td>${esc(short(l.a))} ↔ ${esc(short(l.b))}<small>${esc(l.portA.split(' · ')[1]||'')} · ${l.id}</small></td><td style="color:${color(l)}">${l.state}</td><td>${l.capacity}G</td><td>${rate(val(l,'tx'))}</td><td>${rate(val(l,'rx'))}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">No sites or circuits match your search.</div>'}`;$('#table-area').querySelectorAll('[data-id]').forEach(el=>bind(el,()=>selectLink(el.dataset.id)))}
function setView(v){view=v;$('#map-area').hidden=v!=='topology';$('#table-area').hidden=v!=='circuits';for(const t of ['topology','circuits']){$('#'+t+'-tab').classList.toggle('selected',v===t);$('#'+t+'-tab').setAttribute('aria-selected',v===t)}$('.map-heading').style.display=v==='topology'?'flex':'none'}
function history(){
 const times=gridTimes();const values=times.map(t=>{const vals=links.flatMap(l=>['tx','rx'].map(k=>trafficValue(l,k,key=>at(historyMap.get(key),t,windowData.step),t)));return vals.length&&vals.every(v=>v!==null)?vals.reduce((a,b)=>a+b,0):null;});
 const mx=Math.max(1,...values.filter(v=>v!==null));$('#overview-chart').innerHTML=`<path d="${line(values,1000,52,mx)}" stroke="#70bff0" fill="none" stroke-width="1.4"/>${values.some(v=>v!==null)?'':`<text class="chart-message" x="500" y="30" text-anchor="middle">${esc(historyError||'Waiting for complete circuit history')}</text>`}`;
 $('#time-ticks').innerHTML=[0,.25,.5,.75,1].map(n=>`<span>${fmtTime(windowData?windowData.start+(windowData.end-windowData.start)*n:0)}</span>`).join('');$('#history-time').textContent=position===100?'Live':fmtTime(snapshotTime());$('#history-label').textContent=position===100?`${range}h measured history`:'Recorded samples';$('#scrubber').disabled=!historyMap.size;$('#play').disabled=!historyMap.size;
}
$('#expand-inspector').onclick=()=>{const expanded=$('.inspector-shell').classList.toggle('expanded');$('#expand-inspector').setAttribute('aria-expanded',String(expanded));$('#expand-inspector').setAttribute('aria-label',expanded?'Collapse inspector':'Expand inspector');$('#expand-inspector').title=expanded?'Collapse inspector':'Expand inspector';};
$('#topology-tab').onclick=()=>setView('topology');$('#circuits-tab').onclick=()=>setView('circuits');$('#rail-circuits').onclick=()=>setView('circuits');$('.rail-icon.active').onclick=()=>setView('topology');
$('#search').oninput=e=>{search=e.target.value;draw()};$('#labels').onchange=e=>{showLabels=e.target.checked;draw()};
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();$('#search').focus()}if(e.key==='Escape'){if($('.inspector-shell').classList.contains('expanded'))$('#expand-inspector').click();selectedNode=null;search='';$('#search').value='';draw();inspect()}});
$('#zoom-in').onclick=()=>{zoom=Math.min(1.8,zoom+.2);draw()};$('#zoom-out').onclick=()=>{zoom=Math.max(.6,zoom-.2);draw()};$('#fit').onclick=()=>{zoom=1;draw()};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.fabric').requestFullscreen()}catch{toast('Fullscreen is unavailable in this preview.')}};
$('#scrubber').oninput=e=>{position=Number(e.target.value);draw();inspect();history()};
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Ⅱ':'▶';$('#play').setAttribute('aria-label',playing?'Pause measured history':'Play measured history');clearInterval(timer);if(playing){if(position===100)position=0;timer=setInterval(()=>{position=Math.min(100,position+1);if(position===100){playing=false;clearInterval(timer);$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play measured history');}$('#scrubber').value=position;draw();inspect();history()},350)}};
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{clearInterval(timer);playing=false;$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play measured history');range=Number(b.dataset.range);document.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('selected',x===b));loadHistory();loadDiagnostics()});
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');setTimeout(()=>$('#toast').classList.remove('visible'),3000)}
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({source:client?.base||endpoint,sampledAt:fmtDate(snapshotTime()),rateWindow:'5m',geography:'Stockholm geographic schematic, not to scale',nodes:nodes.map(n=>({...n,state:nodeState(n)})),links:links.map(l=>({...l,tx:val(l,'tx'),rx:val(l,'rx')})),replayPosition:position},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sonix-network-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Network snapshot exported')};
function updateSummary(){
 const real=nodes.filter(n=>!n.id.startsWith('unpaired')),up=real.filter(n=>nodeState(n)==='up').length,down=real.filter(n=>nodeState(n)==='down').length,unknown=real.length-up-down;
 $('#reachability').innerHTML=`${up}<span class="dim"> / ${real.length}</span><small class="${down?'red':unknown?'':'green'}">${down?down+' down':unknown?unknown+' unknown':'Reachable'}</small>`;
 $('.mini-bars').innerHTML=real.map(n=>`<span style="color:${nodeState(n)==='up'?'#70bff0':nodeState(n)==='down'?'#ed858c':'#515964'}" title="${esc(n.label+': '+nodeState(n))}">▰</span>`).join(' ');
 const paired=links.filter(l=>!l.unpaired),ok=paired.filter(l=>l.state==='up').length,bad=paired.filter(l=>l.state==='down').length;
 $('#paired-summary').innerHTML=`${ok}<span class="dim"> / ${paired.length}</span><small class="${bad?'red':''}">${bad?bad+' down':paired.length-ok?paired.length-ok+' unknown':'Operational'}</small>`;
 const vals=links.flatMap(l=>['tx','rx'].map(k=>val(l,k))),known=vals.filter(v=>v!==null),sum=known.reduce((a,b)=>a+b,0);
 $('#total').innerHTML=`${known.length?sum.toFixed(1):'—'}<span class="unit">Gb/s</span>${known.length&&known.length<vals.length?'<small>Partial data</small>':''}`;
 $('.stats>div:nth-child(3)>p').textContent=`${known.length}/${vals.length} directions measured · counts circuit hops`;
 let best=null;for(const l of links)for(const k of ['tx','rx']){const v=val(l,k);if(v!==null&&(!best||v/l.capacity>best.pct))best={pct:v/l.capacity,from:k==='tx'?l.a:l.b,to:k==='tx'?l.b:l.a};}
 $('#highest-util').innerHTML=`${best?(best.pct*100).toFixed(1):'—'}<span class="unit">%</span>${best?`<small class="amber">${esc(short(best.from))} → ${esc(short(best.to))}</small>`:''}`;$('#highest-bar').style.width=(best?Math.min(100,best.pct*100):0)+'%';
}
function connectionUI(){
 const status=$('#connection-status');status.classList.toggle('live',!!lastSuccess&&!connectionError);status.classList.toggle('error',!!connectionError);
 status.querySelector('span').textContent=connecting?'Connecting to VictoriaMetrics…':connectionError?'Metrics connection unavailable':lastSuccess?`Live · fetched ${fmtTime(lastSuccess)}`:'Not connected';
 const banner=$('#connection-banner');banner.hidden=!connectionError;if(connectionError){banner.innerHTML=`<div><strong>VictoriaMetrics connection unavailable</strong>${esc(connectionError)}</div><div class="actions"><a href="${esc(client?.base||endpoint)}/api/v1/query?query=vector(1)" target="_blank" rel="noopener noreferrer">Sign in to SONIX ↗</a><button id="retry-metrics">Retry</button><button id="edit-metrics">Settings</button></div>`;$('#retry-metrics').onclick=()=>connect();$('#edit-metrics').onclick=openConnection;}
}
async function connect(){
 clearInterval(refreshTimer);sessionAbort.abort();historyAbort?.abort();diagnosticAbort?.abort();sessionAbort=new AbortController();const signal=sessionAbort.signal;
 clearInterval(timer);playing=false;$('#play').textContent='▶';$('#play').setAttribute('aria-label','Play measured history');connecting=true;connectionError='';lastSuccess=0;liveTime=0;windowData=null;liveMap=new Map();historyMap=new Map();diagnostics=null;diagnosticLoading=false;diagnosticError='';historyError='';instances=new Map();resolved=[];position=100;$('#scrubber').value=100;
 try{client=new VictoriaClient(endpoint,fetch,useCookies?'include':'omit');endpoint=client.base;localStorage.setItem('sonix-metrics-url',endpoint);localStorage.setItem('sonix-use-cookies',String(useCookies));connectionUI();draw();inspect();history();instances=await discover(client,nodes,signal);if(signal.aborted)return;resolved=resolvedLinks(links,instances);await refreshLive(signal);if(signal.aborted)return;connecting=false;connectionUI();if(!connectionError){loadHistory();loadDiagnostics();refreshTimer=setInterval(async()=>{if(document.hidden)return;await refreshLive(signal);if(!signal.aborted&&!connectionError){if(!playing&&position===100)loadDiagnostics();if(!playing&&position===100&&(!windowData||Date.now()/1000-windowData.end>Math.max(120,windowData.step*2)))loadHistory(false);}},30000);}}
 catch(e){if(signal.aborted)return;connecting=false;connectionError=e.message;connectionUI();draw();inspect();history();}
}
let liveBusy=null;
async function refreshLive(signal){if(liveBusy===signal)return;liveBusy=signal;try{const now=Math.floor(Date.now()/1000),d=await client.query(fabricQuery(resolved,nodes,instances),{time:now},signal);if(signal.aborted)return;liveMap=vectorMap(d.result);liveTime=now;lastSuccess=now;connectionError='';}catch(e){if(!signal.aborted){liveMap=new Map();liveTime=Date.now()/1000;connectionError=e.message;}}finally{if(liveBusy===signal)liveBusy=null;if(!signal.aborted){connectionUI();draw();inspect();}}}
async function loadHistory(reset=true){
 if(!resolved.length||connectionError)return;historyAbort?.abort();const gen=++historyGeneration;historyAbort=new AbortController();const signal=AbortSignal.any([sessionAbort.signal,historyAbort.signal]);const nextWindow=historyWindow(range);
 if(reset){historyMap=new Map();windowData=nextWindow;position=100;$('#scrubber').value=100;historyError='Loading measured history…';draw();inspect();history();}
 try{const d=await client.range(fabricQuery(resolved,nodes,instances),nextWindow.start,nextWindow.end,nextWindow.step,signal);if(gen!==historyGeneration||signal.aborted)return;windowData=nextWindow;historyMap=matrixMap(d.result);historyError='';draw();inspect();history();if(diagnostics?.end!==windowData.end)loadDiagnostics();}catch(e){if(gen!==historyGeneration||signal.aborted)return;historyMap=new Map();historyError=e.message;inspect();history();}
}
async function loadDiagnostics(){
 diagnosticAbort?.abort();const gen=++diagnosticGeneration;diagnosticAbort=new AbortController();const signal=AbortSignal.any([sessionAbort.signal,diagnosticAbort.signal]),l=resolved.find(l=>l.id===selected),hours=range;
 if(!l||connectionError){diagnosticLoading=false;return;}if(diagnostics?.link!==l.id||diagnostics?.hours!==hours)diagnostics=null;diagnosticLoading=true;diagnosticError='';if(detailTab!=='traffic')inspect();
 const time=Math.floor(Date.now()/1000),w=windowData&&windowData.end-windowData.start===hours*3600?{...windowData}:historyWindow(hours,time);
 try{const [instant,historical]=await Promise.all([client.query(diagnosticQuery(l,hours),{time},signal),client.range(diagnosticHistoryQuery(l),w.start,w.end,w.step,signal)]);if(gen!==diagnosticGeneration||signal.aborted)return;
 const opticsHistory=historical.result.map(r=>({...r,values:r.values.map(([t,v])=>[Number(t),Number.isFinite(Number(v))?Number(v):null])}));
 diagnostics={link:l.id,hours,time,end:w.end,map:vectorMap(instant.result),history:matrixMap(historical.result.filter(r=>!r.metric.binding.endsWith(':optic')&&!r.metric.binding.endsWith(':opticTime'))),raw:instant.result,opticsHistory,step:w.step};
 }catch(e){if(gen!==diagnosticGeneration||signal.aborted)return;diagnosticError=e.message;diagnostics=null;}finally{if(gen===diagnosticGeneration&&!signal.aborted){diagnosticLoading=false;if(!selectedNode)inspect();}}
}
function openConnection(){$('#metrics-url').value=endpoint;$('#session-cookies').checked=useCookies;$('#dashboard-origin').textContent=location.origin;$('#metrics-signin').href=(client?.base||endpoint)+'/api/v1/query?query=vector(1)';$('#connection-dialog').showModal();}
$('#connection-status').onclick=openConnection;$('#close-connection').onclick=()=>$('#connection-dialog').close();
$('#connection-form').onsubmit=e=>{e.preventDefault();try{endpoint=new VictoriaClient($('#metrics-url').value).base;useCookies=$('#session-cookies').checked;}catch(e){toast(e.message);return;}$('#connection-dialog').close();connect();};
$('#metrics-url').onchange=e=>{try{$('#metrics-signin').href=new VictoriaClient(e.target.value).base+'/api/v1/query?query=vector(1)';}catch{}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!connecting&&resolved.length)refreshLive(sessionAbort.signal)});
window.addEventListener('pagehide',()=>{sessionAbort.abort();clearInterval(timer);clearInterval(refreshTimer)});
draw();inspect();history();connect();
