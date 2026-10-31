import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {BattleController} from '../../src/app/battle-controller';
import {CatalogIndex} from '../../src/content/catalog';
import {Observable} from '../../src/app/store';
import {sanitizeSettings} from '../../src/app/settings';
import {defaultBindings} from '../../src/runtime/keybindings';
import type {Application} from '../../src/app/application';
import type {CommandAffordances,OrderIntent,Point} from '../../src/runtime/types';

const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
const actor=(id:number,type:string,owner=1)=>create(EntitySchema,{id,type,owner,position:{x:id*1000,y:1000},health:1000,complete:true,enabled:true,state:'idle',private:owner===1?{hp:100n,maxHp:100n}:undefined});
function harness(){
 const snapshot=create(PlayerSnapshotSchema,{player:1,tick:10,players:[{id:1,faction:'US',team:1},{id:2,faction:'IR',team:2}],entities:[actor(1,'hq'),actor(2,'US.rig'),actor(3,'US.hauler'),actor(4,'barracks'),actor(6,'US.engineer'),actor(8,'US.rifle')]});
 const sent:OrderIntent[][]=[],notices:string[]=[],centers:Point[]=[],placements:unknown[]=[];let code='ok',hold:Promise<void>|undefined,listener:(event:any)=>void=()=>{};
 const advice:CommandAffordances={tick:10,player:1,player_commands:[],entities:snapshot.entities.map(entity=>({id:entity.id,commands:['move','attack_move','stop','train','build','cancel'],abilities:[],builds:entity.id===2?['power']:[],trains:entity.id===1?['US.rig']:entity.id===4?['US.rifle']:[],research:[]}))};
 const state=new Observable({catalog,settings:sanitizeSettings(undefined),session:{id:'battle-qa',kind:'online',map:{width:64,height:64}},notice:undefined as string|undefined,busy:undefined});
 const preview=async(orders:OrderIntent[])=>({tick:10,results:orders.map((_,index)=>({player:1,index,sequence:0,tick:10,accepted:code==='ok',code}))});
 const app={state,sessions:{state:{id:'battle-qa',kind:'online'},transport:{sendOrders:async(orders:OrderIntent[])=>{sent.push(structuredClone(orders));return sent.length}},subscribe:(next:typeof listener)=>{listener=next;return()=>{}}},commandAdvice:()=>({cancel(){},affordances:async(ids:number[])=>{if(hold)await hold;return {...advice,entities:advice.entities.filter(entity=>ids.includes(entity.id))}},preview,candidates:preview}),audioDirector:{selection(){},receipt(){}},patch(change:any){if(change.notice)notices.push(change.notice);state.update(value=>({...value,...change}))},error(error:unknown){throw error}} as unknown as Application;
 const control=new BattleController(app,()=>{},()=>{});control.refresh=async()=>{};(control as any).snapshot=snapshot;control.selection.reconcile(snapshot,'battle-qa');
 (control as any).renderer={setSelection(){},setPlacement:(value:unknown)=>placements.push(value),setTargeting(){},cancelDrag(){},setStrikePreview(){},showOrderMarker(){},showRejectedOrder(){},center:(point:Point)=>centers.push(point)};
 control.select([8]);control.state.update(value=>({...value,affordances:advice}));
 return {app,control,snapshot,sent,notices,centers,placements,advice,reject:(value:string)=>{code=value},hold:(value:Promise<void>)=>{hold=value},receipt:(result:object)=>listener({type:'runtime',session:'battle-qa',event:{type:'order-result',result:{player:1,index:0,sequence:sent.length,tick:10,...result}}})};
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
function key(control:BattleController,code:string,target='CANVAS',extra:object={}){
 const old=Object.getOwnPropertyDescriptor(globalThis,'document');let prevented=false;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>null}});
 try{(control as any).key({code,key:'deliberately different logical key',target:{tagName:target,getAttribute:()=>null},preventDefault(){prevented=true},...extra})}finally{if(old)Object.defineProperty(globalThis,'document',old);else Reflect.deleteProperty(globalThis,'document')}
 return prevented;
}
const modifiers={shift:false,ctrl:false,alt:false,meta:false};
const click={kind:'click' as const,button:0,point:{x:12000,y:13000},shift:false,ctrl:false,alt:false,meta:false};

