# Simulation performance evidence

Measurements are native Go1.27.1 on this AppleM4 /16GiB macOS host. They do not
certify the browser renderer, WASM or the design's reference laptops. CPU load
from concurrent authoring/tests can change measurements. Native gates are
p95≤25ms and p99≤40ms, retaining headroom in a50ms simulation tick. Race builds
and `-short` intentionally skip timing assertions.

| Workload | Observed p50 / p95 / p99 | Evidence |
|---|---|---|
|688 actors, steady |not recorded /5.36ms /not recorded |Earlier accepted steady run; see implementation history |
|688 initial actors, mass paths and rifle combat |4.70 /15.03 /21.13ms |3,690 shots; previous allocation optimization |
|688 actors,64 simultaneous aircraft returns,64 weapon defenses present |5.98 /6.40 /6.69ms |All64 land without overlap,328ticks |
|688 actors,64 air returns,332 repeatedly routed scouts,24 strategic missiles and interception |9.40 /23.90 /28.67ms |All24 missiles intercepted exactly once; all64 aircraft land,600ticks |

The last two workloads ran on27September2026UTC. The combined test uses four
Iranian factions to fit16 one-Supply ISR drones and84 one-Supply recon units per
player, plus the legal four rigs/eight haulers/60 structures. Eight fixed missile
batteries and eight AA posts use the16-defense allowance. Four compatible hubs
provide enough service capacity. Every base has power, radar, tech and a charged
strategic site. Six strategic missiles per player avoid pretending a tactical
launcher costs one Supply. Snapshot restore validates the fixture before orders.

All missiles launch through ordinary validated strategic orders, with real
scouting sight and payment. Batteries consume charges and intercept. The fixture
starts from a legal late-game state; it does not claim that construction of this
state or faction balance has been playtested. These workloads are not shipping
maps. Defenses being present is distinct from all defenses simultaneously firing.

Reproduce with:

```sh
go test ./pkg/sim -run 'TestMaximumActor' -count=1 -v
```

Still required at these maximum workloads: actual browser rendering, physical
reference-device frame pacing, ordinary mixed-army rendered combat, GPU/context
recovery, and repeated-session memory/resource measurements.

## Navigation allocation regression and correction, 28 September 2026

After the opposing-aircraft detour correction (`15e54fd`; profiling baseline
`3e53305`), the unchanged combined workload exceeded its p95 gate: 10.57 / 28.08 /
35.06 ms p50 / p95 / p99 in
`work/evidence/air-detour-combined-isolated.log`. The mission test children were
paused for that run, but a Blender authoring process remained; this was not an
uncontended reference-hardware result. All 64 aircraft returned and all 24
missiles were intercepted despite the timing failure. The earlier 23.90 ms p95
result above remains historical evidence, not a result of the corrected code.

A CPU/allocation profile identified repeated ground A* work, rather than the air
detour calculation, as the dominant avoidable cost. The pre-change run allocated
about 4.06 GiB in total; the search closure alone allocated 3.04 GiB, and
`runtime.madvise` accounted for 41.28% of sampled CPU. Coarse corridor portal
checks repeatedly scanned static collision geometry. The corresponding
post-change profile allocated about 906 MiB overall, with 11 MiB in the search
closure and 9.03% of sampled CPU in `runtime.madvise`. These are whole-test sampled
allocation totals, not peak resident memory. Visibility remains the largest
remaining allocation source; this change does not modify it.

The correction uses one derived A* workspace per engine, generation marks instead
of freshly initialized whole-grid score/parent/closed arrays, and typed heap
operations with exactly the existing tie ordering. Coarse portal checks reuse the
existing radius-specific static navigation cache at exact half-tile sample
points; ignoring a structure retains direct clearance checks. Navigation revision
invalidation, collision geometry, path budget, search expansion cap, all actor
limits, aircraft detours, and timing gates are unchanged. The three workspace
arrays occupy 12 bytes per half-tile cell (3 MiB on a 256×256 map), plus a reusable
heap bounded by the existing search expansion/neighbor limits. Scratch is not
serialized, hashed, shared between independently created engines, or returned as
an entity's path array.

The before/after profiled runs recorded 13.28 / 36.15 / 44.42 ms and 7.16 / 11.89 /
15.24 ms respectively. Both were diagnostic runs with profiler overhead and
concurrent authoring/mission work allowed; their load was not controlled and they
are not the final gate measurement. Raw profiles and summaries are retained as
`work/evidence/navigation-combined-{before,after}.{cpu,mem}` and adjacent CPU /
allocation summaries; logs are `navigation-combined-profile-{before,after}.log`.

