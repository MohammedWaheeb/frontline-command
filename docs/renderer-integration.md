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


## Atlas loading and memory

Atlas JSON is indexed when a unit type appears. Image pages upload only when a
visible pose requests their frames. Auto/standard quality uses the authored 1×
derivative; high quality uses 2× and applies at the next operation. A pending
animation retains its last authorized pose, while layers absent from a state
are hidden. Pages unused for ten seconds are eligible for eviction when total
sprite-page memory exceeds 192 MiB (standard) or 384 MiB (high). This is a working
set policy, not a promise that an arbitrarily large visible scene fits the cap.

The real Go renderer fixture (US HQ, rig, tank and supply field) used 16 of 36
indexed pages, 47,989,896 decoded bytes, at initial view. Destruction raised this
to 18 pages and 53,260,200 bytes. Both images were inspected; only the explicitly
missing neutral prop used a stand-in. Final disposal reported zero indexed or
resident pages and zero canvases. Full four-player GPU/FPS and long-session
measurements remain pending. The application serializes shared-art cleanup
between operations; the ArtLibrary also serializes page disposal and new loads.

## Current pose and illustration verification

Go now publishes elapsed deployment/packing progress through the existing
0–1000 progress field. The saved channel start tick survives restore. The actual
browser fixture observes 500 halfway through both channels: deploy frame4 of8,
then pack frame4 resolving to reversed deploy frame3. Sprite metadata aliases
now resolve their real source frames, including hardpoints, without duplicating
textures. Medic healing, repair, designation, beacon and carrier-door states
use their corresponding authored poses; completed healing returns to idle.

Production buttons prefer the paired build illustration and selection prefers
the portrait, each tinted with its real team mask. The actual US rig loaded
128×96 build art and192×192 portrait art, with no game-atlas image requests for
these controls. Those are the current pipeline's specified2× dimensions;
larger-screen visual quality remains subject to final art review. An initial
test expected double those dimensions incorrectly; the preserved failure and
corrected source-contract check are recorded in `work/evidence/render/`.

The latest Chromium151 renderer check passed portraits/tints, HQ selection,
drag selection, destruction/rubble, rewind, reduced motion/flashing/shake,
deployment/packing and five scene disposal cycles. Initial sprite residency was
19 of54 indexed pages /59,545,896 decoded bytes; destruction used68,464,872.
Disposal returned zero pages, bytes and canvases. The screenshots were inspected.
There were no page errors; the four recorded ReadPixels warnings accompany
screenshots. The neutral prop in this fixture still explicitly lacks its real
asset, so this evidence does not certify complete game art.

## Building activity and repeated firing

The latest Chromium 151 fixture uses actual Go/WASM orders to produce a rig,
disable power, observe demand75/capacity40, enable power and sell it. The
resulting poses are `produce`, `lowpower`, `disabled` and `sell`; halfway selling
shows progress500 and construct frame3 through the reverse alias. The HQ's
production doorway was visually corrected and rerendered. Three real tank shots
at ticks113,169,225 each cue the animation; duplicate snapshots do not restart it.

This run passed without page errors, including previous selection, destruction,
accessibility, deployment and five-disposal checks. Initial residency was
19/57 indexed pages and60,333,408 bytes; destruction reached69,252,384 bytes.
Four screenshot ReadPixels warnings were recorded. Evidence is
`work/evidence/render/browser-results.json`. Missing factory/neutral art in this
synthetic fixture remains explicitly visible; it is not final game presentation.

Own low-power/service/charge presentation uses only permitted snapshot data.
Public strategic charge drives strategic artwork. Building damage plates map
to the authored50%/25% thresholds. Cosmetic squad members decrease with disclosed
health and return when healed; combat strength remains wholly in Go. Variable
safehouse channel duration is saved in Go so consuming a rapid-transfer window
cannot make its visible preparation jump to the wrong timeline.

## Independent part shadows

Actor parts now place their projected ground shadows in a common container
behind every body/weapon plate. Previously the turret's shadow drew after the
base beauty pass, incorrectly darkening its own plinth. The isolated building
pilot identified the defect; the real `ActorVisual` pixel test now proves the
shadow affects 1,741 ground pixels and zero of 3,552 opaque facade pixels. Both
the weapon and its shadow hide in damaged/disabled/construction states.

`client/tests/render/browser.mjs` also repeats the existing Go/WASM production,
selling, deployment, combat feedback, rewind and disposal journeys. Chromium
151 passed with no page errors. The pixel fixture lives in a separate document,
matching the product's one-Pixi-application lifecycle; creating an additional
test-only Pixi application beside the live fixture exposed shared internal
batcher teardown errors, so that invalid fixture arrangement was removed.
Evidence: `work/evidence/render/browser-results.json` and
`turret-ground-shadow.png`. This verifies the isolated pilot without advertising
unfinished building art as a shipped asset.

## Forced graphics loss and recovery

The Chromium 151 fixture now uses `WEBGL_lose_context` to lose and restore the
actual WebGL renderer. Pointer clicks produce no orders while graphics are lost;
an in-progress drag is canceled. The independent Go/WASM worker advances from
tick 100 to 120, saves, and restores exactly while the graphics context is absent.
Restoration rebuilds terrain/fog and renders five actors with 34 resident sprite
pages. The recovered screenshot was inspected; zero page errors occurred. The
existing error callback provides a recoverable graphics-loss message to the UI.
This test covers worker survival and renderer restoration on this browser, not
physical GPU resets, out-of-memory pressure or all supported browsers.
