# Multiplayer and skirmish load test — 31 October 2026

Pre-deployment check of the Go host under many simultaneous players, plus a
headless AI-vs-AI skirmish soak on the six default battlefields. All runs used
one Apple M4 (10 cores, 16 GB) with the load generators on the same machine, so
CPU numbers are upper bounds for the host and must be re-measured on the target
VPS. Harnesses, inputs and raw receipts are in
[`work/load-test-2026-10-31/`](../work/load-test-2026-10-31/README.md).

## Results

| Run | Workload | Outcome |
|---|---|---|
| Real-API pilot | 1 four-player FFA, 4 sockets, 30 s | passed |
| Real-API 500 clients | 125 four-player FFA matches on Industrial Valley, 500 authenticated sockets, paid opening + moves every 5 s + advice, 120 s window | passed: every stream 20.00 TPS and ≥9.99 Hz state; execution receipt p50 26 ms / p99 50 ms (one 50 ms tick is inherent); mean tick work 0.56 ms per match; 99.4% of ticks ≤2 ms; 2 of ~300k ticks >50 ms; 0 privacy violations; host peak ~2.2 cores, 1.4 GB heap |
| Same, compression on, plus 1,000 menu pollers | 500 in-match + 1,000 signed-in players polling the multiplayer menu (5 GETs / 2 s each, 2,474 req/s) through one trusted proxy address | passed: 250,000/250,000 HTTP 200, p50 1 ms, p95 7 ms, p99 31 ms, max 481 ms; match streams unchanged (20 TPS, 10 Hz); socket traffic 7.0 KB/s per player vs 68.4 KB/s uncompressed; host peak ~3.3 cores |
| In-process menu probe | 1,000 players, distinct addresses | 50,000/50,000 OK, p99 2.8 ms — the single SQLite connection is not a read bottleneck at this scale |
| In-process menu probe | 20 players behind one proxy address, no trusted proxy | **400 of 1,000 requests rejected (HTTP 429)** within 20 s |
| Same with `-trusted-proxies` | 1,000 players behind one proxy address | 50,000/50,000 OK, p99 2.1 ms |
| Three-browser test | `npm --prefix client run test:browser` (two-browser multiplayer, reconnect, committed result, native/WASM parity) with compression on | passed in Chromium, Firefox and WebKit |

### Skirmish soak (AI vs AI, hard, 30-minute cap)

Advance time in ms (p50 / p95 / p99); “max” includes building every player's
view, as the host does each tick. Eight matches ran in parallel.

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

## Fixed in this pass

1. **Rate limits collapse behind a reverse proxy (deployment blocker).** Every
   limit — 600 reads/min, 120 writes/min, 10 profile creations/min, socket
   upgrades and the 16/min failed-socket budget — keyed on the TCP peer. Behind
   an HTTPS proxy all players share one key, so about four players in the
   multiplayer menu exhaust the read budget, and 16 stale-token reconnects
   anywhere block every player's sockets for a minute. Loopback-only operator
   access also became reachable through a same-host proxy. New
   `-trusted-proxies` makes the host walk `X-Forwarded-For` right to left past
   listed proxies; the header is ignored from anyone else. Default behavior is
   unchanged.
2. **Hard-coded concurrency ceilings.** At most 64 lobbies (forming plus live
   matches, including each finished match's five-minute debrief) and 120 new
   profiles per hour host-wide. New `-max-lobbies` and
   `-profile-creations-per-hour` flags; defaults unchanged.
3. **Uncompressed match sockets.** Match frames are ~6.9 KB at 10 Hz. Per-message
   deflate (no context takeover, so compressors stay pooled) is now negotiated;
   measured socket traffic fell from 68.4 to 7.0 KB/s per player in the opening.
   Clients that do not offer compression are still served uncompressed.

Tests: `internal/server/trusted_proxy_test.go`,
`internal/server/socket_compression_test.go`,
`cmd/frontline/trusted_proxies_test.go`; full `internal/server` and
`cmd/frontline` suites pass.

## Open issues (not changed)

- **Pathfinding spikes in AI-heavy games.** A CPU profile of Border Depots 1v1
  puts 63% of simulation time in A* (`findNavigationRouteWithBuildContact`): a
  tick may run 12 searches of up to 32,768 expansions each, and unreachable
  goals spend the whole allowance, producing 50–120 ms ticks. The host's
  bounded catch-up keeps game speed correct, but players feel a hitch.
  Changing search limits alters deterministic results (replays, saves, WASM
  parity), so this needs its own change with hash-identity verification.
- **Stalemates.** Three of four 4-player hard-AI games and Border Depots 1v1
  produced no winner in 30 minutes; the Border Depots 1v1 also had the most
  failing path searches, suggesting AI units retrying unreachable goals.
- **Process-wide stall under the mixed run.** Five matches recorded a single
  ~0.5–0.6 s tick at once while 1,000 pollers ramped up on the same machine as
  the host. It looks like CPU or GC starvation from the co-located load
  generators rather than match logic; re-check on the real host with clients
  elsewhere.
- **Allocation rate.** Each live match allocates roughly 8 MB/s (per-player
  views copy explored/visible grids every tick), about 1 GB/s at 125 matches.
  Consider `GOMEMLIMIT` sized to the container to keep GC steady.
- **Global lobby mutex.** Match start holds the server-wide lobby lock across
  `newMatch`'s synchronous SQLite write, and lobby handlers write responses while
  holding it. Harmless at measured rates; a slow disk would serialize lobby
  traffic during bursts of match starts.
- **Matchmaking queue** is capped at 128 waiting players.
- **Late-game bandwidth** was not measured through the real API; the 500-client
  workload stays in the opening (nine actors per player).

## Sizing guidance (estimate)

Measured host CPU: ~0.56 ms per tick for an opening-phase four-player match
(about 1% of a core) and up to ~1.8 ms mean per tick for the worst AI-heavy
late game (about 4% of a core). As a starting point for a VPS, allow roughly
10–15 concurrent late-game matches per vCPU at 60% utilization, set
`-max-lobbies` accordingly, and confirm with the harnesses in
`work/load-test-2026-10-31/` on the actual machine. With compression, plan
~7 KB/s per connected player in the opening, more in large battles.
