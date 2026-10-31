// Soft fog-of-war field. Presentation only: it reads the authorized public
// visible/explored masks and never feeds anything back to the simulation.
//
// Each map tile owns FOG_TEXELS×FOG_TEXELS texels. Targets are 0 (visible),
// FOG_EXPLORED (remembered) or FOG_UNEXPLORED (shroud, with a slow cloud
// mottle so the dark map still reads as ground rather than a flat void). A
// separable binomial blur (radius 3 texels = 1.5 tiles) turns the tile
// staircase into a feathered edge. Updates are incremental: only tiles whose
// state changed, plus the blur radius, are recomputed.

/** Remembered ground stays readable: about 46 % warm black. */
export const FOG_EXPLORED=118;
/** Shroud: about 88 % warm black, so terrain silhouettes and cliffs still read. */
export const FOG_UNEXPLORED=226;
export const FOG_TEXELS=2;
/** Warm black shroud colour (#0D0C0A). */
export const FOG_RGB=[13,12,10] as const;
const KERNEL=[1,6,15,20,15,6,1],KERNEL_SUM=64,RADIUS=3;

export interface FogRect {x0:number;y0:number;x1:number;y1:number}

function hash(x:number,y:number){let h=(x*374761393+y*668265263+0x5bd1e995)|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296}
function valueNoise(x:number,y:number,scale:number){
 const fx=x/scale,fy=y/scale,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy,s=(t:number)=>t*t*(3-2*t);
 const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1),u=s(tx),v=s(ty);
 return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}

