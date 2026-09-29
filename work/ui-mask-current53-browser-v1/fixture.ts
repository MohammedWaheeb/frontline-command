import {ArtLibrary} from './source/client/src/render/art';
import {captureAssetGeneration} from './source/client/src/runtime/asset-generation';
import config from './config.json';

type Mode='raw'|'normalized';
function assert(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
const image=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Image decode failed'));im.src=src});
const pixels=(im:HTMLImageElement)=>{const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(im,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data};
const section=document.querySelector('#contact')!;
let busy=false;

async function runRole(id:string){
 assert(!busy,'Overlapping role work');busy=true;section.replaceChildren();
 const role=config.roles.find(value=>value.id===id);assert(role,'Unknown role');
 const header=document.createElement('h2');header.textContent=`${id} — ${role.group}`;section.append(header);
 const requests:Array<{mode:Mode;path:string}>=[],libraries:Array<{mode:Mode;art:ArtLibrary;generation:Awaited<ReturnType<typeof captureAssetGeneration>>}>=[];
 const results:unknown[]=[],cleanup:unknown[]=[];
 try{
  for(const mode of ['raw','normalized'] as const){
   const fetcher:typeof fetch=(input,init)=>{const path=new URL(input instanceof Request?input.url:String(input),location.origin).pathname;requests.push({mode,path});return fetch(`/generation/${mode}${path}`,init)};
   const source=new Uint8Array(await (await fetch(`/generation/${mode}/content/index.json`)).arrayBuffer());
   const generation=await captureAssetGeneration(source,`ui53-${mode}`,{fetcher,origin:location.origin});
   const art=new ArtLibrary({generation});libraries.push({mode,art,generation});await art.init();
  }
  for(const color of config.colors){
   const row=document.createElement('div');row.className='palette';
   const label=document.createElement('p');label.textContent=`${color.palette} ${color.bound} ${color.hex}; portrait raw/normalized; build raw/normalized`;row.append(label);section.append(row);
   for(const purpose of ['portrait','build'] as const){
    const values:Partial<Record<Mode,{data:string;image:HTMLImageElement;pixels:Uint8ClampedArray}>>={};
    for(const {mode,art} of libraries){
     art.configure('standard');const data=await art.cameo(id,color.hex,'idle',undefined,purpose);assert(data,`${mode} cameo missing`);
     art.configure('high');const high=await art.cameo(id,color.hex,'idle',undefined,purpose);assert(high===data,'Quality changed authored2x UI selection');
     const decoded=await image(data);values[mode]={data,image:decoded,pixels:pixels(decoded)};
     const cell=document.createElement('div');cell.className='cell';cell.append(decoded);row.append(cell);
    }
    const raw=values.raw!,normalized=values.normalized!;assert(raw.pixels.length===normalized.pixels.length,'Output dimensions changed');
    const folder=purpose==='portrait'?'portraits':'icons/build',maskPath=`/art/ui/${folder}/${role.key}@2x.team.png`;
    const rawMask=await libraries[0].art.image(maskPath);const mask=pixels(rawMask);assert(mask.length===raw.pixels.length,'Mask dimensions changed');
    let changed=0,outside=0,alpha=0,maxDelta=0;
    for(let i=0;i<mask.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(raw.pixels[i+c]-normalized.pixels[i+c]));if(delta){changed++;if(mask[i+3]===0)outside++}maxDelta=Math.max(maxDelta,delta);if(raw.pixels[i+3]!==normalized.pixels[i+3])alpha++}
    assert(alpha===0&&outside===0,`${id}/${purpose}/${color.hex} changed alpha/outside:${alpha}/${outside}`);
    const expected=config.numerical.find(x=>x.id===id&&x.destination===`ui/${folder}/${role.key}@2x.team.png`);assert(expected,'Missing expected dimensions');assert(raw.image.naturalWidth===expected.width&&raw.image.naturalHeight===expected.height,'Consumer did not use authored2x dimensions');
    results.push({id,group:role.group,purpose,...color,width:raw.image.naturalWidth,height:raw.image.naturalHeight,changedPixels:changed,maxRGBDelta:maxDelta,outsideMaskChanges:outside,alphaChanges:alpha,standardEqualsHigh:true});
   }
  }
  const png=requests.filter(x=>x.path.endsWith('.png'));
  assert(png.length===8,`Unexpected image admission count ${png.length}`);
  for(const request of png)assert(request.path.startsWith('/art/ui/')&&request.path.includes(`${role.key}@2x.`),'World/1x/unrelated UI dependency used');
  document.title='Frontline Command — current53 actual UI mask contacts';
  return {id,group:role.group,results,requests,cleanup};
 }finally{
  for(const {mode,art,generation} of libraries){await art.dispose();const stat=generation.statistics;cleanup.push({mode,...stat,...art.statistics});assert(stat.disposed&&!stat.inFlight&&!stat.queued&&!stat.leases&&!stat.leaseBytes&&!art.statistics.residentPages,'Art/generation did not fully dispose');assert(await art.cameo(id,'#FFFFFF')===undefined,'Disposed library produced a cameo')}
  busy=false;
 }
}
(window as unknown as {uiMaskAudit:unknown}).uiMaskAudit={roles:config.roles,colors:config.colors,runRole,clear(){assert(!busy,'Role work active');section.replaceChildren();return {canvases:document.querySelectorAll('canvas').length,images:section.querySelectorAll('img').length}}};
document.title='Frontline Command — current53 UI audit ready';
