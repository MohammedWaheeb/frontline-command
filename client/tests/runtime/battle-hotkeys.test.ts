import test from 'node:test';
import assert from 'node:assert/strict';
import {create,type MessageInitShape} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import type {Entity} from '../../src/runtime/types';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {planCommand} from '../../src/runtime/command-intent';
import {armyIDs,baseIDs,idleWorkerIDs,scatterRequests} from '../../src/app/battle-hotkeys';

const catalog=new CatalogIndex({version:'test',units:[
 ...['tank','hauler','engineer','rig','repair','medic','support_plane'].map(role=>({id:role,role,speed:1000,weapon:'gun'})),
 {id:'scout',role:'scout_drone',speed:1000,weapon:''},
 {id:'beacon',role:'beacon',speed:0,weapon:''},
],buildings:[{id:'hq',role:'hq'},{id:'outpost',role:'outpost'},{id:'factory',role:'factory'}],weapons:[],upgrades:[]} as unknown as Catalog);
function unit(id:number,type='tank',patch:MessageInitShape<typeof EntitySchema>={}){
 const init:MessageInitShape<typeof EntitySchema>={id,type,owner:1,complete:true,enabled:true,state:'idle',position:{x:5000,y:5000},private:{hp:100n}};
 return create(EntitySchema,Object.assign(init,patch));
}
function snapshot(entities:Entity[]){return create(PlayerSnapshotSchema,{player:1,tick:100,entities})}

test('army selection includes only available owned combat units in stable ID order',()=>{
 const s=snapshot([
  unit(9),unit(1),...['hauler','engineer','rig','repair','medic','support_plane','scout','beacon','hq','unknown'].map((type,i)=>unit(i+20,type)),
  unit(2,'tank',{owner:2}),unit(3,'tank',{private:create(EntitySchema,{private:{hp:0n}}).private}),
  unit(4,'tank',{private:create(EntitySchema,{private:{hp:100n,container:200}}).private}),
  unit(5,'tank',{complete:false}),unit(6,'tank',{enabled:false}),unit(7,'tank',{private:undefined}),
  unit(8,'tank',{private:create(EntitySchema,{private:{hp:100n,shahedCommitted:true}}).private}),
 ]),before=structuredClone(s);
 assert.deepEqual(armyIDs(s,catalog),[1,9]);assert.deepEqual(s,before);
 assert.deepEqual(armyIDs({...s,player:0},catalog),[]);
});

test('army viewport selection uses renderer bounds and excludes missing or invalid projections',()=>{
 const s=snapshot([unit(2),unit(1),unit(3)]),viewport={left:100,top:100,right:200,bottom:200};
 assert.deepEqual(armyIDs(s,catalog,viewport,entity=>entity.id===1?{left:90,top:90,right:105,bottom:105}:entity.id===2?undefined:{left:NaN,top:100,right:150,bottom:150}),[1]);
 s.entities[0].position!.x=150;s.entities[0].position!.y=150;
 assert.deepEqual(armyIDs(s,catalog,viewport),[2]);
});

test('idle worker cycling excludes active gather, cargo delivery, movement, channels and queued work',()=>{
 const states=['gathering','loading','returning_cargo','unloading','moving','turning','blocked','route_blocked'];
 const s=snapshot([unit(5,'engineer'),unit(2,'hauler'),unit(1),unit(14,'rig'),unit(15,'rig',{state:'moving'}),unit(16,'rig',{private:create(EntitySchema,{private:{hp:100n,orders:[{kind:'build'}]}}).private}),
  ...states.map((state,i)=>unit(20+i,'hauler',{state,private:create(EntitySchema,{private:{hp:100n,orders:[{kind:'gather'}]}}).private})),
  unit(3,'hauler',{state:'no_known_supplies',private:create(EntitySchema,{private:{hp:100n,orders:[{kind:'gather'}]}}).private}),
  unit(4,'hauler',{state:'no_supply_center',private:create(EntitySchema,{private:{hp:100n,cargo:600000n,orders:[{kind:'gather'}]}}).private}),
  unit(6,'engineer',{private:create(EntitySchema,{private:{hp:100n,orders:[{kind:'repair'}]}}).private}),
  unit(7,'hauler',{state:'no_known_supplies',private:create(EntitySchema,{private:{hp:100n,orders:[{kind:'gather'},{kind:'move'}]}}).private}),
  unit(8,'hauler',{channelUntil:101}),unit(9,'hauler',{private:create(EntitySchema,{private:{hp:100n,retreating:true}}).private}),
  unit(10,'hauler',{owner:2}),unit(11,'hauler',{enabled:false}),unit(12,'engineer',{private:create(EntitySchema,{private:{hp:100n,container:50}}).private}),
  unit(13,'hauler',{state:'no_supply_center',private:create(EntitySchema,{private:{hp:100n,orders:[{kind:'move'}]}}).private}),
 ]),before=structuredClone(s);
 assert.deepEqual(idleWorkerIDs(s,catalog),[2,3,4,5,14]);assert.deepEqual(s,before);
});

test('base cycling includes living complete HQ and outposts, including disabled bases',()=>{
 const s=snapshot([unit(4,'outpost',{enabled:false}),unit(1,'hq'),unit(2,'factory'),unit(3,'hq',{complete:false}),unit(5,'outpost',{owner:2}),unit(6,'hq',{private:create(EntitySchema,{private:{hp:0n}}).private})]);
 assert.deepEqual(baseIDs(s,catalog),[1,4]);
});

test('scatter creates stable deduplicated integer move requests for owned mobile units only',async()=>{
 const s=snapshot([unit(9),unit(1,'tank',{position:{x:0,y:0}}),unit(3,'hauler',{position:{x:9999,y:9999}}),unit(4,'hq'),unit(5,'support_plane'),unit(6,'beacon'),unit(7,'tank',{owner:2}),unit(8,'tank',{private:create(EntitySchema,{private:{hp:100n,container:50}}).private})]),before=structuredClone(s);
 const requests=scatterRequests(s,[9,1,3,4,5,6,7,8,9],{width:10,height:10},catalog);
 assert.deepEqual(requests.map(request=>request.entities),[[1],[3],[9]]);
 assert.deepEqual(requests,scatterRequests({...s,entities:[...s.entities].reverse()},[3,9,1],{width:10,height:10},catalog));
 assert.deepEqual(requests[0].target,{kind:'ground',position:{x:2000,y:2000}});
 assert.deepEqual(requests[1].target,{kind:'ground',position:{x:9999,y:7999}});
 for(const request of requests){
  assert.equal(request.kind,'move');assert.equal(request.target?.kind,'ground');
  if(request.target?.kind==='ground')for(const value of Object.values(request.target.position)){assert.equal(Number.isInteger(value),true);assert.ok(value>=0&&value<10000)}
 }
 let previews=0;
 for(const request of requests){
  const plan=await planCommand(request,{snapshot:s,supports:()=>true,validate:()=>{previews++;return {accepted:false,code:'blocked'}}});
  assert.equal(plan.orders.length,0);assert.equal(plan.issues[0].code,'blocked');
 }
 assert.equal(previews,3);assert.deepEqual(s,before);
 assert.deepEqual(scatterRequests(s,[1],{width:NaN,height:10},catalog),[]);
 assert.deepEqual(scatterRequests(s,[1],{width:0,height:10},catalog),[]);
});

