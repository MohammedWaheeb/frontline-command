import {Container,Mesh,MeshGeometry,RenderTexture,Sprite,Texture,type Renderer} from 'pixi.js';
import {toScreen,toWorld,LEVEL_PX} from './iso';
import {projectSurfaceVertex,TerrainSurface,type SurfaceVertex} from './terrain-surface';
import type {FrameSet} from './art';
import type {Point} from '../runtime';

export interface ShadowDeck {left:number;top:number;right:number;bottom:number;height:number;depth:number}
export interface ShadowPlate {id:number;frame:FrameSet;scale:number;origin:Point;alpha:number;deck?:ShadowDeck}
interface Vertex extends SurfaceVertex {u:number;v:number}
interface Piece {vertices:Vertex[];depth:number;tile:number}
interface Group {texture:Texture;alpha:number;depth:number;positions:number[];uvs:number[];indices:number[]}
const lerp=(a:Vertex,b:Vertex,t:number):Vertex=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,height:a.height+(b.height-a.height)*t,u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});
function clip(vertices:Vertex[],axis:'x'|'y'|'u'|'v',value:number,above:boolean):Vertex[]{
 const result:Vertex[]=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],insideA=above?a[axis]>=value:a[axis]<=value,insideB=above?b[axis]>=value:b[axis]<=value;if(insideA)result.push(a);if(insideA!==insideB)result.push(lerp(a,b,(value-a[axis])/(b[axis]-a[axis])))}return result;
}
/** Authored shadow pixels projected onto public ground triangles. Each group
 * interleaves above its own terrain and below its fog, never as one billboard
 * cutting through the foreground. Geometry is owned; atlas textures are borrowed. */
