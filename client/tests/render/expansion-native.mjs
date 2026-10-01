import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ExpansionCommander} from './expansion-commander.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
assert(process.env.FRONTLINE_EXPANSION_BUILD);const build=path.resolve(process.env.FRONTLINE_EXPANSION_BUILD),output=path.join(root,'work/multiplayer-combat/expansion-'+new Date().toISOString().replaceAll(':','-'));await mkdir(output,{recursive:true});
const source=await readFile(new URL('expansion-commander.mjs',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');await writeFile(path.join(output,'commander.mjs'),source);
const mapBytes=await readFile(path.join(root,'content/maps/dry-river.json')),map=JSON.parse(mapBytes),receipt=JSON.parse(await readFile(path.join(build,'receipt.json')));assert.equal(sha(await readFile(path.join(build,'bridge'))),receipt.binarySHA256);
const child=spawn(path.join(build,'bridge'),[],{cwd:root,env:{...process.env,GOMAXPROCS:process.env.GOMAXPROCS??'1'},stdio:['pipe','pipe','pipe']});let next=1,stderr='';const pending=new Map();child.stderr.on('data',c=>stderr+=c);
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>{for(const p of pending.values())p.reject(Error('Bridge exited'));pending.clear();resolve({code,signal})}));
createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);assert(p);pending.delete(r.id);if(r.error){const error=Error(r.error);error.request=p.request;p.reject(error)}else p.resolve(r.value)});
const call=(op,args={})=>new Promise((resolve,reject)=>{const id=next++,request={id,op,...args};pending.set(id,{resolve,reject,request});child.stdin.write(JSON.stringify(request)+'\n')});
const seed=Number(process.env.FRONTLINE_EXPANSION_SEED??731),maxTick=Number(process.env.FRONTLINE_EXPANSION_MAX_TICK??48000),report={started:new Date().toISOString(),sourceSHA256:sha(source),mapSHA256:sha(mapBytes),receipt,seed,maxTick,scope:'Native behavior preflight only. All ordinary Go orders, one authorized view per policy, no free resources or time-based attack gate.',progress:[],orders:0,rejections:{},events:{}};
const views=new Map(),seq=[0,0,0];let lastLog=0;const advance=async n=>{await call('step',{n});for(const player of [1,2]){const v=await call('view',{player});views.set(player,v);for(const e of v.entities)assert(!e.private||e.owner===player);for(const e of v.events)if(e.owner===player)report.events[e.kind]=(report.events[e.kind]??0)+1}};
async function capture(){report.info=await call('info');report.finalHash=await call('hash');report.finished=views.get(1).outcome.finished;report.outcome=views.get(1).outcome;report.activeSeconds=(report.info.tick-report.initial.tick-report.initialCountdown)/20;report.long=report.finished&&report.activeSeconds>=1200;const save=await call('save'),replay=Buffer.from(await call('replay'),'base64');await writeFile(path.join(output,'final.save.json'),Buffer.from(save.data,'base64'));await writeFile(path.join(output,'earned.replay.gz'),replay);report.replaySHA256=sha(replay);for(const player of [1,2])await writeFile(path.join(output,`final-player-${player}.json`),JSON.stringify(views.get(player)))}
try{
 report.initial=await call('create',{config:{map,seed,players:[{id:1,name:'Expansion US',faction:'US',team:1,color:1},{id:2,name:'Defense SA',faction:'SA',team:2,color:2}]}});const catalog=await call('catalog');report.initialCountdown=(await call('view',{player:1})).countdown;
 await advance(100);
 const controllers=[1,2].map(player=>new ExpansionCommander({player,map,catalog,view:()=>views.get(player),record:entry=>{if(entry.kind==='stale-intention')(report.staleIntentions??=[]).push({player,...entry})},advice:(_ids,orders)=>call('preview',{player,batch:{orders}}),send:async(orders,note)=>{
  const tick=views.get(player).tick,sequence=++seq[player];await call('submit',{player,batch:{sequence,orders}});await advance(1);const receipts=views.get(player).results.filter(r=>r.sequence===sequence);assert.equal(receipts.length,orders.length);
  const entry={player,tick,sequence,orders,note,receipts};await appendFile(path.join(output,'commands.jsonl'),JSON.stringify(entry)+'\n');report.orders+=orders.length;for(const r of receipts)if(!r.accepted)report.rejections[r.code]=(report.rejections[r.code]??0)+1;return receipts;
 }}));
 while(!views.get(1).outcome.finished&&views.get(1).tick<maxTick){
  for(const commander of controllers)await commander.step();await advance(40);
  const tick=views.get(1).tick;if(tick-lastLog>=1200){lastLog=tick;const progress={tick,players:[1,2].map(player=>{const v=views.get(player);return {player,economy:v.economy,own:v.entities.filter(e=>e.owner===player).map(e=>({id:e.id,type:e.type,complete:e.complete,health:e.health,position:e.position,state:e.state,orders:e.private.orders,jobs:e.private.jobs}))}})};report.progress.push(progress);await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({tick,players:progress.players.map(p=>({player:p.player,credits:p.economy.credits,income:p.economy.income,units:p.own.length,types:[...new Set(p.own.map(e=>e.type))]}))}));}
 }
 await capture();
 report.status=report.finished?'ordinary-outcome':'incomplete-at-bounded-cap';
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack,request:error.request};try{await capture()}catch(captureError){report.captureError=String(captureError)}process.exitCode=1}
finally{child.stdin.end();report.bridge=await exited;report.completed=new Date().toISOString();await writeFile(path.join(output,'stderr.log'),stderr);await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,status:report.status,info:report.info,activeSeconds:report.activeSeconds,long:report.long,error:report.error}));}
