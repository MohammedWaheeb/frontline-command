// Bounded, offline extraction from an earned save through the exact production
// WASM adapter. No Step, Submit, browser, host, edited state or native compiler.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const runtime=path.join(root,'work/runtime-034-integrated-source/runtime-builds/20260929T081745Z/runtime');
const earned=path.join(root,'work/multiplayer-current-loader-v1/3h1ai-01/round-1-native-audit/midpoint.save.json');
const sha=b=>createHash('sha256').update(b).digest('hex'),pins={};
async function pin(file,hash){const b=await readFile(file);assert.equal(sha(b),hash,file);pins[path.relative(root,file)]=hash;return b}
const receipt=JSON.parse(await readFile(path.join(root,'work/multiplayer-current-loader-v1/3h1ai-01/native-archive-receipt.json')));
const save=await pin(earned,receipt.archives.find(x=>x.file.endsWith('midpoint.save.json')).sha256);
const wasm=await pin(path.join(runtime,'frontline.wasm'),'d1d7b97deaa4c73f58ba8b8035858d524d24c64d5c52f4ce4e71bcd47dbdb7ae');
await pin(path.join(runtime,'wasm_exec.js'),'0c949f4996f9a89698e4b5c586de32249c3b69b7baadb64d220073cc04acba14');
const protocol=path.join(runtime,'frontline_pb.ts');await pin(protocol,'db86802c777fd6d2660a7956adce34c7b20a788dd72e6926365cdc46dc88199f');
const {build}=createRequire(path.join(root,'client/package.json'))('esbuild');
await build({stdin:{contents:`export {fromBinary} from '@bufbuild/protobuf';export {PlayerSnapshotSchema} from ${JSON.stringify(protocol)};`,resolveDir:path.join(root,'client')},outfile:path.join(here,'decode.mjs'),nodePaths:[path.join(root,'client/node_modules')],bundle:true,platform:'node',format:'esm',target:'es2022'});
const {fromBinary,PlayerSnapshotSchema}=await import('./decode.mjs');
await import(pathToFileURL(path.join(runtime,'wasm_exec.js')));const go=new globalThis.Go();go.env={GOMAXPROCS:'1'};
const ready=new Promise(resolve=>globalThis.__frontlineGoReady=resolve),instance=await WebAssembly.instantiate(wasm,go.importObject),running=go.run(instance.instance);await ready;
const call=(method,...args)=>{const r=globalThis.__frontlineGo[method](...args);assert(r.ok,r.error);return {value:r.json===undefined?undefined:JSON.parse(r.json),bytes:r.bytes}};
const stringify=v=>JSON.stringify(v,(_k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
let status='failed';const report={scope:'Actual owner2 view from earned3H1AI midpoint restored through exact integrated3d49 production WASM; no simulation advance or command. Not an original live capture at a rejected-order tick.',inputs:pins};
try{
 report.version=call('version').value;assert.equal(report.version.simulation,'0.3.4');
 report.info=call('load',new Uint8Array(save),'[2]').value;report.hashBefore=call('hash').value;
 assert.equal(report.hashBefore,'60645f1b19cdcdf99e9a56535e92d15fb1ac65153788008b80a4c9bb87e16372');
 const wire=call('view',2).bytes,view=fromBinary(PlayerSnapshotSchema,new Uint8Array(wire));
 assert.equal(view.player,2);assert.equal(Number(view.tick),21895);for(const actor of view.entities)assert(!actor.private||actor.owner===2);
 const station=view.stations.find(s=>s.id===10);assert(station);assert.equal(station.owner,3);assert(view.players.find(p=>p.id===3)?.defeated);
 report.station={id:station.id,owner:station.owner,position:station.position};report.wireSHA256=sha(wire);
 const catalog=call('content').value;report.hashAfter=call('hash').value;assert.equal(report.hashAfter,report.hashBefore);
 const files={'owner2-midpoint.json':Buffer.from(stringify(view)),'catalog.json':Buffer.from(stringify(catalog)),'owner2-midpoint.pb':Buffer.from(wire)};report.outputs={};
 for(const [name,body]of Object.entries(files)){await writeFile(path.join(here,'fixtures',name),body,{flag:'wx'});report.outputs[name]={bytes:body.length,sha256:sha(body)}}
 status='passed';
}catch(error){report.failure=String(error.stack??error)}
finally{call('dispose');call('exit');await running;report.goExited=go.exited;report.status=status;await writeFile(path.join(here,'fixtures/export-receipt.json'),stringify(report),{flag:'wx'});console.log(JSON.stringify(report,null,2));process.exit(status==='passed'?0:1)}
