import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {createOfflineCommandEnvironment} from '../../src/runtime/advice';
import {planCommand,planContextCommand} from '../../src/runtime/command-intent';
import * as playerControls from '../../src/app/player-controls';
const {selectionSettingState,observeSettingState,capableSelectionHint}=playerControls;
import {ABILITIES} from '../../src/content/labels';
import {BattleController} from '../../src/app/battle-controller';
import {defaultBindings} from '../../src/runtime/keybindings';
import {CatalogIndex,tabFor} from '../../src/content/catalog';
import {productionCategories} from '../../src/app/production-focus';
import {Observable} from '../../src/app/store';
import type {Application} from '../../src/app/application';
import type {CommandAffordances,OrderIntent} from '../../src/runtime/types';

function fixture(){
 const actor=(id:number,owner=1)=>create(EntitySchema,{id,owner,type:'fixture',complete:true,enabled:true,position:{x:id*100,y:1000},private:owner===1?{hp:100n,maxHp:100n,orders:[{kind:'guard',target:99}]}:undefined});
 const snapshot=create(PlayerSnapshotSchema,{player:1,tick:10,players:[{id:1,team:1},{id:2,team:2}],entities:[actor(1),actor(2),actor(3),actor(9,2)]});
 const advice:CommandAffordances={player:1,tick:10,player_commands:[],entities:[
  {id:1,commands:['move','ability','build'],abilities:['observe'],builds:['barrier'],trains:[],research:[]},
  {id:2,commands:['ability','power','build'],abilities:['radar_pulse'],builds:['barrier'],trains:[],research:[]},
  {id:3,commands:['move','ability'],abilities:['sabotage'],builds:[],trains:[],research:[]},
 ]};
 const previews:OrderIntent[][]=[];
 const runtime={affordances:async(ids:readonly number[])=>({...advice,entities:advice.entities.filter(entity=>ids.includes(entity.id))}),previewOrders:async(orders:OrderIntent[])=>{previews.push(structuredClone(orders));return {tick:10,results:orders.map((_,index)=>({player:1,index,sequence:0,tick:10,accepted:true,code:'ok'}))}},previewCandidates:async(orders:OrderIntent[])=>({tick:10,results:orders.map((_,index)=>({player:1,index,sequence:0,tick:10,accepted:true,code:'ok'}))})};
 return {snapshot,advice,previews,runtime};
}

test('explicit mixed actions pass only capable actors without changing unsupported owner state',async()=>{
 const f=fixture(),before=structuredClone(f.snapshot),env=await createOfflineCommandEnvironment(f.runtime,f.snapshot,[1,2,3],{isCurrent:()=>true});
 const plan=await planCommand({kind:'move',entities:[3,2,1],allowPartial:true,target:{kind:'ground',position:{x:3000,y:3000}}},env);
 assert.deepEqual(plan.orders.map(order=>order.entities),[[1,3]]);assert.deepEqual(plan.issues.map(issue=>issue.entities),[[2]]);assert.deepEqual(f.snapshot,before);
 const power=await planCommand({kind:'power',entities:[1,2,3],index:1,allowPartial:true},env);assert.deepEqual(power.orders.map(order=>order.entities),[[2]]);
 assert.equal(selectionSettingState('power',f.snapshot,[1,2,3],f.advice)?.state,'on');
 assert.equal(capableSelectionHint(f.snapshot,[1,2,3],f.advice,'move'),'2 capable selected units; 1 unsupported keep their orders.');
});

test('named abilities cannot borrow another actor generic ability capability',async()=>{
 const f=fixture(),before=structuredClone(f.snapshot),env=await createOfflineCommandEnvironment(f.runtime,f.snapshot,[1,2,3],{isCurrent:()=>true});
 const radar=await planCommand({kind:'ability',type:'radar_pulse',entities:[1,2,3],allowPartial:true,target:{kind:'ground',position:{x:3000,y:3000}}},env);
 assert.deepEqual(radar.orders.map(order=>order.entities),[[2]]);assert.equal(radar.orders.length,1);assert.equal(radar.batches.length,1);
 const observe=await planCommand({kind:'ability',type:'observe',entities:[1,2,3],allowPartial:true,index:0},env);assert.deepEqual(observe.orders.map(order=>order.entities),[[1]]);assert.equal(observe.orders[0].index,0);
 const off=await planCommand({kind:'ability',type:'observe',entities:[1,2,3],allowPartial:true,index:1},env);assert.equal(off.orders[0].index,1);assert.deepEqual(f.snapshot,before);
 assert.equal(observeSettingState(f.snapshot,[1,2,3],f.advice)?.nextIndex,0);
 Object.assign(f.snapshot.entities[0].private!,{reconObserve:true});assert.equal(observeSettingState(f.snapshot,[1,2,3],f.advice)?.nextIndex,1);
 assert.match(ABILITIES.radar_pulse.hint,/unknown terrain/);assert.equal(ABILITIES.observe.target,'none');
});

