// Build a separate real product for menu-art review. No shipping source,
// manifest, active multiplayer build, runtime or asset file is modified.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,symlink,readdir,cp} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const require=createRequire(path.join(root,'client/package.json')),{build}=await import(pathToFileURL(require.resolve('vite')).href);
const base=path.join(root,'work/multiplayer-combat/build-history-recovery-v3'),out=path.join(here,'product-preview'),source=path.join(out,'source'),client=path.join(source,'client'),bundle=path.join(out,'bundle'),product=path.join(out,'product');
await mkdir(client,{recursive:true});
await writeFile(path.join(out,'.gitignore'),'*\n!.gitignore\n!build.json\n');
await cp(path.join(base,'source/client/src'),path.join(client,'src'),{recursive:true});
const ui=path.join(client,'src/ui');
await copyFile(path.join(ui,'MenuDiorama.tsx'),path.join(ui,'MenuDioramaPrevious.tsx'));
await copyFile(path.join(here,'MenuKeyArt.tsx'),path.join(ui,'MenuDiorama.tsx'));
for(const name of ['index.html','tsconfig.json'])await copyFile(path.join(root,'client',name),path.join(client,name));
await symlink(path.join(root,'client/node_modules'),path.join(client,'node_modules')).catch(error=>{if(error.code!=='EEXIST')throw error});
await symlink(path.join(root,'assets'),path.join(source,'assets')).catch(error=>{if(error.code!=='EEXIST')throw error});
await mkdir(path.join(client,'tests/render'),{recursive:true});
await copyFile(path.join(root,'client/tests/render/multiplayer-combat-entry.tsx'),path.join(client,'tests/render/multiplayer-combat-entry.tsx'));
await build({configFile:false,root:client,publicDir:false,plugins:[{name:'review-entry',transformIndexHtml:{order:'pre',handler:html=>html.replace('/src/main.tsx','/tests/render/multiplayer-combat-entry.tsx')}}],resolve:{dedupe:['@bufbuild/protobuf'],alias:[{find:/.*protocol\/frontline_pb(?:\.js)?$/,replacement:path.join(root,'work/runtime-034-candidate/runtime/frontline_pb.ts')}]},build:{outDir:bundle,emptyOutDir:true,target:'es2022',sourcemap:true,assetsInlineLimit:0,chunkSizeWarningLimit:2048}});
await mkdir(product,{recursive:true});execFileSync('cp',['-cR',path.join(base,'product')+'/.',product]);
await cp(bundle,product,{recursive:true});
await copyFile(path.join(base,'frontline'),path.join(out,'frontline'));
const imagePath='/art/ui/main_menu_key_art-column-02.png';
await copyFile(path.join(here,'column-02.png'),path.join(product,imagePath));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),packPath=path.join(product,'assets/packs/base.json'),pack=JSON.parse(await readFile(packPath,'utf8')),files=[];
for(const name of await readdir(path.join(bundle,'assets'))){const p='/assets/'+name,data=await readFile(path.join(product,p));files.push({path:p,sha256:sha(data),bytes:data.length})}
const image=await readFile(path.join(product,imagePath));files.push({path:imagePath,sha256:sha(image),bytes:image.length});
for(const item of files){const i=pack.files.findIndex(file=>file.path===item.path);if(i<0)pack.files.push(item);else pack.files[i]=item}
await writeFile(packPath,JSON.stringify(pack));
await writeFile(path.join(out,'build.json'),JSON.stringify({time:new Date().toISOString(),scope:'Actual frozen recovery-v3 product plus only isolated menu image component; old diorama retained as failed-image fallback. Incomplete game/art; no shipping promotion.',base:'work/multiplayer-combat/build-history-recovery-v3',baseReceipt:sha(await readFile(path.join(base,'build.json'))),component:sha(await readFile(path.join(here,'MenuKeyArt.tsx'))),image:{path:imagePath,sha256:sha(image),bytes:image.length},files,pack:sha(await readFile(packPath))},null,2)+'\n');
console.log(out);
