# Local development and packaging

The actual product client, Go host, solo worker and authored content are present.
The current player scope is six default skirmish battlefields, five tutorials,
practice, both co-op scenarios and multiplayer; Campaign, commander mastery
(Command Record) and the map Editor are available (unhidden on 2026-10-20). See
[release-fix receipts](release-fix-receipts-2026-10-20.md) for current evidence
and remaining open items.
`dev` and `build` require the product client and never substitute a test harness.
Building successfully does not certify complete art or gameplay acceptance.

| Command | Current behavior |
|---|---|
| `make doctor` | Checks pinned Go, Node/npm, protoc/generator and installed dependencies; lists missing game output |
| `make dev` | Builds Go/WASM, starts Go on localhost:8080 and the product dev client on localhost:5173; Ctrl-C stops both |
| `make test` | Shipping Go packages with `-short`, vet, both TypeScript projects, packaging and runtime tests; archived experiments are excluded |
| `make test-extended` | **Required pre-release gate.** Same checks with full shipping Go tests and `-timeout=120m` per package; includes long tests gated by `testing.Short()`. Budget about 90 minutes wall-clock for the full authored set |
| `make test-browser` | Actual Go/WASM, storage, offline reload and LAN integration in installed Chromium, Firefox and WebKit |
| `make check-content` | Requires complete launch/campaign/tutorial/co-op inventory and validates each mission's opening save on all difficulties |
| `make build` | Validates complete content, builds runtime/product client, assembles a native package with licenses and checksums |
| `make play` | Runs the native package on localhost using the repository's `.local` data directory |
| `make lan` | Explicit LAN host binding; prints join addresses |

Both test commands check `./cmd/... ./internal/... ./pkg/... ./protocol/...`.
`make test` is the routine regression command; it skips long authored mission,
practice and performance courses that explicitly honor Go's `testing.Short()`.
`make test-extended` preserves those courses, including the campaign tests
for the campaign unhidden on 2026-10-20. Tests requiring `FRONTLINE_*` opt-in variables
or external artifacts still require their documented setup. Neither command
automatically runs browser acceptance, physical-device LAN, or human playtests.
Skipped tests remain unverified; a short-suite pass does not certify their
acceptance. Run the relevant dedicated tutorial/co-op/endurance courses for the
current release and retain their separate results.

No player release may be tagged without a passing `make test-extended` run on
the exact release tree. `make test` alone is not a release gate: it skips the
long authored courses. `go build ./...` and `go vet ./...` also work from the
repository root; `work/go.mod` keeps archived experiment snapshots under
`work/` outside the shipping module, so standard tooling does not load them.

The five Go↔TypeScript wire-parity tests in `client/tests/runtime/`
(`mission-public-tasks.test.ts`, `mission-public-tasks-wire.test.ts`) skip
unless native evidence is generated first. Generate it with the Go test that
owns the snapshots, then run the client runtime suite with the same variable:

```sh
FRONTLINE_MISSION_PUBLIC_TASK_WIRE_EVIDENCE="$PWD/work/evidence/mission-public-task-wire" \
  go test ./internal/viewproto/ -run TestCanonicalMissionPublicTaskAuthorizedNativeSnapshots -count=1
FRONTLINE_MISSION_PUBLIC_TASK_WIRE_EVIDENCE="$PWD/work/evidence/mission-public-task-wire" \
  npm --prefix client run test:runtime
```

The Go test writes four `.player-snapshot.pb` / `.view.json` pairs (human and
Normal-AI allies, owners 1 and 2). With the variable set, the five parity
tests must run and pass; a run that reports them skipped is not wire-parity
evidence. This generation is part of the pre-release gate above.

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

To build a separate package while an existing preview keeps using its current
files, choose another output directory:

```sh
FRONTLINE_PACKAGE_DIR=dist/frontline-release-darwin-arm64 node scripts/local.mjs build
```

The override also selects the package used by `play` and `lan`; supply the same
variable when running those commands. Relative paths resolve from the source
root. Outputs inside the source tree must be beneath `dist/`; source directories
and ancestors are rejected, including symlink aliases. Existing packages at the
chosen output still receive the usual timestamp backup before replacement.

