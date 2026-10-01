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
