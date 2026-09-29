import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {consumedBodyTrace,consumedBodyIntegrity} from './native-consumed-body-trace.mjs';
const url='http://local/art/a.png',hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(values,{error,options={}}={}){
 let calls=0,index=0,released=0,canceled,dispatch;
 const reader={read:()=>error?Promise.reject(error):Promise.resolve(values[index++]??{done:true}),cancel:reason=>{canceled=reason;return Promise.resolve(reason)},releaseLock:()=>released++};
 const response={status:200,url,redirected:false,body:{getReader:()=>reader}};
 const fetcher=function(...args){calls++;dispatch={receiver:this,args};return Promise.resolve(response)};
 const observer=consumedBodyTrace(fetcher,{scope:'doc-A',baseURL:url,paths:['/art/a.png'],...options});
 return {observer,response,reader,info:()=>({calls,released,canceled,dispatch})};
}
async function finish(f,expected){await f.observer.finish();const snapshot=f.observer.snapshot();return {snapshot,proof:consumedBodyIntegrity(snapshot.records[0],expected)}}
test('one native dispatch/read, exact response/result identity, caller-owned lock and copied consumed-byte digest',async()=>{
 const chunk=new Uint8Array([1,2,3]),result={done:false,value:chunk},eof={done:true};const f=fixture([result,eof]),signal=new AbortController(),init={signal:signal.signal},receiver={name:'native-this'};
 assert.equal(await f.observer.fetch.call(receiver,url,init),f.response);const release=f.reader.releaseLock,reader=f.response.body.getReader();assert.equal(reader,f.reader);assert.equal(await reader.read(),result);chunk[0]=9;assert.equal(await reader.read(),eof);assert.equal(reader.releaseLock,release);assert.equal(f.info().released,0);reader.releaseLock();
 const {snapshot,proof}=await finish(f,{bytes:3,sha256:hash(new Uint8Array([1,2,3]))});assert.equal(proof.complete,true);assert.equal(proof.cancellationObserved,false);assert.equal(snapshot.copiedBytes,0);assert.equal(snapshot.pendingHashes,0);assert.deepEqual(snapshot.faults,[]);assert.equal(f.info().calls,1);assert.equal(f.info().dispatch.receiver,receiver);assert.equal(f.info().dispatch.args[1],init);
 signal.abort();assert(f.observer.snapshot().records[0].signalAbortOrder>snapshot.records[0].eofOrder);f.observer.detach();
});
test('fetch and read rejections preserve the exact native error object and cannot prove EOF',async()=>{
 const marker=Error('native network disconnect'),o=consumedBodyTrace(()=>Promise.reject(marker),{scope:'A',baseURL:url,paths:['/art/a.png']});await assert.rejects(o.fetch(url),e=>e===marker);assert.equal(consumedBodyIntegrity(o.snapshot().records[0],{bytes:3,sha256:hash('abc')}).complete,false);
 const f=fixture([],{error:marker});await f.observer.fetch(url);await assert.rejects(f.response.body.getReader().read(),e=>e===marker);assert.equal((await finish(f,{bytes:3,sha256:hash('abc')})).proof.complete,false);
});
test('truncated and wrong-hash bodies remain distinct integrity failures even after actual EOF',async()=>{
 for(const [bytes,expected,reason] of [[new TextEncoder().encode('ab'),{bytes:3,sha256:hash('abc')},'native-byte-count-mismatch'],[new TextEncoder().encode('abd'),{bytes:3,sha256:hash('abc')},'native-body-hash-mismatch']]){const f=fixture([{done:false,value:bytes},{done:true}]);await f.observer.fetch(url);const r=f.response.body.getReader();await r.read();await r.read();assert.equal((await finish(f,expected)).proof.reason,reason)}
});
test('native cancellation is forwarded once with exact result and is never filled in from a later failure',async()=>{
 const reason={native:'cancel'},f=fixture([{done:false,value:new Uint8Array([1])}]);await f.observer.fetch(url);const r=f.response.body.getReader();await r.read();assert.equal(await r.cancel(reason),reason);assert.equal(f.info().canceled,reason);const {snapshot,proof}=await finish(f,{bytes:1,sha256:hash(new Uint8Array([1]))});assert.equal(proof.complete,false);assert.equal(snapshot.copiedBytes,0);assert.equal(snapshot.records[0].eofOrder,undefined);assert(snapshot.records[0].cancelOrder);
});
test('observer capacity exhaustion never cancels or changes the native result but excludes proof',async()=>{
 const result={done:false,value:new Uint8Array([1,2,3])},f=fixture([result,{done:true}],{options:{maxBody:2}});await f.observer.fetch(url);const r=f.response.body.getReader();assert.equal(await r.read(),result);await r.read();const {snapshot,proof}=await finish(f,{bytes:3,sha256:hash(result.value)});assert.equal(proof.complete,false);assert.equal(snapshot.records[0].hashOverflow,true);assert.equal(f.info().canceled,undefined);assert.equal(snapshot.copiedBytes,0);
});
test('redirects and absent hashes cannot be classified using expected served bytes alone',async()=>{
 const base={url,responseURL:url,status:200,redirected:false,readerCount:1,readerMode:'default',bytesRead:3,eofOrder:10};assert.equal(consumedBodyIntegrity(base,{bytes:3,sha256:hash('abc')}).complete,false);assert.equal(consumedBodyIntegrity({...base,redirected:true,sha256:hash('abc')},{bytes:3,sha256:hash('abc')}).reason,'unsupported-response-or-reader');
});
test('POST advice is observed without reading/logging request bodies, unrelated fetch stays untouched',async()=>{
 let reads=0;const response={status:200,url:'http://local/api/v1/matches/abc/advice',redirected:false,body:null},promise=Promise.resolve(response),o=consumedBodyTrace(()=>promise,{scope:'A',baseURL:url});
 const init={method:'POST',get body(){reads++;throw Error('request body must not be read')}};assert.equal(await o.fetch(response.url,init),response);assert.equal(reads,0);assert.equal(o.snapshot().records.length,1);assert.equal(o.fetch('http://local/api/v1/profiles'),promise);assert.equal(o.snapshot().records.length,1);
});
