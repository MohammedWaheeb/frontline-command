// Isolated actual Pixi geometry, material/fog, click and occlusion acceptance.
// Existing Playwright runner used for reproducible pixel/CDP instrumentation.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';
import {artIndex} from '../../scripts/ui/art-plugin.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=process.env.FRONTLINE_HEIGHT_EVIDENCE??path.join(root,'work/evidence/terrain-height'),temp=await mkdtemp(path.join(tmpdir(),'frontline-height-'));await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'client/tests/render/terrain-height-fixture.ts')],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const index=await artIndex(path.join(root,'assets'));
const server=createServer(async(req,res)=>{try{
 const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Terrain height acceptance</title><link rel="icon" href="data:,"><style>html,body{margin:0;background:#14130f}canvas{display:block}</style><canvas id="terrain"></canvas><script type="module" src="/main.js"></script>');return}
 if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(index));return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/maps/')?path.join(root,'content',p):p.startsWith('/art/terrain/')?path.join(root,'assets/build',p.slice(5)):undefined;
 if(!file)throw Error('Not found');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/json');res.end(await readFile(file));
}catch(error){res.statusCode=404;res.end(String(error))}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const engine=process.env.FRONTLINE_HEIGHT_BROWSER??'chromium',browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{headless:false,channel:'chromium'}:{headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),report={date:new Date().toISOString(),scope:'Isolated public geometry and synthetic visual probes; no Go gameplay or product height integration claim',browser:browser.version(),errors:[],cases:[],status:'running'};
page.on('pageerror',error=>report.errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});
try{
 if(engine==='chromium'){const cdp=await browser.newBrowserCDPSession();report.gpu=(await cdp.send('SystemInfo.getInfo')).gpu}
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 for(const [id,mode] of [['synthetic','visible'],['synthetic','edge'],['relay-heights','visible'],['sa-04-intercept-window-layout','visible'],['stress','visible']]){
  const value=await page.evaluate(([id,mode])=>window.qa.show(id,mode),[id,mode]);report.cases.push(value);await page.screenshot({path:path.join(out,`${id}-${mode}@1600.png`)});
  for(const sample of value.drawOrder)assert.equal(sample.changedChannelsOverOne,0,'Fragment insertion order changed terrain/fog pixels');assert(value.matchingFogGeometry);
  value.culling=await page.evaluate(()=>window.qa.cullAudit());for(const sample of value.culling)assert.equal(sample.changedChannelsOverOne,0,'Viewport culling removed visible terrain or fog');assert(value.culling.some(s=>s.shown<s.total),'Culling course did not exclude any geometry');
  value.picking=await page.evaluate(()=>window.qa.pickAudit());assert(value.picking.checked>100);assert.deepEqual(value.picking.mismatches,[],'GPU frontmost triangle disagreed with picking');
 }
 await page.evaluate(()=>window.qa.show('synthetic','visible'));
 report.clicks=[];for(const point of [{x:15500,y:15500},{x:7500,y:14500},{x:9500,y:14500},{x:11500,y:14500},{x:14500,y:9500},{x:14500,y:19500}]){
  const value=await page.evaluate(p=>window.qa.inspect(p),point);await page.mouse.click(value.screen.x,value.screen.y);const actual=await page.evaluate(()=>window.qa.clicks.at(-1));report.clicks.push({point,...value,actual});assert(actual);assert(Math.abs(actual.point.x-point.x)<45&&Math.abs(actual.point.y-point.y)<45,'Actual click was not on the displayed surface');
 }
 report.unknown=await page.evaluate(()=>window.qa.unknownProbe());assert.equal(report.unknown.nonDarkInterior,0,'Unknown plateau rim leaked material');await page.screenshot({path:path.join(out,'synthetic-unknown@1600.png')});
 report.occlusion=await page.evaluate(()=>window.qa.probeOcclusion());assert(report.occlusion.occluded,'Near cliff failed to occlude a lower-ground visual probe');await page.screenshot({path:path.join(out,'synthetic-occlusion@1600.png')});
 await page.evaluate(()=>window.qa.show('relay-heights','edge'));await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>window.qa.resize(1280,720));await page.screenshot({path:path.join(out,'relay-heights-edge@1280.png')});
 await page.evaluate(()=>window.qa.dispose());report.disposed=await page.evaluate(()=>window.qa.stats());assert.deepEqual(report.disposed,{textures:0,fragments:0,probes:0});assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1}finally{await writeFile(path.join(out,'browser-stage2.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(JSON.stringify(report,null,2))}
