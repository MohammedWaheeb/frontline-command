// Two ordinary two-human matches, one host and unchanged pages/Applications.
// Browser plugin unavailable: existing Playwright. All command policy is copied
// from the reviewed ordinary-combat driver; no production modules are changed.
import {minimapLayout,minimapProject} from '../../src/render/minimap.ts';
import {chromium} from 'playwright-core';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {prepareProduct,root,evidence,buildDir,product} from './multiplayer-combat-build.mjs';
import {activeMatchDuration,assertSameApplication,assertReleasedAtMenu,pairDuration} from './rematch-contract.mjs';
assert.equal(process.env.FRONTLINE_COMBAT_REUSE,'1','Use an explicitly frozen integrated acceptance build; this driver never rebuilds it.');
const build=await prepareProduct(),runDir=path.join(evidence,'rematch-'+new Date().toISOString().replaceAll(':','-'));await mkdir(runDir,{recursive:true});
const {fromBinary,EnvelopeSchema,applyDelta}=await import(pathToFileURL(path.join(buildDir,'decode.mjs')));
const map=JSON.parse(await readFile(path.join(product,'content/maps/industrial-valley.json'),'utf8'));let rules;
const sha=value=>createHash('sha256').update(value).digest('hex'),json=value=>JSON.stringify(value,(_key,value)=>typeof value==='bigint'?value.toString():value,2),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source=await readFile(new URL(import.meta.url));await writeFile(path.join(runDir,'driver.mjs'),source);
assert(process.env.FRONTLINE_REMATCH_AUDITOR,'Provide the separately compiled, source-matched rematch auditor; do not silently reuse an old binary.');
const auditor=path.resolve(process.env.FRONTLINE_REMATCH_AUDITOR);
const auditorContract=JSON.parse(execFileSync(auditor,['-describe'],{cwd:root,encoding:'utf8'}));
assert.equal(auditorContract.simulation,build.version.simulation);
assert.equal(auditorContract.content_hash,build.version.content_hash);
assert.equal(auditorContract.initial_countdown_ticks,true,'Auditor must report the actual initial countdown.');
const report={started:new Date().toISOString(),build,driverSHA256:sha(source),auditorSHA256:sha(await readFile(auditor)),headless:process.env.FRONTLINE_COMBAT_HEADED!=='1',conditions:process.env.FRONTLINE_COMBAT_CONDITIONS??'Shared host; no performance claim.',scope:'Two independent profiles, same host/contexts/pages/Applications, DOM hosted rematch and ordinary paid combat. No page reload, surrender, free resources or altered deadlines. Twenty active minutes per match is a separate operational long-session criterion; natural shorter outcomes remain valid combat evidence.',cases:[],errors:[],httpErrors:[],boundaries:[]};
report.auditorContract=auditorContract;
let activeRecord,phase='setup';const contexts=[],pages=[],frames=[];
async function until(check,message,timeout=30000){const started=Date.now();while(!await check()){if(Date.now()-started>timeout)throw Error(message);await sleep(150)}}
async function idle(page){await until(async()=>await page.locator('.network-operation,.loading-screen').count()===0,'Product remained busy',120000);if(await page.locator('.network-error').count())throw Error(await page.locator('.network-error').allInnerTexts());if(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).count())throw Error(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).innerText())}
async function saveReport(){await writeFile(path.join(runDir,'browser.json'),json(report));await writeFile(path.join(evidence,'latest-rematch.json'),json({runDir,phase,cases:report.cases.map(({id,status,progress})=>({id,status,ticks:progress?.map(value=>value.tick)}))}))}
async function capture(page,id){await page.screenshot({path:path.join(runDir,id+'.png')})}
async function focus(page,position){const box=await page.getByLabel('Tactical minimap',{exact:true}).boundingBox();if(box){const point=minimapProject(minimapLayout(map.width,map.height,box.width,box.height),position);await page.mouse.click(box.x+point.x,box.y+point.y);await sleep(150)}}
function pageTelemetry(){
 const active=new Set();let created=0,terminated=0;const NativeWorker=window.Worker,pageInstance=String(performance.timeOrigin)+'-'+Math.random().toString(36);
 window.Worker=new Proxy(NativeWorker,{construct(target,args,newTarget){const worker=Reflect.construct(target,args,newTarget),id=++created;active.add(id);const terminate=worker.terminate.bind(worker);worker.terminate=()=>{if(active.delete(id))terminated++;return terminate()};return worker}});
 Object.defineProperty(window,'rematchPageTelemetry',{value:()=>({pageInstance,activeWorkers:active.size,createdWorkers:created,terminatedWorkers:terminated,timeOrigin:performance.timeOrigin,heapUsed:performance.memory?.usedJSHeapSize})});
}
function observe(page,player){
 const state={snapshot:undefined,result:undefined,sockets:0,openSockets:new Set(),results:new Map(),orders:[],events:new Map(),navigationCount:0,firstSnapshot:undefined},requestViews=new WeakMap();
 const entry=kind=>({player,round:activeRecord?.id,phase,kind,time:new Date().toISOString()});
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())state.navigationCount++});
 page.on('pageerror',error=>report.errors.push({...entry('pageerror'),message:error.message,stack:error.stack}));page.on('crash',()=>report.errors.push(entry('page-crash')));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({...entry('console'),message:message.text(),location:message.location()})});
 page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/advice'))requestViews.set(request,{clientTick:state.snapshot?.tick,observedAt:new Date().toISOString()})});
 page.on('response',async response=>{const record=activeRecord,pathname=new URL(response.url()).pathname;if(pathname==='/api/v1/history'&&response.ok()){try{const values=await response.json();(record.historyResponses??=[]).push({player,time:new Date().toISOString(),matchIDs:values.map(value=>value.id)})}catch(error){report.errors.push({...entry('history-response'),message:String(error)})}return}if(response.status()<400)return;const item={...entry('http'),path:pathname,status:response.status()};report.httpErrors.push(item);if(pathname.endsWith('/advice')){const request=response.request();item.requestTiming=request.timing();item.clientAtRequest=requestViews.get(request);item.clientTickAtResponse=state.snapshot?.tick;try{const body=request.postDataJSON();item.adviceRequest={entities:body.entities,orders:body.orders,independent:body.independent}}catch{item.adviceRequest='unreadable'}}try{const body=await response.json();item.code=body.code;item.message=body.message}catch{}});
 page.on('websocket',socket=>{const record=activeRecord;state.sockets++;state.openSockets.add(socket);socket.on('close',()=>state.openSockets.delete(socket));socket.on('framereceived',frame=>{if(record!==activeRecord||typeof frame.payload==='string')return;try{const message=fromBinary(EnvelopeSchema,new Uint8Array(frame.payload)).message;if(message.case==='snapshot'){state.snapshot=message.value;state.firstSnapshot??={tick:message.value.tick,countdown:message.value.countdown}}else if(message.case==='delta')state.snapshot=applyDelta(state.snapshot,message.value);else if(message.case==='result')state.result=message.value;else if(message.case==='orderResult'){const r=message.value;state.results.set(`${r.sequence}:${r.index}`,r)}if(['snapshot','delta'].includes(message.case)){for(const r of state.snapshot.results)state.results.set(`${r.sequence}:${r.index}`,r);for(const event of state.snapshot.events)state.events.set(String(event.id),{kind:event.kind,tick:event.tick,owner:event.owner,entity:event.entity});for(const entity of state.snapshot.entities)assert(!entity.private||entity.owner===player,'Foreign private data exposed')}}catch(error){report.errors.push({...entry('decoder'),message:error.message})}});socket.on('framesent',frame=>{if(record!==activeRecord||typeof frame.payload==='string')return;try{const message=fromBinary(EnvelopeSchema,new Uint8Array(frame.payload)).message;if(message.case==='orders')state.orders.push(message.value)}catch(error){report.errors.push({...entry('outgoing-decoder'),message:error.message})}})});return state;
}
function resetRound(){for(const frame of frames){assert.equal(frame.openSockets.size,0);frame.snapshot=undefined;frame.result=undefined;frame.firstSnapshot=undefined;frame.results.clear();frame.orders=[];frame.events.clear()}}
async function lifetime(index){return {app:await pages[index].evaluate(()=>window.multiplayerCombat.lifetime()),page:await pages[index].evaluate(()=>window.rematchPageTelemetry()),navigationCount:frames[index].navigationCount,openSockets:frames[index].openSockets.size}}
class Commander {
 constructor(page,frame,record,player){this.page=page;this.frame=frame;this.record=record;this.player=player;this.failedBuilds=new Map();this.lastAttack=new Map();this.lastBuild=0;this.lastLog=0;this.started=false;this.search=0;this.lastSearch=0;this.busy=false;this.adviceErrors=0}
 get view(){return this.frame.snapshot}
 async send(orders,note){if(!orders.length)return;const tick=this.view.tick;const sequence=await this.page.evaluate(orders=>window.multiplayerCombat.send(orders),orders);await until(()=>orders.every((_o,i)=>this.frame.results.has(`${sequence}:${i}`)),'Missing command receipts',10000);const receipts=orders.map((_o,i)=>this.frame.results.get(`${sequence}:${i}`));const item={player:this.player,tick,sequence,note,orders,receipts};await appendFile(path.join(runDir,`${this.record.id}-commands.jsonl`),json(item).replaceAll('\n','')+'\n');this.record.commands++;return receipts}
 async advice(ids,orders=[],independent=false){try{return await this.page.evaluate(async({ids,orders,independent})=>window.multiplayerCombat.advice(ids,orders,independent),{ids,orders,independent})}catch(error){if(/advice|Wait for|selection|current command|provide current|current selection/i.test(error.message)){this.adviceErrors++;return}throw error}}
 async construct(type,rig,base,view){
  if(view.tick-this.lastBuild<40)return;this.lastBuild=view.tick;
  const center=type==='supply'?[...map.fields].sort((a,b)=>distance(a.position,base)-distance(b.position,base))[0].position:base;
  const positions=[];
  // Candidate points, not a placement validator: every decision goes to Go.
  for(let radius=4500;radius<=16500;radius+=2000)for(const [x,y] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]){const position={x:Math.floor((center.x+x*radius)/1000)*1000+500,y:Math.floor((center.y+y*radius)/1000)*1000+500};if(position.x>3000&&position.y>3000&&position.x<map.width*1000-3000&&position.y<map.height*1000-3000){const key=`${type}:${position.x}:${position.y}`;if(view.tick-(this.failedBuilds.get(key)??-10000)>600)positions.push(position)}}
  positions.sort((a,b)=>type==='supply'?distance(a,center)+distance(a,base)*.3-distance(b,center)-distance(b,base)*.3:distance(a,base)-distance(b,base));
  for(let offset=0;offset<positions.length;offset+=24){const choices=positions.slice(offset,offset+24).map(position=>({kind:'build',entities:[rig.id],type,position})),advice=await this.advice([],choices,false);if(!advice)return;const index=advice.results.findIndex(r=>r.accepted);if(index<0)continue;const choice=choices[index],receipts=await this.send([choice],'Go-previewed paid construction');if(receipts?.[0].accepted)return;this.failedBuilds.set(`${type}:${choice.position.x}:${choice.position.y}`,view.tick);return}
 }
 async step(){const view=this.view;if(!view||view.countdown||view.outcome?.finished)return;const me=view.players.find(p=>p.id===this.player);if(me?.defeated)return;const own=view.entities.filter(e=>e.owner===this.player),units=own.filter(e=>rules.units.some(u=>u.id===e.type)),hq=own.find(e=>e.type==='hq'),base=hq?.position??map.spawns[this.player-1].position;const building=(type,complete=true)=>own.filter(e=>e.type===type&&(!complete||e.complete)),rig=units.find(e=>e.type===me.faction+'.rig'&&!e.private?.orders.length),funds=Number(view.economy?.credits??0);const pending=own.some(e=>rules.buildings.some(b=>b.id===e.type)&&!e.complete);
  if(!this.started){this.started=true;this.record.clients.push({player:this.player,faction:me.faction,team:me.team,openingTick:view.tick,base,assets:JSON.parse(await this.page.evaluate(()=>window.multiplayerCombat.info())).assets});const scout=units.find(e=>e.type===me.faction+'.rifle');if(scout){const field=[...map.fields].sort((a,b)=>distance(a.position,base)-distance(b.position,base))[0];await this.send([{kind:'move',entities:[scout.id],position:field.position}],'Ordinary field scouting')}}
  let buildType;
  if(!building('power',false).length)buildType='power';else if(!building('supply',false).length)buildType='supply';else if(!building('barracks',false).length)buildType='barracks';else if(view.economy.powerCapacity-view.economy.powerDemand<30)buildType='power';else if(!building('factory',false).length&&funds>=2200000)buildType='factory';else if(building('factory').length&&building('barracks',false).length<2&&funds>=1600000)buildType='barracks';
  if(rig&&!pending&&buildType&&funds>=(rules.buildings.find(b=>b.id===buildType)?.cost??Infinity)){await this.construct(buildType,rig,base,view);return}
  const train=[];let budget=funds;const supply=building('supply')[0];const haulers=units.filter(e=>e.type===me.faction+'.hauler').length+(supply?.private?.jobs.filter(j=>j.type===me.faction+'.hauler').length??0);
  if(supply&&haulers<3&&budget>=900000&&supply.private?.jobs.length===0){train.push({kind:'train',entities:[supply.id],type:me.faction+'.hauler'});budget-=900000}
  // Keep ordinary economics ahead of optional army spending.
  if(building('supply').length&&building('barracks').length){const reserve=building('factory').length?0:1500000;
   for(const producer of [...building('factory'),...building('barracks')]){if(producer.private?.jobs.length||budget<reserve+300000||view.economy.supply+view.economy.reservedSupply>=96)continue;let type;if(producer.type==='factory'){const tanks=units.filter(e=>e.type===me.faction+'.tank').length,aas=units.filter(e=>e.type===me.faction+'.aa').length;type=aas<Math.floor(tanks/3)?me.faction+'.aa':me.faction+'.tank'}else{const rifles=units.filter(e=>e.type===me.faction+'.rifle').length,ats=units.filter(e=>e.type===me.faction+'.at').length;type=ats<Math.ceil(rifles*.65)?me.faction+'.at':me.faction+'.rifle'}const u=rules.units.find(u=>u.id===type);if(u&&u.cost+reserve<=budget){train.push({kind:'train',entities:[producer.id],type});budget-=u.cost}}
  }
  if(train.length)await this.send(train,'Paid producer queues');
  const army=units.filter(e=>{const u=rules.units.find(u=>u.id===e.type);return u?.weapon&&['rifle','at','tank','aa','recon'].includes(u.role)&&!e.private?.container});
  const foes=view.players.filter(p=>p.team!==me.team&&!p.defeated);if(!foes.length)return;const enemyIDs=new Set(foes.map(p=>p.id)),seen=view.entities.filter(e=>enemyIDs.has(e.owner));
  let destination=map.spawns[foes[0].id-1].position;
  const valuable=seen.filter(e=>rules.buildings.find(b=>b.id===e.type)?.qualifying||e.type.endsWith('.rig'));
  if(valuable.length){valuable.sort((a,b)=>distance(a.position,base)-distance(b.position,base));destination=valuable[0].position}
  if(!this.record.ownershipRejections?.some(r=>r.player===this.player)&&seen.length){const receipts=await this.send([{kind:'stop',entities:[seen[0].id]}],'Expected rejection: cannot command visible enemy');assert.equal(receipts[0].accepted,false);assert.equal(receipts[0].code,'not_owner');(this.record.ownershipRejections??=[]).push({player:this.player,tick:view.tick,target:seen[0].id,code:receipts[0].code})}
  const threats=seen.filter(e=>rules.units.find(u=>u.id===e.type)?.weapon&&distance(e.position,base)<18000);
  if(threats.length)destination=threats[0].position;
  const attacking=army.length>=8||view.tick>7200||threats.length>0;
  if(attacking){
   if(!valuable.length&&army.some(e=>distance(e.position,destination)<3000)&&view.tick-this.lastSearch>400){this.search++;this.lastSearch=view.tick;const offset=[[0,0],[9000,0],[0,9000],[-9000,0],[0,-9000],[15000,15000],[-15000,15000],[-15000,-15000],[15000,-15000]][this.search%9];destination={x:Math.max(1000,Math.min(map.width*1000-1000,destination.x+offset[0])),y:Math.max(1000,Math.min(map.height*1000-1000,destination.y+offset[1]))}}
   const ready=army.filter(e=>{const previous=this.lastAttack.get(e.id),order=e.private?.orders[0];return !order||!previous||view.tick-previous.tick>400&&distance(previous.position,destination)>5000});
   if(ready.length){const enemyArmy=seen.filter(e=>rules.units.find(u=>u.id===e.type)?.weapon);const target=valuable.find(e=>distance(e.position,destination)<100&&!enemyArmy.some(enemy=>distance(enemy.position,e.position)<12000)),orders=[];for(let i=0;i<ready.length;i+=60)orders.push(target?{kind:'attack',entities:ready.slice(i,i+60).map(e=>e.id),target:target.id}:{kind:'attack_move',entities:ready.slice(i,i+60).map(e=>e.id),position:destination});const receipts=await this.send(orders,'Visible target attack / public-spawn attack-move');if(receipts?.some(r=>r.accepted))for(const e of ready)this.lastAttack.set(e.id,{tick:view.tick,position:destination})}
  }
 }
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Preserve the reviewed commander verbatim. Its choices inspect only its own
// authorized snapshot plus the public map/catalog, and are validated by Go.
report.commanderSHA256=sha(source.subarray(source.indexOf('class Commander {'),source.indexOf('const distance=')));

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
  await until(async()=>{current=await lifetime(index);try{assertReleasedAtMenu(initial[index],current);return true}catch(error){lastError=error;return false}},`Player ${index+1} did not release the old match at ${label}`,30000).catch(error=>{throw new Error(error.message+': '+lastError?.message)});
  checks.push(current);assert.equal(await pages[index].getByLabel('Your profile ID').inputValue(),report.profiles[index],'Profile changed across rematch');
  await capture(pages[index],`${label}-player-${index+1}`);
 }
 report.boundaries.push({label,time:new Date().toISOString(),players:checks});await saveReport();return checks;
}
async function startRound(record,initial){
 activeRecord=record;phase=record.phase='readiness';
 record.lobby=await pages[0].getByLabel('Current lobby ID').inputValue();
 for(let index=0;index<pages.length;index++){
  await pages[index].getByLabel(`Commander ${index+1} faction`,{exact:true}).selectOption(['US','IR'][index]);await idle(pages[index]);
 }
 await until(async()=>await pages[0].locator('.network-commander').count()===2,'Rematch roster incomplete');await sleep(2200);
 assert(await pages[0].getByRole('button',{name:'Start operation',exact:true}).isDisabled());record.startBlockedBeforeReady=true;
 for(let index=0;index<pages.length;index++){
  await pages[index].getByRole('button',{name:'Ready to deploy',exact:true}).click();await idle(pages[index]);
  if(index===0)assert(await pages[0].getByRole('button',{name:'Start operation',exact:true}).isDisabled());
 }
 await until(()=>pages[0].getByRole('button',{name:'Start operation',exact:true}).isEnabled(),'Readiness did not unlock start');
 await capture(pages[0],`${record.id}-lobby`);await pages[0].getByRole('button',{name:'Start operation',exact:true}).click();
 for(const page of pages){await page.getByRole('complementary',{name:'Command sidebar'}).waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'})}
 await until(()=>frames.every(frame=>frame.snapshot?.tick>130),'Countdown did not finish',90000);
 record.startLifetime=await Promise.all(pages.map((_page,index)=>lifetime(index)));
 for(let index=0;index<pages.length;index++){
  assertSameApplication(initial[index],record.startLifetime[index]);assert.equal(record.startLifetime[index].app.kind,'online');
  assert.equal(frames[index].snapshot.player,index+1);assert.equal(frames[index].snapshot.players.length,2);assert.equal(frames[index].snapshot.players[index].faction,['US','IR'][index]);
  const previous=report.cases.at(-2);if(previous)assert.notEqual(record.startLifetime[index].app.session,previous.startLifetime[index].app.session,'Old match session reused');
 }
 record.initialSnapshots=frames.map(frame=>frame.firstSnapshot);await saveReport();
}
async function reconnect(record){
 const index=record.round%2===1?0:1,page=pages[index],frame=frames[index];
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
 let lastLog=0,lastCapture=0;const started=Date.now(),wallLimit=Number(process.env.FRONTLINE_COMBAT_MINUTES??60)*60000;
 assert(Number.isFinite(wallLimit)&&wallLimit>0);
 while(!frames.some(frame=>frame.result?.committed||frame.snapshot?.outcome?.finished)){
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
 record.adviceRetries=commanders.map(commander=>({player:commander.player,count:commander.adviceErrors}));
}
async function collectResultAndArchive(record){
 phase=record.phase='committed-result';let result;
 await until(async()=>{result=frames.find(frame=>frame.result?.committed)?.result??JSON.parse(await pages[0].evaluate(()=>window.multiplayerCombat.info())).result;return result?.committed},'No committed result',30000);
 assert.equal(result.outcome.reason,'elimination');assert.equal(result.outcome.draw,false);record.result=result;
 assert(record.reconnect,'No live reconnect was exercised');
 assert.equal(new Set(record.ownershipRejections?.map(value=>value.player)).size,2,'Both human ownership rejections required');
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
 const child=spawn(auditor,['-replay',path.join(runDir,`${record.id}.replay.gz`),'-out',output],{cwd:root,stdio:['ignore','pipe','pipe']});
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
 for(const file of ['wasm_exec.js','worker.js','version.json']){const bytes=await readFile(path.join(product,'runtime',file));report.actualBuild[file]={bytes:bytes.length,sha256:sha(bytes)}}
 report.actualBuild.decoder=sha(await readFile(path.join(buildDir,'decode.mjs')));
 server=await hostStart();report.origin=server.origin;
 browser=await chromium.launch({headless:report.headless,...(!report.headless?{channel:'chromium'}:{})});report.browser=browser.version();
 const gpuSession=await browser.newBrowserCDPSession();try{report.gpu=(await gpuSession.send('SystemInfo.getInfo')).gpu}finally{await gpuSession.detach()}
 if(!report.headless){const renderer=report.gpu.auxAttributes?.glRenderer??'';assert.match(renderer,/Metal|Apple/i);assert.doesNotMatch(renderer,/SwiftShader|software/i)}
 activeRecord={id:'round-1',round:1,status:'running',clients:[],commands:0};report.cases.push(activeRecord);
 for(let index=0;index<2;index++){
  const context=await browser.newContext({viewport:{width:index?1280:1600,height:index?720:900},acceptDownloads:true});contexts.push(context);await context.addInitScript(pageTelemetry);
  const page=await context.newPage();pages.push(page);page.setDefaultTimeout(90000);frames.push(observe(page,index+1));
  await page.goto(server.origin);assert.equal(await page.title(),'Frontline Command');
  assert(await page.evaluate(()=>typeof window.multiplayerCombat?.lifetime==='function'&&typeof window.multiplayerCombat?.replays==='function'),'Frozen build lacks the readonly lifetime/archive hooks. Prepare the next integrated freeze first.');
  await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await idle(page);
  await page.getByLabel('Commander name',{exact:true}).fill(`Rematch commander ${index+1}`);await page.getByRole('button',{name:'Create local profile',exact:true}).click();await page.getByLabel('Your profile ID').waitFor();await idle(page);
 }
 report.profiles=await Promise.all(pages.map(page=>page.getByLabel('Your profile ID').inputValue()));assert.equal(new Set(report.profiles).size,2);
 rules=JSON.parse(await pages[0].evaluate(()=>window.multiplayerCombat.catalog()));assert(Array.isArray(rules.units)&&Array.isArray(rules.buildings));
 assert.equal(await pages[1].evaluate(()=>window.multiplayerCombat.catalog()),await pages[0].evaluate(()=>window.multiplayerCombat.catalog()));report.catalogSHA256=sha(json(rules));
 const initial=await Promise.all(pages.map((_page,index)=>lifetime(index)));report.initialLifetime=initial;
 for(const value of initial){assert.equal(value.app.phase,'menu');assert.equal(value.app.transportPresent,false);assert.equal(value.openSockets,0);assert.equal(value.navigationCount,1)}
 const host=pages[0];await host.getByLabel('Operation name',{exact:true}).fill('Two consecutive ordinary operations');await host.getByLabel('Lobby battlefield',{exact:true}).selectOption('industrial-valley');await host.getByLabel('Battle format',{exact:true}).selectOption('1v1');await host.getByLabel('Host faction',{exact:true}).selectOption('US');await host.getByRole('button',{name:'Create operation',exact:true}).click();await idle(host);
 await pages[1].getByLabel('Join lobby ID').fill(await host.getByLabel('Current lobby ID').inputValue());await pages[1].getByRole('button',{name:'Join by ID',exact:true}).click();await idle(pages[1]);
 for(let round=1;round<=2;round++){
  const record=activeRecord;await startRound(record,initial);await ordinaryCombat(record);await collectResultAndArchive(record);
  if(round===1){
   phase=record.phase='hosted-rematch';await openOperationMenu(host);await host.getByRole('button',{name:'Create rematch lobby',exact:true}).first().click();await idle(host);await commandCenter(host);
   const rematch=await host.getByLabel('Current lobby ID').inputValue();assert.notEqual(rematch,record.lobby);assert(await host.getByRole('button',{name:'Start operation',exact:true}).isDisabled());
   record.rematch={id:rematch,requiresNewReadiness:true};await commandCenter(pages[1]);
   await pages[1].getByRole('button',{name:'Close completed lobby',exact:true}).click();await idle(pages[1]);
   await menuBoundary('between-matches',initial);resetRound();
   activeRecord={id:'round-2',round:2,status:'running',clients:[],commands:0};report.cases.push(activeRecord);
   await pages[1].getByLabel('Join lobby ID').fill(rematch);await pages[1].getByRole('button',{name:'Join by ID',exact:true}).click();await idle(pages[1]);
  }else{
   for(const page of pages)await commandCenter(page);await menuBoundary('after-two-matches',initial);
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
 if(server)report.hostExit=await server.close();report.browserAndHostClosed=new Date().toISOString();await saveReport();console.log('Browser and host closed; native audit may follow:',runDir);
}
// Independent replay/save checks run after every browser/host has closed, even
// if a strict earlier HTTP error already makes the overall acceptance fail.
phase='native-audit';
for(const record of report.cases.filter(value=>value.replay)){
 try{await nativeAudit(record)}catch(error){record.nativeFailure=String(error.stack??error);record.status='failed'}
}
report.combatStatus=report.cases.length===2&&report.cases.every(record=>record.nativeStatus==='passed')?'passed':'failed';
if(report.cases.length===2&&report.cases.every(record=>record.duration))report.longSessions=pairDuration(report.cases.map(record=>record.duration));
report.strictStatus=report.errors.length===0&&report.httpErrors.length===0?'passed':'failed';
report.status=!report.browserFailure&&report.lifecycleStatus==='passed'&&report.combatStatus==='passed'&&report.strictStatus==='passed'&&report.longSessions?.complete?'passed':'failed';
report.completed=new Date().toISOString();phase='complete';await saveReport();
if(report.status!=='passed')process.exitCode=1;
console.log(json({status:report.status,combat:report.combatStatus,lifecycle:report.lifecycleStatus,strict:report.strictStatus,longSessions:report.longSessions,runDir}));
