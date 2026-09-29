# Three-source fog diagnostic

The candidate preserved the original constant-fog privacy floor in all **96** tested GPU cases and exactly preserved remembered/unknown triangle images. It still failed monotonicity against accepted v4, including a raised-geometry drop of **13** alpha. No tolerance or failed-result waiver was used.

`fog-three-chromium-01/browser.json` records `floorPrivacy: passed`, `protectedTriangleEquality: passed`, `currentBaselineMonotonicity: failed`, and `status: diagnostic-complete`. The command exits **1** for the current-baseline failure. This diagnostic status is not overall candidate acceptance. Root's original `fog-chromium-01` failure and independent `fog-floor-chromium-01` pass remain unchanged.

## Immutable comparison

| Source | SHA256 |
| --- | --- |
| Original constant floor | `52d20cd00f5f3fbfc0f922661e929dbfb17f434463703914e60c213e0bdead69` |
| Accepted v4 | `65421e5ee2ab54339a0f804c5936df01c8521105018c58a4105f21234818c656` |
| Claude presentation v1 | `6820e55a251ea711e3121033c0f5264ad46c3cb1832a2064a4c511d27d3c3788` |

All source and public-surface dependency hashes are checked before and after the run. The test uses original extracted files directly, with no behavioral source transform. The browser was bundled Chromium **151.0.7922.34**, headed WebGL, actual ANGLE Metal Apple M4 backend. It is not stock Chrome154 or a performance test. The complete course ran15:10:56–15:11:09UTC on29September2026; browser and HTTP server closed before the next agent's lane.

`fog-three-source-fixture.ts` uses the same35×35 flat/raised public geometry, nine chunks, camera transforms, 1600×900/resolution1/antialias settings and bitvector sequence as the original diagnostic: unknown, clear, explored, edge, corner, missing, clear, edge; zoom0.45/1/1.8 and offsets0/.375. Arrays are mutated in place. There are48 flat and48 raised cases. World geometry/indices/bounds remain identical across the three sources; hidden-update/show restoration is checked. No game, Go view, gameplay actor or authored material image is loaded.

For each case, three complete fog images are compared. Separately, indices isolate the original remembered and unknown triangle classes while preserving their exact position arrays, UVs, texture, shader, depth and triangle order. Temporary class meshes/geometry are owned by the test, borrowing original textures. All192 class comparisons are **pixel-identical across all three sources**, stronger than merely checking opaque pixels. CPU assertions independently check protected triangles retain constant current/candidate UVs and every changed UV belongs only to a currently visible top-triangle center.

## Exact results

| Geometry | Current→candidate decreases | Maximum decrease | Candidate below original floor | Drops with original unknown coverage |
| --- | ---: | ---: | ---: | ---: |
| Flat | 9,437 | 3 | 0 | 0 |
| Raised/cliff | 5,652 | 13 | 0 | 0 |

Every observed decrease is retained in `courses[].cases[].drops` and the separate `course-flat.json` / `course-raised.json` with columns:

`[x, y, originalFullAlpha, acceptedFullAlpha, candidateFullAlpha, originalRememberedClassAlpha, originalUnknownClassAlpha]`.

Across15,089 decreases,9,253 pixels have original remembered coverage and5,836 have original full alpha0. None has original unknown-class coverage or original full alpha255. The minimum candidate margin above the original floor is0; it never crosses below. A common flat triplet is original131/current176/candidate175. The maximum raised example is pixel(820,430), zoom0.45/offset0, original0/current68/candidate55, with no original protected-class coverage. `summary.json` contains the independent aggregate and pins the full receipt SHA.

This establishes that the changed contribution is visible-ground feathering within this bounded draw: protected-class coverage is unchanged. The source's non-centroid MSAA extrapolation explanation is consistent with these results, but the fixture does not inspect GPU sample positions or prove the exact arithmetic causing each drop. It does not generalize to every map, browser or camera configuration.

## Invariant and remaining gate

The defensible privacy invariant is zero-tolerance preservation of original protected fog coverage: candidate full alpha must never fall below the original constant floor, original opaque pixels remain opaque, and isolated remembered/unknown triangle coverage remains exact. Clear all-visible states remain clear. The accepted-v4 monotonicity gate is a separate, stronger appearance constraint and remains **failed**. Any decision to allow the changed visible feather must be explicit and based on that distinction, not a numeric tolerance.

Root's original constant-floor course already covers96 Chromium cases separately. This derivative does not certify Firefox/WebKit, actual product perspective changes, final visual quality, actor fog disclosure, or performance. Native screenshots and broader product acceptance remain other gates.

## Test lifecycle and preserved preparation failures

All six production scene scopes dispose meshes, geometries and owned textures. All576 temporary protected-class render groups dispose; canvas count becomes0. Final post-close page/console/HTTP/request errors are0. Inputs remain exact. No browser or host remains.

The initial isolated `tsc` invocation failed because extracted source files lack their original type-import context. A subsequent attempted TypeScript compiler-API import failed because installed TypeScript7 exposes a different API; a third check revealed a wrong type-only `Rect` import in the temporary check copy. These are preserved as `fog-three-typecheck-01/02/03.log`. The final helper resolves missing **type-only** imports in disposable copies and passes (`fog-three-typecheck-04.log`). The actual GPU bundle always uses the original pinned sources, not those check copies. The earlier `fog-three-build-01` is build-only evidence, not a browser run. No preparation failure was reclassified as a production defect.

Reproduction from repository root:

```sh
node work/evidence/presentation-privacy-review/fog-three-typecheck.mjs
node work/evidence/presentation-privacy-review/fog-three-source-browser.mjs /absolute/new/evidence-directory
```

The driver refuses to overwrite an evidence directory.
