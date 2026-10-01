# Validated public map dressing

`client/src/content/environment.ts` implements the approved optional sidecar
contract. It is separate from strict Go map data, changes no simulation rule and
contains no executable script. No authored map has been dressed by this lane;
only the synthetic integration pilot has been rendered and tested.

```ts
const environment = decodeMapEnvironment(bytes, validatedMap, {mapSHA256});
const assets = environmentAssetIds(environment);
```

`decodeMapEnvironment` is pure and returns deeply frozen detached data. It throws
`RuntimeError` with `environment_invalid` for malformed/unsupported presentation
or `environment_map_mismatch` for a different map identity/hash. Root's separate
content-library loader owns same-origin bounded fetching, exact sidecar hash/size,
exact installed map bytes and normalized public-map comparison. The decoder does
not fetch, overwrite a map, install a pack or change gameplay.

`BattlefieldOptions.environment?: MapEnvironment` accepts a successfully decoded
sidecar. The root Application/BattleController integration owns loading, optional
fallback notices and preflight through `environmentAssetIds`. No descriptor means
no sidecar request. The exact descriptor and loader contract are documented with
the content library.

## Exact version 1 shape

All shown fields are required, unknown fields reject, and arrays may be empty:

```json
{
  "schema": "fc-map-environment/1",
  "map": {"id": "example", "version": "1", "sha256": "64 lowercase hex characters"},
  "object_skins": [
    {"object_id": 90, "asset": "prop.ruined_house_garrisonable", "direction": 2}
  ],
  "placements": [
    {"id": "crossing-center", "asset": "prop.bridge_permanent", "position": {"x": 30500, "y": 30500}, "direction": 0, "state": "deck"}
  ]
}
```

The example illustrates shape only; it has no valid checksum or implicit terrain.
Limits: 1 MiB, 512 object skins, 2,048 static placements. Placement IDs are unique
ASCII letters/digits/dot/underscore/hyphen, 1–80 characters and start with a letter
or digit. Coordinates are in-bounds integer mt. Directions are exactly 0–3,
matching the four authored directions: sim +X, +Y, −X, −Y.

Object skins name an existing public map object ID exactly once. Light and heavy
objects retain their canonical wall skins; a garrison may use warehouse or ruined
house. Different classes, missing IDs, duplicate bindings, new state/owner/HP or
unit/building replacements reject. A narrow final `ActorVisual` constructor
option selects art and presentation direction only. The Go entity's facing,
position, HP, capacity and ownership remain unchanged. Actual damage selects the
same existing poses; disclosed rubble retains the chosen asset and direction.

## Static placement constraints

These conservative constraints express presentation honesty, not a new pathfinder.
They may reject otherwise drawable art until a more capable surface contract has
been reviewed.

| Allowed family | Constraint |
|---|---|
| palm, fence_chainlink, concrete_barrier, power_pylon, wreck_decor_vehicle | Complete rotated specification footprint plus a 500 mt margin on every side must already be `blocked` or `cliff`; no water, passable tile or mandatory corridor. |
| container_stack, fuel_tanks, decor_building_nongarrison, relay_objective, command_relay_objective, depot_objective | Same constraint, with every support tile additionally a cliff or explicit `sight_blocker`, so an opaque mass never invents blocked sight. |
| forest_edge_scrub | Complete footprint must already be `cover` or `rubble`, outside mandatory corridors. |
| bridge_permanent | Tile-centered modules on existing `road`; continuous same-height lateral road cross-section reaches water on both sides within 32 tiles. |

All footprint/support tiles must have the same declared height. Static placement
footprints and their conservative margins cannot overlap each other. Static props
use `idle`; sealed non-garrison scenery uses `intact`. Fake damaged/destroyed
static state is not accepted. Resources, destructible objects, garrisons and
editor handles cannot be inserted as static props. The three objective-named art
IDs are only noninteractive public scenery here: they confer no target, label,
capture or scenario objective.

Go currently has no `bridge` terrain type. The sidecar cannot add one. Bridge
`deck` has no rails. `edge_left` requires immediate water on its local Blender −Y
side (sim +Y before rotation); `edge_right` requires the opposite side; `idle`
requires water immediately on both sides. Thus internal legal lanes cannot gain
visual rails. All four orientations are tested. The actual road still owns
pathing, height and mandatory-corridor semantics.

Static props are drawn only after their center is explored, and dim in remembered
fog. An opaque block may legitimately remain undisclosed to ground units until
scouted from the air; the renderer does not weaken that rule to show the artwork.
There are no hidden actor/tag lookups. Static dressing has no command hit target,
collision, damage, salvage, explosions, power network, income or cover bonus.
Offscreen nodes are culled against their conservative full sprite canvas before
requesting atlas frames; camera re-entry restores them. Disposal clears the scene.

## Actual Go and browser acceptance

```sh
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
node client/tests/render/environment-sidecar-browser.mjs
```

Six pure tests exercise the strict schema, exact map binding, immutable output,
prototype-name rejection, class/skin compatibility, level support, terrain/cover
requirements, overlap, all four bridge orientations, protected internal lanes,
exploration and authorized skin rubble. The complete runtime suite passed 228
tests, including the root's independent content-library loader tests. Both app
and runtime typechecks passed; the browser fixture also passes strict standalone
TypeScript checking.

The isolated headed Chromium pilot runs production rendering with real Go WASM
simulation **0.3.3**, WASM SHA-256
`4e67eebdd53c6ce588c14f0f01b54c236e193feacfbd2936bed0af4002a45efa`.
It Go-validates the synthetic map and mission, then uses ordinary previewed orders:

- Initial ground vision leaves opaque industrial centers hidden. An actual
  fighter departure reveals container and fence art at tick 114. It receives a
  normal Return order afterward. No visibility bit or saved state is edited.
- The garrison uses ruined-house art at direction 2 while its actual Go facing
  stays 0. Normal tank attacks select `damaged`, then Go authorizes rubble at
  tick 862 and the same skinned debris persists.
- The tank moves to the far bank at tick 1024. Eight sampled positions while
  over the river all fall on actual Go road tiles; all twelve bridge modules
  are visible or remembered, with clear interior lanes. Native 1600×900 and
  1280×720 screenshots were inspected.
- Camera culling hides all thirteen currently disclosed dressing nodes at the
  distant viewport and restores them on return. This is a functional check,
  not a maximum-load performance claim.
- Fog memory, current-save hash
  `c21efd612eb7f940eca9f9b113d8708e930ce8fabb568b141d26e2a16c16df72`, opening
  rewind hash `9a8331cebc9aee4de20cb0a99aac404709f46d00beecf973e1a3582f29e9a99e`,
  and zero remaining environment nodes/canvases/atlas pages after disposal pass.

Evidence lives in `work/evidence/environment-sidecar/browser.json` and adjacent
native screenshots. The synthetic fixture starts with an airfield and fighter
for the visibility check; it does not claim a paid tech/production opening.
`US.airfield` and `US.fighter` use the existing, explicitly recorded development
art fallbacks in this capture. Every environment prop in the pilot uses its real
completed asset. No page errors occurred.

Remaining gates: root review of this pilot, authored map dressing with readable
terrain/route composition, editor handles/export integration, and aesthetic
review. Available assets or a validated sidecar are not proof of complete map art
or a finished game.
