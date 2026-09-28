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
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');report.opening=await page.evaluate(()=>window.combatQA.report());assert.equal(report.opening.diagnostics.cues,0);
 report.muzzle=await page.evaluate(()=>window.combatQA.muzzle());
 assert(report.muzzle.cues.some(c=>c.kind==='muzzle'));
 assert(report.muzzle.decorations.some(d=>report.muzzle.cues.some(c=>c.kind==='muzzle'&&d.key.startsWith(c.key+':'))),'Actual muzzle decoration required');
 assert(report.muzzle.decorations.every(d=>Number.isFinite(d.rotation)));
 await capture('attached-muzzle-standard-1600');
 report.variants={};for(const name of ['low','reducedMotion','reducedFlashing','reduced','standard']){
  const r=await page.evaluate(name=>window.combatQA.variant(name),name);report.variants[name]=r;
  assert.deepEqual(r.cues,report.muzzle.cues);assert(r.decorations.length>0);assert(r.decorations.every(d=>d.variant===name));
  await capture('attached-muzzle-'+name+'-1600');
 }
 await page.evaluate(()=>window.combatQA.load('ordinary'));

 report.cover=await page.evaluate(()=>window.combatQA.attack());assert(report.cover.cues.some(c=>c.kind==='hit'&&c.cover&&c.armor==='infantry'));assert(report.cover.diagnostics.cover>0);await capture('covered-rifle-hit-1600');
 report.pause=await page.evaluate(()=>window.combatQA.pause());
 // Manual Go stepping is held; actor recoil/idle still uses the existing
 // cosmetic wall clock. Attachment positions follow those painted poses.
 // Keep exact state/cue/clip phases, not an assertion of frozen actor pixels.
 const held=r=>({...r,attachments:undefined,decorations:r.decorations.map(({x,y,rotation,...rest})=>rest)});
 assert.deepEqual(held(report.pause.before),held(report.pause.after));assert.equal(report.pause.hash,report.pause.afterHash);
 await page.setViewportSize({width:1280,height:720});report.reduced=await page.evaluate(()=>window.combatQA.reduced());assert.deepEqual(report.reduced.cues,report.cover.cues);assert(report.reduced.diagnostics.cover>0);await capture('covered-hit-reduced-1280');
 report.cull=await page.evaluate(()=>window.combatQA.cull());assert.equal(report.cull.far.diagnostics.drawnCues,0);assert(report.cull.returned.diagnostics.cover>0);
 report.restore=await page.evaluate(()=>window.combatQA.restore());assert.equal(report.restore.hash,report.restore.saveHash);assert.equal(report.restore.after.diagnostics.cues,0);
 await page.evaluate(()=>window.combatQA.normal());report.nextHit=await page.evaluate(()=>window.combatQA.tickUntil('hit',30));assert(report.nextHit.diagnostics.confirmedHits>0);
 report.replay=await page.evaluate(()=>window.combatQA.replay());assert.equal(report.replay.hash,report.replay.savedHash);assert.equal(report.replay.opening.diagnostics.cues,0);assert.equal(report.replay.atEnd.diagnostics.cues,0);
 await page.evaluate(tick=>window.combatQA.seek(tick),report.replay.start);report.shortSeek=await page.evaluate(tick=>window.combatQA.seek(tick),report.replay.end);assert.equal(report.shortSeek.diagnostics.cues,0);
 report.raised=await page.evaluate(()=>window.combatQA.raised());assert(report.raised.diagnostics.cover>0);await capture('raised-cover-and-fog-1280');
 report.tank=await page.evaluate(()=>window.combatQA.tank());assert(report.tank.final.decorations.some(d=>d.key.startsWith('projectile:')&&Number.isFinite(d.rotation)));await capture('actual-oriented-cannon-1280');
 report.landed=await page.evaluate(async()=>{await window.combatQA.load('landed');return window.combatQA.attack()});assert(report.landed.cues.some(c=>c.kind==='hit'&&c.armor==='light'));await capture('landed-aircraft-light-hit-1280');
 report.sources={};for(const kind of ['converted','dead','removed']){const r=await page.evaluate(async kind=>{await window.combatQA.load('source-'+kind);return window.combatQA.tickUntil('hit',10)},kind);assert(r.cues.some(c=>c.kind==='hit'&&c.weapon==='RIF'));report.sources[kind]=r}
 report.decoy=await page.evaluate(async()=>{await window.combatQA.load('live-decoy');return window.combatQA.tickUntil('decoy',16)});assert(report.decoy.diagnostics.decoys>0);assert(!report.decoy.cues.some(c=>c.kind==='hit'));await capture('actual-decoy-1280');
 report.interceptions={};for(const kind of ['abm','SA.mobile_abm']){const r=await page.evaluate(async kind=>{await window.combatQA.load(kind);return window.combatQA.tickUntil('intercepted',20)},kind);assert(r.diagnostics.intercepted>0);assert(r.cues.every(c=>c.kind!=='intercepted'||c.anchor===undefined));report.interceptions[kind]=r;await capture(kind.replaceAll('.','-')+'-interception-1280')}
 report.deathReset=await page.evaluate(()=>window.combatQA.deathReset());assert(report.deathReset.corpses>0);assert.equal(report.deathReset.afterLoad,0);assert.equal(report.deathReset.restored,report.deathReset.saveHash);assert(report.deathReset.replayCorpses>0);assert.equal(report.deathReset.afterForwardSeek,0);
 if(process.env.FRONTLINE_OWNER_CASUALTY==='1'){
  report.ownerCasualty=await page.evaluate(()=>window.combatQA.ownerCasualty());const r=report.ownerCasualty;
  assert.equal(r.visible,false);assert.equal(r.lost.owner,1);assert.equal(r.lost.entity,6);assert.equal(r.lost.combat,undefined);
  assert.equal(r.calls.filter(c=>c.id==='vo.announcer.US.unit_lost').length,1);assert.equal(r.beforeDuplicate,r.afterDuplicate);assert.equal(r.saveHash,r.restoredHash);assert.equal(r.corpses,0);
  await capture('owner-casualty-fog-restored-1280');
 }
 if(engine==='chromium'){report.context=await page.evaluate(()=>window.combatQA.context());assert.equal(report.context.diagnostics.cues,0)}
 report.disposal=await page.evaluate(()=>window.combatQA.dispose());assert.equal(report.disposal.canvases,0);assert.equal(report.disposal.art.residentPages,0);assert.equal(report.disposal.combat.allocatedBytes,0);assert.equal(report.disposal.combat.cues,0);assert.deepEqual(report.disposal.errors,engine==='chromium'?['Graphics context lost. Simulation remains in its worker; pause or save while graphics recover.']:[]);assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack??error);report.failureSnapshot=await page.evaluate(()=>window.combatQA?.report()).catch(()=>undefined);await capture('failure').catch(()=>{});process.exitCode=1}
finally{await writeFile(path.join(out,'driver.mjs'),await readFile(fileURLToPath(import.meta.url)));await writeFile(path.join(out,'fixture.ts'),await readFile(path.join(source,'tests/render/fx-integration-fixture.ts')));await writeFile(path.join(out,'browser.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});console.log(report.status,report.failure??'')}
