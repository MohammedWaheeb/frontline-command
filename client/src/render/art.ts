import {Assets,Rectangle,Texture} from 'pixi.js';
import {classify,type CatalogIndex} from '../content/catalog';
import {authoredArtId} from './art-id';
import {artUIKeys} from '../content/art-ui';
import {makeAlphaMask,alphaInFrame,type AlphaMask} from './alpha-picking';
import type {EffectDescriptor} from '../content/effect-assets.mjs';

export interface ArtIndex {effects?:EffectDescriptor;format:1;sprites:Record<string,string>;terrain:string[];portraits:string[];buildIcons?:string[];chrome:string[];icons:boolean;emblems:boolean}
export interface SpriteState {name:string;part:string;directions:number;frames:number;fps:number;loop:boolean;layers?:string[];progress_driven?:boolean}
export interface SpriteMeta {
 id:string;faction?:string;frame_size_2x:[number,number];anchor_2x:[number,number];layers:string[];
 atlases:Record<'1x'|'2x',Record<string,string[]>>;states:SpriteState[];
 aliases?:Array<{name:string;source:string;reverse?:boolean;progress_driven?:boolean}>;
 footprint_tiles?:[number,number]|null;footprint_radius_mt?:number|null;turret_pivot_mt?:[number,number]|null;
 squad?:{members:number;member_offsets_mt:[number,number][]}|null;air?:{cruise_altitude_mt:number}|null;
 hardpoints_2x_rel_anchor?:Record<string,Record<string,[number,number]>>;
}
interface AtlasFrame {frame:{x:number;y:number;w:number;h:number};anchor?:{x:number;y:number};sourceSize:{w:number;h:number};ink_bounds?:{x:number;y:number;w:number;h:number}|null}
export interface FrameSet {texture:Texture;atlasTexture:Texture;anchorX:number;anchorY:number;bodyBottom?:number;inkBounds?:{x:number;y:number;w:number;h:number};containsAlpha?:(x:number,y:number,tolerance:number)=>boolean}
interface AtlasPage {
 url:string;descriptors:Record<string,AtlasFrame>;layer:string;frames:Map<string,FrameSet>;
 generation:number;alpha?:AlphaMask;texture?:Texture;pending?:Promise<void>;unloading?:Promise<void>;failed?:boolean;lastUsed:number;bytes:number;
}
export class SpriteSheet {
 readonly states=new Map<string,SpriteState>();private readonly lookup=new Map<string,AtlasPage>();private disposed=false;
 private readonly aliases=new Map<string,{source:string;reverse?:boolean}>();
 constructor(readonly id:string,readonly meta:SpriteMeta,readonly scale:'1x'|'2x',private pages:AtlasPage[]){
  for(const state of meta.states)this.states.set(state.name,state);
  // Aliases reuse the exact authored source frames, including reversed
  // deployment/construction. Missing or cyclic sources are never advertised.
  for(let pass=0;pass<(meta.aliases?.length??0);pass++)for(const alias of meta.aliases??[]){
   const source=this.states.get(alias.source);if(!source||this.states.has(alias.name))continue;
   this.states.set(alias.name,{...source,name:alias.name,progress_driven:alias.progress_driven??source.progress_driven});this.aliases.set(alias.name,alias);
  }
  for(const page of pages)for(const key of Object.keys(page.descriptors))this.lookup.set(`${page.layer}|${key}`,page);
 }
 /** Screen scale that converts this atlas to 1× world pixels. */
 get pixelScale(){return this.scale==='2x'?0.5:1}
 get statistics(){return {indexedPages:this.pages.length,residentPages:this.pages.filter(page=>page.texture).length,residentBytes:this.pages.reduce((sum,page)=>sum+(page.texture?page.bytes:0),0),pickingBytes:this.pages.reduce((sum,page)=>sum+(page.alpha?.bits.byteLength??0),0)}}
 private key(layer:string,state:string,direction:number,index:number){return `${layer}|${state}/d${String(direction).padStart(2,'0')}_f${String(index).padStart(2,'0')}`}
 sourceFrame(state:string,direction:number,index:number){
  for(let depth=0;depth<this.aliases.size;depth++){const alias=this.aliases.get(state);if(!alias)break;const source=this.states.get(alias.source)!;if(alias.reverse)index=source.frames-1-index;state=alias.source}
  return {state,direction,index};
 }
 hasFrame(layer:string,state:string,direction:number,index:number){const source=this.sourceFrame(state,direction,index);return this.lookup.has(this.key(layer,source.state,source.direction,source.index))}
 frame(layer:string,state:string,direction:number,index:number):FrameSet|undefined{
  const source=this.sourceFrame(state,direction,index),key=this.key(layer,source.state,source.direction,source.index),page=this.lookup.get(key);if(!page||this.disposed)return;
  page.lastUsed=performance.now();if(!page.texture)this.load(page);return page.frames.get(key);
 }
 has(state:string){return this.states.has(state)}
 private load(page:AtlasPage){
  if(page.pending||page.failed||this.disposed)return;
  page.pending=(async()=>{
   await page.unloading;if(this.disposed)return;
   // Atlas rectangles are physical pixels; suppress Pixi's @2x inference.
   const generation=++page.generation,texture=await Assets.load<Texture>({src:page.url,data:{resolution:1}});page.texture=texture;
   page.bytes=texture.source.pixelWidth*texture.source.pixelHeight*4;
   if(page.layer==='beauty'||page.layer==='team'){
    // Decode picking opacity once on page admission, never from the rendered
    // world or on a pointer event. One bit/pixel adds at most ~1/32 of these
    // resident RGBA texture bytes; shadow pages allocate no picking data.
    const canvas=document.createElement('canvas');canvas.width=texture.source.pixelWidth;canvas.height=texture.source.pixelHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Atlas picking context unavailable');
    context.drawImage(texture.source.resource as CanvasImageSource,0,0);
    page.alpha=makeAlphaMask(canvas.width,canvas.height,context.getImageData(0,0,canvas.width,canvas.height).data);
    canvas.width=canvas.height=0;
   }
   for(const [key,frame] of Object.entries(page.descriptors)){
    const t=new Texture({source:texture.source,frame:new Rectangle(frame.frame.x,frame.frame.y,frame.frame.w,frame.frame.h)});
    const ink=frame.ink_bounds,anchorY=frame.anchor?.y??.5;
    const valid=ink&&[ink.x,ink.y,ink.w,ink.h].every(Number.isInteger)&&ink.x>=0&&ink.y>=0&&ink.w>0&&ink.h>0&&ink.x+ink.w<=frame.frame.w&&ink.y+ink.h<=frame.frame.h;
    page.frames.set(`${page.layer}|${key}`,{texture:t,atlasTexture:texture,anchorX:frame.anchor?.x??.5,anchorY,...page.alpha?{containsAlpha:(x:number,y:number,tolerance:number)=>page.generation===generation&&!!page.alpha&&alphaInFrame(page.alpha,frame.frame,x,y,tolerance)}:{},...valid?{bodyBottom:(ink.y+ink.h-anchorY*frame.frame.h)*this.pixelScale,inkBounds:ink}:{}});
   }
  })().catch(async error=>{page.failed=true;page.generation++;page.alpha=undefined;for(const frame of page.frames.values())frame.texture.destroy(false);page.frames.clear();const admitted=!!page.texture;page.texture=undefined;if(admitted)await Assets.unload(page.url).catch(()=>{});console.warn('Sprite page failed to load',this.id,page.url,error)}).finally(()=>{page.pending=undefined});
 }
 async settle(){await Promise.all(this.pages.map(page=>page.pending))}
 private unload(page:AtlasPage){
  if(page.pending||!page.texture)return;
  page.generation++;page.alpha=undefined;for(const frame of page.frames.values())frame.texture.destroy(false);page.frames.clear();page.texture=undefined;
  page.unloading=Assets.unload(page.url).catch(()=>{}).finally(()=>{page.unloading=undefined});
 }
 evictBefore(before:number){for(const page of this.pages)if(page.lastUsed<before)this.unload(page)}
 async dispose(){this.disposed=true;await this.settle();for(const page of this.pages)this.unload(page);await Promise.all(this.pages.map(page=>page.unloading))}
}

