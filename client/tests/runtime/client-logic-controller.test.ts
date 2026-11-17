import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {BattleController} from '../../src/app/battle-controller';
import {CatalogIndex} from '../../src/content/catalog';
import {Observable} from '../../src/app/store';
import {sanitizeSettings} from '../../src/app/settings';
import type {Application} from '../../src/app/application';
import type {CommandAffordances,RuntimeEvent} from '../../src/runtime/types';
import type {SessionEvent} from '../../src/runtime/session';
const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
function snapshot(tick=0){return create(PlayerSnapshotSchema,{player:1,tick,players:[{id:1,faction:'US'}],economy:{credits:6000000n,income:BigInt(tick)*1000n,powerCapacity:40,powerDemand:20},entities:[{id:1,type:'hq',owner:1,complete:true,enabled:true,position:{x:1000,y:1000},private:{hp:100n}},{id:2,type:'US.rig',owner:1,complete:true,enabled:true,private:{hp:100n}},{id:3,type:'US.hauler',owner:1,state:'no_known_supplies',position:{x:3000,y:4000},private:{hp:100n}},{id:4,type:'barracks',owner:1,complete:true,enabled:true,private:{hp:100n}}]})}
function harness(){
 let listener:((event:SessionEvent)=>void)|undefined;const requests:number[][]=[];
 const sessions={state:{id:'logic',kind:'online'},transport:{},subscribe:(fn:(event:SessionEvent)=>void)=>{listener=fn;return()=>{}}};
 const app={sessions,state:new Observable({catalog,settings:sanitizeSettings(undefined),index:{missions:[]}}),commandAdvice:()=>({affordances:async(ids:number[])=>{requests.push(ids);return {player:1,tick:0,player_commands:[],entities:ids.map(id=>({id,commands:[],abilities:[],builds:[],trains:[],research:[]}))} satisfies CommandAffordances}}),audioDirector:{},patch(){}} as unknown as Application;
 const control=new BattleController(app,()=>{},()=>{});control.refresh=async()=>{};
 return {control,app,requests,event:(event:RuntimeEvent)=>listener?.({type:'runtime',session:'logic',event})};
}
test('controller exposes rig-first focus, dismissible opening and scoped income/alert history',()=>{
 const h=harness();h.control.frame(snapshot());assert.equal(h.control.state.get().productionSource,2);assert.equal(h.control.openingObjective()?.type,'power');
 const id=h.control.openingObjective()!.id;h.control.dismissOpeningObjective(id);assert.equal(h.control.openingObjective(),undefined);assert.equal(h.control.state.get().statusAlerts[0].kind,'idle_hauler');
 h.control.frame(snapshot(1200));assert.equal(h.control.economyStatus()?.incomePerMinute,1200000n);
 h.event({type:'presentation-reset'});assert.equal(h.control.economyStatus(),undefined);assert.equal(h.control.state.get().statusAlerts.length,0);
 h.control.frame(snapshot(1200));assert.equal(h.control.economyStatus()?.incomeState,'starting_up');assert.equal(h.control.openingObjective()?.type,'power');
 h.control.frame({...snapshot(1201),player:2});assert.equal(h.control.state.get().statusAlerts.length,0);assert.equal(h.control.openingObjective(),undefined);
 h.control.frame(snapshot(0));assert.equal(h.control.economyStatus()?.incomeState,'starting_up');assert.equal(h.control.openingObjective()?.type,'power');
});
test('Space centers the newest location including idle hauler alerts; typing still suppresses the shortcut',()=>{
 const h=harness();h.control.frame(snapshot());let center:unknown;(h.control as any).renderer={center:(value:unknown)=>{center=value}};
 const before=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>null}});
 try{
  (h.control as any).key({code:'Space',target:{tagName:'INPUT',getAttribute:()=>null},preventDefault(){}});assert.equal(center,undefined);
  (h.control as any).key({code:'Space',target:null,preventDefault(){}});assert.deepEqual(center,{x:3000,y:4000});
 }finally{if(before)Object.defineProperty(globalThis,'document',before);else Reflect.deleteProperty(globalThis,'document')}
});
test('periodic advice includes every owned producer but selection affordances stay selection-only',async()=>{
 const h=harness();h.control.frame(snapshot());h.control.refresh=BattleController.prototype.refresh;
 await h.control.refresh();assert.deepEqual(h.requests.flat(),[2,1,4]);assert.deepEqual(h.control.state.get().affordances?.entities,[]);
});


test('HUD inputs preserve full owner affordances including unselected foundations',async()=>{
 const h=harness(),frame=snapshot();frame.entities.push(create(PlayerSnapshotSchema,{entities:[{id:9,type:'power',owner:1,complete:false,private:{hp:10n}}]}).entities[0]);
 h.app.commandAdvice=()=>({affordances:async(ids:number[])=>({player:1,tick:0,economy:{supply_cap:100},player_commands:[],entities:ids.map(id=>({id,commands:[],abilities:[],builds:[],trains:[],research:[],sell_refund:id===1?1000:0,construction_stalled:id===9}))})}) as any;
 h.control.frame(frame);h.control.refresh=BattleController.prototype.refresh;await h.control.refresh();
 const state=h.control.state.get();assert.deepEqual(state.affordances?.entities,[]);assert.equal(state.hudAffordances?.economy?.supply_cap,100);assert.equal(state.hudAffordances?.entities.find(entity=>entity.id===9)?.construction_stalled,true);assert.equal(state.hudAffordances?.entities.find(entity=>entity.id===1)?.sell_refund,1000);
 h.event({type:'presentation-reset'});assert.equal(h.control.state.get().hudAffordances,undefined);
});