Each package contains one native Go executable, local client/content,
dependency notices, a version record, file hashes and platform launchers. A
package is for its recorded OS/CPU; cross-platform binaries and native launch
testing remain separate release checks. See [local-package.md](local-package.md)
for end-user launching/data behavior. `make play` uses repository `.local`;
standalone launchers use the package's own `data/` directory.

No infrastructure is deployed. Future hosting is described in
[deployment-plan.md](deployment-plan.md).

## LAN hosting

With a current native package available, run `make lan` (or
`node scripts/local.mjs lan` on Windows). This explicitly opts into LAN access
and binds `0.0.0.0:8080`; normal `make play` remains localhost-only. The command
prints the host's game page and copyable **LAN join addresses**. Open the host
page on the hosting computer and share a LAN address such as
`http://192.168.1.10:8080` with the other players. Each player opens that address
in their own browser, then enters the lobby invite code. They should use the
host's page rather than connect from a separately running copy of the game.

Keep the host process running throughout the match. Players must be on a trusted
shared network; plain LAN HTTP/WebSocket traffic is not encrypted. If another
process already uses port 8080, the command exits without replacing it. A native
host can choose another port, for example
`./frontline -lan -addr 0.0.0.0:8081`; share the address with that same port.
If no LAN address appears, check the network connection and listener binding.
A specific-interface bind advertises only that interface, and a loopback bind
does not advertise LAN addresses even when `-lan` is set.

The UI can read `GET /api/v1/host` on the connected host. It returns
`{ "lan_enabled": true, "join_urls": ["http://192.168.1.10:8080"], "message": "…" }`
with copy-friendly URLs and player guidance. Without explicit LAN opt-in it
returns `lan_enabled: false`, an empty `join_urls` array and instructions to run
`make lan`; request headers cannot enable discovery. The endpoint uses the same
origin restrictions and read budget as the other APIs, requires no profile, and
is not cached. The actual bound port is used, including OS-assigned ports.

These checks do not establish firewall reachability or physical multi-device
LAN acceptance; verify those on the intended network separately.

## Packaging integrity and updates (29 September 2026)

On Windows, GNU Make is optional: `node scripts/local.mjs doctor`, `build`,
`play` and `lan` expose the same commands. The runner invokes installed npm's
JavaScript with Node, rather than trying to execute `npm.cmd` directly. Native
builds explicitly choose this Node process's OS/CPU and `CGO_ENABLED=0`; an
inherited `GOOS=js` or `GOARCH=wasm` cannot silently mislabel the package.
The final executable's PE/ELF/Mach-O header must match the recorded target.
Windows runtime inspection uses `runtime-native.exe`. Native execution on each
supported Windows/Linux/macOS target still needs a real clean-machine gate.

The package validator checks the full offline manifest, exact file hashes/sizes,
required worker/WASM/Go shim/service-worker/index dependencies, local HTML
references and index/manifest identity. It rejects symlinks, case collisions,
unsafe or Windows-incompatible names, and unmanifested runtime files. Go/content
source fingerprints before and after build must match; the stage records those
inputs and its own runtime metadata. Checksums are streamed, not accumulated in
memory. The package includes the Go runtime/`wasm_exec.js` license in addition
to dependency notices. The new runtime build script imports
`scripts/package-integrity.mjs`, which must be included in isolated source copies.

A read-only check starts no server or browser:

```sh
node scripts/audit-package.mjs --product /absolute/path/to/product \
  --out /absolute/path/to/new-integrity-receipt.json
```

Add `--previous /absolute/path/to/older/product` to reject changed bytes under
an unchanged offline pack identity. Use a fresh receipt path. This check does
not establish correct HTTP MIME responses, cold offline boot, complete art or
native platform support. The detailed current audit and remaining gates are in
[packaging-release-audit.md](packaging-release-audit.md).

Future builds retain base pack ID `2.0.0` but derive the version from their
canonical file inventory. Only the index's generated self-reference is
normalized during hashing; all other staged file descriptors contribute. The
resulting version is written into the **staged** content index, whose final
exact bytes are then hashed into the manifest. Authoring sources and frozen
products are not changed. Index/manifest validation completes before publication;
JSON files are written via temporary-file rename inside an unpublished build
directory. Publish/replace the completed package directory as a unit; do not
serve the directory while a builder is updating its index and manifest.
