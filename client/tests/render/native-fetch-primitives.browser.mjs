import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,readFile,realpath,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright-core';

// Isolated browser primitive diagnostic. No game, global fetch wrapper, extra
// native body read, interception, request retry, forced GC or settings change.
const argv=process.argv.slice(2),args={};assert.equal(argv.length%2,0);
for(let i=0;i<argv.length;i+=2){assert(['--product','--out','--executable','--iterations','--pipe'].includes(argv[i]));assert(!Object.hasOwn(args,argv[i]));args[argv[i]]=argv[i+1]}
assert(args['--product']&&args['--out']);
const product=await realpath(path.resolve(args['--product'])),out=path.resolve(args['--out']);
const iterations=Number(args['--iterations']??16);assert(Number.isSafeInteger(iterations)&&iterations>=1&&iterations<=64);
const executable=args['--executable']?await realpath(path.resolve(args['--executable'])):chromium.executablePath();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const resources=[
 {name:'small.json',path:'art/sprites/building.US.hq/building.US.hq@2x.beauty.0.json',type:'application/json'},
 {name:'small.png',path:'art/ui/chrome/button_pressed@2x.png',type:'image/png'},
 {name:'medium.png',path:'art/sprites/unit.US.elite/unit.US.elite@1x.beauty.png',type:'image/png'},
];
const pipe=args['--pipe']==='true';assert(args['--pipe']===undefined||['true','false'].includes(args['--pipe']));
const pipeSource=pipe?await readFile(new URL('./native-fetch-pipe-candidate.mjs',import.meta.url)):undefined;
const data=new Map();for(const r of resources){const bytes=await readFile(path.join(product,r.path));r.bytes=bytes.length;r.sha256=hash(bytes);if(r.type==='application/json')r.canonicalJSON=JSON.stringify(JSON.parse(bytes));data.set(r.name,bytes)}
await mkdir(path.dirname(out),{recursive:true});await mkdir(out);
for(const r of resources)await writeFile(path.join(out,r.name),data.get(r.name));
const source=await readFile(fileURLToPath(import.meta.url));await writeFile(path.join(out,'driver.mjs'),source);
const patterns=pipe?[{id:'stream-release-signal',body:'stream',release:true,controller:true},{id:'arraybuffer-signal',body:'arrayBuffer',controller:true},{id:'bounded-pipe-signal',body:'pipe',controller:true}]:[
 {id:'stream-release-none',body:'stream',release:true},
 {id:'stream-release-signal',body:'stream',release:true,controller:true},
 {id:'stream-hold-none',body:'stream',retain:'both'},
 {id:'stream-hold-signal',body:'stream',retain:'both',controller:true},
 {id:'stream-release-retain-response',body:'stream',release:true,retain:'response',controller:true},
 {id:'stream-release-retain-reader',body:'stream',release:true,retain:'reader',controller:true},
 {id:'arraybuffer-none',body:'arrayBuffer'},
 {id:'arraybuffer-signal',body:'arrayBuffer',controller:true},
 {id:'blob-none',body:'blob'},
 {id:'blob-signal',body:'blob',controller:true},
 {id:'json-none',body:'json'},
 {id:'json-signal',body:'json',controller:true},
 {id:'explicit-abort-after-eof',body:'stream',release:true,controller:true,abortAfterEOF:true},
];
const report={started:new Date().toISOString(),status:'running',scope:'Standalone native browser fetch primitive diagnostic. Immutable real JSON/PNG bytes only; no React/Go/game/runtime/art mutation, synthetic response view, global fetch wrapper, forced GC, timing/performance or decoded-image claim. Exact native byte hashes computed after each workload block; native Response.json is semantic equality only.',iterations,resources,patterns,
 identity:{pipeCandidateSHA256:pipeSource?hash(pipeSource):undefined,driverSHA256:hash(source),product,executable,executableSHA256:hash(await readFile(executable)),profile:'Fresh Playwright temporary profile'},cases:[],network:[],nativeEvents:[],errors:[],httpErrors:[],requestFailures:[],serverRequests:[]};
