# Local development and packaging

The actual product client, Go host, solo worker and authored content are present.
The complete release remains in progress; see [current implementation status](implementation-status.md).
`dev` and `build` require the product client and never substitute a test harness.
Building successfully does not certify complete art or gameplay acceptance.

| Command | Current behavior |
|---|---|
| `make doctor` | Checks pinned Go, Node/npm, protoc/generator and installed dependencies; lists missing game output |
| `make dev` | Builds Go/WASM, starts Go on localhost:8080 and the product dev client on localhost:5173; Ctrl-C stops both |
| `make test` | Go tests/vet plus nonvisual TypeScript checks and runtime unit tests |
| `make test-browser` | Actual Go/WASM, storage, offline reload and LAN integration in installed Chromium, Firefox and WebKit |
| `make check-content` | Requires complete launch/campaign/tutorial/co-op inventory and validates each mission's opening save on all difficulties |
| `make build` | Validates complete content, builds runtime/product client, assembles a native package with licenses and checksums |
| `make play` | Runs the native package on localhost using the repository's `.local` data directory |
| `make lan` | Explicit LAN host binding; prints join addresses |

Install pinned client dependencies with `npm --prefix client ci`. Install test
browsers with `node client/node_modules/playwright-core/cli.js install chromium
firefox webkit`. Go dependencies are pinned in `go.mod`/`go.sum`. Runtime building
generates TypeScript protocol bindings; regenerate Go bindings after schema
changes using `protoc -I protocol --go_out=. --go_opt=module=frontlinecommand
protocol/frontline.proto`. The local command runner adds the installed Go bin
directory to its own PATH without modifying the user's shell configuration.

## Claude product-build contract

Claude supplies `client/package.json` scripts `dev` (Vite-compatible arguments)
and `build`, preserving existing runtime/check scripts and pinned dependencies.
The product dev server proxies `/api` and `/ws` to localhost:8080 so the same
typed APIs operate in development. Its build emits `client/dist/index.html` and
all required local assets, runtime files and cache-pack manifests under
`client/dist`. No CDN/runtime generation request may be needed for play.
The packager copies validated local outputs; it does not generate or transcode
visual assets. Claude remains their primary author/reviewer, with the user's
authorized Codex fallback during quota limits and explicit ownership boundaries.

Claude authors `content/maps/**/*.json`, `content/missions/**/*.json`, and
`content/release.json`. The last file is a strict object with `format_version: 1`
and `launch_maps`, an array of the eight distinct map IDs. Their titles match
section 17.3 of the design: Copper Junction, Relay Heights, Dry River, Industrial
Valley, Border Depots, Port Outskirts, Convoy Union, Twin Outposts. The first
three have two spawns, the next three four; both co-op layouts must be referenced
by their scenarios. Each of the 24 campaign missions has a separate authored
layout in addition to those eight. Tutorials may reuse suitable layouts.

`go run ./cmd/contentcheck -content content` checks available authored records.
Add `-release` to require all five tutorials, four six-mission campaigns and two
co-op scenarios, every briefing/debrief, optional/failure objective, checkpoint
and three difficulty profiles. The validator launches each mission on all
difficulties and restores its opening save. This does not prove that objectives
can be completed, that midpoints are reachable, or that the content is balanced;
those remain gameplay acceptance checks.

## Output and persistence

`make build` creates `dist/frontline-<platform>-<architecture>/`. Previous
packages are renamed with a timestamp, preserving their contents. Interrupted
build staging directories contain generated output only and can be inspected
or removed manually. Existing source and saved data are never cleaned by build.

Each package contains one native Go executable, local client/content,
dependency notices, a version record, file hashes and platform launchers. A
package is for its recorded OS/CPU; cross-platform binaries and native launch
testing remain separate release checks. See [local-package.md](local-package.md)
for end-user launching/data behavior. `make play` uses repository `.local`;
standalone launchers use the package's own `data/` directory.

No infrastructure is deployed. Future hosting is described in
[deployment-plan.md](deployment-plan.md).
