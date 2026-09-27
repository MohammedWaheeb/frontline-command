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
- Assignment 02 was handed to Codex for nonvisual integration after explicit
  user authorization. Do not resume Claude edits to these paths concurrently.
  Original session: `380d9ca3-cd86-4f8b-9925-0a8beb753320`; partial browser
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
- Native/WASM runtime parity is now verified in three Playwright browsers;
  rendered game journeys, mission acceptance and visual QA remain pending.
- Navigation needs choke/producer/transport/stress tests and further recovery
  work; production goals must not induce permanent oscillation.
- Queued transport behavior, emergency unloading, strategic-operation edge
  cases and scenario validation still need work.
- Bounded mission schema/runtime is being added; objective views, campaign
  difficulty/end-to-end coverage and all authored mission content pending.
- Reports review, pause coordination and durable lobby recovery remain pending;
  matchmaking and local ratings are implemented, and service journeys still require
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
the short race suite passed after service recovery, bounded replay, aircraft,
and neutral-object additions (simulation 18.45 s; server 17.93 s). Later ability
exit/warning, AI and local matchmaking refinements also passed a short race run
(simulation 19.51 s; server 18.64 s), plus vet. The integrated short race suite passed after navigation and co-op service changes
(simulation 19.68 s; server 24.30 s), followed by `go vet ./...`.
The 688-actor moving/combat workload and target-hardware performance are pending.

Additional checks now cover all four strategic operations, two-second emergency
takeoff, local/base emergency airlift unload, team-only ping privacy, rolling
command history with replay seek before/after rollover, neutral garrison firing,
explicit prop destruction, single navigation invalidation and fog-safe rubble.
The full short native suite and native Claude-authored adapter tests pass.
Browser WASM execution is still pending.

AI now retains observed enemy positions/age and field supplies, avoids observed
AA for sorties, reserves construction funds, resumes abandoned foundations,
plans expansion before depletion, restores basic workers and uses support,
capture, deployment and faction intentions through normal orders. Tests show
hidden enemy changes do not alter its decisions. The six-minute fixture earned
8,777/8,400 credits and both sides reached radar. A longer US/IR synthetic match
finished by elimination at tick 14,807; this is not a balanced-match claim.
The SY/SA run exposed costly repeated failed path searches and was stopped for
an implementation fix. Navigation now shares mobile obstacle lookup data per
tick/clearance and waits two seconds after failure, retrying immediately when
terrain changes. Recovery and save/restore determinism tests pass; long runs
were repeated. All six cross-faction and four mirror pairings finished by
elimination on the synthetic test map; the ten matches took 31.32 s wall time
after navigation fixes. US/IR ended at tick 18,861 and SY/SA at tick 10,164 in
the first repeat. Old and new evidence is retained in `work/evidence/`. This
does not certify authored maps, human counterplay, or reference-hardware FPS.

Local matching/ratings have targeted tests for ready/asset gates, locked teams,
skill/latency widening, blocks, atomic result/rating writes, concurrent identical
retries, conflicting retries, draws and voids. Browser journey acceptance remains pending. Two actual WebSocket peers also completed
the ranked service journey: ready/load, countdown, surrender, committed result,
one 980/1020 rating update and a persisted replay with the same winner (5.11 s).

Mission service integration now separates human, ordinary AI and scripted
controllers, preserves map objects without default bases, validates full spawn
footprints, and keeps difficulty changes away from allied credits and ordinary
objective timers. Installed co-op definitions create fixed scenario lobbies;
opening/midpoint checkpoints are copied atomically to both humans' private saves.
Resume lobbies restore the exact saved state and reject revision/content changes.
Targeted tests cover co-op plus AI ally, save ownership, atomic checkpoint writes,
midpoint persistence, resumed hashes and command sequence continuity. Complete
authored scenarios and browser journeys remain pending.

Remaining work includes full ordinary AI strategy
and complete matches, extended navigation/transport stress,
full matchmaking/local ratings/moderation/persistence journeys, scenario service
integration, every Claude frontend/content/art/audio stage, packaging, browser
acceptance and final balance/release gates. This list does not replace the full
handoff scope. No milestone or final release is claimed complete.

Shared pause and team surrender are now implemented in the Go service/core.
Targeted tests passed for unanimous votes, cancellation, saved/replayed votes,
individual surrender isolation, native actor tick freeze, resume on disconnect,
ranked denial, and private teammate reconnect timers. Browser controls remain
unimplemented until Claude's next runtime/UI pass.


## Browser runtime integration — 2026-09-27

The user authorized Codex to handle nonvisual browser utilities/adapters/tests
while Claude is limited. UI, rendering and all visual/audio/content-authoring
work remain with exact-model Claude. The initial Go adapter is Claude-authored;
Codex added current mission/controller support and the browser integration.

`npm --prefix client run test:runtime` passed seven tests for delta privacy,
protobuf integer preservation, sequence continuity, save/settings conflicts,
three rotating autosaves and byte-preserving export/import.
`npm --prefix client run test:browser` passed in installed Chromium, Firefox and
WebKit. Identical native/WASM commands produced identical state hashes. Actual
workers, worker isolation, corrupt-save rejection, IndexedDB save/restore,
export/import, exact-byte server synchronization, two browser contexts, private
perspectives, rejected enemy commands, reconnect and committed match results
were exercised. See `work/evidence/runtime/browser-results.json` for versions and
hashes. Browser plugin was unavailable; the testing skill's Playwright fallback
was used. No product UI or visual acceptance is implied by the test host.

A raw authenticated save-download endpoint prevents JavaScript parsing from
rounding uint64 RNG/seed state. Upload utilities preserve the original JSON
integer tokens. Replays, complete offline caching, editor utilities, packaging
and the rest of the handoff continue to be implemented.
