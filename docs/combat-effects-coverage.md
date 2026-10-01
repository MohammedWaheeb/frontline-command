# Effect coverage ledger — 132 exact manifest entries

Read-only source inspection on 2026-09-28 after `e256afc`. This ledger updates the historical pre-integration [tactical audit](tactical-presentation.md). It is not a count of finished effects or a new visual acceptance. See [the integration proposal](combat-feedback-integration.md) for candidate privacy, pipeline gaps and the required actual Go course.

Manifest SHA-256: `7b3c031dd9f7a448930a7f2f9915eed98d4d326646d14232b82b675598d508b6`. Exactly 132 effect IDs; all have manifest status `planned`; **zero of 132 declared output directories exist**. Existing runtime vectors/poses provide parts of the required information outside those output directories. The parent actor-status lane is in progress and its separate acceptance is not implied by this source review. Optional candidate fields are not yet shared shipping protocol/runtime.

| Group | Count |
|---|---:|
| weapon_muzzle | 28 |
| impact | 11 |
| projectile | 12 |
| explosion | 8 |
| unit | 26 |
| order | 9 |
| placement | 5 |
| range | 6 |
| warning | 11 |
| building | 9 |
| fog | 4 |
| environment | 3 |

Every manifest ID appears once below. “Candidate” means the reviewed optional Go field must be promoted before that specialization works; “path” identifies source behavior, not final art approval.

