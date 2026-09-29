import {lstat,readdir,readFile,readlink,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileDigest,fileInventory,portablePath} from './package-integrity.mjs';
import {artPackageSources} from '../client/scripts/ui/art-plugin.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const generated=new Set(['client/src/protocol/frontline_pb.ts','client/public/runtime/frontline.wasm','client/public/runtime/wasm_exec.js','client/public/runtime/version.json','client/public/runtime/worker.js','client/public/runtime/worker.js.map','client/public/service-worker.js','client/public/service-worker.js.map']);
const configFiles=['client/index.html','client/package.json','client/package-lock.json','client/tsconfig.json','client/vite.config.ts','client/.env','client/.env.local','client/.env.production','client/.env.production.local','scripts/local.mjs','scripts/package-integrity.mjs','scripts/package-presentation-inputs.mjs'];
const identity=files=>({files,sha256:hash(JSON.stringify(files))});

/** Source paths may contain nested installed dependencies and their .bin links.
 * Preserve link identity as well as bytes; reject escapes and directory cycles.
 * The top-level installed toolchain remains governed by npm's pinned lockfile.
 */
async function sourceTree(root,rel,rows,ancestors=new Set()){
 const file=path.join(root,rel);let info;try{info=await lstat(file)}catch(error){if(error.code==='ENOENT')return;throw error}
 const physical=await realpath(file);if(!physical.startsWith(root+path.sep))throw Error(`Build input escapes source root: ${rel}`);
 const link=info.isSymbolicLink()?await readlink(file):undefined;if(link)info=await stat(file);
 if(info.isDirectory()){
  if(ancestors.has(physical))throw Error(`Build input directory cycle: ${rel}`);
  const next=new Set(ancestors).add(physical);if(link)rows.push({path:rel,link,directory:true});
  for(const name of (await readdir(file)).sort())await sourceTree(root,rel+'/'+name,rows,next);
 }else if(info.isFile())rows.push({path:rel,...(link?{link}:{}),...await fileDigest(file)});
 else throw Error(`Unsupported build input: ${rel}`);
}
export async function captureClientInputs(root,{includeGenerated=true}={}){
 root=await realpath(root);const rows=[];
 for(const rel of ['client/src','client/scripts','client/public',...configFiles])await sourceTree(root,rel,rows);
 const files=rows.filter(row=>includeGenerated||!generated.has(row.path)).sort((a,b)=>a.path.localeCompare(b.path));
 return identity(files);
}
export function requireSameInputs(before,after,phase){
 if(before.sha256!==after.sha256)throw Error(`Client/art build inputs changed during ${phase}; preserve staging output and rebuild from frozen inputs.`);
}
async function pin(root,source){
 const physical=await realpath(source);if(!physical.startsWith(root+path.sep))throw Error('Art input escapes the source root');
 if(!(await lstat(source)).isFile())throw Error('Art input must be a regular file');
 return {path:path.relative(root,source).split(path.sep).join('/'),...await fileDigest(source)};
}
export async function capturePresentationInputs(root){
 root=await realpath(root);const client=await captureClientInputs(root),{index,sources}=await artPackageSources(path.join(root,'assets'));
 const outputs=[],inputMap=new Map(client.files.map(row=>[row.path,row]));
 const publicFiles=client.files.filter(row=>row.path.startsWith('client/public/')&&!row.directory);
 const seen=new Set(publicFiles.map(row=>row.path.slice('client/public/'.length)));
 for(const output of ['index.html','art/index.json','assets/packs/base.json','build-assets.json']){if(seen.has(output))throw Error(`Public/generated build destination collision: ${output}`);seen.add(output)}
 for(const {source,output} of sources){
  portablePath(output);if(seen.has(output))throw Error(`Public/art build destination collision: ${output}`);seen.add(output);
  const row=await pin(root,source);inputMap.set(row.path,row);outputs.push({path:output,source:row.path,bytes:row.bytes,sha256:row.sha256});
 }
 // CSS imports have separate hashed Vite outputs, but reference these same
 // original font/chrome bytes. Include every file in both source directories.
 for(const rel of ['assets/fonts','assets/build/ui/chrome','assets/manifest/asset-manifest.json']){
  const rows=[];await sourceTree(root,rel,rows);for(const row of rows)inputMap.set(row.path,row);
 }
 // The content index is copied then receives its generated base-pack version.
 const content=[];await sourceTree(root,'content',content);
 for(const row of content.filter(row=>row.path.endsWith('.json')&&!row.directory)){
  const output=row.path;if(seen.has(output))throw Error(`Public/content build destination collision: ${output}`);seen.add(output);inputMap.set(row.path,row);
  outputs.push({path:output,source:row.path,bytes:row.bytes,sha256:row.sha256});
 }
 for(const row of publicFiles)outputs.push({path:row.path.slice('client/public/'.length),source:row.path,bytes:row.bytes,sha256:row.sha256});
 const indexBytes=Buffer.from(JSON.stringify(index));outputs.push({path:'art/index.json',bytes:indexBytes.length,sha256:hash(indexBytes)});
 const files=[...inputMap.values()].sort((a,b)=>a.path.localeCompare(b.path));outputs.sort((a,b)=>a.path.localeCompare(b.path));
 const contentIndexBytes=await readFile(path.join(root,'content/index.json'));
 if(hash(contentIndexBytes)!==inputMap.get('content/index.json')?.sha256)throw Error('Authored content index changed during input capture');
 return {...identity(files),authoredClientSHA256:identity(client.files.filter(row=>!generated.has(row.path))).sha256,outputs,outputSHA256:hash(JSON.stringify(outputs)),contentIndex:JSON.parse(contentIndexBytes.toString('utf8'))};
}
export async function verifyPresentationProduct(root,product,expected){
 const current=await capturePresentationInputs(root);requireSameInputs(expected,current,'product build');
 if(expected.outputSHA256!==current.outputSHA256)throw Error('Art source-to-product mapping changed during build');
 const pack=JSON.parse(await readFile(path.join(product,'assets/packs/base.json'),'utf8'));
 for(const row of expected.outputs){
  if(row.path==='content/index.json'){
   const actual=JSON.parse(await readFile(path.join(product,row.path),'utf8')),original=structuredClone(expected.contentIndex);
   const a=(actual.packs??[]).filter(p=>p.id===pack.id),b=(original.packs??[]).filter(p=>p.id===pack.id);
   if(a.length!==1||b.length!==1||a[0].version!==pack.version)throw Error('Generated content-index identity mismatch');
   a[0].version=b[0].version;if(JSON.stringify(actual)!==JSON.stringify(original))throw Error('Authored content-index fields changed');
  }else{const actual=await fileDigest(path.join(product,row.path));if(actual.sha256!==row.sha256||actual.bytes!==row.bytes)throw Error(`Packaged presentation input changed: ${row.path}`)}
 }
 const manifest=JSON.parse(await readFile(path.join(product,'build-assets.json'),'utf8')),inputs=new Map(expected.files.filter(f=>!f.directory).map(f=>[f.path,f]));
 const copied=new Set(['index.html','art/index.json','assets/packs/base.json','build-assets.json',...expected.outputs.map(row=>row.path)]);
 const allowed=new Set(copied);
 for(const item of Object.values(manifest))for(const output of [item.file,...item.css??[],...item.assets??[]]){
  portablePath(output);if(copied.has(output))throw Error(`Vite/copied build destination collision: ${output}`);
  allowed.add(output);if(/\.(?:[cm]?js|css)$/.test(output))allowed.add(output+'.map');
 }
 for(const file of await fileInventory(product))if(!allowed.has(file.path))throw Error(`Unexpected packaged presentation file: ${file.path}`);
 const verified=new Set();
 for(const item of Object.values(manifest)){
  if(!item.file||/\.(?:[cm]?js|css)(?:\.map)?$/.test(item.file)||item.isEntry||item.isDynamicEntry)continue;
  portablePath(item.file);if(typeof item.src!=='string')throw Error(`Vite asset lacks source identity: ${item.file}`);
  const source=path.relative(root,path.resolve(root,'client',item.src)).split(path.sep).join('/'),original=inputs.get(source);
  if(!original)throw Error(`Vite asset source was not captured: ${item.src}`);
  const actual=await fileDigest(path.join(product,item.file));if(actual.sha256!==original.sha256||actual.bytes!==original.bytes)throw Error(`Vite asset differs from captured source: ${item.file}`);verified.add(item.file);
 }
 for(const item of Object.values(manifest))for(const file of item.assets??[])if(!verified.has(file))throw Error(`Unverified Vite asset dependency: ${file}`);
 return {sourceFiles:expected.files.length,sourceSHA256:expected.sha256,copiedFiles:expected.outputs.length,outputSHA256:expected.outputSHA256,viteAssets:verified.size,scope:'Client sources, nested source dependencies, public outputs and selected art/content copies are consistent. Top-level installed tools use pinned lockfiles; final reviewed art completeness is a separate receipt gate.'};
}

/** The native host reads a separate, unmodified copy of authored content. */
export async function verifyHostContent(stage,expected){
 const rows=expected.outputs.filter(row=>row.path.startsWith('content/'));
 const actualPaths=(await fileInventory(path.join(stage,'content'))).filter(row=>row.path.endsWith('.json')).map(row=>'content/'+row.path).sort();
 if(JSON.stringify(actualPaths)!==JSON.stringify(rows.map(row=>row.path).sort()))throw Error('Packaged host content path set changed');
 let count=0;for(const row of rows){
  const actual=await fileDigest(path.join(stage,row.path));
  if(actual.bytes!==row.bytes||actual.sha256!==row.sha256)throw Error(`Packaged host content changed: ${row.path}`);count++;
 }return count;
}
