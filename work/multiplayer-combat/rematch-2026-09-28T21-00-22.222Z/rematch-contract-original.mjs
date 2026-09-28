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
export function assertReleasedAtMenu(initial,current){
 assertSameApplication(initial,current);
 assert.equal(current.app.phase,'menu');assert.equal(current.app.transportPresent,false);
 assert.equal(current.app.frameSubscribers,0,'Battlefield snapshot subscriber survived teardown');
 assert.equal(current.openSockets,0,'Match socket survived menu return');
 assert.equal(current.page.activeWorkers,initial.page.activeWorkers,'An extra runtime worker survived teardown');
 for(const key of ['residentPages','residentBytes','pickingBytes'])assert.equal(current.app.art[key],initial.app.art[key],`Art ${key} did not return to menu baseline`);
}
export function pairDuration(durations){assert.equal(durations.length,2);return {criterion:'Each ordinary match has at least 20 active simulation minutes, excluding actual initial countdown. This is an operational test criterion, not a gameplay minimum.',complete:durations.every(value=>value.qualifies),matches:durations};}
