// Browser-only, fixed topology queries. No service credential is stored or sent.
export const DEFAULT_URL='https://victoria.local.sonix.network/prometheus';
export const RATE_WINDOW='5m';
export const MAX_AGE=180;
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
export function normalizeURL(input){
 const u=new URL(input);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('Use an HTTPS metrics URL.');
 if(u.username||u.password||u.search||u.hash)throw new Error('Use a query URL without credentials, parameters, or a fragment.');
 u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/api\/v1\/(?:query_range|query)$/,'');return u.href.replace(/\/$/,'');
}
export class VictoriaClient{
 constructor(url,fetcher=fetch,credentials='include'){this.base=normalizeURL(url);this.fetcher=(...args)=>fetcher(...args);this.credentials=credentials;}
 async request(api,params={},signal){
  const u=new URL(this.base+'/api/v1/'+api);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));
  const timeout=AbortSignal.timeout(20000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  let r;try{r=await this.fetcher(u,{method:'GET',credentials:this.credentials,mode:'cors',headers:{Accept:'application/json'},signal:combined,cache:'no-store'});}catch(e){if(signal?.aborted)throw e;console.warn('Metrics request failed:',e.name,e.message);throw new Error('Cannot read VictoriaMetrics. Sign in to SONIX, then retry. The gateway must allow this origin with credentials; browser third-party cookie settings can also block the session.');}
  if(!r.ok)throw new Error(r.status===401||r.status===403?'SONIX sign-in is required. Sign in, then retry.':`Metrics request failed (HTTP ${r.status}).`);
  if(!(r.headers.get('content-type')||'').includes('json'))throw new Error('The metrics gateway returned a sign-in page. Sign in to SONIX, then retry.');
  const body=await r.json();if(body.status!=='success')throw new Error(body.error||'VictoriaMetrics rejected the query.');return body.data;
 }
 async batched(api,query,params,signal){
  const parts=query.split(/ or (?=label_replace\()/),groups=[];let group=[];
  for(const part of parts){if(group.length&&encodeURIComponent([...group,part].join(' or ')).length>5500){groups.push(group.join(' or '));group=[];}group.push(part);}if(group.length)groups.push(group.join(' or '));
  const results=new Array(groups.length);let cursor=0;const abort=new AbortController();const batchSignal=signal?AbortSignal.any([signal,abort.signal]):abort.signal;
  try{await Promise.all(Array.from({length:Math.min(3,groups.length)},async()=>{while(cursor<groups.length&&!batchSignal.aborted){const index=cursor++;results[index]=await this.request(api,{query:groups[index],...params},batchSignal);}}));}catch(e){abort.abort();throw e;}
  return {resultType:api==='query_range'?'matrix':'vector',result:results.flatMap(r=>r.result)};
 }
 query(query,params={},signal){return this.batched('query',query,params,signal)}
 range(query,start,end,step,signal){return this.batched('query_range',query,{start,end,step},signal)}
}
const quote=s=>JSON.stringify(s);
export function selector(e,device=false){return `{job="node",instance=${quote(e.instance)},${device?'device':'interface'}=${quote(e.interface)}}`;}
const bind=(q,key)=>`label_replace((${q}),"binding",${quote(key)},"","")`;
const join=qs=>qs.join(' or ');
export async function discover(client,nodes,signal){
 const ids=nodes.filter(n=>!n.id.startsWith('unpaired')).map(n=>n.id);
 const pattern=ids.join('|');const d=await client.query(`up{job="node",instance=~"(${pattern})(\\\\.sonix\\\\.network:9100)?"}`,{},signal);
 const map=new Map();for(const id of ids){const candidates=d.result.filter(r=>r.metric.instance===id||r.metric.instance===id+'.sonix.network:9100');candidates.sort((a,b)=>(a.metric.instance===id?-1:1)-(b.metric.instance===id?-1:1));if(candidates.length)map.set(id,candidates[0].metric.instance);}
 return map;
}
export function resolvedLinks(links,instances){return links.map(l=>({...l,endpointA:{...l.endpointA,instance:instances.get(l.endpointA.instance)||l.endpointA.instance},endpointB:l.endpointB?{...l.endpointB,instance:instances.get(l.endpointB.instance)||l.endpointB.instance}:null}));}
function traffic(l,dir){const a=selector(l.endpointA),b=l.endpointB&&selector(l.endpointB);const out=dir==='tx'?'out':'in',other=dir==='tx'?'in':'out';return `(max(rate(sai_port_${out}_packet_size_bytes_sum${a}[${RATE_WINDOW}]))${b?` or max(rate(sai_port_${other}_packet_size_bytes_sum${b}[${RATE_WINDOW}]))`:''}) * 8 / 1e9`;}
function trafficTime(l,dir){const out=dir==='tx'?'out':'in',other=dir==='tx'?'in':'out';return `max(timestamp(sai_port_${out}_packet_size_bytes_sum${selector(l.endpointA)}))${l.endpointB?` or max(timestamp(sai_port_${other}_packet_size_bytes_sum${selector(l.endpointB)}))`:''}`;}
export function fabricQuery(links,nodes,instances){const qs=[];
 for(const n of nodes.filter(n=>!n.id.startsWith('unpaired'))){const sel=`{job="node",instance=${quote(instances.get(n.id)||n.id)}}`;qs.push(bind(`max(up${sel})`,`node:${n.id}`),bind(`max(timestamp(up${sel}))`,`nodeTime:${n.id}`));}
 for(const l of links){for(const k of ['tx','rx'])qs.push(bind(traffic(l,k),`${l.id}:${k}`),bind(trafficTime(l,k),`${l.id}:${k}Time`));for(const side of ['A','B']){const e=l['endpoint'+side];if(e)qs.push(bind(`max(node_network_carrier${selector(e,true)})`,`${l.id}:state${side}`),bind(`max(timestamp(node_network_carrier${selector(e,true)}))`,`${l.id}:state${side}Time`));}}
 return join(qs);
}
export function historyQuery(links){const qs=[];for(const l of links){for(const k of ['tx','rx'])qs.push(bind(traffic(l,k),`${l.id}:${k}`),bind(trafficTime(l,k),`${l.id}:${k}Time`));for(const side of ['A','B']){const e=l['endpoint'+side];if(e)qs.push(bind(`max(node_network_carrier${selector(e,true)})`,`${l.id}:state${side}`),bind(`max(timestamp(node_network_carrier${selector(e,true)}))`,`${l.id}:state${side}Time`));}}return join(qs);}
export function vectorMap(result){return new Map(result.map(r=>[r.metric.binding,finite(r.value?.[1])]));}
export function matrixMap(result){return new Map(result.map(r=>[r.metric.binding,r.values.map(([t,v])=>[Number(t),finite(v)])]));}
export function at(series,time,step){if(!series?.length)return null;let low=0,high=series.length-1,index=-1;while(low<=high){const mid=(low+high)>>1;if(series[mid][0]<=time+0.01){index=mid;low=mid+1}else high=mid-1;}return index<0||time-series[index][0]>step*1.1?null:series[index][1];}
export function stateOf(l,get,time){
 const side=s=>{const v=get(`${l.id}:state${s}`),t=get(`${l.id}:state${s}Time`);return t===null||time-t>MAX_AGE||v===null?'unknown':v===0?'down':v===1?'up':'unknown'};
 const a=side('A'),b=l.endpointB?side('B'):null;
 // A confirmed local failure remains visible even with an unpaired far end.
 return a==='down'||b==='down'?'down':l.unpaired?'unpaired':a==='up'&&b==='up'?'up':'unknown';
}
export function trafficValue(l,k,get,time){const t=get(`${l.id}:${k}Time`),v=get(`${l.id}:${k}`);return t===null||time-t>MAX_AGE||v===null?null:v;}
export const ERRORS=[
 ['rxErrors','sai_port_in_errored_packets_total','RX errors','packets'],['txErrors','sai_port_out_errored_packets_total','TX errors','packets'],
 ['rxDiscards','sai_port_in_discarded_packets_total','RX discards','packets'],['txDiscards','sai_port_out_discarded_packets_total','TX discards','packets'],
 ['fecCorrected','sai_port_in_fec_correctable_frames_total','FEC corrected','frames'],['fecUncorrected','sai_port_in_fec_not_correctable_frames_total','FEC uncorrectable','frames'],['fecSymbols','sai_port_in_fec_symbol_errors_total','FEC symbol errors','symbols']
];
export function diagnosticQuery(l,hours){const qs=[];for(const side of ['A','B']){const e=l['endpoint'+side];if(!e)continue;const sel=selector(e);for(const [key,metric] of ERRORS){qs.push(bind(`max(rate(${metric}${sel}[${RATE_WINDOW}]))`,`${side}:${key}:rate`),bind(`max(increase(${metric}${sel}[${hours}h]))`,`${side}:${key}:count`),bind(`max(timestamp(${metric}${sel}))`,`${side}:${key}:time`));}qs.push(bind(`sfp_eeprom_value${sel}`,`${side}:optic`),bind(`timestamp(sfp_eeprom_value${sel})`,`${side}:opticTime`));}return join(qs);}
export function diagnosticHistoryQuery(l){const qs=[];for(const side of ['A','B']){const e=l['endpoint'+side];if(!e)continue;const sel=selector(e);qs.push(bind(`sfp_eeprom_value{job="node",instance=${quote(e.instance)},interface=${quote(e.interface)},property=~"(rx|tx)[0-9]*power",unit="dBm"}`,`${side}:optic`),bind(`timestamp(sfp_eeprom_value{job="node",instance=${quote(e.instance)},interface=${quote(e.interface)},property=~"(rx|tx)[0-9]*power",unit="dBm"})`,`${side}:opticTime`));for(const [key,metric] of ERRORS)qs.push(bind(`max(rate(${metric}${sel}[${RATE_WINDOW}]))`,`${side}:${key}:rate`),bind(`max(timestamp(${metric}${sel}))`,`${side}:${key}:time`));}return join(qs);}
export function opticRows(result,side,time){const ts=new Map(result.filter(r=>r.metric.binding===`${side}:opticTime`).map(r=>[r.metric.property,finite(r.value?.[1])]));const rows=result.filter(r=>r.metric.binding===`${side}:optic`).map(r=>({property:r.metric.property,unit:r.metric.unit,active:r.metric.active,value:finite(r.value?.[1]),sampleTime:ts.get(r.metric.property)??null})).map(r=>({...r,stale:r.sampleTime===null||time-r.sampleTime>MAX_AGE}));
 for(const r of rows){r.severity=r.stale?'unknown':'normal';const family=/^rx\d*power$/.test(r.property)?'rxpower':/^tx\d*power$/.test(r.property)?'txpower':r.property==='temperature'?'temp':null;if(family&&r.value!==null&&!r.stale&&r.active!=='false'){for(const [suffix,compare,severity] of [['lowwarning',(a,b)=>a<b,'warning'],['highwarning',(a,b)=>a>b,'warning'],['lowalarm',(a,b)=>a<b,'alarm'],['highalarm',(a,b)=>a>b,'alarm']]){const t=rows.find(x=>x.property===family+suffix&&x.unit===r.unit&&!x.stale&&x.value!==null);if(t&&compare(r.value,t.value))r.severity=severity;}}}
 return rows.sort((a,b)=>a.property.localeCompare(b.property,undefined,{numeric:true}));
}
export function historyWindow(hours,now=Date.now()/1000){if(![1,6,24].includes(hours))throw new Error('Unsupported history range');const step=Math.max(60,Math.ceil(hours*3600/240/30)*30),end=Math.floor(now/step)*step;return {start:end-hours*3600,end,step};}
