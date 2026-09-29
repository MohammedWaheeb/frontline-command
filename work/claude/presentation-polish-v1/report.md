# Presentation polish v1: findings F1-F6 — 29 September 2026

Author: exact `claude-opus-5-5`, with no other model or agent involved. This is source authoring only, against the
copied CURRENT loader-v3 client in `source/client` (not frozen v24). **Nothing was run.** I ran no tests, builds,
browser, Blender, host or install. I make no claim that tests or renders pass. All original failures and evidence are
preserved. I made no edits outside the seven allowlisted paths. Generation, queue, lifecycle, gameplay, protocol and
art are untouched. `actors.ts` did not need changes.

I checked the current capture `work/art-generation-app-v3/firefox-01/paid-production-completed.png` (3200×1498, viewed at 2000×936).
It shows the same failures as the review: star/sawtooth fog spikes, `SKYBREAKE / R WING`, and the `Wait: Queued.` tile. It also shows a
caption in the bottom band (at 470-1220,690-735).

## Edits

### F1: fog fan centre (`src/render/terrain.ts`)
- **Topology.** `fogTopology` (now exported) records each top triangle's four tile-corner points in a new
  `fogFanCorners` array. The points are keyed by ground x,y through the same point table. A tile's four fan
  triangles fall into two depth fragments (x+y+⅔ and x+y+1⅓), so each fragment has to be able to read all four corners.
  - The far corners' tiles join `fogTiles`, so the existing changed-tile memoization picks up changes to them.
  - Face triangles store unused zeros.
- **Alpha rule.** A new pure function `fogVertexAlphas` holds the per-vertex rule that used to be inline:
  - Unknown triangles stay a constant 255 and remembered triangles a constant 175.
  - Visible triangles keep the existing max-of-touching-tiles value on every corner.
  - The only change is that a visible top triangle's centre (j=0) becomes `max(old, min(128, mean of the four corner alphas))`.
  - `setFog` calls it, then writes the same UV encoding as before.
- **Unchanged:** geometry, positions, UVs of the mesh, picking, the height/cliff surface, face fog, the ramp texture,
  the explored/unknown hard edge, `fog.visible`, caching and disposal. Nothing is blurred outside currently visible ground.
- **Encoding note.** The existing UV encoding `(a+.75)/256` for a≠0 and 0 for a=0 leaves a residual of at most 0.375/255 on a
  straight edge in the sampled ramp. That is inside the 1/255 acceptance tolerance.

### F2: command order and overflow cue (`App.tsx`, `game.css`)
- **Order.** A module-private `orderCommands` does a stable sort of the command kinds for display only:
  - First: `move, attack_move, attack, stop, hold, guard, patrol, escort, force_fire`.
  - Then the other contextual kinds, in their original affordance order.
  - Then the stance (`aggressive`) and `resume`.
  - Rebase and the brass ability keys stay last, as before.
- **What stays the same.** Every command, handler, disabled state, title, hotkey badge and ARIA label is unchanged. No
  script or test depends on grid position (checked with grep).
- **Overflow cue.**
  - The lower brass tab now reads `MORE n` vertically, followed by the existing down chevron.
  - A static 2px brass rule is inset along the well's lower edge whenever `data-overflow` is `below` or `both`.
  - Nothing is animated.

### F3: intact SKYBREAKER / COORDINATED (`game.css`)
- The column floor goes from 74 to `88px × UI scale`, and labels use `overflow-wrap:normal` so a word never breaks mid-letter.
- Ability keys use 11px × scale type and `padding-inline:6px 2px`.
- Estimated inner width at scale 1 is 88 − 12 (key border) − 8 = 68px, against about 60px for `COORDINATED` in Barlow
  Condensed Bold caps. That gives at least 8px of slack, and the slack scales with UI scale.
- At 1280×720/150% the well should still fit four 132px columns, so Move/Attack/Stop/Hold stay in the unscrolled rows. This is an estimate I have not measured.

### F4: compact tile state (`App.tsx`, `game.css`)
- **Root cause of `Wait: Queued.`** The Go `waits_for` codes `queued` and `prerequisite_lost` had no short tag, so the full-text fallback was
  shown. I added tags for both: `Wait · Queued` and `Wait · Prereq. lost`.
- **Layout.** A tile with a state strip now sets `--fc-cameo-caption-h` to one line and clamps the name to one line. The strip then
  sits in the second caption line, so the portrait is covered by about the same height as a ready tile's caption.
  - My estimate is that more than 80% of the art stays visible at scale 1 and 1.5, against about 45% in the capture.
