import assert from 'node:assert/strict';

// §26.3 gives no numeric long-match minimum. Our explicit operational criterion
// uses the lower bound of the §2 standard 1v1 duration target; it is not a rule.
export const LONG_MATCH_ACTIVE_TICKS=20*60*20;
export function activeMatchDuration(audit){
 for(const key of ['initial_tick','final_tick','initial_countdown_ticks'])assert(Number.isSafeInteger(audit[key])&&audit[key]>=0,`Native audit must provide valid ${key}`);
 const activeTicks=audit.final_tick-audit.initial_tick-audit.initial_countdown_ticks;
 assert(activeTicks>=0,'Countdown cannot exceed the replayed interval');
 return {initialTick:audit.initial_tick,countdownTicks:audit.initial_countdown_ticks,finalTick:audit.final_tick,activeTicks,activeSeconds:activeTicks/20,minimumActiveTicks:LONG_MATCH_ACTIVE_TICKS,qualifies:activeTicks>=LONG_MATCH_ACTIVE_TICKS};
}
export function assertSameApplication(initial,current){
 assert.equal(current.app.appInstance,initial.app.appInstance,'Application instance was replaced');
 assert.equal(current.app.timeOrigin,initial.app.timeOrigin,'Document was reloaded');
 assert.equal(current.page.pageInstance,initial.page.pageInstance,'Page instrumentation restarted');
 assert.equal(current.navigationCount,initial.navigationCount,'A main-frame navigation occurred');
}
export function assertWorkerRelease(initial,current){
 assert(Array.isArray(initial.workers)&&Array.isArray(current.workers),'Worker URL/ownership diagnostics are required');
 const active=current.workers.filter(worker=>worker.active),original=initial.workers.filter(worker=>worker.active&&worker.role==='go-runtime');
 assert(original.length>0,'The original Go validator worker must be observed');
 assert.equal(active.length,current.activeWorkers,'Worker accounting is inconsistent');
 assert.deepEqual(active.filter(worker=>worker.role==='go-runtime').map(({id,url})=>({id,url})),original.map(({id,url})=>({id,url})),'An extra or replaced Go runtime worker survived teardown');
 assert(active.every(worker=>['go-runtime','pixi-image-decoder'].includes(worker.role)),'An unknown worker or image support probe survived teardown');
 const images=active.filter(worker=>worker.role==='pixi-image-decoder');
 assert(Number.isSafeInteger(current.hardwareConcurrency)&&current.hardwareConcurrency>0,'Record the actual image-worker pool limit');
 assert(images.length<=current.hardwareConcurrency,'Image worker pool exceeded the documented hardware-concurrency limit');
 for(const worker of images){assert.equal(worker.pendingJobs,0,'Image decoding remained pending after teardown');assert.equal(worker.messages,worker.completed,'Image worker has unresolved work');assert(worker.messageIDs.every(id=>id==='loadImageBitmap'),'Image worker received an unexpected message kind')}
}
export function assertReleasedAtMenu(initial,current){
 assertSameApplication(initial,current);
 assert.equal(current.app.phase,'menu');assert.equal(current.app.transportPresent,false);
 assert.equal(current.app.frameSubscribers,0,'Battlefield snapshot subscriber survived teardown');
 assert.equal(current.openSockets,0,'Match socket survived menu return');
 assertWorkerRelease(initial.page,current.page);
 for(const key of ['residentPages','residentBytes','pickingBytes'])assert.equal(current.app.art[key],initial.app.art[key],`Art ${key} did not return to menu baseline`);
}
export function pairDuration(durations){assert.equal(durations.length,2);return {criterion:'Each ordinary match has at least 20 active simulation minutes, excluding actual initial countdown. This is an operational test criterion, not a gameplay minimum.',complete:durations.every(value=>value.qualifies),matches:durations};}
