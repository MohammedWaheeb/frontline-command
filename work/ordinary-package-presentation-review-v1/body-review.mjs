// Read-only recomputation from retained browser records. No browser or network.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {auditCurrentLoaderBodies} from '../full-app-native-body-v4/observer.mjs';
import {withoutControlBodies,verifyControlProofs,paidPowerProof,isControl} from '../full-app-native-body-v4/course.mjs';
import {verifyMenuWorkers,verifyPaidSession} from '../full-app-native-body-v4/lifecycle.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),base=path.join(root,'work/ordinary-package-presentation-v1');
const read=async p=>JSON.parse(await readFile(path.join(base,p))),sha=b=>createHash('sha256').update(b).digest('hex');
const result=await read('chrome-01/result.json'),ledger=await read('chrome-01/native-ledger.json'),old=await read('chrome-01/body-audit.json');
for(const [p,d] of Object.entries(result.inputs))assert.equal(sha(await readFile(p)),d,p);
const packBytes=await readFile(path.join(result.config.product,'assets/packs/base.json')),pack=JSON.parse(packBytes);
assert.equal(sha(packBytes),result.config.packSHA256);
const packDescriptor={path:'/assets/packs/base.json',bytes:packBytes.length,sha256:sha(packBytes)};
const audit=auditCurrentLoaderBodies({snapshot:withoutControlBodies(ledger),manifest:pack,origin:result.origin,packDescriptor,playwrightFailures:result.requestFailures.filter(r=>!isControl(r.url)),pageErrors:result.pageErrors,consoleErrors:result.controlDiagnostics.unexpectedConsole,httpErrors:result.httpErrors});
assert.deepEqual(audit,old,'Saved body audit is reproducible from original ledger');
assert.equal(audit.rawStatus,'failed');assert.equal(audit.coverage.complete,689);assert.equal(audit.exactBodyFailureFacts.length,25);assert.deepEqual(audit.unprovedRawFailures,[]);
const all=auditCurrentLoaderBodies({snapshot:ledger,manifest:{files:[...pack.files,...(await import('../full-app-native-body-v4/course.mjs')).controls]},origin:result.origin,packDescriptor});
// Compare at the original JSON receipt boundary: undefined optional fields are omitted.
const jsonValue=value=>JSON.parse(JSON.stringify(value));
assert.deepEqual(jsonValue(verifyControlProofs(all,result.controls)),result.controlProofs);
assert.deepEqual(jsonValue(paidPowerProof(result.menuObservation,result.opening)),result.paid);
assert.deepEqual(jsonValue(verifyMenuWorkers(result.menuObservation,result.bootWorkers,result.sessionBinding)),result.workerCleanup);
assert.deepEqual(jsonValue(verifyPaidSession(result.menuObservation,result.sessionBinding,result.chosenPreview.point)),result.paidSession);
const ordering={},extensions={};
for(const fact of audit.exactBodyFailureFacts){
 const key=fact.diagnostic.observedOrder;ordering[key]=(ordering[key]??0)+1;
 const url=new URL(fact.proof.native.url),extension=path.extname(url.pathname);extensions[extension]=(extensions[extension]??0)+1;
 const b=await readFile(path.join(result.config.product,url.pathname.slice(1)));
 assert.equal(b.length,fact.proof.expected.bytes);assert.equal(sha(b),fact.proof.expected.sha256);
}
const report={scope:'Saved evidence recomputation only. No browser, additional product request, runtime execution or diagnostic waiver.',status:'passed-scoped-review',inputPins:88,rawStatus:audit.rawStatus,originalBodies:audit.coverage.complete,exactFailedBodyProofs:25,unprovedFailures:0,unsupportedSuccessfulRequests:audit.coverage.unobservedRequests.length,ordering,extensions,controls:result.controlProofs,paid:result.paid.paid,save:result.paid.save,workerCleanup:result.workerCleanup.status,accounting:audit.accounting,limitations:['CDP delivery ordering is recorded separately from native consumption; cause remains unproved.','Original-reader EOF/hash proves consumed static bytes, not decoder success or clean network.','102 successful browser-native/unproven requests remain outside original-reader proof.']};
await writeFile(path.join(here,'body-review.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,controls:4,accounting:report.accounting.map(({scope,...r})=>r)}));
