# Chromium-01 observed result

29 September 2026. **Strict overall FAIL preserved.** The course closed its browser and HTTP server before private helper unit work. Inputs match checkpoint `f159c28`; all 152 post-run guards passed. Browser was bundled Chromium 151.0.7922.34, not a branded-browser compatibility claim. Its exact executable, controller URL, genuine Web Locks capability and reused cold profile are in `chromium-01/receipt.json`.

All 16 functional case assertions completed. Actual failure paths returned the expected corruption, size, interruption, quota, marker-quota and cancellation errors while retaining usable A. Two-tab activation ordering, lock-wait cancellation, unchanged reuse, explicit rollback, legacy ties and a complete persistent-browser restart into the B offline test document all reached their assertions. The genuine previous worker resurrected A's retired path; after actual controllerchange to v25 that same path returned 503. These facts do not override the strict failed run.

The actual frozen ArtLibrary loaded **B pixels with retained A frame descriptors**:

- A decoded page SHA-256: `59ec44b22c67cf7d4fcc6401d7e7d3508b0fa4632c8e97eff63acecb1f36fc32`.
- B decoded page SHA-256: `e32141238157da955e90fa0174c082acbbec4482f8d527726f4240d5fa8428db`.
- Retained A loader result: **the B hash**; fresh B loader result also matched B.
- Each old/fresh library admitted one actual 3,798,144-byte decoded page with 118,692 picking bytes, then released indexed pages, resident bytes and picking bytes to zero.

This is the declared small relocated real-art fixture described in the run note. It is a concrete loader/worker coherence defect, not proof of a specific rendered gameplay frame or a claim that new art was authored. Retained map content instead failed as `content_integrity` before the deliberately throwing validation boundary, as intended.

Thirteen other request failures were `net::ERR_ABORTED` on the fixture's larger map or PNG, in addition to the two explicitly injected interruption/cancellation failures. Install calls still completed exact byte/hash validation in corresponding successful cases. The run did not capture request-linked native reader EOF/byte receipts, so **it does not establish why Chromium reported those aborts**. There were no page errors and only the two expected retired-path 503 responses. No blanket aborted-request exclusion was added. Raw requests/failures and exact phase labels are retained; phase labels are observation-time labels, not a substitute for request-linked attribution.

The optional 419 MB full base-v25 cold App/Go course was not requested. No v25+36 full-art union, stock desktop browser, real storage eviction or final local package was certified. A private verified-generation helper follows this finding, but no production fix or new browser pass is implied by its unit tests.
