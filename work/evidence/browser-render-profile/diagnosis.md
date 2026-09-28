# Maximum-load renderer diagnosis

The old headless baseline's roughly 20 FPS is dominated by the test environment's
**SwiftShader software rendering**, not a 50 ms JavaScript renderer workload.
With a fresh headed Chromium using verified **ANGLE Metal / Apple M4**, the same
frozen pre-optimization runtime and scene render near the display's 60 Hz cadence.
This is a host-specific diagnostic, not reference-hardware or full-release FPS
certification. No production source was modified.

## Inputs and capture conditions

The flow under test is: load the unchanged 688-actor native save, apply its actual
four-player command schedule through Go WASM, render player1's natural authorized
view over 600 ticks, then verify the native final hash and save restoration.
Only 172–257 actors are visible; this is not 688 actors simultaneously on screen.
The scene also contains 49 terrain chunks and approximately 39.94 MB of resident
art pages. Six entity types still use disclosed development art substitutions.

Browser plugin/skill unavailable; used the repository's installed Playwright-core
1.62.1 and Chromium 151.0.7922.34. Each run starts a new temporary browser profile.
No user's existing browser profile or global GPU flags/settings were changed.
Viewport 1600×900, DPR 1, WebGL 2, antialiasing enabled. The browser/server close after
each run. The root and bot agent held heavy suites during the hardware capture.
A late process sample found no matching background native/Blender processes;
that is not continuous host-idle telemetry.

Before instrumentation, rebuilding root's original fixture reproduced its bundle
SHA-256 exactly:
`debe147dfd71b6e46b6f14629e4d3d8de28ce58e5233b763588d8ddf17357a4f`.
Frozen WASM:
`622110058f3ff540f1bc81e90b8f05f00e6fca951c23888668323658e84340db`.
Opening save:
`0961a3d5094616c8d53c2e1213e40aca08c0ad3b59c7d079cd10a1c8f1fcd266`.
The copied runtime, original fixture, native schedule, baseline bundle and source
hashes are retained locally in `snapshot/`; production modules and root harness
files were not edited. The profiler sampled only the running simulation loop,
after initial art loading and before final hash/save validation.

## Actual measurements

| Run | Verified WebGL backend | Elapsed 600 ticks | RAF p50 / p95 / p99 | Frames >50ms | Four-tick RPC p50 / p95 |
|---|---|---:|---|---:|---|
| Root old baseline, segment1 | Not recorded then; same default headless-shell launch | 42.250s | 50.0 / 66.8 / 67.9ms | 338/808 | 174.2 / 229.1ms |
| Profiled headless draw | SwiftShader Vulkan LLVM10, software compositing | 47.280s | 64.7 / 68.6 / 83.4ms | 511/820 | 199.6 / 278.1ms |
| Profiled headed draw | ANGLE Metal Apple M4, hardware compositing/WebGL | 30.000s | 16.7 / 18.4 / 18.7ms | 2/1784 | 145.7 / 218.4ms |
| Profiled headed no-draw control | Same ANGLE Metal Apple M4 | 30.072s | 16.7 / 18.3 / 18.6ms | 0/1807 | 129.1 / 173.3ms |

The no-draw control bypasses only Pixi's renderer draw dispatch in the isolated
fixture. Actor interpolation/pose/fallback preparation, snapshots, worker
simulation and commands still run. It is a diagnostic control, not an optimized
production implementation. The first warmup frames can retain a prior image;
its screenshot is not a visual acceptance image.

All three measured loops produced native final hash
`8f1bc930891145054177f3086d2e268da1180935dc782a922b101e53b4adf32c`
and exact save/restore parity. Software GPU work plausibly contends with the
worker for CPU as well: a live process inspection showed the SwiftShader GPU
process using 698% CPU, versus 68.4% for the renderer process including its worker.
That was an instantaneous observation, not an average CPU benchmark.

## Main-thread evidence

| Capture | Main-thread CPU time | Script duration | Profile samples |
|---|---:|---:|---|
| Headless software | 3.103s | 2.103s | 45.45s of 47.55s in native/non-JS `(program)` |
| Headed Metal draw | 4.880s | 4.045s | 25.77s of 30.07s idle (85.7%) |
| Headed Metal no-draw | 1.701s | 1.383s | 28.72s idle |

