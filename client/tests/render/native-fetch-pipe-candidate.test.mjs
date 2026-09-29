import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedPipeRead} from './native-fetch-pipe-candidate.mjs';
const defaults=()=>({limit:16,total:{bytes:0},maxTotal:32});
function timer(){let callback,cleared=0;return{scheduleTimeout(next){callback=next;return()=>{callback=undefined;cleared++}},fire(){callback?.()},get live(){return !!callback},get cleared(){return cleared}}}
test('exact native chunks finish, count once and detach timeout/parent cancellation',async()=>{
 const t=timer(),parent=new AbortController(),opts=defaults();let native;
 const blob=await boundedPipeRead(async(_url,init)=>{native=init.signal;return new Response(new Uint8Array([1,2,3]))},'/a',{...opts,signal:parent.signal,scheduleTimeout:t.scheduleTimeout});
 assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())],[1,2,3]);assert.equal(opts.total.bytes,3);assert.equal(t.live,false);assert.equal(t.cleared,1);parent.abort();t.fire();assert.equal(native.aborted,false);
});
test('per-file and shared total bounds cancel oversized streams without retaining over-limit chunk',async()=>{
 for(const opts of [{...defaults(),limit:2},{...defaults(),maxTotal:2}]){
  let reason;await assert.rejects(boundedPipeRead(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]))},cancel(error){reason=error}})),'/a',opts),error=>error===reason&&/exceeds/.test(error.message));assert.equal(opts.total.bytes,3);
 }
 const opts=defaults();opts.maxTotal=5;const fetcher=async()=>new Response('abc');await boundedPipeRead(fetcher,'/a',opts);await assert.rejects(boundedPipeRead(fetcher,'/b',opts),/exceeds/);assert.equal(opts.total.bytes,6);
});
test('oversize cause is fixed and timer/parent detached while native cancel settles',async()=>{
 const t=timer(),parent=new AbortController();let release,cancelStarted;const held=new Promise(r=>release=r),started=new Promise(r=>cancelStarted=r);let native;
 const job=boundedPipeRead(async(_url,init)=>{native=init.signal;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]))},cancel(){cancelStarted();return held}}))},'/a',{...defaults(),limit:2,signal:parent.signal,scheduleTimeout:t.scheduleTimeout});
 await started;assert.equal(t.live,false);parent.abort(Error('later'));t.fire();assert.equal(native.aborted,false);release();await assert.rejects(job,/exceeds/);
});
for(const kind of ['parent','timeout'])test(`in-flight ${kind} cancellation preserves exact reason`,async()=>{
 const t=timer(),parent=new AbortController();let started,native;const began=new Promise(r=>started=r);
 const job=boundedPipeRead(async(_url,init)=>{native=init.signal;started();return new Response(new ReadableStream({start(c){native.addEventListener('abort',()=>c.error(native.reason),{once:true})}}))},'/a',{...defaults(),signal:parent.signal,scheduleTimeout:t.scheduleTimeout});
 await began;const reason=Error('user canceled');if(kind==='parent')parent.abort(reason);else t.fire();await assert.rejects(job,error=>error===native.reason&&(kind==='parent'?error===reason:error.name==='TimeoutError'));assert.equal(t.live,false);
});
test('already canceled performs no fetch; native failures and empty response remain failures',async()=>{
 const parent=new AbortController(),reason=Error('native'),fetcher=async()=>{throw reason};parent.abort();let calls=0;
 await assert.rejects(boundedPipeRead(async()=>{calls++;return new Response('a')},'/a',{...defaults(),signal:parent.signal}),{name:'AbortError'});assert.equal(calls,0);
 await assert.rejects(boundedPipeRead(fetcher,'/a',defaults()),error=>error===reason);
 await assert.rejects(boundedPipeRead(async()=>new Response(new ReadableStream({start(c){c.error(reason)}})),'/a',defaults()),error=>error===reason);
 await assert.rejects(boundedPipeRead(async()=>new Response(''),'/a',defaults()),/empty/);
});
