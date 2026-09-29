import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from '../../client/node_modules/esbuild/lib/main.js';
import {chromium} from '../../client/node_modules/playwright-core/index.mjs';

const root=process.cwd(),here=path.dirname(fileURLToPath(import.meta.url));
const label=process.argv[2];assert(/^run-[0-9]+$/.test(label??''));const out=path.join(here,label);await mkdir(out);
const product=path.join(root,'work/presentation-fallback-v5/build-01/product');
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={status:'preparing',started:new Date().toISOString(),scope:'Synthetic simultaneous valid-cue mixer load with original clips/real decoder/current production graph and exact pre-destination PCM. No normal-battle frequency, subjective listening, final-art, reference-hardware or gameplay claim.',pins:{},cases:[],errors:[],consoleErrors:[],httpErrors:[],requestFailures:[]};
let browser,page,server,watchdog;const save=()=>writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
const pin=async(file,expected)=>{const bytes=await readFile(file),digest=sha(bytes);if(expected)assert.equal(digest,expected,file);report.pins[path.relative(root,file)]=digest;return bytes};
try{
 for(const name of ['run.mjs','fixture.ts','meter.js'])await writeFile(path.join(out,name),await pin(path.join(here,name)));
 const pack=JSON.parse(await pin(path.join(product,'assets/packs/base.json'),'87452a5fdc43fa61e0e9351a4f3d578cb0bb0c5f88f6ddbf59f62141592c9e00'));
 const descriptors=new Map(pack.files.map(file=>[file.path,file]));
 const body=async url=>{assert(url.startsWith('/art/audio/'));const descriptor=descriptors.get(url);assert(descriptor,'Unpinned audio request');const bytes=await pin(path.join(product,url),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);return bytes};
 const config={compilerOptions:{strict:true,noEmit:true,skipLibCheck:true,target:'ES2022',module:'ESNext',moduleResolution:'bundler',lib:['ES2022','DOM','DOM.Iterable'],types:[]},files:[path.join(here,'fixture.ts')]};await writeFile(path.join(out,'tsconfig.json'),JSON.stringify(config));
 const checked=spawnSync(process.execPath,[path.join(root,'client/node_modules/typescript/bin/tsc'),'-p',path.join(out,'tsconfig.json')],{encoding:'utf8',timeout:60000});await writeFile(path.join(out,'typecheck.log'),checked.stdout+checked.stderr);assert.equal(checked.status,0,'Fixture typecheck');
 const built=await build({entryPoints:[path.join(here,'fixture.ts')],outfile:path.join(out,'bundle.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,nodePaths:[path.join(root,'client/node_modules')]});for(const file of Object.keys(built.metafile.inputs))await pin(path.resolve(file));await pin(path.join(out,'bundle.js'));
 if(process.argv.includes('--prepare-only')){report.status='prepared-only';report.noBrowser=true}
 else{
  server=createServer(async(req,res)=>{const url=new URL(req.url,'http://fixture.invalid').pathname;try{let bytes,type;if(url==='/'){bytes=Buffer.from('<!doctype html><html><head><title>Frontline Command audio signal check</title></head><body><button id="gesture"></button><script type="module" src="/bundle.js"></script></body></html>');type='text/html'}else if(url==='/bundle.js'||url==='/meter.js'){bytes=await readFile(url==='/bundle.js'?path.join(out,'bundle.js'):path.join(here,'meter.js'));type='text/javascript'}else if(url==='/favicon.ico'){res.statusCode=204;return res.end()}else{bytes=await body(url);type=url.endsWith('.json')?'application/json':url.endsWith('.mp3')?'audio/mpeg':'audio/ogg'}res.writeHead(200,{'content-type':type,'content-length':bytes.length,'cache-control':'no-store'});res.end(bytes)}catch(error){report.errors.push({server:String(error)});res.statusCode=500;res.end('Fixture failure')} });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:false,channel:'chromium',args:['--mute-audio']});report.browser=browser.version();watchdog=setTimeout(()=>{report.errors.push({watchdog:'Two-minute deadline'});void browser?.close()},120000);
  page=await browser.newPage();page.on('pageerror',error=>report.errors.push({page:String(error)}));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text())});page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({url:response.url(),status:response.status()})});page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),failure:request.failure()}));
  await page.goto('http://127.0.0.1:'+server.address().port);assert.equal(await page.title(),'Frontline Command audio signal check');await page.waitForFunction(()=>window.audioMixQA);await page.evaluate(()=>window.audioMixQA.ready());await page.click('#gesture');await page.waitForFunction(()=>window.audioMixQA.state().statistics.context==='running');report.context=await page.evaluate(()=>window.audioMixQA.instrument());
  for(const [name,maximum,count] of [['default-six',false,6],['default-sixteen',false,16],['maximum-sixteen',true,16]]){
   const prepared=await page.evaluate(maximum=>window.audioMixQA.prepare(maximum),maximum);const started=await page.evaluate(count=>window.audioMixQA.start(count),count);assert.equal(started.statistics.sources,8+count);assert(started.state.captions.some(value=>value.priority===100));
   // Observe all samples for longer than every selected one-shot, not a polling peak estimate.
   await page.waitForTimeout(3500);const pcm=await page.evaluate(()=>window.audioMixQA.read());assert(pcm.samples>24000*3&&pcm.peak>0&&pcm.nonfinite===0,'Meter must observe real finite signal');const cleanup=await page.evaluate(()=>window.audioMixQA.clear());assert.equal(cleanup.statistics.sources,0);assert.equal(cleanup.statistics.buffers,0);report.cases.push({name,prepared,started,pcm,cleanup,headroom:pcm.peak<=1?'passed':'failed'});await save();
  }
  report.disposal=await page.evaluate(()=>window.audioMixQA.dispose());assert.equal(report.disposal.closedContext,'closed');assert.equal(report.disposal.statistics.sources,0);report.functional='passed';report.headroom=report.cases.every(value=>value.headroom==='passed')?'passed':'failed';report.status=report.headroom;
 }
}catch(error){report.status='failed';report.failure=String(error.stack??error);process.exitCode=1}
finally{
 clearTimeout(watchdog);if(page&&!report.disposal)report.failureCleanup=await page.evaluate(()=>window.audioMixQA?.dispose()).catch(error=>({error:String(error)}));await browser?.close();if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 report.inputsUnchanged=true;for(const[file,digest]of Object.entries(report.pins))if(sha(await readFile(path.join(root,file)))!==digest)report.inputsUnchanged=false;
 report.diagnostics=report.errors.length||report.consoleErrors.length||report.httpErrors.length||report.requestFailures.length?'failed':'passed';if(!report.inputsUnchanged||report.diagnostics==='failed'){report.status='failed';process.exitCode=1}if(report.status==='failed')process.exitCode=1;report.finished=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,functional:report.functional,headroom:report.headroom,cases:report.cases.map(value=>({name:value.name,peak:value.pcm.peak,aboveOne:value.pcm.aboveOne})),failure:report.failure,out}));
}
