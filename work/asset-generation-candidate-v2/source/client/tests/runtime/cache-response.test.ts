import test from 'node:test';
import assert from 'node:assert/strict';
import {installPack,READY_PATH} from '../../src/runtime/cache';
import {sha256Hex} from '../../src/runtime/crypto';

test('verified pack responses drop transport and Vary headers without changing bytes or content type',async()=>{
 const original=new Map<string,PropertyDescriptor|undefined>();const replace=(name:string,value:unknown)=>{original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,value})};
 const records=new Map<string,Response>(),origin='http://127.0.0.1:4321',data=new TextEncoder().encode('export const game="verified";'),url=origin+'/assets/game.js';
 const cache={put:async(key:RequestInfo|URL,response:Response)=>{records.set(String(key),response)},match:async(key:RequestInfo|URL)=>records.get(String(key)),keys:async()=>[...records.keys()]};
 replace('location',{origin});replace('isSecureContext',true);replace('navigator',{serviceWorker:{}});replace('caches',{keys:async()=>[],open:async()=>cache,delete:async()=>true});
 let sourceHeaders:Headers|undefined;replace('fetch',async()=>{const response=new Response(data,{headers:{'Content-Type':'text/javascript','Vary':'Origin, Accept-Encoding','Content-Encoding':'gzip','Content-Length':String(data.length),'Cache-Control':'public, max-age=3600'}});Object.defineProperty(response,'url',{value:url});sourceHeaders=response.headers;return response});
 try{
  await installPack({id:'test',version:'1',files:[{path:'/assets/game.js',bytes:data.length,sha256:await sha256Hex(data)}]});
  const saved=records.get(url)!;assert.ok(saved);assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),data);
  assert.equal(saved.headers.get('Content-Type'),'text/javascript');assert.equal(saved.headers.get('Cache-Control'),'public, max-age=3600');
  for(const header of ['Vary','Content-Encoding','Content-Length'])assert.equal(saved.headers.get(header),null);
  assert.equal(sourceHeaders?.get('Vary'),'Origin, Accept-Encoding');assert.ok(records.has(READY_PATH));
 }finally{for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name)}}
});
