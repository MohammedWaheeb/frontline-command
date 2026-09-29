# Terrain/shroud polish candidate v2: handoff

- Author: Claude, exact `claude-opus-5-5`, no subagents, isolated authoring only.
- Candidate: `work/terrain-polish-v2/source/client/src/render/terrain.ts`
  - started from v1 sha256 `8f6524d761bae054bd80b220f02ca4d6b96ff64449134c51ea543bcb93507a73`
  - now sha256 `968299e854349a7463f00d6b4cf7676b2cb035d2b4a3fbd46b62c50207980876`
- Unchanged, re-hashed after the edit:
  - v1 `work/terrain-polish-v1/source/client/src/render/terrain.ts` is still `8f6524d7…93507a73`.
  - Live `client/src/render/terrain.ts` is still `52d20cd0…0bdead69`.
- Input: failed report `work/terrain-polish-review/chromium-01/browser.json`.

**Status: source authoring only.** Nothing was built, type-checked, tested or
rendered. The synthetic alpha course and all three browsers still need to run,
so no pass is claimed. No other file was written. The source is released.

## What failed and why v1's reasoning was wrong

- **What failed.** Flat geometry, `edge` mode, zoom 0.45, offset 0: 112 pixels
  went from 175 to 174. `corner` mode also went lighter: 84 pixels at offset 0
  and 4 at offset 0.375. `maxDrop` was 1 in every case. No unknown pixel lost
  opacity, and clear interiors stayed exactly clear.
- **Why v1 was wrong.** v1 claimed that barycentric interpolation is convex, so
  a +0.25-texel bias would be enough. That is false under MSAA:
  - the fixture and the renderer are antialiased;
  - Pixi's batch `vUV` is ordinary `smooth`, not `centroid`;
  - so a partly covered edge pixel evaluates `vUV` at the pixel centre, which
    can lie outside the triangle.
- **Boole's measurement.** At pixel (1044.5, 363.5), the barycentrics were
  [1.006944, 0.013889, −0.020833] for vertex alphas [175, 175, 255]. That
  extrapolates to 173.583, below every vertex. Precision was not the cause:
  mediump and highp both have 23 bits here.
- **Why a bigger bias doesn't fix it.** The overshoot grows with the alpha
  difference across a triangle and with how thin the triangle is on screen
  (cliff faces). No fixed global bias is a proof that works for every geometry.

## The change

Explored (175) and unknown (255) triangles are constant again: all three
vertices get `surfaceFogOpacity`, which is the old base opacity. The inward
vertex feather now applies **only** to triangles whose base is 0 (visible).

### Exact changed lines (v1 → v2)

**Lines 119–120 (ramp comment only).** Before:

```ts
   // Texel i has alpha i. The ramp is monotonic, so linear filtering between
   // vertex values never samples below the lowest vertex alpha of a triangle.
```

After:

```ts
   // Texel i has alpha i. Constant-u triangles sample their own texel; clamped
   // addressing keeps extrapolated u on visible triangles at or above texel 0.
```

**Lines 153–160 (setFog comment).** The v1 comment, which claimed the
quarter-texel bias was enough, is replaced by one that states the constant-base
guarantee, the MSAA/non-centroid reason, and the visual tradeoff.

**Line 162 (the only logic change).** Before:

```ts
alpha=Math.max(base,pointFogOpacity(v.x,v.y,width,height,visible,explored))
```

After:

```ts
alpha=base!==0?base:pointFogOpacity(v.x,v.y,width,height,visible,explored)
```

When `base` is 0, the two forms are equal. When `base` is 175 or 255, every
vertex is now exactly `base`.

Everything else in the file is unchanged:

- the u mapping `(alpha+.75)/256`, with 0 → `u=0` and `v=.5`;
- the ramp texture, the `fog.visible`/`fogNeeded` logic and the buffer update;
- geometry, indices, UV ground mapping, depth and `zIndex`, bounds, picking and grouping;
- `batchMode`, disposal, the `TerrainFragment` API and `pointFogOpacity`;
- the macro 0.35 change.

There is no custom shader and no refactor.

## Guarantee and its limits

1. **Explored and unknown triangles are identical to before, sample by sample.**
   All three vertices share one `u`, so any barycentric combination, including
   extrapolation outside the triangle, gives that same `u`, apart from float
   rounding of a constant. The all-explored constant triangles that already
   passed in the real GPU run use exactly this path, with the same
   `(alpha+.75)/256` value. At 255 the `u` is past the last texel centre and
   clamps to 255.
2. **Visible triangles can only get darker.** Their baseline is 0. Feathered
   vertex values are 0 or more, and extrapolated `u` below 0 hits the ramp's
   `clamp-to-edge` addressing (Pixi's `TextureStyle` default, not overridden),
   which returns texel 0 (alpha 0).
3. **Resolved pixels.** An MSAA edge pixel averages samples from neighbouring
   triangles. The explored and unknown samples are unchanged, and the visible
   samples are 0 or more. So the resolved alpha is at least the baseline, up to
   resolve rounding of the same inputs. This argument does not depend on
   triangle shape, so it also covers thin cliff faces.
4. **Unknown stays fully opaque.** A triangle whose base is 255 is constant 255.
5. **Fully clear stays exactly clear.** A visible triangle whose vertices all
   touch only visible tiles gets `u=0` everywhere, and `fog.visible` stays
   false when a whole fragment is clear.
6. **Current data on every update.** `setFog` reads the `visible`/`explored`
   arrays passed on each call. Nothing is cached, so in-place mutation between
   calls is picked up on the next `setFog`. Missing entries (including the
   initial `setFog([],[])`) read as unknown, which gives 255, the same as the
   baseline `surfaceFogOpacity`. No new data source was added.

## Visual tradeoff

- **Kept:** softening at the visible boundary. Currently visible ground next to
  explored or unknown tiles still fades from 0 at the tile centre to 175/255 at
  the shared edge or corner. This is the boundary the player looks at most
  (around their own units).
- **Given up:** the 175 → 255 fade inside explored tiles next to unknown. The
  explored/unknown boundary is the old hard, tile-shaped staircase again,
  pixel-for-pixel identical to the baseline.
- **Slightly different on faces:** a cliff face between two visible tiles
  (base 0) can still darken toward a fogged neighbouring point. A face with any
  fogged side is flat at its old opacity.
- **Result:** the review's sawtooth complaint (finding 7) is only half
  addressed. The visible edge is soft; the remembered/unknown edge stays
  stepped. Softening that edge without being lighter under MSAA would need
  either geometry that keeps varying alpha away from pixels that already had
  fog, or a shader with centroid or clamped interpolation. The brief excludes
  both.
- **Side effect:** `setFog` does less work than v1. It only calls
  `pointFogOpacity` for visible triangles.

## For root

Rerun the unchanged synthetic course
(`client/tests/render/terrain-fog-polish-browser.mjs`) with a fresh output, in
all three browsers. Check that:

- `lighter` is 0 in every mode, zoom and offset, raised and flat;
- `unknownLost` is 0, `clearNonzero` is 0 and `interiorClear` still passes;
- the macro and CPU stages, which were not reached last time, now run.

Keep `work/terrain-polish-review/chromium-01` as the evidence of the v1
failure.
