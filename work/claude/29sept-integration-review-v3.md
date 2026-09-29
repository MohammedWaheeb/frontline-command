# Integrated presentation review v3: frozen `presentation-fallback-v5`, 29 September 2026

Reviewer: exact `claude-opus-5-5` with no fallback. This was a read-only review and this file is its only write. I did not run Bash, a browser, Blender, the App or any subagent. I could not observe the wall clock from inside this session. Dispatch timing is recorded by root, not by me.

**Inputs read:** `AGENTS.md`, `work/presentation-fallback-integration-v1/README.md`, my earlier `work/claude/29sept-v24-review/report.md`, `work/claude/06-rts-reference-study.md`, `work/evidence/presentation-ui-stress/README.md`, `work/evidence/presentation-privacy-review/{fog-three-source-review,fallback-v1-review}.md` and `work/presentation-memory-v5/README.md`.

**Frozen v5 source reviewed** (all under `work/presentation-fallback-v5/source/client/`):
- `src/ui/App.tsx`
- `src/styles/game.css`
- `src/render/terrain.ts`
- `src/render/battlefield.ts`
- `tests/runtime/presentation-polish.test.ts`
- Also, for context: `src/ui/StrikeReview.tsx`, `src/ui/strike-review.css` and `src/ui/AudioCaptions.tsx`

**Images inspected at native size (short names used below):**

| Short name | File |
| --- | --- |
| S-720 | `presentation-ui-stress/chromium-01/layout-1280-720-1.5-target-top.png` |
| S-720R | `presentation-ui-stress/chromium-01/layout-1280-720-1.5-review-bottom.png` |
| S-1600 | `presentation-ui-stress/chromium-01/layout-1600-900-1-target-top.png` |
| F4-N | `presentation-fallback-v4/firefox-01/opening-normal-rig.png` (3200×1498, viewed at 2000×936) |
| F4-150 | `presentation-fallback-v4/firefox-01/opening-720p150-rig.png` (2560×1440, viewed at 2000×1125) |
| M-1600 | `presentation-memory-v5/chrome-normal-01/1600x900-scale100-last-seen-and-off.png` |
| M-720 | `presentation-memory-v5/chrome-150-01/1280x720-scale150-last-seen-and-off.png` |
| M-720O | `presentation-memory-v5/chrome-150-01/1280x720-scale150-command-overflow-bottom.png` |
| FF-cand | `work/claude/presentation-polish-v1/fog-floor-chromium-01/boundary-candidate.png` |
| FF-raised | `work/claude/presentation-polish-v1/fog-floor-chromium-01/raised-unknown.png` |

Coordinates are `x,y` in each image's own pixels, or in the viewed pixels where noted.

**Status:** I do not relabel any status. The v5 strict aggregate stays **failed** on 103 unclassified raw aborts. The memory courses stay **failed** strict at 591 and 581 aborts. The v4-monotonicity fog gate stays **failed**, with a drop of up to 13 alpha on raised geometry. S-720R uses synthetic display state, so it is not earned strike acceptance. This review does not approve the full game.

## Summary verdict

The console holds together at both sizes. It uses warm charcoal and gunmetal, brass rules, amber LCD numerals and olive. I saw no blue chrome; blue appears only as US team paint on the HQ and rig. Earlier findings F2 (core commands first, MORE cue), F3 (whole-word labels), F4 (cameo state strips) and F5 (last-seen plate) are all visibly fixed in the native captures.

- **Target card:** Cancel sits in the fixed bottom row outside the scroll region, and it is reachable at both sizes (S-720 385-505,410-448; S-1600 245-338,675-705).
- **Caption/resource overlap:** the column now starts below the resource shoulder at 150% (S-720 alerts start at y≈62; shoulder bottom ≈52), so the preserved v4 overlap in F4-150 is resolved in v5 Chromium.

The remaining defects are listed below, most severe first.

1. The strike-review card ignores the UI scale.
2. The command grid loses a whole column depending on the selected unit's name length.
3. The information column is too wide at 150% and gives no cue that it scrolls.
4. Fog spur diamonds.
5. Smaller items.

