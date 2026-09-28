# Authored failure and optional-objective acceptance

> Status update — 2026-09-28: the passing matrices below are historical,
> source-specific records. The current frozen proposed 0.3.4 matrix passed
> **93/102 main routes and 12/21 optional routes**. Later ordinary-driver pilots
> are separate evidence, not a consolidated replacement pass. See the
> [frozen matrix status](../work/runtime-034-candidate/README.md) and
> [latest individual pilot status](../work/runtime-034-tactics/README.md).
> A failed driver route does not establish that a mission is impossible.

The clean 102-case main-completion matrix proves victory, restoration, replay,
restart and the generic all-human surrender path. Surrender alone does **not**
prove an authored loss predicate. This follow-on inventory covers every authored
failure and optional record and adds representative ordinary-order routes from
unchanged original mission starts. No game-state, mission, credits, health,
time or objective mutations are used.

There are **55 failure records across 31 missions, with 25 distinct failure IDs**,
and **31 optional objective records**. Tutorial 5's four explicit variants keep
the same objective IDs and are counted as one authored story record here. The
actual command-asset types are validated in each selected variant. There is no
separate authored timer or extraction-deadline failure. IR03's finite starting
field is the resource-exhaustion gate. US06's strategic-site-before-launch
condition is an optional award, not an authored failure; all three main routes
already earned it through real neutralization.

## Additional acceptance method

`pkg/sim/authored_mission_paths_test.go` uses the existing public-order harness.
Loss cases require a genuine `mission_failed` outcome **and the named authored
failure objective to be complete**, and explicitly forbid surrender orders.
Each checks an intermediate save/restored twin, the ended save, a full replay
from the original initial snapshot with checkpoints removed, a fresh same-seed
restart hash and an available failure debrief. Evidence records ordinary order
receipts, actual objective flags, outcome and hashes. Distinct tactical and sale
routes have distinct evidence suffixes.

Ordinary selling is deliberately included as a player action: selling a required
battery or last command site must not bypass mission failure. Those cases are
identified as sales rather than enemy kills. The two-airfield and two-of-three
network cases also prove that losing just one permissible site does not end the
operation. The co-op HQ case preserves the other commander's HQ and still fails
the shared authored objective.

Additional optional routes must first win the real mission and then have the
corresponding actual award. US03 protects its original scout in a rear position
while paid forces capture and hold both radars. IR03 captures the western
station, withdraws from that region, captures the eastern station, then returns
to establish simultaneous region control. Routing the second engineer through
the western region too early legitimately completed the main objective before
the optional; the corrected route uses an ordinary southern waypoint.

An attempted SA03 optional station route exposed and lost its eastern escort
and engineer. That attempt proves neither an impossible mission nor a content
bug, and its failed pilot is not part of the passing suite. The optional route
remains open. No gameplay balance or authored content changes were made.

The final clean run passed **all 14 paths in 41.194 seconds**: 12 authored
failure routes covering 11 distinct predicates, plus two additional optional
victories. All use normal difficulty. The exact tick/hash table is
`work/evidence/mission-playthroughs/authored-paths-results.md`. Seven optional
objectives still have no earned route on any tested path; the remaining failure
predicates are explicitly marked open below.

## Reproduction

```sh
FRONTLINE_MISSION_EVIDENCE="$PWD/work/evidence/mission-playthroughs" \
  go test ./pkg/sim \
  -run '^TestAuthored(SpecificFailures|AssetLossBoundaries|SharedConvoyLoss|OptionalScoutPreservation|OptionalStations)$' \
  -count=1 -timeout 15m -v
```

These dedicated real-simulation paths skip `testing.Short`. Raw command evidence
is written locally under `work/evidence/mission-playthroughs/authored-paths/`
for losses and separate `-optional-*` files for new wins. The compact passing
log and generated inventory below are the checkpointed evidence; transient
failed saves, test binaries and large raw artifacts are excluded.

A true preservation or spending-ceiling award is reported exactly as the game
records it. Some permit zero use or zero spending: that does not prove the unit
was actively used, money was spent, or every edge of the budget mechanic was
exercised. A successful award on normal does not extend to unplayed difficulty
variants. Main-completion evidence, optional awards, authored failure predicates,
and product UI journeys remain separate claims.

## Failure-predicate inventory

“Open” means the named authored predicate lacks a deliberate replay-checked
route in this acceptance lane. Generic surrender remains tested for every
mission but is not credited to any of these named predicates. All added paths
currently use normal difficulty.

