# Service parking clearance review — isolated candidate, not promoted

Reviewed against the authoritative design §§6.1, 7.2–7.3 and 16.2–16.3,
`work/art/service-decks/service-clearance-proposal.md`, and current simulation
0.3.3. Production remains frozen. Approved experimental implementation and
regression evidence are isolated under `work/service-parking-candidate/`; no
shipping module or shared runtime has been promoted.

## Recommended smallest complete baseline

Use a fixed Go table of operational parking radii, separate from the existing
600 millitile aircraft radius. Adopt **exterior-only parking initially**: the
retained home foundation remains a solid rectangle, like every neighboring
building. No center exemption and no unverified apron/roof profile. Art must
subsequently fit the accepted parking contract and retained building envelope.

Preserve combat distance, armor, splash, airborne separation, Supply, service
capacities, payment, rearm/repair timing and the current proximity predicate:
`distanceTo(retained foundation, center) - 600 <= 2000`. Do not change `radius()`
or `edgeDistance()` to implement operational clearance.

The proposed per-type radii are plausible fixed contracts for the measured
art, not measurements Go should consume at runtime. The provisional 800 radius
for legacy IR.strike does not certify its missing service poses. Either author
and verify all those poses against 800 before acceptance, or explicitly choose
a conservative larger fixed contract (the 1600 maximum layout still fits).
An exhaustive catalog test should require a reviewed value for every ordinary
service aircraft; temporary strategic support planes are outside this system.

The six proposed exterior positions are geometrically feasible on open ground:
with radius1600, adjacent centers3300 apart give the specified100 margin. For a
retained3×3 workshop, the worst corner's squared distance to the rectangle is
`1800² + 1700² = 6,130,000`; integer distance2475 minus600 is1875, within2000.
This proves that six largest craft can fit around that isolated foundation. It
does not prove that six pads remain available beside cliffs, other bases or
parked ground units. Those conditions must delay landing, not erase capacity.

## Reservation and lifecycle contract

Keep `Home` as the existing paid capacity reservation. Add a separate persisted
landing reservation containing at least `{home, position}`; clearance derives
from the fixed aircraft type. This is necessary to hold a deterministic final
approach across save/restore and avoid goal changes when lower-ID aircraft
leave. Landed aircraft keep their actual position and never reshuffle.

Allocation should be a deliberate simulation step before ground movement,
not a side effect of a geometry query. Stable actor order, candidate order and
bounded retry timing must be explicit. A pure lookup supplies the same reserved
point to Return navigation and touchdown. Do not independently run two changing
allocations in `landingPoint()` and `updateAircraft()` on one tick.

Only aircraft actually entering a bounded final approach should reserve ground
space; reserve neither every aircraft's entire sortie nor a distant Return's
full flight duration. The exact approach threshold and retry/budget constants
are new behavior and need explicit approval and measurement. A fixed threshold
large enough to cover the exterior candidate envelope is preferable to a
renderer/animation-dependent value.

Check a reservation against:

- Map bounds and passable terrain using its operational circle.
- The retained home rectangle and all other retained building rectangles.
- Existing ground actors using their ordinary physical radii.
- Every landed aircraft and pending descent circle, across owners/producers,
  with separation at least the sum of operational radii plus100.

The same occupied/descending circle must block later ground movement and
construction. A touchdown-only check cannot honestly promise persistent clear
parking. Combat still sees the600 radius. Airborne movement still uses600.
Emergency ground aircraft retain parking occupancy until actual takeoff, even
when producer loss has cleared `Home`.

Release pending reservations on departure/cancelled Return, destruction,
changed home, invalid ownership or producer loss. Revalidate before touchdown;
blocked craft retain their capacity reservation, wait or choose another legal
candidate, show `landing_blocked`, and consume ordinary endurance. Preserve the
last-endurance-tick successful-landing boundary and never refill early.

