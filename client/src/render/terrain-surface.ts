import type {GameMap,Point} from '../runtime/types';
import {HALF_H,LEVEL_PX,toScreen,toWorld} from './iso';

/** Presentation geometry only. Go still decides movement, sight and placement. */
export interface SurfaceVertex extends Point {height:number}
export interface SurfaceTriangle {
 readonly id:string;readonly tile:number;readonly neighbor?:number;readonly kind:'top'|'face';
 readonly vertices:readonly [SurfaceVertex,SurfaceVertex,SurfaceVertex];
 /** Stable painter ordering in ground millitiles, independent of raised screen Y. */
 readonly depth:number;readonly frontFacing:boolean;readonly blockedTile?:number;
}
export interface SurfaceHit {
 triangle:SurfaceTriangle;point:SurfaceVertex;screen:Point;
 /** A cliff face resolves to its impassable owner, never a hidden route behind it. */
 commandPoint:Point;
}
export interface SurfaceRect {left:number;top:number;right:number;bottom:number}
export interface FootprintSurface {height:number;top:SurfaceVertex[];boundary:SurfaceVertex[]}
const EPS=1e-7;
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const blocked=(terrain:string)=>terrain==='cliff'||terrain==='water'||terrain==='blocked';
const mix=(a:SurfaceVertex,b:SurfaceVertex,t:number):SurfaceVertex=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,height:a.height+(b.height-a.height)*t});
export function projectSurfaceVertex(vertex:SurfaceVertex):Point{const p=toScreen(vertex.x,vertex.y);return {x:p.x,y:p.y-vertex.height*LEVEL_PX}}
export function compareSurfaceTriangles(a:SurfaceTriangle,b:SurfaceTriangle){return a.depth-b.depth||a.tile-b.tile||(a.id<b.id?-1:a.id>b.id?1:0)}
/** A top triangle touching this ground-depth interval can have its centroid at
 * the interval's 2/3 point. An opaque sprite must clear that bound. The tiny
 * original-depth term preserves ordering within a shared fan interval. */
export function spriteFrontDepth(front:number){return Math.max(front,Math.floor(front/1000)*1000+2000/3+.001+front/1e9)}
export function surfaceFogOpacity(triangle:SurfaceTriangle,visible:readonly boolean[],explored:readonly boolean[]):number{
 const opacity=(tile:number)=>visible[tile]?0:explored[tile]?175:255;
 return Math.max(opacity(triangle.tile),triangle.neighbor===undefined?0:opacity(triangle.neighbor));
}
function weights(p:Point,a:Point,b:Point,c:Point):[number,number,number]|undefined{
 const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<EPS)return;
 const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/det,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/det;
 if(u< -EPS||v< -EPS||u+v>1+EPS)return;
 return [u,v,1-u-v];
}
function interpolate(vertices:readonly SurfaceVertex[],w:readonly number[]):SurfaceVertex{return {x:vertices.reduce((n,v,i)=>n+v.x*w[i],0),y:vertices.reduce((n,v,i)=>n+v.y*w[i],0),height:vertices.reduce((n,v,i)=>n+v.height*w[i],0)}}
function clip(poly:SurfaceVertex[],axis:'x'|'y',value:number,greater:boolean):SurfaceVertex[]{
 const out:SurfaceVertex[]=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],ina=greater?a[axis]>=value:a[axis]<=value,inb=greater?b[axis]>=value:b[axis]<=value;
  if(ina)out.push(a);if(ina!==inb)out.push(mix(a,b,(value-a[axis])/(b[axis]-a[axis])));
 }
 return out;
}

