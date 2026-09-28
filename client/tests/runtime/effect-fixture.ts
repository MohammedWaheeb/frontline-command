import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
export const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const json=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
export function png(width=2,height=2,invalidDeflate=false){
 const crc=(bytes:Uint8Array)=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1}return(c^0xffffffff)>>>0};
 const chunk=(kind:string,data:Uint8Array)=>{const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);result.write(kind,4,'ascii');result.set(data,8);result.writeUInt32BE(crc(result.subarray(4,result.length-4)),result.length-4);return result};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const pixels=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const offset=y*(width*4+1)+1+x*4;pixels.set([x?210:70,y?180:95,35,255],offset)}
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',invalidDeflate?Buffer.from([1,2,3]):deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
export function fixture(twoPages=false,image=png()){
 const id='fx.explosion.small',url='fx/explosion/small/effect.json';
 const pages=[{file:'page0.png',sha256:hash(image),bytes:image.length,width:2,height:2},...(twoPages?[{file:'page1.png',sha256:hash(image),bytes:image.length,width:2,height:2}]:[])];
 const metadata={format:1,id,resolution:2,pages,clips:{burst:{fps:twoPages?20:0,loop:false,frames:pages.map((_,page)=>({page,x:0,y:0,w:2,h:2,origin:[1,2]}))}},variants:{standard:'burst',low:'burst',reducedMotion:'burst',reducedFlashing:'burst',reduced:'burst'}};
 const metaBytes=json(metadata),index={format:1,effects:{[id]:{url,sha256:hash(metaBytes),bytes:metaBytes.length}}},indexBytes=json(index),descriptor={url:'fx/index.json',sha256:hash(indexBytes),bytes:indexBytes.length};
 const files=new Map<string,Uint8Array>([['fx/index.json',indexBytes],[url,metaBytes],...pages.map(page=>[`fx/explosion/small/${page.file}`,image] as [string,Uint8Array])]);
 return {id,url,metadata,index,descriptor,files,image};
}
