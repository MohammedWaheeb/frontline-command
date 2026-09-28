// Short lifecycle diagnosis only: start a genuine ordinary online match, return
// to the menu, inspect worker URLs/content/queues, then close the diagnostic host.
// No victory, rematch, long-duration or earned-result acceptance is claimed.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {installWorkerObservation} from './worker-observation.mjs';
import {prepareProduct,root,evidence,buildDir,product} from './multiplayer-combat-build.mjs';
assert.equal(process.env.FRONTLINE_COMBAT_REUSE,'1');
const build=await prepareProduct(),runDir=path.join(evidence,'worker-diagnostic-'+new Date().toISOString().replaceAll(':','-'));await mkdir(runDir,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),report={build,errors:[],httpErrors:[],players:[],started:new Date().toISOString(),scope:'Short interrupted ordinary match for worker ownership diagnosis only; no result, rematch or long-duration acceptance.'};
const expected={};for(const [key,name] of [['imageWorkerSource','loadImageBitmap'],['probeWorkerSource','checkImageBitmap']]){
 const source=await readFile(path.join(root,'client/node_modules/pixi.js/lib/_virtual',name+'.worker.mjs'),'utf8');expected[key]=JSON.parse(source.split('\n')[0].slice('const WORKER_CODE = '.length,-1));
}
report.expectedWorkerSourceSHA256=Object.fromEntries(Object.entries(expected).map(([key,source])=>[key,sha(source)]));
for(const file of ['worker-observation.mjs','worker-lifetime-diagnostic.browser.mjs'])await writeFile(path.join(runDir,file),await readFile(new URL(file,import.meta.url)));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message,timeout=60000){const start=Date.now();while(!await check()){if(Date.now()-start>timeout)throw Error(message);await sleep(150)}}
async function idle(page){await until(async()=>await page.locator('.network-operation,.loading-screen').count()===0,'Product stayed busy',120000);assert.deepEqual(await page.locator('.network-error').allInnerTexts(),[])}
const data=path.join(runDir,'host-data');await mkdir(data);let log='';
const host=spawn(path.join(buildDir,'frontline'),['-addr','127.0.0.1:0','-data',data,'-static',product,'-maps',path.join(product,'content/maps'),'-missions',path.join(product,'content/missions')],{cwd:root,stdio:['ignore','pipe','pipe']});
const closed=new Promise(resolve=>host.once('exit',resolve));let browser;const contexts=[],pages=[];
try{
 const origin=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Host startup timeout')),30000);host.once('error',reject);host.stdout.on('data',chunk=>{log+=chunk;const found=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(found){clearTimeout(timeout);resolve(found[0])}});host.stderr.on('data',chunk=>log+=chunk)});
 browser=await chromium.launch({headless:false,channel:'chromium'});report.browser=browser.version();
 for(let index=0;index<2;index++){
  const context=await browser.newContext({viewport:{width:1600,height:900}});contexts.push(context);await context.addInitScript(installWorkerObservation,expected);const page=await context.newPage();pages.push(page);page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push({player:index+1,kind:'pageerror',message:error.message}));page.on('console',message=>{if(message.type()==='error')report.errors.push({player:index+1,kind:'console',message:message.text()})});page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({player:index+1,status:response.status(),path:new URL(response.url()).pathname})});
  await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await idle(page);await page.getByLabel('Commander name',{exact:true}).fill(`Worker diagnostic ${index+1}`);await page.getByRole('button',{name:'Create local profile',exact:true}).click();await page.getByLabel('Your profile ID').waitFor();await idle(page);
  report.players.push({player:index+1,initial:await page.evaluate(async()=>({app:window.multiplayerCombat.lifetime(),page:await window.rematchPageTelemetry()}))});
 }
 await pages[0].getByLabel('Operation name',{exact:true}).fill('Worker lifetime diagnostic');await pages[0].getByLabel('Lobby battlefield',{exact:true}).selectOption('industrial-valley');await pages[0].getByLabel('Battle format',{exact:true}).selectOption('1v1');await pages[0].getByLabel('Host faction',{exact:true}).selectOption('US');await pages[0].getByRole('button',{name:'Create operation',exact:true}).click();await idle(pages[0]);
 await pages[1].getByLabel('Join lobby ID').fill(await pages[0].getByLabel('Current lobby ID').inputValue());await pages[1].getByRole('button',{name:'Join by ID',exact:true}).click();await idle(pages[1]);await pages[1].getByLabel('Commander 2 faction',{exact:true}).selectOption('IR');await idle(pages[1]);await sleep(2000);
 for(const page of pages){await page.getByRole('button',{name:'Ready to deploy',exact:true}).click();await idle(page)}
 await until(()=>pages[0].getByRole('button',{name:'Start operation',exact:true}).isEnabled(),'Readiness incomplete');await pages[0].getByRole('button',{name:'Start operation',exact:true}).click();
 for(let index=0;index<2;index++){
  const page=pages[index];await page.getByRole('complementary',{name:'Command sidebar'}).waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'});await sleep(1500);report.players[index].active=await page.evaluate(async()=>({app:window.multiplayerCombat.lifetime(),page:await window.rematchPageTelemetry()}));
  await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('button',{name:'Return to command center',exact:true}).click();await page.getByRole('button',{name:'Multiplayer',exact:true}).click();await idle(page);
  await until(async()=>await page.evaluate(()=>window.multiplayerCombat.lifetime().art.residentPages)===0,'Sprite pages survived teardown');await sleep(1500);report.players[index].menu=await page.evaluate(async()=>({app:window.multiplayerCombat.lifetime(),page:await window.rematchPageTelemetry()}));await page.screenshot({path:path.join(runDir,`player-${index+1}-menu.png`)});
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.status='captured';
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1}
finally{
 for(const context of contexts)await context.close();await browser?.close();if(host.exitCode===null&&host.signalCode===null)host.kill('SIGTERM');await closed;
 report.completed=new Date().toISOString();await writeFile(path.join(runDir,'host.log'),log);await writeFile(path.join(runDir,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(runDir,report.status);
}