test('free Observe alone may split above 64; paid Radar and barricade remain one intention',async()=>{
 const f=fixture();f.snapshot.entities=Array.from({length:130},(_,i)=>create(EntitySchema,{id:i+1,owner:1,complete:true,position:{x:1000,y:1000},private:{hp:100n,maxHp:100n}}));
 f.advice.entities=f.snapshot.entities.map(entity=>({id:entity.id,commands:['ability','build'],abilities:['observe','radar_pulse'],builds:['barrier'],trains:[],research:[]}));
 const ids=f.snapshot.entities.map(entity=>entity.id),env=await createOfflineCommandEnvironment(f.runtime,f.snapshot,ids,{isCurrent:()=>true});
 const observe=await planCommand({kind:'ability',type:'observe',entities:ids,index:0,allowPartial:true},env);assert.deepEqual(observe.orders.map(order=>order.entities?.length),[64,64,2]);assert.ok(observe.orders.every(order=>order.index===0&&order.type==='observe'));
 for(const request of [{kind:'ability',type:'radar_pulse'},{kind:'build',type:'barrier'}]){const plan=await planCommand({...request,entities:ids,allowPartial:true,target:{kind:'ground',position:{x:3000,y:3000}}},env);assert.equal(plan.orders.length,0);assert.equal(plan.issues[0].code,'selection_limit')}
 const barrier=await planCommand({kind:'build',type:'barrier',entities:[3,2,1],allowPartial:true,target:{kind:'ground',position:{x:3000,y:3000}}},env);assert.deepEqual(barrier.orders.map(order=>order.entities),[[1,2,3]]);assert.equal(barrier.orders.length,1);
 const generic=await planCommand({kind:'build',type:'barrier_other',entities:[1,2],allowPartial:true,target:{kind:'ground',position:{x:3000,y:3000}}},env);assert.equal(generic.orders.length,0);
});

test('partial selection does not bypass foreign or duplicate packet rejection before any preview',async()=>{
 const f=fixture(),env=await createOfflineCommandEnvironment(f.runtime,f.snapshot,[1,2,3],{isCurrent:()=>true});
 for(const ids of [[1,9],[1,999],[1,1]]){
  const plan=await planCommand({kind:'move',entities:ids,allowPartial:true,target:{kind:'ground',position:{x:3000,y:3000}}},env);assert.equal(plan.orders.length,0);assert.equal(plan.issues[0].code,ids[0]===ids[1]?'invalid_selection':'not_controllable');
  const context=await planContextCommand(ids,{kind:'ground',position:{x:3000,y:3000}},env);assert.equal(context.orders.length,0);
 }
 assert.equal(f.previews.length,0);assert.equal(observeSettingState(f.snapshot,[1,9],f.advice),undefined);assert.equal(selectionSettingState('power',f.snapshot,[1,9],f.advice),undefined);
});

test('execution acknowledgement reads actual count and never requested selection size',()=>{
 assert.equal(playerControls.executionCountFeedback({accepted:true,eligibleEntities:[1,2,3],appliedCount:1}),'Order applied to 1 capable unit.');
 assert.equal(playerControls.executionCountFeedback({accepted:true,appliedCount:3}),'Order applied to 3 capable units.');
 for(const result of [{accepted:false,appliedCount:2},{accepted:true},{accepted:true,appliedCount:0},{accepted:true,appliedCount:1.5}])assert.equal(playerControls.executionCountFeedback(result),undefined);
});

