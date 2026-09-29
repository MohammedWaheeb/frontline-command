// Executes the actual built frontline.wasm, not a test-only WASM module.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const base=path.resolve(process.argv[2]),runtime=path.join(base,'runtime'),fixtures=path.join(base,'fixtures/native/service'),native=path.join(base,'parity/native-adapter/service');
const sha=b=>createHash('sha256').update(b).digest('hex'),report={scope:'Actual produced Go WASM global API, six exact native approach saves, real Step/View/Save/Hash; no browser/UI qualification',cases:[]};
await import(pathToFileURL(path.join(runtime,'wasm_exec.js')).href);const go=new globalThis.Go();go.env={GOMAXPROCS:'1'};
const ready=new Promise(resolve=>{globalThis.__frontlineGoReady=resolve});
const instance=await WebAssembly.instantiate(await readFile(path.join(runtime,'frontline.wasm')),go.importObject);const running=go.run(instance.instance);
await ready;
const call=(method,...args)=>{const r=globalThis.__frontlineGo[method](...args);assert(r.ok,r.error);return {value:r.json===undefined?undefined:JSON.parse(r.json),bytes:r.bytes}};
try{
 report.version=call('version').value;assert.equal(report.version.simulation,'0.3.4');
 const files=(await readdir(fixtures)).filter(f=>f.endsWith('.approach.save.json')).sort();assert.equal(files.length,6);
 for(const file of files){
  const scene=file.replace('.approach.save.json',''),expected=JSON.parse(await readFile(path.join(native,scene+'.json'),'utf8'));
  let info=call('load',new Uint8Array(await readFile(path.join(fixtures,file))),'[1]').value;
  while(info.tick<expected.tick)info=call('step',Math.min(200,expected.tick-info.tick)).value;
  const actual={simulation:report.version.simulation,scene,tick:info.tick,hash:call('hash').value,wire_sha256:sha(call('view',1).bytes),save_sha256:sha(call('save').bytes)};
  assert.deepEqual(actual,expected);report.cases.push(actual);
 }
 report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1}
finally{
 call('dispose');call('exit');await running;
 assert.equal(go.exited,true);report.goExited=true;
 // Match the pinned wasm_exec_node.js process lifecycle: a finished Go program
 // ends its Node host. Keeping the host alive would let already-scheduled Go
 // runtime timers resume the exited VM. This is not a browser cleanup test.
 writeFileSync(path.join(base,'parity/production-wasm.json'),JSON.stringify(report,null,2)+'\n');
 console.log(report.status==='passed'?'Actual production WASM six-scene parity PASS':report.failure);
 process.exit(report.status==='passed'?0:1);
}
