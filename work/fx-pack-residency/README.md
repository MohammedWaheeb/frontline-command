# Authored FX residency driver

Status, 2026-09-29: **prepared, not executed**. Coordinate a serial browser slot before launching. No production source, art, Go runtime or existing test was edited. Browser plugin not available; use the existing Playwright fallback.

Authoring checks: the runner passes `node --check`; the fixture passes a focused strict TypeScript no-emit check (`--ignoreConfig --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --skipLibCheck --strict --types node`). No browser assertion has run.

New source: `client/tests/render/fx-pack-residency.browser.mjs` and `fx-pack-residency-fixture.ts`. The runner accepts a frozen full product whose adjacent `source/client` and `build.json` describe its exact loader source. It bundles only this new fixture against those frozen production imports. It does not use mutable production imports from the checkout.

After root releases the lane:

```sh
node client/tests/render/fx-pack-residency.browser.mjs \
  --product "$PWD/work/art/effects-opus-v2/integration-v16/product" \
  --out "$PWD/work/fx-pack-residency/chromium-01" \
  --engine chromium --headless false
```

Use new output directories for Firefox/WebKit or retries. Default Chromium is headed `channel: chromium`; the other engines default to headless. No performance inference is made from these settings.

The current frozen inventory is **71 effects, 132 pages, 30,622,144 decoded RGBA bytes**, under the documented 32 MiB default FX reservation budget. All five mappings (`standard`, `low`, `reducedMotion`, `reducedFlashing`, `reduced`) are required. The driver deliberately fails if that exact inventory changes; record a new source boundary rather than silently changing the gate.

Planned checks:

- Verify the complete advertised index/metadata/PNG byte/hash graph. Serve only those captured files and fail if any changes. Record the consumed frozen source hashes, build receipt, test source, bundled fixture and actual network/resource errors.
- Load every mapped frame through the real `EffectLibrary` and its Pixi/ImageBitmap backend, checking origin and native scale. All 132 pages must be reached through the five variants and remain resident under the default budget. Extract a real Pixi crop from every page; no generated or synthetic pixel fixture is used.
- For each of 355 effect/variant pairs, require at least one actually decoded nontransparent frame. Preserve clip name/frame count/FPS/loop and sample index. Render all pairs in 18 paginated contact sheets at native 1× size, with origin marks. These are mechanical rendering/inventory checks, **not** approval of appearance, pacing, intensity or accessibility suitability.
- Release all default residency. Use a second library budget equal to the largest real page (derived from metadata), proving bounded pending/resident accounting, denied-page fallback without repeated fetch, no eviction before the documented idle threshold, idle eviction, and successful fresh fetch/render of a previously denied page. Only the library's supported cosmetic `now` callback advances `0 → 9999 → 10001ms`; no simulation, image bytes or production loader behavior is replaced.
- Release during a real reserved page request, retain exact cancellation evidence, verify no stale sheet resurrection, then reload the genuine page. No delayed/fake network response is installed. A canceled network request is permitted only for that exact page in the explicit pending-release stage; all other failed requests and HTTP/page/console errors fail.
- Final release/disposal must report zero reserved/resident bytes/pages, destroyed old cropped textures, and zero canvases. Preserve failure state/screenshots and close the page/server even on failure.

`allocatedBytes` is the library's declared pending-plus-resident RGBA reservation accounting. It does not measure all browser/GPU/heap memory. This course does not start Go, create gameplay events, certify product lifecycle, review all132 manifest effects, validate audio, or replace the real combat/ambient and product clarity courses. Keep all first failures and their exact source receipts.