- **Unchanged:** the full name and reason in the accessible name (`.reason-text`) and title, prices, the lock icon, the art
  dimming for locked tiles, availability, queue badges and click behaviour.
- **Tradeoff:** long names on locked/waiting tiles may ellipsize visually (for example `Engineering r…`). The full name stays in
  the tooltip and accessible name.

### F5: LAST SEEN tag (`src/render/battlefield.ts`)
- **Changed.** The label is now a container holding the existing text on a dark plate: `#0b0a09` at 0.86 alpha with a
  1px brass-dark rule. The text is amber LCD `#f2b340`, 700 weight.
  - Size is `memoryLabelSize(uiScale)` = `round(max(11, 12×scale))` screen px. The text is rasterised at that size, not scaled up.
  - It keeps the existing `1/zoom` counter-scale.
  - Changing the UI scale rebuilds the tags (guarded against disposal).
- **Not changed:** the caption string or timestamp, the memory/privacy filter, the anchor position (0,-48), zIndex, or picking
  (`eventMode='none'` on the container, plate and text).

### F6: targeting-time captions (`App.tsx`, `game.css`)
- **Move to the rail.** While a targeting hint exists, captions move out of the bottom band into the upper-left event rail,
  directly beneath the live battle alerts. They never overlap the alerts.
  - A small rAF-throttled `useEventRailBottom` hook publishes the alerts' measured lower edge as
    `--fc-event-rail-bottom`, using ResizeObserver plus window resize. The hook has no React state and cleans up on unmount.
  - The AudioCaptions component, its live region and its caption data are not moved or remounted, so no caption is lost.
- **Scale and layout.** Width is `min(330px × scale, viewport − sidebar − 36px)` for narrow layouts. Text wraps in full at 14px × scale.
- **Reduced motion.** The switch is instant and has no transition, so no motion is added.
- Outside targeting, the caption layout is unchanged. No new assets.

### Tests (`tests/runtime/presentation-polish.test.ts`, CPU only, not run)
- Straight horizontal and vertical edges, against both unknown and remembered fog: the four fan planes of each boundary tile are coplanar within 1/255, and the centre equals edge/2.
- Tiles whose nine surrounding tiles are all visible stay exactly `[0,0,0]`, and an all-visible fragment reports that no fog is needed.
- Pseudo-random view over heights and cliffs (so face triangles are included), compared with a pre-change reference implementation:
  - Unknown and remembered triangles are identical to before.
  - Face fog is identical to before.
  - Visible corners are identical to before.
  - No visible vertex is reduced.
  - Centres rise only up to the cap.
- A lone visible tile gives `[128,255,255]` on all four fan triangles, even though they sit in different depth fragments.
- The topology includes all nine neighbouring tiles, so a change only to a diagonal tile updates the centre (255/4); triangle geometry is deep-equal before and after.
- `memoryLabelSize` never falls below 11 and scales with the UI scale.

## Remaining unrun gates (Codex serial lanes)
1. Typecheck and `npm` runtime tests, including the new file and existing terrain, fog, battlefield and minimap tests. I have not compiled anything.
2. Re-capture C-count and FF-paid (Firefox retina). There should be no isolated bright points, and each staircase edge should show a one-tile gradient.
3. 1280×720/150% with a rig selected: MOVE, ATTACK-MOVE, STOP and HOLD visible without scrolling. The `MORE n` tab and brass rule should read in a still frame.
4. Firefox 1600×900 at scale 1, native retina, and 720p/150%: `SKYBREAKER` and `COORDINATED` intact, with no label overflowing its key.
   This depends on Barlow Condensed actually loading. With a wider fallback font the word would spill rather than break.
5. Locked, waiting and queued tiles at 720p/150% and 1600×900: at least 60% of the portrait visible and the state readable without hover.
6. LAST SEEN readable at 1:1 in the 720p/150% capture.
7. Placement plus a caption at 720p/150% and at narrow widths: no caption in the bottom band, and no overlap with alerts.

## Known limits and follow-ups
- F6 captions in the rail can temporarily overlap the top of the mission-objectives card (z 90) or a strike review. They never
  overlap alerts, the placement card or the tray. If that is unacceptable, the follow-up is a shared rail container with
  objectives, which needs `MissionObjectives`/`AudioCaptions` outside this allowlist.
- F5 uses Arial rather than Share Tech Mono. Pixi Text does not re-rasterise when a web font finishes loading late, so this
  keeps the tag readable in every browser.
- F3's 88px column floor slightly reduces the column count at wide trays, and the new order keeps the core orders first.