Correctness checks:

- A frozen pre-optimization path search and heap oracle produce identical paths
  and ordering for infantry, tanks and haulers, static/dynamic obstacles, cover,
  walls, map edges, blocked destinations, navigation invalidation, generation
  wrap, the collision-free subgrid bridge and restored engines. Reusing the
  workspace cannot overwrite an earlier returned path or alter the state hash.
- Repeated equivalent paths require 18 allocations instead of 350 in native
  builds (21 versus 353 under race instrumentation).
- Targeted race tests pass for all 12 aircraft departure/queued-return types,
  two gunships attacking then returning, two/four aircraft crossings, exact
  save/replay continuation, anti-tunneling bridge geometry, and blocked-route
  recovery. Log: `work/evidence/navigation-workspace-race.log` (15.794 s).
- Existing close/normal two-hauler orientation, four-orientation eight-hauler
  save/replay, cliff, map-edge, shared-field/depot-loss and reservation-release
  tests pass. Their income and non-starvation thresholds are unchanged.
  Log: `work/evidence/navigation-workspace-harvest.log` (12.498 s).
- `go vet ./pkg/sim` passes. No simulation version bump is required for derived
  caches that retain exact path behavior.

Final native gates used `go test ./pkg/sim -run '^TestMaximumActor' -count=3 -v`
without profiling, race instrumentation, or `-short`. All 12 test invocations
passed in 39.277 seconds on 28 September 2026, starting at 01:34:08 UTC. Host:
Apple M4, 10 logical CPUs, 16 GiB RAM, macOS 26.5.1 (25F80), Go 1.27.1 darwin/arm64.
The mission agent confirmed its native children had finished; the renderer agent
held new browsers and art rerenders. The preflight process snapshot showed no
Go test or Blender process. Ordinary desktop/OS services remained active, so this
is still a native host measurement, not a fully uncontended/reference-laptop
certification. Source hashes, base revision and process preflight are preserved
in `work/evidence/navigation-native-host.json`.

| Workload | Run | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|
| 688 actors, 64 returns, 332 routed scouts, 24 strategic interceptions | 1 | 7.128 | 11.723 | 14.965 |
| Same combined workload | 2 | 7.186 | 11.989 | 15.170 |
| Same combined workload | 3 | 7.181 | 11.694 | 15.194 |
| 688 actors, simultaneous air return | 1 | 5.711 | 6.328 | 6.449 |
| Same air workload | 2 | 5.798 | 6.477 | 6.604 |
| Same air workload | 3 | 5.834 | 6.477 | 6.554 |
| 688 actors, steady | 1 | 4.546 | 4.731 | 4.838 |
| Same steady workload | 2 | 4.555 | 4.730 | 4.799 |
| Same steady workload | 3 | 4.610 | 4.811 | 4.984 |
| 688 initial actors, moving and fighting | 1 | 3.043 | 8.256 | 12.484 |
| Same moving/combat workload | 2 | 3.055 | 8.348 | 12.457 |
| Same moving/combat workload | 3 | 3.049 | 8.364 | 12.493 |

Every combined run retained 64 simultaneous returns, landed all 64 aircraft and
intercepted each of 24 strategic missiles exactly once over 600 ticks. The
standalone air workload now completes at tick 531 with the corrected opposing-air
routes; its older tick-328 figure above is historical. Each moving/combat run
recorded 3,926 shots and ended with 397 actors. No workload fixture, actor count,
simulation tick rate, test duration, or timing threshold was reduced. Raw results
are `work/evidence/navigation-native-gates.log` and
`work/evidence/navigation-native-results.json`. These results resolve this native
regression; they do not establish full game, renderer, WASM or physical reference
device performance acceptance.

## Demo audit checkpoint, 16 November 2026

This checkpoint records completed measurements, not full-release qualification.
Two consecutive long browser replays and the separate native timing rerun passed.
Live-game, installed-pack upgrade and expired reconnect acceptance passed.
The measured shadow-allocation optimization also passed geometry, runtime,
browser recovery and final artifact checks. The exact promoted optimized build
passed its multiplayer, four-player, co-op and offline-upgrade rechecks.
Earlier dated evidence above remains historical. Receipts below are local files
retained by the audit coordinator.

