# Frontline Command

Implementation in progress. **This is not yet a playable or completed release.**

The authoritative rules are in [the game design](outputs/frontline-command-game-design.md).
The approved implementation scope is in [the handoff](outputs/frontline-command-agent-handoff.md).

Go owns the deterministic simulation and local services. UI, rendering and
all assets are authored through Claude Code CLI, exact model `claude-opus-5-5`.
Codex owns all nonvisual browser logic, utilities and runtime integration, with
parallel sub-agents under the user’s expanded authorization. No cloud service will be required to play locally.

See [implementation status](docs/implementation-status.md),
[architecture](docs/architecture.md), and [protocol](docs/protocol.md).

Run `make doctor` for setup and `make test` for implemented logic checks.
See [local development](docs/local-development.md) for build/play/LAN commands
and current content/client prerequisites. [Future hosting](docs/deployment-plan.md)
is documented only; no deployment has been performed.

Tools: Go 1.27.1, Protocol Buffers compiler 36.2, Node/npm for the client build.
Dependencies are pinned in their lockfiles. Claude is a development dependency
only. Hosting is planning-only; nothing has been deployed.
