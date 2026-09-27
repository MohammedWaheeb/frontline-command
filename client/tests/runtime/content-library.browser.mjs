// Isolated nonvisual integration: actual Go/WASM, fetch, IndexedDB and replay.
// Synthetic existing test geometry is not shipping content or a product UI.
import {chromium,firefox,webkit} from 'playwright-core';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {map} from './scenario.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),client=path.join(root,'client'),dir=await mkdtemp(path.join(tmpdir(),'frontline-library-'));
const evidence=path.join(root,'work/evidence/content-library');await mkdir(evidence,{recursive:true});
execFileSync('go',['build','-o',path.join(dir,'frontline.wasm'),'./cmd/wasm'],{cwd:root,env:{...process.env,GOOS:'js',GOARCH:'wasm'},stdio:'inherit'});
for(const name of ['worker.js','wasm_exec.js'])await copyFile(path.join(client,'public/runtime',name),path.join(dir,name));
await build({entryPoints:[path.join(client,'src/runtime/index.ts')],outfile:path.join(dir,'harness.js'),bundle:true,format:'iife',globalName:'FrontlineTest',platform:'browser',target:'es2022'});
const mission={id:'library-go-mission',version:'authored-v1',title:'Give an order',map_id:map.id,mode:'tutorial',faction:'US',briefing:'Synthetic integration mission.',debrief:'Synthetic integration complete.',rules_notice:'Synthetic timer fixture.',default_bases:true,players:[{id:1,faction:'US',name:'Human',team:1,credits:6000000,controller:'human'},{id:2,faction:'IR',name:'Script',team:2,credits:6000000,controller:'script'}],initial:[],objectives:[{id:'main',text:'Reach the test tick.',condition:{kind:'timer',tick:120}},{id:'optional',text:'Reach the earlier tick.',optional:true,condition:{kind:'timer',tick:110}}],triggers:[{id:'midpoint',condition:{kind:'timer',tick:105},actions:[{kind:'checkpoint',text:'Integration midpoint'}]}],difficulty:['easy','normal','hard'].map(id=>({id,enemy_credits_multiplier:1000,wave_time_multiplier:1000}))};
const encode=value=>Buffer.from(JSON.stringify(value)),digest=data=>createHash('sha256').update(data).digest('hex'),mapBytes=encode(map),missionBytes=encode(mission);
const index={format_version:1,version:'test-1',packs:[{id:'2.0.0',version:'2.0.0',manifest_url:'/assets/packs/test.json'}],maps:[{id:map.id,version:map.version,title:map.title,author:map.author,url:'/content/maps/map.json',sha256:digest(mapBytes),bytes:mapBytes.length,players:2,kind:'scenario',required_packs:['2.0.0']}],missions:[{id:mission.id,version:mission.version,title:mission.title,url:'/content/missions/mission.json',sha256:digest(missionBytes),bytes:missionBytes.length,map_id:map.id,mode:'tutorial',faction:'US',order:1,required_packs:['2.0.0']}]};
const files=new Map([['/',Buffer.from('<!doctype html><meta charset="utf-8"><title>Content library integration</title><link rel="icon" href="data:,"><script src="/harness.js"></script>')],['/content/index.json',encode(index)],['/content/maps/map.json',mapBytes],['/content/missions/mission.json',missionBytes]]);
for(const name of ['frontline.wasm','worker.js','wasm_exec.js','harness.js'])files.set(name==='harness.js'?'/harness.js':'/runtime/'+name,await readFile(path.join(dir,name)));
const host=createServer((req,res)=>{const data=files.get(req.url);if(!data){res.writeHead(404);res.end();return}res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.json')?'application/json':'text/html');res.end(data)});
await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+host.address().port,results=[];
try{for(const engine of [chromium,firefox,webkit].filter(value=>!process.env.FRONTLINE_TEST_BROWSER||value.name()===process.env.FRONTLINE_TEST_BROWSER)){
 const browser=await engine.launch({headless:true}),entry={browser:engine.name(),version:browser.version(),status:'running',errors:[]};
 try{
  const page=await browser.newPage();page.on('pageerror',error=>entry.errors.push(error.message));await page.goto(url);
  const result=await page.evaluate(async({missionID,mapID})=>{
   const R=globalThis.FrontlineTest,validator=new R.OfflineTransport(),library=new R.ContentLibrary({validator}),store=new R.LocalStore('library-browser'),progress=new R.CampaignProgressStore(store),journey=new R.CampaignJourney(library,progress),manager=new R.SessionController({databaseName:'library-browser-session'});
   try{
    await validator.ready;await library.loadIndex();const catalog=await library.catalog(),view=await journey.overview();
    const onboarding=new R.FirstRunJourney(store,{languages:['en'],scales:[1,1.25]});const first=await onboarding.read();const choices=await onboarding.complete({language:'en',ui_scale:1.25,sound:'disabled',destination:'tutorial'},0);
    const intent=onboarding.intent(choices.data,library.index),prepared=await journey.prepareSolo(missionID,'normal',101);await manager.startSolo(prepared.config);let runtime=manager.transport;await runtime.step(200);await manager.flushAutosave();
    const outcome=runtime.current.outcome,version=runtime.current.mission.version,firstRecord=await journey.recordSolo(runtime,'solo',{isCurrent:()=>manager.transport===runtime});await journey.recordSolo(runtime,'solo',{isCurrent:()=>manager.transport===runtime});const beforeReplay=(await progress.read()).revision;
    const save=await manager.saveManual('completed-mission','Completed integration mission'),replay=await runtime.exportReplay();await manager.loadSave(save);runtime=manager.transport;await journey.recordSolo(runtime,'solo',{isCurrent:()=>manager.transport===runtime});const afterRestore=(await progress.read()).revision;
    await manager.playReplay(replay);await manager.seekReplay(outcome.tick);runtime=manager.transport;const replayAward=await journey.recordSolo(runtime,'solo',{isCurrent:()=>manager.transport===runtime});
    await manager.startSolo({...prepared.config,ruleset:'practice-v1'});runtime=manager.transport;await runtime.step(200);const practiceAward=await journey.recordSolo(runtime,'solo',{isCurrent:()=>manager.transport===runtime});
    const recorded=await progress.read(),badMap=structuredClone(prepared.content.map);badMap.tiles[0].terrain='unsupported-terrain';const source=new TextEncoder().encode(JSON.stringify(badMap)),badIndex=library.index;badIndex.maps[0].bytes=source.length;badIndex.maps[0].sha256=await R.sha256Hex(source);
    const invalidLibrary=new R.ContentLibrary({validator,fetch:async()=>new Response(source)});invalidLibrary.useIndex(new TextEncoder().encode(JSON.stringify(badIndex)));let invalidCode='',preserved=false;try{await invalidLibrary.loadMap(mapID)}catch(error){invalidCode=error.code;preserved=error.originalFile()?.data.length===source.length}
    return {firstRun:first.required,intent,disabled:(await onboarding.read()).sound,library:view.tutorials[0].availability,catalog:!!catalog,outcome:outcome.reason,version,firstRecord:firstRecord.recorded,beforeReplay,afterRestore,finalRevision:recorded.revision,completions:Object.values(recorded.data.missions)[0].completions,optional:Object.values(recorded.data.missions)[0].optional_objectives,replayAward:replayAward.recorded,practiceAward:practiceAward.recorded,invalidCode,preserved};
   }finally{manager.dispose();validator.dispose();await store.close()}
  },{missionID:mission.id,mapID:map.id});
  assert.equal(result.firstRun,true);assert.equal(result.intent.mission,mission.id);assert.equal(result.disabled,'disabled');assert.equal(result.library,'available');assert.equal(result.catalog,true);assert.equal(result.outcome,'mission_complete');assert.equal(result.version,mission.version);assert.equal(result.firstRecord,true);assert.equal(result.beforeReplay,1);assert.equal(result.afterRestore,1);assert.equal(result.finalRevision,1);assert.equal(result.completions,1);assert.deepEqual(result.optional,['optional']);assert.equal(result.replayAward,false);assert.equal(result.practiceAward,false);assert.ok(result.invalidCode);assert.equal(result.preserved,true);assert.deepEqual(entry.errors,[]);entry.status='passed';entry.result=result;console.log(engine.name()+': actual Go validation, fetch, mission completion, restore dedupe, replay/practice exclusion and first-run preferences passed');
 }catch(error){entry.status='failed';entry.error=String(error.stack??error);process.exitCode=1;console.error(entry.error)}finally{await browser.close();results.push(entry);await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify({date:new Date().toISOString(),scope:'Synthetic nonvisual Go/WASM library integration, not shipping content acceptance.',results},null,2))}
}}finally{await new Promise(resolve=>host.close(resolve))}
