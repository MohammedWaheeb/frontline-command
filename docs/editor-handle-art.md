# Editor start and region handle art

The top-down map editor now shows the completed `prop.spawn_marker_editor` and
`prop.region_marker_editor` first-frame art as small editor-only handles. Their
32-CSS-pixel width stays constant when the grid or viewport resizes. A dark
backing preserves contrast, while start slot/team labels, region names, exact
region rectangles and the existing coordinate anchors remain visible. Active
start/region controls outline the relevant handle. Labels remain inside the
canvas for ordinary short names.

These are annotations, not physical footprints. The same direction-zero icon is
used for every start; it does not invent a spawn-facing rule. The code does not
stretch an isometric region sprite over the top-down rectangle, alter pointer
conversion, change a Go map, or add a field to draft/export schemas. Existing
form controls and textual placed-object records retain their accessible labels;
the painted icons themselves are not new interactive buttons or a new keyboard
spatial-editing interface.

`client/src/render/editor-handles.ts` owns just these two sheets through a separate
`ArtLibrary`. It requests both independently, waits for actual first frames,
refuses stale results after close, and releases its sheets on editor exit. The
live renderer never requests these editor-only IDs. Missing sheets retain the
original vector markers and exact bounds, with the explicit message:
“Some editor marker art is unavailable. Standard markers and exact bounds remain
active.” Editor validation and path/sight feedback now use player-facing wording
without exposing the engine implementation language.

## Actual browser acceptance

The isolated product test uses the real `Application`, editor controller, React
panel, IndexedDB draft storage and Go 0.3.3 WASM. Only the test map is synthetic:
64×96 open terrain, four starts, four supply fields and two original regions.
All edits, undo/redo, save, reload, preview, validation and practice transitions
are performed through visible controls. Read-only test probes inspect the resulting
map and owned sheet lifecycle; they do not author a draft or set victory state.

The headed Chromium 151.0.7922.34 run passed with zero page errors:

- All four start icons/slot/team labels and two region icons/rectangles load.
- Selecting start 4/team 2 and clicking tile (52,83) stores exactly
  `(52500,83500)`. Undo restores the complete original map hash; redo restores the
  edited hash.
- Two region clicks create `new_zone` with min `(20500,40500)` and max
  `(26500,47500)` using the unchanged tile-center rule.
- At 1280×720, clicking tile (51,82) stores exactly `(51500,82500)`; icon width
  remains 32 CSS pixels and all four starts remain readable.
- Saving revision 5, reloading the page and reopening the stored draft preserve
  map SHA-256 `0fe0fa389df0c7288f65e898df0329072b17462da4271ba835cba4a7c907dcc9`.
- Actual Go path preview returns `ok` with 53 points. Sight preview returns `ok`
  with 253 visible tiles. Neither changes the draft hash.
- Go validation passes; test play launches a `practice` session. Returning to the
  editor preserves the exact saved map and clears the test-active state.
- Leaving test play releases the first editor sheet owner; returning creates a
  fresh owner. Leaving the editor releases that owner too: two loads, two completed
  disposals, no remaining editor canvas.
- A second fresh browser context removes only the region sheet from the real art
  index. The region markers fall back, the warning is visible, and the original
  map hash remains unchanged.

The first harness iterations incorrectly selected slot “3” by ambiguous text and
clicked below the clipped panel without scrolling. The actual coordinate mapping
was correct; the runner now selects explicit option values and scrolls the grid
into view. No coordinate or map rule was changed to satisfy those assumptions.

WASM SHA-256:
`4e67eebdd53c6ce588c14f0f01b54c236e193feacfbd2936bed0af4002a45efa`.
Frozen test bundle SHA-256:
`9b36caa00bafd11a4cbc322fca7d7323506ad2046b6127bc842c0d66768d1b40`.

Evidence: `work/evidence/editor-handles/browser.json` and inspected native
`rectangular-four-starts.png`, `exact-anchor-and-region.png`,
`rectangular-editor-1280.png`, `authoritative-sight-preview.png`,
`returned-draft-preserved.png`, and `missing-region-art-fallback.png`.
Both application/runtime TypeScript checks, strict fixture typecheck and all
239 runtime tests passed. Four new focused tests check constant CSS dimensions,
first-frame selection, fallback/draw failure, asynchronous close and disposal.

Reproduce after preparing the Copper pilot's isolated product files:

```sh
FRONTLINE_ENV_ONLY_NOTICE=1 node client/tests/render/environment-authored-browser.mjs
node client/tests/render/editor-handles-browser.mjs
npm --prefix client run typecheck
npm --prefix client run typecheck:app
npm --prefix client run test:runtime
```

The editor runner rebuilds its own source bundle and reads the prior isolated
product's static assets/runtime/content without changing them. It never uses the
user's browser profile or changes the active development server.

This completes the bounded handle integration. It does not add environment-sidecar
authoring, draft schema extensions, map dressing tools, long-label decluttering,
or certify the editor's entire accessibility/design scope.
