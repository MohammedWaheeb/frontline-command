// Preparation only: no HTTP listener, browser, native simulation or live writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp,symlink,readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),label=process.argv[2];
assert(/^prepared-[a-z0-9-]+$/.test(label??''),'Use a NEW prepared-N label');
const suppliedHandoff=process.argv[3],suppliedSHA=process.argv[4];assert(suppliedHandoff&&/^[a-f0-9]{64}$/.test(suppliedSHA??''),'Require fully checked SA handoff path and exact SHA; no raw-art fallback');
const out=path.join(here,label);await mkdir(out);
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
const inputs={};async function pin(file,expected){const b=await readFile(file);if(expected)assert.equal(sha(b),expected,file);inputs[path.relative(root,file)]=sha(b);return b}
const receipt={status:'preparing',scope:'Private SA-only rendered-course PREPARATION over d710 menu-generation client, no browser qualification. Native starting units/resources/damage are declared fixtures; subsequent ordinary orders are unchanged. Fully sealed SA art handoff is mandatory.',started:new Date().toISOString(),commands:[],inputs};
const save=()=>writeFile(path.join(out,'receipt.json'),json(receipt));await save();
try{
 const base=path.join(root,'work/ground-launcher-rendered-course-v1/prepared-02/product'),native=path.join(root,'work/ground-launcher-runtime-course-v1/native-03'),oracle=path.join(root,'work/ground-launcher-runtime-course-v1/oracle-01'),candidate=path.join(root,'work/ground-launcher-pose-candidate-v1/source/client');
 const pack=JSON.parse(await pin(path.join(base,'assets/packs/base.json'),'080ddd51d13244658c7292c00f8c65fe22dfc0c905201e25c9e749644c623e8b'));
 for(const f of pack.files){assert(f.path.startsWith('/')&&!f.path.split('/').includes('..'));const b=await pin(path.join(base,f.path),f.sha256);assert.equal(b.length,f.bytes)}
 assert(spawnSync('git',['diff','--quiet','d710a15','--','client/src'],{cwd:root}).status===0,'Tracked live client has changed since reviewed d710 integration; coordinate new source');
 const source=path.join(out,'source/client');await mkdir(source,{recursive:true});
 await cp(path.join(root,'client/src'),path.join(source,'src'),{recursive:true});
 for(const name of ['package.json','package-lock.json','tsconfig.json'])await cp(path.join(root,'client',name),path.join(source,name));
 await symlink(path.join(root,'client/node_modules'),path.join(source,'node_modules'));
 // Compare every copied source to current input immediately; later verification catches drift.
 async function inventory(dir,prefix=''){const result={};for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name==='node_modules')continue;const rel=path.join(prefix,e.name);if(e.isDirectory())Object.assign(result,await inventory(path.join(dir,e.name),rel));else if(e.isFile())result[rel]=sha(await readFile(path.join(dir,e.name)));}return result}
 const current=await inventory(source);for(const [name,digest]of Object.entries(current))await pin(path.join(root,'client',name),digest);
 receipt.liveHead=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
 assert(spawnSync('git',['merge-base','--is-ancestor','d710a15','HEAD'],{cwd:root}).status===0,'Requires live menu-generation integration');
 const overrides={'src/render/actors.ts':'5b4c69f1e667c8635f7b50b01f45a7000d0e0de9094fb06a49a3a8b7b51c5a41','src/render/poses.ts':'5a86985178210fdd1772bd9b7bda0178d380f1274e4e42cf210ab9e531b4a2cf','src/render/ground-launcher-payload.ts':'2e832e926335a6318cf3e3230e5d651ce6e27122505931b560904d80794420f6'};
 const prior=JSON.parse(await pin(path.join(root,'work/ground-launcher-pose-candidate-v1/baseline.json'),'a99d6949d51208d7c5a8563a23ed24702bf7bf0094220840e998aedd389e95fa'));
 // Prevent transplanting over unrelated later actor/pose edits.
 for(const name of ['src/render/actors.ts','src/render/poses.ts'])assert.equal(current[name],prior.files[name],'Current renderer diverged from reviewed candidate baseline');
 for(const [name,digest]of Object.entries(overrides))await writeFile(path.join(source,name),await pin(path.join(candidate,name),digest));
 for(const name of ['actor-pose-priority','aircraft-payload','ground-launcher-payload','poses']){const dest=path.join(source,'tests/runtime',name+'.test.ts');await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,await pin(path.join(candidate,'tests/runtime',name+'.test.ts')))}
 const product=path.join(out,'product');await cp(base,product,{recursive:true,mode:constants.COPYFILE_FICLONE});
 const runtime={};for(const name of ['frontline.wasm','worker.js','wasm_exec.js','version.json']){const b=await pin(path.join(root,'client/public/runtime',name));assert.equal(sha(b),sha(await readFile(path.join(base,'runtime',name))),'Current runtime differs from known native oracle runtime');await writeFile(path.join(product,'runtime',name),b);runtime[name]={sha256:sha(b),bytes:b.length}}
 const version=JSON.parse(await readFile(path.join(product,'runtime/version.json')));assert.equal(version.simulation,'0.3.4');assert.equal(version.content_hash,'318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612');receipt.runtime=runtime;
 const artIndex=JSON.parse(await readFile(path.join(product,'art/index.json'))),handoffs=[];
 const handoffHashes={SA:suppliedSHA};
 for(const [faction,digest]of Object.entries(handoffHashes)){
  const handoff=JSON.parse(await pin(path.resolve(root,suppliedHandoff),digest));assert.equal(handoff.id,'unit.SA.launcher');assert.equal(handoff.poses,688);
  for(const [name,expected]of Object.entries(handoff.receipts??{}))await pin(path.resolve(root,name),expected);
  for(const kind of ['model','spec'])await pin(path.resolve(root,handoff[kind]),handoff[kind+'_sha256']);
  for(const [name,file]of Object.entries(handoff.files)){assert(!name.startsWith('/')&&!name.split('/').includes('..'));const b=await pin(path.resolve(root,file.source),file.sha256);assert.equal(b.length,file.bytes);const dest=path.join(product,'art',name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,b)}
  const id=`unit.${faction}.launcher`,metadata=`sprites/${id}/${id}.sprite.json`;artIndex.sprites[id]=metadata;
  const meta=JSON.parse(await readFile(path.join(product,'art',metadata)));assert.equal(meta.id,id);assert.equal(meta.states.reduce((n,s)=>n+s.frames*s.directions,0),handoff.poses);
  // Every new metadata dependency must be in the sealed handoff, never an old base-pack coincidence.
  assert(Object.hasOwn(handoff.files,metadata));
  for(const layers of Object.values(meta.atlases))for(const pages of Object.values(layers))for(const file of pages){const atlasName=path.posix.join(path.posix.dirname(metadata),file);assert(Object.hasOwn(handoff.files,atlasName),'Atlas omitted from sealed handoff');const atlas=JSON.parse(await readFile(path.join(product,'art',atlasName)));const pngName=path.posix.join(path.posix.dirname(atlasName),atlas.meta.image);assert(Object.hasOwn(handoff.files,pngName),'PNG omitted from sealed handoff')}

  for(const kind of ['portraits','buildIcons']){const key=faction+'.launcher',folder=kind==='portraits'?'portraits':'build';if(Object.keys(handoff.files).some(p=>p.startsWith(`ui/${folder}/${key}@`))&&!artIndex[kind].includes(key))artIndex[kind].push(key)}
  handoffs.push({id,sha256:digest,poses:handoff.poses,files:Object.keys(handoff.files).length});
 }
 await writeFile(path.join(product,'art/index.json'),json(artIndex));
 const {writeBasePack}=await import(pathToFileURL(path.join(root,'client/scripts/ui/art-plugin.mjs')).href);await pin(path.join(root,'client/scripts/ui/art-plugin.mjs'));await writeBasePack(product);
 const nativeReceipt=JSON.parse(await pin(path.join(native,'receipt.json'),'79740adedb492d3399bd924ab0fda7bde5b64cb9bad5b9b3b36e1af54610a3ab'));
 const oracleReceipt=JSON.parse(await pin(path.join(oracle,'receipt.json'),'5e7b97787c9636c2e58b7cd50557650166a4673bf9fc8ca3e2d47f158aedeb1b'));
 assert.equal(nativeReceipt.status,'passed');assert.equal(oracleReceipt.status,'passed');assert.equal(oracleReceipt.input_receipt_sha256,sha(await readFile(path.join(native,'receipt.json'))));
 const nativeLock=JSON.parse(await pin(path.join(native,'source-lock.json'),nativeReceipt.source_lock_sha256));assert(nativeLock.production_exact);assert.equal(nativeLock.base_lock_sha256,'3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750');
 await pin(path.join(oracle,'source-lock.json'),oracleReceipt.source_lock_sha256);
 const scenarios=['SA.launcher','SA.launcher-damaged-empty'];
 const plan={scope:receipt.scope,held:[],scenarios,courses:{},oracles:{},types:{}};
 for(const scenario of scenarios){
  for(const [name,digest]of Object.entries(nativeReceipt.evidence))if(name.startsWith(`evidence/${scenario}/`))await pin(path.join(native,name),digest);
  for(const [name,digest]of Object.entries(oracleReceipt.artifacts))if(name.startsWith(scenario+'/'))await pin(path.join(oracle,name),digest);
  const result=JSON.parse(await readFile(path.join(native,'evidence',scenario,'result.json')));assert.equal(result.status,'passed');assert(result.replay_views_exact&&result.save_views_exact&&result.replay_checkpoints_removed);
  const course=JSON.parse(await readFile(path.join(native,'evidence',scenario,'course.json')));assert.equal(course.length,result.points);plan.types[scenario]=result.type;
  for(const point of course){const own=point.owned.entities.find(e=>e.id===point.actor),foreign=point.foreign.entities.find(e=>e.id===point.actor);assert.equal(own.type,result.type);assert.equal(foreign.type,result.type);assert(own.private&&!foreign.private);assert.equal(own.private.charges,point.charges)}
  plan.courses[scenario]=course.map(({stage,tick,hash,actor,charges,shot})=>({stage,tick,hash,actor,charges,shot}));
  const deliveries=JSON.parse(await readFile(path.join(oracle,scenario,'oracle.json')));plan.oracles[scenario]={load:{},seek:{},continuation:{}};
  for(const point of course)for(const mode of ['load','seek',...(point.tick?['continuation']:[])])for(const who of ['owned','foreign']){
   const delivery=deliveries[mode][point.stage][who],name=`${scenario}/${mode}-${point.stage}-${who}.pb`,bytes=await pin(path.join(oracle,name),delivery.wire_sha256);assert.equal(bytes.length,delivery.bytes);assert.equal(oracleReceipt.artifacts[name],delivery.wire_sha256);
   (plan.oracles[scenario][mode][point.stage]??={})[who]={wire_sha256:delivery.wire_sha256,bytes:delivery.bytes,url:'/oracle/'+name};
  }
 }
 await writeFile(path.join(out,'plan.json'),json(plan));
 await writeFile(path.join(out,'driver.mjs'),await pin(path.join(here,'browser.mjs')));await writeFile(path.join(out,'prepare.mjs'),await pin(path.join(here,'prepare.mjs')));
 const fixtureDest=path.join(source,'tests/render/launcher-fixture.ts');await mkdir(path.dirname(fixtureDest),{recursive:true});await writeFile(fixtureDest,await pin(path.join(here,'fixture.ts')));
 const require=createRequire(path.join(root,'client/package.json')),{build}=await import(pathToFileURL(require.resolve('esbuild')).href);
 await build({entryPoints:[fixtureDest],outfile:path.join(out,'fixture.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',nodePaths:[path.join(root,'client/node_modules')]});
 await writeFile(path.join(source,'tsconfig.fixture.json'),json({extends:'./tsconfig.json',include:['src/**/*.ts','src/**/*.tsx','tests/render/launcher-fixture.ts']}));
 function run(name,args){const r=spawnSync(args[0],args.slice(1),{cwd:source,encoding:'utf8'}),log=(r.stdout??'')+(r.stderr??'');receipt.commands.push({name,command:args,exitCode:r.status,logSHA256:sha(log)});return writeFile(path.join(out,name+'.log'),log).then(()=>assert.equal(r.status,0,name));}
 await run('types',[path.join(root,'client/node_modules/.bin/tsc'),'-p','tsconfig.fixture.json','--noEmit']);
 const names=['actor-pose-priority','aircraft-payload','ground-launcher-payload','poses'];
 await build({entryPoints:names.map(n=>path.join(source,'tests/runtime',n+'.test.ts')),outdir:path.join(out,'tests'),outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node24',packages:'external'});await symlink(path.join(root,'client/node_modules'),path.join(out,'node_modules'));
 await run('focused',[process.execPath,'--test',...names.map(n=>path.join(out,'tests',n+'.test.mjs'))]);
 for(const [name,digest]of Object.entries(inputs))assert.equal(sha(await readFile(path.join(root,name))),digest,'Input drift: '+name);
 const files=await inventory(source),sourceLock={parentLiveHead:receipt.liveHead,baseline:current,overrides,files};await writeFile(path.join(out,'source-lock.json'),json(sourceLock));
 receipt.status='prepared-only';receipt.noBrowserOrHost=true;receipt.sourceLockSHA256=sha(Buffer.from(json(sourceLock)));receipt.driverSHA256=sha(await readFile(path.join(out,'driver.mjs')));receipt.fixtureSHA256=sha(await readFile(fixtureDest));receipt.bundleSHA256=sha(await readFile(path.join(out,'fixture.js')));receipt.planSHA256=sha(Buffer.from(json(plan)));receipt.packSHA256=sha(await readFile(path.join(product,'assets/packs/base.json')));receipt.handoffs=handoffs;receipt.scenarios=scenarios;receipt.points=Object.values(plan.courses).reduce((n,c)=>n+c.length,0);receipt.oracleRecords=Object.values(plan.oracles).reduce((n,o)=>n+Object.values(o).reduce((m,mode)=>m+Object.keys(mode).length*2,0),0);receipt.inputsVerifiedAfter=Object.keys(inputs).length;
}catch(error){receipt.status='failed';receipt.failure=String(error.stack??error);process.exitCode=1}
receipt.closedAt=new Date().toISOString();await save();console.log(json({out,status:receipt.status,failure:receipt.failure}));
