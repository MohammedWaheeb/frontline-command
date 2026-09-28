/** Actual Go parking-save input and actual authored sprite pixels. The optional
 * cliff surface is explicitly synthetic presentation geometry, never a Go map
 * or movement claim. Pointer events are sent by Playwright to the real canvas. */
import {BattlefieldRenderer,type BattlefieldGesture} from '../../src/render/battlefield';
import {ArtLibrary,type SpriteSheet,type FrameSet} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import type {Entity,Point,Rect} from '../../src/runtime';
import type {Application,Container,Sprite} from 'pixi.js';
import type {TerrainSurface} from '../../src/render/terrain-surface';

const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog);
const host=document.getElementById('field')!,events:BattlefieldGesture[]=[],errors:string[]=[];
let renderer:BattlefieldRenderer|undefined,art:ArtLibrary|undefined;
let retiredFrame:FrameSet|undefined,graphicsExtension:WEBGL_lose_context|null=null;
interface Pose {state:string;direction:number;frame:number}
interface Part {root:Container;beauty:Sprite;team:Sprite;shadow:Sprite;poses:Record<string,Pose>}
interface ActorProbe {entity:Entity;parts:Part[];root:Container;sheet:SpriteSheet;groundDepth:(now:number,reducedMotion:boolean)=>number;missingArt:boolean;standIn:boolean}
interface Internals {actors:Map<number,ActorProbe>;world:Container;surface:TerrainSurface;app:Application;lost:boolean}
interface Pixels {width:number;height:number;data:Uint8ClampedArray;descriptor:{ink_bounds?:{x:number;y:number;w:number;h:number}};url:string;key:string}
const internals=()=>renderer as unknown as Internals;
const inside=(p:Point,r:Rect,tolerance=0)=>p.x>=r.left-tolerance&&p.x<=r.right+tolerance&&p.y>=r.top-tolerance&&p.y<=r.bottom+tolerance;
const alpha=(pixels:Pixels,x:number,y:number)=>x>=0&&y>=0&&x<pixels.width&&y<pixels.height?pixels.data[(y*pixels.width+x)*4+3]:0;
const at=(sprite:Sprite,pixels:Pixels,x:number,y:number)=>sprite.toGlobal({x:x+.5-sprite.anchor.x*pixels.width,y:y+.5-sprite.anchor.y*pixels.height});
async function pixels(actor:ActorProbe,part:Part,layer:'beauty'|'team'|'shadow'):Promise<Pixels|undefined>{
 const pose=part.poses[layer];if(!pose||!part[layer].visible)return;
 const source=actor.sheet.sourceFrame(pose.state,pose.direction,pose.frame),key=`${source.state}/d${String(source.direction).padStart(2,'0')}_f${String(source.index).padStart(2,'0')}`;
 const root=`/art/sprites/${actor.sheet.id}/`,meta=await(await fetch(`${root}${actor.sheet.id}.sprite.json`)).json();
 const scale=actor.sheet.pixelScale===.5?'2x':'1x';
 for(const file of meta.atlases[scale][layer]??[]){
  const atlas=await(await fetch(root+file)).json(),descriptor=atlas.frames[key];if(!descriptor)continue;
  const f=descriptor.frame,url=root+atlas.meta.image,blob=await(await fetch(url)).blob(),image=await createImageBitmap(blob,f.x,f.y,f.w,f.h);
  const canvas=document.createElement('canvas');canvas.width=f.w;canvas.height=f.h;const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,0,0);image.close();
  return {width:f.w,height:f.h,data:context.getImageData(0,0,f.w,f.h).data,descriptor,url,key};
 }
 throw Error(`Displayed frame metadata missing ${actor.sheet.id}/${layer}/${key}`);
}
async function release(){renderer?.dispose();renderer=undefined;await art?.release();return art?.statistics}
const qa={
 async prepare(id:7|11,quality:'standard'|'high',zoom=1,cliff=false){
  await release();events.length=0;
  const fixture=await(await fetch('/parking-fixtures/US-six.json')).json(),response=await fetch('/parking-fixtures/US-six.save.json');
  await runtime.load(new Uint8Array(await response.arrayBuffer()),[1]);const hash=await runtime.hash();if(hash!==fixture.hash)throw Error('Native save/hash mismatch');
  const snapshot=runtime.current!,entity=snapshot.entities.find(e=>e.id===id)!;if(!entity?.landed)throw Error('Actual landed aircraft missing');
  const map=await runtime.map();
  // Keep actual Go actor positions unchanged. Only this separate occlusion
  // exercise replaces the displayed public terrain with one foreground cliff.
  if(cliff){const x=Math.floor(entity.position!.x/1000)+1,y=Math.floor(entity.position!.y/1000)+1;map.tiles=map.tiles.map(tile=>({...tile}));map.tiles[y*map.width+x]={terrain:'cliff',height:4}}
  art=new ArtLibrary();renderer=await BattlefieldRenderer.create(host,{map,catalog,art,settings:{...DEFAULT_SETTINGS,artQuality:quality,reducedMotion:true,screenShake:0,healthBars:'damaged'},onGesture:event=>events.push(event),onError:error=>{if(!error.message.startsWith('Graphics context lost.'))errors.push(error.message)}});
  renderer.setSnapshot(snapshot);renderer.center(entity.position!);renderer.zoomBy(zoom);await renderer.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,100));await art.settle();
  const actor=internals().actors.get(id)!;if(actor.missingArt||actor.standIn)throw Error('Aircraft art fallback');
  const part=actor.parts.find(part=>part.root.visible)!,beauty=await pixels(actor,part,'beauty');if(!beauty)throw Error('Beauty missing');
  const offset=id===7?{x:0,y:-51}:{x:42,y:-20},x=Math.round(part.beauty.anchor.x*beauty.width+offset.x/actor.sheet.pixelScale),y=Math.round(part.beauty.anchor.y*beauty.height+offset.y/actor.sheet.pixelScale);
  const opacity=alpha(beauty,x,y),body=at(part.beauty,beauty,x,y);if(opacity<200)throw Error(`Known actual body pixel is not opaque: ${opacity}`);
  const bounds=renderer.bounds(entity)!,bodyInk:Rect[]=[];
  for(const layer of ['beauty','team'] as const){const data=layer==='beauty'?beauty:await pixels(actor,part,layer),ink=data?.descriptor.ink_bounds;if(!data||!ink)continue;const a=at(part[layer],data,ink.x,ink.y),b=at(part[layer],data,ink.x+ink.w-1,ink.y+ink.h-1);bodyInk.push({left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)})}
  if(!bodyInk.length)throw Error('Actual ink descriptors missing');
  const union={left:Math.min(...bodyInk.map(r=>r.left)),right:Math.max(...bodyInk.map(r=>r.right)),top:Math.min(...bodyInk.map(r=>r.top)),bottom:Math.max(...bodyInk.map(r=>r.bottom))};
  const padding=at(part.beauty,beauty,2,2);if(alpha(beauty,2,2)!==0||inside(padding,union,DEFAULT_SETTINGS.selectionTolerance))throw Error('Padding negative control not outside ink');
  let shadow:Point|undefined;const shadowData=await pixels(actor,part,'shadow');
  if(shadowData)for(let sy=0;sy<shadowData.height&&!shadow;sy++)for(let sx=0;sx<shadowData.width;sx++)if(alpha(shadowData,sx,sy)>=160){const point=at(part.shadow,shadowData,sx,sy);if(!inside(point,union,DEFAULT_SETTINGS.selectionTolerance+2)){shadow=point;break}}
  let nearBody:Point|undefined;const team=await pixels(actor,part,'team');
  if(id===7)for(let py=1;py<beauty.height-1&&!nearBody;py++)for(let px=1;px<beauty.width-1;px++)if(alpha(beauty,px,py)>=200){
   const nx=px-Math.ceil(3/actor.sheet.pixelScale);if(nx<1||alpha(beauty,nx,py)!==0||team&&alpha(team,nx,py)!==0)continue;
   nearBody=at(part.beauty,beauty,nx,py);break;
  }
  if(id===7&&!nearBody)throw Error('Known transparent tolerance point missing');
  let buildingFront:Point|undefined;
  if(id===11){const building=internals().actors.get(6)!,body=building.parts.find(p=>p.root.visible)!,data=await pixels(building,body,'beauty');if(!data)throw Error('Actual airfield body missing');
   for(let by=0;by<data.height&&!buildingFront;by++)for(let bx=0;bx<data.width;bx++)if(alpha(data,bx,by)>=220){const point=at(body.beauty,data,bx,by);if(!inside(point,union))continue;const local=part.beauty.toLocal(point),px=Math.floor(local.x+part.beauty.anchor.x*beauty.width),py=Math.floor(local.y+part.beauty.anchor.y*beauty.height);if(alpha(beauty,px,py)===0&&(!team||alpha(team,px,py)===0)){buildingFront=point;break}}
   if(!buildingFront)throw Error('Actual opaque airfield/transparent-aircraft envelope overlap missing');
  }
  let occluded:Point|undefined;
  if(cliff){const surface=internals().surface,world=internals().world,depth=actor.groundDepth(performance.now(),true);for(let py=0;py<beauty.height&&!occluded;py++)for(let px=0;px<beauty.width;px++)if(alpha(beauty,px,py)>=220){const point=at(part.beauty,beauty,px,py),hit=surface.pickSurface(world.toLocal(point));if(hit&&hit.triangle.depth>depth+.01&&inside(point,union)){occluded=point;break}}if(!occluded)throw Error('Synthetic foreground cliff did not cover an actual body pixel')}
  return {id,type:entity.type,quality,zoom,syntheticCliff:cliff,hash,afterHash:await runtime.hash(),pose:part.poses.beauty,body:{x:body.x,y:body.y},bodyPixel:{x,y,alpha:opacity,url:beauty.url,key:beauty.key},bounds,union,padding:{x:padding.x,y:padding.y},shadow:shadow&&{x:shadow.x,y:shadow.y},occluded:occluded&&{x:occluded.x,y:occluded.y},nearBody:nearBody&&{x:nearBody.x,y:nearBody.y},buildingFront:buildingFront&&{x:buildingFront.x,y:buildingFront.y},statistics:art.statistics,bodyOutsideCurrentBounds:!inside(body,bounds,DEFAULT_SETTINGS.selectionTolerance),tolerance:DEFAULT_SETTINGS.selectionTolerance,errors:[...errors]};
 },
 takeClicks(){const clicks=events.filter(e=>e.kind==='click');events.length=0;return clicks},
 async evict(){
  internals().app.stop();const actor=internals().actors.get(7)!,sheet=actor.sheet,pose=actor.parts[0].poses.beauty,before=sheet.statistics;
  retiredFrame=sheet.frame('beauty',pose.state,pose.direction,pose.frame);sheet.evictBefore(Infinity);await new Promise(resolve=>setTimeout(resolve,30));
  return {before,after:sheet.statistics,oldFrameStillHits:retiredFrame?.containsAlpha?.(112,65,0)??false,sameSheet:await art!.sheet(sheet.id)===sheet};
 },
 async reload(){await renderer!.whenAssetsReady();return {sheet:internals().actors.get(7)!.sheet.statistics,statistics:art!.statistics,oldFrameStillHits:retiredFrame?.containsAlpha?.(112,65,0)??false}},
 start(){internals().app.start()},
 graphicsLost(){return internals().lost},
 loseGraphics(){const canvas=host.querySelector('canvas')!,gl=canvas.getContext('webgl2')??canvas.getContext('webgl');if(!gl)throw Error('No WebGL context');graphicsExtension=gl.getExtension('WEBGL_lose_context');if(!graphicsExtension)throw Error('Context-loss extension unavailable');graphicsExtension.loseContext()},
 restoreGraphics(){if(!graphicsExtension)throw Error('No context-loss request');graphicsExtension.restoreContext()},
 statistics(){return art!.statistics},
 failedPages(){return (internals().actors.get(7)!.sheet as unknown as {pages:Array<{url:string;failed?:boolean;alpha?:{bits:Uint8Array};texture?:unknown}>}).pages.filter(page=>page.failed).map(page=>({url:page.url,pickingBytes:page.alpha?.bits.byteLength??0,resident:!!page.texture}))},
 async fallback(){
  const hash=await runtime.hash(),snapshot=runtime.current!,entity=snapshot.entities.find(e=>e.id===7)!;await release();events.length=0;art=new ArtLibrary();const index=await art.init();art.index={...index,sprites:{}};
  renderer=await BattlefieldRenderer.create(host,{map:await runtime.map(),catalog,art,settings:{...DEFAULT_SETTINGS,reducedMotion:true,screenShake:0},onGesture:event=>events.push(event),onError:error=>errors.push(error.message)});renderer.setSnapshot(snapshot);renderer.center(entity.position!);await renderer.whenAssetsReady();
  const actor=internals().actors.get(7)!,point=actor.root.toGlobal({x:0,y:-8});return {hash,afterHash:await runtime.hash(),missingArt:actor.missingArt,point:{x:point.x,y:point.y},statistics:art.statistics};
 },
 async dispose(){const statistics=await release();runtime.dispose();return {statistics,errors,canvases:host.querySelectorAll('canvas').length}},
};
Object.defineProperty(window,'aircraftHitboxQA',{value:qa});document.body.dataset.ready='true';
