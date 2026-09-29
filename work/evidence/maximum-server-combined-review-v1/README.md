# Combined server candidate read-only review

29 September 2026. Reviewed the isolated `work/maximum-server-combined-v1` candidate, its preparation/runner, seven clean integration files and unchanged actual-actor workload. No compiler, Go test, host, browser or timing run was executed by this reviewer. `source-audit.json` records independently recomputed file hashes/inventory and exact string comparisons; `reviewed/` preserves the reviewed boundary.

**No remaining source-review blocker was found after the runner-path correction.** This permits the parent's separately authorized correctness work, not a claim of passed timing, runtime integration or release readiness. The real actor timing course still requires an explicit quiet-window dispatch.

## Found and corrected before execution

Original combined runner SHA256 `5068e5f584f77d2a99e293c34c9e30cb075edf82aacfa514b928f45933a418e5` retained its predecessor's `server-source/` and `server-source-lock.json` literals. This candidate actually contains `source/` and `source-lock.json`, so its initial guard would fail before compilation.

The owner preserved that original runner/preparer/preflight and issued runner SHA256 `0b2b1a451dd6d12a809817889d6ed4e25dbd23a62e87f237229111f22f4cf3a6`. Independent comparison confirms the runner delta is exactly the one line correcting those two paths. The preparation recipe now applies the same correction for fresh assembly. Source lock, workload, thresholds and cleanup remain unchanged. The owner also recorded AST/path checks in `author-checks.json`; this review read that evidence without rerunning it.

## Exact source scope

Source lock SHA256 `7ac31472467322e374eee42781735b2ada2ab2f062445d38097ed43681e2abd3` matches all 360 listed regular files. There are no missing, changed, extra or symlinked files; the only additional file is the previously reviewed exact `.gitignore`. Compared with the save-reuse candidate, 358 files are unchanged, `pkg/sim/navigation.go` is replaced by reviewed raster SHA256 `6a51329f420cebbff652e493409f0aa1337a03c47e12910d664008fe824732b9`, and strengthened test SHA256 `120e4b387a6f6817500b8d61b5a9d1c79617b5341b915df4b0b6ee7a658b4b8f` is added.

Against the original instrumented timing source, only `internal/server/match.go`, `pkg/sim/navigation.go` and `pkg/sim/replay.go` change; four helper/test files are added. There is no cold-profile command. The full timing test is byte-for-byte identical to original SHA256 `f014953ce8253f4684751bde42aeb2055b05c55d8f4dd1ad1870cb797b94be8a`.

The clean production inventory contains seven paths. Every candidate and baseline hash matches its advertised value. Six files equal their corresponding instrumented-source bytes; the intentional exception is clean `internal/server/match.go`. That clean file equals the original production baseline with exactly the three-line checkpoint callsite replacement. It contains no timing probe, sample type or cold-profile code. **Use these clean copies for any future guarded integration, never the annotated timing `match.go`.**

The save-reuse change keeps `Capture`'s validation, order cloning, flush/checkpoint ordering, partial failure state and errors. `CaptureCheckpoint` returns the freshly serialized save already compressed for its replay checkpoint. Compression owns separate output; the helper preserves the old independent persistence Save attempt when replay capture fails. No channel capacity, queue policy, persistence join, ticker, view filter or schema change is introduced. Its failure-path fallback is now measured inside the replay span, which must be stated when comparing component timings; the whole actor span still contains all synchronous work.

## Workload, timing and safety limits retained

The original workload still pins opening save and oracle byte hashes, requires 688 initial actors and 72 batches, stages 16 ordinary Submit batches before readiness and delivers 56 through the ordinary match request queue at recorded boundaries. It runs the actual 20Hz ticker for 600 ticks. It requires the canonical final hash, accepted results, 64 landings, 24 fired/intercepted events, four permitted perspective archives, 151 state deliveries per perspective, private-field filtering, exact save restoration, full replay and checkpoint replay, plus actual asynchronous SQLite checkpoint persistence independently reread before shutdown.

The original assertions remain exact: simulation p95 must be below 25ms and p99 below 40ms; **every** measured actor tick must be below 50ms and there must be zero skipped ticker slots. Neither the cold opening nor tick600 checkpoint is excluded. The first failed original course remains failed; no result is relabeled by this source review.

`actor_tick_ns` covers ticker dequeue through the original status broadcast and excludes requests serviced between ticks, probe collection and final artifact checks. Archive work and peer conversion/encoding/enqueue remain inside it. The real SQLite write happens in its separate persistence worker; it is recorded separately and is not falsely included as synchronous actor time. Four bounded memory sinks exercise the real permitted views, protobuf/delta path and enqueue logic; they do not prove HTTP/WebSocket latency, public authentication, advice, slow-peer backpressure, multi-match behavior or reference-hardware performance.

The corrected runner retains GOMAXPROCS1, `-p=1`, fixed selectors, compile/test timeouts, fresh non-overwriting output, initial/final exact source guards and failure-preserving receipt finalization. It kills only its own process group on timeout and waits for it. A forced kill can prevent the Go defers from finishing; that pre-existing cleanup limit remains explicit. All original inputs, raw timings and errors must be retained for the eventual real run.

## Remaining work

Combined correctness checks and a newly authorized quiet 600-tick run are still separate gates. This review neither runs them nor predicts a performance pass. Fresh resulting runtime/native bindings and eventual integration require their own source/build receipts. The static-grid invariants and strengthened test review are in `work/evidence/navigation-grid-review-v1` (checkpoints `91556e6` and `124fb96`).
