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
