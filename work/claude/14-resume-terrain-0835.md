# Current battlefield material assignment — 28 September 08:35 UTC

Resume as primary world-art author using exactly claude-opus-5-5. Earlier broad
map/mission assignments are superseded. Read AGENTS.md, the handoff/design,
work/claude/06-rts-reference-study.md and checklist12. Current Go0.3.3 is frozen;
all32 authored maps and31missions are committed, validated and undergoing further
playthroughs. Do not change their geometry, story logic, indexing or hashes.

The user wants original stylized C&C/Generals/RedAlert character with soul. A
repeated brown cracked grid and basic slabs are not a finished battlefield.
Study the actual linked screenshot references and native current captures in
work/evidence/environment-authored, environment-sidecar and terrain-height.
Root sees excessive repeated fine cracks, flat materials, stretched cliff edges,
weak variation/landmark hierarchy and abrupt fog edges. The accepted Copper
scenery is only ten functional entries, not a final aesthetic pass.

## Exclusive editing scope

- assets/pipeline/terrain/gen_terrain.py and terrain outputs/metadata.
- client/src/render/terrain-materials.ts and terrain.ts, strictly visual material
  application/baking and fog shading. Preserve public map/visibility truth.
- New terrain-specific visual tests/evidence and Markdown report.

Do not edit Go, maps/missions/index, actor/battlefield/terrain-surface projection,
environment renderer/sidecars, editor, UI CSS, art loader, audio, Blender models,
sprite/UI packers or source locks. Session04 owns UI. Einstein owns editor.
Mencius/session01 is the sole Blender worker: do not launch Blender. Root owns
actor logic and integration. Any necessary cross-boundary change must be proposed
precisely for coordination; keep working independently inside this scope.

## Concrete pass

Create a cohesive, readable, stylized battlefield material set: larger authored
color/value masses and restrained fine detail, meaningful dirt/gravel/scrub/
concrete/asphalt distinction, believable road shoulders and cliff surfaces,
seam-free transitions and visual calm beneath units. Preserve all Go terrain
classes, heights, roads, mandatory corridors, cover, cliffs and movement. No new
apparent wall or road closure on traversable ground. Never reveal hidden actors,
unexplored terrain details or memory transitions to soften fog. If safe fog-edge
improvement needs a renderer ownership change, send a proposal.

Use the existing isolated terrain/product browser harness, not a fake screenshot
mockup. Capture before/after at native1280x720 and1600x900 with real Go movement,
fog and authored props. Keep height picking and seams intact; run focused visual
regression and both TypeScript checks. Do not rebuild shared Go runtime, run bulk
asset production, or global git add/commit. Report exact changed files/source
hashes and limits. Implementation is authorized; complete the bounded pass rather
than returning only a plan. No deployment or full-game-ready claim.
