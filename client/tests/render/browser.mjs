import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {artIndex} from '../../scripts/ui/art-plugin.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url)),client=path.join(root,'client'),temporary=await mkdtemp(path.join(tmpdir(),'frontline-renderer-'));
const evidence=path.join(root,'work/evidence/render');await mkdir(evidence,{recursive:true});
await build({entryPoints:{main:path.join(client,'tests/render/fixture.ts'),shadow:path.join(client,'tests/render/shadow-fixture.ts')},outdir:temporary,bundle:true,format:'esm',platform:'browser',target:'es2022'});
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('bad path');
  if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Renderer acceptance</title><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden;background:#14130f}</style><div id="field"></div><script type="module" src="/main.js"></script>');return}
  if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await artIndex(path.join(root,'assets'))));return}
  if(p==='/shadow'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Shadow composition acceptance</title><script type="module" src="/shadow.js"></script>');return}
  const file=p==='/main.js'||p==='/shadow.js'?path.join(temporary,p.slice(1)):p.startsWith('/pilot/')?path.join(root,'work/art/building-roster/pilot',p.slice(7)):p.startsWith('/runtime/')?path.join(client,'public',p):p.startsWith('/art/ui/icons/build/')?path.join(root,'assets/build',p.slice(5)):p.startsWith('/art/ui/icons/')||p.startsWith('/art/ui/emblems/')?path.join(root,'assets',p.slice(5)):p.startsWith('/art/')?path.join(root,'assets/build',p.slice(5)):undefined;
  if(!file)throw Error('not found');res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(String(error))}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[],warnings=[];