/** Immutable view of a public tile map. Rebuild after an authorized terrain revision. */
export class TerrainSurface {
 readonly width:number;readonly height:number;readonly maxHeight:number;
 private readonly levels:Float64Array;private readonly walkable:Uint8Array;
 /** NW, NE, SE, SW heights for each tile. Unrelated sectors never share a corner. */
 private readonly corners:Float64Array;
 constructor(map:Pick<GameMap,'width'|'height'|'tiles'>){
  const {width,height,tiles}=map;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>256||height>256||tiles.length!==width*height)throw new Error('Invalid public surface dimensions');
  this.width=width;this.height=height;this.levels=new Float64Array(tiles.length);this.walkable=new Uint8Array(tiles.length);this.corners=new Float64Array(tiles.length*4);
  let max=0;for(let i=0;i<tiles.length;i++){const level=tiles[i].height??0;if(!Number.isInteger(level)||level<0||level>4)throw new Error('Invalid public surface height');this.levels[i]=level;this.walkable[i]=blocked(tiles[i].terrain)?0:1;max=Math.max(max,level)}this.maxHeight=max;
  for(let gy=0;gy<=height;gy++)for(let gx=0;gx<=width;gx++){
   const incident=[{x:gx-1,y:gy-1,corner:2},{x:gx,y:gy-1,corner:3},{x:gx,y:gy,corner:0},{x:gx-1,y:gy,corner:1}].filter(p=>p.x>=0&&p.y>=0&&p.x<width&&p.y<height);
   const done=new Set<number>();
   for(let start=0;start<incident.length;start++){
    if(done.has(start))continue;done.add(start);const group=[start],first=incident[start],firstID=first.y*width+first.x;
    if(this.walkable[firstID])for(let n=0;n<group.length;n++)for(let j=0;j<incident.length;j++){
     if(done.has(j))continue;const a=incident[group[n]],b=incident[j];
     if(this.walkable[b.y*width+b.x]&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1){done.add(j);group.push(j)}
    }
    const level=group.reduce((sum,j)=>{const p=incident[j];return sum+this.levels[p.y*width+p.x]},0)/group.length;
    for(const j of group){const p=incident[j];this.corners[(p.y*width+p.x)*4+p.corner]=level}
   }
  }
 }
 private valid(tile:number){return Number.isInteger(tile)&&tile>=0&&tile<this.levels.length}
 private vertex(tile:number,corner:number):SurfaceVertex{const x=tile%this.width,y=Math.floor(tile/this.width);return {x:(x+(corner===1||corner===2?1:0))*1000,y:(y+(corner>=2?1:0))*1000,height:this.corners[tile*4+corner]}}
 private triangle(id:string,tile:number,vertices:[SurfaceVertex,SurfaceVertex,SurfaceVertex],rest:Partial<SurfaceTriangle>={}):SurfaceTriangle{
  return {id,tile,vertices,kind:'top',depth:vertices.reduce((sum,p)=>sum+p.x+p.y,0)/3,frontFacing:true,...rest};
 }
 topTriangles(tile:number):SurfaceTriangle[]{
  if(!this.valid(tile))return [];const x=tile%this.width,y=Math.floor(tile/this.width),center={x:(x+.5)*1000,y:(y+.5)*1000,height:this.levels[tile]};
  return Array.from({length:4},(_,i)=>this.triangle(`t${tile}.${i}`,tile,[center,this.vertex(tile,i),this.vertex(tile,(i+1)%4)]));
 }
 /** Each edge has exactly one owner (east/south, plus exterior north/west). */
 edgeFaces(tile:number):SurfaceTriangle[]{
  if(!this.valid(tile))return [];const x=tile%this.width,y=Math.floor(tile/this.width),out:SurfaceTriangle[]=[];
  const edges:Array<{edge:number;neighbor?:number;a:number;b:number;na:number;nb:number;front:boolean}>=[
   {edge:1,neighbor:x+1<this.width?tile+1:undefined,a:1,b:2,na:0,nb:3,front:true},
   {edge:2,neighbor:y+1<this.height?tile+this.width:undefined,a:3,b:2,na:0,nb:1,front:true},
  ];
  if(x===0)edges.push({edge:3,a:0,b:3,na:0,nb:0,front:false});
  if(y===0)edges.push({edge:0,a:0,b:1,na:0,nb:0,front:false});
  for(const edge of edges){
   const neighbor=edge.neighbor;if(neighbor!==undefined&&this.walkable[tile]&&this.walkable[neighbor])continue;
   const a0=this.vertex(tile,edge.a),a1=this.vertex(tile,edge.b),b0=neighbor===undefined?{...a0,height:0}:this.vertex(neighbor,edge.na),b1=neighbor===undefined?{...a1,height:0}:this.vertex(neighbor,edge.nb);
   const d0=a0.height-b0.height,d1=a1.height-b1.height,breaks=[0,1];if(d0*d1<0)breaks.splice(1,0,d0/(d0-d1));
   for(let i=0;i<breaks.length-1;i++){
    const lo=breaks[i],hi=breaks[i+1],aa=mix(a0,a1,lo),ab=mix(a0,a1,hi),ba=mix(b0,b1,lo),bb=mix(b0,b1,hi),difference=(aa.height+ab.height-ba.height-bb.height)/2;
    if(Math.abs(difference)<EPS)continue;
    const frontFacing=(difference>0)===edge.front,blockedTile=!this.walkable[tile]?tile:neighbor!==undefined&&!this.walkable[neighbor]?neighbor:tile;
    const rest={kind:'face' as const,neighbor,frontFacing,blockedTile};
    for(const [n,v] of [[0,[aa,ba,ab]],[1,[ba,bb,ab]]] as const){
     const p=v.map(projectSurfaceVertex);const area=(p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[2].x-p[0].x)*(p[1].y-p[0].y);
     if(Math.abs(area)>EPS)out.push(this.triangle(`f${tile}.${edge.edge}.${i}.${n}`,tile,[...v],rest));
    }
   }
  }
  return out;
 }
 *triangles(rect:SurfaceRect={left:0,top:0,right:this.width*1000,bottom:this.height*1000}):Generator<SurfaceTriangle>{
  const x0=clamp(Math.floor(rect.left/1000),0,this.width-1),y0=clamp(Math.floor(rect.top/1000),0,this.height-1),x1=clamp(Math.ceil(rect.right/1000)-1,0,this.width-1),y1=clamp(Math.ceil(rect.bottom/1000)-1,0,this.height-1);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const tile=y*this.width+x;yield* this.topTriangles(tile);yield* this.edgeFaces(tile)}
 }
 sampleGround(point:Point):number{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('Invalid public surface point');
  const x=clamp(point.x/1000,0,this.width-EPS),y=clamp(point.y/1000,0,this.height-EPS),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,tile=iy*this.width+ix,h=this.levels[tile],k=tile*4,c=this.corners;
  // Exact fan barycentrics without allocating four triangles for every actor
  // and squad member on every animation frame.
  if(fy<=fx&&fy<=1-fx)return 2*fy*h+(1-fx-fy)*c[k]+(fx-fy)*c[k+1];
  if(fx>=fy&&fx>=1-fy)return 2*(1-fx)*h+(fx-fy)*c[k+1]+(fx+fy-1)*c[k+2];
  if(fy>=fx&&fy>=1-fx)return 2*(1-fy)*h+(fx+fy-1)*c[k+2]+(fy-fx)*c[k+3];
  return 2*fx*h+(fy-fx)*c[k+3]+(1-fx-fy)*c[k];
 }
 projectGround(point:Point):Point{return projectSurfaceVertex({...point,height:this.sampleGround(point)})}
 /** Candidate intersections use the same actual triangles as drawing/fog. */
 pickSurface(screen:Point):SurfaceHit|undefined{
  if(!Number.isFinite(screen.x)||!Number.isFinite(screen.y))return;
  const flat=toWorld(screen.x,screen.y),radius=Math.ceil(this.maxHeight*LEVEL_PX/(2*HALF_H))+1;
  const rect={left:flat.x-radius*1000,top:flat.y-radius*1000,right:flat.x+(radius+1)*1000,bottom:flat.y+(radius+1)*1000};
  let best:SurfaceHit|undefined,bestDepth=-Infinity;
  for(const triangle of this.triangles(rect)){
   if(!triangle.frontFacing)continue;const projected=triangle.vertices.map(projectSurfaceVertex),w=weights(screen,projected[0],projected[1],projected[2]);if(!w)continue;
   const point=interpolate(triangle.vertices,w),depth=point.x+point.y;
   if(depth<bestDepth-EPS||Math.abs(depth-bestDepth)<=EPS&&best&&compareSurfaceTriangles(triangle,best.triangle)<=0)continue;
   const blockedTile=triangle.blockedTile;
   best={triangle,point,screen:{...screen},commandPoint:triangle.kind==='face'&&blockedTile!==undefined?{x:(blockedTile%this.width+.5)*1000,y:(Math.floor(blockedTile/this.width)+.5)*1000}:{x:point.x,y:point.y}};bestDepth=depth;
  }
  return best;
 }
 projectedBounds(rect?:SurfaceRect):SurfaceRect{
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const triangle of this.triangles(rect))for(const vertex of triangle.vertices){const p=projectSurfaceVertex(vertex);left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y)}
  return {left,top,right,bottom};
 }
 /** Rigid support plane and exact clipped perimeter; does not flatten the map. */
 footprintSurface(center:Point,width:number,height:number):FootprintSurface{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>256||height>256)throw new Error('Invalid visual footprint');
  const rect={left:center.x-width*500,top:center.y-height*500,right:center.x+width*500,bottom:center.y+height*500},perimeter:SurfaceVertex[]=[];let maximum=0;
  for(const triangle of this.triangles(rect)){
   if(triangle.kind!=='top')continue;let polygon=[...triangle.vertices];
   for(const [axis,value,greater] of [['x',rect.left,true],['x',rect.right,false],['y',rect.top,true],['y',rect.bottom,false]] as const)polygon=clip(polygon,axis,value,greater);
   for(const p of polygon){maximum=Math.max(maximum,p.height);if(Math.abs(p.x-rect.left)<EPS||Math.abs(p.x-rect.right)<EPS||Math.abs(p.y-rect.top)<EPS||Math.abs(p.y-rect.bottom)<EPS)perimeter.push(p)}
  }
  const unique=new Map<string,SurfaceVertex>();for(const p of perimeter){const key=`${p.x.toFixed(6)}:${p.y.toFixed(6)}`,old=unique.get(key);if(!old||p.height>old.height)unique.set(key,p)}
  const boundary=[...unique.values()].sort((a,b)=>Math.atan2(a.y-center.y,a.x-center.x)-Math.atan2(b.y-center.y,b.x-center.x));
  return {height:maximum,top:[{x:rect.left,y:rect.top,height:maximum},{x:rect.right,y:rect.top,height:maximum},{x:rect.right,y:rect.bottom,height:maximum},{x:rect.left,y:rect.bottom,height:maximum}],boundary};
 }
}