None of them affects rules, admission, fog privacy or the Go simulation.

## Findings

### P1 — Medium: the Skybreaker review ignores `--fc-ui-scale`, making the most consequential decision the smallest text on screen

**Evidence**
- In S-720R (150% scale), the review body text is about 11-12px: STRATEGIC OPERATIONS 33-175,97-104, table headers about 9px, and CONFIRM STRIKE / RETARGET / CANCEL labels about 10px at 35-285,425-460.
- The target card beside it uses 13-19px × 1.5, the captions use 21px, and the command keys use 18px.
- CONFIRM STRIKE is the only irreversible order in this panel, but its button is visually lighter than the MOVE key.
- The card uses a green-olive web-form look (thin 1px border, a plain table and small pill-like buttons). It does not match the machined console wells used everywhere else.

**Cause** (`src/ui/strike-review.css:1-3`)
- Every size in this file is fixed: 10px, 12px, 20px, 11px for buttons, `min-height:36px`, and `padding:16px 18px`.
- The `@media(max-height:780px)` rule shrinks the notes further.
- `game.css:514` only resets position and width inside the column.

**Fix (CSS plus one small TSX change)**
1. Multiply every font size, padding and button min-height in `strike-review.css` by `var(--fc-ui-scale)`:
   - header span 11px
   - h2 20px
   - body and table 13px
   - thead 11px
   - buttons 13px, with min-height 40px
   Remove the max-height media rule; the column already bounds height.
2. Scaled, the card is about 470px tall at 720p/150%. That is taller than the roughly 428px column, so pinning the decision row is required:
   - Apply `.battle-information.active .strike-review .button-row{position:sticky;bottom:0;background:<card bg>;padding-block:6px;margin-inline:-18px;padding-inline:18px;box-shadow:0 -6px 8px rgba(0,0,0,.5)}`.
   - Sticky positioning works inside the `.battle-information-scroll` overflow ancestor.
   - Confirm, Retarget and Cancel then stay visible without scrolling.
3. Restyle it as a console well so it matches the rest of the chrome:
   - `background:#1b1a16` with the tray bezel border
   - brass header rule
   - LCD-amber tabular times in the table
   - CONFIRM STRIKE as the existing primary brass key
   - CANCEL carries its `ESC` `kbd`, like the target card
4. In `StrikeReview.tsx`, add a ref and `useEffect(()=>ref.current?.scrollIntoView({block:'nearest'}),[review.phase==='loading'])`. This lets the card scroll into view when it opens below long captions.
   - Do not move focus: StrikeReview's `onKeyDown` stops every key, so taking focus would silently disable game hotkeys.
   - I am not claiming an overlap with targeting. The controller clears the target before the review appears, and the review is in flow.

**Acceptance**
- At 1280×720/150% with three captions present, the review opens with its heading and the button row visible without user scrolling.
- The button labels are at least 18px, and the table text is at least 18px.
- Escape still cancels.
- There is no horizontal overflow.
- Captions keep the same DOM node identity.

### P2 — Medium: the selection heading's width reflows the command grid, dropping 4 columns to 3 (MORE 3 → MORE 6)

**Evidence**
- M-720O (Engineering Rig, 150%): the overview ends at x≈295, and the grid starts at 305 with **4** columns.
- M-720 (Precision howitzer, same scale): the overview grows to x≈335, and the grid starts at 345 with **3** columns. Eight commands become six, and the cue changes from MORE 4 to **MORE 6**.
- FORCE-FIRE, the artillery's key command, is among the hidden ones.
- Because the heading ellipsizes, the wider overview does not even buy a readable name: it shows `PRECISION HOWITZ…`.
- Command slot positions move between unit types, which undermines muscle memory.

