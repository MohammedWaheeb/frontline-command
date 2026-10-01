# Terrain height correction — proposed implementation contract

Status: read-only design review. No renderer, simulation, authored map or asset
was changed for this investigation. The proposed work must land as a coherent
surface/projection/input/fog change; shifting terrain artwork alone is unsafe.

## Existing behavior and actual content constraints

`iso.toScreen` and `toWorld` describe a flat 64×32-pixel tile diamond. `LEVEL_PX`
is already 10 presentation pixels per level. `TerrainBaker.bake` adds shading,
but `mesh` still owns an entire 16×16 chunk through two flat triangles. Actors,
resource props, remembered buildings, markers, placement, projectile endpoints,
picking and camera focus all use the flat projection. Fog is one flat affine
sprite. The previously fixed material seams depend on exact nonoverlapping
geometry and globally phased UVs; that guarantee must survive elevation.

The authoritative design §§6/16 grants height extra sight, no damage bonus;
cliffs and designated flags block ground sight; ramps must remain readable.
Actual Go contracts are narrower than a conventional heightfield engine:

- Tile height is an integer 0–4. Height above zero adds two sight tiles, rather
  than two per level. There is no height-gradient movement rule.
- `Tile.Passable` excludes water, cliff and blocked terrain. Height differences
  alone do not prevent movement or building placement. The renderer must never
  add an implied wall across an otherwise passable road/open/ramp connection.
- Ramps have no orientation or endpoint fields. Authored ramps are rectangles
  painted one level below the plateau; roads overwrite portions while retaining
  their height. Inferring a slope solely from connected `terrain='ramp'` cells
  would leave fragmented or incorrectly oriented slopes.
- Valid structures can span several height levels. Visual support must be
  solved without rejecting an otherwise legal Go placement or moving actors.

The read-only inventory `work/evidence/terrain-height/authored-topology.json`
records exact map hashes. Across 32 current maps, 22 contain raised tiles and
18 have passable height-changing edges. There are 145 such edges touching ramp
terrain and **1,857 without it**, plus 17 fragmented ramp components. Relay
Heights alone has 64 ramp and 68 other passable height transitions. There are
also 962 cliff tiles at height zero: blocked terrain is not always an elevation
discontinuity. Of 596 default initial building declarations, SA04's
`fixed-battery` spans heights 2 and 3. Future player construction can create
more mixed footprints. This inventory is not path, balance or gameplay proof.

## One public terrain surface

Introduce a pure `TerrainSurface` built from public map tiles, retaining flat
projection helpers for vectors, sprite offsets and the tactical minimap.
Do not globally replace `toScreen`: projecting a turret offset using terrain
height would apply the lift twice and sample an unrelated map position.

The first bounded surface should keep tile centers at their declared height,
flat interiors of uniform plateaus, and **continuous traversable joins**:

1. Build tile-center/corner triangles. At each corner, group incident passable
   tiles by their cardinal connectivity around that corner. Share the average
   corner height within a connected passable sector. Keep hard boundaries
   against impassable cells separate. This avoids averaging an isolated higher
   patch across an intervening cliff or changing a neighboring cliff's level.
2. Use a fixed triangle fan from each tile center to its four corners. All
   shared walkable edges have identical endpoints, creating continuous slopes
   for ramp, road and open transitions. Declared center levels stay inspectable;
   rendered interpolation is cosmetic, not a second sight/movement rule.
3. Fill discontinuous impassable boundaries with vertical edge polygons using
   each side's exact endpoint heights. Emit every boundary once under a stable
   ownership rule, including chunk borders and map edges. Do not fabricate a
   vertical face between two connected passable surfaces.
4. Height-zero cliffs retain an unmistakable blocked rock material/edge rather
   than acquiring a fictitious plateau or invented negative height. A distinct
   ravine art treatment can be reviewed later; it must not imply a new route.

This is a deliberately conservative surface, not a new authored ramp-direction
format. If later visual review requires a long planar incline, add optional
public presentation metadata through a separate reviewed content contract.
Do not infer a global direction from the existing 17 ramp components.

Required shared operations:

| Operation | Consumer |
|---|---|
| `sampleGround(point)` | Exact triangle height at an interpolated Go position |
| `projectGround(point)` | Flat projection minus sampled height × 10 px |
| `topTriangles(tile)` / `edgeFaces(tile)` | Terrain, fog, hit tests, culling |
| `pickSurface(screenWorld)` | Frontmost rendered surface and barycentric world point |
| `footprintSurface(center,w,h)` | Placement outline and visual foundation skirt |
| `projectedBounds(rect)` | Camera clamp/culling including raised edges |

Use explicit surface revisions for the public presentation map. Rubble disclosure
changes only authorized terrain/material flags, not height. Replay rewind must
rebuild the same surface/material result from baseline plus permitted rubble.

## Terrain, occlusion and texture ownership

Keep the existing material bake in its original flat coordinate plane. New
surface vertices use **flat** positions for texture UV lookup and **raised**
positions for drawing, so texture phase and the opaque bleed remain identical
on both sides of every chunk boundary. Do not derive UVs from displaced screen
coordinates. Remove the current fake face shadow strips to avoid double edges.
Existing `cliff_face_tier1/2` assets are available for face-material review;
face UV phase must use world edge coordinates, not chunk-local restart.

