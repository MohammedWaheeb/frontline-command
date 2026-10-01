import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {orderFeedbackPoint} from '../../src/app/order-feedback';
import {BattleController} from '../../src/app/battle-controller';
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {Observable} from '../../src/app/store';
import type {Application} from '../../src/app/application';
import type {OrderIntent} from '../../src/runtime';

const view=()=>create(PlayerSnapshotSchema,{tick:10,player:1,players:[{id:1,team:1,faction:'US'}],entities:[{id:1,owner:1,type:'US.rifle',position:{x:5000,y:5000},health:1000,complete:true,enabled:true,private:{hp:100000n}}]});
function harness(){
 let event:(value:any)=>void=()=>{};const markers:unknown[]=[],audio:unknown[]=[],sent:OrderIntent[][]=[],errors:unknown[]=[];let resets=0;
 const app={state:new Observable({}),sessions:{state:{id:'feedback-course',kind:'online'},transport:{sendOrders:async(orders:OrderIntent[])=>{sent.push(orders);return sent.length}},subscribe:(listener:typeof event)=>{event=listener;return()=>{}}},commandAdvice:()=>({cancel(){},affordances:async()=>({tick:10,player:1,player_commands:[],entities:[{id:1,commands:['move'],abilities:[],builds:[],trains:[],research:[]}]}),preview:async(orders:OrderIntent[])=>({tick:10,results:orders.map((_,index)=>({tick:10,player:1,sequence:0,index,accepted:true,code:'indeterminate'}))})}),audioDirector:{receipt:(...args:unknown[])=>audio.push(args)},patch(){},error:(error:unknown)=>errors.push(error)} as unknown as Application;
 const controller=new BattleController(app,()=>{},()=>{}),c=controller as any;c.snapshot=view();controller.selection.reconcile(c.snapshot,'feedback-course');controller.renderer={setStrikePreview(){},showRejectedOrder:(...args:unknown[])=>markers.push(args),resetFeedback:()=>resets++} as unknown as BattlefieldRenderer;
 const emit=(value:any,session='feedback-course')=>event({type:'runtime',session,event:value});
 return {controller,c,markers,audio,sent,errors,emit,get resets(){return resets}};
}
const rejected={type:'order-result',result:{tick:11,player:1,sequence:1,index:0,accepted:false,code:'occupied'}};

test('rejected ground feedback copies only a finite explicit local order position',()=>{
 const point={x:5000,y:6000},copied=orderFeedbackPoint({kind:'move',position:point});point.x=9000;assert.deepEqual(copied,{x:5000,y:6000});
 for(const order of [{kind:'attack',target:80},{kind:'stop'},{kind:'move',position:{x:NaN,y:0}},{kind:'move',position:{x:0,y:Infinity}},{kind:'move',position:{x:-1,y:0}},{kind:'move',position:{x:.5,y:0}},{kind:'move',position:{x:Number.MAX_SAFE_INTEGER+1,y:0}}])assert.equal(orderFeedbackPoint(order),undefined);
});

test('ordinary planned command receives exactly one current owner rejection marker and preserves the authoritative queue',async()=>{
 const h=harness(),point={x:8000,y:8000},snapshot=structuredClone(h.c.snapshot);
 await h.controller.execute({kind:'move',entities:[1],target:{kind:'ground',position:point}});assert.equal(h.sent.length,1);point.x=9000;
 h.emit(rejected,'another-session');assert.deepEqual(h.markers,[]);h.emit(rejected);h.emit(rejected);
 assert.deepEqual(h.markers,[[{x:8000,y:8000},1]]);assert.equal(h.audio.length,1);assert.deepEqual(h.c.snapshot,snapshot);assert.deepEqual(h.errors,[]);
});

test('accepted, foreign, reset and disconnected receipts never paint stale rejection positions',async()=>{
 for(const mode of ['accepted','foreign','perspective','reset','disconnect']){
  const h=harness();await h.controller.execute({kind:'move',entities:[1],target:{kind:'ground',position:{x:8000,y:8000}}});
  if(mode==='perspective')h.c.snapshot={...h.c.snapshot,player:2};
  if(mode==='reset')h.emit({type:'presentation-reset'});
  if(mode==='disconnect')h.emit({type:'connection',phase:'reconnecting'});
  h.emit({...rejected,result:{...rejected.result,accepted:mode==='accepted',player:mode==='foreign'?2:1}});
  assert.deepEqual(h.markers,[],mode);assert.equal(h.audio.length,mode==='accepted'?1:0,mode);if(mode==='reset'||mode==='disconnect')assert.equal(h.resets,1);
 }
});

test('rejected marker stays bounded, static and expires without altering snapshots or looking up entities',()=>{
 const r=Object.create(BattlefieldRenderer.prototype) as any,draws:unknown[]=[],graphics:any={};
 for(const method of ['clear','circle','stroke','moveTo','lineTo'])graphics[method]=(...args:unknown[])=>{if(method==='circle')draws.push(args);return graphics};
 r.snapshot=view();r.options={map:{width:64,height:64}};r.camera={zoom:1};r.tactical=graphics;r.surface={projectGround:(p:unknown)=>p};r.missionMarkers=[];r.strikePreview={draw(){}};r.placementGhost={clear(){}};
 r.showRejectedOrder({x:8000,y:8000},1);const first=r.rejection;assert(first);r.showRejectedOrder({x:9000,y:9000},2);assert.equal(r.rejection,first);r.showRejectedOrder({x:64000,y:0},1);assert.equal(r.rejection,first);
 r.drawTactical(first.until-1);assert.equal(draws.length,2);assert.deepEqual(draws[0],[8000,8000,11]);
 draws.length=0;r.drawTactical(first.until);assert.deepEqual(draws,[]);assert.equal(r.rejection,undefined);
 r.showRejectedOrder({x:10000,y:10000},1);r.snapshot={...r.snapshot,tick:9};r.drawTactical(performance.now());assert.equal(r.rejection,undefined);assert.deepEqual(draws,[]);
 r.snapshot=view();r.showRejectedOrder({x:10000,y:10000},1);r.snapshot={...r.snapshot,player:2};r.drawTactical(performance.now());assert.equal(r.rejection,undefined);
});


test('out-of-order batch receipts each acknowledge once without dropping earlier entries',async()=>{
 const h=harness();await h.controller.execute({kind:'move',entities:[1],target:{kind:'ground',position:{x:8000,y:8000}}});
 const command=h.c.orderKinds.get(1)[0];h.c.orderKinds.set(1,[command,{...command,point:{x:9000,y:9000}}]);
 h.emit({...rejected,result:{...rejected.result,index:1}});h.emit({...rejected,result:{...rejected.result,index:1}});assert.equal(h.c.orderKinds.size,1);
 h.emit(rejected);assert.deepEqual(h.markers,[[{x:9000,y:9000},1],[{x:8000,y:8000},1]]);assert.equal(h.audio.length,2);assert.equal(h.c.orderKinds.size,0);
});