`Engine.StateCopy` now uses a detached structural copy while preserving the old
JSON round-trip value, optional-slice shape and invalid-UTF-8 normalization. On
the earned Industrial Valley tick-16,000 fixture (137 entities, 2,036,883-byte
save), the final same-process function benchmark recorded:

| Implementation | Time per call | Allocated bytes per call | Allocations per call |
|---|---:|---:|---:|
| Former JSON marshal/unmarshal | 14.167 ms | 15,049,455 | 6,816 |
| Structural `StateCopy` | 0.240 ms | 1,292,144 | 4,543 |

These are **function-level native measurements**, not whole-game speedup, FPS,
peak memory or WASM results. Raw fixture, harness and final receipt are in
`/tmp/frontline-native-audit-20261116/` (`copy-bench.go` and
`late-copy-benchmark-final.log`). The JSON-oracle/ownership and native-string
regressions are in `pkg/sim/state_copy_test.go`; lifecycle-consumer checks are
recorded in `lifecycle-consumers.log`. Profiling and benchmark interpretation
follow the [Go diagnostics guidance](https://go.dev/doc/diagnostics).

Short rendered probes used Chromium 151.0.7922.34, ANGLE Metal/Apple M4, 16 GiB
RAM and a 1600×900 viewport. DPR 2 recorded a 2656×1800 battlefield drawing
buffer. Each run measured 10 seconds of ordinary practice and about 30 seconds
of practice-unit movement with repeated orders; this is not maximum combat load.

| Package / DPR | Ordinary rAF interval p95 / p99 | Moving rAF interval p95 / p99 / max | Moving intervals >50 ms |
|---|---:|---:|---:|
| Baseline / 1 (configured) | 17.5 / 17.7 ms | 17.6 / 33.2 / 66.8 ms | 2 |
| Baseline / 2 | 17.6 / 17.6 ms | 17.7 / 33.5 / 51.1 ms | 1 |
| Candidate / 2 | 17.6 / 17.7 ms | 33.4 / 49.8 / 82.7 ms | 9 |

Candidate movement tails were higher in this sample. These single-host runs
included CPU profiling and shared host load; they establish neither a causal
regression nor an optimization win, presented-frame timing or reference-laptop
acceptance. Raw reports/profiles are under
`/tmp/fc-deep-demo-20261116/{baseline,baseline-retina,candidate-retina}/`.
Long Animation Frame entries supplement rAF intervals because several shorter
tasks can jointly delay rendering; see [Chrome's measurement guidance](https://developer.chrome.com/docs/web-platform/long-animation-frames).

The baseline manifest totals 8,787 files / 1,459,485,761 bytes; about 94% is
PNG/MP3/OGG. Offline compression experiments, **not enabled product changes**,
measured gzip level 6 across 3,290 text/WASM/font files at 89,641,628 → 9,596,044
bytes (80,045,584 bytes saved). WASM alone measured 12,064,485 → 3,071,623 bytes;
the main JS bundle 1,642,679 → 490,054 bytes. Sample PNG/audio gains were small,
consistent with [Google's compression guidance](https://web.dev/articles/optimizing-content-efficiency-optimize-encoding-and-transfer).

Six lossless WebP experiments retained identical offline decoded RGBA bytes and
used 43–79% of their PNG sizes; this small sample is not a whole-pack estimate or
browser visual/picking acceptance. Post-demo priorities are measured text/WASM
HTTP compression and broader lossless-WebP qualification, including loader MIME
support, regenerated asset identities and browser verification. Codec savings
reduce disk/transfer bytes; they do **not** reduce same-dimension decoded RGBA
texture memory (`4 × width × height`), audio PCM or renderer work. GPU budgets
need separate ownership/working-set measurements, as described in the
[WebGL memory guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
Receipts: `/tmp/fc-deep-demo-20261116/compression-audit/`.

Any HTTP compression must retain original MIME types, negotiate encoding with
`Vary: Accept-Encoding`, preserve conditional/range semantics and verify decoded
bytes against the manifest. The installer already removes encoding/length
headers when storing decoded responses; stable asset URLs must not gain blanket
immutable caching. See [HTTP encoding semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
and [browser request cache modes](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache).

Database policy remains SQLite WAL, `synchronous=FULL`, `busy_timeout=5000`,
foreign keys and one open connection. The driver now applies the connection-local
policies to every replacement connection. A regression first reproduced disabled
foreign keys and an accepted orphan save after `driver.ErrBadConn`; the fixed
replacement rejects that save. Checkpoint journal replacement and prior/current
provenance now share one transaction. Injected provenance failure rolls back both;
stale, missing and finalized matches cannot create provenance or replace a
retained recovery journal. Object quota locks use physical directory identity;
both case and Unicode normalization aliases reproduced quota bypass on APFS
before this correction.

SQL-pattern measurements used temporary data, SQLite 3.53.4 and `GOMAXPROCS=2`:

| Operation | Previous median | Candidate median |
|---|---:|---:|
| Idle authentication | 0.008 ms | unchanged |
| Save metadata, 32 slots | 0.054 ms | unchanged |
| 2 MiB checkpoint | 18.05 ms | 16.87 ms, atomic batch |
| Chat rate query, 20,000 historical rows | 2.838 ms | 0.0176 ms, matching index |
| Provenance lookup, 5,000 rows | 0.808 ms | 0.0274 ms, matching index |

These are synthetic SQL-pattern results, not end-to-end request latency or FPS.
They support retaining the current engine rather than introducing a migration.
Full storage tests, focused server integration, short server/storage/WASM race
suites, vet and independent review passed after these changes. Receipts are in
`/tmp/fc-demo-db-audit-results-final.txt` and the storage regression tests.
Preserve acknowledged-result durability: WAL still has one writer, and NORMAL
permits loss of recent commits after power failure. [SQLite WAL](https://www.sqlite.org/wal.html),
[synchronous modes](https://www.sqlite.org/pragma.html#pragma_synchronous),
[pinned driver's connection pragmas](https://pkg.go.dev/modernc.org/sqlite@v1.59.0#Driver.Open).

Repeated browser save-menu reads now validate live keys and the existing revision
ledger in one read transaction, then return detached, payload-free cached
summaries. The cache has no schema migration and invalidates across legitimate
cross-tab writes, deletes/recreates, imports and backup restores. In a Node
fake-indexeddb probe of 32 real 2.04 MB saves, repeated body cloning fell from
65.18 MB to zero per call; median time was 13.49 to 1.16 ms. Cold reads still scan
the bodies once. Browser disk performance is separate. Fresh Go-owned save/replay
worker replies also transfer their complete ArrayBuffers, removing one payload
copy; partial/shared views retain cloning. All 986 client tests passed with native
wire fixtures and zero skips, including ownership and cache lifecycle regressions.
Receipts: `/tmp/fc-storage-metadata-probe-after.json`,
`/tmp/fc-message-copy-probe.json`, `/tmp/fc-deep-demo-20261116/client-full.log`.

The final portable Apple Silicon package contains 8,963 hashed files plus its
inventory. All extracted hashes, executable permissions and client integrity
passed; it launched from `/tmp` using its unchanged relative launcher inside a
folder with spaces. No private `data/` is in the archive. ZIP compressed the
1,502,913,965-byte package to 1,333,312,973 bytes (11.28% smaller), with the exact
runtime and assets preserved. SHA-256:
`c45edaa24190b864df1684d03ac7482a36b2c30681af2a6acd081a168451f349`.
The final runtime WASM hash matches the long-replay candidate, and emitted
main-thread source maps differ only in `runtime/storage.ts`; the separately
emitted worker adds reply transfers without changing frame/clock scheduling.

### Long browser sessions and native timing recheck

Two naturally finished four-AI recordings were played from tick zero through
their natural elimination results at the product's 1.5× speed in one document,
with sound and camera movement, without a page reload. Each recording had already
passed native full replay, indexed final seek and final save/restore hash checks.

| Replay | Final tick / simulation time | Browser playback | Post-leave main heap |
|---|---:|---:|---:|
| Border Depots, seed 2 | 51,395 / 42:49 | 28.58 minutes | 16.43 MiB |
| Port Outskirts, seed 3 | 50,132 / 41:46 | 28.10 minutes | 16.90 MiB |

After each leave and garbage collection: one persistent validator worker, zero
battlefield canvases and zero actor texture pages. Across 202,840 playback rAF
intervals, every 30-second window's p99 was 19 ms in the harness's 1 ms histogram.
There were 266 intervals over 50 ms. Large gaps following diagnostic screenshots
had little or no long-JavaScript attribution; these samples include capture and
camera changes and are not an isolated dense-army FPS benchmark. No page errors,
console warnings or failed HTTP responses were recorded.

Actor texture ownership peaked at 196.58 MiB, consistent with a 192 MiB soft
target that permits active pages to exceed it. Decoded audio peaked at 90.35 MiB.
Main-thread heap peaked at 846.13 MiB before returning to the warm baseline;
that is allocation/collection evidence, not proof of total GPU or WASM memory
release. Receipts: `/tmp/fc-deep-demo-20261116/browser-endurance/`. An earlier
complete first replay reached the same result, but its harness used the wrong
debrief button label and did not verify cleanup; that failed automation receipt
is preserved separately as `browser-endurance-attempt1/`.

The extended Go run completed with two timing failures: combined maximum load
p95/p99 45.70/72.68 ms and moving/combat 30.15/40.35 ms. No other test failures
were reported. Preserve that aggregate failure in `extended.log`; do not call
the aggregate command a pass. After closing the owned browser, all four unchanged
native timing workloads passed three repetitions (12/12) in 40.756 seconds,
with default/unset GOMAXPROCS, native arm64/v8.0 and CGO disabled. The combined
workload measured p95 14.05–14.64 ms and p99 19.68–21.90 ms, within the original
25/40 ms limits. The moving/combat workload measured p95 12.64–12.91 ms and
p99 14.78–15.49 ms. Actor counts, rules and thresholds were unchanged.

This lower-contention rerun still observed another project's native test process
and normal desktop services; it is not a fully idle-host or reference-laptop
certification. The measurements show that the unchanged gate passes in the
recorded conditions; the earlier receipts do not isolate whether contention,
GC or other host effects caused their failures. Full Go vet and the separate
final client/storage/server checks passed. Receipts: `native-preflight.log` and
`max-actor-quiet-rerun.log` under `/tmp/fc-deep-demo-20261116/`.

### Final-package live maximum-load session

The selected package at localhost:8080 ran the restore-validated synthetic
688-actor fixture through ordinary timed simulation for 20.04 real minutes, with
normal player orders, sound, replay recording and 21 committed autosaves. The
fixture contains four human IR slots; it does not claim ordinary paid construction,
AI combat or 688 simultaneously drawn actors. Each owner's natural view contains
172 owned entities. No page errors, warnings or failed HTTP responses occurred.
Manual save, replay export and actual UI restoration passed. After leave, the
match worker and battlefield canvas were released; main heap after collection
was 14.73 MiB. Three warm menu revisits read zero additional save payload bytes,
measured through scalar IndexedDB read instrumentation (27,654,712 bytes before
and after the visits).

The actual UI-exported save and replay then passed native validation: full replay
from tick zero, indexed final seek and manual save restore all reached tick
24,055 with hash
`3642bea73a54fb0c42016345fe43eba0ab4e839504decfb7955713366e370a52`.
All 688 actors remained: each player had 60 structures, 112 units including four
rigs/eight haulers/16 landed aircraft, 16 defenses and 100 Supply. No pending
commands remained. The native check took 51.79 seconds; this was hash verification
with GOMAXPROCS=2, not a timing-gate run. Receipts:
`/tmp/fc-deep-demo-20261116/live-max/report.json` and
`maximum-live.native-verification.json` in the same directory.

The final-package UI regression sequence passed construction/training, save/load,
two-human multiplayer pause/reload/surrender/results/rematch, four simultaneous
commanders with all four factions and aligned music stems, and both two-human
co-op scenarios. A persistent browser installed the old package, retained its
caches and IndexedDB, switched to the final host at the same origin, loaded the
new runtime and installed its pack. Offline reload then restored and saved a real
operation using the final WASM from the service worker. Both completed generations
remained. Old/final installs took 19.07/25.58 seconds. Receipts:
`final-ui-sequence.json` and `upgrade-smoke/report.json` under the audit directory.

The cached-result browser fault test also passed with the production 120-second
grace unchanged. The guest's view stayed frozen after the real upstream close;
the host continued playing. With only the guest history read faulted (HTTP 503),
the completed-lobby poll opened exactly one replacement connection at 125.13
seconds and received the server's cached snapshot and result. Host Victory and
guest Defeat each had one dialog; later polls caused no replacement storm. The
history fault was removed. Receipt: `expired-rejoin-attempt2/report.json`.
Earlier harness failures (uppercase label matching and a proxy upstream close
code rejected by the browser) are preserved; they were not product failures.

### Measured shadow allocation correction

A separate 90-second late Port Outskirts replay diagnostic sampled allocations,
including objects subsequently collected by minor/major GC. Source maps attributed
69.34% of allocation traffic to `SurfaceShadows.update`: fog changes regenerated
viewport terrain triangles and coordinate arrays, including cliff faces later
discarded by the shadow pass. The fix caches only current-viewport public top
coordinates and compacts visible triangles into reusable typed draw buffers.
Hidden vertices remain outside Pixi batching. Fog, camera, terrain replacement,
texture resize and disposal retain the old Float32/UV/depth behavior.

The frozen old renderer passes the geometry oracle and fails the cache regression.
The new code passed 46 focused regressions, independent review, both TypeScript
checks and all **989 client tests with zero skips**. Package/source-map comparison
shows identical WASM and worker bytes; only `surface-shadows.ts` differs from the
previous long-tested final candidate.

| Same instrumented 90-second replay/camera recipe | Before | After |
|---|---:|---:|
| Estimated allocation traffic, including collected objects | 19.82 GiB | 6.35 GiB |
| Shadow subtree allocation traffic | 14,071.94 MiB | 277.02 MiB |
| Nonshadow allocation traffic | 6,221.19 MiB | 6,227.28 MiB |
| rAF intervals | 5,284 | 5,286 |
| rAF p95 / p99 | 19 / 19 ms | 19 / 19 ms |
| Intervals over 50 ms | 30 | 30 |

That is 67.95% less total sampled allocation traffic and 98.03% less in the shadow
subtree. Nonshadow traffic differs by about 0.1%, supporting attribution to the
targeted fix. These are instrumented allocation estimates, not retained memory,
physical GPU allocation or a demonstrated FPS increase. Snapshot/protobuf
decoding remains the largest allocation branch and is future profiling work.

Two further sessions returned to 16.23/16.53 MiB main heap, one validator worker,
zero battlefield canvases and zero actor texture pages. The optimized DPR2 build
also passed actual WebGL context loss/restoration and a 35-second lifecycle freeze,
with successful saves afterward and zero errors/warnings/HTTP failures. A promoted
build save/load check initially exceeded its 30-second visibility wait during
packaging. The instrumented retry passed, followed by ten consecutive loads with
no errors; the nine timed repeat loads completed in 8.28–9.71 seconds. That earlier
timeout remains recorded rather than being relabeled as a pass.

Receipts are under `allocation-profile/`, `allocation-profile-optimized/`,
`optimized-retina/`, `load-cycle-stress/` and `optimized-client-full.log` in
`/tmp/fc-deep-demo-20261116/`. The sampling options follow the
[Chrome HeapProfiler protocol](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/#method-startSampling).

The optimized portable package was independently extracted and verified: all
8,963 recorded files plus the inventory match, no extra files/symlinks/private
data, executable permissions intact and client pack integrity passed. It contains
1,502,917,111 bytes; ZIP is 1,333,501,320 bytes (11.27% smaller). SHA-256:
`21212866d13722a892468459e473c10edd836db7b31241cb3b1e3ec6e79d0683`.
The adjacent checksum was verified. Receipt:
`package-optimized-clean-extract-receipt.json` under the audit directory.

Final promoted-build receipts: `optimized-network-sequence.json` passed
multiplayer, all four factions and both co-op scenarios with no page/HTTP errors.
`upgrade-optimized/report.json` passed persistent old-generation install,
same-origin optimized-generation reload/install, then offline restore and save.
Old/optimized installations took 18.63/22.15 seconds. Its temporary host/profile
were closed and removed. `final-source-and-host-identity.json` matches all 230
authored main-bundle sources, the 278 Go/content inputs and the served pack.
The previous host exited before data promotion; all nine preserved data-file
hashes match (`closed-data-preservation.json`). The selected localhost launcher
and complete optimized archive are linked from the demo workspace README.

Remaining scope is explicit: these tests do not certify physical LAN hardware,
reference laptops, human campaign balance, subjective audio quality or indefinite
stability. Future measured work includes snapshot/protobuf allocation reduction,
HTTP text/WASM compression and pixel-verified asset format qualification. The
application's persistent inspection worker still needs a normal page reload
after a fatal engine failure; ordinary corrupt imports remain recoverable.
Simulation rules/caps/version remain unchanged. The aggregate extended command's
two recorded timing failures remain visible alongside the successful separate
native timing rerun.
