import type {GameMap,PlayerSnapshot,Point} from '../runtime/types';
import type {MapEnvironment} from '../content/environment';
import {authoredArtId} from './art-id';

export interface EnvironmentItem {
 key:string;kind:'field'|'station'|'shipment'|'rubble'|'dressing';id:number;position:Point;asset:string;state:string;
 direction?:0|1|2|3;owner?:number;remembered:boolean;visible:boolean;remaining?:bigint;
}
/** Presentation memory stores only facts already disclosed to this perspective.
 * It never reads engine saves or predicts hidden harvesting/capture/destruction. */
export class EnvironmentKnowledge {
 private tick=-1;private player=-1;private fields=new Map<string,EnvironmentItem>();private stations=new Map<string,EnvironmentItem>();
 constructor(private readonly map:GameMap,private readonly environment?:MapEnvironment){}
 clear(){this.tick=-1;this.player=-1;this.fields.clear();this.stations.clear()}
 sync(snapshot:PlayerSnapshot):EnvironmentItem[]{
  if(snapshot.tick<this.tick||snapshot.player!==this.player)this.clear();this.tick=snapshot.tick;this.player=snapshot.player;
  const tile=(p:Point)=>Math.floor(p.y/1000)*this.map.width+Math.floor(p.x/1000),seen=(p:Point)=>!!snapshot.visible[tile(p)],explored=(p:Point)=>!!snapshot.explored[tile(p)];
  const dynamic=new Map<string,typeof snapshot.fields[number]>();
  for(const field of snapshot.fields){
   if(!field.position||!seen(field.position))continue;
   const initial=this.map.fields.find(f=>f.id===field.id&&f.position.x===field.position!.x&&f.position.y===field.position!.y);
   if(!initial){const key=`field-at:${field.position.x}:${field.position.y}`,prior=dynamic.get(key);if(!prior||field.remaining>0n&&prior.remaining<=0n||(field.remaining>0n)===(prior.remaining>0n)&&field.id>prior.id)dynamic.set(key,field);continue}
   const capacity=BigInt(initial.credits),state=field.remaining<=0n?'depleted':field.remaining*4n<capacity?'low':field.remaining*4n<capacity*3n?'high':'full';
   this.fields.set(`field:${field.id}`,{key:`field:${field.id}`,kind:'field',id:field.id,position:{...field.position},asset:'prop.supply_field',state,remaining:field.remaining,visible:true,remembered:false});
  }
  for(const [key,field] of dynamic){
   // A shipment is a disclosed field, not an inferred timer. Its initial
   // capacity is absent from the snapshot, so "high" means available cargo.
   this.fields.set(key,{key,kind:'field',id:field.id,position:{...field.position!},asset:'prop.supply_field',state:field.remaining>0n?'high':'depleted',remaining:field.remaining,visible:true,remembered:false});
  }
  // Go allocates runtime station IDs independently of map station IDs. The
  // fixed public position is the presentation key; the record retains the
  // authorized runtime ID for diagnostics and the normal order target.
  for(const station of snapshot.stations)if(station.position&&seen(station.position))this.stations.set(`${station.position.x}:${station.position.y}`,{key:`station-at:${station.position.x}:${station.position.y}`,kind:'station',id:station.id,position:{...station.position},asset:'prop.supply_station_neutral',state:'idle',owner:station.owner,visible:true,remembered:false});
  const result:EnvironmentItem[]=[];
  for(const field of this.map.fields)if(!this.fields.has(`field:${field.id}`)&&explored(field.position))result.push({key:`field:${field.id}`,kind:'field',id:field.id,position:{...field.position},asset:'prop.supply_field',state:'unknown',visible:true,remembered:true});
  for(const station of this.map.stations??[])if(!this.stations.has(`${station.position.x}:${station.position.y}`)&&explored(station.position))result.push({key:`station-at:${station.position.x}:${station.position.y}`,kind:'station',id:station.id,position:{...station.position},asset:'prop.supply_station_neutral',state:'idle',visible:true,remembered:true});
  for(const item of [...this.fields.values(),...this.stations.values()])result.push({...item,visible:explored(item.position),remembered:!seen(item.position)});
  if(explored(this.map.shipment))result.push({key:'shipment-site',kind:'shipment',id:0,position:{...this.map.shipment},asset:'prop.central_shipment_site',state:'idle',visible:true,remembered:!seen(this.map.shipment)});
  for(const p of this.environment?.placements??[])if(explored(p.position))result.push({key:`dressing:${p.id}`,kind:'dressing',id:0,asset:p.asset,position:{...p.position},direction:p.direction,state:p.state,visible:true,remembered:!seen(p.position)});
  const skins=new Map(this.environment?.object_skins.map(s=>[s.object_id,s]));
  const known=new Set(snapshot.rubble);for(const object of this.map.objects??[])if(known.has(object.id))result.push({key:`rubble:${object.id}`,kind:'rubble',id:object.id,position:{...object.position},asset:skins.get(object.id)?.asset??authoredArtId(`map.${object.class}`)!,direction:skins.get(object.id)?.direction,state:'destroyed',visible:explored(object.position),remembered:!seen(object.position)});
  return result.sort((a,b)=>a.key.localeCompare(b.key));
 }
}
