# Contributing to Frontline Command

Frontline Command is a deterministic Go simulation with a TypeScript/React/Pixi
browser client. Local play needs no cloud service, account, AI key or CDN.
Read [README.md](README.md), [AGENTS.md](AGENTS.md) and
[docs/local-development.md](docs/local-development.md) before changing code;
the game design in `outputs/frontline-command-game-design.md` and the handoff
in `outputs/frontline-command-agent-handoff.md` are the authoritative rules
and approved scope.

By contributing, you agree your contributions are licensed under the
[MIT License](LICENSE).

## Setup

Install the pinned tools, then run the doctor check:

- Go 1.27.1, Node.js 26 with npm 11, Protocol Buffers compiler (`protoc`) 36.2
  and `protoc-gen-go` v1.36.12
  (`go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12`, with the
  Go `bin` directory on `PATH`).
- Pinned client dependencies: `npm --prefix client ci`.
- Browser-test browsers (only for `make test-browser`):
  `node client/node_modules/playwright-core/cli.js install chromium firefox webkit`.

```sh
make doctor   # verifies tool versions and installed dependencies
```

`make doctor` must report no `MISSING`/`MISMATCH` lines before you build or
test. All `make` targets run `node scripts/local.mjs <target>`; on Windows
without GNU Make, run `node scripts/local.mjs doctor` (and likewise for the
other targets) directly.

## Build, run and test

| Command | What it does |
|---|---|
| `make dev` | Builds Go/WASM, serves the Go host on `127.0.0.1:8080` and the dev client on `127.0.0.1:5173`; Ctrl-C stops both |
| `make test` | Routine regression gate: shipping Go packages (`./cmd/... ./internal/... ./pkg/... ./protocol/...`) with `-short`, `go vet`, packaging-script tests, both TypeScript typechecks and runtime tests |
| `make test-extended` | Same checks with the full Go test suite (`-timeout=120m`), including long tests skipped under `-short` |
| `make test-browser` | Go/WASM, storage, offline-reload and LAN integration in installed Chromium, Firefox and WebKit |
| `make check-content` | `go run ./cmd/contentcheck -content content -release`: validates the authored content inventory and each mission's opening save on all difficulties |
| `make build` | Validates content, builds the runtime and product client, assembles a native package with licenses and checksums under `dist/` |
| `make play` / `make lan` | Runs the built package on localhost, or with an explicit LAN host binding |

`make test` is the required gate for every change and must pass before a
change is considered done. Run the other gates when your change touches
their area: `make test-extended` for simulation or long-course behavior,
`make check-content` after any change under `content/`, and
`make test-browser` for client, WASM or networking changes. A `make test`
pass alone does not certify browser, LAN or gameplay acceptance; skipped
tests remain unverified, so report which gates you actually ran. Keep the
focused test for a bug fix with the change (smallest test that reproduces
the defect, then the fix), and run `gofmt` on Go files you touch.

Do not deploy or provision anything. The server binds localhost by default;
LAN hosting is the explicit `make lan` opt-in only.

## Simulation purity (non-negotiable)

`pkg/sim` is a single pure Go simulation, shared by the native host and the
Go WASM worker. Browser code must not reimplement combat or other rules.

- Integer/fixed-point only: 20 ticks per second, integer millitiles and
  milliunits, explicit-width tick timers. No floating point in rules.
- Deterministic and stable: state collections stay sorted by monotonic IDs;
  map iteration never determines execution order; seeded PRNG state is
  serialized. Orders resolve by tick, player, sequence, then position.
- No platform or I/O state in the simulation: no rendering, HTTP, wall
  clock, database or other platform-dependent state, and no `time`,
  `math/rand` or network imports in non-test `pkg/sim` code.

See [docs/architecture.md](docs/architecture.md) for the determinism and
service-isolation model.

## Content, protocol and generated files

- After changing `content/maps`, `content/missions` or `content/release.json`,
  run `make check-content` (or `go run ./cmd/contentcheck -content content`
  without `-release` to check only the records present).
- Do not hand-edit staged package hashes. `make build` derives the staged
  content-index version from the canonical file inventory and hashes the
  final index bytes into the package manifest; authoring sources are left
  unchanged. Publish or replace a built package directory as a unit.
- After changing `protocol/frontline.proto`, regenerate the Go bindings with
  `protoc -I protocol --go_out=. --go_opt=module=frontlinecommand protocol/frontline.proto`.
  The runtime build regenerates the TypeScript bindings.
- Dependencies stay pinned: Go in `go.mod`/`go.sum`, npm in
  `client/package-lock.json` (install with `npm --prefix client ci`).

## Scope and ownership boundaries

Work within the current release scope recorded in [AGENTS.md](AGENTS.md)
and the 2026-10-20 receipts: six skirmish maps, five tutorials, practice,
both co-op scenarios and 1–4 player multiplayer; Campaign, commander
mastery and the map editor are available (unhidden on 2026-10-20). No
audio change is in this pass; the recorded ducking failure did not
reproduce and audio acceptance is not claimed. Preserve all existing
design sources, keep documentation in Markdown, and track incomplete
work honestly — do not present an internal milestone as the finished game.

Ownership follows `AGENTS.md`: Go simulation, server, storage, protocol
schemas and nonvisual frontend logic/tests on one side; UI, rendering, art,
visual assets, map layouts and mission presentation on the other, with
explicit non-overlapping file ownership when work runs in parallel. Never
have two authors edit the same files concurrently.
