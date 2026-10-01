import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {EntitySchema} from '../../src/protocol/frontline_pb';
import {ActorVisual} from '../../src/render/actors';
import type {ArtLibrary,SpriteSheet,SpriteState} from '../../src/render/art';
import type {CatalogIndex} from '../../src/content/catalog';

// Exercise the actual ActorVisual cue/state integration, without a GPU or art
// upload. The state-only sheet isolates priority from asset availability.
const names=['idle','launch','launch_empty','activate','lowpower','lowpower_charges_0','disabled','disabled_charges_0','damaged','damaged_charges_0','critical','critical_charges_0','construct','sell','rubble','charging'];
function fixture(){
 const entity=create(EntitySchema,{id:1,type:'abm',owner:1,position:{x:1000,y:1000},complete:true,enabled:true,health:1000,state:'idle',private:{charges:0}});
 const art={resolve:()=>undefined} as unknown as ArtLibrary;
 const catalog={units:new Map(),buildings:new Map([['abm',{role:'abm'}]])} as unknown as CatalogIndex;
 const actor=new ActorVisual(entity,catalog,art,'US');
 const states=new Map(names.map(name=>[name,{name,part:'building',directions:1,frames:8,fps:['launch','launch_empty','activate'].includes(name)?8:0,loop:false} satisfies SpriteState]));
 const internal=actor as unknown as {sheet:SpriteSheet;state:(now:number)=>SpriteState|undefined};
 internal.sheet={states} as SpriteSheet;
 actor.presentation={role:'abm',owned:true,lowPower:false,serviceActive:false};
 return {actor,choose:(now=150)=>internal.state(now)?.name};
}
test('a new structural condition interrupts a current real ActorVisual launch and cannot revive it',()=>{
 const cases=[
  {name:'low power',patch:{},lowPower:true,want:'lowpower_charges_0'},
  {name:'explicit low power',patch:{state:'low_power'},want:'lowpower_charges_0'},
  {name:'selling',patch:{state:'selling'},want:'sell'},
  {name:'disabled',patch:{enabled:false},want:'disabled_charges_0'},
  {name:'construction',patch:{complete:false},want:'construct'},
  {name:'damage',patch:{health:500},want:'damaged_charges_0'},
  {name:'critical damage',patch:{health:250},want:'critical_charges_0'},
  {name:'destroyed',patch:{state:'destroyed',health:0},want:'rubble'},
 ];
 for(const item of cases){
  const {actor,choose}=fixture(),before=structuredClone(actor.entity);
  actor.cue('interceptor_fired',100,true);assert.equal(choose(120),'launch_empty');
  actor.presentation={...actor.presentation!,lowPower:!!item.lowPower};
  const changed={...before,...item.patch};actor.update(changed,130);
  assert.equal(choose(),item.want,item.name);assert.deepEqual(actor.entity,changed,'Pose choice must not mutate Go facts');
  actor.presentation={...actor.presentation!,lowPower:false};actor.update(before,160);
  assert.equal(choose(180),'idle',item.name+' revived an interrupted launch');
  actor.cue('interceptor_fired',200,true);assert.equal(choose(220),'launch_empty','A genuinely new cue still plays');
  actor.dispose();
 }
});
test('strategic activation respects structural low power while enemy charge privacy stays generic',()=>{
 const {actor,choose}=fixture();actor.presentation={role:'strategic',owned:true,lowPower:false,serviceActive:false,strategicProgress:400};
 actor.cue('strategic_activated',100,true);assert.equal(choose(),'activate');
 actor.presentation={...actor.presentation,lowPower:true};assert.equal(choose(),'lowpower');
 actor.presentation={...actor.presentation,lowPower:false};assert.equal(choose(),'charging');
 actor.presentation={role:'abm',owned:false,lowPower:false,serviceActive:false};actor.entity={...actor.entity,private:undefined};actor.cue('interceptor_fired',200,false);assert.equal(choose(220),'launch');
 actor.dispose();
});
