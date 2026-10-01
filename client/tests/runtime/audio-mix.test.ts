import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {create} from '@bufbuild/protobuf';
import {oneShotMix} from '../../src/audio/battlefield-sound';
import {AudioMixer} from '../../src/audio/mixer';
import {AudioDirector} from '../../src/audio/director';
import type {AudioMixer as MixerType} from '../../src/audio/mixer';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {EntitySchema,EventSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';

// --- one-shot attenuation/pan ------------------------------------------------

test('one-shot mix mirrors mover geometry: full center, attenuated edges, audible off-screen',()=>{
 const view={left:0,top:0,right:800,bottom:600};
 assert.deepEqual(oneShotMix(view,{left:390,top:290,right:410,bottom:310}),{gain:1,pan:0});
 const right=oneShotMix(view,{left:790,top:290,right:810,bottom:310});
 assert.equal(right.pan,.8);assert.ok(right.gain<1&&right.gain>.3);
 const corner=oneShotMix(view,{left:-10,top:-10,right:10,bottom:10});
 assert.ok(corner.gain>=.3&&corner.gain<right.gain);
 assert.deepEqual(oneShotMix(view,undefined),{gain:.3,pan:0});
 assert.deepEqual(oneShotMix(undefined,{left:0,top:0,right:10,bottom:10}),{gain:1,pan:0});
 assert.deepEqual(oneShotMix({left:0,top:0,right:0,bottom:0},{left:0,top:0,right:10,bottom:10}),{gain:1,pan:0});
});

// --- director routing --------------------------------------------------------

const units=[
 {id:'US.rifle',name:'Ranger',faction:'US',role:'rifle',armor:'infantry',weapon:'RIF'},
 {id:'US.tank',name:'Tank',faction:'US',role:'tank',armor:'heavy',weapon:'TANK'},
 {id:'US.fighter',name:'Jet',faction:'US',role:'fighter',armor:'air',weapon:'FIGHT'},
] as unknown as Catalog['units'];
const buildings=[{id:'US.hq',name:'HQ',faction:'US',role:'hq'}] as unknown as Catalog['buildings'];
const weapons=[{id:'IR_SHAHED'},{id:'TANK'}] as unknown as Catalog['weapons'];
const catalog=new CatalogIndex({units,weapons,buildings,upgrades:[]} as unknown as Catalog);

function directorHarness(entries:Record<string,unknown>|undefined){
 const calls:Array<{id:string;options:any}>=[];
 const mixer={play:(id:string,options?:unknown)=>calls.push({id,options}),music:()=>{},continuous:()=>{},caption:()=>{},reset:()=>{},stopTransient:()=>{},clearCaptions:()=>{},afterSpeech:()=>{},manifest:entries?{entries}:undefined} as unknown as MixerType;
 const director=new AudioDirector(mixer,()=>catalog);
 director.attachBattlefield({id:'test',title:'Test flat',tiles:[]} as never,()=>({viewport:{left:0,top:0,right:800,bottom:600},bounds:(entity:any)=>entity.id===1?{left:780,top:290,right:800,bottom:310}:undefined}));
 return {calls,director};
}
const snapshot=(tick:number,entities:any[],events:any[]=[])=>create(PlayerSnapshotSchema,{tick,player:1,players:[{id:1,team:1,faction:'US'},{id:2,team:2,faction:'IR'}],entities,events});
const ent=(id:number,type:string)=>create(EntitySchema,{id,type,owner:1,health:1000,complete:true,enabled:true,position:{x:1000,y:1000}});
const destroyed=(id:number,entity:number,tick:number)=>create(EventSchema,{id,tick,kind:'destroyed',entity,owner:1,position:{x:1000,y:1000}});

test('destruction routes large kills to explosion_large and buildings to the cascade fallback',()=>{
 for(const [type,sound]of [['US.tank','sfx.explosion_large'],['US.fighter','sfx.explosion_large'],['US.rifle','sfx.explosion_small']] as const){
  const h=directorHarness(undefined);
  try{
   h.director.snapshot(snapshot(100,[ent(1,type)]));
   h.director.snapshot(snapshot(101,[ent(1,type)],[destroyed(1,1,101)]));
   assert.equal(h.calls[0].id,sound,type);
  }finally{h.director.dispose()}
 }
 const building=directorHarness(undefined);
 try{
  building.director.snapshot(snapshot(100,[ent(1,'US.hq')]));
  building.director.snapshot(snapshot(101,[ent(1,'US.hq')],[destroyed(1,1,101)]));
  assert.equal(building.calls[0].id,'sfx.explosion_building');
 }finally{building.director.dispose()}
 const cascade=directorHarness({'sfx.explosion_cascade':{bus:'effects'},'sfx.explosion_building':{bus:'effects'}});
 try{
  cascade.director.snapshot(snapshot(100,[ent(1,'US.hq')]));
  cascade.director.snapshot(snapshot(101,[ent(1,'US.hq')],[destroyed(1,1,101)]));
  assert.equal(cascade.calls[0].id,'sfx.explosion_cascade');
 }finally{cascade.director.dispose()}
});

test('one-shot cues carry distance gain and pan from the entity screen rect',()=>{
 const h=directorHarness(undefined);
 try{
  h.director.snapshot(snapshot(100,[ent(1,'US.rifle')]));
  const fire=create(EventSchema,{id:1,tick:101,kind:'weapon_fired',entity:1,owner:1});
  Object.assign(fire,{combat:{weapon:'TANK'}});
  h.director.snapshot(snapshot(101,[ent(1,'US.rifle')],[fire]));
  assert.equal(h.calls[0].id,'sfx.weapon.TANK');
  assert.ok(h.calls[0].options.gain<1&&h.calls[0].options.gain>=.3);
  assert.equal(h.calls[0].options.pan,.8);
 }finally{h.director.dispose()}
});

test('pending IR_SHAHED clip falls back to explosion_small until the SFX lane ships it',()=>{
 const fire=(id:number,tick:number)=>{const e=create(EventSchema,{id,tick,kind:'impact',entity:1,owner:1});Object.assign(e,{combat:{weapon:'IR_SHAHED',outcome:'hit',targetArmor:'heavy'}});return e};
 const missing=directorHarness({'sfx.explosion_small':{bus:'effects'}});
 try{
  missing.director.snapshot(snapshot(100,[ent(1,'US.rifle')]));
  missing.director.snapshot(snapshot(101,[ent(1,'US.rifle')],[fire(1,101)]));
  assert.equal(missing.calls[0].id,'sfx.explosion_small');
 }finally{missing.director.dispose()}
 const shipped=directorHarness({'sfx.weapon.IR_SHAHED':{bus:'effects'},'sfx.explosion_small':{bus:'effects'}});
 try{
  shipped.director.snapshot(snapshot(100,[ent(1,'US.rifle')]));
  shipped.director.snapshot(snapshot(101,[ent(1,'US.rifle')],[fire(1,101)]));
  assert.equal(shipped.calls[0].id,'sfx.weapon.IR_SHAHED');
 }finally{shipped.director.dispose()}
});

// --- mixer fairness and ducking ----------------------------------------------

const bytes=(label:string)=>new TextEncoder().encode(label);
const hash=(label:string)=>createHash('sha256').update(bytes(label)).digest('hex');
const flush=async()=>{for(let i=0;i<12;i++)await new Promise<void>(resolve=>setImmediate(resolve))};
const param=()=>{const p:any={value:1,targets:[] as number[],setValueAtTime(v:number){this.value=v},setTargetAtTime(v:number){this.value=v;this.targets.push(v)}};return p};

function mixCourse(){
 const entries:Record<string,any>={};
 const add=(id:string,bus='effects',priority=0,extra:Record<string,unknown>={})=>{
  const label=id.replace(/.*\./,'');
  entries[id]={bus,priority,cooldown_ms:0,loop:false,...extra,variants:[{url:`/art/audio/${label}.wav`,caption:bus==='voice'?label:undefined,duration:.05,bytes:bytes(label).length,sha256:hash(label)}]};
 };
 for(let i=0;i<26;i++)add(`sfx.effect${i}`);
 add('sfx.bed','effects',0);add('music.layer0','music',0,{loop:true,bpm:120,beats_per_bar:4});
 add('vo.hi','voice',60);add('vo.lo','voice',10);
 const started:string[]=[],stopped:string[]=[];
 const context:any={state:'running',currentTime:0,close:async()=>{},
  createGain:()=>{const g:any={gain:param(),connect(){},disconnect(){}};return g},
  createStereoPanner:()=>({pan:param(),connect(){},disconnect(){}}),
  createBufferSource:():any=>({connect(){},disconnect(){},buffer:null,loop:false,onended:null,start(){started.push(this.buffer.label)},stop(){stopped.push(this.buffer?.label)}}),
  createDynamicsCompressor:()=>({threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){}}),
  createWaveShaper:()=>({curve:null,oversample:'none',connect(){},disconnect(){}}),
  decodeAudioData:async(data:ArrayBuffer)=>({duration:.05,numberOfChannels:1,length:1200,label:new TextDecoder().decode(data)})};
 const mixer=new AudioMixer({audioConsent:true,captions:true,audio:{master:1,voice:1,music:1,effects:1,ui:1}},async(input:any)=>{
  if(String(input).endsWith('index.json'))return new Response(JSON.stringify({format:1,sample_rate:24000,entries}));
  return new Response(bytes(String(input).split('/').at(-1)!.replace('.wav','')));
 });
 const internal=mixer as any;internal.context=context;internal.master=context.createGain();
 internal.buses=new Map(['voice','effects','music','ui'].map(bus=>[bus,context.createGain()]));
 return {mixer,internal,entries,started,stopped,musicBus:()=>internal.buses.get('music')};
}

