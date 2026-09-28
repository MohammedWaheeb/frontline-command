# Production tile status layout

The actual headed recovery capture at `work/multiplayer-combat/advice-recovery-2026-09-28T14-15-29.401Z/recovered-1280.png` exposed a separate visual defect: “Wait: Queued.” covered the two-line Engineering rig caption. A status recovered from an earlier advice snapshot can remain briefly after the actual queue completes; this change does not alter that refresh behavior.

Only the production cameo selectors in `client/src/styles/game.css` change. A shared scaled caption height now reserves two name lines and positions the status and progress strip above them. Tiles are 100 scaled pixels high instead of 88 so the price, two-line status and caption do not collide. The reason is limited to two complete lines; the existing full button title remains available. Longer names keep the existing two-line ellipsis. This is a Codex quota-fallback correction; the Claude05 appended warm-console polish remains byte-for-byte unchanged and is not included in this checkpoint.

## Focused browser evidence

`client/tests/render/production-cameo-layout.browser.mjs` serves the real current stylesheet, fonts, chrome and an existing rig illustration with eight synthetic tile states. These are CSS fixture states, not gameplay or newly completed unit art. The Browser plugin is unavailable, so the existing Playwright Chromium151 installation is used. The HTTP server and browser close on completion.

At 1280×720 and 1600×900, each at100% and150% UI scale, the preserved original stylesheet reproduces caption/status and progress overlap. The changed stylesheet passes all four cases: no reason/name, progress/name or price/reason overlap, complete reason retained in the title, and keyboard focus/scroll reaches the last tile. There are no console/page errors. Page title and eight visible DOM controls are checked. The native screenshots at both sizes were inspected; there is no framework error overlay. No mobile, Firefox or WebKit claim is made for this small layout check.

Receipt and original stylesheet: `work/evidence/production-cameo-layout/browser.json` and `before.css`. Native screenshots use `before-*` / `after-*`, including scrolled150% captures. Exact bounded change: `change.patch`. Run:

```sh
node client/tests/render/production-cameo-layout.browser.mjs
```

## Claude05 follow-up

Preserve the shared `--fc-cameo-caption-h` relationship when revising tile proportions: names, progress and transient/locked reasons must occupy separate vertical bands at both supported desktop sizes and150% scale. Reasons may obscure part of the illustration while disabled but must not obscure names or prices. Long descriptions remain available in the existing title. The original recovery screenshot and the preserved before.css demonstrate the concrete regression; this is not a general visual sign-off or a completed production-sidebar redesign.

The added scroll check initially failed because `scrollIntoViewIfNeeded()` followed by focus left six button-border pixels beyond the inner scroller at1280/150%. `first-scroll-check.json` preserves that harness failure. The final check uses an actual mouse-wheel gesture over the existing grid after keyboard focus and verifies the complete last tile is reachable; it does not change scrolling CSS or silently ignore the assertion.
