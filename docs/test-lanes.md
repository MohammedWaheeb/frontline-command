# Test lanes

What each `make` test lane actually runs, and which Go tests no lane runs.

## Why this exists

A Go test can compile, pass `go vet`, and still never execute its body in
any lane: it may skip under `testing.Short()`, skip unless an environment
variable is set, be a benchmark (no lane passes `-bench`), or return
silently when an env var is unset. Before this guard landed, about fifty
tests skipped under `-short` and whole env-gated suites (for example the
`STRESS=1` bot stress tests and the `FRONTLINE_SOAK=1` soak probe) ran in
no lane at all, while still lending false confidence.

The guard is [scripts/gated-tests.mjs](../scripts/gated-tests.mjs). It runs
in `make test`, before the Go tests (and in `make test-extended`, which shares that lane in
[scripts/local.mjs](../scripts/local.mjs)), scans every `*_test.go` under
`cmd/`, `internal/`, `pkg/` and `protocol/` (excluding
`work/`), and compares the gated tests it finds against
[scripts/gated-tests.json](../scripts/gated-tests.json). It uses text
scanning only, with no Go build, and takes about a second of CPU. It fails
when a gated test is missing from the manifest, when a manifest entry no
longer matches a gated test, when an entry claims a lane that cannot run it,
or when a manual command does not set the env var the test gates on, sets it
to a value the gate still skips on (for example `STRESS=0`), selects a
different test, targets a package that does not contain the test, or would
execute nothing (`-count=0`, `-list`, `-c`, or `-run` given more than once,
where `go test` would silently use only the last value). Manual
commands are parsed structurally (env assignments, flags and packages), not
matched as text.

To fix a failure, add or correct the manifest entry: give the lane that
truly runs the test. A test with the provable `-short` gate belongs to
`extended`. A test with a provable env gate, or any `unsupported` gate,
belongs to `manual: <exact command>`: the command must set every proven gate
variable to a value the gate accepts, select the test with a single `-run`
(or `-bench` for a benchmark), and name a package pattern that covers the
test's directory; an `unsupported` entry also needs a `reason` explaining
how its command runs the test.
Do not mark a test as running in a lane that cannot run it. Then refresh the
table at the bottom of this file with
`node scripts/gated-tests.mjs --table`.

## Lanes

All lanes dispatch through [scripts/local.mjs](../scripts/local.mjs); the Go
package list and test arguments come from `productionGoPackages` and
`goTestArguments` in
[scripts/package-integrity.mjs](../scripts/package-integrity.mjs): packages
are `./cmd/... ./internal/... ./pkg/... ./protocol/...`. Go runs with
`nativeBuildEnvironment()` (native GOOS/GOARCH, CGO off). No lane sets any
test-gate environment variable, and no lane passes `-race` or `-bench`.

| Lane | Invocation | Go tests | Duration |
|---|---|---|---|
| `make test` (default, `test`) | gated-test guard; script Node suites; `go test -short <packages>`; `go vet <packages>`; client typecheck, app typecheck and runtime tests | yes, with `-short` | not recorded; the gated-test guard itself takes about 1 s of CPU |
| `make test-extended` (`extended`) | same chain as `make test`, but `go test -timeout=120m <packages>` with no `-short` | yes, full | budget about 90 minutes for the authored set ([local development](local-development.md)); measured 66m50s on 2026-10-31 ([beta readiness](beta-readiness-2026-10-31.md)) |
| `make test-browser` (`browser`) | `npm --prefix client run test:browser`: builds the WASM runtime and server, drives Chromium, Firefox and WebKit via Playwright | no Go `*_test.go` tests run in this lane | not recorded |
| `make check-content` | `go run ./cmd/contentcheck -content content -release` | no tests | not recorded |

Step by step, `make test` and `make test-extended` run:

1. A pinned-dependencies check (`client/node_modules` must be installed).
2. The gated-test guard: `node scripts/gated-tests.mjs`.
3. The script Node suites: `node --test` over
   `scripts/package-integrity.test.mjs`,
   `scripts/package-licenses.test.mjs`,
   `scripts/package-presentation-inputs.test.mjs` and
   `scripts/gated-tests.test.mjs`.
4. `go test` over the production packages (`-short` for `test`,
   `-timeout=120m` for `extended`).
