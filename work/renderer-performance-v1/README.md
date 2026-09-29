# Renderer performance audit v1

Private source audit and two separately reviewable candidates. No live product
file, simulation, art, fog topology, rendering quality or deployment is changed.
The actual scene owner is `client/src/render/battlefield.ts`; there is no
`client/src/render/scene.ts`.

The complete162-role release is unfinished. Source/math results below are not
browser memory, timing, FPS, final art or release acceptance. A browser worker
owns the single actual-App lane; this audit launched no browser or Blender.

## Ranked findings

1. **Terrain admission can allocate the whole256² map.** The renderer has real
   chunking/culling; it does not unconditionally bake a whole map. However, the
   conservative600px horizontal/440px vertical guards are converted through
   zoom. Every admitted chunk is marked `visible=true`, even when all fragments
   are culled. The36-chunk limit evicts only inactive chunks. At minimum zoom,
   ordinary large windows admit all256 chunks. This qualifies the initial
   “whole-map hypothesis disproven” note: unconditional whole-map baking was
   disproven; conditional whole-map retention is reproduced by the exact method.
2. **Art budgets are soft age thresholds, not residency ceilings.** Current
   page requests refresh `lastUsed`; trims cannot remove a page used within10s.
   Pages remain above192MiB standard/384MiB high indefinitely if repeatedly
   requested.2× quadruples texture pixels but only doubles the threshold.
   Root owns the separate residency/lifetime investigation.
3. **A culled actor can fail to reenter a stationary viewport.** `bounds()` uses
   the last painted ink at `root.position`, while the render gate prevents that
   root from moving when culled. Actual ActorVisual/Pixi object tests reproduce
   all8 cases. A separate correction passes all8; actual browser/art remains open.
4. **Minimap sampling reconstructs a constant palette per tile.** The private
   palette-only candidate removes one object/eight array literal evaluations per
   tile. It preserves exact color and output ownership. This is a source-level
   allocation opportunity; JIT heap elimination and measured speed are unclaimed.
5. **Sorting, fog scans and frame allocations scale with admitted resources.**
   These are source-confirmed work counts/hot paths, not ranked CPU measurements.
   Profile actual draw calls and update costs before making more visual changes.

## Terrain allocation and lifetime

`TerrainBaker` is constructed with its default resolution1, independently of
`artQuality`, DPR and UI scale. Each16×16 chunk allocates a1028×556 canvas:
2,286,272 nominal RGBA bytes (2.18036MiB). High actor-art quality does not multiply
this terrain allocation. Canvas backing storage and a GPU copy may coexist;
these numbers count one nominal RGBA allocation, without overhead or mipmaps.

The exact frozen `terrainFrame()` ran with only raster/Pixi attachment replaced
by counters. It admits at most2 chunks per call. The following are centered
**actual CSS canvas sizes derived from current sidebar layout**, at zoom.45:

| Window | UI scale | Canvas width |256² chunks | Nominal RGBA MiB |
|---|---:|---:|---:|---:|
|1280×720 |1.0 |1032 |144 |313.97 |
|1280×720 |1.5 |908 |144 |313.97 |
|1600×900 |1.0 |1300 |196 |427.35 |
|1600×900 |1.5 |1150 |196 |427.35 |
|1920×1080 |1.0 |1620 |256 |558.17 |
|1920×1080 |1.5 |1470 |256 |558.17 |
|2560×1440 |1.0 |2260 |256 |558.17 |

The96² map has36 total chunks,78.49MiB nominal RGBA. Most centered ordinary
views in this matrix admit all36 even at zoom1. On256² at1920×1080/zoom1,
64 chunks remain admitted (139.54MiB). Pixel DPR does not change admission.
Four independent browser clients at the256-chunk witness sum2,232.69MiB for
terrain nominal RGBA alone; this is arithmetic, not observed shared-host usage.

Chunk fragments are individually culled by exact projected bounds. Hidden
fragment meshes stay attached to the sortable ground container. A flat interior
chunk produces1024 top triangles,62 fragments and124 ground+fog mesh nodes.
Its two geometry sets total122,880 typed-array bytes, fog topology43,720 bytes,
and the unchanged-opacity fast path still checks2808 fog dependencies per new
snapshot. A flat full256² scene therefore attaches31,744 terrain/fog mesh nodes
before actors, props and shadows. Topology at map edges/cliffs differs; no
JavaScript object memory is included in this count.

`updateFog()` scans every resident chunk per new snapshot, including inactive
cached chunks. Its value cache correctly avoids unchanged UV uploads, and fog
alpha/topology/privacy must remain exact. Ground child sorting is Pixi's normal
dirty `children.sort()` over attached children. Changed actor depths mark the
parent dirty; `EnvironmentVisual.render()` also writes base depth then painted
depth, which can repeatedly dirty a static environment node. Hidden nodes are
not removed from the sort array. The exact actual draw-call count is unknown:
mesh nodes are not draw calls, and explicit batch mode/texture order matter.

Eviction/rubble/context restoration/end-of-match disposal calls each geometry's
destroy and `chunk.texture.destroy(true)`. Installed Pixi8.21.0 unloads GPU data
and clears the source resource reference. Face textures/fog ramp are separately
released after fragments. Garbage-collection timing and native resource residue
are the browser lane's responsibility. The constructor's copied tile map and
TerrainSurface's level/corner arrays are full-map CPU structures; the surface
typed arrays are41 bytes/tile (0.36MiB96²/2.56MiB256²), not whole-map textures.

## Art residency and full-roster limits

