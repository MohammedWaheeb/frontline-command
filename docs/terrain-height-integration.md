# Terrain surface integration evidence

Stages 1–3 have passed their bounded geometry, product integration and current-art
M4 load checks. Final material styling and reference-device acceptance remain.
`terrain-surface.ts` is the shared immutable public-map presentation model.
No Go or authored map bytes changed. The original flat `iso` helpers remain
valid for sprite-relative offsets; map positions use `projectGround`.

The surface keeps exact declared tile-center levels, averages only connected
passable corner sectors, and builds continuous slopes across all legal roads,
ramps and open ground. Impassable discontinuities receive one owned face;
back-facing faces are excluded from presentation. Triangle picking returns the
frontmost actual ray intersection and maps a visible cliff face to its blocked
owner for ordinary Go order validation. Support footprints clip real triangles
before finding a rigid foundation height. Frequent ground sampling allocates
no temporary triangle arrays.

`TerrainBaker.bake(cx,cy,true)` omits the old painted edge shadows.
`surfaceFragments(cx,cy,texture,surface)` returns cached depth fragments whose
UVs still sample the original flat bake. Each fragment owns matching ground
and fog geometry, `setFog(visible,explored)`, and `dispose()`. The caller owns the
chunk texture separately. `disposeSurfaceResources()` releases the baker's
face textures/fog palette only after its fragments are gone. Fog uses exact
0/175/255 opacity from authorized bits with nearest sampling; faces use the
more restrictive adjacent state. Mesh/fog share identical projected vertices.
A common ground-depth scene sequence must interleave these with actors.

## Recorded isolated browser checks

`node client/tests/render/terrain-height-browser.mjs` uses actual Pixi/WebGL,
existing authored materials and an isolated Chromium profile. CDP confirms
ANGLE Metal on Apple M4. The tests are geometry/fog/input acceptance, not a
Go battle, complete environment-art approval or performance benchmark.

- Five scenes: a synthetic four-approach plateau, its fog edge, Relay Heights,
  SA04's mixed-height battery area, and a synthetic 0–4-height stress surface.
- All 15 normal/reversed insertion comparisons at 0.45×, 1× and 1.8× are pixel
  identical. Chunk borders include partial edge chunks.
- 70,759 interior GPU triangle-ID pixels match the pure frontmost picker.
  The initial stress run exposed omitted fixture edge chunks, corrected before
  the clean run; product culling must include the full projected height margin.
- Six real browser pointer clicks hit their displayed surface coordinates.
  The opaque unknown plateau probe leaks zero interior material pixels.
- A near four-level cliff hides all 560 pixels of a lower-ground visual probe;
  drawing that probe last incorrectly exposes all 560. This tests terrain
  occlusion with synthetic visual geometry, not a Go actor's visibility.
- Five scenes leave no fragment textures or visual probes after disposal.
  No browser errors occurred. Native 1600×900 and 1280×720 contacts inspected.

Evidence is under `work/evidence/terrain-height/`, including
`browser-stage2.json` and the named scene PNGs. Existing runtime tests pass
207/207, including nine new topology/anchor/picking/fog/support cases; both
TypeScript checks and the isolated fixture's strict typecheck pass.

## Stage 2 handoff gate (subsequently exercised below)

Root approved this as geometry acceptance. Material/road/cliff aesthetics still
need Claude review. Stage 3 must integrate camera/picking, ground and rigid
structure anchors, all tactical endpoints, conservative fog/resource visibility,
replay/rubble reset, and retained aircraft flight/contact-shadow semantics.
The common fragment ordering must then pass actual Go product interaction,
existing renderer regressions, graphics-context recovery, disposal and the
688-actor headed hardware measurement. No final visual or game-complete claim
follows from these isolated checks.

## Stage 3 live integration

The product now uses one sorted ground scene containing cached raised material
and exact fog fragments, visible actors, authorized memories and ground shadows.
The tactical overlay remains separate. Camera focus and pointer commands use the
shared surface; minimap map coordinates retain the existing dimetric algorithm.
Its camera outline obtains world coordinates from the surface picker. Chunk
culling has a conservative height margin and caches unchanged view rectangles.
Terrain UVs, bleed, rubble restoration and public map semantics are retained.

Ground units and each visible infantry member sample the actual fan surface.
Rigid structures use the highest point of their clipped retained footprint and
a short support skirt down to the perimeter. This is a drawing convention, not
an added Go foundation requirement. The 2/3-height synthetic power station and
a paid building at the plateau edge remain legal under ordinary Go placement.

