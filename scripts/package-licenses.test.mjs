import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyNpmLicenses} from './package-licenses.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('installed runtime supplements include all pinned upstream notices',async()=>{
 const out=await mkdtemp(path.join(tmpdir(),'frontline-notices-'));try{
  const lock=JSON.parse(await readFile(path.join(root,'client/package-lock.json'),'utf8'));
  for(const [name,count]of [['@bufbuild/protobuf',2],['@pixi/colord',1]]){
   const target=path.join(out,name),location='node_modules/'+name;
   assert.equal(await copyNpmLicenses({moduleDir:path.join(root,'client',location),out:target,lockEntry:lock.packages[location],supplementRoot:path.join(root,'licenses/npm-supplemental')}),count);
   assert.equal((await readdir(target)).length,count);
  }
 }finally{await rm(out,{recursive:true,force:true})}
});
test('missing, changed or version-mismatched supplemental notices fail before copying',async()=>{
 const base=await mkdtemp(path.join(tmpdir(),'frontline-notice-controls-'));try{
  const moduleDir=path.join(base,'module'),supplementRoot=path.join(base,'supplements'),out=path.join(base,'out');await mkdir(moduleDir);await mkdir(supplementRoot);
  await writeFile(path.join(moduleDir,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0'}));await writeFile(path.join(moduleDir,'source.js'),'original');
  const sha=s=>createHash('sha256').update(s).digest('hex'),file={path:'LICENSE.md',sha256:sha('notice'),source_file:'source.js',source_sha256:sha('original')};
  const manifest={format_version:1,packages:{'fixture@1.0.0':{name:'fixture',version:'1.0.0',integrity:'fixture-integrity',files:[file]}}};
  const putManifest=()=>writeFile(path.join(supplementRoot,'manifest.json'),JSON.stringify(manifest));await putManifest();await writeFile(path.join(supplementRoot,'LICENSE.md'),'notice');
  const args={moduleDir,out,supplementRoot,lockEntry:{version:'1.0.0',integrity:'fixture-integrity'}};
  await assert.rejects(copyNpmLicenses({...args,lockEntry:{...args.lockEntry,version:'2.0.0'}}),/differs/);
  await assert.rejects(copyNpmLicenses({...args,lockEntry:{...args.lockEntry,integrity:'other'}}),/No verified/);
  await writeFile(path.join(supplementRoot,'LICENSE.md'),'changed');await assert.rejects(copyNpmLicenses(args),/license changed/);await writeFile(path.join(supplementRoot,'LICENSE.md'),'notice');
  await writeFile(path.join(moduleDir,'source.js'),'different');await assert.rejects(copyNpmLicenses(args),/source changed/);await writeFile(path.join(moduleDir,'source.js'),'original');
  file.path='../LICENSE.md';await putManifest();await assert.rejects(copyNpmLicenses(args),/Invalid/);file.path='LICENSE.md';await putManifest();
  await assert.rejects(readdir(out),{code:'ENOENT'});
  assert.equal(await copyNpmLicenses(args),1);assert.equal(await readFile(path.join(out,'LICENSE.md'),'utf8'),'notice');
  delete manifest.packages['fixture@1.0.0'];await putManifest();await assert.rejects(copyNpmLicenses({...args,out:path.join(base,'missing')}),/No verified/);
 }finally{await rm(base,{recursive:true,force:true})}
});
