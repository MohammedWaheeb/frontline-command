import type {GameMap,Point} from '../runtime/types';

/** Align the anchor to the footprint supplied by the authoritative catalog.
 * Go still decides whether the footprint is in bounds, clear and reachable. */
export function editorObjectPosition(cell:Point,footprint:{width:number;height:number}):Point{
 return {x:cell.x*1000+(footprint.width%2)*500,y:cell.y*1000+(footprint.height%2)*500};
}

/** Preserve the editor's tile-center corners while keeping Go's inclusive
 * maximum strictly inside the map when a selected tile reaches its edge. */
export function editorRegionFromCells(id:string,first:Point,last:Point,map:Pick<GameMap,'width'|'height'>):NonNullable<GameMap['regions']>[number]{
 return {id,min:{x:Math.min(first.x,last.x)*1000+500,y:Math.min(first.y,last.y)*1000+500},max:{x:Math.min((Math.max(first.x,last.x)+1)*1000+500,map.width*1000-1),y:Math.min((Math.max(first.y,last.y)+1)*1000+500,map.height*1000-1)}};
}
