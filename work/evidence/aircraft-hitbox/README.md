# Aircraft painted body selection regression

Initial read-only finding, 2026-09-28. During the initial coordinated performance
hold, no product code or asset sizing was changed and no browser was launched.
The later authorized implementation and actual results are recorded below.

`BattlefieldRenderer.bounds()` derives a unit rectangle from the 600-millitile
combat radius instead of the displayed sprite. For landed US aircraft at zoom 1,
it returns horizontal ±24 pixels and vertical −30 to +10 pixels relative to the
ground anchor. Default selection tolerance is six screen pixels, yielding
horizontal ±30 and vertical −36 to +16. `ActorVisual.paintPart()` instead paints
the actual atlas body at its metadata anchor, with 1× or half-scaled 2× textures.

Two exact actors in the existing actual Go `US-six` parking save demonstrate the
mismatch without guessing from transparent atlas canvas:

| Actor and actual pose | Confirmed opaque body pixel relative to anchor | Outside tolerated hitbox |
| --- | --- | --- |
| US.airlift ID 7, facing 45714, parked/d02_f00 | (0, −51), alpha 255 | 15 pixels above |
| US.strike ID 11, facing 284871, parked/d13_f00 | (+42, −20), alpha 255 | 12 pixels right |

Both 1× and 2× actual PNGs have opaque pixels at those native-scale offsets.
The airlift's final packed/cropped stage-v2 atlas independently confirms the
same point: local 1× (70,23), anchor (70.0002,73.99968), RGBA (63,68,70,255).
Thus this is not an uncropped-source-canvas scaling assumption. Hashes, actual
metadata/PNG paths, alpha samples and source identity are retained in
`read-only-pixel-evidence.json`. The sparse strike parked plate is a real
final-scale authored pose; it is not evidence of a complete shipping animation
roster or art release.

## Actual reproduction

The flow under test is: load the exact native Go parking save → render its actual
parked pose → click a verified opaque body pixel on the real canvas → receive an
entity hit for that aircraft. Browser plugin is not available; the existing
Playwright workflow was used after the coordinated quiet release.

The new bounded files are:

- `client/tests/render/aircraft-hitbox-entry.ts`
- `client/tests/render/aircraft-hitbox-browser.mjs`

The runner uses the existing sparse native parking overlay, verifies the exact
save/hash through the matching owner-ranges 0.3.4 WASM, and checks 1600×900 and
1280×720, 1× and 2× art. It records normal pointer results for the opaque body,
transparent atlas padding outside the beauty/team ink union, and shadow pixels
outside that union. A separate clearly labelled synthetic foreground cliff
checks the existing terrain occlusion rejection, while keeping the actual Go
actor positions and save untouched. It captures screenshots, resource errors,
page errors, source hashes and disposal evidence. The test does not invoke
private `hit()` directly or use test-only actor IDs to force selection.

Example command, from `client/`, with a new evidence directory for every run:

```sh
FRONTLINE_HITBOX_BROWSER=webkit \
FRONTLINE_HITBOX_EVIDENCE=work/evidence/aircraft-hitbox/final-webkit \
  node tests/render/aircraft-hitbox-browser.mjs
```

## Preserved baseline and intermediate outcomes

| Evidence directory | Result |
| --- | --- |
| `baseline` | Harness stopped before target checks: test HTML lacked UTF-8 metadata. Retained; not a product diagnosis. |
| `baseline-utf8` | All eight opaque aircraft clicks fail: airlift returns ground; strike selects airfield. All padding/shadow/cliff negative controls pass. |
| `painted-union` | Airlift four cases pass; strike four still choose the airfield through its transparent rectangular padding. Preserved partial fix failure. |
| `cached-alpha` | All 28 initial pointer/lifecycle checks pass in Chromium. Explicit injected503 and its warning retained. |
| `final-chromium` | Expanded checks pass except a newly added fallback point that also lies in the unchanged airfield geometric tolerance. Retained; test point is ambiguous. |
| `final-chromium-marker` | All 33 expanded checks pass after moving only the fallback click to the visible top of its development diamond, outside the overlapping building rectangle. |
| `final-firefox` | The identical 33-check course passes. |
| `final-webkit` | The identical 33-check course passes. |