A completed paid production job allocates and spawns atomically into a legal
parking area; if none exists, retain its paid job/Supply/service reservation
and existing `exit_blocked` behavior. Do not create a half-spawned actor or a
phantom reservation for `NextID`.

Current `spawnScenario()` creates authored aircraft **airborne**, with a `Home`
capacity reservation. Do not silently relocate those mission starts to pads.
They must use the common physical parking rules when they actually Return.
This distinction matters to tutorial/campaign sorties and scripted arrivals.

## Concrete integration boundaries

A spacing-only change in `service_geometry.go` is insufficient. The minimal
complete behavior touches these call sites:

| Source | Required responsibility |
|---|---|
| `service_geometry.go` and a small new parking module | Fixed radii, bounded candidates, shared geometry, pure reserved-point lookup |
| `state.go`, `validate.go` | Persisted reservation, bounded coordinates/owner/home/type consistency; no derived cache in saves |
| `engine.go` | Explicit deterministic allocation/invalidation stage and per-tick budget |
| `aircraft.go`, `service_loss.go`, `aircraft_rebase.go` | Touchdown, blocked/endurance boundary, loss/rebase/departure cleanup |
| `economy.go` | Atomic completed-job parking/spawn using the same predicate |
| `navigation.go` | Return goal; actual ground clearance, `mobileClear`, construction exclusion |
| `support.go`, small boarding helper | Grounded aircraft boarding contact uses its operational body; retain combat range and bounded legal unload exits |
| `navigation_mobile.go` | Dynamic A* obstacle raster includes parked and pending circles |
| `navigation_bridge.go` | Swept start bridge honors the same operational obstacles |
| `mission.go` tests | Preserve airborne authored starts and normal eventual service |

Use a dedicated ground-obstacle helper rather than changing the generic combat
radius. Applying it only in final movement would leave A* planning through
parked wings and repeatedly blocking; applying it only to A* would still allow
actual motion, construction or the sub-grid start bridge to cut through them.
All these routes must share the same intended obstacle contract.

Do not put pending/parked circles into `navigationCells()`' static cache without
adding correct invalidation; that cache is keyed by static navigation revision.
The existing dynamic occupancy cache is tick-scoped and is the closer fit.
Revalidate actual movement against live occupancy even when a conservative
cached path was formed earlier. Snapshotting obstacles for an allocation pass
must include aircraft spawned earlier in the same economy phase. The current
combat spatial index is not automatically proof of fresh allocation geometry.

## Bounded computation and privacy

Start with six proven exterior candidates followed by a deduplicated fixed
perimeter list, capped at128 per aircraft/proposal attempt. Retain an accepted
reservation rather than searching every tick. Retry failed allocation on a
fixed modest cadence and meaningful local changes. Establish a small explicit
per-tick allocation budget after profiling; do not claim that128 candidates
alone bounds the whole workload when many planes return together.

For reference,64 simultaneous planes ×128 candidates ×688 actors is more than
5.6million potential actor checks in one pass. Prefer one bounded local obstacle
collection per affected producer/pass and exact integer checks over it, with
stable ordering. Never use unordered map iteration for winners. Derived cache
state must reconstruct deterministically and not change save/replay outcomes.

No JSON mesh/atlas bounds or service-surface height polygon may be imported into
simulation. Those renderer polygons describe support height, not a certified
empty apron volume. Any later apron exception should be a separately approved,
small Go integer solid/clear profile selected by retained `FootprintType`, with
physical art proven against it.

Keep advisory preview's current privacy boundary: hidden landed aircraft or
reserved future positions must not become an exact build-site oracle. Publish
only appropriate owned/visible information. Actual orders may encounter real
world occupancy through the existing authoritative execution path.

## Acceptance needed before a compatibility boundary

1. Ordinary6/6/4/2 capacities and all aircraft types, mixed-size groups, retained
   3×3/4×4 conversion to six, six largest craft on open flat ground.
2. Simultaneous Return, production, adjacent producers and different owners;
   reserved approaches cannot choose the same space. Stable landed positions
   after another craft dies, leaves or rebases.
