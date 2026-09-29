import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {Application} from '../../src/app/application';
import {Observable} from '../../src/app/store';
import type {RuntimeEvent,PlayerSnapshot} from '../../src/runtime/types';

// Run the real Application event handler without constructing a DOM, renderer,
// audio device, worker or storage. Only its external subscribers are replaced.
function appHarness(t:TestContext){
 let now=1000;t.mock.method(performance,'now',()=>now);
 const app=Object.create(Application.prototype) as any,frames:PlayerSnapshot[]=[];
 app.lastHUD=0;app.progressRecorded=new Set();app.frames=new Set([(snapshot:PlayerSnapshot)=>frames.push(snapshot)]);
 app.state=new Observable({session:{phase:'menu'},paused:false,page:'command'});
 app.sessions={state:{id:'one',kind:'replay'},transport:{}};
 app.audioDirector={operation(){},setPaused(){},page(){},snapshot(){},discontinuity(){},status(){},connection(){}};
 app.recordOnlineProgress=()=>{};
 const session=(id:string|undefined)=>{app.sessions.state={id,kind:id?'replay':undefined};app.sessionEvent({type:'session',state:{id,kind:id?'replay':undefined,phase:id?'active':'menu'}})};
 session('one');
 return {app,frames,session,time:(value:number)=>now=value,event:(event:RuntimeEvent)=>app.sessionEvent({type:'runtime',session:app.sessions.state.id,event}),snapshot:()=>app.state.get().snapshot as PlayerSnapshot|undefined};
}
const frame=(tick:number,player=1,finished=false)=>create(PlayerSnapshotSchema,{tick,player,outcome:{finished}});

test('seek publishes the replacement frame within 100ms before its paused clock and reply',t=>{
 const h=appHarness(t),start=frame(126),end=frame(189);h.event({type:'snapshot',snapshot:start});h.time(1001);
 h.event({type:'presentation-reset'});h.event({type:'snapshot',snapshot:end});
 assert.equal(h.snapshot(),end,'ReplayDock must receive the sought tick before clearing its local slider value');
 h.event({type:'clock',paused:true,speed:1,stalled:false});assert.equal(h.snapshot()?.tick,189);assert.equal(h.app.state.get().paused,true);
});
test('each reset while replacement is pending preserves the final authorized frame',t=>{
 const h=appHarness(t);h.event({type:'snapshot',snapshot:frame(126)});h.time(1001);
 h.event({type:'presentation-reset'});h.event({type:'snapshot',snapshot:frame(130)});
 h.event({type:'presentation-reset'});const final=frame(189);h.event({type:'snapshot',snapshot:final});assert.equal(h.snapshot(),final);
});
test('pause flushes the last throttled frame even without a replacement or finished outcome',t=>{
 for(const kind of ['clock','status'] as const){
  const h=appHarness(t);h.event({type:'snapshot',snapshot:frame(126)});h.time(1001);const end=frame(189);h.event({type:'snapshot',snapshot:end});assert.equal(h.snapshot()?.tick,126,'ordinary live frames retain their throttle');
  if(kind==='clock')h.event({type:'clock',paused:true,speed:1,stalled:false});else h.event({type:'status',status:{paused:true} as any});
  assert.equal(h.snapshot(),end);assert.equal(h.app.state.get().paused,true);
 }
});
test('load/session replacement publishes its first frame immediately and clears the old owner',t=>{
 const h=appHarness(t);h.event({type:'snapshot',snapshot:frame(126)});h.time(1001);h.session('two');assert.equal(h.snapshot(),undefined);
 const loaded=frame(17,2);h.event({type:'snapshot',snapshot:loaded});assert.equal(h.snapshot(),loaded);
});
test('same-tick perspective replacement publishes the new authorized owner immediately',t=>{
 const h=appHarness(t);h.event({type:'snapshot',snapshot:frame(126)});h.time(1001);h.event({type:'presentation-reset'});
 const other=frame(126,2);h.event({type:'snapshot',snapshot:other});assert.equal(h.snapshot(),other);
});
test('steady play retains the HUD throttle while every snapshot reaches the renderer',t=>{
 const h=appHarness(t),a=frame(120),b=frame(124),c=frame(128);h.event({type:'snapshot',snapshot:a});h.time(1050);h.event({type:'snapshot',snapshot:b});assert.equal(h.snapshot(),a);
 h.time(1101);h.event({type:'snapshot',snapshot:c});assert.equal(h.snapshot(),c);assert.deepEqual(h.frames,[a,b,c]);
});
test('menu and a buffering replacement never flush the previous session snapshot on pause',t=>{
 const h=appHarness(t);h.event({type:'snapshot',snapshot:frame(126)});h.time(1001);h.event({type:'snapshot',snapshot:frame(130)});h.session(undefined);
 h.event({type:'clock',paused:true,speed:1,stalled:false});assert.equal(h.snapshot(),undefined);
 h.session('two');h.event({type:'status',status:{paused:true} as any});assert.equal(h.snapshot(),undefined);
});
test('already paused frames and a terminal outcome publish without waiting for another tick',t=>{
 const h=appHarness(t);h.event({type:'snapshot',snapshot:frame(126)});h.event({type:'clock',paused:true,speed:1,stalled:false});h.time(1001);const paused=frame(130);h.event({type:'snapshot',snapshot:paused});assert.equal(h.snapshot(),paused);
 h.event({type:'clock',paused:false,speed:1,stalled:false});const final=frame(131,1,true);h.event({type:'snapshot',snapshot:final});assert.equal(h.snapshot(),final);
});
