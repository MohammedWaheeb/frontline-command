# Prepared service-surface runtime contract

`client/src/render/service-surfaces.ts` is a pure parser and sampler for reviewed
service-building art. It is **not yet wired into SpriteSheet or ActorVisual**, and
no shipping asset has been assigned a new lift. Geometry/aircraft scale reviews
must pass before metadata reaches the production packer or rendered game.

The optional shipping field is `service_surfaces` with this strict shape:

```json
{
  "schema": "fc-service-surfaces/1",
  "coordinates": "local_sim_mt",
  "surfaces": [
    {
      "id": "foundation",
      "polygon_mt": [[-2980,-2480],[2980,-2480],[2980,2480],[-2980,2480]],
      "z_bu": 0.035,
      "lift_2x_px": 2.7434285119171595
    }
  ]
}
```

The packer must derive `lift_2x_px` from the source's actual top height using
`z_bu × 128 / sqrt(2) × cos(30°)`. Runtime rejects a mismatch above1e-6 pixels.
Source-audit fields such as `source_mesh` and `derived_lift_2x_px` are not shipping
fields. The above rounded example is illustrative; production values come from
the source. Both atlas resolutions represent the same world: divide the2× lift
by two for the renderer's1× world coordinate system, then use normal camera zoom.

`decodeServiceSurfaces(value, retainedFootprint)` returns detached deeply frozen
data. Current conservative limits match the source pilot:1–8 polygons,3–16
unique integer vertices per polygon, strictly convex nonintersecting edges,
finite0–0.5BU height, unique bounded IDs and all vertices inside the retained
physical footprint. Unknown fields and invalid coordinates reject with
`art_service_surface_invalid`. These are art support bounds, not extra Go rules.

`serviceSurfaceAt(data, localPoint)` returns the highest actual containing plane,
including its edges. Outside all polygons it returns undefined. A real declared
zero-height support is distinguishable from an outside position. A converted
building's new faction/capacity must not replace the retained structure's art or
metadata. Renderer integration must keep public terrain/foundation height
separate, and must leave an outside fallback aircraft on its own local ground.
It must neither move a Go actor nor change its flight timing or collision size.

Four focused tests pass for all six ordinary preferred airfield centers, actual
source heights, overlapping pads, outside fallback, retained3×3 conversion,
edge/vertex/winding behavior, detached data, malformed heights, self-crossing
polygons and invented support. Both TypeScript checks and232 runtime tests pass.
This is preparatory contract verification, not an accepted service-art render.
The unresolved physical/pixel evidence remains in
`work/art/service-decks/pilot-review.md` and the aircraft scale proposal there.
