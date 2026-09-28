import {chromium} from 'playwright-core';
import {createServer} from 'vite';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url)),client=path.join(root,'client'),base=path.join(root,'work/art/go-parking-browser-overlay');
const out=path.join(root,process.env.FRONTLINE_PARKING_EVIDENCE??'work/art/go-parking-browser-overlay/browser-v1'),runtime=path.join(root,'work/owner-ranges-candidate/runtime'),binding=path.join(runtime,'frontline_pb.ts');await mkdir(out,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex'),served={};
const types={'.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.js':'text/javascript','.wasm':'application/wasm','.woff2':'font/woff2','.ttf':'font/ttf'};
async function exists(file){try{return(await stat(file)).isFile()}catch{return false}}
const server=await createServer({configFile:false,root:client,publicDir:false,server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}},plugins:[{name:'frozen-parking-diagnostic',enforce:'pre',async resolveId(source,importer,options){if(/protocol\/frontline_pb(?:\.ts|\.js)?$/.test(source))return binding;if(importer===binding&&source.startsWith('@bufbuild/'))return this.resolve(source,path.join(client,'src/protocol/frontline_pb.ts'),options)},configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const p=new URL(req.url,'http://local').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Frontline Command · exact Go parking scenes</title><link rel="icon" href="data:,"><style>body{margin:0;background:#17150f;color:#e8ddbf;font:13px monospace}#label{height:40px;padding:10px 16px;box-sizing:border-box}#field{height:calc(100vh - 40px)}</style><div id="label">ACTUAL GO PARKING SNAPSHOT · DIAGNOSTIC ART OVERLAY</div><div id="field"></div><script type="module" src="/tests/render/parking-scene-entry.ts"></script>');return}
 if(p.includes('..')||p.includes('\\')){res.statusCode=400;res.end();return}
 let file;
 if(p.startsWith('/runtime/'))file=path.join(runtime,p.slice('/runtime/'.length));
 else if(p.startsWith('/parking-fixtures/'))file=path.join(base,'overlay-v1/fixtures',p.slice('/parking-fixtures/'.length));
 else if(p.startsWith('/art/')){const rel=p.slice('/art/'.length),overlay=path.join(base,process.env.FRONTLINE_PARKING_INK==='1'?'browser-product-ink/art':'browser-product/art',rel);file=await exists(overlay)?overlay:path.join(root,'work/multiplayer-combat/build/product/art',rel)}
 else if(p.startsWith('/assets/fonts/'))file=path.join(root,'work/multiplayer-combat/build/product',p);
 else return next();
 try{const data=await readFile(file);served[p]={sha256:sha(data),bytes:data.length};res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.end(data)}catch(error){res.statusCode=404;res.end(String(error))}
 })}}]});
await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`,browser=await chromium.launch({headless:false,channel:'chromium'}),page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(90000);
const report={time:new Date().toISOString(),scope:'Exact Go0.3.4 native scene saves loaded by actual WASM; current product BattlefieldRenderer/ActorVisual. Sparse snapshot-only sprite overlay, IR strike uses labelled legacy fly-frame shape reference. No animation, full-roster or performance claim.',browser:browser.version(),wasmSHA256:sha(await readFile(path.join(runtime,'frontline.wasm'))),errors:[],resources:[],scenes:[],served};
page.on('pageerror',error=>report.errors.push(error.stack??error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});page.on('response',response=>{if(response.status()>=400)report.resources.push({url:response.url(),status:response.status()})});
try{
 await page.goto(origin);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 for(const quality of ['standard','high'])for(const name of ['US-six','IR-six','SA-four','SY-two','SY-retained-US-six','IR-retained-US-six']){
  if(quality==='high'&&!['US-six','IR-six','IR-retained-US-six'].includes(name))continue;
  const result=await page.evaluate(({name,quality})=>window.parkingQA.scene(name,quality),{name,quality});assert.equal(result.hash,result.afterHash);assert.deepEqual(result.errors,[]);
  await page.locator('#label').evaluate((node,{name,quality,legacy})=>{node.textContent=`${name} · exact Go positions · ${quality==='high'?'2× atlas at native world scale':'1× atlas at native world scale'}${legacy?' · IR STRIKE: LEGACY FLY-FRAME SHAPE REFERENCE':''}`},{name,quality,legacy:result.legacyStrikeReference});
  await page.screenshot({path:path.join(out,`${name}@${quality==='high'?'2x':'1x'}.png`)});report.scenes.push(result);
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.resources,[]);report.disposal=await page.evaluate(()=>window.parkingQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.statistics.residentPages,0);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1}
finally{await writeFile(path.join(out,'browser.json'),JSON.stringify(report,(_key,item)=>typeof item==='bigint'?item.toString():item,2));await browser.close();await server.close();console.log(report.status,report.error??'')}
