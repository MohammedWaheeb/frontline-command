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

const root=fileURLToPath(new URL('../../../',import.meta.url));
const candidate=path.join(root,'work/tactical-wire-candidate');
const out=path.join(root,process.env.FRONTLINE_STATUS_EVIDENCE??'work/evidence/actor-status');
const temp=await mkdtemp(path.join(tmpdir(),'frontline-status-'));await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await build({entryPoints:[path.join(root,'client/tests/render/actor-status-fixture.ts')],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'isolated-protocol',setup(build){build.onResolve({filter:/protocol\/frontline_pb(?:\.js)?$/},()=>({path:path.join(candidate,'source/client/src/protocol/frontline_pb.ts')}))}}]});
const index=await artIndex(path.join(root,'assets')),mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Actor status acceptance</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden}#caption{position:fixed;left:12px;top:12px;padding:8px;background:#181b13;color:#e3c88b;font:12px Arial;z-index:3}</style><div id="field"></div><div id="caption">Actor status acceptance · recorded Go practice course</div><script type="module" src="/main.js"></script>');return}
 if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(index));return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/runtime/')?path.join(candidate,'runtime',p.slice(9)):p.startsWith('/art/')?path.join(root,'assets/build',p.slice(5)):undefined;
 if(!file)throw Error('Not found');res.setHeader('Content-Type',mime[path.extname(p)]??'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(String(error))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:false,channel:'chromium'}),page=await browser.newPage({viewport:{width:1600,height:900}});
page.setDefaultTimeout(120000);
const report={time:new Date().toISOString(),scope:'Actual Go abilities/channel/flight with recorded practice setup; isolated tactical wire, not shipping runtime; no economy, full art or performance acceptance.',errors:[],wasmSHA256:hash(await readFile(path.join(candidate,'runtime/frontline.wasm'))),protocolSHA256:hash(await readFile(path.join(candidate,'source/client/src/protocol/frontline_pb.ts')))};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
const find=(course,type)=>course.model.find(e=>e.type===type),has=(entity,id)=>entity?.status.badges.some(b=>b.id===id);
async function capture(name){await page.screenshot({path:path.join(out,name+'.png')})}
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true',{timeout:60000});
 report.identity={title:await page.title(),url:page.url(),browser:browser.version(),fixtureSHA256:hash(await readFile(path.join(temp,'main.js')))};
 report.recall=await page.evaluate(()=>window.qa.recall());assert(has(find(report.recall,'IR.isr'),'relay'));assert(has(find(report.recall,'IR.isr'),'recall'));assert(has(find(report.recall,'IR.isr'),'return'));await capture('recall-relay-1600');
 report.emergency=await page.evaluate(()=>window.qa.emergency());assert(has(find(report.emergency,'IR.isr'),'emergency_takeoff'));assert(find(report.emergency,'IR.isr').status.badges.some(b=>b.id==='emergency_takeoff'&&b.seconds===2));assert.equal(report.emergency.hash,report.emergency.savedHash);assert.deepEqual(report.emergency.model,report.emergency.savedModel);await capture('emergency-takeoff-restored-1600');
 report.expiry=await page.evaluate(()=>window.qa.expiry());assert(!has(find(report.expiry,'IR.isr'),'emergency_takeoff'));assert(has(find(report.expiry,'IR.isr'),'no_home'));await capture('emergency-expired-no-home-1600');
 report.foreign=await page.evaluate(()=>window.qa.foreign());for(const entity of report.foreign.model.filter(e=>e.owner===1)){assert.equal(entity.status.ammunition,undefined);assert(entity.status.badges.every(b=>!['no_home','return','ambush','emergency_takeoff'].includes(b.id)))}
 report.hull=await page.evaluate(()=>window.qa.hull());assert(has(find(report.hull,'SA.tank'),'hull_down'));assert(has(find(report.hull,'hq'),'emergency_power'));await capture('hull-down-1600');
 report.disperse=await page.evaluate(()=>window.qa.disperse());assert(has(find(report.disperse,'SY.rifle'),'disperse'));assert(has(find(report.disperse,'SY.recon'),'disperse'));await capture('disperse-1600');
 report.reduced=await page.evaluate(()=>window.qa.reduced());assert.deepEqual(report.reduced.before,report.reduced.after);await page.setViewportSize({width:1280,height:720});await capture('disperse-reduced-effects-1280');
 report.dense=await page.evaluate(()=>window.qa.dense());assert.equal(report.dense.model.filter(e=>has(e,'disperse')).length,11);assert.equal(report.dense.visual.filter(v=>v.labels===1&&v.width<18).length,11);await capture('dense-selected-status-symbols-1280');
 report.channel=await page.evaluate(()=>window.qa.channel());const channel=find(report.channel,'US.engineer').status.channel;assert.equal(channel.label,'Boarding');assert(channel.progress>0&&channel.progress<1000);assert(channel.seconds>0);await capture('boarding-progress-1280');
 report.paused=await page.evaluate(()=>window.qa.paused());assert.equal(report.paused.hash,report.paused.afterHash);assert.deepEqual(report.paused.before,report.paused.after);
 report.zoom=await page.evaluate(()=>window.qa.zoom());for(const before of report.zoom.before){const after=report.zoom.after.find(a=>a.id===before.id);assert(after);assert(Math.abs(before.width-after.width)<.02);assert(Math.abs(before.height-after.height)<.02)}await capture('boarding-progress-zoomed-1280');
 report.cull=await page.evaluate(()=>window.qa.cull());for(const before of report.cull.before){assert(!report.cull.far.some(a=>a.id===before.id));assert(report.cull.after.some(a=>a.id===before.id))}
 report.ammunition=await page.evaluate(()=>window.qa.ammunition());assert.deepEqual(find(report.ammunition,'US.fighter').status.ammunition,{label:'Ammo',current:6,capacity:6});assert(report.ammunition.visual.some(v=>v.id===find(report.ammunition,'US.fighter').id&&v.labels>0));await capture('fighter-magazine-1280');
 report.disposal=await page.evaluate(()=>window.qa.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.art.residentPages,0);assert.deepEqual(report.disposal.errors,[]);assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);await capture('failure').catch(()=>{});process.exitCode=1}
finally{await writeFile(path.join(out,'browser.json'),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(report.status,report.error??'')}
