# Combat renderer integration with synthetic effect atlases

This browser course exercises the real `CombatEffects` renderer, verified FX pack middleware, atlas decoder and Pixi textures. It generates three **temporary test-only** PNG/metadata entries for the existing IDs `fx.impact.hit_infantry`, `fx.impact.cover_mitigated` and `fx.impact.hit_light`. Colored squares make crop/frame/variant errors measurable; they are not game artwork and are never copied into shipping assets or manifests.

The flow is: initialize a verified temporary pack → supply authorized synthetic combat snapshots → render a pending effect at a frozen tick → finish loading → change its frame/accessibility variant → cull/reappear → stress the decoration/page limits → dispose. Root's separate combined-Go browser course supplies real gameplay disclosure and event evidence; this course isolates renderer/asset integration.

## Checks

| Behavior | Evidence |
| --- | --- |
| Lazy metadata and page request | Zero decorations while metadata/page is pending; one sprite appears at unchanged tick100 once ready. |
| Exact atlas crop and frame | RGBA `[210,40,30,255]` at the first frame, `[30,200,50,255]` at tick101. |
| Accessibility variant selection | Low, reduced motion, reduced flashing and both flags each produce their distinct exact expected crop color. Essential hit marks remain. These synthetic colors test routing, not actual flash safety or animation aesthetics. |
| Viewport lifecycle | Moving the view away removes decorations and drawn marks; returning at the same tick restores the selected variant. |
| Decoration cap | 688 visible supplied hit outcomes retain 688 confirmed-hit marks while decorative sprites stop at192. The dense synthetic geometry is a count/retention test, not a legal-unit placement or readability claim. |
| Hard page limit | Three 2048×2048 RGBA pages request48MiB; only two pages/32MiB may allocate. The third outcome keeps its essential mark while its optional decoration waits. |
| Paused pressure trimming | A fixture-controlled monotonic clock advances11.001seconds without changing tick400. Active sprite pages remain resident. Once those sprites are culled and another page needs the budget, old idle pages fall to zero and the waiting page loads at the same tick. |
| Pending disposal | Dispose while a16MiB page reservation is outstanding: allocated/resident counts become zero, root is destroyed, no late resurrection/error. |
| Final disposal | All pages, reservations and canvases become zero. |

The fixture stops the automatic Pixi ticker and renders explicitly before GPU pixel readback, matching the earlier cross-browser PNG loader acceptance. Its controlled clock is only for residency aging; it does not fake game ticks or present a performance measurement.

## Reproduction and scope

Run `node client/tests/render/combat-effects-assets-browser.mjs` from the repository. Use `FRONTLINE_EFFECT_BROWSER=firefox` or `webkit` for the other installed engines. The runner starts an isolated loopback HTTP server, passes a temporary asset root to the real art plugin, builds the fixture and deletes the temporary pack after each run. Browser plugin not available; installed Playwright is the recorded fallback. No dependencies, product UI, Go, shared runtime, renderer or asset files are edited.

Current evidence: Chromium151.0.7922.34, Firefox153.0 and WebKit26.5 pass at800×590 with the same bundle, zero browser errors and zero recorded loader errors. Native screenshots were inspected for the first frame, reduced variant, capped dense marks and paused pressure recovery. A320px mobile course is not applicable to this isolated renderer fixture or the desktop RTS support target. No hardware FPS, long-session memory, authored FX quality or132-effect completion claim follows from these tests. Exact source/bundle hashes and local evidence paths are in `work/evidence/combat-effects-assets/acceptance.md`.
