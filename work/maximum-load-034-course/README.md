# Integrated0.3.4 native and actor timing course

## Exact native result — 29 September,16:43:34–16:44:04 UTC

**The actual native executable passed all12 tests.** One compile took0.97s; the four explicit selectors, repeated three times serially, took28.28s. Parent released a coordinated quiet window after all agent browsers/hosts/native work/Blender/packing had closed. The Mac was on AC at100%; normal OS/background processes remained. This is Apple M4/16GiB, Go1.27.1, GOMAXPROCS1, GOFLAGS`-p=1`, not either Intel reference device.

Exact355-file source lock: `3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750`.
Native test binary: `5fe5ff8ce86775e2d6c42a2739d720207becb880ee2cce3a234cd8cacc9eb943`.
Source hashes rechecked before, after and in the independent audit. Production was unchanged.

| Test | p95 ms, three runs | p99 ms, three runs | Workload |
| --- | --- | --- | --- |
| `TestMaximumActorTickBudget` |4.017 /3.941 /3.857 |4.101 /4.794 /3.928 |688 steady actors;100 samples/run |
| `TestMaximumActorsMovingAndFighting` |7.509 /7.358 /7.447 |12.140 /11.549 /11.494 |688 initial actors;1200 ticks, repeated routes,3935 shots,396 survivors; instantaneous rifle hits produced no retained projectiles |
| `TestExteriorMaximumCombinedReturnsRoutesInterception` |9.707 /9.760 /9.649 |12.141 /12.020 /12.107 |688 initial actors,64 returns,332 routed scouts,24 strategic missiles/interceptions;600 ticks |
| `TestExteriorMaximum64OrdinaryReturns` |4.864 /4.862 /4.788 |5.066 /5.112 /5.041 |688 actors, all64 aircraft land at404 ticks |

Every measured p95 is strictly below25ms and p99 below40ms. These are the existing tests' **Engine.Advance spans**, not four-peer server loop, browser, final-art or long-session measurements. Existing tests retain percentile/workload log lines, not raw samples. Original dense-apron all-land tests were deliberately not selected; their known failure remains preserved.

`native-01/receipt.json` deliberately remains **failed**: after the executable exited0, `run-native.py` sliced `--- PASS:` without stripping the following space, and its final name-count assertion failed. `native-01/native-gates.log` is unchanged and contains12 PASS lines plus terminal PASS. `audit-native.py` independently verifies those exact log bytes, the executable digest, source lock and each strict numerical gate; `native-01/independent-log-audit.json` records **passed**. No rerun or relabeling of the failed wrapper was used. The original buggy wrapper is retained for provenance, not recommended for another run.

## Actual server course — 29 September,17:11:53–17:12:32 UTC

**`server-01` is a strict cadence failure.** One compile took4.28s and the one native process took34.90s; no adaptive rerun followed. All agent rendering, packing, browser, host and test jobs were held; the M4/16GiB was on AC at100%. Production source remains unchanged. The instrumented356-file lock is `4671ae3aae65169d1824a84c200cdeadfe709a6ae821f773538e2e426e20836e`, compiled binary `2eeeed103cfddc902f6ff3f08b0d8bbc2dc45432c70e8e5a8dd1410ef334bcb5`.

All600 authoritative ticks,72 accepted command batches,64 aircraft landings,24 interceptions,151 state deliveries per perspective, private-owner filtering, save restore, full replay and checkpoint replay checks passed. The final hash is `71bf256a2a95d16e3a65c39977e5d247ebcd81b3088495864806fca313beb8c1`. Actual asynchronous SQLite checkpoint persistence took11.472ms and the independently read row matched the2983528-byte save. These functional checks do not override the timing failure.

| Span | p95 ms | p99 ms | Maximum ms |
| --- | --- | --- | --- |
| Engine.Advance |16.305 |22.494 |142.362 |
| Whole measured actor tick |20.692 |26.271 |142.602 |
| Four-view archive capture |3.316 |4.051 |4.451 |
| Peer encode/enqueue |3.508 |4.554 |5.340 |

The simulation25/40ms percentile gate passed. The separate50ms cadence gate failed twice: tick2 spent142.362ms in Advance (142.602ms total), followed by one missed ticker slot; tick600 spent58.262ms total, including12.509ms Advance,3.366ms archive,28.046ms replay capture,12.335ms a second Save/enqueue and2.002ms peers. Tick2's cause is unclassified without a separate profile. The source performs a Save inside replay checkpoint capture and another immediately afterwards; reuse is a candidate optimization, not a measured improvement. No failure is excluded as a warm-up or checkpoint exception.

The original failed receipt, native log and600 raw records are immutable. `audit-server.py` verified all13 recorded artifact hashes, executable/source identity and raw overrun samples; `server-01/postrun-audit.json` reports integrity success while retaining both original statuses as failed. Full save/replay/SQLite artifacts remain locally at the receipt paths; only compact evidence is checkpointed. This is a single30-second native course with four memory protocol sinks, not a public-network/advice, multi-match, final-art/browser or Intel reference-hardware result.

## Original actual actor preparation

`server-source/` is an isolated copy of the355 locked files plus one test. Exactly one existing file differs: **`internal/server/match.go`**, with measurement insertions shown completely in `server-instrumentation.diff`. `server-source-lock.json` pins all356 files. No shipping/source lock/runtime was modified. The preparation was formatted, AST-parsed and independently reviewed before the single execution documented above.

Read these review inputs before authorizing execution:

