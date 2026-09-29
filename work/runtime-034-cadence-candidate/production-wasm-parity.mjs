// Derived from the accepted integrated artifact course. Executes produced WASM.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const base=path.resolve(process.argv[2]),runtime=path.join(base,'runtime'),fixtures=path.join(base,'fixtures/service'),native=path.join(base,'parity/native/service');
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={scope:'Actual built production WASM API against native Session: six retained service saves and the earned688-actor checkpoint at600/601/620; no browser/host-network qualification',cases:[]};
await import(pathToFileURL(path.join(runtime,'wasm_exec.js')).href);const go=new globalThis.Go();go.env={GOMAXPROCS:'1'};
const ready=new Promise(resolve=>{globalThis.__frontlineGoReady=resolve});
const instance=await WebAssembly.instantiate(await readFile(path.join(runtime,'frontline.wasm')),go.importObject);const running=go.run(instance.instance);await ready;
const call=(method,...args)=>{const r=globalThis.__frontlineGo[method](...args);assert(r.ok,r.error);return {value:r.json===undefined?undefined:JSON.parse(r.json),bytes:r.bytes}};
try {
 report.version=call('version').value;assert.equal(report.version.simulation,'0.3.4');assert.equal(report.version.tick_rate,20);
 const files=(await readdir(fixtures)).filter(f=>f.endsWith('.approach.save.json')).sort();assert.equal(files.length,6);
 for(const file of files){
  const scene=file.replace('.approach.save.json',''),expected=JSON.parse(await readFile(path.join(native,scene+'.json'),'utf8'));
  let info=call('load',new Uint8Array(await readFile(path.join(fixtures,file))),'[1]').value;
  while(info.tick<expected.tick)info=call('step',Math.min(200,expected.tick-info.tick)).value;
  const actual={simulation:report.version.simulation,scene,tick:info.tick,hash:call('hash').value,wire_sha256:sha(call('view',1).bytes),save_sha256:sha(call('save').bytes)};
  assert.deepEqual(actual,expected);report.cases.push(actual);
 }
 const checkpointDir=path.join(base,'parity/native/checkpoint'),expected=JSON.parse(await readFile(path.join(checkpointDir,'checkpoint.json'),'utf8'));
 let info=call('load',new Uint8Array(await readFile(path.join(base,'fixtures/checkpoint.save.json'))),'[1,2,3,4]').value;
 const denied=globalThis.__frontlineGo.view(99);assert.equal(denied.ok,false);assert.equal(JSON.parse(denied.error).code,'unauthorized_view');report.unauthorized_view_denied=true;
 report.checkpoint=[];
 for(const row of expected.records){
  if(info.tick<row.tick)info=call('step',row.tick-info.tick).value;
  const views={};
  for(const player of [1,2,3,4]){
   const wire=call('view',player).bytes;assert.deepEqual(Buffer.from(wire),await readFile(path.join(checkpointDir,`${row.tick}-p${player}.pb`)));views[player]=sha(wire);
  }
  const save=call('save').bytes;assert.deepEqual(Buffer.from(save),await readFile(path.join(checkpointDir,`${row.tick}.save.json`)));
  const actual={tick:info.tick,info,hash:call('hash').value,save_sha256:sha(save),views};assert.deepEqual(actual,row);report.checkpoint.push(actual);
 }
 report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1}
finally{
 call('dispose');call('exit');await running;assert.equal(go.exited,true);report.goExited=true;
 writeFileSync(path.join(base,'parity/production-wasm.json'),JSON.stringify(report,null,2)+'\n');
 console.log(report.status==='passed'?'Actual production WASM6service+3checkpoint boundary parity PASS':report.failure);
 process.exit(report.status==='passed'?0:1);
}
