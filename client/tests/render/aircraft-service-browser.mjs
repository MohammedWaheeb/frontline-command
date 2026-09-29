import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const args=Object.fromEntries(process.argv.slice(2).filter(v=>v!=='--build-only').reduce((r,v,i,a)=>i%2?r:[...r,[v,a[i+1]]],[]));
assert(args['--product']&&args['--native']&&args['--out'],'Provide immutable product, passed native evidence and new output directory.');
const product=path.resolve(args['--product']),frozen=path.dirname(product),native=path.resolve(args['--native']),out=path.resolve(args['--out']);await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2);
const buildReceipt=JSON.parse(await readFile(path.join(frozen,'build.json'))),oracle=JSON.parse(await readFile(path.join(native,'report.json')));
assert.equal(buildReceipt.sourceDigest,'38b29b7f2664424d0a92830a325eb1afdc81b4ee025c7ba3b59f4d4c0e1ec549','This bounded course is pinned to reviewed integration-v19.');
assert.equal(buildReceipt.runtime.source_lock_sha256,oracle.receipt.sourceLockSHA256);assert.equal(oracle.status,'passed');
for(const [name,digest]of Object.entries(buildReceipt.sourceFiles))assert.equal(sha(await readFile(path.join(frozen,'source/client',name))),digest,name);
for(const name of ['frontline.wasm','worker.js','wasm_exec.js','version.json'])assert.equal(sha(await readFile(path.join(product,'runtime',name))),buildReceipt.runtime.files[name].sha256,name);
assert.equal(sha(await readFile(new URL('aircraft-service-course.mjs',import.meta.url))),oracle.sourceSHA256);
assert.equal(sha(await readFile(path.join(native,'mission.json'))),oracle.missionSHA256);assert.equal(sha(await readFile(path.join(native,'map.json'))),oracle.mapSHA256);
const source=path.join(out,'source'),tests=path.join(source,'tests/render');await mkdir(tests,{recursive:true});
await symlink(path.join(frozen,'source/client/src'),path.join(source,'src'),'dir');
const ownFiles={};for(const name of ['aircraft-service-fixture.ts','aircraft-service-course.mjs','aircraft-service-browser.mjs']){const b=await readFile(new URL(name,import.meta.url));await writeFile(path.join(tests,name),b);ownFiles[name]=sha(b)}
await build({entryPoints:[path.join(tests,'aircraft-service-fixture.ts')],outfile:path.join(out,'fixture.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',nodePaths:[path.join(root,'client/node_modules')]});
const report={createdAt:new Date().toISOString(),scope:'Actual unchanged US04 Go/WASM command course rendered through immutable v19 components. Same commands and native stage hashes; no save/view injection or mission-win claim. AudioDirector uses a recording mixer, not speaker/audio-asset acceptance.',product,buildReceiptSHA256:sha(await readFile(path.join(frozen,'build.json'))),sourceDigest:buildReceipt.sourceDigest,runtime:buildReceipt.runtime,artIndexSHA256:sha(await readFile(path.join(product,'art/index.json'))),native,oracleSHA256:sha(await readFile(path.join(native,'report.json'))),ownFiles,fixtureSHA256:sha(await readFile(path.join(out,'fixture.js'))),browser:args['--browser']??'chromium',errors:[],consoleErrors:[],httpErrors:[],stages:[],checks:{}};
await writeFile(path.join(out,'receipt.json'),json(report));
if(process.argv.includes('--build-only')){console.log(json({out,compiled:true,fixtureSHA256:report.fixtureSHA256,noBrowserOrServer:true}));process.exit(0)}

const html='<!doctype html><html><head><meta charset="utf-8"><title>Actual aircraft service status course</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden;background:#171813}#caption{position:fixed;left:12px;top:12px;background:#181b13;color:#e3c88b;padding:8px;font:12px Arial;z-index:3;pointer-events:none}</style></head><body><div id="field"></div><div id="caption">Loading authored service course</div><script type="module" src="/fixture.js"></script></body></html>';
const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const url=decodeURIComponent(new URL(req.url,'http://local').pathname);assert(!url.split('/').includes('..'));
 if(url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
 const file=url==='/fixture.js'?path.join(out,'fixture.js'):url==='/course-map.json'?path.join(native,'map.json'):url==='/course-mission.json'?path.join(native,'mission.json'):path.join(product,url.slice(1));
 res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(error){res.statusCode=404;res.end(String(error))}});
