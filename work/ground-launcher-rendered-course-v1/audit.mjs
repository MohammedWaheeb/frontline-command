// CPU-only independent graph and native-oracle admission checks.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';
const root=path.resolve(process.argv[2]??''),sha=b=>createHash('sha256').update(b).digest('hex'),receipt=JSON.parse(await readFile(path.join(root,'receipt.json'))),packBytes=await readFile(path.join(root,'product/assets/packs/base.json'));
assert.equal(receipt.status,'prepared-only');assert.equal(sha(packBytes),receipt.packSHA256);
const rows=new Map(JSON.parse(packBytes).files.map(f=>[f.path,f]));
function allowed(name){assert(name.startsWith('/')&&!name.split('/').includes('..'));const r=rows.get(name);assert(r,'Unlisted file');return r}
function integrity(bytes,row){assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256)}
async function get(name){const row=allowed(name),b=await readFile(path.join(root,'product',name));integrity(b,row);return b}
const index=JSON.parse(await get('/art/index.json')),graphs=[];
for(const handoff of receipt.handoffs){
 const name='/art/'+index.sprites[handoff.id],meta=JSON.parse(await get(name));let frames=0,pages=0;
 const cold=[];for(const [scale,layers]of Object.entries(meta.atlases)){
  const idle=new Set(),empty=new Set();
  for(const [layer,files]of Object.entries(layers))for(const file of files){
   const atlasURL=path.posix.join(path.posix.dirname(name),file),atlas=JSON.parse(await get(atlasURL)),pngURL=path.posix.join(path.posix.dirname(atlasURL),atlas.meta.image),png=await get(pngURL);
   assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const width=png.readUInt32BE(16),height=png.readUInt32BE(20);pages++;
   for(const [key,item]of Object.entries(atlas.frames)){const f=item.frame;assert([f.x,f.y,f.w,f.h].every(Number.isInteger));assert(f.x>=0&&f.y>=0&&f.w>0&&f.h>0&&f.x+f.w<=width&&f.y+f.h<=height);frames++;if(layer==='beauty'&&key.startsWith('idle/'))idle.add(pngURL);if(layer==='beauty'&&key.startsWith('idle_charges_0/'))empty.add(pngURL)}
  }
  assert(idle.size&&empty.size);assert([...idle].every(p=>!empty.has(p)),'Deferred payload page already belongs to generic idle');cold.push({scale,genericPages:[...idle],emptyPages:[...empty],disjoint:true});
 }
 assert.equal(meta.states.reduce((n,s)=>n+s.frames*s.directions,0),handoff.poses);
 for(const alias of meta.aliases??[]){assert(meta.states.some(s=>s.name===alias.source));if(alias.name.startsWith('pack'))assert(alias.reverse&&alias.progress_driven)}
 graphs.push({id:handoff.id,poses:handoff.poses,pages,frames,cold});
}
const planBytes=await readFile(path.join(root,'plan.json'));assert.equal(sha(planBytes),receipt.planSHA256);const plan=JSON.parse(planBytes);assert(planBytes.length<1024*1024,'Plan retains too many complete views');assert.deepEqual(plan.held,['SA.launcher']);assert.equal(plan.scenarios.length,7);
for(const points of Object.values(plan.courses))for(const p of points){assert(!('owned'in p)&&!('foreign'in p),'Do not ship duplicate raw native views to fixture')}
let wireRecords=0;for(const byMode of Object.values(plan.oracles))for(const byStage of Object.values(byMode))for(const byWho of Object.values(byStage))for(const d of Object.values(byWho)){assert(!('view'in d));assert(d.url.startsWith('/oracle/'));assert(/^[a-f0-9]{64}$/.test(d.wire_sha256));wireRecords++}assert.equal(wireRecords,424);
// Negative controls: missing file, path escape, incomplete body, and wrong bytes
// cannot be admitted by the same checks used above. No frozen file is changed.
assert.throws(()=>allowed('/art/not-listed.png'));assert.throws(()=>allowed('/art/../runtime/frontline.wasm'));
const bytes=await get('/art/index.json'),row=rows.get('/art/index.json');assert.throws(()=>integrity(bytes.subarray(1),row));const changed=Buffer.from(bytes);changed[0]^=1;assert.throws(()=>integrity(changed,row));
const out={status:'passed',scope:'CPU-only exact PNG/atlas closure and prepared plan admission, not decoded/rendered pixel acceptance',receiptSHA256:sha(await readFile(path.join(root,'receipt.json'))),packSHA256:sha(packBytes),planBytes:planBytes.length,wireRecords,graphs,negativeControls:4};await writeFile(path.join(root,'graph-audit.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
