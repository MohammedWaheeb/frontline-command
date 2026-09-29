# Static navigation-grid rasterization review

Read-only review, 29 September 2026. This report proposes invariants and differential checks for the parent's isolated candidate; it does not implement or run that candidate. No Go, compiler, host, browser or performance test was executed in this review. `source-audit.json` pins the inspected production sources and records this scope.

The parent's refined profile attributes the cold second-tick cost to `navigationCells → clear → clearExcept`, rather than mobile occupancy. That profile is owner-reported evidence, not independently rerun here. The appropriate bounded change is to generate the same static boolean grid without scanning every entity for every cell. Keep `clearExcept`, mobile occupancy, live movement, path ordering and direct swept-edge checks unchanged.

## Exact predicate and boundaries

For radius `r`, grid dimensions are `2*Map.Width` by `2*Map.Height`, stored row-major. Cell `(x,y)` is the result of `clearExcept(Vec{x*500,y*500}, r, 0, 0, false, false)` on a cold cache. This is the reference contract, including these details:

| Detail | Required behavior |
| --- | --- |
| World bounds | Reject `X-r < 0`, `Y-r < 0`, `X+r >= Width*1000`, or `Y+r >= Height*1000`. Left/top equality is accepted; right/bottom equality is rejected. |
| Terrain | Only `Tile.Passable()` matters: water, cliff and blocked tiles obstruct. Height, sight blocking and mandatory metadata do not change this predicate. |
| Terrain distance | Clamp the point to the tile's inclusive rectangle, then compare exact squared integer distance **strictly less than** `r*r`. Tangency remains clear. |
| Building inclusion | Include every `Building && HP > 0 && Container == 0` entity except ID 0. ID 0 is excluded by the original `ignore=0`; legal saves reject it, but literal synthetic parity is inexpensive. |
| Building dimensions | Use retained `FootprintWidth` and `FootprintHeight` through `e.footprint(v)`, never the current type's catalog dimensions. |
| Building distance | `dx=max(0,abs(X-cx)-width*500)` and corresponding `dy`; block only when `int64(dx)*dx + int64(dy)*dy < int64(r)*r`. |
| Irrelevant building state | Incomplete, disabled, neutral, hostile, unseen and converting buildings still block if included above. There is no owner, visibility, power, completion or catalog-type filter. |
| Mobiles | All non-buildings are ignored, including deployed launchers, armor classified as structure, landed aircraft and reserved landing positions. Their separate occupancy behavior is outside this optimization. |
| Radius zero | Every grid node is clear on a positive-size map, including nodes inside blocked terrain or buildings: no squared distance can be less than zero, and all half-grid nodes are within bounds. Do not fill rectangular interiors independently of the strict predicate. |

Boolean obstruction is commutative: rasterizing included buildings in a different order does not change a cell, since the predicate has no side effects or selected entity result. This does **not** justify changing movement/entity ordering elsewhere.

A conservative local raster rectangle may include tangent cells, but every admitted candidate must still use the exact strict predicate. Clamp raster indices to the grid before indexing. Avoid float distance, square-root approximations, expanded-box-only obstruction, and truncation assumptions at negative coordinates. A building wholly outside a query's local range must not write a cell. Keep the multiplication widening used by the original implementation.

## Cache and lifecycle contract

`navigationCells` caches independently by radius. It replaces the radius map when `navCache == nil` or `navRevision != state.NavigationRevision`; a warm call at the same revision returns its existing array. There is no tick, owner, visibility, unit position or operating-type key. Preserve this contract and the absence of serialized mutations.

- Building creation increments `NavigationRevision`, including incomplete foundations (`engine.go`). Destruction increments it during `cleanup` before entity removal (`combat.go`). Destructible map objects become rubble in that cleanup path, so the same revision change covers their terrain change.
- Mission default-base removal increments the revision. Mission rollback replaces state and explicitly clears `navCache`, dynamic navigation and spatial caches. A nil navigation cache must rebuild even if the numeric revision matches.
- Capture and recapture deliberately retain the physical foundation while changing operating type, owner and service behavior (`support.go`, `footprint.go`). They need no geometry revision. A warm grid and a separately rebuilt cold grid must therefore agree across these changes.
- Setting a building's HP to zero manually without cleanup/revision can leave a warmed baseline grid stale until its existing invalidation boundary. A differential test should compare legal lifecycle transitions, or explicitly assert the same stale-cache contract, rather than accidentally changing it.
- Restored/new engines have fresh derived caches. Cache construction must not change `State`, its canonical hash, orders, RNG, events or `NavigationRevision`.

`coarseCorridor` uses the cached grid only when the ignored entity is absent or is not a building. When ignoring a building it calls direct clearance, since an all-buildings grid cannot represent that exception. Retain this fallback. `navigationBridgeClear` and live movement use direct geometry; endpoint grid equivalence cannot replace their swept checks.

The combat spatial index is rebuilt after movement/aircraft work. Reusing it for earlier movement without new invalidation would have been unsafe; the narrowed static-grid change does not need that index at all.

## Independent oracle gap

`navigation_lookup_reference_test.go` preserves `referenceClearExceptLookup`. Its terrain/building branch is suitable as the old cold-grid oracle: invoke it directly for **every** grid cell with both ignored IDs zero, ground mode, mobiles disabled.

Existing `TestClearanceLookupMatchesPriorDecisions` compares direct clearance implementations, so it will not catch a new bug confined to `navigationCells`. Existing `referenceFindPath` itself calls `e.navigationCells`, so old/new path comparison alone can share the same faulty candidate grid. Preserve those tests, but add an independently built oracle grid before accepting path or hash parity.

