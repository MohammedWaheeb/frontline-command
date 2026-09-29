# Native diagnostic result — strict failure preserved

29 September 2026, 11:25:22–11:25:24 UTC. The bounded course is **strict FAIL** at the original request-error gate. All 22 functional assertions and the newly recorded final cleanup assertions completed. The browser, additional no-worker context, persistent restart and localhost fixture server closed; no follow-up browser was dispatched.

Exact frozen consumer v3 remains `a70a5df5cb053b9f1ee96f5ced310b83f99c2514764f6409c27b286d8ab21282`. All 267 input hashes, including the original failed receipt, agreed after the run. Seven diagnostic unit tests, bundle and strict fixture TypeScript passed in the run's short preflight. Actual engine was bundled Chromium151.0.7922.34, not branded Chrome/Edge or stock Firefox/Safari. The observation wrappers add work/microtasks; no timing or benchmark inference is made.

[receipt.json](chromium-01/receipt.json) retains the raw browser/CDP/reader records. [summary.json](chromium-01/summary.json) is a compact derived summary. The previous `../art-generation-browser-v1/chromium-v3-01` failure is untouched.

## Predefined observations

All three planned requests had one-to-one default-document/Chromium request identities, explicit original-reader EOF and exact planned bytes/SHA. None reported an abort during this successor:

| Predefined request | Actual native request ID | Bytes / original body |
|---|---|---|
| Initial A `/upgrade/retired.txt` | `EB86EE7DCCFCDC821D643FF905FA72EB:83073.12` | 6, exact A descriptor |
| B READY-quota `/art/offline-upgrade/page.png` | `EB86EE7DCCFCDC821D643FF905FA72EB:83073.46` | 208,842, exact B PNG |
| Pending A response across B host swap | `D4C80CD0AAD95BF56A5891BADCDB4C29:83077.13` | 365,377, exact A PNG |

The raw CDP and Playwright failure counts agree; there were no observer faults, overflow or missing planned scenarios. This does **not** retrospectively establish the cause or completion of the three earlier aborts. Their original instrumentation lacked this evidence.

## New abort and labeled posthoc extraction

This successor instead reported one unclassified `net::ERR_ABORTED` on the initial A installation's PNG, native request `EB86EE7DCCFCDC821D643FF905FA72EB:83073.11`. It was outside the three predefined phase/path pairs. The original predefined reconciler therefore emitted zero `exactBodyReports`, and the strict request gate failed. That report remains unchanged.

Root authorized read-only posthoc inspection of already captured data. `posthoc-initial-a.mjs` fixes its expected descriptor to **fixture A**, the generation selected by the immutable driver during initial installation. It never chooses among A/B hashes based on the observed result. [The derived extraction](chromium-01/posthoc-initial-A.json) shows:

- Exactly one default-window fetch in the verified observer execution context/frame, no redirect or service-worker response, matching full URL/method/document ordinal 1 and unique native request ID.
- Original explicit reader: one 365,377-byte chunk followed by EOF (two read calls), 365,377 bytes hashed, SHA `b27d656eef21e02d034ac63f297e24b85d00e80caff6beb35fef29d962c8392f`, equal to the planned A PNG.
- CDP `loadingFailed` observed order **84**, streamed native EOF observed order **85**, hash observed order **86**. No reader cancel or AbortSignal cancellation was observed for this request.

This proves exact consumed-body integrity for the new request. It does **not** prove why Chromium emitted the abort, that cancellation occurred after EOF, a benign platform defect, or a clean course. No server-finished inference is used. The raw failure and original strict outcome remain failures.

The other three network failures were the explicit interrupted download and two intentional cancellation boundaries. No page exception occurred, and the only effective HTTP error was the expected retired-path 503.

## Functional and lifecycle scope

The same actual default ArtLibrary/installer/worker assertions again proved retained A metadata/pixels across B installation and host swap; fresh B pixels; A/B eviction and image identity; unchanged reuse and rollback; corruption/truncation/storage/cancel atomicity; completion ordering under actual Web Locks; removed-generation failure without substitution; no-worker mismatched bytes rejected before decode; and a cold persistent-browser offline C load.

All **six** instantiated libraries (`oldA`, `newB`, `onlineA`, `pendingOnlineA`, `disposePending`, `coldC`) now have separately retained final statistics: zero indexed/resident pages, resident bytes and picking bytes, with old picking callbacks false. Every context's final aggregate native ImageBitmap, object-URL, blob-byte and test-canvas counters were zero. This closes the missing final counter observation in the first successor without changing its receipt.

The cold page is the tiny declared cached diagnostic document with the Playwright-injected fixture bundle. This does not certify full packaged App/Go/audio startup or a full-art rendered world. There is no live promotion, deployment, or zero-error Chromium acceptance claim.
