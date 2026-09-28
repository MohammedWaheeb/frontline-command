import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';
import {artIndex} from '../../scripts/ui/art-plugin.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).reduce((r,v,i,a)=>i%2?r:[...r,[v,a[i+1]]],[]));
assert(args['--product']&&args['--out'],'Supply frozen --product and new --out');
const product=path.resolve(args['--product']),candidate=path.dirname(product),source=path.join(candidate,'source/client');
const engine=args['--engine']??'chromium';if(!['chromium','firefox','webkit'].includes(engine))throw Error('Unknown browser');
const out=path.resolve(args['--out']),temp=await mkdtemp(path.join(tmpdir(),'frontline-fx-integration-'));await mkdir(out);
const receipt=JSON.parse(await readFile(path.join(candidate,'build.json'),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await build({entryPoints:[path.join(source,'tests/render/fx-integration-fixture.ts')],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'isolated-protocol',setup(build){build.onResolve({filter:/protocol\/frontline_pb(?:\.js)?$/},()=>({path:path.join(source,'src/protocol/frontline_pb.ts')}))}}]});
const index=JSON.parse(await readFile(path.join(product,'art/index.json'),'utf8')),mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png'};
const fixtureHash={};for(const name of ['ordinary','landed','source-converted','source-dead','source-removed','live-decoy','abm','SA.mobile_abm']){const bytes=await readFile(path.join(root,name==='live-decoy'?'work/combat-audio/live-decoy-native/saves':'work/combat-audio/native/saves',name+'.start.save.json'));fixtureHash[name]=hash(bytes);await writeFile(path.join(temp,name+'.start.save.json'),bytes)}
const server=createServer(async(req,res)=>{try{
 const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Combat renderer acceptance</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden}#caption{position:fixed;left:12px;top:12px;padding:8px;background:#181b13;color:#e3c88b;font:12px Arial;z-index:3}</style><div id="field"></div><div id="caption">Combat acceptance · actual Go fixtures ·59 candidate effects</div><script type="module" src="/main.js"></script>');return}
 if(p==='/art/index.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(index));return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/runtime/')?path.join(product,'runtime',p.slice(9)):p.startsWith('/art/')?path.join(product,'art',p.slice(5)):p.startsWith('/fixtures/')&&/^[\w.-]+$/.test(p.slice(10))?path.join(temp,p.slice(10)):undefined;
 if(!file)throw Error('Not found');res.setHeader('Content-Type',mime[path.extname(p)]??'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(String(error))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{headless:false,channel:'chromium'}:{headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(120000);
const report={time:new Date().toISOString(),engine,browser:browser.version(),scope:'Actual Go seeded mechanics and ordinary Attack; attached/oriented59-effect candidate. Five variants, real impact/cover/interception/decoy, pause/cull/save/replay/context/disposal. Incomplete frozen actor art; not complete effect or release acceptance.',receipt,errors:[],fixtureHash,wasmSHA256:hash(await readFile(path.join(product,'runtime/frontline.wasm'))),protocolSHA256:hash(await readFile(path.join(source,'src/protocol/frontline_pb.ts'))),bundleSHA256:hash(await readFile(path.join(temp,'main.js'))),artIndexSHA256:hash(Buffer.from(JSON.stringify(index)))};
report.httpErrors=[];page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()})});
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
const capture=async name=>page.screenshot({path:path.join(out,name+'.png')});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 report.scope='Actual Go practice_spawn/practice_remove destruction events, not ordinary paid-combat or balance acceptance. Five variants, class/altitude, full clip lifetime, offscreen large-plume bounds, restore and disposal. Incomplete frozen actor art.';
 report.cases={};
 for(const [type,effect,ticks] of [['US.car','vehicle_light',22],['US.tank','vehicle_heavy',32],['US.fighter','aircraft',28],['power','building_small',40],['factory','building_large',60]]){
  await page.evaluate(()=>window.combatQA.normal());
  const r=await page.evaluate(type=>window.combatQA.destruction(type),type),cue=r.cues.find(c=>c.kind==='destroyed');report.cases[type]={opening:r};
  assert(r.event&&r.event.entity===r.before.id);assert.deepEqual(cue.effects,['fx.explosion.'+effect]);assert.equal(cue.until-cue.tick,ticks);assert.equal(cue.anchor,undefined);
  if(type==='US.fighter'){assert(r.height>0);assert.equal(cue.elevationSource,r.before.id);assert.equal(r.elevation,r.height)}
  const middle=await page.evaluate(()=>window.combatQA.advance(18));report.cases[type].middle=middle;
  assert(middle.decorations.some(d=>d.key.startsWith(cue.key+':')));await capture(effect+'-standard-mid');
  for(const name of ['low','reducedMotion','reducedFlashing','reduced','standard']){
   const v=await page.evaluate(name=>window.combatQA.variant(name),name);assert(v.cues.some(c=>c.key===cue.key));assert(v.decorations.some(d=>d.key.startsWith(cue.key+':')&&d.variant===name));
   report.cases[type][name]=v;await capture(effect+'-'+name);
  }
  let elapsed=18;
  if(effect==='building_large'){
   await page.evaluate(()=>window.combatQA.advance(24));elapsed=42;
   report.cases[type].edge=await page.evaluate(()=>window.combatQA.deathEdge(true));assert(report.cases[type].edge.decorations.some(d=>d.key.startsWith(cue.key+':')),'Actual crop stays drawn with origin100px below viewport');await capture('large-plume-offscreen-origin');await page.evaluate(()=>window.combatQA.deathEdge(false));
  }
  const last=await page.evaluate(async n=>{let r;while(n>0){const step=Math.min(20,n);r=await window.combatQA.advance(step);n-=step}return r},ticks-1-elapsed);assert(last.cues.some(c=>c.key===cue.key));
  const ended=await page.evaluate(()=>window.combatQA.advance(1));assert(!ended.cues.some(c=>c.key===cue.key));report.cases[type].ended=ended;
  const restored=await page.evaluate(()=>window.combatQA.restore());assert.equal(restored.hash,restored.saveHash);assert.equal(restored.after.diagnostics.cues,0);
 }
 report.disposal=await page.evaluate(()=>window.combatQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.art.residentPages,0);assert.equal(report.disposal.combat.allocatedBytes,0);assert.deepEqual(report.disposal.errors,[]);assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);report.failureSnapshot=await page.evaluate(()=>window.combatQA?.report()).catch(()=>undefined);await capture('failure').catch(()=>{});process.exitCode=1}
finally{
 try{
  await writeFile(path.join(out,'driver.mjs'),await readFile(fileURLToPath(import.meta.url)));
  await writeFile(path.join(out,'fixture.ts'),await readFile(path.join(source,'tests/render/fx-integration-fixture.ts')));
  await writeFile(path.join(out,'browser.json'),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2));
 }finally{
  try{await browser.close()}finally{await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true})}
 }
 console.log(report.status,report.failure??'');
}
