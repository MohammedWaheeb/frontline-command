import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {actorSpriteState,actorEventStates,buildingPresentations,visibleSquadMembers} from '../../src/render/poses';
import type {SpriteState} from '../../src/render/art';
import {CatalogIndex,type CatalogUnit,type CatalogBuilding} from '../../src/content/catalog';
const names=['idle','complete','move','work_heal','work_repair','work_capture','channel','doors_open','work_unload','deploy','pack','low_power','damaged','deployed','wreck'];
const states=new Map(names.map(name=>[name,{name,part:'whole',directions:8,frames:4,fps:8,loop:true} satisfies SpriteState]));
test('final interceptor launch uses an empty rack only for disclosed owned charges',()=>{
 const e=create(EntitySchema,{private:{charges:0}});
 assert.deepEqual(actorEventStates('interceptor_fired',e,true),['launch_empty','launch']);
 assert.deepEqual(actorEventStates('interceptor_fired',e,false),['launch']);
 assert.deepEqual(actorEventStates('interceptor_fired',{...e,private:undefined},true),['launch']);
 e.private!.charges=1;assert.deepEqual(actorEventStates('interceptor_fired',e,true),['launch']);
 assert.deepEqual(actorEventStates('weapon_fired',e,true),['fire','volley','launch']);
 assert.equal(actorEventStates('impact',e,true),undefined);
});
test('owned structural battery art preserves priority and known charge count with legacy fallback',()=>{
 const art=new Map(['idle','damaged','critical','disabled','lowpower',...['damaged','critical','disabled','lowpower'].flatMap(state=>[`${state}_charges_0`,`${state}_charges_1`])].map(name=>[name,{name,part:'building',directions:1,frames:1,fps:0,loop:false} satisfies SpriteState]));
 for(const [state,patch] of [['damaged',{health:450}],['critical',{health:200}],['disabled',{enabled:false}],['lowpower',{}]] as const){
  for(const charges of [0,1]){
   const e=create(EntitySchema,{type:'interceptor_battery',health:1000,complete:true,enabled:true,private:{charges},...patch});
   const context={role:'abm',owned:true,lowPower:true,serviceActive:false};
   assert.equal(actorSpriteState(e,undefined,false,art,context)?.name,`${state}_charges_${charges}`);
   assert.equal(actorSpriteState(e,undefined,false,art,{...context,owned:false})?.name,state);
   const old=new Map(art);old.delete(`${state}_charges_${charges}`);assert.equal(actorSpriteState(e,undefined,false,old,context)?.name,state);
  }
 }
});
test('cosmetic squad casualties follow only disclosed health and restore with healing',()=>{
 assert.deepEqual([1000,751,750,501,500,251,250,1,0].map(h=>visibleSquadMembers(h,4)),[4,4,3,3,2,2,1,1,0]);
 assert.equal(visibleSquadMembers(100,1),1);assert.equal(visibleSquadMembers(2000,4),4);assert.equal(visibleSquadMembers(-1,4),0);
});
function pose(state:string,role='rifle',extra:Record<string,unknown>={}){const entity=create(EntitySchema,{id:1,type:'US.'+role,state,complete:true,enabled:true,health:1000,...extra});return actorSpriteState(entity,{role,armor:'infantry'} as CatalogUnit,false,states)?.name}
test('authoritative support and channel names select their authored work animation',()=>{assert.equal(pose('repairing','medic'),'work_heal');assert.equal(pose('repairing','engineer'),'work_repair');assert.equal(pose('designate','recon'),'channel');assert.equal(pose('beacon','recon'),'channel');assert.equal(pose('unload','apc'),'doors_open');assert.equal(pose('unloading','hauler'),'work_unload');assert.equal(pose('capturing','engineer'),'work_capture');assert.equal(pose('capture_exit_blocked','engineer'),'idle')});
test('deployment, packing and damage cannot disappear behind ordinary idle art',()=>{assert.equal(pose('deploying','mobile_abm',{progress:500}),'deploy');assert.equal(pose('packing','mobile_abm',{progress:500}),'pack');assert.equal(pose('deployed','mobile_abm',{deployed:true}),'deployed');assert.equal(pose('low_power','power'),'low_power');const building=create(EntitySchema,{type:'power',state:'idle',complete:true,enabled:true,health:300});assert.equal(actorSpriteState(building,undefined,false,states)?.name,'damaged');assert.equal(pose('destroyed','rifle',{enabled:false}),'wreck')});