| Exact manifest ID | Authorized data | Current path | Remaining constraint / work |
|---|---|---|---|
| `fx.weapon_muzzle.RIF` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.REC` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.ELI` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.APC` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.AUTO` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.TANK` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.AT` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.ART` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.AA` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.FIGHT` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.STRIKE` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.GUN` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.US_FIGHT` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.US_STRIKE` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.US_GUN` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.IR_ART` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.IR_FIGHT` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.IR_STRIKE` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.IR_LOITER` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.SY_ART` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.SY_AA` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.SY_BUGGY` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.SY_TANK` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.MISSILE` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.IR_MISSILE` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.SY_ROCKET` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.TURRET` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.weapon_muzzle.AA_POST` | Candidate weapon ID; old source actor only | Available fire/volley/launch actor pose | No dedicated muzzle node/atlas; avoid reconstructing weapon after source conversion/death. |
| `fx.impact.miss_ground` | Missing outcome | Generic impact/shake only | Entity zero/unknown is not miss; needs separate reviewed disclosure. |
| `fx.impact.blocked_shot` | Missing outcome | No projectile-block symbol | Order/LOS rejection is not a fired blocked projectile. |
| `fx.impact.hit_infantry` | Candidate confirmed hit/armor | Generic impact/shake only | Require hit+infantry; no target lookup to recover redacted metadata. |
| `fx.impact.hit_light` | Candidate confirmed hit/armor | Generic impact/shake only | Includes landed aircraft at resolution; do not infer from current unit type. |
| `fx.impact.hit_heavy` | Candidate confirmed hit/armor | Generic impact/shake only | No numeric damage or armor inference for redacted impacts. |
| `fx.impact.hit_structure` | Candidate confirmed hit/armor | Generic impact/shake only | Destroyed/redacted and splash victims stay generic. |
| `fx.impact.hit_air` | Candidate confirmed hit/armor | Generic impact/shake only | Use only authorized body presentation; no hidden trajectory. |
| `fx.impact.intercepted_missile` | Existing explicit event | Shake/audio only | Needs distinct symbol; event owner is attacker and point is warning/impact point. |
| `fx.impact.decoy_defeat` | Existing explicit event | No distinct impact symbol | Use decoy_triggered, never guessed impact pairing. |
| `fx.impact.cover_mitigated` | Candidate positive cover cue | No distinct impact symbol | False/omitted means unknown, not no cover. |
| `fx.impact.illegal_target_marker` | Existing own receipt/planner | Controller explanation/placement rejection | Not a combat outcome; optional revert uses matching original input. |
| `fx.projectile.tracer_small` | Missing authorized endpoint | Instantaneous shot actor pose | Cannot draw source-to-target tracer from guessed target. |
| `fx.projectile.tracer_auto` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.shell_cannon` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.missile_at` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.shell_artillery` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.rocket_ir` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.mortar` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.missile_aa` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.bomb` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.tactical_missile` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.strategic_missile` | Existing body; optional visibility presence | Small dot or missile diamond | No dedicated body/trail atlas; only successive authorized samples, no extrapolation. |
| `fx.projectile.interceptor` | Missing authorized pairing/path | Battery launch pose plus separate event | No nearest-event matching or invented interception flight. |
| `fx.explosion.small` | Existing authorized impact | Generic shake only | No dedicated burst; unknown impact is not a hit/miss classification. |
| `fx.explosion.vehicle_light` | Existing destroyed + prior permitted actor | Available death/crash/wreck pose | No dedicated explosion; unknown prior actor uses generic; sight loss is not death. |
| `fx.explosion.vehicle_heavy` | Existing destroyed + prior permitted actor | Available death/crash/wreck pose | No dedicated explosion; unknown prior actor uses generic; sight loss is not death. |
| `fx.explosion.aircraft` | Existing destroyed + prior permitted actor | Available death/crash/wreck pose | No dedicated explosion; unknown prior actor uses generic; sight loss is not death. |
| `fx.explosion.building_small` | Existing destroyed + prior permitted actor | Available death/crash/wreck pose | No dedicated explosion; unknown prior actor uses generic; sight loss is not death. |
| `fx.explosion.building_large` | Existing destroyed + prior permitted actor | Available death/crash/wreck pose | No dedicated explosion; unknown prior actor uses generic; sight loss is not death. |
| `fx.explosion.blast_radius_2` | Catalog/optional instance splash | Warning field, not explosion cloud | A boundary is not an authored explosion; essential warning cannot be occluded. |
| `fx.explosion.blast_radius_1_5` | Catalog/optional instance splash | Warning field, not explosion cloud | A boundary is not an authored explosion; essential warning cannot be occluded. |
| `fx.unit.selection_ring_035` | Catalog footprint | Vector selection ring | Audit native size vs minimum screen ring; no extra collision bodies. |
| `fx.unit.selection_ring_06` | Catalog footprint | Vector selection ring | Keep actual footprint/contact on raised ground. |
| `fx.unit.selection_ring_08` | Catalog footprint | Vector selection ring | Keep actual footprint/contact on raised ground. |
| `fx.unit.health_bar` | Current public ratio | Vector health bar | Settings respected; exact foreign HP absent. |
| `fx.unit.veterancy_1` | Public rank | Vector chevron | Not evidence of unknown upgrades. |
| `fx.unit.veterancy_2` | Public rank | Vector chevrons | Not evidence of unknown upgrades. |
| `fx.unit.ammo_pips` | Own private ammo/charges | Parent actor-status caption/pips lane | Foreign ammo never shown; parent actual-course acceptance separate. |
| `fx.unit.concealed` | Current authorized public concealed | Pose/alpha + parent badge | No hidden enemy actor can be created from this effect. |
| `fx.unit.ambush_ready` | Own private flag | Diamond + parent badge | No cooldown-derived readiness. |
| `fx.unit.designated_target` | Optional active effect | Parent status badge lane | Requires authoritative designated expiry, not cast/cooldown inference. |
| `fx.unit.hull_down` | SA tank deployed/effect | Deployed pose + parent badge | No hull-down cue for arbitrary deployed actors. |
| `fx.unit.relay_boost` | Optional active effect | Parent status badge lane | Does not expose exact effective sight coverage. |
| `fx.unit.drone_recall` | Optional active effect | Parent status badge lane | Return order alone is not proof of recall buff. |
| `fx.unit.disperse` | Optional active effect | Parent status badge lane | Do not infer continued buff after firing/boarding. |
| `fx.unit.repairing` | Public working state | Repair pose + parent badge | No beam target/heal amount disclosed for all viewers. |
| `fx.unit.healing` | Public working state | Work-heal pose / parent badge if supplied | No invented target link or numeric healing. |
| `fx.unit.capture_channel` | Public state/progress/deadline | Work/channel pose + parent selected bar | Target association only from own intent; no hidden foreign target link. |
| `fx.unit.sabotage_channel` | Public state/progress/deadline | Work/channel pose + parent selected bar | Do not infer hidden target/buff deadline. |
| `fx.unit.emergency_countdown` | Own endurance + optional takeoff deadline | HUD + parent emergency badge | Do not restart deadline on reconnect; parent real-course acceptance separate. |
| `fx.unit.return_warning` | Own Return/endurance, explicit events | HUD/caption + parent badge | Queued Return is intent, not immediate flight state. |
| `fx.unit.no_landing_slot` | Public blocked state / own home loss | HUD/caption + parent badge | Not a newly invented event; private slots remain private. |
| `fx.unit.dust_trail` | Authorized movement only | No dedicated effect | Cosmetic; stop immediately on disappearance. |
| `fx.unit.rotor_wash` | Authorized flight/state only | Rotor actor animation only | No dedicated wash; not damage/coverage. |
| `fx.unit.smoke_damaged` | Current visible health | Damaged pose only | Cosmetic threshold; no unmodeled damage-over-time. |
| `fx.unit.fire_critical` | Current visible health | Damage/critical pose only | No dedicated fire; cannot obscure warnings. |
| `fx.unit.wreck_smoke` | Explicit destroyed | Death/wreck art only | No dedicated smoke; no selection/collision, no fog-death inference. |
| `fx.order.move_marker` | Own accepted queue | Numbered move symbol/intent line | Straight intent, not collision-safe path. |
| `fx.order.attack_marker` | Own queue + current permitted target | Attack symbol/intent line | No line to default0,0 or hidden memory target. |
| `fx.order.attack_move_marker` | Own accepted queue | Distinct attack-move symbol | Not immediate hit approval. |
| `fx.order.waypoint_queue` | Own queue/patrol points | Numbered markers/lines | Preserve indices; no private navigation route. |
| `fx.order.blocked_order` | Public blocked state | First-order cross | Precise failure reason still from Go advice/receipt. |
| `fx.order.rally_flag` | Own private rally | Flag/intent line | Unset0,0 sentinel is not drawn. |
| `fx.order.guard_anchor` | Own order/current permitted target | Guard intent marker | Internal automatic stance anchor/leash is not exposed. |
| `fx.order.force_fire_area` | Own point + catalog splash | Intent area when available | No hidden occupancy or confirmed hit. |
| `fx.order.rejected_order_revert` | Own matching receipt/planner | Error notice/rejected placement | No dedicated world revert; preserve original pending input to add one. |
| `fx.placement.build_ghost_valid` | Go advice | Projected vector footprint/preview | Do not equate advisory online result with execution guarantee. |
| `fx.placement.build_ghost_invalid` | Go advice/planner | Invalid footprint/reason | Unknown states must not be green. |
| `fx.placement.build_radius` | Go rule, no presentation scalar | No ring | Expose reviewed single-source geometry before exact display. |
| `fx.placement.power_impact` | Own economy + catalog | Cost/power explanation | No dedicated world effect; arithmetic explanation is not placement approval. |
| `fx.placement.footprint_grid` | Public physical dimensions | Projected footprint ghost | Mixed heights use same TerrainSurface as command picking. |
| `fx.range.weapon_range` | Catalog min/max edges | Pure descriptor only; no world ring | Advisory edge-distance expansion, target size/LOS/readiness remain Go. |
| `fx.range.min_range` | Catalog min/max edges | Pure descriptor only; no world ring | Advisory edge-distance expansion, target size/LOS/readiness remain Go. |
| `fx.range.abm_coverage_14` | Needs effective or single-source metadata | Actual fog/deployed state only; no range ring | Do not copy private/constant mechanics into authoritative JS; default close detection differs from catalog zero. |
| `fx.range.aegis_coverage_10` | Needs effective or single-source metadata | Actual fog/deployed state only; no range ring | Do not copy private/constant mechanics into authoritative JS; default close detection differs from catalog zero. |
| `fx.range.sight_radius` | Needs effective or single-source metadata | Actual fog/deployed state only; no range ring | Do not copy private/constant mechanics into authoritative JS; default close detection differs from catalog zero. |
| `fx.range.detection_radius` | Needs effective or single-source metadata | Actual fog/deployed state only; no range ring | Do not copy private/constant mechanics into authoritative JS; default close detection differs from catalog zero. |
| `fx.warning.tactical_impact_marker` | Existing + optional splash | Exact area/ETA world+minimap | Verified tactical course; no hidden body inference. |
| `fx.warning.strategic_impact_marker` | Optional instance/operation splash | Candidate exact area; old point-only | Promote matching protocol/runtime together. |
| `fx.warning.skybreaker_route` | Go owner preview plan | Three-target review/approach/ETA | Verified isolated candidate; not enemy route or execution guarantee. |
| `fx.warning.saturation_markers` | Six IDs/deadlines + optional splash | Distinct labels/areas world+minimap | Candidate2000 circles; old runtime points, preserve both waves. |
| `fx.warning.raid_exit_marker` | Public actual reserved exits | Exit squares/deadline | Verified course, not generic blast circle. |
| `fx.warning.safehouse_exit_marker` | Observed transfer destination | Destination diamond only | Private collision exits/source/passengers intentionally unavailable. |
| `fx.warning.shieldline_ring` | Zone radius/start/until | Preparing/active ring/ETA | Not invulnerability or universal ABM coverage. |
| `fx.warning.recon_sweep_circle` | Zone radius/start/until | Preparing/active ring/ETA | Scan does not imply concealment detection. |
| `fx.warning.launch_reveal` | Optional public actor effect | Parent launch-reveal badge | No tracking after entity ceases authorization. |
| `fx.warning.defeat_countdown` | Public player defeatAt | Descriptor and own announcer caption | No dedicated all-player persistent clock identified in renderer. |
| `fx.warning.endgame_reveal_pulse` | Explicit public indicators | Minimap-only symbol | Verified no world entity/fog/selection disclosure. |
| `fx.building.capture_channel` | Engineer state, own target intent | Worker pose/channel overlay | No universal foreign target link. |
| `fx.building.sabotage_disabled` | Public disabled + optional effect | Disabled pose/parent badge | Generic disabled does not prove sabotage cause. |
| `fx.building.sell_dust` | Public selling/progress | Sell pose only | Dedicated dust missing; removal on actual sell event. |
| `fx.building.fire_damaged` | Public health | Damaged/critical pose only | No dedicated fire; no implied damage-over-time. |
| `fx.building.smoke_critical` | Public health | Damaged/critical pose only | No dedicated smoke; preserve selection/readability. |
| `fx.building.low_power_icon` | Own economy only | Low-power pose/HUD/parent badge | No ally/enemy economy inference. |
| `fx.building.disabled_icon` | Public enabled/state | Disabled pose/parent badge | No inferred cause or private cooldown. |
| `fx.building.construction_dust` | Public progress/complete | Foundation/construction pose | No dedicated dust; progress remains Go. |
| `fx.building.sabotage_resistance` | Optional active effect | Parent resistance badge | Exact expiration only from effect, not cooldown. |
| `fx.fog.unexplored` | Authorized visible/explored masks | Terrain-fragment dark fog | Cosmetics cannot brighten/reveal hidden world. |
| `fx.fog.explored_unseen` | Masks + permitted memory | Fog/scenery/building-memory silhouette | Mobile enemies removed, no current hidden status. |
| `fx.fog.last_seen_timestamp` | Memory.seen | Memory silhouette; timestamp label absent | Timestamp is stale observation only. |
| `fx.fog.reveal_edge` | Exact fragment visibility | Hard conservative fog edge | Aesthetic softening remains independent review; no expanded disclosure. |
| `fx.environment.depletion_dust` | Public remaining + current visibility | Resource depletion state art | Dedicated dust absent; remote strategic data does not grant local sight. |
| `fx.environment.shipment_arrival` | Public schedule/explicit event | Resource apron/state and alert | No dedicated arrival burst; public warning must not lift fog. |
| `fx.environment.supply_station_capture` | Authorized owner/progress | Station ownership/state flag | No dedicated burst; reveal only authorized object state. |

