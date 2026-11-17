import test from 'node:test';
import assert from 'node:assert/strict';
import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
import {EnvelopeSchema} from '../../src/protocol/frontline_pb';
import {OnlineTransport} from '../../src/runtime/online';
class SocketFixture{
 static OPEN=1;static created:SocketFixture[]=[];readyState=1;binaryType='';onopen?:()=>void;onmessage?:(event:{data:ArrayBuffer})=>void;onerror?:()=>void;onclose?:(event:{code:number})=>void;sent:string[]=[];
 constructor(readonly url:string){SocketFixture.created.push(this);queueMicrotask(()=>this.onopen?.())}
 send(bytes:Uint8Array){const message=fromBinary(EnvelopeSchema,bytes).message;this.sent.push(message.case??'');if(message.case==='hello')queueMicrotask(()=>this.receive(create(EnvelopeSchema,{message:{case:'snapshot',value:{tick:200,player:1,metadata:{protocol:1,simulation:'test',contentHash:'fixture',mapVersion:'1',ruleset:'standard-v2'}}}})))}
 receive(envelope:Parameters<typeof toBinary<typeof EnvelopeSchema>>[1]){const data=toBinary(EnvelopeSchema,envelope);this.onmessage?.({data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer})}
 close(){if(!this.readyState)return;this.readyState=0;queueMicrotask(()=>this.onclose?.({code:1000}))}
}
test('a ping tick after the socket closed but before onclose does not throw',async()=>{
 const previous=globalThis.WebSocket,realSetInterval=globalThis.setInterval,realClearInterval=globalThis.clearInterval;
 globalThis.WebSocket=SocketFixture as unknown as typeof WebSocket;SocketFixture.created=[];
 let pingTick:(()=>void)|undefined;
 globalThis.setInterval=((callback:()=>void)=>{pingTick=callback;return 0}) as unknown as typeof setInterval;
 globalThis.clearInterval=(()=>{}) as typeof clearInterval;
 const transport=new OnlineTransport('http://lan.test',{match_id:'match',player:1,token:'test-slot',protocol:1,simulation:'test',content_hash:'fixture'});
 try{
  await transport.connect();assert.equal(transport.phase,'connected');assert.ok(pingTick);
  const socket=SocketFixture.created[0];
  pingTick!();assert.deepEqual(socket.sent,['hello','ping']);
  // The socket is gone but the close event has not been delivered yet: the
  // phase still reads connected while readyState no longer allows sending.
  socket.readyState=3;
  pingTick!();
  assert.deepEqual(socket.sent,['hello','ping']);
 }finally{transport.dispose();globalThis.WebSocket=previous;globalThis.setInterval=realSetInterval;globalThis.clearInterval=realClearInterval}
});