test('ordinary Controller Observe buttons and mixed Power send capable actors and retain unsupported queues',async()=>{
 const f=fixture(),before=structuredClone(f.snapshot),sent:OrderIntent[][]=[],patches:Array<{notice?:string}>=[],errors:unknown[]=[];
 const state=new Observable({notice:undefined as string|undefined});
 const app={state,sessions:{state:{id:'additions-controls',kind:'online'},transport:{sendOrders:async(orders:OrderIntent[])=>{sent.push(structuredClone(orders));return sent.length}},subscribe:()=>()=>{}},commandAdvice:()=>({cancel(){},affordances:f.runtime.affordances,preview:f.runtime.previewOrders,candidates:f.runtime.previewCandidates}),audioDirector:{receipt(){}},patch:(patch:{notice?:string})=>{patches.push(patch);state.update(value=>({...value,...patch}))},error:(error:unknown)=>errors.push(error)} as unknown as Application;
 const control=new BattleController(app,()=>{},()=>{});(control as any).snapshot=f.snapshot;control.selection.reconcile(f.snapshot,'additions-controls');control.selection.apply([1,2,3]);control.state.update(value=>({...value,affordances:f.advice}));
 await control.command('ability','observe',undefined,false,0);await control.command('ability','observe',undefined,false,1);await control.command('power',undefined,undefined,false,0);
 assert.deepEqual(sent.map(batch=>batch.map(order=>({kind:order.kind,type:order.type,index:order.index,entities:order.entities}))),[[{kind:'ability',type:'observe',index:0,entities:[1]}],[{kind:'ability',type:'observe',index:1,entities:[1]}],[{kind:'power',type:undefined,index:0,entities:[2]}]]);
 assert.deepEqual(f.snapshot,before);assert.deepEqual(errors,[]);assert.deepEqual(control.selection.ids,[1,2,3]);assert.equal(control.state.get().pending,false);assert.ok(patches.some(patch=>patch.notice?.includes('unsupported selected')));
 await control.command('ability','radar_pulse');assert.deepEqual(control.state.get().target,{kind:'ability',type:'radar_pulse',label:'Radar Pulse',groundOnly:true});assert.equal(sent.length,3,'Targeted Radar waits for a point');
});

test('ordinary targeted Radar ignores queued pointer mode while ordinary Move keeps it',async()=>{
 const f=fixture(),sent:OrderIntent[][]=[],errors:unknown[]=[];
 const app={state:new Observable({settings:{bindings:defaultBindings()}}),sessions:{state:{id:'queued-target-controls',kind:'online'},transport:{sendOrders:async(orders:OrderIntent[])=>{sent.push(structuredClone(orders));return sent.length}},subscribe:()=>()=>{}},commandAdvice:()=>({cancel(){},affordances:f.runtime.affordances,preview:f.runtime.previewOrders,candidates:f.runtime.previewCandidates}),audioDirector:{receipt(){}},patch(){},error:(error:unknown)=>errors.push(error)} as unknown as Application;
 const control=new BattleController(app,()=>{},()=>{});(control as any).snapshot=f.snapshot;control.selection.reconcile(f.snapshot,'queued-target-controls');control.selection.apply([1,2,3]);control.state.update(value=>({...value,affordances:f.advice}));
 const execute=control.execute.bind(control);let complete=()=>{};control.execute=async(request,generation)=>{try{await execute(request,generation)}finally{complete()}};
 for(const kind of ['radar_pulse','move']){
  await control.command(kind==='move'?'move':'ability',kind==='move'?undefined:kind);
  const done=new Promise<void>(resolve=>{complete=resolve});control.gesture({kind:'click',button:0,point:{x:3000,y:3000},shift:true,ctrl:false,alt:false,meta:false});await done;
 }
 assert.equal(sent.length,2);assert.deepEqual(sent[0][0].entities,[2]);assert.equal(sent[0][0].queued,false);assert.equal(sent[1][0].queued,true);assert.deepEqual(sent[1][0].entities,[1,3]);assert.deepEqual(errors,[]);
});

test('field barricade is a defense sidebar option for engineers without changing catalog defense caps',()=>{
 const catalog={units:new Map([['US.engineer',{role:'engineer'}]]),buildings:new Map([['barrier',{role:'barrier',defense:false}]]),upgrades:new Map()} as unknown as CatalogIndex;
 assert.deepEqual(productionCategories({...fixture().snapshot.entities[0],type:'US.engineer'},catalog,'US'),['defense']);assert.equal(tabFor(catalog,'barrier'),'defense');assert.equal(catalog.buildings.get('barrier')!.defense,false);
});