**Cause**
- `.selection-tray` is a flex row, and `.selection-overview` is sized by its content. Its minimum is 170px (the global rule in `game.css`, line 7).
- The `h2` is `white-space:nowrap;overflow:hidden;text-overflow:ellipsis` (`game.css:198`), so its intrinsic width pushes the overview out before it clips.
- The grid uses `repeat(auto-fill,minmax(calc(88px*scale),1fr))` (`game.css:543`). The 40px loss drops the track count: 575px fits 4×132 plus gaps, but 535px does not.

**Fix (CSS only for layout; one constant for ordering)**
1. Give the overview a fixed, scaled track: `.battlefield-screen .selection-overview{flex:0 0 calc(196px * var(--fc-ui-scale) + 90px);min-width:0}`. Tune the value so the rig and howitzer overviews are identical, and the grid starts at the same x for every selection.
2. Let unit names wrap to two whole-word lines instead of ellipsizing:
   `.selection-overview h2{white-space:normal;overflow-wrap:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;line-height:1}`
   There is about 30px of free tray height above the heading at 720p/150% (M-720 520-552), so a second 28px line fits. Ellipsis remains only as a third-line fallback. Keep the empty-state heading rule at 433 as it is.
3. In `App.tsx:53`, move `force_fire` to directly after `hold` in `COMMAND_FIRST`. Units that have it are the ones for which it is a primary order. Units without it are unaffected.

**Acceptance**
- At 1280×720/150%, the rig, the howitzer and one longest-name unit from the catalog all have the same grid x-origin and column count.
- `PRECISION HOWITZER` shows in full on two lines.
- MOVE, ATTACK-MOVE, ATTACK, STOP, HOLD and FORCE-FIRE are unscrolled for the howitzer.
- At 1600×900/100% the grid is unchanged or wider than in M-1600.

**Answer to root's question: does the Precision howitzer truncation need a bounded fix?** Yes, but the bigger defect is the reflow, not the ellipsis. The plate itself is legible (below).

### P3 — Medium: the information column takes about 54% of the field width at 150% and gives no cue that it scrolls

**Evidence**
- `game.css:507` sets `width:min(calc(330px*scale), 100vw - sidebar - 36px)`. That is 495px of a roughly 915px field at 720p/150% (S-720 18-510), against 25% at 1600×900 (S-1600 18-345).
- With alerts, one long caption and a target card, S-720 covers x 18-510 from y 62 to 490. That is more than half the playable area of a frame that is already only about 50% battlefield at this scale; the reference study's Remastered figure is 78%.
- The scroll box has `pointer-events:auto`, so it also blocks world clicks and drag-select on everything it covers.
- **Discovery:** S-720 cuts the caption mid-sentence at y≈375 (`This long caption`). The only cue is a thin, almost invisible scrollbar. The command well got a brass MORE tab for exactly this reason, but this column did not.
- Synthetic content caused the extreme case, but one ordinary objective list plus two captions reaches the same width.

**Fix (CSS, plus a reused hook in `App.tsx`)**
1. Cap the column at a share of the field: `width:min(calc(330px * var(--fc-ui-scale)), calc((100vw - var(--fc-hud-sidebar-w)) * .42), …)`. That gives about 384px at 720p/150%, with lines of about 34 characters at 21px. The value is unchanged at 1600×900.
2. Generalize `useCommandOverflow` so it can mark the information scroll. It already counts children above and below using one rAF, a ResizeObserver and a MutationObserver, with full cleanup.
   - Show a small brass "MORE ▾" tab at the column's lower-right edge.
   - Add a 16px bottom fade mask while content overflows below.
   - Keep it static, with no animation.
3. Left-align multi-line alert text. It is currently centred (S-720 70-485,155-245), which reads as a web banner. Short alerts look unchanged.

**Acceptance**
- The column is at most 42% of the field width at 1280×720/150% and unchanged at 1600×900/100%.
- In the display-stress fixture, a still frame shows the overflow tab whenever content is clipped below.
- Existing assertions still pass: rectangle disjointness, caption identity and the camera invariant.

### P4 — Medium (visual): fog "spur diamonds" at the axis poles of circular vision

