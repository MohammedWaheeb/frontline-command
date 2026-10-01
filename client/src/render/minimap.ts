import type {GameMap,Point} from '../runtime';

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

/** Retained terrain pixels only. Symbols, team colours and camera geometry are
 * still drawn on every requested minimap repaint. Read current tile/fog values
 * rather than relying on snapshot tick or array identity: perspective changes,
 * replay seeks and in-place mask updates must not reuse stale terrain pixels. */
export class MinimapTerrainRaster {
 private canvas?:HTMLCanvasElement;private context?:CanvasRenderingContext2D;private image?:ImageData;
 private terrain:Array<string|undefined>=[];private heights:Float64Array=new Float64Array();
 private rgb:Uint8ClampedArray=new Uint8ClampedArray();private fog:Uint8Array=new Uint8Array();
 constructor(private readonly sample:(map:GameMap,x:number,y:number)=>readonly [number,number,number]){}
 paint(map:GameMap,visible:readonly boolean[],explored:readonly boolean[]):HTMLCanvasElement{
  if(!this.canvas||this.canvas.width!==map.width||this.canvas.height!==map.height){
   this.dispose();const canvas=document.createElement('canvas');canvas.width=map.width;canvas.height=map.height;
   const context=canvas.getContext('2d');if(!context)throw Error('Minimap terrain canvas is unavailable.');
   this.canvas=canvas;this.context=context;this.image=context.createImageData(map.width,map.height);
   const count=map.width*map.height;this.terrain=new Array(count);this.heights=new Float64Array(count);this.rgb=new Uint8ClampedArray(count*3);this.fog=new Uint8Array(count).fill(255);
  }
  const image=this.image!;let changed=false;
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
   const i=y*map.width+x,tile=map.tiles[i],terrain=tile?.terrain??'open',height=tile?.height??0;
   const colourChanged=terrain!==this.terrain[i]||height!==this.heights[i],fog=visible[i]?0:explored[i]?1:2;
   if(colourChanged){const [r,g,b]=this.sample(map,x,y);this.rgb[i*3]=r;this.rgb[i*3+1]=g;this.rgb[i*3+2]=b;this.terrain[i]=terrain;this.heights[i]=height}
   if(colourChanged||fog!==this.fog[i]){
    const k=fog===0?1:fog===1?.4:.04,offset=i*4;
    image.data[offset]=this.rgb[i*3]*k;image.data[offset+1]=this.rgb[i*3+1]*k;image.data[offset+2]=this.rgb[i*3+2]*k;image.data[offset+3]=255;
    this.fog[i]=fog;changed=true;
   }
  }
  if(changed)this.context!.putImageData(image,0,0);
  return this.canvas!;
 }
 dispose(){
  if(this.canvas){this.canvas.width=0;this.canvas.height=0}
  this.canvas=undefined;this.context=undefined;this.image=undefined;this.terrain=[];this.heights=new Float64Array();this.rgb=new Uint8ClampedArray();this.fog=new Uint8Array();
 }
}
