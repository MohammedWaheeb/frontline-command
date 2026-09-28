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
found no blocker. Mencius owns
the isolated eight-aircraft source/spec pilot; its additional 2,848 poses are
not yet a shipped or visually accepted asset set. Legacy IR strike needs its
separate lifecycle completion. No Go, version or shipping runtime change here.

## Actual Go course

`prepare-course.py` verifies every one of the 356 frozen navigation-candidate
source files and adds only `aircraft_payload_course_test.go`. This uses prepared
infrastructure and one remaining round as explicit fixture grants. All later
changes use normal Submit/Advance: attack, Return, power off, sell, emergency
departure and service at a backup base. It makes no paid-opening claim.

`go-run-01` retains the first complete evidence. IR gunship passes; US fighter
stops at backup service because its prepared foreign observer is just outside
the fog grid's visible cells. Its exact failed state/source remain. The second
run moves only the initial foreign scout positions closer. No simulation rule,
combat deadline, service clock, ammunition or post-initial world state is edited.

`go-run-02` passes both actual courses, ten boundary saves each and exact owner
and foreign views after restore and replay. The foreign viewer actually sees the
aircraft at every boundary and receives no private ammunition. Final states are:

| Aircraft | Tick | State hash |
| --- | --- | --- |
| US fighter | 806 | d5a4486c16e1b6674a6af0b0d71d76c4a3e70655eb243e006c1dbc11da6a247c |
| IR gunship | 1085 | 1c7c20cc32c389dfa7e388cbc41cf31430c42eb18c362a8bd44c43de5371d705 |

`check-go-course.mjs` decodes those emitted views through the actual protobuf
binding and ActorVisual with the proposed source-spec state declarations. All
40 owner/foreign pose and feedback-reset checks pass. Exact candidate specs and
their hashes are retained alongside the report. These checks exercise real Go
ammunition/service/visibility; they do not use completed sprite pixels. Full
native and browser artwork acceptance remains open. Each run's `artifacts.json`
records its source, snapshots, replay and report hashes.
