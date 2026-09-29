# Actual product clarity course

Status, 2026-09-29: **first real product runs failed; correction under test**. Root owns the serial browser lane. Runs `chromium-01` through `-04` preserve driver mistakes (case-transformed button text, a modal-obscured toast, asynchronous same-name archive rows and exact snapped-coordinate assumptions). `chromium-05` completed the first three cases and found real 1280×720/150% production-tile clipping: the tile was150px high in a133px scrollport. The source correction reserves a whole tile and lets the short sidebar scroll. The first correction passed8/8 in chromium-06 onv18, but visual review found target guidance overlapping the sidebar. v19 keeps guidance within the battlefield and captions above it; chromium-07 passes8/8 including new overlap checks. Root reviewed native1× placement, rejection and defeat-warning screenshots. Firefox01 and WebKit01 subsequently passed all8 cases each; see [v19 acceptance](v19-acceptance.md) for exact scope and retained Chromium request diagnostics. Browser plugin is unavailable; the driver uses Playwright.

Driver: `client/tests/render/battlefield-clarity-product.browser.mjs`.

The inputs are an already frozen full product and the original real-Go exports `clarity-before-defeat.save.json` and `clarity.save.json` from root's ambient course. The first is explicitly a practice presentation fixture with the owned Precision howitzer at `(18000,18000)`, a living HQ/rig, and remembered enemy HQ near `(30000,18000)`. **Practice suppresses defeat**, so the second is a separate standard two-human match: real paid production, ordinary sales and an enemy attack earn its actual command-loss deadline. The timer course assumes no artillery or common map. These are not earned campaign saves. The driver preserves and imports captured input bytes and requires matching simulation/protocol/content metadata, allowing the distinct rulesets/maps. It never changes a save, invokes a fixture API, injects snapshots, or sends worker RPCs.

After lane release, from the repository root:

```sh
node client/tests/render/battlefield-clarity-product.browser.mjs \
  --product "$PWD/work/art/effects-opus-v2/integration-v19/product" \
  --saves "$PWD/work/art/effects-opus-v2/ambient-native-07" \
  --out "$PWD/work/battlefield-clarity/chromium-07" \
  --engine chromium --headless false
```

Both input files must actually exist before launch; a path above is not a receipt that export has finished. Every `--out` must be new. Firefox and WebKit can use the same arguments with their engine name and a separate output. Chromium defaults to headed `channel: chromium`; other engines default to headless. This is functional UI acceptance, never reference-hardware timing.

## Planned assertions

Eight serial fresh-storage contexts cover `1600×900`, `1280×720`, `1440×900`, and `1728×1117`, each at first-run UI scale `100%` and `150%` (the same four desktop sizes used by the menu course).

- Import the original pre-defeat save through **Load operation**. Use minimap clicks and normal drag selection to select the actual artillery. Cycle **Range: off → weapon → sight → detection → off**, recording the accessible labels, control bounds, DOM and screenshots. The memory/range imagery remains available for visual review.
- Select the actual rig with **Build**, choose **Power station**, hover the free and occupied test sites, and record the real Go `accepted: true, code: indeterminate` preview replies plus the pending/power text. Go deliberately defers geometry; amber preview is not permission or a promised green site. Cancel first and verify no command was sent. Re-enter placement and click the occupied HQ through the product: require one normal submission and the actual `occupied`/`building_overlap` rejection notice. Later exported save must retain that build request and contain no new power foundation. Positive ordinary paid construction is separate root ambient-course evidence.
- Use **Save operation**, **Archive replay**, **Return to command center**, **Export**, **Load**, **Watch**, and the replay timeline's normal End key. Require a nonempty actual replay end, seek through the real worker, preserve the exported save, and reload the menu to check local save persistence.
- Import the command-loss save. Require the actual **Seconds until defeat** timer to be within `1–30`, decrease while live, stop after the actual Go pause acknowledgement, and decrease after resuming. Return to the menu before expiry. This does **not** certify defeat completion, recovery, or a combat outcome.
- Check horizontal document overflow, key panel/dialog viewport bounds and reachable controls against clipping ancestors. Preserve screenshot/DOM/geometry at each step. Fail on any page/console error, HTTP error, product interruption modal or changed served resource. Retain all failed requests for diagnosis; intentional context/reload cancellation is not silently erased.
- Observe only `/runtime/worker.js`, separately from Pixi decoding workers. On each menu return require the battlefield canvas, targeting/timer/replay DOM, and session worker to disappear while the baseline validation worker remains. This checks observable lifecycle; it is not a GPU/heap leak certification.

## Evidence and limits

Each run writes `browser.json`, exact driver/input-save copies, SHA-256 of the WASM/index and optional adjacent `build.json`, hashes/byte counts of resources actually served, passively observed request/preview summaries, exported actual saves, and screenshots plus DOM text. A failure stops the course, preserves the current case and closes the browser/server. Earlier output is never overwritten.

There are no blanket HTTP exclusions or fabricated readiness/health responses. The static server serves only the given frozen product; it does not start a multiplayer service. Asset incompleteness and fallback art remain release gaps even if controls pass. A screenshot alone cannot prove ring count, minimum-radius geometry, memory authorization, ghost color, pixel legibility or occlusion: those need visual inspection and the separate real-Go renderer course. The test does not claim all71 FX, audio quality, mobile layout, offline-cache installation, accessibility completeness, campaign rewards, multiplayer, memory pressure or performance.

The campaign main/optional consolidated matrix runs independently; this driver changes none of its source, evidence or status.
