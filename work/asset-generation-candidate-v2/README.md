# Verified asset-generation core v2

29 September 2026. Private successor only; no shipping files, frozen products, original failures or core v1 source changed. Root's independent full-catalog consumer proof found the previous 64-waiter bound rejected 68 of 136 concurrent sheet loads, and consumer v1 retained their failed promises. This is a real startup correctness defect. Browser launch was held; no consumer-v1 browser pass is claimed.

The **only production change from core v1** is the descriptor-only waiting bound from 64 to 1,024 in `source/client/src/runtime/asset-generation.ts`. The active bound remains four reads and 128 MiB aggregate declared payload. Queued jobs contain descriptors/resolvers/signals; the change does not admit their byte bodies in advance. The explicit roster envelope is 162 world IDs × two qualities + 544 UI layer files + 71 effect requests + 22 terrain requests = 961, within 1,024 waiters plus four active slots. This is a bounded current-roster allowance, not an unbounded scheduler or a guarantee for arbitrary future fan-out.

Lock SHA: `6d1502a560c327fdbaee1049e0c96d7819f0d11828d7aa51c3295364565d864f`.
Helper SHA: `f856956b039d3dec464e2df22b8ffce411973257246c40be65f27aa352e6a0b9`.
Baseline core-v1 lock: `2772859b45570515bd7743371544b7a3f7a80a679cb14b50fe213ba3c677b5aa`.
All 134 baseline source files were checked unchanged after the proof. Cache installer, manifest storage, worker selection, content validation, active-byte/lease bounds and API are byte-identical to core v1. `from-core-v1.patch` is the precise production delta.

`unit-01` passes **14/14** focused tests with captured source copies and pre/post guards. It retains the identity/privacy/integrity/storage/cancellation proofs and adds:

- 961 simultaneous reads finish with at most four network operations active.
- 136 distinct descriptors preserve FIFO after a queued middle request is canceled.
- Exactly 1,024 waiting requests are admitted behind four active readers; the next rejects `asset_busy`.
- Disposal rejects all waiting requests without starting their network operations, and active/queued byte counters return to zero.
- The unchanged 80 MiB test proves a second large reader waits under the 128 MiB aggregate bound, without allocating that declared payload.

Strict TypeScript passes (`typecheck-01.log`, empty). These are lightweight fake-network/CacheStorage unit proofs, not browser, GPU, full-roster decoding or performance acceptance. Root owns consumer retry/failed-promise eviction in a separately locked consumer v2. The browser successor remains held until that boundary is supplied.

`prepare.mjs` can restore only unchanged copied v25 dependencies and verify the new lock; it never writes live files. Copy only the named helper into a private consumer successor. Do not overwrite any core-v1 or consumer-v1 lock/source.
