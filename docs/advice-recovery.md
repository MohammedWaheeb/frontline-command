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

## Actual product fault course

The controlled Chromium **151.0.7922.34** course passed on 2026-09-28,
13:46:24–13:47:35 UTC. Evidence:
`work/multiplayer-combat/advice-recovery-2026-09-28T13-46-24.187Z/`.
The test uses a separately built current client/styles with frozen combined
0.3.4 host/WASM/protocol, a new temporary database and one browser context.
Browser plugin unavailable; the established Playwright fallback was used.
No shared runtime or host was changed.

The real DOM created a local profile and a one-human custom lobby on authored
Industrial Valley, completed asset readiness, started the ordinary 6,000-credit
opening and selected headquarters production. This deliberately short one-player
course tests recovery; it is not a combat-win matrix row or physical LAN proof.

| Actual interaction | Observed result |
|---|---|
| Inject one background HTTP 503 `advice_timeout` | Visible nonblocking retry notice; cached rig choice disabled; no global error dialog |
| Open normal operation menu | Button remains clickable; no error scrim intercepts input |
| Use normal Reconnect button | Authoritative socket replaced; tick 340→404; controls recover |
| Receive fresh real Go advice | Choice enabled and only its temporary notice cleared |
| Inject one 503 for a clicked rig production preview | Notice says order not sent; no order sent and no credits spent |
| Wait through a later automatic advice refresh | Zero automatic order retries |
| Explicitly click the rig choice again | One `train US.rig` command; Go accepts sequence 1 at tick 651; 800 credits paid |
| Let the ordinary 400-tick production job run | Two owned rigs observed by tick 1,084; 5,200 credits remain |

Both deliberately injected HTTP/console 503 errors are retained verbatim.
There were **zero additional console, page or HTTP errors**. Assertions did not
suppress errors, change server deadlines or relax the original strict multiplayer
gate. Only the temporary advisor endpoint responses were test-controlled; game
state, credits, production and timing remained Go-owned. No command API bridge
was used to place the paid order: both attempts clicked the actual production
cameo. The acceptance bridge was read-only in this course.

Native captures were inspected at 1600×900 (background failure, command failure,
paid queue) and 1280×720 (completed rig). They show usable menu/sidebar controls
and the transient notice without a modal. The long disabled-choice explanation
is cramped in its small cameo; the complete top notice remains readable. A
follow-up correction uses the concise tile reason “Options unavailable”
while retaining the full notice. Its headed Metal capture passed below; original
screenshots stay unchanged. This bounded
pass does not certify final UI/art: asset preparation reports 756 files
and 11 US roster fallbacks, listed in `browser.json`.

Source receipt: `work/multiplayer-combat/build-advice-recovery/build.json`.
Client source SHA256 is
`6a27ac9a07f2bdfd5390cc0657f6a0543f1b5ca4b067bba5ded001f3b7609d59`;
installed base-pack SHA256 is
`0ec7747fddbbe059fcc6fe81b6f592869cf870b65cab680d02498874aab9c9b5`.
Host/WASM/protocol remain the unchanged combined candidate hashes recorded there.

Two earlier **test-driver failures remain preserved**. At 13:43:50 the passive
listener incorrectly read `StateDelta.results`, aborting before fault injection.
At 13:44:31 the reduced listener omitted delta receipts, so its final receipt
assertion failed even though the real final view had 5,200 credits and two rigs.
The corrected driver uses the existing `applyDelta` reader; the full final course
passed from a fresh ordinary opening. These failures are not attributed to the
product, and the earlier genuine three-human modal failure remains failed.

Reproduction (the separate build freezes whichever current client/art is built):

```sh
FRONTLINE_COMBAT_BUILD=work/multiplayer-combat/build-advice-recovery \
  node client/tests/render/multiplayer-combat-build.mjs
FRONTLINE_COMBAT_BUILD=work/multiplayer-combat/build-advice-recovery \
FRONTLINE_COMBAT_REUSE=1 node client/tests/render/advice-recovery.browser.mjs
```

The new browser test covers Chromium only; Firefox/WebKit recovery and a fresh
three-/four-human ordinary combat run remain independent acceptance work.
The prior two clean ordinary-win matrix rows remain the only clean completed
rows; this correction does not retroactively change old failures.

## Compact label and actual hardware follow-up

The disabled production choice now uses only **Options unavailable**. Its full
explanation remains in the nonblocking notice. The focused controller test checks
the short reason and full notice independently; all five targeted tests and the
application TypeScript check pass. No retry, advisory request or gameplay behavior
changed.

The same nine-step real product course passed again in **headed Chromium 151**
at 14:15:29–14:16:14 UTC. CDP reports
`ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Version 26.5.1 (Build 25F80))`.
This is verified hardware selection, not an FPS or simulation-rate claim.
Evidence is
`work/multiplayer-combat/advice-recovery-2026-09-28T14-15-29.401Z/`:
`background-timeout.png` shows the 800-credit price and Engineering rig label
unobscured beside the concise two-line reason; `recovered-1280.png` shows the
completed second rig and 5,200 credits. Both native images were inspected.

Normal reconnect recovered tick196→200. The sole explicit retry was accepted at
tick365, sequence1; the ordinary400-tick rig job completed by the sampled tick764.
The two deliberately injected503 responses are retained, with no other console,
page or HTTP errors. The driver also asserts the exact short tile text.

A preceding compact-label run at14:14:26 passed the same functional flow but its
driver still hardcoded headless mode despite the requested environment flag.
Its original driver/report are preserved and it is **not** hardware evidence.
The final driver honors the flag, records CDP GPU metadata and rejects software
rendering for a requested headed hardware course.

The separate builder snapshots all current client source before compilation,
then combines it with the **exact earlier recovery art/runtime**; it records
each generated code file hash plus the HTML hash. Snapshot/build receipt:
`work/multiplayer-combat/build-recovery-compact/build.json`. Client source hash:
`7e68fc744ea95aaba29d6c4d880179f03e112898359fabb1adf354956dc3b0d8`.
Host, WASM and protocol hashes are unchanged. The renderer contained in that
snapshot is only functionally exercised by this sparse course; the root's
maximum-load renderer investigation is a separate, still-open gate.

```sh
node client/tests/render/advice-recovery-build.mjs
FRONTLINE_COMBAT_BUILD=work/multiplayer-combat/build-recovery-compact \
FRONTLINE_COMBAT_REUSE=1 FRONTLINE_COMBAT_HEADED=1 \
  node client/tests/render/advice-recovery.browser.mjs
```

Browser and isolated host were closed at the end of each course. Long three-/
four-human combat remains held until the renderer investigation reaches a stable
source boundary; no original failed multiplayer row is relabeled.
