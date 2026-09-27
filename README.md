# Frontline Command

Implementation in progress. **This is not yet a playable or completed release.**

The authoritative rules are in [the game design](outputs/frontline-command-game-design.md).
The approved implementation scope is in [the handoff](outputs/frontline-command-agent-handoff.md).

Go owns the deterministic simulation and local services. The browser client and
all assets are authored exclusively through Claude Code CLI, exact model
`claude-opus-5-5`. No cloud service will be required to play locally.

See [implementation status](docs/implementation-status.md),
[architecture](docs/architecture.md), and [protocol](docs/protocol.md).

Tools: Go 1.27.1, Protocol Buffers compiler 36.2, Node/npm for the client build.
Dependencies are pinned in their lockfiles. Claude is a development dependency
only. Hosting is planning-only; nothing has been deployed.
