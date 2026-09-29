# Offline upgrade browser course — authored, not run

29 September 2026. The new driver compiles and its browser helper passes strict TypeScript checking. **No browser, HTTP server, game host or native process was launched for this task.** `build-only-06/receipt.json` records 152 verified inputs; `typecheck-03/output.log` is empty with exit 0. Earlier author receipts remain separate. No transaction or cold-start browser gate is earned yet.

Source: `client/tests/offline-upgrade/browser.mjs` and `fixture.ts`. It imports the actual frozen installer, ContentLibrary, ArtLibrary and worker, not a reimplementation. The browser plugin is unavailable, so the prepared execution uses bundled Playwright engines; those are not branded Chrome/Edge or stock Firefox/Safari compatibility evidence.

## Exact inputs

The default and currently supported product is `work/art/effects-opus-v2/integration-v25/product`:

- Build receipt SHA-256: `6c4f6f675983c3ab428546487ee419212a2b798aa66c513cd5913058084524f0`.
- Client source digest: `d297183a44bf211a1d19862809985c3669a5ab7fd3b4b71f34b0cdd290e91253`.
- Pack manifest SHA-256: `120fd4095f8da3cd15f51e5b2d97ffd0b5bbd9a666502685b5b153219841dcba`.
- Worker SHA-256: `7ff452b5702d26fa936bc5b2869da131538622a01f6df652c5ac1bf57564b537`.
- Previous actual v24 worker SHA-256: `6bfcf74320ee86afdb20b225be83af64e704adcb8c7929c2e630f7d1e5c6410d`, independently pinned to its build receipt `f73a3447173a6b4e1e752ed374175044019565375dd342d893a377187658817e`.

This is the **419,323,287-byte base v25 pack**, not the later 36-actor art union or a final roster package. The `--product` argument is a path to this exact build, not permission to relabel a different directory. A future union/package input needs an explicit successor receipt and exact source/worker comparison. Root's separate `work/local-package-v25` rehearsal is not modified here.

## Prepared execution

Use a fresh output directory. Parent controls browser-lane scheduling.

```sh
node client/tests/offline-upgrade/browser.mjs \
  --product work/art/effects-opus-v2/integration-v25/product \
  --out work/offline-upgrade/chromium-01 --engine chromium
```

The default course uses small test packs. `--build-only true` compiles/verifies without opening a server or browser. `--full-pack true` additionally installs the full base pack once and performs a genuine cold App/Go smoke. `--engine firefox` or `webkit` selects those bundled engines. A browser lacking genuine Web Locks fails the capability prerequisite; it is not silently credited with a simulated cross-tab lock.

## Assertions and declared preparation

1. Real CacheStorage installation, real two-tab Web Locks, held file download followed by another tab's activation, and cancellation while queued on a real lock.
2. Same-length corruption, truncated file, interrupted network response, explicit cancel, initial canceled rollback, and deliberate `Cache.put` quota exceptions both on a file and on the final READY marker. The previous generation must still serve; failed staging cache names must disappear. Quota injection is an API-boundary failure, not a claim to have filled the machine's physical quota.
3. Unchanged generation reuse causes no pack file download. Explicit rollback activates an older completed generation. Equal legacy timestamps are deliberately prepared in real cache markers; deterministic selection and explicit selection of the losing generation are asserted. Wall clocks are not globally frozen.
4. The actual previous v24 worker is initially served. The expected historical retired-path resurrection is recorded. Its real update/controllerchange to v25 must stop that resurrection. Both tabs' installer helper is the current v25 code; this is worker compatibility evidence, not a previous-App installer test.
5. An actual retained A ContentLibrary rejects changed B map bytes as `content_integrity` before Go validation. A new/refreshed B index reaches an explicitly throwing validation boundary. No tiny map is falsely declared Go-valid or playable.
6. The actual frozen ArtLibrary retains A atlas descriptors without admitting its page. B is installed by the other tab; then the old sheet first admits that page. Two unchanged real `building.US.aa_post` atlas PNGs of equal size are relocated to a common test URL, with declared one-page descriptor relocation. Decoded pixel hashes must prove whether B pixels were combined with A descriptors. This is a loader-coherence reproducer, not new art, native gameplay or visual-quality acceptance. Both old and fresh libraries must release resident/picking bytes.
7. A whole persistent browser restart under offline transport must navigate to the B cached test document. This tiny cold gate is distinct from the optional actual full-product cold gate.
8. The optional full gate installs through the real installer helper, not the App download button; closes the browser; restarts offline; uses normal App controls to start solo versus one deterministic Easy bot; advances actual Go beyond tick 120; manually saves; and returns to menu with canvas/Go-worker cleanup. It does not certify full audio, complete matches, save import, replay, App download UX or every asset.

The driver expects the known stale-art defect on frozen v25. A completed diagnostic run reports `transaction-gates-passed-with-known-art-defect`, not an overall release pass. A failure to reproduce that expected result must be investigated; do not weaken the comparison. [Generation coherence proposal](generation-coherence.md) remains unimplemented.

Each execution records exact hashes, actual browser version/executable, real capabilities, response/failure classifications and clean shutdown. Only named injected failures and offline network attempts are classified; effective unexpected HTTP errors or page exceptions fail. Full App/Go boot/save are separate positive requirements, so merely permitting an offline network attempt cannot manufacture success. The browser profile is temporary and removed at cleanup; existing browser settings are untouched.

## Remaining gates

All browser cases above are unrun. The stale-art fix and successor acceptance are open. Full v25+36 union/local package cold startup, actual App pack installation, branded desktop browsers, no-Web-Locks cross-tab behavior, persistent storage eviction and real quota pressure are separate. Retired completed generations are retained by current policy; this course tests explicit removal but does not claim a retirement UI or automatic garbage collection.
