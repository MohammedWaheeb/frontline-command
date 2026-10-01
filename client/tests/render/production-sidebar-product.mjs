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
const build=await prepareProduct(),out=path.join(root,'work/evidence/production-sidebar',new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
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
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),report={time:new Date().toISOString(),build,origin,scope:'Actual US04 start and independent production/army selection, paid queues, cancellation, build targeting and enlarged command console.',native:native.checkpoints,errors:[],consoleErrors:[],checks:{}};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
await page.addInitScript(()=>{const Native=window.Worker;window.orderBytes=[];window.workerErrors=[];window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data.event==='frame')window.frameBytes=Array.from(event.data.bytes);if(event.data.ok===false)window.workerErrors.push(event.data.error)});const post=this.postMessage;this.postMessage=function(message,...rest){if(message.method==='submit')window.orderBytes.push(Array.from(message.args[0]));return post.call(this,message,...rest)}}}});
async function snapshot(){const bytes=await page.evaluate(()=>window.frameBytes);return bytes?fromBinary(PlayerSnapshotSchema,new Uint8Array(bytes)):undefined}
async function until(check,label,timeout=45000){const start=Date.now();while(!await check()){if(Date.now()-start>timeout)throw Error(label);await new Promise(resolve=>setTimeout(resolve,100))}}
async function centerAt(point){const b=await page.getByLabel('Tactical minimap').boundingBox(),p=minimapProject(minimapLayout(map.width,map.height,b.width,b.height),point);await page.mouse.click(b.x+p.x,b.y+p.y);await page.waitForTimeout(80)}
async function clickCenter(button='left',dy=-20){const b=await page.locator('.battlefield-canvas canvas').boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2+dy,{button})}
async function commandLayout(label){
 const grid=page.locator('.command-grid');await grid.evaluate(el=>{el.scrollTop=0});
 const metrics=await grid.evaluate(el=>{const box=el.getBoundingClientRect();return {height:el.clientHeight,scrollHeight:el.scrollHeight,buttons:[...el.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {text:button.innerText,top:r.top-box.top,bottom:r.bottom-box.top,height:r.height}})}});
 assert.ok(metrics.buttons.every(button=>button.height>=40),'Command keys became too small');
 assert.ok(metrics.buttons[0].top>=0&&metrics.buttons[0].bottom<=metrics.height,'First command row is clipped');
 await grid.locator('button').last().scrollIntoViewIfNeeded();
 const last=await grid.evaluate(el=>{const box=el.getBoundingClientRect(),r=el.querySelector('button:last-child').getBoundingClientRect();return {top:r.top-box.top,bottom:r.bottom-box.top,height:el.clientHeight}});
 assert.ok(last.top>=0&&last.bottom<=last.height+1,'Last command cannot be fully reached');
 await page.screenshot({path:path.join(out,`rebase-commands-${label}.png`)});return {...metrics,last};
}
async function interfaceScale(value){
 await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('dialog',{name:'Operation paused',exact:true}).getByRole('button',{name:'Options',exact:true}).click();
 const options=page.getByRole('dialog',{name:'Options',exact:true});await options.getByLabel('Interface scale',{exact:true}).selectOption(value);await options.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Resume operation',exact:true}).click();
}
const own=(f,origin)=>f.entities.find(e=>e.private?.missionOrigin===origin);
try{
 await page.goto(origin+'/rebase-harness.html');
 const exported=await page.evaluate(async config=>{const r=new RebaseQA.OfflineTransport();await r.ready;await r.create(config);const save=await r.save(),info=await r.info();r.dispose();return {hash:save.hash,info,export:JSON.stringify({format:'frontline-local-save',version:1,id:'rebase-original',name:'US04 original rebasing check',local_players:save.local_players,hash:save.hash,engine:new TextDecoder().decode(save.data)})}},config);
 assert.equal(exported.hash,native.final_hash);report.checks.originalNativeWasmHash=exported.hash;
 const file=path.join(out,'original.save.json');await writeFile(file,exported.export);
 await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click({timeout:60000});await page.getByRole('button',{name:'Load operation',exact:true}).click();await page.getByLabel('Import save',{exact:true}).setInputFiles(file);await page.locator('.archive-row').filter({hasText:'US04 original rebasing check'}).getByRole('button',{name:'Load',exact:true}).click();
 await page.locator('.battlefield-canvas canvas').waitFor({timeout:90000});await page.locator('.scene-loading').waitFor({state:'hidden',timeout:90000});await page.locator('.mission-force-groups summary').click();
 let frame=await snapshot();const backup=own(frame,'initial:36'),old=own(frame,'initial:9'),wing=own(frame,'initial:38');assert.ok(backup&&old&&wing);const id=wing.id;report.checks.start={id,home:wing.private.home,backup:backup.id,tick:frame.tick};assert.notEqual(wing.private.home,backup.id);
 await page.getByRole('button',{name:'Select Original strike wing one',exact:true}).click();
 const rules=JSON.parse(await readFile(path.join(root,'pkg/content/rules.json'),'utf8')),rifle=rules.units.find(u=>u.id==='US.rifle'),power=rules.buildings.find(b=>b.role==='power');
 const selectedName=rules.units.find(u=>u.id==='US.strike').name;
 async function armySelected(){assert.ok((await page.locator('.selection-overview h2').textContent())===selectedName,'Production changed army selection');assert.equal(await page.locator('.command-grid button').filter({hasText:/^Sell/}).count(),0,'Factory commands leaked into army selection')}
 await page.getByRole('tab',{name:'infantry',exact:true}).click();await until(async()=>await page.locator('.production-cameo').filter({hasText:rifle.name}).count()>0,'Infantry production not offered');await armySelected();
 const producerID=Number(await page.getByLabel('Production facility',{exact:true}).inputValue()),before=(await snapshot()).economy.credits;
 await page.locator('.production-cameo').filter({hasText:rifle.name}).click();
 await until(async()=>{const f=await snapshot();return f.entities.find(e=>e.id===producerID)?.private?.jobs.some(job=>job.type===rifle.id&&job.started)&&f.economy.credits<before},'Paid training did not enter chosen producer');await armySelected();
 report.checks.paidQueue={producer:producerID,selected:id,creditsBefore:String(before),creditsAfter:String((await snapshot()).economy.credits)};
 await page.getByRole('region',{name:'Production queue'}).getByRole('button').filter({hasText:rifle.name}).click();await until(async()=>!(await snapshot()).entities.find(e=>e.id===producerID)?.private?.jobs.length,'Queue cancellation not applied');await armySelected();
 await page.getByRole('tab',{name:'aircraft',exact:true}).click();await page.getByLabel('Production facility',{exact:true}).selectOption(String(backup.id));await until(async()=>Number(await page.getByLabel('Production facility',{exact:true}).inputValue())===backup.id,'Chosen airfield not retained');await armySelected();
 await page.getByRole('button',{name:'Select Original strike wing one',exact:true}).click();assert.equal(Number(await page.getByLabel('Production facility',{exact:true}).inputValue()),backup.id);
 await page.getByRole('tab',{name:'structures',exact:true}).click();await until(async()=>await page.locator('.production-cameo').filter({hasText:power.name}).count()>0,'Construction not offered');await armySelected();
 await page.locator('.production-cameo').filter({hasText:power.name}).click();await page.locator('.targeting-hint').filter({hasText:power.name}).waitFor();assert.ok((await page.locator('.selection-overview h2').textContent())===rules.units.find(u=>u.id==='US.rig').name,'Construction did not choose its actual engineering rig');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Select Original strike wing one',exact:true}).click();await page.getByRole('tab',{name:'infantry',exact:true}).click();await until(async()=>await page.locator('.production-cameo').filter({hasText:rifle.name}).count()>0,'Infantry sidebar did not recover');await armySelected();await page.screenshot({path:path.join(out,'production-army-1600.png')});
 await page.setViewportSize({width:1280,height:720});report.checks.commandGrid=await commandLayout('1280');await interfaceScale('1.5');report.checks.commandGrid150=await commandLayout('1280-150');
 await page.locator('.production-cameo').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'production-army-1280-150.png')});
 const buttons=await page.locator('.production-source').boundingBox(),sidebar=await page.getByLabel('Command sidebar').boundingBox();assert.ok(buttons.x>=sidebar.x&&buttons.x+buttons.width<=sidebar.x+sidebar.width+1,'Facility controls overflow sidebar');
 await interfaceScale('1');await page.keyboard.press('F5');await until(async()=>/saved/i.test(await page.locator('.notice').innerText().catch(()=>'')),'Quick save not confirmed');report.checks.saved=true;
 const orders=(await page.evaluate(()=>window.orderBytes)).flatMap(b=>fromBinary(OrderBatchSchema,new Uint8Array(b)).orders);report.orders=orders.map(o=>({kind:o.kind,entities:o.entities,type:o.type,target:o.target,queued:o.queued}));assert.ok(report.orders.some(o=>o.kind==='train'&&o.entities[0]===producerID&&o.type===rifle.id));assert.ok(report.orders.some(o=>o.kind==='cancel'&&o.entities[0]===producerID));
 // Keep a real paid job in an archived replay, then inspect it read-only through
 // the product. The same sidebar must remain useful after seeking and rewind.
 await page.getByRole('tab',{name:'infantry',exact:true}).click();await page.getByLabel('Production facility',{exact:true}).selectOption(String(producerID));
 await until(async()=>await page.locator('.production-cameo').filter({hasText:rifle.name}).count()>0,'Replay setup production unavailable');
 await page.locator('.production-cameo').filter({hasText:rifle.name}).click();await until(async()=>(await snapshot()).entities.find(e=>e.id===producerID)?.private?.jobs.some(job=>job.type===rifle.id&&job.started),'Replay setup queue did not start');
 await page.getByRole('button',{name:'Open pause menu',exact:true}).click();await page.getByRole('button',{name:'Archive replay',exact:true}).click();await until(async()=>/Replay stored/.test(await page.locator('.notice').innerText().catch(()=>'')),'Replay archive not confirmed');
 await page.getByRole('button',{name:'Return to command center',exact:true}).click();await page.getByRole('button',{name:'Replay archive',exact:true}).click();await page.locator('.archive-row').filter({hasText:map.title}).getByRole('button',{name:'Watch',exact:true}).click();
 await page.locator('.battlefield-canvas canvas').waitFor({timeout:90000});await page.locator('.scene-loading').waitFor({state:'hidden',timeout:90000});
 const timeline=page.getByRole('slider',{name:'Replay timeline',exact:true});await timeline.focus();await timeline.press('End');await until(async()=>Number(await timeline.inputValue())===Number(await timeline.getAttribute('max')),'Replay did not seek to its recorded end');
 await page.getByLabel('Production facility',{exact:true}).selectOption(String(producerID));
 const recorded=page.getByRole('region',{name:'Production queue'}).getByRole('button').filter({hasText:rifle.name});await recorded.waitFor();assert.equal(await recorded.isDisabled(),true,'Replay production cancellation is interactive');assert.match(await page.locator('.production-heading').textContent(),/VIEW ONLY/);assert.equal(await page.locator('.production-cameo').count(),0);
 const countBefore=await page.evaluate(()=>window.orderBytes.length);await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>window.orderBytes.length),countBefore,'Replay inspection emitted a command');
 report.checks.replayQueue={producer:producerID,tick:(await snapshot()).tick,type:rifle.id,disabled:true};await page.screenshot({path:path.join(out,'replay-production-queue.png')});
 async function replayLayout(label){
  const dock=page.getByRole('region',{name:'Replay controls'}),box=await dock.boundingBox(),objectives=await page.getByRole('complementary',{name:'Mission objectives'}).boundingBox();
  assert.ok(box&&objectives&&box.y>=objectives.y+objectives.height,'Replay controls overlap mission objectives');
  const well=await page.getByRole('group',{name:'Replay console'}).boundingBox();assert.ok(box.x>=well.x&&box.y>=well.y&&box.x+box.width<=well.x+well.width+1&&box.y+box.height<=well.y+well.height+1,'Replay dock exceeds its command well');
  const controls=await dock.locator('button,input,select').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}}));assert.ok(controls.every(r=>r.left>=box.x&&r.top>=box.y&&r.right<=box.x+box.width+1&&r.bottom<=box.y+box.height+1),'Replay control clipped at enlarged scale');
  await page.screenshot({path:path.join(out,`replay-console-${label}.png`)});return {box,controls};
 }
 report.checks.replayLayout=await replayLayout('1280');await interfaceScale('1.5');report.checks.replayLayout150=await replayLayout('1280-150');
 await page.getByRole('button',{name:'Order log',exact:true}).click();const logDialog=page.getByRole('dialog',{name:'Replay command log'});await logDialog.waitFor();const logBox=await logDialog.boundingBox();assert.ok(logBox.x>=0&&logBox.y>=0&&logBox.x+logBox.width<=1281&&logBox.y+logBox.height<=721,'Replay log is clipped by command tray');await logDialog.getByRole('button',{name:'Close',exact:true}).click();report.checks.replayOrderLog=true;await interfaceScale('1');

 await timeline.focus();await timeline.press('Home');await until(async()=>Number(await timeline.inputValue())===Number(await timeline.getAttribute('min')),'Replay did not rewind');assert.equal(await page.getByRole('region',{name:'Production queue'}).getByRole('button').count(),0,'Future production queue survived rewind');report.checks.replayRewind=true;

 assert.deepEqual(report.errors,[]);assert.deepEqual(report.consoleErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);report.workerErrors=await page.evaluate(()=>window.workerErrors);const f=await snapshot();report.last=f?{tick:f.tick,actors:f.entities.filter(e=>e.owner===1).map(e=>({id:e.id,type:e.type,home:e.private?.home,state:e.state,landed:e.landed,pos:e.position}))}:undefined;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''));process.exitCode=1}
finally{await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));await browser.close();if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await stopped}await writeFile(path.join(out,'host.log'),log);await rm(data,{recursive:true,force:true});console.log(JSON.stringify({status:report.status,error:report.error,checks:report.checks,out},null,2))}