class SurfaceShadowGeometry {
 private groups=new Map<string,Mesh<MeshGeometry>>();private key='';private lastSurface?:TerrainSurface;private lastVisible?:readonly boolean[];
 private plates=new Map<number,{key:string;pieces:Piece[]}>();private rebuilt=0;
 constructor(private layer:Container){}
 get diagnostics(){return {meshes:this.groups.size,triangles:[...this.groups.values()].reduce((n,m)=>n+m.geometry.indices.length/3,0),cachedPlates:this.plates.size,rebuiltPlates:this.rebuilt}}
 update(plates:readonly ShadowPlate[],surface:TerrainSurface,visible?:readonly boolean[]){
  this.rebuilt=0;
  const valid=plates.filter(p=>p.alpha>0&&!p.frame.texture.destroyed&&!p.frame.atlasTexture.destroyed&&!p.frame.atlasTexture.source.destroyed);
  const key=valid.map(p=>{const f=p.frame,d=p.deck;return `${f.texture.uid}/${p.origin.x}/${p.origin.y}/${p.scale}/${p.alpha}/${d?[d.left,d.top,d.right,d.bottom,d.height,d.depth].join(','):''}`}).join('|');
  if(key===this.key&&surface===this.lastSurface&&visible===this.lastVisible)return;
  if(surface!==this.lastSurface)this.plates.clear();
  this.key=key;this.lastSurface=surface;this.lastVisible=visible;const groups=new Map<string,Group>(),used=new Set<number>();
  const add=(vertices:Vertex[],depth:number,p:ShadowPlate)=>{
   if(vertices.length<3)return;const texture=p.frame.atlasTexture,key=`${texture.uid}/${depth}/${p.alpha}`;let group=groups.get(key);if(!group){group={texture,alpha:p.alpha,depth,positions:[],uvs:[],indices:[]};groups.set(key,group)}
   const frame=p.frame.texture.frame,start=group.positions.length/2;
   for(const vertex of vertices){const s=projectSurfaceVertex(vertex);group.positions.push(s.x,s.y);group.uvs.push((frame.x+vertex.u*frame.width)/texture.width,(frame.y+vertex.v*frame.height)/texture.height)}
   for(let i=1;i<vertices.length-1;i++)group.indices.push(start,start+i,start+i+1);
  };
  for(const p of valid){
   used.add(p.id);const d=p.deck,geometryKey=`${p.frame.texture.uid}/${p.origin.x}/${p.origin.y}/${p.scale}/${d?[d.left,d.top,d.right,d.bottom,d.height,d.depth].join(','):''}`;let cached=this.plates.get(p.id);
   if(!cached||cached.key!==geometryKey){
   this.rebuilt++;const pieces:Piece[]=[];
   const frame=p.frame.texture.frame,width=frame.width*p.scale,height=frame.height*p.scale,origin=toScreen(p.origin.x,p.origin.y),left=origin.x-p.frame.anchorX*width,top=origin.y-p.frame.anchorY*height;
   // One physical texel of guard preserves linear-filter alpha fringes. It
   // changes only the bounded geometry query, never the texture or world scale.
   const ink=p.frame.inkBounds,u0=ink?Math.max(0,ink.x-1)/frame.width:0,v0=ink?Math.max(0,ink.y-1)/frame.height:0,u1=ink?Math.min(frame.width,ink.x+ink.w+1)/frame.width:1,v1=ink?Math.min(frame.height,ink.y+ink.h+1)/frame.height:1;
   const corners=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>toWorld(left+u*width,top+v*height));
   const bounds={left:Math.min(...corners.map(c=>c.x)),top:Math.min(...corners.map(c=>c.y)),right:Math.max(...corners.map(c=>c.x)),bottom:Math.max(...corners.map(c=>c.y))};
   for(const triangle of surface.triangles(bounds)){
    if(triangle.kind!=='top')continue;
    let polygon:Vertex[]=triangle.vertices.map(vertex=>{const s=toScreen(vertex.x,vertex.y);return {...vertex,u:(s.x-left)/width,v:(s.y-top)/height}});
    for(const [axis,value,above] of [['u',u0,true],['u',u1,false],['v',v0,true],['v',v1,false]] as const)polygon=clip(polygon,axis,value,above);
    if(polygon.length<3)continue;
    const deck=p.deck;
    if(deck){
     // Disjoint outside strips retain real terrain heights; the remainder
     // receives only this aircraft's known service-deck support plane.
     for(const [axis,value,above] of [['x',deck.left,true],['x',deck.right,false],['y',deck.top,true],['y',deck.bottom,false]] as const){pieces.push({vertices:clip(polygon,axis,value,!above),depth:triangle.depth+.00005,tile:triangle.tile});polygon=clip(polygon,axis,value,above)}
     pieces.push({vertices:polygon.map(v=>({...v,height:deck.height})),depth:Math.max(triangle.depth+.00005,deck.depth+.005),tile:triangle.tile});
    }else pieces.push({vertices:polygon,depth:triangle.depth+.00005,tile:triangle.tile});
   }
   cached={key:geometryKey,pieces:pieces.filter(piece=>piece.vertices.length>=3)};this.plates.set(p.id,cached);
   }
   for(const piece of cached.pieces)if(!visible||visible[piece.tile])add(piece.vertices,piece.depth,p);
  }
  for(const id of this.plates.keys())if(!used.has(id))this.plates.delete(id);
  const reusable:Mesh<MeshGeometry>[]=[];
  for(const [key,mesh] of this.groups)if(!groups.has(key)){reusable.push(mesh);this.groups.delete(key)}
  for(const [key,group] of groups){let mesh=this.groups.get(key);if(!mesh){mesh=reusable.pop();if(!mesh){const geometry=new MeshGeometry({});geometry.batchMode='batch';mesh=new Mesh({texture:group.texture,geometry});mesh.eventMode='none';this.layer.addChild(mesh)}this.groups.set(key,mesh)}
   mesh.texture=group.texture;mesh.alpha=group.alpha;mesh.zIndex=group.depth;mesh.geometry.uvs=new Float32Array(group.uvs);mesh.geometry.positions=new Float32Array(group.positions);mesh.geometry.indices=new Uint32Array(group.indices);
  }
  for(const mesh of reusable){mesh.geometry.destroy();mesh.destroy()}
 }
 clear(){for(const mesh of this.groups.values()){mesh.geometry.destroy();mesh.destroy()}this.groups.clear();this.plates.clear();this.key='';this.lastSurface=undefined;this.lastVisible=undefined}
 dispose(){this.clear()}
}

export interface ShadowView {left:number;top:number;right:number;bottom:number;zoom:number}
interface GroundGroup {
 mesh:Mesh<MeshGeometry>;sourcePositions:Float32Array;sourceFlat:Float32Array;tiles:Uint32Array;shown:Uint8Array;
 positions:Float32Array;flat:Float32Array;uvs:Float32Array;indices:Uint32Array;dirty:boolean;
}
/** One bounded viewport-sized shadow stamp, sampled by public terrain tops.
 * Static terrain geometry is reused while sprites move. Known service decks
 * retain separately clipped plates because they are above the ground plane. */
