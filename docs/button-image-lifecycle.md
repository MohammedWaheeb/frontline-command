# Firefox button image investigation

Status: bounded comparison complete; the intermittent error was not reproduced.
No production loading change has been made, and no console error is suppressed.

The owner-range product course intermittently reports Firefox's
`Image corrupt or truncated.` for `button_pressed@2x.png`. The original failed
reports remain under `work/owner-ranges-candidate/browser/firefox/` and
`firefox-final/`. Captured responses are HTTP 200, 2,734 bytes and SHA256
`c2d7bfcb6f78e043d1a7c37dbfa38081d8ab9c27585d0db77b49b7f05bd175b0`.
The actual PNG's IHDR, IDAT and IEND CRCs all match. The native file is 64×64 RGBA;
its bytes are unchanged by this investigation.

The global authored button CSS selects normal, hover, pressed, active and disabled
border images. A resource/decoder lifetime problem during state changes remains
a hypothesis, not a proven browser-internal cause.

## Bounded tests

`client/tests/render/button-image-browser.mjs` serves the exact five PNG files
with the same no-cache header as development. The pressed image's otherwise
complete response can be delayed in two chunks, emulating slow delivery. Thirty
rapid pointer clicks passed both with a stable button and with the clicked node
replaced on every interaction. Each tiny course requested the pressed image only
once and recorded no browser errors. These clean results do not invalidate the
actual product's intermittent failure.

`client/tests/render/button-image-product.mjs` is an isolated copy of the current
owner-range product course. It preserves its actual Go mechanics fixtures and UI
assertions and records the original harness hash. The only optional change is a
test-init preload: five `Image` objects must finish `decode()` before the first
interaction and remain referenced until the page closes. Baseline and retained
runs use separate Firefox contexts. Art, CSS, gameplay, production application
code and the root-owned original runner remain unchanged.

Evidence is under `work/evidence/button-image/` and
`work/evidence/button-image-course/`. The five encoded files total 14,315 bytes;
five 64×64 RGBA images require 81,920 decoded bytes, excluding browser overhead.
A production mitigation will only follow review of the actual-course results.

## Actual Firefox 153 comparison

All four independent contexts completed all 15 actual Go fixture/UI cases,
save/restore, replay, foreign-field privacy and canvas disposal with zero console
or page errors. The extended pair additionally opened and closed each case's
status dialog ten times (150 extra cycles per run).

| Evidence directory timestamp | Retained decoded images | Extra cycles | Pressed-image responses | Result |
|---|---|---:|---:|---|
| `2026-09-28T12-23-37.537Z` | No | 0 | 13 | Pass |
| `2026-09-28T12-28-26.346Z` | Yes | 0 | 1 | Pass |
| `2026-09-28T12-32-49.327Z` | No | 150 | 7 | Pass |
| `2026-09-28T12-36-01.550Z` | Yes | 150 | 1 | Pass |

Every pressed-image response had the expected 2,734 bytes and identical SHA256.
Retaining decoded images reduced repeated resource responses in this comparison,
but both cold runs also passed. This does **not** establish that retention fixes
the earlier failure or that Firefox's decoder caused it. No speculative preload
has been added to the product. The original failed evidence remains valid and
the clean final packaged-product browser gate is still required.
