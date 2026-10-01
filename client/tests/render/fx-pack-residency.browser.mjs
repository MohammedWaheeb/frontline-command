import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';

// Author-only until the coordinated browser lane is released. Browser plugin
// not available: regular Playwright, real authored PNGs, frozen loader source.
const usage='node client/tests/render/fx-pack-residency.browser.mjs --product /absolute/frozen/product --out /absolute/new/evidence [--engine chromium|firefox|webkit] [--headless true|false]';
if(process.argv.includes('--help')){console.log(usage);process.exit(0)}
const argv=process.argv.slice(2),args={};assert.equal(argv.length%2,0,usage);
for(let i=0;i<argv.length;i+=2){assert(['--product','--out','--engine','--headless'].includes(argv[i]),usage);assert(!Object.hasOwn(args,argv[i]),'Duplicate argument');args[argv[i]]=argv[i+1]}
assert(args['--product']&&args['--out'],usage);
const root=fileURLToPath(new URL('../../../',import.meta.url)),product=await realpath(path.resolve(args['--product'])),source=await realpath(path.join(product,'../source/client')),out=path.resolve(args['--out']);
const engine=args['--engine']??'chromium';assert(['chromium','firefox','webkit'].includes(engine));assert(args['--headless']===undefined||['true','false'].includes(args['--headless']));
const headless=args['--headless']===undefined?engine!=='chromium':args['--headless']==='true';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),driver=fileURLToPath(import.meta.url),fixture=path.join(root,'client/tests/render/fx-pack-residency-fixture.ts');
function classifyNetworkFailures(engine,failures,requests,servedFiles,expectedFiles,pendingRelease){
 const completedBodyAbortReports=[],expectedCancellations=[],unexpectedFailures=[];
 for(const failure of failures){
  const url=new URL(failure.url).pathname;
  const read=Number.isInteger(failure.ordinal)&&failure.ordinal>0?requests.find(value=>value.url===url&&value.ordinal===failure.ordinal):undefined,served=servedFiles[url];
  // This category establishes native EOF and exact served-byte identity. Actual
  // successful verification/decode is asserted separately by full/pressure/reload.
  if(engine==='chromium'&&failure.message==='net::ERR_ABORTED'&&read?.bodyComplete&&read.status===200&&!read.aborted&&!read.readError&&read.bytesRead===served?.bytes&&expectedFiles.get(url)===served?.sha256){
   completedBodyAbortReports.push({failure,nativeReader:read,served});
  }else if(failure.phase==='pending-release'&&url===pendingRelease?.url&&read?.aborted&&!read.bodyComplete&&/abort|cancel/i.test(failure.message??''))expectedCancellations.push({failure,nativeReader:read});
  else unexpectedFailures.push(failure);
 }
 return {completedBodyAbortReports,expectedCancellations,unexpectedFailures};
}
await mkdir(path.dirname(out),{recursive:true});await mkdir(out);
const report={started:new Date().toISOString(),status:'running',product,source,engine,headless,
 scope:'Actual frozen 71-effect pack / five variants / real Pixi PNG loading, crop extraction and native-scale contacts. Default 32 MiB residency, constrained real-page pressure, idle eviction, reload, pending request release and final disposal. No synthetic artwork, product UI, Go simulation, performance, total GPU/heap or subjective-art approval claim.',
 tooling:'Browser plugin not available; existing Playwright. Authored tests are not passed evidence.',
 errors:[],httpErrors:[],requestFailures:[],served:{},changed:[],frozenSourceFiles:{},contacts:[]};
