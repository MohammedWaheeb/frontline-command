import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import type {OrderIntent} from '../../src/runtime/types';
import {BattlefieldSelection} from '../../src/runtime/interaction';
import {planCommand,planContextCommand,commonCommands,batchOrders,CommandTargeting,targetRelationship,type CommandEnvironment,type CommandLegality} from '../../src/runtime/command-intent';

const unit=(id:number,type='rifle',owner=1)=>create(EntitySchema,{id,type,owner,health:1000,complete:true,position:{x:id*10,y:1000},private:owner===1?{hp:100n,maxHp:100n}:undefined});
function environment():CommandEnvironment{
 const snapshot=create(PlayerSnapshotSchema,{player:1,tick:100,players:[{id:1,team:1},{id:2,team:1},{id:3,team:2}],entities:[unit(1),unit(2,'engineer'),unit(3,'rig'),unit(4,'fighter'),unit(5,'carrier'),unit(6,'factory'),unit(7,'support'),unit(90,'tank',3),unit(91,'rifle',2)],memory:[{id:99,type:'hidden',position:{x:5000,y:5000}}],fields:[{id:500,position:{x:5000,y:6000}}],stations:[{id:600,position:{x:1000,y:2000}}],salvage:[{id:700,position:{x:9000,y:8000}}]});
 const capabilities:Record<string,string[]>={rifle:['move','attack','guard','board','stop'],engineer:['move','capture','repair','guard'],rig:['move','repair','resume','build'],fighter:['move','attack','escort','return'],carrier:['move','unload'],factory:['rally','train','power'],support:['move']};
 return {snapshot,supports:(entity,command)=>capabilities[entity.type]?.includes(command.kind)??false,validate:order=>order.kind==='attack'&&order.entities?.includes(4)?{accepted:false,code:'illegal_target_layer'}:order.kind==='board'?{accepted:false,code:'invalid_transport'}:{accepted:true,code:'ok'}};
}

test('explicit intents reject hostile ownership and hidden/memory targets before invoking gameplay preview',async()=>{
 const env=environment();let calls=0;env.validate=()=>{calls++;return {accepted:true,code:'ok'}};
 const snapshot=structuredClone(env.snapshot);
 let plan=await planCommand({kind:'move',entities:[1,90],target:{kind:'ground',position:{x:3000,y:3000}}},env);
 assert.equal(plan.orders.length,0);assert.equal(plan.issues[0].code,'not_controllable');assert.equal(calls,0);
 plan=await planCommand({kind:'attack',entities:[1],target:{kind:'entity',id:99}},env);
 assert.equal(plan.orders.length,0);assert.equal(plan.issues[0].code,'target_not_visible');assert.equal(calls,0);
 plan=await planCommand({kind:'gather',entities:[1],target:{kind:'field',id:999}},env);
 assert.equal(plan.issues[0].code,'target_not_visible');assert.equal(calls,0);
 assert.deepEqual(env.snapshot,snapshot);
});

test('large movement selections split safely while semantic abilities never repeat implicitly',async()=>{
 const env=environment();env.snapshot.entities=Array.from({length:130},(_,i)=>unit(i+1));env.supports=()=>true;
 const ids=env.snapshot.entities.map(entity=>entity.id).reverse();
 const moved=await planCommand({kind:'move',entities:ids,target:{kind:'ground',position:{x:3000,y:4000}}},env);
 assert.deepEqual(moved.orders.map(order=>order.entities?.length),[64,64,2]);assert.equal(moved.batches.length,1);assert.deepEqual(moved.orders.flatMap(order=>order.entities??[]),[...ids].sort((a,b)=>a-b));
 const ability=await planCommand({kind:'ability',type:'drone_recall',entities:ids},env);
 assert.equal(ability.orders.length,0);assert.equal(ability.issues[0].code,'selection_limit');
 const rally=await planCommand({kind:'rally',entities:ids.slice(0,65),target:{kind:'ground',position:{x:5000,y:4000}}},env);
 assert.deepEqual(rally.batches.map(batch=>batch.length),[32,32,1]);assert.ok(rally.orders.every(order=>order.entities?.length===1));
});

