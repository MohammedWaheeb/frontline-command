# Tactical overlay evidence

Captured: 2026-09-28T09:26:31.763Z

Status: **passed**. Simulation `0.3.3`; protocol `1`; Go `go1.27.1`; seed 4201; practice-v1.

Browser: headed Chromium `151.0.7922.34`. URL: `http://127.0.0.1:63418/` (isolated test server now closed). Title: `Tactical warning acceptance`. Viewports: 1600×900, 1280×720.

Fixture bundle SHA-256: `156184e48c7ea44ef8eaaf23d57099760b94c0a08f018e832818df6916ae3c4b`.
Runtime WASM SHA-256: `4e67eebdd53c6ce588c14f0f01b54c236e193feacfbd2936bed0af4002a45efa`.
Content hash: `318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.

Live replay endpoint hash: `5ae5ecb6cc25e8d612ee99ab9076b8ed1005e6740b137f0dc4f6e9aaeceba2e4`.
Resumed recording: ticks 4334–4346; hash `45da98532b6f3e71850f221c04182d9a1fbb23baa74d3dedc54b22ae3c8649ec`.

Paused renderer rebuild count: 229 → 229. Tactical page/console errors: 0.
Existing renderer regression: passed; 14 check groups; 0 errors; 4 ReadPixels warnings from pixel tests. Captured 2026-09-28T09:19:47.550Z.

Source files (SHA-256):

- `client/src/app/tactical-presentation.ts`: `8e947630123f2c6d891615a6772e9baca8f18cb4428ed105bba77b4f7d8a9173`
- `client/src/render/battlefield.ts`: `a15a2183bcd7c99c1fdca52efcd4ff360f346224ce488c0d01d7c79fb32f226d`
- `client/src/render/tactical-overlay.ts`: `7f13b5cbc33458d58744b07016d566de22d4cf9d0a0244f96cf2f152533df6fc`
- `client/src/render/tactical-geometry.ts`: `b1f174e8c72cac9924de4a4d205c4461757237b03c1881b94c9d831901012419`
- `client/tests/render/tactical-fixture.ts`: `805e29070b0bd15c726bf0886578ef03a76bb412f5259146b23dccb6d8901300`
- `client/tests/render/tactical-browser.mjs`: `5758a576c2e6f6a74ff208bac5a74cf306b7e55ca963a1b2cb0de5837bc1aa72`

Native captures inspected: banked-volley-raised-ground, six-salvo-markers-distinct-deadlines, raid-exact-exit-markers, shieldline-active-reduced-effects, orders-rally-and-ping-1280 and endgame-pulse-minimap-only PNGs in this directory. Exact raw save/replay/JSON artifacts are local evidence, not committed binaries.

See [acceptance scope and limitations](../../../docs/tactical-overlay-acceptance.md).