A single two-triangle chunk cannot express ramps or interior height changes.
Replace its drawing with cached tile/depth fragments while preserving bounded
chunk texture ownership, eviction and explicit geometry disposal. The entire
terrain cannot remain behind every actor: a raised near cliff/top must occlude
ground actors behind it. Use a common deterministic ground draw sequence for
surface fragments, faces, props and ground actors, with the same frontmost
surface key used by picking. Keep cosmetic aircraft altitude separate. Sorting
only by raised screen Y would reverse ordering on high ground; use ground
position/footprints with explicit surface-face ties instead.

Prototype correctness on a small isolated fixture before committing to a
batching arrangement. The installed Pixi `Mesh` implementation batches default
`MeshGeometry` only up to 100 vertices in auto mode; a large deformed chunk will
silently leave that path. Cached small fragments can be batched, but draw calls,
JS traversal and upload cost must be measured. Do not build thousands of new
mesh/Graphics objects every frame. If depth strips cannot meet the existing
load gate, evaluate a shared atlas/depth-aware mesh implementation before
shipping; do not restore the incorrect all-terrain-behind-actors order.

## Actor anchors, structures and commands

Ground actor roots, selection ellipses, health bars, hardpoint feedback,
resource props and remembered buildings use the shared surface sample. Sample
the **interpolated authorized position**, not the latest tile center, so units
travel continuously across slopes. Infantry member offsets need per-member
terrain deltas; turret pivots stay rigid relative to their hull. Keep the
previously verified hull/turret ground-shadow layering.

Buildings use one rigid support plane derived from their retained physical
footprint, with a shallow foundation skirt down to the sampled edge surface.
This handles legal mixed-level placement without sinking corners or inventing
new terrain/collision. The skirt may only exist for a disclosed actor/memory;
it cannot reshape an unknown enemy site. Placement draws the same footprint
surface/support plane and still gets validity only from Go advice.

Aircraft need two coordinates: ground contact/shadow and cosmetic body altitude.
Do not add terrain lift to an already lifted body or displace the shadow twice.
A stable map-wide cruise visual plane with a maximum-height clearance and
interpolation toward local terrain on landing avoids bobbing with every ground
slope; root should reconcile this with the current flight-presentation work.
This remains visual timing only and never changes Go landed/attack/service state.

Markers, stations, salvage/field hits, warning rings, order endpoints, projectile
impact markers, camera focus and placement corners must all use ground sampling.
Ground order polylines should be sampled across crossed triangles rather than
joining two elevated endpoints through the ground. Minimap positions remain
flat tactical coordinates; only its camera-footprint outline uses surface
unprojection. Screenshot/test helpers that assumed the old flat screen equation
must use the shared projector instead of patching expected offsets individually.

## Picking, fog and information safety

Flat inverse projection is no longer an inverse. Test candidate surface
triangles and recover the exact world XY by barycentric interpolation. The
0–4-level range bounds candidate tiles near the flat inverse; the maximum
40-pixel lift corresponds to 1.25 tiles along each coordinate, so a small padded
neighborhood is sufficient. Use the same deterministic frontmost ordering as
drawing when raised surfaces overlap. Clamp only after surface intersection.
A visible impassable face maps to its owning blocked tile for ordinary Go order
handling; it must not select an obscured lower route through the cliff.

Fog needs the exact same deformed surface/face geometry. A shifted flat sprite
would leave exposed rims and black gaps. Opacity is sampled from the owner's
existing `visible`/`explored` bits; no client recomputation of sight. Faces use a
conservative adjacent-cell disclosure rule (the more restrictive of their
owners), and unexplored remains fully opaque. Do not blur unknown cells into
transparency. Ground fog may be composed with each cached terrain fragment;
authenticated live actors, memory and static props then have explicit permitted
visibility/opacity. Public map resources must not protrude through an unknown
raised fog edge. Rewind/perspective changes clear old fog/memory/actor state.

Selection, hit testing, pixel reads and draw order must never search a complete
server state or an initial hidden mission actor list. Only actual snapshots,
permitted memories and public map geometry participate. A disappeared enemy is
still removed immediately; a missing actor is not a death event.

## Bounded implementation and ownership proposal

| Stage | Proposed ownership | Acceptance before next stage |
|---|---|---|
| 1. Pure topology/projection/picking | This lane: new `render/terrain-surface.ts`, focused unit tests and fixture data | Shared edges, all four slope directions, partial chunks, max height, exact projection roundtrips, deterministic frontmost pick; Go/map bytes unchanged |
| 2. Terrain geometry/material/fog fixture | This lane after explicit transfer of `terrain.ts`; new isolated browser fixture | No seam/order differences at 0.45×/1×/1.8×; plateau top/face, four ramps, road-overwritten ramp, zero-height cliff, fog edge and layered actor occlusion |
| 3. Application integration | Root retains `battlefield.ts`, `actors.ts`, `iso.ts`, flight and minimap hooks | Commands, bounds, selection, placement, focus, shadows, memory and rewind use shared contract |
| 4. Real Go product and performance | Coordinated serial browser window | Actual paid build on plateau, unit traverses legal slope, fog-hidden enemy absent, landing/shadow correct; Relay Heights + SA04 mixed battery; save/replay unchanged |

Run existing terrain reversal and renderer acceptance tests, then actual
1600×900/1280×720 product input checks and the same headed Metal 688-actor
performance fixture. Record GPU/backend and wall timing; a software-headless
frame rate is not reference-device acceptance. No production implementation is
authorized by this document alone; root will assign the precise next files.
