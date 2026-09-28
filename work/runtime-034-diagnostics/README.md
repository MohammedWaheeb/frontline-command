# Failure-only mission harness diagnostics

Prepared successor to the exact e4fcd239… test-driver source. The previous
SA05 Hard pilot, its source and all missing-artifact limitations are preserved;
these new files do not retrospectively supply its missing final save or view.
Only the shared authoredRun constructor/issue bookkeeping and two NEW diagnostic
test files change. No mission, simulation rule, tactic, resource, deadline or
production file changes. No long route is rerun by this task.

Cleanup is registered before constructor file loading. A failed tutorial,
campaign, optional or representative mission-path leaf writes a unique directory
with the available final authoritative save, owner 1 view, completed
submitted-command/receipt ledger, in-flight attempted batch and a manifest of
actual artifact hashes/errors. An early setup failure without a live engine
writes an explicit state-unavailable manifest. It never fabricates an outcome,
replays/advances the engine, issues an order, or calls Fatal recursively.

In-flight bookkeeping preserves rejected submissions and all available receipts
before the original first-rejection fatal. It does not move the original failure
boundary or convert a rejected order into an accepted command. Successful leaves
and runs without FRONTLINE_MISSION_EVIDENCE do not emit failure directories.
Unique directories preserve prior artifacts instead of overwriting them.

`fatal-audit.json` distinguishes the 80 fatal callsites in the shared tutorial,
campaign, optional and representative-path harness from independent skirmish,
depot and AI inspection tests that do not use authoredRun. Whole-process kills,
os.Exit and global Go-test timeout can bypass testing.T.Cleanup; prior incremental
logs/checkpoints remain necessary. This bounded change does not promise evidence
from a process that the runtime cannot clean up.

Seven explicit subprocess probes passed on 2026-09-28 at 16:18 UTC: direct driver fatal, helper fatal,
failed submission, failed execution receipt with a later accepted order in the same batch, pre-engine setup failure, successful
leaf and disabled diagnostics. They verify the actual child exits as failed when
required, exact saved-state restore, owner-view equality, full known command
ledger and unchanged post-cleanup state. These are harness tests, never mission
completion proofs. The explicit probe run is `runs/20260928T161842Z`: 1.70 seconds inside Go (3.467 seconds process elapsed), after an 8.38-second compile. The live four-human host and its replay audit were closed; this is correctness evidence, not a quiet-host benchmark.

The source lock is `9313438021d25fe211e214b50d516c3ee4b5827c8cf90148663a09f141042aa3`; the test executable hash is `8791a92ca420ab997ca3bc7c9943299f716b336de9ea5367ae5ede3840f04edb`. All source files were rehashed after execution. Direct/helper/submission failures preserve tick 101; the rejected-plus-accepted batch preserves tick 102. Setup failure records no available state. Success and disabled cases produce no failure artifact directory. Actual child failure logs and artifact hash manifests are retained. Full test saves/views stay in workspace evidence; they are not ordinary gameplay completion proofs.
