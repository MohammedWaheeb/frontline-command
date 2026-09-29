# Isolated terrain fog cache v3 review

29 September 2026. This is independent CPU/source verification, not promotion or GPU acceptance. The live renderer and accepted v2 remain SHA256 `968299e854349a7463f00d6b4cf7676b2cb035d2b4a3fbd46b62c50207980876`. The isolated candidate is `work/terrain-polish-v3/source/client/src/render/terrain.ts`, SHA256 `f25faee16c90a801cb6153213106a54a89fa169a1481646e2824cb612ce734cd`.

## Model and source audit

`work/claude/terrain-cost-20260929T082806Z.jsonl` reports `claude-opus-5-5` in its init record, every returned assistant message, and the sole final `modelUsage` entry. It exits 0/completed, `is_error:false`, with zero subagents. The dispatch declares no fallback. This checks the returned model, not only the requested command.

The source diff changes incident-point fog lookup and the fragment's cached `setFog` closure. Geometry generation, triangle ordering, ground UVs, ramp texture/opacity formula, macro treatment, `setVisible`, disposal and the public API are unchanged. Dependencies include each triangle's tile, explicit cliff neighbor, and all in-map incident tiles at every ground vertex, including vertices that currently have an opaque base. Invalidating by actual effective 0/175/255 values handles in-place mutation, replaced perspectives, and explored changes beneath current visibility without relying on array identity or tick.

## Exact output tests

`client/tests/render/terrain-fog-cost-audit.mjs` compiles both unchanged source files against the accepted frozen `inputs-v2` surface/iso/material modules. `terrain-fog-cost-pixi.mjs` substitutes only a non-rendering texture/mesh/buffer adapter, observing geometry, exact Float32 bytes, uploaded UV copies, and update calls. It does not emulate shading or certify GPU pixels.

The six courses in `work/evidence/terrain-fog-cost/cpu-02/audit.json` pass:

- 1,288 exhaustive per-tile visible/explored boolean-state observations, including stable repeats, over flat and raised/cliff 1×1, 1×3, 3×1 and 2×2 maps. This covers all four underlying boolean combinations per tile, including visible but unexplored.
- 324 mixed 35×35 chunk-boundary states and repeats: same arrays mutated in place, replacement perspective arrays, sparse/short/empty inputs, all-clear/explored/unknown, hide→update→show, and rewind. Geometry contains 5,001 triangles across 474 fragments.
- 972 single-tile transitions through clear/explored/unknown over an 18×18 map, updating one 16×16 chunk. This includes incident neighbors outside the owning chunk and cliff-face dependencies.
- Public-array access checks, with entity access poisoned. Only numeric in-map opacity elements are read. Empty arrays are the supported missing-data representation; passing `undefined` still throws in both implementations, as the API requires arrays.
- Fresh fragment creation after geometry/dimension changes, initial unknown state, clear→unknown and disposal/rebuild. All owned mesh/geometry/texture adapters dispose.
- Unchanged hidden fragments and external visibility edits: cached state restores `shown && fogNeeded` without an upload.

Every compared current and uploaded fog UV buffer is byte-identical; positions, ground UVs, indices, triangle geometry, projected bounds, depths, visibility and tint are identical. Unchanged v3 updates upload zero buffers. The initial `cpu-01` failure was a harness assertion comparing mock position methods by reference rather than numeric x/y; that failure is preserved and corrected only in the helper.

This is not the 96-case three-browser GPU course. That gate remains necessary after a corrected candidate is frozen.

## Concrete temporary-map retention defect

The v3 handoff states that construction Maps are dropped after fragment construction. The returned `setFog` closure actually shares a lexical context with the local `slot()` closure, which captures `slotOf` and `tileList`. On the observed Node/V8 build, all tile-slot Maps stay alive with the fragments.

`client/tests/render/terrain-fog-cost-retention.mjs` wraps Map construction with weak references, restores the native constructor, crosses task boundaries and explicitly collects garbage. It then exercises the live fog closures and disposes/drops the scene before collecting again. The unchanged compiled source is used. `work/evidence/terrain-fog-cost/retention-02.json` records:

| One flat 16×16 chunk, 62 fragments | v2 | v3 |
|---|---:|---:|
| Construction tile-slot Maps | 0 | 62 |
| Tile-slot Maps alive after GC while scene lives | 0 | 62 |
| Entries in these retained Maps | 0 | 1,982 |
| Point Maps alive after GC | 0 | 0 |
| Any tracked Maps alive after scene disposal/drop and GC | 0 | 0 |

This is additional per-resident-fragment memory, not an observed post-disposal leak. It is a concrete V8 retention result, not a claim about every JavaScript engine. `retention-01` is retained as an instrumentation precursor: loop-local references accidentally kept the last inspected Maps alive; the final helper moves inspection and disposal into synchronous helper scopes before GC.

The bounded correction is to move topology construction into a separate helper scope that returns only the final typed arrays. The returned fog closure must not share the construction scope containing Maps and dynamic staging arrays. Keep the current value-based invalidation and exact formulas. Root is sending this to Claude as a separate v4 candidate; no source was changed by this review.

## CPU and memory diagnostics

The CPU-only adapter course uses 196 resident chunks, 200,704 triangles and 12,152 fragments, with half hidden. Timed buffer updates count calls but do not copy data or call a GPU. Eight measured samples follow four warmups. This shared-host Node run is diagnostic, not quiet browser performance qualification.

| Update | v2 median | v3 median | v3 uploads per update |
|---|---:|---:|---:|
| Identical all-clear state | 19.277 ms | 8.566 ms | 0 |
| Frontier moves one tile | 13.926 ms | 8.374 ms | 924 |
| Entire state alternates | 15.177 ms | 17.437 ms | 12,152 |

Construction in this run was 236.3 ms for v2 and 527.7 ms for v3, including its topology work. Typed-array constructor observation measures **6,008,576 extra allocated bytes** for the candidate at this workload: 450,016 opacity bytes, 1,800,064 tile-index bytes and 3,758,496 compact point/run-index bytes. This excludes JavaScript object/array/Map overhead, temporary allocation, and GPU memory. It is not a heap-retention total. The retained Maps above make the handoff's temporary-allocation assumption false.

Cached updates improve in this diagnostic; all-changing updates and construction are slower. These are explicit tradeoffs to remeasure on v4 and real browser engines. There is no total-frame-rate, reference-device, finished-art or final performance claim.

## Reproduction and ownership

Run the CPU helper with a fresh `--out` directory, then run the retention helper with `node --expose-gc`, `--inputs` pointing to that CPU output directory and `--out` pointing to a fresh JSON result. The JSON receipt pins both terrain sources and the frozen dependencies. The evidence retains failed precursor runs. Root owns browser tests and promotion; this review changes only test/evidence code and Markdown.
