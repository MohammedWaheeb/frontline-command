// Actual product controls only. Browser plugin not available; installed Playwright.
// WebSocket inspection is passive: no test API, simulated orders or world edits.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {prepareProduct,root,evidence,buildDir,product} from './multiplayer-product-build.mjs';

const build=await prepareProduct(),runDir=path.join(evidence,new Date().toISOString().replaceAll(':','-'));
await mkdir(runDir,{recursive:true});
const {fromBinary,EnvelopeSchema,applyDelta}=await import(pathToFileURL(path.join(buildDir,'decode.mjs')));
const map=JSON.parse(await readFile(path.join(product,'content/maps/industrial-valley.json'),'utf8'));
const rules=JSON.parse(await readFile(path.join(root,'pkg/content/rules.json'),'utf8'));
const factions=['US','IR','SY','SA'];
const definitions=[
 {id:'1',humans:1,bots:0,mode:'custom'},
 {id:'1ai',humans:1,bots:1,mode:'custom'},
 {id:'2',humans:2,bots:0,mode:'custom'},
 {id:'2ai',humans:2,bots:2,mode:'custom'},
 {id:'3',humans:3,bots:0,mode:'ffa'},
 {id:'4',humans:4,bots:0,mode:'2v2'},
];
const selected=process.env.FRONTLINE_RENDERED_CASE?.split(',')??definitions.map(value=>value.id);
assert.ok(selected.every(id=>definitions.some(value=>value.id===id)),'Unknown case');
const holdAdvice=process.env.FRONTLINE_RENDERED_HOLD_ADVICE==='1';
if(holdAdvice)assert.deepEqual(selected,['3'],'Delayed advice proof is an explicit three-human case');
const browser=await chromium.launch({headless:true});
const report={started:new Date().toISOString(),browser:browser.version(),browserPlugin:'not available; installed Playwright Chromium',viewports:[{width:1600,height:900},{width:1280,height:720}],build,scope:'Rendered product using independent loopback browser contexts, actual Go host and standard commands. Deliberate surrender completes lifecycle; this is not combat victory, full AI strategy, final-art, physical-LAN or reference-device performance acceptance.',cases:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message,timeout=30000){const started=Date.now();while(!await check()){if(Date.now()-started>timeout)throw Error(message);await pause(100)}}
async function idle(page){await until(async()=>await page.locator('.network-operation,.loading-screen').count()===0,'Operation remained busy',90000);if(await page.locator('.network-error').count())throw Error(await page.locator('.network-error').allInnerTexts());if(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).count())throw Error(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).innerText())}
async function serverStart(id){
 const data=await mkdtemp(path.join(tmpdir(),'frontline-rendered-multiplayer-'));
 const child=spawn(path.join(buildDir,'frontline'),['-addr','127.0.0.1:0','-data',data,'-static',product,'-maps',path.join(product,'content/maps'),'-missions',path.join(product,'content/missions')],{cwd:root,stdio:['ignore','pipe','pipe']});let log='';
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Host startup timeout')),20000);child.stdout.on('data',bytes=>{log+=bytes;const found=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(found){clearTimeout(timer);resolve(found[0])}});child.stderr.on('data',bytes=>log+=bytes);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Host exited ${code}`))})});
 return {origin,async close(){if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await stopped}await writeFile(path.join(runDir,`host-${id}.log`),log);await rm(data,{recursive:true,force:true})}};
}
function observe(page,record,index){
 const state={snapshot:undefined,receipts:new Map(),orders:[],sockets:0,result:undefined,status:undefined,requests:new WeakMap()};
 const requests=state.requests;
 const snapshotState=()=>({tick:state.snapshot?.tick,defeated:state.snapshot?.players.find(value=>value.id===state.snapshot.player)?.defeated??false,finished:state.snapshot?.outcome?.finished??false});
 page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/advice')){const item={player:index+1,path:new URL(request.url()).pathname,started:Date.now(),phase:record.phase,initial:snapshotState()};requests.set(request,item);record.adviceRequests.push(item)}});
 page.on('pageerror',error=>record.pageErrors.push({player:index+1,message:error.message}));
 page.on('console',message=>{if(['error','warning'].includes(message.type()))record.console.push({player:index+1,level:message.type(),message:message.text()})});
 page.on('requestfailed',request=>{const timing=requests.get(request);if(timing)Object.assign(timing,{failed:Date.now(),failure:request.failure()?.errorText??'unknown',failureState:snapshotState()})});
 page.on('response',async response=>{const timing=requests.get(response.request());if(timing)Object.assign(timing,{responded:Date.now(),status:response.status(),responseState:snapshotState()});if(response.status()>=400)try{record.httpErrors.push({player:index+1,path:new URL(response.url()).pathname,status:response.status(),body:(await response.text()).slice(0,500),timing})}catch{}});
 const receive=value=>{if(typeof value.payload==='string')return;try{const previous=snapshotState();const message=fromBinary(EnvelopeSchema,new Uint8Array(value.payload)).message;if(message.case==='snapshot')state.snapshot=message.value;else if(message.case==='delta')state.snapshot=applyDelta(state.snapshot,message.value);else if(message.case==='result')state.result=message.value;else if(message.case==='status')state.status=message.value;else if(message.case==='orderResult')state.receipts.set(`${message.value.sequence}:${message.value.index}`,message.value);if(['snapshot','delta'].includes(message.case)){for(const receipt of state.snapshot.results)state.receipts.set(`${receipt.sequence}:${receipt.index}`,receipt);const current=snapshotState();if((current.defeated&&!previous.defeated)||(current.finished&&!previous.finished))record.terminalSnapshots.push({player:index+1,received:Date.now(),...current})}}catch(error){record.pageErrors.push({player:index+1,message:'Passive decoder: '+error.message})}};
 page.on('websocket',socket=>{state.sockets++;socket.on('framereceived',receive);socket.on('framesent',value=>{if(typeof value.payload==='string')return;try{const message=fromBinary(EnvelopeSchema,new Uint8Array(value.payload)).message;if(message.case==='orders')state.orders.push(message.value)}catch(error){record.pageErrors.push({player:index+1,message:'Passive order decoder: '+error.message})}})});
 return state;
}
async function delayedAdvice(page,state,record,player){
 const probe=record.delayedAdvice={player,kind:'Real Go advice200 held at browser response boundary; no payload/status substitution'};let release;const gate=new Promise(resolve=>release=resolve);let used=false;
 const pattern='**/api/v1/matches/*/advice';
 const handler=async route=>{
  if(used){await route.continue();return}used=true;
  const timing=state.requests.get(route.request());assert.ok(timing,'Missing passive request timestamp');probe.requestStarted=timing.started;
  const response=await route.fetch();probe.hostStatus=response.status();probe.hostResponded=Date.now();
  await gate;
  try{await route.fulfill({response})}catch(error){probe.deliveryAfterAbort=String(error.message??error)}finally{await response.dispose()}
 };
 await page.route(pattern,handler);
 try{await until(()=>probe.hostStatus!==undefined,'No advice response to hold',10000);assert.equal(probe.hostStatus,200,'Held response was not accepted by real Go host')}catch(error){release();await page.unroute(pattern,handler);throw error}
 return async()=>{
  try{
   await until(()=>record.terminalSnapshots.some(value=>value.player===player),'Held-advice commander never became terminal',8000);
   const terminal=record.terminalSnapshots.find(value=>value.player===player);probe.terminalReceived=terminal.received;probe.terminalTick=terminal.tick;
   const timing=record.adviceRequests.find(value=>value.player===player&&value.started===probe.requestStarted);assert.ok(timing);
   await until(()=>timing.failed!==undefined,'Pending advice was not aborted after terminal snapshot',5000);
   probe.aborted=timing.failed;probe.failure=timing.failure;probe.elapsedToAbort=probe.aborted-probe.requestStarted;
   assert.equal(timing.failure,'net::ERR_ABORTED');assert.ok(probe.requestStarted<probe.terminalReceived&&probe.aborted>=probe.terminalReceived,'Abort was not ordered after the terminal frame');
   assert.ok(probe.elapsedToAbort<3500,'Cancellation was too close to the independent4second timeout to prove terminal handling');
   assert.equal(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).count(),0);probe.passed=true;
  }finally{release();await page.unroute(pattern,handler)}
 };
}
async function screen(page,name){await page.screenshot({path:path.join(runDir,name+'.png'),fullPage:false})}
async function center(page,position){const mini=await page.getByLabel('Tactical minimap',{exact:true}).boundingBox();assert.ok(mini);await page.mouse.click(mini.x+position.x/(map.width*1000)*mini.width,mini.y+position.y/(map.height*1000)*mini.height);await pause(80)}
async function clickGround(page,position,button='left'){await center(page,position);const canvas=await page.locator('.battlefield-canvas canvas').boundingBox();assert.ok(canvas);await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2,{button})}
async function order(state,kind,action){const baseline=Math.max(0,...state.orders.map(batch=>batch.sequence));await action();let sent,index;await until(()=>{sent=state.orders.find(batch=>batch.sequence>baseline&&batch.orders.some(value=>value.kind===kind));index=sent?.orders.findIndex(value=>value.kind===kind);return !!sent},`UI did not submit ${kind}`,20000);await until(()=>state.receipts.has(`${sent.sequence}:${index}`),`Host did not acknowledge ${kind}`);const receipt=state.receipts.get(`${sent.sequence}:${index}`);assert.equal(receipt.accepted,true,`${kind}: ${receipt.code}`);return {sequence:sent.sequence,index,kind,type:sent.orders[index].type,entities:sent.orders[index].entities,position:sent.orders[index].position?{x:sent.orders[index].position.x,y:sent.orders[index].position.y}:undefined,tick:receipt.tick,code:receipt.code}}
async function production(page,name){const option=page.locator('.production-cameo').filter({hasText:name});await until(()=>option.isEnabled(),`${name} did not become available`);await option.click()}
async function openMenu(page){await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('region',{name:'Online operation controls'}).first().waitFor()}
async function commandCenter(page){const dialogs=page.getByRole('dialog');const command=dialogs.last().getByRole('button',{name:'Command center',exact:true});if(await command.count())await command.click();else{if(!await page.getByRole('button',{name:'Return to command center',exact:true}).count())await openMenu(page);await page.getByRole('button',{name:'Return to command center',exact:true}).click()}await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await idle(page)}

