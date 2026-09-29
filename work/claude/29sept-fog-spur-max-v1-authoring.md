# Fog-spur MAX fill: private source candidate (v1)

**Author:** Claude, exact `claude-opus-5-5` (no fallback).
**Date:** 2026-09-29.
**Status:** authored only. Nothing was compiled, run, rendered or captured. No test or gate is claimed to pass.

## Scope

I wrote only these three files:

| File | Purpose |
|---|---|
| `work/claude/fog-spur-max-v1/candidate-terrain.ts` | Candidate fog source |
| `work/claude/fog-spur-max-v1/fog-spur.test.ts` | CPU source tests (node:test) |
| `work/claude/29sept-fog-spur-max-v1-authoring.md` | This report |

I edited no live, combined, frozen or evidence file. I used no Bash, browser, Blender, subagent or deployment.

**Base.** The candidate is `work/renderer-performance-v1/combined-candidate/client/src/render/terrain.ts` copied line for line, with changes in only two functions and their doc comments:

1. **`fogTopology`**
   - The doc comment gains two sentences about the new scalars and cardinal coverage.
   - The return object gains `fogWidth:width,fogHeight:height`.
   - Every typed array and the construction logic are unchanged.
2. **`fogVertexAlphas`**
   - The doc comment gains the spur rule and its memoization argument.
   - The body gains a `joined(tile)` read of in-map cardinal visibility and a per-triangle `fill`.

Everything else is intended to be byte-identical: imports, `pointFogTiles`, `tileFogOpacity`, `FOG_FAN_CENTRE_CAP`, the `TerrainBaker` class, `setFog` and its comments, mesh geometry, depth/zIndex, materials, the UV ramp, the `(alpha+.75)/256` mapping, the minimap and admission code. I retyped the file rather than copying it with a tool, so **root must diff it against the frozen file** and accept only the hunks above.

The imports stay exactly `./iso`, `./art`, `./terrain-materials`, `./terrain-surface`, `../runtime` and `pixi.js`. Root must resolve them to the frozen render dependencies, for example with a disposable copy or bundle alias. The tests import:
- `./candidate-terrain`;
- the frozen `../../renderer-performance-v1/combined-candidate/client/src/render/terrain` as the comparison baseline. It needs the same resolution support;
- `../../renderer-performance-v1/candidate/client/src/render/terrain-surface` for `TerrainSurface`. Root should confirm this is the exact surface module the combined candidate is built against.

## The rule

The rule applies to a top triangle whose tile is currently visible (`base===0`). It computes the tile's four corner alphas as before, where each corner is the darkest tile touching that ground point. If all four are greater than 0 **and** at least one in-map N/E/S/W neighbour is visible, all three vertices of that fan triangle become `max(corners)`, which is 175 or 255. Both depth fragments of the fan decide from the same tile corners and neighbours, so all four fan triangles receive the same constant.

Every other case keeps the frozen path exactly:
- solitary sightings (no visible cardinal neighbour), which keep the capped 128 centre;
- visible tiles with any clear corner;
- remembered and unknown triangles;
- face triangles.

**The prior MIN proposal stays disproven.** `work/renderer-performance-browser-v1/prepared/fog-proposal-counterexample.json` still stands. MIN fill lowers a 255 corner to 175 and lowers the interior sample from 203.25 to 175. Test S0 reproduces the recorded frozen alphas and shows MIN < frozen at both points. MAX gives 255 on all four fan triangles, with the interior sample at 255.

## CPU reasoning (vertex values only)

For a filled fan, let M = max of the four corners.
- **Corner vertices:** frozen value = `pointAlpha(corner)` ≤ M.
- **Centre vertex:** it lies strictly inside the tile, so `pointFogTiles` returns only the tile itself, and its point alpha is 0. The frozen centre is `max(0, min(128, mean(corners)))`. Since every corner is at least 175, this is ≤ 128 < M.

So every filled vertex is ≥ its frozen value. No other triangle's CPU alpha changes, so no CPU vertex decreases anywhere, and remembered, unknown and face vertices are bit-identical.

**Memoization coverage.**
- The N neighbour touches the NW and NE corner points. E, S and W each touch two corners the same way. `fogTopology` already runs `pointAt` on all four fan corners of every top triangle, so every in-map cardinal neighbour is already a `fogTiles` slot. This holds in each fragment, including across chunk seams.
- `tileFogOpacity` is 0 exactly when `visible[n]` is truthy. So any change to a neighbour's visibility changes its slot opacity, and `setFog` recomputes.
- `joined` reads `visible` directly. It uses the same truthiness as `tileFogOpacity`, bounded by `fogWidth`/`fogHeight`, and reads at most 4 elements per visible top triangle. It reads nothing outside `fogTiles`.
- There is no new entity, state or retained cache.

