import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,firefox,webkit} from 'playwright-core';

// Full frozen App, original Go saves, normal controls only. This driver never
// calls a fixture API, installs a fake snapshot, or sends a worker RPC itself.
const usage='node client/tests/render/battlefield-clarity-product.browser.mjs --product /absolute/frozen/product --saves /absolute/ambient/course --out /absolute/new/evidence [--engine chromium|firefox|webkit] [--headless true|false]';
if(process.argv.includes('--help')){console.log(usage);process.exit(0)}
const argv=process.argv.slice(2),args={};
assert.equal(argv.length%2,0,usage);
for(let i=0;i<argv.length;i+=2){
 assert(['--product','--saves','--out','--engine','--headless'].includes(argv[i]),`Unknown argument ${argv[i]}`);
 assert(!Object.hasOwn(args,argv[i]),`Duplicate argument ${argv[i]}`);args[argv[i]]=argv[i+1];
}
assert(args['--product']&&args['--saves']&&args['--out'],usage);
const product=await realpath(path.resolve(args['--product'])),saves=await realpath(path.resolve(args['--saves'])),out=path.resolve(args['--out']);
const engine=args['--engine']??'chromium';assert(['chromium','firefox','webkit'].includes(engine));
assert(args['--headless']===undefined||['true','false'].includes(args['--headless']));
const headless=args['--headless']===undefined?engine!=='chromium':args['--headless']==='true';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const driverPath=fileURLToPath(import.meta.url),driverBytes=await readFile(driverPath);
const fixtures={},fixtureBytes=new Map();
for(const [key,name] of Object.entries({before:'clarity-before-defeat.save.json',defeat:'clarity.save.json'})){
 const file=path.join(saves,name),bytes=await readFile(file),wrapper=JSON.parse(bytes.toString('utf8'));
 assert.equal(wrapper.format,'frontline-local-save');assert.equal(wrapper.version,1);
 assert.equal(typeof wrapper.engine,'string');assert.match(wrapper.hash,/^[a-f0-9]{64}$/);
 assert.equal(wrapper.local_players[0],1,'Course opens in its original owner-1 perspective');
 const state=JSON.parse(wrapper.engine).state;
 const own=state.entities.filter(entity=>entity.owner===1&&entity.hp>0);
 if(key==='before'){
  assert.equal(state.map.id,'ambient-course');assert.equal(state.map.width,64);assert.equal(state.map.height,64);
  assert.equal(state.metadata.ruleset,'practice-v1','Artillery/memory fixture retains its honest practice label');
  assert(own.some(entity=>entity.type==='US.artillery'&&entity.position.x===18000&&entity.position.y===18000));
 }else assert.equal(state.metadata.ruleset,'standard-v2','Defeat must be earned in a separate ordinary standard match; practice suppresses this deadline');
 assert.equal(own.some(entity=>entity.type==='hq'),key==='before');
 assert.equal(own.some(entity=>entity.type==='US.rig'),key==='before');
 fixtures[key]={file,importFile:path.join(out,name),name:wrapper.name,mapTitle:state.map.title,mapID:state.map.id,bytes:bytes.length,sha256:digest(bytes),hash:wrapper.hash,tick:state.tick,metadata:state.metadata,ownPowerCount:own.filter(entity=>entity.type==='power').length};fixtureBytes.set(key,bytes);
}
for(const key of ['simulation','protocol','content_hash'])assert.equal(fixtures.before.metadata[key],fixtures.defeat.metadata[key],`Fixture ${key} mismatch`);
const runtimeBytes=await readFile(path.join(product,'runtime/frontline.wasm'));
const runtimeVersion=JSON.parse(await readFile(path.join(product,'runtime/version.json'),'utf8'));
for(const key of ['simulation','protocol','content_hash'])assert.equal(runtimeVersion[key],fixtures.before.metadata[key],`Frozen save/runtime ${key} mismatch`);
let buildReceipt;
try{const bytes=await readFile(path.join(product,'../build.json'));buildReceipt={sha256:digest(bytes),receipt:JSON.parse(bytes.toString('utf8'))}}catch(error){if(error.code!=='ENOENT')throw error}
await mkdir(path.dirname(out),{recursive:true});await mkdir(out); // Never overwrite an earlier failure.
await writeFile(path.join(out,'driver.mjs'),driverBytes);
for(const [key,value] of Object.entries(fixtures))await writeFile(value.importFile,fixtureBytes.get(key));
const report={started:new Date().toISOString(),status:'running',engine,headless,product,saves,
 scope:'Full frozen product UI; real Go practice artillery/memory save and separately earned standard defeat-countdown save. Eight serial desktop/scale cases. No mock snapshots, fixture bridge, direct commands, host, or production edits. Screenshots require visual review; this is not campaign, final-art, GPU-memory, performance, or exhaustive pixel acceptance.',
 tooling:'Browser plugin not available; regular Playwright. Authoring alone does not constitute a browser pass.',
 identity:{driverSHA256:digest(driverBytes),wasmSHA256:digest(runtimeBytes),runtimeVersion,indexSHA256:digest(await readFile(path.join(product,'index.html'))),buildReceipt},
 fixtures,servedFiles:{},cases:[],errors:[],httpErrors:[],requestFailures:[],sourceChanges:[]};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ogg':'audio/ogg','.mp3':'audio/mpeg','.gz':'application/gzip','.ico':'image/x-icon'};
