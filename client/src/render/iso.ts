// Fixed 2:1 dimetric projection shared with the Blender pipeline
// (assets/pipeline/blender/fclib.py): one tile is 64×32 px at 1×.
// Sim +x maps to screen lower-right, sim +y to screen lower-left.
export const TILE_W=64,TILE_H=32,HALF_W=32,HALF_H=16;
/** Height step in screen px per terrain level (presentation only). */
export const LEVEL_PX=10;
export interface Vec2 {x:number;y:number}
/** Millitiles → world pixels. */
export function toScreen(xMt:number,yMt:number):Vec2{const x=xMt/1000,y=yMt/1000;return {x:(x-y)*HALF_W,y:(x+y)*HALF_H}}
export function tileToScreen(x:number,y:number):Vec2{return {x:(x-y)*HALF_W,y:(x+y)*HALF_H}}
/** World pixels → millitiles (ground plane). */
export function toWorld(sx:number,sy:number):Vec2{const a=sx/HALF_W,b=sy/HALF_H;return {x:(a+b)/2*1000,y:(b-a)/2*1000}}
/** Go facing is millidegrees measured from +x toward +y; sprite heading d of N uses the same convention. */
export function headingIndex(facing:number,directions:number){if(directions<=1)return 0;const a=((facing%360000)+360000)%360000;return Math.round(a/360000*directions)%directions}
export function lerpAngle(a:number,b:number,t:number){let d=((b-a)%360000+540000)%360000-180000;return a+d*t}
/** Screen-space bounds of a map in world px. */
export function mapBounds(width:number,height:number){return {left:-height*HALF_W,right:width*HALF_W,top:0,bottom:(width+height)*HALF_H}}
