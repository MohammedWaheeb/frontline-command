# Reuse immutable collision-definition lookups

Status: isolated successor to the direct snapshot converter. Full short Go
simulation/adapter/server suites and the native current maximum-load hash pass.
The current-WASM candidate also passes both consecutive maximum-load segments
in the controlled browser pair below. Shipping files are unchanged.

## Exact scope

The native profile attributed substantial time to collision clearance and repeated
catalog unit lookups. Two functions now reuse the same immutable unit definition
for aircraft classification and physical radius. They introduce no cache,
serialized field, new collision shape, pathfinding rule, version or content change.
`production.diff` contains the entire production change.

`source-lock.json` records 356 files, SHA-256
`c7e0d79d1770491cc867037b7c0c69b31ce16738885022130dc3fea59c37d122`.
Its parent is the frozen 354-file snapshot converter. The only existing source
changes are `pkg/sim/navigation.go` and `pkg/sim/service_parking.go`; two new
test files retain the exact old functions and compare their behavior.

Independent read-only review confirmed equivalence for building/dead/contained
guards, unknown units, ability-created beacon/support aircraft, landed aircraft,
airborne landing reservations and ordinary airborne aircraft. Strict distance
comparisons, ignored identities and ground/air layer decisions are unchanged.

## Evidence

- All 75 unit definitions plus four special/unknown type cases across 32 state
  combinations match the old obstacle geometry exactly.
- 9,600 clearance queries cover radii, boundaries, blocked tiles, ignored IDs,
  buildings, casualties, containers and landing reservations. Every decision
  matches the old implementation, with unchanged authoritative state hash.
- Existing pathfinding-oracle and restore/bridge tests pass.
- Full short simulation, client adapter and server suites pass in
  `full-short.log` (102.078 / 1.798 / 14.014 seconds on this shared host).
- The unchanged current 688-actor, 64-aircraft, 64-command fixture reaches its
  exact expected final hash after 600 native adapter ticks:
  `bf5e8b30b347b551b0631389e9d8f2c8728c2748ffcd90765a65485aac999dc0`.
  `current-maximum-native-01.log` is correctness evidence; its 12.11-second
  benchmark timing ran alongside build/art work and is not reference timing.
- The paired microbenchmark measures approximately 40 microseconds per prior
  clearance query and 23–30 microseconds with one lookup. Both allocate zero.
  These shared-host query costs do not establish end-to-end 20 TPS.

`runtime-build-receipt.json` records the unchanged 0.3.4 metadata and candidate
WASM SHA-256
`f37220a4375f2ef1595e278673c811f1426807f41c6a4ad5925ddbcd66d2bd65`.
The browser input is independently frozen to the exact preceding renderer
bundle `ebce6753b5c49f4014dff5663cca02f829eb8e99d759df4f7bae682104729915`.
It intentionally excludes ongoing aircraft hit-testing changes so those cannot
confound the Go-runtime comparison. No art or frontend product file is promoted
by this candidate.

## Quiet current browser pair — 15:22–15:25 UTC

All three agent lanes paused Blender, native tests, compilers, hosts and browsers.
Baseline then candidate ran in headed Chromium on Apple M4 Metal with the exact
same renderer, frozen artwork and current 688-actor/64-aircraft fixture. Each
runtime performed two consecutive 600-tick segments. The unchanged timing gate
allows one tick of scheduling tolerance over the 30-second simulation interval.

| Runtime | Segment | Wall time | Tick rate | RPC p95 | Frame p95/p99 |
| --- | --- | --- | --- | --- | --- |
| Snapshot converter baseline | 1 | 33.186 s | 18.080 | 419.7 ms | 33.3 / 34.9 ms |
| Snapshot converter baseline | 2 | 30.023 s | 19.985 | 191.6 ms | 17.0 / 18.4 ms |
| Single collision lookup | 1 | 30.002 s | 19.999 | 109.4 ms | 17.2 / 18.4 ms |
| Single collision lookup | 2 | 30.001 s | 20.000 | 107.1 ms | 17.5 / 18.4 ms |

Both candidate segments meet the 20 TPS budget; neither has a frame over 50 ms.
All four segments retain the expected final hash above, pass save/restore and
release every renderer canvas and resident art page, with no application errors.
The baseline report remains failed because its first segment misses timing.
`paired-current-browser.json` indexes the full reports. The baseline output-path
correction is recorded separately, and the previous default report/images were
preserved before completion and restored byte for byte.

This is one controlled pair on this machine, with incomplete frozen artwork.
It accepts the bounded lookup optimization without claiming universal speedup,
complete-art performance, long-match stability, Intel performance or actual
Safari acceptance. Earlier failed timing courses remain unchanged. The combined
runtime and complete release still require their remaining integration gates.
