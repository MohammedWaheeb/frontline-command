# Sprite bodies and shadows on raised terrain

Status: the three-engine geometry courses, actual-Go parking snapshots and full
renderer regression pass. The bounded renderer/ink correction is accepted;
maximum-load simulation timing still misses the target in repeated courses. No Go, map, physical footprint,
image pixel, world scale or anchor was changed by this renderer work.

## Observed defects

The first actual-Go parking browser scenes clipped intact aircraft against flat
terrain. Terrain's top triangles sort by their world-space centroid, while a
sprite previously sorted from its actor centre alone. Transparent canvas size is
not a useful physical extent: an aircraft's painted lower edge can extend beyond
that centre. The same defect affected whole billboard shadows. The rejected
browser and initial63/192-position body result are preserved in
`work/art/go-parking-browser-overlay/browser-v1` and
`work/art/sprite-terrain-depth/2026-09-28T12-31-26.491Z`.

The optional `ink_bounds` metadata measures alpha-at-least-one pixels separately
at each final atlas scale. Beauty/team share their union; shadows use their own
ink. Root consumes the exact lower painted extent with the existing terrain fan's
centroid bound. Missing metadata keeps the previous compatible path. Foreground
cliffs still occlude a rear body. The metadata proposal, unchanged-PNG proofs and
historical migration inventory belong to `work/art/sprite-ink-bounds/`.

## Shadow projection and ownership

`SurfaceShadows` stamps actual visible actor/scenery shadow plates into one
viewport-bounded texture, then samples it through the existing public terrain top
triangles. It does not paint cliff faces or unknown tiles. Static terrain meshes
are reused as actors move. Only already-authorized actors and scenery enter the
stamp; the exact current visibility mask controls the receiving geometry.

Known service-deck plates use separate clipped geometry so their support height
does not invent a whole terrain plateau. The outside pieces retain real ground
heights. These plates cache their geometry individually; moving one does not
reclip all stationary aircraft. Both paths draw above their receiving terrain and
below its fog. Fading corpses use their real remaining presentation alpha.

The manager owns only its meshes, geometry, sprites and temporary render texture;
it borrows the actor/scenery atlas textures. It excludes evicted/destroyed sources,
clears on feedback reset/context loss, and destroys its resources at scene end.
Large/retina windows have a32MiB temporary-texture ceiling and4096-pixel dimension
cap; this reduces only soft-shadow raster resolution. A requested allocation key
avoids reallocating every paused frame when Pixi rounds fractional dimensions.

Independent review caught two correctness defects before promotion: a fixed
viewport guard missed height4 shadows at high zoom, and a32-bit visibility hash
could collide. The guard now includes actual maximum terrain elevation, and
visibility uses an exact mask comparison. Concrete collision inputs are retained
in `work/evidence/shadow-review/visibility-hash-collision.json`.

## Evidence and limits

- Chromium151, Firefox153 and WebKit26.5 each pass1,152 combined body/shadow
  comparisons: three actual aircraft types, both atlas scales,64 sub-tile positions
  and three zoom levels. Original authored pixels, sorted against flat terrain,
  match the forced-front baseline. Each also checks six fore/rear cliff samples.
- All three engines pass slope/cliff projection with no vertical-face leakage,
  unknown-terrain suppression, height4/high-zoom viewport edges, the concrete
  visibility collision pair, real atlas eviction/reload, and complete disposal.
  A large fractional allocation stays at26,793,360bytes with one stable texture ID
  across three paused updates.
- Real unchanged shadow plates for688 synthetic actors/1,696 cosmetic plates
  exercise the moving-ground path. On this M4 host, Chromium update medians are
  0.9ms for one moving plate and1.2ms for all mobile plates. Firefox reports3/3ms;
  WebKit1/3ms. This is CPU update cost, not complete rendering FPS.
- A separate64-plate/16-known-service-deck course measures stationary, one-moving
  and six-moving work. Chromium medians are0.1/2.3/3.1ms; Firefox0/7/8ms;
  WebKit0/4/5ms. Browser timer precision differs. These separated synthetic decks
  test clipping cost and reuse, not legal Go placement or full service animation.
- The six exact-Go parking saves pass nine browser captures: six native1× and
  three2×. Root inspected all six native scenes and accepted intact bodies,
  spacing and shadows. Two IR.strike samples remain explicitly labelled legacy
  flight-pose references; sparse diagnostic sheets are not complete aircraft art.
- All14 existing renderer groups pass, including actual save/restore during
  graphics-context loss, input suppression until recovery, turret shadow
  composition and five repeated scene disposals with zero canvases/pages.
