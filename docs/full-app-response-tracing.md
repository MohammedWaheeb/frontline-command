# Full-App response diagnostics

## Existing evidence remains unclassified

`work/battlefield-clarity/chromium-09/browser.json` records eight functional
clarity passes, zero page/console/HTTP errors and no frozen-source changes, plus
**6,770 `net::ERR_ABORTED` diagnostics**. Of these, 5,047 concern PNGs and 1,723
concern JSON. Counts by recorded phase are: save/replay 3,272, import-before
1,867, import-defeat 1,627, countdown 4. All failed URLs have a served-file
identity, but the run does not record per-request ordinals or native response
EOF. None of those diagnostics can be retrospectively classified as completed
or harmless from the retained evidence. The original report is unchanged.

One concrete mechanism to investigate is `asset-preparation.ts`: each streamed
asset request has its own 15-second AbortSignal timeout. That signal can fire
after a successful body read. The native reader, signal event and network
diagnostic need to be joined before attributing any particular abort to that
mechanism. Phase labels or elapsed wall time alone do not prove it.

The FX course's narrower classifier already joins an exact URL ordinal to its
actual loader reader, status 200, native EOF, byte count and immutable served
SHA. It separates this transport category from real decode/load assertions,
keeps pending-release cancellation distinct and reconciles after browser close.
That isolated single-document fetch scope is not interchangeable with the
full App's repeated URLs, multiple documents, image loads and decoder workers.
The existing FX helper is unchanged.

## New test-only helper

`client/tests/render/native-response-trace.mjs` exports two functions:

- `nativeResponseTrace(fetcher, options)` returns an observed fetch function and
  a detached trace snapshot. It only observes same-origin `/art/` GET calls.
  It does not install globals or prototypes. It forwards the original call
  arguments and performs exactly one native fetch. The same response, reader,
  byte chunks, read result and rejection objects reach the caller. The caller
  remains responsible for every read, cancellation and lock release.
- `reconcileNativeResponses(input)` reports completed-body abort diagnostics
  separately from every unclassified diagnostic. It never labels a completed
  response as a successful decode or asset load. It has no generic whitelist
  for pending cancellation or normal page transitions.

The observer uses the same forwarding-promise approach as the existing FX
instrumentation. It records and rethrows native failures. Returning the
original promise while attaching a separate rejection handler could suppress
unhandled rejection reporting; this helper deliberately avoids that pattern.
Observation adds microtasks and bookkeeping, so this is correctness evidence,
not a performance benchmark. There are no fetch clones, extra body reads,
replacement bytes, retries, forced cancellations or altered abort signals.

Reader EOF, bytes, response status/URL, signal abort and caller cancellation
are recorded with a monotonic document-local event order. `onRecord` can stream
detached updates to a passive test collector; no asynchronous collector is
awaited inside the asset path. Observer faults or bounded-record overflow make
the trace ineligible for classification. Native application errors continue
through their original call path.

## Proposed bounded integration

Root can later include this new helper in a test-only init observer, before any
App fetch captures its implementation. That installation must be reviewed
explicitly; no existing driver or production loader was modified here.

Each page navigation needs a unique document scope, and the outer collector
must retain all scopes through context/browser close. The network ledger needs
a unique native request ID, full URL including query, method, response status,
response URL, redirect/service-worker flags and a proven window-fetch realm.
Chromium's page-target network observation can provide that separation from
dedicated decoder-worker targets. A Playwright URL or nearby timestamp alone
does not prove the initiator realm. Unproven requests remain unclassified.

Within one document/full-URL/method group, the helper requires complete matching
native-fetch and network cardinality, contiguous unique ordinals, and no
overlapping native body intervals. Overlap, an aborted-before-dispatch request,
a missing event, worker ambiguity, a redirect, or a query mismatch rejects the
join rather than guessing which request completed. This deliberately prefers
an unresolved diagnostic over a false pass.

A completed-body abort category requires Chromium's exact `net::ERR_ABORTED`,
status 200 on both sides, one default native reader, no read/fetch/cancel error,
actual EOF at the expected byte count, a matching immutable served-file
SHA/size, and an observed signal/caller cancellation strictly after EOF. The
SHA describes the exact frozen server response; the helper does not compute a
second client-body hash or claim consumer verification. Real load/decode,
application errors, HTTP errors and cleanup checks remain separate strict gates.

The final collector must drain its passive event stream, close the browser while
retaining native diagnostic handlers, then reconcile the entire ledger. If
closing destroys a document before its last trace update arrives, that request
has insufficient proof and remains unclassified. Late diagnostics must never
inherit an earlier same-URL successful response.

## Focused verification

`node --test client/tests/render/native-response-trace.test.mjs` passes 33 tests.
They cover exact native call/result/error forwarding, original cancel reason,
EOF ordering, scope/ordinal/cardinality, overlapping repeated URLs, incomplete
bodies, SHA/size mismatch, worker/redirect/service-worker exclusion, lost trace
records and late close diagnostics. No browser, host, native Go process, global
instrumentation or production modification was used for these tests.

Current whole-App diagnostics remain open until a fresh scoped browser run
collects the required evidence. This helper does not change the status of
Chromium09 or any earlier failed/unclassified run.
