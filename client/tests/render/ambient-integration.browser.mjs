import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium,firefox,webkit} from 'playwright-core';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const args=Object.fromEntries(process.argv.slice(2).reduce((r,v,i,a)=>i%2?r:[...r,[v,a[i+1]]],[]));
assert(args['--product']&&args['--out'],'Supply frozen --product and new --out');
const product=path.resolve(args['--product']),candidate=path.dirname(product),source=path.join(candidate,'source/client'),engine=args['--engine']??'chromium';
assert(['chromium','firefox','webkit'].includes(engine));
const out=path.resolve(args['--out']),temp=await mkdtemp(path.join(tmpdir(),'frontline-ambient-'));await mkdir(out);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),receipt=JSON.parse(await readFile(path.join(candidate,'build.json'),'utf8'));
assert.equal(receipt.effectCount,71,'This course requires the explicit 71-effect freeze');
const fixture=path.join(source,'tests/render/ambient-integration-fixture.ts');assert.equal(hash(await readFile(fixture)),receipt.sourceFiles['tests/render/ambient-integration-fixture.ts']);
await build({entryPoints:[fixture],outfile:path.join(temp,'main.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'frozen-binding',setup(build){build.onResolve({filter:/protocol\/frontline_pb(?:\.js)?$/},()=>({path:path.join(source,'src/protocol/frontline_pb.ts')}))}}]});
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png'};
const server=createServer(async(req,res)=>{try{
 const p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p.split('/').includes('..'))throw Error('Unsafe path');
 if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Frontline ambient acceptance</title><link rel="icon" href="data:,"><style>html,body,#field{margin:0;width:100%;height:100%;overflow:hidden}#caption{position:fixed;left:12px;top:12px;padding:8px;background:#181b13;color:#e3c88b;font:12px Arial;z-index:3}</style><div id="field"></div><div id="caption">Actual Go presentation course · 71 candidate effects</div><script type="module" src="/main.js"></script>');return}
 const file=p==='/main.js'?path.join(temp,'main.js'):p.startsWith('/runtime/')?path.join(product,p):p.startsWith('/art/')?path.join(product,p):undefined;
 if(!file)throw Error('Not found');res.setHeader('Content-Type',mime[path.extname(p)]??'application/octet-stream');res.end(await readFile(file));
 }catch(error){res.statusCode=404;res.end(String(error))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await({chromium,firefox,webkit})[engine].launch(engine==='chromium'?{headless:false,channel:'chromium'}:{headless:true}),page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(120000);
const report={time:new Date().toISOString(),engine,browser:browser.version(),scope:'Actual Go practice-spawn course with ordinary movement, paid construction, auto-combat damage, selling, harvesting, capture and shipment. All12 ambient consumers, variants, renderer clarity, pause/restore/replay/disposal. Manual steps and incomplete frozen actor art: not economy/endurance/final-art or full product-layout acceptance.',receipt,errors:[],httpErrors:[],fixtureSHA256:hash(await readFile(fixture)),bundleSHA256:hash(await readFile(path.join(temp,'main.js'))),wasmSHA256:hash(await readFile(path.join(product,'runtime/frontline.wasm'))),cases:{}};
page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({url:response.url(),status:response.status()})});page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text())});
const capture=name=>page.screenshot({path:path.join(out,name+'.png')});
async function run(name,effect){
 const key=effect.slice(3),result=await page.evaluate(name=>window.ambientQA[name](),name);report.cases[key]={opening:result};
 assert(result.ambient.some(cue=>cue.effect===effect),`${name}: actual state did not produce ${effect}`);
 if(['fx.building.sell_dust','fx.environment.depletion_dust','fx.environment.shipment_arrival','fx.environment.supply_station_capture'].includes(effect))report.cases[key].middle=await page.evaluate(()=>window.ambientQA.advance(12));
 for(const variant of ['standard','low','reducedMotion','reducedFlashing','reduced']){
  const value=await page.evaluate(name=>window.ambientQA.variant(name),variant);report.cases[key][variant]=value;
  assert(value.decorations.some(d=>d.effect===effect&&d.variant===variant),`${name}: visible ${variant} art required`);assert(value.diagnostics.allocatedBytes<=32*1024*1024);assert(value.diagnostics.decorations<=192);
  if(variant==='reducedMotion'||variant==='reduced')for(const decoration of value.decorations.filter(d=>d.effect===effect)){
   if(!['fx.building.sell_dust','fx.environment.depletion_dust','fx.environment.shipment_arrival','fx.environment.supply_station_capture'].includes(effect))assert.equal(decoration.frame,0);
  }
  if(variant==='standard'||variant==='reduced')await capture(key+'-'+variant);
 }
 return result;
}
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
 await run('movement','fx.unit.dust_trail');report.stopped=await page.evaluate(()=>window.ambientQA.stop());assert(!report.stopped.ambient.some(cue=>cue.effect==='fx.unit.dust_trail'));
 await run('rotor','fx.unit.rotor_wash');
 await run('construction','fx.building.construction_dust');await run('sell','fx.building.sell_dust');
 await run('damagedUnit','fx.unit.smoke_damaged');await run('critical','fx.unit.fire_critical');await run('wreck','fx.unit.wreck_smoke');
 await run('damagedBuilding','fx.building.fire_damaged');await run('critical','fx.building.smoke_critical');
 await run('depleted','fx.environment.depletion_dust');await run('shipment','fx.environment.shipment_arrival');
 await run('capture','fx.environment.supply_station_capture');
 report.pause=await page.evaluate(()=>window.ambientQA.paused());assert.equal(report.pause.hash,report.pause.afterHash);assert.equal(report.pause.before.tick,report.pause.after.tick);assert.deepEqual(report.pause.before.ambient,report.pause.after.ambient);
 report.restore=await page.evaluate(()=>window.ambientQA.restore());assert.equal(report.restore.hash,report.restore.saveHash);assert.equal(report.restore.after.ambient.length,0,'restoring station state cannot replay capture');
 const replay=await page.evaluate(()=>window.ambientQA.replay());await writeFile(path.join(out,'course.replay.json'),Buffer.from(replay.bytes));delete replay.bytes;report.replay=replay;assert.equal(replay.hash,replay.savedHash);assert.equal(replay.atEnd.ambient.length,0);
 report.clarity=await page.evaluate(()=>window.ambientQA.clarity());assert(report.clarity.memory.some(m=>m.id===report.clarity.source));assert(report.clarity.memoryLabels.some(text=>text.startsWith('LAST SEEN ')));await capture('last-seen-structure');
 await writeFile(path.join(out,'clarity-before-defeat.save.json'),JSON.stringify(await page.evaluate(()=>window.ambientQA.exportSave())));
 report.ranges={};for(const mode of ['weapon','sight','detection','off']){const value=await page.evaluate(mode=>window.ambientQA.range(mode),mode);report.ranges[mode]=value;if(mode==='weapon')assert.equal(value.ranges.rangeRings,2);if(mode==='sight')assert.equal(value.ranges.rangeRings,1);if(mode==='off')assert.equal(value.ranges.rangeRings,0);await capture('range-'+mode)}
 report.placement={};for(const valid of [true,false]){const value=await page.evaluate(valid=>window.ambientQA.placement(valid),valid);report.placement[String(valid)]=value;assert.equal(value.preview.results[0].code,'indeterminate');assert.equal(value.preview.results[0].accepted,true);assert(value.ghost.visible);assert.equal(value.ghost.children,5);assert.match(value.estimate,/Power after build/);await capture('placement-pending-'+(valid?'free':'occupied'))}
 report.placementCleared=await page.evaluate(()=>window.ambientQA.clearPlacement());assert.equal(report.placementCleared.visible,false);
 report.occupiedRejection=await page.evaluate(()=>window.ambientQA.rejectOccupiedPlacement());assert.equal(report.occupiedRejection.result.code,'occupied');
 report.defeat=await page.evaluate(()=>window.ambientQA.defeat());assert(report.defeat.defeat.some(d=>d.own&&d.seconds>0&&d.seconds<=30));
 await writeFile(path.join(out,'clarity.save.json'),JSON.stringify(await page.evaluate(()=>window.ambientQA.exportSave())));
 report.recovery=await page.evaluate(()=>window.ambientQA.recovery());assert(!report.recovery.defeat.some(d=>d.own));
 report.disposal=await page.evaluate(()=>window.ambientQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.art.residentPages,0);assert.equal(report.disposal.art.pickingBytes,0);assert.equal(report.disposal.combat.allocatedBytes,0);assert.equal(report.disposal.combat.decorations,0);assert.deepEqual(report.disposal.errors,[]);assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);report.failureSnapshot=await page.evaluate(()=>window.ambientQA?.report()).catch(()=>undefined);await capture('failure').catch(()=>{});process.exitCode=1}
finally{try{await writeFile(path.join(out,'driver.mjs'),await readFile(fileURLToPath(import.meta.url)));await writeFile(path.join(out,'fixture.ts'),await readFile(fixture));await writeFile(path.join(out,'browser.json'),JSON.stringify(report,(_,value)=>typeof value==='bigint'?value.toString():value,2))}finally{try{await browser.close()}finally{await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true})}}console.log(report.status,report.failure??'')}
