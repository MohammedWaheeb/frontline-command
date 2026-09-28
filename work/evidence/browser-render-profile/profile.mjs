// Isolated diagnostic helper. Does not edit production or root load harness.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const out=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(out,'../../..'),client=path.join(root,'client');
const require=createRequire(path.join(client,'package.json')),{build}=require('esbuild'),{chromium}=require('playwright-core');
const frozen=path.join(root,'work/evidence/rendered-multiplayer/build-terminal/product'),baseline=path.join(root,'work/evidence/browser-load');
const digest=b=>createHash('sha256').update(b).digest('hex');
const mode=process.argv[2]??'normal',channel=process.env.FRONTLINE_PROFILE_CHANNEL;
const dir=path.join(out,mode);await mkdir(dir,{recursive:true});
const snapshot=path.join(out,'snapshot');
if(mode==='normal'){
 await mkdir(snapshot,{recursive:true});await cp(path.join(frozen,'runtime'),path.join(snapshot,'runtime'),{recursive:true});
 for(const file of ['opening.json','native.json','browser.json'])await cp(path.join(baseline,file),path.join(snapshot,file));
 await cp(path.join(root,'client/tests/render/load-fixture.ts'),path.join(snapshot,'original-fixture.ts'));
 await cp(path.join(root,'client/tests/render/load-browser.mjs'),path.join(snapshot,'original-browser.mjs'));
 // Same uninstrumented entry/settings as root; record whether current source
 // still reproduces its baseline bundle before adding diagnostic callbacks.
 await build({absWorkingDir:root,entryPoints:[path.join(client,'tests/render/load-fixture.ts')],outfile:path.join(snapshot,'baseline-bundle.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
 let source=await readFile(path.join(snapshot,'original-fixture.ts'),'utf8');
 source=source.replaceAll("'../../src/",`'${client}/src/`);
 source=source.replace('const begin=performance.now();','await (window as any).profileBegin(renderer);\n const begin=performance.now();');
 source=source.replace('const elapsed=performance.now()-begin;measuring=false;cancelAnimationFrame(frameID);','const elapsed=performance.now()-begin;measuring=false;cancelAnimationFrame(frameID);\n await (window as any).profileEnd();');
 source+=`\nObject.assign(window,{profileBegin:async(renderer:any)=>{const gl=renderer.app.renderer.gl;const ext=gl.getExtension('WEBGL_debug_renderer_info');(window as any).profileGL={vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedVendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,attributes:gl.getContextAttributes(),version:gl.getParameter(gl.VERSION),dpr:devicePixelRatio,canvas:{width:renderer.app.canvas.width,height:renderer.app.canvas.height}};if((window as any).profileMode==='no-draw')renderer.app.renderer.render=()=>{};await (window as any).hostProfileBegin()},profileEnd:async()=>{await (window as any).hostProfileEnd()}});\n`;
 await writeFile(path.join(snapshot,'instrumented-fixture.ts'),source);
 const result=await build({absWorkingDir:root,entryPoints:[path.join(snapshot,'instrumented-fixture.ts')],outfile:path.join(snapshot,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',sourcemap:'external',metafile:true});
 const hashes={};for(const file of Object.keys(result.metafile.inputs))hashes[file]=digest(await readFile(path.resolve(root,file)));
 await writeFile(path.join(snapshot,'source-hashes.json'),JSON.stringify(hashes,null,2));
}
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.map':'application/json'};
const serverFailures=[];
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('bad path');if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Maximum Go renderer profile</title><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="field"></div><script type="module" src="/main.js"></script>');return}
 const file=p==='/main.js'||p==='/main.js.map'?path.join(snapshot,p.slice(1)):p.startsWith('/runtime/')?path.join(snapshot,p.slice(1)):p.startsWith('/fixture/')?path.join(snapshot,p.slice(9)):path.join(frozen,p);
 res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch(e){serverFailures.push({url:req.url,error:String(e)});res.statusCode=404;res.end(String(e))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:!mode.startsWith('hardware'),...channel?{channel}:{} }),page=await browser.newPage({viewport:{width:1600,height:900}}),cdp=await page.context().newCDPSession(page),browserCDP=await browser.newBrowserCDPSession();
await cdp.send('Performance.enable');await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
const report={serverFailures,time:new Date().toISOString(),mode,channel:channel??'default headless shell',url:`http://127.0.0.1:${server.address().port}`,browser:browser.version(),errors:[],warnings:[],baseline:JSON.parse(await readFile(path.join(snapshot,'browser.json'),'utf8')),hashes:{baselineBundle:digest(await readFile(path.join(snapshot,'baseline-bundle.js'))),instrumentedBundle:digest(await readFile(path.join(snapshot,'main.js'))),wasm:digest(await readFile(path.join(snapshot,'runtime/frontline.wasm'))),opening:digest(await readFile(path.join(snapshot,'opening.json')))}};
report.failedResponses=[];page.on('response',response=>{if(response.status()>=400)report.failedResponses.push({url:response.url(),status:response.status()})});
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text())});
let before;
await page.exposeBinding('hostProfileBegin',async()=>{report.gpu=await browserCDP.send('SystemInfo.getInfo');report.webgl=await page.evaluate(()=>window.profileGL);before=await cdp.send('Performance.getMetrics');await cdp.send('Profiler.start');report.profileStarted=new Date().toISOString();});
await page.exposeBinding('hostProfileEnd',async()=>{const result=await cdp.send('Profiler.stop');await writeFile(path.join(dir,'main-thread.cpuprofile'),JSON.stringify(result.profile));report.profileEnded=new Date().toISOString();const after=await cdp.send('Performance.getMetrics');report.mainThreadMetrics={};for(const m of after.metrics){const prior=before.metrics.find(p=>p.name===m.name)?.value??0;report.mainThreadMetrics[m.name]={end:m.value,delta:m.value-prior}}});
try{await page.goto(report.url);await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.evaluate(mode=>{window.profileMode=mode.endsWith('no-draw')?'no-draw':mode},mode);if(mode.endsWith('probe'))await page.waitForTimeout(1500);else report.segment=await page.evaluate(()=>window.qa.run(0));report.identity={title:await page.title(),canvases:await page.locator('canvas').count(),frameworkOverlay:await page.locator('vite-error-overlay').count()};await page.screenshot({path:path.join(dir,'segment.png')});report.disposal=await page.evaluate(()=>window.qa.dispose());report.status=report.errors.length?'errors':'passed';}
catch(e){report.status='failed';report.error=String(e.stack??e);process.exitCode=1;}finally{await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({mode,status:report.status,renderer:report.webgl?.unmaskedRenderer,frame:report.segment?.frameMs,roundtrip:report.segment?.roundtripMs,elapsed:report.segment?.elapsedMs,error:report.error}));}
