// New immutable acceptance product, never an update to an earlier run or shipping.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {access,copyFile,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {prepareProduct,root,buildDir,product} from './multiplayer-combat-build.mjs';

assert(process.env.FRONTLINE_COMBAT_BUILD,'Choose a new explicit acceptance build directory.');
assert.notEqual(process.env.FRONTLINE_COMBAT_REUSE,'1','A freeze must not claim to create a reused build.');
try{await access(buildDir);throw Error('Refusing to overwrite a previous acceptance build')}catch(error){if(error.code!=='ENOENT')throw error}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const candidate=path.join(root,'work/navigation-lookup-candidate'),lock='c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122';
const receiptBytes=await readFile(path.join(candidate,'runtime-build-receipt.json')),receipt=JSON.parse(receiptBytes),lockBytes=await readFile(path.join(candidate,'source-lock.json'));
assert.equal(sha(lockBytes),lock);assert.equal(receipt.source_lock_sha256,lock);
// Validate the actual native compilation source, not only its lock filename.
for(const [file,digest] of Object.entries(JSON.parse(lockBytes).files))assert.equal(sha(await readFile(path.join(candidate,'source',file))),digest,`Frozen candidate source changed: ${file}`);
const replacements=[{source:'bin/frontline-host',target:'frontline'},...['frontline.wasm','wasm_exec.js','worker.js','worker.js.map','version.json'].map(name=>({source:name,target:'product/runtime/'+name}))];
for(const item of replacements){const bytes=await readFile(path.join(candidate,'runtime',item.source));assert.deepEqual({bytes:bytes.length,sha256:sha(bytes)},receipt.files[item.source],`Frozen runtime changed: ${item.source}`)}
const build=await prepareProduct();assert.deepEqual(build.version,receipt.version);
const replaced=[];
for(const item of replacements){
 const destination=path.join(buildDir,item.target);let before;
 try{const bytes=await readFile(destination);before={bytes:bytes.length,sha256:sha(bytes)}}catch(error){if(error.code!=='ENOENT')throw error}
 await copyFile(path.join(candidate,'runtime',item.source),destination);
 const bytes=await readFile(destination),after={bytes:bytes.length,sha256:sha(bytes)};assert.deepEqual(after,receipt.files[item.source]);replaced.push({...item,before,after});
}
const packPath=path.join(product,'assets/packs/base.json'),pack=JSON.parse(await readFile(packPath,'utf8'));
for(const item of replaced.filter(item=>item.target.startsWith('product/'))){const entry={path:'/'+item.target.slice('product/'.length),...item.after},index=pack.files.findIndex(value=>value.path===entry.path);if(index<0)pack.files.push(entry);else pack.files[index]=entry}
await writeFile(packPath,JSON.stringify(pack));
// Compile only the test verifier, against the immutable optimized Go module.
const auditSource=path.join(root,'work/multiplayer-combat/audit'),auditMod=path.join(buildDir,'audit.mod'),auditor=path.join(buildDir,'audit-replay');
await writeFile(auditMod,`module frontline-combat-audit\n\ngo 1.27.1\n\nrequire frontlinecommand v0.0.0\nreplace frontlinecommand => ${JSON.stringify(path.join(candidate,'source'))}\n`);
execFileSync('go',['build','-modfile',auditMod,'-o',auditor,'.'],{cwd:auditSource,stdio:'inherit',env:{...process.env,GOMAXPROCS:'2'}});
const contract=JSON.parse(execFileSync(auditor,['-describe'],{encoding:'utf8'}));assert.equal(contract.simulation,build.version.simulation);assert.equal(contract.content_hash,build.version.content_hash);assert.equal(contract.initial_countdown_ticks,true);
await copyFile(path.join(auditSource,'main.go'),path.join(buildDir,'audit-main.go'));
await writeFile(path.join(buildDir,'native-auditor-receipt.json'),JSON.stringify({sourceLockSHA256:lock,mainSHA256:sha(await readFile(path.join(auditSource,'main.go'))),binarySHA256:sha(await readFile(auditor)),contract},null,2)+'\n');
build.sha256.host=receipt.files['bin/frontline-host'].sha256;build.sha256.wasm=receipt.files['frontline.wasm'].sha256;build.sha256.pack=sha(await readFile(packPath));build.packFiles=pack.files.length;
build.runtimeSuccessor={sourceLockSHA256:lock,receiptSHA256:sha(receiptBytes),replaced};build.auditor={path:'audit-replay',sha256:sha(await readFile(auditor)),contract};
build.scope='New current-client/current-art isolated freeze with readonly lifetime hooks; receipt-verified optimized 0.3.4 host/runtime. No shipping promotion. Same-page acceptance has not run merely because this build exists.';
build.completed=new Date().toISOString();await writeFile(path.join(buildDir,'build.json'),JSON.stringify(build,null,2)+'\n');
console.log(JSON.stringify({buildDir,sha256:build.sha256,sourceLock:lock,auditor:build.auditor},null,2));