**Evidence**
- F4-N (viewed pixels) shows detached dim diamonds at 450-520,275-300; 1175-1240,275-300; and 450-520,635-660.
- F4-150 shows 225-290,325-350 and 1125-1190,320-350.
- S-1600 shows 345-385,295-310 and 915-960,295-310.
- They sit at the four grid-axis extremes of each vision disk and are separated from the lit area by a dark gap. They are the brightest isolated shapes in the unknown and read like map markers.
- The rest of the edge is now a soft staircase without creases, so the v24 F1 crease fix worked where intended.
- The remaining sawtooth on grid-diagonal edges (M-1600 1000-1100,300-700) is the honest tile staircase. I do not request a change there.

**Cause**
- The pole tile of a disk has exactly one visible 4-neighbour.
- Each of its four corners touches a non-visible 4-neighbour, so under the maximum rule every corner alpha is at least 175, and usually 255.
- My v1 centre rule then raises only the centre to 128, which makes the tile a 255→128→255 pyramid. Its inner neighbour's outer corners are also 255, which creates the dark gap. The result is a detached diamond.
- The existing unit test `F1 a lone visible tile becomes a flat capped patch` (`presentation-polish.test.ts:90-96`) asserts `[128,255,255]` for this shape. The artifact is therefore the tested design, not a regression.

**Proposed treatment: fill connected no-clear-corner tiles (a bounded change in `fogVertexAlphas` plus one topology array)**
1. In `fogTopology`, add `fogFanNeighbours`: 4 slot indices per top triangle (N, E, S, W; `-1` for off-map), stored as `Int32Array`.
   - Every 4-neighbour already touches one of the tile's corner points, so all of these tiles are already in `fogTiles`, and changed-tile memoization already sees them.
   - Assert this in the test instead of assuming it.
2. In `fogVertexAlphas`, for a top triangle with `base===0`, compute the four corner alphas as today. If **all four are > 0** (the tile has no clear corner) **and at least one 4-neighbour slot has opacity 0**:
   - set all three vertices to `min(cornerAlphas)`, a constant that is at least 175;
   - otherwise keep today's corner and centre rule unchanged.
3. Tiles with no visible 4-neighbour keep today's flat 128 patch. An isolated sighting stays honestly visible.

**Why this is bounded and safe**
- **Privacy is unaffected.** It only raises alpha on currently visible top triangles. Unknown and remembered triangles, face triangles, the ramp texture, geometry, positions, indices, bounds, picking, height/cliff alignment and caching are untouched. It reads only the public `visible` and `explored` arrays.
- **Little visible ground is lost.** The affected tiles can never show clear ground today; their brightest point is already the 128 centre. The treatment removes a sub-50% bump, never a clear area.
- **No new GPU sample decreases relative to v5.** Filled triangles are constant, so non-centroid MSAA extrapolation inside them yields that same constant. Neighbouring triangles' vertex values do not change. Every sample is therefore expected to be greater than or equal to its v5 value. This is a GPU claim, so it must be *measured*, not inferred from CPU vertices.
- **Fragments stay consistent.** Both depth fragments of a fan decide from the same tile-level corners and neighbours, so the fill is identical across the split and across chunks.

**What this does not fix**
- The separate v4-monotonicity gate remains **failed**. The 128-centre rule already lowers some extrapolated samples below v4, by up to 13 alpha on raised geometry. The spur fill neither causes nor cures that.
- I do not propose a tolerance.
- Root must make an explicit, recorded decision on one of two paths:
  - (a) keep accepted-v4 appearance monotonicity as a gate. That requires a custom fog shader using WebGL2 `centroid` interpolation of the fog coordinate, which takes the fog meshes off Pixi's batch path and needs a performance check; or
  - (b) formally scope the fog gate to the zero-tolerance privacy invariant already stated in `fog-three-source-review.md`.
- Until then, the feathered renderer is a development state, not an accepted one.
- Actor draw order on a filled tile must stay as it is today. A visible unit standing on a filled spur must still render above the fog, and a native capture must check this.