let browser,page,session,order=0,phase='starting';const network=new Map();
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://local');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel=icon href="data:,"><title>Native fetch primitive diagnostic</title><p>Native fetch only</p>');return}
 if(url.pathname==='/pipe-candidate.mjs'&&pipeSource){res.setHeader('Content-Type','text/javascript');res.end(pipeSource);return}
 const name=url.pathname.slice(1),bytes=data.get(name);if(!bytes){res.statusCode=404;res.end('Missing immutable fixture');return}
 report.serverRequests.push({url:`http://${req.headers.host}${req.url}`,bytes:bytes.length,sha256:hash(bytes)});
 res.setHeader('Content-Type',resources.find(r=>r.name===name).type);res.setHeader('Content-Length',bytes.length);res.setHeader('Cache-Control','no-store');
 if(url.searchParams.has('slow')){res.write(bytes.subarray(0,1));const timer=setTimeout(()=>res.end(bytes.subarray(1)),300);res.on('close',()=>clearTimeout(timer));return}res.end(bytes);
});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;report.origin=origin;
 browser=await chromium.launch({headless:true,...args['--executable']?{executablePath:executable}:{channel:'chromium'}});report.browser=browser.version();
 const context=await browser.newContext(),p=await context.newPage();page=p;session=await context.newCDPSession(page);
 const info=await session.send('Target.getTargetInfo');assert.equal(info.targetInfo.type,'page');report.target=info.targetInfo.targetId;
 session.on('Runtime.bindingCalled',event=>{if(event.name==='__nativePrimitiveEvent'){const payload=JSON.parse(event.payload);report.nativeEvents.push({...payload,order:++order,executionContextId:event.executionContextId});}});
 session.on('Network.requestWillBeSent',event=>{order++;network.set(event.requestId,{requestId:event.requestId,url:event.request.url,method:event.request.method,type:event.type,frameId:event.frameId,loaderId:event.loaderId,requestOrder:order,timestamp:event.timestamp,wallTime:event.wallTime});});
 session.on('Network.responseReceived',event=>{order++;Object.assign(network.get(event.requestId)??{},{responseOrder:order,status:event.response.status,responseURL:event.response.url,fromServiceWorker:event.response.fromServiceWorker,fromDiskCache:event.response.fromDiskCache});});
 session.on('Network.loadingFinished',event=>{order++;Object.assign(network.get(event.requestId)??{},{finishedOrder:order,encodedDataLength:event.encodedDataLength});});
 session.on('Network.loadingFailed',event=>{order++;Object.assign(network.get(event.requestId)??{},{failureOrder:order,failure:event.errorText,canceled:event.canceled});});
 await session.send('Runtime.enable');await session.send('Network.enable');await session.send('Runtime.addBinding',{name:'__nativePrimitiveEvent'});
 page.on('pageerror',e=>report.errors.push({phase,kind:'pageerror',message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,kind:'console',message:m.text()})});
 page.on('requestfailed',r=>report.requestFailures.push({phase,url:r.url(),message:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({phase,url:r.url(),status:r.status()})});
 await page.goto(origin);assert.equal(await page.title(),'Native fetch primitive diagnostic');
 // Two observation levels. Neither replaces fetch or any response/reader method.
 // binding emits ordering at native call boundaries; local keeps only JS rows
 // until the whole block ends, so its body lifetime is less instrumented.
 for(const observation of ['local','binding'])for(const pattern of patterns){
  phase=`${observation}:${pattern.id}`;
  const result=await page.evaluate(async({pattern,resources,iterations,observation,caseID})=>{
   const retained=[],bodies=[],rows=[];let ordinal=0;
   const pipeRead=pattern.body==='pipe'?(await import('/pipe-candidate.mjs')).boundedPipeRead:undefined,total={bytes:0};
   const mark=(row,kind)=>{row.events.push({kind,time:performance.now()});if(observation==='binding')window.__nativePrimitiveEvent(JSON.stringify({caseID,id:row.id,url:row.url,kind,time:performance.now()}));};
   async function read(resource,i){
    const id=`${caseID}-${i}-${resource.name}`,url=new URL(`/${resource.name}?request=${id}`,location.href).href;
    const controller=pattern.controller?new AbortController():undefined,row={id,url,resource:resource.name,ordinal:++ordinal,events:[],signal:false};rows.push(row);
    controller?.signal.addEventListener('abort',()=>{row.signal=true;mark(row,'signal-abort')},{once:true});
    mark(row,'dispatch');
    if(pipeRead){
     const blob=await pipeRead(fetch,url,{signal:controller?.signal,limit:64*1024*1024,total,maxTotal:2*1024*1024*1024,observe:kind=>mark(row,kind)});
     row.status=200;row.responseURL=url;const bytes=new Uint8Array(await blob.arrayBuffer());row.bytes=bytes.byteLength;bodies.push({row,bytes});mark(row,'caller-return');return;
    }
    const response=await fetch(url,{cache:'no-store',...controller?{signal:controller.signal}:{}});row.status=response.status;row.responseURL=response.url;mark(row,'headers');
    let bytes,reader;
    if(pattern.body==='stream'){
     reader=response.body.getReader();const chunks=[];let size=0;
     for(;;){const result=await reader.read();if(result.done){mark(row,'eof');break}chunks.push(result.value);size+=result.value.byteLength}
     row.bytes=size;bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
     if(pattern.release){reader.releaseLock();mark(row,'released-lock')}
    }else if(pattern.body==='json'){
     const value=await response.json();row.jsonEqual=JSON.stringify(value)===resource.canonicalJSON;mark(row,'json-resolved');
    }else if(pattern.body==='arrayBuffer'){
     bytes=new Uint8Array(await response.arrayBuffer());row.bytes=bytes.byteLength;mark(row,'arraybuffer-resolved');
    }else{
     const blob=await response.blob();mark(row,'blob-resolved');bytes=new Uint8Array(await blob.arrayBuffer());row.bytes=bytes.byteLength;
    }
    if(pattern.retain==='both')retained.push({response,reader,controller});else if(pattern.retain==='reader')retained.push({reader,controller});else if(pattern.retain==='response')retained.push({response,controller});
    if(pattern.abortAfterEOF){controller.abort();mark(row,'explicit-abort-returned')}
    if(bytes)bodies.push({row,bytes});mark(row,'caller-return');
   }
   for(let i=0;i<iterations;i++)for(const resource of resources)if(pattern.body!=='json'||resource.type==='application/json')await read(resource,i);
   // Integrity runs after the block's native read patterns. It never reads a
   // Response twice, hashes a clone, retains a Response incidentally, or retries.
   for(const {row,bytes}of bodies)row.sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const held=retained.length;retained.length=0;return {caseID,rows,heldDuringBlock:held,releasedRetained:true};
  },{pattern,resources,iterations,observation,caseID:phase});
  for(const row of result.rows){const resource=resources.find(r=>r.name===row.resource);assert.equal(row.status,200);assert.equal(row.responseURL,row.url);if(row.sha256){assert.equal(row.bytes,resource.bytes);assert.equal(row.sha256,resource.sha256)}else assert.equal(row.jsonEqual,true)}
  report.cases.push({...result,observation,pattern:pattern.id});
 }
 if(pipe){
  phase='pipe-negative-controls';report.negativeControls=await page.evaluate(async()=>{
   const {boundedPipeRead}=await import('/pipe-candidate.mjs'),defaults=()=>({limit:64*1024*1024,total:{bytes:0},maxTotal:2*1024*1024*1024}),rows=[];
   const expect=async(name,url,options,check)=>{let error;try{await boundedPipeRead(fetch,url,options)}catch(e){error=e}if(!error||!check(error))throw Error('Negative control failed: '+name);rows.push({name,url:new URL(url,location.href).href,error:error.name,message:error.message,causePreserved:true})};
   await expect('per-file','/medium.png?request=negative-limit',{...defaults(),limit:1024},e=>/exceeds/.test(e.message));
   const shared={...defaults(),maxTotal:5000};await boundedPipeRead(fetch,'/small.png?request=negative-total-first',shared);await expect('shared-total','/small.json?request=negative-total-next',shared,e=>/exceeds/.test(e.message));
   const parent=new AbortController(),reason=Error('Exact parent cancellation');
   await expect('parent-cancel','/medium.png?request=negative-parent&slow=1',{...defaults(),signal:parent.signal,observe:kind=>{if(kind==='headers')setTimeout(()=>parent.abort(reason),10)}},e=>e===reason);
   await expect('deadline','/medium.png?request=negative-timeout&slow=1',{...defaults(),scheduleTimeout:callback=>{const timer=setTimeout(callback,20);return()=>clearTimeout(timer)}},e=>e.name==='TimeoutError');
   return rows;
  });
 }
 phase='closing';await context.close();
}catch(error){report.status='failed-native-check';report.failure=String(error.stack??error);process.exitCode=1}
finally{
 try{await browser?.close()}catch(error){report.errors.push({phase:'close',kind:'browser',message:String(error)})}
 if(server.listening)await new Promise(resolve=>server.close(resolve));report.network=[...network.values()];
 const rows=report.cases.flatMap(c=>c.rows.map(r=>({...r,caseID:c.caseID,observation:c.observation,pattern:c.pattern}))),byURL=new Map(rows.map(r=>[r.url,r]));
 report.failedRequests=report.network.filter(r=>r.failure).map(request=>({request,native:byURL.get(request.url),nativeEvents:report.nativeEvents.filter(e=>e.url===request.url)}));
 const grouped=new Map();for(const c of report.cases)grouped.set(c.caseID,{caseID:c.caseID,requests:c.rows.length,failures:0,completeWithHash:c.rows.filter(r=>r.sha256).length,parsedJSON:c.rows.filter(r=>r.jsonEqual).length});
 for(const r of report.failedRequests){const group=grouped.get(r.native?.caseID);if(group)group.failures++}
 report.summary=[...grouped.values()];
 report.uniqueIdentity={nativeURLs:new Set(rows.map(r=>r.url)).size===rows.length,eachServedOnce:rows.every(r=>report.serverRequests.filter(s=>s.url===r.url).length===1),eachNetworkOnce:rows.every(r=>report.network.filter(n=>n.url===r.url&&n.type==='Fetch'&&n.status===200).length===1)};
 const counts=rows=>{const m=new Map();for(const r of rows){const k=JSON.stringify([r.url,r.message??r.failure]);m.set(k,(m.get(k)??0)+1)}return [...m].sort()};
 report.diagnosticsAgree=JSON.stringify(counts(report.requestFailures))===JSON.stringify(counts(report.network.filter(r=>r.failure)));
 report.identity.executableUnchanged=hash(await readFile(executable))===report.identity.executableSHA256;
 if(report.status==='running')report.status=report.failedRequests.length?'observed-network-failures':'no-network-failures-observed';
 if(report.errors.length||report.httpErrors.length||!report.diagnosticsAgree||!report.identity.executableUnchanged||Object.values(report.uniqueIdentity).some(v=>!v)){report.status='failed-diagnostic-integrity';process.exitCode=1}
 report.finished=new Date().toISOString();await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browser:report.browser,errors:report.errors,httpErrors:report.httpErrors,diagnosticsAgree:report.diagnosticsAgree,summary:report.summary},null,2));
}