page.on('pageerror',error=>errors.push(error.stack??String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());if(message.type()==='warning')warnings.push(message.text())});
const result={at:new Date().toISOString(),browser:browser.version(),status:'running',errors,warnings,checks:{}};
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 await page.screenshot({path:path.join(evidence,'initial-1600.png')});
 const art=await page.evaluate(()=>window.qa.art.statistics);assert(art.residentPages>0&&art.residentPages<art.indexedPages);assert(art.residentBytes<80*1024*1024);result.checks.lazyArt=art;
 const illustrationRequests=[];const trackIllustration=request=>illustrationRequests.push(new URL(request.url()).pathname);page.on('request',trackIllustration);
 const illustrations=await page.evaluate(async()=>{const library=window.qa.art;const build=await library.cameo('unit.US.rig','#e5b54f','idle',undefined,'build'),portrait=await library.cameo('unit.US.rig','#e5b54f'),red=await library.cameo('unit.US.rig','#b54835');const size=async url=>{if(!url)return;const img=new Image();img.src=url;await img.decode();return [img.width,img.height]};return {build:await size(build),portrait:await size(portrait),tinted:portrait!==red}});page.off('request',trackIllustration);
 assert.deepEqual(illustrations.build,[128,96]);assert.deepEqual(illustrations.portrait,[192,192]);assert(illustrations.tinted);assert(illustrationRequests.some(url=>url.includes('/art/ui/icons/build/US.rig@2x.beauty.png')));assert(illustrationRequests.every(url=>!url.startsWith('/art/sprites/')));result.checks.illustrations={...illustrations,requests:illustrationRequests};
 const hq=await page.evaluate(()=>{const q=window.qa,e=q.runtime.current.entities.find(e=>e.type==='hq'&&e.owner===1);return {id:e.id,bounds:q.renderer.bounds(e)}});
 await page.mouse.click((hq.bounds.left+hq.bounds.right)/2,(hq.bounds.top+hq.bounds.bottom)/2);
 const clicked=await page.evaluate(()=>window.qa.gestures.find(event=>event.kind==='click'));assert.equal(clicked.hit.id,hq.id);result.checks.selection='actual visible headquarters identity';
 await page.mouse.move(300,200);await page.mouse.down();await page.mouse.move(1100,750);await page.mouse.up();
 assert(await page.evaluate(()=>window.qa.gestures.some(event=>event.kind==='box')));result.checks.box='passed';
 const destruction=await page.evaluate(()=>window.qa.destroyObject());assert.equal(destruction.visibleObject,false);assert(destruction.feedbackPeak>0);assert.deepEqual(destruction.rubble,[90]);
 assert(destruction.shots.length>=2);assert(destruction.shots.every(shot=>shot.cue&&shot.duplicateStable));
 const destroyed=await page.evaluate(()=>window.qa.diagnostics());assert.equal(destroyed.tile,'rubble');assert.equal(destroyed.sourceTile,'open');result.checks.destruction={...destruction,...destroyed};
 await page.screenshot({path:path.join(evidence,'observed-rubble.png')});
 await page.evaluate(()=>window.qa.rewind());const restored=await page.evaluate(()=>window.qa.diagnostics());assert.equal(restored.tile,'open');assert.equal(restored.deaths,0);result.checks.rewind='original map and no future destruction effects';
 const accessibility=await page.evaluate(()=>window.qa.feedbackAccessibility());assert(accessibility.every(check=>check.peak===0));result.checks.feedbackAccessibility=accessibility;
 const deployment=await page.evaluate(()=>window.qa.deploymentAnimation());assert.equal(deployment.deploy.state,'deploy');assert.equal(deployment.pack.state,'pack');assert(deployment.deploy.progress>=400&&deployment.deploy.progress<=600);assert(deployment.pack.progress>=400&&deployment.pack.progress<=600);assert.equal(deployment.pack.source.state,'deploy');assert.equal(deployment.pack.source.index,deployment.pack.frames-1-deployment.pack.frame);result.checks.deploymentAnimation=deployment;
 await page.screenshot({path:path.join(evidence,'deployment-pack-progress.png')});
 const buildings=await page.evaluate(()=>window.qa.buildingAnimation());assert.equal(buildings.production.state,'produce');assert(buildings.demand>buildings.capacity);assert.equal(buildings.lowpower.state,'lowpower');assert.equal(buildings.disabled.state,'disabled');assert.equal(buildings.selling.state,'sell');assert.equal(buildings.selling.progress,500);assert.equal(buildings.selling.source.state,'construct');assert.equal(buildings.selling.source.index,buildings.selling.frames-1-buildings.selling.frame);result.checks.buildingAnimation=buildings;
 await page.screenshot({path:path.join(evidence,'building-production-power-selling.png')});
 const beforeLoss=await page.evaluate(async()=>{await window.qa.rewind();return {tick:window.qa.runtime.current.tick,hash:(await window.qa.runtime.save()).hash,gestures:window.qa.gestures.length}});
 await page.evaluate(()=>window.qa.loseGraphics());await page.waitForFunction(()=>window.qa.graphicsLost());
 const lostGestures=await page.evaluate(()=>window.qa.gestures.length);await page.mouse.click(600,400);assert.equal(await page.evaluate(()=>window.qa.gestures.length),lostGestures);
 const duringLoss=await page.evaluate(async()=>{await window.qa.runtime.step(20);const saved=await window.qa.runtime.save();await window.qa.runtime.load(saved.data,saved.local_players);return {tick:window.qa.runtime.current.tick,hash:saved.hash,restoredHash:(await window.qa.runtime.save()).hash,recoveries:window.qa.recoveries}});
 assert.equal(duringLoss.tick,beforeLoss.tick+20);assert.equal(duringLoss.hash,duringLoss.restoredHash);assert.equal(duringLoss.recoveries.length,1);
 await page.evaluate(()=>window.qa.restoreGraphics());await page.waitForFunction(()=>!window.qa.graphicsLost());await page.evaluate(()=>window.qa.renderer.whenAssetsReady());
 const recovered=await page.evaluate(()=>window.qa.diagnostics());assert(recovered.actors>0&&recovered.art.residentPages>0);result.checks.contextRecovery={before:beforeLoss.tick,during:duringLoss.tick,saveRestored:true,actors:recovered.actors,pages:recovered.art.residentPages,recovery:duringLoss.recoveries[0]};
 await page.screenshot({path:path.join(evidence,'context-restored.png')});
 await page.mouse.wheel(0,-200);await page.setViewportSize({width:1280,height:720});await page.screenshot({path:path.join(evidence,'resized-1280.png')});
 const disposed=await page.evaluate(()=>window.qa.repeatedDisposal());assert.equal(disposed.canvases,0);assert.equal(disposed.art.residentPages,0);assert.equal(disposed.art.indexedPages,0);result.checks.disposal={scenes:5,...disposed};
 await page.goto(`http://127.0.0.1:${server.address().port}/shadow`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const shadow=await page.evaluate(()=>window.qa.result);result.checks.shadowComposition=shadow;
 await page.locator('#shadow-evidence').screenshot({path:path.join(evidence,'turret-ground-shadow.png')});
 assert.equal(shadow.opaqueBodyChanged,0);assert(shadow.opaqueBodyPixels>1000);assert(shadow.groundPixelsChanged>100);assert(shadow.damagedHidden&&shadow.healthyVisible);
 await page.evaluate(()=>window.qa.dispose());
 assert.deepEqual(errors,[]);result.status='passed';
}catch(error){result.status='failed';result.failure=String(error);process.exitCode=1}
finally{await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();await new Promise(resolve=>server.close(resolve))}
