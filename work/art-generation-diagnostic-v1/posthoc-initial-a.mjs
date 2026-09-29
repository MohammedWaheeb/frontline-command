// Read-only extraction from the completed, failed run. No browser, host, response
// or original classification is changed; the expected descriptor is always A.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconcileGenerationDiagnostic} from './native-diagnostic.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),directory=path.join(here,'chromium-01'),file=path.join(directory,'receipt.json'),bytes=await readFile(file),receipt=JSON.parse(bytes),sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(receipt.status,'failed');assert.equal(receipt.nativeDiagnosticStatus,'captured');assert.equal(receipt.nativeDiagnostic.exactBodyReports.length,0,'Original predefined classification changed');
const manifestBytes=await readFile(path.join(directory,'fixture-manifests.json')),manifest=JSON.parse(manifestBytes).A;assert.equal(manifest.version,'fixture-A');
const descriptor=manifest.files.find(file=>file.path==='/art/offline-upgrade/page.png');assert(descriptor);assert.equal(descriptor.sha256,receipt.identity.art.A.pngSHA256);assert.equal(descriptor.bytes,365377);
const analysis=reconcileGenerationDiagnostic({snapshots:receipt.nativeSnapshots,playwrightFailures:receipt.requestFailures,planned:[{phase:'install-and-capture-A',...descriptor}]});
assert.deepEqual(analysis.faults,[]);assert.equal(analysis.diagnosticsAgree,true);assert.equal(analysis.proofs.length,1);assert.equal(analysis.exactBodyReports.length,1);
const proof=analysis.proofs[0];assert.equal(proof.complete,true);assert.equal(proof.failures.length,1);assert.equal(proof.failures[0].relativeEOFOrder,'failure-before-native-eof');assert.deepEqual(proof.failures[0].cancellation,[]);
const output={scope:'POSTHOC read-only analysis of a newly located abort. Expected bytes come only from fixture A, which the immutable driver selects at initial-A installation; not hash-selected. The original predefined report and strict failed outcome remain unchanged.',originalReceiptSHA256:sha(bytes),manifestFileSHA256:sha(manifestBytes),sourceSHA256:sha(await readFile(fileURLToPath(import.meta.url))),strictOutcome:'failed-unmodified',consumerSourceLockSHA256:receipt.identity.consumerLockSHA256,plannedInitially:false,expectedGeneration:'fixture-A',proof,meaning:'This uniquely identified native request later returned all 365377 original bytes and reader EOF with the planned A SHA. CDP reported ERR_ABORTED before its streamed EOF/hash observations; no native cancellation was observed. This supports complete consumed-body integrity only, not an abort cause, retrospective clean run, benign diagnostic classification or prior-request attribution.'};
await writeFile(path.join(directory,'posthoc-initial-A.json'),JSON.stringify(output,null,2)+'\n');assert.equal(sha(await readFile(file)),sha(bytes),'Original receipt changed');console.log(JSON.stringify({status:'posthoc-original-body-exact-strict-failure-preserved',request:proof.request.id,bytes:proof.native.bytesRead,sha256:proof.native.sha256,failureOrder:proof.failures[0].failure.order,eofObservedOrder:proof.native.cdpObserved.eofOrder,hashObservedOrder:proof.native.cdpObserved.hashOrder,cancellationObserved:false}));
