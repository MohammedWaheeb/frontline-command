import {buildLine,shapeBuilders,transformVertices,Texture} from 'pixi.js';
import type {Graphics,StrokeAttributes,Polygon as PixiPolygon} from 'pixi.js';
import type {Point,Rect} from '../runtime';

type Polygon=readonly Point[];
const EPS=1e-8;
const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function onSegment(a:Point,b:Point,p:Point){return Math.abs(cross(a,b,p))<=EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS}
function inside(poly:Polygon,p:Point){
 let hit=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[j],b=poly[i];if(onSegment(a,b,p))return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
 }
 return hit;
}
function segmentsMeet(a:Point,b:Point,c:Point,d:Point){
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 return abC*abD<0&&cdA*cdB<0||Math.abs(abC)<=EPS&&onSegment(a,b,c)||Math.abs(abD)<=EPS&&onSegment(a,b,d)||Math.abs(cdA)<=EPS&&onSegment(c,d,a)||Math.abs(cdB)<=EPS&&onSegment(c,d,b);
}
function polygonsMeet(a:Polygon,b:Polygon){
 if(a.some(p=>inside(b,p))||b.some(p=>inside(a,p)))return true;
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(segmentsMeet(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;
 return false;
}

type Instruction=Graphics['context']['instructions'][number];
interface StructureMesh {instructions:Instruction[];triangles:Point[][];bounds?:Rect;unsupported:boolean}
const meshes=new WeakMap<Graphics['context'],StructureMesh>();

/** Lazy shared geometry for the current drawStructure clear/repaint course.
 * It replaces instructions for every draw; validate the entire sequence since
 * clear reuses its array and an appended instruction also changes the mesh.
 * Arbitrary in-place style/path/primitive mutation is outside this contract. */
function structureMesh(g:Graphics):StructureMesh{
 const context=g.context,instructions=context.instructions,cached=meshes.get(context);
 if(cached&&cached.instructions.length===instructions.length&&instructions.every((instruction,index)=>instruction===cached.instructions[index]))return cached;
 const mesh:StructureMesh={instructions:instructions.slice(),triangles:[],unsupported:false};
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const instruction of instructions){
  if(instruction.action!=='fill'&&instruction.action!=='stroke'){mesh.unsupported=true;continue}
  const data=instruction.data;if(data.style.alpha<=0)continue;
  if(data.hole||data.style.texture!==Texture.WHITE){mesh.unsupported=true;continue}
  for(const primitive of data.path.shapePath.shapePrimitives){
   const shape=primitive.shape;
   if(primitive.holes||!['polygon','rectangle','circle','ellipse'].includes(shape.type)){mesh.unsupported=true;continue}
   const builder=shapeBuilders[shape.type],points:number[]=[],vertices:number[]=[],indices:number[]=[];
   if(!builder||!builder.build(shape,points))continue;
   // Pixi transforms the centerline before applying the constant stroke width.
   if(primitive.transform)transformVertices(points,primitive.transform);
   if(instruction.action==='stroke'){
    const style=data.style as StrokeAttributes&{pixelLine?:boolean};
    if(style.pixelLine){mesh.unsupported=true;continue}
    if(!(style.width!>0))continue;
    buildLine(points,style,false,(shape as PixiPolygon).closePath??true,vertices,indices);
   }else builder.triangulate(points,vertices,2,0,indices,0);
   for(let i=0;i<indices.length;i+=3){
    const triangle=indices.slice(i,i+3).map(index=>({x:vertices[index*2],y:vertices[index*2+1]}));
    if(triangle.length!==3||!triangle.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))||Math.abs(cross(triangle[0],triangle[1],triangle[2]))<=EPS)continue;
    mesh.triangles.push(triangle);
    for(const p of triangle){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y)}
   }
  }
 }
 if(mesh.triangles.length)mesh.bounds={left,top,right,bottom};
 meshes.set(context,mesh);return mesh;
}

/** Bounds of actual indexed ink, never unused line-strip vertices or padding.
 * Unknown future geometry keeps the original development marker bounds. */
export function structureBodyBounds(g:Graphics):Rect|undefined{
 const mesh=structureMesh(g);return !mesh.unsupported&&mesh.bounds?{...mesh.bounds}:undefined;
}

/** Intersects the ordinary square pointer neighborhood with current indexed
 * fill/stroke triangles, including the renderer's real joins and caps. */
export function containsStructureSquare(g:Graphics,point:Point,tolerance:number):boolean|undefined{
 if(![point.x,point.y,tolerance].every(Number.isFinite)||tolerance<0)return false;
 const mesh=structureMesh(g),bounds=mesh.bounds;
 if(!bounds)return mesh.unsupported?undefined:false;
 if(point.x+tolerance<bounds.left||point.x-tolerance>bounds.right||point.y+tolerance<bounds.top||point.y-tolerance>bounds.bottom)return mesh.unsupported?undefined:false;
 const x=point.x-tolerance,y=point.y-tolerance,size=tolerance*2;
 const box:Polygon=[{x,y},{x:x+size,y},{x:x+size,y:y+size},{x,y:y+size}];
 if(mesh.triangles.some(triangle=>polygonsMeet(box,triangle)))return true;
 return mesh.unsupported?undefined:false;
}
