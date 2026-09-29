# Passive full-App native-response diagnostic copy

`client/tests/render/battlefield-clarity-traced.browser.mjs` is a new copy of the existing clarity driver (original SHA256 `b0d7705f1a7f994e200dc5edfb07f3a60def00ea84714dd01fdaacbf4f73955d`). The original driver, frozen v23 product, production loaders, renderer, UI and Go runtime are untouched. No browser or host was started during authoring.

The copy is Chromium-only, defaults to **one** 1600×900/100% case and accepts `--cases 1..8`. It retains every original control/action, authoritative save assertion, worker cleanup assertion, timeout and minimap/clarity check for each selected layout. One case is a diagnostic probe, not full eight-layout acceptance. The copied course still reloads once and therefore observes at least two document scopes.

## What is observed

The explicit test-only init observer installs the already-tested `nativeResponseTrace` forwarding wrapper before App code runs. It makes one native fetch with the original receiver/arguments and returns the original response, reader, chunks and errors. It observes the caller's existing default-reader calls, EOF, byte count, signal abort and cancellation. It does not clone responses, read an extra byte, retry, change signals, wait inside the asset path, replace data or suppress native errors. Its bookkeeping/promise reactions add overhead, so this course is not performance evidence.

`native-response-cdp.mjs` opens a Chromium CDP **page** session and enables only Network, Runtime, Debugger and Page observation. No `Fetch` interception, cache-policy override, response-body read or worker command is issued. The observer's sourceURL is only a debugger label; it is not fetched.

A network request is eligible as a `window-fetch` only when all of these are proved together:

- Its actual CDP request ID belongs to this verified page target and its resource type is `Fetch` with a script initiator.
- An initiator stack script ID belongs to the exact observer sourceURL.
- That script's recorded execution context is the default world of the request's frame.
- A passive Runtime binding from that same context declares the exact document scope used by the native reader trace.

The ledger preserves full URLs, including queries, method, frame/loader IDs, context identity, response status/URL, explicit service-worker provenance and redirects. Context-ID reuse after reload does not rewrite old script/context associations. Unproved contexts, image/XHR/worker requests, redirects, lost events and ambiguous repeated requests remain ineligible. No request identity is guessed from a nearby timestamp.

Native records stream through a passive synchronous CDP binding; no collector promise is awaited by the fetch/reader. Explicit snapshots run before reload and context close, and on `pagehide`. A final snapshot must follow the last native record and include every record. Overflow, observer faults, lost final snapshots and capture failures remain strict failures.

## Immutable response identity and final gates

The product's existing `assets/packs/base.json` supplies independently frozen SHA256/byte expectations. The local static server records exact bytes actually served for each full URL and retains the original missing-resource behavior. A changed file is still a failure. This does not add client-side body hashing or claim a decode succeeded.

After all contexts and the browser close, the copy reconciles the entire CDP ledger with the native traces using the existing narrow classifier. Completed-body abort reports require exact native EOF/bytes and a later observed cancellation **before** the network failure, along with unique scoped ordinals, status200 and immutable served identity. They remain **transport reports**, not successful-load/decode claims.

The final gate fails on every unclassified diagnostic, collector/capture fault, source change, page/console/HTTP error or CDP-versus-Playwright diagnostic-count mismatch. The latter compares complete URL/error multisets; it does not pretend Playwright exposes CDP request IDs. Both raw ledgers remain in the report. There is no generic pending-cancel or transition whitelist.

Native `Response.json()`, `blob()` or image consumers that do not call the observed JavaScript `getReader()` lack this EOF proof. Their aborts therefore remain unclassified. That is an expected diagnostic limitation, not permission to treat them as harmless. Earlier Chromium09 and v23 raw failures are not retrospectively reclassified.

## Checks and bounded run

