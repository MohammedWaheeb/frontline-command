# Aircraft payload presentation correction

The original renderer could show loaded missiles while an owned aircraft with
zero Go ammunition parked, rearmed, landed, took off or displayed a final-shot
cue. The source art also toggled payload during its repeating service animation.
These are separate presentation defects; simulation service rules are unchanged.

Root's renderer change checks the current snapshot viewer and owner plus current
private ammunition, then resolves an explicit empty appearance after ordinary
pose/cue/flight selection. Missing private data is unknown. Matching animation
aliases retain canonical frame clocks, altitude and reduced-motion behavior.
Missing variants are recorded in battlefield missing-art diagnostics; old generic
art is an explicitly incomplete fallback. A new page awaiting decode cannot
reuse a prior frame across loaded/empty or viewer boundaries.

`before.log` preserves four red tests on the actual preceding ActorVisual.
`after-01.log` passes the original four; `after-02.log` adds the actual Pixi
Sprite/paintPart page-loading boundary and passes all five. These are real
renderer class tests with state-only sheets and controlled texture availability,
not claims about final sprite pixels. They cover final-round cues, structural
states, both fixed-wing and drone transition aliases, owner/viewer/private-data
changes, service interruption, restore feedback reset and missing variants.

App TypeScript (`typecheck-app-02.log`), runtime TypeScript
(`typecheck-runtime-03.log`) and all 354 runtime tests (`runtime-tests.log`) pass.
Two earlier runtime TypeScript failures are preserved: the new test helper
spread a protobuf full-message/initializer union; explicitly constructing an
initializer resolved that fixture typing issue. An independent read-only review
found no blocker. Actual Go course and native/pixel tests with completed artwork
remain pending. Mencius owns
the isolated eight-aircraft source/spec pilot; its additional 2,848 poses are
not yet a shipped or visually accepted asset set. Legacy IR strike needs its
separate lifecycle completion. No Go, version or shipping runtime change here.
