# Resume assignment 01 — remaining vehicle and aircraft art

This brief supersedes assignment 01 and 07's broad ownership. Read AGENTS.md,
the authoritative handoff/design, `work/claude/06-rts-reference-study.md`,
`docs/asset-pipeline.md`, `docs/logistics-art.md`, `docs/infantry-art.md` and
`docs/building-art.md`. Exactly `claude-opus-5-5`, no fallback/other-model agents.
Implementation is authorized. Never deploy or copy existing C&C assets.

Codex continued during quota loss. The eight logistics models/sprite sets are
complete and reviewed. The 24 infantry variants have authored models/specs and
are undergoing sequential production. The remaining 59 building variants have
authored models/specs and are undergoing pilot review. Audio has a complete first
production pass. Do not overwrite these with remembered earlier session files.

## Exclusive scope

Own the remaining original ground combat vehicles and aircraft: distinct
silhouettes, editable Blender sources, full directional/state specifications,
registration, portraits/build cameos and provenance for your reserved families.
Start by reading the manifest and actual existing files to produce the exact
missing-roster list; distinguish a single sample from a completed faction roster.

Allowed new/edit files: dedicated models under
`assets/pipeline/blender/models/vehicle_roster.py` and `aircraft_roster.py`,
their corresponding non-infantry/non-logistics unit specs, your isolated evidence
under `work/art/vehicle-roster/` and `work/art/aircraft-roster/`, and dedicated
Markdown documentation. Existing tracked tank, technical, drone and carrier
models/specs may be extended only after checking their current integrity and
preserving the already accepted sample behavior.

Do not edit infantry/logistics/building models or specs, shared fclib, UI-shot
helper, packer, shared manifests, UI/design/client/Go/content/audio files. Report
shared-contract needs in `work/claude/01-integration-issues.md` for Codex.

## Rendering coordination

There is exactly one Blender worker on this 16 GiB host, operated by Codex's
art agent. Do not start a competing Blender process. Author a bounded pilot
request in `work/claude/01-next-render-request.md` with exact IDs, commands,
source hashes, expected outputs and review criteria. The coordinator will insert
it between complete infantry/building assets and return evidence. Continue
independent model/spec work while waiting. Never claim an unrendered spec as art.

## Visual and production bar

Original stylized military-industrial RTS art: exaggerated, readable roles,
designed armor/hulls, believable machinery and expressive silhouettes. Not
photorealistic; not primitives with a weapon glued on. Distinguish light vehicles,
transports, artillery, AA, tactical launchers, service vehicles, tanks, jets,
rotorcraft and drones at native game size. Faction differences must involve
massing/equipment/materials as well as limited team paint. Keep the fixed camera,
world footprint and anchors consistent with the current pipeline.

Every applicable movement, aim, recoil/fire, work, doors, deployment/packing,
damage, destruction, landed/service/takeoff/flight and ability state must have
honest geometry and metadata. Independent turrets need projected hardpoints,
correct directional ground shadows and matching hull pivots. Pilots compare
all source poses in different evaluation orders, selected native rendered
frames, palette masks and actual portraits/cameos. Validate both1× and2×.

Inspect rendered native contacts before approving production. Readability,
articulation, visible doors, believable landed poses and exact registration
matter more than counts. Fix concrete defects and rerun bounded pilots before
bulk rendering. Keep editable originals and license/source records.

Write an exact remaining inventory and handoff in your report. Full game art is
not finished until every required roster/state and UI illustration exists and
passes actual renderer review. No fabricated completeness or placeholder pass.