Pages are lazy: metadata for every atlas in a requested role is loaded first,
but a page bitmap/texture is admitted only when a frame on that page is asked
for. Only visible actors paint; offscreen roles can still have sheet metadata.
`frame()` updates the page's use time. A pending page cannot be evicted. Every60
render frames, `trim()` checks the soft threshold and evicts unused pages older
than10s. At30FPS this check is about every2s, at60FPS about every1s; this is the
call schedule, not measured FPS. Texture/source/bitmap disposal and alpha-mask
generation guards exist. The earlier destroyed-atlas stale-frame fix is kept.

`residentBytes` counts width×height×4 once. It excludes decoded bitmap backing,
temporary alpha-readback canvas/getImageData (another RGBA array), UI images,
terrain, shadow targets and native overhead. `pickingBytes` separately reports
one bit per beauty/team pixel. The asset generation's4 reads/128MiB in-flight
and64MiB encoded lease bounds do not limit decoded sprite residency: sprite
pages use `read()`, then decode after the read slot is released. Match release
destroys sheet pages; same-generation terrain/UI images and cameo strings remain
cached until explicit generation replacement/disposal.

The ordinary package supplied by root is pinned at
`work/ordinary-package-cadence-v1/build-01/package/client`, packSHA
`b73e3325ba370733419332243a63fe6b0e7663ade09808f731bf5f8592f09553`.
It contains95 world sprite IDs, not162.1188 index/descriptor hashes match the
pack; all PNG dimensions match descriptor dimensions. PNG bodies are not
rehash-verified or decoded by this inventory.

| Current ordinary95-ID package |1× |2× |
|---|---:|---:|
| Atlas pages indexed |546 |546 |
| Theoretical every-page RGBA sum |1395.79MiB |5583.15MiB |
| Hypothetical idle/d00/f00 page union |543.26MiB |2173.04MiB |

These are theoretical unions, not actual match residency. Non-idle aircraft
states/aliases are excluded from the idle union. The frozen57-handoff staged
subset is separately inventoried in `atlas-subset.json`:648 pages at either
scale,2060108120/8240432480 nominal RGBA bytes. It overlaps/replaces ordinary
assets and must never be added to the ordinary-package totals. Neither set
justifies extrapolating final162-role memory.1–4-player scene variety/actual
authorized visibility and active animation pages must be measured.

Other per-frame source work includes all authorized actor culling, repeated
ground/altitude projection for visible actors and squad parts, pose key/object
construction, rebuilt graphics overlays, shadow plate/object/array collection,
shadow stamp key strings, and tactical graphics. GPU shadow targets already
have a separate32MiB/4096 dimension ceiling. No change is proposed to these paths
without actual current-package profiles.

## Candidate A: minimap palette only

`candidate/client/src/render/terrain.ts` hoists the private palette into one
module-level `Readonly<Record<string, readonly RGB>>`. Only the static color
method reads it; no reference escapes. Every call still returns a new tuple.
The sole product caller destructures that tuple and writes fog-scaled RGBA into
ImageData. No cache key, fog calculation, selection, geometry or animation changes.

Validation pins137 copied source inputs and verifies every other candidate file
is byte-identical.300 color cases cover eight terrains, unknown/missing terrain,
missing/legal0–4 heights and each out-of-map direction. Every returned tuple is
mutated, then a fresh call must still match the frozen oracle. Two96²/256²
RGBA images (299,008 bytes) match exactly through visible/explored/unknown fog
factors. Private app TypeScript check passes. At96²/256², this removes82,944/
589,824 palette object/array literal evaluations per repaint; actual heap bytes
and speed are unmeasured. New canvas/ImageData/returned tuple allocations remain.

## Candidate B: culling reentry only

`culling-candidate/client/src/render/battlefield.ts` adds a single guarded ground
transform refresh before culling when `actor.root.visible` was false. Current
visible actors retain their existing path. This adds one current ground
projection per previously culled actor; it does not request sprite pages or
advance animation before the normal visibility gate.

The Node course runs actual frozen/candidate `BattlefieldRenderer.render` and
`bounds`, actual ActorVisual and real Pixi scene objects with a synthetic1px
frame. Baseline fails all8 reentry cases; candidate passes ground/air × flat/
height4 × ordinary/reduced-motion cases, current body picking and outside-body
rejection. Authorized entity objects stay unchanged. Visible frames still call
groundAnchor once. Browser transport, real artwork, pixel regression, service
decks, pan/replay and private/fog transitions remain required before promotion.

## Reproduction and preserved failures

Run from the repository root with installed client dependencies:

```sh
node work/renderer-performance-v1/tests/validate.mjs
node work/renderer-performance-v1/tests/atlas-package.mjs
node work/renderer-performance-v1/tests/atlas-subset.mjs
node work/renderer-performance-v1/tests/culling.mjs
```

The palette private tree uses a local `candidate/client/node_modules` symlink
to the installed root client dependencies for its TypeScript check. It is not
part of the source candidate. The source-copy operation also copied ignored
nested runtime dependencies; these are not staged, not implementation deltas
and not inputs to the137-file guard.

`validation.log` preserves the initial wrong relative esbuild import failure;
run02/run03 pass after fixing only the test import. `culling-run01.log` preserves
the initial Pixi ObservablePoint getter snapshot mistake; run02 captures the
unchanged baseline defect and passing candidate after explicit x/y snapshot.
No failure was turned into a product acceptance pass. A shell cleanup command
was automatically rejected for using rm-f style; no removal occurred or was
needed. No browser request failure is reclassified by this audit.
