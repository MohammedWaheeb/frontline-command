# Direct public snapshot conversion candidate

Status: isolated candidate. Native Go, WebAssembly and the Chromium product
range/readout course pass. Paired historical browser timing improves but still
fails on the second consecutive segment. Shipping runtime files have not changed.

The existing host and WASM adapters serialize the authorized `sim.View` to JSON
and then parse it into protobuf. This candidate shares an explicit Go converter
between both adapters. It only copies the already-authorized public view; it
does not read engine state, change visibility, or alter simulation behavior.

## Source and compatibility

The 350-file owner-ranges base lock is
`d5dd52ff9d3e338d5e5fd40b5663630d5f7398cec4cbcbc31120b12c0606797c`.
Four new `internal/viewproto` files and two adapter wrapper edits yield the
354-file `source-lock.json`, SHA-256
`199e0884cb71e77c458074cdde7a04a246c5312020ea08deee555047ba1ed08d`.
Simulation, content, protocol, view construction and version files are exact.

The build-time generator checks source JSON names against protobuf fields and
emits 35 typed converters. Unsupported or unmapped fields fail generation.
Runtime conversion uses no reflection or JSON. Optional zero/false presence,
nil messages, integer precision, invalid UTF-8 replacement and detached nested
slices retain the previous contract. `go generate ./internal/viewproto` updates
the generated file; `go run ./gen -check` from that package verifies it.

The independent oracle is the exact prior `encoding/json` → `protojson` path.
It matches both protobuf values and deterministic wire bytes for 201 constructed
views covering optional fields, extremes beyond JavaScript integer precision,
nil/empty collections and malformed UTF-8. Mutating every input field afterward
does not change the output. An additional 31 real Go saves produce 62 matching
player views on native Go and WASM, with unchanged engine hashes. Evidence is in
`actual-saves-native-02.log` and `actual-saves-wasm-01.log`.

The independent review under `../snapshot-conversion-profile/codec-review/`
found no blocker and verified the six candidate file hashes before and after
its oracle and generator checks. Initial failed compile, fixture and path
attempts remain preserved; later passing files do not relabel those attempts.

Full short suites for both adapters and the converter, focused race checks for
view conversion, real range saves, fog-filtered sockets and deltas, plus static
analysis pass. `codec-parity/receipt.json` records equal host/native/WASM outputs
for the actual range, casualty and combat fixtures. The first additional WASM
runner incorrectly inherited native `GOMAXPROCS=2`, which JavaScript Go cannot
use; its startup failure is preserved in `wasm.log`. `wasm-02.log` passes with
the supported value 1 and no code changes.

## Built runtime

`runtime-build-receipt.json` records the frozen worker inputs and all outputs.
The isolated simulation remains 0.3.4, protocol 1, adapter 1 and the unchanged
content hash. Candidate WASM SHA-256 is
`edd5c367781896c2b5c0cd5eecfa0d1614bfefb23a47ac93d400d358db6d1b66`.
The host binary SHA-256 is
`bc27c244b9b54f75df62343ea9b1ea136e39172eb816ead0b39e8f66affcbb4e`.

## Timing scope

The synthetic 257-entity conversion benchmark reduced roughly 92,000 allocations
per conversion to 5,769 and measured about 0.51–0.60 ms versus 21–23 ms for the
JSON roundtrip on the shared host. This is not a complete frame or simulation
performance result.

`legacy-performance/` applies the same converter to the authentic historical
0.3.1 schema for a paired test against the existing 688-actor browser fixture.
Its 147-file lock is
`8dc9b38931a2f4eb981d67ae7c33a5e81cc873c6ca9ea54c3bb6f5cbda0d6369`;
candidate WASM is
`9c34cfd6bd91dcefdf6bc953b8642fcb5464e6385f633ac6ca019fb2f94e663b`.
Original worker, WASM support script and version metadata are copied exactly.
No save metadata is relabelled. The first native candidate benchmark passed the
exact final hash but took 28.02 seconds during other active jobs, while an older
baseline took 4.52 seconds under different load. Those times are not a valid
performance comparison.

The quiet headed Chromium pair now uses the same opening save, frozen art and
exact browser bundle (`ebce6753b5c49f4014dff5663cca02f829eb8e99d759df4f7bae682104729915`).
Baseline segments reach 20.00/15.83 TPS; direct conversion reaches 20.00/17.93 TPS.
All four retain exact native final hash, save/restore and clean disposal with no
console errors. Both second segments miss the 20 TPS target. The candidate's
explicit timing assertion therefore fails. `legacy-performance/paired-browser.json`
indexes the unchanged reports. First-segment four-tick RPC p95 falls from 145.6
to 112.1 ms, but the repeat slowdown remains unexplained. This is a measured
bounded improvement, not performance acceptance.

The Chromium product course passes all 15 actual-Go range/readout fixtures,
save/restore, replay seeking, private-data absence for the other player, keyboard
focus, 1280/1600 layouts and 150% interface scale. It uses the isolated current
0.3.4 candidate WASM; screenshots and the receipt are under
`browser-owner-ranges/chromium/`. Browser plugin was unavailable; the existing
Playwright course was used. This is presentation/adapter integration, not an
economy playthrough.

The current legal maximum fixture is exported from separate test-only source
under `current-load-fixture/runs/20260928T145716Z/fixture/`: 688 actors, four
players, 64 ordinary returning aircraft and 64 public command batches over
600 ticks. All 64 return, and all source hashes remain exact. The original dense
layout and its failures remain separate. Current-fixture browser timing is pending.
Full current-runtime performance, complete art, long matches, physical LAN and
reference hardware remain release requirements.