test('M2-01: rejected placement keeps ghost and reason, retries successfully, then leaves placement',async()=>{
 for(const code of ['occupied','overlap','outside_build_radius']){
  const h=harness();h.control.select([2]);await h.control.command('build','power',2);h.reject(code);h.control.gesture(click);await settle();
  assert.equal(h.sent.length,0);assert.equal(h.control.state.get().target?.kind,'build');assert.equal((h.control as any).targeting.targeting,true);assert.ok(h.control.state.get().placementReason);assert.ok(h.placements.at(-1));
  h.reject('ok');h.control.gesture({...click,point:{x:16000,y:16000}});await settle();assert.equal(h.sent.length,1);assert.equal(h.control.state.get().target,undefined);assert.equal(h.placements.at(-1),undefined);
 }
});
test('M2-01: Escape during a pending placement check never resurrects its ghost',async()=>{
 const h=harness();h.control.select([2]);await h.control.command('build','power',2);let release!:()=>void;h.hold(new Promise(resolve=>{release=resolve}));h.control.gesture(click);key(h.control,'Escape');release();await settle();assert.equal(h.sent.length,0);assert.equal(h.control.state.get().target,undefined);
});
test('M2-01: a host rejection after clear preview restores placement unless a later cancel owns input',async()=>{
 for(const canceled of [false,true]){
  const h=harness();h.control.select([2]);await h.control.command('build','power',2);h.control.gesture(click);await settle();assert.equal(h.control.state.get().target,undefined);
  if(canceled)h.control.cancel();h.receipt({accepted:false,code:'occupied'});assert.equal(h.control.state.get().target?.kind,canceled?undefined:'build');if(!canceled)assert.equal(h.control.state.get().placementReason,'The site is occupied.');
 }
});
test('M2-02: selecting HQ updates the displayed tab model before F1 queues its rig',async()=>{
 const h=harness();h.control.select([2]);assert.equal(h.control.state.get().productionTab,'structures');h.control.select([1]);assert.equal(h.control.state.get().productionTab,'vehicles');
 h.control.state.update(value=>({...value,production:[{type:'US.rig',kind:'train',producer:1,available:true}]}));assert.equal(key(h.control,'F1'),true);await settle();assert.equal(h.sent[0][0].type,'US.rig');assert.equal(h.sent[0][0].kind,'train');
});
test('M2-02: real controller handler consumes F1 through F12 from body/canvas by physical code',()=>{
 for(const target of ['BODY','CANVAS'])for(let n=1;n<=12;n++)for(const [extra,mode] of [[{},undefined],[{shiftKey:true},'batch'],[{ctrlKey:true},'cancel']] as const){
  const h=harness(),calls:unknown[][]=[];h.control.cameo=async(...args)=>{calls.push(args)};
  assert.equal(key(h.control,`F${n}`,target,extra),true);assert.deepEqual(calls,[[n,mode]]);
 }
 const h=harness();let calls=0;h.control.cameo=async()=>{calls++};assert.equal(key(h.control,'F1','INPUT'),false);assert.equal(key(h.control,'F1','CANVAS',{defaultPrevented:true}),false);assert.equal(calls,0);
});
test('M2-02: Shift+F1 queues five jobs and Ctrl+F1 cancels the matching live job',async()=>{
 const h=harness();h.control.productionCategory('infantry');h.control.state.update(value=>({...value,production:[{type:'US.rifle',kind:'train',producer:4,available:true}]}));
 key(h.control,'F1','CANVAS',{shiftKey:true});await settle();assert.equal(h.sent.length,5);assert.ok(h.sent.every(batch=>batch[0].kind==='train'&&batch[0].type==='US.rifle'));
 h.snapshot.entities.find(entity=>entity.id===4)!.private!.jobs.push({kind:'train',type:'US.rifle',work:0,required:100,paid:0n,started:false} as any);
 key(h.control,'F1','BODY',{ctrlKey:true});await settle();assert.equal(h.sent.at(-1)![0].kind,'cancel');assert.equal(h.sent.at(-1)![0].index,0);
});
test('M2-03: real Backquote handler cycles and centres disclosed idle haulers/engineers',()=>{
 const h=harness();h.snapshot.entities=h.snapshot.entities.filter(entity=>entity.id!==2);h.control.select([]);assert.equal(key(h.control,'Backquote','BODY'),true);assert.deepEqual(h.control.selection.ids,[3]);assert.deepEqual(h.centers.at(-1),{x:3000,y:1000});key(h.control,'Backquote');assert.deepEqual(h.control.selection.ids,[6]);key(h.control,'Backquote','CANVAS',{shiftKey:true});assert.deepEqual(h.control.selection.ids,[3,6]);
 // This fixture isolates the working hauler/engineer key path. Rig eligibility is an out-of-lane defect, requested in fix-battle.md.
});
test('M2-04: radar context button follows Modern/Classic, queued and current targeted orders use Go',async()=>{
 for(const preset of ['standard','classic'] as const){
  const h=harness();h.app.state.update(value=>({...value,settings:{...value.settings,bindings:defaultBindings(preset)}}));
  assert.equal(h.control.minimapOrder(click.point,preset==='standard'?0:2,modifiers),false);assert.equal(h.control.minimapOrder(click.point,preset==='standard'?2:0,{...modifiers,shift:true}),true);await settle();assert.equal(h.sent[0][0].kind,'move');assert.equal(h.sent[0][0].queued,true);assert.deepEqual(h.sent[0][0].position,click.point);
  await h.control.command('attack_move');h.control.minimapOrder(click.point,preset==='standard'?2:0,modifiers);await settle();assert.equal(h.sent[1][0].kind,'attack_move');
 }
 const h=harness();h.control.select([]);assert.equal(h.control.minimapOrder(click.point,2,modifiers),false);h.control.select([8]);h.snapshot.outcome={finished:true} as any;assert.equal(h.control.minimapOrder(click.point,2,modifiers),false);
});
test('M2-09: accepted and execution receipts stay silent with diagnostics off and publish when on',async()=>{
 for(const diagnostics of [false,true]){
  const h=harness();h.app.state.update(value=>({...value,settings:{...value.settings,diagnostics}}));await h.control.execute({kind:'stop',entities:[8]});h.receipt({accepted:true,code:'accepted'});h.receipt({accepted:true,code:'ok',appliedCount:1});
  assert.deepEqual(h.notices,diagnostics?['Order accepted. Awaiting execution.','Order applied to 1 capable unit.']:[]);
 }
});
test('M2-09: mixed-selection notice agrees with one skipped unit and remains actionable',async()=>{
 const h=harness();h.control.select([6,8]);h.advice.entities.find(entity=>entity.id===6)!.commands=[];await h.control.execute({kind:'stop',entities:[6,8]});assert.ok(h.notices.includes('Order sent. 1 unsupported selected unit keeps its current orders.'));assert.deepEqual(h.sent[0][0].entities,[8]);
});