**MAX fill proves CPU vertex nondecrease only.** It says nothing about the pixels the GPU produces.
- Pixi's fog `vUV` is not centroid-interpolated. At antialiased (MSAA) boundaries a sample may be evaluated at the pixel centre outside the triangle, which extrapolates the old varying fan.
- Example: an old 175 fan with a 128 centre, extrapolated outward past a corner, exceeds 175. The new constant 175 is then lower than the old sample.
- Linear ramp filtering and the `(alpha+.75)/256` offset add further differences.

I make **no v4 or v5 pixel-monotonicity claim**. I do not waive or relabel any historical failure:
- the v4-monotonicity gate failure (up to 13 alpha on raised geometry);
- the v5 strict aggregate failure;
- the failed memory courses.

## Expected memory and CPU cost

- **Retained per fragment:** two small-integer properties on the existing topology object, about 16 bytes or less. There is no new typed array. The P4 `fogFanNeighbours` `Int32Array` would have cost 16 bytes per triangle; this avoids it.
- **Per recompute:** one short-lived `joined` closure per `fogVertexAlphas` call, like the existing `pointAlpha`.
- **Per visible top triangle:** two extra min/max operations per corner, plus up to four boolean reads, and only when no corner is clear.
- Geometry, GPU buffers and texture counts are unchanged.

## Remaining tradeoffs

- **Dark patches.** A filled spur becomes as dark as its darkest surrounding fog. At 255 a currently visible tile looks the same as unknown ground.
  - This covers disk axis poles, 2-tile bars and every tile of a one-tile-wide visible corridor (test S8).
  - Before, these showed a dim 128 centre.
  - Units should still draw above fog because actor order is unchanged, but that is not verified natively.
- **Hard step inside visible ground.** Mesh vertices are unshared. Where remembered and unknown tiles mix around a spur, the spur's constant M (for example 255) can meet a visible neighbour's feathered value at the same point (for example 175), leaving a hard edge. With uniform surroundings the values match, as at the disk poles in S6.
- **Diamonds that remain by design.** Solitary sightings and diagonal-only contacts, such as a checkerboard, keep the detached 128 patch.
- **Map corners.** A spur on a map corner keeps its frozen feathering, because the outer corner touches only visible in-map tiles and stays clear.

## Tests authored (not run)

| Test | Covers |
|---|---|
| S0 | Recorded counterexample reproduced; MIN lowers a vertex and an interior sample, MAX lowers neither |
| S1 | All 19683 3×3 masks, flat and raised (with face triangles). Exact oracle: filled fan = constant MAX, every other triangle = frozen. Protected triangles are equal and no vertex drops. The 6561 centre-visible masks check no bright centre on filled tiles and unchanged solitary centres |
| S2 | Solitary sightings, unknown and remembered, across both depth fragments; checkerboard; map corner/edge lone tiles |
| S3 | Existing straight-edge (both axes) and interior-clear cases equal frozen exactly, including the centre = edge/2 values |
| S4 | Raised/cliff random views on 37×21 (multiple chunks): remembered, unknown and face vertices are exact, and only spur fans change |
| S5 | Candidate typed arrays equal frozen; `fogWidth`/`fogHeight` are correct; every in-map cardinal is in `fogTiles` for several map shapes; scrambling every non-dependency tile leaves the output unchanged; spurs across chunk seams at x=16, x=32 and y=16 and along map edges fill; map-corner pairs do not |
| S6 | Disks r=2..14 with none/ring/all memory: poles previously had a bright centre and are now MAX-filled (255 unknown, 175 remembered); no cardinally joined no-clear-corner tile is non-constant |
| S7 | In-place shrink, regrow, rewind (memory shrinks), seam neighbour toggling and sparse random flips, run through a copy of `setFog`'s changed-tile memo model. Each step equals a fresh recompute and `fogNeeded`. The model is not the Pixi closure itself |
| S8 | The one-tile corridor fill, recorded as the tradeoff |

**Effect on the existing live suite.** If `client/tests/runtime/presentation-polish.test.ts:72-88` ("only fan centres rise") is run against this candidate, it is expected to fail: filled corners rise. S4's oracle replaces it. The lone-tile (90-96), coplanarity (50-63), interior-clear (65-70) and topology (98-108) tests are expected to hold.

## Unrun gates (all owned by root)

1. Byte diff against the frozen combined-candidate `terrain.ts`, and type-check with the disposable support.
2. These source tests, and the existing presentation-polish suite.
3. The strict original privacy floor at zero tolerance.
4. Protected-triangle equality (the 192-comparison GPU fixture).
5. v5→candidate GPU monotonicity, with v4 reported separately and unchanged.
6. Native captures for:
   - the actual visible unit on a filled spur (actor above fog);
   - spur and seam cases;
   - opening at 1600×900/100% and 1280×720/150%;
   - zoom 0.45/1/1.8.
7. Disposal: zero canvases, geometry and textures.
8. Renderer performance and memory benchmarks.

Authoring earns no appearance or privacy result.
