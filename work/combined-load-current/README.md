# Current combined maximum-load course

Status: native course `run-01` passed. Browser and performance gates remain open.

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
