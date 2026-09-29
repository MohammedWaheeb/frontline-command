# Private v3 actual browser result

29 September 2026, 11:12:23–11:12:24 UTC. **Strict overall FAIL**, preserved at [chromium-v3-01/receipt.json](chromium-v3-01/receipt.json). All 22 functional assertions reached; three native request errors remain unclassified. This does not certify a clean browser run, a full App upgrade, or release readiness. The ephemeral server, persistent browser and additional no-worker context closed; the temporary browser profile was removed. No second browser was launched from this lane.

The selected source is `../art-generation-consumer-v1/frozen-v3/client`, lock `a70a5df5cb053b9f1ee96f5ced310b83f99c2514764f6409c27b286d8ab21282`, containing 247 captured files. The source, immutable v25 PNG inputs and driver/helper made 257 pre/post hash guards, all unchanged. Exact driver/fixture copies, manifests, compiled bundle hashes and selected worker hash are in the receipt. V1/v2 frozen consumers and prior failures are unchanged. Core-v2 queue proof remains a separate 14-test unit boundary.

Actual engine was bundled Playwright Chromium **151.0.7922.34**, using the executable recorded in the receipt. It is not a branded Chrome/Edge, stock Firefox or Safari compatibility claim. Genuine localhost secure-context Service Worker and Web Locks capabilities were observed. Art packing had closed before this small functional test; timings are not a performance measurement.

## Functional results reached

A and B use two unchanged actual 942×1008 PNGs, with declared descriptor relocation to one shared test path. The default actual ArtLibrary captured its manifest through `/content/index.json` → `/assets/packs/base.json`; the test did not inject a trusted generation into it.

| Actual decoded pixel observation | SHA-256 |
|---|---|
| Reference A, pending A after other-tab B install, A after eviction/reload while host serves B, A decoded-image consumer | `59ec44b22c67cf7d4fcc6401d7e7d3508b0fa4632c8e97eff63acecb1f36fc32` |
| Reference B, newly captured B, retained B after rollback to A, B decoded-image consumer, cold C (declared same PNG as B) | `e32141238157da955e90fa0174c082acbbec4482f8d527726f4240d5fa8428db` |

This corrects the precise earlier functional mismatch: the old frozen v25 loader admitted B pixels with retained A descriptors. Here retained A stays A. These hashes are the actual decoded bitmap/image source bytes, not a simulated renderer snapshot or a world-scene visual review.

One admitted page uses 3,798,144 RGBA bytes and 118,692 picking bytes. Eviction zeros resident/picking bytes and invalidates the old frame picking callback. A retained page read fails `asset_generation_unavailable` after explicit deletion of its selected A cache; it admits no B substitute. In a genuinely separate context with neither cache nor worker, changed B bytes reject as `asset_integrity` with **zero ImageBitmaps created**. An actual pending A HTTP response, held before delivery while the host switches to B, still produces A when delivered. Disposing another held native request cancels it without admitting a page.

All six download/storage failure variants (same-length corruption, truncation, deliberate interruption, file quota, manifest quota, READY quota), held-download cancel, initially canceled rollback and real other-tab lock-wait cancel retain the usable previous generation and remove incomplete staging. Unchanged installation reuses its cache without downloading payloads. A slow C install finishing after another tab activates B receives the later activation order. Explicit rollback works while a retained B ArtLibrary still sees B. The worker does not resurrect A-only retired files when C is active.

All three page contexts disposed their libraries with zero live tracked ImageBitmaps, object URLs, blob bytes or test canvases. Zero resident/picking bytes were explicitly recorded at A eviction/removal and pending-dispose boundaries. The aggregate final dispose helper recorded native bitmap/blob counts, but discarded each library's returned statistics; it therefore does not separately certify final aggregate page/picking accounting. A full persistent-browser restart under offline transport loaded the cached C document and default ArtLibrary's exact stored C index/manifest/page; cold cleanup again returned to zero. [The screenshot](chromium-v3-01/cold-C.png) shows the cached test document, **not the full product**. The fixture bundle is injected by Playwright, so this does not prove a packaged full-App JavaScript boot or Go/audio availability.

## Strict failures retained

| Request-start phase | URL path | Browser failure |
|---|---|---|
| Initial A install/capture | `/upgrade/retired.txt` | `net::ERR_ABORTED` |
| B READY quota injection | `/art/offline-upgrade/page.png` | `net::ERR_ABORTED` |
| No-worker pending A response across host swap | `/art/offline-upgrade/page.png` | `net::ERR_ABORTED` |

Each corresponding server response recorded status 200 and `writableFinished: true`. That proves only server-side completion. Successful installer verification or decoded A pixels do not independently attribute a browser transport error to a specific native EOF/cancel event. The course did not capture a per-request Chromium identity joined to native consumer EOF/hash diagnostics. These three errors remain **unclassified**, with no whitelist or product-cause assumption.

The other three request failures correspond to exact deliberate interruption/abort boundaries and are labeled separately. There were zero page exceptions, and the only effective HTTP error was the intended retired-path 503. Console records and all raw requests/failures remain in the full receipt.

A further diagnostic run, if authorized, should capture the already-established bounded native-consumer EOF/hash instrumentation and exact request identities for these same small paths without altering the consumer, transaction gates or response timing. Root owns the subsequent full-App integration course. No production fix or promotion is justified solely by assuming these errors are benign.
