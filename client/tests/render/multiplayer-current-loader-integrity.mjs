// Read-only guards used before browser launch and after all processes close.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyPrepared(directory,{product=true}={}){
 const bytes=await readFile(path.join(directory,'build.json')),build=JSON.parse(bytes);
 assert.equal(build.status,'prepared-browser-unrun');
 assert.equal(build.version.simulation,'0.3.4');
 let verified=0;
 for(const [file,digest]of Object.entries(build.inputPins)){assert.equal(sha256(await readFile(file)),digest,'Frozen input changed: '+file);verified++}
 for(const [file,digest]of Object.entries(build.preparedPins)){assert.equal(sha256(await readFile(path.join(directory,file))),digest,'Prepared input changed: '+file);verified++}
 if(product)for(const file of build.packFiles){const bytes=await readFile(path.join(build.product,file.path.slice(1)));assert.equal(bytes.length,file.bytes,file.path);assert.equal(sha256(bytes),file.sha256,'Frozen package changed: '+file.path);verified++}
 return {build,receiptSHA256:sha256(bytes),verified,productChecked:product};
}
