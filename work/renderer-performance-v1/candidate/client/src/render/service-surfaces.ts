import {RuntimeError} from '../runtime/errors';
import type {Point} from '../runtime/types';

export interface ServiceSurface {
 readonly id:string;
 readonly polygon_mt:readonly (readonly [number,number])[];
 readonly z_bu:number;
 readonly lift_2x_px:number;
}
export interface ServiceSurfaces {
 readonly schema:'fc-service-surfaces/1';
 readonly coordinates:'local_sim_mt';
 readonly surfaces:readonly ServiceSurface[];
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function fail(message:string):never{throw new RuntimeError('art_service_surface_invalid',message)}
function shape(value:unknown,keys:readonly string[]):asserts value is Record<string,unknown>{if(!record(value)||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)))fail('Service surface metadata has missing or unsupported fields.')}
type Vertex=readonly [number,number];
const orient=(a:Vertex,b:Vertex,c:Vertex)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const onSegment=(a:Vertex,b:Vertex,p:Vertex)=>Math.abs(orient(a,b,p))<1e-7&&p[0]>=Math.min(a[0],b[0])-1e-7&&p[0]<=Math.max(a[0],b[0])+1e-7&&p[1]>=Math.min(a[1],b[1])-1e-7&&p[1]<=Math.max(a[1],b[1])+1e-7;
function intersects(a:Vertex,b:Vertex,c:Vertex,d:Vertex){
 const abC=orient(a,b,c),abD=orient(a,b,d),cdA=orient(c,d,a),cdB=orient(c,d,b);
 return abC*abD<0&&cdA*cdB<0||abC===0&&onSegment(a,b,c)||abD===0&&onSegment(a,b,d)||cdA===0&&onSegment(c,d,a)||cdB===0&&onSegment(c,d,b);
}
/** Exact camera contract: tile64px at1x, Blender30° elevation. Not Go altitude. */
export function serviceSurfaceLift2x(zBU:number){return zBU*128/Math.sqrt(2)*Math.cos(Math.PI/6)}
/** Optional art contract, independent of gameplay state. Currently prepared for
 * reviewed service art; no shipping source is implicitly given a roof/pad. */
export function decodeServiceSurfaces(value:unknown,footprint:readonly [number,number]):ServiceSurfaces{
 if(footprint.length!==2||footprint.some(size=>!Number.isSafeInteger(size)||size<1||size>20))fail('Service art requires its retained physical footprint.');
 shape(value,['schema','coordinates','surfaces']);if(value.schema!=='fc-service-surfaces/1'||value.coordinates!=='local_sim_mt')fail('Unsupported service surface coordinates or version.');
 if(!Array.isArray(value.surfaces)||value.surfaces.length<1||value.surfaces.length>8)fail('Service art requires one to eight bounded support polygons.');
 const ids=new Set<string>();
 const surfaces=value.surfaces.map(raw=>{
  shape(raw,['id','polygon_mt','z_bu','lift_2x_px']);
  if(typeof raw.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(raw.id)||ids.has(raw.id))fail('Service surface IDs must be unique bounded identifiers.');ids.add(raw.id);
  if(typeof raw.z_bu!=='number'||!Number.isFinite(raw.z_bu)||raw.z_bu<0||raw.z_bu>.5||typeof raw.lift_2x_px!=='number'||!Number.isFinite(raw.lift_2x_px)||Math.abs(raw.lift_2x_px-serviceSurfaceLift2x(raw.z_bu))>1e-6)fail('Service support height must match the source-derived projection.');
  if(!Array.isArray(raw.polygon_mt)||raw.polygon_mt.length<3||raw.polygon_mt.length>16)fail('Service polygons require three to sixteen vertices.');
  const polygon=raw.polygon_mt.map((v:unknown)=>{
   if(!Array.isArray(v)||v.length!==2||!Number.isSafeInteger(v[0])||!Number.isSafeInteger(v[1])||Math.abs(v[0])>footprint[0]*500||Math.abs(v[1])>footprint[1]*500)fail('Service polygon vertices must lie inside the retained physical footprint.');
   return Object.freeze([v[0],v[1]] as [number,number]);
  });
  if(new Set(polygon.map(p=>`${p[0]},${p[1]}`)).size!==polygon.length)fail('Service polygon vertices cannot repeat.');
  let winding=0;
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,turn=Math.sign(orient(a,b,polygon[(i+2)%polygon.length]!));
   if(!turn||winding&&turn!==winding)fail('Service polygons must be strictly convex.');winding=turn;
   for(let j=i+1;j<polygon.length;j++){if(j===i+1||i===0&&j===polygon.length-1)continue;if(intersects(a,b,polygon[j]!,polygon[(j+1)%polygon.length]!))fail('Service polygon edges cannot cross or touch.');}
  }
  return Object.freeze({id:raw.id,polygon_mt:Object.freeze(polygon),z_bu:raw.z_bu,lift_2x_px:raw.lift_2x_px});
 });
 return Object.freeze({schema:'fc-service-surfaces/1',coordinates:'local_sim_mt',surfaces:Object.freeze(surfaces)});
}
/** Highest actual supporting plane. Undefined outside every polygon means use
 * the aircraft's own ground, including its terrain height, without deck lift. */
export function serviceSurfaceAt(data:ServiceSurfaces,point:Readonly<Point>):ServiceSurface|undefined{
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return undefined;
 let highest:ServiceSurface|undefined;const p:Vertex=[point.x,point.y];
 for(const surface of data.surfaces){
  let sign=0,inside=true;
  for(let i=0;i<surface.polygon_mt.length;i++){
   const a=surface.polygon_mt[i]!,b=surface.polygon_mt[(i+1)%surface.polygon_mt.length]!;if(onSegment(a,b,p))continue;
   const side=Math.sign(orient(a,b,p));if(side&&sign&&side!==sign){inside=false;break}if(side)sign=side;
  }
  if(inside&&(!highest||surface.z_bu>highest.z_bu))highest=surface;
 }
 return highest;
}
