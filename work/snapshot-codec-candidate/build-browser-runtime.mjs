import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from '../../client/node_modules/esbuild/lib/main.js';

const root=path.dirname(fileURLToPath(import.meta.url)), shipping=path.resolve(root,'../..');
const source=path.join(root,'source'),out=path.join(root,'runtime'),input=path.join(root,'runtime-input');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const lockBytes=await readFile(path.join(root,'source-lock.json')),lock=JSON.parse(lockBytes);
async function verify(){for(const [name,hash] of Object.entries(lock.files))if(sha(await readFile(path.join(source,name)))!==hash)throw Error(`Frozen source changed: ${name}`)}
await verify();
await mkdir(out,{recursive:true});await mkdir(path.join(out,'bin'),{recursive:true});await mkdir(input,{recursive:true});
const workerInputs={};
for(const name of ['worker.ts','errors.ts','types.ts']){
 const bytes=await readFile(path.join(shipping,'client/src/runtime',name));
 await writeFile(path.join(input,name),bytes);workerInputs[name]=sha(bytes);
}
const go='/opt/homebrew/bin/go',env={...process.env,GOMAXPROCS:'2'};
execFileSync(go,['build','-trimpath','-o',path.join(out,'frontline.wasm'),'./cmd/wasm'],{cwd:source,stdio:'inherit',env:{...env,GOOS:'js',GOARCH:'wasm'}});
execFileSync(go,['build','-trimpath','-o',path.join(out,'bin/runtime-native'),'./cmd/wasm'],{cwd:source,stdio:'inherit',env});
execFileSync(go,['build','-trimpath','-o',path.join(out,'bin/frontline-host'),'./cmd/frontline'],{cwd:source,stdio:'inherit',env});
const goroot=execFileSync(go,['env','GOROOT'],{encoding:'utf8',env}).trim();
await copyFile(path.join(goroot,'lib/wasm/wasm_exec.js'),path.join(out,'wasm_exec.js'));
const version=JSON.parse(execFileSync(path.join(out,'bin/runtime-native'),['-version'],{encoding:'utf8'}));
if(version.simulation!=='0.3.4')throw Error('Wrong isolated runtime version');
await writeFile(path.join(out,'version.json'),JSON.stringify(version,null,2)+'\n');
await copyFile(path.join(source,'client/src/protocol/frontline_pb.ts'),path.join(out,'frontline_pb.ts'));
await build({entryPoints:[path.join(input,'worker.ts')],outfile:path.join(out,'worker.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',sourcemap:true});
await verify();
const files={};
for(const name of ['frontline.wasm','wasm_exec.js','worker.js','worker.js.map','version.json','frontline_pb.ts','bin/runtime-native','bin/frontline-host']){
 const bytes=await readFile(path.join(out,name));files[name]={bytes:bytes.length,sha256:sha(bytes)};
}
await writeFile(path.join(root,'runtime-build-receipt.json'),JSON.stringify({built_utc:new Date().toISOString(),source_lock_sha256:sha(lockBytes),version,worker_inputs:workerInputs,files,shipping_runtime_changed:false},null,2)+'\n');
console.log(JSON.stringify({out,version,files},null,2));
