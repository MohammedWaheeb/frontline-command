import {build} from '../../../client/node_modules/esbuild/lib/main.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../../..'),app=path.join(root,'client/src/app');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const original={fetch:globalThis.fetch,createImageBitmap:globalThis.createImageBitmap,timeout:AbortSignal.timeout,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
const results=[];
try {
 for(const [label,source] of [['before',path.join(out,'asset-preparation-before.ts')],['after',path.join(app,'asset-preparation.ts')]]){
  const bytes=await readFile(source),output=path.join(out,`${label}-deadline.mjs`);
  await build({stdin:{contents:bytes.toString(),loader:'ts',resolveDir:app,sourcefile:'asset-preparation.ts'},outfile:output,bundle:true,format:'esm',platform:'node',plugins:[{name:'map-material-independent-test',setup(build){build.onResolve({filter:/render\/terrain$/},()=>({path:'terrain',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"export const materialFor=()=> 'grass'"}));}}]});
  const timers=[],signals=[],parent=new AbortController();
  AbortSignal.timeout=ms=>{assert.equal(ms,15000);const controller=new AbortController();timers.push({active:true,run:()=>controller.abort(new DOMException('Timeout','TimeoutError'))});return controller.signal};
  globalThis.setTimeout=(run,ms)=>{assert.equal(ms,15000);const timer={active:true,run};timers.push(timer);return timer};
  globalThis.clearTimeout=timer=>{timer.active=false};
  globalThis.fetch=async(url,options)=>{
   signals.push(options.signal);
   if(url.endsWith('sprite.json'))return new Response(JSON.stringify({atlases:{'1x':{beauty:['page.json']},'2x':{beauty:['page.json']}}}));
   if(url.endsWith('page.json'))return new Response(JSON.stringify({meta:{image:'page.png',size:{w:4,h:4}},frames:{'idle/d00_f00':{frame:{x:0,y:0,w:4,h:4}}}}));
   return new Response('test-only image bytes');
  };
  globalThis.createImageBitmap=async()=>({width:4,height:4,close(){}});
  const {prepareBattleAssets}=await import(pathToFileURL(output));
  const result=await prepareBattleAssets({width:0,height:0},[{faction:'US'}],{units:new Map([['US.car',{id:'US.car',faction:'US'}]]),buildings:new Map()},{scale:'1x',init:async()=>({sprites:{'unit.US.car':'car/sprite.json'},terrain:[],portraits:[],buildIcons:[]}),resolve:type=>type==='US.car'?{id:'unit.US.car',standIn:false}:undefined},undefined,parent.signal);
  assert.ok(signals.every(signal=>!signal.aborted));
  const deadlinesRemainingAfterEOF=timers.filter(timer=>timer.active).length;
  for(const timer of timers)if(timer.active)timer.run();
  const abortedAfterDeadline=signals.filter(signal=>signal.aborted).length;parent.abort();
  const abortedAfterParent=signals.filter(signal=>signal.aborted).length;
  if(label==='before'){assert.equal(abortedAfterDeadline,signals.length);assert.ok(deadlinesRemainingAfterEOF>0)}else{assert.equal(abortedAfterDeadline,0);assert.equal(abortedAfterParent,0);assert.equal(deadlinesRemainingAfterEOF,0)}
  results.push({label,sourceSHA256:hash(bytes),requests:signals.length,verifiedFiles:result.files,deadlinesRemainingAfterEOF,abortedAfterDeadline,abortedAfterParent});
 }
}finally{Object.assign(globalThis,{fetch:original.fetch,createImageBitmap:original.createImageBitmap,setTimeout:original.setTimeout,clearTimeout:original.clearTimeout});AbortSignal.timeout=original.timeout}
const report={scope:'Original and corrected production prepareBattleAssets, deterministic deadline scheduler and test response/image oracle. This proves source-level late abort cleanup, not the cause/classification of any prior browser ERR_ABORTED.',helperSHA256:hash(await readFile(path.join(app,'asset-preflight.ts'))),results};
await writeFile(path.join(out,'deadline-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
