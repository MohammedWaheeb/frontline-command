import {ArtLibrary} from '../../../../client/src/render/art';
import config from './config.json';
const roles=config.roles,colors=config.colors,modes=['raw','normalized'] as const;
const image=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error(src));im.src=src});
const pixels=(im:HTMLImageElement)=>{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true})!;x.drawImage(im,0,0);return x.getImageData(0,0,c.width,c.height).data};
const result:{cases:unknown[];images:Record<string,string>;errors:string[];complete:boolean}={cases:[],images:{},errors:[],complete:false};
(window as any).audit=result;
async function run(){
 for(const role of roles)for(const purpose of ['portrait','build'] as const){
  const section=document.createElement('section');section.id=`${role}-${purpose}`;const heading=document.createElement('h2');heading.textContent=`${role} ${purpose}`;section.append(heading);document.body.append(section);
  for(const color of colors){
   const row=document.createElement('div');row.className='row';const label=document.createElement('p');label.textContent=`${color.palette} ${color.bound} ${color.hex} — original / normalized, each native 1× then 2×`;row.append(label);section.append(row);
   const variants:Record<string,{image:HTMLImageElement;pixels:Uint8ClampedArray}>={};
   for(const mode of modes){
    const art=new ArtLibrary();art.index={format:1,sprites:{},terrain:[],portraits:roles,buildIcons:roles,chrome:[],icons:false,emblems:false};
    art.image=(url:string)=>{if(!url.startsWith('/art/ui/'))throw Error(`Unexpected dependency ${url}`);return image(`/inputs/${mode}/${url.slice('/art/ui/'.length)}`)};
    try{const data=await art.cameo(`unit.${role}`,color.hex,'idle',undefined,purpose);if(!data)throw Error(`Missing ${role}/${purpose}/${mode}`);const im=await image(data);variants[mode]={image:im,pixels:pixels(im)};result.images[`${role}-${purpose}-${color.hex.slice(1)}-${mode}`]=data;const cell=document.createElement('div');cell.className='cell';for(const divisor of [2,1]){const picture=new Image();picture.src=data;picture.width=im.naturalWidth/divisor;picture.height=im.naturalHeight/divisor;cell.append(picture)}row.append(cell)}finally{await art.release()}
   }
   const raw=variants.raw.pixels,other=variants.normalized.pixels,folder=purpose==='portrait'?'portraits':'icons/build',mask=pixels(await image(`/inputs/raw/${folder}/${role}@2x.team.png`));let changed=0,outside=0,max=0,sum=0,alpha=0;
   for(let i=0;i<raw.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(raw[i+c]-other[i+c]));if(delta){changed++;sum+=delta;if(mask[i+3]===0)outside++}max=Math.max(max,delta);if(raw[i+3]!==other[i+3])alpha++}
   if(outside||alpha)throw Error(`Non-mask change ${role}/${purpose}:${outside}/${alpha}`);
   result.cases.push({role,purpose,...color,width:variants.raw.image.naturalWidth,height:variants.raw.image.naturalHeight,changed_pixels:changed,max_rgb_delta:max,mean_changed_pixel_max_delta:changed?sum/changed:0,outside_mask_changes:outside,alpha_changes:alpha});
  }
 }
 result.complete=true;document.title='Frontline Command — extreme palette cameo audit';
}
run().catch(error=>{result.errors.push(String(error));result.complete=true;document.body.append(String(error))});
