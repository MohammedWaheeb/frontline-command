import test from 'node:test';
import assert from 'node:assert/strict';
import {create,fromBinary,toBinary} from '@bufbuild/protobuf';
import {EnvelopeSchema} from '../../src/protocol/frontline_pb';
import {OnlineTransport} from '../../src/runtime/online';
class SocketFixture{
 static OPEN=1;static mode='unreachable';static created:SocketFixture[]=[];readyState=1;binaryType='';
 onopen?:()=>void;onmessage?:(event:{data:ArrayBuffer})=>void;onclose?:(event:{code:number})=>void;onerror?:()=>void;
 constructor(readonly url:string){SocketFixture.created.push(this);queueMicrotask(()=>{if(SocketFixture.mode==='unreachable'){this.readyState=0;this.onclose?.({code:1006})}else this.onopen?.()})}
 send(bytes:Uint8Array){if(fromBinary(EnvelopeSchema,bytes).message.case!=='hello')return;queueMicrotask(()=>{
  if(SocketFixture.mode==='closed'){this.readyState=0;this.onclose?.({code:1000});return}
  if(SocketFixture.mode==='policy'){this.readyState=0;this.onclose?.({code:1008});return}
  const code=SocketFixture.mode,data=toBinary(EnvelopeSchema,create(EnvelopeSchema,{message:{case:'error',value:{code,message:`Specific host explanation: ${code}`,recoverable:false}}}));
  this.onmessage?.({data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer});
 })}
 close(){if(!this.readyState)return;this.readyState=0;queueMicrotask(()=>this.onclose?.({code:1000}))}
}
for(const [mode,code,message] of [
 ['unreachable','socket_unreachable','Could not open a game connection'],
 ['closed','match_connection_closed','before the game loaded'],
 ['policy','connection_refused','host refused'],
 ['unknown_player','unknown_player','Specific host explanation'],
 ['invalid_match_token','invalid_match_token','Specific host explanation'],
 ['connection_closed','connection_closed','Specific host explanation'],
] as const)test(`socket admission explains ${mode} specifically`,async()=>{
 const previous=globalThis.WebSocket;SocketFixture.mode=mode;SocketFixture.created=[];globalThis.WebSocket=SocketFixture as unknown as typeof WebSocket;
 const transport=new OnlineTransport('http://host.test',{match_id:'match',player:1,token:'slot',protocol:1,simulation:'test',content_hash:'fixture'});
 try{await assert.rejects(()=>transport.connect(),(error:unknown)=>{assert.equal((error as {code:string}).code,code);assert.match((error as Error).message,new RegExp(message));assert.doesNotMatch((error as Error).message,/eliminated/);return true})}finally{transport.dispose();globalThis.WebSocket=previous}
});
