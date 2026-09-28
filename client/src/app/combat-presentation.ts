import type {CatalogIndex} from '../content/catalog';
import type {PlayerSnapshot,Point} from '../runtime';
import type {TacticalProjectile} from './tactical-presentation';
import {combatFacts,type CombatArmor} from './combat-feedback';

export type CombatCueKind='muzzle'|'interceptor-launch'|'impact'|'hit'|'intercepted'|'decoy'|'destroyed';
export interface CombatCue {
 key:string;id:number;tick:number;until:number;kind:CombatCueKind;position:Point;
 weapon?:string;armor?:CombatArmor;cover:boolean;anchor?:number;effects:readonly string[];
}
export interface ProjectileTrace {id:number;owner:number;weapon:string;effect?:string;samples:ReadonlyArray<{tick:number;position:Point}>}
type Event=PlayerSnapshot['events'][number];
const duration:Record<CombatCueKind,number>={muzzle:6,'interceptor-launch':10,impact:12,hit:14,intercepted:30,decoy:30,destroyed:32};
const point=(p:Point|undefined)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x,y:p.y}:undefined;

/** No current/prior actor lookup can recreate a redacted hit, weapon or victim. */
export function combatCue(event:Event,snapshot:PlayerSnapshot,catalog:CatalogIndex):CombatCue|undefined {
 const position=point(event.position);if(!position||!Number.isSafeInteger(event.id)||event.id<=0||!Number.isSafeInteger(event.tick)||event.tick<0||event.tick>snapshot.tick)return;
 if(event.scope==='owner'&&event.owner!==snapshot.player)return;
 if(event.scope==='team'&&event.owner!==snapshot.player){const us=snapshot.players.find(p=>p.id===snapshot.player),them=snapshot.players.find(p=>p.id===event.owner);if(!us||!them||us.team!==them.team)return}
 let kind:CombatCueKind,effects:string[]=[];
 const facts=combatFacts(event,snapshot,catalog);
 if(event.kind==='weapon_fired'){kind='muzzle';if(facts.weapon&&catalog.weapons.has(facts.weapon))effects=[`fx.weapon_muzzle.${facts.weapon}`]}
 else if(event.kind==='interceptor_fired')kind='interceptor-launch';
 else if(event.kind==='impact'){
  kind=facts.hit?'hit':'impact';
  const splash=facts.weapon==='SATURATION'||facts.weapon==='SKYBREAKER'?2000:catalog.weapons.get(facts.weapon??'')?.splash;
  effects=[facts.hit?`fx.impact.hit_${facts.targetArmor}`:splash===2000?'fx.explosion.blast_radius_2':splash===1500?'fx.explosion.blast_radius_1_5':'fx.explosion.small'];
  if(facts.coverMitigated)effects.push('fx.impact.cover_mitigated');
 }else if(event.kind==='missile_intercepted'){kind='intercepted';effects=['fx.impact.intercepted_missile']}
 else if(event.kind==='decoy_triggered'){kind='decoy';effects=['fx.impact.decoy_defeat']}
 else if(event.kind==='destroyed'){kind='destroyed';effects=['fx.explosion.small']}
 else return;
 const until=event.tick+duration[kind];if(until<=snapshot.tick)return;
 const entity=snapshot.entities.find(e=>e.id===event.entity&&e.health>0&&e.state!=='destroyed'&&!e.private?.container);
 // Interception position is a disclosed warning point, never a physical missile
 // interception endpoint; it therefore cannot attach to the event's entity.
 const anchor=kind==='hit'?facts.target:['muzzle','interceptor-launch','decoy'].includes(kind)?entity?.id:undefined;
 return {key:`${snapshot.player}:${event.id}`,id:event.id,tick:event.tick,until,kind,position,weapon:facts.weapon,armor:facts.targetArmor,cover:facts.coverMitigated,anchor,effects};
}

/** Tick-bounded presentation history. A replacement snapshot is a baseline,
 * never a request to replay its buffered effects. No wall clock or random state. */
export class CombatTimeline {
 private player?:number;private tick=-1;private highWater=0;private cues:CombatCue[]=[];
 private traces=new Map<number,ProjectileTrace>();
 get values():readonly CombatCue[]{return this.cues}
 get projectiles():readonly ProjectileTrace[]{return [...this.traces.values()]}
 reset(snapshot?:PlayerSnapshot){this.cues=[];this.traces.clear();this.player=snapshot?.player;this.tick=snapshot?.tick??-1;this.highWater=snapshot?this.watermark(snapshot):0}
 private watermark(snapshot:PlayerSnapshot){let max=0;for(const e of snapshot.events)if(e.tick<=snapshot.tick&&Number.isSafeInteger(e.id))max=Math.max(max,e.id);return max}
 sync(snapshot:PlayerSnapshot,catalog:CatalogIndex,bodies:readonly TacticalProjectile[]=[],replace=false){
  const reset=replace||this.player===undefined||snapshot.player!==this.player||snapshot.tick<this.tick||snapshot.tick-this.tick>40;
  if(reset)this.reset(snapshot);
  const live=new Set(snapshot.entities.filter(e=>e.health>0&&e.state!=='destroyed'&&!e.private?.container).map(e=>e.id));
  this.cues=this.cues.filter(cue=>cue.until>snapshot.tick&&(cue.anchor===undefined||live.has(cue.anchor)));
  if(!reset){
   const events=snapshot.events.filter(event=>Number.isSafeInteger(event.id)&&Number.isSafeInteger(event.tick)&&event.tick>=0&&event.tick<=snapshot.tick&&event.id>this.highWater).sort((a,b)=>a.id-b.id);
   for(const event of events){if(event.id<=this.highWater)continue;this.highWater=event.id;const cue=combatCue(event,snapshot,catalog);if(cue)this.cues.push(cue)}
  }
  const next=new Map<number,ProjectileTrace>();
  for(const body of bodies){
   const position=point(body.bodyPosition);if(!position)continue;
   const previous=this.traces.get(body.id),compatible=previous?.owner===body.owner&&previous.weapon===body.weapon;
   const samples=compatible?previous!.samples.filter(sample=>sample.tick>snapshot.tick-6).map(sample=>({tick:sample.tick,position:{...sample.position}})):[];
   const last=samples.at(-1);
   if(last?.tick===snapshot.tick)last.position=position;else samples.push({tick:snapshot.tick,position});
   next.set(body.id,{id:body.id,owner:body.owner,weapon:body.weapon,effect:body.bodyEffect,samples:samples.slice(-4)});
  }
  this.traces=next;this.player=snapshot.player;this.tick=snapshot.tick;
 }
}
