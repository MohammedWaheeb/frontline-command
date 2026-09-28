# Terrain surface integration evidence

Stages 1–2 are complete; product integration and load acceptance are next.
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

## Remaining product gate

Root approved this as geometry acceptance. Material/road/cliff aesthetics still
need Claude review. Stage 3 must integrate camera/picking, ground and rigid
structure anchors, all tactical endpoints, conservative fog/resource visibility,
replay/rubble reset, and retained aircraft flight/contact-shadow semantics.
The common fragment ordering must then pass actual Go product interaction,
existing renderer regressions, graphics-context recovery, disposal and the
688-actor headed hardware measurement. No final visual or game-complete claim
follows from these isolated checks.