5. `go vet` over the same packages.
6. Client checks: `typecheck`, `typecheck:app`, `test:runtime`.

## Gate kinds

The scanner is conservative: it is a text scan, not a Go control-flow
interpreter, and it proves only two gate shapes. Both must be a top-level
statement whose block contains only the skip call, with no `else`:

- `short`: `if testing.Short() { t.Skip(...) }` as the first statement of
  the test. The default lane skips it and the extended lane runs it.
- `env:NAME`: `if os.Getenv("NAME") != "v" { t.Skip(...) }` (the command
  must set `NAME=v`) or `if os.Getenv("NAME") == "" { t.Skip(...) }` (any
  non-empty value), with a direct `os.Getenv` call. No lane sets these, so
  they run only by the manual command in the manifest.
- `unsupported`: every other skip under a condition — a skip in an `else`
  branch, a local alias such as `dir := os.Getenv(...); if dir == ""` or
  `short := testing.Short()`, a nested or compound condition (for example
  `testing.Short() || raceInstrumentation`), an inverse gate such as
  `if !testing.Short()`, a capability skip inside the body, or a gate that
  lives in a helper the test calls. No lane may claim an `unsupported`
  test, even a lane that in fact runs it; the manifest must give a
  `manual:` command plus a `reason` explaining how that command runs it.
  This is the common case in this tree, because most env gates are written
  through a local variable.
- Combinations (`short+unsupported`, `env:NAME+unsupported`): at least one
  provable gate and at least one unprovable skip; treated as `unsupported`
  for lane claims, while the manual command must still satisfy the proven
  part (set the env var, no `-short` for a proven short gate).
- `+benchmark`: a `Benchmark*` function. `go test` without `-bench`
  never runs it, whatever its other gates.

Env vars used only to write optional evidence output do not count as gates:
the test body still runs when they are unset.

## Current inventory

The scan covers 309 `*_test.go` files and finds 92 gated
test functions: 35 proven `short`,
9 proven `env` and
48 with an `unsupported` part
(43 unsupported-only, 4 `short+unsupported`, 1 `env+unsupported`;
2 of all gated functions are benchmarks). The
manifest assigns the 35 proven-short tests to `extended` and the other
57 to `manual:` (each manual entry carries a reason); none can honestly
claim `browser`, because that lane runs no Go tests. One manual entry is a
child-process probe whose body runs through a parent test (the manifest
records the parent in `via` and the manual command runs the parent).

Known limits of the text scan: it works at test-function granularity, so a
gate inside one `t.Run` subtest marks the whole parent function
`unsupported`; a benchmark with no skip call at all is not tracked; a test
that reads an env var and calls `t.Fatal` instead of skipping fails loudly,
so it needs no guard; helper gates are followed only within the same
package's `*_test.go` files and only far enough to mark the caller
`unsupported`; and a test that returns silently instead of calling
`t.Skip` (the child-process pattern, for example `TestCrashRecoveryChild`,
whose body runs as a child of `TestExclusiveHostAndCrashRecovery`) is not
detected at all. When in doubt the scan says `unsupported`, which keeps a
test listed with a manual command rather than invisible or falsely claimed
by a lane.

## Gated tests

Generated from [scripts/gated-tests.json](../scripts/gated-tests.json) joined
with a fresh scan by `node scripts/gated-tests.mjs --table`; do not edit
rows by hand without updating the manifest.