let temp,server,browser,page,observed,phase='preflight';const expectedFiles=new Map();
const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png'};
try{
 const driverBytes=await readFile(driver),fixtureBytes=await readFile(fixture),receiptBytes=await readFile(path.join(product,'../build.json'));
 report.identity={driverSHA256:hash(driverBytes),fixtureSHA256:hash(fixtureBytes),receiptSHA256:hash(receiptBytes),receipt:JSON.parse(receiptBytes.toString('utf8')),pixiPackageSHA256:hash(await readFile(path.join(root,'client/node_modules/pixi.js/package.json')))};
 assert.equal(report.identity.receipt.effectCount,71,'Expected explicit frozen 71-effect build');
 await writeFile(path.join(out,'driver.mjs'),driverBytes);await writeFile(path.join(out,'fixture.ts'),fixtureBytes);
 const artBytes=await readFile(path.join(product,'art/index.json')),art=JSON.parse(artBytes.toString('utf8')),descriptor=art.effects;
 assert.equal(descriptor.url,'fx/index.json');
 const indexBytes=await readFile(path.join(product,'art',descriptor.url));assert.equal(indexBytes.length,descriptor.bytes);assert.equal(hash(indexBytes),descriptor.sha256);
 expectedFiles.set('/art/index.json',hash(artBytes));expectedFiles.set('/art/'+descriptor.url,hash(indexBytes));
 const index=JSON.parse(indexBytes.toString('utf8'));assert.equal(Object.keys(index.effects).length,71);
 report.pack={artIndexSHA256:hash(artBytes),effectIndexSHA256:hash(indexBytes),pages:[],metadata:[],decodedRGBABytes:0};
 for(const [id,entry] of Object.entries(index.effects)){
  assert.equal(entry.url,`fx/${id.slice(3).replaceAll('.','/')}/effect.json`);const file=path.join(product,'art',entry.url),bytes=await readFile(file);assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);
  const meta=JSON.parse(bytes.toString('utf8'));assert.equal(meta.id,id);report.pack.metadata.push({id,url:entry.url,bytes:bytes.length,sha256:hash(bytes)});
  expectedFiles.set('/art/'+entry.url,hash(bytes));
  for(const [number,p] of meta.pages.entries()){
   assert(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(p.file)&&!p.file.includes('..'));const url=entry.url.replace(/effect\.json$/,p.file),png=await readFile(path.join(product,'art',url));
   assert.equal(png.length,p.bytes);assert.equal(hash(png),p.sha256);const rgba=p.width*p.height*4;assert(Number.isSafeInteger(rgba)&&rgba>0);
   report.pack.pages.push({id,page:number,url,bytes:png.length,sha256:hash(png),width:p.width,height:p.height,rgba});report.pack.decodedRGBABytes+=rgba;
   expectedFiles.set('/art/'+url,hash(png));
  }
 }
 assert.equal(report.pack.pages.length,132);assert.equal(report.pack.decodedRGBABytes,30622144);assert(report.pack.decodedRGBABytes<=32*1024*1024);
 temp=await mkdtemp(path.join(tmpdir(),'frontline-real-fx-residency-'));
 // Only the new test entry comes from this checkout. Every production import
 // is redirected into the supplied product's frozen source, never mutable src.
 const bundle=await build({absWorkingDir:root,entryPoints:[fixture],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'frozen-fx-source',setup(builder){builder.onResolve({filter:/^\.\.\/\.\.\/src\//},args=>{
  if(args.importer!==fixture)return;
  const relative=args.path.slice('../../src/'.length);return {path:path.join(source,'src',relative+(path.extname(relative)?'':'.ts'))};
 })}}]});
 for(const input of Object.keys(bundle.metafile.inputs)){
  const absolute=path.resolve(root,input);if(!absolute.startsWith(source+path.sep))continue;
  const relative=path.relative(source,absolute),digest=hash(await readFile(absolute));report.frozenSourceFiles[relative]=digest;
  const expected=report.identity.receipt.sourceFiles[relative];assert(expected,`Consumed source absent from freeze receipt: ${relative}`);assert.equal(digest,expected,`Frozen source changed: ${relative}`);
 }
 assert(report.frozenSourceFiles['src/render/effect-assets.ts']);assert(report.frozenSourceFiles['src/runtime/effect-library.ts']);
 const bundleBytes=await readFile(path.join(temp,'main.js'));report.identity.bundleSHA256=hash(bundleBytes);await writeFile(path.join(out,'fixture.bundle.js'),bundleBytes);
 server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
   if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Authored FX residency course</title><link rel="icon" href="data:,"><style>html,body{margin:0;background:#181b13;overflow:hidden}</style><script type="module" src="/main.js"></script>');return}
   if(pathname==='/main.js'){res.setHeader('Content-Type','text/javascript');res.end(bundleBytes);return}
   assert(pathname.startsWith('/art/'));const file=await realpath(path.resolve(product,pathname.slice(1)));assert(file.startsWith(product+path.sep));
   const bytes=await readFile(file),digest=hash(bytes),prior=report.served[pathname];
   assert(expectedFiles.has(pathname),'Unlisted effect file');if(expectedFiles.get(pathname)!==digest){report.changed.push(pathname);throw Error('File differs from frozen preflight')}
   if(prior&&prior.sha256!==digest){report.changed.push(pathname);throw Error('Frozen file changed')}
   report.served[pathname]={bytes:bytes.length,sha256:digest};res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.setHeader('Content-Length',bytes.length);res.setHeader('Cache-Control','no-store');res.end(bytes);
  }catch{res.statusCode=404;res.end('Frozen art unavailable')}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await({chromium,firefox,webkit})[engine].launch({headless,...engine==='chromium'?{channel:'chromium'}:{}});report.browser=browser.version();
 page=await browser.newPage({viewport:{width:1800,height:1060}});page.setDefaultTimeout(120000);
 page.on('pageerror',error=>report.errors.push({phase,type:'pageerror',message:error.message}));
 page.on('console',message=>{if(message.type()==='error')report.errors.push({phase,type:'console',message:message.text()})});
 page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({phase,url:response.url(),status:response.status()})});
 const requestOrdinals=new WeakMap(),urlRequests=new Map();
 page.on('request',request=>{const ordinal=(urlRequests.get(request.url())??0)+1;urlRequests.set(request.url(),ordinal);requestOrdinals.set(request,ordinal)});
 page.on('requestfailed',request=>report.requestFailures.push({phase,url:request.url(),ordinal:requestOrdinals.get(request),message:request.failure()?.errorText}));
 phase='boot';await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 phase='all-pages';report.full=await page.evaluate(()=>window.fxPackQA.full());assert.equal(report.full.effects,71);assert.equal(report.full.variants.length,355);assert.equal(report.full.pageUploads.length,132);
 assert.equal(report.full.statistics.allocatedBytes,30622144);assert(report.full.lazyMisses>0);assert(report.full.variants.every(value=>value.alphaPixels>0));
 phase='native-contact';for(let i=0;i<report.full.contactPages;i++){
  const result=await page.evaluate(i=>window.fxPackQA.contact(i),i);for(const p of result.positions)assert(p.x>=0&&p.y>=0&&p.x+p.width<=1800&&p.y+p.height<=1060,'Native contact frame clipped');report.contacts.push(result);
  await page.screenshot({path:path.join(out,`native-variants-${String(i+1).padStart(2,'0')}.png`)});
 }
 assert.equal(report.contacts.flatMap(value=>value.positions).length,355);
 phase='release-full';report.released=await page.evaluate(()=>window.fxPackQA.releaseFull());assert.equal(report.released.statistics.allocatedBytes,0);
 phase='pressure';report.pressure=await page.evaluate(()=>window.fxPackQA.pressure());assert(report.pressure.denied.length>0);assert.equal(report.pressure.final.allocatedBytes,0);
 phase='pending-release';report.pendingRelease=await page.evaluate(()=>window.fxPackQA.pendingRelease());assert.equal(report.pendingRelease.final.allocatedBytes,0);
 observed=await page.evaluate(()=>window.fxPackQA.stats());
 phase='dispose';report.disposal=await page.evaluate(()=>window.fxPackQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.statistics.allocatedBytes,0);
 assert.deepEqual(report.disposal.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);report.failedPhase=phase;process.exitCode=1;
 if(page){report.failureState=await page.evaluate(()=>window.fxPackQA?.stats()).catch(()=>undefined);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}
}finally{
 if(page){
  report.cleanup=await page.evaluate(()=>window.fxPackQA?.dispose()).catch(error=>({failure:String(error)}));
  observed=await page.evaluate(()=>window.fxPackQA?.stats()).catch(()=>observed);
 }
 // Request/console callbacks stay attached through disposal and browser close.
 // Only then reconcile the complete raw ledger against the last native-reader
 // trace. A late unclassified failure must not survive in a passing report.
 phase='browser-close';
 try{await browser?.close()}catch(error){report.errors.push({phase,type:'browser-close',message:String(error)})}
 if(server?.listening)await new Promise(resolve=>server.close(resolve));
 Object.assign(report,classifyNetworkFailures(engine,report.requestFailures,observed?.requests??[],report.served,expectedFiles,report.pendingRelease));
 report.diagnosticReconciliation={afterBrowserClose:true,requestFailures:report.requestFailures.length,classified:report.completedBodyAbortReports.length+report.expectedCancellations.length+report.unexpectedFailures.length,readerRequests:observed?.requests.length??0};
 try{
  assert.deepEqual(report.unexpectedFailures,[],'Unexpected network failure or incomplete resource body');
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.changed,[]);
  assert(!report.cleanup?.failure,'Fixture cleanup failed');assert.deepEqual(observed?.errors??[],[]);
  assert.equal(report.diagnosticReconciliation.classified,report.requestFailures.length,'Unclassified late diagnostic');
 }catch(error){report.diagnosticFailure=String(error.stack??error);if(report.status==='passed'){report.failure=report.diagnosticFailure;report.failedPhase='final-diagnostics'}report.status='failed';process.exitCode=1}
 if(temp)await rm(temp,{recursive:true,force:true});report.finished=new Date().toISOString();await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));
 console.log(report.status,report.failure??out);
}
