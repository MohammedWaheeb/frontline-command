// Bind this frozen TEST-ONLY successor to a separately approved final package.
// No browser, host, Go compilation, package rebuild or implicit approval.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile,copyFile,symlink} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifyPrepared,sha256} from './source/multiplayer-current-loader-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const {values:args}=parseArgs({options:{base:{type:'string'},'base-sha':{type:'string'},approval:{type:'string'},'approval-sha':{type:'string'},out:{type:'string'}}});
for(const key of ['base','base-sha','approval','approval-sha','out'])assert(args[key],`Missing --${key}`);
const base=path.resolve(args.base),verified=await verifyPrepared(base);assert.equal(verified.receiptSHA256,args['base-sha']);
const approvalPath=path.resolve(args.approval),approvalBytes=await readFile(approvalPath);assert.equal(sha256(approvalBytes),args['approval-sha']);
const approval=JSON.parse(approvalBytes);
assert.equal(approval.status,'approved');assert.equal(approval.packSHA256,verified.build.sha256.pack);
assert.equal(approval.productReceiptSHA256,verified.build.sourceReceiptSHA256);
assert.equal(typeof approval.scope,'string');assert(approval.scope.length>0);
assert(Array.isArray(approval.reviews)&&approval.reviews.length>0,'Exact final-art review receipts are required, never inferred by this recipe');
const pins={...verified.build.inputPins,[path.join(base,'build.json')]:verified.receiptSHA256,[approvalPath]:sha256(approvalBytes)};
for(const review of approval.reviews){const file=path.resolve(root,review.path);assert.equal(sha256(await readFile(file)),review.sha256);pins[file]=review.sha256}
const lockBytes=await readFile(path.join(here,'source-lock.json')),lock=JSON.parse(lockBytes);pins[path.join(here,'source-lock.json')]=sha256(lockBytes);
for(const [file,hash]of Object.entries(lock.files)){const absolute=path.join(here,file);assert.equal(sha256(await readFile(absolute)),hash,file);pins[absolute]=hash}
const out=path.resolve(args.out);await mkdir(out);await mkdir(path.join(out,'source'));
const preparedPins={};
for(const name of ['frontline','audit-replay','decode.mjs','minimap.mjs']){await copyFile(path.join(base,name),path.join(out,name));preparedPins[name]=sha256(await readFile(path.join(out,name)));assert.equal(preparedPins[name],verified.build.preparedPins[name])}
for(const name of (await readdir(path.join(here,'source'))).filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs'))){await copyFile(path.join(here,'source',name),path.join(out,'source',name));preparedPins['source/'+name]=sha256(await readFile(path.join(out,'source',name)))}
await symlink(path.join(root,'client/node_modules'),path.join(out,'source/node_modules'));
const build={...verified.build,status:'prepared-browser-unrun',prepared:new Date().toISOString(),basePreparationSHA256:verified.receiptSHA256,scope:approval.scope+' No results from preparation; future final-package actual gameplay/strict/long-duration gates remain unearned.',finalArtEligibility:{status:'approved',packSHA256:approval.packSHA256,approvalPath,approvalSHA256:sha256(approvalBytes)},courseSourceLockSHA256:sha256(lockBytes),inputPins:pins,preparedPins};
await writeFile(path.join(out,'build.json'),JSON.stringify(build,null,2)+'\n');
const check=await verifyPrepared(out);await writeFile(path.join(out,'preflight.json'),JSON.stringify({status:'passed',scope:'Binding/integrity only; no executable or browser invoked.',verified:check.verified,receiptSHA256:check.receiptSHA256,basePreparationSHA256:verified.receiptSHA256,courseSourceLockSHA256:sha256(lockBytes),finalArtEligibility:build.finalArtEligibility},null,2)+'\n');
console.log(JSON.stringify({out,status:'prepared-browser-unrun',verified:check.verified,receiptSHA256:check.receiptSHA256}));
