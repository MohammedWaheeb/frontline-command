/** Cosmetic movement follows disclosed full-state ticks at 20 simulation Hz.
 * Arrival jitter and catch-up packets cannot extend smoothing beyond 100 ms.
 * Priority redactions retain the canonical full tick and must not restart it. */
export class SnapshotTimeline {
 private tick?:number;private viewer?:number;
 observe(tick:number,viewer:number):number|null {
  if(this.tick===tick&&this.viewer===viewer)return null;
  const delta=this.tick!==undefined&&this.viewer===viewer&&tick>this.tick?tick-this.tick:1;
  this.tick=tick;this.viewer=viewer;
  return Math.max(50,Math.min(100,delta*50));
 }
}
