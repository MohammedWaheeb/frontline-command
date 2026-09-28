import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
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
