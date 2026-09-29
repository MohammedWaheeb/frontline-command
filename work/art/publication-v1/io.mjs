import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,realpath,readdir,readFile,mkdir,open,rename} from 'node:fs/promises';
import path from 'node:path';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const safe=p=>typeof p==='string'&&p.length<1024&&!path.isAbsolute(p)&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..');
export const digest=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
export function descriptor(d){assert(d&&safe(d.path)&&digest(d.sha256)&&Number.isSafeInteger(d.bytes)&&d.bytes>=0,`Invalid descriptor ${d?.path}`);return d}
export async function contained(root,rel,{missing=false}={}){
 assert(safe(rel),`Unsafe path ${rel}`);const base=await realpath(root);let current=base;
 for(const [i,part] of rel.split('/').entries()){
  current=path.join(current,part);let s;try{s=await lstat(current)}catch(e){if(missing&&e.code==='ENOENT')return path.join(base,rel);throw e}
  assert(!s.isSymbolicLink(),`Symlink forbidden ${rel}`);if(i<rel.split('/').length-1)assert(s.isDirectory(),`Non-directory parent ${rel}`);
 }
 return current;
}
export async function hashFile(file){
 const before=await lstat(file);assert(before.isFile()&&!before.isSymbolicLink(),`Not regular ${file}`);
 const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(file)){bytes+=chunk.length;h.update(chunk)}
 const after=await lstat(file);assert.equal(bytes,before.size,`File changed ${file}`);assert.equal(after.size,before.size);assert.equal(after.ino,before.ino);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.ctimeMs,before.ctimeMs);
 return {bytes,sha256:h.digest('hex')};
}
export async function verify(root,d){descriptor(d);const p=await contained(root,d.path);assert.deepEqual(await hashFile(p),{bytes:d.bytes,sha256:d.sha256},`Identity changed ${d.path}`);return p}
export async function readJSON(root,d){const p=await verify(root,d);assert(d.bytes<=8*1024**2,'JSON exceeds8MiB');const b=await readFile(p);assert.equal(sha(b),d.sha256);return JSON.parse(b)}
export async function inventory(root){
 const rows=[];async function walk(dir,rel=''){
  const entries=await readdir(dir,{withFileTypes:true});entries.sort((a,b)=>a.name.localeCompare(b.name));
  for(const e of entries){const r=rel?`${rel}/${e.name}`:e.name;assert(safe(r));assert(!e.isSymbolicLink(),`Symlink forbidden ${r}`);const p=path.join(dir,e.name);
   if(e.isDirectory())await walk(p,r);else{assert(e.isFile(),`Special file ${r}`);rows.push({path:r,...await hashFile(p)});assert(rows.length<=262144,'Inventory file bound')}
  }
 }await walk(root);return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
export function unique(rows,key='path'){const s=new Set(),aliases=new Set();for(const r of rows){const p=r[key];assert(!s.has(p),`Duplicate ${key} ${p}`);const a=p.normalize('NFC').toLowerCase();assert(!aliases.has(a),`Case/Unicode collision ${p}`);s.add(p);aliases.add(a)}return s}
export async function verifyInventory(root,rows){unique(rows);for(const d of rows)descriptor(d);assert.deepEqual(await inventory(root),[...rows].sort((a,b)=>a.path.localeCompare(b.path)),`Inventory changed ${root}`)}
export async function absent(p){try{await lstat(p);return false}catch(e){if(e.code==='ENOENT')return true;throw e}}
export async function writeJSON(file,data,{exclusive=false}={}){
 await mkdir(path.dirname(file),{recursive:true});if(exclusive)assert(await absent(file),`Refuse overwrite ${file}`);
 const tmp=file+'.pending-'+process.pid;const h=await open(tmp,'wx');try{await h.writeFile(JSON.stringify(data,null,2)+'\n');await h.sync()}finally{await h.close()}
 await rename(tmp,file);const dir=await open(path.dirname(file),'r');try{await dir.sync()}finally{await dir.close()}
}
export async function pin(root,p){return {path:p,...await hashFile(await contained(root,p))}}