export class SurfaceShadows {
 private renderer?:Renderer;private texture?:RenderTexture;private allocationKey='';private stamp=new Container();private sprites=new Map<number,Sprite>();private ground=new Map<number,GroundGroup>();
 private deck:SurfaceShadowGeometry;private key='';private geometryKey='';private surface?:TerrainSurface;private visible?:readonly boolean[];private textureView?:ShadowView;
 constructor(private layer:Container,renderer?:Renderer){this.renderer=renderer;this.deck=new SurfaceShadowGeometry(layer)}
 configure(renderer:Renderer){this.renderer=renderer}
 get diagnostics(){const deck=this.deck.diagnostics;return {meshes:this.ground.size+deck.meshes,triangles:[...this.ground.values()].reduce((n,g)=>n+g.mesh.geometry.indices.length/3,0)+deck.triangles,cachedPlates:this.sprites.size+deck.cachedPlates,rebuiltPlates:deck.rebuiltPlates,stampSprites:this.sprites.size,textureID:this.texture?.uid,textureBytes:this.texture?this.texture.source.pixelWidth*this.texture.source.pixelHeight*4:0}}
 update(plates:readonly ShadowPlate[],surface:TerrainSurface,visible?:readonly boolean[],view?:ShadowView){
  if(!this.renderer||!view){this.deck.update(plates,surface,visible);return}
  const valid=plates.filter(p=>p.alpha>0&&!p.frame.texture.destroyed&&!p.frame.atlasTexture.destroyed&&!p.frame.atlasTexture.source.destroyed);
  const supported:ShadowPlate[]=[],ground:ShadowPlate[]=[];
  for(const p of valid){const d=p.deck;let intersects=false;if(d){const t=p.frame.texture.frame,s=toScreen(p.origin.x,p.origin.y),w=t.width*p.scale,h=t.height*p.scale,corners=[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>toWorld(s.x-p.frame.anchorX*w+x,s.y-p.frame.anchorY*h+y));intersects=Math.max(...corners.map(v=>v.x))>=d.left&&Math.min(...corners.map(v=>v.x))<=d.right&&Math.max(...corners.map(v=>v.y))>=d.top&&Math.min(...corners.map(v=>v.y))<=d.bottom}if(intersects)supported.push(p);else ground.push(p)}
  this.deck.update(supported,surface,visible);
  if(!ground.length){this.clearGround();return}
  const pad=64/view.zoom+surface.maxHeight*LEVEL_PX,left=view.left-pad,top=view.top-pad,right=view.right+pad,bottom=view.bottom+pad,width=Math.ceil((right-left)*view.zoom),height=Math.ceil((bottom-top)*view.zoom);
  // A separate32MiB ceiling keeps very large/retina windows bounded. Only soft
  // shadow resolution is reduced; source art and actor geometry stay exact.
  const resolution=Math.min(2,this.renderer.resolution,Math.floor(Math.min(Math.sqrt(32*1024*1024/(width*height*4)),4096/width,4096/height)*64)/64);
  // Pixi rounds physical pixels on first GPU allocation, so its reported
  // logical width can shift at fractional resolutions. Compare the request,
  // not that rounded result, to avoid reallocating a paused large viewport.
  const allocationKey=`${width}/${height}/${resolution}`;
  if(!this.texture||this.allocationKey!==allocationKey){this.clearGround();this.texture=RenderTexture.create({width,height,resolution});this.texture.source.scaleMode='linear';this.allocationKey=allocationKey}
  const texture=this.texture,stampKey=ground.map(p=>`${p.id}/${p.frame.texture.uid}/${p.origin.x}/${p.origin.y}/${p.scale}/${p.alpha}`).join('|')+`@${left}/${top}/${view.zoom}`;
  if(stampKey!==this.key){
   this.key=stampKey;const used=new Set<number>();for(const p of ground){used.add(p.id);let sprite=this.sprites.get(p.id);if(!sprite){sprite=new Sprite();sprite.eventMode='none';this.sprites.set(p.id,sprite);this.stamp.addChild(sprite)}const origin=toScreen(p.origin.x,p.origin.y);sprite.texture=p.frame.texture;sprite.anchor.set(p.frame.anchorX,p.frame.anchorY);sprite.position.set((origin.x-left)*view.zoom,(origin.y-top)*view.zoom);sprite.scale.set(p.scale*view.zoom);sprite.alpha=p.alpha}
   for(const [id,sprite] of this.sprites)if(!used.has(id)){sprite.texture=Texture.EMPTY;sprite.destroy();this.sprites.delete(id)}
   this.renderer.render({container:this.stamp,target:texture,clear:true});
  }
  const visibilityChanged=this.visible!==visible;this.visible=visible;
  const corners=[[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,y])=>toWorld(x,y)),guard=surface.maxHeight*1000;
  const bounds={left:Math.max(0,Math.floor((Math.min(...corners.map(p=>p.x))-guard)/1000)*1000),top:Math.max(0,Math.floor((Math.min(...corners.map(p=>p.y))-guard)/1000)*1000),right:Math.min(surface.width*1000,Math.ceil((Math.max(...corners.map(p=>p.x))+guard)/1000)*1000),bottom:Math.min(surface.height*1000,Math.ceil((Math.max(...corners.map(p=>p.y))+guard)/1000)*1000)};
  const geometryKey=`${bounds.left}/${bounds.top}/${bounds.right}/${bounds.bottom}`;
  let rebuild=false;if(this.surface!==surface||geometryKey!==this.geometryKey){
   this.surface=surface;this.geometryKey=geometryKey;rebuild=true;const groups=new Map<number,{positions:number[];flat:number[];tiles:number[]}>();
   // Only the current viewport's immutable public tops are cached. Fog changes
   // must not regenerate every triangle (or construct cliff faces to discard).
   // Match TerrainSurface.triangles()' exact floor/ceil/clamp traversal.
   const clamp=(n:number,limit:number)=>Math.max(0,Math.min(limit-1,n)),x0=clamp(Math.floor(bounds.left/1000),surface.width),y0=clamp(Math.floor(bounds.top/1000),surface.height),x1=clamp(Math.ceil(bounds.right/1000)-1,surface.width),y1=clamp(Math.ceil(bounds.bottom/1000)-1,surface.height);
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const triangle of surface.topTriangles(y*surface.width+x)){
    let group=groups.get(triangle.depth);if(!group){group={positions:[],flat:[],tiles:[]};groups.set(triangle.depth,group)}group.tiles.push(triangle.tile);
    for(const vertex of triangle.vertices){const p=projectSurfaceVertex(vertex),flat=toScreen(vertex.x,vertex.y);group.positions.push(p.x,p.y);group.flat.push(flat.x,flat.y)}
   }
   for(const [depth,group] of this.ground)if(!groups.has(depth)){group.mesh.geometry.destroy();group.mesh.destroy();this.ground.delete(depth)}
   for(const [depth,data] of groups){
    let mesh=this.ground.get(depth)?.mesh;if(!mesh){const geometry=new MeshGeometry({});geometry.batchMode='batch';mesh=new Mesh({geometry,texture});mesh.eventMode='none';mesh.zIndex=depth+.00005;this.layer.addChild(mesh)}
    const indices=new Uint32Array(data.positions.length/2);for(let i=0;i<indices.length;i++)indices[i]=i;
    this.ground.set(depth,{mesh,sourcePositions:new Float32Array(data.positions),sourceFlat:new Float32Array(data.flat),tiles:new Uint32Array(data.tiles),shown:new Uint8Array(data.tiles.length),positions:new Float32Array(data.positions.length),flat:new Float32Array(data.flat.length),uvs:new Float32Array(data.positions.length),indices,dirty:true});
   }
  }
  if(rebuild||visibilityChanged)for(const group of this.ground.values()){
   let changed=rebuild;for(let i=0;i<group.tiles.length;i++){const shown=!visible||visible[group.tiles[i]]?1:0;if(group.shown[i]!==shown){group.shown[i]=shown;changed=true}}
   if(!changed)continue;
   // Pixi batches every submitted position, even an unindexed one. Keep hidden
   // tops CPU-only and compact visible triangles into reusable draw buffers.
   let at=0;for(let i=0;i<group.tiles.length;i++)if(group.shown[i])for(let k=i*6;k<i*6+6;k++){group.positions[at]=group.sourcePositions[k];group.flat[at++]=group.sourceFlat[k]}
   group.mesh.geometry.positions=group.positions.subarray(0,at);group.mesh.geometry.uvs=group.uvs.subarray(0,at);group.mesh.geometry.indices=group.indices.subarray(0,at/2);group.mesh.visible=at>0;group.dirty=true;
  }
  const previous=this.textureView,viewChanged=!previous||previous.left!==left||previous.top!==top||previous.zoom!==view.zoom;
  for(const group of this.ground.values())if(group.dirty||viewChanged){const uv=group.mesh.geometry.uvs;for(let i=0;i<uv.length;i+=2){uv[i]=(group.flat[i]-left)*view.zoom/texture.width;uv[i+1]=(group.flat[i+1]-top)*view.zoom/texture.height}group.mesh.geometry.attributes.aUV.buffer.update();group.mesh.texture=texture;group.dirty=false}
  if(viewChanged)this.textureView={left,top,right,bottom,zoom:view.zoom};
 }
  private clearGround(){for(const group of this.ground.values()){group.mesh.geometry.destroy();group.mesh.destroy()}this.ground.clear();for(const sprite of this.sprites.values()){sprite.texture=Texture.EMPTY;sprite.destroy()}this.sprites.clear();this.texture?.destroy(true);this.texture=undefined;this.allocationKey='';this.key='';this.geometryKey='';this.textureView=undefined;this.surface=undefined;this.visible=undefined}
 clear(){this.deck.clear();this.clearGround()}
 dispose(){this.clear();this.stamp.destroy()}
}
