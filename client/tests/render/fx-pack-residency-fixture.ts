import {Application,Graphics,Sprite,Text,type Texture} from 'pixi.js';
import {EffectLibrary,type EffectSheet,type EffectVariant} from '../../src/render/effect-assets';
import {EFFECT_VARIANTS} from '../../src/content/effect-assets.mjs';

// Real frozen authored pages and real Pixi/ImageBitmap backend. This is a
// residency/contact course, not a gameplay fixture or a subjective art review.
const app=new Application();await app.init({width:1800,height:1060,resolution:1,background:0x181b13,antialias:false});document.body.appendChild(app.canvas);
const artResponse=await fetch('/art/index.json');if(!artResponse.ok)throw Error('Frozen art index unavailable');
const descriptor=(await artResponse.json()).effects;
const errors:string[]=[],requests:Array<{url:string;aborted:boolean}>=[];
const fetcher:typeof fetch=async(input,init)=>{const record={url:String(input),aborted:false};requests.push(record);try{return await fetch(input,init)}catch(error){record.aborted=init?.signal?.aborted===true;throw error}};
const effects=new EffectLibrary({fetch:fetcher,onError:error=>errors.push(error.message)}),index=await effects.init(descriptor);
if(!index)throw Error('Frozen product has no effect index');
const ids=Object.keys(index.effects).sort(),sheets:EffectSheet[]=[],chosen=new Map<string,{frame:number;alphaPixels:number}>();
let phase='ready',pressure:EffectLibrary|undefined,race:EffectLibrary|undefined,disposed=false;
type PageRef={sheet:EffectSheet;variant:EffectVariant;frame:number;page:number;bytes:number;url:string};
const pageRefs:PageRef[]=[];
function check(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
function clear(){for(const child of app.stage.removeChildren())child.destroy()}
function stats(){return {phase,statistics:effects.statistics,pressure:pressure?.statistics,race:race?.statistics,errors:[...errors],requests:[...requests],canvases:document.querySelectorAll('canvas').length}}
function render(){app.renderer.render({container:app.stage})}
function rgba(texture:Texture){const data=app.renderer.extract.pixels(texture);let alphaPixels=0;for(let i=3;i<data.pixels.length;i+=4)if(data.pixels[i]>0)alphaPixels++;return {width:data.width,height:data.height,alphaPixels}}
function zero(library:EffectLibrary){const s=library.statistics;check(s.residentPages===0&&s.residentBytes===0&&s.allocatedBytes===0,'Residency survived release');return s}
function count(url:string){return requests.filter(value=>value.url===url).length}
async function loadSheet(library:EffectLibrary,id:string){const sheet=await library.load(id);check(sheet,`Missing real effect ${id}`);return sheet}
function addText(text:string,x:number,y:number,size=14){const label=new Text({text,style:{fontFamily:'Arial',fontSize:size,fill:0xe4ce8c}});label.position.set(x,y);app.stage.addChild(label)}
const qa={stats,
 async full(){
  phase='all-pages';check(ids.length===71,`Expected frozen 71-effect pack, found ${ids.length}`);
  for(const id of ids)sheets.push(await loadSheet(effects,id));
  let lazyMisses=0,logicalFrames=0,expectedBytes=0,expectedPages=0;
  for(const sheet of sheets){
   const pages=new Map<number,PageRef>();expectedPages+=sheet.meta.pages.length;
   expectedBytes+=sheet.meta.pages.reduce((sum,page)=>sum+page.width*page.height*4,0);
   for(const variant of EFFECT_VARIANTS){const clip=sheet.clip(variant);check(clip,`${sheet.id}: missing ${variant}`);
    for(let i=0;i<clip.frames.length;i++){
     logicalFrames++;if(!sheet.frame(variant,i))lazyMisses++;
     const frame=clip.frames[i],page=sheet.meta.pages[frame.page];
     if(!pages.has(frame.page))pages.set(frame.page,{sheet,variant,frame:i,page:frame.page,bytes:page.width*page.height*4,url:'/art/'+index.effects[sheet.id].url.replace(/effect\.json$/,page.file)});
    }
   }
   check(pages.size===sheet.meta.pages.length,`${sheet.id}: a packaged page is unreachable through all five variants`);pageRefs.push(...pages.values());
  }
  check(expectedBytes===30622144&&expectedPages===132,'Frozen authored page inventory changed');check(expectedBytes<=32*1024*1024,'Pack exceeds default residency budget');
  const pending=effects.statistics;check(pending.allocatedBytes===expectedBytes,'All real pages must reserve within default budget');
  await effects.settle();check(effects.statistics.residentPages===expectedPages&&effects.statistics.residentBytes===expectedBytes,'Not all authored pages decoded');
  const pageUploads=[];
  for(const ref of pageRefs){const frame=ref.sheet.frame(ref.variant,ref.frame);check(frame,'Loaded page did not return its crop');
   const meta=ref.sheet.clip(ref.variant)!.frames[ref.frame],pixels=rgba(frame.texture);check(pixels.width===meta.w&&pixels.height===meta.h,'Actual Pixi crop dimensions differ');
   pageUploads.push({id:ref.sheet.id,page:ref.page,bytes:ref.bytes,...pixels});
  }
  const variants=[];
  for(const sheet of sheets)for(const variant of EFFECT_VARIANTS){
   const clip=sheet.clip(variant)!;
   for(let i=0;i<clip.frames.length;i++){
    const frame=sheet.frame(variant,i),meta=clip.frames[i];check(frame,`${sheet.id} ${variant} frame ${i} unavailable`);
    check(frame.pixelScale===1/sheet.meta.resolution&&frame.anchorX===meta.origin[0]/meta.w&&frame.anchorY===meta.origin[1]/meta.h,'Native origin/scale differs from authored metadata');
   }
   let selected: {frame:number;alphaPixels:number}|undefined;
   for(const i of [...new Set([Math.floor(clip.frames.length/2),0,clip.frames.length-1,...clip.frames.keys()])]){
    const pixels=rgba(sheet.frame(variant,i)!.texture);if(pixels.alphaPixels>0){selected={frame:i,alphaPixels:pixels.alphaPixels};break}
   }
   check(selected,`${sheet.id} ${variant}: every real frame is transparent`);chosen.set(`${sheet.id}:${variant}`,selected);
   variants.push({id:sheet.id,variant,clip:sheet.meta.variants[variant],frames:clip.frames.length,fps:clip.fps,loop:clip.loop,...selected});
  }
  check(errors.length===0,'Effect loader reported an error');
  return {effects:ids.length,variants,logicalFrames,lazyMisses,pageUploads,pending,expectedPages,expectedBytes,statistics:effects.statistics,contactPages:Math.ceil(ids.length/4),renderer:app.renderer.type};
 },
 contact(page:number){
  phase='native-contact';check(Number.isInteger(page)&&page>=0&&page<Math.ceil(ids.length/4),'Invalid contact page');clear();
  addText(`Authored FX residency · real frozen PNGs · page ${page+1}/${Math.ceil(ids.length/4)} · native 1× scale · not subjective art approval`,20,10,16);
  EFFECT_VARIANTS.forEach((variant,column)=>addText(variant,25+column*355,38));
  const positions=[];
  for(const [row,id] of ids.slice(page*4,page*4+4).entries()){
   const sheet=sheets.find(sheet=>sheet.id===id)!;addText(id,20,68+row*245,14);
   for(const [column,variant] of EFFECT_VARIANTS.entries()){
    const selection=chosen.get(`${id}:${variant}`);check(selection,'Call full() before contact()');const frame=sheet.frame(variant,selection.frame);check(frame,'Contact crop absent');
    const meta=sheet.clip(variant)!.frames[selection.frame],x=25+column*355+(330-meta.w*frame.pixelScale)/2,y=100+row*245+(195-meta.h*frame.pixelScale)/2;
    const sprite=new Sprite(frame.texture);sprite.anchor.set(frame.anchorX,frame.anchorY);sprite.scale.set(frame.pixelScale);
    sprite.position.set(x+meta.origin[0]*frame.pixelScale,y+meta.origin[1]*frame.pixelScale);app.stage.addChild(sprite);
    const origin=new Graphics().moveTo(-3,0).lineTo(3,0).moveTo(0,-3).lineTo(0,3).stroke({width:1,color:0x88784c,alpha:.65});origin.position.copyFrom(sprite.position);app.stage.addChild(origin);
    positions.push({id,variant,frame:selection.frame,x,y,width:meta.w*frame.pixelScale,height:meta.h*frame.pixelScale,anchor:[frame.anchorX,frame.anchorY],pixelScale:frame.pixelScale});
   }
  }
  render();return {page,positions,statistics:effects.statistics};
 },
 async releaseFull(){
  phase='release-full';clear();const first=sheets[0],frame=first.frame('standard',0);await effects.release();
  const result=zero(effects);check(!first.frame('standard',0),'Old sheet returned a frame after release');check(frame?.texture.destroyed,'Old cropped Pixi Texture survived release');
  render();return {statistics:result,staleFrame:false};
 },
 async pressure(){
  phase='pressure';let clock=0;const budget=Math.max(...pageRefs.map(ref=>ref.bytes));
  pressure=new EffectLibrary({fetch:fetcher,now:()=>clock,budgetBytes:budget,onError:error=>errors.push(error.message)});await pressure.init(descriptor);
  const refs=[];for(const ref of pageRefs)refs.push({...ref,sheet:await loadSheet(pressure,ref.sheet.id)});
  const counts=new Map(refs.map(ref=>[ref.url,count(ref.url)]));for(const ref of refs)ref.sheet.frame(ref.variant,ref.frame);
  const pending=pressure.statistics;check(pending.allocatedBytes<=budget,'Pending pages exceeded bounded budget');await pressure.settle();
  const resident=pressure.statistics;check(resident.residentPages>0&&resident.residentPages<refs.length,'Smaller real-page budget did not produce pressure');
  const blocked=refs.filter(ref=>!ref.sheet.frame(ref.variant,ref.frame));check(blocked.length>0,'No real page admission was denied');
  for(const ref of blocked)check(count(ref.url)===counts.get(ref.url),`Budget-denied page fetched: ${ref.url}`);
  const requestCount=requests.length;for(let repeat=0;repeat<4;repeat++)for(const ref of blocked)ref.sheet.frame(ref.variant,ref.frame);
  await pressure.settle();check(requests.length===requestCount,'Repeated denied frame request fetched bytes');
  clock=9999;await pressure.trim();check(pressure.statistics.residentPages===resident.residentPages,'Fresh page evicted before documented idle threshold');
  // trim clears pressure; a still-denied real request re-establishes pressure.
  blocked[0].sheet.frame(blocked[0].variant,blocked[0].frame);clock=10001;await pressure.trim();const evicted=zero(pressure);
  const target=blocked[0],prior=count(target.url);check(!target.sheet.frame(target.variant,target.frame),'Evicted page should first be lazy');await pressure.settle();
  const frame=target.sheet.frame(target.variant,target.frame);check(frame,'A formerly denied real page failed to re-admit');check(count(target.url)===prior+1,'Re-admission did not fetch exactly one real page');
  const pixels=rgba(frame.texture),reloaded=pressure.statistics;check(reloaded.allocatedBytes===target.bytes&&reloaded.allocatedBytes<=budget,'Reload budget accounting differs');
  await pressure.dispose();const final=zero(pressure);check(!target.sheet.frame(target.variant,target.frame),'Disposed pressure sheet resurrected');
  return {budget,clock:'Only documented cosmetic residency clock controlled: 0 → 9999 → 10001ms; no simulation.',pending,resident,denied:blocked.map(ref=>({id:ref.sheet.id,page:ref.page,url:ref.url})),evicted,reloaded,reloadedPixels:pixels,final};
 },
 async pendingRelease(){
  phase='pending-release';race=new EffectLibrary({fetch:fetcher,onError:error=>errors.push(error.message)});await race.init(descriptor);
  const ref=pageRefs[0],sheet=await loadSheet(race,ref.sheet.id),prior=count(ref.url);check(!sheet.frame(ref.variant,ref.frame),'Fresh race page unexpectedly resident');
  const pending=race.statistics;check(pending.allocatedBytes===ref.bytes&&count(ref.url)===prior+1,'Release did not overlap an actual reserved page request');
  await race.release();const released=zero(race);check(!sheet.frame(ref.variant,ref.frame),'Released sheet returned stale frame');
  await new Promise(resolve=>setTimeout(resolve,100));zero(race);
  const fresh=await loadSheet(race,ref.sheet.id);check(fresh!==sheet,'Released library reused its closed sheet');fresh.frame(ref.variant,ref.frame);await race.settle();
  const frame=fresh.frame(ref.variant,ref.frame);check(frame,'Real reload after release failed');const pixels=rgba(frame.texture),reloaded=race.statistics;
  await race.dispose();const final=zero(race);return {url:ref.url,pending,released,reloaded,pixels,final,staleFrame:false};
 },
 async dispose(){
  phase='dispose';if(!disposed){clear();await pressure?.dispose();await race?.dispose();await effects.dispose();app.destroy(true,{children:true});disposed=true}
  const result=stats();check(result.canvases===0,'Pixi canvas survived final disposal');zero(effects);if(pressure)zero(pressure);if(race)zero(race);check(errors.length===0,'Effect loader errors');return result;
 },
};
Object.assign(window,{fxPackQA:qa});document.body.dataset.ready='true';
