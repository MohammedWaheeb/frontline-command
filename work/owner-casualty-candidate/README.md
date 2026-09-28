# Owner casualty disclosure candidate

This is an isolated, reviewed presentation correction on frozen combined0.3.4.
Shipping0.3.3 and the original combined mission/multiplayer source are unchanged.

## Defect and correction

An ordinary covered rifle duel loses player1's only local sight provider at
tick280. Cleanup already emits the exact `destroyed` event, but the subsequent
fog update hides that position. The original visible-scope filter then suppresses
the owner's own loss notification. Disappearance alone must never be treated as
death by the client.

The only production change is in `source/pkg/sim/visibility.go`: within visible
scope, `destroyed` with exact event-time `Owner == perspective` is also admitted.
Allied and enemy casualties still require current sight. Other scopes, weapon
and impact visibility, target redaction and combat sanitization are unchanged.
The event does not disclose an attacker, weapon, cause or hidden victim.

Base source lock: `ed50966897139f973e143ba0f83c9776849b6d7924839c228238e7dc1370ed20`.
Candidate source lock: `41c59cfa40a66db698a9ea237bff20ea201a44147fbfb0e0e274e61246b6c229`.
The diff is exactly one production file and three added test files. Boole's
independent read-only review verified every locked file and found no blocker.

## Verification

- Four baseline regressions fail: ownership/fog filtering, ordinary last-sight
  duel, captured-building event-time ownership, and airborne passenger losses.
- Fixed native and WASM suites pass, including existing combat/privacy tests.
  Eighteen JSON/save artifacts are byte-identical across platforms.
- The original and fixed ordinary duel saves are byte-identical. Tick280 hash is
  `be7b93a50d7239f7e25d17741c9fd30d27a467d0dec95aa51f659b8f944546b7`;
  tick360 continuation is
  `5db2bae3b4a3d6190f3d68d592d37a188b5c41cb13cdae00b81fe89fa04f1e8f`.
  Both restore and full initial-state replay match and continue identically.
- Actual event-bearing saves pass host and WASM protobuf round trips with
  byte-identical per-perspective wire digests. No handwritten casualty frame is
  used for this codec check.
- Focused race suite passes in21.753seconds; sim/host/adapter vet passes.
- Strict browser-fixture TypeScript check passes after preserving the initial
  stale-shipping-protocol type error and using an optional-property guard.

`parity.json`, `*-tests*.log`, `*-codec.{log,json}`, `focused-race.log`, `vet.log`
and `runtime-build-receipt.json` hold the exact results. The runtime remains
simulation0.3.4: this change affects projection only, not serialized state or
mechanics. Its isolated WASM SHA is
`904cf94850efa20d5d3538c19002c621fe08393e33d942d66836fa830708f9f8`.

## Browser course

The real OfflineTransport, Go WASM, production BattlefieldRenderer and production
AudioDirector run the ordinary duel without adding a surviving vision source.
The expected loss arrives with its tile no longer visible, exactly one
`vo.announcer.US.unit_lost` dispatch and `Unit lost` caption, no repeated dispatch
on a duplicate frame, and identical restore hash. A recording mixer observes
dispatch; this is not audible listening/mix approval. The prior full combat course
also runs, with real Go covered/landed/source/decoy/interception/replay/reset cases.
Browser plugin not available; installed Playwright is the recorded fallback.

Chromium151, Firefox153 and WebKit26.5 all pass. Completed report digests,
runtime/bundle hashes and exact loss dispatch counts are in `browser-summary.json`.
The first Chromium attempt completed assertions but its report writer rejected
a raw protobuf bigint; that failed harness log and captures remain preserved.
The corrected runner returns only the inspected casualty fields. Results are
under `browser/`; do not infer browser success without its completed report.

Reproduce from `client/` with `FRONTLINE_COMBAT_CANDIDATE=work/owner-casualty-candidate`,
`FRONTLINE_OWNER_CASUALTY=1`, an unused `FRONTLINE_COMBAT_EVIDENCE` directory,
and `node tests/render/combat-browser.mjs`. Set `FRONTLINE_COMBAT_BROWSER` to
`firefox` or `webkit` for the other engines. The runtime builder verifies every
source-lock entry and only writes inside this candidate.

The earlier airborne test first used a landed carrier, whose surviving passengers
correctly kept sight. That fixture failure is preserved separately; the corrected
bounded fixture explicitly selects airborne transport loss. Production transport
rules were not edited. New artillery outcomes, fog inference, art completion,
mission completion and release acceptance are outside this correction.
