// Private ordinary-App compact leaf-spur candidate. Exact original runtime/art; no live writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile,cp,rm,symlink,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,loadConfigFromFile} from '../../client/node_modules/vite/dist/node/index.js';
import {captureClientInputs,requireSameInputs} from '../../scripts/package-presentation-inputs.mjs';
import {verifyProduct,fileInventory,fileDigest} from '../../scripts/package-integrity.mjs';
import {writeBasePack} from '../../client/scripts/ui/art-plugin.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const name=process.argv[2];assert(/^build-[0-9]{2}$/.test(name??''),'Supply fresh build-NN');
const out=path.join(here,name);await mkdir(out);
const base=path.join(root,'work/ordinary-package-presentation-v1/build-02/package'),candidate=path.join(root,'work/renderer-performance-v1/combined-candidate');
const stage=path.join(out,'source'),client=path.join(stage,'client'),productRoot=path.join(out,'package'),product=path.join(productRoot,'client'),bundle=path.join(out,'bundle');
const sha=b=>createHash('sha256').update(b).digest('hex'),pins=new Map();
async function pin(file,expected){const bytes=await readFile(file),digest=sha(bytes);if(expected)assert.equal(digest,expected,file);pins.set(file,digest);return bytes}
const receipt={status:'building',started:new Date().toISOString(),scope:'Private normal App with one compact leaf-spur terrain candidate file. Original ordinary Go/WASM/art unchanged. Browser/native pixel/resource acceptance pending; incomplete art, no deployment.'};
const save=()=>writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await save();
try{
 await pin(fileURLToPath(import.meta.url));await copyFile(fileURLToPath(import.meta.url),path.join(out,'actual-build.mjs'));
 for(const rel of ['scripts/package-integrity.mjs','scripts/package-presentation-inputs.mjs','client/scripts/ui/art-plugin.mjs','client/scripts/ui/effect-pack.mjs'])await pin(path.join(root,rel));
 const baseVersion=JSON.parse(await pin(path.join(base,'version.json'),'2b4b2be0965adef648f8e5cf256f51c3d3474bc4bdc038876ff79fe65fad1470'));
 const baseInventory=JSON.parse(await pin(path.join(base,'package-files.json'),'3b2e54f5ff797ae47bcaaa14f9f4fc48c1121774dcc895f9d7d7f66bd26786ce'));assert.equal(baseInventory.format_version,1);assert(Array.isArray(baseInventory.files));
 receipt.originalVersion=baseVersion;receipt.baseProduct=await verifyProduct(path.join(base,'client'));
 assert.equal(receipt.baseProduct.packSHA256,'be9d016e12e7e5bf222d62b139dc795f015f5357c4da7e938cada54d7b734e5d');
 const oldPack=JSON.parse(await pin(path.join(base,'client/assets/packs/base.json'),receipt.baseProduct.packSHA256));
 const before=await captureClientInputs(root);await writeFile(path.join(out,'live-before.json'),JSON.stringify(before,null,2)+'\n');
 const parent=JSON.parse(await pin(path.join(root,'work/presentation-renderer-integration-v1/checks-01/inputs.json')));
 for(const row of parent.changes)await pin(path.join(root,row.path),row.after);
 receipt.originalMappedSources=[];
 for(const f of await fileInventory(path.join(base,'client/assets')))if(f.path.endsWith('.js.map')){
  const map=JSON.parse(await pin(path.join(base,'client/assets',f.path)));
  for(let i=0;i<map.sources.length;i++)if(map.sources[i].startsWith('../../src/')){
   const rel='client/'+map.sources[i].slice('../../'.length),text=map.sourcesContent[i];assert.equal(typeof text,'string');await pin(path.join(root,rel),sha(Buffer.from(text)));receipt.originalMappedSources.push(rel);
  }
 }
 assert(new Set(receipt.originalMappedSources).size>=100,'Incomplete original source-map closure');
 await mkdir(client,{recursive:true});
 for(const rel of ['src','scripts','public'])execFileSync('cp',['-cR',path.join(root,'client',rel),path.join(client,rel)]);
 // Capture ordinary config and env files, along with the shared guard inputs.
 for(const row of before.files)if(!/^client\/(src|scripts|public)\//.test(row.path)){
  assert(!row.directory&&!row.link,'Unexpected top-level source link');const dest=path.join(stage,row.path);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,row.path),dest);
 }
 requireSameInputs(before,await captureClientInputs(stage),'initial private source clone');
 const rel='client/src/render/terrain.ts',candidateFile=path.join(root,'work/terrain-spur-v2/inputs/candidate-module-terrain.ts');
 const bytes=await pin(candidateFile,'3574f24748adfec6385184c611a5f21d56a8f0680c5b40c6eebf38e92de2ccda');
 assert.equal(sha(await readFile(path.join(stage,rel))),'de219a85e70a1cb9ed02ec41ab7eb7d3e40a780fa375649eac16ffc8a5d0c005');
 receipt.changes=[{path:rel,before:'de219a85e70a1cb9ed02ec41ab7eb7d3e40a780fa375649eac16ffc8a5d0c005',after:sha(bytes)}];await writeFile(path.join(stage,rel),bytes);
 const authored=await captureClientInputs(stage);receipt.candidateInputs=authored;await writeFile(path.join(out,'candidate-inputs.json'),JSON.stringify(authored,null,2)+'\n');
 const authoredMap=new Map(authored.files.map(row=>[row.path,row]));assert.equal(before.files.length,authored.files.length);
 for(const row of before.files){const changed=receipt.changes.find(c=>c.path===row.path);if(changed)assert.equal(authoredMap.get(row.path).sha256,changed.after);else assert.deepEqual(authoredMap.get(row.path),row,row.path)}
 await symlink(path.join(root,'client/node_modules'),path.join(client,'node_modules'));
 const admittedHashes=new Set(oldPack.files.map(f=>f.sha256));receipt.cssSourceAssets=[];
 for(const row of authored.files.filter(row=>row.path.endsWith('.css')&&!row.path.includes('/node_modules/'))){
  const css=await readFile(path.join(stage,row.path),'utf8');
  for(const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)){
   const url=match[1];if(/^(?:data:|https?:|\/|#)/.test(url))continue;
   const from=path.resolve(root,path.dirname(row.path),url),to=path.resolve(stage,path.dirname(row.path),url);
   assert(from.startsWith(path.join(root,'assets')+path.sep));assert(to.startsWith(stage+path.sep));
   const bytes=await pin(from);assert(admittedHashes.has(sha(bytes)),'CSS asset absent from immutable base');await mkdir(path.dirname(to),{recursive:true});await writeFile(to,bytes);receipt.cssSourceAssets.push({source:from,path:path.relative(stage,to),sha256:sha(bytes)});
  }
 }
 const loaded=await loadConfigFromFile({command:'build',mode:'production'},path.join(stage,'client/vite.config.ts'));assert(loaded);
 const ordinary=loaded.config.plugins,plugins=ordinary.filter(plugin=>plugin?.name!=='frontline-art');assert.equal(ordinary.length-plugins.length,1);
 await build({...loaded.config,root:client,publicDir:false,configFile:false,plugins,build:{...loaded.config.build,outDir:bundle}});
 execFileSync('cp',['-cR',base,productRoot]);
 receipt.removedOldBundles=[];
 for(const file of await fileInventory(product))if(/^assets\/[^/]+\.(?:js|css)(?:\.map)?$/.test(file.path)){
  receipt.removedOldBundles.push({path:file.path,...await fileDigest(path.join(product,file.path))});await rm(path.join(product,file.path));
 }
 const bundleFiles=await fileInventory(bundle);
 // Closed generated namespace; no future Vite output may overwrite runtime,
 // art, content or arbitrary package files. Copied binary decorations must
 // already be the exact original ordinary-package bytes.
 for(const row of bundleFiles){
  const rel=row.path;
  if(['index.html','build-assets.json'].includes(rel))continue;
  assert(/^assets\/[^/]+$/.test(rel),'Unowned Vite output '+rel);
  if(!/\.(?:[cm]?js|css)(?:\.map)?$/.test(rel))assert(admittedHashes.has((await fileDigest(path.join(bundle,rel))).sha256),'Unreviewed Vite decoration '+rel);
 }
 await cp(bundle,product,{recursive:true});
 await writeBasePack(product);receipt.product=await verifyProduct(product,{previous:path.join(base,'client')});
 const nextPack=JSON.parse(await readFile(path.join(product,'assets/packs/base.json'))),next=new Map(nextPack.files.map(f=>[f.path,f]));
 const replaceable=new Set(['/content/index.json',...receipt.removedOldBundles.map(f=>'/'+f.path),...bundleFiles.map(f=>'/'+f.path)]);let unchanged=0;
 for(const old of oldPack.files)if(!replaceable.has(old.path)){assert.deepEqual(next.get(old.path),old,old.path);unchanged++}
 for(const file of nextPack.files)assert(oldPack.files.some(old=>old.path===file.path)||replaceable.has(file.path),'Unexpected product addition '+file.path);
 const oldContent=JSON.parse(await readFile(path.join(base,'client/content/index.json'))),newContent=JSON.parse(await readFile(path.join(product,'content/index.json')));newContent.packs.find(p=>p.id==='2.0.0').version=oldContent.packs.find(p=>p.id==='2.0.0').version;assert.deepEqual(newContent,oldContent);
 receipt.unchangedPackFiles=unchanged;requireSameInputs(authored,await captureClientInputs(stage),'candidate Vite build');requireSameInputs(before,await captureClientInputs(root),'live sources during private build');
 const version={...baseVersion,product_pack:receipt.product,presentation_inputs:{sourceFiles:authored.files.length,sourceSHA256:authored.sha256,scope:'Private frozen ordinary App with exactly one compact leaf-spur terrain candidate file. Runtime/source_revision inherited unchanged from the original ordinary package.'},private_candidate:{kind:'terrain-spur-app-v2',changes:receipt.changes,originalVersionSHA256:'2b4b2be0965adef648f8e5cf256f51c3d3474bc4bdc038876ff79fe65fad1470'},acceptance:'Private graphics candidate; browser/native pixel/resource and final-art acceptance pending.'};
 await writeFile(path.join(productRoot,'version.json'),JSON.stringify(version,null,2)+'\n');
 await rm(path.join(productRoot,'package-files.json'));
 const packageFiles=[];for(const row of await fileInventory(productRoot))packageFiles.push({path:row.path,...await fileDigest(path.join(productRoot,row.path))});
 await writeFile(path.join(productRoot,'package-files.json'),JSON.stringify({format_version:1,files:packageFiles},null,2)+'\n');
 receipt.unchangedNonclientFiles=0;
 for(const row of baseInventory.files)if(!row.path.startsWith('client/')&&!['version.json','package-files.json'].includes(row.path)){assert.deepEqual(await fileDigest(path.join(base,row.path)),{bytes:row.bytes,sha256:row.sha256});assert.deepEqual(await fileDigest(path.join(productRoot,row.path)),{bytes:row.bytes,sha256:row.sha256});receipt.unchangedNonclientFiles++}
 const closed=JSON.parse(await readFile(path.join(productRoot,'package-files.json')));assert.equal(closed.format_version,1);for(const row of closed.files)assert.deepEqual(await fileDigest(path.join(productRoot,row.path)),{bytes:row.bytes,sha256:row.sha256});
 receipt.packageFiles=packageFiles.length+1;receipt.version=await fileDigest(path.join(productRoot,'version.json'));receipt.packageInventory=await fileDigest(path.join(productRoot,'package-files.json'));receipt.host=await fileDigest(path.join(productRoot,'frontline'));assert.equal(receipt.host.sha256,'c3605cdc58ed10b80705496aa4c7c0d5c2cc491a7ce14bd45654a2b522773528');
 for(const [file,expected]of pins)assert.equal(sha(await readFile(file)),expected,'Input changed '+file);
 receipt.pins=Object.fromEntries(pins);receipt.status='built-browser-unrun';receipt.ended=new Date().toISOString();await save();console.log(JSON.stringify({status:receipt.status,productRoot,product:receipt.product,version:receipt.version,host:receipt.host,unchangedPackFiles:unchanged},null,2));
}catch(error){receipt.status='failed';receipt.error=String(error.stack??error);receipt.ended=new Date().toISOString();await save();throw error}