let browser,page;
const has=(stage,id,badge)=>stage.models.find(e=>e.id===id)?.status.badges.some(b=>b.id===badge);
const capture=async name=>{await page.screenshot({path:path.join(out,name+'.png')})};
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const engine={chromium,firefox,webkit}[report.browser];assert(engine,'Unknown browser');
 browser=await engine.launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(90000);
 page.on('pageerror',e=>report.errors.push(String(e.stack??e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.body.dataset.ready==='true');report.browserVersion=browser.version();
 await page.evaluate(()=>{void window.serviceQA.start()});
 for(const expected of oracle.stages){
  await page.waitForFunction(name=>window.serviceQA.read().stage?.name===name||window.serviceQA.read().failure,expected.name);
  const value=await page.evaluate(()=>window.serviceQA.read());assert.equal(value.failure,undefined);const stage=value.stage;assert.equal(stage.hash,expected.hash,expected.name+' native/WASM hash');assert.equal(stage.tick,expected.tick);
  const primary=stage.ids[0];
  if(['a-original-service','a-low-power-active-service','a-paid-fighter-service','a-replacement-service'].includes(stage.name))assert(has(stage,primary,'servicing'));
  if(stage.name==='a-disabled-home'){
   assert(has(stage,primary,'service_paused'));assert(!has(stage,primary,'servicing'));assert(has(stage,stage.ids[1],'service_full'));
   const producer=await page.evaluate(id=>window.serviceQA.focus(id),stage.ids[1]);assert(producer.visual.some(v=>v.id===stage.ids[1]&&v.text.some(t=>t.includes('Aircraft service unavailable'))));await capture('a-disabled-producer-1600');
   await page.evaluate(id=>window.serviceQA.focus(id),primary);
  }
  if(stage.name==='a-outbound-queued-return')assert(!has(stage,primary,'return'));
  if(stage.name==='a-active-return')assert(has(stage,primary,'return'));
  if(stage.name==='a-reassigned-service-loss'){assert(has(stage,primary,'emergency_takeoff'));assert(!has(stage,primary,'no_home'));assert(!stage.audio.some(c=>c.id.endsWith('.no_landing_slot')))}
  if(stage.name==='b-no-home-grounded'){assert(has(stage,primary,'emergency_takeoff'));assert(has(stage,primary,'no_home'));assert(stage.audio.some(c=>c.id.endsWith('.no_landing_slot')))}
  if(stage.name==='b-no-home-airborne'){assert(!has(stage,primary,'emergency_takeoff'));assert(has(stage,primary,'no_home'))}
  if(stage.name==='b-home-recovered')assert(!has(stage,primary,'no_home'));
  if(stage.name==='a-disabled-home'){
   const focused=await page.evaluate(id=>window.serviceQA.focus(id),primary);assert(focused.visual.some(v=>v.id===primary&&v.text.some(t=>t.includes('Service paused: base disabled'))));
   report.checks.paused=await page.evaluate(()=>window.serviceQA.paused());assert.equal(report.checks.paused.hash,report.checks.paused.afterHash);assert.deepEqual(report.checks.paused.before,report.checks.paused.after);
   report.checks.reduced=await page.evaluate(()=>window.serviceQA.reduced());assert.deepEqual(report.checks.reduced.before,report.checks.reduced.after);
  }
  await capture(stage.name+'-1600');
  if(['a-disabled-home','b-no-home-grounded'].includes(stage.name)){await page.setViewportSize({width:1280,height:720});await page.evaluate(id=>window.serviceQA.focus(id),primary);await capture(stage.name+'-1280');await page.setViewportSize({width:1600,height:900});await page.evaluate(id=>window.serviceQA.focus(id),primary)}
  report.stages.push(stage);await page.evaluate(()=>window.serviceQA.next());
 }
 await page.waitForFunction(()=>window.serviceQA.read().done);const final=await page.evaluate(()=>window.serviceQA.read());assert.equal(final.failure,undefined);
 for(const name of ['a','b'])assert.equal(final.cases[name].hash,oracle.cases[name].hash);report.cases=final.cases;
 report.checks.restore=await page.evaluate(()=>window.serviceQA.saveRestore());assert.equal(report.checks.restore.hash,report.checks.restore.restoredHash);assert.deepEqual(report.checks.restore.before,report.checks.restore.after);
 const back=oracle.stages.find(s=>s.name==='a-disabled-home');report.checks.replay=await page.evaluate(({tick})=>window.serviceQA.replay('a',tick),back);assert.equal(report.checks.replay.hash,back.hash);
 await page.evaluate(id=>window.serviceQA.focus(id),back.ids[0]);await capture('replay-disabled-home-1600');report.checks.cull=await page.evaluate(id=>window.serviceQA.cull(id),back.ids[0]);assert(!report.checks.cull.away.some(v=>v.id===back.ids[0]));assert(report.checks.cull.after.some(v=>v.id===back.ids[0]));
 report.checks.finalRestore=await page.evaluate(()=>window.serviceQA.restore('b'));assert.equal(report.checks.finalRestore.hash,oracle.cases.b.hash);
 report.checks.disposal=await page.evaluate(()=>window.serviceQA.dispose());assert.equal(report.checks.disposal.canvases,0);assert.equal(report.checks.disposal.art.residentPages,0);assert.deepEqual(report.checks.disposal.errors,[]);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.httpErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1;if(page){await capture('failure').catch(()=>{});report.last=await page.evaluate(()=>window.serviceQA?.read()).catch(()=>undefined)}}
finally{
 if(page){
  report.cleanup=report.checks.disposal??await page.evaluate(()=>window.serviceQA?.dispose()).catch(error=>({failure:String(error)}));
  report.finalFixtureErrors=await page.evaluate(()=>window.serviceQA?.read().errors??[]).catch(error=>[String(error)]);
 }
 if(browser)try{await browser.close()}catch(error){report.errors.push(String(error))}
 if(server.listening)await new Promise(resolve=>server.close(resolve));
 // Preserve late diagnostics delivered during disposal/browser shutdown too.
 report.diagnosticReconciliation={afterBrowserClose:true,errors:report.errors.length,consoleErrors:report.consoleErrors.length,httpErrors:report.httpErrors.length};
 try{assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.httpErrors,[]);assert(!report.cleanup?.failure);assert.deepEqual(report.cleanup?.errors??[],[]);assert.deepEqual(report.finalFixtureErrors??[],[]);if(report.cleanup){assert.equal(report.cleanup.canvases,0);assert.equal(report.cleanup.art.residentPages,0)}}catch(error){report.finalDiagnosticFailure=String(error.stack??error);if(report.status==='passed')report.failure=report.finalDiagnosticFailure;report.status='failed';process.exitCode=1}
 report.closedAt=new Date().toISOString();await writeFile(path.join(out,'browser.json'),json(report));console.log(json({out,status:report.status,failure:report.failure,stages:report.stages.length}))
}
