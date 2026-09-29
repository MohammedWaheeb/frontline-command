# Independent server timing harness review

29 September 2026. **Static review only; the reviewed server course is UNRUN.** No Go compilation, native test, browser, host, or gameplay execution was performed. No production or harness source was edited by this review.

The reviewed boundary is checkpoint `6485a66`, private source lock `4671ae3aae65169d1824a84c200cdeadfe709a6ae821f773538e2e426e20836e`, derived from integrated 0.3.4 lock `3d49f3c0a344c4573d003e00768994e5a97b88b0ddff3a035ccd7febf0053750`. `source-audit.json` pins every review input and records the independent inventory/hash check. All 356 locked files match; the sole unlisted file is the preparer's `.gitignore`. Relative to the 355-file base, exactly `internal/server/match.go` changes and `internal/server/server_maximum_timing_test.go` is added.

The actual loop, physics, readiness, request queue, archive conversion, peer encoding and asynchronous persistence are preserved. No production semantic blocker was found. **Resolve the two runner evidence gaps below in a separate successor before relying on its first timing result.** This review establishes neither a timing pass nor real-network acceptance.

## Findings requiring correction

### R1 — Verification failures can prevent final evidence from being written

`work/maximum-load-034-course/run-server.py:13` calls initial `verify()` before the report and `try` exist. The first statement in `finally` at line 40 calls it again. A missing/drifted source at startup therefore leaves a newly created output directory without a receipt. Drift detected after a stage can raise before artifact hashing/final receipt save, leaving a stale `running` receipt even if the process failed. A final verification exception can also replace the original compile/test failure.

Create and save the receipt before verification, record initial/final verification outcomes independently, and always attempt failure finalization while preserving the original failure. A source mismatch must remain a strict failure. Suggested bounded regression: use an isolated disposable copy with one modified listed file before launch, and another with a controlled modification before finalization; both should preserve a failed receipt, exact offending path and available log digests. No such mutation or test was performed here.

### R2 — Known-file hash checking does not close the compilation inventory

`run-server.py:11–12` verifies listed paths but never compares the actual directory inventory. Adding an unlisted `.go` or `_test.go` file can change compilation, initialization or the selected test while all listed hashes still pass. The independent inventory in this review finds **no such extra source now**; only `.gitignore` is extra.

Reject unlisted build inputs, preferably using exact inventory with an explicit allowance for that known `.gitignore`. Check both before compilation and after the run. Suggested bounded regression: an isolated extra `_test.go` must fail verification before the compiler is launched. This is a future guard failure, not evidence that the frozen reviewed source was contaminated.

## What the source supports

- The preparer verifies the exact base-lock digest, hashes every copied input and requires unique insertion spans. The full instrumentation diff contains timing/probe calls and a test-only return at tick 600; it does not replace the production loop or alter orders/state.
- The test restores the exact opening save and checks both input file digests. Its oracle contains 72 batches and 72 orders: 16 submitted at tick 0, then eight at each of 80, 160, 240, 320, 400, 480 and 560. The later 56 use real `match.call` requests. Four actual `connect` requests exercise ordinary readiness.
- The native canonical hash checks exact scheduling, not merely eventual positions: `Engine.Hash` marshals the complete State; State includes `Log`; `Submit` stores the next execution tick; `executePending` retains each `Scheduled.Tick`. The opening log is empty and 72 orders are well below the 32,768-order pruning threshold. Late accepted requests would change the retained log and fail the final oracle hash.
- `time.NewTicker(time.Second / 20)` and the ordinary select loop remain. There must be 600 advancing rows, authoritative ticks 1 through 600, no actor branch at or above 50 ms, no skipped scheduled ticker slot, and strict Advance p95 below 25 ms/p99 below 40 ms. These assertions have not yet executed.
- `archive.capture` produces four permitted views every tick and performs its original protobuf/gzip work at the four-tick cadence. The test requires 151 archived frames for each of four perspectives. Four memory sinks inspect bytes from the original snapshot/delta/protobuf send path, checking baseline ticks, owner perspective, absence of foreign entity private data, protocol errors, 151 state deliveries and final tick 600.
- Tick 600 retains the actual replay capture/save/compression, a second engine save and the bounded checkpoint-channel offer. The persistence worker invokes the real SQLite `CheckpointMatch`. A separate query checks the exact active-row tick and data hash after that call. Its timing covers the write only; the independent read is outside that span.
- The production defer order joins the checkpoint writer before normal void shutdown deletes the active row. The probe therefore checks the persisted row before deletion. The test waits for `match.done` before reading the writer's checkpoint result and clears the shared probe only after closure.
- Success requires the real final save to restore to the native hash, full replay from tick 0 to reproduce it and checkpoint seek to tick 600 to match. It also requires 64 landed aircraft, 24 interceptor-fired events and 24 missile-intercepted events, plus 72 accepted result identities.

## Measurement and lifecycle limits

The four peers are bounded **in-memory transport endpoints**, not WebSocket clients. No TCP/TLS, HTTP authentication, socket writing, slow-client behavior, advice, observers reading archives, co-op checkpoint, completed victory/reward transaction, multiple concurrent matches or reference-hardware result is established. This is an intentionally nonterminal 600-tick workload followed by ordinary void shutdown.

`actor_tick_ns` measures ticker-branch work through the end-of-tick status broadcast. It includes replay checkpoint generation/save enqueue at tick 600, but excludes asynchronous SQLite checkpoint latency, idle wait and requests serviced between ticks. The SQLite duration, request durations and ticker dequeue lag are separate. Probe collection occurs after the timed span; its CPU/GC effects and retained wire bytes remain co-resident and can influence scheduling. The 32 MiB-per-peer capture bounds at most 128 MiB of retained payload, in addition to slice/engine/archive/report overhead.

The test inspects actual emitted envelopes, but does not reconstruct every delta into a full public state and compare all fields with the native oracle. Archive assertions count frames rather than decoding every stored archive payload. These are scope limits, not a reason to call the measured path an imitation.

On normal test assertion/context failure, deferred cleanup closes the actor and repository and attempts to preserve rows, checkpoint results, stopped save and any captured replay. Go's fatal test timeout or an external SIGKILL cannot execute those defers; only already written files/process logs can survive. The outer runner kills and joins its own process group on timeout. Its current stage helper does not append a completed stage record when `wait` raises; the available stage log can still be retained by a corrected failure-safe finalizer. Do not claim authoritative save/replay preservation after an ungraceful kill.

The Go test currently ignores errors writing its final JSON/deferred diagnostic saves. A missing report prevents outer success, and explicit final save/replay writes are checked, so this does not create a false PASS; it does limit failure diagnostics on disk exhaustion. Future preservation improvements should record those errors explicitly.

## Handoff

R1/R2 and the positive scope review were sent directly to the harness owner and parent. The immutable reviewed v1 inputs remain unchanged. The owner should publish a separately pinned runner successor, retain this unrun v1 boundary, and obtain the already planned quiet-window release before any compile/course. No extra browser or broad matrix is requested.
