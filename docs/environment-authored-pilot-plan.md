# Copper Junction dressing pilot and editor handle scope

This bounded plan was approved for implementation. The Copper Junction sidecar
and optional descriptor now implement the ten entries below; the Go map and
mission files remain unchanged. See `environment-authored-pilot.md` for actual
product acceptance evidence. The synthetic sidecar pilot was accepted for
functional geometry; aesthetic review remains separate.

## One authored map, explicit placements

Use `content/maps/copper-junction.json` unchanged. Its current exact SHA-256 is
`9ce72f0cbb236557ad75e37feed6c2aa7f5726e6f77cd61803eb84d0b1545057`.
This map has existing blocked height-3 plateaus, cover pockets and two garrisons,
so the pilot needs no new collider, sight blocker, object or mission tag.

Approved sidecar: `/content/environment/copper-junction.json`, with the installed
map ID/version and exact map-byte hash. Its exact-size, exact-hash descriptor is
added only to the Copper Junction library entry. Leave the map file and
its Go hash unchanged. This is one map, not an automatic scattering algorithm.

| Entry | Asset | Position mt or object ID | Direction | Existing public support |
|---|---|---|---:|---|
| west-pylon | prop.power_pylon | (45500,46500) | 0 | Complete footprint plus 500 mt margin: blocked height 3, not mandatory. |
| east-pylon | prop.power_pylon | (82500,81500) | 2 | Rotated matching blocked plateau, same height and margin. |
| west-cover-a | prop.forest_edge_scrub | (34500,53500) | 0 | Complete footprint: actual cover height 0, not mandatory. |
| east-cover-a | prop.forest_edge_scrub | (93500,74500) | 2 | Rotated matching cover pocket. |
| west-cover-b | prop.forest_edge_scrub | (35500,57500) | 0 | Separate actual cover footprint; no overlap with cover-a. |
| east-cover-b | prop.forest_edge_scrub | (92500,70500) | 2 | Rotated matching cover footprint. |
| east-cover-c | prop.forest_edge_scrub | (87500,52500) | 0 | Separate existing cover pocket. |
| west-cover-c | prop.forest_edge_scrub | (40500,75500) | 2 | Rotated matching cover pocket. |
| south-west ruin | prop.ruined_house_garrisonable | Existing garrison object 3, (39500,84500) | 0 | Original 3×3 Go object, HP and capacity unchanged. |
| north-east ruin | prop.ruined_house_garrisonable | Existing garrison object 4, (88500,43500) | 2 | Matching original garrison. |

Coordinates were checked read-only against all footprint tiles using the current
sidecar bounds. Every paired position is the exact 180° map reflection
`(128000−x,128000−y)`. Existing resource/station art already binds automatically;
no extra cargo, objective marker, power-network behavior or barrier is proposed.
The pylons are open lattice public scenery on already blocked terrain, not new
powered facilities. Cover remains exactly the Go terrain's cover, with gaps
preserved. Ruined-house art does not lower starting HP.

Copper Junction is a clearer first acceptance scope than forcing bridges into a
map that has none. In particular, current Dry River uses blocked/cliff dry-bed
terrain and has **no water tiles**. The accepted version-1 bridge validator
requires a road cross-section bracketed by water, so it correctly rejects a Dry
River bridge sidecar today. Do not rename terrain, broaden the validator silently
or insert an invented water crossing to use an asset.

## Required pilot acceptance before wider authoring

1. Decode the proposed sidecar against the unchanged installed map bytes. Verify
   the optional library load, exact descriptor integrity and normal fallback
   notice on mismatch. Confirm the selected map's Go hash remains unchanged.
2. Use an ordinary solo match on the real map with paid prerequisite/production
   orders to scout the two forward cover areas and garrisons. Preserve fog truth;
   an air pass may be needed to observe plateau centers behind cliff sight
   blockers. Do not paint visibility or spawn a fake inspection army into a live
   standard match.
3. Compare native 1600×900 and 1280×720 views of base/expansion approaches, cover
   gaps, both ruins and each plateau. Check ground contact at height 3, readable
   entryways/footprints, restrained density and no new apparent road closures.
4. Prove ordinary unit movement through the unchanged adjacent lanes and cover,
   plus garrison occupancy/damage/destruction. Keep identical order/seed/state-hash
   behavior with and without the purely presentational sidecar.
5. Parent reviews native pixels and gameplay evidence before any additional map
   receives dressing. The remaining industrial/objective props do not have to be
   squeezed into this first map merely to increase an asset count.

## Editor handles: small independent scope

Current `EditorPanel.tsx` is a top-down Canvas grid, while match terrain uses the
isometric renderer. Its existing spawn labels, region rectangles, click-to-tile
conversion and Go path/sight previews are functional. The completed
`prop.spawn_marker_editor` and `prop.region_marker_editor` sprites are isometric
flat icons; treating their perspective outline as a top-down physical footprint
would be misleading.

Proposed first slice: a reusable editor-only marker painter that uses each
asset's authored first frame as a **fixed-size handle icon** beside the exact
existing grid anchor, while retaining the precise grid rectangle/label. It does
not replace coordinate conversion or stretch an isometric region icon across a
rectangular top-down selection. Keep slot/team labels and exact region bounds;
use selection/focus outlines and textual labels for keyboard/assistive access.
No spawn facing rule exists in the map schema: the arrow is a handle icon, never
a new unit orientation instruction. No marker is passed to live gameplay or
`MapEnvironment.placements`.

Suggested ownership after approval: new `client/src/render/editor-handles.ts`,
focused `EditorPanel.tsx` drawing calls and editor-specific browser/tests/docs.
Reuse the existing ArtLibrary and immutable atlas frames with explicit async
loading/disposal; preserve the current vector marker if a marker sheet is missing,
with an accurate visual-asset notice. Verify all four starts, multiple regions,
rectangular maps, screen scaling, undo/redo, reload and leaving test play. The Go
path/sight preview remains the authoritative preview.

Editor sidecar authoring/export is a later contract change. Current
`EditorPresentation` permits only description and screenshot, and draft version 1
rejects unknown fields. It would be wrong to attach an environment object ad hoc
or silently strip it. A separate approved extension must preserve unsupported
originals, carry exact sidecar/map checksums, revalidate after edits, include
undo/redo and CAS, and explicitly pass presentation to practice test play. Bare
map export must remain valid strict Go JSON. An installed map copied to a new
custom ID/version cannot automatically reuse its old exact-hash sidecar.
