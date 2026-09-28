// Current product source, exact optimized Go/WASM, frozen existing gameplay art
// and the v3 menu painting. No shared runtime, manifest or build is overwritten.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,symlink,readdir,cp} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const require=createRequire(path.join(root,'client/package.json')),{build}=await import(pathToFileURL(require.resolve('vite')).href);
const {writeBasePack}=await import(pathToFileURL(path.join(root,'client/scripts/ui/art-plugin.mjs')).href);
const base=path.join(root,'work/multiplayer-combat/build-optimized-recovery'),out=path.join(here,'product-preview'),source=path.join(out,'source'),client=path.join(source,'client'),bundle=path.join(out,'bundle'),product=path.join(out,'product');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(out); // Existing evidence is never silently replaced.
await mkdir(client,{recursive:true});await writeFile(path.join(out,'.gitignore'),'*\n!.gitignore\n!build.json\n');
await cp(path.join(root,'client/src'),path.join(client,'src'),{recursive:true});
const sourceFiles={};
async function inventory(dir){for(const name of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,name.name);if(name.isDirectory())await inventory(file);else if(name.isFile())sourceFiles[path.relative(client,file)]=sha(await readFile(file))}}
await inventory(path.join(client,'src'));
for(const name of ['index.html','tsconfig.json'])await copyFile(path.join(root,'client',name),path.join(client,name));
await symlink(path.join(root,'client/node_modules'),path.join(client,'node_modules'));
await symlink(path.join(root,'assets'),path.join(source,'assets'));
await mkdir(path.join(client,'tests/render'),{recursive:true});
await copyFile(path.join(root,'client/tests/render/multiplayer-combat-entry.tsx'),path.join(client,'tests/render/multiplayer-combat-entry.tsx'));
await build({configFile:false,root:client,publicDir:false,plugins:[{name:'review-entry',transformIndexHtml:{order:'pre',handler:html=>html.replace('/src/main.tsx','/tests/render/multiplayer-combat-entry.tsx')}}],resolve:{dedupe:['@bufbuild/protobuf'],alias:[{find:/.*protocol\/frontline_pb(?:\.js)?$/,replacement:path.join(root,'work/navigation-lookup-candidate/runtime/frontline_pb.ts')}]},build:{outDir:bundle,emptyOutDir:true,target:'es2022',sourcemap:true,assetsInlineLimit:0,chunkSizeWarningLimit:2048}});
await mkdir(product);execFileSync('cp',['-cR',path.join(base,'product')+'/.',product]);
await cp(bundle,product,{recursive:true});await copyFile(path.join(base,'frontline'),path.join(out,'frontline'));
const runtimeReceipt=JSON.parse(await readFile(path.join(root,'work/navigation-lookup-candidate/runtime-build-receipt.json'),'utf8'));
assert.equal(sha(await readFile(path.join(out,'frontline'))),runtimeReceipt.files['bin/frontline-host'].sha256);
assert.equal(sha(await readFile(path.join(product,'runtime/frontline.wasm'))),runtimeReceipt.files['frontline.wasm'].sha256);
const imagePath='ui/keyart/main_menu.png';
await mkdir(path.join(product,'art/ui/keyart'),{recursive:true});await copyFile(path.join(here,'column-03.png'),path.join(product,'art',imagePath));
const indexPath=path.join(product,'art/index.json'),index=JSON.parse(await readFile(indexPath,'utf8'));index.keyArt=imagePath;await writeFile(indexPath,JSON.stringify(index));
const pack=await writeBasePack(product),image=await readFile(path.join(product,'art',imagePath));
const entry=pack.files.find(file=>file.path==='/art/'+imagePath);assert(entry);assert.equal(entry.sha256,sha(image));
await writeFile(path.join(out,'build.json'),JSON.stringify({time:new Date().toISOString(),scope:'Current captured product UI/renderer source, exact optimized0.3.4 native/WASM, frozen incomplete gameplay art plus original v3 menu illustration. Not a complete release or shipping runtime promotion.',base:'work/multiplayer-combat/build-optimized-recovery',baseReceipt:sha(await readFile(path.join(base,'build.json'))),sourceFiles,sourceDigest:sha(JSON.stringify(sourceFiles)),entry:sha(await readFile(path.join(client,'tests/render/multiplayer-combat-entry.tsx'))),image:{path:'/art/'+imagePath,sha256:sha(image),bytes:image.length},runtime:runtimeReceipt,pack:sha(await readFile(path.join(product,'assets/packs/base.json')))},null,2)+'\n');
console.log(out);
