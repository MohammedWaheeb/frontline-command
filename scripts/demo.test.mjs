import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileInventory,fileDigest} from './package-integrity.mjs';
import {verifyDemoPackage,matchesDemo} from './demo.mjs';

const target={platform:'darwin',arch:'arm64'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function put(root,name,bytes){const file=path.join(root,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes)}
async function inventory(root){
 const files=[];
 for(const entry of await fileInventory(root,{excludeRoot:['data','package-files.json']}))files.push({...entry,...await fileDigest(path.join(root,entry.path))});
 await put(root,'package-files.json',JSON.stringify({format_version:1,files}));
}
async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'frontline-demo-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const runtime={adapter:'1',content_hash:'a'.repeat(64),go:'go1.27.1',protocol:1,simulation:'0.3.8'};
 const index='<html><script src="/runtime/worker.js"></script></html>';
 const product={
  'index.html':index,
  'runtime/version.json':JSON.stringify(runtime),
  'runtime/worker.js':'worker fixture',
  'runtime/frontline.wasm':'wasm fixture',
  'runtime/wasm_exec.js':'wasm exec fixture',
  'service-worker.js':'service worker fixture',
  'art/index.json':'{}',
  'content/index.json':JSON.stringify({packs:[{id:'2.0.0',version:'content-v1-fixture',manifest_url:'/assets/packs/base.json'}]}),
 };
 const pack=JSON.stringify({id:'2.0.0',version:'content-v1-fixture',files:Object.entries(product).map(([name,bytes])=>({path:'/'+name,bytes:Buffer.byteLength(bytes),sha256:digest(bytes)}))});
 const version={...runtime,...target,source_dirty:true,product_pack:{id:'2.0.0',version:'content-v1-fixture',packSHA256:digest(pack),runtime,files:Object.keys(product).length}};
 const native=Buffer.alloc(256);native.writeUInt32LE(0xfeedfacf,0);native.writeUInt32LE(0x100000c,4);
 await put(root,'frontline',native);await chmod(path.join(root,'frontline'),0o755);
 for(const [name,bytes]of Object.entries(product))await put(root,'client/'+name,bytes);
 await put(root,'client/assets/packs/base.json',pack);
 await put(root,'version.json',JSON.stringify(version));
 await put(root,'content/maps/map.json','{}');
 await put(root,'content/missions/mission.json','{}');
 await inventory(root);
 return {root,runtime,index,pack,version};
}

test('demo verifies the complete production package while ignoring mutable host data',async t=>{
 const {root}=await fixture(t);
 await put(root,'data/.pending-write','mutable temporary bytes');
 await put(root,'data/frontline.db','mutable database fixture');
 await symlink(path.join(root,'version.json'),path.join(root,'data/runtime-alias'));
 await put(root,'.DS_Store','Finder metadata');
 const before=await readFile(path.join(root,'data/frontline.db'));
 await verifyDemoPackage(root,target);
 assert.deepEqual(await readFile(path.join(root,'data/frontline.db')),before);
});

test('demo rejects changed bytes even when the file length is unchanged',async t=>{
 const {root}=await fixture(t);
 const file=path.join(root,'client/runtime/worker.js'),bytes=await readFile(file);
 bytes[0]^=1;await writeFile(file,bytes);
 await assert.rejects(verifyDemoPackage(root,target));
});

test('demo rejects missing and additional packaged files',async t=>{
 const {root}=await fixture(t);
 const file=path.join(root,'client/runtime/worker.js'),bytes=await readFile(file);
 await rm(file);await assert.rejects(verifyDemoPackage(root,target));
 await writeFile(file,bytes);await put(root,'client/unexpected.js','unreviewed extra code');
 await assert.rejects(verifyDemoPackage(root,target));
});

test('demo rejects symlinked static files and directory ancestors',async t=>{
 const {root}=await fixture(t);
 const worker=path.join(root,'client/runtime/worker.js');
 await rm(worker);await symlink(path.join(root,'client/runtime/wasm_exec.js'),worker);
 await assert.rejects(verifyDemoPackage(root,target));
 await rm(worker);await put(root,'client/runtime/worker.js','worker fixture');
 await rm(path.join(root,'content/maps'),{recursive:true});
 await symlink(path.join(root,'content/missions'),path.join(root,'content/maps'));
 await assert.rejects(verifyDemoPackage(root,target));
});

