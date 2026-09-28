# Current combined maximum-load course

Status: native courses `run-01` / `run-02` and actual browser course `browser-03` pass. Final complete-art and quiet performance gates remain open.

All 72 batches were accepted. All 64 returning aircraft landed, all 24 paid
strategic missiles were intercepted exactly once, and exact save/restore plus
full/checkpoint replay checks passed. Final hash:
`71bf256a2a95d16e3a65c39977e5d247ebcd81b3088495864806fca313beb8c1`.
The 356-file base was verified unchanged after the run. `run-01-receipt.json`
locks the exporter, binary and all saved evidence. Shared-host native Advance
p50/p95/p99 was 5.357/10.030/12.815 ms; this is diagnostic, not a quiet gate.

This test-only derivative uses the exact 356-file navigation-lookup candidate
(`c7e0d79d…`) and adds one exporter. It does not edit production Go, timing rules,
caps, content, shipping runtime or prior evidence. A separate directory must be
created for each run; the exporter refuses existing output directories.

The prepared opening has 688 actors, four IR players, 100 Supply and 60 buildings
per player, 16 exterior drone hubs, 64 ISR aircraft, 332 routed scouts, four
scouting observers, 32 finite-charge interceptor batteries and 32 AA posts. Four
charged strategic sites launch 24 paid missiles through ordinary orders. All
aircraft also receive ordinary Return orders after the opening save. The world
then advances for exactly 600 ticks with the unchanged 80-tick mass-route cadence.

The course requires all 72 submitted batches to execute, every missile to be
intercepted exactly once, every aircraft to land, and exact save/restore and full
versus checkpoint replay hashes. It records 150 natural owner-view boundaries
and preserves the actual final save and commands even on failure. It does not
grant global sight or imply that all 688 actors are simultaneously visible.

Native Advance timings are diagnostic unless the run explicitly records a quiet
host. Future browser checks must use the same exported state and commands,
actual Go/WASM, current permitted combat events and real assets. A synthetic
30-second segment is not a long-match test, physical LAN evidence, human balance
evidence or a reference-laptop performance claim.

## Current browser course

The flow under test is: load the actual prepared Go save → submit all 72 ordinary command batches → render 150 natural player-one boundaries → save/restore → dispose → repeat in the same page.

`run-02` adds the correct four-tick feedback oracle; every one of its 150 native state hashes matches `run-01`. `Session.advance/View` accumulates permitted events across the four-tick delivery interval. The first browser attempt failed to resolve a copied protobuf dependency before starting a browser. The second rejected a one-tick-versus-four-tick test-oracle mismatch at tick 4. Both failures and exact drivers remain preserved; no engine/worker/privacy behavior changed.

`browser-03` passes both 600-tick segments on Chromium / Apple M4 ANGLE Metal. Each segment has 72 commands, 150 owner boundary comparisons including exact delivered event IDs, final native hash equality, exact save/restore and zero sprite/FX bytes or canvases after disposal. The naturally permitted perspective receives all 24 warning and interception events; only in-view effects are drawn. Unexpected page/console/HTTP errors are zero. Root inspected the actual final battlefield capture. Its numerous procedural building fallbacks remain visible and are not accepted final art.

Shared-host diagnostic rates are 19.9972 / 19.9996 TPS; frame p95 is 18.3 / 18.4 ms, with zero frames over 50 ms in these two measured segments. This is not a quiet or reference-laptop gate. The frozen product has incomplete gameplay art and no production FX index; it uses the existing code-native warning/combat fallbacks. It predates the seven latest building publications. A final complete-art workload must still be run. These thirty-second segments are not two long matches.

Browser plugin not available; existing Playwright was used with explicit frozen product/source/fixture/output paths. Browser source is `browser-fixture.ts`; native exporter and build/runtime identities are retained in the receipts. Renderer diagnostic counters are sampled on snapshot delivery and may describe the preceding completed render; they are not asserted as an exact same-frame pixel oracle.
