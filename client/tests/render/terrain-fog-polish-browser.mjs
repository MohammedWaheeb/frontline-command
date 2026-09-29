// Author-only until root releases its serial browser lane. No Go/host/runtime.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';

const usage='node client/tests/render/terrain-fog-polish-browser.mjs --product /absolute/frozen/product --out /absolute/new/evidence [--engine chromium|firefox|webkit] [--headless true|false] [--inputs /absolute/frozen/inputs --candidate-sha SHA256] [--build-only true|false]';
if(process.argv.includes('--help')){console.log(usage);process.exit(0)}
const argv=process.argv.slice(2),args={};assert.equal(argv.length%2,0,usage);
for(let i=0;i<argv.length;i+=2){assert(['--product','--out','--engine','--headless','--inputs','--candidate-sha','--build-only'].includes(argv[i]),usage);assert(!Object.hasOwn(args,argv[i]),'Duplicate argument');args[argv[i]]=argv[i+1]}
assert(args['--product']&&args['--out'],usage);
const root=fileURLToPath(new URL('../../../',import.meta.url)),input=await realpath(path.resolve(args['--inputs']??path.join(root,'work/terrain-polish-review/inputs'))),product=await realpath(path.resolve(args['--product'])),out=path.resolve(args['--out']),engine=args['--engine']??'chromium';
assert(['chromium','firefox','webkit'].includes(engine));assert(args['--headless']===undefined||['true','false'].includes(args['--headless']));
assert(args['--build-only']===undefined||['true','false'].includes(args['--build-only']));const buildOnly=args['--build-only']==='true',candidateSHA=args['--candidate-sha']??'8f6524d761bae054bd80b220f02ca4d6b96ff64449134c51ea543bcb93507a73';assert(/^[a-f0-9]{64}$/.test(candidateSHA));
const expectedInputs={'baseline-terrain.ts':'52d20cd00f5f3fbfc0f922661e929dbfb17f434463703914e60c213e0bdead69','candidate-terrain.ts':candidateSHA,'terrain-surface.ts':'7d498da7b940e4741ed8e74b7996d2d7a420e310066dba28a7ed6b328437ef2e','terrain-materials.ts':'c1c466f0ffddcd77e62a7272b0d0963f81393714feb0177aaedeb0d3f41d8588','iso.ts':'98654186dbd723fdefdb70ff9bcdc26b6f74b7a5d4d0579c3d6e4244ef9aebdf'};
const headless=args['--headless']===undefined?engine!=='chromium':args['--headless']==='true',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(path.dirname(out),{recursive:true});await mkdir(out); // Refuse overwrite, including a previous failed run.
const report={started:new Date().toISOString(),status:'running',engine,headless,product,input,candidateSHA,buildOnly,
 scope:'Frozen baseline/candidate TerrainBaker with synthetic public geometry and real Pixi GPU alpha. Macro screenshots use frozen authored PNGs separately. No Go gameplay, App UI, hidden-entity, reference performance or subjective-art approval claim.',
 errors:[],httpErrors:[],requestFailures:[],served:{},geometry:[],cpu:[]};
