// Shared by the browser loader and Node packer. No filesystem, DOM or engine state.
export const EFFECT_LIMITS=Object.freeze({indexBytes:262144,metadataBytes:1048576,pageBytes:8388608,effects:256,pages:8,dimension:2048,clips:32,frames:2048});
export const EFFECT_VARIANTS=Object.freeze(['standard','low','reducedMotion','reducedFlashing','reduced']);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const uint=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const fail=message=>{throw new Error(`Invalid effect asset: ${message}`)};
function keys(value,allowed,label){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail(label)}
function freeze(value){if(value&&typeof value==='object'){for(const part of Object.values(value))freeze(part);Object.freeze(value)}return value}
export function effectID(value){return typeof value==='string'&&/^fx\.[A-Za-z][A-Za-z0-9_]{0,63}\.[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)}
export function effectPath(value){return typeof value==='string'&&value.length<=240&&/^fx\/[A-Za-z0-9_./-]+$/.test(value)&&value.split('/').every(part=>!!part&&part!=='.'&&part!=='..'&&!part.startsWith('.'))}
export function effectDescriptor(value,kind='metadata'){
 keys(value,['url','sha256','bytes'],'descriptor fields');
 if(!effectPath(value.url)||!value.url.endsWith('.json')||kind==='index'&&value.url!=='fx/index.json'||typeof value.sha256!=='string'||! /^[a-f0-9]{64}$/.test(value.sha256)||!uint(value.bytes,1,kind==='index'?EFFECT_LIMITS.indexBytes:EFFECT_LIMITS.metadataBytes))fail('descriptor path, size or hash');
 return freeze({url:value.url,sha256:value.sha256,bytes:value.bytes});
}
function decode(bytes,limit){if(!(bytes instanceof Uint8Array)||bytes.byteLength<2||bytes.byteLength>limit)fail('JSON byte limit');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{fail('JSON encoding')}}
export function decodeEffectIndex(bytes){
 const value=decode(bytes,EFFECT_LIMITS.indexBytes);keys(value,['format','effects'],'index fields');
 if(value.format!==1||!plain(value.effects)||Object.keys(value.effects).length>EFFECT_LIMITS.effects)fail('index format/count');
 const effects=Object.create(null);
 for(const [id,input] of Object.entries(value.effects)){
  if(!effectID(id))fail('effect ID');const descriptor=effectDescriptor(input),expected=`fx/${id.slice(3).replaceAll('.','/')}/effect.json`;
  if(descriptor.url!==expected)fail('metadata path does not match ID');effects[id]=descriptor;
 }
 return freeze({format:1,effects});
}
export function decodeEffectMetadata(bytes,expectedID){
 const value=decode(bytes,EFFECT_LIMITS.metadataBytes);keys(value,['format','id','resolution','pages','clips','variants'],'metadata fields');
 if(value.format!==1||!effectID(value.id)||value.id!==expectedID||![1,2].includes(value.resolution)||!Array.isArray(value.pages)||!uint(value.pages.length,1,EFFECT_LIMITS.pages))fail('metadata identity/pages');
 const files=new Set(),pages=value.pages.map(page=>{
  keys(page,['file','sha256','bytes','width','height'],'page fields');
  if(typeof page.file!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.png$/.test(page.file)||page.file.includes('..')||files.has(page.file)||typeof page.sha256!=='string'||! /^[a-f0-9]{64}$/.test(page.sha256)||!uint(page.bytes,1,EFFECT_LIMITS.pageBytes)||!uint(page.width,1,EFFECT_LIMITS.dimension)||!uint(page.height,1,EFFECT_LIMITS.dimension))fail('page path, dimensions, size or hash');
  files.add(page.file);return {...page};
 });
 if(!plain(value.clips)||!uint(Object.keys(value.clips).length,1,EFFECT_LIMITS.clips))fail('clip count');
 let count=0;const clips=Object.create(null),usedPages=new Set();
 for(const [name,clip] of Object.entries(value.clips)){
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name))fail('clip name');keys(clip,['fps','loop','frames'],'clip fields');
  if(typeof clip.loop!=='boolean'||!Array.isArray(clip.frames)||!uint(clip.frames.length,1,EFFECT_LIMITS.frames)||!uint(clip.fps,clip.frames.length===1?0:1,60))fail('clip timing/frames');
  count+=clip.frames.length;if(count>EFFECT_LIMITS.frames)fail('total frame count');
  const frames=clip.frames.map(frame=>{
   keys(frame,['page','x','y','w','h','origin'],'frame fields');
   const p=pages[frame.page];
   if(!uint(frame.page,0,pages.length-1)||!p||!uint(frame.x,0,p.width-1)||!uint(frame.y,0,p.height-1)||!uint(frame.w,1,p.width-frame.x)||!uint(frame.h,1,p.height-frame.y)||!Array.isArray(frame.origin)||frame.origin.length!==2||!Number.isFinite(frame.origin[0])||!Number.isFinite(frame.origin[1])||frame.origin[0]<-frame.w||frame.origin[0]>frame.w*2||frame.origin[1]<-frame.h||frame.origin[1]>frame.h*2)fail('frame bounds/origin');
   usedPages.add(frame.page);return {...frame,origin:[...frame.origin]};
  });clips[name]={fps:clip.fps,loop:clip.loop,frames};
 }
 keys(value.variants,EFFECT_VARIANTS,'variant fields');
 for(const variant of EFFECT_VARIANTS)if(typeof value.variants[variant]!=='string'||!Object.hasOwn(clips,value.variants[variant]))fail('missing variant clip');
 if(usedPages.size!==pages.length)fail('unused page');
 return freeze({format:1,id:value.id,resolution:value.resolution,pages,clips,variants:{...value.variants}});
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let bit=0;bit<8;bit++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc(bytes,start,end){let value=0xffffffff;for(let at=start;at<end;at++)value=crcTable[(value^bytes[at])&255]^(value>>>8);return(value^0xffffffff)>>>0}
/** Strict static 8-bit RGB/RGBA PNG. Browser decoding still verifies compressed pixels. */
export function inspectEffectPNG(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<57||bytes.length>EFFECT_LIMITS.pageBytes||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))fail('PNG signature/size');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=8,width=0,height=0,channels=0,ended=false,idat=false,idatEnded=false;const compressed=[];
 while(at<bytes.length){
  if(at+12>bytes.length)fail('truncated PNG chunk');const size=view.getUint32(at),end=at+12+size;
  if(end>bytes.length||size>EFFECT_LIMITS.pageBytes)fail('PNG chunk size');
  const kind=String.fromCharCode(...bytes.subarray(at+4,at+8));
  if(!/^[A-Za-z]{4}$/.test(kind)||crc(bytes,at+4,end-4)!==view.getUint32(end-4))fail('PNG chunk integrity');
  if(at===8&&kind!=='IHDR')fail('PNG first chunk');
  if(kind==='IHDR'){
   if(width||size!==13)fail('PNG header');width=view.getUint32(at+8);height=view.getUint32(at+12);channels=bytes[at+17]===6?4:bytes[at+17]===2?3:0;
   if(!uint(width,1,EFFECT_LIMITS.dimension)||!uint(height,1,EFFECT_LIMITS.dimension)||bytes[at+16]!==8||!channels||bytes[at+18]!==0||bytes[at+19]!==0||bytes[at+20]!==0)fail('PNG dimensions/encoding');
  }else if(kind==='IDAT'){if(idatEnded||!size)fail('PNG image sequence');idat=true;compressed.push(bytes.subarray(at+8,end-4));}
  else if(kind==='IEND'){if(size||!idat||end!==bytes.length)fail('PNG end');ended=true;}
  else {if(idat)idatEnded=true;if(['acTL','fcTL','fdAT'].includes(kind)||kind[0]===kind[0].toUpperCase()&&kind!=='PLTE')fail('unsupported PNG chunk');}
  at=end;
 }
 if(!ended)fail('PNG missing end');return {width,height,channels,compressed};
}
