import assert from 'node:assert/strict';
import {readFile,writeFile,open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const work=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(work,'../..');
const product=path.join(root,'work/ordinary-package-cadence-v1/build-01/package/client'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const packBytes=await readFile(path.join(product,'assets/packs/base.json')),pack=JSON.parse(packBytes),packSHA256=sha(packBytes);
assert.equal(packSHA256,'b73e3325ba370733419332243a63fe6b0e7663ade09808f731bf5f8592f09553');
const declared=new Map(pack.files.map(f=>[f.path,f])),pins=[],assets=[];
async function json(name){const bytes=await readFile(path.join(product,name)),expected=declared.get(name);assert(expected,name);assert.equal(bytes.length,expected.bytes);assert.equal(sha(bytes),expected.sha256);pins.push({path:name,sha256:expected.sha256,bytes:bytes.length});return JSON.parse(bytes)}
const index=await json('/art/index.json');
for(const [id,relative] of Object.entries(index.sprites)){
 const name='/art/'+relative,base=path.posix.dirname(name),sprite=await json(name),scales={};
 for(const [scale,layers] of Object.entries(sprite.atlases)){
  let pages=0,nominalRGBABytes=0,pickingBytes=0,firstIdleRGBABytes=0,firstIdlePickingBytes=0,idleLayers=[];
  for(const [layer,files] of Object.entries(layers))for(const file of files){
   const atlas=await json(path.posix.join(base,file)),png=path.posix.join(base,atlas.meta.image),expected=declared.get(png);assert(expected,png);
   const handle=await open(path.join(product,png),'r'),header=Buffer.alloc(24);try{assert.equal((await handle.read(header,0,24,0)).bytesRead,24)}finally{await handle.close()}
   assert.equal(header.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(header.toString('ascii',12,16),'IHDR');
   const width=header.readUInt32BE(16),height=header.readUInt32BE(20);assert.equal(width,atlas.meta.size.w);assert.equal(height,atlas.meta.size.h);
   const rgba=width*height*4,alpha=layer==='beauty'||layer==='team'?Math.ceil(width*height/8):0;
   pages++;nominalRGBABytes+=rgba;pickingBytes+=alpha;
   if(atlas.frames['idle/d00_f00']){firstIdleRGBABytes+=rgba;firstIdlePickingBytes+=alpha;idleLayers.push(layer)}
  }
  scales[scale]={pages,nominalRGBABytes,pickingBytes,firstIdleRGBABytes,firstIdlePickingBytes,idleLayers};
 }
 assets.push({id,scales});
}
const totals=Object.fromEntries(['1x','2x'].map(scale=>[scale,assets.reduce((sum,asset)=>{const s=asset.scales[scale];if(s)for(const key of Object.keys(sum))sum[key]+=s[key];return sum},{pages:0,nominalRGBABytes:0,pickingBytes:0,firstIdleRGBABytes:0,firstIdlePickingBytes:0})]));
const world=assets.filter(a=>/^(unit|building|prop)\./.test(a.id));
const report={status:'PASS',scope:'Current ordinary product dimension inventory, not completed162-role release. Every atlas descriptor is verified against exact packSHA. PNG IHDR matches metadata; full PNG contents are not rehashed or decoded here. No browser/GPU/timing measurement.',product:path.relative(root,product),packSHA256,spriteIDs:assets.length,worldPrefixIDs:world.length,otherIDs:assets.filter(a=>!world.includes(a)).map(a=>a.id),totals,assets,pins,limits:['All-pages bytes are a theoretical all-resident sum, not observed usage.','Idle d00_f00 union excludes non-idle aliases/aircraft states and may admit more pages in animation.','No scaling to final162roles is justified from an incomplete package.','Decoded bitmap, temporary canvas/getImageData, GPU driver overhead and UI image caches are excluded.']};
await writeFile(path.join(work,'evidence/atlas-package.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,spriteIDs:assets.length,worldPrefixIDs:world.length,otherIDs:report.otherIDs,metadataPins:pins.length,totals},null,2));
