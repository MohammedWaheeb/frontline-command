import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {aircraftServiceCourse} from './aircraft-service-course.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),bridge=path.join(root,'work/multiplayer-combat/expansion-build-v2');
const out=path.join(root,'work/evidence/aircraft-service-status',`native-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),receipt=JSON.parse(await readFile(path.join(bridge,'receipt.json')));
assert.equal(receipt.sourceLockSHA256,'c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122');assert.equal(sha(await readFile(path.join(bridge,'bridge'))),receipt.binarySHA256);
const lock=await readFile(path.join(root,'work/navigation-lookup-candidate/source-lock.json'));assert.equal(sha(lock),receipt.sourceLockSHA256);
for(const [name,digest]of Object.entries(JSON.parse(lock).files))assert.equal(sha(await readFile(path.join(root,'work/navigation-lookup-candidate/source',name))),digest,name);
const missionBytes=await readFile(path.join(root,'content/missions/us-04-broken-umbrella.json')),mission=JSON.parse(missionBytes),mapBytes=await readFile(path.join(root,'content/maps',mission.map_id+'.json')),map=JSON.parse(mapBytes);
for(const name of ['aircraft-service-course.mjs','aircraft-service-native.mjs'])await writeFile(path.join(out,name),await readFile(new URL(name,import.meta.url)));
await writeFile(path.join(out,'mission.json'),missionBytes);await writeFile(path.join(out,'map.json'),mapBytes);
const report={started:new Date().toISOString(),scope:'Single-CPU frozen native Go Session preflight. Untouched authored US04 and ordinary commands; no renderer, state injection, free spawns or outcome claim.',receipt,missionSHA256:sha(missionBytes),mapSHA256:sha(mapBytes),sourceSHA256:sha(await readFile(new URL('aircraft-service-course.mjs',import.meta.url))),stages:[],cases:{},commands:[]};
const child=spawn(path.join(bridge,'bridge'),[],{cwd:root,env:{...process.env,GOMAXPROCS:'1'},stdio:['pipe','pipe','pipe']}),pending=new Map();let id=0,stderr='';
child.stderr.on('data',b=>stderr+=b);const exited=new Promise(resolve=>child.once('exit',(code,signal)=>{for(const item of pending.values())item.reject(Error('Native bridge closed'));pending.clear();resolve({code,signal})}));
createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);if(!p)return;pending.delete(r.id);if(r.error)p.reject(Error(r.error));else p.resolve(r.value)});
const call=(op,args={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});child.stdin.write(JSON.stringify({id:next,op,...args})+'\n')});
let sequence=0,current;
const driver={get current(){return current},async create(config){await call('create',{config});sequence=0;current=await call('view',{player:1})},async step(n){await call('step',{n});current=await call('view',{player:1})},async orders(orders){assert(!orders.some(o=>o.kind.startsWith('practice')||o.kind==='surrender'));const seq=++sequence,preview=await call('preview',{player:1,batch:{orders}});assert(preview.results.every(r=>r.accepted),JSON.stringify(preview));await call('submit',{player:1,batch:{sequence:seq,orders}});await this.step(1);const receipts=current.results.filter(r=>r.sequence===seq);report.commands.push({tick:current.tick,sequence:seq,orders,receipts});assert.equal(receipts.length,orders.length);assert(receipts.every(r=>r.accepted),JSON.stringify(receipts))},async finishCase(name){const save=await call('save'),replay=Buffer.from(await call('replay'),'base64');await writeFile(path.join(out,`${name}.save.json`),Buffer.from(save.data,'base64'));await writeFile(path.join(out,`${name}.replay.gz`),replay);report.cases[name]={tick:current.tick,hash:await call('hash'),replaySHA256:sha(replay),outcome:current.outcome}}};
try{
 report.course=await aircraftServiceCourse(driver,{map,mission,onStage:async(stage,snapshot)=>{const save=await call('save');await writeFile(path.join(out,`${stage.name}.save.json`),Buffer.from(save.data,'base64'));await writeFile(path.join(out,`${stage.name}.view.json`),JSON.stringify(snapshot));report.stages.push({...stage,hash:save.hash,actors:snapshot.entities.filter(e=>stage.ids.includes(e.id)).map(e=>({id:e.id,type:e.type,state:e.state,enabled:e.enabled,landed:e.landed,home:e.private?.home,serviceWork:e.private?.serviceWork,emergencyTakeoffUntil:e.private?.emergencyTakeoffUntil,orders:e.private?.orders,jobs:e.private?.jobs}))});console.log(stage.name,stage.tick)}});report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);report.current=current;try{const s=await call('save');await writeFile(path.join(out,'failure.save.json'),Buffer.from(s.data,'base64'));await writeFile(path.join(out,'failure.replay.gz'),Buffer.from(await call('replay'),'base64'))}catch(capture){report.captureFailure=String(capture)}process.exitCode=1}
finally{child.stdin.end();report.exit=await exited;report.closedAt=new Date().toISOString();await writeFile(path.join(out,'stderr.log'),stderr);await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,status:report.status,failure:report.failure,cases:report.cases},null,2))}
