import {RuntimeError} from '../runtime/errors';
import type {GameMap,Point} from '../runtime/types';

export type EnvironmentDirection=0|1|2|3;
export interface EnvironmentObjectSkin {readonly object_id:number;readonly asset:string;readonly direction:EnvironmentDirection}
export interface EnvironmentPlacement {readonly id:string;readonly asset:string;readonly position:Readonly<Point>;readonly direction:EnvironmentDirection;readonly state:string}
export interface MapEnvironment {
 readonly schema:'fc-map-environment/1';
 readonly map:Readonly<{id:string;version:string;sha256:string}>;
 readonly object_skins:readonly EnvironmentObjectSkin[];
 readonly placements:readonly EnvironmentPlacement[];
}
interface PropRule {size:readonly [number,number];kind:'solid'|'scrub'|'bridge';opaque?:boolean;states:readonly string[]}
// Presentation bounds from the completed prop specifications, not Go collision
// sizes. Solid dressing additionally needs a 500 mt margin on every side.
const PROPS:Readonly<Record<string,PropRule>>={
 'prop.palm':{size:[1400,1400],kind:'solid',states:['idle']},
 'prop.forest_edge_scrub':{size:[2000,1400],kind:'scrub',states:['idle']},
 'prop.fence_chainlink':{size:[1600,220],kind:'solid',states:['idle']},
 'prop.concrete_barrier':{size:[1400,480],kind:'solid',states:['idle']},
 'prop.container_stack':{size:[2000,2000],kind:'solid',opaque:true,states:['idle']},
 'prop.fuel_tanks':{size:[2000,2000],kind:'solid',opaque:true,states:['idle']},
 'prop.power_pylon':{size:[1000,1000],kind:'solid',states:['idle']},
 'prop.decor_building_nongarrison':{size:[2000,2000],kind:'solid',opaque:true,states:['intact']},
 'prop.bridge_permanent':{size:[1000,1000],kind:'bridge',states:['deck','edge_left','edge_right','idle']},
 'prop.wreck_decor_vehicle':{size:[1600,1100],kind:'solid',states:['idle']},
 'prop.relay_objective':{size:[1500,1500],kind:'solid',opaque:true,states:['idle']},
 'prop.command_relay_objective':{size:[2300,2300],kind:'solid',opaque:true,states:['idle']},
 'prop.depot_objective':{size:[3000,3000],kind:'solid',opaque:true,states:['idle']},
};
const SKINS:Readonly<Record<string,readonly string[]>>={light_prop:['prop.destructible_wall_hp_light'],heavy_prop:['prop.destructible_wall_hp_heavy'],garrison:['prop.warehouse_garrisonable','prop.ruined_house_garrisonable']};
function fail(message:string):never{throw new RuntimeError('environment_invalid',message)}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function shape(value:unknown,keys:string[],where:string):asserts value is Record<string,unknown>{if(!record(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))fail(`${where} has missing or unsupported fields.`)}
function list(value:unknown,max:number,where:string):unknown[]{if(!Array.isArray(value)||value.length>max)fail(`${where} exceeds its supported size.`);return value as unknown[]}
function text(value:unknown,max:number,where:string):string{if(typeof value!=='string'||!value.length||value.length>max||/[\p{Cc}\p{Cf}]/u.test(value))fail(`${where} is invalid.`);return value as string}
function direction(value:unknown):EnvironmentDirection{if(!Number.isInteger(value)||Number(value)<0||Number(value)>3)fail('Prop direction must be a quarter-turn index from 0 to 3.');return value as EnvironmentDirection}
function point(value:unknown,map:GameMap):Readonly<Point>{shape(value,['x','y'],'Prop position');if(!Number.isSafeInteger(value.x)||!Number.isSafeInteger(value.y)||Number(value.x)<0||Number(value.y)<0||Number(value.x)>=map.width*1000||Number(value.y)>=map.height*1000)fail('Prop position must be an in-bounds integer map point.');return Object.freeze({x:Number(value.x),y:Number(value.y)})}
function cells(map:GameMap,p:Point,size:readonly [number,number],margin=0):number[]{
 const minX=Math.floor((p.x-size[0]/2-margin)/1000),minY=Math.floor((p.y-size[1]/2-margin)/1000),maxX=Math.ceil((p.x+size[0]/2+margin)/1000)-1,maxY=Math.ceil((p.y+size[1]/2+margin)/1000)-1;
 if(minX<0||minY<0||maxX>=map.width||maxY>=map.height)fail('A prop footprint or safety margin extends outside the map.');
 const result:number[]=[];for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)result.push(y*map.width+x);return result;
}
function rotated(size:readonly [number,number],d:EnvironmentDirection):readonly [number,number]{return d%2?[size[1],size[0]]:size}
function validateBridge(map:GameMap,p:EnvironmentPlacement){
 if(p.position.x%1000!==500||p.position.y%1000!==500)fail('Bridge modules must be centered on a map tile.');
 const x=Math.floor(p.position.x/1000),y=Math.floor(p.position.y/1000),tile=(x:number,y:number)=>x>=0&&y>=0&&x<map.width&&y<map.height?map.tiles[y*map.width+x]:undefined;
 const center=tile(x,y)!;if(center.terrain!=='road')fail('Bridge decks require an existing public road tile; they never add a crossing.');
 // Model edge_left is local Blender -Y, hence sim +Y before rotation.
 const left=([{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:0}] as const)[p.direction];
 for(const side of [-1,1]){
  let water=false;for(let step=1;step<=32;step++){const neighbor=tile(x+left.x*side*step,y+left.y*side*step);if(!neighbor||neighbor.height!==center.height)break;if(neighbor.terrain==='water'){water=true;break}if(neighbor.terrain!=='road')break}
  if(!water)fail('A bridge cross-section must be continuous same-height road bracketed by public water.');
 }
 for(const [rail,side] of [['edge_left',1],['edge_right',-1]] as const)if(p.state===rail||p.state==='idle'){
  const neighbor=tile(x+left.x*side,y+left.y*side);if(neighbor?.terrain!=='water')fail('A bridge rail would block the appearance of a legal neighboring road lane.');
 }
}
function validatePlacement(map:GameMap,p:EnvironmentPlacement):number[]{
 const rule=Object.hasOwn(PROPS,p.asset)?PROPS[p.asset]:undefined;if(!rule||!rule.states.includes(p.state))fail('This asset/state is not permitted as static public map dressing.');
 const indices=cells(map,p.position,rotated(rule.size,p.direction),rule.kind==='solid'?500:0),height=map.tiles[indices[0]].height;
 if(indices.some(i=>map.tiles[i].height!==height))fail('Static prop support must be level across its complete visual footprint.');
 if(rule.kind==='bridge'){validateBridge(map,p);return indices}
 if(indices.some(i=>map.tiles[i].mandatory))fail('Static dressing must leave mandatory corridors clear.');
 if(rule.kind==='scrub'){
  if(indices.some(i=>!['cover','rubble'].includes(map.tiles[i].terrain)))fail('Forest-edge dressing requires existing cover or rubble terrain.');
 }else if(indices.some(i=>!['blocked','cliff'].includes(map.tiles[i].terrain)||rule.opaque&&map.tiles[i].terrain!=='cliff'&&!map.tiles[i].sight_blocker))fail('Solid scenery needs an already impassable footprint and margin; opaque masses also need actual sight blocking.');
 return indices;
}
/** Strict optional presentation decoding. The caller verifies sidecar bytes and
 * exact installed map bytes; this checks the declared map binding again. No
 * placement can add a Go terrain/object/gameplay rule. */
