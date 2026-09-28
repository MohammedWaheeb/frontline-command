import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {EventSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {soldDestruction} from '../../src/app/combat-feedback';
import {CombatTimeline} from '../../src/app/combat-presentation';
import {AudioDirector} from '../../src/audio/director';
import type {AudioMixer} from '../../src/audio/mixer';
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {DEFAULT_SETTINGS} from '../../src/app/settings';

const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
const before=()=>create(PlayerSnapshotSchema,{tick:100,player:1,players:[{id:1,team:1,faction:'US'},{id:2,team:2,faction:'IR'}],entities:[{id:6,type:'power',owner:1,health:1000,complete:true,enabled:true,position:{x:10000,y:14000}}]});
const sale=()=>create(EventSchema,{id:10,tick:101,kind:'building_sold',owner:1,entity:6,position:{x:10000,y:14000},scope:'owner'});
const death=()=>create(EventSchema,{id:11,tick:101,kind:'destroyed',owner:1,entity:6,position:{x:10000,y:14000},scope:'visible'});
function after(){return {...before(),tick:101,entities:[],events:[sale(),death()]}}

test('only the exact currently disclosed owned sale suppresses its cleanup destruction',()=>{
 const s=after(),event=death();assert(soldDestruction(event,s));
 for(const patch of [{owner:2},{entity:7},{tick:100},{scope:'visible'},{id:0},{id:NaN}])assert(!soldDestruction(event,{...s,events:[{...sale(),...patch},event]}),JSON.stringify(patch));
 assert(!soldDestruction(event,{...s,player:2}));assert(!soldDestruction({...event,kind:'impact'},s));assert(!soldDestruction(event,{...s,events:[event]}));
});

test('owned sale retains sell audio without explosion or building-lost announcement; combat death remains',()=>{
 for(const sold of [true,false]){
  const sounds:string[]=[],mixer={play:(id:string)=>sounds.push(id),continuous(){},music(){},reset(){}} as unknown as AudioMixer;
  const director=new AudioDirector(mixer,()=>catalog),timeline=new CombatTimeline();director.snapshot(before());timeline.sync(before(),catalog);
  const s=after();if(!sold)s.events=[death()];director.snapshot(s);timeline.sync(s,catalog);director.snapshot(s);timeline.sync(s,catalog);
  assert.deepEqual(sounds,sold?['sfx.sell']:['sfx.explosion_building','vo.announcer.US.building_lost']);
  assert.equal(timeline.values.length,sold?0:1);if(!sold)assert.equal(timeline.values[0].kind,'destroyed');director.dispose();
 }
 const timeline=new CombatTimeline();timeline.sync({...before(),player:2},catalog);timeline.sync({...after(),player:2,events:[death()]},catalog);assert.equal(timeline.values[0].kind,'destroyed','A foreign viewer cannot infer the private sale');
});

test('sale cleanup cannot cause actor death feedback or camera shake',()=>{
 for(const sold of [true,false]){
  const cues:string[]=[],renderer=Object.create(BattlefieldRenderer.prototype) as any;
  renderer.effectEvent=0;renderer.tickAt=0;renderer.settings={...DEFAULT_SETTINGS,screenShake:1};renderer.options={catalog};renderer.shake={strength:0,until:0};renderer.app={screen:{width:800,height:600}};renderer.project=()=>({x:400,y:300});renderer.actors=new Map([[6,{entity:before().entities[0],cue:(kind:string)=>cues.push(kind)}]]);
  const s=after();if(!sold)s.events=[death()];renderer.readFeedback(s);
  assert.deepEqual(cues,sold?['building_sold']:['destroyed']);assert.equal(renderer.shake.strength,sold?0:3);
 }
});
