// Isolated production acceptance build. Never writes shared public/runtime or dist.
import {build as bundle} from 'esbuild';
import {build as viteBuild} from 'vite';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const root=path.dirname(client);
export const evidence=path.join(root,'work/evidence/rendered-multiplayer');
export const buildDir=process.env.FRONTLINE_RENDERED_BUILD??path.join(evidence,'build');
export const product=path.join(buildDir,'product');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sourceDigest(dir){
 const digest=createHash('sha256');
 async function visit(folder){for(const entry of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(folder,entry.name);if(entry.isDirectory())await visit(file);else if(/\.(ts|tsx|go|json|css)$/.test(entry.name)){digest.update(path.relative(dir,file));digest.update(await readFile(file))}}}
 await visit(dir);return digest.digest('hex');
}
export async function prepareProduct(){
 if(process.env.FRONTLINE_RENDERED_REUSE==='1')return JSON.parse(await readFile(path.join(buildDir,'build.json'),'utf8'));
 await mkdir(buildDir,{recursive:true});
 await writeFile(path.join(buildDir,'.gitignore'),'*\n!.gitignore\n!build.json\n');
 const publicDir=path.join(buildDir,'public'),runtime=path.join(publicDir,'runtime');
 await mkdir(runtime,{recursive:true});
 const run=(exe,args,options={})=>execFileSync(exe,args,{cwd:root,stdio:'inherit',...options});
 const started=new Date().toISOString();
 run('go',['build','-trimpath','-o',path.join(buildDir,'frontline'),'./cmd/frontline']);
 run('go',['build','-trimpath','-o',path.join(buildDir,'runtime-native'),'./cmd/wasm']);
 run('go',['build','-trimpath','-o',path.join(runtime,'frontline.wasm'),'./cmd/wasm'],{env:{...process.env,GOOS:'js',GOARCH:'wasm'}});
 const goroot=execFileSync('go',['env','GOROOT'],{cwd:root,encoding:'utf8'}).trim();
 await copyFile(path.join(goroot,'lib/wasm/wasm_exec.js'),path.join(runtime,'wasm_exec.js'));
 const version=JSON.parse(execFileSync(path.join(buildDir,'runtime-native'),['-version'],{encoding:'utf8'}));
 await writeFile(path.join(runtime,'version.json'),JSON.stringify(version,null,2)+'\n');
 await bundle({entryPoints:[path.join(client,'src/runtime/worker.ts')],outfile:path.join(runtime,'worker.js'),bundle:true,platform:'browser',format:'iife',target:'es2022'});
 await bundle({entryPoints:[path.join(client,'src/runtime/service-worker.ts')],outfile:path.join(publicDir,'service-worker.js'),bundle:true,platform:'browser',format:'iife',target:'es2022'});
 await viteBuild({configFile:path.join(client,'vite.config.ts'),publicDir,build:{outDir:product,emptyOutDir:true}});
 await bundle({stdin:{contents:"export {fromBinary} from '@bufbuild/protobuf';export {EnvelopeSchema} from './protocol/frontline_pb';export {applyDelta} from './runtime/snapshot';",resolveDir:path.join(client,'src')},outfile:path.join(buildDir,'decode.mjs'),bundle:true,platform:'node',format:'esm',target:'es2022'});
 const pack=await readFile(path.join(product,'assets/packs/base.json'));
 const report={started,completed:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),go:execFileSync('go',['version'],{encoding:'utf8'}).trim(),version,sha256:{host:hash(await readFile(path.join(buildDir,'frontline'))),wasm:hash(await readFile(path.join(runtime,'frontline.wasm'))),pack:hash(pack),clientSource:await sourceDigest(path.join(client,'src'))},packFiles:JSON.parse(pack).files.length,art:JSON.parse(await readFile(path.join(product,'art/index.json'),'utf8')),scope:'Isolated actual product; current art incomplete. No shared build artifacts overwritten.'};
 await writeFile(path.join(buildDir,'build.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await prepareProduct(),null,2));
