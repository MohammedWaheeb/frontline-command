import test from 'node:test';
import assert from 'node:assert/strict';
import {create,toBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {OfflineTransport} from '../../src/runtime/offline';
import type {RuntimeEvent} from '../../src/runtime/types';

class WorkerFixture {
 onmessage?: (event:{data:unknown})=>void;onerror?:()=>void;
 postMessage(message:{id:number;method:string;args:unknown[]}){
  queueMicrotask(()=>{
   if(message.method!=='init'){
    if(message.method==='seekReplay')this.onmessage?.({data:{event:'frame',bytes:toBinary(PlayerSnapshotSchema,create(PlayerSnapshotSchema,{tick:100,player:1}))}});
    this.onmessage?.({data:{event:'frame',bytes:toBinary(PlayerSnapshotSchema,create(PlayerSnapshotSchema,{tick:101,player:1}))}});
   }
   this.onmessage?.({data:{id:message.id,ok:true,result:{adapter:'test',tick:101,local_players:[1],replay:true,replay_start:0,replay_end:200}}});
  });
 }
 terminate(){}
}
test('offline discontinuity arrives before replacement snapshots, but ordinary ticks do not reset effects',async()=>{
 const oldWorker=globalThis.Worker,oldLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
 globalThis.Worker=WorkerFixture as unknown as typeof Worker;Object.defineProperty(globalThis,'location',{value:{href:'http://test/'},configurable:true});
 const runtime=new OfflineTransport(),events:RuntimeEvent[]=[];runtime.subscribe(e=>events.push(e));
 try{
  await runtime.ready;
  for(const change of [()=>runtime.seekReplay(101),()=>runtime.setPerspective(2),()=>runtime.load(new Uint8Array(),[1]),()=>runtime.loadReplay(new Uint8Array()),()=>runtime.restart()]){
   events.length=0;await change();assert.equal(events[0].type,'presentation-reset');
   const frames=events.flatMap((e,i)=>e.type==='snapshot'?[i]:[]);assert.ok(frames.length>=1);for(const i of frames)assert.equal(events[i-1].type,'presentation-reset');
  }
  events.length=0;await runtime.step(1);assert.deepEqual(events.map(e=>e.type),['snapshot']);
 }finally{runtime.dispose();globalThis.Worker=oldWorker;if(oldLocation)Object.defineProperty(globalThis,'location',oldLocation);else Reflect.deleteProperty(globalThis,'location')}
});
