# Structural states interrupt cosmetic building cues

Mencius's native art review found that ActorVisual checked a queued launch or
strategic activation before selecting current low-power and selling artwork.
Go can disclose low power while `enabled` remains true, so the former enabled
check did not prevent this misleading presentation.

The bounded fix rejects and discards the old cue when the current actor is
selling, low power, disabled, incomplete, destroyed or a damaged building. Its
ordinary pose selector then chooses the existing structural and known-charge
art. A later restoration of power cannot replay the interrupted cue; a genuinely
new event still plays. No Go state, service time, ammunition, event or information
visibility changes.

`before.log` runs the new integration tests against the exact preceding actor
source from aac90ea. Both tests fail on the original low-power priority defect.
`after.log` runs the actual corrected ActorVisual, including its real Pixi scene
objects but a state-only test sheet, without a GPU or fabricated art pixels.
Eight interruption conditions, restored power, new events, strategic activation
and generic undisclosed enemy charges pass. These are pose-selection tests,
not complete-art pixel or Go transition acceptance. Both TypeScript checks pass (`typecheck-app.log` and `typecheck-runtime.log`),
and all 349 runtime tests pass (`runtime-tests.log`). A second agent reviewed
the bounded change against aac90ea and found no issue. The prior 14 renderer
browser groups predate this change and are not claimed as a new pixel run.