export function decodeMapEnvironment(bytes:Uint8Array,map:GameMap,context:{mapSHA256:string}):MapEnvironment{
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>(1<<20))fail('Environment presentation must be nonempty and at most 1 MiB.');
 let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{fail('Environment presentation is not valid UTF-8 JSON.')}
 shape(value,['schema','map','object_skins','placements'],'Environment presentation');if(value.schema!=='fc-map-environment/1')fail('This environment presentation version is unsupported.');
 shape(value.map,['id','version','sha256'],'Environment map binding');
 const binding={id:text(value.map.id,80,'Map ID'),version:text(value.map.version,80,'Map version'),sha256:text(value.map.sha256,64,'Map hash')};
 if(!/^[a-f0-9]{64}$/.test(binding.sha256)||!/^[a-f0-9]{64}$/.test(context.mapSHA256))fail('Environment map binding needs a lowercase SHA-256.');
 if(binding.id!==map.id||binding.version!==map.version||binding.sha256!==context.mapSHA256)throw new RuntimeError('environment_map_mismatch','Environment presentation belongs to different map bytes. The gameplay map can still be used without this optional dressing.');
 const objects=new Map((map.objects??[]).map(o=>[o.id,o])),bound=new Set<number>();
 const object_skins=list(value.object_skins,512,'Object skins').map(raw=>{
  shape(raw,['object_id','asset','direction'],'Object skin');const id=Number(raw.object_id),object=objects.get(id),asset=text(raw.asset,100,'Object skin asset');
  if(!Number.isSafeInteger(raw.object_id)||!object||bound.has(id)||!SKINS[object.class]?.includes(asset))fail('An object skin is duplicate, missing or incompatible with the existing Go object class.');bound.add(id);
  return Object.freeze({object_id:id,asset,direction:direction(raw.direction)});
 });
 const ids=new Set<string>(),occupied=new Set<number>();
 const placements=list(value.placements,2048,'Environment placements').map(raw=>{
  shape(raw,['id','asset','position','direction','state'],'Environment placement');const id=text(raw.id,80,'Placement ID');if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)||ids.has(id))fail('Placement IDs must be unique bounded ASCII identifiers.');ids.add(id);
  const p=Object.freeze({id,asset:text(raw.asset,100,'Prop asset'),position:point(raw.position,map),direction:direction(raw.direction),state:text(raw.state,32,'Prop state')});
  const indices=validatePlacement(map,p);if(indices.some(i=>occupied.has(i)))fail('Environment placements or their conservative margins overlap.');for(const i of indices)occupied.add(i);return p;
 });
 return Object.freeze({schema:'fc-map-environment/1',map:Object.freeze(binding),object_skins:Object.freeze(object_skins),placements:Object.freeze(placements)});
}
export function environmentAssetIds(environment:MapEnvironment):readonly string[]{return [...new Set([...environment.object_skins,...environment.placements].map(p=>p.asset))].sort()}
