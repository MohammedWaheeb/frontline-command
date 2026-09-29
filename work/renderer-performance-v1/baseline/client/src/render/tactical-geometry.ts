import type {Point} from '../runtime/types';
import type {TacticalWarning,TacticalZone,TacticalPresentation,TacticalOrderMarker,TacticalEventCue} from '../app/tactical-presentation';

/** Circle samples retain their real world radius; projection/height belongs to
 * the caller. At most half-tile chords keep large rings on the terrain surface. */
export function tacticalCircle(center:Point,radius:number):Point[]{
 const count=Math.max(32,Math.min(256,Math.ceil(Math.PI*2*radius/500)));
 return Array.from({length:count},(_,i)=>({x:center.x+Math.cos(i*Math.PI*2/count)*radius,y:center.y+Math.sin(i*Math.PI*2/count)*radius}));
}
export function warningCaption(w:TacticalWarning):string {
 const names:Record<string,string>={tactical:'Missile impact',saturation:'Salvo impact',skybreaker:'Airstrike impact',raid:'Raid deploys',transfer:'Transfer arrives',second_volley:'Next launch',projectile:'Impact'};
 return `${names[w.kind]??'Operation'} · ${Math.ceil(w.deadline.remainingSeconds)}s`;
}
export function zoneCaption(z:TacticalZone):string {
 return `${z.kind==='shieldline'?'Shieldline':z.kind==='scan'?'Recon sweep':'Zone'} ${z.phase==='preparing'?'prepares':'active'} · ${Math.ceil(z.deadline.remainingSeconds)}s`;
}
export interface TacticalLabel {key:string;point:Point;text:string;kind:'warning'|'zone';owner:number}
export function tacticalLabels(p:TacticalPresentation):TacticalLabel[]{
 return [...p.warnings.map(w=>({key:w.key,point:w.position,text:warningCaption(w),kind:'warning' as const,owner:w.owner})),...p.zones.map(z=>({key:z.key,point:z.position,text:zoneCaption(z),kind:'zone' as const,owner:z.owner}))];
}
/** Screen-space collision separation without changing a warning's world point.
 * Call with measured text widths. Labels keep a short leader to their marker. */
export function layoutTacticalLabels(labels:ReadonlyArray<{key:string;point:Point;width:number;height:number}>,offset=20):Map<string,Point>{
 const placed:Array<{x:number;y:number;width:number;height:number}>=[],result=new Map<string,Point>();
 for(const label of labels){
  let x=label.point.x-label.width/2,y=label.point.y-offset-label.height;
  for(let attempt=0;attempt<labels.length;attempt++){
   const collision=placed.find(p=>x<p.x+p.width+5&&x+label.width+5>p.x&&y<p.y+p.height+4&&y+label.height+4>p.y);
   if(!collision)break;y=collision.y-label.height-5;
  }
  placed.push({x,y,width:label.width,height:label.height});result.set(label.key,{x:x+label.width/2,y});
 }
 return result;
}
export function orderSymbol(order:TacticalOrderMarker):string {
 switch(order.kind){case 'attack':return 'A';case 'attack_move':return 'AM';case 'force_fire':return 'F';case 'guard':case 'escort':case 'aggressive':return 'G';case 'return':return 'R';case 'patrol':return 'P';case 'unload':return 'U';case 'build':return 'B';case 'capture':return 'C';case 'repair':return '+';case 'gather':return '$';case 'salvage':return '$';default:return 'M'}
}

/** Ephemeral authorized pings: reset establishes an event baseline, so a later
 * selection-only refresh cannot replay feedback delivered by restore/reconnect. */
export class TacticalPingHistory {
 private readonly pings=new Map<number,TacticalEventCue>();private lastEvent=0;
 get values(){return [...this.pings.values()]}
 sync(cues:readonly TacticalEventCue[],tick:number,reset=false){
  const latest=Math.max(this.lastEvent,0,...cues.map(cue=>cue.id));
  if(reset){this.pings.clear();this.lastEvent=Math.max(0,...cues.map(cue=>cue.id));return}
  for(const [id,ping] of this.pings)if(tick-ping.tick>60||ping.tick>tick)this.pings.delete(id);
  for(const cue of cues)if(cue.id>this.lastEvent&&cue.kind==='tactical_ping'&&cue.position&&cue.tick<=tick&&tick-cue.tick<=60)this.pings.set(cue.id,cue);
  if(this.pings.size>32)for(const id of [...this.pings.keys()].sort((a,b)=>b-a).slice(32))this.pings.delete(id);
  this.lastEvent=latest;
 }
 clear(){this.pings.clear();this.lastEvent=0}
}
