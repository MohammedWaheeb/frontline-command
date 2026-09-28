// Explicit-path combined Go/WASM + current rendered-client course. No writes to
// production, no synthetic result injection and no hidden-state rendering.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir,cpus,totalmem,platform,release} from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const require=createRequire(path.join(root,'client/package.json'));
const {build}=require('esbuild'),{chromium}=require('playwright-core');
const args=Object.fromEntries(process.argv.slice(2).reduce((r,v,i,a)=>i%2?r:[...r,[v,a[i+1]]],[]));
for(const key of ['--product','--fixture','--source','--out'])assert(args[key],`Missing ${key}`);
const product=path.resolve(args['--product']),fixture=path.resolve(args['--fixture']),source=path.resolve(args['--source']),out=path.resolve(args['--out']);
await mkdir(out); // Refuse replacing any earlier evidence.
const temp=await mkdtemp(path.join(tmpdir(),'frontline-combined-'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipt=JSON.parse(await readFile(path.join(product,'../build.json'),'utf8'));
const runtime=JSON.parse(await readFile(path.join(root,'work/navigation-lookup-candidate/runtime-build-receipt.json'),'utf8'));
for(const name of ['frontline.wasm','worker.js','wasm_exec.js','version.json'])assert.equal(digest(await readFile(path.join(product,'runtime',name))),runtime.files[name].sha256,name);
await build({entryPoints:[path.join(here,'browser-fixture.ts')],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',plugins:[{
 name:'frozen-source',setup(b){
  b.onResolve({filter:/^@bufbuild\/protobuf(?:\/|$)/},args=>({path:require.resolve(args.path)}));
  b.onResolve({filter:/protocol\/frontline_pb(?:\.js)?$/},()=>({path:path.join(root,'work/navigation-lookup-candidate/runtime/frontline_pb.ts')}));
  b.onResolve({filter:/^\.\.\/\.\.\/client\/src\//},args=>({path:path.join(source,args.path.replace('../../client/','')+'.ts')}));
 }
}]});
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local'),p=decodeURIComponent(url.pathname);if(p.split('/').includes('..'))throw Error('bad path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Frontline combined Go load</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="field"></div><script type="module" src="/main.js"></script>');return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/fixture/')?path.join(fixture,p.slice(9)):path.join(product,p);
 res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(String(error))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:false,channel:'chromium'}),page=await browser.newPage({viewport:{width:1600,height:900}});
const report={time:new Date().toISOString(),scope:'Two 600-tick synthetic combined workload segments, same page, actual optimized Go/WASM and naturally permitted player-one view. Shared-host functional evidence with incomplete frozen art; not long matches, quiet performance, physical LAN or reference hardware certification.',
 browser:browser.version(),host:{os:platform(),release:release(),cpu:cpus()[0].model,logicalCPUs:cpus().length,memory:totalmem()},
 artBuild:receipt,hashes:{bundle:digest(await readFile(path.join(temp,'main.js'))),fixtureSource:digest(await readFile(path.join(here,'browser-fixture.ts'))),opening:digest(await readFile(path.join(fixture,'opening.json'))),native:digest(await readFile(path.join(fixture,'native.json')))},errors:[],warnings:[],httpErrors:[],segments:[]};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text())});
page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 assert.equal(await page.title(),'Frontline combined Go load');
 for(let i=0;i<2;i++){
  const value=await page.evaluate(i=>window.qa.run(i),i);report.segments.push(value);
  assert.deepEqual(value.errors,[]);assert(value.graphics.unmaskedRenderer&&!/SwiftShader|llvmpipe/i.test(value.graphics.unmaskedRenderer));
  await page.screenshot({path:path.join(out,`segment-${i+1}.png`)});
  value.disposal=await page.evaluate(()=>window.qa.dispose());assert.equal(value.disposal.canvases,0);assert.equal(value.disposal.art.residentPages,0);assert.equal(value.disposal.fx.allocatedBytes,0);
  console.log(`Segment ${i+1}: ${value.hash}; ${value.sent} batches; ${value.observations.length} owner frames; ${value.simulationRate.toFixed(3)} TPS diagnostic`);
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
}finally{
 await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(report.status,report.error??'');
}
