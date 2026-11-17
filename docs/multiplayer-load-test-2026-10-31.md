# Multiplayer and skirmish load test — 31 October 2026

Pre-deployment check of the Go host under many simultaneous players, plus a
headless AI-vs-AI skirmish soak on the six default battlefields. All runs used
one Apple M4 (10 cores, 16 GB) with the load generators on the same machine.
A typical VPS vCPU is slower than an M4 core, so treat every CPU figure here as
a lower bound and re-measure on the target host. Harnesses, inputs and raw
receipts are in [`work/load-test-2026-10-31/`](../work/load-test-2026-10-31/README.md).

The review ran in two passes. The first found the reverse-proxy rate-limit
problem and missing socket compression. The second checked what the first pass
could not see from an opening-phase test on a Mac: late-game cost, real disk
flushes, slow or hostile clients, shared home connections, long-running
storage, and the cause of the tick stalls in the mixed run.

## Verdict

Fit for a private or invited deployment of a few hundred concurrent players on
one host, after the fixes below and with `-trusted-proxies` set. Not yet
qualified for an open public launch: see Open issues and
[deployment-plan.md](deployment-plan.md).

## Fixed

| # | Problem | Effect before the fix | Fix |
|---|---|---|---|
| 1 | Rate limits keyed on the proxy's address | Behind an HTTPS proxy about four players in the menu exhausted the shared budget; 20 players saw 40% HTTP 429 | `-trusted-proxies` walks `X-Forwarded-For` past listed proxies; a one-time log line names an unlisted proxy |
| 2 | Fixed caps | 64 lobbies (including five-minute debriefs) and 120 new players per hour host-wide | `-max-lobbies`, `-profile-creations-per-hour` |
| 3 | Uncompressed match sockets | 68–125 KB/s per player | Per-message deflate without context takeover; Chromium, Firefox and WebKit (Safari 26.5) all negotiate it |
| 4 | Replay store full → results never commit | The store refused new replays at 2 GiB / 10,000 files (about 400 thirty-minute games). A finished match then retried its commit every second forever: no result for the players, its lobby slot held until restart, and a void record on shutdown | The store deletes its oldest replays and diagnostics to make room. Players opening an evicted replay get "the replay file is unavailable; the result is preserved" |
| 5 | Slow reader freezes all lobbies | Lobby and matchmaking handlers wrote their response while holding the host-wide lobby lock. One client that requested the lobby list and stopped reading blocked every lobby, matchmaking and match-start request for up to the 6-minute write timeout | Responses on those routes are buffered and written after the lock is released |
| 6 | Players sharing one connection throttled | Limits were per address and sized for one person: five friends on one home network in the menu, or two in the same match using command advice, hit HTTP 429 | Signed-in players each get the full read, write and advice budget; the address keeps a ceiling of eight players' worth |
| 7 | Rate-limit table full at ~2,000–3,000 players | The table held 8,192 live entries (2–4 per player); once full every new player was refused | Capacity 131,072; expired entries swept at most once a second |
| 8 | IPv6 rotation | Each IPv6 address had its own budget, so one /64 could mint unlimited budgets and fill the table | IPv6 clients are limited per /64 |

Tests: `trusted_proxy_test.go`, `socket_compression_test.go`,
`slow_reader_test.go`, `replay_store_full_test.go` (internal/server),
`p3_hardening_test.go` (internal/storage, updated to the eviction contract),
`cmd/frontline/trusted_proxies_test.go`. Each new test failed on the old code.
`go test ./internal/... ./cmd/...` passes. Fixes 1–3 are in commit `ed3e016db`.

## Measurements

### Real API, 500 players (opening phase)

| Run | Workload | Outcome |
|---|---|---|
| 500 clients, uncompressed | 125 four-player FFA matches on Industrial Valley, 500 authenticated sockets, paid opening, moves every 5 s, advice, 120 s window | passed: every stream 20.00 TPS and ≥9.99 Hz state; execution receipt p50 26 / p99 50 ms; mean tick work 0.56 ms per match; worst tick of any match 116 ms; 0 privacy violations; host peak ~2.2 cores, 1.4 GB heap |
| Same, compressed, plus 1,000 menu pollers | adds 1,000 signed-in players polling the multiplayer menu (5 GETs / 2 s, 2,474 req/s) through one trusted proxy | passed inside the window: 250,000/250,000 HTTP 200, p99 31 ms, match streams 20 TPS / 10 Hz. But see Tick stalls: before the window, 75 of 125 matches had a tick over 200 ms |
| In-process menu probe | 1,000 players, distinct addresses | 50,000/50,000 OK, p99 2.8 ms |
| Three-browser test | `npm --prefix client run test:browser` with compression | passed in Chromium, Firefox, WebKit |

These runs stay in the opening (nine actors per player), so they understate
late-game cost. The next section measures that.

### Late game, per match

