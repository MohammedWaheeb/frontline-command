# Tactical presentation truth and effect coverage

Audit date: 2026-09-28. Baseline inspected at `588f48b`; simulation/runtime 0.3.3. This is a pure descriptor and source audit, **not a rendered-effects acceptance or a claim that the 132 effects are complete**. Root retains renderer/protocol/Go ownership. No gameplay, renderer, asset, UI or protocol file was changed by this slice.

Authoritative references: [design](../outputs/frontline-command-game-design.md) sections 4.1, 5, 6.3–6.5, 7–8, 12, 14, 21.4–21.5, 22–23; [Go view filtering](../pkg/sim/visibility.go), [operation views](../pkg/sim/operation_views.go), [combat](../pkg/sim/combat.go), [strategic operations](../pkg/sim/abilities.go), [service loss](../pkg/sim/service_loss.go), [catalog](../pkg/content/rules.json), [protocol](../client/src/protocol/frontline_pb.ts).

Follow-up: the bounded [renderer integration and actual Go acceptance](tactical-overlay-acceptance.md) now supersedes the pre-integration renderer findings below. This document preserves the original source audit and 132-entry inventory; its missing-wire and unmounted-effect limitations remain explicit.

## Pre-integration correctness findings

1. `BattlefieldRenderer.drawTactical()` draws warning projectiles with a fixed 38×19 pixel ellipse and all operations with a fixed 55×27.5 ellipse. Neither is a world-space blast radius. The catalog gives all three tactical weapons a 2,000 millitile splash radius. The two strategic projectile IDs have no catalog entry even though Go stores their real 2,000 radius internally. A raid or transfer has an exit/destination marker, not a damage circle.
2. The projectile dot can appear at a fake flight position. Go substitutes a hidden warning projectile's position with its public impact point. Equality with the impact cannot distinguish this substitution from a legitimately visible final position. Do not animate that dot as a real body or reconstruct a launch/travel route.
3. `snapshot.zones` already provides complete shieldline/scan center, radius, preparation start and expiration. The renderer currently ignores it. Raid warnings already carry the actual reserved exit positions; these are also ignored. Transfer warnings intentionally disclose only an observed destination, never a hidden source or its private collision-tested exits.
4. Operation deadlines have different meanings. `second_volley.at` is the pending **launch**, not impact. `skybreaker.at` is the current expected impact tick and can move later when a real plane is delayed. The persistent operation is more current than the one-shot `airstrike_warning` event. Markers must follow successive snapshots and remain present until Go removes them.
5. The minimap omits warning projectiles, zones, raid/transfer markers, authorized pings and `StructureIndicator` endgame pulses. The latter are **minimap only**: they grant no live entity, world target, health, sight or memory update. They must not be installed in the world scene or targeting lookup.
6. Current selected-order lines inspect every `order.position`, including default `(0,0)` values on target-only orders. They omit moving-target resolution and patrol intent. A straight line is an order intention, not a verified path. Private Go navigation paths, landing slots, collision detours and last-target positions are absent from the feed.
7. Current actor overlays provide selection, health, rank and an own Ambush diamond; poses cover several public states. Most status symbols, selected range outlines, exact countdown captions and detailed impacts remain absent. A disabled pose does not prove sabotage; a cooldown does not prove a buff remains active.

## Pure module contract

[client/src/app/tactical-presentation.ts](../client/src/app/tactical-presentation.ts) exports:

```ts
const presentation = tacticalPresentation(authorizedSnapshot, matchingCatalog, selectedIds);
const deadline = tacticalDeadline(snapshot.tick, authoritativeAt);
```

The caller supplies exactly the current authorized perspective and its compatible Go catalog. This module neither fetches global state nor stores prior snapshots. It uses no wall clock, randomness, DOM, renderer, network or simulation. Call it once when the snapshot/selection changes, not once per animation frame. It does not issue commands or determine their legality.

All positions/distances are **Go millitiles**, with 1,000 per map tile. Deadlines use **20 simulation ticks per second**. `remainingSeconds` may be fractional; an integer caption should round up, so one remaining tick is not mislabeled expired. Tick pause, speed changes, replay seek, delayed observer time and reconnect are reflected by the supplied snapshot. Do not substitute local real time for simulation time.