Chromium, Firefox and WebKit each pass all 33 checks on the same production
source, locked in `source-lock.json`. The shared fixture constructor in
`shadow-composition.ts` now initializes the new page-generation counter; no
shadow composition rule changed. Both TypeScript checks and the explicit new
render-fixture check pass, as do all 347 runtime tests (including three focused
alpha-mask tests). These logs are retained alongside the browser receipts.

## Final implementation and limits

`ActorVisual` records current displayed beauty/team ink extents and the matching
frame transforms during painting. Shadows, status overlays, lost squad parts and
empty atlas padding do not enlarge that body rectangle. Before actual authored
ink is available, the existing development/loading geometry remains available.

`BattlefieldRenderer` uses those extents for its existing rectangle prefilter,
then asks whether the already decoded beauty/team pixel mask contains body
opacity within the existing screen-space click tolerance. Camera zoom and native
1×/half-scaled 2× frame coordinates are applied explicitly. Actor front-depth
priority and terrain occlusion remain unchanged. This resolves the real strike
versus transparent-airfield overlap without preferring every unit over buildings:
the reciprocal opaque airfield-front test still selects the building when its
pixel lies inside the aircraft's rectangular envelope but outside its body ink.

`ArtLibrary` creates one shared **one-bit-per-pixel** mask on body atlas-page
admission, directly from the decoded asset image. It does not read the rendered
world or perform pointer-time canvas/GPU readback. Shadow pages allocate no
picking masks. Frame queries clip to their packed frame rectangle so neighboring
atlas images cannot leak into a hit. Nonzero alpha includes antialiased fringe,
matching the authored ink metadata's alpha-minimum-one policy.

CPU picking storage is reported separately as `pickingBytes`. It is bounded by
one bit per resident body atlas pixel (about 1/32 of that page's RGBA texture
bytes, plus at most one byte of rounding per page). The actual six-aircraft
scene uses 117,853 bytes with 5,920,576 resident texture bytes. Masks are cleared
with eviction, disposal and failed admission; a page-generation check invalidates
old frame callbacks even after the same atlas reloads. No original decoded RGBA
array is retained by a mask.

The expanded browser course proves:

- Actual airlift/strike painted pixels, two viewports, native 1× and 2× atlases.
- Transparent near-body tolerance at zoom1, plus zoom0.6/1.8 body/tolerance checks.
- Opaque airfield-front priority, empty padding, shadow-only pixels and foreground
  cliff occlusion (the cliff is explicitly synthetic presentation geometry).
- Shared-page eviction from19,712 picking bytes tozero and reload to19,712,
  with retired frame callbacks remaining invalid.
- Real WebGL context loss suppresses pointer gestures; restoration retains valid
  body picking with unchanged CPU mask bytes.
- One exact test-injected503 on the airlift beauty page retains no texture or mask;
  a fresh scene reloads successfully. This is explicit recovery, not a claim that
  a failed page retries itself automatically.
- Development-art geometric fallback and final zero texture/mask bytes/canvases.

There are no unexpected page or HTTP errors. The injected503 and resulting
loader warning are expected and recorded. Firefox also reports its WebGL context
loss, lazy initialization and upload deprecation warnings during the explicitly
exercised loss/disposal paths; these are preserved, not described as absent.

This is selection correctness and lifecycle evidence. It is not a new maximum-
load FPS result, final full-roster art acceptance, mission/balance proof or release
promotion. Go, protocol, actual saves, asset pixels and art sizing are unchanged.

## Existing renderer regression course

`general-renderer/browser-results.json` records the unchanged general course
against shared simulation0.3.3 WASM (kept distinct from the exact0.3.4 parking
save course): all14 check groups pass, with no page/console errors. Actual HQ
selection, box selection, destruction/rubble, rewind, deployment, building
production/power/selling, practice aircraft return/service and graphics recovery
all pass. Five scenes leave zero canvas, texture and picking-mask bytes. The
existing isolated turret shadow comparison changes1,741 ground pixels and zero
opaque facade pixels. ReadPixels performance warnings come from that test's
explicit screenshot/pixel comparison; this is not a frame-rate benchmark.

Screenshots were visually inspected for the real body/airfield layout at desktop
and compact sizes. All full screenshots and failed attempts remain in this
workspace. The checkpoint retains compact JSON receipts, source/artifact hashes
and representative before/after images, rather than every duplicate screenshot.
