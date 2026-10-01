// Decorative menu lifecycle using the shipped React component and authored atlas
// pages. Browser plugin not available; Playwright validates draw/abort/disposal.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {artIndex} from '../../scripts/ui/art-plugin.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=path.join(root,'work/evidence/menu-diorama',new Date().toISOString().replaceAll(':','-')),temp=await mkdtemp(path.join(tmpdir(),'frontline-menu-'));await mkdir(out,{recursive:true});
await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{MenuDiorama}from'./ui/MenuDiorama';function Fixture(){const[open,setOpen]=useState(true);return <><button onClick={()=>setOpen(v=>!v)}>Toggle scene</button><div id="scene">{open&&<MenuDiorama/>}</div></>}createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`,resolveDir:path.join(root,'client/src'),loader:'tsx'},outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const index=await artIndex(path.join(root,'assets'));
const server=createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Menu diorama lifecycle</title><link rel="icon" href="data:,"><style>html,body{margin:0;background:#14130f;color:#eedbb7}button{height:40px}#scene{width:100vw;height:calc(100vh - 40px);position:relative}.menu-diorama{position:absolute;inset:0;width:100%;height:100%}</style><div id="root"></div><script type="module" src="/main.js"></script>');return}
 if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(index));return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/art/')?path.join(root,'assets/build',p.slice(5)):undefined;if(!file)throw Error('Not found');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'application/json');res.end(await readFile(file));
}catch(e){res.statusCode=404;res.end(String(e))}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}}),report={date:new Date().toISOString(),browser:browser.version(),sourceSHA256:createHash('sha256').update(await readFile(path.join(root,'client/src/ui/MenuDiorama.tsx'))).digest('hex'),errors:[],checks:{},status:'running'};
page.on('pageerror',e=>report.errors.push(e.message));
await page.addInitScript(()=>{window.qaImages=[];window.qaUncaught=[];const NativeImage=window.Image;window.Image=class extends NativeImage{constructor(...args){super(...args);window.qaImages.push(new WeakRef(this))}};window.addEventListener('unhandledrejection',e=>window.qaUncaught.push(String(e.reason)))});
const ready=()=>page.locator('canvas[data-ready=true]').waitFor({timeout:90000});
const collected=async()=>{const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');await cdp.detach();return page.evaluate(()=>({created:window.qaImages.length,retained:window.qaImages.filter(r=>r.deref()).length,unhandled:window.qaUncaught}))};
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);assert.equal(await page.title(),'Menu diorama lifecycle');await ready();await page.screenshot({path:path.join(out,'native-1600.png')});report.checks.first=await collected();assert(report.checks.first.created>10);assert.equal(report.checks.first.retained,0,'Completed draw retained atlas Image objects');
 for(const [width,height] of [[1280,720],[900,600],[1600,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(200);await ready();const size=await page.locator('canvas').evaluate(c=>({width:c.width,height:c.height,css:c.getBoundingClientRect().toJSON()}));assert.equal(size.width,width);assert.equal(size.height,height-40);report.checks[`resize-${width}`]=size}
 const old=await page.locator('canvas').elementHandle();await page.getByRole('button',{name:'Toggle scene'}).click();assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(await old.evaluate(c=>[c.width,c.height]),[0,0]);await old.dispose();report.checks.disposed=await collected();assert.equal(report.checks.disposed.retained,0);
 // Deliberately stall the next scene's index; unmount while its fetch is pending.
 let release;const gate=new Promise(resolve=>release=resolve);let intercepted=false;
 await page.route('**/art/index.json',async route=>{intercepted=true;await gate;await route.continue().catch(()=>{})});await page.getByRole('button',{name:'Toggle scene'}).click();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='false');await page.waitForTimeout(100);assert(intercepted);const aborted=await page.locator('canvas').elementHandle();await page.getByRole('button',{name:'Toggle scene'}).click();release();await page.unroute('**/art/index.json');await page.waitForTimeout(100);assert.deepEqual(await aborted.evaluate(c=>[c.width,c.height]),[0,0]);await aborted.dispose();report.checks.aborted=await collected();assert.deepEqual(report.checks.aborted.unhandled,[]);
 await page.getByRole('button',{name:'Toggle scene'}).click();await ready();report.checks.remounted=await collected();assert.equal(report.checks.remounted.retained,0);await page.getByRole('button',{name:'Toggle scene'}).click();
 // Missing decoration must leave controls usable and create no unhandled error.
 await page.route('**/art/index.json',route=>route.fulfill({status:404,body:'Missing art fixture'}));await page.getByRole('button',{name:'Toggle scene'}).click();await page.waitForTimeout(300);assert.equal(await page.getByRole('button',{name:'Toggle scene'}).isEnabled(),true);await page.getByRole('button',{name:'Toggle scene'}).click();report.checks.missing=await collected();assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(report.checks.missing.unhandled,[]);assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.error=String(e.stack??e);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{})}finally{await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(JSON.stringify({...report,out},null,2))}
