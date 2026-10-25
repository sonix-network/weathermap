import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeURL,VictoriaClient,at,stateOf,trafficValue,opticRows,fabricQuery,resolvedLinks,historyWindow,MAX_AGE} from '../dist/metrics.js';
const l={id:'link-1',a:'ixp-a',b:'ixp-b',endpointA:{instance:'ixp-a',interface:'Ethernet0'},endpointB:{instance:'ixp-b',interface:'Ethernet4'},unpaired:false};
test('query URL normalization preserves tenant prefix and rejects embedded credentials',()=>{
 assert.equal(normalizeURL('https://victoria.local.sonix.network/prometheus/api/v1/query_range'),'https://victoria.local.sonix.network/prometheus');
 assert.equal(normalizeURL('https://vm.example/select/7/prometheus/api/v1/query'),'https://vm.example/select/7/prometheus');
 assert.throws(()=>normalizeURL('https://user:secret@vm.example'));assert.throws(()=>normalizeURL('https://vm.example?token=x'));assert.throws(()=>normalizeURL('javascript:alert(1)'));
});
test('missing, stale and real zero traffic remain distinct',()=>{
 const data=new Map([['link-1:tx',0],['link-1:txTime',1000]]),get=k=>data.get(k)??null;
 assert.equal(trafficValue(l,'tx',get,1001),0);assert.equal(trafficValue(l,'rx',get,1001),null);assert.equal(trafficValue(l,'tx',get,1000+MAX_AGE+1),null);
});
test('port state checks both endpoints; unpaired local-down remains visible',()=>{
 const m=new Map([['link-1:stateA',1],['link-1:stateATime',1000],['link-1:stateB',1],['link-1:stateBTime',1000]]),get=k=>m.get(k)??null;
 assert.equal(stateOf(l,get,1001),'up');m.set('link-1:stateB',0);assert.equal(stateOf(l,get,1001),'down');m.delete('link-1:stateB');assert.equal(stateOf(l,get,1001),'unknown');
 assert.equal(stateOf({...l,unpaired:true,endpointB:null},get,1001),'unpaired');m.set('link-1:stateA',0);assert.equal(stateOf({...l,unpaired:true,endpointB:null},get,1001),'down');assert.equal(stateOf(l,get,1500),'unknown');
});
test('history keeps gaps and never carries a value beyond its sample step',()=>{
 const s=[[100,3],[160,null],[220,5]];assert.equal(at(s,90,60),null);assert.equal(at(s,159,60),3);assert.equal(at(s,180,60),null);assert.equal(at(s,220,60),5);assert.equal(at(s,300,60),null);
});
test('optics keep units, lanes, inactive state and exported matching thresholds',()=>{
 const rows=[];function metric(property,value,unit='dBm',active='true'){rows.push({metric:{binding:'A:optic',property,unit,active},value:[1000,String(value)]},{metric:{binding:'A:opticTime',property,unit,active},value:[1000,'990']});}
 metric('rx1power',-25);metric('rxpowerlowalarm',-23);metric('rxpowerlowwarning',-20);metric('tx1power',0);metric('tx2power',-30,'dBm','false');metric('temperature',40,'C');metric('temphighalarm',70,'C');
 const got=opticRows(rows,'A',1000);assert.equal(got.find(r=>r.property==='rx1power').severity,'alarm');assert.equal(got.find(r=>r.property==='tx1power').severity,'normal');assert.equal(got.find(r=>r.property==='tx2power').severity,'normal');assert.equal(got.find(r=>r.property==='temperature').unit,'C');assert.ok(opticRows(rows,'A',1400).every(r=>r.stale));
});
test('history ranges are bounded and aligned',()=>{for(const h of [1,6,24]){const w=historyWindow(h,1700000001);assert.equal(w.end%w.step,0);assert.ok((w.end-w.start)/w.step<=240);}assert.throws(()=>historyWindow(100));});
test('queries use mapped ports and do not guess unpaired far ends',()=>{
 const q=fabricQuery([{...l,unpaired:true,endpointB:null}],[],new Map());assert.match(q,/Ethernet0/);assert.doesNotMatch(q,/Ethernet4/);assert.doesNotMatch(q,/stateB/);assert.match(q,/rate\(sai_port_out_packet_size_bytes_sum/);
 assert.equal(resolvedLinks([l],new Map([['ixp-a','ixp-a.sonix.network:9100']]))[0].endpointA.instance,'ixp-a.sonix.network:9100');
});
test('browser includes session cookies and rejects API errors and sign-in HTML',async()=>{
 let options;const c=new VictoriaClient('https://vm.example',async(u,o)=>{options=o;return Response.json({status:'success',data:{result:[]}})});await c.query('up');assert.equal(options.credentials,'include');assert.equal(options.mode,'cors');assert.equal(options.method,'GET');
 const html=new VictoriaClient('https://vm.example',async()=>new Response('<html>sign in</html>',{headers:{'Content-Type':'text/html'}}));await assert.rejects(html.query('up'),/sign-in page/);
 const error=new VictoriaClient('https://vm.example',async()=>Response.json({status:'error',error:'invalid query'}));await assert.rejects(error.query('up'),/invalid query/);
});
test('large queries use bounded URLs and at most three concurrent requests',async()=>{
 let active=0,max=0,calls=0;const c=new VictoriaClient('https://vm.example',async(u)=>{assert.ok(u.href.length<6000);calls++;active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return Response.json({status:'success',data:{result:[]}})});
 const q=Array.from({length:100},(_,i)=>`label_replace((max(up{instance="${'x'.repeat(70)}${i}"})),"binding","n${i}","","")`).join(' or ');await c.query(q);assert.ok(calls>1);assert.ok(max<=3);
});

test('browser fetch is called without binding it to the client instance',async()=>{
 const c=new VictoriaClient('https://vm.example',function(){assert.equal(this,undefined);return Promise.resolve(Response.json({status:'success',data:{result:[]}}));});await c.query('up');
});
