# v24 integrated presentation review — 29 September 2026

Reviewer: exact `claude-opus-5-5` (no fallback). The review was read-only, and this file is its only write.
Scope: union `infantry-vehicles-ui-v24` (build SHA-256 `1c86560a…8077d`) and frozen source
`work/art/effects-opus-v2/integration-v24/source/client`. I inspected eight images at their
listed native sizes. This report does not cover the complete roster, infantry or masks.
Those are assigned to a separate review. It does not approve the full game.

Coordinates are `x,y` in the stated capture's own pixel space.
- C-place = `union-v24-stock-chrome-01/1280x720-scale150-placement-free-site-pending.png`
- C-over = `…/1280x720-scale150-command-overflow-bottom.png`
- C-count = `…/1280x720-scale150-countdown-live.png`
- C-replay = `…/1280x720-scale150-replay-paused-camera.png`
- E-place = the Edge placement capture
- F23-range and F23-last = the Firefox v23 1600×900 captures
- FF-paid = `stock-browser-smoke/firefox-02/paid-production-completed.png`. I viewed it downscaled 1.6× from 3200×1498. The coordinates below use that 2000×936 view.

## Verdicts on the three decisions

1. **Console: yes, coherent and readable at 720p/150%, with the two defects below (F2, F3).**
   The frame is a connected, warm console: a charcoal and gunmetal tray, brass rules and LCD-amber
   readouts. The sidebar is a single appliance, and no blue chrome remains. Tactical team blue appears
   only on world buildings and units. At 1280×720, about 70% of the frame stays battlefield. This matches the
   Generals and Remastered proportions in the reference study. Chrome and Edge render the same layout
   (C-place and E-place match pixel for pixel in every panel).
2. **Fog edge: worth a small fix (F1).** The spikes are real and draw attention in normal play.
   They come from how the fan geometry interpolates the feather, not from the fog policy. A fix that
   only changes the shading of currently visible triangles removes most of them. It does not reduce
   unknown opacity or lower remembered fog.
3. **Building portraits: yes, the UI portraits now read as the correct buildings.** Examples are
   Power station at C-place 985-1118,478-620 and the HQ portrait in the FF-paid tray at 20-125,795-900. The
   remaining problem is state overlays covering the art (F4). The world models (the power-station
   ghost at C-place 400-530,330-390, the crate-stack supply center, the flat pads) are low-detail and
   unfinished. That is an art-production item for Mencius, not a UI hierarchy defect.

## Findings, most severe first

### F1 — Medium: bright triangular spikes along the fog boundary

**Evidence**
- C-count shows about 30 bright wedges around the whole lit hexagon. Examples are the top edge at
  230-560,150-195, the left edge at 40-130,230-420 and the lower right at 820-860,260-400.
- FF-paid, from an ordinary paid opening, has isolated bright four-point "stars" at 450-520,270-300
  and 1170-1240,270-300. It also has a sawtooth all around 330-1480,210-750.
- F23-range and C-over show the same thing more mildly along the diagonal edges.
- Classic references (RA2, Remastered) show a soft cloud edge or a plain step edge. None of them has
  bright points aimed at the unknown. The spikes are the brightest high-frequency detail in these
  frames, so they draw the eye away from the units.

**Cause** (`src/render/terrain.ts` 187-196)
- Each top tile is a fan of four triangles around a centre vertex. The centre vertex touches only
  its own tile, so it stays at alpha 0.
- Each corner vertex takes the maximum of its touching tiles, which is 255 wherever any touching
  tile is unknown.
- A boundary tile therefore gets a 0-at-centre, 255-at-corners pyramid across half a tile. The linear
  interpolation creases along the centre-to-corner edges (Mach bands), which shows up as bright ridges.
- A lone protruding visible tile, as in FF-paid, is a full four-point star.

**Suggested scope:** one change in `setFog` plus a topology addition, about 10 lines.
- For top triangles whose base is 0, set the centre vertex (j=0 of `topTriangles`) to
  `min(128, mean of the tile's four corner-point alphas)`. Compute the corners with the existing
  per-point maximum rule.
- `fogTopology` also records each top triangle's four corner-point indices. They are keyed by ground
  x,y like the existing points, so the check can read them even when the tile's four triangles are in
  different depth fragments.
- Corner vertices, face triangles, remembered and unknown triangles, the ramp texture, changed-tile
  detection, caching and disposal all stay as they are.

For a straight boundary, the corners are (255,255,0,0) and the centre becomes 127.5 ≈ 128. All four fan
triangles then lie in one plane, so the crease disappears completely. Convex, concave and lone tiles
reach 128 at their centre, which turns the stars into dim, flat patches.

**Why this is safe**
- It only raises alpha on triangles that are currently visible. Unknown and remembered triangles keep
  their constant per-vertex 255 and 175.
- The rule depends only on public visibility and explored state. Geometry, picking and height or cliff
  alignment are untouched.

**Acceptance**
- Unit tests:
  - For a straight edge, the four fan planes of a boundary tile are coplanar within 1/255.
  - A tile with all nine surrounding tiles visible stays exactly 0 on every vertex.
  - The alpha of every unknown and remembered triangle is identical before and after.
  - No visible-triangle vertex is below its current value.
- Re-capture C-count and FF-paid. There must be no isolated bright points. The boundary should read
  as a continuous one-tile gradient on the staircase.

**Tradeoff**
- The lit area gives up about half a tile of full brightness on the boundary ring. The cap of 128
  keeps boundary-tile ground and anything drawn under the fog readable.
- The underlying tile staircase stays. That is honest and consistent with the classic references.
- I do not recommend blur, a nonlinear ramp or feathering into remembered or unknown triangles.