test('mixed selection previews preserve exact failures and require explicit opt-in for partial commands',async()=>{
 const env=environment();
 let plan=await planCommand({kind:'repair',entities:[1,3],target:{kind:'entity',id:6}},env);
 assert.equal(plan.orders.length,0);assert.equal(plan.issues[0].code,'unsupported_command');
 plan=await planCommand({kind:'repair',entities:[1,3],target:{kind:'entity',id:6},allowPartial:true},env);
 assert.deepEqual(plan.orders[0].entities,[3]);assert.deepEqual(plan.issues[0].entities,[1]);
 env.validate=()=>({accepted:false,code:'insufficient_credits',message:'Repair reserve prevents this expense.'});
 plan=await planCommand({kind:'repair',entities:[3],target:{kind:'entity',id:6}},env);
 assert.deepEqual(plan.issues,[{code:'insufficient_credits',message:'Repair reserve prevents this expense.',entities:[3]}]);assert.equal(plan.orders.length,0);
 assert.deepEqual(commonCommands([1,3],env).map(command=>command.kind),['move']);
});

test('contextual mixed forces capture or attack legally without making support or air-only units chase ground targets',async()=>{
 const env=environment();
 const plan=await planContextCommand([1,2,3,4,7],{kind:'entity',id:90},env);
 assert.deepEqual(plan.orders.map(order=>({kind:order.kind,entities:order.entities})),[{kind:'attack',entities:[1]},{kind:'capture',entities:[2]}]);
 assert.ok(plan.issues.some(issue=>issue.code==='illegal_target_layer'&&issue.entities[0]===4));
 assert.ok(plan.issues.some(issue=>issue.code==='no_context_command'&&issue.entities[0]===7));
 assert.ok(!plan.orders.some(order=>order.kind==='move'));
 const ally=await planContextCommand([1,4],{kind:'entity',id:91},env);
 assert.deepEqual(ally.orders.map(order=>order.kind),['guard','escort']);
 assert.equal(targetRelationship(env.snapshot,env.snapshot.entities.find(entity=>entity.id===91)!),'allied');
 env.snapshot.players=env.snapshot.players.filter(player=>player.id!==2);
 const unknown=await planContextCommand([1],{kind:'entity',id:91},env);assert.equal(unknown.orders.length,0);
});

test('context commands use owned private data for unload and preserve producer-per-order semantics',async()=>{
 const env=environment();env.snapshot.entities.find(entity=>entity.id===5)!.private!.passengers=[11];
 const unload=await planContextCommand([5],{kind:'entity',id:5},env);
 assert.equal(unload.orders[0].kind,'unload');assert.equal(unload.orders[0].target,undefined);assert.deepEqual(unload.orders[0].position,{x:50,y:1000});
 const ground=await planContextCommand([1,6],{kind:'ground',position:{x:4000,y:3000}},env);
 assert.deepEqual(ground.orders.map(order=>order.kind),['rally','move']);
 const missing=await planContextCommand([1],{kind:'entity',id:99},env);assert.equal(missing.orders.length,0);
});

test('queue and packet limits are explicit and never silently truncate or modify intentions',async()=>{
 const env=environment();env.snapshot.entities[0].private!.orders=Array.from({length:10},()=>createOrder());
 const full=await planCommand({kind:'move',entities:[1],queued:true,target:{kind:'ground',position:{x:1000,y:1000}}},env);
 assert.equal(full.orders.length,0);assert.equal(full.issues[0].code,'queue_full');
 const invalid=await planCommand({kind:'move',entities:[1],target:{kind:'ground',position:{x:1.5,y:1000}}},env);assert.equal(invalid.issues[0].code,'invalid_position');
 const tooMany=await planCommand({kind:'move',entities:[1],target:{kind:'ground',position:{x:1000,y:1000}},points:Array.from({length:7},()=>({x:1000,y:1000}))},env);assert.equal(tooMany.issues[0].code,'invalid_points');
 const orders:Array<OrderIntent>=Array.from({length:33},()=>({kind:'move',entities:[1],position:{x:1000,y:1000}}));
 const batches=batchOrders(orders);assert.deepEqual(batches.map(batch=>batch.length),[32,1]);batches[0][0].entities!.push(2);assert.deepEqual(orders[0].entities,[1]);
 assert.throws(()=>batchOrders([{kind:'move',entities:Array.from({length:65},(_,i)=>i+1)}]));
 assert.throws(()=>batchOrders([{kind:'move',entities:[1,1]}]));
});

