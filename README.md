# Frontline Command

Playable development builds exist. **The complete release is still in progress.**
Current builds have passed local gameplay journeys, but remaining art, mission,
multiplayer and final packaging gates are tracked in the implementation status.

The authoritative rules are in [the game design](outputs/frontline-command-game-design.md).
The approved implementation scope is in [the handoff](outputs/frontline-command-agent-handoff.md).

Go owns the deterministic simulation and local services. Claude Code CLI, exact
model `claude-opus-5-5`, is the primary UI and asset author/reviewer. Codex owns
browser logic, utilities and runtime integration; the user also authorized
implementation during Claude quota limits. Explicit file reservations coordinate
parallel agents. No cloud service is required for local play.

See [implementation status](docs/implementation-status.md),
[architecture](docs/architecture.md), and [protocol](docs/protocol.md).

Run `make doctor` for setup and `make test` for implemented logic checks.
See [local development](docs/local-development.md) for build/play/LAN commands
and current content/client prerequisites. [Future hosting](docs/deployment-plan.md)
is documented only; no deployment has been performed.

Tools: Go 1.27.1, Protocol Buffers compiler 36.2, Node/npm for the client build.
Dependencies are pinned in their lockfiles. Claude is a development dependency
only. Hosting is planning-only; nothing has been deployed.
