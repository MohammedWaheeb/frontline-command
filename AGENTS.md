# Frontline Command implementation boundaries

Read `outputs/frontline-command-agent-handoff.md` and the authoritative
`outputs/frontline-command-game-design.md`. Preserve all existing design sources.

- Codex owns Go simulation, server, storage, backend tests, protocol schemas,
  backend rules/data and Markdown integration documentation.
- User updates on 2026-09-27: Codex owns all nonvisual frontend logic,
  utilities, integration functions, browser runtime adapters and their tests,
  as well as game mechanics. User explicitly requests parallel sub-agents.
  Keep a single Go simulation.
- Latest user update: if Claude reaches its limit, Codex may take over remaining
  implementation, including frontend/UI fixes. Claude remains the primary author
  and reviewer for UI, rendering, art, audio, visual assets, map layouts, mission
  presentation and asset pipelines, through CLI exact `claude-opus-5-5`.
  Resume Claude when access returns. Existing jobs must be told of ownership
  changes before resuming; never have two authors edit the same files concurrently.
- Visual direction: original stylized classic C&C-inspired RTS, strong command
  sidebar, bold readable silhouettes and expressive military-industrial art;
  avoid a photorealistic presentation.
- Latest visual correction: the user rejects blue UI chrome. Claude must use a
  distinctive charcoal/warm gunmetal, olive/brass/amber direction and rework
  generic-looking composition; retain tactical team-color clarity.
- Research actual Generals, Red Alert and similar RTS screenshots. Use the
  inspected references in work/claude/06-rts-reference-study.md and verify the
  rendered game against their game-specific composition and visual density.
- Disable fallback and audit the actual model in CLI output. Never substitute
  another Claude model. Request sign-in if needed while continuing authorized work.
- Keep the simulation pure Go, integer/fixed point, 20 ticks/second, stable order.
  No rendering, HTTP, wall clock, database, or platform-dependent state in it.
- Do not deploy or provision. Localhost by default; explicit LAN opt-in.
- All documentation is Markdown. Track evidence and incomplete work honestly.
- Do not mark an internal milestone as the finished game. The full base release
  includes every feature in the handoff and all 75 units, 28 weapons, eight maps,
  five tutorials, 24 campaign missions, two co-op scenarios, saves, replays,
  multiplayer, editor, complete assets and accessibility.
