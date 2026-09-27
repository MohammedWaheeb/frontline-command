# Drone service and hub-loss verification

Design sections 7, 11 and canonical scenario 25.5(4) are exercised by
`pkg/sim/drone_service_acceptance_test.go`. The suite has 14 test families and
52 recorded scenario variants. It checks simulation outcomes, ordinary accepted
commands, economic reservations, save boundaries and replay execution. These are
mechanics acceptance scenarios, not a balance verdict or rendered player test.
No aircraft prices, HP, weapons, speed, supply, slot counts or intended durations
were retuned.

## Reproduce and inspect

From the repository root:

```sh
FRONTLINE_BALANCE_EVIDENCE=../../work/evidence/drone-service go test ./pkg/sim -run '^TestDrone' -count=1 -v
```

Go runs the package tests from `pkg/sim`, hence the relative evidence path. Every
scenario directory beneath `work/evidence/drone-service` contains:

- `initial.save.json`: complete initial simulation state, including granted
  prepared assets, current reservations and any scheduled incoming projectiles.
- `commands.json`: the actual accepted command log.
- `result.json`: content/simulation metadata, final tick, full state hash and
  measured outcomes.
- `replay.fcr`: encoded replay. The test decodes it and seeks from the initial
  save without checkpoints, re-executing the entire trace and requiring the
  exact final state hash.

Representative scenarios are `drone-full-queues-hub-loss-and-two-attrition-slots`,
`drone-hub-loss-live-before-paid-queue`,
`drone-captured-hub-live-priority-over-paid-queue` and
`drone-six-independent-services-low-power-true-upgraded-true`.

The primary fixture is the synthetic 96×96 open mechanics map, seed 2505, with
Iranian player 1 and US player 2. It starts after the normal countdown at tick
100. It grants completed prerequisite infrastructure, aircraft and, when named,
completed Distributed Drone Servicing research. Infrastructure costs are added
to the prepared expenditure ledger; the fixture grant does not deduct those
costs from the player's operating credits. Prepared aircraft retain their
ordinary catalogue paid basis. This fixture therefore makes **no opening-time
or resource-efficiency claim**. Started jobs are created through normal paid
Train orders. Subsequent commands always use `Submit` and the ordinary frame.

Hub destruction and selected attrition use explicitly preloaded hostile direct
projectiles with no splash. Their full definitions are in the initial save.
The large structure-destruction hit is a boundary-testing fixture, not a claim
that a roster weapon deals that amount. All damage, armor, death, cleanup and
reservation outcomes use normal simulation code. The capture variant instead
uses an ordinary visible engineer Capture command against a prepared low-health
hub. The owner-isolation variant has three players: one ally and one opponent,
both with free Iranian service capacity and no owned slot for the test aircraft.

The recorder validates full runtime save/restore, rather than testing whether a
new structure could be placed on top of its already-landed aircraft. Legal
service pads are inside the completed producer's footprint. Explicit boundary
checks also restore while continuing for two or three ticks, restoring after
each tick and comparing with uninterrupted continuation.

## Endurance and emergency boundaries

The four Iranian types are fighter, strike, gunship/loiter and Survey ISR.

| Boundary | Measured outcome |
|---|---|
| New production | Completed drone has its reserved home and 2400 ticks / 120 seconds of endurance |
| 901 → 900 | One owner-only warning at exactly 45 seconds remaining, for all four types at normal and low power |
| 601 → 600 | One owner-only automatic Return at exactly 30 seconds remaining, for all four types at normal and low power |
| Existing manual Return | No replacement, duplicate notification or lost queued Move when crossing 600 |
| 1 → 0 at legal reserved pad | All four types land and begin service; endurance stays zero until service finishes |
| 1 → 0 too far from home | All four types are lost once, release their slot and add exactly their paid basis to lost value |
| Hub loss above 1200 | Remaining endurance is capped at 60 seconds; no flying drone is deleted merely because the hub died |
| Hub loss below 1200 | Remaining time is retained, never increased |
| Grounded producer loss | Endurance stays paused during exactly 40 ticks / two seconds of emergency lift; HP and ammunition remain unchanged |
| Repeated loss during lift | All four types reassign again without restarting that lift timer or refilling HP, ammunition or endurance |
| Ally/opponent has spare slots | Neither can be used; the unassigned owned drone keeps spending endurance |

The emergency matrix tests initial endurance 2400, 1201, 1200, 901, 900, 601,
600, 2, 1 and 0, both grounded and airborne. It includes simultaneous aircraft
expiry and hub destruction. Ordinary frame order resolves a projectile after
that tick's aircraft update, then reconciles surviving aircraft before the next
tick's production reservations. The fixture's hub dies at tick 101; grounded
emergency lift is admitted at tick 102 and finishes at tick 142.

An already empty grounded drone remains alive through the lift and is lost when
it cannot remain airborne; a legal last-tick landing is the separately tested
exception. These boundary outcomes survive save/restore and full replay.

## Six occupied slots and service timing

Six drones share one hub and service independently. The mix contains every
Iranian role, with repeated fighter and ISR slots. All begin landed with 321
remaining endurance, empty ammunition and service admitted but no work earned.
Endurance is paused throughout rearming, then resets to 2400 exactly once.
Ammunition refills only at the same completion. No HP, credit or expenditure
changes are caused by service.

| Aircraft | Normal power | Servicing upgrade | Low power | Upgrade and low power |
|---|---:|---:|---:|---:|
| Fighter | 400 ticks / 20 s | 340 / 17 s | 800 / 40 s | 680 / 34 s |
| Strike | 480 / 24 s | 408 / 20.4 s | 960 / 48 s | 816 / 40.8 s |
| Gunship/loiter | 480 / 24 s | 408 / 20.4 s | 960 / 48 s | 816 / 40.8 s |
| ISR | 360 / 18 s | 306 / 15.3 s | 720 / 36 s | 612 / 30.6 s |

