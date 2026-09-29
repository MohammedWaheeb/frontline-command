# Terrain privacy and lifetime baseline

Baseline inventory only. The presentation candidate's final diff has **not** been reviewed; await the final author report and exact-model audit. No new browser, test, native host or renderer edit was made for this inventory.

## Accepted source and data boundary

Current `client/src/render/terrain.ts` hashes to accepted v4 `65421e5ee2ab54339a0f804c5936df01c8521105018c58a4105f21234818c656`, matching the promotion receipt. `baseline-lock.json` pins current public-surface dependencies and all existing acceptance receipts.

The baker uses immutable public-map terrain geometry/materials. Fog receives only current public `visible[]`/`explored[]`; it does not query actors or hidden simulation data. Missing tile elements become unknown. Tile opacity is0 visible,175 explored,255 unknown. The same exact projected triangles/indices cover terrain and fog; faces use the more restrictive adjacent public tile. Visible-triangle vertices take the maximum surrounding public opacity so interpolation softens toward visible ground without exposing unknown/explored geometry. Unknown and explored triangles keep constant opacity; this prevents MSAA extrapolation from making the edge more transparent. Flat/raised geometry, ground picking and chunk bounds remain the accepted public surface.

Cached fog invalidation compares current **opacity values**, not array identity, tick, faction or stale retained perspective. It includes triangle neighbors and vertex-only neighboring tiles across chunk boundaries. Reused mutable arrays, new perspectives, rewind, hidden updates, show-after-hide and missing→filled transitions must all produce the current public result. Fresh fragments initialize with empty arrays (unknown), never stale prior-game fog.

Ownership remains separate: a fragment destroys its own terrain/fog MeshGeometry and meshes; callers own baked chunk textures; baker-owned face textures and ramp texture release only after fragments are gone. The v4 helper returns compact typed topology arrays; temporary Maps are not retained by fragment closures. New presentation caches must preserve these lifetimes and must not retain snapshots/entities indirectly.

## Existing proof, not rerun now

| Gate | Exact bounded evidence |
| --- | --- |
| CPU output equivalence | v4 vs accepted v2 `968299e…`: six courses.1,288 flat/raised/edge boolean states;324 chunk/perspective/in-place/missing/hide/show/rewind states over474 fragments;972 single-dependency changes including outside-chunk/vertex neighbors; public-array-only reads; geometry rebuilds; unchanged visibility correction. Float32 UV/upload bytes and geometry compared exactly. |
| Actual GPU fog conservatism |96 cases each in bundled Chromium151.0.7922.34, patched Firefox153.0 and WebKit26.5. Flat+raised/cliff, unknown/clear/explored/frontier/corner/missing, zoom.45/1/1.8 and fractional offset. No lighter candidate alpha, no lost opaque pixel, clear visible interior stays clear; geometry/picking equality, hide/show restoration and disposal pass. |
| GPU baseline distinction | Those pixel courses compare candidate v4 against original flat-opacity baseline `52d20cd…`, **not** against the CPU v2 baseline. This establishes conservative fog alpha; it does not assert all shaded material pixels are identical. |
| Runtime cache behavior | CPU unchanged-opacity calls produce zero UV uploads; frontier changes update only dependencies. Diagnostics cover196 chunks,12,152 fragments/200,704 triangles. They are not a quiet full-frame performance gate. |
| Temporary allocation lifetime | Node/V8 WeakRef+explicit-GC diagnostic:62 tile-slot Maps and62 point Maps become unretained while fragments remain live, and all tracked allocations release after disposal. This is not a proof for every browser GC implementation. |
| GPU disposal | All three engine receipts show canvases0, fragment mesh destruction and owned texture destruction; final page/HTTP/request diagnostics are0 and source input locks unchanged. |

All referenced receipt hashes were rechecked during this inventory. Historical geometry/product evidence in `docs/terrain-height-integration.md` includes actual Go visibility, save/restore and raised-ground placement, but those older runtime/build scopes must not be relabeled as acceptance of a forthcoming presentation change.

## What final presentation review must preserve

- No new access to hidden actors, enemy-private ammo/home/order/timers, unobserved map objects or stale snapshot fields merely to improve appearance.
- Unknown terrain stays opaque; explored appearance never becomes actual present visibility. Material styling may change luminance, not fog truth.
- Current public values must update on perspective/rewind/cull transitions; no identity-only memoization.
- Drawing decoration must not modify shared public arrays, surface geometry, input projection or engine state.
- Any newly cached texture, filter, shader, event listener or async work needs an explicit owner and dispose/cancel boundary. Borrowed ArtLibrary pages must not be destroyed by a presentation consumer.
- CPU equivalence and existing GPU receipts remain baseline evidence. A new shader/alpha/blend/filter change needs source-specific pixel privacy checks; a purely style change is not automatically privacy-safe. Rendering a clearer visible interior must not erase unknown edge coverage.

Native screenshots support bounded appearance review only. No final subjective art, named stock-browser compatibility, completed roster, physical GPU memory total or long-session performance acceptance is inferred here.
