import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {BattleController} from '../../src/app/battle-controller';
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {TacticalOverlay} from '../../src/render/tactical-overlay';
import {tacticalPresentation} from '../../src/app/tactical-presentation';
import {CatalogIndex} from '../../src/content/catalog';
import {Observable} from '../../src/app/store';
import {sanitizeSettings} from '../../src/app/settings';
import {defaultBindings} from '../../src/runtime/keybindings';
import type {Application} from '../../src/app/application';
import type {CommandAffordances,OrderIntent,Point} from '../../src/runtime/types';
const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
const actor=(id:number,type:string,owner=1,x=id*1000)=>create(EntitySchema,{id,type,owner,position:{x,y:1000},health:1000,complete:true,enabled:true,state:'idle',private:owner===1?{hp:100n,maxHp:100n}:undefined});
function harness(){
 const snapshot=create(PlayerSnapshotSchema,{player:1,tick:10,players:[{id:1,faction:'US',team:1},{id:2,faction:'IR',team:2}],entities:[actor(1,'hq'),actor(2,'US.rig'),actor(3,'US.hauler'),actor(4,'barracks'),actor(5,'barracks'),actor(6,'US.engineer'),actor(7,'hq'),actor(8,'US.rifle'),actor(9,'IR.rifle',2)]});
 const previews:OrderIntent[][]=[];const sent:OrderIntent[][]=[],marks:Array<{point:Point;kind:string}>=[],centers:Point[]=[],requests:number[][]=[];
 let hold:Promise<void>|undefined;
 const advice:CommandAffordances={tick:10,player:1,player_commands:[],entities:snapshot.entities.filter(entity=>entity.owner===1).map(entity=>({id:entity.id,commands:['move','attack','attack_move','rally','stop','repair','sell','power','train','cancel','build'],abilities:['observe'],builds:entity.id===2?['power','supply']:[],trains:entity.id===4?['US.rifle']:[],research:[]}))};
 const state=new Observable({catalog,settings:sanitizeSettings(undefined),index:{missions:[]},session:{map:{width:64,height:64}},busy:false});
 const app={state,sessions:{state:{id:'client2',kind:'online'},transport:{sendOrders:async(orders:OrderIntent[])=>{sent.push(structuredClone(orders));return sent.length}},subscribe:()=>()=>{}},commandAdvice:()=>({cancel(){},affordances:async(ids:number[])=>{requests.push(ids);if(hold)await hold;return {...advice,entities:advice.entities.filter(entity=>ids.includes(entity.id))}},preview:async(orders:OrderIntent[])=>{previews.push(structuredClone(orders));return {tick:10,results:orders.map((_,index)=>({player:1,index,sequence:0,tick:10,accepted:true,code:'ok'}))}},candidates:async(orders:OrderIntent[])=>({tick:10,results:orders.map((_,index)=>({player:1,index,sequence:0,tick:10,accepted:true,code:'ok'}))})}),audioDirector:{selection(){},receipt(){}},patch(){},error(error:unknown){throw error}} as unknown as Application;
 const control=new BattleController(app,()=>{},()=>{});control.refresh=async()=>{};(control as any).snapshot=snapshot;control.selection.reconcile(snapshot,'client2');control.select([8]);control.state.update(value=>({...value,affordances:advice}));
 (control as any).renderer={showOrderMarker:(point:Point,kind:string)=>marks.push({point,kind}),center:(point:Point)=>centers.push(point),setSelection(){},setPlacement(){},setTargeting(){},cancelDrag(){},setStrikePreview(){},viewport:()=>({left:0,top:0,right:64000,bottom:64000}),bounds:(entity:any)=>({left:entity.position.x,top:entity.position.y,right:entity.position.x,bottom:entity.position.y})};
 return {snapshot,control,app,sent,marks,centers,requests,previews,advice,hold:(promise?:Promise<void>)=>{hold=promise}};
}
const gesture=(id?:number)=>({kind:'click' as const,button:0,point:{x:12000,y:13000},hit:id?{kind:'entity' as const,id}:undefined,shift:false,ctrl:false,alt:false,meta:false});
function key(control:BattleController,code:string,extra:object={}){const old=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>null}});try{(control as any).key({code,target:null,preventDefault(){},...extra})}finally{if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document')}}

test('spatial orders acknowledge synchronously before advice or send completes',async()=>{
 for(const kind of ['move','attack','attack_move','rally']){
  const h=harness();let release!:()=>void;h.hold(new Promise(resolve=>{release=resolve}));
  const pending=h.control.execute({kind,entities:[8],target:kind==='attack'?{kind:'entity',id:9}:{kind:'ground',position:{x:12000,y:13000}}});
  assert.deepEqual(h.marks,[{kind,point:kind==='attack'?{x:9000,y:1000}:{x:12000,y:13000}}]);assert.equal(h.sent.length,0);release();await pending;assert.equal(h.sent.length,1);
 }
});
test('right-click acknowledges before its async Go context plan',async()=>{
 const h=harness();let release!:()=>void;h.hold(new Promise(resolve=>{release=resolve}));h.control.gesture({...gesture(9),kind:'context',button:2});assert.deepEqual(h.marks,[{kind:'attack',point:{x:9000,y:1000}}]);assert.equal(h.sent.length,0);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent.length,1);
});
test('enemy inspection remains visible, box remains owned, inspection cannot issue or query commands',async()=>{
 const h=harness();h.control.gesture(gesture(9));assert.deepEqual(h.control.state.get().ids,[9]);await h.control.execute({kind:'move',entities:h.control.selection.ids,target:{kind:'ground',position:{x:2000,y:2000}}});h.control.gesture({...gesture(),kind:'context',button:2});assert.equal(h.sent.length,0);assert.equal(h.marks.length,0);
 h.control.refresh=BattleController.prototype.refresh;await h.control.refresh();assert.ok(h.requests.flat().every(id=>id!==9));assert.deepEqual(h.control.state.get().affordances?.entities,[]);h.control.refresh=async()=>{};h.control.gesture({...gesture(),kind:'box',rect:{left:0,top:0,right:15000,bottom:15000}});assert.ok(!h.control.state.get().ids.includes(9));assert.ok(h.control.state.get().ids.includes(8));
});
test('production keys select categories, cycle factories, queue five and cancel matching cameo',async()=>{
 const h=harness();key(h.control,'KeyE');assert.equal(h.control.state.get().productionTab,'infantry');assert.equal(h.control.state.get().productionSource,4);key(h.control,'Tab');assert.equal(h.control.state.get().productionSource,5);key(h.control,'Tab',{shiftKey:true});assert.equal(h.control.state.get().productionSource,4);
 h.snapshot.entities.find(entity=>entity.id===4)!.private!.jobs.push({$typeName:'frontline.v1.ProductionJob',kind:'train',type:'US.rifle',work:0,required:10,paid:0n,started:false} as any);h.control.state.update(value=>({...value,production:[{type:'US.rifle',kind:'train',producer:4,available:true}]}));
 await h.control.cameo(1,'batch');assert.equal(h.sent.length,5);assert.ok(h.sent.every(batch=>batch[0].kind==='train'&&batch[0].type==='US.rifle'));await h.control.cameo(1,'cancel');assert.equal(h.sent.at(-1)![0].kind,'cancel');assert.equal(h.sent.at(-1)![0].index,0);
});
test('base and idle cycles, select army and all idle use distinct owned populations',()=>{
 const h=harness();key(h.control,'Backspace');key(h.control,'Backspace');key(h.control,'Backspace');assert.deepEqual(h.centers.map(point=>point.x),[1000,7000,1000]);key(h.control,'Backquote');assert.deepEqual(h.control.selection.ids,[2]);key(h.control,'Backquote');assert.deepEqual(h.control.selection.ids,[3]);key(h.control,'Backquote',{shiftKey:true});assert.deepEqual(h.control.selection.ids,[2,3,6]);key(h.control,'KeyA',{ctrlKey:true});assert.deepEqual(h.control.selection.ids,[8]);
});
test('utility modes target only owned buildings and Escape cancels',async()=>{
 const h=harness();key(h.control,'KeyL');assert.equal(h.control.state.get().utilityMode,'sell');h.control.gesture(gesture(9));assert.equal(h.sent.length,0);h.control.gesture(gesture(4));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent[0][0].kind,'sell');assert.deepEqual(h.sent[0][0].entities,[4]);key(h.control,'Escape');assert.equal(h.control.state.get().utilityMode,undefined);assert.equal(h.control.state.get().target,undefined);key(h.control,'KeyO');h.control.gesture(gesture(4));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent[1][0].kind,'power');assert.equal(h.sent[1][0].index,1);
});
test('N repeats last submitted structure placement; scatter uses validated moves',async()=>{
 const h=harness();await h.control.execute({kind:'build',type:'power',entities:[2],target:{kind:'ground',position:{x:10000,y:10000}}});key(h.control,'KeyN');assert.equal(h.control.state.get().target?.kind,'build');assert.equal(h.control.state.get().target?.type,'power');h.control.cancel();h.control.select([8]);key(h.control,'KeyX');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent.at(-1)![0].kind,'move');assert.deepEqual(h.sent.at(-1)![0].entities,[8]);
});
test('renderer marker reuses tactical pulse visuals immediately and clears on perspective reset',()=>{
 const h=harness(),snapshot=h.snapshot,overlay=new TacticalOverlay(),callbacks=new Set<()=>void>();
 const renderer:any={snapshot,tacticalModel:tacticalPresentation(snapshot,catalog,[8]),options:{map:{width:64,height:64}},tacticalOverlay:overlay,settings:sanitizeSettings(undefined),surface:{projectGround:(point:Point)=>point},camera:{zoom:1},app:{ticker:{add:(callback:()=>void)=>callbacks.add(callback),remove:(callback:()=>void)=>callbacks.delete(callback)}}};
 BattlefieldRenderer.prototype.showOrderMarker.call(renderer,{x:3000,y:4000},'move');assert.equal(overlay.root.children.length,3);assert.equal(callbacks.size,1);renderer.snapshot={...snapshot,player:2};for(const draw of callbacks)draw();assert.equal(callbacks.size,0);assert.equal(overlay.root.children.length,2);BattlefieldRenderer.prototype.showOrderMarker.call(renderer,{x:-1,y:4000},'move');assert.equal(callbacks.size,0);overlay.dispose();
});