### F2 — Medium: command-grid order hides STOP at 720p, and the page cue is weak

**Evidence**
- C-place grid at 300-880,518-712: the eight visible slots start with AGGRESSIVE (stance, X) and ESCORT.
- STOP (S) appears only after scrolling (C-over 305-440,617-707), along with RECON SWEEP and SKYBREAKER WING.
- The only scroll cue is the small amber `3` / `4` chip at 884-904,680-712. It reads as a count, not as "more commands".
- The content is reachable, so this is not an unreachable-content report. The problem is that the ordering pushes a
  core emergency command below less-used ones.

**Suggested scope:** order and CSS only; no new controls.
- Put commands in a fixed order: MOVE, ATTACK-MOVE / ATTACK, STOP, HOLD, GUARD, PATROL, ESCORT,
  FORCE-FIRE, then stance and context actions such as RESUME BUILD, then brass ability keys last.
- Give the overflow chip a chevron or "MORE ▾" label, or a faint bottom fade on the well when it can scroll.

**Acceptance**
- At 1280×720/150% with a rig selected, MOVE, ATTACK-MOVE (when the unit can use it), STOP and HOLD
  are visible without scrolling.
- The overflow cue is readable as scrollable in a still frame.

**Tradeoff:** stance moves off the first row, but its state is also shown in the tray.

### F3 — Low-Medium: SKYBREAKER label breaks mid-word in Firefox (v23), with only a thin margin in v24

**Evidence**
- `SKYBREAKE` / `R WING` at F23-range 1197-1270,796-826 and FF-paid 760-845,808-838.
- In v24 Chrome and Edge at 720p/150% it wraps correctly (C-over 600-730,650-690: `SKYBREAKER` / `WING`).
- Frozen CSS line 215 still allows `overflow-wrap:break-word`.
- At scale 1 the minimum column is 74px, and ability keys spend 9px on padding. That leaves about 65px
  for the roughly 62px word, so it fits by only about 3px. Firefox's slightly wider glyph advance is enough to break it.
- There is no v24 Firefox capture, so I cannot confirm the problem is fixed there.

**Suggested scope:** CSS only.
- Use `overflow-wrap:normal` on `.command-grid button>span` so a word never breaks.
- Raise the `minmax` floor to about 80px times the UI scale, or reduce ability-key labels to 11px.
  Either gives at least 8px of slack.

**Acceptance**
- A v24 Firefox capture at 1600×900 scale 100 and at native retina shows `SKYBREAKER` and `COORDINATED` intact.
- No label overflows its button border.

### F4 — Low-Medium: queued and locked overlays cover the production portrait

**Evidence**
- C-place Supply center tile at 1130-1270,478-620: the red `Needs building` chip and the name cover the
  top and lower thirds, leaving only a sliver of the building.
- FF-paid queued tile at 1760-1865,500-620 (v23): `Wait: Queued. / Engineering / rig` fills the card, and
  the portrait is squeezed into a thin strip at the top. "Wait: Queued." is also awkward wording.
- Cost badges such as `500` and `1,800` read well.

**Suggested scope:** in the production-tile CSS and label strings, collapse lock and queue state into
a one-line strip or corner badge (lock icon plus "HQ req.", or a queue count). Keep the portrait at its
full height, and dim it rather than covering it for locked items.

**Acceptance:** at 720p/150% and 1600×900, at least 60% of the portrait area stays visible in the
locked, queued and ready states. The state is still readable without hovering.

### F5 — Low: the LAST SEEN label is too small

**Evidence:** C-over 615-700,405-417 and F23-last 800-882,498-510. The grey label is about 7-8px, on a
grey ghost building.

**Suggested scope:** apply the UI scale variable to this label, with a minimum of 11px, and use the
amber LCD color on a dark plate.

**Acceptance:** the label is readable in the 720p/150% capture at 1:1.

### F6 — Low: toasts stack over the playfield next to the placement card

**Evidence:**
- C-place and E-place: `Vehicle crew ready.` at 660-884,445-490 sits beside the placement card at 25-640,395-490.
- C-over: the toast at 155-753,443-488 covers the remembered structure.

The placement card is well built: title, amber cost, power forecast, CANCEL/ESC. The problem is only the added clutter.

**Suggested scope:** while targeting, move captions to the upper-left event rail, where FF-paid already
shows `UNIT READY` at 22-165,25-65. Otherwise leave them as they are.

**Acceptance:** no caption covers the battlefield band between the tray and the placement card.

## Acceptable as-is (no change requested)

- **Palette:** charcoal and gunmetal, brass rules, olive, and amber LCD numerals. Red appears only
  in the COMMAND LOST danger panel (C-count 928-1270,60-158) and the lock chip. This complies with the
  study and AGENTS.md.
- **Resource strip:** the notched top-centre plate reads as part of the console. The large amber credits are the right focal point.
- **Selection tray:** the portrait, name, segmented HP bar, IDLE and RANGE controls, and the AWAITING
  ORDERS emblem state (C-count) all read well at 720p.
- **Sidebar:** the order is header, minimap, BUILD/HQ/MENU, production, tabs, PWR, tiles, queue. That
  matches the RA2 appliance order. Disabled tabs are clearly muted. The countdown panel pushes
  content down into the scrollable region, which is acceptable.
- **Replay tray:** PLAY, timeline, time LCD, speed, perspective and ORDER LOG (C-replay 360-875,525-705)
  form a coherent device and reuse the tray. The all-black viewport is the intended unexplored-camera test, not a defect.
- **Fog policy itself:** the hard edge between remembered and unknown ground, and remembered fog at
  175, look correct and classic. F1 is only about the shading on the visible side.
