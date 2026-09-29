import test from 'node:test';
import assert from 'node:assert/strict';
import {ArtLibrary,SpriteSheet,type SpriteMeta} from '../../src/render/art';
import {Texture} from 'pixi.js';
import {RuntimeError} from '../../src/runtime/errors';
import {artGenerationInput} from '../../src/runtime/asset-generation-input';
import {sha256Hex} from '../../src/runtime/crypto';
const origin='http://127.0.0.1:17990',encode=(v:unknown)=>new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v));
async function fixture(version='A'){
 const source=encode({format_version:1,version,packs:[{id:'2.0.0',version,manifest_url:'/assets/packs/base.json'}],maps:[],missions:[]});
 const art={format:1,sprites:{['test.'+version]:'sprite.json'},terrain:[],portraits:[],chrome:[],icons:false,emblems:false};
 const meta={id:'test.'+version,frame_size_2x:[2,2],anchor_2x:[1,1],layers:[],atlases:{'1x':{},'2x':{}},states:[]};
 const bodies=new Map([['/content/index.json',source],['/art/index.json',encode(art)],['/art/sprite.json',encode(meta)]]);
 const pack={id:'2.0.0',version,files:await Promise.all([...bodies].map(async([path,b])=>({path,bytes:b.length,sha256:await sha256Hex(b)})))};
 bodies.set('/assets/packs/base.json',encode(pack));return {source,art,meta,bodies};
}
function host(first:Awaited<ReturnType<typeof fixture>>){let current=first;const requests:string[]=[];const fetcher:typeof fetch=async(input,init)=>{init?.signal?.throwIfAborted();const url=new URL(String(input),origin),body=current.bodies.get(url.pathname);requests.push(url.pathname);return new Response(body?.slice().buffer,{status:body?200:404})};return {fetcher,requests,set(value:typeof first){current=value}}}
test('simultaneous art initialization and sheet requests share one verified generation',async()=>{
 const a=await fixture(),net=host(a),library=new ArtLibrary({origin,fetcher:net.fetcher});
 const [first,second]=await Promise.all([library.init(),library.init()]);assert.equal(first,second);assert.equal(first.sprites['test.A'],'sprite.json');assert.equal(library.generationIdentity?.version,'A');
 const [sheet,duplicate]=await Promise.all([library.sheet('test.A'),library.sheet('test.A')]);assert(sheet);assert.equal(sheet,duplicate);assert.deepEqual(net.requests,['/content/index.json','/assets/packs/base.json','/art/index.json','/art/sprite.json']);
 await library.release();assert.equal(library.statistics.residentPages,0);assert.equal(library.generationIdentity?.version,'A');await library.dispose();await assert.rejects(library.init(),/disposed/);
});
test('a changed host cannot supply new sprite metadata beneath a retained art index',async()=>{
 const a=await fixture(),b=await fixture('B'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});const errors:Error[]=[];library.onError=e=>errors.push(e);await library.init();net.set(b);
 const warn=console.warn;console.warn=()=>{};try{assert.equal(await library.sheet('test.A'),undefined)}finally{console.warn=warn}
 assert.equal(errors.length,1);assert.match(errors[0].message,/differ/);assert.equal(library.generationIdentity?.version,'A');assert.equal(library.index?.sprites['test.A'],'sprite.json');
 const fresh=new ArtLibrary({origin,indexSource:b.source,fetcher:net.fetcher});assert((await fresh.sheet('test.B'))?.meta.id==='test.B');await Promise.all([library.dispose(),fresh.dispose()]);
});
test('failed index replacement keeps prior art; valid idle replacement moves metadata and identity together',async()=>{
 const a=await fixture(),b=await fixture('B'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});const original=await library.init();
 net.set({...b,bodies:new Map([...b.bodies,['/assets/packs/base.json',encode('{}')]])});await assert.rejects(library.useIndex(b.source));assert.equal(library.index,original);assert.equal(library.generationIdentity?.version,'A');
 net.set(b);const next=await library.useIndex(b.source);assert.equal(next,library.index);assert.equal(library.generationIdentity?.version,'B');assert.equal(library.has('test.A'),false);assert.equal((await library.sheet('test.B'))?.meta.id,'test.B');await library.dispose();
});
test('content reload canceled at its idle boundary cannot publish a new generation',async()=>{
 const a=await fixture(),b=await fixture('B'),net=host(a);let idle=true;
 const fetcher:typeof fetch=async(input,init)=>{const response=await net.fetcher(input,init);if(new URL(String(input),origin).pathname==='/art/index.json'&&net.requests.filter(p=>p==='/art/index.json').length===2)idle=false;return response};
 const library=new ArtLibrary({origin,indexSource:a.source,fetcher});const original=await library.init();net.set(b);await assert.rejects(library.useIndex(b.source,()=>idle),/no longer idle/);assert.equal(library.index,original);assert.equal(library.generationIdentity?.version,'A');await library.dispose();
});
test('dispose aborts pending initialization and prevents late generation publication',async()=>{
 const a=await fixture();let entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve);
 const fetcher:typeof fetch=async(_input,init)=>{entered();return new Promise((_resolve,reject)=>{const stop=()=>reject(new DOMException('Canceled','AbortError'));if(init?.signal?.aborted)stop();else init?.signal?.addEventListener('abort',stop,{once:true})})};
 const library=new ArtLibrary({origin,indexSource:a.source,fetcher}),pending=library.init(),rejected=assert.rejects(pending);await started;await library.dispose();await rejected;assert.equal(library.index,undefined);assert.equal(library.generationIdentity,undefined);assert.equal(library.statistics.residentBytes,0);
});
test('generation adapter keeps bytes exact and excludes private, cross-origin and non-GET requests',async()=>{
 const a=await fixture(),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});await library.init();const response=await library.fetch('/art/index.json');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),a.bodies.get('/art/index.json'));assert.equal(response.headers.get('content-type'),'application/json');
 for(const input of ['/api/v1/profile','https://elsewhere.test/art/index.json','/art/index.json?version=B'])await assert.rejects(library.fetch(input));await assert.rejects(library.fetch('/art/index.json',{method:'POST'}));await library.dispose();
});
test('index capture preserves exact whitespace and rejects oversized/incompatible data',async()=>{
 const a=await fixture(),pretty=encode(JSON.stringify(JSON.parse(new TextDecoder().decode(a.source)),null,2));const input=await artGenerationInput(async()=>new Response(pretty.slice().buffer));assert.deepEqual(input.source,pretty);assert.equal(input.packId,'2.0.0');
 await assert.rejects(artGenerationInput(async()=>new Response(new Uint8Array((1<<20)+1))));await assert.rejects(artGenerationInput(async()=>new Response('{}',{status:503})));await assert.rejects(artGenerationInput(async()=>new Response('{}')));
});
test('a full 136-type roster request completes without caching queue overflow as missing art',async()=>{
 const a=await fixture(),ids=Array.from({length:136},(_,i)=>'test.A.'+i);a.art.sprites=Object.fromEntries(ids.map((id,i)=>[id,`roster/${i}.json`]));
 a.bodies.set('/art/index.json',encode(a.art));for(const [i,id]of ids.entries())a.bodies.set(`/art/roster/${i}.json`,encode({...a.meta,id}));
 a.bodies.delete('/assets/packs/base.json');const files=await Promise.all([...a.bodies].map(async([path,b])=>({path,bytes:b.length,sha256:await sha256Hex(b)})));a.bodies.set('/assets/packs/base.json',encode({id:'2.0.0',version:'A',files}));
 const net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher}),errors:Error[]=[];library.onError=e=>errors.push(e);await library.init();const sheets=await Promise.all(ids.map(id=>library.sheet(id)));
 assert.deepEqual(errors,[]);assert.deepEqual(sheets.map(sheet=>sheet?.id),ids);assert.equal(library.generationStatistics?.queued,0);assert.equal(library.generationStatistics?.inFlight,0);await library.dispose();
});
test('transient metadata failures can retry and explicit same-index reload verifies a fresh capture',async()=>{
 const a=await fixture(),net=host(a);let fail=true;const fetcher:typeof fetch=(input,init)=>new URL(String(input),origin).pathname==='/art/sprite.json'&&fail?Promise.resolve(new Response('unavailable',{status:503})):net.fetcher(input,init);
 const library=new ArtLibrary({origin,indexSource:a.source,fetcher});await library.init();const warn=console.warn;console.warn=()=>{};try{assert.equal(await library.sheet('test.A'),undefined)}finally{console.warn=warn}
 fail=false;assert.equal((await library.sheet('test.A'))?.id,'test.A');const identity=library.generationIdentity?.key,before=net.requests.length;await library.useIndex(a.source);assert.equal(library.generationIdentity?.key,identity);assert.deepEqual(net.requests.slice(before),['/assets/packs/base.json','/art/index.json']);await library.dispose();
});
test('an image download failure does not retain a rejected image promise',async()=>{
 const a=await fixture();a.bodies.set('/art/image.png',encode('original'));a.bodies.delete('/assets/packs/base.json');const files=await Promise.all([...a.bodies].map(async([path,b])=>({path,bytes:b.length,sha256:await sha256Hex(b)})));a.bodies.set('/assets/packs/base.json',encode({id:'2.0.0',version:'A',files}));
 const net=host(a);let tries=0;const fetcher:typeof fetch=(input,init)=>new URL(String(input),origin).pathname==='/art/image.png'?Promise.resolve(++tries===1?new Response('unavailable',{status:503}):new Response('changed!')):net.fetcher(input,init);
 const library=new ArtLibrary({origin,indexSource:a.source,fetcher});await library.init();await assert.rejects(library.image('/art/image.png'),(e:any)=>e.code==='asset_unavailable');await assert.rejects(library.image('/art/image.png'),(e:any)=>e.code==='asset_integrity');assert.equal(tries,2,'The second read really reached the host; corrupt recovery bytes remain rejected before decoding.');await library.dispose();
});
test('a transient sprite page retries after a bounded delay and disposes its owned texture',async()=>{
 const meta={id:'test',states:[{name:'idle',part:'body',directions:1,frames:1,fps:0,loop:false}]} as SpriteMeta;
 const page={url:'/art/page.png',layer:'shadow',descriptors:{'idle/d00_f00':{frame:{x:0,y:0,w:1,h:1},sourceSize:{w:1,h:1}}},frames:new Map(),lastUsed:0,bytes:0,generation:0};let attempts=0,disposed=0,reports=0;
 const sheet=new SpriteSheet('test',meta,'1x',[page],async()=>{if(++attempts===1)throw new RuntimeError('asset_unavailable','Temporary host interruption');return {texture:Texture.EMPTY,dispose(){disposed++}}},()=>reports++);
 const warn=console.warn;console.warn=()=>{};try{sheet.frame('shadow','idle',0,0);await sheet.settle()}finally{console.warn=warn}
 assert.equal(reports,1);assert.equal(attempts,1);sheet.frame('shadow','idle',0,0);assert.equal(attempts,1,'No per-frame retry storm');await new Promise(resolve=>setTimeout(resolve,300));sheet.frame('shadow','idle',0,0);await sheet.settle();assert(sheet.frame('shadow','idle',0,0));assert.equal(attempts,2);await sheet.dispose();assert.equal(disposed,1);assert.equal(sheet.statistics.residentBytes,0);
});
test('a hard integrity error after a transient retry is surfaced and remains held',async()=>{
 const meta={id:'test',states:[{name:'idle',part:'body',directions:1,frames:1,fps:0,loop:false}]} as SpriteMeta;
 const page={url:'/art/page.png',layer:'shadow',descriptors:{'idle/d00_f00':{frame:{x:0,y:0,w:1,h:1},sourceSize:{w:1,h:1}}},frames:new Map(),lastUsed:0,bytes:0,generation:0};let attempts=0;const reports:string[]=[];
 const sheet=new SpriteSheet('test',meta,'1x',[page],async()=>{attempts++;throw new RuntimeError(attempts===1?'asset_unavailable':'asset_integrity',attempts===1?'Temporary host interruption':'Corrupt recovery bytes')},error=>reports.push((error as RuntimeError).code));
 const warn=console.warn;console.warn=()=>{};try{
  sheet.frame('shadow','idle',0,0);await sheet.settle();await new Promise(resolve=>setTimeout(resolve,300));sheet.frame('shadow','idle',0,0);await sheet.settle();
 }finally{console.warn=warn}
 assert.deepEqual(reports,['asset_unavailable','asset_integrity']);for(let i=0;i<100;i++)sheet.frame('shadow','idle',0,0);assert.equal(attempts,2,'Hard errors do not create an automatic retry loop');assert.equal(sheet.statistics.residentPages,0);await sheet.dispose();
});
