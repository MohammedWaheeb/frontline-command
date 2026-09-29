# Terrain v4: release temporary topology construction Maps

Use exact `claude-opus-5-5`, no fallback or subagents. You are the renderer author. Read AGENTS.md. Root and three Codex agents handle integration and verification; no browser or Blender access needed here.

Only write `work/terrain-polish-v4/source/client/src/render/terrain.ts` and `work/terrain-polish-v4/HANDOFF.md`. The candidate is an exact copy of your v3 (`f25faee16c90a801cb6153213106a54a89fa169a1481646e2824cb612ce734cd`). Do not edit live terrain.ts (accepted v2), v3, tests, other renderer or art/UI assets. Do not run browsers, hosts, builds or tests.

Independent v3 checks prove exact Float32 UV and visibility equivalence to v2 across 1,288 exhaustive small-map states,324 mutation/perspective/missing/hide/rewind states,972 single-tile changes,rebuild/disposal, public-array-only reads. Unchanged calls cause zero UV uploads. This useful functionality must remain byte-equivalent.

A concrete V8 WeakRef+GC proof retains all62 temporary tile-slot construction Maps (1,982 entries) for a live16x16 chunk. Point Maps collect. The nested `slot()` closure shares the fragment lexical context with returned `setFog`; the claim that all construction Maps are discarded is false. All Maps do collect after fragment disposal, so the problem is retained live-chunk memory, not post-disposal leakage. Added typed arrays already occupy6,008,576 bytes at200,704triangles, excluding Maps. Build time diagnostics v2/v3 236/528ms; neither quiet nor browser-qualified.

Make one focused change: move topology construction into a separate module helper scope returning only the typed-array topology needed by the runtime closure. No construction closure, Map, temporary JS list or map reference may escape. Preserve triangle/neighbor/incident point dependency coverage, order, array types, opacity-based invalidation, exact UV writes, hidden-update behavior and all public APIs. Do not optimize unrelated code, alter shader/alpha/geometry or add caches. Explain the lifetime boundary in HANDOFF, list exact files/hashes and release ownership. Root will rerun exact-equivalence, WeakRef release, CPU diagnostics and real GPU courses before considering promotion.


## Actual coordinator dispatch, 29 September07:07UTC

Access reset time has passed. This is a fresh authorized assignment; all old broad authoring tasks are superseded. Use exactly claude-opus-5-5. Codex resumed from a usage interruption; Mencius alone owns Blender, source review and exports, root owns browser tests, Einstein owns actual-Go service-status fixtures, Boole audits the completed mission matrix. Keep your isolated write scope. Return a concrete result; no need to request permission within this scope.
 Your only assignment and write scope is the isolated terrain candidate in the primary brief. No UI or art source overlap.