import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EntitySchema} from '../../src/protocol/frontline_pb';
import {EnvironmentKnowledge} from '../../src/render/environment-state';
import {authoredArtId} from '../../src/render/art-id';
import {actorSpriteState} from '../../src/render/poses';
import type {GameMap} from '../../src/runtime';
import type {SpriteState} from '../../src/render/art';
const map:GameMap={id:'environment-test',version:'1',title:'Synthetic environment',author:'test',format_version:1,ruleset:'standard-v2',width:32,height:32,tiles:Array.from({length:1024},()=>({terrain:'open'})),spawns:[],fields:[{id:1,position:{x:5500,y:5500},credits:1000}],stations:[{id:2,position:{x:10500,y:10500}}],shipment:{x:15500,y:15500},objects:[{id:90,class:'light_prop',position:{x:8500,y:8500}}]};
const frame=(tick=1,visible=true)=>create(PlayerSnapshotSchema,{tick,player:1,visible:Array(1024).fill(visible),explored:Array(1024).fill(true)});

test('public explored locations never invent initial cargo or station ownership',()=>{
 const knowledge=new EnvironmentKnowledge(map),items=knowledge.sync(frame(1,false));
 assert.equal(items.find(i=>i.kind==='field')?.state,'unknown');assert.equal(items.find(i=>i.kind==='station')?.owner,undefined);assert(items.every(i=>i.remembered));
 assert.equal(items.find(i=>i.kind==='shipment')?.asset,'prop.central_shipment_site');
 const unobserved=frame(2,false);unobserved.explored.fill(false);assert(knowledge.sync(unobserved).every(i=>!i.visible));
});

test('only disclosed field and station facts update presentation memory; hidden changes do not',()=>{
 const k=new EnvironmentKnowledge(map),s=frame();s.fields.push({$typeName:'frontline.v1.Field',id:1,position:{$typeName:'frontline.v1.Vec',x:5500,y:5500},remaining:249n});s.stations.push({$typeName:'frontline.v1.Station',id:5,position:{$typeName:'frontline.v1.Vec',x:10500,y:10500},owner:1});
 let values=k.sync(s);assert.equal(values.filter(i=>i.kind==='station').length,1);assert.equal(values.find(i=>i.kind==='station')?.id,5);assert.equal(values.find(i=>i.kind==='field')?.state,'low');assert.equal(values.find(i=>i.kind==='station')?.owner,1);
 const hidden=frame(2,false);hidden.fields.push({...s.fields[0],remaining:0n});hidden.stations.push({...s.stations[0],owner:2});values=k.sync(hidden);
 assert.equal(values.find(i=>i.kind==='field')?.remaining,249n);assert.equal(values.find(i=>i.kind==='station')?.owner,1);assert(values.every(i=>i.remembered));
 s.tick=3;s.fields[0].remaining=0n;s.stations[0].owner=2;values=k.sync(s);assert.equal(values.find(i=>i.kind==='field')?.state,'depleted');assert.equal(values.find(i=>i.kind==='station')?.owner,2);
});

test('dynamic shipment cargo follows real fields and coalesces old depleted shipments without timers',()=>{
 const k=new EnvironmentKnowledge(map),s=frame(),p={$typeName:'frontline.v1.Vec' as const,...map.shipment};
 assert.equal(k.sync(s).filter(i=>i.key.startsWith('field-at:')).length,0);
 s.tick++;s.fields.push({$typeName:'frontline.v1.Field',id:2,position:p,remaining:0n},{$typeName:'frontline.v1.Field',id:3,position:p,remaining:6000000n});let items=k.sync(s).filter(i=>i.key.startsWith('field-at:'));
 assert.equal(items.length,1);assert.equal(items[0].id,3);assert.equal(items[0].state,'high');assert.equal(items[0].remaining,6000000n);
 s.tick++;s.fields[1].remaining=0n;items=k.sync(s).filter(i=>i.key.startsWith('field-at:'));assert.equal(items.length,1);assert.equal(items[0].state,'depleted');
 s.tick++;s.fields.push({$typeName:'frontline.v1.Field',id:4,position:p,remaining:6000000n});assert.equal(k.sync(s).find(i=>i.key.startsWith('field-at:'))?.id,4);
});

test('rubble requires explicit selected-player disclosure and disappears exactly on rewind or perspective change',()=>{
 const k=new EnvironmentKnowledge(map),s=frame(10);assert(!k.sync(s).some(i=>i.kind==='rubble'));s.rubble=[90];let items=k.sync(s);assert.equal(items.find(i=>i.kind==='rubble')?.asset,'prop.destructible_wall_hp_light');assert.equal(items.find(i=>i.kind==='rubble')?.state,'destroyed');
 s.fields.push({$typeName:'frontline.v1.Field',id:1,position:{$typeName:'frontline.v1.Vec',...map.fields[0].position},remaining:1n});k.sync(s);
 items=k.sync(frame(2,false));assert(!items.some(i=>i.kind==='rubble'));assert.equal(items.find(i=>i.kind==='field')?.state,'unknown');
 s.player=2;s.tick=20;s.rubble=[];s.fields=[];items=k.sync(s);assert.equal(items.find(i=>i.kind==='field')?.state,'unknown');assert(!items.some(i=>i.kind==='rubble'));
});

test('object art uses explicit legal classes and actual health/destruction independently of neutral enabled status',()=>{
 assert.equal(authoredArtId('map.energy_station'),'prop.supply_station_neutral');
 const states=new Map(['intact','damaged','destroyed'].map(name=>[name,{name,part:'prop',frames:1,directions:4,fps:0,loop:true} satisfies SpriteState]));
 for(const type of ['map.light_prop','map.heavy_prop','map.garrison']){const e=create(EntitySchema,{type,complete:true,enabled:false,health:1000,state:'idle'});assert.equal(actorSpriteState(e,undefined,false,states)?.name,'intact');e.health=500;assert.equal(actorSpriteState(e,undefined,false,states)?.name,'damaged');e.state='destroyed';assert.equal(actorSpriteState(e,undefined,false,states)?.name,'destroyed')}
});
