import {chromium,firefox,webkit} from 'playwright-core';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../../../',import.meta.url)),base=path.join(root,'work/owner-ranges-candidate');
const engine=process.env.FRONTLINE_BROWSER??'chromium',legacy=process.env.FRONTLINE_RANGE_LEGACY==='1',candidate=process.env.FRONTLINE_RANGE_CANDIDATE??(legacy?path.join(root,'work/owner-casualty-candidate'):base);
const out=path.resolve(root,process.env.FRONTLINE_RANGE_EVIDENCE??`work/owner-ranges-candidate/browser/${engine}${legacy?'-legacy':''}`),binding=path.join(base,'source/client/src/protocol/frontline_pb.ts');await mkdir(out,{recursive:true});
const server=await createServer({configFile:path.join(root,'client/vite.config.ts'),server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false},plugins:[{name:'owner-ranges-isolated-product',enforce:'pre',transformIndexHtml:html=>html.replace('/src/main.tsx','/tests/render/owner-ranges-entry.tsx'),async resolveId(source,importer,options){if(/protocol\/frontline_pb(?:\.ts|\.js)?$/.test(source))return binding;if(importer===binding&&source.startsWith('@bufbuild/'))return this.resolve(source,path.join(root,'client/src/protocol/frontline_pb.ts'),options)},configureServer(server){server.middlewares.use(async(req,res,next)=>{const p=new URL(req.url,'http://local').pathname;if(/^\/runtime\/(frontline\.wasm|worker\.js|wasm_exec\.js|version\.json)$/.test(p)){try{res.setHeader('Content-Type',p.endsWith('.wasm')?'application/wasm':p.endsWith('.json')?'application/json':'text/javascript');res.end(await readFile(path.join(candidate,'runtime',path.basename(p))))}catch(error){res.statusCode=500;res.end(String(error))}return}next()})}}]});
await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`,browser=await({chromium,firefox,webkit}[engine]).launch({headless:false,...engine==='chromium'?{channel:'chromium'}:{}}),page=await browser.newPage({viewport:{width:1600,height:900}});
page.setDefaultTimeout(90000);
const report={time:new Date().toISOString(),scope:'Unchanged product App, DOM save import and status controls; Go-produced initial mechanics fixtures. Harness pauses, restores exact saves, selects/cameras and steps normal Go ticks. This is presentation acceptance, not an economy playthrough.',engine,browser:browser.version(),legacy,candidate,errors:[],resources:[],requestFailures:[],buttonImage:[],cases:[],wasmSHA256:createHash('sha256').update(await readFile(path.join(candidate,'runtime/frontline.wasm'))).digest('hex')};
page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),failure:request.failure()}));page.on('response',async response=>{if(response.url().endsWith('/button_pressed@2x.png')){try{const bytes=await response.body();report.buttonImage.push({status:response.status(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})}catch(error){report.buttonImage.push({error:String(error)})}}});
page.on('pageerror',error=>report.errors.push(error.stack??error.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.resources.push({url:r.url(),status:r.status()})});
const bytes=async name=>Array.from(await readFile(path.join(base,'native-output',`ranges-${name}.start.save.json`)));
const load=async(name,player=1)=>page.evaluate(({data,player})=>window.ownerRangesQA.load(data,player),{data:await bytes(name),player});
const focus=async id=>page.evaluate(id=>window.ownerRangesQA.focus(id),id);
const dialog=page.getByRole('dialog',{name:'Unit status',exact:true});
const statusButton=page.getByTitle(/Inspect .* status/);
const open=async()=>{await statusButton.click();await dialog.waitFor();return dialog.innerText()};
const close=async()=>{await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog',{name:'Operation paused',exact:true}).count(),0);assert(await statusButton.evaluate(node=>node===document.activeElement))};
try{
 const save=Buffer.from(await bytes('fixed')).toString('utf8'),file=path.join(out,'course.save.json');
 await writeFile(file,JSON.stringify({format:'frontline-local-save',version:1,id:'owner-ranges-course',name:'Missile defense readout',local_players:[1,2],hash:'',engine:save}));
 await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await page.getByRole('button',{name:'Load operation',exact:true}).click();await page.getByLabel('Import save',{exact:true}).setInputFiles(file);await page.locator('.archive-row').filter({hasText:'Missile defense readout'}).getByRole('button',{name:'Load',exact:true}).click();await page.locator('.battlefield-canvas canvas').waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'});await page.waitForFunction(()=>window.ownerRangesQA.ready());
 const names=legacy?['fixed']:['fixed','fixed-low','fixed-shield','fixed-low-shield','mobile','mobile-low','mobile-upgrade','mobile-upgrade-shield','disabled','power-off','constructing','packed','full','partial','assigned'];
 for(const name of names){
  let view=await load(name);const defender=view.entities.find(entity=>entity.type==='abm'||entity.type==='SA.mobile_abm');assert(defender);view=await focus(defender.id);
  const text=await open(),entry={name,tick:view.tick,model:defender.ranges,diagnostics:view.diagnostics,text};
  if(legacy){assert.equal(defender.ranges,undefined);assert.equal(view.diagnostics.coverageRings,0);assert(!text.includes('Protected impact radius'));assert(text.includes('Interceptors'))}
  else{
   const d=defender.ranges.interception;assert.equal(view.diagnostics.coverageRings,1);assert.equal(view.diagnostics.assignments,d.assignments.length);assert(text.includes(`${d.radius/1000} tiles`));assert(text.includes(d.nextChargeTicks!==undefined?`${(d.nextChargeTicks/20).toFixed(1)}s`:name==='full'?'Magazine full':'Recharge paused'));assert(text.includes(`${name==='full'?2:name==='assigned'?1:0} / ${d.capacity}`));
   for(const assignment of d.assignments)assert(text.includes(`Missile #${assignment.projectile}`));
  }
  if(['fixed','fixed-low','mobile-upgrade-shield','assigned','disabled'].includes(name))await page.screenshot({path:path.join(out,`${name}-readout@1600.png`)});
  await page.keyboard.press('KeyA');assert.equal(await page.locator('.targeting-hint').count(),0);await close();
  if(name==='assigned')await page.screenshot({path:path.join(out,'assigned-battlefield@1600.png')});
  report.cases.push(entry);
 }
 if(!legacy){
  let view=await load('assigned');const defender=view.entities.find(entity=>entity.type==='abm');await focus(defender.id);
  report.save=await page.evaluate(()=>window.ownerRangesQA.saveRoundtrip());assert.equal(report.save.hash,report.save.savedHash);assert.deepEqual(report.save.after.entities,report.save.before.entities);
  report.paused=await page.evaluate(async()=>{const a=window.ownerRangesQA.inspect();await new Promise(resolve=>setTimeout(resolve,450));return {before:a,after:window.ownerRangesQA.inspect()}});assert.equal(report.paused.before.tick,report.paused.after.tick);assert.deepEqual(report.paused.before.entities,report.paused.after.entities);
  for(const [width,height,scale] of [[1600,900,1],[1280,720,1],[1280,720,1.5]]){
   await page.setViewportSize({width,height});await page.evaluate(scale=>window.ownerRangesQA.settings(scale,true),scale);await statusButton.focus();await statusButton.press('Enter');await dialog.waitFor();const box=await dialog.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);const overflow=await dialog.evaluate(node=>node.scrollWidth>node.clientWidth+1);assert(!overflow);await page.screenshot({path:path.join(out,`assigned-readout@${width}-scale${scale}.png`)});
   if(scale===1.5){const body=dialog;const before=await body.evaluate(node=>({height:node.clientHeight,scrollHeight:node.scrollHeight}));assert(before.scrollHeight>before.height);await body.hover();await page.mouse.wheel(0,800);await page.waitForTimeout(180);assert(await body.evaluate(node=>node.scrollTop>0));const field=dialog.getByRole('region',{name:'Observation and construction ranges'});await field.scrollIntoViewIfNeeded();const fb=await field.boundingBox(),bb=await body.boundingBox();assert(fb.y>=bb.y-1&&fb.y+fb.height<=bb.y+bb.height+1);await page.screenshot({path:path.join(out,`assigned-readout-scrolled@${width}-scale${scale}.png`)});await body.evaluate(node=>{node.scrollTop=0})}
   await close();
  }
  report.replay=await page.evaluate(()=>window.ownerRangesQA.replayRoundtrip(10));assert.equal(report.replay.hash,report.replay.replayHash);assert.equal(report.replay.atEnd.diagnostics.assignments,0);assert.equal(report.replay.atStart.diagnostics.assignments,1);
  view=await load('assigned',2);const foreign=view.entities.find(entity=>entity.type==='abm');assert(foreign);view=await focus(foreign.id);assert.equal(foreign.ranges,undefined);assert.equal(view.diagnostics.coverageRings,0);assert.equal(view.diagnostics.assignments,0);report.foreign=view;await page.screenshot({path:path.join(out,'foreign-no-private-range.png')});
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.resources,[]);report.disposal=await page.evaluate(()=>window.ownerRangesQA.dispose());assert.equal(report.disposal.canvases,0);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''));process.exitCode=1}
finally{await writeFile(path.join(out,'browser.json'),JSON.stringify(report,(_key,item)=>typeof item==='bigint'?item.toString():item,2));await browser.close();await server.close();console.log(report.status,report.error??'')}
