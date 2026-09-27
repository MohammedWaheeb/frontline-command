# Implementation and release evidence

Last updated: 2026-09-27. No finished-game claim is made.

## External blockers

- Authentication restored by user. Actual model `claude-opus-5-5` verified in
  CLI modelUsage. CLI updated from 2.1.215 to 2.1.283. Fallback disabled.
- On 2026-09-27 at approximately 20:20 Qatar, both Claude assignments hit the
  session limit. CLI reports reset **2026-09-28 00:20 Asia/Qatar**. Resume exact
  model only; do not use another author/model for any frontend/assets.
- Assignment 01 session: `0e069b60-b079-4236-b1c3-1b2f282f32dc`; partial original
  Blender sprite sources/renders and concept tooling exist. Review incomplete.
- Assignment 02 session: `380d9ca3-cd86-4f8b-9925-0a8beb753320`; partial browser
  runtime/WASM work exists. Review incomplete. No finished frontend assignment.
- Logs: `work/claude/01-stream.jsonl`, `02-stream.jsonl`. Both reported only
  `claude-opus-5-5`. Keep credentials out of evidence and screenshots.

## Milestones

| Stage | Status | Evidence / remaining work |
|---|---|---|
| 0 Foundation | In progress | Go 1.27.1 and protoc 36.2 installed, Git initialized, exact Claude model confirmed; browser connection pending |
| 1 Simulation | In progress | Catalog, engine and core regression tests exist; full-match/path/performance acceptance still pending |
| 2 First complete match | Not complete | Browser, full playable journey and multiplayer verification pending |
| 3 Four factions | Not complete | All special mechanics and scenario evidence required |
| 4 Services | In progress | Local profiles, lobbies, binary sockets, SQLite and save contracts tested; remaining services/acceptance pending |
| 5 Content/editor | Not complete | Eight maps, five tutorials, 24 missions and two co-op scenarios required |
| 6 Presentation/balance | Not complete | All art/audio/accessibility and real gameplay evidence required |
| 7 Local release | Not complete | Browser/platform, performance, security and packaging gates required |

## Verification policy

Tests must record observed results. Design arithmetic is not gameplay evidence.
Content counts alone are not implemented mechanics. A successful compile is not
a browser playtest. Native performance is not evidence for reference laptops.
Human matchup samples and unavailable browser/hardware checks stay unverified
until actually performed. Track exact unresolved items here after each stage.

## Observed backend evidence so far

- `go test ./...` and `go test -race ./...` passed before subsequent mission
  additions; rerun after integrating current changes.
- Catalog: 75 roster units, 28 weapons, 19 building types, 10 upgrades. This is
  data coverage, not proof every mechanic is complete.
- Save/restore and replay seek hash equality; ownership, duplicate sequences,
  fog filtering, queue payments/refunds, prerequisite loss, low-power work,
  extraction limit/cargo loss, collision, target layers, simultaneous damage,
  finite interception, paid repairs, elimination, concealment and emergency
  aircraft loss have regression tests.
- Two real WebSocket clients joined one private lobby, negotiated the binary
  protocol and received distinct fog-filtered snapshots. Unauthorized entity
  commands were rejected. This is a service test, not a browser playthrough.
- SQLite tests cover owner isolation, conflicting revisions, concurrent result
  idempotence, backup restoration, map ownership and atomic file writes.
- A six-minute headless AI economic scenario initially failed (builder approach
  geometry and hauler navigation). Fixes improved it to a passing economy test.
  Income and remaining route congestion need further review. No balanced match
  claim is made.

## Active implementation gaps (not exhaustive)

- Browser UI and map editor not integrated; no shipping map/mission accepted.
- Art/concepts/runtime assignments interrupted by Claude session quota.
- Native/WASM parity and browser acceptance pending.
- Navigation needs choke/producer/transport/stress tests and further recovery
  work; production goals must not induce permanent oscillation.
- Queued transport behavior, emergency unloading, strategic-operation edge
  cases and scenario validation still need work.
- Bounded mission schema/runtime is being added; objective views, campaign
  difficulty/end-to-end coverage and all authored mission content pending.
- Matchmaking, local ratings, reports review, pause coordination and durable
  lobby recovery remain pending; the implemented service journeys still require
  browser integration and end-to-end acceptance.
- Corrupt-state structural validation and security fuzzing need expansion.
- Build/doctor/dev/play/LAN packaging targets and future deployment docs pending.
- Full art/audio, accessibility, browser matrix, 688-actor performance, long
  matches, human playtest samples and final release candidate remain unverified.

## Further backend work on 2026-09-27

Implemented and covered by targeted tests:

- Salvage enemy-kill eligibility, approach/channel, single collection, rolling
  minute and match caps, expiry, friendly-kill exclusion.
- Garrison firing and building unload; embarked units cannot cast abilities.
- Integer heading/turret rotation and fixed-wing passes; movement/shot behavior
  and save/reload determinism tested.
- Endgame minimap indicators with no firing vision or hidden entity IDs.
- Mission/objective views, permitted warning zones and visible salvage in
  protobuf; TypeScript regeneration remains assigned to Claude.
- Compressed replay export/import and completed-result download restrictions.
- Lobby update atomicity, host transfer, player-slot reuse, FFA teams, HTTP
  admission limits and reconnect-expiry handling.
- Delayed perspective observer buffers, private live-observer option, ticket
  authorization and removal of eliminated players from the live feed.
- Local social relations, team chat with fixed recipients, mute/block delivery,
  and revision-checked settings storage.
- Exclusive host data lock, asynchronous checkpoint persistence, forced-process
  exit recovery, diagnostic save preservation and idempotent void results.

Observed checks: targeted gameplay/service/storage tests and `go vet ./...`
passed. The extended native suite passed. A full race-instrumented run completed
functional tests but failed the steady-state time-budget assertion (p95 39.3 ms)
under instrumentation. Performance gates now run without race instrumentation;
latest short race suite is still to be rerun after the latest service additions.
The 688-actor moving/combat workload and target-hardware performance are pending.

Remaining work includes strategic-operation regressions, ordinary AI strategy
and complete matches, neutral map objects/garrisons, transport emergency unload,
full matchmaking/local ratings/moderation/persistence journeys, scenario service
integration, every Claude frontend/content/art/audio stage, packaging, browser
acceptance and final balance/release gates. This list does not replace the full
handoff scope. No milestone or final release is claimed complete.
