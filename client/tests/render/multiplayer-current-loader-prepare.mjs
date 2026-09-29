// Author preflight only: no browser, host, Go compiler or executable invocation.
import assert from 'node:assert/strict';
import {build as bundle} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile,symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifyProduct} from '../../../scripts/package-integrity.mjs';
import {sha256,verifyPrepared} from './multiplayer-current-loader-integrity.mjs';
const client=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),root=path.dirname(client);
assert.equal(process.argv[2],'--out','Use --out NEW_DIRECTORY; preparation never overwrites a freeze');assert(process.argv[3]);assert.equal(process.argv.length,4);
const out=path.resolve(process.argv[3]);await mkdir(out);await mkdir(path.join(out,'source'));
const pins={},pin=async(file,expected)=>{const bytes=await readFile(file),hash=sha256(bytes);if(expected)assert.equal(hash,expected,file);pins[file]=hash;return bytes};
const base=path.join(root,'work/art-generation-consumer-v1/app-v3-build-03'),product=path.join(base,'product');
const sourceReceipt=JSON.parse(await pin(path.join(base,'build.json'),'f714d2d6c761dc9b389f91034f361e4662f0c420e42905b1229b1ee76d7cd445'));
const frozenClient=path.join(base,'source/client');
for(const [file,digest]of Object.entries(sourceReceipt.sourceFiles))await pin(path.join(frozenClient,file),digest);
const entry=await pin(path.join(frozenClient,'tests/render/multiplayer-combat-entry.tsx'),'4573c94b97141142bb1d9bd6821ebb28ae2e7fd19c8cca22cc9391031c9cfb17');
const loaderLock=JSON.parse(await pin(path.join(root,'work/art-generation-consumer-v1/source-lock-v3.json'),sourceReceipt.sourceLockSHA256));
for(const [file,digest]of Object.entries(loaderLock.files))await pin(path.join(root,'work/art-generation-consumer-v1/frozen-v3',file.replace(/^source\//,'')),digest);
const goRoot=path.join(root,'work/runtime-034-integrated-source'),goLock=JSON.parse(await pin(path.join(goRoot,'source-lock.json'),'3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750'));
for(const [file,digest]of Object.entries(goLock.files))await pin(path.join(goRoot,'source',file),digest);
const previous=path.join(root,'work/multiplayer-combat/v24-34-prepared-02'),previousReceipt=JSON.parse(await pin(path.join(previous,'build.json'),'30040144196e22468a93c2eb4b740975ed9f2015db29bd54a30c1a4169d3b955'));
assert.equal(previousReceipt.sourceLockSHA256,pins[path.join(goRoot,'source-lock.json')]);
const v25=JSON.parse(await pin(path.join(root,'work/art/effects-opus-v2/integration-v25/build.json'),'6c4f6f675983c3ab428546487ee419212a2b798aa66c513cd5913058084524f0'));
const runtimeReceipt=JSON.parse(await pin(path.join(root,v25.runtimeReceiptPath),previousReceipt.runtimeReceiptSHA256));
assert.equal(runtimeReceipt.source_lock_sha256,previousReceipt.sourceLockSHA256);assert.equal(runtimeReceipt.status,'passed');
const integrity=await verifyProduct(product);
for(const key of ['files','bytes','id','version','packSHA256','inventoryFiles'])assert.equal(integrity[key],sourceReceipt.product[key],key);
assert.deepEqual(integrity.runtime,sourceReceipt.product.runtime);assert.deepEqual(integrity.runtime,previousReceipt.version);
const packBytes=await pin(path.join(product,'assets/packs/base.json'),sourceReceipt.product.packSHA256),pack=JSON.parse(packBytes);
const host=await pin(path.join(base,'frontline'),previousReceipt.sha256.host);await copyFile(path.join(base,'frontline'),path.join(out,'frontline'));
const runtimeFiles={};for(const file of ['frontline.wasm','wasm_exec.js','worker.js','worker.js.map','version.json']){const expected=runtimeReceipt.files[file];const bytes=await pin(path.join(product,'runtime',file),expected.sha256);runtimeFiles[file]={bytes:bytes.length,sha256:sha256(bytes)}}
const protocol=path.join(frozenClient,'src/protocol/frontline_pb.ts');await pin(protocol,previousReceipt.sha256.protocol);
const auditBytes=await pin(path.join(previous,'audit-replay'),previousReceipt.audit.sha256);await pin(path.join(previous,'audit-main.go'),previousReceipt.audit.sourceSHA256);await pin(path.join(previous,'audit.mod'));
await copyFile(path.join(previous,'audit-replay'),path.join(out,'audit-replay'));
await bundle({stdin:{contents:`export {fromBinary} from '@bufbuild/protobuf';export {EnvelopeSchema} from ${JSON.stringify(protocol)};export {applyDelta} from './runtime/snapshot';`,resolveDir:path.join(frozenClient,'src')},outfile:path.join(out,'decode.mjs'),nodePaths:[path.join(client,'node_modules')],bundle:true,platform:'node',format:'esm',target:'es2022'});
await bundle({entryPoints:[path.join(frozenClient,'src/render/minimap.ts')],outfile:path.join(out,'minimap.mjs'),bundle:true,platform:'node',format:'esm',target:'es2022'});
const helpers=['multiplayer-current-loader.browser.mjs','multiplayer-current-loader-contract.mjs','multiplayer-current-loader-integrity.mjs','multiplayer-current-loader-replay-observation.mjs','multiplayer-v24-contract.mjs','expansion-commander.mjs','rematch-contract.mjs','worker-observation.mjs','multiplayer-passive-diagnostics.mjs'];
for(const file of helpers){const from=path.join(client,'tests/render',file);await pin(from);await copyFile(from,path.join(out,'source',file))}
await symlink(path.join(client,'node_modules'),path.join(out,'source/node_modules'));
const workerSources={};for(const name of ['loadImageBitmap','checkImageBitmap']){const file=path.join(client,'node_modules/pixi.js/lib/_virtual',name+'.worker.mjs');await pin(file);workerSources[name]=file}
await pin(path.join(client,'node_modules/pixi.js/package.json'));await pin(path.join(client,'node_modules/playwright-core/package.json'));await pin(fileURLToPath(import.meta.url));await pin(path.join(root,'scripts/package-integrity.mjs'));
const preparedPins={};for(const file of ['frontline','audit-replay','decode.mjs','minimap.mjs',...helpers.map(f=>'source/'+f)])preparedPins[file]=sha256(await readFile(path.join(out,file)));
const report={status:'prepared-browser-unrun',prepared:new Date().toISOString(),repository:root,product,sourceReceipt:path.join(base,'build.json'),sourceReceiptSHA256:pins[path.join(base,'build.json')],loaderSourceLockSHA256:sourceReceipt.sourceLockSHA256,sourceLockSHA256:previousReceipt.sourceLockSHA256,runtimeReceiptSHA256:previousReceipt.runtimeReceiptSHA256,scope:'Unmodified frozen loader-v3 App build03 with v25+36 incomplete art and integrated Go0.3.4. Eight explicit 1–4-human cases, including new 3H+1 normal Go AI; no browser, host, native match, performance or release acceptance from this preparation.',version:integrity.runtime,sha256:{host:sha256(host),wasm:runtimeFiles['frontline.wasm'].sha256,pack:sha256(packBytes),protocol:previousReceipt.sha256.protocol,entry:sha256(entry)},pack:{files:pack.files.length,bytes:integrity.bytes,id:pack.id,version:pack.version},packFiles:pack.files,runtimeFiles,maps:Object.fromEntries(await Promise.all(['industrial-valley','dry-river'].map(async name=>[name,sha256(await readFile(path.join(product,'content/maps',name+'.json')))]))),art:JSON.parse(await readFile(path.join(product,'art/index.json'))),audit:{...previousReceipt.audit,provenance:'Reused exact integrated3d49 auditor from v24 prepared-02; no compilation or invocation during this preparation.'},helpers:Object.fromEntries(['decode.mjs','minimap.mjs'].map(f=>[f,preparedPins[f]])),workerSources,inputPins:pins,preparedPins};
await writeFile(path.join(out,'build.json'),JSON.stringify(report,null,2)+'\n');const check=await verifyPrepared(out);
await writeFile(path.join(out,'preflight.json'),JSON.stringify({status:'passed',scope:'Author-only source, binary and complete static-pack integrity; no executable invoked.',receiptSHA256:check.receiptSHA256,verified:check.verified,package:report.pack,sourceReceiptSHA256:report.sourceReceiptSHA256,preparedPins},null,2)+'\n');
console.log(JSON.stringify({out,status:'prepared-browser-unrun',verified:check.verified,receiptSHA256:check.receiptSHA256}));
