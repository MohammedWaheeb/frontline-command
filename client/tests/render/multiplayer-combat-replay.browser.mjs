// Supplemental visual review of an exact earned multiplayer replay. Run only
// after live hosts stop. Normal archive/import/timeline/camera controls only.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {minimapLayout,minimapProject} from '../../src/render/minimap.ts';
import {root,evidence,buildDir,product} from './multiplayer-combat-build.mjs';
const source=process.env.FRONTLINE_COMBAT_REPLAY;if(!source)throw Error('Set FRONTLINE_COMBAT_REPLAY to an exact completed replay.');
const out=path.join(evidence,'replay-camera-'+new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});const data=path.join(out,'host-data');await mkdir(data,{recursive:true});
const map=JSON.parse(await readFile(path.join(product,'content/maps/industrial-valley.json'),'utf8'));
const child=spawn(path.join(buildDir,'frontline'),['-addr','127.0.0.1:0','-data',data,'-static',product,'-maps',path.join(product,'content/maps'),'-missions',path.join(product,'content/missions')],{cwd:root,stdio:['ignore','pipe','pipe']});let log='';
const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Static host startup timed out')),20000);child.stdout.on('data',b=>{log+=b;const match=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0])}});child.stderr.on('data',b=>log+=b);child.once('exit',code=>reject(Error('Host exited '+code)))});
const browser=await chromium.launch({headless:false,channel:'chromium'}),page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(120000);
const report={build:JSON.parse(await readFile(path.join(buildDir,'build.json'),'utf8')),replaySHA256:createHash('sha256').update(await readFile(source)).digest('hex'),source:path.resolve(source),browser:browser.version(),scope:'Supplemental actual-Go replay camera review; not a second live match or live-network combat camera claim.',errors:[],frames:[]};page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,message,ms=120000){const start=Date.now();while(!await fn()){if(Date.now()-start>ms)throw Error(message);await pause(100)}}
const view=()=>page.evaluate(()=>{const json=window.multiplayerCombat.view();return json?JSON.parse(json):undefined});
try{
 await page.goto(origin);await page.getByRole('button',{name:'Explore game modes',exact:true}).click();await page.getByRole('button',{name:'Replay archive',exact:true}).click();await page.getByLabel('Import replay',{exact:true}).setInputFiles(path.resolve(source));await page.getByRole('button',{name:'Watch',exact:true}).waitFor();await page.getByRole('button',{name:'Watch',exact:true}).click();await page.getByRole('region',{name:'Replay controls'}).waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'});
 const slider=page.getByLabel('Replay timeline',{exact:true});await until(async()=>Number(await slider.getAttribute('max'))>100,'Replay bounds not loaded');const box=await slider.boundingBox();assert(box);const end=Number(await slider.getAttribute('max'));
 // Choose a middle-late interval from the real earned recording, by the timeline
 // control. The exact selected Go tick is recorded, never guessed from pixels.
 await slider.click({position:{x:box.width*.53,y:box.height/2}});await until(async()=>{const state=await view();return state?.tick>end*.45&&state.tick<end*.65},'Timeline did not seek to the selected interval');
 let snapshot=await view();const own=snapshot.entities.filter(e=>e.owner===snapshot.player&&/\.(rifle|at|tank)$/.test(e.type));assert(own.length);const subject=own.find(e=>['firing','aiming'].includes(e.state))??own.sort((a,b)=>b.position.x-a.position.x)[0];
 const mini=await page.getByLabel('Tactical minimap',{exact:true}).boundingBox();assert(mini);const point=minimapProject(minimapLayout(map.width,map.height,mini.width,mini.height),subject.position);await page.mouse.click(mini.x+point.x,mini.y+point.y);await page.getByLabel('Play replay',{exact:true}).click();const before=snapshot.tick;await until(async()=>{snapshot=await view();return snapshot.tick>=before+40},'Replay did not advance');
 await page.screenshot({path:path.join(out,'earned-match-battle-1600.png')});report.frames.push({tick:snapshot.tick,player:snapshot.player,subject:{id:subject.id,type:subject.type,position:subject.position},events:snapshot.events});
 await page.getByLabel('Pause replay',{exact:true}).click();await page.setViewportSize({width:1280,height:720});await page.screenshot({path:path.join(out,'earned-match-battle-paused-1280.png')});report.snapshot=snapshot;report.info=JSON.parse(await page.evaluate(()=>window.multiplayerCombat.info()));assert.equal(report.info.session.kind,'replay');assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1}
finally{await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));await browser.close();if(child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await stopped}await writeFile(path.join(out,'host.log'),log);console.log(report.status,out)}
