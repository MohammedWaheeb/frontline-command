import test from 'node:test';
import assert from 'node:assert/strict';
import {activeMatchDuration,assertSameApplication,assertReleasedAtMenu,assertWorkerRelease,pairDuration} from './rematch-contract.mjs';
const go={id:1,url:'http://localhost/runtime/worker.js',role:'go-runtime',active:true};
const baseline={app:{appInstance:'original',timeOrigin:1,phase:'menu',transportPresent:false,frameSubscribers:0,art:{residentPages:0,residentBytes:0,pickingBytes:0}},page:{pageInstance:'document',activeWorkers:1,hardwareConcurrency:2,workers:[go]},navigationCount:1,openSockets:0};
test('long criterion excludes the actual Go countdown and cannot count wall, pause or postgame padding',()=>{
 const short=activeMatchDuration({initial_tick:0,initial_countdown_ticks:100,final_tick:24000,wallSeconds:9000});assert.equal(short.activeTicks,23900);assert.equal(short.qualifies,false);
 const long=activeMatchDuration({initial_tick:0,initial_countdown_ticks:100,final_tick:24100});assert.equal(long.activeSeconds,1200);assert.equal(long.qualifies,true);
 assert.equal(pairDuration([short,long]).complete,false);assert.equal(pairDuration([long,long]).complete,true);
 assert.throws(()=>activeMatchDuration({initial_tick:0,final_tick:24100}),/initial_countdown_ticks/);assert.throws(()=>activeMatchDuration({initial_tick:0,initial_countdown_ticks:100,final_tick:50}));
});
test('only source-identified bounded idle decoder pools may persist; Go identity, unknown workers and pending work remain strict',()=>{
 const image={id:3,url:'blob:localhost/verified-image-script',role:'pixi-image-decoder',active:true,pendingJobs:0,messages:2,completed:2,messageIDs:['loadImageBitmap']};
 const pooled={...baseline.page,activeWorkers:2,workers:[go,image]};assertWorkerRelease(baseline.page,pooled);
 assertWorkerRelease(baseline.page,{...pooled,activeWorkers:3,workers:[go,image,{...image,id:4}]});
 for(const invalid of [
  {...pooled,workers:[{...go,id:2},image]},
  {...pooled,workers:[go,{...image,role:'unknown'}]},
  {...pooled,workers:[go,{...image,role:'pixi-image-probe'}]},
  {...pooled,workers:[go,{...image,pendingJobs:1}]},
  {...pooled,workers:[go,{...image,completed:1}]},
  {...pooled,workers:[go,{...image,messageIDs:['other']}]},
  {...pooled,activeWorkers:4,workers:[go,image,{...image,id:4},{...image,id:5}]},
 ])assert.throws(()=>assertWorkerRelease(baseline.page,invalid));
});
test('fresh pages, applications and main-frame navigation fail even if the game remains visually identical',()=>{
 assertSameApplication(baseline,structuredClone(baseline));
 for(const patch of [{app:{...baseline.app,appInstance:'new'}},{app:{...baseline.app,timeOrigin:2}},{page:{...baseline.page,pageInstance:'new'}},{navigationCount:2}])assert.throws(()=>assertSameApplication(baseline,{...baseline,...patch}));
});
test('menu boundary requires original page and release of match transport, frame listeners, textures and extra workers',()=>{
 assertReleasedAtMenu(baseline,structuredClone(baseline));
 for(const patch of [{openSockets:1},{page:{...baseline.page,activeWorkers:2}},{app:{...baseline.app,phase:'active'}},{app:{...baseline.app,transportPresent:true}},{app:{...baseline.app,frameSubscribers:1}},{app:{...baseline.app,art:{...baseline.app.art,residentPages:1}}},{app:{...baseline.app,art:{...baseline.app.art,pickingBytes:1}}}])assert.throws(()=>assertReleasedAtMenu(baseline,{...baseline,...patch}));
});
