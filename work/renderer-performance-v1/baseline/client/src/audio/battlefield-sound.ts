import type {Entity,PlayerSnapshot} from '../protocol/frontline_pb';
import type {GameMap} from '../runtime/types';
import type {Rect} from '../runtime/interaction';
import type {CatalogIndex} from '../content/catalog';
import type {ContinuousSound} from './mixer';
export interface AudioViewport {viewport:Rect;bounds:(entity:Entity)=>Rect|undefined}
/** Public map presentation only; no actors, resource values or hidden state. */
export function ambienceFor(map:GameMap):string {
 const label=`${map.id} ${map.title}`.toLowerCase();
 if(/coast|port/.test(label))return 'sfx.ambient_coastal';
 if(/river/.test(label))return 'sfx.ambient_river';
 if(/highland|ridge|mountain/.test(label))return 'sfx.ambient_highland';
 if(/depot/.test(label))return 'sfx.ambient_depot';
 if(/industrial|factory/.test(label))return 'sfx.ambient_industrial';
 const wet=map.tiles.filter(tile=>tile.terrain==='water').length;
 if(wet>map.tiles.length*.08)return 'sfx.ambient_river';
 if(map.tiles.filter(tile=>(tile.height??0)>0).length>map.tiles.length*.4)return 'sfx.ambient_highland';
 if(map.tiles.filter(tile=>tile.terrain==='urban').length>map.tiles.length*.15)return 'sfx.ambient_industrial';
 return 'sfx.ambient_desert_wind';
}
const overlap=(a:Rect,b:Rect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
/** Closest three currently visible screen actors. Memory markers are never inputs. */
export function battlefieldSounds(snapshot:PlayerSnapshot,catalog:CatalogIndex,view:AudioViewport,ambient:string,paused=false):ContinuousSound[]{
 if(paused||snapshot.outcome?.finished||snapshot.countdown)return [];
 const width=view.viewport.right-view.viewport.left,height=view.viewport.bottom-view.viewport.top;
 if(width<=0||height<=0)return [];
 const cx=(view.viewport.left+view.viewport.right)/2,cy=(view.viewport.top+view.viewport.bottom)/2;
 const candidates=snapshot.entities.flatMap(entity=>{
  const unit=catalog.units.get(entity.type);if(!unit||entity.health<=0||entity.private?.container||!entity.position)return [];
  const rect=view.bounds(entity);if(!rect||!Object.values(rect).every(Number.isFinite)||!overlap(rect,view.viewport))return [];
  const air=unit.armor==='air'&&!entity.landed,moving=['moving','turning','returning_cargo'].includes(entity.state);let id:string|undefined;
  if(air){id=['IR','SY'].includes(unit.faction)?'sfx.drone_prop_loop':['gunship','airlift'].includes(unit.role)?'sfx.rotor_loop':'sfx.jet_pass'}
  else if(moving){id=unit.armor==='infantry'?'sfx.footsteps_squad':unit.role==='rig'?'sfx.engine_rig':unit.role==='hauler'?'sfx.engine_hauler':unit.role==='tank'||unit.armor==='heavy'?'sfx.engine_tracked_heavy':unit.faction==='SY'?'sfx.engine_technical':unit.faction==='SA'?'sfx.engine_8x8':'sfx.engine_wheeled_light'}
  if(!id)return [];const x=(rect.left+rect.right)/2,y=(rect.top+rect.bottom)/2,distance=Math.hypot((x-cx)/(width*.5),(y-cy)/(height*.5));
  return [{key:`actor:${entity.id}`,id,gain:Math.max(.06,.18-distance*.07),pan:Math.max(-.8,Math.min(.8,(x-cx)/(width*.5))),repeatMs:id==='sfx.jet_pass'?8000:0,distance}];
 }).sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key)).slice(0,3);
 return [{key:'map',id:ambient,gain:.07,pan:0},...candidates.map(({distance,...request})=>request)];
}
/** An impact without an authorized identified target remains a ground impact. */
export function impactSound(target:Entity|undefined,catalog:CatalogIndex|undefined):string {
 if(!target||!catalog)return 'sfx.impact_ground';
 if(catalog.buildings.has(target.type)||target.mapObject)return 'sfx.impact_structure';
 const unit=catalog.units.get(target.type);if(!unit||unit.armor==='infantry')return 'sfx.impact_ground';
 return unit.armor==='heavy'||unit.role==='tank'?'sfx.impact_metal_heavy':'sfx.impact_metal_light';
}