test('boarding receiver context opens only authored doors and blocked unloading keeps them open',()=>{
 const entity=create(EntitySchema,{id:1,type:'US.apc',state:'idle',complete:true,enabled:true,health:1000});
 const choose=(patch:Partial<typeof entity>={},receiving=true,art=states)=>actorSpriteState({...entity,...patch},{role:'apc',armor:'light'} as CatalogUnit,false,art,undefined,0,receiving)?.name;
 assert.equal(choose(),'doors_open');assert.equal(choose({},false),'idle');
 assert.equal(choose({state:'unload_exit_blocked'},false),'doors_open');
 assert.equal(choose({state:'destroyed'}),'wreck');assert.equal(choose({enabled:false}),'damaged');assert.equal(choose({health:300}),'damaged');
 const withoutDoors=new Map(states);withoutDoors.delete('doors_open');assert.equal(choose({},true,withoutDoors),'idle');
 const building={role:'safehouse',lowPower:false,serviceActive:false},buildingArt=new Map(states);buildingArt.set('exit_open',{name:'exit_open',part:'building',directions:1,frames:4,fps:8,loop:true});
 assert.equal(actorSpriteState({...entity,type:'SY.safehouse',state:'unload_exit_blocked'},undefined,false,buildingArt,building)?.name,'exit_open');
 assert.equal(actorSpriteState({...entity,type:'SY.safehouse'},undefined,false,buildingArt,building,0,true)?.name,'exit_open');
 assert.equal(actorSpriteState({...entity,type:'SY.safehouse',health:300},undefined,false,buildingArt,building,0,true)?.name,'damaged');
});

test('building animations follow known power and service facts without disclosing enemy assignments',()=>{
 const catalog=new CatalogIndex({version:'test',units:[],weapons:[],upgrades:[],buildings:[{id:'airfield',role:'airfield'},{id:'abm',role:'abm'},{id:'strategic',role:'strategic'}] as CatalogBuilding[]});
 const snapshot=create(PlayerSnapshotSchema,{player:1,economy:{powerDemand:200,powerCapacity:100},players:[{id:1,strategicProgress:500},{id:2,strategicProgress:1000}],entities:[
  {id:1,type:'airfield',owner:1},{id:2,type:'airfield',owner:2},{id:3,type:'airfield',owner:3},
  {id:4,type:'US.strike',owner:1,landed:true,state:'servicing',private:{home:1}},
  {id:5,type:'IR.strike',owner:2,landed:true,state:'servicing'},
  {id:6,type:'strategic',owner:2},{id:7,type:'abm',owner:2}
 ]});
 const known=buildingPresentations(snapshot,catalog);
 assert.equal(known.get(1)?.lowPower,true);assert.equal(known.get(1)?.serviceActive,true);
 for(const id of [2,3,6,7]){assert.equal(known.get(id)?.lowPower,false);assert.equal(known.get(id)?.serviceActive,false)}
 assert.equal(known.get(6)?.strategicProgress,1000);
 const art=new Map(['idle','lowpower','critical','damaged','disabled','produce','service_active','charges_0','charges_1','charges_2','charging','ready','garrisoned','rubble','construct','sell'].map(name=>[name,{name,part:'building',frames:8,directions:1,fps:0,loop:true} satisfies SpriteState]));
 const actor=create(EntitySchema,{id:1,type:'airfield',owner:1,complete:true,enabled:true,health:1000,state:'idle'});
 const choose=(patch:Partial<typeof actor>={},context=known.get(1))=>actorSpriteState({...actor,...patch},undefined,false,art,context)?.name;
 assert.equal(choose(),'lowpower');assert.equal(choose({health:500}),'damaged');assert.equal(choose({health:250}),'critical');assert.equal(choose({enabled:false}),'disabled');assert.equal(choose({state:'selling',progress:500}),'sell');
 assert.equal(choose({state:'producing'},known.get(2)),'produce');
 assert.equal(choose({}, {...known.get(1)!,lowPower:false}),'service_active');
 assert.equal(choose({},known.get(6)),'ready');assert.equal(choose({}, {...known.get(6)!,strategicProgress:500}),'charging');
 assert.equal(choose({},known.get(7)),'idle');
 assert.equal(choose({private:create(EntitySchema,{private:{charges:1}}).private},known.get(7)),'charges_1');
});
