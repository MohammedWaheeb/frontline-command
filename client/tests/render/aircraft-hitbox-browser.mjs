import {chromium,firefox,webkit} from 'playwright-core';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const engine=process.env.FRONTLINE_HITBOX_BROWSER??'chromium';
const root=fileURLToPath(new URL('../../../',import.meta.url)),client=path.join(root,'client'),base=path.join(root,'work/art/go-parking-browser-overlay');
const out=path.join(root,process.env.FRONTLINE_HITBOX_EVIDENCE??`work/evidence/aircraft-hitbox/${new Date().toISOString().replaceAll(':','-')}`),runtime=path.join(root,'work/owner-ranges-candidate/runtime'),binding=path.join(runtime,'frontline_pb.ts');
await mkdir(out,{recursive:true});const sha=data=>createHash('sha256').update(data).digest('hex'),served={};
async function exists(file){try{return(await stat(file)).isFile()}catch{return false}}
const types={'.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.js':'text/javascript','.wasm':'application/wasm','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=await createServer({configFile:false,root:client,publicDir:false,server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}},plugins:[{name:'actual-go-aircraft-hitbox',enforce:'pre',async resolveId(source,importer,options){if(/protocol\/frontline_pb(?:\.ts|\.js)?$/.test(source))return binding;if(importer===binding&&source.startsWith('@bufbuild/'))return this.resolve(source,path.join(client,'src/protocol/frontline_pb.ts'),options)},configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const p=new URL(req.url,'http://local').pathname;
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Frontline Command · aircraft painted body selection</title><link rel="icon" href="data:,"><style>body{margin:0;background:#17150f;color:#e8ddbf;font:13px monospace}#label{height:40px;padding:10px 16px;box-sizing:border-box}#field{height:calc(100vh - 40px)}</style><div id="label">ACTUAL GO PARKING SAVE · PAINTED BODY POINTER REGRESSION</div><div id="field"></div><script type="module" src="/tests/render/aircraft-hitbox-entry.ts"></script>');return}
 if(p.includes('..')||p.includes('\\')){res.statusCode=400;res.end();return}
 let file;
 if(p.startsWith('/runtime/'))file=path.join(runtime,p.slice('/runtime/'.length));
 else if(p.startsWith('/parking-fixtures/'))file=path.join(base,'overlay-v1/fixtures',p.slice('/parking-fixtures/'.length));
 else if(p.startsWith('/art/')){const rel=p.slice('/art/'.length),overlay=path.join(base,'browser-product-ink/art',rel);file=await exists(overlay)?overlay:path.join(root,'work/multiplayer-combat/build/product/art',rel)}
 else return next();
 try{const data=await readFile(file);served[p]={sha256:sha(data),bytes:data.length};res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.end(data)}catch(error){res.statusCode=404;res.end(String(error))}
 })}}]});