| Test | File | Gate | Lane |
|---|---|---|---|
| `TestContentScanRejectsOversizedAndLinkedInputsBeforeReading` | `cmd/contentcheck/main_test.go` | unsupported | manual: go test -count=1 -run '^TestContentScanRejectsOversizedAndLinkedInputsBeforeReading$' ./cmd/contentcheck/ |
| `BenchmarkMaximumBrowserAdapter` | `cmd/wasm/browser_load_benchmark_test.go` | unsupported+benchmark | manual: FRONTLINE_BROWSER_LOAD_DIR="$PWD/work/evidence/browser-load" go test -count=1 -run '^$' -bench '^BenchmarkMaximumBrowserAdapter$' ./cmd/wasm/ |
| `TestCombatFeedbackCodecActualAuthorizedOutputs` | `cmd/wasm/combat_feedback_codec_test.go` | unsupported | manual: FRONTLINE_COMBAT_INPUT=/path/to/combat-feedback-output go test -count=1 -run '^TestCombatFeedbackCodecActualAuthorizedOutputs$' ./cmd/wasm/ |
| `TestOwnerCasualtyActualCodec` | `cmd/wasm/owner_casualty_codec_test.go` | unsupported | manual: FRONTLINE_CASUALTY_INPUT=/path/to/casualty-fixtures go test -count=1 -run '^TestOwnerCasualtyActualCodec$' ./cmd/wasm/ |
| `TestOwnerRangesActualCodec` | `cmd/wasm/owner_ranges_codec_test.go` | unsupported | manual: FRONTLINE_RANGES_INPUT=/path/to/range-fixtures go test -count=1 -run '^TestOwnerRangesActualCodec$' ./cmd/wasm/ |
| `TestCandidateServiceSessionAdapterParity` | `cmd/wasm/service_parking_candidate_test.go` | unsupported | manual: FRONTLINE_SERVICE_INPUT=/path/to/service-scene-inputs FRONTLINE_SERVICE_ADAPTER_OUTPUT=/path/to/evidence-out go test -count=1 -run '^TestCandidateServiceSessionAdapterParity$' ./cmd/wasm/ |
| `TestCombatFeedbackCodecActualAuthorizedOutputs` | `internal/server/combat_feedback_codec_test.go` | unsupported | manual: FRONTLINE_COMBAT_INPUT=/path/to/combat-feedback-output go test -count=1 -run '^TestCombatFeedbackCodecActualAuthorizedOutputs$' ./internal/server/ |
| `TestOwnerCasualtyActualCodec` | `internal/server/owner_casualty_codec_test.go` | unsupported | manual: FRONTLINE_CASUALTY_INPUT=/path/to/casualty-fixtures go test -count=1 -run '^TestOwnerCasualtyActualCodec$' ./internal/server/ |
| `TestOwnerRangesActualCodec` | `internal/server/owner_ranges_codec_test.go` | unsupported | manual: FRONTLINE_RANGES_INPUT=/path/to/range-fixtures go test -count=1 -run '^TestOwnerRangesActualCodec$' ./internal/server/ |
| `TestPlayerHaulerActualSavedContract` | `internal/viewproto/player_hauler_saved_contract_test.go` | unsupported | manual: FRONTLINE_HAULER_SAVE_DIR=/path/to/hauler-save-corpus go test -count=1 -run '^TestPlayerHaulerActualSavedContract$' ./internal/viewproto/ |
| `TestActualGoSavedViewsMatchJSON` | `internal/viewproto/snapshot_test.go` | unsupported | manual: FRONTLINE_SNAPSHOT_SAVE_DIRS=/path/to/save-fixtures go test -count=1 -run '^TestActualGoSavedViewsMatchJSON$' ./internal/viewproto/ |
| `TestAIBetaBorderDepotsIranPaidProgress` | `pkg/sim/ai_beta_acceptance_test.go` | unsupported | manual: FRONTLINE_AI_BETA_ACCEPTANCE=1 go test -count=1 -run '^TestAIBetaBorderDepotsIranPaidProgress$' -timeout=120m ./pkg/sim/ |
| `TestAIBetaHardBeatsEasyPaidMirrorMajority` | `pkg/sim/ai_beta_acceptance_test.go` | unsupported | manual: FRONTLINE_AI_BETA_ACCEPTANCE=1 go test -count=1 -run '^TestAIBetaHardBeatsEasyPaidMirrorMajority$' -timeout=120m ./pkg/sim/ |
| `TestAIBetaHardP1WaveDiagnostic` | `pkg/sim/ai_beta_acceptance_test.go` | env:FRONTLINE_AI_BETA_DIAGNOSTIC+unsupported | manual: FRONTLINE_AI_BETA_ACCEPTANCE=1 FRONTLINE_AI_BETA_DIAGNOSTIC=1 go test -count=1 -run '^TestAIBetaHardP1WaveDiagnostic$' -timeout=120m ./pkg/sim/ |
| `TestAIBetaNormalBeatsEasyPaidMirrorMajority` | `pkg/sim/ai_beta_acceptance_test.go` | unsupported | manual: FRONTLINE_AI_BETA_ACCEPTANCE=1 go test -count=1 -run '^TestAIBetaNormalBeatsEasyPaidMirrorMajority$' -timeout=120m ./pkg/sim/ |
| `TestAIBetaPaidWaveSaveAndFullReplay` | `pkg/sim/ai_beta_acceptance_test.go` | unsupported | manual: FRONTLINE_AI_BETA_ACCEPTANCE=1 go test -count=1 -run '^TestAIBetaPaidWaveSaveAndFullReplay$' -timeout=120m ./pkg/sim/ |
| `TestAIBetaPaidWavesOnDefaultMaps` | `pkg/sim/ai_beta_acceptance_test.go` | unsupported | manual: FRONTLINE_AI_BETA_ACCEPTANCE=1 go test -count=1 -run '^TestAIBetaPaidWavesOnDefaultMaps$' -timeout=120m ./pkg/sim/ |
| `TestAIQualityCompetenceRecordedFullReplay` | `pkg/sim/ai_quality_competence_diagnostic_test.go` | unsupported | manual: FRONTLINE_AI_COMPETENCE_REPLAY=/path/to/competence-replay FRONTLINE_AI_COMPETENCE_BINDING=/path/to/source-binding.json go test -count=1 -run '^TestAIQualityCompetenceRecordedFullReplay$' -timeout=120m ./pkg/sim/ |
| `TestAIQualityCompetenceRecordedOrdinary` | `pkg/sim/ai_quality_competence_diagnostic_test.go` | unsupported | manual: FRONTLINE_AI_COMPETENCE=1 FRONTLINE_AI_COMPETENCE_BINDING=/path/to/source-binding.json FRONTLINE_AI_COMPETENCE_CASE=case-id go test -count=1 -run '^TestAIQualityCompetenceRecordedOrdinary$' -timeout=120m ./pkg/sim/ |
| `TestAIFoggedSupplyOpeningOnAuthoredMaps` | `pkg/sim/ai_supply_scout_test.go` | unsupported | manual: FRONTLINE_AUTHORED_AI=1 go test -count=1 -run '^TestAIFoggedSupplyOpeningOnAuthoredMaps$' -timeout=120m ./pkg/sim/ |
| `TestAIRecordedPortRecoveryProgress` | `pkg/sim/ai_task_recovery_test.go` | unsupported | manual: FRONTLINE_AUTHORED_AI_RECOVERY=/path/to/port-recovery-fork go test -count=1 -run '^TestAIRecordedPortRecoveryProgress$' -timeout=120m ./pkg/sim/ |
| `TestAICompleteStandardMatches` | `pkg/sim/ai_test.go` | short | extended |
| `TestAIUsesBaseEconomy` | `pkg/sim/ai_test.go` | short | extended |
| `TestMaximumActorsSimultaneousAirReturn` | `pkg/sim/air_performance_test.go` | unsupported | manual: go test -count=1 -run '^TestMaximumActorsSimultaneousAirReturn$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredAIStallReadOnlyRoutes` | `pkg/sim/authored_ai_stall_inspection_test.go` | unsupported | manual: FRONTLINE_AUTHORED_AI_STALL=/path/to/port-timeout-inspection go test -count=1 -run '^TestAuthoredAIStallReadOnlyRoutes$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredCampaignAssaultCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCampaignCaptureCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCampaignDefenseCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCampaignEscortCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCampaignOpeningCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCampaignReplacementObserverCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCampaignTerritoryCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCoopCompletion` | `pkg/sim/authored_campaign_acceptance_test.go` | short | extended |
| `TestAuthoredCaptureVisibleSiteObservedInfantry` | `pkg/sim/authored_capture_visible_site_test.go` | unsupported | manual: FRONTLINE_CAPTURE_PLACEMENT_FIXTURE=/path/to/occupied-site-fixture.json go test -count=1 -run '^TestAuthoredCaptureVisibleSiteObservedInfantry$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredOptionalCompleteReleaseGaps` | `pkg/sim/authored_complete_release_optional_test.go` | short | extended |
| `TestAuthoredDepotAlternateAccessEvidence` | `pkg/sim/authored_depot_diagnostic_test.go` | unsupported | manual: FRONTLINE_AUTHORED_DEPOT_INSPECT=/path/to/depot-inspection go test -count=1 -run '^TestAuthoredDepotAlternateAccessEvidence$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredDepotCongestionEvidence` | `pkg/sim/authored_depot_diagnostic_test.go` | unsupported | manual: FRONTLINE_AUTHORED_DEPOT_INSPECT=/path/to/depot-inspection go test -count=1 -run '^TestAuthoredDepotCongestionEvidence$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredFatalDiagnostics` | `pkg/sim/authored_failure_diagnostics_probe_test.go` | env:FRONTLINE_TEST_FATAL_DIAGNOSTICS | manual: FRONTLINE_TEST_FATAL_DIAGNOSTICS=1 go test -count=1 -run '^TestAuthoredFatalDiagnostics$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredFatalProbeChild` | `pkg/sim/authored_failure_diagnostics_probe_test.go` | unsupported | manual: FRONTLINE_TEST_FATAL_DIAGNOSTICS=1 go test -count=1 -run '^TestAuthoredFatalDiagnostics$' ./pkg/sim/ |
| `TestAuthoredAssetLossBoundaries` | `pkg/sim/authored_mission_paths_test.go` | short | extended |
| `TestAuthoredOptionalScoutPreservation` | `pkg/sim/authored_mission_paths_test.go` | short | extended |
| `TestAuthoredOptionalStations` | `pkg/sim/authored_mission_paths_test.go` | short | extended |
| `TestAuthoredSharedConvoyLoss` | `pkg/sim/authored_mission_paths_test.go` | short | extended |
| `TestAuthoredSpecificFailures` | `pkg/sim/authored_mission_paths_test.go` | short | extended |
| `TestAuthoredOptionalReliabilityBasinStations` | `pkg/sim/authored_optional_reliability_test.go` | short | extended |
| `TestAuthoredOptionalReliabilityCleanInterception` | `pkg/sim/authored_optional_reliability_test.go` | short | extended |
| `TestAuthoredOptionalReliabilityConnectedRoutes` | `pkg/sim/authored_optional_reliability_test.go` | short | extended |
| `TestAuthoredOptionalReliabilityNetworkPreservation` | `pkg/sim/authored_optional_reliability_test.go` | short | extended |
| `TestAuthoredOptionalReliabilityRelayScout` | `pkg/sim/authored_optional_reliability_test.go` | short | extended |
| `TestAuthoredOptionalDistantStations` | `pkg/sim/authored_optional_routes_test.go` | short | extended |
| `TestAuthoredOptionalFactoryCapture` | `pkg/sim/authored_optional_routes_test.go` | short | extended |
| `TestAuthoredOptionalMechanicTeams` | `pkg/sim/authored_optional_routes_test.go` | short | extended |
| `TestAuthoredOptionalMissileBudget` | `pkg/sim/authored_optional_routes_test.go` | short | extended |
| `TestAuthoredOptionalObserverNetwork` | `pkg/sim/authored_optional_routes_test.go` | short | extended |
| `TestAuthoredOptionalTrailSalvage` | `pkg/sim/authored_optional_routes_test.go` | short | extended |
| `TestAuthoredOptionalWingEvacuation` | `pkg/sim/authored_optional_routes_test.go` | short | extended |
| `TestAuthoredSkirmishAcceptance` | `pkg/sim/authored_skirmish_acceptance_test.go` | unsupported | manual: FRONTLINE_AUTHORED_AI=1 go test -count=1 -run '^TestAuthoredSkirmishAcceptance$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredSkirmishOpeningContext` | `pkg/sim/authored_skirmish_acceptance_test.go` | unsupported | manual: FRONTLINE_AUTHORED_AI_OPENING=/path/to/opening-diagnosis go test -count=1 -run '^TestAuthoredSkirmishOpeningContext$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredSkirmishRejectionContext` | `pkg/sim/authored_skirmish_acceptance_test.go` | unsupported | manual: FRONTLINE_AUTHORED_AI_INSPECT=/path/to/recorded-replay go test -count=1 -run '^TestAuthoredSkirmishRejectionContext$' -timeout=120m ./pkg/sim/ |
| `TestAuthoredSoloCoopCompletion` | `pkg/sim/authored_solo_coop_acceptance_test.go` | short | extended |
| `TestAuthoredTutorialCompletion` | `pkg/sim/authored_tutorial_acceptance_test.go` | short | extended |
| `TestBalanceAircraftSorties` | `pkg/sim/balance_scenarios_test.go` | short | extended |
| `TestBalanceGroundCompositions` | `pkg/sim/balance_scenarios_test.go` | short | extended |
| `TestBalanceLegalAirAndAAOpenings` | `pkg/sim/balance_scenarios_test.go` | short | extended |
| `TestExportBrowserMaximumLoad` | `pkg/sim/browser_load_fixture_test.go` | unsupported | manual: FRONTLINE_BROWSER_LOAD_DIR="$PWD/work/evidence/browser-load" go test -count=1 -run '^TestExportBrowserMaximumLoad$' -timeout=120m ./pkg/sim/ |
| `TestCampaignBotSweepAll` | `pkg/sim/campaign_bot_sweep_test.go` | short | extended |
| `TestCombatReliabilityCadenceInspection` | `pkg/sim/combat_reliability_test.go` | env:FRONTLINE_COMBAT_CADENCE_INSPECTION | manual: FRONTLINE_COMBAT_CADENCE_INSPECTION=1 go test -count=1 -run '^TestCombatReliabilityCadenceInspection$' -timeout=120m ./pkg/sim/ |
| `TestCombatRulesProjection` | `pkg/sim/combat_rules_projection_test.go` | unsupported | manual: FRONTLINE_RULES_PROJECTION=/path/to/rules-projection.json go test -count=1 -run '^TestCombatRulesProjection$' -timeout=120m ./pkg/sim/ |
| `TestMaximumActorsReturnsRoutesAndInterceptionTogether` | `pkg/sim/combined_performance_test.go` | unsupported | manual: go test -count=1 -run '^TestMaximumActorsReturnsRoutesAndInterceptionTogether$' -timeout=120m ./pkg/sim/ |
| `TestConfirmedPublicIntake036NaturalBorder4800` | `pkg/sim/confirmed_public_intake_036_test.go` | unsupported | manual: FRONTLINE_INTAKE036_CHECKPOINT=/path/to/exact-036-checkpoint FRONTLINE_INTAKE036_CHECKPOINT_SHA256=sha256-of-checkpoint-file go test -count=1 -run '^TestConfirmedPublicIntake036NaturalBorder4800$' -timeout=120m ./pkg/sim/ |
| `TestCurrent035CoopHumanAICompletion` | `pkg/sim/current035_coop_practice_acceptance_test.go` | short+unsupported | manual: FRONTLINE_CURRENT_COOP_CONFIG=/path/to/current-coop-course.json go test -count=1 -run '^TestCurrent035CoopHumanAICompletion$' -timeout=120m ./pkg/sim/ |
| `TestCurrent035EditorPracticeCompletion` | `pkg/sim/current035_coop_practice_acceptance_test.go` | short+unsupported | manual: FRONTLINE_CURRENT_PRACTICE_CONFIG=/path/to/current-practice-course.json go test -count=1 -run '^TestCurrent035EditorPracticeCompletion$' -timeout=120m ./pkg/sim/ |
| `TestCurrent035TwinIsolatedAIHold` | `pkg/sim/current035_twin_isolation_acceptance_test.go` | short+unsupported | manual: FRONTLINE_CURRENT_COOP_PRACTICE_EVIDENCE=/path/to/fresh-evidence-dir FRONTLINE_TWIN_ISOLATION_CONFIG=/path/to/twin-isolation-course.json go test -count=1 -run '^TestCurrent035TwinIsolatedAIHold$' -timeout=120m ./pkg/sim/ |
| `TestHarvestDepotRecordedCongestionRecovers` | `pkg/sim/harvest_depot_test.go` | unsupported | manual: FRONTLINE_AUTHORED_DEPOT_INSPECT=/path/to/depot-inspection go test -count=1 -run '^TestHarvestDepotRecordedCongestionRecovers$' -timeout=120m ./pkg/sim/ |
| `TestNavigationGuardContactOriginalFailedCycleContinuation` | `pkg/sim/navigation_guard_contact_test.go` | unsupported | manual: FRONTLINE_GUARD_CONTACT_FAILED_SAVE=/path/to/final.save.json go test -count=1 -run '^TestNavigationGuardContactOriginalFailedCycleContinuation$' -timeout=120m ./pkg/sim/ |
| `BenchmarkNavigationRoutes` | `pkg/sim/navigation_route_bench_test.go` | unsupported+benchmark | manual: go test -count=1 -run '^$' -bench '^BenchmarkNavigationRoutes$' -timeout=120m ./pkg/sim/ |
| `TestLateGameRouteWorkStaysBounded` | `pkg/sim/navigation_tick_budget_test.go` | short | extended |
| `TestMaximumActorsMovingAndFighting` | `pkg/sim/performance_test.go` | unsupported | manual: go test -count=1 -run '^TestMaximumActorsMovingAndFighting$' -timeout=120m ./pkg/sim/ |
| `TestMaximumActorTickBudget` | `pkg/sim/performance_test.go` | unsupported | manual: go test -count=1 -run '^TestMaximumActorTickBudget$' -timeout=120m ./pkg/sim/ |
| `TestBotsFinishThreeAndFourPlayerMatches` | `pkg/sim/player_matrix_test.go` | unsupported | manual: go test -count=1 -run '^TestBotsFinishThreeAndFourPlayerMatches$' -timeout=120m ./pkg/sim/ |
| `TestPracticeTerminalBoundary` | `pkg/sim/practice_terminal_boundary_reliability_test.go` | short+unsupported | manual: FRONTLINE_PRACTICE_TERMINAL_EVIDENCE=/path/to/fresh-evidence-dir FRONTLINE_PRACTICE_TERMINAL_SOURCE_ROOT=/path/to/pinned-source-root go test -count=1 -run '^TestPracticeTerminalBoundary$' -timeout=120m ./pkg/sim/ |
| `TestCaptureCheckpointActual688Artifact` | `pkg/sim/replay_checkpoint_test.go` | unsupported | manual: FRONTLINE_CHECKPOINT_INPUT=/path/to/actual688.save.json FRONTLINE_CHECKPOINT_OUTPUT=/path/to/checkpoint-output go test -count=1 -run '^TestCaptureCheckpointActual688Artifact$' -timeout=120m ./pkg/sim/ |
| `TestExteriorMaximumCombinedReturnsRoutesInterception` | `pkg/sim/service_parking_combined_test.go` | unsupported | manual: go test -count=1 -run '^TestExteriorMaximumCombinedReturnsRoutesInterception$' -timeout=120m ./pkg/sim/ |
| `TestExteriorMaximum64OrdinaryReturns` | `pkg/sim/service_parking_maximum_test.go` | unsupported | manual: go test -count=1 -run '^TestExteriorMaximum64OrdinaryReturns$' -timeout=120m ./pkg/sim/ |
| `TestSoakDissect` | `pkg/sim/soak_probe_test.go` | unsupported | manual: FRONTLINE_DISSECT='map-id:seed:players:from:to' go test -count=1 -run '^TestSoakDissect$' -timeout=120m ./pkg/sim/ |
| `TestSoakProbe` | `pkg/sim/soak_probe_test.go` | env:FRONTLINE_SOAK | manual: FRONTLINE_SOAK=1 go test -count=1 -run '^TestSoakProbe$' -timeout=120m ./pkg/sim/ |
| `TestStressBots` | `pkg/sim/stress_bots_test.go` | env:STRESS | manual: STRESS=1 go test -count=1 -run '^TestStressBots$' -timeout=120m ./pkg/sim/ |
| `TestStressChaos` | `pkg/sim/stress_chaos_test.go` | env:STRESS | manual: STRESS=1 go test -count=1 -run '^TestStressChaos$' -timeout=120m ./pkg/sim/ |
| `TestStressFactionMatrix` | `pkg/sim/stress_faction_matrix_test.go` | env:STRESS | manual: STRESS=1 go test -count=1 -run '^TestStressFactionMatrix$' -timeout=120m ./pkg/sim/ |
| `TestStressManySeeds` | `pkg/sim/stress_many_seeds_test.go` | env:STRESS | manual: STRESS=1 go test -count=1 -run '^TestStressManySeeds$' -timeout=120m ./pkg/sim/ |
| `TestStressReplay` | `pkg/sim/stress_replay_test.go` | env:STRESS | manual: STRESS=1 go test -count=1 -run '^TestStressReplay$' -timeout=120m ./pkg/sim/ |
| `TestTacticalCanonicalStatePreservation` | `pkg/sim/tactical_canonical_test.go` | env:FRONTLINE_CANONICAL_OUTPUT | manual: FRONTLINE_CANONICAL_OUTPUT=/path/to/canonical-output.json go test -count=1 -run '^TestTacticalCanonicalStatePreservation$' -timeout=120m ./pkg/sim/ |
