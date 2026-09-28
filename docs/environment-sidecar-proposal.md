# Public environment sidecar proposal

This is a proposal for coordinator review, not an implemented schema or authored
map data. The strict Go map JSON stays unchanged. Current `LibraryMap` has no
environment member, and maps with unknown Go fields remain rejected.

## Separation and file identity

Add an optional library map reference only after review:

```json
{
  "environment": {
    "url": "/content/environment/example-layout.json",
    "sha256": "exact lowercase SHA-256 of the sidecar bytes",
    "bytes": 1234
  }
}
```

The sidecar would identify `schema: "fc-map-environment/1"`, the map ID/version,
and exact map-byte SHA-256. A mismatch rejects presentation instead of silently
using it with an edited map. Same-origin static JSON, bounded streaming, exact
hash/length, strict unknown-field rejection and cancellation should follow the
existing content-library rules. Suggested limits: 1 MiB, 2,048 placements, unique
80-character IDs, integer in-bounds mt coordinates, four discrete orientations,
and an explicit prop allowlist. These are proposals, not current guarantees.

The App owns loading and passing validated presentation to the renderer; Go
receives the original map bytes only. Local editor export/import may preserve the
separate sidecar bundle after corresponding editor support is implemented. An
arbitrary bare map continues to play with the current default bindings. A missing
optional sidecar should be reported accurately, never block or change Go rules.

## Three different authoring cases

1. **Existing object styling:** bind one `map.objects` ID to a compatible skin,
   never a new object. Light/heavy walls remain their exact classes and footprints;
   garrison may choose warehouse or ruined-house art. Renderer visibility,
   health, owner and destruction still come from the actual disclosed actor and
   rubble. Unknown IDs or duplicate bindings reject. No raw mission tag lookup.
2. **Public static dressing:** explicit position/direction and allowed prop ID,
   with fixed non-gameplay state. Render only after exploration and dim in fog.
   It has no hit target, collision, cover, vision, capture, income, damage, salvage
   or event behavior. Placement review must ensure its mass and rails do not imply
   a blocked lane the Go map permits. Tall screens require real sight-blocking
   terrain. Terrain/footprint constraints must be validated against the map;
   rejection is preferable to a visually misleading automatic placement.
3. **Editor-only handles:** spawn and region marker sprites belong to the editor
   layer and existing draft data. They never ship as selectable match actors or
   grant scenario objectives. This likely needs no map sidecar entry at all.

Bridge modules deserve a narrow rule rather than generic dressing. The current
Go enum has no bridge tile: crossings are passable public road geometry among
impassable terrain. The final validator must check explicit aligned road spans
and public lateral water/blocked neighbors; it must not invent a bridge terrain
class. Interior modules need rail-free decks, and rails cannot cross any legal
neighboring lane. No new bridge destruction is introduced. Forest-edge scrub belongs to real cover terrain; plain
palms do not grant cover. Fuel tanks and pylons remain static props with no extra
explosions or power connectivity. A wreck prop never creates salvage.

## Remaining asset allocation

| Assets not bound by the immediate renderer slice | Proposed use |
|---|---|
| ruined_house_garrisonable | Explicit compatible skin on an existing garrison object. |
| palm, forest_edge_scrub | Public vegetation constrained by actual map terrain and clear routes. |
| fence_chainlink, concrete_barrier, container_stack, fuel_tanks, power_pylon | Reviewed industrial dressing; no implicit gameplay effects or misleading closures. |
| decor_building_nongarrison | Static sealed scenery only where it cannot misrepresent a traversable tile; not silently a fourth Go object class. |
| bridge_permanent | Narrow explicit bridge-tile module rule. |
| wreck_decor_vehicle | Noninteractive public scenery. |
| relay_objective, command_relay_objective, depot_objective | Explicit public mission location dressing only after actual objective semantics are checked; never replace a hidden actor or claim a capture target that does not exist. |
| spawn_marker_editor, region_marker_editor | Editor overlay, not live-match placement. |

## Proposed implementation split and gate

Root: approve final descriptor and loader contract, then wire `LibraryMap` and
App loading. Renderer lane: pure bounded sidecar validation, existing-object skin
binding and static scene nodes, with fog/rewind/disposal and malformed-file tests.
Content author: explicit per-map dressing preserving authored routes and gameplay.
Editor lane: preserve/export presentation and draw editor handles after review.
No shared model/Blender change is required for the current completed props.

Begin with one public synthetic industrial/bridge/cover fixture, inspect native
1600×900 and 1280×720 pixels and validate every passable lane with real Go orders.
Only then dress authored maps and audit their actual base/resource/crossing/combat
views. File counts or available sprites do not prove readable, truthful placement.