/** Loads only art that actually exists, releasing GPU textures at match end. */
export class ArtLibrary {
 index:ArtIndex|undefined;
 private sheets=new Map<string,Promise<SpriteSheet|undefined>>();
 private images=new Map<string,Promise<HTMLImageElement>>();
 private cameos=new Map<string,Promise<string|undefined>>();
 scale:'1x'|'2x'='1x';
 private releaseWork:Promise<void>=Promise.resolve();
 private loaded=new Set<SpriteSheet>();
 configure(quality:'auto'|'high'|'standard'){this.scale=quality==='high'?'2x':'1x'}
 get statistics(){return [...this.loaded].reduce((sum,sheet)=>{const next=sheet.statistics;return {indexedPages:sum.indexedPages+next.indexedPages,residentPages:sum.residentPages+next.residentPages,residentBytes:sum.residentBytes+next.residentBytes,pickingBytes:sum.pickingBytes+next.pickingBytes}},{indexedPages:0,residentPages:0,residentBytes:0,pickingBytes:0})}
 async settle(){await Promise.all([...this.loaded].map(sheet=>sheet.settle()))}
 /** Keep current on-screen frames; reclaim animations unused for ten seconds. */
 trim(){const budget=this.scale==='2x'?384*1024*1024:192*1024*1024;if(this.statistics.residentBytes>budget)for(const sheet of this.loaded)sheet.evictBefore(performance.now()-10000)}
 async init(){
  if(this.index)return this.index;
  const response=await fetch('/art/index.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('Art index unavailable');
  this.index=await response.json() as ArtIndex;return this.index;
 }
 has(id:string){return !!this.index?.sprites[id]}
 /** Resolve the authored sprite for an entity type, with an explicit stand-in flag. */
 resolve(type:string,ownerFaction:string|undefined,catalog?:CatalogIndex):{id:string;standIn:boolean}|undefined{
  const direct=this.directId(type,ownerFaction);
  if(direct&&this.has(direct))return {id:direct,standIn:false};
  const standIn=this.standIn(type,ownerFaction,catalog);
  return standIn?{id:standIn,standIn:true}:undefined;
 }
 directId(type:string,ownerFaction?:string){return authoredArtId(type,ownerFaction)}
 private standIn(type:string,faction:string|undefined,catalog?:CatalogIndex){
  const u=catalog?.units.get(type);
  const pick=(...ids:string[])=>ids.find(id=>this.has(id));
  if(u){
   const c=classify(u);
   if(c==='infantry')return pick(`unit.${u.faction}.rifle`,'unit.US.rifle','unit.SY.rifle','unit.IR.rifle','unit.SA.rifle');
   if(c==='aircraft'||c==='drone'||c==='rotor')return pick(`unit.${u.faction}.strike`,'unit.IR.strike','unit.US.fighter');
   if(c==='tank')return pick(`unit.${u.faction}.tank`,'unit.US.tank','unit.SA.tank');
   if(u.role==='mobile_abm'||u.role==='launcher'||u.role==='artillery')return pick(`unit.${u.faction}.${u.role}`,'unit.SA.mobile_abm','unit.US.tank');
   return pick(`unit.${u.faction}.car`,'unit.SY.car','unit.US.car','unit.US.tank');
  }
  if(catalog?.buildings.has(type)||faction)return undefined; // Buildings without art use the procedural structure, never another building's art.
  return undefined;
 }
 sheet(id:string):Promise<SpriteSheet|undefined>{
  const scale=this.scale,key=`${id}|${scale}`;let p=this.sheets.get(key);
  if(!p){p=this.loadSheet(id,scale).catch(error=>{console.warn('Sprite failed to load',id,error);return undefined});this.sheets.set(key,p)}
  return p;
 }
 private async loadSheet(id:string,requestedScale:'1x'|'2x'){
  await this.releaseWork;
  const index=await this.init(),rel=index.sprites[id];if(!rel)return undefined;
  const base=`/art/${rel.slice(0,rel.lastIndexOf('/')+1)}`;
  const response=await fetch(`/art/${rel}`);if(!response.ok)throw new Error('Sprite metadata unavailable');
  const meta=await response.json() as SpriteMeta,scale=meta.atlases[requestedScale]?requestedScale:'1x';
  const pages:AtlasPage[]=[];
  // Metadata is cheap. Decode and upload a texture only when an on-screen actor
  // requests a frame on that page, rather than every animation/direction at once.
  for(const [layer,files] of Object.entries(meta.atlases[scale]))for(const file of files){
   const result=await fetch(base+file);if(!result.ok)throw new Error('Sprite atlas unavailable');
   const atlas=await result.json() as {frames:Record<string,AtlasFrame>;meta:{image:string}};
   pages.push({url:base+atlas.meta.image,layer,descriptors:atlas.frames,frames:new Map(),lastUsed:0,bytes:0,generation:0});
  }
  const sheet=new SpriteSheet(id,meta,scale,pages);this.loaded.add(sheet);return sheet;
 }
 image(url:string){let p=this.images.get(url);if(!p){p=new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Image failed: '+url));img.src=url});this.images.set(url,p)}return p}
 terrain(name:string){return this.index?.terrain.includes(name)?this.image(`/art/terrain/${name}.png`):undefined}
 /** Illustrated production/selection cameo composed from the real sprite layers. */
 cameo(id:string,teamColor:string,state='idle',direction?:number,purpose:'build'|'portrait'='portrait'):Promise<string|undefined>{
  const key=`${id}|${teamColor}|${state}|${direction}|${purpose}`;let p=this.cameos.get(key);
  if(!p){p=this.composeCameo(id,teamColor,state,direction,purpose).catch(()=>undefined);this.cameos.set(key,p)}
  return p;
 }
 private async composeCameo(id:string,teamColor:string,stateName:string,direction:number|undefined,purpose:'build'|'portrait'){
  const index=await this.init(),keys=artUIKeys(index,id);
  const build=purpose==='build'&&keys.build,key=build||keys.portrait;
  const ui=build?'icons/build':keys.portrait?'portraits':undefined;
  if(ui){
   const [beauty,team]=await Promise.all(['beauty','team'].map(layer=>this.image(`/art/ui/${ui}/${key}@2x.${layer}.png`)));
   if(beauty.naturalWidth!==team.naturalWidth||beauty.naturalHeight!==team.naturalHeight)throw Error('Illustration layers do not match');
   const canvas=document.createElement('canvas');canvas.width=beauty.naturalWidth;canvas.height=beauty.naturalHeight;const ctx=canvas.getContext('2d')!;
   ctx.drawImage(beauty,0,0);const tinted=document.createElement('canvas');tinted.width=canvas.width;tinted.height=canvas.height;const mask=tinted.getContext('2d')!;
   mask.drawImage(team,0,0);mask.globalCompositeOperation='multiply';mask.fillStyle=teamColor;mask.fillRect(0,0,tinted.width,tinted.height);mask.globalCompositeOperation='destination-in';mask.drawImage(team,0,0);ctx.drawImage(tinted,0,0);
   return canvas.toDataURL('image/png');
  }
  const rel=index.sprites[id];if(!rel)return undefined;
  const base=`/art/${rel.slice(0,rel.lastIndexOf('/')+1)}`;
  const meta=await (await fetch(`/art/${rel}`)).json() as SpriteMeta;
  const state=meta.states.find(s=>s.name===stateName)??meta.states.find(s=>['idle','fly','hover','full'].includes(s.name))??meta.states[0];
  const dir=direction??(state.directions>=16?Math.round(state.directions*3/16)%state.directions:state.directions>=8?1:0);
  const frameKey=`${state.name}/d${String(dir).padStart(2,'0')}_f00`;
  const canvas=document.createElement('canvas');const [w,h]=meta.frame_size_2x;canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d')!;
  // Turreted vehicles combine hull and aim layers at matching headings.
  const parts:[string,string][]=[[state.name,frameKey]];
  if(state.part==='hull'&&meta.states.some(s=>s.name==='aim')){const aim=meta.states.find(s=>s.name==='aim')!;parts.push(['aim',`aim/d${String(Math.round(dir*aim.directions/state.directions)%aim.directions).padStart(2,'0')}_f00`])}
  for(const [partState,key] of parts){
   for(const layer of ['beauty','team']){
    const files=meta.atlases['2x'][layer];if(!files)continue;
    for(const file of files){
     const atlas=await (await fetch(base+file)).json() as {frames:Record<string,AtlasFrame>;meta:{image:string}};
     const f=atlas.frames[key];if(!f)continue;
     const img=await this.image(base+atlas.meta.image);
     if(layer==='team'){
      const tmp=document.createElement('canvas');tmp.width=f.frame.w;tmp.height=f.frame.h;const t=tmp.getContext('2d')!;
      t.drawImage(img,f.frame.x,f.frame.y,f.frame.w,f.frame.h,0,0,f.frame.w,f.frame.h);
      t.globalCompositeOperation='multiply';t.fillStyle=teamColor;t.fillRect(0,0,f.frame.w,f.frame.h);
      t.globalCompositeOperation='destination-in';t.drawImage(img,f.frame.x,f.frame.y,f.frame.w,f.frame.h,0,0,f.frame.w,f.frame.h);
      ctx.drawImage(tmp,0,0);
     }else ctx.drawImage(img,f.frame.x,f.frame.y,f.frame.w,f.frame.h,0,0,f.frame.w,f.frame.h);
     void partState;break;
    }
   }
  }
  // Crop to visible pixels so cameos frame the subject tightly.
  const data=ctx.getImageData(0,0,w,h).data;let minX=w,minY=h,maxX=0,maxY=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>16){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
  if(maxX<=minX)return undefined;
  const pad=6,cw=maxX-minX+pad*2,ch=maxY-minY+pad*2,out=document.createElement('canvas');out.width=cw;out.height=ch;
  out.getContext('2d')!.drawImage(canvas,minX-pad,minY-pad,cw,ch,0,0,cw,ch);
  return out.toDataURL('image/png');
 }
 /** Release GPU textures for a finished match; cameo data URLs stay cached. */
 release(){
  const previous=this.sheets;this.sheets=new Map();
  const earlier=this.releaseWork;
  this.releaseWork=(async()=>{await earlier;const sheets=await Promise.all(previous.values());for(const sheet of sheets){if(sheet){await sheet.dispose();this.loaded.delete(sheet)}}})();
  return this.releaseWork;
 }
}
export const art=new ArtLibrary();
