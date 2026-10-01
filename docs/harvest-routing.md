# Harvest routing and recovery checks

Harvesting still uses the standard one-loader extraction limit, 600-credit cargo,
normal collisions and paid deliveries. The routing change does not grant credits,
change loading range, teleport vehicles or allow an actor to load ahead of a valid
FIFO reservation.

The ordinary loading approach rotates with the actual depot direction. Waiting
rows are stable across FIFO changes. When an edge, cliff, structure or another
reserved slot makes a row unusable, a bounded deterministic search chooses a
clear path-grid destination. Fallback spaces leave passing room around structures
and keep depot transit lanes clear. Reaching an assigned fallback space can join
the same queue even when constrained geometry places it beyond the normal nearby
approach radius. This is physical queue arrival, not remote extraction.

A cliff covering the preferred loading side selects another statically clear
point inside the existing loading circle. A hauler with no usable depot releases
its field reservation, keeps its cargo and gather task, and yields the extraction
area to a waiting space. The same task resumes when a depot becomes available.

Authoritative design §5.3 says: “Haulers and builders retain task reservations
during short reroutes and release them after confirmed failure.” A hauler keeps
its reservation during a short reroute; the movement system's confirmed blocked
state withdraws it. It moves toward waiting space and may rejoin after movement
recovers. Its cargo and intended gather order survive. The normal FIFO admission
check remains the only way to become the loader.

The parking cache is derived, not saved authoritative state. Its key includes
static navigation revision, field position, and each participating hauler's ID,
radius, depot identity and depot position. Restore reconstructs it. Navigation
also handles a physically clear actor whose floor-rounded grid start overlaps a
neighbor: a collision-checked initial segment reaches a legal path node without
teleporting or cutting through an actor.

## Verification

The current focused native suite passes:

- A valid cliff beside the field with both haulers eventually delivering.
- Eight haulers at a corner field, with delivery by every actor, matching
  mid-operation save/restore state hashes and full replay hashes.
- A disabled depot releasing a shared field for another owner, followed by
  recovery of the original cargo/order when the depot returns.
- Short-reroute reservation retention, confirmed-failure withdrawal, a waiting
  destination and subsequent delivery by both haulers.
- Two haulers at close and normal depot distances in all four orientations:
  21,600 credits over 600 simulation seconds in every prepared fixture.
- Eight-hauler continuous delivery in all four orientations: 18,000 / 18,000 /
  18,600 / 18,000 credits over 600 seconds, with each actor delivering at least
  twice and at least once during the last 300 seconds. Save/restore and full
  replay state hashes match for every orientation.
- A physically clear sub-grid start escaping through real movement, with
  collision checks along its initial segment and every movement tick.

The dense-fixture threshold is a non-starvation check: at least 70% of the field's
40-credit/second maximum over both the complete interval and its last half. It
is not a promised income for arbitrary terrain or a faction balance result.

`work/evidence/harvest-routing/normal.log` records the focused run.
`work/evidence/map-openings/paid-results-obstacle-routing.json` records 72 ordinary
paid openings across six installed skirmish maps and all four factions. These
start from normal player assets and spend exactly 3,200 credits on power, supply
and a second hauler. The policy uses actual accepted commands, public map geometry
and authorized player views. All 72 conserve credits and spending; 600-second
income is 18,600–19,200 credits, with maximum within-map/faction spawn spread of
3.125%. Rejected placement candidates remain in the evidence. These passive
openings do not establish combat balance or human playtest acceptance.

Run the checks with:

```sh
go test ./pkg/sim -run '^TestHarvest|^TestPathEscapesCollisionFreeSubgridStart$' -count=1
go test -race ./pkg/sim -run '^TestHarvest|^TestPathEscapesCollisionFreeSubgridStart$' -count=1
go run work/acceptance/paid_openings.go -output work/evidence/map-openings/paid-results-obstacle-routing.json
```

Truly inaccessible routes still use the normal blocked-order indication. These
bounded cases do not prove that every possible custom layout has a usable supply
route or enough parking space for every actor.

The complete focused harvest/start-bridge command also passed under Go's race
instrumentation in 185.814 seconds. Evidence:
`work/evidence/harvest-routing/race.log`. The broader native short suite was run
separately by the integration lane; the focused result is not a full release gate.