- `prepare-server.py`: verifies the exact3d49 base; inserts only hash-guarded unique source spans; refuses existing output.
- `server-instrumentation.diff`: actual `liveMatch.run` remains the measured code. No copied imitation of the loop, simulated ticker or altered physics.
- `server_maximum_timing_test.go`: restores `work/combined-load-current/run-02/opening.json` after its fixed hash check, requires688 actors and the72-command oracle, and uses a fresh local SQLite database plus four bounded memory protocol peers.
- `run-server.py`: source verification, isolated serial compile, exact single test, process-group timeout/cleanup, immutable output names and receipt.

Sixteen ordinary Submit batches are staged before readiness; the remaining56 use the actual `match.call` request queue at the recorded80-tick boundaries. Real20Hz ticker and ordinary readiness remain. Late/missing commands must fail canonical final-hash and receipt checks, not be moved to a more convenient tick. Four peers receive the original `snapshot`/`delta`/`proto.Marshal` path. Actual emitted bytes are retained with a32MiB limit per peer (128MiB aggregate); overflow fails. The sinks are memory transport endpoints, not HTTP/WebSocket clients. Their retained bytes and probe work may affect GC/scheduling and are explicitly part of this diagnostic host environment.

Measured fields have distinct meanings:

| Field | Included span |
| --- | --- |
| `advance_ns` |Actual `Engine.Advance` only |
| `archive_ns` |Four real `PlayerView`s plus archive conversion/protobuf/gzip at normal four-tick cadence |
| `replay_checkpoint_ns` |Actual tick600 `Replay.Capture(true)`, including command packing, save and compression |
| `save_enqueue_ns` |Actual second save and bounded checkpoint-channel offer |
| `peer_encode_enqueue_ns` |Receipt/event aggregation, four-perspective snapshot/delta conversion, protobuf marshal and actual peer-queue enqueue |
| `actor_tick_ns` |Ticker dequeue through the original end-of-tick status broadcast; includes the above and remaining actor work. Excludes idle wait and requests serviced between ticks. |
| Dequeue lag / ticker gaps |Actual scheduled ticker time versus branch start and successive scheduled timestamps; command-call durations recorded separately |
| Checkpoint persistence |Actual asynchronous SQLite `CheckpointMatch` call; then independent read of the tick600 active row before normal shutdown removes it. Disk latency is not mislabeled as synchronous actor work. |

The probe stops after600 actual ticks, then permits original persistence-join and void-shutdown defers. This synthetic nonterminal workload is **not a victory or a completed multiplayer match**. Outside timing, it requires151 archive/state deliveries per perspective, no foreign private entity data,72 accepted execution receipts,64 landed aircraft,24 fired/intercepted events, final native oracle hash, save restore, full replay and checkpoint replay. All600 raw timing records and tick600 outlier remain in the report. Failure cleanup retains the stopped authoritative save and available replay/measurements.

The strict test distinguishes simulation p95<25ms/p99<40ms from whole-actor cadence: no actor branch at/over50ms and no skipped ticker slot. A checkpoint outlier must remain visible even if it does not move p99. No advice traffic, slow sockets, public authentication, HTTP/server network path, observers reading archives, match-result reward commit, multiple concurrent matches or reference-hardware claim is added.

## Proposed command and time budget

### Runner review corrections — 29 September,17:04 UTC

Einstein's read-only review (`work/evidence/maximum-server-timing-review-v1`) found two evidence-wrapper gaps, without finding a Go workload or scheduling blocker. The original runner is preserved as `run-server-before-review.py`. The successor keeps the exact compile/test commands, timeout bounds, Go instrumentation and source lock unchanged.

`runner_guard.py` now checks the complete regular-file inventory, rejects symlinks and unlisted files (including injected Go tests), and allows only the exact documented `.gitignore` bytes beyond the356 locked inputs. Initial guard failure creates a finalized failed receipt before any workload starts. Final guard failure records its own error and artifact hashes while preserving an earlier compile/workload failure; a final-only failure also causes a nonzero runner exit. Receipt writes use a temporary file and atomic replacement. A forced process timeout still cannot guarantee execution of Go deferred save/replay cleanup; the runner retains whatever files actually exist.

`test_runner_guard.py` passed six lightweight temporary-filesystem tests covering clean inventory, added/changed/missing/symlinked inputs, lock/ignore substitution, initial failure, original-error preservation and final-only drift. `runner-guard-checks.json` pins the successor, helper, tests and unchanged Go inputs; the actual source verification found356 locked files plus the one allowed ignore file. These checks did not compile Go or start a server/browser. Execution still requires independent delta review and a new explicit quiet-window dispatch.

Wait for a new explicit whole-asset quiet release. No automatic follow-up starts.

```sh
python3 work/maximum-load-034-course/run-server.py server-01 \
  --conditions 'Exact coordinated quiet window and host/power conditions supplied at dispatch'
```

One GOMAXPROCS1 compile only (`go test -c -p=1 ./internal/server`), bounded60s. One exact `TestMaximumActualServerActor600`, real30s ticker plus bounded restore/replay/artifact verification; Go timeout75s, outer80s. Expected budget is roughly40–60s with warm dependencies; maximum compile+test140s plus short inventory calls. No campaign/bot test or browser/HTTP listener runs. If preparation review or compile fails, preserve it and stop; do not spend a quiet gap improvising a different workload. Repetitions need a separate decision after this first course demonstrates valid measurement and preserved workload identity.