3. Edge/cliff/walled bases, obstructed center, exterior fallback, no legal pad,
   moving ground traffic, construction after reservation and emergency loss.
4. Full ground route/actual movement/start-bridge agreement; no enlarged combat
   hit/range/splash/airborne collision statistics.
5. Low power, service/paid repair, capacity reservation conservation, production
   blocked exit, final endurance landing, capture/sale/loss and explicit rebase.
6. Mid-approach and mid-service Save/Restore, full replay and native/WASM parity;
   ordinary authored aircraft openings remain airborne and valid.
7. Simultaneous blocked/returning maximum-air and combined actor benchmarks with
   real test gates unchanged. Record exact host/GPU/other workloads separately.
8. Actual original-size occupied render review at1×/2×, ordinary and retained
   foundations. Integer nonintersection is not proof of readable art or shadows.

The existing600 collision-footprint requirement means this is a new stationary
operational reservation rule, not a harmless render fix. Approve its semantics
before implementation, then use a new simulation compatibility boundary and
rerun affected mission/aircraft acceptance. No current0.3.3 evidence should be
relabeled as covering it.

## Optional acceptance lane at the review boundary

The final0.3.3 authored skirmish matrix is complete in commit`aa86596`:
13/13 ordinary elimination/economy/restore/full-replay gates; the remaining ten
receipts are individually classified in that evidence, not silently ignored.

Optional0.3.3 IR06 Easy/Normal pass. The latest Hard pilot (`pilot-10`) wins the
main mission at tick7447 with both originals still embarked in their APCs, so its
optional observer objective is not earned. In `pilot-12`, SY01 Hard boards all
four original engineers into two real two-slot garrisons, but the forward
garrison is destroyed at tick5319; no survival pass is claimed. SY05 Normal
captures the optional factory at tick2548, then its designated engineer dies
before a later Move at tick5835; that attempt ends on a test-driver `not_owner`
receipt, not an engine defect. These outcomes and prior failures are preserved
under `work/evidence/mission-playthroughs/optional-0.3.3/`. Tactical runs remain
paused during the isolated service-parking candidate; production is unchanged.


## Candidate interaction finding

The complete native short suite caught a boarding gap that isolated landing
checks did not: infantry could not reach the combat-radius boarding point of a
parked airlift. The approved candidate-only correction uses operational body
contact for grounded aircraft boarding, preserving airborne contact, combat
radii, ownership, channel durations and cancellation. Existing bounded unload
search already supplies clear exit positions; its distance limit is unchanged.
Interaction and container tests, including loaded rebase/service and full
save/replay, are recorded in the candidate README. This finding reopened the
first review source boundary rather than being silently excluded from testing.


## Isolated candidate handback

Source review and functional/race/native-WASM checks are complete for the isolated
boarding-corrected lock in
`work/service-parking-candidate/review-boarding-source.json`
(SHA256 `db8f70b84892014099c6b1f51bd93e5ac0b4e765a98e473107a3b54a6149b917`).
The complete patch is `candidate-boarding-review.diff`; its exact27-file list,
source identity, retained failures and verification logs are in that directory.

Coordinated native ABBA measurement on AppleM4/16GiB passed unchanged25/40ms
p95/p99 gates. Candidate combined688-actor workload p95 was18.731–19.230ms and
p99 was24.579–25.304ms. All64 aircraft returned on the separately identified
exterior-compatible layout. The original dense layout still leaves40/64 blocked
at tick2399; no service range, combat radius, actor count or deadline was relaxed
for that layout. See the candidate README for baseline values and exact host
conditions. These results do not certify browser performance or balance.

Actual-Go-position native art composition, clear player feedback for blocked
landing/production, explicit apron-policy acceptance and the eventual combined
simulation compatibility/runtime boundary remain promotion gates. Shipping0.3.3
is still unchanged; source review and native timing alone do not ship this rule.
