import test from 'node:test';
import assert from 'node:assert/strict';
import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
import {EnvelopeSchema} from '../../src/protocol/frontline_pb';
import {OnlineTransport} from '../../src/runtime/online';
import type {RuntimeEvent} from '../../src/runtime/types';
class SocketFixture{
 static OPEN=1;static created:SocketFixture[]=[];readyState=1;binaryType='';onopen?:()=>void;onmessage?:(event:{data:ArrayBuffer})=>void;onerror?:()=>void;onclose?:(event:{code:number})=>void;
 constructor(readonly url:string){SocketFixture.created.push(this);queueMicrotask(()=>this.onopen?.())}
 send(bytes:Uint8Array){const message=fromBinary(EnvelopeSchema,bytes).message;if(message.case==='hello')queueMicrotask(()=>this.receive(create(EnvelopeSchema,{message:{case:'snapshot',value:{tick:100,player:1,metadata,entities:[{id:2,owner:1},{id:9,owner:2}],explored:[true,true],visible:[true,true]}}})))}
 receive(envelope:Parameters<typeof toBinary<typeof EnvelopeSchema>>[1]){const data=toBinary(EnvelopeSchema,envelope);this.onmessage?.({data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer})}
 close(){if(!this.readyState)return;this.readyState=0;queueMicrotask(()=>this.onclose?.({code:1000}))}
}
const metadata={protocol:1,simulation:'test',contentHash:'fixture',mapVersion:'1',ruleset:'standard-v2'};
test('actual binary priority removes immediately, leaves canonical baseline and dedupes terminal receipts',async()=>{
 const previous=globalThis.WebSocket;globalThis.WebSocket=SocketFixture as unknown as typeof WebSocket;SocketFixture.created=[];
 const t=new OnlineTransport('http://lan.test',{match_id:'match',player:1,token:'test-slot',protocol:1,simulation:'test',content_hash:'fixture'}),events:RuntimeEvent[]=[];t.subscribe(e=>events.push(e));
 try{
  await t.connect();const socket=SocketFixture.created[0],original=t.current!;
  const result={player:1,sequence:1,index:0,tick:101,accepted:true,code:'applied',eligibleEntities:[2],appliedCount:1};
  socket.receive(create(EnvelopeSchema,{message:{case:'priority',value:{tick:101,removedEntities:[9],results:[result]}}}));
  assert.deepEqual(t.current!.entities.map(e=>e.id),[2]);assert.equal(t.current!.tick,100);assert.equal(original.entities.length,2);
  assert.ok(events.some(e=>e.type==='snapshot'&&e.publication==='priority'&&e.priorityTick===101));
  socket.receive(create(EnvelopeSchema,{message:{case:'delta',value:{baselineTick:100,state:{tick:102,player:1,metadata,explored:[true,true],visible:[true,true]}}}}));
  assert.deepEqual(t.current!.entities.map(e=>e.id),[2,9],'unchanged regained actor restored from full baseline');
  socket.receive(create(EnvelopeSchema,{message:{case:'snapshot',value:{tick:103,player:1,metadata,entities:[{id:2,owner:1}],results:[result],explored:[true,true],visible:[true,true]}}}));
  const results=events.filter(e=>e.type==='order-result');assert.equal(results.length,1);assert.deepEqual(results[0].result.eligibleEntities,[2]);assert.equal(results[0].result.appliedCount,1);
  assert.equal(events.some(e=>e.type==='error'),false);
 }finally{t.dispose();globalThis.WebSocket=previous}
});
