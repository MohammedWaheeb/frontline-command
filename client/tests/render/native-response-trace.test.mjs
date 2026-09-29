import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeResponseTrace,reconcileNativeResponses} from './native-response-trace.mjs';

const origin='http://127.0.0.1:9000',url=origin+'/art/example.png',sha='a'.repeat(64);
function fixture(){
 const read={scope:'doc1',url,method:'GET',ordinal:1,startedOrder:1,status:200,responseURL:url,redirected:false,readerCount:1,readerMode:'default',bytesRead:3,eofOrder:4,signalAbortOrder:5};
 const request={id:'r1',scope:'doc1',url,method:'GET',ordinal:1,status:200,responseURL:url,redirected:false,fromServiceWorker:false,realm:'window-fetch'};
 return {engine:'chromium',failures:[{requestId:'r1',url,message:'net::ERR_ABORTED'}],network:[request],traces:[{scope:'doc1',records:[read],faults:[],overflow:0}],served:new Map([[url,{bytes:3,sha256:sha,immutable:true}]]),expected:new Map([[url,{bytes:3,sha256:sha}]])};
}
function response(body){const value=new Response(body,{status:200});Object.defineProperty(value,'url',{value:url});return value}
test('observer performs one native fetch/read, preserves result identities and observes EOF before signal abort',async()=>{
 const signal=new AbortController(),chunk=new Uint8Array([1,2,3]),events=[];let fetchCalls=0,reads=0;
 const native=response(new ReadableStream({start(c){c.enqueue(chunk);c.close()}})),getReader=native.body.getReader.bind(native.body);let nativeReader;
 native.body.getReader=(...args)=>{nativeReader=getReader(...args);const read=nativeReader.read.bind(nativeReader);nativeReader.read=(...args)=>{reads++;return read(...args)};return nativeReader};
 const args=[url,{signal:signal.signal}],receiver={same:true};
 const trace=nativeResponseTrace(function(...actual){fetchCalls++;assert.equal(this,receiver);assert.deepEqual(actual,args);return Promise.resolve(native)},{scope:'doc1',baseURL:origin,onRecord:r=>events.push(r)});
 assert.equal(await trace.fetch.call(receiver,...args),native);const reader=native.body.getReader();assert.equal(reader,nativeReader);
 const first=await reader.read();assert.equal(first.value,chunk);assert.equal((await reader.read()).done,true);reader.releaseLock();signal.abort();
 const record=trace.snapshot().records[0];assert.equal(fetchCalls,1);assert.equal(reads,2);assert.equal(record.bytesRead,3);assert(record.signalAbortOrder>record.eofOrder);assert.deepEqual(trace.snapshot().faults,[]);assert(events.some(e=>e.eofOrder));
});
test('native rejection object and synchronous throw reach the consumer without retry or substitution',async()=>{
 const error=new Error('native fetch failure');let calls=0;
 const trace=nativeResponseTrace(()=>{calls++;return Promise.reject(error)},{scope:'doc1',baseURL:origin});
 await assert.rejects(trace.fetch(url),actual=>actual===error);assert.equal(calls,1);assert.match(trace.snapshot().records[0].fetchError,/native fetch failure/);
 const synchronous=nativeResponseTrace(()=>{throw error},{scope:'doc1',baseURL:origin});assert.throws(()=>synchronous.fetch(url),actual=>actual===error);
});
test('reader rejection and caller cancel retain exact error/reason and are never converted to EOF',async()=>{
 const error=new Error('native stream failure'),native=response(new ReadableStream({pull(c){c.error(error)}}));
 const trace=nativeResponseTrace(()=>Promise.resolve(native),{scope:'doc1',baseURL:origin});await trace.fetch(url);await assert.rejects(native.body.getReader().read(),actual=>actual===error);assert(!trace.snapshot().records[0].eofOrder);
 const reason={callerReason:true};let observed;const cancelResponse=response(new ReadableStream({cancel(value){observed=value}}));
 const canceled=nativeResponseTrace(()=>Promise.resolve(cancelResponse),{scope:'doc2',baseURL:origin});await canceled.fetch(url);await cancelResponse.body.getReader().cancel(reason);assert.equal(observed,reason);assert(!canceled.snapshot().records[0].eofOrder);assert(canceled.snapshot().records[0].cancelSettledOrder);
});
test('nonasset calls pass through and trace overflow remains an explicit classification blocker',async()=>{
 const promise=Promise.resolve(response(new Uint8Array([1]))),trace=nativeResponseTrace(()=>promise,{scope:'doc1',baseURL:origin,limit:1});
 assert.equal(trace.fetch(origin+'/api/profile'),promise);assert.equal(trace.snapshot().records.length,0);
 await trace.fetch(url);await trace.fetch(url);assert.equal(trace.snapshot().overflow,1);
});
test('the completed-body category requires exact document/request/reader/served identity and a later observed cancellation',()=>{
 const f=fixture(),r=reconcileNativeResponses(f);assert.equal(r.completedBodyAbortReports.length,1);assert.equal(r.unclassified.length,0);assert.match(r.completedBodyAbortReports[0].meaning,/not a successful decode/);
});
const invalidCases={
 'missing request id':f=>delete f.failures[0].requestId,
 'wrong full URL':f=>f.failures[0].url=url+'?other=1',
 'wrong method':f=>f.network[0].method='POST',
 'worker realm':f=>f.network[0].realm='worker-fetch',
 'different browser':f=>f.engine='webkit',
 'different failure':f=>f.failures[0].message='net::ERR_FAILED',
 'wrong status':f=>f.network[0].status=500,
 'redirect':f=>f.network[0].redirected=true,
 'unknown redirect provenance':f=>delete f.network[0].redirected,
 'service worker':f=>f.network[0].fromServiceWorker=true,
 'unknown service-worker provenance':f=>delete f.network[0].fromServiceWorker,
 'no EOF':f=>delete f.traces[0].records[0].eofOrder,
 'wrong bytes':f=>f.traces[0].records[0].bytesRead=2,
 'failed read':f=>f.traces[0].records[0].readError='broken',
 'missing cancellation':f=>delete f.traces[0].records[0].signalAbortOrder,
 'abort before EOF':f=>f.traces[0].records[0].signalAbortOrder=3,
 'cancel before EOF despite later abort':f=>f.traces[0].records[0].cancelOrder=3,
 'unverified server bytes':f=>f.served.get(url).immutable=false,
 'wrong hash':f=>f.served.get(url).sha256='b'.repeat(64),
 'missing ordinal':f=>delete f.network[0].ordinal,
 'multiple readers':f=>f.traces[0].records[0].readerCount=2,
 'BYOB reader':f=>f.traces[0].records[0].readerMode='byob',
 'lost records':f=>f.traces[0].overflow=1,
 'observer fault':f=>f.traces[0].faults.push('hook failed'),
 'duplicate document scope':f=>f.traces.push(structuredClone(f.traces[0])),
 'duplicate failure':f=>f.failures.push({...f.failures[0]}),
};
for(const [name,change]of Object.entries(invalidCases))test(`does not waive ${name}`,()=>{const f=fixture();change(f);const r=reconcileNativeResponses(f);assert.equal(r.completedBodyAbortReports.length,0);assert.equal(r.unclassified.length,f.failures.length)});
test('serial repeated URLs use exact ordinal; overlapping or missing peer observations stay ambiguous',()=>{
 const f=fixture(),next={...f.traces[0].records[0],ordinal:2,startedOrder:6,eofOrder:8,signalAbortOrder:9};f.traces[0].records.push(next);f.network.push({...f.network[0],id:'r2',ordinal:2});f.failures.push({...f.failures[0],requestId:'r2'});
 assert.equal(reconcileNativeResponses(f).completedBodyAbortReports.length,2);
 next.startedOrder=2;assert.equal(reconcileNativeResponses(f).unclassified.length,2);next.startedOrder=6;f.network.pop();assert.equal(reconcileNativeResponses(f).unclassified.length,2);
});
test('a late unmatched close failure remains in final reconciliation and cannot inherit an earlier body',()=>{
 const f=fixture();f.failures.push({requestId:'later',url,message:'net::ERR_ABORTED'});const r=reconcileNativeResponses(f);assert.equal(r.completedBodyAbortReports.length,1);assert.equal(r.unclassified.length,1);assert.equal(r.classified,r.total);
});
