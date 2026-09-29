import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {build} from '../../../client/node_modules/esbuild/lib/main.js';
import {chromium} from '../../../client/node_modules/playwright-core/index.mjs';
const root=process.cwd(),out=path.resolve(process.argv[2]),buildOnly=process.argv.includes('--build-only');assert(process.argv[2]);await mkdir(out);
const base=path.resolve('work/evidence/presentation-privacy-review'),fixture=path.join(base,'fog-three-source-fixture.ts'),sha=b=>createHash('sha256').update(b).digest('hex');
const pins={
 'work/terrain-polish-review/inputs-v4/baseline-terrain.ts':'52d20cd00f5f3fbfc0f922661e929dbfb17f434463703914e60c213e0bdead69',
 'work/claude/presentation-polish-v1/fog-inputs/baseline-terrain.ts':'65421e5ee2ab54339a0f804c5936df01c8521105018c58a4105f21234818c656',
 'work/claude/presentation-polish-v1/fog-inputs/candidate-terrain.ts':'6820e55a251ea711e3121033c0f5264ad46c3cb1832a2064a4c511d27d3c3788',
};
for(const folder of ['work/terrain-polish-review/inputs-v4','work/claude/presentation-polish-v1/fog-inputs'])for(const [name,hash]of Object.entries({'terrain-surface.ts':'7d498da7b940e4741ed8e74b7996d2d7a420e310066dba28a7ed6b328437ef2e','terrain-materials.ts':'c1c466f0ffddcd77e62a7272b0d0963f81393714feb0177aaedeb0d3f41d8588','iso.ts':'98654186dbd723fdefdb70ff9bcdc26b6f74b7a5d4d0579c3d6e4244ef9aebdf'}))pins[`${folder}/${name}`]=hash;
const report={status:'running',started:new Date().toISOString(),scope:'Three immutable terrain fog sources; public synthetic geometry; real WebGL alpha. No game, actor, material-art, performance or overall presentation acceptance.',pins,buildOnly,errors:[],consoleErrors:[],httpErrors:[],requestFailures:[],courses:[]};
let browser,page,server,temp;
try{
 for(const [file,digest]of Object.entries(pins))assert.equal(sha(await readFile(file)),digest,file);
 for(const file of [fixture,new URL(import.meta.url)]){const bytes=await readFile(file);const name=path.basename(String(file));await writeFile(path.join(out,name),bytes);report[name+'SHA256']=sha(bytes)}
 temp=await mkdtemp(path.join(tmpdir(),'fog-three-'));const bundle=await build({entryPoints:[fixture],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,nodePaths:[path.resolve('client/node_modules')]});const js=await readFile(path.join(temp,'main.js'));report.bundleSHA256=sha(js);await writeFile(path.join(out,'bundle-metafile.json'),JSON.stringify(bundle.metafile,null,2));
 if(buildOnly){report.status='build-only'}else{
  server=createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;background:#fff}canvas{display:block}</style><canvas></canvas><script type="module" src="/main.js"></script>')}else if(req.url==='/main.js'){res.setHeader('Content-Type','text/javascript');res.end(js)}else{res.statusCode=404;res.end('Not found')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:false,channel:'chromium'});report.browserVersion=browser.version();const cdp=await browser.newBrowserCDPSession();report.gpu=(await cdp.send('SystemInfo.getInfo')).gpu;
  page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(String(e.stack??e)));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});page.on('requestfailed',r=>report.requestFailures.push({url:r.url(),failure:r.failure()}));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
  for(const raised of [false,true]){report.courses.push(await page.evaluate(raised=>window.fogThreeQA.course(raised),raised));await writeFile(path.join(out,`course-${raised?'raised':'flat'}.json`),JSON.stringify(report.courses.at(-1),null,2));}
  report.disposal=await page.evaluate(()=>window.fogThreeQA.dispose());assert.equal(report.disposal.canvases,0);assert(report.disposal.allClassDisposals);assert(report.disposal.disposals.every(d=>d.meshes&&d.geometry&&d.textures));
  // Distinct gates: do not turn a current-baseline pixel regression into PASS.
  report.floorPrivacy='passed';report.protectedTriangleEquality='passed';report.currentBaselineMonotonicity='passed';
  for(const course of report.courses){assert(course.geometryEqual&&course.hidden&&course.restored);for(const row of course.cases){assert.equal(row.clearNonzero,0);if(row.floorCandidate.lower||row.floorCandidate.opaqueLost||row.floorCurrent.lower||row.floorCurrent.opaqueLost)report.floorPrivacy='failed';if(row.currentCandidate.lower)report.currentBaselineMonotonicity='failed';for(const category of Object.values(row.isolated))if(category.floorCurrent.different||category.floorCandidate.different||category.currentCandidate.different)report.protectedTriangleEquality='failed'}}
  report.status=report.floorPrivacy==='passed'&&report.protectedTriangleEquality==='passed'?'diagnostic-complete':'failed';
 }
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1}
finally{
 if(page&&!report.disposal)report.failureCleanup=await page.evaluate(()=>window.fogThreeQA?.dispose()).catch(e=>({error:String(e)}));try{await browser?.close()}catch(e){report.errors.push(String(e))}if(server?.listening)await new Promise(r=>server.close(r));if(temp)await rm(temp,{recursive:true,force:true});
 report.inputsUnchanged=true;for(const [file,digest]of Object.entries(pins))if(sha(await readFile(file))!==digest)report.inputsUnchanged=false;
 if(!report.inputsUnchanged||report.errors.length||report.consoleErrors.length||report.httpErrors.length||report.requestFailures.length){report.status='failed';process.exitCode=1}
 if(report.currentBaselineMonotonicity==='failed')process.exitCode=1;
 report.finished=new Date().toISOString();await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,floorPrivacy:report.floorPrivacy,protectedTriangleEquality:report.protectedTriangleEquality,currentBaselineMonotonicity:report.currentBaselineMonotonicity,out,failure:report.failure}));
}
