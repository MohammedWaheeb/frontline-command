// Command-center backdrop: a staged motor-pool diorama composed at native 2×
// resolution from the real terrain materials and authored sprite layers
// (beauty / shadow / team mask). Presentation only — it is not a simulation.
// A packaged painted illustration replaces it when the art index lists one;
// this canvas remains the offline/unpackaged and image-error fallback.
import {useEffect,useRef,useState} from 'react';
import {art} from '../render/art';
import type {AssetReadScope} from '../runtime/asset-read-scope';
import type {ContentIndex} from '../runtime/content-library';

interface Frame {frame:{x:number;y:number;w:number;h:number};anchor?:{x:number;y:number}}
interface Atlas {frames:Record<string,Frame>;meta:{image:string}}
interface Meta {atlases:Record<string,Record<string,string[]>>;states:Array<{name:string;directions:number;part?:string}>;squad?:{members:number;member_offsets_mt:[number,number][]}|null}
interface Piece {id:string;x:number;y:number;state:string;dir:number;turret?:number;air?:number;team:string}

const TEAM='#D9892E';     // warm player paint for the staged yard
const RIVAL='#9A3B32';
const SCENE:Piece[]=[
 {id:'building.US.hq',x:6,y:3.5,state:'idle',dir:0,team:TEAM},
 {id:'building.US.factory',x:11.5,y:4,state:'idle',dir:0,team:TEAM},
 {id:'building.US.power',x:3.2,y:8.2,state:'idle',dir:0,team:TEAM},
 {id:'prop.palm',x:2.6,y:4.4,state:'idle',dir:1,team:TEAM},
 {id:'prop.palm',x:14.2,y:9.6,state:'idle',dir:2,team:TEAM},
 {id:'prop.container_stack',x:13.8,y:7.1,state:'idle',dir:0,team:TEAM},
 {id:'prop.sandbags',x:9.4,y:12.2,state:'idle',dir:0,team:TEAM},
 {id:'unit.US.tank',x:9.3,y:9.1,state:'idle',dir:5,turret:9,team:TEAM},
 {id:'unit.US.tank',x:11.2,y:10.4,state:'idle',dir:5,turret:10,team:TEAM},
 {id:'unit.SA.mobile_abm',x:12.8,y:12.6,state:'idle',dir:4,team:TEAM},   // clear of the directive copy
 {id:'unit.US.rig',x:4.8,y:6.9,state:'idle',dir:3,team:TEAM},
 {id:'unit.US.rifle',x:7.6,y:12.6,state:'idle',dir:2,team:TEAM},
 {id:'unit.US.rifle',x:5.9,y:12.9,state:'idle',dir:2,team:TEAM},
 {id:'unit.SY.car',x:15.4,y:12.3,state:'wreck',dir:11,team:RIVAL},
 {id:'unit.IR.strike',x:13.5,y:1.5,state:'fly',dir:6,air:1,team:RIVAL},
];

/** One draw captures a verified generation; resize/unmount cancels it and
 * releases its temporary image leases after the final canvas composition. */
async function sceneResources(signal:AbortSignal){
 const scope=await art.readScope(signal);
 return {fetchJSON:scope.json,image:scope.image,assertCurrent:scope.assertCurrent,release:scope.release};
}

async function frameOf(resources:Awaited<ReturnType<typeof sceneResources>>,base:string,meta:Meta,layer:string,key:string){
 for(const file of meta.atlases['2x']?.[layer]??[]){const atlas=await resources.fetchJSON<Atlas>(base+file);const f=atlas.frames[key];if(f)return {f,img:await resources.image(base+atlas.meta.image)}}
 return undefined;
}
function layerCanvas(img:HTMLImageElement,f:Frame,mode:'shadow'|'team'|'beauty',color:string){
 const c=document.createElement('canvas');c.width=f.frame.w;c.height=f.frame.h;const g=c.getContext('2d')!;
 g.drawImage(img,f.frame.x,f.frame.y,f.frame.w,f.frame.h,0,0,f.frame.w,f.frame.h);
 if(mode==='shadow'){g.globalCompositeOperation='source-in';g.fillStyle='rgba(12,8,4,.5)';g.fillRect(0,0,c.width,c.height)}
 if(mode==='team'){g.globalCompositeOperation='multiply';g.fillStyle=color;g.fillRect(0,0,c.width,c.height);g.globalCompositeOperation='destination-in';g.drawImage(img,f.frame.x,f.frame.y,f.frame.w,f.frame.h,0,0,f.frame.w,f.frame.h)}
 return c;
}

