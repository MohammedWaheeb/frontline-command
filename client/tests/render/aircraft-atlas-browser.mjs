import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';

const root=fileURLToPath(new URL('../../../',import.meta.url)),argv=process.argv.slice(2),args={};
assert.equal(argv.length%2,0,'Use paired --product, --out, optional --engine and --build-only true arguments.');
for(let i=0;i<argv.length;i+=2){assert(['--product','--out','--engine','--build-only'].includes(argv[i]));assert(!Object.hasOwn(args,argv[i]));args[argv[i]]=argv[i+1]}
assert(args['--product']&&args['--out']);const engine=args['--engine']??'chromium';assert(['chromium','firefox','webkit'].includes(engine));
const product=await realpath(path.resolve(args['--product'])),overlay=path.dirname(product),out=path.resolve(args['--out']);await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,null,2),ids=['unit.US.fighter','unit.US.airlift'];
const expected=new Map(),served={},requests=[],report={started:new Date().toISOString(),product,engine,status:'preflight',scope:'Real full aircraft PNG/JSON loader residency and phases, bounded page walk, two captured authorized Go fighter consumers. No running simulation, live aircraft lifecycle, total GPU/heap, performance or final visual acceptance.',errors:[],warnings:[],httpErrors:[],requestFailures:[],expectedFaults:[],qualities:[],served,requests};
let temp,server,browser,page,phase='preflight',faultURL='',gateURL='',gateResolve,held,gateReached;
try{
 const overlayBytes=await readFile(path.join(overlay,'build.json')),buildReceipt=JSON.parse(overlayBytes),base=path.resolve(root,buildReceipt.base),baseBytes=await readFile(path.join(overlay,'base-build.json')),baseReceipt=JSON.parse(baseBytes);
 assert.equal(sha(baseBytes),buildReceipt.base_build_sha256);assert.equal(sha(await readFile(path.join(base,'build.json'))),buildReceipt.base_build_sha256);
 assert.equal(baseReceipt.sourceDigest,'38b29b7f2664424d0a92830a325eb1afdc81b4ee025c7ba3b59f4d4c0e1ec549');
 const lockPath=path.join(root,'work/art/aircraft-runtime-overlay-v1/base-locks',buildReceipt.selected_base_lock);assert.equal(sha(await readFile(lockPath)),buildReceipt.selected_base_lock_sha256);
 const source=path.join(base,'source/client');for(const [file,digest]of Object.entries(baseReceipt.sourceFiles))assert.equal(sha(await readFile(path.join(source,file))),digest,'Frozen source changed '+file);
 assert.equal(buildReceipt.base_unchanged,true);assert.equal(buildReceipt.unrelated_base_pack_files_exact,true);assert.deepEqual(buildReceipt.assets.map(a=>a.id).sort(),[...ids].sort());
 assert.equal(sha(await readFile(path.join(product,'assets/packs/base.json'))),buildReceipt.pack_sha256);
 for(const asset of buildReceipt.assets)for(const file of asset.files){const bytes=await readFile(path.join(product,file.path.slice(1)));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256,file.path);expected.set(file.path,{bytes:file.bytes,sha256:file.sha256})}
 const indexBytes=await readFile(path.join(product,'art/index.json')),index=JSON.parse(indexBytes);expected.set('/art/index.json',{bytes:indexBytes.length,sha256:sha(indexBytes)});
 const plan={ids,qualities:{standard:{pages:[],states:[]},high:{pages:[],states:[]}}};
 for(const id of ids){
  const metaURL='/art/'+index.sprites[id];assert(expected.has(metaURL));const meta=JSON.parse(await readFile(path.join(product,metaURL.slice(1))));assert.equal(meta.id,id);
  const poses=meta.states.reduce((sum,s)=>sum+s.frames*s.directions,0);assert.equal(poses,id==='unit.US.fighter'?896:656);
  for(const [quality,scale]of [['standard','1x'],['high','2x']]){
   const target=plan.qualities[quality],keys=new Set();
   for(const state of meta.states)target.states.push({id,name:state.name,source:state.name,directions:state.directions,frames:state.frames,layers:state.layers??meta.layers});
   for(const alias of meta.aliases??[]){const s=meta.states.find(s=>s.name===alias.source);assert(s,'Unknown published alias');target.states.push({id,name:alias.name,source:alias.source,directions:s.directions,frames:s.frames,layers:s.layers??meta.layers})}
   for(const [layer,files]of Object.entries(meta.atlases[scale]))for(const name of files){
    assert(/^[A-Za-z0-9_@.-]+\.json$/.test(name)&&!name.includes('..'));const atlasURL=metaURL.replace(/[^/]+$/,name);assert(expected.has(atlasURL));const atlas=JSON.parse(await readFile(path.join(product,atlasURL.slice(1))));
    assert(/^[A-Za-z0-9_@.-]+\.png$/.test(atlas.meta.image)&&!atlas.meta.image.includes('..'));const url=metaURL.replace(/[^/]+$/,atlas.meta.image);assert(expected.has(url));const png=await readFile(path.join(product,url.slice(1))),width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert.equal(width,atlas.meta.size.w);assert.equal(height,atlas.meta.size.h);
    const refs=Object.entries(atlas.frames).map(([key,entry])=>{const m=/^(.+)\/d(\d+)_f(\d+)$/.exec(key);assert(m);const unique=layer+'|'+key;assert(!keys.has(unique),'Duplicate lookup');keys.add(unique);const r=entry.frame;assert([r.x,r.y,r.w,r.h].every(Number.isInteger)&&r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=width&&r.y+r.h<=height);return {key,state:m[1],direction:Number(m[2]),index:Number(m[3]),rect:r,anchor:entry.anchor}});
    target.pages.push({id,layer,url,width,height,bytes:width*height*4,refs});
   }
  }
 }
 for(const quality of ['standard','high'])assert.equal(plan.qualities[quality].pages.length,80);
 const native=path.join(root,'work/evidence/aircraft-service-status/native-2026-09-29T00-00-52.299Z'),inventory=JSON.parse(await readFile(path.join(root,'work/evidence/aircraft-service-status/native-inventory.json'))),viewName='a-paid-fighter-ready.view.json',view=await readFile(path.join(native,viewName));assert.equal(sha(view),inventory.files[viewName].sha256);assert.equal(inventory.sourceLockSHA256,baseReceipt.runtime.source_lock_sha256);
 const sourceLock=JSON.parse(await readFile(path.join(root,'work/navigation-lookup-candidate/source-lock.json'))),catalog=await readFile(path.join(root,'work/navigation-lookup-candidate/source/pkg/content/rules.json'));assert.equal(sha(catalog),sourceLock.files['pkg/content/rules.json']);
 report.identity={overlayReceiptSHA256:sha(overlayBytes),baseReceiptSHA256:sha(baseBytes),sourceDigest:baseReceipt.sourceDigest,selectedBaseLockSHA256:buildReceipt.selected_base_lock_sha256,packSHA256:buildReceipt.pack_sha256,actorView:{source:path.relative(root,path.join(native,viewName)),sha256:sha(view),tick:996},catalogSHA256:sha(catalog),assets:buildReceipt.assets.map(a=>({id:a.id,files:a.files}))};
 const fixture=path.join(root,'client/tests/render/aircraft-atlas-fixture.ts'),fixtureBytes=await readFile(fixture),driverBytes=await readFile(fileURLToPath(import.meta.url));await writeFile(path.join(out,'fixture.ts'),fixtureBytes);await writeFile(path.join(out,'driver.mjs'),driverBytes);await writeFile(path.join(out,'plan.json'),json(plan));
 report.identity.fixtureSHA256=sha(fixtureBytes);report.identity.driverSHA256=sha(driverBytes);report.identity.planSHA256=sha(Buffer.from(json(plan)));
 temp=await mkdtemp(path.join(tmpdir(),'frontline-aircraft-atlas-'));
 await build({entryPoints:[fixture],outfile:path.join(temp,'fixture.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'immutable-v19',setup(b){b.onResolve({filter:/^\.\.\/\.\.\/src\//},a=>{if(a.importer!==fixture)return;const rel=a.path.slice('../../src/'.length);return {path:path.join(source,'src',rel+(path.extname(rel)?'':'.ts'))}})}}]});
 const bundle=await readFile(path.join(temp,'fixture.js'));report.identity.bundleSHA256=sha(bundle);await writeFile(path.join(out,'fixture.js'),bundle);
 report.inventory=Object.fromEntries(Object.entries(plan.qualities).map(([q,v])=>[q,{pages:v.pages.length,states:v.states.length,physicalFrames:v.pages.reduce((n,p)=>n+p.refs.length,0),allPagesRGBABytes:v.pages.reduce((n,p)=>n+p.bytes,0),largestPageRGBABytes:Math.max(...v.pages.map(p=>p.bytes))}]));
 if(args['--build-only']==='true'){report.status='compiled-only';report.noBrowserOrServer=true}else{
  server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local').pathname;requests.push({phase,url});
   if(url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Full aircraft atlas residency</title><link rel="icon" href="data:,"><style>body{margin:0;background:#191b14}</style><script type="module" src="/fixture.js"></script>');return}
   let bytes,type='application/json';
   if(url==='/fixture.js'){bytes=bundle;type='text/javascript'}else if(url==='/plan.json')bytes=Buffer.from(json(plan));else if(url==='/catalog.json')bytes=catalog;else if(url==='/fighters.view.json')bytes=view;
   else{assert(expected.has(url),'Unexpected asset request');bytes=await readFile(path.join(product,url.slice(1)));const actual={bytes:bytes.length,sha256:sha(bytes)};assert.deepEqual(actual,expected.get(url),'Frozen asset changed');served[url]=actual;if(url.endsWith('.png'))type='image/png';
    if(url===faultURL){res.statusCode=503;res.end('Controlled real-atlas request failure');return}
    if(url===gateURL){held=()=>{if(!res.destroyed){res.setHeader('Content-Type',type);res.end(bytes)}};gateResolve?.();return}
   }res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.end(bytes);
  }catch(error){res.statusCode=404;res.end(String(error))}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await({chromium,firefox,webkit})[engine].launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>report.errors.push({phase,kind:'page',message:e.stack??e.message}));page.on('console',m=>{const row={phase,kind:'console',type:m.type(),message:m.text(),url:m.location().url};if(m.type()==='warning'){report.warnings.push(row);if(m.text().includes('Sprite page failed to load')&&!(faultURL&&m.text().includes(faultURL)))report.errors.push(row)}if(m.type()==='error'){if(faultURL&&new URL(row.url||'http://local').pathname===faultURL&&m.text().includes('503'))report.expectedFaults.push(row);else report.errors.push(row)}});
  page.on('response',r=>{if(r.status()>=400){const row={phase,url:r.url(),status:r.status()};if(faultURL&&new URL(r.url()).pathname===faultURL&&r.status()===503)report.expectedFaults.push(row);else report.httpErrors.push(row)}});page.on('requestfailed',r=>report.requestFailures.push({phase,url:r.url(),message:r.failure()?.errorText}));
  phase='boot';await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');report.browserVersion=browser.version();
  for(const quality of ['standard','high']){
   const row={quality,pages:[],contacts:[]};report.qualities.push(row);phase=quality+'-metadata';const pngBefore=requests.filter(r=>r.url.endsWith('.png')).length;row.begin=await page.evaluate(q=>window.aircraftAtlasQA.begin(q),quality);assert.equal(requests.filter(r=>r.url.endsWith('.png')).length,pngBefore,'Metadata caused PNG fetch');
   phase=quality+'-page-walk';for(let i=0;i<plan.qualities[quality].pages.length;i++)row.pages.push(await page.evaluate(i=>window.aircraftAtlasQA.page(i),i));
   phase=quality+'-contacts';for(let i=0;i<plan.qualities[quality].states.length;i++){const contact=await page.evaluate(i=>window.aircraftAtlasQA.contact(i),i);row.contacts.push(contact);await page.screenshot({path:path.join(out,`${quality}-${contact.state.id}-${contact.state.name}.png`)})}
   phase=quality+'-sharing';row.sharing=await page.evaluate(()=>window.aircraftAtlasQA.sharedActors());await page.screenshot({path:path.join(out,quality+'-actual-fighter-sharing.png')});row.retireOne=await page.evaluate(()=>window.aircraftAtlasQA.retireOne());
   phase=quality+'-pressure';row.pressure=await page.evaluate(()=>window.aircraftAtlasQA.pressure());assert(row.pressure.idleMilliseconds>=10000);
   phase=quality+'-invalid';const beforeInvalid=requests.filter(r=>r.url.endsWith('.png')).length;row.invalid=await page.evaluate(()=>window.aircraftAtlasQA.invalid());assert.equal(requests.filter(r=>r.url.endsWith('.png')).length,beforeInvalid);
   phase=quality+'-controlled-error';faultURL=plan.qualities[quality].pages[0].url;row.failedLoad=await page.evaluate(()=>window.aircraftAtlasQA.failedLoad());faultURL='';await page.evaluate(q=>window.aircraftAtlasQA.begin(q),quality);row.recovery=await page.evaluate(()=>window.aircraftAtlasQA.page(0));
   phase=quality+'-pending-release';gateURL=plan.qualities[quality].pages[0].url;gateReached=new Promise(resolve=>gateResolve=resolve);row.pending=await page.evaluate(()=>window.aircraftAtlasQA.pendingStart());let gateTimeout;try{await Promise.race([gateReached,new Promise((_,reject)=>{gateTimeout=setTimeout(()=>reject(Error('No real pending PNG request')),30000)})])}finally{clearTimeout(gateTimeout)}await page.evaluate(()=>window.aircraftAtlasQA.beginRelease());gateURL='';held();held=undefined;row.pendingRelease=await page.evaluate(()=>window.aircraftAtlasQA.finishRelease());
  }
  phase='dispose';report.disposal=await page.evaluate(()=>window.aircraftAtlasQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.statistics.residentPages,0);assert.equal(report.disposal.statistics.pickingBytes,0);report.status='passed';
 }
}catch(error){report.status='failed';report.failure=String(error.stack??error);report.failedPhase=phase;process.exitCode=1;if(page){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});report.failureState=await page.evaluate(()=>window.aircraftAtlasQA?.stats()).catch(()=>undefined)}}
finally{
 if(held)held();if(page)report.cleanup=await page.evaluate(()=>window.aircraftAtlasQA?.dispose()).catch(e=>({failure:String(e)}));
 try{await browser?.close()}catch(e){report.errors.push({phase:'close',message:String(e)})}if(server?.listening)await new Promise(resolve=>server.close(resolve));
 try{assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.requestFailures,[]);assert(!report.cleanup?.failure)}catch(error){report.finalDiagnosticFailure=String(error.stack??error);if(report.status==='passed')report.failure=report.finalDiagnosticFailure;report.status='failed';process.exitCode=1}
 if(temp)await rm(temp,{recursive:true,force:true});report.closedAt=new Date().toISOString();await writeFile(path.join(out,'browser.json'),json(report));console.log(json({out,status:report.status,failure:report.failure,inventory:report.inventory}));
}
