# Read-only review of terrain-projected aircraft shadows

Scope: review of the current terrain surface, actor ground depth and shadow layer.
No renderer or art source is changed by this note.

A single depth for a whole shadow sprite cannot consistently satisfy all three
requirements: no flat-terrain cropping, terrain occlusion at height changes, and
no shadow drawn over its parked aircraft. Increasing the whole sprite's depth
from its alpha bounds addresses the first but can violate the other two.

Terrain-projected pieces are the more coherent bounded correction:

1. Convert the shadow frame's existing ground-plane screen offsets through the
   inverse isometric transform to a local world-plane polygon. Preserve the
   authored texture, heading, anchor and existing light displacement; do not
   recompute flight timing or invent another shadow/light direction.
2. Clip that polygon against `TerrainSurface.topTriangles` in its bounded world
   rectangle. Interpolate UVs at each intersection and use the same triangle
   heights as the terrain. Do not put a top-facing shadow on a vertical cliff
   face simply because its projected screen area overlaps that face.
3. Sort each resulting piece immediately over its owning terrain triangle and
   under that triangle's fog, preserving ordinary front terrain occlusion. Avoid
   one global front-depth for all pieces, which recreates the original problem.
4. Keep actual service-deck support explicit. A landed plane supported by its
   authorized home/deck should cast onto that deck's support surface within its
   footprint, rather than terrain underneath the building. Outside that known
   support use the actual terrain, not a blanket facility-height override.
5. Cull before requesting atlas frames. Active pieces must refresh the same
   sheet's frame residency; after eviction, hide/detach a missing frame while it
   reloads. Mesh disposal owns its geometry, not the borrowed atlas texture or
   shared texture source. This must preserve the actor eviction fix `de1b27f`.

The shadow is an authored bitmap, so splitting should not mean one new draw call
per pixel or a new bitmap per triangle. Reuse vertices/buffers, bound cells by the
frame/ink rectangle where available, and batch compatible pieces within terrain
ordering constraints. A single mesh containing all depths cannot interleave with
unrelated terrain faces merely by storing a depth value in each vertex unless
the renderer actually uses a depth buffer. Measure the actual implementation at
the maximum visible aircraft count before claiming performance acceptance.

Useful acceptance cases are flat tile edges/corners at both atlas resolutions;
landed, takeoff, cruise and landing; ramp and plateau boundaries; front/rear cliffs;
an occupied service deck with the home building behind/in front; paused camera
moves, rapid cull/reappearance, and cache-pressure/disposal. Compare the old/new
shadow alpha on flat ground and verify body pixels do not darken when only shadow
placement changes. Aircraft remain driven by authorized Go state. Shadow geometry
must not fetch or infer hidden actors or alter gameplay occupancy.

## GPU candidate review findings

The first CPU clipping candidate rebuilt all visible plates after any moving
plate invalidated its global key. Root's measured 688-actor/1,696-plate fixture
confirmed the concern, and that implementation was not accepted. The replacement
stamps authored shadows into a bounded render texture sampled through static
public terrain geometry, retaining separately clipped known service decks.

Three concrete review findings were sent to the renderer owner:

- A 64-screen-pixel padding becomes only 35.56 world pixels at zoom 1.8, less
  than height 4's 40-world-pixel lift. Raised terrain at the viewport edge can
  sample past the stamp bounds. The candidate now adds maximum terrain lift to
  its padding; viewport-edge pixel verification remains the owner's gate.
- Distinct visibility arrays can share the candidate's original 32-bit FNV
  hash. `work/evidence/shadow-review/visibility-hash-collision.json` contains
  two explicit 32×32 masks with hash 3,149,633,485. This proves cache inequality
  was being mistaken for equality, not an observed gameplay information leak.
  The owner replaced it with an exact mask comparison and revision.
- Pixi rounds physical render-target sizes. For a requested 4,200×2,300 target
  at resolution 62/64, `RenderTexture.width/height` become approximately
  4,200.258×2,299.871 after the same `source.resize()` invoked by RenderTarget.
  Comparing those values directly with the original requested integers causes
  allocation on every following frame. The owner was notified to compare an
  explicit allocation key or normalized physical dimensions and verify stable
  texture identity at large/fractional-resolution viewports.

Borrowed texture ownership remains correct in the inspected candidate: default
`Mesh.destroy()` leaves the source alive, active actor frame lookup refreshes
residency before trimming, missing frames hide while reloading, and feedback
reset clears the stamp on context loss/restore. These static checks supplement,
but do not replace, the owner's native-pixel, lifecycle and hardware-load gates.
