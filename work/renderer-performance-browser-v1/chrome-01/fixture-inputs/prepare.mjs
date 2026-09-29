import {readFile,writeFile,mkdir,readdir,copyFile,access,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from '../../client/node_modules/esbuild/lib/main.js';
const work=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(work,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const prepared=path.join(work,'prepared');await mkdir(prepared,{recursive:true});
try{await access(path.join(work,'node_modules'))}catch{await symlink(path.join(root,'client/node_modules'),path.join(work,'node_modules'))}
const products={baseline:path.join(root,'work/ordinary-package-cadence-v1/build-01/package/client'),candidate:path.join(root,'work/graphics-integration-v1/build-02/package/client')};
const pins={},payloads={},sources={},productPins={},bundlePins={};
async function pin(file){const data=await readFile(file);pins[file]=sha(data);return data}
async function tree(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await tree(p));else if(e.isFile())result.push(p)}return result.sort()}
const base=path.join(root,'work/renderer-performance-v1/baseline/client/src'),candidate=path.join(root,'work/renderer-performance-v1/combined-candidate/client/src');
for(const variant of Object.keys(products)){
 const stage=path.join(prepared,variant,'src');sources[variant]={};
 for(const original of await tree(base)){const rel=path.relative(base,original),file=variant==='candidate'&&['render/battlefield.ts','render/terrain.ts','render/art.ts'].includes(rel)?path.join(candidate,rel):original;const data=await pin(file),out=path.join(stage,rel);await mkdir(path.dirname(out),{recursive:true});await writeFile(out,data);sources[variant][rel]=sha(data)}
 const tsconfig={compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',lib:['ES2022','DOM','DOM.Iterable'],jsx:'react-jsx',strict:true,skipLibCheck:true,noEmit:true,types:[],paths:{'@source/*':[path.join(stage,'*')]}},include:[path.join(work,'fixture.ts')]};
 await writeFile(path.join(prepared,variant,'tsconfig.json'),JSON.stringify(tsconfig,null,2));
 const result=await build({entryPoints:[path.join(work,'fixture.ts')],outfile:path.join(prepared,variant,'fixture.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',tsconfig:path.join(prepared,variant,'tsconfig.json'),sourcemap:true,metafile:true,nodePaths:[path.join(root,'client/node_modules')]});
 bundlePins[variant]={};for(const leaf of ['fixture.js','fixture.js.map'])bundlePins[variant][leaf]=sha(await readFile(path.join(prepared,variant,leaf)));
 await writeFile(path.join(prepared,variant,'build-inputs.json'),JSON.stringify(result.metafile,null,2));
 const importedPins={};for(const p of Object.keys(result.metafile.inputs)){const f=path.resolve(root,p);importedPins[f]=sha(await readFile(f))}await writeFile(path.join(prepared,variant,'build-input-pins.json'),JSON.stringify(importedPins,null,2));
 const product=products[variant],manifest=await pin(path.join(product,'assets/packs/base.json')),version=await pin(path.join(product,'../version.json'));const manifestJSON=JSON.parse(manifest);
 productPins[variant]={product,manifestSHA256:sha(manifest),versionSHA256:sha(version),files:manifestJSON.files};
 for(const leaf of ['content/index.json','art/index.json','runtime/frontline.wasm','runtime/version.json'])await pin(path.join(product,leaf));
}
assert.equal(productPins.baseline.manifestSHA256,'b73e3325ba370733419332243a63fe6b0e7663ade09808f731bf5f8592f09553');
assert.equal(productPins.candidate.manifestSHA256,'56673aca898ee4344ceb323eae01f0b1e4f8af19ed5299f222569c0c9056afec');
const changed=Object.keys(sources.baseline).filter(k=>sources.baseline[k]!==sources.candidate[k]);assert.deepEqual(changed,['render/art.ts','render/battlefield.ts','render/terrain.ts']);
const basemap=new Map(productPins.baseline.files.map(f=>[f.path,f]));let sameArt=0;for(const f of productPins.candidate.files)if(f.path.startsWith('/art/')||f.path.startsWith('/runtime/')){assert.deepEqual(f,basemap.get(f.path));sameArt++}
for(const [kind,folder,before,after,id] of [
 ['ground','airlift-lifecycle/native-2026-09-29T07-39-30.706Z','parked-ready.view.json','field-unloaded.view.json',27],
 ['air','aircraft-service-status/native-2026-09-29T00-00-52.299Z','a-paid-fighter-ready.view.json','a-paid-fighter-service.view.json',66],
]){payloads[kind]={id,originalDirectory:folder,files:{}};for(const [name,leaf] of [['map','map.json'],['before',before],['after',after]]){const file=path.join(root,'work/evidence',folder,leaf),data=await pin(file),out=path.join(prepared,`${kind}-${name}.json`);await writeFile(out,data);payloads[kind].files[name]={file:out,original:file,sha256:sha(data),bytes:data.length}}}
const rules=path.join(root,'pkg/content/rules.json'),catalog=await pin(rules);await writeFile(path.join(prepared,'catalog.json'),catalog);
for(const p of ['work/evidence/airlift-lifecycle/native-2026-09-29T07-39-30.706Z/report.json','work/evidence/aircraft-service-status/native-inventory.json','work/graphics-integration-v1/build-02/receipt.json','work/full-app-native-body-v2/product-01.config.json'])await pin(path.join(root,p));
const browser=JSON.parse(await readFile(path.join(root,'work/full-app-native-body-v2/product-01.config.json'),'utf8'));assert.equal(sha(await readFile(browser.executable)),browser.executableSHA256);
await writeFile(path.join(prepared,'lock.json'),JSON.stringify({status:'prepared-browser-unrun',created:new Date().toISOString(),scope:'Actual frozen BattlefieldRenderer component; synthetic terrain + untouched recorded Go snapshots, original current art, no WASM execution.',browserFallback:'Browser plugin not available; regular Playwright uses pinned genuine Google Chrome.',products:productPins,pins,sources,bundlePins,changed,sameArtAndRuntimeFiles:sameArt,payloads,catalog:{file:rules,sha256:sha(catalog)},browser:{executable:browser.executable,sha256:browser.executableSHA256}},null,2)+'\n');
console.log(JSON.stringify({status:'prepared-browser-unrun',sourceFiles:Object.keys(sources.baseline).length,changed,sameArtAndRuntimeFiles:sameArt,payloads:Object.keys(payloads),catalogSHA256:sha(catalog)},null,2));