test('repair cursor uses selected units through Go validation and Grid slots dispatch their displayed actions',async()=>{
 const h=harness();h.control.select([6]);key(h.control,'KeyK');h.control.gesture(gesture(4));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent[0][0].kind,'repair');assert.deepEqual(h.sent[0][0].entities,[6]);assert.equal(h.sent[0][0].target,4);h.control.cancel();
 h.app.state.update(value=>({...value,settings:{...value.settings,bindings:defaultBindings('standard','grid')}}));h.control.state.update(state=>({...state,affordances:h.advice}));key(h.control,'KeyW');assert.equal(h.control.state.get().target?.kind,'move');h.control.gesture(gesture());assert.equal(h.sent.length,1);await new Promise(resolve=>setImmediate(resolve));assert.equal(h.sent[1][0].kind,'move');
});

test('army scatter previews bounded Go batches rather than one network trip per unit',async()=>{
 const h=harness();h.snapshot.entities=Array.from({length:40},(_,i)=>actor(i+20,'US.rifle'));
 h.advice.entities=h.snapshot.entities.map(entity=>({id:entity.id,commands:['move'],abilities:[],builds:[],trains:[],research:[]}));
 h.control.selection.reconcile(h.snapshot,'client2');h.control.select(h.snapshot.entities.map(entity=>entity.id));
 await (h.control as any).scatter(false);assert.deepEqual(h.previews.map(batch=>batch.length),[32,8]);assert.deepEqual(h.sent.map(batch=>batch.length),[32,8]);
});

