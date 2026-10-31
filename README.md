# Frontline Command

**Beta-ready (31 October 2026)** for a local / explicit-LAN closed beta on Apple
Silicon macOS with desktop Chrome: six skirmish maps, five tutorials, practice,
both co-op scenarios, one to four commanders, Campaign, commander mastery, the
map editor, saves and replays, with a redesigned menu and in-game UI. All gates
pass on the final tree, including `make test-extended`, the three-engine browser
harness and the UI smokes. Physical LAN, four-human sessions, human balance and
art approval remain unverified, and audio acceptance is not claimed. See
[the beta readiness report](docs/beta-readiness-2026-10-31.md). No deployment occurred.

Open `Play.command` in the beta package that `make build` writes to
`dist/frontline-darwin-arm64/`, or launch it from this checkout:

```sh
make build && make play
```

Then open http://127.0.0.1:8080 in your browser. The beta package is
built by `make build` from the current (uncommitted) working tree. [The 2026-10-13 release report](work/release-readiness-20261013/REPORT.md)
covers the earlier scoped release only. Current verification and open items
are in [the release-fix receipts](docs/release-fix-receipts-2026-10-20.md).

The authoritative rules are in [the game design](outputs/frontline-command-game-design.md).
The approved implementation scope is in [the handoff](outputs/frontline-command-agent-handoff.md).

Go owns the deterministic simulation and local services. The browser client uses
TypeScript, React and Pixi. Editable Blender models produce the actor art; original
Python generators produce terrain and decorative effects. Current authoring
instructions and the user's reduced release scope are recorded in `AGENTS.md`.
No cloud service is required for local play.

For a single Docker image with the browser client, Go services and persistent
SQLite storage, see [Docker instructions](docs/docker.md).

See [implementation status](docs/implementation-status.md),
[architecture](docs/architecture.md), and [protocol](docs/protocol.md).

Run `make doctor` for setup and `make test` for implemented logic checks.
See [local development](docs/local-development.md) for build/play/LAN commands
and current content/client prerequisites. [Future hosting](docs/deployment-plan.md)
is documented only; no deployment has been performed.

Tools: Go 1.27.1, Protocol Buffers compiler 36.2, Node/npm for the client build.
Dependencies are pinned in their lockfiles. Hosting is planning-only; nothing
has been deployed.
