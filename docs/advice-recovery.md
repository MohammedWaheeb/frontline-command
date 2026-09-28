# Recoverable command-advice failures

Status: source and controller-unit regression complete; controlled product-browser
recovery verification is pending the coordinated quiet window. The incomplete
three-human match has not been relabeled as an ordinary combat pass.

## Observed failure

The frozen combined 0.3.4 three-human FFA ran from 13:00:18 to 13:28:51 UTC on
2026-09-28 while other rendering, native and asset jobs shared the machine. Final
authorized views were ticks 3,908–3,920, with all three commanders alive and no
outcome. The original failure evidence is retained at
`work/multiplayer-combat/2026-09-28T12-40-48.386Z/`.

The final browser report records 53 HTTP 503 responses on the match's `/advice`
route: 28 `advice_unavailable`, four `advice_timeout`, and 21 whose bodies the
browser protocol could no longer return. There were no captured HTTP 429 rate
rejections, JavaScript page exceptions or passive-decoder errors. The earlier
two-human run's single unlocated 503 remains separately unknown.

`3h-failure-1.png` shows an actual **Command interrupted** modal saying “Command
advice timed out.” Its scrim intercepted the planned reconnect-menu click until
the ordinary 90-second action timeout. The driver then closed its contexts and
host. Four-human testing did not start. This is a real recoverable-error UI
defect observed under load, not a combat loss or completed playthrough.

## Cause and scope

The frozen server allows a two-second request context. HTTP 503 with
`advice_unavailable` means the actor call was canceled or exceeded that deadline;
ordinary invalid selections return HTTP 400. `advice_timeout` means the request
deadline expired before or after the separate saved-state preview. The client
has a four-second abort deadline. These budgets and server gates are unchanged.

The observed codes and severe machine scheduling/memory pressure support a
time-budget failure. They do not establish a precise allocation of time between
actor queue, serialization, preview work and scheduling, because the original
run did not instrument those phases. No rate-limit relaxation is justified by
these observations. The dispatch-spacing regression remains independently tested.

The background controller previously ignored `advice_unavailable`, but forwarded
`advice_timeout`, `advice_busy` and `advice_rate_exceeded` to the global error
dialog. Optional background refresh thus blocked unrelated user controls.

## Correction

`app/advice-feedback.ts` recognizes only explicit recoverable advisor codes.
Background failures use the existing nonblocking notice, disable cached
production availability with an explanation, and retry through the existing
three-second snapshot-driven refresh. Fresh authoritative advice replaces those
entries and clears only this controller's own matching notice. Unrelated save or
order notifications are preserved, and repeated failures do not repeatedly open
or reset a notice.

An explicit order whose advice fails reports that the order was not sent. No
automatic order retry, fabricated legality, changed resource state or altered
simulation timing is introduced. A subsequent user action must request advice
and submit normally. Unknown errors, malformed replies, authentication failures
and explicitly nonrecoverable failures retain the existing error path.

HTTP responses and console diagnostics are not suppressed. The strict ordinary
combat browser gate remains unchanged; a controlled fault test must explicitly
record its injected 503 rather than call that a clean network run.

## Verification

Five tests exercise the actual controller and the pure error policy: timeout to
nonmodal state, production disabled/recovered, unrelated notices preserved,
obsolete selection response ignored, unrelated errors retained, and failed
explicit orders never automatically resubmitted. Both TypeScript checks and all
339 current runtime tests pass. Logs are `work/multiplayer-combat/advice-recovery-*`.

The remaining product test must inject one known advisory response, inspect the
real notice and absence of the global modal, use pause/reconnect controls, restore
successful advice, and submit a real ordinary order. It must preserve the
original multiplayer failure, use an isolated host/build, and make no load or
complete-matrix claim.
