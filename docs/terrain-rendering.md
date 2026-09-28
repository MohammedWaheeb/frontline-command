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

## Still required

Elevation currently uses surface shading and boundary marks; proper raised
terrain and readable cliff faces remain a visual gap. Additional generated
industrial/farmland surfaces and face/transition assets are not claimed to be
integrated. Environment props, full-roster art, final terrain colour review and
long-match performance with the completed art pack remain release work.
