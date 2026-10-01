// Preserve the accepted recovery client/art; replace only receipt-verified Go
// runtime bytes in a new isolated directory. Never rebuild or promote shipping.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {access,copyFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const base=path.join(root,'work/multiplayer-combat/build-history-recovery-v3');
const candidate=path.join(root,'work/navigation-lookup-candidate');
const output=path.resolve(process.env.FRONTLINE_COMBAT_OPTIMIZED_BUILD??path.join(root,'work/multiplayer-combat/build-optimized-recovery'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const metadata=async file=>{const bytes=await readFile(file);return {bytes:bytes.length,sha256:sha(bytes)}};
const lock='c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122';
const receiptBytes=await readFile(path.join(candidate,'runtime-build-receipt.json'));
const receipt=JSON.parse(receiptBytes),report=JSON.parse(await readFile(path.join(base,'build.json'),'utf8'));
assert.equal(receipt.source_lock_sha256,lock);
assert.equal(sha(await readFile(path.join(candidate,'source-lock.json'))),lock);
assert.deepEqual(receipt.version,report.version,'This successor must preserve compatibility metadata');
const replacements=[
 {source:'bin/frontline-host',target:'frontline'},
 ...['frontline.wasm','wasm_exec.js','worker.js','worker.js.map','version.json'].map(name=>({source:name,target:'product/runtime/'+name})),
];
for(const entry of replacements){assert(receipt.files[entry.source],`Missing receipt entry ${entry.source}`);assert.deepEqual(await metadata(path.join(candidate,'runtime',entry.source)),receipt.files[entry.source],`Candidate bytes changed: ${entry.source}`)}
try{await access(output);throw Error('Refusing to overwrite a prior source-specific build')}catch(error){if(error.code!=='ENOENT')throw error}
await mkdir(output,{recursive:true});
execFileSync('cp',['-cR',base+'/.',output]);

const replaced=[];
for(const entry of replacements){
 const target=path.join(output,entry.target);let before;
 try{before=await metadata(target)}catch(error){if(error.code!=='ENOENT')throw error}
 await copyFile(path.join(candidate,'runtime',entry.source),target);
 const after=await metadata(target);assert.deepEqual(after,receipt.files[entry.source]);
 replaced.push({...entry,before,after});
}
const packPath=path.join(output,'product/assets/packs/base.json');
const beforePack=await metadata(packPath),pack=JSON.parse(await readFile(packPath,'utf8'));
for(const entry of replaced.filter(item=>item.target.startsWith('product/runtime/'))){
 const item={path:'/'+entry.target.slice('product/'.length),...entry.after};
 const index=pack.files.findIndex(value=>value.path===item.path);
 if(index<0)pack.files.push(item);else pack.files[index]=item;
}
await writeFile(packPath,JSON.stringify(pack));

// Byte equality covers all other served client/art/content/service-worker files,
// including index pages and the base client protocol embedded in its JS bundle.
const excluded=new Set([...replacements.filter(item=>item.target.startsWith('product/')).map(item=>item.target.slice(8)),'assets/packs/base.json']);
async function inventory(folder){
 const values=[];
 async function visit(relative=''){
  for(const entry of (await readdir(path.join(folder,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const name=path.join(relative,entry.name);
   if(entry.isDirectory())await visit(name);
   else{assert(entry.isFile(),`Unexpected non-file product entry: ${name}`);if(!excluded.has(name))values.push({path:name,...await metadata(path.join(folder,name))})}
  }
 }
 await visit();return values;
}
const unchanged=await inventory(path.join(base,'product'));
assert.deepEqual(await inventory(path.join(output,'product')),unchanged,'Unrelated product bytes changed');
const oldHashes={...report.sha256};
report.sha256.host=receipt.files['bin/frontline-host'].sha256;
report.sha256.wasm=receipt.files['frontline.wasm'].sha256;
report.sha256.pack=(await metadata(packPath)).sha256;
report.packFiles=pack.files.length;
report.runtimeOptimization={prepared:new Date().toISOString(),sourceLock:lock,receiptSHA256:sha(receiptBytes),base:'../build-history-recovery-v3',baseHashes:oldHashes,replaced,pack:{before:beforePack,after:await metadata(packPath)},unchangedProductFiles:unchanged.length,unchangedProductDigest:sha(Buffer.from(JSON.stringify(unchanged))),clientArtContentIdentical:true,clientProtocolSHA256:report.sha256.protocol,candidateWireProtocolSHA256:receipt.files['frontline_pb.ts'].sha256,scope:'The older frozen client/decoder bindings remain unchanged and ignore optional additive wire fields. This fixture tests the same existing game UI; it does not test new owner-range/casualty controls.'};
report.scope='Exact recovery-v3 client/art/content with receipt-verified optimized0.3.4 Go host/WASM/worker only. Isolated test build; no shipping promotion or fresh gameplay claim.';
await writeFile(path.join(output,'build.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,sourceLock:lock,replaced,unchangedProductFiles:unchanged.length,sha256:report.sha256},null,2));