**Required checks for any implementation** (this review only proposes them)
- **CPU (`presentation-polish.test.ts`):**
  - Disk visibility for radii 2..14 on a flat 40×40 map: no visible top tile with at least one visible 4-neighbour has all corners > 0 and a non-constant alpha.
  - The existing straight-edge coplanarity, interior-clear, protected-triangle equality and cross-fragment tests still pass. Replace the old lone-tile test with a 0-neighbour and a 1-neighbour pair.
  - Raised and cliff random fixture: no visible vertex below v5, and every changed vertex belongs to a filled tile.
  - Neighbour slots are a subset of `fogTiles`, including at chunk borders.
- **GPU (reuse the 35×35 three-source fixture):**
  - 48 flat and 48 raised cases.
  - Privacy floor at zero tolerance.
  - 192 protected-class comparisons exact.
  - A new v5→candidate monotonicity comparison with **zero** decreases and no tolerance. Report the v4 comparison separately and unchanged.
- **Native:** re-capture the opening at 1600×900/100% and 1280×720/150%. There must be no detached diamond.
- **Additional visibility cases:** sparse and randomized bitvectors mutated in place; a replay rewind (visibility shrinking, then regrowing); a spur exactly on a chunk seam; zoom 0.45/1/1.8.
- **Cleanup:** zero canvases, geometry and texture after dispose.
- FF-cand and FF-raised show the flat/raised fixture keeps the hard remembered→unknown edge and the map-edge raised silhouette (FF-raised 1300-1345,205-230). Both are public static topology and should stay.

### P5 — Low: the upper overflow tab is back to a bare number

**Evidence:** M-720O 885-905,522-552 shows only `4` with a small up-caret. Only `.more-below` gets the vertical MORE text (`game.css:538`).

**Fix:** mirror that rule for `.more-above::after`, reading `MORE` beside the count.

### P6 — Low: the strategic panel is clipped at the bottom of the sidebar at 720p/150%

**Evidence:** S-720 925-1280,672-720 shows `Strategic site required` cut at the bottom edge. In M-720 only a sliver is visible.

The sidebar scrolls (`game.css:255`), so the panel is reachable, but the strategic-readiness indicator is the one sidebar item a C&C player expects to see at all times.

**Fix:** `.battlefield-screen .strategic-panel{position:sticky;bottom:0;z-index:1}` with the existing inset well background, so it stays visible while cameos scroll behind it. It costs about 60px of cameo viewport at this scale; the gain in awareness is worth that.

### P7 — Low (robustness): the scroll-key capture listener suppresses all bubble-phase handlers inside the column

**Where:** `App.tsx:62`

**What happens**
- `stopPropagation()` during the capture phase at `.battle-information-scroll` also stops these keys from reaching the target and any bubbling listeners.
- That includes React's root bubble dispatch, so any future `onKeyDown` inside the column never sees Arrow, Page or Home/End keys.
- Nothing is lost today: the only React key handler there is StrikeReview's Escape branch, and the default scroll action is preserved.
- Separately, the region keeps `tabIndex=0` even when it is empty. That creates a zero-size tab stop.

**Fix**
- Document the contract in a comment.
- Set `tabIndex` only when the column has scrollable overflow; the P3 overflow hook already knows this.

**No other lifecycle problem found**
- The wrapper, the three callback-ref hosts and `AudioCaptions` stay at stable, unkeyed positions.
- The listener effect runs once against a permanently mounted node and has matching cleanup.
- Portaled children unmount with the keyed `Battlefield`.
- Captions use `role=log` with polite live updates, and alerts use polite live updates.

## Last-seen plate: my judgment on the native images

- **Legible at both sizes.**
  - M-1600 790-895,495-510: amber `LAST SEEN 0:06` on a dark plate over the grey ghost.
  - M-720 578-735,395-418: 18px, crisp.
  - The plate is rasterized at the scaled size and counter-scaled by `1/zoom` (`battlefield.ts:288-290,351`), so it stays sharp. I agree with root here.
