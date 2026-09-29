# V5 memory-label and command readability review

Prepared 29 September 2026. This is a bounded visual follow-up to the accepted
UI v5 sources, not a new full-product or final-art qualification.

The flow under test is: import the original Go practice save through Load
operation, select its real artillery, center on the remembered enemy HQ, and
inspect the last-seen plate and command labels at normal and 150% UI scale.
The existing actual-App clarity course also checks ordinary range controls,
placement feedback, save/replay and the separately earned defeat timer.

Use the unchanged `client/tests/render/battlefield-clarity-product.browser.mjs`
with the frozen `work/presentation-fallback-v5/build-01/product` and original
`work/art/effects-opus-v2/ambient-native-07` saves. The product predates the later
menu resource, launcher and mixer integrations; no current full-client claim
follows. Its Go runtime and both saves are simulation 0.3.4, protocol 1, content
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
The practice and standard save digests are respectively
`0e33c4c059a5d428e755e204410d5b837649a547fe6394d8f2ec7464c6f7799f` and
`6f21a90b65f174e3fe90735fa323714c769d03f486737a4a16c56eff05daffa9`.
Neither save may be edited or relabeled as an earned campaign.

After the quiet server course closes, run serial cases `1600x900-scale100` and
`1280x720-scale150` with the driver's existing `--case` argument, using distinct
output directories. Browser plugin not available: use the existing Playwright
driver with genuine task-local Chrome through `--stock chrome`, headed.
Preserve all raw request failures and report their strict status independently
of the older driver's functional result. Inspect native screenshots directly;
successful DOM assertions cannot establish canvas label legibility.

No product source or asset change is included. The exact model's queued Claude
review can receive these additional captures through a separate input manifest;
do not mutate its existing frozen assignment or earlier evidence.

## Completed bounded review

Both genuine Chrome 154.0.8037.58 cases completed through ordinary import,
controls, save/replay, real countdown and final menu reload. Browser and static
HTTP processes are closed. Each case has 20 captured checkpoints. The older
driver's functional result is `passed`; the independent strict diagnostic result
is **failed**, with 591 raw request aborts at normal scale and 581 at 150%.
Page/console/HTTP errors and served-source drift are zero. No request-specific
original reader/EOF attribution was collected, and these failures are not waived.

`audit.py` verified all 135 frozen client source files, the exact build/pack,
original and imported Go saves, unchanged driver copies, and all 1,367/1,364
served file descriptors against the immutable pack and actual current bytes.
`audit.json` also records hashes for every retained local screenshot and export.
This is post-run attribution, not a new preflight or a clean network result.

Root directly inspected these unchanged native captures:

- Normal `1600x900-scale100-last-seen-and-off.png`: the amber LAST SEEN 0:06
  plate is legible against the dark remembered building. Skybreaker Wing wraps
  at the word boundary, without clipped glyphs or collision with its icon.
- Enlarged `1280x720-scale150-last-seen-and-off.png`: the memory label grows
  appropriately and remains legible. The fixed selection heading truncates
  Precision howitzer at this narrow width; its complete accessible text remains.
  This cosmetic limitation is retained for Claude's review.
- Enlarged `1280x720-scale150-command-overflow-bottom.png`: normal scrolling
  reaches the last commands; Skybreaker Wing fits on one line and the overflow
  indicator shows the remaining actions above. The rig name and details fit.

These captures contain the original incomplete v25+36 art. They cover one US
memory/strategic label, not every faction, timestamp length, overlapping-memory
layout, zoom, rewind or raised-terrain case. Small fog-edge shapes remain a
separate unfinished visual concern. The scene remains explicitly a practice
fixture, and the independent timer scene remains its original standard match.
No code, UI, gameplay state, art or original evidence was changed.
