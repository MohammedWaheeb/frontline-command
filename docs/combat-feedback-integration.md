# Combat feedback integration audit

Read-only audit, 2026-09-28, after tactical checkpoint `e256afc`. No Go, protocol, renderer, UI, audio or asset file is changed by this audit. The parent owns active actor-status/layer work; the separate combat metadata candidate is not shipping. References: design sections [5–8 and 22–24](../outputs/frontline-command-game-design.md), the [handoff](../outputs/frontline-command-agent-handoff.md), and the complete [132-entry coverage ledger](combat-effects-coverage.md).

## What exists

There is no `effects.ts` in the repository, including ignored sources. The actual transient path is `BattlefieldRenderer.readFeedback()` → `ActorVisual.cue()` plus screen shake. `weapon_fired` chooses the available `fire`/`volley`/`launch` actor animation; `interceptor_fired` chooses `launch`; `strategic_activated` chooses `activate`. These are meaningful existing animations, but are not dedicated muzzle, tracer or impact effects. `impact` and `missile_intercepted` currently cause optional shake. Neither a distinct interception graphic nor decoy-defeat graphic is present.

`TacticalOverlay` draws authorized moving projectile bodies as a small dot or missile diamond. It now renders exact known warning fields, preparation/active zones, destination/exit markers and order intent. The optional wire consumer distinguishes actual body visibility from a public impact marker and reads instance splash. The independently tested owner Skybreaker preview uses Go-provided routes. These improvements do not supply travel trails, impact outcomes or explosion assets.

A disappearing actor becomes a temporary death/crash pose only when an authorized `destroyed` event identifies it; ordinary sight loss disposes it. Cosmetic deaths are removed from selection/commands, fade after 2.4 seconds and have no simulation collision. Destructible map-object rubble has its separate authoritative persistent path. Preserve these distinctions.

First snapshot, perspective change and backward seek baseline the existing event high-water mark and clear shake/action cues. Fresh events older than four simulation ticks do not animate. That is a useful starting policy. New effect state must also explicitly reset on session replacement, reconnect/resync and context restoration, even if the new snapshot has a larger tick. Events must not be replayed just because a new renderer or asset texture finishes loading.

## Verified pipeline gap

All 132 manifest `fx.*` entries remain `planned`; all 132 declared `assets/build/fx/...` output directories are absent. The manifest's proposed editable paths `assets/pipeline/blender/fx/*.py` and `client/src/render/fx/*.ts` do not currently contain an effects implementation. `render_all.sh` handles existing sprite specs, not a documented FX flipbook format.

`client/scripts/ui/art-plugin.mjs` indexes and serves sprites, terrain, UI and audio. It has no `fx/` allowlist, effects index or flipbook dependency enumeration. Dropping a PNG into the planned FX output would not make it a loadable, checked product asset. Before authored flipbooks, add an explicit bounded manifest/loader contract, exact-byte packaging and offline dependency tests. Code-native truthful symbols can proceed independently and need no fabricated art-complete status.

## Candidate metadata contract

The source is [the isolated combat candidate](../work/combat-feedback-candidate/README.md), with implementation in its `source/pkg/sim/combat_feedback.go`, `combat.go`, `visibility.go` and `source/protocol/frontline.proto`. Boole owns it. The experimental version is `0.3.3-combat-feedback-candidate.1`; new persisted event metadata changes canonical save/replay hashes. The prior tactical candidate's identical-state-hash evidence does **not** apply to this candidate. Root owns the planned combined version boundary and promotion.

| Input | Truthful descriptor/render interpretation |
|---|---|
| `weapon_fired.combat.weapon` | Actual fired round ID, independent of later source conversion/death. Choose one of the 28 known muzzle families. The event point is a source cue; it supplies no target endpoint. |
| `impact.combat.weapon` only | Generic impact/explosion with a weapon family. No hit, miss, blocked, decoy, victim count or armor assertion. Includes all area blasts, empty/zero results and target identity redaction. |
| `impact.combat.outcome === 'hit'` plus `targetArmor` | Confirmed positive direct damage to an authorized identified surviving target at the feedback observation. Select infantry/light/heavy/structure/air hit presentation using the resolution-time armor; a landed aircraft can correctly be `light`. |
| `coverMitigated === true` on that hit | Add a positive cover-mitigation shield/chevron cue. Omitted/false is unknown, not “no cover.” Do not compute expected damage or show a numeric reduction. |
| Missing/unknown/malformed combat metadata | Retain only a generic authorized event; fail closed for specialization. An entity lookup must not recreate redacted metadata. |
| Existing `decoy_triggered` | Distinct decoy symbol at its authorized point. It is not obtained by pairing an ambiguous impact. |
| Existing `missile_intercepted` | Distinct intercepted symbol at the disclosed warning/impact position. `owner` is the attacking missile's owner, not the defender. The point is not a physical interception-flight endpoint. |
| Existing `interceptor_fired` | Source launch flash/pose. No connecting beam or projectile pairing with a later interception. |
| Existing `destroyed` | Known prior authorized actor may select cosmetic death class; generic explosion otherwise. Disappearance alone never creates this cue. |
| Local planner failure or matching `OrderResult` | Illegal/rejected command feedback with exact receipt reason. This is not a projectile collision or a confirmed blocked shot. |

The candidate deliberately strips hit/armor/cover whenever impact identity is zero, including a target that died, entered fog, became concealed or embarked. Area blasts always have weapon only even when zero, one or many actors are hit. Do not replace these intentional limits with nearby-entity lookup, health delta, remembered buildings, projectile disappearance, nearest event pairing or force-fire occupancy inference.

