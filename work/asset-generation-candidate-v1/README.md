# Verified asset generation — private core candidate

29 September 2026. **Private implementation, not production promotion or browser acceptance.** This follows the actual [v25 stale-art mismatch](../offline-upgrade/browser-result.md), whose overall Chromium run remains a strict failure. Root owns a separate ArtLibrary/Application consumer candidate; none of its files are changed here.

Frozen source lock: `2772859b45570515bd7743371544b7a3f7a80a679cb14b50fe213ba3c677b5aa`. `source-lock.json` pins all 134 copied client source files. Only these three differ from frozen v25:

- `source/client/src/runtime/asset-generation.ts` — new generation reader, SHA `2e950c77fcffde68040e1b44750251198e8c5b5d991bdbcc0e115410c2affed8`.
- `source/client/src/runtime/cache.ts` — immutable installer input snapshot and reserved manifest metadata before READY.
- `source/client/src/runtime/offline-response.ts` — required metadata counted in completed-cache readiness.

`production.patch` is the exact selective delta. All other 131 files match base v25. The private source is based on build `6c4f6f675983c3ab428546487ee419212a2b798aa66c513cd5913058084524f0`, not live renderer edits or a later art union. Frozen v25/v24, shipping sources, runtime, art and Go were not edited.

## Consumer API

```ts
const generation = await captureAssetGeneration(indexSource, packId, {
  origin, signal, fetcher, cacheStorage,
  // Optional bounded compressed-blob lease capacity, default 64 MiB.
  maxLeaseBytes,
});
generation.identity; // frozen id/version/indexSHA256/manifestSHA256/key
generation.key('/art/...');
await generation.read('/art/...');  // verified detached bytes
await generation.json('/art/...');  // verifies before UTF-8/JSON parsing
const lease = await generation.lease('/art/page.png');
lease.url; lease.key;
lease.release(); // idempotent reference release
generation.statistics;
generation.dispose();
```

Pass **the exact content-index bytes captured at the idle boot/reload boundary**, not a freshly reserialized or independently refetched index. Capture verifies the manifest ID/version and its `/content/index.json` descriptor against those exact bytes. `identity.manifestSHA256` hashes the canonical captured manifest object, so whitespace-only network serialization does not change its key; `indexSHA256` hashes exact index bytes. There is no production `manifestSource` bypass.

The helper reads the exact completed cache generation directly; it needs no controlling service worker. A legacy cache without stored manifest must reconnect for the exact index-matching manifest or return an explicit unavailable error. It never fabricates hashes from cached payloads. A captured installed cache is bound by name. Removal or a missing required file causes an unavailable-generation error, with no latest-generation/network substitution. Previously returned correct leases may remain in use until released; a new uncached read cannot silently change generation.

If no matching installed cache exists, connected reads are fetched with omitted credentials, redirect rejection and verified length/SHA before parse/decode. This remains safe when a plain server ignores generation query strings because no query-only trust is used. Root's consumer must give all related metadata and image loads the same generation, use its keys for consumer caches, and retain/release each page's lease with its actual lifetime. Root uses owned ImageSource decoding; callers using Pixi Assets instead must explicitly select a suitable image parser for opaque blob URLs rather than infer `.png` from the URL.

The helper itself does not activate packs, reload an active game, retain global image caches, change simulation state, migrate saves or alter replay compatibility. A captured operation signal cancels that generation's work. Disposal aborts active and waiting reads and revokes its owned blob URLs.

## Bounded behavior

- Exact index parser's 1 MiB limit; manifest at most 4 MiB, 16,000 files and 2 GiB declared payload total.
- Each file at most 128 MiB; path at most 512 characters; canonical absolute public paths only. Private API paths, query/hash/encoded traversal, foreign URLs and reserved cache metadata paths are rejected.
- One abort-aware FIFO per generation: at most four active reads, aggregate active declared bytes at most 128 MiB, at most 64 descriptor-only waiting jobs. Normal fifth requests wait. Queue overflow fails explicitly instead of retaining unbounded jobs or bytes. Consumer startup should keep fan-out within this documented queue bound.
- Network read/stream deadline 15 seconds. The oversize branch cancels without waiting indefinitely for another observer's possible tee branch.
- At most 128 candidate cache names examined. Decoded GPU/texture budgets remain the renderer's responsibility.
- Verified object-URL leases default to 64 MiB of compressed source bytes (explicit configurable ceiling 256 MiB), share per-generation URLs by key/reference count, and have no global cache. Statistics include active reads/bytes, queued jobs, unique leases/bytes and disposal state. These are distinct from Pixi's decoded GPU/picking memory.

## Installer metadata prerequisite

`/__frontline_pack_manifest__` is reserved and rejected as a downloadable manifest file path. The installer clones its caller's input before awaiting anything, validates/downloads every declared file, stores a canonical manifest, then writes READY last. READY adds `metadataFiles: 1` and `manifestSHA256`. Both readers count payload files + manifest + READY. `InstalledPack.files/bytes` retain their existing public payload meaning; storage overhead is not advertised as additional downloaded payload.

Only an exact matching stored canonical manifest qualifies for unchanged reuse. Legacy completed caches remain retained; a new install of their exact manifest creates a verified successor rather than certifying an old cache by counts alone. No implicit old-cache mutation/migration or automatic retirement was introduced. Manifest quota failure, READY quota failure and cancellation after the manifest write remove only the new staging cache.

## Earned checks and limits

- `unit-final`: **13/13 PASS**, exact pre/post source guards and source copies. Declared fake CacheStorage/fetch tests cover old/new generations, cold cache reads, legacy reconnect, index/manifest identity, corruption/truncation/oversize/redirect/private URLs, input detachment, 12 normal concurrent requests, queued cancellation/disposal without network starts, 64-job overflow, the global active-byte bound without allocating a huge file, URL ownership/refcounts and installer metadata failure/cancel/unchanged/legacy behavior.
- `cache-regression-02/output.log`: **2/2 existing cache regressions PASS**, unchanged copied test sources. The first setup attempt used the wrong test filename; no test ran in that attempt.
- `typecheck-final.log`: strict TypeScript **PASS**, empty output.
- `actual-product-01/receipt.json`: the actual frozen v25 index, manifest, art index and unchanged atlas PNG pass the helper through filesystem-backed fetch Responses. No HTTP server, browser, decoder or full-pack install is implied.

Failure history stays separate: unit-01 was stopped at a fake-CacheStorage tee/cancel hang; unit-02 lacked the mock service-worker capability; unit-03 exposed an incomplete internal activation signature; unit-04 lacked `Response.url` in the mock; unit-07's fixed-wave release driver did not wait for real async digest completions and was stopped. Their compiled bundles/logs remain on disk. Early receipt source hashes were sampled at completion; use their preserved bundle bytes for those interrupted attempts. Later source guards/copies avoid that ambiguity. These are authoring failures, not shipping/browser regressions. Units 05/06/08/09 were intermediate green boundaries, not final browser certification.

The cache manifest prerequisite and private helper are not yet exercised in a genuine browser with root's consumer. Mandatory next gates include actual two-tab old/new art coherence, cold cache manifest discovery, offline/online eviction/reload, explicit removal, pending/disposal races and worker update, with strict errors preserved. Old v25's failure must remain unchanged. No final release or full-roster claim follows from these unit checks.
