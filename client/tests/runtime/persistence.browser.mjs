// Nonvisual IndexedDB integration fixture; this is not a game screen.
import {chromium,firefox,webkit} from 'playwright-core';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const insecure=process.env.FRONTLINE_TEST_INSECURE==='1';
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const bundle=await build({entryPoints:[path.join(client,'src/runtime/storage.ts')],bundle:true,format:'esm',write:false,platform:'browser',target:'es2022'});
const server=createServer((request,response)=>{response.setHeader('Cache-Control','no-store');if(request.url==='/module.js'){response.setHeader('Content-Type','application/javascript');response.end(bundle.outputFiles[0].text)}else{response.setHeader('Content-Type','text/html');response.end('<!doctype html><meta charset="utf-8"><title>Persistence integration fixture</title><link rel="icon" href="data:,">')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://${insecure?'frontline-lan.test':'127.0.0.1'}:${server.address().port}`;
const report={originMode:insecure?'ordinary HTTP nonlocalhost':'localhost secure context',date:new Date().toISOString(),scope:'Actual IndexedDB transactions and Blob recovery with stub Go inspectors; gameplay/native/WASM parity tested separately.',browserPath:'Browser plugin not available; installed Playwright browsers used.',browsers:[]};
try{
 for(const type of (insecure?[chromium]:[chromium,firefox,webkit]).filter(type=>!process.env.FRONTLINE_TEST_BROWSER||type.name()===process.env.FRONTLINE_TEST_BROWSER)){
  const browser=await type.launch({headless:true,...(insecure?{args:['--host-resolver-rules=MAP frontline-lan.test 127.0.0.1','--no-proxy-server']}:{})});
  try{
   const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
   const result=await page.evaluate(async()=>{
    let stage='initializing';try{
    const {LocalStore}=await import('/module.js');const metadata={simulation:'fixture',protocol:1,content_hash:'fixture',map_version:'1',ruleset:'standard-v2',seed:1};
    const inspect=async data=>{await new Promise(resolve=>setTimeout(resolve,2));if(data[0]===0)throw new Error('Damaged fixture');return {metadata,tick:100}};
    const inspectReplay=async()=>({metadata,start_tick:0,end_tick:100,players:[1,2]});
    const source=new LocalStore('source',inspect,inspectReplay),target=new LocalStore('target',inspect,inspectReplay),other=new LocalStore('target',inspect,inspectReplay);
    const save={data:new TextEncoder().encode('{"large":18446744073709551615}'),tick:100,metadata,local_players:[1],hash:'fixture'};
    stage='source records';await source.putSave('one','Incoming',save);await source.putSetting('controls',{preset:'classic'});await source.putProgress('campaign',{version:1,results:[],missions:{}});await source.putReplay('battle','Battle',new Uint8Array([0,255,1,2]));
    stage='target records and preview';await target.putSave('one','Existing',save);const backup=await source.backup(),preview=await target.previewBackup(backup);await other.putSave('one','Changed in another tab',save,1);
    let conflict='';try{await target.restoreBackup(preview,preview.entries.map(entry=>({key:entry.key,action:'restore',expectedRevision:entry.current?.revision??0})))}catch(error){conflict=error.code}
    const noPartialSettings=(await target.setting('controls'))===undefined;
    stage='copy restore';const fresh=await target.previewBackup(backup);await target.restoreBackup(fresh,fresh.entries.map(entry=>entry.store==='saves'?{key:entry.key,action:'copy',id:'copy',expectedRevision:0}:{key:entry.key,action:'restore',expectedRevision:0}));
    stage='unreadable recovery';const raw=new Uint8Array([0,255,128,1]),unknown=await target.previewBackup(new Blob([raw]));const recovery=await target.restoreBackup(unknown,[]);
    const recovered=new Uint8Array(await(await target.exportRecovery(recovery.recoveryId)).arrayBuffer());
    stage='read replay and save';const replay=await target.getReplay('battle'),copy=await target.getSave('copy');const savedRevision=(await target.getSave('one')).revision;
    await source.close();await target.close();await other.close();
    stage='reopen';const reopened=new LocalStore('target',inspect,inspectReplay);const persisted={saves:(await reopened.listSaves()).length,replays:(await reopened.listReplays()).length,recovery:(await reopened.listRecoveryFiles()).length};await reopened.close();
    return {secure:isSecureContext,nativeHash:typeof crypto.subtle,nativeUUID:typeof crypto.randomUUID,conflict,noPartialSettings,recoveryExact:raw.every((value,index)=>recovered[index]===value)&&raw.length===recovered.length,copyExact:new TextDecoder().decode(copy.data)==='{"large":18446744073709551615}',replayExact:Array.from(replay.data).join(',')==='0,255,1,2',savedRevision,persisted};
    }catch(error){return {failedAt:stage,error:{code:error.code,message:error.message,details:{name:error.details?.name,message:error.details?.message}}}}
   });
   if(result.error)throw new Error(JSON.stringify({browser:type.name(),...result}));
   assert.equal(result.secure,!insecure);if(insecure){assert.equal(result.nativeHash,'undefined');assert.equal(result.nativeUUID,'undefined')}
   assert.equal(result.conflict,'backup_conflict');assert.ok(result.noPartialSettings&&result.recoveryExact&&result.copyExact&&result.replayExact);assert.equal(result.savedRevision,2);assert.deepEqual(result.persisted,{saves:2,replays:1,recovery:1});assert.deepEqual(errors,[]);
   report.browsers.push({name:type.name(),version:browser.version(),status:'passed',result});console.log(`${type.name()}: persistence integration passed`);
  }finally{await browser.close()}
 }
}finally{await new Promise(resolve=>server.close(resolve));const evidence=path.join(path.dirname(client),'work/evidence/runtime');await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,insecure?'persistence-http-lan-results.json':'persistence-browser-results.json'),JSON.stringify(report,null,2))}