The 33 native-reader tests and 22 CDP-ledger/installation tests pass without a browser. They cover default-versus-isolated/worker contexts, script/frame/document identity, reload context reuse, redirects and missing service-worker proof, native-record ordering, lost final snapshots, late close failures and diagnostic mismatch. The emitted observer source parses successfully. Syntax checks pass for the copied driver and both helpers.

Root owns execution. The proposed first command is:

```sh
node client/tests/render/battlefield-clarity-traced.browser.mjs \
  --product work/art/effects-opus-v2/integration-v23/product \
  --saves work/art/effects-opus-v2/ambient-native-07 \
  --out work/battlefield-clarity/chromium-v23-traced-01 \
  --engine chromium --headless true --cases 1
```

Use a new output path for every attempt. The initial browser run must verify actual CDP proof availability and preserve any incomplete join; unit fixtures alone cannot certify the browser's event stream.

## Actual v23 probes (29 September)

Both separate headless1600×900/100% probes completed all20 functional checkpoints, save/replay/minimap/countdown controls and cleanup. Each retained zero page/console/HTTP/source errors, complete final document traces and exact CDP/Playwright diagnostic counts. Both overall results remain **FAILED** under the strict diagnostic gate.

| Browser | Raw abort reports | Exact EOF/size but no observed application cancellation | Other unresolved |
| --- | ---: | ---: | --- |
| Bundled Chromium151.0.7922.34 | 78 | 75 | 2 ordinal joins ambiguous; 1 incorrectly attributed by the original temporal rule |
| Genuine Google Chrome154.0.8037.58 | 68 | 66 | 2 ordinal joins ambiguous |

The exact product, runtime, base-pack, executable and driver hashes plus original receipt hashes are in `work/evidence/full-app-native-response-trace/actual-v23-comparison.json`. The original reports remain at `work/battlefield-clarity/chromium-v23-traced-01/browser.json` and `work/battlefield-clarity/chrome154-v23-traced-01/browser.json`. Chrome used explicit task-local executable SHA256 `633aa60f1ee2346804e006071d8f6a2114106e9c17abd601fe61bf9754638740` and a fresh Playwright temporary profile. No personal profile/settings changed. The driver now accepts `--executable` and verifies its byte identity again after closure.

The first probe exposed a concrete classifier defect: its one FX report matched eventual native EOF and a later reset abort, without proving their order relative to the network diagnostic. The old matcher required only EOF before abort, so a future reset could incorrectly explain a prior error. The CDP helper now records the actual streamed observation order for EOF/abort/cancel and requires EOF→cancellation→network-failure. A final snapshot cannot backdate that evidence. New regressions reproduce the late reset and snapshot-only ambiguity; all57 focused tracing tests pass. The initial report is preserved unchanged and its apparent one classified report is not accepted as evidence of cancellation cause.

Exact native200/EOF/served-byte identity is a bounded useful fact even without a known cause. It does not prove image decoding, prove that a reported error was benign, or justify suppressing diagnostics. Repeated metadata URLs whose earlier native `Response.json()` consumption was not observed remain ambiguous. The observed counts differ from earlier uninstrumented courses; observer scheduling/GC overhead prevents a rate/performance comparison. The product code and deadline implementation were unchanged between these probes, and neither browser version alone resolved the diagnostics.

No production fetch change is justified yet. A future isolated native-fetch reproduction can distinguish reader/Response lifetime, lock release, synchronous EOF completion and body-consumption APIs against an identical immutable resource. It must preserve strict product receipts; a behavioral experiment is separate from the passive full-App observer. Prior6770 and5104 raw full-layout diagnostics remain unclassified.

The subsequent standalone investigation in `docs/native-fetch-primitive-diagnostic.md` reproduced stream reports without game code. Its explicit callback records show errors arriving before the native EOF observation, followed by exact full body hashes. Reviewing the ordered v23 Chrome154 ledger likewise finds68/68 error callbacks before EOF. The older pre-order Chromium151 receipt cannot prove that ordering. No earlier receipt is rewritten or granted a pass.