- **Skybreaker label:**
  - It wraps whole-word in M-1600 425-505,862-883 (`SKYBREAKER` / `WING`).
  - It fits on one line in M-720O 600-735,660-685.
  - No clipping.
- **Precision howitzer truncation:** it needs a bounded fix, folded into P2.

**Meaningful uncovered cases** (not repeats of unrelated suites):
1. Several adjacent memories, such as a remembered enemy base cluster. Labels have a fixed `(0,-48)` offset in world units and no de-confliction. At zoom 0.45 the offset shrinks to about 22px while the label stays full size, so plates can stack over each other and over ghosts. Capture a cluster of four or more memories at zoom 0.45 and 1.
2. Caption widths at 10:00 and at 1:00:00 or longer (`memoryCaption` in `battlefield-cues.ts:14`).
3. A memory on raised terrain or behind a tall building, where the label and a live structure overlap.
4. Non-US factions and the colourblind palettes. The plate is palette-independent amber, so this is a low risk.
5. A memory near the information column or tray edge.
6. A replay rewind across the sighting tick, where the memory must disappear or reappear with the correct time.

**Asset note, not a UI defect:** the remembered HQ is a flat generic grey box (M-1600 715-965,470-620), with no silhouette of the HQ that was actually seen. Classic references show a darkened last-seen sprite. This is incomplete asset coverage for a future art slice, and the change would stay within the authorized memory type.

## UI defects versus incomplete assets

- **UI defects in scope:** P1-P7.
- **Incomplete assets, not UI defects:**
  - Blocky world structures and the crate-stack supply center.
  - The generic `US airfield` cameo (S-1600 1360-1465,655-712 shows a placeholder house glyph).
  - The flat ghost box.
  - Low-detail pads.
- **Firefox v4 cameo truncation:** F4-N shows `Needs bu…`, `Supply…` and `Vehicle…` at 1600×749 CSS. v5 Chromium at 1600×900 fits the full strings (S-1600). There is no v5 Firefox capture, so this remains **unverified**, not claimed as fixed.

## Proposed next source-authoring slice (after root accepts; live `client/`, rebased on current bytes)

Check file ownership first. The live client has later menu, launcher and mixer integrations, and nobody else may be editing these files.

1. **P1 strike review:**
   - `client/src/ui/strike-review.css`: scaled sizes, sticky decision row, console-well style.
   - `client/src/ui/StrikeReview.tsx`: open-time `scrollIntoView`, no focus change.
2. **P2 tray reflow and names:**
   - `client/src/styles/game.css`: fixed overview track, two-line `h2`.
   - `client/src/ui/App.tsx`: `COMMAND_FIRST` moves `force_fire` after `hold`.
3. **P3 column width and discovery:**
   - `client/src/styles/game.css`: 42% cap, fade mask, left-aligned alerts, P5 above-tab text, P6 sticky strategic panel.
   - `client/src/ui/App.tsx`: generalize the overflow hook for the information scroll, and conditional `tabIndex` (P7).
4. **P4 fog spur fill:**
   - `client/src/render/terrain.ts`: `fogFanNeighbours` plus the fill branch in `fogVertexAlphas`, with constant and topology changes only.
5. **Tests:**
   - `client/tests/runtime/presentation-polish.test.ts`: disk-radius spur tests, the neighbour-slot subset, 0/1-neighbour cases, raised no-drop against v5, and `orderCommands` ordering (currently untested).
   - Reuse the unchanged three-source GPU fog fixture, adding a v5 source column with zero decreases and reporting the v4 comparison unchanged.
   - Extend `work/evidence/presentation-ui-stress/browser.mjs` in a **new** evidence directory with:
     - review-open-without-scroll visibility at 720p/150%;
     - an identical grid origin for rig versus howitzer;
     - a column width of at most 42%;
     - the overflow tab present when clipped.
   - Re-run the memory course (`client/tests/render/battlefield-clarity-product.browser.mjs`) for the two existing cases, plus one clustered-memory, zoom-0.45 capture.
   - Report strict raw-abort status separately and unwaived.

This review adds no deployment plan and deploys nothing.
