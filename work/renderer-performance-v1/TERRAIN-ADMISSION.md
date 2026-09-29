# Private terrain admission and combined renderer follow-up

This follows `ee19d88`. No live renderer file or ordinary package was edited.
The baseline and all failed harness receipts remain intact. Root authorized the
projected-envelope candidate and then a separate viewport-first ordering
candidate. Neither is accepted as a rendered product yet.

## Envelope admission

`terrain-admission-candidate` retains the original 600px/440px CSS prefetch
guard, two new bakes per render call, texture resolution, geometry, fragment
culling and cache eviction rule. A new `TerrainBaker.chunkBounds()` returns the
projected envelope of the chunk's actual tile extent, extended upward by the
public surface's maximum height. Partial map-edge chunks use their true width
and height. All terrain vertices are in this envelope; texture bleed is clipped
by the existing triangles and cannot extend geometry beyond it.

The renderer rejects the unused corners of its broad inverse-map rectangle
before allocating a texture. The helper is conservative; it is not an exact
raster occlusion test. No sprite overhang can require offscreen ground pixels,
and the full old prefetch guard remains larger than the 2px fragment fringe.

The real `TerrainSurface` generated 1,787,300 triangles and 5,361,900 projected
vertices across 1,620 chunks in 40 flat, raised, ramp, cliff and map-edge maps.
Every front-facing vertex fits. Widths/heights include 1, 15, 16, 17, 31, 32, 63,
65, 96 and 256. Every original terrain method—including bake, fog topology,
alpha, geometry, material selection and picking support—remains byte-identical.
Only the envelope helper is added. The scene delta stays inside `terrainFrame`.

The exact frozen/candidate admission methods were executed with counted raster
and disposal stubs. Required visible chunks were computed from the actual
original fragment bounds, rather than the new helper. All 48 viewport/UI/zoom
rows preserve those visible fragments, as do center/corner camera courses with
±3px shake. No GPU was allocated and no browser was opened by these tests.

## Viewport-first ordering

`terrain-priority-candidate` includes the same envelope and separately orders
admission by viewport intersection, distance from the viewport center, then
stable y/x coordinates. It spends the same two-bake allowance on visible ground
before prefetch. Geometry and zIndex values are unchanged.

**Creation order does change.** Pixi sorts equal zIndex values stably by prior
child order, so equality of warmed native shared-edge/fog pixels is not proved
by geometry equality. Native before/after tests must check seams, raised faces,
shadows, fog boundaries and actor overlap. Pending startup/pan pixels also need
review because the subset painted on each initial frame intentionally changes.

Centered 256² map, UI100%, minimum zoom .45:

| Window | Old chunks | New chunks | Old → new nominal RGBA MiB | Old → envelope-only → prioritized full coverage calls |
|---|---:|---:|---:|---:|
|1280×720 |144 |82 |313.97 →178.79 |52 →34 →14 |
|1600×900 |196 |110 |427.35 →239.84 |74 →47 →16 |
|1920×1080 |256 |142 |558.17 →309.61 |101 →63 →25 |
|2560×1440 |256 |180 |558.17 →392.46 |109 →82 →41 |

First visible coverage is call1 in these prioritized cases; the original first
coverage is calls21, 25, 28 and 20. These are counts of render calls under the
two-bake cap, not milliseconds, FPS or load-time measurements. Nominal RGBA
counts one texture-sized allocation and excludes backing copies/overhead.

Residual memory remains substantial because the old prefetch guard is retained.
At normal zoom, the 1920×1080 example becomes 32 active chunks instead of64;
the2560×1440 example remains46. The inactive LRU cache can retain up to36 even
when fewer are active. On the96² map, minimum zoom still admits all36 chunks.

There is a real cache/teleport tradeoff: from the first centered256² view, the
original has the whole map cached and shows the first remote corner in one call;
the reduced candidate needs10. Later corner transitions in that course take
8–10 calls for the candidate versus20–32 after original-cache evictions. No
universal improvement to every pan/teleport is claimed. Include center-to-corner
teleports in the actual browser review.

## Combined private source for root's product build

`combined-candidate/client/src/render` contains exactly three implementation
files. It combines the reviewed palette candidate, culling reentry correction,
envelope/viewport-first admission, and root's unchanged art residency candidate
from `6b49db7`. It moves `art.trim(now)` to the end of `render`, after tactical
placement and minimap reads, retaining the every60-frame cadence. Combat trim
retains its prior position.

| File | SHA256 |
|---|---|
|battlefield.ts |60a925f92a6a15d68a837c75b56a1d3148f48738d04cda79e94c1cbcb8b7069a |
|terrain.ts |de219a85e70a1cb9ed02ec41ab7eb7d3e40a780fa375649eac16ffc8a5d0c005 |
|art.ts |ea018ee1df9aaddb3a42b34d530cf188929049bc551a47ebef809990a5ce49f8 |

All 498 existing runtime tests pass with serial test execution, and both app and
runtime TypeScript checks pass. All 137 live source inputs remain unchanged.
`trim-caller.mjs` executes the exact combined render method with recorded page
consumers: frame60 trims after environment, actor, shadow, combat, placement and
minimap reads using the same frame timestamp; frames59 and61 do not trim.

Independent source review of root's art API found no blocking defect. The
placement ghost requests each displayed beauty/team frame on every draw, and
actor/environment/death/shadow paths also touch current pages. Editor handles
own a separate ArtLibrary. Pending pages and later-reused eviction candidates
remain protected. No-argument trim retains the ten-second policy. Root's eight
lifetime tests and 498-test/TypeScript results are bounded Node/source evidence,
not GPU qualification. Required active/pending pages can exceed the soft target;
alternating animation pages may churn when their working set exceeds it.

Root's actual ordinary package still contains incomplete95-ID art. The browser
worker's separate resource course reports released scene WebGL objects on menu
return, but its overall course remains failed on a retained-validator worker
assertion. That is not renderer acceptance and is not altered by this evidence.

## Reproduction

```sh
node work/renderer-performance-v1/tests/terrain-admission.mjs
node work/renderer-performance-v1/tests/terrain-admission.mjs --priority
node work/renderer-performance-v1/tests/combined.mjs
node work/renderer-performance-v1/tests/trim-caller.mjs
```

The combined check creates an ignored private test stage. Its non-client fixture
directories are readonly symlinks to root's frozen art-residency test support.
No runtime check uses the wrong `dev/game` workdir. Browser, actual Go transport,
final artwork, cold offline package, physical hardware/LAN and release gates
remain separate and open.
