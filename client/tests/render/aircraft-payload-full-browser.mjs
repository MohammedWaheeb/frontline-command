// Browser plugin not available. Parent owns serial Playwright execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';

const root=fileURLToPath(new URL('../../../',import.meta.url)),argv=process.argv.slice(2),args={};
assert.equal(argv.length%2,0,'Use paired --product --native --oracle --out [--engine] [--build-only true]');
for(let i=0;i<argv.length;i+=2){assert(['--product','--native','--oracle','--out','--engine','--build-only'].includes(argv[i]));assert(!Object.hasOwn(args,argv[i]));args[argv[i]]=argv[i+1]}
assert(args['--product']&&args['--native']&&args['--oracle']&&args['--out']);const engine=args['--engine']??'chromium';assert(['chromium','firefox','webkit'].includes(engine));
assert(args['--build-only']===undefined||['true','false'].includes(args['--build-only']));
const product=await realpath(path.resolve(args['--product'])),native=await realpath(path.resolve(args['--native'])),oracle=await realpath(path.resolve(args['--oracle'])),out=path.resolve(args['--out']);await mkdir(path.dirname(out),{recursive:true});await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,null,2),types=['US.fighter','IR.strike'];
const report={status:'preflight',started:new Date().toISOString(),engine,product,native,oracle,scope:'Actual Go prepared one-round/infrastructure course, actual frozen Go WASM Session load/seek delivery equality and last-shot replay continuation and frozen v19 ArtLibrary/ActorVisual/BattlefieldRenderer with complete USfighter/IRstrike art. No paid opening, gunship coverage, actual App controls, live online match, total memory, performance or release claim.',errors:[],warnings:[],httpErrors:[],requestFailures:[],boundaries:[],replays:[],deferred:[],culling:[],served:{}};
let browser,page,server,temp,phase='preflight',hold=false,held=[],gateReached;
const frozenInputs=new Map();
async function pinned(file,digest){const bytes=await readFile(file);assert.equal(sha(bytes),digest,'Frozen input changed: '+file);frozenInputs.set(file,digest);return bytes}
const release=()=>{hold=false;for(const send of held.splice(0))send()};
try{
 const overlay=path.dirname(product),overlayBytes=await readFile(path.join(overlay,'build.json')),overlayReceipt=JSON.parse(overlayBytes);
 assert.equal(sha(overlayBytes),'069233376b8c34528986aa3712309fe0802e05a996136205740d3ee55ef2d964','Wrong five-asset freeze');assert.equal(overlayReceipt.base_unchanged,true);
 const base=path.resolve(root,overlayReceipt.base),baseBytes=await readFile(path.join(base,'build.json')),baseReceipt=JSON.parse(baseBytes),source=path.join(base,'source/client');
 assert.equal(sha(baseBytes),overlayReceipt.base_build_sha256);assert.equal(sha(await readFile(path.join(overlay,'base-build.json'))),sha(baseBytes));assert.equal(baseReceipt.sourceDigest,'38b29b7f2664424d0a92830a325eb1afdc81b4ee025c7ba3b59f4d4c0e1ec549');
 assert.equal(sha(await readFile(path.resolve(root,overlayReceipt.base_lock))),overlayReceipt.base_lock_sha256);
 for(const [name,digest]of Object.entries(baseReceipt.sourceFiles))await pinned(path.join(source,name),digest);
 for(const name of ['frontline.wasm','wasm_exec.js','worker.js','version.json'])await pinned(path.join(product,'runtime',name),baseReceipt.runtime.files[name].sha256);
 const nativeBytes=await readFile(path.join(native,'receipt.json')),nativeReceipt=JSON.parse(nativeBytes);assert.equal(nativeReceipt.status,'passed');assert(nativeReceipt.source_verified_after);
 assert.equal(nativeReceipt.source_lock_sha256,'6cd1adb63bf12026a496355cc2d5f44a72322e5ba61bee1cb762a1c5960c9387');assert.equal(sha(await readFile(path.join(native,'source-lock.json'))),nativeReceipt.source_lock_sha256);
 const sourceLock=JSON.parse(await readFile(path.join(native,'source-lock.json')));assert.equal(sourceLock.base_lock_sha256,baseReceipt.runtime.source_lock_sha256);assert(sourceLock.base_production_exact);
 for(const [name,digest]of Object.entries(nativeReceipt.artifacts))await pinned(path.join(native,name),digest);
 const oracleBytes=await readFile(path.join(oracle,'receipt.json')),oracleReceipt=JSON.parse(oracleBytes);assert.equal(sha(oracleBytes),'10e9427176941454d6665827a5f72aed67bf8231bbb711664008c78b139c90ac','Wrong adapter delivery oracle');assert.equal(oracleReceipt.status,'passed');assert(oracleReceipt.source_verified_after&&oracleReceipt.original_artifacts_verified_after);assert.equal(oracleReceipt.wire_records,84);assert.equal(oracleReceipt.input_receipt_sha256,sha(nativeBytes));
 const oracleLock=await readFile(path.join(oracle,'source-lock.json'));assert.equal(sha(oracleLock),oracleReceipt.source_lock_sha256);assert.equal(JSON.parse(oracleLock).base_source_lock_sha256,nativeReceipt.source_lock_sha256);assert(JSON.parse(oracleLock).base_files_exact);
 for(const [name,digest]of Object.entries(oracleReceipt.artifacts))await pinned(path.join(oracle,name),digest);
 const packBytes=await readFile(path.join(product,'assets/packs/base.json'));assert.equal(sha(packBytes),overlayReceipt.pack_sha256);const pack=JSON.parse(packBytes),expected=new Map(pack.files.map(f=>[f.path,{bytes:f.bytes,sha256:f.sha256}]));
 const index=JSON.parse(await readFile(path.join(product,'art/index.json'))),plan={courses:{},oracles:{}};
 for(const type of types){
  const asset=overlayReceipt.assets.find(a=>a.id==='unit.'+type);assert(asset);assert.equal(asset.pose_count,type==='US.fighter'?896:832);
  const metadata=JSON.parse(await readFile(path.join(product,'art',index.sprites[asset.id])));assert.equal(metadata.id,asset.id);assert.equal(metadata.states.reduce((n,s)=>n+s.frames*s.directions,0),asset.pose_count);
  for(const state of ['rearm','rearm_empty','parked','parked_empty','fire','fire_empty'])assert(metadata.states.some(s=>s.name===state),'Missing actual authored state '+state);
  const result=JSON.parse(await readFile(path.join(native,type,'result.json')));assert.equal(result.status,'passed');assert.equal(result.points,10);assert(result.replay_views_exact&&result.replay_checkpoints_removed);
  const course=JSON.parse(await readFile(path.join(native,type,'course.json')));assert.equal(course.length,10);
  for(const point of course){const own=point.owned.entities.find(e=>e.id===point.actor),foreign=point.foreign.entities.find(e=>e.id===point.actor);assert.equal(own.type,type);assert.equal(foreign.type,type);assert(own.private&&!foreign.private,'Prepared course is not an authorized owner/visible-foreign pair')}
  plan.courses[type]=course;plan.oracles[type]=JSON.parse(await readFile(path.join(oracle,type,'oracle.json')));
  for(const mode of ['load','seek'])for(const point of course)for(const who of ['owned','foreign'])assert(plan.oracles[type][mode][point.stage][who].wire_sha256);
  for(const who of ['owned','foreign'])assert(plan.oracles[type].continuation['02-final-round'][who].view.events.some(e=>e.kind==='weapon_fired')); 
 }
 const fixture=fileURLToPath(new URL('aircraft-payload-full-fixture.ts',import.meta.url)),fixtureBytes=await readFile(fixture),driverBytes=await readFile(fileURLToPath(import.meta.url));await writeFile(path.join(out,'fixture.ts'),fixtureBytes);await writeFile(path.join(out,'driver.mjs'),driverBytes);await writeFile(path.join(out,'plan.json'),json(plan));
 temp=await mkdtemp(path.join(tmpdir(),'frontline-payload-full-'));
 await build({entryPoints:[fixture],outfile:path.join(temp,'fixture.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'exact-frozen-v19',setup(b){b.onResolve({filter:/^\.\.\/\.\.\/src\//},a=>{if(a.importer!==fixture)return;const rel=a.path.slice('../../src/'.length);return {path:path.join(source,'src',rel+(path.extname(rel)?'':'.ts'))}})}}]});
 const bundle=await readFile(path.join(temp,'fixture.js'));await writeFile(path.join(out,'fixture.js'),bundle);
 report.identity={overlayReceiptSHA256:sha(overlayBytes),baseReceiptSHA256:sha(baseBytes),sourceDigest:baseReceipt.sourceDigest,runtime:baseReceipt.runtime,nativeReceiptSHA256:sha(nativeBytes),adapterOracleReceiptSHA256:sha(oracleBytes),adapterOracleSourceLockSHA256:oracleReceipt.source_lock_sha256,nativeSourceLockSHA256:nativeReceipt.source_lock_sha256,packSHA256:sha(packBytes),fixtureSHA256:sha(fixtureBytes),driverSHA256:sha(driverBytes),bundleSHA256:sha(bundle),planSHA256:sha(Buffer.from(json(plan))),types};
 for(const [file,bytes]of [[path.join(overlay,'build.json'),overlayBytes],[path.join(base,'build.json'),baseBytes],[path.join(native,'receipt.json'),nativeBytes],[path.join(oracle,'receipt.json'),oracleBytes],[path.join(product,'assets/packs/base.json'),packBytes]])frozenInputs.set(file,sha(bytes));
 if(args['--build-only']==='true'){report.status='compiled-only';report.noBrowserOrServer=true}else{
  const html='<!doctype html><html><head><meta charset="utf-8"><title>Real aircraft payload boundaries</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden;background:#191b14}#caption{position:fixed;top:12px;left:12px;background:#191b14;color:#ddc387;font:13px Arial;padding:10px;z-index:5;pointer-events:none}</style></head><body><div id="field"></div><div id="caption">Loading actual Go boundaries</div><script type="module" src="/fixture.js"></script></body></html>';
  const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.svg':'image/svg+xml'};
  server=createServer(async(req,res)=>{try{
   const url=decodeURIComponent(new URL(req.url,'http://local').pathname);assert(!url.split('/').includes('..'));
   if(url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
   let bytes;if(url==='/fixture.js')bytes=bundle;else if(url==='/plan.json')bytes=Buffer.from(json(plan));
   else if(url.startsWith('/native/')){const name=url.slice('/native/'.length);assert(nativeReceipt.artifacts[name]);bytes=await readFile(path.join(native,name));assert.equal(sha(bytes),nativeReceipt.artifacts[name])}
   else{assert(expected.has(url),'Unlisted product asset '+url);bytes=await readFile(path.join(product,url.slice(1)));assert.deepEqual({bytes:bytes.length,sha256:sha(bytes)},expected.get(url),'Frozen served file changed');report.served[url]=expected.get(url)}
   const send=()=>{if(!res.destroyed){res.setHeader('Content-Type',mime[path.extname(url)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(bytes)}};
   if(hold&&url.endsWith('.png')){held.push(send);if(url.includes('.beauty.'))gateReached?.(url);return}send();
  }catch(error){res.statusCode=404;res.end(String(error))}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await({chromium,firefox,webkit})[engine].launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(120000);
  await page.addInitScript(()=>{const Base=window.Worker,live=new Set();window.Worker=class extends Base{constructor(...args){super(...args);if(args[1]?.name==='Frontline Go simulation')live.add(this)}terminate(){live.delete(this);return super.terminate()}};window.payloadWorkerCount=()=>live.size});
  page.on('pageerror',e=>report.errors.push({phase,kind:'page',message:e.stack??e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,kind:'console',message:m.text()});if(m.type()==='warning')report.warnings.push({phase,message:m.text()})});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({phase,url:r.url(),status:r.status()})});page.on('requestfailed',r=>report.requestFailures.push({phase,url:r.url(),failure:r.failure()?.errorText}));
  phase='boot';await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.body.dataset.ready==='true');report.page={url:page.url(),title:await page.title()};assert.equal(report.page.title,'Real aircraft payload boundaries');assert.equal(await page.locator('vite-error-overlay').count(),0);assert.equal(await page.locator('#field').count(),1);assert.equal(await page.evaluate(()=>window.payloadWorkerCount()),1);report.browserVersion=browser.version();
  for(const quality of ['standard','high'])for(const type of types){
   for(let index=0;index<10;index++)for(const who of ['owned','foreign']){
    phase=`${type}-${quality}-${index}-${who}`;const record=await page.evaluate(a=>window.payloadFullQA.boundary(a.type,a.index,a.who,a.quality),{type,index,who,quality});report.boundaries.push(record);await page.screenshot({path:path.join(out,phase+'.png')});
    if(index===4&&who==='owned'){report.culling.push({type,quality,...await page.evaluate(()=>window.payloadFullQA.cull())})}
   }
   phase=`${type}-${quality}-replay`;report.replays.push({type,quality,records:await page.evaluate(type=>window.payloadFullQA.replay(type),type)});
   phase=`${type}-${quality}-deferred`;const before=await page.evaluate(a=>window.payloadFullQA.prepareDeferred(a.type,a.quality),{type,quality});
   hold=true;let timer;const reached=new Promise((resolve,reject)=>{gateReached=resolve;timer=setTimeout(()=>reject(Error('No deferred real beauty PNG request')),30000)});
   let pending,url;try{[pending,url]=await Promise.all([page.evaluate(()=>window.payloadFullQA.startDeferred()),reached])}finally{clearTimeout(timer);release()}
   const after=await page.evaluate(()=>window.payloadFullQA.finishDeferred());report.deferred.push({type,quality,before,pending,url,after});await page.screenshot({path:path.join(out,phase+'.png')});
  }
  phase='dispose';report.disposal=await page.evaluate(()=>window.payloadFullQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.art.residentPages,0);assert.equal(report.disposal.art.pickingBytes,0);assert.deepEqual(report.disposal.errors,[]);assert.equal(await page.evaluate(()=>window.payloadWorkerCount()),0);report.status='passed';
 }
}catch(error){report.status='failed';report.failedPhase=phase;report.failure=String(error.stack??error);process.exitCode=1;if(page){const mismatch=await page.evaluate(()=>window.payloadWireMismatch).catch(()=>undefined);if(mismatch)await writeFile(path.join(out,'wire-mismatch.json'),json(mismatch));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}}
finally{
 release();if(page){report.cleanup=await page.evaluate(()=>window.payloadFullQA?.dispose()).catch(e=>({failure:String(e)}));report.workersAfter=await page.evaluate(()=>window.payloadWorkerCount?.()).catch(()=>undefined)}
 await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));if(temp)await rm(temp,{recursive:true,force:true});
 try{for(const [file,digest]of frozenInputs)assert.equal(sha(await readFile(file)),digest,'Frozen input drifted during course: '+file);report.inputsVerifiedAfter=frozenInputs.size;assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.requestFailures,[]);assert(!report.cleanup?.failure);if(report.status==='passed'){assert.equal(report.cleanup.canvases,0);assert.equal(report.workersAfter,0)}}catch(error){report.finalDiagnosticFailure=String(error.stack??error);report.status='failed';process.exitCode=1}
 report.closedAt=new Date().toISOString();await writeFile(path.join(out,'browser.json'),json(report));console.log(json({out,status:report.status,failure:report.failure,boundaries:report.boundaries.length}));
}
