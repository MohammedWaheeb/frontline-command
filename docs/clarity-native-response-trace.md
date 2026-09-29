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

After all contexts and the browser close, the copy reconciles the entire CDP ledger with the native traces using the existing narrow classifier. Completed-body abort reports require exact native EOF/bytes and a later observed cancellation, along with unique scoped ordinals, status200 and immutable served identity. They remain **transport reports**, not successful-load/decode claims.

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
