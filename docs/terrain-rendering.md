# Terrain materials and chunk rendering

Claude Code's `claude-opus-5-5` terrain generation pass supplies original
periodic painted materials. The active renderer now distinguishes open earth,
scrub cover, rubble, road, ramps, rock, shallow/deep water and pale beach edges.
Open ground never selects the scrub cover texture. A 32-tile macro texture adds
broad colour variation without changing movement, cover or sight rules.
Painted road shoulders remain inside the road tile.

The material choices use only the public authored map. Go remains authoritative
for every terrain rule. There are no new map mutations, simulation states,
movement bonuses or visibility reveals in this work.

## Chunk defect and correction

The original rectangular terrain sprites overlap outside their own tile range.
An initial alpha-clipped correction still produced different edge pixels when
chunks were inserted in a different order. The preserved first failure on
Copper Junction has 11,985 colour channels differing by more than one, with a
maximum difference of 24.

Each chunk now uses two GPU triangles covering exactly its map rectangle, with
opaque texture bleed beyond the shared edges. Texture sampling stays aligned
to global map coordinates. This avoids both overlapping alpha fringes and
camera-order-dependent repainting. Mesh geometry and textures are explicitly
released during eviction, graphics-context recovery and match disposal.

## Verification

The actual terrain baker and Pixi meshes were rendered on Copper Junction,
Relay Heights, Port Outskirts and Dry River. Normal and reversed chunk order
produce identical pixels at 0.45×, 1× and 1.8× zoom in all 12 cases. Screenshots
and the initial failure are under `work/evidence/terrain-materials/`.
This isolated material review intentionally contains no actors or fog; it is
not a played match or a change to gameplay visibility.

Both TypeScript checks and all 191 runtime tests pass. The broader real
Go/WASM renderer checks also pass: selection, actual object destruction/rubble,
rewind, animation state/progress, reduced motion, graphics-context loss with
save/restore, independent turret shadows and complete disposal across five
scenes. There were no runtime errors. Chromium recorded only the expected
readback-performance warnings from screenshot/pixel extraction.

```sh
node client/tests/render/terrain-browser.mjs
node client/tests/render/browser.mjs
```

## Terrain v3 checkpoint, 28 September 2026

The shared raised surface has since been integrated and tested; see
[terrain height evidence](terrain-height-integration.md). Claude's exact-model
v3 generator reduces sand detail and packed-earth cracks, adds low loose scree,
and makes cliff faces opaque with world-height-aligned strata. Codex completed
generation/integration after Claude reached quota. `gravel_wash` applies only
to open tiles beside real in-bounds rock. Cover, rubble, roads, ramps and map
edges keep their own rules and material identity. Cliff UVs now map height4
to the top texture row and height0 to the bottom. No authored map or Go bytes
changed. Output/source hashes are in `work/art/terrain-v3/output-lock.json`.

All12 four-map chunk-order comparisons pass again, with no differing channels.
The actual0.3.3 Go/WASM terrain product suite also passes movement, paid
construction, elevated flight/service, frontmost picking, originalUS04 Return,
exact save/restore and complete renderer disposal, with no browser errors.
The WASM hash is `4e67eebdd53c6ce588c14f0f01b54c236e193feacfbd2936bed0af4002a45efa`.
Both TypeScript checks and240 runtime tests pass at this boundary. Root viewed
all four native material screenshots and the raised construction/cliff-fog
captures. The prior product evidence is preserved under `terrain-height/pre-v3`.

The generator still reports one seam heuristic warning for the unintegrated
`farmland_dry` material: edge delta1.03 versus interior mean0.14. Its periodic
furrows need their own acceptance before use. This is not waived by the
integrated terrain tests. Industrial/farmland surfaces and extra transition
assets are not claimed to be integrated. Final environment dressing, fog-edge
styling, Claude review and completed-art long-match performance remain work.
