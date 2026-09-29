# Terrain polish v4: release fog topology construction state

Author: Claude, exact `claude-opus-5-5`, no fallback, no subagents.
Status: **unverified candidate.** No browser, host, build, typecheck or test was
run by the author, by instruction. Not promoted; live `client/src/render/terrain.ts`
(accepted v2) is untouched.

## Files

| File | SHA-256 |
| --- | --- |
| `work/terrain-polish-v3/source/client/src/render/terrain.ts` (input, unchanged) | `f25faee16c90a801cb6153213106a54a89fa169a1481646e2824cb612ce734cd` |
| `work/terrain-polish-v4/source/client/src/render/terrain.ts` (candidate) | `65421e5ee2ab54339a0f804c5936df01c8521105018c58a4105f21234818c656` |
| `client/src/render/terrain.ts` (live v2, reference only, unchanged) | `968299e854349a7463f00d6b4cf7676b2cb035d2b4a3fbd46b62c50207980876` |

This handoff is the only other file written.

## Defect

In v3, the fog topology was built inline in the per-fragment `.map(...)` callback.
The nested `slot()` arrow captured `slotOf` and `tileList`, and the returned
`setFog`/`setVisible`/`dispose` closures captured their runtime state in the same
function scope. V8 allocates one context per scope, holding every captured
variable, so each live fragment's `setFog` kept `slotOf` (a Map) and `tileList`
alive. `pointOf` was captured by no closure, stayed stack-local and was collected,
which matches the root's WeakRef result: tile-slot Maps retained, point Maps
collected, everything released after disposal.

## Change (one focused change)

A new module-level function `fogTopology(triangles,width,height)` contains the
unchanged construction code: the two Maps, the four temporary `number[]` lists and
the `slot` closure. It returns a fresh object holding only
`{fogTiles:Int32Array, fogPoints, fogPointStart, fogPointSlots}` (each
`Uint16Array|Uint32Array` via the same `indexArray`). The fragment callback
destructures those four typed arrays into `const`s. The rest of the file is
byte-identical to v3 (`diff` shows only these two hunks).

### Lifetime boundary

- **Construction scope** (`fogTopology` call): `slotOf`, `pointOf`, `tileList`,
  `pointStart`, `pointSlots`, `vertexPoints`, `slot`, and `slot`'s context. `slot`
  is neither returned nor stored, so after the call returns nothing refers to its
  context. All of it becomes garbage at that point.
- **Transfer**: the returned object holds only the four typed arrays. It is
  destructured immediately and not bound to any name, so it is garbage too.
- **Runtime scope** (fragment callback context, retained by `setFog`,
  `setVisible`, `dispose` until disposal): `fogTiles`, `fogPoints`,
  `fogPointStart`, `fogPointSlots`, `lastOpacity`, `fogUVs`, `triangles`, `fog`,
  `fogGeometry`, `geometry`, `mesh`, `shown`, `fogNeeded`, as in v3. The callback
  scope no longer declares `width`/`height` or any construction Map/list, and it
  has no other closure that captures `positions`/`uvs`/`indices`. The inline
  `v=>v.height` arrows capture nothing.
- The outer `surfaceFragments` context (parent of the callback context) is
  unchanged from v3. It holds the variables the callback captures (`this`,
  `origin`, `texture`), and none of these is construction state.

## Preserved (by construction, not yet re-verified)

- Order is identical. The same loop visits triangles in the same order and calls
  `slot(tile)`, `slot(neighbor)`, then per-vertex point creation with
  `pointFogTiles` slots. So `fogTiles`, `fogPoints`, `fogPointStart` and
  `fogPointSlots` have identical contents, lengths and array types
  (`Int32Array`; `Uint16Array` or `Uint32Array` by the same `<65536` test).
- Coverage of triangle/neighbour/incident-point dependencies, opacity-based
  invalidation (`lastOpacity`, sentinel 1), exact `fogUVs` writes, the
  zero-upload unchanged path, hidden-update behaviour (`shown`/`fogNeeded`), and
  the `setFog([],[])` initial call are all unchanged.
- The public `TerrainFragment`/`TerrainBaker` API, shader, alpha, geometry,
  textures and disposal are unchanged. No caches were added and no other code was
  optimized.

## Root verification requested before promotion

1. Exact Float32 UV and visibility equivalence against v2 and v3 over the existing
   1,288 / 324 / 972 state suites, plus rebuild/disposal and public-array-only reads.
2. Unchanged calls still cause zero UV uploads.
3. V8 WeakRef+GC on a live 16×16 chunk. Expect 0 of 62 tile-slot Maps and 0 point
   Maps retained while fragments are live, and all released after disposal.
4. CPU build-time diagnostics (v2 236 ms / v3 528 ms, neither quiet) and real GPU
   courses. Build-time cost is expected to be unchanged from v3 because the work
   is identical. The only additions are one call and one small return object per
   fragment.
5. `tsc` typecheck. The author did not run it. The helper's return type is
   inferred and matches v3's local types.

## Ownership release

Claude releases write ownership of `work/terrain-polish-v4/source/client/src/render/terrain.ts`
and `work/terrain-polish-v4/HANDOFF.md` to root on delivery. Claude made no
other writes and holds no other files.
