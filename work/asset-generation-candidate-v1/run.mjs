import {build} from '../../client/node_modules/esbuild/lib/main.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]);await mkdir(out,{recursive:false});
const sha=b=>createHash('sha256').update(b).digest('hex'),sources=['source/client/src/runtime/asset-generation.ts','source/client/src/runtime/cache.ts','source/client/src/runtime/offline-response.ts','source/client/tests/runtime/asset-generation.test.ts'];const before=await Promise.all(sources.map(async p=>({path:p,sha256:sha(await readFile(path.join(here,p)))})));for(const record of before){const target=path.join(out,record.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await readFile(path.join(here,record.path)))}
const entry=path.join(here,'source/client/tests/runtime/asset-generation.test.ts'),bundle=path.join(out,'unit.mjs');
await build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node24',packages:'external'});
const result=spawnSync(process.execPath,['--test','--test-timeout=10000',bundle],{encoding:'utf8'});await writeFile(path.join(out,'output.log'),result.stdout+result.stderr);console.log(result.stdout+result.stderr);
const after=await Promise.all(sources.map(async p=>({path:p,sha256:sha(await readFile(path.join(here,p)))})));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Source drift during private unit proof');await writeFile(path.join(out,'receipt.json'),JSON.stringify({status:result.status===0?'passed':'failed',time:new Date().toISOString(),exit_code:result.status,scope:'Private helper unit proofs with declared fake CacheStorage/network; no browser/host or production promotion',sources:before,sourceGuardsAfter:true,bundleSHA256:sha(await readFile(bundle))},null,2)+'\n');process.exitCode=result.status??1;
