import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJSON as oldRead} from '../io.mjs';
import {readJSON,JSON_LIMITS,pin} from './candidate/io.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),dir=path.join(here,'test-data-02');await mkdir(dir,{recursive:false});
const baseline=JSON.parse(gunzipSync(await readFile(path.join(here,'projected-descriptors-NOT-VERIFIED.json.gz'))));
async function file(name,value){await writeFile(path.join(dir,name),JSON.stringify(value,null,2)+'\n');return pin(dir,name)}
test('guaranteed retained-file path/size lower bound reproduces old prepared receipt rejection and new bounded parse',async()=>{
 const value={dependencies:baseline.files.map(x=>({...x,path:'assets/'+x.path})),files:baseline.files.filter(x=>!x.path.startsWith('build/sprites/')&&!x.path.startsWith('build/ui/'))},d=await file('projected-prepared-NOT-VERIFIED.json',value);assert.equal(d.bytes,15370566);await assert.rejects(oldRead(dir,d),/JSON exceeds8MiB/);const actual=await readJSON(dir,d,'publication');assert.deepEqual(actual,value);
 await assert.rejects(readJSON(dir,d),/asset JSON exceeds/);await assert.rejects(readJSON(dir,{...d,sha256:'f'.repeat(64)},'publication'),/Identity changed/);
});
test('larger inventory is admitted only by explicit inventory purpose, with hashes still mandatory',async()=>{
 const value={files:[...baseline.files,...baseline.files.slice(0,6000).map(x=>({...x,path:'extra-fixture/'+x.path}))]},d=await file('inventory-above8MiB-NOT-VERIFIED.json',value);assert(d.bytes>JSON_LIMITS.asset&&d.bytes<JSON_LIMITS.inventory);await assert.rejects(oldRead(dir,d),/JSON exceeds8MiB/);assert.deepEqual(await readJSON(dir,d,'inventory'),value);await assert.rejects(readJSON(dir,d,'anything'),/Unknown JSON purpose/);
});
test('fixed purpose ceilings reject over-limit descriptors before filesystem reads; exact ceiling reaches integrity guard',async()=>{
 for(const kind of ['asset','inventory','publication']){
  const missing={path:'does-not-exist',sha256:'0'.repeat(64),bytes:JSON_LIMITS[kind]+1};await assert.rejects(readJSON(dir,missing,kind),new RegExp(kind+' JSON exceeds'));
  const small=await file('small-'+kind+'.json',{ok:true});await assert.rejects(readJSON(dir,{...small,bytes:JSON_LIMITS[kind]},kind),/Identity changed/);
 }
});
test('ordinary authored JSON keeps8MiB and valid exact content',async()=>{assert.equal(JSON_LIMITS.asset,8388608);const d=await file('authored.json',{states:[{name:'idle',frames:1,directions:16}]});assert.deepEqual(await readJSON(dir,d),{states:[{name:'idle',frames:1,directions:16}]})});
