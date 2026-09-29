// Prepared bounded actual-App course. --execute is required to launch anything.
// Product paths/digests come from a separately reviewed ordinary make build.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {budgets,controls,controlBody,hash,isControl,verifyConfig,verifyAdmission,withoutControlBodies,verifyControlProofs,paidPowerProof,publicBuildSite} from './course.mjs';
import {installCurrentLoaderObserver,auditCurrentLoaderBodies,publicURL} from './observer.mjs';
import {explicitControlDiagnostics} from './helpers/native-consumed-body-cdp.mjs';
import {prepareWorker} from './prepare.mjs';
import {installResourceHealth,resourceCleanup} from './resource-health.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);assert(i>=0&&args[i+1],key+' is required');return args[i+1]};
const configPath=path.resolve(get('--config')),out=path.resolve(get('--out')),execute=args.includes('--execute');await mkdir(out);
const report={started:new Date().toISOString(),status:'preflight',functionalStatus:'unrun',scope:'One unchanged ordinary packaged App; normal solo readiness, one paid completed power building, normal save and menu cleanup. Test-only page reader/worker/WebGL observers, tiny fault controls. Shared-host resource/pacing diagnostics only, no final-art, victory, reference performance, actual GPU total memory, multiplayer or clean-network inference.',checks:[],health:[],pageErrors:[],consoleErrors:[],httpErrors:[],requestFailures:[],serverErrors:[],cleanupErrors:[],observerFaults:[],served:{},controls:[]};
let phase='preflight',browserServer,browser,context,page,server,origin,observer,pack,packDescriptor,config,worker,opening,courseTimer,timedOut=false;
const pins=new Map(),append=(key,value)=>{if(report[key].length>=budgets.maxEvents){if(!report.observerFaults.includes(key+' overflow'))report.observerFaults.push(key+' overflow');return}report[key].push(value)};
const pin=async(file,expected)=>{const bytes=await readFile(file),sha256=hash(bytes);if(expected)assert.equal(sha256,expected,file);pins.set(file,sha256);return bytes};
const save=()=>writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label)),ms))])}finally{clearTimeout(timer)}}
async function until(fn,label,ms=20000){const start=Date.now();for(;;){if(timedOut)throw Error('Global course deadline');const value=await fn();if(value)return value;if(Date.now()-start>ms)throw Error(label);await pause(100)}}
const read=()=>page.evaluate(()=>window.__nativeBodyWorkerQA.read());
async function health(label){
 const at=Date.now(),resources=await page.evaluate(()=>window.__nativeResourceHealth.sample(true)),metrics=await observer.session.send('Performance.getMetrics'),o=await read();
 const names=['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','Frames','TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'];
 const metricsByName=Object.fromEntries(metrics.metrics.filter(m=>names.includes(m.name)).map(m=>[m.name,m.value]));
 const row={label,at:new Date(at).toISOString(),elapsedMs:at-Date.parse(report.started),tick:o.latest?.tick,resources,cdpMetrics:metricsByName,host:{loadAverage:os.loadavg(),freeMemory:os.freemem(),totalMemory:os.totalmem(),conditions:config.hostConditions??'Not independently quiet; diagnostics only'},dom:await page.evaluate(()=>({canvas:document.querySelectorAll('canvas').length,battlefieldCanvas:document.querySelectorAll('.battlefield-canvas canvas').length}))};
 report.health.push(row);await save();return row;
}
async function idle(){await until(async()=>{assert.equal(await page.getByRole('heading',{name:'Command interrupted',exact:true}).count(),0,'App raised Command interrupted');return await page.locator('.loading-screen').count()===0},'App busy past bounded readiness',90000)}
async function menu(name){await page.getByRole('navigation',{name:'Main menu'}).getByRole('button',{name,exact:true}).click();await idle()}
async function record(name,data={}){report.checks.push({name,at:new Date().toISOString(),...data});await save()}
async function pauseGame(){await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('dialog',{name:'Operation paused'}).waitFor();await until(async()=>(await read()).clock?.paused===true,'Authoritative worker did not pause')}
async function leave(){
 if(!await page.getByRole('dialog',{name:'Operation paused'}).count())await pauseGame();
 await page.getByRole('dialog',{name:'Operation paused'}).getByRole('button',{name:'Return to command center',exact:true}).click();await idle();
 await page.getByRole('navigation',{name:'Main menu'}).waitFor();await until(async()=>{const o=await read();return o.workers.length>0&&o.workers.every(w=>!w.live)},'Go workers were not terminated on menu return');
 assert.equal(await page.locator('.battlefield-canvas canvas,.targeting-hint,.selection-tray').count(),0,'Battlefield DOM survived menu');
 report.menuObservation=await read();assert.equal(report.menuObservation.overflow,false);assert.deepEqual(report.menuObservation.errors,[]);
 // Art release is asynchronous. Observe a bounded grace period; do not force GC
 // or suppress allocation residue. The final state remains a separate gate.
 const start=Date.now();let sample;do{sample=await page.evaluate(()=>window.__nativeResourceHealth.sample());report.resourceCleanup=resourceCleanup(sample);if(report.resourceCleanup.status==='passed-observed-context-release')break;await pause(100)}while(Date.now()-start<10000);
 await health('menu-after-release');await record('normal-menu-and-observed-go-worker-cleanup',{workers:report.menuObservation.workers,resourceCleanup:report.resourceCleanup});
}
async function placePower(){
 opening=(await read()).latest;assert(opening?.player&&opening.tick>=120);report.opening=opening;
 await page.locator('.sidebar-utilities').getByRole('button',{name:'Build',exact:true}).click();
 await page.getByRole('button',{name:'Select production facility',exact:true}).click();
 await page.getByRole('tab',{name:'structures',exact:true}).click();
 const power=page.locator('.production-cameo').filter({has:page.getByText('Power station',{exact:true})});await until(()=>power.isEnabled(),'Power station option unavailable');await power.click();
 const hint=page.locator('.targeting-hint');await hint.waitFor();
 const box=await page.locator('.battlefield-canvas canvas').boundingBox();assert(box);const cx=box.x+box.width/2,cy=box.y+box.height/2;
 // Mouse moves only. Geometry previews intentionally remain indeterminate.
 // Use current public visibility/actor clearance to choose a reasonable site;
 // the actual submitted order is still the sole authority. Never fake clear.
 const offsets=[[-100,0],[100,0],[0,70],[0,-70],[-160,0],[160,0],[0,110],[0,-110],[-100,70],[100,70],[-100,-70],[100,-70],[-220,0],[220,0],[-160,100],[160,100],[-160,-100],[160,-100],[-220,80],[220,80],[-220,-80],[220,-80],[0,150],[0,-150]];
 assert.equal(offsets.length,budgets.maxPlacementPoints);report.placementPreview=[];let clicked=false;
 for(const [dx,dy] of offsets){const point={x:cx+dx,y:cy+dy};
  const hit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.matches('.battlefield-canvas canvas')===true,point);if(!hit){report.placementPreview.push({...point,skipped:'actual DOM occlusion'});continue}
  await pause(200);const before=(await read()).previews.length;await page.mouse.move(point.x,point.y);
  const preview=await until(async()=>{const o=await read();return o.previews.slice(before).find(p=>p.settledAt!==undefined&&p.batch.orders.some(order=>order.kind==='build'&&order.type==='power'))},'No settled original build-preview reply',5000);
  const o=await read(),order=preview.batch.orders.find(order=>order.kind==='build'&&order.type==='power'),result=preview.result?.results?.[0],site=publicBuildSite({point:order.position,view:o.latest,map:o.map,building:o.powerRule});
  const verdict=await hint.getAttribute('data-verdict');report.placementPreview.push({...point,verdict,text:await hint.innerText(),preview,publicSite:site});
  if(!result?.accepted||!['ok','indeterminate'].includes(result.code)||!site.suitable)continue;
  await page.mouse.click(point.x,point.y);clicked=true;break;
 }assert(clicked,'No suitable currently visible public site in bounded pointer course');
 await until(async()=>{const o=await read(),sent=o.requests.find(r=>r.method==='submit'&&r.batch.orders.some(order=>order.kind==='build'&&order.type==='power'));if(sent){const result=o.results.find(r=>r.player===opening.player&&r.sequence===sent.batch.sequence);if(result&&!result.accepted)throw Error('Actual power order rejected: '+result.code)}return o.latest.entities.some(e=>e.owner===opening.player&&e.type==='power'&&e.complete&&!opening.entities.some(old=>old.id===e.id))},'New power did not complete',65000);
 await health('completed-paid-power');await page.screenshot({path:path.join(out,'paid-power.png')});await pauseGame();
 const prior=(await read()).saves.length;await page.getByRole('dialog',{name:'Operation paused'}).getByRole('button',{name:'Save operation',exact:true}).click();await idle();
 await until(async()=>(await read()).saves.length>prior,'Normal Save operation did not return');
 const o=await read();assert.equal(o.overflow,false);assert.deepEqual(o.errors,[]);report.paid=paidPowerProof(o,opening);await record('ordinary-ui-paid-power-completion',report.paid);
}
async function tinyControls(){
 // Each unique synthetic route is called exactly once, sequentially. The
 // original response reader is the control's one actual consumer.
 report.controls=await page.evaluate(async list=>{const results=[];for(const c of list){let reader;const r={kind:c.kind,url:new URL(c.path,location.href).href,eof:false,bytes:0,error:undefined};try{
  const response=await fetch(c.path);reader=response.body.getReader();for(;;){const item=await reader.read();if(item.done){r.eof=true;break}r.bytes+=item.value.byteLength;if(r.bytes>256)throw Error('Tiny control exceeded 256 bytes')}
 }catch(error){r.error=String(error)}finally{reader?.releaseLock()}results.push(r)}return results},controls);
 await observer.capture('after-tiny-controls');
}
async function closeAll(){
 for(const [label,fn] of [['context',()=>context?.close()],['browser-connection',()=>browser?.close()],['browser-process',()=>browserServer?.close()]])try{await bounded(Promise.resolve(fn()),budgets.closeMs,label+' close timeout')}catch(error){report.cleanupErrors.push({label,error:String(error)})}
 if(browserServer?.process()?.exitCode===null)try{await bounded(browserServer.kill(),budgets.closeMs,'Owned browser kill timeout')}catch(error){report.cleanupErrors.push({label:'owned-browser-kill',error:String(error)})}
 if(server?.listening){server.closeAllConnections();try{await bounded(new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),budgets.closeMs,'HTTP close timeout')}catch(error){report.cleanupErrors.push({label:'HTTP',error:String(error)})}}
 report.closedProcess={browserPID:browserServer?.process()?.pid,browserExitCode:browserServer?.process()?.exitCode,browserSignal:browserServer?.process()?.signalCode,httpListening:!!server?.listening};
}
try{
 const before=Date.now();config=verifyConfig(JSON.parse(await pin(configPath)));report.config={...config};
 const artifact=JSON.parse(await pin(path.resolve(config.artifact),config.artifactSHA256));const product=await realpath(config.product);config.product=product;assert(out!==product&&!out.startsWith(product+path.sep),'Evidence must not write inside immutable product');
 const packBytes=await pin(path.join(product,'assets/packs/base.json'),config.packSHA256);const admission=verifyAdmission({config,artifact,packBytes});pack=admission.pack;report.admission={...admission,pack:undefined,artifactSHA256:config.artifactSHA256};
 // This verifier streams each file sequentially and rejects extra/changed paths.
 const verifier=path.join(root,'scripts/package-integrity.mjs');await pin(verifier);const {verifyProduct,fileDigest}=await import(pathToFileURL(verifier).href);
 report.product=await bounded(verifyProduct(product),budgets.preflightMs,'Product preflight exceeded budget');assert.equal(report.product.packSHA256,config.packSHA256);for(const key of ['simulation','protocol','content_hash'])assert.equal(report.product.runtime[key],artifact[key],'Root artifact runtime '+key);
 await pin(path.resolve(config.protocolFile),config.protocolSHA256);const executable=await fileDigest(config.executable);assert.equal(executable.sha256,config.executableSHA256);report.executable={path:config.executable,...executable};
 for(const name of ['runner.mjs','prepare.mjs','course.mjs','worker-observer.ts','observer.mjs','resource-health.mjs','helpers/all-art-consumed-body-trace.mjs','helpers/native-consumed-body-cdp.mjs','helpers/native-consumed-body-trace.mjs','helpers/native-response-cdp.mjs','helpers/native-response-trace.mjs','helpers/streaming-sha256.mjs'])await pin(path.join(here,name));
 worker=await prepareWorker({root,protocolFile:path.resolve(config.protocolFile),protocolSHA256:config.protocolSHA256,out});report.workerBuild=worker.result;for(const row of worker.result.inputs)pins.set(row.file,row.sha256);
 const require=createRequire(path.join(root,'client/package.json')),{chromium}=require('playwright-core');assert.equal(typeof chromium.launchServer,'function');await pin(path.join(root,'client/package-lock.json'));await pin(path.join(root,'client/node_modules/playwright-core/package.json'));
 assert(Date.now()-before<budgets.preflightMs,'Full preflight exceeded finite budget');report.preflightMs=Date.now()-before;
 if(!execute){report.status='prepared-only';report.noBrowserOrServer=true}else{
  packDescriptor={path:'/assets/packs/base.json',bytes:packBytes.length,sha256:config.packSHA256};const served=new Map([...pack.files,packDescriptor].map(item=>[item.path,item]));
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.ogg':'audio/ogg','.mp3':'audio/mpeg','.md':'text/markdown'};
  const controlRequests=new Map();report.staticTransport={kind:'task-local immutable static HTTP fixture; no Go network server',cacheControl:'no-store (matches production server response policy)',streamChunk:65536};
  server=createServer(async(req,res)=>{let key;try{
   assert(['GET','HEAD'].includes(req.method));const u=new URL(req.url,'http://local');key=u.pathname==='/'?'/index.html':u.pathname;
   const control=controls.find(c=>c.path===key);if(control){assert.equal(req.method,'GET');assert.equal(u.search,'');const count=(controlRequests.get(key)??0)+1;controlRequests.set(key,count);assert.equal(count,1,'Control called more than once');
    if(control.kind==='network'){req.socket.destroy();return}
    res.setHeader('Content-Type','application/octet-stream');res.setHeader('Cache-Control','no-store');res.setHeader('Connection','close');res.setHeader('Content-Length',control.kind==='truncated'?controlBody.length+13:controlBody.length);res.end(controlBody);return;
   }
   const item=served.get(key);assert(item,'Unlisted product URL '+key);const file=await realpath(path.join(product,key.slice(1)));assert(file.startsWith(product+path.sep),'Static path escape');
   const row=report.served[key]??={requests:0,bytes:item.bytes,sha256:item.sha256};row.requests++;
   res.setHeader('Content-Type',mime[path.extname(key)]??'application/octet-stream');res.setHeader('Content-Length',item.bytes);res.setHeader('Cache-Control','no-store');
   if(req.method==='HEAD')res.end();else await pipeline(createReadStream(file,{highWaterMark:65536}),res);
  }catch(error){if(res.destroyed&&['ERR_STREAM_PREMATURE_CLOSE','ECONNRESET'].includes(error.code)){append('serverErrors',{kind:'client-transfer-closed',path:key,error:String(error)});return}append('serverErrors',{kind:'fixture-failure',path:key,error:String(error)});if(!res.headersSent){res.statusCode=404;res.end('Frozen resource unavailable')}else res.destroy(error)}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;report.origin=origin;
  courseTimer=setTimeout(()=>{timedOut=true;report.timeout=true;void context?.close().catch(()=>{})},budgets.courseMs);
  browserServer=await chromium.launchServer({executablePath:config.executable,headless:false,args:['--mute-audio'],timeout:30000});report.browserPID=browserServer.process().pid;
  browser=await chromium.connect(browserServer.wsEndpoint());report.browserVersion=browser.version();context=await browser.newContext({viewport:{width:1600,height:900}});page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>append('pageErrors',{phase,message:error.message}));page.on('console',msg=>{if(msg.type()==='error')append('consoleErrors',{phase,message:msg.text(),location:msg.location()})});
  page.on('requestfailed',request=>append('requestFailures',{phase,url:publicURL(request.url()),message:request.failure()?.errorText,method:request.method(),resourceType:request.resourceType()}));page.on('response',response=>{if(response.status()>=400)append('httpErrors',{phase,url:publicURL(response.url()),status:response.status()})});
  observer=await installCurrentLoaderObserver(page,{origin,stamp:()=>({phase}),paths:[...pack.files.map(f=>f.path),packDescriptor.path,...controls.map(c=>c.path)]});await writeFile(path.join(out,'native-observer.js'),observer.source);report.nativeObserverSHA256=hash(observer.source);await observer.session.send('Performance.enable');
  await page.addInitScript({content:`window.__nativeResourceHealth=(${installResourceHealth.toString()})(window);`});await page.addInitScript({content:worker.bundle});phase='normal-app-readiness';await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await idle();await health('initial-menu');await menu('Options');await page.getByLabel('Art quality',{exact:true}).selectOption(config.quality);await menu('Skirmish');
  await page.getByLabel('Battlefield',{exact:true}).selectOption(config.map);await page.getByLabel('AI commanders',{exact:true}).selectOption('0');report.deployAt=new Date().toISOString();await page.getByRole('button',{name:'Deploy forces',exact:true}).click();
  await page.locator('.battlefield-canvas canvas').waitFor();await until(async()=>await page.locator('.scene-loading,.loading-screen').count()===0,'Scene did not become ready',90000);report.uiSceneLoadingDismissedMs=Date.now()-Date.parse(report.deployAt);await health('scene-loading-dismissed');await until(async()=>(await read()).latest?.tick>=120,'Real countdown did not complete');
  report.sceneReadyMsIncludingCountdown=Date.now()-Date.parse(report.deployAt);await health('scene-ready');await page.screenshot({path:path.join(out,'scene-ready.png')});await observer.capture('readiness');await record('normal-solo-readiness');phase='paid-power';await placePower();phase='normal-menu-cleanup';await leave();await page.screenshot({path:path.join(out,'ordinary-menu.png')});await observer.capture('menu-cleanup');report.functionalStatus='passed';
  phase='tiny-negative-controls';await bounded(tinyControls(),20000,'Tiny controls timeout');assert.equal(controlRequests.size,controls.length);report.controlRequests=Object.fromEntries(controlRequests);
 }
}catch(error){report.error=String(error.stack??error);report.failedPhase=phase;report.status='failed';process.exitCode=1;if(page&&!page.isClosed())await bounded(page.screenshot({path:path.join(out,'failure.png')}),5000,'Failure screenshot timeout').catch(()=>{})}
finally{
 clearTimeout(courseTimer);
 if(execute&&page&&!page.isClosed()&&observer){
  try{phase='failure-or-final-resource-capture';report.finalWorkerObservation=await read();await health('before-final-close');
   if(report.error&&await page.locator('.battlefield-canvas canvas').count()){
    phase='independent-failure-menu-cleanup';if(await page.locator('.targeting-hint').count())await page.locator('.targeting-hint').getByRole('button',{name:/Cancel/}).click();
    await bounded(leave(),25000,'Independent failure menu cleanup timeout');await page.screenshot({path:path.join(out,'failure-cleanup-menu.png')});report.failureMenuCleanup='passed';
   }
  }catch(error){report.failureCleanupError=String(error);report.cleanupErrors.push({label:'independent-App-cleanup',error:String(error)})}
 }
 phase='final-capture';if(observer&&page&&!page.isClosed())await bounded(observer.capture('before-final-close'),10000,'Final native capture timeout').catch(error=>report.observerFaults.push(String(error)));
 phase='close';await closeAll();phase='post-close-reconciliation';
 if(observer){try{
  const snapshot=observer.ledger.snapshot();await writeFile(path.join(out,'native-ledger.json'),JSON.stringify(snapshot,null,2)+'\n');
  const diag=explicitControlDiagnostics({controls:report.controls,consoleErrors:report.consoleErrors,failures:report.requestFailures});report.controlDiagnostics=diag;
  const args={manifest:pack,origin,packDescriptor,playwrightFailures:report.requestFailures.filter(r=>!isControl(r.url)),pageErrors:report.pageErrors,consoleErrors:diag.unexpectedConsole,httpErrors:report.httpErrors};
  const audit=auditCurrentLoaderBodies({...args,snapshot:withoutControlBodies(snapshot)});report.bodyAudit={...audit,reconciliation:undefined};report.definiteBodyMismatches=audit.reconciliation.proofs.filter(p=>p.request&&['native-body-hash-mismatch','native-byte-count-mismatch'].includes(p.reason)).map(p=>({url:p.native.url,requestId:p.request.id,reason:p.reason}));await writeFile(path.join(out,'body-audit.json'),JSON.stringify(audit,null,2)+'\n');
  report.rawStatus=audit.rawStatus;report.bodyStatus=audit.bodyStatus;
  if(report.controls.length===controls.length){const controlAudit=auditCurrentLoaderBodies({snapshot,manifest:{files:[...pack.files,...controls]},origin,packDescriptor});report.controlProofs=verifyControlProofs(controlAudit,report.controls);report.controlStatus='passed'}else report.controlStatus='unrun-or-incomplete';
  const unexpectedControl=diag.otherNetwork.filter(r=>isControl(r.url));assert.deepEqual(unexpectedControl,[],'Unexpected control diagnostic cannot be excluded');
 }catch(error){report.reconciliationError=String(error.stack??error);report.status='failed';process.exitCode=1}}
 try{
  for(const [file,expected]of pins)assert.equal(hash(await readFile(file)),expected,'Input changed: '+file);
  if(config){const {verifyProduct,fileDigest}=await import(pathToFileURL(path.join(root,'scripts/package-integrity.mjs')).href);report.productAfter=await bounded(verifyProduct(config.product),budgets.preflightMs,'Final product guard timeout');assert.equal(report.productAfter.packSHA256,config.packSHA256);assert.equal((await fileDigest(config.executable)).sha256,config.executableSHA256)}report.pinsVerifiedAfter=pins.size;
 }catch(error){report.inputGuardError=String(error.stack??error);report.status='failed';process.exitCode=1}
 if(execute){
  const fixtureError=report.serverErrors.some(e=>e.kind==='fixture-failure');
  const strict=report.functionalStatus==='passed'&&report.rawStatus==='passed'&&report.resourceCleanup?.status==='passed-observed-context-release'&&report.health.every(h=>!h.resources.faults.length)&&report.controlProofs?.length===4&&!report.definiteBodyMismatches?.length&&!report.error&&!report.reconciliationError&&!report.inputGuardError&&!report.timeout&&!report.cleanupErrors.length&&!report.observerFaults.length&&!fixtureError;
  report.status=strict?'passed':'failed';if(!strict)process.exitCode=1;
 }
 report.inputs=Object.fromEntries(pins);report.closedAt=new Date().toISOString();await save();console.log(JSON.stringify({out,status:report.status,functional:report.functionalStatus,raw:report.rawStatus,body:report.bodyStatus,rawFailures:report.requestFailures.length,launched:execute}));
}