let browser,page,server,temp;
try{
 const lockBytes=await readFile(path.join(input,'lock.json')),lock=JSON.parse(lockBytes);report.inputLockSHA256=sha(lockBytes);report.inputs=lock;
 assert.deepEqual(Object.keys(lock).sort(),Object.keys(expectedInputs).sort());for(const [name,entry] of Object.entries(lock)){assert.equal(entry.sha256,expectedInputs[name],`Unexpected frozen input:${name}`);const bytes=await readFile(path.join(input,name));assert.equal(sha(bytes),entry.sha256,`Frozen input drift:${name}`);assert.equal(bytes.length,entry.bytes)}
 const fixture=path.join(root,'client/tests/render/terrain-fog-polish-fixture.ts'),fixtureBytes=await readFile(fixture),driverBytes=await readFile(fileURLToPath(import.meta.url));report.fixtureSHA256=sha(fixtureBytes);report.driverSHA256=sha(driverBytes);report.pixiPackage=JSON.parse(await readFile(path.join(root,'client/node_modules/pixi.js/package.json'),'utf8')).version;
 await writeFile(path.join(out,'fixture.ts'),fixtureBytes);await writeFile(path.join(out,'driver.mjs'),driverBytes);await writeFile(path.join(out,'input-lock.json'),lockBytes);
 const redirects=new Map(['baseline-terrain','candidate-terrain','terrain-surface'].map(name=>[`../../../work/terrain-polish-review/inputs/${name}`,path.join(input,`${name}.ts`)]));
 temp=await mkdtemp(path.join(tmpdir(),'frontline-fog-polish-'));const compiled=await build({entryPoints:[fixture],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'exact-frozen-fog-inputs',setup(build){build.onResolve({filter:/terrain-polish-review\/inputs\//},args=>{if(args.importer===fixture&&redirects.has(args.path))return {path:redirects.get(args.path)};throw Error(`Unexpected frozen input import: ${args.importer} -> ${args.path}`)})}}]});
 report.bundleSHA256=sha(await readFile(path.join(temp,'main.js')));await writeFile(path.join(out,'bundle-metafile.json'),JSON.stringify(compiled.metafile,null,2));
 if(buildOnly){report.status='built-only';report.validation='esbuild bundle syntax/import resolution only; no TypeScript semantic or browser acceptance';}else{
 server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);if(name.includes('\\')||name.split('/').includes('..'))throw Error('Unsafe request');
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Frozen terrain fog comparison</title><link rel="icon" href="data:,"><style>html,body{margin:0;background:#312f28}canvas{display:block}</style><canvas></canvas><script type="module" src="/main.js"></script>');return}
  const file=name==='/main.js'?path.join(temp,'main.js'):/^\/art\/terrain\/[a-z0-9_]+\.png$/.test(name)?path.join(product,name.slice(1)):undefined;if(!file)throw Error('Not found');
  const bytes=await readFile(file);report.served[name]={sha256:sha(bytes),bytes:bytes.length};res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'image/png');res.end(bytes);
 }catch(error){res.statusCode=404;res.end(String(error))}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{headless,channel:'chromium'}:{headless});report.browserVersion=browser.version();
 page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
 page.on('pageerror',error=>report.errors.push(String(error.stack??error)));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({url:response.url(),status:response.status()})});page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),failure:request.failure()}));
 if(engine==='chromium'){const session=await browser.newBrowserCDPSession();report.gpu=(await session.send('SystemInfo.getInfo')).gpu}
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');report.precision=await page.evaluate(()=>window.fogPolishQA.precision());
 for(const raised of [false,true]){
  const value=await page.evaluate(raised=>window.fogPolishQA.compareCourse(raised),raised);report.geometry.push(value);await page.screenshot({path:path.join(out,`${raised?'raised':'flat'}-unknown.png`)});
  assert(value.geometryEqual&&value.picking.every(Boolean),'Geometry, bounds, indices or public picker changed');assert(value.hidden&&value.restored,'Hidden fragment did not retain/reset fog');
  assert(value.cases.some(row=>row.interiorClear),'Missing visible interior probe');for(const row of value.cases){assert.equal(row.lighter,0,JSON.stringify({raised,...row}));assert.equal(row.unknownLost,0,'Opaque baseline pixel became translucent');assert.equal(row.clearNonzero,0,'All-visible geometry gained fog');if(row.interiorClear)assert(row.interiorClear.passed,'Visible interior patch gained fog');if(row.mode==='clear')assert(row.allFogHidden);if(['unknown','missing'].includes(row.mode))assert(row.baselineOpaque>1000,'Opaque probe lacked interior coverage')}
 }
 // Separate visual check: do not compare macro-induced luminance with fog alpha.
 report.macro=[];for(const kind of ['baseline','candidate']){report.macro.push(await page.evaluate(kind=>window.fogPolishQA.macro(kind),kind));await page.screenshot({path:path.join(out,`macro-${kind}.png`)})}
 // Two independent resident scopes; sequential scenes cap memory. Timings are
 // shared-host diagnostics, not a pass/fail threshold or full-frame benchmark.
 for(const extent of ['retained36','minimumZoom'])for(const kind of ['baseline','candidate']){
  const value=await page.evaluate(({kind,extent})=>window.fogPolishQA.cpu(kind,extent),{kind,extent});report.cpu.push(value);assert(value.hiddenFragments>0);assert(value.chunks===(extent==='retained36'?36:196));
 }
 report.disposal=await page.evaluate(()=>window.fogPolishQA.dispose());assert.equal(report.disposal.canvases,0);assert(report.disposal.disposals.every(d=>d.allMeshesDestroyed&&d.allOwnedTexturesDestroyed));report.status='passed';
 }
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}
finally{
 if(page&&report.status!=='passed')report.failureCleanup=await page.evaluate(()=>window.fogPolishQA?.dispose()).catch(error=>({error:String(error)}));
 try{await browser?.close()}catch(error){report.errors.push(String(error))}if(server?.listening)await new Promise(resolve=>server.close(resolve));if(temp)await rm(temp,{recursive:true,force:true});
 if(report.errors.length||report.httpErrors.length||report.requestFailures.length){report.status='failed';process.exitCode=1}
 const lockBytesAfter=await readFile(path.join(input,'lock.json'));report.inputsUnchanged=sha(lockBytesAfter)===report.inputLockSHA256;for(const [name,hash] of Object.entries(expectedInputs))if(sha(await readFile(path.join(input,name)))!==hash)report.inputsUnchanged=false;
 if(!report.inputsUnchanged){report.status='failed';process.exitCode=1}report.finished=new Date().toISOString();await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(report.status,out,report.failure??'');
}
