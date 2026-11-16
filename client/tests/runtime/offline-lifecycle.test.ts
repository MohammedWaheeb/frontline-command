import test from 'node:test';
import assert from 'node:assert/strict';
import {create,toBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {OfflineTransport} from '../../src/runtime/offline';
import {RuntimeError} from '../../src/runtime/errors';
import type {RuntimeEvent} from '../../src/runtime/types';

class WorkerFixture{
 static current:WorkerFixture;
 onmessage:((event:{data:any})=>void)|null=null;onerror:(()=>void)|null=null;
 requests:Array<{id:number;method:string;args:unknown[]}>=[];terminated=0;
 constructor(){WorkerFixture.current=this}
 postMessage(message:{id:number;method:string;args:unknown[]}){this.requests.push(message);if(message.method==='init')queueMicrotask(()=>this.message({id:message.id,ok:true,result:{adapter:'test',simulation:'test',protocol:1,go:'test',content_hash:'test'}}))}
 message(data:any){this.onmessage?.({data})}
 terminate(){this.terminated++}
}
async function withRuntime(work:(runtime:OfflineTransport,worker:WorkerFixture,events:RuntimeEvent[])=>Promise<void>){
 const location=Object.getOwnPropertyDescriptor(globalThis,'location'),original=Object.getOwnPropertyDescriptor(globalThis,'Worker');
 Object.defineProperty(globalThis,'Worker',{value:WorkerFixture,writable:true,configurable:true});
 Object.defineProperty(globalThis,'location',{value:{href:'http://test/'},configurable:true});
 const runtime=new OfflineTransport(),worker=WorkerFixture.current,events:RuntimeEvent[]=[];runtime.subscribe(event=>events.push(event));
 try{await runtime.ready;await work(runtime,worker,events)}finally{runtime.dispose();if(location)Object.defineProperty(globalThis,'location',location);else Reflect.deleteProperty(globalThis,'location');if(original)Object.defineProperty(globalThis,'Worker',original);else Reflect.deleteProperty(globalThis,'Worker')}
}
// Observe a promise's immediate fate without waiting for the real 30 s timeout.
const fate=async(promise:Promise<unknown>)=>Promise.race([promise.then(value=>({value}),error=>({error})),new Promise<{pending:true}>(resolve=>setImmediate(()=>resolve({pending:true})))]);
const errorCode=(value:Awaited<ReturnType<typeof fate>>)=>'error' in value?value.error?.code:undefined;

test('a fatal worker failure preserves the last snapshot, closes pending RPCs and rejects new calls immediately',async t=>{
 await withRuntime(async(runtime,worker,events)=>{
  worker.message({event:'frame',bytes:toBinary(PlayerSnapshotSchema,create(PlayerSnapshotSchema,{tick:84,player:1}))});const last=runtime.current;
  const pending=fate(runtime.save());worker.onerror!();assert.equal(errorCode(await pending),'worker_failed');
  const before=worker.requests.length,next=await fate(runtime.save());assert.equal(errorCode(next),'worker_failed','a known-dead worker must fail immediately instead of leaving Save busy for 30 seconds');assert.equal(worker.requests.length,before);
  assert.equal(runtime.current,last,'the final authorized frame remains inspectable');assert.equal(worker.terminated,1);
  worker.message({event:'frame',bytes:toBinary(PlayerSnapshotSchema,create(PlayerSnapshotSchema,{tick:85,player:1}))});assert.equal(runtime.current,last);
  assert.equal(events.filter(event=>event.type==='error').length,1);
  runtime.dispose();assert.equal(worker.terminated,1,'leaving a failed match cannot terminate the worker twice');assert.equal(errorCode(await fate(runtime.save())),'disposed','deliberate closure retains its own error');
 });
});

test('a nonrecoverable RPC reply poisons the transport and settles every other pending request',async t=>{
 await withRuntime(async(runtime,worker,events)=>{
  const saving=fate(runtime.save()),info=fate(runtime.info()),request=worker.requests.find(request=>request.method==='save')!;
  worker.message({id:request.id,ok:false,error:{code:'engine_fault',message:'The engine has stopped.',recoverable:false}});
  assert.equal(errorCode(await saving),'engine_fault');assert.equal(errorCode(await info),'engine_fault');assert.equal(errorCode(await fate(runtime.resume())),'engine_fault');
  assert.equal(worker.terminated,1);assert.equal(events.filter(event=>event.type==='error').length,1);
 });
});

test('fatal failure stops the busy watchdog, while a recoverable request error keeps the worker usable',async t=>{
 t.mock.timers.enable({apis:['setInterval']});let now=0;t.mock.method(performance,'now',()=>now);
 await withRuntime(async(runtime,worker,events)=>{
  const saving=fate(runtime.save()),request=worker.requests.at(-1)!;worker.message({id:request.id,ok:false,error:{code:'save_unavailable',message:'No match loaded.',recoverable:true}});assert.equal(errorCode(await saving),'save_unavailable');
  const info=fate(runtime.info()),next=worker.requests.at(-1)!;worker.message({id:next.id,ok:true,result:{tick:84}});assert.deepEqual(await info,{value:{tick:84}});assert.equal(worker.terminated,0);
  worker.message({event:'clock',paused:false,speed:1,stalled:false});worker.message({event:'error',error:new RuntimeError('engine_fault','Stopped',false)});now=10000;t.mock.timers.tick(10000);
  assert.equal(events.filter(event=>event.type==='pace').length,0,'a stopped worker cannot later masquerade as a busy live match');assert.equal(worker.terminated,1);
 });
});