test('diagnostics, producer cycling and HQ selection are rebindable controller actions',()=>{
 const h=harness();h.app.setSettings=(settings)=>h.app.state.update(state=>({...state,settings}));
 key(h.control,'KeyD',{ctrlKey:true,shiftKey:true});assert.equal(h.app.state.get().settings.diagnostics,true);
 key(h.control,'KeyD',{ctrlKey:true,shiftKey:true});assert.equal(h.app.state.get().settings.diagnostics,false);
 h.control.productionCategory('infantry');h.control.chooseProduction(4);key(h.control,'Period');assert.equal(h.control.state.get().productionSource,5);key(h.control,'Comma');assert.equal(h.control.state.get().productionSource,4);
 h.app.state.update(state=>({...state,settings:{...state.settings,bindings:{...state.settings.bindings,keys:{...state.settings.bindings.keys,select_hq:[{code:'KeyJ'}]}}}}));
 key(h.control,'KeyJ');assert.deepEqual(h.control.state.get().ids,[1]);assert.deepEqual(h.centers.at(-1),h.snapshot.entities[0].position);
});

test('placement hover publishes authoritative known obstruction instead of indefinite checking',async()=>{
 const h=harness();h.control.select([2]);await h.control.command('build','power',2);
 const placements:unknown[]=[];(h.control as any).renderer.setPlacement=(value:unknown)=>placements.push(value);
 h.app.commandAdvice=()=>({preview:async(orders:OrderIntent[])=>({tick:10,results:[{player:1,index:0,sequence:0,tick:10,accepted:false,code:'occupied'}]})}) as any;
 h.control.gesture({...gesture(1),kind:'hover',point:{x:1000,y:1000}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.control.state.get().placementReason,'The site is occupied.');assert.equal((placements.at(-1) as any).valid,false);h.control.cancel();
});

test('every displayed socket dispatches its current unit, building and overflow-page entry',()=>{
 const h=harness(),calls:unknown[][]=[];h.control.command=async(...args:Parameters<BattleController['command']>)=>{calls.push(args)};
 const configurations=[
  {commands:['move','attack_move','stop','hold','guard','patrol','force_fire','aggressive','capture'],abilities:['observe'],builds:[]},
  {commands:['rally','power','repair','sell'],abilities:[],builds:[]},
  {commands:['move','attack_move','stop','hold','guard','patrol','force_fire','aggressive','return','deploy','pack','capture','board','unload','repair','gather','salvage','repeat_sortie','rally','power','sell'],abilities:['observe','strategic','recon_sweep'],builds:['barrier']},
 ];
 h.app.state.update(value=>({...value,settings:{...value.settings,bindings:defaultBindings('standard','grid')}}));
 for(const config of configurations){
  h.control.state.update(state=>({...state,commandPage:0,affordances:{tick:10,player:1,player_commands:[],entities:[{id:8,trains:[],research:[],...config}]}}));
  const pages=h.control.commandCard().pages;
  for(let page=0;page<pages.length;page++)for(let index=0;index<12;index++){
   h.control.commandPage(page);const slot=h.control.commandCard().current[index];calls.length=0;
   key(h.control,`Key${'QWERASDFZXCV'[index]}`,{shiftKey:true});
   if(slot.kind==='page'){assert.equal(h.control.commandCard().page,slot.target);assert.deepEqual(calls,[])}
   else if(slot.kind==='empty')assert.deepEqual(calls,[]);
   else if(slot.kind==='ability'||slot.kind==='observe')assert.deepEqual(calls,[['ability',slot.kind==='observe'?'observe':slot.ability,undefined,true]]);
   else if(slot.kind==='barricade')assert.deepEqual(calls,[['build','barrier']]);
   else assert.deepEqual(calls,[[slot.kind==='rebase'?'rebase':slot.command,undefined,undefined,true]]);
  }
 }
 assert.equal(h.control.commandCard().pages.length>1,true);
 h.control.select([6]);assert.equal(h.control.commandCard().page,0);
});

test('remapped slot two follows visible Move; empty, busy, countdown and modal sockets cannot issue',()=>{
 const h=harness(),calls:string[]=[];h.control.command=async(kind)=>{calls.push(kind)};
 h.app.state.update(value=>({...value,settings:{...value.settings,bindings:{...value.settings.bindings,keys:{...value.settings.bindings.keys,card_slot_2:[{code:'KeyJ'}],card_slot_5:[{code:'KeyI'}]}}}}));
 const advice={tick:10,player:1,player_commands:[],entities:[{id:8,commands:['move','stop'],abilities:[],builds:[],trains:[],research:[]}]};
 h.control.state.update(state=>({...state,affordances:advice}));
 assert.equal(h.control.commandCard().current[1].kind,'command');key(h.control,'KeyJ');assert.deepEqual(calls,['move']);
 calls.length=0;key(h.control,'KeyI');assert.deepEqual(calls,[]);
 h.control.state.update(state=>({...state,pending:true}));key(h.control,'KeyJ');assert.deepEqual(calls,[]);
 h.control.state.update(state=>({...state,pending:false}));h.snapshot.countdown=5;key(h.control,'KeyJ');assert.deepEqual(calls,[]);h.snapshot.countdown=0;
 const old=Object.getOwnPropertyDescriptor(globalThis,'document');let selector='';
 Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:(value:string)=>{selector=value;return {role:'alertdialog'}}}});
 try{(h.control as any).key({code:'KeyJ',target:null,preventDefault(){throw Error('Modal command was consumed')}});assert.deepEqual(calls,[]);assert.match(selector,/alertdialog/)}finally{if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document')}
});

test('cleared and legacy-unbound production tabs never activate an advertised fallback',()=>{
 const h=harness();h.control.productionCategory('infantry');h.app.state.update(value=>({...value,settings:{...value.settings,bindings:defaultBindings('standard','classic')}}));
 key(h.control,'Digit1',{altKey:true});assert.equal(h.control.state.get().productionTab,'infantry');
 h.app.state.update(value=>({...value,settings:{...value.settings,bindings:{...defaultBindings(),keys:{...defaultBindings().keys,production_base:[]}}}}));
 key(h.control,'KeyQ');key(h.control,'Digit1',{altKey:true});assert.equal(h.control.state.get().productionTab,'infantry');
 h.app.state.update(value=>({...value,settings:{...value.settings,bindings:{...defaultBindings(),keys:{...defaultBindings().keys,production_base:[{code:'KeyJ'}]}}}}));
 key(h.control,'KeyJ');assert.equal(h.control.state.get().productionTab,'structures');
});
