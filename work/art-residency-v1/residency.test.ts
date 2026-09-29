import test from 'node:test';
import assert from 'node:assert/strict';
import {Texture,TextureSource} from 'pixi.js';
import {ArtLibrary,SpriteSheet,type SpriteMeta} from './candidate/client/src/render/art';

const MiB=1024*1024;
const meta={id:'fixture',states:[{name:'idle',part:'body',directions:1,frames:1,fps:0,loop:false}]} as SpriteMeta;
function clock(){
 const original=Object.getOwnPropertyDescriptor(performance,'now');let now=100;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 return {set:(value:number)=>{now=value},restore:()=>{if(original)Object.defineProperty(performance,'now',original);else delete (performance as any).now}};
}
async function fixture(count=6,scale:'1x'|'2x'='1x'){
 const disposed:number[]=[],pages=Array.from({length:count},(_,i)=>({url:`/page-${i}.png`,layer:'shadow',descriptors:{[`idle/d00_f${String(i).padStart(2,'0')}`]:{frame:{x:0,y:0,w:1,h:1},sourceSize:{w:1,h:1}}},frames:new Map(),lastUsed:0,bytes:0,generation:0}));
 const sheet=new SpriteSheet('fixture',meta,scale,pages,async(url)=>{
  const index=Number(url.match(/\d+/)![0]);
  // Real Pixi ownership and dimensions; no browser/GPU/RGBA backing allocation.
  const texture=new Texture({source:new TextureSource({width:4096,height:4096})});
  return {texture,dispose(){disposed.push(index);texture.destroy(true)}};
 });
 const library=new ArtLibrary();library.scale=scale;(library as any).loaded.add(sheet);
 for(let i=0;i<count;i++)sheet.frame('shadow','idle',0,i);
 await sheet.settle();assert.equal(library.statistics.residentBytes,count*64*MiB);
 return {library,sheet,pages,disposed,async close(){await sheet.dispose();await library.dispose()}};
}

test('pressure reclaims recent unused pages while keeping this paint and newest cache entries',async()=>{
 const time=clock();const f=await fixture();try{
  for(let i=0;i<6;i++){time.set(100+i);f.sheet.frame('shadow','idle',0,i)}
  time.set(200);f.sheet.frame('shadow','idle',0,0);f.sheet.frame('shadow','idle',0,1);
  f.library.trim(200);
  assert.deepEqual(f.disposed,[2,3,4]);assert.equal(f.library.statistics.residentBytes,192*MiB);
  assert(f.pages[0].frames.size&&f.pages[1].frames.size&&f.pages[5].frames.size);
 }finally{await f.close();time.restore()}
});
test('default trim reproduces conservative ten-second grace without a complete paint boundary',async()=>{
 const time=clock();const f=await fixture();try{
  time.set(200);f.library.trim();assert.equal(f.library.statistics.residentBytes,384*MiB);assert.deepEqual(f.disposed,[]);
  time.set(10200);f.library.trim();assert.equal(f.library.statistics.residentBytes,0);
 }finally{await f.close();time.restore()}
});
test('an active working set above budget remains valid instead of destroying displayed textures',async()=>{
 const time=clock();const f=await fixture();try{
  time.set(200);const frames=Array.from({length:6},(_,i)=>f.sheet.frame('shadow','idle',0,i)!);
  f.library.trim(200);assert.equal(f.library.statistics.residentBytes,384*MiB);assert.deepEqual(f.disposed,[]);
  for(const frame of frames){assert(!frame.texture.destroyed);assert(!frame.atlasTexture.destroyed)}
 }finally{await f.close();time.restore()}
});
test('high quality uses its own target and keeps all current-frame shared pages',async()=>{
 const time=clock();const f=await fixture(8,'2x');try{
  time.set(200);f.sheet.frame('shadow','idle',0,0);f.sheet.frame('shadow','idle',0,7);
  f.library.trim(200);assert.equal(f.library.statistics.residentBytes,384*MiB);assert.deepEqual(f.disposed,[1,2]);
 }finally{await f.close();time.restore()}
});
test('a page requested again after candidate enumeration is protected by eviction recheck',async()=>{
 const time=clock();const f=await fixture();try{
  time.set(200);const candidates=f.sheet.evictionCandidates(200);assert.equal(candidates.length,6);
  f.sheet.frame('shadow','idle',0,0);assert.equal(candidates[0].evict(),0);assert(f.pages[0].frames.size);
  assert.equal(candidates[1].evict(),64*MiB);assert.equal(candidates[1].evict(),0);
 }finally{await f.close();time.restore()}
});
test('evicted pages reenter through the ordinary loader without duplicate disposal',async()=>{
 const time=clock();const f=await fixture();try{
  time.set(200);f.library.trim(200);assert.deepEqual(f.disposed,[0,1,2]);
  assert.equal(f.sheet.frame('shadow','idle',0,0),undefined);await f.sheet.settle();
  const fresh=f.sheet.frame('shadow','idle',0,0)!;assert(fresh);assert(!fresh.texture.destroyed);
  await f.sheet.dispose();assert.equal(f.library.statistics.residentBytes,0);
  assert.equal(f.disposed.filter(i=>i===0).length,2);assert.equal(f.disposed.filter(i=>i===1).length,1);
 }finally{await f.close();time.restore()}
});
test('invalid or future paint boundaries cannot destroy textures',async()=>{
 const time=clock();const f=await fixture();try{
  for(const value of [NaN,Infinity,-1,101])assert.throws(()=>f.library.trim(value),RangeError);
  assert.deepEqual(f.disposed,[]);assert.equal(f.library.statistics.residentBytes,384*MiB);
 }finally{await f.close();time.restore()}
});
test('global LRU crosses sheet boundaries and stops once pressure is relieved',async()=>{
 const time=clock();const a=await fixture(2),b=await fixture(2);try{
  (a.library as any).loaded.add(b.sheet);
  a.pages[0].lastUsed=120;a.pages[1].lastUsed=140;b.pages[0].lastUsed=110;b.pages[1].lastUsed=150;
  time.set(200);a.library.trim(200);
  assert.deepEqual(a.disposed,[]);assert.deepEqual(b.disposed,[0]);assert.equal(a.library.statistics.residentBytes,192*MiB);
 }finally{await a.close();await b.close();time.restore()}
});
