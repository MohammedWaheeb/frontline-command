import test from 'node:test';
import assert from 'node:assert/strict';
import {Application} from '../../src/app/application';
import {skirmishPreset} from '../../src/app/skirmish-setup';
import {readSkirmishMemory} from '../../src/app/menu-memory';
import {sanitizeSettings} from '../../src/app/settings';
import {presentableFailure} from '../../src/runtime/errors';
import type {GameMap,OfflineConfig} from '../../src/runtime/types';
function fixture(){
 const app=Object.create(Application.prototype) as Application,configs:OfflineConfig[]=[],errors:unknown[]=[],memory=new Map<string,string>();
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)}});
 const map={id:'industrial-valley',spawns:[{position:{x:1000,y:1000}},{position:{x:9000,y:9000}},{position:{x:1000,y:9000}},{position:{x:9000,y:1000}}]} as GameMap;
 Object.assign(app,{task:async(_label:string,fn:()=>Promise<unknown>)=>{try{return await fn()}catch(error){errors.push(error)}},readContent:(fn:()=>Promise<unknown>)=>fn(),library:{loadMap:async()=>({map})},sessions:{startSolo:async(config:OfflineConfig)=>{configs.push(structuredClone(config))}},state:{get:()=>({index:{maps:[{id:'industrial-valley'},{id:'copper-junction'}]}})}});
 return {app,map,configs,errors,memory,restore(){if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage')}};
}
test('legacy launcher adds color/name/spawn options without changing human identity or saved seed',async()=>{
 const f=fixture();try{
  await f.app.skirmish('industrial-valley','US',[{faction:'IR',difficulty:'hard',team:2,color:7,name:'Opponent'}],1,10000,{color:8,spawnOrder:[2,1],seed:123});
  assert.deepEqual(f.errors,[]);const config=f.configs[0];
  assert.equal(config.seed,123);assert.equal(config.ruleset,'custom-v1');assert.equal(config.starting_credits,10000);
  assert.deepEqual(config.players!.map(player=>({id:player.id,color:player.color,ai:player.ai})),[{id:1,color:8,ai:undefined},{id:2,color:7,ai:'hard'}]);
  assert.equal(config.players![1].name,'Opponent');assert.equal(config.players![0].controller,'human');
  assert.deepEqual(config.players!.map(player=>(player as typeof player&{spawn:number}).spawn),[2,1]);assert.deepEqual(config.map.spawns,f.map.spawns);assert.deepEqual(readSkirmishMemory()?.slots.map(slot=>slot.spawn),[2,1]);
 }finally{f.restore()}
});
test('launch and Quick Skirmish preserve remembered choices and deterministically resolve Random',async()=>{
 const f=fixture();try{
  const setup=skirmishPreset('2v2','industrial-valley','random');setup.seed=987;setup.slots[0].color=8;setup.slots[1].difficulty='hard';
  await f.app.launchSkirmish(setup);await f.app.quickSkirmish();
  assert.deepEqual(f.errors,[]);assert.equal(f.configs.length,2);assert.deepEqual(f.configs[0],f.configs[1]);
  assert.equal(f.app.lastSkirmish()?.slots[0].faction,'random');assert.ok(f.configs[0].players!.every(player=>['US','IR','SY','SA'].includes(player.faction)));assert.deepEqual(f.configs[0].players!.filter(player=>player.team===1).map(player=>player.id).sort(),[1,2]);
 }finally{f.restore()}
});
test('invalid slots and oversized spawn choice do not launch or overwrite valid memory',async()=>{
 const f=fixture();try{
  const setup=skirmishPreset('1v1','industrial-valley');setup.seed=9;await f.app.launchSkirmish(setup);const before=[...f.memory];setup.slots[0].spawn=5;await f.app.launchSkirmish(setup);
  await f.app.skirmish('industrial-valley','US',[{faction:'IR',difficulty:'normal',team:2}],1,6000,{spawnOrder:[1]});
  assert.equal(f.configs.length,1);assert.equal(f.errors.length,2);assert.deepEqual([...f.memory],before);
  assert.equal(presentableFailure(f.errors[0]).code,'skirmish_setup_invalid');assert.match(presentableFailure(f.errors[1]).message,/starting position per commander/);
 }finally{f.restore()}
});
test('failed session launch never replaces last successful skirmish',async()=>{
 const f=fixture();try{
  const setup=skirmishPreset('1v1','industrial-valley');setup.seed=9;await f.app.launchSkirmish(setup);const before=[...f.memory];Object.assign(f.app,{sessions:{startSolo:async()=>{throw Error('worker unavailable')}}});
  await f.app.launchSkirmish({...setup,startingCredits:10000});assert.equal(f.errors.length,1);assert.deepEqual([...f.memory],before);
 }finally{f.restore()}
});
test('launch captures slot choices before waiting for content preparation',async()=>{
 const f=fixture();try{
  let ready!:()=>void;const waiting=new Promise<void>(resolve=>{ready=resolve});
  Object.assign(f.app,{readContent:async(fn:()=>Promise<unknown>)=>{await waiting;return fn()}});
  const setup=skirmishPreset('1v1','industrial-valley');setup.seed=123;
  const work=f.app.launchSkirmish(setup);setup.slots[0].faction='SA';setup.startingCredits=10000;ready();await work;
  assert.deepEqual(f.errors,[]);assert.equal(f.configs[0].players!.find(player=>player.id===1)?.faction,'US');assert.equal(f.configs[0].ruleset,'standard-v2');
 }finally{f.restore()}
});
test('Quick Skirmish without memory uses the first curated installed map',async()=>{
 const f=fixture();try{
  await f.app.quickSkirmish();assert.deepEqual(f.errors,[]);assert.equal(f.app.lastSkirmish()?.mapID,'copper-junction');assert.equal(f.configs[0].players!.find(player=>player.id===1)?.controller,'human');
 }finally{f.restore()}
});
test('Application reset APIs require explicit confirmation and preserve section boundaries',()=>{
 const app=Object.create(Application.prototype) as Application;let current=sanitizeSettings({firstRunComplete:true,audioConsent:true,uiScale:1.5,audio:{music:0}}),writes=0;
 Object.assign(app,{state:{get:()=>({settings:current})},setSettings:(value:typeof current)=>{current=value;writes++}});
 app.resetPreferences();app.resetPreferences(false);assert.equal(writes,0);app.resetSettingsSection('audio');assert.equal(writes,1);assert.equal(current.audio.music,0.6);assert.equal(current.uiScale,1.5);
 app.resetPreferences(true);assert.equal(writes,2);assert.equal(current.uiScale,1);assert.equal(current.firstRunComplete,true);assert.equal(current.audioConsent,true);
});

test('default legacy and slot-table duels pass geometric diagonal starts to the single sim',async()=>{
 const f=fixture();try{
  await f.app.skirmish('industrial-valley','US',[{faction:'IR',difficulty:'normal',team:2}],1,6000,{seed:42});
  await f.app.launchSkirmish({...skirmishPreset('1v1','industrial-valley'),seed:42});
  assert.deepEqual(f.errors,[]);
  for(const config of f.configs){assert.deepEqual(config.players!.map(player=>[player.id,(player as typeof player&{spawn:number}).spawn]),[[1,1],[2,2]]);assert.deepEqual(config.map.spawns,f.map.spawns)}
 }finally{f.restore()}
});

test('Application campaign memory and active difficulty use public adapters',()=>{
 const f=fixture();try{
  f.app.setCampaignFaction('SY');f.app.setCampaignDifficulty('hard');assert.equal(f.app.campaignFaction(),'SY');assert.equal(f.app.campaignDifficulty(),'hard');
  Object.assign(f.app,{sessions:{state:{kind:'solo',info:{difficulty:'easy'}}}});assert.equal(f.app.activeMissionDifficulty(),'easy');
  Object.assign(f.app,{sessions:{state:{kind:'online',info:{difficulty:'hard'}}}});assert.equal(f.app.activeMissionDifficulty(),undefined);
 }finally{f.restore()}
});
