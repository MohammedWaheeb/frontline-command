# Isolated replay checkpoint save reuse

29 September 2026. **Correctness checks pass; server cadence remains unqualified.** Live Go/runtime is unchanged. This addresses the duplicate serialization observed in `work/maximum-load-034-course/server-01`; that original course remains failed, including its separate tick2 Advance spike. No warm-up/checkpoint exception or limit change is proposed.

The candidate is a separate copy of the reviewed instrumented actor source4671ae3a…36e, based on integrated0.3.4 source3d49f3c0…53750. `source-lock.json` SHA `36a7a73678c71dc57709ab4a655e545382e24ae808900b784832f747292c6444` pins359 files, plus the separately permitted exact ignore file. `checkpoint-reuse.diff` is the entire delta from the reviewed instrumented source. Timing taps and the600-tick workload are unchanged. No actor course was run on this candidate.

## Proposed implementation

`Replay.CaptureCheckpoint(engine)` returns the exact save already generated for the replay checkpoint. Existing `Capture(engine, bool)` delegates to the same implementation, retaining command cloning, validation order, partial replay mutations on failure, compression and error strings. The returned raw save is owned by the caller and shares no mutable bytes with authoritative state or the compressed checkpoint.

The server's `recordReplayCheckpoint` uses that save for the existing asynchronous persistence queue. If recording fails, it still attempts ordinary `Engine.Save`, preserving the previous fallback. It does not suppress the recorder error, change queue capacity/backpressure or move work to another thread. The successful path eliminates one redundant Save; actual time savings have not yet been measured. The failure-path fallback is included in the replay timing span in this derivative, whereas the unchanged successful path uses the original spans.

`production.diff` SHA `10823fbce1d09600dda55277de8eb61d187404bcac5fef423f850ea0a74826ee` and `production-files.json` identify a **proposed** integration delta without any timing probes. Production paths are `pkg/sim/replay.go`, `internal/server/replay_checkpoint.go` and the small checkpoint callsite in `internal/server/match.go`; two focused test files accompany them. `production-files/` contains those exact five review copies. Do not copy the instrumented `source/internal/server/match.go` into shipping. No simulation state/version, wire, content or gameplay rules change is proposed.

## Earned checks

`checks-01/receipt.json` records one serial GOMAXPROCS1 native run, one Go/WASM run and focused race checks. All passed; source inventory/hash checks passed before and after. Command spans were8.84s,5.37s and14.19s on the shared host with rendering active; these are not performance measurements. No broad campaign, browser, host listener or600-tick course ran.

The tests retain the exact original Capture body as an independent oracle. They compare replay fields, complete compressed replay bytes, raw saves, returned-byte detachment, full replay and checkpoint seek across ordinary submitted orders. Metadata/version/backwards-window/missed-window/duplicate-checkpoint errors and partial recorder state match the original. The server helper also preserves Save fallback when Capture rejects a checkpoint.

The actual server-01 tick600 boundary is restored and checked against its exact688-actor canonical hash. Native and WASM produce identical artifacts:

| Artifact | Bytes | SHA256 |
| --- | ---: | --- |
| Raw checkpoint save |2983528 |`dd8de215f6a2f67d0d9a558f5ee1f5ba2b520dd98c4ffdc51836fbce82f9876a` |
| Boundary replay |158677 |`e33edfcf5c6f9fd5cc5d6e9f62fcda637692e2c09d545197e2161fce14c711d5` |
| Packed checkpoint |78880 |`795562307c6d4e6a1d19af4f3cf49015a02e5947feeb411c75cebce6e55623ce` |

This boundary replay starts at the retained tick600 save; it is not relabeled as the original600-tick earned replay. Full ordinary-command replay equivalence is separately checked by the small fixture. The original server receipt/save/full replay remain untouched.

## Remaining gate

After independent source review and coordination with the separately owned tick2 investigation, run one newly locked actual actor course in a fresh quiet window. Require the same72 batches,600ticks,64 landings,24 interceptions, four-perspective outputs, exact original final save/full replay/checkpoint bytes and strict50ms cadence gate. Preserve any outlier and do not infer a pass from the removed12.335ms baseline Save span. Eventual integration also requires the matching native/WASM build boundary; this isolated helper parity is not a rebuilt shipping runtime.
