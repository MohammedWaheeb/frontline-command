# Synthetic CombatEffects integration receipt

Date: 2026-09-28,11:03 UTC. Browser plugin absent; existing Playwright used. Isolated loopback HTTP document titled `Combat FX synthetic atlas acceptance`,800×590. Header visibly states synthetic pixels, not game artwork. Temporary manifest and three PNG packs were verified and served through the actual art plugin, then removed. No shared Go/runtime or production renderer/assets changed.

| Engine | Version | Result | Browser / loader errors |
| --- | --- | --- | --- |
| Chromium |151.0.7922.34|PASS|0 /0|
| Firefox |153.0|PASS|0 /0|
| WebKit |26.5|PASS|0 /0|

All three loaded bundle SHA-256 `6cbc1b37907baa12cb0f67c1efb0dd748bae29121b2cf351ac23f0e0406684ea`.

| Reviewed source | SHA-256 |
| --- | --- |
| `client/src/render/combat-effects.ts` (root-owned) | `aa013477539dff23ac39e03480b2264e37d1d01d0182dc2149f0f0f3a19ad7e4` |
| `client/src/render/combat-geometry.ts` (root-owned) | `00ea46d09438996e6fc489c5032c1d80bf7e69ed438cb99b99777c528f5f099c` |
| `client/src/app/combat-presentation.ts` (root-owned) | `df086fdd99b13a45dc54c2a97a627f7a5c3e1f90f2b9c729c382095201357724` |
| `client/tests/render/combat-effects-assets-fixture.ts` | `5f9fc8a4a2033c34540355d92de1ccc6fd66b58ba4d8b6d2ca7694e5c0852bf6` |
| `client/tests/render/combat-effects-assets-browser.mjs` | `5e4a1b2c32e5a05c93a6414bbf6a7cd2d5c66146b752efb28efb1dbf1f13c4af` |

The strict standalone fixture typecheck passes using TypeScript's `--ignoreConfig --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --types node`. The initial command omitted TypeScript7's required `--ignoreConfig` when explicit files are listed; this was corrected without source changes.

Both project type checks and the complete327-test runtime suite also pass at handback. Local logs are `work/evidence/combat-effects-assets-{runtime-typecheck,app-typecheck,runtime-tests,typecheck}.log`.

Every engine passed exact crop/frame/accessibility color checks, same-tick pending→ready, viewport cull/reappearance,688 retained essential hits with192 decorations,32MiB pending/resident budget, paused active-page retention, culled pressure eviction/recovery and pending/final disposal to zero. Renderer timing is explicitly controlled for deterministic pixel capture; no FPS claim.

Native captures inspected:

- `standard-first-frame-chromium.png`: red test crop beneath the essential hit chevrons.
- `decoration-cap-essential-marks-chromium.png`:192 red decorative squares and the remaining essential markers across all688 supplied outcomes.
- `reduced-webkit.png`: cyan combined-accessibility crop with essential chevrons intact.
- `paused-pressure-recovery-firefox.png`: previously blocked page appears after eviction at unchanged tick400.

The local `browser-{chromium,firefox,webkit}.json` receipts include intermediate residency and exact RGBA values. The initial attempt expected688 drawn cues but deliberately generated44 beyond the viewport; the renderer correctly culled them. `initial-viewport-fixture-error.json` preserves this setup mistake. A smaller test grid places all688 cues inside the intended viewport; production code was unchanged.

This validates optional atlas integration with synthetic shapes only. It does not add or certify any of the132 authored effect assets, gameplay legality of the synthetic grid, actual combat disclosure, aesthetic quality, flash safety of future authored clips or hardware performance.
