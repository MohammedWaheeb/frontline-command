// Private candidate checks; never replace the frozen baseline or live client.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {readFile,mkdir,writeFile,cp,symlink,readdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const label=process.argv[2];assert(/^checks-[a-z0-9-]+$/.test(label??''),'New checks-N directory required');
const out=path.join(here,label);await mkdir(out);
const candidate=path.join(here,'source/client'),baseline=JSON.parse(await readFile(path.join(here,'baseline.json')));
const base=path.join(root,baseline.base,'source/client');
const sha=b=>createHash('sha256').update(b).digest('hex');
const inputs={};
async function inventory(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='node_modules')continue;const rel=path.join(prefix,entry.name),file=path.join(dir,entry.name);if(entry.isDirectory())await inventory(file,rel);else if(entry.isFile())inputs[rel]=sha(await readFile(file));}}
await inventory(candidate);
const allowed=new Set(['src/render/actors.ts','src/render/poses.ts']);
for(const [name,digest]of Object.entries(baseline.files)){assert.equal(sha(await readFile(path.join(base,name))),digest);if(!allowed.has(name))assert.equal(inputs[name],digest,`Unrelated source changed: ${name}`);}
const require=createRequire(path.join(root,'client/package.json')),{build}=await import(pathToFileURL(require.resolve('esbuild')).href);
const tests=['actor-pose-priority','aircraft-payload','ground-launcher-payload','poses'];
const receipt={scope:'Private ground-launcher pose logic only; no rendered-art, Go, browser or release acceptance.',status:'running',inputs,commands:[]};
const save=()=>writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
await save();
async function run(name,command,args,cwd,expected=0){const r=spawnSync(command,args,{cwd,encoding:'utf8'});const log=(r.stdout??'')+(r.stderr??'');await writeFile(path.join(out,name+'.log'),log);receipt.commands.push({name,command:[command,...args],exitCode:r.status,expected,logSHA256:sha(log)});await save();assert.equal(r.status,expected,name+' unexpected exit');return log;}
async function bundle(source,dest,names){await mkdir(dest);await symlink(path.join(root,'client/node_modules'),path.join(dest,'node_modules'));await build({entryPoints:names.map(n=>path.join(source,'tests/runtime',n+'.test.ts')),outdir:dest,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node24',packages:'external'});}
try{
 await bundle(candidate,path.join(out,'candidate-tests'),tests);
 const log=await run('focused',process.execPath,['--test',...tests.map(n=>path.join(out,'candidate-tests',n+'.test.mjs'))],candidate);assert.match(log,/(?:pass 21|# pass 21)/);
 await run('app-types',path.join(root,'client/node_modules/.bin/tsc'),['-p','tsconfig.json','--noEmit'],candidate);
 await run('test-types',path.join(root,'client/node_modules/.bin/tsc'),['-p','tests/runtime/tsconfig.json','--noEmit'],candidate);
 const old=path.join(out,'baseline-client');await cp(candidate,old,{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')});await symlink(path.join(root,'client/node_modules'),path.join(old,'node_modules'));
 for(const name of allowed)await cp(path.join(base,name),path.join(old,name));
 await bundle(old,path.join(out,'baseline-tests'),['ground-launcher-payload']);
 const red=await run('baseline-regressions',process.execPath,['--test',path.join(out,'baseline-tests/ground-launcher-payload.test.mjs')],old,1);assert.match(red,/(?:fail 7|# fail 7)/);assert.match(red,/(?:pass 0|# pass 0)/);
 for(const [name,digest]of Object.entries(inputs))assert.equal(sha(await readFile(path.join(candidate,name))),digest,`Candidate changed: ${name}`);
 receipt.status='passed';receipt.tests=21;receipt.baselineFailures=7;receipt.sourceVerifiedAfter=true;await save();console.log(out);
}catch(error){receipt.status='failed';receipt.error=String(error);await save();throw error;}
