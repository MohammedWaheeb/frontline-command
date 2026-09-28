# FX loader and pack acceptance

Runtime infrastructure only; no production FX/art index or assets were authored. All132 effect-manifest entries remain incomplete. This course uses synthetic2×2 RGBA PNG pages to exercise exact bytes, actual browser image decoding, Pixi Texture cropping and teardown.

## Results

- All **301 current runtime tests passed**, including13 new FX parser/lifetime/dev-server/build-pack tests. Both project typechecks and strict standalone render-fixture compilation passed.
- Actual `artPlugin.closeBundle()` copied the referenced synthetic index, metadata and page; every file matched the generated base-pack byte count/SHA-256. Unreferenced files were excluded. Corrupted copied data caused `writeBasePack()` to reject the pack.
- Missing/partial/corrupt/unknown-ID packs, page/path escapes, symlinked page/root, invalid PNG compressed data, missing accessibility variants and frame overflow were rejected. Existing art indexes with no effects retain their old behavior.
- Metadata fetch/image completion after release cannot resurrect a sheet. First-frame lazy load and variant frame sharing passed. Hard residency budget includes pending decode; idle eviction and explicit retry recover without repeated network failures.

| Browser | UTC start | Status | Native subtle | Resident pages before/after release | Errors |
|---|---|---|---|---:|---:|
| chromium 151.0.7922.34 | 2026-09-28T10:33:24.402Z | passed | False | 2 / 0 | 0 |
| firefox 153.0 | 2026-09-28T10:34:05.708Z | passed | False | 2 / 0 | 0 |
| webkit 26.5 | 2026-09-28T10:32:52.189Z | passed | False | 2 / 0 | 0 |

Each page had `isSecureContext=false` on `http://fx.frontline.test`, with `crypto.subtle` absent, so the existing pure-JS SHA-256 fallback verified the exact files. The test routed the non-loopback HTTP origin to its isolated real local HTTP server; no system DNS/browser settings were changed. First frame returned undefined, then both decoded pages rendered; shared variants returned the same cropped Texture, `pixelScale=0.5`, anchor `(0.5,1)`. Before release residency/reservation was32bytes (two synthetic2×2 RGBA pages); after release both were0, stale frames were unavailable; after disposal canvases were0.

The actual 640×360 captures were inspected:

- [Chromium verified pages](verified-pages-chromium.png)
- [Firefox verified pages](verified-pages-firefox.png)
- [WebKit verified pages](verified-pages-webkit.png)

These deliberately labelled colored squares prove decoder/upload/registration, not finished effect art, gameplay visuals or performance. WebKit initially produced a stale main-canvas screenshot despite loaded textures and two RAF waits. The fixture now explicitly renders the static stage, checks exact RGBA texture pixels and both stage sample pixels before screenshot; all three engines agree. No production backend change was required. Live combat-renderer scheduling remains a separate integration acceptance. The Browser plugin was unavailable in this session; existing installed Playwright was used.

A first expanded multi-browser harness used a one-segment route glob and missed `/art/...`, producing DNS failures. Those reports are preserved under `initial-route-harness-failure/`. The harness was corrected to a recursive path glob; no production fix was required. The original Chromium host-resolver course also passed and remains in `browser.json`/`verified-pages.png`.

## Source locks

All three final browser bundles have SHA-256 `ddd20225e629040c2eee014eb3bfbf43f7276bad7a961321713bae7ae3bb7507`.

| Path | SHA-256 |
|---|---|
| `client/src/content/effect-assets.mjs` | `25f72c5a7a6c920403280498d28a8300c22c860ec8423a5f40d2f8ee34dfdb17` |
| `client/src/content/effect-assets.d.mts` | `64998de5b950634aaae3960d11a0ce747bc5e3885b8cc8927d0f511dc2631df4` |
| `client/src/runtime/effect-library.ts` | `54ffd74caa7c852ddb90dcc8dbca1f46089a8d3dca93fdc9da461209317736fd` |
| `client/src/render/effect-assets.ts` | `e3003b072a113449f922ef2f9dc5d895f1f1e72829c30d5d1acab6fa386ea005` |
| `client/src/render/art.ts` | `54514e26e5f4bdccc7d8fc3255a35af841e9152a0e882f924d65fae5288f9874` |
| `client/scripts/ui/art-plugin.mjs` | `05ad9e2f0793505c43138c718e012a318bcaf0e5912d8c47d35d9054be272d5a` |
| `client/scripts/ui/effect-pack.mjs` | `e5e7cc2f6105715f0992266b91d7b306233ceca039b84cddb6241193239ba974` |
| `client/tests/render/effect-assets-browser.mjs` | `7f25ec2d50c27b5ddb226166c9766ab6e7268216f5ef19ba638a76abd993bce2` |
| `client/tests/render/effect-assets-fixture.ts` | `3c182df4d5f858ad3555ffb33c661ee0ab161c3c8de65a5427d1d2ef53729669` |

Raw reports, screenshots and test logs are local evidence; this compact record is the checkpoint artifact. No Go, protocol, shipping WASM, simulation state, UI command flow, actual effect art or deployment changed.