## Proposed bounded implementation

1. Add a pure `app/combat-presentation.ts` consuming only already-authorized events, the compatible catalog and an explicit session/perspective/tick context. Return immutable cues `{key, eventTick, position, kind, weapon?, confirmedArmor?, coverMitigated?}`. The key includes session, perspective and event ID. Allowlist known event kinds/weapons/armor and tolerate older snapshots. Keep `generic-impact` distinct from `confirmed-hit`; absence never becomes `miss`.
2. Keep bounded cue history separate from the pure descriptor. Explicit `reset(context, snapshot)` establishes a baseline without emitting history. On updates, deduplicate event IDs, reject future/stale cues, and expire by simulation tick. Preserve pause/replay speed semantics: local wall time may smooth an already-authorized flash, but cannot create elapsed gameplay or extend a warning. Reset on reconnect, resync, session/perspective switch, backward seek, renderer recovery and disposal. Deterministic event-order tie breaking avoids random feedback differences.
3. Add a noninteractive `render/combat-effects.ts` layer below essential warnings/status labels. First implement steady shape-distinct generic impact, confirmed-hit class, positive cover, intercepted and decoy symbols. Reuse actor fire/launch animation. Project actual event ground points through `TerrainSurface`; attach air hit cosmetics only to a currently authorized matching actor's existing presentation position, never an inferred flight path. A ground-point generic fallback makes no target-altitude claim.
4. Retain current projectile bodies and optional explicit visibility. Cosmetic trails may connect only successive authorized samples for the same projectile ID; clear immediately when hidden/removed, on rewind and on perspective changes. They cannot predict future travel, reveal an origin, bend toward an undisclosed target or imply interception reservations. Small-arms source-to-target tracers and interceptor trajectories remain deferred because the current candidate has no authorized endpoint/pairing.
5. Once truthful cues pass, define the original FX art pipeline with Claude/sole worker. Suggested manifest: stable effect ID, atlas/frame rectangles, origin, FPS/duration, layer/blend rule, scale bounds, low/reduced-flash/reduced-motion variants, source/license and exact-byte dependencies. A schema must be reviewed before files are produced. Loader failures fall back to the corresponding truthful symbol; they remain an explicit presentation-completeness gap. Register FX URLs in the product pack and test offline reload before claiming delivery.
6. Audit audio separately against the same descriptors. Current `AudioDirector` derives fired weapon from the current/prior actor and `impactSound` derives armor from catalog type, which can be wrong after conversion or landing. The candidate supplies the actual weapon and positive resolution class. Unknown target sound can remain a generic impact; no miss caption. This audit does not change audio files or promise new recordings.

Cache decoding on snapshot/event updates. Pool or bound transient nodes, avoid allocating text/geometry for every animation frame, and cull by viewport without preserving hidden actor references. Decorative particle budgets can fall under load; exact active warnings, outcome symbols and actionable text cannot disappear because the decoration budget is exhausted. If many identical local cues are visually grouped, retain their identities internally and never turn grouping into a hidden victim count.

### Visual and accessibility rules

Use the established charcoal/brass/amber palette and shape plus text, with accessible team accents rather than blue interface chrome. Essential warnings remain above smoke/fire. Reduced flashing uses steady restrained highlights; reduced motion removes particle travel, shake and oscillation. Both retain the same confirmed outcome, interception/decoy/cover distinction and actionable warning. Cosmetic durations are presentation, not new damage/windup/timing rules. No damage numbers are available or authorized by this candidate.

A dead actor must never remain selectable, block a route, or look like a current target. Static saved/replay snapshots reconstruct persistent warnings/status from current fields; old explosions are not reconstructed from buffered events. Pause freezes the event timeline; continuing a paused renderer must not emit the same shot again.

## Acceptance course before renderer handback

| Actual Go case | Required evidence |
|---|---|
| Rifle/autocannon into visible covered and uncovered infantry | Confirmed hit class; cover cue only for real positive reduction; no cover inference from terrain alone. |
| Tank direct hit, landed aircraft, airborne aircraft | Heavy/light/air resolution class is correct; cosmetic position uses existing authorized body/ground projection. |
| Shooter converted/destroyed before projectile impact | Weapon comes from event metadata, never the actor's new type; no new origin/target leak. |
| Target killed, concealed, embarked or out of sight | Redacted impact remains generic even when prior actor state is remembered. |
| Area fire into zero/one/many hidden targets | Identical generic descriptors for equal public inputs; no victim count/armor/cover leak. |
| Decoy and single/banked/intercepted missile | Separate explicit decoy/intercept symbol; warning removal follows authoritative snapshots; attacker is not mislabeled as defender. |
| Invalid layer, out-of-range or failed placement/order | Receipt/planner explanation and revert; no fake combat hit or blocked-projectile effect. |
| First load, duplicate/aggregated events, pause, save/resume, replay seek, reconnect, context loss | No repeated/revived stale effects, no future event, identical underlying Go outcomes and clean disposal. |
| 1280×720 raised terrain, fog boundary, dense units, reduced effects | Native pixels show essential markers above effects; no floating ground marks, hidden route or unreadable flicker. |
| Maximum legal 688 actors with warnings/returns/intercepts | Measure actual hardware separately in a quiet window; bounded allocations and no lost tactical information. Do not use software-renderer FPS as reference-device acceptance. |

Read-only evidence is a source audit, not a new rendered combat pass. The existing tactical and actor-status acceptance remain independent. Actual miss versus actual projectile blocking is still not representable by this candidate; closing those two checklist entries needs a separately reviewed Go rule/event decision. Never synthesize a miss from `entity === 0` to make the checklist appear complete.
