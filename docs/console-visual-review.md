# Command console review

The 28 September console pass combines Claude Code's exact
`claude-opus-5-5` visual work with Codex integration after the session quota
interruption. Reference research is in
[the RTS screenshot study](../work/claude/06-rts-reference-study.md). The design
uses original charcoal plates, brass edges, olive faction paint, recessed
instruments and amber readouts. Blue is reserved for tactical team paint.

Claude added labelled category keys, connected cash/power instruments, faction
identity plates, queue counts and work bars, visible lock explanations,
selection portraits, command hotkeys and consistent dialog materials.
The actual production and command actions still use the Go affordance adapter.

Codex review found production artwork clipped at 150% interface scale. The
compact layout now reduces decorative spacing and minimap height before
compressing the production area. At 1280×720 and 1600×900 the enlarged layout
keeps a complete cameo and the command rows visible. Queued units retain their
artwork: the count, work bar and queue row carry queue status, with the full
waiting explanation available in the tile tooltip. Unavailable actions retain
their visible text reason.

## Evidence and limits

`work/claude/visual-review/capture.mjs codex-density-final` drives the current
local product through first run, menu, skirmish deployment, paid power placement,
HQ production, pause and options. It captures 22 full views/crops at 1600×900
and 1280×720, including 150% scaling. No page/console errors or failed HTTP
responses were recorded. Root visually inspected the sidebar, selection tray,
production tile and enlarged options dialog. Evidence is under
`work/evidence/visual-review/codex-density-final/`.

The earlier `pass1` and `codex-density` captures are preserved, including the
clipped larger layout that caused the correction. Passing these views is a
bounded console review. The main-menu background still needs original key art;
many unit/building illustrations are still in production. Campaign, lobby,
editor, replay and long-session visual reviews remain separate release gates.
The renderer also needs stronger elevation/prop presentation. This is not
acceptance of the finished game's visual quality.

## Radar proportions

The radar now uses the battlefield's 2:1 isometric projection, with one scale
for map terrain, authorized unit markers, objectives, camera outline and pointer
conversion. It fits the available panel without stretching axes and clips
markers to the actual map diamond. The canvas backing follows its displayed
size and pixel density. Clicking the surrounding margin clamps to a legal map
edge.

The first undistorted top-down candidate left a small square in the enlarged,
wide console; its captures are preserved under `radar-proportions`. The final
`radar-isometric` set contains 22 actual Go/WASM product views and crops,
including 1280×720 and 1600×900 at 100%/150%, with no browser errors or failed
requests. Root inspected the native radar, sidebar and enlarged battle view.
The renderer fixture checks actual 300×100 canvas clicks at center, quarter and
map edges; pure tests also cover nonsquare maps, both diagonal directions and
multiple accessibility panel sizes. The complete renderer lifecycle suite
passes after this change. Full-map visibility was not enabled for these shots.

## Aircraft command tray

The actual US04 product exposed clipped command labels after explicit Rebase
was added to the complete aircraft action set. The tray now spans the battlefield
width, uses two full-height command rows and scrolls any further actions. Single
subgroup tabs are hidden because they do not change selection. The 04:25 UTC
28 September product run passes at 1600×900 and 1280×720 / 100% and 150%.
First-row buttons are fully visible, every last command can be scrolled into
view, and aircraft Rebase, right-click Rebase, normal Return and quick-save work.
All 209 runtime tests and both TypeScript checks pass.

Evidence: `work/evidence/aircraft-rebase/source/work/evidence/aircraft-rebase/2026-09-28T04-25-37.349Z/`.
Native screenshots were inspected. This isolated command-control build deliberately
uses the pre-height renderer and incomplete art; the terrain/service-depth fix
has separate source-specific evidence. Remaining empty production panels and
missing building silhouettes are not accepted as final presentation.