Three hard-AI matches driven through the host's real per-tick work (advance,
per-player views, priority frames every tick, snapshot/delta at 10 Hz,
protobuf, deflate at the library's BestSpeed level) for 30 minutes of game time.
CPU is per match per tick on one M4 core.

| | Opening (minute 2–3) | Mid game (minute 10) | Late game (minute 25–30) |
|---|---|---|---|
| Actors (4-player) | 63–79 | 111–136 | 118–224 |
| Host CPU per tick, mean | 0.7 ms | 1.5–1.7 ms | 2.4–6.8 ms |
| Worst tick in a 30 s window | 7 ms | 17 ms | 25–80 ms |
| Socket traffic per player, compressed | 10 KB/s | 25–28 KB/s | 20–37 KB/s |
| Socket traffic per player, uncompressed | 70 KB/s | 94–106 KB/s | 95–125 KB/s |
| Largest single frame | 7.5 KB | 11 KB | 16 KB |
| Server checkpoint (raw save) | — | 1.8 MB | 2.4–2.9 MB |
| Live heap per match | 6 MB | 8 MB | 14–17 MB |
| Replay file at end | | | 5.4 MB |

Most of the per-tick cost is the simulation itself (Advance: 75–90%), and
inside it A* pathfinding. Allocation is about 1 MB per match per tick (roughly
20 MB/s per live match), led by `mobileObstacleCells` (27%, a full navigation
grid allocated per radius per tick), `PlayerView` (25%, fog grids copied for
every player every tick) and `haulerRoutingFor` (10%). Garbage collection for
that is extra host CPU not included in the tick figures.

### SQLite under checkpoint load

All storage shares one SQLite connection. Every API request authenticates
through it; each live match writes a checkpoint every 30 s; lobby chat and
match start write while the host-wide lobby lock is held. The probe ran 125
matches checkpointing, 20 chat messages/s and 2,500 authentications/s for 20 s,
with macOS's default flush and with `fullfsync` (a real flush to the drive,
closer to a Linux VPS disk).

| Checkpoint size | Flush | Authentication p99 / max | Chat (lobby lock held) p50 / max | Checkpoint p50 / max |
|---|---|---|---|---|
| 300 KB | default | 0.8 / 8 ms | 0.3 / 2.5 ms | 1.7 / 11 ms |
| 300 KB | real | 4.3 / 17 ms | 3.3 / 14 ms | 8.2 / 26 ms |
| 2.8 MB (late game) | default | 18 / 30 ms | 0.9 / 20 ms | 26 / 36 ms |
| 2.8 MB (late game) | real | 25 / 45 ms | 4.1 / 45 ms | 34 / 54 ms |

At 125 late-game matches the connection is busy about 15–25% of the time with
checkpoints (about 12 MB/s of writes), and lobby actions can wait up to ~50 ms.
That is acceptable, but it puts a ceiling of a few hundred concurrent matches
on one host, and a slow VPS disk lowers it.

### Skirmish soak (AI vs AI, hard, 30-minute cap)

Advance time in ms (p50 / p95 / p99); “max” includes building every player's
view. Eight matches ran in parallel.

| Map | Players | Result | Peak actors | Advance p50/p95/p99 | Max | Ticks >25 ms | >50 ms | Same-seed rerun | Restore from tick 6000 |
|---|---|---|---|---|---|---|---|---|---|
| port-outskirts | 2 | finished 11.2 min | 73 | 0.27 / 2.2 / 10.7 | 33 | 9 | 0 | identical | identical |
| copper-junction | 2 | finished 15.5 min | 64 | 0.31 / 2.7 / 14.0 | 54 | 9 | 1 | identical | identical |
| dry-river | 2 | finished 21.2 min | 64 | 0.34 / 2.2 / 5.2 | 34 | 4 | 0 | identical | identical |
| relay-heights | 2 | finished 19.0 min | 76 | 0.46 / 4.3 / 16.5 | 63 | 87 | 5 | identical | identical |
| industrial-valley | 2 | finished 22.2 min | 84 | 0.50 / 8.1 / 16.5 | 60 | 87 | 5 | identical | identical |
| border-depots | 4 | no result at 30 min | 145 | 1.28 / 14.5 / 26.7 | 96 | 461 | 17 | identical | identical |
| port-outskirts | 4 | no result at 30 min | 251 | 1.53 / 14.6 / 24.4 | 83 | 334 | 11 | identical | identical |
| border-depots | 2 | no result at 30 min | 98 | 0.82 / 22.2 / 48.2 | 122 | 1,331 | 307 | identical | identical |
| industrial-valley | 4 | no result at 30 min | 247 | 2.35 / 17.3 / 28.4 | 93 | 821 | 24 | identical | identical |

No panics, every rerun was hash-identical and every mid-game save restored to
the same final state. Existing simulation gates still pass: 688 actors p95
3.9 ms, mass combat p95 13.5 ms.

### Tick stalls in the mixed run

