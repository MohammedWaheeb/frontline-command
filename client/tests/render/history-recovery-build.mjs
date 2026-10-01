// Isolated current source snapshot plus the exact previous recovery art/runtime.
// No shared runtime, live art pack, or product checkout is rewritten.
import {build} from 'vite';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,symlink,readdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url)),base=path.join(root,'work/multiplayer-combat/build-headed-current'),out=path.resolve(process.env.FRONTLINE_HISTORY_BUILD??path.join(root,'work/multiplayer-combat/build-history-recovery')),source=path.join(out,'source'),client=path.join(source,'client'),temp=path.join(out,'bundle');
await mkdir(client,{recursive:true});await writeFile(path.join(out,'.gitignore'),'*\n!.gitignore\n!build.json\n');
await cp(path.join(base,'source/client/src'),path.join(client,'src'),{recursive:true});
const patchedFiles=['src/app/network-controller.ts','src/app/recorded-result.ts','src/ui/App.tsx','src/ui/network/index.tsx','src/ui/network/recorded-results.tsx','src/ui/network/recorded-results.css'];
for(const file of patchedFiles)await copyFile(path.join(root,'client',file),path.join(client,file));
for(const name of ['index.html','tsconfig.json'])await copyFile(path.join(root,'client',name),path.join(client,name));
await symlink(path.join(root,'client/node_modules'),path.join(client,'node_modules')).catch(error=>{if(error.code!=='EEXIST')throw error});
await symlink(path.join(root,'assets'),path.join(source,'assets')).catch(error=>{if(error.code!=='EEXIST')throw error});
await mkdir(path.join(client,'tests/render'),{recursive:true});await copyFile(path.join(root,'client/tests/render/multiplayer-combat-entry.tsx'),path.join(client,'tests/render/multiplayer-combat-entry.tsx'));
for(const file of ['retained-result-fixture.html','retained-result-fixture.tsx'])await copyFile(path.join(root,'client/tests/render',file),path.join(client,'tests/render',file));
await build({configFile:false,root:client,publicDir:false,plugins:[{name:'acceptance-entry',transformIndexHtml:{order:'pre',handler:html=>html.replace('/src/main.tsx','/tests/render/multiplayer-combat-entry.tsx')}}],resolve:{dedupe:['@bufbuild/protobuf'],alias:[{find:/.*protocol\/frontline_pb(?:\.js)?$/,replacement:path.join(root,'work/runtime-034-candidate/runtime/frontline_pb.ts')}]},build:{rollupOptions:{input:{app:path.join(client,'index.html'),retained:path.join(client,'tests/render/retained-result-fixture.html')}},outDir:temp,emptyOutDir:true,target:'es2022',sourcemap:true,assetsInlineLimit:0,chunkSizeWarningLimit:2048}});
await mkdir(path.join(out,'product'),{recursive:true});execFileSync('cp',['-cR',path.join(base,'product')+'/.',path.join(out,'product')]);await cp(temp,path.join(out,'product'),{recursive:true});for(const file of ['frontline','decode.mjs'])await copyFile(path.join(base,file),path.join(out,file));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),packPath=path.join(out,'product/assets/packs/base.json'),pack=JSON.parse(await readFile(packPath,'utf8')),codeFiles=[];
for(const entry of await readdir(path.join(temp,'assets'))){const relative='/assets/'+entry,bytes=await readFile(path.join(temp,'assets',entry)),item={path:relative,sha256:sha(bytes),bytes:bytes.length};codeFiles.push(item);const index=pack.files.findIndex(file=>file.path===relative);if(index<0)pack.files.push(item);else pack.files[index]=item}
await writeFile(packPath,JSON.stringify(pack));const report=JSON.parse(await readFile(path.join(base,'build.json'),'utf8'));const digest=createHash('sha256');
async function visit(dir){for(const entry of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(/\.(ts|tsx|css)$/.test(entry.name)){digest.update(path.relative(path.join(client,'src'),file));digest.update(await readFile(file))}}}
await visit(path.join(client,'src'));report.historyRecovery={time:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceSnapshot:'source/client/src',patchedFiles,baseArtRuntime:'../build-headed-current/product',codeFiles,indexSHA256:sha(await readFile(path.join(out,'product/index.html')))};report.sha256.baseClientSource=report.sha256.clientSource;report.sha256.clientSource=digest.digest('hex');report.sha256.basePack=report.sha256.pack;report.sha256.pack=sha(await readFile(packPath));report.scope='Frozen headed3H client/art/runtime plus only authenticated-history and recorded-result-cue files. Includes explicitly labeled retained-client memory fixture. No renderer changes, simulation mutation or shipping promotion.';await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');console.log(out);