async function draw(canvas:HTMLCanvasElement,signal:AbortSignal,resources:Awaited<ReturnType<typeof sceneResources>>){
 const {fetchJSON,image}=resources;
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
 const ctx=canvas.getContext('2d');if(!ctx)return;resources.assertCurrent();
 const index=await fetchJSON<{sprites:Record<string,string>;terrain:string[]}>('/art/index.json');if(signal.aborted)return;
 const W=canvas.width,H=canvas.height,s=Math.min(W/2300,H/1250)*1.0;   // 2× art px → canvas px
 const ox=W*0.56,oy=H*0.06;
 const iso=(tx:number,ty:number)=>({x:ox+(tx-ty)*64*s,y:oy+(tx+ty)*32*s});
 // Ground: authored terrain materials projected at draw time (512² = 4×4 tiles).
 const mat=async(name:string)=>index.terrain.includes(name)?image(`/art/terrain/${name}.png`).catch(()=>undefined):undefined;
 const [sand,asphalt,slab,scrub]=await Promise.all(['sand','asphalt','concrete_slab','scrub_ground'].map(mat));if(signal.aborted)return;
 resources.assertCurrent();ctx.fillStyle='#16140f';ctx.fillRect(0,0,W,H);
 const paint=(img:HTMLImageElement|undefined,fallback:string,x:number,y:number,w:number,h:number)=>{
  ctx.save();ctx.setTransform(64*s,32*s,-64*s,32*s,ox,oy);
  if(img){const p=ctx.createPattern(img,'repeat')!;p.setTransform(new DOMMatrix([1/128,0,0,1/128,0,0]));ctx.fillStyle=p}else ctx.fillStyle=fallback;
  ctx.fillRect(x,y,w,h);ctx.restore();
 };
 paint(sand,'#b59a6a',-6,-6,30,30);
 paint(scrub,'#7c7448',-6,11,30,13);ctx.globalAlpha=1;
 paint(slab,'#8d8a82',3.5,1.2,11,6);
 paint(asphalt,'#4a4843',-6,7.6,30,1.6);
 paint(asphalt,'#4a4843',8.2,-6,1.6,14);
 // Road edge lines keep the yard legible at a glance.
 ctx.save();ctx.setTransform(64*s,32*s,-64*s,32*s,ox,oy);ctx.strokeStyle='rgba(226,190,120,.45)';ctx.lineWidth=0.05;ctx.setLineDash([0.5,0.4]);
 ctx.beginPath();ctx.moveTo(-6,8.4);ctx.lineTo(24,8.4);ctx.moveTo(9,-6);ctx.lineTo(9,7.6);ctx.stroke();ctx.restore();
 // Depth-sorted actors with authored contact shadows and team masks.
 const pieces=[...SCENE].sort((a,b)=>(a.x+a.y)-(b.x+b.y)||(a.air??0)-(b.air??0));
 const shadows:Array<()=>void>=[],bodies:Array<()=>void>=[];
 for(const piece of pieces){
  const rel=index.sprites[piece.id];if(!rel)continue;
  const base=`/art/${rel.slice(0,rel.lastIndexOf('/')+1)}`;
  let meta:Meta;try{meta=await fetchJSON<Meta>(`/art/${rel}`)}catch{continue}
  if(signal.aborted)return;
  const state=meta.states.find(st=>st.name===piece.state)??meta.states[0];
  const dir=Math.min(piece.dir,state.directions-1),key=`${state.name}/d${String(dir).padStart(2,'0')}_f00`;
  const members:[number,number][]=meta.squad?.member_offsets_mt??[[0,0]];
  for(const [mx,my] of members){
   const p=iso(piece.x+mx/1000,piece.y+my/1000);
   const place=(c:HTMLCanvasElement,f:Frame)=>()=>ctx.drawImage(c,p.x-(f.anchor?.x??.5)*f.frame.w*s,p.y-(f.anchor?.y??.5)*f.frame.h*s,f.frame.w*s,f.frame.h*s);
   const shadow=await frameOf(resources,base,meta,'shadow',key);if(shadow)shadows.push(place(layerCanvas(shadow.img,shadow.f,'shadow',''),shadow.f));
   const parts=[key];
   if(state.part==='hull'&&piece.turret!==undefined&&meta.states.some(st=>st.name==='aim'))parts.push(`aim/d${String(piece.turret).padStart(2,'0')}_f00`);
   for(const part of parts){
    const beauty=await frameOf(resources,base,meta,'beauty',part);if(beauty)bodies.push(place(layerCanvas(beauty.img,beauty.f,'beauty',''),beauty.f));
    const team=await frameOf(resources,base,meta,'team',part);if(team)bodies.push(place(layerCanvas(team.img,team.f,'team',piece.team),team.f));
   }
   if(signal.aborted)return;
  }
 }
 resources.assertCurrent();for(const d of shadows)d();for(const d of bodies)d();
 // Late-afternoon light from the upper right, dust haze and a reading vignette on the left.
 let g=ctx.createRadialGradient(W*.78,H*.1,0,W*.78,H*.1,W*.7);g.addColorStop(0,'rgba(255,196,110,.22)');g.addColorStop(1,'rgba(255,196,110,0)');
 ctx.globalCompositeOperation='soft-light';ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='source-over';
 g=ctx.createLinearGradient(0,0,W,0);g.addColorStop(0,'rgba(14,13,11,1)');g.addColorStop(.28,'rgba(14,13,11,.94)');g.addColorStop(.5,'rgba(14,13,11,.45)');g.addColorStop(.75,'rgba(14,13,11,.08)');g.addColorStop(1,'rgba(14,13,11,.35)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(14,13,11,.55)');g.addColorStop(.18,'rgba(14,13,11,0)');g.addColorStop(.78,'rgba(14,13,11,0)');g.addColorStop(1,'rgba(14,13,11,.96)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}

/** Painted main-menu illustration when the installed art index advertises one
 * (`keyArt`, a path under /art/). Absent or failed images keep the authored
 * canvas diorama, so an unpackaged candidate never produces a request or 404. */
export function MenuDiorama({generation}:{generation?:ContentIndex}){
 const [keyArt,setKeyArt]=useState<{generation:ContentIndex;path:string;image:HTMLImageElement;release:()=>void}|null>();
 useEffect(()=>{
  if(!generation)return;
  const abort=new AbortController();let scope:AssetReadScope|undefined;
  void(async()=>{try{
   scope=await art.readScope(abort.signal);
   const index=await scope.json<{keyArt?:unknown}>('/art/index.json');
   const path=typeof index.keyArt==='string'&&/^ui\/[\w./-]+\.(png|webp|jpg)$/.test(index.keyArt)?`/art/${index.keyArt}`:undefined;
   if(!path){scope.release();if(!abort.signal.aborted)setKeyArt(null);return}
   const image=await scope.image(path);scope.assertCurrent();
   if(!abort.signal.aborted)setKeyArt({generation,path,image,release:scope.release});
  }catch{scope?.release();if(!abort.signal.aborted)setKeyArt(null)}})();
  return()=>{abort.abort();scope?.release()};
 },[generation]);
 if(!generation||keyArt===undefined)return null;
 if(keyArt===null)return <CanvasDiorama generation={generation}/>;
 if(keyArt.generation!==generation)return null;
 return <div className="menu-keyart" data-key-art={keyArt.path} aria-hidden="true"><img alt="" src={keyArt.image.src} decoding="async" onError={()=>{keyArt.release();setKeyArt(null)}}/></div>;
}

function CanvasDiorama({generation}:{generation:ContentIndex}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const node=canvas.current;if(!node)return;let active:AbortController|undefined;
  const run=()=>{
   active?.abort();const next=new AbortController();active=next;node.dataset.ready='false';
   void(async()=>{let resources:Awaited<ReturnType<typeof sceneResources>>|undefined;
    try{resources=await sceneResources(next.signal);await draw(node,next.signal,resources);resources.assertCurrent();node.dataset.ready='true'}
    catch{/* backdrop is decorative; menu stays usable */}
    finally{resources?.release()}
   })();
  };
  run();let timer:ReturnType<typeof setTimeout>|undefined;
  const resize=new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(run,150)});resize.observe(node);
  return()=>{active?.abort();clearTimeout(timer);resize.disconnect();node.width=node.height=0};
 },[generation]);
 return <canvas ref={canvas} className="menu-diorama" aria-hidden="true"/>;
}
