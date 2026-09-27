# Battlefield renderer integration

Codex continued the incomplete Claude renderer during the expressly authorized
quota takeover. Claude's dimetric projection, terrain baker, layered atlas loader
and original asset contract remain the basis. The root owns `client/src/render/`
until explicit handback. The UI agent owns app screens, controls and build tooling.

`BattlefieldRenderer.create(host, options)` accepts the map, catalog, shared
ArtLibrary, settings and gesture/error callbacks. Feed only authorized snapshots
through `setSnapshot`. Input callbacks contain screen selection rectangles,
millitile positions, currently visible targets and physical button/modifier data.
The UI retains selection groups, targeting state, Go legality advice and command
submission. The renderer never calculates damage, economy, vision or movement.

`whenAssetsReady()` waits for the currently requested sprite loads. The exposed
`missingArt` list records absent assets and substitutions; it must not be treated
as complete artwork. Its temporary procedural building and class substitutions
are development aids inherited from Claude's initial renderer. They block
finished-art acceptance and will be replaced by their actual authored assets.

The camera supports pan, cursor-centered zoom, drag selection and minimap
projection. Entity motion interpolates only between authorized positions. Lost
enemy sight removes the entity immediately, without guessing death or its route.
The separate fog texture uses Go's explored/current sight arrays; old building
silhouettes come from authorized memory and are never legal entity targets.
Terrain chunks are generated on demand and old offscreen textures are evicted.
Scene disposal removes listeners, canvas and scene textures, retaining the shared
ArtLibrary for app-controlled release after cameo/scene use ends.

## Observed browser check

The Browser plugin/skill is not available, so the frontend testing workflow used
the installed Playwright Chromium. An isolated test surface loaded actual Go/WASM
and synthetic test geometry, then rendered at 1600×900 and 1280×720. It verified
HQ click identity, drag rectangle, camera zoom/resize and zero canvases after
disposal. No browser errors occurred. Screenshots were saved outside the repo at
`/tmp/frontline-renderer-qa/initial.png` and `resized.png` and visually inspected.

The first visual pass exposed a Pixi atlas-loading defect: `@2x` auto-detection
halved texture dimensions even though rectangles already used physical pixels.
Adjacent frames appeared together. Explicit source resolution 1 fixes this;
the SpriteSheet applies the only final half-scale. The repeated screenshot now
shows one correctly anchored headquarters and supply field. This was verified
against the installed Pixi loader and its [official application documentation](https://pixijs.com/8.x/guides/components/application).

This check is renderer integration evidence, not a finished product screenshot.
Pending work includes complete real assets, authored terrain/prop review,
death/impact/operation effects, aircraft hit bounds and animation review, long
match GPU/memory profiling, context-loss recovery testing, and visual comparison
of the complete game HUD against the RTS reference study.

## Subsequent integration corrections

The actual product was inspected in the in-app browser at 1280×720. The rebuilt
HQ atlas is a correctly anchored original control-tower headquarters, and the
connected olive/brass console retains most of the screen for the world. The
engineering rig still used the documented car stand-in during that inspection;
its actual rig/hauler assets are being produced separately.

Observed map-object destruction now changes only authorized `snapshot.rubble`
footprints. Dimensions come from Go's public catalog `object_classes`, not a
second client rules table. A separate presentation map keeps the original map
immutable; rewinding replay or changing perspective rebuilds the known rubble
set and invalidates only affected terrain chunks. Unknown destruction is never
inferred from a global mutated map.

A previously visible actor with an authorized destruction event can play its
available death/wreck state for a bounded interval. Lost sight alone removes the
actor immediately. Wrecks cannot be selected and do not retain a live tank turret.
Reduced motion uses the final death pose. Hauler loaded/damaged poses use owned
cargo or the public returning-cargo state, and health bars use authored per-pose
hardpoints when present. The durable renderer browser regression now passes
actual Go/WASM object destruction, observed rubble, save rewind, click/drag/zoom,
1280×720 and 1600×900 resize, and five create/dispose cycles with zero residual
canvases. Evidence is in `work/evidence/render/browser-results.json`; screenshots
were visually inspected. No page errors occurred; four GPU ReadPixels stall
warnings came from screenshots and are recorded. Full asset and performance
review remain open.
