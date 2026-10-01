// One explicit ordinary-combat configuration; endurance uses two real hosted
// rematches in unchanged pages/Applications. No automatic matrix launches.
// Browser plugin unavailable: existing Playwright. Same policy as native preflight;
// unchanged production command APIs and exact frozen assets/runtime.
import {chromium} from 'playwright-core';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {prepareProduct,root,evidence,buildDir,product} from './multiplayer-combat-build.mjs';
import {activeMatchDuration,assertSameApplication,assertReleasedAtMenu,pairDuration} from './rematch-contract.mjs';
import {installWorkerObservation} from './worker-observation.mjs';
import {MatrixCommander,acceptanceCase,strictDiagnosticStatus} from './multiplayer-v24-contract.mjs';
import {installMultiplayerDiagnostics} from './multiplayer-passive-diagnostics.mjs';
assert(process.env.FRONTLINE_COMBAT_CASE,'Choose one explicit configuration; no default or automatic next match case');
const config=acceptanceCase(process.env.FRONTLINE_COMBAT_CASE);
assert.equal(process.env.FRONTLINE_COMBAT_REUSE,'1','Use an explicitly frozen integrated acceptance build; this driver never rebuilds it.');
const build=await prepareProduct(),runDir=path.join(evidence,'v24-'+config.id+'-'+new Date().toISOString().replaceAll(':','-'));await mkdir(runDir,{recursive:true});
const {fromBinary,EnvelopeSchema,applyDelta}=await import(pathToFileURL(path.join(buildDir,'decode.mjs')));
const {minimapLayout,minimapProject}=await import(pathToFileURL(path.join(buildDir,'minimap.mjs')));
const mapBytes=await readFile(path.join(product,`content/maps/${config.map}.json`)),map=JSON.parse(mapBytes);let rules;
const sha=value=>createHash('sha256').update(value).digest('hex'),json=value=>JSON.stringify(value,(_key,value)=>typeof value==='bigint'?value.toString():value,2),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source=await readFile(new URL(import.meta.url));await writeFile(path.join(runDir,'driver.mjs'),source);
assert(process.env.FRONTLINE_REMATCH_AUDITOR,'Provide the separately compiled, source-matched rematch auditor; do not silently reuse an old binary.');
const auditor=path.resolve(process.env.FRONTLINE_REMATCH_AUDITOR);
const auditorContract=JSON.parse(execFileSync(auditor,['-describe'],{cwd:root,encoding:'utf8'}));
assert.equal(auditorContract.simulation,build.version.simulation);
assert.equal(auditorContract.content_hash,build.version.content_hash);
assert.equal(auditorContract.initial_countdown_ticks,true,'Auditor must report the actual initial countdown.');
const report={configuration:config,diagnosticCollectors:[],started:new Date().toISOString(),build,driverSHA256:sha(source),auditorSHA256:sha(await readFile(auditor)),headless:process.env.FRONTLINE_COMBAT_HEADED!=='1',conditions:process.env.FRONTLINE_COMBAT_CONDITIONS??'Shared host; no performance claim.',scope:'Frozen v24 plus34 full-export overlays; explicit1–4-human ordinary combat or two same-App/page hosted rematches. Authorized-view corrected expansion commander; no free resources, artificial outcome, victory delay or relaxed error gate. Active20-minute threshold applies only to endurance and is measured after genuine outcomes. Loopback contexts are not physical LAN.',cases:[],errors:[],httpErrors:[],boundaries:[]};
report.auditorContract=auditorContract;assert.equal(report.auditorSHA256,build.audit.sha256,'Frozen auditor changed');report.mapSHA256=sha(mapBytes);
const workerSources={};
for(const [key,name] of [['imageWorkerSource','loadImageBitmap'],['probeWorkerSource','checkImageBitmap']]){
 const source=await readFile(path.join(root,'client/node_modules/pixi.js/lib/_virtual',name+'.worker.mjs'),'utf8');workerSources[key]=JSON.parse(source.split('\n')[0].slice('const WORKER_CODE = '.length,-1));
}
report.workerSourceSHA256=Object.fromEntries(Object.entries(workerSources).map(([key,source])=>[key,sha(source)]));
report.helpers={};for(const file of ['worker-observation.mjs','rematch-contract.mjs','multiplayer-v24-contract.mjs','multiplayer-passive-diagnostics.mjs']){const bytes=await readFile(new URL(file,import.meta.url));report.helpers[file]=sha(bytes);await writeFile(path.join(runDir,file),bytes)}
let activeRecord,phase='setup';const contexts=[],pages=[],frames=[],diagnostics=[],responseTasks=new Set();
function trackResponse(page,handler){page.on('response',response=>{const task=handler(response).catch(error=>report.errors.push({phase,kind:'response-observer',message:String(error)}));responseTasks.add(task);void task.finally(()=>responseTasks.delete(task))})}
async function until(check,message,timeout=30000){const started=Date.now();while(!await check()){if(Date.now()-started>timeout)throw Error(message);await sleep(150)}}
async function idle(page){await until(async()=>await page.locator('.network-operation,.loading-screen').count()===0,'Product remained busy',120000);if(await page.locator('.network-error').count())throw Error(await page.locator('.network-error').allInnerTexts());if(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).count())throw Error(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).innerText())}
async function saveReport(){await writeFile(path.join(runDir,'browser.json'),json(report));await writeFile(path.join(evidence,'latest-v24-acceptance.json'),json({runDir,phase,cases:report.cases.map(({id,status,progress})=>({id,status,ticks:progress?.map(value=>value.tick)}))}))}
async function capture(page,id){await page.screenshot({path:path.join(runDir,id+'.png')})}
async function focus(page,position){const box=await page.getByLabel('Tactical minimap',{exact:true}).boundingBox();if(box){const point=minimapProject(minimapLayout(map.width,map.height,box.width,box.height),position);await page.mouse.click(box.x+point.x,box.y+point.y);await sleep(150)}}
function observe(page,player){
 const state={snapshot:undefined,result:undefined,sockets:0,openSockets:new Set(),results:new Map(),orders:[],events:new Map(),navigationCount:0,firstSnapshot:undefined},requestViews=new WeakMap();
 const entry=kind=>({player,round:activeRecord?.id,phase,kind,time:new Date().toISOString()});
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())state.navigationCount++});
 page.on('pageerror',error=>report.errors.push({...entry('pageerror'),message:error.message,stack:error.stack}));page.on('crash',()=>report.errors.push(entry('page-crash')));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({...entry('console'),message:message.text(),location:message.location()})});
 page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/advice'))requestViews.set(request,{clientTick:state.snapshot?.tick,observedAt:new Date().toISOString()})});
 trackResponse(page,async response=>{const record=activeRecord,pathname=new URL(response.url()).pathname;if(pathname==='/api/v1/history'&&response.ok()){try{const values=await response.json();(record.historyResponses??=[]).push({player,time:new Date().toISOString(),matchIDs:values.map(value=>value.id)})}catch(error){report.errors.push({...entry('history-response'),message:String(error)})}return}if(response.status()<400)return;const item={...entry('http'),path:pathname,status:response.status()};report.httpErrors.push(item);if(pathname.endsWith('/advice')){const request=response.request();item.requestTiming=request.timing();item.clientAtRequest=requestViews.get(request);item.clientTickAtResponse=state.snapshot?.tick;try{const body=request.postDataJSON();item.adviceRequest={entities:body.entities,orders:body.orders,independent:body.independent}}catch{item.adviceRequest='unreadable'}}try{const body=await response.json();item.code=body.code;item.message=body.message}catch{}});
 page.on('websocket',socket=>{const record=activeRecord;state.sockets++;state.openSockets.add(socket);socket.on('close',()=>state.openSockets.delete(socket));socket.on('framereceived',frame=>{if(record!==activeRecord||typeof frame.payload==='string')return;try{const message=fromBinary(EnvelopeSchema,new Uint8Array(frame.payload)).message;if(message.case==='snapshot'){state.snapshot=message.value;state.firstSnapshot??={tick:message.value.tick,countdown:message.value.countdown}}else if(message.case==='delta')state.snapshot=applyDelta(state.snapshot,message.value);else if(message.case==='result')state.result=message.value;else if(message.case==='orderResult'){const r=message.value;state.results.set(`${r.sequence}:${r.index}`,r)}if(['snapshot','delta'].includes(message.case)){for(const r of state.snapshot.results)state.results.set(`${r.sequence}:${r.index}`,r);for(const event of state.snapshot.events)state.events.set(String(event.id),{kind:event.kind,tick:event.tick,owner:event.owner,entity:event.entity});for(const entity of state.snapshot.entities)assert(!entity.private||entity.owner===player,'Foreign private data exposed')}}catch(error){report.errors.push({...entry('decoder'),message:error.message})}});socket.on('framesent',frame=>{if(record!==activeRecord||typeof frame.payload==='string')return;try{const message=fromBinary(EnvelopeSchema,new Uint8Array(frame.payload)).message;if(message.case==='orders')state.orders.push(message.value)}catch(error){report.errors.push({...entry('outgoing-decoder'),message:error.message})}})});return state;
}
function resetRound(){for(const frame of frames){assert.equal(frame.openSockets.size,0);frame.snapshot=undefined;frame.result=undefined;frame.firstSnapshot=undefined;frame.results.clear();frame.orders=[];frame.events.clear()}}
async function lifetime(index){return {app:await pages[index].evaluate(()=>window.multiplayerCombat.lifetime()),page:await pages[index].evaluate(()=>window.rematchPageTelemetry()),navigationCount:frames[index].navigationCount,openSockets:frames[index].openSockets.size}}
class Commander extends MatrixCommander {
 constructor(page,frame,record,player){
  let self;
  super({player,map,catalog:rules,view:()=>frame.snapshot,send:(orders,note)=>self.submit(orders,note),advice:(ids,orders,independent)=>self.lookup(ids,orders,independent),record:entry=>{if(entry.kind==='stale-intention')(record.staleIntentions??=[]).push({player,...entry})}});
  Object.assign(this,{page,frame,caseRecord:record,player});self=this;this.started=false;this.adviceErrors=0;
 }
 async submit(orders,note){
  if(!orders.length)return;const tick=this.frame.snapshot.tick,sequence=await this.page.evaluate(orders=>window.multiplayerCombat.send(orders),orders);
  await until(()=>orders.every((_o,i)=>this.frame.results.has(`${sequence}:${i}`)),'Missing command receipts',10000);
  const receipts=orders.map((_o,i)=>this.frame.results.get(`${sequence}:${i}`));
  await appendFile(path.join(runDir,`${this.caseRecord.id}-commands.jsonl`),json({player:this.player,tick,sequence,note,orders,receipts}).replaceAll('\n','')+'\n');this.caseRecord.commands++;return receipts;
 }
 async lookup(ids,orders=[],independent=false){
  try{return await this.page.evaluate(async({ids,orders,independent})=>window.multiplayerCombat.advice(ids,orders,independent),{ids,orders,independent})}
  catch(error){if(/advice|Wait for|selection|current command|provide current|current selection/i.test(error.message)){this.adviceErrors++;(this.caseRecord.adviceFailures??=[]).push({player:this.player,tick:this.frame.snapshot?.tick,message:error.message});return}throw error}
 }
 async step(){
  const v=this.frame.snapshot,me=v?.players.find(p=>p.id===this.player);if(!v||v.countdown||v.outcome?.finished||me?.defeated)return;
  if(!this.started){this.started=true;this.caseRecord.clients.push({player:this.player,faction:me.faction,team:me.team,openingTick:v.tick,base:map.spawns[this.player-1].position,assets:JSON.parse(await this.page.evaluate(()=>window.multiplayerCombat.info())).assets})}
  if(!this.caseRecord.ownershipRejections?.some(r=>r.player===this.player)){
   const foe=v.entities.find(e=>e.owner!==0&&v.players.some(p=>p.id===e.owner&&p.team!==me.team&&!p.defeated));
   if(foe){const [receipt]=await this.submit([{kind:'stop',entities:[foe.id]}],'Expected rejection: cannot command visible enemy');assert.equal(receipt.accepted,false);assert.equal(receipt.code,'not_owner');(this.caseRecord.ownershipRejections??=[]).push({player:this.player,tick:v.tick,target:foe.id,code:receipt.code})}
  }
  await super.step();
 }
}
const commanderSource=await readFile(new URL('expansion-commander.mjs',import.meta.url));
report.commanderSHA256=sha(commanderSource);await writeFile(path.join(runDir,'expansion-commander.mjs'),commanderSource);

