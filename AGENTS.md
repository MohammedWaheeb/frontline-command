# Frontline Command implementation boundaries

Read `outputs/frontline-command-agent-handoff.md` and the authoritative
`outputs/frontline-command-game-design.md`. Preserve all existing design sources.

- Codex owns Go simulation, server, storage, backend tests, protocol schemas,
  backend rules/data and Markdown integration documentation.
- User update on 2026-09-27: while Claude is limited, Codex may implement
  nonvisual frontend utilities, integration functions, browser runtime adapters
  and their tests, as well as game mechanics. Keep a single Go simulation.
- All UI, styling, rendering, art, audio, visual assets, map layouts, mission
  presentation and asset pipelines MUST still be authored through Claude Code
  CLI with exact model `claude-opus-5-5`. Codex may inspect/test these files,
  never implement or patch them. Existing Claude jobs must be told of ownership
  changes before resuming so two authors never edit the same files concurrently.
- Visual direction: original stylized classic C&C-inspired RTS, strong command
  sidebar, bold readable silhouettes and expressive military-industrial art;
  avoid a photorealistic presentation.
- Disable fallback and audit the actual model in CLI output. An authentication
  error is a blocker for that lane, not permission to switch author/model.
- Keep the simulation pure Go, integer/fixed point, 20 ticks/second, stable order.
  No rendering, HTTP, wall clock, database, or platform-dependent state in it.
- Do not deploy or provision. Localhost by default; explicit LAN opt-in.
- All documentation is Markdown. Track evidence and incomplete work honestly.
- Do not mark an internal milestone as the finished game. The full base release
  includes every feature in the handoff and all 75 units, 28 weapons, eight maps,
  five tutorials, 24 campaign missions, two co-op scenarios, saves, replays,
  multiplayer, editor, complete assets and accessibility.