| Output | Contract |
|---|---|
| `warnings` | Stable projectile ID or operation-composite key; owner/relation; authorized point; exact catalog splash circle when available, otherwise explicit point reason; deadline and its meaning; raid exit points only. Synthetic strategic radius is deliberately unknown. Hidden source IDs are not recovered. Equal-position repeated operations receive occurrence suffixes; these keys are presentation keys, not server operation IDs. |
| `zones` | Exact snapshot radius/start/until, preparing versus active, deadline to start/expiry. Expired zones are omitted. A scan is not concealment detection; shieldline is not an invulnerable dome. No list of affected hidden actors is inferred. |
| `projectiles` | Current disclosed body position when unambiguous, weapon ID, interceptability and a cosmetic manifest effect ID. Warning bodies at an ambiguous impact-substituted position are withheld. This includes no trajectory, target, origin, hit result or interception guarantee. A manifest ID is not a claim its art exists. |
| `minimapIndicators` | Owner/relation and position only. Never convert to `Entity`, a target, world silhouette or fog reveal. |
| `defeatCountdowns` | Non-defeated public players with nonzero authoritative `defeatAt`. These are player HUD/minimap alerts, not invented positions. |
| `selected` | Current entities only; own private order/rally intent; patrol point list/next index; current visible target resolution; return facility intent; optional force-fire blast reference. Hidden targets remain unresolved even if `memory` contains an old location. Return destination is the current owned facility, not an exact landing slot. Queued intent must not appear already executed. |
| `selected.weaponRange` | Catalog min/max with **edge-distance** metric and own unit radius or retained physical building footprint. Always `advisory:true`. A range is a weapon reference, including when the actor is disabled, landed or undeployed; not a readiness/LOS/target-validity verdict. Rendering should label/dim inactive references instead of claiming fire is available. |
| `selected.catalogSight/catalogDetection` | Raw catalog references only, not effective coverage. In particular catalog detection zero does **not** mean the unit has no close detection: Go has a separate default. There is no derived circle implying live sight. |
| `actors` | Current public state, enabled/complete/deployed/concealed, health/rank, progress and current channel deadline. Only own actors receive private Ambush, ammo/capacity, charges, endurance, home and Return-queue fields. Foreign private data is ignored even if accidentally attached to a test feed. Own contained passengers have no separate world marker. `own.lowPower` is the owner's economy deficit, not proof every building stops. |
| `eventCues` | Recognized authorized semantic events with ID/tick/position and disclosed entity. No inferred projectile association, hidden target identity, defender attribution or hit category. All `impact` events remain `impactOutcome:'unspecified'`; entity zero is not “miss.” Cues are not replayed automatically. |
| `gaps` | Explicit missing metadata for encountered cases. These are developer diagnostics, not raw implementation text for players. Never replace essential warning geometry with an invented radius to hide a gap. |

`returnOrdered` means the queue contains Return, which can still follow an attack. `enduranceTicks` is remaining endurance, **not an absolute deadline**; it pauses on the ground and resets only after service. Use public `landing_blocked` for the blocked landing symbol. `service_lost` is an actual owner event; there is no `no_landing_slot` event in the current engine. Pending emergency takeoff uses `state==='emergency_takeoff'`, but its two-second completion deadline is not disclosed.

A blast circle describes the world-space blast field. Go measures damage from that point to a target's physical edge, so a large target with its center outside the ring can still intersect it. Likewise weapon max/min ranges measure source-to-target **edge distance**. A unit-center ring of just `max_range` is not exact legal reach. A useful advisory outline offsets the source circle/retained rectangle by range and makes its target-shape/LOS limitation clear. Never duplicate Go hit, cover, path, placement or cooldown rules here.

## Renderer integration handoff