function createOrder(){return {$typeName:'frontline.v1.Order' as const,kind:'move',entities:[],target:0,type:'',queued:false,index:0,points:[]}}

test('unavailable previews are labeled unverified and preview callbacks cannot mutate outbound order data',async()=>{
 const env=environment();env.validate=undefined;
 const unverified=await planCommand({kind:'move',entities:[1],target:{kind:'ground',position:{x:2000,y:3000}}},env);
 assert.equal(unverified.validation,'unverified');assert.equal(unverified.orders.length,1);
 env.validate=order=>{order.position!.x=9999;order.entities!.push(99);return {accepted:true,code:'ok'}};
 const previewed=await planCommand({kind:'move',entities:[1],target:{kind:'ground',position:{x:2000,y:3000}}},env);
 assert.equal(previewed.validation,'previewed');assert.deepEqual(previewed.orders[0].entities,[1]);assert.equal(previewed.orders[0].position!.x,2000);
});

test('multi-point ability identity stays locked and selection changes invalidate pending previews',async()=>{
 const env=environment(),selection=new BattlefieldSelection(),targeting=new CommandTargeting();selection.reconcile(env.snapshot,'match-1');selection.click(2);
 const template={kind:'ability',type:'volley'};targeting.begin(template,selection.token,2);template.type='different_ability';
 assert.deepEqual(targeting.choose({kind:'ground',position:{x:3000,y:3000}},selection.token),{status:'pending',remaining:1});
 const ready=targeting.choose({kind:'ground',position:{x:4000,y:3000}},selection.token);
 assert.equal(ready.status,'ready');if(ready.status!=='ready')return;
 assert.equal(ready.request.type,'volley');assert.deepEqual(ready.request.entities,[2]);assert.equal(ready.request.points?.length,2);
 env.supports=()=>true;env.isCurrent=()=>targeting.current(ready.generation,selection.token);
 let release!:(value:CommandLegality)=>void;
 env.validate=()=>new Promise(resolve=>{release=resolve});
 const pending=planCommand(ready.request,env);
 selection.click(1);targeting.reconcile(selection.token);release({accepted:true,code:'ok'});
 const canceled=await pending;assert.equal(canceled.orders.length,0);assert.equal(canceled.issues[0].code,'targeting_changed');assert.equal(targeting.targeting,false);
 targeting.begin({kind:'attack'},selection.token);selection.reconcile(env.snapshot,'match-2');assert.equal(targeting.choose({kind:'entity',id:90},selection.token).status,'canceled');
});

