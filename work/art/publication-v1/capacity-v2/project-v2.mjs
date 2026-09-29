// Corrected lower bound from captured descriptors only; no source asset I/O.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const input=new URL('projected-descriptors-NOT-VERIFIED.json.gz',import.meta.url);
const bytes=await readFile(input),baseline=JSON.parse(gunzipSync(bytes));
const dependencies=baseline.files.map(x=>({...x,path:'assets/'+x.path}));
// All replacements are beneath these two subtrees. Omit all of them, including
// unchanged legacy rows, to avoid assuming old sprite pages survive selection.
const files=baseline.files.filter(x=>!x.path.startsWith('build/sprites/')&&!x.path.startsWith('build/ui/'));
const encoded=Buffer.from(JSON.stringify({dependencies,files},null,2)+'\n');
assert(encoded.length>8*1024**2);
const result={at:new Date().toISOString(),scope:'Guaranteed lower bound using captured paths/sizes and zero SHA placeholders only. Omits all potentially replaced sprite/UI output rows plus every additional handoff/source/code/runtime descriptor. No art body reads or hashes.',inputSHA256:createHash('sha256').update(bytes).digest('hex'),inputFiles:baseline.files.length,guaranteedPreservedFiles:files.length,guaranteedPreparedJSONBytes:encoded.length,oldJSONCap:8*1024**2,exceedsOldCap:true,correction:'projection.json used every old output row; that is an unchanged-output scenario, not a guaranteed post-replacement lower bound. The original artifact is preserved.'};
await writeFile(new URL('projection-v2.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
