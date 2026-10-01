import test from 'node:test';import assert from 'node:assert/strict';
import {decodeEffectIndex,decodeEffectMetadata,effectDescriptor,inspectEffectPNG} from '../../src/content/effect-assets.mjs';
import {EffectAssetLibrary,type EffectTextureAdapter} from '../../src/runtime/effect-library';
import {fixture,hash,json,png} from './effect-fixture';
function harness(twoPages=false,budgetBytes?:number){
 const f=fixture(twoPages),requests:string[]=[],errors:Error[]=[],released:number[]=[],crops:number[]=[],destroyed:number[]=[];let next=0,clock=1;
 const textures:EffectTextureAdapter<{id:number}>={async load(_bytes,width,height){const id=++next;return {value:{id},width,height,dispose(){released.push(id)}}},crop(value){crops.push(value.id);return {id:value.id*10}},destroyFrame(value){destroyed.push(value.id)}};
 const fetcher=async(input:RequestInfo|URL)=>{const key=String(input).replace('/art/','');requests.push(key);const data=f.files.get(key);return data?new Response(data.slice().buffer,{headers:{'Content-Length':String(data.length)}}):new Response('',{status:404})};
 const library=new EffectAssetLibrary({textures,fetch:fetcher as typeof fetch,now:()=>clock,onError:error=>errors.push(error),budgetBytes});
 return {...f,library,textures,requests,errors,released,crops,destroyed,setClock(value:number){clock=value}};
}
test('FX schema is immutable, supports shared variants and rejects invalid paths/frames/references',()=>{
 const f=fixture(),index=decodeEffectIndex(f.files.get('fx/index.json')!),meta=decodeEffectMetadata(json(f.metadata),f.id);assert.equal(index.effects[f.id].url,f.url);assert(Object.isFrozen(meta.clips.burst.frames[0].origin));
 for(const url of ['../escape.json','/fx/index.json','fx/%2e%2e/index.json','fx/a/../index.json','https://x/fx/index.json'])assert.throws(()=>effectDescriptor({...f.descriptor,url},'index'));
 for(const mutate of [(x:any)=>x.pages[0].file='../a.png',(x:any)=>x.pages[0].file='page%30.png',(x:any)=>x.clips.burst.frames[0].w=3,(x:any)=>x.clips.burst.frames[0].page=8,(x:any)=>delete x.variants.reduced,(x:any)=>x.variants.low='missing',(x:any)=>x.resolution=3,(x:any)=>x.pages.push({...x.pages[0]}),(x:any)=>x.extra=true]){const value=structuredClone(f.metadata);mutate(value);assert.throws(()=>decodeEffectMetadata(json(value),f.id))}
 const wrong=structuredClone(f.index);wrong.effects['fx.explosion.small'].url='fx/explosion/other/effect.json';assert.throws(()=>decodeEffectIndex(json(wrong)));assert.throws(()=>decodeEffectMetadata(json(f.metadata),'fx.impact.hit_air'));
});
test('FX PNG inspection rejects corruption, truncation, appended bytes and unsupported dimensions',()=>{
 const bytes=png();assert.deepEqual({...inspectEffectPNG(bytes),compressed:undefined},{width:2,height:2,channels:4,compressed:undefined});
 const bad=bytes.slice();bad[45]^=1;assert.throws(()=>inspectEffectPNG(bad));assert.throws(()=>inspectEffectPNG(bytes.slice(0,-5)));assert.throws(()=>inspectEffectPNG(new Uint8Array([...bytes,0])));assert.throws(()=>inspectEffectPNG(png(2049,1)));
});
test('FX metadata loads once, pages load on demand, shared variants reuse frames, release owns all textures',async()=>{
 const h=harness();await h.library.init();assert.equal(await h.library.load(h.id),undefined);assert.equal(h.requests.length,0);
 await h.library.init(h.descriptor);assert(h.library.has(h.id));const [sheet,again]=await Promise.all([h.library.load(h.id),h.library.load(h.id)]);assert(sheet);assert.equal(sheet,again);assert.equal(h.requests.length,2);assert.equal(sheet.clip('low')?.fps,0);
 assert.equal(sheet.frame('standard',0),undefined);assert.equal(sheet.frame('reduced',0),undefined);await h.library.settle();const frame=sheet.frame('standard',0)!;assert.equal(frame.pixelScale,.5);assert.equal(frame.anchorY,1);assert.equal(frame,sheet.frame('low',0));assert.deepEqual(h.crops,[1]);assert.equal(h.requests.length,3);assert.equal(h.library.statistics.allocatedBytes,16);
 await h.library.release();assert.deepEqual(h.released,[1]);assert.deepEqual(h.destroyed,[10]);assert.equal(sheet.frame('standard',0),undefined);assert.deepEqual(h.library.statistics,{indexedPages:0,residentPages:0,residentBytes:0,allocatedBytes:0});assert(h.library.has(h.id));assert(await h.library.load(h.id));await h.library.dispose();assert.equal(await h.library.load(h.id),undefined);assert.deepEqual(h.errors,[]);
});
test('FX wrong bytes fail before decode and explicit retry recovers, without silent replacement',async()=>{
 const h=harness();await h.library.init(h.descriptor);const sheet=(await h.library.load(h.id))!;const key='fx/explosion/small/page0.png',original=h.files.get(key)!;h.files.set(key,new Uint8Array(original.length));sheet.frame('standard',0);await h.library.settle();assert.equal(h.crops.length,0);assert.equal(h.errors.length,1);assert.equal(h.library.statistics.allocatedBytes,0);
 h.files.set(key,original);sheet.retry();sheet.frame('standard',0);await h.library.settle();assert(sheet.frame('standard',0));await h.library.dispose();
 const broken=harness();broken.files.set(broken.url,json({...broken.metadata,id:'fx.explosion.wrong'}));await broken.library.init(broken.descriptor);assert.equal(await broken.library.load(broken.id),undefined);assert.equal(broken.errors.length,1);await broken.library.dispose();
});
test('FX strict residency budget includes pending decode and evicts only old pages under pressure',async()=>{
 const h=harness(true,16);await h.library.init(h.descriptor);const sheet=(await h.library.load(h.id))!;sheet.frame('standard',0);sheet.frame('standard',1);await h.library.settle();assert.equal(h.requests.filter(r=>r.endsWith('.png')).length,1);assert.equal(h.library.statistics.residentPages,1);
 h.setClock(11002);await h.library.trim();assert.deepEqual(h.released,[1]);assert.equal(h.library.statistics.allocatedBytes,0);sheet.frame('standard',1);await h.library.settle();assert(sheet.frame('standard',1));assert.equal(h.library.statistics.allocatedBytes,16);await h.library.dispose();assert.equal(h.library.statistics.allocatedBytes,0);
});
test('FX late texture decode cannot resurrect a released session',async()=>{
 const h=harness();let finish:((value:any)=>void)|undefined;let started!:()=>void;const decoding=new Promise<void>(resolve=>started=resolve);h.textures.load=async(_bytes,width,height)=>{started();return new Promise(resolve=>{finish=resolve})};await h.library.init(h.descriptor);const sheet=(await h.library.load(h.id))!;sheet.frame('standard',0);await decoding;const release=h.library.release();let disposed=0;finish!({value:{id:1},width:2,height:2,dispose(){disposed++}});await release;assert.equal(disposed,1);assert.equal(sheet.frame('standard',0),undefined);assert.equal(h.library.statistics.allocatedBytes,0);assert.deepEqual(h.errors,[]);
});
test('FX decoded image dimension mismatch is released and index integrity mismatch rejects init',async()=>{
 const h=harness();h.textures.load=async()=>({value:{id:1},width:3,height:2,dispose(){h.released.push(1)}});await h.library.init(h.descriptor);const sheet=(await h.library.load(h.id))!;sheet.frame('standard',0);await h.library.settle();assert.deepEqual(h.released,[1]);assert.equal(h.errors.length,1);assert.equal(h.library.statistics.allocatedBytes,0);await h.library.dispose();
 const f=harness();await assert.rejects(f.library.init({...f.descriptor,sha256:hash(json({bad:true}))}),/integrity/);assert.equal(f.library.has(f.id),false);await f.library.dispose();
});

test('FX release during metadata fetch prevents late sheet installation',async()=>{
 const f=fixture();let resolveMetadata!:()=>void;let fetching!:()=>void;const reached=new Promise<void>(resolve=>fetching=resolve),gate=new Promise<void>(resolve=>resolveMetadata=resolve),errors:Error[]=[];
 const fetcher=async(input:RequestInfo|URL)=>{const key=String(input).replace('/art/','');if(key===f.url){fetching();await gate}return new Response(f.files.get(key)!.slice().buffer)};
 const library=new EffectAssetLibrary({fetch:fetcher as typeof fetch,onError:error=>errors.push(error),textures:{async load(){throw Error('No page should load')},crop(){throw Error('No frame should exist')},destroyFrame(){}}});
 await library.init(f.descriptor);const loading=library.load(f.id);await reached;const released=library.release();resolveMetadata();assert.equal(await loading,undefined);await released;assert.deepEqual(library.statistics,{indexedPages:0,residentPages:0,residentBytes:0,allocatedBytes:0});assert.deepEqual(errors,[]);await library.dispose();
});
