import type {CatalogIndex} from '../content/catalog';
import type {Entity,GameMap,PlayerSnapshot,Point} from '../runtime';

export interface AmbientCue {
 key:string;effect:string;position:Point;elapsed:number;anchor?:number;
 attachment:'actor'|'ground';maxAltitude?:number;
}
interface Burst extends Omit<AmbientCue,'elapsed'> {tick:number;until:number;visibleOnly:boolean}
const validPoint=(p:Point|undefined):p is Point=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const alive=(e:Entity)=>e.health>0&&e.state!=='destroyed'&&!e.private?.container&&validPoint(e.position);
const compatible=(a:Entity|undefined,b:Entity):a is Entity=>!!a&&a.type===b.type&&a.owner===b.owner&&alive(a);

/** Cosmetic state only. Holds one immediately preceding permitted snapshot,
 * never a hidden actor, inferred resource balance or wall-clock timer. */
export class AmbientTimeline {
 private previous?:PlayerSnapshot;private highWater=0;private bursts:Burst[]=[];
 private moving=new Set<number>();private building=new Set<number>();private cues:AmbientCue[]=[];
 constructor(private map:Pick<GameMap,'width'|'height'>){}
 get values():readonly AmbientCue[]{return this.cues}
 reset(){this.previous=undefined;this.highWater=0;this.bursts=[];this.moving.clear();this.building.clear();this.cues=[]}
 private visible(p:Point,s:PlayerSnapshot){const x=Math.floor(p.x/1000),y=Math.floor(p.y/1000);return x>=0&&y>=0&&x<this.map.width&&y<this.map.height&&!!s.visible[y*this.map.width+x]}
 sync(snapshot:PlayerSnapshot,catalog:CatalogIndex,replace=false){
  const old=this.previous,reset=replace||!old||old.player!==snapshot.player||snapshot.tick<old.tick||snapshot.tick-old.tick>40;
  if(reset)this.reset();
  const previous=new Map((reset?[]:old!.entities).map(entity=>[entity.id,entity]));
  const advanced=!reset&&snapshot.tick>old!.tick;
  if(reset||advanced){this.moving.clear();this.building.clear()}
  if(advanced)for(const e of snapshot.entities){
   const prior=previous.get(e.id);if(!alive(e)||!compatible(prior,e)||!e.position||!prior.position)continue;
   const unit=catalog.units.get(e.type),distance=Math.hypot(e.position.x-prior.position.x,e.position.y-prior.position.y);
   if(unit&&unit.armor!=='infantry'&&unit.armor!=='air'&&distance>1&&distance<=unit.speed*(snapshot.tick-old!.tick)/20+100)this.moving.add(e.id);
   if(catalog.buildings.has(e.type)&&!e.complete&&e.progress>prior.progress)this.building.add(e.id);
  }
  const allowed=(event:PlayerSnapshot['events'][number])=>{
   if(event.scope==='all'||event.scope==='visible')return true;
   if(event.scope==='owner')return event.owner===snapshot.player;
   if(event.scope==='team'){const us=snapshot.players.find(p=>p.id===snapshot.player),them=snapshot.players.find(p=>p.id===event.owner);return !!us&&!!them&&us.team===them.team}
   return false;
  };
  // Replacements establish state, never replay buffered transition effects.
  const events=snapshot.events.filter(event=>Number.isSafeInteger(event.id)&&event.id>this.highWater&&Number.isSafeInteger(event.tick)&&event.tick>=0&&event.tick<=snapshot.tick).sort((a,b)=>a.id-b.id);
  for(const event of events){
   if(event.id<=this.highWater)continue;this.highWater=event.id;
   if(reset||!allowed(event)||!validPoint(event.position))continue;
   let effect:string|undefined,duration=0,visibleOnly=false;
   if(event.kind==='building_sold'){effect='fx.building.sell_dust';duration=36}
   else if(event.kind==='shipment_arrived'){effect='fx.environment.shipment_arrival';duration=40}
   else if(event.kind==='station_captured'){effect='fx.environment.supply_station_capture';duration=36}
   else if(event.kind==='destroyed'){
    const entity=previous.get(event.entity),unit=entity&&catalog.units.get(entity.type);
    // Only an identified, last-frame ground vehicle supports a wreck plume.
    // An aircraft death does not imply an undisclosed ground crash location.
    if(entity&&entity.owner===event.owner&&alive(entity)&&unit&&unit.armor!=='infantry'&&unit.armor!=='air'){
     effect='fx.unit.wreck_smoke';duration=80;visibleOnly=true;
    }
   }
   if(effect&&event.tick+duration>snapshot.tick)this.bursts.push({key:`event:${snapshot.player}:${event.id}`,effect,position:{...event.position},attachment:'ground',tick:event.tick,until:event.tick+duration,visibleOnly});
  }
  if(advanced){
   const fields=new Map(old!.fields.map(field=>[field.id,field]));
   for(const field of snapshot.fields){const prior=fields.get(field.id);
    if(prior&&prior.remaining>0n&&field.remaining===0n&&validPoint(field.position)&&validPoint(prior.position)&&field.position.x===prior.position.x&&field.position.y===prior.position.y&&this.visible(field.position,snapshot)&&this.visible(prior.position,old!))
     this.bursts.push({key:`field:${snapshot.player}:${field.id}:${snapshot.tick}`,effect:'fx.environment.depletion_dust',position:{...field.position},attachment:'ground',tick:snapshot.tick,until:snapshot.tick+30,visibleOnly:true});
   }
  }
  this.bursts=this.bursts.filter(burst=>burst.until>snapshot.tick&&(!burst.visibleOnly||this.visible(burst.position,snapshot)));
  const cues:AmbientCue[]=this.bursts.map(({tick,until,visibleOnly,...cue})=>({...cue,elapsed:snapshot.tick-tick}));
  for(const e of snapshot.entities){
   if(!alive(e)||!e.position)continue;
   const unit=catalog.units.get(e.type),building=catalog.buildings.get(e.type);
   const add=(effect:string,attachment:'actor'|'ground',maxAltitude?:number)=>cues.push({key:`actor:${snapshot.player}:${e.id}:${effect}`,effect,position:{...e.position!},anchor:e.id,attachment,elapsed:snapshot.tick+e.id%17*7,...maxAltitude===undefined?{}:{maxAltitude}});
   if(building){
    if(!e.complete){if(this.building.has(e.id))add('fx.building.construction_dust','ground')}
    else if(e.state!=='selling'&&e.health<=250)add('fx.building.smoke_critical','actor');
    else if(e.state!=='selling'&&e.health<=500)add('fx.building.fire_damaged','actor');
   }else if(unit){
    if(unit.armor!=='infantry'&&e.health<=250)add('fx.unit.fire_critical','actor');
    else if(unit.armor!=='infantry'&&e.health<=500)add('fx.unit.smoke_damaged','actor');
    if(this.moving.has(e.id))add('fx.unit.dust_trail','ground');
    if(unit.armor==='air'&&!e.landed&&['gunship','airlift','scout_drone'].includes(unit.role))add('fx.unit.rotor_wash','ground',24);
   }
  }
  this.cues=cues;this.previous=snapshot;
 }
}