- The real maximum-load course exposed `fields:null` in a valid Go map.
  Environment knowledge now treats that empty slice as empty while accepting
  later disclosed shipment cargo. Its regression passes with334 runtime tests and
  both TypeScript checks. Later advice work adds its own five tests independently.

The first CPU-only shadow implementation passed its pixels but failed the same
synthetic688-actor cost test (one-moving median65ms, all-mobile318ms). It is
preserved as `cpu-shadow-candidate.ts`, not promoted. The13:01 Firefox course and
second product-load attempt were deliberately interrupted during severe host
contention. Their reports remain failed/interrupted and are not performance or
gameplay passes. The first product-load report preserves the empty-field crash.

Current exact source receipt and all six browser reports are indexed in
`work/art/sprite-terrain-depth/acceptance-summary.json`; source copies are under
`source-final/`. The final fixture typecheck removed unused identity properties
from a synthetic surface object without changing dimensions, tiles or production
source. Reports remain tied to their own actual fixture bundles.

The existing maximum-load save/runtime is historically0.3.1 and must retain that
label. Final complete-art/current-runtime performance, long matches, physical LAN
and the specified reference hardware remain separate release gates.

## Maximum-load investigation, 28 September

The quiet hardware course `product-load-gpu-quiet-v3` preserved all native hashes,
restores and disposal checks, but its600-tick segments took56.914/66.657seconds
(10.542/9.001TPS). Its JSON `status: passed` described those functional assertions;
it does **not** establish a performance pass. A five-file pre-depth renderer
comparison, `product-load-pre-depth-v4`, also fell below target at12.801/9.605TPS.
Both used the same frozen04:18 art, historical0.3.1 WASM and opening save. The
historical20TPS result remains historical; a broad regression or host contribution
is still unresolved. No thermal warning was recorded, which does not prove the
absence of throttling.

The main-thread profile v6 identifies repeated static mesh packing after the
shared ground render group changes. See [the independent analysis](renderer-profile-v6.md).
The v7 worker-call probe also measures26.09seconds inside150 real Go four-tick
calls and13.81seconds inside223 real Go view calls over a48.40second segment.
Snapshot renderer updates account for1.05seconds. These instrumented elapsed
times include scheduling contention; they do not attribute all lost time to one
component. The test prefix changes no arguments, results, orders, or ticks.
The first v6 worker totals were reset by its final restore and cannot measure the
whole course; v7 retains pre-restore totals. The interrupted v5 report is preserved.

A bounded candidate now skips terrain fragments whose exact projected geometry
lies wholly outside the viewport, with a two-screen-pixel antialias guard. Chunk
admission remains conservative, and the fragment bounds include raised tops and
cliff faces. Chromium151, Firefox153 and WebKit26.5 each pass75 pixel comparisons
against rendering every fragment: three zoom levels, five camera offsets, public
height maps, visible/edge fog and alternating-height stress terrain. Picking,
occlusion and disposal checks also pass in those same courses. Evidence is under
`work/art/sprite-terrain-depth/culling-*-v1`. The first unprofiled600-tick hardware course (`product-load-culling-v8`) reached
19.9997TPS, with RAF p95=17.7ms/p99=18.5ms and no frame above50ms. The final two
consecutive courses (`product-load-culling-final-v9`) ran at19.1505/19.7620TPS,
with p95=17.8/17.7ms and p99=18.7/18.6ms, again with no frame above50ms. All
native hashes, restores, console and disposal checks pass. The20TPS target is
**not consistently met**. This is an accepted rendering improvement, not full
performance acceptance. Culling reduces this scene's3038 admitted fragments to
928 drawn fragments, and150528 vertices to48600. It does not lower gameplay
limits or alter visibility rules.

The exact13-file culling receipt is
`f807d7d7088fe3aa67cc91557fb4eed33e48fa98b14252191dbecabebeecf503`
in `culling-source-v1/`. Later nonfunctional evidence-path handling uses
`path.resolve` so an absolute output directory is respected. The completed
14-group report was moved from the accidentally nested output location into
`culling-full-renderer-final/`; its report bytes and results were not modified.

The separately proven ink metadata was then published at a coordinated clean
boundary:67 existing exports plus two independent staged aircraft exports,
834 atlas descriptors and50646 independently recomputed bounds. All834 packed
PNG and25323 raw PNG hashes remain exact; old exports and locks are archived.
See `work/art/sprite-ink-bounds/promotion-v1/README.md`. A new full14-group run
against the published metadata also passes (`post-ink-full-renderer`), including
save-preserving context recovery and five disposals with zero retained pages.
Complete roster, service animation and final art quality remain open.
