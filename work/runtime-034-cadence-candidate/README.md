# Isolated equivalent cadence runtime

29 September 2026. **Prepared and tested privately; no live promotion.**
Clean source lock `a7ccba8c…c5c0` is the reviewed seven-path delta against
accepted integrated `3d49f3c0…3750`. It contains the exact static navigation
grid raster and checkpoint save reuse, with three focused test files. The
instrumented server source is excluded from all production builds here.
The simulation stays 0.3.4; this change must preserve rules, commands and bytes.

`runtime-builds/20260929T182132Z/receipt.json` records the fresh Go 1.27.1
`-trimpath` WASM, Darwin/arm64 native adapter and host builds. All ten stages
passed. New WASM is `2fb75dde…6f26`, native adapter `86c1eaab…3583d`, and host
`54784d88…8a7f`. Worker, worker map, Go shim, generated TS and version metadata
are byte-identical to the accepted runtime. Full digests are in the receipt.

The actual produced WASM was instantiated and exercised. Six retained service
approach saves ran through ordinary Session Step to their final state. Their
whole-view and save hashes match the native Session oracle and the accepted
3d49 records. The retained maximum-load tick-600 save was loaded in both actual
WASM and a native Session test overlay, then stepped through 601 and 620. All
twelve whole authorized protobuf views, all three whole saves, Info and Hash
agree. Player 99 is rejected, and foreign entities have no private fields.
The overlay only supplies a test entry point; it changes no production CLI or
source. Load/Step/View delivery semantics remain intact, including event drain.

`audit-build.py` independently checks all retained artifacts, runtime files,
inputs, source inventory and shipping hashes without executing Go. This is
correctness evidence on a shared host, not browser or performance qualification.
The separate quiet actor timing PASS and its original failed baseline remain
under `../maximum-server-combined-v1` and `../maximum-load-034-course`.

The reused mission and skirmish runners point at the immutable clean source.
Commanders, selectors, costs, rules and acceptance bounds are unchanged. The
only runner policy change stops the main course at its first failed leaf and
records remaining cases unrun; it never revises tactics or silently retries.
Each native case is serial with GOMAXPROCS=1. Root browser work and one Blender
may overlap, so elapsed times are not performance measurements. The fresh
102 main, 21 optional and 13 skirmish gates remain open until their counted
receipts and complete order/final-hash comparisons are written.

Audits compare against the actual accepted 3d49 runs of 29 September, not the
older consolidated-source runs. Every mission winning order and bot executed
command trace must agree. Existing bot receipt context may be reused only if
the complete trace, initial/final saves and replay are byte-identical; the
twelve historical decision/execution rejections remain visible and are never
converted into an all-orders-clean claim. Any difference is a diagnosis gate.

No host listener, browser, deployment, directory mirroring, source migration,
or frozen product modification is performed by these scripts. A later guarded
promotion manifest will list only the seven source paths and runtime files
whose actual bytes differ, retaining prior copies for reversal. Root must
review and authorize any live application separately.

The first read-only build audit expected eleven stages but the runner declares
ten. Its source and failed check are preserved separately; the corrected count
checks the same existing ten successful stages, without a build or Go rerun.