async function hostStart(){
 const data=path.join(runDir,'host-data');await mkdir(data,{recursive:true});
 const child=spawn(path.join(buildDir,'frontline'),['-addr','127.0.0.1:0','-data',data,'-static',product,'-maps',path.join(product,'content/maps'),'-missions',path.join(product,'content/missions')],{cwd:root,stdio:['ignore','pipe','pipe']});
 let log='';const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 const close=async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');const result=await exited;await writeFile(path.join(runDir,'host.log'),log);return result};
 try{
  const origin=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Host startup timed out')),30000);
   child.stdout.on('data',chunk=>{log+=chunk;const found=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(found){clearTimeout(timer);resolve(found[0])}});
   child.stderr.on('data',chunk=>log+=chunk);
   child.once('error',error=>{clearTimeout(timer);reject(error)});
   child.once('exit',code=>{clearTimeout(timer);reject(Error('Host exited '+code))});
  });
  await writeFile(path.join(runDir,'host.pid'),String(child.pid));return {origin,close};
 }catch(error){if(child.pid)await close();throw error}
}

async function openOperationMenu(page){
 if(await page.getByRole('button',{name:'Return to command center',exact:true}).count())return;
 // A final authorized snapshot opens a debrief. An eliminated player may retain
 // a frozen view and exposes its durable result through the ordinary menu.
 if(await page.getByRole('dialog').last().getByRole('button',{name:'Command center',exact:true}).count())return;
 await page.getByRole('button',{name:'Open pause menu',exact:true}).click();
 await page.getByRole('region',{name:'Online operation controls'}).first().waitFor();
}
async function commandCenter(page){
 await openOperationMenu(page);
 const command=page.getByRole('dialog').last().getByRole('button',{name:'Command center',exact:true});
 if(await command.count())await command.click();
 else await page.getByRole('button',{name:'Return to command center',exact:true}).click();
 await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await idle(page);
}
async function menuBoundary(label,initial){
 phase='menu-boundary';const checks=[];
 for(let index=0;index<pages.length;index++){
  let current,lastError;
  await until(async()=>{current=await lifetime(index);try{assertReleasedAtMenu(initial[index],current);return true}catch(error){lastError=error;return false}},`Player ${index+1} did not release the old match at ${label}`,30000).catch(error=>{report.boundaryFailure={label,player:index+1,current};throw new Error(error.message+': '+lastError?.message)});
  checks.push(current);assert.equal(await pages[index].getByLabel('Your profile ID').inputValue(),report.profiles[index],'Profile changed across rematch');
  await capture(pages[index],`${label}-player-${index+1}`);
 }
 report.boundaries.push({label,time:new Date().toISOString(),players:checks});await saveReport();return checks;
}
async function startRound(record,initial){
 activeRecord=record;phase=record.phase='readiness';
 record.lobby=await pages[0].getByLabel('Current lobby ID').inputValue();
 for(let index=0;index<pages.length;index++){
  await pages[index].getByLabel(`Commander ${index+1} faction`,{exact:true}).selectOption(config.factions[index]);await idle(pages[index]);
  if(config.teams){await pages[index].getByLabel(`Commander ${index+1} team`,{exact:true}).selectOption(index<2?'1':'2');await idle(pages[index])}
 }
 await until(async()=>await pages[0].locator('.network-commander').count()===config.humans+config.bots,'Roster incomplete');await sleep(2200);
 assert(await pages[0].getByRole('button',{name:'Start operation',exact:true}).isDisabled());record.startBlockedBeforeReady=true;
 for(let index=0;index<pages.length;index++){
  await pages[index].getByRole('button',{name:'Ready to deploy',exact:true}).click();await idle(pages[index]);
  if(index<pages.length-1)assert(await pages[0].getByRole('button',{name:'Start operation',exact:true}).isDisabled());
 }
 await until(()=>pages[0].getByRole('button',{name:'Start operation',exact:true}).isEnabled(),'Readiness did not unlock start');
 await capture(pages[0],`${record.id}-lobby`);await pages[0].getByRole('button',{name:'Start operation',exact:true}).click();
 for(const page of pages){await page.getByRole('complementary',{name:'Command sidebar'}).waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'})}
 await until(()=>frames.every(frame=>frame.snapshot?.tick>130),'Countdown did not finish',90000);
 record.startLifetime=await Promise.all(pages.map((_page,index)=>lifetime(index)));
 for(let index=0;index<pages.length;index++){
  assertSameApplication(initial[index],record.startLifetime[index]);assert.equal(record.startLifetime[index].app.kind,'online');
  assert.equal(frames[index].snapshot.player,index+1);assert.equal(frames[index].snapshot.players.length,config.humans+config.bots);assert.equal(frames[index].snapshot.players[index].faction,config.factions[index]);
  const previous=report.cases.at(-2);if(previous)assert.notEqual(record.startLifetime[index].app.session,previous.startLifetime[index].app.session,'Old match session reused');
 }
 record.initialSnapshots=frames.map(frame=>frame.firstSnapshot);await saveReport();
}
async function reconnect(record){
 const index=(record.round-1)%pages.length,page=pages[index],frame=frames[index];
 if(frame.snapshot.players.find(player=>player.id===index+1)?.defeated)return false;
 const before={tick:frame.snapshot.tick,sequence:frame.snapshot.economy.lastSequence,sockets:frame.sockets};
 await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('region',{name:'Online operation controls'}).first().waitFor();
 await page.getByRole('button',{name:'Reconnect',exact:true}).click();await idle(page);
 await until(()=>frame.sockets>before.sockets&&frame.snapshot.tick>=before.tick,'Reconnect did not recover');
 const after={tick:frame.snapshot.tick,sequence:frame.snapshot.economy.lastSequence,sockets:frame.sockets};
 assert(after.sequence>=before.sequence);record.reconnect={player:index+1,before,after};
 await page.getByRole('button',{name:'Return to battlefield',exact:true}).click();return true;
}
async function ordinaryCombat(record){
 phase=record.phase='ordinary-combat';record.started=new Date().toISOString();
 const commanders=pages.map((page,index)=>new Commander(page,frames[index],record,index+1));
 let abortRequested=false;const requestAbort=()=>{abortRequested=true};process.on('SIGUSR2',requestAbort);
 let lastLog=0,lastCapture=0;const started=Date.now(),wallLimit=Number(process.env.FRONTLINE_COMBAT_MINUTES??60)*60000;
 assert(Number.isFinite(wallLimit)&&wallLimit>0);
 try{
 while(!frames.some(frame=>frame.result?.committed||frame.snapshot?.outcome?.finished)&&!JSON.parse(await pages[0].evaluate(()=>window.multiplayerCombat.info())).result?.committed){
  if(abortRequested){
   const reason='Explicit requested test-policy abort; no forced result or gameplay mutation';
   report.intentionalAbort={kind:'failed-test-policy',reason,time:new Date().toISOString(),ticks:frames.map(frame=>frame.snapshot?.tick),unfinishedAuthoritativeExport:'Normal1v1 has no unfinished save/replay export; exact authorized views and command receipts are preserved.'};
   await writeFile(path.join(runDir,'policy-abort-views.json'),json(frames.map(frame=>frame.snapshot)));
   await writeFile(path.join(runDir,'policy-abort-commanders.json'),json(commanders.map(c=>({player:c.player,routes:[...c.routes],searches:[...c.searches],frontierSearch:c.frontierSearch,last:[...c.last],recovering:[...c.recovering],failed:[...c.failed]}))));
   for(let index=0;index<pages.length;index++)await capture(pages[index],`policy-abort-player-${index+1}`);
   try{for(const page of pages)await commandCenter(page);await menuBoundary('aborted-operation',report.initialLifetime)}catch(error){report.intentionalAbort.cleanupFailure=String(error.stack??error)}
   throw new Error(reason);
  }
  if(Date.now()-started>wallLimit)throw Error(`Incomplete ordinary match after ${wallLimit/60000} wall minutes; no forced result`);
  for(const commander of commanders)await commander.step();
  const tick=Math.max(...frames.map(frame=>frame.snapshot?.tick??0));
  if(!record.reconnect&&tick>3600)await reconnect(record);
  if(tick-lastLog>=600){
   lastLog=tick;
   record.progress=frames.map(frame=>({player:frame.snapshot.player,tick:frame.snapshot.tick,economy:frame.snapshot.economy,owned:frame.snapshot.entities.filter(entity=>entity.owner===frame.snapshot.player).reduce((out,entity)=>(out[entity.type]=(out[entity.type]??0)+1,out),{}),players:frame.snapshot.players.map(player=>({id:player.id,defeated:player.defeated})),events:[...frame.events.values()].reduce((out,event)=>(out[event.kind]=(out[event.kind]??0)+1,out),{})}));
   console.log(record.id,'tick',tick);await appendFile(path.join(runDir,`${record.id}-progress.jsonl`),json({time:new Date().toISOString(),players:record.progress}).replaceAll('\n','')+'\n');await saveReport();
  }
  if(tick-lastCapture>=2400){
   lastCapture=tick;const view=frames[0].snapshot,army=view.entities.filter(entity=>entity.owner===view.player&&rules.units.find(unit=>unit.id===entity.type)?.weapon),engaged=army.find(entity=>['firing','aiming'].includes(entity.state))??army.at(-1);
   if(engaged)await focus(pages[0],engaged.position);await capture(pages[0],`${record.id}-tick-${tick}`);await writeFile(path.join(runDir,`${record.id}-view-${tick}.json`),json(view));
  }
  await sleep(1800);
 }
 }finally{process.off('SIGUSR2',requestAbort)}
 record.adviceRetries=commanders.map(commander=>({player:commander.player,count:commander.adviceErrors}));
}
async function collectResultAndArchive(record){
 phase=record.phase='committed-result';let result;
 await until(async()=>{result=frames.find(frame=>frame.result?.committed)?.result??JSON.parse(await pages[0].evaluate(()=>window.multiplayerCombat.info())).result;return result?.committed},'No committed result',30000);
 assert.equal(result.outcome.reason,'elimination');assert.equal(result.outcome.draw,false);record.result=result;
 assert(record.reconnect,'No live reconnect was exercised');
 assert.equal(new Set(record.ownershipRejections?.map(value=>value.player)).size,config.humans,'Every human ownership rejection required');
 for(let index=0;index<pages.length;index++){
  const page=pages[index],frame=frames[index],frozen=frame.snapshot.players.find(player=>player.id===index+1)?.defeated?json(frame.snapshot):undefined;
  let info;
  await until(async()=>{info=JSON.parse(await page.evaluate(()=>window.multiplayerCombat.info()));return info.result?.committed&&info.result.matchId===result.matchId},`Player ${index+1} did not recover its own durable result`,30000);
  if(frozen!==undefined)assert.equal(json(frame.snapshot),frozen,'Durable result changed the frozen private snapshot');
  assert(!frame.orders.some(batch=>batch.orders.some(order=>['surrender','surrender_vote','sell','practice'].includes(order.kind))),'Forbidden acceleration order');
  record.clients[index].final={tick:frame.snapshot.tick,info,ownSnapshotUnchanged:frozen===undefined?undefined:true};
  await capture(page,`${record.id}-player-${index+1}-result`);
 }
 const host=pages[0],before=await host.evaluate(()=>window.multiplayerCombat.replays());
 await openOperationMenu(host);const button=host.getByRole('button',{name:'Save match replay',exact:true}).first();await button.waitFor();
 await capture(host,`${record.id}-archive-menu`);await button.click();await idle(host);
 let archived;
 await until(async()=>{const list=await host.evaluate(()=>window.multiplayerCombat.replays());archived=list.find(item=>!before.some(old=>old.id===item.id));return !!archived},'A distinct replay was not archived',120000);
 const replay=await host.evaluate(id=>window.multiplayerCombat.replay(id),archived.id),data=new Uint8Array(replay.data);
 assert.equal(sha(data),replay.sha256);assert.equal(replay.sha256,archived.sha256);
 await writeFile(path.join(runDir,`${record.id}.replay.gz`),data);record.replay={id:replay.id,sha256:replay.sha256,bytes:data.length,startTick:archived.start_tick,endTick:archived.end_tick};
 if(report.cases.length>1){const previous=report.cases.at(-2);assert.notEqual(record.result.matchId,previous.result.matchId);assert.notEqual(record.replay.id,previous.replay.id);assert(before.some(item=>item.id===previous.replay.id&&item.sha256===previous.replay.sha256),'First archive disappeared before rematch completion')}
 record.status='combat-and-archive-complete';record.completed=new Date().toISOString();await saveReport();
}
async function nativeAudit(record){
 const output=path.join(runDir,`${record.id}-native-audit`);let log='';
 const child=spawn(auditor,['-replay',path.join(runDir,`${record.id}.replay.gz`),'-out',output],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,GOMAXPROCS:'1'}});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>log+=chunk);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
 await writeFile(path.join(runDir,`${record.id}-native-audit.log`),log);assert.equal(code,0,'Native replay/save verification failed');
 const audit=JSON.parse(await readFile(path.join(output,'audit.json'),'utf8'));assert.equal(audit.replay_sha256,record.replay.sha256);
 assert.equal(audit.final_tick,record.result.outcome.tick);record.nativeProof=audit;record.duration=activeMatchDuration(audit);record.nativeStatus='passed';record.status='replay-verified';await saveReport();
}

