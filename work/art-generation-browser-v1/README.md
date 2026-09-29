# Actual verified-generation browser successor

29 September 2026, 11:12 UTC. **The frozen-v3 Chromium course reached all 22 functional assertions but remains a strict FAIL due to three unclassified ERR_ABORTED requests.** Browser/server are closed. See [result and boundaries](browser-result.md) and [exact receipt](chromium-v3-01/receipt.json). Root held v1/v2 launches for the real fan-out and error-reporting findings; neither old consumer earned a browser pass. The original frozen v25 mismatch and its strict error failure remain in `../offline-upgrade/chromium-01` unchanged.

This test-only driver uses actual private `ArtLibrary`, installer and worker code, with small A/B/C declared packs. It defaults to frozen consumer v1 (`../art-generation-consumer-v1/frozen-v1/client`, source lock SHA `4859c10adaee194242b5f257d19cd4d02961d42a16278b560a69f7d417726037`). A successor can only be selected by supplying `--consumer`, `--lock`, and `--lock-sha` together. Every captured source is checked before and after; imports resolve directly to the selected frozen source, without rewriting it.

The pack ID stays `2.0.0`; each exact content-index declares `/assets/packs/base.json` with its A/B/C version. Both PNGs are unchanged actual v25 `building.US.aa_post` beauty atlas pages (942×1008); descriptor paths are explicitly relocated to the same test URL. A/B descriptor/frame/pixel identities differ. This is loader-coherence and transaction evidence, not complete art, native gameplay, App idle/reload, full-pack installation or final release.

Prepared assertions:

- Retained A metadata and delayed actual CacheStorage page stay A across other-tab B installation and online host swap. New B sees B.
- Actual page eviction/reload retains generation identity; old picking callbacks invalidate; decoded image loads use A/B pixels and release blob leases.
- Corrupt/truncated/interrupted/canceled downloads and file/manifest/READY quota exceptions remove only staging, preserving usable A.
- Unchanged reuse avoids downloads; rollback preserves a retained B library; initially canceled rollback cannot activate; slow C completion after B gets later activation; real two-tab Web Locks cancellation prevents activation.
- A removed file cannot be resurrected from retired A under the worker. Explicit removal of captured A causes unavailable-generation failure with no B decode.
- A separate context with no cache or service worker rejects changed online bytes before ImageBitmap decode. A genuinely captured pending A response remains A after host swap. Disposal cancels a held native network read and leaves no page/picking/Blob ownership.
- All libraries dispose; a persistent browser restart offline discovers exact stored C index/manifest and admits C pixels from its cache.

Faults are explicit HTTP/CacheStorage/Web Locks boundaries; no success snapshots or game state are injected. PNG reference decode is separate from the tested loader. Actual bitmap close, blob URL revoke, page bytes and picking bytes are counted. Only the exact interrupted/canceled requests and retired 503 are allowed; unexplained aborts still fail the strict browser gate. Server receive/finish/close and request-start phases are recorded without tokens or headers. This does not prove native EOF attribution for unrelated aborts.

`build-only-01` failed before any browser/server because TypeScript 7 does not export `typescript/bin/tsc`. `build-only-02` corrected only that authoring invocation and passed bundle plus strict TypeScript; source copies and receipt preserve each boundary. `build-only-03/04` pass the final original-v1 author source; `build-only-v2-01` and `build-only-v3-01` separately pass their selected frozen consumer bundles and strict fixture TypeScript. All verify 257 input hashes after completion. The v3 browser run uses the same driver/fixture source as its build-only receipt.

```sh
node work/art-generation-browser-v1/browser.mjs \
  --out work/art-generation-browser-v1/build-only-next --build-only true
```

Root controls the sole browser lane. Omit `--build-only true` only after release. A run uses bundled Playwright Chromium because the browser plugin is absent; this is not branded Chrome/Edge or stock Firefox/Safari qualification. It starts one local fixture HTTP server and closes it/browser/profile at the end. No game host, native compiler, production source, product, asset or deployment is touched.
