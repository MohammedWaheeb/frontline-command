# Authored-content validation evidence

This records source-level and native Go checks, not a finished-game certificate.
The authoritative content catalog SHA-256 at the recorded run is
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`, simulation
`0.2.0`. Exact current map and mission hashes are in `content/index.json`.

## Passing checks

- `make check-content`: 32 maps and 31 missions, including all four faction
  variants of tutorial five at all three difficulties. This is 102 actual
  initial engine constructions and opening save/restoration comparisons.
- `check-index.mjs`: all 63 map/mission files match their indexed bytes, SHA-256
  and metadata; eight launch maps; all 31 presentation files match their
  mission/objective counts and have unique transcript keys.
- `check-runtime.go`: each selected mission/difficulty advances to tick 700
  (30 seconds after the opening countdown), with a save at tick 350 and an
  independent restored continuation compared by full Go state hash. The exact
  case records are `work/claude/05-authoring/evidence/early-runtime.json`.
  The final run has 102/102 identical continuations, zero terminal outcomes
  and zero missing original groups at tick 700.

The runtime smoke audit reports missing original groups and any terminal
outcome; passing it does not prove a required objective can be completed later,
that a checkpoint is reachable under pressure, or that the optional objective
is possible on all difficulties. It does not simulate user orders.

## Measured starting economy diagnostic

`check-economy.go` runs the actual Go harvesting loop on the unchanged six
competitive maps. It prepares two identical US haulers, an HQ, power and a
supply center for each spawn, submits ordinary Gather orders, then records
income every 60 seconds for 600 simulation seconds. Two starts are measured at
a time for four-player maps, without hostile actors. Prepared buildings and
haulers isolate supply travel; this is not a paid opening-build test.

The default fixture places the supply center radially between the starting HQ
and nearest 36,000-credit field. Its exact requested and actual center positions
are recorded, because scenario placement may choose a nearby legal footprint.
The original diagnostic found:

| Map | Credits delivered after 600 seconds across starts | Observation |
|---|---:|---|
| Copper Junction | 21,600 / 21,600 | Equal for this fixture |
| Relay Heights | 21,600 / 21,600 | Equal endpoint; transient delivery timing differs |
| Dry River | 21,600 / 21,600 | Equal endpoint; transient delivery timing differs |
| Industrial Valley | 16,200 / 21,600 / 18,000 / 18,600 | Exceeds the 5% design target |
| Border Depots | 16,200 / 18,000 / 16,200 / 18,000 | Exceeds the 5% design target |
| Port Outskirts | 16,200 / 15,600 / 16,200 / 15,600 | Endpoint spread below 5% for this fixture |

Those figures exposed a review issue; they do not certify the first three maps
balanced or establish that terrain alone causes the four-player spread. The
fixture rotates a 4×3 supply footprint's placement direction while the actual
footprint does not rotate. Initialization relocation and two-hauler congestion
must be separated from layout fairness in the next review. The final rerun is
`evidence/economy-radial.json` with actual positions (all 18 radial
setups stayed at their requested centers and reproduced the table); `economy.json` and
`economy.log` preserve the first diagnostic.

A globally aligned alternative (`-radial=false`) was rejected as evidence:
one center moved onto a resource field under the old scenario-placement rules,
blocking loading, and another setup could not be placed. Root corrected the
shared Go placement check to preserve the same one-tile field/station/shipment
access margin for scenario and ordinary construction. All shipping mission
openings pass the corrected rule. The failed alternative remains documented in
`economy-aligned-errors.log` and `zero-income-state.json`; it must not be used
as a map-income measurement. No shipping map balance was retuned to conceal it.

`map-review.json` is a geometric Dijkstra diagnostic only. It is not Go income
measurement, tactical pathing proof, combat balance or a competitive approval.

## Next acceptance work

1. Play each mission through victory, failure, optional objective and a
   non-opening checkpoint reload at all difficulties. Preserve actual commands,
   saves and replays for any failure or correction.
2. Complete tutorial input proof for select/stop/groups/rally/rejected orders
   and transport boarding/unloading; world conditions alone do not prove those
   interface operations occurred. Tutorial two now uses the real completed
   `emergency_rig_ready` job event, and tutorial five has all faction variants.
3. Review competitive starts with legal paid openings and comparable supply
   placement, then contest the routes in all six faction matchups. Industrial
   Valley and Border Depots presently have explicit unresolved parity evidence.
4. Verify assets, subtitles/voices, objective markers, tutorial hints and all
   scenarios in the product UI. No visual-playability claim follows from these
   native checks.
