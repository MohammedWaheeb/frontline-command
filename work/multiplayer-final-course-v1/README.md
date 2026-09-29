# Future final-package course — private author preparation

29 September 2026. **Browser/host UNRUN; not bound to any approved final-art package.** This separate test-only copy preserves prepared03 and its genuine3H+1AI result. No production Go, deterministic bot, UI, renderer, assets, source lock or completed course changed.

`source/expansion-commander.mjs` adds only a public roster eligibility guard for station capture. Neutral and active enemy owners remain candidates; own/allied/defeated/unknown owners do not. Current authorized roster/station/visibility is reread during logistics so earlier awaited work cannot leave a stale defeated-owner choice. Existing visible-threat avoidance and ordinary command actor/channel revalidation remain. This removes the exact repeated station10 intent found in the earned match; it does not alter authoritative capture eligibility or guarantee all future receipts.

The regression uses the **actual authorized IR/player2 view** from the earned midpoint21,895, extracted offline through exact integrated3d49 production WASM `d1d7b97d…db7ae`. No Step, Submit or state mutation occurred; before/after hash is `60645f1b19cdcdf99e9a56535e92d15fb1ac65153788008b80a4c9bb87e16372`. Original policy emits capture1033→station10; corrected policy emits none. Both world state and fixture remain unchanged. Native/protobuf-derived current view is not mislabeled as an original live snapshot at one of the rejected ticks.

`fixtures/export-receipt.json` pins inputs/outputs and proves the Go WASM runtime exited. The initial source-only decoder bundle failed because the isolated generated protocol could not resolve its package; `export-earned-view-01-failed.mjs` and the original log preserve this. Adding the explicit existing client dependency directory fixed the harness. Successor02 took under one second on the shared host; this is not a performance benchmark. Receipt `info.metadata.seed` is a parsed JS number and is **not an exact uint64 identity**; the authoritative seed string remains `478486907601900409` in the original earned native audit. Decisions never use that diagnostic seed.

Six station tests cover that unchanged earned view, explicit synthetic public-owner variants, eligible alternatives, preserved fog/threat checks and newly observed defeat. Synthetic variants are decision tests only and make no Go gameplay claim. Two guard tests verify real file/source/receipt drift rejection and independent wall budgets. The six previously earned watchdog/reconnect tests are copied unchanged. All14pass in `unit-01.log`; browser driver syntax passes.

## Bounded long-pair driver

The original ordinary commander is otherwise unchanged. The same two US/SA profiles use authored Dry River, normal resources/rules, two genuine hosted rematches without page/Application replacement. All reconnect/readiness/ownership/result/replay/privacy/lifecycle gates and the ≥20active-minute criterion per game are retained. Each natural short result remains a duration failure; no forced prolongation.

The future driver separates `--minutes` (independent whole-browser watchdog) from `--round-minutes` (ordinary decision loop bound). Defaults are130/60minutes for the two-game case and60/60for other cases. The original single flag coupled the two, so passing130without this change would have incorrectly enlarged the per-round bound. No simulation deadline changes.

Complete input guards now run before each round and at every menu boundary, as well as inherited initial/final checks. A changed receipt/source/asset fails before another round. All raw diagnostics remain strict, including unexplained `ERR_ABORTED`. Same-run body instrumentation is **not** added to this future source; original unsupported attribution stays unsupported. No keys are logged or retrospectively recovered.

## Binding and execution handoff

`prepare.mjs` is authored and syntax-checked, **not executed**: there is no final-art approval to consume. It requires a separately integrity-checked base preparation with the same receipt schema and an explicit parent-reviewed final-art approval file. The approval must name status`approved`, exact `packSHA256`, `productReceiptSHA256`, honest scope and nonempty `reviews:[{path,sha256}]`. Those review files and this private source lock are pinned. The recipe copies already verified host/auditor/decoder helpers; it never rebuilds a product, generates approval or invokes executables. A future runtime/protocol version change needs renewed adapter/auditor compatibility review first.

The old incomplete Appbuild03 must not receive an invented final-art approval. The actual runner refuses execution unless approval is present and matches its pack; build-only remains safe. Once the parent has selected the final package, prepare a **new** directory:

```sh
node work/multiplayer-final-course-v1/prepare.mjs \
  --base FINAL_BASE_PREPARATION --base-sha EXACT_BASE_RECEIPT_SHA \
  --approval REVIEWED_FINAL_ART_APPROVAL --approval-sha EXACT_APPROVAL_SHA \
  --out NEW_FINAL_COURSE_PREPARATION
node NEW_FINAL_COURSE_PREPARATION/source/multiplayer-current-loader.browser.mjs \
  --prepared NEW_FINAL_COURSE_PREPARATION --case endurance2h --build-only
```

Only after explicit sole-lane release, AC/awake verification and source eligibility review:

```sh
GOMAXPROCS=1 caffeinate -i node NEW_FINAL_COURSE_PREPARATION/source/multiplayer-current-loader.browser.mjs \
  --prepared NEW_FINAL_COURSE_PREPARATION --case endurance2h \
  --out NEW_EVIDENCE_DIRECTORY --headed --minutes 130 --round-minutes 60 \
  --conditions 'Record actual power and shared-host conditions; correctness only.'
```

The preparation recipe has no exercised final-product binding yet; this is an explicit remaining author handoff gate. The eventual run still needs two real ≥20active-minute outcomes, exact independent native audits and strict diagnostics. The inherited resource entry cannot prove counters it does not expose. Full matrix priorities and all historical qualifications remain in [future-matrix-plan.md](../multiplayer-current-loader-v1/future-matrix-plan.md).
