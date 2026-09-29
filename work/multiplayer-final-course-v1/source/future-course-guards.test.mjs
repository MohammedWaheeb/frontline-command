import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {courseBudgets,createInputGuard} from './future-course-guards.mjs';
import {verifyPrepared,sha256} from './multiplayer-current-loader-integrity.mjs';
test('two-round overall budget does not silently enlarge each round',()=>{
 assert.deepEqual(courseBudgets({long:true}),{overallMilliseconds:130*60000,roundMilliseconds:60*60000});
 assert.deepEqual(courseBudgets({overallMinutes:'130'}),{overallMilliseconds:130*60000,roundMilliseconds:60*60000});
 assert.deepEqual(courseBudgets({}),{overallMilliseconds:60*60000,roundMilliseconds:60*60000});
 for(const value of ['0','-1','NaN','Infinity','9007199254740991'])assert.throws(()=>courseBudgets({roundMinutes:value}));
});
test('real file guards reject asset, source and receipt drift between round boundaries',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-future-guard-'));
 try{
  const file=path.join(dir,'source.txt'),art=path.join(dir,'art.bin'),body=Buffer.from('original');await writeFile(file,body);await writeFile(art,body);
  const build={status:'prepared-browser-unrun',version:{simulation:'0.3.4'},product:dir,inputPins:{[file]:sha256(body)},preparedPins:{},packFiles:[{path:'/art.bin',bytes:body.length,sha256:sha256(body)}]};
  const receipt=JSON.stringify(build),buildFile=path.join(dir,'build.json');await writeFile(buildFile,receipt);
  const guard=createInputGuard({verify:()=>verifyPrepared(dir),expectedSHA256:sha256(receipt)});assert.equal((await guard('before-round-1')).status,'passed');
  await writeFile(art,'different');await assert.rejects(guard('between-matches'));await writeFile(art,body);
  await writeFile(file,'different');await assert.rejects(guard('before-round-2'));await writeFile(file,body);
  await writeFile(buildFile,receipt+'\n');await assert.rejects(guard('final-menu'),/receipt changed/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