## Mechanical audit receipt

- Enumerated `assets/manifest/asset-manifest.json` entries whose ID begins `fx.`; asserted exact set equality with the 132 ledger rows and no duplicate keys.
- Checked each declared output with filesystem existence; none exists. The asset manifest was not edited.
- Read `assets/pipeline/manifest/gen_manifest.py`, `render_all.sh`, sprite render/export interfaces and `client/scripts/ui/art-plugin.mjs`; FX serving/index/package support is absent at this audit boundary.
- Read current `readFeedback`, actor cue/pose/death paths, tactical overlays, pure actor status, fog/memory, audio event selection and the isolated Go combat candidate. Source-only findings are not rendered proof.

Source locks for stable reviewed inputs:

| Path | SHA-256 |
|---|---|
| `client/src/app/tactical-presentation.ts` | `68c1b735bc5b08144d566ba72c4c57f9651e713d81ad88133a583c526a516aa3` |
| `client/src/render/tactical-overlay.ts` | `7f13b5cbc33458d58744b07016d566de22d4cf9d0a0244f96cf2f152533df6fc` |
| `client/src/render/poses.ts` | `bbc901992fe3f2bd95b43a80e23b2e5b73d3345bd1b88a5a498b652f53af7df9` |
| `client/src/audio/director.ts` | `168d6811e456d17826a87738a6848d0e35f1adf266f7dc8113e44c2734b07e79` |
| `client/src/audio/battlefield-sound.ts` | `904bd3cd7f0c2ddedd7d90fb6416706bdb4d18a6be042aace7b028b3c74794e8` |
| `client/scripts/ui/art-plugin.mjs` | `258176106ecce13155cff47b6fdebd3b62410affdb7897a0bbdfc218bbf343f8` |
| `work/combat-feedback-candidate/source-lock.json` | `a27e70f3df5aeb330e701be27a9d1116028bee5227542b6fd9c7b568b0a7fc33` |
