import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EntitySchema,MemorySchema} from '../../src/protocol/frontline_pb';
import {BattlefieldSelection,currentVisibleEntity,selectableOwnEntities,escapeIntent,latestAlertCenter,sameSelection} from '../../src/runtime/interaction';

const entity=(id:number,type='US.rifle',x=id*10,owner=1)=>create(EntitySchema,{id,type,owner,position:{x,y:10},health:1000,private:owner===1?{hp:100n,maxHp:100n}:undefined});
const frame=()=>create(PlayerSnapshotSchema,{player:1,tick:10,entities:[entity(1),entity(2),entity(3,'US.tank',30),entity(4,'US.rifle',1000),entity(90,'IR.rifle',20,2)],memory:[{id:99,type:'IR.hq',position:{x:25,y:10}}]});
const projection=(unit:{position?:{x:number;y:number}})=>unit.position?{left:unit.position.x-2,right:unit.position.x+2,top:unit.position.y-2,bottom:unit.position.y+2}:undefined;

test('command selection uses owned live entities while clicks can inspect current enemies',()=>{
 const snapshot=frame();
 snapshot.entities.push(entity(5));snapshot.entities.at(-1)!.private!.container=7;
 snapshot.entities.push(entity(6));snapshot.entities.at(-1)!.private!.hp=0n;
 snapshot.entities.push(entity(7));snapshot.entities.at(-1)!.private!.hp=1n;snapshot.entities.at(-1)!.health=0;
 assert.deepEqual(selectableOwnEntities(snapshot,unit=>unit.id!==3).map(unit=>unit.id),[1,2,4,7]);
 assert.equal(currentVisibleEntity(snapshot,99),undefined);
 const selection=new BattlefieldSelection();selection.reconcile(snapshot,'match-a');
 selection.click(1);selection.click(2,true);assert.deepEqual(selection.ids,[1,2]);
 selection.click(1,true);assert.deepEqual(selection.ids,[2]);
 selection.click(90,true);assert.deepEqual(selection.ids,[90]);
 selection.click(99);assert.deepEqual(selection.ids,[]);
 const copy=structuredClone(snapshot);copy.player=0;assert.deepEqual(selectableOwnEntities(copy),[]);
});

test('single clicks inspect visible foreign units and buildings without mixing owned selections',()=>{
 const snapshot=frame(),selection=new BattlefieldSelection();
 snapshot.entities.push(entity(91,'IR.hq',200,2));
 selection.reconcile(snapshot,'match-a');selection.apply([1,2]);
 selection.click(90);assert.deepEqual(selection.ids,[90]);assert.deepEqual(selection.center(),{x:20,y:10});
 selection.click(91,true);assert.deepEqual(selection.ids,[91]);assert.deepEqual(selection.center(),{x:200,y:10});
 assert.deepEqual(selection.subgroups(),[]);
 selection.click(1,true);assert.deepEqual(selection.ids,[1]);
 selection.click(90);selection.apply([2,90],'add');assert.deepEqual(selection.ids,[2]);
 selection.apply([90,91]);assert.deepEqual(selection.ids,[]);
 selection.click(90);selection.sameTypeOnScreen(90,{left:0,top:0,right:500,bottom:100},projection);
 assert.deepEqual(selection.ids,[90]); // Same-type cannot expand a foreign inspection.
 selection.box({left:0,top:0,right:500,bottom:100},projection,true);assert.deepEqual(selection.ids,[1,2,3]);
 selection.click(90);selection.click(99);assert.deepEqual(selection.ids,[]);assert.equal(selection.center(),undefined);
});

test('inspection never stores foreign entities in control groups or adds them on recall',()=>{
 const selection=new BattlefieldSelection();selection.reconcile(frame(),'match-a');
 selection.apply([1,2]);selection.storeGroup(1);
 selection.click(90);selection.storeGroup(2);assert.deepEqual(selection.group(2),[]);
 selection.storeGroup(1,true);assert.deepEqual(selection.group(1),[1,2]);
 assert.deepEqual(selection.recallGroup(1,1000,true).ids,[1,2]);
 selection.click(90);assert.deepEqual(selection.recallGroup(2,2000).ids,[]);
});

test('inspection follows current disclosed positions and expires when disclosure or life is lost',()=>{
 const selection=new BattlefieldSelection(),snapshot=frame();selection.reconcile(snapshot,'match-a');selection.click(90);
 const token=selection.token;
 snapshot.entities.find(unit=>unit.id===90)!.position!.x=42;
 selection.reconcile(snapshot,'match-a');assert.deepEqual(selection.ids,[90]);assert.deepEqual(selection.center(),{x:42,y:10});
 assert.ok(sameSelection(token,selection.token));
 snapshot.entities=snapshot.entities.filter(unit=>unit.id!==90);
 snapshot.memory.push(create(MemorySchema,{id:90,type:'IR.rifle',position:{x:42,y:10}}));
 selection.reconcile(snapshot,'match-a');assert.deepEqual(selection.ids,[]);assert.equal(selection.center(),undefined);
 assert.ok(!sameSelection(token,selection.token));selection.click(90);assert.deepEqual(selection.ids,[]);
 for(const modify of [
  (unit:ReturnType<typeof entity>)=>{unit.health=0},
  (unit:ReturnType<typeof entity>)=>{unit.position=undefined},
  (unit:ReturnType<typeof entity>)=>{unit.private={...entity(1).private!,hp:0n}},
  (unit:ReturnType<typeof entity>)=>{unit.private={...entity(1).private!,container:1}},
 ]){
  const current=frame();selection.reconcile(current,'match-a');selection.click(90);
  modify(current.entities.find(unit=>unit.id===90)!);selection.reconcile(current,'match-a');assert.deepEqual(selection.ids,[]);
  selection.click(90);assert.deepEqual(selection.ids,[]);
 }
});

