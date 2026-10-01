import test from 'node:test';
import assert from 'node:assert/strict';
import {installPack,installedPacks,PACK_PREFIX,READY_PATH,MANIFEST_PATH,type ContentPack} from '../../src/runtime/cache';
import {offlineResponse} from '../../src/runtime/offline-response';
import {sha256Hex} from '../../src/runtime/crypto';

test('completed content upgrades remain coherent offline; corrupt staging cannot activate or delete old packs',async()=>{
 const origin='http://127.0.0.1:4321',original=new Map<string,PropertyDescriptor|undefined>();
 const replace=(name:string,value:unknown)=>{original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,value})};
 const key=(value:RequestInfo|URL)=>new URL(value instanceof Request?value.url:String(value),origin).href;
 const stores=new Map<string,Map<string,Response>>();
 const cache=(name:string)=>{let records=stores.get(name);if(!records){records=new Map();stores.set(name,records)}return {put:async(url:RequestInfo|URL,response:Response)=>{records!.set(key(url),response.clone())},match:async(url:RequestInfo|URL)=>records!.get(key(url))?.clone(),keys:async()=>[...records!.keys()].map(url=>new Request(url))}};
 replace('location',{origin});replace('isSecureContext',true);replace('navigator',{serviceWorker:{}});replace('caches',{keys:async()=>[...stores.keys()],open:async(name:string)=>cache(name),delete:async(name:string)=>stores.delete(name)});
 let online=true,fetches=0,corrupt='',heldURL='',releaseHeld=()=>{},startedHeld=()=>{};let held=Promise.resolve();const body=new Map<string,string>();
 replace('fetch',async(request:RequestInfo|URL)=>{fetches++;if(!online)throw Error('network disabled');const url=key(request),text=body.get(url);if(url===heldURL){startedHeld();await held}const response=new Response(url===corrupt?'bad wasm':text??'missing',{status:text===undefined?404:200,headers:{'Content-Type':url.endsWith('.json')?'application/json':'text/javascript'}});Object.defineProperty(response,'url',{value:url});return response});
 const now=Date.now;Date.now=()=>1000;
 const pack=async(version:string,files:Record<string,string>):Promise<ContentPack>=>({id:'2.0.0',version,files:await Promise.all(Object.entries(files).map(async([path,text])=>({path,bytes:new TextEncoder().encode(text).length,sha256:await sha256Hex(new TextEncoder().encode(text))})))});
 const network=(files:Record<string,string>)=>{body.clear();for(const[path,text]of Object.entries(files))body.set(origin+path,text)};
 const offline=async(path:string)=>{online=false;return offlineResponse(new Request(origin+path))};
 try{
  // Reproduce the active worker's host-404/cache-200 manifest failure: this
  // virtual URL has no server route, including when the host is reachable.
  assert.equal((await fetch(origin+MANIFEST_PATH)).status,404);
  const stagingName=PACK_PREFIX+'manifest-without-ready',staging=await caches.open(stagingName);
  await staging.put(MANIFEST_PATH,new Response('{"untrusted":true}'));
  const beforeMissingMarker=fetches;
  assert.equal((await offlineResponse(new Request(origin+MANIFEST_PATH))).status,503,'A staged manifest without its ready marker is unavailable');
  assert.equal(fetches,beforeMissingMarker,'Virtual metadata never asks the live host');
  await caches.delete(stagingName);
  const oldFiles={'/index.html':'old shell','/content/index.json':'old index','/runtime/frontline.wasm':'old wasm','/retired.js':'retired code'},old=await pack('content-v1-old',oldFiles);network(oldFiles);const first=await installPack(old);assert.equal(first.installedAt,1000);
  const beforeManifest=fetches,installedManifest=await offlineResponse(new Request(origin+MANIFEST_PATH));
  assert.equal(installedManifest.status,200,'Installed virtual metadata wins over a live host 404');
  const storedManifest=await (await caches.open(first.cacheName)).match(MANIFEST_PATH);assert(storedManifest);
  const installedBytes=await installedManifest.text();assert.equal(installedBytes,await storedManifest.text(),'Virtual response preserves the actual installer cache bytes');
  assert.deepEqual(JSON.parse(installedBytes),{id:old.id,version:old.version,files:old.files});
  assert.equal(fetches,beforeManifest,'Installed virtual metadata uses no network request');
  body.delete(origin+'/retired.js');assert.equal((await offlineResponse(new Request(origin+'/retired.js'))).status,404,'Ordinary network 404 policy is unchanged');body.set(origin+'/retired.js',oldFiles['/retired.js']);
  assert.equal(await (await offline('/content/index.json')).text(),'old index');
  const newFiles={'/index.html':'new shell','/content/index.json':'new index','/runtime/frontline.wasm':'new wasm'},next=await pack('content-v1-new',newFiles);online=true;network(newFiles);corrupt=origin+'/runtime/frontline.wasm';await assert.rejects(installPack(next),/integrity check/);assert.equal(stores.size,1);assert.equal(await (await offline('/content/index.json')).text(),'old index');
  // An interrupted staging cache has no ready marker and never wins selection.
  const partial=await caches.open(PACK_PREFIX+'interrupted');await partial.put(origin+'/content/index.json',new Response('partial index'));assert.equal(await (await offline('/content/index.json')).text(),'old index');
  online=true;corrupt='';const second=await installPack(next);assert.equal(second.installedAt,1001,'same clock millisecond must still order activation');assert.notEqual(second.cacheName,first.cacheName);
  assert.equal(await (await offline('/content/index.json')).text(),'new index');const navigation=new Request(origin+'/');Object.defineProperty(navigation,'mode',{value:'navigate'});assert.equal(await (await offlineResponse(navigation)).text(),'new shell');assert.equal(await (await offline('/runtime/frontline.wasm')).text(),'new wasm');assert.equal((await offline('/retired.js')).status,503,'retired same-ID file must not be mixed into the new generation');
  assert(stores.has(first.cacheName),'retired cache remains available for explicit rollback');assert.equal((await installedPacks()).length,2);const before=fetches;assert.equal((await installPack(next)).cacheName,second.cacheName);assert.equal(fetches,before,'unchanged ready pack is reused without network');
  const rollback=await installPack(old);assert.equal(rollback.cacheName,first.cacheName);assert.equal(rollback.installedAt,1002);assert.equal(fetches,before,'explicit cached rollback needs no download');assert.equal(await (await offline('/content/index.json')).text(),'old index');
  const marker=await (await caches.open(first.cacheName)).match(READY_PATH);assert.equal((await marker!.json()).version,old.version);
  const controller=new AbortController();controller.abort();await assert.rejects(installPack(next,undefined,controller.signal),(error:any)=>error.code==='download_canceled');assert.equal((await installedPacks())[0].cacheName,first.cacheName,'initial cancellation cannot activate a cached rollback');
  // Model origin-wide Web Locks for the actual installer; no HTTP server/browser.
  let tail=Promise.resolve(),locks=0;Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_name:string,_options:unknown,callback:()=>Promise<unknown>)=>{locks++;const next=tail.then(callback);tail=next.then(()=>{},()=>{});return next}}});
  online=true;const a=await pack('content-v1-slow',{'/a.js':'A'}),b=await pack('content-v1-fast',{'/b.js':'B'});body.set(origin+'/a.js','A');body.set(origin+'/b.js','B');heldURL=origin+'/a.js';held=new Promise<void>(resolve=>{releaseHeld=resolve});const began=new Promise<void>(resolve=>{startedHeld=resolve});
  const slow=installPack(a);await began;const fast=await installPack(b);releaseHeld();const later=await slow;assert(later.installedAt>fast.installedAt,'late completion must read the newer committed activation');assert(locks>=4);assert.equal(await (await offline('/a.js')).text(),'A');assert.equal((await offline('/b.js')).status,503);
  // Old implementations could produce equal timestamps. Both readers choose
  // the same deterministic winner, and explicitly choosing the loser rolls back.
  const tied=[later,fast].sort((x,y)=>x.cacheName<y.cacheName?-1:1);
  for(const item of tied){item.installedAt=2000;await (await caches.open(item.cacheName)).put(READY_PATH,new Response(JSON.stringify(item)))}
  assert.equal((await installedPacks())[0].cacheName,tied[0].cacheName);
  const winningPath=tied[0].version===a.version?'/a.js':'/b.js',losingPack=tied[1].version===a.version?a:b;
  assert.equal((await offline(winningPath)).status,200);
  const tiedRollback=await installPack(losingPack);assert.equal(tiedRollback.installedAt,2001);assert.equal((await installedPacks())[0].cacheName,tied[1].cacheName);assert.equal((await offline(winningPath)).status,503);

 }finally{Date.now=now;for(const[name,descriptor]of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name)}}
});
