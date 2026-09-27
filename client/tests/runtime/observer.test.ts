import test from 'node:test';
import assert from 'node:assert/strict';
import {create,toBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,type PlayerSnapshot} from '../../src/protocol/frontline_pb';
import {ObserverTransport,type ObserverConnection} from '../../src/runtime/observer';
import type {RuntimeEvent} from '../../src/runtime/types';
const connection:ObserverConnection={match_id:'test-match',player:1,token:'a'.repeat(64),read_only:true,delay_ticks:2400,simulation:'test',protocol:1,content_hash:'hash',map_version:'map-v1'};
function snapshot(tick=100,player=1){return create(PlayerSnapshotSchema,{tick,player,metadata:{simulation:'test',protocol:1,contentHash:'hash',mapVersion:'map-v1',ruleset:'standard-v2'},visible:[true],explored:[true],entities:[]})}
function frame(tick=100,player=1){return new Response(toBinary(PlayerSnapshotSchema,snapshot(tick,player)).buffer as ArrayBuffer,{headers:{'Content-Type':'application/x-protobuf'}})}
function buffering(delay=2400){return Response.json({code:'observer_buffering',delay_ticks:delay},{status:202})}
const until=async(check:()=>boolean)=>{const start=Date.now();while(!check()){if(Date.now()-start>2500)throw Error('Observer assertion timed out');await new Promise(resolve=>setTimeout(resolve,20))}};
test('delayed observer installs no early world state, authenticates only through header and rejects every command/clock mutation',async()=>{
 const requests:Array<{url:string;init?:RequestInit}>=[],events:RuntimeEvent[]=[];let ready=false;
 const observer=new ObserverTransport('http://lan.test',connection,{pollMs:200,fetch:async(input,init)=>{requests.push({url:String(input),init});return ready?frame():buffering()}});observer.subscribe(event=>events.push(event));
 try{await observer.connect();assert.equal(observer.phase,'connected');assert.equal(observer.buffering,true);assert.equal(observer.current,undefined);assert.equal(events.filter(event=>event.type==='snapshot').length,0);
  assert.equal(requests[0].url,'http://lan.test/api/v1/matches/test-match/observer');assert.equal(new Headers(requests[0].init?.headers).get('Authorization'),`Bearer ${connection.token}`);assert.equal(requests[0].url.includes(connection.token),false);
  await assert.rejects(()=>observer.sendOrders(),{code:'observer_read_only'});await assert.rejects(()=>observer.pause(),{code:'observer_read_only'});await assert.rejects(()=>observer.resume(),{code:'observer_read_only'});
  ready=true;await until(()=>!!observer.current);const received=observer.current as PlayerSnapshot|undefined;assert.equal(received?.tick,100);assert.equal(observer.buffering,false);assert.equal(received?.player,1);assert.equal(Object.keys(observer).some(key=>key==='token'||key==='connection'),false);
 }finally{observer.dispose()}
});
test('observer rejects wrong perspective, metadata, player command receipts and changed delay before publishing',async()=>{
 const bad=snapshot();bad.metadata!.mapVersion='wrong';const receipts=snapshot();receipts.results=[{...create((await import('../../src/protocol/frontline_pb')).OrderResultSchema),player:1,sequence:1,accepted:true}];
 for(const response of [()=>frame(100,2),()=>new Response(toBinary(PlayerSnapshotSchema,bad).buffer as ArrayBuffer,{headers:{'Content-Type':'application/x-protobuf'}}),()=>new Response(toBinary(PlayerSnapshotSchema,receipts).buffer as ArrayBuffer,{headers:{'Content-Type':'application/x-protobuf'}}),()=>buffering(0)]){
  const observer=new ObserverTransport('http://lan.test',connection,{fetch:async()=>response()});const published:RuntimeEvent[]=[];observer.subscribe(event=>published.push(event));try{await assert.rejects(()=>observer.connect());assert.equal(observer.current,undefined);assert.equal(published.some(event=>event.type==='snapshot'),false);assert.equal(observer.phase,'closed')}finally{observer.dispose()}
 }
});
test('observer reconnect preserves last permitted snapshot and rejects a rewind or terminal authorization loss',async()=>{
 let next=()=>frame(100);const observer=new ObserverTransport('http://lan.test',connection,{fetch:async()=>next(),pollMs:10000});try{await observer.connect();next=()=>frame(104);await observer.reconnect();assert.equal(observer.current?.tick,104);next=()=>frame(96);await assert.rejects(()=>observer.reconnect(),{code:'observer_response'});assert.equal(observer.current?.tick,104);assert.equal(observer.phase,'closed');next=()=>Response.json({code:'observer_unavailable',message:'Ticket expired.'},{status:403});await assert.rejects(()=>observer.reconnect(),{code:'observer_unavailable'});assert.equal(observer.phase,'closed');assert.equal(observer.current?.tick,104)}finally{observer.dispose()}
});
test('disposing while a response is in flight cannot publish a stale observer frame or restart polling',async()=>{
 let resolve!:(value:Response)=>void;const pending=new Promise<Response>(done=>resolve=done),observer=new ObserverTransport('http://lan.test',connection,{fetch:async()=>pending});let published=0;observer.subscribe(event=>{if(event.type==='snapshot')published++});const connecting=observer.connect();observer.dispose();resolve(frame());await connecting;assert.equal(published,0);assert.equal(observer.current,undefined);assert.equal(observer.phase,'closed');await assert.rejects(()=>observer.reconnect(),{code:'disposed'});
});

test('transient background observer failure retries without repeated command-error dialogs and clears the status on recovery',async()=>{
 let calls=0;const events:RuntimeEvent[]=[],observer=new ObserverTransport('http://lan.test',connection,{pollMs:200,fetch:async()=>{calls++;if(calls===2)throw new TypeError('Disconnected');return frame(calls*10)}});observer.subscribe(event=>events.push(event));
 try{await observer.connect();await until(()=>observer.phase==='reconnecting');assert.equal(observer.current?.tick,10);assert.equal(observer.lastError?.code,'observer_connection');assert.equal(events.some(event=>event.type==='error'),false);await until(()=>observer.current?.tick===30);assert.equal(observer.lastError,undefined);assert.equal(observer.phase,'connected')}finally{observer.dispose()}
});
test('disposing during buffered response decoding leaves the feed closed',async()=>{
 let decoded!:(value:unknown)=>void,reading=false;const body=new Promise(resolve=>decoded=resolve),response=buffering();response.json=async()=>{reading=true;return body};const observer=new ObserverTransport('http://lan.test',connection,{fetch:async()=>response});const connecting=observer.connect();await until(()=>reading);observer.dispose();decoded({code:'observer_buffering',delay_ticks:2400});await connecting;assert.equal(observer.phase,'closed');assert.equal(observer.current,undefined);
});