The first mixed run (compression plus 1,000 pollers) passed its measurement
window, but each match's worst tick, which covers the whole match, was much
worse than in the uncompressed run: median 211 ms, 75 of 125 matches over
200 ms, worst 590 ms. Those ticks fell in the two minutes before the window.
The first-pass report called this "a single tick in five matches", which
understated it.

Three timestamped reruns on the current build, with `GODEBUG=gctrace=1` and the
host's metrics sampled every second:

| Run | Worst tick, median match / worst match | What the timeline shows |
|---|---|---|
| A: 500 players, compressed, no pollers | 6 / 39 ms | Match start under 7 ms. One server-wide 35–39 ms hitch coincides with the run's longest GC cycle (44 ms, 6.8 ms stop-the-world, 30 ms of assists) |
| B: A plus 1,000 pollers from +60 s | 15 / 108 ms | 51–108 ms across many matches 34–42 s after the pollers began, coinciding with the longest GC cycles (40–65 ms with assists) as the heap grew. Pollers: 250,000/250,000 OK, p99 9 ms |
| B, harness cleanup | 840–870 ms in every match | The harness surrendered 375 players and all 125 matches finished in the same second. Each match commits its result on its own loop (replay encode, synced file write, SQLite commit), so 125 commits queued on the one SQLite connection and each final tick waited ~0.85 s |

Conclusions:

- Compression does not cause stalls.
- Garbage collection does cause 40–110 ms hitches across all matches at
  once when allocation surges (players joining, menu traffic ramping). Reducing
  per-tick allocation (see Open issues) is the lever; `GOMEMLIMIT` with
  headroom helps.
- Finishing a match blocks that match's loop for its commit. This is only
  noticeable when many matches end together, and only on the result screen.
- The 0.2–0.6 s opening stalls of the first mixed run did not reproduce on the
  current build under the same load, and their cause is not established.
  Re-check on the target host with the load generators on another machine.

## Open issues (not changed)

- **Pathfinding spikes and allocation in AI-heavy games.** A CPU profile of
  Border Depots 1v1 puts 63% of simulation time in A*
  (`findNavigationRouteWithBuildContact`): a tick may run 12 searches of up to
  32,768 expansions each, and unreachable goals spend the whole allowance,
  producing 50–120 ms ticks on an M4 (expect roughly double on a VPS). The same
  code allocates a full navigation grid per tick. Changing search limits alters
  deterministic results (replays, saves, WASM parity), so this needs its own
  change with hash-identity verification.
- **Stalemates.** Three of four 4-player hard-AI games and Border Depots 1v1
  produced no winner in 30 minutes.
- **Result commit on the match loop.** A finishing match writes its replay and
  result synchronously; simultaneous finishes queue on the single SQLite
  connection (0.85 s for 125 at once). Moving the commit off the loop would
  remove it.
- **Garbage-collection hitches.** About 1 MB allocated per match per tick
  produces 40–110 ms server-wide hitches during allocation surges.
- **Restarts end every live match.** Each interrupted match is voided
  (`host_restart`) on the next start. Every deploy or crash ends all games in
  progress; there is no live hand-off.
- **Lobby lock across disk writes.** Lobby chat and match start hold the
  host-wide lobby lock across a SQLite write (measured up to ~50 ms under late
  game checkpoint load with real flushes). Harmless at the measured rates.
- **One SQLite connection.** Reads (including every request's authentication)
  queue behind 2–3 MB checkpoint writes. A separate read pool (WAL permits
  concurrent readers) or smaller checkpoints would raise the ceiling.
- **A full disk** still blocks result commits (replay or SQLite write fails and
  the match retries). Monitor free space on the data volume.
- **Matchmaking queue** is capped at 128 waiting players.
- **Public internet hardening** (account recovery, abuse handling) is out of
  scope here; see [deployment-plan.md](deployment-plan.md).

## Sizing guidance (estimate)

Per late-game four-player match on an M4: 2.4–6.8 ms of CPU per tick (5–14% of
a core) plus garbage collection, 14–17 MB of live heap, and 4 × 20–37 KB/s of
compressed socket traffic. For a VPS:

- **CPU:** start at 2–4 concurrent late-game four-player matches per vCPU
  (8–16 players per vCPU), keep utilisation under ~60%, and set `-max-lobbies`
  to match. Opening-phase matches cost far less, so mixed populations fit more.
- **Memory:** about 40 MB per late-game match including GC headroom, plus
  ~1 GB base. Set `GOMEMLIMIT` below the container limit.
- **Bandwidth:** about 30 KB/s per connected player in battle, roughly
  110 MB per player-hour; 500 players need ~15 MB/s (~120 Mbit/s) outbound.
- **Disk:** ~12 MB/s of checkpoint writes at 125 late-game matches, and about
  5 MB of replay per 30-minute match (the store keeps the newest 2 GiB).

Confirm with the harnesses in `work/load-test-2026-10-31/` on the actual
machine before opening to players.
