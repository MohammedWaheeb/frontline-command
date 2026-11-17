# Release fix receipts — Phases A–C (2026-10-20)

Scope: the phased list from the 2026-10-19 bug hunt
(`outputs/bug-hunt-2026-10-19.md`), executed by parallel sub-agents with
disjoint file ownership on the dirty working tree (HEAD `61ff27a81` plus
uncommitted work; nothing was committed by this pass). User decisions for
this pass: MIT license; fix campaign routes **and** unhide campaign; heavy
lanes run after the fixes. Every status below was re-verified by the parent
session after the batches landed; worker claims alone are not quoted as proof.

> **Reading note:** the final "Final verification pass" section at the end
> supersedes earlier failure inventories and gate claims in this file where
> they conflict. Earlier sections are retained as dated round history.

## Parent re-verification (observed)

| Gate | Result |
|---|---|
| `go build ./...` | PASS |
| `go vet ./...` | PASS |
| `go test ./cmd/... ./internal/... ./pkg/... -short` | PASS (all packages; `pkg/sim` 132 s, `internal/server` 34 s) |
| `go run ./cmd/contentcheck -content content -release` | PASS (32 maps, 31 missions) |
| `node --test scripts/package-*.test.mjs` | PASS 49/49 |
| Client `typecheck` + `typecheck:app` | PASS |
| Client `test:runtime` | PASS 676/0 fail/5 skip; with wire evidence env PASS 681/681, 0 skipped |
| Scripted campaign matrix (72 mission×difficulty) | **71 PASS / 1 FAIL** after round 3 (was 47/25 before this pass, 68/4 after round 2; only `sy-05` hard still fails) |
| Bot sweep smoke + determinism (`pkg/sim/campaign_bot_sweep_test.go`) | PASS |
| `TestAuthoredOptionalReliabilityCleanInterception` (SA-04, ex-P2) | PASS |
| `make test-extended` | see "Heavy lanes" |
| Browser lane (`make test-browser`) | see "Heavy lanes" |

## Phase A — make the release cuttable

