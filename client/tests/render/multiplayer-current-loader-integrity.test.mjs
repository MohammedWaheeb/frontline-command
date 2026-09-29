import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sha256,verifyPrepared} from './multiplayer-current-loader-integrity.mjs';
test('preflight rejects changed compiled input, exact package payload and private helper',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'frontline-course-integrity-'));
 try{
  const product=path.join(dir,'product'),source=path.join(dir,'native');await mkdir(product);
  await writeFile(source,'runtime');await writeFile(path.join(dir,'helper'),'helper');await writeFile(path.join(product,'page'),'pixels-A');
  const receipt={status:'prepared-browser-unrun',version:{simulation:'0.3.4'},product,inputPins:{[source]:sha256('runtime')},preparedPins:{helper:sha256('helper')},packFiles:[{path:'/page',bytes:8,sha256:sha256('pixels-A')}]};
  await writeFile(path.join(dir,'build.json'),JSON.stringify(receipt));assert.equal((await verifyPrepared(dir)).verified,3);
  for(const [file,original]of [[source,'runtime'],[path.join(dir,'helper'),'helper'],[path.join(product,'page'),'pixels-A']]){await writeFile(file,'changed!');await assert.rejects(verifyPrepared(dir));await writeFile(file,original)}
 }finally{await rm(dir,{recursive:true,force:true})}
});