let server,browser;
try{
 // The recipe is not a promise that bytes remained frozen: verify the important
 // hosted inputs again before any profile creation or game starts.
 report.actualBuild={};
 for(const [key,file] of [['host',path.join(buildDir,'frontline')],['wasm',path.join(product,'runtime/frontline.wasm')],['pack',path.join(product,'assets/packs/base.json')]]){
  const bytes=await readFile(file);report.actualBuild[key]={bytes:bytes.length,sha256:sha(bytes)};assert.equal(sha(bytes),build.sha256[key],`Frozen ${key} changed`);
 }
 for(const file of ['wasm_exec.js','worker.js','worker.js.map','version.json']){const bytes=await readFile(path.join(product,'runtime',file));report.actualBuild[file]={bytes:bytes.length,sha256:sha(bytes)};assert.equal(sha(bytes),build.runtimeFiles[file].sha256,`Frozen runtime ${file} changed`)}
 for(const file of ['decode.mjs','minimap.mjs']){report.actualBuild[file]=sha(await readFile(path.join(buildDir,file)));assert.equal(report.actualBuild[file],build.helpers[file],`Frozen helper ${file} changed`)}
 assert.equal(report.mapSHA256,build.maps[config.map], 'Frozen map changed');
 server=await hostStart();report.origin=server.origin;
 const executable=process.env.FRONTLINE_COMBAT_EXECUTABLE??chromium.executablePath();report.executable={path:executable,sha256:sha(await readFile(executable)),explicit:!!process.env.FRONTLINE_COMBAT_EXECUTABLE};
 browser=await chromium.launch({headless:report.headless,...process.env.FRONTLINE_COMBAT_EXECUTABLE?{executablePath:executable}:(!report.headless?{channel:'chromium'}:{})});report.browser=browser.version();
 const gpuSession=await browser.newBrowserCDPSession();try{report.gpu=(await gpuSession.send('SystemInfo.getInfo')).gpu}finally{await gpuSession.detach()}
 if(!report.headless){const renderer=report.gpu.auxAttributes?.glRenderer??'';assert.match(renderer,/Metal|Apple/i);assert.doesNotMatch(renderer,/SwiftShader|software/i)}
 activeRecord={id:'round-1',round:1,status:'running',clients:[],commands:0};report.cases.push(activeRecord);
 for(let index=0;index<config.humans;index++){
  const context=await browser.newContext({viewport:{width:index?1280:1600,height:index?720:900},acceptDownloads:true});contexts.push(context);await context.addInitScript(installWorkerObservation,workerSources);
  const page=await context.newPage();pages.push(page);page.setDefaultTimeout(90000);frames.push(observe(page,index+1));diagnostics.push(await installMultiplayerDiagnostics(page,()=>({player:index+1,round:activeRecord?.id,phase})));
  await page.goto(server.origin);assert.equal(await page.title(),'Frontline Command');
  assert(await page.evaluate(()=>typeof window.multiplayerCombat?.lifetime==='function'&&typeof window.multiplayerCombat?.replays==='function'),'Frozen build lacks the readonly lifetime/archive hooks. Prepare the next integrated freeze first.');
  await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await idle(page);
  await page.getByLabel('Commander name',{exact:true}).fill(`Rematch commander ${index+1}`);await page.getByRole('button',{name:'Create local profile',exact:true}).click();await page.getByLabel('Your profile ID').waitFor();await idle(page);
 }
 report.profiles=await Promise.all(pages.map(page=>page.getByLabel('Your profile ID').inputValue()));assert.equal(new Set(report.profiles).size,config.humans);
 rules=JSON.parse(await pages[0].evaluate(()=>window.multiplayerCombat.catalog()));assert(Array.isArray(rules.units)&&Array.isArray(rules.buildings));
 for(const page of pages.slice(1))assert.equal(await page.evaluate(()=>window.multiplayerCombat.catalog()),await pages[0].evaluate(()=>window.multiplayerCombat.catalog()));report.catalogSHA256=sha(json(rules));
 const initial=await Promise.all(pages.map((_page,index)=>lifetime(index)));report.initialLifetime=initial;
 for(const value of initial){assert.equal(value.app.phase,'menu');assert.equal(value.app.transportPresent,false);assert.equal(value.openSockets,0);assert.equal(value.navigationCount,1)}
 const host=pages[0];await host.getByLabel('Operation name',{exact:true}).fill(`Current acceptance ${config.id}`);await host.getByLabel('Lobby battlefield',{exact:true}).selectOption(config.map);await host.getByLabel('Battle format',{exact:true}).selectOption(config.mode);await host.getByLabel('Host faction',{exact:true}).selectOption('US');await host.getByRole('button',{name:'Create operation',exact:true}).click();await idle(host);
 for(const page of pages.slice(1)){await page.getByLabel('Join lobby ID').fill(await host.getByLabel('Current lobby ID').inputValue());await page.getByRole('button',{name:'Join by ID',exact:true}).click();await idle(page)}
 for(let i=0;i<config.bots;i++){await host.getByLabel('Add AI faction',{exact:true}).selectOption(['US','IR','SY','SA'][config.humans+i]);await host.getByLabel('Add AI difficulty',{exact:true}).selectOption('normal');if(config.mode!=='ffa')await host.getByLabel('Add AI team',{exact:true}).selectOption(config.teams?'2':String(config.humans+i+1));await host.getByRole('button',{name:'Add AI commander',exact:true}).click();await idle(host)}
 for(let round=1;round<=config.rounds;round++){
  const record=activeRecord;await startRound(record,initial);await ordinaryCombat(record);await collectResultAndArchive(record);
  if(round<config.rounds){
   phase=record.phase='hosted-rematch';await openOperationMenu(host);await host.getByRole('button',{name:'Create rematch lobby',exact:true}).first().click();await idle(host);await commandCenter(host);
   const rematch=await host.getByLabel('Current lobby ID').inputValue();assert.notEqual(rematch,record.lobby);assert(await host.getByRole('button',{name:'Start operation',exact:true}).isDisabled());
   record.rematch={id:rematch,requiresNewReadiness:true};await commandCenter(pages[1]);
   await pages[1].getByRole('button',{name:'Close completed lobby',exact:true}).click();await idle(pages[1]);
   await menuBoundary('between-matches',initial);resetRound();
   activeRecord={id:'round-2',round:2,status:'running',clients:[],commands:0};report.cases.push(activeRecord);
   await pages[1].getByLabel('Join lobby ID').fill(rematch);await pages[1].getByRole('button',{name:'Join by ID',exact:true}).click();await idle(pages[1]);
  }else{
   for(const page of pages)await commandCenter(page);await menuBoundary(`after-${config.rounds}-matches`,initial);
   const archives=await host.evaluate(()=>window.multiplayerCombat.replays());report.finalArchives=archives;
   for(const match of report.cases)assert(archives.some(item=>item.id===match.replay.id&&item.sha256===match.replay.sha256),'An earlier exact replay was lost');
  }
 }
 report.lifecycleStatus='passed';
}catch(error){report.browserFailure=String(error.stack??error);if(activeRecord){activeRecord.status='failed';activeRecord.failure=report.browserFailure}for(let index=0;index<pages.length;index++){await capture(pages[index],`failure-player-${index+1}`).catch(()=>{});await writeFile(path.join(runDir,`failure-view-${index+1}.json`),json(frames[index]?.snapshot??null))}}
finally{
 phase='closing-browser-and-host';await saveReport();
 for(const context of contexts)await context.close().catch(error=>report.errors.push({kind:'context-close',message:String(error)}));
 await browser?.close().catch(error=>report.errors.push({kind:'browser-close',message:String(error)}));
 await Promise.allSettled([...responseTasks]);report.diagnosticCollectors=diagnostics.map(c=>c.snapshot());
 if(server)report.hostExit=await server.close();report.browserAndHostClosed=new Date().toISOString();await saveReport();console.log('Browser and host closed; native audit may follow:',runDir);
}
// Independent replay/save checks run after every browser/host has closed, even
// if a strict earlier HTTP error already makes the overall acceptance fail.
phase='native-audit';
for(const record of report.cases.filter(value=>value.replay)){
 try{await nativeAudit(record)}catch(error){record.nativeFailure=String(error.stack??error);record.status='failed'}
}
report.combatStatus=report.cases.length===config.rounds&&report.cases.every(record=>record.nativeStatus==='passed')?'passed':'failed';
if(config.long&&report.cases.length===2&&report.cases.every(record=>record.duration))report.longSessions=pairDuration(report.cases.map(record=>record.duration));
report.requestFailures=report.diagnosticCollectors.flatMap(c=>c.failures);report.diagnosticStatus=strictDiagnosticStatus({errors:report.errors,httpErrors:report.httpErrors,requestFailures:report.requestFailures,collectorFaults:report.diagnosticCollectors.flatMap(c=>c.faults),diagnosticsAgree:report.diagnosticCollectors.every(c=>c.diagnosticsAgree)});
 report.strictStatus=report.diagnosticStatus;
report.status=!report.browserFailure&&report.lifecycleStatus==='passed'&&report.combatStatus==='passed'&&report.strictStatus==='passed'&&(!config.long||report.longSessions?.complete)?'passed':'failed';
report.completed=new Date().toISOString();phase='complete';await saveReport();
if(report.status!=='passed')process.exitCode=1;
console.log(json({status:report.status,combat:report.combatStatus,lifecycle:report.lifecycleStatus,strict:report.strictStatus,longSessions:report.longSessions,runDir}));