- **A-1 Perf budget re-run: CERTIFIED on re-run.** First attempts exceeded
  budget (p95 31.6/35.2 ms vs 25 ms) while unrelated projects (another
  checkout's Playwright run + Vite preview) held host load at 3.7–18.2; those
  processes were left alone. Re-run after that load cleared (load ~2.1–2.7):
  all four max-actor tests PASS — combined workload p50 11.4 ms, **p95
  14.9 ms (limit 25 ms), p99 20.7 ms (limit 40 ms)**, 688 actors, 64/64 air
  returns landed, 24/24 interceptions (the old P1-1 loss stays fixed).
- **A-2 Gates unbroken: DONE.** `work/go.mod` nested module excludes archived
  snapshots, so `go build/vet ./...` work from the root (proven above).
  Browser-test symlink handling now detects wrong targets.
  Wire-parity evidence generation is documented in `docs/local-development.md`
  and proven: 681/681 client runtime tests pass with the env set, 0 skipped.
  `docs/local-development.md` now states no player release may be tagged
  without a passing `make test-extended` on the exact tree. Residue: the
  documented ~90-minute authored budget vs the `-timeout=30m` per-package
  flag in `scripts/package-integrity.mjs` (pinned by its test) is unchanged;
  symlink regression coverage still lives only in `/tmp`, not a committed test.
- **A-3 Heavy lanes: see below.**
- **A-4 License/docs: DONE.** Root `LICENSE` (MIT, © 2026 Frontline Command
  contributors) and `CONTRIBUTING.md` added.

## Phase B — P2 batches

- **B-1 Co-op content: DONE (contentcheck-verified).** Twin Outposts
  `north-pressure-1..3` are now genuine northern columns (own spawn tags,
  northwestern warnings) instead of copies of the east waves; map spawn
  teams aligned; Convoy Union warning text corrected; `Spawn.Team`
  validation added in `pkg/content/map.go` with tests; `content/index.json`
  regenerated for the touched files. Full co-op playthrough coverage rides
  on the extended lane.
- **B-2 Save provenance: DONE with stated limits.** `server_checkpoints`
  records SHA digests of server-persisted match checkpoints
  (`internal/storage/recovery.go`); co-op resume requires the offered save's
  digest to match a recorded checkpoint for a match the owner belongs to, so
  the fabricated-save co-op probe is closed. Limits (worker-reported,
  accepted): a match finishing before its first recorded checkpoint cannot
  host a resume lobby from its opening save (equivalent to a fresh start);
  pre-change saves have no digest history and fail closed for co-op resume.
  Digest recording inside `StartMatchAccess`/`PutSharedSave` would close the
  opening edge.
- **B-3 Reconnect robustness: DONE.** Admission no longer spends the tight
  failure budget on authenticated reconnects (`admission.go`); server-side
  WebSocket ping/pong liveness added (`server.go`); outbox-full no longer
  drops the peer outright; start barrier requires present humans. Server
  package tests pass. **Follow-up found and fixed by parent:** B-5's new
  authentication on `GET /maps` broke the client's pre-auth `connect()`
  (401 before profile restore — every network-controller test failed against
  an auth-mirroring fixture). The client now loads the map listing
  authenticated after restore/sign-in (`client/src/app/network-controller.ts`,
  fixture updated in `client/tests/runtime/network-controller.test.ts`;
  guests see an empty listing until sign-in).
- **B-4 Performance: DONE.** Observer archive skips capture with zero
  observers and gained bounding; `PutSharedSave` enforces per-owner quotas;
  match ticker gained bounded catch-up (`maxCatchUpSteps = 4`). Save marshal
  is now off the actor loop for periodic checkpoints: `pkg/sim` gained a
  structural `Engine.CloneState` + `MarshalState` (byte-identical to `Save`,
  which now delegates), plus a split replay API
  (`Replay.BeginCheckpoint`/`PackCheckpoint`/`AppendCheckpoint`). The actor
  only clones (~51µs vs ~2.59ms `Save`, `BenchmarkSnapshotPaths` at tick
  1200); the persistence goroutine marshals/packs and returns packed replay
  checkpoints to the actor, which owns the recorder. Co-op mission
  checkpoints clone the same way. On-demand request-path saves stay
  synchronous. Evidence: `TestCloneStateIndependentSnapshot`,
  `TestCloneStateMissionSnapshot`, `TestCloneStateConcurrentMarshalRestores`
  (race-clean), `TestBeginCheckpointOffLoopEquivalence`,
  `TestBeginReplayCheckpointPreservesSaveAndFailureFallback`; short
  `pkg/sim`+`internal/server` suites green.
- **B-5 LAN hardening: DONE.** HTTP read/write timeouts (6 min, sized for
  65 MiB saves) in `cmd/frontline/main.go`; profile-creation bound;
  `GET /maps` authenticated, cached by fingerprint, and no longer leaks
  owner profile IDs (public display name kept — the client renders "By …").
  Client impact of the auth change is the B-3 follow-up above. LAN remains
  plaintext opt-in; TLS/token rotation were not attempted.
- **B-6 Path/AI/catalog polish: DONE with one recorded decision.**
  Navigation charges the path budget per actual search; AI placement gained
  a deterministic fallback beyond the 40-point ring; catalog validators now
  reject role prerequisite cycles, out-of-range splash/timing, and unknown
  armor kinds (tests in `pkg/content`). HUD labels scale with
  `--fc-ui-scale`. **Height decision:** tile height stays sight/visual only
  (ramps are decorative) — documented; changing movement semantics would
  invalidate all authored routes. The one-line comment at the passability
  function was left to the `map.go` owner and is still owed.
- **B-7 Ranked: DONE (three maps).** `content/ranked-maps.json` shipped and
  loaded with a release test; `copper-junction`, `relay-heights` and
  `dry-river` qualify — ranked requires exactly 2 spawns and the other
  promoted maps are 4-spawn. Ranked variants of 4-spawn maps need a
  spawn-selection design decision.
  The pinned hash fails host startup closed if the map is edited without
  re-review (by design).
- **B-8 Host-crash recovery: DONE as honest void.** On boot, persisted
  in-progress matches are voided with `reason: host_restart`
  (`internal/storage/recovery.go`) instead of sitting as phantom live rows.
  True mid-match rehydration was not attempted.

## Phase C — deferred scope (approved this session)

- **C-1 Campaign: UNHIDDEN; routes 71/72.** `releasePage` no longer
  redirects campaign/mastery/editor. Scripted proof improved **47/72 →
  68/72 → 71/72** over three repair rounds (parent re-ran the full matrix
  after each round; logs `/tmp/fc-campaign-proof2/`,
  `/tmp/fc-campaign-proof3/`, `/tmp/fc-campaign-proof4/`), and **all 24
  missions pass at least one difficulty — 23 of 24 pass all three**.
  Round 1 fixed Territory `ir-03` (harness checkpoint assertion), Capture
  `us-03` (3/3), Defense (12/12, incl. SA-04 clean-interception). Round 2
  fixed Territory (9/9), Assault (18/18), Capture `sa-05` (3/3), the
  replacement-observer route, both `TestAuthoredSpecificFailures` cases,
  ConnectedRoutes, and MechanicTeams/normal. Round 3 fixed `sy-01`
  easy/hard and `sy-05` normal, all as test-driver repairs except one
  `sy-01` data change (below). Round 3 briefly regressed `sa-05` easy
  (SY gunner-shelling applied to SA); fixed by scoping that tactic to SY
  and re-verified. Mission-data balance changes: round 2 cut `sy-01`
  enemy AI starting credits 1.7M → 1.0M; round 3 restored enemy numbers
  and instead raised `sy-01` **player** starting credits 6.0M → 7.2M
  (defensible: `sy-01` uniquely delays the base ~1640 ticks for rig
  recovery; `content/index.json` hash updated, contentcheck passes).
  **Still failing (1): `sy-05` hard** — relay-2 is captured (~tick 8451),
  but during its stabilization the player-2 AI razes **relay-1**
  (turret, outpost and relay all gone by tick 8909 in the failure
  save; the whole player army is one tank and one AA) while wave-3
  presses relay-2. Thirty-five-plus variants (mass gates, dual-factory
  production, rig replacement, guard-tank transfer, multiplied
  shelling, barracks-credit gating, enlarged guards, medic-first
  guard targeting, AA-production caps, production
  credit-gate rescoping (alone and combined), long-range artillery
  gunners (relay-2 fell faster but was recaptured by the AI at
  full HP; combined with a parked rig it died at relay-1
  instead), a second barracks for infantry throughput, skipping the
  factory detour,
  wiring in the
  never-called factory-route fortify branch — relay-1's outpost and
  turret are dead code on this route today; calling it at any of
  three timings got the rig killed scouting, the relay killed
  mid-construction, or the whole front rolled while the delayed
  factory repair stalled under fire — and two
  reverted data softenings: enemy-credit multiplier and player
  credits, the latter breaking normal) each moved the failure
  elsewhere in this deterministic-but-chaotic fight; mission data
  is back to stock. Two latent captureFactory robustness fixes were
  kept (wait for a paid engineer / gunner tank instead of fatal /
  empty-index panic); they do not trigger on the baseline timeline.
  Optional-route tests: round 3 fixed CompleteReleaseGaps (`sa-05`
  rerouted from the assault driver to the capture driver, as
  diagnosed; `sa-04` clean-interception via a recon bait inside both
  the launcher band and mobile-ABM coverage, ABM repositioned to
  actually cover outpost-east), ScoutPreservation and
  ReliabilityRelayScout (capture perimeter extended to the
  scout-preserved routes). Still failing: MissileBudget/easy (normal
  fixed by the same home turret hard already built; on easy the
  assault route builds that turret itself and the base is still
  razed late; the buildAt foundation-clearing wait was also
  unscoped from sy-01 to all routes after evidence showed a
  drive-through rejection), MechanicTeams/easy (recovery rig lost
  ~tick 7386 in the defensive-economy variant), ObserverNetwork/hard,
  FactoryCapture (sy-05 factory-route family). Bot playability
  evidence stands as in
  `docs/campaign-bot-sweep.md` (480 runs, 0 errors).
- **C-2 Map editor: UNHIDDEN** via the same gate change. No separate editor
  functional pass was run beyond typecheck/runtime tests.
- **C-3 Audio: DOES NOT REPRODUCE.** The ducking failure could not be
  reproduced by any lane (unit 68/68, duck-stress 20/20, full runtime suite,
  browser audio-smoke, real-Chromium probe measuring correct attack/release).
  No fix was made. The stale records in `docs/release-blockers.md` and
  `docs/agent-worklist-2026-10-20.md` should be retired citing this; the
  original failure was likely a timing flake on the loaded 16 GB host.
- **C-4 Map promotion: DONE.** `DEFAULT_BATTLEFIELD_IDS` is now six maps:
  Copper Junction, Industrial Valley, Port Outskirts, Relay Heights,
  Dry River, Border Depots. README and AGENTS scope updated.
- **C-5 P3 sweep: PARTIAL (by design).** Landed, with tests: storage
  `synchronous=FULL`, save/result integrity digests with corrupt-blob
  refusal, `.write-*` orphan sweep + `Files.Put` quota, constant-time token
  compares, sim hauler-FIFO and rig double-foundation fixes, `Practice.tsx`
  map-state reconciliation, ping-after-close no-throw (proven by
  `online-ping.test.ts`), battlefield DPR/remapped-button fixes, design-doc
  unit/weapon counts corrected to 76/29. Deferred (not attempted): save
  version migration design, region whole-rectangle validation (would reject
  authored regions), dead `State.RNG` contract removal (save-compat risk),
  non-HUD menu text scaling, minimap keyboard/screen-reader access.

## Heavy lanes

- `make test-browser`: **PASS, exit 0** — Chromium, Firefox and WebKit each
  report "native/WASM parity, IndexedDB saves, offline cached reload,
  exact-byte sync, isolated workers, two-browser multiplayer/reconnect/result
  passed".
- `make test-extended`: **FAIL (exit 2), for three distinct reasons, in order:**
  1. `pkg/sim` hit the gate's own 30-minute package timeout (1810 s) inside
     `TestAuthoredCoopCompletion`, panicking the suite. The timeout flag was
     raised to `-timeout=120m` in this pass (`scripts/package-integrity.mjs`
     + its test) so future runs finish and report real results; the extended
     gate was not re-run end-to-end after that change.
  2. Four dedicated-course tests hard-fail without external fixtures
     (`TestCurrent035CoopHumanAICompletion`, `TestCurrent035EditorPracticeCompletion`,
     `TestCurrent035TwinIsolatedAIHold`, `TestPracticeTerminalBoundary` —
     they require `FRONTLINE_CURRENT_COOP_CONFIG` / practice source+evidence
     roots that no script provisions). As shipped, the extended gate cannot
     go green without provisioning those fixtures or excluding the dedicated
     courses from it — a gate-design decision, recorded here, not silently
     patched by turning failures into skips.
  3. Real failures observed before the timeout: the campaign routes and
     `TestAuthoredCampaignReplacementObserverCompletion` listed under C-1
     (12 + 1 at that point; 4 remain after round 2), plus perf-budget tests
     failing under host load (A-1, since certified).
  All other extended packages passed (`cmd/...`, `internal/...`,
  `pkg/content`, `protocol`).
  Re-run at the 120-minute timeout (same day, later): `pkg/sim` now runs to
  completion (3115 s) instead of panicking. Result is still FAIL with an
  inventory identical to the known set — 18 top-level tests: the 12 campaign
  routes (5 groups), replacement-observer, 8 optional routes,
  `TestAuthoredSpecificFailures`, and the 4 env-gated courses. Perf-budget
  tests passed inside this run (quieter host). Log: `/tmp/test-extended2.log`.
- Non-short coverage completed outside the timed-out run, same tree:
  `TestAuthoredCoopCompletion` PASS 6/6 (218 s, includes B-1's reworked
  Twin Outposts), `TestAuthoredTutorialCompletion` PASS,
  `TestAuthoredSoloCoopCompletion` PASS, balance/bots/exterior-maximum
  groups PASS, `TestAuthoredSkirmishAcceptance` SKIP by design (opt-in
  recorded-replay investigation), `TestAuthoredSpecificFailures` FAIL on
  `us-02-open-corridor/convoy-lost` and
  `tutorial-3-read-the-counter/transport-team-lost` (failure-path routes;
  new with this pass's sim changes — not yet diagnosed). Optional routes:
  7 PASS (Stations, BasinStations, NetworkPreservation, CleanInterception,
  DistantStations, TrailSalvage, WingEvacuation) / 8 FAIL
  (CompleteReleaseGaps — incl. `sa-05` all difficulties in 0.4 s,
  ScoutPreservation, ReliabilityRelayScout/normal,
  ReliabilityConnectedRoutes/easy — build order rejected `occupied`,
  MissileBudget, MechanicTeams, ObserverNetwork, FactoryCapture).
  Logs: `/tmp/fc-ext-rest/`, `/tmp/fc-campaign-proof2/`, `/tmp/test-extended.log`.

## Remaining blockers before tagging a player release

1. `make test-extended` green on the exact release tree, from a **clean
   commit** — this tree still carries ~14k uncommitted paths and none of
   this pass was committed. This first needs the dedicated-course fixture
   decision in "Heavy lanes" (provision or exclude), then a full re-run at
   the new 120-minute timeout (in flight at last update; result appended
   when it lands).
2. The last failing campaign route (`sy-05` hard — relay-1 razed
   during relay-2 stabilization, see C-1) and 4 failing optional-route tests
   (MissileBudget, MechanicTeams/easy, ObserverNetwork/hard,
   FactoryCapture), or an explicit decision to ship campaign with
   them open.
3. ~~B-4 save-marshal off the actor loop~~ — done, see B-4 above.

Closed since the bug hunt: browser lane (all three engines green above);
A-1 combined perf budget (certified above).

## Gap-closure pass (later, same day)

An independent multi-agent audit re-checked every claim above against the
live tree. It confirmed the code-level B-fixes and content inventory, and
found the following additional gaps, fixed in this pass unless noted:

- **Mission-clone data race (new, B-4).** `CloneState` shallow-copied the
  recursive `ConditionProgress.Children` trees, so off-loop marshal raced
  mission condition writes. Fixed with a recursive clone; the mission
  snapshot test now marshals concurrently for 4000 ticks and is race-clean
  (`TestCloneStateMissionSnapshot`, original audit probe also green).
- **Campaign/Editor/Mastery were seam-only.** `releasePage` was identity but
  the menu omitted the pages and routing fell through to the network panel.
  Menu entries and rendering are wired; a headless-Chromium probe clicked
  Campaign, Editor, Command Record and Skirmish with screenshots (60 FPS,
  no page errors). A sound-control/brand overlap found by the screenshots
  was fixed.
- **Bot-sweep save claim was overstated.** Runs finishing before the
  midpoint reported `save_restore_ok` without checking (235/480). The
  sweep now records `save_restore_checked`, checks early finishers at
  their terminal tick, and the report counts performed checks. Regression:
  `TestCampaignBotSaveRestoreCheckedBeforeMidpoint`. The 480-run sweep was
  re-executed on the final tree (see updated `docs/campaign-bot-sweep.md`).
- **Optional routes fixed:** MissileBudget (all difficulties),
  MechanicTeams (all), ObserverNetwork (all; hard dwell/escort hysteresis
  scoped so normal keeps its baseline hash), FactoryCapture easy+normal
  (early factory capture before army auto-fire destroys it).
- **Commander-progress** sy-01 goal hash refreshed after the sy-01 credit
  change (21/21 pass). B-7 list expanded to all three two-spawn defaults.
  Height-passability decision documented on `Tile.Passable`.
- **Dedicated courses** are now explicit opt-in: with no `FRONTLINE_*`
  config they skip with the exact variable names (partial/blank config
  still fails). They remain dedicated qualification courses, not part of
  the ordinary extended gate; the skip is visible in test output.
- **Still open:** `sy-05-relay-break` hard (main capture route and the
  factory-captured optional on hard). Relay-2 is captured around tick
  7427 but is destroyed during stabilization/stage-3 approach (latest
  evidence: `/tmp/fc-sy05-evidence10`); relay-1 and the factory survive.
  Do not claim 72/72 while these two are red.
- **Package rebuilt on the current tree.** `make build` first failed with
  `Unsafe or nonportable package path: .DS_Store` (`content/.DS_Store`).
  The packager now skips Finder metadata in `fileInventory` and the
  content copy filter (regression in `package-integrity.test.mjs`), the
  build completed, and the packaged binary served the client (HTTP 200)
  in a smoke run. Current archive:
  `outputs/Frontline-Command-0.3.8-macOS-arm64-20261020.zip`; its
  `version.json` (built 2026-10-20T14:10:37Z) records `source_dirty: true`
  — it is a working-tree package, not a clean-commit release.
- **sy-05 hard, second investigation (driver-only, mission data still
  stock).** Telemetry showed relay-2's outpost/turret are abandoned at
  tick 7428 (`necessary builder absent`: the home rig is dead), hard
  wave timers are 0.8x (third column at tick ~8720), and the relay dies
  to the combined player-2 garrison stream plus that column while the
  stage-3 force cannot form (no free capture tank). Variants tried and
  reverted after measured failures: north-facing defenses + 4-AT
  relay-2 garrison, replacement-rig production, full-cohort hold with
  focus fire, delayed capture (regressed relay-1), and an all-in
  stage-3 speed race. The driver is back to baseline semantics; the
  north-facing defense position is kept (hard-only, no effect while the
  rig is lost). Closing this route likely needs either a substantially
  different authored strategy or a mission-balance decision by the
  owner; it is the one remaining red route (8/9 capture completions,
  FactoryCapture easy+normal pass, hard fails on the same route).
- **sy-05 hard rebalance attempts (owner-approved, all reverted).** Six
  enemy-side configurations were measured with hash updates and
  contentcheck each time: wave timer 0.8x→0.9x, wave-3 tank removal,
  enemy-hard-guard removal, enemy credits 1400→1100, per-difficulty
  player reinforcements (rejected by the validator: difficulty may
  change only enemy spawns), wave-1/2 tank removal, and all softenings
  combined. Every variant failed with a different earlier failure mode
  (the authored driver is timing-tuned to stock data; weakening enemies
  changes AI spend order and breaks earlier stages). Mission data and
  `content/index.json` are restored to stock (sy-05 sha256
  `7222d9d6…`, verified). Closure needs a new authored strategy or a
  human-verified hard playthrough to prove the route, not another
  blind lever tweak.

## Final verification pass (2026-10-20, later)

Terminal evidence on the final stock-mission tree (HEAD `61ff27a81`, dirty
working tree, 14,162 `git status` paths; nothing committed by this pass):

- **`make test-extended`: FAIL, exit 2** (`/tmp/fc-test-extended2.log`).
  Packaging-script tests passed 49/49 and every Go package passed except
  `pkg/sim` (3884.248s). The complete Go failure inventory is exactly two
  top-level tests / two hard subtests on the same route:
  `TestAuthoredCampaignCaptureCompletion/sy-05-relay-break/hard` and
  `TestAuthoredOptionalFactoryCapture/hard`. Because the Go step failed,
  the runner stopped before its vet/typecheck/runtime steps; those were
  run separately below and must not be quoted as part of a green
  `test-extended`.
- **Campaign capture matrix in that run: 8/9.** `us-03` 3/3, `sa-05` 3/3,
  `sy-05` easy+normal; `sy-05/hard` captures relay-2 at tick 7427 (HP197),
  its outpost/turret are abandoned because the builder rig is dead, and a
  required relay is destroyed by tick 10145.
- **SY-05 disposition: explicitly open, not fixed.** After the extended
  run, two new isolated-overlay strategies were measured and not landed:
  capture reorder 1→3→2 (relay-1 lost, fail at tick 9592) and a
  forward-economy outpost+supply at field 2 in two scout variants (rig
  lost while scouting at tick 4099; relay-1 lost at tick 6336). Together
  with the earlier driver variants and six reverted enemy-side rebalance
  configurations above, no honest green exists for `sy-05` hard or
  FactoryCapture hard. Mission data and the sy-05 index entry are stock
  (sha256 `7222d9d6acdd59c26e8aa81374c2c970b3831b4f5cc0ee64fdaa2110c3b21f2f`,
  10124 bytes). Shipping with campaign unhidden therefore carries this
  one explicitly open hard route; do not claim 72/72 or release-green.
- **Separate gates run after the extended failure:** `make doctor` PASS;
  `go build ./...` PASS; `go vet ./...` PASS; gofmt clean on touched Go;
  `make check-content` PASS (32 maps, 31 missions); client `typecheck`
  and `typecheck:app` PASS.
- **Client runtime:** first plain run found one real failure
  (`story badges…`, 23 !== 24): the commander UI fixture still held the
  pre-credit-change `sy-01` mission bytes while `SHIPPED_GOALS` and the
  real index carried the current hash. The fixture mission and its index
  entry were refreshed to the current bytes
  (`a370d0b0…`, 8342 bytes); rerun PASS **677 pass / 0 fail / 5 skip
  (682 tests)**. Wire-parity run: native snapshot test PASS and, with
  `FRONTLINE_MISSION_PUBLIC_TASK_WIRE_EVIDENCE` set, client runtime PASS
  **682/682, 0 skipped**.
- **Race:** targeted clone/checkpoint race PASS
  (`TestCloneStateIndependentSnapshot`, `TestCloneStateMissionSnapshot`,
  `TestBeginCheckpointOffLoopEquivalence`,
  `TestCloneStateConcurrentMarshalRestores`,
  `TestBeginReplayCheckpointPreservesSaveAndFailureFallback`) and
  `CGO_ENABLED=1 go test -race -short ./internal/...` PASS
  (fogcodec, server, storage, viewproto).
- **Browser:** `make test-browser` PASS, exit 0 — Chromium, Firefox and
  WebKit each pass native/WASM parity, IndexedDB saves, offline cached
  reload, exact-byte sync, isolated workers and two-browser
  multiplayer/reconnect/result.
- **Opt-in authored AI:** `FRONTLINE_AUTHORED_AI=1 … TestAuthoredSkirmishAcceptance`
  PASS — all 13 cases (6 pairs, 4 mirrors, three-FFA, four-FFA, four-team;
  386.17s). Dedicated current035/practice-terminal/twin courses remain
  unprovisioned: in the working tree they skip only when completely
  unconfigured (partial/blank config hard-fails), no committed fixtures
  exist, and their pins/descriptors are stale for the current tree. Those
  skips are not qualification evidence.
- **Package:** the earlier accidental `content/index.json` checkout damage
  was repaired by recomputing the eight known stale hash/bytes entries
  and restoring five mission `version: "2"` fields to match their mission
  files. Final production source identity is again 254 files /
  `b7881de5a853946ceb3259b6d13ebb76d7e2a1aaece701799f41e4911c99590f`,
  exactly the packaged `version.json` value, so the 2026-10-20T14:10:37Z
  package still matches current production sources (test-fixture and
  documentation edits since are outside that identity).
  `scripts/audit-package.mjs` PASS (8754 pack files, 1,391,389,803 bytes,
  pack sha256 `a7414667…`); `unzip -tq` clean; all 8923
  `package-files.json` entries re-hash clean and all 8924 zip files are
  byte-identical to `dist/frontline-darwin-arm64/`. Zip:
  `outputs/Frontline-Command-0.3.8-macOS-arm64-20261020.zip`
  (1,262,737,545 bytes, sha256
  `4a51249cc203a9fe50e62ce81bdf0938964f0541c7552bedcce50386932bb3fa`).
  Packaged-binary smoke on `127.0.0.1:5194`: `GET /api/v1/health` 200
  (`status: ok`, simulation 0.3.8) and `GET /` 200. The package remains a
  dirty-working-tree artifact (`source_dirty: true`), not a clean-commit
  release.
- **Documentation truth pass:** timeout claims corrected to 120m in
  `docs/local-development.md` and `CONTRIBUTING.md`; CONTRIBUTING scope,
  README qualification framing, `docs/release-blockers.md` historical
  banner/audio line, the executed-worklist banner, and the stale
  license callout in `site/contribute.html` were corrected. No deployment
  or site publish was performed.

## SY-05 closure and green extended run (2026-10-20, final)

This section supersedes the SY-05 disposition and blocker list above.
The historical FAIL record is retained for evidence; it no longer
describes the tree.

- **SY-05 hard fixed on stock mission data.** Mission bytes remain
  sha256 `7222d9d6acdd59c26e8aa81374c2c970b3831b4f5cc0ee64fdaa2110c3b21f2f`
  (10124 bytes); no mission/index change was landed for this closure.
  The fix is confined to the authored test driver
  (`pkg/sim/authored_campaign_acceptance_test.go`): field-2 hauler split
  (one loader per field was capping income), SY-hard factory discipline
  (tank caps, no AA slots), capture-engineer/gunner borrow gates unified
  on `factoryCaptureRoute()`, owned-only captured-factory production,
  forward AT guard posts at relay-2, engineer repair of captured
  relay-1/relay-2 during lulls, late relay-1→relay-2 guard transfer,
  relay-3 AT focus-fire with tank+buggy relay shelling, and disabling
  the optional factory-turret funding block for SY-05 hard (it cancelled
  army production for a turret whose builder always died en route; the
  main route already captures and preserves the factory). Winning
  trajectory: relay-1 tick 957, factory tick 2736, relay-2 tick 7075
  (HP101), relay-3 tick 10398 (HP230) — identical on the main hard
  route and FactoryCapture hard.
- **Focused PASS:** `TestAuthoredCampaignCaptureCompletion/sy-05-relay-break`
  easy+normal+hard and `TestAuthoredOptionalFactoryCapture`
  easy+normal+hard all PASS on the landed file.
- **Regression matrix PASS:** full
  `TestAuthoredCampaignCaptureCompletion` + `TestAuthoredOptional*`
  run `ok frontlinecommand/pkg/sim 1393.757s`.
- **`make test-extended`: PASS, exit 0** (`/tmp/fc-test-extended-final.log`).
  Packaging-script tests 49/49; all Go packages `ok` including
  `pkg/sim 3604.960s`; client runtime **677 pass / 0 fail / 5 skip
  (682 tests)** as part of the same terminal run. Dirty working tree
  (HEAD `61ff27a81`, nothing committed); a clean-commit rerun is still
  required before release cutting.
- **Package unchanged:** this closure touched only a `_test.go` driver
  and this document, both outside the 254-file production source
  identity (`b7881de5…`), so the 2026-10-20T14:10:37Z package and its
  audit/smoke evidence above remain valid without rebuild. The package
  is still `source_dirty: true`.

### Remaining release blockers (final)

1. A green `make test-extended` on the exact tree **from a clean
   commit** (the green run above was on the dirty working tree).
2. Dedicated current035/practice courses are unprovisioned and skipped,
   not qualified; physical LAN, other platforms/browsers, Safari device,
   and human balance/play remain uncertified as before.
