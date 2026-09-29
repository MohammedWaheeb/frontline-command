import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {build} from '../../../client/node_modules/esbuild/lib/main.js';
const root=process.cwd(),base=path.join(root,'work/audio-generation-retry-v1'),product=path.join(root,'work/art-generation-consumer-v1/app-v3-build-03/product'),output=path.resolve(process.argv[2]??path.join(base,'browser-prepared-v1'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const lock=JSON.parse(await readFile(path.join(base,'source-lock-v1.json'),'utf8'));
for(const [name,value]of Object.entries(lock.files))assert.equal(hash(await readFile(path.join(base,name))),value.sha256,`Frozen audio candidate changed: ${name}`);
await mkdir(output,{recursive:true});await mkdir(path.join(output,'clips'),{recursive:true});
const indexBytes=await readFile(path.join(product,'art/audio/index.json')),index=JSON.parse(indexBytes),packBytes=await readFile(path.join(product,'assets/packs/base.json')),pack=JSON.parse(packBytes);
const clips=[];
for(const [label,id]of [['A','vo.unit.US.pilot.select'],['B','vo.unit.US.pilot.move']]){
 const entry=index.entries[id],original=entry.variants[0],files=[];
 for(const [codec,url,bytes,sha256]of [['ogg',original.url,original.bytes,original.sha256],['mp3',original.mp3_url,original.mp3_bytes,original.mp3_sha256]]){
  assert(url&&bytes&&sha256);const data=await readFile(path.join(product,url)),declared=pack.files.find(file=>file.path===url);assert.equal(data.length,bytes);assert.equal(hash(data),sha256);assert.equal(declared?.sha256,sha256);assert.equal(declared?.bytes,bytes);
  const file=`clips/${label}.${codec}`;await copyFile(path.join(product,url),path.join(output,file));files.push({codec,url,file,bytes,sha256});
 }
 const variant={...original,url:'/art/audio/review/clip.ogg',mp3_url:'/art/audio/review/clip.mp3'};
 clips.push({label,id,original,files,index:{format:1,sample_rate:index.sample_rate,entries:{'vo.review':{...entry,variants:[variant]}}}});
}
assert.notEqual(clips[0].original.sha256,clips[1].original.sha256);
await build({absWorkingDir:root,entryPoints:[path.join(base,'browser/fixture.ts')],outfile:path.join(output,'fixture.js'),bundle:true,platform:'browser',format:'esm',sourcemap:true});
await writeFile(path.join(output,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Frozen audio retry acceptance</title><h1>Audio retry acceptance</h1><p>Test-only HTTP aliasing of exact packaged clips. No listening-quality claim.</p><button id="consent">Enable sound</button><button id="gesture">Trusted gesture</button><button id="play">Play clip</button><button id="withdraw">Withdraw consent</button><script type="module" src="/fixture.js"></script>');
const receipt={status:'prepared-browser-unrun',scope:'Exact frozen audio-v1 source, original packaged OGG/MP3 clips; HTTP alias metadata only. No generated/edited audio.',createdAt:new Date().toISOString(),product,sourceLockSHA256:hash(await readFile(path.join(base,'source-lock-v1.json'))),packSHA256:hash(packBytes),audioIndexSHA256:hash(indexBytes),clips,files:{}};
for(const name of ['index.html','fixture.js','fixture.js.map',...clips.flatMap(clip=>clip.files.map(file=>file.file))]){const bytes=await readFile(path.join(output,name));receipt.files[name]={bytes:bytes.length,sha256:hash(bytes)}}
await writeFile(path.join(output,'prepared.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({output,status:receipt.status,clips:clips.map(({id,files})=>({id,files})),sourceLockSHA256:receipt.sourceLockSHA256},null,2));
