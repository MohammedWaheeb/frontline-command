// Frozen private consumer + unchanged v25/36 art and Go runtime. No live build
// or deployment. Run only with the parent's memory/browser lane coordination.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,copyFile,cp,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyProduct,fileInventory} from '../../scripts/package-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),version=process.argv[2],name=process.argv[3];
assert(/^v[1-9][0-9]*$/.test(version??''));assert(/^app-v[1-9][0-9]*-build-[0-9]+$/.test(name??''));
const out=path.join(here,name);await mkdir(out);const client=path.join(out,'source/client'),product=path.join(out,'product'),bundle=path.join(out,'bundle');
const sha=b=>createHash('sha256').update(b).digest('hex'),pins=new Map(),pin=async(file,expected)=>{const bytes=await readFile(file),digest=sha(bytes);if(expected)assert.equal(digest,expected,file);pins.set(file,digest);return bytes};
const receipt={status:'building',scope:'Private generation-bound application build, unchanged v25+36 incomplete art and exact Go0.3.4 runtime. Browser, final roster and release acceptance pending.',version,changes:[]};
const save=()=>writeFile(path.join(out,'build.json'),JSON.stringify(receipt,null,2)+'\n');await save();
try{
 await pin(fileURLToPath(import.meta.url));await pin(path.join(root,'scripts/package-integrity.mjs'));
 const lockBytes=await pin(path.join(here,`source-lock-${version}.json`)),lock=JSON.parse(lockBytes),frozen=path.join(here,`frozen-${version}`);receipt.sourceLockSHA256=sha(lockBytes);
 for(const [file,digest]of Object.entries(lock.files))await pin(path.join(frozen,file.replace(/^source\//,'')),digest);
 await cp(path.join(frozen,'client'),client,{recursive:true,filter:file=>!file.split(path.sep).includes('node_modules')});await symlink(path.join(root,'client/node_modules'),path.join(client,'node_modules'));
 const union=path.join(root,'work/art/roster-runtime-overlay-v1/outputs/complete-roster-v25');await pin(path.join(union,'build.json'),'35a7ade618a5e3afffe9c4fa512e90eefa5131f37721021be5f174c8e6008770');
 const oldProduct=path.join(union,'product'),oldPack=JSON.parse(await pin(path.join(oldProduct,'assets/packs/base.json'),'0fc30f4517ec9e36c8791ff9a4bd331ea166247dff7f68b9bc6b05bd643d62ee'));
 receipt.base=await verifyProduct(oldProduct);execFileSync('cp',['-cR',oldProduct,product]);
 const base=path.join(root,'work/art/effects-opus-v2/integration-v25'),baseReceipt=JSON.parse(await pin(path.join(base,'build.json'),'6c4f6f675983c3ab428546487ee419212a2b798aa66c513cd5913058084524f0'));
 await pin(path.join(base,'frontline'),baseReceipt.runtime.files['bin/frontline-host'].sha256);await copyFile(path.join(base,'frontline'),path.join(out,'frontline'));
 // Entry and HTML are exact earlier acceptance inputs: normal App with only
 // local authorized-view/command/lifecycle instrumentation for the test driver.
 for(const relative of ['index.html','tests/render/multiplayer-combat-entry.tsx']){
  const from=path.join(base,'source/client',relative);await pin(from,baseReceipt.sourceFiles[relative]);await mkdir(path.dirname(path.join(client,relative)),{recursive:true});await copyFile(from,path.join(client,relative));
 }
 // Capture original CSS file inputs without a symlink to a changing asset tree.
 // Each byte sequence must already occur in the immutable base product manifest.
 const admittedHashes=new Set(oldPack.files.map(file=>file.sha256));receipt.cssSourceAssets=[];
 for(const entry of await fileInventory(path.join(client,'src')))if(entry.path.endsWith('.css')){
  const file={path:'src/'+entry.path};
  const css=await readFile(path.join(client,file.path),'utf8');
  for(const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)){
   const url=match[1];if(/^(?:data:|https?:|\/|#)/.test(url))continue;
   const original=path.resolve(root,'client',path.dirname(file.path),url),target=path.resolve(client,path.dirname(file.path),url);
   assert(original.startsWith(path.join(root,'assets')+path.sep),'Unexpected external CSS source: '+original);
   const bytes=await pin(original);assert(admittedHashes.has(sha(bytes)),'CSS source not present in frozen base: '+original);
   await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
   receipt.cssSourceAssets.push({css:file.path,url,sha256:sha(bytes),bytes:bytes.length});
  }
 }
 const require=createRequire(path.join(root,'client/package.json')),{build}=await import(pathToFileURL(require.resolve('vite')).href),{build:bundleWorker}=await import(pathToFileURL(require.resolve('esbuild')).href);
 await build({configFile:false,root:client,publicDir:false,plugins:[{name:'acceptance-entry',transformIndexHtml:{order:'pre',handler:html=>html.replace('/src/main.tsx','/tests/render/multiplayer-combat-entry.tsx')}}],resolve:{dedupe:['@bufbuild/protobuf']},build:{outDir:bundle,emptyOutDir:true,target:'es2022',sourcemap:true,assetsInlineLimit:0,chunkSizeWarningLimit:2048}});
 // Remove only the cloned old application bundles, preserving all asset/data
 // directories. Their exact names and previous hashes stay in this receipt.
 for(const file of await fileInventory(product))if(/^assets\/[^/]+\.(?:js|css)(?:\.map)?$/.test(file.path)){receipt.changes.push({removedOldBundle:file.path,sha256:sha(await readFile(path.join(product,file.path)))});await rm(path.join(product,file.path))}
 await cp(bundle,product,{recursive:true});await bundleWorker({entryPoints:[path.join(client,'src/runtime/service-worker.ts')],outfile:path.join(product,'service-worker.js'),bundle:true,format:'iife',platform:'browser',target:'es2022',sourcemap:true});
 const {writeBasePack}=await import(pathToFileURL(path.join(client,'scripts/ui/art-plugin.mjs')).href);await writeBasePack(product);const next=JSON.parse(await readFile(path.join(product,'assets/packs/base.json'))),byPath=new Map(next.files.map(f=>[f.path,f]));
 let unchanged=0;for(const file of oldPack.files){if(file.path.startsWith('/art/')||file.path.startsWith('/runtime/')||file.path.startsWith('/content/')&&file.path!=='/content/index.json'||file.path.startsWith('/assets/fonts/')){assert.deepEqual(byPath.get(file.path),file,file.path);unchanged++}}
 receipt.cssOutputAssets=[];
 for(const file of await fileInventory(product))if(file.path.endsWith('.css'))for(const match of (await readFile(path.join(product,file.path),'utf8')).matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)){
  const url=match[1];if(/^(?:data:|https?:|#)/.test(url))continue;
  const pathname=new URL(url,'https://frontline.invalid/'+file.path).pathname;
  const descriptor=byPath.get(pathname);assert(descriptor,'CSS dependency absent from manifest: '+pathname);
  const bytes=await readFile(path.join(product,pathname.slice(1)));assert.equal(bytes.length,descriptor.bytes);assert.equal(sha(bytes),descriptor.sha256);
  receipt.cssOutputAssets.push({css:file.path,url,path:pathname,sha256:sha(bytes)});
 }
 receipt.unchangedArtRuntimeContentFontFiles=unchanged;receipt.product=await verifyProduct(product);receipt.sourceFiles={};for(const file of await fileInventory(path.join(client,'src')))receipt.sourceFiles['src/'+file.path]=sha(await readFile(path.join(client,'src',file.path)));
 for(const [file,digest]of pins)assert.equal(sha(await readFile(file)),digest,'Input changed: '+file);receipt.inputs=Object.fromEntries(pins);receipt.inputsVerifiedAfter=true;receipt.status='built-browser-unrun';await save();console.log(out);
}catch(error){receipt.status='failed';receipt.failure=String(error.stack??error);await save();throw error}
