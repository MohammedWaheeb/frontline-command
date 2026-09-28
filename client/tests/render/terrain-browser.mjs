// Actual terrain baker on authored maps, without actors/fog. Visual and seam
// review only; this is not evidence of a played match or a gameplay reveal.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {artIndex} from '../../scripts/ui/art-plugin.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=path.join(root,'work/evidence/terrain-materials'),temp=await mkdtemp(path.join(tmpdir(),'frontline-terrain-'));await mkdir(out,{recursive:true});
await build({entryPoints:[path.join(root,'client/tests/render/terrain-fixture.ts')],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const server=createServer(async(req,res)=>{try{
 const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Terrain material review</title><link rel="icon" href="data:,"><style>html,body{margin:0;background:#14130f}canvas{display:block}</style><canvas id="terrain"></canvas><script type="module" src="/main.js"></script>');return}
 if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await artIndex(path.join(root,'assets'))));return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/maps/')?path.join(root,'content',p):p.startsWith('/art/terrain/')?path.join(root,'assets/build',p.slice(5)):undefined;
 if(!file)throw Error('Not found');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/json');res.end(await readFile(file));
}catch(error){res.statusCode=404;res.end(String(error))}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),report={date:new Date().toISOString(),errors:[],cases:[],status:'running'};
page.on('pageerror',error=>report.errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 for(const [id,terrain] of [['copper-junction','road'],['relay-heights','cliff'],['port-outskirts','water'],['dry-river','cover']]){
  const value=await page.evaluate(([id,terrain])=>window.qa.show(id,terrain),[id,terrain]);report.cases.push(value);await page.screenshot({path:path.join(out,`${id}.png`)});for(const sample of value.drawOrder)assert.equal(sample.changedChannelsOverOne,0,'Chunk insertion order changed terrain');
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);process.exitCode=1}finally{await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(JSON.stringify(report,null,2))}