The upgrade modifies service time only. Low power halves service progress but
does not change the airborne endurance clock. Full slots reject another
production reservation while an existing aircraft is returning, even though
that aircraft is physically away from the hub.

## Full queue attrition trace

The principal trace begins with two Iranian hubs, six aircraft assigned to each,
and six ordinary Train orders queued at each. Each producer allows one active
job plus five waiting positions. All 12 requests remain unpaid because every
service slot is occupied. Four source-hub aircraft are airborne and two are
landed. The alternate hub's six aircraft are landed.

| Actual tick | Result |
|---:|---|
| 101 | Both queues contain six unpaid orders, state `service_full`; operating credits and expenditure unchanged |
| 103 | Original hub is destroyed; its six unpaid jobs disappear |
| 104 | Six surviving original-hub aircraft receive one service-loss notification each; no replacement capacity exists |
| 110, 111 | Two alternate-hub occupants are lost to the prepared direct impacts |
| 111, 112 | Stable-order surviving aircraft claim the two released owned slots before waiting production |
| 403 / 443 | The remaining unassigned airborne / grounded-lift groups reach the 900-tick warning |
| 703 / 743 | Those groups reach the 600-tick automatic Return threshold |
| 1303 | The two unassigned aircraft that were originally airborne expire |
| 1343 | The two originally grounded aircraft expire, exactly 40 ticks later |
| 1360 | Six aircraft remain: four original alternate-hub occupants and two successfully returned/rearmed survivors; six unpaid jobs still wait |

The two rescued aircraft return, land and complete normal service. The queue
never steals their reservations, no extra production charge occurs, and every
lost actor is counted once. The trace records exact warning, return, slot-claim
and loss ticks, not an inferred wall-clock estimate.

## Paid jobs, capture and Recall

A separate paid job is produced by a remote hub but initially reserves the
soon-to-be-lost hub. Only one replacement slot is available. A living drone
claims that slot first; the paid job waits at its existing progress with its
450-credit payment intact. After the drone is lost, the paid job resumes at
tick 107 without another charge. Another trace lets such a paid replacement
finish at tick 460, preserving its slot through creation and leaving five
unpaid orders blocked behind it.

The Capture trace transfers the original hub at tick 262, converts its type to
US airfield under the ordinary conversion rules, keeps the old Iranian drone
owned by Iran, and immediately reassigns that drone to the last Iranian slot.
The remote paid job waits without refund or replacement charge. Existing
`capture_test.go` also covers the ten-second conversion outage, retained
physical foundation, changed capacity, grounded emergency lift, six distinct
pads and other producers' retained paid reservations.

Drone Recall is issued to all four Iranian roles using the ordinary ability
command. They keep spending endurance, keep their ammunition, and cannot fire
for the exact eight-second buff despite visible valid air/ground opposition.
The ordinary energy/cooldown rules remain in force. Existing AI tests check the
paid Recall choice and fallback to Return when the ability is unavailable.
These tests do not claim that Recall makes a particular engagement favorable.

## Demonstrated implementation corrections

1. `updateAircraft` previously killed a drone at zero before checking a legal
   reserved landing reached that tick. Landing now resolves first; only an
   aircraft still airborne at zero is lost. It gets no free endurance refill.
   Before evidence: `work/evidence/drone-last-tick-before.log`.
2. Destruction previously let `updateEconomy` reserve a replacement slot for a
   remote paid job before a live drone could request it. Live aircraft now
   reconcile invalid or absent homes in stable order before production claims
   capacity. Paid jobs retain their money/progress and resume when a slot opens.
   Capture already gave living aircraft this priority. Before evidence:
   `work/evidence/drone-hub-queue-before.log`.
3. The service admission sentinel (`ServiceWork == 1`) incorrectly counted as
   one unit of earned service work. Low-power service therefore ended one tick
   early: ISR 719 instead of 720; upgraded ISR 611 instead of 612. Completion now
   excludes the sentinel, preserving normal-power timings and exact half-rate
   low-power progress. Before evidence:
   `work/evidence/drone-low-power-duration-before.log`.

The runtime changes are confined to `aircraft.go`, `service_loss.go`, and the
service-reservation prelude of `economy.go`. No new protocol fields are needed.
`ServiceWork == 0` still means no rearming in progress; positive values include
one admission marker. Existing private aircraft fields and owner events expose
the actual endurance, home, service progress and emergency countdown.

## Validation and limits

Final checks passed: 52 recorded scenarios in 5.403 seconds; focused aircraft,
capture and service race tests in 74.985 seconds; the full short simulation race
suite in 183.889 seconds. `go vet ./pkg/sim` and `git diff --check` passed.

The final acceptance log is `work/evidence/drone-service-acceptance.log`;
the focused race log is `work/evidence/drone-service-focused-race.log` and the
broad short race log is `work/evidence/drone-service-short-race.log`. The evidence
records current content/simulation metadata and exact hashes; fixture grants
must remain explicit when comparing later runs.

All endurance thresholds and full-queue outcomes in canonical item 4 now have
backend outcome coverage. This does not establish roster balance, rendered
warning readability, or player enjoyment. It does not replace native/WASM
performance runs, human playtests, or the independent air-versus-AA opening and
sortie-economic scenarios. Existing transport tests retain the helicopter
emergency unload/local-drop and return-with-passengers behavior.