1. Cache the descriptors with each `setSnapshot` and selection update. Replace fixed-pixel warning ellipses with sampled world-space circles, using `TerrainSurface.projectGround()` for every sample and the existing minimap projection for the same millitile points. Project terrain height consistently; do not drape a screen-space ellipse over cliffs. Keep width/crosshair/icon/text sizes screen-readable while the area itself scales with world zoom.
2. Render warnings above scenery and fog as authorized warning graphics without changing fog opacity or revealing terrain/actors below them. Draw known areas, distinct destination/raid exit symbols and visible ETA captions. Saturation retains six separate projectile identities and two deadlines even when pairs share a point. Stack captions; do not merge away an impending second impact. Unknown-radius strategic warnings keep the point/ETA and an honest unavailable area until the wire gap is closed.
3. Add preparing/active zone styling with persistent labels. Zone expiration comes from Go, not an effect animation's frame count. Show only raid's disclosed exits; a transfer destination symbol must not resemble several confirmed reserved exit tiles.
4. Use the same descriptors for minimap alerts, respecting the map clip. Endgame indicators are minimap-only. Public warnings may be in fog; ordinary visible projectile bodies cannot be extrapolated into hidden terrain. Observer/replay modes use their already-authorized delayed/perspective feed without special global lookups.
5. Draw private order intent for own selected actors only. Distinguish move, attack, attack-move, force-fire, patrol, guard and Return; render unknown targets as text/status, without a line to `(0,0)` or remembered hidden buildings. Rally `(0,0)` is an unset sentinel. An explicit move to `(0,0)` is a real coordinate and is retained. Guard/escort targets resolve to the current authorized actor; exact paths require an independent Go preview.
6. Keep the existing accepted hull/turret/ground-shadow/flight geometry. State overlays sit near the current projected actor and do not change its collision, selection or simulation position. Health/disabled/deployed can be public; ammo, charges, home, Return queue, endurance and Ambush are own-only. Never infer allied magazines merely because vision is shared.
7. Transient cosmetics deduplicate `(session identity, perspective, event id)` and reset on replacement/seek. On first restored/reconnected snapshot, establish a baseline rather than replaying old explosions. Cues may be stale within an aggregated feedback batch; use their simulation tick, not arrival time. Persistent warnings/zones/statuses reconstruct immediately even with no corresponding activation event.
8. Reduced motion removes shake, oscillation, travelling flourishes and unnecessary animation. Reduced flashing uses steady contrast instead of strobes. Both retain identical areas, labels, deadline values, exit points, selection and actionable symbols; low effects quality drops only cosmetic particles. Use shape plus text plus accessible team color. No cosmetic smoke, decoy, explosion or particle budget may hide or erase essential warnings.
9. Before production acceptance, use actual Go frames for ordinary artillery/tactical strikes, banked launch, both strategic waves, delayed/destroyed Skybreaker planes, scan and shield preparation/expiry, raid/transfer cancellation, own/ally/enemy privacy, reconnect/replay and minimap-only endgame pulses. Native 1280×720 captures must check exact ground contact and readability at normal zoom on raised terrain. **This pure slice has not performed those rendered acceptance journeys.**

## Narrow missing data, by priority

