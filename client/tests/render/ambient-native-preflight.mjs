// Run the exact frozen browser course's Go requests through the existing native
// Session bridge. Rendering is explicitly absent; no pixels/GPU claims here.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).reduce((r,v,i,a)=>i%2?r:[...r,[v,a[i+1]]],[]));assert(args['--product']&&args['--out']);
const product=path.resolve(args['--product']),frozen=path.dirname(product),source=path.join(frozen,'source/client'),out=path.resolve(args['--out']),bridge=path.join(root,'work/multiplayer-combat/expansion-build-v2');await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),receipt=JSON.parse(await readFile(path.join(bridge,'receipt.json'),'utf8')),productReceipt=JSON.parse(await readFile(path.join(frozen,'build.json'),'utf8'));
assert.equal(sha(await readFile(path.join(bridge,'bridge'))),receipt.binarySHA256);assert.equal(receipt.sourceLockSHA256,productReceipt.runtime.source_lock_sha256);
const fixture=path.join(source,'tests/render/ambient-integration-fixture.ts'),fixtureBytes=await readFile(fixture);assert.equal(sha(fixtureBytes),productReceipt.sourceFiles['tests/render/ambient-integration-fixture.ts']);
const child=spawn(path.join(bridge,'bridge'),[],{cwd:root,env:{...process.env,GOMAXPROCS:'1'},stdio:['pipe','pipe','pipe']}),pending=new Map();let next=1,stderr='';child.stderr.on('data',bytes=>stderr+=bytes);
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>{for(const p of pending.values())p.reject(Error('Native bridge exited'));pending.clear();resolve({code,signal})}));
createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);assert(p);pending.delete(r.id);if(r.error)p.reject(Error(r.error));else p.resolve(r.value)});
const call=(op,args={})=>new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,op,...args})+'\n')});
globalThis.ambientNativeBridge={call,close:()=>child.stdin.end()};globalThis.window=globalThis;globalThis.document={getElementById:()=>({}),querySelectorAll:()=>[],body:{dataset:{}}};globalThis.requestAnimationFrame=callback=>queueMicrotask(()=>callback(0));
const protocol=JSON.stringify(path.join(source,'src/protocol/frontline_pb.ts'));
const offline=`import {fromJson} from '@bufbuild/protobuf';import {PlayerSnapshotSchema} from ${protocol};
export class OfflineTransport {
 current;ready=Promise.resolve();listeners=new Set();sequence=0;player=1;
 subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 emit(event){for(const fn of this.listeners)fn(event)}
 async refresh(){this.current=fromJson(PlayerSnapshotSchema,await globalThis.ambientNativeBridge.call('view',{player:this.player}));this.emit({type:'snapshot',snapshot:this.current})}
 async create(config){this.emit({type:'presentation-reset'});const value=await globalThis.ambientNativeBridge.call('create',{config});this.sequence=0;this.player=1;await this.refresh();return value}
 async setPerspective(player){this.player=player;this.emit({type:'presentation-reset'});await this.refresh()}
 content(){return globalThis.ambientNativeBridge.call('catalog')}
 async step(n){const value=await globalThis.ambientNativeBridge.call('step',{n});await this.refresh();return value}
 previewOrders(orders){return globalThis.ambientNativeBridge.call('preview',{player:this.player,batch:{orders}})}
 async sendOrders(orders){const sequence=++this.sequence;await globalThis.ambientNativeBridge.call('submit',{player:this.player,batch:{sequence,orders}});return sequence}
 hash(){return globalThis.ambientNativeBridge.call('hash')}
 pause(){return Promise.resolve()}
 async save(){const s=await globalThis.ambientNativeBridge.call('save');return {...s,data:new Uint8Array(Buffer.from(s.data,'base64')),local_players:[1,2]}}
 dispose(){this.listeners.clear();globalThis.ambientNativeBridge.close()}
}`;
const renderer=`import {AmbientTimeline} from ${JSON.stringify(path.join(source,'src/app/ambient-presentation.ts'))};
export class BattlefieldRenderer {
 static async create(_host,options){return new BattlefieldRenderer(options)}
 constructor(options){this.options=options;this.combat={ambient:new AmbientTimeline(options.map),sprites:new Map()};this.tacticalOverlay={diagnostics:{rendered:false}};this.memoryLabels=[];this.app={renderer:{render(){}}};this.placementGhost={root:{visible:false,children:Array(5)}}}
 resetFeedback(){this.combat.ambient.reset()}
 setSnapshot(snapshot){this.combat.ambient.sync(snapshot,this.options.catalog)}
 get combatDiagnostics(){return {nativePreflight:true,rendered:false,ambientCues:this.combat.ambient.values.length}}
 center(){} setSelection(){} setRangeMode(){} updateSettings(){} dispose(){}
 setPlacement(value){this.placementGhost.root.visible=!!value}
 async whenAssetsReady(){} async whenEffectsReleased(){}
}`;
const plugins=[{name:'explicit-native-transport-no-renderer',setup(build){
 build.onResolve({filter:/runtime\/offline$/},()=>({path:'native-transport',namespace:'native-test'}));
 build.onResolve({filter:/render\/battlefield$/},()=>({path:'absent-renderer',namespace:'native-test'}));
 build.onResolve({filter:/render\/art$/},()=>({path:'absent-art',namespace:'native-test'}));
 build.onLoad({filter:/.*/,namespace:'native-test'},args=>({contents:args.path==='native-transport'?offline:args.path==='absent-renderer'?renderer:'export class ArtLibrary {statistics={nativePreflight:true};async release(){}}',loader:'js',resolveDir:path.join(source,'tests/render')}));
}}];
const report={started:new Date().toISOString(),scope:'Native request-path and authorized ambient-model preflight of the exact browser fixture. Actual frozen Go Session; renderer and art deliberately absent. Not browser, visual, performance or release acceptance.',receipt,productReceipt,fixtureSHA256:sha(fixtureBytes),cases:{}};
try{
 await build({entryPoints:[fixture],outfile:path.join(out,'fixture.mjs'),bundle:true,format:'esm',platform:'node',target:'node24',plugins,nodePaths:[path.join(root,'client/node_modules')]});
 await import(pathToFileURL(path.join(out,'fixture.mjs')).href);
 for(const [method,effect] of [['movement','unit.dust_trail'],['rotor','unit.rotor_wash'],['construction','building.construction_dust'],['sell','building.sell_dust'],['damagedUnit','unit.smoke_damaged'],['critical','unit.fire_critical'],['wreck','unit.wreck_smoke'],['damagedBuilding','building.fire_damaged'],['critical','building.smoke_critical'],['depleted','environment.depletion_dust'],['shipment','environment.shipment_arrival'],['capture','environment.supply_station_capture']]){
  const value=await globalThis.ambientQA[method]();report.cases[effect]=value;assert(value.ambient.some(cue=>cue.effect==='fx.'+effect),effect);console.log(effect,value.tick);
 }
 report.clarity=await globalThis.ambientQA.clarity();assert(report.clarity.memory.some(m=>m.id===report.clarity.source));
 await writeFile(path.join(out,'clarity-before-defeat.save.json'),JSON.stringify(await globalThis.ambientQA.exportSave()));
 report.placement={};for(const valid of [true,false]){const result=await globalThis.ambientQA.placement(valid);report.placement[String(valid)]=result;assert.equal(result.preview.results[0].code,'indeterminate');assert.equal(result.preview.results[0].accepted,true)}
 report.occupiedRejection=await globalThis.ambientQA.rejectOccupiedPlacement();assert.equal(report.occupiedRejection.result.code,'occupied');
 report.defeat=await globalThis.ambientQA.defeat();assert(report.defeat.defeat.some(d=>d.own));
 await writeFile(path.join(out,'clarity.save.json'),JSON.stringify(await globalThis.ambientQA.exportSave()));
 report.recovery=await globalThis.ambientQA.recovery();assert(!report.recovery.defeat.some(d=>d.own));report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);report.last=globalThis.ambientQA?.report();process.exitCode=1}
finally{
 try{report.finalHash=await call('hash');const save=await call('save');await writeFile(path.join(out,'final.save.json'),Buffer.from(save.data,'base64'));await writeFile(path.join(out,'earned.replay.gz'),Buffer.from(await call('replay'),'base64'))}catch(error){report.captureError=String(error)}
 child.stdin.end();report.exit=await exited;report.finished=new Date().toISOString();await writeFile(path.join(out,'stderr.log'),stderr);await writeFile(path.join(out,'driver.mjs'),await readFile(fileURLToPath(import.meta.url)));await writeFile(path.join(out,'report.json'),JSON.stringify(report,(_,value)=>typeof value==='bigint'?value.toString():value,2));console.log(report.status,report.failure??'');
}
