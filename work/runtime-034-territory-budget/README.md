# SY03 Hard ordinary production recovery pilot

Executed once on 2026-09-28 after resource release: **mission failed**. Both
focused budget tests passed before the Hard leaf. This is a separate test-driver copy based on
the proved SA05 readiness source, not a production simulation or mission edit.

The earlier SY03 Hard failure remains at
`../runtime-034-tactics/pilots/20260928T143338Z-sy03-hard-visible-placement/`.
It ended at tick 11,906 with `mission_failed`, two haulers without a supply
center, a power building and 1,600,000 milli-credits. The last training requests
were at 6,177–6,183, following a long gap after 1,845. That trace alone does not
prove the bank or builder status at every intermediate decision.

The source nevertheless contains a concrete test-commander recovery defect:
`withExpansionDefense` retains 1,800,000 milli-credits for its unfinished
discretionary field-building plan even when no owned usable rig survives to
build it. The final owner view demonstrates such a state. This successor
removes that savings gate when the authorized owner view has no complete,
enabled, unembarked own SY rig. It preserves the original gate when a builder
is available. Existing paid foundations, completed plans and the original
cash threshold behave as before. The normal factory/barracks queues and their
validation, price, duration, supply and technology requirements are unchanged.

The new diagnostic line records tick, current owned credits, plan stage,
foundation ID, builder availability and spending decision each existing
600-tick production interval. It does not inspect hidden enemy state or issue
an additional command. All prior field construction, formation, targeting,
home repair, region predicates and wait limits are unchanged. In particular,
this does not pretend the economic correction guarantees regional survival.

Only `pkg/sim/authored_candidate_tactics_test.go` changes; the new
`authored_expansion_budget_test.go` covers retained savings, builder loss,
completed plan, existing foundation, exact threshold and unusable/foreign
actors. All other 345 files are identical to base lock
`36630bbd299e85e976b04d1d9caccf3ad5e2dd8294ecefa9861cf36cdd3c4abd`.
Current source lock:
`5380139af027629f9208de8d282d21673888f2ea500c8eace82fe29d33f8becd`.

After resource release, `run-pilot.py --execute-after-release` performs one
GOMAXPROCS=2, `go test -p=1` compile, the two focused budget tests and exactly
one SY03 Hard course. It records a unique directory, source/binary hashes,
all failure-cleanup evidence and the actual result, then stops. A failed
course remains a failed course; no automatic retry or additional tactic is
applied by the runner.

## Preserved result and refined diagnosis

`runs/20260928T204540Z-sy03-hard-builder-budget/` compiled once, passed both
budget tests, then failed the real mission at tick 11,916 after all command
assets were lost. The process closed at 20:46:03 UTC. Source and binary were
verified unchanged; binary SHA-256 is
`dce28ef1029cf61ac43d57ea70b13d1e6ed796020b1637a63e1d6535c484800e`.

All 839 submitted orders in 830 batches received accepted `ok` receipts. Fatal
cleanup captured the actual terminal save, owner view and full ledger without
changing the state. Hash:
`e48e93628a6397aa984cd4403165e568fea21e839a9d8ac604ab32fbac42ab62`.
The displayed scout-mark bonus does not earn a completed optional route in a
lost mission. Required regional control never completed.

The new public decision log is useful negative evidence. The builder remains
usable through tick 9,924, so the changed lost-builder rule does not release
funds until 10,535, after the army and home economy have already collapsed.
At tick 2,462 and most subsequent production checks, the driver is saving for
stage 1's turret with no foundation despite a live rig. The only successful
construction commands remain the home turret and first outpost. Thereafter the
rig receives repeated moves to (45,500,82,500), with no new Build or Resume.
This confirms a live but unproductive construction plan; it does not yet prove
why every proposed placement fails the public prefilter. No hidden occupancy,
exact destruction cause, or permanent pathfinding defect is inferred.

Next diagnostic: replay the exact owned command ledger to selected stage-1
boundaries and inspect the authorized owner view against the same five sites.
Any subsequent tactic belongs to a new source and evidence directory. This
failed attempt and the earlier failure remain unchanged.
