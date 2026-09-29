# Consolidated ordinary mission acceptance

2026-09-29 completed audit: **102/102 main and 21/21 targeted optional leaves
passed**, zero failed or unrun. No native test, game host or browser was restarted
for the audit. These are serial native correctness runs on the unchanged locked
commander, with GOMAXPROCS=1 on a shared host; elapsed times do not certify
performance, player difficulty or optimal pacing.

| Phase | Fresh cases | Command batches | Accepted order receipts |
|---|---:|---:|---:|
| Main: 24 tutorial, 72 campaign, 6 co-op | 102 | 12,588 | 13,261 / 13,261 |
| Seven targeted optional routes × three difficulties | 21 | 9,875 | 10,109 / 10,109 |

Every completion has all required main objectives complete, a real team-1
`mission_complete`, meaningful midpoint,
available debrief and a distinct failure-branch hash. Winning ledgers contain
no practice commands or surrender. The common `finish()` gate also verifies the
midpoint-restored twin, full replay with checkpoints removed, same-seed initial
restart hash, and ordinary all-human surrender failure/save/replay. Surrender
covers the generic failure path; it does not certify every authored loss predicate.

The seven independently required optional IDs are `missile-budget`,
`stations-together`, `limited-salvage`, `mechanic-teams`, `observer-network`,
`wing-evacuated` and `factory-captured`. All are actually complete on Easy,
Normal and Hard. This is the targeted 21-leaf optional matrix, not a claim to
have independently exercised every optional/failure record in the content.

## Exact evidence and limits

- [Main receipt](authored-runs/20260928T233429Z-main/run.json), SHA-256
  `d09948ff29b2ebb077c546f8c10658575e4f3fb5f4ce17b2ca8dacca4124e322`.
- [Optional receipt](authored-runs/20260928T235819Z-optional/run.json), SHA-256
  `710d341409a72b74d9f47418a75e930c346869b6c246ddd5fbd0e6e204b79d52`.
- [Per-case artifact, log, objective and command audit](completed-audit.json).
  Recheck without running Go: `python3 work/runtime-034-consolidated-acceptance/audit-completed.py`.
- Source lock `757b31785a0c0b869cca06ad01299ef199fd124989e722dce559c2919dddab8d`;
  both freshly built executables hash
  `89b0bb0c45c7493b8c6d04c36af25b730a7303b0ef201e1e566da0f62bc6d166`.
  Every source file and both executable bytes were rechecked after completion
  and again during this audit. Raw logs/JSON are retained in the two run directories.
- Production Go, bindings and content match original combined proposed 0.3.4
  lock `ed50966897139f973e143ba0f83c9776849b6d7924839c228238e7dc1370ed20`.
  Only three existing and eleven added acceptance test files differ. These runs
  do not include the later owner-casualty/ranges, explicit snapshot codec or
  navigation-lookup optimizers. Shipping remains 0.3.3; promotion is separate.
- The original 93/102 and 12/21 matrix and all failed tactics pilots remain
  preserved. Commander changes used ordinary visible information, paid economy
  and unchanged authored rules/resources/objectives. A documented test-only
  SY03 wait-bound revision is distinct from an authored mission deadline.

## Runner and preserved launch conditions

Historical launch note — 2026-09-29: root released serial execution after the live multiplayer course closed. The test commander and source lock remain unchanged. The process controller now uses **GOMAXPROCS=1**, records this coordinated shared-host condition, stops after a killed/resource-exhausted child, and counts unrun leaves separately from observed failures. The result was pending at this launch boundary; the completed audit is above. The original planning-only boundary and prior individual routes remain preserved in Git/evidence.

This runner uses immutable source in `../runtime-034-observer-reboard/source`,
lock `757b31785a0c0b869cca06ad01299ef199fd124989e722dce559c2919dddab8d`.
Its production Go, bindings, mission and map bytes match original proposed 0.3.4
`ed509668…`; only three existing and eleven added acceptance test files differ.
All nine previous main and all nine previous optional failures have separate
successful routes. That does not establish that the combined tactics have no
regressions; this runner retained every actual result.

The prepared plan contains exactly **102 main and 21 optional leaves**, runs
serially with GOMAXPROCS=1, records source/binary/artifact hashes and each exact
leaf result, and keeps fatal diagnostics for failed routes. Execution is held
unless root releases the active multiplayer browser course. Planning alone builds
or runs no Go code:

```sh
python3 work/runtime-034-consolidated-acceptance/run-authored-matrix.py
```

After explicit coordination, use `--run main --execute-after-release`, then
`--run optional --execute-after-release`. A `--select` run is explicitly a subset
and must never be represented as the full matrix. Existing evidence is preserved
in unique run directories; no old save or outcome is relabelled.
