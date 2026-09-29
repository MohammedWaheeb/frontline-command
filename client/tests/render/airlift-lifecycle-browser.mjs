import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';

const root=fileURLToPath(new URL('../../../',import.meta.url)),argv=process.argv.slice(2),args={};assert.equal(argv.length%2,0);
for(let i=0;i<argv.length;i+=2){assert(['--product','--native','--out','--browser','--quality','--build-only'].includes(argv[i]));assert(!Object.hasOwn(args,argv[i]));args[argv[i]]=argv[i+1]}
assert(args['--product']&&args['--native']&&args['--out']);const product=path.resolve(args['--product']),overlay=path.dirname(product),native=path.resolve(args['--native']),out=path.resolve(args['--out']),engine=args['--browser']??'chromium',quality=args['--quality']??'standard';assert(['chromium','firefox','webkit'].includes(engine));assert(['standard','high'].includes(quality));await mkdir(path.dirname(out),{recursive:true});await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2),overlayBytes=await readFile(path.join(overlay,'build.json')),overlayReceipt=JSON.parse(overlayBytes),base=path.resolve(root,overlayReceipt.base),baseBytes=await readFile(path.join(overlay,'base-build.json')),baseReceipt=JSON.parse(baseBytes),oracle=JSON.parse(await readFile(path.join(native,'report.json')));
assert.equal(sha(baseBytes),overlayReceipt.base_build_sha256);assert.equal(sha(await readFile(path.join(base,'build.json'))),overlayReceipt.base_build_sha256);assert.equal(baseReceipt.sourceDigest,'38b29b7f2664424d0a92830a325eb1afdc81b4ee025c7ba3b59f4d4c0e1ec549');assert.equal(sha(await readFile(path.join(root,'work/art/aircraft-runtime-overlay-v1/base-locks',overlayReceipt.selected_base_lock))),overlayReceipt.selected_base_lock_sha256);
assert.equal(oracle.status,'passed');assert.equal(oracle.receipt.sourceLockSHA256,baseReceipt.runtime.source_lock_sha256);assert.equal(sha(await readFile(new URL('airlift-lifecycle-course.mjs',import.meta.url))),oracle.sourceSHA256);
for(const [file,digest]of Object.entries(baseReceipt.sourceFiles))assert.equal(sha(await readFile(path.join(base,'source/client',file))),digest,file);
for(const name of ['frontline.wasm','worker.js','wasm_exec.js','version.json'])assert.equal(sha(await readFile(path.join(product,'runtime',name))),baseReceipt.runtime.files[name].sha256);
for(const asset of overlayReceipt.assets)for(const file of asset.files){const bytes=await readFile(path.join(product,file.path.slice(1)));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256)}
assert.equal(sha(await readFile(path.join(product,'assets/packs/base.json'))),overlayReceipt.pack_sha256);assert.equal(sha(await readFile(path.join(native,'mission.json'))),oracle.missionSHA256);assert.equal(sha(await readFile(path.join(native,'map.json'))),oracle.mapSHA256);
const source=path.join(out,'source'),tests=path.join(source,'tests/render');await mkdir(tests,{recursive:true});await symlink(path.join(base,'source/client/src'),path.join(source,'src'),'dir');
const ownFiles={};for(const name of ['airlift-lifecycle-fixture.ts','airlift-lifecycle-course.mjs','airlift-lifecycle-browser.mjs']){const bytes=await readFile(new URL(name,import.meta.url));await writeFile(path.join(tests,name),bytes);ownFiles[name]=sha(bytes)}
await build({entryPoints:[path.join(tests,'airlift-lifecycle-fixture.ts')],outfile:path.join(out,'fixture.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',nodePaths:[path.join(root,'client/node_modules')]});
const report={started:new Date().toISOString(),scope:'Untouched authored US04 with ordinary paid Go airlift production and transport commands. Same native/WASM policy/hash, frozen v19 code plus byte-verified full656-pose airlift overlay. Cosmetic transition timing is observed, not simulation timing. No mission win, crash/damage/foreign-ammunition or complete release claim.',product,native,browser:engine,quality,sourceDigest:baseReceipt.sourceDigest,overlayReceiptSHA256:sha(overlayBytes),baseReceiptSHA256:sha(baseBytes),runtime:baseReceipt.runtime,oracleSHA256:sha(await readFile(path.join(native,'report.json'))),ownFiles,fixtureSHA256:sha(await readFile(path.join(out,'fixture.js'))),errors:[],consoleErrors:[],httpErrors:[],requestFailures:[],stages:[],checks:{}};
await writeFile(path.join(out,'receipt.json'),json(report));if(args['--build-only']==='true'){console.log(json({out,status:'compiled-only',noBrowserOrServer:true,fixtureSHA256:report.fixtureSHA256}));process.exit(0)}
const html='<!doctype html><html><head><meta charset="utf-8"><title>Paid airlift lifecycle</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden;background:#191b14}#caption{position:fixed;left:12px;top:12px;padding:8px;background:#171911;color:#dfc78d;font:12px Arial;z-index:3}</style></head><body><div id="field"></div><div id="caption">Loading actual paid airlift course</div><script type="module" src="/fixture.js"></script></body></html>';
const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const url=decodeURIComponent(new URL(req.url,'http://local').pathname);assert(!url.split('/').includes('..'));if(url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}const file=url==='/fixture.js'?path.join(out,'fixture.js'):url==='/course-map.json'?path.join(native,'map.json'):url==='/course-mission.json'?path.join(native,'mission.json'):path.join(product,url.slice(1));res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file))}catch(error){res.statusCode=404;res.end(String(error))}});
let browser,page;const capture=name=>page.screenshot({path:path.join(out,name+'.png')});
const primaryVisual=value=>value.aircraft.find(a=>a.id===value.ids[0]);
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await({chromium,firefox,webkit})[engine].launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(90000);
 page.on('pageerror',e=>report.errors.push(String(e.stack??e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),message:r.failure()?.errorText}));
 await page.goto(`http://127.0.0.1:${server.address().port}/?quality=${quality}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');report.browserVersion=browser.version();await page.evaluate(()=>{void window.airliftQA.start()});
 for(const expected of oracle.stages){
  await page.waitForFunction(name=>window.airliftQA.read().stage?.name===name||window.airliftQA.read().failure,expected.name);const current=await page.evaluate(()=>window.airliftQA.read());assert.equal(current.failure,undefined);const stage=current.stage;assert.equal(stage.tick,expected.tick);assert.equal(stage.hash,expected.hash);
  if(stage.name!=='paid-airlift-job'){
   const actor=primaryVisual(stage);assert(actor&&actor.sheet==='unit.US.airlift'&&!actor.standIn&&!actor.missingArt,'Actual full airlift art is required');assert(actor.parts.some(p=>p.visible&&p.beautyVisible),'Airlift body is not painted');
   if(stage.name==='pad-boarding'||stage.name==='second-pad-boarding')assert(actor.receivingBoarder,'Real owned board channel not forwarded to receiver');
  }
  await capture(stage.name+'-1600');stage.cosmetic=await page.evaluate(()=>window.airliftQA.cosmetic());assert.equal(stage.cosmetic.hash,stage.cosmetic.afterHash);
  if(stage.name!=='paid-airlift-job'){
   const actor=stage.cosmetic.aircraft.find(a=>a.id===stage.ids[0]),poses=actor.parts.filter(p=>p.visible&&p.beautyVisible).map(p=>p.poses.beauty?.state);
   if(stage.name.includes('boarding')||stage.name.includes('unloading'))assert(poses.includes('doors_open')||poses.includes('work_unload')||poses.includes('hover_low_board'),'Actual transport activity did not select authored door art');
   if(stage.name==='return-pad-service')assert(poses.includes('rearm'),'Real service did not select rearm after cosmetic landing');
   if(stage.name==='return-serviced')assert(poses.includes('parked'),'Completed service did not select parked art');
  }
  if(['pad-boarding','pad-unloading','field-unloading','return-pad-service'].includes(stage.name)){await capture(stage.name+'-settled-1600');await page.setViewportSize({width:1280,height:720});await page.evaluate(id=>window.airliftQA.focus(id),stage.ids[0]);await capture(stage.name+'-1280');await page.setViewportSize({width:1600,height:900});await page.evaluate(id=>window.airliftQA.focus(id),stage.ids[0])}
  report.stages.push(stage);await page.evaluate(()=>window.airliftQA.next());
 }
 await page.waitForFunction(()=>window.airliftQA.read().done);const final=await page.evaluate(()=>window.airliftQA.read());assert.equal(final.failure,undefined);assert.equal(final.cases.airlift.hash,oracle.cases.airlift.hash);report.final=final;
 report.checks.paused=await page.evaluate(()=>window.airliftQA.paused());assert.equal(report.checks.paused.hash,report.checks.paused.afterHash);assert.deepEqual(report.checks.paused.before,report.checks.paused.after);
 report.checks.reduced=await page.evaluate(()=>window.airliftQA.reduced());assert.deepEqual(report.checks.reduced.before,report.checks.reduced.after);
 report.checks.saveRestore=await page.evaluate(()=>window.airliftQA.saveRestore());assert.equal(report.checks.saveRestore.hash,report.checks.saveRestore.restoredHash);assert.deepEqual(report.checks.saveRestore.before,report.checks.saveRestore.after);
 const mid=oracle.stages.find(s=>s.name==='pad-boarding');report.checks.replay=await page.evaluate(({tick})=>window.airliftQA.replay('airlift',tick),mid);assert.equal(report.checks.replay.hash,mid.hash);await page.evaluate(id=>window.airliftQA.focus(id),mid.ids[0]);await capture('replay-pad-boarding');
 report.checks.cull=await page.evaluate(id=>window.airliftQA.cull(id),mid.ids[0]);assert(!report.checks.cull.away.some(a=>a.id===mid.ids[0]));assert(report.checks.cull.after.some(a=>a.id===mid.ids[0]));
 report.checks.finalRestore=await page.evaluate(()=>window.airliftQA.restore('airlift'));assert.equal(report.checks.finalRestore.hash,oracle.cases.airlift.hash);report.checks.disposal=await page.evaluate(()=>window.airliftQA.dispose());assert.equal(report.checks.disposal.canvases,0);assert.equal(report.checks.disposal.art.residentPages,0);assert.equal(report.checks.disposal.art.pickingBytes,0);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1;if(page){await capture('failure').catch(()=>{});report.last=await page.evaluate(()=>window.airliftQA?.read()).catch(()=>undefined)}}
finally{
 if(page)report.cleanup=await page.evaluate(()=>window.airliftQA?.dispose()).catch(e=>({failure:String(e)}));try{await browser?.close()}catch(e){report.errors.push(String(e))}if(server.listening)await new Promise(resolve=>server.close(resolve));
 try{assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.requestFailures,[]);assert(!report.cleanup?.failure);assert.deepEqual(report.cleanup?.errors??[],[]);if(report.cleanup){assert.equal(report.cleanup.canvases,0);assert.equal(report.cleanup.art.residentPages,0)}}catch(error){report.finalDiagnosticFailure=String(error.stack??error);if(report.status==='passed')report.failure=report.finalDiagnosticFailure;report.status='failed';process.exitCode=1}
 report.diagnosticReconciliation={afterBrowserClose:true};report.closedAt=new Date().toISOString();await writeFile(path.join(out,'browser.json'),json(report));console.log(json({out,status:report.status,failure:report.failure,stages:report.stages.length}));
}
