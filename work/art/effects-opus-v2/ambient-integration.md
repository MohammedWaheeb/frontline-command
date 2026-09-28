# Ambient effect integration

Updated 28 September 2026, 23:28 UTC. Source/unit checks and the actual-Go native request-path course pass; browser rendering and full-product layout review are pending. No live effect pack or shipping runtime promotion.

The twelve `ambient-04` assets retain their separately reviewed original pixels. `candidate-71` combines them with the preserved 59 combat candidates and passes actual runtime graph/PNG validation. Its 30,622,144 decoded RGBA bytes include every variant and fit the existing 32 MiB FX budget. This calculated inventory is not yet an all-pages browser residency result.

`client/src/app/ambient-presentation.ts` consumes only the current and immediately preceding authorized player snapshots. It never reads hidden world state or drives simulation. State loops are rebuilt from the current permitted actor; transition bursts deduplicate explicit events or a consecutive visible resource transition. Replace, replay seek, perspective change and a snapshot gap over forty ticks establish a new transition baseline. Pause preserves simulation-tick phase. Losing a contained/hidden/destroyed actor removes its loop.

| Effect | Disclosed source and lifetime |
| --- | --- |
| `fx.unit.dust_trail` | A current non-infantry, non-air unit changes position within its catalog speed bound between consecutive snapshots. Stops when it stops; teleport-like discontinuities do not make trails. |
| `fx.unit.rotor_wash` | Current airborne gunship, airlift or scout drone, additionally gated by its displayed altitude at or below 48 world pixels (the authored 1,400-millitile flat-ground cruise is 35 pixels). Ground attachment; no wash from an absent or high-altitude actor. |
| `fx.unit.smoke_damaged` | Current non-infantry unit at 251–500 normalized health. |
| `fx.unit.fire_critical` | Current non-infantry unit at 1–250 normalized health. |
| `fx.unit.wreck_smoke` | Explicit destroyed event for the same immediately preceding identified ground vehicle. Maximum eighty ticks, cleared when its location leaves current vision; an aircraft event cannot invent a crash position. |
| `fx.building.sell_dust` | Explicit permitted `building_sold` event, thirty-six ticks. |
| `fx.building.fire_damaged` | Complete, unsold current structure at 251–500 normalized health. |
| `fx.building.smoke_critical` | Complete, unsold current structure at 1–250 normalized health. |
| `fx.building.construction_dust` | Incomplete current structure whose actual progress increased between consecutive snapshots. An abandoned foundation does not emit ongoing work dust. |
| `fx.environment.depletion_dust` | The same field and position were visible in both snapshots, changing from positive remaining resources to zero. Thirty ticks; cleared on vision loss. Zero on first sight does not count as an observed depletion. |
| `fx.environment.shipment_arrival` | Explicit permitted `shipment_arrived` event, forty ticks. No guessed shipment timer or field balance. |
| `fx.environment.supply_station_capture` | Explicit permitted `station_captured` event, thirty-six ticks. Neutral marker does not invent team color or hidden ownership. |

`CombatEffects` owns these through the same verified `EffectLibrary`, 32 MiB allocation budget and 192-node decoration limit. Combat decorations are admitted before ambient cosmetics. Outcome symbols, labels and tactical warnings remain outside that decoration limit. Smoke/fire follows the actual displayed actor position and height; ground dust follows its ground anchor. Tall crops use actual frame bounds. All five variants use the existing motion/flashing selector; reduced-motion loops are one-frame assets.

## Evidence and remaining checks

- All 383 runtime tests pass (`work/ambient-runtime-tests-04.log`), plus app/runtime TypeScript checks (`work/ambient-app-typecheck-05.log`, `work/ambient-runtime-typecheck-05.log`) and the explicit browser fixture check (`work/ambient-fixture-typecheck-03.log`). Unit tests cover all twelve IDs, scope/visibility/identity, resource observation, pause/seek/reset, stale events, current display attachment, static reduced variants, shared pool priority and disposal. Two regressions verify that delayed missing-asset failures and removed actor types cannot persist in another perspective's diagnostics.
- The first runtime TypeScript check failed only on test fixtures constructing a protobuf Vec without its generated type marker. The unchanged failure log is preserved; fixtures now retain the original Vec metadata. No production contract was relaxed.
- `ambient-native-07/report.json` passes the exact frozen browser fixture's requests through the existing optimized Go Session bridge. All twelve effects arise from authorized views of actual movement, paid construction, sales, ordinary hostile damage, harvesting and station/shipment events. Initial actors use recorded practice placement. Renderer and art are deliberately absent: this is not browser, pixel, GPU, performance or final-art acceptance.
- The same native course separately creates a standard match from ordinary starting bases, pays for power/barracks/engineer/AT and an opposing rifle squad, weakens the enemy barracks through real attacks, sells home qualifying structures, and loses its rig to enemy fire. The resulting thirty-second countdown cancels after the engineer's real capture at tick 5964. No HP, save, outcome or snapshot is injected. Both original Go save containers are exported for the actual-App layout course.
- Free and occupied placement previews both intentionally return `accepted: true, code: indeterminate`: geometry is deferred by the existing fog-safe advice contract. The occupied site's actual ordinary order then returns `occupied`; positive paid construction passes separately. An amber proposal is never labeled a guaranteed legal site.
- Earlier native failures remain preserved: 01 correctly cleared wreck smoke when the only observer died; 02 revealed the practice-spawned supply building does not include a harvester; 03 used a map-authored station ID instead of the actual disclosed engine ID; 04 incorrectly expected exact geometry from advisory previews; 05 incorrectly expected practice defeat; 06 tried capturing a fully healthy barracks. Corrections change only the test course, not game rules or engine source.
- The immutable `integration-v16` product has source digest `62714660596fede6d101df8efe74cf98c9198c1458d2e88a1908d3e587e23e7b` and pack digest `0f40bbf6f066ae312c0bb91afa24cb14c360db4ba480a055903231433f17a12e`. It retains incomplete frozen actor art. Next: run all variants, viewport boundaries, save/replay and disposal in Chromium/Firefox/WebKit, then inspect the real App at four sizes and 100/150% scale.
- Dedicated all-page residency/variant pressure and final current-art combined-load and multiplayer courses remain separate gates. Einstein's already-running 59-effect multiplayer product is immutable and unaffected by this source work.
