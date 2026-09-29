# Full-App cold offline driver review

Read-only review of `work/full-app-offline-v3/runner.mjs` and its actual `stock-browser/observe.mjs`, captured in `source-lock.json`. No product or running driver changed and no browser launched. The root run remains its own evidence.

## Concrete acceptance gaps

1. **Post-close diagnostic errors do not recompute acceptance.** The driver sets functional/status and asserts diagnostic arrays before its final `context.close()`. The still-attached page event handlers can append request/page/console/HTTP errors during close, yet `finally` merely saves the existing status. A late first error can leave `passed` in a receipt containing an error. Reconcile the accumulated arrays after all context/server closures, preserve functional outcome independently, and make any unexpected final diagnostic fail the strict result. A deterministic event-emitter test can append a failure from the close promise and require a failed final status; do not merely increase sleeps.

2. **Online worker observer errors and overflow are discarded at cold restart.** Only the final cold page's `__stockQA.read(true)` is retained/asserted. `observe.mjs` records Go `event:error`, rejected RPC replies, worker errors, decode errors and bounded-observer overflow independently of Playwright page errors. The first document is destroyed after pack installation without preserving/asserting those fields. Therefore an online worker error can be omitted even if later ordinary operations finish. Capture and validate the first observation before the first `context.close()`, retain both observations with phase labels, and keep browser diagnostics through close. A source-specific negative test should put a runtime/RPC error into the online observation while leaving the cold observation clean; overall strict acceptance must fail.

3. **Changed-input failure can bypass the final receipt and profile cleanup.** The `finally` loop directly asserts every pin before the final `save()` and `rm(profile)`. If an input mutates, the assertion escapes after browser closure, leaving the earlier report status and profile directory. Record verification exceptions as failure data, save in a nested finally, and independently remove the owned profile even when pin verification fails. Preserve original receipt/errors; do not overwrite them with only cleanup failure text.

## Boundaries that appear sound

The driver reads real frozen product bytes and verifies every served file against the pack. It separately hashes every cached declared file and checks expected entry counts. It closes the HTTP server, terminates the first browser, opens a fresh browser over the same isolated persistent profile with offline networking, and checks `navigator.onLine===false`. The cold course uses ordinary Load and replay controls with actual Go replies/recorded hash and endpoint checks. This is a meaningful cold-offline proof, distinct from an already-running online application.

No current multiplayer, physical LAN, long-session, final art, actual audio playback or full codec proof follows from this course. Raw request failures remain explicitly strict, not inferred benign from accepted pack hashing. The observer intentionally captures download blobs without native OS download dispatch; no actual downloaded-file save-dialog claim is made.

This review identifies driver acceptance/receipt risks. It does not establish a new production defect or rewrite any failed prior run.