## Proposed meaningful differential checks

These checks are proposed, not executed by this review.

1. **Exhaustive cold grid:** Compare every bit to `referenceClearExceptLookup` on several small rectangular maps (including 32×47 to detect stride mistakes), with all distinct catalog radii plus 0, 1, 499, 500, 501, 1000 and 1400. Include a maximum-size map separately. Use all-passable, borders, checkerboard and mixed water/cliff/blocked terrain; vary noncollision terrain fields independently.
2. **Exact edge geometry:** Exercise tangent and one-millitile-inside/outside cases at terrain edges/corners and retained building sides/corners. A 300/400 offset with radius 500 gives an exact diagonal tangency. Include odd/even footprints, widths/heights 1–12, overlapping buildings, buildings near all map borders, non-half-grid centers, and inflated rectangles extending beyond the map. Radius zero must remain all true.
3. **Inclusion table:** Independently vary building, HP, container, completion, enabled, owner, fog-related state, type and retained footprint. Test unknown operating type with retained dimensions as a synthetic literal-parity case; zero dimensions and ID 0 should be labeled invalid-save synthetic cases. Add every catalog mobile type and confirm no static-grid change, including deployed/landed/reserved variants.
4. **Warm cache and independent radii:** Repeat calls at equal revision, compare exact values and existing cache reuse, and request two radii to catch accidental array aliasing. Change revision and verify all radius entries rebuild correctly. Test a nil cache with the same numeric revision. State hash before/after grid construction must match.
5. **Legal lifecycle:** Through actual engine operations, construct a paid foundation, destroy/clean up a structure, destroy a map object into rubble, capture/recapture a service building whose operating footprint differs, and use the existing mission rollback path. At each legal boundary compare warm/cold grids against the independent oracle, revision behavior and state hash. Do not inject a different footprint to simulate capture.
6. **Call-site protection:** Preserve ignored-building coarse-corridor parity, arbitrary sub-grid start bridges, inaccessible edges, mobile recovery and deterministic neighbor/tie order. Existing path tests remain useful after independent grid validation; their shared grid dependency should be stated.
7. **Actual workload and restore:** In the parent's separate candidate gate, compare each grid/radius and each native tick hash for the actual first-eight-tick cold workload, then existing save/restore/replay and native/WASM courses. A fast warmed benchmark does not establish improvement to the identified cold tick. Report cold construction separately from cache hits and server actor/checkpoint timings.

No candidate correctness or performance acceptance is claimed here. The relevant source declarations and exact hashes are retained in the accompanying receipt; future candidate evidence should pin its own bytes and preserve any failed comparisons.

## Isolated candidate review

The parent subsequently supplied `work/navigation-grid-raster-v1/source/pkg/sim/navigation.go` and its four new `navigation_raster_test.go` tests. The exact source bytes read at the review boundary are copied under `reviewed-source/`; later owner changes and runs are outside this snapshot.

No semantic blocker was found for validated nonnegative radii, coordinates and retained footprints. Only `navigationCells` differs from the inspected production `navigation.go`. The new function first establishes the exact asymmetric world bounds, then rasterizes impassable terrain rectangles and included retained building rectangles. It leaves `clearExcept`, path ordering, mobile occupancy and the cache/fallback contract intact.

The local range math is conservative. For a nonnegative lower bound, truncating `(left-radius)/500` down includes a possible extra cell rather than omitting one. A negative lower bound becomes zero after clamping; Go's truncation toward zero may also include zero when the obstacle lies just outside, but the exact predicate rejects any irrelevant cell. For a nonnegative upper bound, `(right+radius)/500` includes every possible grid point, including tangency. A negative upper bound may admit zero due to truncation, again filtered by distance. Both axes use bounded indices and exact widened squares. This reasoning assumes the normal validated integer domain, without overflow or negative radii/footprints; it does not extend the accepted input domain.

The rounded-rectangle distance `max(0,left-px,px-right)` equals the original `max(0,abs(px-cx)-halfWidth)` for a nonnegative retained half-width; the same applies to y. A terrain tile is the same inclusive rectangle used by the old clamp. The union of these independent strict obstructions is therefore equivalent to the old per-cell scan. Skipping already-false cells cannot reverse a result. Radius zero remains all clear.

The new tests directly use the independent retained clearance oracle, compare full grids, assert state-hash stability and warm-array reuse, vary catalog radii and blocked terrain, retain physical dimensions across synthetic type/ownership changes, invalidate by revision, and cover the 688-entity opening. `focused-02.log` contains four owner-run passes, but predates the owner's explicit live ID-zero addition; it must not be treated as proof of later test bytes. This reviewer did not execute any test.

Two focused improvements were sent to the parent:

- The current corner point `(4500,4500)` relative to a building beginning at `(5000,5000)` has distance `sqrt(500²+500²)` at radius 500. It is outside the circle, not exactly tangent. Add a true 300/400/500 diagonal and one-millitile geometry changes; the current exact side-tangency case remains useful.
- An ID-zero building appended to a dense random blocked map can have its entire influence masked by other obstacles. Add an isolated open-map ID-zero case, then change only its ID to nonzero and prove a cell changes. This would fail if the intended zero-ID exclusion were accidentally removed.

The 688-entity opening checks maximum actor load; it should not be described as a maximum 256×256 map-size proof unless that map dimension is independently present. Full-size map and legal capture/cleanup/rollback integration checks remain useful broader gates, rather than reasons to alter this bounded algorithm.
