import type {CatalogIndex} from '../content/catalog';
import type {CommandRequest} from '../runtime/command-intent';
import type {EntityBounds,Rect} from '../runtime/interaction';
import type {Entity,GameMap,PlayerSnapshot} from '../runtime/types';

const NON_ARMY_ROLES=new Set(['hauler','engineer','rig','repair','medic','support_plane']);
function available(snapshot:PlayerSnapshot,requireEnabled=true):Entity[]{
 if(!Number.isInteger(snapshot.player)||snapshot.player<=0)return [];
 return snapshot.entities.filter(entity=>entity.owner===snapshot.player&&Number.isInteger(entity.id)&&entity.id>0&&entity.id<=0xffffffff&&entity.private&&entity.private.hp>0n&&!entity.private.container&&entity.complete&&(!requireEnabled||entity.enabled)&&entity.position&&Number.isInteger(entity.position.x)&&Number.isInteger(entity.position.y)).sort((a,b)=>a.id-b.id);
}
function intersects(a:Rect,b:Rect):boolean{
 if(![a.left,a.top,a.right,a.bottom,b.left,b.top,b.right,b.bottom].every(Number.isFinite))return false;
 return Math.min(a.left,a.right)<=Math.max(b.left,b.right)&&Math.max(a.left,a.right)>=Math.min(b.left,b.right)&&Math.min(a.top,a.bottom)<=Math.max(b.top,b.bottom)&&Math.max(a.top,a.bottom)>=Math.min(b.top,b.bottom);
}

/** Selection convenience only; weapon capabilities and order legality remain Go-owned. */
export function armyIDs(snapshot:PlayerSnapshot,catalog:CatalogIndex,viewport?:Rect,bounds?:EntityBounds):number[]{
 return available(snapshot).filter(entity=>{
  const unit=catalog.units.get(entity.type);
  if(!unit||!unit.weapon||NON_ARMY_ROLES.has(unit.role)||entity.private!.shahedCommitted)return false;
  if(!viewport)return true;
  const rect=bounds?bounds(entity):{left:entity.position!.x,right:entity.position!.x,top:entity.position!.y,bottom:entity.position!.y};
  return !!rect&&intersects(viewport,rect);
 }).map(entity=>entity.id);
}

/** Explicit idle owner state only: never infer idleness from a remembered field or cargo. */
export function idleWorkerIDs(snapshot:PlayerSnapshot,catalog:CatalogIndex):number[]{
 return available(snapshot).filter(entity=>{
  const role=catalog.units.get(entity.type)?.role,own=entity.private!;
  if(role!=='hauler'&&role!=='engineer'&&role!=='rig'||entity.channelUntil>snapshot.tick||own.retreating)return false;
  if(entity.state==='idle')return own.orders.length===0;
  // A gather order remains installed when no known supplies/depot are available.
  // Other blocked/moving/gathering orders may still recover and are not idle.
  return role==='hauler'&&['no_known_supplies','no_supply_center'].includes(entity.state)&&own.orders.length<=1&&own.orders.every(order=>order.kind==='gather');
 }).map(entity=>entity.id);
}

export function baseIDs(snapshot:PlayerSnapshot,catalog:CatalogIndex):number[]{
 return available(snapshot,false).filter(entity=>['hq','outpost'].includes(catalog.buildings.get(entity.type)?.role??'')).map(entity=>entity.id);
}

const SCATTER_OFFSETS=[[-2000,-2000],[0,-2500],[2000,-2000],[2500,0],[2000,2000],[0,2500],[-2000,2000],[-2500,0]] as const;
/** Local input intents, not simulated movement. Send each through planCommand's Go preview. */
export function scatterRequests(snapshot:PlayerSnapshot,ids:readonly number[],map:Pick<GameMap,'width'|'height'>,catalog:CatalogIndex):CommandRequest[]{
 if(!Number.isInteger(map.width)||!Number.isInteger(map.height)||map.width<1||map.height<1||map.width*1000>0x7fffffff||map.height*1000>0x7fffffff)return [];
 const selected=new Set(ids),maxX=map.width*1000-1,maxY=map.height*1000-1;
 return available(snapshot).filter(entity=>{
  const unit=catalog.units.get(entity.type);
  return selected.has(entity.id)&&!!unit&&unit.speed>0&&unit.role!=='support_plane'&&!entity.private!.shahedCommitted;
 }).map<CommandRequest>(entity=>{
  const [dx,dy]=SCATTER_OFFSETS[(entity.id-1)%SCATTER_OFFSETS.length],position=entity.position!;
  const clamp=(x:number,y:number)=>({x:Math.max(0,Math.min(maxX,x)),y:Math.max(0,Math.min(maxY,y))});
  let target=clamp(position.x+dx,position.y+dy);
  // At a corner the outward offset can collapse to the current point.
  if(target.x===position.x&&target.y===position.y)target=clamp(position.x-dx,position.y-dy);
  return {kind:'move',entities:[entity.id],target:{kind:'ground',position:target}};
 });
}
