import test from 'node:test';import assert from 'node:assert/strict';import {createHash}from'node:crypto';import{reconcileConsumedBodies,explicitControlDiagnostics}from'./native-consumed-body-cdp.mjs';
const hash=createHash('sha256').update('abc').digest('hex');
function fixture(method='GET'){
 const url=method==='GET'?'http://local/art/a.png':'http://local/api/v1/matches/abc/advice',native={scope:'A',method,url,ordinal:1,startedOrder:1,readerCount:1,readerMode:'default',status:200,redirected:false,responseURL:url,bytesRead:3,eofOrder:5,sha256:hash,cdpObserved:{eofOrder:50,hashOrder:80}},request={id:'page:request1',scope:'A',method,url,ordinal:1,realm:'window-fetch',redirected:false,status:200,fromServiceWorker:false,responseURL:url},failure={requestId:'page:request1',message:'net::ERR_ABORTED',order:40,url};
 return {snapshot:{faults:[],captureFailures:[],traces:[{scope:'A',records:[native],faults:[],overflow:0}],network:[request],failures:[failure]},served:new Map([[url,{bytes:3,sha256:hash}]]),serverAdvice:method==='POST'?[{method,path:'/api/v1/matches/abc/advice',ordinal:1,query_present:false,handler_returned:true,write_error:'',status:200,content_encoding:'',bytes:3,sha256:hash}]:[]};
}
test('exact consumed hash proves a bounded fact both before/after EOF, never inventing cancellation',()=>{
 for(const order of [40,60]){const f=fixture();f.snapshot.failures[0].order=order;const r=reconcileConsumedBodies(f);assert.equal(r.knownNativeReports.length,1);assert.equal(r.knownNativeReports[0].diagnostic.observedOrder,order===40?'network-failure-before-native-eof':'network-failure-after-native-eof');assert.deepEqual(r.knownNativeReports[0].diagnostic.nativeCancellationObserved,[]);assert.equal(r.rawFailures.length,1)}
});
test('missing native hash, wrong hash, truncated byte count and read errors cannot be replaced by served proof',()=>{
 for(const change of [r=>delete r.sha256,r=>r.sha256='0'.repeat(64),r=>r.bytesRead=2,r=>r.readError='native truncated',r=>delete r.eofOrder]){const f=fixture();change(f.snapshot.traces[0].records[0]);const r=reconcileConsumedBodies(f);assert.equal(r.knownNativeReports.length,0);assert.equal(r.proofs[0].complete,false)}
});
test('ambiguous URL overlap, realm, identity, service worker and collector faults fail closed',()=>{
 for(const change of [f=>f.snapshot.network[0].realm='unproven',f=>f.snapshot.network[0].fromServiceWorker=true,f=>f.snapshot.faults.push('lost document'),f=>{f.snapshot.traces[0].records.push({...f.snapshot.traces[0].records[0],ordinal:2,startedOrder:2});f.snapshot.network.push({...f.snapshot.network[0],id:'page:2',ordinal:2})}]){const f=fixture();change(f);assert.equal(reconcileConsumedBodies(f).knownNativeReports.length,0)}
 const f=fixture();f.snapshot.failures[0].requestId='other:request';assert.equal(reconcileConsumedBodies(f).knownNativeReports.length,0);
});
test('POST proof requires exact serial server-written hash, no short write, and matching request count',()=>{
 assert.equal(reconcileConsumedBodies(fixture('POST')).knownNativeReports.length,1);
 for(const change of [f=>f.serverAdvice[0].write_error='short native Write',f=>f.serverAdvice[0].bytes=2,f=>f.serverAdvice[0].sha256='0'.repeat(64),f=>f.serverAdvice.push({...f.serverAdvice[0],ordinal:2}),f=>f.serverAdvice[0].handler_returned=false,f=>f.serverAdvice.push({trace_overflow:true})]){const f=fixture('POST');change(f);assert.equal(reconcileConsumedBodies(f).knownNativeReports.length,0)}
});
test('other network errors stay raw even if a separate byte-integrity fact is complete',()=>{const f=fixture();f.snapshot.failures[0].message='net::ERR_NETWORK_CHANGED';const r=reconcileConsumedBodies(f);assert.equal(r.proofs[0].complete,true);assert.equal(r.knownNativeReports.length,0);assert.equal(r.rawFailures.length,1)});

test('only an actual failed negative control and its exact URL/code explain console diagnostics',()=>{
 const url='http://local/__diagnostics__/body-proof/truncated?case=1',message='Failed to load resource: net::ERR_CONTENT_LENGTH_MISMATCH';
 const exact={message,location:{url}},foreign={message,location:{url:'http://local/art/a.png'}},wrong={message:'Failed to load resource: net::ERR_ABORTED',location:{url}};
 const r=explicitControlDiagnostics({controls:[{kind:'truncated',url,error:{name:'TypeError'}}],consoleErrors:[exact,foreign,wrong],failures:[{url,message:'net::ERR_CONTENT_LENGTH_MISMATCH'},{url,message:'net::ERR_ABORTED'}]});
 assert.deepEqual(r.expectedConsole,[exact]);assert.deepEqual(r.unexpectedConsole,[foreign,wrong]);assert.equal(r.expectedNetwork.length,1);assert.equal(r.otherNetwork.length,1);
 assert.equal(explicitControlDiagnostics({controls:[{kind:'truncated',url}],consoleErrors:[exact],failures:[]}).unexpectedConsole.length,1);
});
test('an ambiguous failed native JSON request is never waived by successful parsed output or a supplied hash',()=>{
 const f=fixture(),r=f.snapshot.traces[0].records[0];Object.assign(r,{hashImplementation:'incremental-sha256-v1',hashedBytes:3,bodyMethods:['json'],readerCount:0,completion:'native-json-fulfilled',bodyMethodSettledOrder:10});delete r.eofOrder;
 f.snapshot.traces[0].records.push({...r,ordinal:2,startedOrder:2,bodyMethodSettledOrder:11});f.snapshot.network.push({...f.snapshot.network[0],id:'page:request2',ordinal:2});
 const result=reconcileConsumedBodies(f);assert.equal(result.rawFailures.length,1);assert.equal(result.knownNativeReports.length,0);assert(result.proofs.every(p=>!p.complete&&p.reason==='request-ordinal-or-realm-ambiguous'));
 // Even an unambiguous native JSON response cannot use reserialized bytes.
 f.snapshot.traces[0].records.pop();f.snapshot.network.pop();const single=reconcileConsumedBodies(f);assert.equal(single.knownNativeReports.length,0);assert.equal(single.proofs[0].complete,false);
});
