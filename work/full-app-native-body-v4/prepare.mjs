// Bundle/typecheck the passive worker decoder only; never starts a browser/host.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {hash} from './course.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export async function prepareWorker({root,protocolFile,protocolSHA256,out,typecheck=true}){
 const require=createRequire(path.join(root,'client/package.json')),{build}=require('esbuild');
 const bytes=await readFile(protocolFile);assert.equal(hash(bytes),protocolSHA256,'Explicit selected protocol source');
 const frozen=path.join(out,'frontline_pb.ts');await writeFile(frozen,bytes);
 const entry=path.join(here,'worker-observer.ts'),modules=path.join(root,'client/node_modules');
 const config={compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',strict:true,noEmit:true,skipLibCheck:true,lib:['ES2022','DOM'],paths:{'pinned-frontline-protocol':[frozen],'@bufbuild/protobuf':[path.join(modules,'@bufbuild/protobuf/dist/esm/index.d.ts')],'@bufbuild/protobuf/*':[path.join(modules,'@bufbuild/protobuf/dist/esm/*')]}},files:[entry,frozen]};
 const configPath=path.join(out,'tsconfig.json');await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
 if(typecheck){try{const log=execFileSync(process.execPath,[path.join(modules,'typescript/bin/tsc'),'--project',configPath],{cwd:root,encoding:'utf8'});await writeFile(path.join(out,'typecheck.log'),log)}catch(error){await writeFile(path.join(out,'typecheck.log'),String(error.stdout??'')+String(error.stderr??''));throw error}}
 const built=await build({absWorkingDir:root,entryPoints:[entry],bundle:true,write:false,metafile:true,format:'iife',platform:'browser',target:'es2022',nodePaths:[modules],plugins:[{name:'exact-protocol',setup(b){b.onResolve({filter:/^pinned-frontline-protocol$/},()=>({path:frozen}))}}]});
 const bundle=built.outputFiles[0].text;await writeFile(path.join(out,'worker-observer.js'),bundle);
 const inputs=[];for(const name of Object.keys(built.metafile.inputs)){const file=path.resolve(root,name);inputs.push({file,sha256:hash(await readFile(file))})}
 const result={bundleSHA256:hash(bundle),protocolFile,protocolSHA256,inputs,noBrowserOrServer:true};await writeFile(path.join(out,'worker-build.json'),JSON.stringify(result,null,2)+'\n');return {bundle,result};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=path.resolve(here,'../..'),out=path.resolve(process.argv[2]??path.join(here,'prepare-01'));await mkdir(out);
 const protocolFile=path.join(root,'client/src/protocol/frontline_pb.ts');const result=await prepareWorker({root,protocolFile,protocolSHA256:hash(await readFile(protocolFile)),out});
 console.log(JSON.stringify({out,...result.result}));
}
