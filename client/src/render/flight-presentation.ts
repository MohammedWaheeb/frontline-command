import type {Entity} from '../runtime';
import type {SpriteState} from './art';

type Phase={names:string[];at:number;duration:number;from:number;to:number};
/** A short visual bridge between already-authorized flight states. It never
 * changes simulation position, landing, service, ammunition or order timing. */
export class FlightPresentation {
 private phase?:Phase;
 reset(){this.phase=undefined}
 observe(previous:Entity,next:Entity,now:number,cruise:number,states:ReadonlyMap<string,SpriteState>|undefined,drone:boolean){
  if(previous.state==='destroyed'){this.reset();return}
  const crash=next.state==='destroyed'&&previous.state!=='destroyed';
  if(!crash&&previous.landed===next.landed)return;
  const names=crash?['crash','death']:next.landed?['landing',...(drone?['recover']:[])]:['takeoff',...(drone?['launch']:[])];
  const state=names.map(name=>states?.get(name)).find(Boolean),duration=state&&state.fps>0?state.frames/state.fps*1000:600;
  this.phase={names,at:now,duration,from:this.altitude(previous,now,cruise),to:crash||next.landed?0:cruise};
 }
 altitude(entity:Entity,now:number,cruise:number,reducedMotion=false){
  const target=entity.state==='destroyed'||entity.landed?0:cruise,phase=this.phase;
  if(reducedMotion||!phase)return target;
  const t=Math.max(0,Math.min(1,(now-phase.at)/phase.duration));
  if(t>=1)return target;
  const weight=phase.to===0&&entity.state==='destroyed'?t*t:t*t*(3-2*t);
  return phase.from+(phase.to-phase.from)*weight;
 }
 state(now:number,states:ReadonlyMap<string,SpriteState>,reducedMotion=false){
  if(reducedMotion||!this.phase||now-this.phase.at>=this.phase.duration)return;
  return this.phase.names.map(name=>states.get(name)).find(Boolean);
 }
 startedAt(name:string,now:number){return this.phase?.names.includes(name)&&now-this.phase.at<this.phase.duration?this.phase.at:undefined}
}
