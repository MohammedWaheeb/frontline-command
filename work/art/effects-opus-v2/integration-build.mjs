// Freeze exact product sources/runtime/art before any browser acceptance. This
// candidate is isolated; no production manifest or shared package is changed.
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
const name=process.argv[2];assert(/^integration-v[1-9][0-9]*$/.test(name),'Supply a new integration-vN output name');
const effectSet=process.argv[3]??'candidate-59';assert(['candidate-59','candidate-71'].includes(effectSet),'Choose a reviewed isolated effect set');
const runtimeSet=process.argv[4]??'navigation';assert(['navigation','integrated-034'].includes(runtimeSet),'Choose a reviewed frozen runtime');
const runtimeReceiptPath=path.join(root,runtimeSet==='integrated-034'?'work/runtime-034-integrated-source/runtime-builds/20260929T081745Z/receipt.json':'work/navigation-lookup-candidate/runtime-build-receipt.json');
const runtimeDir=path.join(root,runtimeSet==='integrated-034'?'work/runtime-034-integrated-source/runtime-builds/20260929T081745Z/runtime':'work/navigation-lookup-candidate/runtime');
const base=path.join(root,'work/art/menu-keyart-generated-v3/product-preview'),out=path.join(here,name),source=path.join(out,'source'),client=path.join(source,'client'),bundle=path.join(out,'bundle'),product=path.join(out,'product');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const runtimeBytes=await readFile(runtimeReceiptPath),runtime=JSON.parse(runtimeBytes);
if(runtimeSet==='integrated-034'){assert.equal(sha(runtimeBytes),'cc990ac7f78d5a1094dd635d06bff0cb04d2c055ce413dbd114a7233bb176e69');assert.equal(runtime.status,'passed');assert.equal(runtime.source_lock_sha256,'3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750');}
for(const [name,record] of Object.entries(runtime.files))assert.equal(sha(await readFile(path.join(runtimeDir,name))),record.sha256,`Frozen runtime changed: ${name}`);
await mkdir(out);await mkdir(client,{recursive:true});await writeFile(path.join(out,'.gitignore'),'*\n!.gitignore\n!build.json\n');
await cp(path.join(root,'client/src'),path.join(client,'src'),{recursive:true,filter:file=>!file.split(path.sep).includes('node_modules')});
await copyFile(path.join(runtimeDir,'frontline_pb.ts'),path.join(client,'src/protocol/frontline_pb.ts'));
for(const file of ['index.html','tsconfig.json'])await copyFile(path.join(root,'client',file),path.join(client,file));
await mkdir(path.join(client,'tests/render'),{recursive:true});
for(const file of ['multiplayer-combat-entry.tsx','fx-integration-fixture.ts','ambient-integration-fixture.ts'])await copyFile(path.join(root,'client/tests/render',file),path.join(client,'tests/render',file));
await symlink(path.join(root,'client/node_modules'),path.join(client,'node_modules'));
await symlink(path.join(root,'assets'),path.join(source,'assets'));
const sourceFiles={};
async function inventory(dir){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.name==='node_modules')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await inventory(file);else if(entry.isFile())sourceFiles[path.relative(client,file)]=sha(await readFile(file))}}
await inventory(client);
await build({configFile:false,root:client,publicDir:false,plugins:[{name:'acceptance-entry',transformIndexHtml:{order:'pre',handler:html=>html.replace('/src/main.tsx','/tests/render/multiplayer-combat-entry.tsx')}}],resolve:{dedupe:['@bufbuild/protobuf']},build:{outDir:bundle,emptyOutDir:true,target:'es2022',sourcemap:true,assetsInlineLimit:0,chunkSizeWarningLimit:2048}});
await mkdir(product);execFileSync('cp',['-cR',path.join(base,'product')+'/.',product]);
await cp(bundle,product,{recursive:true});await copyFile(path.join(runtimeDir,'bin/frontline-host'),path.join(out,'frontline'));
for(const name of ['frontline.wasm','worker.js','worker.js.map','wasm_exec.js','version.json'])if(runtime.files[name])await copyFile(path.join(runtimeDir,name),path.join(product,'runtime',name));
assert.equal(sha(await readFile(path.join(out,'frontline'))),runtime.files['bin/frontline-host'].sha256);
for(const name of ['frontline.wasm','worker.js','wasm_exec.js','version.json'])assert.equal(sha(await readFile(path.join(product,'runtime',name))),runtime.files[name].sha256);
await cp(path.join(here,effectSet,'fx'),path.join(product,'art/fx'),{recursive:true});
const effectBytes=await readFile(path.join(product,'art/fx/index.json')),effects={url:'fx/index.json',sha256:sha(effectBytes),bytes:effectBytes.length};
const effectCount=Object.keys(JSON.parse(effectBytes).effects).length;
const indexPath=path.join(product,'art/index.json'),index=JSON.parse(await readFile(indexPath,'utf8'));index.effects=effects;await writeFile(indexPath,JSON.stringify(index));
await writeBasePack(product);
await writeFile(path.join(out,'build.json'),JSON.stringify({time:new Date().toISOString(),scope:`Captured product code with exact optimized0.3.4 Go, previous frozen incomplete actor art plus${effectCount} candidate effects. Browser acceptance is pending; not a complete release or final asset acceptance.`,base:path.relative(root,base),baseReceipt:sha(await readFile(path.join(base,'build.json'))),sourceFiles,sourceDigest:sha(JSON.stringify(sourceFiles)),effectSet,effectCount,effects,runtimeSet,runtimeReceiptPath:path.relative(root,runtimeReceiptPath),runtimeReceiptSHA256:sha(runtimeBytes),runtime,pack:sha(await readFile(path.join(product,'assets/packs/base.json')))},null,2)+'\n');
console.log(out);