| Priority / need | Currently available | Narrow source-of-truth addition or safe fallback |
|---|---|---|
| P0: strategic impact area | Projectile weapon ID, impact, tick; private Go `Projectile.Splash` | Add non-sensitive `splash` to `ProjectileView`/wire from the real projectile, including `SATURATION` and `SKYBREAKER`. Add actual impact radius to the public skybreaker operation warning before the projectile exists. This also avoids future catalog-versus-instance mismatch. Until then only a point/ETA is honest. |
| P0: projectile body visibility | Hidden warning position is replaced with impact | Explicit `position_visible` (or omit position when hidden). Do not expose origin/shooter. Current conservative equality test can suppress a real body on its last visible frame, which is preferable to drawing a false one. |
| P1: chosen Skybreaker route and preview ETA | Owner command edge/points; private operation entry/drop; public impact ETA | A Go non-mutating strategic preview for the owner should return the actual proposed edge/entry/drop/ETA, subject to ordinary visibility/admission. For accepted operations disclose only policy-approved route points; the design clearly requires owner preview, not global hidden aircraft tracking. Add stable operation ID if needed for cancellation continuity. Do not infer paths from enemy source IDs. |
| P1: current selected coverage | Weapon min/max/splash, unit base sight/detection, physical footprint | Expose single-source catalog presentation constants for fixed/mobile ABM geometry (14/10 tiles) and, if exact current circles are required, Go-computed effective sight/detection/range metadata. Owner-only readiness is separate. Real LOS remains a Go preview. Shieldline radius ten is already in zones and must not be confused with all ABM ranges. |
| P1: impact categories / projectile association | `impact` with permitted target ID or zero; no weapon/type/outcome | Add a sanitized, visible hit class/outcome and weapon/projectile reference where justified by the actual resolution. Zero may mean splash, hidden/dead target, no damage, decoy or empty ground. Do not report cover mitigation, blocked shot or a miss by arithmetic or absence. `OrderResult` is the source for rejected/illegal commands, not an impact event. |
| P1: visible active buffs and expiry | Generic activation owner event, private cooldowns; buffs remain internal | Expose only the active public effects on currently authorized actors with their actual end ticks; private-only effects stay owner-only. Designated target, hull-down, relay, recall, disperse, rapid sortie, emergency power, recovery, sabotage resistance, temporary-raid expiry and launch reveal cannot be reconstructed exactly from cooldown durations. |
| P2: emergency takeoff countdown | Public state, own remaining endurance and home | Owner-safe `emergency_takeoff_until` from the existing entity state. Avoid creating a two-second UI timer on first sight, which is wrong after reconnect. Endurance itself is already sufficient for emergency fuel remaining. |
| P2: interceptor flight effect | `interceptor_fired` at the battery; later all-visible `missile_intercepted` at predicted impact | No public interceptor actor or target reservation link exists. Draw a launch flash and separate interception symbol now; a connecting flight needs an authorized bounded cue with endpoint/timing. Never pair by nearest event or attribute the attacking missile's owner as the defending battery. |
| Intentional privacy: safehouse exits | Transfer's observed destination only | Keep the destination marker. Private exit collision probes/source/passenger identities are intentionally absent and are not requested by this audit. Raid exits differ: they are already explicitly disclosed. |

No Go/protocol additions above are implemented by this slice. Root must review disclosure and versioning before changing wire contracts. Existing generic status and fallback markers remain valid limited presentation; they must not be counted as the detailed finished effects.

## Verification

- Both `npm --prefix client run typecheck` and `typecheck:app` passed.
- Focused tests read the actual Go catalog and verify all 28 splash values, real catalog range keys, captured footprint dimensions, hidden/coincident projectile handling, strategic unknown-radius behavior, distinct operation deadlines, zone phases/expiry/rewind, minimap-only indicators, foreign private exclusion, unresolved target defaults, current Return home, patrol/rally/force-fire intent, ambiguous impact outcomes and manifest-valid cosmetic IDs.
- Full runtime test evidence: [tactical-runtime-tests.log](../work/evidence/tactical-runtime-tests.log). **251 tests passed**, including 11 new tactical-presentation tests; zero failures/skips. Tests are pure descriptor fixtures plus actual immutable catalog/manifest reads, **not end-to-end combat, visual acceptance or art completion**.
- Inputs are not mutated and repeated calls/rewind have no retained effect state. Rejected/unknown fields remain unknown; tests do not authorize new visibility.

## Complete effect manifest inventory

Manifest SHA-256 at audit: `1bab444a161d96f6d6aa0564bdc119a7eb1e274e231ec912a4b46452e7ed6c08`. Catalog SHA-256: `6c58eb75f9e3021ef67c960de7f918ae6a3b9f0c23135d7227b7f9c5782ba46a`.

All **132** manifest entries still say `planned`; none of their `assets/build/fx/...` output directories exists at audit. This does **not** mean the game draws nothing: vectors, generic projectile dots, pose selection, actor death art, fog and HUD feedback cover parts of the intended information outside those directories. Those existing paths still need individual functional/art/reduced-effects acceptance before updating the manifest. “Data ready” below means authorized inputs suffice, not that the effect was authored or accepted.

