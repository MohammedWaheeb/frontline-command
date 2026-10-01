# Full aircraft atlas residency course

The authored test **passes in Chromium 151, Firefox 153 and WebKit 26.5**, at
both standard and high quality, with zero unexpected page, console, HTTP or
request failures after final browser close. Exact hashes and checks are in
`work/evidence/aircraft-atlas/three-engine-receipts.json`; the limited native
image review is in `work/evidence/aircraft-atlas/root-native-review.md`. It uses the
immutable full-aircraft overlay at
`work/art/aircraft-runtime-overlay-v1/outputs/lifecycle-pair-v19/product` and its
explicit original v19 source receipt. It does not search for mutable sibling
source or use the current checkout's production imports. Root performed the
serial browser runs in `chromium-01`, `firefox-01` and `webkit-01`.

The exact fighter has 896 authored poses; the airlift has 656. Both have three
layers except their crash states, which deliberately have no team layer. The
airlift publishes three aliases of its boarding animation. Per quality, there
are **80 real PNG pages, 4,496 physical layer/frame entries and 29 states including
aliases**. The driver verifies overlay receipt, copied original base receipt,
selected base lock, frozen source files, complete published asset hashes, PNG
dimensions and every atlas rectangle before starting a browser.

| Quality | All-page RGBA accounting | Actual loader trim threshold | Largest page |
| --- | ---: | ---: | ---: |
| Standard, 1× | 268,108,000 bytes | 192 MiB | 3,916,000 bytes |
| High, 2× | 1,072,432,000 bytes | 384 MiB | 15,664,000 bytes |

These are the loader's decoded texture accounting quantities. They are not
compressed download bytes, total GPU allocation or process memory. The existing
loader has an idle-pressure trim threshold, not a hard admission cap. The test
does not change that behavior or load all high-quality pages simultaneously.

## Bounded checks

- Metadata and concurrent same-sheet requests must allocate no PNG pages. Every
  declared state/direction/frame and alias must be reachable through the real
  `SpriteSheet` API.
- Walk one real page at a time; verify every crop position, size, anchor and
  shared texture identity. Upload/extract a real frame, evict, await actual
  unload, and verify retired crop and picking data are unusable. This coverage
  phase uses explicit existing eviction; it is not a natural gameplay workload.
- Capture one native-scale contact per state/alias at standard and high quality.
  These are authored phase contacts, not simulated transitions or proof that a
  game state is eligible to select a private ammunition pose.
- Construct two actual `ActorVisual` fighter consumers from the unchanged
  owner-authorized US04 view at tick 996. They must share one sheet; disposing
  one must preserve the other's live textures. The catalog and view are pinned
  to the existing c7e0 native evidence. Entity data is not edited, duplicated or
  reassigned. Viewer 1 is the actual disclosed owner. This does not certify an
  airlift actor lifecycle or foreign ammunition privacy.
- Load only enough real pages to cross the production threshold by at most one
  page. Touch all admitted pages; fresh `trim()` must preserve them. Stop the
  renderer, wait at least the real ten-second idle interval, and verify pressure
  trim/reload without overriding any clock.
- Invalid state/direction/frame/layer and unknown asset lookups must return no
  art and cause no PNG request. A separately labeled exact real-page HTTP503
  exercises failed-load cleanup; a fresh library must load the unchanged page
  again. Only this explicitly induced response is expected.
- Hold an actual atlas response at the test server, begin library release while
  its real request is pending, deliver the original byte-exact PNG, then verify
  no stale sheet frames, textures or picking data survive. No PNG is synthesized
  or replaced. Final disposal must leave zero resident pages/picking bytes and
  zero canvases; late browser diagnostics remain in the final strict check.

This is renderer/loader infrastructure evidence. It does not run a host or Go
simulation, establish real aircraft takeoff/service/crash eligibility, certify
all live lifecycle transitions, measure FPS or judge final art quality. The
separate actual-Go service course owns those service-state checks.

## Reproduction and current verification

```sh
node client/tests/render/aircraft-atlas-browser.mjs \
  --product work/art/aircraft-runtime-overlay-v1/outputs/lifecycle-pair-v19/product \
  --out work/evidence/aircraft-atlas/chromium-v19-01 \
  --engine chromium
```

Use a new evidence directory each time. `--build-only true` performs frozen
identity/atlas preflight and compilation without a browser or server. The final
authoring build is `work/evidence/aircraft-atlas/build-v19-03`; the isolated
frozen-source fixture TypeScript check is in `build-v19-02/typecheck.log`.
The first build-only attempt rejected valid authored `@1x`/`@2x` filenames with
an overstrict test regexp. That failed receipt is preserved; the test allowlist
was corrected without altering assets or weakening path traversal checks.

Production source and overlay bytes remain unchanged. The full-aircraft overlay
is private candidate art; this test does not promote it to shipping output.
