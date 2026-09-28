# Queued command completion

Simulation 0.3.1 fixes a real queued-waypoint failure discovered while trying to
withdraw the original recovered mechanics in SY01. The 0.3.0 public-command
reproducer sent a starting rig through `(20500,9500)` and `(28500,9500)`, then
queued Hold. It stopped at `(20419,9499)`: first-waypoint arrival retained the
old resolved path endpoint, so the next waypoint was incorrectly consumed.
Hold also remained an uninitialized order with the previous Guard stance.

Finite-task completion now clears the previous route and activates the next
already accepted command through ordinary assignment. The remaining queue is
preserved, including immediate Stop/Hold orders. This changes no movement
speed, arrival tolerance, collision, economy, queue limit or command authority.
The shared completion covers ground move/attack-move, completed patrol loops,
last-seen attack searches, invalidated salvage routes, paid construction,
successful salvage collection and capture, and empty/successful transport
unloading. Aircraft pass/service completion uses the same helper; completed
service retains the landed presentation state.

## Verification

`pkg/sim/queued_waypoint_acceptance_test.go` uses public `Submit` commands.
Thirteen cases cover direct and adjusted-grid waypoint arrival, patrol exit,
Hold activation, Stop followed by Guard, aircraft service and fixed-wing
holding flight, capture, construction, salvage payment and empty/loaded
unloading. Prepared unit/task fixtures are explicitly isolated regression
geometry, not campaign balance evidence. The movement journeys and finite
construction, salvage, capture, service, fixed-wing and unload journeys compare
midpoint restoration and full replay hashes. No test moves live actors to make
its goal pass.

Evidence under `work/evidence/queued-movement/`:

- `other-completion-reproduction.log`: pre-fix service, unload and capture failures.
- `construction-salvage-before.log`: independent failures against the preserved
  0.3.0 production overlay, before the completion change.
- `focused-race.log`: navigation/harvesting/minimum-range suite, PASS, 98.774s.
- `expanded-race.log`: preserved initial failure from an existing prepared
  capture channel with an empty order queue; the helper was then made safe for
  that legitimate completion shape.
- `expanded-race-after-guard.log`: capture, transport, salvage, repair, build,
  patrol and queue regressions, PASS, 15.305s.
- `final-031-race.log`: current-version queue-only race verification.

The original waypoint failure remains at
`work/evidence/mission-playthroughs/optional-0.3.0/queued-waypoint-reproduction.log`.
The optional mission overlay and its successful/failed 0.3.0 evidence were not
rewritten. The 0.3.1 compatibility boundary prevents old deterministic saves or
replays from being interpreted as evidence for these new rules.

## Deliberately unchanged behavior

Boarding currently clears the passenger's own orders, and unloading leaves that
passenger idle. Repair orders remain continuous when the target reaches full
health. These were not changed speculatively as part of the confirmed finite
completion defect. They remain separate controls-policy review items; the
regressions above do not certify every possible queued command combination.