// No SPA fallback for missing resources and no fabricated health/API responses.
const server=createServer(async(req,res)=>{
 try{
  assert(req.method==='GET'||req.method==='HEAD');
  const url=new URL(req.url,'http://local'),relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
  assert(!relative.includes('\0'));const resolved=await realpath(path.resolve(product,relative));
  assert(resolved.startsWith(product+path.sep),'Path outside frozen product');
  const bytes=await readFile(resolved),identity={bytes:bytes.length,sha256:digest(bytes)},prior=report.servedFiles[relative];
  if(prior&&prior.sha256!==identity.sha256){report.sourceChanges.push(relative);throw Error('Frozen resource changed during course')}
  report.servedFiles[relative]=identity;res.setHeader('Content-Type',mime[path.extname(resolved)]??'application/octet-stream');
  res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:bytes);
 }catch(error){res.statusCode=404;res.end('Frozen product resource unavailable')}
});
let browser,activePage,activeCase,phase='starting';
const stamp=()=>({case:activeCase?.id,phase,time:new Date().toISOString()});
const flush=()=>writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));
async function waitFor(predicate,message,timeout=15000){
 const until=Date.now()+timeout;do{if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,80))}while(Date.now()<until);
 throw Error(message);
}
async function noModal(page){assert.equal(await page.getByRole('dialog',{name:'Command interrupted',exact:true}).count(),0,'Product reported Command interrupted')}
async function idle(page){await page.locator('.loading-screen').waitFor({state:'hidden'});await noModal(page)}
async function notice(page){
 // Toasts sit behind an active modal scrim. Let the normal dialog flow finish;
 // never force a background click merely to dismiss transient feedback.
 if(await page.getByRole('dialog').isVisible())return;
 const dismiss=page.getByRole('button',{name:'Dismiss notification',exact:true});if(await dismiss.isVisible())await dismiss.click();
}
async function workers(page){return page.evaluate(()=>structuredClone(window.__clarityWorkers))}
async function checkpoint(page,label){
 await noModal(page);const prefix=path.join(out,`${activeCase.id}-${label}`);
 const geometry=await page.evaluate(()=>{
  const selectors=['.command-sidebar','.resource-shoulder','.selection-tray','.targeting-hint','.defeat-warning','[role="timer"]','.range-mode','.audio-captions','.replay-controls','[role="dialog"]'];
  const boxes={};for(const selector of selectors)boxes[selector]=[...document.querySelectorAll(selector)].filter(node=>node.getClientRects().length).map(node=>{
   const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,text:node.textContent?.slice(0,400),clientWidth:node.clientWidth,scrollWidth:node.scrollWidth};
  });return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,boxes};
 });
 assert(geometry.scrollWidth<=geometry.width+1,'Page overflows horizontally');
 for(const selector of ['.command-sidebar','.resource-shoulder','.selection-tray','.targeting-hint','.defeat-warning','[role="timer"]','[role="dialog"]']){
  for(const b of geometry.boxes[selector])assert(b.x>=-1&&b.y>=-1&&b.x+b.width<=geometry.width+1&&b.y+b.height<=geometry.height+1,`${label}: ${selector} outside viewport ${JSON.stringify(b)}`);
 }
 const hint=geometry.boxes['.targeting-hint'][0],sidebar=geometry.boxes['.command-sidebar'][0];
 if(hint&&sidebar)assert(hint.x+hint.width<=sidebar.x,'Target guidance covers command-sidebar controls');
 for(const caption of geometry.boxes['.audio-captions']??[])if(hint)assert(caption.y+caption.height<=hint.y||caption.y>=hint.y+hint.height||caption.x+caption.width<=hint.x||caption.x>=hint.x+hint.width,'Audio captions cover target guidance');
 await page.screenshot({path:prefix+'.png'});await writeFile(prefix+'.txt',await page.locator('body').innerText());
 activeCase.checkpoints.push({label,geometry,workers:await workers(page)});await flush();
}
async function reachable(locator){
 await locator.scrollIntoViewIfNeeded();
 const result=await locator.evaluate(node=>{
  const rect=node.getBoundingClientRect();let left=0,top=0,right=innerWidth,bottom=innerHeight;
  for(let p=node.parentElement;p;p=p.parentElement){const style=getComputedStyle(p),b=p.getBoundingClientRect();
   if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right)}
   if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom)}
  }
  return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},clip:{left,top,right,bottom},visible:rect.width>0&&rect.height>0&&rect.left>=left-1&&rect.right<=right+1&&rect.top>=top-1&&rect.bottom<=bottom+1};
 });assert(result.visible,`Control clipped: ${JSON.stringify(result)}`);return result;
}
async function menu(page){return page.getByRole('navigation',{name:'Main menu',exact:true})}
async function importFixture(page,key){
 phase=`import-${key}`;await (await menu(page)).getByRole('button',{name:'Load operation',exact:true}).click();
 // These two original exports intentionally share a display name. Their real
 // ruleset labels distinguish them without racing the initial async archive read.
 const rows=page.locator('.archive-row').filter({has:page.getByText(fixtures[key].name,{exact:true})}).filter({hasText:fixtures[key].metadata.ruleset});
 await page.getByLabel('Import save',{exact:true}).setInputFiles(fixtures[key].importFile);await idle(page);
 await page.locator('.notice').filter({hasText:'Imported as a new local copy. Existing records were preserved.'}).waitFor();
 await waitFor(async()=>await rows.count()===1,'Imported save did not produce its distinct archive row');
 if(key==='defeat')assert.equal(await page.locator('.archive-row').filter({has:page.getByText(fixtures.before.name,{exact:true})}).filter({hasText:fixtures.before.metadata.ruleset}).count(),1,'Second import replaced the original practice save');
 const row=rows.first();
 await row.getByRole('button',{name:'Load',exact:true}).click();await scene(page);await notice(page);
}
async function scene(page){
 await page.locator('.battlefield-canvas canvas').waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'});await idle(page);
 assert.equal(await page.locator('.battlefield-canvas canvas').count(),1);
}
// Public 64x64 minimap projection, used only to generate normal pointer input.
// Match the existing minimap input mapping in CSS pixels, including its 6px
// inset at each UI scale. No authoritative decisions are implemented here.
async function center(page,x,y){
 const locator=page.getByLabel('Tactical minimap',{exact:true});await reachable(locator);
 const b=await locator.boundingBox(),span=128,scale=Math.min(Math.max(1,b.width-12)/span,Math.max(1,b.height-12)/(span*.5));
 const originX=(b.width-span*scale)/2+64*scale,originY=(b.height-span*scale*.5)/2;
 await page.mouse.click(b.x+originX+(x-y)*scale/1000,b.y+originY+(x+y)*scale/2000);
}
async function fieldCenter(page){const b=await page.locator('.battlefield-canvas canvas').boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2}}
async function pause(page){await page.getByRole('button',{name:'Open pause menu',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Operation paused',exact:true});await dialog.waitFor();await reachable(dialog.getByRole('button',{name:'Resume operation',exact:true}));return dialog}
async function leave(page,baseline){
 const dialog=page.getByRole('dialog',{name:'Operation paused',exact:true});if(!await dialog.isVisible())await pause(page);
 await dialog.getByRole('button',{name:'Return to command center',exact:true}).click();await idle(page);await (await menu(page)).waitFor();
 await waitFor(async()=>await page.locator('.battlefield-canvas canvas').count()===0,'Battlefield canvas survived menu return');
 await waitFor(async()=>(await workers(page)).live===baseline,'Go session worker survived menu return');
 assert.equal(await page.locator('.targeting-hint,.defeat-warning,.replay-controls').count(),0,'Battlefield DOM survived menu return');
}
async function saveReplayCourse(page,baseline){
 phase='save-replay';const dialog=await pause(page);await dialog.getByRole('button',{name:'Save operation',exact:true}).click();await idle(page);
 const savedNotice=page.locator('.notice');await savedNotice.filter({hasText:'Saved:'}).waitFor();
 const name=(await savedNotice.locator('span').innerText()).replace(/^Saved: /,'');activeCase.savedName=name;
 await dialog.getByRole('button',{name:'Archive replay',exact:true}).click();await idle(page);
 await savedNotice.filter({hasText:'Replay stored in your local archive.'}).waitFor();await notice(page);
 await checkpoint(page,'saved-and-archived');await leave(page,baseline);await checkpoint(page,'menu-after-save');
 await (await menu(page)).getByRole('button',{name:'Load operation',exact:true}).click();
 // Exact text below avoids accidentally continuing an autosave or original import.
 const savedRow=page.locator('.archive-row').filter({has:page.getByText(name,{exact:true})});
 await savedRow.waitFor();assert.equal(await savedRow.count(),1);
 const downloadPromise=page.waitForEvent('download');await savedRow.getByRole('button',{name:'Export',exact:true}).click();
 const download=await downloadPromise,file=path.join(out,`${activeCase.id}-exported.save.json`);await download.saveAs(file);
 const bytes=await readFile(file),exported=JSON.parse(bytes.toString('utf8'));assert.equal(exported.format,'frontline-local-save');assert.equal(exported.name,name);
 const savedState=JSON.parse(exported.engine).state;
 const buildLog=(savedState.log??[]).filter(batch=>batch.player===1&&batch.orders.some(order=>order.kind==='build'&&order.type==='power'));
 assert.equal(buildLog.length,1,'Actual rejected build request must remain in the authoritative saved command log');
 const rejectedOrder=buildLog[0].orders.find(order=>order.kind==='build'&&order.type==='power');
 // Browser pointer coordinates round at different UI scales. The saved snapped
 // center must still lie inside the actual 4x4 occupied HQ, not an exact pixel.
 assert(Math.abs(rejectedOrder.position.x-8000)<2000&&Math.abs(rejectedOrder.position.y-8000)<2000,'Rejected build click left the occupied HQ footprint');
 assert.equal(savedState.entities.filter(entity=>entity.owner===1&&entity.type==='power').length,fixtures.before.ownPowerCount,'Rejected placement created a power foundation');
 activeCase.exportedSave={bytes:bytes.length,sha256:digest(bytes),hash:exported.hash,rejectedBuildLog:buildLog,ownPowerCount:fixtures.before.ownPowerCount};
 await savedRow.getByRole('button',{name:'Load',exact:true}).click();await scene(page);await notice(page);await checkpoint(page,'reloaded-manual-save');await leave(page,baseline);
 await (await menu(page)).getByRole('button',{name:'Replay archive',exact:true}).click();
 const replayRow=page.locator('.archive-row').filter({has:page.getByText(fixtures.before.mapTitle,{exact:true})});await replayRow.waitFor();assert.equal(await replayRow.count(),1);
 await replayRow.getByRole('button',{name:'Watch',exact:true}).click();await scene(page);
 const controls=page.getByRole('region',{name:'Replay controls',exact:true});await controls.waitFor();
 const timeline=page.getByLabel('Replay timeline',{exact:true});await reachable(timeline);
 const end=Number(await timeline.getAttribute('max'));assert(end>=fixtures.before.tick,'Archived replay lost its real ending');
 await timeline.focus();await timeline.press('End');await idle(page);
 await waitFor(async()=>Number(await timeline.inputValue())===end,'Replay did not seek to its real end');
 activeCase.replayEnd=end;await checkpoint(page,'replay-end');await leave(page,baseline);await checkpoint(page,'menu-after-replay');
 const methods=(await workers(page)).methods;for(const method of ['save','exportReplay','loadReplay','seekReplay'])assert(methods[method]>0,`Normal UI never invoked ${method}`);
}
async function clarityCourse(page,baseline){
 await importFixture(page,'before');phase='selection-ranges';await center(page,18000,18000);
 const p=await fieldCenter(page);await page.mouse.move(p.x-85,p.y-125);await page.mouse.down();await page.mouse.move(p.x+85,p.y+35,{steps:8});await page.mouse.up();
 await page.getByRole('heading',{name:'Precision howitzer',exact:true}).waitFor();
 const range=page.getByRole('button',{name:/^Range overlay:/});assert.match(await range.innerText(),/Range: off/i);await reachable(range);
 await center(page,24000,18000);await checkpoint(page,'last-seen-and-off');activeCase.ranges=[];
 for(const mode of ['weapon','sight','detection','off']){
  await range.click();await waitFor(async()=>(await range.innerText()).toLowerCase()===`range: ${mode}`,`Range button failed to show ${mode}`);
  activeCase.ranges.push({mode,aria:await range.getAttribute('aria-label'),bounds:await reachable(range)});await checkpoint(page,`range-${mode}`);
 }
 phase='placement';const before=(await workers(page)).methods.submit??0;
 await page.getByRole('button',{name:'Build',exact:true}).click();await page.getByRole('tab',{name:'structures',exact:true}).click();
 const power=page.locator('.production-cameo').filter({has:page.getByText('Power station',{exact:true})});await reachable(power);assert(await power.isEnabled());await power.click();
 const hint=page.locator('.targeting-hint');await hint.waitFor();await waitFor(async()=>/Power after build/.test(await hint.innerText()),'No actual placement power estimate');
 activeCase.placement=[];
 for(const target of [{name:'free-site-pending',x:10000,y:14000},{name:'occupied-site-pending',x:8000,y:8000}]){
  await center(page,target.x,target.y);const point=await fieldCenter(page),prior=(await workers(page)).previews.length;
  // Real pointer updates account for the product's 180ms hover throttle. Small
  // offsets stay inside the same 500mt placement snap cell; no force click.
  for(let attempt=0;attempt<10;attempt++){
   await page.mouse.move(point.x+(attempt%2),point.y);await new Promise(resolve=>setTimeout(resolve,250));
   if((await workers(page)).previews.length>prior&&/The host will check this when the order executes\./.test(await hint.innerText()))break;
  }
  await waitFor(async()=>/The host will check this when the order executes\./.test(await hint.innerText())&&(await workers(page)).previews.length>prior,`Missing ${target.name} Go placement result`);
  const previews=(await workers(page)).previews.slice(prior);assert(previews.some(value=>value.results.some(result=>result.accepted&&result.code==='indeterminate')),`No ${target.name} authoritative pending preview receipt`);
  activeCase.placement.push({target:{name:target.name,x:target.x,y:target.y},text:await hint.innerText(),previews});await reachable(hint.getByRole('button',{name:'Cancel',exact:true}));await checkpoint(page,`placement-${target.name}`);
 }
 await hint.getByRole('button',{name:'Cancel',exact:true}).click();await hint.waitFor({state:'hidden'});
 assert.equal((await workers(page)).methods.submit??0,before,'Preview/cancel unexpectedly submitted a command');assert((await workers(page)).methods.previewOrders>0,'Placement never requested Go preview');
 await checkpoint(page,'placement-canceled');
 // Go intentionally defers build geometry to execution. Click the occupied HQ
 // through the real product and retain the resulting rejection, never assert
 // that an amber pending preview is a positive placement guarantee.
 phase='occupied-placement-execution';await power.click();await hint.waitFor();await center(page,8000,8000);const occupied=await fieldCenter(page);await page.mouse.click(occupied.x,occupied.y);
 const rejected=page.locator('.notice').filter({hasText:/Order rejected: (occupied|building overlap)/});await rejected.waitFor();
 activeCase.occupiedRejection=await rejected.innerText();assert.equal((await workers(page)).methods.submit,before+1,'Occupied click did not submit exactly one ordinary command');
 await hint.waitFor({state:'hidden'});await checkpoint(page,'occupied-placement-rejected');await notice(page);await saveReplayCourse(page,baseline);
}
async function countdownCourse(page,baseline){
 await importFixture(page,'defeat');phase='countdown';const timer=page.getByRole('timer',{name:'Seconds until defeat',exact:true});await timer.waitFor();
 const seconds=async()=>Number.parseInt(await timer.innerText(),10),first=await seconds();assert(first>0&&first<=30,`Invalid actual countdown ${first}`);
 await reachable(timer);await checkpoint(page,'countdown-live');
 await waitFor(async()=>await seconds()<first,'Live defeat countdown did not decrease',6000);
 const afterLive=await seconds();await pause(page);
 // Wait for the real pause clock acknowledgement, not only modal appearance.
 await waitFor(async()=>(await workers(page)).lastClock?.paused===true,'Go did not acknowledge pause');
 const paused=await seconds();await new Promise(resolve=>setTimeout(resolve,1250));assert.equal(await seconds(),paused,'Paused countdown continued');
 await checkpoint(page,'countdown-paused');await page.getByRole('dialog',{name:'Operation paused',exact:true}).getByRole('button',{name:'Resume operation',exact:true}).click();
 await waitFor(async()=>await seconds()<paused,'Resumed countdown did not decrease',6000);
 activeCase.countdown={first,afterLive,paused,afterResume:await seconds()};await pause(page);await checkpoint(page,'countdown-resumed-then-paused');await leave(page,baseline);await checkpoint(page,'menu-after-countdown');
}
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await({chromium,firefox,webkit})[engine].launch({headless,...engine==='chromium'?{channel:'chromium'}:{}});report.browser=browser.version();
 for(const viewport of [{width:1600,height:900},{width:1280,height:720},{width:1440,height:900},{width:1728,height:1117}])for(const scale of [1,1.5]){
  activeCase={id:`${viewport.width}x${viewport.height}-scale${scale*100}`,viewport,scale,status:'running',checkpoints:[]};report.cases.push(activeCase);phase='first-run';
  const context=await browser.newContext({viewport,acceptDownloads:true});
  try{
   // Passive, runtime-specific lifecycle/request observation. Pixi decoder
   // workers are intentionally excluded; no message arguments/state are changed.
   await context.addInitScript(()=>{
    const Native=window.Worker,metrics={created:0,terminated:0,live:0,frames:0,methods:{},previews:[],lastClock:null};window.__clarityWorkers=metrics;
    window.Worker=class extends Native{
     constructor(url,options){super(url,options);let runtime=false;try{runtime=new URL(String(url),location.href).pathname==='/runtime/worker.js'}catch{}
      if(!runtime)return;metrics.created++;metrics.live++;let ended=false;const post=this.postMessage,terminate=this.terminate,pending=new Map();
      this.postMessage=function(message,...rest){if(typeof message?.method==='string'){metrics.methods[message.method]=(metrics.methods[message.method]??0)+1;if(message.method==='previewOrders')pending.set(message.id,message.method)}return post.call(this,message,...rest)};
      this.terminate=function(){if(!ended){ended=true;metrics.terminated++;metrics.live--}return terminate.call(this)};
      this.addEventListener('message',event=>{const message=event.data;if(message?.event==='frame')metrics.frames++;if(message?.event==='clock')metrics.lastClock={paused:message.paused,speed:message.speed,stalled:message.stalled};
       if(pending.delete(message?.id)){metrics.previews.push({ok:message.ok,tick:message.result?.tick,results:(message.result?.results??[]).map(result=>({accepted:result.accepted,code:result.code,tick:result.tick}))});if(metrics.previews.length>256)metrics.previews.shift()}
      });
     }
    };
   });
   const page=await context.newPage();activePage=page;page.setDefaultTimeout(90000);
   page.on('pageerror',error=>report.errors.push({...stamp(),kind:'pageerror',message:error.message}));
   page.on('console',message=>{if(message.type()==='error')report.errors.push({...stamp(),kind:'console',message:message.text()})});
   page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({...stamp(),url:response.url(),status:response.status()})});
   page.on('requestfailed',request=>report.requestFailures.push({...stamp(),url:request.url(),message:request.failure()?.errorText}));
   await page.goto(origin);await page.getByRole('dialog',{name:'Welcome, commander',exact:true}).waitFor();await page.getByLabel('Interface scale',{exact:true}).selectOption(String(scale));
   await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await idle(page);await (await menu(page)).waitFor();
   const baseline=(await workers(page)).live;assert(baseline>=1,'Validator Go worker missing');activeCase.workerBaseline=baseline;
   await clarityCourse(page,baseline);await countdownCourse(page,baseline);
   await page.reload();await idle(page);await (await menu(page)).waitFor();assert.equal(await page.getByRole('dialog',{name:'Welcome, commander',exact:true}).count(),0);
   await (await menu(page)).getByRole('button',{name:'Load operation',exact:true}).click();await page.getByText(activeCase.savedName,{exact:true}).waitFor();
   await checkpoint(page,'menu-reload-retains-save');
   assert.deepEqual(report.errors.filter(value=>value.case===activeCase.id),[]);assert.deepEqual(report.httpErrors.filter(value=>value.case===activeCase.id),[]);
   activeCase.status='passed';
  }catch(error){activeCase.status='failed';activeCase.failure=String(error.stack??error);activeCase.failureWorkers=await workers(activePage).catch(()=>undefined);
   await activePage?.screenshot({path:path.join(out,`${activeCase.id}-failure.png`)}).catch(()=>{});
   await writeFile(path.join(out,`${activeCase.id}-failure.txt`),await activePage?.locator('body').innerText().catch(()=>'' )??'');throw error;
  }finally{await context.close();activePage=undefined;await flush()}
 }
 assert.deepEqual(report.sourceChanges,[]);assert.equal(report.cases.length,8);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1}
finally{
 try{await browser?.close()}finally{if(server.listening)await new Promise(resolve=>server.close(resolve));report.finished=new Date().toISOString();await flush()}
 console.log(report.status,report.failure??`${report.cases.length} actual product cases`);
}
