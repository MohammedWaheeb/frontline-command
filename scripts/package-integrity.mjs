import {createReadStream} from 'node:fs';
import {lstat,readdir,readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

export function nativeBuildEnvironment(platform=process.platform,arch=process.arch,base=process.env){
 const GOOS={darwin:'darwin',linux:'linux',win32:'windows'}[platform],GOARCH={x64:'amd64',arm64:'arm64'}[arch];
 if(!GOOS||!GOARCH)throw Error(`Native package target is unsupported: ${platform}/${arch}`);
 return {...base,GOOS,GOARCH,CGO_ENABLED:'0',GOAMD64:'v1',GOARM64:'v8.0'};
}
export function portablePath(name){
 if(typeof name!=='string'||!name||name.includes('\\')||name.includes('%')||/[\x00-\x1f<>:"|?*]/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p.startsWith('.')||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error(`Unsafe or nonportable package path: ${name}`);
 return name;
}
export async function fileDigest(file){const hash=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(file)){hash.update(chunk);bytes+=chunk.length}return {bytes,sha256:hash.digest('hex')}}
/** Official archives keep LICENSE in GOROOT. Homebrew keeps it one directory
 * above its libexec GOROOT. Never silently omit it or substitute another license. */
export async function resolveGoLicense(goRoot){
 const candidates=[path.join(goRoot,'LICENSE')];
 if(path.basename(goRoot)==='libexec')candidates.push(path.join(path.dirname(goRoot),'LICENSE'));
 for(const file of candidates){
  let text;try{text=await readFile(file,'utf8')}catch(error){if(error.code==='ENOENT')continue;throw error}
  if(!text.includes('The Go Authors')||!text.includes('Redistribution and use in source and binary forms')||!text.includes('THIS SOFTWARE IS PROVIDED'))throw Error(`Unrecognized Go runtime license: ${file}`);
  return file;
 }
 throw Error(`Go runtime LICENSE is missing from the toolchain: ${goRoot}`);
}
export async function fileInventory(root){
 const files=[],seen=new Set();
 async function walk(dir,prefix=''){for(const name of (await readdir(dir)).sort()){
  const rel=portablePath(prefix+name),key=rel.toLowerCase();if(seen.has(key))throw Error(`Case-colliding package path: ${rel}`);seen.add(key);
  const file=path.join(dir,name),entry=await lstat(file);if(entry.isSymbolicLink())throw Error(`Symlink is not a portable package file: ${rel}`);
  if(entry.isDirectory())await walk(file,rel+'/');else if(entry.isFile())files.push({path:rel,bytes:entry.size});else throw Error(`Unsupported package entry: ${rel}`);
 }}await walk(root);return files;
}
export async function verifyProduct(root,{previous}={}){
 const inventory=await fileInventory(root),actual=new Map(inventory.map(f=>['/'+f.path,f])),packBytes=await readFile(path.join(root,'assets/packs/base.json')),pack=JSON.parse(packBytes);
 if(!/^[\w.-]{1,100}$/.test(pack.id)||!/^[\w.-]{1,100}$/.test(pack.version)||!Array.isArray(pack.files)||!pack.files.length||pack.files.length>16000)throw Error('Invalid offline pack identity/count');
 let total=0;const listed=new Set();
 for(const item of pack.files){
  if(typeof item.path!=='string'||!item.path.startsWith('/')||item.path.startsWith('//'))throw Error('Offline path must be root-relative');portablePath(item.path.slice(1));
  if(listed.has(item.path)||!Number.isSafeInteger(item.bytes)||item.bytes<0||item.bytes>128*1024**2||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error(`Invalid offline descriptor: ${item.path}`);listed.add(item.path);
  if(!actual.has(item.path))throw Error(`Missing offline dependency: ${item.path}`);
  const digest=await fileDigest(path.join(root,item.path.slice(1)));if(digest.bytes!==item.bytes||digest.sha256!==item.sha256)throw Error(`Offline dependency changed: ${item.path}`);total+=item.bytes;
 }
 if(total>2*1024**3)throw Error('Offline pack exceeds the 2 GiB installer limit');
 const required=['/index.html','/runtime/frontline.wasm','/runtime/worker.js','/runtime/wasm_exec.js','/runtime/version.json','/service-worker.js','/content/index.json','/art/index.json'];
 for(const file of required)if(!listed.has(file))throw Error(`Required offline dependency is not cached: ${file}`);
 for(const file of actual.keys())if(file!=='/assets/packs/base.json'&&!file.endsWith('.map')&&!listed.has(file))throw Error(`Unmanifested product file: ${file}`);
 const html=await readFile(path.join(root,'index.html'),'utf8');for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  const ref=match[1];if(ref.startsWith('data:')||ref.startsWith('#'))continue;if(!ref.startsWith('/')||ref.startsWith('//')||!listed.has(ref.split('#')[0]))throw Error(`HTML dependency is external or not cached: ${ref}`);
 }
 const version=JSON.parse(await readFile(path.join(root,'runtime/version.json'),'utf8'));if(!version.simulation||!version.content_hash||!version.protocol)throw Error('Runtime version metadata is incomplete');
 const content=JSON.parse(await readFile(path.join(root,'content/index.json'),'utf8')),base=content.packs?.find(p=>p.id===pack.id);if(!base||base.version!==pack.version||base.manifest_url!=='/assets/packs/base.json')throw Error('Offline manifest and content index identity differ');
 if(previous){const old=JSON.parse(await readFile(path.join(previous,'assets/packs/base.json'),'utf8'));if(old.id===pack.id&&old.version===pack.version&&JSON.stringify(old.files)!==JSON.stringify(pack.files))throw Error('Changed content reuses a previously published offline pack identity')}
 return {files:pack.files.length,bytes:total,id:pack.id,version:pack.version,packSHA256:createHash('sha256').update(packBytes).digest('hex'),runtime:version,inventoryFiles:inventory.length,scope:'Read-only static integrity; no browser boot, MIME response, art completeness or release certification'};
}
export async function verifyNativeExecutable(file,platform=process.platform,arch=process.arch){
 const handle=await open(file);const b=Buffer.alloc(4096);let bytesRead;try{({bytesRead}=await handle.read(b,0,b.length,0))}finally{await handle.close()}
 const expected=nativeBuildEnvironment(platform,arch,{});let machine;
 if(platform==='darwin'){if(bytesRead<8||b.readUInt32LE(0)!==0xfeedfacf)throw Error('Expected a thin 64-bit Mach-O executable');machine=b.readUInt32LE(4);if(machine!==({x64:0x1000007,arm64:0x100000c}[arch]))throw Error('Mach-O architecture mismatch')}
 else if(platform==='linux'){if(bytesRead<20||b.subarray(0,4).toString('hex')!=='7f454c46'||b[4]!==2||b[5]!==1)throw Error('Expected a little-endian ELF64 executable');machine=b.readUInt16LE(18);if(machine!==({x64:62,arm64:183}[arch]))throw Error('ELF architecture mismatch')}
 else{if(bytesRead<64||b.toString('ascii',0,2)!=='MZ')throw Error('Expected Windows PE executable');const offset=b.readUInt32LE(60);if(offset+6>bytesRead||b.toString('ascii',offset,offset+4)!=='PE\0\0')throw Error('Invalid PE header');machine=b.readUInt16LE(offset+4);if(machine!==({x64:0x8664,arm64:0xaa64}[arch]))throw Error('PE architecture mismatch')}
 return {platform,arch,GOOS:expected.GOOS,GOARCH:expected.GOARCH,machine};
}

export async function buildSourceIdentity(root){
 const files=[];for(const directory of ['cmd','pkg','internal','protocol','content'])for(const entry of await fileInventory(path.join(root,directory))){if(!entry.path.endsWith('_test.go')&&/\.(go|proto|json)$/.test(entry.path))files.push({path:directory+'/'+entry.path,...await fileDigest(path.join(root,directory,entry.path))})}
 for(const file of ['go.mod','go.sum'])files.push({path:file,...await fileDigest(path.join(root,file))});
 return {files:files.length,sha256:createHash('sha256').update(JSON.stringify(files.sort((a,b)=>a.path.localeCompare(b.path)))).digest('hex')};
}
