/** One bit per decoded atlas pixel, shared by all frames on that resident page.
 * This is presentation picking data, never collision or fog authority. */
export interface AlphaMask {readonly width:number;readonly height:number;readonly bits:Uint8Array}
export interface PixelRect {x:number;y:number;w:number;h:number}
export function makeAlphaMask(width:number,height:number,rgba:Uint8ClampedArray):AlphaMask{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||!Number.isSafeInteger(width*height)||rgba.length!==width*height*4)throw Error('Invalid atlas pixel data');
 const bits=new Uint8Array(Math.ceil(width*height/8));
 for(let index=0;index<width*height;index++)if(rgba[index*4+3]!==0)bits[index>>3]|=1<<(index&7);
 return {width,height,bits};
}
/** The tolerance is in source pixels. Clamp to this frame so adjacent packed
 * frames cannot create hits through its transparent padding. */
export function alphaInFrame(mask:AlphaMask,frame:PixelRect,x:number,y:number,tolerance:number):boolean{
 if(![x,y,tolerance].every(Number.isFinite)||tolerance<0)return false;
 const left=Math.max(0,Math.floor(x-tolerance)),right=Math.min(frame.w-1,Math.floor(x+tolerance)),top=Math.max(0,Math.floor(y-tolerance)),bottom=Math.min(frame.h-1,Math.floor(y+tolerance));
 if(left>right||top>bottom)return false;
 for(let py=top;py<=bottom;py++){
  const first=(frame.y+py)*mask.width+frame.x+left,last=(frame.y+py)*mask.width+frame.x+right;
  // Whole-byte tests keep a zoomed-out tolerance query bounded by touched rows
  // and byte spans, rather than repeating a bit lookup for every nearby pixel.
  for(let byte=first>>3;byte<=last>>3;byte++){
   const lo=byte===(first>>3)?first&7:0,hi=byte===(last>>3)?last&7:7;
   if(mask.bits[byte]&((0xff<<lo)&(0xff>>>(7-hi))))return true;
  }
 }
 return false;
}