test('inspection clears on ownership, perspective and session changes rather than becoming a command selection',()=>{
 const selection=new BattlefieldSelection();
 for(const change of ['ownership','perspective','session']){
  const snapshot=frame();selection.reconcile(snapshot,'match-a');selection.click(90);const token=selection.token;
  if(change==='ownership')snapshot.entities.find(unit=>unit.id===90)!.owner=1;
  if(change==='perspective')snapshot.player=2;
  selection.reconcile(snapshot,change==='session'?'match-b':'match-a');
  assert.deepEqual(selection.ids,[]);assert.ok(!sameSelection(token,selection.token));
 }
 const snapshot=frame();selection.reconcile(snapshot,'match-a');selection.click(1);
 snapshot.entities[0].owner=2;selection.reconcile(snapshot,'match-a');assert.deepEqual(selection.ids,[]);
});

test('box and same-type screen selection preserve shift add/remove semantics without selecting fog memory',()=>{
 const snapshot=frame(),selection=new BattlefieldSelection();selection.reconcile(snapshot,'match-a');
 selection.box({left:24,top:20,right:0,bottom:0},projection);assert.deepEqual(selection.ids,[1,2]);
 selection.box({left:0,top:0,right:24,bottom:20},projection,true);assert.deepEqual(selection.ids,[]);
 selection.click(3);selection.box({left:0,top:0,right:24,bottom:20},projection,true);assert.deepEqual(selection.ids,[1,2,3]);
 selection.sameTypeOnScreen(1,{left:0,top:0,right:100,bottom:100},projection);assert.deepEqual(selection.ids,[1,2]);
 selection.click(3,true);assert.deepEqual(selection.subgroups(),[{type:'US.rifle',ids:[1,2]},{type:'US.tank',ids:[3]}]);
 assert.throws(()=>selection.box({left:NaN,top:0,right:100,bottom:100},projection));
});

test('control groups prune removed/captured units, retain embarked members and center only on deliberate double tap',()=>{
 const selection=new BattlefieldSelection(350),snapshot=frame();selection.reconcile(snapshot,'match-a');
 selection.apply([1,2,3]);selection.storeGroup(1);selection.clear();
 assert.deepEqual(selection.recallGroup(1,1000),{ids:[1,2,3]});
 assert.deepEqual(selection.recallGroup(1,1200),{ids:[1,2,3],center:{x:20,y:10}});
 assert.deepEqual(selection.recallGroup(1,2000),{ids:[1,2,3]});
 snapshot.entities=snapshot.entities.filter(unit=>unit.id!==1);
 snapshot.entities.find(unit=>unit.id===2)!.owner=2;
 snapshot.entities.find(unit=>unit.id===3)!.private!.container=8;
 selection.reconcile(snapshot,'match-a');assert.deepEqual(selection.group(1),[3]);assert.deepEqual(selection.ids,[]);
 assert.deepEqual(selection.recallGroup(1,3000).ids,[]);
 snapshot.entities.find(unit=>unit.id===3)!.private!.container=0;
 selection.reconcile(snapshot,'match-a');assert.deepEqual(selection.recallGroup(1,4000).ids,[3]);
 selection.reconcile(frame(),'match-b');assert.deepEqual(selection.group(1),[]);assert.deepEqual(selection.ids,[]);
 assert.throws(()=>selection.storeGroup(0));assert.throws(()=>selection.recallGroup(10,0));
});

test('selection tokens change with composition, perspective and session but not with ordinary movement',()=>{
 const selection=new BattlefieldSelection(),snapshot=frame();selection.reconcile(snapshot,'match-a');selection.click(1);
 const before=selection.token;snapshot.entities[0].position!.x=40;selection.reconcile(snapshot,'match-a');assert.ok(sameSelection(before,selection.token));
 const external=selection.ids;external.push(999);assert.deepEqual(selection.ids,[1]);
 selection.click(2,true);assert.ok(!sameSelection(before,selection.token));
 snapshot.player=2;selection.reconcile(snapshot,'match-a');assert.deepEqual(selection.ids,[]);assert.ok(!sameSelection(before,selection.token));
});

test('escape and actionable alerts return camera/menu intentions without changing selection',()=>{
 assert.equal(escapeIntent({targeting:true,modal:true}),'cancel-targeting');
 assert.equal(escapeIntent({targeting:false,dragging:true,modal:true}),'cancel-drag');
 assert.equal(escapeIntent({targeting:false,modal:true}),'close-modal');
 assert.equal(escapeIntent({targeting:false}),'open-pause');
 assert.equal(escapeIntent({targeting:true,textEntry:true}),'none');
 const alerts=[{id:'old',tick:1,actionable:true,position:{x:1,y:2}},{id:'new',tick:10,actionable:true,position:{x:3,y:4}},{id:'ignored',tick:20,actionable:false,position:{x:9,y:9}}];
 const center=latestAlertCenter(alerts);assert.deepEqual(center,{id:'new',position:{x:3,y:4}});center!.position.x=900;assert.equal(alerts[1].position.x,3);
});
