import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {NativeResponseCDPLedger, reconcileCDPTraces, installNativeResponseCDP} from './native-response-cdp.mjs';
const url='http://127.0.0.1:1234/art/a.png',sha='a'.repeat(64);
function fixture(){
 const ledger=new NativeResponseCDPLedger({targetId:'page1',observerURL:'observer.js'});
 ledger.event('Runtime.executionContextCreated',{context:{id:1,uniqueId:'unique1',auxData:{isDefault:true,frameId:'frame1'}}});
 ledger.event('Debugger.scriptParsed',{scriptId:'s1',url:'observer.js',executionContextId:1});
 const bind=payload=>ledger.event('Runtime.bindingCalled',{name:'__frontlineNativeResponseBinding',executionContextId:1,payload:JSON.stringify({scope:'doc1',...payload})});
 bind({type:'document',url:'http://127.0.0.1:1234/'});
 const record={scope:'doc1',url,method:'GET',ordinal:1,startedOrder:1,updatedOrder:5,status:200,responseURL:url,redirected:false,readerCount:1,readerMode:'default',bytesRead:3,eofOrder:4,signalAbortOrder:5};
 bind({type:'record',record:{...record,updatedOrder:4,signalAbortOrder:undefined}}); bind({type:'record',record}); bind({type:'snapshot',reason:'before-close',snapshot:{scope:'doc1',records:[record],faults:[],overflow:0}});
 const request={requestId:'r1',request:{url,method:'GET'},type:'Fetch',frameId:'frame1',loaderId:'loader1',documentURL:'http://127.0.0.1:1234/',initiator:{type:'script',stack:{callFrames:[{scriptId:'s1'}]}}};
 ledger.event('Network.requestWillBeSent',request); ledger.event('Network.responseReceived',{requestId:'r1',response:{url,status:200,fromServiceWorker:false}});
 const fail=()=>ledger.event('Network.loadingFailed',{requestId:'r1',errorText:'net::ERR_ABORTED'});
 const reconcile=(playwrightFailures=[{url,message:'net::ERR_ABORTED'}])=>reconcileCDPTraces({ledgers:[ledger],playwrightFailures,served:new Map([[url,{bytes:3,sha256:sha,immutable:true}]]),expected:new Map([[url,{bytes:3,sha256:sha}]])});
 return {ledger,bind,record,request,fail,reconcile};
}
test('page target + exact observer script + default execution context proves one document-scoped window fetch',()=>{
 const f=fixture();f.fail();f.ledger.event('Runtime.executionContextDestroyed',{executionContextId:1});const r=f.reconcile();
 assert.equal(r.completedBodyAbortReports.length,1);assert.deepEqual(r.unclassified,[]);assert.equal(r.diagnosticsAgree,true);
 assert.deepEqual(r.completedBodyAbortReports[0].request.proof,{targetId:'page1',executionContextId:1,executionContextUniqueId:'unique1',frameId:'frame1',observerURL:'observer.js'});
});
for(const [name,change] of Object.entries({
 'worker or unproven target stack':f=>{f.ledger.scripts.get('s1').context={id:2,isDefault:false,frameId:'frame1',scope:'doc1'};},
 'isolated execution world':f=>{f.ledger.contexts.get(1).isDefault=false;},
 'different frame':f=>{f.ledger.requests.get('r1').frameId='frame2';},
 'HTML image request':f=>{f.ledger.requests.get('r1').type='Image';},
 'XHR request':f=>{f.ledger.requests.get('r1').type='XHR';},
 'missing scriptId proof':f=>{f.ledger.requests.get('r1').scriptIds=[];},
 'different script URL':f=>{f.ledger.scripts.get('s1').url='unrelated.js';},
 'undeclared document':f=>{f.ledger.documents.get('doc1').declared=false;},
 'response service-worker provenance omitted':f=>{delete f.ledger.requests.get('r1').fromServiceWorker;},
 'redirect requestId reuse':f=>f.ledger.event('Network.requestWillBeSent',{...f.request,request:{url:url+'?redirect',method:'GET'},redirectResponse:{status:302}}),
 'native record arrives with another scope':f=>f.bind({type:'record',record:{...f.record,scope:'wrong'}}),
 'trace overflow':f=>f.bind({type:'snapshot',snapshot:{scope:'doc1',records:[f.record],faults:[],overflow:1}}),
 'body has no native EOF':f=>f.bind({type:'record',record:{...f.record,updatedOrder:6,eofOrder:undefined}}),
 'later overlapping fetch has no network identity':f=>f.bind({type:'record',record:{...f.record,ordinal:2,startedOrder:3,updatedOrder:7}}),
}))test(`${name} remains unclassified`,()=>{const f=fixture();change(f);f.fail();const r=f.reconcile();assert.equal(r.completedBodyAbortReports.length,0);assert.equal(r.unclassified.length,1);});
test('executionContextId reuse after navigation cannot relabel the old request as the new document',()=>{
 const f=fixture();f.ledger.event('Runtime.executionContextsCleared',{});f.ledger.event('Runtime.executionContextCreated',{context:{id:1,uniqueId:'unique2',auxData:{isDefault:true,frameId:'frame1'}}});
 f.ledger.event('Runtime.bindingCalled',{name:'__frontlineNativeResponseBinding',executionContextId:1,payload:JSON.stringify({type:'document',scope:'doc2',url:'http://127.0.0.1:1234/next'})});
 f.fail();assert.equal(f.ledger.snapshot().network[0].scope,'doc1');assert.equal(f.ledger.snapshot().network[0].proof.executionContextUniqueId,'unique1');
});
test('reordered older snapshots never overwrite newer native EOF/cancel updates',()=>{
 const f=fixture();f.bind({type:'snapshot',snapshot:{scope:'doc1',records:[{...f.record,updatedOrder:2,eofOrder:undefined,signalAbortOrder:undefined}],faults:[],overflow:0}});f.fail();assert.equal(f.reconcile().completedBodyAbortReports.length,1);
});
test('all request diagnostics remain strict through final browser-close reconciliation',()=>{
 const f=fixture();assert.equal(f.reconcile([]).total,0);f.fail();const final=f.reconcile();assert.equal(final.total,1);assert.equal(final.afterBrowserClose,true);
 assert.equal(f.reconcile([{url,message:'net::ERR_ABORTED'},{url:url+'?late',message:'net::ERR_ABORTED'}]).diagnosticsAgree,false);
 f.ledger.event('Network.loadingFailed',{requestId:'never-observed',errorText:'net::ERR_ABORTED'});assert.equal(f.reconcile().unclassified.length,1);
});
test('a missing post-install snapshot and observer capture failure stay explicit',()=>{
 const f=fixture();f.ledger.documents.get('doc1').snapshots=[];f.ledger.captureFailures.push({reason:'before-close',error:'context destroyed'});f.fail();const r=f.reconcile();assert.equal(r.unclassified.length,1);assert.equal(r.captureFailures.length,1);
});
test('a late native record requires a later final snapshot; an installed-only snapshot is insufficient',()=>{
 const f=fixture();f.bind({type:'record',record:{...f.record,updatedOrder:6}});f.fail();assert.equal(f.reconcile().unclassified.length,1);
 f.bind({type:'snapshot',reason:'pagehide',snapshot:{scope:'doc1',records:[{...f.record,updatedOrder:6}],faults:[],overflow:0}});assert.equal(f.reconcile().completedBodyAbortReports.length,1);
 f.ledger.documents.get('doc1').snapshots.at(-1).reason='installed';assert.equal(f.reconcile().unclassified.length,1);
});
test('installation is explicitly page-target-only and uses observation APIs, not response interception or body reads',async()=>{
 const commands=[],listeners=[];
 const session={on(name){listeners.push(name);},async send(name,args){commands.push({name,args});return name==='Target.getTargetInfo'?{targetInfo:{type:'page',targetId:'p'}}:{};}};
 const collector=await installNativeResponseCDP({context:()=>({newCDPSession:async()=>session})},{caseId:'one',origin:'http://127.0.0.1:1234'});
 assert.doesNotThrow(()=>new Script(collector.source));assert.match(collector.source,/window.fetch = observer.fetch/);assert.match(collector.source,/pagehide/);
 assert.deepEqual(commands.map(x=>x.name),['Target.getTargetInfo','Runtime.enable','Debugger.enable','Network.enable','Page.enable','Runtime.addBinding','Page.addScriptToEvaluateOnNewDocument']);
 assert.ok(listeners.includes('Network.loadingFailed'));assert.ok(listeners.includes('Runtime.bindingCalled'));
 assert.equal(collector.ledger.observerURL,'http://127.0.0.1:1234/__diagnostics__/native-response-observer-one.js');
});
test('a worker target can never be installed as a page observer',async()=>{
 const session={async send(){return {targetInfo:{type:'worker',targetId:'w'}};}};
 await assert.rejects(installNativeResponseCDP({context:()=>({newCDPSession:async()=>session})},{caseId:'one',origin:'http://127.0.0.1:1234'}),/actual page target/);
});

test('a later reset cannot classify an earlier network failure, even after exact EOF',()=>{
 const f=fixture();const record=f.ledger.documents.get('doc1').records.values().next().value;
 // Preserve the native EOF proof but place its actual abort callback after the
 // network failure, as the first full-App trace demonstrated.
 delete record.cdpObserved.signalAbortOrder;f.fail();
 f.bind({type:'record',record:{...f.record,updatedOrder:6}});
 f.bind({type:'snapshot',reason:'before-close',snapshot:{scope:'doc1',records:[{...f.record,updatedOrder:6}],faults:[],overflow:0}});
 const result=f.reconcile();assert.equal(result.completedBodyAbortReports.length,0);
 assert.equal(result.unclassified[0].reason,'eof-cancellation-network-order-unproved');
});
test('snapshot-only cancellation cannot establish its ordering before a network failure',()=>{
 const f=fixture();const record=f.ledger.documents.get('doc1').records.values().next().value;
 delete record.cdpObserved.signalAbortOrder;f.fail();
 f.bind({type:'snapshot',reason:'before-close',snapshot:{scope:'doc1',records:[{...f.record,updatedOrder:6}],faults:[],overflow:0}});
 assert.equal(f.reconcile().completedBodyAbortReports.length,0);
});
