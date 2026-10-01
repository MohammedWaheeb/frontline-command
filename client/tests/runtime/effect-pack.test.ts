import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
// @ts-expect-error Build tooling intentionally shares the plain-JS validator with browser TypeScript.
import {artIndex,artPlugin,writeBasePack} from '../../scripts/ui/art-plugin.mjs';
// @ts-expect-error Node-only pack implementation is a build-tool MJS module.
import {authoredEffectPack,inspectEffectPack} from '../../scripts/ui/effect-pack.mjs';
import {fixture,png,hash,json} from './effect-fixture';
async function setup(){const root=await mkdtemp(path.join(tmpdir(),'frontline-fx-pack-')),assets=path.join(root,'assets');await mkdir(path.join(assets,'manifest'),{recursive:true});const f=fixture();await writeFile(path.join(assets,'manifest/asset-manifest.json'),JSON.stringify({entries:[{id:f.id,category:'effect'}]}));return {root,assets,...f}}
async function install(h:Awaited<ReturnType<typeof setup>>,files=h.files){for(const [rel,bytes] of files){const target=path.join(h.assets,'build',rel);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes)}}
test('FX optional absence preserves old art index; complete exact dependency graph is advertised',async()=>{
 const h=await setup();try{assert.equal((await artIndex(h.assets)).effects,undefined);await install(h);const index=await artIndex(h.assets);assert.deepEqual(index.effects,h.descriptor);const pack=await authoredEffectPack(h.assets);assert.equal(pack.files.length,3);assert(pack.files.includes('fx/explosion/small/page0.png'));await writeFile(path.join(h.assets,'build/fx/unreferenced.png'),h.image);assert.equal((await authoredEffectPack(h.assets)).files.length,3)}finally{await rm(h.root,{recursive:true,force:true})}
});
test('FX partial/corrupt/unknown/symlink packs fail instead of advertising completion',async()=>{
 const h=await setup();try{
  await install(h);const page=path.join(h.assets,'build/fx/explosion/small/page0.png');await rm(page);await assert.rejects(artIndex(h.assets));await install(h);await writeFile(page,new Uint8Array(h.image.length));await assert.rejects(artIndex(h.assets),/integrity/);
  await install(h);await writeFile(path.join(h.assets,'manifest/asset-manifest.json'),JSON.stringify({entries:[]}));await assert.rejects(artIndex(h.assets),/absent/);await writeFile(path.join(h.assets,'manifest/asset-manifest.json'),JSON.stringify({entries:[{id:h.id,category:'effect'}]}));
  await rm(page);const outside=path.join(h.root,'outside.png');await writeFile(outside,h.image);await symlink(outside,page);await assert.rejects(artIndex(h.assets),/escapes/);await rm(page);await install(h);
  const invalid=fixture(false,png(2,2,true));await install(h,invalid.files);await assert.rejects(artIndex(h.assets),/header|compression|data|check/i);
 }finally{await rm(h.root,{recursive:true,force:true})}
});
test('FX symlinked root and traversal metadata cannot escape the installed build',async()=>{
 const h=await setup();try{
  await install(h);const fx=path.join(h.assets,'build/fx'),outside=path.join(h.root,'outside-fx');const {rename}=await import('node:fs/promises');await rename(fx,outside);await symlink(outside,fx);await assert.rejects(artIndex(h.assets),/escapes/);await rm(fx);await rename(outside,fx);
  const bad=structuredClone(h.index);bad.effects['fx.explosion.small'].url='fx/explosion/small/../../../private.json';await writeFile(path.join(fx,'index.json'),json(bad));await assert.rejects(artIndex(h.assets),/path/);
 }finally{await rm(h.root,{recursive:true,force:true})}
});
test('FX dev middleware serves checked exact bytes only and rejects traversal/unlisted/corrupt pages',async()=>{
 const h=await setup();let server:ReturnType<typeof createServer>|undefined;try{
  await install(h);let middleware!:(request:IncomingMessage,response:ServerResponse,next:()=>void)=>Promise<void>;artPlugin({assets:h.assets}).configureServer({middlewares:{use(fn:typeof middleware){middleware=fn}}});
  server=createServer((req,res)=>{void middleware(req,res,()=>{res.statusCode=404;res.end()}).catch(error=>{res.statusCode=500;res.end(String(error))})});await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}`;
  const index=await(await fetch(base+'/art/index.json')).json();assert.deepEqual(index.effects,h.descriptor);const result=await fetch(base+'/art/fx/explosion/small/page0.png');assert.equal(result.status,200);assert.equal(hash(new Uint8Array(await result.arrayBuffer())),hash(h.image));
  assert.equal((await fetch(base+'/art/fx/unlisted.png')).status,404);assert.notEqual((await fetch(base+'/art/fx/%2e%2e%2fmanifest/asset-manifest.json')).status,200);
  await writeFile(path.join(h.assets,'build/fx/explosion/small/page0.png'),new Uint8Array(h.image.length));assert.equal((await fetch(base+'/art/fx/explosion/small/page0.png')).status,503);assert.equal((await fetch(base+'/art/index.json')).status,503);
 }finally{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}await rm(h.root,{recursive:true,force:true})}
});
test('FX actual build hook packages referenced files with exact base-pack hashes; tampering rejects repack',async()=>{
 const h=await setup();try{
  await install(h);await writeFile(path.join(h.assets,'build/fx/unreferenced.png'),h.image);const out=path.join(h.root,'dist');await mkdir(path.join(out,'runtime'),{recursive:true});await writeFile(path.join(out,'index.html'),'synthetic packaging test');await writeFile(path.join(out,'runtime/frontline.wasm'),'synthetic test bytes, not a playable runtime');
  const plugin=artPlugin({assets:h.assets,content:path.join(h.root,'content')});plugin.configResolved({build:{outDir:out},command:'build'});await plugin.closeBundle();
  const index=JSON.parse(await readFile(path.join(out,'art/index.json'),'utf8'));assert.deepEqual(index.effects,h.descriptor);const pack=JSON.parse(await readFile(path.join(out,'assets/packs/base.json'),'utf8'));
  for(const [rel,bytes] of h.files){const found=pack.files.find((entry:{path:string})=>entry.path==='/art/'+rel);assert(found);assert.equal(found.sha256,hash(bytes));assert.equal(found.bytes,bytes.length)}assert(!pack.files.some((entry:{path:string})=>entry.path.includes('unreferenced')));
  await inspectEffectPack(path.join(out,'art'),{descriptor:index.effects});const target=path.join(out,'art/fx/explosion/small/page0.png');await writeFile(target,new Uint8Array(h.image.length));await assert.rejects(writeBasePack(out),/integrity/);
 }finally{await rm(h.root,{recursive:true,force:true})}
});
