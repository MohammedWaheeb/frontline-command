// Frozen candidate host/runtime; new isolated product output only.
import {build as bundle} from 'esbuild';
import {build as viteBuild} from 'vite';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,readdir,cp,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),root=path.dirname(client),evidence=path.join(root,'work/multiplayer-combat');
export const buildDir=process.env.FRONTLINE_COMBAT_BUILD?path.resolve(process.env.FRONTLINE_COMBAT_BUILD):path.join(evidence,'build'),product=path.join(buildDir,'product'),candidate=path.join(root,'work/runtime-034-candidate');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sourceDigest(dir){const digest=createHash('sha256');async function visit(folder){for(const entry of(await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(folder,entry.name);if(entry.isDirectory())await visit(file);else if(/\.(ts|tsx|css)$/.test(entry.name)){digest.update(path.relative(dir,file));digest.update(await readFile(file))}}}await visit(dir);return digest.digest('hex')}
export async function prepareProduct(){
 if(process.env.FRONTLINE_COMBAT_REUSE==='1')return JSON.parse(await readFile(path.join(buildDir,'build.json'),'utf8'));
 await mkdir(buildDir,{recursive:true});await writeFile(path.join(buildDir,'.gitignore'),'*\n!.gitignore\n!build.json\n');
 const publicDir=path.join(buildDir,'public'),runtime=path.join(publicDir,'runtime'),started=new Date().toISOString();await mkdir(runtime,{recursive:true});
 // Freeze source before compilation. The sole art publisher coordinates a stable
 // copy boundary; artPlugin then packages exact current asset bytes into product.
 const frozenRoot=path.join(buildDir,'source'),frozenClient=path.join(frozenRoot,'client');await mkdir(frozenClient,{recursive:true});
 for(const dir of ['src','scripts'])await cp(path.join(client,dir),path.join(frozenClient,dir),{recursive:true});
 for(const file of ['index.html','tsconfig.json','vite.config.ts'])await copyFile(path.join(client,file),path.join(frozenClient,file));
 await mkdir(path.join(frozenClient,'tests/render'),{recursive:true});await copyFile(path.join(client,'tests/render/multiplayer-combat-entry.tsx'),path.join(frozenClient,'tests/render/multiplayer-combat-entry.tsx'));
 for(const [from,to] of [[path.join(client,'node_modules'),path.join(frozenClient,'node_modules')],[path.join(root,'assets'),path.join(frozenRoot,'assets')],[path.join(root,'content'),path.join(frozenRoot,'content')]])await symlink(from,to).catch(error=>{if(error.code!=='EEXIST')throw error});

 for(const name of ['frontline.wasm','wasm_exec.js','worker.js','version.json'])await copyFile(path.join(candidate,'runtime',name),path.join(runtime,name));
 await copyFile(path.join(candidate,'runtime/bin/frontline-host'),path.join(buildDir,'frontline'));
 const protocol=path.join(candidate,'runtime/frontline_pb.ts');
 await bundle({entryPoints:[path.join(frozenClient,'src/runtime/service-worker.ts')],outfile:path.join(publicDir,'service-worker.js'),bundle:true,platform:'browser',format:'iife',target:'es2022'});
 await viteBuild({configFile:path.join(frozenClient,'vite.config.ts'),publicDir,plugins:[{name:'acceptance-entry',enforce:'pre',transformIndexHtml:{order:'pre',handler(html){return html.replace('/src/main.tsx','/tests/render/multiplayer-combat-entry.tsx')}}}],resolve:{dedupe:['@bufbuild/protobuf'],alias:[{find:/.*protocol\/frontline_pb(?:\.js)?$/,replacement:protocol}]},build:{outDir:product,emptyOutDir:true}});
 await bundle({stdin:{contents:`export {fromBinary} from '@bufbuild/protobuf';export {EnvelopeSchema} from ${JSON.stringify(protocol)};export {applyDelta} from './runtime/snapshot';`,resolveDir:path.join(frozenClient,'src')},outfile:path.join(buildDir,'decode.mjs'),nodePaths:[path.join(client,'node_modules')],bundle:true,platform:'node',format:'esm',target:'es2022',plugins:[{name:'candidate',setup(build){build.onResolve({filter:/protocol\/frontline_pb$/},()=>({path:protocol}))}}]});
 const pack=await readFile(path.join(product,'assets/packs/base.json'));
 const report={started,completed:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),version:JSON.parse(await readFile(path.join(runtime,'version.json'),'utf8')),sha256:{host:sha(await readFile(path.join(buildDir,'frontline'))),wasm:sha(await readFile(path.join(runtime,'frontline.wasm'))),protocol:sha(await readFile(protocol)),pack:sha(pack),clientSource:await sourceDigest(path.join(frozenClient,'src')),entry:sha(await readFile(path.join(frozenClient,'tests/render/multiplayer-combat-entry.tsx')))},packFiles:JSON.parse(pack).files.length,art:JSON.parse(await readFile(path.join(product,'art/index.json'),'utf8')),sourceSnapshot:'source/client',scope:'Source-frozen product App with acceptance-only normal command API bridge; frozen isolated 0.3.4. Art incomplete; no shared runtime promotion.'};
 await writeFile(path.join(buildDir,'build.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await prepareProduct(),null,2));
