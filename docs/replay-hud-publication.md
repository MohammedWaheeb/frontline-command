# Replay final snapshot publication

The v21 WebKit clarity run at `work/battlefield-clarity/webkit-02` failed in its
second case, 1600×900 at 150% interface scale: after pressing End on the replay
timeline, the paused UI remained at `00:06 / 00:09`. The original run, driver,
screenshots and report are unchanged. The first 100% case passed at tick 189.
The second case recorded one `seekReplay` request and a paused, nonstalled clock,
with zero page, console, HTTP or request failures. Its trace counted requests
but did not retain seek arguments or reply ticks, so it cannot establish the
exact requested/returned tick of that failed browser attempt.

## Confirmed source defect

The Application published React snapshots only when more than 100 ms had passed
since the previous publication, or when the game outcome was finished. A replay
seek can return its one final frame within that interval and pause immediately.
The transport and battlefield receive it, but the HUD can discard it forever
because no later frame follows. The ReplayDock then clears its temporary slider
position after the seek reply and displays the older `state.snapshot.tick`.
A replay reaching its end does not necessarily have a finished game outcome.

The same defect affects rapid load/session replacement, perspective changes and
the final frame before a normal pause. A deterministic test invokes the actual
Application event handler and Observable with a controlled monotonic clock;
only external devices/subscribers are replaced. Before the fix, six of eight
tests fail, including tick 189 arriving one millisecond after a published tick
126. This confirms a client publication defect independently of the original
browser's unrecorded seek argument; it is not evidence of a Go replay failure.

## Bounded change

The Application keeps the latest already-authorized snapshot for the active
session. Session changes clear that reference and force the first publication.
The existing `presentation-reset` boundary forces the next snapshot; the runtime
already repeats that boundary before each frame while a replacement is pending.
Paused clocks/status updates flush the latest frame, and frames received while
paused publish immediately. Ordinary running frames retain the 100 ms HUD
throttle and every frame still reaches the battlefield. No snapshot fields,
orders, timing rules, replay inputs or privacy policy change.

The event handler was moved into a private method so the regression runs the
production routing directly without constructing a browser, renderer, storage,
audio device or worker. Existing human-readable order-rejection labels remain
unchanged.

The clarity driver now passively records timeline key/input events, ordinary
seek target ticks and authoritative reply ticks. It still presses End through
the real control and keeps the original timeout. A pass also requires the
request and successful reply to match the timeline's actual maximum. No input,
RPC, worker state or response is injected or rewritten.

## Evidence and remaining gate

`work/evidence/replay-hud-publication/red.log` has six failures and two passes;
`green.log` has eight passes. Coverage includes replacement frames queued before
the final seek, pause/status flushing, load and owner/perspective changes,
ordinary throttling, menu/buffering isolation and a terminal outcome. Both app
and runtime TypeScript checks pass; the browser driver syntax check passes.
An initial test-runner dependency-resolution failure is preserved separately
as `test-runner-missing-modules.log`, not counted as a product failure.

The original v21 browser failure remains failed. A fresh frozen product and
actual WebKit replay rerun with target/reply diagnostics are still required;
there was no browser or host launched by this diagnosis lane.

## Fresh actual WebKit confirmation

Frozen v22 (`work/art/effects-opus-v2/integration-v22/build.json`) passes all eight actual-App cases in `work/battlefield-clarity/webkit-03`, including the earlier1600×900/150% failure configuration. Each normal End-key request and authoritative seek reply equals its actual timeline maximum. All page/console/HTTP/request diagnostics and frozen-source changes are zero. The full runtime suite now passes405 tests. The originalv21 WebKit02 remains failed, and the fresh result does not reconstruct its missing target/reply trace. Later minimap readiness and label-fit changes are separate, still awaiting their own freeze.