async function scenario(config){
 const record={...config,status:'running',phase:'profiles-and-lobby',surrenderActions:[],pageErrors:[],console:[],httpErrors:[],adviceRequests:[],terminalSnapshots:[],players:[],commands:[],completion:'Deliberate surrender; no combat-victory claim'},server=await serverStart(config.id),contexts=[],pages=[],frames=[];
 try{
  record.origin=server.origin;
  for(let i=0;i<config.humans;i++){
   const context=await browser.newContext({viewport:{width:i%2?1280:1600,height:i%2?720:900},acceptDownloads:true}),page=await context.newPage();contexts.push(context);pages.push(page);frames.push(observe(page,record,i));
   await page.goto(server.origin);assert.equal(await page.title(),'Frontline Command');await page.getByRole('button',{name:'Explore game modes',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await idle(page);await page.getByLabel('Commander name',{exact:true}).fill(`Rendered ${config.id} commander ${i+1}`);await page.getByRole('button',{name:'Create local profile',exact:true}).click();await page.getByLabel('Your profile ID').waitFor();await idle(page);
  }
  const host=pages[0];record.profiles=await Promise.all(pages.map(page=>page.getByLabel('Your profile ID').inputValue()));assert.equal(new Set(record.profiles).size,config.humans);
  await host.getByLabel('Operation name',{exact:true}).fill(`Rendered ${config.id} acceptance`);await host.getByLabel('Lobby battlefield',{exact:true}).selectOption('industrial-valley');await host.getByLabel('Battle format',{exact:true}).selectOption(config.mode);await host.getByLabel('Host faction',{exact:true}).selectOption('US');await host.getByRole('button',{name:'Create operation',exact:true}).click();await idle(host);record.lobby=await host.getByLabel('Current lobby ID').inputValue();
  for(let i=1;i<pages.length;i++){await pages[i].getByLabel('Join lobby ID').fill(record.lobby);await pages[i].getByRole('button',{name:'Join by ID',exact:true}).click();await idle(pages[i])}
  for(let i=0;i<pages.length;i++){await until(()=>pages[i].getByLabel(`Commander ${i+1} faction`,{exact:true}).count(),'Own slot missing');await pages[i].getByLabel(`Commander ${i+1} faction`,{exact:true}).selectOption(factions[i]);await idle(pages[i]);if(config.id==='2ai'||config.id==='4'){await pages[i].getByLabel(`Commander ${i+1} team`,{exact:true}).selectOption(i<2?'1':'2');await idle(pages[i])}}
  for(let i=0;i<config.bots;i++){await host.getByLabel('Add AI faction',{exact:true}).selectOption(factions[config.humans+i]);await host.getByLabel('Add AI difficulty',{exact:true}).selectOption('normal');await host.getByLabel('Add AI team',{exact:true}).selectOption('2');await host.getByRole('button',{name:'Add AI commander',exact:true}).click();await idle(host)}
  await until(async()=>await host.locator('.network-commander').count()===config.humans+config.bots,'Roster count incorrect');await pause(2300);
  assert.equal(await host.getByRole('button',{name:'Start operation',exact:true}).isDisabled(),true);record.startBlockedBeforeReady=true;
  for(let i=0;i<pages.length;i++){await pages[i].getByRole('button',{name:'Ready to deploy',exact:true}).click();await idle(pages[i]);if(i<pages.length-1)assert.equal(await host.getByRole('button',{name:'Start operation',exact:true}).isDisabled(),true)}
  await until(()=>host.getByRole('button',{name:'Start operation',exact:true}).isEnabled(),'Full readiness did not permit start');await host.locator('.network-lobby-heading').scrollIntoViewIfNeeded();await screen(host,`case-${config.id}-lobby-1600`);
  record.phase='active-play';await host.getByRole('button',{name:'Start operation',exact:true}).click();
  for(const page of pages){await page.getByRole('complementary',{name:'Command sidebar'}).waitFor({timeout:90000});await page.locator('.scene-loading').waitFor({state:'hidden',timeout:90000});assert.equal(await page.locator('vite-error-overlay').count(),0)}
  await until(()=>frames.every(state=>state.snapshot?.tick>130&&!state.snapshot.countdown),'Commander snapshots did not advance',60000);
  for(let i=0;i<frames.length;i++){
   const state=frames[i],snapshot=state.snapshot,me=snapshot.players.find(value=>value.id===snapshot.player),hq=snapshot.entities.find(value=>value.owner===snapshot.player&&value.type==='hq'),rig=snapshot.entities.find(value=>value.owner===snapshot.player&&value.type===me.faction+'.rig');assert.equal(snapshot.player,i+1);assert.ok(hq?.position&&rig?.position);assert.deepEqual([...new Set(snapshot.entities.filter(value=>value.private).map(value=>value.owner))],[i+1]);assert.ok(snapshot.visible.some(Boolean)&&snapshot.visible.some(value=>!value));assert.equal(new Set(snapshot.players.map(value=>value.color)).size,snapshot.players.length);
   for(const other of snapshot.players)if(other.team!==me.team)assert.equal(snapshot.entities.some(value=>value.owner===other.id&&value.type==='hq'),false,'Unseen enemy HQ leaked');
   record.players.push({player:me.id,faction:me.faction,team:me.team,color:me.color,tick:snapshot.tick,privateOwners:[me.id],hq:{x:hq.position.x,y:hq.position.y},rig:rig.id,initialRig:{x:rig.position.x,y:rig.position.y},initialEntityIDs:snapshot.entities.filter(value=>value.owner===me.id).map(value=>value.id)});
   await screen(pages[i],`case-${config.id}-player-${i+1}-opening`);
  }
  // All clicks target public map coordinates or this commander's authorized entities.
  // Go remains the sole build/path/production legality authority.
  for(let i=0;i<pages.length;i++){
   const page=pages[i],p=record.players[i],sx=p.hq.x<80000?1:-1,sy=p.hq.y<80000?1:-1;p.power={x:p.hq.x-sx*5000,y:p.hq.y};p.barracks={x:p.hq.x,y:p.hq.y-sy*5000};
   await page.getByRole('button',{name:'Build',exact:true}).click();record.commands.push({player:i+1,...await order(frames[i],'move',()=>clickGround(page,{x:p.hq.x+sx*4500,y:p.hq.y+sy*4500},'right'))});
  }
  await until(()=>frames.every((state,i)=>{const rig=state.snapshot.entities.find(value=>value.id===record.players[i].rig);return rig&&Math.hypot(rig.position.x-record.players[i].initialRig.x,rig.position.y-record.players[i].initialRig.y)>1000}),'Accepted rigs did not move');
  for(let i=0;i<pages.length;i++){await pages[i].getByRole('button',{name:'Build',exact:true}).click();record.commands.push({player:i+1,...await order(frames[i],'build',async()=>{await production(pages[i],'Power station');await clickGround(pages[i],record.players[i].power)})})}
  await until(()=>frames.every(state=>state.snapshot.entities.some(value=>value.owner===state.snapshot.player&&value.type==='power'&&value.complete)),'Paid power construction did not finish',90000);
  for(let i=0;i<pages.length;i++){await pages[i].getByRole('button',{name:'Build',exact:true}).click();record.commands.push({player:i+1,...await order(frames[i],'build',async()=>{await production(pages[i],'Barracks');await clickGround(pages[i],record.players[i].barracks)})})}
  await until(()=>frames.every(state=>state.snapshot.entities.some(value=>value.owner===state.snapshot.player&&value.type==='barracks'&&value.complete)),'Paid barracks construction did not finish',90000);
  for(let i=0;i<pages.length;i++){
   const page=pages[i],p=record.players[i];await page.locator('.battlefield-canvas canvas').focus();await page.keyboard.press('Control+KeyA');await page.locator('.unit-subgroups button').filter({hasText:/^Barracks/}).click();const rifle=rules.units.find(value=>value.id===p.faction+'.rifle');record.commands.push({player:i+1,...await order(frames[i],'train',()=>production(page,rifle.name))});
  }
  await until(()=>frames.every((state,i)=>state.snapshot.entities.some(value=>value.owner===state.snapshot.player&&value.type===record.players[i].faction+'.rifle'&&!record.players[i].initialEntityIDs.includes(value.id))),'Paid rifle training did not finish',60000);
  for(let i=0;i<pages.length;i++){record.players[i].trainedRifles=frames[i].snapshot.entities.filter(value=>value.owner===i+1&&value.type===record.players[i].faction+'.rifle').map(value=>value.id);await pages[i].getByRole('button',{name:'HQ',exact:true}).click();await screen(pages[i],`case-${config.id}-player-${i+1}-built-and-trained`)}
  await host.setViewportSize({width:1280,height:720});await screen(host,`case-${config.id}-battlefield-1280`);assert.equal(await host.locator('body').evaluate(element=>element.scrollWidth>innerWidth+2),false);await host.setViewportSize({width:1600,height:900});
  const reconnectIndex=pages.length-1,reconnectPage=pages[reconnectIndex],reconnectFrame=frames[reconnectIndex],prior={sockets:reconnectFrame.sockets,tick:reconnectFrame.snapshot.tick,sequence:reconnectFrame.snapshot.economy.lastSequence};await openMenu(reconnectPage);await reconnectPage.getByRole('button',{name:'Reconnect',exact:true}).click();await idle(reconnectPage);await until(()=>reconnectFrame.sockets>prior.sockets&&reconnectFrame.snapshot.tick>=prior.tick,'Reconnect did not restore commander');assert.equal(reconnectFrame.snapshot.player,reconnectIndex+1);assert.ok(reconnectFrame.snapshot.economy.lastSequence>=prior.sequence);await reconnectPage.getByRole('button',{name:'Return to battlefield',exact:true}).click();await reconnectPage.getByRole('button',{name:'Build',exact:true}).click();const afterReconnect=await order(reconnectFrame,'stop',()=>reconnectPage.getByRole('button',{name:'Stop',exact:true}).click());assert.ok(afterReconnect.sequence>prior.sequence);record.commands.push({player:reconnectIndex+1,...afterReconnect});record.reconnect={player:reconnectIndex+1,oldTick:prior.tick,newTick:reconnectFrame.snapshot.tick,oldSequence:prior.sequence,newSequence:afterReconnect.sequence};
  record.phase='surrender';for(const page of pages)await openMenu(page);
  const losing=config.humans===1?[0]:config.id==='2ai'||config.id==='4'?[0,1]:Array.from({length:config.humans-1},(_,i)=>i);
  for(const i of losing){const page=pages[i];record.surrenderActions.push({player:i+1,started:Date.now(),tick:frames[i].snapshot.tick});if(config.id==='4'){await page.getByRole('button',{name:'Vote team surrender',exact:true}).click();await idle(page);if(i===0){await until(()=>frames[0].snapshot.players.some(value=>value.id===1&&value.surrenderVote),'First surrender vote missing');assert.equal(frames[0].snapshot.outcome?.finished,false)}}else{await page.getByRole('button',{name:'Surrender…',exact:true}).click();const finishDelay=holdAdvice&&i===losing[0]?await delayedAdvice(page,frames[i],record,i+1):undefined;await page.getByRole('button',{name:'Confirm surrender',exact:true}).click();if(finishDelay)await finishDelay();await idle(page)}}
  await until(()=>frames.some(value=>value.result?.committed),'No durable surrender result',30000);const result=frames.find(value=>value.result?.committed).result;record.outcome={winningTeam:result.outcome.winningTeam,draw:result.outcome.draw,reason:result.outcome.reason,committed:true};
  await until(async()=>{const visible=await Promise.all(pages.map(page=>page.locator('.network-result').allTextContents()));return visible.every(text=>text.some(value=>value.includes(result.outcome.draw?'Draw':result.outcome.winningTeam?`Team ${result.outcome.winningTeam} victorious`:'Operation failed')))},'A commander did not display the committed result',30000);
  if(config.bots){const debrief=frames.find(value=>value.snapshot?.debrief)?.snapshot.debrief;assert.ok(debrief);record.botSpend=debrief.players.filter(value=>value.player>config.humans).map(value=>({player:value.player,spent:Number(value.spent),structures:value.structuresBuilt}));assert.equal(record.botSpend.length,config.bots);assert.ok(record.botSpend.every(value=>value.spent>0),'AI made no paid progress')}
  for(let i=0;i<pages.length;i++)await screen(pages[i],`case-${config.id}-player-${i+1}-surrender-result`);
  record.phase='rematch';await host.getByRole('dialog').last().getByRole('button',{name:'Create rematch lobby',exact:true}).click();await idle(host);await commandCenter(host);const rematchID=await host.getByLabel('Current lobby ID').inputValue();assert.notEqual(rematchID,record.lobby);assert.equal(await host.getByRole('button',{name:'Start operation',exact:true}).isDisabled(),true);record.rematch={id:rematchID,newFormingLobby:true,requiresReady:true};
  for(let i=1;i<pages.length;i++){await commandCenter(pages[i]);if(await pages[i].getByRole('button',{name:'Close completed lobby',exact:true}).count()){await pages[i].getByRole('button',{name:'Close completed lobby',exact:true}).click();await idle(pages[i])}await pages[i].getByLabel('Join lobby ID').fill(rematchID);await pages[i].getByRole('button',{name:'Join by ID',exact:true}).click();await idle(pages[i])}
  await until(()=>host.locator('.network-commander').count().then(count=>count===config.humans+config.bots),'Rematch roster did not refill');await host.locator('.network-lobby-heading').scrollIntoViewIfNeeded();await screen(host,`case-${config.id}-rematch`);
  for(const page of pages){await page.getByRole('button',{name:'Leave lobby',exact:true}).click();await idle(page);await page.getByRole('button',{name:'Skirmish',exact:true}).click()}
  for(const request of record.adviceRequests){assert.equal(request.initial.defeated||request.initial.finished,false,'New advice began from an inactive commander snapshot');const terminal=record.terminalSnapshots.find(value=>value.player===request.player);if(terminal)assert.ok(request.started<=terminal.received,'New advice began after a terminal commander snapshot')}
  record.terminalAdvice={newRequestsAfterTerminal:0,inflightAborts:record.adviceRequests.filter(request=>request.failure==='net::ERR_ABORTED'&&record.terminalSnapshots.some(terminal=>terminal.player===request.player&&request.started<=terminal.received&&request.failed>=terminal.received)).length};
  assert.deepEqual(record.pageErrors,[]);assert.deepEqual(record.httpErrors,[]);assert.deepEqual(record.console.filter(value=>value.level==='error'),[]);record.status='passed';console.log(`Rendered product ${config.id}: passed`);
 }catch(error){record.status='failed';record.error=String(error.stack??error);record.frames=frames.map(state=>({tick:state.snapshot?.tick,player:state.snapshot?.player,outcome:state.snapshot?.outcome,orders:state.orders.map(batch=>({sequence:batch.sequence,orders:batch.orders.map(value=>({kind:value.kind,type:value.type,entities:value.entities,position:value.position?{x:value.position.x,y:value.position.y}:undefined}))})),receipts:[...state.receipts.values()].map(value=>({sequence:value.sequence,index:value.index,accepted:value.accepted,code:value.code,tick:value.tick}))}));for(let i=0;i<pages.length;i++){await screen(pages[i],`case-${config.id}-failure-${i+1}`).catch(()=>{});await writeFile(path.join(runDir,`case-${config.id}-failure-${i+1}.txt`),await pages[i].locator('body').innerText().catch(()=>''))}console.error(record.error);process.exitCode=1;
 }finally{for(const context of contexts)await context.close();await server.close();report.cases.push(record);await writeFile(path.join(runDir,'results.json'),JSON.stringify(report,null,2)+'\n')}
 return record.status==='passed';
}
try{for(const config of definitions.filter(value=>selected.includes(value.id)))if(!await scenario(config))break}finally{report.completed=new Date().toISOString();report.status=report.cases.length===selected.length&&report.cases.every(value=>value.status==='passed')?'passed':'failed';await browser.close();await writeFile(path.join(runDir,'results.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(evidence,'latest.json'),JSON.stringify({run:runDir,status:report.status},null,2)+'\n');console.log('Rendered multiplayer evidence: '+runDir)}
