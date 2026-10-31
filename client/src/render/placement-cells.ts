import type {GameMap,Point} from '../runtime/types';

/** Presentation-only estimate of which footprint cells look blocked, from the
 * public map, the current authorized visibility and visible entities. Go's
 * preview remains authoritative; this only colours cells while it is pending
 * and explains *where* a rejected site conflicts. */
export interface PlacementCell {x:number;y:number;blocked:boolean}
export interface PlacementAssessment {cells:PlacementCell[];anyBlocked:boolean}
interface Footprint {position?:Point;footprintWidth:number;footprintHeight:number;health:number}
const IMPASSABLE=new Set(['cliff','water','blocked']);

export function assessPlacement(map:Pick<GameMap,'width'|'height'|'tiles'|'fields'>,center:Point,width:number,height:number,visible:ArrayLike<boolean>|undefined,buildings:readonly Footprint[],stations:readonly {position?:Point}[]=[]):PlacementAssessment{
 const left=center.x-width*500,top=center.y-height*500,cells:PlacementCell[]=[];let anyBlocked=false;
 const fields=(map.fields??[]).map(f=>f.position).concat(stations.flatMap(s=>s.position?[s.position]:[]));
 for(let j=0;j<height;j++)for(let i=0;i<width;i++){
  const cx=left+i*1000+500,cy=top+j*1000+500,tx=Math.floor(cx/1000),ty=Math.floor(cy/1000);
  let blocked=cx-500<0||cy-500<0||cx+500>map.width*1000||cy+500>map.height*1000;
  if(!blocked){
   const tile=map.tiles[ty*map.width+tx];
   blocked=!tile||IMPASSABLE.has(tile.terrain)||!!tile.mandatory||(visible!==undefined&&!visible[ty*map.width+tx]);
  }
  // A cell whose centre lies inside a visible building footprint is occupied.
  if(!blocked)for(const b of buildings){
   if(b.position&&b.health>0&&Math.abs(cx-b.position.x)<b.footprintWidth*500&&Math.abs(cy-b.position.y)<b.footprintHeight*500){blocked=true;break}
  }
  // One-tile access margin around supply fields, stations and the shipment site.
  if(!blocked)for(const f of fields)if(Math.abs(cx-f.x)<1500&&Math.abs(cy-f.y)<1500){blocked=true;break}
  cells.push({x:cx,y:cy,blocked});anyBlocked ||= blocked;
 }
 return {cells,anyBlocked};
}
