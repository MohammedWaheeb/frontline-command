# Harvest routing verification

The fixed world southeast queue approach favored some supply-center directions.
A controlled two-hauler fixture previously delivered 16,200 credits south/east
versus 21,600 west/north over 600 simulation seconds. These prepared fixtures
isolate routing; they do not represent paid shipping-map openings.

The current approach rotates with each hauler's actual depot. The head approaches
from the far side of the field, preserving room beside close supply centers.
Waiting haulers have unique, stable parking slots and enough clearance for the
500-millitile path grid and both 800-millitile collision radii. A change in FIFO
order no longer sends two waiting trucks to the same position. Loader capacity,
40 credits/second extraction, cargo capacity, prices and build times are unchanged.

## Regression evidence

`pkg/sim/harvest_orientation_test.go` checks two-hauler routes for all four depot
directions at ordinary and close distances, with legal nonoverlapping fixture
spawns. The income difference must stay within 5%. The eight-hauler cases check
all four directions, a midpoint save/restore, replay from the beginning, and
progress by each individual hauler. Every hauler must deliver at least twice and
at least once during the final 300 seconds. Aggregate income must sustain at least
70% of the single loader's theoretical rate, including travel and unloading.
That bound detects congestion starvation; it is not a competitive balance claim.

Failed experiments remain in `work/evidence/harvest-*.log`. One diagnostic fixture
initially overlapped a supply footprint and placed trucks less than two radii
apart; it was corrected to assert legal initial occupancy. Another genuinely
failed because changing FIFO order reused waiting positions. A third exposed
500-unit grid rounding that put a waiter less than two radii from the head's
actual path endpoint. Stable parking and the larger first-row clearance corrected
these failures; no collision or loading distance rule was relaxed.

## Paid opening measurements

Run from the repository root:

```sh
go run work/acceptance/paid_openings.go -output work/evidence/map-openings/paid-results-obstacle-routing.json
```

The driver uses the public simulation API, authorized player views and public map
geometry. It begins with the ordinary 6,000 credits, HQ and rig. It builds power,
scouts, places a supply center, moves its rig clear and purchases a second hauler.
The same policy spends 3,200 credits per starting position and records real
execution receipts, including rejected placement candidates. It grants no money,
spawns no scenario assets, writes no simulation state and changes no map.

All four factions run at every start of all six competitive launch maps: 72
openings. At 600 seconds the latest per-start income is identical between factions:

| Map | Income by start (credits) | Largest difference / maximum |
|---|---|---:|
| Copper Junction | 19,200 / 19,200 | 0% |
| Relay Heights | 18,600 / 18,600 | 0% |
| Dry River | 19,200 / 18,600 | 3.125% |
| Industrial Valley | 18,600 / 19,200 / 19,200 / 19,200 | 3.125% |
| Border Depots | 18,600 / 19,200 / 18,600 / 19,200 | 3.125% |
| Port Outskirts | 18,600 / 18,600 / 18,600 / 18,600 | 0% |

These are passive economy results for one real build policy, not proof of human
combat balance, every placement, every congested wall layout or all custom maps.
The earlier `paid-results.json` predates the extra dense-queue clearance; the
`paid-results-final-routing.json` file predates obstacle recovery. The current
measurement is `paid-results-obstacle-routing.json`. The old radial
probe is not comparable to these paid openings and is not used as balance evidence.

For rollback comparison, the previous `harvestGoal` is in the parent of the
routing-fix commit. Preserve the failed diagnostics rather than relabeling them
as passing results. Re-run the paid openings if queue geometry changes again.

The final constrained-layout and reservation-lifecycle cases are documented in
[harvest routing and recovery](harvest-routing.md). They include edge parking,
cliff loading points, depot loss, shared fields and the physically legal escape
from a blocked rounded path-grid start. The combined harvest/navigation race
suite passed in185.814seconds. Two-hauler orientation fixtures now all deliver
21,600credits; every dense-fixture hauler continues delivering after recovery.
