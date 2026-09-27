import {chromium,firefox,webkit} from 'playwright-core';
import {build} from 'esbuild';
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile,mkdtemp,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {map,scenario} from '../../tests/runtime/scenario.mjs';
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),root=path.dirname(client);
const evidence=path.join(root,'work/evidence/runtime');await mkdir(evidence,{recursive:true});
execFileSync(process.execPath,[path.join(client,'scripts/runtime/build.mjs')],{stdio:'inherit'});
execFileSync('go',['build','-o',path.join(root,'bin/frontline'),'./cmd/frontline'],{cwd:root,stdio:'inherit'});
const staticDir=path.join(evidence,'host');await mkdir(staticDir,{recursive:true});
try{await symlink(path.join(client,'public/runtime'),path.join(staticDir,'runtime'),'dir')}catch(e){if(e.code!=='EEXIST')throw e}
try{await symlink(path.join(client,'public/service-worker.js'),path.join(staticDir,'service-worker.js'),'file')}catch(e){if(e.code!=='EEXIST')throw e}
await build({entryPoints:[path.join(client,'src/runtime/index.ts')],outfile:path.join(staticDir,'harness.js'),bundle:true,format:'iife',globalName:'FrontlineTest',platform:'browser',target:'es2022'});
// Nonvisual test host; no product UI is implemented here.
await writeFile(path.join(staticDir,'index.html'),'<!doctype html><meta charset="utf-8"><title>Frontline runtime integration test</title><link rel="icon" href="data:,"><script src="/harness.js"></script>');
const pack={id:'integration-core',version:'1',files:[]};
for(const file of ['index.html','harness.js','runtime/worker.js','runtime/wasm_exec.js','runtime/frontline.wasm','runtime/version.json']){const data=await readFile(path.join(staticDir,file));pack.files.push({path:'/'+file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')})}
const scenarioPath=path.join(evidence,'scenario.json');await writeFile(scenarioPath,JSON.stringify(scenario));
const native=JSON.parse(execFileSync(path.join(root,'bin/runtime-native'),['-scenario',scenarioPath],{encoding:'utf8'}));
await writeFile(path.join(evidence,'native-result.json'),JSON.stringify(native,null,2));
const report={date:new Date().toISOString(),browserPath:'Browser plugin not available; installed Playwright browsers used.',native:native.checkpoints,browsers:[]};
async function server(existingDir,address="127.0.0.1:0"){
 const dir=existingDir??await mkdtemp(path.join(tmpdir(),'frontline-runtime-'));await mkdir(path.join(dir,'maps'),{recursive:true});await writeFile(path.join(dir,'maps/map.json'),JSON.stringify(map));
 const child=spawn(path.join(root,'bin/frontline'),['-addr',address,'-data',path.join(dir,'data'),'-maps',path.join(dir,'maps'),'-missions',path.join(dir,'missions'),'-static',staticDir],{cwd:root,stdio:['ignore','pipe','pipe']});
 let log='';const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout: '+log)),15000);child.stdout.on('data',data=>{log+=data;const match=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0])}});child.stderr.on('data',data=>log+=data);child.on('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+log))})});
 return {url,child,dir};
}
async function stopHost(host){if(host.child.exitCode!==null)return;const ended=new Promise(resolve=>host.child.once('exit',resolve));host.child.kill('SIGTERM');await ended}
const selected=process.env.FRONTLINE_TEST_BROWSER;
for(const browserType of [chromium,firefox,webkit].filter(b=>!selected||b.name()===selected)){
 const host=await server();let browser;const result={name:browserType.name(),status:'running',consoleErrors:[]};
 try{
  browser=await browserType.launch({headless:true});result.version=browser.version();
  const context=await browser.newContext(),page=await context.newPage();
  page.on('pageerror',error=>result.consoleErrors.push(error.message));
  await page.goto(host.url);assert.equal(await page.title(),'Frontline runtime integration test');
  const parity=await page.evaluate(async scenario=>{
   const R=globalThis.FrontlineTest;const runtime=new R.OfflineTransport('/runtime/');await runtime.ready;await runtime.create(scenario.config);
   const checkpoints=[],submits=[];let saved;
   for(const step of scenario.script){
    if(step.op==='submit'){try{await runtime.sendOrders(step.batch.orders);submits.push('accepted')}catch(error){submits.push(error.code)}}
    if(step.op==='step')await runtime.step(step.n);
    if(step.op==='checkpoint')checkpoints.push({label:step.label,tick:(await runtime.info()).tick,hash:await runtime.hash()});
    if(step.op==='save_restore'){saved=await runtime.save();await runtime.load(saved.data,saved.local_players)}
   }
   saved=await runtime.save();const before=await runtime.hash();const store=new R.LocalStore('browser-runtime',data=>runtime.inspect(data));
   await store.putSave('manual','Parity save',saved);for(let i=0;i<5;i++)await store.autosave(saved);
   const records=await store.listSaves(),exported=await store.exportSave('manual'),preview=await store.previewImport(exported);
   await runtime.load(preview.save.data,preview.save.local_players);
   const loaded=await runtime.hash();let corruption='';const damaged=saved.data.slice();damaged[Math.floor(damaged.length/2)]^=1;
   try{await runtime.load(damaged,saved.local_players)}catch(error){corruption=error.code}
   const preserved=(await runtime.hash())===loaded;
   const second=new R.OfflineTransport('/runtime/');await second.ready;await second.create(scenario.config);await second.step(4);const isolated=(await runtime.hash())===loaded;second.dispose();
   const api=new R.LocalAPI(location.origin);await api.createProfile('Runtime save verifier');const upload=await api.uploadSave('native-parity','Parity',saved.data,0);const download=await api.downloadSave('native-parity');
   const exact=download.data.length===saved.data.length&&download.data.every((v,i)=>v===saved.data[i]);let conflict='';try{await api.uploadSave('native-parity','Conflicting save',saved.data,0)}catch(error){conflict=error.code}
   await runtime.load(download.data,saved.local_players);const downloadedHash=await runtime.hash();
   globalThis.testSaved=saved;globalThis.testRuntime=runtime;
   const snapshot=runtime.current;
   await store.close();return {checkpoints,submits,hash:loaded,before,records:records.length,autosaves:records.filter(r=>r.kind==='auto').length,corruption,preserved,isolated,exact,conflict,downloadedHash,privateOnly:snapshot.entities.every(e=>e.owner===1),uploadRevision:upload.revision};
  },scenario);
  assert.deepEqual(parity.checkpoints,native.checkpoints);assert.deepEqual(parity.submits,native.submits);assert.equal(parity.hash,native.final_hash);assert.equal(parity.downloadedHash,native.final_hash);assert.equal(parity.before,parity.hash);assert.equal(parity.records,4);assert.equal(parity.autosaves,3);assert.ok(parity.corruption.startsWith('save_'));assert.ok(parity.preserved&&parity.isolated&&parity.exact&&parity.privateOnly);assert.equal(parity.conflict,'save_conflict');result.parity=parity;
  const installed=await page.evaluate(async pack=>{const R=globalThis.FrontlineTest;await R.registerOfflineWorker();const saved=await R.installPack(pack);let corrupt='';try{await R.installPack({...pack,version:'bad',files:[{...pack.files[0],sha256:'0'.repeat(64)}]})}catch(error){corrupt=error.code}const packs=await R.installedPacks();globalThis.testRuntime.dispose();return {files:saved.files,corrupt,packs:packs.length,controlled:!!navigator.serviceWorker.controller}},pack);
  assert.equal(installed.files,pack.files.length);assert.equal(installed.corrupt,'content_corrupt');assert.equal(installed.packs,1);assert.ok(installed.controlled);
  const originStopped=browserType.name()==='webkit';
  if(originStopped){await stopHost(host);const negative=await browser.newContext(),uncontrolled=await negative.newPage();let unavailable=false;try{await uncontrolled.goto(host.url,{timeout:3000})}catch{unavailable=true}assert.ok(unavailable);await negative.close();result.offlineLimitation='Playwright WebKit offline emulation fails before service-worker handling (upstream #42775). Tested with the actual host stopped and an uncached negative control; Safari device certification remains pending.';}
  else await context.setOffline(true);
  result.offlineProbe=await page.evaluate(async()=>{const probe={controlled:!!navigator.serviceWorker.controller,online:navigator.onLine};for(const path of ['/runtime/version.json','/']){try{const r=await fetch(path);probe[path]={status:r.status,length:(await r.text()).length}}catch(error){probe[path]={error:String(error)}}}return probe});
  await page.reload();
  const offline=await page.evaluate(async config=>{const R=globalThis.FrontlineTest;const runtime=globalThis.testRuntime=new R.OfflineTransport();await runtime.ready;await runtime.create(config);await runtime.step(20);const store=new R.LocalStore('browser-runtime',data=>runtime.inspect(data));const saved=await store.getSave('manual');await runtime.load(saved.data,saved.local_players);const hash=await runtime.hash();let networkBlocked=false;try{await new R.LocalAPI(location.origin).health()}catch{networkBlocked=true}await store.close();return {hash,networkBlocked,tick:runtime.current.tick}},scenario.config);
  assert.equal(offline.hash,native.final_hash);assert.ok(offline.networkBlocked);if(originStopped)Object.assign(host,await server(host.dir,new URL(host.url).host));else await context.setOffline(false);result.offline={...installed,...offline,method:originStopped?'host-stopped':'offline-emulation'};
  const contextB=await browser.newContext(),pageB=await contextB.newPage();pageB.on('pageerror',error=>result.consoleErrors.push(error.message));await pageB.goto(host.url);
  const lobby=await page.evaluate(async()=>{const R=globalThis.FrontlineTest;const api=globalThis.apiA=new R.LocalAPI(location.origin);await api.createProfile('Alpha');const health=await api.health();const result=await api.createLobby({name:'Integration match',map_id:'runtime-fixture',mode:'1v1',private:true,faction:'US'});return {...result,health}});
  await pageB.evaluate(async({id,code})=>{const R=globalThis.FrontlineTest;const api=globalThis.apiB=new R.LocalAPI(location.origin);await api.createProfile('Bravo');await api.joinLobby(id,{code,faction:'IR'})},{id:lobby.lobby.id,code:lobby.code});
  await Promise.all([page.evaluate(({id,health})=>globalThis.apiA.readyLobby(id,health),{id:lobby.lobby.id,health:{protocol:lobby.health.protocol,simulation:lobby.health.simulation,content_hash:lobby.health.content_hash}}),pageB.evaluate(({id,health})=>globalThis.apiB.readyLobby(id,health),{id:lobby.lobby.id,health:{protocol:lobby.health.protocol,simulation:lobby.health.simulation,content_hash:lobby.health.content_hash}})]);
  const started=await page.evaluate(id=>globalThis.apiA.startLobby(id),lobby.lobby.id);
  const joined=await pageB.evaluate(id=>globalThis.apiB.lobby(id),lobby.lobby.id);
  const connect=async(page,connection)=>page.evaluate(async connection=>{globalThis.receipts=[];globalThis.matchResult=null;const online=globalThis.online=new globalThis.FrontlineTest.OnlineTransport(location.origin,connection);online.subscribe(event=>{if(event.type==='order-result')globalThis.receipts.push(event.result);if(event.type==='result')globalThis.matchResult=event.result});await online.connect();return {player:online.current.player,owners:online.current.entities.map(e=>e.owner)}},connection);
  const perspectives=await Promise.all([connect(page,started.connection),connect(pageB,joined.connection)]);assert.deepEqual(perspectives.map(p=>p.player),[1,2]);assert.ok(perspectives.every(p=>p.owners.every(owner=>owner===p.player)));
  await page.waitForFunction(()=>globalThis.online.current?.countdown===0,{},{timeout:12000});
  await page.evaluate(()=>globalThis.online.sendOrders([{kind:'move',entities:[2],position:{x:16000,y:12000}}]));
  await page.waitForFunction(()=>globalThis.receipts.some(r=>r.sequence===1&&r.accepted));
  await page.evaluate(()=>globalThis.online.sendOrders([{kind:'stop',entities:[4]}]));
  await page.waitForFunction(()=>globalThis.receipts.some(r=>r.sequence===2&&!r.accepted&&r.code==='not_owner'));
  const resumed=await pageB.evaluate(async()=>{await globalThis.online.reconnect();return globalThis.online.current.player});assert.equal(resumed,2);
  await page.evaluate(()=>globalThis.online.sendOrders([{kind:'surrender'}]));
  await Promise.all([page.waitForFunction(()=>globalThis.matchResult?.committed),pageB.waitForFunction(()=>globalThis.matchResult?.committed)]);
  const winner=await pageB.evaluate(()=>globalThis.matchResult.outcome.winningTeam);assert.equal(winner,2);
  result.multiplayer={distinctPerspectives:true,moveAccepted:true,enemyOrderRejected:true,reconnect:true,committedWinner:winner};
  await page.evaluate(()=>{globalThis.testRuntime.dispose();globalThis.online.dispose()});await pageB.evaluate(()=>globalThis.online.dispose());
  assert.deepEqual(result.consoleErrors,[]);result.status='passed';console.log(`${browserType.name()}: native/WASM parity, IndexedDB saves, offline cached reload, exact-byte sync, isolated workers, two-browser multiplayer/reconnect/result passed`);
 }catch(error){result.status='failed';result.error=String(error.stack??error);console.error(result.error);process.exitCode=1}
 finally{if(browser)await browser.close();await stopHost(host);report.browsers.push(result);await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(report,null,2))}
}
if(!report.browsers.length)throw new Error('No selected browser');
