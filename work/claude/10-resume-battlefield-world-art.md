# Resume assignment 05 — original battlefield world art and clarity

This brief supersedes all earlier assignment 05 content ownership. Read AGENTS.md,
the authoritative design and handoff, the inspected C&C screenshot study in
`work/claude/06-rts-reference-study.md`, and current `docs/asset-pipeline.md`.
Use exactly `claude-opus-5-5`; no fallback, Advisor, Agent or Task model. The user
already authorizes implementation. Never deploy or copy existing game assets.

Codex has implemented and playtested all authored missions while your quota was
exhausted. Do not regenerate maps, missions or presentation with your old scripts.
A Codex agent retains that content lane until its acceptance matrix is complete.
Another Claude job owns UI/chrome and another owns remaining vehicles/aircraft.
A single Codex Blender worker produces infantry/buildings. No competing Blender.

## Your exclusive write scope

- Original terrain material source/generation under `assets/pipeline/terrain/`
  and its existing terrain source location after inventory; current eight named
  terrain outputs may be improved without changing their registry IDs or dimensions.
- New environment prop models under `assets/pipeline/blender/models/environment_roster.py`,
  corresponding environment specs and isolated evidence under `work/art/environment-roster/`.
- Original source/briefing/loading key art after auditing actual manifest targets,
  in a dedicated `assets/sources/world-art/` folder. Coordinate final shared IDs.
- Dedicated Markdown docs and `work/claude/05-world-art-review.md`.

Do not edit client, Go, maps/missions/presentation, UI chrome, audio, shared manifests,
Blender fclib/render helpers/packer, or infantry/building/vehicle/air models/specs.
Record integration needs in `work/claude/05-integration-issues.md`. Never silently
remove a collider, move a supply field or change a gameplay terrain type for art.

## Required visual work

Inspect actual current battle screenshots and the running game first. Read
`client/src/render/terrain.ts`, `battlefield.ts`, the asset manifest/pipeline and
map object catalogs. The current world is too sparse: repeating sandy patterns,
empty areas and limited props do not meet the user's real-game quality request.
Produce a mismatch ledger that distinguishes missing art from renderer/layout
work. Do not declare this fixed from a material swatch or concept image.

Create a cohesive, original stylized RTS terrain/prop treatment: broad readable
color masses, worn military roads, legible elevation/cliff/ramp edges, clear deep
water, distinct resource fields, dry ground variation, believable rocks, sparse
vegetation and military/industrial dressing. Avoid dense random speckle/noise,
photorealism, generic gradient scenery and any decoration that hides units or
suggests nonexistent cover. Ground must support the actors' scale and lighting.
Keep team colors and tactical markers readable. Warm charcoal/olive/brass UI is
owned elsewhere; the world can use restrained natural hues where meaningful.

Inventory every declared required environmental/briefing/loading asset and count
real final outputs separately from source plans. Existing original art should be
preserved or improved deliberately, not overwritten without review. Keep source
and licenses/provenance for every output, plus native-size 1×/2× checks.

## Queue and acceptance

Do not run Blender. Write `work/claude/05-next-render-request.md` with a bounded
pilot list, exact commands, hashes and review criteria. The sole worker will
insert approved pilots between complete assets. Continue authoring independently.
For generated 2D texture processing, avoid simultaneous expensive batches while
that worker renders; lightweight source authoring and small swatches are fine.

Review in actual map views at 1600×900 and 1280×720 after integration: base, road,
resource expansion, water crossing and combat. Record renderer requests precisely
(e.g. projected cliff face, terrain material routing, decorative placements)
without writing those files. Codex will integrate and return screenshots. A
beautiful painting does not certify gameplay readability or asset completeness.

Deliver real source files, exact produced/missing inventory, provenance, pilot
requests and screenshots reviewed. Full game release quality remains unclaimed
until complete art, gameplay and package gates pass.