test('explicit command batches use one sequential preview and retain joint affordability failures',async()=>{
 const env=environment(),calls:OrderIntent[][]=[];env.validate=()=>{throw new Error('per-order preview used')};
 env.validateBatch=orders=>{calls.push(structuredClone(orders));return orders.map((_,index)=>index===0?{accepted:true,code:'ok'}:{accepted:false,code:'insufficient_credits'})};
 // A custom input layout may expose an each-producer action. It still cannot
 // turn two independent approvals into a jointly affordable batch.
 env.descriptors=[{kind:'train',targets:[],targetOptional:true,selection:'each',queueable:false}];env.supports=()=>true;
 let plan=await planCommand({kind:'train',type:'rifle',entities:[1,6]},env);
 assert.equal(calls.length,1);assert.equal(calls[0].length,2);assert.equal(plan.orders.length,0);assert.equal(plan.issues[0].code,'insufficient_credits');
 plan=await planCommand({kind:'train',type:'rifle',entities:[1,6],allowPartial:true},env);assert.deepEqual(plan.orders.map(order=>order.entities),[[1]]);
});
test('context prefetch batches 65 units, skips unused fallbacks, and sequentially rechecks combined orders',async()=>{
 const env=environment();env.snapshot.entities=[...Array.from({length:65},(_,i)=>unit(i+1)),unit(90,'tank',3)];env.supports=(_entity,command)=>['attack','board'].includes(command.kind);env.validate=()=>{throw new Error('per-unit preview used')};
 const probes:OrderIntent[][]=[],final:OrderIntent[][]=[];
 env.validateCandidates=orders=>{assert.ok(orders.length<=32);probes.push(structuredClone(orders));return orders.map(order=>({accepted:order.kind==='attack',code:order.kind==='attack'?'indeterminate':'invalid_transport'}))};
 env.validateBatch=orders=>{final.push(structuredClone(orders));return orders.map(()=>({accepted:true,code:'indeterminate'}))};
 const plan=await planContextCommand(Array.from({length:65},(_,i)=>i+1),{kind:'entity',id:90},env);
 assert.deepEqual(probes.map(batch=>batch.length),[32,32,1]);assert.ok(probes.flat().every(order=>order.kind==='attack'));assert.deepEqual(final.map(batch=>batch.length),[2]);assert.deepEqual(plan.orders.map(order=>order.entities?.length),[64,1]);assert.equal(plan.validation,'indeterminate');
});
test('publicly impossible contextual candidates fall back, then final shared assignment failures stay rejected',async()=>{
 const env=environment();env.supports=(_entity,command)=>['capture','attack'].includes(command.kind);env.validate=undefined;
 const rounds:string[][]=[];env.validateCandidates=orders=>{rounds.push(orders.map(order=>order.kind!));return orders.map(order=>order.kind==='capture'?{accepted:false,code:'invalid_capture_target'}:{accepted:true,code:'indeterminate'})};env.validateBatch=orders=>orders.map(()=>({accepted:true,code:'indeterminate'}));
 const plan=await planContextCommand([1,2],{kind:'entity',id:90},env);assert.deepEqual(rounds,[['capture','capture'],['attack','attack']]);assert.equal(plan.orders.length,1);assert.equal(plan.orders[0].kind,'attack');
 env.snapshot.entities.find(entity=>entity.id===6)!.complete=false;env.supports=()=>true;env.validateCandidates=orders=>orders.map(()=>({accepted:true,code:'ok'}));env.validateBatch=orders=>orders.map((_,index)=>({accepted:index===0,code:index===0?'ok':'builder_assigned'}));
 const resume=await planContextCommand([1,3],{kind:'entity',id:6},env);assert.equal(resume.orders.length,1);assert.equal(resume.orders[0].kind,'resume');assert.equal(resume.issues[0].code,'builder_assigned');
});
test('candidate and final batch waits both discard stale selection without sending or mutating intentions',async()=>{
 for(const phase of ['candidates','final']){
  const env=environment();let current=true,release!:(values:CommandLegality[])=>void;env.isCurrent=()=>current;env.validate=undefined;
  env.validateCandidates=orders=>phase==='candidates'?new Promise(resolve=>release=resolve):orders.map(()=>({accepted:true,code:'ok'}));
  env.validateBatch=()=>new Promise(resolve=>release=resolve);
  const pending=planContextCommand([1],{kind:'ground',position:{x:3000,y:3000}},env);
  // Context shape preparation is async but performs no I/O.
  for(let i=0;i<20&&!release;i++)await Promise.resolve();assert.ok(release);
  current=false;release([{accepted:true,code:'ok'}]);const canceled=await pending;assert.equal(canceled.orders.length,0);assert.equal(canceled.issues[0].code,'targeting_changed');
 }
});
