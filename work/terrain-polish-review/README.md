# Terrain polish v1: independent source review

2026-09-29. Read-only review; no candidate/live source edits, compiler, native test, or browser launch. The independent locked Go campaign matrix continued throughout. This is not rendered acceptance.

Reviewed candidate `work/terrain-polish-v1/source/client/src/render/terrain.ts` (declared SHA-256 `8f6524d761bae054bd80b220f02ca4d6b96ff64449134c51ea543bcb93507a73`), its `HANDOFF.md`, and live baseline `client/src/render/terrain.ts` (`52d20cd00f5f3fbfc0f922661e929dbfb17f434463703914e60c213e0bdead69`). Also followed `terrain-surface.ts`, `battlefield.ts`, the application frame subscription, and the installed Pixi mesh/batch/texture/shader implementations.

## Disclosure conclusion

No source-level lighter-fog path was found. With exact interpolation and the installed clamp-to-edge, non-mipmapped linear texture behavior, every triangle has opacity at least its old `surfaceFogOpacity`:

- Each vertex uses `max(base, pointFogOpacity)`. Shared top corners inspect all incident in-map tiles. Top centres inspect their own tile. A cliff face retains the maximum of its owner and neighbor even before the incident-point maximum.
- For nonzero alpha, the ramp sample coordinate in texels is `256*u - 0.5 = alpha + 0.25`; interpolation is convex and the ramp is monotonic. A base-175 triangle therefore has a mathematical minimum sample of175.25. Every base-255 triangle has all three UVs at255.75/256 and clamps to255. Base0 permits any nonnegative opacity.
- Valid surface geometry lies within the closed map rectangle. Ignoring off-map incident cells cannot reduce `base`, including exterior faces. Missing visibility/exploration entries fall through to255. There is no new entity or private-state read.
- Interior cliff breakpoints preserve the exact integer tile-line coordinate on one axis. Endpoints have exact integer grid coordinates on both axes; the other breakpoint coordinate lies inside that tile edge. The incident-tile lookup therefore includes the relevant owner/neighbor. Coincident ground points on different-height cliff vertices still use the same incident maximum.
- Geometry, indices, depth ordering, face visibility and batch mode are unchanged. The new texture is released through the same baker lifecycle as the old palette. New fragments initialize opaque before receiving the current snapshot.

This proves the CPU construction and ideal sampling inequality, not an untested GPU precision guarantee. Pixi's batch attributes retain Float32 UVs; the three endpoint UV values are exactly representable binary fractions. Its default GL fragment precision is nevertheless `mediump`, and the handoff's specific “roughly0.1 texel” error estimate is not established by a device measurement or a documented bound in this implementation. Do not promote that estimate to a cross-device proof. No actual precision leak has been reproduced.

## Concrete cost scope correction

`battlefield.ts:updateFog()` runs after every distinct snapshot tick, not only when the fog arrays change. It visits **all resident chunks and fragments**, including chunks hidden after camera movement. The application sends every runtime snapshot directly through its frame listeners; the separate100ms HUD throttle does not throttle these renderer updates. Camera frames do not independently rerun fog for existing chunks, but newly admitted chunks run an initial opaque update and then the actual snapshot update.

The normal offline timer emits a frame after at least four simulation ticks (`worker.ts`), ordinarily5Hz at1× speed. Request-driven frames, replay speeds and network delivery differ; the scope here is per delivered distinct-tick snapshot, not an assumed20Hz renderer update.

The36-chunk eviction target is **not a hard maximum**: eviction skips currently wanted chunks. Zoomed-out/padded camera coverage can keep more than36 chunks resident. Fragment viewport culling affects drawing, not this fog-update loop.

For an ordinary interior top triangle, the old code performs one tile-opacity query. The candidate performs ten: base1 + centre1 + two corners4+4. Each query can read both visible and explored arrays. The repeated coordinate division/floor/integer checks are additional work. Thus the handoff's3–5× estimate is not a bound; its6–14 “array reads” describes tile queries rather than literal reads. For36 full flat chunks alone, the top triangles require368,640 tile queries per update versus36,864 previously, before cliffs. These are operation counts, **not measured milliseconds**.

Smallest validation: instrument total `setFog` time, resident/drawn chunk counts and triangle count per delivered snapshot, after a pan that retains hidden chunks and at minimum zoom on the largest map. Compare the same source/runtime, camera and fog sequence. Do not infer cost from one visible chunk or unchanged draw-call count. If measured cost matters, first cache incident tile indices/shared corner opacities or avoid unchanged-fog work with correct invalidation; any visibility-only lazy update must refresh before a hidden chunk is shown.

## Smallest required rendering checks

1. Render the **fog pass alone** over an identical backing surface for old/new. Check alpha lower bounds0/175/255 at triangle interiors and shared edges, including four-way mixed corners, cliff breakpoints, unknown arrays, exterior faces, chunk edges and subpixel camera translations at zoom0.45/1/1.8. Include Chromium, Firefox and WebKit and the actual GL precision returned by each.
2. Keep the macro setting identical for that comparison. Handoff B1's “visible interior pixels identical” and “after <= before luminance” are invalid as written when the same candidate also changes macro alpha0.65→0.35. Fog opacity and composite luminance are different assertions; even a dark backing pixel can become lighter under more opaque colored fog. Validate macro appearance separately.
3. Exercise perspective change/rewind, visible→unknown and unknown→visible, hide/show cached chunks, terrain invalidation and disposal. Preserve the existing depth/picking/unknown-pixel gates. There is no demonstrated reason to relax them.

No production fix is requested from source inspection alone. The conservative CPU policy is sound; GPU precision and whole-renderer cost remain explicit acceptance gates.
