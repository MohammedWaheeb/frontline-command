# Reuse immutable collision-definition lookups

Status: isolated successor to the direct snapshot converter. Full short Go
simulation/adapter/server suites and the native current maximum-load hash pass.
Current-WASM browser performance is pending. Shipping files are unchanged.

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
