import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,EntityPrivateSchema,EventSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {AmbientTimeline} from '../../src/app/ambient-presentation';
import type {Entity,PlayerSnapshot} from '../../src/runtime';

const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8'))),map={width:16,height:16};
const actor=(id:number,type:string,extra:Partial<Entity>={})=>({...create(EntitySchema,{id,type,owner:1,health:1000,position:{x:4000,y:5000},complete:true,enabled:true}),...extra});
const event=(id:number,kind:string,extra:Partial<PlayerSnapshot['events'][number]>={})=>({...create(EventSchema,{id,kind,tick:101,owner:1,entity:9,scope:'owner',position:{x:4000,y:5000}}),...extra});
function snapshot(tick=100,entities:Entity[]=[]):PlayerSnapshot{return create(PlayerSnapshotSchema,{tick,player:1,entities,visible:Array(256).fill(true),players:[{id:1,team:1},{id:2,team:2},{id:3,team:1}]})}
const ids=(timeline:AmbientTimeline)=>timeline.values.map(cue=>cue.effect).sort();

test('all twelve ambient effects come from current disclosed state or an exact transition',()=>{
 const timeline=new AmbientTimeline(map),entities=[actor(1,'US.tank',{health:500}),actor(2,'US.car',{health:250}),actor(3,'power',{health:500}),actor(4,'hq',{health:250}),actor(5,'factory',{complete:false,progress:100,health:100}),actor(6,'US.gunship'),actor(7,'US.rifle',{health:100}),actor(9,'US.tank')];
 const before=snapshot(100,entities);before.fields=[{...create(PlayerSnapshotSchema,{fields:[{id:1,position:{x:4000,y:5000},remaining:1000n}]}).fields[0]}];timeline.sync(before,catalog);
 const after=snapshot(101,entities.filter(e=>e.id!==9).map(e=>e.id===1?{...e,position:{...e.position!,x:4100,y:5000}}:e.id===5?{...e,progress:103}:e));
 after.fields=[{...before.fields[0],remaining:0n}];after.events=[event(1,'building_sold'),event(2,'shipment_arrived',{owner:0,scope:'all'}),event(3,'station_captured',{scope:'visible'}),event(4,'destroyed')];
 const untouched=structuredClone(after);timeline.sync(after,catalog);
 assert.deepEqual(ids(timeline),[
  'fx.unit.dust_trail','fx.unit.rotor_wash','fx.unit.smoke_damaged','fx.unit.fire_critical','fx.unit.wreck_smoke',
  'fx.building.sell_dust','fx.building.fire_damaged','fx.building.smoke_critical','fx.building.construction_dust',
  'fx.environment.depletion_dust','fx.environment.shipment_arrival','fx.environment.supply_station_capture',
 ].sort());
 assert.equal(timeline.values.find(cue=>cue.effect==='fx.unit.rotor_wash')?.maxAltitude,48);
 assert(!timeline.values.some(cue=>cue.anchor===7),'infantry never gain vehicle fires');
 assert.deepEqual(after,untouched);
});

test('movement and building work stop on actual stagnation; paused tick preserves phases and transitions once',()=>{
 const timeline=new AmbientTimeline(map),before=snapshot(100,[actor(1,'US.tank'),actor(2,'factory',{complete:false,progress:10})]);timeline.sync(before,catalog);
 const working=snapshot(101,[{...before.entities[0],position:{...before.entities[0].position!,x:4100,y:5000}},{...before.entities[1],progress:11}]);working.events=[event(1,'building_sold')];timeline.sync(working,catalog);assert.equal(timeline.values.length,3);
 const frozen=structuredClone(timeline.values);timeline.sync(working,catalog);assert.deepEqual(timeline.values,frozen);
 timeline.sync({...working,tick:102},catalog);assert.deepEqual(ids(timeline),['fx.building.sell_dust']);
 timeline.sync({...working,tick:103,entities:[{...working.entities[0],position:{...working.entities[0].position!,x:14000,y:5000}}]},catalog);assert.deepEqual(ids(timeline),['fx.building.sell_dust'],'teleport is not a movement plume');
});