test('a full voice cap steals the oldest equal-priority one-shot, never music or beds',async()=>{
 const c=mixCourse();await c.mixer.loadIndex();
 try{
  c.mixer.continuous([{key:'map',id:'sfx.bed',gain:.07}]);await flush();
  c.mixer.music(['music.layer0']);await flush();
  assert.equal(c.internal.continuousSources.size,1);assert.equal(c.internal.musicSources.length,1);
  for(let i=0;i<22;i++){c.mixer.play(`sfx.effect${i}`);await flush()}
  assert.equal(c.mixer.statistics.sources,24);
  c.mixer.play('sfx.effect22');await flush();
  assert.equal(c.mixer.statistics.sources,24);
  assert.ok(c.started.includes('effect22'),'new chatter was dropped at a full equal-priority cap');
  assert.ok(c.stopped.includes('effect0'),'oldest equal-priority voice was not the victim');
  assert.equal(c.internal.continuousSources.size,1,'continuous bed was stolen');
  assert.equal(c.internal.musicSources.length,1,'music was stolen');
 }finally{c.mixer.dispose()}
});

test('priority>=50 voice ducks music and beds, routine voice does not',async()=>{
 const c=mixCourse();await c.mixer.loadIndex();
 try{
  c.mixer.continuous([{key:'map',id:'sfx.bed',gain:.07}]);await flush();
  c.mixer.music(['music.layer0']);await flush();
  const musicBus=c.musicBus(),bed=[...c.internal.continuousSources.values()][0];
  c.mixer.play('vo.lo');await flush();
  assert.equal((c.mixer as any).duckActive,false,'routine voice ducked the mix');
  assert.deepEqual(musicBus.gain.targets,[],'routine voice touched the music bus');
  c.mixer.play('vo.hi');await flush();
  assert.equal((c.mixer as any).duckActive,true,'priority voice did not duck the mix');
  assert.ok(musicBus.gain.targets.some((v:number)=>Math.abs(v-.35)<1e-9),'music bus did not duck to 35%');
  assert.ok(bed.gain.gain.value<.07,'continuous bed did not duck');
  await new Promise(resolve=>setTimeout(resolve,1600));await flush();
  assert.equal((c.mixer as any).duckActive,false,'duck did not release after the voice');
  assert.ok(musicBus.gain.targets.some((v:number)=>Math.abs(v-1)<1e-9),'music bus did not release smoothly');
 }finally{c.mixer.dispose()}
});
