# Single-container Frontline Command

Run these commands from the project root. Docker builds the Linux Go server,
Go WebAssembly runtime, browser client, content and pre-rendered art into one
image. It uses the existing package builder and its content/product integrity
checks. Node, protoc and Go are build dependencies only. No LLM, API key,
separate database server, Redis or other application service is required.

```sh
docker build -t frontline-command:local .
docker run -d --name frontline-command --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  --mount type=volume,source=frontline-data,target=/data \
  frontline-command:local
```

Open http://localhost:8080. A named volume is created automatically and retains
SQLite databases, journals, saves and replay objects when the container is
replaced. Run only one container against a data volume; the server holds an
exclusive lock. SQLite is embedded in the Go binary, not a separate service.
The process runs as UID/GID 10001; bind-mounted directories need that ownership.

The image supports Linux AMD64 and ARM64. Docker builds for the host architecture
by default. For an AMD64 VPS when building on an Apple Silicon Mac:

```sh
docker buildx build --platform linux/amd64 --load -t frontline-command:local .
```

Emulated builds can be slower; building directly on the VPS is another option.
Pre-rendered art must exist in the checkout; Blender is not run during the build.
Build with enough memory for the Go/WASM and Vite compilers; runtime sizing is a
separate measurement. A successful image build does not qualify gameplay release
readiness or establish player capacity.

## Access and operation

The example publishes only on the host's loopback interface. For a trusted LAN,
change the port mapping to `-p 8080:8080` and restrict access with the host
firewall. For remote private testing, use an SSH tunnel or an authenticated HTTPS
proxy in front of the loopback port. Preserve the original Host header and allow
WebSocket upgrades; normal same-origin HTTP and sockets share port 8080.

### Behind an HTTPS proxy

Rate limits and the loopback-only operator check key on the client address.
Behind a reverse proxy every player arrives from the proxy's address, so without
configuration a handful of players share one budget: in a measured probe, 20
players polling the multiplayer menu through one address had 40% of requests
rejected with HTTP 429 within 20 seconds. Name the proxy with
`-trusted-proxies` (comma-separated IPs or CIDRs) and have it append the client
to `X-Forwarded-For` (nginx `proxy_add_x_forwarded_for`, Caddy's default). Only
listed peers are believed, and the header is read right to left past trusted
hops, so clients cannot spoof another address. Append the flag after the
image's default arguments, for example with Docker's default bridge gateway:

```sh
docker run -d --name frontline-command --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  --mount type=volume,source=frontline-data,target=/data \
  frontline-command:local \
  -lan -addr 0.0.0.0:8080 -data /data -static /opt/frontline/client \
  -maps /opt/frontline/content/maps -missions /opt/frontline/content/missions \
  -trusted-proxies 172.17.0.1 -max-lobbies 200 -profile-creations-per-hour 1000
```

If the proxy's address is missing from `-trusted-proxies`, the log shows one
line beginning `request forwarded by <address>, which is not in
-trusted-proxies` on the first forwarded request. Add that address and restart.
Signed-in players keep separate request budgets even when several share one
public address (a household, school or mobile carrier); the address has a
shared ceiling of eight players' worth. IPv6 clients are grouped by /64.

`-max-lobbies` (default 64) counts forming lobbies and live matches together,
including the five minutes a finished match stays open for its debrief, so it
is the concurrent-game ceiling. `-profile-creations-per-hour` (default 120) is
the host-wide new-player budget; at the default the 121st new player in an
hour is refused. Size both from the capacity notes in
[multiplayer-load-test-2026-10-31.md](multiplayer-load-test-2026-10-31.md).

Restarting or replacing the container ends every match in progress: on the
next start each interrupted match is recorded as void (`host_restart`) and its
last checkpoint is kept as a diagnostic. Deploy updates when few games are
running. Replays are kept in the data volume up to 2 GiB or 10,000 files; past
that the oldest replays are deleted to make room (a 30-minute four-player
replay is about 5 MB). Match results are kept regardless.

The image contains the existing local/LAN account model. Packaging it does not
add public account verification, recovery, moderation or internet hardening.
An open public launch needs the work described in [deployment-plan.md](deployment-plan.md).
TLS termination and any private-access gateway belong in front of the container.

```sh
docker logs --tail 100 frontline-command
docker inspect --format '{{.State.Health.Status}}' frontline-command
curl --fail http://localhost:8080/api/v1/health
```

The server currently allows 64 lobbies by default and 1–4 commanders per match.
These are application limits, not measured concurrent-player capacity. The
special 500-client measurement profile is loopback-only and is not enabled here.
Capacity must be benchmarked on the chosen VPS with representative active games;
the load-test document gives measured per-match CPU, memory and bandwidth to
start from. Set `GOMEMLIMIT` (for example `-e GOMEMLIMIT=3GiB` with
`--memory 4g`) so garbage collection works harder before the container limit
instead of the process being killed.

## Backup and replacement

Stop the game before copying the whole data directory so SQLite and replay/save
objects form a consistent backup. Stopping interrupts active matches. This
example writes a backup to the current host directory:

```sh
docker stop --time 30 frontline-command
docker run --rm --user 0:0 --entrypoint tar \
  --mount type=volume,source=frontline-data,target=/data,readonly \
  --mount type=bind,source="$(pwd)",target=/backup \
  frontline-command:local -C /data -czf /backup/frontline-data.tgz .
docker start frontline-command
```

Keep backups outside the VPS too and verify a restore into a separate volume.
To replace the container after rebuilding, stop and remove it, then repeat the
run command with the same named volume. Removing the container preserves that
volume. Deleting the volume deletes the stored game data.

## Verification — 25 October 2026

The existing package builder completed in an isolated macOS source copy,
including content validation, WASM/client compilation, product integrity checks
and license packaging. The server also cross-compiled for Linux AMD64 without
CGO. `go test ./cmd/frontline ./internal/storage` passed. A packaged-server smoke
check covered HTTP, art/content, WASM MIME type, profile authentication after a
SQLite-backed restart, and graceful SIGTERM shutdown.

The Docker base-image tags were confirmed to provide Linux AMD64 and ARM64.
An actual image build/container smoke test remains unverified: Docker Desktop's
engine returned HTTP 500, with its backend reporting `no connected VM`. Native
and cross-compilation checks do not establish container runtime correctness.
