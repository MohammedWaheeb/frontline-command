// Go creates the untouched authored US04 start. The actual product imports that
// save, and every subsequent order comes from visible product input. No world edits.
import {chromium} from 'playwright-core';
import {build as bundle} from 'esbuild';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {prepareProduct,root,buildDir,product} from './multiplayer-product-build.mjs';
import {minimapLayout,minimapProject} from '../../src/render/minimap.ts';
const build=await prepareProduct(),out=path.join(root,'work/evidence/aircraft-rebase',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
await bundle({stdin:{contents:"export {OfflineTransport} from './runtime/offline';",resolveDir:path.join(root,'client/src')},outfile:path.join(product,'rebase-harness.js'),bundle:true,format:'iife',globalName:'RebaseQA',platform:'browser',target:'es2022'});
await writeFile(path.join(product,'rebase-harness.html'),'<!doctype html><title>Authored start export fixture</title><link rel="icon" href="data:,"><script src="/rebase-harness.js"></script>');
await bundle({stdin:{contents:"export {fromBinary} from '@bufbuild/protobuf';export {PlayerSnapshotSchema,OrderBatchSchema} from './protocol/frontline_pb';",resolveDir:path.join(root,'client/src')},outfile:path.join(out,'decode.mjs'),bundle:true,platform:'node',format:'esm'});
const {fromBinary,PlayerSnapshotSchema,OrderBatchSchema}=await import(pathToFileURL(path.join(out,'decode.mjs')));
const mission=JSON.parse(await readFile(path.join(product,'content/missions/us-04-broken-umbrella.json'),'utf8')),map=JSON.parse(await readFile(path.join(product,'content/maps',mission.map_id+'.json'),'utf8'));
const config={map,mission,difficulty:'normal',seed:42,skip_countdown:true};
const scenarioFile=path.join(out,'native-start.json');await writeFile(scenarioFile,JSON.stringify({config,script:[{op:'checkpoint',label:'original'}]}));
const native=JSON.parse(execFileSync(path.join(buildDir,'runtime-native'),['-scenario',scenarioFile],{encoding:'utf8'}));
const data=await mkdtemp(path.join(tmpdir(),'frontline-rebase-')),child=spawn(path.join(buildDir,'frontline'),['-addr','127.0.0.1:0','-data',data,'-static',product,'-maps',path.join(product,'content/maps'),'-missions',path.join(product,'content/missions')],{cwd:root,stdio:['ignore','pipe','pipe']});let log='';
const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Host startup timeout')),20000);child.stdout.on('data',bytes=>{log+=bytes;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0])}});child.stderr.on('data',bytes=>log+=bytes);child.once('exit',code=>{clearTimeout(timer);reject(Error(`Host exited ${code}`))})});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),report={time:new Date().toISOString(),build,origin,scope:'Actual US04 original start import and visible Rebase/Return controls. Not full mission optional completion.',native:native.checkpoints,errors:[],consoleErrors:[],checks:{}};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
await page.addInitScript(()=>{const Native=window.Worker;window.orderBytes=[];window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data.event==='frame')window.frameBytes=Array.from(event.data.bytes)});const post=this.postMessage;this.postMessage=function(message,...rest){if(message.method==='submit')window.orderBytes.push(Array.from(message.args[0]));return post.call(this,message,...rest)}}}});
async function snapshot(){const bytes=await page.evaluate(()=>window.frameBytes);return bytes?fromBinary(PlayerSnapshotSchema,new Uint8Array(bytes)):undefined}
async function until(check,label,timeout=45000){const start=Date.now();while(!await check()){if(Date.now()-start>timeout)throw Error(label);await new Promise(resolve=>setTimeout(resolve,100))}}
async function centerAt(point){const b=await page.getByLabel('Tactical minimap').boundingBox(),p=minimapProject(minimapLayout(map.width,map.height,b.width,b.height),point);await page.mouse.click(b.x+p.x,b.y+p.y);await page.waitForTimeout(80)}
async function clickCenter(button='left',dy=-20){const b=await page.locator('.battlefield-canvas canvas').boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2+dy,{button})}
const own=(f,origin)=>f.entities.find(e=>e.private?.missionOrigin===origin);
try{
 await page.goto(origin+'/rebase-harness.html');
 const exported=await page.evaluate(async config=>{const r=new RebaseQA.OfflineTransport();await r.ready;await r.create(config);const save=await r.save(),info=await r.info();r.dispose();return {hash:save.hash,info,export:JSON.stringify({format:'frontline-local-save',version:1,id:'rebase-original',name:'US04 original rebasing check',local_players:save.local_players,hash:save.hash,engine:new TextDecoder().decode(save.data)})}},config);
 assert.equal(exported.hash,native.final_hash);report.checks.originalNativeWasmHash=exported.hash;
 const file=path.join(out,'original.save.json');await writeFile(file,exported.export);
 await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click({timeout:60000});await page.getByRole('button',{name:'Load operation',exact:true}).click();await page.getByLabel('Import save',{exact:true}).setInputFiles(file);await page.locator('.archive-row').filter({hasText:'US04 original rebasing check'}).getByRole('button',{name:'Load',exact:true}).click();
 await page.locator('.battlefield-canvas canvas').waitFor({timeout:90000});await page.locator('.scene-loading').waitFor({state:'hidden',timeout:90000});await page.locator('.mission-force-groups summary').click();
 let frame=await snapshot();const backup=own(frame,'initial:36'),old=own(frame,'initial:9'),wing=own(frame,'initial:38');assert.ok(backup&&old&&wing);const id=wing.id;report.checks.start={id,home:wing.private.home,backup:backup.id,tick:frame.tick};assert.notEqual(wing.private.home,backup.id);
 await page.getByRole('button',{name:'Select Original strike wing one',exact:true}).click();await page.getByRole('button',{name:'Rebase',exact:true}).click();await page.locator('.targeting-hint').filter({hasText:'Choose your service base'}).waitFor();await page.screenshot({path:path.join(out,'rebase-targeting.png')});
 await centerAt(backup.position);await clickCenter();await until(async()=>{const e=(await snapshot())?.entities.find(e=>e.id===id);return e?.private?.home===backup.id},'Rebase target was not assigned');
 await page.screenshot({path:path.join(out,'rebase-departure.png')});
 await until(async()=>{const f=await snapshot(),e=f?.entities.find(e=>e.id===id);return e?.landed&&e.state==='landed'&&e.private.home===backup.id},'Aircraft did not reach and complete service at the chosen base',120000);
 frame=await snapshot();const arrived=frame.entities.find(e=>e.id===id);assert.ok(Math.hypot(arrived.position.x-backup.position.x,arrived.position.y-backup.position.y)<6000);report.checks.arrival={tick:frame.tick,home:arrived.private.home,landed:arrived.landed,position:arrived.position};await page.screenshot({path:path.join(out,'rebase-serviced.png')});
 await page.keyboard.press('F5');await until(async()=>/saved/i.test(await page.locator('.notice').innerText().catch(()=>'')),'Quick save not confirmed');report.checks.saved=true;
 // Right-click chooses the same Go rebase intent after independent advice.
 await page.getByRole('button',{name:'Select Original strike wing one',exact:true}).click();await centerAt(old.position);await clickCenter('right');await until(async()=>{const e=(await snapshot())?.entities.find(e=>e.id===id);return e?.private?.home===old.id},'Context rebase did not assign original airfield');
 await page.locator('.command-grid button').filter({hasText:/^Return/}).click();await until(async()=>{const bytes=await page.evaluate(()=>window.orderBytes);return bytes.flatMap(b=>fromBinary(OrderBatchSchema,new Uint8Array(b)).orders).some(o=>o.kind==='return'&&o.target===0)},'Ordinary Return did not remain targetless');
 const orders=(await page.evaluate(()=>window.orderBytes)).flatMap(b=>fromBinary(OrderBatchSchema,new Uint8Array(b)).orders);report.orders=orders.map(o=>({kind:o.kind,entities:o.entities,target:o.target,queued:o.queued}));assert.ok(report.orders.some(o=>o.kind==='return'&&o.target===backup.id));assert.ok(report.orders.some(o=>o.kind==='return'&&o.target===old.id));
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);const f=await snapshot();report.last=f?{tick:f.tick,actors:f.entities.filter(e=>e.owner===1).map(e=>({id:e.id,type:e.type,home:e.private?.home,state:e.state,landed:e.landed,pos:e.position}))}:undefined;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''));process.exitCode=1}
finally{await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));await browser.close();if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await stopped}await writeFile(path.join(out,'host.log'),log);await rm(data,{recursive:true,force:true});console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks,out},null,2))}
