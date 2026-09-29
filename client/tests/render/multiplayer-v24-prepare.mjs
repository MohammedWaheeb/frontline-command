// Prepare only decoder/auditor/test receipts around an existing immutable product.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,symlink,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const overlay=path.join(root,'work/art/roster-runtime-overlay-v1/outputs/infantry-vehicles-ui-v24'),product=path.join(overlay,'product');
assert(process.env.FRONTLINE_COMBAT_BUILD,'Choose a new explicit harness output');const out=path.resolve(process.env.FRONTLINE_COMBAT_BUILD);await mkdir(out);
const readJSON=async file=>{const bytes=await readFile(file);return {value:JSON.parse(bytes),sha256:sha(bytes)}};
const overlayReceipt=await readJSON(path.join(overlay,'build.json')),base=path.join(root,overlayReceipt.value.base),baseReceipt=await readJSON(path.join(base,'build.json'));
assert.equal(baseReceipt.sha256,overlayReceipt.value.base_build_sha256);assert.equal(overlayReceipt.value.assets.length,34);
const frozenClient=path.join(base,'source/client');
for(const [file,digest]of Object.entries(baseReceipt.value.sourceFiles))assert.equal(sha(await readFile(path.join(frozenClient,file))),digest,`Source changed ${file}`);
const runtimeReceipt=await readJSON(path.join(root,baseReceipt.value.runtimeReceiptPath));assert.equal(runtimeReceipt.sha256,baseReceipt.value.runtimeReceiptSHA256);assert.equal(runtimeReceipt.value.status,'passed');
const integrated=path.join(root,'work/runtime-034-integrated-source'),sourceLock=await readJSON(path.join(integrated,'source-lock.json'));assert.equal(sourceLock.sha256,runtimeReceipt.value.source_lock_sha256);
for(const [file,digest]of Object.entries(sourceLock.value.files))assert.equal(sha(await readFile(path.join(integrated,'source',file))),digest,`Go input changed ${file}`);
const pack=await readJSON(path.join(product,'assets/packs/base.json'));assert.equal(pack.sha256,overlayReceipt.value.pack_sha256);let encodedBytes=0;
for(const item of pack.value.files){assert(item.path.startsWith('/')&&!item.path.includes('..'));const bytes=await readFile(path.join(product,item.path.slice(1)));assert.equal(bytes.length,item.bytes);assert.equal(sha(bytes),item.sha256,`Pack changed ${item.path}`);encodedBytes+=bytes.length}
for(const asset of overlayReceipt.value.assets)for(const file of asset.files){const bytes=await readFile(path.join(product,file.path.replace(/^\//,'')));assert.equal(sha(bytes),file.sha256);assert.equal(bytes.length,file.bytes)}
const host=await readFile(path.join(overlay,'frontline'));assert.equal(sha(host),overlayReceipt.value.host_sha256);assert.equal(sha(host),runtimeReceipt.value.files['bin/frontline-host'].sha256);
for(const name of ['frontline.wasm','wasm_exec.js','worker.js','worker.js.map','version.json'])assert.equal(sha(await readFile(path.join(product,'runtime',name))),runtimeReceipt.value.files[name].sha256);
await symlink(product,path.join(out,'product'));await copyFile(path.join(overlay,'frontline'),path.join(out,'frontline'));
await build({stdin:{contents:"export {fromBinary} from '@bufbuild/protobuf';export {EnvelopeSchema} from './protocol/frontline_pb';export {applyDelta} from './runtime/snapshot';",resolveDir:path.join(frozenClient,'src')},outfile:path.join(out,'decode.mjs'),bundle:true,platform:'node',format:'esm',target:'es2022'});
await build({entryPoints:[path.join(frozenClient,'src/render/minimap.ts')],outfile:path.join(out,'minimap.mjs'),bundle:true,platform:'node',format:'esm',target:'es2022'});
const auditSource=path.join(root,'work/multiplayer-combat/audit/main.go');await copyFile(auditSource,path.join(out,'audit-main.go'));
await writeFile(path.join(out,'audit.mod'),`module frontline-combat-audit\n\ngo 1.27.1\nrequire frontlinecommand v0.0.0\nreplace frontlinecommand => ${JSON.stringify(path.join(integrated,'source'))}\n`);
execFileSync('go',['build','-p=1','-modfile',path.join(out,'audit.mod'),'-o',path.join(out,'audit-replay'),path.join(out,'audit-main.go')],{cwd:root,env:{...process.env,GOMAXPROCS:'1'},stdio:'inherit'});
const contract=JSON.parse(execFileSync(path.join(out,'audit-replay'),['-describe'],{encoding:'utf8'}));assert.equal(contract.simulation,'0.3.4');assert.equal(contract.content_hash,runtimeReceipt.value.version.content_hash);assert.equal(contract.initial_countdown_ticks,true);
const report={prepared:new Date().toISOString(),scope:'Verified immutable v24+34 overlay. Product, runtime, art and Go source unchanged. Only decoder/minimap helpers and native offline auditor compiled; no browser or host launched.',version:runtimeReceipt.value.version,sha256:{host:sha(host),wasm:runtimeReceipt.value.files['frontline.wasm'].sha256,protocol:sha(await readFile(path.join(frozenClient,'src/protocol/frontline_pb.ts'))),pack:pack.sha256,clientSource:baseReceipt.value.sourceDigest,entry:sha(await readFile(path.join(frozenClient,'tests/render/multiplayer-combat-entry.tsx')))},packFiles:pack.value.files.length,encodedBytes,overlay:path.relative(root,overlay),overlaySHA256:overlayReceipt.sha256,baseSHA256:baseReceipt.sha256,sourceLockSHA256:sourceLock.sha256,runtimeReceiptSHA256:runtimeReceipt.sha256,art:JSON.parse(await readFile(path.join(product,'art/index.json'))),runtimeFiles:runtimeReceipt.value.files,maps:{},audit:{sha256:sha(await readFile(path.join(out,'audit-replay'))),sourceSHA256:sha(await readFile(auditSource)),contract},helpers:{}};
for(const name of ['industrial-valley','dry-river'])report.maps[name]=sha(await readFile(path.join(product,'content/maps',name+'.json')));
for(const name of ['decode.mjs','minimap.mjs'])report.helpers[name]=sha(await readFile(path.join(out,name)));
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,sha256:report.sha256,packFiles:report.packFiles,encodedBytes},null,2));
