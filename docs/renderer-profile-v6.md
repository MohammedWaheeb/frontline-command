# Independent v6 renderer profile diagnosis

The instrumented main thread spends most sampled time rebuilding Pixi render
instructions and packing general mesh geometry. Snapshot application is a small
fraction of this recording. This does **not** establish that rendering is the
only cause of the missing simulation-rate target: the later v7 worker timings
also show substantial Go step/view cost.

## Exact evidence and method

Input: `work/art/sprite-terrain-depth/product-load-profile-v6/main-0.cpuprofile`,
SHA256 `0f16b58680d2fb53eb2cd497276f4c0944306dc2cfdca0fe2cf0cf27747e88bb`.
The profile spans 73.899496 seconds; 48,612 samples account for 73.898778 seconds.
The pure offline analyzer and full top-40 tables with call stacks are in
`work/evidence/browser-render-profile/depth-v6/`.

For each sample, its time delta is assigned to its leaf for exclusive attribution
and once to every ancestor for inclusive attribution. Inclusive rows overlap;
they must not be added together. Sampling gives elapsed attribution to observed
stacks, not exact function call counts, independent CPU utilization, GPU timing,
or an uninstrumented performance benchmark. OS scheduling and profiler overhead
can affect it. The profile includes initial preparation and final save/restore,
not solely the 69.4061-second measured 600-tick interval (8.645 ticks/second).

The actual graphics backend is **ANGLE Metal Renderer: Apple M4**. There are
172–257 authorized entities, 257 final actor objects and 49 loaded terrain
chunks; this natural view does not render all 688 simulation actors at once.
Resident art is 12 pages / 42,208,320 bytes. The final hash, restore and complete
resource disposal passed; performance did not meet the intended 20-tick rate.

The runner routes `/art`, runtime and other product files into the same frozen
`work/evidence/terrain-height/ui/build` product by default. Its receipt is from
04:18:34 UTC: WASM SHA256
`cafa10367f08dc4e68a75a2e9f4d21587977a776b1e38c744481b31960c8a75c`,
base-pack SHA256
`becd32764524739f5fb1f27d958518e8f9c4fb56747319118da4a05c57931b5e`.
The five-file pre-depth comparison changes bundled renderer source via an
esbuild override; it does not route to a newer art directory. My earlier general
caution about art drift is not an explanation for this same-pack comparison.

## Sampled hotspots

| Stack or function | Exclusive time | Inclusive time | Meaning |
|---|---:|---:|---|
| Pixi ticker callback subtree | — | 66.386 s | 89.8% of sampled recording |
| Final scene render subtree | — | 51.067 s | Separate from renderer's update callback |
| `RenderGroupSystem._buildInstructions` | — | 47.530 s | Rebuild/traverse/batch work, not just GPU submission |
| `DefaultBatcher.packAttributes` | 15.656 s | 16.908 s | General mesh/graphics vertex transforms and attribute writes |
| `Batcher.packIndex` | 5.348 s | 5.398 s | Index rebasing into rebuilt batches |
| Main `ViewContainer.collectRenderablesSimple` instance | 4.516 s | 9.266 s | Includes mesh render-pipe work |
| `GlBufferSystem.updateBuffer` | 2.582 s | 2.582 s | Final scene buffer uploads |
| Garbage collector | 2.267 s | 2.267 s | About 3.1% of sampled time |
| `BattlefieldRenderer.render` update callback | 0.836 s | 15.240 s | Actor, shadow, terrain and overlays; excludes final scene render above |
| `ActorVisual.render` within that callback | 0.748 s | 6.663 s | Includes 2.434 s `paintPart` and 1.916 s fallback `drawStructure` |
| `SurfaceShadows.update` | 2.081 s | 5.918 s | Includes 2.027 s CPU service-deck geometry |
| Nested shadow-stamp `renderer.render` | — | 0.246 s | CPU sampling of this subtree only; not isolated GPU duration |

The final scene's container traversal has several distinct recursive stack nodes
at 4.960 s, 2.221 s and 0.413 s exclusive. These are separate sampled frames,
not extra inclusive totals. General `packAttributes` is distinct from the
quad-specific `packQuadAttributes` path, which accounts for only about 0.189 s
exclusive at its largest node. Mesh UV/index accessors beneath the expensive
path independently corroborate that the vertex/index packing problem is not
simply thousands of sprite quads.

Direct snapshot timing recorded by the fixture is 223 updates, 1.4333 seconds
total, p50 5.7 ms and p95 15 ms. It is not the dominant main-thread cost here.
The v6 worker timing summary was reset by final restore, so it cannot prove
where the remainder of the worker interval went. Root is correcting that
instrumentation; no conclusion is inferred from the missing totals.

## Source linkage and bounded next experiments

The profile's bundled function names and call relationships match:

- `client/node_modules/pixi.js/lib/rendering/batcher/shared/DefaultBatcher.mjs`
  `packAttributes`: transforms each general mesh vertex and writes six packed
  attributes. `Batcher.mjs` `packIndex` rebases each index.
- `client/node_modules/pixi.js/lib/scene/container/RenderGroupSystem.mjs`
  `_updateRenderGroups`: when `structureDidChange` is true, it calls
  `_buildInstructions`, then uploads the batch buffers.
- `client/node_modules/pixi.js/lib/scene/container/container-mixins/sortMixin.mjs`
  `zIndex` setter: a changed depth marks its parent render group's structure dirty.
- `client/src/render/actors.ts` `ActorVisual.render`: updates interpolated actor
  positions and `root.zIndex` every frame. Moving actors therefore repeatedly
  invalidate the shared depth-sorted group's instruction order.
- `client/src/render/battlefield.ts`: static terrain fragments, shadows and actors
  share the sorted ground container. `terrainFrame` itself is only ~0.730 s
  inclusive in the recording; it is the later shared batch rebuild that repeatedly
  processes the static terrain geometry.
- `client/src/render/terrain.ts` `surfaceFragments`: both top/face mesh geometry
  and exact fog geometry explicitly use `batchMode='batch'`. This preserves
  interleaving, but puts their vertices into the group's rebuilt CPU batches.
- `client/src/render/surface-shadows.ts`: the GPU stamp is not the largest measured
  CPU subtree. Its static projected ground meshes still join the final sorted
  scene and thus contribute to final scene packing. The measured update cost
  includes CPU clipping for known service decks and geometry/visibility changes.

This source chain makes repeated static-geometry repacking a concrete target.
It does not establish that all packing belongs to terrain; graphics, projected
shadow meshes and other batched meshes also participate. A test-only per-class
vertex/index counter can separate them without changing gameplay or visible art.

Two controlled experiments are justified, with the same exact assets, map,
commands, runtime and camera:

1. Keep static terrain/fog in immutable GPU geometry with nonbatched meshes, then
   measure whether avoided vertex/index packing outweighs additional draw calls.
2. If draw calls dominate, retain bounded static depth groups with their own
   cached render instructions. Keep the exact terrain/actor/shadow/fog depth
   order; grouping the whole ground into one texture would break accepted
   raised-cliff and visibility behavior.

The experiment must retain pixel, cliff, visibility, service-deck, context-loss,
asset eviction and disposal gates. Do not hide warning/status geometry, reduce
simulation work, change map heights or claim a speedup from synthetic CPU update
timing alone. Re-measure the full hardware course when the host is quiet.
No renderer, dependency, art, Go or protocol file was changed by this audit.
