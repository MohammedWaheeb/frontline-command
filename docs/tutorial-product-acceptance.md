# Tutorial controls and mission location guidance

The product now draws explicitly authored mission regions on the battlefield
and minimap. Objective location buttons focus the camera. Completed objective-
linked markers disappear using the Go snapshot; unlinked briefing locations
remain. No marker derives a position from hidden enemy actors. The loader checks
mission/version, bounded lists, unique IDs, public objective IDs, map regions and
map bounds. A failure preserves gameplay and reports unavailable guidance.

Tutorial reminders share the mission objective card so they do not overlap.
The card can be minimized to preserve selection room at small viewports. Audio
captions now sit above the selection tray instead of being covered by it.
They show actual configured key/mouse bindings, remove demonstrated lessons and
can be reopened after hiding. Tutorial 3's boarding/unloading kinds are recognized;
previously its entire reminder list was rejected as malformed. Accepted input
records live separately in IndexedDB. They cannot award campaign completion or
change Go state. Movement, combat, transport objectives and victory remain Go's
responsibility.

## Actual first-lesson product journey

`client/tests/render/tutorial-product.mjs` starts the unchanged authored first
mission through the real menu. It observes worker frames/orders without changing
simulation data or calling internal game methods. The Browser plugin is not
available, so existing Playwright Chromium drives visible controls. Evidence is
under `work/evidence/tutorial-product/`; the latest result governs pass/fail.
The corrected full journey passes in Chromium 151 at 1600×900: Go victory at
tick 1311, all seven local input skills persisted, earned tutorial completion
retained after reload, and zero page/console errors. A second clean run passes at 1280×720 and 150% interface scale with Stop
remapped to F7 and Rally to F6. Visible hints reflected both remaps, objective
minimize/reopen worked, all input skills persisted and Go victory was earned.
Both runs have zero page/console errors. Native-size screenshots were inspected;
current temporary building art remains visible and unapproved as final art.

The run has exercised single and box selection, the first movement marker,
attack-move and target destruction, Stop, storing/recalling a group, a real
barracks rally point, and occupied-site rejection with unchanged credits. It then
trains a paid rifle, checks real victory and reloads the browser to verify both
lesson memory and earned campaign progress. Screenshots include the authored movement region, rejected placement and real
victory. The renderer and native mission tests remain separate evidence.

Historical failed attempts are retained:

- The first harness selector matched both the reminder and hide button. It now
  scopes the exact complementary region.
- The second harness expected mixed-case Barracks while CSS text transformation
  produces uppercase innerText; actual selection worked.
- The original instruction assumed any cliff Move is rejected. Go deliberately
  chooses nearby legal destinations to avoid permanent overlap. The tutorial now
  teaches blocked placement over the HQ, an actual rejected command with no
  spending. Existing movement rules are preserved.
- The fourth harness pressed Escape after rejected placement had already exited
  targeting, correctly opening Pause. The instruction and harness now respect
  that automatic cancellation.

## Remaining acceptance

A completed native tutorial is not proof of each local input lesson. Tutorial 3
still requires an actual boarding/unloading product journey. The first lesson now covers key remapping, 1280×720 and enlarged guidance;
updated markers across all campaigns/co-op still need visual playthroughs. Initial marked mission actors also need a
safe owned-only identity cue to distinguish them from later same-type production.
All original art and broader visual polish are still in production.