let controlledFailure='';
const report={engine,expectedLoadErrors:[],warnings:[],time:new Date().toISOString(),scope:'Actual Go0.3.4 six-aircraft save and native-scale authored parked poses; normal canvas clicks. Separate synthetic cliff presentation negative control, no changed Go map or movement claim. Sparse art overlay, not full asset release acceptance.',browserPlugin:'not available; existing Playwright workflow',cases:[],checks:[],errors:[],resources:[],served,source:{}};
for(const name of ['client/src/render/actors.ts','client/src/render/battlefield.ts','client/src/render/art.ts','client/tests/render/aircraft-hitbox-entry.ts','client/tests/render/aircraft-hitbox-browser.mjs'])report.source[name]=sha(await readFile(path.join(root,name)));
report.wasmSHA256=sha(await readFile(path.join(runtime,'frontline.wasm')));
await server.listen();const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{headless:false,channel:'chromium'}:{headless:true}),page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});page.setDefaultTimeout(90000);
page.on('pageerror',error=>report.errors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='warning')report.warnings.push(message.text());if(message.type()==='error'){if(controlledFailure&&message.location().url.endsWith(controlledFailure)&&message.text().includes('Failed to load resource'))report.expectedLoadErrors.push({kind:'console',text:message.text(),url:message.location().url});else report.errors.push(message.text())}});page.on('response',response=>{if(response.status()>=400){const row={url:response.url(),status:response.status()};if(controlledFailure&&response.url().endsWith(controlledFailure)&&response.status()===503)report.expectedLoadErrors.push({kind:'controlled-atlas-503',...row});else report.resources.push(row)}});
async function click(point,id,expected,label){const bounds=await page.locator('#field canvas').boundingBox();assert(bounds);await page.mouse.click(bounds.x+point.x,bounds.y+point.y);const events=await page.evaluate(()=>window.aircraftHitboxQA.takeClicks());assert.equal(events.length,1);const selected=events[0].hit?.kind==='entity'&&events[0].hit.id===id;report.checks.push({label,id,point,expected,actual:events[0].hit,passed:selected===expected})}
try{
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 report.page={url:page.url(),title:await page.title()};assert.equal(report.page.title,'Frontline Command · aircraft painted body selection');assert.equal(await page.locator('vite-error-overlay').count(),0);
 for(const viewport of [{width:1600,height:900},{width:1280,height:720}]){
  await page.setViewportSize(viewport);
  for(const quality of ['standard','high'])for(const id of [7,11]){
   const row=await page.evaluate(({id,quality})=>window.aircraftHitboxQA.prepare(id,quality,1,false),{id,quality});assert.equal(row.hash,row.afterHash);assert.deepEqual(row.errors,[]);report.cases.push({...row,viewport});
   const label=`${id}-${quality}-${viewport.width}`;
   await click(row.body,id,true,`${label}-opaque-body`);if(row.nearBody)await click(row.nearBody,id,true,`${label}-transparent-within-tolerance`);if(row.buildingFront)await click(row.buildingFront,6,true,`${label}-opaque-building-front`);assert(row.statistics.pickingBytes>0&&row.statistics.pickingBytes<=row.statistics.residentBytes/32+row.statistics.residentPages);await click(row.padding,id,false,`${label}-empty-atlas-padding`);if(row.shadow)await click(row.shadow,id,false,`${label}-shadow-outside-body`);
   await page.locator('#label').evaluate((node,label)=>{node.textContent=`ACTUAL NATIVE POSE · ${label} · POINTER EVIDENCE`},label);await page.screenshot({path:path.join(out,`${label}.png`)});
  }
 }
 for(const zoom of [.6,1.8]){const row=await page.evaluate(zoom=>window.aircraftHitboxQA.prepare(7,'standard',zoom,false),zoom);report.cases.push(row);await click(row.body,7,true,`zoom-${zoom}-body`);await click(row.nearBody,7,true,`zoom-${zoom}-tolerance`)}
 // Existing terrain depth semantics must continue rejecting a body point behind
 // an actual rendered foreground cliff; only this presentation surface is synthetic.
 const occlusion=await page.evaluate(()=>window.aircraftHitboxQA.prepare(7,'standard',1,true));report.cases.push(occlusion);assert(occlusion.occluded);assert.equal(occlusion.hash,occlusion.afterHash);await click(occlusion.occluded,7,false,'synthetic-foreground-cliff');await page.screenshot({path:path.join(out,'foreground-cliff.png')});
 const stable=await page.evaluate(()=>window.aircraftHitboxQA.prepare(7,'standard',1,false));
 report.eviction=await page.evaluate(()=>window.aircraftHitboxQA.evict());assert.equal(report.eviction.after.residentPages,0);assert.equal(report.eviction.after.pickingBytes,0);assert.equal(report.eviction.oldFrameStillHits,false);assert(report.eviction.sameSheet);
 report.reload=await page.evaluate(()=>window.aircraftHitboxQA.reload());assert.equal(report.reload.sheet.pickingBytes,report.eviction.before.pickingBytes);assert.equal(report.reload.oldFrameStillHits,false);await click(stable.body,7,true,'after-atlas-reload');
 await page.evaluate(()=>window.aircraftHitboxQA.start());const pickingBefore=await page.evaluate(()=>window.aircraftHitboxQA.statistics());await page.evaluate(()=>window.aircraftHitboxQA.loseGraphics());await page.waitForFunction(()=>window.aircraftHitboxQA.graphicsLost());const canvas=await page.locator('#field canvas').boundingBox();await page.mouse.click(canvas.x+stable.body.x,canvas.y+stable.body.y);assert.deepEqual(await page.evaluate(()=>window.aircraftHitboxQA.takeClicks()),[]);
 await page.evaluate(()=>window.aircraftHitboxQA.restoreGraphics());await page.waitForFunction(()=>!window.aircraftHitboxQA.graphicsLost());await page.evaluate(()=>window.aircraftHitboxQA.reload());await click(stable.body,7,true,'after-context-restore');report.contextRestore={pickingBefore,pickingAfter:await page.evaluate(()=>window.aircraftHitboxQA.statistics())};assert.equal(report.contextRestore.pickingAfter.pickingBytes,pickingBefore.pickingBytes);
 await page.evaluate(()=>window.aircraftHitboxQA.evict());controlledFailure='/art/sprites/unit.US.airlift/unit.US.airlift@1x.beauty.0.png';const failedRoute=`**${controlledFailure}`;await page.route(failedRoute,route=>route.fulfill({status:503,contentType:'text/plain',body:'Controlled atlas reload failure'}));
 report.failedReload=await page.evaluate(()=>window.aircraftHitboxQA.reload());report.failedPages=await page.evaluate(()=>window.aircraftHitboxQA.failedPages());assert.equal(report.failedPages.length,1);assert.equal(report.failedPages[0].pickingBytes,0);assert.equal(report.failedPages[0].resident,false);assert.equal(report.failedReload.oldFrameStillHits,false);await page.unroute(failedRoute);controlledFailure='';
 const recovered=await page.evaluate(()=>window.aircraftHitboxQA.prepare(7,'standard',1,false));await click(recovered.body,7,true,'fresh-scene-after-failed-reload');
 report.fallback=await page.evaluate(()=>window.aircraftHitboxQA.fallback());assert(report.fallback.missingArt);assert.equal(report.fallback.hash,report.fallback.afterHash);assert.equal(report.fallback.statistics.pickingBytes,0);await click(report.fallback.point,7,true,'explicit-development-fallback');
 report.disposal=await page.evaluate(()=>window.aircraftHitboxQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.statistics.residentPages,0);assert.equal(report.disposal.statistics.pickingBytes,0);assert.deepEqual(report.errors,[]);assert.deepEqual(report.resources,[]);
 assert(report.checks.every(check=>check.passed),JSON.stringify(report.checks.filter(check=>!check.passed)));report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}
finally{await writeFile(path.join(out,'browser.json'),JSON.stringify(report,(_key,item)=>typeof item==='bigint'?item.toString():item,2));await browser.close();await server.close();console.log(report.status,out,report.failure??'')}
