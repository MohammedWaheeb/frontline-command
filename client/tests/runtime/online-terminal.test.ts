import test from 'node:test';
import assert from 'node:assert/strict';
import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
import {EnvelopeSchema} from '../../src/protocol/frontline_pb';
import {OnlineTransport} from '../../src/runtime/online';
import type {RuntimeEvent} from '../../src/runtime/types';
class SocketFixture{
 static OPEN=1;static created:SocketFixture[]=[];readyState=1;binaryType='';onopen?:()=>void;onmessage?:(event:{data:ArrayBuffer})=>void;onerror?:()=>void;onclose?:(event:{code:number})=>void;sent:string[]=[];
 constructor(readonly url:string){SocketFixture.created.push(this);queueMicrotask(()=>this.onopen?.())}
 send(bytes:Uint8Array){const message=fromBinary(EnvelopeSchema,bytes).message;this.sent.push(message.case??'');if(message.case==='hello')queueMicrotask(()=>this.receive(create(EnvelopeSchema,{message:{case:'snapshot',value:{tick:200,player:1,metadata:{protocol:1,simulation:'test',contentHash:'fixture',mapVersion:'1',ruleset:'standard-v2'}}}})))}
 receive(envelope:Parameters<typeof toBinary<typeof EnvelopeSchema>>[1]){const data=toBinary(EnvelopeSchema,envelope);this.onmessage?.({data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer})}
 close(){if(!this.readyState)return;this.readyState=0;queueMicrotask(()=>this.onclose?.({code:1000}))}
}
test('elimination terminal preserves final permitted frame and stops reconnect without generic runtime error',async()=>{
 const previous=globalThis.WebSocket;globalThis.WebSocket=SocketFixture as unknown as typeof WebSocket;SocketFixture.created=[];
 const transport=new OnlineTransport('http://lan.test',{match_id:'match',player:1,token:'test-slot',protocol:1,simulation:'test',content_hash:'fixture'}),events:RuntimeEvent[]=[];transport.subscribe(event=>events.push(event));
 try{await transport.connect();assert.equal(events.findIndex(e=>e.type==='presentation-reset')+1,events.findIndex(e=>e.type==='snapshot'));const socket=SocketFixture.created[0];socket.receive(create(EnvelopeSchema,{message:{case:'snapshot',value:{tick:201,player:1,metadata:{protocol:1,simulation:'test',contentHash:'fixture',mapVersion:'1',ruleset:'standard-v2'},players:[{id:1,defeated:true}],results:[{player:1,sequence:1,accepted:true}]}}}));socket.receive(create(EnvelopeSchema,{message:{case:'error',value:{code:'player_eliminated',message:'Join observer feed.',recoverable:false}}}));
  await new Promise(resolve=>setTimeout(resolve,350));assert.equal(transport.phase,'closed');assert.equal(transport.terminalReason,'player_eliminated');assert.equal(transport.current?.players[0].defeated,true);assert.equal(events.some(event=>event.type==='order-result'&&event.result.accepted),true);assert.equal(events.some(event=>event.type==='error'),false);assert.equal(SocketFixture.created.length,1);
  await assert.rejects(()=>transport.reconnect(),{code:'player_eliminated'});await assert.rejects(()=>transport.sendOrders([{kind:'move'}]),{code:'not_connected'});assert.deepEqual(socket.sent,['hello']);
 }finally{transport.dispose();globalThis.WebSocket=previous}
});
