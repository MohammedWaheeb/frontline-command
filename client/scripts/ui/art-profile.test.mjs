import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {artPackageSources,artPlugin} from './art-plugin.mjs';

const put=async(root,rel,bytes)=>{const file=path.join(root,rel);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes)};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('standard profile aliases only complete 1x sprite atlases while full profile preserves high assets',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'frontline-art-profile-'));
 try{
  const assets=path.join(dir,'assets'),id='unit.fixture',base=`build/sprites/${id}`;
  const meta={schema:'fc-sprite/1',id,frame_size_2x:[80,60],anchor_2x:[40,48],layers:['beauty'],
   atlases:{'1x':{beauty:['unit.fixture@1x.beauty.json']},'2x':{beauty:['unit.fixture@2x.beauty.json']}},
   states:[{name:'idle',directions:1,frames:1}],aliases:[{name:'pack',source:'idle'}],
   hardpoints_2x_rel_anchor:{muzzle:{'idle/d00_f00':[1,2]}},content_sha256:'old-hash'};
  await put(assets,`${base}/${id}.sprite.json`,JSON.stringify(meta));
  const oneXJson=Buffer.from(JSON.stringify({frames:{'idle/d00_f00':{frame:{x:0,y:0,w:4,h:3}}},meta:{image:'unit.fixture@1x.png',size:{w:8,h:6},scale:1}}));
  const twoXJson=Buffer.from(JSON.stringify({frames:{'idle/d00_f00':{frame:{x:0,y:0,w:8,h:6}}},meta:{image:'unit.fixture@2x.png',size:{w:16,h:12},scale:2}}));
  const oneXPng=Buffer.from('fixture 1x pixels'),twoXPng=Buffer.from('fixture 2x pixels');
  await put(assets,`${base}/unit.fixture@1x.beauty.json`,oneXJson);await put(assets,`${base}/unit.fixture@1x.png`,oneXPng);
  await put(assets,`${base}/unit.fixture@2x.beauty.json`,twoXJson);await put(assets,`${base}/unit.fixture@2x.png`,twoXPng);
  await put(assets,'build/ui/chrome/button@2x.png','chrome remains high resolution');

  const standard=await artPackageSources(assets),standardByOutput=new Map(standard.sources.map(row=>[row.output,row]));
  assert(standard.sources.every(row=>!/^art\/sprites\/[^/]+\/[^/]*@2x\.(?:json|png)$/.test(row.output)));
  assert(standardByOutput.has('art/ui/chrome/button@2x.png'),'non-sprite UI assets keep their existing resolution');
  const standardSidecar=standardByOutput.get(`art/sprites/${id}/${id}.sprite.json`);
  assert(standardSidecar?.data instanceof Buffer,'standard sidecar is emitted as transformed bytes');
  const transformed=JSON.parse(standardSidecar.data.toString('utf8'));
  assert.deepEqual(transformed.atlases['2x'],meta.atlases['1x']);
  assert.deepEqual(transformed.atlas_resolution,{'1x':1,'2x':1});
  for(const key of ['frame_size_2x','anchor_2x','states','aliases','hardpoints_2x_rel_anchor'])assert.deepEqual(transformed[key],meta[key]);
  const expectedHash=createHash('sha256').update('unit.fixture@1x.beauty.json').update(oneXJson)
   .update('unit.fixture@1x.png').update(oneXPng).digest('hex');
  assert.equal(transformed.content_sha256,expectedHash,'identity covers sorted selected 1x names and bytes');

  const full=await artPackageSources(assets,{profile:'full'}),fullByOutput=new Map(full.sources.map(row=>[row.output,row]));
  assert(fullByOutput.has(`art/sprites/${id}/unit.fixture@2x.beauty.json`));
  assert.equal(fullByOutput.get(`art/sprites/${id}/${id}.sprite.json`).data,undefined);
  assert.deepEqual(await readFile(fullByOutput.get(`art/sprites/${id}/${id}.sprite.json`).source),Buffer.from(JSON.stringify(meta)));

  for(const profile of ['standard','full']){
   const outDir=path.join(dir,`dist-${profile}`);await put(outDir,'index.html','game');await put(outDir,'runtime/frontline.wasm','wasm');
   const plugin=artPlugin({assets,content:path.join(dir,'content'),profile});plugin.configResolved({command:'build',build:{outDir}});await plugin.closeBundle();
   const productSidecar=JSON.parse(await readFile(path.join(outDir,`art/sprites/${id}/${id}.sprite.json`),'utf8'));
   if(profile==='standard'){
    assert.deepEqual(productSidecar.atlases['2x'],meta.atlases['1x']);
    await assert.rejects(readFile(path.join(outDir,`art/sprites/${id}/unit.fixture@2x.png`)),{code:'ENOENT'});
   }else{
    assert.deepEqual(productSidecar,meta);
    assert.deepEqual(await readFile(path.join(outDir,`art/sprites/${id}/unit.fixture@2x.png`)),twoXPng);
   }
  }
 }finally{await rm(dir,{recursive:true,force:true})}
});
