# Frontline Command implementation boundaries

Read `outputs/frontline-command-agent-handoff.md` and the authoritative
`outputs/frontline-command-game-design.md`. Preserve all existing design sources.

- Codex owns Go simulation, server, storage, backend tests, protocol schemas,
  backend rules/data and Markdown integration documentation.
- Every browser/frontend, browser adapter (including Go WASM entry point), art,
  audio, visual asset, map layout, mission presentation, asset pipeline and
  frontend test change MUST be authored through Claude Code CLI with exact model
  `claude-opus-5-5`. Codex may inspect and execute these files, never patch them.
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
