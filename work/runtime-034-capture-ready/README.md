# SA05 Hard capture-force readiness pilot

Status on 2026-09-28: **one SA05 Hard route passed**. The two focused readiness
tests passed before the leaf. The run is preserved in
`runs/20260928T203752Z-sa05-hard-capture-ready/`. This is a separate test-driver
successor, not a change to the game, authored mission, or a consolidated
campaign pass.

The unchanged diagnostic run is preserved in
`../runtime-034-diagnostics/pilots/20260928T201942Z-sa05-hard-unchanged/`
(checkpoint `9cc75c0`). It stopped at tick 6,856 with an unfinished outcome,
two full-health owned relays, one living reserved tank, an ordinary paid tank
job at 1,002/1,200 work, and no available capture tank. The third approach had
dispatched six infantry without a tank. All 355 submitted orders had `ok`
execution receipts. This was a driver cohort failure, not a mission defeat.

## Exact scope

The 345-file diagnostics source lock is
`9313438021d25fe211e214b50d516c3ee4b5827c8cf90148663a09f141042aa3`.
This 346-file successor changes only
`pkg/sim/authored_campaign_acceptance_test.go` and adds
`pkg/sim/authored_capture_readiness_test.go`. The other 344 files, including
all production Go, protocol, maps and missions, are identical. Proposed
simulation version remains 0.3.4; no saved artifact is relabeled.

The SA Hard capture driver now:

- Selects only currently owned, complete, enabled, unembarked rifle, AT and
  tank actors from the authorized owner view.
- Requires at least three such unreserved actors, including a tank, before
  dispatch. An infantry-only group waits for actual paid completion just as
  an empty group does.
- Leaves the last eligible unreserved tank available when initially assigning
  relay guards or replenishing guard losses. Spare tanks may still defend.
- Checks that capture capability survived guard combat before selecting the
  tank. Any replenishment uses the already existing production queues and
  only time remaining in the first 6,000-tick acquisition window.

All existing acquisition, combat, capture and final hold wait limits remain
unchanged. The new post-combat readiness wait cannot exceed the original first
acquisition window. It does not add a fresh 6,000-tick allowance. No actor is
created, moved, healed, refunded or reassigned except by ordinary validated
commands. No new production spending or mission predicate is introduced.
Existing guard forces are not dismissed; the correction changes only which
future free tank may be reserved. Public health rounding is not treated as
proof of death.

This is not a claim that the strategy is robust across seeds or that the full
campaign has passed. The original frozen matrix and all failed pilots remain
unaltered.

## Completed execution after explicit resource-window release

`run-pilot.py --execute-after-release` verifies the pinned source lock,
compiles one native test binary with `GOMAXPROCS=2` and `go test -p=1`, runs the
two focused selection/deadline tests, and then runs exactly one SA05 Hard
leaf. It preserves a unique run directory, source and binary hashes, build
log, test logs, and every emitted mission/failure artifact. The failure-only
cleanup from the diagnostic predecessor is unchanged. Failed unit tests stop
the run before the mission. There is no automatic tactical retry.

The shared-host elapsed time is recorded for diagnostics, not as a performance
or reference-hardware claim. The process closed at 20:38:25 UTC and no next
mission was started.

The run compiled once (3.706 s), passed both helper tests (0.909 s process), and
completed the Hard leaf (28.856 s process). The exact source lock is
`36630bbd299e85e976b04d1d9caccf3ad5e2dd8294ecefa9861cf36cdd3c4abd`; executable
SHA-256 is `d4cbdab700893b940d57e5b22cb47561e66feb75355006a357858fbe587a7a39`.
Both were verified unchanged afterward.

The first two relays were captured at ticks 1,156 and 5,619. Unlike the old
infantry-only third approach, the driver waited until tick 6,962 to dispatch
the real relief screen, including tank 1,138. At tick 7,200 it still had that
tank and seven other eligible actors after guard combat. The third ordinary
engineer capture completed at tick **11,965** (9:58.25 simulation time), with
`mission_complete`, winning team 1, all three required relays and the optional
`service-preserved` objective complete. Neither failure objective completed.

There were **634 submitted batches, 661 orders and 661 accepted `ok`
receipts**. The victory route contains no surrender or practice order. Final
hash is `912a1dac034109e5cc6d6f7b88fd37626fbf93ea117a7538122c917c478a777c`.
The midpoint-restored branch (tick 1,157) and full replay with seek checkpoints
removed reached that same hash. Fresh restart matched the original initial
hash. A separate ordinary surrender checked failure/debrief, failed-state
save/restore and failure replay; it did not produce the mission victory.

The standard success record includes objectives, debrief and every order and
receipt. It does not separately export a final successful save. No such file
is claimed. Exact evidence SHA-256 is
`7478ce2995f2cbaaaf747b288e32f6eeaebf7d99d24f083e7a694f72d3dbedf7`.
