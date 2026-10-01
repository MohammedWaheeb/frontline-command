import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {artIndex} from '../../scripts/ui/art-plugin.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=path.join(root,'work/evidence/captured-art',new Date().toISOString().replaceAll(':','-')),temp=await mkdtemp(path.join(tmpdir(),'frontline-capture-art-'));await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'client/tests/render/captured-art-fixture.ts')],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const index=await artIndex(path.join(root,'assets')),mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Captured foundation acceptance</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden}</style><div id="field"></div><script type="module" src="/main.js"></script>');return}if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(index));return}const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/runtime/')?path.join(root,'client/public',p):p.startsWith('/art/')?path.join(root,'assets/build',p.slice(5)):undefined;if(!file)throw Error('Not found');res.setHeader('Content-Type',mime[path.extname(p)]??'application/octet-stream');res.end(await readFile(file))}catch(error){res.statusCode=404;res.end(String(error))}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:false,channel:'chromium'}),page=await browser.newPage({viewport:{width:1280,height:720}}),report={time:new Date().toISOString(),errors:[],wasmSHA256:createHash('sha256').update(await readFile(path.join(root,'client/public/runtime/frontline.wasm'))).digest('hex'),cases:[]};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
try{await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 for(const [type,converted,artID] of [['SY.workshop_air','US.airfield','building.SY.air_workshop'],['SY.safehouse','outpost','building.SY.safehouse'],['power','power','building.US.power']]){
  const opening=await page.evaluate(type=>window.qa.start(type),type),capture=await page.evaluate(()=>window.qa.capture()),c=capture.captured;
  assert.equal(c.owner,1);assert.equal(c.type,converted);assert.equal(c.footprintType,type);assert.deepEqual(c.footprint,opening.footprint);assert.equal(c.desiredArt,artID);assert.notEqual(c.artKey,opening.artKey);
  if(type==='power'){assert.equal(c.sheet,artID);assert.equal(c.missing,false)}else assert(c.requests.some(r=>r.type===type&&r.faction==='US'));
  await page.screenshot({path:path.join(out,type+'-captured.png')});const restore=await page.evaluate(()=>window.qa.restore());assert.equal(restore.hash,restore.restoredHash);assert.equal(restore.openingHash,restore.rewoundHash);assert.equal(restore.restored.artKey,c.artKey);assert.equal(restore.rewound.artKey,opening.artKey);assert.equal(restore.rewound.owner,2);
  report.cases.push({opening,capture,restore});
 }
 report.disposal=await page.evaluate(()=>window.qa.dispose());assert.deepEqual(report.disposal,{canvases:0,pages:0});assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1}finally{await writeFile(path.join(out,'results.json'),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(out,report.status,report.error??'')}
