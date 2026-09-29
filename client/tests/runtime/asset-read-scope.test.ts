import test from 'node:test';
import assert from 'node:assert/strict';
import {ArtLibrary} from '../../src/render/art';
import {sha256Hex} from '../../src/runtime/crypto';

const origin='http://127.0.0.1:17990';
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const turn=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
async function fixture(version:string){
 const source=encode({format_version:1,version,packs:[{id:'2.0.0',version,manifest_url:'/assets/packs/base.json'}],maps:[],missions:[]});
 const atlas={frames:{idle:{frame:{x:version==='A'?1:37,y:0,w:2,h:2}}},meta:{image:'page.png'}};
 const bodies=new Map<string,Uint8Array>([
  ['/content/index.json',source],
  ['/art/index.json',encode({format:1,sprites:{test:'sprite.json'},terrain:[],portraits:[],chrome:[],icons:false,emblems:false})],
  ['/art/atlas.json',encode(atlas)],
  // The fake decoder below observes loader ownership; these are distinct bytes,
  // not a claim about decoding real PNGs or browser rendering.
  ['/art/page.png',encode({pixels:version})],
 ]);
 const manifest={id:'2.0.0',version,files:await Promise.all([...bodies].map(async([path,body])=>({path,bytes:body.length,sha256:await sha256Hex(body)})))};
 bodies.set('/assets/packs/base.json',encode(manifest));return {source,bodies,atlas};
}
function host(initial:Awaited<ReturnType<typeof fixture>>){
 let current=initial;
 const requests:string[]=[];
 let hold:Promise<void>|undefined;
 const fetcher:typeof fetch=async(input,init)=>{
  init?.signal?.throwIfAborted();const path=new URL(String(input),origin).pathname;
  requests.push(path);const bytes=current.bodies.get(path)?.slice();
  if(path==='/art/page.png')await hold;
  init?.signal?.throwIfAborted();return new Response(bytes?.buffer,{status:bytes?200:404});
 };
 return {fetcher,requests,set(next:typeof initial){current=next},pause(value?:Promise<void>){hold=value}};
}
class FakeImage{
 static instances:FakeImage[]=[];
 static mode:'load'|'hold'|'error'='load';
 onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
 private url='';
 constructor(){FakeImage.instances.push(this)}
 set src(value:string){this.url=value;if(value&&FakeImage.mode!=='hold')queueMicrotask(()=>FakeImage.mode==='error'?this.onerror?.():this.onload?.())}
 get src(){return this.url}
}
async function withImages(run:()=>Promise<void>){
 const previous=globalThis.Image;FakeImage.instances=[];FakeImage.mode='load';
 globalThis.Image=FakeImage as unknown as typeof Image;
 try{await run()}finally{if(previous)globalThis.Image=previous;else Reflect.deleteProperty(globalThis,'Image')}
}

test('one captured draw deduplicates exact metadata and owned image leases; release is idempotent',()=>withImages(async()=>{
 const a=await fixture('A'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});
 const scope=await library.readScope(),[meta,sameMeta]=await Promise.all([scope.json('/art/atlas.json'),scope.json('/art/atlas.json')]);
 assert.deepEqual(meta,a.atlas);assert.equal(meta,sameMeta);
 const [image,sameImage]=await Promise.all([scope.image('/art/page.png'),scope.image('/art/page.png')]);
 assert.equal(image,sameImage);assert.match(image.src,/^blob:/);assert.equal(library.generationStatistics?.leases,1);
 assert.equal(net.requests.filter(path=>path==='/art/atlas.json').length,1);assert.equal(net.requests.filter(path=>path==='/art/page.png').length,1);
 scope.release();scope.release();assert.equal(image.src,'');assert.equal(library.generationStatistics?.leases,0);assert.equal(library.generationStatistics?.leaseBytes,0);
 await assert.rejects(scope.json('/art/atlas.json'),{name:'AbortError'});await library.dispose();
}));

test('A atlas coordinates cannot consume changed B pixels at the same URL',()=>withImages(async()=>{
 const a=await fixture('A'),b=await fixture('B'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});
 const scope=await library.readScope();assert.deepEqual(await scope.json('/art/atlas.json'),a.atlas);net.set(b);
 await assert.rejects(scope.image('/art/page.png'),(error:any)=>error.code==='asset_integrity');
 assert.equal(FakeImage.instances.length,0);assert.equal(scope.identity.version,'A');assert.equal(library.generationStatistics?.leases,0);
 scope.release();await library.dispose();
}));

