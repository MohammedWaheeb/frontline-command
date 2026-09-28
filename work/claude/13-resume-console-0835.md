# Current console assignment — 28 September 08:35 UTC

Resume as the primary visual/UI author using exactly claude-opus-5-5. All older
broad UI assignments are superseded by this file. Read AGENTS.md, the authoritative
handoff/design, reference study06 and current review checklist12. Codex continued
under the user's quota fallback; read current files before editing.

The user explicitly says the game must feel like a real C&C-inspired RTS, with
original stylized art and soul, not generic AI dashboard UI. Keep warm gunmetal,
charcoal, olive, brass/amber. No blue/cyan chrome. Team colors remain independent.
Inspect the actual reference screenshots linked in06 and the current product
captures, especially work/evidence/environment-authored and production-inspection.
The battlefield carries the identity; do not conceal incomplete art with a pretty
shell or call this a finished game.

## Your exclusive editing scope

- client/src/ui except EditorPanel.tsx and its editor-specific helpers/tests.
- client/src/styles/game.css, client/src/design/tokens.css and network.css.
- assets/pipeline/ui/gen_chrome.py and its chrome outputs if needed; ordinary UI
  vector icons/emblems may be improved. Do not touch build icons, unit portraits,
  sprite sheets, model sources, terrain, audio, Go, protocol or runtime logic.
- A new isolated UI capture/regression script and Markdown review report.

Codex Einstein owns EditorPanel and editor-handles. Codex root owns Application,
runtime integration, art-plugin pack integrity and actor/render logic. Session05
owns terrain materials. Mencius/session01 owns sole Blender execution and all
model/roster sources; do not run Blender or alter keyart.py yourself. You may
write a precise key-art composition brief for01/root to review, then coordinate.

Preserve App.tsx's pending notice fix: dismissal waits until busy/booting/assets/
session loading ends. Preserve paid production independent of troop selection,
read-only replay/observer queue inspection and the replay transport inside the
bottom command well. Native1280x720 at100% and150% currently passes. Preserve
Rebase and targetless Return, two command rows with scrolling, remapped hotkeys,
subgroups, actual mission/original-force controls, and accessibility.

## Concrete work

1. Inspect current native screens, open the real local product and identify the
   remaining visual/interaction defects across command center, skirmish/briefing,
   actual battlefield/production, pause/settings, replay and multiplayer lobby.
2. Make a cohesive bounded polish pass: stronger original faction/command-device
   character, deliberate typography/material hierarchy, compact illustrated
   actions and purposeful empty states. Avoid gratuitous decorative widgets.
   Keep useful battlefield space and actual controls. Do not simply add borders.
3. The current main menu uses a blown-up tank portrait/grid. The separate key-art
   preview was rejected for a foreground rock hiding the hero tank, clipped left
   subjects and weak depth. Draft a specific original illustrated composition for
   session01; do not present that rejected preview as finished artwork.
4. Test real flows and capture native1280x720 and1600x900, plus150% interface scale.
   Use existing Playwright tooling (Browser plugin unavailable here), check console
   errors and control reachability, and run both TypeScript checks. Do not rebuild
   the shared Go runtime or run global git add/commit; report exact changed files.

Return concrete evidence and remaining defects. You have implementation approval
within this scope; do not stop after a plan. If a necessary fix crosses ownership,
write the exact proposed change in your report and continue independent work.
