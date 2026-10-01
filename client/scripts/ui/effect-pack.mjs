import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {EFFECT_LIMITS,decodeEffectIndex,decodeEffectMetadata,effectDescriptor,inspectEffectPNG,effectPath} from '../../src/content/effect-assets.mjs';
const servedPacks=new Map();
async function stamp(assets){try{const files=await Promise.all(['build/fx/index.json','manifest/asset-manifest.json'].map(rel=>stat(path.join(assets,rel))));return files.map(file=>`${file.dev}:${file.ino}:${file.size}:${file.mtimeMs}:${file.ctimeMs}`).join('|')}catch(error){if(error.code==='ENOENT')return undefined;throw error}}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Checks an exact referenced file, including realpath containment against symlinks. */
async function file(root,rel,descriptor,limit){
 if(!effectPath(rel))throw Error('Unsafe effect path.');
 const rootPath=await realpath(root),base=await realpath(path.join(root,'fx')),requested=path.join(root,rel),physical=await realpath(requested);
 if(!base.startsWith(rootPath+path.sep))throw Error('Effect directory escapes its build root.');
 if(physical!==base&&!physical.startsWith(base+path.sep))throw Error('Effect file escapes its root.');
 const info=await stat(physical);if(!info.isFile()||info.size<1||info.size>limit||descriptor&&info.size!==descriptor.bytes)throw Error('Effect file size mismatch.');
 const bytes=await readFile(physical);if(bytes.length!==info.size||descriptor&&digest(bytes)!==descriptor.sha256)throw Error('Effect file integrity mismatch.');return bytes;
}
function pixels(bytes,page){
 const png=inspectEffectPNG(bytes);if(png.width!==page.width||png.height!==page.height)throw Error('Effect PNG dimensions mismatch.');
 const stride=png.width*png.channels+1,expected=stride*png.height,raw=inflateSync(Buffer.concat(png.compressed),{maxOutputLength:expected+1});
 if(raw.length!==expected)throw Error('Effect PNG pixel byte count mismatch.');for(let y=0;y<png.height;y++)if(raw[y*stride]>4)throw Error('Effect PNG filter is invalid.');
}
/** Optional whole-pack validation. No index means no FX; a present partial pack throws. */
export async function inspectEffectPack(buildRoot,{descriptor,knownIDs}={}){
 const indexRel='fx/index.json';let exists;try{exists=await stat(path.join(buildRoot,indexRel))}catch(error){if(error.code==='ENOENT'&&!descriptor)return undefined;throw error}
 if(!exists.isFile())throw Error('Effect index is not a file.');
 if(descriptor)descriptor=effectDescriptor(descriptor,'index');
 const bytes=await file(buildRoot,indexRel,descriptor,EFFECT_LIMITS.indexBytes),index=decodeEffectIndex(bytes),files=[indexRel],descriptors=new Map([[indexRel,{url:indexRel,sha256:digest(bytes),bytes:bytes.length}]]);
 for(const [id,metadataDescriptor] of Object.entries(index.effects)){
  if(knownIDs&&!knownIDs.has(id))throw Error(`Effect is absent from the authored manifest: ${id}`);
  const metadata=decodeEffectMetadata(await file(buildRoot,metadataDescriptor.url,metadataDescriptor,EFFECT_LIMITS.metadataBytes),id),base=metadataDescriptor.url.slice(0,metadataDescriptor.url.lastIndexOf('/')+1);files.push(metadataDescriptor.url);descriptors.set(metadataDescriptor.url,metadataDescriptor);
  for(const page of metadata.pages){const rel=base+page.file,data=await file(buildRoot,rel,page,EFFECT_LIMITS.pageBytes);pixels(data,page);files.push(rel);descriptors.set(rel,{url:rel,sha256:page.sha256,bytes:page.bytes})}
 }
 return {descriptor:{url:indexRel,sha256:digest(bytes),bytes:bytes.length},index,files:[...new Set(files)],descriptors};
}
export async function authoredEffectPack(assets){
 const build=path.join(assets,'build');let present;try{present=await stat(path.join(build,'fx/index.json'))}catch(error){if(error.code==='ENOENT')return undefined;throw error}
 if(!present.isFile())throw Error('Effect index is not a file.');
 const manifest=JSON.parse(await readFile(path.join(assets,'manifest/asset-manifest.json'),'utf8'));
 if(!Array.isArray(manifest.entries))throw Error('Asset manifest unavailable for effects.');
 const signature=await stamp(assets),pack=await inspectEffectPack(build,{knownIDs:new Set(manifest.entries.filter(entry=>entry.category==='effect').map(entry=>entry.id))});
 if(signature===await stamp(assets)){servedPacks.set(assets,{signature,pack});while(servedPacks.size>8)servedPacks.delete(servedPacks.keys().next().value)}return pack;
}
export async function readAuthoredEffectFile(assets,rel){
 const signature=await stamp(assets),cached=servedPacks.get(assets),pack=signature&&cached?.signature===signature?cached.pack:await authoredEffectPack(assets);if(!pack?.files.includes(rel))return undefined;
 // The caller gets the checked bytes, not a stream that could follow a swapped path.
 const descriptor=pack.descriptors.get(rel);
 // Recheck the exact requested bytes after dependency validation; a concurrent
 // authoring change cannot silently replace this response with unverified data.
 const bytes=await file(path.join(assets,'build'),rel,descriptor,rel.endsWith('.png')?EFFECT_LIMITS.pageBytes:EFFECT_LIMITS.metadataBytes);
 return bytes;
}
