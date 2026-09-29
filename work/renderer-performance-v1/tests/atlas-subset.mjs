import assert from 'node:assert/strict';
import {readFile,writeFile,open} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const work=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(work,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalogPath='work/art/roster-runtime-overlay-v1/catalog-v57-v1/result.json',catalogBytes=await readFile(path.join(root,catalogPath)),catalog=JSON.parse(catalogBytes);
const pins=[{path:catalogPath,sha256:sha(catalogBytes)}],assets=[];
async function verified(file,expected){const bytes=await readFile(path.join(root,file));assert.equal(sha(bytes),expected,`Metadata drift: ${file}`);pins.push({path:file,sha256:expected});return JSON.parse(bytes)}
for(const asset of catalog.assets){
 const handoff=await verified(asset.handoff,asset.handoff_sha256),files=handoff.files;
 const spriteKey=Object.keys(files).find(key=>key.endsWith('.sprite.json'));assert(spriteKey);
 const sprite=await verified(files[spriteKey].source,files[spriteKey].sha256),scales={};
 for(const [scale,layers] of Object.entries(sprite.atlases)){
  let pages=0,nominalRGBABytes=0,pickingBytes=0,firstIdleRGBABytes=0,idleLayers=[],firstIdlePickingBytes=0;
  for(const [layer,names] of Object.entries(layers))for(const name of names){
   const key=path.posix.join(path.posix.dirname(spriteKey),name),descriptor=files[key];assert(descriptor,`Undeclared atlas: ${key}`);
   const atlas=await verified(descriptor.source,descriptor.sha256),png=files[path.posix.join(path.posix.dirname(key),atlas.meta.image)];assert(png);
   const handle=await open(path.join(root,png.source),'r'),header=Buffer.alloc(24);try{assert.equal((await handle.read(header,0,24,0)).bytesRead,24)}finally{await handle.close()}
   assert.equal(header.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(header.toString('ascii',12,16),'IHDR');
   const width=header.readUInt32BE(16),height=header.readUInt32BE(20);assert.equal(width,atlas.meta.size.w);assert.equal(height,atlas.meta.size.h);
   const rgba=width*height*4,alpha=layer==='beauty'||layer==='team'?Math.ceil(width*height/8):0;
   pages++;nominalRGBABytes+=rgba;pickingBytes+=alpha;
   if(atlas.frames['idle/d00_f00']){firstIdleRGBABytes+=rgba;firstIdlePickingBytes+=alpha;idleLayers.push(layer)}
  }
  scales[scale]={pages,nominalRGBABytes,pickingBytes,firstIdleRGBABytes,firstIdlePickingBytes,idleLayers};
 }
 assets.push({id:asset.id,scales});
}
const totals=Object.fromEntries(['1x','2x'].map(scale=>[scale,assets.reduce((sum,asset)=>{const s=asset.scales[scale];if(s)for(const key of Object.keys(sum))sum[key]+=s[key];return sum},{pages:0,nominalRGBABytes:0,pickingBytes:0,firstIdleRGBABytes:0,firstIdlePickingBytes:0})]));
const report={status:'PASS',scope:'Frozen v57 staged handoff subset dimensions only;57 replacement/addition assets, not the full162-role package. Every handoff/metadata SHA is checked. PNG IHDR matches each descriptor; full PNG byte integrity is inherited from handoff and not rechecked here. No decoding, renderer, browser or GPU measurement.',catalogSHA256:sha(catalogBytes),assets,totals,pins,limits:['All-pages bytes are a storage residency ceiling for this subset, not expected simultaneous usage.','Idle d00_f00 pages are a hypothetical union; absent idle states are not included, fallback/aliases and multi-frame/direction animation may admit more.','A GPU allocation and a decoded source may coexist; residentBytes counts nominal RGBA once.','Picking masks count one bit per beauty/team pixel; temporary getImageData RGBA/canvas and source bitmap are excluded.']};
await writeFile(path.join(work,'evidence/atlas-subset.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,assets:assets.length,pins:pins.length,totals},null,2));