test('baseline, replacement, perspective, rewind and long gaps suppress historical bursts and depletion',()=>{
 for(const scenario of ['baseline','replace','perspective','rewind','gap']){
  const timeline=new AmbientTimeline(map),before=snapshot(100,[actor(1,'US.tank',{health:400})]);
  if(scenario!=='baseline'){timeline.sync(before,catalog);timeline.sync({...before,tick:101,events:[event(1,'building_sold')]},catalog)}
  const next={...before,tick:scenario==='rewind'?90:scenario==='gap'?150:102,player:scenario==='perspective'?2:1,events:[event(2,'building_sold',{tick:scenario==='rewind'?90:102})]};
  timeline.sync(next,catalog,scenario==='replace');assert.deepEqual(ids(timeline),['fx.unit.smoke_damaged'],scenario);
  timeline.sync(next,catalog);assert.deepEqual(ids(timeline),['fx.unit.smoke_damaged'],scenario+' repeated');
 }
});

test('lost, dead, contained, recovered and replaced actors cannot retain their looping cosmetics',()=>{
 for(const replacement of [undefined,actor(1,'US.tank',{health:0}),actor(1,'US.tank',{health:100}),actor(1,'US.tank',{health:400,private:create(EntityPrivateSchema,{container:20})}),actor(1,'US.rifle',{health:400})]){
  const timeline=new AmbientTimeline(map);timeline.sync(snapshot(100,[actor(1,'US.tank',{health:400})]),catalog);assert.equal(timeline.values.length,1);
  const next=snapshot(101,replacement?[replacement]:[]);timeline.sync(next,catalog);
  assert.equal(timeline.values.length,replacement?.health===100?1:0);
  if(replacement?.health===100)assert.equal(ids(timeline)[0],'fx.unit.fire_critical');
  timeline.sync(snapshot(102,[actor(1,'US.tank')]),catalog);assert.equal(timeline.values.length,0);
 }
});

test('depletion requires consecutive visible matching fields, never zero on first sight or a hidden transition',()=>{
 for(const change of ['valid','new','hidden-before','hidden-after','moved','removed']){
  const timeline=new AmbientTimeline(map),before=snapshot();before.fields=create(PlayerSnapshotSchema,{fields:[{id:1,remaining:500n,position:{x:4000,y:5000}}]}).fields;
  if(change==='hidden-before')before.visible.fill(false);if(change==='new')before.fields=[];timeline.sync(before,catalog);
  const after=snapshot(101);after.fields=create(PlayerSnapshotSchema,{fields:[{id:1,remaining:0n,position:{x:change==='moved'?6000:4000,y:5000}}]}).fields;
  if(change==='hidden-after')after.visible.fill(false);if(change==='removed')after.fields=[];timeline.sync(after,catalog);assert.equal(timeline.values.length,change==='valid'?1:0,change);
 }
});

test('event scopes, high water, future timestamps, bounded expiry and unknown aircraft crashes fail closed',()=>{
 const timeline=new AmbientTimeline(map);timeline.sync(snapshot(100,[actor(9,'US.fighter')]),catalog);
 const s=snapshot(101);s.events=[event(1,'destroyed'),event(2,'building_sold',{owner:2}),event(3,'station_captured',{scope:'team',owner:2}),event(4,'shipment_arrived',{scope:'other'}),event(999,'shipment_arrived',{tick:103}),event(5,'building_sold',{id:NaN}),event(6,'station_captured',{scope:'team',owner:3}),event(7,'shipment_arrived',{scope:'all',owner:0})];
 timeline.sync(s,catalog);assert.deepEqual(ids(timeline),['fx.environment.shipment_arrival','fx.environment.supply_station_capture']);
 timeline.sync({...s,tick:102,events:[event(8,'building_sold',{tick:102})]},catalog);assert.equal(timeline.values.length,3,'future id did not advance the watermark');
 timeline.sync({...s,tick:136,events:[]},catalog);assert.equal(timeline.values.length,3);
 timeline.sync({...s,tick:137,events:[]},catalog);assert.equal(timeline.values.length,2);
 timeline.sync({...s,tick:138,events:[]},catalog);assert.equal(timeline.values.length,1);
 timeline.sync({...s,tick:141,events:[]},catalog);assert.equal(timeline.values.length,0);
});

test('wreck smoke needs the identified immediately prior ground vehicle and ends on visibility loss',()=>{
 const timeline=new AmbientTimeline(map);timeline.sync(snapshot(100,[actor(9,'US.tank')]),catalog);
 const s=snapshot(101);s.events=[event(1,'destroyed')];timeline.sync(s,catalog);assert.deepEqual(ids(timeline),['fx.unit.wreck_smoke']);
 timeline.sync({...s,tick:102,visible:Array(256).fill(false)},catalog);assert.equal(timeline.values.length,0);
 timeline.sync({...s,tick:103},catalog);assert.equal(timeline.values.length,0,'re-observation does not resurrect expired visibility-bound smoke');
});