export class FogField {
 readonly width:number;readonly height:number;readonly texWidth:number;readonly texHeight:number;
 /** Current per-tile target (0, FOG_EXPLORED, FOG_UNEXPLORED). */
 readonly level:Uint8Array;
 /** Blurred alpha per texel (row-major, texWidth×texHeight). */
 readonly alpha:Uint8ClampedArray;
 /** Darkest blurred texel over each tile's block plus a one-texel border:
  * zero means every sample a triangle on that tile can take is clear. */
 readonly tileMax:Uint8Array;
 /** Incremented on every update that changed at least one texel. */
 version=0;
 /** Texel rectangle changed by the most recent changing update (inclusive). */
 dirty?:FogRect;
 private readonly mottle:Int8Array;private readonly row:Float32Array;private initialized=false;
 constructor(width:number,height:number){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>256||height>256)throw new Error('Invalid fog dimensions');
  this.width=width;this.height=height;this.texWidth=width*FOG_TEXELS;this.texHeight=height*FOG_TEXELS;
  this.level=new Uint8Array(width*height).fill(FOG_UNEXPLORED);
  this.alpha=new Uint8ClampedArray(this.texWidth*this.texHeight).fill(FOG_UNEXPLORED);
  this.tileMax=new Uint8Array(width*height).fill(FOG_UNEXPLORED);
  this.row=new Float32Array(Math.max(this.texWidth,this.texHeight)+2*RADIUS);
  // Static cloud mottle for unexplored ground only: two octaves at 5 and 13 tiles.
  this.mottle=new Int8Array(this.texWidth*this.texHeight);
  for(let y=0;y<this.texHeight;y++)for(let x=0;x<this.texWidth;x++){
   const tx=x/FOG_TEXELS,ty=y/FOG_TEXELS,n=valueNoise(tx,ty,5)*.55+valueNoise(tx+31,ty+17,13)*.45;
   this.mottle[y*this.texWidth+x]=Math.round((n-.5)*30);
  }
  this.fullRefresh();
 }
 /** Source (unblurred) texel value; outside the map replicates the edge. */
 private source(x:number,y:number){
  const cx=x<0?0:x>=this.texWidth?this.texWidth-1:x,cy=y<0?0:y>=this.texHeight?this.texHeight-1:y;
  const level=this.level[Math.floor(cy/FOG_TEXELS)*this.width+Math.floor(cx/FOG_TEXELS)];
  return level===FOG_UNEXPLORED?level+this.mottle[cy*this.texWidth+cx]:level;
 }
 private fullRefresh(){this.blur({x0:0,y0:0,x1:this.texWidth-1,y1:this.texHeight-1})}
 /** Reads the CURRENT mask values (never identity or tick). Returns true when
  * any texel changed; `dirty` then names the changed texel rectangle. */
 update(visible:ArrayLike<boolean>,explored:ArrayLike<boolean>):boolean{
  let x0=Infinity,y0=Infinity,x1=-1,y1=-1;
  for(let y=0,i=0;y<this.height;y++)for(let x=0;x<this.width;x++,i++){
   const next=visible[i]?0:explored[i]?FOG_EXPLORED:FOG_UNEXPLORED;
   if(next!==this.level[i]){this.level[i]=next;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  }
  if(x1<0){if(this.initialized)return false;this.initialized=true;this.dirty={x0:0,y0:0,x1:this.texWidth-1,y1:this.texHeight-1};this.version++;return true}
  this.initialized=true;
  const rect={x0:Math.max(0,x0*FOG_TEXELS-RADIUS),y0:Math.max(0,y0*FOG_TEXELS-RADIUS),x1:Math.min(this.texWidth-1,(x1+1)*FOG_TEXELS-1+RADIUS),y1:Math.min(this.texHeight-1,(y1+1)*FOG_TEXELS-1+RADIUS)};
  this.blur(rect);this.dirty=rect;this.version++;return true;
 }
 /** Recomputes blurred alpha inside `rect` and tileMax for every tile it touches. */
 private blur(rect:FogRect){
  const {x0,y0,x1,y1}=rect,w=x1-x0+1,rows=y1-y0+1+2*RADIUS,horizontal=new Float32Array(w*rows),line=this.row;
  // Horizontal pass over the rect rows plus the vertical kernel apron.
  for(let r=0;r<rows;r++){
   const y=y0-RADIUS+r;
   for(let k=0;k<w+2*RADIUS;k++)line[k]=this.source(x0-RADIUS+k,y);
   for(let x=0;x<w;x++){let sum=0;for(let k=0;k<KERNEL.length;k++)sum+=line[x+k]*KERNEL[k];horizontal[r*w+x]=sum/KERNEL_SUM}
  }
  for(let x=0;x<w;x++)for(let y=0;y<=y1-y0;y++){
   let sum=0;for(let k=0;k<KERNEL.length;k++)sum+=horizontal[(y+k)*w+x]*KERNEL[k];
   // Keep fully visible ground exactly clear: a residual below 2/255 is noise.
   const value=sum/KERNEL_SUM;this.alpha[(y0+y)*this.texWidth+x0+x]=value<2?0:Math.round(value);
  }
  const tx0=Math.max(0,Math.floor((x0-1)/FOG_TEXELS)),ty0=Math.max(0,Math.floor((y0-1)/FOG_TEXELS)),tx1=Math.min(this.width-1,Math.floor((x1+1)/FOG_TEXELS)),ty1=Math.min(this.height-1,Math.floor((y1+1)/FOG_TEXELS));
  for(let ty=ty0;ty<=ty1;ty++)for(let tx=tx0;tx<=tx1;tx++){
   let max=0;
   const ax=Math.max(0,tx*FOG_TEXELS-1),bx=Math.min(this.texWidth-1,(tx+1)*FOG_TEXELS),ay=Math.max(0,ty*FOG_TEXELS-1),by=Math.min(this.texHeight-1,(ty+1)*FOG_TEXELS);
   for(let y=ay;y<=by;y++)for(let x=ax;x<=bx;x++){const a=this.alpha[y*this.texWidth+x];if(a>max)max=a}
   this.tileMax[ty*this.width+tx]=max;
  }
 }
 /** Blurred alpha at a ground point in millitiles (bilinear, like the GPU). */
 sample(x:number,y:number):number{
  const fx=x/1000*FOG_TEXELS-.5,fy=y/1000*FOG_TEXELS-.5,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
  const at=(i:number,j:number)=>this.alpha[Math.min(this.texHeight-1,Math.max(0,j))*this.texWidth+Math.min(this.texWidth-1,Math.max(0,i))];
  const top=at(ix,iy)*(1-tx)+at(ix+1,iy)*tx,bottom=at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx;
  return top*(1-ty)+bottom*ty;
 }
 /** Writes RGBA pixels for `rect` into a texWidth-wide ImageData buffer. */
 writePixels(data:Uint8ClampedArray,rect:FogRect=this.dirty??{x0:0,y0:0,x1:this.texWidth-1,y1:this.texHeight-1}){
  for(let y=rect.y0;y<=rect.y1;y++)for(let x=rect.x0;x<=rect.x1;x++){
   const i=y*this.texWidth+x,o=i*4;data[o]=FOG_RGB[0];data[o+1]=FOG_RGB[1];data[o+2]=FOG_RGB[2];data[o+3]=this.alpha[i];
  }
 }
}
