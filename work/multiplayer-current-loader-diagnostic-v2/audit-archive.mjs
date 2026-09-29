// Read-only reproducibility audit. Exit0 certifies archive/claim consistency,
// never changes the original browser result (which remains strict FAIL).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {auditCurrentLoaderBodies} from './observer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),run=path.join(here,'chromium-01');
const sha=b=>createHash('sha256').update(b).digest('hex');
const archives=JSON.parse(await readFile(path.join(run,'archive-receipt.json'))).archives;
let report;
for(const entry of archives){
 const packed=await readFile(path.join(run,entry.archive)),body=gunzipSync(packed);
 assert.equal(packed.length,entry.archiveBytes);assert.equal(sha(packed),entry.archiveSHA256);
 assert.equal(body.length,entry.bytes);assert.equal(sha(body),entry.sha256);
 if(entry.original==='browser.json')report=JSON.parse(body);
}
assert(report);assert.equal(report.status,'failed');assert.equal(report.rawDiagnosticStatus,'failed');
const lockBytes=await readFile(path.join(here,'source-lock.json'));
assert.equal(sha(lockBytes),report.preflight.sourceLockSHA256);
for(const [file,digest]of Object.entries(JSON.parse(lockBytes).files))assert.equal(sha(await readFile(path.resolve(here,file))),digest,file);
const packBytes=await readFile(path.join(report.product,'assets/packs/base.json'));
assert.equal(sha(packBytes),report.preflight.packSHA256);
const actual=auditCurrentLoaderBodies({snapshot:report.nativeSnapshot,manifest:JSON.parse(packBytes),origin:report.origin,packDescriptor:{path:'/assets/packs/base.json',bytes:packBytes.length,sha256:sha(packBytes)},playwrightFailures:report.requestFailures,pageErrors:report.pageErrors,consoleErrors:report.consoleErrors,httpErrors:report.httpErrors});
// browser.json is a JSON boundary: undefined optional server members are absent.
assert.deepEqual(JSON.parse(JSON.stringify(actual)),report.bodyDiagnostic,'Stored JSON reconciliation drifted');
assert.equal(actual.allRawFailures.length,387);assert.equal(actual.exactBodyFailureFacts.length,385);assert.equal(actual.unprovedRawFailures.length,2);
assert.equal(actual.coverage.complete,2740);assert.equal(actual.coverage.supportedIncomplete.length,0);
assert.equal(report.hostExit.code,0);assert.equal(report.remainingSockets,0);
for(const key of ['residentPages','residentBytes','pickingBytes'])assert.equal(report.afterMenu.art[key],0);
assert.equal(report.afterMenu.frameSubscribers,0);assert.equal(report.afterMenu.transportPresent,false);
console.log(JSON.stringify({audit:'passed-exact-archive-and-same-run-reconciliation',originalBrowserStatus:report.status,rawDiagnosticStatus:actual.rawStatus,bodyStatus:actual.bodyStatus,rawFailures:actual.allRawFailures.length,exactBodyFailureFacts:actual.exactBodyFailureFacts.length,unprovedRawFailures:actual.unprovedRawFailures.length,meaning:'This audit preserves strict failure; it does not infer abort cause, browser decode success or a full-match pass.'},null,2));