test('demo rejects malformed, duplicate, unsafe and mutable inventory entries',async t=>{
 const {root}=await fixture(t);
 const original=JSON.parse(await readFile(path.join(root,'package-files.json'),'utf8'));
 const first=original.files[0];
 const invalid=[
  {...original,format_version:2},
  {...original,files:[...original.files,first]},
  {...original,files:original.files.map((entry,i)=>i?entry:{...entry,path:'../outside'})},
  {...original,files:original.files.map((entry,i)=>i?entry:{...entry,path:'/absolute'})},
  {...original,files:original.files.map((entry,i)=>i?entry:{...entry,path:'client\\escape.js'})},
  {...original,files:original.files.map((entry,i)=>i?entry:{...entry,path:'data/frontline.db'})},
  {...original,files:original.files.map((entry,i)=>i?entry:{...entry,bytes:-1})},
  {...original,files:original.files.map((entry,i)=>i?entry:{...entry,bytes:0.5})},
  {...original,files:original.files.map((entry,i)=>i?entry:{...entry,sha256:'bad'})},
 ];
 for(const manifest of invalid){await put(root,'package-files.json',JSON.stringify(manifest));await assert.rejects(verifyDemoPackage(root,target))}
});

test('demo checks both recorded platform and actual executable architecture',async t=>{
 const {root,version}=await fixture(t);
 await assert.rejects(verifyDemoPackage(root,{platform:'linux',arch:'arm64'}));
 await put(root,'version.json',JSON.stringify({...version,arch:'x64'}));await inventory(root);
 await assert.rejects(verifyDemoPackage(root,target));
 await put(root,'version.json',JSON.stringify(version));
 const native=await readFile(path.join(root,'frontline'));native.writeUInt32LE(0x1000007,4);
 await put(root,'frontline',native);await inventory(root);
 await assert.rejects(verifyDemoPackage(root,target));
});

test('demo rejects internally inconsistent runtime or product identities',async t=>{
 const {root,version,runtime}=await fixture(t);
 await put(root,'client/runtime/version.json',JSON.stringify({...runtime,simulation:'different'}));await inventory(root);
 await assert.rejects(verifyDemoPackage(root,target));
 await put(root,'client/runtime/version.json',JSON.stringify(runtime));
 await put(root,'version.json',JSON.stringify({...version,product_pack:{...version.product_pack,packSHA256:'b'.repeat(64)}}));await inventory(root);
 await assert.rejects(verifyDemoPackage(root,target));
});

test('demo readiness requires matching production health, HTML and offline manifest',async t=>{
 const {root,runtime,index,pack}=await fixture(t);
 const verified=await verifyDemoPackage(root,target);
 let health={status:'ok',simulation:runtime.simulation,protocol:runtime.protocol,content_hash:runtime.content_hash,tick_rate:20,local:true,load_profile:'',state_updates_hz:10};
 let servedIndex=index,servedPack=pack,status=200;
 const server=createServer((request,response)=>{
  response.statusCode=status;
  if(request.url==='/api/v1/health'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(health))}
  else if(request.url==='/assets/packs/base.json'){response.setHeader('Content-Type','application/json');response.end(servedPack)}
  else if(request.url==='/'){response.end(servedIndex)}
  else{response.statusCode=404;response.end('missing')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));
 const origin=`http://127.0.0.1:${server.address().port}`;
 assert.equal(await matchesDemo(origin,verified),true);
 for(const [key,value]of [['status','starting'],['simulation','old'],['protocol',999],['content_hash','old'],['tick_rate',10],['load_profile','loopback-500'],['local',false],['state_updates_hz',20]]){
  const previous=health;health={...health,[key]:value};
  assert.equal(await matchesDemo(origin,verified),false,`mismatched ${key}`);health=previous;
 }
 servedIndex+='changed';assert.equal(await matchesDemo(origin,verified),false);servedIndex=index;
 servedPack+=' ';assert.equal(await matchesDemo(origin,verified),false);servedPack=pack;
 status=503;assert.equal(await matchesDemo(origin,verified),false);
});
