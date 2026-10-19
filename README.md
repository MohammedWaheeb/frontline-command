# Frontline Command

The scoped local release is qualified for Apple Silicon macOS and desktop Chrome:
complete integrated art/animations, three skirmish maps, five tutorials, practice,
both co-op scenarios, one to four commanders, saves and replays. Campaign and the
map editor are hidden. Audio remains outside this pass. No deployment occurred.

## Clone and run locally

Requirements: Go 1.27.1, Node.js/npm, Protocol Buffers compiler (`protoc`) 36.2.
No cloud service is required; everything runs on localhost.

```sh
git clone -b runnable-latest https://github.com/MohammedWaheeb/frontline-command.git
cd frontline-command
npm --prefix client ci
make doctor
make dev
```

`make dev` builds the Go/WASM runtime, starts the Go host on
http://127.0.0.1:8080 and the product client on http://127.0.0.1:5173
(Ctrl-C stops both). Open http://127.0.0.1:5173 to play.

Alternatives:

```sh
make build   # assemble a native package under dist/
make play    # run the packaged game on localhost
make lan     # explicit LAN hosting; prints join addresses
make test    # routine Go + TypeScript regression checks
```

On Windows, GNU Make is optional: `node scripts/local.mjs doctor|dev|build|play|lan`
exposes the same commands.

The authoritative rules are in [the game design](outputs/frontline-command-game-design.md).
The approved implementation scope is in [the handoff](outputs/frontline-command-agent-handoff.md).

Go owns the deterministic simulation and local services. The browser client uses
TypeScript, React and Pixi. Editable Blender models produce the actor art; original
Python generators produce terrain and decorative effects. Current authoring
instructions and the user's reduced release scope are recorded in `AGENTS.md`.
No cloud service is required for local play.

See [implementation status](docs/implementation-status.md),
[architecture](docs/architecture.md), and [protocol](docs/protocol.md).

Run `make doctor` for setup and `make test` for implemented logic checks.
See [local development](docs/local-development.md) for build/play/LAN commands
and current content/client prerequisites. [Future hosting](docs/deployment-plan.md)
is documented only; no deployment has been performed.

Tools: Go 1.27.1, Protocol Buffers compiler 36.2, Node/npm for the client build.
Dependencies are pinned in their lockfiles. Hosting is planning-only; nothing
has been deployed.