CDP's wall/task durations and CPU time are different quantities. The large
headless `(program)` sample is not attributed to a JavaScript function and does
not itself prove a specific GPU-driver call. Combined with verified SwiftShader,
its CPU saturation and the hardware/no-draw comparison, it strongly supports
software GPU/compositor waits and contention as the baseline limitation.

Headed JavaScript self hotspots, over the whole 30-second capture:

- Pixi `collectRenderablesSimple`: 392ms; scene-tree traversal.
- Garbage collection: 419ms.
- `SpriteSheet.frame` in `client/src/render/art.ts`: 210ms.
- Pixi shape-path tessellation callback: 118ms; quad packing: 116ms.
- `ActorVisual.render`: 115ms self, approximately 953ms inclusive.
- `BattlefieldRenderer.bounds`: 92ms.

Recursive inclusive profile totals can count nested calls more than once;
compare self time or total CDP ScriptDuration instead of adding inclusive rows.
No layout/recalculation duration was recorded during the loop. This fixture
uses the battlefield renderer, not the full React command-console flow.

## Bounded recommendations

1. **Fix measurement eligibility first.** Root should record browser executable,
   CDP GPU feature status and the actual WebGL unmasked renderer for every FPS
   run. Keep headless software runs as functional parity checks; only use a
   verified hardware backend for a hardware FPS gate. Do not silently relabel
   SwiftShader as Apple M4 graphics just because that is the host CPU.
2. **Prioritize the independent Go adapter issue.** Four-tick RPC p95 still
   exceeds 200ms in headed draw before root's feedback-only adapter optimization.
   The renderer can meet display cadence while worker delivery has little
   throughput margin. Do not infer isolated tick cost from this round trip.
3. **If subsequent full-art measurements justify a renderer change**, cache
   fallback/overlay Graphics geometry until its visual inputs change. Current
   `ActorVisual.render` clears and rebuilds static development structures,
   fallback diamonds and overlays each frame. Keep position, facing and animated
   pose updates independent; dirty keys must include team color, health/rank,
   selection, construction, enabled state and relevant presentation flags.
   This should reduce tessellation/GC without changing the image. It is a
   proposed bounded optimization, not implemented or validated here.
4. **A smaller measured follow-up** could avoid reassigning sprite texture,
   anchor/scale/tint when the resolved pose and team are unchanged. Preserve
   `SpriteSheet.frame` residency touches, pending-page loads and loss-of-vision
   disposal. Do not introduce a cache that keeps a hidden enemy visible.

Current measurements do not justify rewriting the rendering architecture or
changing simulation rules. Final roster art, four-soldier squad complexity,
long-match resource residency, larger visible battles, Intel reference hardware,
Safari and full command-console interaction still need their own measurements.

## QA and artifacts

| Check | Result |
|---|---|
| Page identity | Expected isolated maximum-load title and loop |
| Meaningful render | Hardware screenshot inspected; actual terrain, actors and fog |
| Framework overlay | None |
| Runtime/renderer errors | Empty in every measured segment |
| Console | One automatic `/favicon.ico` 404 in headed harness; attributed below |
| Interaction/state proof | Real command schedule, 600 Go ticks, exact native final hash and restoration |
| Disposal | Zero battlefield canvases and zero art resident pages after disposal |

The raw headed reports retain `status: errors` because the helper recorded every
console error. A separate headed startup-only probe captured the server's exact
missing request: `/favicon.ico`; the frozen product has no such file. This is a
harness favicon request, not a missing game sprite or runtime failure. The
reports have not been rewritten to hide it. A future helper can return 204 for
that request or declare an existing icon.

- `profile.mjs`: isolated capture helper, including headed/no-draw/probe modes.
- `analyze.mjs`: CPU-profile self/inclusive aggregation.
- `normal/`, `hardware/`, `hardware-no-draw/`: raw CDP reports, summaries and
  DevTools-compatible main-thread `.cpuprofile` files.
- `hardware/segment.png`: inspected actual rendered scene.
- `hardware-probe/report.json`: exact favicon 404 attribution.
- `snapshot/`: large local reproducibility files; not needed in a compact commit.

Commands: `node work/evidence/browser-render-profile/profile.mjs normal`, then
`hardware`, `hardware-no-draw`; analyze each with `analyze.mjs <mode>`. The normal
mode freezes fresh input artifacts and must be run first only when intentionally
creating a new comparison set. This evidence used the pre-optimization adapter.
