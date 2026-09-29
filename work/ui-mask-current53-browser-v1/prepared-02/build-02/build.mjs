import assert from 'node:assert/strict';
import {readFile,writeFile,realpath,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from '../../client/node_modules/esbuild/lib/main.js';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),prepared=path.join(here,process.argv[2]??'');
assert(/^prepared-[a-z0-9-]+$/.test(process.argv[2]??''));const out=path.join(prepared,process.argv[3]??'');assert(/^build-[a-z0-9-]+$/.test(process.argv[3]??''));await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),receipt={status:'running',started:new Date().toISOString(),browserRun:false};
try{
 const prep=JSON.parse(await readFile(path.join(prepared,'preparation.json')));assert.equal(prep.status,'prepared');
 for(const [name,hash]of Object.entries(prep.sourcePins))assert.equal(sha(await readFile(path.join(prepared,name))),hash,name);
 const tsconfig={compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',lib:['ES2022','DOM','DOM.Iterable'],jsx:'react-jsx',strict:true,skipLibCheck:true,noEmit:true,resolveJsonModule:true,allowImportingTsExtensions:true,types:[],paths:{'*':[path.join(repo,'client/node_modules/*')]}},files:[path.join(prepared,'fixture.ts')]};
 await writeFile(path.join(out,'tsconfig.json'),JSON.stringify(tsconfig,null,2)+'\n');
 const result=spawnSync(process.execPath,[path.join(repo,'client/node_modules/typescript/bin/tsc'),'-p',path.join(out,'tsconfig.json'),'--noEmit'],{cwd:repo,encoding:'utf8',timeout:60000});await writeFile(path.join(out,'typecheck.log'),(result.stdout??'')+(result.stderr??''));receipt.typecheck={exit:result.status,signal:result.signal,error:result.error?.message};assert.equal(result.status,0,'Focused fixture TypeScript failed');
 const bundle=await build({entryPoints:[path.join(prepared,'fixture.ts')],outfile:path.join(out,'fixture.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,nodePaths:[path.join(repo,'client/node_modules')],logLevel:'silent'});
 await writeFile(path.join(out,'bundle-inputs.json'),JSON.stringify(bundle.metafile,null,2)+'\n');
 const pins={};for(const name of Object.keys(bundle.metafile.inputs)){const full=path.resolve(repo,name);pins[path.relative(repo,full)]=sha(await readFile(full))}
 receipt.bundleSHA256=sha(await readFile(path.join(out,'fixture.js')));receipt.preparationSHA256=sha(await readFile(path.join(prepared,'preparation.json')));receipt.bundleInputs=pins;receipt.node=await realpath(process.execPath);receipt.status='passed';
}catch(error){receipt.status='failed';receipt.failure=String(error?.stack??error);process.exitCode=1}finally{receipt.finished=new Date().toISOString();await writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({out,status:receipt.status,failure:receipt.failure}))}
