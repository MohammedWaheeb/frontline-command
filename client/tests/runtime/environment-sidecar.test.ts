import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {decodeMapEnvironment,environmentAssetIds} from '../../src/content/environment';
import {EnvironmentKnowledge} from '../../src/render/environment-state';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import type {GameMap} from '../../src/runtime/types';
const hash='a'.repeat(64),encode=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
function map():GameMap{return {id:'sidecar-test',version:'1',title:'Synthetic',author:'test',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),spawns:[],fields:[],stations:[],shipment:{x:1000,y:1000},objects:[{id:90,class:'garrison',position:{x:26500,y:17500}}]}}
function source(){return {schema:'fc-map-environment/1',map:{id:'sidecar-test',version:'1',sha256:hash},object_skins:[{object_id:90,asset:'prop.ruined_house_garrisonable',direction:2}],placements:[] as {id:string;asset:string;position:{x:number;y:number};direction:number;state:string}[]}}
const decode=(s:unknown,m=map())=>decodeMapEnvironment(encode(s),m,{mapSHA256:hash});
const rejects=(s:unknown,m=map(),code='environment_invalid')=>assert.throws(()=>decode(s,m),(e:unknown)=>!!e&&typeof e==='object'&&'code'in e&&e.code===code);
function region(m:GameMap,terrain:string,sight=false){for(let y=8;y<24;y++)for(let x=8;x<24;x++)m.tiles[y*64+x]={terrain,height:0,sight_blocker:sight}}
const prop=(asset:string,state='idle',direction=0)=>({id:'dressing',asset,position:{x:16000,y:16000},direction,state});

test('environment decoder binds exact map bytes, rejects unsupported data and freezes detached output',()=>{
 const s=source(),e=decode(s);assert.equal(e.object_skins[0].asset,'prop.ruined_house_garrisonable');assert.deepEqual(environmentAssetIds(e),['prop.ruined_house_garrisonable']);s.object_skins[0].asset='invalid';assert.equal(e.object_skins[0].asset,'prop.ruined_house_garrisonable');assert(Object.isFrozen(e)&&Object.isFrozen(e.object_skins[0])&&Object.isFrozen(e.map));
 const bad=source();bad.map.sha256='b'.repeat(64);rejects(bad,map(),'environment_map_mismatch');rejects({...source(),future:true});rejects({...source(),schema:'future'});rejects({...source(),placements:Array(2049).fill(prop('prop.palm'))});
 assert.throws(()=>decodeMapEnvironment(new Uint8Array([0xff]),map(),{mapSHA256:hash}));assert.throws(()=>decodeMapEnvironment(new Uint8Array(1048577),map(),{mapSHA256:hash}));
});

test('skins cannot invent object classes, missing actors, duplicates, factions or state',()=>{
 for(const asset of ['prop.decor_building_nongarrison','prop.destructible_wall_hp_heavy','unit.US.tank']){const s=source();s.object_skins[0].asset=asset;rejects(s)}
 const missing=source();missing.object_skins[0].object_id=99;rejects(missing);const duplicate=source();duplicate.object_skins.push({...duplicate.object_skins[0]});rejects(duplicate);rejects({...source(),object_skins:[{...source().object_skins[0],state:'destroyed'}]});
});

test('solid props need the complete impassable safety area and opaque masses need real sight blocking',()=>{
 const m=map(),s=source();s.placements=[prop('prop.container_stack')];rejects(s,m);region(m,'blocked');rejects(s,m);region(m,'blocked',true);assert.equal(decode(s,m).placements.length,1);
 m.tiles[14*64+14]={terrain:'open',height:0};rejects(s,m);region(m,'cliff');assert(decode(s,m));m.tiles[15*64+15].mandatory=true;rejects(s,m);
 for(const asset of ['prop.palm','prop.fence_chainlink','prop.concrete_barrier','prop.power_pylon','prop.wreck_decor_vehicle']){region(m,'blocked');s.placements=[prop(asset)];assert(decode(s,m))}
 for(const [asset,state] of [['prop.fuel_tanks','idle'],['prop.decor_building_nongarrison','intact'],['prop.relay_objective','idle'],['prop.command_relay_objective','idle'],['prop.depot_objective','idle']]){region(m,'cliff');s.placements=[prop(asset,state)];assert(decode(s,m))}
 s.placements=[prop('prop.decor_building_nongarrison','destroyed')];rejects(s,m);s.placements=[prop('prop.spawn_marker_editor')];rejects(s,m);s.placements=[prop('prop.supply_station_neutral')];rejects(s,m);s.placements=[prop('toString')];rejects(s,m);s.placements=[prop('__proto__')];rejects(s,m);
});

test('scrub cannot invent cover, overlap dressing or float across mixed-height support',()=>{
 const m=map(),s=source();s.placements=[prop('prop.forest_edge_scrub')];rejects(s,m);region(m,'cover');assert(decode(s,m));m.tiles[15*64+15].height=1;rejects(s,m);region(m,'rubble');assert(decode(s,m));s.placements.push({...s.placements[0],id:'overlap'});rejects(s,m);
 for(const direction of [-1,4,1.5]){s.placements=[prop('prop.forest_edge_scrub','idle',direction)];rejects(s,m)}
 for(const position of [{x:-1,y:16000},{x:64000,y:16000},{x:16000.5,y:16000},{x:100,y:100}]){s.placements=[{...prop('prop.forest_edge_scrub'),position}];rejects(s,m)}
});

test('bridge variants keep every internal road lane open in all four orientations',()=>{
 for(const direction of [0,1,2,3]){
  const m=map(),s=source(),cx=16,cy=16,left=([{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:0}] as const)[direction];
  for(let side=-2;side<=2;side++)m.tiles[(cy+left.y*side)*64+cx+left.x*side]={terrain:Math.abs(side)===2?'water':'road',height:0,mandatory:Math.abs(side)<2};
  s.placements=[{...prop('prop.bridge_permanent','deck',direction),position:{x:cx*1000+500,y:cy*1000+500}}];assert(decode(s,m));s.placements[0].state='idle';rejects(s,m);s.placements[0].state='edge_left';rejects(s,m);
  s.placements[0].position={x:(cx+left.x)*1000+500,y:(cy+left.y)*1000+500};assert(decode(s,m));s.placements[0].state='edge_right';rejects(s,m);
  s.placements[0].position={x:(cx-left.x)*1000+500,y:(cy-left.y)*1000+500};assert(decode(s,m));s.placements[0].position.x++;rejects(s,m);
 }
});

test('public dressing follows exploration and skin rubble still requires Go disclosure',()=>{
 const m=map();region(m,'cover');const s=source();s.placements=[prop('prop.forest_edge_scrub')];const e=decode(s,m),k=new EnvironmentKnowledge(m,e),frame=create(PlayerSnapshotSchema,{tick:10,player:1,visible:Array(4096).fill(false),explored:Array(4096).fill(false)});
 assert(!k.sync(frame).some(i=>i.kind==='dressing'||i.kind==='rubble'));frame.explored.fill(true);let items=k.sync(frame);assert(items.some(i=>i.kind==='dressing'&&i.remembered));assert(!items.some(i=>i.kind==='rubble'));frame.rubble=[90];items=k.sync(frame);assert.equal(items.find(i=>i.kind==='rubble')?.asset,'prop.ruined_house_garrisonable');assert.equal(items.find(i=>i.kind==='rubble')?.direction,2);frame.tick=1;frame.rubble=[];frame.explored.fill(false);assert(!k.sync(frame).some(i=>i.kind==='dressing'||i.kind==='rubble'));
});
