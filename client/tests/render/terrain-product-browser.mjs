// Real Go/WASM state through the production BattlefieldRenderer. Synthetic map.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {artIndex} from '../../scripts/ui/art-plugin.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=path.join(root,'work/evidence/terrain-height/product'),temp=await mkdtemp(path.join(tmpdir(),'frontline-height-product-'));await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'client/tests/render/terrain-product-fixture.ts')],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const index=await artIndex(path.join(root,'assets')),mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Product terrain height acceptance</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden;background:#14130f}</style><div id="field"></div><script type="module" src="/main.js"></script>');return}
 if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(index));return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/content/')?path.join(root,p):p.startsWith('/runtime/')?path.join(root,'client/public',p):p.startsWith('/art/')?path.join(root,'assets/build',p.slice(5)):undefined;
 if(!file)throw Error('Not found');res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(error){res.statusCode=404;res.end(String(error))}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:false,channel:'chromium'}),page=await browser.newPage({viewport:{width:1600,height:900}}),report={date:new Date().toISOString(),browser:browser.version(),wasmSHA256:createHash('sha256').update(await readFile(path.join(root,'client/public/runtime/frontline.wasm'))).digest('hex'),errors:[],status:'running'};
page.on('pageerror',error=>{report.errors.push(String(error));console.error(error)});page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});
try{
 const cdp=await browser.newBrowserCDPSession();report.gpu=(await cdp.send('SystemInfo.getInfo')).gpu;
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 report.opening=await page.evaluate(()=>window.qa.inspect());assert.equal(report.opening.unknownEntities,0);await page.screenshot({path:path.join(out,'opening@1600.png')});
 report.foundation=await page.evaluate(()=>window.qa.foundation());assert(report.foundation.support.boundary.some(p=>p.height<report.foundation.support.height));assert.equal(report.foundation.actor.ground.y,(report.foundation.actor.position.x+report.foundation.actor.position.y)/1000*16-report.foundation.support.height*10);
 const entity=report.foundation.actor,box=entity.bounds;await page.mouse.click((box.left+box.right)/2,(box.top+box.bottom)/2);report.structureClick=await page.evaluate(()=>window.qa.gestures.at(-1));assert.equal(report.structureClick.hit.id,entity.id);
 report.clicks=[];for(const point of [{x:14500,y:22500},{x:20500,y:22500},{x:26500,y:19500}]){const value=await page.evaluate(p=>window.qa.point(p),point);await page.mouse.click(value.screen.x,value.screen.y,{button:'right'});const gesture=await page.evaluate(()=>window.qa.gestures.at(-1));report.clicks.push({value,gesture});assert(Math.hypot(gesture.point.x-point.x,gesture.point.y-point.y)<50)}
 report.move=await page.evaluate(()=>window.qa.move());assert(Math.hypot(report.move.after.position.x-report.move.destination.x,report.move.after.position.y-report.move.destination.y)<600);for(const value of report.move.samples){assert(Math.abs(value.ground.y-value.expectedGround.y)<.01)}assert(report.move.samples.some(p=>p.level>2.5));await page.screenshot({path:path.join(out,'moved-across-heights@1600.png')});
 report.build=await page.evaluate(()=>window.qa.build());assert(BigInt(report.build.after)<BigInt(report.build.before));await page.screenshot({path:path.join(out,'paid-raised-construction@1600.png')});
 report.flight=await page.evaluate(()=>window.qa.flight());assert.equal(report.flight.landed.altitude,0);const lift=value=>value.expectedGround.y+value.level*10-value.ground.y+value.altitude;assert(Math.abs(lift(report.flight.beforeDeparture)-lift(report.flight.departure))<5,'Takeoff jumped from its support plane');assert(report.flight.samples.some(value=>value.level<1));assert(report.flight.samples.some(value=>value.level>2));for(const value of report.flight.samples){assert(value.altitude>0);assert(value.shadow.z<value.depth);assert(Math.abs(value.ground.y-value.expectedGround.y)<.01)}await page.screenshot({path:path.join(out,'aircraft-raised-ground-shadow@1600.png')});
 const saved=await page.evaluate(()=>window.qa.save());report.save={hash:saved.hash,restored:saved.restored,localPlayers:saved.localPlayers};assert.equal(saved.hash,saved.restored);await writeFile(path.join(out,'height-actual-orders.save.json'),JSON.stringify({format:'frontline-local-save',version:1,id:'height-actual-orders',name:'Height actual orders fixture',hash:saved.hash,local_players:saved.localPlayers,engine:new TextDecoder().decode(new Uint8Array(saved.bytes))}));
 await page.evaluate(()=>window.qa.focus({x:32000,y:23000}));await page.screenshot({path:path.join(out,'cliff-fog-boundary@1600.png')});
 report.syntheticDisposal=await page.evaluate(()=>window.qa.dispose());assert.equal(report.syntheticDisposal.canvases,0);assert.equal(report.syntheticDisposal.art.residentPages,0);
 await page.goto(`http://127.0.0.1:${server.address().port}/?authored=us04`);await page.waitForFunction(()=>document.body.dataset.ready==='true');report.authoredLanding=await page.evaluate(()=>window.qa.authoredLanding());assert(report.authoredLanding.bodyPixels>50,'Serviced US04 aircraft is hidden behind its base');assert(report.authoredLanding.aircraft.depth>report.authoredLanding.home.depth);await page.screenshot({path:path.join(out,'us04-serviced-aircraft-visible@1600.png')});
 report.disposed=await page.evaluate(()=>window.qa.dispose());assert.equal(report.disposed.canvases,0);assert.equal(report.disposed.art.residentPages,0);assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}finally{await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(report.status,report.error??'')}
