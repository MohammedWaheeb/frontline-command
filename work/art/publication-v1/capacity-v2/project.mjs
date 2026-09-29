// Metadata only: never reads/hashes source art bodies or copies an asset tree.
import assert from 'node:assert/strict';
import {readdir,lstat,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),rows=[];
async function walk(dir,rel){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name),r=rel+'/'+e.name;assert(!e.isSymbolicLink(),'Unexpected symlink in metadata projection');if(e.isDirectory())await walk(p,r);else{const s=await lstat(p);assert(s.isFile());rows.push({path:r,bytes:s.size,sha256:'0'.repeat(64)});assert(rows.length<=262144)}}}
for(const name of ['build','ui','fonts','audio','manifest']){const p=path.join(root,'assets',name);try{await walk(p,name)}catch(e){if(e.code!=='ENOENT')throw e}}
rows.sort((a,b)=>a.path.localeCompare(b.path));const encode=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const baseline=encode({files:rows}),dependencies=rows.map(x=>({...x,path:'assets/'+x.path}));
// Existing prepared.json necessarily has both input dependencies and final files.
// This deliberately omits every new handoff/source/code/runtime row and all keys,
// so it is a lower bound, not a claimed assembled publication receipt.
const minimalPrepared=encode({dependencies,files:rows});
const result={at:new Date().toISOString(),scope:'Descriptor-only metadata projection. Zero SHA placeholders have equal encoded width to real hashes and are NOT verification descriptors. No art bytes read or hashed, no copy, no full assembly.',files:rows.length,buildFiles:rows.filter(x=>x.path.startsWith('build/')).length,baselineJSONBytes:baseline.length,minimalPreparedJSONBytes:minimalPrepared.length,oldJSONCap:8*1024**2,baselineExceedsOldCap:baseline.length>8*1024**2,minimalPreparedExceedsOldCap:minimalPrepared.length>8*1024**2,largestRelativePath:Math.max(...rows.map(x=>x.path.length)),lowerBoundOnly:true};
await writeFile(path.join(here,'projected-descriptors-NOT-VERIFIED.json.gz'),gzipSync(baseline));await writeFile(path.join(here,'projection.json'),encode(result));console.log(JSON.stringify(result,null,2));
