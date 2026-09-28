// Real DOM controls over the frozen current product and Go/WASM. Unlike a
// screenshot-only walkthrough, failed steps and unpaid production fail the run.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),require=createRequire(path.join(root,'client/package.json'));
const {chromium}=require('playwright-core'),build=path.join(here,'product-preview'),product=path.join(build,'product'),out=path.join(here,'console-'+new Date().toISOString().replaceAll(':','-'));
await mkdir(out);await writeFile(path.join(out,'driver.mjs'),await readFile(fileURLToPath(import.meta.url)));
const report={time:new Date().toISOString(),scope:'Claude console source in actual current product, ordinary paid solo production/save/replay and LAN landing page. Incomplete frozen gameplay art; not a full match, listening test or final release.',build:JSON.parse(await readFile(path.join(build,'build.json'),'utf8')),checks:[],errors:[],httpErrors:[]};
const child=spawn(path.join(build,'frontline'),['-addr','127.0.0.1:0','-data',path.join(out,'host-data'),'-static',product,'-maps',path.join(product,'content/maps'),'-missions',path.join(product,'content/missions')],{cwd:root,stdio:['ignore','pipe','pipe']});
let log='',browser,page;
try{
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Host startup timed out')),30000);child.stdout.on('data',data=>{log+=data;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0])}});child.stderr.on('data',data=>log+=data);child.once('exit',code=>{clearTimeout(timer);reject(Error('Host exit '+code))})});
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(30000);report.browser=browser.version();
 page.on('pageerror',e=>report.errors.push({type:'pageerror',message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({type:'console',message:m.text()})});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({path:new URL(r.url()).pathname,status:r.status()})});
 const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png')});await writeFile(path.join(out,name+'.dom.txt'),await page.locator('body').innerText())};
 const view=()=>page.evaluate(()=>JSON.parse(window.multiplayerCombat.view()));
 await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await page.getByRole('button',{name:'Deploy to skirmish',exact:true}).click();
 await page.getByRole('button',{name:'Deploy forces',exact:true}).click();await page.locator('.battlefield-canvas canvas').waitFor({timeout:60000});await page.locator('.scene-loading').waitFor({state:'hidden',timeout:60000});await page.locator('.countdown').waitFor({state:'hidden'});
 const opening=await view(),hq=opening.entities.find(e=>e.owner===opening.player&&e.type==='hq');assert(hq);
 await shot('battle-1600-empty');await page.getByLabel('Production facility',{exact:true}).selectOption(String(hq.id));await page.getByRole('tab',{name:'vehicles',exact:true}).click();
 const card=page.locator('.production-cameo:not([disabled])').first();await card.waitFor();const title=await card.getAttribute('title'),before=await view();
 await card.click();await page.waitForFunction(beforeCredits=>{const s=JSON.parse(window.multiplayerCombat.view());return BigInt(s.economy.credits)<BigInt(beforeCredits)&&s.entities.some(e=>e.owner===s.player&&e.private?.jobs?.some(j=>j.started))},String(before.economy.credits));
 const paid=await view(),receipts=await page.evaluate(()=>JSON.parse(window.multiplayerCombat.receipts()));assert(receipts.some(r=>r.accepted&&r.code==='ok'));
 report.checks.push({name:'Actual vehicle-tab production pays credits and starts a real Go job',card:title,beforeCredits:before.economy.credits,afterCredits:paid.economy.credits,tick:paid.tick,receipts});
 await shot('battle-1600-paid-queue');await page.getByRole('button',{name:'Select production facility',exact:true}).click();await page.locator('.unit-state-inspect').click();await page.getByRole('dialog').waitFor();await shot('unit-status-1600');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 report.checks.push({name:'Owner status dialog opens from selected actual HQ and closes by Escape'});
 await page.setViewportSize({width:1280,height:720});await shot('battle-1280');await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await shot('pause-1280');
 await page.getByRole('button',{name:'Options',exact:true}).click();await page.getByLabel('Interface scale',{exact:true}).selectOption('1.5');await shot('options-1280-150');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Save operation',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.notice')?.textContent?.includes('Saved:'));
 await page.getByRole('button',{name:'Archive replay',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.notice')?.textContent?.includes('Replay stored'));
 const archived=await page.evaluate(()=>window.multiplayerCombat.replay());assert(archived?.sha256&&archived.data.length>0);report.checks.push({name:'Real solo save and replay archived through scaled pause controls',replay:{id:archived.id,sha256:archived.sha256,bytes:archived.data.length}});
 await page.getByRole('button',{name:'Resume operation',exact:true}).click();await shot('battle-1280-150');
 await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('button',{name:'Return to command center',exact:true}).click();await page.getByRole('navigation',{name:'Main menu'}).getByRole('button',{name:'Replay archive',exact:true}).click();
 await page.locator('.archive-row').first().getByRole('button',{name:'Watch',exact:true}).click();await page.getByRole('region',{name:'Replay controls'}).waitFor({timeout:60000});await page.locator('.scene-loading').waitFor({state:'hidden',timeout:60000});
 assert.equal(await page.locator('.production-cameo:not([disabled])').count(),0);
 await shot('replay-1280-150');await page.getByLabel('Replay speed',{exact:true}).selectOption('1.5');await page.getByRole('button',{name:'Order log',exact:true}).click();await page.getByRole('dialog',{name:'Replay command log'}).waitFor();await shot('replay-orders-1280-150');await page.keyboard.press('Escape');
 await page.setViewportSize({width:1600,height:900});await shot('replay-1600-150');report.checks.push({name:'Actual archived replay opens read-only; scaled bottom-well controls and command log work'});
 await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('button',{name:'Return to command center',exact:true}).click();await page.getByRole('navigation',{name:'Main menu'}).getByRole('button',{name:'Multiplayer',exact:true}).click();await page.getByRole('button',{name:'Connect host',exact:true}).waitFor();await shot('lan-1600-150');await page.setViewportSize({width:1280,height:720});await shot('lan-1280-150');
 report.checks.push({name:'LAN landing controls remain reachable at both native sizes with150percent interface scale; no match simulated by this step'});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}
finally{if(browser)await browser.close();if(child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await ended}await writeFile(path.join(out,'host.log'),log);await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status,out)}
