import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {artIndex,writeBasePack,artPlugin} from './art-plugin.mjs';
const put=async(root,rel,bytes)=>{const file=path.join(root,rel);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes)};
test('an in-progress sprite is excluded until every declared atlas image exists',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-art-index-'));try{
  await put(dir,'build/sprites/test/test.sprite.json',JSON.stringify({atlases:{'2x':{beauty:['body.json'],team:['team.json']}}}));
  await put(dir,'build/sprites/test/body.json',JSON.stringify({meta:{image:'body.png'}}));await put(dir,'build/sprites/test/body.png','test pixels');
  await put(dir,'build/sprites/test/team.json',JSON.stringify({meta:{image:'team.png'}}));
  assert.deepEqual((await artIndex(dir)).sprites,{});await put(dir,'build/sprites/test/team.png','test mask');
  assert.deepEqual((await artIndex(dir)).sprites,{test:'sprites/test/test.sprite.json'});
  await put(dir,'build/sprites/test/team.json',JSON.stringify({meta:{image:'../outside.png'}}));assert.deepEqual((await artIndex(dir)).sprites,{});
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('base pack uses exact built file hashes and excludes self and source maps',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-pack-'));try{
  await put(dir,'index.html','<main>Built product</main>');await put(dir,'runtime/frontline.wasm',new Uint8Array([0,97,115,109]));await put(dir,'runtime/worker.js','actual built worker fixture');await put(dir,'runtime/worker.js.map','source map');await put(dir,'content/index.json','{"format_version":1,"maps":[],"missions":[]}');
  const first=await writeBasePack(dir);assert.equal(first.id,'2.0.0');assert.equal(first.files.length,4);
  for(const file of first.files){const bytes=await readFile(path.join(dir,file.path));assert.equal(file.bytes,bytes.length);assert.equal(file.sha256,createHash('sha256').update(bytes).digest('hex'))}
  assert.deepEqual(await writeBasePack(dir),first);assert.equal(await readFile(path.join(dir,'index.html'),'utf8'),'<main>Built product</main>');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('a frontend-only build cannot advertise a working offline game pack',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-pack-missing-'));try{await put(dir,'index.html','<main>Missing WASM</main>');await assert.rejects(writeBasePack(dir),/Build the actual Go runtime/)}finally{await rm(dir,{recursive:true,force:true})}
});

test('packaging rejects content whose bytes changed after the index was authored',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-pack-stale-'));try{
  await put(dir,'index.html','<main>Game</main>');await put(dir,'runtime/frontline.wasm','wasmfixture');await put(dir,'content/maps/test.json','changed');
  await put(dir,'content/index.json',JSON.stringify({format_version:1,maps:[{id:'test',url:'/content/maps/test.json',bytes:3,sha256:'a'.repeat(64)}],missions:[]}));
  await assert.rejects(writeBasePack(dir),/Content changed while packaging/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('audio pack verifies primary and codec fallback exact bytes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-pack-audio-'));try{
  await put(dir,'index.html','<main>Game</main>');await put(dir,'runtime/frontline.wasm','wasmfixture');await put(dir,'art/audio/test.ogg','ogg');await put(dir,'art/audio/test.mp3','mp3');
  const hash=text=>createHash('sha256').update(text).digest('hex');const index={format:1,entries:{'sfx.test':{variants:[{url:'/art/audio/test.ogg',bytes:3,sha256:hash('ogg'),mp3_url:'/art/audio/test.mp3',mp3_bytes:3,mp3_sha256:hash('mp3')}]}}};await put(dir,'art/audio/index.json',JSON.stringify(index));assert.equal((await writeBasePack(dir)).files.length,5);await put(dir,'art/audio/test.mp3','changed');await assert.rejects(writeBasePack(dir),/Audio changed while packaging/);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('optional scenery packaging verifies exact bytes and preserves the last valid pack on mismatch',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-pack-scenery-'));try{
  const hash=text=>createHash('sha256').update(text).digest('hex');
  await put(dir,'index.html','game');await put(dir,'runtime/frontline.wasm','wasm fixture');await put(dir,'content/maps/test.json','map');await put(dir,'content/environment/test.json','scene');
  const entry={id:'test',url:'/content/maps/test.json',bytes:3,sha256:hash('map'),environment:{url:'/content/environment/test.json',bytes:5,sha256:hash('scene')}};
  await put(dir,'content/index.json',JSON.stringify({format_version:1,maps:[entry],missions:[]}));
  const pack=await writeBasePack(dir);assert(pack.files.some(file=>file.path==='/content/environment/test.json'&&file.sha256===hash('scene')));
  const original=await readFile(path.join(dir,'assets/packs/base.json'),'utf8');await put(dir,'content/environment/test.json','stale');
  await assert.rejects(writeBasePack(dir),/Scenery changed while packaging/);assert.equal(await readFile(path.join(dir,'assets/packs/base.json'),'utf8'),original);
  entry.environment.url='/content/maps/test.json';await put(dir,'content/index.json',JSON.stringify({format_version:1,maps:[entry],missions:[]}));
  await assert.rejects(writeBasePack(dir),/Invalid scenery descriptor/);assert.equal(await readFile(path.join(dir,'assets/packs/base.json'),'utf8'),original);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('paired build illustrations are indexed and packaged from the rendered build directory',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-ui-art-'));try{
  const assets=path.join(dir,'assets'),outDir=path.join(dir,'dist');
  await put(assets,'build/ui/icons/build/US.rig@2x.beauty.png','rendered beauty');
  await put(assets,'ui/icons/build/US.rig@2x.beauty.png','wrong raw source');
  assert.deepEqual((await artIndex(assets)).buildIcons,[]);
  await put(assets,'build/ui/icons/build/US.rig@2x.team.png','rendered mask');
  assert.deepEqual((await artIndex(assets)).buildIcons,['US.rig']);
  await put(outDir,'index.html','game');await put(outDir,'runtime/frontline.wasm','wasm fixture');
  const plugin=artPlugin({assets,content:path.join(dir,'content')});plugin.configResolved({command:'build',build:{outDir}});await plugin.closeBundle();
  assert.equal(await readFile(path.join(outDir,'art/ui/icons/build/US.rig@2x.beauty.png'),'utf8'),'rendered beauty');
  assert.equal(await readFile(path.join(outDir,'art/ui/icons/build/US.rig@2x.team.png'),'utf8'),'rendered mask');
  const pack=JSON.parse(await readFile(path.join(outDir,'assets/packs/base.json'),'utf8'));
  assert(pack.files.some(file=>file.path==='/art/ui/icons/build/US.rig@2x.team.png'));
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('optional menu illustration is copied byte-for-byte into the offline pack and absent art is not advertised',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-keyart-pack-'));try{
  const assets=path.join(dir,'assets'),outDir=path.join(dir,'dist');
  assert.equal((await artIndex(assets)).keyArt,undefined);
  // Packaging treats art as opaque bytes; native pixel/decode review is separate.
  const illustration=Buffer.from('original illustration with preserved source metadata');
  await put(assets,'build/ui/keyart/main_menu.png',illustration);
  assert.equal((await artIndex(assets)).keyArt,'ui/keyart/main_menu.png');
  await put(outDir,'index.html','game');await put(outDir,'runtime/frontline.wasm','wasm fixture');
  const plugin=artPlugin({assets,content:path.join(dir,'content')});plugin.configResolved({command:'build',build:{outDir}});await plugin.closeBundle();
  const index=JSON.parse(await readFile(path.join(outDir,'art/index.json'),'utf8'));
  assert.equal(index.keyArt,'ui/keyart/main_menu.png');
  assert.deepEqual(await readFile(path.join(outDir,'art',index.keyArt)),illustration);
  const pack=JSON.parse(await readFile(path.join(outDir,'assets/packs/base.json'),'utf8'));
  assert.deepEqual(pack.files.find(file=>file.path==='/art/ui/keyart/main_menu.png'),{
   path:'/art/ui/keyart/main_menu.png',bytes:illustration.length,sha256:createHash('sha256').update(illustration).digest('hex'),
  });
  await rm(path.join(assets,'build/ui/keyart/main_menu.png'));
  assert.equal((await artIndex(assets)).keyArt,undefined);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('base identity changes with content and propagates into staged index without a self-hash cycle',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-pack-version-'));try{
  await put(dir,'index.html','first shell');await put(dir,'runtime/frontline.wasm','wasm');
  await put(dir,'content/index.json',JSON.stringify({format_version:1,version:'authored-v1',packs:[{id:'2.0.0',version:'2.0.0',manifest_url:'/assets/packs/base.json'}],maps:[],missions:[]}));
  const first=await writeBasePack(dir);assert.match(first.version,/^content-v1-[a-f0-9]{64}$/);
  const index=JSON.parse(await readFile(path.join(dir,'content/index.json'),'utf8'));assert.equal(index.packs[0].version,first.version);assert.equal(index.version,'authored-v1');
  assert.deepEqual(await writeBasePack(dir),first,'unchanged rebuild must not change identity');
  await put(dir,'index.html','other shell');const second=await writeBasePack(dir);assert.notEqual(second.version,first.version);assert.equal(second.id,first.id);
  await put(dir,'added.txt','a');const added=await writeBasePack(dir);assert.notEqual(added.version,second.version);await put(dir,'added.txt','aa');const resized=await writeBasePack(dir);assert.notEqual(resized.version,added.version);await put(dir,'renamed.txt','aa');await rm(path.join(dir,'added.txt'));const renamed=await writeBasePack(dir);assert.notEqual(renamed.version,resized.version,'path-only change must change identity');
  const oldIndex=await readFile(path.join(dir,'content/index.json'));const last=await readFile(path.join(dir,'assets/packs/base.json'));await put(dir,'art/audio/index.json',JSON.stringify({format:1,entries:{bad:{variants:[{url:'/art/audio/missing.ogg',bytes:1,sha256:'a'.repeat(64)}]}}}));
  await assert.rejects(writeBasePack(dir));assert.deepEqual(await readFile(path.join(dir,'content/index.json')),oldIndex);assert.deepEqual(await readFile(path.join(dir,'assets/packs/base.json')),last);
 }finally{await rm(dir,{recursive:true,force:true})}
});


test('development serves one exact installable game snapshot while root and source keep Vite HMR',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-dev-snapshot-'));let server;
 try{
  const assets=path.join(dir,'assets'),content=path.join(dir,'content'),outDir=path.join(dir,'dist');
  const files={
   'index.html':'<main>Production offline shell</main>',
   'assets/product.js':'production JS',
   'assets/product.css':'production CSS',
   'runtime/frontline.wasm':'built wasm',
   'runtime/worker.js':'built worker',
   'runtime/wasm_exec.js':'built Go loader',
   'runtime/version.json':'{"simulation":"built"}',
   'service-worker.js':'built cache worker',
   'build-assets.json':'{"built":true}',
   'content/index.json':JSON.stringify({format_version:1,version:'authored',packs:[{id:'2.0.0',version:'authored',manifest_url:'/assets/packs/base.json'}],maps:[],missions:[]}),
   'art/index.json':'{"sprites":{}}',
   'art/ui/example.png':'built art',
  };
  for(const [file,bytes] of Object.entries(files))await put(outDir,file,bytes);
  const pack=await writeBasePack(outDir),manifest=await readFile(path.join(outDir,'assets/packs/base.json'));
  // Different live content must not replace any integrity-bound built bytes.
  await put(content,'index.json','unbuilt content');await put(content,'not-pack.json','unbuilt map');
  await put(assets,'build/ui/example.png','unbuilt art');
  let middleware;const plugin=artPlugin({assets,content});plugin.configResolved({command:'serve',build:{outDir}});
  await plugin.configureServer({middlewares:{use:value=>{middleware=value}}});assert(middleware);
  server=createServer((req,res)=>{void middleware(req,res,()=>{res.setHeader('Content-Type','text/plain');res.end('Vite HMR '+req.url)}).catch(error=>{res.statusCode=500;res.end(String(error))})});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/assets/packs/base.json');assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),manifest);
  for(const entry of pack.files){
   const response=await fetch(base+entry.path);assert.equal(response.status,200,entry.path);
   const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.length,entry.bytes,entry.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.path);
   assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.match((await fetch(base+'/runtime/worker.js')).headers.get('content-type'),/javascript/);
  assert.equal((await fetch(base+'/runtime/frontline.wasm')).headers.get('content-type'),'application/wasm');
  assert.equal(await (await fetch(base+'/')).text(),'Vite HMR /');assert.equal(await (await fetch(base+'/src/main.tsx')).text(),'Vite HMR /src/main.tsx');
  assert.equal(await (await fetch(base+'/@vite/client')).text(),'Vite HMR /@vite/client');
  for(const file of ['/art/missing.png','/content/not-pack.json','/runtime/missing.js','/assets/missing.js'])assert.equal((await fetch(base+file)).status,404,file);
  const head=await fetch(base+'/runtime/frontline.wasm',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(files['runtime/frontline.wasm'].length));assert.equal(await head.text(),'');
  // Removing a declared file must fail visibly, never fall through to Vite.
  await rm(path.join(outDir,'runtime/worker.js'));assert.equal((await fetch(base+'/runtime/worker.js')).status,503);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});

test('development refuses a missing or unsafe snapshot instead of running with unverified sources',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-dev-missing-'));
 try{
  const outDir=path.join(dir,'dist'),plugin=artPlugin({assets:path.join(dir,'assets')});plugin.configResolved({command:'serve',build:{outDir}});
  const server={middlewares:{use:()=>assert.fail('incomplete snapshot must not register its routes')}};
  await assert.rejects(plugin.configureServer(server),/Development needs a complete game snapshot/);
  await put(outDir,'assets/packs/base.json',JSON.stringify({id:'2.0.0',version:'fixture',files:[{path:'/../outside.js',bytes:1,sha256:'a'.repeat(64)}]}));
  await assert.rejects(plugin.configureServer(server),/Invalid development game snapshot file/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