| Mission | Authored failure IDs and direct proof |
|---|---|
| tutorial-1-give-an-order | `no-command-assets`: open; `original-order-team-lost`: open |
| tutorial-2-operate-a-base | `no-command-assets`: open |
| tutorial-3-read-the-counter | `no-command-assets`: open; `transport-team-lost`: Enemy fire |
| tutorial-4-defend-the-sky | `no-command-assets`: open; `service-aircraft-lost`: open; `missile-exercise-lost`: open; `evade-team-lost`: open |
| tutorial-5-command-a-match | `no-command-assets`: open |
| us-01-first-foothold | `no-command-assets`: open; `lost-rangers`: open |
| us-02-open-corridor | `no-command-assets`: open; `convoy-lost`: Enemy fire |
| us-03-relay-ridge | `no-command-assets`: open; `relay-destroyed`: Player attack on visible required radar |
| us-04-broken-umbrella | `no-command-assets`: open; `airfields-lost`: Two ordinary sales; one is safe |
| us-05-split-front | `no-command-assets`: open |
| us-06-clear-horizon | `no-command-assets`: open |
| ir-01-forward-signal | `no-command-assets`: open |
| ir-02-eyes-above | `no-command-assets`: open; `launchers-lost`: Enemy fire |
| ir-03-beyond-the-basin | `no-command-assets`: open; `field-empty`: Real hauling empties finite field |
| ir-04-hold-the-network | `no-command-assets`: open; `network-destroyed`: Two ordinary sales; one is safe |
| ir-05-the-second-volley | `no-command-assets`: open |
| ir-06-iron-signal | `no-command-assets`: open |
| sy-01-workshop-foothold | `lost-patrol`: open; `lost-recovery-rig`: Recover, then enemy fire |
| sy-02-supply-trail | `no-command-assets`: open; `trail-trucks-lost`: open |
| sy-03-three-crossings | `no-command-assets`: open |
| sy-04-open-doors | `no-command-assets`: open; `doors-lost`: open |
| sy-05-relay-break | `no-command-assets`: open; `communications-destroyed`: open |
| sy-06-open-road | `no-command-assets`: open |
| sa-01-arrival-point | `no-command-assets`: open |
| sa-02-moving-shield | `no-command-assets`: open; `convoy-destroyed`: open |
| sa-03-distant-depots | `no-command-assets`: open |
| sa-04-intercept-window | `no-command-assets`: open; `defended-assets-lost`: Enemy fire; battery sale |
| sa-05-three-positions | `no-command-assets`: open; `relay-destroyed`: open |
| sa-06-shieldline | `no-command-assets`: open |
| convoy-union | `western-hq-lost`: open; `eastern-hq-lost`: open; `convoy-1-lost`: Hold at junction; actual enemy attack; `convoy-2-lost`: open; `convoy-3-lost`: open |
| twin-outposts | `western-hq-lost`: Owner1 sale; Owner2 HQ survives; `eastern-hq-lost`: open |

## Optional-award inventory

The baseline column is the count of actual earned flags in the clean 102 main
completions. Extra normal routes are separate and do not overwrite those files.
A 0 baseline with no extra route remains open; partial counts retain the
unplayed/unsuccessful combinations.

| Mission | Optional objective | Baseline awards | Additional successful route |
|---|---|---:|---|
| tutorial-1-give-an-order | `original-team` | 3/3 | — |
| tutorial-2-operate-a-base | `hauler-protected` | 3/3 | — |
| tutorial-3-read-the-counter | `apc-survives` | 3/3 | — |
| tutorial-4-defend-the-sky | `wing-safe` | 3/3 | — |
| tutorial-5-command-a-match | `command-intact` | 12/12 | — |
| us-01-first-foothold | `engineering-rescue` | 3/3 | — |
| us-02-open-corridor | `all-trucks` | 3/3 | — |
| us-03-relay-ridge | `scout-preserved` | 0/3 | Normal, protected scout route |
| us-04-broken-umbrella | `wing-evacuated` | 0/3 | — |
| us-05-split-front | `no-transport-loss` | 3/3 | — |
| us-06-clear-horizon | `site-before-launch` | 3/3 | — |
| ir-01-forward-signal | `recon-survives` | 3/3 | — |
| ir-02-eyes-above | `recover-drones` | 3/3 | — |
| ir-03-beyond-the-basin | `two-stations` | 0/3 | Normal, sequential station captures |
| ir-04-hold-the-network | `no-emergency-loss` | 3/3 | — |
| ir-05-the-second-volley | `missile-budget` | 0/3 | — |
| ir-06-iron-signal | `observer-network` | 0/3 | — |
| sy-01-workshop-foothold | `mechanic-teams` | 0/3 | — |
| sy-02-supply-trail | `limited-salvage` | 0/3 | — |
| sy-03-three-crossings | `scout-mark` | 3/3 | — |
| sy-04-open-doors | `evacuation` | 3/3 | — |
| sy-05-relay-break | `factory-captured` | 0/3 | — |
| sy-06-open-road | `no-lost-raid` | 3/3 | — |
| sa-01-arrival-point | `apcs-preserved` | 3/3 | — |
| sa-02-moving-shield | `repair-budget` | 3/3 | — |
| sa-03-distant-depots | `stations-together` | 0/3 | — |
| sa-04-intercept-window | `clean-interception` | 1/3 | — |
| sa-05-three-positions | `service-preserved` | 3/3 | — |
| sa-06-shieldline | `connected-routes` | 2/3 | — |
| convoy-union | `all-convoy-trucks` | 3/3 | — |
| twin-outposts | `original-hqs` | 3/3 | — |
