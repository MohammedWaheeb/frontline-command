import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir,symlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from '../../client/node_modules/esbuild/lib/main.js';
const work=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(work,'../..'),out=path.join(work,'final-validation-01'),stage=path.join(out,'source'),client=path.join(stage,'client'),prior=path.join(root,'work/renderer-performance-v1/combined-test-stage'),lock=JSON.parse(await readFile(path.join(work,'supplement-prepared/lock.json'),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out);await mkdir(client,{recursive:true});
await cp(path.join(work,'supplement-prepared/memory/src'),path.join(client,'src'),{recursive:true});
for(const [leaf,expected] of Object.entries(lock.sources.memory))assert.equal(sha(await readFile(path.join(client,'src',leaf))),expected);
for(const leaf of ['tsconfig.json','package.json','tests/runtime','scripts/runtime','scripts/ui'])await cp(path.join(prior,'client',leaf),path.join(client,leaf),{recursive:true});
await symlink(path.join(root,'client/node_modules'),path.join(client,'node_modules'));
const dataLinks={};for(const leaf of ['assets','content','pkg']){dataLinks[leaf]=await realpath(path.join(prior,leaf));await symlink(dataLinks[leaf],path.join(stage,leaf))}
async function inventory(dir,prefix=''){const rows={};for(const entry of await readdir(dir,{withFileTypes:true})){const leaf=path.join(prefix,entry.name);if(entry.isDirectory())Object.assign(rows,await inventory(path.join(dir,entry.name),leaf));else if(entry.isFile())rows[leaf]=sha(await readFile(path.join(dir,entry.name)))}return rows}
const copiedInputPins={...await inventory(path.join(client,'src'),'src'),...await inventory(path.join(client,'tests'),'tests'),...await inventory(path.join(client,'scripts'),'scripts')};
for(const leaf of ['tsconfig.json','package.json'])copiedInputPins[leaf]=sha(await readFile(path.join(client,leaf)));
await writeFile(path.join(out,'copied-inputs.json'),JSON.stringify({copiedInputPins,dataLinks},null,2)+'\n');
function check(name,args){const result=spawnSync(path.join(root,'client/node_modules/.bin/tsc'),args,{cwd:client,encoding:'utf8'});return writeFile(path.join(out,name+'.log'),(result.stdout??'')+(result.stderr??'')).then(()=>{assert.equal(result.status,0,result.stdout||result.stderr);return result.status})}
const appTypecheck=await check('app-typecheck',['-p','tsconfig.json','--noEmit']),runtimeTypecheck=await check('runtime-typecheck',['-p','tests/runtime/tsconfig.json','--noEmit']);
const entries=(await readdir(path.join(client,'tests/runtime'))).filter(n=>n.endsWith('.test.ts')).map(n=>path.join(client,'tests/runtime',n)),testOut=path.join(client,'.test-runtime');await mkdir(testOut);
await build({entryPoints:entries,outdir:testOut,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node24',packages:'external'});
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...entries.map(n=>path.join(testOut,path.basename(n,'.ts')+'.mjs'))],{cwd:client,encoding:'utf8',maxBuffer:20*1024*1024});await writeFile(path.join(out,'runtime-tests.log'),(result.stdout??'')+(result.stderr??''));assert.equal(result.status,0,result.stdout?.slice(-2000)||result.stderr);
for(const [leaf,expected] of Object.entries(copiedInputPins))assert.equal(sha(await readFile(path.join(client,leaf))),expected,`Validation input changed: ${leaf}`);
for(const [leaf,expected] of Object.entries(lock.sources.memory))assert.equal(sha(await readFile(path.join(work,'supplement-prepared/memory/src',leaf))),expected,`Frozen source changed: ${leaf}`);
const report={status:'PASS_PRIVATE_FINAL_THREE_FILE_SOURCE',scope:'Frozen renderer candidate plus proper remembered-label Container ownership; existing frozen runtime tests/data reused. No live edits or new browser run.',sourceFiles:Object.keys(lock.sources.memory).length,copiedInputFiles:Object.keys(copiedInputPins).length,sourceSHA256:Object.fromEntries(['art.ts','battlefield.ts','terrain.ts'].map(n=>[n,lock.sources.memory['render/'+n]])),appTypecheck,runtimeTypecheck,runtimeTestsExitCode:result.status,testSummary:result.stdout.split('\n').filter(line=>/^(ℹ|#) (tests|suites|pass|fail|cancelled|skipped|todo)\b/.test(line)),inputsUnchanged:true,dataLinks};
await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
