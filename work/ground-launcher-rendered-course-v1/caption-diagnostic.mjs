// Explicit future execution only. Browser lane must be separately released.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),argv=process.argv.slice(2),args={};
assert.equal(argv.length%2,0,'Paired --prepared --out [--engine] [--scenario] [--quality]');
for(let i=0;i<argv.length;i+=2){assert(['--prepared','--out','--engine','--scenario','--quality'].includes(argv[i]));assert(!Object.hasOwn(args,argv[i]));args[argv[i]]=argv[i+1]}
assert(args['--prepared']&&args['--out']);const prepared=path.resolve(args['--prepared']),out=path.resolve(args['--out']),engine=args['--engine']??'chromium';assert(['chromium','firefox','webkit'].includes(engine));
const qualities=args['--quality']?[args['--quality']]:['standard','high'];for(const q of qualities)assert(['standard','high'].includes(q));await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n',require=createRequire(path.join(root,'client/package.json'));
const {chromium,firefox,webkit}=require('playwright-core');
const report={status:'preflight',scope:'Actual existing native Session fixture with real complete US/IR/SY art. Prepared units/resources/damage are explicit. No paid opening, SA art, all-frame subjective acceptance, total memory or timing claim. Strict raw request diagnostics retained; no EOF/cancel classification in this course.',started:new Date().toISOString(),engine,prepared,errors:[],warnings:[],httpErrors:[],requestFailures:[],boundaries:[],replays:[],culling:[],reduced:[],deferred:[],served:{}};
let browser,page,server,phase='preflight',hold=false,held=[],gateReached;
const release=()=>{hold=false;for(const send of held.splice(0))send()};
const pins=new Map();async function pin(p,d){const b=await readFile(p);if(d)assert.equal(sha(b),d,p);pins.set(p,sha(b));return b}
try{
 const receiptBytes=await pin(path.join(prepared,'receipt.json')),receipt=JSON.parse(receiptBytes);assert.equal(receipt.status,'prepared-only');assert(receipt.noBrowserOrHost);
 const lock=JSON.parse(await pin(path.join(prepared,'source-lock.json'),receipt.sourceLockSHA256));for(const [name,digest]of Object.entries(lock.files))await pin(path.join(prepared,'source/client',name),digest);
 const bundle=await pin(path.join(prepared,'fixture.js'),receipt.bundleSHA256),planBytes=await pin(path.join(prepared,'plan.json'),receipt.planSHA256),plan=JSON.parse(planBytes);
 const scenarios=args['--scenario']?[args['--scenario']]:plan.scenarios;for(const s of scenarios)assert(plan.scenarios.includes(s));assert.deepEqual(plan.held,['SA.launcher']);
 const product=path.join(prepared,'product'),pack=JSON.parse(await pin(path.join(product,'assets/packs/base.json'),receipt.packSHA256)),expected=new Map(pack.files.map(f=>[f.path,f]));
 for(const name of ['frontline.wasm','worker.js','wasm_exec.js','version.json'])await pin(path.join(product,'runtime',name),receipt.runtime[name].sha256);
 await pin(path.join(prepared,'driver.mjs'),receipt.driverSHA256);
 const oracle=path.join(root,'work/ground-launcher-runtime-course-v1/oracle-01'),oracleReceipt=JSON.parse(await pin(path.join(oracle,'receipt.json'),'5e7b97787c9636c2e58b7cd50557650166a4673bf9fc8ca3e2d47f158aedeb1b'));
 const native=path.join(root,'work/ground-launcher-runtime-course-v1/native-03');const nativeReceipt=JSON.parse(await pin(path.join(native,'receipt.json'),'79740adedb492d3399bd924ab0fda7bde5b64cb9bad5b9b3b36e1af54610a3ab'));
 report.identity={preparedReceiptSHA256:sha(receiptBytes),sourceLockSHA256:receipt.sourceLockSHA256,packSHA256:receipt.packSHA256,bundleSHA256:receipt.bundleSHA256,planSHA256:receipt.planSHA256,runtime:receipt.runtime,handoffs:receipt.handoffs,scenarios,qualities,held:plan.held};
 await writeFile(path.join(out,'driver.mjs'),await readFile(fileURLToPath(import.meta.url)));
 const html='<!doctype html><html><head><meta charset="utf-8"><title>Actual launcher boundaries</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden;background:#191b14}#caption{position:fixed;top:12px;left:12px;background:#191b14;color:#ddc387;font:13px Arial;padding:10px;z-index:5;pointer-events:none}</style></head><body><div id="field"></div><div id="caption">Loading actual Go boundaries</div><script type="module" src="/fixture.js"></script></body></html>';
 const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.svg':'image/svg+xml'};
 server=createServer(async(req,res)=>{try{
  const url=decodeURIComponent(new URL(req.url,'http://local').pathname);assert(!url.split('/').includes('..'));
  if(url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
  let b;if(url==='/fixture.js')b=bundle;else if(url==='/plan.json')b=planBytes;
  else if(url==='/assets/packs/base.json')b=await pin(path.join(product,url),receipt.packSHA256);
  else if(url.startsWith('/oracle/')){const name=url.slice('/oracle/'.length);assert(oracleReceipt.artifacts[name]);b=await pin(path.join(oracle,name),oracleReceipt.artifacts[name])}
  else if(url.startsWith('/native/')){const name='evidence/'+url.slice('/native/'.length);assert(nativeReceipt.evidence[name]);b=await pin(path.join(native,name),nativeReceipt.evidence[name])}
  else {const f=expected.get(url);assert(f,'Unlisted product file '+url);b=await pin(path.join(product,url),f.sha256);assert.equal(b.length,f.bytes);report.served[url]={bytes:f.bytes,sha256:f.sha256}}
  const send=()=>{if(!res.destroyed){res.setHeader('Content-Type',mime[path.extname(url)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(b)}};
  if(hold&&url.endsWith('.png')){held.push(send);if(url.includes('.beauty.'))gateReached?.(url);return}send();
 }catch(error){res.statusCode=404;res.end(String(error))}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await({chromium,firefox,webkit})[engine].launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(120000);report.browserVersion=browser.version();
 await page.addInitScript(()=>{const Base=window.Worker,live=new Set();window.Worker=class extends Base{constructor(...a){super(...a);if(a[1]?.name==='Frontline Go simulation')live.add(this)}terminate(){live.delete(this);return super.terminate()}};window.launcherWorkers=()=>live.size});
 page.on('pageerror',e=>report.errors.push({phase,kind:'page',message:e.stack??e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,kind:'console',message:m.text()});if(m.type()==='warning')report.warnings.push({phase,message:m.text()})});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({phase,url:r.url(),status:r.status()})});page.on('requestfailed',r=>report.requestFailures.push({phase,url:r.url(),failure:r.failure()?.errorText}));
 phase='boot';await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.body.dataset.ready==='true');assert.equal(await page.evaluate(()=>window.launcherWorkers()),1);
 report.captures=[];
 const scenario='US.launcher',quality='standard';assert.deepEqual(scenarios,[scenario]);assert.deepEqual(qualities,[quality]);
 const index=plan.courses[scenario].findIndex(p=>p.stage==='11-deployed-after-shot');assert(index>=0);
 for(const [step,idx]of [['initial',0],['target',index],['repeat-target',index]]){
  phase=step;report.boundaries.push(await page.evaluate(a=>window.launcherQA.boundary(a.scenario,a.index,'owned',a.quality,a.index?'continuation':'load'),{scenario,index:idx,quality}));
  await page.screenshot({path:path.join(out,step+'.png')});
 }
 for(const variant of ['original','removed','moved','restored']){
  phase='caption-'+variant;
  const geometry=await page.evaluate(async variant=>{
   const c=document.getElementById('caption');
   c.style.display=variant==='removed'?'none':'';c.style.left=variant==='moved'?'800px':'';c.style.top=variant==='moved'?'120px':'';
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const r=c.getBoundingClientRect(),s=getComputedStyle(c),canvas=document.querySelector('canvas');
   return {caption:{x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,background:s.backgroundColor,text:c.textContent},canvas:{width:canvas.width,height:canvas.height}};
  },variant);
  await page.screenshot({path:path.join(out,phase+'.png')});
  const native=await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/png'));
  const bytes=Buffer.from(native.split(',')[1],'base64');await writeFile(path.join(out,phase+'-canvas.png'),bytes);
  report.captures.push({variant,...geometry,nativeCanvasSHA256:sha(bytes)});
 }
 report.scope+=' Test-only caption position/visibility A/B. Canvas toDataURL is a native backing-store diagnostic, not altered product art.';
 phase='dispose';report.disposal=await page.evaluate(()=>window.launcherQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.art.residentPages,0);assert.equal(report.disposal.art.pickingBytes,0);assert.deepEqual(report.disposal.errors,[]);assert.equal(await page.evaluate(()=>window.launcherWorkers()),0);report.functionalStatus='passed';report.status='passed';
}catch(error){report.status='failed';report.failedPhase=phase;report.failure=String(error.stack??error);process.exitCode=1;if(page){const mismatch=await page.evaluate(()=>window.launcherWireMismatch).catch(()=>undefined);if(mismatch)await writeFile(path.join(out,'wire-mismatch.json'),json(mismatch));await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}}
finally{
 release();if(page){report.cleanup=await page.evaluate(()=>window.launcherQA?.dispose()).catch(e=>({failure:String(e)}));report.workersAfter=await page.evaluate(()=>window.launcherWorkers?.()).catch(()=>undefined)}
 await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
 try{for(const [file,digest]of pins)assert.equal(sha(await readFile(file)),digest,'Input changed '+file);report.inputsVerifiedAfter=pins.size;assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.requestFailures,[]);assert(!report.cleanup?.failure);if(report.functionalStatus==='passed'){assert.equal(report.cleanup.canvases,0);assert.equal(report.workersAfter,0)}}catch(error){report.finalDiagnosticFailure=String(error.stack??error);report.status='failed';process.exitCode=1}
 report.closedAt=new Date().toISOString();await writeFile(path.join(out,'browser.json'),json(report));console.log(json({out,status:report.status,functional:report.functionalStatus,failure:report.failure,boundaries:report.boundaries.length,requests:report.requestFailures.length}));
}
