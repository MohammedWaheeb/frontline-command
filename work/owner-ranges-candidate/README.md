# Owner range and missile-defense presentation candidate

Reviewed isolated Go candidate; **not shipping**. Based on owner-casualty lock
`41c59cfa40a66db698a9ea237bff20ea201a44147fbfb0e0e274e61246b6c229`.
Current350-file lock `d5dd52ff9d3e338d5e5fd40b5663630d5f7398cec4cbcbc31120b12c0606797c`; WASM
`f6102c94f95723b5fa770cdc0f6b74f35efef8338d9304e072fc93a18b72528d`.
Root owns this candidate and the separate frontend range/status integration.
The original combined mission/multiplayer source and shipping0.3.3 remain unchanged.

## Contract

Design8.2 requires owner coverage, charges, next-charge time and assignments.
Go now exports optional exact-owner-private ranges: effective sight/detection
bounds, construction-anchor radius and actual interceptor coverage/capacity/
current-rate recharge estimate/fire readiness/assigned public impact IDs.
Execution and projection share the same functions. No new firing, obstruction,
resource, timing, targeting, save-state or ownership rule is introduced.
Ground sight/detection remain limited by terrain line of sight. Recharge time
changes with current power/activity/buffs; the client never simulates it.
Assignments identify existing Go reservations and public impact warnings, never
invented trajectories, hidden launchers or nearby-event guesses. Older runtime
frames retain absent metadata and display no guessed radius or capacity.

## Backend evidence

- Eight unchanged initial courses,1,000 ordinary ticks each:54 full-state hash
  checkpoints/course match the owner-casualty baseline byte for byte.
- Eight recharge cases verify exact ordinary ticks: fixed480, low960, shield240,
  low+shield480; mobile600, mobile+low600, upgraded500, upgraded+shield250.
- Disabled, powered-off, construction, packed, full and partial magazines;
  actual earliest-impact reservation/expiry; owner/enemy/ally privacy; detached
  nested values; height/relay/detection/contained sight and exact build boundary.
-41 native/WASM artifacts (including15 exact restorable saves) match byte for
  byte. Thirty actual-save host/WASM protobuf records match; optional deadline
  presence, absent legacy metadata and state immutability are asserted.
- Full short Go suite passes (sim191.422s/server25.085s/adapter3.847s, concurrent
  machine load; these are correctness timings, not performance claims).
- Focused short race49.273s and vet pass. The first broad race expression also
  selected maximum-load/authored acceptance tests and was deliberately
  interrupted after547.781s; preserve its failed/interrupted log. It is not
  claimed as a passing maximum-load race run.
- Independent review: `../runtime-034-candidate/owner-ranges-review.md`.

## Product evidence and remaining gate

Actual Go saves, the unchanged App and real status controls pass all15 cases
in Chromium151 and WebKit26.5, including DOM save import, exact reload/pause,
assignment expiry/rewind, save/replay hashes, foreign privacy and1280/1600px at
100%/150%. The150% readout scrolls to its final field-range section and retains
keyboard focus/Enter/Escape behavior. An actual older0.3.4 runtime passes the
absent-range fallback course in Chromium. WebKit mouse activation exposed a
focus-return defect; the status trigger now explicitly focuses before opening.

Firefox153 passes the same functional assertions, but two runs report a pressed
button PNG decode error. The original runs remain **failed**;
the intermittent decoder message has not been reproduced in the follow-up. All observed image responses are the
same valid2734-byte PNG; do not silently ignore the console error. Its clean
intermediate run stopped on an incorrect harness scroll-container assertion.
The harness was corrected to scroll the actual modal. All first attempts remain.

Einstein checkpoint ebe1569 adds four clean Firefox153 contexts using the same
actual15-case product course. Both cold and test-only retained-image runs pass;
the extended pair adds150 modal cycles each. Every pressed-image response is
byte-exact. Retention changes resource counts but does not establish a cause or
cure. No speculative preload or suppression was added. See
[the bounded investigation](../../docs/button-image-lifecycle.md). Final packaged
three-browser acceptance remains required.

The readout uses warm console styling, an owned missile coverage ring and an
assignment marker at the actual public impact point. No fictional interceptor
flight path is drawn. Production artwork remains incomplete; screenshots using
procedural buildings are UI/logic evidence only.

## Fixture corrections retained

The first low-power mobile fixture had exactly balanced40/40 power; a third
radar creates the intended real shortage. No game rule changed. First exported
save fixtures were accidentally pretty-printed through JSON raw messages,
invalidating exact embedded-state checksums; `first-indented-save-exports/`
retains them. Export now writes exact Go save bytes and asserts Restore/hash
before every export. Production save code was untouched.

`reviewed-delta.patch` carries the isolated delta, including generated protocol
bindings and meaningful regression tests. Runtime build verifies every locked
source byte before and after; shipping runtime was not overwritten.
