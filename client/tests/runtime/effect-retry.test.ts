import test from 'node:test';
import assert from 'node:assert/strict';
import {Texture} from 'pixi.js';
import {EffectAssetLibrary} from '../../src/runtime/effect-library';
import {CombatEffects} from '../../src/render/combat-effects';
import {TerrainSurface} from '../../src/render/terrain-surface';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import type {CatalogIndex} from '../../src/content/catalog';
import {RuntimeError} from '../../src/runtime/errors';
import {fixture} from './effect-fixture';

function harness(){
 const f=fixture(),requests:string[]=[],errors:Error[]=[],faults=new Map<string,'503'|'corrupt'|'network'>();let now=0;
 const library=new EffectAssetLibrary({now:()=>now,onError:error=>errors.push(error),fetch:async input=>{
  const path=String(input).replace('/art/','');requests.push(path);const fault=faults.get(path);
  if(fault==='503')return new Response('',{status:503});
  if(fault==='network')throw new RuntimeError('asset_unavailable','The matching asset host is unavailable.');
  const bytes=fault==='corrupt'?new Uint8Array(f.files.get(path)!.length):f.files.get(path)!;
  return new Response(bytes.slice().buffer);
 },textures:{async load(_bytes,width,height){return {value:Texture.EMPTY,width,height,dispose(){}}},crop:value=>value,destroyFrame(){}}});
 return {...f,library,requests,errors,faults,clock:(value:number)=>{now=value},count:(path:string)=>requests.filter(value=>value===path).length};
}

test('metadata 503 recovers through the real CombatEffects request owner after a bounded wait',async()=>{
 const h=harness();await h.library.init(h.descriptor);h.faults.set(h.url,'503');
 const effects=new CombatEffects({units:new Map(),buildings:new Map(),weapons:new Map()} as unknown as CatalogIndex,{width:4,height:4}),owner=effects as any;
 owner.library=h.library;
 try{
  owner.request(h.id);await effects.settle();assert.equal(h.count(h.url),1);assert.equal(owner.sheets.get(h.id),undefined);
  h.faults.delete(h.url);for(let i=0;i<10;i++)owner.request(h.id);await effects.settle();assert.equal(h.count(h.url),1);
  h.clock(499);owner.request(h.id);await effects.settle();assert.equal(h.count(h.url),1);
  h.clock(500);owner.request(h.id);await effects.settle();assert.equal(h.count(h.url),2);assert(owner.sheets.get(h.id),'the same owner must install recovered metadata');
 }finally{await effects.dispose()}
});

test('PNG 503 retries only after 500ms and releases failed reservations before recovering',async()=>{
 const h=harness();await h.library.init(h.descriptor);const sheet=(await h.library.load(h.id))!,page='fx/explosion/small/page0.png';h.faults.set(page,'503');
 try{
  sheet.frame('standard',0);await h.library.settle();assert.equal(h.library.statistics.allocatedBytes,0);assert.equal(h.count(page),1);
  h.faults.delete(page);h.clock(499);sheet.frame('standard',0);await h.library.settle();assert.equal(h.count(page),1);
  h.clock(500);sheet.frame('standard',0);sheet.frame('standard',0);await h.library.settle();assert.equal(h.count(page),2);assert(sheet.frame('standard',0));assert.equal(h.library.statistics.allocatedBytes,16);
 }finally{await h.library.dispose()}
 assert.equal(h.library.statistics.allocatedBytes,0);
});

for(const kind of ['metadata','page'] as const)test(`a paused static draw retries due ${kind} without a new snapshot or manual invalidation`,async()=>{
 const h=harness();await h.library.init(h.descriptor);const page='fx/explosion/small/page0.png',path=kind==='metadata'?h.url:page;h.faults.set(path,'503');
 const map={width:4,height:4},surface=new TerrainSurface({...map,tiles:Array.from({length:16},()=>({terrain:'open'}))});
 const effects=new CombatEffects({units:new Map(),buildings:new Map(),weapons:new Map()} as unknown as CatalogIndex,map),owner=effects as any;
 owner.library=h.library;owner.snapshot={tick:0};owner.history.cues=[{key:'impact',id:1,kind:'impact',tick:0,until:12,cover:false,position:{x:1000,y:1000},effects:[h.id]}];
 const draw=()=>effects.draw(surface,1,DEFAULT_SETTINGS,{left:-500,right:500,top:-500,bottom:500},()=>0);
 try{
  // Settle the library directly: CombatEffects.settle() deliberately invalidates
  // its cache, which would hide a missing due-retry cache invalidation.
  draw();await h.library.settle();draw();await h.library.settle();draw();assert.equal(h.count(path),1);
  h.faults.delete(path);h.clock(499);draw();await h.library.settle();assert.equal(h.count(path),1);
  h.clock(500);draw();await h.library.settle();draw();await h.library.settle();draw();
  assert.equal(h.count(path),2);assert.equal(effects.diagnostics.decorations,1);assert.deepEqual(effects.diagnostics.missing,[]);
 }finally{await effects.dispose()}
});

test('verified-generation network failures retry but metadata/page integrity failures stay hard',async()=>{
 const h=harness();await h.library.init(h.descriptor);h.faults.set(h.url,'network');assert.equal(await h.library.load(h.id),undefined);
 h.clock(500);h.faults.delete(h.url);const sheet=(await h.library.load(h.id))!;assert(sheet);const page='fx/explosion/small/page0.png';h.faults.set(page,'corrupt');sheet.frame('standard',0);await h.library.settle();
 for(const now of [1000,5000,60000]){h.clock(now);sheet.frame('standard',0);await h.library.settle()}assert.equal(h.count(page),1);
 h.faults.delete(page);sheet.retry();sheet.frame('standard',0);await h.library.settle();assert(sheet.frame('standard',0));await h.library.dispose();
 const broken=harness();await broken.library.init(broken.descriptor);broken.faults.set(broken.url,'corrupt');assert.equal(await broken.library.load(broken.id),undefined);
 broken.clock(60000);broken.faults.delete(broken.url);assert.equal(await broken.library.load(broken.id),undefined);assert.equal(broken.count(broken.url),1);await broken.library.dispose();
});

test('metadata and pages stop after two automatic retries, explicit retry resets the budget, disposal cancels retry intent',async()=>{
 const h=harness();await h.library.init(h.descriptor);h.faults.set(h.url,'503');await h.library.load(h.id);
 for(const now of [500,1999,2000,60000]){h.clock(now);await h.library.load(h.id)}assert.equal(h.count(h.url),3);
 h.faults.delete(h.url);h.library.retry(h.id);await Promise.resolve();const sheet=(await h.library.load(h.id))!;assert(sheet);
 const page='fx/explosion/small/page0.png';h.clock(0);h.faults.set(page,'503');sheet.frame('standard',0);await h.library.settle();
 for(const now of [500,1999,2000,60000]){h.clock(now);sheet.frame('standard',0);await h.library.settle()}assert.equal(h.count(page),3);
 await h.library.dispose();const before=h.requests.length;h.clock(120000);sheet.frame('standard',0);await h.library.load(h.id);await h.library.settle();assert.equal(h.requests.length,before);assert.equal(h.library.statistics.allocatedBytes,0);
});