test('idle replacement cancels delayed A reads; a new scope reads B geometry and image',()=>withImages(async()=>{
 const a=await fixture('A'),b=await fixture('B'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});
 const old=await library.readScope();await old.json('/art/atlas.json');let resume!:()=>void;net.pause(new Promise(resolve=>resume=resolve));
 const pending=old.image('/art/page.png'),rejection=assert.rejects(pending);await turn();net.set(b);await library.useIndex(b.source);
 assert.equal(old.signal.aborted,true);assert.throws(()=>old.assertCurrent(),{name:'AbortError'});resume();await rejection;
 net.pause();const next=await library.readScope();assert.equal(next.identity.version,'B');assert.deepEqual(await next.json('/art/atlas.json'),b.atlas);const image=await next.image('/art/page.png');assert.match(image.src,/^blob:/);
 next.release();assert.equal(library.generationStatistics?.leases,0);await library.dispose();
}));

test('failed replacement keeps the old scope and its loaded image available',()=>withImages(async()=>{
 const a=await fixture('A'),b=await fixture('B'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});
 const scope=await library.readScope(),image=await scope.image('/art/page.png'),url=image.src;
 net.set({...b,bodies:new Map([...b.bodies,['/assets/packs/base.json',encode({})]])});await assert.rejects(library.useIndex(b.source));
 scope.assertCurrent();assert.equal((await scope.image('/art/page.png')).src,url);assert.equal(scope.identity.version,'A');assert.equal(library.generationStatistics?.leases,1);
 scope.release();await library.dispose();
}));

test('resize or unmount cancellation during decode rejects promptly and clears the image and lease',()=>withImages(async()=>{
 const a=await fixture('A'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher}),abort=new AbortController();
 const scope=await library.readScope(abort.signal);FakeImage.mode='hold';const pending=scope.image('/art/page.png'),rejection=assert.rejects(pending,{name:'AbortError'});
 for(let i=0;i<20&&!FakeImage.instances.length;i++)await turn();assert.equal(FakeImage.instances.length,1);assert.equal(library.generationStatistics?.leases,1);
 abort.abort();await rejection;assert.equal(FakeImage.instances[0].src,'');assert.equal(FakeImage.instances[0].onload,null);assert.equal(library.generationStatistics?.leases,0);assert.equal(library.generationStatistics?.leaseBytes,0);
 await library.dispose();
}));

test('library replacement during image decode cancels old work and disposes its lease',()=>withImages(async()=>{
 const a=await fixture('A'),b=await fixture('B'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});
 const scope=await library.readScope();FakeImage.mode='hold';const pending=scope.image('/art/page.png'),rejection=assert.rejects(pending,{name:'AbortError'});
 for(let i=0;i<20&&!FakeImage.instances.length;i++)await turn();assert.equal(FakeImage.instances.length,1);net.set(b);await library.useIndex(b.source);await rejection;
 assert.equal(FakeImage.instances[0].src,'');assert.equal(scope.signal.aborted,true);assert.equal(library.generationStatistics?.leases,0);await library.dispose();
}));

test('decode failure releases verified bytes and does not silently fetch an unverified URL',()=>withImages(async()=>{
 const a=await fixture('A'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});
 const scope=await library.readScope();FakeImage.mode='error';await assert.rejects(scope.image('/art/page.png'),/decoded/);
 assert.equal(FakeImage.instances[0].src,'');assert.equal(library.generationStatistics?.leases,0);assert.equal(library.generationStatistics?.leaseBytes,0);assert.equal(net.requests.filter(path=>path==='/art/page.png').length,1);
 scope.release();await library.dispose();
}));

test('an already canceled capture performs no subsequent image or metadata read',()=>withImages(async()=>{
 const a=await fixture('A'),net=host(a),library=new ArtLibrary({origin,indexSource:a.source,fetcher:net.fetcher});await library.init();const requests=net.requests.length;
 const abort=new AbortController();abort.abort();await assert.rejects(library.readScope(abort.signal),{name:'AbortError'});assert.equal(net.requests.length,requests);assert.equal(FakeImage.instances.length,0);await library.dispose();
}));
