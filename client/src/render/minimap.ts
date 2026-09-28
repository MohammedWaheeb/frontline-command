import type {Point} from '../runtime';

/** Match the battlefield's 2:1 projection instead of stretching a top-down map
 * to fit the wide radar panel. Map and camera share one uniform scale. */
export function minimapLayout(mapWidth:number,mapHeight:number,width:number,height:number){
 const span=mapWidth+mapHeight,scale=Math.min(Math.max(1,width-12)/span,Math.max(1,height-12)/(span*.5));
 const w=span*scale,h=span*scale*.5,x=(width-w)/2,y=(height-h)/2;
 return {x,y,width:w,height:h,originX:x+mapHeight*scale,originY:y,scale:scale/1000};
}
export function minimapProject(box:ReturnType<typeof minimapLayout>,point:Point):Point{return {x:box.originX+(point.x-point.y)*box.scale,y:box.originY+(point.x+point.y)*box.scale*.5}}
export function minimapWorldPoint(mapWidth:number,mapHeight:number,width:number,height:number,point:Point):Point{
 const box=minimapLayout(mapWidth,mapHeight,width,height),clamp=(n:number,hi:number)=>Math.max(0,Math.min(hi,n));
 const a=(point.x-box.originX)/box.scale,b=(point.y-box.originY)*2/box.scale;
 return {x:Math.round(clamp((a+b)/2,mapWidth*1000-1)),y:Math.round(clamp((b-a)/2,mapHeight*1000-1))};
}