| Group | Entries |
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

Each manifest ID appears exactly once below. “Partial” identifies a limited truthful presentation rather than permission to fill missing facts with guesses.

| Manifest ID | Data | Pre-integration path | Remaining constraint/work |
|---|---|---|---|
| `fx.weapon_muzzle.RIF` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.REC` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.ELI` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.APC` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.AUTO` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.TANK` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.AT` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.ART` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.AA` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.FIGHT` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.STRIKE` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.GUN` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.US_FIGHT` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.US_STRIKE` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.US_GUN` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.IR_ART` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.IR_FIGHT` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.IR_STRIKE` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.IR_LOITER` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.SY_ART` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.SY_AA` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.SY_BUGGY` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.SY_TANK` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.MISSILE` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.IR_MISSILE` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.SY_ROCKET` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.TURRET` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.weapon_muzzle.AA_POST` | Partial | Actor fire/launch pose | weapon_fired permits source cue. Current live source catalog can choose weapon; event lacks weapon ID if source disappears/converts. No dedicated accepted muzzle FX output. |
| `fx.impact.miss_ground` | Gap | Generic impact/shake | Entity zero is ambiguous; require actual visible resolution outcome. |
| `fx.impact.blocked_shot` | Gap | No distinct effect | No blocked-shot combat outcome on wire; do not confuse rejected commands with fired shots. |
| `fx.impact.hit_infantry` | Partial | Generic impact/shake | Permitted live target can provide class; destroyed/hidden target class absent. Need sanitized event hit class for reliable choice. |
| `fx.impact.hit_light` | Partial | Generic impact/shake | Grounded aircraft use light armor; current target type alone is not impact-time armor. |
| `fx.impact.hit_heavy` | Partial | Generic impact/shake | Visible live target may identify class; no guaranteed impact-time class. |
| `fx.impact.hit_structure` | Partial | Generic impact/shake | Visible live target may identify structure; missing target is not a miss. |
| `fx.impact.hit_air` | Partial | Generic impact/shake | Need impact-time hit class; aircraft type can also be landed. |
| `fx.impact.intercepted_missile` | Ready | Shake only | Use missile_intercepted at its authorized point; owner is attacker, not defender. |
| `fx.impact.decoy_defeat` | Ready | No dedicated symbol | Use decoy_triggered; preserve all impact warnings. |
| `fx.impact.cover_mitigated` | Gap | No distinct effect | No cover-mitigation outcome; do not infer damage or hidden occupancy from ground material. |
| `fx.impact.illegal_target_marker` | Ready | Command text/placement feedback | Use local planner/OrderResult rejection, not speculative hit feedback. |
| `fx.projectile.tracer_small` | Partial | Muzzle pose; transient bullet generally absent | Small arms resolve within the tick. A reliable source-to-target tracer requires an authorized endpoint cue, not guessed target. |
| `fx.projectile.tracer_auto` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.shell_cannon` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.missile_at` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.shell_artillery` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.rocket_ir` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.mortar` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.missile_aa` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.bomb` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.tactical_missile` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.strategic_missile` | Partial | Generic dot | Permitted projectile body/weapon available; descriptor chooses cosmetic family. No hidden origin/endpoints; warning position may be redacted. Trail must stop at last authorized position. |
| `fx.projectile.interceptor` | Gap | Battery launch pose and later shake | No interceptor trajectory/reserved projectile link. Keep separate launch/intercept cues until authorized metadata exists. |
| `fx.explosion.small` | Ready | Generic impact shake | A generic visible impact is safe, without claimed hit/miss/damage type. |
| `fx.explosion.vehicle_light` | Partial | Actor death/crash/wreck pose | Disclosed destroyed event plus previously authorized actor type enables cosmetic class. Never infer death from disappearance; generic fallback if the actor was not known. |
| `fx.explosion.vehicle_heavy` | Partial | Actor death/crash/wreck pose | Disclosed destroyed event plus previously authorized actor type enables cosmetic class. Never infer death from disappearance; generic fallback if the actor was not known. |
| `fx.explosion.aircraft` | Partial | Actor death/crash/wreck pose | Disclosed destroyed event plus previously authorized actor type enables cosmetic class. Never infer death from disappearance; generic fallback if the actor was not known. |
| `fx.explosion.building_small` | Partial | Actor death/crash/wreck pose | Disclosed destroyed event plus previously authorized actor type enables cosmetic class. Never infer death from disappearance; generic fallback if the actor was not known. |
| `fx.explosion.building_large` | Partial | Actor death/crash/wreck pose | Disclosed destroyed event plus previously authorized actor type enables cosmetic class. Never infer death from disappearance; generic fallback if the actor was not known. |
| `fx.explosion.blast_radius_2` | Partial | Fixed-pixel warning | Tactical/ART catalog radius is ready; strategic synthetic radius is absent from wire/catalog. |
| `fx.explosion.blast_radius_1_5` | Ready | Generic dots/shake | IR_ART/SY_ART splash is 1500. Cosmetic cloud must not mask field boundary. |
| `fx.unit.selection_ring_035` | Ready | Vector ellipse | Catalog infantry radius; verify actual size rather than minimum screen ring alone. |
| `fx.unit.selection_ring_06` | Ready | Vector ellipse | Catalog radius or actor physical footprint; independently maintain click/selection truth. |
| `fx.unit.selection_ring_08` | Ready | Vector ellipse | Catalog radius; preserve team contrast at normal zoom. |
| `fx.unit.health_bar` | Ready | Vector bar | Current public health ratio; owner exact HP only. Respect settings. |
| `fx.unit.veterancy_1` | Ready | Vector chevron | Public rank1; no inferred opponent upgrades. |
| `fx.unit.veterancy_2` | Ready | Vector chevrons | Public rank2; no inferred opponent upgrades. |
| `fx.unit.ammo_pips` | Ready | HUD text/owner ammo poses, no world pips | Own ammo and catalog magazine. Foreign counts never displayed. |
| `fx.unit.concealed` | Ready | Alpha/pose | Authorized entity.concealed; add explicit symbol. Hidden enemy itself never drawn. |
| `fx.unit.ambush_ready` | Ready | Own diamond | Use private.ambushReady; no local six-second readiness timer. |
| `fx.unit.designated_target` | Gap | No reliable persistent mark | Internal designated buff/expiry not disclosed; owner cast event lacks target association. |
| `fx.unit.hull_down` | Ready | Deployed pose | SA tank deployed flag identifies stance; do not generalize other deployed actors or invent readiness before deployment completes. |
| `fx.unit.relay_boost` | Gap | No reliable persistent cue | Internal relay buff/expiry absent; catalog sight not effective sight. |
| `fx.unit.drone_recall` | Gap | Generic flight/Return pose | Private Return order does not prove recall speed buff is still active. |
| `fx.unit.disperse` | Gap | No reliable persistent cue | Cooldown is not per-squad active buff; firing/capture/boarding/sabotage cancels individually. |
| `fx.unit.repairing` | Partial | Work-repair poses | Public repairing identifies working source; no guaranteed target/beam association or exact heal amount. |
| `fx.unit.healing` | Partial | Medic work-heal pose | Medic role plus working state; target-link/heal impact cue absent. |
| `fx.unit.capture_channel` | Ready | Channel pose | Public capture state/channelUntil/progress; interrupted event is owner-only. |
| `fx.unit.sabotage_channel` | Ready | Channel pose | Public sabotage state/channelUntil/progress; do not infer target details outside own orders. |
| `fx.unit.emergency_countdown` | Partial | State/HUD information | Own remaining endurance is ready; emergency_takeoff_until not on wire. Do not restart a two-second timer on reconnect. |
| `fx.unit.return_warning` | Ready | Audio/captions and Return orders | Actual aircraft_return_soon/returning events; own endurance/queue for persistent status. |
| `fx.unit.no_landing_slot` | Ready | State/HUD information | landing_blocked state, home0 and service_lost owner event; no event named no_landing_slot. |
| `fx.unit.dust_trail` | Cosmetic | No dedicated FX | Interpolate only authorized motion; stop/dispose immediately on disappearance. No hidden path continuation. |
| `fx.unit.rotor_wash` | Cosmetic | Rotor actor animation | Visible rotorcraft position/flight state; no gameplay area/range. |
| `fx.unit.smoke_damaged` | Cosmetic | Damaged pose | Current visible public health; visual threshold may be cosmetic, never a new damage rule. |
| `fx.unit.fire_critical` | Cosmetic | Damage/critical poses | Current public health; must not obscure selection, warnings or status. |
| `fx.unit.wreck_smoke` | Cosmetic | Death/wreck actor art | Only a disclosed destroyed event permits death; disappearing enemy may simply be in fog. No collider/selectable actor. |
| `fx.order.move_marker` | Ready | Generic order line/destination ellipse | Own accepted queue; explicit position only. Pure descriptors fix target-default origin artifacts. |
| `fx.order.attack_marker` | Partial | Generic order line | Current authorized target only; no private LastTarget on wire. Hidden target remains unresolved. |
| `fx.order.attack_move_marker` | Ready | Generic order line/destination ellipse | Own position intent; distinct symbol still needed. |
| `fx.order.waypoint_queue` | Ready | Generic straight segments | Own queue/patrol points; never describe straight segments as collision-safe route. |
| `fx.order.blocked_order` | Ready | Red cross on generic destination | Public blocked state; exact route-reason details require Go advice. |
| `fx.order.rally_flag` | Ready | No battlefield rally flag | Own private rally only; zero vector is unset. |
| `fx.order.guard_anchor` | Partial | Generic order line | Own point/current visible target intent; actual internal stance anchor/defensive leash not exported. |
| `fx.order.force_fire_area` | Ready | Generic order line | Own force-fire position + catalog splash; no hidden hit or occupancy feedback. |
| `fx.order.rejected_order_revert` | Partial | Controller rejection feedback | Receipt exposes player/sequence/index/code; controller must retain matching input origin/ghost to animate a truthful revert. |
| `fx.placement.build_ghost_valid` | Ready | Green vector footprint | Use Go preview approval, not JS copied placement rules. |
| `fx.placement.build_ghost_invalid` | Ready | Red vector footprint + reason | Use actual planner/Go issue; unknown remains visually distinct. |
| `fx.placement.build_radius` | Gap | No world ring | 14-tile HQ/outpost rule known in Go/design, absent catalog coverage metadata. Add single-source presentation radius; exceptions stay Go-validated. |
| `fx.placement.power_impact` | Ready | Costs/economy HUD, no placement effect | Owned economy + selected catalog building; predicted scalar change is explanatory, not approval. |
| `fx.placement.footprint_grid` | Ready | Vector footprint | Retained/candidate physical dimensions; raise/project with same terrain surface. |
| `fx.range.weapon_range` | Ready | No world range ring | Catalog max_range, not the unused TypeScript range field. Edge-distance/target-shape caveat required. |
| `fx.range.min_range` | Ready | No world inner ring | Catalog min_range with same edge-distance metric. No inferred target legality. |
| `fx.range.abm_coverage_14` | Gap | No world coverage ring | 14,000 coverage lives in Go combat constants; expose catalog scalar once. Owner charges alone do not guarantee interception. |
| `fx.range.aegis_coverage_10` | Gap | Deployed pose, no ring | 10,000 mobile coverage lives in Go; only deployed active Aegis can intercept. Readiness/cooldown separate. |
| `fx.range.sight_radius` | Partial | Actual fog mask only | Catalog unit base; height/relay/active/container/LOS modify effect. Exact current coverage requires Go metadata/preview. |
| `fx.range.detection_radius` | Gap | Actual filtered entities only | Go applies close default detection + catalog max/LOS; raw catalog zero is not no detection. |
| `fx.warning.tactical_impact_marker` | Ready | Wrong fixed38px ellipse | Impact/deadline + catalog2000 radius ready. World field/text/minimap integration needed. |
| `fx.warning.strategic_impact_marker` | Partial | Wrong fixed ellipse | Exact points/deadlines ready; synthetic splash absent. No invented circle. |
| `fx.warning.skybreaker_route` | Gap | Impact ellipse only | Actual entry/drop route and owner preflight ETA absent; no hidden plane/source inference. |
| `fx.warning.saturation_markers` | Partial | Six generic projectile markers | Separate IDs/deadlines already ready; overlapping two waves must retain both captions. Synthetic radius missing. |
| `fx.warning.raid_exit_marker` | Ready | Wrong generic operation ellipse | Actual exits and deployment deadline already provided. |
| `fx.warning.safehouse_exit_marker` | Ready | Generic transfer ellipse | Only observed destination center is public; do not invent exact exit tiles/source/passengers. |
| `fx.warning.shieldline_ring` | Ready | Not drawn | Zone radius/start/until already authoritative; prep and active phases differ. |
| `fx.warning.recon_sweep_circle` | Ready | Not drawn | Authorized scan zone radius/start/until; does not detect concealment. |
| `fx.warning.launch_reveal` | Partial | Launch/fire pose | Actual visible launch position is available; public reveal-until is not. No persistent hidden tracking. |
| `fx.warning.defeat_countdown` | Ready | No dedicated battlefield/minimap marker | PlayerSummary.defeatAt; display player deadline without inventing base position. |
| `fx.warning.endgame_reveal_pulse` | Ready | Not drawn on minimap | Explicit minimap-only indicators; no world/entity/fog side effect. |
| `fx.building.capture_channel` | Partial | Capturing actor pose | Capture channel is on engineer; own order links target. Foreign target link cannot be inferred safely. |
| `fx.building.sabotage_disabled` | Partial | Generic disabled pose | Enabled=false/state disabled gives disabled icon, not cause/expiry. Sabotage-specific reason absent. |
| `fx.building.sell_dust` | Cosmetic | Sell pose | Public selling/channel progress; only authorized building_sold cue for removal. |
| `fx.building.fire_damaged` | Cosmetic | Damage/critical pose | Visible health ratio and actor art; do not imply an unmodeled damage-over-time condition. |
| `fx.building.smoke_critical` | Cosmetic | Damage/critical pose | Same health source; retain all essential symbols. |
| `fx.building.low_power_icon` | Ready | Own low-power pose/HUD | Own economy deficit only; shared vision does not expose ally/enemy economy. |
| `fx.building.disabled_icon` | Ready | Disabled pose | Current public enabled flag; add symbol without assuming cause or duration. |
| `fx.building.construction_dust` | Cosmetic | Construction pose/foundation | Public complete/progress; no new construction timing. |
| `fx.building.sabotage_resistance` | Gap | No persistent cue | Internal resistance expiry omitted; previous sabotage/cooldown cannot prove current resistance. |
| `fx.fog.unexplored` | Ready | Exact terrain-fragment fog | Current visible/explored mask; effects never lift it. |
| `fx.fog.explored_unseen` | Ready | Exact terrain-fragment fog | Public scenery + allowed memory only; mobile actors disappear. |
| `fx.fog.last_seen_timestamp` | Ready | Building memory silhouette without timestamp label | Memory.seen tick is already available. Timestamp is stale observation, never live health/status. |
| `fx.fog.reveal_edge` | Ready | Hard fragment fog boundaries | Cosmetic edge treatment must preserve exact conservative disclosure. |
| `fx.environment.depletion_dust` | Partial | Supply-field resource state art | Field remaining is public strategic data; local dust should additionally require current visibility to avoid a remote visual event implying sight. |
| `fx.environment.shipment_arrival` | Ready | Persistent shipment/resource environment art | Actual global shipment_arrived/countdown event; distinguish public alert from fog-revealing scenery. |
| `fx.environment.supply_station_capture` | Ready | Environment ownership flag | station_captured visible event and authorized station owner; do not imply a stationary flag grants vision. |

Audit totals: 132 entries, 0 existing declared effect output directories. Metadata remains planned and is not automatically changed by this audit.