Aircraft preserve the existing `FlightPresentation` timing and state selection.
Their cruise plane clears the public map's maximum height; takeoff/landing
interpolate from the current terrain. Aircraft shadows are separate ground-scene
nodes, sampled at their projected sunlight offset. Ground hull/turret shadows
retain their existing internal ordering. A landed aircraft draws above its
visible service footprint, with the same rigid support plane. Missing-art
procedural service roofs use their actual `structureHeight`; authored service
sprites need an explicit deck-height contract before any additional deck lift.
Home remains owner-private: foreign landed aircraft only use already-visible
same-owner overlapping geometry, without inferring hidden service structures.

The old flat `toScreen`/`toWorld` functions are explicitly retained for relative
sprite offsets and conservative culling, never used as the primary map picker.
`TerrainFragment.setVisible()` preserves fog state while chunks enter/leave the
viewport. Disposal releases all actor and detached-shadow nodes, fragment
geometries, chunk textures and shared surface material resources.

### Real Go and product checks

`terrain-product-browser.mjs` runs actual Go/WASM 0.3.1 through the production
renderer on a synthetic map. It checks frontmost input, a mixed-height rigid
structure, ordinary tank movement from low ground across heights 2 and 3, paid
power construction, raised-base aircraft Return/service/departure, authoritative
unknown-enemy exclusion, save/restore hash equality and disposal. It also runs
untouched authored US04 with an ordinary targeted Return order: wing59 reaches
its backup base and completes service at tick578. Removing the aircraft body
changes 863 actual pixels; the original defect hid it behind the service plate.
This is a landing regression, not another full campaign-completion claim.

`terrain-ui-browser.mjs` builds the full product in an isolated directory,
imports the genuine Go-generated save through Archives, selects the raised tank,
issues its exact `(14500,23500)` move using visible controls, selects the mixed
foundation and quick-saves. Its initial minimap harness assumed fractional mouse
coordinates survived the click event; recording the actual client coordinates
fixed the harness, with no minimap algorithm change. The clean run has no page
errors and records the exact submitted Go order. Screenshots under `ui/` show
the real command console, selected actors and terrain, not a custom test UI.

The existing renderer browser regression also passed all14 groups, including
actual combat/rubble/rewind, graphics-context recovery, five-scene disposal and
independent turret-shadow pixels. Both TypeScript checks and209 current runtime
tests pass. The raised-base flight fixture also asserts that departure changes
the support-plane lift by less than5px at the initial transition.

Both suites record the exact WASM SHA-256. Synthetic test actors and missing-art
service plates remain explicitly test/fallback content. Material styling and
road/cliff aesthetics still require Claude review. The maximum-load timing
result is recorded separately below after the coordinated hardware run.


### Coordinated 688-actor hardware run

The native export was regenerated into this lane's isolated `load/` directory
on simulation 0.3.1; the original 0.3.0 fixture was preserved. Root paused native
mission/bot tests, and the sole Blender worker was held. The browser runner uses
a fresh headed Chromium151 profile, actual ANGLE Metal AppleM4 graphics and the
frozen current-art product. No global browser settings changed.

| Measure | Segment 1 | Segment 2 |
| --- | ---: | ---: |
| Real Go ticks / wall time | 600 / 30.0003 s | 600 / 30.0000 s |
| Simulation ticks/second | 19.9998 | 20.0000 |
| RAF p50 / p95 | 16.7 / 17.0 ms | 16.7 / 17.0 ms |
| RAF p99 | 18.5 ms | 18.4 ms |
| Frames over50ms / total | 0 / 1800 | 0 / 1800 |
| Four-tick worker roundtrip p95 | 148.3 ms | 152.6 ms |
| Multi-player command-group maximum | 337.9 ms | 327.2 ms |

Both segments retained all688 simulated actors, completed all64 aircraft returns,
and showed172–257 naturally authorized visible actors with49 cached terrain
chunks. Resident art was40.25MiB; all pages/canvases were gone after each disposal.
Native/WASM and restored hashes were identical:
`34473b9e07c2f822d77be9f2448f938fe994f26bce09a0b078401837a77c667c`.
There were no browser errors. The roundtrip is not isolated Go tick time: it
includes four ticks, snapshot/view work, protobuf, IPC and renderer updates.

Reproduction: export `TestExportBrowserMaximumLoad` with
`FRONTLINE_BROWSER_LOAD_DIR` set to this lane's `load/` directory, build the
isolated UI fixture, then run
`FRONTLINE_LOAD_HEADED=1 node client/tests/render/terrain-load-browser.mjs`
during a coordinated quiet window. Full report/backend/hash evidence lives in
`work/evidence/terrain-height/load/browser.json`.

This flat synthetic maximum-actor map tests the integrated raised-surface renderer
at maximum actor load. Raised topology/occlusion, actual paid movement and mixed
foundations have separate tests above. It is not a claim of688 actors on every
authored height map, long-match memory stability, completed-art cost, Intel
integrated graphics, a lower-end reference device, or Safari performance.
